import { Keymap, Menu, Notice, TFile, setIcon, type PaneType, type TAbstractFile } from 'obsidian';
import { emptyState, itemMenu, plain, removeItems, renameItem, setStory } from './actions';
import { buildCard, cardKey, overPane, owedFocus, typingNow, type CardEditors, type CardHost } from './card';
import { Press, SelectBox, held as heldFor, visibleBottom } from './drag';
import { FileDrag } from './file-drag';
import { submenu } from './internals';
import { display, paintLabel } from './labels';
import { CARD_SIZES, readSize, type CardSize } from './lanes-data';
import { ask } from './modals';
import { readStory, setStoryPlaces, type StoryWrite } from './props';
import { parseStoryDate, showStoryDate, whyNotStoryDate, writeStoryDate, type StoryDate, type StoryPlace } from '../time/date';
import { TIMELINE_SHAPES, columnsFor, dateKey, dateText, dropWords, gapText, planAcross, planDrop, readShape, slotAt, timeline, unfoldTargets, whereAcross, yearText, yearsOf, type AcrossPlan, type Group, type Shape } from './timeline-data';
import { watchSize } from './windows';
import type { BinderMode, ModeContext, ModeFactory } from './mode';

/* The timeline: the scenes of the folder shown, and of the folders in it, along story time. A scene's place is its
   story date, a property of its own note (src/time/date.ts); the scenes without one wait in a tray. Every card says
   its number in the manuscript's order, so story time reads against the order of telling. The axis makes room for its
   cards (timeline-data.ts): nothing is to scale, each year is named, and a long stretch with nothing in it is drawn
   short and says how long it was.

   Two shapes, chosen under "Arrange" on a computer or a tablet (the view's option `timelineShape`):
     'down'    time runs down: each date a row, its name beside the line and its cards in rows after it; the tray
               down a side;
     'across'  time runs across: a card above or below the line at each mark, the dates on the line, the years in a
               strip over the cards; the tray along the foot.
   In a narrow pane (a phone) time runs down in one column, each date over its cards, and there is no other shape.

   This view writes nothing by being opened, scrolled, filtered or switched. A date is set from a card's menu ("Set
   story date…", actions.ts) or by dragging a card (`startDrag` and what follows it): onto a date, which it takes at
   the exactness that date has; onto the gap between two dates, which unfolds, while the card is over it, into the
   dates in it (`unfoldTargets`); before the first date or after the last, where a dialog asks; onto the tray, which
   takes the date away; and, among the cards of a day, to a place in its order. Only `story-date` and `story-order`
   are ever written, and a drag is one step for Undo. What a drop writes is worked out in timeline-data.ts (`planDrop`).

   Every card has a place worked out here, not flowed by the page, so only the cards near what is in sight exist
   (`sync`): a binder of a thousand scenes draws a few dozen. The keyboard and the selection go through the scenes
   themselves (`order`, `spots`), not through the cards that happen to be drawn. */

/** Narrower than this (a phone, a side pane) time runs down, in one column of small cards. */
const NARROW = 520;
const CARD = '.binders-card[data-path]';
/** In pixels: between two cards; (time across) a card's stem, the dates' strip under the line, a stem's and a date's
    place in from a card's edge, a shortened stretch, the years' strip over the cards. */
const BETWEEN = 12, STEM = 14, RULER = 26, INSET = 12, GAP = 84, YEARS = 24;
/** How far past what is in sight cards are kept, in screens: with it, about a screen and a half each way from the
    middle of the pane. (Less than one: the view's find bar marks the cards within a screen of what is in sight, and
    takes it that every card it is given is.) */
const MARGIN = 0.75;

/** Where a scene's card stands. `x`, `y`: in its parent; `ax`, `ay`: in the line, or in the tray's cards. */
interface Spot {
	file: TFile;
	/** Its number in the manuscript. */
	n: number;
	/** Its place among the cards of its list (the line's, or the tray's), from 1, and how many there are. */
	pos: number;
	of: number;
	date: StoryDate | null;
	parent: HTMLElement;
	tray: boolean;
	x: number; y: number; ax: number; ay: number; w: number; h: number;
	side: string;
}
interface Drawn { el: HTMLElement; key: string; editors: CardEditors }
/** A date's row: `box` is the date's group on the page, `el` what its cards are laid out in. */
interface Row { el: HTMLElement; box: HTMLElement; items: TFile[]; date: StoryDate }

/** What the pointer is over while cards are carried: a date's cards (`group`, by its place among the dates); the stretch
    before a date (`between`: before the date at `i`, 1 to the last), which unfolds; a place in an unfolded stretch
    (`target`, with its date); `open`, the unfolded stretch itself between its targets; before the first date or after
    the last (`edge`: `i` is 0, or the number of dates); the tray; the line with no date on it yet (`bare`). */
type Where = { kind: 'group' | 'between' | 'open' | 'edge'; i: number } | { kind: 'target'; date: StoryDate; el: HTMLElement } | { kind: 'tray' } | { kind: 'bare' };
/** What a drop would do: give the cards a date (and a place among the day's), take their dates away, or ask for one. */
type Drop = { kind: 'date'; date: StoryDate; at: number; row?: HTMLElement } | { kind: 'tray' } | { kind: 'ask'; near: StoryDate | null; words: string };
/** The cards in hand. */
interface Carry {
	files: TFile[];
	paths: Set<string>;
	ghost: HTMLElement;
	/** The line that shows a place among a day's cards (the drop indicator the boards use). */
	mark: HTMLElement;
	tag: HTMLElement;
	touch: boolean;
	x: number; y: number;
	/** Where in the card it was taken hold of, so it stays under the pointer there. */
	ox: number; oy: number;
	raf: number;
	edge: number;
	/** Outside the view the card is a file, and the drag Obsidian's (file-drag.ts). Null where it can't be handed one. */
	file: FileDrag | null;
	drop: Drop | null;
	/** The timer of a stretch about to unfold, and what is lit now. */
	dwell: number;
	dwellFor: number;
	lit: HTMLElement | null;
	said: string;
}

/** How near a date's mark a point along the line is still that date (time across), and how long a pointer rests on the
    boundary between two dates before it unfolds (ms). */
const NEAR = 40, DWELL = 150;
/** Time down: the width of the strip at a date's top and foot that is the boundary with its neighbour. */
const EDGE = 8;
/** The room a drop target takes in an unfolded stretch (time across), and the most of them in a column. */
const CHIP_W = 76, CHIP_H = 28, CHIP_GAP = 6, MOST_ROWS = 6;

export const timelineMode: ModeFactory = (container, ctx) => new Timeline(container, ctx);

class Timeline implements BinderMode {
	readonly filters = true;
	private board: HTMLElement;
	private line: HTMLElement;
	private tray: HTMLElement;
	private trayCards: HTMLElement | null = null;
	private emptyEl: HTMLElement | null = null;
	private sig = '';
	/** Selected scenes by path; `anchor` is where a Shift-click range starts, `focused` the card with the focus. */
	private sel = new Set<string>();
	private anchor: string | null = null;
	private focused: string | null = null;
	private selectedAt = 0;
	private picking = false;
	private editing = 0;
	private dirty = false;
	private focusOnDraw = false;
	/** Notes made here since the filter last changed: they show though the filter would hide them. */
	private made = new Set<TFile>();
	/** Every scene's place, by path, and the scenes in story order (the line's, then the tray's). */
	private spots = new Map<string, Spot>();
	private order: string[] = [];
	/** The cards that exist now. */
	private cards = new Map<string, Drawn>();
	/** What was last drawn, kept for laying it out again when the pane changes size. */
	private groups: Group<TFile>[] = [];
	private undated: TFile[] = [];
	private numbers = new Map<string, number>();
	private rows: Row[] = [];
	private plan: AcrossPlan | null = null;
	private press: Press<HTMLElement>;
	/** The cards being carried, if any; the stretch between two dates that is unfolded for them (the date it is before,
	    by its place among the dates); and each scene's date's place among the dates. */
	private carry: Carry | null = null;
	private opening: number | null = null;
	private groupAt = new Map<string, number>();
	/** Time down: how many cards stand side by side in a date's row. */
	private cols = 1;
	private box: SelectBox | null = null;
	private boxFrom: { focused: string | null; anchor: string | null } = { focused: null, anchor: null };
	/** The card a press has already selected: the click that ends that press selects nothing more. */
	private pressed: string | null = null;
	private raf = 0;
	private cleanup: (() => void)[] = [];

	constructor(private container: HTMLElement, private ctx: ModeContext) {}

	private get store() { return this.ctx.store; }
	private get narrow(): boolean { const w = this.container.clientWidth; return w > 0 && w < NARROW; }
	private get shape(): Shape { return readShape(this.ctx.option<unknown>('timelineShape', 'down')); }
	private get size(): CardSize { return readSize(this.ctx.option<unknown>('cardSize', null), this.narrow ? 'small' : 'medium'); }
	private get tint(): boolean { return this.ctx.option<unknown>('labelStyle', 'tint') !== 'stripe'; }
	/** Is the tray of scenes without a date open? (Shut on a phone until asked for: it lies over the foot of the page.) */
	private get trayOpen(): boolean { return this.ctx.option<unknown>('timelineTray', !this.narrow) === true; }
	/** How the page is laid out: across; or down, with the dates in a strip beside the cards or (a phone) over them. */
	private get layout(): 'across' | 'strip' | 'heads' { return this.narrow ? 'heads' : this.shape === 'across' ? 'across' : 'strip'; }
	/** Where the tray is: the whole page (no scene has a date yet), a sheet over the foot (a phone), along the foot
	    (time across), down a side. */
	private get trayKind(): 'page' | 'sheet' | 'foot' | 'side' { return !this.groups.length ? 'page' : this.narrow ? 'sheet' : this.shape === 'across' ? 'foot' : 'side'; }
	private css(name: string, or: number): number { return parseFloat(getComputedStyle(this.board).getPropertyValue(name)) || or; }

