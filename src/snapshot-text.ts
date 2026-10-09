/* Snapshots of a scene: the text rules, pure so they can be unit-tested. What a snapshot's file is called, what it
   says about itself, and how two texts compare for a reader of prose: paragraph by paragraph, and within a paragraph
   that was changed, word by word. */
import { tabLines } from './paragraphs/text';

/** The folder, at the top of a binder, that holds the snapshots of its notes. */
export const SNAPSHOTS = 'Snapshots';
/** A snapshot is a plain-text file (Markdown inside) that Obsidian doesn't take for a note: it isn't indexed, so it's
    in no search, no link suggestion, no graph, and no list of tags. */
export const SNAPSHOT_EXT = 'snapshot';

const p2 = (n: number) => String(n).padStart(2, '0');

/** "2026-10-01 14.32.07", then the snapshot's name if it has one: sorts by time, and reads as a date in any file
    list. To the second, so two devices that each take one of the same note while apart don't make the same file. */
export function snapshotName(when: Date, title: string, taken: (name: string) => boolean): string {
	const base = `${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())} ${p2(when.getHours())}.${p2(when.getMinutes())}.${p2(when.getSeconds())}${title ? ' ' + title : ''}`;
	let name = base;
	for (let n = 2; taken(name); n++) name = `${base} (${n})`;
	return name;
}

/** A snapshot file's name (without its extension) read back: when it was taken (local time) and its name. Null for a
    file that isn't named as Binders names them (one renamed by hand): its `taken` property, or the file's own date,
    says when then, and its whole name is its name.
    `beside` says whether a snapshot of this name is in the same folder. A name that ends in " (3)" is the name as the
    writer typed it, unless the same name without that is there too: only then is it the count `snapshotName` adds. */
export function readSnapshotName(name: string, beside?: (name: string) => boolean): { when: Date; title: string } | null {
	const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d)\.(\d\d)\.(\d\d)(?: (.*))?$/.exec(name);
	if (!m) return null;
	const [y, mo, d, h, mi, sec] = m.slice(1, 7).map(Number), when = new Date(y, mo - 1, d, h, mi, sec);
	// (a date that isn't one, "2026-13-45", rolls over in JavaScript: it must read back as written)
	if (Number.isNaN(when.getTime()) || when.getMonth() !== mo - 1 || when.getDate() !== d || when.getHours() !== h || when.getMinutes() !== mi) return null;
	const title = (m[7] ?? '').trim(), count = /^(?:(.*) )?\((\d+)\)$/.exec(title), stem = count?.[1] ?? '';
	// (the time is the name's first 19 characters; counts start at 2)
	const counted = !!count && Number(count[2]) >= 2 && !!beside?.(name.slice(0, 19) + (stem ? ' ' + stem : ''));
	return { when, title: counted ? stem.trim() : title };
}

/** "2026-10-01T14:32:07": local time, as Obsidian writes a date and time property. */
export function stamp(when: Date): string {
	return `${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())}T${p2(when.getHours())}:${p2(when.getMinutes())}:${p2(when.getSeconds())}`;
}

