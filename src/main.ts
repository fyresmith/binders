import { Keymap, MarkdownView, Notice, Platform, Plugin, TFile, TFolder, normalizePath, type Menu, type PaneType, type TAbstractFile, type WorkspaceLeaf } from 'obsidian';
import { BinderStore, type Binder } from './binders';
import { BY_LABEL, BinderView, MODES, VIEW_TYPE } from './view/BinderView';
import { ITEM_MENU } from './view/actions';
import { openForRename } from './view/internals';
import { corkboard } from './view/corkboard';
import { byLabel } from './view/lanes';
import { BindersSettingTab, readSettings, type BindersSettings } from './settings';
import { dropNewFolderItem, installExplorer, renameInExplorer, type Explorer } from './explorer';
import type { ModeFactory } from './view/mode';
import { outliner } from './view/outliner';
import { manuscript } from './view/manuscript';
import { ConvertModal } from './longform-convert';
import { mergeScenes, splitScene, splitUndo } from './scenes';
import { Focus } from './focus/focus';
import { desktop } from './export/desktop';
import { printer } from './export/pdf';
import { ExportModal } from './view/export';
import { exportAgain } from './view/export-again';
import { Styles } from './export/styles';
import { CONTENTS_VIEW, installContents } from './inspector/contents-pane';
import { installInspector, showSide } from './inspector/views';
import { placeSide } from './inspector/place';
import type { Follow } from './inspector/follow';
import { installParagraphs, type Paragraphs } from './paragraphs/paragraphs';
import { isScene, leftovers } from './snapshots';
import { FolderSnapshotsModal, takeFolder } from './view/binder-snapshots';
import { deleteFolderSnapshot, folderSnapshots, hasSnapshots, makeFromSnapshot, nameFolderSnapshot, type FolderSnapshot } from './binder-snapshots';
import { LeftoversModal, SNAPSHOT_VIEW, SnapshotView, SnapshotsModal, folderSnapshotItems, snapshotItems, startRewrite, take } from './view/snapshots';

/* The plugin: builds the store, the explorer patch, the binder view and its modes, focus mode and the settings tab;
   registers the commands and the items Binders adds to Obsidian's file menus; and opens a binder view. It holds no logic
   a view or the store needs: a command finds what it applies to (`checkCallback`) and calls into them. A change the
   store can refuse (make a binder, new scene, move, group, merge, undo) runs through `tell()`, so a refusal is a notice,
   not silence. Focus mode registers its own commands
   (focus/focus.ts); the snapshot commands are in `snapshotCommands` here. The design is in docs/dev/plan.md, the map of the
   code in docs/dev/architecture.md. */

/** The plugin. `app.plugins.plugins.binders` is this: the store is `binders`, the explorer patch `explorer`. */
export default class BindersPlugin extends Plugin {
	settings: BindersSettings;
	/** The patch of Obsidian's file explorer (explorer.ts): refreshed when settings change. */
	explorer: Explorer;
	/** Every binder in the vault; views, the explorer and tests go through this. */
	binders: BinderStore;
	/** Snapshots, for the tests to ask of the plugin what a writer asks of it through a menu or a dialog (and to ask
	    the vault side directly for what the dialog never offers, to see it refused). */
	readonly snapshotsApi = {
		take: (note: TFile, title = '') => take(this, [note], title),
		takeFolder: (folder: TFolder, title = '') => takeFolder(this, folder, title),
		show: (folder: TFolder) => { new FolderSnapshotsModal(this, folder).open(); },
		has: (folder: TFolder) => hasSnapshots(this, folder),
		list: (folder: TFolder) => folderSnapshots(this, folder),
		name: (s: FolderSnapshot, _folder: TFolder, title: string) => nameFolderSnapshot(this.app, s, title),
		remove: (s: FolderSnapshot) => deleteFolderSnapshot(this.app, s),
		make: (s: FolderSnapshot, folder: TFolder, label: string) => makeFromSnapshot(this, s, folder, label),
	};
	/** Focus mode: its commands, the button on a binder's notes, the day's words (focus/focus.ts). */
	focus: Focus;
	/** Export's way to the computer's save dialog and disk (export/desktop.ts): null from it means there is none, and
	    files go into the vault. A field so a test can stand in for the system's dialog, which nothing can drive. */
	exportHost = { desktop, printer };
	/** The vault's export styles: the built-in ones and the files in the styles folder (export/styles.ts). */
	styles: Styles;
	/** What the inspector's panes follow: the notes and folders in hand in the tab the writer is in (inspector/follow.ts). */
	inspect: Follow;
	/** Tab paragraphs and first-line indents in a binder’s notes (paragraphs/paragraphs.ts). */
	paragraphs: Paragraphs;
	/** The binder view's modes by id: the view mounts one into its content (see view/mode.ts). */
	readonly modeFactories: Record<string, ModeFactory> = {
		corkboard,
		// (the corkboard arranged by label: not a mode of its own, but the board the corkboard shows then)
		[BY_LABEL]: byLabel,
		outliner,
		manuscript,
	};

