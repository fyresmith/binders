import { saveTemplateDialog } from './template-items';
import { FileSystemAdapter, ItemView, Keymap, Menu, Notice, Platform, Scope, type Events, TFile, TFolder, setIcon, type PaneType, type TAbstractFile, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type { Binder } from '../binders';
import { ExportModal } from './export';
import { exportAgain } from './export-again';
import { lastExport } from '../export/export';
import { folderSnapshotItems } from './snapshots';
import { headerFolderSnapshots } from './binder-snapshots';
import { hasSnapshots, takeFolderSnapshot } from '../binder-snapshots';
import type BindersPlugin from '../main';
import { commitAll, commitFocused, editable, editingIn, type Editable } from './edit';
import { keepOpen, readableLineLength, refreshHeader, submenu } from './internals';
import { emptyDef, readDefs, writeDef, type Condition, type FilterDef } from '../filter/conditions';
import { tally } from './outliner-summary';
import { editFilters, type FilterEdit } from '../filter/saved';
import { FilterPopover } from './filter-popover';
import { Subset } from './subset';
import { readArrangement, readLines, type Arrangement, type Lines } from './lanes-data';
import { TIMELINE_ICON, TIMELINE_SHAPES, readShape } from './timeline-data';
import { ask } from './modals';
import { parseTarget, whyNotTarget } from './outliner-data';
import { readProps, writeBatch, writeProps } from './props';
import type { BinderMode, ModeContext, SceneProps } from './mode';
import type { EditorView } from '@codemirror/view';
import { PROGRESS_ICON, ProgressModal } from './progress';
import { recordDay } from '../progress/day';
import { DAYS_PROP, DEADLINE_PROP, planFrom, readDeadline, readWritingDays, offDays } from '../progress/plan';
import { num, type Plan } from '../progress/model';
import { plannedAt, rows as progressRows, sayBy, share } from '../progress/stats';
import { WordCounter } from './word-counter';
import { wordsLabel } from './words';
import { FindBar, type At, type FindHost, type FindSource } from './find-bar';
import { unpaint } from '../find/highlight';
import { BoardFind } from './find-board';
import { capture } from '../revision/capture';

/* The binder view: one folder of a binder, shown as a corkboard, an outliner or a manuscript. The view owns the toolbar
   (breadcrumb, word count, filter, mode), the folder's synopsis and the subscriptions; the mode draws the rest (mode.ts).
   Its state (folder, mode, filter, the modes' options) lives in the workspace, so it comes back after a reload. */

/** The view's type, as Obsidian knows it (saved workspaces name it). */
export const VIEW_TYPE = 'binders-view';
/** The workspace event a binder view sends when what it is on may have changed (a selection, the cursor's section, a
    scroll of the manuscript, another folder or mode): the inspector follows it. */
export const INSPECT = 'binders:inspect';

/** The four modes of the view. */
export type ModeName = 'corkboard' | 'outliner' | 'manuscript' | 'timeline';
/** The modes in the order the switcher and the commands list them. */
export const MODES: readonly { id: ModeName; name: string; icon: string }[] = [
	{ id: 'corkboard', name: 'Corkboard', icon: 'layout-grid' },
	{ id: 'outliner', name: 'Outliner', icon: 'list-tree' },
	{ id: 'manuscript', name: 'Manuscript', icon: 'scroll-text' },
	{ id: 'timeline', name: 'Timeline', icon: TIMELINE_ICON },
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
/** A view on a phone shorter than this (px) has no room for the toolbar and a few lines of the page: while it's being
    typed in, the page gets it. */
const SHORT = 240;
const isMode = (m: unknown): m is ModeName => MODES.some((x) => x.id === m);
/** A mode as saved: the plot grid of earlier versions is the outliner now. */
const readMode = (m: unknown): ModeName | null => (m === 'plotgrid' ? 'outliner' : isMode(m) ? m : null);

interface BinderViewState { folder?: string; mode?: ModeName; filter?: unknown; options?: Record<string, unknown> }

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

/** The binder view (`binders-view`): one folder of a binder in one mode. See the header. */
export class BinderView extends ItemView {
	navigation = true;
	/** The folder shown, and its path (kept when the folder isn't there, e.g. before binders are found at startup). */
	folder: TFolder | null = null;
	private path = '';
	mode: ModeName = 'corkboard';
	/** The filter on (conditions over the binder's notes) and what it needs of the vault. */
	private subset = new Subset(this.plugin, () => (this.binder?.folder ? this.store.scenes(this.binder.folder) : []), (f) => this.words.get(f));
	private popover: FilterPopover | null = null;
	private options: Record<string, unknown> = {};
	private binder: Binder | null = null;
	private current: BinderMode | null = null;
	private words: WordCounter;
	private identity = '';
	private timer = 0;
	/** How long the last scheduled redraw took, and when it ended (see `schedule`). */
	private drewFor = 0;
	private drewAt = -Infinity;
	private reveal: string | null = null;
	/** Binders have been looked for with the metadata cache complete (until then, a folder not found yet may still be
	    found: the view says it's loading, not that the folder isn't in a binder). */
	private found = false;
	private synopsis: Editable | null = null;
	private relaying = false;
	private ui: { scope: HTMLElement; crumbs: HTMLElement; progress: HTMLElement; count: HTMLElement; undo: HTMLElement; redo: HTMLElement; filter: HTMLElement; arrange: HTMLElement; add: HTMLElement; modeBtn: HTMLElement; notice: HTMLElement; synopsis: HTMLElement; body: HTMLElement } | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: BindersPlugin) {
		super(leaf);
		this.words = new WordCounter(this.plugin, () => this.schedule());
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
		return { ...super.getState(), folder: this.folder?.path ?? this.path, mode: this.mode, filter: this.subset.state(), options: this.options };
	}

	/** How this view is set up now is what the binder's next view starts from (see openBinder). */
	private remember(): void {
		if (this.binder) this.plugin.lastView.set(this.binder.note.path, { mode: this.mode, filter: this.subset.state(), options: this.options });
	}

	/** Puts the keyboard in the mode (on what it was on, or at its start). */
	focusMode(): void { this.current?.focus?.(); }

	/** Is the manuscript showing each note's synopsis where its text would be? */
	get synopsesShown(): boolean { return this.current?.showsSynopses?.() ?? false; }

	/** Shows the synopses in the manuscript, or its text again (with none said, the other of the two). Not while focus
	    mode is on: it is the text. */
	async showSynopses(on?: boolean): Promise<void> {
		if (this.mode !== 'manuscript' || !this.current?.showSynopses) return;
		if ((on ?? !this.synopsesShown) && this.plugin.focus?.on) return;
		await this.current.showSynopses(on);
	}

	// ---- for focus mode (src/focus) ----

	/** The note the mode is on (the manuscript's section with the cursor): focus mode says where that is. */
	currentItem(): TAbstractFile | null { return this.current?.current?.() ?? null; }
	/** The editor that has the cursor, if the mode has one. */
	currentEditor(): EditorView | null { return this.current?.editor?.() ?? null; }
	/** "Go to previous scene" and "Go to next scene" in the manuscript. */
	stepScene(delta: number, checking: boolean): boolean { return this.current?.stepScene?.(delta, checking) ?? false; }

	// ---- for the inspector (src/inspector) ----

	/** Everything selected in the mode (cards, rows); the manuscript has none. */
	selectedItems(): TAbstractFile[] { return this.current?.selected?.() ?? []; }
	/** Where the reader is: the manuscript's section with the cursor or at the top of the page; else what the mode is on. */
	hereItem(): TAbstractFile | null { return this.current?.here?.() ?? this.current?.current?.() ?? null; }
	/** Tells the inspector that what this view is on may have changed. */
	inspect(): void { this.app.workspace.trigger(INSPECT, this); }

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
		// (a filter saved by 0.51 and before, two lists of statuses and labels, is the same filter as conditions)
		this.subset.load(s.filter);
		if (s.options && typeof s.options === 'object') this.options = { ...s.options };
		await super.setState(state, result);
		this.rebuild();
		// binders are found once the layout is ready, and for sure once the metadata cache is complete; a view restored
		// before that shows it's loading, and draws again then (never awaited here: the layout waits for this)
		void this.store.settled.then(() => {
			this.found = true;
			if (this.closed) return;
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

	/** The view has been closed (its tab, or the plugin turned off). What was still on its way then (binders being
	    found at startup, word counts being read, a redraw a moment off) draws nothing: a mode made in a closed view
	    would never be taken down, and would go on listening to the vault. */
	private closed = false;

	async onOpen(): Promise<void> {
		this.closed = false;
		this.contentEl.addClass('binders-view');
		// (a binder is open: the inspector and the contents are among the right sidebar's tabs)
		this.plugin.binderOpened();
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
		// (the cursor going into another section of the manuscript: the inspector follows)
		this.registerDomEvent(this.contentEl, 'focusin', () => this.inspect());
		// A phone with its keyboard up may leave the view a few lines (a small phone; any phone on its side): the
		// toolbar then gives its line to the page. Only while something in the view is being typed in: with nothing
		// being edited the toolbar is always there, however short the view (a small phone on its side is that short
		// with no keyboard up, and the toolbar is its way to the other modes, up a folder and to a new note).
		if (Platform.isPhone) {
			const el = this.contentEl;
			const typing = () => { const a = el.doc.activeElement; return !!a?.instanceOf(HTMLElement) && el.contains(a) && (a.isContentEditable || a.matches('input, textarea')); };
			// The room is measured as it is with the header's space above the view, whether or not being short has
			// taken that space away (the manuscript then runs under Obsidian's header, as a note does): else being
			// short would make the view tall enough not to be, and back.
			let lead = 0;
			const fit = () => {
				const top = parseFloat(getComputedStyle(el).marginTop) || 0;
				if (!el.hasClass('is-short') || top > 0) lead = top;
				const was = el.hasClass('is-short'), short = el.clientHeight - (top > 0 ? 0 : lead) < SHORT && typing();
				el.toggleClass('is-short', short);
				this.shortPage();
				// (the page has just moved under what's being typed: a name or a synopsis in its field is brought back
				// into sight, clear of the header; an editor's cursor is the manuscript's own to follow)
				const a = el.doc.activeElement;
				if (short && !was && a?.instanceOf(HTMLElement) && el.contains(a) && !a.closest('.cm-editor')) el.win.requestAnimationFrame(() => { if (a.isConnected) a.scrollIntoView({ block: 'nearest' }); });
			};
			const sized = new ResizeObserver(fit);
			sized.observe(el);
			this.register(() => sized.disconnect());
			this.registerDomEvent(el, 'focusin', fit);
			// (a moment later: the focus is nowhere between leaving one field and reaching the next)
			this.registerDomEvent(el, 'focusout', () => window.setTimeout(fit, 0));
		}
		// (On a computer nothing in a field is written as the page goes: a write started then is cut off between the
		// file being emptied and filled, and the note would be left empty. Quitting, below, is asked for and waited on;
		// the manuscript's own save knows the same, in view/editable-embed.ts.)
		// (the page itself going: a real `pagehide`, and the page hidden that follows it)
		let leaving = false;
		const away = () => { if (!leaving) void commitAll(this.contentEl, true); void this.current?.save?.(); };
		this.registerDomEvent(this.contentEl.doc, 'visibilitychange', () => { if (this.contentEl.doc.visibilityState === 'hidden') away(); });
		this.registerDomEvent(this.contentEl.win, 'pagehide', (e) => {
			if (e.isTrusted && this.app.vault.adapter instanceof FileSystemAdapter) { leaving = true; window.setTimeout(() => { leaving = false; }, 0); }
			away();
		});
		// Quitting closes the window as soon as what was asked to wait is done, and `pagehide` is too late for a write:
		// a synopsis or a name still in its field is written first. (The manuscript does the same for its sections.)
		// (Only then: with no field open there is nothing to wait for, and the quit isn't held up.)
		this.registerEvent(this.app.workspace.on('quit', (tasks) => { if (editingIn(this.contentEl)) tasks.addPromise(commitAll(this.contentEl, true).then((): void => {})); }));
		const { vault, metadataCache } = this.app;
		const ref = this.store.on('changed', (p: string) => {
			const f = this.folder?.path ?? this.path;
			if (!p || !this.binder || f === p || f.startsWith(p + '/')) this.schedule();
		});
		this.register(() => this.store.offref(ref));
		// (the outliner's Revision column counts the binder's revision tasks, which are read from their note when it changes)
		const rev = this.plugin.revision?.on('changed', () => this.schedule());
		if (rev) this.register(() => this.plugin.revision.offref(rev));
		const hist = this.store.on('history', () => this.drawUndo());
		this.register(() => this.store.offref(hist));
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

	/** Says on the tab itself that the view is short and showing the manuscript: Obsidian's header, which is the
	    view's neighbor and not inside it, is slid away then (styles.css). Kept true where either changes: `is-short`
	    in onOpen, the mode in rebuild. */
	private shortPage(): void {
		this.containerEl.toggleClass('binders-short-manuscript', this.contentEl.hasClass('is-short') && this.contentEl.hasClass('mod-manuscript'));
	}

	async onClose(): Promise<void> {
		await commitAll(this.contentEl);
		this.closed = true;
		this.popover?.close(true);
		this.staleWatch?.disconnect();
		this.containerEl.removeClass('binders-short-manuscript');
		this.places.clear();
		this.leftOn.clear();
		window.clearTimeout(this.timer);
		this.timer = 0;
		this.finder?.close();
		this.current?.unload();
		this.current = null;
	}

	/* "More options", grouped so that it fits a tablet on its side. Finding is in Obsidian's own "find" section, where a
	   note's "Find..." is; what a mode shows is in "view" (the mode's own menu: "Cards" and the like); then undo and
	   redo, the book's rows and drawers ("Snapshots", "Export"), and the note behind the folder. The four modes and
	   "Arrange" are not here: the toolbar under the header has them, on every screen (docs/dev/design.md). */
	onPaneMenu(menu: Menu, source: string): void {
		const folder = this.folder;
		if (source === 'more-options' && folder) {
			menu.addItem((i) => i.setSection('find').setTitle('Find in binder').setIcon('search').onClick(() => this.showSearch(false)));
			if (!this.readOnly) menu.addItem((i) => i.setSection('find').setTitle('Find and replace in binder').setIcon('replace').onClick(() => this.showSearch(true)));
			this.current?.menu?.(menu);
			// (a move taken back or made again: on a phone there's no Ctrl+Z to do it with)
			for (const redo of [false, true]) {
				const what = this.store.undoable(folder, redo);
				if (what) menu.addItem((i) => i.setSection('binders-undo').setTitle(`${redo ? 'Redo' : 'Undo'}: ${what.charAt(0).toLowerCase()}${what.slice(1)}`).setIcon(redo ? 'redo-2' : 'undo-2').onClick(() => void this.plugin.undoMove(folder, redo)));
			}
			menu.addItem((i) => i.setSection('binders-book').setTitle('Add revision task').setIcon('list-plus').onClick(() => { capture(this.plugin); }));
			if (hasSnapshots(this.plugin, folder)) menu.addItem((i) => { i.setSection('binders-book').setTitle('Snapshots').setIcon('history'); submenu(i, (m) => folderSnapshotItems(this.plugin, m, folder, 'snapshots', this.readOnly), menu); });
			// (with no export made yet there is one thing to do: a row, not a drawer of one; "Export again" is the last one made once more, with no window)
			if (lastExport(this.plugin, folder)) menu.addItem((i) => {
				i.setSection('binders-book').setTitle('Export').setIcon('book-up');
				submenu(i, (m) => {
					m.addItem((x) => x.setTitle('Export...').setIcon('book-up').onClick(() => new ExportModal(this.plugin, folder, { selection: this.selectedItems() }).open()));
					m.addItem((x) => x.setTitle('Export again').setIcon('book-check').onClick(() => void exportAgain(this.plugin, folder)));
				}, menu);
			});
			else menu.addItem((i) => i.setSection('binders-book').setTitle('Export...').setIcon('book-up').onClick(() => new ExportModal(this.plugin, folder, { selection: this.selectedItems() }).open()));
			// (the binder's own view: the whole binder, kept as a template for New binder; a phone's sheet is full, and has it in the file explorer's menu)
			const own = this.store.binderOf(folder);
			if (!Platform.isPhone && own && own.kind === 'binder' && own.folder === folder && !own.problem) menu.addItem((i) => i.setSection('binders-book').setTitle('Save as binder template...').setIcon('copy-plus').onClick(() => saveTemplateDialog(this.plugin, own)));
			const note = this.store.folderNote(folder), binder = this.store.binderOf(folder)?.folder === folder;
			menu.addItem((i) => i.setSection('binders-note').setTitle('Show progress').setIcon(PROGRESS_ICON).onClick(() => new ProgressModal(this.plugin, folder).open()));
			// (the whole book as a list in the sidebar, with where this view is)
			menu.addItem((i) => i.setSection('binders-note').setTitle('Show contents').setIcon('book-open').onClick(() => this.plugin.showContents()));
			if (note) menu.addItem((i) => i.setSection('binders-note').setTitle(binder ? 'Open binder note' : 'Open folder note').setIcon('file-text').onClick((e) => void this.app.workspace.getLeaf(Keymap.isModEvent(e)).openFile(note)));
		}
		super.onPaneMenu(menu, source);
	}

	/** Notes what the mode is on as it starts: now, and again a moment later if nothing has been pressed meanwhile
	    (the manuscript puts its cursor once its editor has loaded, which is after this). */
	private entered(): void {
		this.plugin.focus?.check(); // (focus mode ends if this is no longer the manuscript)
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
		if (this.timer || this.closed) return;
		// Changes that keep arriving (a hundred notes deleted one after another) must not keep the page drawing: right
		// after a redraw, the next waits three times as long as that one took, so drawing is a quarter of the time
		// at most. A lone change still waits 80 ms.
		const slow = Math.min(this.drewFor * 3, 2000), wait = performance.now() - this.drewAt < Math.max(300, slow) ? Math.max(80, slow) : 80;
		this.timer = window.setTimeout(() => {
			this.timer = 0;
			const t0 = performance.now();
			this.refresh();
			this.drewAt = performance.now();
			this.drewFor = this.drewAt - t0;
		}, wait);
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
		this.headerSnapshots();
		this.identity = this.key();
		// (the file explorer marks the folder shown, as it marks the open note)
		this.plugin.explorer?.active();
		const el = this.contentEl;
		el.empty();
		this.ui = null;
		// (which mode the view is in, for the stylesheet: the manuscript's page is laid out as a note's is)
		el.toggleClass('mod-manuscript', !!this.folder && this.mode === 'manuscript');
		this.shortPage();
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
		// (where the plan to the deadline has the book today: a tick on the bar)
		progress.createDiv({ cls: 'binders-progress-plan is-hidden' });
		// (a click on the count opens the Progress window, where the target and the deadline are set; a Longform
		// project has no deadline, so there it still sets the target)
		const count = bar.createDiv({ cls: 'binders-word-count', attr: { role: 'button', tabindex: '0' } });
		count.addEventListener('click', () => this.countClicked());
		count.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.countClicked(); } });
		// (undo and redo of what was done by hand to the binder, as icons: a phone has no Ctrl+Z. See drawUndo.)
		const undo = this.button(bar, 'undo-2', 'Undo', 'binders-undo-button', () => this.undoRedo(false));
		const redo = this.button(bar, 'redo-2', 'Redo', 'binders-redo-button', () => this.undoRedo(true));
		// (how the corkboard lays out its cards, where a base has "Sort": in a grid, or by label)
		const arrange = this.button(bar, 'layout-grid', 'Arrange', 'binders-arrange-button', (e) => { const menu = new Menu(); if (this.mode === 'corkboard') this.arrangeItems(menu); else this.current?.arrangeItems?.(menu); this.showBelow(menu, e); });
		const filter = this.button(bar, 'list-filter', 'Filter', 'binders-filter-button', () => this.filterPopover().toggle());
		const add = this.button(bar, 'plus', 'New', 'binders-new-button', (e) => this.newMenu(e));
		// (the manuscript's other display: each note's synopsis where its text would be, and back. Not on a phone, whose
		// bar has no room for it: there it is in "More options" and the command)
		if (!Platform.isPhone) this.button(bar, 'text', 'Synopses', 'binders-synopses-button', () => { void this.showSynopses(); }).toggleClass('is-hidden', this.mode !== 'manuscript');
		this.button(bar, 'maximize-2', 'Focus mode', 'binders-focus-button', () => this.plugin.focus.toggle()).toggleClass('is-hidden', this.mode !== 'manuscript');
		for (const b of [arrange, modeBtn, add]) b.setAttr('aria-haspopup', 'menu');
		filter.setAttr('aria-haspopup', 'dialog');
		if (this.finder) el.appendChild(this.finder.el);
		const scope = el.createDiv({ cls: 'binders-scope is-hidden', attr: { role: 'group', 'aria-label': 'Filter' } });
		const notice = el.createDiv({ cls: 'binders-notice' });
		const synopsis = el.createDiv({ cls: 'binders-view-synopsis-row' });
		const body = el.createDiv({ cls: `binders-mode binders-mode-${this.mode}` });
		this.ui = { scope, crumbs, progress, count, undo, redo, filter, arrange, add, modeBtn, notice, synopsis, body };
		this.drawToolbar();
		const factory = this.plugin.modeFactories[this.arrangement === 'label' ? BY_LABEL : this.mode];
		this.current = factory(body, this.context());
		this.current.render();
		// (the boards draw their cards again as the binder changes: what no longer matches is marked again after)
		this.staleWatch?.disconnect();
		this.staleWatch = new MutationObserver(() => { if (this.subset.on()) this.markStale(); });
		this.staleWatch.observe(body, { childList: true, subtree: true });
		this.markStale();
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
		this.inspect();
		this.board.watch();
		if (this.finder) { this.finder.el.toggleClass('is-wide', this.mode !== 'manuscript'); this.finder.rescope(); }
	}

	/** The Snapshots button in the view's header, as a note of a binder has: for the folder shown. Not on a phone,
	    where a second button beside "More options" pushes the title off the middle of the header (23 px at 320 px wide,
	    measured): there the two items are in "More options", one tap further (`folderSnapshotItems` in onPaneMenu). */
	private snapshotsButton: HTMLElement | null = null;
	private headerSnapshots(): void {
		const want = !!this.folder && !!this.binder && !Platform.isPhone && hasSnapshots(this.plugin, this.folder);
		if (want && !this.snapshotsButton) {
			const b = this.snapshotsButton = this.addAction('history', 'Snapshots', () => { if (this.folder) headerFolderSnapshots(this.plugin, this.folder, b); });
		} else if (!want && this.snapshotsButton) { this.snapshotsButton.remove(); this.snapshotsButton = null; }
	}

	private refresh(): void {
		if (this.closed) return;
		this.resolve();
		this.subset.invalidate();
		this.followSaved();
		this.headerSnapshots();
		// (made again, where it was: the same folder may have become another kind of binder, or read only)
		if (this.key() !== this.identity) { this.keepPlace(); this.rebuild(); return; }
		if (!this.folder) return;
		this.drawToolbar();
		this.current?.refresh();
		this.popover?.sync();
		this.markStale();
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
		const filtering = this.subset.on() && !!this.current?.filters, shown = filtering ? this.words.sum(all.filter((f) => this.visible(f))) : null;
		// with the target of the folder shown: the binder's own, or a subfolder's from its folder note
		const note = this.store.folderNote(folder), goal = note ? this.props(note).target : 0;
		const whose = folder === binder.folder ? 'the binder’s' : 'this folder’s';
		ui.count.toggleClass('is-clickable', true);
		ui.count.setAttrs({ role: 'button', tabindex: '0' });
		const longform = binder.kind === 'longform', plan = longform ? null : this.planNow(folder, goal, n);
		if (n != null) {
			// (the number, then " words" on its own, so that a phone too narrow for both keeps the number)
			const said = shown != null ? `${shown.toLocaleString()} of ${wordsLabel(n)}` : goal ? `${n.toLocaleString()} / ${wordsLabel(goal)}` : wordsLabel(n), cut = said.lastIndexOf(' ');
			ui.count.empty();
			ui.count.appendText(said.slice(0, cut));
			ui.count.createSpan({ cls: 'binders-word-count-unit', text: said.slice(cut) });
			const what = shown != null ? 'Words in the notes that pass the filter' : goal ? `${Math.floor((n / goal) * 100)}% of ${whose} target` : 'Words in this folder';
			ui.count.setAttr('aria-label', longform ? (this.readOnly ? what : `${what}. ${goal ? 'Change' : 'Set'} ${whose} target`) : `${what}.${plan?.said ? ' ' + plan.said + '.' : ''} Show progress`);
			ui.count.toggleClass('is-complete', !!goal && n >= goal);
			// and how far along that is, as a bar
			const pct = goal ? Math.min(100, Math.floor((n / goal) * 100)) : 0;
			ui.progress.toggleClass('is-hidden', !goal);
			ui.progress.toggleClass('is-complete', !!goal && n >= goal);
			ui.progress.setAttrs({ 'aria-valuenow': String(pct), 'aria-label': 'Progress to the target' });
			const tick = ui.progress.querySelector<HTMLElement>('.binders-progress-plan'), at = plan?.tick;
			tick?.toggleClass('is-hidden', at == null);
			if (at != null) { tick?.setCssStyles({ left: `${at}%` }); ui.progress.setAttr('aria-valuetext', `${pct}% of the target. The plan has the book at ${Math.round(at)}%`); } else ui.progress.removeAttribute('aria-valuetext');
			ui.progress.querySelector<HTMLElement>('.binders-progress-bar')?.setCssStyles({ width: `${pct}%` });
		}
		// the filter, when on, says how many values it keeps; only for modes that filter
		ui.filter.toggleClass('is-hidden', !this.current?.filters);
		const on = this.subset.count();
		ui.filter.toggleClass('is-active', on > 0);
		ui.filter.querySelector('.text-button-label')?.setText(on ? `Filter (${on})` : 'Filter');
		// (said to a screen reader too, and shown as the tooltip where the button is an icon alone)
		ui.filter.setAttr('aria-label', on ? `Filter: ${on} on` : 'Filter');
		this.drawScope();
		// "Arrange", on the corkboard: always called that; its icon says how (and its name, to a screen reader)
		// (and on the timeline, which way time runs: not on a phone, where it runs one way)
		const time = this.mode === 'timeline' && !Platform.isPhone ? TIMELINE_SHAPES.find((s) => s.id === readShape(this.options.timelineShape)) : null;
		const how = time ?? this.arranged(), arranged = this.mode === 'corkboard' || !!time;
		ui.arrange.toggleClass('is-hidden', !arranged);
		// (said on the toolbar too: what stands before "Arrange" makes room for it on a narrow phone, styles.css)
		ui.arrange.parentElement?.toggleClass('has-arrange', arranged);
		ui.arrange.toggleClass('is-active', !time && this.arranged().arrange === 'label');
		ui.arrange.setAttr('aria-label', `Arrange: ${how.title.charAt(0).toLowerCase()}${how.title.slice(1)}`);
		setIcon(ui.arrange.querySelector<HTMLElement>('.text-button-icon'), how.icon);
		{ const b = this.contentEl.querySelector<HTMLElement>('.binders-synopses-button'), on = this.synopsesShown; b?.toggleClass('is-active', on); b?.setAttr('aria-pressed', String(on)); }
		const mode = MODES.find((m) => m.id === this.mode);
		setIcon(ui.modeBtn.querySelector<HTMLElement>('.text-button-icon'), mode.icon);
		ui.modeBtn.querySelector('.text-button-label')?.setText(mode.name);
		ui.modeBtn.setAttr('aria-label', `View as: ${mode.name}`);
		this.drawUndo();
		// a newer-format binder: say why nothing can change
		ui.notice.empty();
		ui.notice.toggleClass('is-shown', this.readOnly);
		if (this.readOnly) {
			setIcon(ui.notice.createSpan({ cls: 'binders-notice-icon' }), 'lock');
			ui.notice.createSpan({ text: `Read only. ${binder.problem}` });
		}
		this.drawSynopsis();
	}

	/** The Undo and Redo buttons: each says what it would take back ("Undo: rename “Arrival”"), and is dimmed, not
	    hidden, when there is nothing. Redrawn whenever the history changes. */
	private drawUndo(): void {
		const ui = this.ui, folder = this.folder;
		if (!ui || !folder) return;
		for (const redo of [false, true]) {
			const b = redo ? ui.redo : ui.undo, what = this.readOnly ? null : this.store.undoable(folder, redo), word = redo ? 'Redo' : 'Undo';
			b.toggleClass('is-disabled', !what);
			b.setAttr('aria-disabled', what ? 'false' : 'true');
			b.setAttr('aria-label', what ? `${word}: ${what.charAt(0).toLowerCase()}${what.slice(1)}` : `Nothing to ${word.toLowerCase()}`);
		}
	}

	/** Takes back (or makes again) the last change made by hand here: the buttons' and the keys' one way. */
	private undoRedo(redo: boolean): void {
		const folder = this.folder;
		if (folder && !this.readOnly && this.store.undoable(folder, redo)) void this.plugin.undoMove(folder, redo);
	}

	/** The folder's own synopsis (its folder note, or the binder note), edited in place. */
	private drawSynopsis(): void {
		const ui = this.ui, folder = this.folder;
		if (!ui || !folder || this.synopsis?.editing) return;
		const note = this.store.folderNote(folder);
		const value = note ? this.props(note).synopsis : '';
		// (it's made again: the keyboard, if it was on it, is put on the new one, not left on the page)
		const focused = ui.synopsis.contains(ui.synopsis.doc.activeElement);
		ui.synopsis.empty();
		ui.synopsis.toggleClass('is-hidden', this.readOnly && !value);
		this.synopsis = editable(ui.synopsis, {
			cls: 'binders-view-synopsis', value, placeholder: 'Add a synopsis', label: `Synopsis of ${folder.name}`, readOnly: this.readOnly, focusable: true,
			save: async (t) => { const f = await this.store.ensureFolderNote(folder); await this.setProps(f, { synopsis: t }); },
			onEditing: (on) => { if (!on) this.schedule(); },
		});
		if (focused) this.synopsis.el.focus({ preventScroll: true });
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

	private filterPopover(): FilterPopover {
		if (this.popover?.open) return this.popover;
		this.popover?.close(true);
		return this.popover = new FilterPopover({
			button: () => this.ui?.filter,
			subset: this.subset,
			apply: (f) => this.setFilter(f),
			count: () => this.countSaid(),
			labels: () => this.plugin.settings.labels,
			saved: () => this.savedList(),
			edit: (label, op) => this.editSaved(label, op),
			canSave: () => (this.binder ? this.store.whyNoFilters(this.binder) : 'Open a binder to save a filter.'),
		});
	}

	/** Where the filter is said: a line under the toolbar, across the view, for as long as part of the binder may be hidden.
	    Its name (or "Filter" for one not saved), how many notes show of the folder's, and the way back to all of them. */
	private drawScope(): void {
		const ui = this.ui;
		if (!ui) return;
		const on = this.subset.on() && !!this.current?.filters;
		ui.scope.empty();
		ui.scope.toggleClass('is-hidden', !on);
		if (!on) return;
		const all = this.folder ? this.store.scenes(this.folder) : [], shown = all.filter((f) => this.visible(f)).length;
		setIcon(ui.scope.createSpan({ cls: 'binders-scope-icon', attr: { 'aria-hidden': 'true' } }), 'list-filter');
		const name = ui.scope.createSpan({ cls: 'binders-scope-name', text: this.subset.def.name ?? 'Filter', attr: { role: 'button', tabindex: '0', 'aria-label': `Change the filter: ${this.subset.say()}`, title: this.subset.say() } });
		name.addEventListener('click', () => this.filterPopover().toggle());
		name.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); name.click(); } });
		const n = ui.scope.createSpan({ cls: 'binders-scope-count', text: `${shown} of ${all.length}` });
		n.createSpan({ cls: 'binders-scope-unit', text: all.length === 1 ? ' note' : ' notes' });
		const stale = all.filter((f) => this.isStale(f)).length;
		if (stale) {
			ui.scope.createSpan({ cls: 'binders-scope-stale', text: `${stale} no longer ${stale === 1 ? 'matches' : 'match'}` });
			const r = ui.scope.createDiv({ cls: 'text-icon-button binders-scope-refresh', attr: { role: 'button', tabindex: '0', 'aria-label': 'Hide the notes that no longer match' } });
			setIcon(r.createSpan({ cls: 'text-button-icon' }), 'refresh-cw');
			r.createSpan({ cls: 'text-button-label', text: 'Refresh' });
			r.addEventListener('click', () => this.refreshSubset());
			r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.refreshSubset(); } });
		}
		ui.scope.createDiv({ cls: 'binders-scope-spacer' });
		const whole = this.folder === this.binder?.folder ? 'Show the whole binder' : 'Show the whole folder';
		const out = ui.scope.createDiv({ cls: 'text-icon-button binders-scope-all', attr: { role: 'button', tabindex: '0', 'aria-label': whole } });
		setIcon(out.createSpan({ cls: 'text-button-icon' }), 'x');
		out.createSpan({ cls: 'text-button-label', text: whole });
		const clear = () => { this.popover?.close(); this.setFilter(emptyDef()); };
		out.addEventListener('click', clear);
		out.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clear(); } });
	}

	// ---- saved filters (the binder note's `filters`) ----

	/** What the saved filters are: as the binder note says, or as an edit just made will have it (the note is written, and
	    Obsidian reads it back, a moment later). */
	private savedNow: { list: FilterDef[]; until: number } | null = null;
	private savedList(): FilterDef[] {
		if (this.savedNow && this.savedNow.until > Date.now()) return this.savedNow.list;
		return this.binder ? this.store.savedFilters(this.binder) : [];
	}
	private saving: { timer: number; busy: number; until: number } = { timer: 0, busy: 0, until: 0 };
	/** Saves, renames, duplicates, deletes or moves a saved filter: one step of "Undo". The filter that is on follows. */
	private editSaved(label: string, op: FilterEdit): void {
		const binder = this.binder;
		if (!binder || this.readOnly) return;
		const list = this.savedList();
		this.savedNow = { list: readDefs(editFilters(list.map((d) => writeDef(d)), op)), until: Date.now() + 3000 };
		const on = this.subset.def;
		if (op.kind === 'save') this.subset.def = { ...on, name: op.def.name?.trim() };
		else if (on.name && on.name.toLowerCase() === op.name.toLowerCase()) {
			if (op.kind === 'rename') this.subset.def = { ...on, name: op.to.trim() };
			else if (op.kind === 'delete') this.subset.def = { match: on.match, conditions: on.conditions };
		}
		this.remember();
		this.app.workspace.requestSaveLayout();
		this.drawToolbar();
		this.saving.busy++;
		void this.store.editFilters(binder, label, op).catch((e) => new Notice(e instanceof Error ? e.message : String(e))).finally(() => { this.saving.busy--; this.saving.until = Date.now() + 1500; this.popover?.sync(); });
	}
	/** The conditions of the saved filter that is on were changed: they are written as they are changed (a moment after the last
	    change), as a change to a view of a base is. */
	private saveConditions(def: FilterDef): void {
		const binder = this.binder, name = def.name;
		if (!binder || !name || this.readOnly || this.store.whyNoFilters(binder)) return;
		const now = this.savedList(), at = now.findIndex((d) => (d.name ?? '').toLowerCase() === name.toLowerCase());
		if (at < 0 || JSON.stringify([now[at].match, now[at].conditions]) === JSON.stringify([def.match, def.conditions])) return;
		this.savedNow = { list: now.map((d, i) => (i === at ? { ...d, match: def.match, conditions: def.conditions } : d)), until: Date.now() + 3000 };
		window.clearTimeout(this.saving.timer);
		this.saving.busy++;
		this.saving.timer = window.setTimeout(() => {
			void this.store.updateFilter(binder, name, def).catch((e) => new Notice(e instanceof Error ? e.message : String(e))).finally(() => { this.saving.busy--; this.saving.until = Date.now() + 1500; });
		}, 300);
	}
	/** The saved filter that is on, changed by hand in the note or by a sync, is followed; one deleted there is kept as a filter
	    not saved, and the writer is told. (Not while this view is itself writing it.) */
	private followSaved(): void {
		const name = this.subset.def.name;
		if (!name || !this.binder || this.saving.busy > 0 || Date.now() < this.saving.until) return;
		// (a binder note not read yet says nothing of its filters: that is not "deleted")
		if (this.binder.kind !== 'binder' || this.binder.problem || !this.app.metadataCache.getFileCache(this.binder.note)) return;
		this.savedNow = null;
		const list = this.store.savedFilters(this.binder);
		const mine = list.find((d) => (d.name ?? '').toLowerCase() === name.toLowerCase());
		const on = this.subset.def;
		if (!mine) {
			new Notice(`The filter “${name}” was deleted elsewhere. It stays on, as a filter that is not saved.`);
			this.setFilter({ match: on.match, conditions: on.conditions }, true);
		} else if (JSON.stringify([mine.name, mine.match, mine.conditions]) !== JSON.stringify([on.name, on.match, on.conditions])) {
			this.setFilter({ ...mine, conditions: mine.conditions.map((c) => ({ ...c })) }, true);
		}
	}

	/** The note being typed in here, if any (a section of the manuscript with the caret in it): it never leaves the page under it. */
	private typingIn(): TFile | null {
		const el = this.contentEl.doc.activeElement, typing = !!el?.instanceOf(HTMLElement) && this.contentEl.contains(el) && el.matches('.cm-content, input, textarea, [contenteditable="true"]');
		const on = typing ? this.current?.current?.() : null;
		return on instanceof TFile ? on : null;
	}
	private isStale(file: TFile): boolean { return this.subset.on() && !this.madeHere.has(file) && this.subset.stale(file); }
	/** "Refresh": lets go of the notes that no longer match (but the one being typed in) and draws again. */
	private refreshSubset(): void {
		this.subset.letGo(this.typingIn());
		this.drawToolbar();
		this.current?.refresh();
		this.finder?.rescope();
		this.markStale();
	}
	/** Cards and rows of notes that no longer match are said to be so (the manuscript says it itself): a step back, and nothing
	    written on them. */
	private staleRaf = 0;
	private staleWatch: MutationObserver | null = null;
	private markStale(): void {
		const body = this.ui?.body;
		if (!body || this.staleRaf) return;
		this.staleRaf = body.win.requestAnimationFrame(() => {
			this.staleRaf = 0;
			for (const el of body.querySelectorAll<HTMLElement>('.binders-card[data-path], .binders-outliner-row[data-path]')) {
				const f = this.app.vault.getAbstractFileByPath(el.dataset.path ?? '');
				el.toggleClass('is-unmatched', f instanceof TFile && this.isStale(f));
			}
		});
	}

	/** "8 of 20 notes": what the filter shows, of the folder shown. */
	private countSaid(): string {
		const all = this.folder ? this.store.scenes(this.folder) : [];
		return `${all.filter((f) => this.visible(f)).length} of ${all.length} ${all.length === 1 ? 'note' : 'notes'}`;
	}

	/** One more condition, with the filter that is on (when its conditions must all be true; with "any" or "none" it can't
	    be said in one list, so the new condition stands alone). Never written into a saved filter: the result is not
	    saved, and the saved one stays as it was. */
	private narrow(c: Condition): void {
		const on = this.subset.on() ? this.subset.def : null;
		const keep = on && on.match === 'all' ? on.conditions.map((x) => ({ ...x })) : [];
		this.setFilter({ match: 'all', conditions: [...keep, c] });
	}

	private setFilter(filter: FilterDef, quiet = false): void {
		// (changing the conditions is asking for the page afresh: what no longer matches goes, but the section being typed in)
		if (this.subset.set(filter)) this.subset.letGo(this.typingIn());
		this.remember();
		if (!quiet) this.saveConditions(filter);
		this.madeHere.clear();
		this.app.workspace.requestSaveLayout();
		this.drawToolbar();
		this.current?.filterChanged?.();
		this.current?.refresh();
		this.markStale();
		// (what is looked through is what shows: a note the filter hides is neither counted nor replaced in)
		this.finder?.rescope();
	}

	private showBelow(menu: Menu, e?: MouseEvent, anchor?: HTMLElement): void {
		const t = anchor ?? (e?.currentTarget instanceof HTMLElement ? e.currentTarget : null);
		if (!t) { if (e) menu.showAtMouseEvent(e); return; }
		const r = t.getBoundingClientRect();
		menu.showAtPosition({ x: r.left, y: r.bottom + 4, width: r.width, overlap: true, left: false }, t.doc);
	}

	// ---- the modes' context ----

	props(file: TFile): SceneProps { return readProps(this.plugin, file); }

	async setProps(file: TFile, patch: Partial<SceneProps>): Promise<void> {
		if (this.readOnly) throw new Error('This binder is read only.');
		await writeProps(this.plugin, file, patch);
	}

	async setPropsMany(writes: { file: TFile; patch: Partial<SceneProps> }[]): Promise<void> {
		if (this.readOnly) throw new Error('This binder is read only.');
		await writeBatch(this.plugin, writes);
	}

	/** Notes made in this view since the filter last changed: they show though it would hide them. */
	private madeHere = new Set<TFile>();

	// ---- find and replace (find-bar.ts) ----

	private finder: FindBar | null = null;
	/** The marks on the boards for what the bar found (find-board.ts). */
	private board = new BoardFind({ body: () => this.ui?.body ?? null, manuscript: () => this.mode === 'manuscript' });

	/** Obsidian's own "Search current file" calls this on the view in front (and a section's editor hands its own over):
	    the bar opens under the toolbar, over everything the view shows. `replace`: with its replace row. (This is a
	    method Obsidian looks for by name on whatever view is in front: docs/dev/internals.md, "Find and replace".) */
	showSearch(replace = false): void {
		if (!this.folder || !this.ui) return;
		// (the bar looks through the notes' text: a manuscript showing synopses shows it again)
		if (this.synopsesShown) void this.showSynopses(false);
		const sel = this.contentEl.win.getSelection()?.toString() ?? '', cm = this.current?.editor?.();
		const picked = cm ? cm.state.sliceDoc(cm.state.selection.main.from, cm.state.selection.main.to) : sel;
		if (!this.finder) {
			this.finder = new FindBar(this.findHost(), replace, () => { this.finder = null; this.board.stop(); this.contentEl.removeClass('is-finding'); });
			this.ui.notice.before(this.finder.el);
		} else if (replace && !this.finder.isReplacing) this.finder.setReplacing(true);
		this.finder.el.toggleClass('is-wide', this.mode !== 'manuscript');
		this.contentEl.addClass('is-finding');
		this.finder.focus(picked.trim() ? picked : undefined, replace);
	}

	get findBar(): FindBar | null { return this.finder; }

	private findHost(): FindHost {
		const board = () => this.mode !== 'manuscript';
		const plugin = this.plugin;
		return {
			plugin,
			steps: () => (board() ? 'notes' : 'matches'),
			stopOf: (s) => {
				// (the corkboard shows one folder: a note deeper than that is behind its folder's card)
				if (this.mode !== 'corkboard' || !s.file || !this.folder) return s.id;
				let f: TAbstractFile = s.file;
				while (f.parent && f.parent !== this.folder) f = f.parent;
				return f.path;
			},
			// (the notes of the folder shown and the folders in it, as the view lists them: with a filter on, the ones that show)
			sources: (): FindSource[] => (this.folder ? this.store.scenes(this.folder).filter((f) => !this.current?.filters || this.visible(f)).map((f) => ({ id: f.path, name: f.basename, file: f })) : []),
			here: () => {
				if (!board()) return this.current?.foundFrom?.() ?? null;
				const c = this.current?.current?.();
				if (!c) return null;
				const first = c instanceof TFolder ? this.store.scenes(c)[0] : c;
				return first ? { id: first.path, offset: 0 } : null;
			},
			caret: () => (board() ? null : this.current?.foundCaret?.() ?? null),
			show: (state, go) => {
				this.board.state = state;
				if (!board()) { this.current?.found?.(state, go); return; }
				this.board.mark();
				this.board.track(!!state);
				const file = state?.at?.found.source.file;
				if (go && file && this.current?.reveal) {
					const doc = this.contentEl.doc, had = doc.activeElement as HTMLElement | null, inBar = !!had && !!this.finder?.el.contains(had);
					this.current.reveal(file);
					// (the keyboard stays in the bar: the card is selected and brought into sight, not gone into)
					if (inBar) had.focus({ preventScroll: true });
				}
			},
			snapshot: () => {
				const f = this.folder;
				// (a replace is made only with its snapshot taken: a folder that can't have one can't have a replace)
				if (!f || this.readOnly || !hasSnapshots(plugin, f)) return null;
				return { of: this.binder?.folder === f ? 'binder' : 'folder', name: f.name, root: f.path, take: async (why) => { await takeFolderSnapshot(plugin, f, '', why); } };
			},
			locked: () => (this.readOnly ? `Nothing can be replaced here. ${this.binder?.problem ?? ''}` : this.folder && !hasSnapshots(plugin, this.folder) ? 'Nothing can be replaced here: it can’t have snapshots to put it back from.' : null),
			replacesOne: () => !board() && !!this.current?.replaceFound,
			replaceOne: (at: At, by: string) => this.current?.replaceFound?.(at, by) ?? Promise.resolve(false),
			closed: (at) => {
				unpaint(this);
				this.board.mark();
				if (!board() && this.current?.foundClosed) this.current.foundClosed(at); else this.current?.focus?.();
			},
		};
	}

	private visible(file: TFile): boolean {
		if (!this.subset.on()) return true;
		if (this.madeHere.has(file)) return true;
		return this.subset.shows(file);
	}

	private context(): ModeContext {
		return {
			app: this.app, plugin: this.plugin, store: this.store, binder: this.binder, folder: this.folder, owner: this,
			readOnly: this.readOnly,
			props: (f) => this.props(f),
			setProps: (f, p) => this.setProps(f, p),
			setPropsMany: (w) => this.setPropsMany(w),
			// (what's typed into it here and not saved yet is written first: the note opens with it)
			openFile: async (f, newLeaf) => { await this.current?.save?.([f]); await this.app.workspace.getLeaf(newLeaf || false).openFile(f); },
			navigate: (f, newLeaf) => void this.navigate(f, newLeaf),
			words: (f) => this.words.get(f),
			// typing in the manuscript: the counts follow as you type, before the note is saved
			onTextChange: (f, t) => { this.words.typed(f, t); this.schedule(); },
			visible: (f) => this.visible(f),
			made: (f) => { this.madeHere.add(f); },
			filtering: () => this.subset.on(),
			stale: (f) => this.isStale(f),
			clearFilter: () => this.setFilter(emptyDef()),
			tally: (files, property) => ({ ...tally(files, (f) => this.subset.valueOf(f, property), this.subset.env), list: this.subset.kindOf(property) === 'list' }),
			narrow: (c) => this.narrow(c),
			selectionChanged: () => this.inspect(),
			find: (replace) => this.showSearch(replace),
			option: <T>(key: string, fallback: T): T => (key in this.options ? this.options[key] : fallback) as T,
			setOption: (key, value) => { this.options = { ...this.options, [key]: value }; this.remember(); this.app.workspace.requestSaveLayout(); if (key === 'timelineShape' || key === 'manuscriptShow') this.drawToolbar(); },
		};
	}

	/** A click on the count: the Progress window of the folder shown (a Longform project, which has no deadline, still asks
	    for the target). */
	private countClicked(): void {
		const folder = this.folder, binder = this.binder;
		if (!folder || !binder) return;
		// (on a phone or tablet the dialog gives the focus back to the count as it closes: no focus ring nobody asked for)
		if (Platform.isMobile) this.ui?.count.blur();
		if (binder.kind === 'longform') { void this.setTarget(); return; }
		const rel = folder === binder.folder ? '' : folder.path.slice(binder.folder.path.length + 1);
		new ProgressModal(this.plugin, binder.folder, { scope: rel.includes('/') ? '' : rel }).open();
	}

	/** The plan of the folder shown, for the bar's tick and the count's tooltip: what a day is to be and where the plan
	    has the book today. The tick needs the record (read in a moment, and the toolbar drawn again); the words a day
	    don't. Null without a target and a deadline, or once the target is reached or the date has passed. */
	private planCache: { key: string; tick: number | null } | null = null;
	private planNow(folder: TFolder, goal: number, words: number | null): { said: string; tick: number | null } | null {
		const binder = this.binder, note = this.store.folderNote(folder), fm = note ? this.app.metadataCache.getFileCache(note)?.frontmatter : undefined;
		const deadline = readDeadline(fm?.[DEADLINE_PROP]);
		if (!binder || !goal || !deadline || words == null || words >= goal) return null;
		const today = recordDay(Date.now()), days = readWritingDays(fm?.[DAYS_PROP]), t = num(today);
		if (num(deadline) < t) return null;
		const scope = folder === binder.folder ? '' : folder.path.slice(binder.folder.path.length + 1);
		const basic: Plan = { target: goal, deadline, off: offDays(days), from: today, fromTotal: words };
		const { needed } = share(basic, words, scope === '' ? this.plugin.progress.today(binder.folder) : 0, today);
		const key = JSON.stringify([binder.folder.path, scope, goal, deadline, days, today]);
		if (this.planCache?.key !== key) {
			this.planCache = { key, tick: null };
			void this.plugin.progress.keptHistory(binder.folder).then((h) => {
				if (this.planCache?.key !== key) return;
				// (no record yet: asked again at the next draw, not remembered as having none)
				if (!h || !h.days.length) { this.planCache = null; return; }
				const rs = progressRows(h, today, scope), p = planFrom(h, rs, scope, { target: goal, deadline, days }, today);
				this.planCache = { key, tick: p ? Math.max(0, Math.min(100, (plannedAt(p, t) / goal) * 100)) : null };
				this.drawToolbar();
			}, () => { /* no record: no tick */ });
		}
		return { said: `${needed.toLocaleString('en-US')} a day to ${sayBy(num(deadline), t)}`, tick: this.planCache.tick };
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
			value: now ? String(now) : '', allowEmpty: true, numeric: true, check: whyNotTarget,
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
