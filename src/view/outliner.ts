import { Keymap, Menu, Notice, Platform, TFile, TFolder, setIcon, type EventRef, type TAbstractFile } from 'obsidian';
import { compiles, emptyState, isNote, plain, itemMenu, labelItems, nameOf, noteOf, removeItems, renameItem, setAll, setCompile, statusItems } from './actions';
import { COMPILE_PROP } from '../scenes';
import { GLIDE_QUICK, Press, glide, held, places, settle, visibleBottom } from './drag';
import { editable, type Editable } from './edit';
import { submenu } from './internals';
import { labelDot, labelName, rank } from './labels';
import { ask } from './modals';
import type { BinderMode, ModeContext, ModeFactory, SceneProps } from './mode';
import { BUILT_IN, MIN_WIDTH, TITLE, builtIn, clampWidth, columnName, columnWidth, compareValues, move, nextSort, parseTarget, parseTyped, progress, propId, propOf, readColumns, readSort, suggestProps, text, type ColumnSpec, type Sort } from './outliner-data';
import { wordsLabel } from './words';

/* The outliner: the folder's notes and subfolders as rows of a tree, in binder order, with a column for each thing
   worth seeing side by side: label, status, words, target, progress, dates, and any property of your notes. As in
   Scrivener's, a row shows its title with its synopsis under it; subfolders fold; rows are selected, dragged and
   renamed as cards are on the corkboard (the two share their menus); a column's header sorts by it, hides it or moves
   it, and its edge resizes it.

   It's a grid of rows built from <div>s (as a base's table is), so rows off screen cost nothing to lay out and the
   title column can stay put while the others scroll. Rows are drawn again only when what they show changed. */

export const outliner: ModeFactory = (container, ctx) => new Outliner(container, ctx);

/** What this view keeps in the workspace (with the tab): its columns once changed, sorting, folded folders. */
interface Prefs { columns?: unknown; synopsis?: unknown; sort?: unknown; collapsed?: unknown }
interface Row { item: TFile | TFolder; depth: number }
interface Drawn { el: HTMLElement; key: string; item: TAbstractFile; title: Editable; synopsis: Editable | null; target: Editable | null; fields: Map<string, Editable> }
interface Place { folder: TFolder; anchor: TAbstractFile | null; depth?: number; hint: string; into: HTMLElement | null; line: { left: number; right: number; y: number } | null }

const NO_PROPS: SceneProps = { synopsis: '', status: '', label: '', target: 0 };
const EDGE = 48; // px from the outliner's edge where dragging scrolls it
const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

class Outliner implements BinderMode {
	readonly filters = true;
	private root: HTMLElement;
	private table: HTMLElement;
	private head: HTMLElement;
	private body: HTMLElement;
	private foot: HTMLElement;
	private empty: HTMLElement | null = null;
	private press: Press<string>;
	private rowsShown: Row[] = [];
	private drawn = new Map<string, Drawn>();
	private headKey = '';
	private sel = new Set<string>();
	private anchor: string | null = null;
	private focused: string | null = null;
	private editing = 0;
	private moving = false;
	private dirty = false;
	private drawnOnce = false;
	/** A row to rename once it's drawn (a note or folder just made). */
	private renameNext: string | null = null;
	private refocus: string | null = null;
	private drag: { items: TAbstractFile[]; ghost: HTMLElement; action: HTMLElement; line: HTMLElement; place: Place | null; x: number; y: number; raf: number; off: () => void } | null = null;
	private stopHeader: (() => void) | null = null;
	/** Where rows just dropped were let go, to glide from (their paths change when they change folders). */
	private landing = new Map<TAbstractFile, DOMRect>();
	/** The next redraw is a fold or an unfold: the rows below move as quickly as the file explorer's. */
	private quick = false;
	/** A cell to give the focus back to once its row is drawn again (its menu or its tick changed the row). */
	private wantCell: { path: string; col: string } | null = null;
	/** Letters typed with a row in focus, to go to the row that starts with them. */
	private typed = '';
	private typedAt = 0;
	private said: Notice | null = null;
	/** Renames and moves since the rows were last drawn: old path to new. */
	private moves: ((path: string) => string)[] = [];
	private moved: EventRef | null = null;

	constructor(private container: HTMLElement, private ctx: ModeContext) {}

	private get store() { return this.ctx.store; }
	private get ro(): boolean { return this.ctx.readOnly; }
	private get longform(): boolean { return this.ctx.binder.kind === 'longform'; }
	private get settings() { return this.ctx.plugin.settings; }

	// ---- what the view keeps ----

	private get prefs(): Prefs { const p = this.ctx.option<unknown>('outliner', null); return p && typeof p === 'object' ? p : {}; }
	private setPrefs(patch: Prefs): void { this.ctx.setOption('outliner', { ...this.prefs, ...patch }); }
	private columns(): ColumnSpec[] { return readColumns(this.prefs.columns) ?? readColumns(this.settings.outlinerColumns) ?? []; }
	private get synopses(): boolean { return this.prefs.synopsis !== false; }
	private get sort(): Sort { return readSort(this.prefs.sort); }
	private get collapsed(): Set<string> { const c = this.prefs.collapsed; return new Set(Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string') : []); }

	/** New columns for this outliner, and what the next one opened starts with. */
	private setColumns(cols: ColumnSpec[]): void {
		this.setPrefs({ columns: cols, ...(this.sort && this.sort.id !== TITLE && !cols.some((c) => c.id === this.sort?.id) ? { sort: null } : {}) });
		this.settings.outlinerColumns = cols.map((c) => ({ ...c }));
		void this.ctx.plugin.saveData(this.settings);
		this.draw();
	}

	private setCollapsed(paths: Iterable<string>): void {
		this.setPrefs({ collapsed: [...paths] });
		this.quick = true;
		this.draw();
	}

	// ---- life ----

	render(): void {
		// (focusable, so a click on the space below the rows leaves the keyboard in the outliner)
		this.root = this.container.createDiv({ cls: 'binders-outliner', attr: { tabindex: '-1' } });
		this.fit.observe(this.root);
		this.moved = this.ctx.app.vault.on('rename', (f, old) => this.onMoved(f.path, old));
		this.table = this.root.createDiv({ cls: 'binders-outliner-table', attr: { role: 'treegrid', 'aria-label': 'Outliner', 'aria-multiselectable': 'true' } });
		this.head = this.table.createDiv({ cls: 'binders-outliner-head', attr: { role: 'row' } });
		this.body = this.table.createDiv({ cls: 'binders-outliner-body', attr: { role: 'rowgroup' } });
		this.foot = this.table.createDiv({ cls: 'binders-outliner-foot', attr: { role: 'row' } });
		const on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void) => this.root.addEventListener(t, fn);
		on('click', (e) => this.onClick(e));
		on('dblclick', (e) => this.onDblClick(e));
		on('mousedown', (e) => { if (e.button === 1 && this.rowOf(e)) e.preventDefault(); });
		on('auxclick', (e) => { const row = this.rowOf(e); if (e.button === 1 && row && !(e.target as HTMLElement).closest('input, textarea')) { e.preventDefault(); this.open(row, 'tab'); } });
		on('contextmenu', (e) => this.onContextMenu(e));
		on('keydown', (e) => this.onKey(e));
		// the row the keyboard is on, however it got there (a click, Tab, another plugin's command): it's the one that
		// keeps the focus when the rows are drawn again
		on('focusin', (e) => {
			const row = this.rowOf(e);
			if (!row || e.target !== row || !row.dataset.path) return;
			const path = this.moves.reduce((p, re) => re(p), row.dataset.path);
			if (this.focused !== path) { this.focused = path; if (!this.moves.length) this.paintSelection(); }
		});
		this.press = new Press<string>({
			el: this.body,
			pick: (e) => {
				const t = e.target as HTMLElement, row = t.closest<HTMLElement>('.binders-outliner-row');
				// (a label or status cell opens its own list on a click; under a finger it's part of the row all the same: a
				// long press there opens the row's menu or lifts the row, as anywhere else on it)
				if (!row || t.closest('.is-editing, .binders-outliner-chevron, input')) return null;
				return e.pointerType === 'touch' || !t.closest('.binders-outliner-cell.is-menu') ? { el: row, data: row.dataset.path } : null;
			},
			canDrag: () => {
				if (this.ro) return false;
				if (this.sort) this.whySorted();
				return !this.sort;
			},
			start: (path, x, y) => this.startDrag(path, x, y),
			move: (x, y) => this.dragTo(x, y),
			end: (drop, x, y) => this.endDrag(drop, x, y),
			hold: (path, x, y) => {
				if (!this.sel.has(path)) this.select([path]);
				const row = this.rowEl(path);
				if (row) this.rowMenu(row).showAtPosition({ x, y }, this.root.doc);
			},
		});
		this.draw();
	}

	refresh(): void {
		if (this.busy()) { this.dirty = true; return; }
		this.draw();
	}

	/** Why the rows can't be moved while they're sorted (said once at a time, however often it's tried). */
	private whySorted(): void {
		const s = this.sort;
		if (!s) return;
		this.said?.hide();
		this.said = new Notice(`The outliner is sorted by ${columnName(s.id).toLowerCase()}. Choose “Binder order” in a column’s menu to rearrange it.`);
	}

	/** Something was renamed or moved (here or anywhere): what's selected, focused and folded follows it by its new path. */
	private onMoved(now: string, old: string): void {
		const re = (p: string) => (p === old ? now : p.startsWith(old + '/') ? now + p.slice(old.length) : p);
		// (rows still on screen under their old paths, until they're drawn again, are known by their new ones)
		this.moves.push(re);
		this.sel = new Set([...this.sel].map(re));
		if (this.focused) this.focused = re(this.focused);
		if (this.anchor) this.anchor = re(this.anchor);
		if (this.refocus) this.refocus = re(this.refocus);
		if (this.renameNext) this.renameNext = re(this.renameNext);
		const was = [...this.collapsed], next = was.map(re);
		if (next.some((p, i) => p !== was[i])) this.setPrefs({ collapsed: next });
	}

	unload(): void {
		this.fit.disconnect();
		if (this.moved) this.ctx.app.vault.offref(this.moved);
		this.said?.hide();
		this.press.destroy();
		this.stopHeader?.();
		this.endDrag(false, 0, 0, true);
		this.container.empty();
	}

	// (with no row in hand, the outliner itself: the first arrow key then goes to its first row, as in the file explorer)
	focus(): void { (this.rowEl(this.focused) ?? this.root).focus({ preventScroll: true }); }

	current(): TAbstractFile | null { return this.item(this.focused ?? [...this.sel][0]); }

	/** Where the table is: the first row in sight and how far it's scrolled past the top (rows out of sight are
	    stand-ins of a guessed height, so a scroll position alone wouldn't find the same place again). */
	place(): unknown {
		const top = this.root.getBoundingClientRect().top + this.head.offsetHeight, first = this.rowEls().find((r) => r.getBoundingClientRect().bottom > top + 1);
		return { scroll: this.root.scrollTop, top: first?.dataset.path ?? null, offset: first ? Math.round(top - first.getBoundingClientRect().top) : 0, left: this.root.scrollLeft, sel: [...this.sel], focused: this.focused };
	}

	restore(place: unknown): void {
		const p = (place ?? {}) as { scroll?: unknown; left?: unknown; sel?: unknown; focused?: unknown };
		const sel = Array.isArray(p.sel) ? p.sel.filter((x): x is string => typeof x === 'string' && this.drawn.has(x)) : [];
		this.select(sel, typeof p.focused === 'string' && this.drawn.has(p.focused) ? p.focused : sel[sel.length - 1] ?? null);
		if (typeof p.scroll === 'number') this.root.scrollTop = p.scroll;
		if (typeof p.left === 'number') this.root.scrollLeft = p.left;
		// the row that was at the top is put there again, now and once more when the rows around it have been laid out
		const q = place as { top?: unknown; offset?: unknown } | null, path = typeof q?.top === 'string' ? q.top : null, offset = typeof q?.offset === 'number' ? q.offset : 0;
		const again = () => {
			const row = path ? this.rowEl(path) : null;
			if (row) this.root.scrollTop += row.getBoundingClientRect().top - (this.root.getBoundingClientRect().top + this.head.offsetHeight) + offset;
		};
		again();
		const stop = () => { window.clearTimeout(t1); window.clearTimeout(t2); };
		const t1 = window.setTimeout(again, 30), t2 = window.setTimeout(again, 200);
		for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) this.root.addEventListener(type, stop, { once: true, passive: true });
	}

