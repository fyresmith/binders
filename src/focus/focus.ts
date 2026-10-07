import { Compartment, StateEffect, type Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Component, MarkdownRenderer, MarkdownView, Menu, Notice, Platform, Scope, TFile, debounce, setIcon, type Editor, type Events, type WorkspaceLeaf } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { FOCUS_TEXT, focusToggles, type FocusToggle } from '../settings-data';
import { saveOpen } from '../scenes';
import { BinderView } from '../view/BinderView';
import { GLIDE } from '../view/drag';
import { clearHeaderSnapshots, headerSnapshots } from '../view/snapshots';
import { readableLineLength, submenu, vimMode } from '../view/internals';
import { ask } from '../view/modals';
import { readTarget } from '../view/outliner-data';
import { watchSize } from '../view/windows';
import { WordCounter } from '../view/word-counter';
import { wordsIn } from '../view/words';
import { caretRect, editorDoc, editorView, lightTheme, noteColumn, panesAbove, tailRoom } from './dom';
import { Session, atEnd, bodyStart, dayOf, excerpt, parseGoal } from './session';

/* Focus mode: a quiet way to write a note of a binder, in a tab or in the manuscript. It is a state of the view that's
   already open, never a view of its own: the editor being typed in is not remounted, moved or reloaded on the way in
   or out, so nothing typed can be lost to it.

   Everything Obsidian draws around the page is hidden by a class on the window's <body> and one on the tab
   (styles.css). Nothing of Obsidian's own state is changed (no sidebar is collapsed, no layout saved), and nothing
   is kept that says focus is on: after a reload, a crash, or the plugin being turned off, Obsidian is as it was.

   What shows besides the text is each an option (settings, "Focus mode"), all off to begin with but typewriter
   scrolling: where the scene is and its synopsis, the word counts, the scenes before and after, dimming. */

/** Where the line being written is held, from the top of what can be seen of the page. */
export const LINE = 0.42;
/** A pause in typing this long brings the numbers back. */
const PAUSE = 2500;
/** How long what's around the page takes to fade (Obsidian's --anim-duration-fast). */
const FADE = 140;
/** On each split and tab group the tab in focus is in (see `path`). */
const PATH = 'binders-focus-path';
/** Kept in the vault's local storage, on this device: the day's words, and that the way out has been said once. */
const SESSION = 'binders-session', RULE = 'binders-session-rule', HINTED = 'binders-focus-hinted';
/** A short fingerprint of a text, whatever its line breaks (an editor has one kind, a file may have the other). */
function fingerprint(text: string): number {
	let h = 5381;
	for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c !== 13) h = ((h << 5) + h + c) | 0; }
	return h;
}
/** Further than this from a note's end, the cursor isn't on its last line (and the text needn't be read to know). */
const FAR = 4000;

interface Active {
	leaf: WorkspaceLeaf;
	doc: Document;
	leafEl: HTMLElement;
	comp: Component;
	/** The way out (always there), with the place and synopsis beside it when that's on. */
	top: HTMLElement;
	note: HTMLElement | null;
	corner: HTMLElement | null;
	live: HTMLElement;
	/** The note view's own editor, with the typewriter line added to it (taken out again on leaving). */
	cm: EditorView | null;
	slot: Compartment;
	near: HTMLElement[];
	/** What the scenes before and after were last drawn for. */
	nearKey: string;
	nearComp: Component | null;
	pauseTimer: number;
	pointer: { x: number; y: number; at: number };
	reached: boolean;
	/** Still fading in: the classes aren't on yet. */
	entering: boolean;
	/** "Dim the background" has the window in Obsidian's dark colors: `light` if it was light before (so it's ours to
	    put back). Null while it hasn't. */
	dark: { light: boolean } | null;
	/** The window is in fullscreen because focus mode put it there (so it's ours to give back). */
	full: boolean;
	/** The splits and tab groups the tab is in, marked so that every other one is hidden (see `path`), and what
	    watches them for the tab being put somewhere else. */
	path: HTMLElement[];
	watch: MutationObserver | null;
}

/** Focus mode: its commands, the header buttons, and a state added to the view in front. See the header comment. */
export class Focus {
	on: Active | null = null;
	session: Session;
	private words: WordCounter;
	private actions = new WeakMap<MarkdownView, HTMLElement>();
	private gliding = new WeakMap<HTMLElement, { rest: number; raf: number }>();
	private pending = new Map<TFile, Editor>();
	private pendingTimer = 0;
	/** On the way out (the text is gliding back): a second toggle waits. */
	private busy = false;
	private keep = debounce(() => this.store(), 1000, true);

