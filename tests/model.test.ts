import { applyOps, checkFormat, cleanPath, copyIn, diskPath, isBinderNote, isFolderNote, moveTo, orderChildren, readIndex, relPath, removeFrom, renameIn, stepIndex, UnsupportedBinder } from '../src/model';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// recognising binder notes, and refusing newer formats
{
	ok(isBinderNote({ binder: 1 }), 'binder: 1 is a binder note');
	ok(isBinderNote({ binder: null }), 'a bare binder: property counts');
	ok(!isBinderNote({ title: 'x' }) && !isBinderNote(null) && !isBinderNote([]), 'other notes are not');
	const refused = (v: unknown) => { try { checkFormat({ binder: v }); return ''; } catch (e) { return e instanceof UnsupportedBinder ? e.message : 'other'; } };
	eq(refused(1), '', 'version 1 accepted');
	eq(refused(true), '', 'true accepted as version 1');
	ok(/newer version of Binders \(format 2\)/.test(refused(2)), 'version 2 refused');
	ok(/isn’t one Binders knows/.test(refused('2')) && /isn’t one Binders knows/.test(refused(0)), 'odd versions refused');
}

// reading the table of contents
{
	eq(cleanPath('./Part One//Arrival.md'), 'Part One/Arrival', 'paths tidied, .md dropped');
	eq(cleanPath('Part One\\'), 'Part One/', 'backslashes become slashes; a trailing slash marks a folder');
	const idx = readIndex({ binder: 1, contents: ['Prologue', 'Prologue', 7, '../escape', 'Part One/', ' Part One/Arrival.md '] });
	eq(j(idx.contents), j(['Prologue', '7', 'Part One/', 'Part One/Arrival']), 'duplicates and paths leaving the binder dropped; numbers read as names');
	eq(j(readIndex({ binder: 1, contents: [true, null, { a: 1 }, ['x'], NaN, 'ok'] }).contents), j(['ok']), 'other non-strings dropped');
	eq(j(readIndex({ binder: 1 }).contents), '[]', 'no contents: empty list');
}

// ordering a folder's children
{
	const contents = ['Prologue', 'Part One/', 'Part One/B', 'Part One/A', 'Epilogue'];
	eq(j(orderChildren(contents, '', ['Epilogue', 'Part One/', 'Prologue', 'Appendix'])), j(['Prologue', 'Part One/', 'Epilogue', 'Appendix']), 'listed first, in list order; unlisted after');
	eq(j(orderChildren(contents, 'Part One/', ['Part One/A', 'Part One/B', 'Part One/C'])), j(['Part One/B', 'Part One/A', 'Part One/C']), 'nested folders ordered by the list');
	eq(j(orderChildren([], '', ['Scene 10', 'Scene 2', 'scene 1'])), j(['scene 1', 'Scene 2', 'Scene 10']), 'unlisted items in natural name order');
	eq(j(orderChildren(['X/', 'X'], '', ['X', 'X/'])), j(['X/', 'X']), 'a note and a folder with the same name are told apart');
}

// renames, removals and moves
{
	const c = ['A', 'P/', 'P/x', 'P/y', 'B'];
	eq(j(renameIn(c, 'P/', 'Part/')), j(['A', 'Part/', 'Part/x', 'Part/y', 'B']), 'renaming a folder carries its contents');
	eq(j(renameIn(c, 'A', 'Alpha')), j(['Alpha', 'P/', 'P/x', 'P/y', 'B']), 'renaming a note keeps its place');
	eq(j(removeFrom(c, 'P/')), j(['A', 'B']), 'removing a folder removes its contents');
	const known = ['A', 'P/', 'P/x', 'P/y', 'B'];
	eq(j(moveTo(c, known, 'B', '', 0)), j(['B', 'A', 'P/', 'P/x', 'P/y']), 'move to the top');
	eq(j(moveTo(c, known, 'A', 'P/', 1)), j(['P/', 'P/x', 'P/A', 'P/y', 'B']), 'move into a folder, between its children');
	eq(j(moveTo(c, known, 'P/', '', 2)), j(['A', 'B', 'P/', 'P/x', 'P/y']), 'moving a folder brings its contents');
	eq(j(moveTo(['A'], ['A', 'B', 'C'], 'C', '', 0)), j(['C', 'A', 'B']), 'items the list did not mention get written down in place');
	eq(j(moveTo(c, known, 'P/y', 'P/', 0)), j(['A', 'P/', 'P/y', 'P/x', 'B']), 'reorder within a folder');
}

// folder notes and the binder note are never part of the list
{
	ok(isFolderNote('Part One/Part One') && isFolderNote('A/B/B'), 'folder notes recognised');
	ok(!isFolderNote('Part One/Arrival') && !isFolderNote('Novel') && !isFolderNote('A/A/') && !isFolderNote('A/B/A'), 'others are not');
	ok(!isFolderNote('Part One/Part One.png'), 'only notes (other files keep their extension)');
	const idx = readIndex({ binder: 1, contents: ['Novel', 'Prologue', 'Part One/', 'Part One/Part One', 'Part One/Arrival'] }, 'Novel');
	eq(j(idx.contents), j(['Prologue', 'Part One/', 'Part One/Arrival']), 'binder note and folder notes dropped from the list');
}

