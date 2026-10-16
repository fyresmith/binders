import { GREGORIAN, type Calendar, type Era } from './date';

/* A book's own calendar and its eras, as the binder note keeps them (pure: no Obsidian). Read from two properties:

     calendar:            # absent: the ordinary (Gregorian) calendar
       months:
         - Thaw: 30
         - Seedfall: 30
         - Midwinter: 1   # a month of one day reads as its name alone ("Midwinter 412")
       leap:
         - month: Frost   # a month's name, or its number
           days: 1
           every: 4
           except: 100    # optional
           unless: 400    # optional
     eras:                # absent: years are the book's one count
       - name: Before the Reckoning
         abbr: BR
         counts: down     # its years count down to the next era's start
       - name: The Reckoning
         abbr: R
         from: 1          # the era's first year, on the book's count

   A story date is still written in ISO shape, the year on the book's one count and the month as its number in this
   calendar (`story-date: 0412-10-14` is the 14th of the tenth month, Frost, of year 412). So a renamed month or era, or
   an era moved, changes no note: they only change how a date reads. What is typed with names ("14 Frost 12 R") is
   turned into that shape. */

export interface MonthDef { name: string; days: number }
export interface LeapDef { month: number; days: number; every: number; except?: number; unless?: number }
export interface EraDef { name: string; abbr?: string; from: number | null; down?: boolean }

/** A calendar as the dialog edits it: null months is the ordinary calendar's. */
export interface CalendarDef { months: MonthDef[] | null; leaps: LeapDef[]; eras: EraDef[] }

export const DEFAULT_DEF: CalendarDef = { months: null, leaps: [], eras: [] };

const MAX_YEAR = 9999;
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) ? v : typeof v === 'string' && /^\s*-?\d{1,6}\s*$/.test(v) ? Number(v) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** An era's short name: what is set, or the initials of its name, leaving out "the", "of", "a" and "an" (as Evra does). */
export const eraAbbr = (e: { name: string; abbr?: string }): string =>
	e.abbr?.trim() || e.name.split(/\s+/).filter((w) => w && !/^(the|of|a|an)$/i.test(w)).map((w) => w[0]).join('').toUpperCase();

/** The months a `calendar` property lists: `- Thaw: 30` or `- { name: Thaw, days: 30 }`. Null when it names none (the
    ordinary calendar); an empty list is a book counted in years only. */
function readMonths(v: unknown): MonthDef[] | null {
	if (v === 'none' || (Array.isArray(v) && !v.length)) return [];
	if (!Array.isArray(v)) return null;
	const out: MonthDef[] = [];
	for (const x of v) {
		if (!x || typeof x !== 'object') continue;
		const o = x as Record<string, unknown>;
		const named = 'name' in o ? { name: str(o.name), days: int(o.days) } : Object.keys(o).length === 1 ? { name: Object.keys(o)[0].trim(), days: int(Object.values(o)[0]) } : null;
		if (named && named.name && named.days != null && named.days >= 1 && named.days <= 99) out.push({ name: named.name, days: named.days });
	}
	return out.length ? out.slice(0, 99) : null;
}

/** Reads a binder note's `calendar` and `eras`. Whatever can't be read is passed over, and said in `problems`. */
export function readCalendarDef(calendar: unknown, eras: unknown): { def: CalendarDef; problems: string[] } {
	const problems: string[] = [], def: CalendarDef = { months: null, leaps: [], eras: [] };
	if (calendar && typeof calendar === 'object' && !Array.isArray(calendar)) {
		const c = calendar as Record<string, unknown>;
		def.months = readMonths(c.months);
		if (c.months != null && def.months == null) problems.push('The calendar’s months can’t be read: the ordinary calendar is used.');
		if (def.months?.length) for (const r of Array.isArray(c.leap) ? c.leap : c.leap ? [c.leap] : []) {
			const o = (r ?? {}) as Record<string, unknown>, every = int(o.every), days = int(o.days) ?? 1;
			const m = int(o.month) ?? def.months.findIndex((x) => x.name.toLowerCase() === str(o.month).toLowerCase()) + 1;
			if (every && every > 0 && m >= 1 && m <= def.months.length && days >= 1) def.leaps.push({ month: m, days, every, except: int(o.except) ?? undefined, unless: int(o.unless) ?? undefined });
			else problems.push('A leap rule can’t be read, and is left out.');
		}
	} else if (calendar != null && !/^\s*(gregorian)?\s*$/i.test(str(calendar))) problems.push('The calendar can’t be read: the ordinary calendar is used.');
	for (const e of Array.isArray(eras) ? eras : []) {
		const o = (e ?? {}) as Record<string, unknown>, name = str(o.name);
		if (!name) continue;
		def.eras.push({ name, abbr: str(o.abbr) || undefined, from: int(o.from), down: str(o.counts).toLowerCase() === 'down' });
	}
	// (in order of their first year; one with none runs from the start of time, and only the first can)
	def.eras.sort((a, b) => (a.from ?? -Infinity) - (b.from ?? -Infinity));
	if (def.eras.filter((x) => x.from == null).length > 1) { problems.push('Only the first era can start with no year.'); def.eras = def.eras.filter((x, i) => x.from != null || i === 0); }
	return { def, problems };
}

