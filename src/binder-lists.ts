import { readLabels, readStatuses, type LabelPreset } from './view/labels';

/* A binder's own labels and statuses (docs/dev/file-format.md, "Labels and statuses"). A binder may keep its own lists
   in its note, in place of the vault's (Binders' settings): `labels` is a list of `- Mara: blue` (a name and its
   color, as a calendar's months are written; `{name, color}` is read too), `statuses` a list of names. No property
   means the vault's lists; an empty list means none. Neither is part of the format version. Pure. */

export const LABELS_PROP = 'labels';
export const STATUSES_PROP = 'statuses';

/** One entry as `readLabels` takes it: `{Mara: blue}` and `{name, color}` both, and a bare name (a color of none). */
function entry(x: unknown): unknown {
	if (typeof x === 'string') return { name: x, color: '' };
	if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
	const o = x as Record<string, unknown>, keys = Object.keys(o);
	if (typeof o.name === 'string' && ('color' in o || keys.length === 1)) return { name: o.name, color: typeof o.color === 'string' ? o.color : '' };
	if (keys.length === 1) { const v = o[keys[0]]; return { name: keys[0], color: typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '' }; }
	return x;
}

/** The binder's own labels from its note's `labels`, or null when it has none of its own (the property is not a list). */
export function readOwnLabels(v: unknown): LabelPreset[] | null {
	return Array.isArray(v) ? readLabels((v as unknown[]).map(entry)) : null;
}

/** The binder's own statuses from its note's `statuses`, or null when it has none of its own. */
export function readOwnStatuses(v: unknown): string[] | null {
	return Array.isArray(v) ? readStatuses(v) : null;
}

/** Labels as the note keeps them: one `{ name: color }` each, which YAML writes as `- Mara: blue`. */
export function writeOwnLabels(list: readonly LabelPreset[]): Record<string, string>[] {
	return list.map((l) => ({ [l.name]: l.color }));
}

export const sameLabels = (a: readonly LabelPreset[], b: readonly LabelPreset[]): boolean => a.length === b.length && a.every((l, i) => l.name === b[i].name && l.color === b[i].color);
export const sameStatuses = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((s, i) => s === b[i]);
