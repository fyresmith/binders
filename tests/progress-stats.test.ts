import { recordDay } from '../src/progress/day';
import type { Count, DayLine, EventLine, ParsedFile } from '../src/progress/format';
import { merge, toHistory, type Source } from '../src/progress/merge';
import { dayStr, num, type History } from '../src/progress/model';
import { alike, baseOf, chapters, facts, hourShape, rows, stage, statusSeries, weekdayShape, parts, type Fact } from '../src/progress/stats';
import { textFacts } from '../src/progress/text';
import { done, eq, ok } from './harness';

/* What the progress window says, worked out from hand-made records: the gap, the cut, a paste, two devices, a day
   that crosses four in the morning, one day only. The records go through the real merge, as the window's do. */

const at = (day: string, h = 9, m = 0): number => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h, m).getTime();
const min = (day: string, h: number, m = 0): number => Math.floor(at(day, h, m) / 60000);
interface Made { n: Record<string, Count>; tot?: number; st?: Record<string, number>; h?: Record<string, number>; s?: [number, number][]; m?: number; k?: DayLine['k']; scenes?: number }
const line = (d: string, o: Made): DayLine => ({ t: 'day', d, u: at(d, 22), k: o.k ?? 'desktop', n: o.n, h: o.h ?? { 9: Object.values(o.n).reduce((a, c) => a + c[0], 0) }, s: o.s ?? [[min(d, 9), min(d, 10)]], m: o.m ?? 30, ...(o.tot !== undefined ? { tot: { at: at(d, 22), w: o.tot, n: o.scenes ?? 3, st: o.st ?? {} } } : {}) });
const file = (days: DayLine[], events: EventLine[] = []): ParsedFile => ({ version: 1, header: null, days, events, other: [], skipped: 0, newer: false });
const history = (sources: Source[], statuses = ['Idea', 'Draft', 'Revised', 'Done']): History => toHistory(merge(sources), statuses);
const fact = (list: Fact[], label: string): Fact | undefined => list.find((f) => f.label === label);
const same = (a: unknown, b: unknown, msg: string): void => eq(JSON.stringify(a), JSON.stringify(b), msg);
const plus = (day: string, n: number): string => dayStr(num(day) + n);

// ---- one day only ----
{
	const h = history([{ device: 'a', file: file([line('2026-10-10', { n: { Arrival: [412, 23, 0, 0] }, tot: 389 })]) }]);
	const rs = rows(h, '2026-10-10');
	same(rs.length, 1, 'one day is one row');
	same(rs[0].total, 389, 'its total is the one stamped');
	same([rs[0].added, rs[0].cut], [412, 23], 'with what was typed and cut');
	same(baseOf(rs), 0, 'a book begun that day began from nothing');
	same(stage(rs), 'first', 'one day of writing is the first days');
	same(chapters(rs).length, 0, 'a day has no story yet');
	const f = facts(h, rs);
	ok(fact(f, 'Longest day')?.value === '389', 'the longest day is the only one');
	ok(!fact(f, 'Best month') && !fact(f, 'Longest run') && !fact(f, 'Best weekday'), 'and nothing is said that a day can’t say');
	same(fact(f, 'It began with')?.value, 'Arrival', 'a book begun in the record began with its first scene');
}

// ---- a book that was there before the record: its first day doesn't start from nothing ----
{
	const h = history([{ device: 'a', file: file([
		line('2026-10-08', { n: { 'Part One/Arrival': [300, 0, 0, 0] }, tot: 85300 }),
		line('2026-10-09', { n: { 'Part One/Arrival': [200, 50, 0, 0] }, tot: 85450 }),
		line('2026-10-10', { n: { 'Part Two/The wreck': [120, 0, 0, 0] }, tot: 85570 }),
	]) }]);
	const rs = rows(h, '2026-10-10');
	same(rs.map((r) => r.total), [85300, 85450, 85570], 'the totals are the ones stamped');
	same(baseOf(rs), 85000, 'the book had 85,000 words before the first day');
	same(stage(rs), 'first', 'three days are still the first days');
	const f = facts(h, rs);
	ok(!fact(f, 'It began with'), 'a book older than its record is not said to have begun in it');
	ok(!fact(f, 'Typed to keep these'), 'nor how many words it took to write');
	same(fact(f, 'Days written on')?.value, '3', 'three days written on');
	// a folder has no stamped total: it is counted back from what it holds now
	const part = rows(h, '2026-10-10', 'Part One', 40450);
	same(part.map((r) => r.total), [40300, 40450, 40450], 'a folder’s days are counted back from its words now');
	same(baseOf(part), 40000, 'and it too had words before');
}

