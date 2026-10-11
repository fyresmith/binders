import { ButtonComponent, FuzzySuggestModal, Modal, Notice, Setting, TFile } from 'obsidian';
import type BindersPlugin from '../main';
import type { Choices, Role, Signal } from '../import/detect';
import { actionsFor, applyAction, noEdits, planManuscript, type ManuscriptRead } from '../import/manuscript';
import { readWord } from '../import/docx';
import { OLDER } from '../docx/package';
import { MAX_BYTES, zipSource } from '../import/source';
import { readProject } from '../import/scriv/project';
import { decodeText, scanMarkdown, scanPlain } from '../import/text';
import { saveOpen } from '../scenes';
import { ImportWindow, message, type ImportJob } from './import-window';
import { scrivenerJob } from './import-scrivener';
import { ask, buttonRow, cancelButton } from './modals';

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
/** Other formats, not yet: said with what to do meanwhile. */
const LATER = /\.(odt|rtf|pages|epub|pdf|mobi|azw3?|wpd)$/i;
const WORD = /\.(docx|docm|dotx)$/i;

const SIGNALS: Record<Signal, (count: number) => string> = {
	headings: (c) => `Headings (${c})`,
	titles: (c) => `Lines like “Chapter 12” (${c})`,
	pages: (c) => `Page breaks (${c})`,
	none: () => 'Nowhere',
};
const ROLES: [Role, string][] = [['part', 'Part'], ['chapter', 'Chapter'], ['scene', 'Scene'], ['text', 'Keep in the text']];

/** What this import is to the shared window: where chapters start, and the rest of the rules, drawn as rows. */
export function manuscriptJob(plugin: BindersPlugin, first: ManuscriptRead, source: 'note' | 'file', unchanged: () => Promise<boolean>): ImportJob {
	let read = first;
	const choices: Choices = { signal: null, roles: new Map(), breaks: 'new' };
	// what a Word file carries, chosen: the file is read again, and what was put right by hand (by unit) is let go
	const word = { revisions: 'final' as 'final' | 'original', comments: true, underline: 'plain' as 'plain' | 'italic' };
	const again = (): void => { read = first.reread?.(word) ?? read; edits = noEdits(); };
	let scenes: 'words' | 'numbers' = 'words', edits = noEdits(), last = planManuscript(read, { name: read.name, parent: '', settings: plugin.settings, choices, scenes, edits });
	return {
		name: last.title ?? read.name,
		plan: (o) => {
			last = planManuscript(read, { name: o.name, parent: o.parent, settings: o.settings, choices, scenes, edits });
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
			// what only a Word file has, each shown only when this one does
			const w = first.word;
			if (w?.revisions) dropdown('revisions', 'Tracked changes', [['final', 'Accept all'], ['original', 'Reject all']], word.revisions, (v) => { const was = word.revisions; word.revisions = v as 'final' | 'original'; try { again(); } catch (e) { word.revisions = was; new Notice(message(e)); } });
			if (w?.comments) r.toggle('comments', 'Comments', word.comments, (v) => { word.comments = v; again(); });
			if (w?.hasUnderline && w.hasItalic) dropdown('underline', 'Underlined text', [['plain', 'Leave plain'], ['italic', 'Make italic']], word.underline, (v) => { word.underline = v as 'plain' | 'italic'; again(); });
		},
		needs: () => `The ${source} itself isn’t changed.`,
		unchanged,
		checking: `Checking the ${source}…`,
		changed: `The ${source} has changed since it was read. Choose it again.`,
		another: { label: 'Choose another file', row: 'Text', open: () => new ImportManuscriptModal(plugin).open() },
		caption: 'The text comes across as it was written. A heading that a chapter or part is named from is its name, and not in the text.',
		empty: 'This text has nothing to bring in.',
		// putting the preview right by hand: each is a change to where the text is cut, so no word goes or comes twice
		rowActions: (note) => actionsFor(note).map((a) => {
			if (a === 'join') return { title: 'Join with the one before', icon: 'merge', run: () => { edits = applyAction(edits, note, { kind: 'join' }); return Promise.resolve(); } };
			if (a === 'rename') return { title: 'Rename...', icon: 'pencil', run: () => ask(plugin.app, { title: 'Rename', placeholder: 'Name', cta: 'Rename', value: note.title }).then((name) => { if (name !== null) edits = applyAction(edits, note, { kind: 'rename', name }); }) };
			return { title: `Make this a ${a}`, icon: a === 'part' ? 'folder' : a === 'chapter' ? 'book' : 'file-text', run: () => { edits = applyAction(edits, note, { kind: 'make', level: a }); return Promise.resolve(); } };
		}),
		paragraphs: (note) => {
			if (!note.units) return null;
			const { units, text } = read.scan, out: { unit: number; text: string }[] = note.prefix ? [{ unit: -1, text: note.prefix.trim() }] : [];
			for (let i = note.units[0]; i < note.units[1]; i++) out.push({ unit: i, text: text.slice(units[i].start, units[i].end) });
			return out;
		},
		startHere: (unit, note) => { edits = applyAction(edits, note, { kind: 'start', unit }); },
	};
}

