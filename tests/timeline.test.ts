import { parseStoryDate, writeStoryDate, type StoryDate, type StoryPlace } from '../src/time/date';
import { around, columnsFor, dateKey, dateText, dayAfterDrop, dayOf, dropTargets, gapText, planAcross, readShape, span, stepsOf, stoodOut, timeline, whereAcross, yearText, yearsOf } from '../src/view/timeline-data';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const d = (s: string): StoryDate => { const x = parseStoryDate(s); if (!x) throw new Error('not a date: ' + s); return x; };
/** Scenes by name in manuscript order, each with its date ('' for none) and maybe a `story-order`. */
type Scene = [name: string, date: string, order?: number];
const lay = (scenes: Scene[]) => {
	const by = new Map(scenes.map((s) => [s[0], s]));
	return timeline(scenes.map((s) => s[0]), (name): StoryPlace | null => { const s = by.get(name); return s?.[1] ? { date: d(s[1]), order: s[2] ?? null } : null; });
};
const iso = (x: StoryDate) => String(writeStoryDate(x));
const gaps = (scenes: Scene[]) => lay(scenes).groups.filter((g) => g.gap != null).map((g) => `${gapText(g.gap ?? 0)} before ${iso(g.date)}`);
const dates = (list: string[]): Scene[] => list.map((x, i) => [`s${i + 1}`, x]);

// options as saved
{
	eq(readShape('across'), 'across', 'time across');
	eq(readShape('down'), 'down', 'time down');
	eq(readShape(undefined), 'down', 'down unless it says across');
	eq(readShape(7), 'down', 'nonsense is down');
}

// a date's words, and what it covers
{
	eq(dateText(d('1987-06-14')), '14 June', 'a day says its day and month');
	eq(dateText(d('1987-06-14'), { short: true }), '14 Jun', 'short, on the line');
	eq(dateText(d('1987-06-14'), { year: true }), '14 June 1987', 'with its year');
	eq(dateText(d('1987-06')), 'June', 'a month');
	eq(dateText(d('1987')), '1987', 'a year is always its year');
	eq(dateText(d('-0030-02-01'), { year: true }), '1 February −30', 'before year 0');
	eq(yearText(-30), '−30', 'a year before 0');
	eq(j(dayOf(d('1987-06-14T21:30'))), j({ y: 1987, m: 6, d: 14 }), 'a date without its time');
	eq(dateKey(d('1987-06-14T21:30')), dateKey(d('1987-06-14')), 'two hours of one day are one date');
	ok(dateKey(d('1987-06')) !== dateKey(d('1987-06-01')), 'a month is not its first day');
	const [a, b] = span(d('1987-06')), [c, e] = span(d('1987')), [f, g] = span(d('1987-06-14'));
	eq(b - a, 29, 'June covers thirty days');
	eq(e - c, 364, '1987 covers the year');
	eq(f, g, 'a day covers itself');
	eq(span(d('1988'))[1] - span(d('1988'))[0], 365, 'a leap year is a day longer');
}

// how long a stretch is, in words
{
	eq(gapText(1), '1 day', 'one day');
	eq(gapText(13), '13 days', 'days under a fortnight');
	eq(gapText(21), '3 weeks', 'weeks under two months');
	eq(gapText(180), '6 months', 'months');
	eq(gapText(365), '1 year', 'twelve months are a year');
	eq(gapText(500), '16 months', 'months under two years');
	eq(gapText(3650), '10 years', 'years');
}

// the gap rule: long beside the stretches around it
{
	eq(stoodOut(7, [1, 1]), false, 'a week is never a gap');
	eq(stoodOut(13, [1, 1, 8000]), true, 'thirteen days among days');
	eq(stoodOut(300, [90, 250, 120, 5000]), false, 'months among months');
	eq(stoodOut(40, []), true, 'two dates: more than a month is said');
	eq(stoodOut(20, []), false, 'two dates three weeks apart');
	eq(j(around([0, 5, 6, 7, 8, 9], 1)), j([6, 7]), 'the first stretch has only the ones after it');
	eq(j(around([0, 5, 6, 7, 8, 9], 3)), j([5, 6, 8, 9]), 'two before and two after');
	eq(j(stepsOf([{ first: 10, last: 10 }, { first: 11, last: 40 }, { first: 100, last: 100 }])), j([0, 1, 60]), 'a stretch is counted from the last day the date before covers');
}

