/* Progress over time: everything the window says, worked out from a history (the record, merged: merge.ts). Pure
   (no Obsidian); tests/progress-stats.test.ts holds it to hand-made records.

   What the record can and can't say decides the wording here:
   - "written" and "cut" are typing only. A paste, a chapter deleted or an import came or went a block at a time: it
     moves the total and is never a day's writing.
   - the binder's total on a day is the one stamped that day. Words the total moved by that no device typed are
     "changed elsewhere".
   - a record usually begins when the book is already there, so nothing is said about how a book began, or how many
     words it took, unless the record saw it begin. */

import { count, fmt, monthName, num, sayDay, weekday, weekdayName, type History, type Plan } from './model';

/** One calendar day, whether anything was written or not. */
export interface Row {
	n: number;
	/** The words at the day's end. */
	total: number;
	/** Typed, and cut by typing. */
	added: number; cut: number;
	/** Brought in (+) or taken out (−) a block at a time, net. */
	block: number;
	/** What the total moved by that no device typed. */
	elsewhere: number;
	/** Minutes something was typed in. */
	minutes: number;
}

const inScope = (path: string, scope: string): boolean => scope === '' || path === scope || path.startsWith(scope + '/');
const wrote = (r: Row): boolean => r.added > 0 || r.cut > 0;
const net = (r: Row): number => r.added - r.cut;
const last = (path: string): string => path.split('/').pop() ?? path;
const span = (minutes: number): string => (minutes >= 6000 ? `${fmt(minutes / 60)} hours` : minutes >= 60 ? `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min` : `${Math.round(minutes)} min`);

/** Every day from the first in the record to today, for the notes under `scope` ('' is the binder).
    The binder's totals are the ones stamped; between stamps, and for a folder (which has none), they are counted
    from what was logged: back from `now` (the words there are today) when it is known, else on from nothing. */
export function rows(h: History, today: string, scope = '', now?: number): Row[] {
	const end = num(today), out: Row[] = [];
	if (!h.days.length) return out;
	const stamps: (number | undefined)[] = [];
	let n = num(h.days[0].day);
	const blank = (): void => { out.push({ n, total: 0, added: 0, cut: 0, block: 0, elsewhere: 0, minutes: 0 }); stamps.push(undefined); };
	for (const d of h.days) {
		const dn = num(d.day);
		if (dn > end) break;
		for (; n < dn; n++) blank();
		let added = 0, cut = 0, block = 0;
		for (const [path, v] of Object.entries(d.notes)) if (inScope(path, scope)) { added += v[0]; cut += v[1]; block += v[2]; }
		out.push({ n: dn, total: 0, added, cut, block, elsewhere: scope === '' ? d.elsewhere ?? 0 : 0, minutes: added || cut ? d.minutes : 0 });
		stamps.push(scope === '' ? d.total : undefined);
		n = dn + 1;
	}
	for (; n <= end; n++) blank();
	if (!out.length) return out;
	const moved = (r: Row): number => net(r) + r.block;
	// the day counted from: the last stamp, or today when the words there are now are known
	const lastStamp = stamps.reduce<number>((a, s, i) => (s !== undefined ? i : a), -1), tail = out.length - 1;
	if (lastStamp >= 0) {
		let t = 0;
		for (let i = 0; i < out.length; i++) { const s = stamps[i]; t = s !== undefined ? s : i ? t + moved(out[i]) : moved(out[i]); out[i].total = t; }
		// before the first stamp: back from it
		const first = stamps.findIndex((s) => s !== undefined);
		for (let i = first - 1; i >= 0; i--) out[i].total = out[i + 1].total - moved(out[i + 1]);
		// today's typing since the stamp, and whatever else there is now
		if (now !== undefined && now !== out[tail].total) { if (lastStamp < tail) out[tail].elsewhere += now - out[tail].total; out[tail].total = now; }
	} else if (now !== undefined) {
		out[tail].total = now;
		for (let i = tail - 1; i >= 0; i--) out[i].total = Math.max(0, out[i + 1].total - moved(out[i + 1]));
	} else {
		let t = 0;
		for (const r of out) { t = Math.max(0, t + moved(r)); r.total = t; }
	}
	return out;
}

