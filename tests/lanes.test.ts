import { announceText, beside, changeText, flatRuns, insertAt, laneAt, laneList, laneOf, lanePitch, readArrangement, readLines, readSize, resolveDrop, type Stop } from '../src/view/lanes-data';
import { done, eq, ok } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// options as saved
{
	eq(readArrangement('label'), 'label', 'by label');
	eq(readArrangement(undefined), 'grid', 'a grid unless it says by label');
	eq(readArrangement('threads'), 'grid', 'nonsense is the grid');
	eq(readLines('down'), 'down', 'lines down');
	eq(readLines(undefined), 'across', 'across unless it says down');
	eq(readLines(7), 'across', 'nonsense is across');
	eq(readSize('large', 'medium'), 'large', 'a card size');
	eq(readSize(null, 'small'), 'small', 'none chosen: what the pane suits');
	eq(readSize('huge', 'medium'), 'medium', 'an unknown size');
}

// the lines
{
	const presets = ['Mara', 'The keeper', 'Tomas'];
	eq(j(laneList(presets, [], true)), j(['', 'Mara', 'The keeper', 'Tomas']), 'no label first, then the labels in settings, in their order');
	eq(j(laneList(presets, ['Tomas', ''], false)), j(['', 'Tomas']), 'unused labels hidden: only those a card has (and no label, always)');
	eq(j(laneList(presets, ['tomas', 'Mara'], false)), j(['', 'Mara', 'Tomas']), 'in settings’ order and spelling, whatever order and case the cards have them in');
	eq(j(laneList(presets, ['Ghost', '#aa0000', 'Mara', 'Ghost'], true)), j(['', 'Mara', 'The keeper', 'Tomas', 'Ghost', '#aa0000']), 'labels not in settings come after, as they first come, once each');
	eq(j(laneList([], [], true)), j(['']), 'no labels at all: the one line');
	eq(j(laneList(['', ' ', 'A'], [], true)), j(['', 'A']), 'a blank label in settings is no line');
	const lanes = laneList(presets, ['Ghost'], true);
	eq(laneOf('Tomas', lanes), 3, 'a label’s line');
	eq(laneOf('tomas ', lanes), 3, 'any case');
	eq(laneOf('', lanes), 0, 'no label: the first');
	eq(laneOf('Ghost', lanes), 4, 'a label of the cards’ own');
	eq(laneOf('Gone', lanes), 0, 'a label with no line (hidden) is on the first');
}

// how far apart the lines are
{
	eq(lanePitch(132, 700, 3), 144, 'room for all: a card apart and a little');
	eq(lanePitch(132, 700, 6), Math.round((700 - 132) / 5), 'six lines share the pane');
	eq(lanePitch(132, 700, 12), 74, 'many lines: never closer than a little over half a card');
	eq(lanePitch(132, 0, 4), 74, 'no room known yet');
	eq(lanePitch(104, 500, 1), 116, 'one line');
	ok(lanePitch(210, 1200, 9) >= 113, 'lines down: by a card’s width');
}

// everything under a folder, as runs
{
	type N = { n: string; kids?: N[] };
	const isFolder = (x: N): x is N => !!x.kids;
	const kids = (f: N) => f.kids ?? [];
	const names = (top: N) => flatRuns(top, kids, isFolder).map((r) => [r.folder.n, r.items.map((i) => i.n), r.end?.n ?? null, r.divider]);
	const book: N = { n: 'Book', kids: [{ n: 'Prologue' }, { n: 'One', kids: [{ n: 'a' }, { n: 'b' }] }, { n: 'Two', kids: [] }, { n: 'Epilogue' }] };
	eq(j(names(book)), j([['Book', ['Prologue'], 'One', false], ['One', ['a', 'b'], null, true], ['Two', [], null, true], ['Book', ['Epilogue'], null, true]]), 'a folder’s notes up to its next subfolder; an empty folder is still somewhere to drop');
	const ends: N = { n: 'Book', kids: [{ n: 'x' }, { n: 'One', kids: [{ n: 'a' }] }] };
	eq(j(names(ends)), j([['Book', ['x'], 'One', false], ['One', ['a'], null, true], ['Book', [], null, true]]), 'ending on a subfolder: an empty run for the end of the folder shown');
	const deep: N = { n: 'Book', kids: [{ n: 'One', kids: [{ n: 'a' }, { n: 'Sub', kids: [{ n: 'b' }] }, { n: 'c' }] }] };
	eq(j(names(deep)), j([['Book', [], 'One', false], ['One', ['a'], 'Sub', true], ['Sub', ['b'], null, true], ['One', ['c'], null, true], ['Book', [], null, true]]), 'folders in folders, and back out');
	eq(j(names({ n: 'Book', kids: [] })), j([['Book', [], null, false]]), 'an empty folder is one empty run');
	eq(j(names({ n: 'Book', kids: [{ n: 'x' }, { n: 'y' }] })), j([['Book', ['x', 'y'], null, false]]), 'no subfolders: one run, no names');
}

