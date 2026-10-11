import type { EventLine, ParsedFile } from '../src/progress/format';
import { merge, toHistory } from '../src/progress/merge';
import { dayStr, num, type History, type Plan } from '../src/progress/model';
import { planFrom, planProblem, readDeadline, readWritingDays, saidDays, writeWritingDays } from '../src/progress/plan';
import { pace, plannedAt, projected, rows, share, type Row } from '../src/progress/stats';
import { done, eq as is, ok } from './harness';

const eq = (a: unknown, b: unknown, msg: string): void => is(JSON.stringify(a), JSON.stringify(b), msg);

/* A deadline: the properties read and written, the plan's line, today's share and every sentence the window says of
   how the book stands against it. Plain days (YYYY-MM-DD) and hand-made rows. */

const D = '2026-10-12'; // a Monday
const plus = (day: string, n: number): string => dayStr(num(day) + n);
const row = (n: number, total: number, added = 0, cut = 0): Row => ({ n, total, added, cut, block: 0, elsewhere: 0, minutes: 0 });
/** One row a day from `from` to `to`, the book growing by `per` a day from `start`. */
const run = (from: string, to: string, start: number, per: number): Row[] => { const out: Row[] = []; for (let n = num(from), t = start; n <= num(to); n++, t += per) out.push(row(n, t, per)); return out; };
const plan = (o: Partial<Plan> = {}): Plan => ({ target: 10000, deadline: plus(D, 9), off: [], from: D, fromTotal: 0, ...o });

// ---- the properties ----
eq(readDeadline('2026-12-18'), '2026-12-18', 'a date is read');
eq(readDeadline('2026-12-18T09:30'), '2026-12-18', 'a date with a time is its day');
eq(readDeadline('2026-02-30'), null, 'a day that is not there is none');
eq(readDeadline('18 December'), null, 'words are not a date');
eq(readDeadline(20261218), null, 'a number is not a date');
eq(readDeadline(undefined), null, 'nothing is none');
eq(readWritingDays(['monday', 'WED', 'Friday']), [1, 3, 5], 'names in any case, or their first three letters');
eq(readWritingDays('Saturday, Sunday'), [6, 0], 'a text with commas');
eq(readWritingDays(undefined), [0, 1, 2, 3, 4, 5, 6], 'no property: every day');
eq(readWritingDays([]), [0, 1, 2, 3, 4, 5, 6], 'an empty list: every day');
eq(readWritingDays(['Someday', 7]), [0, 1, 2, 3, 4, 5, 6], 'nothing known: every day');
eq(writeWritingDays([0, 1, 2, 3, 4, 5, 6]), undefined, 'every day takes the property away');
eq(writeWritingDays([5, 1, 3]), ['Monday', 'Wednesday', 'Friday'], 'names, Monday first');
eq(readWritingDays(writeWritingDays([6, 0, 2])), [2, 6, 0], 'what is written is read back');
eq(saidDays([1, 2, 3, 4, 5]), 'weekdays', 'weekdays');
eq(saidDays([6, 0]), 'weekends', 'weekends');
eq(saidDays([1, 3, 5]), 'Monday, Wednesday and Friday', 'a list');
eq(saidDays([2]), 'Tuesday', 'one');

// ---- the line ----
{
	const p = plan({ target: 9000, deadline: plus(D, 8), from: D });
	eq(plannedAt(p, num(D) - 1), 0, 'before it began it is where it began');
	eq(plannedAt(p, num(D)), 1000, 'the day it began has a share: nine days, 1,000 each');
	eq(plannedAt(p, num(D) + 3), 4000, 'a straight line');
	eq(plannedAt(p, num(D) + 8), 9000, 'at the deadline, the target');
	eq(plannedAt(p, num(D) + 30), 9000, 'and after');
	// weekends off: Mon 12 to Fri 16 and Mon 19 to Tue 20 (the 8th day after the 12th): seven writing days
	const w = plan({ target: 7000, deadline: plus(D, 8), off: [6, 0] });
	eq(plannedAt(w, num(D) + 4), 5000, 'five days of seven by Friday');
	eq(plannedAt(w, num(D) + 6), 5000, 'a weekend adds nothing');
	eq(plannedAt(plan({ target: 1000, deadline: plus(D, 1), from: plus(D, 1), off: [2] }), num(D) + 1), 1000, 'a deadline on a day not written on: all of it is due then');
}

