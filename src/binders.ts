import { Events, Notice, TFile, TFolder, normalizePath, stringifyYaml, type App, type EventRef, type TAbstractFile } from 'obsidian';
import type { ExplorerSource } from './explorer';
import type BindersPlugin from './main';
import { applyOps, checkFormat, FORMAT_VERSION, isBinderNote, isFolderNote, nameOf, orderChildren, readIndex, relPath, stepIndex, UnsupportedBinder, type ListOp } from './model';

/* The binders in the vault: finds them, keeps each one's order in step with the vault, and writes changes back.
   Views and the explorer use only this; `model.ts` does the list logic, this file does the vault.

   Public API (plugin.binders):

     ready: Promise<void>                              resolves once binders have been found at startup
     on('changed', (binderPath: string) => …)          a binder's items, order or state changed ("" when it's unknown
                                                       which, e.g. a setting changed); unsubscribe with offref()
     all(): Binder[]                                   every binder
     binderOf(item | path): Binder | null              the binder a file or folder is in (a binder folder is in its own)
     isBinderFolder(folder): boolean
     inBinder(item): boolean                           inside a binder (below a binder folder)
     isHiddenNote(file): boolean                       a binder note or folder note: never a scene
     problem(item | path): string | null               why a binder is read only (a newer format), or null
     orderedChildren(folder, {hidden}?): TAbstractFile[] | null
                                                       a folder's items in binder order; null outside binders. Binder and
                                                       folder notes are left out unless `hidden` (then they come first)
     scenes(folder): TFile[]                           the notes in a folder and its subfolders, in reading order
     folderNote(folder): TFile | null                  a folder's note (the binder note for a binder folder)
     ensureFolderNote(folder): Promise<TFile>          the folder note, created (empty) if it isn't there
     move(item, folder, index): Promise<void>          puts an item at `index` among `folder`'s items, moving the file if
                                                       the folder changes
     moveUp(item) / moveDown(item): Promise<boolean>   one step within its folder; false if it can't go further
     setProps(file, patch): Promise<void>              sets properties (undefined removes one) through processFrontMatter
     newScene(folder, index?, title?): Promise<TFile>  creates an empty note in the binder at that place (default: last)
     makeBinder(folder): Promise<TFile>                makes a folder a binder; returns the binder note
     flush(): Promise<void>                            writes pending list changes now (they are otherwise debounced)

   Writing: only the binder note's `contents`, through processFrontMatter, debounced and batched per binder. Changes are
   kept as operations and applied to what the binder note says at the time of writing, so external edits aren't lost.
   Binders in a format newer than this version are listed but never written. */

export interface Binder {
	/** The binder folder. */
	readonly folder: TFolder;
	/** The binder note (the binder folder's folder note). */
	readonly note: TFile;
	/** Why Binders can't change this binder (it's in a newer format), or null. */
	readonly problem: string | null;
}

const DEBOUNCE = 300;

class State implements Binder {
	/** The folder's path as last seen; vault events report old paths, so lookups by old path use this. */
	path: string;
	/** Paths the folder had before a rename, until the next write, for events about its items that arrive late. */
	aliases = new Set<string>();
	/** The list as the binder note has it. */
	base: string[] = [];
	problem: string | null = null;
	/** Changes not yet written. */
	ops: ListOp[] = [];
	timer = 0;
	/** Cached: the list with `ops` applied, and the items per folder. Cleared on any change. */
	contents: string[] | null = null;
	items: Map<string, Item[]> | null = null;
	constructor(public note: TFile) { this.path = note.parent?.path ?? ''; }
	get folder(): TFolder { return this.note.parent; }
}

interface Item { rel: string; file: TAbstractFile }

export class BinderStore extends Events implements ExplorerSource {
	ready: Promise<void>;
	private states = new Map<TFile, State>();
	private warned = new Set<string>();
	/** Subfolders renamed since the last write, with their old names, so their folder notes can follow. */
	private renamedFolders = new Map<TFolder, string>();
	private emits = new Set<string>();
	private emitTimer = 0;
	private app: App;

