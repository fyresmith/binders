import { ButtonComponent, Component, MarkdownRenderer, Menu, Modal, Notice, Platform, Setting, TFile, setIcon, type TFolder } from 'obsidian';
import type BindersPlugin from '../main';
import { DOCX_MIME, KINDS, exportsFolder, fileName, manuscript, placeFor, readBook, save, setPlace, share, shownPath, type Kind, type Saved } from '../export/export';
import { MANUSCRIPT_STYLES, manuscriptStyle } from '../export/docx-parts';
import { STRUCTURES, type Book } from '../export/model';
import { oneNoteText, isExported, oneNotePath, writeOneNote } from '../scenes';
import { COMPILE_DEFAULTS, forRender, type CompileOptions } from '../scene-text';
import type { ScrivProject } from '../export/scriv/project';
import { readScriv } from '../export/scriv/vault';
import { drawManuscript, drawOutline } from './export-preview';
import { drawScriv, exportScriv, scrivChoices, scrivDetail, scrivFile } from './export-scriv';
import { historyLook } from './internals';
import { confirm } from './modals';
import { countWords } from './words';

/* The Export window: Obsidian's two-pane dialog, the one File recovery and Snapshots use. On the left what to make
   (the kinds that exist so far: a manuscript, and one note), the chosen kind's few choices, where the file goes and
   what export has to leave out or change. On the right what is being made, "Contents", Export, and the preview. A
   phone has the choices first and the preview second. The design is docs/export.md; what it does is in
   export/export.ts, and nothing here writes to a note. */

const SEPARATORS: [string, string][] = [['* * *', '* * *'], ['#', '#'], ['---', '---'], ['', 'A blank line']];
/** How much of one note is drawn in the preview: past this a renderer holds the window up. The note has it all. */
const NOTE_SHOWN = 120000;

export class ExportModal extends Modal {
	private kind: Kind;
	private style: string;
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
	private saved: Saved | null = null;
	private loading = 0;
	private stop: (() => void) | null = null;
	private rendered = new Component();
	private timer = 0;

	constructor(private plugin: BindersPlugin, private folder: TFolder) {
		super(plugin.app);
		const s = plugin.settings;
		this.kind = s.exportKind;
		this.style = manuscriptStyle(s.exportStyle).name;
		this.matter = s.exportMatter;
		this.o = { ...COMPILE_DEFAULTS, ...s.compile };
		this.path = oneNotePath(plugin, folder);
	}

