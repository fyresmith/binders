/* The binder index: which folder is a binder, and the order of everything in it. Pure, so it can be unit-tested.

   A binder is a folder with a binder note in it: a note whose properties have `binder: 1`. Its `contents` property is
   the binder's table of contents: every note and subfolder in reading order, as paths relative to the binder folder,
   folders ending in "/". For example:

     binder: 1
     contents:
       - Prologue
       - Part One/
       - Part One/Arrival
       - Part One/The storm
       - Epilogue

   Anything in the folder that the list doesn't mention still shows, after the listed items of its folder, in name order.
   Anything the list mentions that no longer exists is ignored, and dropped the next time the list is written. */

/** The newest binder format this version reads and writes. */
export const FORMAT_VERSION = 1;

/** A binder note this version must not use: normalising it would drop what it doesn't understand. */
export class UnsupportedBinder extends Error {}

export interface BinderIndex {
	version: number;
	/** Paths relative to the binder folder, in reading order; folders end in "/". */
	contents: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Is this note's frontmatter a binder note? */
export function isBinderNote(fm: unknown): boolean {
	return isObj(fm) && 'binder' in fm;
}

/** Throws UnsupportedBinder for a binder note from a newer version of Binders. */
export function checkFormat(fm: Record<string, unknown>): void {
	const v = fm.binder;
	if (v === FORMAT_VERSION || v === true || v === null || v === '') return; // `binder:` alone, or `true`, means version 1
	if (typeof v === 'number' && Number.isInteger(v) && v > FORMAT_VERSION) throw new UnsupportedBinder(`It was made by a newer version of Binders (format ${v}). Update Binders to use it.`);
	throw new UnsupportedBinder(`Its binder version, ${JSON.stringify(v)}, isn’t one Binders knows.`);
}

/** Tidies a path from the list: forward slashes, no leading "./" or "/", no doubled slashes, no ".md". */
export function cleanPath(p: string): string {
	const q = p.replace(/\\/g, '/'), folder = /\/\s*$/.test(q);
	const parts = q.split('/').map((s) => s.trim()).filter((s) => s && s !== '.');
	if (!parts.length) return '';
	const last = parts.length - 1;
	if (!folder) parts[last] = parts[last].replace(/\.md$/i, '');
	return parts.join('/') + (folder ? '/' : '');
}

/** The index from a binder note's frontmatter. Refuses newer formats; tolerates anything else. `binderNote` is the binder
    note's own path in the binder (its name, without ".md"): it and folder notes are never part of the list. */
export function readIndex(fm: Record<string, unknown>, binderNote = ''): BinderIndex {
	checkFormat(fm);
	const raw = Array.isArray(fm.contents) ? fm.contents : [];
	const seen = new Set<string>(), contents: string[] = [];
	for (const x of raw) {
		if (typeof x !== 'string') continue;
		const p = cleanPath(x);
		if (!p || seen.has(p) || p.split('/').includes('..') || p === binderNote || isFolderNote(p)) continue;
		seen.add(p); contents.push(p);
	}
	return { version: FORMAT_VERSION, contents };
}

export const parentOf = (p: string): string => { const q = p.replace(/\/$/, ''); const i = q.lastIndexOf('/'); return i < 0 ? '' : q.slice(0, i + 1); };
export const nameOf = (p: string): string => p.replace(/\/$/, '').split('/').pop() || '';

/** Orders the children of one folder in the binder. `folder` is "" for the binder's top level or ends in "/"; `children`
    are the items actually there (notes without ".md", folders with a trailing "/"). */
export function orderChildren(contents: string[], folder: string, children: string[]): string[] {
	const rank = new Map<string, number>();
	contents.forEach((p, i) => { if (parentOf(p) === folder) rank.set(nameOf(p) + (p.endsWith('/') ? '/' : ''), i); });
	const key = (c: string) => nameOf(c) + (c.endsWith('/') ? '/' : '');
	return [...children].sort((a, b) => {
		const ra = rank.get(key(a)), rb = rank.get(key(b));
		if (ra != null && rb != null) return ra - rb;
		if (ra != null) return -1;
		if (rb != null) return 1;
		return nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: 'base' });
	});
}

/** Follows a rename or move inside the binder: the item keeps its place, and a folder's contents move with it. */
export function renameIn(contents: string[], from: string, to: string): string[] {
	const isFolder = from.endsWith('/');
	return contents.map((p) => (p === from ? to : isFolder && p.startsWith(from) ? to + p.slice(from.length) : p));
}

/** Drops an item (and, for a folder, everything in it). */
export function removeFrom(contents: string[], item: string): string[] {
	return contents.filter((p) => p !== item && !(item.endsWith('/') && p.startsWith(item)));
}

/** Puts `item` into `folder` at position `index` among that folder's listed children, keeping everything else in order.
    `known` lists every item in the binder, so ones the index doesn't mention yet get their current place written down. */
