import { Component, Keymap, MarkdownRenderer, Menu, Notice, Platform, TFile, TFolder, normalizePath, setIcon, type Events, type TAbstractFile } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { badName, emptyState, itemMenu, plain, removeItems, renameItem } from './actions';
import { vimMode } from './internals';
import { visibleBottom } from './drag';
import type { BinderMode, ModeContext, ModeFactory } from './mode';
import { embedSupported, mountEditor, type LiveEditor } from './editable-embed';

/* The manuscript: every note in the folder, in binder order, as one scrolling page, like Scrivener's Scrivenings.
   Subfolders are headings; each note is a section with its title and its body in a live editor on that note.

   Only sections near the viewport get a live editor (at most LIVE_MAX, plus the focused one and any with unsaved
   typing); the rest show the note rendered read only, at its last known height, so the scrollbar doesn't jump.
   Live editors come from editable-embed.ts (Obsidian internals); if that isn't available, or the binder is read only,
   every section is rendered and clicking one opens its note. */

/** How long scrolling must pause before editors are mounted or unmounted, in ms. */
const SETTLE = 120;
const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
/** Where the body starts, after the frontmatter (which the manuscript hides). */
const bodyStart = (text: string): number => FRONTMATTER.exec(text)?.[0].length ?? 0;
/** Where position `p` of `was` is in `now`, the same text with one stretch of it changed: before the change it
    stays, after it it moves along, inside it it goes to the change's end. */
export function moved(was: string, now: string, p: number): number {
	if (was === now) return p;
	let a = 0;
	while (a < was.length && a < now.length && was[a] === now[a]) a++;
	let e = 0;
	while (e < was.length - a && e < now.length - a && was[was.length - 1 - e] === now[now.length - 1 - e]) e++;
	return p <= a ? p : p >= was.length - e ? p + now.length - was.length : now.length - e;
}

/** A key as it was pressed, to be given to an editor a moment later. */
interface StrayKey { key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }

/** Where a position in an editor is on screen, from the page as drawn: for when the editor itself can't be asked (it's
    measuring). Null if that part isn't drawn. */
function caretRect(cm: EditorView, pos: number): { top: number; bottom: number } | null {
	try {
		const { node, offset } = cm.domAtPos(pos), range = node.ownerDocument.createRange();
		range.setStart(node, offset);
		range.collapse(true);
		const r = range.getClientRects()[0];
		if (r && r.height) return r;
		// an empty line, or between two things in one: the thing before or after, or the line
		const el = node.instanceOf(HTMLElement) ? (node.childNodes[offset] ?? node.childNodes[offset - 1] ?? node) : node.parentElement;
		const b = el?.instanceOf(HTMLElement) ? el.getBoundingClientRect() : null;
		return b && b.height ? b : null;
	} catch { return null; }
}

interface Heading {
	kind: 'heading';
	key: TFolder;
	el: HTMLElement;
	textEl: HTMLElement;
	depth: number;
	renaming?: boolean;
}

interface Scene {
	kind: 'scene';
	key: TFile;
	file: TFile;
	el: HTMLElement;
	titleEl: HTMLElement;
	bodyEl: HTMLElement;
	live: LiveEditor | null;
	mounting: Promise<void> | null;
	/** The body the rendered placeholder shows; null when it needs (re)rendering. */
	shown: string | null;
	rendering: boolean;
	renderComp: Component | null;
	/** Bumped to cancel an in-flight render. */
	token: number;
	/** Mounting failed: this section stays rendered. */
	broken: boolean;
	renaming: boolean;
	/** The last unmount's save; a remount waits for it so it doesn't load the old text. */
	saved: Promise<void>;
}

type Entry = Heading | Scene;

class Manuscript implements BinderMode {
	/** The page is the notes that pass the view's filter (all of them, without one). */
	readonly filters = true;
	private app: ModeContext['app'];
	private root: HTMLElement;
	private page: HTMLElement;
	private list: HTMLElement;
	private emptyEl: HTMLElement | null = null;
	private comp = new Component();
	private entries: Entry[] = [];
	private scenes: Scene[] = [];
	private byKey = new Map<TAbstractFile, Entry>();
	private near = new Set<Element>();
	private io: IntersectionObserver;
	private ro: ResizeObserver;
	private heights = new WeakMap<Element, number>();
	private drift = 0;
	private scrolledAt = 0;
	private settleTimer = 0;
	private editable = false;
	private liveMax = Platform.isMobile ? 6 : 10;
	private raf = 0;
	private dead = false;
	private typed = new Map<TFile, string>();
	private typedTimer = 0;
	/** Where the page was scrolled to while it showed (a hidden tab's scroller forgets). */
	private lastTop = 0;
	/** The section the caret was last in, and where: back from another mode, the caret is there again. */
	/** Where the cursor last was: the note, and the selection's ends counted from where the note's text starts (its
	    properties above can grow or shrink while it's away). */
	private caret: { file: TFile; pos: number; anchor: number; body?: string } | null = null;
	private asked = 0;
	/** The section a restored place is measured from (see restore). */
	private pin: HTMLElement | null = null;
	private pinTimer = 0;

	constructor(container: HTMLElement, private ctx: ModeContext) {
		this.app = ctx.app;
		this.root = container.createDiv({ cls: 'binders-manuscript' });
		this.page = this.root.createDiv({ cls: 'binders-manuscript-page' });
		this.list = this.page.createDiv({ cls: 'binders-manuscript-list' });
	}

