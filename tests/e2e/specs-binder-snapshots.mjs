// Snapshots of a folder and of a whole binder (src/binder-snapshots.ts, src/view/binder-snapshots.ts): everything in
// the folder as it stood, in one ".binder-snapshot" file under "Snapshots/<the folder's path>". Golden rule 2 lives
// here: every test that changes a note checks, byte for byte, that what it replaced is kept and that no other note
// changed; and every test that only looks checks that nothing changed at all.
import { B, NOTE, PL, card, clickMenu, closeMenus, contents, exists, file, hoverMenu, j, menuItems, openView, read, reload, same, texts, until, withTidy, writeRaw } from './view-helpers.mjs';
import { make } from './specs-qa6-scale.mjs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const specs = [];
const test = (name, fn, timeout) => specs.push({ name: 'binder snapshots: ' + name, ...(timeout ? { timeout } : {}), fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });

const L = 'The Lighthouse', P1 = L + '/Part One', P2 = L + '/Part Two';
const A = P1 + '/Arrival.md', K = P1 + '/The keeper.md', S = P1 + '/Storm warning.md', W = P2 + '/The wreck.md', E = L + '/Epilogue.md';
const SN = L + '/Snapshots';
const DLG = '.modal.binders-folder-snapshots';
const BTN = '.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="Snapshots"]';
const NAME = /^\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d( .+)?\.binder-snapshot$/;
const ORDER = ['Prologue.md', 'Part One/', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two/', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md'];

// ---- helpers ----
const sleep = (p, ms) => p.sleep(ms);
/** The folder snapshots in a folder of "Snapshots", by name (they sort by time). */
const list = (p, dir = SN) => p.ev(`app.vault.adapter.exists(${j(dir)}).then(ok => ok ? app.vault.adapter.list(${j(dir)}).then(l => l.files.map(f => f.slice(${dir.length + 1})).filter(f => f.endsWith('.binder-snapshot')).sort()) : [])`);
/** A file's bytes, as hex: what "byte for byte" is checked against. */
const hex = (p, path) => p.ev(`app.vault.adapter.readBinary(${j(path)}).then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''))`);
/** A snapshot's file read as the format says: its head's lines, and each item with its text. */
function parse(text) {
	const m = /^---\n([\s\S]*?)\n---\n[^\n]*\n\n/.exec(text), items = [];
	let at = m[0].length;
	while (at < text.length) {
		const eol = text.indexOf('\n', at), line = text.slice(at, eol), o = /^===== ("(?:[^"\\]|\\.)*") \| (folder|file|note|binder note|folder note)(?: \| (\d+) (?:characters|bytes))?(?: \| ([0-9a-f]+))? =====$/.exec(line);
		if (!o) throw new Error('not an item line: ' + line.slice(0, 80));
		at = eol + 1;
		const it = { path: JSON.parse(o[1]), kind: o[2], size: Number(o[3] ?? 0), hash: o[4] ?? '', text: null };
		if (/note/.test(o[2])) { it.text = text.slice(at, at + it.size); at += it.size + 1; }
		items.push(it);
	}
	return { head: Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()])), items };
}
/** A file's text with nothing dropped (a byte-order mark stays). */
const exact = (p, path) => p.ev(`app.vault.adapter.readBinary(${j(path)}).then(b => new TextDecoder('utf-8', { ignoreBOM: true }).decode(b))`);
const snapshot = async (p, path) => parse(await exact(p, path));
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).filter(x => x).join('|'); })()`);
const noNotices = (p) => p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const settle = (p) => p.ev(`(async () => { await new Promise(r => setTimeout(r, 200)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`).then(() => sleep(p, 200));
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const can = (p, id) => p.ev(`(() => { const c = app.commands.commands['binders:${id}']; return !!c && c.checkCallback(true) === true; })()`);
async function closeAll(p) {
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await sleep(p, 200); }
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`);
}
/** The header button's menu, on the view that is open. */
async function headerMenu(p) {
	const at = await p.at(BTN);
	if (!at) throw new Error('the binder view has no Snapshots button in its header');
	await p.click(at.x, at.y);
	await sleep(p, 250);
}
/** Takes a snapshot of the folder the view shows, through the header button; returns the files there are then. */
async function take(p, dir = SN) {
	const before = (await list(p, dir)).length;
	await noNotices(p);
	await headerMenu(p);
	await clickMenu(p, 'Take a snapshot');
	await until(p, `document.querySelectorAll('.notice').length > 0`, 20000);
	await sleep(p, 250);
	const now = await list(p, dir);
	return { made: now.length > before, files: now, said: await notices(p) };
}
/** Gives the newest snapshot in a folder an earlier time (its name is its time), so the next one is "later". */
async function age(p, name, to, dir = SN) {
	const next = name.replace(/^\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d/, to);
	await p.ev(`app.vault.rename(${file(`${dir}/${name}`)}, ${j(`${dir}/${next}`)}).then(() => 1)`);
	await sleep(p, 150);
	return next;
}
async function openDialog(p) {
	await noNotices(p);
	await headerMenu(p);
	await clickMenu(p, 'Show snapshots...');
	await until(p, `!!document.querySelector(${j(DLG)})`);
	await sleep(p, 500);
}
const rows = (p) => p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})].map(r => [r.querySelector('.binders-snapshots-item-name').textContent, r.querySelector('.binders-snapshots-item-detail').textContent.trim(), r.classList.contains('is-active')])`);
/** The contents as drawn: each row's name, what its end says, and how it is marked. */
const tree = (p) => p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-tree')} + ' .tree-item-self, ' + ${j(DLG + ' .binders-folder-snapshots-tree .binders-folder-snapshots-folded')})].filter(e => e.offsetParent).map(e => e.classList.contains('binders-folder-snapshots-folded') ? '(' + e.textContent + ')' : e.querySelector('.tree-item-inner').textContent + (e.querySelector('del') ? ' [del]' : e.querySelector('ins') ? ' [ins]' : '') + (e.querySelector('.tree-item-flair') ? ' | ' + e.querySelector('.tree-item-flair').textContent : ''))`);
const key = (p) => p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-key')})?.textContent.trim() ?? ''`);
const bar = (p) => p.ev(`(() => { const a = document.querySelector(${j(DLG + ' .modal-setting-titlebar-actions')}); return { name: document.querySelector(${j(DLG + ' .binders-snapshots-name')}).textContent, detail: document.querySelector(${j(DLG + ' .binders-snapshots-detail')}).textContent, quiet: [...a.querySelectorAll('.text-icon-button')].map(b => b.textContent + (b.classList.contains('is-active') ? '*' : '') + (b.classList.contains('is-disabled') ? ' (off)' : '')), buttons: [...a.querySelectorAll('button')].map(b => b.textContent + (b.disabled ? ' (off)' : '')), more: !!a.querySelector('[aria-label="More"]') }; })()`);
const drawn = (p) => until(p, `!!document.querySelector(${j(DLG + ' .binders-folder-snapshots-tree, ' + DLG + ' .binders-folder-snapshots-read, ' + DLG + ' .binders-folder-snapshots-crumb')}) && !document.querySelector(${j(DLG + ' .binders-folder-snapshots-body > .binders-folder-snapshots-wait')})`, 20000).then(() => sleep(p, 200));
async function pickRow(p, name) {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})].find(r => r.querySelector('.binders-snapshots-item-name').textContent === ${j(name)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`the list has no “${name}”: ` + j(await rows(p)));
	await p.click(at.x, at.y);
	await drawn(p);
}
async function clickIn(p, sel, text) {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.offsetParent && e.textContent.trim() === ${j(text)}).pop(); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x + Math.min(r.width / 2, 40), y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`nothing says “${text}” (${sel})`);
	await p.click(at.x, at.y);
	await sleep(p, 350);
}
const quiet = (p, label) => clickIn(p, DLG + ' .text-icon-button .text-button-label', label).then(() => drawn(p));
const treeRow = (p, name) => clickIn(p, DLG + ' .binders-folder-snapshots-tree .tree-item-inner', name).then(() => drawn(p));
async function more(p, title, sub = null) {
	await noNotices(p);
	const at = await p.at(DLG + ' .modal-setting-titlebar-actions [aria-label="More"]');
	await p.click(at.x, at.y);
	await sleep(p, 250);
	if (!title) return menuItems(p);
	if (sub) { await hoverMenu(p, title); await clickMenu(p, sub); } else await clickMenu(p, title);
	await sleep(p, 300);
}
/** A month's work on the book, of every kind "Show changes" tells apart. */
async function work(p) {
	await p.ev(`(async () => {
		const store = ${B}, f = (x) => app.vault.getAbstractFileByPath(x), pm = (x, fn) => app.fileManager.processFrontMatter(f(x), fn);
		await app.vault.process(f(${j(A)}), (t) => t.replace('two cases and a letter she had not opened', 'one case and a letter she had read twice') + '\\nNobody had come down to meet her.\\n');
		await store.move(f(${j(S)}), f(${j(P2)}), 0);
		await store.move(f(${j(E)}), f(${j(L)}), 0);
		await app.fileManager.renameFile(f(${j(K)}), ${j(P1 + '/The old keeper.md')});
		await app.vault.delete(f(${j(P2 + '/Lights out.md')}));
		await store.newScene(f(${j(P2)}), 1, 'The lamp room', undefined, 'The stair wound up through the smell of oil.\\n');
		await pm(${j(W)}, (fm) => { fm.label = 'Red'; fm.status = 'Done'; });
		const note = await store.ensureFolderNote(f(${j(P1)}));
		await app.fileManager.processFrontMatter(note, (fm) => { fm.synopsis = 'Mara comes to the island.'; });
		await pm(${j(NOTE)}, (fm) => { fm.target = 60000; });
		await new Promise(r => setTimeout(r, 400));
		await store.snapshotsSettle();
		await store.flush();
	})().then(() => 1)`);
	await sleep(p, 400);
}
const bodyOf = (text) => text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const frontOf = (text) => (/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text) ?? [''])[0];

// ---- taking one ----

test('the binder view has the note’s Snapshots button; “Take a snapshot” writes one file that holds every note, byte for byte, in the binder’s order', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await headerMenu(p);
	t.eq(j(await menuItems(p)), j(['Take a snapshot', 'Show snapshots...']), 'the button’s menu: the two a note has, without “Rewrite...”');
	t.eq(await p.ev(`document.querySelector(${j(BTN)}).querySelector('svg').classList.contains('lucide-history')`), true, 'the note’s clock');
	await closeMenus(p);
	const got = await take(p);
	t.ok(got.made && got.files.length === 1 && NAME.test(got.files[0]), 'one file, named for when it was taken: ' + j(got.files));
	t.ok(/^Took a snapshot of “The Lighthouse”: 7 notes · [\d,]+ words\.$/.test(got.said), 'it asks nothing and says what it took: ' + got.said);
	const s = await snapshot(p, `${SN}/${got.files[0]}`);
	t.eq(j([s.head['binder-snapshot'], s.head.binder, s.head.of, s.head.notes]), j(['1', '"The Lighthouse"', '""', '7']), 'its head: the format, the binder, what it is of, how many notes');
	t.eq(j(s.items.map((i) => i.path)), j(['The Lighthouse.md', ...ORDER]), 'every item in the binder’s order, the binder note first');
	t.eq(j(s.items.filter((i) => i.kind !== 'note').map((i) => i.kind)), j(['binder note', 'folder', 'folder']), 'the binder note and the folders are said to be what they are');
	for (const i of s.items.filter((x) => x.text != null)) t.eq(i.text, before[`${L}/${i.path}`], `“${i.path}” is in it exactly as it is on disk`);
	same(t, before, await texts(p));
	t.eq(j(await contents(p)), j(ORDER.map((x) => x.replace(/\.md$/, ''))), 'the binder’s order is untouched: nothing of “Snapshots” is in it');
});

test('what is typed and not yet saved goes in: in a note’s open editor, in the manuscript, and in a synopsis still being typed', async (p, h, t) => {
	// a note open in a tab beside the binder view, typed in, nothing saved yet
	await p.ev(`app.workspace.getLeaf(false).openFile(${file(A)}, { state: { mode: 'source' } }).then(() => 1)`);
	await sleep(p, 500);
	await p.ev(`(() => { const e = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(A)}).view.editor; e.replaceRange(' TYPED-IN-A-TAB', { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); return 1; })()`);
	await openView(p, L, true);
	// a synopsis on a card, typed and not committed
	const syn = `${card(E)} .binders-card-synopsis`;
	const at = await p.at(syn);
	await p.click(at.x, at.y);
	await p.key('End', 'ctrl');
	await p.type(' TYPED-IN-A-FIELD');
	t.ok(await p.ev(`document.activeElement.matches('textarea')`), 'the synopsis is still being typed');
	await run(p, 'take-snapshots');
	await until(p, `app.vault.adapter.exists(${j(SN)})`, 20000);
	await sleep(p, 600);
	const files = await list(p);
	t.ok(files.length === 1, 'the command took one: ' + await notices(p) + ' / ' + j(await can(p, 'take-snapshots')));
	const s = await snapshot(p, `${SN}/${files[0]}`);
	t.ok(s.items.find((i) => i.path === 'Part One/Arrival.md').text.includes('TYPED-IN-A-TAB'), 'the words typed in the tab are in the snapshot');
	t.ok(s.items.find((i) => i.path === 'Epilogue.md').text.includes('TYPED-IN-A-FIELD'), 'the synopsis being typed is in it too');
	t.ok((await read(p, A)).includes('TYPED-IN-A-TAB') && (await read(p, E)).includes('TYPED-IN-A-FIELD'), 'and both are saved, as the snapshot says they were');
	// the manuscript: typing in a section, then the command
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].view.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-manuscript .cm-content')`, 8000);
	await sleep(p, 600);
	// (the first section made an editor and given the cursor, as a click does: then typed into, as by hand)
	await p.ev(`(async () => { const m = app.workspace.getLeavesOfType('binders-view')[0].view.current, s = m.scenes[0]; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 1; })()`);
	await sleep(p, 150);
	await p.type(' TYPED-IN-THE-MANUSCRIPT');
	t.ok(await until(p, `document.querySelector('.binders-manuscript .cm-content')?.textContent.includes('TYPED-IN-THE-MANUSCRIPT')`, 4000), 'typed into the manuscript, not saved yet');
	await run(p, 'take-snapshots');
	await until(p, `app.vault.adapter.list(${j(SN)}).then(l => l.files.length === 2)`, 20000);
	await sleep(p, 400);
	const second = await snapshot(p, `${SN}/${(await list(p))[1]}`);
	t.ok(second.items.some((i) => i.text?.includes('TYPED-IN-THE-MANUSCRIPT')), 'what was typed in the manuscript a moment ago is in the next one');
});

test('nothing has changed: none is taken, and it says when the last one was; a name then goes to that one; any change at all makes another', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	t.ok(first.made, 'the first is taken');
	const again = await take(p);
	t.ok(!again.made && /^Nothing in “The Lighthouse” has changed since its last snapshot, today at /.test(again.said), 'the same binder again: none, and it says so: ' + again.said);
	// a property alone
	await p.ev(`app.fileManager.processFrontMatter(${file(W)}, (fm) => { fm.label = 'Blue'; }).then(() => 1)`);
	await sleep(p, 300);
	t.ok((await take(p)).made, 'a label changed: another');
	// the order alone
	await p.ev(`${B}.move(${file(E)}, ${file(L)}, 0).then(() => ${B}.flush()).then(() => 1)`);
	await sleep(p, 300);
	t.ok((await take(p)).made, 'a note moved: another');
	t.ok(!(await take(p)).made, 'and then none again');
	// a new, empty note; a note deleted
	await p.ev(`${B}.newScene(${file(P1)}, 0, 'Blank').then(() => ${B}.flush()).then(() => 1)`);
	await sleep(p, 300);
	t.ok((await take(p)).made, 'a blank note added: another');
	const before = await list(p), bytes = await hex(p, `${SN}/${before[before.length - 1]}`);
	// a name for what the newest one holds: that one takes it
	await p.ev(`(async () => { const { takeFolder } = ${PL}.snapshotsApi; await takeFolder(${file(L)}, 'Draft sent to Sam'); })().then(() => 1)`);
	await sleep(p, 500);
	const after = await list(p);
	t.eq(after.length, before.length, 'named, with nothing changed: no second file');
	t.ok(after[after.length - 1].endsWith(' Draft sent to Sam.binder-snapshot'), 'the newest one has the name: ' + after[after.length - 1]);
	t.eq(await hex(p, `${SN}/${after[after.length - 1]}`), bytes, 'and its file is byte for byte what it was');
	t.ok(/That one is now named “Draft sent to Sam”\.$/.test(await notices(p)), 'and it says so');
});

