import { PRESETS, calendarFrom, eraAbbr, eraOf, makeCalendar, readCalendarDef, writeCalendarDef } from '../src/time/calendar';
import { GREGORIAN, compareStoryDates, exampleDates, parseStoryDate, readStoryDate, showStoryDate, storyKey, whyNotStoryDate, writeStoryDate } from '../src/time/date';
import { shiftDate } from '../src/time/shift';
import { dateText, dropTargets, gapText, span, timeline, unfoldTargets } from '../src/view/timeline-data';
import { daysOf, kindFrom, passes, problem } from '../src/filter/conditions';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const MONTHS = ['Thaw', 'Seedfall', 'Bloom', 'Greening', 'Highsun', 'Longday', 'Midsummer', 'Ember', 'Harvest', 'Fading', 'Frost', 'Deepnight', 'Stillwater'];
const CALENDAR = { months: MONTHS.map((m) => ({ [m]: m === 'Midsummer' ? 1 : 30 })), leap: [{ month: 'Midsummer', days: 1, every: 4 }] };
const ERAS = [{ name: 'Before the Drowning', abbr: 'BD', counts: 'down' }, { name: 'The Age of Lamps', abbr: 'AL', from: 1 }, { name: 'The Long Quiet', abbr: 'LQ', from: 803 }];
const cal = calendarFrom(CALENDAR, ERAS);
const parse = (t: string) => { const d = parseStoryDate(t, cal); return d ? writeStoryDate(d) : null; };

// reading the binder note
{
	const { def, problems } = readCalendarDef(CALENDAR, ERAS);
	eq(j(problems), '[]', 'a calendar written as the docs say is read whole');
	eq(def.months?.length, 13, 'its thirteen months');
	eq(j(def.months?.[6]), j({ name: 'Midsummer', days: 1 }), 'a month as `- Midsummer: 1`');
	eq(j(def.leaps), j([{ month: 7, days: 1, every: 4 }]), 'a leap rule naming its month by name');
	eq(j(readCalendarDef({ months: [{ name: 'Thaw', days: 30 }, { name: 'Frost', days: 31 }] }, null).def.months), j([{ name: 'Thaw', days: 30 }, { name: 'Frost', days: 31 }]), 'a month as `{ name, days }` too');
	eq(j(readCalendarDef({ months: 'none' }, null).def.months), '[]', '`months: none` is a book counted in years only');
	eq(readCalendarDef(null, null).def.months, null, 'no calendar is the ordinary one');
	eq(readCalendarDef('Gregorian', null).problems.length, 0, '`calendar: Gregorian` names the ordinary one');
	ok(readCalendarDef('Middle-earth', null).problems.length > 0, 'a calendar that is text and no calendar is a problem');
	ok(readCalendarDef({ months: 'twelve' }, null).problems.length > 0, 'months that can’t be read are a problem');
	ok(readCalendarDef({ months: [{ Thaw: 30 }], leap: [{ month: 'Frost', every: 4 }] }, null).problems.length > 0, 'a leap rule for a month there isn’t is a problem');
	ok(readCalendarDef(null, [{ name: 'A' }, { name: 'B' }]).problems.length > 0, 'two eras with no first year is a problem');
	eq(j(readCalendarDef(null, ERAS).def.eras.map((e) => e.name)), j(['Before the Drowning', 'The Age of Lamps', 'The Long Quiet']), 'eras in order of their first year');
	eq(j(readCalendarDef(null, [ERAS[2], ERAS[0], ERAS[1]]).def.eras.map((e) => e.abbr)), j(['BD', 'AL', 'LQ']), 'whatever order the note lists them in');
	eq(readCalendarDef(null, [{ name: '' }, 'nonsense', null]).def.eras.length, 0, 'an era with no name is passed over');
}

