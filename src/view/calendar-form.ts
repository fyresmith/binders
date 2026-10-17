import { ButtonComponent, DropdownComponent, Menu, Notice, TFile, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { shownName } from '../shown-name';
import type BindersPlugin from '../main';
import type { Binder } from '../binders';
import { PRESETS, eraAbbr, makeCalendar, readCalendarDef, writeCalendarDef, type CalendarDef, type MonthDef } from '../time/calendar';
import { exampleDates, parseStoryDate, readStoryDate, showStoryDate, writeStoryDate, type Calendar, type StoryDate } from '../time/date';

/* The Calendar page of Binder settings: a book's own calendar and its eras, edited as Bases' "Configure view" is (groups
   of rows, a label over each field), and kept in the binder note's `calendar` and `eras` (time/calendar.ts). It is the
   one page that does not keep a change as it is made: what is edited is a draft, and its one Save writes it, as one
   change that "Undo" takes back. A scene's story date is written only when the writer
   asks for it: when months are moved, a written "11" would mean another month, and "Move their dates with their
   months" (off until ticked) writes those dates so they keep reading as they do. Otherwise a date reads in the new
   calendar as it is written, and what that does to the book's dates is said before it is saved. */

/** A month in the draft, with the number it had in the calendar as the binder note has it (none for a new one). */
type Draft = MonthDef & { was?: number };

/** A dated note, and its date as the binder's calendar reads it now. */
interface Dated { file: TFile; raw: unknown; date: StoryDate }

export class CalendarForm {
	private def: Omit<CalendarDef, 'months'> & { months: Draft[] | null };
	private form!: HTMLElement;
	private about!: HTMLElement;
	/** Does Save also write the dates in months that moved, so they keep their months? Off until the writer ticks it. */
	private follow = false;
	/** The month being dragged, by its place in the draft. */
	private dragging: number | null = null;

	private app: App;

	/** `root`: where the form is drawn; `saved`: called once the calendar is written. */
	constructor(private plugin: BindersPlugin, private binder: Binder, private root: HTMLElement, private saved: () => void) {
		this.app = plugin.app;
		const fm = plugin.app.metadataCache.getFileCache(binder.note)?.frontmatter;
		this.def = structuredClone(readCalendarDef(fm?.calendar, fm?.eras).def);
		this.def.months?.forEach((m, i) => { m.was = i + 1; });
	}

	/** Draws the form, with the one Save button at its foot. `locked`: why nothing can be changed, or null. */
	open(locked: string | null): void {
		const el = this.root;
		el.createDiv({ cls: 'binders-calendar-says', text: 'Saving the calendar can change what the story dates already written mean: what it would do is said below, before you save.' });
		// (a calendar the binder note has and Binders can't read: what it could read is shown, and Save writes that)
		const problem = this.plugin.binders.calendarProblem(this.binder);
		if (problem) el.createDiv({ cls: 'binders-calendar-dates mod-warning binders-calendar-problem', text: `${problem.replace(/ Story dates.*$/, '')} What could be read is shown here; Save writes it as shown.` });
		this.form = el.createDiv({ cls: 'bases-toolbar-menu-form view-config-menu binders-calendar-form' });
		this.about = el.createDiv({ cls: 'binders-calendar-about', attr: { role: 'status' } });
		const row = el.createDiv({ cls: 'binders-calendar-save' });
		const save = new ButtonComponent(row).setButtonText('Save').setCta().onClick(() => void this.save());
		save.buttonEl.dataset.bindersKey = 'calendar-save';
		if (locked) { save.setDisabled(true); el.addClass('is-locked'); }
		this.draw();
		// (nothing in a locked calendar is changed: its fields are shown and not enabled)
		if (locked) for (const x of Array.from(this.form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))) x.disabled = true;
	}

	private get cal(): Calendar { return makeCalendar(this.def); }

	private draw(focus?: string): void {
		const form = this.form, top = form.scrollTop, def = this.def;
		form.empty();
		// which calendar: one of the ready-made ones, or the book's own once it is changed
		const which = this.group(form, null);
		const start = this.row(which, 'Start from');
		const plain = (ms: MonthDef[] | null) => JSON.stringify(ms?.map((m) => [m.name, m.days]) ?? null);
		const own = PRESETS.find((p) => plain(p.def().months) === plain(def.months) && !def.leaps.length);
		const dd = new DropdownComponent(start);
		if (!own) dd.addOption('own', 'The book’s own');
		for (const p of PRESETS) dd.addOption(p.id, p.title);
		dd.setValue(own?.id ?? 'own').onChange((v) => {
			const p = PRESETS.find((x) => x.id === v);
			if (!p) return;
			this.def = { ...p.def(), eras: def.eras };
			this.draw();
		});
		dd.selectEl.setAttr('aria-label', 'Start from');
		which.createDiv({ cls: 'binders-calendar-note', text: this.summary() });

		if (def.months) {
			const months = this.group(form, 'Months');
			const list = months.createDiv({ cls: 'binders-calendar-months' });
			def.months.forEach((m, i) => this.month(list, m, i));
			this.add(months, 'Add a month', () => { def.months?.push({ name: '', days: def.months[def.months.length - 1]?.days ?? 30 }); });

			if (def.months.length) {
				const leap = this.group(form, 'Leap days');
				def.leaps.forEach((r, i) => {
					const el = leap.createDiv({ cls: 'binders-calendar-item binders-calendar-leap' });
					el.createSpan({ text: 'Add' });
					this.num(el, r.days, 'Days added', (v) => { if (v >= 1) r.days = v; }, r.days === 1 ? 'day to' : 'days to');
					const mo = new DropdownComponent(el);
					def.months?.forEach((x, k) => { mo.addOption(String(k + 1), x.name || `Month ${k + 1}`); });
					mo.setValue(String(r.month)).onChange((v) => { r.month = Number(v); this.say(); });
					mo.selectEl.setAttr('aria-label', 'The month that gets them');
					el.createSpan({ text: 'every' });
					this.num(el, r.every, 'Every', (v) => { if (v >= 1) r.every = v; }, 'years');
					this.remove(el, 'Remove this leap rule', () => { def.leaps.splice(i, 1); });
					const more = leap.createDiv({ cls: 'binders-calendar-item binders-calendar-leap mod-sub' });
					more.createSpan({ text: 'except every' });
					this.num(more, r.except ?? null, 'Except every', (v) => { r.except = v || undefined; }, 'years, unless every');
					this.num(more, r.unless ?? null, 'Unless every', (v) => { r.unless = v || undefined; }, 'years');
				});
				if (!def.leaps.length) this.add(leap, 'Add a leap rule', () => { def.leaps.push({ month: Math.min(2, def.months?.length ?? 1), days: 1, every: 4 }); });
			}
		}

		const eras = this.group(form, 'Eras');
		def.eras.forEach((e, i) => {
			const el = eras.createDiv({ cls: 'binders-calendar-item binders-calendar-era' });
			this.text(el, e.name, 'Era name', (v) => { e.name = v; }, 'binders-calendar-name');
			this.text(el, e.abbr ?? '', 'Short name', (v) => { e.abbr = v || undefined; }, 'binders-calendar-abbr', eraAbbr({ name: e.name }) || 'Short');
			const sub = eras.createDiv({ cls: 'binders-calendar-item binders-calendar-era mod-sub' });
			sub.createSpan({ text: i === 0 && e.from == null ? 'From the start of time' : 'From year' });
			if (!(i === 0 && e.from == null)) this.num(sub, e.from, 'First year', (v) => { e.from = v; }, '', 'binders-calendar-year');
			const counts = new DropdownComponent(sub).addOption('up', 'Counting up').addOption('down', 'Counting down').setValue(e.down ? 'down' : 'up').onChange((v) => { e.down = v === 'down'; this.draw(); });
			counts.selectEl.setAttr('aria-label', 'Its years count');
			this.remove(el, `Remove ${e.name || 'this era'}`, () => { def.eras.splice(i, 1); });
		});
		this.add(eras, 'Add an era', () => {
			const last = def.eras[def.eras.length - 1];
			def.eras.push({ name: '', from: last ? (last.from ?? 0) + 100 : 1 });
		});
		if (!def.eras.length) eras.createDiv({ cls: 'binders-calendar-note', text: 'An era names a stretch of years: “12 AL” is the twelfth year of the Age of Lamps. Years count up from its first, or down to the next era, as BC does.' });
		form.scrollTop = top;
		if (focus) form.querySelector<HTMLElement>(`[data-focus="${focus}"]`)?.focus();
		this.say();
	}

	/** A month's row: a handle to move it by (a drag, or its menu by touch and the keys), its number, name and days. */
	private month(list: HTMLElement, m: Draft, i: number): void {
		const months = this.def.months ?? [], el = list.createDiv({ cls: 'binders-calendar-item binders-calendar-month', attr: { draggable: 'true', 'data-index': String(i) } });
		const grip = el.createDiv({ cls: 'clickable-icon binders-calendar-grip', attr: { role: 'button', tabindex: '0', 'aria-label': `Move ${m.name || 'this month'}`, 'aria-haspopup': 'menu', 'data-focus': `grip-${i}` } });
		setIcon(grip, 'grip-vertical');
		const menu = (e: MouseEvent | KeyboardEvent) => {
			const mn = new Menu();
			mn.addItem((x) => x.setTitle('Move up').setIcon('arrow-up').setDisabled(i === 0).onClick(() => this.move(i, i - 1)));
			mn.addItem((x) => x.setTitle('Move down').setIcon('arrow-down').setDisabled(i === months.length - 1).onClick(() => this.move(i, i + 1)));
			if (e instanceof MouseEvent && e.clientX) mn.showAtMouseEvent(e); else { const r = grip.getBoundingClientRect(); mn.showAtPosition({ x: r.left, y: r.bottom }); }
		};
		grip.addEventListener('click', menu);
		grip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu(e); } });
		el.createSpan({ cls: 'binders-calendar-number', text: String(i + 1) });
		const name = this.text(el, m.name, 'Month name', (v) => { m.name = v; }, 'binders-calendar-name');
		name.dataset.focus = `month-${i}`;
		// (Alt with an arrow moves the month whose name has the cursor, as Alt with an arrow moves a card)
		name.addEventListener('keydown', (e) => {
			if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
			e.preventDefault();
			const to = i + (e.key === 'ArrowUp' ? -1 : 1);
			if (to >= 0 && to < months.length) this.move(i, to, `month-${to}`);
		});
		this.num(el, m.days, 'Days', (v) => { if (v >= 1 && v <= 99) m.days = v; }, 'days');
		this.remove(el, `Remove ${m.name || 'this month'}`, () => {
			months.splice(i, 1);
			this.def.leaps = this.def.leaps.filter((r) => r.month !== i + 1).map((r) => (r.month > i + 1 ? { ...r, month: r.month - 1 } : r));
		});
		// a drag by the row: a line where it would go, and it goes there when let go
		el.addEventListener('dragstart', (e) => {
			if (!(e.target instanceof HTMLElement) || e.target.closest('input')) { e.preventDefault(); return; }
			this.dragging = i;
			e.dataTransfer?.setData('text/plain', m.name);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
			el.addClass('is-being-dragged');
		});
		el.addEventListener('dragend', () => { this.dragging = null; el.removeClass('is-being-dragged'); this.clearMarks(); });
		el.addEventListener('dragover', (e) => {
			if (this.dragging == null) return;
			e.preventDefault();
			const r = el.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
			this.clearMarks();
			el.addClass(after ? 'mod-drop-after' : 'mod-drop-before');
		});
		el.addEventListener('drop', (e) => {
			if (this.dragging == null) return;
			e.preventDefault();
			const r = el.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2, from = this.dragging;
			let to = i + (after ? 1 : 0);
			if (from < to) to--;
			this.dragging = null;
			if (to !== from) this.move(from, to); else this.clearMarks();
		});
	}

	private clearMarks(): void { this.form.querySelectorAll('.mod-drop-before, .mod-drop-after').forEach((x) => x.removeClasses(['mod-drop-before', 'mod-drop-after'])); }

	/** Moves a month to another place; the leap rules go with the months they name. */
	private move(from: number, to: number, focus = `grip-${to}`): void {
		const months = this.def.months;
		if (!months || from === to) return;
		const order = months.map((_, k) => k), [m] = months.splice(from, 1), [k] = order.splice(from, 1);
		months.splice(to, 0, m);
		order.splice(to, 0, k);
		this.def.leaps = this.def.leaps.map((r) => ({ ...r, month: order.indexOf(r.month - 1) + 1 }));
		this.draw(focus);
	}

	/** One group of rows, under its heading (none for the first). */
	private group(form: HTMLElement, name: string | null): HTMLElement {
		const wrap = form.createDiv({ cls: 'input-group-container', attr: name ? { role: 'group', 'aria-label': name } : {} });
		if (name) { wrap.createDiv({ cls: 'input-group-divider' }); wrap.createDiv({ cls: 'input-group-header', text: name }); }
		return wrap.createDiv({ cls: 'input-group-content' });
	}

	private row(parent: HTMLElement, label: string): HTMLElement {
		const el = parent.createDiv({ cls: 'input-row' });
		el.createDiv({ cls: 'input-row-label', text: label });
		return el.createDiv({ cls: 'input-row-content' });
	}

	private text(parent: HTMLElement, value: string, label: string, set: (v: string) => void, cls: string, placeholder = label): HTMLInputElement {
		const input = parent.createEl('input', { type: 'text', cls, attr: { 'aria-label': label, placeholder, spellcheck: 'false' } });
		input.value = value;
		input.addEventListener('input', () => { set(input.value.trim()); this.say(); });
		return input;
	}

	private num(parent: HTMLElement, value: number | null, label: string, set: (v: number) => void, after: string, cls = 'binders-calendar-days'): void {
		const input = parent.createEl('input', { type: 'number', cls, attr: { 'aria-label': label, inputmode: 'numeric' } });
		if (value != null) input.value = String(value);
		input.addEventListener('input', () => { const n = Number(input.value); if (input.value.trim() && Number.isInteger(n)) set(n); else if (!input.value.trim()) set(0); this.say(); });
		if (after) parent.createSpan({ cls: 'binders-calendar-unit', text: after });
	}

	private remove(parent: HTMLElement, label: string, run: () => void): void {
		const b = parent.createDiv({ cls: 'clickable-icon binders-calendar-remove', attr: { role: 'button', tabindex: '0', 'aria-label': label } });
		setIcon(b, 'x');
		const go = () => { run(); this.draw(); };
		b.addEventListener('click', go);
		b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
	}

	private add(parent: HTMLElement, label: string, run: () => void): void {
		const b = parent.createDiv({ cls: 'binders-calendar-add', attr: { role: 'button', tabindex: '0' } });
		setIcon(b.createSpan({ cls: 'binders-calendar-add-icon' }), 'plus');
		b.createSpan({ text: label });
		const go = () => { run(); this.draw(); (this.form.querySelectorAll<HTMLInputElement>('input.binders-calendar-name')).forEach((x, i, all) => { if (i === all.length - 1 && !x.value) x.focus(); }); };
		b.addEventListener('click', go);
		b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
	}

	/** What the calendar is, in a line: "13 months, 361¼ days a year on average". */
	private summary(): string {
		const d = this.def;
		if (!d.months) return 'January to December, with a leap day every fourth year, as Obsidian’s own dates have it.';
		if (!d.months.length) return 'Dates are years only.';
		const cal = this.cal, len = cal.yearLength, whole = Math.floor(len), frac = len - whole;
		const q = Math.abs(frac - 0.25) < 0.01 ? '¼' : Math.abs(frac - 0.5) < 0.01 ? '½' : Math.abs(frac - 0.75) < 0.01 ? '¾' : frac > 0.001 ? frac.toFixed(4).slice(1) : '';
		return `${d.months.length} ${d.months.length === 1 ? 'month' : 'months'}, ${whole}${q} days a year${frac > 0.001 ? ' on average' : ''}.`;
	}

	/** The dates in months that moved, and what each becomes to keep its month (one whose day the month no longer has is
	    left out: it can't keep its day). */
	private followed(dated: readonly Dated[], cal: Calendar): { file: TFile; date: StoryDate }[] {
		const months = this.def.months, out: { file: TFile; date: StoryDate }[] = [];
		if (!months) return out;
		for (const x of dated) {
			if (x.date.m == null) continue;
			const at = months.findIndex((m) => m.was === x.date.m) + 1;
			if (!at || at === x.date.m) continue;
			const date = { ...x.date, m: at };
			if (date.d != null && date.d > cal.daysIn(date.y, at)) continue;
			out.push({ file: x.file, date });
		}
		return out;
	}

	/** Under the form: how a date is typed and written now, and what saving does to the book's dates. */
	private say(): void {
		const el = this.about, cal = this.cal, was = this.plugin.binders.calendarOf(this.binder);
		el.empty();
		const sample = exampleDates(cal).split(', ')[0], d = parseStoryDate(sample, cal);
		const line = el.createDiv({ cls: 'binders-calendar-example' });
		line.createSpan({ text: 'Typed ' });
		line.createEl('strong', { text: sample });
		if (d) { line.createSpan({ text: ', written ' }); line.createEl('code', { text: String(writeStoryDate(d)) }); }
		const dated = this.dated(), follow = this.followed(dated, cal), following = new Set(follow.map((x) => x.file));
		const gone = dated.filter((x) => !readStoryDate(x.raw, cal) && !(this.follow && following.has(x.file)));
		const differ = dated.filter((x) => { const n = readStoryDate(x.raw, cal); return n && showStoryDate(n, cal) !== showStoryDate(x.date, was); });
		if (!dated.length) return;
		const parts = [`${dated.length} ${dated.length === 1 ? 'note has a story date' : 'notes have story dates'}.`];
		if (follow.length && this.follow) parts.push(`${follow.length === 1 ? 'One is' : `${follow.length} are`} in ${follow.length === 1 ? 'a month' : 'months'} that moved, and ${follow.length === 1 ? 'is' : 'are'} written to keep ${follow.length === 1 ? 'its month' : 'their months'}. No other date is rewritten.`);
		else {
			parts.push('None is rewritten.');
			const reads = differ.filter((x) => readStoryDate(x.raw, cal));
			if (reads.length) parts.push(`${reads.length} would read differently (${showStoryDate(reads[0].date, was)} would be ${showStoryDate(readStoryDate(reads[0].raw, cal) ?? reads[0].date, cal)}).`);
		}
		if (gone.length) {
			const names = gone.slice(0, 2).map((x) => `“${shownName(x.file)}”`).join(' and ') + (gone.length > 2 ? ` and ${gone.length - 2} more` : '');
			parts.push(`${names} would have ${gone.length === 1 ? 'a date' : 'dates'} this calendar hasn’t got (${showStoryDate(gone[0].date, was)}): ${gone.length === 1 ? 'it would wait' : 'they would wait'} in the timeline’s tray, as written, until dated again.`);
		}
		el.createDiv({ cls: 'binders-calendar-dates' + (gone.length ? ' mod-warning' : ''), text: parts.join(' ') });
		// (moved months: the writer may have the dates in them go along; off until ticked, as "Don't ask again" is)
		if (follow.length) {
			const box = el.createEl('label', { cls: 'mod-checkbox binders-calendar-follow' });
			const tick = box.createEl('input', { type: 'checkbox', attr: { tabindex: '0' } });
			tick.checked = this.follow;
			box.appendText(`Move their dates with their months (${follow.length} ${follow.length === 1 ? 'note' : 'notes'})`);
			tick.addEventListener('change', () => { this.follow = tick.checked; this.say(); el.querySelector<HTMLInputElement>('.binders-calendar-follow input')?.focus(); });
		}
	}

	/** The binder's notes with a story date (its scenes and its folders' notes), as the calendar now reads them. */
	private dated(): Dated[] {
		const store = this.plugin.binders, was = store.calendarOf(this.binder), key = this.plugin.settings.storyDateProp, out: Dated[] = [];
		const snaps = store.snapshotsFolder(this.binder)?.path, root = this.binder.folder.path + '/';
		for (const f of this.app.vault.getMarkdownFiles()) {
			if (!f.path.startsWith(root) || f === this.binder.note || (snaps && f.path.startsWith(snaps + '/'))) continue;
			const raw: unknown = this.app.metadataCache.getFileCache(f)?.frontmatter?.[key], date = readStoryDate(raw, was);
			if (date) out.push({ file: f, raw, date });
		}
		return out;
	}

	private async save(): Promise<void> {
		try {
			if (this.binder.problem) throw new Error('This binder was made by a newer version of Binders: it is read only.');
			const def = this.def;
			if (def.months?.some((m) => !m.name)) throw new Error('Every month needs a name.');
			if (new Set(def.months?.map((m) => m.name.toLowerCase())).size !== (def.months?.length ?? 0)) throw new Error('Two months have the same name.');
			if (def.eras.some((e) => !e.name)) throw new Error('Every era needs a name.');
			if (def.eras.some((e, i) => i > 0 && e.from == null)) throw new Error('Every era after the first needs its first year.');
			const { calendar, eras } = writeCalendarDef(def), key = this.plugin.settings.storyDateProp;
			const writes: { note: TFile; patch: Record<string, unknown> }[] = [{ note: this.binder.note, patch: { calendar, eras } }];
			// (the dates that keep their months: written in the same step, so Undo takes the calendar and them back together)
			if (this.follow) for (const x of this.followed(this.dated(), this.cal)) writes.push({ note: x.file, patch: { [key]: writeStoryDate(x.date) } });
			await this.plugin.binders.setByHand(writes.length > 1 ? `Change the calendar and ${writes.length - 1} story ${writes.length === 2 ? 'date' : 'dates'}` : 'Change the calendar', writes, { calendar: 'the calendar', eras: 'the eras', [key]: 'story date' });
			new Notice('The calendar was saved.', 2500);
			this.saved();
		} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
	}
}
