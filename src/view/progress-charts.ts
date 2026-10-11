/* Progress over time: the charts, drawn by hand as SVG in Obsidian's own colors (through classes: styles.css has
   the block). No library, nothing fetched. Each chart is a picture to a screen reader, named by what it shows, with
   a table of the same numbers behind it (`table`). */

import { fmt, monthName, num, sayDay, weekday, type Mark, type Plan } from '../progress/model';
import { plannedAt, type Chapter, type Row } from '../progress/stats';

type Attrs = Record<string, string | number>;
const svg = <K extends keyof SVGElementTagNameMap>(parent: SVGElement | HTMLElement, tag: K, cls: string, attr: Attrs = {}): SVGElementTagNameMap[K] => {
	const strs: Record<string, string> = {};
	for (const [k, v] of Object.entries(attr)) strs[k] = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v;
	return parent.createSvg(tag, { cls: cls ? cls.split(' ').filter(Boolean) : undefined, attr: strs });
};
const label = (parent: SVGElement, cls: string, x: number, y: number, text: string, anchor: 'start' | 'middle' | 'end' = 'start'): SVGTextElement => {
	const t = svg(parent, 'text', `binders-chart-text ${cls}`, { x, y, 'text-anchor': anchor });
	t.textContent = text;
	return t;
};

/** A table of what a chart shows, out of sight, for a screen reader. */
export function table(parent: HTMLElement, caption: string, head: string[], body: string[][]): void {
	const t = parent.createEl('table', { cls: 'binders-pot-table' });
	t.createEl('caption', { text: caption });
	const tr = t.createEl('thead').createEl('tr');
	for (const h of head) tr.createEl('th', { text: h, attr: { scope: 'col' } });
	const tb = t.createEl('tbody');
	for (const row of body) { const r = tb.createEl('tr'); row.forEach((c, i) => r.createEl(i ? 'td' : 'th', { text: c, attr: i ? {} : { scope: 'row' } })); }
}

/** A round number at or above `n`, for the top of an axis, and the lines under it. */
function axis(n: number): { top: number; ticks: number[] } {
	if (n <= 0) return { top: 100, ticks: [50, 100] };
	const mag = Math.pow(10, Math.floor(Math.log10(n))) / 10, steps = [1, 2, 2.5, 5, 10, 20, 25, 50];
	const step = (steps.find((s) => (n / (s * mag)) <= 5) ?? 100) * mag;
	const top = Math.ceil(n / step) * step, ticks: number[] = [];
	for (let t = step; t <= top + 1e-6; t += step) ticks.push(t);
	return { top, ticks };
}

export interface LifeOptions {
	rows: Row[];
	estimate: { day: string; total: number }[];
	plan: Plan | null;
	projection: { n: number } | null;
	chapters: Chapter[];
	marks: Mark[];
	today: number;
	width: number;
	height: number;
	/** The first day shown (a range chosen), or 0 for all of it. */
	from: number;
	/** Told the day under the pointer, or null when it leaves. */
	hover?: (row: Row | null) => void;
	/** The axis starts just under the lowest number shown, not at nothing: for a close look at a plan. */
	floor?: boolean;
}

/** The book's life: its words over time as a line, the plan to a deadline and the pace beyond today, what happened
    said where it happened, and under it, on the same days, what was written and what was cut. */
