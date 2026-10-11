// Undo and redo of notes and folders made by hand (New note, New folder, Duplicate). Never lose writing: a note made by
// hand is taken away by an undo only if it is still exactly as it was made (nothing typed in, nothing set from outside); it
// goes to the trash, and redo makes it again from what was kept, byte for byte.
import { B, VIEW, contents, file, j, newNote, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo create: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const P1 = L + 'Part One/';
const ARR = P1 + 'Arrival.md', NEW = P1 + 'Untitled.md';
const sleep = (p, ms) => p.sleep(ms);

const reset = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
const scene = (p, folder = P1.slice(0, -1), index = 1, title = 'Untitled') => p.ev(`${B}.newSceneByHand(${file(folder)}, ${index}, ${j(title)}).then(f => f.path, e => 'refused: ' + e.message)`);
const back = (p, redo = false, at = 'The Lighthouse') => p.ev(`${B}.undo(${file(at)}, ${redo}).then(x => x, e => 'refused: ' + e.message)`);
const labels = async (p) => j(await p.ev(`${B}.undos.map(u => u.label)`));
const there = (p, path) => p.ev(`!!${file(path)}`);
const settle = async (p) => { await sleep(p, 500); await p.ev(`${B}.flush().then(() => 1)`); await sleep(p, 300); };
const bytes = (p, path) => p.ev(`app.vault.adapter.readBinary(${j(path)}).then(b => [...new Uint8Array(b)].join(','))`);
const setSyn = (p, path, text) => p.ev(`${VIEW}.setProps(${file(path)}, { synopsis: ${j(text)} }).then(() => 1)`);

test('a note made by hand is undone, redone and undone again: the list the same each time, the note back in its place', async (p, h, t) => {
	await openView(p); await reset(p);
	const list = await contents(p);
	t.eq(await scene(p), NEW, 'made');
	await settle(p);
	const after = await contents(p);
	t.ok(after.length === list.length + 1, 'it is in the list');
	t.eq(await labels(p), j(['New note “Untitled”']), 'one change, named for what it did');
	t.eq(await back(p), 'New note “Untitled”', 'undo says what it undid');
	await settle(p);
	t.ok(!(await there(p, NEW)), 'the note is gone (in the trash)');
	t.eq(j(await contents(p)), j(list), 'and the list is as it was');
	t.eq(await back(p, true), 'New note “Untitled”', 'redo');
	await settle(p);
	t.eq(await read(p, NEW), '', 'made again, empty');
	t.eq(j(await contents(p)), j(after), 'in the same place');
	await back(p); await settle(p);
	t.ok(!(await there(p, NEW)) && j(await contents(p)) === j(list), 'undo again: as it began');
});

test('words typed in the new note since: the undo is refused, the note stays as it is, and asked again it is given up', async (p, h, t) => {
	await openView(p); await reset(p);
	await scene(p);
	await writeRaw(p, NEW, 'Written since it was made.\n');
	await sleep(p, 400);
	t.eq(await back(p), 'refused: “Untitled” has been written in since it was made, so it stays.', 'it says why');
	t.eq(await read(p, NEW), 'Written since it was made.\n', 'the note is untouched');
	t.eq(await back(p), null, 'asked again it is given up');
	t.eq(await read(p, NEW), 'Written since it was made.\n', 'and still there');
});

test('typing in the new note’s tab that has not been saved yet is written first: the note is kept, with the words', async (p, h, t) => {
	await openView(p); await reset(p);
	await scene(p);
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(NEW)}).then(() => 1)`);
	await sleep(p, 600);
	await p.ev(`(() => { app.workspace.activeEditor?.editor?.focus(); return 1; })()`);
	await p.type('PENDING-WORDS');
	const said = await back(p);
	t.ok(String(said).startsWith('refused: '), 'refused: ' + said);
	t.ok((await read(p, NEW)).includes('PENDING-WORDS'), 'what was typed is on the disk, in the note');
	await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`);
});