test('a folder has snapshots of its own: taken from its view, kept under its path; its list has the binder’s too, and the binder’s list has not the folder’s', async (p, h, t) => {
	await openView(p);
	const whole = await take(p);
	await age(p, whole.files[0], '2026-09-19 16.20.05');
	await openView(p, P1);
	const part = await take(p, SN + '/Part One');
	t.ok(part.made && /^Took a snapshot of “Part One”: 3 notes · /.test(part.said), 'taken of the folder shown: ' + part.said);
	t.eq(j(await list(p)), j(['2026-09-19 16.20.05.binder-snapshot']), 'the binder’s own are at the top of “Snapshots”');
	const s = await snapshot(p, `${SN}/Part One/${part.files[0]}`);
	t.eq(j([s.head.of, s.items.map((i) => i.path)]), j(['"Part One"', ['Arrival.md', 'The keeper.md', 'Storm warning.md']]), 'it is of the folder, and holds what is in it, by their paths in it');
	await openDialog(p);
	const r = await rows(p);
	t.eq(j(r.map((x) => x[0])).replace(/Today at [^"]+/, 'Today'), j(['The folder now', 'Today', 'Sep 19, 4:20 PM']), 'the folder’s list: now, its own, and the binder’s, newest first: ' + j(r));
	t.ok(/In the whole binder/.test(r[2][1]) && !/In the whole binder/.test(r[1][1]), 'the binder’s says it is of the whole binder: ' + j(r));
	await pickRow(p, 'Sep 19, 4:20 PM');
	t.eq(j((await tree(p)).map((x) => x.split(' | ')[0])), j(['Arrival', 'The keeper', 'Storm warning']), 'the binder’s snapshot, seen from the folder, is the folder’s part of it');
	t.ok((await bar(p)).detail.includes('3 notes'), 'and its size is the folder’s');
	await closeAll(p);
	await openView(p, L);
	await openDialog(p);
	t.eq((await rows(p)).length, 2, 'the binder’s list: now and its own one; a folder’s snapshot isn’t the binder’s');
	// the folder of snapshots is no folder of the binder
	await closeAll(p);
	t.eq(await p.ev(`(() => { const f = ${file(SN)}; return [${PL}.snapshotsApi.has(f), ${PL}.snapshotsApi.has(${file(SN + '/Part One')})].join(); })()`), 'false,false', 'and “Snapshots” itself has none');
});

// ---- seeing them ----

test('with none yet, a small dialog says what a snapshot is and takes the first; then the list, the contents with each note’s words, and the two switches that have nothing to show say why', async (p, h, t) => {
	await openView(p);
	await openDialog(p);
	t.ok(await p.ev(`document.querySelector(${j(DLG)}).closest('.modal-container').classList.contains('mod-confirmation') && !document.querySelector(${j(DLG + ' .binders-snapshots-list')})?.offsetParent`), 'one of Obsidian’s small dialogs, no empty list');
	t.ok(/^A snapshot keeps everything in this binder as it is now: every note’s text and properties, and the order they are in\./.test(await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-empty')}).textContent`)), 'it says what one is');
	await clickIn(p, DLG + ' .modal-button-container button', 'Take a snapshot');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`, 20000);
	await drawn(p);
	const r = await rows(p);
	t.eq(j([r.length, r[0][0], r[1][2]]), j([2, 'The binder now', true]), 'the list: the binder now, and the snapshot, which is shown: ' + j(r));
	t.ok(/^7 notes · [\d,]+ words$/.test(r[0][1]), 'now says how big the binder is: ' + r[0][1]);
	await until(p, `/words$/.test(document.querySelectorAll(${j(DLG + ' .binders-snapshots-item-detail')})[1].textContent)`, 5000);
	const b = await bar(p);
	t.ok(/7 notes · [\d,]+ words · Same as now$/.test(b.detail), 'the bar: its size, and that nothing has changed: ' + b.detail);
	t.eq(j([b.quiet, b.more]), j([['Show changes (off)', 'Read'], true]), 'nothing to compare, so “Show changes” is off; “Read” and the menu are there: ' + j(b));
	t.eq(await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-compare.is-disabled')}).getAttribute('aria-label')`), 'Nothing is different', 'and says why');
	const rowsNow = await tree(p);
	t.eq(j(rowsNow.map((x) => x.split(' | ')[0])), j(['Prologue', 'Part One', 'Arrival', 'The keeper', 'Storm warning', 'Part Two', 'The wreck', 'Lights out', 'Epilogue']), 'the contents, in order');
	t.ok(/^Part One \| 3 notes$/.test(rowsNow[1]) && /^Arrival \| \d+$/.test(rowsNow[2]), 'a folder says how many notes, a note how many words: ' + j(rowsNow.slice(1, 3)));
	// the binder now: read, and a button that takes one
	await pickRow(p, 'The binder now');
	t.eq(j((await bar(p)).buttons), j(['Take a snapshot']), 'on “now”, the one button takes a snapshot');
});

test('“Show changes” says what is different, item by item: rewritten with its words, new, gone, moved, renamed, properties; what is the same folds away', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft sent to Sam');
	const before = await texts(p);
	await work(p);
	const after = await texts(p);
	await openDialog(p);
	await drawn(p);
	t.eq((await bar(p)).name, 'Draft sent to Sam', 'it opens on the newest snapshot, by its name');
	t.ok((await bar(p)).quiet.includes('Show changes*'), 'with the changes showing');
	t.eq(await key(p), 'Since this snapshot: 1 note rewritten, 1 new, 1 gone, 2 moved, 1 renamed, 3 with other properties. 11 words put in, 4 taken out.', 'the summary');
	const got = await tree(p);
	t.eq(j(got), j([
		'The binder’s own properties | target',
		// (a note that is the same says its size, as in the contents)
		'Prologue | 21',
		'Part One | synopsis',
		'Arrival | +11 −4 words',
		'The keeper | now “The old keeper”',
		'Storm warning | moved to “Part Two”',
		'Part Two | 2 notes',
		// (what is new is where it is now: The lamp room was put first in Part Two; properties in the note's own order)
		'The lamp room [ins] | new',
		'The wreck | status, label',
		'Lights out [del] | gone',
		'Epilogue | moved',
	]), 'every row, with what is different about it');
	t.ok(await p.ev(`[...document.querySelectorAll(${j(DLG + ' .tree-item-self')})].every(e => e.getAttribute('aria-label') && e.getAttribute('role') === 'treeitem')`), 'every row is named for a screen reader');
	t.eq(await p.ev(`[...document.querySelectorAll(${j(DLG + ' .tree-item-self')})].find(e => e.textContent.startsWith('Arrival')).getAttribute('aria-label')`), 'Arrival, +11 −4 words', 'with what is different about it');
	// off: the binder as it stood
	await quiet(p, 'Show changes');
	t.eq(j((await tree(p)).map((x) => x.split(' | ')[0])), j(['Prologue', 'Part One', 'Arrival', 'The keeper', 'Storm warning', 'Part Two', 'The wreck', 'Lights out', 'Epilogue']), 'off: the contents as they stood, no marks, nothing new');
	t.eq(await key(p), '', 'and no summary');
	same(t, after, await texts(p));
	t.ok(before[A] !== after[A], '(the work was done)');
});

test('a stretch that is the same folds to a line that opens; a folder in which nothing changed is shut', async (p, h, t) => {
	await p.ev(`(async () => { for (let i = 1; i <= 6; i++) await ${B}.newScene(${file(P2)}, Infinity, 'Extra ' + i, undefined, 'Text ' + i + '.\\n'); await ${B}.flush(); })().then(() => 1)`);
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05');
	await p.ev(`app.vault.process(${file(P2 + '/Extra 3.md')}, (t) => t + 'More.\\n').then(() => 1)`);
	await sleep(p, 300);
	await openDialog(p);
	await drawn(p);
	const got = await tree(p);
	t.eq(j(got), j(['(2 items the same)', 'Part Two | 8 notes', '(4 notes the same)', 'Extra 3 | +1 word', '(3 notes the same)', 'Epilogue | 6']), 'what is the same, on either side of what changed, is a line each; one item alone that is the same is shown: ' + j(got));
	await clickIn(p, DLG + ' .binders-folder-snapshots-folded', '4 notes the same');
	t.eq(j((await tree(p)).slice(2, 7).map((x) => x.split(' | ')[0])), j(['The wreck', 'Lights out', 'Extra 1', 'Extra 2', 'Extra 3']), 'a click opens the line into its notes');
	await clickIn(p, DLG + ' .binders-folder-snapshots-folded', '2 items the same');
	t.eq(j((await tree(p)).slice(0, 3).map((x) => x.split(' | ')[0])), j(['Prologue', 'Part One', 'Part Two']), 'the other line opens into a note and a folder, and the folder, in which nothing changed, is shut');
	t.eq(await p.ev(`[...document.querySelectorAll(${j(DLG + ' .tree-item-self')})].find(e => e.textContent.startsWith('Part One')).getAttribute('aria-expanded')`), 'false', 'and says it is shut');
	await treeRow(p, 'Part One');
	t.eq(j((await tree(p)).slice(2, 5).map((x) => x.split(' | ')[0])), j(['Arrival', 'The keeper', 'Storm warning']), 'a click opens it');
});

test('one note of a snapshot opens as a note’s snapshot does, with the same comparison; “Read” is the binder as it stood, top to bottom; “Compare with” sets it against another snapshot', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-08-14 18.02.11 First draft');
	await p.ev(`app.vault.process(${file(A)}, (t) => t.replace('two cases', 'one case')).then(() => 1)`);
	await sleep(p, 300);
	const second = await take(p);
	await age(p, second.files[1], '2026-09-19 16.20.05 Second draft');
	await p.ev(`app.vault.process(${file(A)}, (t) => t + '\\nNobody had come down to meet her.\\n').then(() => 1)`);
	await sleep(p, 300);
	const before = await texts(p);
	await openDialog(p);
	await pickRow(p, 'First draft');
	await treeRow(p, 'Arrival');
	t.eq(await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-crumb')}).textContent`), 'Part One / Arrival+9 −2 words', 'the note’s page: where it is, its name, what is different');
	const marks = await p.ev(`({ del: [...document.querySelectorAll(${j(DLG + ' .binders-snapshots-changes del')})].map(e => e.textContent), ins: [...document.querySelectorAll(${j(DLG + ' .binders-snapshots-changes ins')})].map(e => e.textContent) })`);
	t.eq(j(marks), j({ del: ['two cases'], ins: ['one case', 'Nobody had come down to meet her.'] }), 'what was taken out and put in, as prose, where it falls');
	t.eq(j((await bar(p)).buttons), j(['Bring back']), 'and “Bring back”, for this note');
	await quiet(p, 'Show changes');
	t.ok((await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-page')}).textContent`)).includes('two cases and a letter she had not opened'), 'off: the note’s text as it stood, to read');
	await quiet(p, 'Show changes');
	await clickIn(p, DLG + ' .binders-folder-snapshots-crumb .clickable-icon', '');
	await drawn(p);
	t.ok((await tree(p)).length > 3, 'the arrow goes back to the contents');
	// read
	await quiet(p, 'Read');
	const read1 = await p.ev(`({ heads: [...document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-read')} + ' h1, ' + ${j(DLG + ' .binders-folder-snapshots-read')} + ' h3')].map(e => e.textContent), folded: [...document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-read .binders-folder-snapshots-folded')})].map(e => e.textContent), ins: document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-read ins')}).length })`);
	t.eq(j(read1), j({ heads: ['Part One', 'Arrival+9 −2 words'], folded: ['1 note the same', '5 notes the same'], ins: 2 }), 'read, with the changes: the note that changed, as prose, and the rest passed over in a line');
	await quiet(p, 'Show changes');
	await sleep(p, 500);
	const read2 = await p.ev(`({ heads: [...document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-read')} + ' h1, ' + ${j(DLG + ' .binders-folder-snapshots-read')} + ' h3')].map(e => e.textContent), text: document.querySelector(${j(DLG + ' .binders-folder-snapshots-read')}).textContent })`);
	t.eq(j(read2.heads), j(['Prologue', 'Part One', 'Arrival', 'The keeper', 'Storm warning', 'Part Two', 'The wreck', 'Lights out', 'Epilogue']), 'without: the whole binder as it stood, in order');
	t.ok(read2.text.includes('two cases and a letter she had not opened') && !read2.text.includes('Nobody had come down'), 'in the words it had then');
	await quiet(p, 'Read');
	await quiet(p, 'Show changes');
	// compare with the other snapshot
	await more(p, 'Compare with', 'Second draft (Sep 19, 4:20 PM)');
	await drawn(p);
	t.eq(await key(p), 'From this snapshot to “Second draft”: 1 note rewritten. 2 words put in, 2 taken out.', 'compared with another snapshot, the summary says which');
	t.ok(!(await bar(p)).buttons.length, 'and nothing is brought back while two snapshots are being compared');
	same(t, before, await texts(p));
});

// ---- what is real of bringing back ----

test('a note of a snapshot, read with “Start a paragraph with a tab” and “Indent paragraphs” both on: a paragraph begun with a tab that follows a paragraph is set in once, not twice, and so is a plain one', async (p, h, t) => {
	const TEXT = '\tOpens with a tab.\n\n\tSecond, begun with a tab.\n\nThird, plain.\n\n\tFourth, begun with a tab.\n\tIts second line.\n';
	const settings = (o) => p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, ${j(o)}); await pl.saveSettings(); return 1; })()`);
	await p.ev(`app.vault.process(${file(A)}, (x) => x.slice(0, x.indexOf('\\n---\\n', 3) + 5) + ${j(TEXT)}).then(() => 1)`);
	await sleep(p, 300);
	const before = await texts(p);
	t.ok(before[A].endsWith(TEXT), 'the note has the text: ' + j(before[A]));
	await openView(p);
	const taken = await take(p);
	await age(p, taken.files[0], '2026-08-14 18.02.11 Tabs');
	const PAGE = DLG + ' .binders-folder-snapshots-page';
	// where each paragraph's text starts, from the paragraph's own edge: of its first line, and of a line after a break
	const starts = () => p.ev(`(() => { const e = document.querySelector(${j(PAGE)}); if (!e) return null;
		const left = (n) => { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1); return r.getClientRects()[0].left; };
		return { marks: e.querySelectorAll('.binders-tab').length, text: e.textContent, ps: [...e.querySelectorAll(':scope > p')].map(x => { const words = [...x.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()); const at = x.getBoundingClientRect().left; return { text: x.textContent, first: Math.round(left(words[0]) - at), rest: words.slice(1).map(n => Math.round(left(n) - at)) }; }) }; })()`);
	const said = (g) => j(g.ps.map((x) => [x.first, ...x.rest]));
	const page = async () => {
		await openDialog(p);
		await pickRow(p, 'Tabs');
		await treeRow(p, 'Arrival');
		await until(p, `document.querySelectorAll(${j(PAGE + ' > p')}).length === 4`, 8000);
		await sleep(p, 200);
		const got = await starts();
		await closeAll(p);
		return got;
	};
	try {
		await settings({ tabParagraphs: true, indentParagraphs: false });
		const off = await page();
		t.eq(off.ps.length, 4, 'four paragraphs: ' + j(off.ps.map((x) => x.text)));
		t.eq(off.marks, 4, 'each tab line has its mark');
		t.ok(off.ps.every((x, i) => Math.abs(x.first - (i === 2 ? 0 : 24)) < 1.5), 'with “Indent paragraphs” off, a tab is the paragraph indent and a plain paragraph is flush: ' + said(off));
		t.ok(Math.abs(off.ps[3].rest[0] - 24) < 1.5, 'and a tab line after a break in a paragraph: ' + said(off));
		await settings({ indentParagraphs: true });
		const on = await page();
		t.eq(on.ps.length, 4, 'four paragraphs still: ' + j(on.ps.map((x) => x.text)));
		t.ok(on.ps.every((x) => Math.abs(x.first - 24) < 1.5), 'with it on, every paragraph starts one indent in (the first by its tab, the plain one by the indent), and none by two: ' + said(on));
		t.ok(Math.abs(on.ps[3].rest[0] - 24) < 1.5, 'and the tab line after a break keeps its tab: ' + said(on));
		t.eq(on.marks, 4, 'the marks are all there');
		t.eq(on.text, off.text, 'and the words are the same');
	} finally { await settings({ tabParagraphs: true, indentParagraphs: false }); }
	same(t, before, await texts(p));
});

test('one note brought back: its text is the snapshot’s, its properties stay, the text it replaced is a snapshot of the note, and no other note changes', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft sent to Sam');
	const was = await read(p, A);
	await p.ev(`(async () => { await app.vault.process(${file(A)}, (t) => t + '\\nA paragraph written since.\\n'); await app.fileManager.processFrontMatter(${file(A)}, (fm) => { fm.status = 'Done'; }); })().then(() => 1)`);
	await sleep(p, 300);
	const before = await texts(p);
	await openDialog(p);
	await treeRow(p, 'Arrival');
	await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => !s.includes('written since'))`, 8000);
	await sleep(p, 500);
	const now = await read(p, A);
	t.eq(bodyOf(now), bodyOf(was), 'the note’s text is the text it had');
	t.eq(frontOf(now), frontOf(before[A]), 'its properties are as they were a moment ago: the status set since stays');
	const kept = await p.ev(`app.vault.adapter.list(${j(SN + '/Part One/Arrival')}).then(l => l.files)`);
	t.ok(kept.length === 1 && /Before bringing back Draft sent to Sam\.snapshot$/.test(kept[0]), 'the text it replaced is a snapshot of the note, named for why: ' + j(kept));
	t.ok((await read(p, kept[0])).endsWith(bodyOf(before[A])), 'and holds every word of it');
	same(t, before, await texts(p), { skip: [A] });
	t.ok(/^Brought back the text of “Arrival” from “Draft sent to Sam”\. The text it replaced is kept as a snapshot of the note\.$/.test(await notices(p)), 'it says what it did: ' + await notices(p));
	await drawn(p);
	t.ok((await tree(p)).some((x) => x === 'Arrival | status'), 'and the contents say what is still different: its status');
});