	constructor(private plugin: BindersPlugin) {
		const app = plugin.app, ws = app.workspace;
		this.session = new Session(app.loadLocalStorage(SESSION), dayOf(new Date()));
		this.words = new WordCounter(plugin, () => this.draw());
		// (a session kept before there were two ways to count was counted as the status bar counts)
		const rule: unknown = app.loadLocalStorage(RULE);
		this.rule = typeof rule === 'boolean' ? rule : false;
		ws.onLayoutReady(() => this.ruled());
		plugin.addCommand({ id: 'focus', name: 'Toggle focus mode', icon: 'maximize-2', checkCallback: (checking) => {
			const leaf = this.on?.leaf ?? ws.getMostRecentLeaf();
			if (!this.on && (!leaf || !this.eligible(leaf))) return false;
			if (!checking) this.toggle();
			return true;
		} });
		for (const [id, name, d] of [['previous-scene', 'Go to previous scene', -1], ['next-scene', 'Go to next scene', 1]] as const) {
			plugin.addCommand({ id, name, icon: d < 0 ? 'arrow-up' : 'arrow-down', checkCallback: (checking) => this.step(d, checking) });
		}
		// a note of a binder has the button in its header; a note anywhere else has nothing added to it
		const sync = () => this.sync();
		plugin.registerEvent(ws.on('layout-change', sync));
		plugin.registerEvent(ws.on('file-open', (file) => { if (file && this.scene(file)) this.seen(file); sync(); }));
		// (another tab or pane taken up, by a command, a link opened in a new tab, the quick switcher: focus was on this one)
		plugin.registerEvent(ws.on('active-leaf-change', (leaf) => { if (this.on && leaf && leaf !== this.on.leaf) this.leave(true); sync(); }));
		plugin.registerEvent(plugin.binders.on('changed', () => { this.scenes = new WeakMap(); sync(); }));
		ws.onLayoutReady(() => void plugin.binders.settled.then(sync));
		// The day's words: counted as they're typed in any note of a binder, in focus or not, a moment after the key
		// (a note that isn't in a binder costs one entry in a map per key, and no more).
		plugin.registerEvent(ws.on('editor-change', (editor, info) => {
			if (!info.file) return;
			// (a note of a binder not seen yet today is read now, at its first key, before the typing can be saved: what
			// the vault has is what it's counted from)
			if (!this.session.has(info.file.path) && this.isScene(info.file)) this.seen(info.file);
			if (this.session.has(info.file.path) || this.isScene(info.file)) this.hold(info.file.path, editor);
			this.pending.set(info.file, editor);
			if (!this.pendingTimer) this.pendingTimer = window.setTimeout(() => this.count(), 300);
		}));
		// a note changed on disk: by a save of what was typed here, or from elsewhere (another device, another program)
		plugin.registerEvent(app.vault.on('modify', (file) => { if (file instanceof TFile && this.session.has(file.path)) void this.arrived(file); }));
		plugin.registerEvent(app.vault.on('rename', (file, old) => { this.session.rename(old, file.path); this.keep(); for (const m of [this.onDisk, this.held] as Map<string, unknown>[]) { if (m.has(old)) { m.set(file.path, m.get(old)); m.delete(old); } } }));
		plugin.registerEvent(app.vault.on('delete', (file) => {
			// A note deleted just after as many words as it had arrived in another: it was merged into that one, and
			// what was written in it today is still written.
			const had = this.session.now(file.path), into = had > 0 ? this.gained.find((g) => performance.now() - g.at < 5000 && g.left >= had) : undefined;
			if (into) { into.left -= had; this.session.merged(file.path, into.path); } else this.session.remove(file.path);
			this.onDisk.delete(file.path); this.held.delete(file.path);
			this.keep();
			if (this.on) this.draw();
		}));
		// in the editor's own menu while in focus: the way to its options when nothing else of it is on the page
		plugin.registerEvent(ws.on('editor-menu', (menu, _editor, info) => {
			const on = this.on, el = info instanceof MarkdownView ? info.containerEl : (info as { containerEl?: HTMLElement }).containerEl;
			if (!on || (el && !on.leafEl.contains(el))) return;
			menu.addItem((i) => { i.setSection('binders-focus').setTitle('Focus mode').setIcon('maximize-2'); submenu(i, (m) => this.fill(m), menu); });
		}));
		plugin.register(() => this.unload());
	}

	private get opt() { return this.plugin.settings; }

	// ---- what can be focused on ----

	/** A note that's a scene of a binder (not the binder's own note, nor a folder's). */
	private scene(file: TFile | null | undefined): file is TFile {
		const b = this.plugin.binders;
		return !!file && file.extension === 'md' && !!b.binderOf(file) && !b.isHiddenNote(file) && !!file.parent && (b.orderedChildren(file.parent) ?? []).includes(file);
	}

	/** The same, remembered until a binder changes: asked at every key typed in any note. */
	private isScene(file: TFile): boolean {
		let is = this.scenes.get(file);
		if (is === undefined) this.scenes.set(file, is = this.scene(file));
		return is;
	}
	private scenes = new WeakMap<TFile, boolean>();

	eligible(leaf: WorkspaceLeaf): boolean {
		const v = leaf.view;
		if (v instanceof BinderView) return !!v.folder && v.mode === 'manuscript';
		return v instanceof MarkdownView && this.scene(v.file);
	}

	/** The scene before or after a note, in the binder's order (through its folders). */
	neighbour(file: TFile, d: number): TFile | null {
		const binder = this.plugin.binders.binderOf(file);
		if (!binder) return null;
		const all = this.plugin.binders.scenes(binder.folder), i = all.indexOf(file);
		return i < 0 ? null : all[i + d] ?? null;
	}

	/** "Go to previous scene" and "Go to next scene": in the manuscript the cursor goes to that section; a note in a
	    tab gives way to that note, in the same tab (and still in focus, if it was). */
	private step(d: number, checking: boolean): boolean {
		const leaf = this.on?.leaf ?? this.plugin.app.workspace.getMostRecentLeaf(), v = leaf?.view;
		if (v instanceof BinderView) return v.mode === 'manuscript' && v.stepScene(d, checking);
		const to = v instanceof MarkdownView && this.scene(v.file) ? this.neighbour(v.file, d) : null;
		if (!to || !leaf) return false;
		if (!checking) void this.go(leaf, to, d);
		return true;
	}

	/** Opens the scene before or after in the same tab, the cursor where reading carries on: at its end, going back; at
	    its start, going on. (Obsidian writes what was typed in the note being left as it opens the next.) */
	private async go(leaf: WorkspaceLeaf, to: TFile, d: number): Promise<void> {
		await leaf.openFile(to, { active: true });
		const v = leaf.view;
		if (!(v instanceof MarkdownView) || v.file !== to) return;
		if (v.getMode() === 'source') {
			const e = v.editor, text = e.getValue();
			e.setCursor(e.offsetToPos(d < 0 ? text.replace(/\s+$/, '').length : bodyStart(text)));
			e.focus();
			// (the page with it: at the end of the scene before, its last lines; at the start of the one after, its first)
			e.scrollIntoView({ from: e.getCursor(), to: e.getCursor() }, false);
			if (this.on?.leaf === leaf) this.align();
		} else if (d < 0) {
			const col = noteColumn(v);
			if (col) window.setTimeout(() => { col.scroller.scrollTop = col.scroller.scrollHeight; }, 50);
		}
	}

