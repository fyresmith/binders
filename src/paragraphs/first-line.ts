import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { TAB_LINE } from './mode';

/* "Indent paragraphs", the editor's part: a paragraph that follows a paragraph gets a class on its line, which the
   stylesheet sets in by the paragraph indent. Not the first paragraph of a note, nor one after a heading, a rule, a
   list, a quote, code, a table or an embed on a line of its own: as a printed book has it. Nothing is in the text. */

/** The class of a line that gets the indent. */
export const INDENTED = 'binders-indented';
const indented = Decoration.line({ class: INDENTED });

/** What a line of the editor is, as far as an indent cares. */
type Kind = 'blank' | 'text' | 'other';
/** Obsidian's names for what isn't a paragraph of prose: any line it gives a class of its own (a heading, a list, a
    quote, code, a table, a rule), the properties, and what carries on from a list or a quote on the line above. */
const NOT_PROSE = /HyperMD-|hmd-frontmatter|hmd-codeblock|hmd-indented-code|(^|_)(hr|list-\d+|quote|comment|math)(_|$)/;
/** A line that is nothing but an embed (`![[note]]`, `![](image.png)`): a picture or a note set in the page. */
export const EMBED_LINE = /^\s*(!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\))\s*$/;

function build(view: EditorView): DecorationSet {
	const b = new RangeSetBuilder<Decoration>(), doc = view.state.doc, tree = syntaxTree(view.state);
	const kinds = new Map<number, Kind>();
	const kind = (n: number): Kind => {
		let k = kinds.get(n);
		if (k) return k;
		const line = doc.line(n);
		k = 'text';
		let tab = false;
		if (!line.text.trim()) k = 'blank';
		else if (EMBED_LINE.test(line.text)) k = 'other';
		else tree.iterate({ from: line.from, to: line.to, enter: (node) => {
			if (node.from === node.to || node.to <= line.from || node.from >= line.to) return;
			if (node.name.includes(TAB_LINE)) tab = true;
			else if (NOT_PROSE.test(node.name)) k = 'other';
		} });
		// (a tab paragraph is prose, whatever its white space is called)
		if (tab) k = 'text';
		kinds.set(n, k);
		return k;
	};
	for (const { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to;) {
			const line = doc.lineAt(pos);
			// a paragraph that follows a paragraph (blank lines between them or not); one the writer began with white
			// space of their own has its indent already
			if (!/^\s/.test(line.text) && kind(line.number) === 'text') {
				let p = line.number - 1;
				while (p >= 1 && kind(p) === 'blank') p--;
				if (p >= 1 && kind(p) === 'text') b.add(line.from, line.from, indented);
			}
			pos = line.to + 1;
		}
	}
	return b.finish();
}

/** The editor extension. */
export const firstLine = ViewPlugin.fromClass(class {
	decorations: DecorationSet;
	constructor(view: EditorView) { this.decorations = build(view); }
	update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view); }
}, { decorations: (v) => v.decorations });