/** Why a typed name can't be a snapshot's (it becomes part of a file's name), or null. */
export const badSnapshotName = (name: string): string | null =>
	/[*"\\/<>:|?]/.test(name) ? 'A name can’t contain any of * " \\ / < > : | ?' : name.length > 120 ? 'That name is too long.' : null;

/** A snapshot's file as text: what it's of and when it was taken, as properties, then the note's text exactly as it
    was. The properties are always written, so a text that itself begins with a line of dashes reads back whole. */
export function snapshotFile(of: string, when: Date, body: string): string {
	return `---\nsnapshot-of: ${JSON.stringify(of)}\ntaken: ${stamp(when)}\n---\n${body}`;
}

/** A snapshot file read back: the text, and what its properties say. A file without the properties (one made by
    hand) is all text. */
export function readSnapshot(text: string): { body: string; of: string | null; taken: number | null } {
	const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
	if (!m || !/^snapshot-of:/m.test(m[1])) return { body: text, of: null, taken: null };
	const prop = (key: string) => new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(m[1])?.[1].trim() ?? null;
	let of = prop('snapshot-of');
	if (of && /^".*"$/.test(of)) { try { of = JSON.parse(of) as string; } catch { /* as written */ } }
	const at = Date.parse((prop('taken') ?? '').replace(/^["']|["']$/g, ''));
	return { body: text.slice(m[0].length), of, taken: Number.isNaN(at) ? null : at };
}

// ---- comparing ----

/** Part of a paragraph: the same in both texts, or only in one. */
export interface Piece { text: string; changed: boolean }
/** One row of a comparison: a paragraph both have (`same`), one only the old text has (`old`), one only the new has
    (`new`). A paragraph that was reworded is an `old` row followed by a `new` row, each with its changed words marked. */
export interface Row { kind: 'same' | 'old' | 'new'; pieces: Piece[]; /** Its paragraph begins with a tab (`tabLines`); the tab is still in `pieces`. */ tab: boolean }
/** A paragraph as it is in its text: the line, and whether it is a paragraph begun with a tab. */
interface Para { text: string; tab: boolean }

/** The most cells the table of `table` may have: beyond it, a stretch is cut into smaller ones first (`match`). */
const TABLE = 6e6;

/** The longest run of items two lists share, in order, as pairs of indexes. */
function common<T>(a: T[], b: T[]): [number, number][] {
	const out: [number, number][] = [];
	match(a, b, 0, a.length, 0, b.length, out);
	return out;
}

/** The pairs for `a[i0..i1)` and `b[j0..j1)`, added to `out` in order. What the two share at their start and their
    end is paired first: an edit in a long text leaves little between, however long the text. A stretch still too long
    for the table is cut at the items that are in each side exactly once and in the same order (in prose, nearly every
    paragraph), and each part is matched on its own. One with no such item is left unpaired: wholly different. */
function match<T>(a: T[], b: T[], i0: number, i1: number, j0: number, j1: number, out: [number, number][]): void {
	while (i0 < i1 && j0 < j1 && a[i0] === b[j0]) out.push([i0++, j0++]);
	const tail: [number, number][] = [];
	while (i0 < i1 && j0 < j1 && a[i1 - 1] === b[j1 - 1]) tail.push([--i1, --j1]);
	if (i0 < i1 && j0 < j1) {
		if ((i1 - i0) * (j1 - j0) <= TABLE) table(a, b, i0, i1, j0, j1, out);
		else {
			let i = i0, j = j0;
			for (const [x, y] of anchors(a, b, i0, i1, j0, j1)) { match(a, b, i, x, j, y, out); out.push([x, y]); i = x + 1; j = y + 1; }
			if (i > i0) match(a, b, i, i1, j, j1, out);
		}
	}
	for (let k = tail.length - 1; k >= 0; k--) out.push(tail[k]);
}

/** The longest common run of two stretches, by the table of every pair (so only for stretches that fit one). */
function table<T>(a: T[], b: T[], i0: number, i1: number, j0: number, j1: number, out: [number, number][]): void {
	const n = i1 - i0, m = j1 - j0, w = m + 1, t = new Uint32Array((n + 1) * w);
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i * w + j] = a[i0 + i] === b[j0 + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
	for (let i = 0, j = 0; i < n && j < m;) {
		if (a[i0 + i] === b[j0 + j]) { out.push([i0 + i, j0 + j]); i++; j++; }
		else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
		else j++;
	}
}

/** The items that are once in each stretch, as pairs: the longest run of them that is in the same order in both. */
function anchors<T>(a: T[], b: T[], i0: number, i1: number, j0: number, j1: number): [number, number][] {
	const seen = new Map<T, { i: number; j: number; n: number; m: number }>();
	for (let i = i0; i < i1; i++) { const s = seen.get(a[i]); if (s) s.n++; else seen.set(a[i], { i, j: -1, n: 1, m: 0 }); }
	for (let j = j0; j < j1; j++) { const s = seen.get(b[j]); if (s) { s.m++; s.j = j; } }
	// (in the order of `a`, as a Map keeps them; then the longest run whose places in `b` only rise)
	const once = [...seen.values()].filter((s) => s.n === 1 && s.m === 1), ends: number[] = [], before = new Array<number>(once.length).fill(-1);
	once.forEach((s, k) => {
		let lo = 0, hi = ends.length;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (once[ends[mid]].j < s.j) lo = mid + 1; else hi = mid; }
		if (lo > 0) before[k] = ends[lo - 1];
		ends[lo] = k;
	});
	const out: [number, number][] = [];
	for (let k = ends.length ? ends[ends.length - 1] : -1; k >= 0; k = before[k]) out.push([once[k].i, once[k].j]);
	return out.reverse();
}

const words = (s: string): string[] => s.match(/\S+\s*/g) ?? [];

/** How alike two paragraphs are, from 0 to 1: the share of the longer one's words that are in both, in order. */
function alike(a: string[], b: string[]): { pairs: [number, number][]; share: number } {
	const pairs = common(a.map((x) => x.trim()), b.map((x) => x.trim()));
	return { pairs, share: pairs.length / Math.max(1, a.length, b.length) };
}

/** A paragraph's words as pieces, the ones not in `kept` marked (the space after a marked run isn't part of it). */
function pieces(list: string[], kept: Set<number>): Piece[] {
	const out: Piece[] = [];
	const add = (text: string, changed: boolean) => { const last = out[out.length - 1]; if (!text) return; if (last && last.changed === changed) last.text += text; else out.push({ text, changed }); };
	list.forEach((text, i) => {
		const changed = !kept.has(i), next = i + 1 < list.length && !kept.has(i + 1);
		if (!changed || next) { add(text, changed); return; }
		const word = text.trimEnd();
		add(word, true);
		add(text.slice(word.length), false);
	});
	return out;
}

/** Under this share of words in common, two paragraphs aren't one paragraph reworded but one taken out and another
    put in: nothing in them is marked, since a confetti of shared small words ("the", "and") would say otherwise. */
const REWORDED = 0.34;

/** A stretch of paragraphs that changed: which old one became which new one (the pairing with the most in common,
    in order), each such pair marked word by word; the rest are paragraphs taken out or put in, whole. */
function changed(gone: Para[], come: Para[]): Row[] {
	const a = gone.map((g) => words(g.text)), b = come.map((c) => words(c.text)), n = a.length, m = b.length;
	const whole = (kind: 'old' | 'new', x: Para): Row => ({ kind, pieces: [{ text: x.text, changed: false }], tab: x.tab });
	if (n * m > 400) return [...gone.map((g) => whole('old', g)), ...come.map((c) => whole('new', c))];
	const sim = a.map((x) => b.map((y) => alike(x, y)));
	// best[i][j]: the most that a[i..] and b[j..] can have in common, pairing in order
	const best = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], sim[i][j].share >= REWORDED ? sim[i][j].share + best[i + 1][j + 1] : 0);
	const rows: Row[] = [];
	for (let i = 0, j = 0; i < n || j < m;) {
		if (i < n && j < m && sim[i][j].share >= REWORDED && best[i][j] === sim[i][j].share + best[i + 1][j + 1]) {
			rows.push({ kind: 'old', pieces: pieces(a[i], new Set(sim[i][j].pairs.map((p) => p[0]))), tab: gone[i].tab }, { kind: 'new', pieces: pieces(b[j], new Set(sim[i][j].pairs.map((p) => p[1]))), tab: come[j].tab });
			i++; j++;
		} else if (j >= m || (i < n && best[i][j] === best[i + 1][j])) rows.push(whole('old', gone[i++]));
		else rows.push(whole('new', come[j++]));
	}
	return rows;
}

/** Compares two texts as prose: by paragraph (a line with text in it), then by word inside a paragraph that changed.
    Each row says whether its paragraph begins with a tab, as `tabLines` says of the text it came from. A whole
    paragraph keeps the tab in its text; a reworded one is compared by its words, which have none. Whether to show the
    tab as an indent, or leave it as the code it is, is the caller's. */
export function compare(before: string, after: string): Row[] {
	const paras = (s: string): Para[] => {
		const t = s.replace(/\r\n?/g, '\n'), tabs = new Set(tabLines(t));
		return t.split('\n').map((l, n) => ({ text: l.trimEnd(), tab: tabs.has(n) })).filter((x) => x.text.trim());
	};
	const a = paras(before), b = paras(after), pairs = common(a.map((x) => x.text), b.map((x) => x.text)), rows: Row[] = [];
	const between = (i0: number, i1: number, j0: number, j1: number) => { rows.push(...changed(a.slice(i0, i1), b.slice(j0, j1))); };
	let i = 0, j = 0;
	for (const [x, y] of pairs) { between(i, x, j, y); rows.push({ kind: 'same', pieces: [{ text: a[x].text, changed: false }], tab: b[y].tab }); i = x + 1; j = y + 1; }
	between(i, a.length, j, b.length);
	return rows;
}

/** One stretch of a paragraph compared: words both texts have, words only the snapshot has, words only the note has. */
export interface Stretch { kind: 'same' | 'old' | 'new'; words: string[] }
/** A reworded paragraph as one paragraph: what was taken out and what was put in, each where it falls in the sentence
    (`compare` gives it as two rows, each with its own changed words marked). A lone word left standing between two
    rewordings goes into both, so a rewritten phrase reads as one phrase and not as a scatter of single words. */
export function reworded(old: Piece[], now: Piece[]): Stretch[] {
	const flat = (ps: Piece[]) => ps.flatMap((p) => (p.text.match(/\S+/g) ?? []).map((w) => ({ w, changed: p.changed })));
	const a = flat(old), b = flat(now), out: Stretch[] = [];
	let held: { old: string[]; now: string[] } = { old: [], now: [] }, same: string[] = [];
	// (out, then in, as a correction is read)
	const flush = () => {
		if (held.old.length) out.push({ kind: 'old', words: held.old });
		if (held.now.length) out.push({ kind: 'new', words: held.now });
		held = { old: [], now: [] };
	};
	for (let i = 0, j = 0; i < a.length || j < b.length;) {
		const gone: string[] = [], come: string[] = [];
		while (i < a.length && a[i].changed) gone.push(a[i++].w);
		while (j < b.length && b[j].changed) come.push(b[j++].w);
		if (gone.length || come.length) {
			if (same.length === 1 && held.old.length && held.now.length && gone.length && come.length) { held.old.push(same[0], ...gone); held.now.push(same[0], ...come); }
			else { flush(); if (same.length) out.push({ kind: 'same', words: same }); held = { old: gone, now: come }; }
			same = [];
		}
		if (i < a.length && j < b.length) { same.push(a[i].w); i++; j++; }
		// (the words both have are the same words in the same order; if ever they weren't, what's left is shown as changed)
		else { for (let k = i; k < a.length; k++) a[k].changed = true; for (let k = j; k < b.length; k++) b[k].changed = true; }
	}
	flush();
	if (same.length) out.push({ kind: 'same', words: same });
	return out;
}