	async onload() {
		await this.loadSettings();
		this.binders = new BinderStore(this);
		this.styles = new Styles(this);
		this.addSettingTab(new BindersSettingTab(this.app, this));
		// (the last argument: the folder the binder view in front shows, which the explorer marks as it marks the open note)
		this.explorer = installExplorer(this, this.binders, () => this.settings, (f, newLeaf) => void this.openBinder(f, newLeaf), () => { const v = this.app.workspace.getMostRecentLeaf()?.view; return v instanceof BinderView ? v.folder : null; }, (f) => this.styles.isStylesFolder(f));
		this.styles.start(() => this.explorer?.refresh());

		this.registerView(VIEW_TYPE, (leaf) => new BinderView(leaf, this));
		this.focus = new Focus(this);
		this.paragraphs = installParagraphs(this);
		this.registerView(SNAPSHOT_VIEW, (leaf) => new SnapshotView(leaf, this));
		this.inspect = installInspector(this);
		installContents(this, this.inspect);
		// (a binder view the workspace brings back in a tab not yet shown hasn't opened: it counts all the same)
		placeSide(this);
		// (not in a card's own menu, which has these already)
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file, source) => { if (source !== ITEM_MENU) this.fileMenu(menu, file, source); }));
		this.registerEvent(this.app.workspace.on('files-menu', (menu, files, source) => { if (source !== ITEM_MENU) this.filesMenu(menu, files, source); }));
		const active = () => this.app.workspace.getActiveFile();
		this.snapshotCommands(active);
		this.addCommand({ id: 'open-binder', name: 'Open binder', checkCallback: (checking) => {
			const file = active(), folder = this.folderOf(file);
			if (!file || !folder || !this.binders.binderOf(file)) return false;
			if (!checking) void this.openBinder(folder, false, this.binders.isHiddenNote(file) ? null : file);
			return true;
		} });
		for (const m of MODES) {
			this.addCommand({ id: `show-${m.id}`, name: `Show ${m.name.toLowerCase()}`, icon: m.icon, checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(BinderView);
				if (!view?.folder) return false;
				if (!checking) view.setMode(m.id);
				return true;
			} });
		}
		// the corkboard's cards by label (each label a line), or back in their grid
		this.addCommand({ id: 'arrange-by-label', name: 'Arrange corkboard by label', icon: 'chart-gantt', checkCallback: (checking) => {
			const view = this.app.workspace.getActiveViewOfType(BinderView);
			if (!view?.folder || view.mode !== 'corkboard') return false;
			if (!checking) view.arrange(view.arrangement === 'label' ? 'grid' : 'label');
			return true;
		} });
		this.addCommand({ id: 'make-binder', name: 'Make this folder a binder', checkCallback: (checking) => {
			const folder = active()?.parent;
			if (!folder || folder.isRoot() || this.binders.binderOf(folder)) return false;
			if (!checking) void this.makeBinder(folder);
			return true;
		} });
		// a binder from nothing: beside the note that's open if that's outside a binder, else at the top of the vault
		this.addCommand({ id: 'new-binder', name: 'New binder', icon: 'book', callback: () => {
			const file = active(), parent = file?.parent && !this.binders.binderOf(file) ? file.parent : this.app.vault.getRoot();
			void this.newBinder(parent);
		} });
		this.addCommand({ id: 'new-scene', name: 'New scene here', checkCallback: (checking) => {
			const file = active(), folder = this.folderOf(file);
			// in a binder view with nothing being typed in: where the view would put one (after the selection, or last)
			const view = this.app.workspace.getActiveViewOfType(BinderView);
			if (!file && view?.folder && !view.readOnly) { if (!checking) view.create('note'); return true; }
			if (!file || !folder || !this.binders.binderOf(file) || this.binders.problem(file)) return false;
			if (!checking) {
				// right after the note you're in; from a binder or folder note, at the end of that folder
				// (from a note the binder doesn't list, a Longform project's ignored note say, at the end too)
				const i = (this.binders.orderedChildren(folder) ?? []).indexOf(file);
				void this.newScene(folder, this.binders.isHiddenNote(file) || i < 0 ? undefined : i + 1);
			}
			return true;
		} });
		this.addCommand({ id: 'convert-longform', name: 'Convert to binder', checkCallback: (checking) => {
			// (the project of the open note, or the one a binder view in front is showing)
			const b = this.longformOf(active() ?? this.app.workspace.getActiveViewOfType(BinderView)?.folder ?? null);
			if (!b) return false;
			if (!checking) new ConvertModal(this.app, this.binders, b).open();
			return true;
		} });
		// (an undo in the editor right after a split takes back all of it, the new note too)
		this.registerEditorExtension(splitUndo(this));
		// splitting a scene where the cursor is, in a note or in the manuscript (whose sections are editors on their notes)
		for (const [id, name, titled] of [['split-scene', 'Split scene at cursor', false], ['split-scene-titled', 'Split scene with selection as title', true]] as const) {
			this.addCommand({ id, name, icon: 'split', editorCheckCallback: (checking, editor, ctx) => {
				const file = ctx.file;
				// (a scene of the binder: not its own note, nor one a Longform project leaves out)
				if (!file?.parent || !this.binders.binderOf(file) || this.binders.isHiddenNote(file) || this.binders.problem(file) || !(this.binders.orderedChildren(file.parent) ?? []).includes(file) || (titled && !editor.somethingSelected())) return false;
				if (!checking) void splitScene(this, editor, file, titled);
				return true;
			} });
		}
		// the word count target of the folder a binder view shows (the binder's own, on the binder)
		this.addCommand({ id: 'set-target', name: 'Set word count target', icon: 'target', checkCallback: (checking) => {
			const view = this.app.workspace.getActiveViewOfType(BinderView);
			if (!view?.folder || view.readOnly) return false;
			if (!checking) void view.setTarget();
			return true;
		} });
		this.addCommand({ id: 'export', name: 'Export binder', icon: 'book-up', checkCallback: (checking) => {
			const view = this.app.workspace.getActiveViewOfType(BinderView), file = active();
			const folder = view?.folder ?? (file && this.binders.binderOf(file)?.folder) ?? null;
			if (!folder) return false;
			if (!checking) new ExportModal(this, folder).open();
			return true;
			} });
			// the last export of the binder in front made once more, with no window (the window, if there was none yet)
			this.addCommand({ id: 'export-again', name: 'Export again', icon: 'book-check', checkCallback: (checking) => {
			const view = this.app.workspace.getActiveViewOfType(BinderView), file = active();
			const folder = view?.folder ?? (file && this.binders.binderOf(file)?.folder) ?? null;
			if (!folder) return false;
			if (!checking) void exportAgain(this, folder);
			return true;
			} });
		// a move made by hand (a drag, Move up) taken back, or made again: for the binder in view, or the open note's
		for (const [id, name, redo] of [['undo-move', 'Undo last move', false], ['redo-move', 'Redo last move', true]] as const) {
			this.addCommand({ id, name, icon: redo ? 'redo-2' : 'undo-2', checkCallback: (checking) => {
				// the binder in view, or the open note's, and that binder only: with nothing to undo there, a move made in
				// another binder, out of sight, isn't the one taken back. With neither (the file explorer has the focus,
				// say, or a note outside every binder), the binder that was changed last
				// (the pane in use, not the note that was last open somewhere: with the file explorer in use, that's stale)
				const here = this.app.workspace.getActiveViewOfType(BinderView)?.folder ?? this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
				const at = here && this.binders.binderOf(here) ? here : this.binders.lastChanged(redo);
				if (!at || !this.binders.undoable(at, redo)) return false;
				if (!checking) void this.undoMove(at, redo);
				return true;
			} });
		}
		for (const [id, name, delta] of [['move-up', 'Move up', -1], ['move-down', 'Move down', 1]] as const) {
			this.addCommand({ id, name, checkCallback: (checking) => {
				const file = active();
				if (!file || !this.canStep(file, delta)) return false;
				if (!checking) void this.step(file, delta);
				return true;
			} });
		}
	}

	/** The snapshot commands, for the note that's open (or, in a manuscript, the section the cursor is in), and for
	    the binder in view. */
	private snapshotCommands(active: () => TFile | null): void {
		const view = () => this.app.workspace.getActiveViewOfType(BinderView);
		const scene = (change: boolean): TFile | null => {
			// (in a binder view: the section being typed in; never a note last open elsewhere)
			const f = view() ? this.app.workspace.activeEditor?.file ?? null : active();
			return isScene(this, f) && !(change && this.binders.problem(f)) ? f : null;
		};
		const folder = (): TFolder | null => { const f = view()?.folder ?? active(); return f ? this.binders.binderOf(f)?.folder ?? null : null; };
		this.addCommand({ id: 'take-snapshot', name: 'Take a snapshot', icon: 'camera', checkCallback: (checking) => { const f = scene(true); if (!f) return false; if (!checking) void take(this, [f]); return true; } });
		this.addCommand({ id: 'rewrite', name: 'Rewrite', icon: 'file-pen-line', checkCallback: (checking) => { const f = scene(true); if (!f) return false; if (!checking) startRewrite(this, f); return true; } });
		this.addCommand({ id: 'show-snapshots', name: 'Show snapshots', icon: 'history', checkCallback: (checking) => { const f = scene(false); if (!f) return false; if (!checking) new SnapshotsModal(this, f).open(); return true; } });
		// the whole binder, from its view or from any of its notes. ("take-snapshots" was "Take a snapshot of every note
		// in the binder": the same wish, and a hotkey given to it still works.)
		this.addCommand({ id: 'take-snapshots', name: 'Take a snapshot of the binder', icon: 'camera', checkCallback: (checking) => { const f = folder(); if (!f || this.binders.problem(f)) return false; if (!checking) void takeFolder(this, f); return true; } });
		this.addCommand({ id: 'show-binder-snapshots', name: 'Show snapshots of the binder', icon: 'history', checkCallback: (checking) => { const f = folder(); if (!f) return false; if (!checking) new FolderSnapshotsModal(this, f).open(); return true; } });
		this.addCommand({ id: 'show-leftover-snapshots', name: 'Show snapshots of notes that are gone', icon: 'history', checkCallback: (checking) => { const f = folder(), b = f ? this.binders.binderOf(f) : null; if (!b || !leftovers(this, b).length) return false; if (!checking) new LeftoversModal(this, b).open(); return true; } });
	}

	/** Opens the binder view on a folder: in the tab already showing that binder, if there is one, else in the active
	    tab (or a new one for `newLeaf`, as Mod-click does), as opening a note would. `reveal` selects that note's card. */
	async openBinder(folder: TFolder, newLeaf: boolean | PaneType = false, reveal: TAbstractFile | null = null): Promise<void> {
		const ws = this.app.workspace, binder = this.binders.binderOf(folder);
		let leaf: WorkspaceLeaf | null = null;
		if (!newLeaf) {
			// by its saved state, so tabs that haven't loaded yet count too
			// (the tab in front, if it shows this binder: with the binder in two tabs, that's the one that goes there)
			const shows = (l: WorkspaceLeaf) => { const f = (l.getViewState().state as { folder?: unknown } | undefined)?.folder; return l.getViewState().type === VIEW_TYPE && typeof f === 'string' && this.binders.binderOf(f) === binder; };
			const front = ws.getMostRecentLeaf();
			leaf = (front && shows(front) ? front : ws.getLeavesOfType(VIEW_TYPE).find(shows)) ?? null;
		}
		leaf ??= ws.getLeaf(newLeaf);
		const was = leaf.getViewState();
		// a tab that's on something else opens the binder as its view was last left (its mode, its filter, how it
		// shows), not as a fresh corkboard
		const state = was.type === VIEW_TYPE ? { ...was.state, folder: folder.path } : { ...(binder ? this.lastView.get(binder.note.path) : null), folder: folder.path };
		await leaf.setViewState({ type: VIEW_TYPE, state, active: true });
		ws.setActiveLeaf(leaf, { focus: true });
		if (leaf.view instanceof BinderView) {
			if (reveal) leaf.view.revealItem(reveal);
			// the keyboard is in what was opened: an arrow key goes to a card or a row
			leaf.view.focusMode();
		}
	}

	/** A binder view has opened: the inspector and the contents are among the right sidebar's tabs (inspector/place.ts). */
	binderOpened(): void { placeSide(this); }

	/** Shows the contents of the book in the sidebar (the binder view's "More options" asks; inspector/contents-pane.ts). */
	showContents(): void { void showSide(this, CONTENTS_VIEW); }

	/** How each binder's view was last left (mode, filter, options), by its binder note, for opening it again. */
	lastView = new Map<string, Record<string, unknown>>();

	/** Reads the saved settings, made whole (settings-data.ts). */
	async loadSettings() {
		this.settings = readSettings(await this.loadData());
	}

	/** Saves the settings and tells everything that shows them: the explorer, the views, focus mode. */
	async saveSettings() {
		await this.saveData(this.settings);
		this.explorer?.refresh(); // order, hidden notes and label dots follow their settings
		this.binders?.refresh(); // the views: labels and statuses may have changed
		this.focus?.optionsChanged(); // focus mode: what's on its page follows its options
		this.paragraphs?.refresh(); // every editor on a binder's note: how paragraphs are shown
	}

	/** What Binders adds to the menu of one note or folder, wherever Obsidian shows it (the file explorer, a tab, a
	    note's "More options"): each item in the section Obsidian's own items of its kind are in. */
	private fileMenu(menu: Menu, file: TAbstractFile, source = ''): void {
		const b = this.binders;
		// (a note's own "More options" has no section for making things: there, with what else is done to the note)
		const make = source === 'more-options' ? 'action' : 'action-primary';
		// the binder's own note (where the quick switcher lands for a binder's name) leads to its binder
		const own = file instanceof TFile ? b.binderOf(file) : null;
		if (own && file === own.note) menu.addItem((i) => i.setSection('open').setTitle('Open binder').setIcon('book').onClick((e) => void this.openBinder(own.folder, Keymap.isModEvent(e))));
		if (file instanceof TFolder && b.binderOf(file)) {
			// (in the sections Obsidian's own items of the kind are in: opening with "Open in new tab", making with "New note")
			menu.addItem((i) => i.setSection('open').setTitle('Open binder').setIcon('book').onClick((e) => void this.openBinder(file, Keymap.isModEvent(e))));
		}
		if (file instanceof TFolder && !file.isRoot() && !b.binderOf(file)) {
			menu.addItem((i) => i.setSection('action-primary').setTitle('Make this folder a binder').setIcon('library').onClick(() => void this.makeBinder(file)));
		}
		// (beside "New note" and "New folder", wherever those are offered outside a binder: the vault's own menu too)
		if (file instanceof TFolder && !b.binderOf(file)) {
			menu.addItem((i) => i.setSection('action-primary').setTitle('New binder').setIcon('book').onClick(() => void this.newBinder(file)));
		}
		if (file instanceof TFolder && b.binderOf(file) && !b.problem(file)) {
			menu.addItem((i) => i.setSection('action-primary').setTitle('New scene here').setIcon('file-plus').onClick(() => void this.newScene(file)));
		}
		if (file instanceof TFolder && b.binderOf(file)) menu.addItem((i) => i.setSection('action').setTitle('Export...').setIcon('book-up').onClick(() => new ExportModal(this, file).open()));
		// a note in a binder: its card, and a new note right after it
		const folder = file.parent;
		if (file instanceof TFile && folder && b.binderOf(file) && !b.isHiddenNote(file) && (b.orderedChildren(folder) ?? []).includes(file)) {
			menu.addItem((i) => i.setSection('open').setTitle('Show in binder').setIcon('book').onClick((e) => void this.openBinder(folder, Keymap.isModEvent(e), file)));
			if (file.extension === 'md' && !b.problem(file)) menu.addItem((i) => i.setSection(make).setTitle('New scene after this').setIcon('file-plus').onClick(() => void this.newScene(folder, (b.orderedChildren(folder) ?? []).indexOf(file) + 1)));
		}
		// snapshots: a note's, in its own menu and in the file explorer as on its card; a folder's notes, all at once
		snapshotItems(this, menu, [file], 'action');
		if (file instanceof TFolder) folderSnapshotItems(this, menu, file, 'action');
		const lf = this.longformOf(file);
		if (lf && (file === lf.note || file === lf.folder)) menu.addItem((i) => i.setSection('action-primary').setTitle('Convert to binder').setIcon('library').onClick(() => new ConvertModal(this.app, b, lf).open()));
		if (this.canStep(file, -1)) menu.addItem((i) => i.setSection('action').setTitle('Move up').setIcon('arrow-up').onClick(() => void this.step(file, -1)));
		if (this.canStep(file, 1)) menu.addItem((i) => i.setSection('action').setTitle('Move down').setIcon('arrow-down').onClick(() => void this.step(file, 1)));
	}

	/** The folder a note is in, as far as its binder goes: a Longform index note may be outside its project's scene
	    folder, and stands for that folder. */
	private folderOf(file: TFile | null): TFolder | null {
		const b = file && this.binders.binderOf(file);
		return b && file === b.note ? b.folder : file?.parent ?? null;
	}

	/** The Longform project a note or folder is in, if any. */
	private longformOf(item: TAbstractFile | null): Binder | null {
		const b = item && this.binders.binderOf(item);
		return b && b.kind === 'longform' ? b : null;
	}

	/** Several items selected in the file explorer, all in one binder: put them in a folder, or join the notes. */
	private filesMenu(menu: Menu, files: TAbstractFile[], source = ''): void {
		const b = this.binders, binder = files[0] ? b.binderOf(files[0]) : null;
		if (!binder || files.length < 2 || b.problem(files[0]) || !files.every((f) => b.binderOf(f) === binder && f !== binder.folder && !b.isHiddenNote(f))) return;
		// in the order they show, whatever order they were clicked in
		const items = b.inOrder(files);
		if (binder.kind === 'binder' && items.every((f) => f.parent === items[0].parent)) {
			// One item makes a folder of a selection, not two. In the file explorer Obsidian has its own, which in a
			// binder would put the folder last, with the notes in the order they were clicked, and couldn't be undone:
			// this one is there in its place. (If Obsidian's can't be found, both show, as they did.)
			if (source === 'file-explorer-context-menu') dropNewFolderItem(menu);
			menu.addItem((i) => i.setSection('action').setTitle('New folder from selection').setIcon('folder-plus').onClick(async () => {
				const made = await this.tell(b.group(items));
				if (made) this.later(() => renameInExplorer(this.app, made), 100); // (once the explorer has its row)
			}));
		}
		const notes = items.filter((f): f is TFile => f instanceof TFile && f.extension === 'md');
		if (notes.length === items.length) menu.addItem((i) => i.setSection('action').setTitle(`Merge ${notes.length} notes`).setIcon('merge').onClick(() => void this.tell(mergeScenes(this, notes))));
	}

	/** A timer that is cleared if the plugin is turned off first, so its callback never runs on a dead plugin. */
	private later(fn: () => void, ms: number) {
		const id = window.setTimeout(fn, ms);
		this.register(() => window.clearTimeout(id));
	}

	private canStep(item: TAbstractFile, delta: number): boolean {
		const b = this.binders, folder = item.parent;
		if (!folder || !b.binderOf(item) || b.isBinderFolder(item) || b.isHiddenNote(item) || b.problem(item)) return false;
		const sibs = b.orderedChildren(folder) ?? [], i = sibs.indexOf(item);
		return i >= 0 && i + delta >= 0 && i + delta < sibs.length;
	}

	private async step(item: TAbstractFile, delta: number) {
		await this.tell(delta < 0 ? this.binders.moveUp(item) : this.binders.moveDown(item));
	}

	private async makeBinder(folder: TFolder) {
		const note = await this.tell(this.binders.makeBinder(folder));
		if (note) new Notice(`“${folder.name}” is now a binder.`);
	}

	/** A new folder in `parent` that's a binder from the start, its name ready to type in the file explorer. */
	private async newBinder(parent: TFolder) {
		const { vault } = this.app, at = (name: string) => normalizePath(`${parent.path}/${name}`);
		let name = 'Untitled binder';
		for (let n = 1; vault.getAbstractFileByPath(at(name)); n++) name = `Untitled binder ${n}`;
		const folder = await this.tell(vault.createFolder(at(name)));
		if (!folder || !(await this.tell(this.binders.makeBinder(folder)))) return;
		this.later(() => {
			// (once the explorer has its row) its name ready to type there; with the explorer out of sight (the command,
			// with a phone's drawer shut), the new binder opens instead, so there's something to see
			if (!renameInExplorer(this.app, folder)) void this.openBinder(folder);
		}, 100);
	}

	private async newScene(folder: TFolder, index?: number) {
		const file = await this.tell(this.binders.newScene(folder, index));
		if (!(file instanceof TFile)) return;
		// in a binder view on that folder, the new note shows there, ready to be named: the view isn't left for the note
		// (the view in front: with the file explorer in use, a phone's drawer say, no view is "active")
		const front = this.app.workspace.getMostRecentLeaf(), view = this.app.workspace.getActiveViewOfType(BinderView) ?? (front?.view instanceof BinderView ? front.view : null);
		if (view?.folder && (file.parent === view.folder || file.path.startsWith(view.folder.path + '/'))) {
			// the keyboard goes to the view (on a phone that closes the drawer over it) before the name is asked for
			if (Platform.isPhone) this.app.workspace.leftSplit?.collapse();
			this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
			// (once the drawer has gone: as it goes it takes the focus from whatever has it)
			if (view.mode === 'corkboard' && view.folder !== file.parent && file.parent) {
				await view.setState({ ...view.getState(), folder: file.parent.path }, { history: false });
			}
			this.later(() => view.revealItem(file, true), Platform.isPhone ? 350 : 0);
			return;
		}
		// its name ready to type over, as a new note made in the file explorer is
		await openForRename(this.app.workspace.getLeaf(false), file);
	}

	/** Takes back the last move made by hand in the binder `at` is in (or makes it again), and says which. */
	async undoMove(at: TAbstractFile, redo = false): Promise<boolean> {
		const what = await this.tell(this.binders.undo(at, redo));
		if (what) new Notice(`${redo ? 'Redid' : 'Undid'}: ${what.charAt(0).toLowerCase()}${what.slice(1)}`, 2500);
		return !!what;
	}

	/** Runs a user action, showing why it failed instead of failing silently. */
	private async tell<T>(p: Promise<T>): Promise<T | undefined> {
		try { return await p; } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); return undefined; }
	}
}
