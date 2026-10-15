import { Menu, Platform, setIcon } from 'obsidian';
import { uniqueName, type FilterEdit } from '../filter/saved';
import { MATCHES, OPERATORS, atom, emptyDef, linkOf, operatorOf, problem, same, textOf, valuesOf, type Atom, type Condition, type FilterDef, type Kind, type Match } from '../filter/conditions';
import { parseStoryDate, writeStoryDate } from '../time/date';
import { openPicker, pickerBusy, type PickItem } from './filter-picker';
import { labelDot, labelName, type LabelPreset } from './labels';
import type { Field, Subset } from './subset';

/* The Filter popover: the conditions of the view's filter, drawn with the classes of Obsidian's own Bases filter
   (`bases-toolbar-menu`, `filter-row`, `combobox-button`: docs/dev/design.md) on elements of our own. Under its button on
   a computer, a sheet on a phone: Bases' own rules do both. A change to a condition is the filter changed at once, as in
   Bases; a row not finished (no value yet) filters nothing. */

/** What the popover asks of the view it belongs to. */
export interface FilterHost {
	/** The toolbar's Filter button: where the popover opens, and whether it is still on the page. */
	button(): HTMLElement | undefined;
	subset: Subset;
	/** Puts a filter on (the view keeps it and draws again). */
	apply(filter: FilterDef): void;
	/** "8 of 20 notes". */
	count(): string;
	labels(): LabelPreset[];
	/** The binder's saved filters. */
	saved(): FilterDef[];
	/** Saves, renames, duplicates, deletes or moves a saved filter (the view writes the binder note and follows the change). */
	edit(label: string, op: FilterEdit): void;
	/** Why a filter can't be saved here (a Longform project, a newer format), in words, or null. */
	canSave(): string | null;
}

const WORD: Record<Match, string> = { all: 'and', any: 'or', none: 'nor' };

/** Menus opened from the popover (an operator's): while one is open, or has just shut, a press of Escape or a click is that
    menu's, not the popover's. */
const child = { open: 0, shut: 0 };
const menuBusy = (): boolean => child.open > 0 || Date.now() - child.shut < 150;
function below(menu: Menu, el: HTMLElement, then?: () => void): void {
	child.open++;
	menu.onHide(() => { child.open = Math.max(0, child.open - 1); child.shut = Date.now(); then?.(); });
	const r = el.getBoundingClientRect();
	menu.showAtPosition({ x: r.left, y: r.bottom + 2, width: r.width, overlap: true, left: false }, el.doc);
}

function combo(parent: HTMLElement, label: string, placeholder: string, icon: string | null, cls: string, aria: string): HTMLElement {
	const b = parent.createDiv({ cls: ['combobox-button', cls], attr: { tabindex: '0', role: 'button', 'aria-haspopup': 'listbox', 'aria-label': aria } });
	const ic = b.createDiv({ cls: 'combobox-button-icon' });
	if (icon) setIcon(ic, icon); else ic.hide();
	b.createDiv({ cls: 'combobox-button-label', text: label, attr: placeholder ? { placeholder } : {} });
	setIcon(b.createDiv({ cls: 'combobox-button-chevron' }), 'chevrons-up-down');
	b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
	return b;
}
function textButton(parent: HTMLElement, icon: string, label: string, cls = ''): HTMLElement {
	const b = parent.createDiv({ cls: ['text-icon-button', cls].filter(Boolean), attr: { role: 'button', tabindex: '0' } });
	setIcon(b.createSpan({ cls: 'text-button-icon' }), icon);
	b.createSpan({ cls: 'text-button-label', text: label });
	b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
	return b;
}

export class FilterPopover {
	private el: HTMLElement | null = null;
	private scroll: HTMLElement | null = null;
	private off: (() => void)[] = [];
	private pending: { fire(): void } | null = null;
	/** Naming a filter to save (in the foot), or renaming a saved one (its name, in the list). */
	private naming = false;
	private renaming: string | null = null;
	constructor(private host: FilterHost) {}

