/* A scene's place in story time, as a property of the note: `story-date: 1987-06-14`. Pure, so it can be unit-tested.

   It is written as ISO text in the book's calendar: a day (`1987-06-14`), a month (`1987-06`) or a year (`1987`, which
   YAML reads as a number), a year padded to four digits (`0412-10-14`) and with a minus sign before year 0
   (`-0030-02-01`). A time (`1987-06-14T21:30`) is read and kept, and orders scenes within a day; the finest thing shown
   or set is a day. Months are numbers, so a renamed month breaks nothing.

   Reading is forgiving ("14 June 1987" is read too) and writing is exact. Something that isn't a date is `null` here,
   and whoever holds the property leaves it exactly as typed. The calendar is Gregorian; a book's own calendar is passed
   in as a `Calendar` (nothing but `GREGORIAN` is built yet). */

/** A date as written: month and day count from 1; a time only with a day. */
export interface StoryDate { y: number; m?: number; d?: number; minutes?: number; seconds?: number }

/** What a calendar says about its months and days. */
export interface Calendar {
	/** How many months there are in a year. */
	monthsIn(y: number): number;
	/** How many days there are in a month of a year. */
	daysIn(y: number, m: number): number;
	/** A month's name (from 1). */
	monthName(m: number): string;
	/** The day's number, counted from one fixed day, for a date that exists in this calendar. */
	toDay(y: number, m: number, d: number): number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const leap = (y: number): boolean => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);

/** The Gregorian calendar, carried back before its time (so year 0 is a leap year, as in astronomy). The day number is
    the days since 1970-01-01. */
export const GREGORIAN: Calendar = {
	monthsIn: () => 12,
	daysIn: (y, m) => (m === 2 ? (leap(y) ? 29 : 28) : m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31),
	monthName: (m) => MONTHS[m - 1] ?? '',
	toDay(y, m, d) {
		// (days from civil: the era is 400 years, which has a whole number of weeks)
		const yy = m <= 2 ? y - 1 : y, era = Math.floor(yy / 400), yoe = yy - era * 400;
		const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
		return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
	},
};

const MAX_YEAR = 9999;

/** Is this a date that exists? */
function exists(y: number, m: number | undefined, d: number | undefined, cal: Calendar): boolean {
	if (!Number.isInteger(y) || Math.abs(y) > MAX_YEAR) return false;
	if (m == null) return d == null;
	if (!Number.isInteger(m) || m < 1 || m > cal.monthsIn(y)) return false;
	return d == null || (Number.isInteger(d) && d >= 1 && d <= cal.daysIn(y, m));
}

/** A date from its parts, or null if it doesn't exist. */
function make(y: number, m: number | undefined, d: number | undefined, cal: Calendar, h?: number, mi?: number, s?: number): StoryDate | null {
	if (!exists(y, m, d, cal)) return null;
	const out: StoryDate = { y: y + 0 }; // (+ 0: not minus zero)
	if (m != null) out.m = m;
	if (d != null) out.d = d;
	if (h != null && mi != null) {
		if (d == null || h > 23 || mi > 59 || (s != null && s > 59)) return null;
		out.minutes = h * 60 + mi;
		if (s != null) out.seconds = s;
	}
	return out;
}

const ISO = /^(-?\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?)?)?$/;
const YEAR = /^-?\d{1,4}$/;
const num = (s: string | undefined): number | undefined => (s == null ? undefined : Number(s));

/** A month named in a date in words: its whole name, or the start of it from three letters ("Sept"). */
function monthNamed(word: string, y: number, cal: Calendar): number | null {
	const w = word.toLowerCase().replace(/\.$/, '');
	if (w.length < 3) return null;
	for (let m = 1; m <= cal.monthsIn(y); m++) if (cal.monthName(m).toLowerCase().startsWith(w)) return m;
	return null;
}

/** A date typed in words: "14 June 1987", "June 14, 1987", "14th of June 1987", "June 1987". */
function inWords(typed: string, cal: Calendar): StoryDate | null {
	const t = typed.replace(/−/g, '-').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
	const ord = '(?:st|nd|rd|th)?';
	let m = new RegExp(`^(\\d{1,2})${ord} (?:of )?([A-Za-z]+\\.?) (-?\\d{1,4})$`, 'i').exec(t);
	if (m) { const y = Number(m[3]), mo = monthNamed(m[2], y, cal); return mo ? make(y, mo, Number(m[1]), cal) : null; }
	m = new RegExp(`^([A-Za-z]+\\.?) (\\d{1,2})${ord} (-?\\d{1,4})$`, 'i').exec(t);
	if (m) { const y = Number(m[3]), mo = monthNamed(m[1], y, cal); return mo ? make(y, mo, Number(m[2]), cal) : null; }
	m = /^([A-Za-z]+\.?) (-?\d{1,4})$/.exec(t);
	if (m) { const y = Number(m[2]), mo = monthNamed(m[1], y, cal); return mo ? make(y, mo, undefined, cal) : null; }
	return null;
}

