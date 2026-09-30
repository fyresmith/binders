import { ButtonComponent, Keymap, Menu, Modal, Notice, Setting, TFile, TFolder, requireApiVersion, setIcon, setTooltip, type App, type EventRef, type TAbstractFile } from 'obsidian';
import type { BinderMode, ModeContext, ModeFactory } from './mode';
import { COLORS, PLOT_TEXT, PLOTLINE_COLORS, PLOTLINES, move, nameProblem, readColors, readList, readPlotText, recolor, rename, toggle, type PlotColor } from './plotgrid-data';

/* The plot grid: the folder's scenes down the side (in binder order, under their subfolders), the binder's plotlines
   across the top. A cell says whether that plotline runs through that scene: the scene's `plotlines` property.

   The grid is a <table> with ARIA grid roles and one roving tab stop. It redraws from the vault on refresh(), keeping
   scroll and focus, and skips redrawing when nothing it shows changed. Writes show at once (see Pending), so fast clicks
   and keys build on each other rather than on a metadata cache that hasn't caught up yet. */

export const plotgrid: ModeFactory = (container, ctx) => new PlotGrid(container, ctx);

/** Keys for the header row and the columns that aren't plotlines, in a cell's `data-spot` ("row\tcolumn"). */
const HEAD = '\u0001head', TITLE = '\u0001title', ADD = '\u0001add';
const spotKey = (row: string, col: string) => row + '\t' + col;
const COLOR_NAMES: Record<PlotColor, string> = { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', cyan: 'Cyan', blue: 'Blue', purple: 'Purple', pink: 'Pink' };
const DRAG_START = 5; // px a pointer moves before a press becomes a drag
const EDGE = 40; // px from the grid's edge where dragging scrolls it

interface Row {
	item: TFile | TFolder;
	depth: number;
	/** Scenes: their plotlines, the ones with text (reserved `plot`), and the ones that aren't columns. */
	lines?: string[];
	text?: string[];
	other?: string[];
	/** Collapsed groups: how many of their scenes each plotline runs through. */
	counts?: number[];
}

class PlotGrid implements BinderMode {
	private root: HTMLElement;
	private table: HTMLTableElement | null = null;
	private empty: HTMLElement | null = null;
	private pending: Pending;
	private collapsed = new Set<string>();
	/** The cell that takes Tab, as a spot key, and the grid of spot keys ("" for none) for arrow keys. */
	private spot = '';
	private grid: string[][] = [];
	private els = new Map<string, HTMLElement>();
	private signature = '';
	/** Editing a name or dragging: redraws wait until it's done. */
	private busy = false;
	private stale = false;
	private finishEdit: (() => void) | null = null;
	private stopDrag: (() => void) | null = null;
	private swallowClick = false;
	private refs: EventRef[] = [];

	constructor(container: HTMLElement, private ctx: ModeContext) {
		this.root = container.createDiv({ cls: 'binders-plotgrid' });
		this.pending = new Pending((f, k) => this.cached(f, k), () => this.refresh());
		const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, capture = false) => this.root.addEventListener(type, fn, capture);
		on('click', (e) => { if (this.swallowClick) { e.preventDefault(); e.stopPropagation(); } }, true);
		on('click', (e) => this.onClick(e));
		on('auxclick', (e) => this.onAuxClick(e));
		on('contextmenu', (e) => this.onContextMenu(e));
		on('keydown', (e) => this.onKey(e));
		on('pointerdown', (e) => this.onPointerDown(e));
		on('focusin', (e) => { const s = (e.target as HTMLElement).closest<HTMLElement>('[data-spot]'); if (s) this.setSpot(s.dataset.spot); });
		// the cache catching up with a write: drop the value shown meanwhile
		this.refs.push(ctx.app.metadataCache.on('changed', (f) => { if (this.pending.has(f)) this.refresh(); }));
	}

	render(): void { this.draw(); }

	refresh(): void {
		if (this.busy) { this.stale = true; return; }
		this.stale = false;
		this.pending.sweep();
		this.draw();
	}

	focus(): void { this.els.get(this.spot)?.focus(); }

	unload(): void {
		this.finishEdit?.();
		this.stopDrag?.();
		this.pending.stop();
		for (const r of this.refs) this.ctx.app.metadataCache.offref(r);
		this.root.remove();
	}

	// ---- what the grid shows ----

	private get ro(): boolean { return this.ctx.readOnly || !!this.ctx.binder.problem; }

	private frontmatter(f: TFile): Record<string, unknown> { return this.ctx.app.metadataCache.getFileCache(f)?.frontmatter ?? {}; }

	/** A value as the metadata cache has it: the binder note's columns and colors, or a scene's plotlines. */
	private cached(f: TFile, key: string): unknown {
		if (f === this.ctx.binder.note) return key === PLOTLINES ? readList(this.frontmatter(f)[PLOTLINES]) : readColors(this.frontmatter(f)[PLOTLINE_COLORS]);
		return readList(this.ctx.props(f).plotlines);
	}

	private columns(): string[] { return this.pending.get(this.ctx.binder.note, PLOTLINES, () => this.cached(this.ctx.binder.note, PLOTLINES) as string[]); }
	private colors(): Record<string, PlotColor> { return this.pending.get(this.ctx.binder.note, PLOTLINE_COLORS, () => this.cached(this.ctx.binder.note, PLOTLINE_COLORS) as Record<string, PlotColor>); }
	private linesOf(f: TFile): string[] { return this.pending.get(f, PLOTLINES, () => this.cached(f, PLOTLINES) as string[]); }

	private rows(cols: string[]): Row[] {
		const out: Row[] = [], store = this.ctx.store;
		const walk = (folder: TFolder, depth: number) => {
			for (const c of store.orderedChildren(folder) ?? []) {
				if (c instanceof TFolder) {
					if (!this.collapsed.has(c.path)) { out.push({ item: c, depth }); walk(c, depth + 1); continue; }
					const scenes = store.scenes(c).map((f) => this.linesOf(f));
					out.push({ item: c, depth, counts: cols.map((p) => scenes.filter((l) => l.includes(p)).length) });
				} else if (c instanceof TFile && c.extension === 'md') {
					const lines = this.linesOf(c);
					out.push({ item: c, depth, lines, text: [...readPlotText(this.frontmatter(c)[PLOT_TEXT])], other: lines.filter((l) => !cols.includes(l)) });
				}
			}
		};
		walk(this.ctx.folder, 0);
		return out;
	}

	// ---- drawing ----

	/** Redraws if anything shown changed, keeping scroll (the scroller stays) and focus (by spot key). */
	private draw(force = false): void {
		const cols = this.columns(), colors = this.colors(), rows = this.rows(cols), ro = this.ro;
		const sig = JSON.stringify([cols, colors, ro, rows.map((r) => [r.item.path, r.depth, r.lines, r.text, r.counts])]);
		if (!force && sig === this.signature && this.table) return;
		this.signature = sig;
		const had = this.root.contains(this.root.doc.activeElement);
		this.els.clear();
		this.grid = [];

		const table = createEl('table', { cls: 'binders-plotgrid-table', attr: { role: 'grid', 'aria-label': 'Plot grid', 'aria-readonly': String(ro), 'aria-rowcount': String(rows.length + 1), 'aria-colcount': String(cols.length + 1) } });
		const head = table.createTHead().insertRow();
		head.addClass('binders-plotgrid-head');
		head.setAttr('role', 'row');
		const headKeys = [''];
		head.createEl('th', { cls: 'binders-plotgrid-corner', text: 'Scene', attr: { role: 'columnheader', scope: 'col' } });
		for (const name of cols) {
			const th = head.createEl('th', { cls: ['binders-plotgrid-col', colorClass(colors[name])], attr: { role: 'columnheader', scope: 'col', 'data-plotline': name } });
			if (!ro) th.setAttr('aria-haspopup', 'menu');
			const inner = th.createDiv({ cls: 'binders-plotgrid-col-inner' });
			inner.createSpan({ cls: 'binders-plotgrid-swatch' });
			inner.createSpan({ cls: 'binders-plotgrid-col-name', text: name });
			setTooltip(th, name, { placement: 'top' });
			headKeys.push(this.cell(th, HEAD, name));
		}
		if (!ro) {
			const th = head.createEl('th', { cls: 'binders-plotgrid-add', attr: { role: 'columnheader', 'aria-label': 'Add plotline' } });
			if (cols.length) setTooltip(th, 'Add plotline');
			setIcon(th.createDiv({ cls: 'binders-plotgrid-add-icon' }), 'plus');
			if (!cols.length) { th.addClass('mod-wide'); th.createSpan({ cls: 'binders-plotgrid-add-text', text: 'Add plotline' }); }
			headKeys.push(this.cell(th, HEAD, ADD));
		}
		this.grid.push(headKeys);

		const body = table.createTBody();
		for (const r of rows) {
			const tr = body.insertRow(), path = r.item.path, keys: string[] = [];
			tr.setAttrs({ role: 'row', 'data-path': path, 'aria-level': String(r.depth + 1) });
			const th = tr.createEl('th', { attr: { role: 'rowheader', scope: 'row' } });
			th.setCssProps({ '--binders-plotgrid-depth': String(r.depth) });
			if (r.item instanceof TFolder) {
				const open = !this.collapsed.has(path);
				tr.addClass('binders-plotgrid-group');
				th.addClass('binders-plotgrid-group-header');
				th.setAttr('aria-expanded', String(open));
				const inner = th.createDiv({ cls: 'binders-plotgrid-row-inner' });
				if (!ro) setIcon(inner.createDiv({ cls: 'binders-plotgrid-grip', attr: { 'aria-hidden': 'true' } }), 'grip-vertical');
				const chevron = inner.createDiv({ cls: ['binders-plotgrid-chevron', 'collapse-icon'] });
				chevron.toggleClass('is-collapsed', !open);
				setIcon(chevron, 'right-triangle');
				inner.createSpan({ cls: 'binders-plotgrid-group-name', text: r.item.name });
				keys.push(this.cell(th, path, TITLE));
				cols.forEach((name, i) => {
					const td = tr.createEl('td', { cls: ['binders-plotgrid-count', colorClass(colors[name])], attr: { role: 'gridcell', 'data-plotline': name } });
					if (r.counts?.[i]) td.createSpan({ text: String(r.counts[i]), attr: { 'aria-label': `${r.counts[i]} ${r.counts[i] === 1 ? 'scene' : 'scenes'}` } });
					keys.push('');
				});
			} else {
				tr.addClass('binders-plotgrid-row');
				const inner = th.createDiv({ cls: 'binders-plotgrid-row-inner' });
				if (!ro) setIcon(inner.createDiv({ cls: 'binders-plotgrid-grip', attr: { 'aria-hidden': 'true' } }), 'grip-vertical');
				const label = inner.createDiv({ cls: 'binders-plotgrid-label' });
				label.createSpan({ cls: 'binders-plotgrid-title', text: r.item.basename });
				if (r.other?.length) {
					const other = label.createDiv({ cls: 'binders-plotgrid-other', text: `Other: ${r.other.join(', ')}` });
					setTooltip(other, 'Plotlines this binder has no column for');
				}
				keys.push(this.cell(th, path, TITLE));
				for (const name of cols) {
					const on = !!r.lines?.includes(name);
					const td = tr.createEl('td', { cls: ['binders-plotgrid-cell', colorClass(colors[name])], attr: { role: 'gridcell', 'data-plotline': name, 'aria-selected': String(on) } });
					td.toggleClass('is-on', on);
					td.createDiv({ cls: 'binders-plotgrid-mark' });
					if (r.text?.includes(name)) td.createDiv({ cls: 'binders-plotgrid-text-dot', attr: { 'aria-label': 'Has notes' } });
					keys.push(this.cell(td, path, name));
				}
			}
			if (!ro) { tr.createEl('td', { cls: 'binders-plotgrid-filler', attr: { role: 'gridcell' } }); keys.push(''); }
			this.grid.push(keys);
		}

		if (this.table) this.table.replaceWith(table); else this.root.append(table);
		this.table = table;
		this.empty?.remove();
		this.empty = rows.length ? null : this.root.createDiv({ cls: 'binders-plotgrid-empty', text: 'No scenes in this folder yet.' });

		// keep the tab stop where it was, or the nearest cell in its row, or the first cell
		if (!this.els.has(this.spot)) {
			const row = this.spot.split('\t')[0];
			const keys = this.grid.find((k) => k.some((x) => x && x.startsWith(row + '\t'))) ?? this.grid[1] ?? this.grid[0];
			this.spot = keys.find((k, i) => k && (i > 0 || keys.length === 1)) ?? keys.find((k) => k) ?? '';
		}
		this.els.get(this.spot)?.setAttr('tabindex', '0');
		if (had) this.els.get(this.spot)?.focus({ preventScroll: true });
	}

	/** Makes an element a focusable grid cell; returns its spot key. */
	private cell(el: HTMLElement, row: string, col: string): string {
		const key = spotKey(row, col);
		el.setAttrs({ 'data-spot': key, tabindex: '-1' });
		this.els.set(key, el);
		return key;
	}

	private setSpot(key: string | undefined): void {
		if (!key || key === this.spot || !this.els.has(key)) return;
		this.els.get(this.spot)?.setAttr('tabindex', '-1');
		this.els.get(key).setAttr('tabindex', '0');
		this.spot = key;
	}

	private focusSpot(key: string): void {
		const el = this.els.get(key);
		if (!el) return;
		this.setSpot(key);
		el.focus({ preventScroll: true });
		el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	// ---- reading events ----

	private itemAt(path: string | undefined): TFile | TFolder | null {
		const f = path ? this.ctx.app.vault.getAbstractFileByPath(path) : null;
		return f instanceof TFile || f instanceof TFolder ? f : null;
	}

	private target(e: Event): { el: HTMLElement; row: string; col: string } | null {
		const el = (e.target as HTMLElement).closest<HTMLElement>('[data-spot]');
		if (!el || !this.root.contains(el) || (e.target as HTMLElement).closest('input')) return null;
		const [row, col] = el.dataset.spot.split('\t');
		return { el, row, col };
	}

	private onClick(e: MouseEvent): void {
		const t = this.target(e);
		if (!t) return;
		if (t.row === HEAD) {
			if (t.col === ADD) this.startAdd();
			else this.columnMenu(t.col, t.el);
			return;
		}
		const item = this.itemAt(t.row);
		if (item instanceof TFolder) this.setCollapsed(item, !this.collapsed.has(item.path));
		else if (item instanceof TFile && t.col === TITLE) { if ((e.target as HTMLElement).closest('.binders-plotgrid-label')) void this.ctx.openFile(item, !!Keymap.isModEvent(e)); }
		else if (item instanceof TFile) this.toggleCell(item, t.col);
	}

	private onAuxClick(e: MouseEvent): void {
		const t = this.target(e), item = t && this.itemAt(t.row);
		if (e.button === 1 && item instanceof TFile && (e.target as HTMLElement).closest('.binders-plotgrid-label')) { e.preventDefault(); void this.ctx.openFile(item, true); }
	}

	private onContextMenu(e: MouseEvent): void {
		const t = this.target(e);
		if (!t) return;
		e.preventDefault();
		if (t.row === HEAD) { if (t.col !== ADD) this.columnMenu(t.col, t.el, e); return; }
		const item = this.itemAt(t.row);
		if (item) this.itemMenu(item, e);
	}

	private onKey(e: KeyboardEvent): void {
		const t = this.target(e);
		if (!t || e.isComposing) return;
		const item = t.row === HEAD ? null : this.itemAt(t.row);
		const handled = () => { e.preventDefault(); e.stopPropagation(); };
		const r = this.grid.findIndex((k) => k.includes(this.spot)), c = r < 0 ? -1 : this.grid[r].indexOf(this.spot);
		const mod = e.ctrlKey || e.metaKey;
		switch (e.key) {
			case 'ArrowUp': case 'ArrowDown': {
				const d = e.key === 'ArrowUp' ? -1 : 1;
				if (e.altKey) { if (item && !this.ro) { handled(); void this.step(item, d); } return; }
				handled();
				for (let i = r + d; i >= 0 && i < this.grid.length; i += d) if (this.grid[i][c]) { this.focusSpot(this.grid[i][c]); break; }
				return;
			}
			case 'ArrowLeft': case 'ArrowRight': {
				const d = e.key === 'ArrowLeft' ? -1 : 1;
				if (e.altKey) { if (t.row === HEAD && t.col !== ADD && !this.ro) { handled(); this.moveColumn(t.col, d); } return; }
				handled();
				if (item instanceof TFolder && this.collapsed.has(item.path) === (d > 0)) { this.setCollapsed(item, d < 0); return; }
				for (let j = c + d; j >= 0 && j < this.grid[r].length; j += d) if (this.grid[r][j]) { this.focusSpot(this.grid[r][j]); break; }
				return;
			}
			case 'Home': case 'End': {
				handled();
				const rows = mod ? (e.key === 'Home' ? this.grid : [...this.grid].reverse()) : [this.grid[r]];
				for (const keys of rows) {
					const k = (e.key === 'Home' ? keys : [...keys].reverse()).find((x) => x);
					if (k) { this.focusSpot(k); break; }
				}
				return;
			}
			case 'Enter': case ' ': {
				if (e.repeat) { handled(); return; }
				handled();
				if (t.row === HEAD) { if (t.col === ADD) this.startAdd(); else this.columnMenu(t.col, t.el); }
				else if (item instanceof TFolder) this.setCollapsed(item, !this.collapsed.has(item.path));
				else if (item instanceof TFile && t.col === TITLE) void this.ctx.openFile(item, !!Keymap.isModEvent(e));
				else if (item instanceof TFile) this.toggleCell(item, t.col);
				return;
			}
			case 'F2': if (t.row === HEAD && t.col !== ADD && !this.ro) { handled(); this.startRename(t.col); } return;
			case 'Delete': case 'Backspace': if (t.row === HEAD && t.col !== ADD && !this.ro) { handled(); this.confirmDelete(t.col); } return;
			case 'ContextMenu': case 'F10': {
				if (e.key === 'F10' && !e.shiftKey) return;
				handled();
				if (t.row === HEAD) { if (t.col !== ADD) this.columnMenu(t.col, t.el); }
				else if (item) this.itemMenu(item, null, t.el);
				return;
			}
		}
	}

	// ---- scenes and groups ----

	private setCollapsed(folder: TFolder, collapsed: boolean): void {
		if (collapsed) this.collapsed.add(folder.path); else this.collapsed.delete(folder.path);
		this.draw();
		this.focusSpot(spotKey(folder.path, TITLE));
	}

	private toggleCell(file: TFile, name: string): void {
		if (this.ro) return;
		void this.writeScene(file, toggle(this.linesOf(file), name));
	}

	private itemMenu(item: TFile | TFolder, e: MouseEvent | null, el?: HTMLElement): void {
		const menu = new Menu();
		if (item instanceof TFile) {
			menu.addItem((i) => i.setTitle('Open in new tab').setIcon('file-plus').onClick(() => void this.ctx.openFile(item, true)));
		} else {
			menu.addItem((i) => i.setTitle('Open folder').setIcon('folder-open').onClick(() => this.ctx.navigate(item)));
		}
		this.ctx.app.workspace.trigger('file-menu', menu, item, 'binders-plotgrid');
		if (e) menu.showAtMouseEvent(e);
		else if (el) { const b = el.getBoundingClientRect(); menu.showAtPosition({ x: b.left, y: b.bottom }, this.root.doc); }
	}

	/** Alt+up/down: one step within its folder. */
	private async step(item: TFile | TFolder, d: number): Promise<void> {
		await this.tell(d < 0 ? this.ctx.store.moveUp(item) : this.ctx.store.moveDown(item));
		this.focusSpot(spotKey(item.path, TITLE));
	}

	private async moveItem(item: TFile | TFolder, folder: TFolder, index: number): Promise<void> {
		await this.tell(this.ctx.store.move(item, folder, index));
		this.setSpot(spotKey(item.path, TITLE)); // its path after a move to another folder
	}

	// ---- plotlines ----

	private columnMenu(name: string, el: HTMLElement, e?: MouseEvent): void {
		if (this.ro) return;
		const cols = this.columns(), i = cols.indexOf(name);
		const menu = new Menu();
		menu.addItem((it) => it.setTitle('Rename').setIcon('pencil').onClick(() => this.startRename(name)));
		menu.addItem((it) => it.setTitle('Color').setIcon('palette').onClick(() => this.colorMenu(name)));
		if (i > 0) menu.addItem((it) => it.setTitle('Move left').setIcon('arrow-left').onClick(() => this.moveColumn(name, -1)));
		if (i < cols.length - 1) menu.addItem((it) => it.setTitle('Move right').setIcon('arrow-right').onClick(() => this.moveColumn(name, 1)));
		menu.addSeparator();
		menu.addItem((it) => it.setTitle('Delete').setIcon('trash-2').setWarning(true).onClick(() => this.confirmDelete(name)));
		this.showMenu(menu, el, e);
	}

	private colorMenu(name: string): void {
		const el = this.els.get(spotKey(HEAD, name));
		if (!el) return;
		const cur = this.colors()[name];
		const menu = new Menu();
		menu.addItem((it) => it.setTitle('No color').setChecked(!cur).onClick(() => void this.setColor(name, null)));
		for (const c of COLORS) {
			const title = createFragment((f) => { f.createSpan({ cls: ['binders-plotgrid-swatch', 'binders-plotgrid-menu-swatch', colorClass(c)] }); f.appendText(COLOR_NAMES[c]); });
			menu.addItem((it) => it.setTitle(title).setChecked(cur === c).onClick(() => void this.setColor(name, c)));
		}
		this.showMenu(menu, el);
	}

	private showMenu(menu: Menu, el: HTMLElement, e?: MouseEvent): void {
		if (e && e.type === 'contextmenu') { menu.showAtMouseEvent(e); return; }
		const b = el.getBoundingClientRect();
		menu.showAtPosition({ x: b.left, y: b.bottom }, this.root.doc);
		menu.onHide(() => { if (!this.busy && this.root.isConnected && !this.root.doc.activeElement?.closest('.modal-container')) this.els.get(this.spot)?.focus({ preventScroll: true }); });
	}

	private startAdd(): void {
		if (this.ro || this.busy) return;
		const add = this.els.get(spotKey(HEAD, ADD));
		if (!add) return;
		const th = createEl('th', { cls: 'binders-plotgrid-col', attr: { role: 'columnheader' } });
		add.before(th);
		this.edit(th, '', 'New plotline', (v) => nameProblem(v, this.columns()), (v) => {
			th.remove();
			if (v != null) void this.writeBinder({ plotlines: [...this.columns(), v] });
			this.draw(true);
			this.focusSpot(spotKey(HEAD, v ?? ADD));
		});
	}

	private startRename(name: string): void {
		const th = this.els.get(spotKey(HEAD, name));
		if (this.ro || this.busy || !th) return;
		this.edit(th, name, 'Plotline name', (v) => nameProblem(v, this.columns(), name), (v) => {
			if (v != null && v !== name) {
				if (this.spot === spotKey(HEAD, name)) this.spot = spotKey(HEAD, v);
				void this.renamePlotline(name, v);
			}
			this.draw(true);
			this.focusSpot(this.spot);
		});
	}

	/** Edits a name in place. `check` says why a name can't be used; `done` gets the trimmed name, or null if the edit
	    was cancelled (or left with a name that can't be used). */
	private edit(th: HTMLElement, value: string, label: string, check: (v: string) => string | null, done: (v: string | null) => void): void {
		this.busy = true;
		th.addClass('is-editing');
		const input = th.createEl('input', { type: 'text', cls: 'binders-plotgrid-input', value, attr: { 'aria-label': label, placeholder: label, spellcheck: 'false' } });
		input.focus();
		input.select();
		let over = false;
		const finish = (raw: string | null, leaving = false) => {
			if (over) return;
			const v = raw?.trim() || null, problem = v == null ? null : check(v);
			if (problem) { new Notice(problem); if (!leaving) { input.select(); return; } }
			over = true; // before anything below can blur the input again
			this.finishEdit = null;
			this.busy = false;
			input.remove();
			th.removeClass('is-editing');
			done(problem ? null : v);
			if (this.stale) this.refresh();
		};
		this.finishEdit = () => finish(input.value, true);
		input.addEventListener('keydown', (e) => {
			e.stopPropagation(); // typing isn't grid navigation
			if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(input.value); }
			else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
		});
		input.addEventListener('blur', () => finish(input.value, true));
		input.addEventListener('pointerdown', (e) => e.stopPropagation());
		input.addEventListener('click', (e) => e.stopPropagation());
	}

	private moveColumn(name: string, d: number): void {
		const cols = this.columns(), i = cols.indexOf(name);
		if (i < 0 || i + d < 0 || i + d >= cols.length) return;
		void this.writeBinder({ plotlines: move(cols, i, i + d) });
		this.focusSpot(spotKey(HEAD, name));
	}

	private async setColor(name: string, color: PlotColor | null): Promise<void> {
		const colors = { ...this.colors() };
		if (color) colors[name] = color; else delete colors[name];
		await this.writeBinder({ colors });
	}

	/** Renames the column and the name in every scene in the binder that lists it (not only this folder's). */
	private async renamePlotline(from: string, to: string): Promise<void> {
		const cols = this.columns(), colors = this.colors();
		if (!cols.includes(from)) return;
		if (!(await this.writeBinder({ plotlines: rename(cols, from, to), ...(from in colors ? { colors: recolor(colors, from, to) ?? {} } : {}) }))) return;
		const scenes = this.ctx.store.scenes(this.ctx.binder.folder).filter((f) => this.linesOf(f).includes(from));
		const res = await Promise.allSettled(scenes.map((f) => this.writeScene(f, rename(this.linesOf(f), from, to), false)));
		const failed = res.filter((r) => r.status === 'rejected' || !r.value).length;
		if (failed) new Notice(`Couldn’t rename “${from}” in ${failed} ${failed === 1 ? 'scene' : 'scenes'}.`);
	}

	private confirmDelete(name: string): void {
		const scenes = this.ctx.store.scenes(this.ctx.binder.folder).filter((f) => this.linesOf(f).includes(name));
		new DeleteModal(this.ctx.app, name, scenes.length, (fromScenes) => void this.deletePlotline(name, fromScenes ? scenes : [])).open();
	}

	private async deletePlotline(name: string, scenes: TFile[]): Promise<void> {
		const cols = this.columns(), colors = this.colors(), i = cols.indexOf(name);
		if (i < 0) return;
		const next = cols.filter((x) => x !== name);
		if (this.spot === spotKey(HEAD, name)) this.spot = spotKey(HEAD, next[Math.min(i, next.length - 1)] ?? ADD);
		if (!(await this.writeBinder({ plotlines: next, ...(name in colors ? { colors: recolor(colors, name, null) ?? {} } : {}) }))) return;
		const res = await Promise.allSettled(scenes.map((f) => this.writeScene(f, this.linesOf(f).filter((x) => x !== name), false)));
		const failed = res.filter((r) => r.status === 'rejected' || !r.value).length;
		if (failed) new Notice(`Couldn’t remove “${name}” from ${failed} ${failed === 1 ? 'scene' : 'scenes'}.`);
		if (this.root.contains(this.root.doc.activeElement) || this.root.doc.activeElement === this.root.doc.body) this.focusSpot(this.spot);
	}

	// ---- writing ----

	/** Writes the binder's columns and colors (the store refuses a binder in a newer format). */
	private async writeBinder(patch: { plotlines?: string[]; colors?: Record<string, PlotColor> }): Promise<boolean> {
		const note = this.ctx.binder.note, shown: Record<string, unknown> = {}, disk: Record<string, unknown> = {};
		if (patch.plotlines) { shown[PLOTLINES] = patch.plotlines; disk[PLOTLINES] = patch.plotlines.length ? patch.plotlines : undefined; }
		if (patch.colors) { shown[PLOTLINE_COLORS] = patch.colors; disk[PLOTLINE_COLORS] = Object.keys(patch.colors).length ? patch.colors : undefined; }
		return this.write(note, shown, () => this.ctx.store.setProps(note, disk));
	}

	private writeScene(file: TFile, lines: string[], notice = true): Promise<boolean> {
		return this.write(file, { [PLOTLINES]: lines }, () => this.ctx.setProps(file, { plotlines: lines }), notice);
	}

	private async write(file: TFile, shown: Record<string, unknown>, write: () => Promise<void>, notice = true): Promise<boolean> {
		const p = this.pending.write(file, shown, write);
		this.draw();
		try { await p; return true; } catch (e) {
			if (notice) new Notice(e instanceof Error ? e.message : String(e));
			this.refresh();
			return false;
		}
	}

	private async tell(p: Promise<unknown>): Promise<void> {
		try { await p; } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
	}

	// ---- dragging ----

	private onPointerDown(e: PointerEvent): void {
		if (this.ro || this.busy || e.button !== 0 || (e.target as HTMLElement).closest('input')) return;
		const t = this.target(e);
		if (!t || t.col === ADD) return;
		if (t.row === HEAD) { this.dragColumn(e, t.col); return; }
		const item = this.itemAt(t.row);
		// on touch, rows move by their grip, so the first column still scrolls the grid
		if (!item || t.col !== TITLE || (e.pointerType === 'touch' && !(e.target as HTMLElement).closest('.binders-plotgrid-grip'))) return;
		this.dragRow(e, item);
	}

	/** Follows a press; past DRAG_START it becomes a drag. Touch scrolling is held off while dragging. */
	private track(e: PointerEvent, h: { start(): void; move(x: number, y: number): void; drop(): void; end(): void }): void {
		const doc = this.root.doc, id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
		let on = false;
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== id) return;
			if (!on) {
				if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_START) return;
				on = true;
				this.busy = true;
				this.root.addClass('is-dragging');
				h.start();
			}
			ev.preventDefault();
			this.edgeScroll(ev.clientX, ev.clientY);
			h.move(ev.clientX, ev.clientY);
		};
		const touchmove = (ev: TouchEvent) => { if (on && ev.cancelable) ev.preventDefault(); };
		const stop = (drop: boolean) => {
			doc.removeEventListener('pointermove', move);
			doc.removeEventListener('pointerup', up);
			doc.removeEventListener('pointercancel', cancel);
			doc.removeEventListener('touchmove', touchmove);
			this.stopDrag = null;
			if (!on) return;
			// the click that ends a drag isn't a click on what's under it
			this.swallowClick = true;
			window.setTimeout(() => { this.swallowClick = false; }, 0);
			this.root.removeClass('is-dragging');
			if (drop) h.drop();
			h.end();
			this.busy = false;
			if (this.stale) this.refresh();
		};
		const up = (ev: PointerEvent) => { if (ev.pointerId === id) stop(true); };
		const cancel = (ev: PointerEvent) => { if (ev.pointerId === id) stop(false); };
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
		doc.addEventListener('pointercancel', cancel);
		doc.addEventListener('touchmove', touchmove, { passive: false });
		this.stopDrag = () => stop(false);
	}

	private edgeScroll(x: number, y: number): void {
		const b = this.root.getBoundingClientRect(), head = this.table?.tHead?.getBoundingClientRect().height ?? 0;
		if (y < b.top + head + EDGE) this.root.scrollTop -= 12; else if (y > b.bottom - EDGE) this.root.scrollTop += 12;
		if (x < b.left + EDGE) this.root.scrollLeft -= 12; else if (x > b.right - EDGE) this.root.scrollLeft += 12;
	}

	private marks(): void {
		this.table?.querySelectorAll('.is-drop-before, .is-drop-after, .is-dragged').forEach((el) => el.removeClasses(['is-drop-before', 'is-drop-after', 'is-dragged']));
	}

	private dragRow(e: PointerEvent, item: TFile | TFolder): void {
		let to: { folder: TFolder; index: number } | null = null;
		const tr = () => this.table?.tBodies[0]?.querySelector<HTMLElement>(`tr[data-path="${CSS.escape(item.path)}"]`);
		this.track(e, {
			start: () => tr()?.addClass('is-dragged'),
			move: (_x, y) => {
				this.table?.querySelectorAll('.is-drop-before, .is-drop-after').forEach((el) => el.removeClasses(['is-drop-before', 'is-drop-after']));
				const t = this.rowTarget(item, y);
				to = t;
				t?.el.addClass(t.after ? 'is-drop-after' : 'is-drop-before');
			},
			drop: () => { if (to) void this.moveItem(item, to.folder, to.index); },
			end: () => this.marks(),
		});
	}

	/** Where a row dropped at `y` goes: before or after the row under it, in that row's folder; the lower half of an open
	    group's header puts it first in that group. */
	private rowTarget(item: TFile | TFolder, y: number): { folder: TFolder; index: number; el: HTMLElement; after: boolean } | null {
		const rows = [...(this.table?.tBodies[0]?.rows ?? [])];
		if (!rows.length) return null;
		let tr = rows.find((r) => { const b = r.getBoundingClientRect(); return y >= b.top && y < b.bottom; }), after: boolean;
		if (tr) { const b = tr.getBoundingClientRect(); after = y > b.top + b.height / 2; }
		else { after = y >= rows[0].getBoundingClientRect().top; tr = after ? rows[rows.length - 1] : rows[0]; }
		const over = this.itemAt(tr.dataset.path);
		if (!over || over === item || !over.parent) return null;
		const into = over instanceof TFolder && after && !this.collapsed.has(over.path);
		const folder = over instanceof TFolder && into ? over : over.parent;
		if (item instanceof TFolder && (folder === item || folder.path.startsWith(item.path + '/'))) return null;
		const sibs = (this.ctx.store.orderedChildren(folder) ?? []).filter((c: TAbstractFile) => c !== item);
		const index = into ? 0 : sibs.indexOf(over) + (after ? 1 : 0);
		if (item.parent === folder && (this.ctx.store.orderedChildren(folder) ?? []).indexOf(item) === index) return null; // where it is
		return { folder, index, el: tr, after };
	}

	private dragColumn(e: PointerEvent, name: string): void {
		let to = -1;
		const cells = (n: string) => [...(this.table?.querySelectorAll<HTMLElement>(`[data-plotline="${CSS.escape(n)}"]`) ?? [])];
		this.track(e, {
			start: () => cells(name).forEach((c) => c.addClass('is-dragged')),
			move: (x) => {
				this.table?.querySelectorAll('.is-drop-before, .is-drop-after').forEach((el) => el.removeClasses(['is-drop-before', 'is-drop-after']));
				const cols = this.columns();
				const mids = cols.map((n) => { const b = this.els.get(spotKey(HEAD, n))?.getBoundingClientRect(); return b ? b.left + b.width / 2 : 0; });
				to = mids.findIndex((m) => x < m);
				if (to < 0) to = cols.length;
				const from = cols.indexOf(name);
				if (to === from || to === from + 1) return;
				if (to < cols.length) cells(cols[to]).forEach((c) => c.addClass('is-drop-before'));
				else cells(cols[cols.length - 1]).forEach((c) => c.addClass('is-drop-after'));
			},
			drop: () => {
				const cols = this.columns(), from = cols.indexOf(name);
				if (from < 0 || to < 0 || to === from || to === from + 1) return;
				void this.writeBinder({ plotlines: move(cols, from, to > from ? to - 1 : to) });
			},
			end: () => this.marks(),
		});
	}
}

