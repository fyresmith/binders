import { parts } from './scene-text';
import { compare } from './snapshot-text';

/* A snapshot of a folder, or of the whole binder: everything in it as it stood, in its order. The rules for its file
   and for comparing two states of a folder, pure so they can be unit-tested.

   One snapshot is one plain-text file, "<when> <name>.binder-snapshot", kept in the binder's "Snapshots" folder under
   the folder's own path, beside the snapshots of its notes (docs/dev/file-format.md). It opens with a few properties,
   then every item in the binder's order: a line of "=====" that says what the item is, how long it is and a
   fingerprint of it, and then, for a note, the note's file exactly as it was. It is read by those lengths, so nothing a
   note says can be mistaken for the next item, and each note is checked against its fingerprint. A file is written
   once and never changed. */

export const BINDER_SNAPSHOT_EXT = 'binder-snapshot';
/** The format of the file. A newer one is listed and never opened, renamed, thinned or deleted. */
export const BINDER_SNAPSHOT_FORMAT = 1;

export type Kind = 'folder' | 'note' | 'file';
export type Role = '' | 'binder note' | 'folder note';

/** One item of a folder as it stood (or as it stands). */
export interface Entry {
	/** Its path in the folder the snapshot is of: a folder's ends in "/", a note's in ".md". */
	path: string;
	kind: Kind;
	/** A note that holds a folder's own data: the binder's, or a folder's. */
	role: Role;
	/** A note's whole file, properties and text (a byte-order mark and its line endings as they were). Null for a
	    folder and for a file that isn't a note: that is listed, not kept. */
	text: string | null;
	/** A fingerprint of the file ("" for a folder or a file that isn't a note). */
	hash: string;
	/** A note's length in characters (as JavaScript counts them); another file's size in bytes. */
	size: number;
}

export interface Head {
	format: number;
	/** The folder it is of, as a path in the binder ("" for the binder itself), and the binder's name. */
	of: string;
	binder: string;
	taken: number;
	/** Why it was taken, when Binders took it unasked ("Before bringing back …"); "" when the writer did. */
	why: string;
	notes: number;
	words: number;
}

export class NewerSnapshot extends Error {}

/** A fingerprint of a text: sixteen hex digits. Enough to tell that a file is still what was written (a slip of the
    hand in an editor, a sync that cut it short); not a seal against someone who means to deceive. */
export function fingerprint(text: string): string {
	let a = 0x811c9dc5, b = 0x01000193 ^ text.length;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		a = Math.imul(a ^ c, 0x01000193);
		b = Math.imul(b ^ c, 0x85ebca6b) + ((b << 13) | (b >>> 19)) | 0;
	}
	return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

const p2 = (n: number) => String(n).padStart(2, '0');
const stamp = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };

const RULE = '=====';
const what = (e: Entry): string => (e.kind === 'note' ? e.role || 'note' : e.kind);

/** The line that opens an item. */
const opener = (e: Entry): string => `${RULE} ${JSON.stringify(e.path)} | ${what(e)}${e.kind === 'note' ? ` | ${e.size} characters | ${e.hash}` : e.kind === 'file' ? ` | ${e.size} bytes` : ''} ${RULE}`;

/** A snapshot's file as text. */
export function writeFolderSnapshot(head: Head, entries: Entry[]): string {
	const out: string[] = [
		'---',
		`binder-snapshot: ${head.format}`,
		`binder: ${JSON.stringify(head.binder)}`,
		`of: ${JSON.stringify(head.of)}`,
		`taken: ${stamp(head.taken)}`,
		...(head.why ? [`why: ${JSON.stringify(head.why)}`] : []),
		`notes: ${head.notes}`,
		`words: ${head.words}`,
		'---',
		`Everything in “${head.of || head.binder}” as it stood, in its order. Each item starts at a line of ${RULE} that says what it is and how long; a note’s file follows, exactly as it was.`,
		'',
		'',
	];
	let text = out.join('\n');
	for (const e of entries) {
		text += opener(e) + '\n';
		if (e.kind === 'note') text += (e.text ?? '') + '\n';
	}
	return text;
}

