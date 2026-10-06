import { MANUSCRIPT_STYLES, type ManuscriptStyle } from './docx-parts';
import { BOOK_STYLES, TYPEFACES, type BookStyle } from './style';

/* What a style is made of, one row each: the property a `.bookstyle` file has for it, what the style editor calls
   it, and the values it can take. The editor's rows, the file's properties and what is checked when a file is read
   are this one table, so they can't drift apart. Two families: book styles (the ebook and the pages) and manuscript
   styles (Word). Pure. The design is docs/dev/export.md, "Styles"; the file is docs/dev/file-format.md, "Export styles". */

export type Family = 'book' | 'manuscript';
export type StyleValue = string | number | boolean;
export type StyleValues = Record<string, StyleValue>;

export interface Row {
	/** The property's name in the file. */
	key: string;
	/** What the editor calls it. */
	name: string;
	/** `pick`: one of `options`. `slide`: a number from `min` to `max`. `mark`: a scene break's mark, one of
	    `options` or a few characters of the writer's own. `pattern`: a chapter heading, likewise. */
	kind: 'pick' | 'slide' | 'mark' | 'pattern';
	options?: readonly (readonly [value: StyleValue, label: string])[];
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	/** A book style's row that is the pages' alone: in an ebook the reader decides it. */
	pages?: boolean;
}
export interface Group { name: string; rows: readonly Row[] }

/** The chapter headings the editor offers by name; any other pattern is "Your own". */
export const HEADINGS: readonly (readonly [string, string])[] = [
	['Chapter {number:words}', 'Chapter One'], ['Chapter {number}', 'Chapter 1'], ['{number:words}', 'One'], ['{number}', '1'], ['{number:roman}', 'I'],
	['Chapter {number:words} / {title}', 'Chapter One, then its title'], ['{number} / {title}', '1, then its title'], ['{title}', 'Its title only'],
];
const MARKS: readonly (readonly [string, string])[] = [['* * *', '* * *'], ['#', '#'], ['⁂', '⁂'], ['—', '—'], ['', 'Space only']];
/** The longest mark or pattern of the writer's own that is taken. */
export const MARK_MAX = 12, PATTERN_MAX = 80;

