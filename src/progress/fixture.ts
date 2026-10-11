/* STAGE 2 ONLY: a made-up history for the design round, since nothing is recorded yet. Deterministic: the same
   binder and the same day give the same three years. To be deleted when the record is built.

   The life it makes: a slow first year, one month of two thousand words a day, a first draft finished, four months
   away, a revision that cuts about a sixth of the book, and a second draft up to today. */

import { dayStr, num, weekday, type Day, type History, type Mark } from './model';

export type FixtureKind = 'novel' | 'new' | 'estimated';
export interface FixtureScene { path: string; words: number }

function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** What a day of each stretch looks like: the chance of writing at all (weekdays, weekends), and how much. */
interface Phase { days: number; net: number; cutShare: number; p: [number, number]; size: [number, number]; hours: number[]; revise?: boolean }

export function fixture(kind: FixtureKind, scenes: FixtureScene[], today: string, statuses: string[]): History {
	const r = rng(20261010), end = num(today);
	const real = scenes.filter((s) => s.words > 0);
	const list = real.length ? real : [{ path: 'Untitled', words: 400 }];
	const F = list.reduce((a, s) => a + s.words, 0);
	if (kind === 'new') {
		const n = Math.min(F, 412) || 412;
		return { days: [{ day: today, notes: { [list[0].path]: [n + 23, 23, 0] }, minutes: 34, hours: { 7: n + 23 }, phone: 0, moves: 0, status: { [statuses[1] ?? '']: n } }], estimate: [], marks: [], statuses };
	}

	const morning = [0, 0, 0, 0, 0, 2, 9, 10, 6, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 1], allDay = [1, 0, 0, 0, 0, 2, 7, 8, 5, 2, 1, 1, 5, 4, 1, 0, 0, 1, 2, 4, 7, 8, 6, 3], evening = [0, 0, 0, 0, 0, 0, 2, 3, 2, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 4, 7, 8, 5, 2];
	const phases: Phase[] = [
		{ days: 410, net: 0.17, cutShare: 0.07, p: [0.2, 0.42], size: [90, 520], hours: morning },
		{ days: 30, net: 0.4, cutShare: 0.03, p: [0.97, 0.97], size: [1200, 2900], hours: allDay },
		{ days: 95, net: 0.2, cutShare: 0.06, p: [0.55, 0.6], size: [300, 1300], hours: morning },
		{ days: 124, net: 0, cutShare: 0, p: [0, 0], size: [0, 0], hours: morning },
		{ days: 118, net: -0.15, cutShare: 3.2, p: [0.5, 0.35], size: [150, 900], hours: evening, revise: true },
		{ days: 262, net: 0.2, cutShare: 0.22, p: [0.5, 0.35], size: [250, 1000], hours: morning },
		{ days: 80, net: 0.18, cutShare: 0.1, p: [0.8, 0.66], size: [250, 800], hours: morning },
	];
	const start = end - phases.reduce((a, p) => a + p.days, 0) + 1;

	// each scene's share of the first draft: about its size now, some overwritten and cut back later
	const share = list.map((s) => s.words * (0.75 + r() * 0.7));
	const shareSum = share.reduce((a, b) => a + b, 0);
	const drafted = share.map((s) => (s / shareSum) * 0.77 * F);
	const now = list.map(() => 0), first = list.map(() => -1);
	const days: Day[] = [];
	const cumulative: number[][] = [];
	let at = start, pointer = 0, revisePointer = 0;
	const pick = (weights: number[]): number => { let x = r() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return i; } return weights.length - 1; };

	phases.forEach((ph, pi) => {
		// the days written on, and how much of the stretch's words each takes
		const plan: { n: number; w: number; c: number }[] = [];
		let hole = pi === 0 ? 150 + Math.floor(r() * 60) : -1;
		for (let i = 0; i < ph.days; i++) {
			const n = at + i, we = weekday(n) === 0 || weekday(n) === 6;
			if (hole >= 0 && i >= hole && i < hole + 44) continue; // (a first winter away, in the slow year)
			if (r() < ph.p[we ? 1 : 0]) plan.push({ n, w: ph.size[0] + r() * r() * (ph.size[1] - ph.size[0]) * (we ? 1.3 : 1), c: r() });
		}
		hole = -1;
		const sumW = plan.reduce((a, d) => a + d.w, 0), sumC = plan.reduce((a, d) => a + d.c * d.w, 0);
		// added − cut = net, cut = cutShare × added
		const added = ph.revise ? (Math.abs(ph.net) * F) / (ph.cutShare - 1) : (ph.net * F) / (1 - ph.cutShare), cut = added * ph.cutShare;
		for (const d of plan) {
			const a = Math.round((d.w / sumW) * added);
			const c = Math.round(((d.c * d.w) / sumC) * cut);
			const notes: Record<string, [number, number, number]> = {};
			const put = (i: number, add: number, take: number, block = 0) => {
				take = Math.min(take, Math.max(0, now[i] + add));
				const v = notes[list[i].path] ?? (notes[list[i].path] = [0, 0, 0]);
				v[0] += add; v[1] += take; v[2] += block;
				now[i] += add - take + block;
				if (first[i] < 0 && add > 0) first[i] = d.n;
			};
			if (pi < 3) {
				// drafting: the next scene in the book, sometimes one somewhere else
				let left = a;
				while (left > 0) {
					while (pointer < list.length - 1 && now[pointer] >= drafted[pointer]) pointer++;
					const i = r() < 0.12 ? Math.floor(r() * Math.min(list.length, pointer + 4)) : pointer;
					const room = Math.max(40, Math.ceil(drafted[i] - now[i]));
					const n = Math.min(left, i === pointer ? room : Math.ceil(left * 0.4));
					put(i, n, 0);
					left -= n;
				}
				put(pointer > 0 && r() < 0.5 ? pointer - 1 : pointer, 0, c);
			} else {
				// revising: a scene or two a day, in order, round and round
				const touched = 1 + Math.floor(r() * 2.4);
				for (let k = 0; k < touched; k++) {
					const i = (revisePointer + k) % list.length;
					const takes = Math.round(c / touched), adds = Math.round(a / touched);
					put(i, adds, takes);
				}
				if (r() < (ph.revise ? 0.55 : 0.4)) revisePointer = (revisePointer + touched) % list.length;
			}
			// the hours: one sitting, sometimes two
			const hours: Record<number, number> = {};
			const h1 = pick(ph.hours), total = Object.values(notes).reduce((s, v) => s + v[0], 0);
			const split = total > 900 || r() < 0.25;
			hours[h1] = Math.round(total * (split ? 0.6 : 1));
			if (split) { const h2 = r() < 0.6 ? Math.min(23, h1 + 1) : pick(ph.hours); hours[h2] = (hours[h2] ?? 0) + total - Math.round(total * 0.6); }
			const phone = r() < 0.11 && total < 500 ? total : 0;
			days.push({ day: dayStr(d.n), notes, minutes: Math.round(total / (16 + r() * 14) + (ph.revise ? 25 + r() * 70 : 4)), hours, phone, moves: ph.revise && r() < 0.22 ? 1 + Math.floor(r() * 4) : pi === 5 && r() < 0.05 ? 1 : 0, status: {} });
			cumulative.push([...now]);
		}
		at += ph.days;
	});

	// two things that came and went a block at a time
	const blockOn = (n: number, i: number, words: number) => {
		const k = days.findIndex((d) => num(d.day) >= n);
		if (k < 0) return;
		const amount = words < 0 ? -Math.min(-words, Math.max(0, cumulative[k][i] - 200)) : words;
		const v = days[k].notes[list[i].path] ?? (days[k].notes[list[i].path] = [0, 0, 0]);
		v[2] += amount;
		for (let j = k; j < cumulative.length; j++) cumulative[j][i] += amount;
	};
	blockOn(start + 470, Math.min(list.length - 1, Math.floor(list.length * 0.55)), Math.round(F * 0.026));
	blockOn(start + 700, Math.min(list.length - 1, Math.floor(list.length * 0.3)), -Math.round(F * 0.034));

	// statuses: a scene is a draft once it has words, revised in book order from the revision on, and the first
	// third done in the last months
	const st = (k: number): string => statuses[Math.min(statuses.length - 1, k)] ?? '';
	const reviseFrom = start + 410 + 30 + 95 + 124, n = list.length;
	const revisedOn = list.map((_, i) => reviseFrom + 20 + (i / n) * (end - reviseFrom) * 1.12), doneOn = list.map((_, i) => (i < n * 0.34 ? end - 150 + (i / (n * 0.34)) * 140 : Infinity));
	days.forEach((d, k) => {
		const dn = num(d.day);
		for (let i = 0; i < n; i++) {
			const w = cumulative[k][i];
			if (w <= 0) continue;
			const s = dn >= doneOn[i] ? st(3) : dn >= revisedOn[i] ? st(2) : st(1);
			d.status[s] = (d.status[s] ?? 0) + w;
		}
	});

	// the book as it is has the words the binder has
	const scale = F / Math.max(1, now.reduce((a, b) => a + b, 0));
	for (const d of days) { for (const v of Object.values(d.notes)) { v[0] = Math.round(v[0] * scale); v[1] = Math.round(v[1] * scale); v[2] = Math.round(v[2] * scale); } for (const h of Object.keys(d.hours)) d.hours[+h] = Math.round(d.hours[+h] * scale); for (const k of Object.keys(d.status)) d.status[k] = Math.round(d.status[k] * scale); d.phone = Math.round(d.phone * scale); }
	for (const c of cumulative) for (let i = 0; i < c.length; i++) c[i] *= scale;

	const marks: Mark[] = [
		{ day: dayStr(start + 410 + 30 + 95 - 3), kind: 'snapshot', what: 'First draft' },
		{ day: dayStr(start + 410 + 30 + 95 + 2), kind: 'export', what: 'Sent to Sam' },
		{ day: dayStr(reviseFrom + 118), kind: 'snapshot', what: 'After the cut' },
	];

	if (kind === 'estimated') {
		// a book that was here before Binders recorded anything: its past is a handful of dates, the record three days
		const keep = days.filter((d) => num(d.day) > end - 3), totalAt = (k: number): number => cumulative[k].reduce((a, b) => a + b, 0);
		const estimate: { day: string; total: number }[] = [{ day: dayStr(start), total: 0 }];
		let last = -1e9;
		days.forEach((d, k) => { const dn = num(d.day); if (dn <= end - 3 && dn - last > 26 + ((k * 7) % 40)) { estimate.push({ day: d.day, total: totalAt(k) }); last = dn; } });
		const k0 = days.length - keep.length - 1;
		estimate.push({ day: dayStr(end - 3), total: totalAt(k0) });
		return { days: keep, estimate, marks: marks.filter((m) => m.kind === 'snapshot'), statuses };
	}
	return { days, estimate: [], marks, statuses };
}
