import { RangeSetBuilder, type EditorState, type Text } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { forceParsing, syntaxTree } from '@codemirror/language';
import { SPACE_LINE, TAB_LINE } from './mode';
import { TABBED, tabLines } from './text';

/* A tab paragraph drawn right before the editor has read as far as it. The editor reads a note from its top, a slice
   at a time: after a jump into a long note (the page put back where it was left, a link to a heading, a search
   hit, a fling of a finger) the lines in sight have no reading for some frames, a hundred milliseconds and more on a
   phone. Until it comes the mode's mark (mode.ts) isn't on them, and Obsidian draws their tab as a list's level: a
   guide line, the text half an inch to the side, then a jump.

   So a line in sight that the editor hasn't read, and that the text alone says is a tab paragraph (text.ts), is given
   the same classes here, as a decoration. Only until the reading arrives: where the editor has read, the mode decides
   and this adds nothing, so the two can't disagree for longer than those frames. Nothing is in the text.

   One thing the classes alone don't put right: Obsidian hangs an indented line it has no reading of under its white space,
   with a style written on the line itself, so a paragraph's wrapped lines stand in until the reading comes. So the
   reading is also hurried: when lines in sight aren't read, the editor is told to read as far as them before the
   frame is drawn, for no longer than `HURRY` ms a frame (CodeMirror's `forceParsing`; left to itself it reads on in
   idle time, a frame or more later). Far into a long note the editor starts afresh near the page instead of reading
   all the way there, and that is done within the one frame; nearer, it may take a few. */

/** How long one frame may be held to read as far as the page, in ms. */
const HURRY = 24;

/** What the text alone says, once for each text: the lines (from 0) that begin a writer's tab paragraph. */
const guessed = new WeakMap<Text, Set<number>>();
const guess = (doc: Text): Set<number> => {
	let lines = guessed.get(doc);
	if (!lines) guessed.set(doc, lines = new Set(tabLines(doc.toString(), { carried: true, blank: true })));
	return lines;
};

// (the style: Obsidian hangs an indented line it has no reading of under its white space, by a style on the line;
// this one, on the same line, is the last word. Only on a line not read yet: once read, Obsidian doesn't hang it.)
const mark = (spaces: boolean) => Decoration.line({ class: spaces ? `${TAB_LINE} ${SPACE_LINE}` : TAB_LINE, attributes: { style: 'text-indent: 0; padding-inline-start: 0' } });
const TABS = mark(false), SPACES = mark(true);

/** Has the editor read this line, and as what: a tab paragraph, something else, or not yet? Told by the tree alone:
    a line the mode has read as a tab paragraph has its white space named so, one it has read as anything else that
    could start with a tab (a list's, a quote's, code, the properties, a formula, a comment) has a name on something
    in it, and a line with no name on anything hasn't been read. (Not by asking how far the tree is done: far into a
    long note the editor skips to the page, and the tree says done for lines it passed over. The one line this gets
    wrong for good is plain words set in by a tab inside an HTML block, which the mode reads and names nothing in.) */
function read(state: EditorState, from: number, to: number): 'tab' | 'other' | null {
	let named = false, tab = false;
	syntaxTree(state).iterate({ from, to, enter: (node) => {
		if (node.from < from || node.to > to || node.to === node.from) return;
		named = true;
		if (node.from === from && node.name.includes(TAB_LINE)) tab = true;
	} });
	return tab ? 'tab' : named ? 'other' : null;
}

function build(view: EditorView, on: boolean): { set: DecorationSet; unread: boolean } {
	if (!on) return { set: Decoration.none, unread: false };
	const b = new RangeSetBuilder<Decoration>(), state = view.state, doc = state.doc;
	let unread = false;
	for (const { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to;) {
			const line = doc.lineAt(pos);
			if (TABBED.test(line.text)) {
				const as = read(state, line.from, line.to);
				if (!as && guess(doc).has(line.number - 1)) { unread = true; b.add(line.from, line.from, /^\t+(\S|$)/.test(line.text) ? TABS : SPACES); }
			}
			pos = line.to + 1;
		}
	}
	return { set: b.finish(), unread };
}

/** The editor extension: `on` says whether this editor's note is one whose tab lines are paragraphs. In every
    editor, from its first frame: an editor is given its reading a moment after it is made (paragraphs.ts). */
export const ahead = (on: (view: EditorView) => boolean) => ViewPlugin.fromClass(class {
	decorations: DecorationSet = Decoration.none;
	waiting = false;
	gone = false;
	constructor(readonly view: EditorView) { this.look(); }
	update(_u: ViewUpdate) { this.look(); }
	destroy() { this.gone = true; }
	look() {
		const { set, unread } = build(this.view, on(this.view));
		this.decorations = set;
		if (!unread || this.waiting) return;
		this.waiting = true;
		// (not while the editor is in the middle of an update; before the frame is drawn)
		queueMicrotask(() => this.hurry());
	}
	hurry() {
		if (this.gone) return;
		let there = true;
		try { there = forceParsing(this.view, this.view.viewport.to, HURRY); } catch { /* left to read on in its own time */ }
		// (not there yet: the frame is drawn as it is, and the next is tried)
		if (there) this.waiting = false;
		else if (!this.view.dom.ownerDocument.defaultView) this.waiting = false;
		else this.view.dom.ownerDocument.defaultView.requestAnimationFrame(() => { this.waiting = false; if (!this.gone && build(this.view, on(this.view)).unread) { this.waiting = true; this.hurry(); } });
	}
}, { decorations: (v) => v.decorations });
