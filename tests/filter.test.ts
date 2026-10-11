import { choices, filterCount, isOn, noFilter, passes, readFilter, toggled, type Filter } from '../src/filter/filter';
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
	eq(j(read({})), j(noFilter()), 'an object without lists is a filter that is off');
	eq(j(read([])), j(noFilter()), 'an array is an object with no lists');
	eq(j(read({ status: 'Draft', label: { a: 1 } })), j(noFilter()), 'lists that aren’t lists are empty');
	eq(j(read({ status: ['Draft', 3, null, 'Final', {}], label: [true, 'Red'] })), j({ status: ['Draft', 'Final'], label: ['Red'] }), 'only the text in a list is kept');
	eq(j(read({ status: ['draft', ' FINAL '], label: ['bLUE'] })), j({ status: ['Draft', 'Final'], label: ['Blue'] }), 'spelled as settings spell them, trimmed');
	eq(j(read({ status: ['Dummy', 'dummy'], label: ['#aabbcc'] })), j({ status: ['Dummy', 'dummy'], label: ['#aabbcc'] }), 'what settings don’t list stays as written, and keeps its case');
	eq(j(read({ status: [''], label: ['', '  '] })), j({ status: [''], label: ['', ''] }), '“no status” and “no label” are the empty text; blanks become it');
	eq(j(read({ status: ['Draft', 'draft'] })), j({ status: ['Draft', 'Draft'], label: [] }),'two spellings of one value are both kept (nothing dedupes)');
}

// counting
{
	eq(filterCount(noFilter()), 0, 'off counts none');
	eq(isOn(noFilter()), false, 'and is off');
	const f: Filter = { status: ['Draft', ''], label: ['Red'] };
	eq(filterCount(f), 3, '“no status” is counted as a value');
	eq(isOn(f), true, 'on');
	eq(isOn({ status: [], label: [''] }), true, 'only “no label” is on');
}

// matching
{
	const none = noFilter();
	ok(passes(none, { status: '', label: '' }), 'a filter that is off passes everything');
	ok(passes(none, { status: 'Draft', label: 'Red' }), 'and everything with values');
	const st: Filter = { status: ['Draft', 'Final'], label: [] };
	ok(passes(st, { status: 'Draft', label: 'Red' }), 'a status in the list');
	ok(passes(st, { status: 'Final', label: '' }), 'another');
	ok(!passes(st, { status: 'Revised', label: 'Red' }), 'a status not in it');
	ok(!passes(st, { status: '', label: 'Red' }), 'no status, and “no status” not asked for');
	ok(!passes(st, { status: 'draft', label: '' }), 'matching is exact (reading a note’s status is the views’ to spell)');
	const noSt: Filter = { status: ['', 'Draft'], label: [] };
	ok(passes(noSt, { status: '', label: 'Blue' }), '“no status” asked for: a note without one passes');
	ok(passes(noSt, { status: 'Draft', label: '' }), 'with Draft too');
	ok(!passes(noSt, { status: 'Final', label: '' }), 'but not Final');
	const both: Filter = { status: ['Draft'], label: ['Red', ''] };
	ok(passes(both, { status: 'Draft', label: 'Red' }), 'status and label both hold');
	ok(passes(both, { status: 'Draft', label: '' }), 'and “no label”');
	ok(!passes(both, { status: 'Draft', label: 'Blue' }), 'the label fails');
	ok(!passes(both, { status: 'Final', label: 'Red' }), 'the status fails');
	ok(!passes({ status: [], label: ['Green'] }, { status: 'Draft', label: 'Red' }), 'a label alone');
	ok(!passes({ status: ['Gone'], label: [] }, { status: 'Draft', label: '' }), 'a status that no note has any more passes nothing');
	ok(!passes({ status: [], label: ['#aabbcc'] }, { status: '', label: 'Red' }), 'a label that no longer exists passes nothing');
	ok(passes({ status: [], label: ['#aabbcc'] }, { status: '', label: '#aabbcc' }), 'unless a note has it');
}

// ticking
{
	const f = noFilter();
	const a = toggled(f, 'status', 'Draft');
	eq(j(a), j({ status: ['Draft'], label: [] }), 'ticked');
	eq(j(f), j(noFilter()), 'the old one is untouched');
	eq(j(toggled(a, 'status', 'Final')), j({ status: ['Draft', 'Final'], label: [] }), 'a second goes after');
	eq(j(toggled(a, 'status', 'Draft')), j(noFilter()), 'unticked');
	eq(j(toggled(a, 'label', 'Red')), j({ status: ['Draft'], label: ['Red'] }), 'the other list');
	eq(j(toggled(a, 'status', '')), j({ status: ['Draft', ''], label: [] }), '“no status” is a value');
	eq(j(toggled({ status: ['x', '', 'y'], label: [] }, 'status', '')), j({ status: ['x', 'y'], label: [] }), 'and comes off');
}

// what the menu lists
{
	const notes = [
		{ status: 'Final', label: 'Blue' }, { status: 'Draft', label: '' }, { status: '', label: 'Red' }, { status: 'Odd', label: 'Red' }, { status: 'Draft', label: '#abc' },
	];
	const c = choices(notes, noFilter(), STATUSES, LABELS);
	eq(j(c.status), j({ values: ['Draft', 'Final', 'Odd'], none: true }), 'statuses in settings’ order, the others after; some note has none');
	eq(j(c.label), j({ values: ['Red', 'Blue', '#abc'], none: true }), 'labels the same');
	const all = choices([{ status: 'Draft', label: 'Red' }], noFilter(), STATUSES, LABELS);
	eq(j(all), j({ status: { values: ['Draft'], none: false }, label: { values: ['Red'], none: false } }), 'every note has both: no “none”');
	const empty = choices([], noFilter(), STATUSES, LABELS);
	eq(j(empty), j({ status: { values: [], none: false }, label: { values: [], none: false } }), 'no notes: nothing to list');
	const on = choices([{ status: 'Draft', label: 'Red' }], { status: ['Gone', 'Revised'], label: ['', 'Missing'] }, STATUSES, LABELS);
	eq(j(on.status), j({ values: ['Draft', 'Revised', 'Gone'], none: false }), 'what is filtered by is listed though no note has it');
	eq(j(on.label), j({ values: ['Red', 'Missing'], none: true }), 'and “no label” too, when it is asked for');
	const case_ = choices([{ status: 'draft', label: '' }, { status: 'Draft', label: '' }], noFilter(), STATUSES, LABELS);
	eq(j(case_.status.values), j(['draft', 'Draft']), 'case is part of the value: both are listed, in the order they came');
	const ties = choices([{ status: 'b', label: '' }, { status: 'a', label: '' }], noFilter(), [], []);
	eq(j(ties.status.values), j(['b', 'a']), 'with no order set, the order they come in');
}

done();
