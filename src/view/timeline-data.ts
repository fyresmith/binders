import { GREGORIAN, compareStoryDates, compareStoryPlaces, type Calendar, type StoryDate, type StoryPlace } from '../time/date';

/* The timeline's model (pure: no Obsidian, no DOM). Scenes with a story date (src/time/date.ts) are grouped by that
   date and the groups stand in time's order; within a date, in the order that module gives a day. The axis is not to
   scale: each date gets the room its scenes need, and a stretch with nothing in it that is long where it stands is
   drawn short and says how long it was. timeline.ts draws it.

   What a drag will need is answered here too, though nothing is dragged yet: which mark a point along the line is at
   (`whereAcross`), what a gap unfolds into (`dropTargets`), and how a day stands after a card is put down in it
   (`dayAfterDrop`). */

/** The mode's icon: Binders' own (main.ts adds it), a line of time with marks on both sides. */
export const TIMELINE_ICON = 'binders-timeline';
/** The drawing, on Obsidian's 100 by 100 grid, in the weight of its own icons. */
export const TIMELINE_ICON_SVG = '<path d="M50 12.5v75M50 29.2H29.2M50 50h20.8M50 70.8H29.2" fill="none" stroke="currentColor" stroke-width="8.33" stroke-linecap="round" stroke-linejoin="round"/>';

/** Which way time runs on the page: down it (the way a phone has it), or across. */
export type Shape = 'across' | 'down';
export const readShape = (v: unknown): Shape => (v === 'across' ? 'across' : 'down');
/** The two shapes as the menus list them, one ticked. */
export const TIMELINE_SHAPES: readonly { id: Shape; title: string; icon: string }[] = [
	{ id: 'down', title: 'Time down', icon: 'arrow-down-from-line' },
	{ id: 'across', title: 'Time across', icon: 'arrow-right-from-line' },
];

/** A date without its time: the day, the month or the year it says. */
export function dayOf(d: StoryDate): StoryDate {
	return d.m == null ? { y: d.y } : d.d == null ? { y: d.y, m: d.m } : { y: d.y, m: d.m, d: d.d };
}

/** What scenes share to stand at one date: the same day, the same month (for dates that say no day), the same year. */
export const dateKey = (d: StoryDate): string => [d.y, d.m ?? '', d.d ?? ''].join('/');

/** The first and the last day a date covers, as the calendar counts days: a year alone covers the whole year, a month
    the whole month. */
export function span(d: StoryDate, cal: Calendar = GREGORIAN): [number, number] {
	const first = cal.toDay(d.y, d.m ?? 1, d.d ?? 1);
	if (d.d != null) return [first, first];
	const m = d.m ?? cal.monthsIn(d.y);
	return [first, cal.toDay(d.y, m, cal.daysIn(d.y, m))];
}

/** A year as it is written for a reader (a minus sign before year 0). */
export const yearText = (y: number): string => (y < 0 ? `−${-y}` : String(y));

/** A date in the ruler's words: "14 June", "June", "1987"; `short`: "14 Jun"; `year`: with its year ("14 June 1987").
    A date that is only a year is always its year. */
export function dateText(d: StoryDate, opts: { short?: boolean; year?: boolean } = {}, cal: Calendar = GREGORIAN): string {
	if (d.m == null) return yearText(d.y);
	const name = cal.monthName(d.m), month = opts.short ? name.slice(0, 3) : name;
	return [d.d == null ? '' : String(d.d), month, opts.year ? yearText(d.y) : ''].filter(Boolean).join(' ');
}

/** How long a stretch was, in the largest unit that says it in a small number: "13 days", "6 months", "18 years". */
export function gapText(days: number): string {
	const say = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
	if (days < 14) return say(days, 'day');
	if (days < 60) return say(Math.round(days / 7), 'week');
	const months = Math.round(days / 30.44);
	if (months < 24 && months !== 12) return say(months, 'month');
	return say(Math.round(days / 365.25), 'year');
}

export interface Group<T> {
	key: string;
	/** The date its scenes share (no time: a day's scenes are one group whatever hour each says). */
	date: StoryDate;
	/** The first and last day it covers. */
	first: number;
	last: number;
	/** In the order a day's scenes are told in story time: a typed time, then `story-order`, then the order given. */
	items: T[];
	/** The days since the date before, when that stretch is drawn short and marked; else null. */
	gap: number | null;
	/** Is this the first date of its year (so the year is said before it)? */
	newYear: boolean;
}

/** The dated scenes as groups in time's order, and the ones without a date in the order given (the manuscript's).
    A stretch between two dates is marked as a gap when it stands out where it is (`stoodOut`); how long it is, is
    counted from the last day the earlier date could mean ("1925", then "4 May 1926", is four months). */
