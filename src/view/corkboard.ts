import { Keymap, Menu, Notice, TFile, TFolder, setIcon, type PaneType, type TAbstractFile } from 'obsidian';
import { buildCard, cardKey, countLabel, crumbAt, heir, numberCards, overPane, owedFocus, typingNow, type CardHost } from './card';
import type { Editable } from './edit';
import { emptyState, badName, isNote, itemMenu, nameOf, noteOf, plain, removeItems, renameItem } from './actions';
import { LONG_PRESS, SelectBox, held, settle, visibleBottom } from './drag';
import { FileDrag } from './file-drag';
import { CARD_SIZES, movedText, type CardSize } from './lanes-data';
import { submenu } from './internals';
import { display } from './labels';
import { watchSize } from './windows';
import type { BinderMode, ModeContext, ModeFactory } from './mode';

/* The corkboard: one index card per note, in binder order, in a grid. A subfolder is one card of the same size as a
   note's (it names what it holds); double-click it to go into it. A Longform project has no subfolders: scenes
   indented under a scene show as a group below it, with a heading. Cards are edited in place (synopsis, title),
   reordered by dragging (mouse, pen, or touch with a long press, so a swipe still scrolls) or with the keyboard, and
   moved between folders by dropping them on a folder's card or on the breadcrumb. Redraws wait while something is
   being typed or dragged.

   A drag looks like Obsidian's own reordering (a list's properties, a base's columns): the card itself follows the
   pointer, its place is held by a tinted slot, and a line shows where it will go. Nothing on the board moves until the
   drop, so what's under the pointer stays there; then every card glides to its new place. */

interface Group {
	folder: TFolder;
	/** Another folder than the one shown (the group a drop on a folder's card goes to); the groups drawn never are. */
	sub: boolean;
	items: TAbstractFile[];
	/** The folder's item just after this group, where its end is (null: the folder's end). */
	end: TAbstractFile | null;
	/** Longform: the indent of the group's scenes (a drop or a new card there gets it), and the scene they're indented
	    under (the heading; null for none, or for a group that continues one shown above). */
	depth?: number;
	head?: TFile | null;
}

interface Drop { group: Group; anchor: TAbstractFile | null }
interface Drag {
	items: TAbstractFile[];
	ghost: HTMLElement;
	indicator: HTMLElement;
	drop: Drop | null;
	/** The folder in the breadcrumb a drop would move the cards to. */
	crumb?: HTMLElement | null;
	x: number; y: number;
	/** Where in the card it was taken hold of, so it stays under the pointer there. */
	ox: number; oy: number;
	raf: number;
	off: () => void;
	/** Outside the view the card is a file, and the drag Obsidian's (file-drag.ts). Null where it can't be handed one. */
	file?: FileDrag | null;
}