// writing it back: what was read, as the docs show it
{
	const { def } = readCalendarDef(CALENDAR, ERAS);
	const w = writeCalendarDef(def);
	eq(j((w.calendar as { months: unknown[] }).months[0]), j({ Thaw: 30 }), 'months as `- Thaw: 30`');
	eq(j((w.calendar as { leap: unknown[] }).leap), j([{ month: 'Midsummer', days: 1, every: 4 }]), 'a leap rule by its month’s name');
	eq(j(w.eras), j([{ name: 'Before the Drowning', abbr: 'BD', counts: 'down' }, { name: 'The Age of Lamps', abbr: 'AL', from: 1 }, { name: 'The Long Quiet', abbr: 'LQ', from: 803 }]), 'eras as the note had them');
	eq(j(readCalendarDef(w.calendar, w.eras).def), j(def), 'and read again, the same calendar');
	const plain = writeCalendarDef({ months: null, leaps: [], eras: [] });
	eq(plain.calendar, undefined, 'the ordinary calendar takes `calendar` away');
	eq(plain.eras, undefined, 'and no eras take `eras` away');
	eq((writeCalendarDef({ months: [], leaps: [], eras: [] }).calendar as { months: unknown }).months, 'none', 'years only is `months: none`');
}

// the calendar: days, leap years, order
{
	eq(cal.monthsIn(1), 13, 'thirteen months');
	eq(cal.daysIn(1, 7), 1, 'Midsummer is one day');
	eq(cal.daysIn(4, 7), 2, 'and two in a leap year');
	eq(cal.yearLength, 361.25, 'a year is 361¼ days on average');
	eq(cal.toDay(1, 1, 1) - cal.toDay(0, 1, 1), 362, 'year 0 is a leap year, as in the ordinary calendar carried back');
	eq(cal.toDay(5, 1, 1) - cal.toDay(4, 1, 1), 362, 'year 4 has its leap day');
	eq(cal.toDay(-3, 1, 1) - cal.toDay(-4, 1, 1), 362, 'and so does year −4');
	eq(cal.toDay(802, 8, 1) - cal.toDay(802, 7, 1), 1, 'the day after Midsummer is the first of Ember');
	ok(storyKey({ y: 802, m: 13, d: 30 }, cal) < storyKey({ y: 803, m: 1, d: 1 }, cal), 'the last day of a year is before the first of the next');
	ok(compareStoryDates({ y: 802, m: 11 }, { y: 802, m: 11, d: 1 }, cal) < 0, 'a month comes before its first day');
	eq(j(span({ y: 802 }, cal).map((x) => x - cal.toDay(802, 1, 1))), j([0, 360]), 'a year covers all of itself');
	const leapless = makeCalendar({ months: [{ name: 'A', days: 10 }], leaps: [{ month: 1, days: 1, every: 4, except: 100, unless: 400 }], eras: [] });
	eq(leapless.daysIn(100, 1), 10, 'except every 100');
	eq(leapless.daysIn(400, 1), 11, 'unless every 400');
	eq(leapless.daysIn(104, 1), 11, 'every 4');
}

// eras: counting up, counting down, from the start of time
{
	eq(eraAbbr({ name: 'The Age of Lamps' }), 'AL', 'a short name from the initials, without “the” and “of”');
	eq(eraAbbr({ name: 'The Age of Lamps', abbr: 'Lamps' }), 'Lamps', 'or the one the writer set');
	eq(cal.yearName(802), '802 AL', 'a year in an era counting up from 1');
	eq(cal.yearName(803), '1 LQ', 'the first year of the next era');
	eq(cal.yearName(0), '1 BD', 'an era counting down ends at 1, the year before the next begins');
	eq(cal.yearName(-39), '40 BD', 'and counts back from there');
	eq(eraOf(cal.eras, 900)?.era.name, 'The Long Quiet', 'which era a year is in');
	const late = calendarFrom(null, [{ name: 'Second Age', abbr: 'SA', from: 591 }]);
	eq(late.yearName(12), '12', 'a year before the first era is the plain count');
	eq(late.yearName(-5), '−5', 'with a minus before year 0');
	eq(late.yearName(600), '10 SA', 'one era is enough');
	const bc = calendarFrom(null, [{ name: 'Before Christ', abbr: 'BC', counts: 'down' }, { name: 'Anno Domini', abbr: 'AD', from: 1 }]);
	eq(bc.yearName(0), '1 BC', 'BC and AD from two eras: year 0 is 1 BC');
	eq(showStoryDate({ y: -43, m: 3, d: 15 }, bc), '15 March 44 BC', 'on the ordinary calendar');
	eq(j(parseStoryDate('15 March 44 BC', bc)), j({ y: -43, m: 3, d: 15 }), 'and typed so');
}

