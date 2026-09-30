// QA findings in the pure binder model (src/model.ts), kept as regressions.
import { applyOps, cleanPath, diskPath, orderChildren, readIndex, relPath } from '../src/model';
import { done, eq } from './harness';

const j = (x: unknown) => JSON.stringify(x);

// a hand-typed entry YAML reads as a number (a note called "1984") keeps its place
{
	const idx = readIndex({ binder: 1, contents: ['Prologue', 1984, 'Epilogue'] });
	eq(j(idx.contents), j(['Prologue', '1984', 'Epilogue']), 'a numeric entry is read as its text');
}

// a note named "notes.md.md" is "notes.md" in the binder, written in full, and reads back as itself
{
	const rel = relPath('Novel', 'Novel/notes.md.md', false);
	eq(rel, 'notes.md', 'relPath strips one .md');
	eq(diskPath(rel ?? ''), 'notes.md.md', 'written with its full name');
	eq(cleanPath(diskPath(rel ?? '')), rel, 'what Binders writes reads back as the same path');
	eq(j(readIndex({ binder: 1, contents: ['notes.md', 'Part/x.md', 'map.png', 'A/'].map(diskPath) }).contents), j(['notes.md', 'Part/x.md', 'map.png', 'A/']), 'a whole list round-trips');
}

// a note renamed into another folder of the binder goes last there, as a note moved in from outside does,
// and the list keeps reading like a table of contents
{
	const list = ['Part One/', 'Part One/Arrival', 'Part One/Keeper', 'Part Two/', 'Part Two/Wreck', 'Part Two/Lights'];
	const next = applyOps(list, [{ op: 'rename', from: 'Part One/Arrival', to: 'Part Two/Arrival' }], []);
	eq(j(orderChildren(next, 'Part Two/', ['Part Two/Wreck', 'Part Two/Lights', 'Part Two/Arrival'])), j(['Part Two/Wreck', 'Part Two/Lights', 'Part Two/Arrival']), 'moved into another folder, it goes last there');
	eq(j(next), j(['Part One/', 'Part One/Keeper', 'Part Two/', 'Part Two/Wreck', 'Part Two/Lights', 'Part Two/Arrival']), 'the list: under its new folder');
	const folders = ['A', 'P/', 'P/Q/', 'P/Q/x', 'P/y', 'R/', 'R/z'];
	eq(j(applyOps(folders, [{ op: 'rename', from: 'P/Q/', to: 'R/Q/' }, { op: 'rename', from: 'P/Q/x', to: 'R/Q/x' }], [])), j(['A', 'P/', 'P/y', 'R/', 'R/z', 'R/Q/', 'R/Q/x']), 'a folder moved to another folder goes last there, with its items');
	eq(j(applyOps(folders, [{ op: 'rename', from: 'P/Q/x', to: 'R/Q/x' }, { op: 'rename', from: 'P/Q/', to: 'R/Q/' }], [])), j(['A', 'P/', 'P/y', 'R/', 'R/z', 'R/Q/', 'R/Q/x']), 'whichever order its events arrive in');
	eq(j(applyOps(folders, [{ op: 'rename', from: 'P/y', to: 'y' }], [])), j(['A', 'P/', 'P/Q/', 'P/Q/x', 'R/', 'R/z', 'y']), 'moved to the top level: last there');
	eq(j(applyOps(folders, [{ op: 'rename', from: 'P/y', to: 'R/y' }, { op: 'move', item: 'R/y', folder: 'R/', index: 0 }], ['A', 'P/', 'P/Q/', 'P/Q/x', 'R/', 'R/y', 'R/z'])), j(['A', 'P/', 'P/Q/', 'P/Q/x', 'R/', 'R/y', 'R/z']), 'a move with an index still goes there');
	eq(j(applyOps(['A'], [{ op: 'rename', from: 'P/y', to: 'R/y' }], [])), j(['A']), 'an unlisted item stays unlisted');
}

done('qa-model');