const colorClass = (c: PlotColor | undefined): string => (c ? `binders-plotgrid-color-${c}` : 'binders-plotgrid-color-none');

/** Values written but maybe not yet in Obsidian's metadata cache, shown (and built on) until the cache has them. Writes
    to one note run one after another. */
class Pending {
	private values = new Map<string, { file: TFile; key: string; value: unknown; writes: number; at: number }>();
	private chains = new Map<string, Promise<unknown>>();
	private timer = 0;

	constructor(private cached: (f: TFile, key: string) => unknown, private changed: () => void) {}

	has(f: TFile): boolean { return [...this.values.values()].some((v) => v.file === f); }

	get<T>(f: TFile, key: string, read: () => T): T {
		const v = this.values.get(f.path + '\n' + key);
		return v ? v.value as T : read();
	}

	write(f: TFile, patch: Record<string, unknown>, write: () => Promise<void>): Promise<void> {
		const entries = Object.entries(patch).map(([key, value]) => {
			const id = f.path + '\n' + key, v = this.values.get(id) ?? { file: f, key, value, writes: 0, at: 0 };
			v.value = value; v.writes++;
			this.values.set(id, v);
			return [id, v] as const;
		});
		const run = async (): Promise<void> => {
			try { await write(); } catch (e) {
				for (const [id, v] of entries) if (v.writes === 1) this.values.delete(id); // show the note as it is
				throw e;
			} finally {
				for (const [, v] of entries) { v.writes--; v.at = Date.now(); }
				window.clearTimeout(this.timer);
				this.timer = window.setTimeout(() => { if (this.sweep(1000)) this.changed(); }, 1500);
			}
		};
		const p = (this.chains.get(f.path) ?? Promise.resolve()).then(run, run);
		this.chains.set(f.path, p.catch((): void => undefined));
		return p;
	}

