import { applySceneOps, conversionPlan, flatten, isIgnored, isLongformIndex, nest, readProject, sameScenes, sceneGroups, shownScenes, writeScenes, type Scene } from '../src/longform';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);
const flat = (s: Scene[]) => s.map((x) => '  '.repeat(x.indent) + x.title).join('|');

// recognising index notes
{
	ok(isLongformIndex({ longform: { format: 'scenes' } }), 'format: scenes is a project');
	ok(!isLongformIndex({ longform: { format: 'single' } }), 'single-note projects are not');
	ok(!isLongformIndex({ longform: 'x' }) && !isLongformIndex({}) && !isLongformIndex(null), 'other notes are not');
	const p = readProject({ longform: { format: 'scenes', scenes: ['A'], ignoredFiles: ['Notes*', 3, ''] } });
	eq(p?.sceneFolder, '/', 'sceneFolder defaults to the same folder');
	eq(j(p?.ignored), j(['Notes*']), 'only text patterns');
}

// nested lists as a flat order with indents, and back in exactly Longform's shape
{
	const shapes: unknown[] = [
		['A', 'B', 'C'],
		['A', ['B', 'C'], 'D'],
		['A', ['B', ['C', 'D'], 'E'], 'F'],
		[['A', 'B'], 'C'],
		['A', [['B']], 'C'],
		['A', ['B'], 'C', ['D', 'E']],
		[1984, 'Next'],
		[],
	];
	for (const s of shapes) eq(j(nest(flatten(s))), j(s), `round-trips ${j(s)}`);
	eq(flat(flatten(['A', ['B', 'C'], 'D'])), 'A|  B|  C|D', 'nesting is indent');
	eq(flat(flatten(['A', null, {}, 'A', ' ', ['B']])), 'A|  B', 'blanks, objects and repeats skipped');
	eq(j(flatten('A')), '[]', 'not a list: empty');
	eq(typeof flatten([1984])[0].raw, 'number', 'a number name keeps its type');
	eq(flatten([1984])[0].title, '1984', 'and matches the note "1984"');
}

// writing touches only longform.scenes
{
	const fm: Record<string, unknown> = { title: 'Book', longform: { format: 'scenes', title: 'T', sceneFolder: '/', scenes: ['A', ['B']], ignoredFiles: ['x'], custom: { a: 1 } }, plotlines: ['Mara'] };
	const before = j(fm);
	writeScenes(fm, flatten(['B', 'A']));
	const after = JSON.parse(before) as typeof fm;
	(after.longform as Record<string, unknown>).scenes = ['B', 'A'];
	eq(j(fm), j(after), 'everything else, and the key order, unchanged');
}

// ignoredFiles wildcards
{
	ok(isIgnored('Notes on X', ['Notes*']), '* matches any text');
	ok(isIgnored('ab', ['a?']) && !isIgnored('abc', ['a?']), '? matches one character');
	ok(!isIgnored('xNotes', ['Notes*']), 'the whole name');
	ok(isIgnored('a.b (1)', ['a.b (1)']) && !isIgnored('axb (1)', ['a.b (1)']), 'dots and brackets are literal');
}

// what shows: listed scenes that exist, then unlisted notes by name, minus ignored ones
{
	const scenes = flatten(['A', ['Gone', 'B'], 'C']);
	eq(flat(shownScenes(scenes, ['C', 'B', 'A', 'Z 10', 'Z 9', 'Notes'], ['Notes'])), 'A|  B|C|Z 9|Z 10', 'missing dropped, unlisted after by name, ignored left out');
}

