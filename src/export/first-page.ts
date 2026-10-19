import type { Book, Section } from './model';

/* The short story's title: on the first page of the text, not a page of its own (`titlePage: 'first page'` in a
   manuscript style). Contact details and the count are at the top, the title a few lines down, and the story begins
   under it on the same page. What both writers (Word and the PDF's pages) and the preview need to agree on. Pure. */

/** The section the story begins with, which shares its first page with the title; null when the book has none. */
export const openingSection = (book: Book): Section | null => book.sections.find((s) => !s.made) ?? null;

/** A story of one chapter needs no heading over it ("Chapter One" under the title says nothing): what the story is
    called is the title above it. A book of several chapters has its headings as ever. */
export function loneChapter(book: Book): boolean {
	const text = book.sections.filter((s) => !s.made);
	return text.length === 1 && text[0].role === 'chapter';
}

/** How far down the first page the title stands, below the contact details, in lines of the text (about a quarter of the page). */
export const TITLE_LINES = 7;
