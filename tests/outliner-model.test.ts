import { addWords, earliest, flattenRows, rankedKey, sortItems, type RowTree, type Sort } from '../src/view/outliner-data';
import { parseStoryDate, type StoryDate, type StoryPlace } from '../src/time/date';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const d = (s: string): StoryDate => { const x = parseStoryDate(s); if (!x) throw new Error('not a date: ' + s); return x; };

// the sort key of a label or a status
{
	const order = ['Draft', 'Revised', 'Final'];
	eq(rankedKey('Draft', order, 'Draft'), '0000Draft', 'first in settings’ list');
	eq(rankedKey('final', order, 'Final'), '0002Final', 'any case is the same place');
	eq(rankedKey('Odd', order, 'Odd'), '0003Odd', 'after them all');
	eq(rankedKey('', order, 'x'), '', 'none is nothing, which comes last in a sort');
	ok(rankedKey('Draft', order, 'Z') < rankedKey('Revised', order, 'A'), 'the list’s order, not the name’s');
	ok(rankedKey('Odd', order, 'A') < rankedKey('Other', order, 'B'), 'unlisted ones by name');
}

// sorting
{
	type It = { n: string; v: unknown; at?: string; order?: number };
	const items: It[] = [{ n: 'a', v: 3 }, { n: 'b', v: 1 }, { n: 'c', v: null }, { n: 'd', v: 1 }, { n: 'e', v: 2 }];
	const val = (i: It) => i.v, place = (i: It): StoryPlace | null => (i.at ? { date: d(i.at), order: i.order ?? null } : null);
	const run = (list: It[], sort: Sort) => sortItems(list, sort, val, place).map((i) => i.n).join('');
	eq(sortItems(items, null, val, place), items, 'without a sort, the list itself');
	eq(run(items, { id: 'words', dir: 1 }), 'bdeac', 'up: ties in the order they came, blanks last');
	eq(run(items, { id: 'words', dir: -1 }), 'aebdc', 'down: blanks still last');
	eq(j(items.map((i) => i.n)), j(['a', 'b', 'c', 'd', 'e']), 'the list is not changed');
	const story: It[] = [{ n: 'u1', v: 0 }, { n: 'late', v: 0, at: '1900-05-01' }, { n: 'early', v: 0, at: '1900-01-01' }, { n: 'u2', v: 0 }, { n: 'same2', v: 0, at: '1900-01-01', order: 2 }, { n: 'same1', v: 0, at: '1900-01-01', order: 1 }];
	eq(sortItems(story, { id: 'storydate', dir: 1 }, val, place).map((i) => i.n).join(' '), 'same1 same2 early late u1 u2', 'story time up: by date, then the numbered ones of a day before the unnumbered, undated last in the order they came');
	eq(sortItems(story, { id: 'storydate', dir: -1 }, val, place).map((i) => i.n).join(' '), 'late early same2 same1 u1 u2', 'down: the day’s order turns too; undated still last');
}

// adding up
{
	const asked: string[] = [];
	const w: Record<string, number | null> = { a: 10, b: 5, c: null, d: 7 };
	const get = (k: string) => { asked.push(k); return w[k]; };
	eq(addWords(['a', 'b'], get), 15, 'all counted: the sum');
	eq(addWords([], get), 0, 'a folder with no notes has none');
	asked.length = 0;
	eq(addWords(['a', 'c', 'd'], get), null, 'one not counted yet: nothing');
	eq(j(asked), j(['a', 'c']), 'and the rest are not asked for');
}

// the earliest date
{
	eq(earliest([]), null, 'none');
	eq(earliest([null, null]), null, 'none dated');
	eq(j(earliest([d('1900-05-01'), null, d('1900-01-01'), d('1901-01-01')])), j(d('1900-01-01')), 'the earliest, blanks skipped');
}

// the rows
{
	interface N { path: string; folder?: boolean; kids?: N[]; shown?: boolean }
	const f = (path: string, kids: N[]): N => ({ path, folder: true, kids });
	const n = (path: string, shown = true): N => ({ path, shown });
	const root = f('', [n('a'), f('P', [n('p1'), n('p2', false), f('Q', [n('q1')])]), f('Empty', []), n('b', false), f('R', [n('r1', false)])]);
	const tree = (order: (l: N[]) => N[] = (l) => l): RowTree<N, N> => ({
		children: (x) => x.kids ?? [], isFolder: (x): x is N => !!x.folder, pathOf: (x) => x.path, shows: (x) => x.shown !== false,
		holdsShown: (x) => (x.kids ?? []).some((k) => (k.folder ? tree().holdsShown(k) : k.shown !== false)), order,
	});
	const rows = (collapsed: string[], filtering: boolean, t = tree()) => flattenRows(root, t, new Set(collapsed), filtering).map((r) => `${r.depth}${r.item.path}`).join(' ');
	eq(rows([], false), '0a 0P 1p1 1Q 2q1 0Empty 0R', 'no filter: every folder, and the notes that show');
	eq(rows(['P'], false), '0a 0P 0Empty 0R', 'a folded folder has no rows under it');
	eq(rows([], true), '0a 0P 1p1 1Q 2q1 0Empty'.replace(' 0Empty', ''), 'a filter: a folder with no note that shows has no row');
	eq(rows(['Q'], true), '0a 0P 1p1 1Q', 'folded, with a filter');
	eq(rows([], false, tree((l) => [...l].reverse())), '0R 0Empty 0P 1Q 2q1 1p1 0a', 'each folder’s items in the order given');
}

done();
