/* A press that may become a drag, the same for every view: a mouse or pen drags once it has moved a little; a finger
   drags after a long press (so a swipe still scrolls), and a long press without moving asks for the menu. Escape
   cancels. The view says what is taken hold of and what a drag does (`PressHost`); this only reads the pointer. */

/** How long a finger is held still before it has taken hold (ms). */
export const LONG_PRESS = 450;
const DRAG_START = 5;

/** What a view tells `Press`: where to listen, what a press takes hold of, and what a drag does. */
export interface PressHost<T> {
	/** Where presses are listened for. */
	el: HTMLElement;
	/** What a press at this event takes hold of, or null for nothing. */
	pick(e: PointerEvent): { el: HTMLElement; data: T } | null;
	/** A press began (before it's known whether it's a click or a drag), e.g. to select what's under it. */
	down?(data: T, e: PointerEvent): void;
	/** May this be dragged (not in a read-only binder, say)? Asked when the pointer has moved far enough. */
	canDrag(data: T): boolean;
	/** The drag begins, from where the press was. */
	start(data: T, x: number, y: number, el: HTMLElement): void;
	move(x: number, y: number): void;
	/** The drag ends: dropped at (x, y), or cancelled (`drop` false). */
	end(drop: boolean, x: number, y: number): void;
	/** A finger held without moving, then lifted: the menu. */
	hold?(data: T, x: number, y: number, el: HTMLElement): void;
}

/** Reads one pointer into a click, a drag or a long press, and tells its host. */
export class Press<T> {
	/** The kind of pointer last pressed: 'mouse', 'pen' or 'touch'. */
	pointer = 'mouse';
	/** The click that follows a drag (or a long press) isn't a click on what's under it. */
	noClick = false;
	dragging = false;
	private press: { id: number; x: number; y: number; touch: boolean; el: HTMLElement; data: T; armed: boolean; timer: number } | null = null;
	private off: (() => void) | null = null;
	private swallowTouch = false;
	private cleanup: (() => void)[] = [];

