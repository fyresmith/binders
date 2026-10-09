import { repointLinks } from '../scene-text';

/* The pure parts of tab paragraphs: which lines of a text are paragraphs begun with a tab, those lines made ready for
   a renderer that would make code of them, and their links pointed at a note's new name. No Obsidian here, so it is
   unit-tested (tests/paragraphs.test.ts). */

/** A line that starts with a tab, or with four spaces: what Markdown takes for code. */
export const TABBED = /^(\t| {4})/;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^\s*([-*+]|\d{1,9}[.)])(\s|$)/;
const QUOTE = /^ {0,3}>/;
const HEADING_OR_RULE = /^ {0,3}(#{1,6}(\s|$)|([-*_])( *\3){2,} *$)/;

/** The lines of a text (numbered from 0) that are paragraphs begun with a tab: what Markdown reads as indented code.
    That is a tabbed line after a blank line, at the start of the text, or straight after another such line. Not one
    that carries on a paragraph (Markdown drops its tab and reads it as prose already), not one inside a fenced block,
    the properties or a comment's fence, and not one under a list item or a quote, where an indent is theirs. When in
    doubt a line is left out.

    With `carried`, also a tabbed line that carries on a paragraph (straight under a line of text): Markdown reads it
    as prose and drops its tab, the editor shows it set in. With `blank`, also a line that is a tab (or four spaces)
    and nothing else yet. Those two are what the editor's mode marks (mode.ts); this says the same from the text alone,
    for where the mode hasn't read. */
export function tabLines(text: string, also: { carried?: boolean; blank?: boolean } = {}): number[] {
	const lines = text.split('\n'), out: number[] = [];
	let i = 0;
	// (the properties: from a first line of three dashes to the next)
	if (/^(\uFEFF)?---\s*$/.test(lines[0] ?? '')) {
		const end = lines.findIndex((l, n) => n > 0 && /^(---|\.\.\.)\s*$/.test(l));
		if (end > 0) i = end + 1;
	}
	let fence: string | null = null, blankBefore = true, tabBefore = false, held = false;
	for (; i < lines.length; i++) {
		const l = lines[i].replace(/\r$/, '');
		if (fence) { if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(l)) { fence = null; blankBefore = true; } continue; }
		const f = FENCE.exec(l);
		if (f) { fence = f[1]; tabBefore = false; held = false; continue; }
		if (!l.trim()) { if (also.blank && !held && TABBED.test(l)) out.push(i); blankBefore = true; continue; }
		if (TABBED.test(l)) {
			// (`held`: the last thing that wasn't tabbed or blank was a list item or a quote, and this may be its text)
			if (!held && (blankBefore || tabBefore)) { out.push(i); tabBefore = true; } else { if (also.carried && !held) out.push(i); tabBefore = false; }
			blankBefore = false;
			continue;
		}
		held = LIST_ITEM.test(l) || QUOTE.test(l);
		// (a heading or a rule ends what came before as a blank line does)
		blankBefore = HEADING_OR_RULE.test(l); tabBefore = false;
	}
	return out;
}

const TABLE = /^\s*\|/;

/** The lines of a text (from 0), among lines `from` to `to`, that the command "Start a paragraph with a tab" puts a
    tab before: a line of prose that starts at the margin. Not a blank line, nor one that has its tab (or four
    spaces) already; not a list item, a quote, a heading, a rule or a table's row; nothing in a fenced block or the
    properties; and not the line after a list item or a quote, which a tab would make theirs. When in doubt a line
    is left alone. */
