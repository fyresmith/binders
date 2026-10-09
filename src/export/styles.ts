import { TFile, TFolder, normalizePath, type TAbstractFile } from 'obsidian';
import type BindersPlugin from '../main';
import { checkFormat, isBinderNote } from '../model';
import type { ManuscriptStyle } from './docx-parts';
import { applyDetails } from './details';
import { STYLE_EXT, STYLE_VERSION, freeName, listStyles, readStyleFile, resolveStyle, saysNothing, standalone, styleNameProblem, writeStyleFile, type Resolved, type StyleFile } from './style-file';
import { FIRST, rowsOf, toBookStyle, toManuscriptStyle, type Family, type StyleValue } from './style-rows';
import type { BookStyle } from './style';

/* The vault's export styles: the built-in ones, and the files in the styles folder (`Export styles/<name>.bookstyle`
   at the top of the vault) that change them or are styles of the writer's own. Kept read, so a style is to hand when
   a preview asks for it, and read again whenever a file there is made, changed, renamed or deleted, by Binders or
   by anything else (another program, sync).

   These files are the only thing written here, and only when the style editor asks: a property's line, never the
   whole file (style-file.ts). A file from a newer Binders, or one that can't be read, is never written (golden
   rules 3 and 6). A change is made on the file as Binders last read it, and shown at once; it is written only over
   that very text. A file that is something else by then (another program, sync, a moment before) is not written
   over: the change is made again on what is there, so both are kept (`flush`). The one exception to "only the files": renaming a style follows it into the binder notes that
   name it (`book-style`, `manuscript-style`: Book details' own properties). */

export const STYLES_FOLDER = 'Export styles';

/** A change to a style's file: its text as it is (null: no file) to its text as it is to be (null: no file). */
type Change = (text: string | null) => string | null;
/** A style's file waiting to be written. `base`: the file as Binders had it when the first of `changes` was made;
    `text`: what they make of it, which is what is shown meanwhile. */
interface Pending { base: string | null; changes: Change[]; text: string | null }

export class Styles {
	private texts = new Map<string, string>();
	private files = new Map<string, StyleFile>();
	private listeners = new Set<() => void>();
	/** What is waiting to be written, by name. */
	private pending = new Map<string, Pending>();
	/** The styles being renamed just now, old name to new: what is asked of the old name meanwhile is the new one's. */
	private moving = new Map<string, string>();
	private writing: Promise<void> = Promise.resolve();
	private reading: Promise<void> = Promise.resolve();
	private timer = 0;

	constructor(private plugin: BindersPlugin) {}

	/** The styles folder's path: a name at the top of the vault. */
	get folder(): string { return normalizePath(this.plugin.settings.stylesFolder.trim().replace(/^\/+|\/+$/g, '') || STYLES_FOLDER); }
	path(name: string): string { return `${this.folder}/${name}.${STYLE_EXT}`; }
	private nameOf(path: string): string | null { const f = `${this.folder}/`; return path.startsWith(f) && path.endsWith(`.${STYLE_EXT}`) && !path.slice(f.length).includes('/') ? path.slice(f.length, -STYLE_EXT.length - 1) : null; }

	/** Reads the folder now, and from now on whenever something in it changes. */
	start(shown: () => void = () => { /* nobody to tell */ }): void {
		const { plugin } = this, { vault } = plugin.app;
		// (`shown`: the folder may now be one to list, or one to hide: a note came into it, or left)
		const touched = (path: string) => { if (path !== this.folder && !path.startsWith(`${this.folder}/`)) return; this.later(); if (!path.endsWith(`.${STYLE_EXT}`)) shown(); };
		this.shown = shown;
		plugin.registerEvent(vault.on('create', (f) => touched(f.path)));
		plugin.registerEvent(vault.on('modify', (f) => touched(f.path)));
		plugin.registerEvent(vault.on('delete', (f) => touched(f.path)));
		plugin.registerEvent(vault.on('rename', (f, old) => { touched(f.path); touched(old); }));
		plugin.register(() => window.clearTimeout(this.timer));
		void this.reload();
	}
	private shown: () => void = () => { /* set by start */ };