// where a drop goes
{
	eq(insertAt([10, 30, 50], 5), 0, 'before the first');
	eq(insertAt([10, 30, 50], 31), 2, 'past a card’s middle: before the next');
	eq(insertAt([10, 30, 50], 99), 3, 'after them all');
	eq(insertAt([50, 30, 10], 31, true), 1, 'right to left');
	eq(insertAt([], 5), 0, 'nothing there');
	const one: Stop[] = ['a', 'b', 'c', 'd'].map((id) => ({ run: 0, id }));
	const drop = (stops: Stop[], at: number, ...moving: string[]) => j(resolveDrop(stops, at, new Set(moving)));
	eq(drop(one, 0, 'c'), j({ run: 0, before: 'a', stay: false }), 'to the start');
	eq(drop(one, 2, 'c'), j({ run: 0, before: 'd', stay: true }), 'just before itself: where it is');
	eq(drop(one, 3, 'c'), j({ run: 0, before: 'd', stay: true }), 'just after itself: where it is');
	eq(drop(one, 4, 'c'), j({ run: 0, before: null, stay: false }), 'to the end');
	eq(drop(one, 4, 'd'), j({ run: 0, before: null, stay: true }), 'the last, to the end: where it is');
	eq(drop(one, 1, 'a', 'c'), j({ run: 0, before: 'b', stay: false }), 'two that stood apart are brought together');
	eq(drop(one, 2, 'b', 'c'), j({ run: 0, before: 'd', stay: true }), 'two that stand together, dropped where they are');
	eq(drop(one, 0, 'a', 'b', 'c', 'd'), j({ run: 0, before: null, stay: true }), 'everything: nowhere to go');
	// several in hand, let go where the one that's held is: none of them moves
	eq(j(resolveDrop(one, 3, new Set(['a', 'c']), 'c')), j({ run: 0, before: null, stay: true }), 'two apart, dropped where the held one is: they stay apart');
	eq(j(resolveDrop(one, 1, new Set(['a', 'c']), 'c')), j({ run: 0, before: 'b', stay: false }), 'dropped somewhere else, they come together there');
	eq(j(resolveDrop(one, 3, new Set(['c']), 'c')), j({ run: 0, before: 'd', stay: true }), 'one card: as without');
	// with folders' names (id null) between runs
	const flat: Stop[] = [{ run: 0, id: 'p' }, { run: 1, id: null }, { run: 1, id: 'a' }, { run: 1, id: 'b' }, { run: 2, id: null }, { run: 3, id: null }, { run: 3, id: 'e' }];
	eq(drop(flat, 1, 'a'), j({ run: 0, before: null, stay: false }), 'before a folder’s name: the end of what comes before it');
	eq(drop(flat, 2, 'p'), j({ run: 1, before: 'a', stay: false }), 'after a folder’s name: that folder’s start');
	eq(drop(flat, 4, 'p'), j({ run: 1, before: null, stay: false }), 'before the next folder’s name: the first folder’s end');
	eq(drop(flat, 5, 'p'), j({ run: 2, before: null, stay: false }), 'between two names: into the empty folder');
	eq(drop(flat, 7, 'a'), j({ run: 3, before: null, stay: false }), 'after everything: the end of the last run');
	eq(drop(flat, 3, 'a'), j({ run: 1, before: 'b', stay: true }), 'in its own run, where it is');
	eq(drop(flat, 1, 'p'), j({ run: 0, before: null, stay: true }), 'the only card of its run, at that run’s end: where it is');
	eq(drop([{ run: 0, id: null }], 0, 'x'), j({ run: 0, before: null, stay: false }), 'nothing but a name');
}

// the line under a point
{
	const bands: [number, number][] = [[0, 50], [50, 100], [100, 150]];
	eq(laneAt(bands, 20), 0, 'in a band');
	eq(laneAt(bands, 120), 2, 'in the last');
	eq(laneAt(bands, -40), 0, 'above them all: the nearest');
	eq(laneAt(bands, 999), 2, 'below them all');
	eq(laneAt([[150, 100], [100, 50]], 60), 1, 'whichever way round a band is given');
	eq(laneAt([], 5), 0, 'no lines');
}

// arrows across the lines
{
	const cards = [{ lane: 1, slot: 1 }, { lane: 2, slot: 2 }, { lane: 0, slot: 3 }, { lane: 2, slot: 4 }, { lane: 4, slot: 5 }];
	eq(beside(cards, 0, 1), 1, 'to the nearest card on the next line');
	eq(beside(cards, 2, 1), 0, 'the next line that has a card');
	eq(beside(cards, 3, 1), 4, 'past lines with no cards');
	eq(beside(cards, 3, -1), 0, 'back: the nearest line before');
	eq(beside(cards, 4, -1), 3, 'the nearest in place on that line');
	eq(beside(cards, 2, -1), -1, 'nothing before the first line');
	eq(beside(cards, 4, 1), -1, 'nothing after the last');
	eq(beside(cards, 9, 1), -1, 'no such card');
}

// what a change is called
{
	eq(changeText(['Low tide'], 'Tomas', false), 'Label “Low tide” as Tomas', 'a label');
	eq(changeText(['Low tide'], '', false), 'Remove the label of “Low tide”', 'taken away');
	eq(changeText(['Low tide'], 'Tomas', true), 'Move “Low tide” and label it Tomas', 'both');
	eq(changeText(['a', 'b'], 'Tomas', true), 'Move 2 items and label them Tomas', 'several');
	eq(changeText(['a', 'b'], '', true), 'Move 2 items and remove their labels', 'several, to no label');
	eq(changeText(['a'], null, true), 'Move “a”', 'a move alone');
	eq(announceText(['Low tide'], 'Tomas'), 'Low tide: label Tomas', 'said aloud');
	eq(announceText(['a', 'b'], ''), '2 items: no label', 'several, none');
}

done('lanes');
