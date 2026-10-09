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

/** Is this a path an item of a folder can have: every step of it a name, inside the folder? A snapshot is a file like
    any other (it syncs, it can be handed on), and what is made from one is written where its paths say: so one that
    climbs out ("../"), starts at the top ("/"), or names what a vault never holds (a step that starts with a dot) is
    not an item. A backslash is a step too, as it is on Windows. A note's ends in ".md", a folder's in "/". */
export function inFolder(path: string, kind: Kind): boolean {
	const p = kind === 'folder' ? (path.endsWith('/') ? path.slice(0, -1) : '') : path;
	if (!p || p.includes('\0') || (kind === 'note' && !/\.md$/i.test(p))) return false;
	return p.split(/[/\\]/).every((step) => step.trim() !== '' && !step.trimStart().startsWith('.'));
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
		// (an item that would be somewhere else than in the folder is left out, and the file isn't as Binders wrote it)
		if (!inFolder(path, kind)) { damaged.delete(e.path); damaged.add(''); continue; }
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

// ---- bringing one back: what will be written, worked out before anything is ----

/** How much of a snapshot comes back: the notes' text, the order of the items, both, or everything ("all": each
    note's whole file, text and properties; the notes and folders that are gone, made again; the ones renamed or
    moved, put back; the order). */
export type Scope = 'all' | 'both' | 'text' | 'order';

/** What becomes of the items that are new since the snapshot, when everything comes back: they stay where they are,
    or go into one folder made for them. Nothing is deleted either way. */
export type Since = 'stay' | 'gather';

/** One note's text to put back. Both paths are in the folder the snapshot is of. */
export interface TextBack {
	/** The note as it stands (it may have another name, or be in another folder, than it had). */
	path: string;
	/** The note as it stood. */
	was: string;
	/** The text the note has now: it is replaced only while it still says this. */
	expect: string;
	/** The text it had. */
	text: string;
}

/** One folder's items to put in the order they had. */
export interface OrderBack {
	/** The folder as it stands ("" for the folder the snapshot is of; else it ends in "/"). With everything coming
	    back: the folder as it will be. */
	folder: string;
	/** Its items as they are now, and in the order wanted: the same items. (With everything coming back `from` is
	    empty: the items are not all there yet, and `items` are their paths as they will be.) */
	from: string[];
	items: string[];
}

/** An item put where it was: made again (`from` null: a folder; a note that is made again is a `FileBack`), or
    renamed or moved from where it is now. Paths in the folder the snapshot is of; a folder's ends in "/". */
export interface Place { kind: Kind; role: Role; from: string | null; to: string }

/** One note's whole file to put back, properties and text: the bytes the snapshot holds. */
export interface FileBack {
	/** Where the note will be, and where it is now (null: it is gone, and is made again). */
	path: string;
	from: string | null;
	/** Its whole file now: it is replaced only while it still says this. Null for one made again. */
	expect: string | null;
	/** Its whole file as it was. */
	text: string;
	role: Role;
	/** It is the folder's own note (a binder's binder note): written last, since the order is kept in it. */
	own: boolean;
}

/** Everything coming back: what is made, renamed, moved and written, in paths, and the rows that say so. */
export interface All {
	since: Since;
	/** The items new since that go into one folder: the folder (made if `make`), and each item's move. */
	gather: { folder: string; make: boolean; items: Place[] } | null;
	/** Folders made again, and items renamed or moved back: folders before what is in them. */
	places: Place[];
	/** Notes whose file is written as it was, or made again with it. */
	files: FileBack[];
	/** Each folder's items in the order they had, as paths they will have; what is new since after the item it
	    follows now. */
	orders: OrderBack[];
	/** Every note of the snapshot, by the path it had, with the path it will have and the one it has now (null: it
	    is gone). All of them are checked against the snapshot once the rest is done, since a rename changes the
	    links in notes that were not to be written. */
	notes: [was: string, to: string, from: string | null][];
	/** For the screen: the items made again; those that get their name back; those that go back to their folder;
	    those whose name can't come back because an item new since has it, each with the name it will have; the files
	    that are gone and can't be made again (a snapshot lists them, and keeps only notes); the items new since that
	    stay where they are, and (`gathered`) those that go to the one folder; the folders that keep a note made for them since. */
	made: Row[];
	renamed: Row[];
	moved: Row[];
	named: { row: Row; as: string }[];
	cannot: Row[];
	stays: Row[];
	gathered: Row[];
	ownStay: Row[];
	/** The rows whose properties come back. */
	props: Row[];
}

export interface Plan {
	scope: Scope;
	texts: TextBack[];
	orders: OrderBack[];
	/** The rows this is of: the notes that get their text back, and the items that go back to their place. */
	rewritten: Row[];
	moved: Row[];
	/** The words that come back, and the words written since that go. */
	back: number;
	away: number;
	/** What is different and stays as it is now, because this doesn't bring it back: items that are gone, new
	    since, in another folder, under another name, with other properties; and, when only one of the two was
	    asked for, the notes that keep their text or the items that keep their place. (With everything coming back
	    these are empty: what stays then is in `all`.) */
	left: { gone: Row[]; fresh: Row[]; elsewhere: Row[]; renamed: Row[]; props: Row[]; text: Row[]; order: Row[] };
	/** Everything coming back (scope "all"), else null. */
	all: All | null;
	/** An item says it is somewhere other than in the folder: nothing is written on the word of such a file. */
	unsafe: boolean;
	/** There is nothing to write. */
	nothing: boolean;
}

/** What a plan is worked out for, besides the two states. */
export interface BackOptions {
	/** Everything: what becomes of the items new since, and the name of the folder they would go to. */
	since?: Since;
	sinceName?: string;
	/** The folder the snapshot is read for: its path in its binder ("" for the binder itself), and its name now. */
	of?: string;
	name?: string;
}

const leaf = (path: string): string => path.replace(/\/$/, '').slice(dirOf(path).length);
const low = (s: string): string => s.toLowerCase();

/** Is this a place something may be made at, or renamed or moved to, when a snapshot is brought back: in the folder
    (`inFolder`), every step a name as a vault writes it (no backslash: that is a step on one system and a letter on
    another), and not in the binder's own folder of snapshots, where a note would make that folder a chapter. `of`:
    the folder's path in its binder ("" for the binder). */
export function mayPlace(path: string, kind: Kind, of = ''): boolean {
	if (!inFolder(path, kind) || path.includes('\\')) return false;
	return !!of || low(path.split('/')[0].trim()) !== 'snapshots';
}

/** Are two files the same but for where their links lead? Obsidian points the links to a note at its new name when
    the note is renamed, in every note that has one: so a note that says what it said, with only its links' targets
    different, has not been written in. (A link's own words, after "|" or in "[...]", are the writer's, and count.) */
export function sameButLinks(a: string, b: string): boolean {
	const plain = (s: string) => s.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\[\[[^\]\n|]*(\|[^\]\n]*)?\]\]/g, '[[$1]]').replace(/\]\([^)\n]*\)/g, ']()');
	return a === b || plain(a) === plain(b);
}