	private get host() { return this.plugin.exportHost.desktop(this.app); }
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
		this.draw();
		void this.load();
		// (a phone is touched, not tabbed through: nothing is ringed as it opens)
		if (!Platform.isPhone) window.setTimeout(() => this.side.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus(), 0);
	}

	onClose(): void {
		this.loading++;
		this.cancelled = true;
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
			if (this.kind === 'manuscript') {
				const { book, words } = await readBook(this.plugin, this.folder, this.matter);
				if (turn !== this.loading) return;
				this.book = book; this.words = words;
			} else if (this.kind === 'scrivener') {
				const { project } = await readScriv(this.plugin, this.folder, { outside: this.plugin.settings.exportOutside, snapshots: this.plugin.settings.exportSnapshots });
				if (turn !== this.loading) return;
				this.scriv = project; this.words = project.words;
			} else {
				const note = await oneNoteText(this.plugin, this.folder, this.o);
				if (turn !== this.loading) return;
				this.note = note; this.words = countWords(note.text);
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
		this.side.empty();
		const inner = this.side.createDiv({ cls: 'modal-sidebar-inner' });
		if (!Platform.isPhone) inner.createDiv({ cls: 'binders-snapshots-head' }).createDiv({ cls: 'binders-snapshots-of', text: this.folder.name });
		const list = inner.createDiv({ cls: 'modal-sidebar-list binders-export-kinds', attr: { role: 'listbox', 'aria-label': 'What to make' } });
		const items: HTMLElement[] = [];
		for (const k of KINDS) {
			const on = k.id === this.kind;
			const el = list.createDiv({ cls: 'modal-sidebar-list-item file-recovery-list-item-header tappable binders-snapshots-item', attr: { role: 'option', tabindex: on ? '0' : '-1', 'aria-selected': String(on), 'aria-label': `${k.name}: ${k.detail}`, 'data-binders-key': `kind-${k.id}` } });
			el.toggleClass('is-active', on);
			const d = el.createDiv({ cls: 'modal-sidebar-list-item-details' });
			d.createDiv({ cls: 'binders-snapshots-item-name', text: k.name });
			d.createDiv({ cls: 'binders-snapshots-item-detail', text: k.detail });
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
			new Setting(el).setName('Style').addDropdown((d) => {
				for (const st of MANUSCRIPT_STYLES) d.addOption(st.name, st.name);
				d.setValue(this.style).onChange((v) => { this.style = v; this.changed(false); });
				d.selectEl.dataset.bindersKey = 'style';
			});
			toggle('matter', 'Front and back matter', this.matter, (v) => { this.matter = v; });
			// the one thing Binders can't know: asked for here until it is said (and kept in Binders' settings)
			if (!this.book?.author && !s.authorName.trim() || this.asking) {
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
		this.foot(inner);
		if (held) this.side.querySelector<HTMLElement>(`[data-binders-key="${held}"]`)?.focus();
	}
	private asking = false;

	/** The foot of the choices: where the file goes or went, and what export leaves out or changes. */
	private foot(inner: HTMLElement): void {
		const foot = inner.createDiv({ cls: 'binders-export-foot' }), all = this.host;
		const place = (text: string) => { const p = foot.createDiv({ cls: 'binders-export-place' }); setIcon(p.createSpan({ cls: 'binders-export-place-icon' }), 'folder-open'); p.createSpan({ text }); };
		if (this.kind !== 'note') {
			// (a Scrivener project is a folder: where one can't be written, it is zipped into the vault)
			const kind = this.kind, host = kind === 'scrivener' && !all?.writeFolder ? null : all;
			const kept = host ? placeFor(this.plugin, this.folder, kind) : null;
			if (host && (kept || this.saved)) {
				place(kept ? `Saves to ${this.shown(kept)}` : `Saved to ${this.saved?.shown ?? ''}`);
				const label = foot.createEl('label', { cls: 'mod-checkbox binders-export-remember' });
				const box = label.createEl('input', { type: 'checkbox', attr: { 'data-binders-key': 'remember' } });
				box.checked = !!kept;
				box.addEventListener('change', () => { setPlace(this.plugin, this.folder, kind, box.checked ? this.saved?.path ?? kept : null); this.draw(); });
				label.appendText('Save here next time without asking');
			} else if (!host) {
				const to = `${exportsFolder(this.plugin, this.folder)}/${kind === 'scrivener' ? scrivFile(this.folder, host) : `${this.fileName()}.docx`}`;
				place(Platform.isMobile ? `Goes to ${to}, then to where you share it` : `Goes to ${to}, in this vault`);
			}
			const warnings = (kind === 'scrivener' ? this.scriv?.warnings : this.book?.warnings) ?? [];
			if (warnings.length) {
				const head = foot.createDiv({ cls: 'binders-export-warn-head' });
				setIcon(head.createSpan({ cls: 'binders-export-warn-icon' }), 'alert-triangle');
				head.createSpan({ text: `${warnings.length} ${warnings.length === 1 ? 'thing' : 'things'} to look at` });
				const list = foot.createDiv({ cls: 'binders-export-warnings', attr: { role: 'list' } });
				for (const w of warnings) {
					const row = list.createDiv({ cls: 'binders-export-warn', attr: { role: 'listitem' } }), b = row.createDiv({ cls: 'binders-export-warn-open', attr: { role: 'button', tabindex: '0', 'aria-label': `${w.name}: ${w.text} Open the note.` } });
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
			new ButtonComponent(row).setButtonText(this.busy ? 'Exporting…' : 'Export').setCta().setDisabled(!!this.busy).onClick(() => void this.run());
		}
	}

	private fileName(): string { return fileName(this.book?.title ?? this.folder.name); }
	/** A place on the disk as it's said: from the vault's folder, when it is in it. */
	private shown(path: string): string { const h = this.host; return h ? shownPath(h, path) : path; }

	private openNote(path: string): void {
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
		this.detailEl.setText(this.kind === 'scrivener' ? scrivDetail(this.scriv) : this.kind === 'manuscript' ? (this.book ? `${n(this.words, 'word')} · ${n(chapters, 'chapter')}` : '') : this.note ? `${n(this.note.scenes, 'note')} · ${n(this.words, 'word')}` : '');
		const focused = this.actions.contains(this.modalEl.doc.activeElement);
		this.actions.empty();
		const status = (text: string) => this.actions.createSpan({ cls: 'binders-export-status', text, attr: { role: 'status', 'aria-live': 'polite' } });
		if (this.busy) {
			status(this.busy);
			new ButtonComponent(this.actions).setButtonText('Cancel').onClick(() => { this.cancelled = true; });
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
			if (this.kind === 'manuscript') {
				const c = this.actions.createDiv({ cls: 'text-icon-button binders-snapshots-compare', attr: { role: 'button', tabindex: '0', 'aria-pressed': String(this.contents) } });
				setIcon(c.createSpan({ cls: 'text-button-icon' }), 'list');
				c.createSpan({ cls: 'text-button-label', text: 'Contents' });
				c.toggleClass('is-active', this.contents);
				const flip = () => { this.contents = !this.contents; this.bar(); this.preview(); this.actions.querySelector<HTMLElement>('.binders-snapshots-compare')?.focus(); };
				c.addEventListener('click', flip);
				c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
			} else if (this.kind === 'note') new ButtonComponent(this.actions).setButtonText('Copy').setTooltip('Copy the text instead of saving it').onClick(() => void this.copy());
			new ButtonComponent(this.actions).setButtonText('Export').setCta().onClick(() => void this.run());
		}
		if (this.kind !== 'note' && (host || saved)) {
			const more = this.actions.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': 'More', role: 'button', tabindex: '0', 'aria-haspopup': 'menu' } });
			setIcon(more, 'more-horizontal');
			const menu = (e: MouseEvent | null) => {
				const m = new Menu();
				if (saved) m.addItem((i) => i.setTitle('Export').setIcon('book-check').onClick(() => void this.run()));
				if (host) m.addItem((i) => i.setTitle('Choose where to save...').setIcon('folder-open').onClick(() => void this.run(true)));
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
		el.empty();
		if (this.kind === 'scrivener') { drawScriv(el, this.scriv, { outside: this.plugin.settings.exportOutside, open: (path) => this.openNote(path) }); return; }
		if (this.kind === 'manuscript') {
			const book = this.book;
			if (!book) { el.createDiv({ cls: 'binders-export-stage' }).createDiv({ cls: 'binders-export-none', text: 'Reading the notes…' }); return; }
			if (this.contents) {
				const side = el.createDiv({ cls: 'binders-export-outline nav-files-container' });
				side.createDiv({ cls: 'binders-export-structure', text: `${STRUCTURES[book.structure][1]}${book.guessed ? ' (read from the binder’s shape)' : ''}.` });
				drawOutline(side.createDiv(), book, (path) => this.openNote(path));
			}
			const stage = el.createDiv({ cls: 'binders-export-stage' });
			const scroll = stage.createDiv({ cls: 'binders-export-scroll', attr: { tabindex: '0', role: 'region', 'aria-label': 'The manuscript’s text' } });
			this.stop = drawManuscript(scroll, book, manuscriptStyle(this.style), { contact: this.plugin.settings.contact.split(/\r?\n/).map((l) => l.trim()).filter((l) => l), words: this.words });
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
		try {
			this.say('Reading the notes…');
			await this.reading;
			if (this.kind === 'note') {
				const { text, scenes } = await oneNoteText(this.plugin, this.folder, this.o);
				if (this.cancelled) return;
				// (a name that can't be used is said as it is: nothing went wrong, the writer is asked for another)
				try { if (await writeOneNote(this.plugin, this.folder, this.path, text, scenes)) this.close(); } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
				return;
			}
			if (this.kind === 'scrivener') {
				const saved = await exportScriv(this.plugin, this.host, this.folder, { ask, say: (doing) => this.say(doing), cancelled: () => this.cancelled, made: (p) => { this.scriv = p; this.words = p.words; } });
				if (!saved) return;
				this.saved = saved;
				new Notice(`Exported “${this.folder.name}” to ${saved.shown}.`);
				return;
			}
			const { book, words } = await readBook(this.plugin, this.folder, this.matter);
			if (this.cancelled) return;
			this.book = book; this.words = words;
			this.say('Writing the file…');
			// (a breath, so the words above are on screen before a long book is written)
			await new Promise((r) => window.setTimeout(r, 0));
			const data = manuscript(this.plugin, book, words, this.style);
			if (this.cancelled) return;
			this.say('Saving…');
			const name = this.fileName();
			const saved = await save(this.plugin, this.host, data, {
				folder: this.folder, kind: 'manuscript', name, extension: 'docx', type: 'Word document', ask,
				replace: (shown) => confirm(this.app, { title: 'Replace this file', text: `“${shown}” is already there, and isn’t a file this export made (or it has been changed since). Replace it?`, cta: 'Replace' }),
			});
			if (!saved) return;
			this.saved = saved;
			new Notice(`Exported “${book.title}” to ${saved.shown}.`);
			if (saved.where === 'vault' && Platform.isMobile) await share(data, `${name}.docx`, DOCX_MIME);
		} catch (e) {
			// (nothing half-written is left: a file is written whole beside its place, then given its name)
			const why = e instanceof Error ? e.message : String(e);
			new Notice(`The export didn’t finish. ${why}`, 10000);
		} finally {
			this.busy = null;
			if (this.contentEl.isConnected) this.draw();
		}
	}
}
