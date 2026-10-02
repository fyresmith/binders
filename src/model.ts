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

/** A binder note read: its format version and its order. */
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

/** Tidies a path from the list: forward slashes, no leading "./" or "/", no doubled slashes, no ".md". A name keeps
    its own spaces, at its start and end too (" Lead", "Trail "): a file can be named so, and an entry that had them
    taken off would no longer name it. */
export function cleanPath(p: string): string {
	const q = p.replace(/\\/g, '/'), folder = /\/\s*$/.test(q);
	const parts = q.split('/').filter((s) => s.trim() && s.trim() !== '.');
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
		// a name typed by hand that YAML reads as a number (a note called "1984") is still that name
		if (typeof x !== 'string' && !(typeof x === 'number' && Number.isFinite(x))) continue;
		const p = cleanPath(String(x));
		if (!p || seen.has(p) || p.split('/').includes('..') || p === binderNote || isFolderNote(p)) continue;
		seen.add(p); contents.push(p);
	}
	return { version: FORMAT_VERSION, contents };
}

/** Entries typed by hand with stray spaces round a name ("  Prologue  ") are still read: an entry that names nothing as
    it stands, and names an item once the spaces round each of its names are off, is taken for that item. One that
    names an item as it stands is left alone (a file can be called " Lead" or "Trail "). `exists` says whether a path
    names an item of the binder. */
export function settleNames(contents: string[], exists: (p: string) => boolean): string[] {
	let out: string[] | null = null;
	contents.forEach((p, i) => {
		const t = p.split('/').map((s) => s.trim()).join('/');
		if (t !== p && !exists(p) && exists(t)) (out ??= [...contents])[i] = t;
	});
	return out ? [...new Set(out)] : contents;
}

/** The folder part of a path in the list, with its trailing "/" ("" at the top). */
export const parentOf = (p: string): string => { const q = p.replace(/\/$/, ''); const i = q.lastIndexOf('/'); return i < 0 ? '' : q.slice(0, i + 1); };
/** The last name in a path of the list, without a trailing "/". */
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
		// what the list doesn't mention: folders first, then notes, each by name, as the file explorer has them (and as
		// "Make this folder a binder" writes them down)
		if (a.endsWith('/') !== b.endsWith('/')) return a.endsWith('/') ? -1 : 1;
		return nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: 'base' });
	});
}

/** Follows a rename or move inside the binder: the item keeps its place, and a folder's contents move with it. */
export function renameIn(contents: string[], from: string, to: string): string[] {
	const isFolder = from.endsWith('/');
	return contents.map((p) => (p === from ? to : isFolder && p.startsWith(from) ? to + p.slice(from.length) : p));
}

/** Follows a move to another folder of the binder: the item goes last there, as one moved in from outside does, and a
    folder's contents move with it. An item the list doesn't mention stays unlisted. */
export function relocate(contents: string[], from: string, to: string): string[] {
	if (!contents.includes(from)) return renameIn(contents, from, to);
	// a folder's items, including any already reported renamed into it
	const inside = (p: string) => from.endsWith('/') && p !== from && p !== to && (p.startsWith(from) || p.startsWith(to));
	const kids = contents.filter(inside).map((p) => (p.startsWith(from) ? to + p.slice(from.length) : p));
	const list = insertInFolder(contents.filter((p) => p !== from && p !== to && !inside(p)), to, Infinity);
	const at = list.indexOf(to) + 1;
	return [...list.slice(0, at), ...kids, ...list.slice(at)];
}

/** Follows a copy of a folder made beside it (`from` and `to` both end in "/"): the copy goes right after the folder it's
    a copy of, and what's in it takes that folder's order. An entry is written for everything the original lists,
    whether or not its copy is there yet: files are copied one by one, and an entry for a file that never arrives is
    dropped when the list is written, like any other that names nothing.
    What the list already says about the copy is kept: a copy that's listed stays where it is, and its entries stay in
    the order they have (another device may have made the copy, reordered it and sent the list along). Only entries it
    lacks are added, each after the entry that comes before it in the original. Nothing else in the list moves, and
    an original that isn't listed has no order to give. */