	render(): void {
		const { ctx } = this;
		this.editable = !ctx.readOnly && embedSupported(this.app, ctx.binder.note);
		this.root.toggleClass('is-readonly', !this.editable);
		// (a read-only binder says so above, once)
		if (!this.editable && !ctx.readOnly) this.notice('The manuscript can’t edit notes in this version of Obsidian, so it’s read only. Click a section to open its note.');
		ctx.owner.addChild(this.comp);
		this.io = new IntersectionObserver((changes) => {
			for (const c of changes) { if (c.isIntersecting) this.near.add(c.target); else this.near.delete(c.target); }
			this.schedule();
		}, { root: this.root, rootMargin: '150% 0px' });
		// Scroll anchoring, done here rather than by the browser (WebKit doesn't do it, and doing both overshoots): when a
		// section that starts above the viewport changes height (rendered, mounted, measured by its editor, an image
		// loaded), scroll by the same amount so what's on screen holds still. Not the one being typed in: there, text
		// below the caret moves, as in any editor.
		this.ro = new ResizeObserver((items) => {
			// in a tab that isn't showing, everything measures nothing: not a change to follow (and what was measured
			// before is what it will be again)
			if (!this.root.offsetParent) return;
			if (items.some((it) => it.target === this.root)) {
				// showing again: back where it was (the browser drops a hidden scroller's position)
				if (Math.abs(this.root.scrollTop - this.lastTop) > 1) this.root.scrollTop = this.lastTop;
				items = items.filter((it) => it.target !== this.root);
				if (!items.length) return;
			}
			const top = this.root.getBoundingClientRect().top, active = this.root.ownerDocument.activeElement;
			// in page order, so each section's top before this batch is its top now less the changes above it
			const changed = items.map((it) => ({ el: it.target as HTMLElement, r: it.target.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
			let d = 0, above = 0;
			for (const { el, r } of changed) {
				const old = this.heights.get(el);
				this.heights.set(el, r.height);
				if (old === undefined || !el.isConnected) continue;
				// (back at a remembered place, it's the section that was at the top that holds still, whatever is drawn
				// above it; otherwise, whatever starts above the window makes room without moving what's in it)
				const pin = this.pin?.isConnected ? this.pin : null;
				const over = pin ? el !== pin && !!(pin.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) : r.top - above < top - 0.5;
				if (over && !el.contains(active)) d += r.height - old;
				above += r.height - old;
			}
			// scrollTop is whole pixels: carry the rest, or fractions add up to a drift
			this.drift += d;
			const step = Math.round(this.drift);
			if (step) { this.root.scrollTop += step; this.drift -= step; }
		});
		this.comp.register(() => this.teardown());

		const c = this.comp, { vault, workspace } = this.app;
		c.registerDomEvent(this.root, 'keydown', (e) => this.onKey(e), { capture: true });
		this.ro.observe(this.root);
		c.registerDomEvent(this.root, 'scroll', () => { this.scrolledAt = performance.now(); if (this.root.offsetParent) this.lastTop = this.root.scrollTop; this.leaveBehind(); }, { passive: true });
		c.registerDomEvent(this.root, 'click', (e) => this.onClick(e));
		c.registerDomEvent(this.root, 'auxclick', (e) => { const s = this.sceneOf(e.target); if (e.button === 1 && s?.titleEl.contains(e.target as Node) && !s.renaming) { e.preventDefault(); void this.ctx.openFile(s.file, 'tab'); } });
		c.registerDomEvent(this.list, 'contextmenu', (e) => this.onMenu(e));
		// the caret's place is remembered as it moves, for coming back to
		c.registerDomEvent(this.root, 'focusout', (e) => this.keepCaret(e.target));
		// (a moment after the focus has gone, and before CodeMirror looks at it: not in the middle of the browser's own
		// change of focus, where the editor would measure itself over and over)
c.registerDomEvent(this.root, 'focusout', (e) => { const cm = this.sceneOf(e.target)?.live?.cm; if (cm) window.setTimeout(() => { if (!cm.hasFocus) this.letGo(cm); }, 0); });
		// the keyboard coming up over the page: the cursor is brought back above it
		const vv = this.root.win.visualViewport;
		if (vv) {
			const seen = () => { const at = this.sceneOf(this.root.ownerDocument.activeElement), cm = at?.live?.cm; if (at && cm?.hasFocus) this.follow(at, cm); };
// BISECT vv off
			c.register(() => vv.removeEventListener('resize', seen));
		}
		for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const) c.registerDomEvent(this.root, type, () => { this.pin = null; }, { passive: true });
		// a section is written down as soon as the cursor leaves it, not a moment later: whatever opens its note next (a
		// tab, another pane, a command) starts from what was typed, not from the file as it was before
		c.registerDomEvent(this.root, 'focusout', (e) => {
			const s = this.sceneOf(e.target), to = e.relatedTarget;
			if (!s?.live || (to instanceof Node && s.bodyEl.contains(to))) return;
			// (and under a filter, a section that no longer passes it goes once it's saved and left)
			const left = () => window.setTimeout(() => { if (!this.dead && this.ctx.filtering()) this.refresh(); });
			if (s.live.dirty) void s.live.flush().then(left, (err) => console.error('Binders: saving failed', err)); else left();
		});
		// Text dragged from one section into another moves, as it does within a section (each section is an editor of
		// its own, and an editor only takes its text back out when the drop is in itself: left alone, the words would
		// be in both notes). With the copy key held, it's a copy.
		let dragged: { from: Scene; cm: EditorView; ranges: { from: number; to: number }[]; doc: unknown } | null = null;
		c.registerDomEvent(this.root, 'dragstart', (e) => {
			const from = this.sceneOf(e.target), cm = from?.live?.cm;
			dragged = null;
			if (!from || !cm || !(e.target instanceof Node) || !cm.contentDOM.contains(e.target)) return;
			const ranges = cm.state.selection.ranges.filter((r) => !r.empty).map((r) => ({ from: r.from, to: r.to }));
			if (ranges.length) dragged = { from, cm, ranges, doc: cm.state.doc };
		}, { capture: true });
		c.registerDomEvent(this.root, 'dragend', () => { dragged = null; });
		c.registerDomEvent(this.root, 'drop', (e) => {
			const d = dragged, to = this.sceneOf(e.target);
			dragged = null;
			// (only a drop the other section's editor took, and only while the text it came from is as it was)
			if (!d || !to || to === d.from || !e.defaultPrevented || (Platform.isMacOS ? e.altKey : e.ctrlKey)) return;
			if (d.from.live?.cm !== d.cm || d.cm.state.doc !== d.doc) return;
			d.cm.dispatch({ changes: d.ranges.map((r) => ({ from: r.from, to: r.to })), userEvent: 'delete.drag' });
		});
		// the cursor put somewhere by hand (or taken away by hand) isn't one that was left behind
		c.registerDomEvent(this.root, 'focusout', () => { if (!this.leaving) this.left = null; });
		c.registerDomEvent(this.root, 'focusin', () => { this.left = null; });
		c.registerDomEvent(this.root.ownerDocument, 'keydown', (e) => this.onStrayKey(e), { capture: true });
		c.registerEvent(vault.on('modify', (f) => this.onModify(f)));
		// Quitting doesn't unload views or embeds, and Obsidian's own quit handler only saves real views: save ours
		c.registerEvent(workspace.on('quit', (tasks) => { for (const s of this.scenes) if (s.live?.dirty) tasks.addPromise(s.live.flush()); }));
		// Obsidian may put an editor back in source mode when the vault's live preview setting changes
		const keepLp = () => { for (const s of this.scenes) s.live?.keepLivePreview(); };
		c.registerEvent((vault as Events).on('config-changed', keepLp));
		c.registerEvent(workspace.on('css-change', keepLp));
		// unmounts sections whose save was pending when they scrolled away, and catches anything missed
		c.registerInterval(window.setInterval(() => this.schedule(), 2000));
		this.sync();
	}

	refresh(): void {
		if (this.dead) return;
		this.anchored(() => this.sync());
		this.schedule();
	}

	unload(): void {
		if (this.dead) return;
		this.ctx.owner.removeChild(this.comp); // unloads every live editor, which writes its pending typing first
		this.teardown();
		this.root.remove();
	}

	/** The caret goes back where it last was here, or to the start of the first section in sight. (Not on a phone or
	    tablet: there a caret brings up the keyboard.) */
	focus(): void {
		if (!this.editable || Platform.isMobile) return;
		// never by scrolling: the page is where the reader left it, and the caret goes to what's in sight
		const view = this.root.getBoundingClientRect(), seen = (x: Scene) => { const r = x.bodyEl.getBoundingClientRect(); return r.bottom > view.top + 8 && r.top < view.bottom - 8; };
		const was = this.caret && this.byKey.get(this.caret.file);
		if (was?.kind === 'scene' && this.caret && seen(was)) { void this.focusScene(was, 'caret', undefined, false); return; }
		// (a section that starts in sight, if there is one: one that starts above is still settling its height as its
		// editor loads, and with the cursor in it the page would move by that much)
		const s = this.scenes.find((x) => seen(x) && x.bodyEl.getBoundingClientRect().top >= view.top) ?? this.scenes.find(seen);
		if (!s) return;
		const r = s.bodyEl.getBoundingClientRect();
		void this.focusScene(s, r.top >= view.top ? 'start' : { x: r.left + 1, y: view.top + 32 }, undefined, false);
	}

	place(): unknown {
		const a = this.entries.length ? this.anchor() : null, e = a ? this.entries.find((x) => x.el === a) : null;
		this.keepCaret(this.root.ownerDocument.activeElement);
		return {
			path: e?.key.path ?? null, offset: a ? Math.round(this.root.getBoundingClientRect().top - a.getBoundingClientRect().top) : 0,
			caret: this.caret ? { path: this.caret.file.path, pos: this.caret.pos, anchor: this.caret.anchor, rel: true } : null,
		};
	}

	restore(place: unknown): void {
		const p = (place ?? {}) as { path?: unknown; offset?: unknown; caret?: { path?: unknown; pos?: unknown; anchor?: unknown; rel?: unknown } | null };
		const e = typeof p.path === 'string' ? this.entries.find((x) => x.key.path === p.path) : null;
		if (e) {
			// the section that was at the top is there again (sections above it are still guesses at their height: as
			// they're drawn, the anchoring above holds this one still)
			this.root.scrollTop += e.el.getBoundingClientRect().top - this.root.getBoundingClientRect().top + (typeof p.offset === 'number' ? p.offset : 0);
			this.lastTop = this.root.scrollTop;
			// (every section's height as it is now is what later changes are measured from: one that's drawn before
			// its first measurement comes in would otherwise move the page by the difference)
			for (const x of this.entries) this.heights.set(x.el, x.el.getBoundingClientRect().height);
			// and it's this section that stays put while the page around it is drawn, until the reader moves the page
			this.pin = e.el;
			window.clearTimeout(this.pinTimer);
			this.pinTimer = window.setTimeout(() => { this.pin = null; }, 4000);
		}
		const c = p.caret, f = c && typeof c.path === 'string' ? this.app.vault.getAbstractFileByPath(c.path) : null;
		// (a place kept by an earlier version counted from the top of the file: its cursor isn't used)
		this.caret = f instanceof TFile && c && c.rel === true && typeof c.pos === 'number' ? { file: f, pos: c.pos, anchor: typeof c.anchor === 'number' ? c.anchor : c.pos } : null;
	}

	/** The folder's synopsis is the page's first lines. */
	adopt(header: HTMLElement): void { this.page.insertBefore(header, this.list); }

	reveal(item: TAbstractFile, fresh = false): void {
		const e = this.byKey.get(item) ?? (this.sync(), this.byKey.get(item));
		if (!e) return;
		e.el.scrollIntoView({ block: 'nearest' });
		// (its title clear of the bar of buttons a phone lays over the foot of the page)
		const head = e.kind === 'scene' ? e.titleEl : e.el, r = head.getBoundingClientRect(), bottom = visibleBottom(this.root) - 8;
		if (r.bottom > bottom) this.root.scrollTop += Math.min(r.bottom - bottom + this.root.clientHeight / 3, r.top - this.root.getBoundingClientRect().top - 8);
		// (a folder just made has its name ready to type over, as on the corkboard)
		if (e.kind === 'heading') { if (fresh && !this.ctx.readOnly) this.renameHeading(e); return; }
		if (e.kind !== 'scene') return;
		// (the cursor where it was in that section, if it was there before; else at its start)
		if (fresh && this.editable) this.rename(e); else if (this.editable && !Platform.isMobile) void this.focusScene(e, this.caret?.file === e.file ? 'caret' : 'start');
	}

	async save(files?: TFile[]): Promise<void> {
		await Promise.all(this.scenes.filter((s) => s.live?.dirty && (!files || files.includes(s.file))).map((s) => s.live?.flush()));
	}

	current(): TAbstractFile | null {
		return (this.sceneOf(this.root.ownerDocument.activeElement) ?? null)?.file ?? this.caret?.file ?? null;
	}

	// focus mode >>>
	editor(): EditorView | null { return this.sceneOf(this.root.ownerDocument.activeElement)?.live?.cm ?? null; }

	/** The cursor goes to the section before or after the one it's in (or was last in): at that one's start, going
	    on; at its end, going back. */
	stepScene(delta: number, checking: boolean): boolean {
		const at = this.sceneOf(this.root.ownerDocument.activeElement) ?? (this.caret ? this.byKey.get(this.caret.file) : null);
		const i = at?.kind === 'scene' ? this.scenes.indexOf(at) : -1, to = i < 0 ? null : this.scenes[i + delta];
		if (!this.editable || !to || to.broken) return false;
		if (!checking) void this.focusScene(to, delta > 0 ? 'start' : 'end');
		return true;
	}
	// <<< focus mode

	newMenu(menu: Menu): void {
		menu.addItem((i) => i.setSection('new').setTitle('New note').setIcon('file-plus').onClick(() => this.create('note')));
	}

	/** A new note after the section the caret is in (or last), its title ready to be typed. */
	create(kind: 'note' | 'folder'): void {
		if (kind !== 'note') return;
		// after the note the cursor is in, or was last in (which a filter may have taken off the page since)
		const f = this.sceneOf(this.root.ownerDocument.activeElement)?.file ?? this.caret?.file ?? null;
		const inBinder = !!f?.parent && this.ctx.app.vault.getAbstractFileByPath(f.path) === f && (f.parent === this.ctx.folder || f.parent.path.startsWith(this.ctx.folder.path + '/'));
		const folder = inBinder && f?.parent ? f.parent : this.ctx.folder;
		const index = inBinder && f ? (this.ctx.store.orderedChildren(folder) ?? []).indexOf(f) + 1 : Infinity;
		void this.ctx.store.newScene(folder, index || Infinity).then((file) => { this.ctx.made(file); this.anchored(() => this.sync()); this.reveal(file, true); }, (e) => new Notice(plain(e)));
	}

	/** The page was scrolled far from the section with the cursor (more than a screen and a half past it): its editor
	    lets go of the focus, since one kept that far out of sight can't draw its cursor and keeps trying ("Measure loop
	    restarted"); once saved it goes back to plain text like any other. The cursor isn't lost: where it was is kept
	    (`left`, `caret`), and the next key typed, or scrolling back to the section, puts it back there, as typing in a
	    note scrolled away from its cursor goes back to it. */
	/** An editor that's losing the focus has its cursor made a plain one. A cursor at the start or end of a wrapped line
	    remembers which side of the wrap it's on, and CodeMirror, putting that right a moment after any change of focus,
	    sets the browser's selection inside the editor again, which takes the focus back: the next tap elsewhere (another
	    section, a title, a dialog's field) would leave the cursor here, and what's typed would go into this note. With
	    every section an editor of its own, that isn't a rare thing here as it is between two panes. */
	private letGo(cm: EditorView | null | undefined): void {
		const m = cm?.state.selection.main;
		if (cm && m?.empty && m.assoc) cm.dispatch({ selection: { anchor: m.head } });
	}

	private leaveBehind(): void {
		const doc = this.root.ownerDocument, active = doc.activeElement;
		if (this.left) {
			// scrolled back to it, with nothing else in focus since: the cursor shows again
			const s = this.byKey.get(this.left);
			if (s?.kind !== 'scene') { this.left = null; return; }
			if (active !== doc.body) return;
			const view = this.root.getBoundingClientRect(), r = s.bodyEl.getBoundingClientRect();
			// (not on a phone or tablet: a cursor there brings the keyboard up over what's being read; a tap brings it back)
			if (r.bottom > view.top && r.top < view.bottom && !Platform.isMobile) this.comeBack(false);
			return;
		}
		if (!active?.instanceOf(HTMLElement) || !active.matches('.cm-content')) return;
		const s = this.sceneOf(active);
		if (!s) return;
		const view = this.root.getBoundingClientRect(), r = s.el.getBoundingClientRect(), far = view.height * 1.5;
		if (r.bottom > view.top - far && r.top < view.bottom + far) return;
		this.keepCaret(active);
		this.leaving = true;
		try { active.blur(); } finally { this.leaving = false; }
		this.left = s.file;
	}

	/** The section whose editor let go of the focus when the page was scrolled far from it. */
	private left: TFile | null = null;
	private leaving = false;

	/** The cursor goes back to the section it was left in (`show`: and the page with it); its editor is loaded again if
	    it has gone meanwhile. Keys pressed while that happens (`strays`) are then given to it, in order. */
	private comeBack(show: boolean): void {
		const s = this.left ? this.byKey.get(this.left) : null;
		this.left = null;
		if (this.coming != null) return;
		// (the section has gone, deleted or filtered away: its keys go with it, not into the next section typed in)
		if (!s || s.kind !== 'scene') { this.strays = []; return; }
		s.live?.cm?.focus(); // now, if it's there, so a key being pressed goes to it
		this.coming = this.focusScene(s, 'caret', undefined, show).then(() => {
			const cm = s.live?.cm;
			if (cm) this.replay(cm, this.strays);
		}).finally(() => { this.coming = null; this.strays = []; });
	}
	private coming: Promise<void> | null = null;
	private strays: StrayKey[] = [];

	/** Gives an editor the keys that were pressed before it had the focus: text as text, and anything else (Enter,
	    Backspace, an arrow, undo; every key, with Vim's own keys on) as the key it was, for the editor to act on. */
	private replay(cm: EditorView, keys: StrayKey[]): void {
		const vim = vimMode(this.app);
		for (const k of keys) {
			if (k.key.length === 1 && !k.ctrlKey && !k.metaKey && !k.altKey && !vim) cm.dispatch(cm.state.replaceSelection(k.key), { scrollIntoView: true, userEvent: 'input.type' });
			else cm.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { ...k, bubbles: true, cancelable: true }));
		}
	}

