import { Events, FileView, TFile, TFolder, type EventRef, type TAbstractFile, type WorkspaceLeaf } from 'obsidian';
import type { Binder } from '../binders';
import type BindersPlugin from '../main';
import { isScene } from '../snapshots';
import { BinderView, INSPECT } from '../view/BinderView';

/* What the inspector and the contents follow: the tab the writer was last in (never a sidebar's: these views are in
   one, and taking the focus themselves mustn't change what they are on), and in it the notes and folders in hand.
   One of these for the plugin; every pane is told by `on('target')`. It reads, and changes nothing. */

/** What the panes show now. */
export interface Target {
	/** `items`: notes and folders of a binder. `outside`: a note that isn't in one. `none`: nothing to say. */
	kind: 'items' | 'outside' | 'none';
	binder: Binder | null;
	/** The binder view they were read from, if they were (a click in the contents goes there). */
	view: BinderView | null;
	/** The notes and folders in hand: selected cards or rows, the section with the cursor, the open note; a folder
	    stands for itself (the folder a board shows with nothing selected, a folder's own note open in a tab). */
	items: TAbstractFile[];
	/** Where the reader is, for "you are here" in the contents. */
	here: TAbstractFile | null;
}

const NONE: Target = { kind: 'none', binder: null, view: null, items: [], here: null };

/** Follows the workspace and says what the panes are on. */
export class Follow extends Events {
	private host: WorkspaceLeaf | null = null;
	private timer = 0;
	private last: Target = NONE;
	/** The binder last shown: the contents keep it while the writer looks at a note outside it. */
	lastBinder: Binder | null = null;
	/** Goes up when what a pane shows may have changed (a note, a binder's order, a setting), and not when only the
	    place did (the cursor, a scroll, another tab): a pane draws again for the first, and only marks for the second. */
	rev = 0;

	constructor(private plugin: BindersPlugin) {
		super();
		const { workspace: ws, metadataCache, vault } = plugin.app, soon = () => this.soon(), changed = () => { this.rev++; this.soon(); };
		plugin.registerEvent(ws.on('active-leaf-change', (leaf) => { if (leaf && this.inMain(leaf)) this.host = leaf; soon(); }));
		plugin.registerEvent(ws.on('layout-change', soon));
		plugin.registerEvent(ws.on('file-open', soon));
		plugin.registerEvent((ws as unknown as { on(name: string, cb: () => void): EventRef }).on(INSPECT, soon));
		plugin.registerEvent(metadataCache.on('changed', changed));
		plugin.registerEvent(vault.on('rename', changed));
		plugin.registerEvent(vault.on('delete', changed));
		plugin.registerEvent(plugin.binders.on('changed', changed));
		plugin.register(() => window.clearTimeout(this.timer));
		ws.onLayoutReady(soon);
	}

	/** A tab of the main area or of a window of its own: not a sidebar's. */
	private inMain(leaf: WorkspaceLeaf): boolean {
		const ws = this.plugin.app.workspace, root = leaf.getRoot();
		return root !== ws.leftSplit && root !== ws.rightSplit;
	}

	/** What it was on when last looked. */
	get target(): Target { return this.last; }

	/** Looks again, once: a caret crossing sections, a scroll and a redraw all ask at once. (A timer, not a frame of
	    the main window: that window draws no frames while it is minimised and the writer is in another.) */
	soon(): void {
		if (this.timer) return;
		this.timer = window.setTimeout(() => { this.timer = 0; this.look(); }, 16);
	}

	/** Looks now (a test, or a pane that has just opened). */
	look(): void {
		this.last = this.read();
		if (this.last.binder) this.lastBinder = this.last.binder;
		// (the book last shown may be gone, or a binder no longer: asked by its path, since a deleted folder is no
		// longer in the vault to be asked about)
		else if (this.lastBinder) {
			const was = this.lastBinder, folder = was.folder; // (null once the folder is gone, whatever its type says)
			if (!folder || this.plugin.app.vault.getAbstractFileByPath(folder.path) !== folder || this.plugin.binders.binderOf(folder)?.note !== was.note) this.lastBinder = null;
		}
		this.trigger('target', this.last);
	}

	private read(): Target {
		const { app, binders: store } = this.plugin, ws = app.workspace;
		let leaf = this.host;
		// (a tab that has been closed, or none seen yet: the last one used in the main area)
		if (!leaf || !leaf.view || !leaf.view.containerEl.isConnected) leaf = this.host = ws.getMostRecentLeaf(ws.rootSplit);
		const view = leaf?.view;
		if (view instanceof BinderView) {
			const folder = view.folder, binder = folder ? store.binderOf(folder) : null;
			if (!folder || !binder) return NONE;
			const here = view.hereItem(), sel = view.mode === 'manuscript' ? (here ? [here] : []) : store.inOrder(view.selectedItems());
			return { kind: 'items', binder, view, items: sel.length ? sel : [folder], here: here ?? sel[0] ?? folder };
		}
		const file = view instanceof FileView ? view.file : null;
		if (!(file instanceof TFile)) return NONE;
		const binder = store.binderOf(file);
		// (a binder's or a folder's own note stands for the folder: that is whose data it holds)
		if (binder && store.isHiddenNote(file) && file.parent instanceof TFolder) return { kind: 'items', binder, view: null, items: [file.parent], here: file.parent };
		if (binder && isScene(this.plugin, file)) return { kind: 'items', binder, view: null, items: [file], here: file };
		return { ...NONE, kind: 'outside' };
	}
}
