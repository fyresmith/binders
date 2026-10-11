import { recordDay } from './day';

/* The record's file format (docs/dev/file-format.md has it in full, with an example). One device's writing in one
   year is one plain-text file, one JSON object to a line, so a file cut short loses a line and the rest reads without
   Binders. The first line is the header and says the format's version; every other line is a day or an event. A
   file of a newer version is read as far as it is understood and never written. Pure. */

export const FORMAT = 1;
export const EXT = 'binder-history';

export type Kind = 'desktop' | 'phone' | 'tablet';
export const KINDS: Kind[] = ['desktop', 'phone', 'tablet'];

export interface Header { 'binders-history': number; device: string; label: string; kind: Kind; year: number }

/** What was done in one note on a day: words added and cut by typing, brought in and taken out a block at a time. */
export type Count = [number, number, number, number];

/** The binder as it stood when it was counted: its words, its scenes, its words by status ('' for none). `at`: when. */
export interface Total { at: number; w: number; n: number; st: Record<string, number> }

/** A sitting: its first and last minute (minutes since 1970). */
export type Sitting = [number, number];

/** One device's day. `n`: by note (its path in the binder, without ".md"). `h`: words added in each hour. `m`: minutes
    something was typed in. `u`: when it was last written to (ms), which says which copy of a line is the later. */
export interface DayLine { t: 'day'; d: string; u: number; k: Kind; n: Record<string, Count>; h: Record<string, number>; s: Sitting[]; m: number; tot?: Total }

/** Something done to a binder, with its time. Which of the other fields it has depends on `k`:
      made, gone      p (a note or folder; folder: 1), w (words it had), by (what made it: split, import…)
      renamed, moved  from, to (folder: 1)
      in, out         p, w   a note came into the binder from outside, or left it
      status, label   p, from, to
      order           p (the folder, '' for the binder)
      target          p, from, to (words, as text)
      snapshot        p ('' for the binder), name
      export          name (the kind)
      import          n (notes), w (words)
      back            p, name   a snapshot brought back
      split, merge, duplicate, replace   p, n (notes made, or replaced), w
    Anything else is kept and shown as it is. */
export interface EventLine { t: 'ev'; at: number; d: string; k: string; p?: string; from?: string; to?: string; name?: string; w?: number; n?: number; by?: string; folder?: 1 }

