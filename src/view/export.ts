import { ButtonComponent, Component, MarkdownRenderer, Menu, Modal, Notice, Platform, Setting, TFile, setIcon, type TFolder } from 'obsidian';
import type BindersPlugin from '../main';
import { DOCX_MIME, KINDS, NO_PDF, PDF_MIME, bookDetails, ebook, exportsFolder, fileName, manuscript, noteLast, pagesPdf, placeFor, readBook, save, saveDetails, setPlace, share, shownPath, type Kind, type Saved } from '../export/export';
import { PAPER_SIZES, TRIM_SIZES, paperSize, trimSize } from '../export/pages/geometry';
import { bookPages, manuscriptPages, withTitlePage, type PagesSpec } from '../export/pages/layout';
import { EPUB_MIME } from '../export/epub';
import { STRUCTURES, type Book } from '../export/model';
import type { Family } from '../export/style-rows';
import { oneNoteText, isExported, oneNotePath, writeOneNote } from '../scenes';
import { COMPILE_DEFAULTS, forRender, type CompileOptions } from '../scene-text';
import type { ScrivProject } from '../export/scriv/project';
import { readScriv } from '../export/scriv/vault';
import { BookDetailsModal, pickCover } from './book-details';
import { exportAsItems } from './export-as';
import { drawContents } from './export-contents';
import { drawEbook, drawManuscript, showPages } from './export-preview';
import { drawStyleEditor, dress, runningHead, styleRow, type StyleEditor, type StyleEditorHost } from './export-style-editor';
import { drawScriv, exportScriv, scrivChoices, scrivDetail, scrivFile } from './export-scriv';
import { historyLook } from './internals';
import { confirm } from './modals';
import { wordsIn } from './words';

/* The Export window: Obsidian's two-pane dialog, the one File recovery and Snapshots use. On the left what to make
   (the kinds that exist so far: a manuscript, an ebook, a Scrivener project, and one note), the chosen kind's few choices, where the file goes and
   what export has to leave out or change. On the right what is being made, "Contents", Export, and the preview. A
   phone has the choices first and the preview second. The design is docs/dev/export.md; what it does is in
   export/export.ts, and nothing here writes to a note. */

const SEPARATORS: [string, string][] = [['* * *', '* * *'], ['#', '#'], ['---', '---'], ['', 'A blank line']];
/** How much of one note is drawn in the preview: past this a renderer holds the window up. The note has it all. */
const NOTE_SHOWN = 120000;
/** What each kind that is a book's file is, to the save dialog and the share sheet. */
export const FILES = { manuscript: { extension: 'docx', type: 'Word document', mime: DOCX_MIME }, ebook: { extension: 'epub', type: 'EPUB ebook', mime: EPUB_MIME }, paperback: { extension: 'pdf', type: 'PDF document', mime: PDF_MIME } } as const;
/** What a phone or a tablet says of a PDF: its pages can be looked at there, and it is made on a computer. */
const PDF_ELSEWHERE = 'A PDF is made by Obsidian on a computer. Here you can look at its pages and choose its style; export it when this vault is open on a computer.';

/** A book as the pages of a PDF: a paperback's (a book style on a trim size) or a manuscript's (a manuscript style on
    the paper in settings, with its title page). The window and Export again lay a PDF out with this one function. */
export function pagedBook(plugin: BindersPlugin, book: Book, words: number, o: { book: string; page: string } | { manuscript: string }): { book: Book; spec: PagesSpec } {
	if ('book' in o) return { book, spec: bookPages(book, plugin.styles.book(o.book), trimSize(o.page), words) };
	const s = plugin.settings, style = plugin.styles.manuscript(o.manuscript), whole = style.titlePage ? withTitlePage(book) : book;
	return { book: whole, spec: manuscriptPages(whole, style, paperSize(s.exportPaper), { contact: s.contact.split(/\r?\n/).map((l) => l.trim()).filter((l) => l), words }) };
}

/** The family of styles a kind is set in: an ebook's and a paperback's are book styles. */
const familyOf = (kind: Kind): Family => (kind === 'ebook' || kind === 'paperback' ? 'book' : 'manuscript');

export class ExportModal extends Modal {
	private kind: Kind;
	private style: string;
	/** The book style, kept in the binder note (`book-style`) with the book's other details. */
	private bookStyle: string;
	/** The paperback's page (a trim size's id), kept in the binder note (`page-size`). */
	private pageSize = '';
	/** How many pages the PDF being shown has, once they are laid out. */
	private pages: number | null = null;
	private matter: boolean;
	private o: CompileOptions;
	private path: string;
	private side!: HTMLElement;
	private pane!: HTMLElement;
	private nameEl!: HTMLElement;
	private detailEl!: HTMLElement;
	private actions!: HTMLElement;
	private previewEl!: HTMLElement;
	private back: HTMLElement | null = null;
	private contents = false;
	/** What is being made, read: the book (a manuscript), or the text and how many notes (one note). */
	private book: Book | null = null;
	private words = 0;
	private note: { text: string; scenes: number } | null = null;
	private scriv: ScrivProject | null = null;
	/** What export is doing just now, in words; null when it is doing nothing. */
	private busy: string | null = null;
	private cancelled = false;
	/** What stops the export under way where it stands: a PDF being printed is one long step, out of sight. */
	private stopping: AbortController | null = null;
	private saved: Saved | null = null;
	private loading = 0;
	private stop: (() => void) | null = null;
	private rendered = new Component();
	private timer = 0;
	/** The style editor, while the sidebar is it (view/export-style-editor.ts). */
	private editing = false;
	private editor: (StyleEditor & { kind: 'manuscript' | 'ebook' | 'paperback' }) | null = null;
	private quotes = '';

