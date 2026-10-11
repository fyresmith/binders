import { ButtonComponent, Component, Modal, TFile, TFolder } from 'obsidian';
import type BindersPlugin from '../main';
import { recordDay } from '../progress/day';
import { toHistory, type Merged } from '../progress/merge';
import { count, fmt, monthName, num, sayDay, type History } from '../progress/model';
import { BinderRecord } from '../progress/record';
import { FIRST_DAYS, alike, baseOf, chapters, facts, hourSaid, hourShape, parts, rows as rowsOf, stage, statusSeries, weekdayShape, type Fact, type Row } from '../progress/stats';
import { textFacts, type SceneText } from '../progress/text';
import { buttonRow } from './modals';
import { drawBars, drawCalendar, drawFirstDays, drawLife, drawStatus, drawStrip, table } from './progress-charts';
import { readProps } from './props';
import { watchSize } from './windows';
import { WordCounter } from './word-counter';

/* Progress: a binder's writing life in one page that scrolls, read from the record (progress/record.ts). It only
   reads: opening it writes nothing, to a note or to the record.

   What shows depends on how much there is to say. A record under two weeks old shows its first days as they fill;
   after that the calendar, the hours, the parts and the statuses appear, each when it has something to say, and a
   part with nothing to show is left out, not shown empty. A binder with no record at all is one of Obsidian's small
   dialogs, with the reason. The design round is in docs/dev/design.md. */

export interface ProgressOptions {
	/** The day it is (YYYY-MM-DD), for pictures and tests that don't change with the calendar. */
	today?: string;
	/** The folder to show, as a path in the binder ('' for the binder). */
	scope?: string;
}

/** The command's icon and the menu item's. */
export const PROGRESS_ICON = 'lucide-line-chart';

const RANGES: [string, string, number][] = [['all', 'All', 0], ['year', 'Year', 365], ['90', '90 days', 90]];
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** How many parts are listed before "Show all". */
const PARTS_SHOWN = 16;

export class ProgressModal extends Modal {
	private fixedDay: string | null;
	private history: History | null = null;
	/** Why there is nothing to add to (recording is off, the binder can't be changed), said over a record that is shown. */
	private stopped = '';
	private texts: SceneText[] | null = null;
	private within: string;
	private range = 0;
	private allParts = false;
	private body: HTMLElement | null = null;
	private stop: (() => void) | null = null;
	private width = 0;
	private timer = 0;
	private life = new Component();
	private counter: WordCounter;
	private reading = 0;
	private open_ = false;

	constructor(private plugin: BindersPlugin, private folder: TFolder, o: ProgressOptions = {}) {
		super(plugin.app);
		this.fixedDay = o.today ?? null;
		this.within = o.scope ?? '';
		this.counter = new WordCounter(plugin, () => this.later(120, !this.body));
	}

	private get today(): string { return this.fixedDay ?? recordDay(Date.now()); }
	private get binder() { return this.plugin.binders.binderOf(this.folder); }
	private get binderFolder(): TFolder { return this.binder?.folder ?? this.folder; }
	private get scopeFolder(): TFolder {
		const f = this.within ? this.app.vault.getAbstractFileByPath(`${this.binderFolder.path}/${this.within}`) : null;
		return f instanceof TFolder ? f : this.binderFolder;
	}

	onOpen(): void {
		const { plugin } = this, root = this.binderFolder.path + '/';
		this.open_ = true;
		this.modalEl.addClass('binders-pot');
		this.setTitle(this.binderFolder.name);
		this.life.load();
		// what is typed in a note beside it, and another device's file arriving, show without closing it
		const changed = (): void => this.later(700, true);
		plugin.progress.listeners.add(changed);
		this.life.register(() => plugin.progress.listeners.delete(changed));
		this.life.registerEvent(this.app.vault.on('modify', (f) => { if (f instanceof TFile && f.extension === 'md' && f.path.startsWith(root)) { this.texts = null; changed(); } }));
		void this.load();
	}