// The Lighthouse: a flashback, a prologue the winter before, a week in June, an inquiry, an epilogue
{
	const book = dates(['1986-12', '1987-06-11', '1987-06-11', '1987-06-12', '1987-06-14', '1987-06-17', '1987-06-18', '1987-06-18', '1987-06-19', '1987-06-19', '1987-06-19', '', '1987-07-02', '1968-03', '', '2009']);
	const { groups, undated } = lay(book);
	eq(j(groups.map((g) => iso(g.date))), j(['1968-03', '1986-12', '1987-06-11', '1987-06-12', '1987-06-14', '1987-06-17', '1987-06-18', '1987-06-19', '1987-07-02', '2009']), 'the dates in time’s order');
	eq(j(undated), j(['s12', 's15']), 'the scenes with no date, in the manuscript’s order');
	eq(j(groups[7].items), j(['s9', 's10', 's11']), 'a day’s scenes in the manuscript’s order');
	eq(j(gaps(book)), j(['19 years before 1986-12', '5 months before 1987-06-11', '13 days before 1987-07-02', '22 years before 2009']), 'four stretches stand out');
	eq(j(groups.map((g) => g.newYear)), j([true, true, true, false, false, false, false, false, false, true]), 'the first date of each year');
	eq(j(yearsOf(groups)), j([{ y: 1968, from: 0, to: 0 }, { y: 1986, from: 1, to: 1 }, { y: 1987, from: 2, to: 8 }, { y: 2009, from: 9, to: 9 }]), 'the years, each with its dates');
}

// The Salt Works: a week, a month, thin years, and a chunk ten years on. The thin years are not a row of gaps.
{
	const book = dates(['1938-09-12', '1938-09-13', '1938-09-14', '1921-03-14', '1921-03-15', '1921-03-16', '1921-03-16', '1938-09-16', '1938-09-17', '1921-03-17', '1921-03-18', '1921-03-19', '1921-03-20',
		'1921-10-03', '1921-10-09', '1921-10-12', '1921-10-17', '1921-10-24', '1921-10-30', '1938-09-19', '1922-02', '1922-09-08', '1923', '1924-05', '1924-11-02', '1925', '1926-05-04', '1926-08', '1927-07-19', '1928-04', '1938-09-22', '1938-09-26']);
	eq(j(gaps(book)), j(['6 months before 1921-10-03', '3 months before 1922-02', '10 years before 1938-09-12']), 'three stretches stand out, none of them among the thin years');
	eq(lay(book).groups.length, 31, 'two scenes on 16 March are one date');
	// (a date that says only a year covers all of it: "1925", then 4 May 1926, is four months)
	const g = lay(dates(['1925', '1926-05-04'])).groups;
	eq(g[1].first - g[0].last, 124, 'counted from the year’s last day');
}

// within a day: a typed time, then story-order, then the manuscript
{
	const day = lay([['dawn', '1987-06-19T05:10'], ['plain b', '1987-06-19'], ['wreck', '1987-06-19T02:10'], ['second', '1987-06-19', 2], ['plain a', '1987-06-19'], ['first', '1987-06-19', 1]]).groups;
	eq(day.length, 1, 'one day, whatever hour each scene says');
	eq(j(day[0].items), j(['first', 'second', 'plain b', 'plain a', 'wreck', 'dawn']), 'those with a place in the day, those without in the manuscript’s order, then the timed ones by their time');
	const mixed = lay([['day', '1987-06-01'], ['month', '1987-06'], ['year', '1987']]).groups;
	eq(j(mixed.map((x) => iso(x.date))), j(['1987', '1987-06', '1987-06-01']), 'where they start together, the less exact first');
}

// nothing dated; nothing at all
{
	eq(j(lay(dates(['', '']))), j({ groups: [], undated: ['s1', 's2'] }), 'no dates: every scene waits');
	eq(j(lay([])), j({ groups: [], undated: [] }), 'no scenes');
}

// time down: how many cards side by side
{
	eq(columnsFor(210, 210, 12), 1, 'room for one');
	eq(columnsFor(431, 210, 12), 1, 'a pixel short of two');
	eq(columnsFor(432, 210, 12), 2, 'two, with the space between them');
	eq(columnsFor(100, 210, 12), 1, 'never none');
}

