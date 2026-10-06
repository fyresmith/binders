import { numberWords, type Section } from './model';

/* A book style: how each role is set, in the ebook and (from step 3) on the pages. A style is data, under the very
   names a `.bookstyle` file has for them (docs/dev/export.md, "The style's file"), so the editor and the files of a later
   step read and write this shape and nothing here changes. Built in so far: Classic. Pure.

   An ebook takes its shape from a style (headings, breaks, indents, first words) and leaves the typeface, the size,
   the margins and what runs along a page to the reader: those values are here for the pages. */

export interface BookStyle {
	/** The style's name: a built-in one's, or its file's. */
	name: string;
	typeface: string;
	/** In points. */
	'type-size': number;
	/** A multiple of the size. */
	'line-spacing': number;
	paragraphs: 'indented' | 'spaced';
	alignment: 'justified' | 'left';
	quotes: 'typeset' | 'as typed';
	/** The chapter's heading: `{number}`, `{number:words}`, `{number:roman}`, `{title}`; `/` starts a new line; a
	    line whose `{title}` is empty is dropped. */
	'chapter-heading': string;
	'heading-lettering': 'small capitals' | 'capitals' | 'italic' | 'as typed';
	'heading-size': 'small' | 'medium' | 'large';
	'heading-alignment': 'centre' | 'left';
	/** How far down its page a chapter begins, in hundredths of the page. */
	'space-above': number;
	'chapter-opens': 'right-hand page' | 'next page';
	'first-words': 'small capitals' | 'as the rest';
	/** The scene break's mark; "" for space only. */
	'scene-break': string;
	'running-heads': 'author and title' | 'title' | 'none';
	'page-numbers': 'foot' | 'top outside' | 'none';
	margins: 'narrow' | 'normal' | 'wide';
	/** CSS of the writer's own, from the style's file: added after Binders' rules. */
	css?: string;
}

export const CLASSIC: BookStyle = {
	name: 'Classic',
	typeface: 'EB Garamond', 'type-size': 11, 'line-spacing': 1.36, paragraphs: 'indented', alignment: 'justified', quotes: 'typeset',
	'chapter-heading': 'Chapter {number:words} / {title}', 'heading-lettering': 'small capitals', 'heading-size': 'small', 'heading-alignment': 'centre',
	'space-above': 22, 'chapter-opens': 'right-hand page', 'first-words': 'small capitals',
	'scene-break': '* * *', 'running-heads': 'author and title', 'page-numbers': 'foot', margins: 'normal',
};

/** The book styles built in. The first is what a book starts as. */
export const BOOK_STYLES: readonly BookStyle[] = [CLASSIC];
export const bookStyle = (name: unknown): BookStyle => BOOK_STYLES.find((s) => s.name === name) ?? BOOK_STYLES[0];

/** The few words export itself writes into a book, in the book's language: "Chapter 3", "Part 2" (`{n}` is the
    number), the contents page's heading, the notes' name. A language that isn't here gets none of them: a number
    alone for a chapter, the book's own title over its contents. */
const WORDS: Record<string, readonly [chapter: string, part: string, contents: string, notes: string]> = {
	en: ['Chapter {n}', 'Part {n}', 'Contents', 'Notes'],
	fr: ['Chapitre {n}', 'Partie {n}', 'Table des matières', 'Notes'],
	de: ['Kapitel {n}', 'Teil {n}', 'Inhalt', 'Anmerkungen'],
	es: ['Capítulo {n}', 'Parte {n}', 'Índice', 'Notas'],
	it: ['Capitolo {n}', 'Parte {n}', 'Indice', 'Note'],
	pt: ['Capítulo {n}', 'Parte {n}', 'Sumário', 'Notas'],
	nl: ['Hoofdstuk {n}', 'Deel {n}', 'Inhoud', 'Noten'],
	sv: ['Kapitel {n}', 'Del {n}', 'Innehåll', 'Noter'],
	da: ['Kapitel {n}', 'Del {n}', 'Indhold', 'Noter'],
	nb: ['Kapittel {n}', 'Del {n}', 'Innhold', 'Noter'],
	pl: ['Rozdział {n}', 'Część {n}', 'Spis treści', 'Przypisy'],
	ru: ['Глава {n}', 'Часть {n}', 'Содержание', 'Примечания'],
	el: ['Κεφάλαιο {n}', 'Μέρος {n}', 'Περιεχόμενα', 'Σημειώσεις'],
	ar: ['الفصل {n}', 'الجزء {n}', 'المحتويات', 'الهوامش'],
	he: ['פרק {n}', 'חלק {n}', 'תוכן העניינים', 'הערות'],
	ja: ['第{n}章', '第{n}部', '目次', '注'],
	zh: ['第{n}章', '第{n}部', '目录', '注释'],
	ko: ['제{n}장', '제{n}부', '차례', '주'],
};
const wordsFor = (language: string) => WORDS[language.slice(0, 2).toLowerCase()];
const english = (language: string) => language.slice(0, 2).toLowerCase() === 'en';

/** The contents page's heading and the notes' name in the book's language; "" where Binders doesn't know them. */
export const bookWord = (what: 'contents' | 'notes', language: string): string => wordsFor(language)?.[what === 'contents' ? 2 : 3] ?? '';

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n: number): string {
	if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
	let out = '';
	for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
	return out;
}

/** A number as a pattern asks for it. In words only in English: other languages have figures. */
const numbered = (n: number, how: string | undefined, language: string): string => (how === 'roman' ? roman(n) : how === 'words' && english(language) ? numberWords(n) : String(n));

/** A section's heading as a style sets it, a line each.
    - A numbered chapter follows the style's pattern. The pattern's own word "Chapter" is the book's language's
      (`Chapitre 3`), and is dropped in a language Binders has no word for: the number stands alone.
    - A part is "Part" and its number, as the chapters have theirs (words, figures, Roman), then its title.
    - Anything without a number (a prologue, a dedication) is its title. */
export function bookHeading(style: BookStyle, s: Pick<Section, 'role' | 'number' | 'title'>, language = 'en'): string[] {
	if (s.number == null) return s.title ? [s.title] : [];
	const pattern = style['chapter-heading'], how = /\{number(?::(\w+))?\}/.exec(pattern)?.[1], words = wordsFor(language);
	const word = (at: 0 | 1, n: string) => (words ? words[at].replace('{n}', n) : n);
	if (s.role === 'part') return [word(1, numbered(s.number, how, language)), s.title].filter((l) => l);
	const n = s.number;
	return pattern.split('/').map((line) => {
		if (line.includes('{title}') && !s.title) return '';
		return line
			.replace(/\bChapter\s+\{number(?::(\w+))?\}/g, (_m, h?: string) => word(0, numbered(n, h, language)))
			.replace(/\{number(?::(\w+))?\}/g, (_m, h?: string) => numbered(n, h, language))
			.replace(/\{title\}/g, s.title).trim();
	}).filter((l) => l);
}

/** Whether some text is set against the book: it has letters of a right-to-left script in a left-to-right book, or
    has letters and none of those in a right-to-left one. Such a paragraph is marked to take its own direction. */
export function against(text: string, language: string): boolean {
	const has = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.test(text);
	return isRtl(language) ? !has && /\p{L}/u.test(text) : has;
}

/** Languages written from right to left. */
export const isRtl = (language: string): boolean => /^(ar|he|fa|ur|yi|ps|sd|ug|dv)\b/i.test(language);
