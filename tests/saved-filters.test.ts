import { editFilters, renameValue, uniqueName, type FilterEdit } from '../src/filter/saved';
import { readDefs, type FilterDef } from '../src/filter/conditions';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const def = (name: string, ...rows: [string, string, unknown?][]): FilterDef => ({ name, match: 'all', conditions: rows.map(([property, operator, value]) => ({ property, operator, ...(value !== undefined ? { value } : {}) })) });
const names = (raw: unknown[]) => readDefs(raw).map((f) => f.name);
const edit = (raw: unknown, op: FilterEdit) => editFilters(raw, op);

// the writer keeps what it doesn't understand
{
	const raw: unknown[] = [
		{ name: 'Mara', conditions: [{ property: 'characters', operator: 'contains any of', value: '[[Mara]]' }], later: { a: 1 } },
		'a stray line',
		{ nothing: 'named' },
		{ name: 'Long', match: 'any', conditions: [{ property: 'target', operator: '>=', value: 2500 }, { all: [{ property: 'x', operator: 'is', value: 'y' }] }] },
	];
	const saved = edit(raw, { kind: 'save', def: def('Fresh', ['status', 'is', ['Draft']]) });
	eq(j(saved.slice(0, 4)), j(raw), 'save: everything there is kept, in place');
	eq(j(saved[4]), j({ name: 'Fresh', conditions: [{ property: 'status', operator: 'is', value: 'Draft' }] }), 'and the new one is written after, one value plain');
	eq(raw.length, 4, 'the original list is not changed');

	const updated = edit(raw, { kind: 'update', name: 'Long', def: def('Long', ['target', '>=', 3000]) });
	eq(j(updated[0]), j(raw[0]), 'update: another filter is as it was, with the keys we don’t know');
	eq(j((updated[3] as { conditions: unknown[] }).conditions), j([{ property: 'target', operator: '>=', value: 3000 }, { all: [{ property: 'x', operator: 'is', value: 'y' }] }]), 'a condition we don’t understand stays, after the ones we do');
	eq((updated[3] as { match?: string }).match, undefined, 'match “all” is not written');
	const any = edit(raw, { kind: 'update', name: 'Mara', def: { ...def('Mara', ['status', 'is', ['Idea']]), match: 'any' } });
	eq(j({ m: (any[0] as { match: string }).match, later: (any[0] as { later: unknown }).later }), j({ m: 'any', later: { a: 1 } }), 'an unknown key of the filter stays');
	eq(j(edit(raw, { kind: 'update', name: 'Nobody', def: def('Nobody') })), j(raw), 'a filter that is not there: nothing written');

	const renamed = edit(raw, { kind: 'rename', name: 'mara', to: 'Mara Vane' });
	eq(j(names(renamed)), j(['Mara Vane', 'Long']), 'rename: by name, in any case');
	eq(j((renamed[0] as { later: unknown }).later), j({ a: 1 }), 'and the rest of it stays');
	eq(j(edit(raw, { kind: 'rename', name: 'Mara', to: 'long' })), j(raw), 'a name that is taken is refused: nothing changes');
	eq(j(edit(raw, { kind: 'rename', name: 'Mara', to: '  ' })), j(raw), 'a blank name too');

	const dup = edit(raw, { kind: 'duplicate', name: 'Mara', to: 'Mara 2' });
	eq(j(names(dup)), j(['Mara', 'Mara 2', 'Long']), 'duplicate: right after it');
	eq(j(dup[1]), j({ ...(raw[0] as object), name: 'Mara 2' }), 'a copy with its own name, whole');
	ok(dup[1] !== raw[0] && (dup[1] as { conditions: unknown[] }).conditions !== (raw[0] as { conditions: unknown[] }).conditions, 'not the same objects');

	const gone = edit(raw, { kind: 'delete', name: 'MARA' });
	eq(j(gone), j(raw.slice(1)), 'delete: only that one; the stray entries stay');
	eq(j(edit([{ name: 'a', conditions: [] }], { kind: 'delete', name: 'a' })), '[]', 'the last one leaves an empty list (the writer takes the property away)');

	eq(j(names(edit(raw, { kind: 'move', name: 'Long', by: -1 }))), j(['Long', 'Mara']), 'move up: past the filter before it');
	eq(j(edit(raw, { kind: 'move', name: 'Long', by: -1 }).slice(1, 3)), j(['a stray line', { nothing: 'named' }]), 'the entries we don’t know stay where they were');
	eq(j(names(edit(raw, { kind: 'move', name: 'Mara', by: 1 }))), j(['Long', 'Mara']), 'move down');
	eq(j(edit(raw, { kind: 'move', name: 'Mara', by: -1 })), j(raw), 'the first cannot go up');
	eq(j(edit(raw, { kind: 'move', name: 'Long', by: 1 })), j(raw), 'the last cannot go down');
}