	/** Forgets values the cache now has, and (with `age`) ones written longer ago than that, in case the note changed
	    again elsewhere. Returns whether any went. */
	sweep(age = Infinity): boolean {
		let gone = false;
		for (const [id, v] of this.values) {
			if (v.writes) continue;
			if (JSON.stringify(this.cached(v.file, v.key)) === JSON.stringify(v.value) || Date.now() - v.at > age) { this.values.delete(id); gone = true; }
		}
		return gone;
	}

	stop(): void { window.clearTimeout(this.timer); }
}

class DeleteModal extends Modal {
	private fromScenes = true;
	constructor(app: App, private name: string, private count: number, private onDelete: (fromScenes: boolean) => void) { super(app); }

	onOpen(): void {
		this.titleEl.setText(`Delete “${this.name}”?`);
		this.contentEl.createEl('p', { text: 'It will no longer be a column in the plot grid.' });
		if (this.count) {
			new Setting(this.contentEl)
				.setName('Also remove it from scenes')
				.setDesc(`${this.count} ${this.count === 1 ? 'scene lists' : 'scenes list'} it. If you keep it there, it shows under “Other”.`)
				.addToggle((t) => t.setValue(this.fromScenes).onChange((v) => { this.fromScenes = v; }));
		}
		const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
		const del = new ButtonComponent(buttons).setButtonText('Delete').onClick(() => { this.close(); this.onDelete(this.count > 0 && this.fromScenes); });
		if (requireApiVersion('1.13.0')) del.setDestructive().setCta(); else del.buttonEl.addClass('mod-warning'); // setWarning() before 1.13
		new ButtonComponent(buttons).setButtonText('Cancel').onClick(() => this.close());
	}

	onClose(): void { this.contentEl.empty(); }
}
