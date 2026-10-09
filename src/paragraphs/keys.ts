import { Prec, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { TAB_LINE } from './mode';

/* No double tab (the maintainer's decision, 2026-10-09). Enter at the end of a tab paragraph carries its tab on to
   the new line, as Obsidian does for any indent; a writer whose habit is Enter, Tab then had two tabs and a paragraph
   set in twice. So Tab on a line that holds one tab (or four spaces) and nothing else does nothing.

   As narrow as that: one caret, nothing selected, a line that is exactly one indent, and one the mode has marked as
   a writer's paragraph indent (mode.ts: so not under a list item, in a quote, a fenced block or the properties).
   Everything else is left to Obsidian by saying the key wasn't handled: Tab on a line with text, where a second tab
   can still be typed, on a selection, in a list. Only in editors that have the reading (a binder's note, the
   setting on). A key only: a command that indents (the phone toolbar's button) doesn't come this way. */

/** Is this line a tab, or four spaces, and nothing else, and marked by the mode as a paragraph's indent? */
function loneIndent(view: EditorView, from: number, to: number, text: string): boolean {
	if (!/^(\t| {4})$/.test(text)) return false;
	let ours = false;
	syntaxTree(view.state).iterate({ from, to, enter: (node) => { if (node.from === from && node.name.includes(TAB_LINE)) ours = true; } });
	return ours;
}

function tab(view: EditorView): boolean {
	const sel = view.state.selection;
	if (sel.ranges.length !== 1 || !sel.main.empty) return false;
	const line = view.state.doc.lineAt(sel.main.head);
	if (!loneIndent(view, line.from, line.to, line.text)) return false;
	// (the caret after the tab, where the paragraph will begin)
	if (sel.main.head !== line.to) view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true });
	return true;
}

/** The editor extension. */
export const noDoubleTab: Extension = Prec.highest(keymap.of([{ key: 'Tab', run: tab }]));
