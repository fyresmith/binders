import { Modal, Notice, Setting, TFile, TFolder, type Menu } from 'obsidian';
import type BindersPlugin from '../main';
import type { Binder } from '../binders';
import { noteTemplates, ownTemplate, templateFor, templatesFolder, TEMPLATE_PROP } from '../templates';
import { buttonRow, cancelButton } from './modals';
import { submenu } from './internals';

/* Templates in the binder view's New menu, and "Save as binder template" (docs/templates.md).

   The New menu keeps "New note" and "New folder" and adds two drawers, only when the templates folder has a note:
   "New note from template", to make one note from any template where "New note" would put it, and "Template for new
   notes", the folder's choice: "None", "Same as “Part One”" when a folder above it has one, then each template, the
   one in use ticked. The rows' titles never change, so the menu is the same length whatever is chosen. */

/** The rows, after "New note" and "New folder", for new notes in `folder`; `make` makes a note as "New note" would. */
export function templateRows(plugin: BindersPlugin, menu: Menu, folder: TFolder, make: () => void): void {
	const all = noteTemplates(plugin);
	if (!all.length) return;
	const store = plugin.binders, top = store.binderOf(folder)?.folder;
	if (!top || store.binderOf(folder)?.kind !== 'binder') return;
	const own = ownTemplate(plugin, folder), parent = folder !== top && folder.parent ? templateFor(plugin, folder.parent) : null;
	menu.addItem((i) => {
		i.setSection('new').setTitle('New note from template').setIcon('file-stack');
		submenu(i, (m) => {
			for (const t of all) m.addItem((x) => x.setTitle(t.basename).onClick(() => { store.useTemplateOnce(t); make(); }));
		}, menu);
	});
	menu.addItem((i) => {
		i.setSection('template').setTitle('Template for new notes').setIcon('file-cog');
		submenu(i, (m) => {
			// (none here, with one above, is said in this folder's note: an empty `template`, which stops it)
			m.addItem((x) => x.setSection('none').setTitle('None').setChecked(own === null || (own === undefined && !parent)).onClick(() => void setTemplate(plugin, folder, parent ? null : undefined)));
			if (parent) m.addItem((x) => x.setSection('none').setTitle(`Same as “${parent.from.name}”`).setChecked(own === undefined).onClick(() => void setTemplate(plugin, folder, undefined)));
			for (const t of all) m.addItem((x) => x.setSection('list').setTitle(t.basename).setChecked(own === t).onClick(() => void setTemplate(plugin, folder, t)));
		}, menu);
	});
}

/** Writes a folder's choice in its note (made if need be), as one change that Undo takes back: a template, null for
    none (with one above), undefined to say nothing (the property taken away). */
export async function setTemplate(plugin: BindersPlugin, folder: TFolder, t: TFile | null | undefined): Promise<void> {
	const store = plugin.binders;
	try {
		// (a folder note isn't made to say nothing)
		const note = t === undefined ? store.folderNote(folder) : await store.ensureFolderNote(folder);
		if (!note) return;
		// (none is an empty text, not a property with no value: Undo tells that apart from no property)
		const value = t ? plugin.app.fileManager.generateMarkdownLink(t, note.path) : t === null ? '' : undefined;
		await store.setByHand(t ? `Template for “${folder.name}”` : `No template for “${folder.name}”`, [{ note, patch: { [TEMPLATE_PROP]: value } }], { [TEMPLATE_PROP]: 'the template' });
		const now = templateFor(plugin, folder);
		new Notice(now ? `New notes in “${folder.name}” start from “${now.file.basename}”.` : `New notes in “${folder.name}” start empty.`, 3000);
	} catch (e) { new Notice(e instanceof Error ? e.message : String(e)); }
}

/** "Save as binder template...": Obsidian's small dialog, a name and one choice. */
export function saveTemplateDialog(plugin: BindersPlugin, binder: Binder): void {
	const m = new Modal(plugin.app), root = templatesFolder(plugin.app);
	m.setTitle('Save as binder template');
	m.modalEl.addClass('binders-save-template');
	let name = binder.kind === 'longform' ? binder.note.parent?.name ?? binder.folder.name : binder.folder.name, text = false;
	m.contentEl.createEl('p', { text: root ? `A copy of the binder in “${root}”, offered in New binder. Its folders, notes, synopses and targets are kept; snapshots are not.` : 'Choose a templates folder in the settings of Obsidian’s Templates core plugin first.' });
	const go = () => {
		if (!root) return;
		void plugin.saveBinderTemplate(binder, name, text).then((f) => { m.close(); new Notice(`Saved “${f.name}” as a binder template.`); }, (e) => new Notice(e instanceof Error ? e.message : String(e)));
	};
	new Setting(m.contentEl).setName('Name').addText((t) => {
		t.setValue(name).onChange((v) => { name = v; });
		t.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
		window.setTimeout(() => t.inputEl.select(), 0);
	});
	const label = m.contentEl.createEl('label', { cls: 'mod-checkbox binders-save-template-text' });
	const box = label.createEl('input', { type: 'checkbox' });
	box.addEventListener('change', () => { text = box.checked; });
	label.appendText('Keep the notes’ text');
	const row = buttonRow(m);
	const b = row.createEl('button', { cls: 'mod-cta', text: 'Save template' });
	b.disabled = !root;
	b.addEventListener('click', go);
	cancelButton(row, m);
	m.open();
}
