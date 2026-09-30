import { Component, Keymap, MarkdownRenderer, Menu, Notice, Platform, TFile, TFolder, normalizePath, setIcon, type Events, type TAbstractFile } from 'obsidian';
import type { EditorView } from '@codemirror/view';
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

interface Heading {
	kind: 'heading';
	key: TFolder;
	el: HTMLElement;
	textEl: HTMLElement;
	depth: number;
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
		if (!this.editable) this.notice(ctx.readOnly
			? 'This binder is read only here. Click a section to open its note.'
			: 'The manuscript can’t edit notes in this version of Obsidian, so it’s read only. Click a section to open its note.');
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
			const top = this.root.getBoundingClientRect().top, active = this.root.ownerDocument.activeElement;
			// in page order, so each section's top before this batch is its top now less the changes above it
			const changed = items.map((it) => ({ el: it.target as HTMLElement, r: it.target.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top);
			let d = 0, above = 0;
			for (const { el, r } of changed) {
				const old = this.heights.get(el);
				this.heights.set(el, r.height);
				if (old === undefined || !el.isConnected) continue;
				if (r.top - above < top - 0.5 && !el.contains(active)) d += r.height - old;
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
		c.registerDomEvent(this.root, 'scroll', () => { this.scrolledAt = performance.now(); }, { passive: true });
		c.registerDomEvent(this.list, 'click', (e) => this.onClick(e));
		c.registerDomEvent(this.list, 'contextmenu', (e) => this.onMenu(e));
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

	focus(): void {
		const s = this.scenes[0];
		if (s && this.editable) void this.focusScene(s, 'start');
	}

	// ---- building the page ----

	/** Headings and scenes of the folder, depth first, in binder order. */
	private wanted(): { key: TFile | TFolder; depth: number }[] {
		const out: { key: TFile | TFolder; depth: number }[] = [];
		const walk = (f: TFolder, depth: number) => {
			for (const c of this.ctx.store.orderedChildren(f) ?? []) {
				if (c instanceof TFolder) { out.push({ key: c, depth: depth + 1 }); walk(c, depth + 1); }
				else if (c instanceof TFile && c.extension === 'md') out.push({ key: c, depth });
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
		if (!next.length && !this.emptyEl) this.emptyEl = this.page.createDiv({ cls: 'binders-manuscript-empty', text: 'No notes here yet.' });
		else if (next.length && this.emptyEl) { this.emptyEl.remove(); this.emptyEl = null; }
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
		return h;
	}

	private updateHeading(h: Heading, depth: number): void {
		if (h.depth !== depth) {
			h.depth = depth;
			h.el.empty();
			h.textEl = h.el.createEl(`h${Math.min(depth, 6)}` as 'h1');
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
		this.comp.registerDomEvent(titleEl, 'keydown', (e) => { if (e.key === 'Enter' && !s.renaming) { e.preventDefault(); void this.ctx.openFile(file, Keymap.isModEvent(e) !== false); } });
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
				const live = await mountEditor(this.app, host, s.file, this.comp, { onChange: (text) => this.onTyping(s, text) });
				if (this.dead || this.byKey.get(s.file) !== s) { void live.destroy(); host.remove(); return; }
				s.token++; // a render still in flight is stale now
				for (const c of Array.from(s.bodyEl.children)) if (c !== host) c.remove();
				if (s.renderComp) { this.comp.removeChild(s.renderComp); s.renderComp = null; }
				host.removeClass('is-mounting');
				s.bodyEl.setCssStyles({ minHeight: '' });
				s.live = live;
				s.shown = null;
			} catch (e) {
				console.error(`Binders: couldn't open “${s.file.path}” for editing in the manuscript`, e);
				s.broken = true;
				host.remove();
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

	/** Puts the cursor in a section: at the start of its body, at its end, or at a point on screen. `x` keeps the
	    column when arrowing between sections. */
	private async focusScene(s: Scene, where: 'start' | 'end' | { x: number; y: number }, x?: number): Promise<void> {
		await this.mount(s);
		const live = s.live, cm = live?.cm;
		if (!live) return;
		if (!cm) { live.editor?.focus(); return; }
		const doc = cm.state.doc, start = bodyStart(doc.toString());
		const clamp = (p: number) => Math.max(start, Math.min(doc.length, p));
		let pos = where === 'start' ? start : where === 'end' ? doc.length : clamp(cm.posAtCoords(where, false));
		if (x != null && typeof where === 'string') {
			const c = cm.coordsAtPos(pos);
			const p = c && cm.posAtCoords({ x, y: (c.top + c.bottom) / 2 }, false);
			if (p != null) pos = clamp(p);
		}
		cm.focus();
		cm.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
	}

	/** ArrowDown on the last line of a section goes on into the next one; ArrowUp on the first, into the previous. */
	private onKey(evt: KeyboardEvent): void {
		if (evt.key !== 'ArrowDown' && evt.key !== 'ArrowUp') return;
		if (evt.defaultPrevented || evt.isComposing || evt.altKey || evt.ctrlKey || evt.metaKey || evt.shiftKey) return;
		const s = this.sceneOf(evt.target);
		const cm = s?.live?.cm;
		if (!s || !cm || !cm.contentDOM.contains(evt.target as Node)) return;
		// a suggestion popup (links, tags) is using the arrows
		if (this.root.ownerDocument.body.querySelector(':scope > .suggestion-container')) return;
		const sel = cm.state.selection.main;
		if (!sel.empty) return;
		const down = evt.key === 'ArrowDown';
		const edge = down ? cm.state.doc.length : bodyStart(cm.state.doc.toString());
		if (!sameLine(cm, sel.head, edge)) return;
		const i = this.scenes.indexOf(s), next = this.scenes[i + (down ? 1 : -1)];
		if (!next || next.broken) return;
		evt.preventDefault();
		evt.stopPropagation();
		void this.focusScene(next, down ? 'start' : 'end', cm.coordsAtPos(sel.head)?.left);
	}

	private sceneOf(target: EventTarget | null): Scene | null {
		const el = target instanceof Node ? (target.instanceOf(HTMLElement) ? target : target.parentElement)?.closest('.binders-manuscript-scene') : null;
		return el ? this.scenes.find((s) => s.el === el) ?? null : null;
	}

	private onClick(evt: MouseEvent): void {
		const s = this.sceneOf(evt.target);
		if (!s || evt.defaultPrevented) return;
		const target = evt.target as HTMLElement;
		if (s.titleEl.contains(target)) {
			if (!s.renaming) void this.ctx.openFile(s.file, Keymap.isModEvent(evt) !== false);
			return;
		}
		if (s.live || !s.bodyEl.contains(target)) return;
		// text being selected in a rendered section: leave it
		if (!this.root.ownerDocument.getSelection()?.isCollapsed) return;
		if (!this.editable || s.broken) { void this.ctx.openFile(s.file, Keymap.isModEvent(evt) !== false); return; }
		void this.focusScene(s, { x: evt.clientX, y: evt.clientY });
	}

	private onMenu(evt: MouseEvent): void {
		const s = this.sceneOf(evt.target);
		if (!s || !s.titleEl.contains(evt.target as Node)) return;
		evt.preventDefault();
		const menu = new Menu();
		menu.addItem((i) => i.setTitle('Open in new tab').setIcon('file-plus').onClick(() => void this.ctx.openFile(s.file, true)));
		if (!this.ctx.readOnly) menu.addItem((i) => i.setTitle('Rename').setIcon('pencil').onClick(() => this.rename(s)));
		menu.showAtMouseEvent(evt);
	}

	/** Renames the note by editing its title in place, like the inline title. */
	private rename(s: Scene): void {
		const el = s.titleEl, old = s.file.basename;
		s.renaming = true;
		el.contentEditable = 'plaintext-only';
		el.addClass('is-renaming');
		el.focus();
		const range = this.root.ownerDocument.createRange();
		range.selectNodeContents(el);
		const sel = this.root.ownerDocument.getSelection();
		sel?.removeAllRanges(); sel?.addRange(range);
		const done = async (commit: boolean) => {
			el.removeEventListener('keydown', key);
			el.removeEventListener('blur', blur);
			el.contentEditable = 'false';
			el.removeClass('is-renaming');
			s.renaming = false;
			const name = (el.textContent ?? '').replace(/[\\/:]/g, ' ').trim();
			el.setText(s.file.basename);
			if (!commit || !name || name === old || this.dead) return;
			const to = normalizePath(`${s.file.parent?.path ?? ''}/${name}.${s.file.extension}`);
			if (this.app.vault.getAbstractFileByPath(to)) { new Notice(`There’s already a note called “${name}” here.`); return; }
			try { await this.app.fileManager.renameFile(s.file, to); } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
			el.setText(s.file.basename);
		};
		const key = (e: KeyboardEvent) => {
			if (e.key === 'Enter') { e.preventDefault(); void done(true); }
			else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void done(false); }
		};
		const blur = (): void => { void done(true); };
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
