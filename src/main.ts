import { Notice, Plugin, TFile, TFolder, type Menu, type TAbstractFile } from 'obsidian';
import { BinderStore } from './binders';
import { BindersSettingTab, DEFAULT_SETTINGS, type BindersSettings } from './settings';
import { installExplorer, type Explorer } from './explorer'; // explorer (0.3)
import type { ModeFactory } from './view/mode';
import { plotgrid } from './view/plotgrid'; // plot grid (0.5)

/* Binders: ordered folders for long-form writing. See docs/plan.md for the design. */
export default class BindersPlugin extends Plugin {
	settings: BindersSettings;
	explorer: Explorer; // explorer (0.3)
	/** Every binder in the vault; views, the explorer and tests go through this. */
	binders: BinderStore;
	/** The binder view's modes by id: the view mounts one into its content (see view/mode.ts). */
	readonly modeFactories: Record<string, ModeFactory> = {
		plotgrid, // plot grid (0.5)
	};

	async onload() {
		await this.loadSettings();
		this.binders = new BinderStore(this);
		this.addSettingTab(new BindersSettingTab(this.app, this));
		// explorer (0.3) >>>
		this.explorer = installExplorer(this, this.binders, () => this.settings, (f) => this.openBinder(f));
		// <<< explorer (0.3)

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => this.fileMenu(menu, file)));
		const active = () => this.app.workspace.getActiveFile();
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

	/** Opens the binder view on a folder. explorer (0.3): placeholder until the binder view lands. */
	openBinder(folder: TFolder): void { void folder; }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<BindersSettings> | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.explorer?.refresh(); // explorer (0.3)
	}

	private fileMenu(menu: Menu, file: TAbstractFile): void {
		const b = this.binders;
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