const OPENER = /^===== ("(?:[^"\\]|\\.)*") \| (folder|file|note|binder note|folder note)(?: \| (\d+) (?:characters|bytes))?(?: \| ([0-9a-f]+))? =====$/;

/** The properties at the head of a snapshot's file, and where the items start. Throws `NewerSnapshot` for a format
    this version doesn't read. */
export function readHead(text: string): { head: Head; from: number } {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
	if (!m || !/^binder-snapshot:/m.test(m[1])) throw new Error('This isn’t a snapshot of a folder.');
	const prop = (key: string): string => new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(m[1])?.[1].trim() ?? '';
	const str = (key: string): string => { const v = prop(key); try { return v.startsWith('"') ? JSON.parse(v) as string : v; } catch { return v; } };
	const format = Number(prop('binder-snapshot'));
	if (!Number.isInteger(format) || format < 1) throw new Error('This snapshot’s format can’t be read.');
	if (format > BINDER_SNAPSHOT_FORMAT) throw new NewerSnapshot(`This snapshot was made by a newer version of Binders (format ${format}). Update Binders to open it.`);
	const at = Date.parse(prop('taken'));
	// (the line that says what the file is, and the blank line after it)
	const rest = text.slice(m[0].length), intro = /^[^\n]*\n\n/.exec(rest);
	return { head: { format, of: str('of'), binder: str('binder'), taken: Number.isNaN(at) ? 0 : at, why: str('why'), notes: Number(prop('notes')) || 0, words: Number(prop('words')) || 0 }, from: m[0].length + (intro && !intro[0].startsWith(RULE) ? intro[0].length : 0) };
}

/** A snapshot's file read back: its items in their order, each note's file as it was. `damaged` names the notes whose
    text is not what the file says it holds (a file changed by hand, or cut short): they are still given, as far as
    they can be read, and nothing is brought back from a snapshot that has any. */
export function parseFolderSnapshot(text: string): { head: Head; entries: Entry[]; damaged: string[] } {
	// A tool that rewrites line endings (git's "autocrlf" on Windows does, to every text file it checks out) leaves
	// the file's own lines ending in CR LF, and every length in it wrong. Then every line break in it was made one,
	// so they are put back: a note is as it was unless it had CR LF of its own, which its fingerprint will tell.
	if (text.startsWith('---\r\n') && !/[^\r]\n/.test(text)) text = text.replace(/\r\n/g, '\n');
	const { head, from } = readHead(text), entries: Entry[] = [], damaged = new Set<string>();
	let at = from;
	while (at < text.length) {
		const eol = text.indexOf('\n', at), line = text.slice(at, eol < 0 ? text.length : eol), m = OPENER.exec(line);
		if (!m) {
			// not where an item starts: the file was changed by hand. The next line that opens one is taken up from.
			const next = text.slice(at).search(/^===== "/m);
			if (entries.length) damaged.add(entries[entries.length - 1].path);
			if (next <= 0) break;
			at += next;
			continue;
		}
		at = eol < 0 ? text.length : eol + 1;
		const kind: Kind = m[2] === 'folder' ? 'folder' : m[2] === 'file' ? 'file' : 'note';
		let path: string;
		try { path = JSON.parse(m[1]) as string; } catch { continue; }
		const e: Entry = { path, kind, role: m[2] === 'binder note' || m[2] === 'folder note' ? m[2] : '', text: null, hash: m[4] ?? '', size: Number(m[3] ?? 0) };
		if (kind === 'note') {
			e.text = text.slice(at, at + e.size);
			at += e.size + 1;
			if (e.text.length !== e.size || fingerprint(e.text) !== e.hash) damaged.add(e.path);
		}
		entries.push(e);
	}
	// (a file cut short has fewer notes than it says)
	if (entries.filter((e) => e.kind === 'note' && !e.role).length !== head.notes && !damaged.size) damaged.add('');
	return { head, entries, damaged: [...damaged] };
}

// ---- what changed between two states of a folder ----

export interface Row {
	/** The item as it stood, and as it stands: one of them null for an item only one state has. */
	then: Entry | null;
	now: Entry | null;
	kind: Kind;
	depth: number;
	/** Its name as it stood (as it stands, for one that is new). */
	name: string;
	/** Not in the later state / not in the earlier one. */
	gone: boolean;
	fresh: boolean;
	/** Its text is different, by this many words put in and taken out. */
	rewritten: boolean;
	added: number;
	removed: number;
	/** It has another name now (`to`), or is in another folder (`into`: that folder's path, "" for the top). */
	renamed: string | null;
	into: string | null;
	/** It is at another place among the items of its folder. */
	reordered: boolean;
	/** The properties that are different, by name. (A folder's are its folder note's; "text" is that note's own text.) */
	props: string[];
	/** A folder: how many items in it are different in any way. */
	inside: number;
}

export interface Changes {
	rows: Row[];
	rewritten: number; added: number; removed: number;
	fresh: number; gone: number; moved: number; renamed: number; props: number;
	/** Nothing is different. */
	same: boolean;
}

const dirOf = (path: string): string => { const p = path.replace(/\/$/, ''), i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); };
const nameOf = (path: string): string => path.replace(/\/$/, '').slice(dirOf(path).length).replace(/\.md$/i, '');
const paragraphs = (body: string): string[] => body.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter((l) => l);