/** A date from text, in ISO shape or in words; null for anything else. */
export function parseStoryDate(text: string, cal: Calendar = GREGORIAN): StoryDate | null {
	const t = text.replace(/−/g, '-').trim();
	if (YEAR.test(t)) return make(Number(t), undefined, undefined, cal);
	const iso = ISO.exec(t);
	if (iso) return make(Number(iso[1]), num(iso[2]), num(iso[3]), cal, num(iso[4]), num(iso[5]), num(iso[6]));
	return inWords(text, cal);
}

/** A date from what a property holds: text, a number (a year), or a date the YAML reader made. Null if it isn't one. */
export function readStoryDate(v: unknown, cal: Calendar = GREGORIAN): StoryDate | null {
	if (typeof v === 'string') return parseStoryDate(v, cal);
	if (typeof v === 'number') return Number.isInteger(v) ? make(v, undefined, undefined, cal) : null;
	if (v instanceof Date && !isNaN(v.getTime())) {
		const mins = v.getUTCHours() * 60 + v.getUTCMinutes(), out = make(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), cal);
		if (out && mins) out.minutes = mins;
		return out;
	}
	return null;
}

const pad = (n: number, to: number): string => String(n).padStart(to, '0');

/** What to write in the property: ISO text, except a year of four digits, which is the number YAML reads (a year that
    a number would change, `0412` or `-30`, is padded text). A time with no day isn't written. */
export function writeStoryDate(d: StoryDate): string | number {
	if (d.m == null) return d.y >= 1000 && d.y <= MAX_YEAR ? d.y : (d.y < 0 ? '-' : '') + pad(Math.abs(d.y), 4);
	let s = `${d.y < 0 ? '-' : ''}${pad(Math.abs(d.y), 4)}-${pad(d.m, 2)}`;
	if (d.d == null) return s;
	s += `-${pad(d.d, 2)}`;
	if (d.minutes != null) {
		s += `T${pad(Math.floor(d.minutes / 60), 2)}:${pad(d.minutes % 60, 2)}`;
		if (d.seconds != null) s += `:${pad(d.seconds, 2)}`;
	}
	return s;
}

/** How exact a date is. */
export function precisionOf(d: StoryDate): 'y' | 'm' | 'd' { return d.m == null ? 'y' : d.d == null ? 'm' : 'd'; }

/** Where a date falls, as one number to sort by: seconds from the calendar's first day. A month is at its start, a year
    at its first day. */
export function storyKey(d: StoryDate, cal: Calendar = GREGORIAN): number {
	return cal.toDay(d.y, d.m ?? 1, d.d ?? 1) * 86400 + (d.minutes ?? 0) * 60 + (d.seconds ?? 0);
}

const EXACT = { y: 0, m: 1, d: 2 } as const;

/** Orders two dates; where they start together, the less exact comes first ("June 1987" before the 1st). */
export function compareStoryDates(a: StoryDate, b: StoryDate, cal: Calendar = GREGORIAN): number {
	return storyKey(a, cal) - storyKey(b, cal) || EXACT[precisionOf(a)] - EXACT[precisionOf(b)];
}

/** A date in words: "14 June 1987", "June 1987", "1987". A time isn't shown. */
export function showStoryDate(d: StoryDate, cal: Calendar = GREGORIAN): string {
	const year = d.y < 0 ? `−${-d.y}` : String(d.y);
	return d.m == null ? year : d.d == null ? `${cal.monthName(d.m)} ${year}` : `${d.d} ${cal.monthName(d.m)} ${year}`;
}

/** Why what's typed can't be a story date, in words for the writer; null if it can (or is empty, which takes the date
    away). */
export function whyNotStoryDate(typed: string, cal: Calendar = GREGORIAN): string | null {
	return !typed.trim() || parseStoryDate(typed, cal) ? null : 'That isn’t a date. Try 14 June 1987, June 1987 or 1987.';
}

/** A scene's place among the scenes of its day, from `story-order`: a whole number, or text that is one. Anything else
    is ignored (null) and left as typed. */
export function readStoryOrder(v: unknown): number | null {
	const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*-?\d{1,15}\s*$/.test(v) ? Number(v) : NaN;
	return Number.isSafeInteger(n) ? n + 0 : null;
}

/** A scene as the story orders it: its date, and its `story-order` if it has one. */
export interface StoryPlace { date: StoryDate; order: number | null }

/** Orders two dated scenes (a tie, 0, is the manuscript's to settle): by date, where a time typed in is part of the date;
    then, among scenes with the same date to the second and the same exactness, by `story-order`, those without one after
    those with. So on a day, scenes with no time come first, by `story-order`, then the timed ones by their time (and
    by `story-order` among the same time); `story-order` of a day means something only among scenes sharing the exact
    value ("June 1987" scenes order among themselves, apart from the days in it). */
export function compareStoryPlaces(a: StoryPlace, b: StoryPlace, cal: Calendar = GREGORIAN): number {
	const c = compareStoryDates(a.date, b.date, cal);
	if (c) return c;
	if (a.order == null || b.order == null) return a.order == null ? (b.order == null ? 0 : 1) : -1;
	return a.order - b.order;
}