test('a synopsis set on the new note, then both undone and both redone: the synopsis is back on the note that is made again', async (p, h, t) => {
	await openView(p); await reset(p);
	await scene(p);
	await setSyn(p, NEW, 'Set from the properties.');
	const made = await read(p, NEW);
	t.eq(await back(p), 'Edit synopsis of “Untitled”', 'the synopsis first');
	t.eq(await back(p), 'New note “Untitled”', 'then the note');
	await settle(p);
	t.ok(!(await there(p, NEW)), 'gone');
	t.eq(await back(p, true), 'New note “Untitled”', 'redo the note');
	t.eq(await back(p, true), 'Edit synopsis of “Untitled”', 'then the synopsis');
	await settle(p);
	t.eq(await read(p, NEW), made, 'the note is as it was, byte for byte');
});

test('the name typed after New note is part of the same change: one undo takes the note away, one redo brings it back with its name', async (p, h, t) => {
	await openView(p); await reset(p);
	await scene(p);
	await p.ev(`${B}.rename(${file(NEW)}, 'Landing').then(() => 1)`);
	await settle(p);
	t.eq(await labels(p), j(['New note “Landing”']), 'one change');
	t.eq(await back(p), 'New note “Landing”', 'undone');
	await settle(p);
	t.ok(!(await there(p, NEW)) && !(await there(p, P1 + 'Landing.md')), 'no note under either name');
	await back(p, true); await settle(p);
	t.ok(await there(p, P1 + 'Landing.md') && !(await there(p, NEW)), 'redone: under the name it was given');
});

test('a note changed from outside between the make and the undo is kept', async (p, h, t) => {
	await openView(p); await reset(p);
	await scene(p);
	await writeRaw(p, NEW, '---\nstatus: draft\n---\n');
	await sleep(p, 400);
	t.ok(String(await back(p)).startsWith('refused: '), 'refused');
	t.eq(await read(p, NEW), '---\nstatus: draft\n---\n', 'the note is as the other program left it');
});

test('redo when another note has the name now: refused, the other note untouched', async (p, h, t) => {
	await openView(p); await reset(p);
	await scene(p);
	await back(p); await settle(p);
	await p.ev(`app.vault.create(${j(NEW)}, 'Another note.\\n').then(() => 1)`);
	await settle(p);
	t.eq(await back(p, true), 'refused: “Untitled” can’t be made again: there is another “Untitled” here now.', 'it says why');
	t.eq(await read(p, NEW), 'Another note.\n', 'the other note is untouched');
});

test('two undos asked at once each take one: a note and a folder made by hand', async (p, h, t) => {
	await openView(p); await reset(p);
	const list = await contents(p);
	await scene(p);
	await p.ev(`${B}.newFolderByHand(${file(P1.slice(0, -1))}, 0, 'Fresh').then(() => 1)`);
	await settle(p);
	const both = await p.ev(`Promise.all([${B}.undo(${file('The Lighthouse')}), ${B}.undo(${file('The Lighthouse')})])`);
	t.eq(j(both), j(['New folder “Fresh”', 'New note “Untitled”']), 'both ran, newest first');
	await settle(p);
	t.eq(j(await contents(p)), j(list), 'the list is as it began');
	t.ok(!(await there(p, P1 + 'Fresh')) && !(await there(p, NEW)), 'nothing left');
});

test('a folder made by hand is undone while it is empty, redone, and refused once something is in it', async (p, h, t) => {
	await openView(p); await reset(p);
	const list = await contents(p);
	await p.ev(`${B}.newFolderByHand(${file(L.slice(0, -1))}, 0, 'Interlude').then(() => 1)`);
	await settle(p);
	t.ok(await there(p, L + 'Interlude'), 'made');
	t.eq(await back(p), 'New folder “Interlude”', 'undone');
	await settle(p);
	t.ok(!(await there(p, L + 'Interlude')) && j(await contents(p)) === j(list), 'gone, the list as it was');
	t.eq(await back(p, true), 'New folder “Interlude”', 'redone');
	await settle(p);
	t.ok(await there(p, L + 'Interlude'), 'made again');
	await writeRaw(p, L + 'Interlude/Kept.md', 'Written inside.\n');
	await sleep(p, 500);
	t.eq(await back(p), 'refused: “Interlude” has been written in since it was made, so it stays.', 'refused with something in it');
	t.eq(await read(p, L + 'Interlude/Kept.md'), 'Written inside.\n', 'the note inside is untouched');
});