/** What bringing a snapshot back would write, and what it would leave: from what changed (`c`, of `then` against
    `now`) and nothing else, so it can be shown before it is done and worked out again just before it is.

    The text: every note that is there both times and reads differently gets the text it had, wherever it is now and
    whatever it is called. The order: in each folder that is there both times, the items that were in it then and
    are in it now go back to the order they had; an item that has come since (or come in from another folder) stays
    after the item it follows now. With those scopes nothing is made, renamed, moved to another folder or deleted.

    Everything ("all", see `everything` below): each note's file as it was, the items that are gone made again, the
    ones renamed or moved put back, the order. Nothing is deleted. */
export function planBack(c: Changes, then: Entry[], now: Entry[], scope: Scope, opts: BackOptions = {}): Plan {
	const plan: Plan = { scope, texts: [], orders: [], rewritten: [], moved: [], back: 0, away: 0, left: { gone: [], fresh: [], elsewhere: [], renamed: [], props: [], text: [], order: [] }, all: null, unsafe: false, nothing: true };
	if ([...then, ...now].some((e) => !inFolder(e.path, e.kind))) { plan.unsafe = true; return plan; }
	const own = (r: Row) => !!(r.then ?? r.now)?.role;
	const rewritten = c.rows.filter((r) => r.kind === 'note' && !own(r) && r.rewritten && r.then?.text != null && r.now?.text != null);
	const moved = c.rows.filter((r) => !own(r) && r.reordered && r.into == null);
	if (scope !== 'all') for (const r of c.rows) {
		if (own(r)) { if (r.props.length) plan.left.props.push(r); continue; }
		if (r.gone) plan.left.gone.push(r);
		else if (r.fresh) plan.left.fresh.push(r);
		if (r.into != null) plan.left.elsewhere.push(r);
		if (r.renamed) plan.left.renamed.push(r);
		if (r.props.length) plan.left.props.push(r);
	}
	if (scope === 'order') plan.left.text = rewritten;
	else {
		plan.rewritten = rewritten;
		for (const r of rewritten) {
			if (!r.then || !r.now) continue;
			// (everything: the note's whole file is written, not its text alone: see `all.files`)
			if (scope !== 'all') plan.texts.push({ path: r.now.path, was: r.then.path, expect: parts(r.now.text ?? '').body, text: parts(r.then.text ?? '').body });
			plan.back += r.removed; plan.away += r.added;
		}
	}
	if (scope === 'text') plan.left.order = moved;
	else {
		plan.moved = moved;
		// each folder as it stands: the items that were in it then, in the order they had, each followed by what
		// follows it now and wasn't
		const rowOf = new Map<Entry, Row>(), rank = new Map(then.map((e, i) => [e, i])), kids = new Map<string, Entry[]>();
		for (const r of c.rows) if (r.now && !own(r)) rowOf.set(r.now, r);
		for (const e of now) if (!e.role) kids.set(dirOf(e.path), [...(kids.get(dirOf(e.path)) ?? []), e]);
		for (const [folder, is] of kids) {
			const stayed: { e: Entry; at: number; tail: Entry[] }[] = [], head: Entry[] = [];
			for (const e of is) {
				const r = rowOf.get(e), at = r?.then && r.into == null ? rank.get(r.then) : undefined;
				if (at !== undefined) stayed.push({ e, at, tail: [] });
				else (stayed.length ? stayed[stayed.length - 1].tail : head).push(e);
			}
			const items = [...head, ...[...stayed].sort((x, y) => x.at - y.at).flatMap((s) => [s.e, ...s.tail])].map((e) => e.path), from = is.map((e) => e.path);
			if (items.some((p, i) => p !== from[i])) plan.orders.push({ folder, from, items });
		}
	}
	plan.nothing = !plan.texts.length && !plan.orders.length;
	if (scope === 'all') {
		const all = plan.all = everything(c, then, now, opts);
		const to: [string, Kind][] = [...all.places.map((p): [string, Kind] => [p.to, p.kind]), ...all.files.map((f): [string, Kind] => [f.path, 'note'])];
		if (all.gather) to.push([all.gather.folder, 'folder'], ...all.gather.items.map((p): [string, Kind] => [p.to, p.kind]));
		if (to.some(([path, kind]) => !mayPlace(path, kind, opts.of))) { plan.unsafe = true; plan.all = null; plan.nothing = true; return plan; }
		plan.nothing = !all.places.length && !all.files.length && !all.gather && !plan.orders.length;
	}
	return plan;
}

