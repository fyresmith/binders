// Snapshots (src/snapshots.ts, src/view/snapshots.ts, and what the store and the explorer do about them): a note's text
// set aside in "Snapshots/<its path>/<when> <name>.snapshot", to read, compare and bring back. Golden rule 2 lives here
// too: every test that replaces a note's text checks, byte for byte, that the text it replaced is in a snapshot, that
// the note's properties are what they were, and that no other note changed.
import { B, NOTE, PL, VIEW, card, clickMenu, closeMenus, hoverMenu, contents, exists, file, flush, j, menuItems, openView, read, reload, same, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'snapshots: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });

const L = 'The Lighthouse/';
const A = L + 'Part One/Arrival.md', K = L + 'Part One/The keeper.md', S = L + 'Part One/Storm warning.md';
const SN = L + 'Snapshots', DIR = SN + '/Part One/Arrival';
const FRONT = '---\nstatus: revised\nsynopsis: Mara arrives on the island with the supply boat.\nplotlines:\n  - Mara\n---\n';
const ONE = 'The supply boat left Mara on the jetty with two cases and a letter she had not opened.\n';
const DRAFT = `The supply boat left Mara on the jetty with two cases and a letter she had not opened. It was raining.

The island was smaller than she had imagined. There was a cottage beside the lighthouse with one window lit.

"You'll be the new assistant," he said.
`;
const LATER = `The supply boat left Mara on the jetty with two cases and a letter she had not opened.

She had been told there would be someone to meet her. There was a quillfish on the bollard, and nobody else.

The island was smaller than the chart had promised. One window of the cottage beside the lighthouse was lit.

"You'll be the new assistant," he said.
`;
const DLG = '.modal.binders-snapshots';
const MORE = '.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="More options"]';

// ---- helpers ----
const sleep = (p, ms) => p.sleep(ms);
/** The snapshot files in a folder, by name (they sort by time). */
const list = (p, dir = DIR) => p.ev(`app.vault.adapter.exists(${j(dir)}).then(ok => ok ? app.vault.adapter.list(${j(dir)}).then(l => l.files.map(f => f.slice(${dir.length + 1})).sort()) : [])`);
/** A snapshot's text: what follows its two properties, as written on disk. */
const head = (text) => (/^---\nsnapshot-of: .*\ntaken: .*\n---\n/.exec(text) ?? [''])[0];
const textOf = async (p, path) => { const all = await read(p, path); return all.slice(head(all).length); };
/** A note's text after its properties, as written on disk. */
const bodyOf = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '');
const frontOf = (text) => (/^---\n[\s\S]*?\n---\n/.exec(text) ?? [''])[0];
const NAME = /^\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d( .+)?\.snapshot$/;
/** Sets a note's text (under its properties) through the vault, and waits for it. */
const write = (p, path, body, front = FRONT) => p.ev(`app.vault.modify(${file(path)}, ${j(front + body)}).then(() => 1)`).then(() => sleep(p, 150));
/** Puts a snapshot file in place, as Binders writes them: folders made as needed. */
async function seed(p, dir, name, body, of = 'Part One/Arrival', taken = '2026-09-12T09:15:40') {
	await p.ev(`(async () => { let at = ''; for (const part of ${j(dir)}.split('/')) { at = at ? at + '/' + part : part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); } await app.vault.create(${j(`${dir}/${name}.snapshot`)}, ${j(`---\nsnapshot-of: ${JSON.stringify(of)}\ntaken: ${taken}\n---\n${body}`)}); })().then(() => 1)`);
	return `${dir}/${name}.snapshot`;
}
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const can = (p, id) => p.ev(`(() => { const c = app.commands.commands['binders:${id}']; return !!c && c.checkCallback(true) === true; })()`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join('|'); })()`);
const settle = (p) => p.ev(`(async () => { await new Promise(r => setTimeout(r, 150)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`).then(() => sleep(p, 150));
const openNote = (p, path, state = { mode: 'source' }) => p.ev(`app.workspace.getLeaf(false).openFile(${file(path)}, { state: ${j(state)} }).then(() => 1)`).then(() => sleep(p, 450));
const editor = (path) => `app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(path)}).view.editor`;
async function closeAll(p) {
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await sleep(p, 200); }
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); app.workspace.getLeavesOfType('binders-snapshot').forEach(l => l.detach()); return 1; })()`);
}
/** The centre of the last element matching a selector whose text starts with `text`. */
const spot = (p, sel, text) => p.ev(`(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.textContent.trim().startsWith(${j(text)})).pop(); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
async function press(p, sel, text) {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.textContent.trim().startsWith(${j(text)})).pop(); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
	if (!at) throw new Error(`nothing to press: ${sel} “${text}”`);
	await p.click(at.x, at.y);
	await sleep(p, 300);
}
/** A card's menu on the corkboard of a folder. */
async function cardMenu(p, path, folder = L + 'Part One') {
	await openView(p, folder);
	const at = await until(p, `(() => { const e = document.querySelector(${j(card(path))}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 14 }; })()`);
	await p.right(at.x, at.y);
	await sleep(p, 250);
}
/** An item of a card's "Snapshots" submenu (the card's menu is open). */
async function snapMenu(p, title) {
	await hoverMenu(p, 'Snapshots');
	await clickMenu(p, title);
}
/** The Snapshots dialog of a note, opened from its card (so the note isn't open in a tab). */
async function dialog(p, path = A) {
	await cardMenu(p, path, path.slice(0, path.lastIndexOf('/')));
	await snapMenu(p, 'Show snapshots...');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	await sleep(p, 300);
}
const rows = (p) => p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})].map(e => e.querySelector('.modal-sidebar-list-item-details').firstChild.textContent + ' / ' + e.querySelector('.u-muted').textContent)`);
const shownTitle = (p) => p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-bar .modal-setting-title')})?.textContent ?? ''`);
const shownText = (p) => p.ev(`(() => { const e = document.querySelector(${j(DLG + ' .binders-snapshots-text')}); return e && e.isShown() ? e.innerText : null; })()`);
const pick = (p, text) => press(p, DLG + ' .binders-snapshots-item', text);
const button = (p, text) => press(p, DLG + ' .modal-setting-titlebar-actions button', text);
/** The dialog's "More" menu for the snapshot shown. */
async function more(p) {
	const at = await p.at(DLG + ' .modal-setting-titlebar-actions .clickable-icon');
	await p.click(at.x, at.y);
	await sleep(p, 250);
}
const typeInto = async (p, text) => { await p.type(text); await sleep(p, 150); };
const explorerRows = async (p, expand) => {
	await p.ev(`(async () => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); for (const f of ${j(expand)}) await l.view.fileItems[f]?.setCollapsed(false); })().then(() => 1)`);
	await sleep(p, 400);
	return p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path]')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none').map(e => e.dataset.path)`);
};
const setSettings = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => sleep(p, 300));

// ---- taking one ----

test('take one with the note open: its text, byte for byte, in a file of its own; nothing else changes', async (p, h, t) => {
	await write(p, A, DRAFT);
	const before = await texts(p);
	await openNote(p, A);
	t.ok(await can(p, 'take-snapshot'), 'the command is there for a note of a binder');
	await run(p, 'take-snapshot');
	await until(p, `app.vault.adapter.exists(${j(DIR)})`);
	await sleep(p, 300);
	const files = await list(p);
	t.eq(files.length, 1, 'one file in Snapshots/Part One/Arrival');
	t.ok(NAME.test(files[0]) && !/ /.test(files[0].slice(19, -9)), `named for when it was taken: ${files[0]}`);
	const all = await read(p, `${DIR}/${files[0]}`);
	t.ok(/^---\nsnapshot-of: "Part One\/Arrival"\ntaken: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\n---\n/.test(all), 'what it’s of and when, as two properties: ' + all.slice(0, 80));
	t.eq(all.slice(head(all).length), DRAFT, 'then the note’s text, byte for byte');
	t.ok(!all.includes('synopsis') && !all.includes('status'), 'the note’s own properties aren’t in it');
	same(t, before, await texts(p));
	t.ok(/Took a snapshot of “Arrival”\./.test(await notices(p)), 'says so: ' + await notices(p));
});

test('take one with the note closed, from its card', async (p, h, t) => {
	await write(p, A, DRAFT);
	const before = await texts(p);
	await cardMenu(p, A);
	const items = await menuItems(p);
	t.ok(items.includes('Snapshots') && !items.includes('Rewrite...') && items.indexOf('Snapshots') === items.indexOf('Set synopsis from text') + 1, 'the card’s menu has one item for them, with what else is done to the note’s text: ' + items.join(', '));
	const size = await p.ev(`(() => { const r = document.querySelector('.menu').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; })()`);
	t.ok(size[0] >= 0 && size[1] <= size[2], 'the menu is on the screen: ' + j(size));
	await hoverMenu(p, 'Snapshots');
	t.eq(j((await menuItems(p)).slice(-3)), j(['Take a snapshot', 'Rewrite...', 'Show snapshots...']), 'which opens the three');
	await clickMenu(p, 'Take a snapshot');
	await until(p, `app.vault.adapter.exists(${j(DIR)})`);
	await sleep(p, 300);
	const files = await list(p);
	t.eq(files.length, 1, 'one file');
	t.eq(await textOf(p, `${DIR}/${files[0]}`), DRAFT, 'the text, byte for byte');
	same(t, before, await texts(p));
});

test('typing that isn’t saved yet is in the snapshot', async (p, h, t) => {
	await openNote(p, A);
	await p.ev(`(() => { const ed = ${editor(A)}; ed.focus(); ed.setCursor(ed.lastLine(), ed.getLine(ed.lastLine()).length); return 1; })()`);
	await typeInto(p, 'Typed just now.');
	await run(p, 'take-snapshot');
	await until(p, `app.vault.adapter.exists(${j(DIR)})`);
	await sleep(p, 300);
	const text = await textOf(p, `${DIR}/${(await list(p))[0]}`);
	t.ok(text.includes('Typed just now.'), 'what was on screen is what’s kept: ' + j(text));
	t.eq(bodyOf(await read(p, A)), text, 'and the note on disk has it too');
});

test('in the manuscript: the section being typed in, with its unsaved typing', async (p, h, t) => {
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene .cm-content[contenteditable=true]').length >= 3`, 8000);
	const at = await p.ev(`(() => { const s = [...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title')?.textContent === 'Arrival'); const r = s.querySelector('.cm-content .cm-line:last-child').getBoundingClientRect(); return { x: r.right - 4, y: r.y + r.height / 2 }; })()`);
	await p.click(at.x, at.y);
	await p.key('End');
	await typeInto(p, ' In the manuscript.');
	t.ok(await can(p, 'take-snapshot'), 'the command works on the section with the cursor');
	await run(p, 'take-snapshot');
	await until(p, `app.vault.adapter.exists(${j(DIR)})`);
	await sleep(p, 300);
	const text = await textOf(p, `${DIR}/${(await list(p))[0]}`);
	t.ok(text.includes('In the manuscript.'), 'the typing is in the snapshot: ' + j(text));
	t.eq((await list(p, SN + '/Part One/The keeper')).length, 0, 'no other note got one');
});

