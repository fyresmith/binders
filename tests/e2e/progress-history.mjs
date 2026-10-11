// A believable record of a binder's writing, as real `.binder-history` files: for the progress window's tests and
// pictures, which read it through the plugin's own reader. Deterministic: the same scenes and the same day give the
// same files. Nothing here is part of the plugin.
//
//   novel(scenes, today)      three years on two devices: a slow first year, a month of two thousand words a day, a
//                             first draft, four months away, a revision that cuts a sixth of the book, a second draft
//   lastDays(scenes, today, n) the last n days only, on a book that was already there (a record just begun)
//
// `scenes`: [{ rel, words }] in the binder's order, `rel` the note's path in the binder without ".md", `words` what it
// holds now: every scene's days add up to exactly that, so the last total stamped is the binder's own.
// Both return { files: { name: text }, statuses: { rel: status } } (the status each scene ends on).

export const DESK = 'aaaaaa', PHONE = 'bbbbbb';

function rng(seed) {
	let a = seed >>> 0;
	return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const num = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 864e5;
const dayStr = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
const weekday = (n) => new Date(n * 864e5).getUTCDay();
/** A moment of a record day, in local time (an hour before four is the night after). */
const at = (day, hour, minute = 0) => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + (hour < 4 ? 1 : 0), hour, minute).getTime();

/** The days as files: one for each device and year. `days`: [{ n, notes: { rel: [added, cut, in, out] }, hours, phone }]. */
function write(days, events, list, totals, statusOf, labels = { [DESK]: 'Writing desk', [PHONE]: 'Phone' }) {
	const files = {}, lines = {};
	const put = (device, year, line) => { (lines[`${year} ${labels[device]} ${device}`] ??= { device, year, days: [], events: [] })[line.t === 'day' ? 'days' : 'events'].push(line); };
	days.forEach((d, k) => {
		const day = dayStr(d.n), device = d.phone ? PHONE : DESK, hours = Object.keys(d.hours).map(Number), first = Math.min(...hours.map((h) => (h + 20) % 24));
		const start = Math.floor(at(day, (first + 4) % 24, 10) / 60000), typed = Object.values(d.notes).reduce((a, c) => a + c[0] + c[1], 0), m = Math.max(1, Math.round(typed / 22) + (d.slow ?? 0));
		const st = {};
		list.forEach((s, i) => { const w = Math.round(totals[k][i]); if (w > 0) { const name = statusOf(i, d.n); st[name] = (st[name] ?? 0) + w; } });
		const w = Object.values(st).reduce((a, b) => a + b, 0);
		const h = {};
		for (const [hour, words] of Object.entries(d.hours)) if (words > 0) h[hour] = words;
		put(device, +day.slice(0, 4), { t: 'day', d: day, u: at(day, 23, 30), k: d.phone ? 'phone' : 'desktop', n: d.notes, h, s: [[start, start + Math.round(m * 1.3) + 4]], m, tot: { at: at(day, 23, 30), w, n: totals[k].filter((x) => x > 0).length, st } });
	});
	for (const e of events) put(DESK, +e.d.slice(0, 4), { t: 'ev', at: at(e.d, 12), ...e });
	for (const [name, f] of Object.entries(lines)) files[`${name}.binder-history`] = [JSON.stringify({ 'binders-history': 1, device: f.device, label: labels[f.device], kind: f.device === PHONE ? 'phone' : 'desktop', year: f.year }), ...f.days.map((l) => JSON.stringify(l)), ...f.events.map((l) => JSON.stringify(l))].join('\n') + '\n';
	return files;
}

/** Makes each scene's days add up to exactly the words it holds: every number of a scene scaled by the same share,
    and what rounding leaves put on its last day. Returns the totals by scene at the end of each day. */
