import { atom, boolOf, complete, daysOf, kindFrom, linkOf, matches, numberOf, operatorOf, passes, problem, readDef, readDefs, same, say, writeDef, OPERATORS, type Condition, type Env, type FilterDef, type Kind } from '../src/filter/conditions';
import { done, eq, ok } from './harness';

// a vault with two notes named Mara, one Harrow, and nothing called Pell
const NOTES: Record<string, string> = { Mara: 'Characters/Mara.md', 'Characters/Mara': 'Characters/Mara.md', 'Old/Mara': 'Old/Mara.md', Harrow: 'Characters/Harrow.md', harrow: 'Characters/Harrow.md' };
const env: Env = { resolve: (l) => NOTES[l] ?? null };
const c = (property: string, operator: string, value?: unknown): Condition => ({ property, operator, ...(value !== undefined ? { value } : {}) });
const js = (v: unknown) => JSON.stringify(v);
const pass = (kind: Kind, operator: string, value: unknown, has: unknown) => passes(c('p', operator, value), kind, has, env);

// links: by what they point at, whatever they show
eq(js(linkOf('[[Harrow|the keeper]]')), js({ target: 'Harrow', shown: 'the keeper' }), 'a link with an alias');
eq(js(linkOf('[[Characters/Mara#Early life]]')), js({ target: 'Characters/Mara', shown: 'Mara' }), 'a link to a heading names the note');
eq(linkOf('Mara'), null, 'plain text is no link');
ok(pass('list', 'contains any of', ['[[Harrow]]'], ['[[Mara]]', '[[Harrow|the keeper]]']), 'a link matches the same note under an alias');
ok(pass('list', 'contains any of', ['[[Mara]]'], ['[[Characters/Mara]]']), 'a link matches the same note by its path');
ok(!pass('list', 'contains any of', ['[[Mara]]'], ['[[Old/Mara]]']), 'two notes of one name are two people');
ok(pass('list', 'contains any of', ['[[Mara]]'], ['Mara', 'Harrow']), 'a link matches the name typed plain');
ok(pass('list', 'contains any of', ['mara'], ['[[Mara]]']), 'a name typed plain matches a link, in any case');
ok(pass('list', 'contains any of', ['[[Pell]]'], ['[[Pell]]']), 'links to a note that isn’t there match by name');
ok(!pass('list', 'contains any of', ['[[Mara]]'], ['Maramures']), 'a name is the whole name');
ok(same(atom('[[Harrow]]', env)!, atom('[[harrow|H.]]', env)!), 'the same note, however it is written');
ok(pass('list', 'contains any of', ['[[Mara]]'], ['[[Mara|Mara Vane]]']), 'an alias on the note’s side too');
ok(pass('list', 'contains any of', ['[[Pell]]'], ['Pell']), 'a link to a note that isn’t there matches the plain name');
ok(!pass('list', 'contains any of', ['[[Pell]]'], ['[[Harrow|Pell]]']), 'an alias is not the note: Harrow shown as Pell is Harrow');
ok(pass('list', 'contains any of', ['[[Café]]'], ['[[Café]]']), 'a name in either Unicode form is the same name');

// lists
ok(pass('list', 'contains all of', ['[[Mara]]', '[[Harrow]]'], ['[[Harrow|the keeper]]', '[[Mara]]', '[[Pell]]']), 'all of');
ok(!pass('list', 'contains all of', ['[[Mara]]', '[[Harrow]]'], ['[[Mara]]']), 'all of, one missing');
ok(pass('list', 'does not contain any of', ['[[Pell]]'], ['[[Mara]]']), 'none of');
ok(!pass('list', 'does not contain any of', ['[[Mara]]'], ['[[Mara]]', '[[Harrow]]']), 'none of, one present');
ok(pass('list', 'does not contain any of', ['[[Pell]]'], undefined), 'none of, with no list at all');
ok(!pass('list', 'contains any of', ['[[Mara]]'], undefined), 'any of, with no list at all');
ok(!pass('list', 'contains all of', ['[[Mara]]'], []), 'all of, with an empty list');
ok(pass('list', 'contains any of', ['[[Mara]]'], '[[Mara]]'), 'one value where a list is meant is a list of one');
ok(pass('list', 'contains any of', ['[[Mara]]', '[[Pell]]'], ['[[Mara]]']), 'a list of one against several');
ok(pass('list', 'contains any of', '[[Mara]]', ['[[Mara]]']), 'one wanted value written plain, not as a list');
ok(pass('list', 'is empty', undefined, []) && pass('list', 'is empty', undefined, ['', null]) && !pass('list', 'is empty', undefined, ['x']), 'an empty list');
ok(pass('list', 'is not empty', undefined, ['x']) && !pass('list', 'is not empty', undefined, undefined), 'a list that isn’t empty');