/** The words there were before the record's first day (none, for a book begun in it). */
export function baseOf(rs: Row[]): number {
	return rs.length ? Math.max(0, rs[0].total - net(rs[0]) - rs[0].block - rs[0].elsewhere) : 0;
}

/** How much there is to show. 'first': the record is under two weeks old, and the window shows the first days;
    'full': everything that has something to say. */
export const FIRST_DAYS = 14;
export function stage(rs: Row[]): 'none' | 'first' | 'full' { return !rs.length ? 'none' : rs.length < FIRST_DAYS ? 'first' : 'full'; }

/** Are these so alike that a chart of them says nothing: the most no more than a quarter over the middle one? */
export function alike(values: number[]): boolean {
	const sorted = [...values].sort((a, b) => a - b), mid = sorted[Math.floor(sorted.length / 2)] ?? 0, max = sorted[sorted.length - 1] ?? 0;
	return max <= 0 || (mid > 0 && max <= mid * 1.25);
}

// ---- the plan (the deadline step's: nothing shows it yet) ----

export interface Pace {
	state: 'ahead' | 'on' | 'behind' | 'reached' | 'passed';
	/** Words a writing day from here to get there, and how many of those days are left (today counts if it is one). */
	needed: number; daysLeft: number;
	/** Where the plan has the book at the end of today, and how far the book is from that (ahead is positive). */
	planned: number; ahead: number;
	/** What is written today, toward `needed`. */
	today: number;
	/** In a sentence, and a second that says what would do it (or ''). */
	said: string; then: string;
}

/** Where a plan has the book at the end of day `n`: a straight line over the days that are written on. */
export function plannedAt(p: Plan, n: number): number {
	const from = num(p.from), to = num(p.deadline);
	if (n <= from) return p.fromTotal;
	if (n >= to) return p.target;
	let all = 0, done = 0;
	for (let d = from + 1; d <= to; d++) { if (p.off.includes(weekday(d))) continue; all++; if (d <= n) done++; }
	return all ? p.fromTotal + ((p.target - p.fromTotal) * done) / all : p.target;
}

export function pace(rs: Row[], p: Plan, today: string): Pace {
	const t = num(today), to = num(p.deadline), lastRow = rs[rs.length - 1], total = lastRow?.total ?? 0;
	const written = lastRow && lastRow.n === t ? net(lastRow) : 0;
	let daysLeft = 0;
	for (let d = t; d <= to; d++) if (!p.off.includes(weekday(d))) daysLeft++;
	const left = Math.max(0, p.target - (total - Math.max(0, written)));
	const needed = daysLeft ? Math.ceil(left / daysLeft) : left;
	const planned = Math.round(plannedAt(p, t)), ahead = total - planned;
	const by = sayDay(to, { year: new Date(to * 864e5).getUTCFullYear() !== new Date(t * 864e5).getUTCFullYear() });
	if (total >= p.target) {
		const k = rs.find((r) => r.total >= p.target), early = k ? to - k.n : 0;
		return { state: 'reached', needed: 0, daysLeft, planned, ahead, today: written, said: `Reached on ${sayDay(k?.n ?? t, { year: false })}${early > 0 ? `, ${count(early, 'day')} early` : ''}.`, then: '' };
	}
	if (t > to) return { state: 'passed', needed: 0, daysLeft: 0, planned, ahead, today: written, said: `${sayDay(to)} passed at ${fmt(total)} of ${fmt(p.target)}.`, then: 'Set a new date to plan from here.' };
	const perDay = Math.max(1, (p.target - p.fromTotal) / Math.max(1, daysLeft + 1)), daysOff = Math.round(Math.abs(ahead) / Math.max(1, needed || perDay));
	const state = Math.abs(ahead) < Math.max(needed, 1) * 2 ? 'on' : ahead > 0 ? 'ahead' : 'behind';
	const said = state === 'on' ? 'On pace.' : state === 'ahead' ? `${fmt(ahead)} words ahead of the plan, about ${count(Math.max(1, daysOff), 'day')}.` : `${fmt(-ahead)} words behind the plan.`;
	return { state, needed, daysLeft, planned, ahead, today: written, said, then: `${fmt(needed)} a day gets there by ${by}.` };
}

/** When the book reaches `target` at the pace of the last `window` days, said no finer than a third of a month:
    a few weeks' pace doesn't know the day. Null if it isn't growing. */
