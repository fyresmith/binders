import { Notice, Platform, type TFolder } from 'obsidian';
import { KINDS, bookDetails, ebook, fileName, lastExport, manuscript, noteLast, placeFor, readBook, save, setPlace, share, type Saved } from '../export/export';
import type BindersPlugin from '../main';
import { oneNoteText, writeOneNote } from '../scenes';
import { COMPILE_DEFAULTS } from '../scene-text';
import { ExportModal, FILES } from './export';
import { exportScriv } from './export-scriv';
import { confirm } from './modals';

/* "Export again": the last export of a binder made once more, with no window. The same kind, to the same place,
   with the choices as they stand now (the binder's style, its Book details, the settings the window keeps). It asks
   one thing only, and only when it must: whether to replace a file there that is no longer the one export left.
   On a phone or tablet the file goes to the Exports folder in the vault, as it always does there, and then to the
   share sheet. A binder that was never exported on this device gets the window. */

export async function exportAgain(plugin: BindersPlugin, folder: TFolder): Promise<void> {
	const last = lastExport(plugin, folder), s = plugin.settings, host = plugin.exportHost.desktop(plugin.app);
	// (a kind this Binders doesn't make by itself yet is the window's to make)
	const kind = last && KINDS.find((k) => k.id === last.kind)?.id;
	if (!last || !kind) { new ExportModal(plugin, folder).open(); return; }
	const doing = new Notice(`Exporting “${folder.name}”…`, 0);
	const replace = (shown: string) => confirm(plugin.app, { title: 'Replace this file', text: `“${shown}” is already there, and isn’t the file the last export left (it has been changed since, or put there by something else). Replace it?`, cta: 'Replace' });
	// the place is the last one, whether or not it was to be remembered "without asking": held for this export only
	const kept = placeFor(plugin, folder, kind), there = host && last.where === 'disk';
	if (there && !kept) setPlace(plugin, folder, kind, last.path);
	try {
		let saved: Saved | null = null, title = folder.name;
		if (kind === 'note') {
			const { text, scenes } = await oneNoteText(plugin, folder, { ...COMPILE_DEFAULTS, ...s.compile });
			// (a note that has been written in since is asked about by the one that writes it)
			const note = await writeOneNote(plugin, folder, last.path, text, scenes);
			if (note) saved = { where: 'vault', path: note.path, shown: note.path };
		} else if (kind === 'scrivener') {
			saved = await exportScriv(plugin, host, folder, { ask: false, say: () => { /* one notice says it */ }, cancelled: () => false, made: () => { /* nothing to show it in */ } });
		} else if (kind === 'manuscript' || kind === 'ebook') {
			const { extension, type, mime } = FILES[kind], d = bookDetails(plugin, folder).details;
			const style = kind === 'ebook' ? plugin.styles.get(d.bookStyle, 'book') : plugin.styles.get(d.manuscriptStyle || s.exportStyle, 'manuscript');
			const { book, words } = await readBook(plugin, folder, kind === 'ebook' || s.exportMatter, kind === 'ebook', kind === 'ebook' && style.values.quotes === 'as typed');
			title = book.title;
			const data = kind === 'ebook' ? ebook(plugin, book, style.name) : manuscript(plugin, book, words, style.name), name = fileName(book.title);
			saved = await save(plugin, host, data, { folder, kind, name, extension, type, replace });
			if (saved?.where === 'vault' && Platform.isMobile) await share(data, `${name}.${extension}`, mime);
		} else { new ExportModal(plugin, folder).open(); return; } // (a kind made only from the window)
		if (!saved) return;
		noteLast(plugin, folder, kind, saved);
		new Notice(`Exported “${title}” to ${saved.shown}.`);
	} catch (e) {
		new Notice(`The export didn’t finish. ${e instanceof Error ? e.message : String(e)}`, 10000);
	} finally {
		doing.hide();
		if (there && !kept) setPlace(plugin, folder, kind, null);
	}
}
