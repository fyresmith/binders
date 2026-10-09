import { TFile, TFolder, normalizePath, type TAbstractFile } from 'obsidian';
import type BindersPlugin from '../main';
import { isExported, isNote, saveOpen } from '../scenes';
import { parts } from '../scene-text';
import { checkFormat, isBinderNote } from '../model';
import { bookNeeds, buildBook, type Resolver } from './book';
import { applyDetails, readDetails, type Details } from './details';
import type { Desktop, Stamp } from './desktop';
import { writeDocx } from './docx';
import { writeEpub } from './epub';
import { bookWords, type Book, type Picture } from './model';
import { isPictureName, pictureOf } from './picture';
import type { SourceItem } from './roles';
import { fontFaceCss } from './pages/fonts';
import { printCss } from './pages/css';
import { layPages, openStage, type Laid, type PagesSpec, type Stage } from './pages/layout';
import type { Printer } from './pdf';

/* Export where it meets the vault: a binder (or a folder of one) read into the book model, the manuscript made from
   it, and the file put where it goes. It reads notes and writes the exported file, and nothing else: no note's text
   or properties are changed here. The pure parts are beside this file; the window is view/export.ts. */

/** The properties of a note or folder that export reads. `export: false` leaves it out (`compile: false`, its name
    before export, is read as the same for good); `export-as` gives it a role by hand. */
export const EXPORT_AS = 'export-as';

/** The kinds of export there are so far. */
export type Kind = 'manuscript' | 'ebook' | 'paperback' | 'scrivener' | 'note';
export const KINDS: { id: Kind; name: string; detail: string }[] = [
	{ id: 'manuscript', name: 'Manuscript', detail: 'Word, in standard manuscript format' },
	{ id: 'ebook', name: 'Ebook', detail: 'EPUB, for Kindle, Apple Books and Kobo' },
	{ id: 'paperback', name: 'Paperback', detail: 'PDF, ready for print' },
	{ id: 'scrivener', name: 'Scrivener project', detail: 'The binder itself, for Scrivener 3' },
	{ id: 'note', name: 'One note', detail: 'Markdown, in this vault' },
];

/** A book's details as its binder note has them, and why they can't be changed here (null when they can): a binder
    in a newer format is never written, and a Longform project's note is Longform's. */
export function bookDetails(plugin: BindersPlugin, folder: TFolder): { details: Details; binder: string; locked: string | null } {
	const binder = plugin.binders.binderOf(folder);
	if (!binder) throw new Error(`“${folder.name}” isn’t in a binder.`);
	const fm = (plugin.app.metadataCache.getFileCache(binder.note)?.frontmatter ?? {}) as Record<string, unknown>;
	const locked = binder.kind === 'longform' ? 'This is a Longform project: its note is Longform’s, and Binders writes nothing of its own there. Type these as properties of the project’s note.' : binder.problem ? `This binder can’t be changed. ${binder.problem}` : null;
	return { details: readDetails(fm), binder: binder.folder.name, locked };
}

/** Book details kept: only the details given, only as Book details' own properties of the binder note, and never in
    a note that isn't a binder's or is in a newer format (golden rules 3 and 6). The note's text is not touched. */
export async function saveDetails(plugin: BindersPlugin, folder: TFolder, change: Partial<Details>): Promise<void> {
	const binder = plugin.binders.binderOf(folder);
	if (!binder || binder.kind !== 'binder') throw new Error('Book details are kept in a binder’s own note, and this isn’t one.');
	await plugin.app.fileManager.processFrontMatter(binder.note, (fm: Record<string, unknown>) => {
		if (!isBinderNote(fm)) throw new Error('Book details are kept in a binder’s own note, and this isn’t one.');
		checkFormat(fm);
		applyDetails(fm, change);
	});
}

/** A folder of a binder, read for export: the book, and how many words it has. `asBook`: with the pages Binders
    makes for a book (a title page, a copyright page, the contents) and its cover, as an ebook has them. `asTyped`:
    quotes and dashes are left as they were typed (a book style can say so). `withCover`:
    with the cover (a printed book has none inside it). */