// paths relative to the binder
{
	eq(relPath('Books/Novel', 'Books/Novel/Part One/Arrival.md', false), 'Part One/Arrival', 'notes lose .md');
	eq(relPath('Books/Novel', 'Books/Novel/Part One', true), 'Part One/', 'folders gain /');
	eq(relPath('Books/Novel', 'Books/Novel/map.png', false), 'map.png', 'other files keep their extension');
	eq(relPath('Books/Novel', 'Books/Novella/x.md', false), null, 'a folder with a longer name is not inside');
	eq(relPath('Books/Novel', 'Books/Novel', true), null, 'the binder folder itself is not inside');
	eq(relPath('', 'x.md', false), null, 'the vault root is never a binder');
	eq(diskPath('Part One/Arrival'), 'Part One/Arrival', 'written as is');
	eq(diskPath('notes.md'), 'notes.md.md', 'a note named notes.md.md is written in full, as reading drops one .md');
	eq(diskPath('A.md/'), 'A.md/', 'folders as they are');
}

// a folder copied beside itself by something other than Binders (Obsidian's "Make a copy")
{
	const c = ['A', 'P/', 'P/y', 'P/S/', 'P/S/k', 'P/x', 'B'];
	eq(j(copyIn(c, 'P/', 'P 1/')), j(['A', 'P/', 'P/y', 'P/S/', 'P/S/k', 'P/x', 'P 1/', 'P 1/y', 'P 1/S/', 'P 1/S/k', 'P 1/x', 'B']), 'the copy goes right after its original, in its order, folders inside too');
	eq(j(copyIn(copyIn(c, 'P/', 'P 1/'), 'P/', 'P 1/')), j(copyIn(c, 'P/', 'P 1/')), 'followed twice, nothing more happens');
	eq(j(copyIn(['A', 'B'], 'P/', 'P 1/')), j(['A', 'B']), 'an original the list doesn’t mention has no order to give');
	eq(j(copyIn(['P/', 'P/x'], 'P/', 'P/')), j(['P/', 'P/x']), 'a folder isn’t a copy of itself');
	eq(j(copyIn(['P/', 'P/x'], 'P/x', 'P/x 1')), j(['P/', 'P/x']), 'only folders');
	eq(j(copyIn(['P/', 'P/x', 'P 10/', 'P 10/x'], 'P/', 'P 1/')), j(['P/', 'P/x', 'P 1/', 'P 1/x', 'P 10/', 'P 10/x']), 'a folder whose name starts the same is another folder');
	// what the list already says about the copy is kept: only what it lacks is added
	const listed = ['P 1/', 'P 1/x', 'P 1/y', 'A', 'P/', 'P/y', 'P/S/', 'P/S/k', 'P/x', 'B'];
	eq(j(copyIn(listed, 'P/', 'P 1/')), j(['P 1/', 'P 1/x', 'P 1/y', 'P 1/S/', 'P 1/S/k', 'A', 'P/', 'P/y', 'P/S/', 'P/S/k', 'P/x', 'B']), 'a copy already listed stays where it is, its entries in the order they have; one it lacks goes after the entry before it in the original');
	eq(j(copyIn(['P/', 'P/a', 'P/b', 'P/c', 'P 1/', 'P 1/c', 'P 1/own'], 'P/', 'P 1/')), j(['P/', 'P/a', 'P/b', 'P/c', 'P 1/', 'P 1/a', 'P 1/b', 'P 1/c', 'P 1/own']), 'entries before the first it has go first; what only the copy has stays');
	const full = ['P/', 'P/a', 'P/b', 'P 1/', 'P 1/b', 'P 1/a'];
	ok(copyIn(full, 'P/', 'P 1/') === full, 'a copy that lists everything, in another order, is left exactly as it is');
	// through a batch, with the moves and renames around it
	eq(j(applyOps(c, [{ op: 'copy', from: 'P/', to: 'P 1/' }, { op: 'rename', from: 'P 1/', to: 'Q/' }], [])), j(['A', 'P/', 'P/y', 'P/S/', 'P/S/k', 'P/x', 'Q/', 'Q/y', 'Q/S/', 'Q/S/k', 'Q/x', 'B']), 'a copy renamed before the list is written keeps its place and its order');
	eq(j(applyOps(c, [{ op: 'copy', from: 'P/', to: 'P 1/' }, { op: 'append', item: 'P 1/', inner: ['P 1/x', 'P 1/y'] }], [])), j(copyIn(c, 'P/', 'P 1/')), 'and one the store appends as well is listed once');
	eq(new Set(applyOps(c, [{ op: 'copy', from: 'P/', to: 'P 1/' }, { op: 'copy', from: 'P/', to: 'P 1/' }], [])).size, 12, 'no entry twice');
	ok(c.every((x) => copyIn(c, 'P/', 'P 1/').includes(x)), 'no entry of the list is lost');
}