	/** The folder's synopsis scrolls away with the rows; the column headers stay. */
	adopt(header: HTMLElement): void { this.root.prepend(header); }

	reveal(item: TAbstractFile, fresh = false): void {
		// its folders unfold, so it's there to show
		const collapsed = this.collapsed, before = collapsed.size;
		for (let f = item.parent; f && f !== this.ctx.folder; f = f.parent) collapsed.delete(f.path);
		if (collapsed.size !== before) this.setCollapsed(collapsed);
		const el = this.rowEl(item.path);
		if (!el) return;
		this.select([item.path]);
		el.scrollIntoView({ block: 'nearest' });
		el.focus({ preventScroll: true });
		if (fresh && !this.ro) this.drawn.get(item.path)?.title.edit();
		// (and once the pane has been laid out: shown right after the view opens, the rows aren't yet where they'll be)
		else window.setTimeout(() => { if (this.sel.has(item.path)) this.rowEl(item.path)?.scrollIntoView({ block: 'nearest' }); }, 350);
	}

	filterChanged(): void { /* the next refresh shows what passes */ }

	menu(menu: Menu): void {
		menu.addItem((i) => i.setSection('view').setTitle('Show synopses').setIcon('text').setChecked(this.synopses).onClick(() => { this.setPrefs({ synopsis: !this.synopses }); this.draw(); }));
		menu.addItem((i) => { i.setSection('view').setTitle('Columns').setIcon('columns-3'); submenu(i, (m) => this.columnItems(m), menu); });
		if (this.sort) menu.addItem((i) => i.setSection('view').setTitle('Binder order').setIcon('list-ordered').onClick(() => this.setSort(null)));
		if (this.canKeepSort) menu.addItem((i) => i.setSection('view').setTitle('Make this the binder order').setIcon('list-checks').onClick(() => void this.keepSort()));
		if (this.rowsShown.some((r) => r.item instanceof TFolder)) {
			menu.addItem((i) => i.setSection('view').setTitle('Expand all').setIcon('chevrons-up-down').onClick(() => this.setCollapsed([])));
			menu.addItem((i) => i.setSection('view').setTitle('Collapse all').setIcon('chevrons-down-up').onClick(() => this.setCollapsed(this.folders(this.ctx.folder).map((f) => f.path))));
		}
	}

	newMenu(menu: Menu): void {
		menu.addItem((i) => i.setSection('new').setTitle('New note').setIcon('file-plus').onClick(() => void this.create('note')));
		if (!this.longform) menu.addItem((i) => i.setSection('new').setTitle('New folder').setIcon('folder-plus').onClick(() => void this.create('folder')));
	}

	// ---- the model ----

	private children(folder: TFolder): (TFile | TFolder)[] {
		return (this.store.orderedChildren(folder) ?? []).filter((f): f is TFile | TFolder => f instanceof TFolder || isNote(f));
	}

	/** Every subfolder under a folder, at any depth. */
	private folders(folder: TFolder): TFolder[] {
		const out: TFolder[] = [];
		const walk = (f: TFolder) => { for (const c of this.children(f)) if (c instanceof TFolder) { out.push(c); walk(c); } };
		if (!this.longform) walk(folder);
		return out;
	}

	/** Items in the order the sort puts them (each folder's own items among themselves); binder order without one. */
	private sorted<T extends TAbstractFile>(list: T[]): T[] {
		const sort = this.sort;
		if (!sort) return list;
		return list.map((f, i) => ({ f, i, v: this.sortValue(f, sort.id) })).sort((a, b) => compareValues(a.v, b.v, sort.dir) || a.i - b.i).map((x) => x.f);
	}

	/** Can the order on screen be written down as the binder's? (Not a Longform project's: sorted, it shows without its
	    indents, and writing that down would lose them.) */
	private get canKeepSort(): boolean { return !!this.sort && !this.longform && !this.ctx.readOnly; }

	/** "Make this the binder order": every folder in view takes the order the sort shows it in, as one change that
	    "Undo last move" takes back; then the sort is let go, so the rows can be dragged again. */
	private async keepSort(): Promise<void> {
		const sort = this.sort;
		if (!sort || !this.canKeepSort) return;
		const folders = [this.ctx.folder, ...this.folders(this.ctx.folder)];
		// (everything in view, in the order it shows: undoing puts each back beside the neighbour it had)
		const all = folders.flatMap((f) => this.store.orderedChildren(f) ?? []);
		if (!all.length) return;
		try {
			await this.store.change(`Sort by ${columnName(sort.id).toLowerCase()}`, all, async () => {
				for (const folder of folders) {
					// (anything that isn't a note or a folder keeps its place after them)
					const all = this.store.orderedChildren(folder) ?? [], notes = this.children(folder), want = [...this.sorted(notes), ...all.filter((f) => !(notes as TAbstractFile[]).includes(f))];
					if (want.every((f, i) => f === all[i])) continue;
					for (let i = 0; i < want.length; i++) await this.store.move(want[i], folder, i);
				}
			});
		} catch (e) { new Notice(plain(e)); return; }
		this.setSort(null);
	}

	private rows(): Row[] {
		const out: Row[] = [], sort = this.sort, collapsed = this.collapsed, filtering = this.ctx.filtering();
		const sorted = <T extends TAbstractFile>(list: T[]): T[] => this.sorted(list);
		if (this.longform) {
			// one flat folder; scenes are indented as in Longform (sorted, they're one list)
			const scenes = this.store.groups(this.ctx.folder).flatMap((g) => g.files.map((f) => ({ f, depth: g.depth }))).filter((s) => this.ctx.visible(s.f));
			if (!sort) return scenes.map((s) => ({ item: s.f, depth: s.depth }));
			return sorted(scenes.map((s) => s.f)).map((f) => ({ item: f, depth: 0 }));
		}
		const walk = (folder: TFolder, depth: number) => {
			for (const c of sorted(this.children(folder))) {
				if (c instanceof TFolder) {
					// with a filter on, a folder shows for the notes in it that pass
					if (filtering && !this.store.scenes(c).some((f) => this.ctx.visible(f))) continue;
					out.push({ item: c, depth });
					if (!collapsed.has(c.path)) walk(c, depth + 1);
				} else if (this.ctx.visible(c)) out.push({ item: c, depth });
			}
		};
		walk(this.ctx.folder, 0);
		return out;
	}

	private props(item: TAbstractFile): SceneProps { const n = noteOf(this.ctx, item); return n ? this.ctx.props(n) : NO_PROPS; }
	private frontmatter(item: TAbstractFile): Record<string, unknown> { const n = noteOf(this.ctx, item); return (n && this.ctx.app.metadataCache.getFileCache(n)?.frontmatter) || {}; }

	/** Words in a note, or in every note of a folder; null until they're all counted. */
	private words(item: TAbstractFile): number | null {
		if (item instanceof TFile) return this.ctx.words(item);
		if (!(item instanceof TFolder)) return null;
		let n = 0;
		for (const f of this.scenesIn(item)) { const w = this.ctx.words(f); if (w == null) return null; n += w; }
		return n;
	}

	/** The notes in a folder that show: all of them, or with a filter on, the ones that pass (so a folder's row adds
	    up what's under it on screen, as the last row does). */
	private scenesIn(folder: TFolder): TFile[] {
		const all = this.store.scenes(folder);
		return this.ctx.filtering() ? all.filter((f) => this.ctx.visible(f)) : all;
	}

	/** An item's target: its own, or for a folder without one, its notes' targets together (`own` false). */
	private target(item: TAbstractFile): { n: number; own: boolean } {
		const own = this.props(item).target;
		if (own > 0 || !(item instanceof TFolder)) return { n: own, own: true };
		return { n: this.scenesIn(item).reduce((a, f) => a + this.ctx.props(f).target, 0), own: false };
	}

	private sortValue(item: TAbstractFile, id: string): unknown {
		const p = this.props(item);
		switch (id) {
			case TITLE: return nameOf(item);
			// in the order settings list them, then by name
			case 'label': return p.label ? String(rank(p.label, this.settings.labels.map((l) => l.name))).padStart(4, '0') + labelName(p.label, this.settings.labels) : '';
			case 'status': return p.status ? String(rank(p.status, this.settings.statuses)).padStart(4, '0') + p.status : '';
			case 'words': return this.words(item);
			case 'target': return this.target(item).n || null;
			case 'progress': return progress(this.words(item), this.target(item).n);
			case 'created': return item instanceof TFile ? item.stat.ctime : null;
			case 'modified': return item instanceof TFile ? item.stat.mtime : null;
			case 'compile': return compiles(this.ctx.plugin, item);
		}
		const prop = propOf(id), v = prop ? this.frontmatter(item)[prop] : null;
		return Array.isArray(v) ? text(v) : v;
	}