	onClose(): void {
		this.open_ = false;
		this.stop?.();
		this.life.unload();
		window.clearTimeout(this.timer);
		this.contentEl.empty();
	}

	/** Draws again in a moment (`read`: the record is read again first). */
	private again = false;
	private later(ms: number, read = false): void {
		this.again ||= read;
		window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => { const r = this.again; this.again = false; if (r) void this.load(); else this.draw(); }, ms);
	}

	/** Reads the record. A binder that isn't recorded now may still have one from before: it is read and shown. */
	private async load(): Promise<void> {
		const { plugin } = this, binder = this.binder, go = ++this.reading;
		let merged: Merged | null = null, why = '';
		this.stopped = '';
		if (binder) {
			const live = plugin.progress.recordOf(binder);
			if (live?.blocked) why = `${live.blocked}, so Binders keeps no record of this binder there. Its record is kept in a binder’s Snapshots folder, and a folder of your own is left alone.`;
			else if (live) merged = await plugin.progress.read(binder.folder);
			else {
				try { merged = await new BinderRecord(this.app, binder.folder, () => plugin.progress.device()).readAll(); } catch { merged = null; }
				this.stopped = binder.problem ? 'This binder can’t be changed by this version of Binders, so its writing is not being recorded.' : 'Recording is off, so nothing is being added.';
				why = binder.problem ? `${binder.problem} Its writing is not recorded.` : 'Binders isn’t keeping a record of your writing, so there is nothing to show. Turn on “Keep a record of your writing” in settings to begin.';
			}
		}
		if (go !== this.reading || !this.open_) return;
		this.history = merged ? toHistory(merged, plugin.settings.statuses) : null;
		if (!this.history?.days.length) { this.nothing(why); return; }
		if (!this.body) {
			this.contentEl.empty();
			this.modalEl.addClass('mod-page');
			this.body = this.contentEl.createDiv({ cls: 'binders-pot-body', attr: { tabindex: '0', role: 'region', 'aria-label': `Progress of ${this.binderFolder.name}` } });
			const body = this.body;
			this.stop = watchSize(this.app, body, () => { if (Math.abs(body.clientWidth - this.width) > 2) this.draw(); });
		}
		this.draw();
		if (!this.texts) void this.read();
	}

	/** Nothing to show: one of Obsidian's small dialogs, a sentence and a button. */
	private nothing(why: string): void {
		const { contentEl } = this, binder = this.binder;
		this.stop?.();
		this.body = null;
		this.modalEl.removeClass('mod-page');
		contentEl.empty();
		this.modalEl.querySelectorAll('.modal-button-container').forEach((e) => e.remove());
		this.setTitle('Progress');
		const words = this.counter.sum(this.plugin.binders.scenes(this.binderFolder));
		const off = !this.plugin.settings.recordProgress;
		contentEl.createEl('p', { cls: 'binders-pot-nothing', text: why || `The record of “${this.binderFolder.name}” begins with the first words you type in it.${words ? ` It has ${count(words, 'word')} today.` : ''}` });
		const row = buttonRow(this);
		if (off && binder && !binder.problem) new ButtonComponent(row).setButtonText('Open settings').setCta().onClick(() => { this.close(); const s = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting; s?.open(); s?.openTabById(this.plugin.manifest.id); });
		else new ButtonComponent(row).setButtonText('Close').onClick(() => this.close());
	}

	/** The notes' text, for what it says of itself: read after the record is drawn, so the window never waits on it. */
	private async read(): Promise<void> {
		const root = this.binderFolder, go = this.reading, out: SceneText[] = [];
		for (const f of this.plugin.binders.scenes(root)) {
			const text = await this.app.vault.cachedRead(f), body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
			out.push({ name: f.path.slice(root.path.length + 1).replace(/\.md$/, ''), text: body, words: this.plugin.progress.words(text) });
		}
		if (go !== this.reading || !this.open_) return;
		this.texts = out;
		this.draw();
	}

	// ---- what is shown ----

	/** The words under a folder of the binder as counted now, or undefined until every note is counted. */
	private wordsNow(folder: TFolder): number | undefined { return this.counter.sum(this.plugin.binders.scenes(folder)) ?? undefined; }

	private draw(): void {
		const h = this.history, body = this.body;
		if (!h || !body || !this.open_) return;
		const t = num(this.today), scope = this.within;
		const rs = rowsOf(h, this.today, scope, this.fixedDay ? undefined : this.wordsNow(this.scopeFolder));
		const keep = body.scrollTop, held = body.querySelector<HTMLElement>(':focus')?.dataset.bindersKey;
		body.empty();
		this.width = body.clientWidth;
		const style = getComputedStyle(body), W = Math.max(240, Math.floor(this.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)));
		const narrow = W < 560, first = stage(rs) !== 'full', base = baseOf(rs), began = rs[0]?.n ?? t;
		const written = rs.filter((r) => r.added || r.cut);

		// ---- the few numbers a writer acts on ----
		const head = body.createDiv({ cls: 'binders-pot-head' });
		for (const f of this.now(rs)) this.figure(head, f[0], f[1], f[2]);
		const line = body.createDiv({ cls: 'binders-pot-planline' });
		const said = line.createSpan({ cls: 'binders-pot-said' });
		const whose = scope ? `${scope.split('/').pop() ?? ''}, in ${this.binderFolder.name}. ` : '';
		const since = rs.length <= 1 ? 'The record began today' : first ? `The record is ${count(rs.length, 'day')} old` : `Recorded since ${sayDay(began)}`;
		said.setText(`${whose}${since}.${base > 50 ? ` ${scope ? 'This folder' : 'The book'} had ${fmt(base)} words when it began.` : ''}${this.stopped ? ' ' + this.stopped : ''}`);
		this.scopePicker(line);

		// ---- its life ----
		{
			const s = this.section(body, scope ? 'This folder’s life' : 'The book’s life', '');
			const readout = s.querySelector<HTMLElement>('.binders-pot-section-detail');
			const rest = rs.length <= 1 ? 'Day one' : `${count(rs.length, 'day')}, ${fmt(written.length)} written on`;
			readout?.setText(rest);
			readout?.setAttr('aria-live', 'off');
			const ranges = RANGES.filter(([, , days]) => !days || rs.length > days + 10);
			if (this.range && !ranges.some((r) => r[2] === this.range)) this.range = 0;
			if (ranges.length > 1) {
				const seg = s.querySelector<HTMLElement>('.binders-pot-section-head')?.createDiv({ cls: 'binders-pot-ranges', attr: { role: 'group', 'aria-label': 'How much of the record the chart shows' } });
				for (const [key, name, days] of ranges) {
					const b = seg?.createEl('button', { cls: `text-icon-button binders-pot-range${this.range === days ? ' is-active' : ''}`, text: name, attr: { 'aria-pressed': String(this.range === days), 'data-binders-key': `range-${key}` } });
					b?.addEventListener('click', () => { this.range = days; this.draw(); });
				}
			}
			const from = this.range ? t - this.range : 0, shown = from ? rs.filter((r) => r.n >= from) : rs;
			// a book much larger than what the record has seen of it: the axis starts just under it, or the days are a flat line
			const lo = Math.min(from ? shown[0]?.total ?? 0 : base, ...shown.map((r) => r.total)), hi = Math.max(1, ...shown.map((r) => r.total));
			const story = chapters(rs), chart = s.createDiv({ cls: 'binders-pot-chart' });
			const unsaid = drawLife(chart, {
				rows: rs, estimate: [], plan: null, projection: null, chapters: story, marks: scope ? [] : h.marks, today: t, width: W, height: first ? (narrow ? 220 : 250) : narrow ? 260 : 340, from, base, floor: (hi - lo) / hi < 0.3 && lo > 0,
				hover: (r) => readout?.setText(r ? `${sayDay(r.n, { weekday: !narrow, short: narrow })}: ${fmt(r.total)} words${r.added ? `, ${fmt(r.added)} written` : ''}${r.cut ? `, ${fmt(r.cut)} cut` : ''}${r.block ? `, ${fmt(Math.abs(r.block))} ${r.block > 0 ? 'brought in' : 'taken out'} at once` : ''}${r.elsewhere ? `, ${fmt(Math.abs(r.elsewhere))} ${r.elsewhere > 0 ? 'more' : 'fewer'} from elsewhere` : ''}` : rest),
			});
			const key = s.createDiv({ cls: 'binders-pot-key' });
			this.key(key, 'is-bar', 'Written');
			if (shown.some((r) => r.cut > 0 || r.block < 0 || r.elsewhere < 0)) this.key(key, 'is-cut', 'Cut or taken out');
			if (shown.some((r) => r.block > 0 || r.elsewhere > 0)) this.key(key, 'is-block', 'Brought in, or changed elsewhere');
			if (story.some((c) => c.kind === 'away')) this.key(key, 'is-away', 'Away');
			if (unsaid.length) s.createDiv({ cls: 'binders-pot-unsaid', text: `Also: ${unsaid.join('; ')}.` });
			if (first) table(s, `${scope ? 'This folder' : 'The binder'}’s words, day by day`, ['Day', 'Words at its end', 'Written', 'Cut', 'Brought in or taken out', 'Changed elsewhere'], rs.map((r) => [sayDay(r.n), fmt(r.total), fmt(r.added), fmt(r.cut), fmt(r.block), fmt(r.elsewhere)]));
			else table(s, `${scope ? 'This folder' : 'The binder'}’s words, month by month`, ['Month', 'Words at its end', 'Written', 'Cut', 'Brought in or taken out', 'Changed elsewhere', 'Days written on'], this.months(rs).map(([k, m]) => [k, fmt(m.total), fmt(m.added), fmt(m.cut), fmt(m.block), fmt(m.elsewhere), fmt(m.days)]));
		}

		// ---- the first days: what the calendar is before there is one ----
		if (first) {
			const left = FIRST_DAYS - rs.length;
			const s = this.section(body, 'The first two weeks', `${count(written.length, 'day')} written on`);
			drawFirstDays(s.createDiv({ cls: 'binders-pot-chart' }), rs, t, Math.min(W, 14 * 64), FIRST_DAYS);
			s.createDiv({ cls: 'binders-pot-coming', text: `In ${count(left, 'day')} this becomes a calendar of every day, and the hours you write in, the days of the week and each part’s story appear beside it.` });
		}

		// ---- every day, and when in the day and the week ----
		if (!first) {
			const hours = hourShape(h, scope), wd = weekdayShape(rs);
			const showHours = written.length >= 5 && hours.some((v) => v > 0), showDays = rs.length >= 28 && !alike(wd), beside = (showHours || showDays) && !narrow;
			const wrap = body.createDiv({ cls: 'binders-pot-columns' });
			const cal = this.section(wrap, 'Every day', `${fmt(written.length)} written on`);
			const calW = narrow ? W : beside ? Math.min(W - 300, 54 * 14 + 34) : Math.min(W, 54 * 14 + 34);
			drawCalendar(cal.createDiv({ cls: 'binders-pot-chart' }), rs, calW, narrow);
			const ck = cal.createDiv({ cls: 'binders-pot-key' });
			const scale = ck.createSpan({ cls: 'binders-pot-scale' });
			scale.createSpan({ text: 'Less' });
			for (const c of ['is-1', 'is-2', 'is-3', 'is-4']) scale.createSpan({ cls: `binders-pot-swatch is-cell ${c}` });
			scale.createSpan({ text: 'More' });
			if (rs.some((r) => (r.added || r.cut) && r.added <= r.cut)) this.key(ck, 'is-cell is-cut', 'Ended with fewer words');
			table(cal, 'Days written on, month by month', ['Month', 'Days written on', 'Written', 'Cut'], this.months(rs).map(([k, m]) => [k, fmt(m.days), fmt(m.added), fmt(m.cut)]));
			if (showHours || showDays) {
				const when = this.section(wrap, 'When', '');
				const sideW = narrow ? W : Math.max(220, W - calW - 48);
				if (showHours) {
					const box = when.createDiv({ cls: 'binders-pot-small' });
					box.createDiv({ cls: 'binders-pot-small-said', text: hourSaid(hours) });
					drawBars(box.createDiv({ cls: 'binders-pot-chart' }), hours, hours.map((_, i) => (i === 0 ? '12 am' : i === 6 ? '6' : i === 12 ? 'noon' : i === 18 ? '6' : null)), sideW, 78, 'Words added in each hour of the day');
					table(box, 'Words added in each hour of the day', ['Hour', 'Words'], hours.map((v, i) => [`${i}:00`, fmt(v)]));
				}
				if (showDays) {
					const best = wd.indexOf(Math.max(...wd)), box = when.createDiv({ cls: 'binders-pot-small' }), order = [1, 2, 3, 4, 5, 6, 0];
					box.createDiv({ cls: 'binders-pot-small-said', text: `${WEEKDAYS[best]}s most: ${fmt(wd[best])} words` });
					drawBars(box.createDiv({ cls: 'binders-pot-chart' }), order.map((d) => wd[d]), order.map((d) => LETTERS[d]), sideW, 78, 'Words written on each day of the week');
					table(box, 'Words written on each day of the week', ['Day', 'Words'], order.map((d) => [WEEKDAYS[d], fmt(wd[d])]));
				}
			}
		}

		// ---- the parts ----
		const items = (this.plugin.binders.orderedChildren(this.scopeFolder) ?? []);
		if (!first && items.length > 1) {
			const nowBy: Record<string, number> = {}, names: string[] = [];
			for (const c of items) { const name = c instanceof TFolder ? c.name : c.name.replace(/\.md$/, ''), w = c instanceof TFolder ? this.wordsNow(c) : c instanceof TFile ? this.counter.get(c) ?? undefined : undefined; names.push(name); if (w !== undefined) nowBy[name] = w; }
			const list = parts(h, rs, names, scope, nowBy).filter((x) => x.now > 0 || x.totals.some((v) => v > 0));
			if (list.length > 1) {
				const s = this.section(body, items.some((c) => c instanceof TFolder) ? 'The parts' : 'The scenes', 'when each was written');
				const grid = s.createDiv({ cls: 'binders-pot-parts' });
				const stripW = Math.max(80, narrow ? W - 150 : W - 470);
				// a square a month (a week, in a record's first months): how much the part grew in it
				const per = rs.length > 200 ? 0 : 7, starts: number[] = [];
				rs.forEach((r, i) => { const d = new Date(r.n * 864e5); if (i === 0 || (per ? i % per === 0 : d.getUTCDate() === 1)) starts.push(i); });
				const months = list.map((x) => starts.map((a, k) => { const b = (starts[k + 1] ?? rs.length) - 1, before = a ? x.totals[a - 1] : x.totals[0]; let moved = false; for (let i = Math.max(1, a); i <= b && !moved; i++) moved = x.totals[i] !== x.totals[i - 1]; return { net: x.totals[b] - before, moved }; }));
				const grown = months.flat().map((m) => m.net).filter((v) => v > 0).sort((a, b) => a - b), q = (f: number): number => grown[Math.min(grown.length - 1, Math.floor(grown.length * f))] ?? 0;
				const axis = grid.createDiv({ cls: 'binders-pot-part is-axis' });
				axis.createDiv();
				drawStrip(axis.createDiv({ cls: 'binders-pot-chart' }), null, [], stripW, 14, starts.map((a) => rs[a].n));
				const some = this.allParts ? list : list.slice(0, PARTS_SHOWN);
				some.forEach((part, k) => {
					const row = grid.createDiv({ cls: 'binders-pot-part' });
					row.createDiv({ cls: 'binders-pot-part-name', text: part.name });
					drawStrip(row.createDiv({ cls: 'binders-pot-chart' }), months[k], [q(0.3), q(0.6), q(0.85)], stripW, 16, starts.map((a) => rs[a].n));
					row.createDiv({ cls: 'binders-pot-part-words', text: fmt(part.now) });
					if (!narrow) row.createDiv({ cls: 'binders-pot-part-note', text: part.grewMost ? `most of it in ${part.grewMost}` : '' });
				});
				if (list.length > PARTS_SHOWN) {
					const b = s.createEl('button', { cls: 'binders-pot-quiet', text: this.allParts ? `Show the first ${PARTS_SHOWN}` : `Show all ${list.length}`, attr: { 'data-binders-key': 'all-parts', 'aria-expanded': String(this.allParts) } });
					b.addEventListener('click', () => { this.allParts = !this.allParts; this.draw(); });
				}
				table(s, 'When each was written', ['Name', 'Words now', 'Grew most in'], list.map((x) => [x.name, fmt(x.now), x.grewMost]));
			}
		}

		// ---- through the statuses ----
		if (!first && !scope) {
			const series = statusSeries(h, rs);
			if (series.length > 1) {
				const s = this.section(body, 'Through the statuses', 'the book’s words by the status of their scene');
				drawStatus(s.createDiv({ cls: 'binders-pot-chart' }), series, rs, W, narrow ? 120 : 150);
				const key = s.createDiv({ cls: 'binders-pot-key' });
				series.forEach((st, i) => this.key(key, `is-band is-${Math.min(4, i + 1)}-of-${Math.min(4, series.length)}`, `${st.status || 'No status'} ${fmt(st.totals[st.totals.length - 1])}`));
				// (a row a month: the words in each status at its end)
				const ends = rs.map((r, i) => i).filter((i) => i === rs.length - 1 || new Date(rs[i + 1].n * 864e5).getUTCDate() === 1);
				table(s, 'The binder’s words by status, at the end of each month', ['Month', ...series.map((x) => x.status || 'No status')], ends.map((i) => { const d = new Date(rs[i].n * 864e5); return [`${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}`, ...series.map((x) => fmt(x.totals[i]))]; }));
			}
		}

		// ---- records and oddities: each a name, a number and a line ----
		const scenes = this.texts?.filter((x) => !scope || x.name.startsWith(scope + '/')) ?? [];
		const all: Fact[] = [...facts(h, rs, scope), ...textFacts(scenes)];
		if (all.length) {
			const s = this.section(body, first ? 'So far' : 'Records and oddities', '');
			const grid = s.createDiv({ cls: 'binders-pot-facts' });
			for (const g of [...new Set(all.map((f) => f.group))]) {
				const col = grid.createDiv({ cls: 'binders-pot-factgroup', attr: { role: 'group', 'aria-label': g } });
				col.createDiv({ cls: 'binders-pot-factgroup-name', text: g });
				const dl = col.createEl('dl');
				for (const f of all.filter((x) => x.group === g)) {
					dl.createEl('dt', { cls: 'binders-pot-fact-label', text: f.label });
					const dd = dl.createEl('dd', { cls: 'binders-pot-fact' });
					dd.createDiv({ cls: 'binders-pot-fact-value', text: f.value });
					if (f.note) dd.createDiv({ cls: 'binders-pot-fact-note', text: f.note });
				}
			}
		}
		body.createDiv({ cls: 'binders-pot-foot', text: 'The record is kept in this binder’s Snapshots folder, in History: on your devices, and nowhere else. Written and cut are what you type; a paste or a scene deleted moves the total and is not a day’s writing.' });
		body.scrollTop = keep;
		if (held) body.querySelector<HTMLElement>(`[data-binders-key="${held}"]`)?.focus();
	}

	/** The rows a month at a time: [its name, what it came to]. */
	private months(rs: Row[]): [string, { total: number; added: number; cut: number; block: number; elsewhere: number; days: number }][] {
		const out = new Map<string, { total: number; added: number; cut: number; block: number; elsewhere: number; days: number }>();
		for (const r of rs) {
			const d = new Date(r.n * 864e5), k = `${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}`, m = out.get(k) ?? { total: 0, added: 0, cut: 0, block: 0, elsewhere: 0, days: 0 };
			m.total = r.total; m.added += r.added; m.cut += r.cut; m.block += r.block; m.elsewhere += r.elsewhere; if (r.added || r.cut) m.days++;
			out.set(k, m);
		}
		return [...out];
	}

	/** The numbers at the head: [what, the number, a line under it]. */
	private now(rs: Row[]): [string, string, string][] {
		const t = num(this.today), last = rs[rs.length - 1], total = last?.total ?? 0;
		const today = last && last.n === t ? last.added - last.cut : 0;
		const week = rs.filter((r) => r.n > t - 7), wrote = [...rs].reverse().find((r) => r.added || r.cut);
		const note = this.plugin.binders.folderNote(this.scopeFolder), target = note ? readProps(this.plugin, note).target : 0;
		const out: [string, string, string][] = [];
		out.push(['Today', fmt(today), today ? (Math.abs(today) === 1 ? 'word' : 'words') : wrote ? `last written on ${sayDay(wrote.n, { weekday: t - wrote.n < 7, year: false })}` : 'words']);
		if (rs.length > 1) out.push(['Seven days', fmt(week.reduce((a, r) => a + r.added - r.cut, 0)), `${count(week.filter((r) => r.added || r.cut).length, 'day')} written on`]);
		out.push([this.within ? 'This folder' : 'The book', fmt(total), target ? `of ${fmt(target)}: ${Math.floor((total / target) * 100)}%` : this.within ? 'words' : last && rs.length ? this.scenesSaid() : 'words']);
		if (rs.length >= 30) { const month = rs.slice(-30), sum = month.reduce((a, r) => a + r.added - r.cut, 0); out.push(['Thirty days', fmt(sum), `${fmt(Math.round(sum / 30))} a day`]); }
		return out;
	}

	private scenesSaid(): string {
		const n = [...(this.history?.days ?? [])].reverse().find((d) => d.scenes !== undefined)?.scenes;
		return n ? count(n, 'scene') : 'words';
	}

	private figure(parent: HTMLElement, label: string, value: string, note: string): void {
		const f = parent.createDiv({ cls: 'binders-pot-figure' });
		f.createDiv({ cls: 'binders-pot-figure-label', text: label });
		f.createDiv({ cls: 'binders-pot-figure-value', text: value });
		f.createDiv({ cls: 'binders-pot-figure-note', text: note });
	}

	private section(parent: HTMLElement, name: string, detail: string): HTMLElement {
		const s = parent.createEl('section', { cls: 'binders-pot-section', attr: { 'aria-label': name } });
		const head = s.createDiv({ cls: 'binders-pot-section-head' });
		head.createEl('h3', { cls: 'binders-pot-section-name', text: name });
		head.createDiv({ cls: 'binders-pot-section-detail', text: detail });
		return s;
	}

	private key(parent: HTMLElement, cls: string, text: string): void {
		const k = parent.createSpan({ cls: 'binders-pot-key-item' });
		k.createSpan({ cls: `binders-pot-swatch ${cls}` });
		k.createSpan({ text });
	}

	/** The whole binder or one of its folders: a dropdown, as Obsidian's settings have. */
	private scopePicker(parent: HTMLElement): void {
		const folders = (this.plugin.binders.orderedChildren(this.binderFolder) ?? []).filter((c): c is TFolder => c instanceof TFolder);
		if (!folders.length) return;
		const sel = parent.createEl('select', { cls: 'dropdown binders-pot-scope', attr: { 'aria-label': 'Show the whole binder or one folder', 'data-binders-key': 'scope' } });
		sel.createEl('option', { text: 'The whole binder', value: '' });
		for (const f of folders) sel.createEl('option', { text: f.name, value: f.name });
		sel.value = this.within;
		sel.addEventListener('change', () => { this.within = sel.value; this.range = 0; this.allParts = false; this.draw(); });
	}
}