// ---- a paste and a chapter deleted are not writing; an edit elsewhere is said ----
{
	const h = history([{ device: 'a', file: file([
		line('2026-09-01', { n: { A: [500, 0, 0, 0] }, tot: 500 }),
		line('2026-09-02', { n: { A: [100, 0, 4000, 0] }, tot: 4600 }),
		line('2026-09-03', { n: { A: [0, 20, 0, 1500] }, tot: 3080 }),
		line('2026-09-04', { n: { A: [50, 0, 0, 0] }, tot: 3830 }),
	]) }]);
	const rs = rows(h, '2026-09-04');
	same(rs[1].block, 4000, 'a paste is brought in');
	same(rs[1].added, 100, 'and is not written');
	same(rs[2].block, -1500, 'a chapter deleted is taken out');
	same(rs[2].cut, 20, 'and is not cut by typing');
	same(rs[3].elsewhere, 700, 'words nobody typed here are changed elsewhere');
	const f = facts(h, rs);
	same(fact(f, 'Longest day')?.value, '500', 'the longest day is by typing, not the day of the paste');
	same(fact(f, 'Brought in at once')?.value, '4,000', 'what was brought in is said');
	same(fact(f, 'Changed elsewhere')?.value, '700', 'and what changed elsewhere');
}

// ---- two devices are added together; the later stamp is the day's total ----
{
	const desk = file([line('2026-10-01', { n: { A: [300, 10, 0, 0] }, tot: 290, h: { 7: 300 } }), line('2026-10-02', { n: { A: [100, 0, 0, 0] }, tot: 590, h: { 7: 100 } })]);
	const phoneDay = line('2026-10-01', { n: { B: [200, 0, 0, 0] }, tot: 490, k: 'phone', h: { 22: 200 } });
	phoneDay.tot!.at = at('2026-10-01', 23);
	const h = history([{ device: 'a', file: desk }, { device: 'b', file: file([phoneDay]) }]);
	const rs = rows(h, '2026-10-02');
	same([rs[0].added, rs[0].cut, rs[0].total], [500, 10, 490], 'a day on two devices is one day');
	same(rs[1].total, 590, 'and the next day’s total is the one stamped then');
	same(hourShape(h)[22], 200, 'the phone’s hour is in the hours');
	same(fact(facts(h, rs), 'Written on a phone or tablet')?.value, '33%', 'and its words are the phone’s');
	// the same device's line in two copies of its file (Sync left both) is counted once
	const twice = history([{ device: 'a', file: desk }, { device: 'a', file: desk }]);
	same(rows(twice, '2026-10-02')[0].added, 300, 'a line that is there twice is counted once');
}

// ---- a day that crosses four in the morning ----
{
	const late = new Date(2026, 9, 11, 1, 30).getTime();
	same(recordDay(late), '2026-10-10', 'half past one at night is the day before');
	const d = line(recordDay(late), { n: { A: [250, 0, 0, 0] }, tot: 250, h: { 23: 150, 1: 100 }, s: [[Math.floor(late / 60000) - 150, Math.floor(late / 60000)]], m: 120 });
	const h = history([{ device: 'a', file: file([d, line('2026-10-11', { n: { A: [90, 0, 0, 0] }, tot: 340, h: { 9: 90 } })]) }]);
	const rs = rows(h, '2026-10-11');
	same(rs.length, 2, 'the night’s words are the 10th’s, the morning’s the 11th’s');
	same(rs[0].added, 250, 'all of the night on one day');
	const f = facts(h, rs);
	same(fact(f, 'Earliest and latest')?.value, '9 am, 1 am', 'one in the morning is the latest hour, not the earliest');
	same(fact(f, 'Longest sitting')?.value, '2 h 30 min', 'a sitting is from its first minute to its last');
	same(fact(f, 'Time typing')?.value, '2 h 30 min', 'the time is the minutes typed in, both days');
}

