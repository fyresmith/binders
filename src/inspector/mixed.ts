import { atom, same, type Atom, type Env } from '../filter/conditions';

/* Several notes' lists of one property at once (the inspector's pinned rows, with several notes in hand). Pure. Items
   are compared as saved filters compare them (filter/conditions.ts): a link by the note it names, so `Mara` and
   `[[Mara]]` are one name, and links to two different notes both named Mara are two. What all of them have is shown
   and edited; what only some have is counted and left alone, in each note's own order, unless the writer gives it to
   all of them or takes it from all. */

const isItem = (x: unknown): x is string | number => (typeof x === 'string' && x.trim() !== '') || typeof x === 'number';
/** A property's value as the entries of a list: a list's own, a lone value as one, nothing as none. */
const rawOf = (v: unknown): unknown[] => (Array.isArray(v) ? v as unknown[] : v == null || v === '' ? [] : [v]);

export interface Group {
	/** What all of them have: each item as the first note that has it spells it, in that note's order. */
	common: string[];
	/** What only some have: the item, and in how many of the notes. */
	some: { item: string; count: number }[];
}

export function groupLists(values: readonly unknown[], envs: readonly Env[]): Group {
	const seen: { raw: string; atom: Atom; has: Set<number> }[] = [];
	values.forEach((v, i) => {
		for (const e of rawOf(v)) {
			const item = isItem(e) ? e : null, a = item === null ? null : atom(item, envs[i]);
			if (item === null || !a) continue;
			const g = seen.find((s) => same(s.atom, a));
			if (g) g.has.add(i); else seen.push({ raw: String(item), atom: a, has: new Set([i]) });
		}
	});
	return {
		common: seen.filter((s) => s.has.size === values.length).map((s) => s.raw),
		some: seen.filter((s) => s.has.size < values.length).map((s) => ({ item: s.raw, count: s.has.size })),
	};
}

/** What each note's list becomes when the writer changes what they share into `now`: what was shared and isn't in
    `now` is taken from every list, and what is in `now` and wasn't shared is added to every list that hasn't it.
    A note whose list stays as it is is null; null altogether when none changes. */
export function changeLists(values: readonly unknown[], envs: readonly Env[], common: readonly string[], now: readonly string[]): (unknown[] | null)[] | null {
	const before = common.map((c) => atom(c, envs[0])).filter((a): a is Atom => !!a);
	const after = now.map((n) => ({ raw: n, atom: atom(n, envs[0]) })).filter((x): x is { raw: string; atom: Atom } => !!x.atom);
	const removed = before.filter((b) => !after.some((a) => same(a.atom, b)));
	const added = after.filter((a) => !before.some((b) => same(a.atom, b))).map((a) => a.raw);
	const out = values.map((v, i): unknown[] | null => {
		const raw = rawOf(v);
		const kept = raw.filter((e) => { const a = isItem(e) ? atom(e, envs[i]) : null; return !(a && removed.some((r) => same(r, a))); });
		let changed = kept.length !== raw.length;
		for (const add of added) {
			const a = atom(add, envs[i]);
			if (a && !kept.some((e) => { const x = isItem(e) ? atom(e, envs[i]) : null; return !!x && same(x, a); })) { kept.push(add); changed = true; }
		}
		return changed ? kept : null;
	});
	return out.some((o) => o) ? out : null;
}