/** What to write in the binder note for a calendar: `calendar` and `eras`, undefined to take one away. */
export function writeCalendarDef(def: CalendarDef): { calendar: unknown; eras: unknown } {
	const calendar = def.months == null ? undefined : {
		months: def.months.length ? def.months.map((m) => ({ [m.name]: m.days })) : 'none',
		...(def.leaps.length ? { leap: def.leaps.map((r) => ({ month: def.months?.[r.month - 1]?.name ?? r.month, days: r.days, every: r.every, ...(r.except ? { except: r.except } : {}), ...(r.unless ? { unless: r.unless } : {}) })) } : {}),
	};
	const eras = def.eras.length ? def.eras.map((e) => ({ name: e.name, ...(e.abbr ? { abbr: e.abbr } : {}), ...(e.from != null ? { from: e.from } : {}), ...(e.down ? { counts: 'down' } : {}) })) : undefined;
	return { calendar, eras };
}

const fdiv = (a: number, n: number): number => Math.floor(a / n);
// how many k in [a, b) are multiples of n
const multIn = (a: number, b: number, n: number): number => fdiv(b - 1, n) - fdiv(a - 1, n);
const leapsIn = (r: LeapDef, a: number, b: number): number => multIn(a, b, r.every) - (r.except ? multIn(a, b, r.except) - (r.unless ? multIn(a, b, r.unless) : 0) : 0);
const isLeap = (r: LeapDef, y: number): boolean => {
	const on = (n: number) => ((y % n) + n) % n === 0;
	return on(r.every) && !(r.except && on(r.except) && !(r.unless && on(r.unless)));
};

/** The ordinary calendar's year, or a year in a book's eras: "1987", "−30", "12 R", "30 BR". */
function yearNamer(eras: readonly Era[]): (y: number) => string {
	return (y) => {
		const e = eraOf(eras, y);
		if (!e) return y < 0 ? `−${-y}` : String(y);
		return `${e.n} ${e.era.abbr}`;
	};
}

/** The era a year is in, and its number there. */
export function eraOf(eras: readonly Era[], y: number): { era: Era; n: number; index: number } | null {
	for (let i = eras.length - 1; i >= 0; i--) {
		const e = eras[i];
		if (e.from != null && e.from > y) continue;
		const next = eras[i + 1];
		if (e.down && next?.from != null) return { era: e, n: next.from - y, index: i };
		if (e.from == null) return null; // (counting up from no start: no number to give)
		return { era: e, n: y - e.from + 1, index: i };
	}
	return null;
}

/** The year on the book's count for a year typed in an era ("12 R", "R 12", "12 Reckoning"); null when the text names no
    era, or a year the era hasn't got. `rest` is the text with the era's year taken out. */
function eraYear(eras: readonly Era[], text: string): { y: number; rest: string; why?: string } | null {
	if (!eras.length) return null;
	const t = text.trim();
	for (let i = 0; i < eras.length; i++) {
		const e = eras[i], names = [e.abbr, e.name].filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
		const alt = names.join('|');
		const m = new RegExp(`^(.*?)(?:^|\\s|,)(?:(\\d{1,4})\\s*(?:${alt})|(?:${alt})\\s*(\\d{1,4}))$`, 'iu').exec(t);
		if (!m) continue;
		const n = Number(m[2] ?? m[3]), next = eras[i + 1];
		let y: number;
		if (e.down && next?.from != null) y = next.from - n;
		else if (e.from != null) y = e.from + n - 1;
		else continue;
		// (a year past the era's end is the next era's: refused, not read as something else)
		if (n < 1 || (e.from != null && y < e.from) || (next?.from != null && y >= next.from) || Math.abs(y) > MAX_YEAR) {
			const length = e.from != null && next?.from != null ? next.from - e.from : null;
			return { y: NaN, rest: '', why: length != null ? `${e.name} has ${length} ${length === 1 ? 'year' : 'years'}: ${n} ${eraAbbr(e)} isn’t in it.` : `${e.name} has no year ${n}.` };
		}
		return { y, rest: m[1].replace(/[\s,]+$/, '') };
	}
	return null;
}

