// Undo and redo of renames made by hand (a card, a row, a lane card, a manuscript title, a folder's heading). Never lose
// writing: every test reads bytes off the disk. A rename is taken back only if the item still has the name the rename gave
// it and the old name is free; otherwise nothing is renamed and the writer is told why.
import { B, NOTE, PL, VIEW, answer, contents, file, j, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo rename: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const P1 = L + 'Part One/';
const ARR = P1 + 'Arrival.md', LAND = P1 + 'Landing.md';
const sleep = (p, ms) => p.sleep(ms);

const reset = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
/** A rename by hand, as the views make it (the store's one road). */
const rename = (p, path, name) => p.ev(`${B}.rename(${file(path)}, ${j(name)}).then(() => 'ok', e => 'refused: ' + e.message)`);
const back = (p, redo = false) => p.ev(`${B}.undo(${file('The Lighthouse')}, ${redo}).then(x => x, e => 'refused: ' + e.message)`);
const labels = async (p) => j(await p.ev(`${B}.undos.map(u => u.label)`));
const there = (p, path) => p.ev(`!!${file(path)}`);
const settle = async (p) => { await sleep(p, 500); await p.ev(`${B}.flush().then(() => 1)`); await sleep(p, 300); };

test('a note renamed by hand is undone, redone and undone again: the note and the binder’s list the same each time', async (p, h, t) => {
	await openView(p); await reset(p);
	const text = await read(p, ARR), list = await contents(p);
	t.eq(await rename(p, ARR, 'Landing'), 'ok', 'renamed');
	await settle(p);
	const listAfter = await contents(p);
	t.ok(await there(p, LAND) && !(await there(p, ARR)), 'the note has its new name');
	t.eq(await labels(p), j(['Rename “Arrival” to “Landing”']), 'one change, named for what it did');
	t.eq(await back(p), 'Rename “Arrival” to “Landing”', 'undo says what it undid');
	await settle(p);
	t.eq(await read(p, ARR), text, 'the note is as it was, byte for byte');
	t.ok(!(await there(p, LAND)), 'and not left under the new name');
	t.eq(j(await contents(p)), j(list), 'the binder’s list is as it was');
	t.eq(await back(p, true), 'Rename “Arrival” to “Landing”', 'redo');
	await settle(p);
	t.eq(await read(p, LAND), text, 'renamed again, the text the same');
	t.eq(j(await contents(p)), j(listAfter), 'and the list as the rename left it');
	await back(p); await settle(p);
	t.eq(await read(p, ARR), text, 'undo again: as it began');
	t.eq(await back(p), null, 'nothing left');
});

test('a folder renamed by hand is undone: its notes inside, and the list, as they were', async (p, h, t) => {
	await openView(p); await reset(p);
	const before = await contents(p), arr = await read(p, ARR);
	t.eq(await rename(p, L + 'Part One', 'Act one'), 'ok', 'renamed');
	await settle(p);
	t.ok(await there(p, L + 'Act one/Arrival.md'), 'the notes went with it');
	t.eq(await back(p), 'Rename “Part One” to “Act one”', 'undone');
	await settle(p);
	t.eq(await read(p, ARR), arr, 'the note is back inside, as it was');
	t.eq(j(await contents(p)), j(before), 'the list is as it was');
});

test('a note edited from outside between the rename and the undo: the name goes back and the edit stays', async (p, h, t) => {
	await openView(p); await reset(p);
	await rename(p, ARR, 'Landing');
	await settle(p);
	const edited = (await read(p, LAND)) + '\nAdded by another program.\n';
	await writeRaw(p, LAND, edited);
	await sleep(p, 400);
	t.eq(await back(p), 'Rename “Arrival” to “Landing”', 'undone');
	await settle(p);
	t.eq(await read(p, ARR), edited, 'under the old name, with the other program’s words');
});

test('a note renamed again in the file explorer between: the undo is refused, nothing is renamed, and asked again it is given up', async (p, h, t) => {
	await openView(p); await reset(p);
	await rename(p, ARR, 'Landing');
	await settle(p);
	await p.ev(`app.fileManager.renameFile(${file(LAND)}, ${j(P1 + 'Shore.md')}).then(() => 1)`);
	await settle(p);
	const text = await read(p, P1 + 'Shore.md');
	t.eq(await back(p), 'refused: “Shore” has been renamed since, so its name stays.', 'it says why');
	t.ok(await there(p, P1 + 'Shore.md') && !(await there(p, ARR)) && !(await there(p, LAND)), 'the note keeps the name it has');
	t.eq(await read(p, P1 + 'Shore.md'), text, 'untouched');
	t.eq(await p.ev(`${B}.undos.length`), 1, 'the change stays once');
	t.eq(await back(p), null, 'asked again it is given up');
});

test('the old name taken meanwhile: the undo is refused, and neither note is touched', async (p, h, t) => {
	await openView(p); await reset(p);
	await rename(p, ARR, 'Landing');
	await settle(p);
	await p.ev(`app.vault.create(${j(ARR)}, 'Another Arrival, written since.\\n').then(() => 1)`);
	await settle(p);
	const landing = await read(p, LAND);
	t.eq(await back(p), 'refused: “Arrival” can’t have its name back: there is another “Arrival” here now.', 'it says why');
	t.eq(await read(p, ARR), 'Another Arrival, written since.\n', 'the new note is untouched');
	t.eq(await read(p, LAND), landing, 'and so is the renamed one');
});

test('typing in the note’s tab that has not been saved yet is written first and kept, under the old name', async (p, h, t) => {
	await openView(p); await reset(p);
	await rename(p, ARR, 'Landing');
	await settle(p);
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(LAND)}).then(() => 1)`);
	await sleep(p, 600);
	await p.ev(`(() => { const ed = app.workspace.activeEditor?.editor; ed.focus(); ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 1; })()`);
	await p.type(' PENDING-WORDS');
	t.eq(await back(p), 'Rename “Arrival” to “Landing”', 'undone');
	await settle(p);
	t.ok((await read(p, ARR)).includes('PENDING-WORDS'), 'what was typed is in the note under its old name');
	await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`);
});