// text
ok(pass('text', 'is', ['Draft', 'Idea'], 'draft'), 'is: any of the values, in any case');
ok(!pass('text', 'is', ['Draft'], 'Drafted'), 'is: the whole value');
ok(pass('text', 'is', ['Café'], 'Café'), 'is: in either Unicode form');
ok(pass('text', 'is', ['Draft'], '  Draft '), 'is: spaces round it don’t count');
ok(pass('text', 'is not', ['Revised'], 'Draft') && pass('text', 'is not', ['Revised'], undefined), 'is not: a note with none passes');
ok(!pass('text', 'is not', ['Revised'], 'revised'), 'is not: in any case');
ok(pass('text', 'is', ['Draft', ''], undefined) && !pass('text', 'is', ['Draft'], undefined), 'is: nothing, when nothing is one of the values');
ok(pass('text', 'is', [''], '') && pass('text', 'is', [''], '   ') && !pass('text', 'is', [''], 'Draft'), 'is: only nothing (“No status”)');
ok(pass('text', 'is not', [''], 'Draft') && !pass('text', 'is not', [''], undefined), 'is not: nothing');
ok(pass('text', 'contains', 'jetty', 'The supply boat leaves Mara on the JETTY.'), 'contains');
ok(pass('text', 'contains', 'JETTY', 'jetty'), 'contains, in any case');
ok(!pass('text', 'contains', 'jetty', undefined), 'contains, with nothing there');
ok(pass('text', 'does not contain', 'jetty', undefined), 'does not contain, with nothing there');
ok(!pass('text', 'does not contain', 'jetty', 'the Jetty'), 'does not contain, when it does');
ok(pass('text', 'is', ['[[Mara]]'], '[[Mara|M.]]'), 'a text property that holds a link (a pov)');
ok(pass('text', 'contains', 'Mara', '[[Mara|the keeper]]') && pass('text', 'contains', 'keeper', '[[Mara|the keeper]]'), 'contains looks at a link’s name and what it shows');
ok(pass('text', 'is', ['3'], 3), 'a number in a text property');
ok(pass('text', 'is empty', undefined, '  ') && pass('text', 'is not empty', undefined, 'x'), 'empty text');
ok(pass('text', 'is empty', undefined, null) && pass('text', 'is empty', undefined, ''), 'empty text, null and ""');

// numbers
ok(pass('number', '>', 2000, 2500) && !pass('number', '>', 2000, 2000) && pass('number', '>=', 2000, '2,000'), 'more than');
ok(pass('number', '<', 2000, 1500) && !pass('number', '<', 2000, 2000) && pass('number', '<=', 2000, 2000), 'less than');
ok(pass('number', '=', 2000, '2000') && !pass('number', '=', 2000, 2001), 'equal, a number written as text');
ok(pass('number', '>', '2000', 2500), 'a condition’s own number written as text');
ok(!pass('number', '>', 2000, undefined) && !pass('number', '<', 2000, undefined) && !pass('number', '=', 2000, undefined), 'no number is neither more nor less nor equal');
ok(!pass('number', '>', 2000, 'lots'), 'text that isn’t a number is no number');
ok(pass('number', '!=', 2000, undefined) && pass('number', '!=', 2000, 1999) && !pass('number', '!=', 2000, 2000), 'no number is not 2000');
ok(pass('number', '>', -5, 0) && pass('number', '<', 0, -0.5), 'negative and fractional numbers');
ok(pass('number', 'is empty', undefined, undefined) && !pass('number', 'is empty', undefined, 0), 'zero is not empty');
eq(numberOf('1,5'), null, 'a comma that isn’t a thousands separator is no number');
eq(numberOf('2,000.5'), 2000.5, 'thousands, and a fraction');
eq(numberOf(' 12 '), 12, 'spaces');
eq(numberOf('1e3'), 1000, 'exponent');
eq(numberOf(''), null, 'nothing is no number');
eq(numberOf(NaN), null, 'NaN is no number');
eq(operatorOf('number', '≥')?.id, '>=', 'a typed symbol');
eq(operatorOf('list', 'Has any of')?.id, 'contains any of', 'other words for an operator');
eq(operatorOf('text', 'IS NOT')?.id, 'is not', 'an operator in any case');
eq(operatorOf('text', '>'), null, 'an operator of another kind is none');
eq(operatorOf('text', 3), null, 'an operator that isn’t text is none');

