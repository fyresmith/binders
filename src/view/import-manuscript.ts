import { ButtonComponent, FuzzySuggestModal, Modal, Notice, Setting, TFile } from 'obsidian';
import type BindersPlugin from '../main';
import type { Choices, Role, Signal } from '../import/detect';
import { planManuscript, type ManuscriptRead } from '../import/manuscript';
import { MAX_BYTES, zipSource } from '../import/source';
import { readProject } from '../import/scriv/project';
import { decodeText, scanMarkdown, scanPlain } from '../import/text';
import { saveOpen } from '../scenes';
import { ImportWindow, message, type ImportJob } from './import-window';
import { scrivenerJob } from './import-scrivener';
import { buttonRow, cancelButton } from './modals';

/* "Import a manuscript": a Markdown note or a text file made into a new binder, split where its chapters, parts and
   scenes start (import/detect.ts). Two dialogs, one after the other.
     - First one of Obsidian's small ones (here), to choose the text: a file from the device, through the browser's
       own chooser (the one way there is on a phone), or a note of this vault. A zipped Scrivener backup chosen here
       goes on to the Scrivener import.
     - Then the shared second dialog (view/import-window.ts) over this file's job: where chapters start, what each
       level of heading is, scene breaks and what scenes are called.
   Nothing is written until Import, and nothing but new files in a new folder then (import/vault.ts). The text, a note
   or a file, is only ever read. It is offered in the command palette, and on a note outside a binder. */

/** The most a file may be, in bytes: it is held whole while it is read and planned. */
const MAX_FILE = 64 * 1024 * 1024;
/** Word and the like, not yet: said with what to do meanwhile. */
const LATER = /\.(docx?|dotx|odt|rtf|pages|epub|pdf|mobi|azw3?|wpd)$/i;

const SIGNALS: Record<Signal, (count: number) => string> = {
	headings: (c) => `Headings (${c})`,
	titles: (c) => `Lines like “Chapter 12” (${c})`,
	pages: (c) => `Page breaks (${c})`,
	none: () => 'Nowhere',
};
const ROLES: [Role, string][] = [['part', 'Part'], ['chapter', 'Chapter'], ['scene', 'Scene'], ['text', 'Keep in the text']];

/** What this import is to the shared window: where chapters start, and the rest of the rules, drawn as rows. */
function manuscriptJob(plugin: BindersPlugin, read: ManuscriptRead, source: 'note' | 'file', unchanged: () => Promise<boolean>): ImportJob {
	const choices: Choices = { signal: null, roles: new Map(), breaks: 'new' };
	let scenes: 'words' | 'numbers' = 'words', last = planManuscript(read, { name: read.name, parent: '', settings: plugin.settings, choices, scenes });
	return {
		name: last.title ?? read.name,
		plan: (o) => {
			last = planManuscript(read, { name: o.name, parent: o.parent, settings: o.settings, choices, scenes });
			return last.plan;
		},
		rows: (r) => {
			const { found } = last;
			const dropdown = (key: string, name: string, options: [string, string, boolean?][], value: string, set: (v: string) => void, desc = '') => {
				const s = new Setting(r.el).setName(name);
				if (desc) s.setDesc(desc);
				s.addDropdown((d) => {
					for (const [v, label, off] of options) {
						d.addOption(v, label);
						if (off) d.selectEl.querySelector<HTMLOptionElement>(`option[value="${v}"]`)?.setAttribute('disabled', '');
					}
					d.setValue(value).setDisabled(r.busy).onChange((v) => { set(v); r.replan(); });
					d.selectEl.dataset.bindersKey = key;
				});
			};
			dropdown('signal', 'Chapters start at', (Object.keys(SIGNALS) as Signal[]).map((k) => [k, SIGNALS[k](found.counts[k]), k !== 'none' && !found.counts[k]]), found.signal, (v) => { choices.signal = v as Signal; });
			// one row for each level of heading found, while headings are what chapters start at
			if (found.signal === 'headings') {
				for (const l of found.levels) {
					dropdown(`level-${l.level}`, `Heading ${l.level} (${l.count})`, ROLES, l.role, (v) => { choices.roles = new Map(choices.roles).set(l.level, v as Role); });
				}
			}
			if (found.breakStyle !== 'none') {
				dropdown('breaks', `Scene breaks (${found.breaks})`, [['new', 'Start a new note'], ['keep', 'Keep in the text']], choices.breaks, (v) => { choices.breaks = v as 'new' | 'keep'; });
			}
			if (found.breaks || found.levels.some((l) => l.role === 'scene')) {
				dropdown('scenes', 'Name scenes', [['words', 'By their first words'], ['numbers', 'Scene 1, Scene 2']], scenes, (v) => { scenes = v as 'words' | 'numbers'; });
			}
		},
		needs: () => `The ${source} itself isn’t changed.`,
		unchanged,
		checking: `Checking the ${source}…`,
		changed: 'The note has changed since it was read. Choose it again.',
		another: { label: 'Choose another file', row: 'Text', open: () => new ImportManuscriptModal(plugin).open() },
		caption: 'The text comes across as it was written. A heading that a chapter or part is named from is its name, and not in the text.',
		empty: 'This text has nothing to bring in.',
	};
}

/** A note of this vault that isn't in a binder, as the dialog's list. */
class NotePicker extends FuzzySuggestModal<TFile> {
	constructor(private plugin: BindersPlugin, private choose: (f: TFile) => void) {
		super(plugin.app);
		this.setPlaceholder('Choose a note');
	}
	getItems(): TFile[] { return this.app.vault.getMarkdownFiles().filter((f) => !this.plugin.binders.binderOf(f)); }
	getItemText(f: TFile): string { return f.path.replace(/\.md$/i, ''); }
	onChooseItem(f: TFile): void { this.choose(f); }
}