// typing a date in the book's calendar
{
	eq(parse('14 Frost 802'), '0802-11-14', 'a day, in the book’s month');
	eq(parse('Frost 802'), '0802-11', 'a month');
	eq(parse('frost 14, 802'), '0802-11-14', 'month first, in any case');
	eq(parse('14th of Frost 802'), '0802-11-14', 'an ordinal and an “of”');
	eq(parse('14 Fro 802'), '0802-11-14', 'the start of a month’s name');
	eq(parse('14 Frost 12 LQ'), '0814-11-14', 'a year in an era, written on the one count');
	eq(parse('LQ 12'), '0814', 'the short name before the year');
	eq(parse('12 The Long Quiet'), '0814', 'the era’s whole name');
	eq(parse('30 BD'), '-0029', 'an era counting down');
	eq(parse('Midsummer 3 AL'), '0003-07', 'a festival month');
	eq(parse('0802-11-14'), '0802-11-14', 'ISO shape, as written');
	eq(parse('0802-13-30'), '0802-13-30', 'the thirteenth month');
	eq(parse('31 Frost 802'), null, 'a day the month hasn’t got');
	eq(parse('0802-14-01'), null, 'a month the calendar hasn’t got');
	eq(parse('14 June 802'), null, 'a month of another calendar');
	eq(parse('900 AL'), null, 'a year past the era’s end');
	const many = calendarFrom({ months: [{ 'Long Night Moon': 28 }, { Ærn: 28 }] }, null);
	eq(j(parseStoryDate('3 Long Night Moon 12', many)), j({ y: 12, m: 1, d: 3 }), 'a month’s name of several words');
	eq(j(parseStoryDate('Ærn 12', many)), j({ y: 12, m: 2 }), 'in any letters');
	eq(j(readStoryDate('0802-13-30', cal)), j({ y: 802, m: 13, d: 30 }), 'a property read in the book’s calendar');
	eq(readStoryDate('0802-13-30'), null, 'and not in the ordinary one');
}

// showing it
{
	eq(showStoryDate({ y: 802, m: 11, d: 14 }, cal), '14 Frost 802 AL', 'a day');
	eq(showStoryDate({ y: 802, m: 7 }, cal), 'Midsummer 802 AL', 'a festival');
	eq(showStoryDate({ y: 802, m: 7, d: 1 }, cal), 'Midsummer 802 AL', 'a month of one day is its name alone');
	eq(dateText({ y: 802, m: 11, d: 14 }, { short: true }, cal), '14 Frost', 'the ruler doesn’t cut a book’s own month to three letters');
	eq(dateText({ y: 1987, m: 6, d: 14 }, { short: true }), '14 Jun', 'the ordinary calendar’s ruler still does');
	eq(dateText({ y: 814 }, {}, cal), '12 LQ', 'a year alone, in its era');
	eq(exampleDates(cal), '14 Bloom 12 LQ, Bloom 12 LQ or 12 LQ', 'how to type a date, in the book’s calendar');
	eq(exampleDates(GREGORIAN), '14 June 1987, June 1987 or 1987', 'and in the ordinary one, as it was');
	eq(exampleDates(calendarFrom({ months: 'none' }, null)), '1987', 'a book of years only types a year');
}

// a refusal says why
{
	eq(whyNotStoryDate('31 Frost 802', cal), 'Frost has 30 days.', 'a day the month hasn’t got');
	eq(whyNotStoryDate('2 Midsummer 801', cal), 'Midsummer has 1 day in 801 AL.', 'a month whose length changes says in which year');
	eq(whyNotStoryDate('0802-14-01', cal), 'This book’s calendar has 13 months.', 'a month past the last');
	eq(whyNotStoryDate('14 Brumaire 802', cal), 'This book’s calendar has no month “Brumaire”.', 'a month it hasn’t got');
	eq(whyNotStoryDate('900 AL', cal), 'The Age of Lamps has 802 years: 900 AL isn’t in it.', 'a year past an era’s end');
	eq(whyNotStoryDate('sometime in spring', cal), 'That isn’t a date. Try 14 Bloom 12 LQ, Bloom 12 LQ or 12 LQ.', 'what isn’t a date says how one is typed');
	eq(whyNotStoryDate('30 February 2001'), 'February has 28 days in 2001.', 'the ordinary calendar says why too');
	eq(whyNotStoryDate('31 June 1987'), 'June has 30 days.', 'a month of one length says no year');
	eq(whyNotStoryDate('1987-13'), 'A year has 12 months.', 'a thirteenth month');
	eq(whyNotStoryDate('Smarch 1987'), 'That isn’t a date. Try 14 June 1987, June 1987 or 1987.', 'a word that is no month, as before');
	eq(whyNotStoryDate('14 Frost 802', cal), null, 'a date is no refusal');
}