// dates: a vague one covers all of itself
ok(pass('date', 'before', '1925-06-19', '1925-06-18') && !pass('date', 'before', '1925-06-19', '1925-06-19'), 'before a day');
ok(pass('date', 'on or before', '1925-06-19', '1925-06-19') && !pass('date', 'on or before', '1925-06-19', '1925-06-20'), 'on or before a day');
ok(pass('date', 'after', '1925-06-19', '1925-06-20') && !pass('date', 'after', '1925-06-19', '1925-06-19'), 'after a day');
ok(pass('date', 'on or after', '1925-06-19', '1925-06-19') && !pass('date', 'on or after', '1925-06-19', '1925-06-18'), 'on or after a day');
ok(pass('date', 'on', '1925-06', '1925-06-19') && pass('date', 'on', '1925', '1925-06'), 'on: in the month, in the year');
ok(pass('date', 'on', '1925-06-19', '1925-06') && !pass('date', 'on', '1925-06-19', '1925-07'), 'on: a vague note date that could be the day');
ok(!pass('date', 'before', '1925-06-19', '1925') && pass('date', 'before', '1926', '1925'), 'a year is before only what starts after it ends');
ok(pass('date', 'before', '1925-06', '1925-05-31') && !pass('date', 'before', '1925-06', '1925-06-01'), 'before a month: wholly before its first day');
ok(pass('date', 'after', '1925-06', '1925-07-01') && !pass('date', 'after', '1925-06', '1925-06-30'), 'after a month: wholly after its last day');
ok(pass('date', 'after', '1925', '1926-01-01') && !pass('date', 'after', '1925', '1925-12-31'), 'after a year: wholly after its last day');
ok(pass('date', 'on or before', '1925-06', '1925') && pass('date', 'on or after', '1925-06', '1925'), 'on or before / after: a year could be either side of a month in it');
ok(pass('date', 'on or after', '1925-06-19', '1925-06-19T08:30') && pass('date', 'after', '1925-06-19', 1961), 'after, with a time, and a bare year');
ok(pass('date', 'on', '1925-06-19', '1925-06-19T23:59'), 'a time of day is not looked at');
ok(pass('date', 'on', '19 June 1925', '1925-06-19') && pass('date', 'on', '1925-06-19', 'June 19, 1925'), 'a date in words is the same day');
ok(pass('date', 'on', '1925-02-28', '1925-02-28') && !pass('date', 'on', '1925-02-28', '1925-03-01'), 'the end of February');
ok(pass('date', 'after', '1924-02-28', '1924-02-29') && pass('date', 'before', '1924-03-01', '1924-02-29'), 'a leap day');
ok(pass('date', 'before', '0100', '-0030-02-01') && pass('date', 'after', '-0030', '0010'), 'years before the common era');
ok(!pass('date', 'before', '1925-06-19', undefined) && !pass('date', 'after', '1925-06-19', 'someday'), 'no date is neither');
ok(pass('date', 'not on', '1925-06-19', undefined) && pass('date', 'not on', '1925-06-19', 'someday') && !pass('date', 'not on', '1925-06-19', '1925-06-19'), 'not on: no date is on no day');
ok(pass('date', 'is empty', undefined, undefined) && !pass('date', 'is empty', undefined, 'someday'), 'a date that isn’t one is not empty');
eq(daysOf('1925-13-01'), null, 'a thirteenth month is no date');
eq(daysOf('1925-02-30'), null, 'a 30th of February is no date');
eq(daysOf('tomorrow'), null, 'words are no date');
eq(daysOf(3.5), null, 'a fraction is no year');
eq(js(daysOf('1970-01-01')), js([0, 0]), 'day zero');
eq(js(daysOf('1970-02')), js([31, 58]), 'a month is its days');
eq(js(daysOf(1971)), js([365, 729]), 'a year is its days');

