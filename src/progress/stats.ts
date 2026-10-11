/* Progress over time: everything the dashboard says, worked out from a history. Pure (no Obsidian), so it can be
   unit-tested when the feature is built. */

import { count, fmt, monthName, num, sayDay, weekday, weekdayName, type History, type Plan } from './model';

/** One calendar day, whether anything was written or not. */
export interface Row { n: number; total: number; added: number; cut: number; block: number; minutes: number }

const inScope = (path: string, scope: string): boolean => scope === '' || path === scope || path.startsWith(scope + '/');

/** Every day from the first with anything to today, for the notes under `scope` ('' is the binder). */
export function rows(h: History, today: string, scope = ''): Row[] {
	const end = num(today), out: Row[] = [];
	if (!h.days.length) return out;
	const base = scope === '' && h.estimate.length ? h.estimate[h.estimate.length - 1].total : 0;
	let total = base, n = num(h.days[0].day);
	for (const d of h.days) {
		const dn = num(d.day);
		for (; n < dn; n++) out.push({ n, total, added: 0, cut: 0, block: 0, minutes: 0 });
		let added = 0, cut = 0, block = 0;
		for (const [path, v] of Object.entries(d.notes)) if (inScope(path, scope)) { added += v[0]; cut += v[1]; block += v[2]; }
		total += added - cut + block;
		out.push({ n: dn, total, added, cut, block, minutes: added || cut ? d.minutes : 0 });
		n = dn + 1;
	}
	for (; n <= end; n++) out.push({ n, total, added: 0, cut: 0, block: 0, minutes: 0 });
	return out;
}

const wrote = (r: Row): boolean => r.added > 0 || r.cut > 0;

// ---- the plan ----

export interface Pace {
	/** 'none' (no deadline), 'reached', 'passed', or how today stands against the plan. */
	state: 'ahead' | 'on' | 'behind' | 'reached' | 'passed';
	/** Words a writing day from here to get there, and how many of those days are left (today counts if it is one). */
	needed: number; daysLeft: number;
	/** Where the plan has the book at the end of today, and how far the book is from that (ahead is positive). */
	planned: number; ahead: number;
	/** What is written today, toward `needed`. */
	today: number;
	/** In a sentence, and a second that says what to do about it (or ''). */
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
	const t = num(today), to = num(p.deadline), last = rs[rs.length - 1], total = last?.total ?? 0;
	const written = last && last.n === t ? last.added - last.cut : 0;
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
	const last = rs[rs.length - 1], back = rs[Math.max(0, rs.length - 1 - window)], span = Math.max(1, last.n - back.n);
	const perDay = (last.total - back.total) / span;
	if (perDay <= 0 || last.total >= target) return null;
	const n = Math.round(last.n + (target - last.total) / perDay), d = new Date(n * 864e5), dom = d.getUTCDate();
	if (n - last.n > 3650) return null;
	return { n, perDay, said: `${dom <= 10 ? 'early' : dom <= 20 ? 'mid' : 'late'} ${monthName(d.getUTCMonth())}${d.getUTCFullYear() !== new Date(last.n * 864e5).getUTCFullYear() ? ' ' + d.getUTCFullYear() : ''}` };
}

// ---- the book's story: what the chart says in words ----

/** A stretch of the book's life worth a word on the chart. */
export interface Chapter { kind: 'away' | 'burst' | 'cut' | 'milestone'; from: number; to: number; said: string; weight: number }