// batches of changes
{
	const c = ['A', 'P/', 'P/x', 'B'];
	const known = ['A', 'P/', 'P/x', 'B'];
	eq(j(applyOps(c, [{ op: 'rename', from: 'A', to: 'Alpha' }, { op: 'remove', item: 'B' }], known)), j(['Alpha', 'P/', 'P/x']), 'applied in order');
	eq(j(applyOps(c, [{ op: 'append', item: 'C' }, { op: 'append', item: 'P/y' }], known)), j(['A', 'P/', 'P/x', 'P/y', 'B', 'C']), 'appended at the end of their folder');
	eq(j(applyOps(c, [{ op: 'append', item: 'A' }], known)), j(c), 'appending a listed item changes nothing');
	// changes close together, written in one go: a move is worked out against the binder as it was when it was made
	{
		const was = ['A', 'P/', 'P/x', 'B'];
		eq(j(applyOps(c, [{ op: 'move', item: 'B', folder: '', index: 0, known: was }, { op: 'rename', from: 'A', to: 'A2' }], ['A2', 'P/', 'P/x', 'B'])), j(['B', 'A2', 'P/', 'P/x']), 'a note renamed right after another was moved keeps its place');
		// (moving a note into a folder is its rename there, then its place among what the folder holds)
		eq(j(applyOps(c, [{ op: 'rename', from: 'A', to: 'P/A' }, { op: 'move', item: 'P/A', folder: 'P/', index: 0, known: ['P/', 'P/x', 'P/A', 'B'] }, { op: 'rename', from: 'P/', to: 'Q/' }], ['Q/', 'Q/x', 'Q/A', 'B'])), j(['Q/', 'Q/A', 'Q/x', 'B']), 'a folder renamed right after a move keeps its place and its items’ order');
		eq(j(applyOps(c, [{ op: 'move', item: 'P/x', folder: '', index: 2, known: was }, { op: 'remove', item: 'P/' }], ['A', 'x', 'B'])), j(['A', 'x', 'B']), 'a moved note keeps the place it was put when a folder before it leaves');
		eq(j(applyOps(['A', 'A', 'B', 'A'], [], ['A', 'B'])), j(['A', 'B']), 'no entry is ever listed twice');
	}
	// a new item put somewhere and renamed before the list is written (a new folder, named in place): `known` has its new name
	eq(j(applyOps(c, [{ op: 'move', item: 'New/', folder: '', index: Infinity }, { op: 'rename', from: 'New/', to: 'Part/' }], [...known, 'Part/'])), j([...c, 'Part/']), 'an item moved, then renamed, is listed once');
	eq(j(applyOps(c, [{ op: 'move', item: 'New', folder: '', index: 0 }, { op: 'rename', from: 'New', to: 'First' }], [...known, 'First'])), j(['First', ...c]), 'at the place it was put');
	eq(j(applyOps(c, [{ op: 'append', item: 'Q/a' }, { op: 'append', item: 'Q/' }, { op: 'append', item: 'Q/b' }], known)), j([...c, 'Q/']), 'a folder moved in comes in alone, whatever order the events arrive in');
	eq(j(applyOps(c, [{ op: 'append', item: 'Q/', inner: ['Q/b', 'Q/S/', 'Q/S/z', 'Q/a', 'elsewhere'] }, { op: 'append', item: 'Q/a' }, { op: 'append', item: 'Q/b' }], known)), j([...c, 'Q/', 'Q/b', 'Q/S/', 'Q/S/z', 'Q/a']), 'a folder from another binder brings its order');
	eq(j(applyOps(c, [{ op: 'rename', from: 'P/', to: 'R/' }, { op: 'rename', from: 'P/x', to: 'R/x' }], known)), j(['A', 'R/', 'R/x', 'B']), 'a folder rename and then its children’s renames');
	eq(j(applyOps(c, [{ op: 'rename', from: 'P/x', to: 'R/x' }, { op: 'rename', from: 'P/', to: 'R/' }], known)), j(['A', 'R/', 'R/x', 'B']), 'or the other way round');
	eq(j(applyOps(c, [{ op: 'move', item: 'B', folder: '', index: 0 }], known)), j(['B', 'A', 'P/', 'P/x']), 'moves');
	eq(j(applyOps(c, [], known)), j(c), 'no changes');
}

// one step up or down
{
	const s = ['a', 'b', 'c'];
	eq(stepIndex(s, 'b', -1), 0, 'up');
	eq(stepIndex(s, 'b', 1), 2, 'down');
	eq(stepIndex(s, 'a', -1), null, 'the first can’t go up');
	eq(stepIndex(s, 'c', 1), null, 'the last can’t go down');
	eq(stepIndex(s, 'z', 1), null, 'not there');
}

done('model');
