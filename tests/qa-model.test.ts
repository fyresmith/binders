// QA findings in the pure binder model (src/model.ts), kept as regressions.
import { cleanPath, diskPath, readIndex, relPath } from '../src/model';
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

done('qa-model');