/** A note of this vault that isn't in a binder, as the dialog's list. */
class NotePicker extends FuzzySuggestModal<TFile> {
	constructor(private plugin: BindersPlugin, private choose: (f: TFile) => void) {
		super(plugin.app);
		this.setPlaceholder('Choose a note or a .docx file');
	}
	getItems(): TFile[] { return [...this.app.vault.getMarkdownFiles().filter((f) => !this.plugin.binders.binderOf(f)), ...this.app.vault.getFiles().filter((f) => f.extension === 'docx')]; }
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

/** A Word file of this vault read for import, and its second dialog opened on it. The file is only read. */
export async function importDocx(plugin: BindersPlugin, file: TFile): Promise<void> {
	const { app } = plugin;
	const stat = { mtime: file.stat.mtime, size: file.stat.size };
	if (file.stat.size > MAX_FILE) throw new Error('This file is larger than import can hold (64 MB).');
	const bytes = new Uint8Array(await app.vault.readBinary(file));
	await new Promise((r) => window.setTimeout(r, 0));
	const read = readWord(bytes, file.name, { path: file.path }, { tabs: plugin.settings.tabParagraphs });
	const unchanged = () => Promise.resolve(app.vault.getAbstractFileByPath(file.path) === file && file.stat.mtime === stat.mtime && file.stat.size === stat.size);
	new ImportWindow(plugin, manuscriptJob(plugin, read, 'file', unchanged)).open();
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
		this.contentEl.createEl('p', { text: 'Makes a new binder in this vault from a .docx file, a Markdown note or a text file, split where its chapters start. The file itself isn’t changed.' });
		this.contentEl.createEl('p', { cls: 'binders-import-how', text: 'A Scrivener backup, zipped, is imported as a Scrivener project.' });
		this.said = this.contentEl.createDiv({ cls: 'binders-ask-error binders-import-said', attr: { role: 'status', 'aria-live': 'polite' } });
		const row = buttonRow(this);
		const file = new ButtonComponent(row).setButtonText('Choose a file...').setCta().onClick(() => this.file());
		this.buttons.push(file);
		if (this.app.vault.getFiles().some((f) => (f.extension === 'md' && !this.plugin.binders.binderOf(f)) || f.extension === 'docx')) this.buttons.push(new ButtonComponent(row).setButtonText('Choose from this vault...').onClick(() => this.vault()));
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
		const input = this.contentEl.createEl('input', { type: 'file', attr: { accept: '.md,.markdown,.txt,.text,.docx,.zip,text/plain,text/markdown,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: '' } });
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
		this.say('Reading the file…');
		try {
			await new Promise((r) => window.setTimeout(r, 0));
			if (!this.contentEl.isConnected) return;
			if (file.extension === 'docx') await importDocx(this.plugin, file); else await importNote(this.plugin, file);
			this.close();
		} catch (e) { if (this.contentEl.isConnected) this.say(null, message(e)); else new Notice(message(e), 10000); }
	}

	/** A file read, and the second dialog opened on it. What can't be read is said here, and this one stays. */
	private async read(file: File): Promise<void> {
		if (this.busy) return;
		this.say('Reading the file…');
		try {
			await new Promise((r) => window.setTimeout(r, 0));
			if (LATER.test(file.name)) throw new Error('This kind of file can’t be imported yet. In the program that made it, save it as a Word file (.docx), and choose that.');
			if (file.size > MAX_FILE) throw new Error('This file is larger than import can hold (64 MB).');
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (!this.contentEl.isConnected) return;
			if (WORD.test(file.name)) {
				const read = readWord(bytes, file.name, { bytes }, { tabs: this.plugin.settings.tabParagraphs });
				this.close();
				new ImportWindow(this.plugin, manuscriptJob(this.plugin, read, 'file', () => Promise.resolve(true))).open();
				return;
			}
			// any other zip is a Scrivener backup, the one other kind there is to read here
			if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
				if (file.size > MAX_BYTES) throw new Error('This backup is larger than the 256 MB import limit.');
				const project = readProject(zipSource(bytes, file.name));
				this.close();
				new ImportWindow(this.plugin, scrivenerJob(this.plugin, project)).open();
				return;
			}
			if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error(OLDER);
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