export function projected(rs: Row[], target: number, window = 30): { n: number; said: string; perDay: number } | null {
	if (rs.length < 2) return null;
	const end = rs[rs.length - 1], back = rs[Math.max(0, rs.length - 1 - window)], days = Math.max(1, end.n - back.n);
	const perDay = (end.total - back.total) / days;
	if (perDay <= 0 || end.total >= target) return null;
	const n = Math.round(end.n + (target - end.total) / perDay), d = new Date(n * 864e5), dom = d.getUTCDate();
	if (n - end.n > 3650) return null;
	return { n, perDay, said: `${dom <= 10 ? 'early' : dom <= 20 ? 'mid' : 'late'} ${monthName(d.getUTCMonth())}${d.getUTCFullYear() !== new Date(end.n * 864e5).getUTCFullYear() ? ' ' + d.getUTCFullYear() : ''}` };
}

// ---- the book's story: what the chart says in words ----

/** A stretch of the book's life worth a word on the chart. */
export interface Chapter { kind: 'away' | 'burst' | 'cut'; from: number; to: number; said: string }

export function chapters(rs: Row[]): Chapter[] {
	const out: Chapter[] = [];
	if (rs.length < 45) return out;
	// times away: four weeks or more with nothing, between two days of writing
	let lastWrote = -1;
	rs.forEach((r, i) => {
		if (!wrote(r)) return;
		if (lastWrote >= 0 && r.n - rs[lastWrote].n >= 28) out.push({ kind: 'away', from: rs[lastWrote].n, to: r.n, said: `${fmt(r.n - rs[lastWrote].n)} days away` });
		lastWrote = i;
	});
	// the best thirty days, if they stand out from the book's usual month
	let best = 0, bestAt = 0, sum = 0;
	const monthly: number[] = [];
	for (let i = 0; i < rs.length; i++) {
		sum += net(rs[i]);
		if (i >= 30) sum -= net(rs[i - 30]);
		if (i >= 29 && sum > best) { best = sum; bestAt = i; }
		if (i % 30 === 29) monthly.push(sum);
	}
	const usual = [...monthly].sort((a, b) => a - b)[Math.floor(monthly.length / 2)] ?? 0;
	if (best > 4000 && best > usual * 3) out.push({ kind: 'burst', from: rs[bestAt - 29].n, to: rs[bestAt].n, said: `${fmt(best)} words in 30 days` });
	// the deepest cut: from a high point down to the lowest after it
	let peak = 0, drop = 0, dropFrom = 0, dropTo = 0;
	for (let i = 0; i < rs.length; i++) {
		if (rs[i].total > rs[peak].total) peak = i;
		const d = rs[peak].total - rs[i].total;
		if (d > drop) { drop = d; dropFrom = peak; dropTo = i; }
	}
	if (drop > 2000 && drop > rs[dropFrom].total * 0.04) out.push({ kind: 'cut', from: rs[dropFrom].n, to: rs[dropTo].n, said: `${fmt(drop)} words cut` });
	return out;
}

// ---- records and oddities ----

export interface Fact { group: string; label: string; value: string; note: string }