// checkboxes
ok(pass('checkbox', 'is', false, false) && pass('checkbox', 'is', false, undefined), 'a checkbox not ticked, or not there, is not ticked');
ok(pass('checkbox', 'is', true, true) && !pass('checkbox', 'is', true, undefined), 'not ticked and not there are both not ticked');
ok(pass('checkbox', 'is', true, 'true') && pass('checkbox', 'is', 'false', false), 'a checkbox written as text');
eq(boolOf('yes'), null, 'only true and false');

// operators of every kind are known by name, and a hand-written operator of the wrong kind is no operator
for (const kind of ['text', 'list', 'number', 'date', 'checkbox'] as Kind[]) for (const o of OPERATORS[kind]) eq(operatorOf(kind, o.id)?.id, o.id, `${kind} ${o.id} is read back`);

// a row half made is left out, and a filter of such rows hides nothing
ok(!complete(c('status', 'is'), 'text') && complete(c('status', 'is empty'), 'text') && !complete(c('target', '>', 'many'), 'number'), 'whole and half-made rows');
ok(complete(c('status', 'is', ['']), 'text') && complete(c('status', 'is', ''), 'text'), '“is” may name nothing');
ok(!complete(c('status', 'contains', ''), 'text') && !complete(c('status', 'contains'), 'text'), '“contains” needs something');
ok(!complete(c('characters', 'contains any of', []), 'list') && !complete(c('characters', 'contains any of', ['']), 'list'), 'a list of nothing is half made');
ok(!complete(c('', 'is', 'x'), 'text'), 'no property is half made');
ok(!complete(c('when', 'before', 'someday'), 'date') && complete(c('when', 'before', 1925), 'date'), 'a date that isn’t one is half made');
ok(!complete(c('done', 'is'), 'checkbox') && complete(c('done', 'is', false), 'checkbox'), 'a checkbox needs true or false');
ok(!complete(c('status', '>', 3), 'text'), 'an operator of another kind is half made');
eq(problem(c('target', '>', 'many'), 'number'), 'That isn’t a number.', 'a number that isn’t one is said so');
eq(problem(c('target', '>'), 'number'), null, 'nothing picked yet is no error');
eq(problem(c('when', 'before', 'someday'), 'date')?.slice(0, 18), 'That isn’t a date.', 'a date that isn’t one is said so');
ok(!!problem(c('status', '>', 3), 'text'), 'an operator that doesn’t apply is said so');
eq(problem(c('status', 'is', 'Draft'), 'text'), null, 'a whole row has no problem');

const kinds: Record<string, Kind> = { characters: 'list', status: 'text', target: 'number' };
const note = { characters: ['[[Mara]]', '[[Harrow|the keeper]]'], status: 'Draft', target: 2000 } as Record<string, unknown>;
const run = (f: FilterDef, n = note) => matches(f, (p) => n[p], (p) => kinds[p] ?? 'text', env);
const MARA: FilterDef = { name: 'Mara, not yet revised', match: 'all', conditions: [c('characters', 'contains any of', ['[[Mara]]']), c('status', 'is not', 'Revised')] };
ok(run(MARA), 'Mara, not yet revised: a draft with Mara in it');
ok(!run(MARA, { ...note, status: 'Revised' }), 'the same scene once revised');
ok(run({ match: 'all', conditions: [c('status', 'is')] }, { status: 'Done' }), 'a filter of half-made rows passes everything');
ok(run({ match: 'any', conditions: [] }) && run({ match: 'none', conditions: [] }), 'a filter with no rows passes everything, whatever it combines by');
ok(run({ match: 'any', conditions: [c('status', 'is', 'Done'), c('target', '>=', 2000)] }), 'any');
ok(!run({ match: 'none', conditions: [c('status', 'is', 'Done'), c('target', '>=', 2000)] }), 'none');
ok(run({ match: 'none', conditions: [c('status', 'is', 'Done'), c('target', '>', 2000)] }), 'none, when neither is true');
ok(!run({ match: 'all', conditions: [c('status', 'is', 'Done'), c('target', '>=', 2000)] }), 'all, when one is not');
ok(run({ match: 'all', conditions: [c('status', 'is', 'Draft'), c('target', '>', 'many'), c('characters', 'contains any of', [])] }), 'all, with half-made rows beside a whole one');
ok(!run({ match: 'any', conditions: [c('status', 'is', 'Done'), c('target', '>', 'many')] }), 'any: a half-made row is not a row that is true');

