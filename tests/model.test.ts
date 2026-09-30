import { checkFormat, cleanPath, isBinderNote, moveTo, orderChildren, readIndex, removeFrom, renameIn, UnsupportedBinder } from '../src/model';
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
	eq(j(idx.contents), j(['Prologue', 'Part One/', 'Part One/Arrival']), 'duplicates, non-strings and paths leaving the binder dropped');
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

done('model');
