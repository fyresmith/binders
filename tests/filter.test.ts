import { readFilter, readState, writeState } from '../src/filter/filter';
import { type FilterDef } from '../src/filter/conditions';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const STATUSES = ['Draft', 'Revised', 'Final'], LABELS = ['Red', 'Blue', 'Green'];
const read = (x: unknown) => readFilter(x, STATUSES, LABELS);

// reading a saved filter
{
	eq(j(read({ status: ['Draft'], label: ['Red'] })), j({ status: ['Draft'], label: ['Red'] }), 'as saved');
	eq(read(undefined), null, 'nothing saved: the view keeps its own');
	eq(read(null), null, 'null saved: the same');
	eq(read('Draft'), null, 'text saved: the same');
	eq(read(3), null, 'a number saved: the same');
	eq(j(read({})), j({ status: [], label: [] }), 'an object without lists is a filter that is off');
	eq(j(read([])), j({ status: [], label: [] }), 'an array is an object with no lists');
	eq(j(read({ status: 'Draft', label: { a: 1 } })), j({ status: [], label: [] }), 'lists that aren’t lists are empty');
	eq(j(read({ status: ['Draft', 3, null, 'Final', {}], label: [true, 'Red'] })), j({ status: ['Draft', 'Final'], label: ['Red'] }), 'only the text in a list is kept');
	eq(j(read({ status: ['draft', ' FINAL '], label: ['bLUE'] })), j({ status: ['Draft', 'Final'], label: ['Blue'] }), 'spelled as settings spell them, trimmed');
	eq(j(read({ status: ['Dummy', 'dummy'], label: ['#aabbcc'] })), j({ status: ['Dummy', 'dummy'], label: ['#aabbcc'] }), 'what settings don’t list stays as written, and keeps its case');
	eq(j(read({ status: [''], label: ['', '  '] })), j({ status: [''], label: ['', ''] }), '“no status” and “no label” are the empty text; blanks become it');
	eq(j(read({ status: ['Draft', 'draft'] })), j({ status: ['Draft', 'Draft'], label: [] }),'two spellings of one value are both kept (nothing dedupes)');
}

// a view state saved by an older Binders is the same filter now, and is written back as they read it while it can be
{
	const names = { status: 'status', label: 'label' };
	const r = (x: unknown) => readState(x, STATUSES, LABELS, names);
	const def = (m: FilterDef['match'], ...rows: [string, string, unknown][]): FilterDef => ({ match: m, conditions: rows.map(([property, operator, value]) => ({ property, operator, value })) });
	eq(j(r({ status: ['draft'], label: ['Red'] })), j(def('all', ['status', 'is', ['Draft']], ['label', 'is', ['Red']])), '0.51: two lists are two conditions');
	eq(j(r({ status: [], label: ['Red'] })), j(def('all', ['label', 'is', ['Red']])), 'an empty list is no condition');
	eq(j(r({ status: [''], label: [] })), j(def('all', ['status', 'is', ['']])), '“No status” is kept');
	eq(j(r({})), j(def('all')), 'no lists: a filter that is off');
	eq(r(undefined), null, 'nothing saved: the view keeps its own');
	eq(r('x'), null, 'text saved: the same');
	eq(j(r({ match: 'any', conditions: [{ property: 'target', operator: '>', value: 5 }] })), j(def('any', ['target', '>', 5])), 'a filter of conditions is read as it is');
	eq(j(readState({ status: ['draft'] }, STATUSES, LABELS, { status: 'state', label: 'colour' })), j(def('all', ['state', 'is', ['Draft']])), 'the property names are settings’');
	// written back
	const w = (d: FilterDef) => writeState(d, names);
	eq(j(w(def('all', ['status', 'is', ['Draft']], ['label', 'is', ['Red']]))), j({ status: ['Draft'], label: ['Red'] }), 'only status and label: the shape older Binders read');
	eq(j(w(def('all'))), j({ status: [], label: [] }), 'off: the same');
	eq(j(w(def('all', ['label', 'is', ['Red']]))), j({ status: [], label: ['Red'] }), 'one list');
	eq(j(r(w(def('all', ['status', 'is', ['Draft', '']])))), j(def('all', ['status', 'is', ['Draft', '']])), 'and back again');
	eq(j(w(def('any', ['status', 'is', ['Draft']]))), j({ match: 'any', conditions: [{ property: 'status', operator: 'is', value: 'Draft' }] }), 'any: the new shape');
	eq(j(w(def('all', ['status', 'is not', ['Draft']]))), j({ conditions: [{ property: 'status', operator: 'is not', value: 'Draft' }] }), 'another operator: the new shape');
	eq(j(w(def('all', ['status', 'is', ['A']], ['status', 'is', ['B']]))), j({ conditions: [{ property: 'status', operator: 'is', value: 'A' }, { property: 'status', operator: 'is', value: 'B' }] }), 'two on one property: the new shape');
	eq(j(w(def('all', ['status', 'is', [] ]))), j({ conditions: [{ property: 'status', operator: 'is' }] }), 'a row with nothing picked yet is kept (the new shape)');
	eq(j(w(def('all', ['target', '>', 5]))), j({ conditions: [{ property: 'target', operator: '>', value: 5 }] }), 'another property: the new shape');
	eq(j(w({ name: 'Saved', match: 'all', conditions: [] })), j({ name: 'Saved', conditions: [] }), 'a named one keeps its name');
	eq(j(w(def('all', ['status', 'is', [3 as unknown as string]]))), j({ conditions: [{ property: 'status', operator: 'is', value: 3 }] }), 'values that aren’t text are not forced into lists of text');
}

done();