const BOOK: readonly Group[] = [
	{ name: 'Text', rows: [
		{ key: 'typeface', name: 'Typeface', kind: 'pick', options: TYPEFACES.map((t) => [t, t.replace(/ \d+$/, '')] as const), pages: true },
		{ key: 'type-size', name: 'Size', kind: 'slide', min: 9, max: 13, step: 0.5, unit: ' pt', pages: true },
		{ key: 'line-spacing', name: 'Line spacing', kind: 'slide', min: 1.2, max: 1.6, step: 0.01, pages: true },
		{ key: 'paragraphs', name: 'Paragraphs', kind: 'pick', options: [['indented', 'First line indented'], ['spaced', 'Space between']] },
		{ key: 'alignment', name: 'Lines', kind: 'pick', options: [['justified', 'Justified, hyphenated'], ['left', 'Ragged right']], pages: true },
		{ key: 'quotes', name: 'Quotes and dashes', kind: 'pick', options: [['typeset', 'Curly, typeset'], ['as typed', 'As typed']] },
	] },
	{ name: 'Chapters', rows: [
		{ key: 'chapter-heading', name: 'Heading', kind: 'pattern', options: HEADINGS },
		{ key: 'heading-lettering', name: 'Lettering', kind: 'pick', options: [['small capitals', 'Small capitals'], ['capitals', 'Capitals'], ['as typed', 'Plain'], ['italic', 'Italic']] },
		{ key: 'heading-size', name: 'Heading size', kind: 'pick', options: [['small', 'As the text'], ['medium', 'Larger'], ['large', 'Large']] },
		{ key: 'heading-alignment', name: 'Placed', kind: 'pick', options: [['centre', 'In the middle'], ['left', 'At the left']] },
		{ key: 'space-above', name: 'Space above', kind: 'slide', min: 0, max: 40, step: 2, unit: '%', pages: true },
		{ key: 'chapter-opens', name: 'Opens on', kind: 'pick', options: [['right-hand page', 'A right-hand page'], ['next page', 'The next page']], pages: true },
		{ key: 'first-words', name: 'First words', kind: 'pick', options: [['small capitals', 'Small capitals'], ['as the rest', 'As the rest']] },
	] },
	{ name: 'Scene breaks', rows: [{ key: 'scene-break', name: 'Mark', kind: 'mark', options: MARKS }] },
	{ name: 'Pages', rows: [
		{ key: 'running-heads', name: 'Along the top', kind: 'pick', options: [['author and title', 'Author and title'], ['title', 'Title'], ['none', 'Nothing']], pages: true },
		{ key: 'page-numbers', name: 'Page numbers', kind: 'pick', options: [['foot', 'At the foot'], ['top outside', 'At the top, outside'], ['none', 'None']], pages: true },
		{ key: 'margins', name: 'Margins', kind: 'pick', options: [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide']], pages: true },
	] },
];

const MANUSCRIPT: readonly Group[] = [
	{ name: 'Text', rows: [
		{ key: 'typeface', name: 'Typeface', kind: 'pick', options: [['Times New Roman', 'Times New Roman'], ['Courier New', 'Courier']] },
		{ key: 'line-spacing', name: 'Line spacing', kind: 'pick', options: [['double', 'Double'], ['one and a half', 'One and a half'], ['single', 'Single']] },
		{ key: 'italics', name: 'Italics', kind: 'pick', options: [['italic', 'Italic'], ['underlined', 'Underlined']] },
	] },
	{ name: 'Chapters and breaks', rows: [
		{ key: 'chapter-starts', name: 'A chapter starts', kind: 'pick', options: [['a third of the way down', 'A third of the way down a new page'], ['at the top', 'At the top of a new page']] },
		{ key: 'scene-break', name: 'Scene break', kind: 'mark', options: [['#', '#'], ['***', '***'], ['* * *', '* * *']] },
	] },
	{ name: 'Pages', rows: [
		{ key: 'header', name: 'Along the top', kind: 'pick', options: [['Surname / TITLE / page', 'Surname / TITLE / page'], ['page', 'The page number'], ['none', 'Nothing']] },
		{ key: 'title-page', name: 'Title page', kind: 'pick', options: [[true, 'With contact details and word count'], [false, 'None']] },
	] },
];

export const GROUPS: Record<Family, readonly Group[]> = { book: BOOK, manuscript: MANUSCRIPT };
export const rowsOf = (family: Family): Row[] => GROUPS[family].flatMap((g) => g.rows);

/** A value as a file has it, read for a row: the value, or undefined when it can't be read as one. */
export function readValue(row: Row, raw: unknown): StyleValue | undefined {
	if (row.kind === 'slide') {
		const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(raw) ? Number(raw) : NaN;
		return Number.isFinite(n) && n >= (row.min ?? -Infinity) && n <= (row.max ?? Infinity) ? n : undefined;
	}
	if (row.kind === 'pick') {
		const said = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
		for (const [v] of row.options ?? []) if (v === raw || (typeof v === 'string' && v.toLowerCase() === said)) return v;
		return undefined;
	}
	// (a mark may be nothing at all: space only. A pattern must say something.)
	if (typeof raw === 'number') raw = String(raw);
	if (typeof raw !== 'string' || /[\r\n]/.test(raw)) return undefined;
	const s = raw.trim();
	if (row.kind === 'mark') return s.length <= MARK_MAX ? s : undefined;
	return s && s.length <= PATTERN_MAX ? s : undefined;
}

// ---- a style as its values, and back ----

const M_KEYS: readonly (readonly [string, keyof ManuscriptStyle])[] = [['typeface', 'typeface'], ['line-spacing', 'lineSpacing'], ['italics', 'italics'], ['chapter-starts', 'chapterStarts'], ['scene-break', 'sceneBreak'], ['header', 'header'], ['title-page', 'titlePage']];

export const bookValues = (s: BookStyle): StyleValues => Object.fromEntries(rowsOf('book').map((r) => [r.key, (s as unknown as StyleValues)[r.key]]));
export const manuscriptValues = (s: ManuscriptStyle): StyleValues => Object.fromEntries(M_KEYS.map(([k, f]) => [k, s[f]]));
/** Values (every row's, checked) as the style the writers read. */
export const toBookStyle = (name: string, v: StyleValues, css = ''): BookStyle => ({ name, ...(v as unknown as Omit<BookStyle, 'name'>), ...(css.trim() ? { css } : {}) });
export const toManuscriptStyle = (name: string, v: StyleValues): ManuscriptStyle => ({ name, ...Object.fromEntries(M_KEYS.map(([k, f]) => [f, v[k]])) } as unknown as ManuscriptStyle);

/** The styles built in, by name: each family's first is what a book starts as. */
export const BUILT_IN: ReadonlyMap<string, { family: Family; values: StyleValues }> = new Map<string, { family: Family; values: StyleValues }>([
	...BOOK_STYLES.map((s) => [s.name, { family: 'book' as const, values: bookValues(s) }] as const),
	...MANUSCRIPT_STYLES.map((s) => [s.name, { family: 'manuscript' as const, values: manuscriptValues(s) }] as const),
]);
export const FIRST: Record<Family, string> = { book: BOOK_STYLES[0].name, manuscript: MANUSCRIPT_STYLES[0].name };
