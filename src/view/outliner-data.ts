/* The outliner's columns and what they hold: which there are, how they're kept, how values sort, read and are typed.
   Pure, so it can be unit-tested. */

/** A column as it's kept: a built-in one by its id, or a note property as `prop:<name>`; `width` in px once resized. */
export interface ColumnSpec { id: string; width?: number }

/** One of Binders' own columns: its name and icon in the "Columns" menu, its width until it's resized, whether it holds
    numbers (set to the right), and what it shows, in a sentence. */
export interface BuiltIn { id: string; name: string; icon: string; width: number; numeric?: boolean; about: string }

/** The columns Binders knows itself, in the order the "Columns" menu lists them. The title is always first and isn't
    one of these. */
export const BUILT_IN: readonly BuiltIn[] = [
	{ id: 'label', name: 'Label', icon: 'palette', width: 120, about: 'The note’s label, in its color' },
	{ id: 'status', name: 'Status', icon: 'circle-dot', width: 110, about: 'The note’s status' },
	{ id: 'words', name: 'Words', icon: 'whole-word', width: 80, numeric: true, about: 'Words in the note; for a folder, in every note in it' },
	{ id: 'target', name: 'Target', icon: 'target', width: 80, numeric: true, about: 'The note’s word count target; for a folder without one, its notes’ targets together' },
	{ id: 'progress', name: 'Progress', icon: 'loader', width: 120, numeric: true, about: 'How far along its target the note is' },
	{ id: 'export', name: 'Export', icon: 'book-up', width: 76, about: 'Whether the note is included when the binder is exported' },
	{ id: 'notes', name: 'Notes', icon: 'notebook-pen', width: 200, about: 'Your notes on the note, which are never exported' },
	{ id: 'created', name: 'Created', icon: 'calendar-plus', width: 110, numeric: true, about: 'When the note was created' },
	{ id: 'modified', name: 'Modified', icon: 'calendar-clock', width: 110, numeric: true, about: 'When the note was last changed' },
];

/** The title column's id: always there, always first, never in a list of columns. */
export const TITLE = 'title';
/** The columns a new outliner has. */
export const DEFAULT_COLUMNS: ColumnSpec[] = [{ id: 'label' }, { id: 'status' }, { id: 'words' }];
/** Widths in px: the least and most a column can be dragged to, and a property column's until it's resized. (The
    title's two aren't read any more: the style sheet sets its width.) */
export const MIN_WIDTH = 48, MAX_WIDTH = 640, PROP_WIDTH = 140;

const PROP = 'prop:';
/** The id of the column that shows a note property. */
export const propId = (name: string): string => PROP + name;
/** The property a column shows, or null for a built-in column. */
export const propOf = (id: string): string | null => (id.startsWith(PROP) && id.length > PROP.length ? id.slice(PROP.length) : null);
/** The built-in column with this id, or null (a property's column, or no column at all). */
export const builtIn = (id: string): BuiltIn | null => BUILT_IN.find((b) => b.id === id) ?? null;
/** Is this the id of a column there can be (the title aside)? */
export const isColumn = (id: string): boolean => !!builtIn(id) || !!propOf(id);
/** A column's name as its header shows it. */
export const columnName = (id: string): string => (id === TITLE ? 'Title' : builtIn(id)?.name ?? propOf(id) ?? id);
/** A width in whole px, within what a column can be. */
export const clampWidth = (w: number, min = MIN_WIDTH): number => Math.round(Math.max(min, Math.min(MAX_WIDTH, w)));
/** A column's width: the one it was resized to, else its own, else a property column's. */
export const columnWidth = (c: ColumnSpec): number => clampWidth(c.width ?? builtIn(c.id)?.width ?? PROP_WIDTH);

/** Columns read from saved state: known ones only, each once, widths within bounds. Null if it isn't a list. */
export function readColumns(v: unknown): ColumnSpec[] | null {
	if (!Array.isArray(v)) return null;
	const out: ColumnSpec[] = [];
	for (const x of v as unknown[]) {
		const said = typeof x === 'string' ? x : x && typeof x === 'object' ? (x as { id?: unknown }).id : null;
		// (the column "Export" was "Compile" once: columns saved then are it)
		const id = said === 'compile' ? 'export' : said;
		if (typeof id !== 'string' || !isColumn(id) || out.some((c) => c.id === id)) continue;
		const w = x && typeof x === 'object' ? (x as { width?: unknown }).width : undefined;
		out.push(typeof w === 'number' && isFinite(w) ? { id, width: clampWidth(w) } : { id });
	}
	return out;
}