	/** A key pressed with the cursor left behind (and nothing else in focus) goes to it: kept from the page (where it
	    would do nothing, or the wrong thing) and given to the section's editor once the cursor is back in it. */
	private onStrayKey(e: KeyboardEvent): void {
		const doc = this.root.ownerDocument;
		if ((!this.left && this.coming == null) || doc.activeElement !== doc.body || ['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'Tab', 'CapsLock'].includes(e.key) || /^F\d+$/.test(e.key) || e.isComposing) return;
		// (only for the binder view that's in use, not one in another pane)
		if ((this.app.workspace.getMostRecentLeaf()?.view as unknown) !== this.ctx.owner || doc.querySelector('.modal-container, .menu, .suggestion-container, .prompt')) return;
		const here = this.left ? this.byKey.get(this.left) : null;
		if (this.left && here?.kind !== 'scene') { this.left = null; this.strays = []; return; }
		// cut, copy and paste are the browser's to do, on whatever has the focus by then
		const clipboard = (e.ctrlKey || e.metaKey) && !e.altKey && ['v', 'x', 'c'].includes(e.key.toLowerCase());
		if (!clipboard) {
			e.preventDefault();
			e.stopPropagation();
			this.strays.push({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey });
		}
		if (this.left) this.comeBack(true);
	}

	private keepCaret(target: EventTarget | null): void {
		const s = this.sceneOf(target), cm = s?.live?.cm;
		if (!s || !cm || !(target instanceof Node) || !cm.dom.contains(target)) return;
		const text = cm.state.doc.toString(), start = bodyStart(text), sel = cm.state.selection.main;
		// (with the text it was in: if the note is changed while its editor is away, the cursor is put where that text went)
		this.caret = { file: s.file, pos: sel.head - start, anchor: sel.anchor - start, body: text.slice(start) };
	}

	// ---- building the page ----

	/** Headings and scenes of the folder, depth first, in binder order. */
	private wanted(): { key: TFile | TFolder; depth: number }[] {
		const out: { key: TFile | TFolder; depth: number }[] = [];
		// with a filter on, only the notes that pass, under the folders that have any; a section being typed in stays
		// whatever its status has become, till the typing is saved and the cursor has left it
		const filtering = this.ctx.filtering();
		const shown = (f: TFile) => { if (!filtering || this.ctx.visible(f)) return true; const e = this.byKey.get(f); return e?.kind === 'scene' && this.busy(e); };
		const walk = (f: TFolder, depth: number) => {
			for (const c of this.ctx.store.orderedChildren(f) ?? []) {
				if (c instanceof TFolder) { if (filtering && !this.ctx.store.scenes(c).some(shown)) continue; out.push({ key: c, depth: depth + 1 }); walk(c, depth + 1); }
				else if (c instanceof TFile && c.extension === 'md' && shown(c)) out.push({ key: c, depth });
			}
		};
		walk(this.ctx.folder, 0);
		return out;
	}

	/** Reconciles the sections with the binder, in place: live editors are kept, never remounted, and the focused one
	    is never moved in the DOM (moving it would blur it). */
	private sync(): void {
		const next: Entry[] = [];
		const keep = new Set<Entry>();
		for (const w of this.wanted()) {
			let e = this.byKey.get(w.key);
			if (!e) e = w.key instanceof TFile ? this.makeScene(w.key) : this.makeHeading(w.key, w.depth);
			if (e.kind === 'heading') this.updateHeading(e, w.depth);
			else if (!e.renaming) e.titleEl.setText(e.file.basename);
			if (keep.has(e)) continue;
			keep.add(e);
			next.push(e);
		}
		for (const e of this.entries) if (!keep.has(e)) this.drop(e);
		this.byKey = new Map(next.map((e) => [e.key, e]));
		this.entries = next;
		this.scenes = next.filter((e): e is Scene => e.kind === 'scene');
		this.order(next);
		// (said again when the reason changes: nothing here, or nothing that passes the filter)
		const why = String(this.ctx.filtering());
		if (this.emptyEl && (next.length || this.emptyEl.dataset.for !== why)) { this.emptyEl.remove(); this.emptyEl = null; }
		if (!next.length && !this.emptyEl) { this.emptyEl = emptyState(this.ctx, this.page); this.emptyEl.dataset.for = why; }
		this.schedule();
	}

	/** Puts the elements in order, moving as few as possible and never the focused section. */
	private order(next: Entry[]): void {
		const els = next.map((e) => e.el);
		for (const el of els) if (el.parentElement !== this.list) this.list.appendChild(el);
		if (!els.length) return;
		const active = this.root.ownerDocument.activeElement;
		let pivot = els.findIndex((el) => el.contains(active));
		if (pivot < 0) pivot = 0;
		for (let i = pivot - 1; i >= 0; i--) if (els[i].nextElementSibling !== els[i + 1]) this.list.insertBefore(els[i], els[i + 1]);
		for (let i = pivot + 1; i < els.length; i++) if (els[i].previousElementSibling !== els[i - 1]) els[i - 1].after(els[i]);
	}

	private makeHeading(folder: TFolder, depth: number): Heading {
		const el = createDiv({ cls: 'binders-manuscript-heading markdown-rendered' });
		const h: Heading = { kind: 'heading', key: folder, el, textEl: el, depth: -1 };
		this.updateHeading(h, depth);
		// a folder's heading goes into the folder, as its heading on the corkboard does
		const go = (e: MouseEvent | KeyboardEvent) => this.ctx.navigate(folder, Keymap.isModEvent(e));
		this.comp.registerDomEvent(el, 'click', (e) => { if (!h.renaming && (e.target as HTMLElement).closest('h1, h2, h3, h4, h5, h6')) { e.stopPropagation(); go(e); } });
		this.comp.registerDomEvent(el, 'auxclick', (e) => { if (e.button === 1) { e.preventDefault(); this.ctx.navigate(folder, 'tab'); } });
		this.comp.registerDomEvent(el, 'keydown', (e) => {
			if (h.renaming) return;
			if (e.key === 'Enter') { e.preventDefault(); go(e); }
			else if (e.key === 'F2' && !this.ctx.readOnly) { e.preventDefault(); this.renameHeading(h); }
		});
		this.comp.registerDomEvent(el, 'contextmenu', (e) => {
			if (h.renaming) return;
			e.preventDefault(); e.stopPropagation();
			const menu = new Menu(), note = this.ctx.store.folderNote(folder);
			menu.addItem((i) => i.setSection('open').setTitle('Open').setIcon('layout-grid').onClick(() => this.ctx.navigate(folder)));
			menu.addItem((i) => i.setSection('open').setTitle('Open in new tab').setIcon('file-plus').onClick(() => this.ctx.navigate(folder, 'tab')));
			if (note) menu.addItem((i) => i.setSection('open').setTitle('Open folder note').setIcon('file-text').onClick(() => void this.ctx.openFile(note, false)));
			if (!this.ctx.readOnly && this.ctx.binder.kind !== 'longform') menu.addItem((i) => i.setSection('action').setTitle('Rename').setIcon('pencil').onClick(() => this.renameHeading(h)));
			menu.showAtMouseEvent(e);
		});
		return h;
	}

	/** A folder's name typed over where it stands, as a section's title is. */
	private renameHeading(h: Heading): void {
		if (h.renaming || this.ctx.readOnly) return;
		const el = h.textEl, doc = this.root.ownerDocument;
		h.renaming = true;
		this.asked++;
		el.contentEditable = 'plaintext-only';
		// (as a note's own title asks a phone's keyboard)
		el.setAttrs({ enterkeyhint: 'done', autocapitalize: 'on', spellcheck: 'true' });
		el.addClass('is-renaming');
		el.focus();
		const range = doc.createRange();
		range.selectNodeContents(el);
		const sel = doc.getSelection();
		sel?.removeAllRanges(); sel?.addRange(range);
		const done = async (commit: boolean, leaving: boolean) => {
			const name = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
			if (commit && name && name !== h.key.name && !this.dead) {
				try { await renameItem(this.ctx, h.key, name); } catch (e) {
					new Notice(plain(e));
					// what was typed is there to be changed (unless the heading was left for something else)
					if (!leaving) return;
				}
			}
			el.removeEventListener('keydown', key);
			el.removeEventListener('blur', blur);
			el.contentEditable = 'false';
			el.removeClass('is-renaming');
			h.renaming = false;
			el.setText(h.key.name);
			if (!leaving && !this.dead && el.isConnected) el.focus();
		};
		const key = (e: KeyboardEvent) => {
			e.stopPropagation();
			if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void done(true, false); }
			else if (e.key === 'Escape') { e.preventDefault(); void done(false, false); }
		};
		const blur = (): void => { void done(true, true); };
		el.addEventListener('keydown', key);
		el.addEventListener('blur', blur);
	}

	private updateHeading(h: Heading, depth: number): void {
		if (h.renaming) return; // (a name being typed stays as typed)
		if (h.depth !== depth) {
			h.depth = depth;
			h.el.empty();
			h.textEl = h.el.createEl(`h${Math.min(depth, 6)}` as 'h1', { attr: { tabindex: '0', role: 'link' } });
			h.el.dataset.depth = String(depth);
		}
		h.textEl.setText(h.key.name);
	}

	private makeScene(file: TFile): Scene {
		const el = createDiv({ cls: 'binders-manuscript-scene' });
		const head = el.createDiv({ cls: 'binders-manuscript-break' });
		const titleEl = head.createDiv({ cls: 'binders-manuscript-title', text: file.basename, attr: { tabindex: '0', role: 'link' } });
		const bodyEl = el.createDiv({ cls: 'binders-manuscript-body' });
		// a guess at its height until it's rendered, so the page is about the right length from the start
		bodyEl.setCssStyles({ minHeight: `${Math.min(4000, 24 + Math.ceil(file.stat.size / 80) * 26)}px` });
		const s: Scene = { kind: 'scene', key: file, file, el, titleEl, bodyEl, live: null, mounting: null, shown: null, rendering: false, renderComp: null, token: 0, broken: false, renaming: false, saved: Promise.resolve() };
		this.comp.registerDomEvent(titleEl, 'keydown', (e) => {
			if (s.renaming) return;
			if (e.key === 'Enter') { e.preventDefault(); void this.ctx.openFile(file, Keymap.isModEvent(e)); }
			else if (e.key === 'F2' && this.editable) { e.preventDefault(); e.stopPropagation(); this.rename(s); }
		});
		this.io.observe(el);
		this.ro.observe(el);
		return s;
	}

	private drop(e: Entry): void {
		if (e.kind === 'scene') {
			e.token++;
			if (e.live) { void e.live.destroy(); e.live = null; }
			if (e.renderComp) this.comp.removeChild(e.renderComp);
			this.io.unobserve(e.el);
			this.ro.unobserve(e.el);
			this.near.delete(e.el);
			this.typed.delete(e.file);
			if (this.left === e.file) { this.left = null; this.strays = []; }
		}
		e.el.remove();
	}

	private notice(text: string): void {
		const bar = createDiv({ cls: 'binders-manuscript-notice', attr: { role: 'status' } });
		this.page.prepend(bar);
		setIcon(bar.createDiv({ cls: 'binders-manuscript-notice-icon' }), 'info');
		bar.createDiv({ text });
	}

	// ---- live editors and placeholders ----

	private schedule(): void {
		if (this.dead || this.raf) return;
		this.raf = window.requestAnimationFrame(() => { this.raf = 0; this.pump(); });
	}

	/** One step towards: rendered placeholders near the viewport, live editors on the closest few. Mounts one editor
	    per frame so scrolling stays smooth. */
	private pump(): void {
		if (this.dead) return;
		const top = this.root.getBoundingClientRect(), mid = (top.top + top.bottom) / 2;
		const dist = (s: Scene) => { const r = s.el.getBoundingClientRect(); return r.bottom < top.top ? top.top - r.bottom : r.top > top.bottom ? r.top - top.bottom : Math.abs((r.top + r.bottom) / 2 - mid) / 1e4; };
		const near = this.scenes.filter((s) => this.near.has(s.el)).map((s) => [s, dist(s)] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
		// a couple of renders per frame, closest first, so fast scrolling stays smooth
		const toRender = near.filter((s) => !s.live && s.mounting === null && !s.rendering && s.shown === null);
		for (const s of toRender.slice(0, 2)) void this.renderPlaceholder(s);
		if (toRender.length > 2) this.schedule();
		if (!this.editable) return;
		// editors are mounted and unmounted once scrolling pauses: each costs a frame or two
		const still = performance.now() - this.scrolledAt;
		if (still < SETTLE) { window.clearTimeout(this.settleTimer); this.settleTimer = window.setTimeout(() => this.schedule(), SETTLE - still); return; }
		const want = new Set(near.filter((s) => !s.broken).slice(0, this.liveMax));
		for (const s of this.scenes) if (s.live && !want.has(s) && !this.busy(s)) this.unmount(s);
		if (this.scenes.some((s) => s.mounting !== null)) return;
		const next = [...want].find((s) => !s.live);
		if (next) void this.mount(next).then(() => this.schedule());
	}

	/** Never unmount the section being typed in, or one whose typing isn't saved yet. */
	private busy(s: Scene): boolean {
		return !!s.live && (s.live.dirty || s.el.contains(this.root.ownerDocument.activeElement) || s.renaming);
	}

	private mount(s: Scene): Promise<void> {
		if (s.live || !this.editable || s.broken) return Promise.resolve();
		if (s.mounting !== null) return s.mounting;
		const host = s.bodyEl.createDiv({ cls: 'binders-manuscript-editor is-mounting' });
		s.mounting = (async () => {
			try {
				await s.saved;
				const live = await mountEditor(this.app, host, s.file, this.comp, { onChange: (text) => this.onTyping(s, text), onCaret: (cm, pos) => this.showCaret(s, caretRect(cm, pos), 'start') });
				if (this.dead || this.byKey.get(s.file) !== s) { void live.destroy(); host.remove(); return; }
				s.token++; // a render still in flight is stale now
				for (const c of Array.from(s.bodyEl.children)) if (c !== host) c.remove();
				if (s.renderComp) { this.comp.removeChild(s.renderComp); s.renderComp = null; }
				host.removeClass('is-mounting');
				s.bodyEl.setCssStyles({ minHeight: '' });
				s.live = live;
				s.shown = null;
			} catch (e) {
				host.remove();
				if (this.dead || this.byKey.get(s.file) !== s) return; // closed while it was opening
				console.error(`Binders: couldn't open “${s.file.path}” for editing in the manuscript`, e);
				s.broken = true;
			} finally {
				s.mounting = null;
			}
		})();
		return s.mounting;
	}

	private unmount(s: Scene): void {
		const live = s.live;
		if (!live) return;
		const h = s.bodyEl.offsetHeight, text = live.text;
		s.live = null;
		s.saved = live.destroy(); // saves anything pending, keeps undo history for a remount
		s.bodyEl.empty();
		if (h) s.bodyEl.setCssStyles({ minHeight: `${h}px` });
		s.shown = null;
		// render what the editor had, not the file: its last save may still be on the way to disk
		void this.renderPlaceholder(s, text);
	}

	private async renderPlaceholder(s: Scene, text?: string): Promise<void> {
		const token = ++s.token;
		s.rendering = true;
		try {
			const raw = text ?? await this.app.vault.cachedRead(s.file);
			const stale = () => token !== s.token || !!s.live || s.mounting !== null || this.dead;
			if (stale()) return;
			const body = raw.slice(bodyStart(raw));
			const comp = new Component();
			this.comp.addChild(comp);
			const el = createDiv({ cls: 'binders-manuscript-rendered markdown-rendered' });
			el.toggleClass('has-last-line', /\n$/.test(body));
			await MarkdownRenderer.render(this.app, body, el, s.file.path, comp);
			if (stale()) { this.comp.removeChild(comp); return; }
			this.space(el, s.file, raw);
			if (s.renderComp) this.comp.removeChild(s.renderComp);
			s.renderComp = comp;
			s.bodyEl.empty();
			s.bodyEl.appendChild(el);
			s.bodyEl.setCssStyles({ minHeight: '' });
			s.shown = body;
		} finally {
			if (token === s.token) s.rendering = false;
		}
	}

	/** An outside change to a note that's shown rendered: render it again (now if it's near, else when it comes near). */
	private onModify(f: TAbstractFile): void {
		const s = this.byKey.get(f);
		if (!s || s.kind !== 'scene' || s.live || s.mounting !== null) return;
		s.shown = null;
		s.token++;
		s.rendering = false;
		this.schedule();
	}

	private onTyping(s: Scene, text: string): void {
		if (!this.ctx.onTextChange) return;
		this.typed.set(s.file, text);
		if (this.typedTimer) return;
		this.typedTimer = window.setTimeout(() => this.reportTyping(), 250);
	}

	private reportTyping(): void {
		window.clearTimeout(this.typedTimer);
		this.typedTimer = 0;
		const typed = [...this.typed];
		this.typed.clear();
		for (const [file, text] of typed) this.ctx.onTextChange?.(file, text);
	}

	// ---- moving around ----

	/** Puts the cursor in a section: at the start of its body, at its end, at a place in its text, or at a point on
	    screen. `x` keeps the column when arrowing between sections. The page scrolls so the cursor shows (`show`). */
	private async focusScene(s: Scene, where: 'start' | 'end' | 'caret' | number | { x: number; y: number }, x?: number, show = true): Promise<void> {
		// a section whose editor has gone (an Obsidian update changing how embeds behave) gets a new one
		if (s.live && !s.live.cm && !s.live.editor) this.unmount(s);
		const loaded = !!s.live?.cm, mine = ++this.asked;
		await this.mount(s);
		const live = s.live, cm = live?.cm;
		// (asked for somewhere else meanwhile, or a title is being typed: the later one has the keyboard)
		if (!live || mine !== this.asked) return;
		if (!cm) { live.editor?.focus(); return; }
		const doc = cm.state.doc, start = bodyStart(doc.toString());
		const clamp = (p: number) => Math.max(start, Math.min(doc.length, p));
		if (where === 'caret') {
			// back where the cursor was. An editor that stayed loaded has kept its own selection, moved along with every
			// change to the note since: that's the one. One loaded again gets the selection that was remembered.
			const c = this.caret?.file === s.file ? this.caret : null;
			cm.focus();
			if (!loaded) {
				const now = doc.sliceString(start), at = (p: number) => clamp(start + (c?.body != null ? moved(c.body, now, p) : p));
				cm.dispatch({ selection: c ? { anchor: at(c.anchor), head: at(c.pos) } : { anchor: doc.length } });
			}
			const sel = cm.state.selection.main;
			this.caret = { file: s.file, pos: sel.head - start, anchor: sel.anchor - start };
			if (show) { this.showCaret(s, cm.coordsAtPos(sel.head), 'start'); this.follow(s, cm, 'start'); }
			return;
		}
		let pos = where === 'start' ? start : where === 'end' ? doc.length : typeof where === 'number' ? clamp(where) : clamp(cm.posAtCoords(where, false));
		if (x != null && typeof where === 'string') {
			const c = cm.coordsAtPos(pos);
			const p = c && cm.posAtCoords({ x, y: (c.top + c.bottom) / 2 }, false);
			if (p != null) pos = clamp(p);
		}
		cm.focus();
		// (the page is scrolled here, not by the editor: asked to scroll to a cursor in a section it hasn't measured, it
		// either does nothing or keeps measuring)
		cm.dispatch({ selection: { anchor: pos } });
		this.caret = { file: s.file, pos: pos - start, anchor: pos - start };
		if (!show) return;
		const fallback = where === 'end' ? 'end' : 'start';
		this.showCaret(s, cm.coordsAtPos(pos), fallback);
		// and once the editor has measured itself, exactly
		this.follow(s, cm, fallback);
	}

	/** Spaces a rendered section as its editor will: every blank line of the note is a line there, so each block
	    stands as many lines below the one before as the note has between them (and a comment, which the editor shows
	    and this doesn't, takes its lines). Where the note's blocks are comes from Obsidian's index of it; if that
	    doesn't fit what was rendered (the index is behind, or a plugin drew a block its own way), the spacing is left
	    to the style sheet: a blank line between blocks. */
	private space(el: HTMLElement, file: TFile, raw: string): void {
		const secs = this.app.metadataCache.getFileCache(file)?.sections?.filter((x) => x.type !== 'yaml');
		if (!secs) return;
		const kids = (Array.from(el.children) as HTMLElement[]).filter((c) => !c.matches('.footnotes'));
		const lines = (t: string) => t.split('\n').length - 1;
		const TAGS: Record<string, string> = { paragraph: 'p', heading: 'h1, h2, h3, h4, h5, h6', list: 'ul, ol', code: 'pre', table: 'table', blockquote: 'blockquote', callout: '.callout', thematicBreak: 'hr', math: '*' };
		const gaps: number[] = [];
		let at = bodyStart(raw), first = true, held = 0;
		for (const sec of secs) {
			const from = sec.position.start.offset, to = sec.position.end.offset, between = raw.slice(at, from);
			if (from < at || to > raw.length || between.trim()) return;
			// (after a block, the first line break only ends its last line)
			const blank = first ? lines(between) : Math.max(0, lines(between) - 1);
			const src = raw.slice(from, to), hidden = sec.type === 'comment' || sec.type === 'footnoteDefinition' || (sec.type === 'html' && /^<!--[\s\S]*-->$/.test(src.trim()));
			if (hidden) held += blank + lines(src) + 1;
			else {
				const kid = kids[gaps.length], tag = TAGS[sec.type];
				if (!kid || !tag || !kid.matches(tag)) return;
				gaps.push(held + blank);
				held = 0;
			}
			at = to; first = false;
		}
		if (gaps.length !== kids.length || raw.slice(at).trim()) return;
		kids.forEach((k, i) => k.setCssProps({ '--binders-gap': String(gaps[i]) }));
		el.setCssProps({ '--binders-tail': String(held + lines(raw.slice(at))) });
		el.addClass('is-spaced');
	}

	/** The page follows the cursor: once the editor has drawn, it's scrolled so the cursor is in sight. */
	private follow(s: Scene, cm: EditorView, fallback: 'start' | 'end' = 'start'): void {
		// on the next frame, once the editor has measured itself: scrolling the page while it measures makes it start
		// over ("Measure loop restarted"), since what it draws depends on which part of it is in the window
		const win = this.root.win;
		win.cancelAnimationFrame(this.following);
		this.following = win.requestAnimationFrame(() => {
			if (this.dead || s.live?.cm !== cm || !cm.hasFocus) return;
			this.showCaret(s, cm.coordsAtPos(cm.state.selection.main.head), fallback);
		});
	}
	private following = 0;

	/** Scrolls the page so the cursor is in sight, a couple of lines clear of the edge. CodeMirror does this for an
	    editor that's on screen; one that's wholly off it isn't measured, and its cursor would stay out of sight. */
	private showCaret(s: Scene, c: { top: number; bottom: number } | null, fallback: 'start' | 'end'): void {
		const r = this.root.getBoundingClientRect(), body = s.bodyEl.getBoundingClientRect();
		// (what can be seen of the page: on a phone the keyboard may lie over its foot without making it any shorter)
		const view = { top: r.top, bottom: r.bottom };
		const line = c ? c.bottom - c.top : 24, pad = Math.min((view.bottom - view.top) / 4, line * 2);
		const top = c?.top ?? (fallback === 'end' ? body.bottom - line : body.top), bottom = c?.bottom ?? top + line;
		// focus mode >>> typewriter scrolling: with the cursor on the last line of its section, that line is held at one
		// height and the page moves under it (here, where the manuscript moves its page anyway); anywhere else, as below
		const cm = s.live?.cm, held = cm ? this.ctx.plugin.focus?.line(this.root, cm) : null;
		if (held != null) { this.ctx.plugin.focus.glide(this.root, top - held); return; }
		// <<< focus mode
		if (top < view.top + pad) this.root.scrollTop -= view.top + pad - top;
		else if (bottom > view.bottom - pad) this.root.scrollTop += bottom - (view.bottom - pad);
	}

	/** The section at a height on screen: the one there, or the nearest one. */
	private sceneAt(y: number): Scene | null {
		let best: Scene | null = null, dist = Infinity;
		for (const s of this.scenes) {
			const r = s.el.getBoundingClientRect(), d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
			if (d < dist) { dist = d; best = s; }
			if (r.top > y) break;
		}
		return best;
	}

	/** Keys that cross sections, so the manuscript reads as one page: ArrowDown on the last line of a section goes on
	    into the next one, ArrowUp on the first into the previous; Page Up and Page Down move the cursor a screen, through
	    as many sections as that takes; Mod+Home and Mod+End go to the start and end of the whole manuscript; F2 renames
	    the section the cursor is in. */
	private onKey(evt: KeyboardEvent): void {
		if (evt.defaultPrevented || evt.isComposing) return;
		const s = this.sceneOf(evt.target);
		const cm = s?.live?.cm;
		if (!s || !cm || !cm.contentDOM.contains(evt.target as Node)) return;
		const mod = evt.ctrlKey || evt.metaKey, taken = () => { evt.preventDefault(); evt.stopPropagation(); };
		if (evt.key === 'F2' && !mod && !evt.altKey && !evt.shiftKey) { taken(); this.rename(s); return; }
		// a suggestion popup (links, tags) is using the keys
		if (this.root.ownerDocument.body.querySelector(':scope > .suggestion-container')) return;
		const sel = cm.state.selection.main;
		if ((evt.key === 'Home' || evt.key === 'End') && mod && !evt.altKey && !evt.shiftKey) {
			const to = evt.key === 'Home' ? this.scenes[0] : this.scenes[this.scenes.length - 1];
			if (!to || to.broken) return;
			taken();
			void this.focusScene(to, evt.key === 'Home' ? 'start' : 'end');
			return;
		}
		if ((evt.key === 'PageDown' || evt.key === 'PageUp') && !mod && !evt.altKey && !evt.shiftKey) {
			// the page moves a screen (less a line or two, to keep one's place), and the cursor with it: it stays where
			// it was on screen, in whichever section is there now
			const c = cm.coordsAtPos(sel.head), view = this.root.getBoundingClientRect();
			if (!c) return;
			taken();
			const line = c.bottom - c.top, step = Math.max(line, view.height - line * 2) * (evt.key === 'PageDown' ? 1 : -1);
			const before = this.root.scrollTop;
			this.root.scrollTop += step;
			const moved = this.root.scrollTop - before;
			// at the page's end (or start) there's less to scroll: the cursor goes the rest of the way
			const y = Math.max(view.top + line, Math.min(view.bottom - line, (c.top + c.bottom) / 2 + (step - moved)));
			const to = this.sceneAt(y);
			if (!to || to.broken) return;
			const r = to.bodyEl.getBoundingClientRect();
			void this.focusScene(to, y < r.top ? 'start' : y > r.bottom ? 'end' : { x: c.left, y }, y < r.top || y > r.bottom ? c.left : undefined);
			return;
		}
		if (evt.key !== 'ArrowDown' && evt.key !== 'ArrowUp') return;
		if (evt.altKey || mod || evt.shiftKey || !sel.empty) return;
		const down = evt.key === 'ArrowDown';
		const edge = down ? cm.state.doc.length : bodyStart(cm.state.doc.toString());
		if (!sameLine(cm, sel.head, edge)) return;
		const i = this.scenes.indexOf(s), next = this.scenes[i + (down ? 1 : -1)];
		if (!next || next.broken) return;
		taken();
		void this.focusScene(next, down ? 'start' : 'end', cm.coordsAtPos(sel.head)?.left);
	}

	private sceneOf(target: EventTarget | null): Scene | null {
		const el = target instanceof Node ? (target.instanceOf(HTMLElement) ? target : target.parentElement)?.closest('.binders-manuscript-scene') : null;
		return el ? this.scenes.find((s) => s.el === el) ?? null : null;
	}

	private onClick(evt: MouseEvent): void {
		if (evt.defaultPrevented || evt.button !== 0) return;
		const target = evt.target as HTMLElement, s = this.sceneOf(target);
		if (s?.titleEl.contains(target)) {
			// a section's title is its note's name: a click edits it in place, as a note's own title is edited; with Mod
			// held it opens the note, as a link does
			if (s.renaming) return;
			const pane = Keymap.isModEvent(evt);
			if (pane || !this.editable) void this.ctx.openFile(s.file, pane); else this.rename(s);
			return;
		}
		// A section that's still plain text (its editor comes when it's near the middle of the page, or tapped): what
		// can be tapped in it works as it will once it's an editor. A link opens; a task's box turns the section into
		// its editor and ticks the box there (ticked in the plain text, the note itself would stay as it was).
		if (s && !s.live && s.bodyEl.contains(target)) {
			const link = target.closest<HTMLElement>('a.internal-link');
			if (link) { evt.preventDefault(); void this.app.workspace.openLinkText(link.getAttr('data-href') ?? link.getAttr('href') ?? '', s.file.path, Keymap.isModEvent(evt)); return; }
			if (target.matches('input[type="checkbox"]')) {
				evt.preventDefault();
				if (!this.editable || s.broken) return;
				const x = evt.clientX, y = evt.clientY, doc = this.root.ownerDocument;
				void this.focusScene(s, { x, y }, undefined, false).then(() => window.setTimeout(() => {
					// (the box nearest where the tap was: the editor's lines aren't to the pixel where the plain text's were)
					let best: HTMLInputElement | null = null, d = 24;
					for (const b of Array.from(s.bodyEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) {
						const r = b.getBoundingClientRect(), dy = Math.abs((r.top + r.bottom) / 2 - y);
						if (dy < d && Math.abs((r.left + r.right) / 2 - x) < 40) { d = dy; best = b; }
					}
					best?.click();
				}, 60));
				return;
			}
		}
		if (target.closest('.binders-manuscript-heading, .binders-view-synopsis-row, .binders-manuscript-notice, a, button, input')) return;
		// text being selected (in a rendered section, or across the page): leave it
		if (!this.root.ownerDocument.getSelection()?.isCollapsed) return;
		if (s && s.bodyEl.contains(target)) {
			if (s.live) return; // its editor has the click
			if (!this.editable || s.broken) { void this.ctx.openFile(s.file, Keymap.isModEvent(evt)); return; }
			void this.focusScene(s, { x: evt.clientX, y: evt.clientY });
			return;
		}
		// beside the text, between two sections, or in the room after the last one: the cursor goes to the nearest text,
		// as a click in a note's margin puts it on that line
		if (!this.editable || !this.scenes.length) return;
		const to = this.sceneAt(evt.clientY);
		if (!to || to.broken) return;
		const r = to.bodyEl.getBoundingClientRect();
		void this.focusScene(to, evt.clientY > r.bottom ? 'end' : evt.clientY < r.top ? 'start' : { x: Math.max(r.left + 1, Math.min(r.right - 1, evt.clientX)), y: evt.clientY });
	}

	private onMenu(evt: MouseEvent): void {
		const s = this.sceneOf(evt.target);
		if (!s || !s.titleEl.contains(evt.target as Node) || s.renaming) return;
		evt.preventDefault();
		// the menu a card or an outliner row has for the same note
		const store = this.ctx.store, folder = s.file.parent;
		const sibs = folder ? store.orderedChildren(folder) ?? [] : [], i = sibs.indexOf(s.file), rest = sibs.filter((f) => f !== s.file);
		// (up and down go past what's on the page: a note the filter hides isn't a step)
		const here = sibs.filter((f) => f === s.file || this.byKey.has(f)), j = here.indexOf(s.file);
		const prev = j > 0 ? here[j - 1] : null, next = j >= 0 && j < here.length - 1 ? here[j + 1] : null;
		const tell = (p: Promise<unknown>): void => { p.catch((e) => { new Notice(plain(e)); }); };
		const step = (anchor: TAbstractFile | null) => () => { if (folder) tell(store.put([s.file], folder, anchor)); };
		const menu = itemMenu(this.ctx, [s.file], {
			rename: () => this.rename(s),
			synopsis: null,
			up: prev ? step(prev) : null,
			down: next ? step(rest[rest.indexOf(next) + 1] ?? null) : null,
			// (the keyboard carries on in the section after the one that went, or before it)
			remove: (items) => {
				const at = this.scenes.indexOf(s), next = this.scenes[at + 1] ?? this.scenes[at - 1] ?? null;
				void removeItems(this.ctx, items).then((gone) => { if (gone && next && this.byKey.get(next.file) === next && !Platform.isMobile) void this.focusScene(next, 'start'); });
			},
			more: (menu) => {
				if (this.ctx.readOnly || !folder || i < 0) return;
				menu.addItem((x) => x.setSection('new').setTitle('New note after this').setIcon('file-plus').onClick(() => { tell(store.newScene(folder, i + 1).then((file) => { this.ctx.made(file); this.anchored(() => this.sync()); this.reveal(file, true); })); }));
			},
			made: (f, rename) => { this.anchored(() => this.sync()); this.reveal(f, rename && f instanceof TFolder); },
		});
		// what the menu did done, the cursor is back in the text it was in (not left on the title, where Enter would
		// open the note)
		const doc = this.root.ownerDocument;
		menu.onHide(() => window.setTimeout(() => {
			const a = doc.activeElement;
			if (this.dead || s.renaming || this.byKey.get(s.file) !== s || this.caret?.file !== s.file || Platform.isMobile || !(a === doc.body || a === s.titleEl)) return;
			void this.focusScene(s, 'caret', undefined, false);
		}, 50));
		menu.showAtMouseEvent(evt);
	}

	/** Renames the note by editing its title in place, like a note's inline title. Enter (or leaving it) renames; Escape
	    leaves the name as it was. A name that can't be used stays in the title to be changed, with a word why. */
	private rename(s: Scene, typed?: string): void {
		if (s.renaming || this.ctx.readOnly) return;
		const el = s.titleEl, old = s.file.basename, doc = this.root.ownerDocument;
		s.renaming = true;
		this.asked++;
		if (typed != null) el.setText(typed);
		el.contentEditable = 'plaintext-only';
		// (as a note's own title asks a phone's keyboard)
		el.setAttrs({ enterkeyhint: 'done', autocapitalize: 'on', spellcheck: 'true' });
		el.addClass('is-renaming');
		el.focus();
		const range = doc.createRange();
		range.selectNodeContents(el);
		const sel = doc.getSelection();
		sel?.removeAllRanges(); sel?.addRange(range);
		const done = async (commit: boolean, leaving: boolean) => {
			el.removeEventListener('keydown', key);
			el.removeEventListener('blur', blur);
			el.contentEditable = 'false';
			el.removeClass('is-renaming');
			el.scrollLeft = 0;
			s.renaming = false;
			const name = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
			el.setText(s.file.basename);
			// (Escape, or nothing changed: back to the text if that's where the rename was started from, else on the title)
			if (!commit || !name || name === old || this.dead) { if (!leaving && !this.dead) { if (this.caret?.file === s.file) void this.focusScene(s, 'caret', undefined, false); else el.focus(); } return; }
			const to = normalizePath(`${s.file.parent?.path ?? ''}/${name}.${s.file.extension}`);
			const clash = this.app.vault.getAbstractFileByPath(to), same = to.toLowerCase() === s.file.path.toLowerCase();
			const why = badName(name) ?? (name === s.file.parent?.name ? 'A note can’t have its folder’s name: it would become the folder’s note.' : clash && !same ? `There’s already a note called “${name}” here.` : null);
			if (why) {
				new Notice(why);
				// what was typed isn't lost: it's there to be changed (unless the title was left for something else)
				if (!leaving) this.rename(s, name);
				return;
			}
			try { await this.app.fileManager.renameFile(s.file, to); } catch (e) { new Notice(plain(e)); }
			el.setText(s.file.basename);
			if (!leaving && !this.dead) void this.focusScene(s, this.caret?.file === s.file ? 'caret' : 'start', undefined, this.caret?.file !== s.file);
		};
		const key = (e: KeyboardEvent) => {
			e.stopPropagation();
			if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void done(true, false); }
			else if (e.key === 'Escape') { e.preventDefault(); void done(false, false); }
		};
		const blur = (): void => { void done(true, true); };
		el.addEventListener('keydown', key);
		el.addEventListener('blur', blur);
	}

	// ---- scroll position ----

	/** Runs a change that alters heights or order, keeping what's on screen in place. */
	private anchored(fn: () => void): void {
		const a = this.anchor();
		const t0 = a?.getBoundingClientRect().top ?? 0;
		fn();
		if (!a || !a.isConnected) return;
		const d = a.getBoundingClientRect().top - t0;
		if (Math.abs(d) >= 1) this.root.scrollTop += d;
	}

	/** The element whose position should hold still: the section being typed in, if it's on screen, else the first one
	    at the top of the viewport. */
	private anchor(): HTMLElement | null {
		if (!this.entries.length || !this.root.isConnected) return null;
		const view = this.root.getBoundingClientRect();
		const active = this.root.ownerDocument.activeElement;
		const focused = this.scenes.find((s) => s.el.contains(active));
		if (focused) { const r = focused.el.getBoundingClientRect(); if (r.bottom > view.top && r.top < view.bottom) return focused.el; }
		let lo = 0, hi = this.entries.length - 1;
		while (lo < hi) { const m = (lo + hi) >> 1; if (this.entries[m].el.getBoundingClientRect().bottom > view.top) hi = m; else lo = m + 1; }
		return this.entries[lo].el;
	}

	private teardown(): void {
		if (this.dead) return;
		this.dead = true;
		window.cancelAnimationFrame(this.raf);
		window.clearTimeout(this.settleTimer);
		this.io?.disconnect();
		this.ro?.disconnect();
		this.reportTyping();
	}
}

/** Are positions a and b on the same visual line of the editor? */
function sameLine(cm: EditorView, a: number, b: number): boolean {
	if (a === b) return true;
	const ca = cm.coordsAtPos(a), cb = cm.coordsAtPos(b);
	if (!ca || !cb) return false;
	return Math.min(ca.bottom, cb.bottom) - Math.max(ca.top, cb.top) > 2;
}

export const manuscript: ModeFactory = (container, ctx) => new Manuscript(container, ctx);