// changes
{
	const files = ['A', 'B', 'C', 'D', 'U'];
	const base = flatten(['A', ['B', 'C'], 'D']);
	const run = (ops: Parameters<typeof applySceneOps>[1], s = base, f = files) => flat(applySceneOps(s, ops, f, []));
	eq(run([{ op: 'rename', from: 'B', to: 'B2' }], base, ['A', 'B2', 'C', 'D']), 'A|  B2|  C|D', 'rename keeps place and indent');
	eq(run([{ op: 'remove', item: 'C' }]), 'A|  B|D', 'remove');
	eq(run([{ op: 'move', item: 'D', index: 0 }]), 'D|A|  B|  C', 'move keeps its own indent');
	eq(run([{ op: 'move', item: 'D', index: 2, indent: 1 }]), 'A|  B|  D|  C', 'move with an indent joins a group');
	eq(run([{ op: 'move', item: 'U', index: 1 }]), 'A|U|  B|  C|D', 'an unlisted scene gets listed, with the indent of the scene before it');
	eq(run([{ op: 'move', item: 'U', index: 2 }]), 'A|  B|  U|  C|D', 'so one put inside a group joins it');
	eq(run([{ op: 'move', item: 'U', index: 99 }]), 'A|  B|  C|D|U', 'an unlisted scene put last is listed once');
	eq(run([{ op: 'move', item: 'N', index: 99 }], base, ['A', 'B', 'C', 'D', 'N', 'U']), 'A|  B|  C|D|U|N', 'as is a new one put after another unlisted one');
	eq(run([{ op: 'move', item: 'A', index: 3 }]), '  B|  C|D|A', 'moving within the listed ones leaves unlisted ones unlisted');
	eq(run([{ op: 'move', item: 'A', index: 4 }]), '  B|  C|D|U|A', 'moving past an unlisted one lists it');
	eq(run([{ op: 'move', item: 'A', index: 99 }]), '  B|  C|D|U|A', 'an index past the end is the end');
	eq(run([{ op: 'move', item: 'A', index: 1 }], base, ['A', 'B', 'C']), '  B|A|  C', 'missing scenes are dropped on write');
	eq(run([{ op: 'rename', from: 'B', to: 'C' }], base, ['A', 'C', 'D']), 'A|  C|D', 'a rename onto a listed name leaves one entry');
	eq(run([{ op: 'move', item: 'D', index: 0 }, { op: 'move', item: 'D', index: 3 }]), 'A|  B|  C|D', 'batched moves apply in order');
	ok(sameScenes(base, flatten(['A', ['B', 'C'], 'D'])) && !sameScenes(base, flatten(['A', 'B', 'C', 'D'])), 'sameScenes compares indents');
	// a reorder written back keeps the untouched nesting exactly
	eq(j(nest(applySceneOps(flatten(['A', ['B', 'C'], 'D', ['E']]), [{ op: 'move', item: 'A', index: 5 }], ['A', 'B', 'C', 'D', 'E'], []))), j([['B', 'C'], 'D', ['E'], 'A']), 'nested lists preserved');
	eq(j(nest(applySceneOps(flatten(['A', 'B', 'C']), [{ op: 'move', item: 'Notes on tides', index: 1 }], ['A', 'B', 'C', 'Notes on tides'], ['Notes*']))), j(['A', 'B', 'C']), 'moving a note the project ignores moves nothing (not the last scene, either)');
}

// groups
{
	const g = sceneGroups(flatten(['A', ['B', 'C', ['X']], 'D', ['E'], 'F']));
	eq(j(g), j([
		{ head: null, depth: 0, scenes: ['A'] },
		{ head: 'A', depth: 1, scenes: ['B', 'C'] },
		{ head: 'C', depth: 2, scenes: ['X'] },
		{ head: null, depth: 0, scenes: ['D'] },
		{ head: 'D', depth: 1, scenes: ['E'] },
		{ head: null, depth: 0, scenes: ['F'] },
	]), 'groups by indent and the scene above');
	eq(j(sceneGroups(flatten(['A', 'B']))), j([{ head: null, depth: 0, scenes: ['A', 'B'] }]), 'flat: one group');
	eq(j(sceneGroups(flatten([['A'], 'B'])).map((x) => x.head)), j([null, null]), 'indented under nothing: no head');
	eq(j(sceneGroups([])), '[]', 'no scenes, no groups');
}

// convert to binder
{
	const shown = flatten(['A', ['B', ['C']], 'D', ['E'], 'F']);
	eq(j(conversionPlan(shown, false).contents), j(['A', 'B', 'C', 'D', 'E', 'F']), 'without folders: the order, flat');
	const p = conversionPlan(shown, true);
	eq(j(p.contents), j(['A', 'A/', 'A/B', 'A/C', 'D', 'D/', 'D/E', 'F']), 'with folders: each group in a folder named after its scene');
	eq(j(p.moves), j([{ scene: 'B', folder: 'A' }, { scene: 'C', folder: 'A' }, { scene: 'E', folder: 'D' }]), 'the moves');
	const q = conversionPlan(flatten([['A', 'B'], 'C', ['C 2']]), true, (n) => n === 'C');
	eq(j(q.contents), j(['Group 1/', 'Group 1/A', 'Group 1/B', 'C', 'C 3/', 'C 3/C 2']), 'indented under nothing: Group n; taken names and moved scene names avoided');
}

done('longform');