test('a note that is gone is made again, byte for byte, where it stood; another note made since under its name is that note rewritten, and Bring back gives it its text again, keeping what it replaced', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05');
	const was = await hex(p, K);
	await p.ev(`app.vault.delete(${file(K)}).then(() => ${B}.flush()).then(() => 1)`);
	await sleep(p, 300);
	const before = await texts(p);
	await openDialog(p);
	await treeRow(p, 'The keeper');
	t.eq(j((await bar(p)).quiet), j(['Show changes (off)']), 'a gone note has nothing to compare with');
	await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
	await until(p, `app.vault.adapter.exists(${j(K)})`, 8000);
	await settle(p);
	t.eq(await hex(p, K), was, 'it is back, byte for byte');
	t.eq(j((await contents(p)).slice(1, 5)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning']), 'after the note it followed then');
	same(t, before, await texts(p), { skip: [K, NOTE] });
	// another note made since under its name: a note is followed by where it is, so this is the same note, rewritten
	// (the maintainer's call, 2026-10-06, as changes() documents it)
	await closeAll(p);
	const old = await read(p, K);
	await p.ev(`(async () => { await app.vault.delete(${file(K)}); await ${B}.newScene(${file(P1)}, 0, 'The keeper', undefined, 'Another note altogether.\\n'); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 300);
	await openDialog(p);
	await drawn(p);
	const row = (await tree(p)).find((r) => r.startsWith('The keeper'));
	t.ok(row && !/\[del\]|\[ins\]/.test(row) && /^The keeper \| [+−][^|]*words/.test(row), 'shown as the note rewritten, with its words in and out, not as one gone and one new: ' + row);
	await treeRow(p, 'The keeper');
	await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
	await until(p, `app.vault.adapter.read(${j(K)}).then(s => !s.includes('Another note altogether.'))`, 8000);
	await settle(p);
	t.eq(bodyOf(await read(p, K)), bodyOf(old), 'Bring back gives it its text as it was');
	const kept = await p.ev(`(async () => { const d = ${j(SN + '/Part One/The keeper')}; if (!(await app.vault.adapter.exists(d))) return []; const l = await app.vault.adapter.list(d); return Promise.all(l.files.map(f => app.vault.adapter.read(f))); })()`);
	t.ok(kept.some((x) => x.includes('Another note altogether.')), 'and the text it replaced is kept as a snapshot of the note');
});

test('“Make a binder from this snapshot” writes the binder as it stood into a new folder beside it: a binder, in its order, every note byte for byte; nothing that is there changes', async (p, h, t) => {
	await p.ev(`app.vault.adapter.write(${j(P2 + '/Marked.md')}, '\\uFEFF---\\nstatus: draft\\n---\\nWindows lines.\\r\\nAnd a mark.\\r\\n').then(() => 1)`);
	await until(p, `!!${file(P2 + '/Marked.md')}`);
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft sent to Sam');
	const then = {};
	for (const f of ['The Lighthouse.md', ...ORDER.filter((x) => x.endsWith('.md')), 'Part Two/Marked.md']) then[f] = await hex(p, `${L}/${f}`);
	const order = await p.ev(`${B}.scenes(${file(L)}).map(f => f.path.slice(${L.length + 1}))`);
	await work(p);
	const before = await texts(p);
	await openDialog(p);
	await more(p, 'Make a binder from this snapshot');
	const C = 'The Lighthouse (Draft sent to Sam)';
	await until(p, `/^Made “/.test([...document.querySelectorAll('.notice')].map(n => n.textContent).join('|'))`, 30000);
	await settle(p);
	t.ok(/^Made “The Lighthouse \(Draft sent to Sam\)”: the binder as it stood Sep 19, 2026(?:,| at) [^,]+, beside the one that’s there\.$/.test((await notices(p)).split('|').pop()), 'it says what it made: ' + await notices(p));
	t.eq(await p.ev(`${B}.binderOf(${file(C)})?.folder.path ?? null`), C, 'the new folder is a binder');
	for (const [f, bytes] of Object.entries(then)) t.eq(await hex(p, `${C}/${f === 'The Lighthouse.md' ? C + '.md' : f}`), bytes, `“${f}” is in it byte for byte (a byte-order mark and CR LF among them)`);
	t.eq(j(await p.ev(`${B}.scenes(${file(C)}).map(f => f.path.slice(${C.length + 1}))`)), j(order), 'in the order the binder had');
	t.eq(await p.ev(`app.vault.getAllLoadedFiles().filter(f => f.path.startsWith(${j(C + '/')})).length`), Object.keys(then).length + 2, 'and nothing else: its notes and its two folders');
	same(t, before, await texts(p), { skip: Object.keys(await texts(p)).filter((k) => k.startsWith(C + '/')) });
	// again: beside the first copy, under a name counted on
	await more(p, 'Make a binder from this snapshot');
	await until(p, `!!${file(C + ' 2')} && /^Made “The Lighthouse \\(Draft sent to Sam\\) 2”/.test([...document.querySelectorAll('.notice')].map(n => n.textContent).pop() ?? '')`, 30000);
	t.ok(await exists(p, `${C} 2/Part One/Arrival.md`), 'a second copy has a name of its own');
});

test('“Make a folder from this snapshot”: a folder’s copy goes right after the folder, in the binder, in the order it had', async (p, h, t) => {
	await openView(p, P1);
	const first = await take(p, SN + '/Part One');
	await age(p, first.files[0], '2026-09-19 16.20.05 Before', SN + '/Part One');
	const then = {};
	for (const f of ['Arrival.md', 'The keeper.md', 'Storm warning.md']) then[f] = await hex(p, `${P1}/${f}`);
	await p.ev(`${B}.move(${file(S)}, ${file(P1)}, 0).then(() => ${B}.flush()).then(() => 1)`);
	await sleep(p, 300);
	const before = await texts(p);
	await openDialog(p);
	t.ok((await more(p, null)).includes('Make a folder from this snapshot'), 'a folder’s menu says “folder”');
	await clickMenu(p, 'Make a folder from this snapshot');
	const C = L + '/Part One (Before)';
	await until(p, `/^Made “/.test([...document.querySelectorAll('.notice')].map(n => n.textContent).join('|'))`, 30000);
	await settle(p);
	for (const [f, bytes] of Object.entries(then)) t.eq(await hex(p, `${C}/${f}`), bytes, `“${f}” is in it byte for byte`);
	const c = await contents(p);
	t.eq(j(c.slice(c.indexOf('Part One/'), c.indexOf('Part Two/'))), j(['Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper', 'Part One (Before)/', 'Part One (Before)/Arrival', 'Part One (Before)/The keeper', 'Part One (Before)/Storm warning']), 'after the folder it is of, its notes in the order they had then');
	same(t, before, await texts(p), { skip: Object.keys(await texts(p)).filter((k) => k.startsWith(C + '/')).concat([NOTE]) });
});

// ---- naming, deleting ----

// ---- bringing a whole one back: the text of the notes, and the order ----

const BACK = '.modal.binders-folder-snapshots-back';
const AUTO = /^\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d Before bringing back .+\.auto\.binder-snapshot$/;
/** Every note in the vault, byte for byte (as hex), by path. */
const bytes = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = [...new Uint8Array(await app.vault.adapter.readBinary(f.path))].map(x => x.toString(16).padStart(2, '0')).join(''); return o; })()`);
const hexOf = (text) => Buffer.from(text, 'utf8').toString('hex');
const textOf = (hexed) => Buffer.from(hexed, 'hex').toString('utf8');
const allFiles = (p) => p.ev(`app.vault.getFiles().map(f => f.path).sort()`);
/** A binder note without its list of contents (a Longform index without its scenes): what a reorder must not touch. */
const butOrder = (hexed) => textOf(hexed).replace(/^( *)(contents|scenes):\n(?:\1 +.*\n|\1- .*\n)*/m, '');
const ordered = (p, folder) => p.ev(`${B}.orderedChildren(${file(folder)}).map(f => f.name)`);
/** The dialog on a folder's snapshots, opened without the header's button (whatever tab is in front). */
async function showDialog(p, folder = L) {
	await noNotices(p);
	await p.ev(`(() => { ${PL}.snapshotsApi.show(${file(folder)}); return 1; })()`);
	await until(p, `!!document.querySelector(${j(DLG)})`);
	await drawn(p);
}
/** "Bring back..." on the snapshot shown, with what comes back picked ("The text and the order" unless told; the
    screen itself opens on "Everything": null leaves it as it is): what the screen says. */
async function backScreen(p, scope = 'both') {
	if (!(await p.ev(`!!document.querySelector(${j(BACK)})`))) {
		// (Obsidian's own "Updated links" notices sit over the dialog's buttons, and take the click)
		await noNotices(p);
		await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...');
		await until(p, `!!document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan ul')})`, 20000);
	}
	if (scope) await p.ev(`(() => { const s = document.querySelector(${j(BACK + ' select')}); s.value = ${j(scope)}; s.dispatchEvent(new Event('change')); return 1; })()`);
	await sleep(p, 250);
	return p.ev(`(() => { const m = document.querySelector(${j(BACK)}), li = (c) => [...m.querySelectorAll('.' + c + ' li')].map(e => e.textContent); return { title: m.querySelector('.modal-title').textContent, intro: m.querySelector('.modal-content > p').textContent, options: [...m.querySelector('select').options].map(o => o.value + '=' + o.textContent), will: li('binders-folder-snapshots-plan-will'), left: li('binders-folder-snapshots-plan-left'), head: m.querySelector('.binders-folder-snapshots-plan-head')?.textContent ?? '', scope: m.querySelector('select').value, since: (() => { const s = m.querySelector('.binders-folder-snapshots-since'); return s && s.offsetParent ? s.querySelector('select').value + ': ' + s.querySelector('.setting-item-description').textContent : ''; })(), buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => b.textContent + (b.disabled ? ' (off)' : '')) }; })()`);
}
/** The screen's own button; returns what was said once it is done. */
async function confirmBack(p) {
	await noNotices(p);
	await clickIn(p, BACK + ' .modal-button-container button', 'Bring back');
	await until(p, `!document.querySelector(${j(BACK)}) && document.querySelectorAll('.notice').length > 0`, 30000);
	await settle(p);
	return notices(p);
}
/** Asks the vault side directly, with no screen: what it did, or why it wouldn't. */
const backNow = (p, title, folder = L, scope = 'both') => p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(folder)}).find(x => x.title === ${j(title)}); const r = await ${PL}.snapshotsApi.back(s, ${file(folder)}, ${j(scope)}); return 'done: ' + r.texts + ' texts, ' + r.moved + ' moved'; } catch (e) { return e.message; } })()`);

test('“Bring back...” a whole snapshot: the screen says what will change and what is left as it is; then every note that is there has the text it had, byte for byte, and the items the order they had; properties, names, folders and new notes stay; what was there is kept, and bringing that back puts everything as it was', async (p, h, t) => {
	const M = P2 + '/Marked.md', K2 = P1 + '/The old keeper.md';
	await p.ev(`app.vault.adapter.write(${j(M)}, '\\uFEFF---\\nstatus: draft\\n---\\nWindows lines.\\r\\nAnd a mark.\\r\\n').then(() => 1)`);
	await until(p, `!!${file(M)}`);
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft sent to Sam');
	const then = await bytes(p);
	// a month's work: every kind of change, and then some to the order inside two folders, a renamed note rewritten,
	// and a note with a byte-order mark and Windows line endings rewritten from outside, its status changed too
	await work(p);
	await p.ev(`(async () => {
		const store = ${B}, f = (x) => app.vault.getAbstractFileByPath(x);
		await app.vault.process(f(${j(K2)}), (t) => t + '\\nHe had kept the light for thirty years.\\n');
		await app.vault.adapter.write(${j(M)}, '\\uFEFF---\\nstatus: done\\n---\\nWindows lines.\\r\\nAnd a mark, and more.\\r\\n');
		await store.move(f(${j(A)}), f(${j(P1)}), 1);
		await store.move(f(${j(M)}), f(${j(P2)}), 2);
		await new Promise(r => setTimeout(r, 600));
		await store.flush();
	})().then(() => 1)`);
	await sleep(p, 500);
	const before = await bytes(p), files = await allFiles(p);
	t.eq(j(await contents(p)), j(['Epilogue', 'Prologue', 'Part One/', 'Part One/The old keeper', 'Part One/Arrival', 'Part Two/', 'Part Two/Storm warning', 'Part Two/The lamp room', 'Part Two/Marked', 'Part Two/The wreck']), '(the order as it stands)');
	await openDialog(p);
	await drawn(p);
	t.eq(j((await bar(p)).buttons), j(['Bring back...']), 'a snapshot shown has “Bring back...”');
	const screen = await backScreen(p);
	t.eq(screen.title, 'Bring back “Draft sent to Sam”', 'the screen is named for the snapshot');
	t.ok(/^“The Lighthouse” gets back the text and the order it had in the snapshot from .+\. A snapshot of it as it is now is taken first, so nothing is lost and this can be taken back\.$/.test(screen.intro), 'it says what comes back, and that what is there is kept first: ' + screen.intro);
	t.eq(j(screen.options), j(['all=Everything', 'both=The text and the order', 'text=The text of the notes', 'order=The order']), 'what comes back can be chosen');
	t.ok(screen.will.length === 2 && /^3 notes get the text they had: “Arrival”, “The old keeper”, “Marked”\. .*\(kept in the snapshot taken first\)\.$/.test(screen.will[0]) && /^3 items go back to where they were in the order: /.test(screen.will[1]), 'what will change: three notes’ text (the renamed one by the name it has now), three items’ place: ' + j(screen.will));
	t.eq(screen.head, 'Left as it is now:', 'and what is different that it leaves');
	t.ok(screen.left.length === 5
		&& /^1 item that is gone isn’t made again: “Lights out”\. A note can be brought back by itself: open it in the snapshot\.$/.test(screen.left[0])
		&& /^1 item stays in the folder it is in now: “Storm warning”\.$/.test(screen.left[1])
		&& /^1 item keeps the name it has now: “The old keeper” \(it was “The keeper”\)\.$/.test(screen.left[2])
		&& /^4 items keep the properties they have now: /.test(screen.left[3]) && /target/.test(screen.left[3]) && /status/.test(screen.left[3]) && /synopsis/.test(screen.left[3])
		&& /^1 item that is new since stays where it is: “The lamp room”\. Nothing is deleted\.$/.test(screen.left[4]), 'said plainly: the note that is gone, the one in another folder, the other name, the properties, the new note: ' + j(screen.left));
	t.eq(j(screen.buttons), j(['Bring back', 'Cancel']), 'and its two buttons');
	same(t, before, await bytes(p));
	t.eq(j(await allFiles(p)), j(files), 'reading the screen changes nothing, and takes no snapshot');
	const text = await backScreen(p, 'text'), order = await backScreen(p, 'order');
	t.ok(text.will.length === 1 && /^3 notes get/.test(text.will[0]) && /^3 items stay where they are in the order: /.test(text.left[0]), 'the text alone: the order is said to stay: ' + j(text.left[0]));
	t.ok(order.will.length === 1 && /^3 items go back/.test(order.will[0]) && /^3 notes keep the text they have now: /.test(order.left[0]), 'the order alone: the text is said to stay: ' + j(order.left[0]));
	await backScreen(p, 'both');
	const said = await confirmBack(p);
	const after = await bytes(p);
	// the text, byte for byte
	t.eq(after[A], then[A], '“Arrival” is, byte for byte, the file it was');
	t.eq(after[K2], then[K], 'the keeper has, under the name it has now, byte for byte the file it had');
	t.eq(after[M], hexOf('﻿---\nstatus: done\n---\nWindows lines.\r\nAnd a mark.\r\n'), 'the note with a byte-order mark: the mark, the status it has now, then its text as it was with its own line endings');
	// everything else, byte for byte
	t.eq(j(Object.keys(after).sort()), j(Object.keys(before).sort()), 'no note was made, renamed, moved or deleted');
	for (const path of Object.keys(before)) if (![A, K2, M, NOTE].includes(path)) t.eq(after[path], before[path], `“${path}” is byte for byte what it was (its text, its properties)`);
	t.eq(butOrder(after[NOTE]), butOrder(before[NOTE]), 'the binder note: nothing but its list of contents was written (its target, its other properties and its text are as they were)');
	t.ok(/target: 60000/.test(textOf(after[NOTE])), '(the target set since is still there)');
	// the order
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The old keeper', 'Part Two/', 'Part Two/Storm warning', 'Part Two/The lamp room', 'Part Two/The wreck', 'Part Two/Marked', 'Epilogue']), 'the order it had: the note that came from another folder and the new one stay where they are');
	// what was there is kept, whole, in one snapshot Binders took itself; no note has a snapshot of its own for it
	const now = await allFiles(p), made = now.filter((f) => !files.includes(f));
	t.ok(made.length === 1 && made[0].startsWith(SN + '/') && AUTO.test(made[0].slice(SN.length + 1)) && / Before bringing back Draft sent to Sam\.auto\.binder-snapshot$/.test(made[0]), 'one file was made: the snapshot taken first, named for why, marked as Binders’ own: ' + j(made));
	t.eq(j(files.filter((f) => !now.includes(f))), j([]), 'and none is gone');
	const kept = await snapshot(p, made[0]);
	t.eq(kept.head.why, '"Before bringing back Draft sent to Sam"', 'it says why it was taken');
	for (const i of kept.items.filter((x) => x.text != null)) t.eq(hexOf(i.text), before[`${L}/${i.path}`], `“${i.path}” is in it exactly as it was just before`);
	t.eq(kept.items.filter((x) => x.text != null).length, Object.keys(before).filter((f) => f.startsWith(L + '/')).length, 'every note of the binder');
	t.ok(/^Brought back the text of 3 notes and the place of 3 items in the order from “Draft sent to Sam”\. “The Lighthouse” as it was just before is kept as the snapshot “Before bringing back Draft sent to Sam”\.$/.test(said), 'it says what it did, and where what was there is: ' + said);
	// the dialog is still open, and says what is still different
	await drawn(p);
	t.eq((await rows(p)).map((r) => r[0]).join('|'), 'The binder now|Before bringing back Draft sent to Sam|Draft sent to Sam', 'the list has the one taken first');
	await pickRow(p, 'Draft sent to Sam');
	t.ok(!/rewritten/.test(await key(p)) && /1 new, 1 gone, 1 moved, 1 renamed, 4 with other properties/.test(await key(p)), 'against the snapshot now: no note reads differently; what was left is still said: ' + await key(p));
	// and back again: the one taken first, brought back, puts every byte where it was
	await pickRow(p, 'Before bringing back Draft sent to Sam');
	const undo = await backScreen(p);
	t.ok(/^3 notes get the text they had:/.test(undo.will[0]) && /^3 items go back/.test(undo.will[1]) && !undo.left.length, 'the snapshot taken first: the same three notes and three items, and nothing it would leave: ' + j(undo));
	const saidAgain = await confirmBack(p);
	same(t, before, await bytes(p));
	t.ok(/^Brought back the text of 3 notes and the place of 3 items in the order from “Before bringing back Draft sent to Sam”\. .* is kept as the snapshot “Before bringing back the one from \d{4}-\d\d-\d\d \d\d\.\d\d”\.$/.test(saidAgain), 'and that, too, kept what it replaced first: ' + saidAgain);
	t.eq((await list(p)).length, 3, 'three snapshots now, none written over');
	t.eq(await hex(p, made[0]), hexOf(await exact(p, made[0])), '(the one taken first is still its own file)');
}, 120000);

test('bringing back with a note open: what is typed and not saved is saved into the snapshot taken first; the note is replaced in its editor, and one Undo there takes that back; “Undo” of the binder’s order takes the order back', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft');
	const then = await bytes(p);
	await p.ev(`(async () => { await ${B}.move(${file(E)}, ${file(L)}, 0); await ${B}.flush(); await app.vault.process(${file(W)}, (t) => t + '\\nWritten since, in a note that is closed.\\n'); })().then(() => 1)`);
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(A)}, { state: { mode: 'source' } }).then(() => 1)`);
	await sleep(p, 600);
	const ED = `app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(A)}).view.editor`;
	await p.ev(`(() => { const e = ${ED}; e.replaceRange('\\nTYPED-IN-A-TAB, not saved.', { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); return 1; })()`);
	t.ok(!(await read(p, A)).includes('TYPED-IN-A-TAB'), '(what was typed is not on the disk yet)');
	const mid = await bytes(p);
	await showDialog(p);
	const screen = await backScreen(p);
	t.ok(/^2 notes get the text they had: “Arrival”, “The wreck”\./.test(screen.will[0]) && /^1 item goes back to where it was in the order: “Epilogue”\.$/.test(screen.will[1]), 'the screen counts the note being typed in: ' + j(screen.will));
	const said = await confirmBack(p);
	t.ok(/^Brought back the text of 2 notes and the place of 1 item in the order from “Draft”\./.test(said), said);
	const auto = (await list(p)).find((f) => AUTO.test(f)), kept = await snapshot(p, `${SN}/${auto}`);
	t.ok(kept.items.find((i) => i.path === 'Part One/Arrival.md').text.endsWith('TYPED-IN-A-TAB, not saved.'), 'what was typed and not saved is in the snapshot taken first');
	t.ok(kept.items.find((i) => i.path === 'Part Two/The wreck.md').text.endsWith('Written since, in a note that is closed.\n'), 'and so is the closed note’s text');
	const after = await bytes(p);
	t.eq(after[A], then[A], 'the open note is byte for byte the file it was');
	t.eq(after[W], then[W], 'and so is the closed one');
	t.ok(!(await p.ev(`${ED}.getValue()`)).includes('TYPED-IN-A-TAB'), 'the editor shows the text brought back');
	for (const path of Object.keys(mid)) if (![A, W, NOTE].includes(path)) t.eq(after[path], mid[path], `“${path}” is unchanged`);
	t.eq(j(await contents(p)), j(ORDER.map((x) => x.replace(/\.md$/, ''))), 'the order is the one it had');
	// one Undo in the note's editor
	await closeAll(p);
	await p.ev(`(() => { ${ED}.undo(); return 1; })()`);
	await until(p, `app.vault.adapter.read(${j(A)}).then(s => s.includes('TYPED-IN-A-TAB'))`, 8000);
	t.ok((await read(p, A)).endsWith('TYPED-IN-A-TAB, not saved.'), 'one Undo in the editor: the note says again what it said, to the last word typed');
	t.eq((await bytes(p))[W], then[W], '(the closed note is not the editor’s to undo: its text is in the snapshot taken first)');
	// the order, by the binder's own Undo
	t.eq(await p.ev(`${B}.undoable(${file(L)})`), 'Bring back the order', 'the binder’s Undo is the order brought back');
	await p.ev(`${B}.undo(${file(L)}).then(() => ${B}.flush()).then(() => 1)`);
	await sleep(p, 400);
	t.eq((await contents(p))[0], 'Epilogue', 'Undo: the epilogue is first again, as it was before the order came back');
});

test('a note changed from outside after the screen was read, or after the snapshot taken first was written, is left as it is and named; the other notes come back; no word is lost', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft');
	const then = await bytes(p);
	await p.ev(`(async () => { for (const x of ${j([A, K, S, W])}) await app.vault.process(app.vault.getAbstractFileByPath(x), (t) => t + '\\nWritten since.\\n'); })().then(() => 1)`);
	await sleep(p, 300);
	const before = await bytes(p);
	await openDialog(p);
	await drawn(p);
	const screen = await backScreen(p, 'text');
	t.ok(/^4 notes get the text they had: /.test(screen.will[0]), 'the screen: four notes: ' + j(screen.will));
	// from outside (a sync, another program), while the screen is open
	const OUT1 = textOf(before[K]) + 'Typed on another device while the screen was open.\n';
	await writeRaw(p, K, OUT1);
	await sleep(p, 900);
	// from outside, the moment the snapshot of what is there has been written and before any note is
	const OUT2 = textOf(before[S]) + 'Typed on another device between the snapshot and the write.\n';
	await p.ev(`(() => { const v = app.vault, make = v.create; v.create = async function (path, ...rest) { const f = await make.call(this, path, ...rest); if (/\\.auto\\.binder-snapshot$/.test(path)) { delete v.create; window.bindersTestHook = 'ran'; await v.adapter.write(${j(S)}, ${j(OUT2)}); } return f; }; return 1; })()`);
	const said = await confirmBack(p);
	t.eq(await p.ev(`(() => { const ran = window.bindersTestHook; delete window.bindersTestHook; return ran + (Object.prototype.hasOwnProperty.call(app.vault, 'create') ? ', still there' : ', gone'); })()`), 'ran, gone', '(the test’s hook ran, and is gone)');
	const after = await bytes(p);
	t.eq(after[A], then[A], '“Arrival” came back, byte for byte');
	t.eq(after[W], then[W], '“The wreck” came back, byte for byte');
	t.eq(textOf(after[K]), OUT1, 'the note changed while the screen was open is left, with every word typed from outside');
	t.eq(textOf(after[S]), OUT2, 'the note changed after the snapshot was taken is left too: the write refused it');
	t.ok(/^Brought back the text of 2 notes from “Draft”\. 2 notes were left as they are: “The keeper” \(changed meanwhile\), “Storm warning” \(changed meanwhile\)\. “The Lighthouse” as it was just before is kept as the snapshot “Before bringing back Draft”\.$/.test(said), 'it says which were left, and why: ' + said);
	const auto = (await list(p)).find((f) => AUTO.test(f)), kept = await snapshot(p, `${SN}/${auto}`);
	t.eq(kept.items.find((i) => i.path === 'Part One/The keeper.md').text, OUT1, 'the snapshot taken first holds the first note as it was changed from outside');
	t.eq(hexOf(kept.items.find((i) => i.path === 'Part One/Storm warning.md').text), before[S], 'and the second as it was when it was taken: what came after is in the note');
	for (const path of [A, W]) t.eq(hexOf(kept.items.find((i) => `${L}/${i.path}` === path).text), before[path], `and what “${path}” said before it was replaced`);
	for (const path of Object.keys(before)) if (![A, K, S, W].includes(path)) t.eq(after[path], before[path], `“${path}” is unchanged`);
	// the order, when the items are no longer what the screen was drawn from: left, and said
	await closeAll(p);
	await p.ev(`(async () => { await ${B}.move(${file(E)}, ${file(L)}, 0); await ${B}.flush(); })().then(() => 1)`);
	await openDialog(p);
	await pickRow(p, 'Draft');
	const order = await backScreen(p, 'order');
	t.ok(/^1 item goes back to where it was in the order: “Epilogue”\.$/.test(order.will[0]), 'the order alone: ' + j(order.will));
	await p.ev(`${B}.newScene(${file(L)}, 1, 'Arrived meanwhile', undefined, 'A note another device made.\\n').then(() => ${B}.flush()).then(() => 1)`);
	await sleep(p, 500);
	const mid = await bytes(p);
	const saidOrder = await confirmBack(p);
	t.ok(/^Nothing was brought back from “Draft”\. The order was left as it is: the items changed meanwhile\.$/.test(saidOrder), 'a note arrived while the screen was open: the order is left, and it says so: ' + saidOrder);
	same(t, mid, await bytes(p));
}, 120000);

