import { ItemView, Keymap, Menu, Notice, Platform, Scope, type Events, TFile, TFolder, setIcon, type PaneType, type TAbstractFile, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type { Binder } from '../binders';
import { CompileModal } from '../scenes';
import { folderSnapshotItems } from './snapshots'; // snapshots
import type BindersPlugin from '../main';
import { commitAll, commitFocused, editable, type Editable } from './edit';
import { keepOpen, readableLineLength, refreshHeader, selectMenuItem } from './internals';
import { canonical, labelDot, labelName, rank, readLabel } from './labels';
import { readArrangement, readLines, type Arrangement, type Lines } from './lanes-data';
import { ask } from './modals';
import { parseTarget, readTarget } from './outliner-data';
import type { BinderMode, ModeContext, ModeFactory, SceneProps } from './mode';
import type { EditorView } from '@codemirror/view'; // focus mode
import { WordCounter, wordsLabel } from './words';

/* The binder view: one folder of a binder, shown as a corkboard, an outliner or a manuscript. The view owns the toolbar
   (breadcrumb, word count, filter, mode), the folder's synopsis and the subscriptions; the mode draws the rest (mode.ts).
   Its state (folder, mode, filter, the modes' options) lives in the workspace, so it comes back after a reload. */

export const VIEW_TYPE = 'binders-view';

export type ModeName = 'corkboard' | 'outliner' | 'manuscript';
export const MODES: readonly { id: ModeName; name: string; icon: string }[] = [
	{ id: 'corkboard', name: 'Corkboard', icon: 'layout-grid' },
	{ id: 'outliner', name: 'Outliner', icon: 'list-tree' },
	{ id: 'manuscript', name: 'Manuscript', icon: 'scroll-text' },
];
/** The corkboard arranged by label isn't a mode of its own: it's the board the corkboard shows while "Arrange" says
    by label (`arrange` in the view's options). This is its place among the plugin's mode factories. */
export const BY_LABEL = 'corkboard-by-label';
/** The "Arrange" menu's three choices, one of them ticked: which way the lines run is part of the arrangement. The
    button wears the icon of the one chosen. (`arrange` and `lines` are still two options, as saved workspaces have them.) */
const ARRANGEMENTS: readonly { arrange: Arrangement; lines?: Lines; title: string; icon: string }[] = [
	{ arrange: 'grid', title: 'In a grid', icon: 'layout-grid' },
	{ arrange: 'label', lines: 'across', title: 'By label, across', icon: 'rows-3' },
	{ arrange: 'label', lines: 'down', title: 'By label, down', icon: 'columns-3' },
];
/** And its two switches, for the lines by label: the option each is kept in, and how it stands until it's flipped. */
const LINE_SWITCHES: readonly { key: string; title: string; icon: string; on: boolean }[] = [
	{ key: 'linesFlat', title: 'Show notes in subfolders', icon: 'folder-open', on: false },
	{ key: 'linesUnused', title: 'Show unused labels', icon: 'tags', on: true },
];
const isMode = (m: unknown): m is ModeName => MODES.some((x) => x.id === m);
/** A mode as saved: the plot grid of earlier versions is the outliner now. */
const readMode = (m: unknown): ModeName | null => (m === 'plotgrid' ? 'outliner' : isMode(m) ? m : null);

interface Filter { status: string[]; label: string[] }
interface BinderViewState { folder?: string; mode?: ModeName; filter?: Filter; options?: Record<string, unknown> }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : '');

/** Folders renamed or moved since Obsidian started, old path to new, so a tab's history (Back) still finds them. */
const moved = new Map<string, string>();
function followMoves(path: string): string {
	for (let i = 0; i < 32; i++) {
		const hit = [...moved].find(([from]) => path === from || path.startsWith(from + '/'));
		if (!hit) break;
		path = hit[1] + path.slice(hit[0].length);
	}
	return path;
}

/** A mode that isn't built yet: an empty state, like Obsidian's own. */
const comingSoon = (name: string): ModeFactory => (el) => ({
	render() {
		const box = el.createDiv({ cls: 'binders-empty' });
		box.createDiv({ cls: 'binders-empty-title', text: `${name} is coming soon` });
		box.createDiv({ cls: 'binders-empty-text', text: 'Switch to the corkboard to see this folder.' });
	},
	refresh() { /* nothing to update */ },
	unload() { el.empty(); },
});

