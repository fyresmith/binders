import type { Contents } from './book';
import type { Structure } from './model';
import { readStructure } from './roles';
import { STRUCTURES, numberWords } from './model';

/* Book details: what every export of a binder shares, kept as properties of its binder note (docs/dev/file-format.md,
   "Export"). Here they are read from a note's properties and put back into them, and a language is checked. Pure:
   the window is view/book-details.ts, and the writing to the note is in export.ts. */

export interface Details {
	title: string;
	subtitle: string;
	author: string;
	/** The structure rule; null while it is guessed. */
	structure: Structure | null;
	/** The cover: a picture in the vault, by its path or name; "" for none. */
	cover: string;
	/** The copyright line (lines); "" for the one Binders makes. */
	copyright: string;
	/** A language tag, checked; "" when none is said (then English). */
	language: string;
	titlePage: boolean;
	contents: Contents;
	bookStyle: string;
	manuscriptStyle: string;
	/** The page a paperback was last made at (a trim size's id); "" for the usual one. */
	pageSize: string;
	// publishing: on the title and copyright pages, and in the ebook's own description of itself
	series: string;
	seriesNumber: string;
	publisher: string;
	edition: string;
	/** When it is published: a date (2026-11-03) or a year. */
	published: string;
	description: string;
	keywords: string[];
	contributors: Contributor[];
	/** More lines for the copyright page ("All rights reserved.", a disclaimer). */
	rights: string;
}

export interface Contributor { role: string; name: string }
export const CONTRIBUTOR_ROLES: [string, string][] = [['editor', 'Editor'], ['translator', 'Translator'], ['illustrator', 'Illustrator'], ['cover designer', 'Cover designer'], ['narrator', 'Narrator']];

/** The binder note's properties that are a book's details: the only ones Book details ever writes. */
export const DETAIL_PROPS = ['title', 'subtitle', 'author', 'structure', 'cover', 'copyright', 'language', 'title-page', 'contents-page', 'book-style', 'manuscript-style', 'page-size', 'series', 'series-number', 'publisher', 'edition', 'published', 'description', 'keywords', 'contributors', 'rights'] as const;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
/** A property that names a file, as its path or name: `[[cover.png]]`, `[[Art/cover.png|the cover]]`, `Art/cover.png`. */
export const linked = (v: unknown): string => { const s = text(v), m = /^!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/.exec(s); return (m ? m[1] : s).trim(); };

/** A language tag as the standard writes it (`en-GB`, `zh-Hant`, `pt-BR`), or null for anything that isn't one: a
    language of two or three letters, then a script and a region if said. */
export function languageTag(v: unknown): string | null {
	const s = text(v).replace(/_/g, '-');
	const m = /^([a-z]{2,3})(?:-([a-z]{4}))?(?:-([a-z]{2}|\d{3}))?$/i.exec(s);
	if (!m) return null;
	const tag = [m[1].toLowerCase(), m[2] ? m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : '', m[3]?.toUpperCase() ?? ''].filter((p) => p).join('-');
	try { return Intl.getCanonicalLocales(tag)[0] ?? null; } catch { return null; }
}

/** The languages Book details offers. (A tag typed into the note that isn't here is kept, and shown as itself.) */
export const LANGUAGES: readonly string[] = ['en', 'en-GB', 'en-US', 'en-AU', 'en-CA', 'af', 'ar', 'bg', 'ca', 'cs', 'cy', 'da', 'de', 'de-AT', 'de-CH', 'el', 'es', 'es-MX', 'et', 'fa', 'fi', 'fr', 'fr-CA', 'ga', 'he', 'hi', 'hr', 'hu', 'id', 'is', 'it', 'ja', 'ko', 'lt', 'lv', 'nb', 'nl', 'pl', 'pt', 'pt-BR', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'th', 'tr', 'uk', 'ur', 'vi', 'zh-Hans', 'zh-Hant'];

/** A language's name, in the language Obsidian is shown in where the system can say it; else its tag. */
export function languageName(tag: string, shownIn = 'en'): string {
	try {
		const name = new Intl.DisplayNames([shownIn, 'en'], { type: 'language' }).of(tag);
		return name && name !== tag ? name[0].toUpperCase() + name.slice(1) : tag;
	} catch { return tag; }
}

/** "Editor: Jane Doe", as a contributor is written in the note. */
function contributor(v: unknown): Contributor | null {
	const m = /^\s*([^:]+?)\s*:\s*(.+?)\s*$/.exec(text(v));
	return m ? { role: m[1].toLowerCase(), name: m[2] } : null;
}

const CONTENTS: Record<string, Contents> = { always: 'always', never: 'never', 'when chapters have titles': 'titled' };

