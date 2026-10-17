import { Menu, Notice, Setting, TextComponent, setIcon, type TFile } from 'obsidian';
import type BindersPlugin from '../main';
import type { Binder } from '../binders';
import { sameLabels, sameStatuses } from '../binder-lists';
import { renameValue } from '../filter/saved';
import { readProperties } from '../properties';
import { PALETTE, colorCss, display, freeName, hexColor, type LabelPreset } from './labels';
import { openBindersSettingsPage } from './internals';
import { confirm } from './modals';

/* The Labels and Statuses pages of Binder settings. Each starts with a choice: the vault's list (Binders' settings, the
   default) or this binder's own, kept in the binder note (`labels`, `statuses`: binder-lists.ts). Choosing the binder's
   own copies the vault's list as the start, so nothing changes until it is edited; choosing the vault's again asks first
   if the lists differ, and takes the property away. Notes are never changed by choosing. A change is kept as it is made,
   and is not a step of "Undo" (as a pin in the inspector is not); renaming a name in the binder's own list offers to
   rename it in this binder's notes, and that is one step. */

export type ListKind = 'label' | 'status';

/** What a page of Binder settings is given. */
export interface PageHost {
	plugin: BindersPlugin;
	binder: Binder;
	/** Where the page is drawn. */
	el: HTMLElement;
	/** Why nothing can be changed, or null. */
	locked: string | null;
	/** The page changed what the sidebar says of it. */
	refreshSide(): void;
}

const NOUN = { label: { one: 'label', many: 'labels', Many: 'Labels' }, status: { one: 'status', many: 'statuses', Many: 'Statuses' } } as const;

/** The vault's own list is edited in the plugin's settings. */
function editVault(plugin: BindersPlugin, kind: ListKind): void {
	openBindersSettingsPage(plugin.app, kind === 'label' ? 'labels' : 'statuses');
}

/** Moves one item of a list to another place. */
function move<T>(list: T[], from: number, to: number): void {
	if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
	const [x] = list.splice(from, 1);
	list.splice(to, 0, x);
}

/** The color a dot shows in right now, as "#rrggbb": what one of the theme's colors is, for the color picker. */
function shown(dot: HTMLElement): string {
	const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(dot.win.getComputedStyle(dot).backgroundColor);
	return m ? '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : '#808080';
}

const CUSTOM = 'custom';

/** The page: the choice, the list, "Add", and the way to the vault's list. */
export class ListsPage {
	private draft: LabelPreset[] | string[] | null = null;
	/** Writes run one after another, so the note ends as the page last had it. */
	private writing: Promise<void> = Promise.resolve();
	private pending = 0;

	constructor(private host: PageHost, private kind: ListKind) {}

	private get store() { return this.host.plugin.binders; }
	private get words() { return NOUN[this.kind]; }
	private get s() { return this.host.plugin.settings; }

	/** The binder's own list as its note says now, or null. */
	private own(): LabelPreset[] | string[] | null {
		if (this.assumed !== undefined) return this.assumed;
		return this.kind === 'label' ? this.store.ownLabels(this.host.binder) : this.store.ownStatuses(this.host.binder);
	}
	/** What the choice just made wrote, until the note is read again (the metadata cache follows a write a moment later). */
	private assumed: LabelPreset[] | string[] | null | undefined;
	private vault(): LabelPreset[] | string[] { return this.kind === 'label' ? this.s.labels : this.s.statuses; }
	private clone(list: LabelPreset[] | string[]): LabelPreset[] | string[] { return this.kind === 'label' ? (list as LabelPreset[]).map((l) => ({ ...l })) : [...(list as string[])]; }
	private same(a: LabelPreset[] | string[], b: LabelPreset[] | string[]): boolean { return this.kind === 'label' ? sameLabels(a as LabelPreset[], b as LabelPreset[]) : sameStatuses(a as string[], b as string[]); }

