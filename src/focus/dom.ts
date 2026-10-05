import type { Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { MarkdownView, type Editor } from 'obsidian';

/* Obsidian's own DOM and editor, as far as focus mode reaches into them: everything undocumented it relies on is here
   (and the class names of what it hides are in one block of styles.css). Each is looked for, and has a fallback when
   it isn't there; all are listed in docs/internals.md and tested in tests/e2e/specs-focus.mjs. */

/** A note's CodeMirror editor (the `Editor`'s own `cm`), or null: then there's no typewriter line in a note tab. */
export function editorView(view: MarkdownView): EditorView | null {
	const cm = (view.editor as unknown as { cm?: Partial<EditorView> } | undefined)?.cm;
	return cm && typeof cm.dispatch === 'function' && !!cm.scrollDOM?.instanceOf?.(HTMLElement) && !!cm.state ? cm as EditorView : null;
}

/** The text an editor holds now, as CodeMirror keeps it (the `Editor`'s own `cm`, its state's `doc`): a value that
    never changes once made, so keeping it costs nothing, however long the note, and it can be read later if it's
    wanted. Null without it: then the text itself has to be read (`editor.getValue()`). */
export function editorDoc(editor: Editor): Text | null {
	const doc = (editor as unknown as { cm?: { state?: { doc?: Partial<Text> } } }).cm?.state?.doc;
	return doc && typeof doc.length === 'number' && typeof doc.toString === 'function' && typeof doc.sliceString === 'function' ? doc as Text : null;
}

/** The column a note's text is set in, as its view shows it now (editing or reading). */
export interface Column {
	/** What scrolls. */
	scroller: HTMLElement;
	/** The text itself: where it stands is where the page stands. */
	text: HTMLElement;
	/** Puts an element above the text, and one below it, in the column. */
	above(el: HTMLElement): void;
	below(el: HTMLElement): void;
}

/** Null when Obsidian's page isn't built as expected: then nothing is drawn before or after a note's text (the
    commands still go to the scenes before and after), and the way in and out is one step, without the glide. */
export function noteColumn(view: MarkdownView): Column | null {
	const root = view.containerEl;
	if (view.getMode() === 'preview') {
		// reading: Obsidian's own places above and below the text (where the title and the backlinks go)
		const scroller = root.querySelector<HTMLElement>('.markdown-reading-view .markdown-preview-view'), sizer = scroller?.querySelector<HTMLElement>(':scope > .markdown-preview-sizer');
		const head = sizer?.querySelector<HTMLElement>(':scope > .mod-header'), foot = sizer?.querySelector<HTMLElement>(':scope > .mod-footer');
		if (!scroller || !sizer || !head || !foot) return null;
		return { scroller, text: sizer, above: (el) => head.append(el), below: (el) => foot.prepend(el) };
	}
	const scroller = root.querySelector<HTMLElement>('.markdown-source-view .cm-scroller'), sizer = scroller?.querySelector<HTMLElement>(':scope > .cm-sizer');
	const text = sizer?.querySelector<HTMLElement>(':scope > .cm-contentContainer');
	if (!scroller || !sizer || !text) return null;
	return { scroller, text, above: (el) => sizer.insertBefore(el, text), below: (el) => text.after(el) };
}

/** The room a note's editor keeps free under its last line (half its height, set on the text by a style of the
    editor's own): what's drawn below the text is drawn up over it. '0px' in reading view, or if it can't be read. */
export function tailRoom(view: MarkdownView): string {
	if (view.getMode() === 'preview') return '0px';
	const text = view.containerEl.querySelector<HTMLElement>('.markdown-source-view .cm-content');
	const pad = text ? text.win.getComputedStyle(text).paddingBottom : '';
	return /^\d+(\.\d+)?px$/.test(pad) ? pad : '0px';
}

/** Where a position of an editor is on screen, from the page as drawn: for when the editor can't be asked (it's
    measuring itself). Null if that part isn't drawn. */
export function caretRect(cm: EditorView, pos: number): { top: number; bottom: number } | null {
	try {
		const { node, offset } = cm.domAtPos(pos), range = node.ownerDocument.createRange();
		range.setStart(node, offset);
		range.collapse(true);
		const r = range.getClientRects()[0];
		if (r && r.height) return r;
		// an empty line, or between two things in one: the thing before or after, or the line
		const el = node.instanceOf(HTMLElement) ? (node.childNodes[offset] ?? node.childNodes[offset - 1] ?? node) : node.parentElement;
		const b = el?.instanceOf(HTMLElement) ? el.getBoundingClientRect() : null;
		return b && b.height ? b : null;
	} catch { return null; }
}
