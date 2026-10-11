// Undo and redo of properties set by hand (a synopsis, a status, a label, a target, notes, export settings), and the
// toolbar's Undo and Redo buttons. Never lose writing: every test reads bytes off the disk. A property is taken back only
// if it is still what the change left it; otherwise nothing is written and the writer is told which.
import { B, NOTE, VIEW, card, clickMenu, closeMenus, file, j, menuItems, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo props: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const ARR = L + 'Part One/Arrival.md', STORM = L + 'Part One/Storm warning.md', KEEPER = L + 'Part One/The keeper.md';
const SYN = 'Mara arrives on the island with the supply boat.';

const reset = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
const setSyn = (p, path, text) => p.ev(`${VIEW}.setProps(${file(path)}, { synopsis: ${j(text)} }).then(() => 1)`);
const setMany = (p, paths, patch) => p.ev(`${VIEW}.setPropsMany([${paths.map((x) => `{ file: ${file(x)}, patch: ${j(patch)} }`).join(',')}]).then(() => 1)`);
/** Undo (or redo) in The Lighthouse; what it says, or why it refused. */
const back = (p, redo = false) => p.ev(`${B}.undo(${file('The Lighthouse')}, ${redo}).then(x => x, e => 'refused: ' + e.message)`);
const labels = async (p) => j(await p.ev(`${B}.undos.map(u => u.label)`));
const sleep = (p, ms) => p.sleep(ms);
const wait = async (p) => { await sleep(p, 400); };

const BTN = (which) => `.workspace-leaf.mod-active .binders-toolbar .binders-${which}-button`;
const btn = (p, which) => p.ev(`(() => { const b = document.querySelector(${j(BTN(which))}); return b ? { off: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), label: b.getAttribute('aria-label') } : null; })()`);
const press = async (p, which) => { const at = await p.at(BTN(which)); await p.click(at.x, at.y); await sleep(p, 600); };

test('a synopsis written by hand is undone, redone and undone again, the note the same byte for byte each time', async (p, h, t) => {
	await openView(p); await reset(p);
	const orig = await read(p, ARR);
	await setSyn(p, ARR, 'A new synopsis, written by hand.');
	const after = await read(p, ARR);
	t.ok(after !== orig && after.includes('A new synopsis, written by hand.'), 'the synopsis is written');
	t.eq(await labels(p), j(['Edit synopsis of “Arrival”']), 'one change, named for what it did');
	t.eq(await back(p), 'Edit synopsis of “Arrival”', 'undo says what it undid');
	t.eq(await read(p, ARR), orig, 'the note is as it was, byte for byte');
	t.eq(await back(p, true), 'Edit synopsis of “Arrival”', 'redo');
	t.eq(await read(p, ARR), after, 'the note is as the change left it, byte for byte');
	await back(p);
	t.eq(await read(p, ARR), orig, 'undo again: as it began');
	t.eq(await back(p), null, 'and nothing is left to undo');
});

test('a status given to three notes at once is one change; undone and redone as one', async (p, h, t) => {
	await openView(p); await reset(p);
	const paths = [ARR, STORM, KEEPER], before = {};
	for (const x of paths) before[x] = await read(p, x);
	await setMany(p, paths, { status: 'final' });
	const after = {};
	for (const x of paths) after[x] = await read(p, x);
	t.ok(paths.every((x) => after[x] !== before[x] && /status: final/.test(after[x])), 'all three have the status');
	t.eq(await labels(p), j(['Set status of 3 items']), 'one entry for all three');
	await back(p);
	for (const x of paths) t.eq(await read(p, x), before[x], `“${x}” is as it was, byte for byte`);
	await back(p, true);
	for (const x of paths) t.eq(await read(p, x), after[x], `“${x}” has the status again`);
});

test('a property taken away comes back where it stood, the note byte for byte', async (p, h, t) => {
	await openView(p); await reset(p);
	const orig = await read(p, ARR);
	t.ok(/^---\nstatus: revised\nsynopsis:/.test(orig), 'the status stands first in this note');
	await setMany(p, [ARR], { status: '' });
	const gone = await read(p, ARR);
	t.ok(!gone.includes('status:'), 'the status is gone');
	t.eq(await labels(p), j(['Clear status of “Arrival”']), 'named for what it did');
	await back(p);
	t.eq(await read(p, ARR), orig, 'undo: the status is first again, nothing else moved');
	await back(p, true);
	t.eq(await read(p, ARR), gone, 'redo: gone again');
	await back(p);
	t.eq(await read(p, ARR), orig, 'and back');
});

test('a note changed from outside between the change and the undo is not touched: the writer is told, and asking again gives it up', async (p, h, t) => {
	await openView(p); await reset(p);
	await setSyn(p, ARR, 'Mine.');
	const outside = (await read(p, ARR)).replace('Mine.', 'Written by another program.');
	await writeRaw(p, ARR, outside);
	await wait(p);
	t.eq(await back(p), 'refused: The synopsis of “Arrival” has been changed since, so it stays as it is.', 'it says which property, and why');
	t.eq(await read(p, ARR), outside, 'the note is exactly as the other program left it');
	t.eq(await p.ev(`${B}.undos.length`), 1, 'the change stays, to be undone once the note is as it was left');
	t.eq(await back(p), null, 'asked again with nothing changed, it is given up');
	t.eq(await read(p, ARR), outside, 'and the note is still the other program’s');
});

test('two changes to one note are undone newest first, and the note is as it began', async (p, h, t) => {
	await openView(p); await reset(p);
	const orig = await read(p, ARR);
	await setSyn(p, ARR, 'First.');
	await setMany(p, [ARR], { status: 'final' });
	t.eq(await back(p), 'Set status of “Arrival”', 'the newest first');
	t.eq(await back(p), 'Edit synopsis of “Arrival”', 'then the one before');
	t.eq(await read(p, ARR), orig, 'both are as they began, byte for byte');
});

test('typing in the note’s tab that has not been saved yet is written first, and is there after the undo, with the synopsis as it was', async (p, h, t) => {
	await openView(p); await reset(p);
	await setSyn(p, ARR, 'Typed over.');
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(ARR)}).then(() => 1)`);
	await sleep(p, 600);
	await p.ev(`(() => { const ed = app.workspace.activeEditor?.editor; ed.focus(); ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 1; })()`);
	await p.type(' PENDING-WORDS');
	const said = await back(p);
	t.eq(said, 'Edit synopsis of “Arrival”', 'undone');
	const disk = await read(p, ARR);
	t.ok(disk.includes('PENDING-WORDS'), 'what was typed is on the disk');
	t.ok(disk.includes(SYN) && !disk.includes('Typed over.'), 'the synopsis is as it was');
	const editor = await p.ev(`app.workspace.activeEditor?.editor?.getValue()`);
	t.ok(editor.includes('PENDING-WORDS') && editor.includes(SYN), 'and the tab shows both');
	await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`);
});

