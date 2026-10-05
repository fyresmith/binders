/* The book model: what a binder is once it has been read for export, and the one thing every writer (Word now; the
   ebook, the pages and the Scrivener project after it) reads. Pure: no Obsidian, no file, no style. A style decides
   how a role is set; nothing here knows what a chapter looks like. The design is docs/export.md. */

/** A stretch of text set one way. */
export interface Text {
	kind: 'text';
	text: string;
	/** Italic, bold, struck through, code (as typed, monospaced). */
	i?: boolean; b?: boolean; s?: boolean; code?: boolean;
	/** A link out of the book (a web address). */
	href?: string;
	/** A link to a note of the vault, as the note wrote it: its words are `text`. A writer that can link inside the
	    book (the ebook) looks the note up; the others set the words. */
	to?: string;
}
/** What a paragraph is made of: text, the mark of a footnote (its place in `Book.notes`), a line break. */
export type Inline = Text | { kind: 'note'; note: number } | { kind: 'br' };

/** A picture, read: its bytes, what they are, and its size in pixels. */
export interface Picture { data: Uint8Array; type: 'png' | 'jpeg' | 'gif'; width: number; height: number }

export type Block =
	| { kind: 'p'; runs: Inline[] }
	/** A scene break: a rule typed in a note, or the join of two scenes. */
	| { kind: 'break' }
	/** A heading inside a note: a subheading of its chapter. */
	| { kind: 'heading'; level: number; runs: Inline[] }
	/** A quotation; a callout is one with a title. */
	| { kind: 'quote'; title?: Inline[]; blocks: Block[] }
	| { kind: 'list'; ordered: boolean; start: number; items: Block[][] }
	/** A table: its first row is its head. */
	| { kind: 'table'; align: ('left' | 'center' | 'right' | null)[]; rows: Inline[][][] }
	/** A fenced block: as typed, monospaced. */
	| { kind: 'code'; text: string }
	/** A picture: `src` as the note names it; `picture` once it has been found and read. */
	| { kind: 'image'; src: string; alt: string; picture?: Picture }
	/** Something embedded (`![[…]]`), until the book is put together: a note's text, a picture, or left out. */
	| { kind: 'embed'; target: string };

/** The part a note or folder plays in the book. `group`: a folder that only holds its notes together. `out`: left
    out (`export: false`). */
export type Role = 'part' | 'chapter' | 'scene' | 'front' | 'back' | 'group' | 'out';
/** The roles a writer can give by hand (`export-as`). */
export const ROLES = ['part', 'chapter', 'scene', 'front', 'back'] as const;

/** One of the four rules that say which folder and note is what. */
export type Structure = 'chapters' | 'parts' | 'parts-chapters' | 'notes';
/** Each as the binder note's `structure` says it, and as a sentence. */
export const STRUCTURES: Record<Structure, readonly [string, string]> = {
	chapters: ['chapters and scenes', 'Folders are chapters, notes are scenes'],
	parts: ['parts and chapters', 'Folders are parts, notes are chapters'],
	'parts-chapters': ['parts, chapters and scenes', 'Parts, chapters and scenes'],
	notes: ['every note a chapter', 'Every note is a chapter'],
};

/** A piece of the book that opens on a page of its own. */
export interface Section {
	role: 'part' | 'chapter' | 'front' | 'back';
	/** Its number among the parts or the chapters; null for one that has a name instead (a prologue), and for front
	    and back matter. */
	number: number | null;
	/** Its title: "" when its name was only a number ("Chapter 3"). */
	title: string;
	blocks: Block[];
	/** The notes (and the folder) it was made from, as paths in the vault. */
	paths: string[];
}

/** Something export had to leave out or change, with the note it is in. */
export interface Warning { path: string; name: string; text: string }

/** A row of "Contents": an item of the binder with the role it was given. */
export interface OutlineRow {
	name: string; path: string; depth: number; folder: boolean;
	role: Role;
	/** What the rule alone would have made it (the same, unless `export-as` says otherwise). */
	auto: Role;
	/** A part's or chapter's number, when it has one. */
	number: number | null;
}

export interface Book {
	title: string;
	author: string;
	/** A language tag (`en`, `en-GB`, `de`): which quotes are set, and what the file says it is written in. */
	language: string;
	structure: Structure;
	/** True when nobody chose the structure: it was guessed from the binder's shape. */
	guessed: boolean;
	sections: Section[];
	/** Every footnote, in the order their marks come in the text. */
	notes: Block[][];
	warnings: Warning[];
	outline: OutlineRow[];
}

/** The words of some text, as a writer counts them: runs of letters and digits (with the marks inside a word). */
export const countWords = (text: string): number => (text.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? []).length;

/** The text of inline content, without its footnote marks. */
export const plain = (runs: readonly Inline[]): string => runs.map((r) => (r.kind === 'text' ? r.text : r.kind === 'br' ? '\n' : '')).join('');

/** Every stretch of inline content in some blocks, in reading order (a quotation's title before its text). */
export function* inlines(blocks: readonly Block[]): Generator<Inline[]> {
	for (const b of blocks) {
		if (b.kind === 'p' || b.kind === 'heading') yield b.runs;
		else if (b.kind === 'quote') { if (b.title) yield b.title; yield* inlines(b.blocks); }
		else if (b.kind === 'list') for (const item of b.items) yield* inlines(item);
		else if (b.kind === 'table') for (const row of b.rows) for (const cell of row) yield cell;
	}
}

/** The text of some blocks, a line each: what is counted, and what a test reads. Code is in it, as typed. */
export function blocksText(blocks: readonly Block[]): string {
	const out: string[] = [];
	const walk = (list: readonly Block[]) => {
		for (const b of list) {
			if (b.kind === 'p' || b.kind === 'heading') out.push(plain(b.runs));
			else if (b.kind === 'quote') { if (b.title) out.push(plain(b.title)); walk(b.blocks); }
			else if (b.kind === 'list') for (const item of b.items) walk(item);
			else if (b.kind === 'table') for (const row of b.rows) for (const cell of row) out.push(plain(cell));
			else if (b.kind === 'code') out.push(b.text);
		}
	};
	walk(blocks);
	return out.join('\n');
}

/** How many words the book's text has: its sections' and its footnotes'. (Not the headings export makes.) */
export function bookWords(book: Book): number {
	return book.sections.reduce((n, s) => n + countWords(blocksText(s.blocks)), 0) + book.notes.reduce((n, b) => n + countWords(blocksText(b)), 0);
}

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
/** A number in words, as a chapter heading has it ("Twenty-One"); figures from a thousand on. */
export function numberWords(n: number): string {
	if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
	if (n < 20) return ONES[n];
	if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
	return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`;
}
