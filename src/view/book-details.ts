import { FuzzySuggestModal, Menu, Notice, Setting, TFile, type TFolder } from 'obsidian';
import type BindersPlugin from '../main';
import { CONTRIBUTOR_ROLES, LANGUAGES, languageName, type Contributor, type Details } from '../export/details';
import { bookDetails, saveDetails } from '../export/export';
import { STRUCTURES, type Structure } from '../export/model';

/* Book details: what every export of a binder shares (its title, its author, its structure, its made pages, its
   language), kept as properties of the binder note. Obsidian's own setting rows, on the Book page of Binder settings
   (view/binder-settings.ts); a change is kept as it is made, as in Obsidian's settings, and there is no Save. Nothing here writes anything but those properties
   (export/export.ts, `saveDetails`), and a binder that can't be written is shown and not changed. */

const CONTENTS: [Details['contents'], string][] = [['titled', 'When chapters have titles'], ['always', 'Always'], ['never', 'Never']];

/** Draws Book details' rows into `contentEl`: the binder's, each kept as it is made. `quiet`: the reason a binder can't be
    changed is said by whoever holds the form (the rows are shown with nothing enabled all the same). */
export function drawBookDetails(contentEl: HTMLElement, plugin: BindersPlugin, folder: TFolder, quiet = false): void {
	let found: ReturnType<typeof bookDetails>;
	try { found = bookDetails(plugin, folder); } catch (e) { contentEl.createEl('p', { text: e instanceof Error ? e.message : String(e) }); return; }
	const { details: d, binder, locked } = found;
	contentEl.createEl('p', { cls: 'binders-book-details-about', text: `What every export of “${binder}” shares. Kept in the binder note’s properties.` });
	// (Binder settings says why at the top of every page; a window of its own would say it here)
	if (locked && !quiet) contentEl.createEl('p', { cls: 'binders-book-details-locked', text: locked });
	const keep = (change: Partial<Details>) => { void saveDetails(plugin, folder, change).catch((e) => { new Notice(`Book details weren’t kept. ${e instanceof Error ? e.message : String(e)}`); }); };
	type Said = 'title' | 'subtitle' | 'author' | 'copyright' | 'series' | 'seriesNumber' | 'publisher' | 'edition' | 'published' | 'description' | 'rights';
	const text = (name: string, key: Said, placeholder: string, desc = '', long = false) => {
		const row = new Setting(contentEl).setName(name);
		if (desc) row.setDesc(desc);
		if (long) {
			row.setClass('binders-book-details-long');
			row.addTextArea((t) => {
				t.setValue(d[key]).setPlaceholder(placeholder).setDisabled(!!locked);
				t.inputEl.dataset.bindersKey = key;
				t.inputEl.rows = 3;
				const take = () => { const v = t.getValue().trim(); if (v !== d[key]) { d[key] = v; keep({ [key]: v }); } };
				t.inputEl.addEventListener('blur', take);
			});
			return;
		}
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
	// what a published book says of itself: on its title and copyright pages, and inside the ebook's file
	new Setting(contentEl).setName('Publishing').setHeading();
	text('Series', 'series', 'None', 'Under the title, on the title page.');
	text('Number in the series', 'seriesNumber', '1');
	text('Publisher', 'publisher', 'None', 'At the foot of the title page, and on the copyright page.');
	text('Edition', 'edition', 'First edition', 'On the copyright page.');
	text('Published', 'published', `${new Date().getFullYear()}-11-03`, 'A date, or a year: on the copyright page, and in the ebook.');
	text('Description', 'description', 'What a store shows of the book', 'In the ebook, where a reader’s library shows it.', true);
	new Setting(contentEl).setName('Keywords').setDesc('In the ebook. Separate them with commas.').addText((t) => {
		t.setValue(d.keywords.join(', ')).setPlaceholder('None').setDisabled(!!locked);
		t.inputEl.dataset.bindersKey = 'keywords';
		t.inputEl.addEventListener('change', () => { d.keywords = t.getValue().split(',').map((k) => k.trim()).filter((k) => k); keep({ keywords: d.keywords }); });
	});
	contributors(contentEl, d.contributors, !!locked, (list) => { d.contributors = list; keep({ contributors: list }); });
	text('More on the copyright page', 'rights', 'All rights reserved.', 'Each line as it is typed, after the rest.', true);
}

/** The people who made the book with the author: one row each, its role as its name and the person in its field;
    "Add" asks which role. */
function contributors(el: HTMLElement, list: Contributor[], locked: boolean, set: (list: Contributor[]) => void): void {
	// (drawn among Book details' own rows, not in a box of their own, so Obsidian draws the lines between them; a
	// mark where they go, and the rows drawn last time, taken away when they are drawn again)
	const at = el.createDiv({ cls: 'binders-book-details-people' });
	let drawn: Element[] = [];
	const roleName = (role: string) => CONTRIBUTOR_ROLES.find(([v]) => v === role)?.[1] ?? role[0].toUpperCase() + role.slice(1);
	const draw = (focus = -1) => {
		for (const e of drawn) e.remove();
		const box = createDiv();
		const head = new Setting(box).setName('Contributors').setDesc('On the copyright page, and in the ebook.');
		if (!locked) head.addButton((b) => {
			b.setButtonText('Add...').onClick((e) => {
				const m = new Menu();
				for (const [v, name] of CONTRIBUTOR_ROLES) m.addItem((i) => i.setTitle(name).onClick(() => { list = [...list, { role: v, name: '' }]; draw(list.length - 1); }));
				m.showAtMouseEvent(e);
			});
			b.buttonEl.dataset.bindersKey = 'add-contributor';
		});
		list.forEach((c, i) => {
			const row = new Setting(box).setName(roleName(c.role)).setClass('binders-book-details-person');
			row.addText((t) => {
				t.setPlaceholder('Name').setValue(c.name).setDisabled(locked);
				t.inputEl.addEventListener('change', () => { list = list.map((x, j) => (j === i ? { ...x, name: t.getValue().trim() } : x)); set(list.filter((x) => x.name)); });
				if (i === focus) window.setTimeout(() => t.inputEl.focus(), 0);
			});
			if (!locked) row.addExtraButton((b) => b.setIcon('x').setTooltip('Remove').onClick(() => { list = list.filter((_, j) => j !== i); set(list.filter((x) => x.name)); draw(); }));
		});
		drawn = Array.from(box.children);
		at.before(...drawn);
	};
	draw();
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