	/** Draws the page again from the note (not while a field in it is being typed in). */
	refresh(): void {
		this.assumed = undefined;
		const active = this.host.el.doc.activeElement;
		if (this.pending || (active && this.host.el.contains(active) && active.matches('input[type="text"]'))) return;
		const own = this.own();
		if (own ? this.draft && this.same(own, this.draft) : !this.draft) return;
		this.open();
	}

	/** Reads the list from the note and draws the page. */
	open(): void { this.load(); this.draw(); }
	private load(): void { const own = this.own(); this.draft = own ? this.clone(own) : null; }

	/** Draws the page from the draft. */
	private draw(focusLast = false): void {
		const { el, locked } = this.host, w = this.words, own = this.draft;
		el.empty();
		// which list: the vault's, or this binder's own
		new Setting(el).setName(`${w.Many} for this binder`).setDesc(own ? `This binder keeps its own ${w.many}, in its binder note.` : `The ${w.many} in Binders’ settings, which every binder without its own uses.`).addDropdown((d) => {
			d.addOption('vault', `The vault’s ${w.many}`).addOption('own', 'This binder’s own').setValue(own ? 'own' : 'vault').setDisabled(!!locked);
			d.selectEl.dataset.bindersKey = `${w.many}-source`;
			d.selectEl.setAttr('aria-label', `${w.Many} for this binder`);
			d.onChange((v) => void this.choose(v === 'own', d));
		});
		const list = el.createDiv({ cls: `binders-bset-list binders-bset-${w.many}`, attr: { role: 'list', 'aria-label': w.Many } });
		const mine = this.draft;
		if (!mine) this.readOnly(list, this.vault());
		else this.rows(list, mine, focusLast);
		if (mine && !locked) {
			new Setting(el).setClass('binders-bset-add').addButton((b) => {
				b.setButtonText(`Add ${w.one}`).onClick(() => this.add());
				b.buttonEl.dataset.bindersKey = `add-${this.kind}`;
			});
		}
		// the vault's list is edited where the vault's settings are
		const link = el.createDiv({ cls: 'binders-bset-vault' });
		const a = link.createEl('a', { cls: 'binders-bset-link', text: `Edit the vault’s ${w.many}`, attr: { href: '#', role: 'link', 'data-binders-key': `edit-vault-${w.many}` } });
		a.addEventListener('click', (e) => { e.preventDefault(); editVault(this.host.plugin, this.kind); });
	}

	/** The vault's list, shown as the binder is using it, with nothing to change. */
	private readOnly(list: HTMLElement, items: LabelPreset[] | string[]): void {
		if (!items.length) list.createDiv({ cls: 'binders-bset-empty', text: this.kind === 'label' ? 'No labels. A note’s label then shows in the color it names, if it names one.' : 'No statuses.' });
		for (const x of items) {
			const row = list.createDiv({ cls: 'binders-bset-row mod-vault', attr: { role: 'listitem' } });
			if (typeof x !== 'string') row.createSpan({ cls: 'binders-label-dot' }).setCssProps({ '--binders-label': colorCss(x.color) ?? '' });
			row.createSpan({ cls: 'binders-bset-row-name', text: typeof x === 'string' ? x : x.name });
		}
	}