/** A note's properties by name, each as its lines are written. */
function properties(yaml: string): Map<string, string> {
	const out = new Map<string, string>();
	let key = '';
	for (const line of yaml.replace(/\r\n?/g, '\n').split('\n')) {
		const m = /^([^\s#-][^:]*):(.*)$/.exec(line);
		if (m) { key = m[1].trim(); out.set(key, m[2].trim()); }
		else if (key && line.trim()) out.set(key, out.get(key) + '\n' + line.trimEnd());
	}
	return out;
}

/** The names of the properties two notes differ in. The binder's order is not one of them: it is said by what moved.
    With `yaml` (Obsidian's reader) values are compared as they read, so a block Obsidian has written again in its own
    form (other quotes, another indent) is not a change; without it, as they are written. */
function propsChanged(a: string, b: string, yaml?: (text: string) => unknown): string[] {
	const read = (text: string): Map<string, string> => {
		if (yaml) { try { const v = yaml(text); if (v && typeof v === 'object' && !Array.isArray(v)) return new Map(Object.entries(v).map(([k, x]) => [k, JSON.stringify(x)])); if (!text.trim()) return new Map(); } catch { /* as written */ } }
		return properties(text);
	};
	const x = read(a), y = read(b), out: string[] = [];
	for (const k of new Set([...x.keys(), ...y.keys()])) if (x.get(k) !== y.get(k) && k !== 'contents' && k !== 'longform') out.push(k);
	return out;
}

/** The words put in and taken out between two texts, counted as "Show changes" marks them: in a paragraph that was
    reworded, the words that changed; a paragraph put in or taken out, all of it. */
function wordsChanged(before: string, after: string): [number, number] {
	let added = 0, removed = 0;
	const count = (s: string) => s.match(/\S+/g)?.length ?? 0, rows = compare(before, after);
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i], next = rows[i + 1];
		if (r.kind === 'same') continue;
		// (a reworded paragraph comes as its old self then its new one, each in pieces; one side may have nothing marked)
		if (r.kind === 'old' && next?.kind === 'new' && (r.pieces.length > 1 || next.pieces.length > 1)) {
			removed += r.pieces.reduce((n, p) => n + (p.changed ? count(p.text) : 0), 0);
			added += next.pieces.reduce((n, p) => n + (p.changed ? count(p.text) : 0), 0);
			i++;
			continue;
		}
		const n = r.pieces.reduce((s, p) => s + count(p.text), 0);
		if (r.kind === 'old') removed += n; else added += n;
	}
	return [added, removed];
}