export function drawLife(el: HTMLElement, o: LifeOptions): void {
	el.empty();
	const { width: W, height: H, today } = o;
	const narrow = W < 520;
	const est = o.estimate.map((e) => ({ n: num(e.day), total: e.total }));
	const all = o.rows, first = all[0]?.n ?? today;
	const rows = o.from ? all.filter((r) => r.n >= o.from) : all;
	const plan = o.plan && num(o.plan.deadline) >= (o.from || 0) ? o.plan : null;
	let x0 = o.from || (est.length ? est[0].n : first), x1 = Math.max(today, plan ? num(plan.deadline) : today);
	if (x1 - x0 < 13) x0 = x1 - 13; // (a book a day old is a week or two of axis, not one point)
	const BAR = narrow ? 44 : 60, DOWN = narrow ? 14 : 20, FOOT = 20, TOP = 18, padL = 0, padR = plan ? 4 : 10;
	const plotH = H - BAR - DOWN - FOOT - TOP - 14, base = TOP + plotH, barBase = base + 14 + BAR;
	const maxTotal = Math.max(1, ...rows.map((r) => r.total), ...est.map((e) => e.total), plan ? plan.target : 0);
	let lo = 0, { top, ticks } = axis(maxTotal * 1.04);
	if (o.floor) {
		const min = Math.min(...rows.map((r) => r.total), plan ? plan.fromTotal : Infinity), a = axis((maxTotal - min) * 1.15), step = a.ticks[0];
		lo = Math.max(0, Math.floor((min - step * 0.25) / step) * step);
		top = maxTotal + (maxTotal - lo) * 0.1;
		ticks = [];
		for (let t = lo + step; t < maxTotal - step * 0.3; t += step) ticks.push(t);
	}
	const x = (n: number): number => padL + ((n - x0) / Math.max(1, x1 - x0)) * (W - padL - padR - (x1 - x0 < 40 ? 6 : 0));
	const y = (v: number): number => base - ((Math.max(lo, v) - lo) / (top - lo)) * plotH;
	const root = svg(el, 'svg', 'binders-chart binders-chart-life', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'The binder’s words over time, with the words written and cut each day under it' });

	// times away: a band behind everything
	const aways = o.chapters.filter((c) => c.kind === 'away' && c.to > x0);
	for (const c of aways) svg(root, 'rect', 'binders-chart-away', { x: x(Math.max(x0, c.from)), y: TOP, width: Math.max(1, x(c.to) - x(Math.max(x0, c.from))), height: barBase + DOWN - TOP });

	// the lines across, each with its number over its left end
	for (const t of ticks) {
		svg(root, 'line', 'binders-chart-rule', { x1: 0, x2: W, y1: y(t), y2: y(t) });
		label(root, 'is-faint', 0, y(t) - 4, fmt(t));
	}
	svg(root, 'line', 'binders-chart-base', { x1: 0, x2: W, y1: base, y2: base });

	// the years (or, in a short stretch, the months) along the foot
	const span = x1 - x0, d0 = new Date(x0 * 864e5);
	if (span > 500) {
		for (let yr = d0.getUTCFullYear() + 1; ; yr++) {
			const n = Date.UTC(yr, 0, 1) / 864e5;
			if (n > x1) break;
			svg(root, 'line', 'binders-chart-rule is-year', { x1: x(n), x2: x(n), y1: TOP, y2: barBase + DOWN });
			label(root, 'is-faint', x(n) + 5, H - 5, String(yr));
		}
		if (x(Date.UTC(d0.getUTCFullYear() + 1, 0, 1) / 864e5) > 44) label(root, 'is-faint', 0, H - 5, String(d0.getUTCFullYear()));
	} else if (span > 40) {
		const every = span > 240 && narrow ? 2 : 1;
		for (let m = d0.getUTCMonth() + 1, yr = d0.getUTCFullYear(), k = 0; ; m++, k++) {
			const n = Date.UTC(yr, m, 1) / 864e5;
			if (n > x1) break;
			const d = new Date(n * 864e5);
			svg(root, 'line', 'binders-chart-rule is-year', { x1: x(n), x2: x(n), y1: d.getUTCMonth() === 0 ? TOP : barBase + DOWN - 4, y2: barBase + DOWN });
			if (k % every === 0 && x(n) < W - 24) label(root, 'is-faint', x(n) + 4, H - 5, d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : monthName(d.getUTCMonth(), true));
		}
	} else {
		label(root, 'is-faint', 0, H - 5, sayDay(x0, { year: false, short: true }));
		for (let n = x0 + 5; n <= x1 - 3; n++) if (weekday(n) === 1) label(root, 'is-faint', x(n), H - 5, sayDay(n, { year: false, short: true }), 'middle');
		label(root, 'is-faint', x(today), H - 5, 'Today', today === x1 ? 'end' : 'middle');
	}

	// the plan: where it began to the date, and the number it is for
	if (plan) {
		const to = num(plan.deadline), from = Math.max(num(plan.from), x0);
		svg(root, 'line', 'binders-chart-rule is-target', { x1: x(Math.max(x0, num(plan.from))), x2: W, y1: y(plan.target), y2: y(plan.target) });
		label(root, 'is-muted', W - padR, y(plan.target) - 5, `${fmt(plan.target)} by ${sayDay(to, { short: true, year: false })}`, 'end');
		let d = `M${x(from)},${y(plannedAt(plan, from))}`;
		for (let n = from + 1; n <= to; n += Math.max(1, Math.round((to - from) / 60))) d += `L${x(n)},${y(plannedAt(plan, n))}`;
		d += `L${x(to)},${y(plan.target)}`;
		svg(root, 'path', 'binders-chart-plan', { d });
		svg(root, 'line', 'binders-chart-base', { x1: x(to), x2: x(to), y1: y(plan.target) - 4, y2: y(plan.target) + 4 });
	}

	// what the book was before the record began: a broken line through the dates that are known
	if (est.length && est[est.length - 1].n >= x0) {
		const pts = est.filter((e) => e.n >= x0);
		svg(root, 'path', 'binders-chart-estimate', { d: pts.map((e, i) => `${i ? 'L' : 'M'}${x(e.n)},${y(e.total)}`).join('') });
		for (const e of pts.slice(1, -1)) svg(root, 'circle', 'binders-chart-estimate-dot', { cx: x(e.n), cy: y(e.total), r: 2 });
		const at = est[est.length - 1];
		svg(root, 'line', 'binders-chart-rule is-from', { x1: x(at.n), x2: x(at.n), y1: TOP, y2: barBase + DOWN });
		label(root, 'is-muted', x(at.n) - 6, base - 22, `Recorded from ${sayDay(at.n + 1, { short: true, year: false })}`, 'end');
		label(root, 'is-faint', x(at.n) - 6, base - 8, 'Before that, from snapshots and the notes’ dates', 'end');
	}

	// the book itself
	if (rows.length) {
		const start = est.length && est[est.length - 1].n >= x0 ? est[est.length - 1] : null;
		const pts: [number, number][] = [];
		if (start) pts.push([x(start.n), y(start.total)]);
		else if (rows[0].n > x0 || !o.from) pts.push([x(rows[0].n - (o.from ? 0 : 1)), y(o.from ? rows[0].total : 0)]);
		for (const r of rows) pts.push([x(r.n), y(r.total)]);
		const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
		if (!o.floor) svg(root, 'path', 'binders-chart-area', { d: `${line}L${pts[pts.length - 1][0].toFixed(1)},${base}L${pts[0][0].toFixed(1)},${base}Z` });
		svg(root, 'path', 'binders-chart-line', { d: line });
		const last = rows[rows.length - 1];
		if (o.projection && plan && last.total < plan.target) {
			const to = Math.min(o.projection.n, x1), t = last.total + ((plan.target - last.total) * (to - last.n)) / Math.max(1, o.projection.n - last.n);
			svg(root, 'line', 'binders-chart-projection', { x1: x(last.n), y1: y(last.total), x2: x(to), y2: y(t) });
		}
		svg(root, 'circle', 'binders-chart-now', { cx: x(last.n), cy: y(last.total), r: 3.5 });
	}

	// what was written (up) and cut (down) on the same days, in as many days to a bar as leaves each bar two pixels
	const fit = Math.max(1, Math.ceil((span + 1) / ((W - padL - padR) / 3))), per = [1, 2, 3, 7, 14, 30, 60, 90].find((k) => k >= fit) ?? fit;
	const bins: { n: number; up: number; down: number; inn: number }[] = [];
	for (const r of rows) {
		const k = Math.floor((r.n - x0) / per);
		const b = bins[k] ?? (bins[k] = { n: x0 + k * per, up: 0, down: 0, inn: 0 });
		b.up += r.added; b.down += r.cut + Math.max(0, -r.block); b.inn += Math.max(0, r.block);
	}
	const maxUp = Math.max(1, ...bins.filter(Boolean).map((b) => b.up + b.inn)), bw = Math.min(7, Math.max(1.5, x(x0 + per) - x(x0) - 1));
	svg(root, 'line', 'binders-chart-base', { x1: 0, x2: W, y1: barBase, y2: barBase });
	for (const b of bins) {
		if (!b) continue;
		const up = (b.up / maxUp) * BAR, inn = (b.inn / maxUp) * BAR, down = Math.min(DOWN, (b.down / maxUp) * BAR), bx = x(b.n) - (per === 1 ? bw / 2 : 0);
		if (up > 0.4) svg(root, 'rect', 'binders-chart-bar', { x: bx, y: barBase - up, width: bw, height: up });
		if (inn > 0.4) svg(root, 'rect', 'binders-chart-bar is-block', { x: bx, y: barBase - up - inn, width: bw, height: inn });
		if (down > 0.4) svg(root, 'rect', 'binders-chart-bar is-cut', { x: bx, y: barBase + 1, width: bw, height: down });
	}
	label(root, 'is-faint', 0, barBase - BAR + 2, `Written each ${per === 1 ? 'day' : per === 7 ? 'week' : per === 14 ? 'two weeks' : per === 30 ? 'thirty days' : per + ' days'}`);

	// what happened, said where it happened; a label that would sit on another is left out (the first given wins)
	const taken: [number, number, number, number][] = [];
	const say = (cls: string, cx: number, cy: number, text: string, anchor: 'start' | 'middle' | 'end'): boolean => {
		const w = text.length * 6.2 + 8, l = anchor === 'start' ? cx : anchor === 'middle' ? cx - w / 2 : cx - w, box: [number, number, number, number] = [l, cy - 12, l + w, cy + 4];
		if (box[0] < 0 || box[2] > W || box[1] < 0) return false;
		if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) return false;
		taken.push(box);
		label(root, cls, cx, cy, text, anchor);
		return true;
	};
	const totalAt = (n: number): number => {
		if (est.length && n <= est[est.length - 1].n) { const k = est.findIndex((e) => e.n >= n), b = est[Math.max(0, k)], a = est[Math.max(0, k - 1)]; return b.n === a.n ? b.total : a.total + ((b.total - a.total) * (n - a.n)) / (b.n - a.n); }
		const r = rows.find((q) => q.n >= n) ?? rows[rows.length - 1];
		return r ? r.total : 0;
	};
	if (!narrow || rows.length > 60) {
		for (const c of [...o.chapters].sort((a, b) => (a.kind === 'away' ? 0 : 1) - (b.kind === 'away' ? 0 : 1))) {
			if (c.to < x0) continue;
			const mid = (Math.max(c.from, x0) + c.to) / 2;
			if (c.kind === 'burst') { if (!say('is-said', x(c.from) - 8, y(totalAt(mid)) + 4, c.said, 'end')) say('is-said', x(c.to) + 8, y(totalAt(mid)) + 4, c.said, 'start'); }
			else if (c.kind === 'cut') { if (!say('is-said', x(c.to), y(totalAt(c.to)) + 18, c.said, 'middle')) say('is-said', x(c.to) + 8, y(totalAt(c.to)) + 18, c.said, 'start'); }
			else if (x(c.to) - x(Math.max(x0, c.from)) > c.said.length * 6.2 + 8) say('is-said is-away', x(mid), y(totalAt(mid)) - 10, c.said, 'middle');
		}
		// the writer's own words: a snapshot they named, a draft they sent
		for (const m of o.marks) {
			const n = num(m.day);
			if (n < x0 || n > today) continue;
			const py = y(totalAt(n)), up = 30;
			for (const [dy, anchor] of [[up, 'end'], [up + 16, 'end'], [up, 'start'], [up + 32, 'end']] as const) {
				if (!say('is-mark', x(n) + (anchor === 'end' ? 3 : -3), py - dy - 4, m.what, anchor)) continue;
				svg(root, 'line', 'binders-chart-leader', { x1: x(n), x2: x(n), y1: py - 5, y2: py - dy });
				svg(root, 'circle', 'binders-chart-mark', { cx: x(n), cy: py, r: 2.5 });
				break;
			}
		}
	}

	// the day under the pointer
	if (o.hover && rows.length) {
		const hair = svg(root, 'line', 'binders-chart-hair', { x1: 0, x2: 0, y1: TOP, y2: barBase + DOWN });
		const dot = svg(root, 'circle', 'binders-chart-now is-hover', { cx: 0, cy: 0, r: 3 });
		const shown = (on: boolean): void => { hair.toggleClass('is-hidden', !on); dot.toggleClass('is-hidden', !on); };
		shown(false);
		const hit = svg(root, 'rect', 'binders-chart-hit', { x: 0, y: 0, width: W, height: H });
		const move = (ev: MouseEvent): void => {
			const box = root.getBoundingClientRect(), n = Math.round(x0 + ((ev.clientX - box.left - padL) / Math.max(1, box.width - padL - padR)) * (x1 - x0));
			const r = rows.find((q) => q.n === Math.min(Math.max(n, rows[0].n), rows[rows.length - 1].n));
			if (!r) return;
			hair.setAttrs({ x1: x(r.n), x2: x(r.n) }); dot.setAttrs({ cx: x(r.n), cy: y(r.total) });
			shown(true);
			o.hover?.(r);
		};
		hit.addEventListener('mousemove', move);
		hit.addEventListener('mouseleave', () => { shown(false); o.hover?.(null); });
	}
}