test('several at once, and nothing twice: a note that hasn’t changed isn’t snapshotted again', async (p, h, t) => {
	await openView(p, L + 'Part One');
	const a = await p.at(card(A)), k = await p.at(card(K));
	await p.click(a.x, a.y - 30);
	await p.click(k.x, k.y - 30, { modifiers: 2 });
	await p.right(k.x, k.y - 30);
	await sleep(p, 250);
	const items = await menuItems(p);
	t.ok(items.includes('Take a snapshot of 2 notes') && !items.includes('Rewrite...') && !items.includes('Snapshots'), 'for two notes, only the taking: ' + items.join(', '));
	await clickMenu(p, 'Take a snapshot of 2 notes');
	await until(p, `app.vault.adapter.exists(${j(SN + '/Part One/The keeper')})`);
	await sleep(p, 400);
	t.eq(`${(await list(p)).length} ${(await list(p, SN + '/Part One/The keeper')).length} ${(await list(p, SN + '/Part One/Storm warning')).length}`, '1 1 0', 'each of the two has one');
	t.ok(/Took a snapshot of 2 notes\./.test(await notices(p)), await notices(p));
	// again, with only one of them changed
	await write(p, K, 'He did not move out of the doorway. Not yet.\n', frontOf(await read(p, K)));
	await p.right(k.x, k.y - 30);
	await sleep(p, 250);
	await clickMenu(p, 'Take a snapshot of 2 notes');
	await until(p, `app.vault.adapter.list(${j(SN + '/Part One/The keeper')}).then(l => l.files.length === 2)`);
	await sleep(p, 300);
	t.eq(`${(await list(p)).length} ${(await list(p, SN + '/Part One/The keeper')).length}`, '1 2', 'only the changed one got another');
	t.ok(/One hasn’t changed since its last snapshot/.test(await notices(p)), await notices(p));
	// one note alone, unchanged: nothing made, and it says why
	await closeMenus(p);
	await openNote(p, A);
	await run(p, 'take-snapshot');
	await sleep(p, 500);
	t.eq((await list(p)).length, 1, 'still one');
	t.ok(/“Arrival” hasn’t changed since its last snapshot\./.test(await notices(p)), await notices(p));
});

test('a folder, and the binder, under one name', async (p, h, t) => {
	const before = await texts(p);
	await cardMenu(p, L + 'Part One', 'The Lighthouse');
	t.ok((await menuItems(p)).includes('Take a snapshot of every note...'), 'a folder’s menu has it: ' + (await menuItems(p)).join(', '));
	await clickMenu(p, 'Take a snapshot of every note...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	t.eq(await p.ev(`document.querySelector('.modal .modal-title').textContent`), 'Take a snapshot of all 3 notes in “Part One”', 'the dialog says how many');
	await typeInto(p, 'Draft sent to Sam');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(SN + '/Part One/Storm warning')})`);
	await sleep(p, 500);
	for (const n of ['Arrival', 'The keeper', 'Storm warning']) {
		const files = await list(p, `${SN}/Part One/${n}`);
		t.ok(files.length === 1 && / Draft sent to Sam\.snapshot$/.test(files[0]), `${n}: ${files.join(', ')}`);
		t.eq(await textOf(p, `${SN}/Part One/${n}/${files[0]}`), bodyOf(before[`${L}Part One/${n}.md`]), `${n}: its text`);
	}
	t.eq(await exists(p, SN + '/Prologue'), false, 'notes outside the folder aren’t touched');
	t.ok(/Took a snapshot of 3 notes, named “Draft sent to Sam”\./.test(await notices(p)), await notices(p));
	// the binder: every note, the unchanged ones too (the name is the point)
	await closeAll(p);
	await openView(p);
	t.ok(await can(p, 'take-snapshots'), 'the command for the binder in view');
	await run(p, 'take-snapshots');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await typeInto(p, 'Second draft');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(SN + '/Epilogue')})`);
	await sleep(p, 600);
	t.eq((await list(p)).filter((f) => / Second draft\.snapshot$/.test(f)).length, 1, 'Arrival has one named for the second draft, though its text hasn’t changed');
	t.eq((await list(p, SN + '/Part Two/The wreck')).length + (await list(p, SN + '/Prologue')).length + (await list(p, SN + '/Epilogue')).length, 3, 'every note of the binder');
	same(t, before, await texts(p));
	// a name a file can't have is refused in the dialog
	await run(p, 'take-snapshots');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await typeInto(p, 'a/b');
	await p.key('Enter');
	await sleep(p, 300);
	t.ok(/can’t contain/.test(await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent ?? ''`)), 'refused, with why');
	t.eq((await list(p)).length, 2, 'nothing taken');
});

test('an empty note: nothing to take; text with Windows line breaks or a first line of dashes: byte for byte', async (p, h, t) => {
	await write(p, A, '');
	await openNote(p, A);
	await run(p, 'take-snapshot');
	await sleep(p, 500);
	t.eq(await exists(p, DIR), false, 'no file, no folder');
	t.ok(/There’s no text to take a snapshot of yet\./.test(await notices(p)), await notices(p));
	await write(p, A, '   \n\n');
	await run(p, 'take-snapshot');
	await sleep(p, 400);
	t.eq(await exists(p, DIR), false, 'blank lines aren’t text');
	await closeAll(p);
	await p.ev(`app.workspace.getLeavesOfType('markdown').forEach(l => l.detach())`);
	// Windows line breaks, written by another program
	const crlf = 'One line.\r\n\r\nAnother.\r\n', dashes = '---\nnot: properties\n---\nJust text that starts with a rule.\n';
	await write(p, K, crlf, '');
	await cardMenu(p, K);
	await snapMenu(p, 'Take a snapshot');
	await until(p, `app.vault.adapter.exists(${j(SN + '/Part One/The keeper')})`);
	await sleep(p, 300);
	t.eq(await textOf(p, `${SN}/Part One/The keeper/${(await list(p, SN + '/Part One/The keeper'))[0]}`), crlf, 'Windows line breaks kept as they are');
	// a note with properties whose text begins with a rule and something that looks like properties
	await write(p, S, dashes, '---\nstatus: idea\n---\n');
	await closeMenus(p);
	await cardMenu(p, S);
	await snapMenu(p, 'Take a snapshot');
	await until(p, `app.vault.adapter.exists(${j(SN + '/Part One/Storm warning')})`);
	await sleep(p, 300);
	t.eq(await textOf(p, `${SN}/Part One/Storm warning/${(await list(p, SN + '/Part One/Storm warning'))[0]}`), dashes, 'a text that begins with dashes reads back whole');
});

test('a binder in a newer format: its snapshots can be read, nothing can be taken or changed', async (p, h, t) => {
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem(${file(A)})`);
	await openNote(p, A);
	t.eq(j([await can(p, 'take-snapshot'), await can(p, 'rewrite'), await can(p, 'show-snapshots'), await can(p, 'take-snapshots')]), j([false, false, true, false]), 'only “Show snapshots”');
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	await sleep(p, 400);
	t.ok((await shownText(p)).includes('It was raining.'), 'the snapshot reads');
	const buttons = await p.ev(`[...document.querySelectorAll(${j(DLG + ' .modal-setting-titlebar-actions button')})].map(b => b.textContent)`);
	t.eq(j(buttons), j(['Copy']), 'no “Bring back”');
	// (the notice that the binder can't be changed sits over that corner of the dialog)
	await p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
	await more(p);
	t.eq(j(await menuItems(p)), j(['Open to the right']), 'no naming, no deleting');
});

test('a “Snapshots” folder with notes in it is the writer’s own: shown as a folder, and nothing is kept there', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder(${j(SN)}); await app.vault.create(${j(SN + '/A chapter.md')}, 'Mine.'); })().then(() => 1)`);
	await sleep(p, 300);
	t.ok((await p.ev(`${B}.scenes(${file('The Lighthouse')}).map(f => f.path)`)).includes(SN + '/A chapter.md'), 'its note is a scene of the binder');
	t.eq(await p.ev(`${B}.isSnapshotsFolder(${file(SN)})`), false, 'not a snapshots folder');
	t.ok((await explorerRows(p, ['The Lighthouse'])).includes(SN), 'shown in the file explorer');
	await openNote(p, A);
	await run(p, 'take-snapshot');
	await sleep(p, 500);
	t.ok(/has notes in it, so snapshots can’t be kept there/.test(await notices(p)), 'refused, with why: ' + await notices(p));
	t.eq(await exists(p, DIR), false, 'nothing written');
	// Binders itself never makes a folder of that name at the top of a binder
	const made = await p.ev(`${B}.newFolder(${file('The Lighthouse')}, 0, 'Snapshots').then(f => f.name)`);
	t.ok(made !== 'Snapshots', 'a new folder asked to be “Snapshots” gets another name: ' + made);
});

// ---- Rewrite ----

test('Rewrite, from this text: a snapshot with the name given; the note as it was, open to write in', async (p, h, t) => {
	await write(p, A, DRAFT);
	const before = await texts(p);
	await cardMenu(p, A);
	await snapMenu(p, 'Rewrite...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	t.eq(await p.ev(`document.querySelector('.modal .modal-title').textContent`), 'Rewrite “Arrival”', 'the dialog');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.modal .modal-button-container button')].map(b => b.textContent)`)), j(['Start from this text', 'Start from a blank page', 'Cancel']), 'its buttons');
	// a name a file can't have: refused, nothing done
	await typeInto(p, 'what?');
	await press(p, '.modal button', 'Start from this text');
	t.ok(/can’t contain/.test(await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent ?? ''`)), 'a bad name is refused in the dialog');
	t.eq(await exists(p, DIR), false, 'nothing taken');
	await p.ev(`(() => { const i = document.querySelector('.modal .binders-ask input'); i.focus(); i.select(); return 1; })()`);
	await typeInto(p, 'First draft');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(DIR)})`);
	await sleep(p, 700);
	const files = await list(p);
	t.ok(files.length === 1 && / First draft\.snapshot$/.test(files[0]), 'one snapshot, named: ' + files.join(', '));
	t.eq(await textOf(p, `${DIR}/${files[0]}`), DRAFT, 'with the text');
	same(t, before, await texts(p));
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), A, 'the note is open');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-snapshot').length`), 0, 'no pane beside it: the text is all there');
	t.ok(/Took a snapshot of “Arrival”, named “First draft”\./.test(await notices(p)), await notices(p));
});