	constructor(private host: PressHost<T>) {
		const el = host.el, on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
			el.addEventListener(t, fn, opts);
			this.cleanup.push(() => el.removeEventListener(t, fn, opts));
		};
		on('pointerdown', (e) => this.onDown(e));
		// while something is held or dragged by touch, the page mustn't scroll instead
		on('touchmove', (e) => { if (this.press?.armed || this.dragging) e.preventDefault(); }, { passive: false });
		// and lifting the finger after a long press or a drag mustn't click (which would also close the menu just opened)
		on('touchend', (e) => { if (this.swallowTouch) { this.swallowTouch = false; e.preventDefault(); } }, { passive: false });
	}

	destroy(): void {
		this.cancel();
		for (const f of this.cleanup) f();
		this.cleanup = [];
	}

	/** Ends a drag with nothing dropped; the button or finger still down then does nothing when it lifts. */
	cancel(): void {
		const p = this.press, was = this.dragging;
		this.endPress();
		if (!was) return;
		this.dragging = false;
		this.host.end(false, 0, 0);
		this.noClick = true;
		const touch = !!p?.touch;
		this.host.el.doc.addEventListener('pointerup', () => {
			if (touch) this.swallowTouch = true;
			window.setTimeout(() => { this.noClick = false; this.swallowTouch = false; }, 0);
		}, { once: true, capture: true });
	}

	private onDown(e: PointerEvent): void {
		this.pointer = e.pointerType;
		// (a second finger isn't a press of its own: it ends the first's, so two fingers never hold or drag anything)
		if (!e.isPrimary) { this.endPress(); return; }
		if (e.button !== 0 || this.dragging || (e.target as HTMLElement).closest('input, textarea, select')) return;
		const hit = this.host.pick(e);
		if (!hit) return;
		this.endPress();
		const touch = e.pointerType === 'touch';
		const p: NonNullable<Press<T>['press']> = { id: e.pointerId, x: e.clientX, y: e.clientY, touch, el: hit.el, data: hit.data, armed: false, timer: 0 };
		this.press = p;
		if (touch) p.timer = window.setTimeout(() => { if (this.press === p) { p.armed = true; p.el.addClass('is-lifted'); } }, LONG_PRESS);
		else this.host.down?.(hit.data, e);
		const doc = this.host.el.doc;
		const move = (ev: PointerEvent) => this.onMove(ev);
		const up = (ev: PointerEvent) => this.onUp(ev, false);
		const cancel = (ev: PointerEvent) => this.onUp(ev, true);
		const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && this.dragging) { ev.preventDefault(); ev.stopPropagation(); this.cancel(); } };
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
		doc.addEventListener('pointercancel', cancel);
		doc.addEventListener('keydown', key, true);
		this.off = () => { doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up); doc.removeEventListener('pointercancel', cancel); doc.removeEventListener('keydown', key, true); };
	}

	private endPress(): void {
		if (this.press) { window.clearTimeout(this.press.timer); this.press.el.removeClass('is-lifted'); }
		this.press = null;
		this.off?.();
		this.off = null;
	}

	private onMove(e: PointerEvent): void {
		const p = this.press;
		if (!p || e.pointerId !== p.id) return;
		// The button was let go where the page couldn't see it (another window came in front, so no `pointerup` came):
		// the press is over, and what's in hand goes back where it was. It doesn't stay in hand for the next click to
		// drop, and that click is a click (so not `cancel()`, which waits for the button still down to lift).
		if (!p.touch && e.buttons === 0) {
			const was = this.dragging;
			this.endPress();
			this.dragging = false;
			if (was) this.host.end(false, e.clientX, e.clientY);
			return;
		}
		if (this.dragging) { this.host.move(e.clientX, e.clientY); return; }
		const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
		if (p.touch && !p.armed) { if (d > 10) this.endPress(); return; } // a swipe: let it scroll
		// (a finger held still isn't quite still: see the corkboard's own press)
		if (d <= (p.touch ? 12 : DRAG_START)) return;
		if (!this.host.canDrag(p.data)) { this.endPress(); return; }
		this.dragging = true;
		p.el.removeClass('is-lifted');
		this.host.start(p.data, p.x, p.y, p.el);
		this.host.move(e.clientX, e.clientY);
	}

	private onUp(e: PointerEvent, cancelled: boolean): void {
		const p = this.press;
		if (!p || e.pointerId !== p.id) return;
		const held = p.touch && p.armed;
		if (p.touch && (this.dragging || held)) {
			// the touchend that follows comes in the same task; never let the flag outlive it
			this.swallowTouch = true;
			window.setTimeout(() => { this.swallowTouch = false; }, 0);
		}
		if (this.dragging || held) {
			this.noClick = true;
			window.setTimeout(() => { this.noClick = false; }, 0);
		}
		const was = this.dragging;
		this.endPress();
		if (was) {
			this.dragging = false;
			this.host.end(!cancelled, e.clientX, e.clientY);
		} else if (held && !cancelled) this.host.hold?.(p.data, e.clientX, e.clientY, p.el);
	}
}

/* Gliding: after a redraw, whatever changed place moves there from where it was instead of jumping, with the timing
   Obsidian gives its own reordered items. Only what's in sight moves; a big rearrangement, or "reduce motion", just
   shows. */

