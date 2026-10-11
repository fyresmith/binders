import { GREGORIAN, compareStoryDates, compareStoryPlaces, readStoryOrder, parseStoryDate, precisionOf, readStoryDate, showStoryDate, storyKey, whyNotStoryDate, writeStoryDate } from '../src/time/date';
import { readSettings } from '../src/settings-data';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const read = (v: unknown) => j(readStoryDate(v));

// reading: every shape
{
	eq(read('1987-06-14'), j({ y: 1987, m: 6, d: 14 }), 'a day');
	eq(read('1987-06'), j({ y: 1987, m: 6 }), 'a month');
	eq(read('1987'), j({ y: 1987 }), 'a year as text');
	eq(read(1987), j({ y: 1987 }), 'a year as a number (YAML reads one)');
	eq(read('0412-10-14'), j({ y: 412, m: 10, d: 14 }), 'a year padded to four digits');
	eq(read('-0030-02-01'), j({ y: -30, m: 2, d: 1 }), 'before year 0');
	eq(read(-30), j({ y: -30 }), 'a negative year as a number');
	eq(read('1987-06-14T21:30'), j({ y: 1987, m: 6, d: 14, minutes: 21 * 60 + 30 }), 'a time');
	eq(read('1987-06-14T21:30:15'), j({ y: 1987, m: 6, d: 14, minutes: 21 * 60 + 30, seconds: 15 }), 'a time with seconds');
	eq(read('1987-06-14 21:30'), j({ y: 1987, m: 6, d: 14, minutes: 21 * 60 + 30 }), 'a space for the T');
	eq(read('  1987-06-14  '), j({ y: 1987, m: 6, d: 14 }), 'spaces around it');
	eq(read(new Date(Date.UTC(1987, 5, 14))), j({ y: 1987, m: 6, d: 14 }), 'a date the YAML reader handed over');
	eq(read(new Date(Date.UTC(1987, 5, 14, 21, 30))), j({ y: 1987, m: 6, d: 14, minutes: 21 * 60 + 30 }), 'with its time');
}

// reading: forgiving, in words
{
	eq(read('14 June 1987'), j({ y: 1987, m: 6, d: 14 }), 'day month year');
	eq(read('June 14, 1987'), j({ y: 1987, m: 6, d: 14 }), 'month day, year');
	eq(read('14th of June, 1987'), j({ y: 1987, m: 6, d: 14 }), 'an ordinal and an “of”');
	eq(read('june 1987'), j({ y: 1987, m: 6 }), 'a month, in any case');
	eq(read('Sept 1987'), j({ y: 1987, m: 9 }), 'a short month');
	eq(read('14 Jun 1987'), j({ y: 1987, m: 6, d: 14 }), 'a three-letter month');
	eq(read('1 February -30'), j({ y: -30, m: 2, d: 1 }), 'a negative year in words');
	eq(read('1 February −30'), j({ y: -30, m: 2, d: 1 }), 'with a real minus sign');
	eq(read('5 March 412'), j({ y: 412, m: 3, d: 5 }), 'a short year');
}

// garbage in
{
	for (const bad of ['sometime in spring', '', '  ', 'June', '1987-6-14', '1987-13', '1987-00', '1987-06-00', '1987-06-31', '1987-02-29', '1987-06-14T25:00', '1987-06-14T21:60', '1987-06T21:30', '1987-06-14T21:30Z', 'the 14th', '31 June 1987', '30 February 2001', '12345', '1987-06-14-02', 'Mara', '14/06/1987'])
		eq(read(bad), 'null', `“${bad}” isn't a date`);
	for (const bad of [null, undefined, true, false, {}, [], ['1987'], 1987.5, NaN, Infinity, 99999, -99999, new Date('nonsense')]) eq(read(bad), 'null', `${String(j(bad))} isn't a date`);
}