test('Rewrite, from a blank page, with the note open: emptied through the editor, Undo brings it back, the old text beside it', async (p, h, t) => {
	await write(p, A, DRAFT);
	const before = await texts(p);
	await openNote(p, A);
	await run(p, 'rewrite');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await press(p, '.modal button', 'Start from a blank page');
	await until(p, `app.workspace.getLeavesOfType('binders-snapshot').length === 1`);
	await sleep(p, 700);
	const files = await list(p);
	t.eq(files.length, 1, 'one snapshot');
	t.eq(await textOf(p, `${DIR}/${files[0]}`), DRAFT, 'holding the text that was there');
	t.eq(await read(p, A), FRONT, 'the note on disk: its properties, byte for byte, and no text');
	same(t, before, await texts(p), { skip: [A] });
	// the snapshot shows beside the note, and can't be typed in
	const pane = await p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-snapshot')[0], el = l.view.contentEl; return { text: el.innerText, editable: !!el.querySelector('[contenteditable=true], textarea, input'), beside: l.getRoot() === app.workspace.rootSplit && l.parent !== app.workspace.getLeavesOfType('markdown')[0].parent, title: l.getDisplayText() }; })()`);
	t.ok(pane.text.includes('It was raining.') && pane.text.includes('new assistant'), 'the old text is beside it: ' + j(pane.text.slice(0, 60)));
	t.ok(!pane.editable && pane.beside, 'in a pane of its own, read only');
	t.ok(/^Arrival: /.test(pane.title), 'titled for the note: ' + pane.title);
	t.eq(await p.ev(`app.workspace.activeEditor?.file?.path`), A, 'the keyboard is in the note');
	// one Undo in the note's editor takes the blank page back
	await p.ev(`(() => { const ed = ${editor(A)}; ed.undo(); return 1; })()`);
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s.length > ${FRONT.length})`);
	t.eq(await read(p, A), FRONT + DRAFT, 'Undo: the note is whole again');
	t.ok(/A blank page for “Arrival”\. Its text is kept as a snapshot\./.test(await notices(p)), await notices(p));
});

test('Rewrite, from a blank page, with the note closed: one checked write; an empty note has nothing to rewrite', async (p, h, t) => {
	await write(p, A, DRAFT);
	const before = await texts(p);
	await cardMenu(p, A);
	await snapMenu(p, 'Rewrite...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await press(p, '.modal button', 'Start from a blank page');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT)})`);
	await sleep(p, 600);
	t.eq(await read(p, A), FRONT, 'properties byte for byte, no text');
	t.eq(await textOf(p, `${DIR}/${(await list(p))[0]}`), DRAFT, 'the text is in the snapshot');
	same(t, before, await texts(p), { skip: [A] });
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), A, 'the note is open to write in');
	// again on the page that's now blank: nothing to keep, nothing done
	await run(p, 'rewrite');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await press(p, '.modal button', 'Start from a blank page');
	await sleep(p, 500);
	t.eq((await list(p)).length, 1, 'no second snapshot');
	t.ok(/the page is blank already/.test(await notices(p)), await notices(p));
});

test('Rewrite in the manuscript: the section is emptied through its own editor, and Undo there brings the text back', async (p, h, t) => {
	await write(p, A, DRAFT);
	const before = await texts(p);
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene .cm-content[contenteditable=true]').length >= 3`, 8000);
	const SCENE = `[...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title')?.textContent === 'Arrival')`;
	const at = await p.ev(`(() => { const r = ${SCENE}.querySelector('.cm-content .cm-line').getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
	await p.click(at.x, at.y);
	await run(p, 'rewrite');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await press(p, '.modal button', 'Start from a blank page');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT)})`);
	await sleep(p, 500);
	t.eq(await read(p, A), FRONT, 'the note on disk is emptied, its properties as they were');
	t.eq(await textOf(p, `${DIR}/${(await list(p))[0]}`), DRAFT, 'the text is in the snapshot');
	t.eq(await p.ev(`${SCENE}.querySelector('.cm-content').innerText.trim()`), '', 'the section is blank');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').length`), 0, 'no tab was opened over the manuscript');
	// Undo in that section's editor
	t.eq(await p.ev(`document.activeElement?.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), 'Arrival', 'the cursor is back in the section');
	await p.key('z', 'ctrl');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s.length > ${FRONT.length})`, 5000);
	t.eq(await read(p, A), FRONT + DRAFT, 'Undo: whole again');
	same(t, before, await texts(p));
});

// ---- bringing one back ----

test('bring back with the note closed: no question; the text it replaces is kept first; properties byte for byte', async (p, h, t) => {
	await write(p, A, LATER);
	const first = await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	const before = await texts(p);
	await dialog(p);
	t.eq(j((await rows(p)).map((r) => r.split(' / ')[0])), j(['The note now', 'First draft']), 'the note now, then its snapshots');
	await pick(p, 'First draft');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + DRAFT)})`);
	t.eq(await read(p, A), FRONT + DRAFT, 'the note has the snapshot’s text, under its own properties');
	t.eq(await p.ev(`document.querySelectorAll('.modal-container').length`), 1, 'nothing was asked: only the dialog is open');
	await sleep(p, 400);
	const files = await list(p), kept = files.find((f) => / Before bringing back\.snapshot$/.test(f));
	t.ok(files.length === 2 && !!kept, 'a snapshot was taken first: ' + files.join(', '));
	t.eq(await textOf(p, `${DIR}/${kept}`), LATER, 'holding the text that was replaced, byte for byte');
	t.eq(await textOf(p, first), DRAFT, 'the snapshot brought back is as it was');
	same(t, before, await texts(p), { skip: [A] });
	t.ok(/Brought back the snapshot from Sep 12, 2026.*The text it replaced is kept as a snapshot\./.test(await notices(p)), await notices(p));
	t.eq(j((await rows(p)).map((r) => r.split(' / ')[0])), j(['The note now', 'Before bringing back', 'First draft']), 'the list shows it, newest first');
	// the note has this text now: nothing to bring back
	t.ok(await p.ev(`[...document.querySelectorAll(${j(DLG + ' .modal-setting-titlebar-actions button')})].find(b => b.textContent === 'Bring back').disabled`), '“Bring back” is off for the text the note has');
	// and back again: the text it replaces is in a snapshot already, word for word, so none is taken
	await pick(p, 'Before bringing back');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + LATER)})`);
	await sleep(p, 300);
	t.eq((await list(p)).length, 2, 'no third snapshot of a text that’s kept already');
});

test('bring back with the note open: through its editor, one Undo takes it back', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await openNote(p, A);
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	await sleep(p, 300);
	await pick(p, 'First draft');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + DRAFT)})`);
	t.eq(await p.ev(`${editor(A)}.getValue()`), FRONT + DRAFT, 'the editor shows the text brought back');
	await closeAll(p);
	await p.ev(`(() => { ${editor(A)}.undo(); return 1; })()`);
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + LATER)})`);
	t.eq(await read(p, A), FRONT + LATER, 'Undo: the text that was there');
	t.eq(await textOf(p, `${DIR}/${(await list(p)).find((f) => /Before bringing back/.test(f))}`), LATER, 'and it’s in a snapshot besides');
});

test('an edit made elsewhere between reading and writing: refused, and nothing is lost (note closed, then open)', async (p, h, t) => {
	const OUTSIDE = 'Written by another program, just now.\n';
	for (const open of [false, true]) {
		await write(p, A, LATER);
		const first = await seed(p, DIR, `2026-09-12 09.15.4${open ? 1 : 0} First draft`, DRAFT);
		// the moment between: right after the snapshot of the current text is on disk, the note changes
		await p.ev(`(() => { const v = app.vault, create = v.create; window.__hooked = 0; v.create = async function (path, data) { const f = await create.call(this, path, data); if (path.endsWith('Before bringing back.snapshot')) { window.__hooked++; ${open ? `const ed = ${editor(A)}; ed.replaceRange(${j(OUTSIDE)}, ed.offsetToPos(${FRONT.length}), ed.offsetToPos(ed.getValue().length));` : `await v.adapter.write(${j(A)}, ${j(FRONT + OUTSIDE)}); await new Promise(r => setTimeout(r, 400));`} } return f; }; window.__unhook = () => { v.create = create; }; return 1; })()`);
		try {
			if (open) { await openNote(p, A); await run(p, 'show-snapshots'); await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`); await sleep(p, 300); }
			else await dialog(p);
			await pick(p, 'First draft');
			await button(p, 'Bring back');
			await until(p, `window.__hooked === 1`);
			await sleep(p, 900);
			t.ok(/The note was changed meanwhile, so it was left as it is\./.test(await notices(p)), `${open ? 'open' : 'closed'}: refused, with why: ` + await notices(p));
			if (open) await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.save().then(() => 1)`);
			t.eq(bodyOf(await read(p, A)), OUTSIDE, `${open ? 'open' : 'closed'}: the note has what was written meanwhile, not the snapshot’s text`);
			t.eq(frontOf(await read(p, A)), FRONT, 'its properties as they were');
			const kept = (await list(p)).filter((f) => /Before bringing back/.test(f));
			t.eq(kept.length, 1, 'the snapshot taken first is there');
			t.eq(await textOf(p, `${DIR}/${kept[0]}`), LATER, 'with the text the note had');
			t.eq(await textOf(p, first), DRAFT, 'and the snapshot asked for is as it was');
		} finally { await p.ev(`(() => { window.__unhook?.(); return 1; })()`); }
		await closeAll(p);
		await p.ev(`(async () => { app.workspace.getLeavesOfType('markdown').forEach(l => l.detach()); const d = ${file(SN)}; if (d) await app.vault.delete(d, true); })().then(() => 1)`);
		await sleep(p, 300);
	}
});