// ---- three years: the gap, the burst, the cut ----
{
	const days: DayLine[] = [];
	let total = 0, day = '2024-01-01';
	const write = (n: number, added: number, cut = 0, note = 'Part One/Arrival', status: Record<string, number> | null = null): void => {
		for (let i = 0; i < n; i++) { total += added - cut; days.push(line(day, { n: { [note]: [added, cut, 0, 0] }, tot: total, st: status ?? { Draft: total } })); day = plus(day, 1); }
	};
	write(20, 300);                                      // a slow start: 6,000
	day = plus(day, 10);
	write(30, 1500, 0, 'Part Two/The wreck');            // a month of 1,500 a day: 45,000 more
	day = plus(day, 120);                                // four months away
	write(25, 100, 500, 'Part Two/The wreck');           // a revision: 10,000 cut
	write(40, 400, 0, 'Part Three/The inquiry', null);
	const end = plus(day, -1);
	const h = history([{ device: 'a', file: file(days, [{ t: 'ev', at: at('2024-03-01'), d: '2024-03-01', k: 'snapshot', p: '', name: 'First draft' }, { t: 'ev', at: at('2024-03-02'), d: '2024-03-02', k: 'order', p: '' }]) }]);
	const rs = rows(h, end);
	same(rs[rs.length - 1].total, total, 'the last day’s total is the book’s');
	same(rs.length, num(end) - num('2024-01-01') + 1, 'every calendar day has a row, written on or not');
	same(stage(rs), 'full', 'a long record shows everything');
	const ch = chapters(rs);
	const away = ch.filter((c) => c.kind === 'away');
	same(away.map((c) => c.to - c.from), [121], 'four months away is one time away (the ten days are not)');
	same(ch.find((c) => c.kind === 'burst')?.said, '45,000 words in 30 days', 'the month stands out');
	same(ch.find((c) => c.kind === 'cut')?.said, '10,000 words cut', 'the revision is the deepest cut');
	const f = facts(h, rs);
	same(fact(f, 'Best month')?.note, 'February 2024', 'the best month');
	same(fact(f, 'Longest time away')?.value, '121 days', 'the longest time away');
	same(fact(f, 'Days that ended shorter')?.value, '25', 'the days of the revision ended shorter');
	same(fact(f, 'Rewritten most')?.value, 'The wreck', 'the scene cut hardest is the one rewritten most');
	same(fact(f, 'Times the order changed')?.value, '1', 'an order event is counted');
	same(h.marks.map((m) => m.what), ['First draft'], 'a named snapshot is a mark');
	same(fact(f, 'Longest run')?.value, '65 days', 'the longest run is the last stretch');
	// the parts, in the order asked, each with its words over time
	const ps = parts(h, rs, ['Part One', 'Part Two', 'Part Three'], '', { 'Part One': 6000, 'Part Two': 35000, 'Part Three': 16000 });
	same(ps.map((p) => p.now), [6000, 35000, 16000], 'each part ends at what it holds now');
	same(ps[1].grewMost, 'February 2024', 'and says when it grew most');
	// statuses carry over the days nothing was written
	const st = statusSeries(h, rs);
	same(st.map((s) => s.status), ['Draft'], 'only the statuses that had words');
	same(st[0].totals[60], 51000, 'a status holds over the days away');
	// weekdays: thirty days in a row and the rest are as alike as days get here
	ok(typeof alike(weekdayShape(rs)) === 'boolean', 'whether the weekdays are alike can be asked');
}

// ---- weekdays that are alike say nothing ----
ok(alike([1000, 1040, 980, 1010, 990, 1020, 1005]), 'seven days within a few per cent are alike');
ok(!alike([1000, 1040, 980, 1010, 990, 2600, 300]), 'a Saturday of two and a half times the rest is not');
ok(alike([0, 0, 0, 0, 0, 0, 0]), 'nothing is alike');

// ---- what the text says of itself ----
{
	const f = textFacts([
		{ name: 'Part One/Arrival', words: 30, text: 'On Sunday Mara came. “You are late,” Harrow said. She said nothing, and Mara looked at Harrow for a long time before Harrow turned to the lamp and Mara to the sea.' },
		{ name: 'Epilogue', words: 4, text: 'The light was automatic.' },
	]);
	ok(!f.some((x) => /Sunday/.test(x.value + x.note)), 'a day of the week is nobody’s name');
	ok(!fact(f, 'Named most'), 'names are not guessed at');
	same(fact(f, 'Longest scene')?.value, 'Arrival', 'a scene is called by its name, not its path');
	same(fact(f, 'Longest sentence')?.note, 'in Arrival', 'the longest sentence says where it is');
	ok(fact(f, 'Spoken aloud') === undefined, 'a short text makes no claim about how much is spoken');
	same(textFacts([]).length, 0, 'no scenes, nothing said');
	same(textFacts([{ name: 'A', words: 0, text: '' }]).length, 0, 'no words, nothing said');
}

done('progress stats');
