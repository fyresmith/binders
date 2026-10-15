import type { Kind } from './export';

/* A binder's exports: its named presets ("Submission", "Critique group", "Kindle", "Paperback 6 × 9"), kept in the
   binder note as `exports`, a list (as saved filters are kept in `filters`). Each says what it makes (a kind), with which
   style and page, what part of the book goes out, which front and back matter it takes, and its edition's ISBN. A preset
   holds no look of its own: the style it names is the vault's, shared. Until a binder has written the list, it has the
   five kinds as its exports, one each, named for them: a writer who never names an export sees the window as it was.
   Pure: each edit takes the list as the note has it and gives the list to write. An entry this Binders can't read is
   kept, in its place. Format: docs/dev/file-format.md, "Exports". */

export const EXPORTS_PROP = 'exports';
const KIND_IDS: readonly Kind[] = ['manuscript', 'ebook', 'paperback', 'scrivener', 'note'];

/** What goes out: the whole book, one folder of it (its path in the vault), or the notes a saved filter keeps. */
export type Scope = { kind: 'book' } | { kind: 'folder'; path: string } | { kind: 'filter'; name: string };

export interface Preset {
	name: string;
	kind: Kind;
	/** The style it is set in (a manuscript style for a manuscript, a book style for an ebook or a paperback); "" for the binder's. */
	style: string;
	/** A paperback's page (a trim size's id), a manuscript's file and paper; "" for what the binder or the vault says. */
	page: string;
	file: '' | 'docx' | 'pdf';
	paper: string;
	scope: Scope;
	/** Chapters numbered as in the whole book (the default), or from 1, when only part of it goes out. */
	fromOne: boolean;
	/** The front and back matter left out of this export, and the pages Binders makes ("title page", "copyright page",
	    "contents page"): a note by its link. Null: what the kind takes by itself (a manuscript none, a book all). */
	leaveOut: string[] | null;
	/** This edition's ISBN (an ebook's, a paperback's). */
	isbn: string;
}

export const MADE_PAGES = ['title page', 'copyright page', 'contents page'] as const;

type Entry = Record<string, unknown>;
const isEntry = (v: unknown): v is Entry => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** One export of each kind, named for it: the exports a binder has until it says otherwise. */
export function seeds(names: Record<Kind, string>): Preset[] { return KIND_IDS.map((kind) => blank(names[kind], kind)); }
export const blank = (name: string, kind: Kind): Preset => ({ name, kind, style: '', page: '', file: '', paper: '', scope: { kind: 'book' }, fromOne: false, leaveOut: null, isbn: '' });

/** A preset as the note has it, or null for an entry that isn't one. */
export function readPreset(v: unknown): Preset | null {
	if (!isEntry(v)) return null;
	const name = str(v.name), kind = str(v.kind).toLowerCase() as Kind;
	if (!name || !KIND_IDS.includes(kind)) return null;
	const p = blank(name, kind);
	p.style = str(v.style); p.page = str(v.page); p.paper = str(v.paper); p.isbn = str(v.isbn);
	const file = str(v.file).toLowerCase();
	p.file = file === 'pdf' ? 'pdf' : file === 'docx' || file === 'word' ? 'docx' : '';
	if (str(v.folder)) p.scope = { kind: 'folder', path: str(v.folder) };
	else if (str(v.filter)) p.scope = { kind: 'filter', name: str(v.filter) };
	p.fromOne = /^from 1$/i.test(str(v.numbering));
	const out = v['leave out'];
	if (Array.isArray(out)) p.leaveOut = out.map(str).filter((s) => s);
	return p;
}

/** A preset as it is written: only what it says, so a seed that says nothing is its name and kind. */
export function writePreset(p: Preset): Entry {
	const e: Entry = { name: p.name, kind: p.kind };
	if (p.style) e.style = p.style;
	if (p.page) e.page = p.page;
	if (p.file) e.file = p.file;
	if (p.paper) e.paper = p.paper;
	if (p.scope.kind === 'folder') e.folder = p.scope.path;
	if (p.scope.kind === 'filter') e.filter = p.scope.name;
	if (p.fromOne && p.scope.kind !== 'book') e.numbering = 'from 1';
	if (p.leaveOut) e['leave out'] = p.leaveOut.slice();
	if (p.isbn) e.isbn = p.isbn;
	return e;
}

/** A binder's exports, as its note says: the presets it can read, in order, or the seeds when it has written none. */
export function readPresets(raw: unknown, seedList: Preset[]): Preset[] {
	if (!Array.isArray(raw)) return seedList;
	const list = (raw as unknown[]).map(readPreset).filter((p): p is Preset => !!p);
	return list.length ? list : seedList;
}

/** A name not taken: the one asked for, or it with a number ("Kindle 2"). */
export function freeName(name: string, taken: readonly string[]): string {
	if (!taken.some((t) => same(t, name))) return name;
	let n = 2;
	while (taken.some((t) => same(t, `${name} ${n}`))) n++;
	return `${name} ${n}`;
}

export type PresetEdit =
	| { kind: 'set'; name: string; preset: Preset }
	| { kind: 'add'; preset: Preset; after?: string }
	| { kind: 'rename'; name: string; to: string }
	| { kind: 'delete'; name: string };