test('bring back in the manuscript: through the section’s own editor, and Undo there takes it back', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	const before = await texts(p);
	await openView(p, L + 'Part One');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene .cm-content[contenteditable=true]').length >= 3`, 8000);
	const SCENE = `[...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title')?.textContent === 'Arrival')`;
	const at = await p.ev(`(() => { const r = ${SCENE}.querySelector('.cm-content .cm-line').getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
	await p.click(at.x, at.y);
	t.ok(await can(p, 'show-snapshots'), 'the command is there for the section the cursor is in');
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	await sleep(p, 300);
	await pick(p, 'First draft');
	await button(p, 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + DRAFT)})`);
	t.eq(await read(p, A), FRONT + DRAFT, 'the note on disk has the snapshot’s text, its properties as they were');
	t.ok((await p.ev(`${SCENE}.querySelector('.cm-content').innerText`)).includes('It was raining.'), 'and so has its section');
	t.eq(await textOf(p, `${DIR}/${(await list(p)).find((f) => /Before bringing back/.test(f))}`), LATER, 'the text it replaced is in a snapshot');
	await p.key('Escape');
	await sleep(p, 400);
	await p.ev(`(() => { ${SCENE}.querySelector('.cm-content').focus(); return 1; })()`);
	await p.key('z', 'ctrl');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + LATER)})`, 5000);
	t.eq(await read(p, A), FRONT + LATER, 'Undo in the section: the text that was there');
	same(t, before, await texts(p));
});

// ---- naming and deleting ----

test('naming a snapshot renames its file and nothing else; deleting one asks first', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40', DRAFT);
	await seed(p, DIR, '2026-09-20 11.05.12 Second', 'Another text.\n');
	await dialog(p);
	await pick(p, 'Sep 12, 2026');
	await more(p);
	t.eq(j(await menuItems(p)), j(['Name this snapshot...', 'Open to the right', 'Delete snapshot']), 'its menu');
	await clickMenu(p, 'Name this snapshot...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await typeInto(p, 'a:b');
	await p.key('Enter');
	await sleep(p, 250);
	t.ok(/can’t contain/.test(await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent ?? ''`)), 'a name a file can’t have is refused');
	await p.ev(`(() => { const i = document.querySelector('.modal .binders-ask input'); i.focus(); i.select(); return 1; })()`);
	await typeInto(p, 'First draft');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(DIR + '/2026-09-12 09.15.40 First draft.snapshot')})`);
	t.eq(j(await list(p)), j(['2026-09-12 09.15.40 First draft.snapshot', '2026-09-20 11.05.12 Second.snapshot']), 'the file is renamed, its time kept');
	t.eq(await textOf(p, DIR + '/2026-09-12 09.15.40 First draft.snapshot'), DRAFT, 'its text is untouched');
	await until(p, `document.querySelector(${j(DLG + ' .binders-snapshots-bar .modal-setting-title')}).textContent.startsWith('First draft')`);
	t.ok((await shownTitle(p)).startsWith('First draft · Sep 12, 2026'), 'the dialog follows: ' + await shownTitle(p));
	// delete: asks, and Cancel keeps it
	await more(p);
	await clickMenu(p, 'Delete snapshot');
	await until(p, `[...document.querySelectorAll('.modal .modal-title')].some(e => e.textContent === 'Delete snapshot')`);
	t.ok(/Delete the snapshot of “Arrival” from Sep 12, 2026.*“First draft”\?/.test(await p.ev(`[...document.querySelectorAll('.modal')].pop().querySelector('p').textContent`)), 'says which');
	await press(p, '.modal button', 'Cancel');
	t.eq((await list(p)).length, 2, 'Cancel: still there');
	await more(p);
	await clickMenu(p, 'Delete snapshot');
	await until(p, `[...document.querySelectorAll('.modal .modal-title')].some(e => e.textContent === 'Delete snapshot')`);
	await press(p, '.modal button', 'Delete');
	await until(p, `app.vault.adapter.exists(${j(DIR + '/2026-09-12 09.15.40 First draft.snapshot')}).then(x => !x)`);
	t.eq(j(await list(p)), j(['2026-09-20 11.05.12 Second.snapshot']), 'gone from the folder; the other stays');
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 2`);
	t.eq(j((await rows(p)).map((r) => r.split(' / ')[0])), j(['The note now', 'Second']), 'and from the list');
	t.eq(await read(p, A), FRONT + LATER, 'the note is untouched');
});

// ---- following the note ----

test('snapshots follow a note that’s renamed or moved, and a folder that’s renamed; the binder note never lists them', async (p, h, t) => {
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await seed(p, SN + '/Part One/The keeper', '2026-09-20 11.05.12', 'Keeper text.\n', 'Part One/The keeper');
	await p.ev(`app.fileManager.renameFile(${file(A)}, ${j(L + 'Part One/Landing.md')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, SN + '/Part One/Landing')), j(['2026-09-12 09.15.40 First draft.snapshot']), 'renamed: its snapshots are under the new name');
	t.eq(await exists(p, DIR), false, 'and no longer under the old');
	t.eq(await textOf(p, SN + '/Part One/Landing/2026-09-12 09.15.40 First draft.snapshot'), DRAFT, 'the file itself is untouched (it still says what it was a snapshot of then)');
	// moved to another folder of the binder, as a drag does
	await p.ev(`${B}.move(${file(L + 'Part One/Landing.md')}, ${file(L + 'Part Two')}, 0).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, SN + '/Part Two/Landing')), j(['2026-09-12 09.15.40 First draft.snapshot']), 'moved: they went along');
	t.eq(await exists(p, SN + '/Part One/Landing'), false, 'nothing left behind');
	// a folder renamed: everything under it, as one
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One')}, ${j(L + 'Part 1')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, SN + '/Part 1/The keeper')), j(['2026-09-20 11.05.12.snapshot']), 'a folder renamed: its notes’ snapshots are under its new name');
	t.eq(await exists(p, SN + '/Part One'), false, 'the old folder of them is gone');
	const c = await contents(p);
	t.ok(!c.some((x) => /Snapshots/.test(x)), 'the binder note’s list has no snapshots in it: ' + c.join(', '));
	t.ok(c.includes('Part Two/Landing') && c.includes('Part 1/The keeper'), 'and has the notes where they are now');
	t.eq(await exists(p, L + 'Part 1/Part One.md'), false, 'no stray files');
});

test('a note and a folder of one name share a folder of snapshots: each takes only its own when it’s renamed', async (p, h, t) => {
	// "Part One/Arrival.md" and a folder "Part One/Arrival/" with a note in it
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + 'Part One/Arrival')}); await app.vault.create(${j(L + 'Part One/Arrival/On the jetty.md')}, 'Jetty text.'); })().then(() => 1)`);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await seed(p, DIR + '/On the jetty', '2026-09-13 10.00.00', 'Jetty, earlier.\n', 'Part One/Arrival/On the jetty');
	// the note is renamed: its files go, the folder's stay
	await p.ev(`app.fileManager.renameFile(${file(A)}, ${j(L + 'Part One/Landing.md')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, SN + '/Part One/Landing')), j(['2026-09-12 09.15.40 First draft.snapshot']), 'the note’s snapshots follow the note');
	t.eq(j(await list(p, DIR + '/On the jetty')), j(['2026-09-13 10.00.00.snapshot']), 'the folder’s notes’ stay with the folder');
	t.eq(j(await list(p)), '[]', 'and none of the note’s are left');
	// back, then the folder is renamed: its notes' go, the note's stay
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Landing.md')}, ${j(A)}).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p)), j(['2026-09-12 09.15.40 First draft.snapshot']), 'back again, beside the folder’s');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Arrival')}, ${j(L + 'Part One/Chapter one')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, SN + '/Part One/Chapter one/On the jetty')), j(['2026-09-13 10.00.00.snapshot']), 'the folder’s notes’ snapshots follow the folder');
	t.eq(j(await list(p)), j(['2026-09-12 09.15.40 First draft.snapshot']), 'the note’s stay with the note');
	t.eq(await textOf(p, DIR + '/2026-09-12 09.15.40 First draft.snapshot'), DRAFT, 'whole');
});

test('a Longform project made a binder with its groups as folders: the scenes that go into folders take their snapshots', async (p, h, t) => {
	const LF = 'Longform demo';
	await seed(p, LF + '/Snapshots/Ticket office', '2026-09-12 09.15.40', 'Ticket office, earlier.\n', 'Ticket office');
	await seed(p, LF + '/Snapshots/Island', '2026-09-12 09.15.41', 'Island, earlier.\n', 'Island');
	const before = await texts(p);
	await p.ev(`${B}.convertToBinder(${B}.binderOf(${file(LF)}), { folders: true, removeLongform: false }).then(() => 1)`);
	await until(p, `${B}.binderOf(${file(LF)})?.kind === 'binder'`);
	await settle(p);
	const now = await p.ev(`${B}.scenes(${file(LF)}).map(f => f.path)`);
	const office = now.find((x) => /Ticket office\.md$/.test(x)), island = now.find((x) => /Island\.md$/.test(x));
	t.ok(office && office.split('/').length === 3, 'the grouped scene is in a folder now: ' + office);
	const dirOf = (path) => LF + '/Snapshots/' + path.slice(LF.length + 1, -3);
	t.eq(j(await list(p, dirOf(office))), j(['2026-09-12 09.15.40.snapshot']), 'its snapshots went with it: ' + dirOf(office));
	t.eq(j(await list(p, dirOf(island))), j(['2026-09-12 09.15.41.snapshot']), 'a scene that stayed keeps its own where they were');
	t.ok(!now.some((x) => /Snapshots/.test(x)), 'and the binder has no scene from its snapshots: ' + now.join(', '));
	t.eq(Object.keys(before).filter((k) => /Longform demo\/(?!Index)/.test(k)).map((k) => before[k]).sort().join('|'), Object.entries(await texts(p)).filter(([k]) => /Longform demo\/(?!Index)/.test(k)).map(([, v]) => v).sort().join('|'), 'no scene’s text changed');
});

