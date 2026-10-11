import { ButtonComponent, Component, MarkdownRenderer, Menu, Modal, Notice, Platform, Setting, TFile, TFolder, setIcon } from 'obsidian';
import type BindersPlugin from '../main';
import { exportsFolder } from '../export/export';
import { safeName, type ImportPlan, type PlannedNote, type Said } from '../import/plan';
import { writeImport } from '../import/vault';
import { tabsForRender } from '../paragraphs/text';
import { forRender } from '../scene-text';
import { historyLook } from './internals';
import { display } from './labels';
import { wordsIn } from './words';

/* The second dialog of every import: the binder the source will be. The Export window's own bones (Obsidian's
   two-pane dialog, view/export.ts): on the left the binder's name, where it goes, the job's own choices, and what
   import has to say; on the right the binder as it will be, a note of it as it will read, and Import. A phone has
   the choices first.
   What differs between imports is an `ImportJob`: Scrivener's (view/import-scrivener.ts) and a manuscript's
   (view/import-manuscript.ts). Nothing is written until Import, and nothing but new files in a new folder then
   (import/vault.ts). The source is only ever read. */

export const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
/** How much of one note is drawn in the preview: past this a renderer holds the window up. The note has it all. */
const NOTE_SHOWN = 120000;
/** How many things to look at the sidebar lists: the binder note lists every one. */
const SAID_SHOWN = 40;
/** How many paragraphs of one note get their own "Start a note here": past this the rest is drawn as one text. */
const PARAS_SHOWN = 300;
export const message = (e: unknown): string => (e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong, and nothing more is known of it.');

/** What the window gives a job to draw its own rows with. */
export interface Rows {
	el: HTMLElement;
	/** True while an import runs: the rows are held. */
	busy: boolean;
	/** A choice changed: plan again, and draw it all again. */
	replan(): void;
	/** A switch, named `key` for the keyboard's place. */
	toggle(key: string, name: string, on: boolean, set: (v: boolean) => void): void;
}

/** What one kind of import is to the window. */
export interface ImportJob {
	/** The source's name: the dialog's title, and the binder's name until the writer changes it. */
	name: string;
	/** The binder as it will be for the choices now (the job's own, and the name and the folder). Throws what can't be planned. */
	plan(o: { name: string; parent: string; settings: BindersPlugin['settings'] }): ImportPlan;
	/** The job's own rows in the choices, under "Create in". */
	rows?(rows: Rows): void;
	/** A line under where the binder goes: what is left out, and that the source isn't changed. */
	needs(plan: ImportPlan): string;
	/** Whether the source is as it was read; asked again before anything is written. */
	unchanged(): Promise<boolean>;
	checking: string;
	changed: string;
	/** Back to the first dialog: the button's name, the phone's row, and what it opens. */
	another: { label: string; row: string; open(): void };
	/** Under the note as it will read. */
	caption: string;
	/** In place of a note, when the plan has none. */
	empty: string;
	/** What the writer can do to a row of the tree by hand (its menu). Each is run, then the plan is made again. */
	rowActions?(note: PlannedNote): { title: string; icon: string; run(): Promise<void> }[];
	/** A note's text as the paragraphs it is cut from, so one can be made the start of a note; null for a note that isn't. `unit` is
	    the paragraph's number to hand to `startHere`, -1 for a line the plan made. */
	paragraphs?(note: PlannedNote): { unit: number; text: string }[] | null;
	startHere?(unit: number, note: PlannedNote): void;
}

/** The second dialog: the binder the source will be. */
export class ImportWindow extends Modal {
	private name: string;
	/** The folder the binder is made in: a path, "" for the vault's own. */
	private parent = '';
	private plan: ImportPlan | null = null;
	/** True when the name was typed in since the plan was made: the plan is made again before it is used. */
	private stale = false;
	/** Why the source can't be planned at all (the settings' property names clash), or null. */
	private failed: string | null = null;
	/** What import is doing just now, in words; null when it is doing nothing. */
	private busy: string | null = null;
	private cancelled = false;
	/** The note shown, by its path in the plan. */
	private shown = '';
	private side!: HTMLElement;
	private pane!: HTMLElement;
	private nameEl!: HTMLElement;
	private detailEl!: HTMLElement;
	private actions!: HTMLElement;
	private previewEl!: HTMLElement;
	private stage: HTMLElement | null = null;
	private whyEl: HTMLElement | null = null;
	private placeEl: HTMLElement | null = null;
	private back: HTMLElement | null = null;
	private rendered = new Component();
	private drawn: Component | null = null;
	private turn = 0;

	constructor(private plugin: BindersPlugin, private job: ImportJob) {
		super(plugin.app);
		this.name = job.name;
		this.freeName();
	}

	onOpen(): void {
		const { modalEl, contentEl } = this;
		this.setTitle(`Import “${this.job.name}”`);
		modalEl.addClass('binders-snapshots', 'binders-export', 'binders-import', 'mod-sidebar-layout');
		this.side = contentEl.createDiv({ cls: 'modal-sidebar mod-history binders-export-side' });
		this.pane = createDiv({ cls: 'sync-history-content-container binders-snapshots-pane binders-export-pane' });
		const content = this.pane.createDiv({ cls: 'sync-history-content' });
		const bar = content.createDiv({ cls: 'modal-setting-titlebar binders-snapshots-bar' });
		const title = bar.createDiv({ cls: 'modal-setting-title binders-snapshots-title' });
		this.nameEl = title.createSpan({ cls: 'binders-snapshots-name' });
		this.detailEl = title.createSpan({ cls: 'binders-snapshots-detail' });
		this.actions = bar.createDiv({ cls: 'modal-setting-titlebar-actions' });
		this.previewEl = content.createDiv({ cls: 'binders-export-preview' });
		if (!Platform.isPhone) contentEl.appendChild(this.pane);
		else {
			this.back = createDiv({ cls: 'clickable-icon modal-setting-back-button mod-raised', attr: { 'aria-label': 'Back', role: 'button' } });
			setIcon(this.back, 'arrow-left');
			// (from a note's text to the binder's list, and from the list to the choices)
			this.back.addEventListener('click', () => { if (this.previewEl.hasClass('is-reading')) this.previewEl.removeClass('is-reading'); else this.toChoices(); });
		}
		// Obsidian's own look for such a dialog, or (where it has none) ours
		modalEl.toggleClass('is-plain', !historyLook(contentEl));
		this.rendered.load();
		this.replan();
		// (a phone is touched, not tabbed through: nothing is ringed as it opens)
		if (!Platform.isPhone) window.setTimeout(() => this.previewEl.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus(), 0);
	}

	onClose(): void {
		this.cancelled = true;
		this.turn++;
		this.rendered.unload();
		this.contentEl.empty();
	}

	private toPane(): void { this.side.detach(); this.previewEl.removeClass('is-reading'); this.contentEl.appendChild(this.pane); if (this.back) this.modalEl.appendChild(this.back); }
	private toChoices(): void { this.pane.detach(); this.back?.detach(); this.contentEl.appendChild(this.side); }

	// ---- where it goes ----

	/** The binder's folder, as it will be. */
	private at(): string { const name = safeName(this.name); return this.parent ? `${this.parent}/${name}` : name; }

	/** Whether a binder can be made in a folder: not in a binder (its notes, its snapshots, one in a newer format),
	    and not where exports are kept. */
	private eligible(folder: TFolder): boolean {
		if (folder.isRoot()) return true;
		const { binders } = this.plugin;
		if (binders.binderOf(folder.path)) return false;
		return !binders.all().some((b) => { const kept = exportsFolder(this.plugin, b.folder); return folder.path === kept || folder.path.startsWith(`${kept}/`); });
	}

	/** The source's name, or the first "name 2", "name 3" that nothing in the folder has. */
	private freeName(): void {
		const base = safeName(this.job.name), free = (name: string) => !this.app.vault.getAbstractFileByPath(this.parent ? `${this.parent}/${name}` : name);
		if (free(safeName(this.name))) return;
		let name = base;
		for (let i = 2; !free(name); i++) name = `${base} ${i}`;
		this.name = name;
	}

	/** Why the binder can't be made as it is chosen, or null. Asked as the name is typed, and again at Import. */
	private refused(): string | null {
		if (this.failed) return this.failed;
		if (!this.name.trim()) return 'The binder needs a name.';
		const parent = this.app.vault.getAbstractFileByPath(this.parent || '/');
		if (!(parent instanceof TFolder)) return 'That folder isn’t there any more. Choose another.';
		if (!this.eligible(parent)) return 'A binder can’t be made inside another binder, or where exports are kept. Choose another folder.';
		if (this.app.vault.getAbstractFileByPath(this.at())) return `“${this.at()}” is already there. Choose another name.`;
		return null;
	}

	// ---- the plan ----

	/** The source planned again, for the choices as they are now, and everything drawn from it. */
	private replan(): void {
		this.stale = false;
		try {
			this.plan = this.job.plan({ name: this.name, parent: this.parent, settings: this.plugin.settings });
			this.failed = null;
		} catch (e) { this.plan = null; this.failed = message(e); }
		this.choices();
		this.bar();
		this.preview();
	}

	/** What follows the name as it is typed, without the plan being made again for every letter. */
	private typed(): void {
		this.stale = true;
		this.whyEl?.setText(this.refused() ?? '');
		this.placeEl?.setText(`Goes to ${this.at()}, in this vault`);
		this.bar();
	}

	// ---- the choices ----

	private choices(): void {
		const active = this.modalEl.doc.activeElement, held = active?.instanceOf(HTMLElement) && this.side.contains(active) ? active.dataset.bindersKey ?? active.closest<HTMLElement>('[data-binders-key]')?.dataset.bindersKey : undefined;
		const { job } = this, busy = !!this.busy;
		this.side.empty();
		const inner = this.side.createDiv({ cls: 'modal-sidebar-inner' });
		if (!Platform.isPhone) {
			const head = inner.createDiv({ cls: 'binders-snapshots-head binders-export-head' });
			head.createDiv({ cls: 'binders-snapshots-of', text: job.name });
			const b = head.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': job.another.label, role: 'button', tabindex: '0', 'data-binders-key': 'another' } });
			setIcon(b, 'lucide-folder-search');
			b.addEventListener('click', () => this.another());
			b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.another(); } });
		}
		const el = inner.createDiv({ cls: 'binders-export-options binders-import-options' });
		new Setting(el).setName('Name').addText((t) => {
			t.setValue(this.name).setDisabled(busy).onChange((v) => { this.name = v; this.typed(); });
			t.inputEl.dataset.bindersKey = 'name';
			t.inputEl.setAttrs({ enterkeyhint: 'done', 'aria-label': 'The new binder’s name' });
			// (the plan follows once the name is whole: left, or Enter)
			t.inputEl.addEventListener('change', () => { if (this.stale && !this.busy) this.replan(); });
			t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); t.inputEl.blur(); } });
		});
		// why the binder can't be made as it is named (or, after an import that stopped, why it did): under the name
		this.whyEl = el.createDiv({ cls: 'binders-ask-error binders-import-why', text: this.refused() ?? '', attr: { role: 'status', 'aria-live': 'polite' } });
		new Setting(el).setName('Create in').addDropdown((d) => {
			d.addOption('', 'Vault folder');
			const folders = this.app.vault.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder && !f.isRoot() && this.eligible(f)).sort((a, b) => a.path.localeCompare(b.path));
			for (const f of folders) d.addOption(f.path, f.path);
			d.setValue(this.parent).setDisabled(busy).onChange((v) => { this.parent = v; this.freeName(); this.replan(); });
			d.selectEl.dataset.bindersKey = 'parent';
		});
		job.rows?.({ el, busy, replan: () => this.replan(), toggle: (key, name, on, set) => { new Setting(el).setName(name).addToggle((t) => {
			t.setValue(on).setDisabled(busy).onChange((v) => { set(v); this.replan(); });
			t.toggleEl.dataset.bindersKey = key;
		}); } });
		if (Platform.isPhone) new Setting(el).setName(job.another.row).addButton((b) => { b.setButtonText('Choose another...').setDisabled(busy).onClick(() => this.another()); b.buttonEl.dataset.bindersKey = 'another'; });
		this.foot(inner);
		if (held) this.side.querySelector<HTMLElement>(`[data-binders-key="${held}"]`)?.focus();
	}

	/** Back to the first dialog, for another source. */
	private another(): void {
		if (this.busy) return;
		this.close();
		this.job.another.open();
	}

	/** The foot of the choices: where the binder goes, what is left out, and what import has to say. */
	private foot(inner: HTMLElement): void {
		const foot = inner.createDiv({ cls: 'binders-export-foot' }), plan = this.plan;
		const place = foot.createDiv({ cls: 'binders-export-place' });
		setIcon(place.createSpan({ cls: 'binders-export-place-icon' }), 'folder-open');
		this.placeEl = place.createSpan({ text: `Goes to ${this.at()}, in this vault` });
		if (plan) {
			foot.createDiv({ cls: 'binders-export-needs', text: this.job.needs(plan) });
		}
		// (a phone's buttons come before what import has to say, which can be long: they are never a scroll away)
		if (Platform.isPhone) {
			const row = foot.createDiv({ cls: 'binders-export-phone-row' });
			new ButtonComponent(row).setButtonText('Preview').setDisabled(!plan).onClick(() => this.toPane());
			if (this.busy) new ButtonComponent(row).setButtonText('Cancel').onClick(() => { this.cancelled = true; });
			else new ButtonComponent(row).setButtonText('Import').setCta().setDisabled(!!this.refused()).onClick(() => void this.run());
		}
		if (plan) this.things(foot, plan.said);
	}

	/** What import has to say, as the Export window lists what it has to: the note, and in a line what about it. One
	    thing said of many notes is one row; a row shows its note (the first of them). */
	private things(foot: HTMLElement, said: Said[]): void {
		const groups = new Map<string, Said[]>();
		for (const s of said) groups.set(s.text, [...(groups.get(s.text) ?? []), s]);
		if (!groups.size) return;
		const head = foot.createDiv({ cls: 'binders-export-warn-head' });
		setIcon(head.createSpan({ cls: 'binders-export-warn-icon' }), 'alert-triangle');
		head.createSpan({ text: `${groups.size} ${groups.size === 1 ? 'thing' : 'things'} to look at` });
		const list = foot.createDiv({ cls: 'binders-export-warnings', attr: { role: 'list' } });
		for (const [text, of] of [...groups].slice(0, SAID_SHOWN)) {
			const name = of.length === 1 ? of[0].name : `${of[0].name} and ${n(of.length - 1, 'other')}`, to = of.find((s) => s.path)?.path ?? '';
			const row = list.createDiv({ cls: 'binders-export-warn', attr: { role: 'listitem' } }), b = row.createDiv({ cls: 'binders-export-warn-open' });
			b.createDiv({ cls: 'binders-export-warn-note', text: name });
			b.createDiv({ cls: 'binders-export-warn-text', text });
			if (!to || !this.plan?.notes.some((x) => x.path === to && !x.folder)) continue;
			b.setAttrs({ role: 'button', tabindex: '0', 'aria-label': `${name}: ${text} Show the note.` });
			const show = () => { this.show(to); if (Platform.isPhone) { this.toPane(); this.previewEl.addClass('is-reading'); } };
			b.addEventListener('click', show);
			b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
		}
		if (groups.size > SAID_SHOWN) foot.createDiv({ cls: 'binders-export-needs', text: `And ${n(groups.size - SAID_SHOWN, 'other')}. The new binder’s own note lists every one.` });
	}

	// ---- the bar ----

	private bar(): void {
		const plan = this.plan, folders = plan ? plan.notes.filter((x) => x.folder).length - 1 : 0;
		this.nameEl.setText(safeName(this.name));
		this.detailEl.setText(plan ? [n(plan.sceneCount, 'note'), n(folders, 'folder'), ...(plan.snapshotCount ? [n(plan.snapshotCount, 'snapshot')] : [])].join(' · ') : '');
		const focused = this.actions.contains(this.modalEl.doc.activeElement);
		this.actions.empty();
		if (this.busy) {
			this.actions.createSpan({ cls: 'binders-export-status', text: this.busy, attr: { role: 'status', 'aria-live': 'polite' } });
			new ButtonComponent(this.actions).setButtonText('Cancel').onClick(() => { this.cancelled = true; });
		} else new ButtonComponent(this.actions).setButtonText('Import').setCta().setDisabled(!!this.refused()).onClick(() => void this.run());
		if (focused) this.actions.querySelector('button')?.focus();
	}

	// ---- the preview ----

	/** The binder as it will be, beside one note of it as it will read. */
	private preview(): void {
		const el = this.previewEl, plan = this.plan;
		el.empty();
		this.stage = null;
		if (!plan) { el.createDiv({ cls: 'binders-export-stage' }).createDiv({ cls: 'binders-export-none', text: this.failed ?? '' }); return; }
		// The binder as Obsidian's own tree, as the file explorer and the Contents pane draw one: a folder folds, and
		// is walked with the keys that walk those (up and down the rows in sight, right into a folder, left out of one).
		const list = el.createDiv({ cls: 'binders-export-outline binders-import-tree nav-files-container', attr: { role: 'tree', 'aria-label': 'The binder as it will be' } });
		const into: HTMLElement[] = [list];
		// (the binder's own row would say its name a third time: its items start at the edge)
		for (const note of plan.notes.slice(1)) {
			const status = note.status ? display(note.status) : '';
			const row = (into[note.depth - 1] ?? list).createDiv({ cls: note.folder ? 'tree-item nav-folder' : 'tree-item nav-file' });
			const self = row.createDiv({ cls: `tree-item-self is-clickable ${note.folder ? 'nav-folder-title mod-collapsible' : 'nav-file-title'}`, attr: { role: 'treeitem', tabindex: '-1', 'aria-level': String(note.depth), 'data-path': note.path, 'aria-label': `${note.title}${note.folder ? ', a folder' : ''}${status ? `, ${status}` : ''}${note.out ? ', left out of exports' : ''}` } });
			self.toggleClass('binders-export-out', note.out);
			if (note.folder) setIcon(self.createDiv({ cls: 'tree-item-icon collapse-icon' }), 'right-triangle');
			self.createDiv({ cls: `tree-item-inner ${note.folder ? 'nav-folder-title-content' : 'nav-file-title-content'}`, text: note.title });
			if (status) self.createDiv({ cls: 'tree-item-flair-outer' }).createSpan({ cls: 'tree-item-flair', text: status });
			if (this.job.rowActions?.(note).length) {
				// (the row's menu: this button, a right click or a long press, and the menu key on the row)
				const more = self.createDiv({ cls: 'clickable-icon binders-import-more', attr: { 'aria-label': `Change “${note.title}”`, role: 'button', tabindex: '-1' } });
				setIcon(more, 'more-vertical');
				more.addEventListener('click', (e) => { e.stopPropagation(); this.rowMenu(note, e); });
			}
			if (!note.folder) { self.setAttr('aria-selected', 'false'); continue; }
			self.setAttr('aria-expanded', 'true');
			into[note.depth] = row.createDiv({ cls: 'tree-item-children nav-folder-children', attr: { role: 'group' } });
		}
		const rowOf = (target: EventTarget | null) => (target instanceof HTMLElement ? target.closest<HTMLElement>('.tree-item-self[data-path]') : null);
		const fold = (self: HTMLElement, shut = !self.parentElement?.hasClass('is-collapsed')) => {
			self.parentElement?.toggleClass('is-collapsed', shut);
			self.querySelector('.collapse-icon')?.toggleClass('is-collapsed', shut);
			self.setAttr('aria-expanded', String(!shut));
		};
		/** A row acted on: a folder folds, a note is shown (on a phone its text takes the list's place). */
		const go = (self: HTMLElement) => {
			if (self.hasAttribute('aria-expanded')) { fold(self); return; }
			this.show(self.dataset.path ?? '');
			if (Platform.isPhone) el.addClass('is-reading');
		};
		list.addEventListener('contextmenu', (e) => {
			const self = rowOf(e.target), note = self ? plan.notes.find((x) => x.path === self.dataset.path) : undefined;
			if (self && note && this.job.rowActions?.(note).length) { e.preventDefault(); this.rowMenu(note, e); }
		});
		list.addEventListener('click', (e) => { const self = rowOf(e.target); if (self) { this.stop(self); go(self); } });
		list.addEventListener('keydown', (e) => {
			const self = rowOf(e.target);
			if (!self || e.target !== self || e.altKey || e.isComposing) return;
			const seen = Array.from(list.querySelectorAll<HTMLElement>('.tree-item-self[data-path]')).filter((r) => !r.closest('.tree-item.is-collapsed > .tree-item-children')), i = seen.indexOf(self);
			const folder = self.hasAttribute('aria-expanded'), shut = !!self.parentElement?.hasClass('is-collapsed');
			const to = (r: HTMLElement | null | undefined) => { if (!r) return; this.stop(r); r.focus({ preventScroll: true }); r.scrollIntoView({ block: 'nearest' }); if (!r.hasAttribute('aria-expanded')) this.show(r.dataset.path ?? ''); };
			switch (e.key) {
				case 'ArrowDown': to(seen[i + 1]); break;
				case 'ArrowUp': to(seen[i - 1]); break;
				case 'Home': to(seen[0]); break;
				case 'End': to(seen[seen.length - 1]); break;
				case 'ArrowRight': if (folder && shut) fold(self, false); else if (folder) to(seen[i + 1]); break;
				case 'ArrowLeft': if (folder && !shut) fold(self, true); else to(self.parentElement?.parentElement?.closest('.tree-item')?.querySelector<HTMLElement>(':scope > .tree-item-self')); break;
				case 'Enter': case ' ': go(self); break;
				default: return;
			}
			e.preventDefault();
		});
		this.stage = el.createDiv({ cls: 'binders-export-stage' });
		// the note that was shown, if it is still in the plan under that path; else the first there is
		const first = plan.notes.find((x) => !x.folder && x.path === this.shown) ?? plan.notes.find((x) => !x.folder);
		this.show(first?.path ?? '');
	}

	/** A row's menu: what the writer can do to it by hand. */
	private rowMenu(note: PlannedNote, e: MouseEvent): void {
		const actions = this.job.rowActions?.(note) ?? [];
		if (this.busy || !actions.length) return;
		const menu = new Menu();
		for (const a of actions) menu.addItem((i) => i.setTitle(a.title).setIcon(a.icon).onClick(() => { void a.run().then(() => this.replan()); }));
		menu.showAtMouseEvent(e);
	}

	/** One row is the list's stop for Tab: the one the keyboard was last on. */
	private stop(self: HTMLElement): void {
		for (const el of Array.from(this.previewEl.querySelectorAll('.tree-item-self[tabindex="0"]'))) if (el !== self) el.setAttr('tabindex', '-1');
		self.setAttr('tabindex', '0');
	}

	/** One note of the plan, as it will read. */
	private show(path: string): void {
		const stage = this.stage, note = this.plan?.notes.find((x) => x.path === path && !x.folder);
		if (!stage) return;
		this.shown = note?.path ?? '';
		for (const row of this.previewEl.querySelectorAll<HTMLElement>('[role="treeitem"][aria-selected]')) {
			const on = row.dataset.path === this.shown;
			row.toggleClass('is-active', on);
			row.setAttr('aria-selected', String(on));
			// (the note shown is where Tab comes into the list, until the keyboard has been somewhere else in it)
			if (on && !this.previewEl.contains(this.modalEl.doc.activeElement)) { this.stop(row); row.scrollIntoView({ block: 'nearest' }); }
		}
		const turn = ++this.turn;
		if (this.drawn) this.rendered.removeChild(this.drawn);
		const drawn = this.drawn = this.rendered.addChild(new Component());
		stage.empty();
		if (!note) { stage.createDiv({ cls: 'binders-export-none', text: this.job.empty }); return; }
		const text = note.body, cut = text.length > NOTE_SHOWN ? text.slice(0, text.lastIndexOf('\n', NOTE_SHOWN)) : text;
		const body = stage.createDiv({ cls: 'binders-export-note binders-import-note markdown-rendered', attr: { tabindex: '0', role: 'region', 'aria-label': `${note.title}, as it will read` } });
		body.createDiv({ cls: 'inline-title', text: note.title });
		const paras = this.job.paragraphs?.(note);
		const tabs = (t: string) => forRender(this.plugin.settings.tabParagraphs ? tabsForRender(t) : t);
		if (!text.trim()) body.createEl('p', { cls: 'binders-import-empty', text: 'This document has no text.' });
		else if (paras?.length && this.job.startHere) {
			// each paragraph on its own, with the way to start a note there (the first paragraph of a note is where it starts)
			const holder = body.createDiv({ cls: 'binders-import-paras' }), first = paras.find((q) => q.unit >= 0)?.unit;
			paras.slice(0, PARAS_SHOWN).forEach((q) => {
				const box = holder.createDiv({ cls: 'binders-import-para' });
				void MarkdownRenderer.render(this.app, tabs(q.text), box.createDiv({ cls: 'binders-import-para-text' }), note.path, drawn).then(() => { if (turn !== this.turn) box.empty(); });
				if (q.unit < 0 || q.unit === first) return;
				const b = box.createEl('button', { cls: 'binders-import-start', text: 'Start a note here', attr: { 'aria-label': 'Start a note here, at this paragraph' } });
				b.addEventListener('click', () => { if (!this.busy) { this.job.startHere?.(q.unit, note); this.replan(); } });
			});
			if (paras.length > PARAS_SHOWN) void MarkdownRenderer.render(this.app, tabs(paras.slice(PARAS_SHOWN).map((q) => q.text).join('\n\n')), holder.createDiv({ cls: 'binders-import-para-rest' }), note.path, drawn).then(() => { if (turn !== this.turn) holder.empty(); });
		}
		// (a line begun with a tab is a paragraph in a binder: shown as one here too, where the setting says so)
		else void MarkdownRenderer.render(this.app, forRender(this.plugin.settings.tabParagraphs ? tabsForRender(cut) : cut), body.createDiv(), note.path, drawn).then(() => { if (turn !== this.turn) body.empty(); });
		const words = wordsIn(this.plugin, text);
		stage.createDiv({ cls: 'binders-export-caption', text: `${n(words, 'word')}${cut !== text ? '. The start of the note is shown; the note itself will have all of it' : ''}. ${this.job.caption}` });
	}

	// ---- importing ----

	private say(doing: string | null): void {
		const was = !!this.busy;
		this.busy = doing;
		this.bar();
		// (the choices are held while it runs, and given back after)
		if (was !== !!doing) this.choices();
	}

	private async run(): Promise<void> {
		if (this.busy) return;
		if (this.stale) this.replan();
		const plan = this.plan, why = this.refused();
		if (!plan || why) { this.whyEl?.setText(why ?? ''); this.bar(); return; }
		this.cancelled = false;
		try {
			this.say(this.job.checking);
			if (!(await this.job.unchanged())) throw new Error(this.job.changed);
			// (how far it is, said about ten times a second: a long book's files are made faster than they can be read)
			let done = 0, last = 0;
			const folder = await writeImport(this.app.vault, plan, this.parent, () => this.cancelled, () => {
				done++;
				if (performance.now() - last < 100 && done < plan.files.size) return;
				last = performance.now();
				this.say(`Importing… ${done.toLocaleString()} of ${n(plan.files.size, 'file')}`);
			});
			// (added to the settings as they are now, not to a copy from when the dialog opened)
			const s = this.plugin.settings;
			for (const l of plan.labels) if (!s.labels.some((v) => v.name.toLowerCase() === l.name.toLowerCase())) s.labels.push(l);
			for (const status of plan.statuses) if (!s.statuses.includes(status)) s.statuses.push(status);
			await this.plugin.saveSettings();
			this.close();
			await this.plugin.openBinder(folder);
			this.done(plan, folder);
		} catch (e) {
			// (what was made before it stopped is plain files in the new folder, and the message says where)
			if (this.contentEl.isConnected && !this.cancelled) { this.busy = null; this.failed = null; this.choices(); this.bar(); this.whyEl?.setText(message(e)); return; }
			this.close();
			new Notice(message(e), 10000);
		} finally { this.busy = null; }
	}

	/** Said once the binder is open: what was made, and the way to what import had to say (the binder note's text). */
	private done(plan: ImportPlan, folder: TFolder): void {
		const notice = new Notice(`Imported “${plan.name}”: ${n(plan.sceneCount, 'note')}${plan.snapshotCount ? `, ${n(plan.snapshotCount, 'snapshot')}` : ''}.`, 10000);
		if (!plan.warnings.length) return;
		new ButtonComponent(notice.messageEl.createDiv({ cls: 'binders-import-notes' })).setButtonText('Open import notes').onClick(() => {
			notice.hide();
			const file = this.app.vault.getAbstractFileByPath(`${folder.path}/${plan.name}.md`);
			if (file instanceof TFile) void this.app.workspace.getLeaf(true).openFile(file);
			else new Notice('The binder’s own note has been moved. Open it from the binder.');
		});
	}
}