export interface ParsedFile {
	/** The format the file says it is (1 if it says nothing). */
	version: number;
	header: Header | null;
	days: DayLine[];
	events: EventLine[];
	/** Lines of a kind this version doesn't know, or that can't be read (up to a length): kept as they are when the file is written. */
	other: string[];
	/** Lines that couldn't be read at all (a file cut short, or edited). */
	skipped: number;
	/** Written by a newer Binders. */
	newer: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
const whole = (v: unknown): number | null => { const n = num(v); return n === null ? null : Math.max(0, Math.round(n)); };
const text = (v: unknown): v is string => typeof v === 'string';
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
/** A line that can't be read is kept (and written again with the rest) if it is no longer than this: Binders deletes
    none of the record by itself, and a hand-edited line is the writer's. */
const KEEP = 4000;
const MARK = String.fromCharCode(0xFEFF);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const kind = (v: unknown): Kind => (KINDS as unknown[]).includes(v) ? v as Kind : 'desktop';

function readDay(o: Record<string, unknown>): DayLine | null {
	if (!text(o.d) || !DAY.test(o.d)) return null;
	const n: Record<string, Count> = {}, h: Record<string, number> = {}, s: Sitting[] = [];
	for (const [path, v] of Object.entries(obj(o.n) ?? {})) {
		if (Array.isArray(v) && v.length === 4) { const c = v.map(whole); if (c.every((x) => x !== null)) n[path] = c as Count; }
	}
	for (const [hour, v] of Object.entries(obj(o.h) ?? {})) { const w = whole(v); if (/^(\d|1\d|2[0-3])$/.test(hour) && w !== null) h[hour] = w; }
	if (Array.isArray(o.s)) for (const v of o.s) { if (Array.isArray(v) && v.length === 2) { const a = whole(v[0]), b = whole(v[1]); if (a !== null && b !== null && b >= a) s.push([a, b]); } }
	const out: DayLine = { t: 'day', d: o.d, u: whole(o.u) ?? 0, k: kind(o.k), n, h, s, m: whole(o.m) ?? 0 };
	const tot = obj(o.tot);
	if (tot) {
		const at = whole(tot.at), w = whole(tot.w), sc = whole(tot.n), st: Record<string, number> = {};
		for (const [k, v] of Object.entries(obj(tot.st) ?? {})) { const x = whole(v); if (x !== null) st[k] = x; }
		if (at !== null && w !== null) out.tot = { at, w, n: sc ?? 0, st };
	}
	return out;
}

function readEvent(o: Record<string, unknown>): EventLine | null {
	const at = whole(o.at);
	if (at === null || !text(o.k)) return null;
	const e: EventLine = { t: 'ev', at, d: text(o.d) && DAY.test(o.d) ? o.d : recordDay(at), k: o.k };
	for (const k of ['p', 'from', 'to', 'name', 'by'] as const) if (text(o[k])) e[k] = o[k];
	for (const k of ['w', 'n'] as const) { const v = whole(o[k]); if (v !== null) e[k] = v; }
	if (o.folder === 1) e.folder = 1;
	return e;
}

/** Reads a file. Never throws: what can't be read is counted in `skipped` and left out. */
export function parseFile(raw: string): ParsedFile {
	const out: ParsedFile = { version: FORMAT, header: null, days: [], events: [], other: [], skipped: 0, newer: false };
	const lines = (raw.startsWith(MARK) ? raw.slice(1) : raw).split(/\r?\n/);
	let first = true;
	for (const line of lines) {
		if (!line.trim()) continue;
		let o: Record<string, unknown> | null = null;
		try { o = obj(JSON.parse(line)); } catch { /* skipped below */ }
		if (!o) { out.skipped++; if (line.length <= KEEP) out.other.push(line); first = false; continue; }
		if (first && 'binders-history' in o) {
			first = false;
			const v = whole(o['binders-history']);
			out.version = v ?? FORMAT;
			out.newer = out.version > FORMAT;
			if (text(o.device)) out.header = { 'binders-history': out.version, device: o.device, label: text(o.label) ? o.label : '', kind: kind(o.kind), year: whole(o.year) ?? 0 };
			continue;
		}
		first = false;
		const bad = () => { out.skipped++; if (line.length <= KEEP) out.other.push(line); };
		if (o.t === 'day') { const d = readDay(o); if (d) out.days.push(d); else bad(); } else if (o.t === 'ev') { const e = readEvent(o); if (e) out.events.push(e); else bad(); } else out.other.push(line);
	}
	return out;
}

/** A file's text: the header, the days, the events, and the lines it was given that this version doesn't know. */
export function serialize(h: { device: string; label: string; kind: Kind; year: number }, days: DayLine[], events: EventLine[], other: string[] = []): string {
	const head: Header = { 'binders-history': FORMAT, device: h.device, label: h.label, kind: h.kind, year: h.year };
	const day = (d: DayLine) => JSON.stringify(d.tot ? { t: d.t, d: d.d, u: d.u, k: d.k, n: d.n, h: d.h, s: d.s, m: d.m, tot: d.tot } : { t: d.t, d: d.d, u: d.u, k: d.k, n: d.n, h: d.h, s: d.s, m: d.m });
	return [JSON.stringify(head), ...days.map(day), ...events.map((e) => JSON.stringify(e)), ...other].join('\n') + '\n';
}

// ---- the file's name: "2026 MacBook a1b2.binder-history" ----

/** A label as a file name can have it. */
// eslint-disable-next-line no-control-regex -- control characters are what a file name can't have
export const safeLabel = (label: string): string => label.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Device';

export const fileName = (year: number, label: string, id: string): string => `${year} ${safeLabel(label)} ${id}.${EXT}`;

export function parseName(name: string): { year: number; label: string; id: string } | null {
	const m = /^(\d{4}) (.+) ([0-9a-f]{4,})\.binder-history$/.exec(name);
	return m ? { year: Number(m[1]), label: m[2], id: m[3] } : null;
}

/** The folder a path in a binder is in ('' for the binder itself). */
export const parentOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** A path changed to another: a rename if it stayed in the same folder, else a move. */
export const moveKind = (from: string, to: string): 'renamed' | 'moved' => (parentOf(from) === parentOf(to) ? 'renamed' : 'moved');
