// Undo and redo of a merge. Never lose writing: the first note goes back to what it was only if it is still exactly the
// merged text (after what is typed and not saved is written); the merged-away notes are made again and read back before
// anything is taken out of the first; a note whose links were rewritten is put back only if it still has what the merge
// wrote. If the first note has changed, nothing is taken out of it: the writer is offered the merged-away notes alongside.
import { B, VIEW, card, clickMenu, closeMenus, contents, file, j, menuItems, openView, read, until, answer, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo merge: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const P1 = L + 'Part One/';
const A = P1 + 'Arrival.md', K = P1 + 'The keeper.md', SW = P1 + 'Storm warning.md', PRO = L + 'Prologue.md';
const sleep = (p, ms) => p.sleep(ms);

const reset = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
const labels = async (p) => j(await p.ev(`${B}.undos.map(u => u.label)`));
const there = (p, path) => p.ev(`!!${file(path)}`);
const settle = async (p) => { await sleep(p, 600); await p.ev(`${B}.flush().then(() => 1)`); await sleep(p, 300); };
const pressModal = async (p, label) => {
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === ${j(label)}).click(); return 1; })()`);
	await sleep(p, 400);
};

/** Merges cards from the menu, confirming. */
async function merge(p, paths, folder = P1.slice(0, -1)) {
	await openView(p, folder);
	let i = 0, a;
	for (const path of paths) { a = await p.at(card(path)); if (!a) throw new Error('no card ' + path); await p.click(a.x, a.t + 12, i++ ? { modifiers: 2 } : {}); await sleep(p, 80); }
	await p.right(a.x, a.y);
	await sleep(p, 150);
	const title = (await menuItems(p)).find((x) => /^Merge/.test(x));
	if (!title) { await closeMenus(p); throw new Error('no merge in the menu'); }
	await clickMenu(p, title);
	await pressModal(p, 'Merge');
	await settle(p);
}
/** Undo (or redo), answering the dialog it may open with `button` (null: none expected). */
async function back(p, redo = false, button = null, at = 'The Lighthouse') {
	await p.ev(`(() => { window.__undone = undefined; ${B}.undo(${file(at)}, ${redo}).then(x => { window.__undone = x; }, e => { window.__undone = 'refused: ' + e.message; }); return 1; })()`);
	if (button) { if (!(await answer(p, button))) throw new Error('no dialog with ' + button); }
	await until(p, `window.__undone !== undefined`, 8000);
	const r = await p.ev(`window.__undone`);
	await settle(p);
	return r;
}

test('a merge is undone, redone and undone again: both notes, the list and the merged text the same each time, byte for byte', async (p, h, t) => {
	await openView(p); await reset(p);
	const a = await read(p, A), sw = await read(p, SW), list = await contents(p);
	await merge(p, [A, SW]);
	const merged = await read(p, A), listAfter = await contents(p);
	t.ok(!(await there(p, SW)), 'merged: the second went to the trash');
	t.eq(await labels(p), j(['Merge 2 notes into “Arrival”']), 'one change, named for what it did');
	t.eq(await back(p), 'Merge 2 notes into “Arrival”', 'undo says what it undid');
	t.eq(await read(p, A), a, 'the first note is as it was, byte for byte');
	t.eq(await read(p, SW), sw, 'the merged-away note is back, byte for byte');
	t.eq(j(await contents(p)), j(list), 'and in its place in the list');
	t.eq(await back(p, true), 'Merge 2 notes into “Arrival”', 'redo');
	t.eq(await read(p, A), merged, 'merged again, byte for byte');
	t.ok(!(await there(p, SW)), 'the second is gone again');
	t.eq(j(await contents(p)), j(listAfter), 'the list as the merge left it');
	await back(p);
	t.eq(await read(p, A), a, 'undo again: as it began');
	t.eq(await read(p, SW), sw, 'both notes');
});

test('the first note changed from outside since: its text stays, and the writer is offered the merged-away notes; Cancel changes nothing', async (p, h, t) => {
	await openView(p); await reset(p);
	const sw = await read(p, SW);
	await merge(p, [A, SW]);
	const edited = (await read(p, A)) + '\nAdded by another program.\n';
	await writeRaw(p, A, edited);
	await sleep(p, 500);
	t.eq(await back(p, false, 'Cancel'), null, 'declined: nothing is undone');
	t.eq(await read(p, A), edited, 'the first note is untouched');
	t.ok(!(await there(p, SW)), 'and the merged-away note is not made');
	t.eq(await back(p, false, 'Bring back'), 'Merge 2 notes into “Arrival”', 'accepted');
	t.eq(await read(p, A), edited, 'the first note still has all of its text');
	t.eq(await read(p, SW), sw, 'the merged-away note is back, byte for byte (its text is in both: never less)');
});

test('typing in the first note’s tab that has not been saved yet is written first; it counts as a change, and is kept', async (p, h, t) => {
	await openView(p); await reset(p);
	await merge(p, [A, SW]);
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(A)}).then(() => 1)`);
	await sleep(p, 600);
	await p.ev(`(() => { const ed = app.workspace.activeEditor?.editor; ed.focus(); ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 1; })()`);
	await p.type(' PENDING-WORDS');
	t.eq(await back(p, false, 'Cancel'), null, 'the typed words changed the first note: asked, and declined');
	t.ok((await read(p, A)).includes('PENDING-WORDS'), 'what was typed is on the disk, in the first note');
	await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`);
});

test('links to the merged-away note follow the merge and the undo; a note that was changed since keeps its words and its links are left, said', async (p, h, t) => {
	await openView(p); await reset(p);
	await p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', true); return 1; })()`);
	const pro = (await read(p, PRO)) + '\nSee [[Storm warning]] and [[Storm warning|the storm]].\n', k = await read(p, K);
	await writeRaw(p, PRO, pro);
	await writeRaw(p, K, k + '\nLink here: [[Storm warning]].\n');
	await sleep(p, 1500);
	await merge(p, [A, SW]);
	await sleep(p, 1500);
	t.eq(await read(p, PRO), pro.replace(/\[\[Storm warning/g, '[[Arrival'), 'the links follow the merge');
	// one of the two notes changed since
	const later = (await read(p, K)) + 'More, written since.\n';
	await writeRaw(p, K, later);
	await sleep(p, 500);
	t.eq(await back(p), 'Merge 2 notes into “Arrival”', 'undone');
	await sleep(p, 1000);
	t.eq(await read(p, PRO), pro, 'the note whose links were rewritten is as it was, byte for byte');
	t.ok((await read(p, K)).endsWith('More, written since.\n'), 'a note changed since keeps its words');
});