test('two undos asked at once each take one rename, in order', async (p, h, t) => {
	await openView(p); await reset(p);
	const text = await read(p, ARR);
	await rename(p, ARR, 'Landing');
	await rename(p, LAND, 'Shore');
	await settle(p);
	const both = await p.ev(`Promise.all([${B}.undo(${file('The Lighthouse')}), ${B}.undo(${file('The Lighthouse')})])`);
	t.eq(j(both), j(['Rename “Landing” to “Shore”', 'Rename “Arrival” to “Landing”']), 'both ran, newest first');
	await settle(p);
	t.eq(await read(p, ARR), text, 'the note is back under its first name');
	t.eq(await back(p), null, 'and a third finds nothing');
});

test('notes with Windows line endings and a byte-order mark keep every byte through rename, undo and redo', async (p, h, t) => {
	await openView(p); await reset(p);
	const crlf = '---\r\nstatus: draft\r\nsynopsis: Old.\r\n---\r\nFirst line.\r\nSecond line.\r\n', bom = '﻿---\nstatus: draft\n---\nMark first.\n';
	await writeRaw(p, ARR, crlf);
	await writeRaw(p, P1 + 'The keeper.md', bom);
	await sleep(p, 500);
	await rename(p, ARR, 'Landing'); await rename(p, P1 + 'The keeper.md', 'Warden');
	await settle(p);
	await back(p); await back(p); await settle(p);
	t.eq(await read(p, ARR), crlf, 'the Windows note is byte for byte as it was');
	t.eq(await read(p, P1 + 'The keeper.md'), bom, 'the note with the mark too');
	await back(p, true); await back(p, true); await settle(p);
	t.eq(await read(p, LAND), crlf, 'renamed again: the same bytes');
	t.eq(await read(p, P1 + 'Warden.md'), bom, 'and the mark');
});

