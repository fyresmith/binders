import { Plugin, type TFolder } from 'obsidian';
import { BindersSettingTab, DEFAULT_SETTINGS, type BindersSettings } from './settings';
import { installExplorer, type Explorer } from './explorer'; // explorer (0.3)
import { DevExplorerSource } from './explorer-dev-source'; // explorer (0.3): swap for the binder store

/* Binders: ordered folders for long-form writing. See docs/plan.md for the design; this is the 0.1 scaffold. */
export default class BindersPlugin extends Plugin {
	settings: BindersSettings;
	explorer: Explorer; // explorer (0.3)

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BindersSettingTab(this.app, this));
		// explorer (0.3) >>>
		this.explorer = installExplorer(this, new DevExplorerSource(this.app, this), () => this.settings, (f) => this.openBinder(f));
		// <<< explorer (0.3)
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
}
