import { fold, readCondition, readDef, writeDef, type FilterDef } from './conditions';

/* Saved filters in a binder note: the `filters` property. Pure: each edit takes the list as the note has it (whatever it
   holds) and gives the list to write. It is the writer's, and someone else's too: an entry that isn't a filter, a key of a
   filter we don't know, a condition we can't read (a group, as Bases nests them) all stay as they were, in their place.
   A filter is found by its name, compared as text is. Format: docs/dev/file-format.md. */

export type FilterEdit =
	| { kind: 'save'; def: FilterDef }
	| { kind: 'update'; name: string; def: FilterDef }
	| { kind: 'rename'; name: string; to: string }
	| { kind: 'duplicate'; name: string; to: string }
	| { kind: 'delete'; name: string }
	| { kind: 'move'; name: string; by: -1 | 1 };

type Entry = Record<string, unknown>;
const isEntry = (v: unknown): v is Entry => !!v && typeof v === 'object' && !Array.isArray(v);
const nameOf = (v: unknown): string | null => { const d = readDef(v); return d?.name ?? null; };
const same = (a: string, b: string): boolean => fold(a) === fold(b);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A name not taken: the one asked for, or it with a number ("Mara 2"). */
export function uniqueName(name: string, taken: readonly string[]): string {
	if (!taken.some((t) => same(t, name))) return name;
	let n = 2;
	while (taken.some((t) => same(t, `${name} ${n}`))) n++;
	return `${name} ${n}`;
}

/** The list the note should hold after an edit. A change that can't be made (no such filter, a name taken or blank) gives the
    list back as it was. Never changes what it was given. */
export function editFilters(raw: unknown, op: FilterEdit): unknown[] {
	const list: unknown[] = Array.isArray(raw) ? (raw as unknown[]).slice() : [];
	const at = (name: string): number => list.findIndex((v) => { const n = nameOf(v); return n != null && same(n, name); });
	const taken = (): string[] => list.map(nameOf).filter((n): n is string => n != null);
	if (op.kind === 'save') {
		const name = op.def.name?.trim();
		if (!name || taken().some((t) => same(t, name))) return list;
		const written: unknown = writeDef({ ...op.def, name });
		return [...list, written];
	}
	const i = at(op.name);
	if (i < 0) return list;
	const entry = list[i] as Entry;
	if (op.kind === 'update') {
		const next: Entry = { ...entry };
		const written = writeDef({ ...op.def, name: nameOf(entry) ?? op.name });
		if (written.match === undefined) delete next.match; else next.match = written.match;
		// (a condition we can't read — a group — is kept, after the ones we write)
		const kept = (Array.isArray(entry.conditions) ? entry.conditions as unknown[] : []).filter((c) => !readCondition(c));
		next.conditions = [...(written.conditions as unknown[]), ...kept];
		list[i] = next;
		return list;
	}
	if (op.kind === 'rename') {
		const to = op.to.trim();
		if (!to || (!same(to, op.name) && taken().some((t) => same(t, to)))) return list;
		list[i] = { ...entry, name: to };
		return list;
	}
	if (op.kind === 'duplicate') {
		const to = op.to.trim();
		if (!to || taken().some((t) => same(t, to))) return list;
		list.splice(i + 1, 0, { ...clone(entry), name: to });
		return list;
	}
	if (op.kind === 'delete') { list.splice(i, 1); return list; }
	// move: past the next filter that is one (what is not a filter stays where it is)
	let j = i + op.by;
	while (j >= 0 && j < list.length && nameOf(list[j]) == null) j += op.by;
	if (j < 0 || j >= list.length) return list;
	[list[i], list[j]] = [list[j], list[i]];
	return list;
}

/** The list with a status or label value renamed in every filter's conditions that name it as a value (a list's items, or
    one). The property is the one settings call status or label. A "contains" is a search, not a value, and is left. Null if
    nothing was named, so nothing need be written. */
export function renameValue(raw: unknown, props: { status: string; label: string }, kind: 'status' | 'label', old: string, now: string): unknown[] | null {
	if (!Array.isArray(raw)) return null;
	const prop = kind === 'status' ? props.status : props.label;
	let any = false;
	const out = (raw as unknown[]).map((entry) => {
		if (!isEntry(entry) || !Array.isArray(entry.conditions)) return entry;
		let changed = false;
		const conditions = (entry.conditions as unknown[]).map((c) => {
			if (!isEntry(c) || c.property !== prop || typeof c.operator !== 'string' || ['contains', 'does not contain'].includes(c.operator.trim().toLowerCase())) return c;
			const swap = (v: unknown) => (typeof v === 'string' && same(v, old) ? now : v);
			const value = Array.isArray(c.value) ? (c.value as unknown[]).map(swap) : swap(c.value);
			if (JSON.stringify(value) === JSON.stringify(c.value)) return c;
			changed = true;
			return { ...c, value };
		});
		if (!changed) return entry;
		any = true;
		return { ...entry, conditions };
	});
	return any ? out : null;
}
