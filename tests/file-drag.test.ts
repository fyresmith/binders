import { EDGE, countTitle, dropEffect, edgeScroll, within } from '../src/view/file-drag-data';
import { done, eq, ok } from './harness';

// inside the view or out of it
{
	const r = { left: 100, top: 50, right: 500, bottom: 400 };
	ok(within(r, 300, 200), 'a point in the box');
	ok(within(r, 100, 50) && within(r, 500, 400), 'its edges count as in');
	ok(!within(r, 99.5, 200), 'left of it');
	ok(!within(r, 500.5, 200), 'right of it');
	ok(!within(r, 300, 49), 'above it');
	ok(!within(r, 300, 401), 'below it');
}

// a list scrolls under a drag held at its edge
{
	eq(edgeScroll(300, 100, 600, 0), 0, 'nothing in the middle of the list');
	eq(edgeScroll(100 + EDGE, 100, 600, 0), 0, 'nor right at the start of the edge');
	ok(edgeScroll(101, 100, 600, 0) < 0, 'up near the top');
	ok(edgeScroll(599, 100, 600, 0) > 0, 'down near the bottom');
	eq(edgeScroll(100 + EDGE - 1, 100, 600, 0), -1, 'gently at first: a pixel a frame');
	ok(edgeScroll(110, 100, 600, 0) < edgeScroll(125, 100, 600, 0), 'faster the nearer the edge');
	eq(edgeScroll(100, 100, 600, 0), -12, 'at the edge itself, twelve');
	eq(edgeScroll(40, 100, 600, 0), -12, 'and no faster past it');
	eq(edgeScroll(600, 100, 600, 1000), 24, 'twice as fast after a second held there');
	eq(edgeScroll(600, 100, 600, 3000), 96, 'eight times after three');
	eq(edgeScroll(600, 100, 600, 60000), 96, 'and never more');
	eq(edgeScroll(600, 100, 600, -5), 12, 'a clock that ran backwards changes nothing');
	eq(edgeScroll(110, 100, 150, 0), 0, 'a list too short to have a middle doesn’t scroll');
}

// what a drop would do, as the browser has it
{
	eq(dropEffect(true, false, 'move'), 'move', 'taken: what it said');
	eq(dropEffect(true, false, 'link'), 'link', 'a link');
	eq(dropEffect(true, false, 'none'), 'none', 'taken and refused: none (the file explorer says why)');
	eq(dropEffect(false, false, 'move'), 'none', 'not taken: none, whatever the data says');
	eq(dropEffect(false, true, 'link'), 'link', 'text being edited takes it without saying so');
	eq(dropEffect(false, true, ''), 'none', 'unless nothing was said at all');
}

// Obsidian's words for several things dragged at once
{
	eq(countTitle(3, 0), '3 files', 'notes');
	eq(countTitle(0, 2), '2 folders', 'folders');
	eq(countTitle(2, 1), '2 files and 1 folders', 'both, in its own wording');
}

done('file drag');