test('a link to the note follows the rename and the undo, when Obsidian updates links; the note that holds it changes only in the link', async (p, h, t) => {
	await openView(p); await reset(p);
	await p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', true); return 1; })()`);
	const holder = L + 'Prologue.md', old = await read(p, holder), withLink = old + '\nSee [[Arrival]] and [[Arrival|the arrival]].\n';
	await writeRaw(p, holder, withLink);
	await sleep(p, 1200);
	await rename(p, ARR, 'Landing');
	await sleep(p, 1500);
	t.eq(await read(p, holder), withLink.replace(/\[\[Arrival/g, '[[Landing'), 'the links follow the rename');
	await back(p);
	await sleep(p, 1500);
	t.eq(await read(p, holder), withLink, 'and the undo: the note byte for byte as it was');
});

test('a name Obsidian or Binders would refuse is refused as before, and nothing is remembered', async (p, h, t) => {
	await openView(p); await reset(p);
	t.ok((await rename(p, ARR, 'a/b')).startsWith('refused:'), 'a slash');
	t.ok((await rename(p, ARR, 'Part One')).startsWith('refused:'), 'a note named like its folder');
	t.ok((await rename(p, ARR, 'The keeper')).startsWith('refused:'), 'a name that is taken');
	t.eq(await labels(p), '[]', 'nothing remembered');
	t.ok(await there(p, ARR), 'the note is where it was');
});

test('Undo takes back a rename made on a card with F2', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One'); await reset(p);
	const text = await read(p, ARR), sel = `.workspace-leaf.mod-active .binders-card[data-path="${ARR}"]`;
	await until(p, `!!document.querySelector(${j(sel)})`);
	const at = await p.at(sel);
	await p.click(at.x, at.t + 12);
	await p.key('F2'); await sleep(p, 300);
	await p.key('a', 'ctrl');
	await p.type('Landing');
	await p.key('Enter'); await sleep(p, 800);
	t.ok(await there(p, LAND), 'renamed on the card');
	t.eq(await labels(p), j(['Rename “Arrival” to “Landing”']), 'remembered');
	await back(p); await settle(p);
	t.eq(await read(p, ARR), text, 'undone: the note is back, as it was');
});

// ---- links, with Obsidian set to update them, or to ask ----

const PRO = L + 'Prologue.md', K = P1 + 'The keeper.md', WARDEN = P1 + 'Warden.md';
const LINK_TEXT = (k) => `Plain [[${k}]].\n\n\tTab [[${k}]] and [[${k}|k]].\n`;
const tabsSettled = async (p) => { await sleep(p, 300); await p.ev(`${PL}.paragraphs.renamesSettled().then(() => 1)`); await sleep(p, 300); };
/** Runs `go` (an expression that returns a promise), answering Obsidian's own question ("Update links?") with `button`. */
const asking = async (p, go, button) => {
	await p.ev(`(() => { window.__done = false; window.__out = undefined; ${go}.then((x) => { window.__out = x; window.__done = true; }, (e) => { window.__out = 'refused: ' + e.message; window.__done = true; }); return 1; })()`);
	const asked = button ? await answer(p, button) : null;
	await until(p, `window.__done === true`, 8000);
	await tabsSettled(p);
	return { asked, out: await p.ev(`window.__out`) };
};
const setLinks = (p, on) => p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', ${on}); return 1; })()`);
const indexedLinks = async (p) => { await until(p, `(app.metadataCache.getFileCache(${file(PRO)})?.links || []).length > 0`, 6000); await sleep(p, 600); };

test('with “Automatically update internal links” on, a tab-led link follows the rename and the undo, the note byte for byte as it was', async (p, h, t) => {
	await openView(p); await reset(p);
	await setLinks(p, true);
	await writeRaw(p, PRO, LINK_TEXT('The keeper'));
	await indexedLinks(p);
	await rename(p, K, 'Warden');
	await tabsSettled(p);
	t.eq(await read(p, PRO), LINK_TEXT('Warden'), 'the plain and the tab link follow the rename: ' + j(await read(p, PRO)));
	await back(p);
	await tabsSettled(p);
	t.eq(await read(p, PRO), LINK_TEXT('The keeper'), 'and the undo: byte for byte as it was');
});

test('with it off and “Do not update” answered to Obsidian, both ways: no note’s text changes anywhere', async (p, h, t) => {
	await openView(p); await reset(p);
	await setLinks(p, false);
	try {
		await writeRaw(p, PRO, LINK_TEXT('The keeper'));
		await indexedLinks(p);
		const before = await read(p, PRO);
		const r = await asking(p, `${B}.rename(${file(K)}, 'Warden')`, 'Do not update');
		t.ok(r.asked, 'Obsidian asked at the rename');
		t.eq(await read(p, PRO), before, 'no link changed');
		const u = await asking(p, `${B}.undo(${file('The Lighthouse')})`, 'Do not update');
		t.eq(u.out, 'Rename “The keeper” to “Warden”', 'undone');
		// (nothing links to the new name, so Obsidian has nothing to ask about at the undo)
		t.eq(await read(p, PRO), before, 'still no link changed');
		t.ok(await there(p, K) && !(await there(p, WARDEN)), 'the note has its name back');
	} finally { await setLinks(p, true); }
});

test('with it off and “Just once” answered both ways: the links follow the rename and the undo, the note byte for byte as it was', async (p, h, t) => {
	await openView(p); await reset(p);
	await setLinks(p, false);
	try {
		await writeRaw(p, PRO, LINK_TEXT('The keeper'));
		await indexedLinks(p);
		const before = await read(p, PRO);
		const r = await asking(p, `${B}.rename(${file(K)}, 'Warden')`, 'Just once');
		t.ok(r.asked, 'Obsidian asked at the rename');
		await sleep(p, 1000);
		t.ok((await read(p, PRO)).includes('Plain [[Warden]]'), 'the links followed: ' + j(await read(p, PRO)));
		const u = await asking(p, `${B}.undo(${file('The Lighthouse')})`, 'Just once');
		t.eq(u.out, 'Rename “The keeper” to “Warden”', 'undone');
		await sleep(p, 1000);
		t.eq(await read(p, PRO), before, 'and back: byte for byte as it was');
	} finally { await setLinks(p, true); }
});