/** Every day of the book's life as a square, a year to a block, a week to a column: darker for more written, an
    outline for a day that ended with fewer words than it began. */
export function drawCalendar(el: HTMLElement, rows: Row[], width: number): void {
	el.empty();
	if (!rows.length) return;
	const LEFT = 34, gap = width < 520 ? 1 : 2, cell = Math.max(4, Math.min(12, Math.floor((width - LEFT) / 53) - gap)), step = cell + gap;
	const nets = rows.map((r) => r.added - r.cut).filter((v) => v > 0).sort((a, b) => a - b);
	const q = (p: number): number => nets[Math.min(nets.length - 1, Math.floor(nets.length * p))] ?? 0;
	const cuts = [q(0.3), q(0.6), q(0.85)];
	const byDay = new Map(rows.map((r) => [r.n, r]));
	const y0 = new Date(rows[0].n * 864e5).getUTCFullYear(), y1 = new Date(rows[rows.length - 1].n * 864e5).getUTCFullYear();
	const yearH = 7 * step + 22, H = (y1 - y0 + 1) * yearH;
	const root = svg(el, 'svg', 'binders-chart binders-chart-calendar', { width: LEFT + 53 * step, height: H, viewBox: `0 0 ${LEFT + 53 * step} ${H}`, role: 'img', 'aria-label': 'Every day of the binder’s life: the more written on a day, the darker its square' });
	for (let yr = y0; yr <= y1; yr++) {
		const top = (yr - y0) * yearH + 14, jan1 = Date.UTC(yr, 0, 1) / 864e5, lead = weekday(jan1), days = (Date.UTC(yr + 1, 0, 1) - Date.UTC(yr, 0, 1)) / 864e5;
		label(root, 'is-muted', 0, top + 9, String(yr));
		for (let m = 0; m < 12; m++) {
			const n = Date.UTC(yr, m, 1) / 864e5, col = Math.floor((n - jan1 + lead) / 7);
			label(root, 'is-faint is-small', LEFT + col * step, top - 4, cell < 7 ? monthName(m)[0] : monthName(m, true));
		}
		for (let i = 0; i < days; i++) {
			const n = jan1 + i, r = byDay.get(n);
			if (!r) continue;
			const net = r.added - r.cut, col = Math.floor((i + lead) / 7), row = (i + lead) % 7;
			const cls = !(r.added || r.cut) ? 'is-none' : net <= 0 ? 'is-cut' : net >= cuts[2] ? 'is-4' : net >= cuts[1] ? 'is-3' : net >= cuts[0] ? 'is-2' : 'is-1';
			const inset = cls === 'is-cut' ? 0.5 : 0;
			const c = svg(root, 'rect', `binders-chart-cell ${cls}`, { x: LEFT + col * step + inset, y: top + row * step + inset, width: cell - inset * 2, height: cell - inset * 2, rx: cell > 7 ? 2 : 1 });
			if (r.added || r.cut) svg(c, 'title', '').textContent = `${sayDay(n, { weekday: true })}: ${fmt(r.added)} written${r.cut ? `, ${fmt(r.cut)} cut` : ''}`;
		}
	}
}

