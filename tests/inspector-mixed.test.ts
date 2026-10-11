import type { Env } from '../src/filter/conditions';
import { changeLists, groupLists } from '../src/inspector/mixed';
import { done, eq } from './harness';

const j = (x: unknown) => JSON.stringify(x);
// two notes named Mara, one in People and one in Places; Harrow is one note; Ghost names none
const FILES: Record<string, string> = { Mara: 'People/Mara.md', 'People/Mara': 'People/Mara.md', 'Places/Mara': 'Places/Mara.md', Harrow: 'Harrow.md' };
const env: Env = { resolve: (l) => FILES[l] ?? null };
const envs = (n: number) => Array.from({ length: n }, () => env);

// what all share, and what only some have
{
	const g = groupLists([['[[Mara]]', 'The master'], ['[[Harrow]]', 'Mara', 'The master']], envs(2));
	eq(j(g.common), j(['[[Mara]]', 'The master']), 'shared by link identity: Mara and [[Mara]] are the same name');
	eq(j(g.some.map((s) => [s.item, s.count])), j([['[[Harrow]]', 1]]), 'what only one has');
	const same = groupLists([['a', 'b'], ['b', 'a']], envs(2));
	eq(j(same.common), j(['a', 'b']), 'the same items in another order are shared');
	eq(same.some.length, 0, 'and nothing is on some');
}
{
	const g = groupLists([['[[People/Mara]]'], ['[[Places/Mara]]']], envs(2));
	eq(g.common.length, 0, 'links to two different notes both named Mara are two people');
	eq(g.some.length, 2, 'each on one');
	const h = groupLists([['[[Mara]]'], ['[[People/Mara]]']], envs(2));
	eq(h.common.length, 1, 'a short link and a full one to the same note are one');
	const k = groupLists([['[[Ghost]]'], ['Ghost']], envs(2));
	eq(k.common.length, 1, 'a link to a note that does not exist matches by name');
	const al = groupLists([['[[Harrow|the keeper]]'], ['[[Harrow]]']], envs(2));
	eq(al.common.length, 1, 'what a link shows does not matter');
}
{
	const g = groupLists([['a'], 'a', null, undefined, ''], envs(5));
	eq(g.common.length, 0, 'a note with nothing shares nothing');
	eq(j(g.some.map((s) => s.count)), j([2]), 'two have it');
	const t = groupLists([['a', 'a'], ['a']], envs(2));
	eq(t.common.length, 1, 'an item twice in one list is one');
	const s = groupLists([['x', 3, { k: 1 }], ['x']], envs(2));
	eq(j(s.common), j(['x']), 'what is not text is not an item');
}

// a change made to what they share
{
	const lists = [['[[Mara]]', 'The master'], ['[[Harrow]]', 'Mara', 'The master', 'Jonas']];
	const g = groupLists(lists, envs(2));
	// the writer adds Ines and takes The master away
	const out = changeLists(lists, envs(2), g.common, ['[[Mara]]', 'Ines']);
	eq(j(out[0]), j(['[[Mara]]', 'Ines']), 'added to the first, The master taken away');
	eq(j(out[1]), j(['[[Harrow]]', 'Mara', 'Jonas', 'Ines']), 'what only it has stays, in its own order; Mara stays as it was spelled');
	const none = changeLists(lists, envs(2), g.common, ['[[Mara]]', 'The master']);
	eq(none, null, 'nothing changed: nothing to write');
	const dup = changeLists([['a'], ['a', 'b']], envs(2), ['a'], ['a', 'b']);
	eq(j(dup), j([['a', 'b'], null]), 'an item a note has already is not added again (null: that one is as it was)');
	const all = changeLists([['a'], ['a', 'b']], envs(2), ['a'], []);
	eq(j(all), j([[], ['b']]), 'taken from all: the list left empty is an empty list');
	const keep = changeLists([['a', 7, { k: 1 }], ['a']], envs(2), ['a'], ['a', 'z']);
	eq(j(keep), j([['a', 7, { k: 1 }, 'z'], ['a', 'z']]), 'entries that are not text stay');
	const text = changeLists(['a', 'a'], envs(2), ['a'], ['a', 'z']);
	eq(j(text), j([['a', 'z'], ['a', 'z']]), 'a lone text is a list of one');
}

done('inspector mixed');
