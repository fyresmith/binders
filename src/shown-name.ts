import type { App, TFile } from 'obsidian';

/* The name Binders shows for a note: its `title` property (the name is settings'), when it has one; else, if the
   writer chose it, the text of its first heading (of a level, or of any); else its file name. Display only: paths,
   renames, links and anything that identifies a file keep using `basename`. Headings come from Obsidian's metadata
   cache, never from parsing the text. */

/** Where a name comes from besides the property: the first heading of one level (1 to 6), or of any, or none. */
export type TitleFrom = 'property' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'any';
export const TITLE_FROM: readonly TitleFrom[] = ['property', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'any'];

/** What a heading says in words: without comments, tags, link brackets and emphasis marks, whitespace folded. */
export function cleanHeading(raw: string): string {
	return raw
		.replace(/<!--[\s\S]*?(-->|$)/g, ' ')
		.replace(/%%[\s\S]*?(%%|$)/g, ' ')
		.replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
		.replace(/!?\[\[([^\]]*)\]\]/g, '$1')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/(^|\s)#(?=[\p{L}\p{N}_/-]*[\p{L}_/-])[\p{L}\p{N}_/-]+/gu, ' ')
		.replace(/[*~=`]+|(^|\s)_+|_+(?=\s|$)/g, ' ')
		.replace(/\s+/g, ' ').trim();
}

/** The name a note's headings give it: the first one of the chosen level (or any) that says something in words. */
export function headingTitle(headings: readonly { heading: string; level: number }[] | null | undefined, from: TitleFrom): string | null {
	if (!headings || from === 'property') return null;
	for (const h of headings) {
		if (from !== 'any' && h.level !== Number(from.slice(1))) continue;
		const t = cleanHeading(h.heading);
		if (t) return t;
	}
	return null;
}

/** The title from a note's properties: a non-empty text (or number) under `prop`, whitespace folded; else null. */
export function readTitle(fm: Record<string, unknown> | null | undefined, prop: string): string | null {
	const v: unknown = fm?.[prop];
	const t = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
	const s = t.replace(/\s+/g, ' ').trim();
	return s || null;
}

/** The shown name: the title property if there is one, else the heading chosen, else the file name. */
export const pickShownName = (fm: Record<string, unknown> | null | undefined, prop: string, basename: string, headings?: readonly { heading: string; level: number }[] | null, from: TitleFrom = 'property'): string =>
	readTitle(fm, prop) ?? headingTitle(headings, from) ?? basename;

// (set once by the plugin on load: the display sites are many and have no plugin at hand)
let source: { app: App; prop: () => string; from: () => TitleFrom } | null = null;

/** Gives `shownName` the vault to read properties from, and where the property's name is kept. */
export function useShownNames(app: App, prop: () => string, from: () => TitleFrom = () => 'property'): void { source = { app, prop, from }; }

/** The title a note has in its properties, or null for none. */
export function propertyTitleOf(file: TFile): string | null {
	return source ? readTitle(source.app.metadataCache.getFileCache(file)?.frontmatter, source.prop()) : null;
}

/** The name a note has other than its file name (its title property, else the heading chosen), or null for none. */
export function titleOf(file: TFile): string | null {
	if (!source) return null;
	return propertyTitleOf(file) ?? headingTitle(source.app.metadataCache.getFileCache(file)?.headings, source.from());
}

/** Whether a note's shown name is read from a heading (it has no title property, and the setting finds a heading). */
export function fromHeadingAt(path: string): boolean {
	const f = source?.app.vault.getFileByPath(path);
	return !!f && propertyTitleOf(f) == null && titleOf(f) != null;
}

/** What to call a note on screen. */
export const shownName = (file: TFile): string => titleOf(file) ?? file.basename;

/** The same by a note's path, for code that holds only that (a pure builder handed a list of items): the title the
    note at `path` has, else `fallback`. */
export function shownNameAt(path: string, fallback: string): string {
	const f = source?.app.vault.getFileByPath(path);
	return (f && titleOf(f)) || fallback;
}
