import { move, nameProblem, readColors, readList, readPlotText, recolor, rename, toggle } from '../src/view/plotgrid-data';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// reading the binder's plotlines and a scene's
{
	eq(j(readList(['Mara', ' Mara ', '', 7, null, 'The keeper'])), j(['Mara', '7', 'The keeper']), 'trimmed, no blanks or repeats, numbers as text');
	eq(j(readList('Mara')), j(['Mara']), 'a single value is a list of one');
	eq(j(readList(undefined)), '[]', 'none');
	eq(j(readColors({ Mara: 'Red', Keeper: 'teal', Other: 3 })), j({ Mara: 'red' }), 'known colors only, lower case');
	eq(j(readColors(['red'])), '{}', 'not a map: no colors');
	eq(j([...readPlotText({ Mara: 'She hides the letter.', Keeper: '  ', Harbour: null, Storm: 2 })]), j(['Mara', 'Storm']), 'plotlines with text');
	eq(readPlotText('text').size, 0, 'not a map: none');
}

// the edits the grid makes
{
	eq(j(toggle(['Mara'], 'Keeper')), j(['Mara', 'Keeper']), 'toggle adds at the end');
	eq(j(toggle(['Mara', 'Keeper'], 'Mara')), j(['Keeper']), 'toggle removes');
	eq(j(rename(['A', 'Mara', 'B'], 'Mara', 'Mara Voss')), j(['A', 'Mara Voss', 'B']), 'rename keeps the place');
	eq(j(rename(['Mara', 'B', 'Voss'], 'Mara', 'Voss')), j(['Voss', 'B']), 'renaming onto a name already there merges them');
	eq(j(move(['a', 'b', 'c'], 0, 2)), j(['b', 'c', 'a']), 'move to the end');
	eq(j(move(['a', 'b', 'c'], 2, 0)), j(['c', 'a', 'b']), 'move to the start');
	eq(j(move(['a', 'b'], 5, 0)), j(['a', 'b']), 'nothing to move');
	eq(j(recolor({ Mara: 'red', Keeper: 'blue' }, 'Mara', 'Voss')), j({ Voss: 'red', Keeper: 'blue' }), 'a color follows a rename');
	eq(j(recolor({ Mara: 'red', Voss: 'green' }, 'Mara', 'Voss')), j({ Voss: 'red' }), 'a stale color under the new name gives way');
	eq(recolor({ Mara: 'red' }, 'Mara', null), undefined, 'the last color deleted: none left');
	eq(nameProblem('', ['Mara']), 'A plotline needs a name.', 'a name is needed');
	ok(/already a plotline called “Mara”/.test(nameProblem('Mara', ['Mara']) ?? ''), 'no two plotlines with one name');
	eq(nameProblem('Mara', ['Mara'], 'Mara'), null, 'keeping its own name is fine');
}

done('plot grid data');