/** The timing of a glide: Obsidian's own, for items it reorders. */
export const GLIDE: KeyframeAnimationOptions = { duration: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
/** A tree folding or unfolding, as quick as the file explorer's. */
export const GLIDE_QUICK: KeyframeAnimationOptions = { duration: 140, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
const GLIDE_MAX = 120;

/** Elements just made (a few of them) are laid out in full for the measuring that follows, then left to the browser
    again: one that's kept from layout until it's near (`content-visibility: auto`) is measured as an empty stand-in
    until the browser has had a look at it, which would have everything after it glide from the wrong place. */
export function settle(fresh: HTMLElement[]): void {
	if (!fresh.length || fresh.length > FRESH_MAX) return;
	for (const el of fresh) el.addClass('is-fresh');
	const win = fresh[0].win;
	win.requestAnimationFrame(() => win.requestAnimationFrame(() => { for (const el of fresh) el.removeClass('is-fresh'); }));
}
const FRESH_MAX = 60;

/** Where each element is now, by what it is (`key`), to glide from after the redraw. */
export function places(root: HTMLElement, selector: string, key: (el: HTMLElement) => string | null): Map<string, DOMRect> {
	const out = new Map<string, DOMRect>();
	for (const el of root.querySelectorAll<HTMLElement>(selector)) { const k = key(el); if (k) out.set(k, el.getBoundingClientRect()); }
	return out;
}

/** The lowest point of a scrolling pane that can be seen: its own bottom edge, or the top of the bar of buttons
    Obsidian lays over the foot of the screen on a phone. Dragging near it scrolls the pane. */
export function visibleBottom(el: HTMLElement): number {
	const r = el.getBoundingClientRect(), bar = el.doc.querySelector('.mobile-navbar')?.getBoundingClientRect();
	return bar && bar.height > 0 && bar.top > r.top && bar.top < r.bottom ? bar.top : r.bottom;
}

/** How much faster a pane scrolls for a drag held at its edge since `since`: twice as fast each second, up to eight
    times, so the far end of a long binder isn't a minute away. */
export const held = (since: number): number => Math.min(8, 2 ** ((performance.now() - since) / 1000));

/** Moves each element from where it was (`before`, or `from(el)` for one just dropped) to where it is. Returns the
    animations started, by element. Nothing moves under "reduce motion". */
export function glide(root: HTMLElement, selector: string, key: (el: HTMLElement) => string | null, before: Map<string, DOMRect>, view: DOMRect, from?: (el: HTMLElement) => DOMRect | undefined, how: KeyframeAnimationOptions = GLIDE): Map<HTMLElement, Animation> {
	const out = new Map<HTMLElement, Animation>();
	if (root.win.matchMedia('(prefers-reduced-motion: reduce)').matches) return out;
	const margin = 200, inSight = (r: DOMRect) => r.bottom > view.top - margin && r.top < view.bottom + margin;
	const moves: { el: HTMLElement; dx: number; dy: number }[] = [];
	for (const el of root.querySelectorAll<HTMLElement>(selector)) {
		const k = key(el), was = from?.(el) ?? (k ? before.get(k) : undefined);
		if (!was) continue;
		const to = el.getBoundingClientRect(), dx = was.left - to.left, dy = was.top - to.top;
		if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !(inSight(was) || inSight(to))) continue;
		moves.push({ el, dx, dy });
	}
	if (moves.length > GLIDE_MAX) return out;
	for (const m of moves) out.set(m.el, m.el.animate([{ transform: `translate(${m.dx}px, ${m.dy}px)` }, { transform: 'translate(0, 0)' }], how));
	return out;
}

/* A selection box: a press on empty space of a board that becomes a drag draws a rectangle from where the button went
   down to the pointer, and the cards it touches are selected as it moves, as in a file manager. Plain, they replace
   what was selected; with Shift they're added to it; with Ctrl (Cmd on macOS) each changes sides. Escape puts the
   selection back as it was. A mouse or a pen only: a finger on empty space scrolls. The box is begun at a place on
   the board, not on the screen: held near an edge of the pane the board scrolls under it, and the box grows. The view
   says what its cards are and what selecting them means (`BoxHost`); this reads the pointer and draws. */

/** What a view tells `SelectBox`. */
export interface BoxHost {
	/** The pane that scrolls, where presses are listened for. */
	el: HTMLElement;
	/** Is this (what was pressed) empty space: not a card, a heading, a field? */
	empty(target: HTMLElement): boolean;
	/** The cards on the board, in its order (each with its path in `data-path`). */
	cards(): HTMLElement[];
	/** The box begins: what is selected now, in the board's order, and how to put everything back as it is. */
	begin(): { selected: string[]; restore(): void };
	/** The box moved and selects other cards than before: `paths` is the whole selection now, in the board's order;
	    `touched` the cards the box touches. */
	select(paths: string[], touched: string[]): void;
	/** The box is gone: `kept` false if it was cancelled (and the selection put back). */
	end?(kept: boolean): void;
}

/** Reads a press on empty space into a selection box, and tells its host what it touches. */
export class SelectBox {
	/** The click that follows a box isn't a click on empty space (which would clear the selection). */
	noClick = false;
	private press: { id: number; x: number; y: number; cx: number; cy: number; mode: 'replace' | 'add' | 'toggle' } | null = null;
	private live: { box: HTMLElement; base: Set<string>; restore: () => void; said: string; raf: number; edge: number } | null = null;
	private at = { x: 0, y: 0 };
	private off: (() => void) | null = null;
	private down = (e: PointerEvent) => this.onDown(e);

	constructor(private host: BoxHost) { host.el.addEventListener('pointerdown', this.down); }

	/** Is a box being drawn now? */
	get drawing(): boolean { return !!this.live; }

	destroy(): void {
		this.finish(false);
		this.host.el.removeEventListener('pointerdown', this.down);
	}

	private onDown(e: PointerEvent): void {
		const el = this.host.el, t = e.target as HTMLElement;
		// (the main button of a mouse or a pen; and not on the pane's own scroll bars)
		if (this.press || this.live || e.button !== 0 || !e.isPrimary || e.pointerType === 'touch' || !this.host.empty(t)) return;
		const r = el.getBoundingClientRect();
		if (e.clientX - r.left - el.clientLeft >= el.clientWidth || e.clientY - r.top - el.clientTop >= el.clientHeight) return;
		const mod = e.ctrlKey || e.metaKey;
		this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: e.clientX - r.left + el.scrollLeft, cy: e.clientY - r.top + el.scrollTop, mode: mod ? 'toggle' : e.shiftKey ? 'add' : 'replace' };
		const doc = el.doc;
		const move = (ev: PointerEvent) => this.onMove(ev);
		const up = (ev: PointerEvent) => { if (ev.pointerId === this.press?.id) this.finish(true); };
		const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && this.live) { ev.preventDefault(); ev.stopPropagation(); this.cancel(); } };
		// (a press on empty space that moves would select the text of the cards it passes: never, box or no box)
		const noText = (ev: Event) => ev.preventDefault();
		const scrolled = () => { if (this.live) this.update(); };
		doc.addEventListener('pointermove', move);
		doc.addEventListener('pointerup', up);
		doc.addEventListener('pointercancel', up);
		doc.addEventListener('keydown', key, true);
		doc.addEventListener('selectstart', noText, true);
		el.addEventListener('scroll', scrolled, { passive: true });
		this.off = () => { doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up); doc.removeEventListener('pointercancel', up); doc.removeEventListener('keydown', key, true); doc.removeEventListener('selectstart', noText, true); el.removeEventListener('scroll', scrolled); };
	}

	private onMove(e: PointerEvent): void {
		const p = this.press;
		if (!p || e.pointerId !== p.id) return;
		// (the button let go where the page couldn't see it: what's selected by then stays)
		if (e.buttons === 0) { this.finish(true); return; }
		this.at = { x: e.clientX, y: e.clientY };
		// (a click with a hand that isn't quite still is a click)
		if (!this.live) {
			if (Math.hypot(e.clientX - p.x, e.clientY - p.y) <= DRAG_START) return;
			const el = this.host.el, was = this.host.begin();
			el.doc.getSelection()?.removeAllRanges();
			el.addClass('is-selecting');
			const live = this.live = { box: el.doc.body.createDiv({ cls: 'binders-select-box', attr: { 'aria-hidden': 'true' } }), base: new Set(p.mode === 'replace' ? [] : was.selected), restore: () => was.restore(), said: was.selected.join('\n'), raf: 0, edge: 0 };
			// (the frames of the window the board is in)
			const win = el.win, tick = () => { if (this.live !== live) return; this.scroll(); live.raf = win.requestAnimationFrame(tick); };
			live.raf = win.requestAnimationFrame(tick);
		}
		this.update();
	}

	/** The box from where it began on the board to the pointer, drawn as much of it as the pane shows; and what it touches. */
	private update(): void {
		const p = this.press, live = this.live, el = this.host.el;
		if (!p || !live) return;
		const r = el.getBoundingClientRect(), left = r.left + el.clientLeft, top = r.top + el.clientTop;
		// where it began, on the screen now (off it, once the board has scrolled)
		const ax = p.cx - el.scrollLeft + r.left, ay = p.cy - el.scrollTop + r.top;
		const l = Math.min(ax, this.at.x), t = Math.min(ay, this.at.y), rt = Math.max(ax, this.at.x), b = Math.max(ay, this.at.y);
		const cl = Math.max(l, left), ct = Math.max(t, top), cr = Math.min(rt, left + el.clientWidth), cb = Math.min(b, top + el.clientHeight);
		live.box.setCssStyles({ left: `${cl}px`, top: `${ct}px`, width: `${Math.max(0, cr - cl)}px`, height: `${Math.max(0, cb - ct)}px` });
		const cards = this.host.cards(), touched: string[] = [], paths: string[] = [];
		for (const c of cards) {
			const path = c.dataset.path, k = c.getBoundingClientRect();
			if (!path) continue;
			const hit = k.width > 0 && k.height > 0 && k.right > l && k.left < rt && k.bottom > t && k.top < b;
			if (hit) touched.push(path);
			if (p.mode === 'toggle' ? hit !== live.base.has(path) : hit || live.base.has(path)) paths.push(path);
		}
		const said = paths.join('\n');
		if (said === live.said) return;
		live.said = said;
		this.host.select(paths, touched);
	}

	/** Held near an edge of the pane, the board scrolls under the box: faster the nearer, and the longer it's held. */
	private scroll(): void {
		const live = this.live, el = this.host.el;
		if (!live) return;
		const r = el.getBoundingClientRect(), edge = 48, { x, y } = this.at;
		const past = (v: number, lo: number, hi: number) => (v < lo + edge ? -(lo + edge - v) : v > hi - edge ? v - (hi - edge) : 0);
		const dy = el.scrollHeight > el.clientHeight + 1 ? past(y, r.top, visibleBottom(el)) : 0, dx = el.scrollWidth > el.clientWidth + 1 ? past(x, r.left, r.left + el.clientWidth) : 0;
		if (!dx && !dy) { live.edge = 0; return; }
		live.edge ||= performance.now();
		const step = (v: number) => Math.sign(v) * Math.max(1, 14 * Math.min(1, Math.abs(v) / edge) ** 2) * held(live.edge);
		const wasTop = el.scrollTop, wasLeft = el.scrollLeft;
		if (dy) el.scrollTop += step(dy);
		if (dx) el.scrollLeft += step(dx);
		// (the box is put right in the same frame: the scroll's own event comes a frame later)
		if (el.scrollTop !== wasTop || el.scrollLeft !== wasLeft) this.update();
	}

	/** Escape: the selection as it was. The button still down then does nothing when it lifts. */
	private cancel(): void {
		const el = this.host.el;
		this.finish(false);
		this.noClick = true;
		el.doc.addEventListener('pointerup', () => window.setTimeout(() => { this.noClick = false; }, 0), { once: true, capture: true });
	}

	private finish(keep: boolean): void {
		const live = this.live;
		this.off?.();
		this.off = null;
		this.press = null;
		this.live = null;
		if (!live) return;
		const el = this.host.el;
		el.win.cancelAnimationFrame(live.raf);
		live.box.remove();
		el.removeClass('is-selecting');
		if (!keep) live.restore();
		else {
			// (the click that ends the drag isn't a click on empty space)
			this.noClick = true;
			window.setTimeout(() => { this.noClick = false; }, 0);
		}
		this.host.end?.(keep);
	}
}
