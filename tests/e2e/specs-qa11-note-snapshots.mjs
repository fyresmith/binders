// QA round 11, a note's snapshots: the odd and the adversarial. specs-snapshots.mjs already covers the basics (the header
// button, take, rewrite, bring back with the note open or closed, renames, the phone sheet, Show changes on 3,000
// paragraphs). This file goes where those don't: two presses at once, a long line, typing not yet saved when a snapshot
// is brought back, a note open in reading view, a note of only its properties, a name too long for a file name, sixty
// snapshots, odd characters in a note's name, a snapshot file renamed by hand, a trailing line break as the only change,
// a snapshot taken in the manuscript and read from the note's tab, and a phone's reach to the same things.
import { VIEW, card, clickMenu, file, hoverMenu, j, openView, read, reload, same, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 note snapshots: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });

const L = 'The Lighthouse/';
const A = L + 'Part One/Arrival.md';
const SN = L + 'Snapshots', DIR = SN + '/Part One/Arrival';
const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\nplotlines:\n  - Mara\n---\n';
const LATER = `The supply boat left Mara on the jetty with two cases and a letter she had not opened.

She had been told there would be someone to meet her. There was a quillfish on the bollard, and nobody else.

The island was smaller than the chart had promised. One window of the cottage beside the lighthouse was lit.

"You'll be the new assistant," he said.
`;
const DRAFT = `The supply boat left Mara on the jetty with two cases and a letter she had not opened. It was raining.

The island was smaller than she had imagined. There was a cottage beside the lighthouse with one window lit.

"You'll be the new assistant," he said.
`;
const DLG = '.modal.binders-snapshots';
const COMPARE = DLG + ' .binders-snapshots-compare';

// ---- helpers (the same shapes as specs-snapshots.mjs) ----
const sleep = (p, ms) => p.sleep(ms);
/** The snapshot files in a folder, by name. */
const list = (p, dir = DIR) => p.ev(`app.vault.adapter.exists(${j(dir)}).then(ok => ok ? app.vault.adapter.list(${j(dir)}).then(l => l.files.map(f => f.slice(${dir.length + 1})).sort()) : [])`);
/** A snapshot's properties, as written on disk. */
const head = (text) => (/^---\nsnapshot-of: .*\ntaken: .*\n---\n/.exec(text) ?? [''])[0];
const textOf = async (p, path) => { const all = await read(p, path); return all.slice(head(all).length); };
const write = (p, path, body, front = FRONT) => p.ev(`app.vault.modify(${file(path)}, ${j(front + body)}).then(() => 1)`).then(() => sleep(p, 150));
/** Puts a snapshot file in place, as Binders writes them: folders made as needed. */
async function seed(p, dir, name, body, of = 'Part One/Arrival', taken = '2026-09-12T09:15:40') {
	await p.ev(`(async () => { let at = ''; for (const part of ${j(dir)}.split('/')) { at = at ? at + '/' + part : part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); } await app.vault.create(${j(`${dir}/${name}.snapshot`)}, ${j(`---\nsnapshot-of: ${JSON.stringify(of)}\ntaken: ${taken}\n---\n${body}`)}); })().then(() => 1)`);
	return `${dir}/${name}.snapshot`;
}
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join('|'); })()`);
const openNote = (p, path, state = { mode: 'source' }) => p.ev(`app.workspace.getLeaf(false).openFile(${file(path)}, { state: ${j(state)} }).then(() => 1)`).then(() => sleep(p, 450));
const editor = (path) => `app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(path)}).view.editor`;
async function closeAll(p) {
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await sleep(p, 200); }
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); app.workspace.getLeavesOfType('binders-snapshot').forEach(l => l.detach()); return 1; })()`);
}
/** The centre of the last visible element matching `sel` whose text starts with `text`, pressed by a click. */
async function press(p, sel, text) {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.textContent.trim().startsWith(${j(text)})).pop(); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
	if (!at) throw new Error(`nothing to press: ${sel} “${text}”`);
	await p.click(at.x, at.y);
	await sleep(p, 300);
}
/** A note's card menu on the corkboard of its folder, opened from the card (so the note isn't open in a tab). */
async function cardMenu(p, path, folder = L + 'Part One') {
	await openView(p, folder);
	const at = await until(p, `(() => { const e = document.querySelector(${j(card(path))}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 14 }; })()`);
	await p.right(at.x, at.y);
	await sleep(p, 250);
}
/** The Snapshots dialog of a note, opened from its card. */
async function dialog(p, path = A) {
	await cardMenu(p, path, path.slice(0, path.lastIndexOf('/')));
	await hoverMenu(p, 'Snapshots');
	await clickMenu(p, 'Show snapshots...');
	await until(p, `!!document.querySelector(${j(DLG)})`);
	await sleep(p, 300);
}
/** The Snapshots dialog of the note in the active tab, from the command. */
async function dialogNow(p) {
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector(${j(DLG)})`);
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')}) || !!document.querySelector(${j(DLG + ' .modal-button-container button')})`);
	await sleep(p, 300);
}
const rows = (p) => p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})].map(e => e.querySelector('.modal-sidebar-list-item-details').firstChild.textContent)`);
const pick = (p, text) => press(p, DLG + ' .binders-snapshots-item', text);
const button = (p, text) => press(p, DLG + ' .modal-setting-titlebar-actions button', text);
async function more(p) {
	const at = await p.at(DLG + ' .modal-setting-titlebar-actions .clickable-icon');
	await p.click(at.x, at.y);
	await sleep(p, 250);
}
/** The text the dialog is showing (the snapshot read, or the note now), whatever it is drawn as. */
const shownWords = (p) => p.ev(`(() => { const e = document.querySelector(${j(DLG + ' .binders-snapshots-text')}); return e ? e.textContent : ''; })()`);
const shownName = (p) => p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-name')})?.textContent ?? ''`);
const changes = (p) => p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-snapshots-changes del, ' + DLG + ' .binders-snapshots-changes ins')})].map(e => (e.tagName === 'DEL' ? '-' : '+') + e.textContent)`);
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const tapOn = async (p, sel, text) => {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.textContent.trim().startsWith(${j(text)})).pop(); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
	if (!at) throw new Error(`nothing to tap: ${sel} “${text}”`);
	await tap(p, at.x, at.y);
};
/** Runs fn in Obsidian's mobile mode at a phone's size, by touch; then puts the desktop back (as specs-snapshots.mjs). */
async function onPhone(p, fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await theme();
	await p.sleep(200);
	let logged = [];
	try { await fn(); logged = p.errors.filter((e) => !/ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/.test(e)); } finally {
		await touch(p, 'touchCancel').catch(() => {});
		for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(300); }
		await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
		await theme();
	}
	if (logged.length) throw new Error('errors logged on the phone: ' + logged.slice(0, 3).join(' ; '));
}