test('a Longform project brought back: its scenes’ text byte for byte, and Longform’s order, written to its list of scenes and nowhere else in the index note', async (p, h, t) => {
	const D = 'Longform demo', I = D + '/Index.md', DS = D + '/Snapshots';
	await openView(p, D);
	const got = await take(p, DS);
	await age(p, got.files[0], '2026-09-19 16.20.05 Ferry draft', DS);
	const then = await bytes(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await ${B}.move(f(${j(D + '/Return.md')}), f(${j(D)}), 0); await ${B}.move(f(${j(D + '/Island.md')}), f(${j(D)}), 1); await ${B}.flush(); await app.vault.process(f(${j(D + '/Island.md')}), (t) => t + 'More.\\n'); await app.vault.process(f(${j(D + '/Notes on ferries.md')}), (t) => t + 'A line in the note Longform leaves out.\\n'); })().then(() => 1)`);
	await sleep(p, 500);
	const before = await bytes(p);
	t.eq(j(await ordered(p, D)), j(['Return.md', 'Island.md', 'Harbor.md', 'Ticket office.md', 'The crossing.md']), '(the order as it stands)');
	await openDialog(p);
	await drawn(p);
	const screen = await backScreen(p);
	t.ok(/^1 note gets the text it had: “Island”\./.test(screen.will[0]) && /^2 items go back to where they were in the order: “Island”, “Return”\.$/.test(screen.will[1]) && !screen.left.length, 'the screen: ' + j(screen));
	const said = await confirmBack(p);
	const after = await bytes(p);
	t.eq(after[D + '/Island.md'], then[D + '/Island.md'], 'the scene is byte for byte the file it was');
	t.eq(j(await ordered(p, D)), j(['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Return.md']), 'the scenes are in the order Longform had them');
	t.eq(butOrder(after[I]), butOrder(before[I]), 'the index note: nothing but its list of scenes was written');
	t.ok(/sceneFolder: \/\n/.test(textOf(after[I])) && /ignoredFiles:\n\s+- Notes\*/.test(textOf(after[I])) && textOf(after[I]).endsWith(bodyOf(textOf(then[I]))), 'its other settings and its text are there');
	for (const path of Object.keys(before)) if (![D + '/Island.md', I].includes(path)) t.eq(after[path], before[path], `“${path}” is unchanged (the note Longform leaves out among them)`);
	const autos = (await list(p, DS)).filter((f) => AUTO.test(f));
	t.eq(autos.length, 1, 'the snapshot taken first is in the project’s own folder of snapshots');
	t.ok(/^Brought back the text of 1 note and the place of 2 items in the order from “Ferry draft”\./.test(said), said);
});

test('a folder brought back from a snapshot of the whole binder: its notes and its order come back, and nothing outside it is touched', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft sent to Sam');
	const then = await bytes(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); for (const x of ${j([A, W])}) await app.vault.process(f(x), (t) => t + '\\nWritten since.\\n'); await ${B}.move(f(${j(S)}), f(${j(P1)}), 0); await ${B}.move(f(${j(E)}), f(${j(L)}), 0); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 400);
	const before = await bytes(p), files = await allFiles(p);
	await openView(p, P1);
	await openDialog(p);
	await pickRow(p, 'Draft sent to Sam');
	t.ok(/In the whole binder/.test((await rows(p)).find((r) => r[0] === 'Draft sent to Sam')[1]), 'the folder’s list has the binder’s snapshot');
	const screen = await backScreen(p);
	t.ok(/^“Part One” gets back the text and the order it had/.test(screen.intro), 'the screen is about the folder: ' + screen.intro);
	t.ok(screen.will.length === 2 && /^1 note gets the text it had: “Arrival”\./.test(screen.will[0]) && /^1 item goes back to where it was in the order: “Storm warning”\.$/.test(screen.will[1]) && !screen.left.length, 'and counts only what is in it: ' + j(screen));
	const said = await confirmBack(p);
	const after = await bytes(p);
	t.eq(after[A], then[A], 'the folder’s note is byte for byte the file it was');
	t.eq(j(await ordered(p, P1)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'the folder’s items are in the order they had');
	t.eq(after[W], before[W], 'a note in another folder keeps what was written since');
	t.eq((await contents(p))[0], 'Epilogue', 'and the binder’s own order is as it was a moment ago');
	for (const path of Object.keys(before)) if (![A, NOTE].includes(path)) t.eq(after[path], before[path], `“${path}” is unchanged`);
	t.eq(butOrder(after[NOTE]), butOrder(before[NOTE]), 'the binder note: only its list of contents');
	const made = (await allFiles(p)).filter((f) => !files.includes(f));
	t.ok(made.length === 1 && made[0].startsWith(SN + '/Part One/') && / Before bringing back Draft sent to Sam\.auto\.binder-snapshot$/.test(made[0]), 'the snapshot taken first is the folder’s own: ' + j(made));
	const kept = await snapshot(p, made[0]);
	t.eq(j([kept.head.of, kept.items.map((i) => i.path)]), j(['"Part One"', ['Storm warning.md', 'Arrival.md', 'The keeper.md']]), 'of the folder, as it was just before');
	t.eq(hexOf(kept.items.find((i) => i.path === 'Arrival.md').text), before[A], 'with the text that was replaced');
	t.ok(/^Brought back the text of 1 note and the place of 1 item in the order from “Draft sent to Sam”\. “Part One” as it was just before is kept as the snapshot “Before bringing back Draft sent to Sam”\.$/.test(said), said);
});

test('nothing is brought back from a snapshot that can’t be trusted, or into a binder that can’t be changed: items that say they are somewhere else, a file changed by hand, a newer format; no note changes and no snapshot is taken', async (p, h, t) => {
	await openView(p);
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(L)}, 'Real')`);
	await until(p, `${PL}.snapshotsApi.list(${file(L)}).some(x => x.title === 'Real')`, 20000);
	const real = (await list(p))[0], text = await exact(p, `${SN}/${real}`);
	const crafted = text.replace('"Prologue.md"', '"../../climbed-out-of-the-vault.md"').replace('"Epilogue.md"', '"../climbed-out-of-the-folder.md"').replace('"Part One/Arrival.md"', '"Part One/../../Arrival.md"');
	t.ok(parse(crafted).items.filter((i) => i.path.includes('../')).length === 3, 'a snapshot’s file with three paths changed, each note’s length and fingerprint still right');
	await writeRaw(p, `${SN}/2020-01-01 10.00.00 Crafted.binder-snapshot`, crafted);
	await writeRaw(p, `${SN}/2020-01-02 10.00.00 Changed.binder-snapshot`, text.replace('The supply boat left Mara', 'The supply boat left Mary'));
	await writeRaw(p, `${SN}/2027-01-01 10.00.00 From the future.binder-snapshot`, text.replace('binder-snapshot: 1', 'binder-snapshot: 2'));
	await until(p, `${PL}.snapshotsApi.list(${file(L)}).length === 4`, 8000);
	// every note the snapshots hold is different now, and so is the order: there is plenty to bring back
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); for (const x of ${j([L + '/Prologue.md', A, E])}) await app.vault.process(f(x), (t) => t + '\\nWritten since.\\n'); await ${B}.move(f(${j(E)}), f(${j(L)}), 0); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 400);
	const before = await bytes(p), files = await allFiles(p);
	const crafty = await backNow(p, 'Crafted'), changed = await backNow(p, 'Changed'), future = await backNow(p, 'From the future');
	t.ok(/isn’t as it was written|outside its folder/.test(crafty) && /nothing was brought back/.test(crafty), 'items that say they are somewhere else: refused (' + crafty + ')');
	t.eq(changed, 'This snapshot’s file isn’t as it was written, so nothing was brought back from it.', 'a file changed by hand: refused');
	t.ok(/^This snapshot was made by a newer version of Binders/.test(future), 'a newer format: refused (' + future + ')');
	same(t, before, await bytes(p));
	t.eq(j(await allFiles(p)), j(files), 'no file was made in the vault: not even a snapshot of what is there, since nothing was to change');
	t.ok(!existsSync(join(p.vaultDir, 'climbed-out-of-the-folder.md')) && !existsSync(join(dirname(p.vaultDir), 'climbed-out-of-the-vault.md')) && !existsSync(join(p.vaultDir, 'Arrival.md')), 'and none beside the binder or outside the vault');
	await openDialog(p);
	await pickRow(p, 'Changed');
	t.eq(j((await bar(p)).buttons), j(['Bring back... (off)']), 'in the dialog, “Bring back...” is off for a file that isn’t as it was written');
	await pickRow(p, 'Real');
	t.eq(j((await bar(p)).buttons), j(['Bring back...']), '(and on for one that is)');
	await closeAll(p);
	// a binder in a newer format: nothing is written in it at all
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem(${file(A)})`);
	await sleep(p, 500);
	const frozen = await bytes(p), frozenFiles = await allFiles(p);
	const newer = await backNow(p, 'Real');
	t.ok(/can’t be changed/.test(newer), 'a binder in a newer format: refused (' + newer + ')');
	same(t, frozen, await bytes(p));
	t.eq(j(await allFiles(p)), j(frozenFiles), 'and no snapshot is taken in it');
	await showDialog(p);
	await pickRow(p, 'Real');
	t.eq(j((await bar(p)).buttons), j([]), 'its dialog offers no “Bring back...”');
});

test('the snapshot taken first is the newest one itself when that already holds exactly what is there; a second bringing back of the same snapshot has nothing to do', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft');
	await p.ev(`(async () => { await app.vault.process(${file(A)}, (t) => t + '\\nWritten since.\\n'); await ${B}.move(${file(E)}, ${file(L)}, 0); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 300);
	const mine = await take(p);
	t.ok(mine.made && mine.files.length === 2, 'the writer takes one of the binder as it is');
	const before = await bytes(p);
	await openDialog(p);
	await pickRow(p, 'Draft');
	await backScreen(p, 'text');
	const said = await confirmBack(p);
	t.eq((await list(p)).length, 2, 'bringing back takes no other: the one just taken holds exactly what was there');
	t.ok(/^Brought back the text of 1 note from “Draft”\. “The Lighthouse” as it was just before is kept as the snapshot from /.test(said), 'and it says which one that is: ' + said);
	const kept = await snapshot(p, `${SN}/${mine.files.find((f) => !/Draft/.test(f))}`);
	t.eq(hexOf(kept.items.find((i) => i.path === 'Part One/Arrival.md').text), before[A], 'the text that was replaced is in it');
	// now the text is back, and the order isn't: the same snapshot again
	await pickRow(p, 'Draft');
	const again = await backScreen(p, 'text');
	t.ok(/^Nothing: the notes that are there have the text they had\.$/.test(again.will[0]) && again.buttons[0] === 'Bring back (off)' && /^1 item stays where it is in the order: “Epilogue”\.$/.test(again.left[0]), 'the text alone: nothing to do, and the button is off: ' + j(again));
	const order = await backScreen(p, 'order');
	t.ok(/^1 item goes back/.test(order.will[0]) && order.buttons[0] === 'Bring back', 'the order alone: there is that to do: ' + j(order.will));
	const saidOrder = await confirmBack(p);
	t.ok(/^Brought back the place of 1 item in the order from “Draft”\./.test(saidOrder), saidOrder);
	t.eq(j(await contents(p)), j(ORDER.map((x) => x.replace(/\.md$/, ''))), 'the order is back');
	t.eq((await list(p)).filter((f) => AUTO.test(f)).length, 1, 'and before that, one was taken: the text had changed since the last');
	await drawn(p);
	await pickRow(p, 'Draft');
	t.eq(j((await bar(p)).buttons), j(['Bring back... (off)']), 'the binder is as the snapshot has it: “Bring back...” is off');
});

// ---- bringing a whole one back: everything ----
// Each test changes the binder, brings a snapshot back with "Everything", and compares the vault byte for byte with
// what it held when the snapshot was taken: every note that was there is the file it was, at the path it had. What
// may be there besides is only what the screen said stays (the notes new since) and what Binders keeps for itself
// (the snapshot taken first, and its written plan). Then, where it says so, the snapshot taken first is brought
// back the same way, and the vault is compared with what it held just before.

const JOURNAL = SN + '/Bringing back.binder-journal';
const CUT = '.modal.binders-folder-snapshots-interrupted';
const allFolders = (p) => p.ev(`app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/').map(f => f.path).sort()`);
/** Every note that was there is, byte for byte, the file it was, at the path it had (but the ones named). */
function back(t, then, after, { but = [], as = 'the file the snapshot holds' } = {}) { for (const [path, hexed] of Object.entries(then)) if (!but.includes(path)) t.eq(after[path], hexed, `“${path}” is byte for byte ${as}`); }
/** The notes that are there now and weren't. */
const added = (then, after) => Object.keys(after).filter((k) => !(k in then)).sort();
/** Asks the vault side for everything, with no screen: what it did, or why it wouldn't. */
const backAll = (p, title, folder = L, since = 'stay') => p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(folder)}).find(x => x.title === ${j(title)}); const r = await ${PL}.snapshotsApi.back(s, ${file(folder)}, 'all', ${j(since)}); return 'done: ' + JSON.stringify([r.again, r.placed, r.files, r.ordered, r.gathered, r.left]); } catch (e) { return e.message; } })()`);
const journal = (p, path = JOURNAL) => p.ev(`app.vault.adapter.exists(${j(path)}).then(ok => ok ? app.vault.adapter.read(${j(path)}).then(JSON.parse) : null)`);
const leadsTo = (p, link, from) => p.ev(`app.metadataCache.getFirstLinkpathDest(${j(link)}, ${j(from)})?.path ?? null`);
/** Renames and moves have settled, the order is written, and Obsidian has read the notes again. */
const settled = async (p) => { await settle(p); await sleep(p, 700); };
/** What Binders said itself (Obsidian says "Updated links" of its own accord). */
const ours = (said) => said.split('|').find((x) => /^Brought back|^Nothing was brought back|so nothing was brought back/.test(x)) ?? said;
/** The screen's second choice: what becomes of what is new since. */
async function since(p, v) {
	await p.ev(`(() => { const s = document.querySelector(${j(BACK + ' .binders-folder-snapshots-since select')}); s.value = ${j(v)}; s.dispatchEvent(new Event('change')); return 1; })()`);
	return backScreen(p, null);
}
/** A snapshot of the binder the view shows, named, and dated before today. */
async function draft(p, title = 'Draft', dir = SN) {
	const first = await take(p, dir);
	await age(p, first.files[first.files.length - 1], `2026-09-19 16.20.05 ${title}`, dir);
}
const LONG = (tag) => [1, 2, 3, 4].map((n) => `Paragraph ${n} of ${tag}, with enough words in it to be told from any other note.`).join('\n\n') + '\n';

test('“Everything”: the screen opens on it and says, in counts and names, what will be made again, renamed, moved, rewritten and given its properties, and what is new and stays; then every note that was there is the file it was, where it was, byte for byte; links and a note’s own snapshots follow the names; nothing is deleted; and the snapshot taken first, brought back, returns every byte', async (p, h, t) => {
	const OUT = 'Outside.md', HAND = P2 + '/By hand.md', K2 = P1 + '/The old keeper.md';
	await writeRaw(p, HAND, '---\n# a comment the writer left\ntags: [sea, "night watch"]\nstatus: \'First draft\'\nsynopsis: >-\n  The lamp,\n  and the dark.\n---\nSee [[The keeper]] and [[Arrival|how she came]].\n');
	await writeRaw(p, OUT, 'From outside the binder: [[The keeper]] and [[Part One/Arrival]].\n');
	await until(p, `!!${file(HAND)} && !!${file(OUT)}`);
	await sleep(p, 800);
	await openView(p);
	await p.ev(`${PL}.snapshotsApi.take(${file(K)}, 'Keeper as drafted').then(() => 1)`);
	await until(p, `app.vault.adapter.exists(${j(SN + '/Part One/The keeper')})`, 8000);
	await draft(p, 'Draft sent to Sam');
	const then = await bytes(p), thenFolders = await allFolders(p);
	// a month's work: a note rewritten, one moved to another folder, one renamed (its links and its snapshots go
	// along), one deleted, one new, properties changed (those written by hand rewritten in Obsidian's own form), a
	// folder given a note of its own, the binder a target, the order changed
	await work(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await app.fileManager.processFrontMatter(f(${j(HAND)}), (fm) => { fm.status = 'Done'; fm.tags.push('rewritten'); }); await app.vault.process(f(${j(HAND)}), (x) => x + 'A line more.\\n'); })().then(() => 1)`);
	await settled(p);
	const before = await bytes(p), files = await allFiles(p);
	t.ok(textOf(before[OUT]).includes('[[The old keeper]]') && textOf(before[HAND]).includes('[[The old keeper]]') && !textOf(before[HAND]).includes('# a comment'), '(as things stand: the links followed the rename, and the properties written by hand were written again by Obsidian)');
	t.ok(await exists(p, SN + '/Part One/The old keeper') && !(await exists(p, SN + '/Part One/The keeper')), '(and the note’s own snapshots followed it)');
	await openDialog(p);
	await drawn(p);
	const screen = await backScreen(p, null);
	t.eq(screen.scope, 'all', 'the screen opens on “Everything”');
	t.ok(/^“The Lighthouse” goes back to the snapshot from .+: its notes as they were, with their properties, what is gone made again, and what was renamed or moved put back\. Nothing is deleted\. A snapshot of it as it is now is taken first, so nothing is lost and this can be taken back\.$/.test(screen.intro), 'it says what comes back, that nothing is deleted, and that what is there is kept first: ' + screen.intro);
	t.ok(screen.will.length === 6
		&& /^2 notes get the text they had: “Arrival”, “By hand”\. .*\(kept in the snapshot taken first\)\.$/.test(screen.will[0])
		&& /^1 item that is gone is made again: “Lights out”\.$/.test(screen.will[1])
		&& /^1 item goes back to the folder it was in: “Storm warning”\.$/.test(screen.will[2])
		&& /^\d+ items? go(es)? back to where (it was|they were) in the order: /.test(screen.will[3])
		&& /^1 item gets its old name back: “The old keeper” becomes “The keeper”\.$/.test(screen.will[4])
		&& /^\d+ items get the properties they had: /.test(screen.will[5]) && /target/.test(screen.will[5]) && /status/.test(screen.will[5]) && /tags/.test(screen.will[5]), 'what will change, by count and by name: text, made again, moved back, the order, renamed back, properties: ' + j(screen.will));
	t.eq(screen.head, 'Left as it is now:', 'and what stays');
	t.ok(screen.left.length === 2 && /^1 item that is new since stays where it is: “The lamp room”\. Nothing is deleted\.$/.test(screen.left[0]) && /^1 folder keeps the note made for it since: “Part One”\.$/.test(screen.left[1]), 'the note that is new, and the folder’s note made since: ' + j(screen.left));
	t.eq(screen.since, 'stay: Stays where it is, after the item it follows now.', 'what is new since has its own choice, which leaves it where it is');
	t.eq(j(screen.buttons), j(['Bring back', 'Cancel']), 'and the two buttons');
	same(t, before, await bytes(p));
	t.eq(j(await allFiles(p)), j(files), 'reading the screen changes nothing');
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	// every note that was there, byte for byte, where it was: text, properties as they were written, the note outside
	back(t, then, after, { but: [NOTE] });
	t.ok(textOf(after[HAND]).includes('# a comment the writer left\ntags: [sea, "night watch"]\nstatus: \'First draft\''), '(the properties written by hand are the writer’s own lines again: the comment, the list on one line, the quotes)');
	t.eq(j(added(then, after)), j([P1 + '/Part One.md', P2 + '/The lamp room.md']), 'the only notes besides are the ones the screen said stay: the new note, and the folder’s note made since');
	for (const path of added(then, after)) t.eq(after[path], before[path], `“${path}”, new since, is untouched`);
	t.eq(j(await allFolders(p)), j(thenFolders), 'the folders are the folders there were');
	// the binder note: everything but the order as it was (the new note is in the order now)
	t.eq(butOrder(after[NOTE]), butOrder(then[NOTE]), 'the binder note is as it was but for its list of contents: the target set since is gone');
	t.eq(j([await ordered(p, L), await ordered(p, P1), await ordered(p, P2)]), j([['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md'], ['Arrival.md', 'The keeper.md', 'Storm warning.md'], ['The lamp room.md', 'The wreck.md', 'Lights out.md', 'By hand.md']]), 'the order it had, with the new note where it is (it follows nothing that was there)');
	// links, and the note's own snapshots
	t.eq(await leadsTo(p, 'The keeper', OUT), K, 'the link from outside the binder leads to the note under the name it has again');
	t.ok((await exists(p, SN + '/Part One/The keeper')) && !(await exists(p, SN + '/Part One/The old keeper')), 'the note’s own snapshots followed it back');
	// what was made, and what is gone: one snapshot and the plan; no note
	const now = await allFiles(p), made = now.filter((f) => !files.includes(f)), gone = files.filter((f) => !now.includes(f));
	const auto = made.find((f) => / Before bringing back Draft sent to Sam\.auto\.binder-snapshot$/.test(f));
	t.ok(!!auto && made.includes(P2 + '/Lights out.md') && made.includes(JOURNAL) && made.every((f) => [auto, JOURNAL, P2 + '/Lights out.md', K, S].includes(f) || f.startsWith(SN + '/Part One/The keeper/')), 'what is there that wasn’t: the note that was gone, the snapshot taken first and the plan (and two notes at the paths they had): ' + j(made));
	t.ok(gone.every((f) => f === K2 || f === P2 + '/Storm warning.md' || f.startsWith(SN + '/Part One/The old keeper/')), 'nothing is gone but by its name: ' + j(gone));
	const kept = await snapshot(p, auto);
	for (const i of kept.items.filter((x) => x.text != null)) t.eq(hexOf(i.text), before[`${L}/${i.path}`], `“${i.path}” is in the snapshot taken first exactly as it was just before`);
	t.ok(/^Brought back “Draft sent to Sam”: 1 item made again, 2 items put back where they were, \d+ notes as they were, the order\. Nothing was deleted\. “The Lighthouse” as it was just before is kept as the snapshot “Before bringing back Draft sent to Sam”: bring that one back to take this back \(“Undo last move” doesn’t\)\.$/.test(said), 'it says what it did, that nothing was deleted, and how to take it back: ' + said);
	const plan = await journal(p);
	t.ok(plan && plan.journal === 1 && plan.finished > 0 && plan.title === 'Draft sent to Sam' && j(plan.plan.made) === j(['Part Two/Lights out.md']) && j(plan.plan.moved) === j([['Part One/The old keeper.md', 'Part One/The keeper.md'], ['Part Two/Storm warning.md', 'Part One/Storm warning.md']]), 'the plan that was written down is marked as finished, and says what it was: ' + j(plan));
	t.eq(await p.ev(`${B}.undoable(${file(L)})`), null, '“Undo last move” has nothing of this to take back');
	// and back again: the snapshot taken first puts every byte where it was; the note made again stays
	await drawn(p);
	await pickRow(p, 'Before bringing back Draft sent to Sam');
	const undo = await backScreen(p, null);
	t.ok(undo.left.length === 1 && /^1 item that is new since stays where it is: “Lights out”\. Nothing is deleted\.$/.test(undo.left[0]), 'the snapshot taken first: the note made again is new to it, and stays: ' + j(undo));
	const saidAgain = ours(await confirmBack(p));
	await settled(p);
	const again = await bytes(p);
	back(t, before, again, { but: [NOTE], as: 'the file it was just before' });
	t.eq(j(added(before, again)), j([P2 + '/Lights out.md']), 'and nothing was deleted: the note made again is still there');
	t.eq(butOrder(again[NOTE]), butOrder(before[NOTE]), 'the binder note too, but for its list of contents');
	t.ok(/^Brought back “Before bringing back Draft sent to Sam”: /.test(saidAgain), saidAgain);
}, 180000);