export function chapters(rs: Row[]): Chapter[] {
	const out: Chapter[] = [];
	if (rs.length < 45) return out;
	// times away: three weeks or more with nothing, between two days of writing
	let lastWrote = -1;
	rs.forEach((r, i) => {
		if (!wrote(r)) return;
		if (lastWrote >= 0 && r.n - rs[lastWrote].n >= 28) out.push({ kind: 'away', from: rs[lastWrote].n, to: r.n, said: `${fmt(r.n - rs[lastWrote].n)} days away`, weight: r.n - rs[lastWrote].n });
		lastWrote = i;
	});
	// the best thirty days, if they stand out from the book's usual month
	let best = 0, bestAt = 0, sum = 0;
	const monthly: number[] = [];
	for (let i = 0; i < rs.length; i++) {
		sum += rs[i].added - rs[i].cut;
		if (i >= 30) sum -= rs[i - 30].added - rs[i - 30].cut;
		if (i >= 29 && sum > best) { best = sum; bestAt = i; }
		if (i % 30 === 29) monthly.push(sum);
	}
	const usual = [...monthly].sort((a, b) => a - b)[Math.floor(monthly.length / 2)] ?? 0;
	if (best > 4000 && best > usual * 3) out.push({ kind: 'burst', from: rs[bestAt - 29].n, to: rs[bestAt].n, said: `${fmt(best)} words in 30 days`, weight: 1000 });
	// the deepest cut: from a high point down to the lowest after it
	let peak = 0, drop = 0, dropFrom = 0, dropTo = 0;
	for (let i = 0; i < rs.length; i++) {
		if (rs[i].total > rs[peak].total) peak = i;
		const d = rs[peak].total - rs[i].total;
		if (d > drop) { drop = d; dropFrom = peak; dropTo = i; }
	}
	if (drop > 2000 && drop > rs[dropFrom].total * 0.04) out.push({ kind: 'cut', from: rs[dropFrom].n, to: rs[dropTo].n, said: `${fmt(drop)} words cut`, weight: 900 });
	return out;
}

// ---- records and oddities ----

export interface Fact { group: string; label: string; value: string; note: string; needs: 'record' | 'text' | 'now' }