// ---- today's share ----
{
	const s = share(plan({ target: 10000, deadline: plus(D, 9) }), 0, 0, D);
	eq([s.needed, s.daysLeft, s.todayOff], [1000, 10, false], 'ten days, 1,000 each');
	eq(share(plan({ target: 10000, deadline: plus(D, 9) }), 600, 600, D).needed, 1000, 'what is written today does not change today’s share');
	eq(share(plan({ target: 10000, deadline: plus(D, 9) }), 800, -200, D).needed, share(plan({ target: 10000, deadline: plus(D, 9) }), 1000, 0, D).needed, 'nor does what is cut');
	eq(share(plan({ target: 10000, deadline: plus(D, 9) }), 3000, 0, plus(D, 3)).needed, 1000, 'and it is worked out again each morning: 7,000 over seven days');
	const sun = share(plan({ target: 10000, deadline: plus(D, 13), off: [0, 6] }), 0, 0, plus(D, 5));
	eq([sun.todayOff, sun.daysLeft, sun.needed], [true, 5, 2000], 'today not a writing day: no share today, and the days left share the rest');
	eq(share(plan({ deadline: plus(D, 5) }), 0, 0, plus(D, 8)).daysLeft, 0, 'after the deadline no day is left');
}

// ---- the sentences ----
{
	// on pace: 1,000 a day for four days, a share of 1,000
	let rs = run(D, plus(D, 3), 1000, 1000), p = pace(rs, plan(), plus(D, 3));
	eq([p.state, p.said], ['on', 'On pace.'], 'on pace');
	ok(p.then.startsWith('1,000 a day gets there by 21 October'), 'and what would do it, with the date');
	// behind: nothing written for six days
	rs = run(D, plus(D, 5), 0, 0); p = pace(rs, plan(), plus(D, 5));
	eq(p.state, 'behind', 'behind');
	ok(p.said === '6,000 words behind the plan.', `the sentence: ${p.said}`);
	ok(p.then === '2,000 a day gets there by 21 October.', `what would do it: ${p.then}`);
	// ahead
	rs = run(D, plus(D, 3), 5000, 1000); p = pace(rs, plan(), plus(D, 3));
	eq(p.state, 'ahead', 'ahead');
	ok(p.said === '5,000 words ahead, about 5 days.' || /^\d[\d,]* words ahead, about \d+ days\.$/.test(p.said), `the sentence: ${p.said}`);
	// within two days' share, either way, is on pace
	eq(pace([row(num(D), 1900, 1900)], plan(), D).state, 'on', 'a day and a bit ahead is on pace');
	eq(pace(run(D, D, 0, 0), plan({ target: 10000 }), D).state, 'on', 'and a day behind');
	// passed
	rs = run(D, plus(D, 12), 82000, 0); p = pace(rs, plan({ target: 100000, fromTotal: 82000, deadline: plus(D, 9) }), plus(D, 12));
	eq([p.state, p.said, p.then], ['passed', '21 October passed at 82,000 of 100,000.', ''], 'passed: the date and the numbers, and no color or scolding');
	// reached, early
	rs = run(D, plus(D, 9), 8000, 250); p = pace(rs, plan({ target: 10000, deadline: plus(D, 20), fromTotal: 8000 }), plus(D, 9));
	eq([p.state, p.said], ['reached', 'Reached on 20 October, 12 days early.'], 'reached, early');
	eq(pace(rs, plan({ target: 10000, deadline: plus(D, 8), fromTotal: 8000 }), plus(D, 9)).said, 'Reached on 20 October.', 'reached on the day: not early');
	eq(pace(rs.slice(-1), plan({ target: 10000, deadline: plus(D, 20), fromTotal: 8000 }), plus(D, 9)).said, 'Reached today, 11 days early.', 'reached today');
	// a book already past the target before the plan began is not early for it
	eq(pace(run(D, plus(D, 3), 11000, 0), plan({ target: 10000, from: plus(D, 3), deadline: plus(D, 20) }), plus(D, 3)).said, 'Reached on 12 October.', 'already reached when the plan began');
	// the day it was reached is the first of the last run above the target: a dip below and back counts from the return
	rs = [row(num(D), 9000), row(num(D) + 1, 10100), row(num(D) + 2, 9500), row(num(D) + 3, 10200)];
	eq(pace(rs, plan({ target: 10000, deadline: plus(D, 20) }), plus(D, 3)).said, 'Reached today, 17 days early.', 'after a dip, the day it came back');
}