// the edges
{
	eq(read('0000'), j({ y: 0 }), 'year 0');
	eq(read(0), j({ y: 0 }), 'year 0 as a number');
	eq(read('-0000'), j({ y: 0 }), '-0000 is year 0, not minus zero');
	ok(Object.is(readStoryDate('-0000')?.y, 0), 'and a real zero');
	eq(read('0000-02-29'), j({ y: 0, m: 2, d: 29 }), 'year 0 is a leap year (it divides by 400)');
	eq(read('2000-02-29'), j({ y: 2000, m: 2, d: 29 }), '29 February in a leap year');
	eq(read('1900-02-29'), 'null', 'not in 1900');
	eq(read('2024-02-29'), j({ y: 2024, m: 2, d: 29 }), 'in 2024');
	eq(read('2023-02-29'), 'null', 'not in 2023');
	eq(read('-0004-02-29'), j({ y: -4, m: 2, d: 29 }), 'a negative leap year');
	eq(read('-0001-02-29'), 'null', 'and a negative common one');
	eq(read('9999-12-31'), j({ y: 9999, m: 12, d: 31 }), 'the last day');
	eq(read('-9999-01-01'), j({ y: -9999, m: 1, d: 1 }), 'the first');
	eq(read('1987-06-14T00:00'), j({ y: 1987, m: 6, d: 14, minutes: 0 }), 'midnight is a time');
	eq(read('1987-06-14T23:59:59'), j({ y: 1987, m: 6, d: 14, minutes: 23 * 60 + 59, seconds: 59 }), 'the last second');
	eq(read('1987-06-14T24:00'), 'null', 'not 24:00');
}

// writing, and what reading gives back
{
	const wrote = (v: unknown) => writeStoryDate(readStoryDate(v)!);
	for (const same of ['1987-06-14', '1987-06', '0412-10-14', '0412-10', '-0030-02-01', '-0030-02', '1987-06-14T21:30', '1987-06-14T21:30:15', '1987-06-14T00:00', '0000-02-29', '0412', '-0030', '0000', '0999'])
		eq(wrote(same), same, `${same} comes back as it was`);
	eq(wrote(1987), 1987, 'a year that was a number stays a number');
	eq(wrote('1987'), 1987, 'a year of four digits is written as YAML reads it: a number');
	eq(typeof wrote('0412'), 'string', 'a year that a number would not keep is text');
	eq(wrote(412), '0412', 'a short year is padded, as text');
	eq(wrote(-30), '-0030', 'a negative year too');
	eq(wrote(0), '0000', 'year 0');
	eq(wrote('14 June 1987'), '1987-06-14', 'a date typed in words is written in ISO shape');
	eq(wrote('June 1987'), '1987-06', 'a month stays a month');
	eq(writeStoryDate({ y: 1987, minutes: 90 }), 1987, 'a time with no day is dropped');
	eq(writeStoryDate({ y: 1987, m: 6, minutes: 90 }), '1987-06', 'and with no day, too');
	eq(writeStoryDate({ y: 1987, m: 6, d: 14, seconds: 5 }), '1987-06-14', 'seconds without minutes are dropped');
	// the written form reads back to the same date, for a spread of them
	for (const y of [-9999, -1000, -31, -1, 0, 1, 99, 100, 999, 1000, 1582, 1987, 2000, 9999]) for (const d of [{ y }, { y, m: 2 }, { y, m: 12, d: 31 }, { y, m: 1, d: 1, minutes: 75 }, { y, m: 3, d: 9, minutes: 1439, seconds: 59 }])
		eq(j(readStoryDate(writeStoryDate(d))), j(d), `${j(d)} survives being written and read`);
}