export function moveTo(contents: string[], known: string[], item: string, folder: string, index: number): string[] {
	const moved = (folder + nameOf(item) + (item.endsWith('/') ? '/' : ''));
	// write every existing item into the list first, in the order they show, so the move has a complete order to work with
	let list = [...contents.filter((p) => known.includes(p))];
	for (const k of known) if (!list.includes(k)) list = insertInFolder(list, k, Infinity);
	const kids = item.endsWith('/') ? list.filter((p) => p !== item && p.startsWith(item)) : [];
	list = removeFrom(list, item);
	const renamedKids = kids.map((p) => moved + p.slice(item.length));
	list = insertInFolder(list, moved, index);
	const at = list.indexOf(moved) + 1;
	return [...list.slice(0, at), ...renamedKids, ...list.slice(at)];
}

/** Inserts `p` as the `index`th child of its folder (Infinity: last), after that sibling's own contents. */
function insertInFolder(list: string[], p: string, index: number): string[] {
	const folder = parentOf(p), siblings = list.filter((x) => parentOf(x) === folder);
	if (index < siblings.length) { const at = list.indexOf(siblings[Math.max(0, index)]); return [...list.slice(0, at), p, ...list.slice(at)]; }
	// after the last sibling and everything inside it, or right after the folder itself
	let at = folder ? list.indexOf(folder) + 1 : 0;
	if (siblings.length) { const last = siblings[siblings.length - 1]; at = list.indexOf(last) + 1; if (last.endsWith('/')) while (at < list.length && list[at].startsWith(last)) at++; }
	else if (folder && at === 0) at = list.length;
	else if (!folder) at = list.length;
	return [...list.slice(0, at), p, ...list.slice(at)];
}

/* Folder notes. A subfolder's folder note is the note directly inside it with the folder's name ("Part One/Part One");
   it holds the folder's own synopsis, status and label. The binder note is the binder folder's folder note. Neither is
   a scene: they never appear in the list, the binder views or the reading order. */

/** The folder note of a folder in the binder ("Part One/" → "Part One/Part One"); "" for the binder's top level. */
export const folderNoteOf = (folder: string): string => (folder ? folder + nameOf(folder) : '');

/** Is this path (relative to the binder) a subfolder's folder note? */
export function isFolderNote(p: string): boolean {
	if (!p || p.endsWith('/')) return false;
	const parent = parentOf(p);
	return !!parent && nameOf(p) === nameOf(parent);
}

/** An item's path relative to a binder folder, as the list writes it, or null if it isn't inside it. */
export function relPath(binderFolder: string, path: string, isFolder: boolean): string | null {
	if (!binderFolder || !path.startsWith(binderFolder + '/')) return null;
	const r = path.slice(binderFolder.length + 1);
	if (!r) return null;
	return isFolder ? r + '/' : r.replace(/\.md$/i, '');
}

/** Every item in the binder in reading order, depth first. `childrenOf` gives the items in a folder ("" for the top). */
export function readingOrder(contents: string[], childrenOf: (folder: string) => string[]): string[] {
	const out: string[] = [];
	const walk = (folder: string) => {
		for (const c of orderChildren(contents, folder, childrenOf(folder))) { out.push(c); if (c.endsWith('/')) walk(c); }
	};
	walk('');
	return out;
}

/** A change to the list waiting to be written. Kept as data so a batch applies to whatever the binder note says when
    it is written, not to a copy an external edit may have made stale. */
export type ListOp =
	| { op: 'rename'; from: string; to: string }
	| { op: 'remove'; item: string }
	| { op: 'append'; item: string }
	| { op: 'move'; item: string; folder: string; index: number };

/** Applies a batch of changes. `known` is every item in the binder in the order it shows, for moves. An item appended
    along with its folder (a folder moved into the binder) isn't written separately: it comes in with the folder. */
export function applyOps(contents: string[], ops: ListOp[], known: string[]): string[] {
	const folders = ops.flatMap((o) => (o.op === 'append' && o.item.endsWith('/') ? [o.item] : []));
	const withFolder = (p: string) => folders.some((f) => f !== p && p.startsWith(f));
	let list = contents;
	for (const o of ops) {
		if (o.op === 'rename') list = renameIn(list, o.from, o.to);
		else if (o.op === 'remove') list = removeFrom(list, o.item);
		else if (o.op === 'append') { if (!list.includes(o.item) && !withFolder(o.item)) list = insertInFolder(list, o.item, Infinity); }
		else list = moveTo(list, known, o.item, o.folder, o.index);
	}
	return list;
}

/** Where an item sits among its folder's children, and where one step up or down would put it (null: it can't move). */
export function stepIndex(siblings: string[], item: string, delta: number): number | null {
	const i = siblings.indexOf(item), j = i + delta;
	return i < 0 || j < 0 || j >= siblings.length ? null : j;
}
