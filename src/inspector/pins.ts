/* The properties a binder pins to its inspector: the binder note's `inspector`, a list of property names (file-format.md).
   Pure. Read tolerantly and written without dropping what it does not understand: an entry that is not a name (a
   number, a map: another version's, or the writer's own) stays where it is, and the list is only made shorter by the
   name being taken away. */

/** The binder note's property that lists what is pinned. */
export const PINS_PROP = 'inspector';

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const isName = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
const entries = (raw: unknown): unknown[] => (Array.isArray(raw) ? [...raw as unknown[]] : raw == null || raw === '' ? [] : [raw]);

/** The names pinned, in order, each once (whatever its case) and trimmed. */
export function readPins(raw: unknown): string[] {
	const out: string[] = [];
	for (const x of Array.isArray(raw) ? raw as unknown[] : typeof raw === 'string' ? [raw] : []) if (isName(x) && !out.some((o) => same(o, x))) out.push(x.trim());
	return out;
}

/** What the property holds once `name` is pinned (last). */
export function withPin(raw: unknown, name: string): unknown[] {
	const list = entries(raw);
	return list.some((x) => isName(x) && same(x, name)) ? list : [...list, name.trim()];
}

/** What it holds once `name` is not pinned; undefined when nothing is left, so the property is taken away. */
export function withoutPin(raw: unknown, name: string): unknown[] | undefined {
	const list = entries(raw).filter((x) => !(isName(x) && same(x, name)));
	return list.length ? list : undefined;
}

/** What it holds once `name` has moved one place up (-1) or down (1) among the names: past an entry that is not a
    name, the names swap and that entry stays where it is. */
export function movedPin(raw: unknown, name: string, by: -1 | 1): unknown[] {
	const list = entries(raw), at = list.findIndex((x) => isName(x) && same(x, name));
	if (at < 0) return list;
	let to = at + by;
	while (to >= 0 && to < list.length && !isName(list[to])) to += by;
	if (to < 0 || to >= list.length) return list;
	[list[at], list[to]] = [list[to], list[at]];
	return list;
}

/** The names of properties Binders keeps for itself, lower-cased: the ones settings name and the ones it writes in a
    binder's, a folder's and a note's properties. A row for one of these would be a second, plainer copy of a field. */
export function ownNames(s: { synopsisProp: string; statusProp: string; labelProp: string; targetProp: string; storyDateProp: string; storyOrderProp: string; notesProp: string }): Set<string> {
	return new Set([
		s.synopsisProp, s.statusProp, s.labelProp, s.targetProp, s.storyDateProp, s.storyOrderProp, s.notesProp,
		// a note's: whether it is exported, and as what
		'export', 'compile', 'export-as',
		// a binder's, a folder's: what is in it, and its book
		'binder', 'contents', 'longform', PINS_PROP, 'filters',
		'structure', 'title', 'subtitle', 'author', 'language', 'cover', 'copyright', 'title-page', 'contents-page', 'page-size', 'manuscript-style', 'book-style',
	].map((n) => n.toLowerCase()));
}

/** Why `name` can't be pinned, or null: Binders' own, already pinned, or not a name a property can have. */
export function pinProblem(name: string, pinned: readonly string[], s: Parameters<typeof ownNames>[0]): string | null {
	const n = name.trim();
	if (!n) return 'A row needs a property’s name.';
	if (/[:#[\]{},|>&*!%@`\n]/.test(n) || n.startsWith('-') || n.startsWith('?')) return `“${n}” can’t be the name of a property.`;
	if (ownNames(s).has(n.toLowerCase())) return `Binders already shows “${n}” in the inspector.`;
	if (pinned.some((p) => same(p, n))) return `${n} is pinned already.`;
	return null;
}