test('the note renamed in between is still the one: its synopsis goes back under its new name', async (p, h, t) => {
	await openView(p); await reset(p);
	const orig = await read(p, ARR);
	await setSyn(p, ARR, 'Before the rename.');
	await p.ev(`app.fileManager.renameFile(${file(ARR)}, ${j(L + 'Part One/Landing.md')}).then(() => 1)`);
	await wait(p);
	t.eq(await back(p), 'Edit synopsis of “Arrival”', 'undone');
	t.eq(await read(p, L + 'Part One/Landing.md'), orig, 'the renamed note is as it was');
});

test('a note deleted in between is not made again, and the change is not offered', async (p, h, t) => {
	await openView(p); await reset(p);
	await setSyn(p, ARR, 'Soon gone.');
	await p.ev(`app.fileManager.trashFile(${file(ARR)}).then(() => 1)`);
	await wait(p);
	t.eq(await p.ev(`${B}.undoable(${file('The Lighthouse')})`), null, 'nothing to undo is offered');
	t.eq(await back(p), null, 'and nothing is done');
	t.eq(await p.ev(`!!${file(ARR)}`), false, 'the note is not made again');
});

test('two undos asked at once each take one change, in order', async (p, h, t) => {
	await openView(p); await reset(p);
	const orig = await read(p, ARR);
	await setSyn(p, ARR, 'One.');
	await setSyn(p, ARR, 'Two.');
	const both = await p.ev(`Promise.all([${B}.undo(${file('The Lighthouse')}), ${B}.undo(${file('The Lighthouse')})])`);
	t.eq(j(both), j(['Edit synopsis of “Arrival”', 'Edit synopsis of “Arrival”']), 'both ran, one after the other');
	t.eq(await read(p, ARR), orig, 'the note is as it began');
	t.eq(await back(p), null, 'and a third finds nothing');
});