export function linesToTab(text: string, from: number, to: number): number[] {
	const lines = text.split('\n'), out: number[] = [];
	let i = 0;
	if (/^(\uFEFF)?---\s*$/.test(lines[0] ?? '')) {
		const end = lines.findIndex((l, n) => n > 0 && /^(---|\.\.\.)\s*$/.test(l));
		if (end > 0) i = end + 1;
	}
	// (`held`: a list item or a quote is open, and a tab would make the line its text. A line straight under it
	// carries it on and leaves it open; the first line of text after a blank line ends it, and is left as well)
	let fence: string | null = null, held = false, blankBefore = true;
	for (; i < lines.length && i <= to; i++) {
		const l = lines[i].replace(/\r$/, '');
		if (fence) { if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(l)) { fence = null; blankBefore = true; } continue; }
		const f = FENCE.exec(l);
		if (f) { fence = f[1]; held = false; continue; }
		if (!l.trim()) { blankBefore = true; continue; }
		if (TABBED.test(l)) { blankBefore = false; continue; }
		const theirs = LIST_ITEM.test(l) || QUOTE.test(l), rule = HEADING_OR_RULE.test(l);
		if (!theirs && !held && !rule && !TABLE.test(l) && i >= from) out.push(i);
		held = theirs || (held && !blankBefore && !rule);
		blankBefore = false;
	}
	return out;
}

/** A text made ready for a renderer that is given a whole note at once: each paragraph begun with a tab starts with
    a mark the stylesheet sets as wide as the indent, in place of the white space Markdown would make code of. With
    `carried`, so does a tabbed line that carries on a paragraph, whose tab Markdown drops: for a renderer that gives
    each line of a paragraph a line of its own (`MarkdownRenderer.render` does; where lines run together a mark
    would be a gap in the middle of one). For showing only: never written anywhere. */
export function tabsForRender(text: string, mark = '<span class="binders-tab"></span>', carried = false): string {
	const at = new Set(tabLines(text, { carried }));
	if (!at.size) return text;
	return text.split('\n').map((l, i) => (at.has(i) ? mark + l.replace(/^[ \t]+/, '') : l)).join('\n');
}

/** A text without the tab (or the spaces) each paragraph begun with one starts with: what a note outside a binder
    needs, where Obsidian would show those lines as code. Every other line is as it was. */
export function untab(text: string): string {
	const at = new Set(tabLines(text));
	if (!at.size) return text;
	return text.split('\n').map((l, i) => (at.has(i) ? l.replace(/^[ \t]+/, '') : l)).join('\n');
}

/** Did a link, as written in the note at `source`, point at the file that was at `old`? `others` are the paths of
    every other file in the vault now. Yes only when nothing else could have been meant: the link names the path, a
    path from the note's own folder, or the end of the path (its name, or its folder and name) that no other file
    ends with too. Capital letters don't count, as Obsidian has it. */
export function pointedAt(link: string, source: string, old: string, others: readonly string[]): boolean {
	const low = (s: string) => s.toLowerCase();
	const want = low(old);
	let path = link.trim().replace(/\\/g, '/');
	if (!path) return false;
	if (/^\.\.?\//.test(path)) {
		// from the note's own folder
		const parts = source.split('/').slice(0, -1);
		for (const seg of path.split('/')) { if (seg === '..') { if (!parts.length) return false; parts.pop(); } else if (seg !== '.') parts.push(seg); }
		path = parts.join('/');
		return low(path) === want || low(path) + '.md' === want;
	}
	path = path.replace(/^\/+/, '');
	for (const cand of [low(path), low(path) + '.md']) {
		const ends = (p: string) => p === cand || p.endsWith('/' + cand);
		if (ends(want)) return !others.some((o) => ends(low(o)));
	}
	return false;
}

/** A text with the links on its tab-paragraph lines pointed somewhere else: `to(note, part)` as `repointLinks` has
    it. Only those lines (and of them only the ones in `within`, line numbers Obsidian's own index calls code, when
    given), and in them only a link's note: every other byte of the text is as it was, line endings too. */
export function repointTabLinks(text: string, to: (path: string, subpath: string) => string | null, within?: (line: number) => boolean): string {
	const at = tabLines(text).filter((n) => !within || within(n));
	if (!at.length) return text;
	const lines = text.split('\n');
	for (const n of at) lines[n] = repointLinks(lines[n], to);
	return lines.join('\n');
}
