import { Menu, Platform, setIcon } from 'obsidian';
import { COMPILE_PROP, EXPORT_PROP } from '../scenes';
import { ask } from './modals';
import type { ModeContext } from './mode';
import { BUILT_IN, MIN_WIDTH, TITLE, builtIn, clampWidth, columnName, move, nextSort, propId, propOf, suggestProps, type ColumnSpec, type Sort } from './outliner-data';

/* The outliner's columns, as its header has them: a header's click (sort), its menu (sort, move, hide), its keys, its
   edge (resize) and the header itself dragged (reorder); and which columns show ("+", and "Columns" in the view's
   menu). The outliner (outliner.ts) draws the rows under them and keeps what's chosen: this asks it through
   `ColumnsHost`, and knows nothing of rows, selection or cells. */

/** What the columns ask of the outliner. */
export interface ColumnsHost {
	ctx: ModeContext;
	/** The outliner (what scrolls), its table, and the header row the columns are drawn in. */
	root: HTMLElement;
	table: HTMLElement;
	head: HTMLElement;
	/** The columns that show, in order; and new ones, which the outliner keeps and draws. */
	columns(): ColumnSpec[];
	setColumns(cols: ColumnSpec[]): void;
	sort(): Sort;
	setSort(sort: Sort): void;
	/** "Make this the binder order": whether it can be, and doing it. */
	canKeepSort(): boolean;
	keepSort(): Promise<void>;
	synopses(): boolean;
	toggleSynopses(): void;
	/** A column's width as it shows (a phone has its own), and whether it shows as its icon alone. */
	widthOf(c: ColumnSpec): number;
	compact(c: ColumnSpec): boolean;
}

/** A menu under what it belongs to (or, for a right-click, at the pointer). */
export function showUnder(menu: Menu, el: HTMLElement, e?: MouseEvent): void {
	if (e && e.type === 'contextmenu') { menu.showAtMouseEvent(e); return; }
	const r = el.getBoundingClientRect();
	// (a cell that runs off the bottom of the window: Obsidian puts a menu with no room below above the point it's
	// given, so the point stays in the window, and the menu with it)
	menu.showAtPosition({ x: r.left, y: Math.min(r.bottom + 2, el.doc.body.clientHeight - 4), width: r.width, overlap: true }, el.doc);
}

/** The outliner's header: each column's menu, sorting, resizing and reordering, and which columns show. It asks the
    outliner only through `ColumnsHost`. */
export class OutlinerColumns {
	/** Ends a press on a header that's still on (a drag, a resize): set while there is one. */
	private stop: (() => void) | null = null;
	/** A header was just dragged: the click that ends the drag isn't a click on it. */
	private headerDragged = false;

	constructor(private h: ColumnsHost) {}

	/** The outliner is going: a header drag under way ends, with nothing changed. */
	destroy(): void { this.stop?.(); }

