/* A deadline: what is kept in a note's properties, how a plan is read from it, and what a form may ask for. Pure (no
   Obsidian). stats.ts works the plan out (`pace`); this makes the `Plan` it needs from the properties and the record.

   Two optional properties, on the binder's note or a folder's: `deadline` (a date, YYYY-MM-DD: Obsidian's own date
   type) and `writing-days` (a list of weekday names; none means every day). The target is the one the note already
   has (settings name it). */

import { dayStr, num, type History, type Plan } from './model';
import { baseOf, type Row } from './stats';

export const DEADLINE_PROP = 'deadline';
export const DAYS_PROP = 'writing-days';

const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The week as a writer has it, Monday first. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** A date property's value as YYYY-MM-DD (a date, or a date and a time), or null if it isn't a real day. */
export function readDeadline(v: unknown): string | null {
	const m = typeof v === 'string' ? /^\s*(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(v) : null;
	if (!m) return null;
	const day = `${m[1]}-${m[2]}-${m[3]}`;
	return dayStr(num(day)) === day ? day : null;
}

/** The weekdays written on (0 is Sunday), from a list of names, or one text with commas. Names are read in any case,
    and by their first three letters; anything else is left out. No names, or none that are known: every day. */
export function readWritingDays(v: unknown): number[] {
	const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [];
	const out = new Set<number>();
	for (const x of list) {
		if (typeof x !== 'string') continue;
		const k = x.trim().toLowerCase().slice(0, 3), at = NAMES.findIndex((n) => n.toLowerCase().slice(0, 3) === k);
		if (k.length >= 3 && at >= 0) out.add(at);
	}
	return out.size ? WEEK.filter((d) => out.has(d)) : [...ALL_DAYS];
}

/** The weekdays not written on. */
export const offDays = (days: readonly number[]): number[] => ALL_DAYS.filter((d) => !days.includes(d));

/** The weekdays as the property keeps them: names, Monday first; undefined (the property taken away) for every day. */
export function writeWritingDays(days: readonly number[]): string[] | undefined {
	const on = WEEK.filter((d) => days.includes(d));
	return on.length === 7 || !on.length ? undefined : on.map((d) => NAMES[d]);
}

/** The weekdays in a sentence: "weekdays", "Monday, Wednesday and Friday". */
export function saidDays(days: readonly number[]): string {
	const on = WEEK.filter((d) => days.includes(d)), key = on.join(',');
	if (on.length === 7) return 'every day';
	if (key === '1,2,3,4,5') return 'weekdays';
	if (key === '6,0') return 'weekends';
	const names = on.map((d) => NAMES[d]);
	return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'no day';
}

/** Where the plan began: the day the deadline (or the target) was last set in the record, with the words the book had
    at the start of that day. A deadline the record never saw set (one from before the record, or from a device that
    doesn't record) begins at the record's first day, with the words the book had then. Null without a target and a
    deadline, or without a record to begin in. */
export function planFrom(h: History, rs: Row[], scope: string, o: { target: number; deadline: string | null; days: readonly number[] }, today: string): Plan | null {
	if (!(o.target > 0) || !o.deadline || !rs.length) return null;
	const t = num(today), set = (h.plans ?? []).filter((e) => e.scope === scope && num(e.day) <= t).pop();
	let from = rs[0].n, fromTotal = baseOf(rs);
	if (set && num(set.day) > rs[0].n) {
		from = num(set.day);
		const before = rs.filter((r) => r.n < from).pop();
		fromTotal = before ? before.total : fromTotal;
	}
	return { target: o.target, deadline: o.deadline, off: offDays(o.days), from: dayStr(from), fromTotal };
}

/** Why the form can't set this, in words for the writer, or null. `total`: the words the book has; `today`: YYYY-MM-DD. */
export function planProblem(o: { target: number; deadline: string; days: readonly number[]; total: number }, today: string): string | null {
	if (!(o.target > 0)) return 'Give the number of words the book is to have.';
	if (o.target <= o.total) return `The book has ${Math.round(o.total).toLocaleString('en-US')} words already. Choose a target above that.`;
	if (!readDeadline(o.deadline)) return 'Choose a date for the deadline.';
	if (num(o.deadline) < num(today)) return 'That date has passed. Choose today or a later day.';
	if (!o.days.length) return 'Choose at least one day to write on.';
	const comes = (d: number): boolean => { for (let n = num(today); n <= num(o.deadline); n++) if (new Date(n * 864e5).getUTCDay() === d) return true; return false; };
	if (!o.days.some(comes)) return 'None of the days chosen comes before the deadline.';
	return null;
}