export function timeline<T>(items: readonly T[], placeOf: (item: T) => StoryPlace | null, cal: Calendar = GREGORIAN): { groups: Group<T>[]; undated: T[] } {
	const by = new Map<string, { group: Group<T>; places: Map<T, StoryPlace> }>(), undated: T[] = [];
	for (const item of items) {
		const place = placeOf(item);
		if (!place) { undated.push(item); continue; }
		const date = dayOf(place.date), key = dateKey(date);
		let g = by.get(key);
		if (!g) { const [first, last] = span(date, cal); by.set(key, g = { group: { key, date, first, last, items: [], gap: null, newYear: false }, places: new Map() }); }
		g.group.items.push(item);
		g.places.set(item, place);
	}
	// (a sort keeps the order given among scenes it can't tell apart: the manuscript's order settles a tie)
	for (const { group, places } of by.values()) group.items.sort((a, b) => compareStoryPlaces(places.get(a), places.get(b), cal));
	const groups = [...by.values()].map((g) => g.group).sort((a, b) => compareStoryDates(a.date, b.date, cal));
	const steps = stepsOf(groups);
	groups.forEach((g, i) => {
		g.newYear = !i || groups[i - 1].date.y !== g.date.y;
		g.gap = i && stoodOut(steps[i], around(steps, i)) ? steps[i] : null;
	});
	return { groups, undated };
}

/** How long the stretch before each date is, in days, at the least (0 for the first). */
export function stepsOf(groups: readonly { first: number; last: number }[]): number[] {
	return groups.map((g, i) => (i ? Math.max(0, g.first - groups[i - 1].last) : 0));
}

/** The stretches beside one: the two before it and the two after, where there are that many. */
export function around(steps: readonly number[], i: number): number[] {
	return [i - 2, i - 1, i + 1, i + 2].filter((k) => k >= 1 && k < steps.length).map((k) => steps[k]);
}

/** Is a stretch long beside the ones around it? Over a week, and more than three times what is usual among them (their
    median, the lower one of two). Judged where it stands, not against the whole book: a book has weeks where every
    scene is a day apart and years where every scene is months apart, and neither is a row of gaps; the stretch between
    the two is one. */
export function stoodOut(step: number, beside: readonly number[]): boolean {
	if (step <= 7) return false;
	// (a book of two dates has nothing to judge by: there, more than a month is said)
	if (!beside.length) return step > 31;
	const sorted = [...beside].sort((a, b) => a - b), usual = sorted[Math.floor((sorted.length - 1) / 2)];
	return step > Math.max(1, usual) * 3;
}

/** The years the dates fall in, in order: each with the places of its first and last date among the groups. */
export function yearsOf(groups: readonly { date: StoryDate }[]): { y: number; from: number; to: number }[] {
	const out: { y: number; from: number; to: number }[] = [];
	groups.forEach((g, i) => {
		const last = out[out.length - 1];
		if (last && last.y === g.date.y) last.to = i; else out.push({ y: g.date.y, from: i, to: i });
	});
	return out;
}

// ---- time down: cards in rows beside the line ----

/** How many cards stand side by side in a row `width` wide (at least one). */
export function columnsFor(width: number, card: number, between: number): number {
	return Math.max(1, Math.floor((width + between) / (card + between)));
}

// ---- time across: cards on both sides of the line ----

export type Side = 'above' | 'below';

export interface AcrossPlan {
	/** Each group's mark on the line, and how far along the line its cards begin (its first to its last). */
	groups: { x: number; to: number }[];
	/** Each card, by group then by its place in the group: where it begins, and which side of the line it is on. */
	cards: { x: number; side: Side }[][];
	/** The shortened stretches: where each begins, before the group at `before`. */
	gaps: { x: number; before: number }[];
	width: number;
}

/** Time across, cards on both sides of the line: each card begins at its own mark, on whichever side is free first, so
    cards on opposite sides pass each other and a date with many scenes takes more of the line. No card overlaps
    another, every date's mark is past the one before, and nothing straddles a shortened stretch. */