	constructor(private plugin: BindersPlugin, private folder: TFolder) {
		super(plugin.app);
		const s = plugin.settings;
		this.kind = s.exportKind;
		this.style = plugin.styles.get(s.exportStyle, 'manuscript').name;
		this.bookStyle = plugin.styles.get('', 'book').name;
		this.follow(true);
		this.matter = s.exportMatter;
		this.o = { ...COMPILE_DEFAULTS, ...s.compile };
		this.path = oneNotePath(plugin, folder);
	}

	/** What the binder note said of the book's styles and its page when it was last looked at. */
	private said = { book: '', manuscript: '', page: '' };
	/** The book's styles and its page as the binder note has them. They are read as the window opens and each time
	    the book is read again, and one that has changed in the note since (typed there, set in another window, come by
	    sync) is the window's from then on. One that hasn't changed there stays as the window has it: a choice made here
	    that couldn't be kept in the note (a Longform project's) holds for this window. */
	private follow(first = false): void {
		const { plugin } = this, was = this.said;
		let d;
		try { d = bookDetails(plugin, this.folder).details; } catch { return; } // (not a binder: reading it says so)
		// (a binder's own manuscript style, or the one last used in this vault)
		if (first || d.manuscriptStyle !== was.manuscript) this.style = plugin.styles.get(d.manuscriptStyle || plugin.settings.exportStyle, 'manuscript').name;
		if (first || d.bookStyle !== was.book) this.bookStyle = plugin.styles.get(d.bookStyle, 'book').name;
		if (first || d.pageSize !== was.page) this.pageSize = trimSize(d.pageSize).id;
		this.said = { book: d.bookStyle, manuscript: d.manuscriptStyle, page: d.pageSize };
	}

	private get host() { return this.plugin.exportHost.desktop(this.app); }
	/** The kind being made, when it is a book's file (not a Scrivener project, which is the binder itself, and not one note). */
	private get file(): 'manuscript' | 'ebook' | 'paperback' | null { return this.kind === 'manuscript' || this.kind === 'ebook' || this.kind === 'paperback' ? this.kind : null; }
	/** True when what is being made is a PDF: a paperback, or a manuscript whose file is one. */
	private get pdf(): boolean { return this.kind === 'paperback' || (this.kind === 'manuscript' && this.plugin.settings.exportFile === 'pdf'); }
	/** True when a PDF is being made and can't be here (a phone, a tablet, an Obsidian without webviews). */
	private get noPdf(): boolean { return this.pdf && !this.plugin.exportHost.printer(); }
	/** The file of the kind being made: a manuscript's is Word's or a PDF. */
	private get made() { return FILES[this.pdf ? 'paperback' : this.kind === 'ebook' ? 'ebook' : 'manuscript']; }
	/** How the pages of a PDF are laid out: the book (a manuscript's with its title page) and the style on its page. */
	private paged(book: Book): { book: Book; spec: PagesSpec } {
		return pagedBook(this.plugin, book, this.words, this.kind === 'paperback' ? { book: this.bookStyle, page: this.pageSize } : { manuscript: this.style });
	}

	/** Book details, the binder's: when the window is closed, the book is read again with them. */
	private details(): void { new BookDetailsModal(this.plugin, this.folder, () => { if (this.contentEl.isConnected) void this.load(); }).open(); }
	private heading(): string { return `Export “${this.folder.name}”`; }

