import { atom, isEmpty, linkOf, same, type Atom, type Env } from '../filter/names';

/* What the outliner's last row says of a column: a summary of the notes that show, chosen from the same list Obsidian's
   Bases offers for a column of its kind (Sum, Average, Median... for numbers; Earliest, Latest, Range for dates;
   Checked and Unchecked for a tick; Filled, Empty and Unique for anything), and one more for a column of names (a
   status, a label, a POV, a list of characters): "By value", the values in use, each with its notes and their words,
   to choose one and see those notes. Pure: the outliner hands over the values. */

/** What kind of summaries a column can have. */
export type SumKind = 'number' | 'date' | 'checkbox' | 'name' | 'text' | 'progress' | 'none';

export interface SummaryFn { id: string; name: string }

const FILLED: SummaryFn[] = [{ id: 'filled', name: 'Filled' }, { id: 'empty', name: 'Empty' }];
/** The summaries a column of each kind offers, in the order its menu lists them. */
export const SUMMARIES: Record<SumKind, SummaryFn[]> = {
	number: [{ id: 'sum', name: 'Sum' }, { id: 'average', name: 'Average' }, { id: 'median', name: 'Median' }, { id: 'min', name: 'Min' }, { id: 'max', name: 'Max' }, { id: 'range', name: 'Range' }, ...FILLED],
	date: [{ id: 'earliest', name: 'Earliest' }, { id: 'latest', name: 'Latest' }, { id: 'range', name: 'Range' }, ...FILLED],
	checkbox: [{ id: 'checked', name: 'Checked' }, { id: 'unchecked', name: 'Unchecked' }],
	name: [{ id: 'values', name: 'By value' }, ...FILLED, { id: 'unique', name: 'Unique' }],
	text: FILLED,
	progress: [{ id: 'total', name: 'Total' }],
	none: [],
};

/** Columns that are summed until the writer says otherwise (what the last row has always shown). */
const DEFAULTS: Record<string, string> = { words: 'sum', target: 'total', progress: 'total', revision: 'sum' };

/** The summary a column shows: the one chosen for it, or its own default; null for none. `none` is kept when a column
    that has a default is told to show nothing. */
export function summaryOf(id: string, kind: SumKind, chosen: string | undefined): SummaryFn | null {
	const want = chosen ?? DEFAULTS[id];
	if (!want || want === 'none') return null;
	return offered(id, kind).find((f) => f.id === want) ?? null;
}
/** What the column keeps when the writer picks `fn` (nothing at all, for its own default). */
export function keepAs(id: string, fn: string | null): string | undefined {
	const want = fn ?? 'none';
	return DEFAULTS[id] === want || (!DEFAULTS[id] && want === 'none') ? undefined : want;
}

/** The functions a column offers: its kind's, and for the target its own "Total" first. */
export function offered(id: string, kind: SumKind): SummaryFn[] {
	return id === 'target' ? [{ id: 'total', name: 'Total' }, ...SUMMARIES.number] : SUMMARIES[kind];
}

const n0 = (n: number): string => Math.round(n).toLocaleString();
const nice = (n: number): string => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 }));

/** A number summary of values (a note with none is left out of all but Empty and Filled). */
export function numberSummary(fn: string, values: (number | null)[]): string {
	const xs = values.filter((v): v is number => v != null && isFinite(v));
	switch (fn) {
		case 'filled': return xs.length.toLocaleString();
		case 'empty': return (values.length - xs.length).toLocaleString();
	}
	if (!xs.length) return '';
	const sorted = [...xs].sort((a, b) => a - b);
	switch (fn) {
		case 'sum': return nice(xs.reduce((a, b) => a + b, 0));
		case 'average': return n0(xs.reduce((a, b) => a + b, 0) / xs.length);
		case 'median': { const m = sorted.length >> 1; return n0(sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2); }
		case 'min': return nice(sorted[0]);
		case 'max': return nice(sorted[sorted.length - 1]);
		case 'range': return nice(sorted[sorted.length - 1] - sorted[0]);
	}
	return '';
}

