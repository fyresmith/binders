import type { ManuscriptStyle } from '../docx-parts';
import type { BookStyle } from '../style';

/* The page's measures: the sizes a book or a manuscript can be printed at, and, for a style on one of them, where
   the text block sits and how many lines it holds. Everything is in points (72 to the inch). The block is a whole
   number of lines, so every page of the book ends on the same line. Pure. The design is docs/dev/export.md. */

export interface PageSize { id: string; name: string; width: number; height: number }

const inch = (w: number, h: number, name = `${w} × ${h} in`): PageSize => ({ id: `${w}x${h}`, name, width: w * 72, height: h * 72 });
/** The trim sizes a paperback can have: the common ones between KDP's 5 × 8 and 6 × 9, and A5. The first is the default. */
export const TRIM_SIZES: readonly PageSize[] = [inch(5, 8), inch(5.25, 8), inch(5.5, 8.5), inch(6, 9), { id: 'a5', name: 'A5', width: 419.53, height: 595.28 }];
/** The paper a manuscript is printed on. */
export const PAPER_SIZES: readonly PageSize[] = [{ id: 'letter', name: 'Letter', width: 612, height: 792 }, { id: 'a4', name: 'A4', width: 595.28, height: 841.89 }];
export const trimSize = (id: unknown): PageSize => TRIM_SIZES.find((s) => s.id === id) ?? TRIM_SIZES[0];
export const paperSize = (id: unknown): PageSize => PAPER_SIZES.find((s) => s.id === id) ?? PAPER_SIZES[0];

/** The least the inside margin may be for a book of so many pages, in points: the printers' table (KDP's). */
export function gutter(pages: number): number {
	return 72 * (pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875);
}

/** Where a page's text is, and how it is set. */
export interface Geometry {
	width: number; height: number;
	/** The margins: `inside` is at the spine. A manuscript's are the same on both sides. */
	inside: number; outside: number; top: number;
	/** The type's size and the distance from line to line. */
	size: number; lead: number;
	/** How many lines the text block holds, and its height (`lines × lead`). */
	lines: number; block: number;
	/** How far down its page a chapter's heading begins. */
	sink: number;
}

/** The margins by name on a 5 × 8 in page: inside, outside, top, and the room kept under the text (the page number
    is in it). A larger page has them larger in proportion. */
const MARGINS: Record<BookStyle['margins'], readonly [number, number, number, number]> = { narrow: [0.6, 0.4, 0.68, 0.76], normal: [0.7, 0.5, 0.78, 0.82], wide: [0.82, 0.62, 0.86, 0.9] };

/** A book style's page. `pages`: how many the book has (or is thought to have): a thick book needs more at the spine. */
export function bookGeometry(style: BookStyle, page: PageSize, pages = 0): Geometry {
	const [i, o, t, b] = MARGINS[style.margins] ?? MARGINS.normal, wide = page.width / 360, tall = page.height / 576;
	const size = clamp(Number(style['type-size']) || 11, 6, 24), lead = Math.round(size * clamp(Number(style['line-spacing']) || 1.36, 1, 3) * 4) / 4;
	const top = t * 72 * tall, lines = Math.max(4, Math.floor((page.height - top - b * 72 * tall) / lead));
	const sink = Math.round(lines * clamp(Number(style['space-above']) || 0, 0, 60) / 100) * lead;
	return { width: page.width, height: page.height, inside: Math.max(i * 72 * wide, gutter(pages)), outside: o * 72 * wide, top, size, lead, lines, block: lines * lead, sink };
}

/** A manuscript's page: an inch all round, twelve-point type, the lines as far apart as the style says. */
export function manuscriptGeometry(style: ManuscriptStyle, page: PageSize): Geometry {
	const lead = style.lineSpacing === 'double' ? 24 : style.lineSpacing === 'single' ? 14 : 18, lines = Math.floor((page.height - 144) / lead);
	return { width: page.width, height: page.height, inside: 72, outside: 72, top: 72, size: 12, lead, lines, block: lines * lead, sink: style.chapterStarts === 'at the top' ? 0 : Math.round(lines / 3) * lead };
}

/** About how many pages so many words come to, before anything is laid out: enough to choose the inside margin. */
export function estimatePages(words: number, g: Geometry): number {
	const perLine = (g.width - g.inside - g.outside) / (g.size * 0.42) / 6;
	return Math.ceil(words / Math.max(1, perLine * g.lines * 0.9));
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