// a list that isn't one
{
	eq(j(edit(undefined, { kind: 'save', def: def('a') })), j([{ name: 'a', conditions: [] }]), 'no list yet: a new one');
	eq(j(edit('nonsense', { kind: 'save', def: def('a') })), j([{ name: 'a', conditions: [] }]), 'text where a list should be: replaced, since there was nothing of ours in it');
	eq(j(edit(undefined, { kind: 'delete', name: 'a' })), '[]', 'nothing to delete from');
}

// names
{
	eq(uniqueName('Mara', ['Mara']), 'Mara 2', 'a copy’s name');
	eq(uniqueName('Mara', ['Mara', 'mara 2']), 'Mara 3', 'taken names are compared as text is');
	eq(uniqueName('Fresh', ['Mara']), 'Fresh', 'a free name stays');
}

// a renamed status or label in settings is a renamed value in every saved filter
{
	const raw: unknown[] = [
		{ name: 'A', conditions: [{ property: 'status', operator: 'is', value: ['Draft', 'Idea'] }, { property: 'label', operator: 'is not', value: 'Red' }, { property: 'pov', operator: 'is', value: 'Draft' }] },
		{ name: 'B', conditions: [{ property: 'status', operator: 'is', value: 'draft' }, { property: 'status', operator: 'contains', value: 'Draft' }] },
		'stray',
	];
	const out = renameValue(raw, { status: 'status', label: 'label' }, 'status', 'Draft', 'First draft');
	ok(out !== null, 'something was renamed');
	eq(j((out![0] as { conditions: { value: unknown }[] }).conditions.map((c) => c.value)), j([['First draft', 'Idea'], 'Red', 'Draft']), 'the status in a list, and not a label, and not another property');
	eq(j((out![1] as { conditions: { value: unknown }[] }).conditions.map((c) => c.value)), j(['First draft', 'Draft']), 'in any case; a “contains” is a search, not a value');
	eq(out![2], 'stray', 'whatever is not a filter is as it was');
	const lab = renameValue(raw, { status: 'status', label: 'label' }, 'label', 'Red', 'Crimson');
	eq(j((lab![0] as { conditions: { value: unknown }[] }).conditions[1].value), j('Crimson'), 'a label');
	eq(renameValue(raw, { status: 'status', label: 'label' }, 'status', 'Nothing', 'Else'), null, 'nothing named: null, so nothing is written');
	eq(renameValue(undefined, { status: 'status', label: 'label' }, 'status', 'a', 'b'), null, 'no filters: null');
	const custom = renameValue([{ name: 'C', conditions: [{ property: 'state', operator: 'is', value: ['Draft'] }] }], { status: 'state', label: 'colour' }, 'status', 'Draft', 'Rough');
	eq(j((custom![0] as { conditions: { value: unknown }[] }).conditions[0].value), j(['Rough']), 'under the property names settings have');
}

done('saved-filters');