// time across: nothing overlaps, every mark is past the one before, nothing straddles a break
{
	const W = 210, B = 12, G = 84;
	const check = (counts: number[], gapBefore: boolean[], what: string) => {
		const plan = planAcross(counts, gapBefore, W, B, G);
		const all = plan.cards.flat();
		for (const side of ['above', 'below'] as const) {
			const xs = all.filter((c) => c.side === side).map((c) => c.x).sort((a, b) => a - b);
			ok(xs.every((x, i) => !i || x - xs[i - 1] >= W + B), `${what}: no two cards ${side} the line overlap`);
		}
		ok(plan.groups.every((g, i) => !i || g.x > plan.groups[i - 1].to), `${what}: each date’s mark is past the last card of the date before`);
		ok(plan.cards.every((cs, i) => cs.every((c) => c.x >= plan.groups[i].x)), `${what}: a date’s cards begin at its mark or after`);
		for (const gap of plan.gaps) {
			ok(plan.cards.slice(0, gap.before).flat().every((c) => c.x + W <= gap.x), `${what}: what is before a break ends before it`);
			ok(plan.cards.slice(gap.before).flat().every((c) => c.x >= gap.x + G), `${what}: what is after a break begins after it`);
		}
		ok(all.every((c) => c.x + W <= plan.width), `${what}: the line is as long as its cards`);
		return plan;
	};
	const singles = check([1, 1, 1, 1], [false, false, false, false], 'single dates');
	eq(j(singles.cards.flat().map((c) => c.side)), j(['above', 'below', 'above', 'below']), 'single dates alternate sides');
	eq(singles.groups[1].x - singles.groups[0].x, 111, 'and stand half a card apart');
	const dense = check([1, 5, 1], [false, false, true], 'a dense date, then a break');
	eq(dense.gaps.length, 1, 'one break');
	eq(dense.gaps[0].before, 2, 'before the last date');
	eq(dense.groups[1].to > dense.groups[1].x, true, 'a date with five scenes runs along the line');
	check([3, 1, 2, 4, 1, 1, 7], [false, true, false, false, true, false, false], 'a mixed book');
	const none = planAcross([], [], W, B, G);
	eq(none.width, 0, 'no dates: no line');
	// which mark a point along the line is at
	eq(j(whereAcross(singles, singles.groups[1].x + 5, 20)), j({ group: 1 }), 'at a mark');
	eq(j(whereAcross(singles, singles.groups[1].x + 60, 20)), j({ before: 2 }), 'between two marks: the stretch before the later one');
	eq(j(whereAcross(singles, -50, 20)), j({ before: 0 }), 'before the first date');
	eq(j(whereAcross(singles, 5000, 20)), j({ before: 4 }), 'after the last');
	eq(j(whereAcross(dense, (dense.groups[1].x + dense.groups[1].to) / 2, 20)), j({ group: 1 }), 'anywhere along a dense date’s mark is that date');
}

// what a gap unfolds into (for a drag: nothing is dragged yet)
{
	const t = (a: string, b: string) => { const r = dropTargets(d(a), d(b)); return [r.unit, r.dates.map(iso)]; };
	eq(j(t('1987-06-14', '1987-06-17')), j(['d', ['1987-06-15', '1987-06-16']]), 'the missing days');
	eq(j(t('1987-06-14', '1987-06-15')), j(['d', []]), 'two days that touch: nothing between them');
	eq(j(t('1987-06-29', '1987-07-02')), j(['d', ['1987-06-30', '1987-07-01']]), 'days across the end of a month');
	eq(j(t('1921-03-20', '1921-10-03')), j(['m', ['1921-04', '1921-05', '1921-06', '1921-07', '1921-08', '1921-09']]), 'the months of a gap of months');
	eq(j(t('1921-10-30', '1922-02')), j(['m', ['1921-11', '1921-12', '1922-01']]), 'months across the end of a year');
	eq(j(t('1928-04', '1938-09-12')), j(['y', ['1929', '1930', '1931', '1932', '1933', '1934', '1935', '1936', '1937']]), 'the years of a gap of years: a drop on 1931 writes 1931');
	eq(j(t('1925', '1926-05-04')), j(['m', ['1926-01', '1926-02', '1926-03', '1926-04']]), 'after a date that is only a year, from the year after');
	eq(j(t('1987-06', '1987-07-03')), j(['d', ['1987-07-01', '1987-07-02']]), 'after a month, from the month’s end');
	eq(j(t('1987-12-30', '1988-03-01')), j(['m', ['1988-01', '1988-02']]), 'two months and a day: the whole months between');
}

// how a day stands after cards are put down in it
{
	const p = (date: string, order: number | null = null): StoryPlace => ({ date: d(date), order });
	const rest = [{ item: 'a', place: p('1987-06-19', 1) }, { item: 'b', place: p('1987-06-19', 2) }, { item: 'c', place: p('1987-06-19', 3) }];
	const mid = dayAfterDrop(rest, [{ item: 'x', place: p('1987-06-19') }], 1);
	eq(j([...mid.numbers]), j([['a', 1], ['x', 2], ['b', 3], ['c', 4]]), 'the day is numbered 1, 2, 3 in the order left');
	eq(j(mid.order), j(['a', 'x', 'b', 'c']), 'and stands so');
	eq(j(mid.held), j([]), 'nothing in the way');
	eq(j(dayAfterDrop(rest, [{ item: 'x', place: p('1987-06-19') }, { item: 'y', place: p('1987-06-19') }], 99).order), j(['a', 'b', 'c', 'x', 'y']), 'several cards go down together, at the end if let go past it');
	// (a typed time is never rewritten: a timed card can't stand before the day's untimed scenes)
	const timed = dayAfterDrop(rest, [{ item: 'night', place: p('1987-06-19T21:30') }], 0);
	eq(j(timed.order), j(['a', 'b', 'c', 'night']), 'a card with a time stands where its time puts it');
	eq(j(timed.held), j(['night']), 'and is said to be held there');
}

done('timeline');