// ---- the cases ----
{
	// a book that shrinks in revision: behind by more each day, the sentence stays true and calm
	const start = 50000, p0 = plan({ target: 60000, fromTotal: start, deadline: plus(D, 29) });
	let last = '';
	for (const day of [3, 10, 20, 28]) {
		const rs = run(D, plus(D, day), start, -200), p = pace(rs, p0, plus(D, day));
		eq(p.state, 'behind', `a shrinking book is behind (day ${day})`);
		ok(/^[\d,]+ words behind the plan\.$/.test(p.said) && /^[\d,]+ a day gets there by (tomorrow|\d+ [A-Z][a-z]+)\.$/.test(p.then), `calm and true: “${p.said} ${p.then}”`);
		ok(!/[!?]/.test(p.said + p.then), 'no alarm');
		ok(p.said !== last, 'it says how far, and the number moves');
		last = p.said;
	}
	// a deadline tomorrow, and today
	eq(pace([row(num(D), 2000, 100)], plan({ target: 5000, from: D, deadline: plus(D, 1) }), D).then, '1,550 a day gets there by tomorrow.', 'tomorrow is a word');
	eq(pace([row(num(D), 4000, 100)], plan({ target: 5000, from: D, deadline: D }), D).then.endsWith('by today.'), true, 'and so is today');
	// a deadline on a day not written on, with nothing left but it
	const none = pace([row(num(D) + 5, 0)], plan({ target: 100, from: D, deadline: plus(D, 6), off: [0] }), plus(D, 6));
	eq(none.then, 'No writing day is left before today.', 'no writing day left');
	// five years off
	const far = plan({ target: 100000, deadline: plus(D, 365 * 5), fromTotal: 0 }), pf = pace([row(num(D), 0)], far, D);
	ok(pf.then.includes('2031'), `the year is said when it is not this one: ${pf.then}`);
	ok(pf.daysLeft > 1800 && pf.needed < 60, 'and the share is small');
	eq(plannedAt(far, num(D) + 365 * 5), 100000, 'the line reaches the target');
	// a year over: the year is said
	ok(pace([row(num(D), 0)], plan({ deadline: '2027-01-15' }), D).then.endsWith('15 January 2027.'), 'next year’s date has its year');
	// no writing days chosen (a file by hand): every day, never "0 a day"
	eq(readWritingDays([]).length, 7, 'no days is every day');
	// the first day: no pace yet
	const first = pace([row(num(D), 0)], plan(), D);
	eq([first.state, first.today, first.needed], ['on', 0, 1000], 'the first day is on pace and has a share');
	// paste: it moves the total, so the plan moves
	const before = pace([row(num(D) + 3, 3000)], plan(), plus(D, 3)).needed, after = pace([row(num(D) + 3, 5000)], plan(), plus(D, 3)).needed;
	ok(after < before, 'words brought in at once lower what is needed a day');
}

// ---- the form ----
{
	const ok_ = { target: 80000, deadline: plus(D, 30), days: [1, 2, 3, 4, 5], total: 20000 };
	eq(planProblem(ok_, D), null, 'a plan that can be kept');
	ok(planProblem({ ...ok_, target: 0 }, D)?.includes('words'), 'no target');
	ok(planProblem({ ...ok_, target: 15000 }, D)?.includes('20,000'), 'a target the book has already passed says by how much');
	ok(planProblem({ ...ok_, deadline: plus(D, -1) }, D)?.includes('passed'), 'a date that has passed');
	eq(planProblem({ ...ok_, deadline: D }, D), null, 'today is allowed');
	ok(planProblem({ ...ok_, deadline: '' }, D)?.includes('date'), 'no date');
	ok(planProblem({ ...ok_, days: [] }, D)?.includes('one day'), 'no writing day ticked');
	ok(planProblem({ ...ok_, deadline: plus(D, 1), days: [0] }, D)?.includes('None'), 'no chosen day before the deadline');
}

