import { Keymap, MarkdownView, Notice, Plugin, TFile, TFolder, normalizePath, type Menu, type PaneType, type TAbstractFile, type WorkspaceLeaf } from 'obsidian';
import { BinderStore, type Binder } from './binders';
import { BinderView, MODES, VIEW_TYPE } from './view/BinderView';
import { ITEM_MENU } from './view/actions';
import { openForRename } from './view/internals';
import { corkboard } from './view/corkboard';
import { BindersSettingTab, readSettings, type BindersSettings } from './settings';
import { installExplorer, renameInExplorer, type Explorer } from './explorer'; // explorer (0.3)
import type { ModeFactory } from './view/mode';
import { outliner } from './view/outliner';
import { manuscript } from './view/manuscript'; // manuscript (0.6)
import { ConvertModal } from './longform-convert'; // longform (0.7)
import { CompileModal, mergeScenes, splitScene } from './scenes';

/* Binders: ordered folders for long-form writing. See docs/plan.md for the design. */
export default class BindersPlugin extends Plugin {
	settings: BindersSettings;
	explorer: Explorer; // explorer (0.3)
	/** Every binder in the vault; views, the explorer and tests go through this. */
	binders: BinderStore;
	/** The binder view's modes by id: the view mounts one into its content (see view/mode.ts); a mode not here shows
	    "coming soon". */
	readonly modeFactories: Record<string, ModeFactory> = {
		corkboard,
		outliner,
		manuscript, // manuscript (0.6)
	};

