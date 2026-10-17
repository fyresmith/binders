import { ButtonComponent, Component, Modal, Notice, Platform, Setting, TFile, TFolder, setIcon, type TAbstractFile } from 'obsidian';
import type BindersPlugin from '../main';
import type { Binder } from '../binders';
import { ConvertModal } from '../longform-convert';
import { titleOf } from '../shown-name';
import { ownTemplate } from '../templates';
import { bookDetails } from '../export/export';
import { drawBookDetails } from './book-details';
import { CalendarForm } from './calendar-form';
import { ListsPage, type PageHost } from './binder-lists-page';
import { drawGoal, drawNewNotes } from './binder-settings-pages';
import { historyLook } from './internals';
import { readProps } from './props';

/* Binder settings: everything a binder keeps about itself in its note, in one place. Obsidian's two-pane dialog, the one
   Export and Snapshots use: on the left the binder's name and its pages (Book, Goal, Labels, Statuses, New notes,
   Calendar), on the right the chosen page. A phone shows the list, then a page with a back button.

   Every control keeps its change as it is made, as Obsidian's settings do, and there is no Save or Done: a text is kept
   when its field is left or Enter is pressed. The one page that has a button is Calendar, because saving it can change
   what the story dates already written mean. Each control keeps the undo it had where it came from (a plan, a
   template, the calendar are one step each); the lists of labels and statuses are not in the history, as a pin in
   the inspector is not. A binder made by a newer Binders, and a Longform project, show every page with nothing
   enabled and a line at the top that says why. */

export type SettingsPage = 'book' | 'goal' | 'labels' | 'statuses' | 'new-notes' | 'calendar';

const PAGES: [SettingsPage, string][] = [['book', 'Book'], ['goal', 'Goal'], ['labels', 'Labels'], ['statuses', 'Statuses'], ['new-notes', 'New notes'], ['calendar', 'Calendar']];

/** What a Longform project's pages say at the top. */
export const LONGFORM_LOCKED = 'Longform keeps this project’s settings in its index note; Binders writes nothing of its own there.';

/** The dialog that is open, if any: asking for it again shows the page asked for in that one. */
let open: { modal: BinderSettingsModal } | null = null;

export class BinderSettingsModal extends Modal {
	private page: SettingsPage;
	private side!: HTMLElement;
	private pane!: HTMLElement;
	private body!: HTMLElement;
	private nameEl!: HTMLElement;
	private detailEl!: HTMLElement;
	private back: HTMLElement | null = null;
	private rendered = new Component();
	private current: { refresh?: () => void } | null = null;
	private timer = 0;
	private asked: boolean;

	constructor(private plugin: BindersPlugin, readonly note: TFile, private from: TAbstractFile, page: SettingsPage | undefined, private done?: () => void) {
		super(plugin.app);
		this.page = page ?? 'book';
		// (a phone shows the list unless it was asked for a page)
		this.asked = !!page;
	}

	private get binder(): Binder | null { return this.plugin.binders.all().find((b) => b.note === this.note) ?? null; }
	/** Why nothing can be changed, or null. */
	private get locked(): string | null {
		const b = this.binder;
		return !b ? null : b.kind === 'longform' ? LONGFORM_LOCKED : b.problem ? `This binder can’t be changed. ${b.problem}` : null;
	}
	/** The binder's name as it is shown: the title its note has, else its folder's. */
	private get name(): string {
		const b = this.binder;
		return !b ? this.note.basename : titleOf(b.note) ?? b.folder.name;
	}

	/** Shows another page (in the dialog that is open). */
	show(page: SettingsPage): void {
		this.page = page;
		this.sidebar();
		this.drawPage();
		if (Platform.isPhone) this.toPane();
	}