	/** The header buttons on notes of a binder, and only on those; and focus ends when its tab stops showing one. */
	private sync(): void {
		for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
			const v = leaf.view;
			if (!(v instanceof MarkdownView)) continue;
			const has = this.actions.get(v), want = this.scene(v.file);
			if (want && !has) this.actions.set(v, v.addAction('maximize-2', 'Focus mode', () => this.enter(leaf)));
			else if (!want && has) { has.remove(); this.actions.delete(v); }
			// (the same notes have a button for their snapshots, to the right of this one)
			headerSnapshots(this.plugin, v, this.actions.get(v) ?? null);
		}
		this.check();
	}

	/** Focus ends when its tab closes or stops showing a note of a binder (or the manuscript); what's drawn around the
	    text follows the note, and the view (editing or reading), it's on now. */
	check(): void {
		const on = this.on;
		if (!on) return;
		if (!on.leafEl.isConnected || !this.eligible(on.leaf)) { this.leave(true); return; }
		if (on.entering) return;
		this.path(on);
		this.furnish(on);
		this.draw();
	}

	/** Marks the splits and tab groups the tab is in (`binders-focus-path`): every other one under the window's root
	    is hidden by the stylesheet, so the tab has the window. The marks are put right the moment the tab is given
	    another place (a pane closed beside it, or panes put another way by a plugin): whatever it is in
	    gains or loses a child then, which is watched for, each of them and the root, so that the page is never drawn
	    with the tab's own pane hidden. And again on every change of layout Obsidian tells of (`check`).
	    (The watcher is the tab's own window's: a tab in a window of its own is watched there.) */
	private path(on: Active): void {
		const { root, chain } = panesAbove(on.leafEl);
		for (const el of on.path) if (!chain.includes(el)) el.removeClass(PATH);
		for (const el of chain) el.addClass(PATH);
		on.path = chain;
		on.watch?.disconnect();
		if (!root) return;
		on.watch ??= new (on.leafEl.win as Window & { MutationObserver: typeof MutationObserver }).MutationObserver(() => { if (this.on === on && !on.entering && on.leafEl.isConnected) this.path(on); });
		for (const el of [root, ...chain]) on.watch.observe(el, { childList: true });
	}

	toggle(): void {
		if (this.busy) return;
		if (this.on) { this.leave(); return; }
		const leaf = this.plugin.app.workspace.getMostRecentLeaf();
		if (leaf && this.eligible(leaf)) this.enter(leaf);
	}

	/** Settings changed (in the settings tab, or the focus menu): what's on the page follows at once. */
	optionsChanged(): void {
		this.ruled();
		const on = this.on;
		if (!on) return;
		this.screen(on, this.opt.focusFullscreen);
		if (on.entering) return;
		this.furnish(on);
		this.drawNow();
	}

	/** Fullscreen follows its option: taken on the way in or when it's turned on, given back on the way out or when
	    it's turned off, and only if it was ours (a window that's in fullscreen already is left as it is). Where it
	    can't be had (a phone, or the system says no), focus mode is as it is without it. */
	private screen(on: Active, want: boolean): void {
		const doc = on.doc, el = doc.documentElement;
		if (want && !on.full && !doc.fullscreenElement && typeof el.requestFullscreen === 'function') {
			on.full = true;
			el.requestFullscreen().catch(() => { on.full = false; });
		} else if (!want && on.full) {
			on.full = false;
			if (doc.fullscreenElement) doc.exitFullscreen().catch(() => { /* gone already */ });
		}
	}

	// ---- in and out ----

	/* The way in and out, in two steps (a cross-fade of the whole window was tried first: mid-fade the text shows
	   twice, in its old place and its new one). In: what's around the page fades out where it stands; then it's gone,
	   and the text, which hasn't moved, glides to the middle. Out: the same, backwards. With reduced motion, one step
	   and no movement. */
	private calm(doc: Document): boolean { return !!doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches; }

	/** The text's column (to see where it stands), what scrolls it, and the view's content (which is what glides). */
	private page(on: Active): { text: HTMLElement | null; scroller: HTMLElement | null; content: HTMLElement } {
		const v = on.leaf.view;
		if (v instanceof MarkdownView) { const col = noteColumn(v); return { text: col?.text ?? null, scroller: col?.scroller ?? null, content: v.contentEl }; }
		const el = v.containerEl;
		return { text: el.querySelector<HTMLElement>('.binders-manuscript-list'), scroller: el.querySelector<HTMLElement>('.binders-manuscript'), content: v instanceof BinderView ? v.contentEl : el };
	}

	/** Keeps the text where it is in the window through a change of what's around it: returns the step that puts it
	    back (the header and the toolbar come and go above it; the scenes before and after, in it). */
	private holder(on: Active): () => void {
		const { text, scroller } = this.page(on);
		if (!text || !scroller) return () => { /* nothing to hold */ };
		const was = text.getBoundingClientRect().top;
		return () => { if (text.isConnected) scroller.scrollTop += text.getBoundingClientRect().top - was; };
	}

	enter(leaf: WorkspaceLeaf): void {
		if (this.busy) return;
		if (this.on) this.leave(true);
		if (!this.eligible(leaf)) return;
		const view = leaf.view, doc = view.containerEl.doc, leafEl = view.containerEl.closest<HTMLElement>('.workspace-leaf');
		if (!leafEl) return;
		const app = this.plugin.app, comp = new Component(), vim = vimMode(app);
		comp.load();
		this.session.roll(dayOf(new Date()));
		const top = createDiv({ cls: 'binders-focus-top' });
		const way = top.createDiv({ cls: 'binders-focus-way' });
		const out = way.createDiv({ cls: 'clickable-icon binders-focus-leave', attr: { role: 'button', tabindex: '0', 'aria-label': vim ? 'Leave focus mode' : 'Leave focus mode (Esc)' } });
		setIcon(out, 'minimize-2');
		// (said to a screen reader as focus begins: what this is, and the way out)
		const live = createDiv({ cls: 'binders-focus-live', attr: { role: 'status', 'aria-live': 'polite' } });
		const on: Active = { leaf, doc, leafEl, comp, top, note: null, corner: null, live, cm: null, slot: new Compartment(), near: [], nearKey: '', nearComp: null, pauseTimer: 0, pointer: { x: -1, y: -1, at: 0 }, full: false, reached: false, dark: null, entering: true, path: [], watch: null };
		this.on = on;
		this.screen(on, this.opt.focusFullscreen);
		// (Esc takes the window out of fullscreen before any key reaches the page: that Esc leaves focus mode too)
		comp.registerDomEvent(doc, 'fullscreenchange', () => { if (on.full && !doc.fullscreenElement) { on.full = false; if (this.on === on) this.leave(); } });
		out.addEventListener('click', () => this.leave());
		out.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.leave(); } });
		// (its options: a right click, a long press, the menu key)
		out.addEventListener('contextmenu', (e) => { e.preventDefault(); this.menu(out); });

		const calm = this.calm(doc);
		const go = () => {
			if (this.on !== on) return;
			on.entering = false;
			// what's being written holds still while everything around it goes
			const p = this.page(on), was = p.text?.getBoundingClientRect(), hold = this.holder(on);
			doc.body.addClass('binders-focus');
			doc.body.removeClass('binders-focus-pre');
			leafEl.addClass('binders-focus-leaf');
			this.path(on);
			view.containerEl.append(top);
			doc.body.append(live);
			this.furnish(on);
			hold();
			// then it glides across to the middle (if its lines are as long as they were: else they've been set again)
			const now = p.text?.getBoundingClientRect();
			// (and up or down, where the page couldn't be scrolled to hold it still: at the top of a note, whose title
			// and properties went from above it)
			if (!calm && was && now && Math.abs(was.width - now.width) < 1 && (Math.abs(was.left - now.left) > 1 || Math.abs(was.top - now.top) > 1)) p.content.animate([{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: 'none' }], GLIDE);
			this.drawNow();
			this.align();
			window.setTimeout(() => { if (this.on === on) live.setText(vim || Platform.isMobile ? 'Focus mode. The button to leave it is at the top of the page.' : 'Focus mode. Press Escape to leave.'); }, 100);
		};
		if (calm) go(); else { doc.body.addClass('binders-focus-pre'); window.setTimeout(go, FADE); }

		// ---- while it's on ----
		// (and again once the editor has measured itself: the room under its text follows its height)
		// (watched from the window the tab is in: a note or a manuscript in a window of its own is measured there)
		comp.register(watchSize(app, leafEl, () => { if (on.entering) return; this.measure(on); window.setTimeout(() => { if (this.on === on) this.measure(on); }, 200); }));
		comp.registerEvent(app.metadataCache.on('changed', () => this.draw()));
		// ("Readable line length", the text's size, the theme: whether there's room beside the text may have changed)
		const again = () => window.setTimeout(() => { if (this.on === on && !on.entering) this.measure(on); }, 150);
		comp.registerEvent((app.vault as Events).on('config-changed', again));
		comp.registerEvent(app.workspace.on('css-change', again));
		// (Obsidian has set the window's colors again, for a change of theme or of the system's: dark again, over that)
		comp.registerEvent(app.workspace.on('css-change', () => { if (this.on === on && on.dark) { on.dark = null; this.dark(on, true); } }));
		// (the cursor in another section of the manuscript: where that is, and its words)
		comp.registerDomEvent(leafEl, 'focusin', () => this.draw());
		comp.registerDomEvent(doc, 'keydown', (e) => this.onKey(e), { capture: true });
		// Escape leaves, through Obsidian's own stack of key scopes (public API): a dialog, a menu, the command palette
		// or a list of suggestions opened after this has its scope above this one and takes the key first. With Vim's
		// keys on, Escape is Vim's alone.
		if (!vim) {
			const scope = new Scope(view.scope ?? app.scope);
			scope.register([], 'Escape', (e) => this.onEscape(e));
			app.keymap.pushScope(scope);
			comp.register(() => app.keymap.popScope(scope));
		}
		// the pointer moved (really moved: a page scrolling under a still pointer also sends moves), the wheel turned,
		// a finger touched: everything comes back
		const back = () => { doc.body.removeClass('binders-focus-typing', 'binders-focus-paused'); window.clearTimeout(on.pauseTimer); };
		comp.registerDomEvent(doc, 'pointermove', (e) => {
			const p = on.pointer;
			if (p.x < 0) { p.x = e.screenX; p.y = e.screenY; return; }
			if (Math.abs(e.screenX - p.x) + Math.abs(e.screenY - p.y) < 6) return;
			p.x = e.screenX; p.y = e.screenY;
			back();
		});
		comp.registerDomEvent(doc, 'pointerdown', () => { on.pointer.at = performance.now(); back(); }, { capture: true });
		comp.registerDomEvent(doc, 'wheel', back, { passive: true, capture: true });
		comp.registerDomEvent(doc, 'touchmove', back, { passive: true, capture: true });
		// (said once, ever: how to get out. Not on a phone or a tablet: there's no Esc to press, the button is in sight,
		// and a notice would lie over it)
		if (!Platform.isMobile && !app.loadLocalStorage(HINTED)) { app.saveLocalStorage(HINTED, true); new Notice(vim ? 'Focus mode. Move the pointer for the way out.' : 'Focus mode. Press Esc to leave.', 5000); }
	}

	/** `quick`: at once, with no glide (focus is ending because its tab has gone, or shows something else). */
	leave(quick = false): void {
		const on = this.on;
		if (!on) return;
		this.on = null;
		this.screen(on, false);
		window.clearTimeout(on.pauseTimer);
		const body = on.doc.body, hold = on.entering ? () => { /* nothing has moved yet */ } : this.holder(on);
		const undo = () => {
			body.removeClass('binders-focus', 'binders-focus-typing', 'binders-focus-paused', 'binders-focus-dim');
			this.dark(on, false);
			on.leafEl.removeClass('binders-focus-leaf', 'has-margins', 'has-place', 'has-numbers', 'has-near', 'is-typewriter');
			on.watch?.disconnect(); on.watch = null;
			for (const el of on.path) el.removeClass(PATH);
			on.path = [];
			on.leafEl.style.removeProperty('--binders-focus-margin');
			on.leafEl.style.removeProperty('--binders-focus-tail');
			on.top.remove();
			on.corner?.remove();
			for (const el of on.near) el.remove();
			if (on.nearComp) on.comp.removeChild(on.nearComp);
			if (on.cm) { try { if (on.slot.get(on.cm.state) !== undefined) on.cm.dispatch({ effects: on.slot.reconfigure([]) }); } catch { /* the editor has gone */ } }
			hold();
			on.live.setText('Left focus mode.');
			window.setTimeout(() => on.live.remove(), 1500);
		};
		const end = () => { on.comp.unload(); this.store(); };
		if (quick || on.entering || this.calm(on.doc) || !on.leafEl.isConnected) { undo(); end(); body.removeClass('binders-focus-pre', 'binders-focus-post'); return; }
		// where the text will stand once everything is back: the layout is tried, measured and put back (nothing is drawn
		// in between), the text glides there, and then what's around it is put back, unseen, and fades in
		const p = this.page(on), was = p.text?.getBoundingClientRect();
		body.removeClass('binders-focus'); on.leafEl.removeClass('binders-focus-leaf');
		const to = p.text?.getBoundingClientRect();
		body.addClass('binders-focus'); on.leafEl.addClass('binders-focus-leaf');
		on.top.addClass('is-leaving'); on.corner?.addClass('is-leaving');
		this.busy = true;
		let glide: Animation | null = null;
		const finish = () => {
			body.addClass('binders-focus-pre', 'binders-focus-post');
			undo();
			end();
			glide?.cancel();
			const win = on.doc.defaultView ?? window;
			win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
				body.removeClass('binders-focus-pre');
				this.busy = false;
				win.setTimeout(() => { if (!this.on) body.removeClass('binders-focus-post'); }, FADE + 60);
			}));
		};
		if (was && to && Math.abs(was.width - to.width) < 1 && Math.abs(was.left - to.left) > 1) {
			glide = p.content.animate([{ transform: 'none' }, { transform: `translateX(${to.left - was.left}px)` }], { ...GLIDE, fill: 'forwards' });
			glide.finished.then(finish, finish);
		} else finish();
	}

	private unload(): void {
		const live = this.on?.live;
		this.leave(true);
		live?.remove(); // (nothing of this is left behind, not even what says it has gone)
		window.clearTimeout(this.pendingTimer);
		window.clearTimeout(this.drawTimer);
		for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) { const v = leaf.view; if (v instanceof MarkdownView) { this.actions.get(v)?.remove(); this.actions.delete(v); clearHeaderSnapshots(v); } }
		this.store();
	}

	private binderOf(on: Active): Binder | null {
		const v = on.leaf.view;
		const at = v instanceof BinderView ? v.folder : v instanceof MarkdownView ? v.file : null;
		return at ? this.plugin.binders.binderOf(at) : null;
	}

	/** The scene being written: the note, or the section of the manuscript the cursor is in. */
	private current(on: Active): TFile | null {
		const v = on.leaf.view;
		if (v instanceof MarkdownView) return v.file;
		const f = v instanceof BinderView ? v.currentItem() : null;
		return f instanceof TFile ? f : null;
	}

	// ---- the keyboard ----

	private onKey(e: KeyboardEvent): void {
		const on = this.on;
		if (!on || on.entering) return;
		const t = e.target, el = t instanceof Node && t.instanceOf(HTMLElement) ? t : null;
		// writing: what's around the text goes, until the pointer moves
		const text = (e.key.length === 1 && !e.ctrlKey && !e.metaKey) || e.key === 'Enter' || e.key === 'Backspace';
		if (!text || !el?.matches('.cm-content') || !on.leafEl.contains(el)) return;
		on.doc.body.addClass('binders-focus-typing');
		on.doc.body.removeClass('binders-focus-paused');
		window.clearTimeout(on.pauseTimer);
		on.pauseTimer = window.setTimeout(() => on.doc.body.addClass('binders-focus-paused'), PAUSE);
	}

	/** Escape, when nothing above has taken it: it's still left to a field, a name being typed over, text being
	    composed, an editor with several cursors (the first Escape makes them one). Otherwise it leaves. */
	private onEscape(e: KeyboardEvent): boolean {
		const on = this.on, t = e.target, el = t instanceof Node && t.instanceOf(HTMLElement) ? t : null;
		if (!on || e.isComposing) return true;
		if (on.doc.querySelector('.suggestion-container, .popover.hover-popover, .menu')) return true;
		if (el && (el.matches('input, textarea, select') || (el.isContentEditable && !el.matches('.cm-content')))) return true;
		if (on.cm && on.cm.hasFocus && on.cm.state.selection.ranges.length > 1) return true;
		this.leave();
		return false;
	}

	// ---- typewriter scrolling ----

	/** Is the cursor on the last line of this editor's text (nothing but blank lines after the line it's on)? */
	private writingOn(cm: EditorView): boolean {
		const s = cm.state, sel = s.selection.main;
		if (!sel.empty || s.selection.ranges.length > 1) return false;
		const line = s.doc.lineAt(sel.head);
		return s.doc.length - line.to <= FAR && atEnd(s.doc.sliceString(line.from), sel.head - line.from);
	}

	/** Where on screen the line being written belongs in this scroller, or null when the page is left to scroll as it
	    always does: typewriter scrolling is off, the cursor isn't on the last line of its text, or it was just put
	    there by hand (the page never moves under the pointer). */
	line(scroller: HTMLElement, cm: EditorView, byHand = true): number | null {
		const on = this.on;
		if (!on || on.entering || !this.opt.focusTypewriter || !on.leafEl.contains(scroller) || (byHand && performance.now() - on.pointer.at < 500) || !this.writingOn(cm)) return null;
		const r = scroller.getBoundingClientRect(), vv = scroller.win.visualViewport;
		// (what can be seen of it: a phone's keyboard may lie over its foot)
		const bottom = Math.min(r.bottom, vv ? vv.offsetTop + vv.height : r.bottom);
		return r.top + (bottom - r.top) * LINE;
	}

	/** Moves a scroller by `by`, quickly and evenly (at once with reduced motion). Asked again before it's there, it
	    goes on to the new place from where it is: nothing adds up, nothing shakes. */
	glide(el: HTMLElement, by: number): void {
		const win = el.win, state = this.gliding.get(el) ?? { rest: 0, raf: 0 };
		this.gliding.set(el, state);
		win.cancelAnimationFrame(state.raf);
		state.rest = by;
		if (Math.abs(by) < 1) { state.rest = 0; return; }
		if (win.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(by) > el.clientHeight) { el.scrollTop += by; state.rest = 0; return; }
		const step = () => {
			const d = Math.abs(state.rest) < 1.5 ? state.rest : state.rest * 0.34, before = el.scrollTop;
			el.scrollTop = before + d;
			const moved = el.scrollTop - before;
			state.rest -= d;
			// (at the page's top or bottom there's no further to go)
			if (Math.abs(state.rest) < 0.5 || (Math.abs(moved) < 0.5 && Math.abs(d) >= 1)) { state.rest = 0; return; }
			state.raf = win.requestAnimationFrame(step);
		};
		state.raf = win.requestAnimationFrame(step);
	}

	/** The note view's own editor asks to show its cursor: on the last line of the text the page moves so that line is
	    the line being written; anywhere else the editor scrolls as it always does. (Obsidian gives a tab's editor a new
	    state when another note opens in it, which drops what was added: it's added again then.) */
	private typewriter(on: Active, view: MarkdownView): void {
		const cm = editorView(view);
		if (!cm || !EditorView.scrollHandler) return; // (no typewriter line: the editor scrolls as it always does)
		on.cm = cm;
		if (on.slot.get(cm.state) !== undefined) return;
		cm.dispatch({ effects: StateEffect.appendConfig.of(on.slot.of(EditorView.scrollHandler.of((v, range) => {
			const y = this.line(v.scrollDOM, v), c = y == null ? null : caretRect(v, range.head);
			if (y == null || !c) return false;
			this.glide(v.scrollDOM, c.top - y);
			return true;
		}))) });
	}

	/** Brings the line being written to its height (on the way in, and after going to the scene before): only when the
	    cursor is on the last line of its text. */
	private align(): void {
		const on = this.on;
		if (!on || !this.opt.focusTypewriter) return;
		window.setTimeout(() => {
			if (this.on !== on) return;
			const v = on.leaf.view, cm = v instanceof MarkdownView ? on.cm : v instanceof BinderView ? v.currentEditor() : null;
			const { scroller } = this.page(on);
			if (!cm || !cm.hasFocus || !scroller) return;
			const y = this.line(scroller, cm, false), c = y == null ? null : cm.coordsAtPos(cm.state.selection.main.head);
			if (y != null && c) this.glide(scroller, c.top - y);
		}, 60);
	}

	/** "Dim the background": while focus is on, the whole window has Obsidian's dark colors, by the class Obsidian's
	    own dark appearance puts on <body> (`theme-dark`, which is what its stylesheet, a theme and a snippet hang their
	    dark colors on: so text, links, code, tables and callouts are as they are in the dark, whatever is in them), and
	    over those the page's charcoal (`binders-focus-dark`, in styles.css). Off, or on leaving: as it was. */
	private dark(on: Active, want: boolean): void {
		const body = on.doc.body;
		if (want === !!on.dark) return;
		if (want) {
			// (as Obsidian says its appearance is; else as <body> says: it has one of the two classes, never both)
			on.dark = { light: lightTheme(this.plugin.app, on.doc.defaultView ?? window) ?? body.hasClass('theme-light') };
			body.addClass('binders-focus-dark', 'theme-dark');
			body.removeClass('theme-light');
			return;
		}
		// (asked again now: the appearance may have been changed while focus was on)
		const light = lightTheme(this.plugin.app, on.doc.defaultView ?? window) ?? on.dark?.light ?? false;
		on.dark = null;
		body.removeClass('binders-focus-dark');
		if (light) { body.removeClass('theme-dark'); body.addClass('theme-light'); }
	}

	// ---- what's on the page besides the text ----

	/** Puts on the page what the options say (and takes off what they don't): the place and synopsis, the numbers,
	    the scenes before and after, the typewriter line. Run again whenever an option, the note or its view changes. */
	private furnish(on: Active): void {
		const o = this.opt, view = on.leaf.view;
		on.doc.body.toggleClass('binders-focus-dim', o.focusDim);
		this.dark(on, o.focusDark);
		on.leafEl.toggleClass('has-place', o.focusPlace);
		on.leafEl.toggleClass('has-numbers', o.focusNumbers);
		on.leafEl.toggleClass('is-typewriter', o.focusTypewriter);
		if (o.focusPlace && !on.note) {
			on.note = createDiv({ cls: 'binders-focus-note' });
			on.note.createDiv({ cls: 'binders-focus-place' });
			on.note.createDiv({ cls: 'binders-focus-synopsis' });
			on.top.prepend(on.note);
		} else if (!o.focusPlace && on.note) { on.note.remove(); on.note = null; }
		if (o.focusNumbers && !on.corner) {
			const corner = on.corner = createDiv({ cls: 'binders-focus-corner', attr: { role: 'button', tabindex: '0', 'aria-haspopup': 'menu' } });
			corner.addEventListener('click', () => this.menu(corner));
			corner.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.menu(corner); } });
			corner.addEventListener('contextmenu', (e) => { e.preventDefault(); this.menu(corner); });
			view.containerEl.append(corner);
			// (the binder's total, for its menu: read once, in the background)
			const binder = this.binderOf(on);
			if (binder) this.words.sum(this.plugin.binders.scenes(binder.folder));
		} else if (!o.focusNumbers && on.corner) { on.corner.remove(); on.corner = null; }
		if (view instanceof MarkdownView) { this.typewriter(on, view); this.neighbours(on, view); }
		this.measure(on);
	}

	/** The end of the scene before above the note's text, and the start of the scene after below it, set as the
	    manuscript sets its sections, so a note in focus reads as its place in the manuscript. A click goes there. */
	private neighbours(on: Active, view: MarkdownView): void {
		const file = view.file, want = this.opt.focusNeighbours && !!file;
		const before = want ? this.neighbour(file, -1) : null, after = want ? this.neighbour(file, 1) : null;
		const key = want ? [file.path, view.getMode(), before?.path, after?.path].join('\n') : '';
		// (as they are: nothing to do; a note's text isn't moved for nothing)
		if (key === on.nearKey && on.near.every((el) => el.isConnected)) return;
		const col = want ? noteColumn(view) : null, hold = this.holder(on);
		for (const el of on.near) el.remove();
		on.near = [];
		if (on.nearComp) { on.comp.removeChild(on.nearComp); on.nearComp = null; }
		on.nearKey = key;
		on.leafEl.toggleClass('has-near', !!col);
		if (!want || !col) { hold(); return; }
		const comp = on.nearComp = on.comp.addChild(new Component()), store = this.plugin.binders;
		const make = (f: TFile, d: number): HTMLElement => {
			const el = createDiv({ cls: `binders-focus-near ${d < 0 ? 'is-before' : 'is-after'}`, attr: { role: 'link', tabindex: '0', 'aria-label': `${d < 0 ? 'Previous' : 'Next'} scene: ${f.basename}` } });
			// a folder that starts between the two is said, as the manuscript says it
			const later = d < 0 ? file : f, earlier = d < 0 ? f : file;
			const heading = later.parent && later.parent !== earlier.parent && (store.orderedChildren(later.parent) ?? []).find((c) => c instanceof TFile) === later ? later.parent.name : null;
			const head = () => { if (heading) el.createDiv({ cls: 'binders-manuscript-heading markdown-rendered' }).createEl('h1', { text: heading }); };
			if (d > 0) head();
			el.createDiv({ cls: 'binders-manuscript-break' }).createDiv({ cls: 'binders-manuscript-title', text: f.basename });
			const body = el.createDiv({ cls: 'binders-focus-near-text markdown-rendered' });
			void this.plugin.app.vault.cachedRead(f).then(async (raw) => {
				if (this.on !== on || on.nearComp !== comp) return;
				// (what's above the text is drawn without moving the text)
				const still = d < 0 ? this.holder(on) : null;
				await MarkdownRenderer.render(this.plugin.app, this.plugin.paragraphs.forRender(excerpt(raw, d < 0), f.path), body, f.path, comp);
				still?.();
			}).catch(() => { /* the note has gone: its title alone */ });
			if (d < 0) head();
			const go = (e: Event) => { e.preventDefault(); void this.go(on.leaf, f, d); };
			el.addEventListener('click', go);
			el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
			return el;
		};
		// this note's own title, as a section of the manuscript has it (its inline title is hidden with its properties)
		const here = createDiv({ cls: 'binders-focus-near is-here' });
		here.createDiv({ cls: 'binders-manuscript-break' }).createDiv({ cls: 'binders-manuscript-title', text: file.basename });
		if (before) { const el = make(before, -1); col.above(el); on.near.push(el); }
		col.above(here);
		on.near.push(here);
		if (after) { const el = make(after, 1); col.below(el); on.near.push(el); }
		hold();
	}

	/** Is there room beside the text for a note in the margin? (Else what's said there is a strip along the top.) And
	    how much room the editor keeps under its text, which the scene after is drawn up over. */
	private measure(on: Active): void {
		const view = on.leaf.view, { text } = this.page(on);
		const margin = text ? Math.max(0, (on.leafEl.clientWidth - text.clientWidth) / 2) : 0;
		on.leafEl.toggleClass('has-margins', margin >= 220 && readableLineLength(this.plugin.app));
		on.leafEl.style.setProperty('--binders-focus-margin', `${Math.round(margin)}px`);
		on.leafEl.style.setProperty('--binders-focus-tail', view instanceof MarkdownView && on.leafEl.hasClass('has-near') ? tailRoom(view) : '0px');
	}

	// ---- the numbers ----

	private store(): void { this.plugin.app.saveLocalStorage(SESSION, this.session.toJSON()); }

	/** The way of counting the day's notes were last counted by ("Count words as the exported book does", on or off). */
	private rule: boolean;

	/** The setting that says what a word is was changed (here, or while Obsidian was closed): the day's words are a
	    difference between two counts of each note, so every note counted today is counted again by the new way, and
	    what was written in it today stays what it was. Changing the setting neither adds to the day nor takes from it. */
	private ruled(): void {
		const now = this.plugin.settings.bookWords;
		if (now === this.rule) return;
		this.rule = now;
		this.plugin.app.saveLocalStorage(RULE, now);
		void this.recount();
	}
	private async recount(): Promise<void> {
		const { app } = this.plugin;
		// (a moment's typing not counted yet would be counted the new way against the old: it is let go, and the day
		// carries on from the note as it is saved)
		if (this.pendingTimer) { window.clearTimeout(this.pendingTimer); this.pending.clear(); this.pendingTimer = 0; }
		const files = this.session.paths().map((p) => app.vault.getAbstractFileByPath(p)).filter((f): f is TFile => f instanceof TFile);
		// what is typed and not saved yet is on disk before a note is read
		try { await saveOpen(app, files); } catch { /* counted as it is on disk */ }
		for (const f of files) {
			try { const n = wordsIn(this.plugin, await app.vault.cachedRead(f)); this.session.recount(f.path, n); this.onDisk.set(f.path, n); } catch { /* gone */ }
		}
		this.store();
		if (this.on) this.drawNow();
	}

	/** A note of a binder seen for the first time today: what it has now is what the day is counted from. */
	private seen(file: TFile): void {
		if (this.session.has(file.path)) return;
		void this.plugin.app.vault.cachedRead(file).then((text) => {
			this.session.roll(dayOf(new Date()), !!this.on);
			if (!this.session.has(file.path)) { const n = wordsIn(this.plugin, text); this.session.see(file.path, n); this.onDisk.set(file.path, n); this.keep(); }
		}, () => { /* gone */ });
	}

	/** How many words each note counted today has on disk, and the last texts its editors here have held: what tells
	    a save of what was typed here from words that arrived from elsewhere. A text held is kept as the editor's own
	    document (CodeMirror's, which never changes once made: keeping it is keeping a pointer), and read only when a
	    note lands on disk, and then only if it's as long as what landed. Nothing is read at a key, so a key costs the
	    same in a note of a hundred thousand words as in an empty one. (Without the editor's document, a short
	    fingerprint of the text, taken at each key.) */
	private onDisk = new Map<string, number>();
	private held = new Map<string, (Text | number)[]>();
	/** Notes that have just gained words from elsewhere, and how many: a note deleted right after, with that many
	    words, was merged into one of them. */
	private gained: { path: string; left: number; at: number }[] = [];

	private hold(path: string, editor: Editor): void {
		const list = this.held.get(path) ?? [], h = editorDoc(editor) ?? fingerprint(editor.getValue());
		if (list[list.length - 1] === h) return;
		list.push(h);
		if (list.length > 64) list.shift();
		this.held.set(path, list);
	}

	/** Is this text (a note as it is on disk) one its editor here holds or held? Whatever its line breaks: an editor
	    has one kind, a file may have the other. */
	private wasHeld(path: string, text: string): boolean {
		const list = this.held.get(path);
		if (!list?.length) return false;
		let plain: string | null = null, print: number | null = null;
		return list.some((h) => {
			if (typeof h === 'number') return h === (print ??= fingerprint(text));
			plain ??= text.replace(/\r/g, '');
			return h.length === plain.length && h.toString() === plain;
		});
	}

	/** A counted note was written. If it's a text an editor here holds or held, it's a save of what was typed here,
	    and already counted. Otherwise the change came from elsewhere (sync, another program): those words weren't
	    written here today, so the day is counted from that many more. */
	private async arrived(file: TFile): Promise<void> {
		let text: string;
		try { text = await this.plugin.app.vault.cachedRead(file); } catch { return; }
		// (what's typed and not counted yet is counted first)
		if (this.pendingTimer) { window.clearTimeout(this.pendingTimer); this.count(); }
		const n = wordsIn(this.plugin, text), was = this.onDisk.get(file.path);
		this.onDisk.set(file.path, n);
		if (was === undefined || n === was || this.wasHeld(file.path, text)) return;
		this.session.shift(file.path, n - was, was);
		if (n > was) { this.gained = this.gained.filter((g) => performance.now() - g.at < 5000); this.gained.push({ path: file.path, left: n - was, at: performance.now() }); }
		this.keep();
		if (this.on) this.draw();
	}

	/** What was typed since the last count, in notes of binders. */
	private count(): void {
		this.pendingTimer = 0;
		const typed = [...this.pending];
		this.pending.clear();
		for (const [file, editor] of typed) { if (this.scene(file)) { try { this.typed(file, editor.getValue()); } catch { /* the editor has gone */ } } }
	}

	/** A note's text as it is now (typed in the manuscript or in a tab, before it's saved). A note not seen yet today
	    is counted from what's in the vault, which is what it had before this typing. */
	typed(file: TFile, text: string): void {
		const n = wordsIn(this.plugin, text), s = this.session;
		this.words.typed(file, text);
		s.roll(dayOf(new Date()), !!this.on);
		if (s.has(file.path)) { s.see(file.path, n); this.keep(); if (this.on) this.draw(); return; }
		void this.plugin.app.vault.cachedRead(file).then((was) => wordsIn(this.plugin, was), () => n).then((base) => {
			s.see(file.path, n, base);
			if (!this.onDisk.has(file.path)) this.onDisk.set(file.path, base);
			this.keep();
			if (this.on) this.draw();
		});
	}

	private drawTimer = 0;
	private draw(): void {
		if (this.drawTimer || !this.on) return;
		this.drawTimer = window.setTimeout(() => { this.drawTimer = 0; this.drawNow(); }, 60);
	}

	private drawNow(): void {
		const on = this.on, binder = on ? this.binderOf(on) : null;
		if (!on || on.entering || !binder) return;
		const app = this.plugin.app, s = this.opt, file = this.current(on);
		const fm = file ? app.metadataCache.getFileCache(file)?.frontmatter ?? {} : {};
		if (on.note) {
			// where it is in the book: the folders down to it, then the scene (the binder's name only at its top)
			const place = on.note.children[0] as HTMLElement, synopsis = on.note.children[1] as HTMLElement;
			place.empty();
			const chain: string[] = [];
			for (let f = file?.parent ?? null; f && f !== binder.folder; f = f.parent) chain.unshift(f.name);
			if (!chain.length) chain.push(binder.folder.name);
			if (file) chain.push(file.basename);
			chain.forEach((name, i) => {
				if (i) setIcon(place.createSpan({ cls: 'binders-focus-sep', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
				place.createSpan({ cls: i === chain.length - 1 ? 'binders-focus-here' : '', text: name });
			});
			const syn: unknown = fm[s.synopsisProp];
			synopsis.setText(typeof syn === 'string' ? syn : '');
		}
		if (on.corner) {
			// the scene's words (with its target), then the day's (with its goal)
			on.corner.empty();
			const n = file ? this.words.get(file) : null, target = readTarget(fm[s.targetProp]);
			const scene = on.corner.createSpan({ cls: 'binders-focus-count binders-focus-scene' });
			if (n != null) scene.setText(target ? `${n.toLocaleString()} / ${target.toLocaleString()} words` : `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`);
			scene.toggleClass('is-complete', !!target && n != null && n >= target);
			const day = this.session.words(binder.folder.path), goal = s.focusGoal;
			const sess = on.corner.createSpan({ cls: 'binders-focus-count binders-focus-session', text: goal ? `${day.toLocaleString()} / ${goal.toLocaleString()} today` : `${day.toLocaleString()} today` });
			const reached = !!goal && day >= goal;
			sess.toggleClass('is-complete', reached);
			on.corner.setAttr('aria-label', `${n ?? 0} ${n === 1 ? 'word' : 'words'} in this scene, ${day} written today${goal ? `, of a goal of ${goal}` : ''}. Focus mode options`);
			// the goal reached: the numbers show, in the color of a target met, for a few seconds; nothing else happens
			if (reached && !on.reached) { const c = on.corner; c.addClass('is-reached'); window.setTimeout(() => c.removeClass('is-reached'), 6000); }
			on.reached = reached;
		}
	}

	// ---- the menu ----

	private async set(key: FocusToggle, value: boolean): Promise<void> {
		this.plugin.settings[key] = value;
		await this.plugin.saveSettings();
	}

	/** Focus mode's options and what else it can do, as items of a menu (its own, or under "Focus mode" in the editor's). */
	private fill(menu: Menu): void {
		const on = this.on, binder = on ? this.binderOf(on) : null;
		if (!on || !binder) return;
		const store = this.plugin.binders, s = this.opt, app = this.plugin.app, file = this.current(on);
		if (s.focusNumbers) {
			const total = this.words.sum(store.scenes(binder.folder)), note = store.folderNote(binder.folder), target = note ? readTarget(app.metadataCache.getFileCache(note)?.frontmatter?.[s.targetProp]) : 0;
			if (total != null) menu.addItem((i) => i.setSection('count').setTitle(`${binder.folder.name}: ${total.toLocaleString()}${target ? ` of ${target.toLocaleString()}` : ''} words`).setIsLabel(true));
		}
		for (const k of focusToggles(Platform.isMobile)) menu.addItem((i) => i.setSection('options').setTitle(FOCUS_TEXT[k][0]).setChecked(s[k]).onClick(() => void this.set(k, !s[k])));
		if (s.focusNumbers) {
			menu.addItem((i) => i.setSection('session').setTitle(s.focusGoal ? 'Change today’s goal...' : 'Set a goal for today...').setIcon('target').onClick(() => void this.askGoal()));
			menu.addItem((i) => i.setSection('session').setTitle('Start counting from here').setIcon('rotate-ccw').onClick(() => { this.session.reset(binder.folder.path); this.store(); this.drawNow(); }));
		}
		for (const d of [-1, 1]) {
			if (!this.step(d, true)) continue;
			const to = file && on.leaf.view instanceof MarkdownView ? this.neighbour(file, d) : null;
			menu.addItem((i) => i.setSection('go').setTitle(`${d < 0 ? 'Previous' : 'Next'} scene${to ? `: ${to.basename}` : ''}`).setIcon(d < 0 ? 'arrow-up' : 'arrow-down').onClick(() => { this.step(d, false); }));
		}
		menu.addItem((i) => i.setSection('leave').setTitle('Leave focus mode').setIcon('minimize-2').onClick(() => this.leave()));
	}

	private menu(at: HTMLElement): void {
		const on = this.on;
		if (!on) return;
		const menu = new Menu();
		this.fill(menu);
		const r = at.getBoundingClientRect(), below = r.top < on.leafEl.getBoundingClientRect().height / 2;
		menu.showAtPosition({ x: r.right, y: below ? r.bottom + 4 : r.top - 4, left: true }, on.doc);
	}

	private async askGoal(): Promise<void> {
		const s = this.opt;
		const typed = await ask(this.plugin.app, { title: 'Words to write today', placeholder: 'Words, such as 500', cta: 'Set goal', value: s.focusGoal ? String(s.focusGoal) : '', allowEmpty: true, numeric: true, check: (v: string) => (parseGoal(v) == null ? 'A goal is a whole number of words.' : null) });
		const n = typed == null ? null : parseGoal(typed);
		if (n == null || n === s.focusGoal) return;
		s.focusGoal = n;
		await this.plugin.saveSettings();
	}

}