/** A calendar from what the dialog edits or the binder note says. */
export function makeCalendar(def: CalendarDef): Calendar {
	const eras: Era[] = def.eras.map((e) => ({ name: e.name, abbr: eraAbbr(e), from: e.from, down: !!e.down }));
	const yearName = yearNamer(eras), yearFrom = (text: string) => eraYear(eras, text);
	if (def.months == null) return { ...GREGORIAN, eras, yearName, yearFrom };
	const months = def.months, leaps = def.leaps.filter((r) => r.every > 0 && r.month >= 1 && r.month <= months.length);
	const Y = months.reduce((a, m) => a + m.days, 0);
	// (a book counted in years only has no days to count: a year is given the length of the ordinary one, so that how
	// long a stretch was can still be said in years)
	const plain = Y || 365;
	const yearLength = plain + leaps.reduce((a, r) => a + r.days * (1 / r.every - (r.except ? 1 / r.except : 0) + (r.except && r.unless ? 1 / r.unless : 0)), 0);
	const start = (y: number): number => {
		let t = y * plain;
		for (const r of leaps) t += r.days * (y >= 0 ? leapsIn(r, 0, y) : -leapsIn(r, y, 0));
		return t;
	};
	const lens = (y: number): number[] => {
		const out = months.map((m) => m.days);
		for (const r of leaps) if (isLeap(r, y)) out[r.month - 1] += r.days;
		return out;
	};
	return {
		monthsIn: () => months.length,
		daysIn: (y, m) => (months.length ? lens(y)[m - 1] ?? 0 : plain),
		monthName: (m) => months[m - 1]?.name ?? `Month ${m}`,
		toDay(y, m, d) {
			const l = lens(y);
			let t = start(y);
			for (let i = 0; i < m - 1 && i < l.length; i++) t += l[i];
			return t + d - 1;
		},
		yearLength, monthLength: months.length ? Y / months.length : plain,
		single: (m) => months[m - 1]?.days === 1,
		eras, yearName, yearFrom,
	};
}

/** A calendar is made once for each value the binder note has (a calendar is asked for many times a frame). */
const made = new Map<string, Calendar>();
export function calendarFrom(calendar: unknown, eras: unknown): Calendar {
	if (calendar == null && eras == null) return GREGORIAN;
	const key = JSON.stringify([calendar, eras]);
	let cal = made.get(key);
	if (!cal) {
		if (made.size > 50) made.clear();
		made.set(key, cal = makeCalendar(readCalendarDef(calendar, eras).def));
	}
	return cal;
}

/** The ready-made calendars "Start from" offers, as Evra offers them. */
export const PRESETS: readonly { id: string; title: string; def: () => CalendarDef }[] = [
	{ id: 'gregorian', title: 'The ordinary calendar', def: () => ({ months: null, leaps: [], eras: [] }) },
	{ id: 'twelve', title: 'Twelve months of 30 days', def: () => ({ months: ['Thaw', 'Seedfall', 'Bloom', 'Greening', 'Highsun', 'Longday', 'Ember', 'Harvest', 'Fading', 'Frost', 'Deepnight', 'Stillwater'].map((name) => ({ name, days: 30 })), leaps: [], eras: [] }) },
	{ id: 'moons', title: 'Thirteen moons of 28 days', def: () => ({ months: ['Wolf', 'Snow', 'Worm', 'Seed', 'Flower', 'Rose', 'Thunder', 'Grain', 'Harvest', 'Hunter', 'Frost', 'Long Night', 'Ice'].map((n) => ({ name: `${n} Moon`, days: 28 })), leaps: [], eras: [] }) },
	{ id: 'seasons', title: 'Four seasons of 91 days', def: () => ({ months: ['Spring', 'Summer', 'Autumn', 'Winter'].map((name) => ({ name, days: 91 })), leaps: [], eras: [] }) },
	{ id: 'years', title: 'Years only', def: () => ({ months: [], leaps: [], eras: [] }) },
];