function settle(days, list, base = list.map(() => 0)) {
	const end = list.map(() => 0);
	for (const d of days) list.forEach((s, i) => { const c = d.notes[s.rel]; if (c) end[i] += c[0] - c[1] + c[2] - c[3]; });
	list.forEach((s, i) => {
		const want = s.words - base[i], f = end[i] > 0 ? want / end[i] : 1;
		let sum = 0, last = null;
		for (const d of days) { const c = d.notes[s.rel]; if (!c) continue; for (let k = 0; k < 4; k++) c[k] = Math.max(0, Math.round(c[k] * f)); sum += c[0] - c[1] + c[2] - c[3]; last = c; }
		if (last && sum !== want) { const diff = want - sum; if (diff > 0) last[0] += diff; else last[1] += -diff; }
		// (a scene is never below nothing, so a cut that came before its words counts for less: put right on its last day)
		let held = base[i];
		for (const d of days) { const c = d.notes[s.rel]; if (c) held = Math.max(0, held + c[0] - c[1] + c[2] - c[3]); }
		if (last && held !== s.words) { if (held > s.words) last[1] += held - s.words; else last[0] += s.words - held; }
	});
	const now = [...base], totals = [];
	for (const d of days) {
		list.forEach((s, i) => { const c = d.notes[s.rel]; if (c) now[i] = Math.max(0, now[i] + c[0] - c[1] + c[2] - c[3]); });
		// (the hours hold what was added, whatever the scaling did to it)
		const added = Object.values(d.notes).reduce((a, c) => a + c[0], 0), was = Object.values(d.hours).reduce((a, b) => a + b, 0) || 1, keys = Object.keys(d.hours);
		let left = added;
		keys.forEach((h, k) => { const v = k === keys.length - 1 ? left : Math.round((d.hours[h] / was) * added); d.hours[h] = v; left -= v; });
		for (const key of Object.keys(d.notes)) if (!d.notes[key].some((x) => x > 0)) delete d.notes[key];
		totals.push([...now]);
	}
	return totals;
}

const STATUSES = ['Idea', 'Draft', 'Revised', 'Done'];
const MORNING = [0, 0, 0, 0, 0, 2, 9, 10, 6, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 1], ALL_DAY = [1, 0, 0, 0, 0, 2, 7, 8, 5, 2, 1, 1, 5, 4, 1, 0, 0, 1, 2, 4, 7, 8, 6, 3], EVENING = [0, 0, 0, 0, 0, 0, 2, 3, 2, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 4, 7, 8, 5, 2];

