import { ButtonComponent, Modal, Notice, Setting, TFile } from 'obsidian';
import type BindersPlugin from '../main';
import { isNote, saveOpen, splitMany } from '../scenes';
import { choicesFor, planSplit, type SplitBy } from '../split-text';
import { lf, parts } from '../scene-text';
import { wordsIn } from './words';
import { buttonRow, cancelButton } from './modals';
import { shownName } from '../shown-name';

/* "Split at headings...": a note of a binder cut into several. A small dialog (Obsidian's own look for one): where to
   cut (a heading level, the scene breaks, or a line of the writer's own), the notes it will make with their names, which
   can be changed, and two switches. The cutting is split-text.ts's (the same units as the import), the making and the
   undoing are scenes.ts's `splitMany`. Nothing is written until the button, and then in the order scenes.ts keeps: the text
   is in the new notes before the note lets go of it. */

const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** Opens the dialog on a note, with what is typed in it saved first so the list is of the note as it is. */
export async function openSplitMany(plugin: BindersPlugin, file: TFile): Promise<void> {
	const { binders: store } = plugin, folder = file.parent;
	if (!folder || !isNote(file) || !store.binderOf(file) || store.isHiddenNote(file)) return;
	if (store.problem(file)) { new Notice('This binder is in a newer format than this version can change.'); return; }
	await saveOpen(plugin.app, [file]);
	const raw = lf(await plugin.app.vault.adapter.read(file.path)), text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
	new SplitManyModal(plugin, file, text).open();
}

class SplitManyModal extends Modal {
	private by: SplitBy;
	private line = '';
	private take = false;
	private folder: boolean;
	private names = new Map<number, string>();
	private busy = false;
	private list!: HTMLElement;
	private go!: ButtonComponent;
	private lineRow!: Setting;

	constructor(private plugin: BindersPlugin, private file: TFile, private text: string) {
		super(plugin.app);
		const c = choicesFor(text), many = c.headings.find((h) => h.count >= 2) ?? c.headings[0];
		this.by = many ? { kind: 'heading', level: many.level } : c.breaks ? { kind: 'breaks' } : { kind: 'line', text: '' };
		// (at the binder's top level the new notes may have a folder of their own; a Longform project has no folders)
		this.folder = this.canFolder() && (c.headings.length > 0 || c.breaks > 0);
	}

	private canFolder(): boolean {
		const b = this.plugin.binders.binderOf(this.file);
		return !!b && b.kind !== 'longform' && this.file.parent === b.folder;
	}

	private pieces() { return planSplit(this.text, this.by, this.take).map((p, i) => ({ ...p, title: i > 0 ? this.names.get(i) ?? p.title : p.title })); }

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass('binders-split-many');
		this.setTitle(`Split “${shownName(this.file)}”`);
		const c = choicesFor(this.text);
		new Setting(contentEl).setName('Split at').addDropdown((d) => {
			for (const h of c.headings) d.addOption(`h${h.level}`, `Heading ${h.level} (${h.count})`);
			d.addOption('breaks', `Scene breaks (${c.breaks})`).addOption('line', 'A line of your own');
			d.setValue(this.by.kind === 'heading' ? `h${this.by.level}` : this.by.kind);
			d.onChange((v) => { this.by = v === 'breaks' ? { kind: 'breaks' } : v === 'line' ? { kind: 'line', text: this.line } : { kind: 'heading', level: Number(v.slice(1)) }; this.names.clear(); this.lineRow.settingEl.toggle(v === 'line'); this.draw(); });
			d.selectEl.dataset.bindersKey = 'by';
		});
		this.lineRow = new Setting(contentEl).setName('The line').setDesc('A note starts at each line that is exactly this.').addText((t) => {
			t.setPlaceholder('For example ###').setValue(this.line).onChange((v) => { this.line = v; if (this.by.kind === 'line') { this.by = { kind: 'line', text: v }; this.names.clear(); this.draw(); } });
			t.inputEl.dataset.bindersKey = 'line';
		});
		this.lineRow.settingEl.toggle(this.by.kind === 'line');
		if (this.canFolder()) new Setting(contentEl).setName('Put them in a folder named for this note').setDesc(`A new folder, “${this.file.basename} notes”, beside the note.`).addToggle((t) => { t.setValue(this.folder).onChange((v) => { this.folder = v; }); t.toggleEl.dataset.bindersKey = 'folder'; });
		new Setting(contentEl).setName('Take the headings out of the text').setDesc('The line that starts a note is its name and not in its text. Off, the text is kept whole.').addToggle((t) => { t.setValue(this.take).onChange((v) => { this.take = v; this.names.clear(); this.draw(); }); t.toggleEl.dataset.bindersKey = 'take'; });
		contentEl.createEl('p', { cls: 'binders-split-many-head setting-item-description', text: 'The notes it will make, in order. Change a name by typing in it.' });
		this.list = contentEl.createDiv({ cls: 'binders-split-many-list', attr: { role: 'list', 'aria-label': 'The notes it will make' } });
		const row = buttonRow(this);
		this.go = new ButtonComponent(row).setCta().onClick(() => void this.run());
		this.go.buttonEl.dataset.bindersKey = 'go';
		cancelButton(row, this);
		this.draw();
	}

	onClose(): void { this.contentEl.empty(); }

	private draw(): void {
		const pieces = this.pieces();
		this.list.empty();
		const first = this.list.createDiv({ cls: 'binders-split-many-row is-first', attr: { role: 'listitem' } });
		first.createSpan({ cls: 'binders-split-many-name', text: shownName(this.file) });
		first.createSpan({ cls: 'binders-split-many-words', text: `stays as the first note · ${n(wordsIn(this.plugin, parts(pieces[0]?.text ?? '').body), 'word')}` });
		pieces.slice(1).forEach((p, k) => {
			const row = this.list.createDiv({ cls: 'binders-split-many-row', attr: { role: 'listitem' } });
			const input = row.createEl('input', { type: 'text', cls: 'binders-split-many-input', attr: { 'aria-label': `Name of note ${k + 2}`, 'data-binders-key': `name-${k + 1}` } });
			input.value = p.title;
			input.addEventListener('input', () => { this.names.set(k + 1, input.value); });
			row.createSpan({ cls: 'binders-split-many-words', text: n(wordsIn(this.plugin, p.text), 'word') });
		});
		this.go.setButtonText(pieces.length > 1 ? `Split into ${pieces.length} notes` : 'Split').setDisabled(pieces.length < 2 || this.busy);
	}

	private async run(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.draw();
		const pieces = this.pieces().map((p, i) => ({ title: i > 0 ? p.title.trim() || 'Untitled' : '', text: p.text }));
		const made = await splitMany(this.plugin, this.file, this.text, pieces, { folder: this.folder && this.canFolder() });
		this.busy = false;
		if (made) { this.close(); new Notice(`Split “${shownName(this.file)}” into ${pieces.length} notes. Undo last change takes it back.`); } else this.draw();
	}
}