test('“Everything”, names: two notes that changed names with each other, a name that differs only in its capitals, and a name a new note has now (that note keeps it, and the screen says so; moved to the one folder, it frees the name); links lead where they led', async (p, h, t) => {
	const OUT = 'Outside.md', PR = L + '/Prologue.md', OP = L + '/Opening.md';
	await writeRaw(p, OUT, 'Links: [[Arrival]], [[The keeper]], [[Epilogue]].\n');
	// (notes of some length: a short note at an old path is taken for the old note, rewritten, whatever it says; so
	// two short notes that change names with each other get their texts back, not their names)
	await writeRaw(p, PR, '---\nstatus: draft\n---\n' + LONG('the first opening'));
	await writeRaw(p, A, '---\nstatus: revised\n---\n' + LONG('the arrival'));
	await writeRaw(p, K, LONG('the keeper'));
	await until(p, `!!${file(OUT)}`);
	await sleep(p, 800);
	await openView(p);
	await p.ev(`${PL}.snapshotsApi.take(${file(A)}, 'Arrival as drafted').then(() => 1)`);
	await until(p, `app.vault.adapter.exists(${j(SN + '/Part One/Arrival')})`, 8000);
	const mine = (await p.ev(`app.vault.adapter.list(${j(SN + '/Part One/Arrival')}).then(l => l.files)`))[0], held = await hex(p, mine);
	await draft(p);
	const then = await bytes(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x), mv = (a, b) => app.fileManager.renameFile(f(a), b);
		await mv(${j(A)}, ${j(P1 + '/Third.md')}); await mv(${j(K)}, ${j(A)}); await mv(${j(P1 + '/Third.md')}, ${j(K)});
		await mv(${j(E)}, ${j(L + '/epilogue.md')});
		await mv(${j(PR)}, ${j(OP)});
		await ${B}.newScene(f(${j(L)}), 0, 'Prologue', undefined, ${j(LONG('another opening'))});
	})().then(() => 1)`);
	await settled(p);
	const before = await bytes(p);
	t.ok(before[A] === then[K] && before[K] === then[A] && !!before[L + '/epilogue.md'] && before[OP] === then[PR], '(as things stand: the two notes have each other’s names, the capital is gone, the prologue has another name and a new note has its own)');
	await showDialog(p);
	const screen = await backScreen(p, null);
	t.ok(screen.will.some((x) => /^3 items get their old names back: /.test(x) && x.includes('“The keeper” becomes “Arrival”') && x.includes('“Arrival” becomes “The keeper”') && x.includes('“epilogue” becomes “Epilogue”')), 'three names come back, each said as what becomes what: ' + j(screen.will));
	t.ok(screen.left.some((x) => /^1 item that is new since stays where it is: “Prologue”\. Nothing is deleted\.$/.test(x)) && screen.left.some((x) => /^1 item can’t have the name it had, which an item new since has now: “Prologue” will be “Opening”\.$/.test(x)), 'the new note keeps its name, and the note that had it keeps the one it has now: both said: ' + j(screen.left));
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	back(t, then, after, { but: [NOTE, PR] });
	t.eq(after[OP], then[PR], 'the prologue is the file it was, under the name it keeps');
	t.eq(after[PR], before[PR], 'and the new note that has its name is untouched');
	t.eq(j(added(then, after)), j([OP]), 'no other note is there');
	t.ok((await allFiles(p)).includes(E) && !(await allFiles(p)).includes(L + '/epilogue.md'), 'the capital is back in the file’s name');
	t.eq(textOf(after[OUT]), 'Links: [[Arrival]], [[The keeper]], [[Epilogue]].\n', 'the note outside the binder says what it said: its links followed each name there and back');
	t.eq(j([await leadsTo(p, 'Arrival', OUT), await leadsTo(p, 'The keeper', OUT)]), j([A, K]), 'and they lead to the notes they led to');
	t.eq(await hex(p, mine), held, 'the note’s own snapshot is where it was, the same file: it went with the note, and came back with it');
	t.eq((await p.ev(`app.vault.adapter.list(${j(SN + '/Part One')}).then(l => l.folders.map(f => f.split('/').pop()).sort())`)).join(), 'Arrival', 'and no folder of snapshots is left under a name the note passed through');
	t.ok(/^Brought back “Draft”: 3 items put back where they were/.test(said), said);
	// the choice: what is new goes to one folder, and the old name is free
	await drawn(p);
	await pickRow(p, 'Draft');
	const first = await backScreen(p, null), gather = await since(p, 'gather');
	t.ok(first.since.startsWith('stay: ') && gather.since === 'gather: Goes into one folder at the end. Nothing is deleted.', 'the choice is there while something is new: ' + j([first.since, gather.since]));
	t.ok(gather.will.some((x) => /^1 item that is new since goes into a new folder, “Since Draft”: “Prologue”\. Nothing is deleted\.$/.test(x)) && gather.will.some((x) => /^1 item gets its old name back: “Opening” becomes “Prologue”\.$/.test(x)) && !gather.left.length, 'moved to one folder: said, with the folder’s name; and the name it had comes back: ' + j(gather));
	const saidGather = ours(await confirmBack(p));
	await settled(p);
	const moved = await bytes(p);
	back(t, then, moved, { but: [NOTE] });
	t.eq(j(added(then, moved)), j([L + '/Since Draft/Prologue.md']), 'the new note is in the one folder, and nothing else is new');
	t.eq(moved[L + '/Since Draft/Prologue.md'], before[PR], 'the same file, byte for byte: nothing is deleted');
	t.eq(j([await ordered(p, L), await ordered(p, L + '/Since Draft')]), j([['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md', 'Since Draft'], ['Prologue.md']]), 'the order it had, and the one folder at the end');
	t.eq(butOrder(moved[NOTE]), butOrder(then[NOTE]), 'the binder note as it was but for its list');
	t.ok(/1 item that is new since moved into “Since Draft”/.test(saidGather) && /Nothing was deleted\./.test(saidGather), saidGather);
}, 180000);

test('“Everything”, folders: a folder that is gone is made again with its own note and its notes, a renamed one gets its name back and its own note follows it, a note goes back to the folder it was in; with nothing new since, the vault is file for file what it was, the binder note with the writer’s own comment among them', async (p, h, t) => {
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); for (const [d, s] of [[${j(P1)}, 'Mara comes to the island.'], [${j(P2)}, 'The light goes out.']]) { const n = await ${B}.ensureFolderNote(f(d)); await app.fileManager.processFrontMatter(n, (fm) => { fm.synopsis = s; }); } })().then(() => 1)`);
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('binder: 1\n', 'binder: 1\n# the order of the book, as the writer keeps it\n'));
	await sleep(p, 900);
	await openView(p);
	await draft(p);
	const then = await bytes(p), thenFolders = await allFolders(p), thenFiles = await allFiles(p), thenOrder = await contents(p);
	t.ok(textOf(then[NOTE]).includes('# the order of the book') && thenOrder.length === 9, '(the binder note has a line written by hand)');
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x);
		await app.vault.delete(f(${j(P2)}), true);
		await app.fileManager.renameFile(f(${j(P1)}), ${j(L + '/Part 1')});
		await new Promise(r => setTimeout(r, 700));
		await ${B}.move(f(${j(L + '/Part 1/Storm warning.md')}), f(${j(L)}), 0);
	})().then(() => 1)`);
	await settled(p);
	const before = await bytes(p), beforeFolders = await allFolders(p);
	t.ok(!!before[L + '/Part 1/Part 1.md'] && !!before[L + '/Storm warning.md'] && !before[W], '(as things stand: one folder gone with all in it, one renamed with its note, a note out of its folder)');
	await showDialog(p);
	const screen = await backScreen(p, null);
	t.ok(screen.will.some((x) => /^3 items that are gone are made again: “Part Two”, “The wreck”, “Lights out”\.$/.test(x)) && screen.will.some((x) => /^1 item goes back to the folder it was in: “Storm warning”\.$/.test(x)) && screen.will.some((x) => /^1 item gets its old name back: “Part 1” becomes “Part One”\.$/.test(x)), 'the folder and its notes made again, the note back in its folder, the folder’s name: ' + j(screen.will));
	t.ok(!screen.left.length && screen.since === '', 'nothing is new since: nothing is left, and there is no choice to make: ' + j([screen.left, screen.since]));
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	back(t, then, after);
	t.ok(textOf(after[NOTE]).includes('# the order of the book'), '(the binder note is the snapshot’s bytes: the comment is there again)');
	t.eq(j(added(then, after)), j([]), 'no note is there that wasn’t');
	t.eq(j(await allFolders(p)), j(thenFolders), 'the folders are the folders there were');
	const now = await allFiles(p), made = now.filter((f) => !thenFiles.includes(f));
	t.ok(made.length === 2 && made.includes(JOURNAL) && made.some((f) => AUTO.test(f.slice(SN.length + 1))) && thenFiles.every((f) => now.includes(f)), 'every file that was there is there; besides, only the snapshot taken first and the plan: ' + j(made));
	t.eq(j(await contents(p)), j(thenOrder), 'and the order is the order it had');
	t.eq(j(await ordered(p, P2)), j(['The wreck.md', 'Lights out.md']), 'the folder made again has its notes in their order');
	t.ok(/^Brought back “Draft”: 3 items made again, 2 items put back where they were/.test(said), 'it says what it made and put back, as the screen counted them: ' + said);
	// back again: the folder made again stays, with its notes; everything else is as it was just before
	await drawn(p);
	await pickRow(p, 'Before bringing back Draft');
	await backScreen(p, null);
	await confirmBack(p);
	await settled(p);
	const again = await bytes(p);
	back(t, before, again, { but: [NOTE], as: 'the file it was just before' });
	t.eq(j(added(before, again)), j([P2 + '/Lights out.md', P2 + '/Part Two.md', W]), 'nothing was deleted: the folder made again is still there, with its notes');
	t.eq(j(await allFolders(p)), j([...beforeFolders, P2].sort()), 'the folders as they were just before, and that one');
	t.eq(butOrder(again[NOTE]), butOrder(before[NOTE]), 'the binder note as it was just before, but for its list');
}, 180000);

test('“Everything”, properties and bytes: notes whose properties were written by hand (a comment, a list on one line, quotes, a folded line), with Windows line endings, with a byte-order mark; one open with unsaved typing, in an editor that Undo takes it back in: each is the snapshot’s file to the byte, not properties written again', async (p, h, t) => {
	const H = P1 + '/By hand.md', C = P1 + '/Windows.md', M = P2 + '/Marked.md';
	const hand = '---\n# a comment the writer left\ntags: [sea, "night watch"]   # on one line\nstatus: \'First draft\'\ntitle: "Quoted: with a colon"\nsynopsis: >-\n  Folded,\n  over two lines.\n---\nBy hand.\n';
	const crlf = '---\r\nstatus: draft\r\nlabel: Blue\r\n---\r\nWindows lines.\r\nTwo of them.\r\n', marked = '﻿---\nstatus: draft\n---\nA mark at the front.\n';
	for (const [path, text] of [[H, hand], [C, crlf], [M, marked]]) await writeRaw(p, path, text);
	await until(p, `!!${file(H)} && !!${file(C)} && !!${file(M)}`);
	await sleep(p, 800);
	await openView(p);
	await draft(p);
	const then = await bytes(p), files = await allFiles(p);
	t.eq(j([then[H], then[C], then[M]]), j([hexOf(hand), hexOf(crlf), hexOf(marked)]), '(the three notes are on the disk as they were written)');
	// properties changed as Obsidian changes them (the whole block written again in its own form), and text
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x), pm = (x, fn) => app.fileManager.processFrontMatter(f(x), fn);
		await pm(${j(H)}, (fm) => { fm.status = 'Done'; fm.label = 'Red'; });
		await pm(${j(C)}, (fm) => { fm.label = 'Red'; delete fm.status; });
		await pm(${j(M)}, (fm) => { fm.status = 'done'; });
		await pm(${j(A)}, (fm) => { fm.status = 'final'; fm.pov = 'Mara'; });
		await app.vault.process(f(${j(W)}), (x) => x + '\\nWritten since, in a note that is closed.\\n');
	})().then(() => 1)`);
	await sleep(p, 600);
	// two of them open, each with typing that isn't saved
	for (const path of [H, M]) await p.ev(`app.workspace.getLeaf('tab').openFile(${file(path)}, { state: { mode: 'source' } }).then(() => 1)`);
	await sleep(p, 700);
	const ED = (path) => `app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(path)}).view.editor`;
	for (const path of [H, M]) await p.ev(`(() => { const e = ${ED(path)}; e.replaceRange('\\nTYPED-AND-NOT-SAVED.', { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); return 1; })()`);
	const mid = await bytes(p);
	t.ok(!textOf(mid[H]).includes('TYPED') && !textOf(mid[H]).includes('# a comment') && textOf(mid[H]).includes('status: Done') && !textOf(mid[C]).includes('status'), '(as things stand: what was typed is not on the disk; the properties written by hand were written again by Obsidian)');
	await showDialog(p);
	const screen = await backScreen(p, null);
	t.ok(screen.will.some((x) => /^3 notes get the text they had: /.test(x)) && screen.will.some((x) => /^4 items get the properties they had: /.test(x) && /status/.test(x) && /label/.test(x) && /pov/.test(x)) && !screen.left.length, 'the screen: three notes’ text (the two being typed in among them), four notes’ properties: ' + j(screen));
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	back(t, then, after);
	t.eq(j([textOf(after[H]), textOf(after[C]), textOf(after[M])]), j([hand, crlf, marked]), 'the three notes are what the writer wrote, to the byte: the comment, the list on one line, the quotes, the folded line; CR LF; the mark');
	t.eq(j(added(then, after)), j([]), 'and no note is there that wasn’t');
	const made = (await allFiles(p)).filter((f) => !files.includes(f)), kept = await snapshot(p, made.find((f) => f.endsWith('.binder-snapshot')));
	t.ok(kept.items.find((i) => i.path === 'Part One/By hand.md').text.endsWith('TYPED-AND-NOT-SAVED.') && kept.items.find((i) => i.path === 'Part Two/Marked.md').text.endsWith('TYPED-AND-NOT-SAVED.'), 'what was typed and not saved is in the snapshot taken first');
	t.ok(kept.items.find((i) => i.path === 'Part One/By hand.md').text.includes('status: Done') && kept.items.find((i) => i.path === 'Part Two/The wreck.md').text.endsWith('Written since, in a note that is closed.\n'), 'with the properties and the text that were replaced');
	t.ok(!(await p.ev(`${ED(H)}.getValue()`)).includes('TYPED') && (await p.ev(`${ED(H)}.getValue()`)) === hand, 'the editor shows the note as it was');
	t.ok(/^Brought back “Draft”: 5 notes as they were\. Nothing was deleted\./.test(said), 'it says how many notes are as they were: ' + said);
	// one Undo, in the editor the note is open in
	await closeAll(p);
	await p.ev(`(() => { ${ED(H)}.undo(); return 1; })()`);
	await until(p, `app.vault.adapter.read(${j(H)}).then(s => s.includes('TYPED-AND-NOT-SAVED'))`, 8000);
	const undone = await read(p, H);
	t.ok(undone.endsWith('TYPED-AND-NOT-SAVED.') && undone.includes('status: Done') && undone.includes('label: Red'), 'one Undo in the editor: the note says again what it said, properties and text, to the last word typed: ' + j(undone));
	const rest = await bytes(p);
	for (const path of Object.keys(then)) if (path !== H) t.eq(rest[path], then[path], `“${path}” is not the editor’s to undo: it is as the snapshot has it`);
	t.eq(await p.ev(`${B}.undoable(${file(L)})`), null, 'and “Undo last move” takes none of it back');
}, 180000);

test('“Everything”, with a note changed from outside after the screen was read, or after the snapshot taken first was written: that note is left as it is and named, and the rest comes back; an item that arrives meanwhile, and nothing is done at all', async (p, h, t) => {
	await openView(p);
	await draft(p);
	const then = await bytes(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); for (const x of ${j([A, K, S, W])}) await app.vault.process(f(x), (t) => t + '\\nWritten since.\\n'); await app.fileManager.renameFile(f(${j(E)}), ${j(L + '/The end.md')}); })().then(() => 1)`);
	await settled(p);
	const before = await bytes(p);
	await openDialog(p);
	await drawn(p);
	const screen = await backScreen(p, null);
	t.ok(screen.will.some((x) => /^4 notes get the text they had: /.test(x)) && screen.will.some((x) => /^1 item gets its old name back: “The end” becomes “Epilogue”\.$/.test(x)), 'the screen: four notes, one name: ' + j(screen.will));
	// from outside (a sync, another program), while the screen is open
	const OUT1 = textOf(before[K]) + 'Typed on another device while the screen was open.\n';
	await writeRaw(p, K, OUT1);
	await sleep(p, 900);
	// and the moment the snapshot of what is there has been written, before anything is changed
	const OUT2 = textOf(before[S]) + 'Typed on another device between the snapshot and the write.\n';
	await p.ev(`(() => { const v = app.vault, make = v.create; v.create = async function (path, ...rest) { const f = await make.call(this, path, ...rest); if (/\\.auto\\.binder-snapshot$/.test(path)) { delete v.create; window.bindersTestHook = 'ran'; await v.adapter.write(${j(S)}, ${j(OUT2)}); } return f; }; return 1; })()`);
	const said = ours(await confirmBack(p));
	t.eq(await p.ev(`(() => { const ran = window.bindersTestHook; delete window.bindersTestHook; return ran + (Object.prototype.hasOwnProperty.call(app.vault, 'create') ? ', still there' : ', gone'); })()`), 'ran, gone', '(the test’s hook ran, and is gone)');
	await settled(p);
	const after = await bytes(p);
	back(t, then, after, { but: [K, S, NOTE] });
	t.eq(textOf(after[K]), OUT1, 'the note changed while the screen was open is left, with every word typed from outside');
	t.eq(textOf(after[S]), OUT2, 'the note changed after the snapshot was taken is left too: the write refused it');
	t.ok(/^Brought back “Draft”: 1 item put back where it was, 2 notes as they were\. 2 items were left as they are: “The keeper” \(changed meanwhile\), “Storm warning” \(changed meanwhile\)\. Nothing was deleted\./.test(said), 'it says which were left, and why: ' + said);
	const auto = (await list(p)).find((f) => AUTO.test(f)), kept = await snapshot(p, `${SN}/${auto}`);
	t.eq(kept.items.find((i) => i.path === 'Part One/The keeper.md').text, OUT1, 'the snapshot taken first holds the first note as it was changed from outside');
	t.eq(hexOf(kept.items.find((i) => i.path === 'Part One/Storm warning.md').text), before[S], 'and the second as it was when it was taken: what came after is in the note');
	t.ok((await journal(p)).finished > 0, 'it was done as far as it could be, and its plan is marked finished');
	// an item that arrives while the screen is open: what is to be made, renamed or moved is no longer what the screen said
	await closeAll(p);
	await p.ev(`(async () => { await app.vault.process(${file(A)}, (t) => t + '\\nAgain.\\n'); await app.fileManager.renameFile(${file(E)}, ${j(L + '/The end.md')}); })().then(() => 1)`);
	await settled(p);
	await openDialog(p);
	await pickRow(p, 'Draft');
	await backScreen(p, null);
	await p.ev(`${B}.newScene(${file(L)}, 1, 'Arrived meanwhile', undefined, 'A note another device made.\\n').then(() => ${B}.flush()).then(() => 1)`);
	await sleep(p, 500);
	const mid = await bytes(p);
	await noNotices(p);
	await clickIn(p, BACK + ' .modal-button-container button', 'Bring back');
	await until(p, `[...document.querySelectorAll('.notice')].some(n => /nothing was brought back/.test(n.textContent))`, 30000);
	const refused = ours(await notices(p));
	t.ok(/^“The Lighthouse” was changed after the screen said what would happen, so nothing was brought back\. Look again: the screen will say what there is to do now\.$/.test(refused), 'it says so, and why: ' + refused);
	same(t, mid, await bytes(p));
	t.ok((await journal(p)).finished > 0 && !(await p.ev(`!!document.querySelector(${j(CUT)})`)), 'and nothing is under way: no plan was written for it');
}, 180000);

test('“Everything” in a Longform project: a scene renamed, one deleted, one rewritten, the order changed; every note is the file it was, the index note to the byte; there is no folder to move what is new to', async (p, h, t) => {
	const D = 'Longform demo', I = D + '/Index.md', DS = D + '/Snapshots';
	await openView(p, D);
	await draft(p, 'Ferry draft', DS);
	const then = await bytes(p), thenOrder = await ordered(p, D);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x);
		await app.fileManager.renameFile(f(${j(D + '/Harbor.md')}), ${j(D + '/Port.md')});
		await app.vault.delete(f(${j(D + '/Return.md')}));
		await app.vault.process(f(${j(D + '/Island.md')}), (t) => t + 'More.\\n');
		await ${B}.move(f(${j(D + '/Island.md')}), f(${j(D)}), 0);
		await ${B}.newScene(f(${j(D)}), 1, 'Customs', undefined, 'A scene written since.\\n');
	})().then(() => 1)`);
	await settled(p);
	const before = await bytes(p);
	t.ok(!before[D + '/Return.md'] && !!before[D + '/Port.md'] && before[I] !== then[I], '(as things stand: a scene gone, one renamed, the index note written by Binders)');
	await openDialog(p);
	await drawn(p);
	const screen = await backScreen(p, null);
	t.ok(screen.will.some((x) => /^1 item that is gone is made again: “Return”\.$/.test(x)) && screen.will.some((x) => /^1 item gets its old name back: “Port” becomes “Harbor”\.$/.test(x)) && screen.will.some((x) => /^1 note gets the text it had: “Island”\./.test(x)), 'the screen: ' + j(screen.will));
	t.ok(screen.left.some((x) => /^1 item that is new since stays where it is: “Customs”\. Nothing is deleted\.$/.test(x)) && screen.since === '', 'the new scene stays, and a project without folders has no folder to offer for it: ' + j([screen.left, screen.since]));
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	back(t, then, after, { but: [I] });
	t.eq(j(added(then, after)), j([D + '/Customs.md']), 'the new scene is the only note besides');
	t.eq(after[D + '/Customs.md'], before[D + '/Customs.md'], 'and is untouched');
	t.eq(butOrder(after[I]), butOrder(then[I]), 'the index note: as it was but for its list of scenes');
	t.eq(j((await ordered(p, D)).filter((x) => x !== 'Customs.md')), j(thenOrder), 'the scenes are in the order Longform had them');
	t.eq((await list(p, DS)).filter((f) => AUTO.test(f)).length, 1, 'the snapshot taken first is in the project’s own folder of snapshots');
	t.ok(/^Brought back “Ferry draft”: 1 item made again, 1 item put back where it was, /.test(said), said);
	// with nothing new since: the index note is the snapshot's bytes
	await closeAll(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await app.vault.delete(f(${j(D + '/Customs.md')})); await ${B}.move(f(${j(D + '/Island.md')}), f(${j(D)}), 0); await app.fileManager.renameFile(f(${j(D + '/Ticket office.md')}), ${j(D + '/Tickets.md')}); })().then(() => 1)`);
	await settled(p);
	t.ok((await bytes(p))[I] !== then[I], '(the index note is written by Binders again)');
	t.ok(/^done: /.test(await backAll(p, 'Ferry draft', D)), 'brought back once more');
	await settled(p);
	same(t, then, await bytes(p));
	t.eq(j(await ordered(p, D)), j(thenOrder), 'and the order, with its groups, is Longform’s');
}, 180000);

test('“Everything” for one folder, from a snapshot of the whole binder: what was in the folder comes back, made again, renamed, with its properties; nothing outside the folder is touched', async (p, h, t) => {
	const K2 = P1 + '/The old keeper.md';
	await openView(p);
	await draft(p, 'Draft sent to Sam');
	const then = await bytes(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x), pm = (x, fn) => app.fileManager.processFrontMatter(f(x), fn);
		await app.fileManager.renameFile(f(${j(K)}), ${j(K2)});
		await app.vault.delete(f(${j(S)}));
		await app.vault.process(f(${j(A)}), (t) => t + '\\nWritten since.\\n');
		await pm(${j(A)}, (fm) => { fm.label = 'Red'; });
		await app.vault.process(f(${j(W)}), (t) => t + '\\nWritten since, outside the folder.\\n');
		await pm(${j(W)}, (fm) => { fm.label = 'Blue'; });
		await ${B}.move(f(${j(E)}), f(${j(L)}), 0);
		await ${B}.newScene(f(${j(P2)}), 0, 'New in the other folder', undefined, 'Written since.\\n');
	})().then(() => 1)`);
	await settled(p);
	const before = await bytes(p), files = await allFiles(p), order = await contents(p);
	await openView(p, P1);
	await openDialog(p);
	await pickRow(p, 'Draft sent to Sam');
	const screen = await backScreen(p, null);
	t.ok(/^“Part One” goes back to the snapshot from /.test(screen.intro), 'the screen is about the folder: ' + screen.intro);
	t.ok(screen.will.length === 4 && /^1 note gets the text it had: “Arrival”\./.test(screen.will[0]) && /^1 item that is gone is made again: “Storm warning”\.$/.test(screen.will[1]) && /^1 item gets its old name back: “The old keeper” becomes “The keeper”\.$/.test(screen.will[2]) && /^1 item gets the properties it had: label\.$/.test(screen.will[3]) && !screen.left.length && screen.since === '', 'and counts only what is in it: ' + j(screen));
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	for (const path of Object.keys(then)) if (path.startsWith(P1 + '/')) t.eq(after[path], then[path], `“${path}”, in the folder, is byte for byte the file it was`);
	for (const path of Object.keys(before)) if (!path.startsWith(P1 + '/') && path !== NOTE) t.eq(after[path], before[path], `“${path}”, outside the folder, is untouched`);
	t.eq(j(Object.keys(after).filter((x) => x.startsWith(P1 + '/')).sort()), j(Object.keys(then).filter((x) => x.startsWith(P1 + '/')).sort()), 'the folder holds the notes it held');
	t.eq(butOrder(after[NOTE]), butOrder(before[NOTE]), 'the binder note: nothing but its list of contents (the folder’s part of the order is in it)');
	t.eq(j(await ordered(p, P1)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'the folder’s items are in the order they had');
	t.eq(j((await contents(p)).filter((x) => !x.startsWith('Part One/'))), j(order.filter((x) => !x.startsWith('Part One/'))), 'and the rest of the binder’s order is as it was a moment ago');
	const made = (await allFiles(p)).filter((f) => !files.includes(f));
	t.ok(made.some((f) => f.startsWith(SN + '/Part One/') && / Before bringing back Draft sent to Sam\.auto\.binder-snapshot$/.test(f)) && made.includes(JOURNAL), 'the snapshot taken first is the folder’s own; the plan is at the top of the binder’s snapshots: ' + j(made));
	t.eq((await journal(p)).of, 'Part One', 'and says which folder it was for');
	t.ok(/^Brought back “Draft sent to Sam”: 1 item made again, 1 item put back where it was, 1 note as it was\. Nothing was deleted\. “Part One” as it was just before is kept as the snapshot /.test(said), said);
}, 180000);

