import { Notice, Platform, PluginSettingTab, Setting, TextComponent, type App, type SettingDefinition, type SettingDefinitionItem } from 'obsidian';
import type BindersPlugin from './main';
import { DEFAULT_SETTINGS, FOCUS_TEXT, FOCUS_TOGGLES, focusToggles, PARAGRAPH_TEXT, PARAGRAPH_TOGGLES, PROPS, SIDE_TEXT, TEXT, TOGGLES, WORDS_TEXT, type BindersSettings, type FocusToggle, type ParagraphToggle, type Prop, type Toggle } from './settings-data';
import { parseGoal } from './focus/session';
import { COMPILE_PROP, EXPORT_PROP } from './scenes';
import { DEFAULT_LABELS, DEFAULT_STATUSES, PALETTE, colorCss, display, freeName, hexColor } from './view/labels';
import { confirm } from './view/modals';
import { KINDS, forgetPlaces, places } from './export/export';

/* The settings tab, declarative: Obsidian draws it from `getSettingDefinitions`, and can search it.
   What the settings are, and how saved ones are read back, is settings-data.ts. Renaming a label or a status asks
   whether to rename it in the notes that have it: notes are never rewritten unasked. */

export { DEFAULT_SETTINGS, readSettings, type BindersSettings } from './settings-data';

/** The color dropdown's value for a color of the writer's own (a hex color, not one of the theme's). */
const CUSTOM = 'custom';
/** Property names Binders keeps for itself: a note's synopsis, status, label or target can't be kept under one. */
const RESERVED = ['binder', 'contents', 'longform', EXPORT_PROP, COMPILE_PROP, 'export-as'];