/** Moves the entry at `from` so it ends up at index `to`. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
	const out = [...list];
	if (from < 0 || from >= out.length) return out;
	const [x] = out.splice(from, 1);
	out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
	return out;
}

/** How the rows are sorted: by a column (or the title), up or down. Null: binder order. */
export type Sort = { id: string; dir: 1 | -1 } | null;

/** A sort read from saved state: a column there can be and a direction, or binder order for anything else. */
export function readSort(v: unknown): Sort {
	if (!v || typeof v !== 'object') return null;
	const { id, dir } = v as { id?: unknown; dir?: unknown };
	return typeof id === 'string' && (id === TITLE || isColumn(id)) && (dir === 1 || dir === -1) ? { id, dir } : null;
}

const isBlank = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && !v.length);

/** Orders two values of a column: numbers by size, text as names sort (numbers in it by value), ticks before blanks.
    Blank values come last whichever way the column is sorted, so `dir` is applied here. */
export function compareValues(a: unknown, b: unknown, dir: 1 | -1 = 1): number {
	const ea = isBlank(a), eb = isBlank(b);
	if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
	if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
	if (typeof a === 'boolean' && typeof b === 'boolean') return (a === b ? 0 : a ? -1 : 1) * dir;
	return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' }) * dir;
}

/** A property's value as text: a list joined with commas, a tick as "Yes" or "No", anything nested as nothing. */
export function text(v: unknown): string {
	if (v == null) return '';
	if (Array.isArray(v)) return v.map((x) => text(x)).filter((x) => x).join(', ');
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

/** A word count target from a property: a whole number above zero, or 0 for none. */
export function readTarget(v: unknown): number {
	const n = typeof v === 'number' ? v : typeof v === 'string' ? parseTarget(v) ?? NaN : NaN;
	return isFinite(n) && n > 0 && n <= MAX_TARGET ? Math.round(n) : 0;
}

/** More words than any book has: a target above it is a slip of the hand. */
export const MAX_TARGET = 1_000_000_000;

/** A target as typed: "1500", "1,500", "1 500" or "1.500" (as thousands are grouped in much of the world) is 1500;
    nothing is 0 (no target); null for anything that isn't a whole number of words ("1.5", "lots"). */
export function parseTarget(typed: string): number | null {
	const t = typed.trim().replace(/[\s\u00a0\u202f'’]/g, '');
	if (!t) return 0;
	const digits = /^\d{1,3}([.,]\d{3})+$/.test(t) ? t.replace(/[.,]/g, '') : t;
	if (!/^\d+$/.test(digits)) return null;
	const n = Number(digits);
	return n <= MAX_TARGET ? n : null;
}

/** Why what's typed can't be a target, in words for the writer (null if it can): not a whole number of words, or one
    too big to be meant. */
export function whyNotTarget(typed: string): string | null {
	if (parseTarget(typed) != null) return null;
	const digits = typed.trim().replace(/[\s\u00a0\u202f'’.,]/g, '');
	return /^\d+$/.test(digits) && Number(digits) > MAX_TARGET ? `A target can be up to ${MAX_TARGET.toLocaleString('en-US')} words.` : 'A target is a whole number of words.';
}

/** Clicking a column's header again and again: ascending, descending, then back to binder order, as in a base. */
export function nextSort(sort: Sort, id: string): Sort {
	if (!sort || sort.id !== id) return { id, dir: 1 };
	return sort.dir === 1 ? { id, dir: -1 } : null;
}

/** How far along a target a count is, from 0 to 1 (never more: a bar doesn't overrun), or null without a target. */
export function progress(words: number | null, target: number): number | null {
	if (!(target > 0)) return null;
	return Math.max(0, Math.min(1, (words ?? 0) / target));
}

/** What typing into a property's cell means, by what the property held: a number stays a number if it still is one, a
    list is split at commas, and nothing typed removes the property (undefined). */
export function parseTyped(typed: string, was: unknown): unknown {
	const t = typed.trim();
	if (Array.isArray(was)) {
		const items = t.split(',').map((x) => x.trim()).filter((x) => x);
		return items.length ? items : undefined;
	}
	if (!t) return undefined;
	if (typeof was === 'number' && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
	return t;
}

/** Property names found in notes' properties, most used first, without ones a column already shows or Binders' own. */
export function suggestProps(all: readonly Record<string, unknown>[], skip: readonly string[]): string[] {
	const counts = new Map<string, number>(), hidden = new Set(skip.map((s) => s.toLowerCase()));
	for (const fm of all) {
		for (const [k, v] of Object.entries(fm)) {
			if (k === 'position' || hidden.has(k.toLowerCase()) || (v && typeof v === 'object' && !Array.isArray(v))) continue;
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
	}
	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}