export function facts(h: History, rs: Row[], scope = ''): Fact[] {
	const out: Fact[] = [];
	if (!rs.length) return out;
	const add = (group: string, label: string, value: string, note = ''): void => { out.push({ group, label, value, note, needs: 'record' }); };
	const net = (r: Row): number => r.added - r.cut;
	const days = rs.filter(wrote), life = rs[rs.length - 1].n - rs[0].n + 1;
	const max = <T,>(list: T[], f: (x: T) => number): T | null => list.reduce<T | null>((a, x) => (a == null || f(x) > f(a) ? x : a), null);
	const written = rs.reduce((a, r) => a + r.added, 0), cut = rs.reduce((a, r) => a + r.cut - Math.min(0, r.block), 0), total = rs[rs.length - 1].total;

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
		if (m) add('Records', 'Best month', fmt(m[1]), m[0]);
	}
	// the longest run of days in a row, as something that happened, not something to keep up
	let run = 0, bestRun = 0, runEnd = 0;
	for (const r of rs) { if (wrote(r)) { run++; if (run > bestRun) { bestRun = run; runEnd = r.n; } } else run = 0; }
	if (bestRun >= 3) add('Records', 'Longest run', count(bestRun, 'day'), `in a row, to ${sayDay(runEnd)}`);
	// the fastest ten thousand words
	if (written >= 12000) {
		let fastest = Infinity, fastestAt = 0, j = 0, acc = 0;
		for (let i = 0; i < rs.length; i++) {
			acc += rs[i].added;
			while (acc - rs[j].added >= 10000) { acc -= rs[j].added; j++; }
			if (acc >= 10000 && i - j + 1 < fastest) { fastest = i - j + 1; fastestAt = i; }
		}
		if (isFinite(fastest)) add('Records', 'Fastest 10,000 words', count(fastest, 'day'), `to ${sayDay(rs[fastestAt].n)}`);
		// and the slowest: the first to the ten-thousandth, the ten-thousandth to the twenty-thousandth, …
		let slow = 0, slowTo = 0, from = rs[0].n, sum = 0, next = 10000;
		for (const r of rs) { sum += r.added; if (sum >= next) { if (r.n - from > slow) { slow = r.n - from; slowTo = r.n; } from = r.n; next += 10000; } }
		if (slow > fastest * 3) add('Records', 'Slowest 10,000 words', count(slow, 'day'), `to ${sayDay(slowTo)}`);
	}

	// the cutting
	const worst = max(days, (r) => r.cut - r.added - Math.min(0, r.block));
	if (worst && worst.cut - worst.added - Math.min(0, worst.block) > 150) add('Cutting', 'The day most was cut', fmt(worst.cut - worst.added - Math.min(0, worst.block)), sayDay(worst.n, { weekday: true }));
	if (written > total * 1.08 && total > 0) {
		add('Cutting', 'Written to keep these', fmt(written), `${(written / total).toFixed(2)} words written for each one kept`);
		add('Cutting', 'On the floor', fmt(cut), cut > 17500 ? 'a novella’s worth' : cut > 7500 ? 'a long short story’s worth' : cut > 1000 ? 'a scene or two' : '');
	}
	const editing = days.filter((r) => net(r) <= 0).length;
	if (editing >= 3) add('Cutting', 'Days that ended shorter', fmt(editing), 'more cut than written');

	// away and back
	let lastWrote = -1, gap = 0, gapTo = 0;
	rs.forEach((r, i) => { if (!wrote(r)) return; if (lastWrote >= 0 && r.n - rs[lastWrote].n > gap) { gap = r.n - rs[lastWrote].n; gapTo = i; } lastWrote = i; });
	if (gap >= 14) add('Time', 'Longest time away', count(gap, 'day'), `back on ${sayDay(rs[gapTo].n)} with ${fmt(Math.abs(net(rs[gapTo])))} words${net(rs[gapTo]) < 0 ? ' cut' : ''}`);
	add('Time', 'Days written on', fmt(days.length), life > 1 ? `of ${fmt(life)}: ${Math.round((days.length / life) * 100)}%` : 'the first');
	const minutes = rs.reduce((a, r) => a + r.minutes, 0);
	if (minutes >= 60) add('Time', 'Time at the page', minutes >= 600 ? `${fmt(minutes / 60)} hours` : `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`, days.length > 1 ? `${Math.round(minutes / days.length)} minutes on a day of writing` : '');
	if (days.length >= 5) add('Time', 'A usual day', fmt(days.map(net).filter((v) => v > 0).sort((a, b) => a - b)[Math.floor(days.filter((r) => net(r) > 0).length / 2)] ?? 0), 'the middle one of the days the book grew');

	// when
	const hours = hourShape(h, scope), wd = weekdayShape(rs);
	const hourSum = hours.reduce((a, b) => a + b, 0);
	if (hourSum > 0 && days.length >= 5) {
		const say = (x: number): string => (x === 0 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x} am` : `${x - 12} pm`);
		let late = -1, early = -1;
		// (a day runs from 4 in the morning: one o'clock at night is late, not early)
		for (const d of h.days) for (const k of Object.keys(d.hours)) { const x = (+k + 20) % 24; if (x > late) late = x; if (early < 0 || x < early) early = x; }
		add('Habits', 'Earliest and latest', `${say((early + 4) % 24)}, ${say((late + 4) % 24)}`, 'the hours writing has started in');
		const night = hours.slice(22).concat(hours.slice(0, 4)).reduce((a, b) => a + b, 0);
		if (night / hourSum > 0.02) add('Habits', 'Written after ten at night', `${Math.round((night / hourSum) * 100)}%`, `${fmt(night)} words`);
	}
	if (days.length >= 14) { const k = wd.indexOf(Math.max(...wd)); add('Habits', 'Best weekday', weekdayName(k), `${fmt(wd[k])} words in all`); }
	const phone = h.days.reduce((a, d) => a + d.phone, 0);
	if (phone > 0 && scope === '') add('Habits', 'Written on a phone', `${Math.max(1, Math.round((phone / Math.max(1, written)) * 100))}%`, `${fmt(phone)} words`);

	// the scenes
	const per = new Map<string, { days: number; added: number; cut: number; first: number }>();
	for (const d of h.days) for (const [path, v] of Object.entries(d.notes)) {
		if (!inScope(path, scope) || !(v[0] || v[1])) continue;
		const p = per.get(path) ?? { days: 0, added: 0, cut: 0, first: num(d.day) };
		p.days++; p.added += v[0]; p.cut += v[1];
		per.set(path, p);
	}
	const name = (path: string): string => path.split('/').pop() ?? path;
	const scenes = [...per];
	if (scenes.length >= 3) {
		const back = max(scenes, (s) => s[1].days);
		if (back) add('Scenes', 'The scene you came back to most', name(back[0]), `written on ${count(back[1].days, 'day')}`);
		const rewritten = max(scenes.filter((s) => s[1].added > 300), (s) => s[1].cut / s[1].added);
		if (rewritten && rewritten[1].cut > 200) add('Scenes', 'Rewritten most', name(rewritten[0]), `${fmt(rewritten[1].added)} written, ${fmt(rewritten[1].cut)} cut`);
		const once = scenes.filter((s) => s[1].days === 1 && s[1].added > 400);
		if (once.length) add('Scenes', 'Written in one day', count(once.length, 'scene'), `the longest: ${name(max(once, (s) => s[1].added)?.[0] ?? '')}`);
		const firstScene = scenes.reduce((a, s) => (s[1].first < a[1].first ? s : a));
		add('Scenes', 'It began with', name(firstScene[0]), sayDay(firstScene[1].first, { weekday: true }));
		const most = max(h.days, (d) => Object.keys(d.notes).filter((p) => inScope(p, scope)).length);
		if (most && Object.keys(most.notes).length >= 3) add('Scenes', 'Most scenes in a day', fmt(Object.keys(most.notes).filter((p) => inScope(p, scope)).length), sayDay(num(most.day)));
	}
	const moves = h.days.reduce((a, d) => a + d.moves, 0);
	if (moves > 0 && scope === '') add('Scenes', 'Times the order changed', fmt(moves), '');
	return out;
}

/** Words added in each hour of the day, over the binder's life. */
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
	for (const r of rs) out[weekday(r.n)] += Math.max(0, r.added - r.cut);
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

/** The words each top item of the scope has had over time: one line a part, on the days of `rs`. */
export function parts(h: History, rs: Row[], names: string[], scope = ''): { name: string; totals: number[]; now: number; first: number; grewMost: string }[] {
	const index = new Map(rs.map((r, i) => [r.n, i]));
	return names.map((name) => {
		const path = scope ? `${scope}/${name}` : name, delta = new Array<number>(rs.length).fill(0);
		for (const d of h.days) { const i = index.get(num(d.day)); if (i == null) continue; for (const [p, v] of Object.entries(d.notes)) if (inScope(p, path)) delta[i] += v[0] - v[1] + v[2]; }
		const totals: number[] = [];
		let t = 0, first = -1;
		const byMonth = new Map<string, number>();
		delta.forEach((x, i) => { t += x; totals.push(t); if (first < 0 && x > 0) first = rs[i].n; if (x) { const d = new Date(rs[i].n * 864e5), k = `${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}`; byMonth.set(k, (byMonth.get(k) ?? 0) + x); } });
		const top = [...byMonth].sort((a, b) => b[1] - a[1])[0];
		return { name, totals, now: t, first, grewMost: top && top[1] > 0 ? top[0] : '' };
	});
}

/** The binder's words by status at each day's end, carried over the days nothing was written. */
export function statusSeries(h: History, rs: Row[]): { status: string; totals: number[] }[] {
	const names = h.statuses.filter((s) => h.days.some((d) => d.status[s]));
	const byDay = new Map(h.days.map((d) => [num(d.day), d.status]));
	let cur: Record<string, number> = {};
	const out = names.map((status) => ({ status, totals: [] as number[] }));
	for (const r of rs) { cur = byDay.get(r.n) ?? cur; out.forEach((o) => o.totals.push(cur[o.status] ?? 0)); }
	return out;
}