export function novel(scenes, today, statuses = STATUSES) {
	const r = rng(20261010), end = num(today), list = scenes.filter((s) => s.words > 0);
	const F = list.reduce((a, s) => a + s.words, 0);
	const phases = [
		{ days: 410, net: 0.17, cutShare: 0.07, p: [0.2, 0.42], size: [90, 520], hours: MORNING },
		{ days: 30, net: 0.4, cutShare: 0.03, p: [0.97, 0.97], size: [1200, 2900], hours: ALL_DAY },
		{ days: 95, net: 0.2, cutShare: 0.06, p: [0.55, 0.6], size: [300, 1300], hours: MORNING },
		{ days: 124, net: 0, cutShare: 0, p: [0, 0], size: [0, 0], hours: MORNING },
		{ days: 118, net: -0.15, cutShare: 3.2, p: [0.5, 0.35], size: [150, 900], hours: EVENING, revise: true },
		{ days: 262, net: 0.2, cutShare: 0.22, p: [0.5, 0.35], size: [250, 1000], hours: MORNING },
		{ days: 80, net: 0.18, cutShare: 0.1, p: [0.8, 0.66], size: [250, 800], hours: MORNING },
	];
	const start = end - phases.reduce((a, p) => a + p.days, 0) + 1;
	const share = list.map((s) => s.words * (0.75 + r() * 0.7)), shareSum = share.reduce((a, b) => a + b, 0);
	const drafted = share.map((s) => (s / shareSum) * 0.77 * F), now = list.map(() => 0);
	const days = [], events = [];
	let from = start, pointer = 0, revisePointer = 0;
	const pick = (weights) => { let x = r() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return i; } return weights.length - 1; };
	phases.forEach((ph, pi) => {
		const plan = [], hole = pi === 0 ? 150 + Math.floor(r() * 60) : -1;
		for (let i = 0; i < ph.days; i++) {
			const n = from + i, we = weekday(n) === 0 || weekday(n) === 6;
			if (hole >= 0 && i >= hole && i < hole + 44) continue; // (a first winter away, in the slow year)
			if (r() < ph.p[we ? 1 : 0]) plan.push({ n, w: ph.size[0] + r() * r() * (ph.size[1] - ph.size[0]) * (we ? 1.3 : 1), c: r() });
		}
		const sumW = plan.reduce((a, d) => a + d.w, 0), sumC = plan.reduce((a, d) => a + d.c * d.w, 0);
		const added = ph.revise ? (Math.abs(ph.net) * F) / (ph.cutShare - 1) : (ph.net * F) / (1 - ph.cutShare), cut = added * ph.cutShare;
		for (const d of plan) {
			const a = Math.round((d.w / sumW) * added), c = Math.round(((d.c * d.w) / sumC) * cut), notes = {};
			const put = (i, add, take) => {
				take = Math.min(take, Math.max(0, now[i] + add));
				const v = (notes[list[i].rel] ??= [0, 0, 0, 0]);
				v[0] += add; v[1] += take;
				now[i] += add - take;
			};
			if (pi < 3) {
				let left = a;
				while (left > 0) {
					while (pointer < list.length - 1 && now[pointer] >= drafted[pointer]) pointer++;
					const i = r() < 0.12 ? Math.floor(r() * Math.min(list.length, pointer + 4)) : pointer;
					const n = Math.min(left, i === pointer ? Math.max(40, Math.ceil(drafted[i] - now[i])) : Math.ceil(left * 0.4));
					put(i, n, 0);
					left -= n;
				}
				put(pointer > 0 && r() < 0.5 ? pointer - 1 : pointer, 0, c);
			} else {
				const touched = 1 + Math.floor(r() * 2.4);
				for (let k = 0; k < touched; k++) put((revisePointer + k) % list.length, Math.round(a / touched), Math.round(c / touched));
				if (r() < (ph.revise ? 0.55 : 0.4)) revisePointer = (revisePointer + touched) % list.length;
			}
			const hours = {}, h1 = pick(ph.hours), total = Object.values(notes).reduce((s, v) => s + v[0], 0), split = total > 900 || r() < 0.25;
			hours[h1] = Math.round(total * (split ? 0.6 : 1));
			if (split) { const h2 = r() < 0.6 ? Math.min(23, h1 + 1) : pick(ph.hours); hours[h2] = (hours[h2] ?? 0) + total - Math.round(total * 0.6); }
			days.push({ n: d.n, notes, hours, phone: r() < 0.11 && total < 500, slow: ph.revise ? Math.round(25 + r() * 70) : 4 });
			if (ph.revise && r() < 0.22) for (let k = 1 + Math.floor(r() * 3); k > 0; k--) events.push({ d: dayStr(d.n), k: 'order', p: '' });
		}
		from += ph.days;
	});
	// two things that came and went a block at a time: an old chapter pasted in, a scene's worth taken out
	const block = (n, i, words) => { const d = days.find((x) => x.n >= n); if (d) { const v = (d.notes[list[i].rel] ??= [0, 0, 0, 0]); v[words > 0 ? 2 : 3] += Math.abs(words); } };
	block(start + 470, Math.min(list.length - 1, Math.floor(list.length * 0.55)), Math.round(F * 0.026));
	block(start + 700, Math.min(list.length - 1, Math.floor(list.length * 0.3)), -Math.round(F * 0.012));
	const totals = settle(days, list);

	// statuses: a draft once it has words, revised in book order from the revision on, the first third done lately
	const reviseFrom = start + 410 + 30 + 95 + 124, n = list.length;
	const revisedOn = list.map((_, i) => reviseFrom + 20 + (i / n) * (end - reviseFrom) * 1.12), doneOn = list.map((_, i) => (i < n * 0.34 ? end - 150 + (i / (n * 0.34)) * 140 : Infinity));
	const statusOf = (i, day) => statuses[day >= doneOn[i] ? 3 : day >= revisedOn[i] ? 2 : 1] ?? '';
	list.forEach((s, i) => { for (const [on, k] of [[revisedOn[i], 2], [doneOn[i], 3]]) if (on <= end) events.push({ d: dayStr(Math.floor(on)), k: 'status', p: s.rel, from: statuses[k - 1], to: statuses[k] }); });
	events.push({ d: dayStr(start + 410 + 30 + 95 - 3), k: 'snapshot', p: '', name: 'First draft' }, { d: dayStr(start + 410 + 30 + 95 + 2), k: 'export', name: 'Sent to Sam' }, { d: dayStr(reviseFrom + 118), k: 'snapshot', p: '', name: 'After the cut' });
	events.sort((a, b) => a.d.localeCompare(b.d));
	return { files: write(days, events, list, totals, statusOf), statuses: Object.fromEntries(list.map((s, i) => [s.rel, statusOf(i, end)])) };
}