export class BinderView extends ItemView {
	navigation = true;
	/** The folder shown, and its path (kept when the folder isn't there, e.g. before binders are found at startup). */
	folder: TFolder | null = null;
	private path = '';
	mode: ModeName = 'corkboard';
	private filter: Filter = { status: [], label: [] };
	private options: Record<string, unknown> = {};
	private binder: Binder | null = null;
	private current: BinderMode | null = null;
	private words: WordCounter;
	private identity = '';
	private timer = 0;
	private reveal: string | null = null;
	/** Binders have been looked for with the metadata cache complete (until then, a folder not found yet may still be
	    found: the view says it's loading, not that the folder isn't in a binder). */
	private found = false;
	private synopsis: Editable | null = null;
	private relaying = false;
	private ui: { crumbs: HTMLElement; progress: HTMLElement; count: HTMLElement; filter: HTMLElement; arrange: HTMLElement; add: HTMLElement; modeBtn: HTMLElement; notice: HTMLElement; synopsis: HTMLElement; body: HTMLElement } | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: BindersPlugin) {
		super(leaf);
		this.words = new WordCounter(this.app, () => this.schedule());
		// Mod-Enter saves a synopsis. Obsidian's own Mod-Enter ("Open link in new tab") would otherwise take it when an
		// editor was active last.
		this.scope = new Scope(this.app.scope);
		this.scope.register(['Mod'], 'Enter', () => !commitFocused());
		// F2 renames the focused card or row, as it renames the focused item in the file explorer. Obsidian's own F2
		// ("Rename file") would otherwise take it before the view sees it: pass it on to what has the focus.
		// Mod+Z takes back the last move (a drop, Move up) when it isn't for text being typed; Mod+Shift+Z (or Mod+Y)
		// makes it again. Anywhere text is edited, undo stays the text's own.
		const undo = (redo: boolean) => () => {
			const el = this.contentEl.doc.activeElement;
			if (!this.folder || (el?.instanceOf(HTMLElement) && (el.isContentEditable || el.matches('input, textarea, .cm-content')))) return true;
			if (!this.plugin.binders.undoable(this.folder, redo)) return true;
			void this.plugin.undoMove(this.folder, redo);
			return false;
		};
		this.scope.register(['Mod'], 'z', undo(false));
		this.scope.register(['Mod', 'Shift'], 'z', undo(true));
		this.scope.register(['Mod'], 'y', undo(true));
		this.scope.register([], 'F2', () => {
			const el = this.contentEl.doc.activeElement;
			// (in the manuscript, F2 in a section's text renames that section, as F2 in a note renames the note)
			const section = !!el?.instanceOf(HTMLElement) && el.matches('.cm-content') && !!el.closest('.binders-manuscript-scene');
			if (this.relaying || !el?.instanceOf(HTMLElement) || !this.contentEl.contains(el) || (!section && el.matches('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"], .cm-content'))) return true;
			this.relaying = true;
			try { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true, cancelable: true })); } finally { this.relaying = false; }
			return false;
		});
	}

	getViewType(): string { return VIEW_TYPE; }
	getIcon(): string { return 'book'; }
	getDisplayText(): string { return this.folder?.name ?? (this.path.split('/').pop() || 'Binder'); }

	get store() { return this.plugin.binders; }
	get readOnly(): boolean { return !!this.binder?.problem; }

	getState(): Record<string, unknown> {
		this.remember();
		return { ...super.getState(), folder: this.folder?.path ?? this.path, mode: this.mode, filter: this.filter, options: this.options };
	}

	/** How this view is set up now is what the binder's next view starts from (see openBinder). */
	private remember(): void {
		if (this.binder) this.plugin.lastView.set(this.binder.note.path, { mode: this.mode, filter: this.filter, options: this.options });
	}

	/** Puts the keyboard in the mode (on what it was on, or at its start). */
	focusMode(): void { this.current?.focus?.(); }

	// focus mode >>>
	/** The note the mode is on (the manuscript's section with the cursor): focus mode says where that is. */
	currentItem(): TAbstractFile | null { return this.current?.current?.() ?? null; }
	/** The editor that has the cursor, if the mode has one. */
	currentEditor(): EditorView | null { return this.current?.editor?.() ?? null; }
	/** "Go to previous scene" and "Go to next scene" in the manuscript. */
	stepScene(delta: number, checking: boolean): boolean { return this.current?.stepScene?.(delta, checking) ?? false; }
	// <<< focus mode

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = (state ?? {}) as BinderViewState;
		// another folder is a step in the tab's history, so Back returns to this one
		// (and a change to the layout, as opening another note in a tab is: Obsidian's Back and Forward buttons, a
		// phone's too, look at the tab's history again when the layout changes)
		if (typeof s.folder === 'string' && s.folder !== this.path) {
			if (this.path) {
				result.history = true;
				// (a phone's bar of buttons looks at the tab's history only when the tab in front changes: it's told,
				// once the step is in the history, so its Back and Forward are lit when there's somewhere to go)
				window.setTimeout(() => { if (this.app.workspace.getMostRecentLeaf() === this.leaf && this.app.workspace.getActiveViewOfType(BinderView) === this) this.app.workspace.trigger('active-leaf-change', this.leaf); }, 60);
			}
			this.path = s.folder;
		}
		this.mode = readMode(s.mode) ?? this.mode;
		// (as settings spell them: a filter saved as "draft" still means Draft)
		const st = this.plugin.settings;
		if (s.filter && typeof s.filter === 'object') this.filter = { status: strings(s.filter.status).map((x) => canonical(x, st.statuses)), label: strings(s.filter.label).map((x) => canonical(x, st.labels.map((l) => l.name))) };
		if (s.options && typeof s.options === 'object') this.options = { ...s.options };
		await super.setState(state, result);
		this.rebuild();
		// binders are found once the layout is ready, and for sure once the metadata cache is complete; a view restored
		// before that shows it's loading, and draws again then (never awaited here: the layout waits for this)
		void this.store.settled.then(() => {
			this.found = true;
			if (!this.folder) this.rebuild(); else this.schedule();
		});
	}

	/** What the mode was on when it was opened: only a move from there is carried to the next mode. */
	private enteredOn: TAbstractFile | null = null;

	/** The view was asked to take the focus (Obsidian's `focus` in the state it opens a view with). */
	private wantFocus = false;

	setEphemeralState(state: unknown): void {
		const s = (state ?? {}) as { reveal?: unknown; place?: unknown; places?: unknown; focus?: unknown };
		if (typeof s.reveal === 'string') { this.reveal = s.reveal; this.applyReveal(); }
		// Back to this view: where it was scrolled to, and what was selected; and where its other modes were left
		if (Array.isArray(s.places)) for (const e of s.places as unknown[]) if (Array.isArray(e) && typeof e[0] === 'string' && !this.places.has(e[0])) this.places.set(e[0], e[1]);
		if (s.place !== undefined) this.restorePlace(s.place);
		// (the keyboard last, so it goes where the place says it was)
		if (s.focus === true) { if (this.current) this.current.focus?.(); else this.wantFocus = true; }
		super.setEphemeralState(state);
	}

	getEphemeralState(): Record<string, unknown> {
		this.keepPlace();
		return { ...super.getEphemeralState(), place: this.placeNow(), places: [...this.places] };
	}

	/** Where each mode was left, by folder, so a look at another mode (or folder) comes back to the same place. */
	private places = new Map<string, unknown>();
	private placeKey(): string { return `${this.mode}${this.arrangement === 'label' ? ' by label' : ''}\n${this.folder?.path ?? this.path}`; }
	private placeNow(): unknown { return this.current?.place ? { key: this.placeKey(), at: this.current.place() } : undefined; }
	private restorePlace(place: unknown): void {
		const p = place as { key?: unknown; at?: unknown } | null;
		if (p && p.key === this.placeKey() && this.current?.restore) this.current.restore(p.at);
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('binders-view');
		// the manuscript's page follows the editor's "Readable line length", as a note does
		const readable = () => this.contentEl.toggleClass('is-readable-line-width', readableLineLength(this.app));
		readable();
		this.registerEvent((this.app.vault as Events).on('config-changed', readable));
		// The app going to the background (another app in front, the screen off): on a phone it may never come back, and
		// nothing says so first. What's being typed is written there and then: a title or synopsis in its field (which
		// stays open, to carry on with), and the manuscript's sections.
		// A ring around what has the focus is for a keyboard: after a touch nothing shows one, until a key that moves
		// the focus is pressed (a tablet with a keyboard beside it).
		this.registerDomEvent(this.contentEl, 'touchstart', () => this.contentEl.addClass('is-touch'), { passive: true });
		this.registerDomEvent(this.contentEl, 'keydown', (e) => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) this.contentEl.removeClass('is-touch'); });
		for (const type of ['pointerdown', 'keydown'] as const) this.registerDomEvent(this.contentEl, type, () => { this.presses++; }, { capture: true, passive: true });
		const away = () => { void commitAll(this.contentEl, true); void this.current?.save?.(); };
		this.registerDomEvent(this.contentEl.doc, 'visibilitychange', () => { if (this.contentEl.doc.visibilityState === 'hidden') away(); });
		this.registerDomEvent(this.contentEl.win, 'pagehide', away);
		const { vault, metadataCache } = this.app;
		const ref = this.store.on('changed', (p: string) => {
			const f = this.folder?.path ?? this.path;
			if (!p || !this.binder || f === p || f.startsWith(p + '/')) this.schedule();
		});
		this.register(() => this.store.offref(ref));
		this.registerEvent(metadataCache.on('changed', (file) => {
			const f = this.folder;
			if (f && (file.path.startsWith(f.path + '/') || file === this.binder?.note)) this.schedule();
		}));
		this.registerEvent(vault.on('rename', (file, old) => {
			if (file instanceof TFolder) { moved.delete(file.path); moved.set(old, file.path); }
			if (!this.folder || !(file instanceof TFolder) || (file !== this.folder && !this.folder.path.startsWith(file.path + '/'))) return;
			this.path = this.folder.path;
			refreshHeader(this);
			this.app.workspace.requestSaveLayout();
			this.schedule();
		}));
	}

	async onClose(): Promise<void> {
		await commitAll(this.contentEl);
		this.places.clear();
		this.leftOn.clear();
		window.clearTimeout(this.timer);
		this.current?.unload();
		this.current = null;
	}

	onPaneMenu(menu: Menu, source: string): void {
		if (source === 'more-options' && this.folder) {
			// the modes, then how this one shows (a section each), then the note behind the folder
			for (const m of MODES) menu.addItem((i) => i.setSection('binders-mode').setTitle(m.name).setIcon(m.icon).setChecked(this.mode === m.id).onClick(() => this.setMode(m.id)));
			if (this.mode === 'corkboard') this.arrangeItems(menu);
			this.current?.menu?.(menu);
			const note = this.store.folderNote(this.folder), binder = this.store.binderOf(this.folder)?.folder === this.folder;
			const folder = this.folder;
			// (a move taken back or made again: on a phone there's no Ctrl+Z to do it with)
			for (const redo of [false, true]) {
				const what = this.store.undoable(folder, redo);
				if (what) menu.addItem((i) => i.setSection('binders-note').setTitle(`${redo ? 'Redo' : 'Undo'}: ${what.charAt(0).toLowerCase()}${what.slice(1)}`).setIcon(redo ? 'redo-2' : 'undo-2').onClick(() => void this.plugin.undoMove(folder, redo)));
			}
			menu.addItem((i) => i.setSection('binders-note').setTitle('Compile...').setIcon('book-check').onClick(() => new CompileModal(this.plugin, folder).open()));
			folderSnapshotItems(this.plugin, menu, folder, 'binders-note', this.readOnly); // snapshots
			if (note) menu.addItem((i) => i.setSection('binders-note').setTitle(binder ? 'Open binder note' : 'Open folder note').setIcon('file-text').onClick((e) => void this.app.workspace.getLeaf(Keymap.isModEvent(e)).openFile(note)));
		}
		super.onPaneMenu(menu, source);
	}

	/** Notes what the mode is on as it starts: now, and again a moment later if nothing has been pressed meanwhile
	    (the manuscript puts its cursor once its editor has loaded, which is after this). */
	private entered(): void {
		this.plugin.focus?.check(); // focus mode: it ends if this is no longer the manuscript
		this.enteredOn = this.current?.current?.() ?? null;
		const mode = this.current, presses = this.presses;
		window.setTimeout(() => { if (this.current === mode && this.presses === presses) this.enteredOn = mode?.current?.() ?? null; }, 500);
	}
	private presses = 0;

	/** What the last switch of mode was carried to (see setMode). */
	private carried: TAbstractFile | null = null;

	/** Switches the view to another mode (the "Show corkboard" commands, the mode menu). */
	setMode(mode: ModeName): void {
		if (mode === this.mode) return;
		this.keepPlace();
		// the card, row or section the writer went to in this mode is the one the next mode opens on (if they went
		// nowhere, the next mode opens where it was left)
		// (and it stays the one through a second switch, until they go to something else)
		const now = this.current?.current?.() ?? null, on = now && now !== this.enteredOn ? now : this.carried;
		this.carried = on;
		this.mode = mode;
		this.remember();
		this.rebuild();
		// (a mode that was left on that very item has just been put back where it was, with it selected: a look at
		// another mode and back doesn't move the page, whether or not the item is in sight)
		if (on && this.app.vault.getAbstractFileByPath(on.path) === on && this.leftOn.get(this.placeKey()) !== on.path) this.current?.reveal?.(on);
		this.app.workspace.requestSaveLayout();
		// the keyboard carries on in the new mode: where it was before, or at its start
		if (this.app.workspace.getActiveViewOfType(BinderView) === this) this.current?.focus?.();
		// (where the mode starts, the keyboard put there included, isn't somewhere the writer went)
		this.entered();
	}

	/** How the corkboard's cards are arranged: in a grid, or by label (each label a line, the cards along them). */
	get arrangement(): Arrangement { return this.mode === 'corkboard' ? readArrangement(this.options.arrange) : 'grid'; }

	/** Arranges the corkboard's cards another way ("Arrange" in the toolbar, the command), with the lines across or
	    down if that's said too (else as they last were): one change of the view's options. Another board is made on
	    the card the first was on; the same board with its lines turned draws itself again. */
	arrange(to: Arrangement, lines?: Lines): void {
		if (this.mode !== 'corkboard') return;
		const swap = to !== this.arrangement, turn = lines !== undefined && lines !== readLines(this.options.lines);
		if (!swap && !turn) return;
		const options = { ...this.options, arrange: to, ...(lines ? { lines } : {}) };
		if (!swap) { this.setOptions(options); return; }
		this.keepPlace();
		// (the card the writer went to is the one the other board opens on, as when the mode is switched: one a
		// switch of mode carried here is still it, until they go to something else)
		const now = this.current?.current?.() ?? null, on = now && now !== this.enteredOn ? now : this.carried;
		this.carried = on;
		const focused = this.contentEl.contains(this.contentEl.doc.activeElement);
		this.options = options;
		this.remember();
		this.rebuild();
		if (on && this.app.vault.getAbstractFileByPath(on.path) === on) this.current?.reveal?.(on);
		this.app.workspace.requestSaveLayout();
		if (focused || this.app.workspace.getActiveViewOfType(BinderView) === this) this.current?.focus?.();
		this.entered();
	}

	/** The board stays and shows itself by other options (its lines turned, what's on them). */
	private setOptions(options: Record<string, unknown>): void {
		this.options = options;
		this.remember();
		this.app.workspace.requestSaveLayout();
		this.drawToolbar();
		this.current?.refresh();
	}

	/** The corkboard's arrangement as the "Arrange" menu lists it and its button shows it: which of the three. */
	private arranged(): typeof ARRANGEMENTS[number] {
		const by = this.arrangement, lines = readLines(this.options.lines);
		return ARRANGEMENTS.find((a) => a.arrange === by && (by === 'grid' || a.lines === lines)) ?? ARRANGEMENTS[0];
	}

	/** The "Arrange" menu: the three arrangements, one ticked, then what the lines by label show. Always the same
	    items, whatever is chosen (in the grid the lines' two switches can't be flipped, and still say how they stand),
	    and the same wherever they're listed: the toolbar's button, the corkboard's part of "More options", the menu of
	    the board by label. */
	arrangeItems(menu: Menu): void {
		const now = this.arranged(), grid = now.arrange === 'grid';
		for (const a of ARRANGEMENTS) menu.addItem((i) => i.setSection('binders-arrange').setTitle(a.title).setIcon(a.icon).setChecked(a === now).onClick(() => this.arrange(a.arrange, a.lines)));
		for (const s of LINE_SWITCHES) {
			// (a Longform project has no folders inside it, so no notes in them to show)
			if (s.key === 'linesFlat' && this.binder?.kind === 'longform') continue;
			const on = () => (s.key in this.options ? this.options[s.key] === true : s.on);
			const flip = (): boolean => { const to = !on(); this.setOptions({ ...this.options, [s.key]: to }); return to; };
			menu.addItem((i) => {
				i.setSection('binders-arrange-show').setTitle(s.title).setIcon(s.icon).setChecked(on()).setDisabled(grid).onClick(() => { flip(); });
				// the menu stays while they're flipped, each tick following (where this Obsidian can't, it closes, as any menu does)
				if (!grid) keepOpen(i, flip);
			});
		}
	}

	private keepPlace(): void {
		if (!this.current?.place || !this.folder) return;
		this.places.set(this.placeKey(), this.current.place());
		this.leftOn.set(this.placeKey(), this.current.current?.()?.path ?? null);
	}
	/** What each mode was on when it was left (by the same key as its place): coming back to it still on that, it's
	    where it was left, not scrolled to that item. */
	private leftOn = new Map<string, string | null>();

	/** Shows another folder, recorded in the tab's history so Back returns. */
	async navigate(folder: TFolder, newLeaf?: boolean | PaneType): Promise<void> {
		if (newLeaf) { await this.plugin.openBinder(folder, newLeaf); return; }
		this.keepPlace();
		await this.leaf.setViewState({ type: VIEW_TYPE, state: { ...this.getState(), folder: folder.path }, active: true });
	}

	// ---- drawing ----

	/** Changes throttled to one redraw per frame or so: typing in a note changes its word count often. */
	private schedule(): void {
		if (this.timer) return;
		this.timer = window.setTimeout(() => { this.timer = 0; this.refresh(); }, 80);
	}

	private resolve(): void {
		let f = this.app.vault.getAbstractFileByPath(this.path);
		// a folder renamed since this view was on it (Back to it, after a rename)
		if (!(f instanceof TFolder)) {
			const to = followMoves(this.path), g = to !== this.path ? this.app.vault.getAbstractFileByPath(to) : null;
			if (g instanceof TFolder) { f = g; this.path = to; }
		}
		// the folder shown was deleted: the nearest folder above it that's still in a binder is shown instead
		if (!(f instanceof TFolder) && this.found) {
			for (let p = this.path; p.includes('/');) {
				p = p.slice(0, p.lastIndexOf('/'));
				const up = this.app.vault.getAbstractFileByPath(p);
				if (up instanceof TFolder && this.store.binderOf(up)) { f = up; this.path = p; this.app.workspace.requestSaveLayout(); break; }
			}
		}
		this.folder = f instanceof TFolder ? f : null;
		this.binder = this.folder ? this.store.binderOf(this.folder) : null;
		if (!this.binder) this.folder = null;
	}

	/** What the whole view depends on: when it changes, the mode is made again. */
	private key(): string { return JSON.stringify([this.folder?.path, this.binder?.note.path, this.binder?.kind, this.binder?.problem, this.mode, this.arrangement]); }

	private rebuild(): void {
		void commitAll(this.contentEl);
		this.current?.unload();
		this.current = null;
		this.synopsis = null;
		this.resolve();
		this.identity = this.key();
		// (the file explorer marks the folder shown, as it marks the open note)
		this.plugin.explorer?.active();
		const el = this.contentEl;
		el.empty();
		this.ui = null;
		refreshHeader(this);
		if (!this.folder) {
			const box = el.createDiv({ cls: 'binders-empty' });
			if (!this.found) {
				// quiet, and only after a moment (CSS), so a quick start shows nothing at all
				box.addClass('is-loading');
				box.createDiv({ cls: 'binders-empty-text', text: 'Loading…', attr: { role: 'status' } });
				return;
			}
			box.createDiv({ cls: 'binders-empty-title', text: 'This folder isn’t in a binder' });
			box.createDiv({ cls: 'binders-empty-text', text: this.path ? `“${this.path}” was moved or deleted, or is no longer part of a binder.` : 'Open a binder from the file explorer.' });
			return;
		}
		// laid out as a base's toolbar is: the view on the left, then where it is and what it holds, then its actions
		const bar = el.createDiv({ cls: 'binders-toolbar' });
		const modeBtn = this.button(bar, 'layout-grid', 'Corkboard', 'binders-mode-button', (e) => this.modeMenu(e));
		setIcon(modeBtn.createSpan({ cls: 'text-button-icon mod-aux' }), 'chevrons-up-down');
		const crumbs = bar.createEl('nav', { cls: 'binders-breadcrumbs', attr: { 'aria-label': 'Folders' } });
		bar.createDiv({ cls: 'binders-toolbar-spacer' });
		const progress = bar.createDiv({ cls: 'binders-progress is-hidden', attr: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' } });
		progress.createDiv({ cls: 'binders-progress-bar' });
		// (a click on the count sets the target of the folder shown: the binder's own, on the binder)
		const count = bar.createDiv({ cls: 'binders-word-count', attr: { role: 'button', tabindex: '0' } });
		count.addEventListener('click', () => void this.setTarget());
		count.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void this.setTarget(); } });
		// (how the corkboard lays out its cards, where a base has "Sort": in a grid, or by label)
		const arrange = this.button(bar, 'layout-grid', 'Arrange', 'binders-arrange-button', (e) => { const menu = new Menu(); this.arrangeItems(menu); this.showBelow(menu, e); });
		const filter = this.button(bar, 'list-filter', 'Filter', 'binders-filter-button', (e) => this.filterMenu(e));
		const add = this.button(bar, 'plus', 'New', 'binders-new-button', (e) => this.newMenu(e));
		this.button(bar, 'maximize-2', 'Focus mode', 'binders-focus-button', () => this.plugin.focus.toggle()).toggleClass('is-hidden', this.mode !== 'manuscript');
		for (const b of [filter, arrange, modeBtn, add]) b.setAttr('aria-haspopup', 'menu');
		const notice = el.createDiv({ cls: 'binders-notice' });
		const synopsis = el.createDiv({ cls: 'binders-view-synopsis-row' });
		const body = el.createDiv({ cls: `binders-mode binders-mode-${this.mode}` });
		this.ui = { crumbs, progress, count, filter, arrange, add, modeBtn, notice, synopsis, body };
		this.drawToolbar();
		const factory = this.plugin.modeFactories[this.arrangement === 'label' ? BY_LABEL : this.mode] ?? comingSoon(MODES.find((m) => m.id === this.mode)?.name ?? 'This view');
		this.current = factory(body, this.context());
		this.current.render();
		if (this.current.adopt) { synopsis.addClass('is-adopted'); this.current.adopt(synopsis); }
		filter.toggleClass('is-hidden', !this.current.filters);
		add.toggleClass('is-hidden', !this.current.newMenu || this.readOnly);
		// (again, now that there's a mode: what the count says depends on whether the mode filters)
		this.drawToolbar();
		// (last, with everything above the page's text drawn: the place is measured from the top)
		const was = this.places.get(this.placeKey());
		if (was !== undefined) this.current.restore?.(was);
		this.applyReveal();
		// the keyboard is in the view it's looking at: after going into a folder, up by the breadcrumb, or Back
		if (this.wantFocus || (this.app.workspace.getActiveViewOfType(BinderView) === this && this.contentEl.doc.activeElement === this.contentEl.doc.body)) this.current.focus?.();
		this.wantFocus = false;
		this.entered();
	}

	private refresh(): void {
		this.resolve();
		// (made again, where it was: the same folder may have become another kind of binder, or read only)
		if (this.key() !== this.identity) { this.keepPlace(); this.rebuild(); return; }
		if (!this.folder) return;
		this.drawToolbar();
		this.current?.refresh();
	}

	private button(parent: HTMLElement, icon: string, label: string, cls: string, onClick: (e: MouseEvent) => void): HTMLElement {
		const b = parent.createDiv({ cls: ['text-icon-button', 'binders-toolbar-button', cls], attr: { role: 'button', tabindex: '0', 'aria-label': label } });
		setIcon(b.createSpan({ cls: 'text-button-icon' }), icon);
		b.createSpan({ cls: 'text-button-label', text: label });
		b.addEventListener('click', onClick);
		b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
		return b;
	}

	private drawToolbar(): void {
		const ui = this.ui, folder = this.folder, binder = this.binder;
		if (!ui || !folder || !binder) return;
		// breadcrumb: the binder, then each folder down to this one
		ui.crumbs.empty();
		const chain: TFolder[] = [];
		for (let f: TFolder | null = folder; f; f = f === binder.folder ? null : f.parent) chain.unshift(f);
		ui.crumbs.toggleClass('is-root', chain.length < 2);
		// (on a phone the folder shown is named in the header above: the breadcrumb is the way up, with an arrow)
		if (chain.length > 1) {
			const up = ui.crumbs.createSpan({ cls: 'binders-crumb-up', attr: { 'aria-hidden': 'true' } });
			setIcon(up, 'arrow-up-left');
			up.addEventListener('click', () => void this.navigate(chain[chain.length - 2]));
			up.dataset.path = chain[chain.length - 2].path;
		}
		chain.forEach((f, i) => {
			if (i) setIcon(ui.crumbs.createSpan({ cls: 'binders-crumb-sep', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
			const last = i === chain.length - 1;
			const c = ui.crumbs.createSpan({ cls: 'binders-crumb' + (last ? ' is-current' : ''), text: f.name });
			if (last) { c.setAttr('aria-current', 'page'); return; }
			c.setAttrs({ role: 'link', tabindex: '0' });
			// (cards dragged onto it go to that folder: the way out of the folder shown)
			c.dataset.path = f.path;
			c.addEventListener('click', (e) => void this.navigate(f, Keymap.isModEvent(e)));
			c.addEventListener('auxclick', (e) => { if (e.button === 1) void this.navigate(f, 'tab'); });
			c.addEventListener('keydown', (e) => { if (e.key === 'Enter') void this.navigate(f, Keymap.isModEvent(e)); });
		});
		// word count, with the binder's target on the binder itself
		const all = this.store.scenes(folder), n = this.words.sum(all);
		// with a filter on, the words of the notes that pass, out of all of them
		const filtering = this.filter.status.length + this.filter.label.length > 0 && !!this.current?.filters, shown = filtering ? this.words.sum(all.filter((f) => this.visible(f))) : null;
		// with the target of the folder shown: the binder's own, or a subfolder's from its folder note
		const note = this.store.folderNote(folder), goal = note ? this.props(note).target : 0;
		const whose = folder === binder.folder ? 'the binder’s' : 'this folder’s';
		ui.count.toggleClass('is-clickable', !this.readOnly);
		if (n != null) {
			ui.count.setText(shown != null ? `${shown.toLocaleString()} of ${wordsLabel(n)}` : goal ? `${n.toLocaleString()} / ${wordsLabel(goal)}` : wordsLabel(n));
			const what = shown != null ? 'Words in the notes that pass the filter' : goal ? `${Math.floor((n / goal) * 100)}% of ${whose} target` : 'Words in this folder';
			ui.count.setAttr('aria-label', this.readOnly ? what : `${what}. ${goal ? 'Change' : 'Set'} ${whose} target`);
			ui.count.toggleClass('is-complete', !!goal && n >= goal);
			// and how far along that is, as a bar
			const pct = goal ? Math.min(100, Math.floor((n / goal) * 100)) : 0;
			ui.progress.toggleClass('is-hidden', !goal);
			ui.progress.toggleClass('is-complete', !!goal && n >= goal);
			ui.progress.setAttrs({ 'aria-valuenow': String(pct), 'aria-label': 'Progress to the target' });
			ui.progress.querySelector<HTMLElement>('.binders-progress-bar')?.setCssStyles({ width: `${pct}%` });
		}
		// the filter, when on, says how many values it keeps; only for modes that filter
		ui.filter.toggleClass('is-hidden', !this.current?.filters);
		const on = this.filter.status.length + this.filter.label.length;
		ui.filter.toggleClass('is-active', on > 0);
		ui.filter.querySelector('.text-button-label')?.setText(on ? `Filter (${on})` : 'Filter');
		// "Arrange", on the corkboard: always called that; its icon says how (and its name, to a screen reader)
		const how = this.arranged();
		ui.arrange.toggleClass('is-hidden', this.mode !== 'corkboard');
		ui.arrange.toggleClass('is-active', how.arrange === 'label');
		ui.arrange.setAttr('aria-label', `Arrange: ${how.title.charAt(0).toLowerCase()}${how.title.slice(1)}`);
		setIcon(ui.arrange.querySelector<HTMLElement>('.text-button-icon'), how.icon);
		const mode = MODES.find((m) => m.id === this.mode);
		setIcon(ui.modeBtn.querySelector<HTMLElement>('.text-button-icon'), mode.icon);
		ui.modeBtn.querySelector('.text-button-label')?.setText(mode.name);
		ui.modeBtn.setAttr('aria-label', `View as: ${mode.name}`);
		// a newer-format binder: say why nothing can change
		ui.notice.empty();
		ui.notice.toggleClass('is-shown', this.readOnly);
		if (this.readOnly) {
			setIcon(ui.notice.createSpan({ cls: 'binders-notice-icon' }), 'lock');
			ui.notice.createSpan({ text: `Read only. ${binder.problem}` });
		}
		this.drawSynopsis();
	}

	/** The folder's own synopsis (its folder note, or the binder note), edited in place. */
	private drawSynopsis(): void {
		const ui = this.ui, folder = this.folder;
		if (!ui || !folder || this.synopsis?.editing) return;
		const note = this.store.folderNote(folder);
		const value = note ? this.props(note).synopsis : '';
		ui.synopsis.empty();
		ui.synopsis.toggleClass('is-hidden', this.readOnly && !value);
		this.synopsis = editable(ui.synopsis, {
			cls: 'binders-view-synopsis', value, placeholder: 'Add a synopsis', label: `Synopsis of ${folder.name}`, readOnly: this.readOnly, focusable: true,
			save: async (t) => { const f = await this.store.ensureFolderNote(folder); await this.setProps(f, { synopsis: t }); },
			onEditing: (on) => { if (!on) this.schedule(); },
		});
	}

	private applyReveal(): void {
		if (!this.reveal || !this.current) return;
		const f = this.app.vault.getAbstractFileByPath(this.reveal);
		this.reveal = null;
		if (f) this.current.reveal?.(f, this.fresh);
		this.fresh = false;
	}

	// ---- menus ----

	private modeMenu(e: MouseEvent): void {
		const menu = new Menu();
		for (const m of MODES) menu.addItem((i) => i.setTitle(m.name).setIcon(m.icon).setChecked(this.mode === m.id).onClick(() => this.setMode(m.id)));
		this.showBelow(menu, e);
	}

	private newMenu(e: MouseEvent): void {
		const menu = new Menu();
		this.current?.newMenu?.(menu);
		this.showBelow(menu, e);
	}

	private filterMenu(e?: MouseEvent, where?: { x: number; y: number; width: number }, picked?: string): void {
		const r = this.ui?.filter.getBoundingClientRect(), at = where ?? (r ? { x: r.left, y: r.bottom + 4, width: r.width } : undefined);
		const scenes = this.folder ? this.store.scenes(this.folder) : [];
		const statuses = new Set<string>(), labels = new Set<string>();
		let noStatus = false, noLabel = false;
		for (const f of scenes) {
			const p = this.props(f);
			if (p.status) statuses.add(p.status); else noStatus = true;
			if (p.label) labels.add(p.label); else noLabel = true;
		}
		// what's being filtered by is always listed, though no note has it any more: else it couldn't be taken off
		for (const v of this.filter.status) { if (v) statuses.add(v); else noStatus = true; }
		for (const v of this.filter.label) { if (v) labels.add(v); else noLabel = true; }
		// in the order settings list them, then the others as they come
		const st = this.plugin.settings, byRank = (values: Set<string>, order: string[]) => new Set([...values].map((v, i) => ({ v, i, r: rank(v, order) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.v));
		const menu = new Menu();
		// On a phone or tablet the menu is a sheet from the foot of the screen: it stays where it is while things are
		// ticked in it (opened again after each pick, it would slide in again each time).
		const sheet = Platform.isMobile;
		const flip = (kind: keyof Filter, v: string): boolean => {
			const list = this.filter[kind], on = !list.includes(v);
			this.setFilter({ ...this.filter, [kind]: on ? [...list, v] : list.filter((x) => x !== v) });
			return on;
		};
		const toggle = (kind: keyof Filter, v: string, title: string) => {
			flip(kind, v);
			// the menu stays for the next pick (a menu closes when an item is chosen: it's opened again, where it was:
			// the button grows as it counts what's picked, and the menu mustn't follow it about)
			// (and the keyboard carries on from the item just picked)
			window.setTimeout(() => { if (this.ui?.filter.isConnected) this.filterMenu(undefined, at, title); }, 0);
		};
		const group = (kind: keyof Filter, title: string, values: Set<string>, none: boolean, noneTitle: string) => {
			if (!values.size) return;
			menu.addItem((i) => i.setSection(kind).setTitle(title).setIsLabel(true));
			for (const v of values) {
				menu.addItem((i) => {
					const t = createFragment();
					// a status shows as it's written, as on the cards; a label by its color's name
					if (kind === 'label') { labelDot(t, v, this.plugin.settings.labels); t.appendText(labelName(v, this.plugin.settings.labels)); } else t.appendText(v);
					i.setSection(kind).setTitle(t).setChecked(this.filter[kind].includes(v)).onClick(() => toggle(kind, v, kind === 'label' ? labelName(v, this.plugin.settings.labels) : v));
					if (sheet) keepOpen(i, () => flip(kind, v));
				});
			}
			if (none) menu.addItem((i) => { i.setSection(kind).setTitle(noneTitle).setChecked(this.filter[kind].includes('')).onClick(() => toggle(kind, '', noneTitle)); if (sheet) keepOpen(i, () => flip(kind, '')); });
		};
		group('status', 'Status', byRank(statuses, st.statuses), noStatus, 'No status');
		group('label', 'Label', byRank(labels, st.labels.map((l) => l.name)), noLabel, 'No label');
		if (!statuses.size && !labels.size) menu.addItem((i) => i.setTitle('No statuses or labels to filter by').setIsLabel(true));
		// (on a sheet that stays open, always: there may be something to clear by the time it's wanted)
		if (this.filter.status.length || this.filter.label.length || (sheet && (statuses.size || labels.size))) {
			menu.addItem((i) => i.setSection('clear').setTitle('Clear filter').setIcon('x').onClick(() => this.setFilter({ status: [], label: [] })));
		}
		if (at && this.ui) menu.showAtPosition({ ...at, overlap: true, left: false }, this.ui.filter.doc);
		else this.showBelow(menu, e, this.ui?.filter);
		if (picked !== undefined) selectMenuItem(menu, picked);
	}

	private setFilter(filter: Filter): void {
		this.filter = filter;
		this.remember();
		this.madeHere.clear();
		this.app.workspace.requestSaveLayout();
		this.drawToolbar();
		this.current?.filterChanged?.();
		this.current?.refresh();
	}

	private showBelow(menu: Menu, e?: MouseEvent, anchor?: HTMLElement): void {
		const t = anchor ?? (e?.currentTarget instanceof HTMLElement ? e.currentTarget : null);
		if (!t) { if (e) menu.showAtMouseEvent(e); return; }
		const r = t.getBoundingClientRect();
		menu.showAtPosition({ x: r.left, y: r.bottom + 4, width: r.width, overlap: true, left: false }, t.doc);
	}

	// ---- the modes' context ----

	props(file: TFile): SceneProps {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const s = this.plugin.settings;
		return {
			synopsis: text(fm[s.synopsisProp]),
			// as settings spell them, whatever case the note has them in
			status: canonical(text(fm[s.statusProp]), s.statuses),
			label: readLabel(fm[s.labelProp], s.labels.map((l) => l.name)),
			target: readTarget(fm[s.targetProp]),
		};
	}

	async setProps(file: TFile, patch: Partial<SceneProps>): Promise<void> {
		if (this.readOnly) throw new Error('This binder is read only.');
		const s = this.plugin.settings;
		const names: Record<keyof SceneProps, string> = { synopsis: s.synopsisProp, status: s.statusProp, label: s.labelProp, target: s.targetProp };
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(patch) as [keyof SceneProps, unknown][]) {
			out[names[k]] = v === '' || v === 0 || (Array.isArray(v) && !v.length) ? undefined : v;
		}
		await this.store.setProps(file, out);
	}

	/** Notes made in this view since the filter last changed: they show though it would hide them. */
	private madeHere = new Set<TFile>();

	private visible(file: TFile): boolean {
		const { status, label } = this.filter;
		if (!status.length && !label.length) return true;
		if (this.madeHere.has(file)) return true;
		const p = this.props(file);
		return (!status.length || status.includes(p.status)) && (!label.length || label.includes(p.label));
	}

	private context(): ModeContext {
		return {
			app: this.app, plugin: this.plugin, store: this.store, binder: this.binder, folder: this.folder, owner: this,
			readOnly: this.readOnly,
			props: (f) => this.props(f),
			setProps: (f, p) => this.setProps(f, p),
			// (what's typed into it here and not saved yet is written first: the note opens with it)
			openFile: async (f, newLeaf) => { await this.current?.save?.([f]); await this.app.workspace.getLeaf(newLeaf || false).openFile(f); },
			navigate: (f, newLeaf) => void this.navigate(f, newLeaf),
			words: (f) => this.words.get(f),
			// typing in the manuscript: the counts follow as you type, before the note is saved
			onTextChange: (f, t) => { this.words.typed(f, t); this.schedule(); },
			visible: (f) => this.visible(f),
			made: (f) => { this.madeHere.add(f); },
			filtering: () => this.filter.status.length + this.filter.label.length > 0,
			option: <T>(key: string, fallback: T): T => (key in this.options ? this.options[key] : fallback) as T,
			setOption: (key, value) => { this.options = { ...this.options, [key]: value }; this.remember(); this.app.workspace.requestSaveLayout(); },
		};
	}

	/** Asks for the word count target of the folder shown, and keeps it in its note (the binder's note, on the binder; a
	    folder's note is made for it if it has none). */
	async setTarget(): Promise<void> {
		const folder = this.folder, binder = this.binder;
		if (!folder || !binder || this.readOnly) return;
		const note = this.store.folderNote(folder), now = note ? this.props(note).target : 0;
		// (on a phone or tablet the dialog gives the focus back to the count as it closes, which would then show a
		// keyboard's focus ring nobody asked for)
		if (Platform.isMobile) this.ui?.count.blur();
		const typed = await ask(this.app, {
			title: folder === binder.folder ? 'Word count target for the binder' : `Word count target for “${folder.name}”`, placeholder: 'Words, such as 80,000', cta: 'Set target',
			value: now ? String(now) : '', allowEmpty: true, numeric: true, check: (v: string) => (parseTarget(v) == null ? 'A target is a whole number of words.' : null),
		});
		const n = typed == null ? null : parseTarget(typed);
		if (n == null || n === now) return;
		try {
			const file = note ?? (n ? await this.store.ensureFolderNote(folder) : null);
			if (file) await this.setProps(file, { target: n });
		} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
	}

	/** Writes down anything typed into these notes here that isn't saved yet (see BinderMode.save). */
	async saveNotes(files: TFile[]): Promise<void> { await this.current?.save?.(files); }

	/** For "Open binder" on a note: the card to select once the view is drawn. `fresh`: a note just made, to be named. */
	revealItem(item: TAbstractFile, fresh = false): void {
		if (fresh && item instanceof TFile) { this.madeHere.add(item); this.current?.refresh(); this.schedule(); }
		this.reveal = item.path; this.fresh = fresh; this.applyReveal();
	}
	private fresh = false;

	/** "New scene here" while this view has the focus: the mode makes it where it would (false if it can't). */
	create(kind: 'note' | 'folder'): boolean {
		if (!this.current?.create || this.readOnly) return false;
		this.current.create(kind);
		return true;
	}
}