/** The longest run of `seq` whose values only rise: its indexes. */
function rising(seq: number[]): Set<number> {
	const ends: number[] = [], before = new Array<number>(seq.length).fill(-1);
	seq.forEach((v, k) => {
		let lo = 0, hi = ends.length;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (seq[ends[mid]] < v) lo = mid + 1; else hi = mid; }
		if (lo > 0) before[k] = ends[lo - 1];
		ends[lo] = k;
	});
	const out = new Set<number>();
	for (let k = ends.length ? ends[ends.length - 1] : -1; k >= 0; k = before[k]) out.add(k);
	return out;
}

/** Under this share of paragraphs in common, two notes of different names are two notes, not one renamed. */
const SAME_NOTE = 0.5;

/** What is different between a folder as it stood (`then`) and as it stands (`now`), item by item, in the order it
    stood in, with what has come since put in where it is now.

    Nothing in a note says which note it is, so a note is followed as git follows a file: one at the same path is the
    same note (unless its text is another's altogether and its own is found elsewhere); else one with the very same
    text; else the one that shares most of its paragraphs. A folder is followed by where its notes went. */
export function changes(then: Entry[], now: Entry[], opts: { words?: boolean; yaml?: (text: string) => unknown } = {}): Changes {
	const T = then.filter((e) => !e.role), N = now.filter((e) => !e.role);
	const nowAt = new Map(N.map((e) => [e.path, e])), pair = new Map<Entry, Entry>(), back = new Map<Entry, Entry>();
	const join = (a: Entry, b: Entry) => { pair.set(a, b); back.set(b, a); };
	const bodyOf = new Map<Entry, string[]>();
	const paras = (e: Entry): string[] => { let p = bodyOf.get(e); if (!p) bodyOf.set(e, p = paragraphs(parts(e.text ?? '').body)); return p; };
	const share = (a: Entry, b: Entry): number => {
		const x = paras(a), y = new Set(paras(b));
		if (!x.length || !y.size) return 0;
		return x.filter((p) => y.has(p)).length / Math.max(x.length, y.size);
	};
	const notesT = T.filter((e) => e.kind !== 'folder'), notesN = N.filter((e) => e.kind !== 'folder');
	// the same path and the same file; then the same path and mostly the same text (or too little text to tell)
	for (const a of notesT) { const b = nowAt.get(a.path); if (b && b.kind === a.kind && a.hash === b.hash) join(a, b); }
	const leftT = () => notesT.filter((e) => !pair.has(e)), leftN = () => notesN.filter((e) => !back.has(e));
	// (nothing left to tell apart: the paragraphs needn't be read at all)
	const thenAt = new Map(T.map((e) => [e.path, e]));
	const loose = leftN().some((b) => !thenAt.has(b.path)) || leftT().some((a) => !nowAt.has(a.path));
	for (const a of leftT()) {
		const b = nowAt.get(a.path);
		if (!b || back.has(b) || b.kind !== a.kind) continue;
		if (!loose || a.kind === 'file' || paras(a).length < 3 || paras(b).length < 3 || share(a, b) >= SAME_NOTE) join(a, b);
	}
	if (loose) {
		// the very same file under another name or in another folder
		const byHash = new Map<string, Entry[]>();
		for (const b of leftN()) if (b.kind === 'note' && b.hash && (b.text ?? '').trim()) byHash.set(b.hash, [...(byHash.get(b.hash) ?? []), b]);
		for (const a of leftT()) {
			const same = (byHash.get(a.hash) ?? []).filter((b) => !back.has(b));
			if (a.kind !== 'note' || !same.length) continue;
			join(a, same.find((b) => nameOf(b.path) === nameOf(a.path)) ?? same[0]);
		}
		// the one that shares most of its paragraphs
		const has = new Map<string, Entry[]>();
		for (const b of leftN()) if (b.kind === 'note') for (const p of new Set(paras(b))) has.set(p, [...(has.get(p) ?? []), b]);
		const found: { a: Entry; b: Entry; share: number }[] = [];
		for (const a of leftT()) {
			if (a.kind !== 'note') continue;
			const seen = new Set<Entry>();
			for (const p of new Set(paras(a))) for (const b of has.get(p) ?? []) seen.add(b);
			for (const b of seen) { const s = share(a, b); if (s >= SAME_NOTE) found.push({ a, b, share: s }); }
		}
		for (const f of found.sort((x, y) => y.share - x.share)) if (!pair.has(f.a) && !back.has(f.b)) join(f.a, f.b);
		// what is left at the same path is the same note, written again from nothing
		for (const a of leftT()) { const b = nowAt.get(a.path); if (b && !back.has(b) && b.kind === a.kind) join(a, b); }
	}
	// folders: the same path; else where most of what was in it is now, deepest first (so a folder's folders count)
	const foldersT = T.filter((e) => e.kind === 'folder'), foldersN = new Set(N.filter((e) => e.kind === 'folder'));
	for (const a of foldersT) { const b = nowAt.get(a.path); if (b && foldersN.has(b)) join(a, b); }
	const kidsT = new Map<string, Entry[]>();
	for (const e of T) kidsT.set(dirOf(e.path), [...(kidsT.get(dirOf(e.path)) ?? []), e]);
	for (const a of foldersT.filter((e) => !pair.has(e)).sort((x, y) => y.path.length - x.path.length)) {
		const votes = new Map<string, number>();
		for (const k of kidsT.get(a.path) ?? []) { const to = pair.get(k); if (to) votes.set(dirOf(to.path), (votes.get(dirOf(to.path)) ?? 0) + 1); }
		const best = [...votes].sort((x, y) => y[1] - x[1])[0], b = best ? nowAt.get(best[0]) : undefined;
		if (b && foldersN.has(b) && !back.has(b)) join(a, b);
	}
	// a folder's own note goes with its folder (the folder snapshotted has it at its top)
	const noteOf = (list: Entry[]) => new Map(list.filter((e) => e.role).map((e) => [dirOf(e.path), e]));
	const ownT = noteOf(then), ownN = noteOf(now);

	// where a folder as it stood is now ("" stays ""), and each folder's items as they stand
	const dirNow = (dir: string): string | null => { if (!dir) return ''; const a = thenAt.get(dir), b = a ? pair.get(a) : undefined; return b ? b.path : null; };
	const kidsN = new Map<string, Entry[]>();
	for (const e of N) kidsN.set(dirOf(e.path), [...(kidsN.get(dirOf(e.path)) ?? []), e]);
	const out: Changes = { rows: [], rewritten: 0, added: 0, removed: 0, fresh: 0, gone: 0, moved: 0, renamed: 0, props: 0, same: true };
	const countWords = opts.words !== false;

	const row = (a: Entry | null, b: Entry | null, depth: number): Row => {
		const e = (a ?? b), r: Row = { then: a, now: b, kind: e.kind, depth, name: nameOf(e.path), gone: !b, fresh: !a, rewritten: false, added: 0, removed: 0, renamed: null, into: null, reordered: false, props: [], inside: 0 };
		if (a && b) {
			if (nameOf(a.path) !== nameOf(b.path)) r.renamed = nameOf(b.path);
			const was = dirNow(dirOf(a.path));
			if (was !== dirOf(b.path)) r.into = dirOf(b.path);
			const x = a.kind === 'folder' ? ownT.get(a.path) ?? null : a, y = b.kind === 'folder' ? ownN.get(b.path) ?? null : b;
			if (a.kind !== 'file' && (x?.hash ?? '') !== (y?.hash ?? '')) {
				const p = parts(x?.text ?? ''), q = parts(y?.text ?? '');
				r.props = propsChanged(p.yaml, q.yaml, opts.yaml);
				if (p.body.replace(/\r\n?/g, '\n') !== q.body.replace(/\r\n?/g, '\n')) {
					if (a.kind === 'folder') r.props.push('text');
					else { r.rewritten = true; if (countWords) [r.added, r.removed] = wordsChanged(p.body, q.body); }
				}
			} else if (a.kind === 'file' && a.size !== b.size) r.rewritten = true;
		}
		return r;
	};
	const walk = (dirThen: string | null, dirN: string | null, depth: number): number => {
		const was = dirThen == null ? [] : kidsT.get(dirThen) ?? [], is = dirN == null ? [] : kidsN.get(dirN) ?? [];
		// which of the items that are in this folder both times kept their order
		const here = new Set(was), stayed = was.filter((a) => { const b = pair.get(a); return !!b && dirOf(b.path) === dirN; }), both = new Set(stayed);
		const place = new Map(is.map((b, i) => [b, i])), kept = rising(stayed.map((a) => place.get(pair.get(a)) ?? 0));
		const inOrder = new Set(stayed.filter((_, i) => kept.has(i)));
		// what has come since goes in after the item it now follows
		const after = new Map<Entry | null, Entry[]>();
		let last: Entry | null = null;
		for (const b of is) { const a = back.get(b); if (!a) after.set(last, [...(after.get(last) ?? []), b]); else if (here.has(a)) last = a; }
		let different = 0;
		const put = (a: Entry | null, b: Entry | null) => {
			const r = row(a, b, depth);
			if (a && b && both.has(a) && !inOrder.has(a)) r.reordered = true;
			out.rows.push(r);
			if (r.kind === 'folder') r.inside = walk(a ? a.path : null, b ? b.path : null, depth + 1);
			const own = r.gone || r.fresh || r.rewritten || !!r.renamed || r.into != null || r.reordered || r.props.length > 0;
			if (r.kind !== 'folder' || own) {
				if (r.gone) out.gone++; else if (r.fresh) out.fresh++;
				if (r.rewritten) { out.rewritten++; out.added += r.added; out.removed += r.removed; }
				if (r.renamed) out.renamed++;
				if (r.into != null || r.reordered) out.moved++;
				if (r.props.length) out.props++;
			}
			if (own || r.inside) different += r.kind === 'folder' ? r.inside + (own ? 1 : 0) : 1;
		};
		for (const b of after.get(null) ?? []) put(null, b);
		for (const a of was) { put(a, pair.get(a) ?? null); for (const b of after.get(a) ?? []) put(null, b); }
		return different;
	};
	// the folder's own note first: its properties (a binder's target, a folder's synopsis) are the folder's
	const top = walk('', '', 0), a = ownT.get('') ?? null, b = ownN.get('') ?? null;
	let own: string[] = [];
	if ((a?.hash ?? '') !== (b?.hash ?? '')) {
		const p = parts(a?.text ?? ''), q = parts(b?.text ?? '');
		own = propsChanged(p.yaml, q.yaml, opts.yaml);
		if (p.body.replace(/\r\n?/g, '\n') !== q.body.replace(/\r\n?/g, '\n')) own.push('text');
	}
	if (own.length) {
		out.rows.unshift({ then: a, now: b, kind: 'note', depth: 0, name: nameOf((a ?? b).path), gone: false, fresh: false, rewritten: false, added: 0, removed: 0, renamed: null, into: null, reordered: false, props: own, inside: 0 });
		out.props++;
	}
	out.same = !top && !own.length;
	return out;
}