test('group and ungroup carry snapshots along; a duplicate starts with none', async (p, h, t) => {
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	const made = await p.ev(`${B}.group([${file(A)}], 'Chapter').then(f => f.path)`);
	await settle(p);
	t.eq(made, L + 'Part One/Chapter', 'grouped');
	t.eq(j(await list(p, SN + '/Part One/Chapter/Arrival')), j(['2026-09-12 09.15.40 First draft.snapshot']), 'into a new folder: its snapshots too');
	await p.ev(`${B}.ungroup(${file(made)}).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p)), j(['2026-09-12 09.15.40 First draft.snapshot']), 'and out again');
	const copy = await p.ev(`${B}.duplicate(${file(A)}).then(f => f.path)`);
	await settle(p);
	t.eq(copy, L + 'Part One/Arrival 2.md', 'a copy');
	t.eq(await exists(p, SN + '/Part One/Arrival 2'), false, 'has no snapshots of its own');
	t.eq((await list(p)).length, 1, 'the original keeps its one');
});

test('a deleted note’s snapshots stay, are listed as a gone note’s, and can be given to another note', async (p, h, t) => {
	const first = await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await seed(p, SN + '/Part One/The keeper', '2026-09-20 11.05.12', 'Keeper text.\n', 'Part One/The keeper');
	await p.ev(`app.vault.delete(${file(A)}).then(() => 1)`);
	await settle(p);
	t.eq(await textOf(p, first), DRAFT, 'deleted: its snapshot is where it was, whole');
	await openView(p);
	const dots = await p.at(MORE);
	await p.click(dots.x, dots.y);
	await sleep(p, 250);
	t.ok((await menuItems(p)).includes('Snapshots of notes that are gone...'), 'the binder’s menu offers them: ' + (await menuItems(p)).join(', '));
	await clickMenu(p, 'Snapshots of notes that are gone...');
	await until(p, `!!document.querySelector('.modal.binders-leftovers .setting-item')`);
	const listed = await p.ev(`[...document.querySelectorAll('.modal.binders-leftovers .setting-item')].map(s => s.querySelector('.setting-item-name').textContent + ': ' + s.querySelector('.setting-item-description').textContent)`);
	t.eq(j(listed), j(['Part One/Arrival: 1 snapshot']), 'only the gone note’s');
	// read them
	await press(p, '.modal.binders-leftovers button', 'Show');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	await sleep(p, 300);
	t.eq(j((await rows(p)).map((r) => r.split(' / ')[0])), j(['First draft']), 'its snapshots, with no “note now”');
	t.ok((await shownText(p)).includes('It was raining.'), 'to read');
	t.eq(j(await p.ev(`[...document.querySelectorAll(${j(DLG + ' .modal-setting-titlebar-actions button')})].map(b => b.textContent)`)), j(['Copy']), 'nothing to bring back to');
	await p.key('Escape');
	await sleep(p, 300);
	// give them to a note that's there
	await press(p, '.modal.binders-leftovers button', 'Give to a note...');
	await until(p, `!!document.querySelector('.prompt input')`);
	await typeInto(p, 'keeper');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(DIR)}).then(x => !x)`);
	await sleep(p, 400);
	t.eq(j(await list(p, SN + '/Part One/The keeper')), j(['2026-09-12 09.15.40 First draft.snapshot', '2026-09-20 11.05.12.snapshot']), 'they’re among that note’s now, beside its own');
	t.ok(/“The keeper” now has the snapshot of “Arrival”\./.test(await notices(p)), await notices(p));
	t.ok(/Every snapshot in “The Lighthouse” belongs to a note that’s there\./.test(await p.ev(`document.querySelector('.modal.binders-leftovers').textContent`)), 'none left over');
});

test('split: the snapshots stay with the first half; merge: the first note keeps its own, the others’ stay behind', async (p, h, t) => {
	await write(p, A, 'First half.\n\nSecond half.\n');
	await seed(p, DIR, '2026-09-12 09.15.40 Whole', 'First half.\n\nSecond half.\n');
	await seed(p, SN + '/Part One/The keeper', '2026-09-20 11.05.12', 'Keeper text.\n', 'Part One/The keeper');
	await openNote(p, A);
	await p.ev(`(() => { const ed = ${editor(A)}, i = ed.getValue().indexOf('Second half.'); ed.focus(); ed.setCursor(ed.offsetToPos(i)); return 1; })()`);
	await run(p, 'split-scene');
	await until(p, `!!${file(L + 'Part One/Arrival 2.md')}`);
	await settle(p);
	t.eq(j(await list(p)), j(['2026-09-12 09.15.40 Whole.snapshot']), 'split: the first half keeps the snapshots');
	t.eq(await exists(p, SN + '/Part One/Arrival 2'), false, 'the new note has none');
	// merge the keeper into Arrival
	await p.ev(`app.workspace.getLeavesOfType('markdown').forEach(l => l.detach())`);
	await openView(p, L + 'Part One');
	const a = await p.at(card(A)), k = await p.at(card(K));
	await p.click(a.x, a.y - 30);
	await p.click(k.x, k.y - 30, { modifiers: 2 });
	await p.right(k.x, k.y - 30);
	await sleep(p, 250);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal button.mod-cta')`);
	await press(p, '.modal button', 'Merge');
	await until(p, `!${file(K)}`);
	await settle(p);
	t.eq(j(await list(p)), j(['2026-09-12 09.15.40 Whole.snapshot']), 'merge: the note that stays keeps its own');
	t.eq(j(await list(p, SN + '/Part One/The keeper')), j(['2026-09-20 11.05.12.snapshot']), 'the merged note’s stay where they were');
});

test('a note moved to another binder takes its snapshots there; moved out of every binder, they stay, and it says so', async (p, h, t) => {
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await seed(p, SN + '/Part One/The keeper', '2026-09-20 11.05.12', 'Keeper text.\n', 'Part One/The keeper');
	await p.ev(`(async () => { await app.vault.createFolder('Other book'); await app.vault.create('Other book/Other book.md', '---\\nbinder: 1\\ncontents: []\\n---\\n'); })().then(() => 1)`);
	await until(p, `!!${B}.binderOf('Other book')`);
	await p.ev(`app.fileManager.renameFile(${file(A)}, 'Other book/Arrival.md').then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, 'Other book/Snapshots/Arrival')), j(['2026-09-12 09.15.40 First draft.snapshot']), 'in the other binder’s Snapshots');
	t.eq(await exists(p, DIR), false, 'gone from the first');
	t.eq(await textOf(p, 'Other book/Snapshots/Arrival/2026-09-12 09.15.40 First draft.snapshot'), DRAFT, 'whole');
	t.eq(j(await p.ev(`${B}.scenes(${file('Other book')}).map(f => f.path)`)), j(['Other book/Arrival.md']), 'the other binder’s scenes: the note, not its snapshots');
	// out of every binder
	await p.ev(`app.fileManager.renameFile(${file(K)}, 'The keeper.md').then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, SN + '/Part One/The keeper')), j(['2026-09-20 11.05.12.snapshot']), 'its snapshots stay in the binder it left');
	t.ok(/“The keeper” has left “The Lighthouse”\. Its snapshots stay there\./.test(await notices(p)), await notices(p));
	await p.ev(`(async () => { for (const n of ['The keeper.md', 'Other book']) { const f = app.vault.getAbstractFileByPath(n); if (f) await app.vault.delete(f, true); } })().then(() => 1)`);
});

