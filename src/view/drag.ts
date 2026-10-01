/* A press that may become a drag, the same for every view: a mouse or pen drags once it has moved a little; a finger
   drags after a long press (so a swipe still scrolls), and a long press without moving asks for the menu. Escape
   cancels. The view says what is taken hold of and what a drag does (`PressHost`); this only reads the pointer. */

export const LONG_PRESS = 450;
const DRAG_START = 5;

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
		if (this.dragging) { this.host.move(e.clientX, e.clientY); return; }
		const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
		if (p.touch && !p.armed) { if (d > 10) this.endPress(); return; } // a swipe: let it scroll
		if (d <= DRAG_START) return;
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

/** Moves each element from where it was (`before`, or `from(el)` for one just dropped) to where it is. Returns the
    animations started, by element. */
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