export function planAcross(counts: readonly number[], gapBefore: readonly boolean[], card: number, between: number, gapWidth: number): AcrossPlan {
	const step = Math.round((card + between) / 2);
	const free: Record<Side, number> = { above: 0, below: 0 };
	const plan: AcrossPlan = { groups: [], cards: [], gaps: [], width: 0 };
	let last = -Infinity, side: Side = 'below';
	counts.forEach((n, gi) => {
		let start = Math.max(last + step, Math.min(free.above, free.below));
		if (gapBefore[gi]) {
			const at = Math.max(free.above, free.below, 0);
			plan.gaps.push({ x: at, before: gi });
			start = free.above = free.below = at + gapWidth + between;
		}
		if (!Number.isFinite(start)) start = 0;
		const cards: AcrossPlan['cards'][number] = [];
		for (let i = 0; i < n; i++) {
			const a = Math.max(start, free.above), b = Math.max(start, free.below);
			// (the side that is free first; when both are, the other one from the card before, so single dates alternate)
			side = a < b ? 'above' : b < a ? 'below' : side === 'above' ? 'below' : 'above';
			const x = side === 'above' ? a : b;
			free[side] = x + card + between;
			cards.push({ x, side });
			last = x;
		}
		plan.groups.push({ x: cards[0]?.x ?? start, to: last });
		plan.cards.push(cards);
	});
	plan.width = Math.max(0, Math.max(free.above, free.below) - between);
	return plan;
}

/** What is at a point along the line (time across): a date's mark (anywhere from its first card's to its last's, and
    `near` to either side), or the stretch before the date at `before` (0: before the first date; the number of
    dates: after the last). What a card let go there would be dropped on. */
export function whereAcross(plan: AcrossPlan, x: number, near: number): { group: number } | { before: number } {
	for (let i = 0; i < plan.groups.length; i++) {
		const g = plan.groups[i];
		if (x < g.x - near) return { before: i };
		if (x <= g.to + near) return { group: i };
	}
	return { before: plan.groups.length };
}

// ---- what a gap unfolds into, and how a day stands after a drop (for dragging, which is not built yet) ----

/** What the stretch between two dates unfolds into while a card is carried over it: the dates in it, sized to the
    gap. The years with nothing in them for a gap of years; the months for a gap of months; the days for a gap of days.
    A drop on one writes exactly that ("1931"; "1931-04"; "1931-04-02"). Empty when the two dates touch. (A gap of a
    thousand years is a thousand years here: whoever shows them decides how many to draw at once.) */
export function dropTargets(before: StoryDate, after: StoryDate, cal: Calendar = GREGORIAN): { unit: 'y' | 'm' | 'd'; dates: StoryDate[] } {
	const from = span(before, cal)[1], to = span(after, cal)[0], days = to - from - 1;
	if (days <= 0) return { unit: 'd', dates: [] };
	if (days >= 730) {
		const dates: StoryDate[] = [];
		for (let y = before.y + 1; y < after.y; y++) dates.push({ y });
		if (dates.length) return { unit: 'y', dates };
	}
	// the month the earlier date ends in, and the one the later begins in
	const b = { y: before.y, m: before.m ?? cal.monthsIn(before.y) }, a = { y: after.y, m: after.m ?? 1 };
	const next = (at: { y: number; m: number }) => (at.m < cal.monthsIn(at.y) ? { y: at.y, m: at.m + 1 } : { y: at.y + 1, m: 1 });
	if (days >= 60) {
		const dates: StoryDate[] = [];
		for (let at = next(b); at.y < a.y || (at.y === a.y && at.m < a.m); at = next(at)) dates.push(at);
		if (dates.length) return { unit: 'm', dates };
	}
	const dates: StoryDate[] = [];
	let at = { y: b.y, m: b.m, d: before.d ?? cal.daysIn(b.y, b.m) };
	for (let i = 0; i < days; i++) {
		at = at.d < cal.daysIn(at.y, at.m) ? { ...at, d: at.d + 1 } : { ...next(at), d: 1 };
		dates.push(at);
	}
	return { unit: 'd', dates };
}

/** How a day stands after cards are put down in it. `rest`: the day's other scenes, in the order they stand now;
    `moved`: the cards put down, in the order carried, each with the place it has on this day (its own time, if it has
    one, kept); `at`: where among `rest` they were let go. `numbers` is the `story-order` to write, 1 for the first, on
    every scene of the day; `order` how the day then stands; `held` the cards that could not stand where they were let
    go because of the time typed on them (a typed time is never rewritten, and orders before `story-order`). */
export function dayAfterDrop<T>(rest: readonly { item: T; place: StoryPlace }[], moved: readonly { item: T; place: StoryPlace }[], at: number, cal: Calendar = GREGORIAN): { numbers: Map<T, number>; order: T[]; held: T[] } {
	const i = Math.max(0, Math.min(rest.length, at));
	const wanted = [...rest.slice(0, i), ...moved, ...rest.slice(i)];
	const numbers = new Map(wanted.map((w, n) => [w.item, n + 1]));
	const order = [...wanted].sort((a, b) => compareStoryPlaces({ date: a.place.date, order: numbers.get(a.item) ?? null }, { date: b.place.date, order: numbers.get(b.item) ?? null }, cal)).map((w) => w.item);
	const carried = new Set(moved.map((m) => m.item));
	return { numbers, order, held: order.filter((item, n) => carried.has(item) && wanted[n].item !== item) };
}