test('“Everything”, what is new since: it stays where it is unless the writer says otherwise; moved to one folder, two notes of one name are both there, a new folder goes whole, and no file is deleted; the snapshot taken first puts each back where it was', async (p, h, t) => {
	const N1 = P1 + '/Aside.md', N2 = P2 + '/Aside.md', F = L + '/Part Three', N3 = F + '/Coda.md', G = L + '/Since Draft';
	await openView(p);
	await draft(p);
	const then = await bytes(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x), s = ${B};
		await s.newScene(f(${j(P1)}), 1, 'Aside', undefined, 'An aside in part one.\\n');
		await s.newScene(f(${j(P2)}), 0, 'Aside', undefined, 'Another, in part two.\\n');
		const made = await s.newFolder(f(${j(L)}), 1, 'Part Three');
		await s.newScene(made, 0, 'Coda', undefined, 'In a folder that is new.\\n');
		await app.vault.process(f(${j(A)}), (t) => t + '\\nWritten since.\\n');
	})().then(() => 1)`);
	await settled(p);
	const before = await bytes(p), beforeOrder = await contents(p);
	await openDialog(p);
	await drawn(p);
	const stay = await backScreen(p, null);
	t.ok(stay.left.length === 1 && /^4 items that are new since stay where they are: .+ and 1 more\. Nothing is deleted\.$/.test(stay.left[0]) && /“Part Three”/.test(stay.left[0]) && /“Aside”/.test(stay.left[0]) && stay.since.startsWith('stay: '), 'left where it is, to begin with: ' + j(stay));
	const go = await since(p, 'gather');
	t.ok(go.will.some((x) => /^3 items that are new since go into a new folder, “Since Draft”: .+\. Nothing is deleted\.$/.test(x) && /“Part Three”/.test(x) && /“Aside”, “Aside”/.test(x)) && !go.left.length, 'the other choice: what goes, and where (what is in the new folder goes with it): ' + j(go));
	same(t, before, await bytes(p));
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	back(t, then, after, { but: [NOTE] });
	t.eq(j(added(then, after)), j([G + '/Aside 2.md', G + '/Aside.md', G + '/Part Three/Coda.md']), 'what was new is in the one folder: the two notes of one name side by side, the new folder whole');
	t.eq(j([after[G + '/Aside.md'], after[G + '/Aside 2.md'], after[G + '/Part Three/Coda.md']]), j([before[N1], before[N2], before[N3]]), 'each the same file, byte for byte: nothing is deleted');
	t.eq(j([await ordered(p, L), await ordered(p, P1), await ordered(p, P2), await ordered(p, G)]), j([['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md', 'Since Draft'], ['Arrival.md', 'The keeper.md', 'Storm warning.md'], ['The wreck.md', 'Lights out.md'], ['Part Three', 'Aside.md', 'Aside 2.md']]), 'the order it had, and the one folder at the end');
	t.ok(/^Brought back “Draft”: 2 notes as they were, (the order, )?3 items that are new since moved into “Since Draft”\. Nothing was deleted\./.test(said), 'it says what it did (the two notes: the one rewritten, and the binder note, whose order had the new items in it): ' + said);
	// back again: each goes back where it was; the folder made for them stays, empty (nothing is deleted)
	await drawn(p);
	await pickRow(p, 'Before bringing back Draft');
	const undo = await backScreen(p, null);
	t.ok(undo.left.some((x) => /^1 item that is new since stays where it is: “Since Draft”\. Nothing is deleted\.$/.test(x)), 'the snapshot taken first: the folder made since is new to it: ' + j(undo));
	await confirmBack(p);
	await settled(p);
	const again = await bytes(p);
	back(t, before, again, { but: [NOTE], as: 'the file it was just before' });
	t.eq(j(added(before, again)), j([]), 'no note is anywhere it wasn’t');
	t.eq(j((await contents(p)).filter((x) => x !== 'Since Draft/')), j(beforeOrder), 'and the order is the order it was just before');
	t.ok((await allFolders(p)).includes(G), '(the folder made for them is still there, empty)');
}, 180000);

test('“Everything” from a snapshot that can’t be trusted brings nothing back: a place outside the folder (“../”, the top of the disk, another binder, the styles folder), a place in the binder’s own folder of snapshots, a file changed by hand, a newer format; and nothing into a binder in a newer format. No note changes, nothing is made anywhere', async (p, h, t) => {
	await openView(p);
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(L)}, 'Real')`);
	await until(p, `${PL}.snapshotsApi.list(${file(L)}).some(x => x.title === 'Real')`, 20000);
	const real = (await list(p))[0], text = await exact(p, `${SN}/${real}`);
	const crafted = {
		'Climbs out': ['"Prologue.md"', '"../../climbed-out-of-the-vault.md"'],
		'Top of the disk': ['"Prologue.md"', '"/tmp/binders-planted.md"'],
		'Another binder': ['"Prologue.md"', '"../Longform demo/Planted.md"'],
		'Styles folder': ['"Prologue.md"', '"../Export styles/Planted.md"'],
		'Among the snapshots': ['"Prologue.md"', '"Snapshots/Planted.md"'],
		'Deep among the snapshots': ['"Part One/Arrival.md"', '"Snapshots/Part One/Arrival/Planted.md"'],
		'A step back': ['"Part One/Arrival.md"', '"Part One/../../Planted.md"'],
		'A backslash': ['"Part One/Arrival.md"', '"Part One\\\\..\\\\..\\\\Planted.md"'],
	};
	let n = 0;
	for (const [title, [from, to]] of Object.entries(crafted)) {
		t.ok(text.includes(from), `(the snapshot has ${from})`);
		await writeRaw(p, `${SN}/2020-01-0${++n} 10.00.00 ${title}.binder-snapshot`, text.replace(from, to));
	}
	await writeRaw(p, `${SN}/2020-02-01 10.00.00 Changed.binder-snapshot`, text.replace('The supply boat left Mara', 'The supply boat left Mary'));
	await writeRaw(p, `${SN}/2027-01-01 10.00.00 From the future.binder-snapshot`, text.replace('binder-snapshot: 1', 'binder-snapshot: 2'));
	await until(p, `${PL}.snapshotsApi.list(${file(L)}).length === ${n + 3}`, 8000);
	// every note the snapshots hold is different now: there is plenty to bring back, to make and to rename
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); for (const x of ${j([A, E])}) await app.vault.process(f(x), (t) => t + '\\nWritten since.\\n'); await app.vault.delete(f(${j(L + '/Prologue.md')})); await app.fileManager.renameFile(f(${j(K)}), ${j(P1 + '/The old keeper.md')}); await ${B}.move(f(${j(E)}), f(${j(L)}), 0); })().then(() => 1)`);
	await settled(p);
	const before = await bytes(p), files = await allFiles(p), folders = await allFolders(p);
	for (const title of Object.keys(crafted)) {
		const said = await backAll(p, title);
		t.ok(/nothing was brought back from it\.$/.test(said) && /isn’t as it was written|outside its folder/.test(said), `“${title}”: refused (${said})`);
	}
	t.eq(await backAll(p, 'Among the snapshots'), 'This snapshot names a place outside its folder, so nothing was brought back from it.', 'a note in the binder’s folder of snapshots would make that folder a chapter: it is no place for one');
	t.eq(await backAll(p, 'Changed'), 'This snapshot’s file isn’t as it was written, so nothing was brought back from it.', 'a file changed by hand: refused');
	t.ok(/^This snapshot was made by a newer version of Binders/.test(await backAll(p, 'From the future')), 'a newer format: refused');
	same(t, before, await bytes(p));
	t.eq(j([await allFiles(p), await allFolders(p)]), j([files, folders]), 'no file or folder was made in the vault: not a note, not a snapshot of what is there, not a plan');
	t.ok(!existsSync(join(dirname(p.vaultDir), 'climbed-out-of-the-vault.md')) && !existsSync('/tmp/binders-planted.md') && !existsSync(join(p.vaultDir, 'Planted.md')) && !existsSync(join(p.vaultDir, 'Longform demo', 'Planted.md')) && !existsSync(join(p.vaultDir, 'Export styles')) && !existsSync(join(p.vaultDir, SN, 'Planted.md')), 'and none outside the folder, in the other binder, in a styles folder, among the snapshots or outside the vault');
	t.ok(/^done: /.test(await backAll(p, 'Real')), '(the snapshot as it was written does come back)');
	await settled(p);
	// a plan that names what isn't the binder's: nothing is done on its word
	const mid = await bytes(p);
	await writeRaw(p, JOURNAL, JSON.stringify({ journal: 1, of: '../Longform demo', snapshot: 'Longform demo/Index.md', before: '../../etc/passwd', title: 'Planted', since: 'gather', started: 1, finished: 0, plan: { made: ['../x.md'], moved: [['Prologue.md', '../../out.md']], written: [] } }));
	await p.ev(`${PL}.snapshotsApi.interrupted().then(() => 1)`);
	await until(p, `!!document.querySelector(${j(CUT)})`, 8000);
	t.eq(j(await p.ev(`[...document.querySelectorAll(${j(CUT + ' .modal-button-container button')})].map(b => b.textContent)`)), j(['Leave it as it is']), 'a written plan that names a folder outside the binder and snapshots that aren’t its own: nothing to finish, nothing to put back');
	await clickIn(p, CUT + ' .modal-button-container button', 'Leave it as it is');
	await until(p, `!document.querySelector(${j(CUT)})`, 8000);
	same(t, mid, await bytes(p));
	t.ok((await journal(p)).finished > 0 && !existsSync(join(dirname(p.vaultDir), 'out.md')), 'the plan is marked finished, and nothing it named was touched');
	// a plan a newer Binders wrote: left as it is, and nothing is brought back over it
	const newer = JSON.stringify({ journal: 2, of: '', finished: 0, something: 'new' });
	await writeRaw(p, JOURNAL, newer);
	await p.ev(`app.vault.process(${file(A)}, (t) => t + '\\nOnce more.\\n').then(() => 1)`);
	await sleep(p, 400);
	const held = await bytes(p);
	t.ok(/^A newer version of Binders has brought a snapshot back in this binder/.test(await backAll(p, 'Real')), 'a plan in a newer format: “Everything” is refused');
	same(t, held, await bytes(p));
	t.eq(await read(p, JOURNAL), newer, 'and the plan is as it was');
	await p.ev(`app.vault.adapter.remove(${j(JOURNAL)}).then(() => 1)`);
	// a binder in a newer format: nothing is written in it at all
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem(${file(A)})`);
	await sleep(p, 500);
	const frozen = await bytes(p), frozenFiles = await allFiles(p);
	t.ok(/can’t be changed/.test(await backAll(p, 'Real')), 'a binder in a newer format: refused');
	same(t, frozen, await bytes(p));
	t.eq(j(await allFiles(p)), j(frozenFiles), 'and no snapshot is taken in it');
}, 180000);

/** Changes the binder so that bringing "Draft" back takes two renames and more, starts bringing it back, and has
    Obsidian stop answering at the second rename: as if it had been closed there. Returns the vault as it was when
    the snapshot was taken, and as it was just before. */
async function cutShort(p, t) {
	await openView(p);
	await draft(p);
	const then = await bytes(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x);
		await app.fileManager.renameFile(f(${j(K)}), ${j(P1 + '/The old keeper.md')});
		await app.fileManager.renameFile(f(${j(A)}), ${j(P1 + '/Landing.md')});
		await app.vault.delete(f(${j(W)}));
		await app.vault.process(f(${j(S)}), (t) => t + '\\nWritten since.\\n');
	})().then(() => 1)`);
	await settled(p);
	const before = await bytes(p);
	await showDialog(p);
	const screen = await backScreen(p, null);
	t.ok(screen.will.some((x) => /^2 items get their old names back: /.test(x)) && screen.will.some((x) => /^1 item that is gone is made again: “The wreck”\.$/.test(x)), '(the screen: two names, a note to make again: ' + j(screen.will) + ')');
	await p.ev(`(() => { const fm = app.fileManager, real = fm.renameFile; let n = 0; fm.renameFile = function (...a) { if (++n === 2) { window.bindersCut = true; return new Promise(() => {}); } return real.apply(this, a); }; return 1; })()`);
	await clickIn(p, BACK + ' .modal-button-container button', 'Bring back');
	await until(p, `window.bindersCut === true`, 30000);
	await sleep(p, 500);
	const half = await bytes(p), plan = await journal(p);
	t.ok(plan && plan.finished === 0 && plan.title === 'Draft' && plan.plan.moved.length === 2 && j(plan.plan.made) === j(['Part Two/The wreck.md']), 'the plan was written down before the first rename, and is not finished: ' + j(plan));
	t.ok(Object.keys(half).filter((x) => x === K || x === A).length === 1 && !half[W] && half[S] === before[S], '(half done: one note has its name back, the other not; nothing is made or written yet)');
	// Obsidian is closed, and opened again
	await reload(p);
	await until(p, `!!document.querySelector(${j(CUT)})`, 20000);
	const asked = await p.ev(`(() => { const m = document.querySelector(${j(CUT)}); return { title: m.querySelector('.modal-title').textContent, text: [...m.querySelectorAll('.modal-content p')].map(e => e.textContent), buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => b.textContent) }; })()`);
	t.eq(asked.title, 'Bringing back “Draft” was interrupted', 'when Binders loads again, it says so');
	t.ok(/^“The Lighthouse” was being put back as it stood in a snapshot when that stopped\. Some of it may be done, and some not\. Nothing was deleted, and “The Lighthouse” as it was just before is kept as the snapshot “Before bringing back Draft”\.$/.test(asked.text[0]) && /shows what will change first/.test(asked.text[1]), 'what happened, that nothing was deleted, and where what was there is: ' + j(asked.text));
	t.eq(j(asked.buttons), j(['Finish', 'Put it back as it was', 'Leave it as it is']), 'and offers to finish it, to put it back, or to leave it');
	same(t, half, await bytes(p));
	return { then, before, half };
}

test('“Everything”, cut short (Obsidian closed half way): the plan was written down first, so the next time Binders loads it says so; “Finish” shows what is left to do and does it, and every note is the file the snapshot holds', async (p, h, t) => {
	const { then } = await cutShort(p, t);
	await clickIn(p, CUT + ' .modal-button-container button', 'Finish');
	await until(p, `!!document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan ul')})`, 20000);
	const screen = await backScreen(p, null);
	t.ok(screen.title === 'Bring back “Draft”' && screen.scope === 'all' && screen.will.some((x) => /^1 item gets its old name back: /.test(x)) && screen.will.some((x) => /^1 item that is gone is made again: “The wreck”\.$/.test(x)) && screen.will.some((x) => /^1 note gets the text it had: “Storm warning”\./.test(x)), 'the same screen, for the same snapshot, with what is left to do: one name, one note to make, one note’s text: ' + j(screen));
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	back(t, then, after);
	t.eq(j(added(then, after)), j([]), 'and no note is there that wasn’t');
	t.ok(/^Brought back “Draft”: 1 item made again, 1 item put back where it was, 2 notes as they were\./.test(said), 'it says what was left to do, and did (the two notes: the one rewritten, and the binder note): ' + said);
	t.ok((await journal(p)).finished > 0, 'the plan is marked finished');
	await reload(p);
	await sleep(p, 1500);
	t.ok(!(await p.ev(`!!document.querySelector(${j(CUT)})`)), 'and the next time Binders loads, it has nothing to say');
}, 240000);

test('“Everything”, cut short: “Put it back as it was” brings back the snapshot taken first, and every note is the file it was just before; “Leave it as it is” only stops the asking; while it is unanswered, no other snapshot is brought back over it', async (p, h, t) => {
	const { before, half } = await cutShort(p, t);
	// the question can wait: closed, it is asked again by "Bring back..."
	await p.key('Escape');
	await until(p, `!document.querySelector(${j(CUT)})`, 8000);
	t.ok((await journal(p)).finished === 0, 'closing the question leaves the plan as it is');
	await openView(p);
	await openDialog(p);
	await pickRow(p, 'Draft');
	await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...');
	await until(p, `!!document.querySelector(${j(CUT)})`, 8000);
	t.ok(!(await p.ev(`!!document.querySelector(${j(BACK)})`)), '“Bring back...” asks it again first: nothing else is brought back over a binder that is half way');
	same(t, half, await bytes(p));
	await clickIn(p, CUT + ' .modal-button-container button', 'Put it back as it was');
	await until(p, `!!document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan ul')})`, 20000);
	const screen = await backScreen(p, null);
	t.ok(screen.title === 'Bring back “Before bringing back Draft”' && screen.scope === 'all' && screen.will.length === 1 && /^1 item gets its old name back: /.test(screen.will[0]), 'the same screen, for the snapshot taken first: the one name that had come back goes again: ' + j(screen));
	const said = ours(await confirmBack(p));
	await settled(p);
	const after = await bytes(p);
	back(t, before, after, { as: 'the file it was just before' });
	t.eq(j(added(before, after)), j([]), 'and no note is there that wasn’t');
	t.ok(/^Brought back “Before bringing back Draft”: 1 item put back where it was\./.test(said), said);
	t.ok((await journal(p)).finished > 0, 'the plan is marked finished');
	// "Leave it as it is": nothing changes but the asking
	await closeAll(p);
	const plan = await journal(p);
	await writeRaw(p, JOURNAL, JSON.stringify({ ...plan, finished: 0 }));
	await p.ev(`${PL}.snapshotsApi.interrupted().then(() => 1)`);
	await until(p, `!!document.querySelector(${j(CUT)})`, 8000);
	const held = await bytes(p);
	await clickIn(p, CUT + ' .modal-button-container button', 'Leave it as it is');
	await until(p, `!document.querySelector(${j(CUT)})`, 8000);
	same(t, held, await bytes(p));
	t.ok((await journal(p)).finished > 0, '“Leave it as it is” marks the plan finished and changes no note');
	await p.ev(`${PL}.snapshotsApi.interrupted().then(() => 1)`);
	await sleep(p, 600);
	t.ok(!(await p.ev(`!!document.querySelector(${j(CUT)})`)), 'and it is not asked again');
}, 240000);