// ---- presses that come together ----

test('two presses of “Take a snapshot” at the same moment take one snapshot of one text, not two of it', async (p, h, t) => {
	await write(p, A, DRAFT);
	await openNote(p, A);
	await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshot'); app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`);
	await until(p, `app.vault.adapter.exists(${j(DIR)})`);
	await sleep(p, 1200);
	const files = await list(p);
	t.eq(files.length, 1, 'one file for the two presses: ' + files.join(', '));
	t.eq(await textOf(p, `${DIR}/${files[0]}`), DRAFT, 'with the text');
	t.eq(await read(p, A), FRONT + DRAFT, 'the note is as it was');
});

// ---- Show changes on a long line ----

test('“Show changes” on one paragraph of 12,000 words with one word changed: that word is marked, and it comes soon', async (p, h, t) => {
	const ws = Array.from({ length: 12000 }, (_, i) => `w${i}x`);
	await seed(p, DIR, '2026-09-12 09.15.40 Long line', ws.join(' ') + '\n');
	await write(p, A, ws.map((w, i) => (i === 6000 ? 'changed' : w)).join(' ') + '\n');
	const before = await texts(p);
	await dialog(p);
	await pick(p, 'Long line');
	const t0 = Date.now();
	await press(p, COMPARE, 'Show changes');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-changes p')})`, 15000);
	const ms = Date.now() - t0;
	const marks = await changes(p);
	t.eq(j(marks), j(['-w6000x', '+changed']), 'only the word that changed is marked: ' + j(marks));
	t.ok(ms < 6000, `soon enough (${ms} ms)`);
	same(t, before, await texts(p));
});

// ---- bring back, with what is in the note not yet saved ----

