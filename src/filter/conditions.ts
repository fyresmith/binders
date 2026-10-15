import { GREGORIAN, exampleDates, readStoryDate, type Calendar, type StoryDate } from '../time/date';

/* The conditions of a filter, and how a note is matched against them. Pure: no Obsidian, no DOM. A note's properties are
   plain data given by `read`, and the two things only the vault knows (which note a link names, and what kind of value a
   property holds) are given by the caller, so the rules can be unit-tested. The view keeps the filter, the binder note
   keeps it saved (`filters`, docs/dev/file-format.md), and the popover (view/filter-popover.ts) edits it.

   The rules a writer meets, in one place:
   - Text is compared without regard to case, and to the way an accent is written (NFC): `draft` is `Draft`.
   - A link is compared by the note it names, whatever it shows (`[[Harrow|the keeper]]` is `[[Harrow]]`); a plain `Mara`
     is the same name as `[[Mara]]`; links to two different notes both named Mara are two people.
   - A date given only as a year or a month stands for every day in it. "On 1925" is any day of 1925. "Before June 1925"
     is wholly before the 1st, "after June 1925" wholly after the 30th; "on or before" and "on or after" take a date that
     could be either. A time of day is not looked at.
   - A condition that isn't whole yet (a row just added, no value picked) is left out; it never hides everything. */

/** What kind of value a property holds, which decides the operators offered and the control its value is typed in. */
export type Kind = 'text' | 'list' | 'number' | 'date' | 'checkbox';

/** One row: a property (as the notes name it; `file.*` for what the file itself says), an operator in Bases' words, and
    a value (a list of them where several make sense; none for "is empty"). */
export interface Condition { property: string; operator: string; value?: unknown }

/** How a filter's conditions combine: all of them true, any of them, or none. */
export type Match = 'all' | 'any' | 'none';
export const MATCHES: { id: Match; title: string; word: string }[] = [
	{ id: 'all', title: 'All the following are true', word: 'and' },
	{ id: 'any', title: 'Any of the following are true', word: 'or' },
	{ id: 'none', title: 'None of the following are true', word: 'nor' },
];

/** A filter: a flat list of conditions and how they combine. Saved ones have a name. */
export interface FilterDef { name?: string; match: Match; conditions: Condition[] }

export const emptyDef = (): FilterDef => ({ match: 'all', conditions: [] });

export interface Operator { id: string; title: string; /** How many values it takes: none, one, or several. */ takes: 0 | 1 | 2 }
const EMPTY: Operator[] = [{ id: 'is empty', title: 'is empty', takes: 0 }, { id: 'is not empty', title: 'is not empty', takes: 0 }];
/** The operators of each kind, worded as Obsidian's Bases words them (comparisons are written `>=` and shown `≥`). */
export const OPERATORS: Record<Kind, Operator[]> = {
	text: [{ id: 'is', title: 'is', takes: 2 }, { id: 'is not', title: 'is not', takes: 2 }, { id: 'contains', title: 'contains', takes: 1 }, { id: 'does not contain', title: 'does not contain', takes: 1 }, ...EMPTY],
	list: [{ id: 'contains any of', title: 'contains any of', takes: 2 }, { id: 'contains all of', title: 'contains all of', takes: 2 }, { id: 'does not contain any of', title: 'does not contain any of', takes: 2 }, ...EMPTY],
	number: [{ id: '=', title: '=', takes: 1 }, { id: '!=', title: '≠', takes: 1 }, { id: '<', title: '<', takes: 1 }, { id: '<=', title: '≤', takes: 1 }, { id: '>', title: '>', takes: 1 }, { id: '>=', title: '≥', takes: 1 }, ...EMPTY],
	date: [{ id: 'on', title: 'on', takes: 1 }, { id: 'not on', title: 'not on', takes: 1 }, { id: 'before', title: 'before', takes: 1 }, { id: 'on or before', title: 'on or before', takes: 1 }, { id: 'after', title: 'after', takes: 1 }, { id: 'on or after', title: 'on or after', takes: 1 }, ...EMPTY],
	checkbox: [{ id: 'is', title: 'is', takes: 1 }],
};
const ALIASES: Record<string, string> = { '==': '=', '≠': '!=', '<>': '!=', '≤': '<=', '≥': '>=', 'is any of': 'is', 'is none of': 'is not', 'has any of': 'contains any of', 'has all of': 'contains all of', 'has none of': 'does not contain any of' };
/** An operator by what is written in the note: as written, in any case, and the symbols or words a hand might use. */
export function operatorOf(kind: Kind, written: unknown): Operator | null {
	if (typeof written !== 'string') return null;
	const w = written.trim().toLowerCase().replace(/\s+/g, ' ');
	return OPERATORS[kind].find((o) => o.id === (ALIASES[w] ?? w)) ?? null;
}