test('the old name taken since: the undo is refused, the merged note and the other note are untouched, and asked again it is given up', async (p, h, t) => {
	await openView(p); await reset(p);
	await merge(p, [A, SW]);
	const merged = await read(p, A);
	await p.ev(`app.vault.create(${j(SW)}, 'Another Storm warning.\\n').then(() => 1)`);
	await settle(p);
	const said = await back(p);
	t.ok(String(said).startsWith('refused: “Storm warning” can’t be brought back'), 'it says why: ' + said);
	t.eq(await read(p, SW), 'Another Storm warning.\n', 'the other note is untouched');
	t.eq(await read(p, A), merged, 'and so is the merged one');
	t.eq(await back(p), null, 'asked again it is given up');
});

test('a second recovery of the same merge brings nothing twice: after the merged-away notes are offered back, the next Undo is the change before', async (p, h, t) => {
	await openView(p); await reset(p);
	await merge(p, [A, SW]);
	await writeRaw(p, A, (await read(p, A)) + '\nEdited.\n');
	await sleep(p, 400);
	await back(p, false, 'Bring back');
	t.ok(await there(p, SW), 'the note is back once');
	t.eq(await back(p), null, 'asked again there is nothing: it is not brought twice');
	t.eq(await p.ev(`app.vault.getFiles().filter(f => /^Storm warning/.test(f.name)).length`), 1, 'one Storm warning');
});

test('notes with Windows line endings and a byte-order mark: merged, undone and redone byte for byte', async (p, h, t) => {
	await openView(p); await reset(p);
	const crlf = '---\r\nstatus: draft\r\nsynopsis: One.\r\n---\r\nFirst.\r\nSecond.\r\n', bom = '﻿---\nstatus: draft\nsynopsis: Two.\n---\nMark first.\n';
	await writeRaw(p, A, crlf); await writeRaw(p, SW, bom);
	await sleep(p, 600);
	await merge(p, [A, SW]);
	const merged = await read(p, A);
	await back(p);
	t.eq(await read(p, A), crlf, 'the Windows note is as it was');
	t.eq(await read(p, SW), bom, 'the note with the mark too');
	await back(p, true);
	t.eq(await read(p, A), merged, 'merged again: the same bytes');
});

test('a merge in a Longform project is undone with its place in the project’s list', async (p, h, t) => {
	const LF = 'Longform demo', INDEX = LF + '/Index.md';
	await openView(p, LF); await reset(p);
	const before = await read(p, INDEX), island = await read(p, LF + '/Island.md'), ret = await read(p, LF + '/Return.md');
	await merge(p, [LF + '/Island.md', LF + '/Return.md'], LF);
	t.ok(!(await there(p, LF + '/Return.md')), 'merged');
	t.eq(await back(p, false, null, LF), 'Merge 2 notes into “Island”', 'undone');
	t.eq(await read(p, LF + '/Island.md'), island, 'the first scene is as it was');
	t.eq(await read(p, LF + '/Return.md'), ret, 'the second is back, byte for byte');
	t.eq(await read(p, INDEX), before, 'and the project’s note is as it was');
});
