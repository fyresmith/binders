import { Keymap, Notice, Plugin, TFile, TFolder, type Menu, type PaneType, type TAbstractFile, type WorkspaceLeaf } from 'obsidian';
import { BinderStore } from './binders';
import { BinderView, MODES, VIEW_TYPE } from './view/BinderView';
import { corkboard } from './view/corkboard';
import { BindersSettingTab, DEFAULT_SETTINGS, type BindersSettings } from './settings';
import { installExplorer, type Explorer } from './explorer'; // explorer (0.3)
import type { ModeFactory } from './view/mode';
import { plotgrid } from './view/plotgrid'; // plot grid (0.5)
import { manuscript } from './view/manuscript'; // manuscript (0.6)

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
		plotgrid, // plot grid (0.5)
		manuscript, // manuscript (0.6)
	};

	async onload() {
		await this.loadSettings();
		this.binders = new BinderStore(this);
		this.addSettingTab(new BindersSettingTab(this.app, this));
		// explorer (0.3) >>>
		this.explorer = installExplorer(this, this.binders, () => this.settings, (f) => void this.openBinder(f));
		// <<< explorer (0.3)

		this.registerView(VIEW_TYPE, (leaf) => new BinderView(leaf, this));
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => this.fileMenu(menu, file)));
		const active = () => this.app.workspace.getActiveFile();
		this.addCommand({ id: 'open-binder', name: 'Open binder', checkCallback: (checking) => {
			const file = active(), folder = file?.parent;
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
			const file = active(), folder = file?.parent;
			if (!file || !folder || !this.binders.binderOf(file) || this.binders.problem(file)) return false;
			if (!checking) {
				// right after the note you're in; from a binder or folder note, at the end of that folder
				const at = this.binders.isHiddenNote(file) ? undefined : (this.binders.orderedChildren(folder) ?? []).indexOf(file) + 1;
				void this.newScene(folder, at);
			}
			return true;
		} });
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
		const state = was.type === VIEW_TYPE ? { ...was.state, folder: folder.path } : { folder: folder.path };
		await leaf.setViewState({ type: VIEW_TYPE, state, active: true });
		ws.setActiveLeaf(leaf, { focus: true });
		if (reveal && leaf.view instanceof BinderView) leaf.view.revealItem(reveal);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<BindersSettings> | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.explorer?.refresh(); // explorer (0.3)
	}

	private fileMenu(menu: Menu, file: TAbstractFile): void {
		const b = this.binders;
		if (file instanceof TFolder && b.binderOf(file)) {
			menu.addItem((i) => i.setTitle('Open binder').setIcon('book').onClick((e) => void this.openBinder(file, Keymap.isModEvent(e))));
		}
		if (file instanceof TFolder && !file.isRoot() && !b.binderOf(file)) {
			menu.addItem((i) => i.setTitle('Make this folder a binder').setIcon('library').onClick(() => void this.makeBinder(file)));
		}
		if (file instanceof TFolder && b.binderOf(file) && !b.problem(file)) {
			menu.addItem((i) => i.setTitle('New scene here').setIcon('file-plus').onClick(() => void this.newScene(file)));
		}
		if (this.canStep(file, -1)) menu.addItem((i) => i.setTitle('Move up').setIcon('arrow-up').onClick(() => void this.step(file, -1)));
		if (this.canStep(file, 1)) menu.addItem((i) => i.setTitle('Move down').setIcon('arrow-down').onClick(() => void this.step(file, 1)));
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

	private async newScene(folder: TFolder, index?: number) {
		const file = await this.tell(this.binders.newScene(folder, index));
		if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
	}

	/** Runs a user action, showing why it failed instead of failing silently. */
	private async tell<T>(p: Promise<T>): Promise<T | undefined> {
		try { return await p; } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); return undefined; }
	}
}