test('bring back with typing not yet saved in the note’s tab: the typing is in the snapshot taken first, and one Undo gives the note back with it', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await openNote(p, A);
	await p.ev(`(() => { const e = ${editor(A)}; e.focus(); e.setCursor(e.offsetToPos(e.getValue().length)); return 1; })()`);
	await p.type('Typed just now.');
	await sleep(p, 100);
	await dialogNow(p);
	await pick(p, 'First draft');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + DRAFT)})`);
	const kept = (await list(p)).find((f) => /Before bringing back/.test(f));
	t.ok(!!kept, 'a snapshot was taken first: ' + (await list(p)).join(', '));
	const keptText = kept ? await textOf(p, `${DIR}/${kept}`) : '';
	t.ok(keptText.endsWith('Typed just now.'), 'and it holds the typing: ' + j(keptText.slice(-40)));
	t.eq(await read(p, A), FRONT + DRAFT, 'the note has the snapshot’s text');
	await closeAll(p);
	await p.ev(`(() => { ${editor(A)}.undo(); return 1; })()`);
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s !== ${j(FRONT + DRAFT)})`);
	t.eq(await read(p, A), FRONT + LATER + 'Typed just now.', 'one Undo: the note as it was, typing and all');
});

// ---- a note open in reading view ----

test('bring back while the note is open in reading view: it stays in reading view, and the reader shows the text brought back', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await openNote(p, A, { mode: 'preview' });
	await dialogNow(p);
	await pick(p, 'First draft');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + DRAFT)})`);
	await closeAll(p);
	await sleep(p, 700);
	const shown = await p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(A)}); return l ? { mode: l.view.getMode(), text: l.containerEl.textContent } : null; })()`);
	t.ok(shown && shown.mode === 'preview', 'still in reading view: ' + j(shown && shown.mode));
	t.ok(shown && shown.text.includes('It was raining.') && !shown.text.includes('quillfish'), 'the reader shows the text brought back');
	t.eq(await read(p, A), FRONT + DRAFT, 'and the file is the same');
});

// ---- a note of only its properties ----

test('a note of only its properties: nothing to take, a rewrite that changes nothing says so, and a snapshot brought back into it gives the text under the properties, byte for byte', async (p, h, t) => {
	const PROPS = '---\r\nstatus: draft\r\nsynopsis: Only the front so far.\r\n---\r\n';
	await writeRaw(p, A, PROPS);
	await sleep(p, 200);
	await openNote(p, A);
	await run(p, 'take-snapshot');
	await sleep(p, 500);
	t.ok(/no text to take a snapshot of yet/.test(await notices(p)), 'take: ' + (await notices(p)));
	t.eq((await list(p)).length, 0, 'no snapshot file');
	t.eq(await read(p, A), PROPS, 'the note is as it was');
	await run(p, 'rewrite');
	await until(p, `!!document.querySelector('.modal')`);
	await press(p, '.modal button', 'Start from this text');
	await sleep(p, 500);
	t.ok(/page is blank already/.test(await notices(p)), 'rewrite: ' + (await notices(p)));
	t.eq(await read(p, A), PROPS, 'still as it was after the rewrite');
	t.eq((await list(p)).length, 0, 'no empty snapshot taken');
	// the note's tab shut, so the bring back is the closed note’s: byte for byte
	await p.ev(`(() => { app.workspace.getLeavesOfType('markdown').forEach(l => l.detach()); return 1; })()`);
	await sleep(p, 300);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await dialog(p);
	await pick(p, 'First draft');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(PROPS + DRAFT)})`);
	t.eq(await read(p, A), PROPS + DRAFT, 'the properties as they were written, the text under them');
	t.eq((await list(p)).length, 1, 'nothing to keep first: no snapshot of the empty text');
});

// ---- a name too long for a file ----

test('a name of 120 accented letters (inside the 120 characters allowed, too long for a file name): refused in words, nothing written, the note as it was', async (p, h, t) => {
	await write(p, A, DRAFT);
	await openNote(p, A);
	await run(p, 'rewrite');
	await until(p, `!!document.querySelector('.modal input')`);
	const at = await p.at('.modal input');
	await p.click(at.x, at.y);
	await p.type('é'.repeat(120));
	await press(p, '.modal button', 'Start from this text');
	await sleep(p, 700);
	const err = await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent ?? ''`);
	t.ok(await p.ev(`!!document.querySelector('.modal')`), 'the dialog stays open');
	t.ok(/too long|can’t|couldn’t|file name/i.test(err) && !/ENAMETOOLONG|errno|Error:/i.test(err), 'said in words a writer can act on: ' + j(err.slice(0, 160)));
	t.eq((await list(p)).length, 0, 'no snapshot file was written');
	t.eq(await read(p, A), FRONT + DRAFT, 'the note is as it was');
});

// ---- many snapshots ----