	/** The binder's own list, one editable row each. */
	private rows(list: HTMLElement, items: LabelPreset[] | string[], focusLast: boolean): void {
		const locked = !!this.host.locked;
		if (!items.length) list.createDiv({ cls: 'binders-bset-empty', text: this.kind === 'label' ? 'No labels. A note’s label then shows in the color it names, if it names one.' : 'No statuses.' });
		let dragging = -1;
		const clear = () => list.querySelectorAll('.mod-drop-before, .mod-drop-after').forEach((x) => x.removeClasses(['mod-drop-before', 'mod-drop-after']));
		items.forEach((item, i) => {
			const row = new Setting(list).setClass('binders-bset-row').setClass(this.kind === 'label' ? 'binders-bset-label' : 'binders-bset-status');
			row.settingEl.setAttr('role', 'listitem');
			const name = typeof item === 'string' ? item : item.name;
			// a handle: a drag where there is a pointer, and its menu (Move up, Move down) by touch and the keys
			const grip = row.settingEl.createDiv({ cls: 'clickable-icon binders-bset-grip', attr: { role: 'button', tabindex: locked ? '-1' : '0', 'aria-label': `Move ${name}`, 'aria-haspopup': 'menu', 'data-binders-key': `grip-${i}` } });
			setIcon(grip, 'grip-vertical');
			row.settingEl.prepend(grip);
			if (!locked) {
				const menu = (e: MouseEvent | KeyboardEvent) => {
					const m = new Menu();
					m.addItem((x) => x.setTitle('Move up').setIcon('arrow-up').setDisabled(i === 0).onClick(() => this.moveTo(i, i - 1)));
					m.addItem((x) => x.setTitle('Move down').setIcon('arrow-down').setDisabled(i === items.length - 1).onClick(() => this.moveTo(i, i + 1)));
					if (e instanceof MouseEvent && e.clientX) m.showAtMouseEvent(e); else { const r = grip.getBoundingClientRect(); m.showAtPosition({ x: r.left, y: r.bottom }); }
				};
				grip.addEventListener('click', menu);
				grip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu(e); } });
				row.settingEl.draggable = true;
				row.settingEl.addEventListener('dragstart', (e) => {
					if (!(e.target instanceof HTMLElement) || e.target.closest('input, select')) { e.preventDefault(); return; }
					dragging = i;
					e.dataTransfer?.setData('text/plain', name);
					if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
					row.settingEl.addClass('is-being-dragged');
				});
				row.settingEl.addEventListener('dragend', () => { dragging = -1; row.settingEl.removeClass('is-being-dragged'); clear(); });
				row.settingEl.addEventListener('dragover', (e) => {
					if (dragging < 0) return;
					e.preventDefault();
					const r = row.settingEl.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
					clear();
					row.settingEl.addClass(after ? 'mod-drop-after' : 'mod-drop-before');
				});
				row.settingEl.addEventListener('drop', (e) => {
					if (dragging < 0) return;
					e.preventDefault();
					const r = row.settingEl.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2, from = dragging;
					let to = i + (after ? 1 : 0);
					if (from < to) to--;
					dragging = -1;
					clear();
					this.moveTo(from, to);
				});
			}
			row.nameEl.empty();
			if (typeof item === 'string') this.statusName(row, i);
			else this.labelName(row, i);
			if (!locked) row.addExtraButton((b) => {
				b.setIcon('x').setTooltip(`Remove ${name}`).onClick(() => {
					(this.draft as unknown[]).splice(i, 1);
					this.keep();
					this.draw();
				});
				b.extraSettingsEl.setAttr('aria-label', `Remove ${name}`);
				b.extraSettingsEl.dataset.bindersKey = `remove-${i}`;
			});
			if (focusLast && i === items.length - 1) window.setTimeout(() => { const f = row.nameEl.querySelector('input'); f?.focus(); f?.select(); }, 0);
		});
	}

	private moveTo(from: number, to: number): void {
		if (!this.draft) return;
		move(this.draft as unknown[], from, to);
		this.keep();
		this.draw();
	}

	private add(): void {
		const d = this.draft;
		if (!d) return;
		if (this.kind === 'label') {
			const list = d as LabelPreset[], used = new Set(list.map((l) => l.color));
			list.push({ name: freeName('New label', list.map((l) => l.name)), color: PALETTE.find((c) => !used.has(c)) ?? '#808080' });
		} else (d as string[]).push(freeName('New status', d as string[]));
		this.keep();
		this.draw(true);
	}

	/** A name typed in a row: taken when the field is left (or Enter is pressed), a refused one put back. */
	private nameField(t: TextComponent, get: () => string, set: (name: string) => string | null): void {
		const take = () => {
			const name = t.getValue().trim(), was = get();
			if (name === was) { t.setValue(was); return; }
			const why = name ? set(name) : 'A name can’t be empty.';
			if (why) { t.setValue(was); new Notice(why); }
		};
		t.inputEl.addEventListener('change', take);
		t.inputEl.addEventListener('blur', take);
		t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); t.inputEl.blur(); } });
	}

	private labelName(row: Setting, i: number): void {
		const list = this.draft as LabelPreset[], label = list[i], locked = !!this.host.locked;
		const dot = row.settingEl.createSpan({ cls: 'binders-label-dot binders-bset-dot' });
		row.nameEl.before(dot);
		const paint = () => dot.setCssProps({ '--binders-label': colorCss(label.color) ?? '' });
		paint();
		new TextComponent(row.nameEl).then((t) => {
			t.setPlaceholder('Name').setValue(label.name).setDisabled(locked);
			t.inputEl.setAttr('aria-label', 'Label name');
			t.inputEl.dataset.bindersKey = `name-${i}`;
			this.nameField(t, () => label.name, (name) => {
				if (list.some((l) => l !== label && l.name.toLowerCase() === name.toLowerCase())) return `There’s a label called “${name}” already.`;
				const old = label.name;
				label.name = name;
				this.keep(() => this.renamed(old, name));
				return null;
			});
		});
		let picker: { setValue(v: string): unknown } | null = null;
		row.addDropdown((d) => {
			for (const c of PALETTE) d.addOption(c, display(c));
			d.addOption(CUSTOM, 'Custom');
			d.setValue(hexColor(label.color) ? CUSTOM : label.color).setDisabled(locked);
			d.selectEl.setAttr('aria-label', `Color of ${label.name}`);
			d.selectEl.dataset.bindersKey = `color-${i}`;
			d.onChange((v) => {
				// "Custom" starts from the color it had, as the theme shows it now
				label.color = v === CUSTOM ? shown(dot) : v;
				paint();
				picker?.setValue(shown(dot));
				this.keep();
			});
			row.addColorPicker((c) => {
				picker = c;
				c.setValue(shown(dot)).setDisabled(locked);
				c.onChange((hex) => {
					if (hexColor(hex) === hexColor(shown(dot)) && !hexColor(label.color)) return; // set by the dropdown, not picked
					label.color = hexColor(hex) ?? label.color;
					d.setValue(CUSTOM);
					paint();
					this.keep();
				});
			});
		});
	}

	private statusName(row: Setting, i: number): void {
		const list = this.draft as string[], locked = !!this.host.locked;
		let mine = list[i];
		new TextComponent(row.nameEl).then((t) => {
			t.setPlaceholder('Name').setValue(mine).setDisabled(locked);
			t.inputEl.setAttr('aria-label', 'Status name');
			t.inputEl.dataset.bindersKey = `name-${i}`;
			this.nameField(t, () => mine, (name) => {
				const at = list.indexOf(mine);
				if (at < 0) return null;
				if (list.some((x, j) => j !== at && x.toLowerCase() === name.toLowerCase())) return `There’s a status called “${name}” already.`;
				const old = mine;
				list[at] = mine = name;
				this.keep(() => this.renamed(old, name));
				return null;
			});
		});
	}

	// ---- keeping ----

	/** The draft is written to the binder note, after any write before it; `then` runs once it is written. */
	private keep(then?: () => Promise<void>): void {
		const d = this.draft;
		if (!d) return;
		const copy = this.clone(d), { binder } = this.host;
		this.pending++;
		this.writing = this.writing.then(async () => {
			try {
				if (this.kind === 'label') await this.store.setOwnLabels(binder, copy as LabelPreset[]); else await this.store.setOwnStatuses(binder, copy as string[]);
				this.host.refreshSide();
			} catch (e) { new Notice(`The ${this.words.many} weren’t kept. ${e instanceof Error ? e.message : String(e)}`); }
			this.pending--;
			if (then) await then();
		});
	}

	/** Choosing the binder's own list copies the vault's; choosing the vault's again asks first if they differ. */
	private async choose(own: boolean, d: { setValue(v: string): unknown }): Promise<void> {
		const w = this.words, { binder } = this.host;
		try {
			if (own) {
				const start = this.clone(this.vault());
				this.assumed = start;
				if (this.kind === 'label') await this.store.setOwnLabels(binder, start as LabelPreset[]); else await this.store.setOwnStatuses(binder, start as string[]);
			} else {
				const mine = this.own();
				if (mine && !this.same(mine, this.vault())) {
					const ok = await confirm(this.host.plugin.app, {
						title: `Use the vault’s ${w.many}`,
						text: `This binder’s own ${w.many} are put away, and its notes show the ${w.many} in Binders’ settings again. Your notes aren’t changed: one whose ${w.one} isn’t in that list keeps it, and shows it as it’s written.`,
						cta: 'Use the vault’s', warning: true,
					});
					if (!ok) { d.setValue('own'); return; }
				}
				this.assumed = null;
				if (this.kind === 'label') await this.store.setOwnLabels(binder, null); else await this.store.setOwnStatuses(binder, null);
			}
			this.host.refreshSide();
			this.open();
		} catch (e) { this.assumed = undefined; new Notice(e instanceof Error ? e.message : String(e)); d.setValue(this.own() ? 'own' : 'vault'); }
	}

	// ---- renaming in this binder's notes ----

	/** A name in the binder's own list was renamed: this binder's notes have it by name, so the ones that had the old
	    name can take the new one, as one step of "Undo". Other binders, whatever lists they use, are left alone. */
	private async renamed(old: string, now: string): Promise<void> {
		const { plugin, binder } = this.host, { app } = plugin, s = this.s, prop = this.kind === 'label' ? s.labelProp : s.statusProp, w = this.words;
		const has = (v: unknown) => typeof v === 'string' && v.trim().toLowerCase() === old.toLowerCase();
		const notes = app.vault.getMarkdownFiles().filter((f) => plugin.binders.binderOf(f) === binder && !plugin.binders.inSnapshots(f.path) && has(app.metadataCache.getFileCache(f)?.frontmatter?.[prop]));
		// (the saved filters of this binder that name it)
		let filters: unknown;
		try { filters = renameValue((await readProperties(app, binder.note)).filters, { status: s.statusProp, label: s.labelProp }, this.kind, old, now); } catch { filters = undefined; }
		if (!notes.length) { if (filters) await this.store.setProps(binder.note, { filters }); return; }
		const ok = await confirm(app, {
			title: `Rename the ${w.one} in this binder’s notes`,
			text: `${notes.length === 1 ? 'One note in this binder has' : `${notes.length} notes in this binder have`} the ${w.one} “${old}”. Change it to “${now}” there too? Otherwise ${notes.length === 1 ? 'it keeps' : 'they keep'} “${old}”, which is no longer in this list. Notes in other binders aren’t changed.`,
			cta: notes.length === 1 ? 'Change it' : 'Change them',
		});
		if (!ok) { if (filters) await this.store.setProps(binder.note, { filters }); return; }
		const patches = new Map<TFile, Record<string, unknown>>(notes.map((f) => [f, { [prop]: now }]));
		if (filters) patches.set(binder.note, { ...(patches.get(binder.note) ?? {}), filters });
		try {
			await this.store.setByHand(`Rename the ${w.one} “${old}” to “${now}”`, [...patches].map(([note, patch]) => ({ note, patch })), { [prop]: `the ${w.one}`, filters: 'the saved filters' });
		} catch (e) { new Notice(`The notes weren’t changed. ${e instanceof Error ? e.message : String(e)}`); }
	}
}