export async function readBook(plugin: BindersPlugin, folder: TFolder, matter: boolean, asBook = false, asTyped = false, withCover = asBook): Promise<{ book: Book; words: number }> {
	const { app, binders: store, settings } = plugin, binder = store.binderOf(folder);
	if (!binder) throw new Error(`“${folder.name}” isn’t in a binder.`);
	const fm = (f: TFile | null): Record<string, unknown> => (f ? app.metadataCache.getFileCache(f)?.frontmatter ?? {} : {});
	// what is typed and not saved yet is on disk before anything is read
	await saveOpen(app, store.scenes(folder));
	const item = async (f: TAbstractFile): Promise<SourceItem | null> => {
		if (f instanceof TFolder) {
			const children: SourceItem[] = [];
			for (const c of store.orderedChildren(f) ?? []) { const it = await item(c); if (it) children.push(it); }
			return { kind: 'folder', name: f.name, path: f.path, included: isExported(plugin, f), exportAs: fm(store.folderNote(f))[EXPORT_AS], children };
		}
		if (!isNote(f)) return null;
		const included = isExported(plugin, f);
		return { kind: 'note', name: f.basename, path: f.path, included, exportAs: fm(f)[EXPORT_AS], text: included ? parts(await app.vault.cachedRead(f)).body : '' };
	};
	const items: SourceItem[] = [];
	// (a Longform project is its scenes in order: its groups are no folders)
	for (const c of binder.kind === 'longform' ? store.scenes(folder) : store.orderedChildren(folder) ?? []) { const it = await item(c); if (it) items.push(it); }

	// what the notes embed and show is found as Obsidian finds it, and read before the book is put together
	const found = new Map<string, { text: string } | { picture: Picture } | null>();
	const key = (target: string, from: string) => `${from}\n${target}`;
	for (const n of bookNeeds(items)) {
		for (const target of [...n.embeds, ...n.images]) {
			const name = target.split('|')[0].trim();
			// (a part of a note, `![[Note#Heading]]`, isn't brought in: only a whole note is)
			const file = /^[a-z][\w+.-]*:/i.test(name) || name.includes('#') ? null : app.metadataCache.getFirstLinkpathDest(safeDecode(name), n.from);
			let got: { text: string } | { picture: Picture } | null = null;
			try {
				if (file && file.extension === 'md') got = { text: await app.vault.cachedRead(file) };
				else if (file && isPictureName(file.name)) { const pic = pictureOf(new Uint8Array(await app.vault.readBinary(file))); got = pic ? { picture: pic } : null; }
			} catch { got = null; }
			found.set(key(target, n.from), got);
		}
	}
	const resolve: Resolver = {
		embed: (target, from) => found.get(key(target, from)) ?? null,
		image: (src, from) => { const f = found.get(key(src, from)); return f && 'picture' in f ? f.picture : null; },
		// (a link is followed as Obsidian follows it: to a note, wherever in the vault it is)
		link: (target, from) => { const f = app.metadataCache.getFirstLinkpathDest(safeDecode(target.split('#')[0].trim()) || from, from); return f instanceof TFile && f.extension === 'md' ? f.path : null; },
	};
	const own = fm(binder.note), d = readDetails(own);
	// the cover: a PNG or a JPEG of the vault, named in Book details
	let cover: Picture | null = null, coverSaid = '';
	if (withCover && d.cover) {
		const file = app.metadataCache.getFirstLinkpathDest(d.cover, binder.note.path);
		try { const pic = file ? pictureOf(new Uint8Array(await app.vault.readBinary(file))) : null; cover = pic && pic.type !== 'gif' ? pic : null; } catch { cover = null; }
		coverSaid = !cover ? `The cover “${d.cover}” isn’t in the vault, or isn’t a PNG or a JPEG. The book has no cover.` : Math.max(cover.width, cover.height) < COVER_SIDE ? `The cover is ${Math.max(cover.width, cover.height).toLocaleString()} pixels on its longer side. Stores ask for at least ${COVER_SIDE.toLocaleString()}.` : '';
	}
	// (a folder of the binder exported by itself is named for itself; the binder's own title is the whole book's)
	const book = buildBook(items, {
		title: folder === binder.folder ? d.title || folder.name : folder.name,
		subtitle: folder === binder.folder ? d.subtitle : '',
		author: d.author || settings.authorName.trim(),
		copyright: d.copyright,
		year: new Date().getFullYear(),
		cover,
		language: d.language || 'en',
		structure: d.structure,
		flat: binder.kind === 'longform',
		matter,
		asTyped,
		made: asBook ? { titlePage: d.titlePage, contents: d.contents } : undefined,
	}, resolve);
	const said = (text: string) => book.warnings.unshift({ path: binder.note.path, name: 'Book details', text });
	if (coverSaid) said(coverSaid);
	if (typeof own.language === 'string' && own.language.trim() && !d.language) said(`“${own.language.trim()}” isn’t a language Binders can read. The book is taken to be in English until one is chosen.`);
	return { book, words: bookWords(book) };
}
const safeDecode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