/** The list the note should hold after an edit. The seeds are written out first when the note has none. A change that
    can't be made (no such export, a name taken or blank, the last export deleted) gives back the list unchanged. */
export function editPresets(raw: unknown, seedList: Preset[], op: PresetEdit): unknown[] {
	const list: unknown[] = Array.isArray(raw) && (raw as unknown[]).some((v) => readPreset(v)) ? (raw as unknown[]).slice() : seedList.map(writePreset);
	const nameAt = (v: unknown) => readPreset(v)?.name ?? null;
	const at = (name: string) => list.findIndex((v) => { const n = nameAt(v); return n != null && same(n, name); });
	const taken = () => list.map(nameAt).filter((n): n is string => n != null);
	if (op.kind === 'add') {
		const name = op.preset.name.trim();
		if (!name || taken().some((t) => same(t, name))) return list;
		const i = op.after ? at(op.after) : -1;
		list.splice(i < 0 ? list.length : i + 1, 0, writePreset({ ...op.preset, name }));
		return list;
	}
	const i = at(op.name);
	if (i < 0) return list;
	if (op.kind === 'set') {
		// (what this Binders doesn't write in an entry is kept: a key a newer one added stays)
		const old = list[i] as Entry, keep: Entry = {};
		for (const [k, v] of Object.entries(old)) if (!['name', 'kind', 'style', 'page', 'file', 'paper', 'folder', 'filter', 'numbering', 'leave out', 'isbn'].includes(k)) keep[k] = v;
		list[i] = { ...writePreset({ ...op.preset, name: str(old.name) }), ...keep };
		return list;
	}
	if (op.kind === 'rename') {
		const to = op.to.trim();
		if (!to || (!same(to, op.name) && taken().some((t) => same(t, to)))) return list;
		list[i] = { ...(list[i] as Entry), name: to };
		return list;
	}
	if (taken().length <= 1) return list;
	list.splice(i, 1);
	return list;
}

/** Is a page or a note of front or back matter in this export? `key`: a made page's words, or a note's link target. */
export function takes(p: Preset, key: string, byDefault: boolean, resolve: (link: string) => string = (l) => l): boolean {
	if (!p.leaveOut) return byDefault;
	return !p.leaveOut.some((k) => { const t = k.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].trim(); return same(t, key) || (!MADE_PAGES.includes(t.toLowerCase() as typeof MADE_PAGES[number]) && same(resolve(t), key)); });
}

/** A binder's exports after something in it was renamed or moved: a folder kept as what goes out follows it (`folder`,
    old and new, as paths in the binder), and so does a note left out (`note`, old and new, as paths in the vault
    without `.md`), unless its link still leads somewhere (Obsidian's own link updating got there first). Null when
    nothing in the list names it, so nothing need be written. Never changes what it was given. */
export function followInExports(raw: unknown, o: { folder?: [string, string]; note?: [string, string]; leads: (link: string) => boolean }): unknown[] | null {
	if (!Array.isArray(raw)) return null;
	const moved = (p: string, [from, to]: [string, string]): string | null => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : null);
	let any = false;
	const out = (raw as unknown[]).map((v) => {
		if (!isEntry(v)) return v;
		const e: Entry = { ...v };
		if (o.folder && typeof e.folder === 'string') { const to = moved(e.folder.trim(), o.folder); if (to != null) { e.folder = to; any = true; } }
		if (o.note && Array.isArray(e['leave out'])) {
			const from = o.note[0], base = from.split('/').pop() ?? from;
			e['leave out'] = (e['leave out'] as unknown[]).map((k) => {
				if (typeof k !== 'string') return k;
				const m = /^\[\[([^\]|#]+)(\|[^\]]*)?\]\]$/.exec(k.trim()), target = (m ? m[1] : k).trim();
				if (MADE_PAGES.includes(target.toLowerCase() as typeof MADE_PAGES[number]) || o.leads(target)) return k;
				const to = target === base ? o.note?.[1] ?? null : moved(target, o.note);
				if (to == null) return k;
				any = true;
				return m ? `[[${to}${m[2] ?? ''}]]` : to;
			});
		}
		return e;
	});
	return any ? out : null;
}

/** The kinds a family of styles sets: a manuscript style a manuscript, a book style an ebook and a paperback. */
export const kindsOf = (family: 'book' | 'manuscript'): Kind[] => (family === 'book' ? ['ebook', 'paperback'] : ['manuscript']);
/** A binder's exports with a style renamed (or deleted, and so replaced by the one it was based on): each export of the
    family that named it names the new one. Null when none did. Never changes what it was given. */
export function renameStyleInExports(raw: unknown, family: 'book' | 'manuscript', was: string, now: string): unknown[] | null {
	if (!Array.isArray(raw)) return null;
	let any = false;
	const out = (raw as unknown[]).map((v) => {
		const p = readPreset(v);
		if (!p || !kindsOf(family).includes(p.kind) || p.style !== was || !isEntry(v)) return v;
		any = true;
		return { ...v, style: now };
	});
	return any ? out : null;
}
/** Whether a binder's exports name a style. */
export const namesStyle = (raw: unknown, family: 'book' | 'manuscript', name: string): boolean => Array.isArray(raw) && (raw as unknown[]).some((v) => { const p = readPreset(v); return !!p && kindsOf(family).includes(p.kind) && p.style === name; });
