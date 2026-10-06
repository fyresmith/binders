import type { Contents } from './book';
import type { Structure } from './model';
import { readStructure } from './roles';
import { STRUCTURES } from './model';

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
}

/** The binder note's properties that are a book's details: the only ones Book details ever writes. */
export const DETAIL_PROPS = ['title', 'subtitle', 'author', 'structure', 'cover', 'copyright', 'language', 'title-page', 'contents-page', 'book-style', 'manuscript-style', 'page-size'] as const;

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
}
