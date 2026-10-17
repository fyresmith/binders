import { GREGORIAN, type Calendar, type StoryDate } from './date';

/* Moving a story date by a number of days, months or years (pure). "Shift story dates..." uses it to move a run of
   scenes earlier or later together. A date is moved by units it can hold: a day by days, months or years; a month by
   months or years; a year by years. A date asked to move by a unit finer than it says (a month, by days) isn't moved
   (null), and whoever asks leaves it as it is and says so. A typed time goes along. */

export type ShiftUnit = 'd' | 'm' | 'y';

const MAX_YEAR = 9999;

/** The date a day number falls on in a calendar (the inverse of `toDay`); null past the years there are. */
function fromDay(cal: Calendar, day: number): { y: number; m: number; d: number } | null {
	// (a first guess from the calendar's own year, counted from its year 0, then put right: a book's own calendar counts
	// its days from its year 0, the ordinary one from 1970. The search stays within the years there are, so a calendar
	// whose years don't follow one another, from a binder note's leap rules, ends it rather than leaving it to run forever)
	const most = MAX_YEAR + 1;
	let y = Math.max(-most, Math.min(most, Math.floor((day - cal.toDay(0, 1, 1)) / cal.yearLength)));
	// (a calendar whose years average no days has no guess: 0/0 is NaN, and the walk starts from year 0 instead)
	if (!Number.isFinite(y)) y = 0;
	while (cal.toDay(y, 1, 1) > day) if (--y < -most) return null;
	while (cal.toDay(y + 1, 1, 1) <= day) if (++y > most) return null;
	let m = 1;
	while (m < cal.monthsIn(y) && cal.toDay(y, m + 1, 1) <= day) m++;
	return { y, m, d: day - cal.toDay(y, m, 1) + 1 };
}

/** A date moved by `by` units (negative: earlier); null when it can't be moved that way. */
export function shiftDate(date: StoryDate, by: number, unit: ShiftUnit, cal: Calendar = GREGORIAN): StoryDate | null {
	if (!Number.isInteger(by) || !Number.isFinite(date.y)) return null;
	// (the last check before a date is written: a part that isn't a whole number is never let through)
	const out = (y: number, m: number | undefined, d: number | undefined): StoryDate | null => {
		if (!Number.isInteger(y) || Math.abs(y) > MAX_YEAR) return null;
		if ((m != null && !Number.isInteger(m)) || (d != null && !Number.isInteger(d))) return null;
		const x: StoryDate = { y: y + 0 };
		if (m != null) x.m = m;
		if (d != null) x.d = d;
		if (date.minutes != null && d != null) { x.minutes = date.minutes; if (date.seconds != null) x.seconds = date.seconds; }
		return x;
	};
	if (unit === 'd') {
		if (date.d == null) return null;
		const at = fromDay(cal, cal.toDay(date.y, date.m ?? 1, date.d) + by);
		return at ? out(at.y, at.m, at.d) : null;
	}
	if (unit === 'm') {
		if (date.m == null) return null;
		// (months counted from the first of the year, through years that may have different numbers of months)
		let y = date.y, m = date.m + by;
		while (m > cal.monthsIn(y)) { m -= cal.monthsIn(y); y++; if (Math.abs(y) > MAX_YEAR) return null; }
		while (m < 1) { y--; if (Math.abs(y) > MAX_YEAR) return null; m += cal.monthsIn(y); }
		return out(y, m, date.d == null ? undefined : Math.min(date.d, cal.daysIn(y, m)));
	}
	const y = date.y + by, m = date.m == null ? undefined : Math.min(date.m, cal.monthsIn(y));
	return out(y, m, date.d == null || m == null ? undefined : Math.min(date.d, cal.daysIn(y, m)));
}

/** A shift in words: "3 days later", "1 month earlier". */
export function shiftWords(n: number, unit: ShiftUnit, way: 'earlier' | 'later'): string {
	const name = unit === 'd' ? 'day' : unit === 'm' ? 'month' : 'year';
	return `${n} ${name}${n === 1 ? '' : 's'} ${way}`;
}
