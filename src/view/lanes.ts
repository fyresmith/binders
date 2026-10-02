import { Keymap, Menu, Notice, TFile, TFolder, setIcon, type PaneType, type TAbstractFile } from 'obsidian';
import { emptyState, isNote, itemMenu, nameOf, noteOf, plain, removeItems, renameItem } from './actions';
import { buildCard, cardKey, numberCards, overPane, sumWords, type CardEditors, type CardHost } from './card';
import { Press, glide, held, places, settle, visibleBottom } from './drag';
import { FileDrag } from './file-drag';
import { openPluginSettings, submenu } from './internals';
import { display, labelDot, labelName, paintLabel, presetOf } from './labels';
import { CARD_SIZES, announceText, beside, changeText, flatRuns, insertAt, laneAt, laneList, laneOf, lanePitch, readLines, readSize, resolveDrop, type CardSize, type Lines, type Run, type Stop } from './lanes-data';
import { newLabel } from './modals';
import type { BinderView } from './BinderView';
import type { BinderMode, ModeContext, ModeFactory } from './mode';
import { wordsLabel } from './words';

/* The corkboard arranged by label: the folder's cards along one line per label, in the binder's order, each card in a
   place of its own on its label's line (Scrivener's "Arrange by label"). It answers which storyline, point of view or
   character each scene is on, and how the threads interleave through the book. The view shows this board as its
   corkboard, in place of the grid (corkboard.ts), while "Arrange" in the toolbar says by label. The lines run across the board (or down it, an option); a card
   dragged to another line takes that line's label, dragged along the lines it changes place in the binder, and both
   at once does both, as one change that "Undo" takes back.

   One grid: a line is a row of it (or a column), a card's place the next column (or row). The lines may be closer
   together than a card is tall: cards on neighbouring lines never share a place, so they pass each other. What the
   board is (lines, places, what a drop means) is worked out in lanes-data.ts; the card is the corkboard's (card.ts). */

interface Drawn { el: HTMLElement; key: string; file: TAbstractFile; editors: CardEditors }
/** `label`: the label the cards take (the line they're dropped on; undefined: they keep theirs); `stay`: and they keep
    their places. */
interface Drop { run: Run<TFolder, TAbstractFile>; anchor: TAbstractFile | null; label?: string; stay: boolean }
interface Drag {
	items: TAbstractFile[];
	ghost: HTMLElement;
	line: HTMLElement;
	drop: Drop | null;
	/** The card taken hold of, and its label (the card in hand shows the one it would take instead). */
	held: string;
	own: string;
	shown: string | null;
	x: number; y: number;
	/** Where in the card it was taken hold of, so it stays under the pointer there. */
	ox: number; oy: number;
	raf: number;
	edge: number;
	off: () => void;
	/** Outside the view the card is a file, and the drag Obsidian's (file-drag.ts). Null where it can't be handed one. */
	file?: FileDrag | null;
}

/** Narrower than this (a phone, a side pane) the cards are small unless a size was chosen. */
const NARROW = 520;
const CARD = '.binders-card[data-path]';
let uid = 0;

/** The corkboard's cards by label: what the view shows as its corkboard while "Arrange" says by label. */
export const byLabel: ModeFactory = (container, ctx) => new ByLabel(container, ctx);

class ByLabel implements BinderMode {
	readonly filters = true;
	private board: HTMLElement;
	private grid: HTMLElement;
	private hint: HTMLElement;
	private live: HTMLElement;
	private emptyEl: HTMLElement | null = null;
	private runs: Run<TFolder, TAbstractFile>[] = [];
	private stops: (Stop & { el: HTMLElement })[] = [];
	private lanes: string[] = [];
	private sig = '';
	/** Selected items by path; `anchor` is where a Shift-click range starts, `focused` the card with the focus. */
	private sel = new Set<string>();
	private anchor: string | null = null;
	private focused: string | null = null;
	private selectedAt = 0;
	private editing = 0;
	private dirty = false;
	private moving = false;
	private drawnOnce = false;
	private focusOnDraw = false;
	/** Notes made here since the filter last changed: they show though the filter would hide them. */
	private made = new Set<TFile>();
	private refocus: string | null = null;
	private picking = false;
	private cache = new Map<string, Drawn>();
	private editors = new Map<string, CardEditors>();
	private fresh: HTMLElement[] = [];
	private press: Press<HTMLElement>;
	private drag: Drag | null = null;
	/** Where cards just let go of were (under the pointer), so they glide from there to their places. */
	private landing = new Map<string, DOMRect>();
	private cleanup: (() => void)[] = [];

	constructor(private container: HTMLElement, private ctx: ModeContext) {}

	private get store() { return this.ctx.store; }
	private get presets() { return this.ctx.plugin.settings.labels; }
	private get longform(): boolean { return this.ctx.binder.kind === 'longform'; }
	private get narrow(): boolean { const w = this.container.clientWidth; return w > 0 && w < NARROW; }
	private get lines(): Lines { return readLines(this.ctx.option<unknown>('lines', 'across')); }
	/** The notes inside subfolders show too, each folder's under its name (else a folder is one card, a stack). */
	private get flat(): boolean { return !this.longform && this.ctx.option<unknown>('linesFlat', false) === true; }
	/** The labels no card has are lines too, to drop a card on. */
	private get unused(): boolean { return this.ctx.option<unknown>('linesUnused', true) !== false; }
	private get size(): CardSize { return readSize(this.ctx.option<unknown>('cardSize', null), this.narrow ? 'small' : 'medium'); }
	private get numbers(): boolean { return this.ctx.option<unknown>('numbers', false) === true; }
	private get tint(): boolean { return this.ctx.option<unknown>('labelStyle', 'tint') !== 'stripe'; }
	private get across(): boolean { return this.lines === 'across'; }

	// ---- the mode ----