	/** The styles folder under another name: the folder is renamed, with what is in it. */
	async moveTo(name: string): Promise<void> {
		const { plugin } = this, { app } = plugin, was = app.vault.getAbstractFileByPath(this.folder);
		await this.settled();
		// (a folder that is there already is the writer's, styles folder or not: it is never taken over and hidden)
		if (normalizePath(name) !== this.folder && app.vault.getAbstractFileByPath(normalizePath(name))) throw new Error(`There is already something named “${name}” at the top of the vault.`);
		if (was instanceof TFolder) await app.fileManager.renameFile(was, normalizePath(name));
		plugin.settings.stylesFolder = name;
		await plugin.saveData(plugin.settings);
		await this.reload();
		this.shown();
	}
	private later(): void { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { void this.reload(); }, 40); }

	/** The folder read again; anything that changed is told to whoever is listening. Also when its name changes. */
	reload(): Promise<void> {
		const next: Promise<void> = this.reading.then(async () => {
			const { vault } = this.plugin.app, dir = vault.getAbstractFileByPath(this.folder), now = new Map<string, string>();
			for (const f of dir instanceof TFolder ? dir.children : []) {
				const name = f instanceof TFile ? this.nameOf(f.path) : null;
				if (!name || !(f instanceof TFile)) continue;
				try { now.set(name, await vault.read(f)); } catch { /* gone while it was read: the next event says so */ }
			}
			// (a file Binders is about to write is as Binders has it: the disk catches up, and says so)
			for (const [name, { text }] of this.pending) { if (text === null) now.delete(name); else now.set(name, text); }
			let changed = now.size !== this.texts.size;
			for (const [name, text] of now) if (this.texts.get(name) !== text) changed = true;
			if (!changed) return;
			this.take(now);
		}).catch((e) => { console.error('Binders: could not read the export styles', e); });
		this.reading = next;
		return next;
	}
	private take(texts: Map<string, string>): void {
		this.texts = texts;
		this.files = new Map([...texts].map(([n, t]) => [n, readStyleFile(t)]));
		for (const l of [...this.listeners]) { try { l(); } catch (e) { console.error(e); } }
	}
	/** When the styles have been read, and everything asked of them is on disk. */
	async settled(): Promise<void> { await this.reading; await this.writing; await this.reading; }

	/** Tells `fn` whenever a style changes. Returns what stops it. */
	on(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

	/** Is this the styles folder? It is kept out of the file explorer while it holds nothing but styles: anything else
	    in it (a note, a picture, a folder) is the writer's, and the folder is shown. */
	isStylesFolder(file: TAbstractFile): boolean {
		if (!(file instanceof TFolder) || file.path !== this.folder) return false;
		return file.children.every((c) => c instanceof TFile && this.nameOf(c.path) !== null);
	}

	// ---- reading ----

	/** A style of a family by name; the family's first when there is no such style in it. */
	get(name: unknown, family: Family): Resolved {
		// (a style on its way to another name is itself, under whichever of the two it has just now)
		const r = typeof name === 'string' ? resolveStyle(name, this.files) ?? resolveStyle(this.moving.get(name) ?? '', this.files) : null;
		if (r && r.family === family) return r;
		const first = resolveStyle(FIRST[family], this.files);
		if (!first) throw new Error('Binders has no built-in style of that kind.');
		return first;
	}
	list(family: Family): Resolved[] { return listStyles(this.files).filter((s) => s.family === family); }
	book(name: unknown): BookStyle { const r = this.get(name, 'book'); return toBookStyle(r.name, r.values, r.css); }
	manuscript(name: unknown): ManuscriptStyle { const r = this.get(name, 'manuscript'); return toManuscriptStyle(r.name, r.values); }
	/** A style's file as it is, or null when it has none. */
	text(name: string): string | null { return this.texts.get(name) ?? null; }
	/** A style as a file to send to someone: it stands by itself, on a built-in style. */
	shared(name: string, family: Family): string { return standalone(this.get(name, family), this.text(name)); }
	private taken(name: string): boolean { const n = name.toLowerCase(); return [...this.texts.keys(), ...listStyles(new Map()).map((s) => s.name)].some((x) => x.toLowerCase() === n); }

	// ---- writing: only from the style editor ----

	private writable(r: Resolved): void {
		if (r.state === 'newer') throw new Error(`“${r.name}” was made by a newer version of Binders, and its file is left alone. Update Binders to change it.`);
		if (r.state === 'broken') throw new Error(`The file of “${r.name}” can’t be read, so it is left alone. Put it right, or delete it, to change this style.`);
	}

	/** One row of a style changed. A value that is what the style is based on has takes the line away; a built-in
	    style whose file then says nothing has no file. */
	set(r: Resolved, key: string, value: StyleValue): void {
		this.writable(r);
		if (!rowsOf(r.family).some((row) => row.key === key)) return;
		// (a style of the writer's own whose file has been taken away meanwhile is gone: it isn't made again from one row)
		this.put(r.name, (text) => (text === null && !r.builtIn ? null : writeStyleFile(text, r.basedOn, { [key]: value === r.original[key] ? undefined : value })), r.builtIn);
	}
	/** A built-in style as it comes: every row's line taken out of its file (CSS and anything else there stays). */
	reset(r: Resolved): void {
		this.writable(r);
		if (this.text(r.name) === null) return;
		this.put(r.name, (text) => (text === null ? null : writeStyleFile(text, r.basedOn, Object.fromEntries(rowsOf(r.family).map((row): [string, undefined] => [row.key, undefined])))), r.builtIn);
	}
	/** A change to a style's file: `make` is handed the file's text (null: it has none) and returns what it is to be
	    (null: no file). Made now on the text Binders has, so what is shown follows at once; and made again when it is
	    written, if the file is no longer that text. `dropEmpty`: a file left saying nothing is taken away. */
	private put(name: string, make: Change, dropEmpty = false): void {
		// (a style being renamed is its new name already: its file is never made again under the old one)
		const from = this.moving.has(name) ? name : null;
		if (from) name = this.moving.get(from) ?? name;
		const change: Change = (text) => { const made = make(text); return made !== null && dropEmpty && saysNothing(made) ? null : made; };
		const was = this.pending.get(name), had = this.text(name) ?? (from ? this.text(from) : null), text = change(had);
		const now = new Map(this.texts);
		if (from) now.delete(from);
		if (text === null) now.delete(name); else now.set(name, text);
		if (was) { was.changes.push(change); was.text = text; } else this.pending.set(name, { base: had, changes: [change], text });
		this.take(now);
		this.writing = this.writing.then(() => this.flush()).catch((e) => { console.error('Binders: could not write an export style', e); this.later(); });
	}
	private async flush(): Promise<void> {
		const { app } = this.plugin;
		for (const [name, p] of [...this.pending]) {
			const path = this.path(name), at = app.vault.getAbstractFileByPath(path), changes = p.changes.splice(0), want = p.text;
			// What the file is to be, from what it is at this moment. As Binders last had it: the text made from that.
			// Anything else arrived from outside in between, and is never written over: the changes are made again on it,
			// a line each (style-file.ts), so both are kept. A file that has become a newer Binders', or one that can't
			// be read, is left exactly as it is (golden rule 6).
			const onto = (disk: string | null): string | null => {
				if (disk === p.base) return want;
				const f = disk === null ? null : readStyleFile(disk);
				return f && (f.broken || f.version > STYLE_VERSION) ? disk : changes.reduce<string | null>((text, change) => change(text), disk);
			};
			let made: string | null = want;
			try {
				if (at instanceof TFile) {
					// (read and written in one step: nothing lands between the two)
					try { await app.vault.process(at, (disk) => { made = onto(disk); return made ?? disk; }); } catch (e) {
						// (taken away outside while this waited: the style is gone, and is not made again; any other failure is said)
						if (await app.vault.adapter.exists(path)) throw e;
						if (this.pending.get(name) === p) this.pending.delete(name);
						this.later();
						continue;
					}
					if (made === null) await app.fileManager.trashFile(at);
				} else {
					made = onto(null);
					if (made !== null) {
						if (!app.vault.getAbstractFileByPath(this.folder)) await app.vault.createFolder(this.folder);
						await app.vault.create(path, made);
					}
				}
				p.base = made;
				// (not what was shown: an outside change came with it. The folder is read again)
				if (made !== want) this.later();
				// (changes asked for while this was written are next, on what is there now)
				if (p.changes.length) p.text = made === want ? p.text : p.changes.reduce<string | null>((text, change) => change(text), made);
				else this.pending.delete(name);
			} catch (e) {
				if (this.pending.get(name) === p) this.pending.delete(name);
				throw e;
			}
		}
	}

	/** A style of the writer's own, made from another: based on it, with nothing changed yet. Returns its name. */
	async duplicate(r: Resolved): Promise<string> {
		const name = freeName(r.name, (n) => this.taken(n));
		// (a file of that name that turned up meanwhile is someone's, and stays as it is)
		this.put(name, (text) => text ?? writeStyleFile(null, r.name, {}));
		await this.settled();
		return name;
	}

	/** A style from a file someone sent: it joins the styles under the file's name, or the first free one like it.
	    Returns the name it was given. A file that isn't a style's, or is a newer Binders', is not taken. */
	async add(fileName: string, text: string): Promise<string> {
		const said = fileName.replace(/\.[^.]*$/, '').trim(), f = readStyleFile(text);
		if (f.broken) throw new Error(`“${fileName}” isn’t a style’s file. ${f.broken}`);
		if (f.version > STYLE_VERSION) throw new Error(`“${fileName}” was made by a newer version of Binders. Update Binders to add it.`);
		const problem = styleNameProblem(said);
		if (problem) throw new Error(problem);
		const name = this.taken(said) ? freeName(said, (n) => this.taken(n)) : said;
		// (a built-in style's changes, sent under its name, come in as a style of one's own based on it)
		this.put(name, (there) => there ?? (f.basedOn ? text : writeStyleFile(text, FIRST.book, {})));
		await this.settled();
		return name;
	}

	/** A style of the writer's own renamed: its file, the styles based on it, and the binders that use it. */
	async rename(r: Resolved, to: string): Promise<string> {
		const name = to.trim(), problem = styleNameProblem(name);
		if (r.builtIn) throw new Error('A built-in style keeps its name. Duplicate it to have one of your own.');
		if (problem) throw new Error(problem);
		if (name === r.name) return name;
		if (name.toLowerCase() !== r.name.toLowerCase() && this.taken(name)) throw new Error(`There is already a style named “${name}”.`);
		await this.settled();
		const { app } = this.plugin, at = app.vault.getAbstractFileByPath(this.path(r.name));
		if (!(at instanceof TFile)) throw new Error(`The file of “${r.name}” is gone.`);
		const based = this.dependents(r.name);
		// From here until the style is known under its new name, a row changed in the editor is still asked of the old
		// one. It is the new one's (`put`), and written after the file has moved: the rename is one of the writes, in
		// their order. Written under the old name it would make that file again, and there would be two styles.
		this.moving.set(r.name, name);
		try {
			const moved = this.writing.then(async () => {
				try { await app.fileManager.renameFile(at, this.path(name)); } catch (e) {
					// (the style keeps its name: what was asked of it meanwhile is asked under that name)
					const asked = this.pending.get(name);
					if (asked) { this.pending.delete(name); this.pending.set(r.name, asked); }
					this.moving.delete(r.name);
					this.later();
					throw e;
				}
			});
			this.writing = moved.catch(() => { /* said to whoever asked for the rename */ });
			await moved;
			await this.reload();
			for (const d of based) this.put(d.name, (text) => (text === null ? null : writeStyleFile(text, name, {})));
			await this.follow(r.name, name, r.family);
			await this.settled();
		} finally { this.moving.delete(r.name); }
		return name;
	}

	/** A style of the writer's own deleted (to the trash, as Obsidian is set to delete). A style that was based on it
	    is first made to stand by itself, so it stays as it is. */
	async remove(r: Resolved): Promise<void> {
		if (r.builtIn) throw new Error('A built-in style can’t be deleted. Reset it to take your changes away.');
		for (const d of this.dependents(r.name)) this.put(d.name, (text) => (text === null ? null : standalone(d, text)));
		this.put(r.name, () => null);
		await this.settled();
		// (the binders that used it use what it was based on, as the delete dialog says)
		await this.follow(r.name, r.basedOn, r.family);
	}
	/** The usable styles based on this one. */
	private dependents(name: string): Resolved[] { return listStyles(this.files).filter((s) => !s.builtIn && s.state === 'ok' && s.basedOn === name && s.hasFile && this.files.get(s.name)?.basedOn === name); }

	/** A renamed style is still the style of the binders that named it, and of the manuscript last made. */
	private async follow(was: string, now: string, family: Family): Promise<void> {
		const { plugin } = this, { app } = plugin, key = family === 'book' ? 'book-style' : 'manuscript-style';
		if (family === 'manuscript' && plugin.settings.exportStyle === was) { plugin.settings.exportStyle = now; await plugin.saveData(plugin.settings); }
		for (const b of plugin.binders.all()) {
			if (b.kind !== 'binder' || b.problem || app.metadataCache.getFileCache(b.note)?.frontmatter?.[key] !== was) continue;
			try {
				await app.fileManager.processFrontMatter(b.note, (fm: Record<string, unknown>) => { if (!isBinderNote(fm) || fm[key] !== was) return; checkFormat(fm); applyDetails(fm, family === 'book' ? { bookStyle: now } : { manuscriptStyle: now }); });
			} catch { /* a note that can't be written keeps the old name, and falls back to the first style */ }
		}
	}
}