/** What is the same in two plans to bring everything back, whatever the notes say: what is made, renamed and moved,
    and the order. (A note written in since the screen was drawn is left by itself; an item made, renamed or moved
    since makes the whole plan another plan, and nothing of it is done.) */
export const shape = (all: All): string => JSON.stringify([all.gather, all.places, all.files.filter((f) => f.from == null).map((f) => f.path), all.orders.map((o) => [o.folder, o.items])]);

/** Everything coming back: where each item of the snapshot will be, and what that takes.

    An item is put at the path it had. One exception, since nothing is deleted or written over: where an item new
    since has that very name now (and stays), the item coming back keeps the name it has now, if it is in that
    folder already, and is otherwise named by counting on ("Arrival 2"). What is new since stays in the folder it
    is in, after the item it follows now; or (`since: 'gather'`) the notes and folders among it go into one folder
    at the end, each under its own name, counted on where two share one. A file that isn't a note is listed in a
    snapshot and not kept: one that is gone can't be made again, and none is moved. */
function everything(c: Changes, then: Entry[], now: Entry[], opts: BackOptions): All {
	const since: Since = opts.since === 'gather' ? 'gather' : 'stay';
	const all: All = { since, gather: null, places: [], files: [], orders: [], notes: [], made: [], renamed: [], moved: [], named: [], cannot: [], stays: [], gathered: [], ownStay: [], props: [] };
	const own = (r: Row) => !!(r.then ?? r.now)?.role;
	const T = then.filter((e) => !e.role), N = now.filter((e) => !e.role);
	const thenAt = new Map(T.map((e) => [e.path, e])), nowAt = new Map(N.map((e) => [e.path, e]));
	const pair = new Map<Entry, Entry>(), back = new Map<Entry, Entry>(), rowOf = new Map<Entry, Row>();
	for (const r of c.rows) {
		if (own(r)) continue;
		if (r.then && r.now) { pair.set(r.then, r.now); back.set(r.now, r.then); }
		if (r.then) rowOf.set(r.then, r);
		if (r.now) rowOf.set(r.now, r);
	}
	const slash = (e: Entry) => (e.kind === 'folder' ? '/' : '');
	const split = (e: Entry): [string, string] => { const full = leaf(e.path), ext = e.kind === 'note' ? full.slice(full.lastIndexOf('.')) : ''; return [full.slice(0, full.length - ext.length), ext]; };
	const fresh = N.filter((e) => !back.has(e));
	const finT = new Map<Entry, string>(), finN = new Map<Entry, string>();
	// where a folder as it stands will be: the place of the folder it was, or (a new one) its own
	const dirFinal = (dir: string): string => {
		if (!dir) return '';
		const d = nowAt.get(dir), was = d ? back.get(d) : undefined;
		return was ? finT.get(was) ?? was.path : d ? finN.get(d) ?? dir : dir;
	};

	// what is new since: where each will be. Those to gather are the notes and folders that aren't in a new folder
	// themselves (a new folder goes with what is in it).
	if (since === 'gather') {
		const top = fresh.filter((e) => { const d = nowAt.get(dirOf(e.path)); return !d || back.has(d); });
		const base = (opts.sinceName ?? '').replace(/[*"\\/<>:|?]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'Since the snapshot';
		// (a folder made for this before, by a bringing back that was interrupted or made twice, serves again)
		const held = new Set([...T.filter((e) => !dirOf(e.path)).map((e) => low(leaf(e.path))), ...N.filter((e) => !dirOf(e.path) && !(e.kind === 'folder' && !back.has(e))).map((e) => low(leaf(e.path)))]);
		let name = base;
		for (let n = 2; held.has(low(name)); n++) name = `${base} ${n}`;
		const home = name + '/', there = nowAt.get(home), go = top.filter((e) => e.kind !== 'file' && e !== there);
		if (go.length) {
			const taken = new Set(N.filter((e) => dirOf(e.path) === home).map((e) => low(leaf(e.path))));
			all.gather = { folder: home, make: !there, items: [] };
			if (there) finN.set(there, home);
			for (const e of go) {
				const [stem, ext] = split(e);
				let as = stem + ext;
				for (let n = 2; taken.has(low(as)); n++) as = `${stem} ${n}${ext}`;
				taken.add(low(as));
				finN.set(e, home + as + slash(e));
				all.gather.items.push({ kind: e.kind, role: '', from: e.path, to: home + as + slash(e) });
				const r = rowOf.get(e);
				if (r) all.gathered.push(r);
			}
		}
	}
	// (in the order they stand: a folder before what is in it)
	for (const e of fresh) if (!finN.has(e)) finN.set(e, dirFinal(dirOf(e.path)) + leaf(e.path) + slash(e));
	const stayAt = new Map(fresh.map((e) => [low(finN.get(e) ?? e.path), e]));

	// what was there: each at the path it had, folders before what is in them
	const claimed = new Set(T.map((e) => low(e.path))), same = new Map<Entry, Entry>();
	const depth = (e: Entry) => e.path.replace(/\/$/, '').split('/').length;
	for (const e of [...T].sort((x, y) => depth(x) - depth(y))) {
		const dir = dirOf(e.path), parent = dir ? thenAt.get(dir) : undefined, at = dir ? (parent ? finT.get(parent) ?? dir : dir) : '';
		const want = at + leaf(e.path) + slash(e), holder = stayAt.get(low(want)), is = pair.get(e);
		if (e.kind === 'file') {
			// (one in a folder that was renamed is there under the folder's new name: it is the same file)
			if (!is && holder?.kind === 'file') same.set(holder, e);
			if (is || holder?.kind === 'file') finT.set(e, want);
			continue;
		}
		let to = want;
		if (holder) {
			const here = is && dirFinal(dirOf(is.path)) === at ? at + leaf(is.path) + slash(e) : '';
			if (here && !stayAt.has(low(here)) && (!claimed.has(low(here)) || low(here) === low(e.path))) to = here;
			else {
				const [stem, ext] = split(e);
				for (let n = 2; stayAt.has(low(to)) || claimed.has(low(to)); n++) to = `${at}${stem} ${n}${ext}${slash(e)}`;
			}
			claimed.add(low(to));
		}
		finT.set(e, to);
		if (is) finN.set(is, to);
	}
	// where an item would be if only the folders it is in were put back
	const carried = (e: Entry): string => dirFinal(dirOf(e.path)) + leaf(e.path) + slash(e);
	const file = (e: Entry, path: string, is: Entry | null | undefined, ownNote = false): void => {
		if (e.text == null) return;
		all.notes.push([e.path, path, is ? is.path : null]);
		if (!is) all.files.push({ path, from: null, expect: null, text: e.text, role: e.role, own: ownNote });
		else if (is.text !== e.text) all.files.push({ path, from: is.path, expect: is.text ?? '', text: e.text, role: e.role, own: ownNote });
	};
	const ownT = new Map(then.filter((e) => e.role).map((e) => [dirOf(e.path), e])), ownN = new Map(now.filter((e) => e.role).map((e) => [dirOf(e.path), e]));
	for (const e of T) {
		const to = finT.get(e), is = pair.get(e);
		if (to === undefined) continue;
		if (e.kind !== 'file') {
			if (!is) { if (e.kind === 'folder') all.places.push({ kind: 'folder', role: '', from: null, to }); }
			else if (carried(is) !== to) all.places.push({ kind: e.kind, role: '', from: is.path, to });
		}
		if (e.kind === 'note') file(e, to, is);
		// a folder's own note goes with it: named like it, in it
		const note = e.kind === 'folder' ? ownT.get(e.path) : undefined;
		if (note) {
			const at = to + leaf(to) + '.md', has = is ? ownN.get(is.path) : undefined;
			if (is && has && carried(is) + leaf(has.path) !== at) all.places.push({ kind: 'note', role: 'folder note', from: has.path, to: at });
			file(note, at, has ?? null);
		}
	}
	// the folder's own note: where it is now, whatever it is called (a folder's is made again under the folder's name)
	const mine = ownT.get(''), has = ownN.get('');
	if (mine && has) file(mine, has.path, has, true);
	else if (mine && mine.role === 'folder note') file(mine, opts.name ? `${opts.name}.md` : mine.path, null, true);

	// the order: each folder that was there, its items in the order they had, what is new since after the item it
	// follows now
	const kidsT = new Map<string, Entry[]>(), kidsN = new Map<string, Entry[]>();
	for (const e of T) kidsT.set(dirOf(e.path), [...(kidsT.get(dirOf(e.path)) ?? []), e]);
	for (const e of N) kidsN.set(dirOf(e.path), [...(kidsN.get(dirOf(e.path)) ?? []), e]);
	const moving = new Set((all.gather?.items ?? []).map((p) => p.from));
	for (const dir of ['', ...T.filter((e) => e.kind === 'folder').map((e) => e.path)]) {
		const folder = dir ? thenAt.get(dir) : undefined, at = folder ? finT.get(folder) : '', is = folder ? pair.get(folder)?.path : '';
		if (at === undefined) continue;
		const tails = new Map<Entry | null, string[]>();
		let last: Entry | null = null;
		for (const e of is === undefined ? [] : kidsN.get(is) ?? []) {
			const was = back.get(e) ?? same.get(e);
			if (was) { if (dirOf(was.path) === dir) last = was; }
			else if (!moving.has(e.path)) tails.set(last, [...(tails.get(last) ?? []), finN.get(e) ?? e.path]);
		}
		const items = [...(tails.get(null) ?? []), ...(kidsT.get(dir) ?? []).flatMap((e) => { const to = finT.get(e); return to === undefined ? [] : [to, ...(tails.get(e) ?? [])]; })];
		if (!dir && all.gather?.make) items.push(all.gather.folder);
		if (items.length) all.orders.push({ folder: at, from: [], items });
	}
	if (all.gather) all.orders.push({ folder: all.gather.folder, from: [], items: [...(kidsN.get(all.gather.folder) ?? []).map((e) => e.path), ...all.gather.items.map((p) => p.to)] });

	// what the screen says (what is in a folder that goes to the one folder goes with it)
	const off = (e: Entry) => !!all.gather?.items.some((p) => p.from === e.path || (p.kind === 'folder' && e.path.startsWith(p.from ?? '\0')));
	for (const r of c.rows) {
		// a folder that had no note of its own and has one now keeps it (a note is never deleted), and so its properties
		const keeps = !own(r) && r.kind === 'folder' && !!r.then && !!r.now && !ownT.has(r.then.path) && ownN.has(r.now.path);
		if (r.props.length && !keeps) all.props.push(r);
		if (own(r)) continue;
		if (r.fresh) { if (r.now && !same.has(r.now) && !off(r.now)) all.stays.push(r); continue; }
		const to = r.then ? finT.get(r.then) : undefined;
		if (r.gone) { if (to === undefined) all.cannot.push(r); else if (r.kind !== 'file') all.made.push(r); }
		if (to !== undefined && r.then && nameOf(to) !== nameOf(r.then.path)) all.named.push({ row: r, as: nameOf(to) });
		else if (r.renamed) all.renamed.push(r);
		if (r.into != null) all.moved.push(r);
		if (keeps) all.ownStay.push(r);
	}
	return all;
}