	render(): void {
		const box = this.container;
		box.addClasses(['binders-corkboard', 'mod-lanes']);
		this.board = box.createDiv({ cls: 'binders-board binders-lanes-board' });
		this.hint = this.board.createDiv({ cls: 'binders-lanes-hint' });
		this.grid = this.board.createDiv({ cls: 'binders-lanes', attr: { role: 'listbox', 'aria-multiselectable': 'true' } });
		// (what a screen reader is told when a card changes line)
		this.live = box.createDiv({ cls: 'binders-live', attr: { 'aria-live': 'polite', role: 'status' } });
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
			this.open(card, 'tab');
		});
		on(this.board, 'contextmenu', (e) => this.onContextMenu(e));
		on(this.board, 'keydown', (e) => this.onKey(e));
		// with the lines across, the wheel goes along them when there's nowhere to go down
		on(box, 'wheel', (e) => {
			if (!this.across || e.shiftKey || e.ctrlKey || e.metaKey || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY) || box.scrollHeight > box.clientHeight + 1) return;
			e.preventDefault();
			box.scrollLeft += e.deltaY * (this.rtl ? -1 : 1);
		}, { passive: false });
		const moved = this.ctx.app.vault.on('rename', (f, old) => this.onMoved(f.path, old));
		this.cleanup.push(() => this.ctx.app.vault.offref(moved));
		this.press = new Press<HTMLElement>({
			el: this.board,
			pick: (e) => {
				const t = e.target as HTMLElement, card = t.closest<HTMLElement>(CARD);
				return card && !t.closest('.is-editing') ? { el: card, data: card } : null;
			},
			// (so a drag right away drags this card)
			down: (card, e) => { if (!this.sel.has(card.dataset.path) && !e.shiftKey && !Keymap.isModEvent(e)) this.select([card.dataset.path]); },
			canDrag: () => !this.ctx.readOnly,
			start: (card, x, y) => this.startDrag(card, x, y),
			move: (x, y) => this.dragTo(x, y),
			end: (drop, x, y) => {
				// (let go outside the view: whatever is there takes the card as a file, or nothing does)
				const file = this.drag?.file;
				if (file?.out) { this.endDrag(false, false, drop && file.drop(x, y)); return; }
				if (drop && this.over(x, y)) this.dragTo(x, y);
				this.endDrag(drop && this.over(x, y));
			},
			hold: (card, x, y) => {
				if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
				this.cardMenu(card).showAtPosition({ x, y }, this.board.doc);
			},
		});
		this.fit.observe(box);
		this.draw();
	}

	refresh(): void {
		if (this.busy()) { this.dirty = true; return; }
		if (this.signature() !== this.sig) this.draw();
	}

	unload(): void {
		this.fit.disconnect();
		this.endDrag(false, true);
		this.press?.destroy();
		for (const f of this.cleanup) f();
		this.cleanup = [];
		this.container.empty();
		this.container.removeClasses(['binders-corkboard', 'mod-lanes', 'mod-across', 'mod-down']);
	}

	/** The pane changed size: the lines stand as far apart as it has room for (and a narrow one has small cards). */
	private fit = new ResizeObserver(() => {
		if (!this.drawnOnce || this.busy()) return;
		if (this.signature() !== this.sig) this.draw(); else this.space();
	});

	focus(): void {
		const c = this.cardEl(this.focused) ?? this.cards()[0];
		if (!c) { this.focusOnDraw = true; return; }
		this.focused ??= c.dataset.path ?? null;
		c.focus({ preventScroll: true });
	}

	place(): unknown { return { left: this.container.scrollLeft, top: this.container.scrollTop, sel: [...this.sel], focused: this.focused }; }

	restore(place: unknown): void {
		const p = (place ?? {}) as { left?: unknown; top?: unknown; sel?: unknown; focused?: unknown };
		const sel = Array.isArray(p.sel) ? p.sel.filter((x): x is string => typeof x === 'string' && !!this.cardEl(x)) : [];
		this.select(sel, typeof p.focused === 'string' && this.cardEl(p.focused) ? p.focused : sel[sel.length - 1] ?? null);
		if (typeof p.left === 'number') this.container.scrollLeft = p.left;
		if (typeof p.top === 'number') this.container.scrollTop = p.top;
	}

	/** The folder's synopsis is the board's first line, and scrolls with it. */
	adopt(header: HTMLElement): void { this.container.prepend(header); this.space(); }

	reveal(item: TAbstractFile, fresh = false): void {
		const el = this.cardEl(item.path);
		if (!el) return;
		this.select([item.path], item.path);
		this.show(el);
		el.focus({ preventScroll: true });
		if (fresh && !this.ctx.readOnly) this.editors.get(item.path)?.title.edit();
	}

	current(): TAbstractFile | null {
		const path = this.focused ?? [...this.sel][0];
		return path ? this.item(path) : null;
	}

	create(kind: 'note' | 'folder'): void {
		if (this.ctx.readOnly) return;
		if (kind === 'folder') {
			if (this.longform) return;
			void this.store.newFolder(this.ctx.folder).then((f) => this.onMade(f, true), (e) => new Notice(plain(e)));
			return;
		}
		// after the card in hand, as a new row in the outliner goes after the row in hand; with none, at the end
		const at = this.focused && this.sel.has(this.focused) ? this.item(this.focused) : null;
		const folder = at?.parent instanceof TFolder ? at.parent : this.ctx.folder, sibs = this.store.orderedChildren(folder) ?? [];
		void this.newNote(folder, at && sibs.includes(at) ? sibs.indexOf(at) + 1 : Infinity, '', at ? this.store.depthOf(at) : undefined);
	}

	/** The view's "Arrange" menu, in the board's own menu too: the one list (the view's), so the two can't differ. */
	private arrangement(menu: Menu): void {
		const view = this.ctx.owner as Partial<Pick<BinderView, 'arrangeItems'>>;
		if (typeof view.arrangeItems === 'function') view.arrangeItems(menu);
	}

	private set(key: string, value: unknown): void { this.ctx.setOption(key, value); if (this.busy()) this.dirty = true; else this.draw(); }

	/** How the cards show, as on the grid (the same options, kept under the same names). */
	menu(menu: Menu): void {
		menu.addItem((i) => {
			i.setSection('view').setTitle('Card size').setIcon('scaling');
			submenu(i, (m) => { for (const size of CARD_SIZES) m.addItem((x) => x.setTitle(display(size)).setChecked(this.size === size).onClick(() => this.set('cardSize', size))); }, menu);
		});
		menu.addItem((i) => i.setSection('view').setTitle('Tint cards with their label color').setIcon('paint-bucket').setChecked(this.tint).onClick(() => this.set('labelStyle', this.tint ? 'stripe' : 'tint')));
		menu.addItem((i) => i.setSection('view').setTitle('Number the cards').setIcon('list-ordered').setChecked(this.numbers).onClick(() => this.set('numbers', !this.numbers)));
	}

	newMenu(menu: Menu): void {
		menu.addItem((i) => i.setSection('new').setTitle('New note').setIcon('file-plus').onClick(() => this.create('note')));
		if (!this.longform) menu.addItem((i) => i.setSection('new').setTitle('New folder').setIcon('folder-plus').onClick(() => this.create('folder')));
	}

	filterChanged(): void { this.made.clear(); }

	// ---- the model ----

	private children(folder: TFolder): TAbstractFile[] {
		return (this.store.orderedChildren(folder) ?? []).filter((f) => f instanceof TFolder || isNote(f));
	}

	private model(): Run<TFolder, TAbstractFile>[] {
		const top = this.ctx.folder;
		if (this.flat) return flatRuns<TFolder, TAbstractFile>(top, (f) => this.children(f), (x): x is TFolder => x instanceof TFolder);
		return [{ folder: top, items: this.children(top), end: null, divider: false }];
	}

	private shown(run: Run<TFolder, TAbstractFile>): TAbstractFile[] {
		return run.items.filter((f) => !(f instanceof TFile) || this.made.has(f) || this.ctx.visible(f));
	}

	private labelOf(f: TAbstractFile): string { const n = noteOf(this.ctx, f); return n ? this.ctx.props(n).label : ''; }

	/** Everything a redraw would show, so a refresh that changes nothing visible draws nothing. */
	private signature(): string {
		return JSON.stringify([this.ctx.readOnly, this.presets, this.tint, this.lines, this.flat, this.unused, this.size, this.numbers, this.ctx.filtering(),
			this.model().map((r) => [r.folder.path, r.end?.path, r.divider, this.shown(r).map((f) => cardKey(this.ctx, f))])]);
	}

	private busy(): boolean { return this.editing > 0 || !!this.drag || this.moving; }

	// ---- drawing ----

	private get rtl(): boolean { return getComputedStyle(this.grid).direction === 'rtl'; }

	private draw(): void {
		const box = this.container, top = box.scrollTop, left = box.scrollLeft, presets = this.presets;
		const doc = this.board.doc, hadFocus = this.board.contains(doc.activeElement);
		const key = (el: HTMLElement) => el.dataset.path ?? null;
		const before = this.drawnOnce ? places(this.grid, CARD, key) : null;
		this.drawnOnce = true;
		this.dirty = false;
		this.runs = this.model();
		this.sig = this.signature();
		this.editors.clear();
		const across = this.across;
		box.toggleClass('mod-across', across);
		box.toggleClass('mod-down', !across);
		this.grid.toggleClass('mod-across', across);
		this.grid.toggleClass('mod-down', !across);
		this.board.toggleClass('is-read-only', this.ctx.readOnly);
		for (const s of CARD_SIZES) this.board.toggleClass(`mod-cards-${s}`, this.size === s);
		this.board.toggleClass('mod-label-tint', this.tint);
		this.grid.setAttr('aria-label', `${this.ctx.folder.name}, by label`);

		// what each label has on the board
		const shown = this.runs.map((r) => this.shown(r)), all = shown.flat();
		const used = new Map<string, { count: number; words: number | null; cards: string[] }>();
		for (const f of all) {
			const l = this.labelOf(f), u = used.get(l) ?? { count: 0, words: 0, cards: [] };
			const w = f instanceof TFolder ? sumWords(this.ctx, this.store.scenes(f)) : f instanceof TFile ? this.ctx.words(f) : 0;
			u.count += f instanceof TFolder ? this.store.scenes(f).length : 1;
			u.words = u.words == null || w == null ? null : u.words + w;
			used.set(l, u);
		}
		const lanes = this.lanes = laneList(presets.map((p) => p.name), [...used.keys()], this.unused);

		// along the lines: each card in a place of its own; a folder's name where its notes begin
		const cards: HTMLElement[] = [], dividers: HTMLElement[] = [], tracks: string[] = [], drawn = new Map<string, Drawn>();
		const cardTrack = 'var(--binders-card-width, 210px)';
		this.stops = [];
		let slot = 0;
		this.runs.forEach((run, ri) => {
			if (run.divider) {
				slot++;
				tracks.push('auto');
				const d = createDiv({ cls: 'binders-lane-divider', attr: { role: 'link', tabindex: '0', 'aria-label': `Show ${run.folder.name}` } });
				d.setCssProps({ '--binders-slot': String(slot), '--binders-span': String(shown[ri].length + 1) });
				const name = d.createSpan({ cls: 'binders-lane-divider-name' });
				setIcon(name.createSpan({ cls: 'binders-group-icon' }), 'folder');
				name.createSpan({ text: run.folder.name });
				d.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.navigate(run.folder, Keymap.isModEvent(e)); });
				d.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); this.ctx.navigate(run.folder, Keymap.isModEvent(e)); } });
				const br = createDiv({ cls: 'binders-lane-break', attr: { 'aria-hidden': 'true' } });
				br.setCssProps({ '--binders-slot': String(slot) });
				dividers.push(d, br);
				this.stops.push({ el: across ? br : d, run: ri, id: null });
			}
			for (const f of shown[ri]) {
				slot++;
				tracks.push(cardTrack);
				const el = this.card(f, drawn), label = this.labelOf(f), lane = laneOf(label, lanes);
				el.setCssProps({ '--binders-lane': String(lane + 1), '--binders-slot': String(slot) });
				el.dataset.lane = String(lane);
				el.dataset.slot = String(slot);
				used.get(label)?.cards.push(el.id);
				cards.push(el);
				this.stops.push({ el, run: ri, id: f.path });
			}
		});
		this.cache = drawn;

		// the lines, each with its head: its name and how many notes are on it, in its color
		const chrome: HTMLElement[] = [createDiv({ cls: 'binders-lane-gutter', attr: { 'aria-hidden': 'true' } })];
		const heads = createDiv({ cls: 'binders-lane-heads' });
		chrome.push(heads);
		lanes.forEach((label, li) => {
			const u = used.get(label), name = this.laneName(label);
			const about = u ? `${name}: ${u.count} ${u.count === 1 ? 'note' : 'notes'}${u.words == null ? '' : ', ' + wordsLabel(u.words)}` : `${name}: no notes`;
			// (to a screen reader a line is a group, named, with its cards in it: the cards themselves stay in the page
			// in the binder's order, which is the order the keyboard goes through them in)
			const track = createDiv({ cls: 'binders-lane' + (u ? '' : ' is-empty'), attr: { role: 'group', 'aria-label': about } });
			if (u?.cards.length) track.setAttr('aria-owns', u.cards.join(' '));
			paintLabel(track, label, presets);
			track.dataset.lane = String(li);
			track.setCssProps({ '--binders-lane': String(li + 1) });
			chrome.push(track);
			const head = heads.createDiv({ cls: 'binders-lane-head' + (u ? '' : ' is-empty'), attr: { role: 'button', tabindex: '0', 'aria-haspopup': 'menu', 'aria-label': `${about}. Menu` } });
			paintLabel(head, label, presets);
			head.dataset.lane = String(li);
			head.setCssProps({ '--binders-lane': String(li + 1) });
			// (the cap is what's seen and pressed; the head around it is as long as the column, and carries the line on)
			const cap = head.createSpan({ cls: 'binders-lane-cap' });
			cap.createSpan({ cls: 'binders-lane-name', text: name });
			if (u) cap.createSpan({ cls: 'binders-lane-count', text: String(u.count) });
			const menuAt = (x: number, y: number) => this.laneMenu(label).showAtPosition({ x, y }, head.doc);
			head.addEventListener('click', (e) => { e.stopPropagation(); const r = cap.getBoundingClientRect(); menuAt(r.left, r.bottom + 4); });
			head.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); menuAt(e.clientX, e.clientY); });
			head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); head.click(); } });
		});
		// (runs of the same track written once: a thousand cards are one `repeat`)
		const packed: string[] = [];
		for (let i = 0; i < tracks.length;) { let n = 1; while (tracks[i + n] === tracks[i]) n++; packed.push(n > 1 ? `repeat(${n}, ${tracks[i]})` : tracks[i]); i += n; }
		this.grid.setCssProps({ '--binders-lanes': String(lanes.length), '--binders-slots': String(Math.max(1, slot)), '--binders-slot-tracks': packed.join(' ') || 'auto' });
		let at = this.grid.firstChild;
		for (const el of [...chrome, ...dividers, ...cards]) { if (el === at) at = at.nextSibling; else this.grid.insertBefore(el, at); }
		while (at) { const next = at.nextSibling; at.remove(); at = next; }

		// until a card has a label: what the lines are for
		const labeled = [...used.keys()].some((l) => l);
		this.hint.empty();
		this.hint.toggleClass('is-shown', !labeled && !this.ctx.readOnly && all.length > 0);
		if (!labeled) {
			if (lanes.length > 1) this.hint.setText('Drag a card onto a line to give it that label.');
			else {
				this.hint.createSpan({ text: 'There are no labels yet. ' });
				const a = this.hint.createEl('a', { text: 'Add a label', href: '#' });
				a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); void this.addLabel(); });
			}
		}
		// nothing to show: the same words every mode has for that
		const none = !all.length, filtering = String(this.ctx.filtering());
		if (this.emptyEl && (!none || this.emptyEl.dataset.for !== filtering)) { this.emptyEl.remove(); this.emptyEl = null; }
		if (none && !this.emptyEl) { this.emptyEl = emptyState(this.ctx, this.container); this.emptyEl.dataset.for = filtering; this.container.insertBefore(this.emptyEl, this.board); }
		this.board.toggleClass('is-empty', none);
		// (last, with everything above the lines as it will be: how far apart they stand depends on the room left)
		this.space();

		// keep only what still exists selected
		const paths = new Set(all.map((f) => f.path));
		for (const p of [...this.sel]) if (!paths.has(p)) this.sel.delete(p);
		if (this.focused && !paths.has(this.focused)) this.focused = null;
		this.paintSelection();
		this.number();
		box.scrollTop = top;
		box.scrollLeft = left;
		if (before) {
			settle(this.fresh);
			const landing = this.landing;
			this.landing = new Map();
			const moved = glide(this.grid, CARD, key, before, box.getBoundingClientRect(), (el) => landing.get(el.dataset.path ?? ''));
			// a card just dropped goes over the others, with a ring, until it's down
			for (const [el, a] of moved) if (landing.has(el.dataset.path ?? '')) {
				el.addClasses(['is-landing', 'is-dropped']);
				a.addEventListener('finish', () => el.removeClasses(['is-landing', 'is-dropped']));
			}
		}
		this.fresh = [];
		const free = hadFocus || doc.activeElement === doc.body;
		if (this.refocus) { this.focused = this.refocus; this.cardEl(this.refocus)?.focus({ preventScroll: true }); this.refocus = null; }
		else if (this.focusOnDraw && cards.length) this.focus();
		else if (hadFocus && free) this.cardEl(this.focused)?.focus({ preventScroll: true });
		if (cards.length) this.focusOnDraw = false;
	}

	/** An item's card: the one drawn last time if it shows the same, else a new one. */
	private card(f: TAbstractFile, drawn: Map<string, Drawn>): HTMLElement {
		const key = JSON.stringify([this.ctx.readOnly, this.presets, cardKey(this.ctx, f)]), hit = this.cache.get(f.path);
		if (hit && hit.key === key && hit.file === f && !drawn.has(f.path)) {
			hit.el.removeClasses(['is-dragging', 'is-lifted', 'is-landing', 'is-dropped']);
			this.editors.set(f.path, hit.editors);
			drawn.set(f.path, hit);
			return hit.el;
		}
		const { el, editors } = buildCard(this.host, f);
		el.id = `binders-lane-card-${++uid}`;
		// (its label is part of its name here: the line it's on is what this board is about)
		el.setAttr('aria-label', `${nameOf(f)}, ${this.laneName(this.labelOf(f)).toLowerCase() === 'no label' ? 'no label' : 'label ' + this.laneName(this.labelOf(f))}`);
		this.editors.set(f.path, editors);
		drawn.set(f.path, { el, key, file: f, editors });
		this.fresh.push(el);
		return el;
	}

	private host: CardHost = {
		ctx: this.ctx,
		rename: (f, name) => this.rename(f, name),
		onEditing: (on, card) => this.onEditing(on, card),
		// (as on the corkboard: a click on a selected card's synopsis edits it; a stack's only once it has been
		// selected a moment, since a double-click anywhere on a stack goes into it)
		editOnClick: (card) => this.sel.has(card.dataset.path) && (!card.hasClass('is-stack') || performance.now() - this.selectedAt > 500),
	};

	private laneName(label: string): string { return label ? labelName(label, this.presets) : 'No label'; }

	/** How far apart the lines stand: as far as the pane has room for, never closer than a little over half a card. */
	private space(): void {
		if (!this.grid?.isConnected) return;
		const box = this.container, cs = getComputedStyle(this.board), across = this.across;
		const cw = parseFloat(cs.getPropertyValue('--binders-card-width')) || 210, ch = parseFloat(cs.getPropertyValue('--binders-card-height')) || 132;
		const size = across ? ch : cw;
		// what's above the lines (the folder's synopsis, the hint, the folders' names) and below them (the board's own
		// margin: on a phone, Obsidian's bar of buttons lies over the pane's foot)
		const above = this.grid.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop + (this.flat ? 28 : 0);
		const room = across ? box.clientHeight - above - (parseFloat(cs.paddingBottom) || 0) - 14 : box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 16;
		const pitch = lanePitch(size, room, this.lanes.length);
		this.grid.setCssProps({ '--binders-lane-pitch': `${pitch}px`, '--binders-lane-pad': `${Math.max(0, Math.ceil((size - pitch) / 2))}px` });
	}

	/** With "Number the cards" on, each note's card says its place among the notes that show, in the order they read. */
	private number(): void { numberCards(this.board, this.cards(), this.numbers); }

	private onEditing(on: boolean, card?: HTMLElement): void {
		this.editing += on ? 1 : -1;
		if (on && card) this.show(card);
		if (!on && !this.busy()) window.setTimeout(() => { if (!this.busy() && (this.dirty || this.signature() !== this.sig)) this.draw(); }, 0);
	}

	/** Scrolls the board just enough for a card to be in sight: clear of the lines' names, which stay put, and on a
	    phone of the bar of buttons Obsidian lays over the foot of the pane. */
	private show(el: HTMLElement): void {
		const box = this.container, b = box.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 8;
		const gutter = this.grid.querySelector<HTMLElement>(':scope > .binders-lane-gutter')?.getBoundingClientRect();
		const top = (!this.across && gutter ? gutter.bottom : b.top) + pad, bottom = visibleBottom(box) - pad;
		if (r.bottom > bottom) box.scrollTop += Math.min(r.bottom - bottom, r.top - top);
		else if (r.top < top) box.scrollTop -= top - r.top;
		const rtl = this.rtl;
		const left = (this.across && gutter && !rtl ? gutter.right : b.left) + pad, right = (this.across && gutter && rtl ? gutter.left : b.right) - pad;
		if (r.right > right) box.scrollLeft += Math.min(r.right - right, r.left - left);
		else if (r.left < left) box.scrollLeft -= left - r.left;
	}

	// ---- selection ----

	private cards(): HTMLElement[] { return [...this.grid.querySelectorAll<HTMLElement>(`:scope > ${CARD}`)]; }
	private cardEl(path: string | null): HTMLElement | null { return path ? this.cache.get(path)?.el ?? null : null; }
	private item(path: string | undefined | null): TAbstractFile | null { return path ? this.ctx.app.vault.getAbstractFileByPath(path) : null; }

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
	}

	/** The items an action applies to: the selection if the card is in it, else just the card. In the binder's order. */
	private targets(card: HTMLElement): TAbstractFile[] {
		const paths = this.sel.has(card.dataset.path) ? this.cards().map((c) => c.dataset.path).filter((p) => this.sel.has(p)) : [card.dataset.path];
		return paths.map((p) => this.item(p)).filter((f): f is TAbstractFile => !!f);
	}

	private clickSelect(card: HTMLElement, e: MouseEvent | KeyboardEvent): void {
		const path = card.dataset.path;
		if (e.shiftKey && this.anchor) {
			const order = this.cards().map((c) => c.dataset.path), a = order.indexOf(this.anchor), b = order.indexOf(path);
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

	/** Something was renamed or moved: what's selected and focused follows it by its new path. */
	private onMoved(now: string, old: string): void {
		const re = (p: string) => (p === old ? now : p.startsWith(old + '/') ? now + p.slice(old.length) : p);
		this.sel = new Set([...this.sel].map(re));
		if (this.focused) this.focused = re(this.focused);
		if (this.anchor) this.anchor = re(this.anchor);
		if (this.refocus) this.refocus = re(this.refocus);
	}

	// ---- pointer: select, open, menu ----

	private onClick(e: MouseEvent): void {
		if (this.press.noClick) return;
		const t = e.target as HTMLElement, card = t.closest<HTMLElement>(CARD);
		if (!card) {
			if (!t.closest('.binders-lane-head, .binders-lane-divider, a') && !e.shiftKey && !Keymap.isModEvent(e)) { this.select([]); this.picking = false; }
			return;
		}
		// a tap on a note's title opens it, as a tap on a note in the file explorer does
		if (this.press.pointer === 'touch' && !this.picking && t.closest('.binders-card-head') && !t.closest('.is-editing')) {
			this.select([card.dataset.path]);
			this.open(card, false);
			return;
		}
		const editingNow = !!t.closest('.is-editing');
		this.clickSelect(card, e);
		if (!editingNow) card.focus({ preventScroll: true });
	}

	private onDblClick(e: MouseEvent): void {
		const t = e.target as HTMLElement, card = t.closest<HTMLElement>(CARD);
		if (card) {
			// (on a note's synopsis a double-click edits it; a folder's stack is gone into wherever it's double-clicked)
			if (!t.closest(card.hasClass('is-stack') ? '.is-editing' : '.is-editing, .binders-card-synopsis.is-editable')) this.open(card, Keymap.isModEvent(e));
			return;
		}
		// on a line, where there's no card: a new note there, with that line's label (as in Scrivener)
		if (this.ctx.readOnly || t.closest('.binders-lane-head, .binders-lane-divider, a, input, textarea') || !this.stops.length) return;
		const at = this.placeAt(e.clientX, e.clientY, new Set());
		if (!at) return;
		const sibs = this.store.orderedChildren(at.run.folder) ?? [];
		void this.newNote(at.run.folder, at.anchor && sibs.includes(at.anchor) ? sibs.indexOf(at.anchor) : Infinity, this.lanes[this.laneUnder(e.clientX, e.clientY)] ?? '');
	}

	private open(card: HTMLElement, newLeaf: boolean | PaneType): void {
		const f = this.item(card.dataset.path);
		if (f instanceof TFolder) this.ctx.navigate(f, newLeaf);
		else if (f instanceof TFile) void this.ctx.openFile(f, newLeaf);
	}

	private onContextMenu(e: MouseEvent): void {
		const t = e.target as HTMLElement;
		if (this.drag) { e.preventDefault(); return; }
		const card = t.closest<HTMLElement>(CARD);
		if (!card) {
			// the board itself: what can be made here, and how the board shows
			if (t.closest('input, textarea, .is-editing')) return;
			e.preventDefault();
			const menu = new Menu();
			if (!this.ctx.readOnly) this.newMenu(menu);
			this.arrangement(menu);
			this.menu(menu);
			menu.showAtMouseEvent(e);
			return;
		}
		e.preventDefault();
		// on touch, a long press opens the menu (and a long press and move drags), so the browser's own one is ignored
		if (this.press.pointer === 'touch') return;
		if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
		this.cardMenu(card).showAtMouseEvent(e);
	}

	// ---- dragging: across the lines changes the label, along them the place ----

	private startDrag(card: HTMLElement, x: number, y: number): void {
		if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
		const items = this.targets(card);
		if (!items.length) return;
		const doc = this.board.doc, r = card.getBoundingClientRect();
		// the card itself follows the pointer, held where it was taken, as an item being reordered does in Obsidian
		const ghost = doc.body.createDiv({ cls: 'drag-reorder-ghost binders-drag-ghost mod-lanes', attr: { 'aria-hidden': 'true' } });
		const copy = card.cloneNode(true) as HTMLElement;
		for (const a of ['tabindex', 'data-path', 'role', 'aria-selected', 'id', 'style']) copy.removeAttribute(a);
		copy.removeClasses(['is-selected', 'is-lifted', 'is-landing', 'is-dropped']);
		copy.addClass('mod-dragged-item');
		copy.setCssStyles({ width: `${r.width}px`, height: `${r.height}px` });
		// (off the board, it's still cut to as many lines as the board's cards are)
		copy.setCssProps({ '--binders-card-lines': getComputedStyle(card).getPropertyValue('--binders-card-lines') });
		paintLabel(copy, card.dataset.label ?? '', this.presets);
		ghost.appendChild(copy);
		if (items.length > 1) {
			ghost.addClass('is-multiple');
			ghost.createSpan({ cls: 'binders-drag-count', text: String(items.length) });
		}
		// the line that shows where they'll go: over everything
		const line = doc.body.createDiv({ cls: 'binders-drop-indicator' });
		for (const f of items) this.cardEl(f.path)?.addClass('is-dragging');
		this.board.addClass('is-dragging');
		doc.body.addClass('is-grabbing');
		const box = this.container, onScroll = () => { if (this.drag) this.drag.drop = this.dropAt(this.drag.x, this.drag.y); };
		box.addEventListener('scroll', onScroll, { passive: true });
		this.drag = { items, ghost, line, drop: null, held: card.dataset.path ?? '', own: card.dataset.label ?? '', shown: null, x, y, ox: x - r.left, oy: y - r.top, raf: 0, edge: 0, off: () => box.removeEventListener('scroll', onScroll) };
		this.drag.file = FileDrag.begin(this.ctx.app, { source: card, items, carried: ghost, morph: true, notes: (f) => this.store.scenes(f) });
		const tick = () => {
			if (!this.drag) return;
			if (!this.drag.file?.out) this.autoscroll();
			this.drag.raf = window.requestAnimationFrame(tick);
		};
		this.drag.raf = window.requestAnimationFrame(tick);
	}

	private dragTo(x: number, y: number): void {
		const d = this.drag;
		if (!d) return;
		d.x = x; d.y = y;
		d.ghost.setCssStyles({ transform: `translate(${x - d.ox}px, ${y - d.oy}px)` });
		// outside the view the card is a file, and Obsidian's to place: the board shows nowhere of its own to drop it
		d.drop = d.file?.move(x, y) ? this.dropAt(-1, -1) : this.dropAt(x, y);
	}

	/** Dragging near an edge of the pane scrolls it: gently at first, faster the nearer the edge and the longer held. */
	private autoscroll(): void {
		const d = this.drag, s = this.container;
		if (!d) return;
		const r = s.getBoundingClientRect(), edge = 48, bottom = visibleBottom(s);
		const by = (v: number) => Math.sign(v) * Math.max(1, 14 * Math.min(1, Math.abs(v) / edge) ** 2) * held(d.edge);
		const v = d.y < r.top + edge ? -(r.top + edge - d.y) : d.y > bottom - edge ? d.y - (bottom - edge) : 0;
		const h = d.x < r.left + edge ? -(r.left + edge - d.x) : d.x > r.right - edge ? d.x - (r.right - edge) : 0;
		if (!v && !h) { d.edge = 0; return; }
		d.edge ||= performance.now();
		if (v) s.scrollTop += by(v);
		if (h) s.scrollLeft += by(h);
	}

	/** Is the pointer over the board? A drop anywhere else changes nothing. */
	private over(x: number, y: number): boolean { return overPane(this.container, x, y); }

	/** The line at a point: the one whose band it's in, or the nearest. */
	private laneUnder(x: number, y: number): number {
		const across = this.across;
		const bands = [...this.grid.querySelectorAll<HTMLElement>(':scope > .binders-lane')].map((t): [number, number] => { const r = t.getBoundingClientRect(); return across ? [r.top, r.bottom] : [r.left, r.right]; });
		return laneAt(bands, across ? y : x);
	}

	/** The place along the lines at a point: the run it's in and the item it's before, for whatever isn't `moving`. */
	private placeAt(x: number, y: number, moving: Set<string>, held?: string): { run: Run<TFolder, TAbstractFile>; anchor: TAbstractFile | null; stay: boolean; at: number; rects: DOMRect[] } | null {
		const across = this.across, stops = this.stops.filter((s) => s.el.isConnected), rects = stops.map((s) => s.el.getBoundingClientRect());
		const at = insertAt(rects.map((r) => (across ? r.left + r.width / 2 : r.top + r.height / 2)), across ? x : y, across && this.rtl);
		const p = resolveDrop(stops, at, moving, held), run = this.runs[p.run];
		if (!run) return null;
		return { run, anchor: (p.before ? this.item(p.before) : null) ?? run.end, stay: p.stay, at, rects };
	}

	/** Where a drop at (x, y) would put the cards in hand: the line under the card's middle gives its label, the place
	    along the lines the order. Null where a drop would change nothing, or can't be made. */
	private dropAt(x: number, y: number): Drop | null {
		const d = this.drag, line = d.line, grid = this.grid, across = this.across;
		const mark = (lane: number | null) => { for (const el of grid.querySelectorAll<HTMLElement>('.binders-lane, .binders-lane-head')) el.toggleClass('is-drop-target', lane != null && el.dataset.lane === String(lane)); };
		const none = (): null => { line.removeClass('is-active'); mark(null); this.tag(null); return null; };
		if (!this.over(x, y) || !this.lanes.length) return none();
		// (the card in hand's middle, not the pointer: a card taken by its top edge is still on its own line)
		const g = d.ghost.querySelector<HTMLElement>('.binders-card')?.getBoundingClientRect();
		const li = g ? this.laneUnder(g.left + g.width / 2, g.top + g.height / 2) : this.laneUnder(x, y), label = this.lanes[li] ?? '';
		const relabel = d.items.some((f) => this.labelOf(f) !== label);
		const moving = new Set(d.items.map((f) => f.path)), p = this.placeAt(x, y, moving, d.held);
		// (not into itself, nor where it can't go: a folder that has a note of that name already, say)
		const ok = !!p && (p.stay || d.items.every((f) => !(f instanceof TFolder && (p.run.folder === f || p.run.folder.path.startsWith(f.path + '/'))) && this.store.whyNot(f, p.run.folder) == null));
		if (!p || !ok || (p.stay && !relabel)) return none();
		// the line they'd be on: tinted, its name by the card in hand, which takes its color
		mark(relabel ? li : null);
		this.tag(relabel ? label : null);
		// the place they'd take: a line across all the lines, since a place is a place in the book
		if (p.stay) line.removeClass('is-active');
		else {
			const rtl = this.rtl, gap = (parseFloat(getComputedStyle(grid).columnGap) || 12) / 2, view = this.container.getBoundingClientRect();
			const tracks = grid.querySelectorAll<HTMLElement>(':scope > .binders-lane'), first = tracks[0].getBoundingClientRect(), last = tracks[tracks.length - 1].getBoundingClientRect();
			const r = p.rects[p.at], end = p.rects[p.rects.length - 1];
			line.toggleClass('is-vertical', across);
			if (across) {
				const lx = r ? (rtl ? r.right + gap : r.left - gap) : (rtl ? end.left - gap : end.right + gap);
				const y0 = Math.max(Math.min(first.top, last.top), view.top), y1 = Math.min(Math.max(first.bottom, last.bottom), view.bottom);
				line.toggleClass('is-active', y1 > y0 && lx >= view.left && lx <= view.right);
				line.setCssStyles({ left: `${lx - 1}px`, top: `${y0}px`, height: `${y1 - y0}px`, width: '' });
			} else {
				const ly = r ? r.top - gap : end.bottom + gap;
				const x0 = Math.max(Math.min(first.left, last.left), view.left), x1 = Math.min(Math.max(first.right, last.right), view.right);
				line.toggleClass('is-active', x1 > x0 && ly >= view.top && ly <= view.bottom);
				line.setCssStyles({ left: `${x0}px`, top: `${ly - 1}px`, width: `${x1 - x0}px`, height: '' });
			}
		}
		return { run: p.run, anchor: p.anchor, label: relabel ? label : undefined, stay: p.stay };
	}

	/** The card in hand shows the label it would take: its color, and the label's name beside it. */
	private tag(label: string | null): void {
		const d = this.drag, card = d?.ghost.querySelector<HTMLElement>('.binders-card');
		if (!d || !card || d.shown === (label ?? '\n')) return;
		d.shown = label ?? '\n';
		paintLabel(card, label ?? d.own, this.presets);
		d.ghost.querySelector('.binders-lane-tag')?.remove();
		if (label == null) return;
		const tag = d.ghost.createDiv({ cls: 'binders-lane-tag' });
		labelDot(tag, label, this.presets);
		tag.createSpan({ text: this.laneName(label) });
	}

	/** Ends a drag. A drop gives the cards the line's label and their new places, as one change; otherwise (cancelled,
	    let go outside the board or back where they were) nothing changes. `quiet`: the board is going away. `taken`: let
	    go outside the view, where something took the card as a file. */
	private endDrag(drop: boolean, quiet = false, taken = false): void {
		const d = this.drag;
		if (!d) return;
		d.file?.end();
		window.cancelAnimationFrame(d.raf);
		d.off();
		d.line.remove();
		for (const el of this.grid.querySelectorAll('.is-drop-target')) el.removeClass('is-drop-target');
		this.board.removeClass('is-dragging');
		this.board.doc.body.removeClass('is-grabbing');
		this.drag = null;
		// the card under the pointer stays there until the board is drawn again, then the real one glides from it
		const land = (dropped: boolean) => {
			const from = d.ghost.querySelector('.binders-card')?.getBoundingClientRect();
			d.ghost.remove();
			if (from && dropped && !quiet) for (const f of d.items) this.landing.set(f.path, from);
		};
		if (drop && d.drop && !quiet) {
			const to = d.drop;
			this.moving = true;
			// after this task: the redraw replaces the card under the finger, and its touchend must still reach the board
			window.setTimeout(() => {
				void this.change(d.items, to.label, to.stay ? undefined : { folder: to.run.folder, anchor: to.anchor }).finally(() => {
					this.moving = false;
					land(true);
					this.select(d.items.map((f) => f.path), d.items[0]?.path ?? null);
					if (this.board.isConnected) this.draw();
				});
			}, 0);
			return;
		}
		// (taken as a file: nothing comes back to the board from there, and the card stays dim in its slot for the
		// moment a move takes to show)
		if (taken && !quiet) { d.ghost.remove(); window.setTimeout(() => { if (this.board.isConnected && !this.busy()) this.draw(); }, 200); return; }
		land(false);
		if (!quiet) this.draw();
	}

	/** Gives cards a label (undefined: they keep theirs) and, with `to`, new places: one change, undone as one. */
	private async change(items: TAbstractFile[], label: string | undefined, to?: { folder: TFolder; anchor: TAbstractFile | null }): Promise<void> {
		try {
			if (this.ctx.readOnly) throw new Error('This binder is read only.');
			if (label === undefined) { if (to) await this.store.put(items, to.folder, to.anchor); return; }
			const text = changeText(items.map(nameOf), label ? this.laneName(label) : '', !!to);
			// (as settings spell it; none takes the property away)
			await this.store.label(items, this.ctx.plugin.settings.labelProp, label ? presetOf(label, this.presets)?.name ?? label : undefined, text, to);
			// (a property just written is read back from Obsidian's cache, which follows the file: the board is drawn
			// once it has, so a card goes to its line once)
			for (let i = 0; i < 60 && items.some((f) => this.labelOf(f) !== label); i++) await new Promise((r) => window.setTimeout(r, 25));
			this.live.setText(announceText(items.map(nameOf), label ? this.laneName(label) : ''));
		} catch (e) { new Notice(plain(e)); }
	}

	// ---- keyboard ----

	private onKey(e: KeyboardEvent): void {
		const card = (e.target as HTMLElement).closest?.<HTMLElement>(CARD);
		if (!card || e.target !== card) return;
		const cards = this.cards(), i = cards.indexOf(card), across = this.across;
		const mod = Keymap.isModEvent(e) === true || e.ctrlKey || e.metaKey;
		const go = (to: HTMLElement | undefined) => {
			if (!to) return;
			e.preventDefault();
			if (mod && !e.shiftKey) { this.focused = to.dataset.path; this.paintSelection(); }
			else if (e.shiftKey) {
				const order = cards.map((c) => c.dataset.path), a = order.indexOf(this.anchor ?? card.dataset.path), b = order.indexOf(to.dataset.path);
				this.select(order.slice(Math.min(a, b), Math.max(a, b) + 1), to.dataset.path, this.anchor ?? card.dataset.path);
			} else this.select([to.dataset.path]);
			to.focus({ preventScroll: true });
			this.show(to);
		};
		// the arrows along the lines go through the binder's order; the arrows across them, to the nearest card on the
		// next line that way. With Alt, along moves the card in the order, and across gives it the next line's label.
		const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
		if (arrows.includes(e.key)) {
			// (right to left, the lines run to the left: Left goes on, Right goes back)
			const sideways = e.key === 'ArrowLeft' || e.key === 'ArrowRight', back = sideways ? (e.key === 'ArrowLeft') !== this.rtl : e.key === 'ArrowUp';
			const along = across ? e.key === 'ArrowLeft' || e.key === 'ArrowRight' : e.key === 'ArrowUp' || e.key === 'ArrowDown';
			if (e.altKey && !mod) {
				e.preventDefault();
				if (this.ctx.readOnly) return;
				if (along) void this.step(card, back ? -1 : 1);
				else {
					const to = this.lanes[Number(card.dataset.lane) + (back ? -1 : 1)];
					if (to !== undefined) void this.relabel(card, to);
				}
				return;
			}
			if (along) go(cards[i + (back ? -1 : 1)]);
			else go(cards[beside(cards.map((c) => ({ lane: Number(c.dataset.lane), slot: Number(c.dataset.slot) })), i, back ? -1 : 1)]);
			return;
		}
		if (mod && e.key.toLowerCase() === 'a' && !e.shiftKey && !e.altKey) { e.preventDefault(); this.select(cards.map((c) => c.dataset.path), card.dataset.path, cards[0]?.dataset.path); return; }
		if (e.key === ' ' && !e.altKey && !e.shiftKey) {
			e.preventDefault();
			const path = card.dataset.path, sel = new Set(this.sel);
			if (sel.has(path) && sel.size > 1) sel.delete(path); else sel.add(path);
			this.select([...sel], path, path);
			return;
		}
		if (e.altKey || (mod && !['Home', 'End', 'Enter'].includes(e.key))) return;
		switch (e.key) {
			case 'Home': go(cards[0]); break;
			case 'End': go(cards[cards.length - 1]); break;
			case 'Enter': e.preventDefault(); this.open(card, Keymap.isModEvent(e)); break;
			case 'Delete': case 'Backspace': if (!this.ctx.readOnly) { e.preventDefault(); void this.remove(this.targets(card)); } break;
			case 'F2': if (!this.ctx.readOnly) { e.preventDefault(); this.editors.get(card.dataset.path)?.title.edit(); } break;
			case 'Escape': if (this.sel.size > 1) { e.preventDefault(); this.select([card.dataset.path]); } break;
			case 'ContextMenu': this.menuAtCard(e, card); break;
			case 'F10': if (e.shiftKey) this.menuAtCard(e, card); break;
		}
	}

	private menuAtCard(e: KeyboardEvent, card: HTMLElement): void {
		e.preventDefault();
		if (!this.sel.has(card.dataset.path)) this.select([card.dataset.path]);
		const r = card.getBoundingClientRect();
		this.cardMenu(card).showAtPosition({ x: r.left + 12, y: r.top + 24 }, this.board.doc);
	}

	/** Alt and an arrow across the lines: the card (or the selection) takes the next line's label. */
	private async relabel(card: HTMLElement, label: string): Promise<void> {
		const items = this.targets(card), path = card.dataset.path;
		this.moving = true;
		try { await this.change(items, label); } finally { this.moving = false; }
		this.refocus = path;
		this.draw();
		const now = this.cardEl(path);
		if (now) this.show(now);
	}

	/** Alt and an arrow along the lines: the card (or the selection) goes one place on in the binder's order. */
	private async step(card: HTMLElement, delta: number): Promise<void> {
		const items = this.targets(card), path = card.dataset.path;
		this.moving = true;
		try {
			for (const f of delta < 0 ? items : [...items].reverse()) if (!(await this.stepPast(f, delta))) break;
		} catch (e) { new Notice(plain(e)); } finally { this.moving = false; }
		this.select(items.map((f) => f.path), path);
		this.refocus = path;
		this.draw();
		const now = this.cardEl(path);
		if (now) this.show(now);
	}

	/** Moves an item past the next card shown in its folder, so a filter's hidden notes keep their places. False if no
	    card is shown on that side. */
	private async stepPast(f: TAbstractFile, delta: number): Promise<boolean> {
		const folder = f.parent;
		if (!folder) return false;
		const shown = this.children(folder).filter((x) => !(x instanceof TFile) || this.made.has(x) || this.ctx.visible(x));
		const at = shown.indexOf(f), next = shown[at + (delta < 0 ? -1 : 1)];
		if (at < 0 || !next) return false;
		const sibs = (this.store.orderedChildren(folder) ?? []).filter((x) => x !== f);
		await this.store.put([f], folder, sibs[sibs.indexOf(next) + (delta < 0 ? 0 : 1)] ?? null);
		return true;
	}

	// ---- actions ----

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
		if (!(await removeItems(this.ctx, items))) { this.focus(); return; }
		if (!next) return;
		this.select([next]);
		this.refocus = next;
		if (!this.busy()) this.draw();
	}

	/** A new note at `index` in a folder, with a label if a line asked for it, its title ready to type. */
	private async newNote(folder: TFolder, index: number, label: string, depth?: number): Promise<void> {
		try {
			const file = await this.store.newScene(folder, index, 'Untitled', depth);
			this.made.add(file);
			this.ctx.made(file);
			if (label) {
				await this.ctx.setProps(file, { label: presetOf(label, this.presets)?.name ?? label });
				for (let i = 0; i < 60 && this.labelOf(file) !== label; i++) await new Promise((r) => window.setTimeout(r, 25));
			}
			this.onMade(file, true);
		} catch (e) { new Notice(plain(e)); }
	}

	/** Something was made (a note, a copy, a folder around the selection): selected, and named in place if asked. */
	private onMade(f: TAbstractFile, rename: boolean): void {
		this.sel = new Set([f.path]);
		this.focused = this.anchor = f.path;
		if (this.busy()) { this.dirty = true; return; }
		this.draw();
		const el = this.cardEl(f.path);
		if (!el) return;
		this.show(el);
		if (rename && !this.ctx.readOnly) this.editors.get(f.path)?.title.edit(); else el.focus({ preventScroll: true });
	}

	/** The menu of a card (or of the cards selected with it). */
	private cardMenu(card: HTMLElement): Menu {
		const items = this.targets(card), one = items.length === 1 ? items[0] : null;
		const sibs = one?.parent ? this.children(one.parent).filter((x) => !(x instanceof TFile) || this.made.has(x) || this.ctx.visible(x)) : [], i = one ? sibs.indexOf(one) : -1;
		return itemMenu(this.ctx, items, {
			pick: () => { this.picking = true; },
			rename: (f) => this.editors.get(f.path)?.title.edit(),
			synopsis: (f) => this.editors.get(f.path)?.synopsis.edit(),
			up: one && i > 0 ? () => void this.stepPast(one, -1).catch((e) => new Notice(plain(e))) : null,
			down: one && i >= 0 && i < sibs.length - 1 ? () => void this.stepPast(one, 1).catch((e) => new Notice(plain(e))) : null,
			remove: (all) => void this.remove(all),
			made: (f, rename) => this.onMade(f, rename),
		});
	}

	/** A line's own menu: a note on it, its notes, and the labels themselves. */
	private laneMenu(label: string): Menu {
		const menu = new Menu(), ro = this.ctx.readOnly;
		const here = this.cards().map((c) => c.dataset.path).filter((p) => { const f = this.item(p); return !!f && this.labelOf(f) === label; });
		if (!ro) menu.addItem((i) => i.setSection('new').setTitle(label ? 'New note with this label' : 'New note').setIcon('file-plus').onClick(() => void this.newNote(this.ctx.folder, Infinity, label)));
		if (here.length) menu.addItem((i) => i.setSection('select').setTitle(here.length === 1 ? 'Select its note' : 'Select its notes').setIcon('mouse-pointer-click').onClick(() => {
			this.select(here, here[0]);
			const el = this.cardEl(here[0]);
			if (el) { this.show(el); el.focus({ preventScroll: true }); }
		}));
		menu.addItem((i) => i.setSection('labels').setTitle('New label...').setIcon('plus').onClick(() => void this.addLabel()));
		menu.addItem((i) => i.setSection('labels').setTitle('Edit labels...').setIcon('settings').onClick(() => openPluginSettings(this.ctx.app, this.ctx.plugin.manifest.id)));
		return menu;
	}

	/** Asks for a label's name and color, and adds it to the labels in settings: a new line, after the others. */
	private async addLabel(): Promise<void> {
		const s = this.ctx.plugin.settings, made = await newLabel(this.ctx.app, s.labels);
		if (!made) return;
		s.labels = [...s.labels, made];
		await this.ctx.plugin.saveSettings();
		if (!this.busy()) this.draw();
	}
}
