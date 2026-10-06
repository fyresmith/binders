import { parseBody } from '../export/markdown';
import { blocksText, countWords, inlines, type Block, type Role } from '../export/model';
import { lf, parts, stripComments } from '../scene-text';

/* A note's words as the exported book has them: the one rule for what a word of the book is, which is export's.
   Nothing is decided here. A note is read by export's own reader (export/markdown.ts) and its words are counted by
   export's own `countWords` and `blocksText` (export/model.ts), so a card, the toolbar and a target say what the
   export window says. The rule, row by row, is in docs/dev/plan.md, "What a word of the book is". Pure.

   Export's reader is a full Markdown parser, and too slow to run at every count (half a second on a note of 100,000
   words). So only the lines that need it are read by it. A line of plain prose (letters, digits, spaces and the
   punctuation of a sentence: nothing Markdown or Obsidian gives a meaning to) has the same words whatever is around
   it, in a paragraph, a list, a quotation, a code block or a footnote, so it is counted as it stands; in the text
   the parser is handed, a full stop stands in its place, which keeps every other line in the paragraph, the list or
   the block it was in. tests/book-words.test.ts holds the two to each other on every note and binder of the demo
   vault: if this ever counts a word export doesn't, that fails. */

/** A note, read for its words. */
export interface BookRead {
	/** The words of its own text and of its footnotes. */
	words: number;
	/** How many of them go when its first block is a level-one heading and the note opens a section: the heading is
	    the section's title, which export sets itself and doesn't count (a footnote marked only there goes with it). */
	title: number;
	/** The notes and files it embeds (`![[…]]`), as it names them, once for each time. */
	embeds: string[];
	/** What it embeds and shows before any text of its own: what may turn out to be nothing, so that what follows
	    is the first block after all. */
	lead: { target: string; image?: boolean }[];
	/** What comes after those: a level-one heading, something else, or nothing. */
	first: 'h1' | 'other' | 'none';
}

/** What a note embeds, found: a note (read), a picture, or nothing that export can bring in. */
export type Found = { note: BookRead } | 'picture' | null;

/** Does a note with this role open a section of the book? (A scene is added to the chapter that is open.) */
export const opensSection = (role: Role): boolean => role === 'part' || role === 'chapter' || role === 'front' || role === 'back';

/** The words of some blocks and of the footnotes marked in them (each once, and a footnote's own marks followed),
    and what they embed: as `bookWords` and `renumber` in export have it. */
function measure(blocks: readonly Block[], notes: readonly Block[][]): { words: number; embeds: string[] } {
	const seen = new Set<number>(), embeds: string[] = [];
	let words = 0;
	const embedded = (list: readonly Block[]) => {
		for (const b of list) {
			if (b.kind === 'embed') embeds.push(b.target);
			else if (b.kind === 'quote') embedded(b.blocks);
			else if (b.kind === 'list') b.items.forEach(embedded);
		}
	};
	const visit = (list: readonly Block[]) => {
		words += countWords(blocksText(list));
		embedded(list);
		for (const runs of inlines(list)) for (const r of runs) {
			if (r.kind !== 'note' || seen.has(r.note) || !notes[r.note]) continue;
			seen.add(r.note);
			visit(notes[r.note]);
		}
	};
	visit(blocks);
	return { words, embeds };
}

/** A note's text (without its properties) read by export's parser alone: the slow way, and the one the light
    counter is held to. */
export function readBodyByParser(body: string): BookRead {
	const { blocks, notes } = parseBody(body), all = measure(blocks, notes);
	let at = 0;
	const lead: BookRead['lead'] = [];
	for (; at < blocks.length; at++) {
		const b = blocks[at];
		if (b.kind === 'embed') lead.push({ target: b.target }); else if (b.kind === 'image') lead.push({ target: b.src, image: true }); else break;
	}
	const head = blocks[at], h1 = head?.kind === 'heading' && head.level === 1;
	// (the title's words: what the note has with the heading, less what it has without it)
	const title = h1 ? all.words - measure([...blocks.slice(0, at), ...blocks.slice(at + 1)], notes).words : 0;
	return { words: all.words, title, embeds: all.embeds, lead, first: h1 ? 'h1' : head ? 'other' : 'none' };
}

/** A line of plain prose: it starts with a letter, a digit, a quote, a bracket or a dash, and has nothing in it but
    those, spaces, a sentence's punctuation, and the marks of emphasis (see `JOINS`). No other mark of Markdown's
    or Obsidian's is among them. */