/** How cards glide to their new places: Obsidian's own timing for a reordered item. */
const GLIDE: KeyframeAnimationOptions = { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
/** More cards than this changing place at once is a new board, not a move: nothing glides. */
const GLIDE_MAX = 120;
/** More than this many (besides what was dropped) and the others don't glide: they fade in where they go. */
const GLIDE_CALM = 24;
interface DrawnCard { el: HTMLElement; key: string; file: TAbstractFile; editors: { title: Editable; synopsis: Editable } }

/** What a card, a "New note" card or a group's heading is, the same from one redraw to the next. */
const placeKey = (el: HTMLElement): string | null =>
	el.dataset.path != null ? 'card\n' + el.dataset.path : el.dataset.new != null ? 'new\n' + el.dataset.new : el.dataset.heading != null ? 'heading\n' + el.dataset.heading : null;
/** The mode factory plugin.modeFactories uses for the corkboard in a grid. */
export const corkboard: ModeFactory = (container, ctx) => new Corkboard(container, ctx);

class Corkboard implements BinderMode {
	readonly filters = true;
	private board: HTMLElement;
	private groups: Group[] = [];
	private emptyEl: HTMLElement | null = null;
	private sig = '';
	/** Selected items by path; `anchor` is where a Shift-click range starts, `focused` the card with the focus. */
	private sel = new Set<string>();
	private anchor: string | null = null;
	private focused: string | null = null;
	private editing = 0;
	private dirty = false;
	private newIn: string | null = null;
	/** Notes made here since the filter last changed: they show though the filter would hide them (a new note has no
	    status yet), so a note just made doesn't vanish. */
	private made = new Set<TFile>();
	/** A card to focus after the next redraw (the one after a deleted card). */
	private refocus: string | null = null;
	private press: { id: number; x: number; y: number; touch: boolean; card: HTMLElement; armed: boolean; timer: number } | null = null;
	private drag: Drag | null = null;
	/** Where cards just let go of were (under the pointer), so they glide from there to their places. */
	private landing = new Map<TAbstractFile, DOMRect>();
	/** Cards on their way down from a drop, with the animation that carries them. */
	private aloft = new Map<TAbstractFile, Animation>();
	private drawnOnce = false;
	/** Cards made in the draw under way. */
	private fresh: HTMLElement[] = [];
	private lastPointer = 'mouse';
	private noClick = false;
	private swallowTouch = false;
	private cleanup: (() => void)[] = [];

	constructor(private container: HTMLElement, private ctx: ModeContext) {}

	private get store() { return this.ctx.store; }
	/** A Longform project has no folders: its indented scenes show in groups under the scene they belong to. (In a
	    binder every item of the folder shown is a card in one grid, in the binder's order, a folder as one card.) */
	private get longform(): boolean { return this.ctx.binder.kind === 'longform'; }
	private get presets() { return this.ctx.plugin.settings.labels; }

	render(): void {
		this.container.addClass('binders-corkboard');
		this.board = this.container.createDiv({ cls: 'binders-board' });
		// (said to a screen reader, not shown: where a card moved by hand is now)
		this.live = this.container.createDiv({ cls: 'binders-live', attr: { 'aria-live': 'polite', role: 'status' } });
		this.cleanup.push(watchSize(this.ctx.app, this.container, this.fit));
		// (a moment after the board stops being scrolled: a board of a thousand cards isn't measured on every frame)
		const scrolled = () => { window.clearTimeout(this.midTimer); this.midTimer = window.setTimeout(() => this.noteMid(), 150); };
		this.container.addEventListener('scroll', scrolled, { passive: true });
		this.cleanup.push(() => { this.container.removeEventListener('scroll', scrolled); window.clearTimeout(this.midTimer); });
		const moved = this.ctx.app.vault.on('rename', (f, old) => this.onMoved(f.path, old));
		this.cleanup.push(() => this.ctx.app.vault.offref(moved));
		this.cleanup.push(owedFocus(this.container, () => this.focusOnDraw, () => { this.focusOnDraw = false; }));
		const b = this.board, on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
			b.addEventListener(t, fn, opts);
			this.cleanup.push(() => b.removeEventListener(t, fn, opts));
		};
		on('pointerdown', (e) => this.onPointerDown(e));
		on('click', (e) => this.onClick(e));
		on('dblclick', (e) => this.onDblClick(e));
		// a middle click opens a card in a new tab, as it does a link or a breadcrumb (and doesn't start autoscroll)
		on('mousedown', (e) => { if (e.button === 1 && (e.target as HTMLElement).closest('.binders-card[data-path]')) e.preventDefault(); });
		on('auxclick', (e) => {
			const card = (e.target as HTMLElement).closest<HTMLElement>('.binders-card[data-path]');
			if (e.button !== 1 || !card || (e.target as HTMLElement).closest('input, textarea')) return;
			e.preventDefault();
			this.open(card, 'tab');
		});
		on('contextmenu', (e) => this.onContextMenu(e));
		on('keydown', (e) => this.onKey(e));
		// a press on empty space that becomes a drag draws a selection box (drag.ts)
		this.box = new SelectBox({
			el: this.container,
			empty: (t) => this.container.contains(t) && !t.closest('.binders-card, .binders-group-heading, .binders-view-synopsis-row, .is-editing, input, textarea, a, button') && !this.drag,
			cards: () => this.cards(),
			begin: () => {
				const sel = [...this.sel], focused = this.focused, anchor = this.anchor;
				this.boxFrom = { focused, anchor };
				return { selected: this.cards().map((c) => c.dataset.path ?? '').filter((x) => this.sel.has(x)), restore: () => this.select(sel, focused, anchor) };
			},
			// (the keyboard goes to the last card the box touches; a Shift-click afterwards still starts from the card it
			// started from before, or with none from the first one touched)
			select: (paths, touched) => this.select(paths, touched[touched.length - 1] ?? this.boxFrom.focused, this.boxFrom.anchor ?? touched[0] ?? null),
			end: (kept) => { if (kept && this.sel.size) this.cardEl(this.focused)?.focus({ preventScroll: true }); },
		});
		this.cleanup.push(() => this.box?.destroy());
		// while a card is held or dragged by touch, the page mustn't scroll instead
		on('touchmove', (e) => { if (this.press?.armed || this.drag) e.preventDefault(); }, { passive: false });
		// and lifting the finger after a long press or a drag mustn't click (which would also close the menu just opened)
		on('touchend', (e) => { if (this.swallowTouch) { this.swallowTouch = false; e.preventDefault(); } }, { passive: false });
		this.draw();
	}

	refresh(): void {
		if (this.busy()) { this.dirty = true; return; }
		if (this.signature() !== this.sig) this.draw();
	}

	/** The board made shorter while something is typed (a phone's keyboard coming up over it): the field stays in sight. */
	private fit = (): void => {
		const a = this.board.doc.activeElement;
		if ((this.editing > 0 || this.newIn) && a?.instanceOf(HTMLElement) && this.board.contains(a)) { a.scrollIntoView({ block: 'nearest' }); this.inSight(a); }
		// Made narrower or wider (a window resized, a tablet turned): a row holds another number of cards, and the same
		// scroll position shows other notes. The card that was in the middle of the pane is put back there.
		const box = this.container, w = box.clientWidth, was = this.width, mid = this.mid;
		this.width = w;
		if (!was || !w || w === was || !mid || this.drag) return;
		let frames = 20;
		const stop = () => { frames = 0; };
		for (const t of ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const) box.addEventListener(t, stop, { once: true, passive: true, capture: true });
		// (held for a moment: the cards above it take their real heights as they come into sight)
		const tick = () => {
			// (and it stays the card that's kept through the next change of width, until the board is scrolled by hand)
			if (frames-- <= 0 || !box.isConnected) { window.setTimeout(() => { this.settling = false; }, 300); return; }
			const el = this.cardEl(mid.path), r = box.getBoundingClientRect();
			if (el) { const d = el.getBoundingClientRect().top - r.top - mid.at * r.height; if (Math.abs(d) > 0.5) box.scrollTop += d; }
			box.win.requestAnimationFrame(tick);
		};
		this.settling = true;
		tick();
	};
	private width = 0;
	/** The card in the middle of the pane, and how far down the pane its top is (0 to 1): noted as the board is
	    scrolled, for `fit` above. */
	private mid: { path: string; at: number } | null = null;
	private settling = false;
	private midTimer = 0;
	private noteMid(): void {
		const r = this.container.getBoundingClientRect();
		if (this.settling || !r.height) return;
		// the card in hand if it's in sight; else the middle card of the row across the pane's middle
		const inSight = (x: HTMLElement) => { const b = x.getBoundingClientRect(); return b.bottom > r.top && b.top < r.bottom; };
		const cards = this.cards(), held = this.cardEl(this.focused), i = cards.findIndex((x) => x.getBoundingClientRect().bottom > r.top + r.height / 2);
		let c = held && inSight(held) ? held : cards[i];
		if (c && c !== held) {
			const top = c.getBoundingClientRect().top, row = cards.slice(i, i + 12).filter((x) => Math.abs(x.getBoundingClientRect().top - top) < 2);
			c = row[Math.floor((row.length - 1) / 2)] ?? c;
		}
		this.mid = c?.dataset.path ? { path: c.dataset.path, at: (c.getBoundingClientRect().top - r.top) / r.height } : null;
	}

	unload(): void {
		this.endDrag(false, true);
		this.endPress();
		for (const f of this.cleanup) f();
		this.cleanup = [];
		this.container.empty();
		this.container.removeClass('binders-corkboard');
	}

	/** The keyboard on the card it was on, or the first. (Remembered, so it's still there after the next redraw; and
	    asked for before there's a card, it's given once there is one, unless the keyboard has gone elsewhere since.) */
	focus(): void {
		const c = this.cardEl(this.focused) ?? this.cards()[0];
		if (!c) {
			// (no card to be on: the "New note" tile meanwhile, so the keyboard is never left on the page)
			this.focusOnDraw = true;
			this.board.querySelector<HTMLElement>('.binders-card-new')?.focus({ preventScroll: true });
			return;
		}
		this.focused ??= c.dataset.path ?? null;
		c.focus({ preventScroll: true });
	}
	private focusOnDraw = false;

	/** Where the board is: the first card in sight and how far it's scrolled past the top (cards out of sight are
	    stand-ins of a guessed height, so a scroll position alone wouldn't find the same place again). */
	place(): unknown {
		const top = this.container.getBoundingClientRect().top, first = this.cards().find((c) => c.getBoundingClientRect().bottom > top + 1);
		return { top: first?.dataset.path ?? null, offset: first ? Math.round(top - first.getBoundingClientRect().top) : 0, sel: [...this.sel], focused: this.focused };
	}

	restore(place: unknown): void {
		const p = (place ?? {}) as { top?: unknown; offset?: unknown; sel?: unknown; focused?: unknown };
		const sel = Array.isArray(p.sel) ? p.sel.filter((x): x is string => typeof x === 'string' && !!this.cardEl(x)) : [];
		const focused = typeof p.focused === 'string' && this.cardEl(p.focused) ? p.focused : sel[sel.length - 1] ?? null;
		this.select(sel, focused);
		// that card where it was; and held there for a moment, while the cards above it are drawn at their real heights
		const path = typeof p.top === 'string' ? p.top : null, offset = typeof p.offset === 'number' ? p.offset : 0, box = this.container;
		if (!path || !this.cardEl(path)) return;
		const align = () => { const el = this.cardEl(path); if (el) { const d = el.getBoundingClientRect().top - box.getBoundingClientRect().top + offset; if (Math.abs(d) > 0.5) box.scrollTop += d; } };
		let frames = 30;
		const stop = () => { frames = 0; };
		for (const t of ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const) box.addEventListener(t, stop, { once: true, passive: true, capture: true });
		const tick = () => { if (frames-- <= 0 || !box.isConnected) return; align(); box.win.requestAnimationFrame(tick); };
		tick();
	}

	/** The folder's synopsis is the board's first line, and scrolls with it. */
	adopt(header: HTMLElement): void { this.container.prepend(header); }

	reveal(item: TAbstractFile, fresh = false): void {
		// A scene below this board is represented by the card of the folder that holds it.
		while (!this.cardEl(item.path) && item.parent && item.parent !== this.ctx.folder) item = item.parent;
		const el = this.cardEl(item.path);
		if (!el) return;
		this.select([item.path], item.path);
		el.scrollIntoView({ block: 'nearest' });
		this.inSight(el);
		// (and once the board has settled: cards still gliding, or counts still coming in, move it)
		window.setTimeout(() => { const now = this.cardEl(item.path); if (now && this.sel.has(item.path)) this.inSight(now); }, 350);
		el.focus({ preventScroll: true });
		if (fresh && !this.ctx.readOnly) this.editTitle(el);
	}

	create(kind: 'note' | 'folder'): void {
		if (kind === 'folder') { void this.newFolder(); return; }
		// after the card in hand, as a new row in the outliner goes after the row in hand; with none, in the "New note"
		// tile at the end
		const at = this.focused && this.sel.has(this.focused) ? this.ctx.app.vault.getAbstractFileByPath(this.focused) : null;
		const folder = at?.parent, sibs = folder ? this.store.orderedChildren(folder) ?? [] : [];
		// (with the keyboard on a "New note" tile, that tile is where it's made)
		const onTile = this.board.doc.activeElement?.closest<HTMLElement>('.binders-card-new');
		if (onTile) { this.startNew(onTile.closest<HTMLElement>('.binders-group')); return; }
		if (!at || !folder || !sibs.includes(at) || this.ctx.readOnly) { this.startNew(); return; }
		// (after the last card of its group is where that group's tile is: the tile takes one name after another)
		const group = this.cardEl(at.path)?.closest<HTMLElement>('.binders-group'), cards = group ? [...group.querySelectorAll<HTMLElement>(':scope > .binders-cards > .binders-card-list > .binders-card[data-path]')] : [];
		if (group && cards[cards.length - 1]?.dataset.path === at.path) { this.startNew(group); return; }
		void this.store.newScene(folder, sibs.indexOf(at) + 1, 'Untitled', this.store.depthOf(at)).then((file) => {
			this.made.add(file);
			this.ctx.made(file);
			this.onMade(file, true);
		}, (e) => new Notice(plain(e)));
	}

	selected(): TAbstractFile[] { return [...this.sel].map((p) => this.ctx.app.vault.getAbstractFileByPath(p)).filter((f): f is TAbstractFile => !!f); }

	current(): TAbstractFile | null {
		const path = this.focused ?? [...this.sel][0];
		return path ? this.ctx.app.vault.getAbstractFileByPath(path) : null;
	}

	/** Something was renamed or moved (here or anywhere): what's selected and focused follows it by its new path. */
	/** The card that takes the keyboard if the one it's on has left the board by the next redraw (see onMoved). */
	private next: string | null = null;

	private onMoved(now: string, old: string): void {
		const re = (p: string) => (p === old ? now : p.startsWith(old + '/') ? now + p.slice(old.length) : p);
		// (if this takes the card the keyboard is on off the board, its neighbor is next: noted now, while the cards
		// still say where it was)
		if (this.focused && re(this.focused) !== this.focused) this.next = heir(this.cards().map((c) => c.dataset.path ?? ''), this.focused, (p) => re(p) !== p);
		this.sel = new Set([...this.sel].map(re));
		if (this.focused) this.focused = re(this.focused);
		if (this.anchor) this.anchor = re(this.anchor);
		if (this.refocus) this.refocus = re(this.refocus);
	}

	menu(menu: Menu): void {
		menu.addItem((i) => {
			i.setSection('view').setTitle('Card size').setIcon('scaling');
			submenu(i, (m) => {
				for (const size of CARD_SIZES) m.addItem((x) => x.setTitle(display(size)).setChecked(this.cardSize === size).onClick(() => {
					this.ctx.setOption('cardSize', size);
					this.applyCardSize();
				}));
			}, menu);
		});
		menu.addItem((i) => i.setSection('view').setTitle('Tint cards with their label color').setIcon('paint-bucket').setChecked(this.labelStyle === 'tint').onClick(() => {
			this.ctx.setOption('labelStyle', this.labelStyle === 'tint' ? 'stripe' : 'tint');
			this.applyCardSize();
		}));
		// (Scrivener's "card numbers": each note's place in the order, to talk about and to count by)
		menu.addItem((i) => i.setSection('view').setTitle('Number the cards').setIcon('list-ordered').setChecked(this.numbers).onClick(() => {
			this.ctx.setOption('numbers', !this.numbers);
			this.applyCardSize();
		}));
	}

	newMenu(menu: Menu, sec?: HTMLElement | null): void {
		// (in a group's own menu, at that group's end; from the toolbar, after the selected card, as in the other modes)
		menu.addItem((i) => i.setSection('new').setTitle('New note').setIcon('file-plus').onClick(() => { if (sec) this.startNew(sec); else void this.create('note'); }));
		if (!this.longform) menu.addItem((i) => i.setSection('new').setTitle('New folder').setIcon('folder-plus').onClick(() => void this.newFolder()));
	}

	/** How a card shows its label: with its border and its face tinted, as a colored card on a canvas (the default), or
	    as its border alone (saved as 'stripe', what it once was). */
	private get labelStyle(): 'stripe' | 'tint' { return this.ctx.option<string>('labelStyle', 'tint') === 'stripe' ? 'stripe' : 'tint'; }

	private get cardSize(): CardSize {
		const size = this.ctx.option<string>('cardSize', 'medium');
		return (CARD_SIZES as readonly string[]).includes(size) ? size as CardSize : 'medium';
	}

	private applyCardSize(): void {
		for (const size of CARD_SIZES) this.board.toggleClass(`mod-cards-${size}`, this.cardSize === size);
		this.board.toggleClass('mod-label-tint', this.labelStyle === 'tint');
		this.number();
	}

	private get numbers(): boolean { return this.ctx.option<boolean>('numbers', false) === true; }

	/** With "Number the cards" on, each note's card says its place among the notes that show, in the order they read. */
	private number(): void { numberCards(this.board, this.cards(), this.numbers); }

	/** Starts a new note's title in a group's "New note" card (default: the last one, the end of the folder shown). */
	private startNew(sec?: HTMLElement | null): void {
		const all = [...this.board.querySelectorAll<HTMLElement>('.binders-card-new')];
		const tile = sec?.querySelector<HTMLElement>('.binders-card-new') ?? all[all.length - 1];
		tile?.scrollIntoView({ block: 'nearest' });
		if (tile) this.inSight(tile);
		(tile as (HTMLElement & { binderStart?: () => void }) | undefined)?.binderStart?.();
	}

	/** A new subfolder at the end of the folder shown, named in place as a new folder in the file explorer is. */
	private async newFolder(): Promise<void> {
		try {
			const folder = await this.store.newFolder(this.ctx.folder);
			this.onMade(folder, true);
		} catch (e) { new Notice(plain(e)); }
	}

	// ---- the model ----

	private children(folder: TFolder): TAbstractFile[] {
		return (this.store.orderedChildren(folder) ?? []).filter((f) => f instanceof TFolder || isNote(f));
	}

	private model(): Group[] {
		const top = this.ctx.folder;
		if (this.longform) {
			// one flat folder: the groups are runs of scenes by indent, from the store
			const groups = this.store.groups(top), flat = groups.flatMap((g) => g.files), out: Group[] = [];
			let n = 0;
			for (const g of groups) { n += g.files.length; out.push({ folder: top, sub: false, items: g.files, end: flat[n] ?? null, depth: g.depth, head: g.continued ? null : g.head }); }
			if (!out.length || out[out.length - 1].depth) out.push({ folder: top, sub: false, items: [], end: null, depth: 0, head: null });
			return out;
		}
		// one group: the folder's notes and folders, each a card
		return [{ folder: top, sub: false, items: this.children(top), end: null }];
	}

	private shown(g: Group): TAbstractFile[] { return g.items.filter((f) => this.isShown(f)); }
	private isShown(f: TAbstractFile): boolean { return !(f instanceof TFile) || this.made.has(f) || this.ctx.visible(f); }

	filterChanged(): void { this.made.clear(); }

	/** Where an item's card data lives: the note itself, or a folder's folder note (null until it has one). */
	private noteOf(f: TAbstractFile): TFile | null { return noteOf(this.ctx, f); }

	/** Everything a redraw would show, so a refresh that changes nothing visible draws nothing. */
	private signature(): string {
		const card = (f: TAbstractFile) => cardKey(this.ctx, f);
		const groups = this.model();
		return JSON.stringify([this.ctx.readOnly, this.presets, this.labelStyle, groups.map((g) => [g.folder.path, g.end?.path, g.depth, g.head?.path, this.shown(g).map(card)])]);
	}

	// ---- drawing ----

	private busy(): boolean { return this.editing > 0 || !!this.drag || this.moving || !!this.newIn; }

	private draw(): void {
		const scroller = this.scroller(), top = scroller.scrollTop;
		const hadFocus = this.board.contains(this.board.doc.activeElement);
		const before = this.drawnOnce ? this.places() : null;
		this.drawnOnce = true;
		this.dirty = false;
		this.groups = this.model();
		this.sig = this.signature();
		this.editors.clear();
		this.board.toggleClass('is-read-only', this.ctx.readOnly);
		this.applyCardSize();
		// Everything that didn't change stays in place in the page (a big binder then redraws quickly); the rest is drawn
		// again and put in its place.
		this.drawn = new Map();
		const sections = this.sections;
		this.sections = new Map();
		let at = this.board.firstChild;
		this.groups.forEach((g, gi) => {
			const sec = this.drawGroup(g, gi, sections);
			if (sec === at) at = at.nextSibling; else this.board.insertBefore(sec, at);
		});
		while (at) { const next = at.nextSibling; at.remove(); at = next; }
		// cards not shown any more are let go
		this.cardCache = this.drawn;
		// keep only what still exists selected
		const paths = new Set(this.cards().map((c) => c.dataset.path));
		for (const p of [...this.sel]) if (!paths.has(p)) this.sel.delete(p);
		// (the card the keyboard was on has gone to another folder: the keyboard goes to the card beside where it was)
		if (this.focused && !paths.has(this.focused)) {
			this.focused = this.next && paths.has(this.next) ? this.next : null;
			if (this.focused) { this.sel = new Set([this.focused]); this.anchor = this.focused; }
		}
		this.next = null;
		this.paintSelection();
		// nothing to show: the same words every mode has for that, above the "New note" tile
		const none = !this.board.querySelector('.binders-card[data-path]');
		if (none && !this.emptyEl) { this.emptyEl = emptyState(this.ctx, this.container); this.container.insertBefore(this.emptyEl, this.board); }
		else if (none && this.emptyEl && (this.emptyEl.dataset.for ?? '') !== String(this.ctx.filtering())) { this.emptyEl.remove(); this.emptyEl = emptyState(this.ctx, this.container); this.container.insertBefore(this.emptyEl, this.board); }
		else if (!none && this.emptyEl) { this.emptyEl.remove(); this.emptyEl = null; }
		if (this.emptyEl) this.emptyEl.dataset.for = String(this.ctx.filtering());
		this.number();
		// drawn in the middle of a drag (a drop just before it finished moving its files): what's held keeps its slot
		const held = this.drag?.items;
		if (held) for (const c of this.cards()) c.toggleClass('is-dragging', held.some((f) => f.path === c.dataset.path));
		scroller.scrollTop = top;
		if (before) { settle(this.fresh); this.glide(before, scroller); }
		this.fresh = [];
		const doc = this.board.doc;
		if (this.refocus) { this.focused = this.refocus; this.cardEl(this.refocus)?.focus({ preventScroll: true }); this.refocus = null; }
		else if (this.focusOnDraw && this.cards().length) { if (!typingNow(this.board.doc)) this.focus(); }
		else if (hadFocus) this.focus();
		if (this.cards().length) this.focusOnDraw = false;
		// (a title being typed for a new note stays in sight, whatever was drawn above it meanwhile)
		const typing = this.board.querySelector<HTMLElement>('.binders-card-new.is-editing');
		if (typing?.contains(doc.activeElement)) this.inSight(typing);
	}

	/** Where every card and heading is, by what it is, to glide from after a redraw. */
	private places(): Map<string, DOMRect> {
		const out = new Map<string, DOMRect>();
		for (const el of this.board.querySelectorAll<HTMLElement>('.binders-card, .binders-group-heading')) {
			const key = placeKey(el);
			if (key) out.set(key, el.getBoundingClientRect());
		}
		return out;
	}

	/** After a redraw: whatever changed place glides there from where it was, instead of jumping (and cards just dropped
	    from where they were let go). Only what's in sight moves; a big rearrangement, or "reduce motion", just shows. */
	private glide(before: Map<string, DOMRect>, scroller: HTMLElement): void {
		const landing = this.landing;
		this.landing = new Map();
		const win = this.board.win;
		if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const view = scroller.getBoundingClientRect(), margin = 200;
		const inSight = (r: DOMRect) => r.bottom > view.top - margin && r.top < view.bottom + margin;
		const moves: { el: HTMLElement; dx: number; dy: number; landed: boolean }[] = [];
		for (const el of this.board.querySelectorAll<HTMLElement>('.binders-card, .binders-group-heading')) {
			const key = placeKey(el);
			const file = el.dataset.path ? this.item(el.dataset.path) : null;
			const from = (file && landing.get(file)) ?? (key ? before.get(key) : undefined);
			if (!from) continue;
			const to = el.getBoundingClientRect();
			const dx = from.left - to.left, dy = from.top - to.top;
			if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !(inSight(from) || inSight(to))) continue;
			// (a card drawn again on its way, say once its words are counted, is still on its way)
			moves.push({ el, dx, dy, landed: !!file && (landing.has(file) || this.aloft.has(file)) });
		}
		if (moves.length > GLIDE_MAX) return;
		// a board where a lot moves at once (a card taken a long way): only what was dropped glides, the rest appear
		const busy = moves.filter((m) => !m.landed).length > GLIDE_CALM;
		for (const m of moves) {
			// a card that wraps onto another row would cross the whole board, over the others: it fades in where it goes
			const wraps = !m.landed && Math.abs(m.dx) > 1 && Math.abs(m.dy) > 1;
			if (wraps || (busy && !m.landed)) { m.el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' }); continue; }
			const a = m.el.animate([{ transform: `translate(${m.dx}px, ${m.dy}px)` }, { transform: 'translate(0, 0)' }], GLIDE);
			const file = m.landed ? this.item(m.el.dataset.path) : null;
			if (!file) continue;
			// over the other cards until it's down
			if (this.ring) m.el.addClass('is-dropped');
			m.el.addClass('is-landing');
			this.aloft.set(file, a);
			// (unless it has set off again since: then that glide puts it down)
			a.addEventListener('finish', () => { if (this.aloft.get(file) === a) { this.aloft.delete(file); m.el.removeClasses(['is-landing', 'is-dropped']); } });
		}
	}

	/** Whether cards landing show the ring of a card just dropped (not one put back where it was). */
	private ring = false;

	/** Group sections drawn last time, by what they are; a section is used again with its heading drawn afresh. */
	private sections = new Map<string, HTMLElement>();

	private drawGroup(g: Group, gi: number, old: Map<string, HTMLElement>): HTMLElement {
		const key = JSON.stringify([g.folder.path, g.end?.path, g.depth, g.head?.path]);
		// The grid (`binders-cards`) holds the list of cards and, after it, the "New note" tile. The list is the listbox:
		// a listbox may hold only options, so the tile, a button, is beside it and not in it. The list has no box of
		// its own (`display: contents`), so the cards and the tile are cells of the one grid.
		let sec = old.get(key), grid: HTMLElement, list: HTMLElement;
		old.delete(key);
		if (sec) {
			sec.querySelector(':scope > .binders-group-heading')?.remove();
			grid = sec.querySelector<HTMLElement>(':scope > .binders-cards');
			list = grid.querySelector<HTMLElement>(':scope > .binders-card-list');
		} else {
			sec = createDiv({ cls: 'binders-group' + (g.depth ? ' is-indented' : '') });
			if (g.depth) sec.setCssProps({ '--binders-group-depth': String(g.depth) });
			grid = sec.createDiv({ cls: 'binders-cards' });
			list = grid.createDiv({ cls: 'binders-card-list' });
		}
		this.sections.set(key, sec);
		sec.dataset.group = String(gi);
		if (g.head) this.drawSceneHeading(sec, g.head, g.items);
		const heading = sec.querySelector<HTMLElement>(':scope > .binders-group-heading');
		if (heading) { heading.dataset.heading = key; sec.insertBefore(heading, grid); }
		// the cards, in order, moving as few as possible
		const want = this.shown(g).map((f) => this.drawCard(f));
		let at = list.firstChild;
		for (const el of want) { if (el === at) at = at.nextSibling; else list.insertBefore(el, at); }
		while (at) { const next = at.nextSibling; at.remove(); at = next; }
		// (a list only while it has cards: a screen reader isn't told of a list of nothing)
		if (want.length) list.setAttrs({ role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': g.folder.name });
		else for (const a of ['role', 'aria-multiselectable', 'aria-label']) list.removeAttribute(a);
		// then the tile, made again each time
		while (list.nextSibling) list.nextSibling.remove();
		if (!this.ctx.readOnly) grid.appendChild(this.drawNewCard(g));
		return sec;
	}

	/** Longform: the heading of scenes indented under a scene. Clicking it selects that scene's card. */
	private drawSceneHeading(parent: HTMLElement, head: TFile, items: TAbstractFile[]): void {
		const row = parent.createDiv({ cls: 'binders-group-heading' }).createDiv({ cls: 'binders-group-title-row' });
		const title = row.createDiv({ cls: 'binders-group-title', attr: { role: 'link', tabindex: '0', 'aria-label': `Go to ${head.basename}` } });
		setIcon(title.createSpan({ cls: 'binders-group-icon' }), 'corner-down-right');
		title.createSpan({ text: head.basename });
		const go = () => this.reveal(head);
		title.addEventListener('click', go);
		title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); go(); } });
		row.createSpan({ cls: 'binders-group-rule', attr: { 'aria-hidden': 'true' } });
		row.createSpan({ cls: 'binders-group-count', text: this.countLabel(items.filter(isNote)) });
	}

	/** "3 notes · 51 words" for a heading; with a filter on, how many of them show ("2 of 3 notes"), and their words. */
	private countLabel(scenes: TFile[], folder?: TFolder): string { return countLabel(this.ctx, scenes, folder); }

	/** What a card (card.ts, shared with the board arranged by label) asks of this board. */
	private host: CardHost = {
		ctx: this.ctx,
		rename: (f, t) => this.rename(f, t),
		onEditing: (on, card) => this.onEditing(on, card),
		// a click (or a tap) on a card selects it; on a card that's already selected, it edits its synopsis. The
		// middle of a card is where it's clicked to select it or picked up to move it, so that mustn't open a field.
		// (a folder's card is gone into by a double-click anywhere on it: the second click of one, on its synopsis, isn't a
		// request to edit, so there it takes a click on a card that was already selected a moment ago)
		editOnClick: (card) => this.sel.has(card.dataset.path) && (!card.hasClass('is-stack') || performance.now() - this.selectedAt > 500),
	};

	private onEditing(on: boolean, card?: HTMLElement): void {
		this.editing += on ? 1 : -1;
		// a card half out of sight comes into view to be edited
		if (on && card) { card.scrollIntoView({ block: 'nearest' }); this.inSight(card); }
		if (!on && !this.busy()) window.setTimeout(() => { if (!this.busy() && (this.dirty || this.signature() !== this.sig)) this.draw(); }, 0);
	}

	/** Cards drawn last time, by path, with what they showed: a big binder redraws in a few milliseconds when only a
	    card or two changed, instead of building a thousand cards again. */
	private cardCache = new Map<string, DrawnCard>();
	private drawn = new Map<string, DrawnCard>();

	private drawCard(f: TAbstractFile): HTMLElement {
		const key = JSON.stringify([this.ctx.readOnly, this.presets, cardKey(this.ctx, f)]), hit = this.cardCache.get(f.path);
		if (hit && hit.key === key && hit.file === f && !this.drawn.has(f.path)) {
			hit.el.removeClasses(['is-dragging', 'is-lifted', 'is-being-dragged-over', 'is-dropped']);
			this.editors.set(f.path, hit.editors);
			this.drawn.set(f.path, hit);
			return hit.el;
		}
		const { el: card, editors } = buildCard(this.host, f);
		this.editors.set(f.path, editors);
		this.drawn.set(f.path, { el: card, key, file: f, editors });
		this.fresh.push(card);
		return card;
	}

	private drawNewCard(g: Group): HTMLElement {
		const key = `${g.folder.path}\n${g.end?.path ?? ''}`;
		const nc = createDiv({ cls: 'binders-card binders-card-new', attr: { role: 'button', tabindex: '0', 'aria-label': `New note in ${g.folder.name}`, 'data-new': key } });
		const idle = () => {
			nc.empty();
			setIcon(nc.createSpan({ cls: 'binders-card-new-icon' }), 'plus');
			nc.createSpan({ cls: 'binders-card-new-label', text: 'New note' });
		};
		idle();
		const start = () => {
			if (nc.querySelector('input')) return;
			nc.empty();
			nc.addClass('is-editing');
			this.newIn = key;
			const input = nc.createEl('input', { cls: 'binders-edit-field', attr: { type: 'text', placeholder: 'Title', 'aria-label': `Title of the new note in ${g.folder.name}`, enterkeyhint: 'done' } });
			let done = false;
			const finish = async (again: boolean) => {
				if (done) return;
				done = true;
				const t = input.value.trim();
				// a name that can't be used stays in the field, as a failed rename's does, so nothing typed is lost
				const refuse = (why: string) => { new Notice(why); done = false; input.focus(); };
				if (!t) { this.newIn = null; nc.removeClass('is-editing'); idle(); if (this.dirty) this.draw(); return; }
				const bad = badName(t);
				if (bad) { refuse(bad); return; }
				// still busy while the note is made, so no redraw takes the field away meanwhile
				try {
					const sibs = this.store.orderedChildren(g.folder) ?? [];
					const file = await this.store.newScene(g.folder, g.end ? Math.max(0, sibs.indexOf(g.end)) : Infinity, t, g.depth);
					this.made.add(file);
					this.ctx.made(file);
					// (unless another field has been opened meanwhile: selecting takes the focus, and would close it)
					if (this.newIn === key && this.editing === 0) this.select([file.path], file.path);
				} catch (e) { refuse(e instanceof Error ? e.message : String(e)); return; }
				if (this.newIn === key) this.newIn = null;
				// (left for another field, another tile or a folder's synopsis, which is open by now: the board is drawn
				// again when that one is done, not now, or the redraw would take it away)
				if (this.newIn || this.editing > 0) { this.dirty = true; return; }
				// (left by a tap on something else: the board is drawn again once that tap has landed, not under it,
				// where the new card would move what the finger is coming down on)
				if (!again && this.lastPointer === 'touch') {
					this.dirty = true;
					window.setTimeout(() => { if (!this.busy() && this.dirty) this.draw(); }, 350);
					return;
				}
				this.draw();
				// Enter keeps the new card open for the next one; clicking away ends it
				if (again) (this.board.querySelector<HTMLElement>(`.binders-card-new[data-new="${CSS.escape(key)}"]`) as HTMLElement & { binderStart?: () => void })?.binderStart?.();
			};
			input.addEventListener('keydown', (e) => {
				e.stopPropagation();
				if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void finish(true); }
				// (finishing may draw the board again, with a new card in this one's place: that's the one to focus)
				else if (e.key === 'Escape') { e.preventDefault(); input.value = ''; void finish(false); (this.board.querySelector<HTMLElement>(`.binders-card-new[data-new="${CSS.escape(key)}"]`) ?? nc).focus(); }
			});
			input.addEventListener('blur', () => void finish(false));
			for (const t of ['click', 'dblclick', 'pointerdown', 'contextmenu'] as const) input.addEventListener(t, (e) => e.stopPropagation());
			input.focus({ preventScroll: true });
			this.inSight(nc);
			// (and once the cards have glided to their places: while they move, the field isn't yet where it will be)
			window.setTimeout(() => { if (nc.isConnected && nc.contains(nc.doc.activeElement)) this.inSight(nc); }, 320);
		};
		(nc as HTMLElement & { binderStart?: () => void }).binderStart = start;
		nc.addEventListener('click', (e) => { e.stopPropagation(); start(); });
		nc.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === nc) { e.preventDefault(); e.stopPropagation(); start(); } });
		return nc;
	}

	/** Scrolls the board just enough for this to be in sight: clear of the toolbar above and, on a phone, of the bar of
	    buttons Obsidian lays over the foot of the pane. */
	private inSight(el: HTMLElement): void {
		const s = this.scroller(), r = el.getBoundingClientRect(), top = s.getBoundingClientRect().top + 8, bottom = visibleBottom(s) - 8;
		if (r.bottom > bottom) s.scrollTop += r.bottom - bottom;
		else if (r.top < top) s.scrollTop -= top - r.top;
	}

	// ---- selection ----

	private cards(): HTMLElement[] { return [...this.board.querySelectorAll<HTMLElement>('.binders-card[data-path]')]; }
	private cardEl(path: string | null): HTMLElement | null { return path ? this.cards().find((c) => c.dataset.path === path) ?? null : null; }
	private item(path: string): TAbstractFile | null { return this.ctx.app.vault.getAbstractFileByPath(path); }

	private select(paths: string[], focus: string | null = paths[paths.length - 1] ?? null, anchor = focus): void {
		if (paths.length !== this.sel.size || paths.some((x) => !this.sel.has(x))) this.selectedAt = performance.now();
		this.sel = new Set(paths);
		this.focused = focus;
		this.anchor = anchor;
		this.paintSelection();
	}

	private paintSelection(): void {
		const cards = this.cards();
		const tab = this.cardEl(this.focused) ?? cards.find((c) => this.sel.has(c.dataset.path)) ?? cards[0];
		for (const c of cards) {
			const on = this.sel.has(c.dataset.path);
			c.toggleClass('is-selected', on);
			c.setAttr('aria-selected', String(on));
			c.setAttr('tabindex', c === tab ? '0' : '-1');
		}
		this.ctx.selectionChanged?.();
	}

	/** The items an action applies to: the selection if the card is in it, else just the card. */
	private targets(card: HTMLElement): TAbstractFile[] {
		const paths = this.sel.has(card.dataset.path) ? this.cards().map((c) => c.dataset.path).filter((p) => this.sel.has(p)) : [card.dataset.path];
		return paths.map((p) => this.item(p)).filter((f): f is TAbstractFile => !!f);
	}

	private clickSelect(card: HTMLElement, e: MouseEvent | KeyboardEvent): void {
		const path = card.dataset.path;
		if (e.shiftKey && this.anchor) {
			const order = this.cards().map((c) => c.dataset.path);
			const a = order.indexOf(this.anchor), b = order.indexOf(path);
			if (a >= 0 && b >= 0) { const range = order.slice(Math.min(a, b), Math.max(a, b) + 1); this.select(Keymap.isModEvent(e) ? [...new Set([...this.sel, ...range])] : range, path, this.anchor); return; }
		}
		// ("Select more" in a card's menu, by touch: each tap adds a card or takes it out, until none is left)
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
	private box: SelectBox | null = null;
	private boxFrom: { focused: string | null; anchor: string | null } = { focused: null, anchor: null };
	/** The card a press has already selected (see onPointerDown): the click that ends that press selects nothing more. */
	private pressed: string | null = null;
	private edgeSince = 0;
	/** When the selection last changed. */
	private selectedAt = 0;

	// ---- pointer: select, open, menu, drag ----

	private onClick(e: MouseEvent): void {
		const pressed = this.pressed;
		this.pressed = null;
		if (this.noClick) { this.noClick = false; return; }
		// (the click that ends a selection box, or the one cancelled by Escape)
		if (this.box?.noClick) return;
		const t = e.target as HTMLElement;
		const card = t.closest<HTMLElement>('.binders-card[data-path]');
		if (!card) {
			if (!t.closest('.binders-group-heading, .binders-card-new') && !e.shiftKey && !Keymap.isModEvent(e)) { this.select([]); this.picking = false; }
			return;
		}
		// a tap on a note's title opens it, as a tap on a note in the file explorer does
		if (this.lastPointer === 'touch' && !this.picking && t.closest('.binders-card-head') && !t.closest('.is-editing')) {
			this.select([card.dataset.path]);
			this.open(card, false);
			return;
		}
		const editingNow = !!t.closest('.is-editing');
		if (pressed !== card.dataset.path) this.clickSelect(card, e);
		if (!editingNow) card.focus({ preventScroll: true });
	}

	private onDblClick(e: MouseEvent): void {
		// (two Shift-clicks on one card are two Shift-clicks: selecting, not opening)
		if (e.shiftKey && !Keymap.isModEvent(e)) return;
		const card = (e.target as HTMLElement).closest<HTMLElement>('.binders-card[data-path]');
		// (on a note's synopsis a double-click edits it; a folder's card is gone into wherever it's double-clicked)
		if (!card || (e.target as HTMLElement).closest(card.hasClass('is-stack') ? '.is-editing' : '.is-editing, .binders-card-synopsis.is-editable')) return;
		this.open(card, Keymap.isModEvent(e));
	}

	private open(card: HTMLElement, newLeaf: boolean | PaneType): void {
		const f = this.item(card.dataset.path);
		if (f instanceof TFolder) this.ctx.navigate(f, newLeaf);
		else if (f instanceof TFile) void this.ctx.openFile(f, newLeaf);
	}

	private onContextMenu(e: MouseEvent): void {
		const t = e.target as HTMLElement;
		// (another button pressed while a card is held or dragged: not a request for a menu)
		if (this.drag || this.press) { e.preventDefault(); return; }
		const card = t.closest<HTMLElement>('.binders-card[data-path]');
		if (!card) {
			// the board itself: what can be made here, and how the board shows
			if (t.closest('input, textarea, .is-editing')) return;
			e.preventDefault();
			const menu = new Menu();
			if (!this.ctx.readOnly) this.newMenu(menu, t.closest<HTMLElement>('.binders-group'));
			this.menu(menu);
			menu.showAtMouseEvent(e);
			return;
		}
		e.preventDefault();
		// on touch, a long press opens the menu (and a long press and move drags), so the browser's own one is ignored
		if (this.lastPointer === 'touch') return;
		if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
		this.cardMenu(card).showAtMouseEvent(e);
	}

	private onPointerDown(e: PointerEvent): void {
		this.lastPointer = e.pointerType;
		this.pressed = null;
		const t = e.target as HTMLElement;
		const card = t.closest<HTMLElement>('.binders-card[data-path]');
		// (a second finger isn't a press of its own: it ends the first's, so two fingers never hold or drag a card)
		if (!e.isPrimary) { this.endPress(); return; }
		if (!card || e.button !== 0 || t.closest('input, textarea') || this.drag) return;
		this.endPress();
		const touch = e.pointerType === 'touch';
		this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, touch, card, armed: false, timer: 0 };
		if (touch) {
			this.press.timer = window.setTimeout(() => {
				if (!this.press) return;
				this.press.armed = true;
				card.addClass('is-lifted');
			}, LONG_PRESS);
		} else if (!this.sel.has(card.dataset.path)) {
			// A card that isn't selected is selected as it's pressed, not when the button lifts: so a drag right away
			// drags it; and with Shift or Ctrl, so a hand that moves a little between the press and the release (which
			// makes it a drag, and no click follows) has still selected the range, and drags all of it.
			if (e.shiftKey || Keymap.isModEvent(e)) { this.clickSelect(card, e); this.pressed = card.dataset.path ?? null; }
			else this.select([card.dataset.path]);
		}
		const doc = this.board.doc;
		const move = (ev: PointerEvent) => this.onPointerMove(ev);
		const up = (ev: PointerEvent) => this.onPointerUp(ev, false);
		const cancel = (ev: PointerEvent) => this.onPointerUp(ev, true);
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
		doc.addEventListener('pointercancel', cancel);
		this.pressOff = () => { doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up); doc.removeEventListener('pointercancel', cancel); };
	}

	private pressOff: (() => void) | null = null;

	private endPress(): void {
		if (this.press) { window.clearTimeout(this.press.timer); this.press.card.removeClass('is-lifted'); }
		this.press = null;
		this.pressOff?.();
		this.pressOff = null;
	}

	private onPointerMove(e: PointerEvent): void {
		const p = this.press;
		if (!p || e.pointerId !== p.id) return;
		// The button was let go where the page couldn't see it (another window came in front, so no `pointerup`
		// came): the press is over, and a card in hand goes back where it was. It doesn't stay in hand for the next
		// click to drop.
		if (!p.touch && e.buttons === 0) {
			const carried = !!this.drag;
			this.endPress();
			if (carried) this.endDrag(false);
			return;
		}
		if (this.drag) { this.dragTo(e.clientX, e.clientY); return; }
		const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
		if (p.touch && !p.armed) { if (d > 10) this.endPress(); return; } // a swipe: let it scroll
		// (a finger held still isn't quite still: it takes a real move to start a drag, so a long press that wobbles
		// still opens the menu when it's let go)
		if (d > (p.touch ? 12 : 5)) {
			if (this.ctx.readOnly) { this.endPress(); return; }
			// from where it was pressed, so the card stays under the pointer where it was taken hold of
			this.startDrag(p.card, p.x, p.y);
			this.dragTo(e.clientX, e.clientY);
		}
	}

	private onPointerUp(e: PointerEvent, cancelled: boolean): void {
		const p = this.press;
		if (!p || e.pointerId !== p.id) return;
		if (p.touch && (this.drag || p.armed)) {
			// the touchend that follows comes in the same task; never let the flag outlive it
			this.swallowTouch = true;
			window.setTimeout(() => { this.swallowTouch = false; }, 0);
		}
		if (this.drag) {
			this.noClick = true;
			window.setTimeout(() => { this.noClick = false; }, 0);
			this.endPress();
			// let go outside the board: nothing moves, as when a drag in the file explorer ends outside it
			// (or on a folder in the breadcrumb above the board: there they go to that folder)
			this.dragTo(e.clientX, e.clientY);
			// (let go outside the view: whatever is there takes the card as a file, or nothing does)
			const file = this.drag.file;
			if (file?.out) { this.endDrag(false, false, !cancelled && file.drop(e.clientX, e.clientY)); return; }
			const inside = this.over(e.clientX, e.clientY) || !!this.drag.crumb;
			this.endDrag(!cancelled && inside);
			return;
		}
		if (p.touch && p.armed && !cancelled) {
			// held without moving: the menu
			this.noClick = true;
			window.setTimeout(() => { this.noClick = false; }, 0);
			const card = p.card;
			this.endPress();
			if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
			this.cardMenu(card).showAtPosition({ x: e.clientX, y: e.clientY }, this.board.doc);
			return;
		}
		this.endPress();
	}

	private startDrag(card: HTMLElement, x: number, y: number): void {
		if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
		const items = this.targets(card);
		if (!items.length) return;
		const doc = this.board.doc, r = card.getBoundingClientRect();
		// the card itself follows the pointer, held where it was taken, as an item being reordered does in Obsidian
		const ghost = doc.body.createDiv({ cls: 'drag-reorder-ghost binders-drag-ghost', attr: { 'aria-hidden': 'true' } });
		const copy = card.cloneNode(true) as HTMLElement;
		for (const a of ['tabindex', 'data-path', 'role', 'aria-selected']) copy.removeAttribute(a);
		copy.removeClasses(['is-selected', 'is-lifted', 'is-landing']);
		copy.addClass('mod-dragged-item');
		copy.setCssStyles({ width: `${r.width}px`, height: `${r.height}px` });
		ghost.appendChild(copy);
		if (items.length > 1) {
			ghost.addClass('is-multiple');
			ghost.createSpan({ cls: 'binders-drag-count', text: String(items.length) });
		}
		// the line that shows where they'll go: over everything, the card under the pointer too
		const indicator = doc.body.createDiv({ cls: 'binders-drop-indicator' });
		for (const c of this.cards()) if (items.some((f) => f.path === c.dataset.path)) c.addClass('is-dragging');
		this.board.addClass('is-dragging');
		doc.body.addClass('is-grabbing');
		// Escape cancels, as in the file explorer; the line follows a scroll (the wheel, or the edges below)
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancelDrag(); } };
		const scroller = this.scroller(), onScroll = () => { if (this.drag) this.drag.drop = this.dropAt(this.drag.x, this.drag.y); };
		doc.addEventListener('keydown', onKey, true);
		scroller.addEventListener('scroll', onScroll, { passive: true });
		this.drag = { items, ghost, indicator, drop: null, x, y, ox: x - r.left, oy: y - r.top, raf: 0, off: () => { doc.removeEventListener('keydown', onKey, true); scroller.removeEventListener('scroll', onScroll); } };
		this.drag.file = FileDrag.begin(this.ctx.app, { source: card, items, carried: ghost, morph: true, notes: (f) => this.store.scenes(f) });
		this.press.card.removeClass('is-lifted');
		this.dragTo(x, y);
		// (the frames of the window the board is in: the main window's stop when it is minimised, though a board in a
		// window of its own is being dragged on)
		const win = this.board.win;
		const tick = () => {
			if (!this.drag) return;
			if (!this.drag.file?.out) this.autoscroll();
			this.drag.raf = win.requestAnimationFrame(tick);
		};
		this.drag.raf = win.requestAnimationFrame(tick);
	}

	private dragTo(x: number, y: number): void {
		const d = this.drag;
		if (!d) return;
		d.x = x; d.y = y;
		d.ghost.setCssStyles({ transform: `translate(${x - d.ox}px, ${y - d.oy}px)` });
		// outside the view the card is a file, and Obsidian's to place: the board shows nowhere of its own to drop it
		if (d.file?.move(x, y)) {
			d.crumb?.removeClass('is-being-dragged-over');
			d.crumb = null;
			d.ghost.removeClass('is-over-crumb');
			d.drop = this.dropAt(-1, -1);
			return;
		}
		// Over a folder in the breadcrumb: the cards go to that folder, at its end (the way out of the folder shown, a
		// level up or more, since the board shows one folder at a time).
		const out = crumbAt(this.ctx, this.container, d.items, x, y);
		if (d.crumb && d.crumb !== (out?.el ?? null)) d.crumb.removeClass('is-being-dragged-over');
		d.crumb = out?.el ?? null;
		d.ghost.toggleClass('is-over-crumb', !!out);
		if (out) {
			out.el.addClass('is-being-dragged-over');
			this.dropAt(-1, -1); // (no line on the board meanwhile)
			d.drop = { group: { folder: out.folder, sub: false, items: [], end: null }, anchor: null };
			return;
		}
		d.drop = this.dropAt(x, y);
	}

	private autoscroll(): void {
		const d = this.drag, s = this.scroller();
		if (!d) return;
		const r = s.getBoundingClientRect(), edge = 48;
		if (d.x < r.left - 24 || d.x > r.right + 24) return; // over another pane: this one stays put
		// (the foot of what can be seen: on a phone Obsidian's bar of buttons lies over the end of the pane)
		const bottom = visibleBottom(s);
		const v = d.y < r.top + edge ? -(r.top + edge - d.y) : d.y > bottom - edge ? d.y - (bottom - edge) : 0;
		if (!v) { this.edgeSince = 0; return; }
		// gently at first, faster the nearer the edge; and faster the longer it's held there (a long binder is a long way)
		const depth = Math.min(1, Math.abs(v) / edge);
		this.edgeSince ||= performance.now();
		s.scrollTop += Math.sign(v) * Math.max(1, 14 * depth * depth) * held(this.edgeSince); // the scroll listener moves the line
	}

	/** The group a drop would move the cards into from another folder, tinted as a folder in the file explorer is. */
	private markTarget(sec: HTMLElement | null): void {
		for (const s of this.board.querySelectorAll('.binders-group.is-drop-target')) if (s !== sec) s.removeClass('is-drop-target');
		sec?.addClass('is-drop-target');
	}

	/** Where a drop at (x, y) would put the dragged items, and the insertion line that shows it. Null where a drop would
	    change nothing (back where they are) or can't be made: then there's no line. */
	private dropAt(x: number, y: number): Drop | null {
		const d = this.drag, line = d.indicator;
		const none = (): null => { line.removeClass('is-active'); this.markTarget(null); return null; };
		if (!this.over(x, y)) { for (const c of this.board.querySelectorAll('.is-being-dragged-over')) c.removeClass('is-being-dragged-over'); return none(); }
		// over the middle of a folder's card: into that folder, at its end (its edges still place the items beside it)
		const into = this.stackAt(x, y);
		for (const c of this.board.querySelectorAll('.is-being-dragged-over')) if (c !== into?.el) c.removeClass('is-being-dragged-over');
		if (into) {
			into.el.addClass('is-being-dragged-over');
			none();
			return { group: { folder: into.folder, sub: true, items: this.children(into.folder), end: null }, anchor: null };
		}
		const secs = [...this.board.querySelectorAll<HTMLElement>('.binders-group')];
		if (!secs.length) return none();
		// the group under the pointer, or the nearest one above or below it
		let sec = secs.find((s) => { const r = s.getBoundingClientRect(); return y >= r.top && y <= r.bottom; });
		if (!sec) sec = secs.reduce((best, s) => { const r = s.getBoundingClientRect(), dist = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom)); return !best || dist < best.dist ? { s, dist } : best; }, null as { s: HTMLElement; dist: number } | null).s;
		const g = this.groups[Number(sec.dataset.group)];
		// a folder can't go into itself
		if (d.items.some((f) => f instanceof TFolder && (g.folder === f || g.folder.path.startsWith(f.path + '/')))) return none();
		const list = sec.querySelector<HTMLElement>(':scope > .binders-cards');
		const slots = [...list.querySelectorAll<HTMLElement>(':scope > .binders-card-list > .binders-card[data-path]')];
		const rects = slots.map((s) => s.getBoundingClientRect());
		const style = getComputedStyle(list), rtl = style.direction === 'rtl';
		const oneColumn = style.gridTemplateColumns.trim().split(/\s+/).length < 2;
		const gap = (parseFloat(oneColumn ? style.rowGap : style.columnGap) || 12) / 2;
		// the line: `at` is the card it goes before, then where it's drawn (across a single column, else upright)
		let at = 0, mark: { x: number; y: number; length: number };
		const tile = list.querySelector<HTMLElement>(':scope > .binders-card-new')?.getBoundingClientRect();
		const cardHeight = parseFloat(style.getPropertyValue('--binders-card-height')) || 132;
		// the "New note" card on a row of its own (its group's last row is full): the pointer on that row is the group's end
		const wrapped = !!tile && !!rects.length && !oneColumn && tile.top > rects[rects.length - 1].bottom - 1 && y > rects[rects.length - 1].bottom + gap;
		if (!slots.length || wrapped) {
			// an empty group, or the end of a full one: where the next card would be, as tall as a card
			const r = tile ?? list.getBoundingClientRect();
			at = slots.length;
			mark = oneColumn ? { x: r.left, y: r.top - gap, length: list.getBoundingClientRect().width } : { x: rtl ? r.right + gap : r.left - gap, y: r.top, length: wrapped ? rects[rects.length - 1].height : cardHeight };
		} else {
			// the card nearest the pointer's height, and with it the row it's in
			const off = (r: DOMRect) => (y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0);
			const near = rects.reduce((best, r) => (off(r) < off(best) ? r : best));
			if (oneColumn) {
				const after = y >= near.top + near.height / 2;
				at = rects.indexOf(near) + (after ? 1 : 0);
				mark = { x: near.left, y: after ? near.bottom + gap : near.top - gap, length: near.width };
			} else {
				const row = rects.filter((r) => Math.abs(r.top - near.top) < 1);
				const top = Math.min(...row.map((r) => r.top)), length = Math.max(...row.map((r) => r.bottom)) - top;
				// the first card in the row whose middle is past the pointer, or the row's end
				const next = row.find((r) => (rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2));
				const last = row[row.length - 1];
				at = next ? rects.indexOf(next) : rects.indexOf(last) + 1;
				mark = { x: next ? (rtl ? next.right + gap : next.left - gap) : (rtl ? last.left - gap : last.right + gap), y: top, length };
			}
		}
		// the first card from there that isn't being moved, or the group's end
		const order = slots.map((s) => s.dataset.path), moving = new Set(d.items.map((f) => f.path));
		const after = order.slice(at).find((p) => !moving.has(p));
		const anchor = (after ? this.item(after) : null) ?? g.end;
		// back where they already are: nothing to show, nothing to do
		if (d.items.every((f) => order.includes(f.path))) {
			const rest = order.filter((p) => !moving.has(p)), k = after ? rest.indexOf(after) : rest.length;
			const result = [...rest.slice(0, k), ...order.filter((p) => moving.has(p)), ...rest.slice(k)];
			if (result.every((p, i) => p === order[i])) return none();
		}
		this.markTarget(g.sub && d.items.some((f) => f.parent !== g.folder) ? sec : null);
		// only in what shows of the board: a row half scrolled out has a shorter line
		const view = this.scroller().getBoundingClientRect();
		const y0 = Math.max(mark.y, view.top), y1 = Math.min(mark.y + (oneColumn ? 0 : mark.length), view.bottom);
		line.toggleClass('is-vertical', !oneColumn);
		line.toggleClass('is-active', y1 >= y0);
		if (oneColumn) line.setCssStyles({ left: `${mark.x}px`, top: `${mark.y - 1}px`, width: `${mark.length}px`, height: '' });
		else line.setCssStyles({ left: `${mark.x - 1}px`, top: `${y0}px`, height: `${y1 - y0}px`, width: '' });
		return { group: g, anchor };
	}

	/** The folder's card whose middle is at (x, y), if the dragged items can go into its folder. */
	private stackAt(x: number, y: number): { el: HTMLElement; folder: TFolder } | null {
		if (this.longform) return null;
		// (the card following the pointer and the line take no pointer events, so this is what's under them)
		const el = this.board.doc.elementFromPoint(x, y)?.closest<HTMLElement>('.binders-card.is-stack[data-path]');
		const folder = el && this.item(el.dataset.path);
		if (!el || !(folder instanceof TFolder)) return null;
		const r = el.getBoundingClientRect();
		if (x < r.left + r.width * 0.2 || x > r.right - r.width * 0.2 || y < r.top + r.height * 0.25 || y > r.bottom - r.height * 0.25) return null;
		// not into itself, or into a folder inside one being moved
		if (this.drag.items.some((f) => f === folder || (f instanceof TFolder && folder.path.startsWith(f.path + '/')))) return null;
		return { el, folder };
	}

	/** Ends a drag. A drop moves the items; otherwise (cancelled, let go outside the board or back where they were) the
	    card glides back to its place. `quiet`: the board is going away, so nothing is drawn. `taken`: let go outside
	    the view, where something took the card as a file. */
	private endDrag(drop: boolean, quiet = false, taken = false): void {
		const d = this.drag;
		if (!d) return;
		d.file?.end();
		this.board.win.cancelAnimationFrame(d.raf);
		for (const c of this.board.querySelectorAll('.is-being-dragged-over')) c.removeClass('is-being-dragged-over');
		d.crumb?.removeClass('is-being-dragged-over');
		this.markTarget(null);
		d.off();
		d.indicator.remove();
		this.board.removeClass('is-dragging');
		this.board.doc.body.removeClass('is-grabbing');
		this.drag = null;
		// the card under the pointer stays there until the board is drawn again, then the real one glides from it
		const land = () => {
			const from = d.ghost.firstElementChild?.getBoundingClientRect();
			d.ghost.remove();
			if (from && !quiet) for (const f of d.items) this.landing.set(f, from);
		};
		this.ring = false;
		if (drop && d.drop && !quiet) {
			const { group, anchor } = d.drop;
			this.moving = true;
			this.ring = true;
			// after this task: the redraw replaces the card under the finger, and its touchend must still reach the board
			window.setTimeout(() => { void this.moveItems(d.items, group.folder, anchor, group.depth).finally(() => { this.moving = false; land(); if (this.board.isConnected) this.draw(); }); }, 0);
			return;
		}
		// taken as a file by something outside the view (a note's text, the file explorer): nothing comes back to the
		// board from there, and the card stays dim in its slot for the moment a move takes to show
		if (taken && !quiet) { d.ghost.remove(); window.setTimeout(() => { if (this.board.isConnected && !this.busy()) this.draw(); }, 200); return; }
		land();
		if (!quiet) this.draw();
	}

	/** Items are being moved after a drop: no redraw until they all have, so each glides to its place once. */
	private moving = false;

	/** Ends a drag with nothing moved; the button or finger still down then does nothing when it lifts. */
	private cancelDrag(): void {
		const touch = !!this.press?.touch;
		this.endPress();
		this.endDrag(false);
		this.noClick = true;
		const doc = this.board.doc;
		doc.addEventListener('pointerup', () => {
			if (touch) this.swallowTouch = true;
			window.setTimeout(() => { this.noClick = false; this.swallowTouch = false; }, 0);
		}, { once: true, capture: true });
	}

	/** Moves items, in order, just before `anchor` in `folder` (or to its end), moving files between folders. In a
	    Longform project, `depth` is the group's indent, which the items take. */
	private async moveItems(items: TAbstractFile[], folder: TFolder, anchor: TAbstractFile | null, depth?: number): Promise<void> {
		try { await this.store.put(items, folder, anchor, depth); this.say(items); } catch (e) { new Notice(plain(e)); }
		this.select(items.map((f) => f.path), items[0]?.path ?? null);
	}

	private live: HTMLElement;
	/** Tells a screen reader where items just moved are: their place among what shows in their folder. */
	private say(items: TAbstractFile[]): void {
		const first = items[0], folder = first?.parent;
		if (!first || !folder) return;
		const shown = this.children(folder).filter((x) => this.isShown(x));
		this.live.setText(movedText(items.map(nameOf), shown.indexOf(first) + 1, shown.length, folder === this.ctx.folder ? '' : folder.name));
	}

	/** The board's own scroller, whether or not it has anything to scroll just now. */
	private scroller(): HTMLElement { return this.container; }

	/** Is the pointer over the board (a little past its sides still counts)? A drop anywhere else moves nothing, so no
	    line shows there and the board doesn't scroll for it. */
	private over(x: number, y: number): boolean { return overPane(this.container, x, y); }

	// ---- keyboard ----

	private onKey(e: KeyboardEvent): void {
		const card = (e.target as HTMLElement).closest?.<HTMLElement>('.binders-card[data-path]');
		if (!card || e.target !== card) return;
		const cards = this.cards(), i = cards.indexOf(card);
		// Mod with an arrow moves the focus and leaves the selection as it is; Space then adds the focused card to it or
		// takes it out, as in any list
		const mod = Keymap.isModEvent(e) === true || e.ctrlKey || e.metaKey;
		const go = (to: HTMLElement | undefined) => {
			if (!to) return;
			e.preventDefault();
			if (mod && !e.shiftKey) { this.focused = to.dataset.path; this.paintSelection(); }
			else if (e.shiftKey) {
				const order = cards.map((c) => c.dataset.path), a = order.indexOf(this.anchor ?? card.dataset.path), b = order.indexOf(to.dataset.path);
				this.select(order.slice(Math.min(a, b), Math.max(a, b) + 1), to.dataset.path, this.anchor ?? card.dataset.path);
			} else this.select([to.dataset.path]);
			to.focus();
			to.scrollIntoView({ block: 'nearest' });
		};
		const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
		// (in a right-to-left interface the first card is on the right: the arrow that points at a card goes to it)
		const before = getComputedStyle(this.board).direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
		if (e.altKey && arrows.includes(e.key) && !Keymap.isModEvent(e)) {
			e.preventDefault();
			if (!this.ctx.readOnly) void this.step(card, e.key === before || e.key === 'ArrowUp' ? -1 : 1);
			return;
		}
		if (Keymap.isModEvent(e) && e.key.toLowerCase() === 'a' && !e.shiftKey && !e.altKey) { e.preventDefault(); this.select(cards.map((c) => c.dataset.path), card.dataset.path, cards[0]?.dataset.path); return; }
		if (e.key === ' ' && !e.altKey && !e.shiftKey) {
			e.preventDefault();
			const path = card.dataset.path, sel = new Set(this.sel);
			if (sel.has(path) && sel.size > 1) sel.delete(path); else sel.add(path);
			this.select([...sel], path, path);
			return;
		}
		if (e.altKey || (mod && ![...arrows, 'Home', 'End', 'Enter'].includes(e.key))) return;
		switch (e.key) {
			case 'ArrowLeft': case 'ArrowRight': go(cards[i + (e.key === before ? -1 : 1)]); break;
			case 'ArrowUp': case 'ArrowDown': go(this.vertical(cards, card, e.key === 'ArrowUp' ? -1 : 1)); break;
			case 'Home': go(cards[0]); break;
			case 'End': go(cards[cards.length - 1]); break;
			case 'Enter': e.preventDefault(); this.open(card, Keymap.isModEvent(e)); break;
			case 'Delete': case 'Backspace': if (!this.ctx.readOnly) { e.preventDefault(); void this.remove(this.targets(card)); } break;
			case 'F2': if (!this.ctx.readOnly) { e.preventDefault(); this.editTitle(card); } break;
			case 'Escape': if (this.sel.size > 1) { e.preventDefault(); this.select([card.dataset.path]); } break;
			case 'ContextMenu': this.menuAtCard(e, card); break;
			case 'F10': if (e.shiftKey) this.menuAtCard(e, card); break;
		}
	}

	private menuAtCard(e: KeyboardEvent, card: HTMLElement): void {
		e.preventDefault();
		const r = card.getBoundingClientRect();
		this.cardMenu(card).showAtPosition({ x: r.left + 12, y: r.top + 24 }, this.board.doc);
	}

	/** The card above or below: the nearest by position, since rows can differ between groups. */
	private vertical(cards: HTMLElement[], card: HTMLElement, dir: 1 | -1): HTMLElement | undefined {
		const r = card.getBoundingClientRect(), cx = r.left + r.width / 2;
		let best: HTMLElement | undefined, score = Infinity;
		for (const c of cards) {
			const q = c.getBoundingClientRect();
			if (dir < 0 ? q.bottom > r.top - 1 : q.top < r.bottom + 1) continue;
			const dy = Math.abs((dir < 0 ? r.top - q.bottom : q.top - r.bottom)), dx = Math.abs(q.left + q.width / 2 - cx);
			const s = dy * 4 + dx;
			if (s < score) { score = s; best = c; }
		}
		return best;
	}

	private async step(card: HTMLElement, delta: number): Promise<void> {
		const items = this.targets(card);
		const list = delta < 0 ? items : [...items].reverse();
		let moved = false;
		for (const f of list) { if (!(await this.stepPast(f, delta))) break; moved = true; }
		if (moved) this.say(items);
		this.select(items.map((f) => f.path), card.dataset.path);
		this.draw();
		this.cardEl(card.dataset.path)?.focus();
	}

	/** Moves an item one card up or down: past the next card shown, so a filter's hidden notes (and attachments) keep
	    their places. False if no card is shown on that side. */
	private async stepPast(f: TAbstractFile, delta: number): Promise<boolean> {
		const folder = f.parent;
		if (!folder) return false;
		const shown = this.children(folder).filter((x) => this.isShown(x));
		const next = shown[shown.indexOf(f) + (delta < 0 ? -1 : 1)];
		if (!next || shown.indexOf(f) < 0) return false;
		const sibs = (this.store.orderedChildren(folder) ?? []).filter((x) => x !== f);
		await this.store.put([f], folder, sibs[sibs.indexOf(next) + (delta < 0 ? 0 : 1)] ?? null);
		return true;
	}

	// ---- actions ----

	/** Each card's title and synopsis fields, for Rename, Edit synopsis and F2. */
	private editors = new Map<string, { title: Editable; synopsis: Editable }>();
	private editTitle(card: HTMLElement): void { this.editors.get(card.dataset.path)?.title.edit(); }
	private editSynopsis(card: HTMLElement): void { this.editors.get(card.dataset.path)?.synopsis.edit(); }

	private async rename(f: TAbstractFile, name: string): Promise<void> {
		const was = f.path, selected = this.sel.has(was);
		await renameItem(this.ctx, f, name);
		if (was === f.path) return;
		if (selected) { this.sel.delete(was); this.sel.add(f.path); }
		if (this.focused === was) this.focused = f.path;
	}

	private async remove(items: TAbstractFile[]): Promise<void> {
		if (!items.length) return;
		// the focus goes to the card after the deleted ones (or before them), so the keyboard carries on from there
		const order = this.cards().map((c) => c.dataset.path), gone = (p: string) => items.some((f) => p === f.path || p.startsWith(f.path + '/'));
		const last = order.reduce((at, p, i) => (gone(p) ? i : at), -1);
		const next = order.slice(last + 1).find((p) => !gone(p)) ?? order.slice(0, Math.max(0, last)).reverse().find((p) => !gone(p)) ?? null;
		// (the board is drawn once, when everything has gone: not again for every note of five hundred on its way out)
		this.moving = true;
		let ok = false;
		try { ok = await removeItems(this.ctx, items); } finally { this.moving = false; }
		if (!ok) { if (this.dirty && !this.busy()) this.draw(); this.focus(); return; }
		// no card left: the New note card, so the keyboard still has somewhere to be
		if (!next) { this.board.querySelector<HTMLElement>('.binders-card-new')?.focus(); if (!this.busy()) this.draw(); return; }
		this.select([next]);
		this.refocus = next;
		if (!this.busy()) this.draw(); // else the redraw after typing focuses it
	}

	/** The menu of a card (or of the cards selected with it). */
	private cardMenu(card: HTMLElement): Menu {
		const items = this.targets(card), one = items.length === 1 ? items[0] : null;
		return itemMenu(this.ctx, items, {
			pick: () => { this.picking = true; },
			rename: () => this.editTitle(card),
			synopsis: () => this.editSynopsis(card),
			...this.orderHooks(one),
			remove: (all) => void this.remove(all),
			made: (f, rename) => this.onMade(f, rename),
		});
	}

	/** Something made from a menu (a copy, a folder around the selection): selected, and named in place if asked. */
	private onMade(f: TAbstractFile, rename: boolean): void {
		this.sel = new Set([f.path]);
		this.focused = this.anchor = f.path;
		if (this.busy()) { this.dirty = true; return; }
		this.draw();
		const name = this.editors.get(f.path)?.title;
		(this.cardEl(f.path) ?? name?.el)?.scrollIntoView({ block: 'nearest' });
		if (rename) name?.edit(); else this.cardEl(f.path)?.focus({ preventScroll: true });
	}

	/** "Move up" and "Move down": among the cards shown, as Alt+Up and Alt+Down. */
	private orderHooks(f: TAbstractFile | null): { up: (() => void) | null; down: (() => void) | null } {
		const sibs = f?.parent ? this.children(f.parent).filter((x) => this.isShown(x)) : [], i = f ? sibs.indexOf(f) : -1;
		return {
			up: f && i > 0 ? () => void this.stepPast(f, -1) : null,
			down: f && i >= 0 && i < sibs.length - 1 ? () => void this.stepPast(f, 1) : null,
		};
	}
}
