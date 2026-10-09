import type { Editor } from 'obsidian';
import { linesToTab } from './text';

/* The command "Start a paragraph with a tab" (the maintainer's, 2026-10-09): for a phone, which has no Tab key, and
   anywhere a writer would sooner have a command than a key. It puts a tab at the start of the line the cursor is on,
   or of each line of prose in what is selected (text.ts says which). A line that has its tab is left: it is not a
   toggle (Backspace and Obsidian's own "Unindent" take a tab off). One change, so one step of undo. */

/** Puts the tabs in. Returns how many lines got one. */
export function startWithTab(editor: Editor): number {
	const ranges = editor.listSelections(), wanted = new Set<number>(), text = editor.getValue();
	for (const r of ranges) {
		const a = Math.min(r.anchor.line, r.head.line), b = Math.max(r.anchor.line, r.head.line);
		for (const n of linesToTab(text, a, b)) wanted.add(n);
	}
	const lines = [...wanted].sort((a, b) => a - b);
	if (!lines.length) return 0;
	// (a cursor at the very start of its line would be left before the tab: it goes after, where the text is)
	const start = ranges.length === 1 && ranges[0].anchor.line === ranges[0].head.line && ranges[0].anchor.ch === 0 && ranges[0].head.ch === 0 && wanted.has(ranges[0].head.line) ? ranges[0].head.line : -1;
	editor.transaction({ changes: lines.map((line) => ({ from: { line, ch: 0 }, text: '\t' })) });
	if (start >= 0) editor.setCursor({ line: start, ch: 1 });
	return lines.length;
}