test('naming renames the file and changes nothing in it; deleting sends it to the trash; both from the list’s own menu too', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	const name = await age(p, first.files[0], '2026-09-19 16.20.05');
	const bytes = await hex(p, `${SN}/${name}`);
	await openDialog(p);
	await more(p, 'Name this snapshot...');
	await until(p, `!!document.querySelector('.modal-container:last-of-type input[type="text"]')`);
	await p.type('Draft sent to Sam');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(SN + '/2026-09-19 16.20.05 Draft sent to Sam.binder-snapshot')})`);
	await sleep(p, 500);
	t.eq(j(await list(p)), j(['2026-09-19 16.20.05 Draft sent to Sam.binder-snapshot']), 'its file has the name after its time');
	t.eq(await hex(p, SN + '/2026-09-19 16.20.05 Draft sent to Sam.binder-snapshot'), bytes, 'and is byte for byte what it was');
	t.eq(j((await rows(p))[1].slice(0, 2)).replace(/ · [\d,]+ words/, ''), j(['Draft sent to Sam', 'Sep 19, 4:20 PM']), 'the list follows: its name, and when under it');
	t.eq((await bar(p)).name, 'Draft sent to Sam', 'and the bar');
	// a name a file can't have is refused
	await more(p, 'Name this snapshot...');
	await until(p, `!!document.querySelector('.modal-container:last-of-type input[type="text"]')`);
	await p.ev(`(() => { const i = document.querySelector('.modal-container:last-of-type input[type="text"]'); i.select(); return 1; })()`);
	await p.type('a/b');
	await p.key('Enter');
	await sleep(p, 300);
	t.ok(/can’t contain/.test(await p.ev(`document.querySelector('.modal-container:last-of-type .binders-ask-error')?.textContent ?? ''`)), 'a name with a slash is refused, in the dialog');
	await p.key('Escape');
	await sleep(p, 300);
	// delete, from the row's own menu
	const at = await p.ev(`(() => { const r = document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})[1].getBoundingClientRect(); return { x: r.x + 30, y: r.y + 10 }; })()`);
	await p.right(at.x, at.y);
	t.eq(j(await menuItems(p)), j(['Name this snapshot...', 'Make a binder from this snapshot', 'Delete snapshot']), 'a row’s own menu (with one snapshot there is nothing to compare with)');
	await clickMenu(p, 'Delete snapshot');
	await until(p, `!!document.querySelector('.modal-container:last-of-type .mod-destructive, .modal-container:last-of-type .mod-warning')`);
	t.ok(/^Delete “Draft sent to Sam” of “The Lighthouse”\? It /.test(await p.ev(`document.querySelector('.modal-container:last-of-type .modal-content').textContent`)), 'it asks first, and says where it goes');
	await clickIn(p, '.modal-container:last-of-type button', 'Delete');
	await until(p, `app.vault.adapter.list(${j(SN)}).then(l => l.files.length === 0)`);
	t.eq(j(await list(p)), '[]', 'gone from “Snapshots”');
	t.ok(await p.ev(`(async () => { const a = app.vault.adapter; return (await a.exists('.trash')) ? (await a.list('.trash')).files.some(f => f.endsWith('Draft sent to Sam.binder-snapshot')) : app.vault.getConfig?.('trashOption') !== 'local'; })()`), 'to the trash, as Obsidian’s setting says');
	await sleep(p, 600);
	t.ok(await p.ev(`document.querySelector(${j(DLG)}).closest('.modal-container').classList.contains('mod-confirmation')`), 'and with none left the dialog is the small one again');
});

// ---- files from elsewhere ----

test('a snapshot in a newer format is listed, says why it can’t be opened, and is never opened, named, deleted or rewritten; taking another leaves it as it is', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	const text = (await exact(p, `${SN}/${first.files[0]}`)).replace('binder-snapshot: 1', 'binder-snapshot: 2');
	const F = `${SN}/2027-01-01 10.00.00 From the future.binder-snapshot`;
	await writeRaw(p, F, text);
	await until(p, `!!${file(F)}`);
	const bytes = await hex(p, F);
	await openDialog(p);
	await pickRow(p, 'From the future').catch(() => {});
	await sleep(p, 500);
	t.eq(await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-body')}).textContent`), 'This snapshot was made by a newer version of Binders (format 2). Update Binders to open it.', 'it says why');
	const b = await bar(p);
	t.eq(j([b.buttons, b.quiet, b.more]), j([[], [], false]), 'nothing can be done with it: no switches, no button, no menu');
	// by the row's own menu, and by a command of the plugin's own, it is refused all the same
	const refused = await p.ev(`(async () => { const s = ${PL}.snapshotsApi.list(${file(L)}).find(x => x.title === 'From the future'); const out = []; for (const fn of ['name', 'remove', 'make']) { try { await ${PL}.snapshotsApi[fn](s, ${file(L)}, 'x'); out.push(fn + ' went through'); } catch (e) { out.push(String(e.message).slice(0, 40)); } } return out; })()`);
	t.ok(refused.every((m) => /^This snapshot was made by a newer/.test(m)), 'naming it, deleting it and making a binder from it are each refused: ' + j(refused));
	await closeAll(p);
	await p.ev(`app.vault.process(${file(A)}, (t) => t + 'More.\\n').then(() => 1)`);
	await sleep(p, 300);
	t.ok((await take(p)).made, 'a snapshot is still taken (the newest one can’t be compared with: it is taken, not skipped)');
	t.eq(await hex(p, F), bytes, 'and the newer file is byte for byte what it was');
	t.eq((await list(p)).length, 3, 'beside the others');
});

test('a snapshot that arrives from outside (a sync) joins the open list; one changed by hand says which notes no longer match, can be read, and nothing is brought back from it', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	const name = await age(p, first.files[0], '2026-09-19 16.20.05 Mine');
	const text = await exact(p, `${SN}/${name}`);
	await p.ev(`app.vault.process(${file(A)}, (t) => t + 'Written since.\\n').then(() => 1)`);
	await openDialog(p);
	t.eq((await rows(p)).length, 2, 'one snapshot');
	// another device's, arriving by sync while the dialog is open
	await writeRaw(p, `${SN}/2026-08-01 08.00.00 From the laptop.binder-snapshot`, text.replace('taken: ', 'taken: 2026-08-01T08:00:00\nwas: '));
	await until(p, `document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')}).length === 3`, 8000);
	t.eq((await rows(p))[2][0], 'From the laptop', 'it is in the list, in its place by time');
	await pickRow(p, 'From the laptop');
	t.ok((await tree(p)).some((x) => /^Arrival \| \+2 words$/.test(x)), 'and reads as any other');
	// changed by hand: a word in one note
	const bad = text.replace('The supply boat left Mara', 'The supply boat left Mary');
	t.ok(bad !== text, '(the word is there to change)');
	await writeRaw(p, `${SN}/${name}`, bad);
	await sleep(p, 800);
	await pickRow(p, 'Mine');
	t.eq(await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-damaged')})?.textContent ?? ''`), 'This snapshot’s file isn’t as it was written: 1 note in it doesn’t match (“Arrival”). It can be read, and nothing is brought back from it.', 'it says the file was changed, and which note');
	await treeRow(p, 'Arrival');
	t.eq(j((await bar(p)).buttons), j(['Bring back (off)']), 'the note can be read, and “Bring back” is off');
	const before = await texts(p);
	const refused = await p.ev(`(async () => { try { await ${PL}.snapshotsApi.make(${PL}.snapshotsApi.list(${file(L)}).find(x => x.title === 'Mine'), ${file(L)}, 'x'); return 'made'; } catch (e) { return e.message; } })()`);
	t.eq(refused, 'This snapshot’s file isn’t as it was written, so nothing was made from it.', 'and no binder is made from it');
	same(t, before, await texts(p));
	// cut short by a sync that hasn't finished
	await writeRaw(p, `${SN}/${name}`, text.slice(0, text.indexOf('===== "Part Two/"')));
	await sleep(p, 800);
	await pickRow(p, 'From the laptop');
	await pickRow(p, 'Mine');
	t.ok(/isn’t as it was written \(part of it is missing\)/.test(await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-damaged')})?.textContent ?? ''`)), 'one that is cut short says part of it is missing');
});

test('a snapshot whose items say they are somewhere else (“../”, the top of the disk): nothing is made outside the new folder, or made at all', async (p, h, t) => {
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(L)}, 'Real')`);
	const real = (await list(p))[0], text = await exact(p, `${SN}/${real}`);
	const crafted = text.replace('"Prologue.md"', '"../../climbed-out-of-the-vault.md"').replace('"Epilogue.md"', '"../climbed-out-of-the-folder.md"').replace('"Part Two/"', '"../Part Two/"');
	t.ok(crafted !== text && parse(crafted).items.some((i) => i.path.startsWith('../')), 'a snapshot’s file with three paths changed, each note’s length and fingerprint still right');
	await writeRaw(p, `${SN}/2020-01-01 10.00.00 Crafted.binder-snapshot`, crafted);
	await until(p, `${PL}.snapshotsApi.list(${file(L)}).some(x => x.title === 'Crafted')`);
	const before = await p.ev(`app.vault.getFiles().map(f => f.path).sort().join('|')`);
	const out = await p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(L)}).find(x => x.title === 'Crafted'); const f = await ${PL}.snapshotsApi.make(s, ${file(L)}, 'x'); return 'made ' + f.path; } catch (e) { return e.message; } })()`);
	t.ok(/isn’t as it was written|outside its folder/.test(out), 'Make a binder from it: refused (' + out + ')');
	t.eq(await p.ev(`app.vault.getFiles().map(f => f.path).sort().join('|')`), before, 'no file was made in the vault');
	t.ok(!existsSync(join(p.vaultDir, 'climbed-out-of-the-folder.md')) && !existsSync(join(dirname(p.vaultDir), 'climbed-out-of-the-vault.md')), 'and none beside the binder or outside the vault');
	t.ok(!(await exists(p, L + ' (x)')), 'not even the new folder');
});

test('exact bytes: a byte-order mark, CR LF, a lone CR, no line break at the end, an empty note, and a note that looks like the file’s own lines all come back as they were', async (p, h, t) => {
	const odd = {
		'Mark.md': '﻿---\nstatus: draft\n---\nA note that opens with a byte-order mark.\n',
		'Windows.md': '---\r\nstatus: draft\r\n---\r\nLine one.\r\nLine two.\r\n',
		'Old Mac.md': 'One\rTwo\r',
		'No end.md': 'No line break at the end',
		'Empty.md': '',
		'Lookalike.md': '===== "Part One/Fake.md" | note | 4 characters | 0000000000000000 =====\nfake\n---\nbinder-snapshot: 9\n---\n',
		'Astral 📚.md': 'Astral: 𝒳 📚. Combining: é.\n',
	};
	await p.ev(`(async () => { for (const [n, text] of Object.entries(${j(odd)})) await app.vault.adapter.write(${j(P2 + '/')} + n, text); })().then(() => 1)`);
	await until(p, `Object.keys(${j(odd)}).every(n => !!app.vault.getAbstractFileByPath(${j(P2 + '/')} + n))`, 8000);
	await sleep(p, 500);
	const then = {};
	for (const n of Object.keys(odd)) then[n] = await hex(p, `${P2}/${n}`);
	t.ok(then['Mark.md'].startsWith('efbbbf'), '(the mark is on the disk)');
	await openView(p);
	const first = await take(p);
	const s = await snapshot(p, `${SN}/${first.files[0]}`);
	for (const [n, text] of Object.entries(odd)) t.eq(s.items.find((i) => i.path === 'Part Two/' + n)?.text, text, `“${n}” is in the snapshot character for character`);
	await age(p, first.files[0], '2026-09-19 16.20.05 Odd');
	// every one deleted, then brought back from the snapshot one by one
	await p.ev(`(async () => { for (const n of Object.keys(${j(odd)})) await app.vault.delete(app.vault.getAbstractFileByPath(${j(P2 + '/')} + n)); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 400);
	await openDialog(p);
	t.ok(!(await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-damaged')})`)), 'the snapshot reads as whole: every fingerprint matches');
	for (const n of Object.keys(odd)) {
		await drawn(p);
		await noNotices(p);
		await clickIn(p, DLG + ' .binders-folder-snapshots-tree del', n.replace(/\.md$/, ''));
		await drawn(p);
		await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
		await until(p, `app.vault.adapter.exists(${j(`${P2}/${n}`)})`, 8000);
		await sleep(p, 500);
		t.eq(await hex(p, `${P2}/${n}`), then[n], `“${n}” is back byte for byte`);
	}
});

// ---- the rest of the plugin ----

test('a folder renamed or moved takes its own snapshots along; a note of the same name keeps its own; nothing is written over', async (p, h, t) => {
	await openView(p, P1);
	const first = await take(p, SN + '/Part One');
	const name = await age(p, first.files[0], '2026-09-19 16.20.05 Mine', SN + '/Part One');
	const bytes = await hex(p, `${SN}/Part One/${name}`);
	// a note beside the folder, of the folder's name, with a snapshot of its own: they share the folder in "Snapshots"
	await p.ev(`(async () => { await ${B}.newScene(${file(L)}, 0, 'Part One', undefined, 'A note of the folder’s name.\\n'); await app.vault.create(${j(SN + '/Part One/2026-09-01 09.00.00 Its own.snapshot')}, '---\\nsnapshot-of: "Part One"\\ntaken: 2026-09-01T09:00:00\\n---\\nA note of the folder’s name.\\n'); })().then(() => 1)`);
	await p.ev(`app.fileManager.renameFile(${file(P1)}, ${j(L + '/Part 1')}).then(() => 1)`);
	await settle(p);
	await settle(p);
	t.eq(j(await list(p, SN + '/Part 1')), j([name]), 'the folder’s snapshot is under its new name');
	t.eq(await hex(p, `${SN}/Part 1/${name}`), bytes, 'byte for byte');
	t.eq(j(await p.ev(`app.vault.adapter.list(${j(SN + '/Part One')}).then(l => l.files.map(f => f.split('/').pop()))`)), j(['2026-09-01 09.00.00 Its own.snapshot']), 'the note’s own snapshot stays with the note');
	await openView(p, L + '/Part 1');
	await openDialog(p);
	t.eq((await rows(p))[1][0], 'Mine', 'and the folder’s list has it');
	await closeAll(p);
	// moved into another folder, where a snapshot of that name is already (another device's)
	await p.ev(`(async () => { await app.vault.adapter.mkdir(${j(SN + '/Part Two/Part 1')}); await app.vault.adapter.write(${j(`${SN}/Part Two/Part 1/${name}`)}, 'someone else’s'); })().then(() => 1)`);
	await until(p, `!!${file(`${SN}/Part Two/Part 1/${name}`)}`);
	await p.ev(`${B}.move(${file(L + '/Part 1')}, ${file(P2)}, 0).then(() => ${B}.flush()).then(() => 1)`);
	await settle(p);
	await settle(p);
	const there = await list(p, SN + '/Part Two/Part 1');
	t.eq(j(there), j([name.replace('.binder-snapshot', ' (2).binder-snapshot'), name].sort()), 'moved: it goes along, beside the one that was there, under a name counted on: ' + j(there));
	t.eq(await read(p, `${SN}/Part Two/Part 1/${name}`), 'someone else’s', 'which is not written over');
});

