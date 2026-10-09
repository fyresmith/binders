import type { App, Component, Menu, PaneType, TAbstractFile, TFile, TFolder } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { Binder, BinderStore } from '../binders';
import type BindersPlugin from '../main';

/* The contract between the binder view (BinderView.ts) and its modes: corkboard, outliner, manuscript. The view owns
   the header, the switcher and the subscriptions; a mode only draws the folder it's given into its container. */

/** A scene's card data, read with the property names from settings. */
export interface SceneProps {
	synopsis: string;
	status: string;
	label: string;
	/** Its word count target, or 0 for none. */
	target: number;
}

/** What a mode may ask of the view. */
export interface ModeContext {
	app: App;
	plugin: BindersPlugin;
	store: BinderStore;
	/** The binder being shown. */
	binder: Binder;
	/** The folder the view is on: the binder folder, or a folder inside it. */
	folder: TFolder;
	/** The view: register DOM events, intervals and child components on it so they go when it closes. */
	owner: Component;
	/** Read-only when the binder is in a newer format (store.problem) or on a platform where editing isn't safe. */
	readOnly: boolean;
	/** Reads a note's card data from its properties (property names from settings). */
	props(file: TFile): SceneProps;
	/** Writes card data; only the given keys change. An empty string or list removes the property. */
	setProps(file: TFile, patch: Partial<SceneProps>): Promise<void>;
	/** Opens a note in a tab, as clicking a link would (`newLeaf` for a new tab). */
	openFile(file: TFile, newLeaf?: boolean | PaneType): Promise<void>;
	/** Shows another folder in this view (breadcrumbs, a folder's card); `newLeaf` opens it in a new tab instead. */
	navigate(folder: TFolder, newLeaf?: boolean | PaneType): void;
	/** A note's word count (without its properties); null until it has been read. The view refreshes the mode once it is. */
	words(file: TFile): number | null;
	/** Does the note pass the view's status and label filter? */
	visible(file: TFile): boolean;
	/** A note just made in this view: it shows whatever the filter says (a new note has no status yet), until the
	    filter is changed, so it's there to be named. */
	made(file: TFile): void;
	/** Is a filter on (so some notes may be hidden)? */
	filtering(): boolean;
	/** A per-view option (kept with the view in the workspace, so it survives a reload). */
	option<T>(key: string, fallback: T): T;
	setOption(key: string, value: unknown): void;
	/** Optional: what the mode is on changed (a card or row selected, the section with the cursor): the inspector
	    follows it. */
	selectionChanged?(): void;
	/** Optional: opens the view's find bar (asked for from inside a section's editor); `replace`: with its replace row. */
	find?(replace: boolean): void;
	/** Optional: a note's text changed as the user types in the view (before it's saved), e.g. to update a word count. */
	onTextChange?(file: TFile, text: string): void;
}

/** What the view asks of a mode. */
export interface BinderMode {
	/** Draw everything. Called once after construction. */
	render(): void;
	/** The binder changed (store 'changed', or a scene's properties changed): update in place, keeping scroll and
	    selection, and never interrupting typing. */
	refresh(): void;
	/** Tear down (the view is switching modes or closing). Save anything pending. */
	unload(): void;
	/** Optional: writes down, now, anything typed into these notes that the mode hasn't saved yet (the manuscript's
	    editors save a moment after typing stops): something is about to read them from the vault. */
	save?(files?: TFile[]): Promise<void>;
	/** Optional: the item the mode is on (the card or row with the focus, the section with the cursor), so another mode
	    can open on the same one. */
	current?(): TAbstractFile | null;
	/** Optional: everything selected (the boards and the outliner; the manuscript has only `current`). */
	selected?(): TAbstractFile[];
	/** Optional: where the reader is: the section with the cursor if it's in sight, else the one at the top of the
	    page (the manuscript). */
	here?(): TAbstractFile | null;
	/** Optional: focus the mode's first focusable item (keyboard navigation). */
	focus?(): void;
	/** Optional: select and scroll to an item ("Open binder" from a note shows that note's card). `fresh`: it was just
	    made, so its name is ready to be typed over. */
	reveal?(item: TAbstractFile, fresh?: boolean): void;
	/** Optional: makes a new note or folder where this mode would put one (after what's selected, or last), named in
	    place. */
	create?(kind: 'note' | 'folder'): void;
	/** Optional: the mode's own items for the view's "More options" menu (e.g. the corkboard's card size and numbers). */
	menu?(menu: Menu): void;
	/** Optional: the mode's own items for the toolbar's "Arrange" menu, after the arrangements themselves (the
	    corkboard by label: which way its lines run, and what's on them). */
	arrangeItems?(menu: Menu): void;
	/** Optional: what the mode can make (a note, a folder), as items for the toolbar's "New" menu. Without it, or in a
	    read-only binder, the toolbar has no "New". */
	newMenu?(menu: Menu): void;
	/** Optional: where the reader is (scroll, selection, caret), as plain data, and going back there: after Back, or
	    after a look at another mode. `restore` may be given a place from an older version, or nonsense. */
	place?(): unknown;
	restore?(place: unknown): void;
	/** Optional: takes the folder's synopsis row into the mode's own page, so it scrolls with the rest instead of
	    staying above it. */
	adopt?(header: HTMLElement): void;
	/** Optional: find and replace (find-bar.ts). What was found in this mode's notes, to show in the text it draws (null:
	    the bar has closed); `go`: bring the match the writer is on into sight. */
	found?(state: import('./find-bar').FindState | null, go: boolean): void;
	/** Optional: replaces one match in its section's editor (a step Undo there takes back). False if it couldn't. */
	replaceFound?(at: import('./find-bar').At, by: string): Promise<boolean>;
	/** Optional: where the cursor is, as a place in a note's text. */
	foundFrom?(): { id: string; offset: number } | null;
	/** Optional: the bar has closed: the cursor goes to the match it was on. */
	foundClosed?(at: import('./find-bar').At | null): void;
	// For focus mode (src/focus):
	/** Optional: the CodeMirror editor that has the cursor (the manuscript's section being typed in), if any. */
	editor?(): EditorView | null;
	/** Optional: puts the cursor in the item before (-1) or after (1) the one it's in; `checking` only says whether
	    there is one to go to. */
	stepScene?(delta: number, checking: boolean): boolean;
	/** Optional: the mode shows only what passes `ctx.visible()`, so the view offers its status and label filter. */
	readonly filters?: boolean;
	/** Optional: the filter changed (before the refresh that follows), e.g. to stop showing notes just made that it hides. */
	filterChanged?(): void;
}

/** Builds a mode in a container. */
export type ModeFactory = (container: HTMLElement, ctx: ModeContext) => BinderMode;