/** A few bars with a name under some of them: the hours of the day, the days of the week. The tallest is in ink. */
export function drawBars(el: HTMLElement, values: number[], names: (string | null)[], width: number, height: number, what: string): void {
	el.empty();
	const max = Math.max(1, ...values), step = width / values.length, bw = Math.max(2, Math.min(28, step - (step > 12 ? 4 : 2))), base = height - 16;
	const root = svg(el, 'svg', 'binders-chart binders-chart-bars', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': what });
	svg(root, 'line', 'binders-chart-base', { x1: 0, x2: width, y1: base, y2: base });
	values.forEach((v, i) => {
		const h = (v / max) * (base - 4), cx = i * step + step / 2;
		if (h > 0.4) svg(root, 'rect', `binders-chart-bar${v === max ? '' : ' is-rest'}`, { x: cx - bw / 2, y: base - h, width: bw, height: h });
		const name = names[i];
		if (name) label(root, 'is-faint is-small', cx, height - 3, name, 'middle');
	});
}

/** One part's life as a row of squares, a month (or a week) each: darker the more it grew, an outline where it
    shrank, as the calendar says it. With no cells, the years over the rows. `starts`: the day each square begins. */
export function drawStrip(el: HTMLElement, cells: { net: number; moved: boolean }[] | null, cuts: number[], width: number, height: number, starts: number[]): void {
	el.empty();
	const n = starts.length, step = width / Math.max(1, n), gap = step > 6 ? 2 : 1, w = Math.max(1, step - gap);
	const root = svg(el, 'svg', 'binders-chart binders-chart-strip', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
	if (!cells) {
		let last = -100;
		starts.forEach((s, i) => { const d = new Date(s * 864e5); if ((i === 0 || d.getUTCMonth() === 0) && i * step - last > 34) { label(root, 'is-faint is-small', i * step, height - 3, i === 0 && d.getUTCMonth() !== 0 && n < 14 ? monthName(d.getUTCMonth(), true) : String(d.getUTCFullYear())); last = i * step; } });
		return;
	}
	cells.forEach((c, i) => {
		const cls = !c.moved ? 'is-none' : c.net <= 0 ? 'is-cut' : c.net >= cuts[2] ? 'is-4' : c.net >= cuts[1] ? 'is-3' : c.net >= cuts[0] ? 'is-2' : 'is-1', inset = cls === 'is-cut' ? 0.5 : 0;
		svg(root, 'rect', `binders-chart-cell ${cls}`, { x: i * step + inset, y: inset, width: w - inset * 2, height: height - inset * 2, rx: w > 7 ? 2 : 1 });
	});
}

/** One part's words over time, small, on the same days as the others and to the same scale. */
export function drawSpark(el: HTMLElement, totals: number[], max: number, width: number, height: number): void {
	el.empty();
	const root = svg(el, 'svg', 'binders-chart binders-chart-spark', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
	const n = totals.length, step = Math.max(1, Math.floor(n / width));
	const x = (i: number): number => (i / Math.max(1, n - 1)) * width, y = (v: number): number => height - 1 - (v / Math.max(1, max)) * (height - 3);
	let d = '';
	for (let i = 0; i < n; i += step) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(totals[i]).toFixed(1)}`;
	d += `L${width},${y(totals[n - 1]).toFixed(1)}`;
	svg(root, 'path', 'binders-chart-area', { d: `${d}L${width},${height - 1}L0,${height - 1}Z` });
	svg(root, 'path', 'binders-chart-line is-thin', { d });
	svg(root, 'line', 'binders-chart-base', { x1: 0, x2: width, y1: height - 0.5, y2: height - 0.5 });
}

/** The book's words by status over time, one band a status, the furthest along darkest and at the foot. */
export function drawStatus(el: HTMLElement, series: { status: string; totals: number[] }[], rows: Row[], width: number, height: number): void {
	el.empty();
	const n = rows.length;
	if (!n || !series.length) return;
	const tops = new Array<number>(n).fill(0), FOOT = 18, plotH = height - FOOT - 4;
	const max = Math.max(1, ...rows.map((_, i) => series.reduce((a, s) => a + s.totals[i], 0)));
	const root = svg(el, 'svg', 'binders-chart binders-chart-status', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'The binder’s words by status over time' });
	const step = Math.max(1, Math.floor(n / width)), x = (i: number): number => (i / Math.max(1, n - 1)) * width, y = (v: number): number => 4 + plotH - (v / max) * plotH;
	// from the last status up, so "Done" is the ground the rest stand on
	[...series].reverse().forEach((s, k) => {
		let up = '', down = '';
		for (let i = 0; i < n; i += step) { const lo = tops[i], hi = lo + s.totals[i]; up += `${up ? 'L' : 'M'}${x(i).toFixed(1)},${y(hi).toFixed(1)}`; down = `L${x(i).toFixed(1)},${y(lo).toFixed(1)}` + down; }
		for (let i = 0; i < n; i++) tops[i] += s.totals[i];
		svg(root, 'path', `binders-chart-band is-${Math.min(4, series.length - k)}-of-${Math.min(4, series.length)}`, { d: up + down + 'Z' });
	});
	svg(root, 'line', 'binders-chart-base', { x1: 0, x2: width, y1: 4 + plotH, y2: 4 + plotH });
	const d0 = new Date(rows[0].n * 864e5);
	for (let yr = d0.getUTCFullYear() + 1; ; yr++) {
		const k = rows.findIndex((r) => r.n === Date.UTC(yr, 0, 1) / 864e5);
		if (k < 0) break;
		svg(root, 'line', 'binders-chart-rule is-year', { x1: x(k), x2: x(k), y1: 4, y2: height - 4 });
		label(root, 'is-faint', x(k) + 5, height - 4, String(yr));
	}
}