test('a note with sixty snapshots: all listed, the oldest last, one named one opened and read; deleting it moves the reading to the note now', async (p, h, t) => {
	const pad = (n) => String(n).padStart(2, '0');
	await seed(p, DIR, '2026-09-01 09.00.00 Named', 'Text 0.\n', 'Part One/Arrival', '2026-09-01T09:00:00');
	const more60 = Array.from({ length: 59 }, (_, k) => {
		const i = k + 1, d = new Date(2026, 8, 1 + Math.floor(i / 3), 9, (i % 3) * 10, 0);
		const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.00`;
		return { path: `${DIR}/${stamp}.snapshot`, text: `---\nsnapshot-of: "Part One/Arrival"\ntaken: ${stamp.slice(0, 10)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00\n---\nText ${i}.\n` };
	});
	await p.ev(`(async () => { for (const f of ${j(more60)}) await app.vault.create(f.path, f.text); return 1; })().then(() => 1)`);
	await write(p, A, DRAFT);
	await dialog(p);
	// (the note now is the first row, in the same list: 61 rows for 60 snapshots)
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 61`, 8000);
	const names = await rows(p);
	t.eq(names.length, 61, 'sixty snapshots and the note now listed: ' + names.length);
	t.eq(names[0], 'The note now', 'the note now first');
	t.eq(names[names.length - 1], 'Named', 'the oldest is last: ' + names[names.length - 1]);
	await pick(p, 'Named');
	t.ok((await shownWords(p)).includes('Text 0.'), 'the one named reads as it was');
	await more(p);
	await clickMenu(p, 'Delete snapshot');
	await until(p, `!!document.querySelector('.modal-container .modal button')`);
	await press(p, '.modal button', 'Delete');
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 60`, 8000);
	t.eq((await list(p)).length, 59, 'one file gone, fifty-nine left');
	t.eq(await shownName(p), 'The note now', 'the reading goes to the note now, not to the next one');
	t.ok(!(await p.ev(`!!document.querySelector(${j(COMPARE)})?.classList.contains('is-active')`)), 'and Show changes is off');
});

// ---- odd characters in a note’s name, after a rename ----

test('a note named with brackets, a hash, a dash and an accent: its snapshots are its own after a rename, and the old folder is left empty', async (p, h, t) => {
	const ODD = L + 'Part One/Arrival [draft] #2 – café.md', ODD2 = L + 'Part One/Arrival [draft] #2 – café 2.md';
	const dirOdd = `${SN}/Part One/Arrival [draft] #2 – café`, dirOdd2 = `${SN}/Part One/Arrival [draft] #2 – café 2`;
	await p.ev(`app.vault.create(${j(ODD)}, ${j(FRONT + LATER)}).then(() => 1)`);
	await sleep(p, 400);
	await openNote(p, ODD);
	await run(p, 'take-snapshot');
	await until(p, `app.vault.adapter.exists(${j(dirOdd)})`);
	await sleep(p, 300);
	t.eq((await list(p, dirOdd)).length, 1, 'taken in its own folder');
	await p.ev(`app.vault.rename(app.vault.getAbstractFileByPath(${j(ODD)}), ${j(ODD2)}).then(() => 1)`);
	await until(p, `app.vault.adapter.exists(${j(dirOdd2)})`, 5000);
	await sleep(p, 400);
	t.eq((await list(p, dirOdd2)).length, 1, 'followed the rename');
	t.eq((await list(p, dirOdd)).length, 0, 'left nothing in the old folder');
	await run(p, 'take-snapshot');
	await sleep(p, 500);
	t.eq((await list(p, dirOdd2)).length, 1, 'and the text not changed since is not taken twice');
});

// ---- a snapshot file renamed by hand ----

test('a snapshot file renamed by hand, to a name that isn’t Binders’: listed under that name, dated by its own date, and brought back as it is', async (p, h, t) => {
	await write(p, A, LATER);
	const made = await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await p.ev(`app.vault.rename(app.vault.getAbstractFileByPath(${j(made)}), ${j(DIR + '/my draft for Sam.snapshot')}).then(() => 1)`);
	await sleep(p, 300);
	await dialog(p);
	const names = await rows(p);
	t.ok(names.includes('my draft for Sam'), 'listed under its own name: ' + j(names));
	await pick(p, 'my draft for Sam');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + DRAFT)})`);
	t.eq(await read(p, A), FRONT + DRAFT, 'brought back, the note’s properties as they were');
	t.eq((await list(p)).length, 2, 'and the text it replaced is kept beside it');
});

// ---- Show changes when only the last line break differs ----

test('“Show changes” when the only difference is the last line break: it says nothing has changed, rather than showing an unmarked page', async (p, h, t) => {
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await write(p, A, DRAFT.replace(/\n$/, ''));
	const before = await texts(p);
	await dialog(p);
	await pick(p, 'First draft');
	await press(p, COMPARE, 'Show changes').catch(() => {});
	await sleep(p, 400);
	const marks = await changes(p);
	const pane = await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-diff')})?.textContent ?? ''`);
	const offered = await p.ev(`(() => { const c = document.querySelector(${j(COMPARE)}); return c ? c.classList.contains('is-disabled') || c.getAttribute('aria-disabled') === 'true' : true; })()`);
	t.ok(offered || marks.length > 0 || /same|no change|hasn’t changed/i.test(pane), `a difference a writer can’t see, said as such (marks ${j(marks)}, offered ${offered})`);
	same(t, before, await texts(p));
});