export { fold, linkOf, atom, same, atoms, isEmpty, textOf, type Atom, type Env } from './names';
import { atom, atoms, fold, isEmpty, linkOf, same, textOf, type Atom, type Env } from './names';

/** A number from a property: a number, or text that is one ("2,000" too). */
export function numberOf(v: unknown): number | null {
	if (typeof v === 'number') return isFinite(v) ? v : null;
	if (typeof v !== 'string') return null;
	const t = v.trim();
	if (!t) return null;
	const n = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? Number(t.replace(/,/g, '')) : Number(t);
	return isFinite(n) ? n : null;
}
/** A checkbox from a property: true or false, or text that says so. */
export function boolOf(v: unknown): boolean | null {
	if (typeof v === 'boolean') return v;
	if (typeof v === 'string') { const t = v.trim().toLowerCase(); if (t === 'true') return true; if (t === 'false') return false; }
	return null;
}

/** A date as the days it covers: `[first, last]`, counted as the binder's calendar counts them (the ordinary one from
    1970-01-01). A year or a month covers all of itself; a time of day is dropped. Null for anything that is not a story
    date in that calendar (in any of the shapes `src/time/date.ts` reads). */
export function daysOf(v: unknown, cal: Calendar = GREGORIAN): [number, number] | null {
	const d: StoryDate | null = readStoryDate(v, cal);
	if (!d) return null;
	if (!cal.monthsIn(d.y)) return [cal.toDay(d.y, 1, 1), cal.toDay(d.y, 1, 1) + Math.round(cal.yearLength) - 1];
	if (d.m == null) return [cal.toDay(d.y, 1, 1), cal.toDay(d.y, cal.monthsIn(d.y), cal.daysIn(d.y, cal.monthsIn(d.y)))];
	if (d.d == null) return [cal.toDay(d.y, d.m, 1), cal.toDay(d.y, d.m, cal.daysIn(d.y, d.m))];
	const day = cal.toDay(d.y, d.m, d.d);
	return [day, day];
}

/** The values a condition names, as a list (a hand may write one value or a list of them). */
export const valuesOf = (c: Condition): unknown[] => (Array.isArray(c.value) ? c.value as unknown[] : c.value === undefined || c.value === null ? [] : [c.value]);

/** What is wrong with a condition, in words for the row's error line; null if it is whole, or only not finished (nothing
    picked yet is not an error). */
export function problem(c: Condition, kind: Kind, cal: Calendar = GREGORIAN): string | null {
	if (!c.property) return null;
	const op = operatorOf(kind, c.operator);
	if (!op) return `“${String(c.operator)}” doesn’t apply to this property.`;
	if (!op.takes) return null;
	const vs = valuesOf(c).filter((v) => !isEmpty(v));
	if (kind === 'number' && vs.some((v) => numberOf(v) == null)) return 'That isn’t a number.';
	if (kind === 'date' && vs.some((v) => !daysOf(v, cal))) return `That isn’t a date. Try ${exampleDates(cal)}.`;
	if (kind === 'checkbox' && valuesOf(c).some((v) => boolOf(v) == null)) return 'Choose checked or unchecked.';
	return null;
}