// kinds, from what the notes hold
eq(kindFrom([['[[Mara]]'], [], undefined]), 'list', 'lists');
eq(kindFrom([2000, 1500]), 'number', 'numbers');
eq(kindFrom(['1925-06-19', '1925-06']), 'date', 'dates');
eq(kindFrom(['1925', '1926']), 'text', 'years written as text are not dates (a number would be a number)');
eq(kindFrom(['Draft', 2]), 'text', 'a mix is text');
eq(kindFrom([true, false, undefined]), 'checkbox', 'checkboxes');
eq(kindFrom([undefined, '', null]), 'text', 'nothing is text');
eq(kindFrom(['[[Mara]]', ['[[Mara]]', '[[Pell]]']]), 'list', 'a list in some notes and one value in others is a list');

// the binder note
const yaml = [{ name: 'Mara, not yet revised', conditions: [{ property: 'characters', operator: 'contains any of', value: ['[[Mara]]'] }, { property: 'status', operator: 'is not', value: 'Revised' }] }, { name: 'mara, NOT yet revised', conditions: [] }, 'nonsense', { conditions: [] }, [], null, { name: 'Long or done', match: 'any', conditions: [{ property: 'target', operator: '>=', value: 2500 }, { nothing: 1 }, 'x', { property: 'status', operator: 'is', value: ['Done', 'Revised'] }] }];
const read = readDefs(yaml);
eq(js(read.map((f) => f.name)), js(['Mara, not yet revised', 'Long or done']), 'filters read: named ones, each name once');
eq(read[1].conditions.length, 2, 'a condition that names no property is passed over');
eq(js(writeDef(read[0])), js({ name: 'Mara, not yet revised', conditions: [{ property: 'characters', operator: 'contains any of', value: '[[Mara]]' }, { property: 'status', operator: 'is not', value: 'Revised' }] }), 'written: one value plain, no match when all');
eq(js(writeDef(read[1])), js({ name: 'Long or done', match: 'any', conditions: [{ property: 'target', operator: '>=', value: 2500 }, { property: 'status', operator: 'is', value: ['Done', 'Revised'] }] }), 'written: match when not all, several values as a list');
eq(js(readDefs([writeDef(read[1])])), js([read[1]]), 'written and read again');
eq(js(readDefs('x')) + js(readDefs(undefined)) + js(readDefs({})), '[][][]', 'filters that aren’t a list are none');
eq(readDef({ name: 7, conditions: [] })?.name, '7', 'a name typed as a number is its text');
eq(readDef({ conditions: [] }, false)?.name, undefined, 'a filter in a view’s state has no name');
eq(readDef({ name: 'x', match: 'sometimes', conditions: 'no' })?.match, 'all', 'a match that isn’t one is all');
eq(js(readDef({ name: 'x', conditions: [{ property: ' status ', operator: ' Is  Not ', value: 'Done' }] })), js({ name: 'x', match: 'all', conditions: [{ property: 'status', operator: 'Is  Not', value: 'Done' }] }), 'a property and an operator trimmed; the operator is read by operatorOf in any case');
eq(say(read[0].conditions[0], (p) => p, 'list'), 'characters contains any of Mara', 'a condition in words');
eq(say(c('status', 'is empty'), (p) => p, 'text'), 'status is empty', 'a condition with no value in words');

done('conditions');