	/** The pane changing size while something is typed (a phone's keyboard coming up over it): the field stays in sight. */
	private fit = new ResizeObserver(() => {
		const a = this.root.doc.activeElement;
		if (this.editing > 0 && a?.instanceOf(HTMLElement) && this.body.contains(a)) a.scrollIntoView({ block: 'nearest' });
	});

	/** On a phone a label is its color alone, in a column a finger wide (unless the column has been given a width):
	    the room goes to the title, the status and the word count, which are words. */
	private labelCompact = false;
	private compact(c: ColumnSpec): boolean { return Platform.isPhone && c.id === 'label' && c.width == null && this.root.clientWidth < 520; }
	/** (and on a phone's narrow pane a status and a word count are a little narrower than elsewhere, unless they've
	    been given a width: the room goes to the title) */
	private widthOf(c: ColumnSpec): number {
		if (this.compact(c)) return 44;
		if (c.width == null && Platform.isPhone && this.root.clientWidth < 520) { if (c.id === 'status') return 88; if (c.id === 'words') return 64; }
		return columnWidth(c);
	}

	/** Under a finger a tick's whole cell is the tick (the box alone is too small to hit). */
	private tickByCell(td: HTMLElement, box: HTMLInputElement): void {
		td.addEventListener('click', (e) => {
			if (e.target === box || box.disabled || this.press.pointer !== 'touch') return;
			e.stopPropagation();
			box.click();
		});
	}

	// ---- drawing ----

	private busy(): boolean { return this.editing > 0 || !!this.drag || this.moving || this.press?.dragging; }

	private onEditing(on: boolean, row?: HTMLElement): void {
		this.editing += on ? 1 : -1;
		if (on && row) {
			// (rows still gliding to their places are measured where they started: they're put where they're going first)
			for (const a of this.body.getAnimations({ subtree: true })) a.finish();
			row.scrollIntoView({ block: 'nearest' });
		}
		if (!on && !this.busy()) window.setTimeout(() => { if (!this.busy()) this.draw(); }, 0);
	}

	private draw(): void {
		const cols = this.columns(), rows = this.rows(), ro = this.ro, sort = this.sort, synopses = this.synopses, collapsed = this.collapsed;
		const active = this.root.doc.activeElement;
		const hadFocus = this.root.contains(active) && !active?.matches('input, textarea');
		// a cell that has the focus (or its tick) keeps it through the redraw its own change brings
		const inCell = active?.instanceOf(HTMLElement) && this.body.contains(active) && !active.matches('.binders-edit-field') ? active.closest<HTMLElement>('.binders-outliner-cell:not(.mod-title)') : null;
		const keep = inCell ? { path: inCell.closest<HTMLElement>('.binders-outliner-row')?.dataset.path ?? '', col: inCell.dataset.col ?? '' } : active === this.root.doc.body ? this.wantCell : null;
		this.wantCell = null;
		const before = this.drawnOnce ? places(this.body, '.binders-outliner-row', (el) => el.dataset.path ?? null) : null;
		this.drawnOnce = true;
		this.dirty = false;
		this.moves = [];
		this.rowsShown = rows;
		this.root.toggleClass('is-read-only', ro);
		this.root.toggleClass('is-sorted', !!sort);
		this.root.toggleClass('mod-synopses', synopses);
		this.labelCompact = cols.some((c) => this.compact(c));
		cols.forEach((c, i) => this.table.setCssProps({ [`--binders-ol-c${i}`]: `${this.widthOf(c)}px` }));
		// as wide as the pane, the title taking what the columns leave; wider only when they leave it too little
		this.table.setCssProps({ '--binders-ol-columns': `${cols.reduce((a, c) => a + this.widthOf(c), 0)}px` });

		const headKey = JSON.stringify([cols.map((c) => c.id), sort, ro, this.labelCompact]);
		if (headKey !== this.headKey) { this.headKey = headKey; this.drawHead(cols, sort); }

		// everything a row shows: when it's the same, the row drawn last time is used again
		const shared = JSON.stringify([this.labelCompact, cols.map((c) => c.id), ro, synopses, this.settings.labels, !!sort]);
		const drawn = new Map<string, Drawn>(), fresh: HTMLElement[] = [];
		let at: ChildNode | null = this.body.firstChild;
		for (const r of rows) {
			const path = r.item.path, open = r.item instanceof TFolder && !collapsed.has(path);
			const key = shared + JSON.stringify([path, r.depth, open, r.item instanceof TFolder && this.children(r.item).some((f) => this.isShown(f)), this.props(r.item), cols.map((c) => this.cellKey(r.item, c.id))]);
			const hit = this.drawn.get(path);
			const row = hit && hit.key === key && hit.item === r.item && !drawn.has(path) ? hit : this.drawRow(r, cols, open, key);
			drawn.set(path, row);
			if (row !== hit) fresh.push(row.el);
			row.el.removeClasses(['is-dragging', 'is-being-dragged-over', 'is-lifted']);
			if (row.el === at) at = at.nextSibling; else this.body.insertBefore(row.el, at);
		}
		while (at) { const next = at.nextSibling; at.remove(); at = next; }
		this.drawn = drawn;
		this.drawFoot(cols, rows);

		this.empty?.remove();
		this.empty = null;
		this.table.toggleClass('is-empty', !rows.length);
		if (!rows.length) {
			this.empty = emptyState(this.ctx, this.root);
		}

		// only what still shows stays selected; what a folded folder now hides hands over to that folder, so the
		// keyboard is never left with nothing
		const above = (p: string): string | null => { for (let q = p; q.includes('/');) { q = q.slice(0, q.lastIndexOf('/')); if (drawn.has(q)) return q; } return null; };
		for (const p of [...this.sel]) if (!drawn.has(p)) { this.sel.delete(p); const up = above(p); if (up) this.sel.add(up); }
		if (this.focused && !drawn.has(this.focused)) this.focused = above(this.focused);
		if (this.anchor && !drawn.has(this.anchor)) this.anchor = this.focused;
		this.paintSelection();
		if (before) settle(fresh);
		// rows glide to their places; ones just dropped, from where they were let go (their paths have changed if they
		// changed folders)
		if (before) glide(this.body, '.binders-outliner-row', (el) => el.dataset.path ?? null, before, this.root.getBoundingClientRect(), (el) => { const f = this.item(el.dataset.path); return f ? this.landing.get(f) : undefined; }, this.quick ? GLIDE_QUICK : undefined);
		this.landing.clear();
		this.quick = false;
		if (this.refocus) { this.focused = this.refocus; this.refocus = null; this.paintSelection(); this.rowEl(this.focused)?.focus({ preventScroll: true }); }
		else if (keep?.path && drawn.has(keep.path)) this.focusCell(keep.path, keep.col);
		else if (hadFocus) (this.rowEl(this.focused) ?? this.root).focus({ preventScroll: true });
		if (this.renameNext) {
			const row = drawn.get(this.renameNext);
			this.renameNext = null;
			if (row) { row.el.scrollIntoView({ block: 'nearest' }); row.title.edit(); }
		}
	}

	/** What a cell shows, for telling whether its row needs drawing again. */
	private cellKey(item: TAbstractFile, id: string): unknown {
		switch (id) {
			case 'label': case 'status': return null; // in the row's props
			case 'words': return this.words(item);
			case 'target': return this.target(item);
			case 'progress': return [this.words(item), this.target(item).n];
			case 'created': return item instanceof TFile ? item.stat.ctime : null;
			case 'modified': return item instanceof TFile ? item.stat.mtime : null;
			case 'compile': return [compiles(this.ctx.plugin, item), this.frontmatter(item).compile === false];
		}
		const prop = propOf(id);
		return prop ? this.frontmatter(item)[prop] ?? null : null;
	}

