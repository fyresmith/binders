import { TFile } from 'obsidian';
import type BindersPlugin from '../main';
import { editorOf } from '../snapshots';
import { apply, type Edit } from './search';

/* Replace all, the writing part (golden rules 2 and 3: nothing is lost, and nothing is touched that wasn't a match).
   A note is changed only if its text is exactly the text that was looked through; else it is left and said so. The
   changes are made where the note is being typed in (its tab, or the manuscript's section) as one transaction, so the
   cursor stays where it was and Undo there takes them back; otherwise in one atomic write of the vault. Each change is
   a stretch of the text (its place in the whole file) and what stands there in its place. */

/** Makes the edits in a note whose text is `text` (the whole file). True if they were made; false, with the note
    untouched, if it says anything else. */
export async function replaceEdits(plugin: BindersPlugin, file: TFile, text: string, edits: readonly Edit[]): Promise<boolean> {
	const { app } = plugin, open = editorOf(app, file);
	if (open) {
		const ed = open.editor;
		if (ed.getValue() !== text) return false;
		ed.transaction({ changes: edits.map((e) => ({ from: ed.offsetToPos(e.from), to: ed.offsetToPos(e.to), text: e.text })) });
		await open.save();
		return true;
	}
	let ok = false;
	await app.vault.process(file, (cur) => {
		// (a byte-order mark is no text: `read` leaves it out and `process` hands it over)
		const mark = cur.startsWith('﻿') ? 1 : 0;
		if (cur.slice(mark) !== text) return cur;
		ok = true;
		return cur.slice(0, mark) + apply(text, edits);
	});
	return ok;
}
