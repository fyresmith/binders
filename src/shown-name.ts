import type { App, TFile } from 'obsidian';

/* The name Binders shows for a note: its `title` property (the name is settings'), when it has one, else its file
   name. Display only: paths, renames, links and anything that identifies a file keep using `basename`. */

/** The title from a note's properties: a non-empty text (or number) under `prop`, whitespace folded; else null. */
export function readTitle(fm: Record<string, unknown> | null | undefined, prop: string): string | null {
	const v: unknown = fm?.[prop];
	const t = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
	const s = t.replace(/\s+/g, ' ').trim();
	return s || null;
}

/** The shown name: the title if there is one, else the file name. */
export const pickShownName = (fm: Record<string, unknown> | null | undefined, prop: string, basename: string): string => readTitle(fm, prop) ?? basename;

// (set once by the plugin on load: the display sites are many and have no plugin at hand)
let source: { app: App; prop: () => string } | null = null;

/** Gives `shownName` the vault to read properties from, and where the property's name is kept. */
export function useShownNames(app: App, prop: () => string): void { source = { app, prop }; }

/** The title a note has in its properties, or null for none. */
export function titleOf(file: TFile): string | null {
	return source ? readTitle(source.app.metadataCache.getFileCache(file)?.frontmatter, source.prop()) : null;
}

/** What to call a note on screen. */
export const shownName = (file: TFile): string => titleOf(file) ?? file.basename;

/** The same by a note's path, for code that holds only that (a pure builder handed a list of items): the title the
    note at `path` has, else `fallback`. */
export function shownNameAt(path: string, fallback: string): string {
	const f = source?.app.vault.getFileByPath(path);
	return (f && titleOf(f)) || fallback;
}