/** A note of this vault read for import, and its second dialog opened on it. The note is only read. */
export async function importNote(plugin: BindersPlugin, file: TFile): Promise<void> {
	const { app } = plugin;
	// (what is typed in an open note is saved first, so the note read is the note as it is)
	await saveOpen(app, [file]);
	const stat = { mtime: file.stat.mtime, size: file.stat.size };
	const bytes = new Uint8Array(await app.vault.readBinary(file));
	const { text, said } = decodeText(bytes);
	if (!text.trim()) throw new Error('This note has no text.');
	const scan = scanMarkdown(text);
	scan.said.push(...said);
	const read: ManuscriptRead = { name: file.basename, file: file.name, origin: { path: file.path }, scan };
	const unchanged = () => Promise.resolve(app.vault.getAbstractFileByPath(file.path) === file && file.stat.mtime === stat.mtime && file.stat.size === stat.size);
	new ImportWindow(plugin, manuscriptJob(plugin, read, 'note', unchanged)).open();
}

/** The first dialog: which text. */
export class ImportManuscriptModal extends Modal {
	private said!: HTMLElement;
	private buttons: ButtonComponent[] = [];
	private busy = false;

	constructor(private plugin: BindersPlugin) { super(plugin.app); }

	onOpen(): void {
		this.setTitle('Import a manuscript');
		this.modalEl.addClass('binders-import');
		this.contentEl.createEl('p', { text: 'Makes a new binder in this vault from a Markdown note or a text file, split where its chapters start. The file itself isn’t changed.' });
		this.contentEl.createEl('p', { cls: 'binders-import-how', text: 'A Scrivener backup, zipped, is imported as a Scrivener project.' });
		this.said = this.contentEl.createDiv({ cls: 'binders-ask-error binders-import-said', attr: { role: 'status', 'aria-live': 'polite' } });
		const row = buttonRow(this);
		const file = new ButtonComponent(row).setButtonText('Choose a file...').setCta().onClick(() => this.file());
		this.buttons.push(file);
		if (this.app.vault.getMarkdownFiles().some((f) => !this.plugin.binders.binderOf(f))) this.buttons.push(new ButtonComponent(row).setButtonText('Choose from this vault...').onClick(() => this.vault()));
		cancelButton(row, this);
	}

	onClose(): void { this.contentEl.empty(); }

	/** What the dialog is doing, or why it couldn't: one line, under what it asks. */
	private say(doing: string | null, why = ''): void {
		this.busy = !!doing;
		this.said.setText(doing ?? why);
		this.said.toggleClass('is-doing', !!doing);
		for (const b of this.buttons) b.setDisabled(this.busy);
	}

	/** A file from the device, through the browser's own chooser. */
	private file(): void {
		if (this.busy) return;
		const input = this.contentEl.createEl('input', { type: 'file', attr: { accept: '.md,.markdown,.txt,.text,.zip,text/plain,text/markdown,application/zip', hidden: '' } });
		input.addEventListener('change', () => {
			const file = input.files?.[0];
			input.remove();
			if (file) void this.read(file);
		}, { once: true });
		input.click();
	}

	private vault(): void {
		if (this.busy) return;
		new NotePicker(this.plugin, (f) => void this.note(f)).open();
	}

	private async note(file: TFile): Promise<void> {
		this.say('Reading the note…');
		try {
			await new Promise((r) => window.setTimeout(r, 0));
			if (!this.contentEl.isConnected) return;
			this.close();
			await importNote(this.plugin, file);
		} catch (e) { if (this.contentEl.isConnected) this.say(null, message(e)); else new Notice(message(e), 10000); }
	}

	/** A file read, and the second dialog opened on it. What can't be read is said here, and this one stays. */
	private async read(file: File): Promise<void> {
		if (this.busy) return;
		this.say('Reading the file…');
		try {
			await new Promise((r) => window.setTimeout(r, 0));
			if (LATER.test(file.name)) throw new Error('This kind of file can’t be imported yet. In the program that made it, save it as plain text (.txt), and choose that.');
			if (file.size > MAX_FILE) throw new Error('This file is larger than import can hold (64 MB).');
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (!this.contentEl.isConnected) return;
			// a zip is a Scrivener backup, the one kind of zip there is to read here
			if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
				if (file.size > MAX_BYTES) throw new Error('This backup is larger than the 256 MB import limit.');
				const project = readProject(zipSource(bytes, file.name));
				this.close();
				new ImportWindow(this.plugin, scrivenerJob(this.plugin, project)).open();
				return;
			}
			if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('This is an older Word file, or one locked with a password. Save it from Word as plain text (.txt), and choose that.');
			const { text, said } = decodeText(bytes);
			if (!text.trim()) throw new Error('This file has no text.');
			const markdown = /\.(md|markdown)$/i.test(file.name);
			const scan = markdown ? scanMarkdown(text) : scanPlain(text, { tabs: this.plugin.settings.tabParagraphs });
			scan.said.push(...said);
			const read: ManuscriptRead = { name: file.name.replace(/\.[^.]+$/, '') || file.name, file: file.name, origin: { bytes }, scan };
			this.close();
			new ImportWindow(this.plugin, manuscriptJob(this.plugin, read, 'file', () => Promise.resolve(true))).open();
		} catch (e) { this.say(null, message(e)); }
	}
}