// ---- where the plan began, from the record ----
{
	const day = (d: string, total: number, added: number): ParsedFile['days'][number] => ({ t: 'day', d, u: 1, k: 'desktop', n: { Arrival: [added, 0, 0, 0] }, h: {}, s: [], m: 10, tot: { at: 1, w: total, n: 1, st: {} } });
	const ev = (d: string, k: string, p: string, from: string, to: string, n?: number): EventLine => ({ t: 'ev', at: num(d) * 864e5, d, k, p, from, to, ...(n ? { n } : {}) });
	const file = (days: ParsedFile['days'], events: EventLine[]): ParsedFile => ({ version: 1, header: null, days, events, other: [], skipped: 0, newer: false });
	const days = [day(D, 1000, 1000), day(plus(D, 1), 1500, 500), day(plus(D, 2), 2200, 700), day(plus(D, 3), 2600, 400)];
	const h = (events: EventLine[]): History => toHistory(merge([{ device: 'a', file: file(days, events) }]));
	const rs = (hh: History): Row[] => rows(hh, plus(D, 3));
	const o = { target: 10000, deadline: plus(D, 9), days: [0, 1, 2, 3, 4, 5, 6] };
	const set = h([ev(plus(D, 2), 'deadline', '', '', plus(D, 9), 10000)]);
	let p = planFrom(set, rs(set), '', o, plus(D, 3));
	eq([p?.from, p?.fromTotal], [plus(D, 2), 1500], 'from the day it was set, with the words at the start of that day');
	const both = h([ev(plus(D, 1), 'deadline', '', '', plus(D, 9), 10000), ev(plus(D, 2), 'target', '', '8000', '10000')]);
	p = planFrom(both, rs(both), '', o, plus(D, 3));
	eq(p?.from, plus(D, 2), 'a target changed after it restarts the plan');
	const elsewhere = h([ev(plus(D, 2), 'deadline', 'Part one', '', plus(D, 9))]);
	p = planFrom(elsewhere, rs(elsewhere), '', o, plus(D, 3));
	eq(p?.from, D, 'a folder’s deadline is not the book’s: from the record’s first day');
	eq(p?.fromTotal, 0, 'with the words the book had before it');
	const none = h([]);
	p = planFrom(none, rs(none), '', o, plus(D, 3));
	eq([p?.from, p?.fromTotal], [D, 0], 'a deadline the record never saw set: from its first day');
	eq(planFrom(none, rs(none), '', { ...o, deadline: null }, plus(D, 3)), null, 'no deadline, no plan');
	eq(planFrom(none, rs(none), '', { ...o, target: 0 }, plus(D, 3)), null, 'no target, no plan');
	eq(planFrom(none, [], '', o, plus(D, 3)), null, 'no record, no plan to draw');
	// an event as the file has it: an empty path and an empty date are not written
	const bare = h([{ t: 'ev', at: num(plus(D, 2)) * 864e5, d: plus(D, 2), k: 'deadline', to: plus(D, 9), n: 10000 }]);
	p = planFrom(bare, rs(bare), '', o, plus(D, 3));
	eq(p?.from, plus(D, 2), 'an event with no path is the binder’s own');
	// the old deadline stays on the book's life as a mark unless it was changed before its day
	const marked = h([ev(D, 'deadline', '', '', plus(D, 2), 5000), ev(plus(D, 3), 'deadline', '', plus(D, 2), plus(D, 20), 8000)]);
	eq(marked.marks.filter((m) => m.kind === 'deadline').map((m) => [m.day, m.what]), [[plus(D, 2), '5,000 words due'], [plus(D, 20), '8,000 words due']], 'a deadline that came is a mark; the live one is one too, for when it comes');
	const changed = h([ev(D, 'deadline', '', '', plus(D, 5)), ev(plus(D, 1), 'deadline', '', plus(D, 5), plus(D, 20))]);
	eq(changed.marks.filter((m) => m.kind === 'deadline').map((m) => m.day), [plus(D, 20)], 'one changed before its day is not a mark');
	const cleared = h([ev(D, 'deadline', '', '', plus(D, 5)), ev(plus(D, 8), 'deadline', '', plus(D, 5), '')]);
	eq(cleared.marks.filter((m) => m.kind === 'deadline').map((m) => m.day), [plus(D, 5)], 'one taken away after its day stays');
}

// ---- the projection ----
eq(projected([row(num(D), 100)], 1000), null, 'one day has no pace');
eq(projected(run(D, plus(D, 9), 1000, 0), 5000), null, 'a book that is not growing has none');

done();