/** The manuscript of a book as a Word file. */
export function manuscript(plugin: BindersPlugin, book: Book, words: number, style: string): Uint8Array {
	return writeDocx(book, plugin.styles.manuscript(style), { contact: plugin.settings.contact.split(/\r?\n/).map((l) => l.trim()).filter((l) => l), words });
}

/** The ebook of a book, in a book style: one of the vault's, by name. */
export const ebook = (plugin: BindersPlugin, book: Book, style: string): Uint8Array => writeEpub(book, plugin.styles.book(style));

/** The longer side stores ask of a cover, in pixels (Apple's floor; Kindle's ideal is 2,560). */
const COVER_SIDE = 1400;

/** A file's name from a book's title: without what a file name can't have. */
export const fileName = (title: string): string => title.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'Untitled';

// ---- where the file goes ----

/** The Exports folder for a binder, as a path in the vault: a name is a folder beside the binder; a path (with a
    `/` in it) is one folder for the whole vault. */
export function exportsFolder(plugin: BindersPlugin, folder: TFolder): string {
	const said = plugin.settings.exportsFolder.trim().replace(/^\/+|\/+$/g, '') || 'Exports';
	if (said.includes('/')) return normalizePath(said);
	const binder = plugin.binders.binderOf(folder)?.folder ?? folder, beside = binder.parent && !binder.parent.isRoot() ? `${binder.parent.path}/` : '';
	return normalizePath(`${beside}${said}`);
}

/** What this device remembers about saving: for each binder and kind, the place chosen "without asking"; and for the
    files export wrote, what each was when it left it. Kept in the device's own storage, not in the vault's settings:
    a path on this disk means nothing on another. */
interface Memory { places: Record<string, string>; written: Record<string, Stamp>; last: Record<string, Last> }
/** The last export of a binder (or a folder of one) on this device: what kind, and where it went. */
export interface Last { kind: string; where: 'disk' | 'vault'; path: string }
const MEMORY = 'binders-export', WRITTEN_KEPT = 60;
const placeKey = (folder: TFolder, kind: Kind) => `${kind}\n${folder.path}`;

export function memory(plugin: BindersPlugin): Memory {
	const m = plugin.app.loadLocalStorage(MEMORY) as Partial<Memory> | null;
	const rec = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, T>) } : {});
	return { places: rec<string>(m?.places), written: rec<Stamp>(m?.written), last: rec<Last>(m?.last) };
}
export function remember(plugin: BindersPlugin, change: (m: Memory) => void): void {
	const m = memory(plugin);
	change(m);
	for (const k of Object.keys(m.written).slice(0, -WRITTEN_KEPT)) delete m.written[k];
	plugin.app.saveLocalStorage(MEMORY, m);
}

/** The place remembered for a kind of export of a folder, or null: then export asks. With `extension`, the place for
    a file of that ending: a manuscript remembered as a Word file and made as a PDF goes beside it, never over it. */
