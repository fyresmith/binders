import { roman } from '../style';
import type { Opened } from './fill';

/* What runs along a page beside its text: the running head and the page's number. Which pages have them, what they
   say and how the pages are counted are decided here, from the pages the paginator opened. Pure. */

export interface Furnish {
	/** What runs along the top of a page of text. `header`: a manuscript's one line, `{page}` being the number. */
	heads: 'author and title' | 'title' | 'none';
	numbers: 'foot' | 'top outside' | 'none';
	title: string;
	author: string;
	header?: string;
	/** For each section: whether it is front matter (counted in Roman numerals, with no running head). */
	front: readonly boolean[];
}

export interface Furniture {
	/** An odd page: a right-hand one in a book read from left to right. */
	odd: boolean;
	/** The page's number as it is printed, and as the contents give it: "" for a page that isn't counted. */
	number: string;
	/** What is printed: the head's words, and the number at the foot or in the head. */
	head: string;
	folio: '' | 'foot' | 'head';
}

/** Each page's head and number.
    - Front matter is counted in small Roman numerals from the first page; the text starts again at 1, on the first
      page of the first part or chapter. So the contents can be as long as they like without moving a page number.
    - A blank page and a display page (a title page, a dedication, a part's own page) are counted and show nothing.
    - A section's first page has no running head, and its number at the foot.
    - A manuscript counts from its first page of text, and every page of text has its header. */
export function furnish(pages: readonly Opened[], o: Furnish): Furniture[] {
	const isFront = (p: Opened) => p.section < 0 || o.front[p.section];
	let start = pages.findIndex((p) => p.section >= 0 && !o.front[p.section]);
	if (start < 0) start = pages.length;
	// (a manuscript: the title page is before the count, and nothing is in Roman numerals)
	if (o.header !== undefined) start = pages.findIndex((p) => p.kind !== 'display' && p.kind !== 'blank');
	return pages.map((p, i) => {
		const counted = o.header !== undefined ? i >= start && start >= 0 : true;
		const number = !counted ? '' : i < start ? roman(i + 1).toLowerCase() : String(i - start + 1);
		const odd = i % 2 === 0, shown = p.kind === 'opener' || p.kind === 'body';
		if (o.header !== undefined) return { odd, number, head: shown ? o.header.replace('{page}', number) : '', folio: '' as const };
		if (!shown || o.numbers === 'none' && (o.heads === 'none' || p.kind === 'opener' || isFront(p))) return { odd, number, head: '', folio: '' as const };
		const plain = p.kind === 'opener' || isFront(p);
		const head = plain || o.heads === 'none' ? '' : o.heads === 'title' || odd ? o.title : o.author || o.title;
		const folio = o.numbers === 'none' ? '' : o.numbers === 'top outside' && !plain ? 'head' : 'foot';
		return { odd, number, head, folio };
	});
}
