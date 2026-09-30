import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from 'obsidian';
import type BindersPlugin from './main';

export interface BindersSettings {
	/** Show binders in their own order in Obsidian's file explorer (patches the explorer's sorting). */
	orderExplorer: boolean;
	/** Clicking a binder, or a folder inside one, in the file explorer opens its binder view. */
	openOnClick: boolean;
}

export const DEFAULT_SETTINGS: BindersSettings = { orderExplorer: true, openOnClick: true };

const TEXT = {
	order: ['Order binders in the file explorer', 'Show the notes and folders in a binder in its own order instead of by name. Turn this off if another plugin replaces the file explorer.'],
	click: ['Open binders from the file explorer', 'Clicking a binder, or a folder inside one, opens its binder view.'],
} as const;

/* Plugin-wide settings. Each binder's own options live in its binder note. */
export class BindersSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: BindersPlugin) { super(app, plugin); }

	/** Obsidian 1.13 and later draw the tab from these, and can search them; display() below is for older versions. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ type: 'group', heading: 'File explorer', items: [
				{ name: TEXT.order[0], desc: TEXT.order[1], control: { type: 'toggle', key: 'orderExplorer' } },
				{ name: TEXT.click[0], desc: TEXT.click[1], control: { type: 'toggle', key: 'openOnClick' } },
			] },
		];
	}

	setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.plugin.settings;
		if ((key === 'orderExplorer' || key === 'openOnClick') && typeof value === 'boolean') s[key] = value;
		return this.plugin.saveSettings();
	}

	display(): void {
		const { containerEl } = this, s = this.plugin.settings;
		containerEl.empty();
		new Setting(containerEl).setName('File explorer').setHeading();
		new Setting(containerEl).setName(TEXT.order[0]).setDesc(TEXT.order[1])
			.addToggle((t) => t.setValue(s.orderExplorer).onChange(async (v) => { s.orderExplorer = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName(TEXT.click[0]).setDesc(TEXT.click[1])
			.addToggle((t) => t.setValue(s.openOnClick).onChange(async (v) => { s.openOnClick = v; await this.plugin.saveSettings(); }));
	}
}