const hour = (x: number): string => (x === 0 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x} am` : `${x - 12} pm`);

export function facts(h: History, rs: Row[], scope = ''): Fact[] {
	const out: Fact[] = [];
	if (!rs.length) return out;
	const add = (group: string, label: string, value: string, note = ''): void => { out.push({ group, label, value, note }); };
	const days = rs.filter(wrote), life = rs.length, base = baseOf(rs);
	const max = <T,>(list: T[], f: (x: T) => number): T | null => list.reduce<T | null>((a, x) => (a == null || f(x) > f(a) ? x : a), null);
	const typed = rs.reduce((a, r) => a + r.added, 0), cut = rs.reduce((a, r) => a + r.cut, 0), total = rs[rs.length - 1].total;
	const days_ = h.days.filter((d) => num(d.day) >= rs[0].n && num(d.day) <= rs[rs.length - 1].n);

	// records
	const bestDay = max(days, net);
	if (bestDay && net(bestDay) > 0) add('Records', 'Longest day', fmt(net(bestDay)), sayDay(bestDay.n, { weekday: true }));
	if (life >= 14) {
		let best = 0, at = 0, sum = 0;
		for (let i = 0; i < rs.length; i++) { sum += net(rs[i]); if (i >= 7) sum -= net(rs[i - 7]); if (sum > best) { best = sum; at = i; } }
		if (best > 0) add('Records', 'Best seven days', fmt(best), `to ${sayDay(rs[at].n)}`);
	}
	if (life >= 60) {
		const months = new Map<string, number>();
		for (const r of rs) { const d = new Date(r.n * 864e5), k = `${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}`; months.set(k, (months.get(k) ?? 0) + net(r)); }
		const m = max([...months], (x) => x[1]);
		if (m && m[1] > 0) add('Records', 'Best month', fmt(m[1]), m[0]);
	}
	// the longest run of days in a row, as something that happened, not something to keep up
	let run = 0, bestRun = 0, runEnd = 0;
	for (const r of rs) { if (wrote(r)) { run++; if (run > bestRun) { bestRun = run; runEnd = r.n; } } else run = 0; }
	if (bestRun >= 3 && life >= 7) add('Records', 'Longest run', count(bestRun, 'day'), `in a row, to ${sayDay(runEnd)}`);
	if (typed >= 12000) {
		let fastest = Infinity, fastestAt = 0, j = 0, acc = 0;
		for (let i = 0; i < rs.length; i++) {
			acc += rs[i].added;
			while (acc - rs[j].added >= 10000) { acc -= rs[j].added; j++; }
			if (acc >= 10000 && i - j + 1 < fastest) { fastest = i - j + 1; fastestAt = i; }
		}
		if (isFinite(fastest)) add('Records', 'Fastest 10,000 words', count(fastest, 'day'), `to ${sayDay(rs[fastestAt].n)}`);
		let slow = 0, slowTo = 0, from = rs[0].n, sum = 0, next = 10000;
		for (const r of rs) { sum += r.added; if (sum >= next) { if (r.n - from > slow) { slow = r.n - from; slowTo = r.n; } from = r.n; next += 10000; } }
		if (slow > fastest * 3) add('Records', 'Slowest 10,000 words', count(slow, 'day'), `to ${sayDay(slowTo)}`);
	}

	// the cutting
	const worst = max(days, (r) => r.cut - r.added);
	if (worst && worst.cut - worst.added > 150) add('Cutting', 'The day most was cut', fmt(worst.cut - worst.added), sayDay(worst.n, { weekday: true }));
	// (how many words a book took can be said only of a book the record saw begin)
	if (base <= 50 && typed > total * 1.08 && total > 0) add('Cutting', 'Typed to keep these', fmt(typed), `${(typed / total).toFixed(2)} words typed for each one kept`);
	if (cut >= 500) add('Cutting', 'Cut by typing', fmt(cut), cut > 17500 ? 'a novella’s worth' : cut > 7500 ? 'a long short story’s worth' : cut > 1000 ? 'a scene or two' : '');
	const shorter = days.filter((r) => net(r) <= 0).length;
	if (shorter >= 3) add('Cutting', 'Days that ended shorter', fmt(shorter), 'more cut than written');

	// time
	let lastWrote = -1, gap = 0, gapTo = 0;
	rs.forEach((r, i) => { if (!wrote(r)) return; if (lastWrote >= 0 && r.n - rs[lastWrote].n > gap) { gap = r.n - rs[lastWrote].n; gapTo = i; } lastWrote = i; });
	if (gap >= 14) add('Time', 'Longest time away', count(gap, 'day'), `back on ${sayDay(rs[gapTo].n)} with ${fmt(Math.abs(net(rs[gapTo])))} words${net(rs[gapTo]) < 0 ? ' cut' : ''}`);
	add('Time', 'Days written on', fmt(days.length), life > 1 ? `of ${fmt(life)}${base > 50 ? ' since the record began' : ''}: ${Math.round((days.length / life) * 100)}%` : 'the first');
	const minutes = rs.reduce((a, r) => a + r.minutes, 0);
	if (minutes >= 30) add('Time', 'Time typing', span(minutes), days.length > 1 ? `the minutes something was typed in: ${Math.round(minutes / days.length)} on a day of writing` : 'the minutes something was typed in');
	let sitting = 0, sittingOn = '';
	for (const d of days_) for (const s of d.sittings ?? []) if (s[1] - s[0] > sitting) { sitting = s[1] - s[0]; sittingOn = d.day; }
	if (sitting >= 30 && scope === '') add('Time', 'Longest sitting', span(sitting), sayDay(num(sittingOn), { weekday: true }));
	const grew = days.map(net).filter((v) => v > 0).sort((a, b) => a - b);
	if (grew.length >= 5) add('Time', 'A usual day', fmt(grew[Math.floor(grew.length / 2)]), 'the middle one of the days the book grew');

	// habits
	const hours = hourShape(h, scope), hourSum = hours.reduce((a, b) => a + b, 0), wd = weekdayShape(rs);
	if (hourSum > 0 && days.length >= 2) {
		// (a day runs from four in the morning: one o'clock at night is late, not early)
		const had = hours.map((v, i) => (v > 0 ? (i + 20) % 24 : -1)).filter((x) => x >= 0);
		add('Habits', 'Earliest and latest', `${hour((Math.min(...had) + 4) % 24)}, ${hour((Math.max(...had) + 4) % 24)}`, 'the hours words were added in');
		const night = hours.slice(22).concat(hours.slice(0, 4)).reduce((a, b) => a + b, 0);
		if (night / hourSum > 0.02 && days.length >= 5) add('Habits', 'Written after ten at night', `${Math.round((night / hourSum) * 100)}%`, `${fmt(night)} words`);
	}
	if (life >= 28 && !alike(wd)) { const k = wd.indexOf(Math.max(...wd)); add('Habits', 'Best weekday', weekdayName(k), `${fmt(wd[k])} words in all`); }
	const phone = days_.reduce((a, d) => a + d.phone, 0);
	if (phone > 0 && scope === '' && typed > 0) add('Habits', 'Written on a phone or tablet', `${Math.max(1, Math.round((phone / typed) * 100))}%`, `${fmt(phone)} words`);

	// the scenes
	const per = new Map<string, { days: number; added: number; cut: number; first: number }>();
	for (const d of days_) for (const [path, v] of Object.entries(d.notes)) {
		if (!inScope(path, scope) || !(v[0] || v[1])) continue;
		const p = per.get(path) ?? { days: 0, added: 0, cut: 0, first: num(d.day) };
		p.days++; p.added += v[0]; p.cut += v[1];
		per.set(path, p);
	}
	const scenes = [...per];
	if (scenes.length >= 3) {
		const back = max(scenes, (s) => s[1].days);
		if (back && back[1].days >= 3) add('Scenes', 'The scene you came back to most', last(back[0]), `written on ${count(back[1].days, 'day')}`);
		const rewritten = max(scenes.filter((s) => s[1].added > 300), (s) => s[1].cut / s[1].added);
		if (rewritten && rewritten[1].cut > 200) add('Scenes', 'Rewritten most', last(rewritten[0]), `${fmt(rewritten[1].added)} typed, ${fmt(rewritten[1].cut)} cut`);
		const most = max(days_, (d) => Object.keys(d.notes).filter((p) => inScope(p, scope)).length), mostN = most ? Object.keys(most.notes).filter((p) => inScope(p, scope)).length : 0;
		if (most && mostN >= 3) add('Scenes', 'Most scenes in a day', fmt(mostN), sayDay(num(most.day)));
	}
	if (scenes.length && base <= 50) { const first = scenes.reduce((a, s) => (s[1].first < a[1].first ? s : a)); add('Scenes', 'It began with', last(first[0]), sayDay(first[1].first, { weekday: true })); }
	if (scope === '' && (h.orders ?? 0) > 0) add('Scenes', 'Times the order changed', fmt(h.orders ?? 0), '');

	// what came and went without typing
	const brought = rs.reduce((a, r) => a + Math.max(0, r.block), 0), taken = rs.reduce((a, r) => a + Math.max(0, -r.block), 0), elsewhere = rs.reduce((a, r) => a + Math.abs(r.elsewhere), 0);
	if (brought > 0) add('Not typed', 'Brought in at once', fmt(brought), 'a paste, an import: more than fifty words in one change');
	if (taken > 0) add('Not typed', 'Taken out at once', fmt(taken), 'a cut, a scene deleted');
	if (elsewhere > 0) add('Not typed', 'Changed elsewhere', fmt(elsewhere), 'in another program, or on a device without Binders');
	return out;
}

/** Words added in each hour of the day, over the record. */
export function hourShape(h: History, scope = ''): number[] {
	const out = new Array<number>(24).fill(0);
	for (const d of h.days) {
		if (scope && !Object.keys(d.notes).some((p) => inScope(p, scope))) continue;
		for (const [k, v] of Object.entries(d.hours)) out[+k] += v;
	}
	return out;
}

/** Words written on each weekday (0 is Sunday), cuts counted against them and never below none. */
export function weekdayShape(rs: Row[]): number[] {
	const out = new Array<number>(7).fill(0);
	for (const r of rs) out[weekday(r.n)] += Math.max(0, net(r));
	return out;
}

/** In a sentence: the stretch of hours most is written in. */
export function hourSaid(hours: number[]): string {
	const sum = hours.reduce((a, b) => a + b, 0);
	if (!sum) return '';
	let best = 0, at = 0;
	for (let i = 0; i < 24; i++) { const v = hours[i] + hours[(i + 1) % 24] + hours[(i + 2) % 24]; if (v > best) { best = v; at = i; } }
	const say = (x: number): string => (x % 24 === 0 ? 'midnight' : x % 24 === 12 ? 'noon' : x % 24 < 12 ? `${x % 24}` : `${(x % 24) - 12}`);
	const half = (x: number): string => (x % 24 === 0 || x % 24 === 12 ? '' : x % 24 < 12 ? ' in the morning' : x % 24 < 18 ? ' in the afternoon' : ' in the evening');
	return `${Math.round((best / sum) * 100)}% of it between ${say(at)} and ${say(at + 3)}${half(at + 1)}`;
}

/** The words each top item of the scope has had over time: one line a part, on the days of `rs`, counted back from
    what it holds now (`nowBy`, by name) where that is known, else on from nothing. */
export function parts(h: History, rs: Row[], names: string[], scope = '', nowBy?: Record<string, number>): { name: string; totals: number[]; now: number; grewMost: string }[] {
	const index = new Map(rs.map((r, i) => [r.n, i]));
	return names.map((name) => {
		const path = scope ? `${scope}/${name}` : name, delta = new Array<number>(rs.length).fill(0);
		for (const d of h.days) { const i = index.get(num(d.day)); if (i == null) continue; for (const [p, v] of Object.entries(d.notes)) if (inScope(p, path)) delta[i] += v[0] - v[1] + v[2]; }
		const totals = new Array<number>(rs.length).fill(0), known = nowBy?.[name];
		if (known !== undefined) { let t = known; for (let i = rs.length - 1; i >= 0; i--) { totals[i] = Math.max(0, t); t -= delta[i]; } } else { let t = 0; delta.forEach((x, i) => { t = Math.max(0, t + x); totals[i] = t; }); }
		const byMonth = new Map<string, number>();
		delta.forEach((x, i) => { if (x) { const d = new Date(rs[i].n * 864e5), k = `${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}`; byMonth.set(k, (byMonth.get(k) ?? 0) + x); } });
		const top = [...byMonth].sort((a, b) => b[1] - a[1])[0];
		return { name, totals, now: totals[rs.length - 1] ?? 0, grewMost: top && top[1] > 0 ? top[0] : '' };
	});
}

/** The binder's words by status at each day's end, carried over the days nothing was stamped. */
export function statusSeries(h: History, rs: Row[]): { status: string; totals: number[] }[] {
	const stamped = h.days.filter((d) => Object.keys(d.status).length > 0);
	const seen = new Set(stamped.flatMap((d) => Object.keys(d.status).filter((s) => d.status[s] > 0)));
	const names = [...h.statuses.filter((s) => seen.has(s)), ...[...seen].filter((s) => !h.statuses.includes(s))];
	const byDay = new Map(stamped.map((d) => [num(d.day), d.status]));
	let cur: Record<string, number> = {};
	const out = names.map((status) => ({ status, totals: [] as number[] }));
	for (const r of rs) { cur = byDay.get(r.n) ?? cur; out.forEach((o) => o.totals.push(cur[o.status] ?? 0)); }
	return out;
}
