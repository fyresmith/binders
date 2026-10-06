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
   rules 3 and 6). The one exception to "only the files": renaming a style follows it into the binder notes that
   name it (`book-style`, `manuscript-style`: Book details' own properties). */

export const STYLES_FOLDER = 'Export styles';

export class Styles {
	private texts = new Map<string, string>();
	private files = new Map<string, StyleFile>();
	private listeners = new Set<() => void>();
	/** What is waiting to be written, by name: the file's whole text, or null for a file to take away. */
	private pending = new Map<string, string | null>();
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
		if (was instanceof TFolder && app.vault.getAbstractFileByPath(normalizePath(name))) throw new Error(`There is already something named “${name}” at the top of the vault.`);
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
			for (const [name, text] of this.pending) { if (text === null) now.delete(name); else now.set(name, text); }
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

	/** Is this the styles folder? It is kept out of the file explorer, unless the writer keeps notes in it. */
	isStylesFolder(file: TAbstractFile): boolean {
		if (!(file instanceof TFolder) || file.path !== this.folder) return false;
		const holdsNote = (d: TFolder): boolean => d.children.some((c) => (c instanceof TFolder ? holdsNote(c) : c instanceof TFile && c.extension === 'md'));
		return !holdsNote(file);
	}

	// ---- reading ----

	/** A style of a family by name; the family's first when there is no such style in it. */
	get(name: unknown, family: Family): Resolved {
		const r = typeof name === 'string' ? resolveStyle(name, this.files) : null;
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
		this.put(r.name, writeStyleFile(this.text(r.name), r.basedOn, { [key]: value === r.original[key] ? undefined : value }), r.builtIn);
	}
	/** A built-in style as it comes: every row's line taken out of its file (CSS and anything else there stays). */
	reset(r: Resolved): void {
		this.writable(r);
		const text = this.text(r.name);
		if (text === null) return;
		this.put(r.name, writeStyleFile(text, r.basedOn, Object.fromEntries(rowsOf(r.family).map((row): [string, undefined] => [row.key, undefined]))), r.builtIn);
	}
	private put(name: string, text: string | null, dropEmpty = false): void {
		if (text !== null && dropEmpty && saysNothing(text)) text = null;
		const now = new Map(this.texts);
		if (text === null) now.delete(name); else now.set(name, text);
		this.pending.set(name, text);
		this.take(now);
		this.writing = this.writing.then(() => this.flush()).catch((e) => { console.error('Binders: could not write an export style', e); this.later(); });
	}
	private async flush(): Promise<void> {
		const { app } = this.plugin;
		for (const [name, text] of [...this.pending]) {
			const path = this.path(name), at = app.vault.getAbstractFileByPath(path);
			try {
				if (text === null) { if (at instanceof TFile) await app.fileManager.trashFile(at); }
				else if (at instanceof TFile) { if (await app.vault.read(at) !== text) await app.vault.modify(at, text); }
				else {
					if (!app.vault.getAbstractFileByPath(this.folder)) await app.vault.createFolder(this.folder);
					await app.vault.create(path, text);
				}
			} finally { if (this.pending.get(name) === text) this.pending.delete(name); }
		}
	}

	/** A style of the writer's own, made from another: based on it, with nothing changed yet. Returns its name. */
	async duplicate(r: Resolved): Promise<string> {
		const name = freeName(r.name, (n) => this.taken(n));
		this.put(name, writeStyleFile(null, r.name, {}));
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
		this.put(name, f.basedOn ? text : writeStyleFile(text, FIRST.book, {}));
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
		await app.fileManager.renameFile(at, this.path(name));
		await this.reload();
		for (const d of based) this.put(d.name, writeStyleFile(this.text(d.name), name, {}));
		await this.follow(r.name, name, r.family);
		await this.settled();
		return name;
	}

	/** A style of the writer's own deleted (to the trash, as Obsidian is set to delete). A style that was based on it
	    is first made to stand by itself, so it stays as it is. */
	async remove(r: Resolved): Promise<void> {
		if (r.builtIn) throw new Error('A built-in style can’t be deleted. Reset it to take your changes away.');
		for (const d of this.dependents(r.name)) this.put(d.name, standalone(d, this.text(d.name)));
		this.put(r.name, null);
		await this.settled();
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
