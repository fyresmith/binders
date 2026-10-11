import { Modal, Platform, TFolder, setIcon, type TFile } from 'obsidian';
import type BindersPlugin from '../main';
import { fixture, type FixtureKind } from '../progress/fixture';
import { count, dayStr, fmt, monthName, num, sayDay, type History, type Plan } from '../progress/model';
import { chapters, facts, hourSaid, hourShape, pace, parts, projected, rows as rowsOf, statusSeries, weekdayShape, type Fact, type Row } from '../progress/stats';
import { textFacts, type SceneText } from '../progress/text';
import { drawBars, drawCalendar, drawLife, drawStatus, drawStrip, table } from './progress-charts';
import { readProps } from './props';
import { watchSize } from './windows';
import { wordsIn } from './words';

/* Progress over time: a binder's writing life in one window. STAGE 2 OF THE DESIGN ROUND: two frames for the same
   charts, to choose between, over a made-up history (progress/fixture.ts). Nothing is recorded and nothing is
   written: a deadline set here lasts as long as the window.

   'page': one page that scrolls, the book's life first. 'window': Obsidian's two-pane dialog (File recovery, our
   Export), with the folders, the plan and today in its sidebar. */

export type ProgressLayout = 'page' | 'window';
export interface ProgressOptions {
	layout?: ProgressLayout;
	fixture?: FixtureKind;
	/** The day it is (YYYY-MM-DD), for pictures that don't change with the calendar. */
	today?: string;
	/** A plan to show as it opens: one the book is keeping to, one it is behind, one whose date has passed. */
	demo?: 'on' | 'behind' | 'passed' | null;
	scope?: string;
}