export function copyIn(contents: string[], from: string, to: string): string[] {
	if (!from.endsWith('/') || !to.endsWith('/') || from === to || !contents.includes(from)) return contents;
	const mirrored = contents.filter((p) => p !== from && p.startsWith(from)).map((p) => to + p.slice(from.length));
	const inCopy = (p: string) => p === to || p.startsWith(to);
	const mine = contents.filter((p) => p !== to && p.startsWith(to)), have = new Set(mine), was = contents.indexOf(to);
	// each entry the copy lacks, by the entry it follows: the nearest before it in the original that the copy has ("": none)
	const added = new Map<string, string[]>();
	let anchor = '', lacks = false;
	for (const m of mirrored) {
		if (have.has(m)) { anchor = m; continue; }
		lacks = true;
		const run = added.get(anchor);
		if (run) run.push(m); else added.set(anchor, [m]);
	}
	if (was >= 0 && !lacks) return contents;
	const block = [to, ...(added.get('') ?? []), ...mine.flatMap((p) => [p, ...(added.get(p) ?? [])])];
	const rest = contents.filter((p) => !inCopy(p));
	// where the copy is listed already, or after the original and everything in it
	let at = contents.slice(0, Math.max(0, was)).filter((p) => !inCopy(p)).length;
	if (was < 0) rest.forEach((p, i) => { if (p === from || p.startsWith(from)) at = i + 1; });
	return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** Gives an item that was deleted and made again its place back: after the entry that stood before it in its folder
    (`prev`; a folder's own entries go with it), or before the one that stood after it (`next`), or first if it was
    first, or last. Only if the list doesn't mention the item: a list that came in with the item (a sync, a checkout)
    already says where it goes, and is left as it is. */
export function restoreIn(contents: string[], item: string, prev: string | null, next: string | null): string[] {
	if (contents.includes(item)) return contents;
	let at = -1;
	if (prev != null && contents.includes(prev)) {
		at = contents.indexOf(prev) + 1;
		if (prev.endsWith('/')) while (at < contents.length && contents[at].startsWith(prev)) at++;
	} else if (next != null && contents.includes(next)) at = contents.indexOf(next);
	else if (prev == null) { const first = contents.findIndex((p) => parentOf(p) === parentOf(item)); if (first >= 0) at = first; }
	return at < 0 ? insertInFolder(contents, item, Infinity) : [...contents.slice(0, at), item, ...contents.slice(at)];
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
	// (sets, not includes(): a binder of a thousand notes would take a million comparisons per move)
	const isKnown = new Set(known);
	let list = contents.filter((p) => isKnown.has(p));
	const listed = new Set(list);
	for (const k of known) if (!listed.has(k)) { list = insertInFolder(list, k, Infinity); listed.add(k); }
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

/** An item as the list writes it. Reading drops one ".md", so a note whose own name ends in ".md" ("notes.md.md", which
    `relPath` gives as "notes.md") is written with its full name, to read back as itself. */
export const diskPath = (p: string): string => (!p.endsWith('/') && /\.md$/i.test(p) ? p + '.md' : p);

/** A change to the list waiting to be written. Kept as data so a batch applies to whatever the binder note says when
    it is written, not to a copy an external edit may have made stale. */
export type ListOp =
	| { op: 'rename'; from: string; to: string }
	| { op: 'remove'; item: string }
	/** `inner`: a folder's own entries, in order (one moved from another binder brings its order along). */
	| { op: 'append'; item: string; inner?: string[] }
	/** A file deleted and made again a moment later, back where it stood (see `restoreIn`). */
	| { op: 'restore'; item: string; prev: string | null; next: string | null }
	/** A folder copied beside itself by something other than Binders (see `copyIn`). */
	| { op: 'copy'; from: string; to: string }
	/** `known`: every item in the binder when the move was made, in the order they showed. A move is worked out against
	    that, not against the binder as it is when the list is written: by then a later change (a rename, a folder gone)
	    may have taken away the very entries the move counts its place among. */
	| { op: 'move'; item: string; folder: string; index: number; known?: string[] };

/** Applies a batch of changes. `known` is every item in the binder in the order it shows, for moves. An item appended
    along with its folder (a folder moved into the binder) isn't written separately: it comes in with the folder. */
export function applyOps(contents: string[], ops: ListOp[], known: string[]): string[] {
	const folders = ops.flatMap((o) => (o.op === 'append' && o.item.endsWith('/') ? [o.item] : []));
	const withFolder = (p: string) => folders.some((f) => f !== p && p.startsWith(f));
	// a folder's items are reported renamed one by one, before or after it: they keep their place in it
	const carried = (o: { from: string; to: string }) => ops.some((f) => f !== o && f.op === 'rename' && f.from.endsWith('/') && o.from.startsWith(f.from) && o.to === f.to + o.from.slice(f.from.length));
	let list = contents;
	for (const o of ops) {
		if (o.op === 'rename') {
			// an item put somewhere and renamed before the list was written: a move wrote in everything that exists, its
			// new name too, so the entry under that name goes and the one that was put stays, at its place
			if (list.includes(o.from) && list.includes(o.to)) list = list.filter((p) => p !== o.to);
			list = parentOf(o.from) !== parentOf(o.to) && !carried(o) ? relocate(list, o.from, o.to) : renameIn(list, o.from, o.to);
		}
		else if (o.op === 'remove') list = removeFrom(list, o.item);
		else if (o.op === 'restore') list = restoreIn(list, o.item, o.prev, o.next);
		else if (o.op === 'copy') list = copyIn(list, o.from, o.to);
		else if (o.op === 'append') {
			if (list.includes(o.item) || withFolder(o.item)) continue;
			list = insertInFolder(list, o.item, Infinity);
			const at = list.indexOf(o.item) + 1, inner = (o.inner ?? []).filter((p) => p.startsWith(o.item) && !list.includes(p));
			list = [...list.slice(0, at), ...inner, ...list.slice(at)];
		}
		else list = moveTo(list, o.known ?? known, o.item, o.folder, o.index);
	}
	// a move writes down the place of everything: also what was made after it, while it waited to be written
	if (ops.some((o) => o.op === 'move')) {
		const listed = new Set(list);
		for (const k of known) if (!listed.has(k)) { list = insertInFolder(list, k, Infinity); listed.add(k); }
	}
	// (each entry once, whatever a run of changes did: the first place it was given)
	return [...new Set(list)];
}

/** Where an item sits among its folder's children, and where one step up or down would put it (null: it can't move). */
export function stepIndex(siblings: string[], item: string, delta: number): number | null {
	const i = siblings.indexOf(item), j = i + delta;
	return i < 0 || j < 0 || j >= siblings.length ? null : j;
}