/** A stretch of days in words: "12 days", "5 months", "3 years". */
export function span(days: number): string {
	const d = Math.round(days);
	if (d < 60) return `${d} ${d === 1 ? 'day' : 'days'}`;
	if (d < 730) { const m = Math.round(d / 30.44); return `${m} months`; }
	const y = Math.round(d / 365.25);
	return `${y} years`;
}

/** A date summary, given each note's date as a key that sorts (null for none), a way to show one, and the days between
    two (a story date that says only a year covers all of it: `last` is its last day). */
export function dateSummary<D>(fn: string, values: (D | null)[], key: (d: D) => number, show: (d: D) => string, days: (a: D, b: D) => number): string {
	const xs = values.filter((v): v is D => v != null);
	switch (fn) {
		case 'filled': return xs.length.toLocaleString();
		case 'empty': return (values.length - xs.length).toLocaleString();
	}
	if (!xs.length) return '';
	const sorted = [...xs].sort((a, b) => key(a) - key(b)), first = sorted[0], last = sorted[sorted.length - 1];
	if (fn === 'earliest') return show(first);
	if (fn === 'latest') return show(last);
	if (fn === 'range') return span(days(first, last));
	return '';
}

/** Ticks counted. */
export function checkSummary(fn: string, values: (boolean | null)[]): string {
	return values.filter((v) => (fn === 'checked' ? v === true : v !== true)).length.toLocaleString();
}

/** One value in use, and the notes that have it. */
export interface Tallied<F> { raw: string; shown: string; link: boolean; files: F[] }
/** The values a column of names holds over some notes, most notes first, and the notes that hold none. `several`: some
    note holds more than one (a list), so a note is counted under each of its values. */
export interface Tally<F> { values: Tallied<F>[]; none: F[]; several: boolean; /** The filter reads the property as a list. */ list?: boolean }

/** The values the notes hold, grouped as the filter groups them (a link is the note it names, a name is a name whatever
    its case), so that choosing one shows exactly the notes counted under it. */
export function tally<F>(files: F[], valueOf: (f: F) => unknown, env: Env): Tally<F> {
	const seen: { a: Atom; v: Tallied<F> }[] = [], none: F[] = [];
	let several = false;
	for (const f of files) {
		const v = valueOf(f);
		if (isEmpty(v)) { none.push(f); continue; }
		const once: Atom[] = [];
		for (const x of Array.isArray(v) ? v as unknown[] : [v]) {
			const a = atom(x, env);
			if (!a || once.some((o) => same(o, a))) continue;
			once.push(a);
			const link = typeof x === 'string' ? linkOf(x) : null;
			const hit = seen.find((e) => same(e.a, a));
			if (hit) { hit.v.files.push(f); if (link && !hit.v.link) Object.assign(hit.v, { raw: `[[${link.target}]]`, link: true }); continue; }
			if (typeof x !== 'string' && typeof x !== 'number') continue;
			seen.push({ a, v: { raw: link ? `[[${link.target}]]` : String(x).trim(), shown: link ? (link.target.split('/').pop() ?? link.target) : String(x).trim(), link: !!link, files: [f] } });
		}
		if (once.length > 1) several = true;
		if (!once.length) none.push(f);
	}
	const values = seen.map((e) => e.v).sort((a, b) => b.files.length - a.files.length || a.shown.localeCompare(b.shown));
	return { values, none, several };
}

/** "Filled", "Empty" and "Unique" over values of any kind. */
export function countSummary<F>(fn: string, t: Tally<F>, all: number): string {
	if (fn === 'filled') return (all - t.none.length).toLocaleString();
	if (fn === 'empty') return t.none.length.toLocaleString();
	if (fn === 'unique' || fn === 'values') return t.values.length.toLocaleString();
	return '';
}
