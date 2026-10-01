import { DEFAULT_COLUMNS, clampWidth, columnName, columnWidth, compareValues, isColumn, move, nextSort, parseTarget, parseTyped, progress, propId, propOf, readColumns, readSort, readTarget, suggestProps, text } from '../src/view/outliner-data';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// columns
{
	eq(propOf(propId('POV')), 'POV', 'a property column');
	eq(propOf('words'), null, 'a built-in column isn’t one');
	ok(isColumn('label') && isColumn('prop:x') && !isColumn('prop:') && !isColumn('plotlines'), 'which ids are columns');
	eq(columnName('progress'), 'Progress', 'a built-in column’s name');
	eq(columnName('prop:Point of view'), 'Point of view', 'a property column is named by its property');
	eq(columnName('title'), 'Title', 'the title');
	eq(columnWidth({ id: 'words' }), 80, 'a built-in column’s own width');
	eq(columnWidth({ id: 'prop:x' }), 140, 'a property column’s');
	eq(columnWidth({ id: 'words', width: 5 }), 48, 'never too narrow to grab');
	eq(clampWidth(9999), 640, 'nor absurdly wide');
	eq(j(readColumns(['label', { id: 'words', width: 91.4 }, { id: 'words' }, 'bogus', 7, null, { id: 'prop:POV', width: 'wide' }])), j([{ id: 'label' }, { id: 'words', width: 91 }, { id: 'prop:POV' }]), 'read from saved state: known, once each');
	eq(readColumns({ id: 'label' }), null, 'not a list');
	eq(j(readColumns([])), '[]', 'no columns at all is a choice');
	ok(DEFAULT_COLUMNS.every((c) => isColumn(c.id)), 'the default columns exist');
	eq(j(move(['a', 'b', 'c'], 0, 2)), j(['b', 'c', 'a']), 'move to the end');
	eq(j(move(['a', 'b', 'c'], 2, 0)), j(['c', 'a', 'b']), 'move to the start');
	eq(j(move(['a', 'b'], 5, 0)), j(['a', 'b']), 'nothing to move');
}

// sorting: ascending, descending, binder order
{
	eq(j(readSort({ id: 'title', dir: -1 })), j({ id: 'title', dir: -1 }), 'the title sorts too');
	eq(readSort({ id: 'bogus', dir: 1 }), null, 'an unknown column doesn’t');
	eq(readSort({ id: 'words', dir: 2 }), null, 'nor an odd direction');
	const sorted = (list: unknown[], dir: 1 | -1 = 1) => [...list].sort((a, b) => compareValues(a, b, dir));
	eq(j(sorted([10, 2, 33])), j([2, 10, 33]), 'numbers by size');
	eq(j(sorted([10, 2, 33], -1)), j([33, 10, 2]), 'and down');
	eq(j(sorted(['Scene 10', 'scene 2', 'Scene 1'])), j(['Scene 1', 'scene 2', 'Scene 10']), 'text as names sort: any case, numbers by value');
	eq(j(sorted([3, null, 1, '', 2])), j([1, 2, 3, null, '']), 'blanks last');
	eq(j(sorted([3, null, 1, undefined, 2], -1)), j([3, 2, 1, null, undefined]), 'blanks last going down too');
	eq(j(sorted([false, true, false])), j([true, false, false]), 'ticked first');
	eq(j(sorted([['b', 'a'], [], ['a']].map((x) => text(x)))), j(['a', 'b, a', '']), 'lists as their text');
}

// values
{
	eq(text(['Mara', 'Ines']), 'Mara, Ines', 'a list');
	eq(text(true), 'Yes', 'a tick');
	eq(text(3.5), '3.5', 'a number');
	eq(text({ a: 1 }), '', 'something nested shows as nothing');
	eq(text(null), '', 'nothing');
	eq(readTarget(1500), 1500, 'a target');
	eq(readTarget('1,500'), 1500, 'typed with a comma');
	eq(readTarget(-5), 0, 'not below zero');
	eq(readTarget('soon'), 0, 'not text');
	eq(readTarget(12.6), 13, 'whole words');
	eq(parseTarget('2 000'), 2000, 'spaces as thousands');
	eq(parseTarget(''), 0, 'nothing typed: no target');
	eq(parseTarget('lots'), null, 'not a number');
	eq(parseTarget('-3'), null, 'not a negative one');
	eq(parseTarget('1.500'), 1500, 'a dot groups thousands in much of the world: 1.500 is fifteen hundred, not two');
	eq(parseTarget('12.345.678'), 12345678, 'several groups');
	eq(parseTarget('1.5'), null, 'half a word isn’t a target');
	eq(parseTarget('0.4'), null, 'nor less than one');
	eq(parseTarget('1 500'), 1500, 'a narrow space, as some locales group');
	eq(parseTarget('1’500'), 1500, 'or an apostrophe');
	eq(parseTarget('99999999999999999999999'), null, 'more words than any book has is refused, not stored as 1e+23');
	eq(readTarget('1.500'), 1500, 'read from a note the same way');
	eq(readTarget(1e23), 0, 'a number that large isn’t a target');
	eq(j(nextSort(null, 'words')), j({ id: 'words', dir: 1 }), 'a header clicked: ascending');
	eq(j(nextSort({ id: 'words', dir: 1 }, 'words')), j({ id: 'words', dir: -1 }), 'again: descending');
	eq(nextSort({ id: 'words', dir: -1 }, 'words'), null, 'again: binder order');
	eq(j(nextSort({ id: 'words', dir: -1 }, 'label')), j({ id: 'label', dir: 1 }), 'another column starts ascending');
	eq(progress(50, 200), 0.25, 'a quarter of the way');
	eq(progress(500, 200), 1, 'a bar doesn’t overrun');
	eq(progress(null, 200), 0, 'not counted yet');
	eq(progress(50, 0), null, 'no target, no progress');
	eq(parseTyped('12', 7), 12, 'a number stays a number');
	eq(parseTyped('twelve', 7), 'twelve', 'unless it isn’t one any more');
	eq(parseTyped('12', 'x'), '12', 'text stays text');
	eq(j(parseTyped('Mara,  Ines ,', ['x'])), j(['Mara', 'Ines']), 'a list is split at commas');
	eq(parseTyped('  ', ['x']), undefined, 'an emptied list is removed');
	eq(parseTyped('', 'x'), undefined, 'emptied text is removed');
	eq(j(suggestProps([{ pov: 'Mara', synopsis: 'x', position: {} }, { pov: 'Ines', tags: ['a'], plot: { a: 'b' } }, { date: '2026' }], ['synopsis', 'Date'])), j(['pov', 'tags']), 'properties in use, most used first, without Binders’ own or nested ones');
}

done('outliner data');
