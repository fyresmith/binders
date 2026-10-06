/* A card or an outliner row dragged out of the binder view is a file, anywhere Obsidian takes one.

   Inside the view a drag is the view's own (pointer events: drag.ts, corkboard.ts, outliner.ts) and nothing here does
   anything. Once the pointer leaves the view, the drag is handed to Obsidian: its drag manager is told what's dragged,
   exactly as a row of the file explorer tells it (a `dragstart`, then `dragFile` / `dragFolder` / `dragFiles` and
   `onDragStart`), and from then on whatever is under the pointer is sent the `dragenter`, `dragover`, `dragleave` and
   `drop` events a real drag would send it. So everything that takes a note takes a card: a note's text (a link), a
   canvas (a card of it), a tab (the note opened), the bookmarks, the file explorer (moved). Back over the view the file
   drag is ended, with nothing dropped, and the card is a card again.

   Undocumented, all of it (docs/dev/internals.md): `app.dragManager` and its `draggable`, `ghostEl`, `dragStart`,
   `onDragStart`, `onDragEnd`, `dragFile`, `dragFolder`, `dragFiles`; drag events made by hand. Without any of them
   `FileDrag.begin()` returns null and a drag never leaves the view, as before. */
import { Platform, TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import { countTitle, dropEffect, edgeScroll, within } from './file-drag-data';

interface Draggable { source?: unknown; type?: unknown; icon?: unknown; title?: unknown; file?: unknown; files?: unknown }
interface DragManager {
	draggable?: Draggable | null;
	ghostEl?: HTMLElement | null;
	dragStart?: { moved?: boolean } | null;
	onDragStart?: (e: DragEvent, d: Draggable) => void;
	onDragEnd?: () => void;
	dragFile?: (e: DragEvent, f: TFile, source?: string) => Draggable | null;
	dragFolder?: (e: DragEvent, f: TFolder, source?: string) => Draggable | null;
	dragFiles?: (e: DragEvent, f: TAbstractFile[], source?: string) => Draggable | null;
}
type Ready = Required<Pick<DragManager, 'onDragStart' | 'onDragEnd' | 'dragFile' | 'dragFolder' | 'dragFiles'>> & DragManager;

/** A window, with the makers of the events a drag is made of. */
type Win = Window & { DataTransfer: typeof DataTransfer; DragEvent: typeof DragEvent };

/** What Obsidian's drag manager is told the drag comes from (the file explorer says nothing). */
export const FILE_DRAG_SOURCE = 'binders';
/** How often a drag that isn't moving says where it is, as a real one does (a list scrolled under it, a folder sprung open). */
const REPEAT = 50;

const manager = (app: App): Ready | null => {
	const m = (app as unknown as { dragManager?: DragManager }).dragManager;
	if (!m || typeof m !== 'object') return null;
	for (const k of ['onDragStart', 'onDragEnd', 'dragFile', 'dragFolder', 'dragFiles'] as const) if (typeof m[k] !== 'function') return null;
	return m as Ready;
};

/** What is dragged, and the card or row it was taken from. */
export interface FileDragOptions {
	/** The card or row taken hold of: the file drag starts from it, and the view it's in is where the drag is the view's own. */
	source: HTMLElement;
	items: TAbstractFile[];
	/** What the view has following the pointer. It gets `is-handed-over` while the drag is Obsidian's (styles.css). */
	carried?: HTMLElement;
	/** `carried` isn't the look of Obsidian's own drag ghost already (a card is not, an outliner's row is): the one turns
	    into the other, and back. */
	morph?: boolean;
	/** The notes of a dragged folder, in order, for what takes notes one by one (a canvas). Without it, Obsidian's own
	    reading of a folder. */
	notes?: (folder: TFolder) => TFile[];
}

/** A card or row dragged out of the view, handed to Obsidian as a file drag (see the header). */
export class FileDrag {
	/** A file drag for these items, to be told where the pointer is; null where Obsidian can't be handed one (then the
	    view's drag is all there is). */
	static begin(app: App, opts: FileDragOptions): FileDrag | null {
		const win = opts.source.win as Win;
		// (a phone has nothing beside the view to drop on; a window of its own has no drag manager listening in it)
		if (!opts.items.length || Platform.isPhone || win !== window || !manager(app)) return null;
		if (typeof win.DataTransfer !== 'function' || typeof win.DragEvent !== 'function') return null;
		return new FileDrag(app, opts);
	}

	private doc: Document;
	private win: Win;
	/** The view's pane, its header included: a drag over it is the view's (the header is no place to drop a card). */
	private home: HTMLElement;
	private data: DataTransfer | null = null;
	/** What the drag manager was told is dragged, and the same as single notes (see `offer`). */
	private mine: Draggable | null = null;
	private single: Draggable | null = null;
	private over: Element | null = null;
	private effect = 'none';
	private last = 0;
	private edgeSince = 0;
	private raf = 0;
	private x = 0;
	private y = 0;
	/** Obsidian didn't take it when asked: not asked again. */
	private dead = false;
	/** Obsidian's ghost on its way out, after the drag came back to the view. */
	private fading: HTMLElement | null = null;

	private constructor(private app: App, private opts: FileDragOptions) {
		this.doc = opts.source.doc;
		this.win = opts.source.win as Win;
		this.home = opts.source.closest<HTMLElement>('.workspace-leaf') ?? opts.source.closest<HTMLElement>('.view-content') ?? opts.source;
	}

	/** Is the drag Obsidian's just now (the pointer is outside the view)? */
	get out(): boolean { return !!this.data; }

	/** The pointer is at (x, y). True while the drag is Obsidian's: the view then shows no place of its own to drop. */
	move(x: number, y: number): boolean {
		this.x = x; this.y = y;
		const m = manager(this.app);
		if (this.dead || !m) return false;
		// (ended behind our back, by whatever else listens: it starts again from here)
		if (this.data && m.draggable !== this.mine && m.draggable !== this.single) this.reset();
		if (this.inside(x, y)) { this.back(); return false; }
		if (!this.data && !this.start(m, x, y)) return false;
		this.send(m, x, y);
		return true;
	}

	/** Let go at (x, y) while the drag is Obsidian's. True if something there took it. */
	drop(x: number, y: number): boolean {
		const m = manager(this.app);
		if (!this.data || !m) { this.end(); return false; }
		this.send(m, x, y);
		let taken = false;
		const to = this.over;
		if (to && this.effect !== 'none') { const e = this.event('drop', x, y); to.dispatchEvent(e); taken = e.defaultPrevented; }
		this.finish(x, y);
		return taken;
	}

	/** The drag is over, with nothing dropped (Escape, the view closing, let go over the view): nothing of it is left. */
	end(): void {
		if (this.data) {
			this.leave();
			this.finish();
		}
		this.fading?.remove();
		this.fading = null;
	}

	// ---- inside or out ----

	private inside(x: number, y: number): boolean {
		if (within(this.home.getBoundingClientRect(), x, y)) return true;
		// the view's own tab, like its header: a note dropped there would open in place of the binder
		const tab = this.home.closest('.workspace-tabs')?.querySelector(':scope > .workspace-tab-header-container .workspace-tab-header.is-active');
		return !!tab && tab.contains(this.doc.elementFromPoint(x, y));
	}

	/** Out of the view: Obsidian's drag manager is told what's dragged, as a row of the file explorer tells it. */
	private start(m: Ready, x: number, y: number): boolean {
		const { items, source, carried, morph } = this.opts;
		let data: DataTransfer;
		try {
			data = new this.win.DataTransfer();
			// (one made by hand ignores what it's told a drop would do: these stand in, so whoever is asked can still say)
			Object.defineProperty(data, 'dropEffect', { value: 'move', writable: true, configurable: true });
			Object.defineProperty(data, 'effectAllowed', { value: 'all', writable: true, configurable: true });
		} catch { this.dead = true; return false; }
		this.data = data;
		const one = items.length === 1 ? items[0] : null;
		const tell = (e: DragEvent) => {
			try {
				const d = one instanceof TFolder ? m.dragFolder(e, one, FILE_DRAG_SOURCE) : one instanceof TFile ? m.dragFile(e, one, FILE_DRAG_SOURCE) : m.dragFiles(e, items, FILE_DRAG_SOURCE);
				if (!d) return;
				m.onDragStart(e, d);
				if (m.draggable === d) this.mine = d;
			} catch { /* not handed over */ }
		};
		const from = source.isConnected ? source : this.doc.body;
		from.addEventListener('dragstart', tell, { once: true });
		from.dispatchEvent(this.event('dragstart', x, y));
		from.removeEventListener('dragstart', tell);
		if (!this.mine) { this.data = null; this.dead = true; return false; }
		// (by touch Obsidian takes a drag that hasn't moved for a long press, and opens a menu when it ends: this one has moved)
		if (m.dragStart) m.dragStart.moved = true;
		const ghost = m.ghostEl;
		ghost?.addClass('binders-file-ghost');
		this.fading?.remove();
		this.fading = null;
		if (carried) {
			// (each part of it shrinks toward where it's held: a card, and the count on a pile of them)
			const r = carried.getBoundingClientRect();
			for (const el of Array.from(carried.children)) if (el.instanceOf(HTMLElement)) el.setCssProps({ '--binders-hold-x': `${x - r.left - el.offsetLeft}px`, '--binders-hold-y': `${y - r.top - el.offsetTop}px` });
			carried.addClass('is-handed-over');
			if (morph) ghost?.addClass('mod-morph');
		}
		const tick = () => {
			if (!this.data) return;
			this.scroll();
			const now = manager(this.app);
			if (now && performance.now() - this.last > REPEAT) this.send(now, this.x, this.y);
			this.raf = this.win.requestAnimationFrame(tick);
		};
		this.raf = this.win.requestAnimationFrame(tick);
		return true;
	}

	/** Back over the view: the file drag is over, with nothing dropped, and what the view carries is itself again. */
	private back(): void {
		if (!this.data) return;
		const { carried, morph } = this.opts;
		// Obsidian's ghost goes as it came: a copy of it fades where it was, since its own is gone at once
		const ghost = manager(this.app)?.ghostEl;
		if (morph && ghost?.isConnected && !this.win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			const copy = ghost.cloneNode(true) as HTMLElement;
			copy.addClass('is-leaving');
			this.doc.body.appendChild(copy);
			this.fading = copy;
			const done = () => { copy.remove(); if (this.fading === copy) this.fading = null; };
			copy.addEventListener('animationend', done);
			this.win.setTimeout(done, 600);
		}
		this.leave();
		this.finish();
		carried?.removeClass('is-handed-over');
		// (Obsidian's drag took the grabbing hand with it; the view's drag goes on)
		this.doc.body.addClass('is-grabbing');
	}

	// ---- the events a real drag sends ----

	private event(type: string, x: number, y: number, related: Element | null = null, off = false): DragEvent {
		const win = this.win;
		// (a drag that has left the window says so with no place at all: Obsidian's drag manager goes by that)
		return new win.DragEvent(type, { bubbles: true, cancelable: true, composed: true, view: win, clientX: x, clientY: y, screenX: off ? 0 : x + win.screenX, screenY: off ? 0 : y + win.screenY, dataTransfer: this.data, relatedTarget: related, buttons: 1 });
	}

	/** What's under the pointer hears of the drag: entered, left, and over it. */
	private send(m: Ready, x: number, y: number): void {
		const data = this.data;
		if (!data) return;
		let to = this.doc.elementFromPoint(x, y);
		if (to && deaf(to)) to = null;
		this.offer(m, to);
		if (to !== this.over) {
			if (to) to.dispatchEvent(this.event('dragenter', x, y, this.over));
			if (to && this.over) this.over.dispatchEvent(this.event('dragleave', x, y, to));
			else if (!to) this.leave();
			this.over = to;
		}
		this.last = performance.now();
		if (!to) { this.effect = 'none'; return; }
		// (as the browser has it before anything says otherwise)
		data.dropEffect = 'move';
		const e = this.event('dragover', x, y);
		to.dispatchEvent(e);
		// (text being edited takes a drop without saying so, as the browser has it: a note's editor is one such)
		const editable = to.instanceOf(HTMLElement) && (to.isContentEditable || to.matches('input, textarea'));
		this.effect = dropEffect(e.defaultPrevented, editable, data.dropEffect);
	}

	/** Out of everything (off the window's edge, or back over the view): what was under the pointer is told, and
	    Obsidian puts its ghost and its marks away, as when a real drag leaves the window. */
	private leave(): void {
		const was = this.over?.isConnected ? this.over : this.doc.body;
		this.over = null;
		this.effect = 'none';
		was.dispatchEvent(this.event('dragleave', 0, 0, null, true));
	}

	/** A canvas takes notes one by one, and reads a folder as every file in it, the folder's own hidden note too: over
	    one, a folder is handed over as the notes in it (`opts.notes`). Everywhere else, as what it is. */
	private offer(m: Ready, to: Element | null): void {
		const { items, notes } = this.opts;
		if (!this.mine || !notes || !items.some((f) => f instanceof TFolder)) return;
		if (!to?.closest('.canvas-wrapper')) { if (m.draggable === this.single) m.draggable = this.mine; return; }
		if (!this.single) {
			const files = items.flatMap((f) => (f instanceof TFolder ? notes(f) : f instanceof TFile ? [f] : []));
			this.single = { source: FILE_DRAG_SOURCE, type: 'files', icon: 'lucide-files', title: countTitle(files.length, 0), files };
		}
		if (m.draggable === this.mine) m.draggable = this.single;
	}

	/** Near the top or bottom edge of a list that scrolls (the file explorer, a long note), it scrolls, as it does under
	    a real drag. */
	private scroll(): void {
		let el: Element | null = this.over;
		while (el && !(el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(el.win.getComputedStyle(el).overflowY))) el = el.parentElement;
		const r = el?.getBoundingClientRect(), now = performance.now();
		const by = el && r ? edgeScroll(this.y, r.top, r.bottom, this.edgeSince ? now - this.edgeSince : 0) : 0;
		if (!el || !by) { this.edgeSince = 0; return; }
		this.edgeSince ||= now;
		el.scrollTop += by;
	}

	/** The file drag ends (dropped or not): Obsidian's drag manager clears up, and nothing is left saying a drag is on. */
	private finish(x = 0, y = 0): void {
		const e = this.event('dragend', x, y), from = this.opts.source.isConnected ? this.opts.source : this.doc.body;
		this.reset();
		// (Obsidian's drag manager ends its drag on `dragend`: the ghost, `draggable`, the marks on what was hovered)
		from.dispatchEvent(e);
		const m = manager(this.app);
		if (!m) return;
		try { if (m.draggable || m.ghostEl) m.onDragEnd(); } catch { /* cleared below */ }
		if (m.draggable) m.draggable = null;
	}

	private reset(): void {
		this.win.cancelAnimationFrame(this.raf);
		this.data = null; this.mine = null; this.single = null; this.over = null;
		this.effect = 'none';
		this.edgeSince = 0;
	}
}

/** Places that mustn't be sent a drag: an empty list of bookmarks, whose own handler throws when asked where in the
    list a drop would go (Obsidian 1.13.7: it reads the last item of the list, and there is none). */
function deaf(el: Element): boolean {
	const pane = el.closest('.workspace-leaf-content[data-type="bookmarks"]');
	return !!pane && !pane.querySelector('.tree-item');
}
