import { Plugin } from 'obsidian';
import { BindersSettingTab, DEFAULT_SETTINGS, type BindersSettings } from './settings';

/* Binders: ordered folders for long-form writing. See docs/plan.md for the design; this is the 0.1 scaffold. */
export default class BindersPlugin extends Plugin {
	settings: BindersSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BindersSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<BindersSettings> | null);
	}

	async saveSettings() { await this.saveData(this.settings); }
}