/** A record just begun on a book that was already there: the last `n` days, some of them written on. `skip`: days
    (0 is today, 1 yesterday…) nothing was written on. */
export function lastDays(scenes, today, n, { skip = [], statuses = STATUSES } = {}) {
	const r = rng(77 + n), end = num(today), list = scenes.filter((s) => s.words > 0), days = [];
	const typed = list.map(() => 0);
	for (let k = n - 1; k >= 0; k--) {
		if (skip.includes(k)) continue;
		const notes = {}, i = Math.min(list.length - 1, Math.floor(((n - 1 - k) / Math.max(1, n)) * Math.min(list.length, 6))), hours = {};
		// (no more than a part of what the scene holds: the book was there before these days)
		const room = Math.max(4, Math.floor(list[i].words * 0.2)), add = Math.min(180 + Math.floor(r() * 520), room), cut = Math.min(Math.floor(r() * 60), Math.floor(add / 4));
		notes[list[i].rel] = [add, cut, 0, 0];
		typed[i] += add - cut;
		if (r() < 0.3 && list[i + 1]) { const more = Math.min(60 + Math.floor(r() * 140), Math.max(2, Math.floor(list[i + 1].words * 0.1))); notes[list[i + 1].rel] = [more, 0, 0, 0]; typed[i + 1] += more; }
		const total = Object.values(notes).reduce((a, c) => a + c[0], 0), h1 = [6, 7, 7, 8, 21][Math.floor(r() * 5)];
		hours[h1] = total;
		days.push({ n: end - k, notes, hours, phone: n > 5 && r() < 0.15, slow: 6 });
	}
	// (what each scene held before the record: what it holds now less what these days typed into it)
	const base = list.map((s, i) => Math.max(0, s.words - typed[i]));
	const totals = settle(days, list.map((s, i) => ({ ...s, words: base[i] + typed[i] })), base);
	return { files: write(days, [], list, totals, () => statuses[1] ?? ''), statuses: {} };
}

/** A book begun today: its one scene written from nothing, in one sitting. */
export function dayOne(scene, today, statuses = STATUSES) {
	const days = [{ n: num(today), notes: { [scene.rel]: [scene.words + 23, 23, 0, 0] }, hours: { 7: scene.words + 23 }, phone: false, slow: 6 }];
	return { files: write(days, [], [scene], settle(days, [scene]), () => statuses[1] ?? ''), statuses: {} };
}

// ---- in the page ----
const j = JSON.stringify, PL = 'app.plugins.plugins.binders';

/** The record's day it is now, where the tests run: before four in the morning it is still yesterday. */
export function recordToday(now = new Date()) {
	const d = new Date(now.getTime());
	if (d.getHours() < 4) d.setDate(d.getDate() - 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A binder's scenes as the record names them, with the words each holds as the totals count them. */
export const scenesOf = (p, folder) => p.ev(`(async () => {
	const pl = ${PL}, root = app.vault.getAbstractFileByPath(${j(folder)}), out = [];
	await pl.binders.settled;
	for (const f of pl.binders.scenes(root)) out.push({ rel: f.path.slice(root.path.length + 1).replace(/\\.md$/, ''), words: pl.progress.words(await app.vault.cachedRead(f)) });
	return out;
})()`);

/** Puts a record in a binder's History, in place of whatever was there, and has the plugin forget what it had read:
    this device is the desk the files name. */
export async function plant(p, folder, files) {
	await p.ev(`(async () => {
		const a = app.vault.adapter, dir = ${j(folder + '/Snapshots/History')}, pl = ${PL};
		pl.progress.forget();
		if (await a.exists(dir)) for (const f of (await a.list(dir)).files) await a.remove(f);
		else { if (!(await a.exists(${j(folder + '/Snapshots')}))) await a.mkdir(${j(folder + '/Snapshots')}); await a.mkdir(dir); }
		for (const [name, text] of Object.entries(${j(files)})) await a.write(dir + '/' + name, text);
		pl.progress.setDevice({ id: ${j(DESK)}, label: 'Writing desk', kind: 'desktop' });
		pl.progress.forget();
	})().then(() => 1)`);
}
