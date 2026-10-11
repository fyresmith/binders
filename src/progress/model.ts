/* Progress over time: what a binder's history is, as the dashboard reads it. Pure (no Obsidian).

   The record (record.ts) keeps it in the devices' files; merge.ts adds those together into this shape (`toHistory`),
   and stats.ts works out from it what the window says. */

/** One day of a binder, every device's writing added together. */
export interface Day {
	/** YYYY-MM-DD, local time. */
	day: string;
	/** Words typed and words taken out by typing, by note (its path in the binder, without `.md`), and words that
	    came or went a block at a time (a paste, an import, a chapter deleted): [added, cut, block]. */
	notes: Record<string, [number, number, number]>;
	/** Minutes something was typed in. */
	minutes: number;
	/** Words added in each hour of the day (0 to 23) that had any. */
	hours: Record<number, number>;
	/** Words added on a phone or tablet. */
	phone: number;
	/** How many times the order was changed. */
	moves: number;
	/** The binder's words at the day's end, by status ('' for none). */
	status: Record<string, number>;
	/** The binder's words and scenes as stamped last that day (a day nothing stamped has none), and the words its total
	    changed by that no device typed (null where there is no earlier stamp to tell from). */
	total?: number; scenes?: number; elsewhere?: number | null;
	/** The sittings: the first and last minute of each (minutes since 1970). */
	sittings?: [number, number][];
}

/** Something that happened on a day, that the writer named or did: said on the chart in their own words. */
export interface Mark { day: string; kind: 'snapshot' | 'export' | 'import' | 'deadline'; what: string }

/** A target or a deadline set (or taken away: `to` is ''), on a day: where a plan began. `scope`: the folder it is of
    ('' for the binder), as a path in the binder. */
export interface PlanEvent { day: string; kind: 'target' | 'deadline'; scope: string; from: string; to: string; /** the target then, with a deadline */ words?: number }

export interface History {
	/** The days that have anything, oldest first. */
	days: Day[];
	/** Before the record begins: the binder's words on a few dates, worked out from snapshots and the notes' dates. */
	estimate: { day: string; total: number }[];
	marks: Mark[];
	/** The statuses in the order a draft goes through them. */
	statuses: string[];
	/** How many times the order was changed, on any day (a day with no writing has no `Day` to say it on). */
	orders?: number;
	/** Targets and deadlines set, oldest first. */
	plans?: PlanEvent[];
}

/** The plan to a deadline: a number of words by a date, the weekdays not written on (0 is Sunday), and where the
    plan began (the day the deadline was set, and the words the binder had then). */
export interface Plan { target: number; deadline: string; off: number[]; from: string; fromTotal: number }

// ---- days as numbers: whole days since 1970, with no time zone in them ----
export const num = (day: string): number => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 864e5;
export const dayStr = (n: number): string => new Date(n * 864e5).toISOString().slice(0, 10);
export const weekday = (n: number): number => new Date(n * 864e5).getUTCDay();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const monthName = (m: number, short = false): string => (short ? MONTHS[m].slice(0, 3) : MONTHS[m]);
export const weekdayName = (d: number, short = false): string => (short ? WEEKDAYS[d].slice(0, 3) : WEEKDAYS[d]);
/** "14 November 2024"; `year: false` leaves the year off, `short` shortens the month. */
export function sayDay(n: number, o: { year?: boolean; short?: boolean; weekday?: boolean } = {}): string {
	const d = new Date(n * 864e5);
	return `${o.weekday ? weekdayName(d.getUTCDay()) + ' ' : ''}${d.getUTCDate()} ${monthName(d.getUTCMonth(), o.short)}${o.year === false ? '' : ' ' + d.getUTCFullYear()}`;
}
export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
/** "1 day", "3 days". */
export const count = (n: number, one: string, many = one + 's'): string => `${fmt(n)} ${n === 1 ? one : many}`;