	onOpen(): void {
		const { modalEl, contentEl } = this;
		this.setTitle(this.heading());
		modalEl.addClass('binders-snapshots', 'binders-export', 'mod-sidebar-layout');
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
			this.back = createDiv({ cls: 'clickable-icon modal-setting-back-button mod-raised', attr: { 'aria-label': 'Back to the choices', role: 'button' } });
			setIcon(this.back, 'arrow-left');
			this.back.addEventListener('click', () => this.toChoices());
		}
		// Obsidian's own look for such a dialog, or (where it has none) ours
		modalEl.toggleClass('is-plain', !historyLook(contentEl));
		this.rendered.load();
		// Book details and the cover are the binder note's properties, and a role is a note's own ("Export as", from
		// Contents): when one changes, the book is read again
		const note = this.plugin.binders.binderOf(this.folder)?.note;
		this.rendered.registerEvent(this.app.metadataCache.on('changed', (f) => { if ((f === note || f.path.startsWith(`${this.folder.path}/`)) && this.file && !this.busy) { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { void this.load(); }, 60); } }));
		// a style changed, here or in its file: what is shown follows it
		this.rendered.register(this.plugin.styles.on(() => this.styleChanged()));
		this.draw();
		void this.load();
		// (a phone is touched, not tabbed through: nothing is ringed as it opens)
		if (!Platform.isPhone) window.setTimeout(() => this.side.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus(), 0);
	}

	onClose(): void {
		this.loading++;
		this.cancel();
		window.clearTimeout(this.timer);
		this.stop?.();
		this.rendered.unload();
		this.contentEl.empty();
	}

	private toPane(): void { this.side.detach(); this.contentEl.appendChild(this.pane); if (this.back) this.modalEl.appendChild(this.back); }
	private toChoices(): void { this.pane.detach(); this.back?.detach(); this.contentEl.appendChild(this.side); }

	/** A choice was made: it is kept, and what is shown follows it. `reread`: the notes are read again for it. */
	private changed(reread: boolean): void {
		const s = this.plugin.settings;
		s.exportKind = this.kind; s.exportStyle = this.style; s.exportMatter = this.matter; s.compile = { ...this.o };
		void this.plugin.saveData(s);
		this.saved = null;
		this.draw();
		if (reread) { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { void this.load(); }, 120); } else this.preview();
	}

	private draw(): void { this.choices(); this.bar(); }

	/** Reads what is to be made, for the preview and the counts. A later read takes an earlier one's place. */
	private load(): Promise<void> {
		const turn = ++this.loading;
		return (this.reading = this.reading.then(() => this.read(turn)));
	}
	/** The read under way, and those before it: one at a time, and an export waits for them, so the notes' unsaved
	    typing is never being written down by two readers at once. */
	private reading: Promise<void> = Promise.resolve();

	private async read(turn: number): Promise<void> {
		if (turn !== this.loading) return;
		try {
			if (this.file) {
				this.follow();
				const { book, words } = await readBook(this.plugin, this.folder, this.kind !== 'manuscript' || this.matter, this.kind !== 'manuscript', this.asTyped(), this.kind === 'ebook');
				if (turn !== this.loading) return;
				this.book = book; this.words = words; this.quotes = this.asTyped() ? 'as typed' : '';
				} else if (this.kind === 'scrivener') {
				const { project } = await readScriv(this.plugin, this.folder, { outside: this.plugin.settings.exportOutside, snapshots: this.plugin.settings.exportSnapshots });
				if (turn !== this.loading) return;
				this.scriv = project; this.words = project.words;
			} else {
				const note = await oneNoteText(this.plugin, this.folder, this.o);
				if (turn !== this.loading) return;
				this.note = note; this.words = wordsIn(this.plugin, note.text);
			}
		} catch (e) {
			if (turn !== this.loading) return;
			this.book = null; this.note = null; this.scriv = null;
			new Notice(e instanceof Error ? e.message : String(e));
		}
		this.draw();
		this.preview();
	}

	// ---- the choices ----

	private choices(): void {
		const { plugin } = this, s = plugin.settings, active = this.modalEl.doc.activeElement, held = active?.instanceOf(HTMLElement) && this.side.contains(active) ? active.dataset.bindersKey ?? active.closest<HTMLElement>('[data-binders-key]')?.dataset.bindersKey : undefined;
		// (the editor stays as it is while it is open, its place and its cursor kept: it only follows the style)
		if (this.editing && this.file) { if (this.editor?.el.isConnected && this.editor.kind === this.file) this.editor.refresh(); else this.editor = { ...drawStyleEditor(this.side, this.editorHost(this.file)), kind: this.file }; return; }
		this.editor = null;
		this.side.empty();
		const inner = this.side.createDiv({ cls: 'modal-sidebar-inner' });
		if (!Platform.isPhone) {
			const head = inner.createDiv({ cls: 'binders-snapshots-head binders-export-head' });
			head.createDiv({ cls: 'binders-snapshots-of', text: this.folder.name });
			// (a Scrivener project is the binder itself, and one note is a note: neither has a book's details)
			if (this.file) {
				const b = head.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': 'Book details', role: 'button', tabindex: '0', 'data-binders-key': 'details' } });
				setIcon(b, 'book-open');
				b.addEventListener('click', () => this.details());
				b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.details(); } });
			}
		}
		const list = inner.createDiv({ cls: 'modal-sidebar-list binders-export-kinds', attr: { role: 'listbox', 'aria-label': 'What to make' } });
		const items: HTMLElement[] = [];
		for (const k of KINDS) {
			// (a phone and a tablet make no PDF, and the row says so)
			const on = k.id === this.kind, detail = k.id === 'paperback' && Platform.isMobile ? 'PDF, made on a computer' : k.detail;
			const el = list.createDiv({ cls: 'modal-sidebar-list-item file-recovery-list-item-header tappable binders-snapshots-item', attr: { role: 'option', tabindex: on ? '0' : '-1', 'aria-selected': String(on), 'aria-label': `${k.name}: ${detail}`, 'data-binders-key': `kind-${k.id}` } });
			el.toggleClass('is-active', on);
			const d = el.createDiv({ cls: 'modal-sidebar-list-item-details' });
			d.createDiv({ cls: 'binders-snapshots-item-name', text: k.name });
			d.createDiv({ cls: 'binders-snapshots-item-detail', text: detail });
			const pick = () => { if (this.kind === k.id || this.busy) return; this.kind = k.id; this.contents = false; this.changed(true); };
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
		const el = inner.createDiv({ cls: 'binders-export-options' });
		const toggle = (key: string, name: string, on: boolean, set: (v: boolean) => void, reread = true) => new Setting(el).setName(name).addToggle((t) => { t.setValue(on).onChange((v) => { set(v); this.changed(reread); }); t.toggleEl.dataset.bindersKey = key; });
		if (this.kind === 'manuscript') {
			styleRow(el, this.plugin, 'manuscript', this.style, (v) => this.chooseStyle('manuscript', v), () => this.edit());
			toggle('matter', 'Front and back matter', this.matter, (v) => { this.matter = v; });
			new Setting(el).setName('File').addDropdown((d) => {
				d.addOption('docx', 'Word (.docx)').addOption('pdf', 'PDF');
				d.setValue(s.exportFile).onChange((v) => { s.exportFile = v === 'pdf' ? 'pdf' : 'docx'; this.changed(false); });
				d.selectEl.dataset.bindersKey = 'file';
			});
			if (this.pdf) new Setting(el).setName('Paper').addDropdown((d) => {
				for (const size of PAPER_SIZES) d.addOption(size.id, size.name);
				d.setValue(paperSize(s.exportPaper).id).onChange((v) => { s.exportPaper = v; this.changed(false); });
				d.selectEl.dataset.bindersKey = 'paper';
			});
		} else if (this.kind === 'paperback') {
			styleRow(el, this.plugin, 'book', this.bookStyle, (v) => this.chooseStyle('book', v), () => this.edit());
			new Setting(el).setName('Page').addDropdown((d) => {
				for (const size of TRIM_SIZES) d.addOption(size.id, size.name);
				d.setValue(this.pageSize).onChange((v) => { this.pageSize = v; void saveDetails(this.plugin, this.folder, { pageSize: v === TRIM_SIZES[0].id ? '' : v }).catch(() => { /* as the style: it holds for this window */ }); this.changed(false); });
				d.selectEl.dataset.bindersKey = 'page';
			});
		} else if (this.kind === 'ebook') {
			styleRow(el, this.plugin, 'book', this.bookStyle, (v) => this.chooseStyle('book', v), () => this.edit());
			const cover = this.book?.cover ? 'Change...' : 'Choose...';
			new Setting(el).setName('Cover').addButton((b) => {
				b.setButtonText(cover).onClick(() => pickCover(this.plugin, this.folder, () => { if (this.contentEl.isConnected) void this.load(); }));
				b.buttonEl.dataset.bindersKey = 'cover';
			});
		}
		if (this.file) {
			if (Platform.isPhone) new Setting(el).setName('Book details').addButton((b) => { b.setButtonText('Edit...').onClick(() => this.details()); b.buttonEl.dataset.bindersKey = 'details'; });
			// the one thing Binders can't know: asked for here until it is said (and kept in Binders' settings)
			if ((this.book && !this.book.author && !s.authorName.trim()) || this.asking) {
				this.asking = true;
				new Setting(el).setName('Your name').addText((t) => {
					t.setPlaceholder('For the title page').setValue(s.authorName);
					t.inputEl.dataset.bindersKey = 'author';
					t.inputEl.addEventListener('change', () => { s.authorName = t.getValue().trim(); this.changed(true); });
				});
			}
		} else if (this.kind === 'scrivener') scrivChoices(el, plugin, () => this.changed(true));
		else {
			const o = this.o;
			toggle('title', 'Title', o.title, (v) => { o.title = v; });
			toggle('folders', 'Folders as headings', o.folderHeadings, (v) => { o.folderHeadings = v; });
			toggle('notes', 'Note titles as headings', o.sceneHeadings, (v) => { o.sceneHeadings = v; });
			new Setting(el).setName('Between notes').addDropdown((d) => {
				for (const [value, name] of SEPARATORS) d.addOption(value, name);
				if (!SEPARATORS.some(([v]) => v === o.separator)) d.addOption(o.separator, o.separator);
				d.setValue(o.separator).onChange((v) => { o.separator = v; this.changed(true); });
				d.selectEl.dataset.bindersKey = 'separator';
			});
			toggle('comments', 'Leave out comments', o.stripComments, (v) => { o.stripComments = v; });
			toggle('tabs', 'Take tabs off paragraphs', o.stripTabs, (v) => { o.stripTabs = v; });
			new Setting(el).setName('Save as').setClass('binders-export-saveas').addText((t) => {
				t.setValue(this.path).onChange((v) => { this.path = v.trim(); });
				t.inputEl.addClass('binders-export-path');
				t.inputEl.dataset.bindersKey = 'path';
				t.inputEl.setAttrs({ enterkeyhint: 'done', 'aria-label': 'Save as: a note in this vault, outside the binder' });
				t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); void this.run(); } });
			});
		}
		if (this.noPdf) el.createDiv({ cls: 'binders-export-needs binders-export-nopdf', text: Platform.isMobile ? PDF_ELSEWHERE : `${NO_PDF} This Obsidian can’t print pages to a file; its pages can still be looked at.` });
		this.foot(inner);
		if (held) this.side.querySelector<HTMLElement>(`[data-binders-key="${held}"]`)?.focus();
	}
	private asking = false;

	// ---- the style, and its editor ----

	private styleName(kind = this.kind): string { return familyOf(kind) === 'book' ? this.bookStyle : this.style; }
	private asTyped(): boolean { return familyOf(this.kind) === 'book' && this.plugin.styles.get(this.bookStyle, 'book').values.quotes === 'as typed'; }
	/** A style was chosen: it is this binder's from now on (kept with its Book details, where they can be written). */
	private chooseStyle(family: Family, name: string): void {
		if (family === 'book') this.bookStyle = name; else this.style = name;
		void saveDetails(this.plugin, this.folder, family === 'book' ? { bookStyle: name } : { manuscriptStyle: name }).catch(() => { /* a binder that can't be written: the style holds for this window */ });
		this.changed(this.asTyped() !== (this.quotes === 'as typed'));
	}
	private edit(): void { this.editing = true; this.contents = false; this.draw(); this.preview(); this.side.querySelector<HTMLElement>('[data-binders-key="style-back"]')?.focus(); }
	private editorHost(kind: 'manuscript' | 'ebook' | 'paperback'): StyleEditorHost {
		const family = familyOf(kind);
		return {
			plugin: this.plugin, family, pages: kind !== 'ebook', desktop: this.host,
			name: () => this.styleName(kind),
			choose: (name) => this.chooseStyle(family, name),
			back: () => { this.editing = false; this.draw(); this.side.querySelector<HTMLElement>('[data-binders-key="edit-style"]')?.focus(); },
			preview: Platform.isPhone ? () => this.toPane() : undefined,
		};
	}
	/** A style changed, in the editor or in its file. The preview follows a moment after the last change (a slider
	    dragged draws the book once); quotes typed or typeset is a matter of the text, so the notes are read again. */
	private styleChanged(): void {
		if (!this.contentEl.isConnected || !this.file) return;
		this.editor?.refresh();
		// (a file saved a moment ago is not this style's any more: Export is offered again)
		if (this.saved) { this.saved = null; this.bar(); }
		// (a style that is gone, renamed or deleted elsewhere: the choice falls back with it)
		const now = this.plugin.styles.get(this.styleName(), familyOf(this.kind)).name;
		if (now !== this.styleName()) { if (familyOf(this.kind) === 'book') this.bookStyle = now; else this.style = now; }
		if (!this.editing) this.choices();
		window.clearTimeout(this.timer);
		const reread = this.asTyped() !== (this.quotes === 'as typed');
		this.timer = window.setTimeout(() => { if (reread) void this.load(); else this.preview(); }, 90);
	}

	/** The foot of the choices: where the file goes or went, and what export leaves out or changes. */
	private foot(inner: HTMLElement): void {
		const foot = inner.createDiv({ cls: 'binders-export-foot' }), all = this.host;
		const place = (text: string) => { const p = foot.createDiv({ cls: 'binders-export-place' }); setIcon(p.createSpan({ cls: 'binders-export-place-icon' }), 'folder-open'); p.createSpan({ text }); };
		if (this.kind !== 'note') {
			// (a Scrivener project is a folder: where one can't be written, it is zipped into the vault)
			const kind = this.kind, host = kind === 'scrivener' && !all?.writeFolder ? null : all;
			const kept = host ? placeFor(this.plugin, this.folder, kind, kind === 'scrivener' ? undefined : this.made.extension) : null;
			if (host && (kept || this.saved)) {
				place(kept ? `Saves to ${this.shown(kept)}` : `Saved to ${this.saved?.shown ?? ''}`);
				const label = foot.createEl('label', { cls: 'mod-checkbox binders-export-remember' });
				const box = label.createEl('input', { type: 'checkbox', attr: { 'data-binders-key': 'remember' } });
				box.checked = !!kept;
				box.addEventListener('change', () => { setPlace(this.plugin, this.folder, kind, box.checked ? this.saved?.path ?? kept : null); this.draw(); });
				label.appendText('Save here next time without asking');
			} else if (!host && !this.noPdf) {
				const to = `${exportsFolder(this.plugin, this.folder)}/${kind === 'scrivener' ? scrivFile(this.folder, host) : `${this.fileName()}.${this.made.extension}`}`;
				place(Platform.isMobile ? `Goes to ${to}, then to where you share it` : `Goes to ${to}, in this vault`);
			}
			// (what a style's file has that can't be read is said with the rest: its line opens the editor)
			const styled = kind === 'scrivener' ? [] : this.plugin.styles.get(this.styleName(kind), familyOf(kind)).warnings.map((text) => ({ path: '', name: 'Style', text }));
			const warnings = [...styled, ...(kind === 'scrivener' ? this.scriv?.warnings : this.book?.warnings) ?? []];
			if (warnings.length) {
				const head = foot.createDiv({ cls: 'binders-export-warn-head' });
				setIcon(head.createSpan({ cls: 'binders-export-warn-icon' }), 'alert-triangle');
				head.createSpan({ text: `${warnings.length} ${warnings.length === 1 ? 'thing' : 'things'} to look at` });
				const list = foot.createDiv({ cls: 'binders-export-warnings', attr: { role: 'list' } });
				for (const w of warnings) {
					const row = list.createDiv({ cls: 'binders-export-warn', attr: { role: 'listitem' } }), b = row.createDiv({ cls: 'binders-export-warn-open', attr: { role: 'button', tabindex: '0', 'aria-label': `${w.name}: ${w.text} ${w.path ? 'Open the note.' : 'Edit the style.'}` } });
					b.createDiv({ cls: 'binders-export-warn-note', text: w.name });
					b.createDiv({ cls: 'binders-export-warn-text', text: w.text });
					b.addEventListener('click', () => this.openNote(w.path));
					b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openNote(w.path); } });
				}
			}
		} else {
			const scenes = this.plugin.binders.scenes(this.folder), left = scenes.filter((f) => !isExported(this.plugin, f)).length;
			foot.createDiv({ cls: 'binders-export-needs', text: `The notes’ text only, without properties, as one note. Exporting again replaces it; a note that’s been written in since is asked about first.${left ? ` ${left} ${left === 1 ? 'note is' : 'notes are'} left out.` : ''} Your notes aren’t changed.` });
		}
		if (Platform.isPhone) {
			const row = foot.createDiv({ cls: 'binders-export-phone-row' });
			new ButtonComponent(row).setButtonText('Preview').onClick(() => this.toPane());
			if (this.kind === 'note') new ButtonComponent(row).setButtonText('Copy').onClick(() => void this.copy());
			if (!this.noPdf) new ButtonComponent(row).setButtonText(this.busy ? 'Exporting…' : 'Export').setCta().setDisabled(!!this.busy).onClick(() => void this.run());
		}
	}

	private fileName(): string { return fileName(this.book?.title ?? this.folder.name); }
	/** A place on the disk as it's said: from the vault's folder, when it is in it. */
	private shown(path: string): string { const h = this.host; return h ? shownPath(h, path) : path; }

	/** Whether roles can be overruled from here: not in a Longform project (its note is Longform's), nor in a binder
	    that can't be written. */
	private canOverrule(): boolean { const b = this.plugin.binders.binderOf(this.folder); return !!b && b.kind === 'binder' && !b.problem; }
	/** "Export as" for a row of Contents: the same menu a card has. What it writes is read back by the window's own
	    watch on the binder's notes. */
	private roleMenu(path: string, at: HTMLElement | MouseEvent): void {
		const item = this.app.vault.getAbstractFileByPath(path), binder = this.plugin.binders.binderOf(this.folder);
		if (!item || !binder) return;
		const m = new Menu();
		exportAsItems(this.plugin, m, binder, [item]);
		m.onHide(() => window.setTimeout(() => { if (this.contentEl.isConnected && this.modalEl.doc.activeElement === this.modalEl.doc.body) this.previewEl.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"] .binders-export-role`)?.focus(); }, 0));
		if (at instanceof MouseEvent) m.showAtMouseEvent(at); else { const r = at.getBoundingClientRect(); m.showAtPosition({ x: r.left, y: r.bottom + 2 }); }
	}

	/** The Exports folder in the system's file manager. It is made when a file is first saved there: until then
	    there is nothing to show, and the window says so. */
	private async showExports(): Promise<void> {
		const host = this.host;
		if (!host) return;
		const at = host.join(host.base, ...exportsFolder(this.plugin, this.folder).split('/'));
		const there = await host.stamp(at).catch((): null => null);
		if (there) host.reveal(at); else new Notice('Nothing has been saved there yet: the folder is made when a file first is.');
	}

	private openNote(path: string): void {
		if (!path) { this.edit(); return; }
		const f = this.app.vault.getAbstractFileByPath(path);
		if (!(f instanceof TFile)) return;
		this.close();
		void this.app.workspace.getLeaf('tab').openFile(f);
	}

	// ---- the bar ----

	private bar(): void {
		const k = KINDS.find((x) => x.id === this.kind) ?? KINDS[0], host = this.host, saved = this.saved;
		this.nameEl.setText(k.name);
		const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
		const chapters = this.book?.sections.filter((s) => s.role === 'chapter').length ?? 0;
		this.detailEl.setText(this.kind === 'scrivener' ? scrivDetail(this.scriv) : this.pdf ? (this.book ? `${this.pages == null ? n(this.words, 'word') : n(this.pages, 'page')} · ${(this.kind === 'paperback' ? trimSize(this.pageSize) : paperSize(this.plugin.settings.exportPaper)).name}` : '') : this.kind !== 'note' ? (this.book ? `${n(this.words, 'word')} · ${n(chapters, 'chapter')}` : '') : this.note ? `${n(this.note.scenes, 'note')} · ${n(this.words, 'word')}` : '');
		const focused = this.actions.contains(this.modalEl.doc.activeElement);
		this.actions.empty();
		const status = (text: string) => this.actions.createSpan({ cls: 'binders-export-status', text, attr: { role: 'status', 'aria-live': 'polite' } });
		if (this.busy) {
			status(this.busy);
			new ButtonComponent(this.actions).setButtonText('Cancel').onClick(() => this.cancel());
			if (focused) this.actions.querySelector('button')?.focus();
			return;
		}
		if (saved) {
			status(`Saved to ${saved.shown}`);
			if (saved.where === 'disk' && host) {
				new ButtonComponent(this.actions).setButtonText('Show in folder').onClick(() => host.reveal(saved.path));
				new ButtonComponent(this.actions).setButtonText('Open').onClick(() => host.open(saved.path));
			}
		} else {
			if (this.file && !this.editing) {
				const c = this.actions.createDiv({ cls: 'text-icon-button binders-snapshots-compare', attr: { role: 'button', tabindex: '0', 'aria-pressed': String(this.contents) } });
				setIcon(c.createSpan({ cls: 'text-button-icon' }), 'list');
				c.createSpan({ cls: 'text-button-label', text: 'Contents' });
				c.toggleClass('is-active', this.contents);
				const flip = () => { this.contents = !this.contents; this.bar(); this.preview(); this.actions.querySelector<HTMLElement>('.binders-snapshots-compare')?.focus(); };
				c.addEventListener('click', flip);
				c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
			} else if (this.kind === 'note') new ButtonComponent(this.actions).setButtonText('Copy').setTooltip('Copy the text instead of saving it').onClick(() => void this.copy());
			if (!this.noPdf) new ButtonComponent(this.actions).setButtonText('Export').setCta().onClick(() => void this.run());
		}
		if (this.file || (this.kind === 'scrivener' && (host || saved))) {
			const more = this.actions.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': 'More', role: 'button', tabindex: '0', 'aria-haspopup': 'menu' } });
			setIcon(more, 'more-horizontal');
			const menu = (e: MouseEvent | null) => {
				const m = new Menu();
				if (saved) m.addItem((i) => i.setTitle('Export').setIcon('book-check').onClick(() => void this.run()));
				if (host && !this.noPdf) m.addItem((i) => i.setTitle('Choose where to save...').setIcon('folder-open').onClick(() => void this.run(true)));
				if (host) m.addItem((i) => i.setTitle('Show the Exports folder').setIcon('folder').onClick(() => void this.showExports()));
				if (this.file && !this.editing) m.addItem((i) => i.setTitle('Edit this style').setIcon('sliders-horizontal').onClick(() => this.edit()));
				if (this.file) m.addItem((i) => i.setTitle('Book details...').setIcon('book-open').onClick(() => this.details()));
				if (e) m.showAtMouseEvent(e); else { const r = more.getBoundingClientRect(); m.showAtPosition({ x: r.left, y: r.bottom }); }
			};
			more.addEventListener('click', (e) => menu(e));
			more.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu(null); } });
		}
		if (focused) this.actions.querySelector<HTMLElement>('button, [tabindex="0"]')?.focus();
	}

	// ---- the preview ----

	private preview(): void {
		const el = this.previewEl;
		this.stop?.();
		this.stop = null;
		this.pages = null;
		delete el.dataset.pages;
		el.empty();
		if (this.kind === 'scrivener') { drawScriv(el, this.scriv, { outside: this.plugin.settings.exportOutside, open: (path) => this.openNote(path) }); return; }
		if (this.kind !== 'note') {
			const book = this.book;
			if (!book) { el.createDiv({ cls: 'binders-export-stage' }).createDiv({ cls: 'binders-export-none', text: 'Reading the notes…' }); return; }
			if (this.contents) {
				const side = el.createDiv({ cls: 'binders-export-outline nav-files-container' });
				side.createDiv({ cls: 'binders-export-structure', text: `${STRUCTURES[book.structure][1]}${book.guessed ? ' (read from the binder’s shape)' : ''}.` });
				drawContents(side.createDiv(), book, { open: (path) => this.openNote(path), menu: this.canOverrule() ? (path, at) => this.roleMenu(path, at) : undefined });
			}
			const stage = el.createDiv({ cls: 'binders-export-stage' });
			if (this.pdf) {
				// the very pages that are printed: laid out here as they are for the file
				const { book: whole, spec } = this.paged(book), turn = this.loading;
				// (a typeface that doesn't hold the book's script: said with the other things to look at)
				if (spec.warning && !book.warnings.some((w) => w.text === spec.warning)) { book.warnings.unshift({ path: this.plugin.binders.binderOf(this.folder)?.note.path ?? '', name: 'Book details', text: spec.warning }); this.choices(); }
				const view = showPages(stage, whole, spec, { progress: (pages) => { if (turn === this.loading && this.stop === view.stop) this.detailEl.setText(pages == null ? this.detailEl.getText() : `Laying out the pages… ${pages.toLocaleString()}`); } });
				this.stop = view.stop;
				void view.laid.then((laid) => { if (!laid || this.stop !== view.stop) return; this.pages = laid.pages.length; this.previewEl.dataset.pages = String(laid.pages.length); this.previewEl.dataset.took = String(Math.round(laid.took)); this.bar(); }, (e) => { if (this.stop === view.stop) new Notice(e instanceof Error ? e.message : String(e)); });
				return;
			}
			if (this.kind === 'ebook') {
				const scroll = stage.createDiv({ cls: 'binders-export-scroll', attr: { tabindex: '0', role: 'region', 'aria-label': 'The ebook’s text' } });
				this.stop = drawEbook(scroll, book, dress(scroll, this.plugin.styles.book(this.bookStyle)));
				stage.createDiv({ cls: 'binders-export-caption', text: 'A reader chooses the typeface, the size and the colors. This is the book’s own shape: its headings, breaks and indents.' });
				return;
			}
			const scroll = stage.createDiv({ cls: 'binders-export-scroll', attr: { tabindex: '0', role: 'region', 'aria-label': 'The manuscript’s text' } });
			this.stop = drawManuscript(scroll, book, dress(scroll, this.plugin.styles.manuscript(this.style)), { contact: this.plugin.settings.contact.split(/\r?\n/).map((l) => l.trim()).filter((l) => l), words: this.words });
			runningHead(scroll, book, this.plugin.styles.manuscript(this.style));
			stage.createDiv({ cls: 'binders-export-caption', text: 'The manuscript’s text as it will read, not its pages: Word sets its own lines and turns its own pages.' });
			return;
		}
		const stage = el.createDiv({ cls: 'binders-export-stage' });
		const text = this.note?.text ?? '', cut = text.length > NOTE_SHOWN ? text.slice(0, text.lastIndexOf('\n', NOTE_SHOWN)) : text;
		const body = stage.createDiv({ cls: 'binders-export-note markdown-rendered', attr: { tabindex: '0', role: 'region', 'aria-label': 'The note' } });
		const turn = this.loading;
		void MarkdownRenderer.render(this.app, forRender(cut), body, '', this.rendered).then(() => { if (turn !== this.loading) body.empty(); });
		if (cut !== text) stage.createDiv({ cls: 'binders-export-caption', text: 'The start of the note is shown. The note itself has all of it.' });
	}

	// ---- exporting ----

	/** Cancel, or the window closed: the export under way goes no further, and a PDF being printed is given up. */
	private cancel(): void { this.cancelled = true; this.stopping?.abort(); }

	private say(doing: string | null): void { this.busy = doing; this.bar(); if (Platform.isPhone) this.choices(); }

	private async copy(): Promise<void> {
		try {
			const { text, scenes } = await oneNoteText(this.plugin, this.folder, this.o);
			await navigator.clipboard.writeText(text);
			new Notice(`Copied ${scenes.toLocaleString()} ${scenes === 1 ? 'note' : 'notes'} as one text.`);
			this.close();
		} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
	}

	/** Export: the notes are read afresh, the file is made, and it goes where it goes. `ask`: choose the place again. */
	private async run(ask = false): Promise<void> {
		if (this.busy) return;
		this.cancelled = false;
		const stopping = this.stopping = new AbortController();
		try {
			this.say('Reading the notes…');
			await this.reading;
			if (this.kind === 'note') {
				const { text, scenes } = await oneNoteText(this.plugin, this.folder, this.o);
				if (this.cancelled) return;
				// (a name that can't be used is said as it is: nothing went wrong, the writer is asked for another)
				try { const made = await writeOneNote(this.plugin, this.folder, this.path, text, scenes); if (made) { noteLast(this.plugin, this.folder, 'note', { where: 'vault', path: made.path }); this.close(); } } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
				return;
			}
			if (this.kind === 'scrivener') {
				const saved = await exportScriv(this.plugin, this.host, this.folder, { ask, say: (doing) => this.say(doing), cancelled: () => this.cancelled, made: (p) => { this.scriv = p; this.words = p.words; } });
				if (!saved) return;
				this.saved = saved;
				noteLast(this.plugin, this.folder, 'scrivener', saved);
				new Notice(`Exported “${this.folder.name}” to ${saved.shown}.`);
				return;
			}
			const kind = this.kind, pdf = this.pdf, { extension, type, mime } = this.made;
			if (this.noPdf) throw new Error(NO_PDF);
			const { book, words } = await readBook(this.plugin, this.folder, kind !== 'manuscript' || this.matter, kind !== 'manuscript', this.asTyped(), kind === 'ebook');
			if (this.cancelled) return;
			this.book = book; this.words = words;
			this.say('Writing the file…');
			// (a breath, so the words above are on screen before a long book is written)
			await new Promise((r) => window.setTimeout(r, 0));
			let data: Uint8Array;
			if (pdf) {
				const { book: whole, spec } = this.paged(book);
				const made = await pagesPdf(this.plugin, whole, spec, { say: (doing) => this.say(doing), cancelled: () => this.cancelled, stop: stopping.signal });
				if (!made) return;
				data = made.data;
			} else data = kind === 'ebook' ? ebook(this.plugin, book, this.bookStyle) : manuscript(this.plugin, book, words, this.style);
			if (this.cancelled) return;
			this.say('Saving…');
			const name = this.fileName();
			const saved = await save(this.plugin, this.host, data, {
				folder: this.folder, kind, name, extension, type, ask,
				replace: (shown) => confirm(this.app, { title: 'Replace this file', text: `“${shown}” is already there, and isn’t a file this export made (or it has been changed since). Replace it?`, cta: 'Replace' }),
			});
			if (!saved) return;
			this.saved = saved;
			noteLast(this.plugin, this.folder, kind, saved);
			new Notice(`Exported “${book.title}” to ${saved.shown}.`);
			if (saved.where === 'vault' && Platform.isMobile) await share(data, `${name}.${extension}`, mime);
		} catch (e) {
			// (nothing half-written is left: a file is written whole beside its place, then given its name)
			const why = e instanceof Error ? e.message : String(e);
			new Notice(`The export didn’t finish. ${why}`, 10000);
		} finally {
			if (this.stopping === stopping) this.stopping = null;
			this.busy = null;
			if (this.contentEl.isConnected) this.draw();
		}
	}
}
