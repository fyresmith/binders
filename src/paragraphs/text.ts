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
    doubt a line is left out. */
export function tabLines(text: string): number[] {
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
		if (!l.trim()) { blankBefore = true; continue; }
		if (TABBED.test(l)) {
			// (`held`: the last thing that wasn't tabbed or blank was a list item or a quote, and this may be its text)
			if (!held && (blankBefore || tabBefore)) { out.push(i); tabBefore = true; } else tabBefore = false;
			blankBefore = false;
			continue;
		}
		held = LIST_ITEM.test(l) || QUOTE.test(l);
		// (a heading or a rule ends what came before as a blank line does)
		blankBefore = HEADING_OR_RULE.test(l); tabBefore = false;
	}
	return out;
}

/** A text made ready for a renderer that is given a whole note at once: each paragraph begun with a tab starts with
    a mark the stylesheet sets as wide as the indent, in place of the white space Markdown would make code of. For
    showing only: never written anywhere. */
export function tabsForRender(text: string, mark = '<span class="binders-tab"></span>'): string {
	const at = new Set(tabLines(text));
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