	onOpen(): void {
		const { modalEl, contentEl } = this;
		open = { modal: this };
		this.setTitle('Binder settings');
		modalEl.addClass('binders-snapshots', 'binders-bset', 'mod-sidebar-layout');
		this.side = contentEl.createDiv({ cls: 'modal-sidebar mod-history binders-bset-side' });
		this.pane = createDiv({ cls: 'sync-history-content-container binders-snapshots-pane binders-bset-pane' });
		const content = this.pane.createDiv({ cls: 'sync-history-content' });
		const bar = content.createDiv({ cls: 'modal-setting-titlebar binders-snapshots-bar' });
		const title = bar.createDiv({ cls: 'modal-setting-title binders-snapshots-title' });
		this.nameEl = title.createSpan({ cls: 'binders-snapshots-name' });
		this.detailEl = title.createSpan({ cls: 'binders-snapshots-detail' });
		this.body = content.createDiv({ cls: 'binders-bset-body' });
		if (!Platform.isPhone) contentEl.appendChild(this.pane);
		else {
			this.back = createDiv({ cls: 'clickable-icon modal-setting-back-button mod-raised', attr: { 'aria-label': 'Back to the pages', role: 'button' } });
			setIcon(this.back, 'arrow-left');
			this.back.addEventListener('click', () => this.toList());
		}
		// Obsidian's own look for such a dialog, or (where it has none) ours
		modalEl.toggleClass('is-plain', !historyLook(contentEl));
		this.rendered.load();
		// what the binder note says changed (here, in the note, from another device): the page shows it
		this.rendered.registerEvent(this.app.metadataCache.on('changed', (f) => {
			if (f !== this.note) return;
			window.clearTimeout(this.timer);
			this.timer = window.setTimeout(() => { this.sidebar(); this.current?.refresh?.(); }, 80);
		}));
		this.sidebar();
		this.drawPage();
		if (Platform.isPhone) { if (this.asked) this.toPane(); }
		else window.setTimeout(() => this.side.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus(), 0);
	}

	onClose(): void {
		if (open?.modal === this) open = null;
		window.clearTimeout(this.timer);
		this.rendered.unload();
		this.contentEl.empty();
		// (a field still being typed in gave its text up as it lost the window; what is read next has it)
		if (this.done) window.setTimeout(this.done, 80);
	}

	private toPane(): void { this.side.detach(); this.contentEl.appendChild(this.pane); if (this.back) this.modalEl.appendChild(this.back); }
	private toList(): void { this.pane.detach(); this.back?.detach(); this.contentEl.appendChild(this.side); }

	// ---- the pages' list ----

	/** What a page has now, in a few words, under its name. */
	private detail(page: SettingsPage): string {
		const b = this.binder, { plugin } = this;
		if (!b) return '';
		const fm = (plugin.app.metadataCache.getFileCache(b.note)?.frontmatter ?? {}) as Record<string, unknown>, store = plugin.binders;
		switch (page) {
			case 'book': { try { return bookDetails(plugin, b.folder).details.title || 'No title yet'; } catch { return ''; } }
			case 'goal': { const t = readProps(plugin, b.note).target; return t ? `${t.toLocaleString('en-US')} words` : 'No target'; }
			case 'labels': { const own = store.ownLabels(b); return own ? `${own.length} of its own` : 'The vault’s'; }
			case 'statuses': { const own = store.ownStatuses(b); return own ? `${own.length} of its own` : 'The vault’s'; }
			case 'new-notes': { const t = b.kind === 'binder' ? ownTemplate(plugin, b.folder) : null; return t ? t.basename : 'Start empty'; }
			case 'calendar': return fm.calendar == null && fm.eras == null ? 'Ordinary dates' : 'The book’s own';
		}
	}

