// Undo and redo of "Add revision task" (src/history/revision.ts, `takeOut` in src/revision/store.ts): the one place
// Binders removes anything from a revision note, behind the narrow rule (the item is still the note's last and exactly
// as written; a note made for the task goes with it, and `revision` with it). Redo adds it again. Refused, and said,
// otherwise. Bytes asserted throughout.
import { NOTE, PL, file, j, read, until, withTidy } from './view-helpers.mjs';
import { BN, L, REV, TASKS, seed } from './specs-revision.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'revision undo (add): ' + name, fn: withTidy(fn) });
const R = `${PL}.revision`;
const ARR = `${L}/Part One/Arrival.md`;
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map((n) => n.textContent).join('|')`);
const wipe = (p) => p.ev(`document.querySelectorAll('.notice').forEach((n) => n.remove())`);
const undo = async (p, redo = false) => { await p.ev(`${PL}.undoMove(${file(L)}, ${redo}).then(() => 1)`); await p.sleep(700); };
const undoable = (p, redo = false) => p.ev(`${PL}.binders.undoable(${file(L)}, ${redo})`);
const add = (p, text, passage = '') => p.ev(`${R}.add(${BN}, ${file(ARR)}, ${j(text)}, ${j(passage)}).then(() => 1)`).then(() => p.sleep(300));
const exists = (p, path) => p.ev(`app.vault.adapter.exists(${j(path)})`);
const ready = (p) => until(p, `${R}.list(${BN}).groups.length > 0`);

test('the first task: undo takes the task away and leaves the note it made, empty, and `revision` where it is (nothing is deleted); redo adds it again', async (p, h, t) => {
	await add(p, 'Say why nobody meets her', 'The boat left her');
	const made = await read(p, REV), bn = await read(p, NOTE);
	t.eq(made, '- [ ] [[Arrival]]: Say why nobody meets her\n\t> The boat left her\n', 'the note is made with the task');
	t.eq(await undoable(p), 'Add revision task', 'the history has it');
	await undo(p);
	t.ok(await exists(p, REV), 'undo: the note is still there');
	t.eq(await read(p, REV), '', 'with nothing in it');
	t.eq(await read(p, NOTE), bn, 'and the binder note, with its `revision`, is untouched');
	t.eq(await p.ev(`${R}.noteOf(${BN})?.path`), REV, 'still the binder’s revision note');
	t.eq(j(await p.ev(`${PL}.binders.scenes(${file(L)}).map((f) => f.path)`)).includes('Revision'), false, 'and no scene');
	await undo(p, true);
	t.eq(await read(p, REV), made, 'redo: the task is added again, the same');
	await undo(p);
	t.eq(await read(p, REV), '', 'and undone again');
});

test('a task added to a note that exists: undo takes out those lines and nothing else, redo adds them at the end again', async (p, h, t) => {
	await seed(p);
	await ready(p);
	await add(p, 'A second thing', 'a passage');
	const added = await read(p, REV);
	t.eq(added, TASKS + '- [ ] [[Arrival]]: A second thing\n\t> a passage\n', 'the note grew by exactly the task and its passage');
	await undo(p);
	t.eq(await read(p, REV), TASKS, 'undo: the note is as it was, byte for byte');
	t.ok(await exists(p, REV), 'the note stays, as it is the writer’s');
	await undo(p, true);
	t.eq(await read(p, REV), added, 'redo: the lines are added at the end again');
	await undo(p);
	t.eq(await read(p, REV), TASKS, 'and undone once more');
});

test('a note that ends without a line break, or in Windows line ends with a mark: the added lines come out byte for byte', async (p, h, t) => {
	const text = '﻿- [ ] [[Epilogue]]: one\r\n- [ ] [[Prologue]]: two';
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(text)}).then(() => 1)`);
	await seed(p, text);
	await ready(p);
	await add(p, 'three');
	const raw = () => p.ev(`app.vault.adapter.read(${j(REV)})`);
	t.ok((await raw()).startsWith(text) && (await raw()).endsWith('- [ ] [[Arrival]]: three\r\n'), 'added in the note’s own line ends, the last line break supplied and nothing above changed');
	await undo(p);
	t.eq(await raw(), text, 'undo: exactly what was there, with no last line break');
});

test('refused, and said, when the task is no longer the last thing in the note or has been reworded: nothing is written and the step stays', async (p, h, t) => {
	await seed(p);
	await ready(p);
	await add(p, 'A second thing');
	const added = await read(p, REV);
	// something written under it
	const under = added + '- [ ] typed after it\n';
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(under)}).then(() => 1)`);
	await p.sleep(500);
	await wipe(p);
	await undo(p);
	t.eq(await read(p, REV), under, 'written under: nothing removed');
	t.ok(/written under|changed/.test(await notices(p)), 'it says why: ' + await notices(p));
	t.eq(await undoable(p), 'Add revision task', 'the step stays');
	// put right
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(added)}).then(() => 1)`);
	await p.sleep(500);
	await undo(p);
	t.eq(await read(p, REV), TASKS, 'put right, it is taken out');
});

test('a task reworded since is not taken out; put right, it is', async (p, h, t) => {
	await seed(p);
	await ready(p);
	await add(p, 'A second thing', 'its passage');
	const added = await read(p, REV), reworded = added.replace('its passage', 'another passage');
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(reworded)}).then(() => 1)`);
	await p.sleep(500);
	await wipe(p);
	await undo(p);
	t.eq(await read(p, REV), reworded, 'the passage line reworded: nothing removed');
	t.ok(/changed|written under/.test(await notices(p)), 'and it says so: ' + await notices(p));
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(added)}).then(() => 1)`);
	await p.sleep(500);
	await undo(p);
	t.eq(await read(p, REV), TASKS, 'put right, it is taken out: the item and its passage');
});

test('a note made for the first task is not taken away once anything else is in it', async (p, h, t) => {
	await add(p, 'Say why nobody meets her');
	const typed = (await read(p, REV)) + 'A note of my own.\n';
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(typed)}).then(() => 1)`);
	await p.sleep(500);
	await wipe(p);
	await undo(p);
	t.eq(await read(p, REV), typed, 'the writer’s note is still there, whole');
	t.ok(/changed|written under/.test(await notices(p)), 'and it says so: ' + await notices(p));
	t.eq(await p.ev(`${R}.noteOf(${BN})?.path`), REV, 'and is still the binder’s revision note');
});

test('typing in the note’s tab, not yet saved, is on the disk before an add is taken out, and is kept', async (p, h, t) => {
	await seed(p);
	await ready(p);
	await add(p, 'A second thing');
	const added = await read(p, REV);
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(REV)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `app.workspace.activeEditor?.file?.path === ${j(REV)}`);
	// typed above the task, not saved yet
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.replaceRange('TYPED-ABOVE\\n', { line: 0, ch: 0 }); return 1; })()`);
	await undo(p);
	t.eq(await read(p, REV), 'TYPED-ABOVE\n' + TASKS, 'what was typed is kept, and the task is taken out from under it');
	await p.sleep(2600);
	t.eq(await read(p, REV), 'TYPED-ABOVE\n' + TASKS, 'and the tab does not bring it back');
	t.ok(added.length > 0, 'ok');
});