// ordering
{
	const o = (a: string, b: string) => Math.sign(compareStoryDates(readStoryDate(a)!, readStoryDate(b)!));
	eq(o('1987-06-14', '1987-06-15'), -1, 'a day before the next');
	eq(o('1987-06-30', '1987-07-01'), -1, 'across a month');
	eq(o('1987-12-31', '1988-01-01'), -1, 'across a year');
	eq(o('-0030-02-01', '0000-01-01'), -1, 'before year 0');
	eq(o('-0031-01-01', '-0030-01-01'), -1, 'negative years run the right way');
	eq(o('1987-06', '1987-06-02'), -1, 'a month sits at its start, before the 2nd');
	eq(o('1987-06', '1987-06-01'), -1, 'and is before the 1st: the less exact comes first');
	eq(o('1987', '1987-01'), -1, 'a year before its January');
	eq(o('1987', '1986-12-31'), 1, 'but after the year before');
	eq(o('1987-06-14T09:00', '1987-06-14T21:30'), -1, 'a time orders scenes within a day');
	eq(o('1987-06-14', '1987-06-14T00:30'), -1, 'a day with no time is at its start');
	eq(o('1987-06-14T21:30', '1987-06-14T21:30:05'), -1, 'seconds order too');
	eq(o('1987-06-14T21:30', '1987-06-14T21:30'), 0, 'the same');
	ok(storyKey(readStoryDate('1987-06-14')!) < storyKey(readStoryDate('1987-06-14T00:01')!), 'the sort key follows');
	const days = ['0000-03-01', '0000-02-28', '0000-02-29', '1999-12-31', '2000-01-01', '2000-02-29', '2000-03-01', '-0001-12-31'].map((s) => storyKey(readStoryDate(s)!));
	eq(j([...days].sort((a, b) => a - b).map((k) => days.indexOf(k))), j([7, 1, 2, 0, 3, 4, 5, 6]), 'consecutive days are consecutive, across a leap day and year 0');
	eq(storyKey(readStoryDate('0000-03-01')!) - storyKey(readStoryDate('0000-02-28')!), 2 * 86400, 'two days apart across a leap day');
	eq(storyKey(readStoryDate('0001-01-01')!) - storyKey(readStoryDate('0000-01-01')!), 366 * 86400, 'year 0 has 366 days');
	eq(storyKey(readStoryDate('1970-01-01')!), 0, 'the Unix day is 0');
	eq(GREGORIAN.toDay(1970, 1, 2), 1, 'a calendar says its own day numbers');
}

// precision
{
	eq(precisionOf({ y: 1987 }), 'y', 'a year');
	eq(precisionOf({ y: 1987, m: 6 }), 'm', 'a month');
	eq(precisionOf({ y: 1987, m: 6, d: 14, minutes: 5 }), 'd', 'a day');
}

// shown in words
{
	const s = (v: string) => showStoryDate(readStoryDate(v)!);
	eq(s('1987-06-14'), '14 June 1987', 'a day');
	eq(s('1987-06'), 'June 1987', 'a month');
	eq(s('1987'), '1987', 'a year');
	eq(s('1987-06-14T21:30'), '14 June 1987', 'the finest thing shown is a day');
	eq(s('0412-03-05'), '5 March 412', 'a short year is not padded');
	eq(s('-0030-02-01'), '1 February −30', 'a negative year has a real minus');
	eq(s('0000'), '0', 'year 0');
	eq(s('1987-01-01'), '1 January 1987', 'the first');
	eq(s('1987-12-31'), '31 December 1987', 'the last');
	// what is shown can be typed back
	for (const v of ['1987-06-14', '1987-06', '1987', '-0030-02-01', '0412-03-05', '0000-02-29']) eq(j(parseStoryDate(s(v))), read(v), `${s(v)} reads back as ${v}`);
}

// what is typed
{
	eq(j(parseStoryDate('14 June 1987')), j({ y: 1987, m: 6, d: 14 }), 'typed in words');
	eq(j(parseStoryDate('1987-06-14')), j({ y: 1987, m: 6, d: 14 }), 'typed in ISO');
	eq(whyNotStoryDate('14 June 1987'), null, 'a date has no fault');
	eq(whyNotStoryDate('sometime in spring'), 'That isn’t a date. Try 14 June 1987, June 1987 or 1987.', 'a non-date says what to type');
	ok(/February/.test(whyNotStoryDate('30 February 2001') ?? '') || /isn’t a date/.test(whyNotStoryDate('30 February 2001') ?? ''), 'a day that is not in the month is refused');
	eq(GREGORIAN.monthsIn(1987), 12, 'twelve months');
	eq(GREGORIAN.daysIn(1987, 2), 28, 'February');
	eq(GREGORIAN.daysIn(1988, 2), 29, 'a leap February');
	eq(GREGORIAN.monthName(6), 'June', 'a month’s name');
}