test('a Longform project: snapshots in its scene folder, its index note untouched, a renamed scene followed', async (p, h, t) => {
	const LF = 'Longform demo', INDEX = LF + '/Index.md', index = await read(p, INDEX), scenes = await p.ev(`${B}.scenes(${file(LF)}).map(f => f.path)`);
	const harbor = await read(p, LF + '/Harbor.md');
	await openNote(p, LF + '/Harbor.md');
	t.ok(await can(p, 'take-snapshot'), 'a scene of a Longform project has snapshots');
	await run(p, 'take-snapshot');
	await until(p, `app.vault.adapter.exists(${j(LF + '/Snapshots/Harbor')})`);
	await sleep(p, 300);
	const files = await list(p, LF + '/Snapshots/Harbor');
	t.eq(files.length, 1, 'in Snapshots/Harbor in the scene folder');
	t.eq(await textOf(p, `${LF}/Snapshots/Harbor/${files[0]}`), bodyOf(harbor), 'its text');
	t.eq(await read(p, INDEX), index, 'the index note is byte for byte what it was');
	t.eq(j(await p.ev(`${B}.scenes(${file(LF)}).map(f => f.path)`)), j(scenes), 'the project’s scenes are the same');
	t.eq(await p.ev(`${B}.isSnapshotsFolder(${file(LF + '/Snapshots')})`), true, 'the folder is the project’s snapshots');
	t.ok(!(await explorerRows(p, [LF])).some((r) => /Snapshots/.test(r)), 'never in the file explorer');
	// a note the project ignores isn't a scene: no snapshots
	await openNote(p, LF + '/Notes on ferries.md');
	t.eq(await can(p, 'take-snapshot'), false, 'a note Longform leaves out has none');
	// renamed (Longform isn't running here: Binders follows the name)
	await p.ev(`app.fileManager.renameFile(${file(LF + '/Harbor.md')}, ${j(LF + '/Harbour.md')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, LF + '/Snapshots/Harbour')), j(files), 'renamed: its snapshots follow');
	t.eq(await exists(p, LF + '/Snapshots/Harbor'), false, 'none left under the old name');
	await p.ev(`app.fileManager.renameFile(${file(LF + '/Harbour.md')}, ${j(LF + '/Harbor.md')}).then(() => 1)`);
	await settle(p);
});

// ---- never in the way ----

test('never in the file explorer: with binder order on or off, and with “Detect all file extensions” on', async (p, h, t) => {
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	const open = ['The Lighthouse', L + 'Part One', SN, SN + '/Part One', DIR];
	const none = async (why) => { const r = await explorerRows(p, open); t.ok(r.includes(A) && !r.some((x) => /Snapshots/.test(x)), `${why}: no row for the folder or anything in it (${r.filter((x) => /Snapshots/.test(x)).join(', ')})`); };
	t.eq(await p.ev(`${PL}.explorer.status`), 'patched', 'the explorer patch is on');
	await none('by default');
	await p.ev(`(() => { app.vault.setConfig('showUnsupportedFiles', true); return 1; })()`);
	await sleep(p, 500);
	try {
		await none('with every kind of file shown');
		await setSettings(p, { orderExplorer: false });
		t.eq(await p.ev(`${PL}.explorer.status`), 'off', 'binder order off');
		await none('with binder order off');
	} finally {
		await p.ev(`(() => { app.vault.setConfig('showUnsupportedFiles', false); return 1; })()`);
		await setSettings(p, { orderExplorer: true });
	}
	await none('and back');
	// a snapshot taken while the explorer is open doesn't make a row either
	await openNote(p, K);
	await run(p, 'take-snapshot');
	await until(p, `app.vault.adapter.exists(${j(SN + '/Part One/The keeper')})`);
	await none('after taking one');
});

test('without the explorer’s internals the folder shows as a plain folder, its files don’t; nothing else breaks', async (p, h, t) => {
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
	await p.ev(`(async () => { await app.plugins.disablePlugin('binders'); await new Promise(r => setTimeout(r, 400)); ${EXP}.getSortedFolderItems = null; await app.plugins.enablePlugin('binders'); })().then(() => 1)`);
	try {
		for (let i = 0; i < 30 && (await p.ev(`${PL}?.explorer?.status ?? 'none'`)) === 'waiting'; i++) await sleep(p, 100);
		t.eq(await p.ev(`${PL}.explorer.status`), 'missing', 'the patch can’t be made');
		await p.ev(`(() => { delete ${EXP}.getSortedFolderItems; ${EXP}.requestSort?.(); return 1; })()`);
		await p.ev(`${B}.settled.then(() => 1)`);
		const r = await explorerRows(p, ['The Lighthouse', SN, SN + '/Part One', DIR]);
		t.ok(r.includes(SN) && r.includes(DIR), 'the folder and its folders show, as any folder does');
		t.ok(!r.some((x) => /\.snapshot$/.test(x)), 'the snapshot files don’t (Obsidian shows only kinds of file it opens)');
		t.eq(j(await p.ev(`${B}.scenes(${file('The Lighthouse')}).map(f => f.basename)`)), j(['Prologue', 'Arrival', 'The keeper', 'Storm warning', 'The wreck', 'Lights out', 'Epilogue']), 'the binder is as ever');
	} finally {
		await p.ev(`(async () => { delete ${EXP}.getSortedFolderItems; await app.plugins.disablePlugin('binders'); await app.plugins.enablePlugin('binders'); await ${PL}.binders.settled; })().then(() => 1)`);
		await sleep(p, 500);
	}
	t.eq(await p.ev(`${PL}.explorer.status`), 'patched', 'patched again');
	t.ok(!(await explorerRows(p, ['The Lighthouse'])).some((x) => /Snapshots/.test(x)), 'and hidden again');
});

test('never in search, the quick switcher, link suggestions, backlinks, tags or the graph’s data', async (p, h, t) => {
	// a word only a snapshot has, with a link and a tag in it
	const path = await seed(p, DIR, '2026-09-12 09.15.40 Quillfish draft', 'A quillfish on the bollard. [[Prologue]] and [[Epilogue]] #quilltag\n');
	await sleep(p, 600);
	const found = await p.ev(`(async () => {
		const out = {}, f = ${file(path)};
		out.isFile = !!f && f.extension === 'snapshot';
		out.markdown = app.vault.getMarkdownFiles().some(x => x.path.includes('/Snapshots/'));
		out.linkSources = Object.keys(app.metadataCache.resolvedLinks).filter(k => k.includes('/Snapshots/'));
		out.unresolved = Object.keys(app.metadataCache.unresolvedLinks).filter(k => k.includes('/Snapshots/'));
		out.backlinks = Object.entries(app.metadataCache.resolvedLinks).filter(([, to]) => to['The Lighthouse/Prologue.md']).map(([from]) => from).filter(k => k.includes('Snapshots'));
		out.tags = Object.keys(app.metadataCache.getTags()).filter(x => /quill/i.test(x));
		out.cache = JSON.stringify(app.metadataCache.getFileCache(f) ?? {});
		out.linkSuggestions = app.metadataCache.getLinkSuggestions().filter(s => s.path.includes('Snapshots')).map(s => s.path);
		const sw = app.internalPlugins.getPluginById('switcher').instance, modal = new sw.QuickSwitcherModal(app, sw.options);
		out.switcher = ['Quillfish', 'Snapshots', '2026-09-12', 'snapshot'].flatMap(q => modal.getSuggestions(q)).map(x => x.file?.path ?? '').filter(x => x.includes('Snapshots'));
		const gs = app.internalPlugins.getPluginById('global-search').instance;
		out.search = {};
		for (const q of ['quillfish', 'path:Snapshots', 'file:Quillfish', 'tag:#quilltag', 'file:snapshot']) {
			gs.openGlobalSearch(q);
			await new Promise(r => setTimeout(r, 1800));
			const view = app.workspace.getLeavesOfType('search')[0].view;
			out.search[q] = [...view.dom.resultDomLookup.keys()].map(x => x.path).filter(x => x.includes('Snapshots'));
		}
		gs.openGlobalSearch('supply boat');
		await new Promise(r => setTimeout(r, 1800));
		out.searchWorks = [...app.workspace.getLeavesOfType('search')[0].view.dom.resultDomLookup.keys()].map(x => x.path);
		return out;
	})()`);
	t.ok(found.isFile && !found.markdown, 'a snapshot is a file, and not a note');
	t.eq(j(found.linkSources.concat(found.unresolved, found.backlinks)), '[]', 'its links aren’t links: no backlinks, nothing in the graph’s data');
	t.eq(j(found.tags), '[]', 'its tags aren’t tags');
	t.ok(!/quill|Prologue/.test(found.cache), 'nothing of it is indexed: ' + found.cache);
	t.eq(j(found.linkSuggestions), '[]', 'not suggested for a link');
	t.eq(j(found.switcher), '[]', 'not in the quick switcher');
	t.eq(j(found.search), j({ quillfish: [], 'path:Snapshots': [], 'file:Quillfish': [], 'tag:#quilltag': [], 'file:snapshot': [] }), 'not in Obsidian’s search, by its text, its path, its name or its tag');
	t.ok(found.searchWorks.includes(A), 'while a note’s text is found as ever: ' + found.searchWorks.join(', '));
});

test('never in the binder: its order, its counts, the filter, a compile, or any mode', async (p, h, t) => {
	await openView(p);
	const words = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent`);
	const scenes = await p.ev(`${B}.scenes(${file('The Lighthouse')}).map(f => f.path)`);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT + '\nZebrawords zebrawords zebrawords.\n');
	await seed(p, SN + '/Prologue', '2026-09-12 09.15.41', 'Zebrawords in the prologue’s snapshot.\n', 'Prologue');
	await sleep(p, 500);
	t.eq(j(await p.ev(`${B}.scenes(${file('The Lighthouse')}).map(f => f.path)`)), j(scenes), 'the scenes are the same');
	t.ok(!(await p.ev(`${B}.orderedChildren(${file('The Lighthouse')}, { hidden: true }).map(f => f.name)`)).includes('Snapshots'), 'not among the binder’s items, hidden ones included');
	t.eq(await p.ev(`${B}.orderedChildren(${file(SN)})?.length ?? 0`), 0, 'and has no items of its own');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent`), words, 'the word count is the same: ' + words);
	for (const mode of ['corkboard', 'outliner', 'manuscript']) {
		await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
		await sleep(p, 900);
		const text = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view').innerText`);
		t.ok(!/Snapshots|Zebrawords|First draft/i.test(text) && /Prologue/.test(text), `${mode}: nothing of them shows`);
	}
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	// a move writes down the place of everything in the binder: not of the snapshots
	await p.ev(`${B}.moveDown(${file(L + 'Prologue.md')}).then(() => 1)`);
	await flush(p);
	await sleep(p, 300);
	const c = await contents(p);
	t.ok(c.length === 9 && !c.some((x) => /Snapshots/.test(x)), 'after a move, the list has the binder’s nine items and no snapshots: ' + c.join(', '));
	// compile: one note of the scenes' text
	await p.ev(`(() => { app.commands.executeCommandById('binders:compile'); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-compile, .binders-compile')`);
	await press(p, '.modal button', 'Compile');
	await until(p, `!!${file('The Lighthouse (compiled).md')}`);
	const out = await read(p, 'The Lighthouse (compiled).md');
	t.ok(!/Zebrawords|It was raining/.test(out) && /supply boat/.test(out), 'the compiled note has the notes’ text and no snapshot’s');
	await p.ev(`app.vault.delete(${file('The Lighthouse (compiled).md')}).then(() => 1)`);
});

// ---- the dialog ----

test('the dialog: newest first, read, show changes, copy, the keyboard; it wears Obsidian’s own look', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await seed(p, DIR, '2026-09-24 21.47.03', LATER.replace('quillfish', 'gull'), 'Part One/Arrival', '2026-09-24T21:47:03');
	await dialog(p);
	t.eq(await p.ev(`document.querySelector(${j(DLG)}).closest('.modal-container').querySelector('.modal-title').textContent`), 'Snapshots of “Arrival”', 'its title');
	const r = await rows(p);
	t.eq(j(r.map((x) => x.split(' / ')[0])), j(['The note now', 'Sep 24, 2026, 9:47 PM', 'First draft']), 'the note now, then newest first: a name, or else when');
	t.ok(/^\d+ words$/.test(r[0].split(' / ')[1]) && /^Sep 12, 2026, 9:15 AM · \d+ words$/.test(r[2].split(' / ')[1]), 'each with its words: ' + r.join(' | '));
	t.ok((await shownTitle(p)).startsWith('Sep 24, 2026'), 'the newest is shown first');
	t.ok(await p.ev(`document.querySelector(${j(DLG)}).classList.contains('mod-sidebar-layout') && !document.querySelector(${j(DLG)}).classList.contains('is-plain')`), 'in Obsidian’s File recovery layout');
	const box = await p.ev(`(() => { const s = document.querySelector(${j(DLG + ' .binders-snapshots-side')}).getBoundingClientRect(), c = document.querySelector(${j(DLG + ' .binders-snapshots-pane')}).getBoundingClientRect(); return { side: Math.round(s.width), left: s.right <= c.left + 1, wide: c.width > 400 }; })()`);
	t.ok(box.side === 250 && box.left && box.wide, 'the list at the side, the text beside it: ' + j(box));
	// reading
	await pick(p, 'First draft');
	t.ok((await shownText(p)).includes('It was raining.') && !(await shownText(p)).includes('snapshot-of'), 'the text, as a note reads, without its two properties');
	// what changed
	await press(p, DLG + ' .modal-setting-titlebar-toggle', 'Show changes');
	await until(p, `!!document.querySelector(${j(DLG + ' .diff-view .diff-line')})`);
	const diff = await p.ev(`(() => { const d = document.querySelector(${j(DLG + ' .binders-snapshots-diff')}); const bg = (e) => getComputedStyle(e).backgroundColor; return { rows: [...d.querySelectorAll('.diff-view .diff-line')].map(e => (e.classList.contains('mod-left') ? '-' : e.classList.contains('mod-right') ? '+' : '=') + [...e.children].map(s => s.classList.contains('diff-changed') ? '[' + s.textContent + ']' : s.textContent).join('')), key: d.querySelector('.binders-snapshots-key').textContent, left: bg(d.querySelector('.diff-line.mod-left')), right: bg(d.querySelector('.diff-line.mod-right')), plain: bg(d.querySelector('.diff-view .diff-line:not(.mod-left):not(.mod-right)')), text: document.querySelector(${j(DLG + ' .binders-snapshots-text')}).isShown() }; })()`);
	t.eq(diff.key, 'From this snapshot to the note now: taken out put in', 'which color is which is said');
	t.eq(j(diff.rows), j([
		'-The supply boat left Mara on the jetty with two cases and a letter she had not opened. [It was raining.]',
		'+The supply boat left Mara on the jetty with two cases and a letter she had not opened.',
		'+She had been told there would be someone to meet her. There was a quillfish on the bollard, and nobody else.',
		'-The island was smaller than [she] had [imagined. There was a] cottage beside the lighthouse [with one window] lit.',
		'+The island was smaller than [the chart] had [promised. One window of the] cottage beside the lighthouse [was] lit.',
		'="You\'ll be the new assistant," he said.',
	]), 'paragraph by paragraph, the changed words marked');
	t.ok(diff.left !== diff.right && diff.left !== diff.plain && diff.right !== diff.plain && !diff.text, 'taken out and put in are tinted apart: ' + j(diff));
	// copy: the snapshot's text as Markdown
	await p.ev(`(() => { window.__copied = null; navigator.clipboard.writeText = async (s) => { window.__copied = s; }; return 1; })()`);
	await button(p, 'Copy');
	t.eq(await p.ev(`window.__copied`), DRAFT, 'Copy gives the snapshot’s text');
	// the keyboard: arrows move through the list, showing each
	await p.ev(`(() => { [...document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})].pop().focus(); return 1; })()`);
	await p.key('ArrowUp');
	await sleep(p, 300);
	t.ok((await shownTitle(p)).startsWith('Sep 24, 2026'), 'Arrow up: the one above is shown');
	t.eq(await p.ev(`document.activeElement.getAttribute('aria-selected')`), 'true', 'and has the focus, marked as chosen');
	await p.key('ArrowUp');
	await sleep(p, 300);
	t.eq(await shownTitle(p), 'The note now', 'up again: the note now');
	t.eq(j(await p.ev(`[...document.querySelectorAll(${j(DLG + ' .modal-setting-titlebar-actions button')})].map(b => b.textContent)`)), j(['Copy', 'Take a snapshot']), 'which can be copied, or snapshotted');
	await p.key('Escape');
	await sleep(p, 300);
	t.eq(await p.ev(`document.querySelectorAll(${j(DLG)}).length`), 0, 'Escape closes it');
	t.eq(await read(p, A), FRONT + LATER, 'looking changed nothing');
});