test('a copy of a note is undone only while it is still the copy, and redone byte for byte; Windows line endings and a byte-order mark kept', async (p, h, t) => {
	await openView(p); await reset(p);
	const crlf = '---\r\nstatus: draft\r\n---\r\nFirst.\r\nSecond.\r\n', bom = '\uFEFF---\nstatus: draft\n---\nMark first.\n';
	await writeRaw(p, ARR, crlf); await writeRaw(p, P1 + 'The keeper.md', bom);
	await sleep(p, 500);
	await p.ev(`${B}.duplicate(${file(ARR)}).then(() => 1)`);
	await p.ev(`${B}.duplicate(${file(P1 + 'The keeper.md')}).then(() => 1)`);
	await settle(p);
	const copies = await p.ev(`${B}.undos.map(u => u.label)`);
	t.eq(j(copies), j(['Duplicate “Arrival”', 'Duplicate “The keeper”']), 'remembered, named for what it did');
	const copyOf = async () => (await p.ev(`app.vault.getFiles().map(f => f.path).filter(x => /Arrival \\d|The keeper \\d/.test(x))`)).sort();
	const found = await copyOf();
	t.eq(found.length, 2, 'two copies: ' + j(found));
	const sums = [await bytes(p, found[0]), await bytes(p, found[1])];
	await back(p); await back(p); await settle(p);
	t.eq((await copyOf()).length, 0, 'both copies gone');
	t.eq(await read(p, ARR), crlf, 'the originals are untouched');
	await back(p, true); await back(p, true); await settle(p);
	const again = await copyOf();
	t.eq(j([await bytes(p, again[0]), await bytes(p, again[1])]), j(sums), 'made again, byte for byte');
});

test('a copy edited since is kept: the undo is refused', async (p, h, t) => {
	await openView(p); await reset(p);
	await p.ev(`${B}.duplicate(${file(ARR)}).then(() => 1)`);
	await settle(p);
	const copy = (await p.ev(`app.vault.getFiles().map(f => f.path).filter(x => /Arrival \\d/.test(x))`))[0];
	await writeRaw(p, copy, (await read(p, copy)) + 'Added to the copy.\n');
	await sleep(p, 400);
	t.ok(String(await back(p)).startsWith('refused: '), 'refused');
	t.ok((await read(p, copy)).endsWith('Added to the copy.\n'), 'the copy is untouched');
});

test('New note from the toolbar, named on its card: Undo takes the note away', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One'); await reset(p);
	await newNote(p, 'Fresh start');
	await sleep(p, 800);
	t.ok(await there(p, P1 + 'Fresh start.md'), 'made and named');
	t.eq(await labels(p), j(['New note “Fresh start”']), 'one change');
	await back(p); await settle(p);
	t.ok(!(await there(p, P1 + 'Fresh start.md')) && !(await there(p, NEW)), 'undone: no note');
});

test('a note made in a Longform project is undone and redone with its place in the list', async (p, h, t) => {
	const LF = 'Longform demo', INDEX = 'Longform demo/Index.md';
	await openView(p, LF); await reset(p);
	const before = await read(p, INDEX);
	const made = await p.ev(`${B}.newSceneByHand(${file(LF)}, 1, 'Interlude').then(f => f.path, e => 'refused: ' + e.message)`);
	t.eq(made, LF + '/Interlude.md', 'made');
	await settle(p);
	const after = await read(p, INDEX);
	t.ok(after !== before && after.includes('Interlude'), 'it is in the project’s scenes');
	t.eq(await back(p, false, LF), 'New note “Interlude”', 'undone');
	await settle(p);
	t.ok(!(await there(p, made)), 'the note is gone');
	t.eq(await read(p, INDEX), before, 'and the project’s note is as it was, byte for byte');
	await back(p, true, LF); await settle(p);
	t.ok(await there(p, made), 'redone');
	t.eq(await read(p, INDEX), after, 'in the same place');
});