	get open(): boolean { return !!this.el?.isConnected; }
	/** (A popover taken out of the page from outside is shut as well, and the press opens a fresh one.) */
	toggle(): void { const was = this.open; if (this.el) this.close(); if (!was) this.show(); }

	/** `quiet`: the view is closing, so nothing is kept or tidied. */
	close(quiet = false): void {
		if (!quiet) this.pending?.fire();
		for (const f of this.off.splice(0)) f();
		this.naming = false;
		this.renaming = null;
		this.el?.remove();
		this.el = null;
		const button = this.host.button();
		button?.removeClass('has-active-menu');
		// (a row the writer began and left alone is not a condition: it goes, with nothing picked)
		const f = this.host.subset.def;
		if (!quiet && f.conditions.some((c) => !c.property)) this.host.apply({ ...f, conditions: f.conditions.filter((c) => c.property) });
		if (button?.isConnected) button.focus({ preventScroll: true });
	}

	show(): void {
		const button = this.host.button();
		if (!button) return;
		const doc = button.doc;
		const el = this.el = doc.body.createDiv({ cls: 'menu bases-toolbar-menu bases-toolbar-filter-menu binders-filter-menu', attr: { role: 'dialog', 'aria-label': 'Filter' } });
		el.createDiv({ cls: 'menu-grabber' });
		const head = el.createDiv({ cls: 'modal-header' });
		head.createDiv({ cls: 'modal-title', text: 'Filter' });
		const done = head.createDiv({ cls: 'modal-header-button tappable mod-raised clickable-icon', attr: { 'aria-label': 'Done', role: 'button', tabindex: '0' } });
		setIcon(done, 'check');
		done.addEventListener('click', () => this.close());
		this.scroll = el.createDiv({ cls: 'menu-scroll' });
		button.addClass('has-active-menu');
		// nothing yet: a row to begin with, so the first press goes to choosing what to filter by
		const f = this.host.subset.def;
		if (!f.conditions.length) this.host.apply({ ...f, conditions: [{ property: '', operator: 'is' }] });
		this.draw();
		if (!Platform.isPhone) this.place();
		// a press outside closes it; one in a list it opened (a property's, a value's) doesn't
		const down = (e: MouseEvent | TouchEvent) => { const t = e.target; if (!(t instanceof Node) || el.contains(t) || button.contains(t)) return; if (t.instanceOf(Element) && t.closest('.menu, .suggestion-container, .modal-container')) return; if (pickerBusy() || menuBusy()) return; this.close(); };
		const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pickerBusy() && !menuBusy()) { e.preventDefault(); e.stopPropagation(); if (this.naming || this.renaming != null) { this.naming = false; this.renaming = null; this.draw(); } else this.close(); } };
		doc.addEventListener('mousedown', down, true);
		doc.addEventListener('touchstart', down, true);
		doc.addEventListener('keydown', key, true);
		this.off.push(() => { doc.removeEventListener('mousedown', down, true); doc.removeEventListener('touchstart', down, true); doc.removeEventListener('keydown', key, true); });
		// the keyboard begins on the first thing to choose
		window.setTimeout(() => (this.scroll?.querySelector<HTMLElement>('.filter-property-select') ?? this.scroll?.querySelector<HTMLElement>('.binders-filter-add'))?.focus({ preventScroll: true }));
	}

	/** Under the button, its right edge on the button's, as a base's is. */
	private place(): void {
		const el = this.el, button = this.host.button();
		if (!el || !button) return;
		const doc = button.doc, r = button.getBoundingClientRect(), w = el.offsetWidth;
		el.setCssStyles({ left: `${Math.max(8, Math.min(r.right - w, doc.documentElement.clientWidth - w - 8))}px`, top: `${r.bottom + 4}px`, maxHeight: `${doc.documentElement.clientHeight - r.bottom - 12}px` });
	}

	/** The binder changed under it: drawn again, unless something in it is being typed in or picked from. */
	sync(): void {
		const el = this.el, a = el?.doc.activeElement;
		if (!el || (a && el.contains(a) && a.matches('input, select')) || pickerBusy() || menuBusy()) return;
		this.draw();
	}

	private fieldOf(id: string): Field {
		return this.host.subset.field(id) ?? { id, title: id.startsWith('file.') ? id.slice(5) : id, kind: this.host.subset.kindOf(id), icon: 'text', own: false, values: [] };
	}

	/** Draws it again, from the filter as it stands (and the keyboard stays where it was). */
	draw(): void {
		const box = this.scroll;
		if (!box) return;
		const had = box.doc.activeElement, mark = had?.instanceOf(HTMLElement) && box.contains(had) ? this.markOf(had) : null;
		const top = box.scrollTop;
		box.empty();
		const host = this.host, sub = host.subset, f = sub.def;
		const saved = host.saved();
		if (saved.length) this.savedList(box, saved, f);
		const sec = box.createDiv({ cls: 'bases-toolbar-section' });
		sec.createDiv({ cls: 'bases-toolbar-section-header' }).createSpan({ text: f.name ?? (saved.length ? 'Not saved' : 'Show notes where') });
		const content = sec.createDiv({ cls: 'bases-toolbar-section-content' });
		const group = content.createDiv({ cls: 'bases-query-container' }).createDiv({ cls: 'filter-group' });
		const set = (next: FilterDef, redraw = true) => { host.apply(next); if (redraw) this.draw(); };
		if (f.conditions.length > 1) {
			const sel = group.createDiv({ cls: 'filter-group-header' }).createEl('select', { cls: 'conjunction dropdown', attr: { 'aria-label': 'How the conditions combine' } });
			for (const m of MATCHES) sel.createEl('option', { value: m.id, text: m.title });
			sel.value = f.match;
			sel.addEventListener('change', () => set({ ...sub.def, match: sel.value as Match }));
		}
		const rows = group.createDiv({ cls: 'filter-group-statements' });
		f.conditions.forEach((c, i) => this.row(rows, c, i));
		const actions = group.createDiv({ cls: 'filter-group-actions' });
		const add = textButton(actions, 'plus', 'Add filter');
		add.addClass('binders-filter-add');
		add.addEventListener('click', () => { set({ ...sub.def, conditions: [...sub.def.conditions, { property: '', operator: 'is' }] }); this.scroll?.querySelectorAll<HTMLElement>('.filter-property-select')[sub.def.conditions.length - 1]?.focus(); });
		// ---- what it comes to ----
		const foot = box.createDiv({ cls: 'bases-toolbar-section binders-filter-foot' });
		if (this.naming) this.nameField(foot, saved);
		else {
			const said = foot.createDiv({ cls: 'binders-filter-said', text: sub.on() ? host.count() : 'Nothing is filtered' });
			said.setAttrs({ role: 'status', 'aria-live': 'polite' });
			if (!f.name && sub.on()) {
				const cant = host.canSave(), b = textButton(foot, 'bookmark-plus', 'Save as…');
				if (cant) { b.addClass('is-disabled'); b.setAttrs({ 'aria-label': cant, 'aria-disabled': 'true', title: cant }); }
				else b.addEventListener('click', () => { this.pending?.fire(); this.naming = true; this.draw(); });
			}
			if (sub.on() || f.conditions.length) textButton(foot, 'x', f.name ? 'Show all notes' : 'Clear filter', 'binders-filter-clear').addEventListener('click', () => { this.pending?.fire(); host.apply(emptyDef()); this.close(); });
		}
		box.scrollTop = top;
		if (mark) this.refocus(mark);
		if (!Platform.isPhone && this.el) window.requestAnimationFrame(() => this.place());
	}

	/** The saved filters: a tick on the one that is on, "More options" for each. Choosing one puts it on; the one on, taken off
	    its tick, goes off. */
	private savedList(box: HTMLElement, saved: FilterDef[], f: FilterDef): void {
		const host = this.host;
		const sec = box.createDiv({ cls: 'bases-toolbar-section' });
		const h = sec.createDiv({ cls: 'bases-toolbar-section-header' });
		h.createSpan({ text: 'Saved filters' });
		h.createSpan({ cls: 'flair', text: String(saved.length) });
		const items = sec.createDiv({ cls: 'bases-toolbar-items' }).createDiv({ cls: 'suggestion-group' });
		for (const s of saved) {
			const on = !!f.name && f.name.toLowerCase() === (s.name ?? '').toLowerCase(), name = s.name ?? '';
			const row = items.createDiv({ cls: 'bases-toolbar-menu-item' + (on ? ' mod-active' : ''), attr: { role: 'button', tabindex: '0', 'aria-pressed': String(on) } });
			const info = row.createDiv({ cls: 'bases-toolbar-menu-item-info' });
			const tick = info.createDiv({ cls: 'bases-toolbar-menu-item-info-icon binders-filter-tick' });
			if (on) setIcon(tick, 'check');
			if (this.renaming === name) {
				const input = info.createEl('input', { type: 'text', cls: 'binders-filter-name', value: name, attr: { 'aria-label': 'Name of the filter' } });
				let done = false;
				const commit = () => {
					if (done) return;
					done = true;
					const now = input.value.trim();
					this.renaming = null;
					if (now && now !== name && !saved.some((x) => x !== s && (x.name ?? '').toLowerCase() === now.toLowerCase())) host.edit(`Rename the filter “${name}” to “${now}”`, { kind: 'rename', name, to: now });
					this.draw();
				};
				input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
				input.addEventListener('blur', commit);
				window.setTimeout(() => { input.focus(); input.select(); });
			} else {
				info.createDiv({ cls: 'bases-toolbar-menu-item-name', text: name });
				const choose = () => { this.pending?.fire(); host.apply(on ? emptyDef() : { ...s, conditions: s.conditions.map((c) => ({ ...c })) }); if (on) this.draw(); else this.close(); };
				row.addEventListener('click', choose);
				row.addEventListener('keydown', (e) => { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(); } });
			}
			const more = row.createDiv({ cls: 'clickable-icon bases-toolbar-menu-action-icon', attr: { 'aria-label': `More options for ${name}`, role: 'button', tabindex: '0' } });
			setIcon(more, 'more-horizontal');
			const menu = (e: Event) => {
				e.stopPropagation();
				const m = new Menu(), at = saved.indexOf(s);
				m.addItem((i) => i.setTitle('Rename').setIcon('pencil').onClick(() => { this.renaming = name; this.draw(); }));
				m.addItem((i) => i.setTitle('Duplicate').setIcon('copy').onClick(() => { host.edit(`Duplicate the filter “${name}”`, { kind: 'duplicate', name, to: uniqueName(name, saved.map((x) => x.name ?? '')) }); this.draw(); }));
				if (at > 0) m.addItem((i) => i.setTitle('Move up').setIcon('arrow-up').onClick(() => { host.edit(`Move the filter “${name}” up`, { kind: 'move', name, by: -1 }); this.draw(); }));
				if (at < saved.length - 1) m.addItem((i) => i.setTitle('Move down').setIcon('arrow-down').onClick(() => { host.edit(`Move the filter “${name}” down`, { kind: 'move', name, by: 1 }); this.draw(); }));
				m.addSeparator();
				m.addItem((i) => { i.setTitle('Delete').setIcon('trash-2').onClick(() => { host.edit(`Delete the filter “${name}”`, { kind: 'delete', name }); this.draw(); }); (i as unknown as { setWarning?: (w: boolean) => void }).setWarning?.(true); });
				below(m, more);
			};
			more.addEventListener('click', menu);
			more.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu(e); } });
		}
	}

	/** The name to save the filter under, in the foot. */
	private nameField(foot: HTMLElement, saved: FilterDef[]): void {
		const host = this.host;
		const input = foot.createEl('input', { type: 'text', cls: 'binders-filter-name', placeholder: 'Name', attr: { 'aria-label': 'Name of the filter' } });
		const save = foot.createEl('button', { cls: 'mod-cta', text: 'Save' });
		const commit = () => {
			const name = input.value.trim();
			if (!name) { input.focus(); return; }
			if (saved.some((x) => (x.name ?? '').toLowerCase() === name.toLowerCase())) {
				input.addClass('mod-error');
				input.setAttr('aria-invalid', 'true');
				foot.querySelector('.binders-filter-said')?.remove();
				foot.createDiv({ cls: 'binders-filter-said mod-error', text: 'There is a filter of that name', attr: { role: 'alert' } });
				return;
			}
			this.naming = false;
			const def = { ...host.subset.def, name };
			host.edit(`Save the filter “${name}”`, { kind: 'save', def });
			host.apply(def);
			this.draw();
		};
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
		save.addEventListener('click', commit);
		window.setTimeout(() => input.focus());
	}

	/** Which control had the keyboard, to give it back after a redraw. */
	private markOf(el: HTMLElement): string | null {
		const row = el.closest('.filter-row'), rows = [...(this.scroll?.querySelectorAll('.filter-row') ?? [])];
		const kind = ['filter-property-select', 'filter-operator', 'binders-filter-values', 'metadata-input', 'dropdown', 'binders-filter-add'].find((c) => el.classList.contains(c));
		return kind ? `${kind}:${row ? rows.indexOf(row) : -1}` : null;
	}
	private refocus(mark: string): void {
		const [kind, n] = [mark.split(':')[0], Number(mark.split(':')[1])];
		const root = n >= 0 ? this.scroll?.querySelectorAll('.filter-row')[n] : this.scroll;
		root?.querySelector<HTMLElement>(`.${kind}`)?.focus({ preventScroll: true });
	}

	private row(rows: HTMLElement, c: Condition, i: number): void {
		const host = this.host, sub = host.subset, f = sub.def;
		const known = !!c.property && !!sub.field(c.property);
		const field = c.property ? this.fieldOf(c.property) : null, kind: Kind = field?.kind ?? 'text';
		const op = operatorOf(kind, c.operator) ?? OPERATORS[kind][0];
		const change = (patch: Partial<Condition>, redraw = true) => {
			const now = sub.def;
			host.apply({ ...now, conditions: now.conditions.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
			if (redraw) this.draw();
		};
		const row = rows.createDiv({ cls: 'filter-row' });
		row.createSpan({ cls: 'conjunction', text: i ? WORD[f.match] : f.match === 'none' ? 'not' : 'where' });
		const st = row.createDiv({ cls: 'filter-statement' });
		const ex = st.createDiv({ cls: 'filter-expression metadata-property' + (c.property && !known ? ' mod-error' : '') });
		const lhs = ex.createDiv({ cls: 'filter-lhs-container' });
		const pb = combo(lhs, field?.title ?? '', 'Property', field?.icon ?? null, 'filter-property-select', `Property of condition ${i + 1}`);
		pb.addEventListener('click', () => {
			const fields = sub.fields();
			const items: PickItem[] = fields.map((x, n) => ({ id: x.id, title: x.title, icon: x.icon, checked: x.id === c.property, apart: n > 0 && (fields[n - 1].own !== x.own || x.id === 'file.words') }));
			openPicker(pb, {
				multi: false, placeholder: 'Search properties', items: () => items,
				onPick: (it) => {
					const x = fields.find((y) => y.id === it.id);
					// (the same property again is no change: what is picked stays)
					if (!x || x.id === c.property) return;
					// (the operator stays if the new property has it: "is" of a status is "is" of a label)
					const keep = x.kind === kind ? operatorOf(x.kind, c.operator) : null;
					change(keep && c.property ? { property: x.id, value: undefined } : { property: x.id, operator: OPERATORS[x.kind][0].id, value: x.kind === 'checkbox' ? true : undefined });
					// (the property's box was drawn again: the keyboard goes back to its place)
					this.scroll?.querySelectorAll<HTMLElement>('.filter-property-select')[i]?.focus({ preventScroll: true });
				},
			});
		});
		if (field) {
			const ob = combo(ex, op.title, '', null, 'filter-operator', `Operator of condition ${i + 1}`);
			ob.addEventListener('click', () => {
				const menu = new Menu();
				for (const o of OPERATORS[kind]) menu.addItem((it) => it.setTitle(o.title).setChecked(o.id === op.id).onClick(() => change({ operator: o.id, ...(o.takes !== op.takes ? { value: undefined } : {}) })));
				below(menu, ob);
			});
			const rhs = ex.createDiv({ cls: 'filter-rhs-container metadata-property-value' });
			const why = st.createDiv({ cls: 'filter-row-error' });
			// (a value no note has is worth saying, and nothing is wrong: the filter is waiting for such a note)
			const gone = (now: Condition): string | null => {
				const o = operatorOf(kind, now.operator);
				if (!known || (kind !== 'text' && kind !== 'list') || o?.takes !== 2) return null;
				const missing = valuesOf(now).filter((v) => { const a = atom(v, sub.env); return a && !field.values.some((x) => { const b = atom(x.raw, sub.env); return b && same(a, b); }); }).map((v) => { const t = textOf(v); return `“${linkOf(t)?.shown ?? t}”`; });
				return missing.length ? `No note here has ${missing.join(' or ')} ${kind === 'list' ? 'in' : 'as'} its ${field.title.toLowerCase()}` : null;
			};
			const say = () => {
				const now = sub.def.conditions[i] ?? c, bad = !known ? `No note here has a “${c.property}” property` : problem(now, kind, sub.env.cal), text = bad ?? gone(now);
				why.setText(text ?? '');
				why.toggleClass('is-hidden', !text);
				ex.toggleClass('mod-error', !!bad);
				why.toggleClass('binders-filter-note', !bad);
			};
			if (op.takes) this.value(rhs, field, c, op.takes === 2, i, change, say);
			say();
		}
		const acts = ex.createDiv({ cls: 'filter-row-actions' });
		const del = acts.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': `Remove condition ${i + 1}` } });
		setIcon(del, 'trash-2');
		del.addEventListener('click', () => { this.pending?.fire(); const now = sub.def; host.apply({ ...now, conditions: now.conditions.filter((_, n) => n !== i) }); this.draw(); });
	}

	/** The control a value is given in: the values in use to tick, a number, a date, a checkbox, or text. */
	private value(rhs: HTMLElement, field: Field, c: Condition, several: boolean, index: number, change: (patch: Partial<Condition>, redraw?: boolean) => void, say: () => void): void {
		const vs = valuesOf(c);
		if (field.kind === 'checkbox') {
			const box = rhs.createEl('input', { type: 'checkbox', cls: 'metadata-input-checkbox', attr: { 'aria-label': field.title } });
			box.checked = vs[0] === true;
			box.addEventListener('change', () => { change({ value: box.checked }, false); say(); });
			return;
		}
		if (several) { this.values(rhs, field, c, index, change); return; }
		const kind = field.kind;
		const input = rhs.createEl('input', { cls: 'metadata-input metadata-input-text', type: kind === 'number' ? 'number' : 'text', attr: { 'aria-label': `${field.title} value`, placeholder: kind === 'date' ? 'A date, as 14 June 1987' : kind === 'number' ? 'A number' : 'Empty' } });
		input.value = vs[0] == null ? '' : textOf(vs[0]);
		// (typed: the page follows a moment after the last key, not at each one)
		let timer = 0;
		const value = (): unknown => (kind === 'number' ? (input.value.trim() === '' ? undefined : Number(input.value)) : input.value.trim() || undefined);
		const fire = () => { window.clearTimeout(timer); timer = 0; if (this.pending?.fire === fire) this.pending = null; change({ value: value() }, false); say(); };
		input.addEventListener('input', () => {
			window.clearTimeout(timer);
			this.pending = { fire };
			timer = window.setTimeout(fire, 250);
			// (the error follows the key at once; the page does after a moment)
			const probe = { ...c, value: value() };
			rhs.closest('.filter-statement')?.querySelector('.filter-row-error')?.setText(problem(probe, kind, this.host.subset.env.cal) ?? '');
		});
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fire(); } });
		input.addEventListener('blur', () => {
			if (timer) fire();
			// a date typed in words is kept as the date it is, in the shape a note keeps it
			if (kind === 'date' && input.value.trim()) { const d = parseStoryDate(input.value, this.host.subset.env.cal); if (d) { const w = writeStoryDate(d); input.value = String(w); change({ value: w }, false); say(); } }
		});
	}

	/** Several values, from a list of those in use (a link is the note it names), with a search field. */
	private values(rhs: HTMLElement, field: Field, c: Condition, index: number, change: (patch: Partial<Condition>, redraw?: boolean) => void): void {
		const host = this.host, sub = host.subset, env = sub.env;
		const labels = host.labels(), isLabel = field.id === sub.props.label;
		type Entry = { raw: string; shown: string; count: number; link: boolean; a: Atom | null };
		const now = (): Condition => sub.def.conditions[index] ?? c;
		const list = (): Entry[] => {
			// the values in use, and the ones the filter names though no note has them now (else they couldn't be taken off)
			const out: Entry[] = field.values.map((v) => ({ ...v, a: atom(v.raw, env) }));
			for (const v of valuesOf(now())) {
				const a = atom(v, env);
				if (a && !out.some((l) => l.a && same(l.a, a))) { const t = textOf(v); out.push({ raw: t, shown: linkOf(t)?.shown ?? t, count: 0, link: !!linkOf(t), a }); }
			}
			return out;
		};
		const has = (a: Atom | null): boolean => valuesOf(now()).some((v) => { const x = atom(v, env); return a && x ? same(a, x) : !a && !x; });
		const b = rhs.createDiv({ cls: 'combobox-button binders-filter-values', attr: { tabindex: '0', role: 'button', 'aria-haspopup': 'listbox', 'aria-label': `${field.title} values` } });
		const lab = b.createDiv({ cls: 'combobox-button-label', attr: { placeholder: 'Pick values' } });
		const draw = () => {
			lab.empty();
			const entries = list();
			valuesOf(now()).forEach((v, n) => {
				if (n) lab.appendText(', ');
				const a = atom(v, env), l = a ? entries.find((x) => x.a && same(x.a, a)) : null;
				if (!a) lab.createSpan({ cls: 'binders-filter-none', text: `No ${field.title.toLowerCase()}` });
				else if (l?.link) lab.createSpan({ cls: 'metadata-link-inner internal-link', text: l.shown });
				else if (isLabel) { labelDot(lab, l?.raw ?? textOf(v), labels); lab.appendText(labelName(l?.raw ?? textOf(v), labels)); }
				else lab.appendText(l?.shown ?? textOf(v));
			});
		};
		draw();
		setIcon(b.createDiv({ cls: 'combobox-button-chevron' }), 'chevrons-up-down');
		const flip = (raw: string, a: Atom | null) => {
			const cur = valuesOf(now()), at = cur.findIndex((v) => { const x = atom(v, env); return a && x ? same(a, x) : !a && !x; });
			const next = at >= 0 ? cur.filter((_, n) => n !== at) : [...cur, raw];
			change({ value: next.length ? next : undefined }, false);
		};
		b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
		b.addEventListener('click', () => {
			openPicker(b, {
				multi: true, placeholder: `Search ${field.title.toLowerCase()}`,
				items: () => {
					const items: PickItem[] = list().map((l) => ({
						id: l.raw, title: l.shown, count: l.count, checked: has(l.a),
						build: isLabel ? (el) => { labelDot(el, l.raw, labels); el.appendText(labelName(l.raw, labels)); } : l.link ? (el) => { el.createSpan({ cls: 'metadata-link-inner internal-link', text: l.shown }); } : undefined,
					}));
					// (a note with none of them: "No status", as the menu before this had it)
					if (field.kind === 'text') items.push({ id: '', title: `No ${field.title.toLowerCase()}`, checked: has(null), apart: true });
					return items;
				},
				// (text that is none of them: a value no note has yet, or a note not made yet, kept as typed)
				typed: (t) => (list().some((l) => l.shown.toLowerCase() === t.toLowerCase()) ? null : { id: t, title: `Use “${t}”` }),
				onPick: (it) => { const l = it.id ? list().find((x) => x.raw === it.id) : null; flip(it.id, l ? l.a : it.id ? atom(it.id, env) : null); draw(); },
				onClose: () => { window.setTimeout(() => { if (this.el) this.draw(); }); },
			});
		});
	}
}
