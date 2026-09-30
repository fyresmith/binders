import { PluginSettingTab, Setting, type App, type SettingDefinitionItem } from 'obsidian';
import type BindersPlugin from './main';

export interface BindersSettings {
	/** Show binders in their own order in Obsidian's file explorer (patches the explorer's sorting). */
	orderExplorer: boolean;
	/** Clicking a binder, or a folder inside one, in the file explorer opens its binder view. */
	openOnClick: boolean;
	/** Hide binder notes and folder notes in the file explorer (clicking the folder opens them in the binder view). */
	hideBinderNotes: boolean;
	/** The property names scenes use; changeable so Binders can share a vault's existing names. */
	synopsisProp: string;
	statusProp: string;
	labelProp: string;
	plotlinesProp: string;
}

export const DEFAULT_SETTINGS: BindersSettings = {
	orderExplorer: true, openOnClick: true, hideBinderNotes: true,
	synopsisProp: 'synopsis', statusProp: 'status', labelProp: 'label', plotlinesProp: 'plotlines',
};

type Toggle = 'orderExplorer' | 'openOnClick' | 'hideBinderNotes';
type Prop = 'synopsisProp' | 'statusProp' | 'labelProp' | 'plotlinesProp';
const TOGGLES: Toggle[] = ['orderExplorer', 'openOnClick', 'hideBinderNotes'];
const PROPS: Prop[] = ['synopsisProp', 'statusProp', 'labelProp', 'plotlinesProp'];

const TEXT: Record<Toggle | Prop, readonly [string, string]> = {
	orderExplorer: ['Order binders in the file explorer', 'Show the notes and folders in a binder in its own order instead of by name. Turn this off if another plugin replaces the file explorer.'],
	openOnClick: ['Open binders from the file explorer', 'Clicking a binder, or a folder inside one, opens its binder view.'],
	hideBinderNotes: ['Hide binder and folder notes', 'Don’t list a binder’s own note, or a folder’s note named like it, in the file explorer. Clicking the folder opens them in the binder view.'],
	synopsisProp: ['Synopsis', 'The property that holds a note’s card text.'],
	statusProp: ['Status', 'The property that holds a note’s status, such as draft or revised.'],
	labelProp: ['Label', 'The property that holds a note’s label color.'],
	plotlinesProp: ['Plotlines', 'The property that lists the plotlines a scene belongs to.'],
};

/* Plugin-wide settings. Each binder's own options live in its binder note. */
export class BindersSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: BindersPlugin) { super(app, plugin); }

	/** Obsidian 1.13 and later draw the tab from these, and can search them; display() below is for older versions. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ type: 'group', heading: 'File explorer', items: TOGGLES.map((k) => ({ name: TEXT[k][0], desc: TEXT[k][1], control: { type: 'toggle', key: k } })) },
			{ type: 'group', heading: 'Property names', items: PROPS.map((k) => ({ name: TEXT[k][0], desc: TEXT[k][1], control: { type: 'text', key: k, placeholder: DEFAULT_SETTINGS[k] } })) },
		];
	}

	setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.plugin.settings;
		if ((TOGGLES as string[]).includes(key) && typeof value === 'boolean') s[key as Toggle] = value;
		if ((PROPS as string[]).includes(key) && typeof value === 'string') s[key as Prop] = value.trim() || DEFAULT_SETTINGS[key as Prop];
		return this.plugin.saveSettings();
	}

	display(): void {
		const { containerEl } = this, s = this.plugin.settings;
		containerEl.empty();
		new Setting(containerEl).setName('File explorer').setHeading();
		for (const k of TOGGLES) new Setting(containerEl).setName(TEXT[k][0]).setDesc(TEXT[k][1])
			.addToggle((t) => t.setValue(s[k]).onChange(async (v) => { s[k] = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Property names').setHeading();
		for (const k of PROPS) new Setting(containerEl).setName(TEXT[k][0]).setDesc(TEXT[k][1])
			.addText((t) => t.setPlaceholder(DEFAULT_SETTINGS[k]).setValue(s[k]).onChange(async (v) => { s[k] = v.trim() || DEFAULT_SETTINGS[k]; await this.plugin.saveSettings(); }));
	}
}