	constructor(private plugin: BindersPlugin) {
		super();
		this.app = plugin.app;
		let done: () => void = () => {};
		this.ready = new Promise((r) => { done = r; });
		const { vault, metadataCache } = this.app;
		this.app.workspace.onLayoutReady(() => {
			this.rescan();
			// the cache may still be filling on a cold start: look again once it's complete
			let resolved = false;
			plugin.registerEvent(metadataCache.on('resolved', () => { if (!resolved) { resolved = true; this.rescan(); } }));
			plugin.registerEvent(metadataCache.on('changed', (f, _d, cache) => this.onMeta(f, isBinderNote(cache.frontmatter))));
			plugin.registerEvent(vault.on('rename', (f, old) => this.onRename(f, old)));
			plugin.registerEvent(vault.on('delete', (f) => this.onDelete(f)));
			plugin.registerEvent(vault.on('create', (f) => { const s = this.at(f.path); if (s) this.touch(s); }));
			done();
		});
		plugin.register(() => { void this.flush(); window.clearTimeout(this.emitTimer); });
	}

	// ---- the public API (see the top of the file) ----

	on(name: 'changed', callback: (binderPath: string) => unknown, ctx?: unknown): EventRef;
	on(name: string, callback: (...data: never[]) => unknown, ctx?: unknown): EventRef {
		return super.on(name, callback, ctx);
	}

	all(): Binder[] { return [...this.states.values()]; }

	binderOf(item: TAbstractFile | string): Binder | null { return this.at(typeof item === 'string' ? item : item.path); }

	isBinderFolder(folder: TAbstractFile): boolean { return folder instanceof TFolder && this.at(folder.path)?.folder === folder; }

	inBinder(item: TAbstractFile): boolean { const s = this.at(item.path); return !!s && item !== s.folder; }

	isHiddenNote(file: TAbstractFile): boolean {
		const s = this.at(file.path);
		return !!s && file instanceof TFile && (file === s.note || (file.extension === 'md' && !!file.parent && file.parent !== s.folder && file.basename === file.parent.name));
	}

	problem(item: TAbstractFile | string): string | null { return this.binderOf(item)?.problem ?? null; }

	orderedChildren(folder: TFolder, opts: { hidden?: boolean } = {}): TAbstractFile[] | null {
		const s = this.at(folder.path);
		if (!s) return null;
		const rel = this.folderRel(s, folder);
		const kids = this.items(s).get(rel) ?? [];
		const byRel = new Map(kids.map((k) => [k.rel, k.file]));
		const ordered = orderChildren(s.problem ? [] : this.contents(s), rel, kids.map((k) => k.rel)).map((r) => byRel.get(r));
		return opts.hidden ? [...folder.children.filter((c) => this.isHiddenNote(c)), ...ordered] : ordered;
	}

	scenes(folder: TFolder): TFile[] {
		const out: TFile[] = [];
		const walk = (f: TFolder) => { for (const c of this.orderedChildren(f) ?? []) { if (c instanceof TFolder) walk(c); else if (c instanceof TFile && c.extension === 'md') out.push(c); } };
		walk(folder);
		return out;
	}

	folderNote(folder: TFolder): TFile | null {
		const s = this.at(folder.path);
		if (s && s.folder === folder) return s.note;
		const f = this.app.vault.getAbstractFileByPath(this.folderNotePath(folder));
		return f instanceof TFile ? f : null;
	}

	async ensureFolderNote(folder: TFolder): Promise<TFile> {
		return this.folderNote(folder) ?? await this.app.vault.create(this.folderNotePath(folder), '');
	}

	async move(item: TAbstractFile, folder: TFolder, index: number): Promise<void> {
		const t = this.writable(folder);
		if (this.isHiddenNote(item)) throw new Error('Binder and folder notes stay with their folder.');
		if (item instanceof TFolder && (folder === item || folder.path.startsWith(item.path + '/'))) throw new Error('A folder can’t go inside itself.');
		if (item.parent !== folder) {
			const to = normalizePath(`${folder.path}/${item.name}`);
			if (this.app.vault.getAbstractFileByPath(to)) throw new Error(`“${folder.name}” already has an item called “${item.name}”.`);
			await this.app.fileManager.renameFile(item, to);
		}
		const rel = relPath(t.folder.path, item.path, item instanceof TFolder);
		if (rel) this.queue(t, { op: 'move', item: rel, folder: this.folderRel(t, folder), index });
	}

	moveUp(item: TAbstractFile): Promise<boolean> { return this.step(item, -1); }
	moveDown(item: TAbstractFile): Promise<boolean> { return this.step(item, 1); }