test('without Obsidian’s classes the dialog lays itself out the same way (the fallback look)', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await dialog(p);
	t.ok(!(await p.ev(`document.querySelector(${j(DLG)}).classList.contains('is-plain')`)), 'this Obsidian has the look: Binders’ own isn’t used');
	// as if a later Obsidian had renamed its classes: take them off, and put ours on
	await p.ev(`(() => { const m = document.querySelector(${j(DLG)}); const strip = ['mod-sync-history', 'mod-sidebar-layout', 'modal-sidebar', 'mod-history', 'modal-sidebar-inner', 'modal-sidebar-list', 'modal-sidebar-list-item', 'file-recovery-list-item-header', 'sync-history-content-container', 'sync-history-content', 'modal-setting-titlebar', 'sync-history-preview', 'sync-history-diff']; for (const c of strip) m.querySelectorAll('.' + c).forEach(e => e.classList.remove(c)); m.classList.remove('mod-sync-history', 'mod-sidebar-layout'); m.classList.add('is-plain'); return 1; })()`);
	await sleep(p, 300);
	await pick(p, 'First draft');
	const box = await p.ev(`(() => { const m = document.querySelector(${j(DLG)}), s = m.querySelector('.binders-snapshots-side').getBoundingClientRect(), c = m.querySelector('.binders-snapshots-pane').getBoundingClientRect(), bar = m.querySelector('.binders-snapshots-bar').getBoundingClientRect(), text = m.querySelector('.binders-snapshots-text').getBoundingClientRect(), act = m.querySelector('.binders-snapshots-item.is-active'); return { side: Math.round(s.width), beside: s.right <= c.left + 1 && Math.abs(s.top - c.top) < 2, wide: c.width > 400, barTop: bar.top <= text.top && bar.height < 80, textTall: text.height > 200, active: getComputedStyle(act).backgroundColor !== 'rgba(0, 0, 0, 0)' }; })()`);
	t.eq(j(box), j({ side: 250, beside: true, wide: true, barTop: true, textTall: true, active: true }), 'the list at the side, the text beside it, the bar above it, the chosen one marked');
	await p.ev(`(() => { const m = document.querySelector(${j(DLG)}); m.classList.remove('is-plain'); return 1; })()`);
});

test('the dialog follows the vault: a snapshot that arrives (a sync), one renamed, one removed, a conflict copy', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await dialog(p);
	t.eq((await rows(p)).length, 2, 'one snapshot');
	// written by another program, straight to the disk
	await writeRaw(p, DIR + '/2026-09-13 10.00.00 From the laptop.snapshot', '---\nsnapshot-of: "Part One/Arrival"\ntaken: 2026-09-13T10:00:00\n---\nSynced text.\n');
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 3`, 6000);
	t.eq(j((await rows(p)).map((r) => r.split(' / ')[0])), j(['The note now', 'From the laptop', 'First draft']), 'it’s listed, in its place by time');
	// a sync tool's conflict copies: they're more snapshots, each readable
	await writeRaw(p, DIR + '/2026-09-12 09.15.40 First draft.sync-conflict-20260914-101500-ABCDEFG.snapshot', '---\nsnapshot-of: "Part One/Arrival"\ntaken: 2026-09-12T09:15:40\n---\nThe other device’s text.\n');
	await writeRaw(p, DIR + '/First draft (conflicted copy).snapshot', 'No properties at all: the whole file is the text.\n');
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 5`, 6000);
	const names = (await rows(p)).map((r) => r.split(' / ')[0]);
	t.ok(names.includes('First draft.sync-conflict-20260914-101500-ABCDEFG') && names.includes('First draft (conflicted copy)'), 'conflict copies show as snapshots of their own: ' + names.join(' | '));
	await pick(p, 'First draft (conflicted copy)');
	t.ok((await shownText(p)).includes('No properties at all'), 'one without properties reads as text');
	await pick(p, 'First draft.sync-conflict');
	t.ok((await shownText(p)).includes('The other device’s text.'), 'the other reads too');
	t.eq(await textOf(p, DIR + '/2026-09-12 09.15.40 First draft.snapshot'), DRAFT, 'the original is untouched');
	// removed elsewhere
	await p.ev(`app.vault.adapter.remove(${j(DIR + '/2026-09-13 10.00.00 From the laptop.snapshot')}).then(() => 1)`);
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 4`, 6000);
	t.ok(!(await rows(p)).some((r) => r.startsWith('From the laptop')), 'one removed elsewhere leaves the list');
});

test('sync-style moves: the folder already moved by another device; both folders there; names that clash', async (p, h, t) => {
	// 1. the note is renamed here, and the other device's rename of the snapshots folder has already arrived
	await seed(p, SN + '/Part One/Landing', '2026-09-12 09.15.40 First draft', DRAFT);
	await p.ev(`app.fileManager.renameFile(${file(A)}, ${j(L + 'Part One/Landing.md')}).then(() => 1)`);
	await settle(p);
	t.eq(j(await list(p, SN + '/Part One/Landing')), j(['2026-09-12 09.15.40 First draft.snapshot']), 'already where they belong: nothing moved, nothing doubled');
	// 2. both folders there: snapshots taken on each device under each name. They come together; nothing is written over
	await seed(p, SN + '/Part One/Harbour', '2026-09-12 09.15.40 First draft', 'A different text under the same name.\n');
	await seed(p, SN + '/Part One/Harbour', '2026-09-14 08.00.00', 'Only on this one.\n');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Landing.md')}, ${j(L + 'Part One/Harbour.md')}).then(() => 1)`);
	await settle(p);
	const files = await list(p, SN + '/Part One/Harbour');
	t.eq(j(files), j(['2026-09-12 09.15.40 First draft (2).snapshot', '2026-09-12 09.15.40 First draft.snapshot', '2026-09-14 08.00.00.snapshot']), 'all three, the clashing name counted on');
	t.eq(await textOf(p, SN + '/Part One/Harbour/2026-09-12 09.15.40 First draft.snapshot'), 'A different text under the same name.\n', 'the one that was there is as it was');
	t.eq(await textOf(p, SN + '/Part One/Harbour/2026-09-12 09.15.40 First draft (2).snapshot'), DRAFT, 'the one that came is whole, beside it');
	t.eq(await exists(p, SN + '/Part One/Landing/2026-09-12 09.15.40 First draft.snapshot'), false, 'nothing left under the old name');
	// 3. the snapshots folder itself arriving whole from another device (written to the disk) is taken as it is
	await p.ev(`(async () => { await app.vault.adapter.mkdir(${j(SN + '/Part Two')}); await app.vault.adapter.mkdir(${j(SN + '/Part Two/The wreck')}); await app.vault.adapter.write(${j(SN + '/Part Two/The wreck/2026-09-15 07.00.00 Synced.snapshot')}, '---\\nsnapshot-of: "Part Two/The wreck"\\ntaken: 2026-09-15T07:00:00\\n---\\nWreck text.\\n'); })().then(() => 1)`);
	await until(p, `!!${file(SN + '/Part Two/The wreck/2026-09-15 07.00.00 Synced.snapshot')}`, 6000);
	await openNote(p, L + 'Part Two/The wreck.md');
	await run(p, 'show-snapshots');
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 2`);
	t.eq(j((await rows(p)).map((r) => r.split(' / ')[0])), j(['The note now', 'Synced']), 'a snapshot that arrived by sync is that note’s');
	t.ok(!(await p.ev(`${B}.scenes(${file('The Lighthouse')}).map(f => f.path)`)).some((x) => /Snapshots/.test(x)), 'and still no scene');
});

test('“Open to the right”: the snapshot in a pane of its own, read only; it follows a rename and closes when deleted', async (p, h, t) => {
	await write(p, A, LATER);
	const path = await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT + '\n*Well,* she thought.\n');
	await openNote(p, A);
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	await sleep(p, 300);
	await more(p);
	await clickMenu(p, 'Open to the right');
	await until(p, `app.workspace.getLeavesOfType('binders-snapshot').length === 1`);
	await sleep(p, 500);
	const LEAF = `app.workspace.getLeavesOfType('binders-snapshot')[0]`;
	const pane = await p.ev(`(() => { const l = ${LEAF}, el = l.view.contentEl; return { title: l.getDisplayText(), text: el.innerText, em: !!el.querySelector('em'), editable: !!el.querySelector('[contenteditable=true], textarea'), state: l.getViewState().state, dialog: document.querySelectorAll(${j(DLG)}).length, md: app.workspace.getLeavesOfType('markdown').length }; })()`);
	t.eq(pane.title, 'Arrival: First draft', 'its tab is titled for the note and the snapshot');
	t.ok(pane.text.includes('It was raining.') && /Snapshot “First draft”, taken Sep 12, 2026, 9:15 AM · \d+ words/.test(pane.text), 'it says what it is, then the text: ' + j(pane.text.slice(0, 80)));
	t.ok(pane.em && !pane.editable, 'rendered as a note reads, and nothing can be typed in it');
	t.ok(pane.dialog === 0 && pane.md === 1 && pane.state.file === path, 'the dialog has gone; the note is still open beside it');
	t.eq(await p.ev(`app.viewRegistry.isExtensionRegistered('snapshot')`), false, 'the kind of file isn’t registered with Obsidian (that would put snapshots in the quick switcher)');
	// it's part of the workspace: there again after Obsidian restarts
	await p.ev(`app.workspace.requestSaveLayout.run?.() ?? app.workspace.saveLayout()`).catch(() => {});
	await sleep(p, 600);
	await reload(p);
	await until(p, `app.workspace.getLeavesOfType('binders-snapshot').length === 1 && app.workspace.getLeavesOfType('binders-snapshot')[0].view.contentEl?.innerText.includes('It was raining.')`, 6000);
	t.ok(await p.ev(`${LEAF}.view.contentEl.innerText.includes('It was raining.')`), 'after a restart the pane is there, with its text');
	t.eq(await p.ev(`${LEAF}.getDisplayText()`), 'Arrival: First draft', 'and its title');
	await p.ev(`app.vault.rename(${file(path)}, ${j(DIR + '/2026-09-12 09.15.40 Earlier.snapshot')}).then(() => 1)`);
	await sleep(p, 400);
	t.eq(await p.ev(`${LEAF}.getDisplayText()`), 'Arrival: Earlier', 'renamed: its title follows');
	await p.ev(`app.vault.delete(${file(DIR + '/2026-09-12 09.15.40 Earlier.snapshot')}).then(() => 1)`);
	await until(p, `app.workspace.getLeavesOfType('binders-snapshot').length === 0`);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-snapshot').length`), 0, 'deleted: the pane closes');
	t.eq(await read(p, A), FRONT + LATER, 'the note is untouched');
});

