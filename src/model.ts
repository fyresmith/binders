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

/** The index from a binder note's frontmatter. Refuses newer formats; tolerates anything else. */
export function readIndex(fm: Record<string, unknown>): BinderIndex {
	checkFormat(fm);
	const raw = Array.isArray(fm.contents) ? fm.contents : [];
	const seen = new Set<string>(), contents: string[] = [];
	for (const x of raw) {
		if (typeof x !== 'string') continue;
		const p = cleanPath(x);
		if (!p || seen.has(p) || p.split('/').includes('..')) continue;
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