export function placeFor(plugin: BindersPlugin, folder: TFolder, kind: Kind, extension?: string): string | null {
	const kept = memory(plugin).places[placeKey(folder, kind)] ?? null;
	if (!kept || !extension || kept.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) return kept;
	return `${kept.replace(/\.[^./\\]*$/, '')}.${extension}`;
}
export function setPlace(plugin: BindersPlugin, folder: TFolder, kind: Kind, path: string | null): void {
	remember(plugin, (m) => { if (path) m.places[placeKey(folder, kind)] = path; else delete m.places[placeKey(folder, kind)]; });
}
/** The last export of a folder on this device, for "Export again"; null if there was none. */
export function lastExport(plugin: BindersPlugin, folder: TFolder): Last | null {
	const l = memory(plugin).last[folder.path];
	return l && typeof l.kind === 'string' && typeof l.path === 'string' && (l.where === 'disk' || l.where === 'vault') ? l : null;
}
/** An export was made: it is the one "Export again" repeats. */
export function noteLast(plugin: BindersPlugin, folder: TFolder, kind: string, saved: Pick<Saved, 'where' | 'path'>): void {
	remember(plugin, (m) => { m.last[folder.path] = { kind, where: saved.where, path: saved.path }; });
}

/** Every place remembered on this device, as the settings tab lists them: the folder, the kind, the path. */
export function places(plugin: BindersPlugin): { folder: string; kind: string; path: string }[] {
	return Object.entries(memory(plugin).places).map(([k, path]) => { const [kind, folder] = k.split('\n'); return { folder, kind, path }; });
}
export function forgetPlaces(plugin: BindersPlugin): void { remember(plugin, (m) => { m.places = {}; }); }

/** Where a file was saved. `disk`: a path on the computer, outside Obsidian's sight. `vault`: a path in the vault. */
export interface Saved { where: 'disk' | 'vault'; path: string; shown: string }

export interface SaveOptions {
	folder: TFolder;
	kind: Kind;
	/** The file's name without its ending, and its ending. */
	name: string;
	extension: string;
	/** What the system's dialog calls this kind of file. */
	type: string;
	/** Ask where, even if a place is remembered. */
	ask?: boolean;
	/** Asked before a file that export didn't write is replaced. */
	replace(shown: string): Promise<boolean>;
}

/** Saves an exported file. On a computer the system's save dialog opens in the Exports folder, unless a place is
    remembered for this kind of this binder; anywhere else (a phone, a tablet, a computer where the dialog isn't to be
    had) the file goes into the Exports folder in the vault. Null if the writer backed out. A file that export didn't
    write is never replaced without asking. */
export async function save(plugin: BindersPlugin, host: Desktop | null, data: Uint8Array, o: SaveOptions): Promise<Saved | null> {
	const { app } = plugin, dir = exportsFolder(plugin, o.folder), file = `${o.name}.${o.extension}`;
	if (host) {
		const kept = o.ask ? null : placeFor(plugin, o.folder, o.kind, o.extension);
		let path = kept;
		if (!path) {
			// the dialog starts in the Exports folder: made for it, and taken away again if the file goes elsewhere
			const start = host.join(host.base, ...dir.split('/')), made = await host.mkdir(start).catch(() => false);
			try { path = await host.pick(host.join(start, file), o.type, o.extension); }
			finally { if (made) await host.rmdir(start); }
			if (!path) return null;
			if (host.dirname(path) === start) await host.mkdir(start);
		} else {
			// straight there: only over a file that is still what export left
			const there = await host.stamp(path), was = memory(plugin).written[path];
			if (there && !(was && was.size === there.size && was.mtime === there.mtime) && !(await o.replace(host.basename(path)))) return null;
			await host.mkdir(host.dirname(path));
		}
		const stamp = await host.write(path, data);
		remember(plugin, (m) => { delete m.written[path]; m.written[path] = stamp; });
		// (a remembered place follows the file: "Choose where to save" changes it)
		if (kept !== null || placeFor(plugin, o.folder, o.kind)) setPlace(plugin, o.folder, o.kind, path);
		return { where: 'disk', path, shown: shownPath(host, path) };
	}
	const path = normalizePath(`${dir}/${file}`), at = app.vault.getAbstractFileByPath(path), key = `vault:${path}`;
	if (at && !(at instanceof TFile)) throw new Error(`“${path}” is a folder.`);
	if (plugin.binders.binderOf(path)) throw new Error('The Exports folder is inside a binder. Choose another in Binders’ settings.');
	if (at instanceof TFile) {
		const was = memory(plugin).written[key];
		if (!(was && was.size === at.stat.size && was.mtime === at.stat.mtime) && !(await o.replace(path))) return null;
	}
	if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
	const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	const made = at instanceof TFile ? (await app.vault.modifyBinary(at, buffer), at) : await app.vault.createBinary(path, buffer);
	remember(plugin, (m) => { delete m.written[key]; m.written[key] = { size: made.stat.size, mtime: made.stat.mtime }; });
	return { where: 'vault', path, shown: path };
}