	private sidebar(): void {
		const active = this.side.doc.activeElement, held = active?.instanceOf(HTMLElement) && this.side.contains(active) ? active.dataset.bindersKey : undefined;
		this.side.empty();
		const inner = this.side.createDiv({ cls: 'modal-sidebar-inner' });
		const head = inner.createDiv({ cls: 'binders-snapshots-head binders-bset-head' });
		head.createDiv({ cls: 'binders-snapshots-of', text: this.name });
		const list = inner.createDiv({ cls: 'modal-sidebar-list binders-bset-pages', attr: { role: 'listbox', 'aria-label': 'Binder settings' } });
		const items: HTMLElement[] = [];
		for (const [id, name] of PAGES) {
			const on = id === this.page, detail = this.detail(id);
			const el = list.createDiv({ cls: 'modal-sidebar-list-item file-recovery-list-item-header tappable binders-snapshots-item', attr: { role: 'option', tabindex: on ? '0' : '-1', 'aria-selected': String(on), 'aria-label': `${name}: ${detail}`, 'data-binders-key': `page-${id}` } });
			el.toggleClass('is-active', on);
			const d = el.createDiv({ cls: 'modal-sidebar-list-item-details' });
			d.createDiv({ cls: 'binders-snapshots-item-name', text: name });
			d.createDiv({ cls: 'binders-snapshots-item-detail', text: detail });
			const pick = () => this.show(id);
			el.addEventListener('click', pick);
			el.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); return; }
				const i = items.indexOf(el), to = e.key === 'ArrowDown' ? items[i + 1] : e.key === 'ArrowUp' ? items[i - 1] : e.key === 'Home' ? items[0] : e.key === 'End' ? items[items.length - 1] : null;
				if (!to || to === el) return;
				e.preventDefault();
				to.focus();
				to.click();
			});
			items.push(el);
		}
		if (held) this.side.querySelector<HTMLElement>(`[data-binders-key="${held}"]`)?.focus();
	}

	// ---- a page ----

	private drawPage(): void {
		const b = this.binder;
		this.body.empty();
		this.current = null;
		if (!b) { this.close(); return; }
		const name = PAGES.find((p) => p[0] === this.page)?.[1] ?? '';
		this.nameEl.setText(name);
		this.detailEl.setText(this.name);
		const { body } = this, locked = this.locked;
		body.dataset.page = this.page;
		// opened from a folder inside the binder: it is the binder's settings, and which binder is said
		const inside = this.from instanceof TFolder ? this.from : this.from instanceof TFile && this.from.parent ? this.from.parent : null;
		if (inside && inside !== b.folder && inside.path.startsWith(`${b.folder.path}/`)) body.createEl('p', { cls: 'binders-bset-from', text: `These are the settings of the binder “${this.name}”, which “${inside.name}” is in.` });
		if (locked) {
			const note = body.createDiv({ cls: 'binders-bset-locked', attr: { role: 'status' } });
			note.createEl('p', { text: locked });
			if (b.kind === 'longform') {
				const row = note.createDiv({ cls: 'binders-bset-convert' });
				const btn = new ButtonComponent(row).setButtonText('Convert to binder').onClick(() => { new ConvertModal(this.app, this.plugin.binders, b, () => { this.drawPage(); this.sidebar(); }).open(); });
				btn.buttonEl.dataset.bindersKey = 'convert';
			}
		}
		const page = body.createDiv({ cls: `binders-bset-page mod-${this.page}` });
		const host: PageHost = { plugin: this.plugin, binder: b, el: page, locked, refreshSide: () => this.sidebar() };
		switch (this.page) {
			case 'book': {
				page.addClass('binders-book-details');
				drawBookDetails(page, this.plugin, b.folder, true);
				// (on a phone the More options sheet is full: the binder note is opened from here)
				if (Platform.isPhone) new Setting(page).setName('Open binder note').setDesc('The note these settings are kept in.').addButton((x) => {
					x.setButtonText('Open').onClick(() => { this.close(); void this.app.workspace.getLeaf(false).openFile(b.note); });
					x.buttonEl.dataset.bindersKey = 'open-binder-note';
				});
				break;
			}
			case 'goal': this.current = drawGoal(host); break;
			case 'labels': { const p = new ListsPage(host, 'label'); p.open(); this.current = p; break; }
			case 'statuses': { const p = new ListsPage(host, 'status'); p.open(); this.current = p; break; }
			case 'new-notes': this.current = drawNewNotes(host); break;
			case 'calendar': new CalendarForm(this.plugin, b, page, () => { this.sidebar(); this.drawPage(); }).open(locked); break;
		}
	}
}

/** Opens Binder settings for the binder `from` (a binder, a folder or a note in it) is in, at a page. False, and a
    notice, when it is in no binder. `done` runs when the dialog is closed. */
export function openBinderSettings(plugin: BindersPlugin, from: TAbstractFile | Binder, page?: SettingsPage, done?: () => void): boolean {
	const store = plugin.binders, binder = 'kind' in from && 'note' in from ? from : store.binderOf(from);
	if (!binder) { new Notice('That isn’t in a binder.'); return false; }
	const at: TAbstractFile = 'kind' in from && 'note' in from ? from.folder : from;
	if (open && open.modal.note === binder.note && open.modal.containerEl.isConnected) { if (page) open.modal.show(page); return true; }
	new BinderSettingsModal(plugin, binder.note, at, page, done).open();
	return true;
}

/** The binder the file explorer's or a view's folder belongs to, for a command that works on the one in front. */
export function binderIn(plugin: BindersPlugin, item: TAbstractFile | null): Binder | null {
	return item ? plugin.binders.binderOf(item) : null;
}