test('the menus: a note’s own menu and the file explorer’s have the three; a folder’s has the one; other notes have none', async (p, h, t) => {
	/** A note's own "More options" menu (the note open in a tab), or the file explorer's menu for a row. */
	const menuFor = async (path, where) => {
		if (where === 'note') { await openNote(p, path); const at = await p.at(MORE); await p.click(at.x, at.y); }
		else { await explorerRows(p, ['The Lighthouse', L + 'Part One']); const at = await p.at(`.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="${path}"]`); await p.right(at.x, at.y); }
		await sleep(p, 300);
		const items = await menuItems(p);
		await closeMenus(p);
		return items;
	};
	for (const where of ['note', 'explorer']) {
		const items = await menuFor(A, where);
		t.ok(['Take a snapshot', 'Rewrite...', 'Snapshots...'].every((x) => items.includes(x)), `${where}: ${items.join(', ')}`);
	}
	const folder = await menuFor(L + 'Part One', 'explorer');
	t.ok(folder.includes('Take a snapshot of every note...') && !folder.includes('Rewrite...'), 'a folder of a binder: ' + folder.join(', '));
	const binderNote = await menuFor(NOTE, 'note');
	t.ok(!binderNote.some((x) => /snapshot/i.test(x)), 'the binder’s own note has none: ' + binderNote.join(', '));
	await p.ev(`app.vault.create('Loose.md', 'Not in a binder.').then(() => 1)`);
	const loose = await menuFor('Loose.md', 'note');
	t.ok(!loose.some((x) => /snapshot|Rewrite/i.test(x)), 'a note outside any binder has none: ' + loose.join(', '));
	await openNote(p, 'Loose.md');
	t.eq(j([await can(p, 'take-snapshot'), await can(p, 'rewrite'), await can(p, 'show-snapshots')]), j([false, false, false]), 'nor the commands');
	// in a binder view the note's commands are for the section the cursor is in (a manuscript), never for a note
	// last open elsewhere; the binder's own is there
	await openView(p, L + 'Part One');
	const k = await p.at(card(K));
	await p.click(k.x, k.y - 30);
	t.eq(j([await can(p, 'take-snapshot'), await can(p, 'rewrite'), await can(p, 'show-snapshots'), await can(p, 'take-snapshots'), await can(p, 'show-leftover-snapshots')]), j([false, false, false, true, false]), 'on the corkboard: only “Take a snapshot of every note in the binder”');
	await run(p, 'take-snapshot');
	await sleep(p, 400);
	t.eq(await exists(p, 'Snapshots'), false, 'nothing for the loose note');
	t.eq(await exists(p, SN), false, 'nor for any note of the binder');
});

// ---- a phone ----

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const tapOn = async (p, sel, text) => { const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.textContent.trim().startsWith(${j(text)})).pop(); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`); if (!at) throw new Error(`nothing to tap: ${sel} “${text}”`); await tap(p, at.x, at.y); };
/** Runs fn in Obsidian's mobile mode at a phone's size, by touch; then puts the desktop back. */
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

test('on a phone: the list is a sheet, a tap shows the snapshot, back returns; show changes, bring back, and Rewrite’s sheet', async (p, h, t) => {
	await write(p, A, LATER);
	await seed(p, DIR, '2026-09-12 09.15.40 First draft', DRAFT);
	await onPhone(p, async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		await openNote(p, A);
		await run(p, 'show-snapshots');
		await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
		await p.sleep(500);
		const sheet = await p.ev(`(() => { const m = document.querySelector(${j(DLG)}).getBoundingClientRect(), side = document.querySelector(${j(DLG + ' .binders-snapshots-side')}), pane = document.querySelector(${j(DLG + ' .binders-snapshots-pane')}); return { wide: Math.round(m.width), bottom: Math.round(m.bottom), list: !!side && side.isShown(), pane: !!pane, title: document.querySelector(${j(DLG)}).querySelector('.modal-title').textContent, rowTall: Math.round(document.querySelector(${j(DLG + ' .binders-snapshots-item')}).getBoundingClientRect().height), over: document.documentElement.scrollWidth > innerWidth }; })()`);
		t.eq(j([sheet.wide, sheet.bottom, sheet.list, sheet.pane, sheet.title, sheet.over]), j([390, 844, true, false, 'Snapshots of “Arrival”', false]), 'a sheet from the foot of the screen, showing the list alone: ' + j(sheet));
		t.ok(sheet.rowTall >= 40, `its rows are tall enough to tap (${sheet.rowTall} px)`);
		await tapOn(p, DLG + ' .binders-snapshots-item', 'First draft');
		await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-pane')})`);
		const read1 = await p.ev(`(() => { const d = document.querySelector(${j(DLG)}); const bar = d.querySelector('.binders-snapshots-bar').getBoundingClientRect(), acts = [...d.querySelectorAll('.modal-setting-titlebar-actions > *')].map(e => e.getBoundingClientRect()); return { title: d.querySelector('.modal-title').textContent, list: !!d.querySelector('.binders-snapshots-side'), back: !!d.querySelector('.modal-setting-back-button'), text: d.querySelector('.binders-snapshots-text').innerText, inside: acts.every(r => r.right <= innerWidth + 0.5 && r.left >= 0), buttons: [...d.querySelectorAll('.modal-setting-titlebar-actions button')].map(b => b.textContent), barTall: Math.round(bar.height) }; })()`);
		t.ok(read1.title.startsWith('First draft · Sep 12, 2026') && !read1.list && read1.back, 'the snapshot takes the sheet, named in its title, with a way back: ' + j(read1.title));
		t.ok(read1.text.includes('It was raining.'), 'its text');
		t.ok(read1.inside, 'everything in its row is on the screen');
		t.eq(j(read1.buttons), j(['Bring back']), 'the row has “Bring back”; Copy is in the menu');
		await tapOn(p, DLG + ' .modal-setting-titlebar-toggle', 'Show changes');
		await until(p, `!!document.querySelector(${j(DLG + ' .diff-view .diff-line.mod-left')})`);
		t.ok(await p.ev(`(() => { const d = document.querySelector(${j(DLG + ' .binders-snapshots-diff')}); return d.isShown() && [...d.querySelectorAll('.diff-line')].every(e => e.getBoundingClientRect().right <= innerWidth); })()`), 'what changed, within the screen’s width');
		// the menu: no “Open to the right” on a phone
		const dots = await p.at(DLG + ' .modal-setting-titlebar-actions .clickable-icon');
		await tap(p, dots.x, dots.y);
		await until(p, `!!document.querySelector('.menu')`);
		t.eq(j(await menuItems(p)), j(['Copy text', 'Name this snapshot...', 'Delete snapshot']), 'its menu');
		await p.key('Escape');
		await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); document.querySelector('.suggestion-bg')?.remove(); return 1; })()`);
		await p.sleep(300);
		// back to the list
		const back = await p.at(DLG + ' .modal-setting-back-button');
		await tap(p, back.x, back.y);
		await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-side')}) && !document.querySelector(${j(DLG + ' .binders-snapshots-pane')})`);
		t.eq(await p.ev(`document.querySelector(${j(DLG)}).querySelector('.modal-title').textContent`), 'Snapshots of “Arrival”', 'back: the list, under the dialog’s own title');
		// bring it back, by touch
		await tapOn(p, DLG + ' .binders-snapshots-item', 'First draft');
		await tapOn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
		await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT + DRAFT)})`);
		t.eq(await read(p, A), FRONT + DRAFT, 'brought back');
		t.eq(await textOf(p, `${DIR}/${(await list(p)).find((f) => /Before bringing back/.test(f))}`), LATER, 'the text it replaced is kept');
		for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.modal-container').length`)); i++) { await p.key('Escape'); await p.sleep(300); }
		// Rewrite: Obsidian's own sheet for a question, its buttons in a column, Cancel last
		await run(p, 'rewrite');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		const rw = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(), b = [...m.querySelectorAll('.modal-button-container button')].map(e => ({ text: e.textContent, r: e.getBoundingClientRect() })); return { sheet: m.closest('.modal-container').classList.contains('mod-confirmation'), bottom: Math.round(m.getBoundingClientRect().bottom), column: b.every((x, i) => i === 0 || x.r.top > b[i - 1].r.top - 200) && new Set(b.map(x => Math.round(x.r.left))).size === 1, last: b.slice().sort((x, y) => x.r.top - y.r.top).pop().text, tall: Math.min(...b.map(x => Math.round(x.r.height))), wide: b.every(x => x.r.right <= innerWidth) }; })()`);
		t.ok(rw.sheet && rw.bottom === 844 && rw.column && rw.last === 'Cancel' && rw.tall >= 40 && rw.wide, 'the Rewrite sheet: ' + j(rw));
		await tapOn(p, '.modal button', 'Start from a blank page');
		await until(p, `app.vault.adapter.read(${j(A)}).then(s => s === ${j(FRONT)})`);
		await p.sleep(500);
		t.eq(await read(p, A), FRONT, 'a blank page, properties as they were');
		t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-snapshot').length`), 0, 'no pane beside it on a phone');
		t.ok((await Promise.all((await list(p)).map((f) => textOf(p, `${DIR}/${f}`)))).filter((x) => x === DRAFT).length >= 1, 'and its text is in a snapshot');
	});
});