/** Is the condition whole enough to mean something? One that isn't is left out of the matching, as Bases leaves out a row
    it can't read: it never empties the page by being half made. */
export function complete(c: Condition, kind: Kind, cal: Calendar = GREGORIAN): boolean {
	const op = operatorOf(kind, c.operator);
	if (!c.property || !op) return false;
	if (!op.takes) return true;
	const vs = valuesOf(c);
	if (kind === 'checkbox') return boolOf(vs[0]) != null;
	if (kind === 'number') return numberOf(vs[0]) != null;
	if (kind === 'date') return !!daysOf(vs[0], cal);
	// ("is" may name the empty value: "status is Draft or nothing")
	return vs.length > 0 && (op.id === 'is' || op.id === 'is not' || vs.some((v) => !isEmpty(v)));
}

/** Does a value pass a condition? `kind` is the property's kind in this binder. */
export function passes(c: Condition, kind: Kind, value: unknown, env: Env): boolean {
	const op = operatorOf(kind, c.operator);
	if (!op) return true;
	if (op.id === 'is empty') return isEmpty(value);
	if (op.id === 'is not empty') return !isEmpty(value);
	const vs = valuesOf(c);
	if (kind === 'checkbox') return (boolOf(value) === true) === (boolOf(vs[0]) === true);
	if (kind === 'number') {
		const a = numberOf(value), b = numberOf(vs[0]);
		if (a == null || b == null) return op.id === '!=' && b != null;
		return op.id === '=' ? a === b : op.id === '!=' ? a !== b : op.id === '<' ? a < b : op.id === '<=' ? a <= b : op.id === '>' ? a > b : a >= b;
	}
	if (kind === 'date') {
		const a = daysOf(value, env.cal), b = daysOf(vs[0], env.cal);
		if (!a || !b) return op.id === 'not on' && !!b;
		const on = a[0] <= b[1] && a[1] >= b[0];
		return op.id === 'on' ? on : op.id === 'not on' ? !on : op.id === 'before' ? a[1] < b[0] : op.id === 'on or before' ? a[0] <= b[1] : op.id === 'after' ? a[0] > b[1] : a[1] >= b[0];
	}
	const have = atoms(value, env);
	if (op.id === 'contains' || op.id === 'does not contain') {
		const needle = fold(textOf(vs[0]));
		const hit = have.some((a) => a.low.includes(needle) || a.name.includes(needle));
		return op.id === 'contains' ? hit : !hit;
	}
	const want = vs.map((v) => atom(v, env)), none = vs.some(isEmpty);
	const has = (w: Atom | null) => (w ? have.some((a) => same(a, w)) : !have.length);
	const any = want.some(has) || (none && !have.length);
	if (op.id === 'is' || op.id === 'contains any of') return any;
	if (op.id === 'is not' || op.id === 'does not contain any of') return !any;
	return want.length > 0 && want.every(has); // contains all of
}

/** The conditions that count: the whole ones. */
export const wholeRows = (f: FilterDef, kindOf: (property: string) => Kind, cal: Calendar = GREGORIAN): Condition[] => f.conditions.filter((c) => complete(c, kindOf(c.property), cal));
/** Is the filter on: has it a condition that means something? */
export const active = (f: FilterDef, kindOf: (property: string) => Kind, cal: Calendar = GREGORIAN): boolean => f.conditions.some((c) => complete(c, kindOf(c.property), cal));

/** Does a note pass the filter? `read` gives a property's value, `kindOf` its kind. A filter with no whole condition passes
    everything. */