// ---- a snapshot taken in the manuscript, read from the note’s tab ----

test('a snapshot taken from the manuscript (with typing in it) is listed and read from the note’s own tab', async (p, h, t) => {
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene .cm-content[contenteditable=true]').length >= 3`, 8000);
	const at = await p.ev(`(() => { const s = [...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title')?.textContent === 'Arrival'); const r = s.querySelector('.cm-content .cm-line:last-child').getBoundingClientRect(); return { x: r.right - 4, y: r.top + r.height / 2 }; })()`);
	await p.click(at.x, at.y);
	await p.key('End');
	await p.type(' In the manuscript.');
	await sleep(p, 150);
	await run(p, 'take-snapshot');
	await until(p, `app.vault.adapter.exists(${j(DIR)})`);
	await sleep(p, 300);
	const made = await list(p);
	t.eq(made.length, 1, 'taken from the manuscript: ' + made.join(', '));
	await openNote(p, A);
	await dialogNow(p);
	const names = await rows(p);
	t.eq(names.length, 2, 'the note’s tab lists it: ' + j(names));
	await pick(p, names[1]);
	t.ok((await shownWords(p)).includes('In the manuscript.'), 'and reads the typing in it');
});

// ---- a phone ----

test('on a phone: a binder note’s snapshots are reached from its header or its More options, and the list opens as a sheet that reads a snapshot', async (p, h, t) => {
	await write(p, A, DRAFT);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', LATER);
	await onPhone(p, async () => {
		await openNote(p, A);
		const labels = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .view-actions .clickable-icon')].filter(e => e.offsetParent).map(e => e.getAttribute('aria-label'))`);
		const inHeader = labels.includes('Snapshots');
		if (inHeader) {
			const at = await p.at('.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="Snapshots"]');
			await tap(p, at.x, at.y);
			await tapOn(p, '.menu .menu-item', 'Show snapshots...');
		} else {
			const at = await p.at('.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="More options"]');
			await tap(p, at.x, at.y);
			await tapOn(p, '.menu .menu-item', 'Show snapshots...');
		}
		await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`, 6000);
		await sleep(p, 400);
		t.ok(await p.ev(`!document.querySelector(${j(DLG + ' .binders-snapshots-pane')})`), 'the list is the sheet, no text beside it');
		await tapOn(p, DLG + ' .binders-snapshots-item', 'First draft');
		await sleep(p, 300);
		t.ok((await shownWords(p)).includes('quillfish'), 'a tap reads the snapshot (the text of LATER)');
		t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-snapshot').length`), 0, 'and no pane is opened beside the note');
	});
});

// ---- a snapshot file made by hand ----

test('a snapshot file made by hand, with no properties, is listed by its name and brought back whole; the note’s properties stay', async (p, h, t) => {
	await write(p, A, LATER);
	await p.ev(`(async () => { await app.vault.createFolder(${j(SN)}).catch(() => {}); await app.vault.createFolder(${j(SN + '/Part One')}).catch(() => {}); await app.vault.createFolder(${j(DIR)}).catch(() => {}); await app.vault.create(${j(DIR + '/Written by hand.snapshot')}, ${j(DRAFT)}); return 1; })().then(() => 1)`);
	await sleep(p, 300);
	await dialog(p);
	const names = await rows(p);
	t.ok(names.includes('Written by hand'), 'listed by its name: ' + j(names));
	await pick(p, 'Written by hand');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + DRAFT)})`);
	t.eq(await read(p, A), FRONT + DRAFT, 'the whole text as it is in the file, under the properties');
});
