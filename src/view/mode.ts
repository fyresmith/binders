import type { App, Component, TFile, TFolder } from 'obsidian';
import type { Binder, BinderStore } from '../binders';
import type BindersPlugin from '../main';

/* The contract between the binder view (BinderView.ts) and its modes: corkboard, plot grid, manuscript. The view owns
   the header, the switcher and the subscriptions; a mode only draws the folder it's given into its container. */

/** A scene's card data, read with the property names from settings. */
export interface SceneProps {
	synopsis: string;
	status: string;
	label: string;
	plotlines: string[];
}

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
	openFile(file: TFile, newLeaf?: boolean): Promise<void>;
	/** Shows another folder in this view (breadcrumbs, a subfolder's stack). */
	navigate(folder: TFolder): void;
	/** Optional: a note's text changed as the user types in the view (before it's saved), e.g. to update a word count. */
	onTextChange?(file: TFile, text: string): void;
}

export interface BinderMode {
	/** Draw everything. Called once after construction. */
	render(): void;
	/** The binder changed (store 'changed', or a scene's properties changed): update in place, keeping scroll and
	    selection, and never interrupting typing. */
	refresh(): void;
	/** Tear down (the view is switching modes or closing). Save anything pending. */
	unload(): void;
	/** Optional: focus the mode's first focusable item (keyboard navigation). */
	focus?(): void;
}

export type ModeFactory = (container: HTMLElement, ctx: ModeContext) => BinderMode;