// the timeline's model in the book's calendar
{
	eq(gapText(cal.toDay(814, 1, 1) - cal.toDay(803, 1, 1), cal), '11 years', 'a gap in the book’s years');
	eq(gapText(120, cal), '4 months', 'in its months');
	eq(gapText(20, cal), '20 days', 'no weeks in a calendar that has none');
	eq(gapText(20), '3 weeks', 'the ordinary one keeps its weeks');
	eq(j(dropTargets({ y: 802, m: 7 }, { y: 802, m: 11, d: 14 }, cal).dates), j([{ y: 802, m: 8 }, { y: 802, m: 9 }, { y: 802, m: 10 }]), 'a gap unfolds into the book’s months');
	eq(dropTargets({ y: 802, m: 13, d: 29 }, { y: 803, m: 1, d: 2 }, cal).dates.map((d) => writeStoryDate(d)).join(), '0802-13-30,0803-01-01', 'and into its days, over the end of a year of thirteen months');
	eq(unfoldTargets({ y: 803 }, { y: 842 }, cal).dates.length, 38, 'its years');
	const items = ['a', 'b', 'c'], at: Record<string, string> = { a: '0802-13', b: '0001-01', c: '0803-01-01' };
	eq(timeline(items, (i) => ({ date: readStoryDate(at[i], cal)!, order: null }), cal).groups.map((g) => g.items[0]).join(), 'b,a,c', 'dates in the book’s order');
}

// shifting in the book's calendar
{
	eq(j(shiftDate({ y: 802, m: 13, d: 30 }, 1, 'd', cal)), j({ y: 803, m: 1, d: 1 }), 'a day later, over the end of the year');
	eq(j(shiftDate({ y: 802, m: 6, d: 30 }, 1, 'd', cal)), j({ y: 802, m: 7, d: 1 }), 'into the festival');
	eq(j(shiftDate({ y: 802, m: 12 }, 2, 'm', cal)), j({ y: 803, m: 1 }), 'two months later, in a year of thirteen');
	eq(j(shiftDate({ y: 8000, m: 3, d: 4 }, -10, 'd', cal)), j({ y: 8000, m: 2, d: 24 }), 'far from year 0, the search starts near enough');
	eq(j(shiftDate({ y: 8000, m: 1, d: 4 }, -10, 'd', cal)), j({ y: 7999, m: 13, d: 24 }), 'and over the end of a year');
	eq(j(shiftDate({ y: -39 }, 40, 'y', cal)), j({ y: 1 }), 'by years, from an era counting down');
}

// filters: a date compared in the book's calendar
{
	ok(!!daysOf('0802-13-30', cal), 'the thirteenth month is a date to a filter in this book');
	eq(daysOf('0802-13-30'), null, 'and not in the ordinary calendar');
	const env = { resolve: () => null, cal };
	const before = { property: 'story-date', operator: 'before', value: '0803' };
	ok(passes(before, 'date', '0802-13-30', env), 'Stillwater 802 is before 803');
	ok(!passes(before, 'date', '0803-01-01', env), 'and the first of 803 isn’t');
	eq(problem({ property: 'story-date', operator: 'before', value: 'someday' }, 'date', cal), 'That isn’t a date. Try 14 Bloom 12 LQ, Bloom 12 LQ or 12 LQ.', 'a filter’s refusal in the book’s words');
	eq(kindFrom(['0802-13-30', '0803-01-01'], cal), 'date', 'a property of the book’s dates is a date');
}

// presets: each makes a calendar
{
	for (const p of PRESETS) { const c = makeCalendar(p.def()); ok(c.yearLength > 300, `${p.title}: a year`); }
	eq(makeCalendar(PRESETS[0].def()).monthName(6), 'June', 'the first preset is the ordinary calendar');
	eq(calendarFrom(null, null), GREGORIAN, 'a book with no calendar has the ordinary one, the same object');
	eq(calendarFrom(CALENDAR, ERAS), cal, 'a calendar is made once for each value');
}

done('calendar');