export function matches(f: FilterDef, read: (property: string) => unknown, kindOf: (property: string) => Kind, env: Env): boolean {
	const rows = wholeRows(f, kindOf, env.cal);
	if (!rows.length) return true;
	const test = (c: Condition) => passes(c, kindOf(c.property), read(c.property), env);
	return f.match === 'any' ? rows.some(test) : f.match === 'none' ? !rows.some(test) : rows.every(test);
}

/** The kind of a property, inferred from the values it has in the binder's notes (when Obsidian has no type for it): every
    value a list, a number, a checkbox or a date makes it that; anything else, or a mix, is text. */
export function kindFrom(values: unknown[], cal: Calendar = GREGORIAN): Kind {
	const got = values.filter((v) => !isEmpty(v));
	if (!got.length) return 'text';
	if (got.every((v) => Array.isArray(v))) return 'list';
	if (got.every((v) => typeof v === 'boolean')) return 'checkbox';
	if (got.every((v) => typeof v === 'number')) return 'number';
	if (got.every((v) => typeof v === 'string' && !/^\s*-?\d+\s*$/.test(v) && !!daysOf(v, cal))) return 'date';
	if (got.some((v) => Array.isArray(v))) return 'list';
	return 'text';
}

// ---- as saved ----

const entryOf = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/** One condition as written in the note, or null if it isn't one (it needs a property). */
export function readCondition(v: unknown): Condition | null {
	const r = entryOf(v);
	if (!r || typeof r.property !== 'string' || !r.property.trim()) return null;
	return { property: r.property.trim(), operator: typeof r.operator === 'string' ? r.operator.trim() : 'is', ...(r.value !== undefined && r.value !== null ? { value: r.value } : {}) };
}
/** One filter as written in the note, or null if it isn't one. A saved filter needs a name (`named`); one in a view's state
    has none. `match` other than any or none is all. */
export function readDef(v: unknown, named = true): FilterDef | null {
	const o = entryOf(v);
	if (!o) return null;
	const name = typeof o.name === 'string' ? o.name.trim() : typeof o.name === 'number' ? String(o.name) : '';
	if (named && !name) return null;
	const conditions: Condition[] = [];
	for (const c of Array.isArray(o.conditions) ? o.conditions as unknown[] : []) { const r = readCondition(c); if (r) conditions.push(r); }
	return { ...(name ? { name } : {}), match: o.match === 'any' || o.match === 'none' ? o.match : 'all', conditions };
}
/** The saved filters of a binder note's `filters`: those that are filters, the first of each name (names are compared as
    text is), in the order written. Whatever isn't one is passed over here, and is the writer's (store) to keep. */
export function readDefs(v: unknown): FilterDef[] {
	const out: FilterDef[] = [];
	if (!Array.isArray(v)) return out;
	for (const x of v as unknown[]) {
		const d = readDef(x);
		if (d && !out.some((o) => fold(o.name ?? '') === fold(d.name ?? ''))) out.push(d);
	}
	return out;
}
/** A filter as it is written: `match` only when it isn't "all", one value plain and several as a list. */
export function writeDef(f: FilterDef): Record<string, unknown> {
	return {
		...(f.name ? { name: f.name } : {}),
		...(f.match !== 'all' ? { match: f.match } : {}),
		conditions: f.conditions.map((c) => { const vs = valuesOf(c); return { property: c.property, operator: c.operator, ...(vs.length ? { value: vs.length === 1 ? vs[0] : vs } : {}) }; }),
	};
}

/** A condition in a few words: "characters contains any of Mara", "status is not Revised". */
export function say(c: Condition, title: (property: string) => string, kind: Kind): string {
	const op = operatorOf(kind, c.operator);
	const vs = valuesOf(c).map((v) => (typeof v === 'string' ? linkOf(v)?.shown ?? (v || 'nothing') : textOf(v)));
	return [title(c.property), op?.title ?? c.operator, ...(op && !op.takes ? [] : [vs.join(', ')])].join(' ').trim();
}
