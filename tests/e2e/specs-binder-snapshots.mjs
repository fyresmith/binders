// Snapshots of a folder and of a whole binder (src/binder-snapshots.ts, src/view/binder-snapshots.ts): everything in
// the folder as it stood, in one ".binder-snapshot" file under "Snapshots/<the folder's path>". Golden rule 2 lives
// here: every test that changes a note checks, byte for byte, that what it replaced is kept and that no other note
// changed; and every test that only looks checks that nothing changed at all.
import { B, NOTE, PL, card, clickMenu, closeMenus, contents, exists, file, hoverMenu, j, menuItems, openView, read, reload, same, texts, until, withTidy, writeRaw } from './view-helpers.mjs';
import { make } from './specs-qa6-scale.mjs';

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
	const cm = await p.at('.binders-manuscript .cm-content');
	await p.click(cm.x, cm.y);
	await p.type('TYPED-IN-THE-MANUSCRIPT ');
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
		'Prologue',
		'Part One | synopsis',
		'Arrival | +11 −4 words',
		'The keeper | now “The old keeper”',
		'Storm warning | moved to “Part Two”',
		'Part Two | 2 notes',
		'The wreck | label, status',
		'The lamp room [ins] | new',
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

test('a note that is gone is made again, byte for byte, where it stood; if a note has its name now, it comes back under the name counted on, and the one that is there isn’t touched', async (p, h, t) => {
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
	// again, with its name taken by another note
	await closeAll(p);
	await p.ev(`(async () => { await app.vault.delete(${file(K)}); await ${B}.newScene(${file(P1)}, 0, 'The keeper', undefined, 'Another note altogether.\\n'); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 300);
	const taken = await hex(p, K);
	await openDialog(p);
	await drawn(p);
	await clickIn(p, DLG + ' .binders-folder-snapshots-tree del', 'The keeper');
	await drawn(p);
	await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back');
	await until(p, `app.vault.adapter.exists(${j(P1 + '/The keeper 2.md')})`, 8000);
	await settle(p);
	t.eq(await hex(p, P1 + '/The keeper 2.md'), was, 'it comes back as “The keeper 2”, byte for byte');
	t.eq(await hex(p, K), taken, 'and the note that has the name is as it was');
	t.ok(/as “The keeper 2”: a note named “The keeper” is there now\.$/.test(await notices(p)), 'and it says so: ' + await notices(p));
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
	t.ok(/^Made “The Lighthouse \(Draft sent to Sam\)”: the binder as it stood Sep 19, 2026 [^,]+, beside the one that’s there\.$/.test((await notices(p)).split('|').pop()), 'it says what it made: ' + await notices(p));
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
	await p.ev(`(() => { const v = app.workspace.getLeavesOfType('binders-view')[0].view, m = new (require('obsidian').Menu)(); v.onPaneMenu(m, 'more-options'); m.showAtPosition({ x: 300, y: 200 }); return 1; })()`);
	await sleep(p, 250);
	const pane = await menuItems(p);
	t.ok(pane.includes('Take a snapshot') && pane.includes('Show snapshots...') && !pane.some((i) => /every note/.test(i)), 'the view’s menu too: ' + j(pane));
	await closeMenus(p);
	// the file explorer
	await p.ev(`(() => { const m = new (require('obsidian').Menu)(); app.workspace.trigger('file-menu', m, ${file(P2)}, 'file-explorer-context-menu'); m.showAtPosition({ x: 300, y: 200 }); return 1; })()`);
	await sleep(p, 250);
	const ex = await menuItems(p);
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
	await p.ev(`(() => { [...document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-tree .tree-item-self')})].find(e => e.textContent.startsWith('Part Two')).focus(); return 1; })()`);
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
		t.eq(j([b.quiet, b.buttons, b.more]), j([['Show changes*'], [], true]), 'the bar: one switch and the menu (“Read” is in the menu here)');
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
