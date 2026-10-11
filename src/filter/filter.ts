import { canonical, rank } from '../view/labels';

/* The filter of a binder view: which notes a mode shows. Pure: no Obsidian, no DOM, a note's properties as plain data.
   Today it is two lists, the statuses and the labels to keep; a note passes when it has one of each list that isn't
   empty. "" in a list stands for "no status" or "no label". The view keeps it (BinderView), remembers it in its state,
   and draws its menu (view/filter-menu.ts). */

/** What the filter asks of a note: its status and label, as the views read them ("" for none). */
export interface FilterProps { status: string; label: string }
/** The filter. This is also the shape it is saved in, in the view's state: `{ status: [...], label: [...] }`. */
export interface Filter { status: string[]; label: string[] }
/** What a filter can be on today. */
export type FilterKind = keyof Filter;

export const noFilter = (): Filter => ({ status: [], label: [] });

/** How many values the filter keeps in all: what the button counts. */
export const filterCount = (f: Filter): number => f.status.length + f.label.length;
/** Whether the filter is on at all. */
export const isOn = (f: Filter): boolean => filterCount(f) > 0;

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** A filter as saved in a view's state, or null if what was saved isn't an object (the view then keeps the filter it has).
    Anything in it that isn't a list of text is an empty list, and values are spelled as settings spell them: a filter
    saved as "draft" still means Draft. */
export function readFilter(saved: unknown, statuses: readonly string[], labels: readonly string[]): Filter | null {
	if (!saved || typeof saved !== 'object') return null;
	const s = saved as { status?: unknown; label?: unknown };
	return { status: strings(s.status).map((x) => canonical(x, statuses)), label: strings(s.label).map((x) => canonical(x, labels)) };
}

/** Whether a note passes: both lists that are on must hold its value. (A note made while the filter is on is shown
    whatever it has: that is the view's to say, not the filter's.) */
export function passes(f: Filter, p: FilterProps): boolean {
	return (!f.status.length || f.status.includes(p.status)) && (!f.label.length || f.label.includes(p.label));
}

/** The filter with one value ticked or unticked in one list. */
export function toggled(f: Filter, kind: FilterKind, value: string): Filter {
	const list = f[kind];
	return { ...f, [kind]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] };
}

/** What the menu lists for one kind: the values in use (in the order settings list them, then the others as they come)
    and whether some note has none. */
export interface Choice { values: string[]; none: boolean }
export interface Choices { status: Choice; label: Choice }

/** What a filter menu offers, from the notes of the folder: the values they have, and also those being filtered by,
    though no note has them any more (else they couldn't be taken off). */
export function choices(notes: readonly FilterProps[], f: Filter, statusOrder: readonly string[], labelOrder: readonly string[]): Choices {
	const one = (kind: FilterKind, order: readonly string[]): Choice => {
		const values = new Set<string>();
		let none = false;
		for (const p of notes) { if (p[kind]) values.add(p[kind]); else none = true; }
		for (const v of f[kind]) { if (v) values.add(v); else none = true; }
		const sorted = [...values].map((v, i) => ({ v, i, r: rank(v, order) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.v);
		return { values: sorted, none };
	};
	return { status: one('status', statusOrder), label: one('label', labelOrder) };
}