	async setProps(file: TFile, patch: Record<string, unknown>): Promise<void> {
		const s = this.at(file.path);
		if (s && s.note === file && s.problem) throw new UnsupportedBinder(s.problem);
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete fm[k]; else fm[k] = v; }
		});
	}

	async newScene(folder: TFolder, index = Infinity, title = 'Untitled'): Promise<TFile> {
		const t = this.writable(folder);
		const base = title.replace(/[\\/:]/g, ' ').trim() || 'Untitled';
		let name = base;
		// a note named like its folder would be the folder note, not a scene
		for (let n = 1; name === folder.name || this.app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${name}.md`)); n++) name = `${base} ${n}`;
		const file = await this.app.vault.create(normalizePath(`${folder.path}/${name}.md`), '');
		this.queue(t, { op: 'move', item: relPath(t.folder.path, file.path, false), folder: this.folderRel(t, folder), index });
		return file;
	}

	async makeBinder(folder: TFolder): Promise<TFile> {
		if (folder.isRoot()) throw new Error('The vault itself can’t be a binder.');
		const s = this.at(folder.path);
		if (s) throw new Error(s.folder === folder ? `“${folder.name}” is already a binder.` : `“${folder.name}” is inside the binder “${s.folder.name}”.`);
		// the order it shows in now: folders first, then notes, by name, as the file explorer has it
		const contents: string[] = [];
		const byName = (a: TAbstractFile, b: TAbstractFile) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
		const walk = (f: TFolder) => {
			const kids = f.children.filter((c) => c instanceof TFolder || (c instanceof TFile && c.extension === 'md' && c.basename !== f.name));
			for (const c of [...kids.filter((c) => c instanceof TFolder).sort(byName), ...kids.filter((c) => c instanceof TFile).sort(byName)]) {
				contents.push(relPath(folder.path, c.path, c instanceof TFolder));
				if (c instanceof TFolder) walk(c);
			}
		};
		walk(folder);
		const existing = this.folderNote(folder);
		if (existing) {
			await this.app.fileManager.processFrontMatter(existing, (fm: Record<string, unknown>) => {
				fm.binder = FORMAT_VERSION;
				if (!Array.isArray(fm.contents)) fm.contents = contents;
			});
			return existing;
		}
		return this.app.vault.create(this.folderNotePath(folder), `---\n${stringifyYaml({ binder: FORMAT_VERSION, contents })}---\n`);
	}

	async flush(): Promise<void> { await Promise.all([...this.states.values()].map((s) => this.write(s))); }

	/** Tells subscribers every binder may have changed (e.g. a setting that affects how they show). */
	refresh(): void { this.emit(''); }

	// ---- finding binders ----

	/** The binder a path is in. Old paths (from rename and delete events) are looked up by the folder's last known path. */
	private at(path: string, old = false): State | null {
		for (const s of this.states.values()) {
			const bases = old ? [s.path, ...s.aliases] : [s.folder?.path ?? s.path];
			if (bases.some((b) => path === b || path.startsWith(b + '/'))) return s;
		}
		return null;
	}

	/** Finds every binder: a folder with a note whose properties have `binder`. A binder inside another is an ordinary
	    note. If a folder has several, the one named like the folder wins. */
	private rescan(): void {
		const { vault, metadataCache } = this.app;
		const found = new Map<string, TFile>();
		for (const f of vault.getMarkdownFiles()) {
			const parent = f.parent;
			if (!parent || parent.isRoot() || !isBinderNote(metadataCache.getFileCache(f)?.frontmatter)) continue;
			const cur = found.get(parent.path), named = (x: TFile) => x.basename === parent.name;
			if (!cur || (named(f) && !named(cur)) || (named(f) === named(cur) && f.path < cur.path)) found.set(parent.path, f);
		}
		const keep: TFile[] = [];
		for (const p of [...found.keys()].sort((a, b) => a.length - b.length)) {
			if (!keep.some((k) => p.startsWith(k.parent.path + '/'))) keep.push(found.get(p));
		}
		for (const [note, s] of this.states) {
			if (keep.includes(note)) continue;
			window.clearTimeout(s.timer);
			this.states.delete(note);
			this.emit(s.path);
		}
		for (const note of keep) {
			let s = this.states.get(note);
			if (!s) { s = new State(note); this.states.set(note, s); this.read(s); this.touch(s); }
			else if (s.path !== s.folder.path) { s.aliases.add(s.path); this.emit(s.path); s.path = s.folder.path; this.touch(s); }
			else this.touch(s, false);
		}
	}

	/** Reads the binder note's list. A newer format makes the binder read only, with a notice the first time. */
	private read(s: State): void {
		try {
			s.base = readIndex(this.app.metadataCache.getFileCache(s.note)?.frontmatter ?? {}, s.note.basename).contents;
			s.problem = null;
		} catch (e) {
			if (!(e instanceof UnsupportedBinder)) throw e;
			s.base = []; s.ops = []; s.problem = e.message;
			if (!this.warned.has(s.note.path)) { this.warned.add(s.note.path); new Notice(`Binders can’t change “${s.folder.name}”. ${e.message}`); }
		}
	}

	// ---- keeping the list in step with the vault ----

	private onMeta(file: TFile, binderNote: boolean): void {
		const s = this.states.get(file);
		if (s && binderNote) this.ifChanged(s, () => this.read(s));
		else if (s || binderNote) this.rescan();
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		const isFolder = file instanceof TFolder;
		// the binder note moved, or a folder holding a binder: which folders are binders may have changed
		if ((file instanceof TFile && this.states.has(file)) || (isFolder && [...this.states.values()].some((s) => s.path === oldPath || s.path.startsWith(oldPath + '/')))) this.rescan();
		const o = this.at(oldPath, true), n = this.at(file.path);
		const or = o && this.relAt(o, oldPath, isFolder), nr = n && relPath(n.folder.path, file.path, isFolder);
		if (o && o === n) {
			if (or && nr && or !== nr) {
				this.queue(o, { op: 'rename', from: or, to: nr });
				if (isFolder && nameOf(or) !== file.name) this.renamedFolders.set(file, nameOf(or));
			} else this.touch(o, false); // an item of a renamed folder: its place in the binder is the same
			// Obsidian reports a folder's items one by one after the folder, so its note may only just have arrived
			const folder = isFolder ? file : file.parent;
			if (this.renamedFolders.has(folder)) this.followFolderNote(folder);
			return;
		}
		if (o && or) this.queue(o, { op: 'remove', item: or });
		if (n && nr) { if (this.isHiddenNote(file)) this.touch(n); else this.queue(n, { op: 'append', item: nr }); }
	}

	private onDelete(file: TAbstractFile): void {
		if (file instanceof TFile && this.states.has(file)) { this.rescan(); return; }
		const o = this.at(file.path, true), rel = o && this.relAt(o, file.path, file instanceof TFolder);
		if (o && rel) this.queue(o, { op: 'remove', item: rel });
	}

	/** A renamed subfolder keeps its folder note: "Part One/Part One" follows the folder to "Part 1/Part 1". */
	private followFolderNote(folder: TFolder): void {
		const oldName = this.renamedFolders.get(folder);
		const note = this.app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${oldName}.md`));
		const to = normalizePath(`${folder.path}/${folder.name}.md`);
		if (!(note instanceof TFile)) return;
		this.renamedFolders.delete(folder);
		if (!this.app.vault.getAbstractFileByPath(to)) void this.app.fileManager.renameFile(note, to);
	}

	private relAt(s: State, path: string, isFolder: boolean): string | null {
		for (const b of [s.path, ...s.aliases]) { const r = relPath(b, path, isFolder); if (r) return r; }
		return null;
	}

	// ---- writing ----

	private queue(s: State, op: ListOp): void {
		if (s.problem) { this.touch(s); return; }
		s.ops.push(op);
		window.clearTimeout(s.timer);
		s.timer = window.setTimeout(() => { void this.write(s); }, DEBOUNCE);
		this.touch(s);
	}

	/** Writes a binder's pending changes: applied to what the note says now, missing items dropped. One write per batch,
	    and none if nothing changed. */
	private async write(s: State): Promise<void> {
		window.clearTimeout(s.timer);
		const ops = s.ops;
		s.ops = [];
		s.aliases.clear();
		this.renamedFolders.clear();
		if (!ops.length || s.problem || this.states.get(s.note) !== s || this.app.vault.getAbstractFileByPath(s.note.path) !== s.note) return;
		const items = [...this.items(s).values()].flat();
		const exists = new Set(items.map((i) => i.rel));
		const known = this.known(s);
		const next = (list: string[]) => applyOps(list, ops, known).filter((p) => exists.has(p));
		const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
		if (same(next(s.base), s.base)) { this.touch(s, false); return; }
		const shown = this.contents(s);
		try {
			await this.app.fileManager.processFrontMatter(s.note, (fm: Record<string, unknown>) => {
				if (!isBinderNote(fm)) throw new NotABinder();
				checkFormat(fm); // refuses a newer format before anything is written
				const list = next(readIndex(fm, s.note.basename).contents);
				fm.contents = list;
				s.base = list; // don't wait for the cache, so the order doesn't flicker back
			});
		} catch (e) {
			if (e instanceof UnsupportedBinder) this.read(s);
			else if (!(e instanceof NotABinder)) throw e;
		}
		// what shows was already the list with its pending changes; only an edit made meanwhile would change it
		this.touch(s, false);
		if (s.problem || !same(this.contents(s), shown)) this.emit(s.path);
	}

	// ---- helpers ----

	private step(item: TAbstractFile, delta: number): Promise<boolean> {
		const folder = item.parent, s = this.at(item.path);
		if (!s || !folder || item === s.folder || this.isHiddenNote(item)) return Promise.resolve(false);
		const sibs = this.orderedChildren(folder) ?? [];
		const j = stepIndex(sibs.map((f) => f.path), item.path, delta);
		return j == null ? Promise.resolve(false) : this.move(item, folder, j).then(() => true);
	}

	private writable(folder: TFolder): State {
		const s = this.at(folder.path);
		if (!s) throw new Error(`“${folder.name}” isn’t in a binder.`);
		if (s.problem) throw new UnsupportedBinder(s.problem);
		return s;
	}

	private folderRel(s: State, folder: TFolder): string { return folder === s.folder ? '' : relPath(s.folder.path, folder.path, true) ?? ''; }
	private folderNotePath(folder: TFolder): string { return normalizePath(`${folder.path}/${folder.name}.md`); }

	/** The list with pending changes applied: what views show before it's written. */
	private contents(s: State): string[] {
		return s.contents ??= s.ops.length ? applyOps(s.base, s.ops, this.known(s)) : s.base;
	}

	/** Every item in the binder a list entry can name, per folder ("" for the top), without binder and folder notes. */
	private items(s: State): Map<string, Item[]> {
		if (s.items) return s.items;
		const map = new Map<string, Item[]>();
		const walk = (f: TFolder, rel: string) => {
			const list: Item[] = [];
			for (const c of f.children) {
				if (this.isHiddenNote(c)) continue;
				const r = relPath(s.folder.path, c.path, c instanceof TFolder);
				if (!r || (c instanceof TFile && isFolderNote(r))) continue;
				list.push({ rel: r, file: c });
				if (c instanceof TFolder) walk(c, r);
			}
			map.set(rel, list);
		};
		walk(s.folder, '');
		return (s.items = map);
	}

	/** The binder's items in the order they show, for moves: notes, folders, and other files only if already listed. */
	private known(s: State): string[] {
		const items = this.items(s), out: string[] = [];
		const walk = (folder: string) => {
			const kids = items.get(folder) ?? [];
			for (const r of orderChildren(s.base, folder, kids.map((k) => k.rel))) {
				const f = kids.find((k) => k.rel === r)?.file;
				if (f instanceof TFolder || (f instanceof TFile && f.extension === 'md') || s.base.includes(r)) out.push(r);
				if (f instanceof TFolder) walk(r);
			}
		};
		walk('');
		return out;
	}

	/** Something about this binder changed: drop cached order and (unless told not to) tell subscribers. */
	private touch(s: State, emit = true): void {
		s.contents = null; s.items = null;
		if (emit) this.emit(s.path);
	}

	/** Runs `fn`, then tells subscribers only if the binder's order or problem changed (e.g. not for its body text). */
	private ifChanged(s: State, fn: () => void): void {
		const before = JSON.stringify([s.problem, this.contents(s)]);
		fn();
		this.touch(s, false);
		if (JSON.stringify([s.problem, this.contents(s)]) !== before) this.emit(s.path);
	}

	/** Coalesced, so a folder of 40 notes moving tells views once. */
	private emit(path: string): void {
		this.emits.add(path);
		if (this.emitTimer) return;
		this.emitTimer = window.setTimeout(() => {
			this.emitTimer = 0;
			const paths = [...this.emits];
			this.emits.clear();
			for (const p of paths) this.trigger('changed', p);
		}, 0);
	}
}

class NotABinder extends Error {}
