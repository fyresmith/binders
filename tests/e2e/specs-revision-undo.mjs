// Undo and redo of revision tasks (src/history/revision.ts): ticking a box is one step, taken back and made again
// byte for byte, refused (and said) if the line is no longer what the step left; the same in a note with a byte-order
// mark and Windows line ends; Ctrl+Z with the keyboard in the pane. Golden rules 2 and 3 (the fourth exception).
import { PL, file, j, openView, read, until, withTidy } from './view-helpers.mjs';
import { BN, L, REV, TASKS, seed } from './specs-revision.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'revision undo: ' + name, fn: withTidy(fn) });
const R = `${PL}.revision`;
const PANE = '.workspace-leaf-content[data-type="binders-revision"] .binders-revision';
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map((n) => n.textContent).join('|')`);
const wipe = (p) => p.ev(`document.querySelectorAll('.notice').forEach((n) => n.remove())`);
const undo = async (p, redo = false) => { await p.ev(`${PL}.undoMove(${file(L)}, ${redo}).then(() => 1)`); await p.sleep(500); };
const undoable = (p, redo = false) => p.ev(`${B_()}.undoable(${file(L)}, ${redo})`);
const B_ = () => `${PL}.binders`;
/** Ticks the nth open task of the listing through the store, as the pane and the walk do. */
const tick = (p, text, done = true) => p.ev(`(async () => { const l = ${R}.list(${BN}); const t = l.groups.flatMap((g) => g.tasks).find((x) => x.text.includes(${j(text)})); return await ${R}.tick(${BN}, t, ${done}); })()`);
const ready = (p) => until(p, `${R}.list(${BN}).groups.length > 0`);

test('a tick is one step: undone and made again byte for byte, task by task', async (p, h, t) => {
	await seed(p);
	await ready(p);
	const a = await read(p, REV);
	await tick(p, 'say why nobody meets her');
	const b = await read(p, REV);
	await tick(p, 'two scenes at once');
	const c = await read(p, REV);
	t.eq(await undoable(p), 'Mark revision task done', 'the history has it, by that name');
	await undo(p);
	t.eq(await read(p, REV), b, 'undo: the second box back, byte for byte');
	await undo(p);
	t.eq(await read(p, REV), a, 'undo again: the first, and the note is as it was');
	t.eq(await undoable(p, true), 'Mark revision task done', 'redo has it');
	await undo(p, true);
	t.eq(await read(p, REV), b, 'redo: the first box ticked again');
	await undo(p, true);
	t.eq(await read(p, REV), c, 'redo: the second');
	// an unticked box is a step too
	await tick(p, 'say why nobody meets her', false);
	t.eq(await undoable(p), 'Mark revision task not done', 'unticking is named for what it did');
	await undo(p);
	t.eq(await read(p, REV), c, 'and taken back');
});

test('a tick whose line has changed since is not undone, and that is said; the step stays', async (p, h, t) => {
	await seed(p);
	await ready(p);
	await tick(p, 'say why nobody meets her');
	const ticked = await read(p, REV);
	// the line is reworded from outside (another device)
	const reworded = ticked.replace('say why nobody meets her', 'say why nobody comes');
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(reworded)}).then(() => 1)`);
	await p.sleep(500);
	await wipe(p);
	await undo(p);
	t.eq(await read(p, REV), reworded, 'nothing was written');
	t.ok(/has changed since/.test(await notices(p)), 'it says why: ' + await notices(p));
	t.eq(await undoable(p), 'Mark revision task done', 'the step stays, to try again once the line is right');
	// put right: it goes through
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(ticked)}).then(() => 1)`);
	await p.sleep(500);
	await undo(p);
	t.eq(await read(p, REV), TASKS, 'with the line as it was, the undo goes through, byte for byte');
});

test('in a note with a byte-order mark and Windows line ends: one character to tick, and back byte for byte', async (p, h, t) => {
	const text = '﻿' + TASKS.replace(/\n/g, '\r\n');
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(text)}).then(() => 1)`);
	await seed(p, text);
	await ready(p);
	const raw = () => p.ev(`app.vault.adapter.read(${j(REV)})`);
	const was = await raw();
	await tick(p, 'say why nobody meets her');
	const now = await raw();
	t.eq(now.length, was.length, 'as long as it was');
	t.eq([...was].filter((c, i) => c !== now[i]).length, 1, 'one character differs, the mark and the line ends included');
	await undo(p);
	t.eq(await raw(), was, 'undo: byte for byte');
	await undo(p, true);
	t.eq(await raw(), now, 'redo: byte for byte');
});

test('Ctrl+Z with the keyboard in the pane takes back the tick, and Ctrl+Shift+Z makes it again', async (p, h, t) => {
	await seed(p);
	await ready(p);
	await openView(p, L);
	await p.ev(`app.commands.executeCommandById('binders:show-revision')`);
	await until(p, `!!document.querySelector(${j(PANE)})`);
	await p.sleep(500);
	const a = await read(p, REV);
	const box = await p.ev(`(() => { const r = [...document.querySelectorAll(${j(PANE + ' .binders-revision-task')})].find((x) => x.textContent.includes('say why nobody meets her')), b = r.querySelector('input').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
	await p.click(box.x, box.y);
	await p.sleep(500);
	const b = await read(p, REV);
	t.ok(b !== a, 'ticked in the pane');
	await p.ev(`document.querySelector(${j(PANE + ' .binders-revision-task')}).focus()`);
	await p.key('z', 'ctrl');
	await p.sleep(700);
	t.eq(await read(p, REV), a, 'Ctrl+Z in the pane: taken back');
	await p.key('z', 'ctrl', 'shift');
	await p.sleep(700);
	t.eq(await read(p, REV), b, 'Ctrl+Shift+Z: made again');
});