const PLAIN = /^[ \t]*[\p{L}\p{N}"'“”‘’«»(—–…¿¡][\p{L}\p{N}\p{M}\p{Zs}\t.,;:!?"'“”‘’«»‹›()—–…¿¡\-/%@+*_]*$/u;
/** Marks of emphasis that could join two pieces of a word if Markdown took them away ("un*believ*able" is one word,
    "snake_case" is two): a line with one of these is the parser's. Anywhere else (`*so* she said`, `*never*.`) the
    words are the same whether the marks are emphasis or stand as typed, so nobody has to know which. */
const JOINS = /[\p{L}\p{N}\p{M}'’.,-][*_]+(?:[\p{L}\p{N}\p{M}]|['’.,-][\p{L}\p{N}\p{M}'’.,*_-])/u;
/** A line a list's number would begin ("1986. A year": the number is the list's, not a word). */
const NUMBERED = /^[ \t]*\d+[.)]/;
/** A footnote or a link written out under a label (in a quotation or a list, too): the lines after it may be its own. */
const DEFINED = /^[ \t>]*(?:(?:[-+*]|\d+[.)])[ \t]+)*\[(\^?)[^\]]*\]:/;
const INDENT = /^[ \t]*/, STAND = /^[ \t]*\.$/;

/** A note's text (without its properties), read. The same as `readBodyByParser`, and fast. */
export function readBody(body: string): BookRead {
	// (the two characters export keeps for its own use, and a comment's marks left over once comments are out: rare
	// enough to leave to the parser whole)
	if (/[]/.test(body)) return readBodyByParser(body);
	const text = stripComments(lf(body));
	if (text.includes('%%') || text.includes('<!--')) return readBodyByParser(body);
	const out: string[] = [];
	let words = 0, needed = false;
	// after a footnote written out: its lines, until a line at the margin after a blank one. After a link's: two lines.
	let note = false, blank = false, link = 0;
	for (const line of text.split('\n')) {
		const empty = !line.trim();
		if (note && blank && !empty && !/^(?: {4}|\t| {1,3}\t)/.test(line)) note = false;
		blank = empty;
		if (empty) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
		const own = note || link > 0;
		if (link > 0) link--;
		if (!own && PLAIN.test(line) && !NUMBERED.test(line) && !JOINS.test(line)) {
			words += countWords(line);
			// one full stop for a run of such lines, at their indent
			const stand = INDENT.exec(line)[0] + '.';
			if (out[out.length - 1] !== stand) out.push(stand);
			continue;
		}
		const d = DEFINED.exec(line);
		if (d) { if (d[1]) note = true; else link = 2; }
		needed = true;
		out.push(line);
	}
	if (!needed) return { words, title: 0, embeds: [], lead: [], first: out.some((l) => l) ? 'other' : 'none' };
	// (and one for paragraphs of nothing else, one after another: the second is a paragraph between two blank lines
	// after one that ends the same way, and nothing is read differently for its going)
	const kept: string[] = [];
	for (let i = 0; i < out.length; i++) {
		const l = out[i], k = kept.length;
		if (STAND.test(l) && (i + 1 >= out.length || out[i + 1] === '') && k >= 2 && kept[k - 1] === '' && kept[k - 2] === l) { i++; continue; }
		kept.push(l);
	}
	const read = readBodyByParser(kept.join('\n'));
	return { ...read, words: read.words + words };
}

/** A whole note, properties and all: they are no part of the book. */
export const readWords = (text: string): BookRead => readBody(parts(text).body);

/** The words of the title a note gives the section it opens: its level-one heading, if that is its first block once
    what it embeds is brought in (a note embedded first that begins with one gives its own; one that isn't there, or
    a picture that isn't, is left out, and the next block is the first). */
function titleWords(read: BookRead, find: (target: string, image: boolean) => Found): number {
	for (const l of read.lead) {
		const got = find(l.target, !!l.image);
		if (got === 'picture') return 0;
		// (a picture shown by `![](…)` that turns out to be a note is left out, as one that isn't there is)
		if (!got || l.image) continue;
		// what an embedded note embeds itself is left out, but for its pictures
		if (got.note.lead.some((x) => find(x.target, !!x.image) === 'picture')) return 0;
		if (got.note.first === 'h1') return got.note.title;
		if (got.note.first === 'other') return 0;
	}
	return read.first === 'h1' ? read.title : 0;
}

/** A note's words in the book: its own, those of the notes it embeds (a whole note, one level deep, each time it is
    embedded), less the title of the section it opens. `find` looks up what it embeds, as export does. */
export function inBook(read: BookRead, opens: boolean, find: (target: string, image: boolean) => Found): number {
	let n = read.words;
	for (const target of read.embeds) { const got = find(target, false); if (got && got !== 'picture') n += got.note.words; }
	return opens && (read.first === 'h1' || read.lead.length) ? n - titleWords(read, find) : n;
}