test('a note with Windows line endings: the synopsis undone, the text byte for byte, the properties as they were (Obsidian writes a changed property block with its own line breaks)', async (p, h, t) => {
	await openView(p); await reset(p);
	const orig = '---\r\nstatus: draft\r\nsynopsis: Old.\r\n---\r\nFirst line.\r\nSecond line.\r\n';
	await writeRaw(p, ARR, orig);
	await wait(p);
	await setSyn(p, ARR, 'New.');
	const after = await read(p, ARR);
	t.ok(after.includes('New.') && after.includes('First line.'), 'written, the text kept');
	await back(p);
	const undone = await read(p, ARR), body = (x) => x.slice(x.indexOf('---', 3) + 3);
	t.eq(undone.replace(/\r\n/g, '\n'), orig.replace(/\r\n/g, '\n'), 'undone: the same properties and text');
	t.eq(body(undone), body(orig), 'the text after the properties is the same bytes, Windows line endings and all');
	await back(p, true);
	t.eq(await read(p, ARR), after, 'redone: as the change left it');
});

test('a note that begins with a byte-order mark: the synopsis undone, the note byte for byte', async (p, h, t) => {
	await openView(p); await reset(p);
	const orig = '﻿---\nstatus: draft\nsynopsis: Old.\n---\nFirst line.\n';
	await writeRaw(p, ARR, orig);
	await wait(p);
	await setSyn(p, ARR, 'New.');
	const after = await read(p, ARR);
	t.ok(after.startsWith('﻿') && after.includes('New.') && after.includes('First line.'), 'written, the mark and the text kept');
	await back(p);
	t.eq(await read(p, ARR), orig, 'undone: the same bytes, the mark first');
	await back(p, true);
	t.eq(await read(p, ARR), after, 'redone');
});

test('a folder’s synopsis lives in its folder note: undone, the property is gone and the note stays with nothing of the writer’s lost', async (p, h, t) => {
	await openView(p); await reset(p);
	const folder = L + 'Part One';
	await p.ev(`(async () => { const n = await ${B}.ensureFolderNote(${file(folder)}); await app.vault.modify(n, '---\\nstatus: draft\\n---\\nFolder note words.\\n'); })().then(() => 1)`);
	await wait(p);
	const note = folder + '/Part One.md', orig = await read(p, note);
	await p.ev(`${VIEW}.setProps(${file(note)}, { synopsis: 'About the part.' }).then(() => 1)`);
	t.eq(await labels(p), j(['Edit synopsis of “Part One”']), 'named for the folder');
	await back(p);
	t.eq(await read(p, note), orig, 'the folder note is as it was');
});