/** A path on the disk as the window says it: from the vault's folder when it is inside it. */
export function shownPath(host: Desktop, path: string): string {
	const inside = path.startsWith(host.base) ? path.slice(host.base.length) : '';
	return /^[\\/]/.test(inside) ? inside.slice(1).replace(/\\/g, '/') : path;
}

/** Hands a file to the system's share sheet, where there is one (a phone, a tablet). False where there isn't. */
export async function share(data: Uint8Array, name: string, mime: string): Promise<boolean> {
	try {
		const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
		const files = [new File([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], name, { type: mime })];
		if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !nav.canShare({ files })) return false;
		await nav.share({ files, title: name });
		return true;
	} catch { return false; } // (the writer closed the sheet: the file is in the vault all the same)
}

/** What stands where a PDF can't be made: on a phone or a tablet, or where Obsidian's webviews aren't to be had. */
export const NO_PDF = 'PDF isn’t available here.';
export const PDF_MIME = 'application/pdf';

/** Pages that are laid out, printed: the PDF's bytes. `stop`: ends the print there and then. */
export function printPages(printer: Printer, book: Book, laid: Laid, stop?: AbortSignal): Promise<Uint8Array> {
	const spec = laid.spec;
	return printer.print({ title: book.title, author: book.author.trim(), language: spec.language, rtl: spec.rtl, css: fontFaceCss(spec.typeface) + spec.css + printCss(spec.geometry), body: laid.html(), pages: laid.pages.length }, stop);
}

/** A book as a PDF: laid out as pages out of sight, exactly as the window shows them, and printed. Null if it was
    cancelled. `say`: what is happening, in words. `cancelled` is asked between the steps and as the pages are laid
    out; `stop` reaches the printer too, which is one long step: stopped, it and the pages out of sight are gone at
    once, not when the print would have ended. */
export async function pagesPdf(plugin: BindersPlugin, book: Book, spec: PagesSpec, o: { say?: (doing: string) => void; cancelled?: () => boolean; stop?: AbortSignal } = {}): Promise<{ data: Uint8Array; laid: Laid } | null> {
	const printer = plugin.exportHost.printer();
	if (!printer) throw new Error(NO_PDF);
	const holder = activeDocument.body.createDiv({ cls: 'binders-export-offstage', attr: { 'aria-hidden': 'true' } });
	let stage: Stage | null = null;
	try {
		stage = await openStage(holder, 'binders-export-frame');
		const laid = await layPages(stage, book, spec, { tick: (n) => o.say?.(`Laying out the pages… ${n.toLocaleString()}`), cancelled: o.cancelled });
		if (!laid || o.cancelled?.()) return null;
		o.say?.(`Printing ${laid.pages.length.toLocaleString()} ${laid.pages.length === 1 ? 'page' : 'pages'}…`);
		const data = await printPages(printer, book, laid, o.stop);
		return o.cancelled?.() ? null : { data, laid };
	} catch (e) {
		// (stopped by the writer: nothing went wrong, and nothing is said to have)
		if (o.stop?.aborted) return null;
		throw e;
	} finally { stage?.close(); holder.remove(); }
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