	/** Draws the header again: a cell for the title and one for each column, then “+”. */
	draw(cols: ColumnSpec[], sort: Sort): void {
		// the header the keyboard is on keeps it: every header is made again, and a sort, a column shown or hidden
		// (its own menu, the “+”, a click) would otherwise leave the keyboard nowhere
		const active = this.h.head.doc.activeElement, was = active?.instanceOf(HTMLElement) && this.h.head.contains(active) ? active.closest<HTMLElement>('.binders-outliner-th') : null;
		const wasAt = was ? Array.from(this.h.head.children).indexOf(was) : -1, wasCol = was?.dataset.col;
		this.h.head.empty();
		const th = (id: string, i: number): HTMLElement => {
			const el = this.h.head.createDiv({ cls: 'binders-outliner-th', attr: { role: 'columnheader', 'data-col': id, tabindex: id === TITLE ? '0' : '-1', 'aria-haspopup': 'menu', 'aria-label': columnName(id) } });
			if (id === TITLE) el.addClass('mod-title'); else el.setCssStyles({ width: `var(--binders-ol-c${i})` });
			if (builtIn(id)?.numeric) el.addClass('mod-numeric');
			if (i >= 0 && cols[i] && this.h.compact(cols[i])) { el.addClass('mod-compact'); setIcon(el.createSpan({ cls: 'binders-outliner-th-icon' }), 'palette'); }
			el.createSpan({ cls: 'binders-outliner-th-name', text: columnName(id) });
			const on = sort?.id === id;
			el.setAttr('aria-sort', on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
			if (on) setIcon(el.createSpan({ cls: 'binders-outliner-th-sort', attr: { 'aria-hidden': 'true' } }), sort.dir === 1 ? 'arrow-up' : 'arrow-down');
			if (id !== TITLE) {
				const grip = el.createDiv({ cls: 'binders-outliner-resizer', attr: { 'aria-hidden': 'true' } });
				grip.addEventListener('pointerdown', (e) => this.resize(e, id, i));
				grip.addEventListener('dblclick', (e) => { e.stopPropagation(); this.h.setColumns(this.h.columns().map((c) => (c.id === id ? { id } : c))); });
				grip.addEventListener('click', (e) => e.stopPropagation());
				el.addEventListener('pointerdown', (e) => this.dragColumn(e, id, el));
			}
			// a click sorts, as in a base: ascending, descending, then binder order again; the menu is a right-click (or
			// Enter) away. With no right-click to give (a phone), a tap opens the menu.
			el.addEventListener('click', (e) => { e.stopPropagation(); if (this.headerDragged) return; if (Platform.isMobile) this.columnMenu(id, el); else this.h.setSort(nextSort(this.h.sort(), id)); });
			el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.columnMenu(id, el, e); });
			el.addEventListener('keydown', (e) => this.onHeadKey(e, id, el));
			return el;
		};
		th(TITLE, -1);
		cols.forEach((c, i) => th(c.id, i));
		const add = this.h.head.createDiv({ cls: 'binders-outliner-th mod-add clickable-icon', attr: { role: 'button', tabindex: '0', 'aria-label': 'Columns', 'aria-haspopup': 'menu' } });
		setIcon(add, 'plus');
		const show = (e?: MouseEvent) => { const m = new Menu(); this.items(m); showUnder(m, add, e); };
		add.addEventListener('click', () => show());
		add.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); show(); } });
		if (!was) return;
		// (a column that has gone hands over to the header now in its place, the last of them, the “+”)
		const ths = Array.from(this.h.head.children).filter((x): x is HTMLElement => x.instanceOf(HTMLElement));
		const to = was.hasClass('mod-add') ? add : ths.find((x) => x.dataset.col === wasCol) ?? ths[Math.min(wasAt, ths.length - 1)] ?? add;
		if (to !== add) for (const x of ths) if (x.dataset.col) x.setAttr('tabindex', x === to ? '0' : '-1');
		to.focus({ preventScroll: true });
	}

	private onHeadKey(e: KeyboardEvent, id: string, el: HTMLElement): void {
		const ths = [...this.h.head.querySelectorAll<HTMLElement>('.binders-outliner-th[data-col]')], i = ths.indexOf(el);
		if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.columnMenu(id, el); return; }
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault(); e.stopPropagation();
		const d = (e.key === 'ArrowLeft') === (getComputedStyle(this.h.head).direction !== 'rtl') ? -1 : 1;
		if (e.altKey) { this.moveColumn(id, d); return; }
		const to = ths[i + d];
		if (!to) return;
		el.setAttr('tabindex', '-1');
		to.setAttr('tabindex', '0');
		to.focus();
	}

	private columnMenu(id: string, el: HTMLElement, e?: MouseEvent): void {
		const cols = this.h.columns(), i = cols.findIndex((c) => c.id === id), sort = this.h.sort(), menu = new Menu();
		const on = (dir: 1 | -1) => sort?.id === id && sort.dir === dir;
		menu.addItem((it) => it.setSection('sort').setTitle('Sort ascending').setIcon('arrow-up-narrow-wide').setChecked(on(1)).onClick(() => this.h.setSort(on(1) ? null : { id, dir: 1 })));
		menu.addItem((it) => it.setSection('sort').setTitle('Sort descending').setIcon('arrow-down-wide-narrow').setChecked(on(-1)).onClick(() => this.h.setSort(on(-1) ? null : { id, dir: -1 })));
		if (sort) menu.addItem((it) => it.setSection('sort').setTitle('Binder order').setIcon('list-ordered').onClick(() => this.h.setSort(null)));
		if (this.h.canKeepSort()) menu.addItem((it) => it.setSection('sort').setTitle('Make this the binder order').setIcon('list-checks').onClick(() => void this.h.keepSort()));
		if (id !== TITLE) {
			if (i > 0) menu.addItem((it) => it.setSection('column').setTitle('Move left').setIcon('arrow-left').onClick(() => this.moveColumn(id, -1)));
			if (i < cols.length - 1) menu.addItem((it) => it.setSection('column').setTitle('Move right').setIcon('arrow-right').onClick(() => this.moveColumn(id, 1)));
			menu.addItem((it) => it.setSection('column').setTitle('Hide column').setIcon('eye-off').onClick(() => this.h.setColumns(cols.filter((c) => c.id !== id))));
		} else menu.addItem((it) => it.setSection('column').setTitle('Show synopses').setIcon('text').setChecked(this.h.synopses()).onClick(() => { this.h.toggleSynopses(); }));
		showUnder(menu, el, e);
	}

	private moveColumn(id: string, d: number): void {
		const cols = this.h.columns(), i = cols.findIndex((c) => c.id === id);
		if (i < 0 || i + d < 0 || i + d >= cols.length) return;
		this.h.setColumns(move(cols, i, i + d));
		this.h.head.querySelector<HTMLElement>(`.binders-outliner-th[data-col="${CSS.escape(id)}"]`)?.focus();
	}

	/** A column just added is brought into sight (in a narrow pane it's past the edge). */
	private showColumn(id: string): void {
		window.setTimeout(() => Array.from(this.h.head.querySelectorAll<HTMLElement>('[data-col]')).find((h) => h.dataset.col === id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 50);
	}

	/** Which columns show: Binders' own, then your notes' properties, each ticked when it's shown. */
	items(menu: Menu): void {
		const cols = this.h.columns(), has = (id: string) => cols.some((c) => c.id === id);
		const flip = (id: string) => { this.h.setColumns(has(id) ? cols.filter((c) => c.id !== id) : [...cols, { id }]); if (!has(id)) this.showColumn(id); };
		for (const b of BUILT_IN) menu.addItem((i) => i.setSection('built-in').setTitle(b.name).setIcon(b.icon).setChecked(has(b.id)).onClick(() => flip(b.id)));
		const s = this.h.ctx.plugin.settings, own = [s.synopsisProp, s.statusProp, s.labelProp, s.targetProp, s.notesProp, EXPORT_PROP, COMPILE_PROP, 'export-as', 'binder', 'contents', 'longform', 'aliases', 'cssclasses'];
		const shown = cols.map((c) => propOf(c.id)).filter((p): p is string => !!p);
		const found = suggestProps(this.h.ctx.store.scenes(this.h.ctx.binder.folder).map((f) => (this.h.ctx.app.metadataCache.getFileCache(f)?.frontmatter ?? {})), [...own, ...shown]);
		for (const p of [...shown, ...found.slice(0, 12)]) menu.addItem((i) => i.setSection('props').setTitle(p).setIcon('text').setChecked(has(propId(p))).onClick(() => flip(propId(p))));
		menu.addItem((i) => i.setSection('add').setTitle('Other property...').setIcon('plus').onClick(async () => {
			const name = await ask(this.h.ctx.app, { title: 'Add a column', placeholder: 'A property’s name, such as POV', cta: 'Add column', empty: 'A column needs a property’s name.' });
			if (!name) return;
			// (a property Binders has a column of its own for is that column, not a second one beside it; the synopsis
			// shows under the title)
			const mine: [string, string][] = [[s.statusProp, 'status'], [s.labelProp, 'label'], [s.targetProp, 'target'], [s.notesProp, 'notes'], [EXPORT_PROP, 'export'], [COMPILE_PROP, 'export']];
			const id = mine.find(([p]) => p.toLowerCase() === name.toLowerCase())?.[1] ?? propId(name);
			if (name.toLowerCase() === s.synopsisProp.toLowerCase()) { if (!this.h.synopses()) this.h.toggleSynopses(); return; }
			if (!has(id)) this.h.setColumns([...this.h.columns(), { id }]);
			this.showColumn(id);
		}));
	}

	/** Follows a press on a header: `move` once it has moved far enough to be a drag, then `end`. */
	private track(e: PointerEvent, h: { move(x: number): void; end(drop: boolean): void }): void {
		if (e.button !== 0) return;
		const doc = this.h.root.doc, id = e.pointerId, x0 = e.clientX;
		let on = false;
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== id) return;
			// (the button was let go where the page couldn't see it, another window in front: the drag is over, and
			// nothing is dropped; see `Press`)
			if (ev.pointerType !== 'touch' && ev.buttons === 0) { stop(false); return; }
			if (!on && Math.abs(ev.clientX - x0) < 4) return;
			if (!on) { on = true; this.headerDragged = true; doc.body.addClass('is-grabbing'); }
			ev.preventDefault();
			h.move(ev.clientX);
		};
		const stop = (drop: boolean) => {
			doc.removeEventListener('pointermove', move);
			doc.removeEventListener('pointerup', up);
			doc.removeEventListener('pointercancel', cancel);
			doc.removeEventListener('keydown', key, true);
			doc.body.removeClass('is-grabbing');
			this.stop = null;
			if (on) h.end(drop);
			// the click that ends a drag isn't a click on the header
			window.setTimeout(() => { this.headerDragged = false; }, 0);
		};
		const up = (ev: PointerEvent) => { if (ev.pointerId === id) stop(true); };
		const cancel = (ev: PointerEvent) => { if (ev.pointerId === id) stop(false); };
		const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && on) { ev.preventDefault(); ev.stopPropagation(); stop(false); } };
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
		doc.addEventListener('pointercancel', cancel);
		doc.addEventListener('keydown', key, true);
		this.stop = () => stop(false);
	}

	/** Dragging a header's edge makes its column wider or narrower, as it goes. */
	private resize(e: PointerEvent, id: string, i: number): void {
		e.stopPropagation();
		e.preventDefault();
		const cols = this.h.columns(), col = cols.find((c) => c.id === id);
		if (!col) return;
		const start = this.h.widthOf(col), x0 = e.clientX, rtl = getComputedStyle(this.h.head).direction === 'rtl';
		let w = start;
		this.h.root.addClass('is-resizing');
		this.track(e, {
			move: (x) => { w = clampWidth(start + (rtl ? x0 - x : x - x0), MIN_WIDTH); this.h.table.setCssProps({ [`--binders-ol-c${i}`]: `${w}px` }); },
			end: (drop) => {
				this.h.root.removeClass('is-resizing');
				if (drop && w !== start) this.h.setColumns(cols.map((c) => (c.id === id ? { id, width: w } : c)));
				else this.h.table.setCssProps({ [`--binders-ol-c${i}`]: `${start}px` });
			},
		});
		// a click on the edge without moving does nothing
		this.h.root.doc.addEventListener('pointerup', () => this.h.root.removeClass('is-resizing'), { once: true });
	}

	/** Dragging a header moves its column: a line shows where it will go. */
	private dragColumn(e: PointerEvent, id: string, el: HTMLElement): void {
		if ((e.target as HTMLElement).closest('.binders-outliner-resizer') || e.pointerType === 'touch') return;
		let to = -1, line: HTMLElement | null = null;
		const ths = () => this.h.columns().map((c) => this.h.head.querySelector<HTMLElement>(`.binders-outliner-th[data-col="${CSS.escape(c.id)}"]`));
		this.track(e, {
			move: (x) => {
				el.addClass('is-dragging');
				const cols = this.h.columns(), from = cols.findIndex((c) => c.id === id), rects = ths().map((t) => t?.getBoundingClientRect());
				const rtl = getComputedStyle(this.h.head).direction === 'rtl';
				to = rects.findIndex((r) => !!r && (rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2));
				if (to < 0) to = cols.length;
				line ??= this.h.root.doc.body.createDiv({ cls: 'binders-drop-indicator is-vertical' });
				const at = rects[Math.min(to, cols.length - 1)], view = this.h.root.getBoundingClientRect();
				const noop = to === from || to === from + 1;
				line.toggleClass('is-active', !!at && !noop);
				if (at) line.setCssStyles({ left: `${(to < cols.length ? (rtl ? at.right : at.left) : (rtl ? at.left : at.right)) - 1}px`, top: `${at.top}px`, height: `${Math.min(view.bottom, this.h.table.getBoundingClientRect().bottom) - at.top}px` });
			},
			end: (drop) => {
				el.removeClass('is-dragging');
				line?.remove();
				const cols = this.h.columns(), from = cols.findIndex((c) => c.id === id);
				if (drop && from >= 0 && to >= 0 && to !== from && to !== from + 1) this.h.setColumns(move(cols, from, to > from ? to - 1 : to));
			},
		});
	}
}