test('a binder in a newer format refuses to undo, and nothing is written', async (p, h, t) => {
	await openView(p); await reset(p);
	await setSyn(p, ARR, 'Before the newer format.');
	const done = await read(p, ARR), binder = await read(p, NOTE);
	await writeRaw(p, NOTE, binder.replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem(${file('The Lighthouse')})`, 6000);
	const said = await back(p);
	t.ok(typeof said === 'string' && said.startsWith('refused:'), 'it refuses: ' + said);
	t.eq(await read(p, ARR), done, 'the note is untouched');
	const set = await p.ev(`${VIEW}.setProps(${file(ARR)}, { synopsis: 'Not allowed.' }).then(() => 'wrote', e => 'refused')`);
	t.eq(set, 'refused', 'and nothing can be set by hand either');
	t.eq(await read(p, ARR), done, 'still untouched');
});

test('“Include in export” from a card’s menu is one change that Undo takes back', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One'); await reset(p);
	const orig = await read(p, ARR);
	await until(p, `!!document.querySelector(${j(card(ARR))})`);
	const at = await p.at(card(ARR));
	await p.right(at.x, at.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok((await menuItems(p)).includes('Include in export'), 'the menu has it');
	await clickMenu(p, 'Include in export');
	await sleep(p, 500);
	t.ok(/export: false/.test(await read(p, ARR)), 'the note is left out of export');
	t.eq(await labels(p), j(['Leave “Arrival” out of export']), 'named for what it did');
	await closeMenus(p);
	t.eq(await back(p), 'Leave “Arrival” out of export', 'undone');
	t.eq(await read(p, ARR), orig, 'the note is as it was, byte for byte');
});

test('a property of a note that is gone is refused by the write itself, and nothing is remembered', async (p, h, t) => {
	await openView(p); await reset(p);
	const said = await p.ev(`(async () => {
		const f = ${file(KEEPER)};
		await app.vault.delete(f);
		return ${B}.setByHand('x', [{ note: f, patch: { synopsis: 'x' } }]).then(() => 'wrote', (e) => e.message);
	})()`);
	t.ok(typeof said === 'string' && !/isn’t in a binder/.test(said) && said !== 'wrote', 'refused, as the write was before: ' + said);
	t.eq(await labels(p), '[]', 'and nothing is remembered');
});

test('a binder keeps its last hundred changes', async (p, h, t) => {
	await openView(p); await reset(p);
	for (let i = 0; i < 103; i++) await p.ev(`${B}.setByHand('Change ' + ${i}, [{ note: ${file(ARR)}, patch: { synopsis: 'S' + ${i} } }]).then(() => 1)`);
	t.eq(await p.ev(`${B}.undos.length`), 100, 'a hundred kept');
	t.eq((JSON.parse(await labels(p)))[0], 'Change 3', 'the oldest three went');
});

test('typing in the manuscript that has not been saved yet is written first, and is kept by the undo of a synopsis', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One'); await reset(p);
	await setSyn(p, ARR, 'Manuscript test.');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await sleep(p, 1800);
	const words = (await read(p, ARR)).split('---\n').pop().split('\n')[0].slice(0, 24);
	for (let i = 0; i < 2; i++) { // (the first click makes the section an editor)
		const s = await p.ev(`(() => { const e = [...document.querySelectorAll('.binders-manuscript-scene')].find(s => s.textContent.includes(${j(words)})); e.scrollIntoView({ block: 'center' }); const ps = [...e.querySelectorAll('p, .cm-line')].find(x => x.textContent.includes(${j(words)})); const r = ps.getBoundingClientRect(); return { x: r.x + 3, y: r.y + r.height / 2 }; })()`);
		await p.click(s.x, s.y);
		await sleep(p, 500);
	}
	await p.key('End');
	await p.type(' MANUSCRIPT-WORDS');
	t.eq(await back(p), 'Edit synopsis of “Arrival”', 'undone with the typing still unsaved');
	const disk = await read(p, ARR);
	t.ok(disk.includes('MANUSCRIPT-WORDS'), 'what was typed is on the disk');
	t.ok(disk.includes(SYN) && !disk.includes('Manuscript test.'), 'the synopsis is as it was');
	await sleep(p, 1500);
	const later = await read(p, ARR);
	t.ok(later.includes('MANUSCRIPT-WORDS') && later.includes(SYN), 'and still both once the editor has had its say');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
});
