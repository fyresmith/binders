// Undo and redo of deletes (the confirmation stays). A deleted note or folder is kept byte for byte in memory for the
// session, so Undo brings it back even when Obsidian is set to delete for good. Never lose writing: every test reads bytes
// off the disk.
import { B, VIEW, answer, card, clickMenu, contents, file, j, menuItems, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo delete: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const P1 = L + 'Part One/';
const ARR = P1 + 'Arrival.md', KEEPER = P1 + 'The keeper.md', STORM = P1 + 'Storm warning.md';
const sleep = (p, ms) => p.sleep(ms);

const reset = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
const remove = (p, ...paths) => p.ev(`${B}.remove([${paths.map((x) => file(x)).join(',')}]).then(r => r, e => 'refused: ' + e.message)`);
const back = (p, redo = false, at = 'The Lighthouse') => p.ev(`${B}.undo(${file(at)}, ${redo}).then(x => x, e => 'refused: ' + e.message)`);
const labels = async (p) => j(await p.ev(`${B}.undos.map(u => u.label)`));
const there = (p, path) => p.ev(`!!${file(path)}`);
const settle = async (p) => { await sleep(p, 500); await p.ev(`${B}.flush().then(() => 1)`); await sleep(p, 300); };
const bytes = (p, path) => p.ev(`app.vault.adapter.readBinary(${j(path)}).then(b => [...new Uint8Array(b)].join(','))`);
const trash = (p, kind) => p.ev(`(() => { app.vault.setConfig('trashOption', ${j(kind)}); return 1; })()`);
const setSyn = (p, path, text) => p.ev(`${VIEW}.setProps(${file(path)}, { synopsis: ${j(text)} }).then(() => 1)`);

test('a note deleted by hand is undone, redone and undone again: the note, its place and the list the same each time', async (p, h, t) => {
	await openView(p); await reset(p);
	const text = await read(p, ARR), list = await contents(p);
	const res = await remove(p, ARR);
	t.ok(res && res.recorded === true, 'deleted, and remembered: ' + j(res));
	await settle(p);
	t.ok(!(await there(p, ARR)), 'the note is gone');
	t.eq(await labels(p), j(['Delete “Arrival”']), 'one change, named for what it did');
	t.eq(await back(p), 'Delete “Arrival”', 'undo says what it undid');
	await settle(p);
	t.eq(await read(p, ARR), text, 'the note is back, byte for byte');
	t.eq(j(await contents(p)), j(list), 'and in its place in the list');
	t.eq(await back(p, true), 'Delete “Arrival”', 'redo');
	await settle(p);
	t.ok(!(await there(p, ARR)), 'deleted again');
	await back(p); await settle(p);
	t.eq(await read(p, ARR), text, 'undo again: back, byte for byte');
	t.eq(j(await contents(p)), j(list), 'in place');
});

test('with Obsidian set to delete for good, to its own trash, and to the system’s: Undo still brings the note back byte for byte', async (p, h, t) => {
	await openView(p); await reset(p);
	const crlf = '---\r\nstatus: draft\r\n---\r\nFirst.\r\nSecond.\r\n', bom = '﻿---\nstatus: draft\n---\nMark first.\n';
	for (const kind of ['none', 'local', 'system']) {
		await trash(p, kind);
		await writeRaw(p, ARR, crlf); await writeRaw(p, KEEPER, bom);
		await sleep(p, 400);
		await remove(p, ARR); await remove(p, KEEPER);
		await settle(p);
		t.ok(!(await there(p, ARR)) && !(await there(p, KEEPER)), `[${kind}] both gone`);
		await back(p); await back(p); await settle(p);
		t.eq(await read(p, ARR), crlf, `[${kind}] the Windows note is back, byte for byte`);
		t.eq(await read(p, KEEPER), bom, `[${kind}] and the one with the mark`);
		await reset(p);
	}
});

test('a folder with notes, a picture and an empty folder in it is undone whole: every byte, the empty folder, and the order of its notes', async (p, h, t) => {
	await openView(p); await reset(p);
	await p.ev(`(async () => { await app.vault.createFolder(${j(P1 + 'Empty')}); await app.vault.createBinary(${j(P1 + 'map.png')}, new Uint8Array([137, 80, 78, 71, 0, 255, 13, 10, 26, 10]).buffer); })().then(() => 1)`);
	await settle(p);
	const names = ['Arrival.md', 'The keeper.md', 'Storm warning.md', 'map.png'], before = {};
	for (const n of names) before[n] = await bytes(p, P1 + n);
	// (the picture and the empty folder aren't notes: they are in no list until something writes it)
	const mine = async () => (await contents(p)).filter((x) => !/map\.png|Empty/.test(x));
	const list = await mine();
	await remove(p, L + 'Part One');
	await settle(p);
	t.ok(!(await there(p, L + 'Part One')), 'the folder is gone');
	t.eq(await back(p), 'Delete “Part One”', 'undone');
	await settle(p);
	for (const n of names) t.eq(await bytes(p, P1 + n), before[n], `“${n}” is back, byte for byte`);
	t.ok(await there(p, P1 + 'Empty'), 'the empty folder is back');
	t.eq(j(await mine()), j(list), 'the list is as it was, the notes in their order');
	await back(p, true); await settle(p);
	t.ok(!(await there(p, L + 'Part One')), 'redo deletes it again');
	await back(p); await settle(p);
	for (const n of names) t.eq(await bytes(p, P1 + n), before[n], `“${n}” back again, byte for byte`);
	await p.ev(`(async () => { for (const x of [${j(P1 + 'map.png')}, ${j(P1 + 'Empty')}]) { const f = app.vault.getAbstractFileByPath(x); if (f) await app.vault.delete(f, true); } })().then(() => 1)`);
});

test('several items deleted at once are one change', async (p, h, t) => {
	await openView(p); await reset(p);
	const a = await read(p, ARR), k = await read(p, KEEPER), list = await contents(p);
	await remove(p, ARR, KEEPER, L + 'Part Two');
	await settle(p);
	t.eq(await labels(p), j(['Delete 3 items']), 'one entry');
	await back(p); await settle(p);
	t.eq(await read(p, ARR), a, 'the first is back'); t.eq(await read(p, KEEPER), k, 'the second'); t.ok(await there(p, L + 'Part Two/The wreck.md'), 'and the folder with its notes');
	t.eq(j(await contents(p)), j(list), 'the list is as it was');
});

test('a note made under the old name since: the undo is refused, nothing is overwritten, and asked again it is given up', async (p, h, t) => {
	await openView(p); await reset(p);
	await remove(p, ARR); await settle(p);
	await p.ev(`app.vault.create(${j(ARR)}, 'Another Arrival.\\n').then(() => 1)`);
	await settle(p);
	t.eq(await back(p), 'refused: “Arrival” can’t be brought back: there is another “Arrival” here now. Rename it first.', 'it says why');
	t.eq(await read(p, ARR), 'Another Arrival.\n', 'the other note is untouched');
	t.eq(await back(p), null, 'asked again it is given up');
});

test('the folder it was in deleted since: the undo is refused and nothing is made', async (p, h, t) => {
	await openView(p); await reset(p);
	await remove(p, ARR); await settle(p);
	await p.ev(`app.vault.delete(${file(L + 'Part One')}, true).then(() => 1)`);
	await settle(p);
	t.eq(await back(p), 'refused: “Arrival” can’t be brought back: the folder it was in is gone.', 'it says why');
	t.ok(!(await there(p, L + 'Part One')), 'nothing is made');
});

test('two undos asked at once each bring one back', async (p, h, t) => {
	await openView(p); await reset(p);
	const a = await read(p, ARR), k = await read(p, KEEPER);
	await remove(p, ARR); await remove(p, KEEPER); await settle(p);
	const both = await p.ev(`Promise.all([${B}.undo(${file('The Lighthouse')}), ${B}.undo(${file('The Lighthouse')})])`);
	t.eq(j(both), j(['Delete “The keeper”', 'Delete “Arrival”']), 'both ran, newest first');
	await settle(p);
	t.eq(await read(p, ARR), a, 'the first is back'); t.eq(await read(p, KEEPER), k, 'and the second');
	t.eq(await back(p), null, 'a third finds nothing');
});

test('a synopsis set before the delete: Undo brings the note back, and the next Undo takes the synopsis back, on the note that was brought back', async (p, h, t) => {
	await openView(p); await reset(p);
	const orig = await read(p, ARR);
	await setSyn(p, ARR, 'Set by hand.');
	await remove(p, ARR); await settle(p);
	t.eq(await back(p), 'Delete “Arrival”', 'the delete first');
	t.eq(await back(p), 'Edit synopsis of “Arrival”', 'then the synopsis');
	await settle(p);
	t.eq(await read(p, ARR), orig, 'the note is as it was before either, byte for byte');
});

test('typing in the note’s tab that has not been saved yet goes into the kept copy: the note comes back with the words', async (p, h, t) => {
	await openView(p); await reset(p);
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(ARR)}).then(() => 1)`);
	await sleep(p, 600);
	await p.ev(`(() => { const ed = app.workspace.activeEditor?.editor; ed.focus(); ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 1; })()`);
	await p.type(' PENDING-WORDS');
	await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`);
	await remove(p, ARR); await settle(p);
	await back(p); await settle(p);
	t.ok((await read(p, ARR)).includes('PENDING-WORDS'), 'what was typed is in the note that came back');
});