	async onload() {
		await this.loadSettings();
		this.binders = new BinderStore(this);
		this.addSettingTab(new BindersSettingTab(this.app, this));
		// explorer (0.3) >>>
		this.explorer = installExplorer(this, this.binders, () => this.settings, (f, newLeaf) => void this.openBinder(f, newLeaf), () => { const v = this.app.workspace.getMostRecentLeaf()?.view; return v instanceof BinderView ? v.folder : null; });
		// <<< explorer (0.3)

		this.registerView(VIEW_TYPE, (leaf) => new BinderView(leaf, this));
		// (not in a card's own menu, which has these already)
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file, source) => { if (source !== ITEM_MENU) this.fileMenu(menu, file); }));
		this.registerEvent(this.app.workspace.on('files-menu', (menu, files, source) => { if (source !== ITEM_MENU) this.filesMenu(menu, files); }));
		const active = () => this.app.workspace.getActiveFile();
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
		this.addCommand({ id: 'make-binder', name: 'Make this folder a binder', checkCallback: (checking) => {
			const folder = active()?.parent;
			if (!folder || folder.isRoot() || this.binders.binderOf(folder)) return false;
			if (!checking) void this.makeBinder(folder);
			return true;
		} });
		this.addCommand({ id: 'new-scene', name: 'New scene here', checkCallback: (checking) => {
			const file = active(), folder = this.folderOf(file);
			// in a binder view with nothing being typed in: where the view would put one (after the selection, or last)
			const view = this.app.workspace.getActiveViewOfType(BinderView);
			if (!file && view?.folder && !view.readOnly) { if (!checking) view.create('note'); return true; }
			if (!file || !folder || !this.binders.binderOf(file) || this.binders.problem(file)) return false;
			if (!checking) {
				// right after the note you're in; from a binder or folder note, at the end of that folder
				const at = this.binders.isHiddenNote(file) ? undefined : (this.binders.orderedChildren(folder) ?? []).indexOf(file) + 1;
				void this.newScene(folder, at);
			}
			return true;
		} });
		// longform (0.7) >>>
		this.addCommand({ id: 'convert-longform', name: 'Convert to binder', checkCallback: (checking) => {
			// (the project of the open note, or the one a binder view in front is showing)
			const b = this.longformOf(active() ?? this.app.workspace.getActiveViewOfType(BinderView)?.folder ?? null);
			if (!b) return false;
			if (!checking) new ConvertModal(this.app, this.binders, b).open();
			return true;
		} });
		// <<< longform (0.7)
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
		this.addCommand({ id: 'compile', name: 'Compile binder', icon: 'book-check', checkCallback: (checking) => {
			const view = this.app.workspace.getActiveViewOfType(BinderView), file = active();
			const folder = view?.folder ?? (file && this.binders.binderOf(file)?.folder) ?? null;
			if (!folder) return false;
			if (!checking) new CompileModal(this, folder).open();
			return true;
		} });
		// a move made by hand (a drag, Move up) taken back, or made again: for the binder in view, or the open note's
		for (const [id, name, redo] of [['undo-move', 'Undo last move', false], ['redo-move', 'Redo last move', true]] as const) {
			this.addCommand({ id, name, icon: redo ? 'redo-2' : 'undo-2', checkCallback: (checking) => {
				// the binder in view, or the open note's; with neither (the file explorer has the focus, say), the binder
				// that was changed last
				// (the pane in use, not the note that was last open somewhere: with the file explorer in use, that's stale)
				const here = this.app.workspace.getActiveViewOfType(BinderView)?.folder ?? this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
				const at = here && this.binders.undoable(here, redo) ? here : this.binders.lastChanged(redo);
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

	/** Opens the binder view on a folder: in the tab already showing that binder, if there is one, else in the active
	    tab (or a new one for `newLeaf`, as Mod-click does), as opening a note would. `reveal` selects that note's card. */
	async openBinder(folder: TFolder, newLeaf: boolean | PaneType = false, reveal: TAbstractFile | null = null): Promise<void> {
		const ws = this.app.workspace, binder = this.binders.binderOf(folder);
		let leaf: WorkspaceLeaf | null = null;
		if (!newLeaf) {
			// by its saved state, so tabs that haven't loaded yet count too
			leaf = ws.getLeavesOfType(VIEW_TYPE).find((l) => { const f = (l.getViewState().state as { folder?: unknown } | undefined)?.folder; return typeof f === 'string' && this.binders.binderOf(f) === binder; }) ?? null;
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

	/** How each binder's view was last left (mode, filter, options), by its binder note, for opening it again. */
	lastView = new Map<string, Record<string, unknown>>();

	async loadSettings() {
		this.settings = readSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.explorer?.refresh(); // explorer (0.3)
		this.binders?.refresh(); // the views: labels and statuses may have changed
	}

	private fileMenu(menu: Menu, file: TAbstractFile): void {
		const b = this.binders;
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
		if (file instanceof TFolder && b.binderOf(file)) menu.addItem((i) => i.setSection('action').setTitle('Compile...').setIcon('book-check').onClick(() => new CompileModal(this, file).open()));
		// a note in a binder: its card, and a new note right after it
		const folder = file.parent;
		if (file instanceof TFile && folder && b.binderOf(file) && !b.isHiddenNote(file) && (b.orderedChildren(folder) ?? []).includes(file)) {
			menu.addItem((i) => i.setSection('open').setTitle('Show in binder').setIcon('book').onClick((e) => void this.openBinder(folder, Keymap.isModEvent(e), file)));
			if (file.extension === 'md' && !b.problem(file)) menu.addItem((i) => i.setSection('action-primary').setTitle('New scene after this').setIcon('file-plus').onClick(() => void this.newScene(folder, (b.orderedChildren(folder) ?? []).indexOf(file) + 1)));
		}
		const lf = this.longformOf(file); // longform (0.7)
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

	/** The Longform project a note or folder is in, if any. longform (0.7) */
	private longformOf(item: TAbstractFile | null): Binder | null {
		const b = item && this.binders.binderOf(item);
		return b && b.kind === 'longform' ? b : null;
	}

	/** Several items selected in the file explorer, all in one binder: put them in a folder, or join the notes. */
	private filesMenu(menu: Menu, files: TAbstractFile[]): void {
		const b = this.binders, binder = files[0] ? b.binderOf(files[0]) : null;
		if (!binder || files.length < 2 || b.problem(files[0]) || !files.every((f) => b.binderOf(f) === binder && f !== binder.folder && !b.isHiddenNote(f))) return;
		// in the order they show, whatever order they were clicked in
		const items = b.inOrder(files);
		if (binder.kind === 'binder' && items.every((f) => f.parent === items[0].parent)) {
			menu.addItem((i) => i.setSection('action').setTitle('New folder from selection').setIcon('folder-plus').onClick(async () => {
				const made = await this.tell(b.group(items));
				if (made) window.setTimeout(() => renameInExplorer(this.app, made), 100); // (once the explorer has its row)
			}));
		}
		const notes = items.filter((f): f is TFile => f instanceof TFile && f.extension === 'md');
		if (notes.length === items.length) menu.addItem((i) => i.setSection('action').setTitle(`Merge ${notes.length} notes`).setIcon('merge').onClick(() => void this.tell(mergeScenes(this, notes))));
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
		window.setTimeout(() => renameInExplorer(this.app, folder), 100); // (once the explorer has its row)
	}

	private async newScene(folder: TFolder, index?: number) {
		const file = await this.tell(this.binders.newScene(folder, index));
		if (!(file instanceof TFile)) return;
		// in a binder view on that folder, the new note shows there, ready to be named: the view isn't left for the note
		const view = this.app.workspace.getActiveViewOfType(BinderView);
		if (view?.folder && (file.parent === view.folder || file.path.startsWith(view.folder.path + '/'))) { view.revealItem(file, true); return; }
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