const RANGES: [string, number][] = [['All', 0], ['Year', 365], ['90 days', 90]];
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export class ProgressModal extends Modal {
	private layout: ProgressLayout;
	private today: string;
	private history: History | null = null;
	private texts: SceneText[] = [];
	private plan: Plan | null = null;
	private within: string;
	private range = 0;
	private editing = false;
	private body!: HTMLElement;
	private side: HTMLElement | null = null;
	private stop: (() => void) | null = null;
	private width = 0;
	private timer = 0;

	constructor(private plugin: BindersPlugin, private folder: TFolder, private o: ProgressOptions = {}) {
		super(plugin.app);
		this.layout = o.layout ?? 'page';
		const d = new Date();
		this.today = o.today ?? dayStr(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
		this.within = o.scope ?? '';
	}

	private get binderFolder(): TFolder { return this.plugin.binders.binderOf(this.folder)?.folder ?? this.folder; }
	private get scopeFolder(): TFolder {
		const f = this.within ? this.app.vault.getAbstractFileByPath(`${this.binderFolder.path}/${this.within}`) : null;
		return f instanceof TFolder ? f : this.binderFolder;
	}

	onOpen(): void {
		const { modalEl, contentEl } = this, page = this.layout === 'page';
		modalEl.addClass('binders-pot', page ? 'mod-page' : 'mod-sidebar-layout');
		this.setTitle(page ? this.binderFolder.name : 'Progress');
		if (page) this.body = contentEl.createDiv({ cls: 'binders-pot-body' });
		else {
			modalEl.addClass('binders-snapshots');
			// (a phone has one column: what the sidebar holds comes first, then the charts)
			this.side = contentEl.createDiv({ cls: Platform.isPhone ? 'binders-pot-side' : 'modal-sidebar mod-history binders-pot-side' });
			const pane = contentEl.createDiv({ cls: 'sync-history-content-container binders-snapshots-pane binders-pot-pane' });
			this.body = pane.createDiv({ cls: 'sync-history-content binders-pot-body' });
		}
		this.body.createDiv({ cls: 'pane-empty', text: 'Reading the binder…' });
		void this.load();
	}

	onClose(): void {
		this.stop?.();
		window.clearTimeout(this.timer);
		this.contentEl.empty();
	}

	/** Reads the binder's notes (their words, and their text for what it says of itself) and makes the history. */
	private async load(): Promise<void> {
		const { plugin } = this, root = this.binderFolder;
		const files: TFile[] = plugin.binders.scenes(root);
		const texts: SceneText[] = [];
		for (const f of files) {
			const text = await this.app.vault.cachedRead(f), body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
			texts.push({ name: f.path.slice(root.path.length + 1).replace(/\.md$/, ''), text: body, words: wordsIn(plugin, text) });
		}
		// (a book begun today has today's words: the fixture's, not the test binder's)
		this.texts = this.o.fixture === 'new' ? texts.slice(0, 1).map((t) => { const text = t.text.split(/\s+/).slice(0, 412).join(' '); return { ...t, text, words: 412 }; }) : texts;
		this.history = fixture(this.o.fixture ?? 'novel', texts.map((t) => ({ path: t.name, words: t.words })), this.today, plugin.settings.statuses);
		const note = plugin.binders.folderNote(root), target = note ? readProps(plugin, note).target : 0;
		const rs = rowsOf(this.history, this.today), total = rs[rs.length - 1]?.total ?? 0, t = num(this.today);
		if (this.o.demo) {
			// a plan begun sixty days ago: for 'on', its date is where the last sixty days' pace arrives
			const from = t - 60, was = rs.find((r) => r.n >= from)?.total ?? 0, goal = target > total ? target : Math.ceil((total * 1.1) / 5000) * 5000;
			const days = Math.round((60 * (goal - was)) / Math.max(1, total - was));
			const to = this.o.demo === 'on' ? from + Math.round(days * 0.97) : this.o.demo === 'behind' ? from + Math.round(60 + (days - 60) * 0.42) : t - 9;
			this.plan = { target: goal, deadline: dayStr(to), off: [], from: dayStr(from), fromTotal: was };
		}
		this.stop = watchSize(this.app, this.body, () => { if (Math.abs(this.body.clientWidth - this.width) > 2) this.draw(); });
		this.draw();
	}

	// ---- what is shown ----

	private rows(): Row[] { return this.history ? rowsOf(this.history, this.today, this.within) : []; }
	private scenesIn(): SceneText[] { return this.texts.filter((s) => !this.within || s.name.startsWith(this.within + '/')); }

	private draw(): void {
		const h = this.history;
		if (!h) return;
		const { body } = this, rs = this.rows(), t = num(this.today), page = this.layout === 'page';
		const keep = body.scrollTop;
		body.empty();
		this.width = body.clientWidth;
		const style = getComputedStyle(body), W = Math.max(240, Math.floor(this.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
		const narrow = W < 560;
		const plan = this.within ? null : this.plan, p = plan ? pace(rs, plan, this.today) : null;
		const total = rs[rs.length - 1]?.total ?? 0, young = rs.length < 14;
		if (this.side) this.drawSide(rs, p);

		// ---- the few numbers a writer acts on ----
		if (page) {
			const head = body.createDiv({ cls: 'binders-pot-head' });
			for (const f of this.now(rs, p)) this.figure(head, f[0], f[1], f[2]);
			const line = body.createDiv({ cls: 'binders-pot-planline' });
			if (this.within) line.createSpan({ text: `${this.within.split('/').pop() ?? ''}, in ${this.binderFolder.name}.` });
			else if (plan && p) { line.createSpan({ cls: `binders-pot-pace is-${p.state}`, text: p.said }); if (p.then) line.createSpan({ text: ' ' + p.then }); } else line.createSpan({ text: young && !h.estimate.length ? (rs.length <= 1 ? 'Recording began today. The days fill in here as you write.' : 'The days fill in here as you write.') : 'No deadline is set.' });
			if (!this.within) {
				const b = line.createEl('button', { cls: 'binders-pot-quiet', text: plan ? (p?.state === 'passed' ? 'Set a new date' : 'Change the plan') : 'Set a deadline' });
				b.addEventListener('click', () => { this.editing = !this.editing; this.draw(); });
			}
			this.scopePicker(line);
			if (this.editing && !this.within) this.planForm(body.createDiv({ cls: 'binders-pot-form' }), total);
		}

		// ---- the plan, close up: the days since it began and the days to its date ----
		if (plan && p && p.state !== 'passed' && p.state !== 'reached') {
			const s = this.section(body, 'The plan', `${fmt(plan.target)} words by ${sayDay(num(plan.deadline))}${plan.off.length ? `, ${this.offSaid(plan.off)} off` : ''}`);
			const chart = s.createDiv({ cls: 'binders-pot-chart' });
			drawLife(chart, { rows: rs, estimate: [], plan, projection: projected(rs, plan.target), chapters: [], marks: [], today: t, width: W, height: narrow ? 250 : 300, from: num(plan.from) - 3, floor: true });
			const proj = projected(rs, plan.target), foot = s.createDiv({ cls: 'binders-pot-key' });
			this.key(foot, 'is-line', 'The book');
			this.key(foot, 'is-plan', 'The plan');
			if (proj) this.key(foot, 'is-projection', `The last 30 days’ pace: there in ${proj.said}`);
		}

		// ---- the book's life ----
		{
			const first = h.estimate.length ? num(h.estimate[0].day) : rs[0]?.n ?? t;
			const s = this.section(body, this.within ? 'This folder’s life' : 'The book’s life', '');
			const readout = s.querySelector<HTMLElement>('.binders-pot-section-detail');
			const rest = young && !h.estimate.length ? (rs.length <= 1 ? 'Day one' : `${count(rs.length, 'day')} so far`) : `Since ${sayDay(first)}: ${count(t - first + 1, 'day')}`;
			readout?.setText(rest);
			if (!page && !young) {
				const seg = s.querySelector<HTMLElement>('.binders-pot-section-head')?.createDiv({ cls: 'binders-pot-ranges' });
				for (const [name, days] of RANGES) {
					const b = seg?.createEl('button', { cls: `text-icon-button binders-pot-range${this.range === days ? ' is-active' : ''}`, text: name, attr: { 'aria-pressed': String(this.range === days) } });
					b?.addEventListener('click', () => { this.range = days; this.draw(); });
				}
			}
			const chart = s.createDiv({ cls: 'binders-pot-chart' });
			const from = this.range ? t - this.range : 0;
			drawLife(chart, {
				rows: rs, estimate: this.within ? [] : h.estimate, plan, projection: plan ? projected(rs, plan.target) : null, chapters: chapters(rs), marks: this.within ? [] : h.marks, today: t, width: W, height: young && !h.estimate.length ? 230 : narrow ? 260 : 340, from,
				hover: (r) => readout?.setText(r ? `${sayDay(r.n, { weekday: !narrow, short: narrow })}: ${fmt(r.total)} words${r.added ? `, ${fmt(r.added)} written` : ''}${r.cut ? `, ${fmt(r.cut)} cut` : ''}${r.block ? `, ${fmt(Math.abs(r.block))} ${r.block > 0 ? 'brought in' : 'taken out'} at once` : ''}` : rest),
			});
			const key = s.createDiv({ cls: 'binders-pot-key' });
			if (!young) { this.key(key, 'is-bar', 'Written'); if (rs.some((r) => r.cut > 0)) this.key(key, 'is-cut', 'Cut'); if (rs.some((r) => r.block > 0)) this.key(key, 'is-block', 'Brought in at once'); if (chapters(rs).some((c) => c.kind === 'away')) this.key(key, 'is-away', 'Away'); }
			// the same numbers, a month to a row, for a screen reader
			const months = new Map<string, { total: number; added: number; cut: number }>();
			for (const r of rs) { const d = new Date(r.n * 864e5), k = `${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}`, m = months.get(k) ?? { total: 0, added: 0, cut: 0 }; m.total = r.total; m.added += r.added; m.cut += r.cut; months.set(k, m); }
			table(s, 'The binder’s words, month by month', ['Month', 'Words at its end', 'Written', 'Cut'], [...months].map(([k, m]) => [k, fmt(m.total), fmt(m.added), fmt(m.cut)]));
		}

		// ---- every day, and when in the day and the week ----
		if (!young) {
			const wrap = body.createDiv({ cls: 'binders-pot-columns' });
			const cal = this.section(wrap, 'Every day', `${fmt(rs.filter((r) => r.added || r.cut).length)} written on`);
			const hours = hourShape(h, this.within), wd = weekdayShape(rs);
			const calW = narrow ? W : Math.min(W - 300, 53 * 14 + 34);
			drawCalendar(cal.createDiv({ cls: 'binders-pot-chart' }), rs, calW);
			const ck = cal.createDiv({ cls: 'binders-pot-key' });
			const scale = ck.createSpan({ cls: 'binders-pot-scale' });
			scale.createSpan({ text: 'Less' });
			for (const c of ['is-1', 'is-2', 'is-3', 'is-4']) scale.createSpan({ cls: `binders-pot-swatch is-cell ${c}` });
			scale.createSpan({ text: 'More' });
			this.key(ck, 'is-cell is-cut', 'Ended with fewer words');
			const when = this.section(wrap, 'When', '');
			const sideW = narrow ? W : Math.max(220, W - calW - 48);
			const hourBox = when.createDiv({ cls: 'binders-pot-small' });
			hourBox.createDiv({ cls: 'binders-pot-small-said', text: hourSaid(hours) });
			drawBars(hourBox.createDiv({ cls: 'binders-pot-chart' }), hours, hours.map((_, i) => (i === 0 ? '12 am' : i === 6 ? '6' : i === 12 ? 'noon' : i === 18 ? '6' : null)), sideW, 78, 'Words written in each hour of the day');
			table(hourBox, 'Words written in each hour of the day', ['Hour', 'Words'], hours.map((v, i) => [`${i}:00`, fmt(v)]));
			const best = wd.indexOf(Math.max(...wd)), wdBox = when.createDiv({ cls: 'binders-pot-small' });
			const order = [1, 2, 3, 4, 5, 6, 0], names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
			wdBox.createDiv({ cls: 'binders-pot-small-said', text: `${names[best]}s most: ${fmt(wd[best])} words` });
			drawBars(wdBox.createDiv({ cls: 'binders-pot-chart' }), order.map((d) => wd[d]), order.map((d) => LETTERS[d]), sideW, 78, 'Words written on each day of the week');
			table(wdBox, 'Words written on each day of the week', ['Day', 'Words'], order.map((d) => [names[d], fmt(wd[d])]));
		}

		// ---- the parts, and the statuses ----
		const names = this.topItems();
		if (!young && names.length > 1) {
			const s = this.section(body, 'The parts', 'when each was written');
			const list = parts(h, rs, names, this.within).filter((x) => x.now > 0 || x.totals.some((v) => v > 0));
			const grid = s.createDiv({ cls: 'binders-pot-parts' });
			const stripW = Math.max(80, narrow ? W - 150 : W - 470);
			// a square a month (a week, in a book's first months): how much the part grew in it
			const per = rs.length > 200 ? 0 : 7, starts: number[] = [];
			rs.forEach((r, i) => { const d = new Date(r.n * 864e5); if (i === 0 || (per ? i % per === 0 : d.getUTCDate() === 1)) starts.push(i); });
			const months = list.map((x) => starts.map((a, k) => { const b = (starts[k + 1] ?? rs.length) - 1, before = a ? x.totals[a - 1] : 0; let moved = false; for (let i = a; i <= b && !moved; i++) moved = x.totals[i] !== (i ? x.totals[i - 1] : 0); return { net: x.totals[b] - before, moved }; }));
			const grown = months.flat().map((m) => m.net).filter((v) => v > 0).sort((a, b) => a - b), q = (f: number): number => grown[Math.min(grown.length - 1, Math.floor(grown.length * f))] ?? 0;
			const head = grid.createDiv({ cls: 'binders-pot-part is-axis' });
			head.createDiv();
			drawStrip(head.createDiv({ cls: 'binders-pot-chart' }), null, [], stripW, 14, starts.map((a) => rs[a].n));
			for (const [k, part] of list.slice(0, 14).entries()) {
				const row = grid.createDiv({ cls: 'binders-pot-part' });
				row.createDiv({ cls: 'binders-pot-part-name', text: part.name });
				drawStrip(row.createDiv({ cls: 'binders-pot-chart' }), months[k], [q(0.3), q(0.6), q(0.85)], stripW, 16, starts.map((a) => rs[a].n));
				row.createDiv({ cls: 'binders-pot-part-words', text: fmt(part.now) });
				if (!narrow) row.createDiv({ cls: 'binders-pot-part-note', text: part.grewMost ? `most of it in ${part.grewMost}` : '' });
			}
			if (list.length > 14) grid.createDiv({ cls: 'binders-pot-part-more', text: `and ${count(list.length - 14, 'other')}` });
			table(s, 'The parts', ['Part', 'Words', 'Grew most in'], list.map((x) => [x.name, fmt(x.now), x.grewMost]));
		}
		if (!young && !this.within) {
			const series = statusSeries(h, rs);
			if (series.length > 1) {
				const s = this.section(body, 'Through the statuses', 'the book’s words by the status of their scene');
				drawStatus(s.createDiv({ cls: 'binders-pot-chart' }), series, rs, W, narrow ? 120 : 150);
				const key = s.createDiv({ cls: 'binders-pot-key' });
				series.forEach((st, i) => this.key(key, `is-band is-${Math.min(4, i + 1)}-of-${Math.min(4, series.length)}`, `${st.status || 'No status'} ${fmt(st.totals[st.totals.length - 1])}`));
			}
		}

		// ---- records and oddities: each a name, a number and a line ----
		// (three days of record say nothing of a book three years old: its text does)
		const all: Fact[] = [...(young && h.estimate.length ? [] : facts(h, rs, this.within)), ...textFacts(this.scenesIn())];
		const groups = [...new Set(all.map((f) => f.group))];
		const s = this.section(body, young ? 'The book so far' : 'Records and oddities', '');
		const grid = s.createDiv({ cls: 'binders-pot-facts' });
		for (const g of groups) {
			const col = grid.createDiv({ cls: 'binders-pot-factgroup' });
			col.createDiv({ cls: 'binders-pot-factgroup-name', text: g });
			for (const f of all.filter((x) => x.group === g)) {
				const row = col.createDiv({ cls: 'binders-pot-fact' });
				row.createDiv({ cls: 'binders-pot-fact-label', text: f.label });
				row.createDiv({ cls: 'binders-pot-fact-value', text: f.value });
				if (f.note) row.createDiv({ cls: 'binders-pot-fact-note', text: f.note });
			}
		}
		if (h.estimate.length) body.createDiv({ cls: 'binders-pot-foot', text: `Binders has recorded this binder since ${sayDay(num(h.estimate[h.estimate.length - 1].day) + 1)}. What came before is worked out from its snapshots and from when each note was made and last changed, so the days and hours of that time aren’t known.${young ? ' The calendar, the hours of the day and each part’s story appear here once there are two weeks of writing to show.' : ''}` });
		else if (young) body.createDiv({ cls: 'binders-pot-foot', text: 'The calendar, the hours of the day and each part’s story appear here once there are two weeks of writing to show. The record is kept in this binder’s Snapshots folder, on your devices and nowhere else.' });
		body.scrollTop = keep;
	}

	/** The numbers at the head: [what, the number, a line under it]. */
	private now(rs: Row[], p: ReturnType<typeof pace> | null): [string, string, string][] {
		const t = num(this.today), last = rs[rs.length - 1], total = last?.total ?? 0, plan = this.within ? null : this.plan;
		const today = last && last.n === t ? last.added - last.cut : 0;
		const week = rs.filter((r) => r.n > t - 7), wrote = [...rs].reverse().find((r) => r.added || r.cut);
		const note = this.plugin.binders.folderNote(this.scopeFolder), target = plan?.target ?? (note ? readProps(this.plugin, note).target : 0);
		const out: [string, string, string][] = [];
		out.push(['Today', fmt(today), p && p.needed && p.state !== 'passed' ? `of ${fmt(p.needed)} for the plan` : today ? (today === 1 ? 'word' : 'words') : wrote ? `last written on ${sayDay(wrote.n, { weekday: t - wrote.n < 7, year: false })}` : 'words']);
		out.push(['Seven days', fmt(week.reduce((a, r) => a + r.added - r.cut, 0)), `${count(week.filter((r) => r.added || r.cut).length, 'day')} written on`]);
		out.push([this.within ? 'This folder' : 'The book', fmt(total), target ? `of ${fmt(target)}: ${Math.floor((total / target) * 100)}%` : `${count(this.scenesIn().filter((x) => x.words > 0).length, 'scene')}`]);
		if (plan && p) out.push(p.state === 'reached' || p.state === 'passed' ? [sayDay(num(plan.deadline), { year: false }), p.state === 'reached' ? 'Reached' : 'Passed', `${fmt(plan.target)} words`] : [sayDay(num(plan.deadline), { year: false }), `${fmt(p.needed)} a day`, `${count(p.daysLeft, 'writing day')} left`]);
		else if (rs.length >= 14) { const back = rs[Math.max(0, rs.length - 31)]; out.push(['Thirty days', fmt(total - back.total), `${fmt(Math.round((total - back.total) / 30))} a day`]); }
		return out;
	}

	private figure(parent: HTMLElement, label: string, value: string, note: string): void {
		const f = parent.createDiv({ cls: 'binders-pot-figure' });
		f.createDiv({ cls: 'binders-pot-figure-label', text: label });
		f.createDiv({ cls: 'binders-pot-figure-value', text: value });
		f.createDiv({ cls: 'binders-pot-figure-note', text: note });
	}

	private section(parent: HTMLElement, name: string, detail: string): HTMLElement {
		const s = parent.createDiv({ cls: 'binders-pot-section' });
		const head = s.createDiv({ cls: 'binders-pot-section-head' });
		head.createDiv({ cls: 'binders-pot-section-name', text: name });
		head.createDiv({ cls: 'binders-pot-section-detail', text: detail });
		return s;
	}

	private key(parent: HTMLElement, cls: string, text: string): void {
		const k = parent.createSpan({ cls: 'binders-pot-key-item' });
		k.createSpan({ cls: `binders-pot-swatch ${cls}` });
		k.createSpan({ text });
	}

	private offSaid(off: number[]): string {
		const s = [...off].sort().join(',');
		return s === '0,6' ? 'weekends' : off.map((d) => ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][d]).join(', ');
	}

	/** The folders at the top of what is shown, in the binder's order. */
	private topItems(): string[] {
		return (this.plugin.binders.orderedChildren(this.scopeFolder) ?? []).map((c) => (c instanceof TFolder ? c.name : c.name.replace(/\.md$/, '')));
	}

	/** The whole book or one of its folders: a dropdown, as Obsidian's settings have. */
	private scopePicker(parent: HTMLElement): void {
		const folders = (this.plugin.binders.orderedChildren(this.binderFolder) ?? []).filter((c): c is TFolder => c instanceof TFolder);
		if (!folders.length) return;
		const sel = parent.createEl('select', { cls: 'dropdown binders-pot-scope', attr: { 'aria-label': 'Show the whole binder or one folder' } });
		sel.createEl('option', { text: 'The whole binder', value: '' });
		for (const f of folders) sel.createEl('option', { text: f.name, value: f.name });
		sel.value = this.within;
		sel.addEventListener('change', () => { this.within = sel.value; this.draw(); });
	}

	/** The plan's three choices. Changes apply as they are made, as in Obsidian's settings. */
	private planForm(parent: HTMLElement, total: number): void {
		const t = num(this.today), plan = this.plan;
		const set = (patch: Partial<Plan>): void => {
			const base: Plan = this.plan ?? { target: Math.ceil((total * 1.1) / 5000) * 5000 || 50000, deadline: dayStr(t + 90), off: [], from: this.today, fromTotal: total };
			this.plan = { ...base, ...patch };
			window.clearTimeout(this.timer);
			this.timer = window.setTimeout(() => this.draw(), 350);
		};
		const field = (name: string): HTMLElement => { const f = parent.createDiv({ cls: 'binders-pot-field' }); f.createDiv({ cls: 'binders-pot-field-name', text: name }); return f; };
		const words = field('Words').createEl('input', { type: 'text', cls: 'binders-pot-input', attr: { inputmode: 'numeric', placeholder: 'Such as 80,000', 'aria-label': 'Word count target' } });
		words.value = plan ? fmt(plan.target) : '';
		words.addEventListener('change', () => { const n = parseInt(words.value.replace(/[^\d]/g, ''), 10); if (n > 0) set({ target: n }); });
		const by = field('By').createEl('input', { type: 'date', cls: 'binders-pot-input', attr: { 'aria-label': 'Deadline' } });
		by.value = plan?.deadline ?? '';
		by.addEventListener('change', () => { if (by.value) set({ deadline: by.value }); });
		const daysEl = field('Writing days').createDiv({ cls: 'binders-pot-weekdays', attr: { role: 'group', 'aria-label': 'Writing days' } });
		const full = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		for (const d of [1, 2, 3, 4, 5, 6, 0]) {
			const on = !(plan?.off ?? []).includes(d);
			const b = daysEl.createEl('button', { cls: `text-icon-button binders-pot-weekday${on ? ' is-active' : ''}`, text: LETTERS[d], attr: { 'aria-label': full[d], 'aria-pressed': String(on) } });
			b.addEventListener('click', () => { const off = new Set(this.plan?.off ?? []); if (off.has(d)) off.delete(d); else if (off.size < 6) off.add(d); set({ off: [...off] }); window.clearTimeout(this.timer); this.draw(); });
		}
		if (plan) {
			const clear = parent.createEl('button', { cls: 'binders-pot-quiet', text: 'Remove the deadline' });
			clear.addEventListener('click', () => { this.plan = null; this.editing = false; this.draw(); });
		}
	}

	/** The two-pane window's sidebar: what to look at, the plan, and how today stands. */
	private drawSide(rs: Row[], p: ReturnType<typeof pace> | null): void {
		const side = this.side;
		if (!side) return;
		const keep = document.activeElement && side.contains(document.activeElement);
		if (keep) return; // (a field being typed in is left alone; the next draw brings it up to date)
		side.empty();
		const total = this.history ? rowsOf(this.history, this.today).slice(-1)[0]?.total ?? 0 : 0;
		const tree = side.createDiv({ cls: 'binders-pot-tree' });
		const item = (name: string, scope: string, words: number, icon: string, depth: number): void => {
			const row = tree.createDiv({ cls: 'tree-item' }), self = row.createDiv({ cls: `tree-item-self is-clickable${this.within === scope ? ' is-active' : ''}${depth ? ' binders-pot-tree-child' : ''}`, attr: { role: 'button', tabindex: '0', 'aria-current': String(this.within === scope) } });
			setIcon(self.createDiv({ cls: 'tree-item-icon' }), icon);
			self.createDiv({ cls: 'tree-item-inner', text: name });
			self.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: fmt(words) });
			const go = (): void => { this.within = scope; this.draw(); };
			self.addEventListener('click', go);
			self.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
		};
		const wordsUnder = (scope: string): number => this.texts.filter((s) => !scope || s.name.startsWith(scope + '/')).reduce((a, s) => a + s.words, 0);
		item(this.binderFolder.name, '', total, 'lucide-book', 0);
		for (const c of this.plugin.binders.orderedChildren(this.binderFolder) ?? []) if (c instanceof TFolder) item(c.name, c.name, wordsUnder(c.name), 'lucide-folder', 1);

		if (!this.within) {
			side.createDiv({ cls: 'binders-pot-side-heading', text: 'Deadline' });
			this.planForm(side.createDiv({ cls: 'binders-pot-form is-side' }), total);
		}
		side.createDiv({ cls: 'binders-pot-side-heading', text: 'Now' });
		const list = side.createDiv({ cls: 'binders-pot-now' });
		for (const [label, value, note] of this.now(rs, p)) {
			const row = list.createDiv({ cls: 'binders-pot-now-row' });
			row.createDiv({ cls: 'binders-pot-now-label', text: label });
			row.createDiv({ cls: 'binders-pot-now-value', text: value });
			row.createDiv({ cls: 'binders-pot-now-note', text: note });
		}
		if (p) { const said = side.createDiv({ cls: 'binders-pot-side-said' }); said.createSpan({ cls: `binders-pot-pace is-${p.state}`, text: p.said }); if (p.then) said.createSpan({ text: ' ' + p.then }); }
	}
}

export const openProgress = (plugin: BindersPlugin, folder: TFolder, o: ProgressOptions = {}): void => { new ProgressModal(plugin, folder, o).open(); };
