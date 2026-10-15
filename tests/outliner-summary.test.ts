import { checkSummary, countSummary, dateSummary, keepAs, numberSummary, offered, span, summaryOf, tally } from '../src/view/outliner-summary';
import { readColumns } from '../src/view/outliner-data';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// which summary a column shows, and what it keeps
{
	eq(summaryOf('words', 'number', undefined)?.id, 'sum', 'Words is summed until told otherwise, as the last row always was');
	eq(summaryOf('target', 'number', undefined)?.id, 'total', 'Target: its own total (the folder’s target, or its notes’ together)');
	eq(summaryOf('revision', 'number', undefined)?.id, 'sum', 'Revision is summed');
	eq(summaryOf('status', 'name', undefined), null, 'a column of names shows nothing until asked');
	eq(summaryOf('words', 'number', 'none'), null, 'a default told to show nothing shows nothing');
	eq(summaryOf('status', 'name', 'values')?.name, 'By value', 'By value, for names');
	eq(summaryOf('words', 'number', 'values'), null, 'a summary the kind doesn’t offer is none');
	eq(keepAs('words', 'sum'), undefined, 'choosing the default keeps nothing');
	eq(keepAs('words', null), 'none', 'turning a default off is kept');
	eq(keepAs('status', null), undefined, 'turning off a column with no default keeps nothing');
	eq(keepAs('status', 'values'), 'values', 'a choice is kept');
	eq(j(offered('target', 'number').map((f) => f.id).slice(0, 2)), j(['total', 'sum']), 'Target offers its total, then a plain sum');
	eq(j(offered('created', 'date').map((f) => f.name)), j(['Earliest', 'Latest', 'Range', 'Filled', 'Empty']), 'Bases’ summaries for a date');
	eq(j(offered('export', 'checkbox').map((f) => f.name)), j(['Checked', 'Unchecked']), 'and for a tick');
	eq(j(readColumns([{ id: 'status', summary: 'values' }, { id: 'words', summary: '' }, { id: 'revision', width: 90, summary: 7 }])), j([{ id: 'status', summary: 'values' }, { id: 'words' }, { id: 'revision', width: 90 }]), 'a column keeps its summary through saved state');
}

// numbers
{
	const w = [100, 300, null, 200, 1400];
	eq(numberSummary('sum', w), '2,000', 'sum');
	eq(numberSummary('average', w), '500', 'average, of the notes that have a value');
	eq(numberSummary('median', w), '250', 'median of an even count: the mean of the two in the middle');
	eq(numberSummary('median', [5, 1, 3]), '3', 'median of an odd count');
	eq(numberSummary('min', w), '100', 'min');
	eq(numberSummary('max', w), '1,400', 'max');
	eq(numberSummary('range', w), '1,300', 'range');
	eq(numberSummary('filled', w), '4', 'filled');
	eq(numberSummary('empty', w), '1', 'empty');
	eq(numberSummary('average', [null, null]), '', 'nothing to average: nothing shown');
	eq(numberSummary('average', [1, 2]), '2', 'an average of words is a whole number');
}

// dates and ticks
{
	const ds = [30, null, 10, 20];
	eq(dateSummary('earliest', ds, (x) => x, (x) => `day ${x}`, (a, b) => b - a), 'day 10', 'earliest');
	eq(dateSummary('latest', ds, (x) => x, (x) => `day ${x}`, (a, b) => b - a), 'day 30', 'latest');
	eq(dateSummary('range', ds, (x) => x, String, (a, b) => b - a), '20 days', 'range, in words');
	eq(dateSummary('empty', ds, (x) => x, String, (a, b) => b - a), '1', 'empty');
	eq(span(1), '1 day', 'a day');
	eq(span(90), '3 months', 'months');
	eq(span(3000), '8 years', 'years');
	eq(checkSummary('checked', [true, false, null, true]), '2', 'checked');
	eq(checkSummary('unchecked', [true, false, null, true]), '2', 'unchecked: not ticked, or no value');
}

// by value: grouped as the filter groups them
{
	const env = { resolve: (link: string) => (link === 'Mara' || link === 'People/Mara' ? 'People/Mara.md' : null) };
	const notes: Record<string, unknown> = { a: 'Mara', b: '[[Mara]]', c: 'mara', d: 'Ines', e: '', f: ['[[People/Mara|M.]]', 'Ines'], g: undefined };
	const t = tally(Object.keys(notes), (k) => notes[k], env);
	eq(j(t.values.map((v) => [v.shown, v.files])), j([['Mara', ['a', 'b', 'c', 'f']], ['Ines', ['d', 'f']]]), 'a link is the note it names, a name is the same name whatever its case; most notes first');
	eq(t.values[0].raw, '[[Mara]]', 'a value that is a link somewhere is offered as the link');
	eq(j(t.none), j(['e', 'g']), 'notes with no value');
	ok(t.several, 'a note with two values is said to be counted under each');
	eq(countSummary('values', t, 7), '2', 'By value counts the values');
	eq(countSummary('filled', t, 7), '5', 'filled');
	eq(countSummary('empty', t, 7), '2', 'empty');
	ok(!tally(['x'], () => 'One', env).several, 'one value each: nothing to say');
}

done('outliner summary');
