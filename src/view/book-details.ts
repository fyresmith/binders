import { FuzzySuggestModal, Modal, Notice, Setting, TFile, type TFolder } from 'obsidian';
import type BindersPlugin from '../main';
import { LANGUAGES, languageName, type Details } from '../export/details';
import { bookDetails, saveDetails } from '../export/export';
import { STRUCTURES, type Structure } from '../export/model';

/* Book details: what every export of a binder shares (its title, its author, its structure, its made pages, its
   language), kept as properties of the binder note. Obsidian's own setting rows in a plain dialog; a change is kept
   as it is made, as in Obsidian's settings, and there is no Save. Nothing here writes anything but those properties
   (export/export.ts, `saveDetails`), and a binder that can't be written is shown and not changed. */

const CONTENTS: [Details['contents'], string][] = [['titled', 'When chapters have titles'], ['always', 'Always'], ['never', 'Never']];

export class BookDetailsModal extends Modal {
	constructor(private plugin: BindersPlugin, private folder: TFolder, private done: () => void) { super(plugin.app); }

	onOpen(): void {
		const { contentEl, plugin, folder } = this;
		this.setTitle('Book details');
		this.modalEl.addClass('binders-book-details');
		let found: ReturnType<typeof bookDetails>;
		try { found = bookDetails(plugin, folder); } catch (e) { contentEl.createEl('p', { text: e instanceof Error ? e.message : String(e) }); return; }
		const { details: d, binder, locked } = found;
		contentEl.createEl('p', { cls: 'binders-book-details-about', text: `What every export of “${binder}” shares. Kept in the binder note’s properties.` });
		if (locked) contentEl.createEl('p', { cls: 'binders-book-details-locked', text: locked });
		const keep = (change: Partial<Details>) => { void saveDetails(plugin, folder, change).catch((e) => { new Notice(`Book details weren’t kept. ${e instanceof Error ? e.message : String(e)}`); }); };
		const text = (name: string, key: 'title' | 'subtitle' | 'author' | 'copyright', placeholder: string, desc = '') => {
			const row = new Setting(contentEl).setName(name);
			if (desc) row.setDesc(desc);
			row.addText((t) => {
				t.setValue(d[key]).setPlaceholder(placeholder).setDisabled(!!locked);
				t.inputEl.dataset.bindersKey = key;
				// (kept when the field is left or Enter is pressed, not at each letter: a property isn't written half-typed)
				const take = () => { const v = t.getValue().trim(); if (v !== d[key]) { d[key] = v; keep({ [key]: v }); } };
				t.inputEl.addEventListener('change', take);
				t.inputEl.addEventListener('blur', take);
			});
		};
		const author = plugin.settings.authorName.trim(), own = (name: string) => `A note of the book named “${name}” takes its place.`;
		text('Title', 'title', binder);
		text('Subtitle', 'subtitle', 'None');
		text('Author', 'author', author || 'Your name, from Binders’ settings');
		new Setting(contentEl).setName('Structure').setDesc('What a folder and a note are in the book.').addDropdown((dd) => {
			dd.addOption('', 'Read from the binder’s shape');
			for (const k of Object.keys(STRUCTURES) as Structure[]) dd.addOption(k, STRUCTURES[k][1]);
			dd.setValue(d.structure ?? '').setDisabled(!!locked).onChange((v) => { d.structure = (v || null) as Structure | null; keep({ structure: d.structure }); });
			dd.selectEl.dataset.bindersKey = 'structure';
		});
		new Setting(contentEl).setName('Title page').setDesc(own('Title page')).addToggle((t) => {
			t.setValue(d.titlePage).setDisabled(!!locked).onChange((v) => { d.titlePage = v; keep({ titlePage: v }); });
			t.toggleEl.dataset.bindersKey = 'title-page';
		});
		text('Copyright page', 'copyright', `© ${new Date().getFullYear()} ${d.author || author || 'the author'}`, own('Copyright'));
		new Setting(contentEl).setName('Contents page').addDropdown((dd) => {
			for (const [v, name] of CONTENTS) dd.addOption(v, name);
			dd.setValue(d.contents).setDisabled(!!locked).onChange((v) => { d.contents = v as Details['contents']; keep({ contents: d.contents }); });
			dd.selectEl.dataset.bindersKey = 'contents-page';
		});
		new Setting(contentEl).setName('Language').setDesc('Which quotation marks are set, and what the book says it is written in.').addDropdown((dd) => {
			// (a tag typed into the note that isn't in the list is kept, and shown as itself)
			const tags = d.language && !LANGUAGES.includes(d.language) ? [d.language, ...LANGUAGES] : [...LANGUAGES];
			dd.addOption('', `Not said (${languageName('en')})`);
			for (const tag of tags) dd.addOption(tag, languageName(tag));
			dd.setValue(d.language).setDisabled(!!locked).onChange((v) => { d.language = v; keep({ language: v }); });
			dd.selectEl.dataset.bindersKey = 'language';
		});
		new Setting(contentEl).addButton((b) => b.setButtonText('Done').setCta().onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
		// (a field still being typed in gave its text up as it lost the window; what is read next has it)
		window.setTimeout(this.done, 80);
	}
}

/** The pictures a cover can be: the vault's PNGs and JPEGs, and "No cover" when the book has one. */
class CoverModal extends FuzzySuggestModal<TFile | null> {
	constructor(private plugin: BindersPlugin, private has: boolean, private pick: (f: TFile | null) => void) {
		super(plugin.app);
		this.setPlaceholder('Choose the cover: a PNG or a JPEG in this vault');
		this.emptyStateText = 'No PNG or JPEG in this vault.';
	}
	getItems(): (TFile | null)[] {
		const pictures = this.app.vault.getFiles().filter((f) => /^(png|jpe?g)$/i.test(f.extension)).sort((a, b) => b.stat.mtime - a.stat.mtime);
		return this.has ? [null, ...pictures] : pictures;
	}
	getItemText(f: TFile | null): string { return f ? f.path : 'No cover'; }
	onChooseItem(f: TFile | null): void { this.pick(f); }
}

/** Asks which picture is the book's cover and keeps it in the binder note (`cover`), as a link Obsidian follows when
    the picture is renamed. */
export function pickCover(plugin: BindersPlugin, folder: TFolder, done: () => void): void {
	let found: ReturnType<typeof bookDetails>;
	try { found = bookDetails(plugin, folder); } catch (e) { new Notice(e instanceof Error ? e.message : String(e)); return; }
	if (found.locked) { new Notice(found.locked); return; }
	new CoverModal(plugin, !!found.details.cover, (f) => {
		void saveDetails(plugin, folder, { cover: f ? f.path : '' }).then(() => window.setTimeout(done, 80), (e) => { new Notice(`The cover wasn’t kept. ${e instanceof Error ? e.message : String(e)}`); });
	}).open();
}