// a calendar of its own can be passed in
{
	const cal = { monthsIn: () => 2, daysIn: () => 10, monthName: (m: number) => (m === 1 ? 'Thaw' : 'Frost'), toDay: (y: number, m: number, d: number) => y * 20 + (m - 1) * 10 + d - 1 };
	eq(j(readStoryDate('0001-02-10', cal)), j({ y: 1, m: 2, d: 10 }), 'its 10th day of the second month');
	eq(read('0001-02-10'), j({ y: 1, m: 2, d: 10 }), 'is also Gregorian’s (in the second month)');
	eq(readStoryDate('0001-03-01', cal), null, 'but it has no third month');
	eq(readStoryDate('0001-01-11', cal), null, 'nor an 11th day');
	eq(storyKey({ y: 1, m: 2, d: 10 }, cal), 39 * 86400, 'its days are counted its own way');
	eq(showStoryDate({ y: 1, m: 2, d: 10 }, cal), '10 Frost 1', 'and named its own way');
	eq(j(parseStoryDate('3 Thaw 2', cal)), j({ y: 2, m: 1, d: 3 }), 'and typed its own way');
}

// story-order
{
	eq(readStoryOrder(2), 2, 'a number');
	eq(readStoryOrder('3'), 3, 'text that is one');
	eq(readStoryOrder(' 4 '), 4, 'with spaces');
	eq(readStoryOrder(0), 0, 'zero');
	eq(readStoryOrder(-1), -1, 'a negative whole number');
	for (const bad of [1.5, '1.5', 'second', '', null, undefined, true, [1], NaN, Infinity, '3rd']) eq(readStoryOrder(bad), null, `${j(bad)} is ignored`);
	const P = (s: string, order: number | null = null) => ({ date: readStoryDate(s)!, order });
	const sorted = (list: [string, number | null][]) => list.map(([s, o], i) => ({ i, p: P(s, o) })).sort((a, b) => compareStoryPlaces(a.p, b.p) || a.i - b.i).map((x) => x.i);
	eq(j(sorted([['1987-06-14', 2], ['1987-06-14', 1], ['1987-06-14', 3]])), j([1, 0, 2]), 'one day: by story-order');
	eq(j(sorted([['1987-06-14', null], ['1987-06-14', null], ['1987-06-14', null]])), j([0, 1, 2]), 'neither: manuscript order');
	eq(j(sorted([['1987-06-14', null], ['1987-06-14', 1], ['1987-06-14', null], ['1987-06-14', 2]])), j([1, 3, 0, 2]), 'those with an order first, the rest after them in manuscript order');
	eq(j(sorted([['1987-06-14T21:00', 1], ['1987-06-14T09:00', 2], ['1987-06-14T15:00', 3]])), j([1, 2, 0]), 'timed: by time, whatever story-order says');
	eq(j(sorted([['1987-06-14T09:00', 2], ['1987-06-14T09:00', 1]])), j([1, 0]), 'the same time: by story-order');
	eq(j(sorted([['1987-06-14T09:00', null], ['1987-06-14T09:00', null]])), j([0, 1]), 'the same time, no order: manuscript order');
	eq(j(sorted([['1987-06-14T09:00', 1], ['1987-06-14', 5], ['1987-06-14', 2]])), j([2, 1, 0]), 'timed and untimed on one day: the untimed first, by story-order, then the timed');
	eq(j(sorted([['1987-06-15', 1], ['1987-06-14', 9]])), j([1, 0]), 'story-order never crosses days');
	eq(j(sorted([['1987-06', 2], ['1987-06', 1], ['1987-06-01', 1]])), j([1, 0, 2]), 'a month: its own value orders among itself, before the 1st');
	eq(j(sorted([['1987', 2], ['1987', 1], ['1987-01', 1]])), j([1, 0, 2]), 'a year, the same');
}

// the setting
{
	eq(readSettings({}).storyDateProp, 'story-date', 'the property is “story-date” until settings say otherwise');
	eq(readSettings({ storyDateProp: ' when ' }).storyDateProp, 'when', 'its name, as saved');
	eq(readSettings({}).storyOrderProp, 'story-order', 'and the order’s “story-order”');
	eq(readSettings({ storyDateProp: '  ' }).storyDateProp, 'story-date', 'blank is the default');
}

done();
