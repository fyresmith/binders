import { Events, Notice, TFile, TFolder, normalizePath, stringifyYaml, type App, type EventRef, type TAbstractFile } from 'obsidian';
import type { ExplorerSource } from './explorer';
import type BindersPlugin from './main';
import { applyOps, checkFormat, diskPath, FORMAT_VERSION, isBinderNote, isFolderNote, nameOf, orderChildren, readIndex, relPath, stepIndex, UnsupportedBinder, type ListOp } from './model';
import { applySceneOps, conversionPlan, isIgnored, isLongformIndex, longformRunning, readProject, sameScenes, sceneGroups, shownScenes, writeScenes, type Project, type Scene, type SceneOp } from './longform';

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
     groups(folder): Group[]                           the notes in a folder in reading order, in runs that belong together:
                                                       a subfolder's notes (binders), or scenes indented under a scene
                                                       (Longform projects, which have no subfolders)
     folderNote(folder): TFile | null                  a folder's note (the binder note for a binder folder)
     ensureFolderNote(folder): Promise<TFile>          the folder note, created (empty) if it isn't there
     move(item, folder, index, depth?): Promise<void>  puts an item at `index` among `folder`'s items, moving the file if
                                                       the folder changes. Longform projects: `depth` is the scene's new
                                                       indent (default: its own)
     moveUp(item) / moveDown(item): Promise<boolean>   one step within its folder; false if it can't go further
     setProps(file, patch): Promise<void>              sets properties (undefined removes one) through processFrontMatter
     editProps(file, edit): Promise<void>              changes properties in place, in one write, from what the note says
                                                       at the time of writing (e.g. renaming a key inside an object)
     newScene(folder, index?, title?, depth?): Promise<TFile>
                                                       creates an empty note in the binder at that place (default: last);
                                                       Longform: `depth` is its indent (default: the scene before it's)
     makeBinder(folder): Promise<TFile>                makes a folder a binder; returns the binder note
     flush(): Promise<void>                            writes pending list changes now (they are otherwise debounced)
     conversion(binder, folders): Conversion           Longform projects: what "Convert to binder" would do
     convertToBinder(binder, opts): Promise<TFile>     Longform projects: makes it a binder; returns the binder note

   Writing: only the binder note's `contents`, through processFrontMatter, debounced and batched per binder. Changes are
   kept as operations and applied to what the binder note says at the time of writing, so external edits aren't lost.
   Binders in a format newer than this version are listed but never written.

   Longform projects (kind 'longform', see longform.ts) are binders too: the binder folder is the project's scene folder,
   the binder note its index note, and the order its `longform.scenes`. Only notes directly in the scene folder are in
   such a binder (its subfolders aren't). Writing changes only `longform.scenes`, the same way (batched, applied to what
   the note says then). Renames and deletes are left to Longform when it's running, since it writes them itself. */

export interface Binder {
	/** A binder (binder note with `binder`), or a Longform project (index note with `longform`). */
	readonly kind: 'binder' | 'longform';
	/** The binder folder (a Longform project's scene folder). */
	readonly folder: TFolder;
	/** The binder note (the binder folder's folder note), or a Longform project's index note, which may be outside it. */
	readonly note: TFile;
	/** Why Binders can't change this binder (it's in a newer format), or null. */
	readonly problem: string | null;
}

/** A run of notes that belong together, in reading order. In a binder, a folder's own notes (`title` is its name; null
    for the folder asked about), `depth` levels below it; a folder's notes after one of its subfolders are a new run with
    `continued` set. In a Longform project, scenes indented `depth` levels under `head` (the scene above them). */
export interface Group {
	title: string | null;
	depth: number;
	/** The folder the notes are in (a Longform project's are all in its folder). */
	folder: TFolder;
	/** Longform: the scene these are indented under. */
	head: TFile | null;
	/** Another run of a group shown earlier (after a deeper one): views show no heading for it. */
	continued: boolean;
	files: TFile[];
}

/** What "Convert to binder" will do for a Longform project. */
export interface Conversion {
	/** The binder note to write: the index note if it's in the scene folder, or a new note named like that folder. */
	note: string;
	creates: boolean;
	contents: string[];
	/** Scenes moved into subfolders, and the folders made for them. */
	moves: { file: TFile; to: string }[];
	folders: string[];
	/** Notes Longform ignores, and subfolders, which a binder shows as its own. */
	joins: string[];
	/** Why it can't be done, or null. */
	problem: string | null;
}

const DEBOUNCE = 300;

class State implements Binder {
	kind: 'binder' | 'longform';
	/** Longform: the project as the index note has it, changes not yet written, what shows (cached), and whether a
	    conversion to a binder is under way (its events are then ignored). */
	lf: Project = { sceneFolder: '/', scenes: [], ignored: [] };
	lfOps: SceneOp[] = [];
	shown: Scene[] | null = null;
	frozen = false;
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
	/** The folder the binder note was in when found. If the note moves to another folder, that's another binder. */
	home: TFolder | null;
	/** `dir`: a Longform project's scene folder. */
	constructor(public note: TFile, public dir: TFolder | null = null) { this.kind = dir ? 'longform' : 'binder'; this.path = this.folder?.path ?? ''; this.home = note.parent; }
	get folder(): TFolder { return this.dir ?? this.note.parent; }
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
			plugin.registerEvent(metadataCache.on('changed', (f, _d, cache) => this.onMeta(f, isBinderNote(cache.frontmatter), isLongformIndex(cache.frontmatter))));
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
		if (s?.kind === 'longform') return file === s.note;
		return !!s && file instanceof TFile && (file === s.note || (file.extension === 'md' && !!file.parent && file.parent !== s.folder && file.basename === file.parent.name));
	}

	problem(item: TAbstractFile | string): string | null { return this.binderOf(item)?.problem ?? null; }

	orderedChildren(folder: TFolder, opts: { hidden?: boolean } = {}): TAbstractFile[] | null {
		const s = this.at(folder.path);
		if (!s) return null;
		if (s.kind === 'longform') {
			if (folder !== s.folder) return null;
			const files = this.lfFiles(s), ordered = this.shownScenes(s).map((x) => files.get(x.title)).filter((f): f is TFile => !!f);
			return opts.hidden && s.note.parent === folder ? [s.note, ...ordered] : ordered;
		}
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

	groups(folder: TFolder): Group[] {
		const s = this.at(folder.path);
		if (!s) return [];
		const out: Group[] = [];
		if (s.kind === 'longform') {
			if (folder !== s.folder) return [];
			const files = this.lfFiles(s), seen = new Set<string>();
			for (const g of sceneGroups(this.shownScenes(s))) {
				const key = `${g.depth}/${g.head ?? ''}`;
				out.push({ title: g.head, depth: g.depth, folder, head: g.head == null ? null : files.get(g.head) ?? null, continued: seen.has(key), files: g.scenes.map((t) => files.get(t)).filter((f): f is TFile => !!f) });
				seen.add(key);
			}
			return out;
		}
		const walk = (f: TFolder, depth: number) => {
			let run: Group = { title: depth ? f.name : null, depth, folder: f, head: null, continued: false, files: [] };
			// a subfolder's first run shows even when empty, so its heading is there to drop onto
			const push = () => { if (run.files.length || (depth && !run.continued)) out.push(run); run = { ...run, continued: true, files: [] }; };
			for (const c of this.orderedChildren(f) ?? []) {
				if (c instanceof TFolder) { push(); walk(c, depth + 1); }
				else if (c instanceof TFile && c.extension === 'md') run.files.push(c);
			}
			push();
		};
		walk(folder, 0);
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

	async move(item: TAbstractFile, folder: TFolder, index: number, depth?: number): Promise<void> {
		const t = this.writable(folder);
		if (this.isHiddenNote(item)) throw new Error('Binder and folder notes stay with their folder.');
		if (t.kind === 'longform') return this.lfMove(t, item, folder, index, depth);
		if (item instanceof TFolder && (folder === item || folder.path.startsWith(item.path + '/'))) throw new Error('A folder can’t go inside itself.');
		// a note named like the folder it goes into would become that folder's note, and leave the binder
		if (item instanceof TFile && item.extension === 'md' && item.basename === folder.name && item.parent !== folder) throw new Error(`“${item.basename}” can’t go into a folder with the same name: it would become the folder’s note.`);
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

	setProps(file: TFile, patch: Record<string, unknown>): Promise<void> {
		return this.editProps(file, (fm) => {
			for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete fm[k]; else fm[k] = v; }
		});
	}

	async editProps(file: TFile, edit: (fm: Record<string, unknown>) => void): Promise<void> {
		const s = this.at(file.path);
		if (s && s.note === file && s.problem) throw new UnsupportedBinder(s.problem);
		await this.app.fileManager.processFrontMatter(file, edit);
	}

	async newScene(folder: TFolder, index = Infinity, title = 'Untitled', depth?: number): Promise<TFile> {
		const t = this.writable(folder);
		if (t.kind === 'longform' && folder !== t.folder) throw new Error(`“${folder.name}” isn’t in a binder.`);
		// a leading dot would make a hidden file, which Obsidian doesn't show
		const base = title.replace(/[\\/:]/g, ' ').trim().replace(/^\.+\s*/, '') || 'Untitled';
		let name = base;
		// a note named like its folder would be the folder note, not a scene
		for (let n = 1; name === folder.name || this.app.vault.getAbstractFileByPath(normalizePath(`${folder.path}/${name}.md`)); n++) name = `${base} ${n}`;
		const file = await this.app.vault.create(normalizePath(`${folder.path}/${name}.md`), '');
		if (t.kind === 'longform') { this.queueScenes(t, { op: 'move', item: file.basename, index, indent: depth }); return file; }
		this.queue(t, { op: 'move', item: relPath(t.folder.path, file.path, false), folder: this.folderRel(t, folder), index });
		return file;
	}

	async makeBinder(folder: TFolder): Promise<TFile> {
		if (folder.isRoot()) throw new Error('The vault itself can’t be a binder.');
		const s = this.at(folder.path);
		if (s?.kind === 'longform') throw new Error(`“${folder.name}” is a Longform project. Use “Convert to binder” to make it a binder.`);
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
			// `contents` of its own that isn't a list is the user's, not ours to overwrite: refuse, changing nothing
			const theirs = (fm: Record<string, unknown>) => fm.contents != null && !Array.isArray(fm.contents);
			const refuse = () => new Error(`“${existing.basename}” already has a “contents” property that isn’t a list. Rename or remove it to make “${folder.name}” a binder.`);
			if (theirs(this.app.metadataCache.getFileCache(existing)?.frontmatter ?? {})) throw refuse();
			await this.app.fileManager.processFrontMatter(existing, (fm: Record<string, unknown>) => {
				if (theirs(fm)) throw refuse(); // checked again on what the note says now
				fm.binder = FORMAT_VERSION;
				if (fm.contents == null) fm.contents = contents.map(diskPath);
			});
			return existing;
		}
		return this.app.vault.create(this.folderNotePath(folder), `---\n${stringifyYaml({ binder: FORMAT_VERSION, contents: contents.map(diskPath) })}---\n`);
	}

	async flush(): Promise<void> { await Promise.all([...this.states.values()].map((s) => this.write(s))); }

	conversion(binder: Binder, folders: boolean): Conversion {
		const s = this.states.get(binder.note);
		if (!s || s.kind !== 'longform') throw new Error('That isn’t a Longform project.');
		const dir = s.folder, { vault } = this.app;
		const at = (name: string) => vault.getAbstractFileByPath(normalizePath(`${dir.path}/${name}`));
		const shown = this.shownScenes(s), files = this.lfFiles(s);
		const plan = conversionPlan(shown, folders, (name) => !!at(name));
		// the index note becomes the binder note if it's in the scene folder; otherwise a new note named like the folder
		const inside = s.note.parent === dir, note = inside ? s.note.path : normalizePath(`${dir.path}/${dir.name}.md`);
		const joins = [
			...[...files.keys()].filter((n) => isIgnored(n, s.lf.ignored)).sort(),
			...dir.children.filter((c) => c instanceof TFolder).map((c) => c.name + '/').sort(),
		];
		const moves = plan.moves.map((m) => ({ file: files.get(m.scene), to: normalizePath(`${dir.path}/${m.folder}/${m.scene}.md`) })).filter((m): m is { file: TFile; to: string } => !!m.file);
		let problem: string | null = null;
		if (!inside && at(`${dir.name}.md`)) problem = `“${dir.name}” already has a note called “${dir.name}”, which would become the binder note. Rename it first.`;
		return { note, creates: !inside, contents: plan.contents, moves, folders: [...new Set(plan.moves.map((m) => m.folder))], joins, problem };
	}

	async convertToBinder(binder: Binder, opts: { folders: boolean; removeLongform: boolean }): Promise<TFile> {
		const s = this.states.get(binder.note);
		if (!s || s.kind !== 'longform') throw new Error('That isn’t a Longform project.');
		await this.write(s); // pending reorders first, so the binder gets the order that shows
		const plan = this.conversion(binder, opts.folders), { vault, fileManager } = this.app;
		if (plan.problem) throw new Error(plan.problem);
		s.frozen = true; // its moves and the new binder note aren't changes to the Longform order
		try {
			for (const f of plan.folders) { const p = normalizePath(`${s.folder.path}/${f}`); if (!vault.getAbstractFileByPath(p)) await vault.createFolder(p); }
			for (const m of plan.moves) await fileManager.renameFile(m.file, m.to);
			const binderProps = (fm: Record<string, unknown>) => { fm.binder = FORMAT_VERSION; fm.contents = plan.contents.map(diskPath); };
			const dropLongform = (fm: Record<string, unknown>) => { if (opts.removeLongform) delete fm.longform; };
			if (!plan.creates) {
				await fileManager.processFrontMatter(s.note, (fm: Record<string, unknown>) => { binderProps(fm); dropLongform(fm); });
				return s.note;
			}
			// the plot grid's columns come along from the index note
			const fm = this.app.metadataCache.getFileCache(s.note)?.frontmatter ?? {}, props: Record<string, unknown> = {};
			binderProps(props);
			for (const k of ['plotlines', 'plotlineColors']) if (fm[k] !== undefined) props[k] = fm[k];
			const note = await vault.create(plan.note, `---\n${stringifyYaml(props)}---\n`);
			if (opts.removeLongform) await fileManager.processFrontMatter(s.note, dropLongform);
			return note;
		} catch (e) {
			s.frozen = false;
			throw e;
		}
	}

	/** Tells subscribers every binder may have changed (e.g. a setting that affects how they show). */
	refresh(): void { this.emit(''); }

	// ---- finding binders ----

	/** The binder a path is in. Old paths (from rename and delete events) are looked up by the folder's last known path. */
	private at(path: string, old = false): State | null {
		for (const s of this.states.values()) {
			const bases = old ? [s.path, ...s.aliases] : [s.folder?.path ?? s.path];
			if (s.kind === 'longform') {
				// the scene folder, what's directly in it except folders, and the index note (which may be outside it)
				const i = path.lastIndexOf('/'), parent = i < 0 ? '' : path.slice(0, i);
				if (path === s.note.path || bases.some((b) => path === b || (parent === b && !(this.app.vault.getAbstractFileByPath(path) instanceof TFolder)))) return s;
			} else if (bases.some((b) => path === b || path.startsWith(b + '/'))) return s;
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
		// note → its Longform scene folder, or null for a binder
		const want = new Map<TFile, TFolder | null>(keep.map((k): [TFile, null] => [k, null]));
		const inBinder = (p: string) => keep.some((k) => p === k.parent.path || p.startsWith(k.parent.path + '/'));
		const dirs = new Set<TFolder>();
		for (const f of vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path))) {
			const fm = metadataCache.getFileCache(f)?.frontmatter;
			if (isBinderNote(fm)) continue;
			const dir = this.sceneFolder(f, readProject(fm));
			// a Longform project inside a binder is ordinary notes; two projects in one folder: the first by path
			if (!dir || inBinder(dir.path) || inBinder(f.path) || dirs.has(dir)) continue;
			dirs.add(dir); want.set(f, dir);
		}
		for (const [note, s] of this.states) {
			// a binder note moved to another folder makes that folder the binder: its list is re-read, never re-pointed
			if (want.has(note) && want.get(note) === s.dir && (s.kind === 'longform' || note.parent === s.home)) continue;
			window.clearTimeout(s.timer);
			this.states.delete(note);
			this.emit(s.path);
		}
		for (const [note, dir] of want) {
			let s = this.states.get(note);
			if (!s) { s = new State(note, dir); this.states.set(note, s); this.read(s); this.touch(s); }
			else if (s.path !== s.folder.path) { s.aliases.add(s.path); this.emit(s.path); s.path = s.folder.path; this.touch(s); }
			else this.touch(s, false);
		}
	}

	/** Reads the binder note's list. A newer format makes the binder read only, with a notice the first time. */
	/** A Longform project's scene folder, if it's one Binders can use (not the vault itself). */
	private sceneFolder(note: TFile, p: Project | null): TFolder | null {
		if (!p || !note.parent) return null;
		const dir = this.app.vault.getAbstractFileByPath(normalizePath(`${note.parent.path}/${p.sceneFolder}`));
		return dir instanceof TFolder && !dir.isRoot() ? dir : null;
	}

	private read(s: State): void {
		if (s.kind === 'longform') { s.lf = readProject(this.app.metadataCache.getFileCache(s.note)?.frontmatter) ?? s.lf; return; }
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

	private onMeta(file: TFile, binderNote: boolean, longform: boolean): void {
		const s = this.states.get(file);
		// still the same kind of binder, with (for Longform) the same scene folder: just re-read the order
		const same = s && (s.kind === 'binder' ? binderNote : longform && !binderNote && this.sceneFolder(file, readProject(this.app.metadataCache.getFileCache(file)?.frontmatter)) === s.dir);
		if (s && same) this.ifChanged(s, () => this.read(s));
		else if (s || binderNote || longform) this.rescan();
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		const isFolder = file instanceof TFolder;
		// the binder note moved, or a folder holding a binder: which folders are binders may have changed
		if ((file instanceof TFile && this.states.has(file)) || (isFolder && [...this.states.values()].some((s) => s.path === oldPath || s.path.startsWith(oldPath + '/')))) this.rescan();
		let o = this.at(oldPath, true), n = this.at(file.path);
		// Longform projects know scenes by name; a note moving between a project and a binder is handled half by each
		if (o?.kind === 'longform' || n?.kind === 'longform') {
			this.lfRename(file, oldPath, o?.kind === 'longform' ? o : null, n?.kind === 'longform' ? n : null);
			if (o?.kind === 'longform') o = null;
			if (n?.kind === 'longform') n = null;
		}
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
		const o = this.at(file.path, true);
		if (o?.kind === 'longform') {
			if (file instanceof TFile && file.extension === 'md') this.lfChange(o, { op: 'remove', item: file.basename }); else this.touch(o);
			return;
		}
		const rel = o && this.relAt(o, file.path, file instanceof TFolder);
		if (o && rel) this.queue(o, { op: 'remove', item: rel });
	}

	// ---- Longform projects ----

	/** A note renamed or moved in, out of, or inside a Longform project's scene folder. */
	private lfRename(file: TAbstractFile, oldPath: string, o: State | null, n: State | null): void {
		if (!(file instanceof TFile) || file.extension !== 'md' || file === o?.note || file === n?.note) { if (o) this.touch(o); if (n && n !== o) this.touch(n); return; }
		const oldName = oldPath.endsWith('.md') ? oldPath.slice(oldPath.lastIndexOf('/') + 1, -3) : null;
		const into = n && file.parent === n.folder;
		if (o && o === n && oldName != null && into) {
			if (oldName !== file.basename) this.lfChange(o, { op: 'rename', from: oldName, to: file.basename });
			else this.touch(o); // its folder was renamed
			return;
		}
		if (o && oldName != null) this.lfChange(o, { op: 'remove', item: oldName });
		else if (o) this.touch(o);
		// a note moved in shows after the listed scenes, as Longform shows new notes, until it's moved
		if (n) this.touch(n);
	}

	/** Follows a rename or delete. Longform, when it's running, writes these itself, so Binders only shows them. */
	private lfChange(s: State, op: SceneOp): void {
		if (s.frozen) { this.touch(s); return; }
		if (!longformRunning(this.app)) { this.queueScenes(s, op); return; }
		const files = [...this.lfFiles(s).keys()];
		s.lf = { ...s.lf, scenes: applySceneOps(s.lf.scenes, [op], files, s.lf.ignored) };
		this.touch(s);
	}

	private async lfMove(s: State, item: TAbstractFile, folder: TFolder, index: number, depth?: number): Promise<void> {
		if (folder !== s.folder) throw new Error('A Longform project keeps its scenes in one folder.');
		if (!(item instanceof TFile) || item.extension !== 'md') throw new Error('Only notes can be scenes in a Longform project.');
		if (item.parent !== folder) {
			const to = normalizePath(`${folder.path}/${item.name}`);
			if (this.app.vault.getAbstractFileByPath(to)) throw new Error(`“${folder.name}” already has a note called “${item.basename}”.`);
			await this.app.fileManager.renameFile(item, to);
		}
		this.queueScenes(s, { op: 'move', item: item.basename, index, indent: depth });
	}

	/** The notes in a project's scene folder by name, without the index note. */
	private lfFiles(s: State): Map<string, TFile> {
		const out = new Map<string, TFile>();
		for (const c of s.folder.children) if (c instanceof TFile && c.extension === 'md' && c !== s.note) out.set(c.basename, c);
		return out;
	}

	/** The scenes as they show, with pending changes applied. */
	private shownScenes(s: State): Scene[] {
		if (s.shown) return s.shown;
		const files = [...this.lfFiles(s).keys()];
		const list = s.lfOps.length ? applySceneOps(s.lf.scenes, s.lfOps, files, s.lf.ignored) : s.lf.scenes;
		return (s.shown = shownScenes(list, files, s.lf.ignored));
	}

	private queueScenes(s: State, op: SceneOp): void {
		s.lfOps.push(op);
		window.clearTimeout(s.timer);
		s.timer = window.setTimeout(() => { void this.write(s); }, DEBOUNCE);
		this.touch(s);
	}

	/** Writes a project's pending changes into `longform.scenes` only, applied to what the index note says now. */
	private async writeScenes(s: State): Promise<void> {
		window.clearTimeout(s.timer);
		const ops = s.lfOps;
		s.lfOps = [];
		s.aliases.clear();
		if (!ops.length || this.states.get(s.note) !== s || this.app.vault.getAbstractFileByPath(s.note.path) !== s.note) return;
		const files = [...this.lfFiles(s).keys()];
		const next = (list: Scene[]) => applySceneOps(list, ops, files, s.lf.ignored);
		if (sameScenes(next(s.lf.scenes), s.lf.scenes)) { this.touch(s, false); return; }
		const shown = this.contents(s);
		try {
			await this.app.fileManager.processFrontMatter(s.note, (fm: Record<string, unknown>) => {
				const p = isBinderNote(fm) ? null : readProject(fm);
				if (!p) throw new NotABinder();
				const list = next(p.scenes);
				if (sameScenes(list, p.scenes)) throw new NotABinder(); // nothing to write
				writeScenes(fm, list);
				s.lf = { ...p, scenes: list }; // don't wait for the cache, so the order doesn't flicker back
			});
		} catch (e) {
			if (!(e instanceof NotABinder)) throw e;
		}
		this.touch(s, false);
		if (JSON.stringify(this.contents(s)) !== JSON.stringify(shown)) this.emit(s.path);
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

	/** Writes a binder's pending changes: applied to what the note says now, missing items dropped (see `next`). One write per batch,
	    and none if nothing changed. */
	private async write(s: State): Promise<void> {
		if (s.kind === 'longform') return this.writeScenes(s);
		window.clearTimeout(s.timer);
		const ops = s.ops;
		s.ops = [];
		s.aliases.clear();
		this.renamedFolders.clear();
		if (!ops.length || s.problem || this.states.get(s.note) !== s || this.app.vault.getAbstractFileByPath(s.note.path) !== s.note) return;
		const items = [...this.items(s).values()].flat();
		const exists = new Set(items.map((i) => i.rel));
		const known = this.known(s);
		// A write drops entries not found in the folder. Safety net: if that's every entry, or more than half, and no rename
		// or delete accounts for them, the list doesn't describe this folder (say, its binder note was moved here by
		// mistake): they're kept, after the rest, so moving the note back finds its order intact.
		const under = (p: string, x: string) => p === x || (x.endsWith('/') && p.startsWith(x));
		const accounted = (p: string) => ops.some((o) => (o.op === 'remove' && under(p, o.item)) || (o.op === 'rename' && under(p, o.from)));
		const next = (list: string[]) => {
			const out = applyOps(list, ops, known).filter((p) => exists.has(p));
			const lost = list.filter((p) => !exists.has(p) && !accounted(p));
			return lost.length && lost.length * 2 > list.length ? [...out, ...lost.filter((p) => !out.includes(p))] : out;
		};
		const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
		if (same(next(s.base), s.base)) { this.touch(s, false); return; }
		const shown = this.contents(s);
		try {
			await this.app.fileManager.processFrontMatter(s.note, (fm: Record<string, unknown>) => {
				if (!isBinderNote(fm)) throw new NotABinder();
				checkFormat(fm); // refuses a newer format before anything is written
				const list = next(readIndex(fm, s.note.basename).contents);
				fm.contents = list.map(diskPath);
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
		if (s.frozen) throw new Error(`“${s.folder.name}” is being made a binder.`);
		return s;
	}

	private folderRel(s: State, folder: TFolder): string { return folder === s.folder ? '' : relPath(s.folder.path, folder.path, true) ?? ''; }
	private folderNotePath(folder: TFolder): string { return normalizePath(`${folder.path}/${folder.name}.md`); }

	/** The list with pending changes applied: what views show before it's written. */
	private contents(s: State): string[] {
		if (s.kind === 'longform') return s.contents ??= this.shownScenes(s).map((x) => `${x.indent} ${x.title}`);
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

	/** The binder's items in the order they show, for moves. The same items `orderedChildren` shows (other files too), so
	    an index among a folder's shown items means the same place here. */
	private known(s: State): string[] {
		const items = this.items(s), out: string[] = [];
		const walk = (folder: string) => {
			const kids = items.get(folder) ?? [];
			for (const r of orderChildren(s.base, folder, kids.map((k) => k.rel))) {
				out.push(r);
				if (r.endsWith('/')) walk(r);
			}
		};
		walk('');
		return out;
	}

	/** Something about this binder changed: drop cached order and (unless told not to) tell subscribers. */
	private touch(s: State, emit = true): void {
		s.contents = null; s.items = null; s.shown = null;
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