	// ---- the mode ----

	render(): void {
		const box = this.container;
		box.addClasses(['binders-corkboard', 'mod-timeline']);
		this.board = box.createDiv({ cls: 'binders-board binders-timeline-board' });
		this.line = this.board.createDiv({ cls: 'binders-timeline' });
		this.tray = this.board.createDiv({ cls: 'binders-timeline-tray' });
		const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement, t: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
			el.addEventListener(t, fn, opts);
			this.cleanup.push(() => el.removeEventListener(t, fn, opts));
		};
		on(this.board, 'click', (e) => this.onClick(e));
		on(this.board, 'dblclick', (e) => this.onDblClick(e));
		// a middle click opens a card in a new tab, as it does a link (and doesn't start autoscroll)
		on(this.board, 'mousedown', (e) => { if (e.button === 1 && (e.target as HTMLElement).closest(CARD)) e.preventDefault(); });
		on(this.board, 'auxclick', (e) => {
			const card = (e.target as HTMLElement).closest<HTMLElement>(CARD);
			if (e.button !== 1 || !card || (e.target as HTMLElement).closest('input, textarea')) return;
			e.preventDefault();
			this.open(card.dataset.path, 'tab');
		});
		on(this.board, 'contextmenu', (e) => this.onContextMenu(e));
		on(this.board, 'keydown', (e) => this.onKey(e));
		// (cards come and go as the page moves: the page itself, and the tray where it scrolls by itself)
		on(box, 'scroll', this.later, { passive: true });
		on(this.tray, 'scroll', this.later, { passive: true });
		// with time across, the wheel goes along the line when there's nowhere to go down
		on(box, 'wheel', (e) => {
			if (this.layout !== 'across' || e.shiftKey || e.ctrlKey || e.metaKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY) || box.scrollHeight > box.clientHeight + 1 || (e.target as HTMLElement).closest('.binders-timeline-tray')) return;
			e.preventDefault();
			box.scrollLeft += e.deltaY;
		}, { passive: false });
		const moved = this.ctx.app.vault.on('rename', (f, old) => {
			const re = (p: string) => (p === old ? f.path : p.startsWith(old + '/') ? f.path + p.slice(old.length) : p);
			this.sel = new Set([...this.sel].map(re));
			if (this.focused) this.focused = re(this.focused);
			if (this.anchor) this.anchor = re(this.anchor);
		});
		this.cleanup.push(() => this.ctx.app.vault.offref(moved));
		// (a note's story date is read from Obsidian's index: drawn again when the index has it)
		const changed = this.ctx.app.metadataCache.on('changed', () => this.refresh());
		this.cleanup.push(() => this.ctx.app.metadataCache.offref(changed));
		this.cleanup.push(owedFocus(this.container, () => this.focusOnDraw, () => { this.focusOnDraw = false; }));
		// a press on empty space that becomes a drag draws a selection box (drag.ts)
		this.box = new SelectBox({
			el: this.container,
			empty: (t) => this.container.contains(t) && !t.closest('.binders-card, .binders-timeline-tray-head, .binders-view-synopsis-row, .is-editing, input, textarea, a, button'),
			cards: () => this.drawn(),
			begin: () => {
				const sel = [...this.sel], focused = this.focused, anchor = this.anchor;
				this.boxFrom = { focused, anchor };
				return { selected: this.order.filter((x) => this.sel.has(x)), restore: () => this.select(sel, focused, anchor) };
			},
			select: (paths, touched) => this.select(paths, touched[touched.length - 1] ?? this.boxFrom.focused, this.boxFrom.anchor ?? touched[0] ?? null),
			end: (kept) => { if (kept && this.sel.size) this.cardEl(this.focused)?.focus({ preventScroll: true }); },
		});
		this.cleanup.push(() => this.box?.destroy());
		this.press = new Press<HTMLElement>({
			el: this.board,
			pick: (e) => {
				const t = e.target as HTMLElement, card = t.closest<HTMLElement>(CARD);
				return card && !t.closest('.is-editing') ? { el: card, data: card } : null;
			},
			down: (card, e) => {
				const path = card.dataset.path ?? '';
				this.pressed = null;
				if (this.sel.has(path)) return;
				if (e.shiftKey || Keymap.isModEvent(e)) { this.clickSelect(path, e); this.pressed = path; } else this.select([path]);
			},
			// (a drag sets a story date; carried out of the view the cards are files, file-drag.ts, as on the boards)
			canDrag: () => !this.ctx.readOnly,
			start: (card, x, y) => this.startDrag(card, x, y),
			move: (x, y) => this.dragTo(x, y),
			end: (drop, x, y) => {
				// (let go outside the view: whatever is there takes the cards as files, or nothing does)
				const file = this.carry?.file;
				if (file?.out) { this.endDrag(false, drop && file.drop(x, y)); return; }
				if (drop) this.dragTo(x, y);
				this.endDrag(drop);
			},
			hold: (card, x, y) => {
				const path = card.dataset.path ?? '';
				if (!this.sel.has(path)) this.select([path]);
				this.cardMenu(path).showAtPosition({ x, y }, this.board.doc);
			},
		});
		this.cleanup.push(watchSize(this.ctx.app, box, this.fit));
		this.draw();
	}

	refresh(): void {
		if (this.editing > 0) { this.dirty = true; return; }
		if (this.signature() !== this.sig) this.draw();
	}

	unload(): void {
		this.press?.destroy();
		if (this.carry) this.endDrag(false, false, true);
		if (this.raf) this.container.win.cancelAnimationFrame(this.raf);
		for (const f of this.cleanup) f();
		this.cleanup = [];
		this.container.empty();
		this.container.removeClasses(['binders-corkboard', 'mod-timeline', 'mod-across', 'mod-down', 'mod-strip', 'mod-heads', 'is-narrow']);
	}

	/** The pane changed size: a phone's width has one shape; else the cards are laid out again where they stand. */
	private fit = (): void => {
		if (this.editing > 0) { this.dirty = true; return; }
		if (this.signature() !== this.sig) this.draw(); else { this.layOut(); this.sync(); }
	};

	focus(): void {
		const path = this.focused && this.spots.has(this.focused) ? this.focused : this.order[0];
		if (!path) { this.focusOnDraw = true; return; }
		this.focused = path;
		this.show(path);
		this.cardEl(path)?.focus({ preventScroll: true });
		this.paintSelection();
	}

	place(): unknown { return { left: this.container.scrollLeft, top: this.container.scrollTop, sel: [...this.sel], focused: this.focused }; }

	restore(place: unknown): void {
		const p = (place ?? {}) as { left?: unknown; top?: unknown; sel?: unknown; focused?: unknown };
		const sel = Array.isArray(p.sel) ? p.sel.filter((x): x is string => typeof x === 'string' && this.spots.has(x)) : [];
		this.select(sel, typeof p.focused === 'string' && this.spots.has(p.focused) ? p.focused : sel[sel.length - 1] ?? null);
		if (typeof p.left === 'number') this.container.scrollLeft = p.left;
		if (typeof p.top === 'number') this.container.scrollTop = p.top;
		this.sync();
	}

	/** The folder's synopsis is the page's first line, and scrolls with it. */
	adopt(header: HTMLElement): void { this.container.prepend(header); this.layOut(); this.sync(); }

	reveal(item: TAbstractFile, fresh = false): void {
		const spot = this.spots.get(item.path);
		if (!spot) return;
		// (a scene with no date, the tray shut: it opens, so the card is there to see)
		if (spot.tray && !this.trayOpen) { this.ctx.setOption('timelineTray', true); this.draw(); }
		this.select([item.path], item.path);
		this.show(item.path);
		const el = this.cardEl(item.path);
		if (fresh && !this.ctx.readOnly) this.cards.get(item.path)?.editors.title.edit(); else el?.focus({ preventScroll: true });
	}

	selected(): TAbstractFile[] { return this.order.filter((p) => this.sel.has(p)).map((p) => this.spots.get(p)?.file).filter((f): f is TFile => !!f); }

	current(): TAbstractFile | null {
		const path = this.focused ?? this.order.find((p) => this.sel.has(p));
		return path ? this.spots.get(path)?.file ?? null : null;
	}

	/** A new note goes at the end of the folder shown, and into the tray: it has no date yet. */
	create(kind: 'note' | 'folder'): void {
		if (this.ctx.readOnly || kind !== 'note') return;
		void this.store.newSceneByHand(this.ctx.folder, Infinity, 'Untitled').then((file) => {
			this.made.add(file);
			this.ctx.made(file);
			this.onMade(file, true);
		}, (e) => new Notice(plain(e)));
	}

	private onMade(f: TAbstractFile, rename: boolean): void {
		this.sel = new Set([f.path]);
		this.focused = this.anchor = f.path;
		if (this.editing > 0) { this.dirty = true; return; }
		this.draw();
		this.reveal(f, rename);
	}

	private set(key: string, value: unknown): void { this.ctx.setOption(key, value); if (this.editing > 0) this.dirty = true; else this.draw(); }

	/** Turns time the other way. Where the page had been scrolled to means nothing the other way: the card in hand is
	    brought into sight, or with none, the page starts at the beginning. */
	private turn(to: Shape): void {
		if (to === this.shape) return;
		this.set('timelineShape', to);
		if (this.editing > 0) return;
		this.container.scrollTo(0, 0);
		this.sync();
		const at = this.focused ?? this.order.find((p) => this.sel.has(p));
		if (at) this.show(at);
	}

	/** Which way time runs: the toolbar's "Arrange", the view's "More options" and the board's own menu list the same
	    two, one ticked. A pane as narrow as a phone has one way only, and the menu says which. */
	arrangeItems(menu: Menu): void {
		for (const sh of TIMELINE_SHAPES) menu.addItem((i) => i.setSection('binders-arrange').setTitle(sh.title).setIcon(sh.icon).setChecked(this.narrow ? sh.id === 'down' : this.shape === sh.id).setDisabled(this.narrow).onClick(() => this.turn(sh.id)));
	}

	/** How the cards show, as on the corkboard (the same options, kept under the same names). */
	menu(menu: Menu): void {
		if (!this.narrow) this.arrangeItems(menu);
		menu.addItem((i) => {
			i.setSection('view').setTitle('Card size').setIcon('scaling');
			submenu(i, (m) => { for (const size of CARD_SIZES) m.addItem((x) => x.setTitle(display(size)).setChecked(this.size === size).onClick(() => this.set('cardSize', size))); }, menu);
		});
		menu.addItem((i) => i.setSection('view').setTitle('Tint cards with their label color').setIcon('paint-bucket').setChecked(this.tint).onClick(() => this.set('labelStyle', this.tint ? 'stripe' : 'tint')));
	}

	newMenu(menu: Menu): void {
		menu.addItem((i) => i.setSection('new').setTitle('New note').setIcon('file-plus').onClick(() => this.create('note')));
	}

	filterChanged(): void { this.made.clear(); }

	// ---- the model ----

	private scenes(): TFile[] { return this.store.scenes(this.ctx.folder).filter((f) => this.made.has(f) || this.ctx.visible(f)); }

	private placeOf(f: TFile): StoryPlace | null {
		const s = readStory(this.ctx.plugin, f);
		return s.date ? { date: s.date, order: s.order } : null;
	}

	/** Everything a redraw would show, so a refresh that changes nothing visible draws nothing. */
	private signature(): string {
		const s = this.ctx.plugin.settings;
		return JSON.stringify([this.ctx.readOnly, s.labels, s.storyDateProp, s.storyOrderProp, this.tint, this.layout, this.size, this.trayOpen, this.ctx.filtering(),
			this.scenes().map((f) => { const st = readStory(this.ctx.plugin, f); return [cardKey(this.ctx, f), st.raw, st.order]; })]);
	}

	// ---- drawing ----

	private host: CardHost = {
		ctx: this.ctx,
		rename: (f, name) => renameItem(this.ctx, f, name),
		onEditing: (on, card) => this.onEditing(on, card),
		// (as on the corkboard: a click on a selected card's synopsis edits it)
		editOnClick: (card) => this.sel.has(card.dataset.path ?? '') && performance.now() - this.selectedAt > 300,
	};

	private onEditing(on: boolean, card?: HTMLElement): void {
		this.editing += on ? 1 : -1;
		// (said on the card, for the stylesheet: it grows to hold what's being written)
		card?.toggleClass('has-editing', !!card.querySelector('.is-editing'));
		if (!on && this.editing <= 0) window.setTimeout(() => { if (this.editing <= 0 && (this.dirty || this.signature() !== this.sig)) this.draw(); }, 0);
	}

	private draw(): void {
		const box = this.container, top = box.scrollTop, left = box.scrollLeft, doc = box.doc, hadFocus = this.board.contains(doc.activeElement);
		const layout = this.layout;
		this.dirty = false;
		box.toggleClass('mod-across', layout === 'across');
		box.toggleClass('mod-down', layout !== 'across');
		box.toggleClass('mod-strip', layout === 'strip');
		box.toggleClass('mod-heads', layout === 'heads');
		box.toggleClass('is-narrow', this.narrow);
		this.board.toggleClass('is-read-only', this.ctx.readOnly);
		for (const s of CARD_SIZES) this.board.toggleClass(`mod-cards-${s}`, this.size === s);
		this.board.toggleClass('mod-label-tint', this.tint);
		// each card says its place in the manuscript, whatever its place in time (and whatever the corkboard's "Number
		// the cards" says: here the number is what the board is for)
		this.board.addClass('mod-numbers');

		const scenes = this.scenes(), places = new Map(scenes.map((f) => [f, this.placeOf(f)]));
		const { groups, undated } = timeline(scenes, (f) => places.get(f) ?? null);
		this.groups = groups;
		this.undated = undated;
		// (the book's numbers, not the count of those that show: under a filter a scene keeps its place in the manuscript)
		this.numbers = new Map(this.store.scenes(this.ctx.folder).map((f, i) => [f.path, i + 1]));
		this.order = [...groups.flatMap((g) => g.items), ...undated].map((f) => f.path);
		this.groupAt = new Map(groups.flatMap((g, i) => g.items.map((f) => [f.path, i] as [string, number])));
		// (a stretch that was unfolded for a drop is shut if the dates around it have gone)
		if (this.opening != null && (!this.carry || this.opening < 1 || this.opening >= groups.length)) this.opening = null;
		this.board.toggleClass('has-dates', groups.length > 0);
		this.board.toggleClass('is-empty', !scenes.length);

		// (the cards that exist are taken off the page with what they stood in, and put back where they stand now)
		for (const d of this.cards.values()) d.el.detach();
		this.line.empty();
		this.line.removeAttribute('style');
		this.rows = [];
		this.plan = null;
		if (groups.length) {
			this.line.setAttrs({ role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': `${this.ctx.folder.name}, in story time` });
			if (layout === 'across') this.drawAcross(); else this.drawDown();
		} else {
			for (const a of ['role', 'aria-multiselectable', 'aria-label']) this.line.removeAttribute(a);
			if (scenes.length) this.drawNone();
		}
		this.drawTray();
		this.layOut();

		// nothing to show: the same words every mode has for that
		this.emptyEl?.remove();
		this.emptyEl = scenes.length ? null : emptyState(this.ctx, this.container);
		if (this.emptyEl) this.container.insertBefore(this.emptyEl, this.board);

		for (const p of [...this.sel]) if (!this.spots.has(p)) this.sel.delete(p);
		if (this.focused && !this.spots.has(this.focused)) this.focused = null;
		if (this.anchor && !this.spots.has(this.anchor)) this.anchor = null;
		box.scrollTop = top;
		box.scrollLeft = left;
		this.sync();
		this.sig = this.signature();
		if (this.focusOnDraw && this.order.length) { this.focusOnDraw = false; if (!typingNow(doc)) this.focus(); }
		else if (hadFocus && !typingNow(doc)) this.cardEl(this.focused)?.focus({ preventScroll: true });
	}

	/** What a date is called aloud, and after a stretch drawn short, how long that was. */
	private said(g: Group<TFile>): string { return showStoryDate(g.date) + (g.gap == null ? '' : `, ${gapText(g.gap)} after the date before`); }

	/** A stretch drawn short: a break in the line that says how long it was. (Said aloud with the date after it.) */
	private gap(into: HTMLElement, g: Group<TFile>, before: Group<TFile>, index: number): HTMLElement {
		// (carried over, it unfolds into the dates in it: the two dates it says here, and its place among the dates)
		const br = into.createDiv({ cls: 'binders-timeline-gap', attr: { 'aria-hidden': 'true', 'data-after': String(writeStoryDate(before.date)), 'data-before': String(writeStoryDate(g.date)), 'data-index': String(index) } });
		br.createSpan({ cls: 'binders-timeline-gap-text', text: gapText(g.gap ?? 0) });
		return br;
	}

	/** The dates a stretch is unfolded into while cards are carried over it: one place to drop on for each, in time's
	    order. `rows`: how many to a column (time across), which says how wide the room is. */
	private unfold(into: HTMLElement, gi: number, across = false): HTMLElement {
		const groups = this.groups, t = unfoldTargets(groups[gi - 1].date, groups[gi].date), rows = across ? this.unfoldRows(gi) : 0;
		const el = into.createDiv({ cls: 'binders-timeline-unfold', attr: { 'aria-hidden': 'true', 'data-index': String(gi) } });
		for (const date of t.dates) {
			// (a day says its day and month; a month its month and year; a year its year)
			const text = t.unit === 'd' ? dateText(date, { short: true }) : t.unit === 'm' ? dateText(date, { short: true, year: true }) : yearText(date.y);
			el.createDiv({ cls: 'binders-timeline-target', text, attr: { 'data-date': String(writeStoryDate(date)) } });
		}
		if (rows) el.setCssProps({ '--binders-unfold-rows': String(rows), '--binders-unfold-cols': String(Math.ceil(t.dates.length / rows)) });
		return el;
	}

	/** Time across: how many targets stand in a column of the unfolded stretch, and (below) how wide that makes it. */
	private unfoldRows(gi: number): number { return Math.min(MOST_ROWS, unfoldTargets(this.groups[gi - 1].date, this.groups[gi].date).dates.length); }
	private unfoldWidth(gi: number): number {
		const n = unfoldTargets(this.groups[gi - 1].date, this.groups[gi].date).dates.length, cols = Math.ceil(n / Math.max(1, this.unfoldRows(gi)));
		return cols * CHIP_W + Math.max(0, cols - 1) * CHIP_GAP + 2 * CHIP_GAP;
	}

	/** Is there anything between the dates before and at `gi` to drop on (are they more than a day apart)? */
	private roomBetween(gi: number): boolean {
		return gi > 0 && gi < this.groups.length && unfoldTargets(this.groups[gi - 1].date, this.groups[gi].date).dates.length > 0;
	}

	/** Time across: the line through the middle with the dates on it, each card on a short stem above or below; the
	    years in a strip over the cards, each staying in sight while its dates scroll. */
	private drawAcross(): void {
		const groups = this.groups, w = this.css('--binders-card-width', 210), h = this.css('--binders-card-height', 150);
		const open = this.opening, plan = this.plan = planAcross(groups.map((g) => g.items.length), groups.map((g) => g.gap != null), w, BETWEEN, GAP, open != null ? { before: open, width: this.unfoldWidth(open) } : undefined);
		const y = YEARS + h + STEM; // the line
		const el = this.line, hidden = { 'aria-hidden': 'true' };
		el.setCssProps({ width: `${plan.width}px`, height: `${y + 2 + RULER + h}px`, '--binders-timeline-y': `${y}px` });
		// the line, in the stretches that are drawn as they are; each shortened stretch is a break in it
		let from = 0;
		const solid = (to: number) => { if (to > from) el.createDiv({ cls: 'binders-timeline-line', attr: hidden }).setCssProps({ left: `${from}px`, width: `${to - from}px` }); };
		const gapAt = new Map<number, number>();
		for (const gap of plan.gaps) {
			solid(gap.x);
			gapAt.set(gap.before, gap.x);
			this.gap(el, groups[gap.before], groups[gap.before - 1], gap.before).setCssProps({ left: `${gap.x}px`, width: `${GAP}px` });
			from = gap.x + GAP;
		}
		solid(plan.width);
		// (a stretch unfolded for the cards being carried: its targets stand around the line)
		if (plan.opening) this.unfold(el, plan.opening.before, true).setCssProps({ left: `${plan.opening.x}px`, width: `${plan.opening.width}px`, top: `${y - this.unfoldRows(plan.opening.before) * (CHIP_H + CHIP_GAP) / 2}px` });
		// the years: each from its first date to the next year's (or to the break before it)
		const years = yearsOf(groups);
		years.forEach((year, i) => {
			const next = years[i + 1], to = next ? (gapAt.get(next.from) ?? plan.groups[next.from].x) - BETWEEN : plan.width;
			const span = el.createDiv({ cls: 'binders-timeline-yearspan', attr: hidden });
			span.setCssProps({ left: `${plan.groups[year.from].x}px`, width: `${Math.max(0, to - plan.groups[year.from].x)}px` });
			span.createSpan({ cls: 'binders-timeline-yearname', text: yearText(year.y) });
		});
		groups.forEach((g, gi) => {
			const at = plan.groups[gi];
			el.createDiv({ cls: 'binders-timeline-date', text: dateText(g.date, { short: true }), attr: hidden }).setCssProps({ left: `${at.x + INSET}px` });
			// (a date with several scenes: its mark runs along the line as far as its last card begins)
			if (at.to > at.x) el.createDiv({ cls: 'binders-timeline-span', attr: hidden }).setCssProps({ left: `${at.x + INSET}px`, width: `${at.to - at.x}px` });
			for (const p of plan.cards[gi]) el.createDiv({ cls: `binders-timeline-stem mod-${p.side}`, attr: hidden }).setCssProps({ left: `${p.x + INSET}px` });
			// (the date's cards are its group, to a screen reader; on the page they stand along the line)
			const box = el.createDiv({ cls: 'binders-timeline-group', attr: { role: 'group', 'aria-label': this.said(g), 'data-date': String(writeStoryDate(g.date)) } });
			this.rows.push({ el: box, box, items: g.items, date: g.date });
		});
	}

	/** Time down: each year a heading that stays in sight while its dates scroll; each date a row, its name beside the
	    line (or over its cards) and its cards in rows after it. */
	private drawDown(): void {
		let year: HTMLElement = this.line;
		this.groups.forEach((g, gi) => {
			if (g.newYear) {
				if (g.gap != null) this.gap(this.line, g, this.groups[gi - 1], gi);
				if (this.opening === gi) this.unfold(this.line, gi);
				year = this.line.createDiv({ cls: 'binders-timeline-yeargroup' });
				year.createDiv({ cls: 'binders-timeline-yearhead', attr: { 'aria-hidden': 'true' } }).createSpan({ cls: 'binders-timeline-yearname', text: yearText(g.date.y) });
			} else {
				if (g.gap != null) this.gap(year, g, this.groups[gi - 1], gi);
				if (this.opening === gi) this.unfold(year, gi);
			}
			const row = year.createDiv({ cls: 'binders-timeline-group', attr: { role: 'group', 'aria-label': this.said(g), 'data-date': String(writeStoryDate(g.date)) } });
			// (the year is over it: a date says its day and month, and a date that is only a year says so)
			row.createDiv({ cls: 'binders-timeline-date', text: g.date.m == null ? `In ${yearText(g.date.y)}` : dateText(g.date), attr: { 'aria-hidden': 'true' } });
			this.rows.push({ el: row.createDiv({ cls: 'binders-timeline-cards' }), box: row, items: g.items, date: g.date });
		});
	}

	/** No scene has a date yet: the line with nothing on it, and what to do about that. The scenes are all in the tray,
	    which is the page then. */
	private drawNone(): void {
		const row = this.line.createDiv({ cls: 'binders-timeline-none' });
		row.createDiv({ cls: 'binders-timeline-line', attr: { 'aria-hidden': 'true' } });
		row.createDiv({ cls: 'binders-timeline-none-text', text: this.ctx.readOnly ? 'No scene has a story date yet.' : 'No scene has a story date yet. Choose “Set story date” in a card’s menu to say when it happens.' });
	}

	/** The scenes without a date, in the manuscript's order, under their count. */
	private drawTray(): void {
		const tray = this.tray, undated = this.undated, kind = this.trayKind, open = this.trayOpen || kind === 'page';
		tray.empty();
		this.trayCards = null;
		tray.className = `binders-timeline-tray mod-${kind}`;
		// (while cards are carried the tray is there to be dropped on, empty or not: a drop on it takes the date away)
		const shown = undated.length > 0 || !!this.carry;
		tray.toggleClass('is-hidden', !shown);
		tray.toggleClass('is-open', open);
		if (!shown) return;
		const head = tray.createDiv({ cls: 'binders-timeline-tray-head', attr: { role: 'button', tabindex: '0', 'aria-expanded': String(open), 'aria-label': `No date: ${undated.length} ${undated.length === 1 ? 'scene' : 'scenes'}` } });
		// (with no date anywhere the tray is the page, and has nothing to fold into)
		if (kind !== 'page') {
			setIcon(head.createSpan({ cls: 'binders-timeline-tray-fold collapse-icon' + (open ? '' : ' is-collapsed') }), 'right-triangle');
			const toggle = (e: Event) => { e.stopPropagation(); this.set('timelineTray', !open); };
			head.addEventListener('click', toggle);
			head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
		} else for (const a of ['role', 'tabindex', 'aria-expanded']) head.removeAttribute(a);
		head.createSpan({ cls: 'binders-timeline-tray-name', text: 'No date' });
		head.createSpan({ cls: 'binders-timeline-tray-count', text: String(undated.length) });
		if (open) this.trayCards = tray.createDiv({ cls: 'binders-timeline-tray-cards', attr: { role: 'listbox', 'aria-multiselectable': 'true', 'aria-label': 'Scenes with no story date' } });
	}

	/** Works out where every card stands (from the page as it is laid out now), without making any. */
	private layOut(): void {
		const spots = new Map<string, Spot>(), w = this.css('--binders-card-width', 210), h = this.css('--binders-card-height', 150);
		const dated = this.groups.reduce((n, g) => n + g.items.length, 0);
		let pos = 0;
		const put = (file: TFile, date: StoryDate | null, parent: HTMLElement, tray: boolean, of: number, at: { x: number; y: number; ax: number; ay: number; w: number; h: number; side?: string }) => {
			spots.set(file.path, { file, n: this.numbers.get(file.path) ?? 0, pos: ++pos, of, date, parent, tray, side: at.side ?? '', ...at });
		};
		if (this.plan) {
			const y = YEARS + h + STEM;
			this.rows.forEach((row, gi) => row.items.forEach((f, i) => {
				const p = (this.plan).cards[gi][i], top = p.side === 'above' ? YEARS : y + 2 + RULER;
				put(f, row.date, row.el, false, dated, { x: p.x, y: top, ax: p.x, ay: top, w, h, side: p.side });
			}));
		} else if (this.rows.length) {
			// (every date's cards have the same room across: measured once, then each row given its height, then where
			// each row came to stand is read in one go)
			const width = this.rows[0].el.clientWidth, cols = this.cols = this.narrow ? 1 : columnsFor(width, w, BETWEEN), cw = (width - (cols - 1) * BETWEEN) / cols;
			for (const row of this.rows) { const n = Math.ceil(row.items.length / cols); row.el.setCssProps({ height: `${n * h + (n - 1) * BETWEEN}px` }); }
			const base = this.line.getBoundingClientRect();
			for (const row of this.rows) {
				const r = row.el.getBoundingClientRect();
				row.items.forEach((f, i) => {
					const x = (i % cols) * (cw + BETWEEN), yy = Math.floor(i / cols) * (h + BETWEEN);
					put(f, row.date, row.el, false, dated, { x, y: yy, ax: r.left - base.left + x, ay: r.top - base.top + yy, w: cw, h });
				});
			}
		}
		pos = 0;
		// (the tray is as wide as the pane while the line scrolls sideways under it, and no taller than the pane)
		this.tray.setCssProps({ '--binders-timeline-pane': `${this.container.clientWidth}px`, '--binders-timeline-pane-height': `${this.container.clientHeight}px` });
		const cards = this.trayCards, n = this.undated.length;
		if (cards && n) {
			const kind = this.trayKind, th = kind === 'page' ? h : this.css('--binders-timeline-tray-card', h);
			if (kind === 'foot') cards.setCssProps({ width: `${n * (w + BETWEEN) - BETWEEN}px`, height: `${th}px` });
			const width = cards.clientWidth, cols = kind === 'foot' ? n : kind === 'page' ? columnsFor(width, w, BETWEEN) : 1, cw = kind === 'foot' ? w : (width - (cols - 1) * BETWEEN) / cols;
			if (kind !== 'foot') { const rows = Math.ceil(n / cols); cards.setCssProps({ height: `${rows * th + (rows - 1) * BETWEEN}px` }); }
			this.undated.forEach((f, i) => {
				const x = (i % cols) * (cw + BETWEEN), y = Math.floor(i / cols) * (th + BETWEEN);
				put(f, null, cards, true, n, { x, y, ax: x, ay: y, w: cw, h: th });
			});
		}
		this.spots = spots;
	}

	private later = (): void => {
		if (this.raf) return;
		this.raf = this.container.win.requestAnimationFrame(() => { this.raf = 0; this.sync(); });
	};

	/** Makes the cards near what is in sight and takes away the ones far from it: about a screen and a half each way.
	    The card with the keyboard, and one being written in, stay wherever the page goes. */
	private sync(): void {
		if (!this.board?.isConnected) return;
		const box = this.container.getBoundingClientRect(), line = this.line.getBoundingClientRect();
		const cards = this.trayCards?.getBoundingClientRect() ?? null, kind = this.trayKind;
		// (the tray scrolls by itself along the foot, down a side and on a phone; as the page it scrolls with the page)
		const scroller = kind === 'page' ? null : this.tray;
		const within = (r: DOMRect) => ({ left: r.left - r.width * MARGIN, right: r.right + r.width * MARGIN, top: r.top - r.height * MARGIN, bottom: r.bottom + r.height * MARGIN });
		const page = within(box), own = scroller ? within(scroller.getBoundingClientRect()) : page;
		const active = this.board.doc.activeElement, held = active?.instanceOf(HTMLElement) ? active.closest<HTMLElement>(CARD)?.dataset.path : undefined;
		const want = new Set<string>();
		for (const [path, s] of this.spots) {
			const from = s.tray ? cards : line, view = s.tray ? own : page;
			if (!from) continue;
			const l = from.left + s.ax, t = from.top + s.ay;
			if ((l < view.right && l + s.w > view.left && t < view.bottom && t + s.h > view.top) || path === held || this.carry?.paths.has(path)) want.add(path);
		}
		for (const [path, d] of this.cards) {
			// (the cards in hand stay, wherever the page goes; so does the one being written in)
			if (want.has(path) || d.el.querySelector('.is-editing') || this.carry?.paths.has(path)) continue;
			d.el.remove();
			this.cards.delete(path);
		}
		for (const path of want) this.attach(path);
		this.paintSelection();
	}

	/** A scene's card, where it stands: the one drawn before if it shows the same, else a new one. */
	private attach(path: string): HTMLElement | null {
		const s = this.spots.get(path);
		if (!s) return null;
		const key = JSON.stringify([this.ctx.readOnly, this.ctx.plugin.settings.labels, cardKey(this.ctx, s.file), s.n, s.date]);
		let d = this.cards.get(path);
		if (!d || d.key !== key) {
			const had = d?.el.contains(this.board.doc.activeElement);
			d?.el.remove();
			const { el, editors } = buildCard(this.host, s.file);
			el.querySelector(':scope > .binders-card-head > .binders-card-number')?.setText(String(s.n));
			// (its date and its number are part of its name here: where it stands is what this board is about)
			el.setAttr('aria-label', `${s.file.basename}, ${s.date ? showStoryDate(s.date) : 'no date'}, scene ${s.n}`);
			d = { el, key, editors };
			this.cards.set(path, d);
			if (had) window.setTimeout(() => { if (this.cards.get(path)?.el === el && !typingNow(el.doc)) el.focus({ preventScroll: true }); }, 0);
		}
		const el = d.el;
		// (a windowed list says where each of its options stands, and how many there are)
		el.setAttrs({ 'aria-posinset': String(s.pos), 'aria-setsize': String(s.of) });
		el.dataset.pos = String(s.pos);
		el.toggleClass('is-dragging', !!this.carry?.paths.has(path));
		el.toggleClass('mod-above', s.side === 'above');
		el.toggleClass('mod-below', s.side === 'below');
		el.setCssProps({ left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, '--binders-timeline-card': `${s.h}px` });
		if (el.parentElement !== s.parent) {
			// (in the order they are read, among the cards of its date that exist)
			const after = Array.from(s.parent.children).find((c) => c.instanceOf(HTMLElement) && Number(c.dataset.pos) > s.pos) ?? null;
			s.parent.insertBefore(el, after);
		}
		return el;
	}

	/** Scrolls just enough for a scene's card to be in sight (clear of the year that stays at the top, the tray at
	    the foot and, on a phone, the bar of buttons Obsidian lays over the foot of the pane), and makes it. */
	private show(path: string): void {
		const s = this.spots.get(path);
		if (!s) return;
		const box = this.container, pad = 8;
		if (s.tray && this.trayCards) {
			const scroller = this.trayKind === 'page' ? box : this.tray;
			const b = scroller.getBoundingClientRect(), c = this.trayCards.getBoundingClientRect();
			// (the tray's head stays at its top; on a phone its foot is under Obsidian's bar of buttons)
			const head = scroller === box ? 0 : this.tray.firstElementChild?.getBoundingClientRect().height ?? 0;
			const l = c.left + s.ax, t = c.top + s.ay, top = b.top + head, bottom = Math.min(visibleBottom(box), b.bottom);
			if (t + s.h > bottom - pad) scroller.scrollTop += Math.min(t + s.h - bottom + pad, t - top - pad); else if (t < top + pad) scroller.scrollTop -= top + pad - t;
			if (l + s.w > b.right - pad) scroller.scrollLeft += Math.min(l + s.w - b.right + pad, l - b.left - pad); else if (l < b.left + pad) scroller.scrollLeft -= b.left + pad - l;
		} else {
			const b = box.getBoundingClientRect(), base = this.line.getBoundingClientRect(), l = base.left + s.ax, t = base.top + s.ay;
			const head = this.layout === 'across' ? 0 : this.layout === 'heads' ? 64 : 34;
			const foot = this.trayKind === 'side' || this.tray.hasClass('is-hidden') ? 0 : this.tray.offsetHeight;
			const top = b.top + head + pad, bottom = Math.min(visibleBottom(box), b.bottom - foot) - pad;
			if (t + s.h > bottom) box.scrollTop += Math.min(t + s.h - bottom, t - top); else if (t < top) box.scrollTop -= top - t;
			if (l + s.w > b.right - pad) box.scrollLeft += Math.min(l + s.w - b.right + pad, l - b.left - pad); else if (l < b.left + pad) box.scrollLeft -= b.left + pad - l;
		}
		this.sync();
	}

	// ---- selection ----

	/** The cards that exist, in story order. */
	private drawn(): HTMLElement[] { return this.order.map((p) => this.cards.get(p)?.el).filter((el): el is HTMLElement => !!el); }
	private cardEl(path: string | null | undefined): HTMLElement | null { return path ? this.cards.get(path)?.el ?? null : null; }

	private select(paths: string[], focus: string | null = paths[paths.length - 1] ?? null, anchor = focus): void {
		if (paths.length !== this.sel.size || paths.some((x) => !this.sel.has(x))) this.selectedAt = performance.now();
		this.sel = new Set(paths);
		this.focused = focus;
		this.anchor = anchor;
		this.paintSelection();
		this.ctx.selectionChanged?.();
	}

	private paintSelection(): void {
		// (the one Tab stop: the card with the focus if it exists, else the first selected card that does, else the first)
		const stop = this.cardEl(this.focused) ?? this.cardEl(this.order.find((p) => this.sel.has(p) && this.cards.has(p))) ?? this.drawn()[0];
		for (const [path, d] of this.cards) {
			const on = this.sel.has(path);
			d.el.toggleClass('is-selected', on);
			d.el.setAttr('aria-selected', String(on));
			d.el.setAttr('tabindex', d.el === stop ? '0' : '-1');
		}
	}

	/** The scenes an action applies to: the selection if the card is in it, else just the card. In story order. */
	private targets(path: string): TFile[] {
		const paths = this.sel.has(path) ? this.order.filter((p) => this.sel.has(p)) : [path];
		return paths.map((p) => this.spots.get(p)?.file).filter((f): f is TFile => !!f);
	}

	private clickSelect(path: string, e: MouseEvent | KeyboardEvent): void {
		if (e.shiftKey && this.anchor) {
			const a = this.order.indexOf(this.anchor), b = this.order.indexOf(path);
			if (a >= 0 && b >= 0) { const range = this.order.slice(Math.min(a, b), Math.max(a, b) + 1); this.select(Keymap.isModEvent(e) ? [...new Set([...this.sel, ...range])] : range, path, this.anchor); return; }
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

	// ---- pointer: select, open, menu ----

	private onClick(e: MouseEvent): void {
		const pressed = this.pressed;
		this.pressed = null;
		if (this.press.noClick || this.box?.noClick) return;
		const t = e.target as HTMLElement, card = t.closest<HTMLElement>(CARD);
		if (!card) {
			if (!t.closest('.binders-timeline-tray-head, a') && !e.shiftKey && !Keymap.isModEvent(e)) { this.select([]); this.picking = false; }
			return;
		}
		const path = card.dataset.path ?? '';
		// a tap on a note's title opens it, as a tap on a note in the file explorer does
		if (this.press.pointer === 'touch' && !this.picking && t.closest('.binders-card-head') && !t.closest('.is-editing')) {
			this.select([path]);
			this.open(path, false);
			return;
		}
		const editingNow = !!t.closest('.is-editing');
		if (pressed !== path) this.clickSelect(path, e);
		if (!editingNow) card.focus({ preventScroll: true });
	}

	private onDblClick(e: MouseEvent): void {
		if (e.shiftKey && !Keymap.isModEvent(e)) return;
		const t = e.target as HTMLElement, card = t.closest<HTMLElement>(CARD);
		// (on a note's synopsis a double-click edits it)
		if (card && !t.closest('.is-editing, .binders-card-synopsis.is-editable')) this.open(card.dataset.path, Keymap.isModEvent(e));
	}

	private open(path: string | undefined, newLeaf: boolean | PaneType): void {
		const f = this.spots.get(path ?? '')?.file;
		if (f) void this.ctx.openFile(f, newLeaf);
	}

	private cardMenu(path: string): Menu {
		return itemMenu(this.ctx, this.targets(path), {
			pick: () => { this.picking = true; },
			rename: (f) => this.cards.get(f.path)?.editors.title.edit(),
			synopsis: (f) => this.cards.get(f.path)?.editors.synopsis.edit(),
			// (a card's place here is its date, not its place in the binder: no "Move up" or "Move down")
			up: null, down: null,
			remove: (all) => void removeItems(this.ctx, all),
			made: (f, rename) => this.onMade(f, rename),
		});
	}

	/** The board's own menu (a right-click on its ground): how it shows, as the view's menu has it, and a new note. */
	private boardMenu(): Menu {
		const menu = new Menu();
		this.menu(menu);
		if (!this.ctx.readOnly) this.newMenu(menu);
		return menu;
	}

	private onContextMenu(e: MouseEvent): void {
		const t = e.target as HTMLElement, card = t.closest<HTMLElement>(CARD);
		if (t.closest('.is-editing, input, textarea, a')) return;
		e.preventDefault();
		if (!card) { this.boardMenu().showAtMouseEvent(e); return; }
		const path = card.dataset.path ?? '';
		if (!this.sel.has(path)) this.select([path]);
		this.cardMenu(path).showAtMouseEvent(e);
	}

	private menuAtCard(e: KeyboardEvent, card: HTMLElement): void {
		e.preventDefault();
		const r = card.getBoundingClientRect(), path = card.dataset.path ?? '';
		if (!this.sel.has(path)) this.select([path]);
		this.cardMenu(path).showAtPosition({ x: r.left + 16, y: r.top + 28 }, card.doc);
	}

	// ---- dragging: cards carried to a date, to a place among a day's cards, or to the tray ----

	private startDrag(card: HTMLElement, x: number, y: number): void {
		const path = card.dataset.path ?? '';
		if (!this.sel.has(path)) this.select([path]);
		const files = this.targets(path);
		if (!files.length || this.carry) return;
		const doc = this.board.doc, r = card.getBoundingClientRect(), touch = this.press.pointer === 'touch';
		// the card itself follows the pointer, held where it was taken, as an item being reordered does in Obsidian
		const ghost = doc.body.createDiv({ cls: 'drag-reorder-ghost binders-drag-ghost mod-lanes', attr: { 'aria-hidden': 'true' } });
		const copy = card.cloneNode(true) as HTMLElement;
		for (const a of ['tabindex', 'data-path', 'role', 'aria-selected', 'id', 'style']) copy.removeAttribute(a);
		copy.removeClasses(['is-selected', 'is-lifted', 'is-landing', 'is-dropped', 'is-dragging']);
		copy.addClass('mod-dragged-item');
		copy.setCssStyles({ width: `${r.width}px`, height: `${r.height}px` });
		copy.setCssProps({ '--binders-card-lines': getComputedStyle(card).getPropertyValue('--binders-card-lines') });
		paintLabel(copy, card.dataset.label ?? '', this.ctx.plugin.settings.labels);
		ghost.appendChild(copy);
		if (files.length > 1) {
			ghost.addClass('is-multiple');
			ghost.createSpan({ cls: 'binders-drag-count', text: String(files.length) });
		}
		// what a drop would do, said beside the card (above it for a finger, which would cover it)
		const tag = ghost.createDiv({ cls: 'binders-timeline-tag is-hidden' });
		ghost.toggleClass('mod-touch', touch);
		// the line that shows a place among a day's cards: over everything
		const mark = doc.body.createDiv({ cls: 'binders-drop-indicator' });
		// (a finger covers the card it holds: the card is carried above it)
		const lift = touch ? 72 : 0;
		const c: Carry = { files, paths: new Set(files.map((f) => f.path)), ghost, mark, tag, touch, x, y, ox: x - r.left, oy: y - r.top + lift, raf: 0, edge: 0, file: null, drop: null, dwell: 0, dwellFor: -1, lit: null, said: '' };
		this.carry = c;
		for (const p of c.paths) this.cardEl(p)?.addClass('is-dragging');
		this.board.addClass('is-dragging');
		doc.body.addClass('is-grabbing');
		c.file = FileDrag.begin(this.ctx.app, { source: card, items: files, carried: ghost, morph: true, notes: (f) => this.store.scenes(f) });
		// the tray, to be dropped on, even where it has nothing in it
		if (!this.undated.length) { this.drawTray(); this.layOut(); this.sync(); }
		const win = this.board.win;
		const tick = () => {
			if (this.carry !== c) return;
			if (!c.file?.out) this.autoscroll();
			c.raf = win.requestAnimationFrame(tick);
		};
		c.raf = win.requestAnimationFrame(tick);
	}

	private dragTo(x: number, y: number): void {
		const c = this.carry;
		if (!c) return;
		c.x = x; c.y = y;
		c.ghost.setCssStyles({ transform: `translate(${x - c.ox}px, ${y - c.oy}px)` });
		// outside the view the cards are files, and Obsidian's to place: the board shows nowhere of its own to drop them
		this.aim(c.file?.move(x, y) ? null : this.locate(x, y));
	}

	/** Dragging near an edge of the pane scrolls it: gently at first, faster the nearer the edge and the longer held. */
	private autoscroll(): void {
		const c = this.carry, s = this.container;
		if (!c || c.drop?.kind === 'tray') return;
		const r = s.getBoundingClientRect(), edge = 48, bottom = visibleBottom(s);
		const by = (v: number) => Math.sign(v) * Math.max(1, 14 * Math.min(1, Math.abs(v) / edge) ** 2) * heldFor(c.edge);
		const v = c.y < r.top + edge ? -(r.top + edge - c.y) : c.y > bottom - edge ? c.y - (bottom - edge) : 0;
		const h = c.x < r.left + edge ? -(r.left + edge - c.x) : c.x > r.right - edge ? c.x - (r.right - edge) : 0;
		if (!v && !h) { c.edge = 0; return; }
		c.edge ||= performance.now();
		const top = s.scrollTop, left = s.scrollLeft;
		if (v) s.scrollTop += by(v);
		if (h) s.scrollLeft += by(h);
		// (what is under the pointer is something else now)
		if (s.scrollTop !== top || s.scrollLeft !== left) { this.sync(); this.aim(this.locate(c.x, c.y)); }
	}

	/** What the pointer is over: a date's cards, the boundary between two dates, a place in a stretch unfolded for the
	    cards, before the first date or after the last, the tray. Null off the board. */
	private locate(x: number, y: number): Where | null {
		const c = this.carry;
		if (!c || !overPane(this.container, x, y)) return null;
		const el = this.board.doc.elementFromPoint(x, y), inside = (r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
		const target = el?.closest<HTMLElement>('.binders-timeline-target');
		if (target) { const date = parseStoryDate(target.dataset.date ?? ''); return date ? { kind: 'target', date, el: target } : null; }
		const unfold = el?.closest<HTMLElement>('.binders-timeline-unfold');
		if (unfold) return { kind: 'open', i: Number(unfold.dataset.index) };
		if (el?.closest('.binders-timeline-none')) return { kind: 'bare' };
		if (!this.tray.hasClass('is-hidden') && inside(this.tray.getBoundingClientRect())) return { kind: 'tray' };
		const n = this.groups.length;
		if (!n) return null;
		// (a card, not one of those in hand: its date)
		const path = el?.closest<HTMLElement>(CARD)?.dataset.path, gi = path && !c.paths.has(path) ? this.groupAt.get(path) : undefined;
		if (gi != null) return { kind: 'group', i: gi };
		const gap = el?.closest<HTMLElement>('.binders-timeline-gap');
		if (gap) return { kind: 'between', i: Number(gap.dataset.index) };
		if (this.layout === 'across') {
			const plan = this.plan;
			if (!plan) return null;
			const lx = x - this.line.getBoundingClientRect().left;
			if (lx < plan.groups[0].x) return { kind: 'edge', i: 0 };
			const w = whereAcross(plan, lx, NEAR);
			if ('group' in w) return { kind: 'group', i: w.group };
			const i = w.before;
			return this.boundary(i, i <= 0 ? 0 : i >= n ? n - 1 : Math.abs(lx - plan.groups[i - 1].to) < Math.abs(lx - plan.groups[i].x) ? i - 1 : i);
		}
		// time down: the date whose row it is in, found among the rows (they stand in order down the page)
		const box = (i: number) => this.rows[i].box.getBoundingClientRect();
		let lo = 0, hi = n - 1, found = n;
		while (lo <= hi) { const mid = (lo + hi) >> 1; if (box(mid).bottom > y) { found = mid; hi = mid - 1; } else lo = mid + 1; }
		if (found >= n) return { kind: 'edge', i: n };
		const r = box(found);
		if (y < r.top) {
			if (found === 0) return y < this.board.getBoundingClientRect().top ? null : { kind: 'edge', i: 0 };
			return this.boundary(found, y - box(found - 1).bottom < r.top - y ? found - 1 : found);
		}
		// (the top and foot of a row are its boundaries with the rows beside it, where there is room between them)
		if (found > 0 && y < r.top + EDGE && this.roomBetween(found)) return { kind: 'between', i: found };
		if (found < n - 1 && y > r.bottom - EDGE && this.roomBetween(found + 1)) return { kind: 'between', i: found + 1 };
		return { kind: 'group', i: found };
	}

	/** The stretch before the date at `i`: its boundary, if there is anything between the two dates to drop on; else the
	    nearer of the dates. Before the first and after the last are edges. */
	private boundary(i: number, nearest: number): Where {
		const n = this.groups.length;
		if (i <= 0) return { kind: 'edge', i: 0 };
		if (i >= n) return { kind: 'edge', i: n };
		return this.roomBetween(i) ? { kind: 'between', i } : { kind: 'group', i: nearest };
	}

	/** Shuts or unfolds the stretch under the pointer, works out what a drop would do, and shows it. A stretch unfolds
	    once the pointer has rested on its boundary a moment (so passing over it doesn't make the page jump about), and
	    shuts as the pointer leaves it. */
	private aim(where: Where | null, again = false): void {
		const c = this.carry;
		if (!c) return;
		const want = where?.kind === 'between' || where?.kind === 'open' ? where.i : where?.kind === 'target' ? this.opening : null;
		if (this.opening != null && want !== this.opening && !again) {
			// (the page moves back as it shuts: what is under the pointer is looked at again)
			this.setOpen(null);
			this.aim(c.file?.out ? null : this.locate(c.x, c.y), true);
			return;
		}
		if (want == null || want === this.opening) { window.clearTimeout(c.dwell); c.dwell = 0; c.dwellFor = -1; } else if (c.dwellFor !== want) {
			window.clearTimeout(c.dwell);
			c.dwellFor = want;
			c.dwell = window.setTimeout(() => {
				c.dwell = 0; c.dwellFor = -1;
				if (this.carry !== c || c.file?.out) return;
				this.setOpen(want);
				this.aim(this.locate(c.x, c.y), true);
			}, DWELL);
		}
		c.drop = this.decide(where);
		this.showDrop(c.drop);
	}

	/** Unfolds the stretch before the date at `i` (null: none). The line is drawn again with room for its targets. */
	private setOpen(i: number | null): void {
		if (this.opening === i) return;
		this.opening = i;
		this.draw();
	}

	private decide(where: Where | null): Drop | null {
		const c = this.carry;
		if (!c || !where) return null;
		const groups = this.groups;
		switch (where.kind) {
			case 'tray': return { kind: 'tray' };
			case 'target': return { kind: 'date', date: where.date, at: 0, row: where.el };
			case 'group': return { kind: 'date', date: groups[where.i].date, at: this.slot(where.i, c.x, c.y), row: this.rows[where.i]?.box };
			case 'edge': { const near = groups[where.i === 0 ? 0 : groups.length - 1].date; return { kind: 'ask', near, words: `${where.i === 0 ? 'Before' : 'After'} ${showStoryDate(near)}...` }; }
			case 'bare': return { kind: 'ask', near: null, words: 'Set story date...' };
			default: return null; // (a boundary that isn't unfolded yet: nothing to drop on)
		}
	}

	/** Where among a date's other cards (those not in hand) a drop at (x, y) falls: how many come before it. */
	private slot(gi: number, x: number, y: number): number {
		const c = this.carry, rect = this.line.getBoundingClientRect();
		const spots = this.groups[gi].items.filter((f) => !c?.paths.has(f.path)).map((f) => this.spots.get(f.path)).filter((s): s is Spot => !!s);
		const rects = spots.map((s) => ({ x: s.ax, y: s.ay, w: s.w, h: s.h })), lx = x - rect.left, ly = y - rect.top;
		// (time across: along the line, the middle of a card divides before from after; else by reading order)
		if (this.layout === 'across') return rects.filter((r) => lx > r.x + r.w / 2).length;
		return slotAt(rects, lx, ly, this.cols === 1);
	}

	/** The other scenes of a date, as they stand, without those in hand. */
	private restOf(date: StoryDate, files: readonly TFile[]): { item: TFile; place: StoryPlace }[] {
		const key = dateKey(date), skip = new Set(files);
		return (this.groups.find((g) => g.key === key)?.items ?? []).filter((f) => !skip.has(f)).flatMap((f) => { const place = this.placeOf(f); return place ? [{ item: f, place }] : []; });
	}

	/** What cards put at `at` among a date's others write, and how the day stands after. */
	private planFor(date: StoryDate, at: number, files: readonly TFile[]) {
		return planDrop({ target: date, rest: this.restOf(date, files), moved: files.map((f) => ({ item: f, place: this.placeOf(f) })), at, manuscript: (f) => this.numbers.get(f.path) ?? 0 });
	}

	/** Lights what a drop would land on, and says in the tag by the card what it would do. */
	private showDrop(drop: Drop | null): void {
		const c = this.carry;
		if (!c) return;
		const lit = drop?.kind === 'date' ? drop.row ?? null : drop?.kind === 'tray' ? this.tray : null;
		if (c.lit !== lit) { c.lit?.removeClass('is-drop-target'); lit?.addClass('is-drop-target'); c.lit = lit; }
		let words = '';
		c.mark.removeClass('is-active');
		if (drop?.kind === 'date') {
			const rest = this.restOf(drop.date, c.files), plan = this.planFor(drop.date, drop.at, c.files);
			words = rest.length ? dropWords(drop.date, plan.place, rest.length + c.files.length, plan.held.length > 0) : dropWords(drop.date, 0, 0, plan.held.length > 0);
			// (cards from another date stand where the day's order puts them; only within a day is a place chosen)
			const key = dateKey(drop.date);
			if (rest.length && c.files.every((f) => { const pl = this.placeOf(f); return !!pl && dateKey(pl.date) === key; })) this.markAt(drop.at, rest.map((r) => r.item));
		} else if (drop?.kind === 'tray') words = 'No story date';
		else if (drop?.kind === 'ask') words = drop.words;
		if (words !== c.said) { c.said = words; c.tag.setText(words); c.tag.toggleClass('is-hidden', !words); }
	}

	/** The line that shows where among a date's cards the ones in hand would stand. */
	private markAt(at: number, rest: readonly TFile[]): void {
		const c = this.carry;
		if (!c) return;
		const spots = rest.map((f) => this.spots.get(f.path)).filter((s): s is Spot => !!s);
		if (!spots.length) return;
		const next = spots[at] ?? null, prev = spots[at - 1] ?? null, line = this.line.getBoundingClientRect(), view = this.container.getBoundingClientRect(), across = this.layout === 'across';
		const column = !across && this.cols === 1;
		let box: { left: number; top: number; width?: number; height?: number };
		if (column) {
			const s = next ?? prev ?? spots[0];
			box = { left: line.left + s.ax, top: line.top + (next ? s.ay - BETWEEN / 2 : s.ay + s.h + BETWEEN / 2) - 1, width: s.w };
		} else if (next && (!prev || across || next.ay === prev.ay)) box = { left: line.left + next.ax - BETWEEN / 2 - 1, top: line.top + next.ay, height: next.h };
		else if (prev) box = { left: line.left + prev.ax + prev.w + BETWEEN / 2 - 1, top: line.top + prev.ay, height: prev.h };
		else return;
		const inView = box.left >= view.left && box.left <= view.right && box.top >= view.top && box.top <= view.bottom;
		c.mark.toggleClass('is-vertical', !column);
		c.mark.toggleClass('is-active', inView);
		c.mark.setCssStyles({ left: `${box.left}px`, top: `${box.top}px`, width: box.width ? `${box.width}px` : '', height: box.height ? `${box.height}px` : '' });
	}

	/** Ends a drag. A drop writes the dates (and places among a day's cards) as one change; otherwise (cancelled, let go
	    outside the board or on nothing) nothing is written. `quiet`: the board is going away. `taken`: let go outside the
	    view, where something took the cards as files. */
	private endDrag(drop: boolean, taken = false, quiet = false): void {
		const c = this.carry;
		if (!c) return;
		c.file?.end();
		this.board.win.cancelAnimationFrame(c.raf);
		window.clearTimeout(c.dwell);
		c.lit?.removeClass('is-drop-target');
		c.mark.remove();
		c.ghost.remove();
		this.board.removeClass('is-dragging');
		this.board.doc.body.removeClass('is-grabbing');
		const to = drop && !quiet ? c.drop : null;
		this.carry = null;
		this.opening = null;
		for (const p of c.paths) this.cardEl(p)?.removeClass('is-dragging');
		if (quiet) return;
		// (taken as files: nothing comes back to the board from there)
		if (taken) { window.setTimeout(() => { if (this.board.isConnected) this.draw(); }, 200); return; }
		// (the page as it was: what was unfolded is shut, and the tray that was only there to be dropped on is gone)
		this.draw();
		if (to) void this.commit(to, c.files);
	}

	/** Writes what a drop (or Alt and an arrow) says, as one change that "Undo" takes back; says why on a notice when it
	    can't. */
	private async commit(to: Drop, files: TFile[]): Promise<void> {
		try {
			if (this.ctx.readOnly) throw new Error('This binder is read only.');
			// (a note that went while it was in hand: nothing is written)
			if (files.some((f) => this.ctx.app.vault.getAbstractFileByPath(f.path) !== f)) throw new Error('A note was removed while it was being moved, so nothing was changed.');
			const subject = files.length === 1 ? `“${files[0].basename}”` : `${files.length} scenes`;
			if (to.kind === 'tray') {
				const dated = files.filter((f) => this.placeOf(f));
				if (dated.length) await setStoryPlaces(this.ctx.plugin, dated.map((file): StoryWrite => ({ file, date: null })), `Remove story date of ${subject}`);
			} else if (to.kind === 'date') {
				const plan = this.planFor(to.date, to.at, files);
				// (a neighbour that went meanwhile isn't written to)
				const changes: StoryWrite[] = [...plan.writes].filter(([f]) => this.ctx.app.vault.getAbstractFileByPath(f.path) === f).map(([file, w]) => ({ file, date: w.date, order: w.order }));
				if (changes.length) await setStoryPlaces(this.ctx.plugin, changes, changes.some((w) => w.date) ? `Set story date of ${subject}` : `Reorder ${subject} in its day`);
			} else {
				const typed = await ask(this.ctx.app, { title: 'Story date', placeholder: '14 June 1987, June 1987 or 1987', cta: 'Set story date', value: to.near ? String(writeStoryDate(to.near)) : '', check: (v) => whyNotStoryDate(v) });
				const date = typed ? parseStoryDate(typed) : null;
				if (date) await setStory(this.ctx, files, date);
			}
		} catch (e) { new Notice(plain(e)); }
	}

	/** Alt and an arrow: Left and Right take the cards to the date before or after (a date that has scenes, or a place in
	    the stretch between two that has none), Up and Down one place earlier or later among the day's. */
	private nudge(path: string, key: string): void {
		const files = this.targets(path), at = this.groupAt.get(path);
		if (this.ctx.readOnly) { new Notice('This binder is read only.'); return; }
		if (at == null || files.some((f) => !this.groupAt.has(f.path))) return;
		if (key === 'ArrowLeft' || key === 'ArrowRight') {
			const back = key === 'ArrowLeft', groups = this.groups;
			// the dates in time's order, those that have scenes and those in the stretches between them
			const stops: { date: StoryDate; group: number | null }[] = [];
			groups.forEach((g, i) => {
				if (i) for (const date of unfoldTargets(groups[i - 1].date, g.date).dates) stops.push({ date, group: null });
				stops.push({ date: g.date, group: i });
			});
			const here = stops.findIndex((s) => s.group === at), to = stops[here + (back ? -1 : 1)];
			if (!to) return;
			// (to a date that has scenes: before them going on, after them coming back)
			void this.commit({ kind: 'date', date: to.date, at: back && to.group != null ? this.restOf(to.date, files).length : 0 }, files);
			return;
		}
		// within the day: the cards of one date, one place on or back
		const g = this.groups[at], up = key === 'ArrowUp';
		if (files.some((f) => this.groupAt.get(f.path) !== at)) return;
		const chosen = new Set(files), first = g.items.findIndex((f) => chosen.has(f));
		const base = g.items.slice(0, first).filter((f) => !chosen.has(f)).length;
		void this.commit({ kind: 'date', date: g.date, at: Math.max(0, base + (up ? -1 : 1)) }, files);
	}

	// ---- keys: through the scenes in story order, whether their cards exist yet or not ----

	/** The scene an arrow goes to. Along time (Left and Right; with time across, the line's way), the one before or
	    after in story order; the other way, the nearest card that way (the row above or below; across, the card on the
	    other side of the line), or with none, the one before or after. */
	private beside(path: string, key: string): string | undefined {
		const i = this.order.indexOf(path), back = key === 'ArrowLeft' || key === 'ArrowUp', by = back ? -1 : 1;
		const s = this.spots.get(path);
		if (!s || key === 'ArrowLeft' || key === 'ArrowRight' || (s.tray && this.trayKind === 'foot')) return this.order[i + by];
		let best: string | undefined, far = Infinity, off = Infinity;
		for (const [p, o] of this.spots) {
			if (o.tray !== s.tray) continue;
			// (the nearest row the way asked, and in it the card nearest across)
			const dy = (o.ay - s.ay) * by, dx = Math.abs(o.ax - s.ax);
			if (dy <= 0) continue;
			if (dy < far || (dy === far && dx < off)) { best = p; far = dy; off = dx; }
		}
		return best ?? this.order[i + by];
	}

	private onKey(e: KeyboardEvent): void {
		const card = (e.target as HTMLElement).closest?.<HTMLElement>(CARD);
		if (!card || e.target !== card) return;
		const path = card.dataset.path ?? '';
		const mod = Keymap.isModEvent(e) === true || e.ctrlKey || e.metaKey;
		const go = (to: string | undefined) => {
			if (!to || !this.spots.has(to)) return;
			e.preventDefault();
			if (mod && !e.shiftKey) this.focused = to;
			else if (e.shiftKey) {
				const a = this.order.indexOf(this.anchor ?? path), b = this.order.indexOf(to);
				this.select(this.order.slice(Math.min(a, b), Math.max(a, b) + 1), to, this.anchor ?? path);
			} else this.select([to]);
			this.show(to);
			this.cardEl(to)?.focus({ preventScroll: true });
			this.paintSelection();
		};
		if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
			// (with Alt, an arrow moves the cards: to a date, or a place in their day)
			if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); this.nudge(path, e.key); } else if (!e.altKey) go(this.beside(path, e.key));
			return;
		}
		if (mod && e.key.toLowerCase() === 'a' && !e.shiftKey && !e.altKey) { e.preventDefault(); this.select([...this.order], path, this.order[0]); return; }
		if (e.key === ' ' && !e.altKey && !e.shiftKey) {
			e.preventDefault();
			const sel = new Set(this.sel);
			if (sel.has(path) && sel.size > 1) sel.delete(path); else sel.add(path);
			this.select([...sel], path, path);
			return;
		}
		if (e.altKey || (mod && !['Home', 'End', 'Enter'].includes(e.key))) return;
		switch (e.key) {
			case 'Home': go(this.order[0]); break;
			case 'End': go(this.order[this.order.length - 1]); break;
			case 'Enter': e.preventDefault(); this.open(path, Keymap.isModEvent(e)); break;
			case 'Delete': case 'Backspace': if (!this.ctx.readOnly) { e.preventDefault(); void removeItems(this.ctx, this.targets(path)); } break;
			case 'F2': if (!this.ctx.readOnly) { e.preventDefault(); this.cards.get(path)?.editors.title.edit(); } break;
			case 'Escape': if (this.sel.size > 1) { e.preventDefault(); this.select([path]); } break;
			case 'ContextMenu': this.menuAtCard(e, card); break;
			case 'F10': if (e.shiftKey) this.menuAtCard(e, card); break;
		}
	}
}