/** A binder note's properties read as a book's details: each as said, "" (or what stands for "not said") otherwise. */
export function readDetails(fm: Record<string, unknown>): Details {
	return {
		title: text(fm.title), subtitle: text(fm.subtitle), author: text(fm.author),
		structure: readStructure(fm.structure),
		cover: linked(fm.cover),
		copyright: text(fm.copyright),
		language: languageTag(fm.language) ?? '',
		titlePage: fm['title-page'] !== false,
		contents: CONTENTS[text(fm['contents-page']).toLowerCase()] ?? 'titled',
		bookStyle: text(fm['book-style']), manuscriptStyle: text(fm['manuscript-style']), pageSize: text(fm['page-size']),
		series: text(fm.series), seriesNumber: text(fm['series-number']), publisher: text(fm.publisher), edition: text(fm.edition),
		published: text(fm.published), description: text(fm.description), rights: text(fm.rights),
		keywords: (Array.isArray(fm.keywords) ? fm.keywords as unknown[] : typeof fm.keywords === 'string' ? fm.keywords.split(',') : []).map(text).filter((k) => k),
		contributors: (Array.isArray(fm.contributors) ? fm.contributors as unknown[] : []).map(contributor).filter((c): c is Contributor => !!c),
	};
}

/** Details put into a binder note's properties: only those given, only Book details' own properties, and one that
    says nothing (or only what Binders would assume anyway) is taken out rather than written empty. */
export function applyDetails(fm: Record<string, unknown>, d: Partial<Details>): void {
	const set = (key: (typeof DETAIL_PROPS)[number], v: unknown) => { if (v === '' || v == null) delete fm[key]; else fm[key] = v; };
	if (d.title !== undefined) set('title', d.title.trim());
	if (d.subtitle !== undefined) set('subtitle', d.subtitle.trim());
	if (d.author !== undefined) set('author', d.author.trim());
	if (d.structure !== undefined) set('structure', d.structure ? STRUCTURES[d.structure][0] : '');
	if (d.cover !== undefined) set('cover', d.cover.trim() ? `[[${d.cover.trim()}]]` : '');
	if (d.copyright !== undefined) set('copyright', d.copyright.trim());
	if (d.language !== undefined) set('language', languageTag(d.language) ?? '');
	if (d.titlePage !== undefined) set('title-page', d.titlePage ? '' : false);
	if (d.contents !== undefined) set('contents-page', d.contents === 'titled' ? '' : d.contents);
	if (d.bookStyle !== undefined) set('book-style', d.bookStyle.trim());
	if (d.manuscriptStyle !== undefined) set('manuscript-style', d.manuscriptStyle.trim());
	if (d.pageSize !== undefined) set('page-size', d.pageSize.trim());
	for (const [key, k] of [['series', 'series'], ['series-number', 'seriesNumber'], ['publisher', 'publisher'], ['edition', 'edition'], ['published', 'published'], ['description', 'description'], ['rights', 'rights']] as const) if (d[k] !== undefined) set(key, d[k].trim());
	if (d.keywords !== undefined) set('keywords', d.keywords.length ? d.keywords : '');
	if (d.contributors !== undefined) set('contributors', d.contributors.length ? d.contributors.map((c) => `${c.role[0].toUpperCase()}${c.role.slice(1)}: ${c.name}`) : '');
}

/** The series line of a title page: "The Corran Trilogy, Book One". */
export function seriesLine(d: Details): string {
	if (!d.series) return '';
	const n = Number(d.seriesNumber);
	return d.seriesNumber ? `${d.series}, Book ${Number.isInteger(n) && n > 0 && n < 100 ? numberWords(n) : d.seriesNumber}` : d.series;
}
/** The copyright page after its copyright line: the rights, the edition, the ISBN, the publisher, the people who
    made the book with the author, then the writer's own lines. A manuscript has no copyright page. */
export function imprintOf(d: Details, isbn: string, asBook: boolean): string[] {
	if (!asBook) return [];
	const year = /^\d{4}/.exec(d.published)?.[0] ?? '';
	// (in groups, as a copyright page has them, with a line between: "" is that line)
	const groups = [
		d.rights.split(/\r?\n/),
		[d.edition ? `${d.edition}${year ? `, ${year}` : ''}` : year ? `Published ${year}` : '', isbn ? `ISBN ${isbn}` : ''],
		d.contributors.map((c) => `${CREDIT[c.role] ?? c.role} ${c.name}`),
		[d.publisher ? `Published by ${d.publisher}` : ''],
	].map((g) => g.map((l) => l.trim()).filter((l) => l)).filter((g) => g.length);
	return groups.flatMap((g) => ['', ...g]);
}
const CREDIT: Record<string, string> = { editor: 'Edited by', translator: 'Translated by', illustrator: 'Illustrations by', 'cover designer': 'Cover design by', narrator: 'Read by' };