test('snapshots are not the binder’s: not in the file explorer, the binder’s order, its views, its word count, an export or Obsidian’s search', async (p, h, t) => {
	await openView(p);
	const words = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-toolbar').textContent`);
	const scenes = await p.ev(`${B}.scenes(${file(L)}).length`);
	await take(p);
	await openView(p, P1);
	await take(p, SN + '/Part One');
	await openView(p);
	await sleep(p, 500);
	t.eq(await p.ev(`${B}.scenes(${file(L)}).length`), scenes, 'the same scenes');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-toolbar').textContent`), words, 'the same word count in the toolbar');
	t.ok(!(await contents(p)).some((c) => /Snapshots/.test(c)), 'not in the binder’s order');
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const e = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(e); for (const f of [${j(L)}, ${j(P1)}]) e.view.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await sleep(p, 500);
	t.ok(!(await p.ev(`[...document.querySelectorAll('.nav-files-container .tree-item-self')].map(e => e.dataset.path ?? '').join('|')`)).includes('Snapshots'), 'not in the file explorer');
	t.ok(!(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view').textContent`)).includes('Snapshots'), 'not on the corkboard');
	t.ok(!(await p.ev(`app.vault.getMarkdownFiles().map(f => f.path).join('|')`)).includes('Snapshots'), 'not notes: Obsidian indexes none of it');
	t.ok(!(await p.ev(`(() => { const v = app.workspace.getLeavesOfType('binders-view')[0].view; v.setMode('manuscript'); return 1; })()`).then(() => sleep(p, 900)).then(() => p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view').textContent`))).includes('binder-snapshot'), 'not in the manuscript');
});

test('the inspector lists a folder’s and the binder’s own snapshots, with a camera; a row opens the dialog on that snapshot', async (p, h, t) => {
	const I = '.workspace-leaf-content[data-type="binders-inspector"] .binders-inspector';
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft sent to Sam');
	await p.ev(`app.vault.process(${file(A)}, (t) => t + 'More.\\n').then(() => 1)`);
	await sleep(p, 200);
	await take(p);
	await p.ev(`(async () => { const ws = app.workspace; ws.detachLeavesOfType('binders-inspector'); const b = ws.getRightLeaf(false); await b.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(b); ws.rightSplit.expand(); })().then(() => 1)`);
	await until(p, `!!document.querySelector(${j(I)})`);
	// nothing selected: the inspector is on the binder
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(l, { focus: true }); return 1; })()`);
	await until(p, `[...document.querySelectorAll(${j(I + ' .binders-inspector-heading')})].some(e => e.textContent === 'Snapshots')`, 6000);
	const listed = () => p.ev(`[...document.querySelectorAll(${j(I + ' [data-field^="snapshot:"]')})].map(r => r.querySelector('.tree-item-inner').textContent + '|' + (r.querySelector('.tree-item-flair')?.textContent ?? ''))`);
	const got = await listed();
	t.eq(j([got.length, got[1]]), j([2, 'Draft sent to Sam|Sep 19, 4:20 PM']), 'the binder’s two, newest first, a named one with when: ' + j(got));
	// the camera takes one
	await p.ev(`app.vault.process(${file(A)}, (t) => t + 'And more.\\n').then(() => 1)`);
	await sleep(p, 200);
	const cam = await p.at(I + ' [data-field="take"]');
	await p.click(cam.x, cam.y);
	await until(p, `document.querySelectorAll(${j(I + ' [data-field^="snapshot:"]')}).length === 3`, 15000);
	t.eq((await list(p)).length, 3, 'the camera took a third');
	// a row opens the dialog on that one
	await noNotices(p);
	await clickIn(p, I + ' [data-field^="snapshot:"] .tree-item-inner', 'Draft sent to Sam');
	await until(p, `!!document.querySelector(${j(DLG)})`);
	await drawn(p);
	t.eq((await bar(p)).name, 'Draft sent to Sam', 'the dialog opens on the snapshot that was clicked');
	await closeAll(p);
	// a folder's card selected: the folder's own, and the way to the binder's
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(l, { focus: true }); return 1; })()`);
	await sleep(p, 300);
	const c = await p.at(`.binders-card[data-path="${P1}"] .binders-card-title`);
	await p.click(c.x, c.y);
	await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === 'Part One'`, 6000);
	await sleep(p, 300);
	t.eq(j(await listed()), '[]', 'a folder with none of its own lists none');
	t.eq(await p.ev(`document.querySelector(${j(I + ' [data-field="snapshots:all"]')})?.textContent ?? ''`), 'Those of the folders it is in...', 'and offers the binder’s, which hold it');
});

test('a Longform project has snapshots too: its scenes in Longform’s order, kept in its scene folder; the index note is never written to', async (p, h, t) => {
	const D = 'Longform demo', before = await texts(p);
	await openView(p, D);
	const got = await take(p, D + '/Snapshots');
	t.ok(got.made && /^Took a snapshot of “Longform demo”: 5 notes · /.test(got.said), 'taken: ' + got.said);
	const s = await snapshot(p, `${D}/Snapshots/${got.files[0]}`);
	t.eq(j(s.items.map((i) => `${i.path}|${i.kind}`)), j(['Index.md|binder note', 'Harbor.md|note', 'Ticket office.md|note', 'The crossing.md|note', 'Island.md|note', 'Return.md|note']), 'the index note, then the scenes in the order Longform has them; the ignored note isn’t one');
	for (const i of s.items) t.eq(i.text, before[`${D}/${i.path}`], `“${i.path}” exactly`);
	await age(p, got.files[0], '2026-09-19 16.20.05', D + '/Snapshots');
	await p.ev(`(async () => { await ${B}.move(${file(D + '/Return.md')}, ${file(D)}, 0); await ${B}.flush(); await app.vault.process(${file(D + '/Island.md')}, (t) => t + 'More.\\n'); })().then(() => 1)`);
	await sleep(p, 500);
	const mid = await texts(p);
	await openDialog(p);
	await drawn(p);
	t.eq(await key(p), 'Since this snapshot: 1 note rewritten, 1 moved. 1 word put in.', 'what changed: ' + await key(p));
	same(t, mid, await texts(p));
	t.ok(!(await read(p, D + '/Index.md')).includes('Snapshots'), 'nothing of it is in the index note');
});

test('a binder in a newer format: its snapshots can be read; none can be taken, named, deleted or made into a binder', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Before');
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem(${file(A)})`);
	await sleep(p, 500);
	t.eq(j([await can(p, 'take-snapshots'), await can(p, 'show-binder-snapshots')]), j([false, true]), 'the commands: only “Show snapshots of the binder”');
	await noNotices(p);
	await headerMenu(p);
	t.eq(j(await menuItems(p)), j(['Show snapshots...']), 'the button’s menu: only the reading');
	await clickMenu(p, 'Show snapshots...');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	await drawn(p);
	t.ok((await tree(p)).length >= 9, 'the snapshot reads');
	t.ok(/^This binder can’t be changed\./.test(await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-note')}).textContent`)), 'and the dialog says why nothing else is offered');
	t.eq(await p.ev(`!!document.querySelector(${j(DLG + ' .binders-snapshots-head [aria-label="Take a snapshot"]')})`), false, 'no camera');
	t.eq(j(await more(p, null)), j([]), 'nothing in its menu that changes anything');
});

test('the commands and the menus: “Take a snapshot of the binder” and “Show snapshots of the binder” from a note or a view; a folder’s menus have the two items, and “every note” is gone', async (p, h, t) => {
	t.eq(j(await p.ev(`['take-snapshots', 'show-binder-snapshots'].map(id => app.commands.commands['binders:' + id]?.name.replace(/^Binders: /, ''))`)), j(['Take a snapshot of the binder', 'Show snapshots of the binder']), 'the two commands, by name');
	await p.ev(`app.workspace.getLeaf(false).openFile(${file(A)}).then(() => 1)`);
	await sleep(p, 400);
	t.eq(j([await can(p, 'take-snapshots'), await can(p, 'show-binder-snapshots')]), j([true, true]), 'both from a note of the binder');
	await run(p, 'take-snapshots');
	await until(p, `app.vault.adapter.exists(${j(SN)})`, 15000);
	await sleep(p, 500);
	t.eq((await list(p)).length, 1, 'from a note, the command takes one of the whole binder');
	await run(p, 'show-binder-snapshots');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
	t.eq(await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-of')}).textContent`), 'The Lighthouse', 'and the other shows the binder’s');
	await closeAll(p);
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Welcome.md') ?? app.vault.getMarkdownFiles().find(f => !f.path.includes('/'))).then(() => 1)`).catch(() => {});
	// a folder's card
	await openView(p);
	const c = await p.at(card(P1) + ' .binders-card-footer');
	await p.right(c.x, c.y);
	const items = await menuItems(p);
	t.ok(items.includes('Take a snapshot') && items.includes('Show snapshots...') && !items.some((i) => /every note/.test(i)), 'a folder’s card: the two items, and no “every note”: ' + j(items));
	await clickMenu(p, 'Take a snapshot');
	await until(p, `app.vault.adapter.exists(${j(SN + '/Part One')})`, 15000);
	t.eq((await list(p, SN + '/Part One')).length, 1, 'which takes the folder’s');
	await closeMenus(p);
	// the view's own menu
	// (the items a menu is given, by title: as the view and the explorer give them, with no menu drawn)
	const pane = await p.ev(`(() => { const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const it = new Proxy({}, { get: (x, m) => (v) => { if (m === 'setTitle') items.push(v); if (m === 'setSubmenu') return menu; return it; } }); cb(it); return menu; } : () => menu }); app.workspace.getLeavesOfType('binders-view')[0].view.onPaneMenu(menu, 'more-options'); return items; })()`);
	t.ok(pane.includes('Take a snapshot') && pane.includes('Show snapshots...') && !pane.some((i) => /every note/.test(i)), 'the view’s menu too: ' + j(pane));
	await closeMenus(p);
	// the file explorer
	const ex = await p.ev(`(() => { const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const it = new Proxy({}, { get: (x, m) => (v) => { if (m === 'setTitle') items.push(v); if (m === 'setSubmenu') return menu; return it; } }); cb(it); return menu; } : () => menu }); app.workspace.trigger('file-menu', menu, ${file(P2)}, 'file-explorer-context-menu'); return items; })()`);
	t.ok(ex.includes('Take a snapshot') && ex.includes('Show snapshots...'), 'and a folder in the file explorer: ' + j(ex));
});

// ---- the dialog, by hand and by ear ----

test('a notice over the dialog doesn’t take the click meant for its buttons: in a folder’s dialog and in a note’s', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05');
	await p.ev(`(async () => { await app.vault.process(${file(A)}, (t) => t + 'One.\\n'); await app.vault.process(${file(W)}, (t) => t + 'Two.\\n'); })().then(() => 1)`);
	await sleep(p, 300);
	await openDialog(p);
	await treeRow(p, 'Arrival');
	await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
	await until(p, `document.querySelectorAll('.notice').length > 0`, 8000);
	await drawn(p);
	// the notice is there, over the bar; what is under the pointer at the bar's buttons is the button
	const hit = await p.ev(`(() => { const n = document.querySelector('.notice'), nr = n.getBoundingClientRect(); const out = []; for (const b of document.querySelectorAll(${j(DLG + ' .modal-setting-titlebar-actions')} + ' > *, ' + ${j(DLG + ' .modal-close-button')})) { const r = b.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, under = nr.left <= x && x <= nr.right && nr.top <= y && y <= nr.bottom, el = document.elementFromPoint(x, y); out.push([under, b.contains(el) || el === b]); } return { notice: !!n, out }; })()`);
	t.ok(hit.notice && hit.out.some((x) => x[0]), 'the notice lies over at least one of the bar’s buttons: ' + j(hit));
	t.ok(hit.out.every((x) => x[1]), 'and each button is what a click there reaches: ' + j(hit));
	// so the next click works at once
	await treeRow(p, 'The wreck');
	await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
	await until(p, `app.vault.adapter.read(${j(W)}).then(s => !s.includes('Two.'))`, 8000);
	t.ok(!(await read(p, W)).includes('Two.'), 'a second “Bring back”, with the first one’s notice still showing, went through');
	await closeAll(p);
	await noNotices(p);
	// the note's own dialog
	await p.ev(`app.workspace.getLeaf(false).openFile(${file(A)}).then(() => 1)`);
	await sleep(p, 400);
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector('.modal.binders-snapshots .binders-snapshots-item')`);
	await sleep(p, 400);
	await p.ev(`(() => { document.querySelector('.modal.binders-snapshots .binders-snapshots-head [aria-label="Take a snapshot"]').click(); return 1; })()`);
	await until(p, `document.querySelectorAll('.notice').length > 0`, 8000);
	await sleep(p, 300);
	const note = await p.ev(`(() => [...document.querySelectorAll('.modal.binders-snapshots .modal-setting-titlebar-actions > *, .modal.binders-snapshots .modal-close-button')].map(b => { const r = b.getBoundingClientRect(), el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return b.contains(el) || el === b; }))()`);
	t.ok(note.length > 1 && note.every((x) => x), 'in a note’s dialog too, every button of the bar is reached through the notice: ' + j(note));
});

test('keyboard and screen reader: the list is a listbox with one stop for Tab and arrows that show what they land on; the contents are a tree whose arrows move and whose Enter opens; every control has a name', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-08-14 18.02.11 First draft');
	await p.ev(`app.vault.process(${file(A)}, (t) => t + 'More.\\n').then(() => 1)`);
	await sleep(p, 200);
	const second = await take(p);
	await age(p, second.files[1], '2026-09-19 16.20.05 Second draft');
	await p.ev(`app.vault.process(${file(A)}, (t) => t + 'And more.\\n').then(() => 1)`);
	await sleep(p, 200);
	await openDialog(p);
	await drawn(p);
	const a = await p.ev(`(() => { const d = document.querySelector(${j(DLG)}), l = d.querySelector('.binders-snapshots-list'), items = [...l.querySelectorAll('.binders-snapshots-item')]; return { list: [l.getAttribute('role'), l.getAttribute('aria-label')], options: items.map(i => [i.getAttribute('role'), i.getAttribute('aria-selected'), i.tabIndex, i.getAttribute('aria-label')]), focus: document.activeElement === items[1], tree: [d.querySelector('.binders-folder-snapshots-tree').getAttribute('role'), d.querySelector('.binders-folder-snapshots-tree').getAttribute('aria-label')], unnamed: [...d.querySelectorAll('[role="button"], button, .clickable-icon')].filter(e => e.offsetParent && !e.matches('.modal-close-button, .modal-header-button') && !(e.getAttribute('aria-label') || e.textContent.trim())).map(e => e.className) }; })()`);
	t.eq(j(a.list), j(['listbox', 'Snapshots of “The Lighthouse”']), 'the list is a listbox, named');
	t.eq(j(a.options.map((o) => o.slice(0, 3))), j([['option', 'false', -1], ['option', 'true', 0], ['option', 'false', -1]]), 'its rows are options, the one shown selected and the one stop for Tab');
	t.ok(/^Snapshot “Second draft”, Sep 19, 2026/.test(a.options[1][3]) && /^The binder now, 7 notes/.test(a.options[0][3]), 'each named in full: ' + j(a.options.map((o) => o[3])));
	t.ok(a.focus, 'the keyboard starts on the snapshot shown');
	t.eq(j(a.tree), j(['tree', 'Contents']), 'the contents are a tree, named');
	t.eq(j(a.unnamed), '[]', 'no control without a name');
	await p.key('ArrowDown');
	await drawn(p);
	t.eq((await bar(p)).name, 'First draft', 'Down in the list shows the next snapshot');
	await p.key('Home');
	await drawn(p);
	t.eq((await bar(p)).name, 'The binder now', 'Home, the binder now');
	await p.key('End');
	await drawn(p);
	// into the contents: arrows move, Enter opens a note, the arrow button comes back
	await p.ev(`(() => { document.querySelector(${j(DLG + ' .binders-folder-snapshots-tree .tree-item-self')}).focus(); return 1; })()`);
	await p.key('ArrowDown');
	await p.key('ArrowDown');
	const on = await p.ev(`document.activeElement.getAttribute('aria-label')`);
	t.ok(/^Arrival, \+\d+ words?$/.test(on), 'Down in the contents moves row by row, each said with what is different: ' + on);
	await p.key('Enter');
	await drawn(p);
	t.ok(await p.ev(`!!document.querySelector(${j(DLG + ' .binders-folder-snapshots-crumb')})`), 'Enter opens the note');
	t.eq(await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-crumb .clickable-icon')}).getAttribute('aria-label')`), 'Back to the contents', 'the way back is named');
	await p.ev(`(() => { document.querySelector(${j(DLG + ' .binders-folder-snapshots-crumb .clickable-icon')}).focus(); return 1; })()`);
	await p.key('Enter');
	await drawn(p);
	t.ok((await tree(p)).length > 3, 'and Enter on it goes back');
	// a folder row opens and shuts by the keyboard, and says which
	await p.ev(`(() => { [...document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-tree .tree-item-self')})].find(e => e.textContent.startsWith('Part One')).focus(); return 1; })()`);
	const was = await p.ev(`document.activeElement.getAttribute('aria-expanded')`);
	await p.key(' ');
	t.ok(was !== await p.ev(`document.activeElement.getAttribute('aria-expanded')`), 'Space opens or shuts a folder, and it says which');
	await p.key('Escape');
	await sleep(p, 300);
	t.eq(await p.ev(`document.querySelectorAll(${j(DLG)}).length`), 0, 'Escape closes the dialog');
});

// ---- size ----

test('5,000 notes in 200 folders: a snapshot is taken in seconds, as one file; the dialog opens on what changed in seconds', async (p, h, t) => {
	const R = 'Big';
	await make(p, R, `Array.from({ length: 5000 }, (_, i) => ({ path: 'Part ' + String(Math.floor(i / 25) + 1).padStart(3, '0') + '/Scene ' + String(i + 1).padStart(4, '0') + '.md', text: '---\\nstatus: draft\\n---\\nScene ' + (i + 1) + ' has a few words of its own, enough to be counted and compared.\\n\\nA second paragraph for scene ' + (i + 1) + '.\\n' }))`, { timeout: 300000 });
	await sleep(p, 1500);
	const t0 = Date.now();
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(R)}).then(() => 1)`);
	const took = Date.now() - t0;
	const files = await list(p, R + '/Snapshots');
	t.eq(files.length, 1, 'one file');
	t.ok(took < 15000, `taken in ${took} ms (limit 15 s on a busy machine; it is under a second on an idle one)`);
	const size = await p.ev(`app.vault.adapter.stat(${j(`${R}/Snapshots/${files[0]}`)}).then(s => s.size)`);
	t.ok(size > 500000 && size < 5000000, `of ${size} bytes`);
	const t1 = Date.now();
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(R)}).then(() => 1)`);
	t.ok(Date.now() - t1 < 15000 && (await list(p, R + '/Snapshots')).length === 1, `nothing changed: none is taken, in ${Date.now() - t1} ms`);
	await age(p, files[0], '2026-09-19 16.20.05', R + '/Snapshots');
	// a day's work
	await p.ev(`(async () => { const s = ${B}.scenes(${file(R)}); for (let k = 0; k < 20; k++) await app.vault.process(s[100 + k * 37], (x) => x + '\\nA line added on the day.\\n'); for (let k = 0; k < 5; k++) await app.vault.delete(s[1500 + k * 11]); await app.fileManager.renameFile(s[4000].parent, s[4000].parent.path + ' renamed'); await new Promise(r => setTimeout(r, 1500)); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 1500);
	const t2 = Date.now();
	await p.ev(`(() => { ${PL}.snapshotsApi.show(${file(R)}); return 1; })()`);
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-folder-snapshots-key')})`, 60000);
	const opened = Date.now() - t2;
	t.eq(await key(p), 'Since this snapshot: 20 notes rewritten, 5 gone, 1 renamed. 120 words put in.', 'what changed, exactly');
	t.ok(opened < 20000, `the dialog drew what changed in ${opened} ms (limit 20 s on a busy machine)`);
	t.ok(await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-tree .tree-item-self')}).length`) < 700, 'and draws the folders and what changed, not five thousand rows');
}, 900000);

test('three hundred snapshots: the list opens at once, says the months, and can show only the ones with a name; the ones Binders took itself are marked as such', async (p, h, t) => {
	await openView(p);
	const first = await take(p);
	const text = await exact(p, `${SN}/${first.files[0]}`);
	await p.ev(`(async () => {
		const a = app.vault.adapter, names = { 40: ' Zero draft', 150: ' First draft', 281: ' Draft sent to Sam' }, autos = { 39: ' Before bringing back Zero draft.auto', 290: ' Before find and replace.auto' }, p2 = (n) => String(n).padStart(2, '0');
		for (let k = 0; k < 299; k++) { const d = new Date(2025, 7, 3 + Math.floor(k * 1.4), 7 + (k % 12), 40, k % 60); await a.write(${j(SN + '/')} + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + '.' + p2(d.getMinutes()) + '.' + p2(d.getSeconds()) + (names[k] ?? autos[k] ?? '') + '.binder-snapshot', ${j(text)}); }
	})().then(() => 1)`);
	await until(p, `${file(SN)}?.children.length === 300`, 30000);
	const t0 = Date.now();
	await openDialog(p);
	await drawn(p);
	const opened = Date.now() - t0;
	t.eq((await rows(p)).length, 301, 'three hundred, and now');
	t.ok(opened < 15000, `open in ${opened} ms`);
	const months = await p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-month')})].map(e => e.textContent)`);
	t.ok(months.length >= 13 && /^[A-Z][a-z]+ 20\d\d$/.test(months[0]), 'the months are said: ' + j(months.slice(0, 3)));
	t.eq(await p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-snapshots-item.is-auto .binders-snapshots-item-name')})].map(e => e.textContent).join('|')`), 'Before find and replace|Before bringing back Zero draft', 'the two Binders took itself are quieter, and named for why');
	t.ok(/taken by Binders$/.test(await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-item.is-auto')}).getAttribute('aria-label')`)), 'and say so to a screen reader');
	const f = await p.at(DLG + ' .binders-folder-snapshots-named');
	t.ok(!!f, 'a switch for the named ones is there');
	await p.click(f.x, f.y);
	await sleep(p, 600);
	t.eq(j((await rows(p)).map((r) => r[0])), j(['The binder now', 'Draft sent to Sam', 'First draft', 'Zero draft']), 'on: only the ones with a name');
	t.eq(await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-named')}).getAttribute('aria-pressed')`), 'true', 'and it says it is on');
	t.ok(/words$/.test((await rows(p))[1][1]) || (await until(p, `/words$/.test(document.querySelectorAll(${j(DLG + ' .binders-snapshots-item-detail')})[1].textContent)`, 5000)), 'a row in sight says how big the binder was');
}, 300000);

// ---- a phone and a tablet ----

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const tapOn = async (p, sel, text) => { const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.offsetParent && e.textContent.trim().startsWith(${j(text)})).pop(); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return r.width ? { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 } : null; })()`); if (!at) throw new Error(`nothing to tap: ${sel} “${text}”`); await tap(p, at.x, at.y); };
/** Runs fn in Obsidian's mobile mode at a phone's or a tablet's size, by touch; then puts the desktop back. */
async function onMobile(p, [width, height], fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
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
	if (logged.length) throw new Error('errors logged: ' + logged.slice(0, 3).join(' ; '));
}
/** A snapshot, then work, on the desktop; the binder view open again once Obsidian is a phone or a tablet. */
async function seeded(p) {
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Draft sent to Sam');
	await work(p);
}

test('on a phone: the button is in the header; the list is a sheet with a button that takes one; a tap shows the contents, a tap on a note its changes; one note is brought back; nothing runs off the screen', async (p, h, t) => {
	await seeded(p);
	const was = (await snapshot(p, `${SN}/2026-09-19 16.20.05 Draft sent to Sam.binder-snapshot`)).items.find((i) => i.path === 'Part One/Arrival.md').text;
	await onMobile(p, [390, 844], async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		await openView(p);
		await p.ev(`(() => { ${PL}.snapshotsApi.show(${file(L)}); return 1; })()`);
		await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
		await sleep(p, 600);
		t.ok(!(await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-pane')})?.isConnected`)), 'the list alone first, as the note’s dialog has it');
		t.eq(await p.ev(`document.querySelector(${j(DLG + ' .binders-snapshots-head button')}).textContent`), 'Take a snapshot', 'with a button, in words, that takes one');
		t.ok(!(await p.ev(`document.activeElement?.closest(${j(DLG)})?.matches?.(':focus-visible')`)), 'nothing is ringed as it opens');
		await tapOn(p, DLG + ' .binders-snapshots-item-name', 'Draft sent to Sam');
		await drawn(p);
		t.eq(await p.ev(`document.querySelector(${j(DLG + ' .modal-title')}).textContent`), 'Draft sent to Sam', 'a tap shows it: its name is the sheet’s title');
		const b = await bar(p);
		t.eq(j([b.quiet, b.buttons, b.more]), j([['Show changes*'], ['Bring back...'], true]), 'the bar: one switch, “Bring back...” and the menu (“Read” is in the menu here)');
		t.ok((await tree(p)).includes('Arrival | +11 −4 words'), 'the contents, with what changed');
		const fit = await p.ev(`(() => { const w = innerWidth; return [...document.querySelectorAll(${j(DLG + ' .tree-item-self, ' + DLG + ' .modal-setting-titlebar-actions > *, ' + DLG + ' .binders-folder-snapshots-key')})].filter(e => e.offsetParent).every(e => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= w + 0.5; }); })()`);
		t.ok(fit, 'nothing runs off the side of the screen');
		const small = await p.ev(`[...document.querySelectorAll(${j(DLG + ' .modal-setting-titlebar-actions > *')})].map(e => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))`);
		t.ok(small.every((s) => s >= 40), 'the bar’s controls are big enough for a finger: ' + j(small));
		t.ok((await more(p, null).catch(async () => { const m = await p.at(DLG + ' .modal-setting-titlebar-actions [aria-label="More"]'); await tap(p, m.x, m.y); return menuItems(p); })).includes('Read'), 'the menu has “Read”');
		await closeMenus(p);
		await tapOn(p, DLG + ' .binders-folder-snapshots-tree .tree-item-inner', 'Arrival');
		await drawn(p);
		t.ok(await p.ev(`document.querySelectorAll(${j(DLG + ' .binders-snapshots-changes ins')}).length > 0`), 'a tap on a note shows its changes as prose');
		t.eq(j((await bar(p)).buttons), j(['Bring back']), 'with “Bring back”');
		const before = await texts(p);
		await tapOn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
		await until(p, `app.vault.adapter.read(${j(A)}).then(s => !s.includes('Nobody had come down'))`, 8000);
		await sleep(p, 500);
		t.eq(bodyOf(await read(p, A)), bodyOf(was), 'the note has the text it had');
		same(t, before, await texts(p), { skip: [A] });
		t.ok(await p.ev(`app.vault.adapter.list(${j(SN + '/Part One/Arrival')}).then(l => l.files.length === 1)`), 'and the text it replaced is a snapshot of the note');
		// back to the list
		await drawn(p);
		const back = await p.at(DLG + ' .modal-setting-back-button');
		await tap(p, back.x, back.y);
		t.ok(await p.ev(`!!document.querySelector(${j(DLG + ' .binders-snapshots-list')})?.offsetParent && !document.querySelector(${j(DLG + ' .binders-snapshots-pane')})?.isConnected`), 'the arrow goes back to the list');
	});
}, 300000);

test('on a tablet, and in a narrow window: the snapshot’s name has a line of its own over the buttons, in a folder’s dialog and in a note’s, so it can be read', async (p, h, t) => {
	await seeded(p);
	await p.ev(`app.vault.process(${file(W)}, (t) => t + 'More.\\n').then(() => 1)`);
	await sleep(p, 200);
	const measure = (dlg) => p.ev(`(() => { const d = document.querySelector(${j(dlg)}), n = d.querySelector('.binders-snapshots-name'), a = d.querySelector('.modal-setting-titlebar-actions'), c = d.querySelector('.modal-close-button, .modal-header-button'); const nr = n.getBoundingClientRect(), ar = a.getBoundingClientRect(), cr = c ? c.getBoundingClientRect() : { left: 1e9, bottom: -1 }; const kids = [...a.children].map(e => e.getBoundingClientRect()); return { name: n.textContent, shown: n.scrollWidth <= n.clientWidth + 1, width: Math.round(nr.width), below: ar.top >= nr.bottom - 1, closeClear: kids.every(k => k.right <= cr.left + 1 || k.top >= cr.bottom - 1), inside: kids.every(k => k.left >= d.getBoundingClientRect().left && k.right <= d.getBoundingClientRect().right + 1) }; })()`);
	await onMobile(p, [820, 1180], async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
		await openView(p);
		await p.ev(`(() => { ${PL}.snapshotsApi.show(${file(L)}); return 1; })()`);
		await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`);
		await drawn(p);
		const m = await measure(DLG);
		t.ok(m.name === 'Draft sent to Sam' && m.shown, 'a folder’s dialog: the whole name shows: ' + j(m));
		t.ok(m.below && m.inside && m.closeClear, 'on its own line, the buttons under it, inside the dialog and clear of the button that closes it: ' + j(m));
		t.eq(j((await bar(p)).quiet), j(['Show changes*']), '“Read” is in the menu on a tablet too');
		await p.key('Escape');
		await sleep(p, 400);
	});
	// a narrow window on the desktop: the same rule, by the dialog's own width
	await p.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 800, deviceScaleFactor: 1, mobile: false });
	await sleep(p, 400);
	await openView(p);
	await openDialog(p);
	await drawn(p);
	const narrow = await measure(DLG);
	t.ok(narrow.shown && narrow.below && narrow.inside, 'a narrow window: the same: ' + j(narrow));
	await closeAll(p);
	await p.ev(`(async () => { const { take } = ${PL}.snapshotsApi; await take(${file(W)}, 'Before the editor’s notes on chapter one'); await app.vault.process(${file(W)}, (t) => t + 'Since.\\n'); await app.workspace.getLeaf(false).openFile(${file(W)}); })().then(() => 1)`);
	await sleep(p, 500);
	await run(p, 'show-snapshots');
	await until(p, `!!document.querySelector('.modal.binders-snapshots .binders-snapshots-item')`);
	await sleep(p, 500);
	const note = await measure('.modal.binders-snapshots');
	t.ok(note.name === 'Before the editor’s notes on chapter one' && note.shown && note.below && note.inside, 'a note’s dialog, with a long name: the whole name shows, over its buttons: ' + j(note));
	await closeAll(p);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
	await sleep(p, 300);
	await openView(p);
	await openDialog(p);
	await drawn(p);
	const wide = await measure(DLG);
	t.ok(!wide.below && wide.shown, 'a wide window: the name and the buttons on one line, as before: ' + j(wide));
}, 300000);