test('a delete that is too big to keep (over 32 MB) goes ahead, is not remembered, and says so', async (p, h, t) => {
	await openView(p); await reset(p);
	await p.ev(`app.vault.createBinary(${j(P1 + 'huge.bin')}, new ArrayBuffer(33 * 1024 * 1024)).then(() => 1)`);
	await settle(p);
	const res = await remove(p, P1 + 'huge.bin');
	t.ok(res && res.recorded === false, 'not remembered: ' + j(res));
	t.ok(!(await there(p, P1 + 'huge.bin')), 'but deleted');
	t.eq(await labels(p), '[]', 'nothing to undo');
	await p.ev(`(async () => { const f = ${file(P1 + 'huge.bin')}; if (f) await app.vault.delete(f, true); })().then(() => 1)`);
});

test('a note deleted in a Longform project comes back with its place in the project’s list', async (p, h, t) => {
	const LF = 'Longform demo', INDEX = LF + '/Index.md';
	await openView(p, LF); await reset(p);
	const before = await read(p, INDEX), text = await read(p, LF + '/Island.md');
	await remove(p, LF + '/Island.md'); await settle(p);
	t.ok(!(await there(p, LF + '/Island.md')), 'deleted');
	t.eq(await back(p, false, LF), 'Delete “Island”', 'undone');
	await settle(p);
	t.eq(await read(p, LF + '/Island.md'), text, 'back, byte for byte');
	t.eq(await read(p, INDEX), before, 'and the project’s note is as it was');
});

test('Delete on a card asks first, then says so with an Undo button that brings the note back', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One'); await reset(p);
	const text = await read(p, ARR), sel = card(ARR);
	await until(p, `!!document.querySelector(${j(sel)})`);
	const at = await p.at(sel);
	await p.right(at.x, at.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok((await menuItems(p)).includes('Delete'), 'the menu has Delete');
	await clickMenu(p, 'Delete');
	t.ok(await answer(p, 'Delete'), 'it asks first');
	await sleep(p, 800);
	t.ok(!(await there(p, ARR)), 'deleted');
	const shown = await until(p, `[...document.querySelectorAll('.notice')].some(n => n.textContent.includes('Deleted “Arrival”') && [...n.querySelectorAll('button')].some(b => b.textContent === 'Undo'))`, 3000);
	t.ok(shown, 'a notice says so, with an Undo button');
	const b = await p.at('.notice button');
	await p.click(b.x, b.y);
	await sleep(p, 900);
	t.eq(await read(p, ARR), text, 'the button brings the note back, byte for byte');
});