/** Binders' tab in Obsidian's settings: the file explorer's switches, labels, statuses, focus mode, property names. */
export class BindersSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: BindersPlugin) { super(app, plugin); }

	private get s(): BindersSettings { return this.plugin.settings; }
	private save(): Promise<void> { return this.plugin.saveSettings(); }

	/** After a label or status is added, removed or moved: the rows are drawn again. */
	private async changed(): Promise<void> {
		await this.save();
		// (Obsidian reads the definitions again and draws them)
		this.update();
	}

	/** Obsidian draws the tab from these, and can search them. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		// (the settings are read when a button is pressed, not now: Obsidian keeps a list's buttons from the first time
		// it draws them, which is before the plugin has loaded its settings)
		const s = this.s;
		return [
			// (hiding notes is done by the same patch that orders the explorer: without the one, the other can't be on)
			{ type: 'group', heading: 'File explorer', items: TOGGLES.map((k): SettingDefinition => ({ name: TEXT[k][0], desc: TEXT[k][1], control: { type: 'toggle', key: k }, ...(k === 'hideBinderNotes' ? { disabled: () => !this.s.orderExplorer } : {}) })) },
			{ type: 'group', heading: 'Paragraphs', items: PARAGRAPH_TOGGLES.map((k): SettingDefinition => ({ name: PARAGRAPH_TEXT[k][0], desc: PARAGRAPH_TEXT[k][1], control: { type: 'toggle', key: k } })) },
			{ type: 'group', heading: 'Sidebar', items: [{ name: SIDE_TEXT[0], desc: SIDE_TEXT[1], control: { type: 'toggle', key: 'sidePanes' } }] },
			{ type: 'group', heading: 'Word counts', items: [{ name: WORDS_TEXT[0], desc: WORDS_TEXT[1], control: { type: 'toggle', key: 'bookWords' } }] },
			{
				type: 'list', heading: 'Labels', cls: 'binders-settings-labels',
				emptyState: 'No labels. A note’s label then shows in the color it names, if it names one.',
				items: s.labels.map((l, i): SettingDefinition => ({ name: l.name, render: (setting) => { this.labelRow(setting, i); } })),
				onReorder: (from, to) => { move(this.s.labels, from, to); void this.changed(); },
				onDelete: (i) => { this.s.labels.splice(i, 1); void this.changed(); },
				addItem: { name: 'Add label', action: () => this.addLabel() },
				extraButtons: [(b) => b.setIcon('rotate-ccw').setTooltip('Restore the default labels').onClick(() => void this.restore('labels'))],
			},
			{
				type: 'list', heading: 'Statuses', cls: 'binders-settings-statuses',
				emptyState: 'No statuses. The ones your notes already use are still offered.',
				items: s.statuses.map((name, i): SettingDefinition => ({ name, render: (setting) => { this.statusRow(setting, i); } })),
				onReorder: (from, to) => { move(this.s.statuses, from, to); void this.changed(); },
				onDelete: (i) => { this.s.statuses.splice(i, 1); void this.changed(); },
				addItem: { name: 'Add status', action: () => this.addStatus() },
				extraButtons: [(b) => b.setIcon('rotate-ccw').setTooltip('Restore the default statuses').onClick(() => void this.restore('statuses'))],
			},
			// focus mode: what shows besides the text, each to turn on or off (typewriter scrolling and dimming are on to begin with)
			{ type: 'group', heading: 'Focus mode', items: [...focusToggles(Platform.isMobile).map((k): SettingDefinition => ({ name: FOCUS_TEXT[k][0], desc: FOCUS_TEXT[k][1], control: { type: 'toggle', key: k } })), { name: FOCUS_TEXT.focusGoal[0], desc: FOCUS_TEXT.focusGoal[1], render: (setting) => { this.goalRow(setting); } }] },
			{ type: 'group', heading: 'Export', items: [
				{ name: 'Exports folder', desc: 'Where exported files go on a phone or tablet, and where the save dialog starts on a computer. A name is a folder beside each binder; a path, such as Books/Exports, is one folder for the whole vault.', render: (setting) => { this.textRow(setting, 'exportsFolder', 'Exports'); } },
				{ name: 'Remembered places', desc: '', render: (setting) => { this.placesRow(setting); } },
				{ name: 'Your name', desc: 'The author of a book that doesn’t say otherwise.', render: (setting) => { this.textRow(setting, 'authorName', ''); } },
				{ name: 'Contact details', desc: 'For the title page of a manuscript: an address, an email, a phone number, a line each.', render: (setting) => { this.contactRow(setting); } },
			] },
			{ type: 'group', heading: 'Property names', items: PROPS.map((k): SettingDefinition => ({ name: TEXT[k][0], desc: TEXT[k][1], render: (setting) => { this.propRow(setting, k); } })) },
		];
	}

	/** Obsidian calls this when a toggle defined above is switched. */
	async setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.s;
		if ((TOGGLES as string[]).includes(key) && typeof value === 'boolean') s[key as Toggle] = value;
		if ((FOCUS_TOGGLES as string[]).includes(key) && typeof value === 'boolean') s[key as FocusToggle] = value;
		if ((PARAGRAPH_TOGGLES as string[]).includes(key) && typeof value === 'boolean') s[key as ParagraphToggle] = value;
		if (key === 'sidePanes' && typeof value === 'boolean') s.sidePanes = value;
		// (what depends on it is drawn again: hiding notes can't be on without ordering)
		if (key === 'orderExplorer') await this.changed(); else await this.save();
	}

	/** The defaults back, after asking if that would take away labels or statuses of the writer's own. */
	private async restore(kind: 'labels' | 'statuses'): Promise<void> {
		const s = this.s, same = kind === 'labels' ? JSON.stringify(s.labels) === JSON.stringify(DEFAULT_LABELS) : JSON.stringify(s.statuses) === JSON.stringify(DEFAULT_STATUSES);
		if (same) return;
		const ok = await confirm(this.app, {
			title: `Restore the default ${kind}`,
			text: `The ${kind} here are replaced by the ones Binders starts with. Your notes aren’t changed: one whose ${kind === 'labels' ? 'label' : 'status'} is no longer in the list keeps it, and shows it as it’s written.`,
			cta: 'Restore', warning: true,
		});
		if (!ok) return;
		if (kind === 'labels') s.labels = DEFAULT_LABELS.map((l) => ({ ...l })); else s.statuses = [...DEFAULT_STATUSES];
		await this.changed();
	}

	/** A label or a status was renamed: notes have it by name, so the ones that had the old name can take the new one. */
	private async renamed(kind: 'label' | 'status', old: string, now: string): Promise<void> {
		const { app, plugin } = this, prop = kind === 'label' ? this.s.labelProp : this.s.statusProp;
		const has = (v: unknown) => typeof v === 'string' && v.trim().toLowerCase() === old.toLowerCase();
		const notes = app.vault.getMarkdownFiles().filter((f) => plugin.binders.binderOf(f) && has(app.metadataCache.getFileCache(f)?.frontmatter?.[prop]));
		if (!notes.length) return;
		const ok = await confirm(app, {
			title: `Rename the ${kind} in your notes`,
			text: `${notes.length === 1 ? 'One note has' : `${notes.length} notes have`} the ${kind} “${old}”. Change it to “${now}” there too? Otherwise ${notes.length === 1 ? 'it keeps' : 'they keep'} “${old}”, which is no longer in this list.`,
			cta: notes.length === 1 ? 'Change it' : 'Change them',
		});
		if (!ok) return;
		let failed = 0;
		for (const f of notes) { try { await plugin.binders.setProps(f, { [prop]: now }); } catch { failed++; } }
		if (failed) new Notice(`${failed} ${failed === 1 ? 'note' : 'notes'} couldn’t be changed.`);
	}

	/** A name typed into a list's row: taken when the field is left (or Enter), put back by Escape. */
	private nameField(t: TextComponent, get: () => string, set: (name: string) => string | null): void {
		this.field(t.inputEl, () => t.getValue() !== get(), () => { t.setValue(get()); }, () => {
			const name = t.getValue().trim(), was = get();
			if (name === was) return;
			const why = name ? set(name) : 'A name can’t be empty.';
			if (why) { t.setValue(was); new Notice(why); }
		});
	}

	/** A field whose text is taken when it's left: `commit` on blur or Enter, `revert` on Escape (which then does
	    nothing else: it doesn't close the settings). Escape is heard on the window, where Obsidian takes its own keys
	    before they'd reach the field; and since Obsidian's Escape may leave the field first, what's typed is only taken
	    a moment after the field is left, once it's known that Escape wasn't why. */
	private field(input: HTMLInputElement, changed: () => boolean, revert: () => void, commit: () => void): void {
		let on: Window | null = null, leaving = 0;
		const stop = () => { on?.removeEventListener('keydown', onKey, true); on = null; };
		const onKey = (e: KeyboardEvent) => {
			if (!input.isConnected) { stop(); return; }
			if (e.key !== 'Escape' || !(leaving || input.doc.activeElement === input) || !changed()) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			if (leaving) { on?.clearTimeout(leaving); leaving = 0; stop(); }
			revert();
		};
		// (listening from the first thing typed as well as from the focus: a window that isn't the active one gives
		// its fields no focus event)
		const start = () => { if (!on) { on = input.win; on.addEventListener('keydown', onKey, true); } };
		input.addEventListener('focus', start);
		input.addEventListener('input', start);
		input.addEventListener('blur', () => {
			const win = on ?? input.win;
			if (leaving) win.clearTimeout(leaving);
			leaving = win.setTimeout(() => { leaving = 0; stop(); if (input.isConnected) commit(); }, 0);
		});
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
	}

	/** Focus mode's goal for a day's words: a whole number, taken when the field is left; empty for none. */
	private goalRow(setting: Setting): void {
		setting.settingEl.addClass('binders-settings-goal');
		setting.addText((t) => {
			const shown = () => (this.s.focusGoal ? String(this.s.focusGoal) : '');
			t.setPlaceholder('None').setValue(shown());
			t.inputEl.inputMode = 'numeric';
			this.field(t.inputEl, () => t.getValue() !== shown(), () => { t.setValue(shown()); }, () => {
				const n = parseGoal(t.getValue());
				if (n == null) { new Notice('A goal is a whole number of words.'); t.setValue(shown()); return; }
				if (n === this.s.focusGoal) { t.setValue(shown()); return; }
				this.s.focusGoal = n;
				t.setValue(shown());
				void this.save();
			});
		});
	}

	/** One of export's lines of text: taken when the field is left. An empty Exports folder is the default again. */
	private textRow(setting: Setting, k: 'exportsFolder' | 'authorName', fallback: string): void {
		setting.settingEl.addClass(`binders-settings-${k === 'exportsFolder' ? 'exports' : 'author'}`);
		setting.addText((t) => {
			t.setPlaceholder(fallback).setValue(this.s[k]);
			this.field(t.inputEl, () => t.getValue() !== this.s[k], () => { t.setValue(this.s[k]); }, () => {
				const v = t.getValue().trim().replace(/^\/+|\/+$/g, '') || fallback;
				if (k === 'exportsFolder' && v.split('/').some((n) => !n.trim() || n.startsWith('.') || /[*"\\<>:|?]/.test(n))) { new Notice('That folder can’t be used. A name can’t start with a dot, or have a character a file name can’t have.'); t.setValue(this.s[k]); return; }
				t.setValue(v);
				if (v === this.s[k]) return;
				this.s[k] = v;
				void this.save();
			});
		});
	}

	/** The lines under the name on a manuscript's title page. */
	private contactRow(setting: Setting): void {
		setting.settingEl.addClass('binders-settings-contact');
		setting.addTextArea((t) => {
			t.setValue(this.s.contact);
			t.inputEl.rows = 3;
			t.inputEl.addEventListener('blur', () => { const v = t.getValue().replace(/\s+$/, ''); if (v !== this.s.contact) { this.s.contact = v; void this.save(); } });
		});
	}

	/** The places this device saves exports to without asking, and the way to be asked again. */
	private placesRow(setting: Setting): void {
		setting.settingEl.addClass('binders-settings-places');
		const list = places(this.plugin), name = (p: string) => p.split('/').pop() ?? p;
		setting.setDesc(list.length ? `${list.length === 1 ? 'One export saves' : `${list.length} exports save`} without asking on this device: ${list.map((p) => `${name(p.folder)} (${KINDS.find((k) => k.id === p.kind)?.name ?? p.kind}) to ${p.path}`).join('; ')}.` : 'Every export asks where to save. After one is saved, its window offers to save there next time without asking.');
		setting.addButton((b) => b.setButtonText('Ask again').setDisabled(!list.length).onClick(() => { forgetPlaces(this.plugin); this.update(); }));
	}

	/** The property a note's synopsis, status, label or target is kept in: a name of its own, taken when the field is left. */
	private propRow(setting: Setting, k: Prop): void {
		setting.addText((t) => {
			t.setPlaceholder(DEFAULT_SETTINGS[k]).setValue(this.s[k]);
			// (a property's name is taken as typed: a phone's keyboard mustn't capitalize or "correct" it)
			t.inputEl.setAttrs({ autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
			this.field(t.inputEl, () => t.getValue() !== this.s[k], () => { t.setValue(this.s[k]); }, () => {
				const name = t.getValue().trim() || DEFAULT_SETTINGS[k];
				if (name === this.s[k]) { t.setValue(name); return; }
				const clash = PROPS.find((o) => o !== k && this.s[o].toLowerCase() === name.toLowerCase());
				const why = clash ? `“${name}” is the property for the ${TEXT[clash][0].toLowerCase()}. Each needs a name of its own.` : RESERVED.includes(name.toLowerCase()) ? `Binders keeps “${name}” for itself. Choose another name.` : null;
				if (why) { new Notice(why); t.setValue(this.s[k]); return; }
				this.s[k] = name;
				t.setValue(name);
				void this.save();
			});
		});
	}

	private addLabel(): void {
		const s = this.s, used = new Set(s.labels.map((l) => l.color));
		s.labels.push({ name: freeName('New label', s.labels.map((l) => l.name)), color: PALETTE.find((c) => !used.has(c)) ?? '#808080' });
		void this.changed().then(() => this.focusLast('.binders-settings-labels'));
	}

	private addStatus(): void {
		const s = this.s;
		s.statuses.push(freeName('New status', s.statuses));
		void this.changed().then(() => this.focusLast('.binders-settings-statuses'));
	}

	/** A row just added: its name is ready to type over. */
	private focusLast(group: string): void {
		const inputs = this.containerEl.querySelectorAll<HTMLInputElement>(`${group} input[type="text"]`);
		const last = inputs[inputs.length - 1];
		last?.focus();
		last?.select();
	}

	/** A label: its name, one of Obsidian's colors (the theme's own shade of it) or a color of your own. A note has the
	    label when its label property is this name, so renaming one here asks whether those notes take the new name. */
	private labelRow(setting: Setting, i: number): void {
		const label = this.s.labels[i];
		if (!label) return;
		setting.settingEl.addClass('binders-settings-label');
		// (unseen: it's asked what color one of the theme's colors is just now, for the color picker)
		// (one per row: Obsidian draws a row again in the same element)
		const dot = setting.settingEl.querySelector<HTMLElement>(':scope > .binders-settings-probe') ?? setting.settingEl.createSpan({ cls: 'binders-label-dot binders-settings-probe' });
		const paint = () => dot.setCssProps({ '--binders-label': colorCss(label.color) ?? '' });
		// (the color well says whose color it is: the row's own name is a text field, so nothing else names it)
		const nameWell = () => setting.controlEl.querySelector('input[type="color"]')?.setAttr('aria-label', `Custom color for ${label.name}`);
		setting.nameEl.empty();
		paint();
		// the name where a setting's name is, so the names line up whatever the colors are called
		new TextComponent(setting.nameEl).then((t) => {
			t.setPlaceholder('Name').setValue(label.name);
			t.inputEl.setAttr('aria-label', 'Label name');
			// saved when the field is left, so a half-typed name never clashes with another
			this.nameField(t, () => label.name, (name) => {
				if (this.s.labels.some((l) => l !== label && l.name.toLowerCase() === name.toLowerCase())) return `There’s a label called “${name}” already.`;
				const old = label.name;
				label.name = name;
				nameWell();
				void this.save().then(() => this.renamed('label', old, name));
				return null;
			});
		});
		let picker: { setValue(v: string): unknown } | null = null;
		setting.addDropdown((d) => {
			for (const c of PALETTE) d.addOption(c, display(c));
			d.addOption(CUSTOM, 'Custom');
			d.setValue(hexColor(label.color) ? CUSTOM : label.color);
			d.selectEl.setAttr('aria-label', 'Color');
			d.onChange((v) => {
				// "Custom" starts from the color it had, as the theme shows it now
				label.color = v === CUSTOM ? shown(dot) : v;
				picker?.setValue(shown(dotWith(dot, label.color)));
				paint();
				void this.save();
			});
			setting.addColorPicker((c) => {
				picker = c;
				c.setValue(shown(dot));
				c.onChange((hex) => {
					if (hexColor(hex) === hexColor(shown(dot)) && !hexColor(label.color)) return; // set by the dropdown, not picked
					label.color = hexColor(hex) ?? label.color;
					d.setValue(CUSTOM);
					paint();
					void this.save();
				});
			});
			nameWell();
		});
	}

	/** A status: its name, renamed as a label is. */
	private statusRow(setting: Setting, i: number): void {
		const status = this.s.statuses[i];
		if (status == null) return;
		setting.settingEl.addClass('binders-settings-status');
		setting.nameEl.empty();
		new TextComponent(setting.nameEl).then((t) => {
			t.setPlaceholder('Name').setValue(status);
			t.inputEl.setAttr('aria-label', 'Status name');
			// (by what it's called, not where it is: the rows may have been reordered since this one was drawn)
			let mine = status;
			this.nameField(t, () => mine, (name) => {
				const at = this.s.statuses.indexOf(mine);
				if (at < 0) return null;
				if (this.s.statuses.some((x, j) => j !== at && x.toLowerCase() === name.toLowerCase())) return `There’s a status called “${name}” already.`;
				const old = mine;
				this.s.statuses[at] = mine = name;
				void this.save().then(() => this.renamed('status', old, name));
				return null;
			});
		});
	}
}

function move<T>(list: T[], from: number, to: number): void {
	if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
	const [x] = list.splice(from, 1);
	list.splice(to, 0, x);
}

/** The color a dot shows in right now, as "#rrggbb": what one of the theme's colors is, for the color picker. */
function shown(dot: HTMLElement): string {
	const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(dot.win.getComputedStyle(dot).backgroundColor);
	return m ? '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : '#808080';
}

function dotWith(dot: HTMLElement, color: string): HTMLElement {
	dot.setCssProps({ '--binders-label': colorCss(color) ?? '' });
	return dot;
}
