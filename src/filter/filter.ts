import { canonical } from '../view/labels';
import { readDef, writeDef, type Condition, type FilterDef } from './conditions';

/* The old shape of a view's filter, for reading it. Until 0.52 a view's filter was two lists, the statuses and the labels to
   keep, saved in the view's state as `{ status: [...], label: [...] }`; "" in a list stands for "no status" or "no label".
   It is conditions now (conditions.ts), and what a version before wrote opens as the same filter. Pure. */

/** The filter as 0.51 and before kept it. */
export interface Filter { status: string[]; label: string[] }

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** A filter as saved in a view's state in the old shape, or null if what was saved isn't an object (the view then keeps
    the filter it has). Anything in it that isn't a list of text is an empty list, and values are spelled as settings spell
    them: a filter saved as "draft" still means Draft. */
export function readFilter(saved: unknown, statuses: readonly string[], labels: readonly string[]): Filter | null {
	if (!saved || typeof saved !== 'object') return null;
	const s = saved as { status?: unknown; label?: unknown };
	return { status: strings(s.status).map((x) => canonical(x, statuses)), label: strings(s.label).map((x) => canonical(x, labels)) };
}

/* A view's saved filter (its state, in the workspace) was `{ status: [...], label: [...] }` until 0.52; it is a list of
   conditions now (conditions.ts). Reading takes either; writing gives the old shape for as long as the filter is only
   those two lists, so an older Binders reads what a newer one saved, and the conditions shape when it is more. */

/** The names of the properties that hold status and label (settings choose them). */
export interface StateProps { status: string; label: string }

/** A view's saved filter as conditions, or null if what was saved isn't an object (the view then keeps the filter it
    has). The old lists become `status is …` and `label is …`, spelled as settings spell them. */
export function readState(saved: unknown, statuses: readonly string[], labels: readonly string[], props: StateProps): FilterDef | null {
	if (!saved || typeof saved !== 'object') return null;
	const o = saved as Record<string, unknown>;
	if (Array.isArray(o.conditions)) return readDef(saved, false);
	const old = readFilter(saved, statuses, labels);
	if (!old) return null;
	const conditions: Condition[] = [];
	if (old.status.length) conditions.push({ property: props.status, operator: 'is', value: old.status });
	if (old.label.length) conditions.push({ property: props.label, operator: 'is', value: old.label });
	return { match: 'all', conditions };
}

/** A filter as it goes in a view's state: the old two lists when that says it all, else the conditions. */
export function writeState(f: FilterDef, props: StateProps): unknown {
	const lists: { status: string[]; label: string[] } = { status: [], label: [] };
	const old = !f.name && f.match === 'all' && f.conditions.every((c) => {
		const kind = c.property === props.status ? 'status' : c.property === props.label ? 'label' : null;
		if (!kind || c.operator !== 'is' || lists[kind].length || !Array.isArray(c.value) || !c.value.length || !c.value.every((x) => typeof x === 'string')) return false;
		lists[kind] = [...c.value];
		return true;
	});
	return old ? lists : writeDef(f);
}