	private drawHead(cols: ColumnSpec[], sort: Sort): void {
		this.head.empty();
		const th = (id: string, i: number): HTMLElement => {
			const el = this.head.createDiv({ cls: 'binders-outliner-th', attr: { role: 'columnheader', 'data-col': id, tabindex: id === TITLE ? '0' : '-1', 'aria-haspopup': 'menu', 'aria-label': columnName(id) } });
			if (id === TITLE) el.addClass('mod-title'); else el.setCssStyles({ width: `var(--binders-ol-c${i})` });
			if (builtIn(id)?.numeric) el.addClass('mod-numeric');
			if (i >= 0 && cols[i] && this.compact(cols[i])) { el.addClass('mod-compact'); setIcon(el.createSpan({ cls: 'binders-outliner-th-icon' }), 'palette'); }
			el.createSpan({ cls: 'binders-outliner-th-name', text: columnName(id) });
			const on = sort?.id === id;
			el.setAttr('aria-sort', on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');
			if (on) setIcon(el.createSpan({ cls: 'binders-outliner-th-sort', attr: { 'aria-hidden': 'true' } }), sort.dir === 1 ? 'arrow-up' : 'arrow-down');
			if (id !== TITLE) {
				const grip = el.createDiv({ cls: 'binders-outliner-resizer', attr: { 'aria-hidden': 'true' } });
				grip.addEventListener('pointerdown', (e) => this.resize(e, id, i));
				grip.addEventListener('dblclick', (e) => { e.stopPropagation(); this.setColumns(this.columns().map((c) => (c.id === id ? { id } : c))); });
				grip.addEventListener('click', (e) => e.stopPropagation());
				el.addEventListener('pointerdown', (e) => this.dragColumn(e, id, el));
			}
			// a click sorts, as in a base: ascending, descending, then binder order again; the menu is a right-click (or
			// Enter) away. With no right-click to give (a phone), a tap opens the menu.
			el.addEventListener('click', (e) => { e.stopPropagation(); if (this.headerDragged) return; if (Platform.isMobile) this.columnMenu(id, el); else this.setSort(nextSort(this.sort, id)); });
			el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.columnMenu(id, el, e); });
			el.addEventListener('keydown', (e) => this.onHeadKey(e, id, el));
			return el;
		};
		th(TITLE, -1);
		cols.forEach((c, i) => th(c.id, i));
		const add = this.head.createDiv({ cls: 'binders-outliner-th mod-add clickable-icon', attr: { role: 'button', tabindex: '0', 'aria-label': 'Columns', 'aria-haspopup': 'menu' } });
		setIcon(add, 'plus');
		const show = (e?: MouseEvent) => { const m = new Menu(); this.columnItems(m); this.showUnder(m, add, e); };
		add.addEventListener('click', () => show());
		add.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); show(); } });
	}

	private drawRow(r: Row, cols: ColumnSpec[], open: boolean, key: string): Drawn {
		const item = r.item, folder = item instanceof TFolder, path = item.path, ro = this.ro, p = this.props(item);
		const el = createDiv({ cls: 'binders-outliner-row' + (folder ? ' is-folder' : ''), attr: { role: 'row', tabindex: '-1', 'data-path': path, 'aria-level': String(r.depth + 1), 'aria-selected': 'false', 'aria-label': nameOf(item) } });
		if (folder) el.setAttr('aria-expanded', String(open));
		el.setCssProps({ '--binders-ol-depth': String(r.depth) });
		const cell = el.createDiv({ cls: 'binders-outliner-cell mod-title', attr: { role: 'gridcell', 'data-col': TITLE } });
		const twisty = cell.createDiv({ cls: 'binders-outliner-chevron' + (folder ? ' collapse-icon' : ''), attr: { 'aria-hidden': 'true' } });
		if (folder) { setIcon(twisty, 'right-triangle'); twisty.toggleClass('is-collapsed', !open); twisty.toggleClass('is-empty', !this.children(item).some((f) => this.isShown(f))); }
		const main = cell.createDiv({ cls: 'binders-outliner-main' });
		const title = editable(main, {
			cls: 'binders-outliner-name', value: nameOf(item), placeholder: 'Title', label: 'Rename', singleLine: true, clickToEdit: false, readOnly: ro,
			save: (t) => this.rename(item, t), onEditing: (on) => this.onEditing(on, el),
		});
		let synopsis: Editable | null = null;
		if (this.synopses) {
			synopsis = editable(main, {
				cls: 'binders-outliner-synopsis', value: p.synopsis, placeholder: 'Add a synopsis', label: `Synopsis of ${nameOf(item)}`, readOnly: ro,
				// a click selects a row; a click on a selected row's synopsis edits it
				shouldEdit: () => this.sel.has(path),
				save: async (t) => {
					const note = item instanceof TFolder ? await this.store.ensureFolderNote(item) : noteOf(this.ctx, item);
					if (note) await this.ctx.setProps(note, { synopsis: t });
				},
				onEditing: (on) => this.onEditing(on, el),
			});
		}
		const fields = new Map<string, Editable>();
		cols.forEach((c, i) => {
			// (reached with the arrow keys from its row: Right, then Left and Right between cells)
			const td = el.createDiv({ cls: 'binders-outliner-cell', attr: { role: 'gridcell', 'data-col': c.id, tabindex: '-1' } });
			td.setCssStyles({ width: `var(--binders-ol-c${i})` });
			if (builtIn(c.id)?.numeric) td.addClass('mod-numeric');
			const t = this.drawCell(td, c.id, item, p, el);
			if (t) fields.set(c.id, t);
		});
		el.createDiv({ cls: 'binders-outliner-cell mod-filler', attr: { role: 'presentation' } });
		return { el, key, item, title, synopsis, target: fields.get('target') ?? null, fields };
	}

	/** Fills a cell. Returns its field, if it has one to type in, so a key or a menu can start it. */
	private drawCell(td: HTMLElement, id: string, item: TFile | TFolder, p: SceneProps, row: HTMLElement): Editable | null {
		const ro = this.ro, presets = this.settings.labels;
		switch (id) {
			case 'label':
				if (!ro) td.addClass('is-menu');
				td.toggleClass('mod-compact', this.labelCompact);
				// (the color alone says nothing to a screen reader)
				if (this.labelCompact && p.label) td.setAttr('aria-label', `Label: ${labelName(p.label, presets)}`);
				if (p.label) { labelDot(td, p.label, presets); td.createSpan({ cls: 'binders-outliner-value', text: labelName(p.label, presets) }); }
				return null;
			case 'status':
				if (!ro) td.addClass('is-menu');
				if (p.status) td.createSpan({ cls: 'binders-chip', text: p.status });
				return null;
			case 'words': {
				const n = this.words(item);
				if (n != null) td.createSpan({ cls: 'binders-outliner-value', text: n.toLocaleString(), attr: { 'aria-label': wordsLabel(n) } });
				return null;
			}
			case 'target': {
				const t = this.target(item);
				td.toggleClass('is-total', !t.own);
				// a folder without a target of its own shows its notes' targets together, until it's given one
				return editable(td, {
					// (shown as numbers are written here; typed as plain digits, so what's shown never has to be read back)
					cls: 'binders-outliner-field', value: t.own && t.n ? t.n.toLocaleString() : '', editValue: t.own && t.n ? String(t.n) : '', placeholder: !t.own && t.n ? t.n.toLocaleString() : '', label: `Target of ${nameOf(item)}`,
					singleLine: true, allowEmpty: true, numeric: true, readOnly: ro, shouldEdit: () => this.sel.has(item.path),
					save: async (typed) => {
						const n = parseTarget(typed);
						if (n == null) throw new Error('A target is a whole number of words.');
						// for every selected row, as a label or a status picked in one is
						await setAll(this.ctx, this.withSelection(item), { target: n });
					},
					onEditing: (on) => this.onEditing(on, row),
				});
			}
			case 'progress': {
				const done = progress(this.words(item), this.target(item).n);
				if (done == null) return null;
				const pct = Math.floor(done * 100);
				const bar = td.createDiv({ cls: 'binders-progress' + (done >= 1 ? ' is-complete' : ''), attr: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': `${pct}% of its target` } });
				bar.createDiv({ cls: 'binders-progress-bar' }).setCssStyles({ width: `${pct}%` });
				td.createSpan({ cls: 'binders-outliner-percent', text: `${pct}%` });
				return null;
			}
			case 'compile': {
				// ticked unless this note, or a folder it's in, is left out; a folder's tick is for everything in it
				const box = td.createEl('input', { type: 'checkbox', attr: { 'aria-label': `Include ${nameOf(item)} in compile`, tabindex: '-1' } });
				box.checked = compiles(this.ctx.plugin, item);
				box.disabled = ro || (!box.checked && this.frontmatter(item).compile !== false);
				box.addEventListener('click', (e) => e.stopPropagation());
				box.addEventListener('change', () => void setCompile(this.ctx, [item], box.checked));
				this.tickByCell(td, box);
				return null;
			}
			case 'created': case 'modified':
				if (item instanceof TFile) td.createSpan({ cls: 'binders-outliner-value', text: date(id === 'created' ? item.stat.ctime : item.stat.mtime) });
				return null;
		}
		const prop = propOf(id);
		if (!prop) return null;
		const v = this.frontmatter(item)[prop];
		const write = async (value: unknown, all = false) => {
			if (this.ro) throw new Error('This binder is read only.');
			for (const it of all ? this.withSelection(item) : [item]) {
				const note = it instanceof TFolder ? await this.store.ensureFolderNote(it) : noteOf(this.ctx, it);
				if (note) await this.store.setProps(note, { [prop]: value });
			}
		};
		if (typeof v === 'boolean') {
			const box = td.createEl('input', { type: 'checkbox', attr: { 'aria-label': prop, tabindex: '-1' } });
			box.checked = v;
			box.disabled = ro;
			box.addEventListener('click', (e) => e.stopPropagation());
			box.addEventListener('change', () => { void write(box.checked).catch((e) => new Notice(plain(e))); });
			this.tickByCell(td, box);
			return null;
		}
		if (v && typeof v === 'object' && !Array.isArray(v)) { td.createSpan({ cls: 'binders-outliner-value', text: '…' }); return null; }
		return editable(td, {
			cls: 'binders-outliner-field', value: text(v), placeholder: '', label: `${prop} of ${nameOf(item)}`, singleLine: true, allowEmpty: true, readOnly: ro,
			shouldEdit: () => this.sel.has(item.path),
			save: (typed) => write(parseTyped(typed, v), true),
			onEditing: (on) => this.onEditing(on, row),
		});
	}

	/** The last row: how many notes show, and the columns that add up. */
	private drawFoot(cols: ColumnSpec[], rows: Row[]): void {
		this.foot.empty();
		const scenes = this.scenesIn(this.ctx.folder);
		const title = this.foot.createDiv({ cls: 'binders-outliner-cell mod-title', attr: { role: 'gridcell' } });
		title.createSpan({ text: rows.length ? `${scenes.length.toLocaleString()} ${scenes.length === 1 ? 'note' : 'notes'}` : '' });
		let words: number | null = 0;
		for (const f of scenes) { const w = this.ctx.words(f); if (w == null) { words = null; break; } words += w; }
		const own = this.props(this.ctx.folder).target, target = own > 0 ? own : scenes.reduce((a, f) => a + this.ctx.props(f).target, 0);
		cols.forEach((c, i) => {
			const td = this.foot.createDiv({ cls: 'binders-outliner-cell', attr: { role: 'gridcell' } });
			td.setCssStyles({ width: `var(--binders-ol-c${i})` });
			if (builtIn(c.id)?.numeric) td.addClass('mod-numeric');
			if (!rows.length) return;
			if (c.id === 'words' && words != null) td.setText(words.toLocaleString());
			if (c.id === 'target' && target) td.setText(target.toLocaleString());
			if (c.id === 'progress') { const done = progress(words, target); if (done != null) td.setText(`${Math.floor(done * 100)}%`); }
		});
		this.foot.createDiv({ cls: 'binders-outliner-cell mod-filler', attr: { role: 'presentation' } });
	}

	// ---- selection ----

	private rowEls(): HTMLElement[] { return [...this.body.querySelectorAll<HTMLElement>(':scope > .binders-outliner-row')]; }
	private rowEl(path: string | null): HTMLElement | null { return path ? this.drawn.get(path)?.el ?? null : null; }
	private rowOf(e: Event): HTMLElement | null { return (e.target as HTMLElement).closest?.<HTMLElement>('.binders-outliner-row') ?? null; }
	private item(path: string | undefined): TFile | TFolder | null {
		const f = path ? this.ctx.app.vault.getAbstractFileByPath(path) : null;
		return f instanceof TFile || f instanceof TFolder ? f : null;
	}

	private select(paths: string[], focus: string | null = paths[paths.length - 1] ?? null, anchor = focus): void {
		this.sel = new Set(paths);
		this.focused = focus;
		this.anchor = anchor;
		this.paintSelection();
	}

	private paintSelection(): void {
		const rows = this.rowEls();
		const tab = this.rowEl(this.focused) ?? rows.find((r) => this.sel.has(r.dataset.path)) ?? rows[0];
		for (const r of rows) {
			const on = this.sel.has(r.dataset.path);
			r.toggleClass('is-selected', on);
			r.setAttr('aria-selected', String(on));
			r.setAttr('tabindex', r === tab ? '0' : '-1');
		}
	}

	/** The items an action applies to: the selection if the row is in it, else just the row. A folder selected along
	    with things inside it stands for them. */
	private targets(row: HTMLElement): (TFile | TFolder)[] {
		const paths = this.sel.has(row.dataset.path) ? this.rowEls().map((r) => r.dataset.path).filter((p) => this.sel.has(p)) : [row.dataset.path];
		const items = paths.map((p) => this.item(p)).filter((f): f is TFile | TFolder => !!f);
		return items.filter((f) => !items.some((g) => g instanceof TFolder && f.path.startsWith(g.path + '/')));
	}

	/** A row's item with the rest of the selection, if it's part of one: what a value typed into one of its cells is for. */
	private withSelection(item: TFile | TFolder): (TFile | TFolder)[] {
		// (every selected row, a folder's own and the notes in it alike: a property is set on what's selected, not on
		// what a folder stands for when it's dragged or deleted)
		if (!this.sel.has(item.path)) return [item];
		return this.rowEls().map((r) => this.item(r.dataset.path)).filter((f): f is TFile | TFolder => !!f && this.sel.has(f.path));
	}

	private cells(row: HTMLElement): HTMLElement[] { return [...row.querySelectorAll<HTMLElement>(':scope > .binders-outliner-cell[data-col]:not(.mod-title)')]; }

	/** Puts the focus in a row's cell (or on the row, if it has no such cell any more). */
	private focusCell(path: string, col: string): void {
		const row = this.rowEl(path);
		(row?.querySelector<HTMLElement>(`:scope > .binders-outliner-cell[data-col="${CSS.escape(col)}"]`) ?? row)?.focus({ preventScroll: true });
	}

	private clickSelect(row: HTMLElement, e: MouseEvent | KeyboardEvent): void {
		const path = row.dataset.path;
		if (e.shiftKey && this.anchor) {
			const order = this.rowEls().map((r) => r.dataset.path), a = order.indexOf(this.anchor), b = order.indexOf(path);
			if (a >= 0 && b >= 0) { const range = order.slice(Math.min(a, b), Math.max(a, b) + 1); this.select(Keymap.isModEvent(e) ? [...new Set([...this.sel, ...range])] : range, path, this.anchor); return; }
		}
		// ("Select more" in a row's menu, by touch: each tap adds a row or takes it out, until none is left)
		if (Keymap.isModEvent(e) || this.picking) {
			const next = new Set(this.sel);
			if (next.has(path)) next.delete(path); else next.add(path);
			this.select([...next], path, path);
			if (!next.size) this.picking = false;
			return;
		}
		this.select([path]);
	}
	private picking = false;
	private edgeSince = 0;

	// ---- pointer ----

	private onClick(e: MouseEvent): void {
		if (this.press.noClick) return;
		const t = e.target as HTMLElement;
		if (t.closest('.binders-outliner-head')) return;
		const row = this.rowOf(e);
		// the space below the rows: nothing selected, and the keyboard stays here (an arrow key goes back to the rows)
		if (!row) { if (!e.shiftKey && !Keymap.isModEvent(e) && !t.closest('.binders-empty, .binders-view-synopsis-row')) { this.select([]); this.root.focus({ preventScroll: true }); } return; }
		const item = this.item(row.dataset.path);
		if (t.closest('.binders-outliner-chevron') && item instanceof TFolder) { this.toggle(item); return; }
		// a tap on a note's name opens it, as a tap on a note in the file explorer does
		if (this.press.pointer === 'touch' && !this.picking && t.closest('.binders-outliner-name') && !t.closest('.is-editing')) { this.select([row.dataset.path]); this.open(row, false); return; }
		const editing = !!t.closest('.is-editing');
		const plain = !e.shiftKey && !Keymap.isModEvent(e);
		// a cell with a menu or a field acts on a row that's already selected (the click that selects a row only
		// selects it, as in a base's table), and then for every row selected with it
		const was = this.sel.has(row.dataset.path);
		const menuCell = plain ? t.closest<HTMLElement>('.binders-outliner-cell.is-menu') : null;
		const field = plain && was ? t.closest<HTMLElement>('.binders-outliner-field') : null;
		if (!(was && (menuCell || field))) this.clickSelect(row, e);
		const cell = t.closest<HTMLElement>('.binders-outliner-cell:not(.mod-title):not(.mod-filler)');
		if (!editing && !t.closest('input')) (cell && was ? cell : row).focus({ preventScroll: true });
		if (menuCell && was) this.cellMenu(menuCell, row);
	}

	private onDblClick(e: MouseEvent): void {
		const row = this.rowOf(e), t = e.target as HTMLElement;
		if (!row || t.closest('.is-editing, .binders-outliner-chevron, input, .binders-outliner-cell:not(.mod-title), .binders-outliner-synopsis.is-editable:not(.is-empty)')) return;
		this.open(row, Keymap.isModEvent(e));
	}

	private open(row: HTMLElement, newLeaf: ReturnType<typeof Keymap.isModEvent>): void {
		const f = this.item(row.dataset.path);
		if (f instanceof TFolder) this.ctx.navigate(f, newLeaf);
		else if (f instanceof TFile) void this.ctx.openFile(f, newLeaf);
	}

	private toggle(folder: TFolder, open?: boolean): void {
		const collapsed = this.collapsed, want = open ?? collapsed.has(folder.path);
		if (want) collapsed.delete(folder.path); else collapsed.add(folder.path);
		this.focused = folder.path;
		this.setCollapsed(collapsed);
		this.rowEl(folder.path)?.focus({ preventScroll: true });
	}

	/** What a cell does when it's asked to (Enter, F2 or Space with the focus in it): its menu, its tick, or its field. */
	private act(cell: HTMLElement, row: HTMLElement): void {
		const path = row.dataset.path, col = cell.dataset.col ?? '';
		if (this.ro || !path) return;
		if (!this.sel.has(path)) this.select([path]);
		if (cell.hasClass('is-menu')) { this.wantCell = { path, col }; this.cellMenu(cell, row); return; }
		const box = cell.querySelector<HTMLInputElement>('input[type="checkbox"]');
		if (box) { if (!box.disabled) { this.wantCell = { path, col }; box.click(); } return; }
		this.drawn.get(path)?.fields.get(col)?.edit();
	}

	private onContextMenu(e: MouseEvent): void {
		const t = e.target as HTMLElement;
		if (t.closest('.binders-outliner-head, input, textarea, .is-editing')) return;
		e.preventDefault();
		const row = this.rowOf(e);
		if (!row) {
			// the outliner itself: what can be made here, and how it shows
			const menu = new Menu();
			if (!this.ro) this.newMenu(menu);
			this.menu(menu);
			menu.showAtMouseEvent(e);
			return;
		}
		if (this.press.pointer === 'touch') return; // a long press opens it
		if (!this.sel.has(row.dataset.path)) this.select([row.dataset.path]);
		this.rowMenu(row).showAtMouseEvent(e);
	}

	private rowMenu(row: HTMLElement): Menu {
		const items = this.targets(row), one = items.length === 1 ? items[0] : null;
		const sibs = one?.parent && !this.sort ? this.children(one.parent).filter((f) => this.isShown(f)) : [], i = one ? sibs.indexOf(one) : -1;
		return itemMenu(this.ctx, items, {
			pick: () => { this.picking = true; },
			rename: (f) => this.drawn.get(f.path)?.title.edit(),
			synopsis: (f) => this.editSynopsis(f),
			up: one && i > 0 ? () => void this.step(one, -1) : null,
			down: one && i >= 0 && i < sibs.length - 1 ? () => void this.step(one, 1) : null,
			remove: (all) => void this.remove(all),
			made: (f, rename) => {
				this.select([f.path]);
				this.refocus = f.path;
				if (rename) this.renameNext = f.path;
				if (this.busy()) this.dirty = true; else this.draw();
			},
		});
	}

	private isShown(f: TAbstractFile): boolean { return f instanceof TFolder || (f instanceof TFile && this.ctx.visible(f)); }

	private editSynopsis(f: TAbstractFile): void {
		if (!this.synopses) { this.setPrefs({ synopsis: true }); this.draw(); }
		this.drawn.get(f.path)?.synopsis?.edit();
	}

	/** A label or status cell: its menu, under it, for the row (or the rows selected with it). */
	private cellMenu(cell: HTMLElement, row: HTMLElement): void {
		if (this.ro) return;
		const at = this.item(row.dataset.path), items = at ? this.withSelection(at) : [], menu = new Menu();
		if (cell.dataset.col === 'label') labelItems(this.ctx, menu, items); else statusItems(this.ctx, menu, items);
		// the focus comes back to the cell when the menu goes, whatever was picked
		const path = row.dataset.path ?? '', col = cell.dataset.col ?? '', inCell = this.root.doc.activeElement === cell;
		menu.onHide(() => window.setTimeout(() => { const a = this.root.doc.activeElement; if (this.root.isConnected && (a === this.root.doc.body || a === cell) && path) { if (inCell) this.focusCell(path, col); else this.rowEl(path)?.focus({ preventScroll: true }); } }, 0));
		this.showUnder(menu, cell);
	}

	private showUnder(menu: Menu, el: HTMLElement, e?: MouseEvent): void {
		if (e && e.type === 'contextmenu') { menu.showAtMouseEvent(e); return; }
		const r = el.getBoundingClientRect();
		menu.showAtPosition({ x: r.left, y: r.bottom + 2, width: r.width, overlap: true }, el.doc);
	}

	// ---- keyboard ----

	private onKey(e: KeyboardEvent): void {
		if (e.isComposing) return;
		// nothing in it has the focus (a click below the rows): an arrow goes back to the rows
		if (e.target === this.root) {
			const rows = this.rowEls(), up = e.key === 'ArrowUp' || e.key === 'End' || e.key === 'PageUp';
			if (!rows.length || !['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key) || e.altKey || Keymap.isModEvent(e)) return;
			const to = this.rowEl(this.focused) ?? (up ? rows[rows.length - 1] : rows[0]);
			e.preventDefault();
			this.select([to.dataset.path ?? '']);
			to.focus({ preventScroll: true });
			to.scrollIntoView({ block: 'nearest' });
			return;
		}
		const row = this.rowOf(e);
		if (!row) return;
		const at = (e.target as HTMLElement).closest<HTMLElement>('.binders-outliner-cell:not(.mod-title)');
		if (at && (e.target === at || (e.target as HTMLElement).matches('input[type="checkbox"]'))) { this.onCellKey(e, at, row); return; }
		if (e.target !== row) return;
		const rows = this.rowEls(), i = rows.indexOf(row), item = this.item(row.dataset.path), mod = Keymap.isModEvent(e);
		const go = (to: HTMLElement | undefined) => {
			if (!to) return;
			e.preventDefault();
			if (e.shiftKey) {
				const order = rows.map((r) => r.dataset.path), a = order.indexOf(this.anchor ?? row.dataset.path), b = order.indexOf(to.dataset.path);
				this.select(order.slice(Math.min(a, b), Math.max(a, b) + 1), to.dataset.path, this.anchor ?? row.dataset.path);
			} else this.select([to.dataset.path]);
			to.focus({ preventScroll: true });
			to.scrollIntoView({ block: 'nearest' });
		};
		// Alt with an arrow moves the row (with the rows selected along with it): up and down among its folder's, left
		// out of its folder, right into the folder above it
		if (e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !mod) {
			e.preventDefault();
			if (this.ro || !item) return;
			if (this.sort) { this.whySorted(); return; }
			const rtl = getComputedStyle(this.root).direction === 'rtl';
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown') void this.step(item, e.key === 'ArrowUp' ? -1 : 1);
			else void this.shift(item, (e.key === 'ArrowLeft') !== rtl ? -1 : 1);
			return;
		}
		if (mod && e.key.toLowerCase() === 'a' && !e.shiftKey && !e.altKey) { e.preventDefault(); this.select(rows.map((r) => r.dataset.path), row.dataset.path, rows[0]?.dataset.path); return; }
		if (e.altKey || (mod && e.key !== 'Enter')) return;
		const level = (r: HTMLElement) => Number(r.getAttribute('aria-level'));
		// a page is the rows that fit, less one so the last row seen stays in sight
		const page = Math.max(1, Math.floor((this.root.clientHeight - this.head.offsetHeight) / Math.max(1, row.offsetHeight)) - 1);
		// letters go to the next row whose name starts with them, as in a file manager
		if (e.key.length === 1 && (e.key !== ' ' || (this.typed && Date.now() - this.typedAt < 700))) {
			this.typed = (Date.now() - this.typedAt < 700 ? this.typed : '') + e.key.toLowerCase();
			this.typedAt = Date.now();
			const starts = (r: HTMLElement) => (r.getAttribute('aria-label') ?? '').toLowerCase().startsWith(this.typed);
			// (a second letter narrows from the row it's on; a first letter looks on from the next)
			const from = this.typed.length > 1 ? i : i + 1, to = [...rows.slice(from), ...rows.slice(0, from)].find(starts);
			e.preventDefault();
			if (to && to !== row) { this.select([to.dataset.path ?? '']); to.focus({ preventScroll: true }); to.scrollIntoView({ block: 'nearest' }); }
			return;
		}
		switch (e.key) {
			case 'ArrowUp': go(rows[i - 1]); break;
			case 'ArrowDown': go(rows[i + 1]); break;
			case 'PageUp': go(rows[Math.max(0, i - page)]); break;
			case 'PageDown': go(rows[Math.min(rows.length - 1, i + page)]); break;
			case 'ArrowRight':
				// as in a tree with columns: a folded folder unfolds; from anything else, into the row's cells
				e.preventDefault();
				if (item instanceof TFolder && this.collapsed.has(item.path)) this.toggle(item, true);
				else this.cells(row)[0]?.focus({ preventScroll: true });
				break;
			case 'ArrowLeft':
				e.preventDefault();
				if (item instanceof TFolder && !this.collapsed.has(item.path) && !this.longform) this.toggle(item, false);
				else go(rows.slice(0, i).reverse().find((r) => level(r) < level(row)));
				break;
			case 'Home': go(rows[0]); break;
			case 'End': go(rows[rows.length - 1]); break;
			case 'Enter': e.preventDefault(); this.open(row, mod); break;
			case ' ': if (item instanceof TFolder) { e.preventDefault(); this.toggle(item); } break;
			case 'Delete': case 'Backspace': if (!this.ro) { e.preventDefault(); void this.remove(this.targets(row)); } break;
			case 'F2': if (!this.ro) { e.preventDefault(); this.drawn.get(row.dataset.path)?.title.edit(); } break;
			case 'Escape': if (this.sel.size > 1) { e.preventDefault(); this.select([row.dataset.path]); } break;
			case 'ContextMenu': this.menuAt(e, row); break;
			case 'F10': if (e.shiftKey) this.menuAt(e, row); break;
		}
	}

	/** Keys with the focus in a cell: the arrows go from cell to cell (and Left from the first, or Escape, back to the
	    row); Enter, F2 or Space does what the cell does. */
	private onCellKey(e: KeyboardEvent, cell: HTMLElement, row: HTMLElement): void {
		if (e.altKey || Keymap.isModEvent(e)) return;
		const cells = this.cells(row), i = cells.indexOf(cell), rows = this.rowEls(), r = rows.indexOf(row), col = cell.dataset.col ?? '';
		const rtl = getComputedStyle(this.root).direction === 'rtl', back = rtl ? 'ArrowRight' : 'ArrowLeft', on = rtl ? 'ArrowLeft' : 'ArrowRight';
		const to = (el: HTMLElement | null | undefined) => { if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } };
		const other = (d: number) => {
			const next = rows[r + d];
			if (!next) return;
			this.select([next.dataset.path ?? '']);
			to(next.querySelector<HTMLElement>(`:scope > .binders-outliner-cell[data-col="${CSS.escape(col)}"]`) ?? next);
		};
		switch (e.key) {
			case back: e.preventDefault(); to(i > 0 ? cells[i - 1] : row); break;
			case on: e.preventDefault(); to(cells[i + 1]); break;
			case 'ArrowUp': e.preventDefault(); other(-1); break;
			case 'ArrowDown': e.preventDefault(); other(1); break;
			case 'Home': e.preventDefault(); to(cells[0]); break;
			case 'End': e.preventDefault(); to(cells[cells.length - 1]); break;
			case 'Escape': e.preventDefault(); to(row); break;
			case 'Enter': case 'F2': case ' ':
				// (Space on a tick itself is the tick's own)
				if (e.key === ' ' && e.target !== cell) { this.wantCell = { path: row.dataset.path ?? '', col }; return; }
				e.preventDefault();
				this.act(cell, row);
				break;
		}
	}

	private menuAt(e: KeyboardEvent, row: HTMLElement): void {
		e.preventDefault();
		if (!this.sel.has(row.dataset.path)) this.select([row.dataset.path]);
		const r = row.getBoundingClientRect();
		this.rowMenu(row).showAtPosition({ x: r.left + 24, y: r.bottom }, this.root.doc);
	}

	private onHeadKey(e: KeyboardEvent, id: string, el: HTMLElement): void {
		const ths = [...this.head.querySelectorAll<HTMLElement>('.binders-outliner-th[data-col]')], i = ths.indexOf(el);
		if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.columnMenu(id, el); return; }
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault(); e.stopPropagation();
		const d = (e.key === 'ArrowLeft') === (getComputedStyle(this.head).direction !== 'rtl') ? -1 : 1;
		if (e.altKey) { this.moveColumn(id, d); return; }
		const to = ths[i + d];
		if (!to) return;
		el.setAttr('tabindex', '-1');
		to.setAttr('tabindex', '0');
		to.focus();
	}

	// ---- actions ----

	private async rename(f: TAbstractFile, name: string): Promise<void> {
		const was = f.path;
		await renameItem(this.ctx, f, name);
		if (was === f.path) return;
		if (this.sel.delete(was)) this.sel.add(f.path);
		if (this.focused === was) this.focused = f.path;
		if (this.anchor === was) this.anchor = f.path;
		const collapsed = this.collapsed;
		if (collapsed.delete(was)) { collapsed.add(f.path); this.setPrefs({ collapsed: [...collapsed] }); }
	}

	private async remove(items: TAbstractFile[]): Promise<void> {
		if (!items.length) return;
		// the focus goes to the row after the deleted ones (or before them), so the keyboard carries on from there
		const order = this.rowEls().map((r) => r.dataset.path), gone = (p: string) => items.some((f) => p === f.path || p.startsWith(f.path + '/'));
		const last = Math.max(...items.map((f) => order.indexOf(f.path)));
		const next = order.slice(last + 1).find((p) => !gone(p)) ?? order.slice(0, Math.max(0, last)).reverse().find((p) => !gone(p)) ?? null;
		if (!(await removeItems(this.ctx, items))) { this.focus(); return; }
		if (next) { this.select([next]); this.refocus = next; }
		if (!this.busy()) this.draw();
	}

	/** The rows a key on `item`'s row moves: the selection it's part of, if that's all in one folder; else itself. */
	private block(item: TAbstractFile): TAbstractFile[] {
		const row = this.rowEl(item.path), all: TAbstractFile[] = row ? this.targets(row) : [item];
		return all.includes(item) && all.every((f) => f.parent === item.parent) ? all : [item];
	}

	/** After rows were moved by a key: they stay selected, the one the key was pressed on focused and in sight. */
	private after(item: TAbstractFile, items: TAbstractFile[]): void {
		this.sel = new Set(items.map((f) => f.path));
		this.focused = this.anchor = item.path;
		this.draw();
		this.rowEl(item.path)?.focus({ preventScroll: true });
		this.rowEl(item.path)?.scrollIntoView({ block: 'nearest' });
	}

	/** Alt+Up, Alt+Down, "Move up", "Move down": one place among the rows that show in its folder, taking the rows
	    selected with it along as one. */
	private async step(item: TAbstractFile, delta: number): Promise<void> {
		const folder = item.parent;
		if (!folder) return;
		const shown: TAbstractFile[] = this.children(folder).filter((f) => this.isShown(f)), picked = this.block(item);
		const items = shown.filter((f) => picked.includes(f));
		if (!items.length) return;
		const first = shown.indexOf(items[0]), last = shown.indexOf(items[items.length - 1]);
		// the row they pass: the one above the first of them, or below the last
		const past = delta < 0 ? shown.slice(0, first).reverse().find((f) => !items.includes(f)) : shown.slice(last + 1).find((f) => !items.includes(f));
		if (!past) return;
		const rest = (this.store.orderedChildren(folder) ?? []).filter((x) => !items.includes(x));
		try { await this.store.put(items, folder, delta < 0 ? past : rest[rest.indexOf(past) + 1] ?? null); } catch (e) { new Notice(plain(e)); }
		this.after(item, items);
	}

	/** Alt+Left, Alt+Right: out of its folder (to just after it), or into the folder just above it (as its last). In a
	    Longform project, one indent less or more. */
	private async shift(item: TAbstractFile, dir: number): Promise<void> {
		const folder = item.parent;
		if (!folder) return;
		const all = this.store.orderedChildren(folder) ?? [], picked = this.block(item), items = all.filter((f) => picked.includes(f));
		if (!items.length) return;
		const rest = all.filter((f) => !items.includes(f));
		try {
			if (this.longform) {
				const depth = Math.max(0, (this.rowsShown.find((r) => r.item === items[0])?.depth ?? 0) + dir);
				await this.store.put(items, folder, all.slice(all.indexOf(items[items.length - 1]) + 1).find((f) => !items.includes(f)) ?? null, depth);
			} else if (dir < 0) {
				const out = folder.parent;
				if (folder === this.ctx.folder || !out) return;
				const sibs = (this.store.orderedChildren(out) ?? []).filter((f) => !items.includes(f));
				await this.store.put(items, out, sibs[sibs.indexOf(folder) + 1] ?? null);
			} else {
				const above = all.slice(0, all.indexOf(items[0])).reverse().find((f) => !items.includes(f) && this.isShown(f));
				if (!(above instanceof TFolder) || !rest.includes(above)) return;
				const collapsed = this.collapsed;
				if (collapsed.delete(above.path)) this.setPrefs({ collapsed: [...collapsed] });
				await this.store.put(items, above, null);
			}
		} catch (e) { new Notice(plain(e)); }
		this.after(item, items);
	}

	/** A new note or folder: after the row that has the focus, in its folder (inside it, if that's an open folder), or
	    last in the folder shown; then named in place, as a new note in the file explorer is. */
	create(kind: 'note' | 'folder'): void { void this.make(kind); }

	private async make(kind: 'note' | 'folder'): Promise<void> {
		const at = this.item(this.focused ?? undefined), collapsed = this.collapsed;
		let folder = this.ctx.folder, index = Infinity, depth: number | undefined;
		if (at && this.sel.has(at.path) && at.parent) {
			if (at instanceof TFolder && !collapsed.has(at.path)) { folder = at; index = 0; }
			else { folder = at.parent; index = (this.store.orderedChildren(folder) ?? []).indexOf(at) + 1; }
			if (this.longform) depth = this.rowsShown.find((r) => r.item === at)?.depth;
		}
		try {
			const made = kind === 'note' ? await this.store.newScene(folder, index, 'Untitled', depth) : await this.store.newFolder(folder, index);
			if (made instanceof TFile) this.ctx.made(made);
			this.select([made.path]);
			this.renameNext = made.path;
			if (this.busy()) this.dirty = true; else this.draw();
		} catch (e) { new Notice(plain(e)); }
	}

	// ---- columns ----

	private setSort(sort: Sort): void { this.setPrefs({ sort }); this.draw(); }

	private columnMenu(id: string, el: HTMLElement, e?: MouseEvent): void {
		const cols = this.columns(), i = cols.findIndex((c) => c.id === id), sort = this.sort, menu = new Menu();
		const on = (dir: 1 | -1) => sort?.id === id && sort.dir === dir;
		menu.addItem((it) => it.setSection('sort').setTitle('Sort ascending').setIcon('arrow-up-narrow-wide').setChecked(on(1)).onClick(() => this.setSort(on(1) ? null : { id, dir: 1 })));
		menu.addItem((it) => it.setSection('sort').setTitle('Sort descending').setIcon('arrow-down-wide-narrow').setChecked(on(-1)).onClick(() => this.setSort(on(-1) ? null : { id, dir: -1 })));
		if (sort) menu.addItem((it) => it.setSection('sort').setTitle('Binder order').setIcon('list-ordered').onClick(() => this.setSort(null)));
		if (this.canKeepSort) menu.addItem((it) => it.setSection('sort').setTitle('Make this the binder order').setIcon('list-checks').onClick(() => void this.keepSort()));
		if (id !== TITLE) {
			if (i > 0) menu.addItem((it) => it.setSection('column').setTitle('Move left').setIcon('arrow-left').onClick(() => this.moveColumn(id, -1)));
			if (i < cols.length - 1) menu.addItem((it) => it.setSection('column').setTitle('Move right').setIcon('arrow-right').onClick(() => this.moveColumn(id, 1)));
			menu.addItem((it) => it.setSection('column').setTitle('Hide column').setIcon('eye-off').onClick(() => this.setColumns(cols.filter((c) => c.id !== id))));
		} else menu.addItem((it) => it.setSection('column').setTitle('Show synopses').setIcon('text').setChecked(this.synopses).onClick(() => { this.setPrefs({ synopsis: !this.synopses }); this.draw(); }));
		this.showUnder(menu, el, e);
	}

	private moveColumn(id: string, d: number): void {
		const cols = this.columns(), i = cols.findIndex((c) => c.id === id);
		if (i < 0 || i + d < 0 || i + d >= cols.length) return;
		this.setColumns(move(cols, i, i + d));
		this.head.querySelector<HTMLElement>(`.binders-outliner-th[data-col="${CSS.escape(id)}"]`)?.focus();
	}

	/** A column just added is brought into sight (in a narrow pane it's past the edge). */
	private showColumn(id: string): void {
		window.setTimeout(() => Array.from(this.head.querySelectorAll<HTMLElement>('[data-col]')).find((h) => h.dataset.col === id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 50);
	}

	/** Which columns show: Binders' own, then your notes' properties, each ticked when it's shown. */
	private columnItems(menu: Menu): void {
		const cols = this.columns(), has = (id: string) => cols.some((c) => c.id === id);
		const flip = (id: string) => { this.setColumns(has(id) ? cols.filter((c) => c.id !== id) : [...cols, { id }]); if (!has(id)) this.showColumn(id); };
		for (const b of BUILT_IN) menu.addItem((i) => i.setSection('built-in').setTitle(b.name).setIcon(b.icon).setChecked(has(b.id)).onClick(() => flip(b.id)));
		const s = this.settings, own = [s.synopsisProp, s.statusProp, s.labelProp, s.targetProp, COMPILE_PROP, 'binder', 'contents', 'longform', 'aliases', 'cssclasses'];
		const shown = cols.map((c) => propOf(c.id)).filter((p): p is string => !!p);
		const found = suggestProps(this.store.scenes(this.ctx.binder.folder).map((f) => this.frontmatter(f)), [...own, ...shown]);
		for (const p of [...shown, ...found.slice(0, 12)]) menu.addItem((i) => i.setSection('props').setTitle(p).setIcon('text').setChecked(has(propId(p))).onClick(() => flip(propId(p))));
		menu.addItem((i) => i.setSection('add').setTitle('Other property...').setIcon('plus').onClick(async () => {
			const name = await ask(this.ctx.app, { title: 'Add a column', placeholder: 'A property’s name, such as POV', cta: 'Add column' });
			if (name && !has(propId(name))) { this.setColumns([...this.columns(), { id: propId(name) }]); this.showColumn(propId(name)); }
		}));
	}

	private headerDragged = false;

	/** Follows a press on a header: `move` once it has moved far enough to be a drag, then `end`. */
	private track(e: PointerEvent, h: { move(x: number): void; end(drop: boolean): void }): void {
		if (e.button !== 0) return;
		const doc = this.root.doc, id = e.pointerId, x0 = e.clientX;
		let on = false;
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== id) return;
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
			this.stopHeader = null;
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
		this.stopHeader = () => stop(false);
	}

	/** Dragging a header's edge makes its column wider or narrower, as it goes. */
	private resize(e: PointerEvent, id: string, i: number): void {
		e.stopPropagation();
		e.preventDefault();
		const cols = this.columns(), col = cols.find((c) => c.id === id);
		if (!col) return;
		const start = this.widthOf(col), x0 = e.clientX, rtl = getComputedStyle(this.head).direction === 'rtl';
		let w = start;
		this.root.addClass('is-resizing');
		this.track(e, {
			move: (x) => { w = clampWidth(start + (rtl ? x0 - x : x - x0), MIN_WIDTH); this.table.setCssProps({ [`--binders-ol-c${i}`]: `${w}px` }); },
			end: (drop) => {
				this.root.removeClass('is-resizing');
				if (drop && w !== start) this.setColumns(cols.map((c) => (c.id === id ? { id, width: w } : c)));
				else this.table.setCssProps({ [`--binders-ol-c${i}`]: `${start}px` });
			},
		});
		// a click on the edge without moving does nothing
		this.root.doc.addEventListener('pointerup', () => this.root.removeClass('is-resizing'), { once: true });
	}

	/** Dragging a header moves its column: a line shows where it will go. */
	private dragColumn(e: PointerEvent, id: string, el: HTMLElement): void {
		if ((e.target as HTMLElement).closest('.binders-outliner-resizer') || e.pointerType === 'touch') return;
		let to = -1, line: HTMLElement | null = null;
		const ths = () => this.columns().map((c) => this.head.querySelector<HTMLElement>(`.binders-outliner-th[data-col="${CSS.escape(c.id)}"]`));
		this.track(e, {
			move: (x) => {
				el.addClass('is-dragging');
				const cols = this.columns(), from = cols.findIndex((c) => c.id === id), rects = ths().map((t) => t?.getBoundingClientRect());
				const rtl = getComputedStyle(this.head).direction === 'rtl';
				to = rects.findIndex((r) => !!r && (rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2));
				if (to < 0) to = cols.length;
				line ??= this.root.doc.body.createDiv({ cls: 'binders-drop-indicator is-vertical' });
				const at = rects[Math.min(to, cols.length - 1)], view = this.root.getBoundingClientRect();
				const noop = to === from || to === from + 1;
				line.toggleClass('is-active', !!at && !noop);
				if (at) line.setCssStyles({ left: `${(to < cols.length ? (rtl ? at.right : at.left) : (rtl ? at.left : at.right)) - 1}px`, top: `${at.top}px`, height: `${Math.min(view.bottom, this.table.getBoundingClientRect().bottom) - at.top}px` });
			},
			end: (drop) => {
				el.removeClass('is-dragging');
				line?.remove();
				const cols = this.columns(), from = cols.findIndex((c) => c.id === id);
				if (drop && from >= 0 && to >= 0 && to !== from && to !== from + 1) this.setColumns(move(cols, from, to > from ? to - 1 : to));
			},
		});
	}

	// ---- dragging rows ----

	private startDrag(path: string, x: number, y: number): void {
		const row = this.rowEl(path);
		if (!row) return;
		if (!this.sel.has(path)) this.select([path]);
		const items = this.targets(row), doc = this.root.doc;
		if (!items.length) return;
		// as a note dragged in the file explorer looks: Obsidian's own drag ghost, with where it would go under its name
		const ghost = doc.body.createDiv({ cls: 'drag-ghost binders-outliner-ghost', attr: { 'aria-hidden': 'true' } });
		const self = ghost.createDiv({ cls: 'drag-ghost-self' });
		setIcon(self, items.length > 1 ? 'files' : items[0] instanceof TFolder ? 'folder-open' : 'file');
		self.createSpan({ text: items.length > 1 ? `${items.length} items` : nameOf(items[0]) });
		const action = ghost.createDiv({ cls: 'drag-ghost-action' });
		const line = doc.body.createDiv({ cls: 'drop-indicator binders-drop-line' });
		for (const f of items) this.rowEl(f.path)?.addClass('is-dragging');
		this.root.addClass('is-dragging');
		doc.body.addClass('is-grabbing');
		const onScroll = () => { if (this.drag) this.dragTo(this.drag.x, this.drag.y); };
		this.root.addEventListener('scroll', onScroll, { passive: true });
		this.drag = { items, ghost, action, line, place: null, x, y, raf: 0, off: () => this.root.removeEventListener('scroll', onScroll) };
		const tick = () => {
			const d = this.drag;
			if (!d) return;
			const r = this.root.getBoundingClientRect(), top = r.top + this.head.offsetHeight, bottom = visibleBottom(this.root);
			const v = d.y < top + EDGE ? -(top + EDGE - d.y) : d.y > bottom - EDGE ? d.y - (bottom - EDGE) : 0;
			// (the line is put right in the same frame: the scroll's own event comes a frame later)
			if (v) { this.edgeSince ||= performance.now(); const was = this.root.scrollTop; this.root.scrollTop += Math.max(-20, Math.min(20, v / 2)) * held(this.edgeSince); if (this.root.scrollTop !== was) this.dragTo(d.x, d.y); } else this.edgeSince = 0;
			d.raf = window.requestAnimationFrame(tick);
		};
		this.drag.raf = window.requestAnimationFrame(tick);
	}

	private dragTo(x: number, y: number): void {
		const d = this.drag;
		if (!d) return;
		d.x = x; d.y = y;
		// (by a finger: above it and centred, as Obsidian puts what it drags on a phone, and never off the screen's side)
		if (Platform.isMobile) {
			const w = d.ghost.offsetWidth, h = d.ghost.offsetHeight, max = this.root.doc.documentElement.clientWidth - w - 4;
			d.ghost.setCssStyles({ left: `${Math.max(4, Math.min(max, x - w / 2))}px`, top: `${Math.max(4, y - h - 20)}px` });
		} else d.ghost.setCssStyles({ left: `${x + 5}px`, top: `${y + 5}px` });
		const place = d.place = this.placeAt(x, y);
		for (const el of this.body.querySelectorAll('.is-being-dragged-over')) if (el !== place?.into) el.removeClass('is-being-dragged-over');
		place?.into?.addClass('is-being-dragged-over');
		d.action.setText(place?.hint ?? '');
		d.action.toggle(!!place);
		const view = this.root.getBoundingClientRect(), l = place?.line;
		const show = !!l && l.y >= view.top + this.head.offsetHeight - 2 && l.y <= view.bottom + 2;
		d.line.toggleClass('is-active', show);
		if (l && show) d.line.setCssStyles({ left: `${l.left}px`, width: `${Math.max(0, Math.min(l.right, view.right) - l.left)}px`, top: `${l.y - 2}px` });
	}

	/** Where a drop at (x, y) would put the dragged rows: above or below the row there (a folder: along its top and
	    bottom edges; below an open folder's name is the top of what's in it), into a folder over its middle, or last in
	    the folder shown below the last row. Null where that changes nothing or can't be. */
	private placeAt(x: number, y: number): Place | null {
		const d = this.drag, rows = this.rowEls(), view = this.root.getBoundingClientRect();
		// only over the rows: not past the pane's sides, above its header (rows scrolled under it are out of sight) or
		// below it
		if (!d || !rows.length || x < view.left || x > view.right || y < view.top + this.head.offsetHeight || y > view.bottom) return null;
		const items = d.items, inside = (f: TAbstractFile) => items.some((g) => f === g || f.path.startsWith(g.path + '/'));
		const nameLeft = (row: HTMLElement) => (row.querySelector('.binders-outliner-main') ?? row).getBoundingClientRect().left;
		const done = (folder: TFolder, k: number, rest: TAbstractFile[], extra: Omit<Place, 'folder' | 'anchor'>): Place | null => {
			if (!items.every((f) => this.store.canPlace(f, folder))) return null;
			const now = this.store.orderedChildren(folder) ?? [], moving = now.filter((f) => items.includes(f));
			// back where they already are: nothing to show, nothing to do
			if (moving.length === items.length && [...rest.slice(0, k), ...moving, ...rest.slice(k)].every((f, i) => f === now[i]) && (extra.depth === undefined || items.every((f) => this.rowsShown.find((r) => r.item === f)?.depth === extra.depth))) return null;
			return { folder, anchor: rest[k] ?? null, ...extra };
		};
		const restOf = (folder: TFolder) => (this.store.orderedChildren(folder) ?? []).filter((f) => !items.includes(f));
		const last = rows[rows.length - 1], lastRect = last.getBoundingClientRect();
		if (y >= lastRect.bottom) {
			// below everything: last in the folder shown
			const folder = this.ctx.folder, rest = restOf(folder);
			return done(folder, rest.length, rest, { hint: `Move to the end of “${folder.name}”`, into: null, depth: this.longform ? 0 : undefined, line: { left: nameLeft(rows[0]) - Number(rows[0].getAttribute('aria-level')) * 0, right: lastRect.right, y: lastRect.bottom } });
		}
		const row = rows.find((r) => { const b = r.getBoundingClientRect(); return y >= b.top && y < b.bottom; }) ?? rows[0];
		const over = this.item(row.dataset.path);
		if (!over || !over.parent || inside(over)) return null;
		const r = row.getBoundingClientRect(), rel = (y - r.top) / r.height, isFolder = over instanceof TFolder, edge = isFolder ? 0.25 : 0.5;
		const name = nameOf(over);
		if (isFolder && rel >= edge && rel < 1 - edge) {
			const rest = restOf(over);
			return done(over, rest.length, rest, { hint: `Move into “${name}”`, into: row, line: null });
		}
		const after = rel >= 1 - edge, next = rows[rows.indexOf(row) + 1];
		const level = (el: HTMLElement | undefined) => (el ? Number(el.getAttribute('aria-level')) - 1 : 0);
		if (after && isFolder && !this.collapsed.has(over.path)) {
			// below an open folder's name: first in it
			return done(over, 0, restOf(over), { hint: `Move to the top of “${name}”`, into: null, line: { left: next && level(next) > level(row) ? nameLeft(next) : nameLeft(row) + 20, right: r.right, y: r.bottom } });
		}
		// after the last row of a folder (the next row is further out, or there's none): how far out the pointer is
		// says which folder it leaves: left of a row's name is after the folder that row is in
		if (after && !this.longform && level(next) < level(row)) {
			let item: TFile | TFolder = over, el = row;
			while (item.parent && item.parent !== this.ctx.folder && level(el) > level(next) && x < nameLeft(el)) {
				const up = this.rowEl(item.parent.path);
				if (!up || inside(item.parent)) break;
				item = item.parent; el = up;
			}
			if (item !== over && item.parent) {
				const out = restOf(item.parent);
				return done(item.parent, out.indexOf(item) + 1, out, { hint: `Move after “${nameOf(item)}”`, into: null, line: { left: nameLeft(el), right: r.right, y: r.bottom } });
			}
		}
		const rest = restOf(over.parent);
		// Longform: a scene takes the indent of the row it's dropped against; right under a scene with scenes indented
		// under it, it's the first of those
		const depth = !this.longform ? undefined : after && next && level(next) > level(row) ? level(next) : level(row);
		const left = depth !== undefined && depth > level(row) && next ? nameLeft(next) : nameLeft(row);
		return done(over.parent, rest.indexOf(over) + (after ? 1 : 0), rest, { hint: after ? `Move after “${name}”` : `Move before “${name}”`, into: null, depth, line: { left, right: r.right, y: after ? r.bottom : r.top } });
	}

	private endDrag(drop: boolean, _x: number, _y: number, quiet = false): void {
		const d = this.drag;
		if (!d) return;
		window.cancelAnimationFrame(d.raf);
		d.off();
		d.ghost.remove();
		d.line.remove();
		this.root.removeClass('is-dragging');
		this.root.doc.body.removeClass('is-grabbing');
		for (const el of this.body.querySelectorAll('.is-being-dragged-over, .is-dragging')) el.removeClasses(['is-being-dragged-over', 'is-dragging']);
		this.drag = null;
		if (quiet) return;
		const place = drop ? d.place : null;
		if (!place) { if (this.dirty) this.draw(); return; }
		// where each row is let go: it glides from there to its new place, even into another folder
		for (const f of d.items) { const el = this.rowEl(f.path); if (el) this.landing.set(f, el.getBoundingClientRect()); }
		this.moving = true;
		window.setTimeout(() => {
			void (async () => {
				try {
					await this.store.put(d.items, place.folder, place.anchor, place.depth);
				} catch (e) { new Notice(plain(e)); }
				this.moving = false;
				// dropped into a folded folder: they're in it, out of sight, so the folder is what's selected
				const paths = d.items.map((f) => f.path);
				this.sel = new Set(paths);
				this.focused = paths[0] ?? null;
				this.anchor = this.focused;
				if (!this.root.isConnected) return;
				this.draw();
				// (the keyboard carries on from what was dropped, or from the folded folder that took it)
				if (!paths.some((p) => this.drawn.has(p))) this.select([place.folder.path]);
				const a = this.root.doc.activeElement;
				if (a === this.root.doc.body || this.root.contains(a)) this.rowEl(this.focused)?.focus({ preventScroll: true });
			})();
		}, 0);
	}
}
