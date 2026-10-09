// QA round 9: "Bring back..." a folder or binder snapshot, on a computer. Rule 2: after every scenario the vault's files are
// compared byte for byte with what should have changed.
import { B, NOTE, PL, card, clickMenu, closeMenus, contents, exists, file, hoverMenu, j, menuItems, openView, read, reload, same, texts, until, withTidy, writeRaw } from './view-helpers.mjs';
import { make } from './specs-qa6-scale.mjs';

export const specs = [];
const test = (name, fn, timeout) => specs.push({ name: name.startsWith('BUG: ') ? 'BUG: qa9 bringback: ' + name.slice(5) : 'qa9 bringback: ' + name, ...(timeout ? { timeout } : {}), fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });

const L = 'The Lighthouse', P1 = L + '/Part One', P2 = L + '/Part Two';
const A = P1 + '/Arrival.md', K = P1 + '/The keeper.md', S = P1 + '/Storm warning.md', W = P2 + '/The wreck.md', E = L + '/Epilogue.md';
const SN = L + '/Snapshots';
const DLG = '.modal.binders-folder-snapshots';
const BTN = '.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="Snapshots"]';
const NAME = /^\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d( .+)?\.binder-snapshot$/;
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
/** "Bring back..." on the snapshot shown (and, with a scope, that one picked): what the screen says. */
async function backScreen(p, scope = null) {
	if (!(await p.ev(`!!document.querySelector(${j(BACK)})`))) {
		await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...');
		await until(p, `!!document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan ul')})`, 20000);
	}
	if (scope) await p.ev(`(() => { const s = document.querySelector(${j(BACK + ' select')}); s.value = ${j(scope)}; s.dispatchEvent(new Event('change')); return 1; })()`);
	await sleep(p, 250);
	return p.ev(`(() => { const m = document.querySelector(${j(BACK)}), li = (c) => [...m.querySelectorAll('.' + c + ' li')].map(e => e.textContent); return { title: m.querySelector('.modal-title').textContent, intro: m.querySelector('.modal-content > p').textContent, options: [...m.querySelector('select').options].map(o => o.value + '=' + o.textContent), will: li('binders-folder-snapshots-plan-will'), left: li('binders-folder-snapshots-plan-left'), head: m.querySelector('.binders-folder-snapshots-plan-head')?.textContent ?? '', buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => b.textContent + (b.disabled ? ' (off)' : '')) }; })()`);
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


// ---- scenarios ----
const MS = '.workspace-leaf.mod-active .binders-manuscript';
/** The state of a snapshot to come back to: taken, given an old name, and the bytes then. */
async function aged(p, dir, name, D = SN) {
	await openView(p, dir);
	const first = await take(p, D);
	await age(p, first.files[0], '2026-09-19 16.20.05 ' + name, D);
	return bytes(p);
}

test('scopes, Escape and Cancel: Escape and Cancel change nothing and take no snapshot; “text” leaves the order, “order” leaves the text; the snapshot taken first returns every byte; twice in a row does nothing the second time', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await work(p);
	const before = await bytes(p), files = await allFiles(p), order = await contents(p);
	await openDialog(p); await drawn(p);
	await backScreen(p);
	await p.key('Escape'); await sleep(p, 300);
	t.ok(!(await p.ev(`!!document.querySelector(${j(BACK)})`)), 'Escape closes the screen');
	same(t, before, await bytes(p)); t.eq(j(await allFiles(p)), j(files), 'Escape: no file made, none changed');
	await backScreen(p);
	await clickIn(p, BACK + ' .modal-button-container button', 'Cancel');
	same(t, before, await bytes(p)); t.eq(j(await allFiles(p)), j(files), 'Cancel: no file made, none changed');
	// the text alone
	await backScreen(p, 'text');
	await confirmBack(p);
	const afterText = await bytes(p);
	t.eq(j(await contents(p)), j(order), 'text alone: the order is as it was');
	t.eq(afterText[A], then[A], 'text alone: Arrival byte for byte');
	for (const path of Object.keys(before)) if (![A, P1 + '/The old keeper.md', NOTE].includes(path)) t.eq(afterText[path], before[path], `text alone: ${path} untouched`);
	const auto = (await list(p)).find((f) => AUTO.test(f));
	t.ok(!!auto, 'the snapshot taken first exists');
	// bring that back: every byte as before
	await pickRow(p, (await rows(p)).find((r) => /^Before bringing back/.test(r[0]))[0]);
	await backScreen(p);
	await confirmBack(p);
	const restored = await bytes(p);
	for (const path of Object.keys(before)) t.eq(restored[path], before[path], `after bringing the automatic one back: ${path} is as it was`);
	t.eq(j(await contents(p)), j(order), 'and the order');
	// the order alone, from the old snapshot
	await pickRow(p, 'Draft');
	await backScreen(p, 'order');
	await confirmBack(p);
	const o = await bytes(p);
	for (const path of Object.keys(before)) if (path !== NOTE) t.eq(o[path], before[path], `order alone: ${path} text untouched`);
	t.ok(j(await contents(p)) !== j(order), 'order alone: the order changed');
	// twice in a row
	await backScreen(p, 'both'); await confirmBack(p);
	const filesNow = await allFiles(p);
	const again = await backScreen(p, 'both');
	t.ok(again.buttons[0] === 'Bring back (off)' || /^Nothing/.test(again.will[0] ?? ''), 'bringing back the same one twice: the second has nothing to do: ' + j(again));
	await p.key('Escape'); await sleep(p, 200);
	t.eq(j(await allFiles(p)), j(filesNow), 'and takes no snapshot');
	const fin = await bytes(p);
	t.eq(fin[A], then[A], 'Arrival is as in the snapshot');
}, 180000);

test('a note open in two panes and one in a hidden tab: the text is brought back into all of them; typing not saved is in the snapshot taken first; no word lost', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await p.ev(`(async () => { await app.vault.process(${file(A)}, (t) => t + '\\nWRITTEN-LATER-A.\\n'); await app.vault.process(${file(K)}, (t) => t + '\\nWRITTEN-LATER-K.\\n'); })().then(() => 1)`);
	await sleep(p, 400);
	await p.ev(`(async () => {
		const l1 = app.workspace.getLeaf('tab'); await l1.openFile(${file(A)}, { state: { mode: 'source' } });
		const l2 = app.workspace.getLeaf('split', 'vertical'); await l2.openFile(${file(A)}, { state: { mode: 'source' } });
		const l3 = app.workspace.getLeaf('tab'); await l3.openFile(${file(K)}, { state: { mode: 'source' } });
		const l4 = app.workspace.getLeaf('tab'); await l4.openFile(${file(E)}, { state: { mode: 'source' } });
		return 1; })()`);
	await sleep(p, 800);
	const eds = (path) => `app.workspace.getLeavesOfType('markdown').filter(l => l.view.file?.path === ${j(path)}).map(l => l.view.editor.getValue())`;
	t.eq(await p.ev(`${eds(A)}.length`), 2, '(A is open in two panes)');
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown').filter(l => l.view.file?.path === ${j(A)})[1]; const e = l.view.editor; e.replaceRange('\\nTYPED-IN-PANE-2', { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); return 1; })()`);
	await sleep(p, 100);
	const mid = await bytes(p);
	await showDialog(p);
	await backScreen(p);
	const said = await confirmBack(p);
	const after = await bytes(p);
	t.eq(after[A], then[A], 'Arrival byte for byte: ' + said);
	t.eq(after[K], then[K], 'the keeper (in a hidden tab) byte for byte');
	for (const v of await p.ev(`${eds(A)}`)) t.ok(!v.includes('TYPED-IN-PANE-2') && !v.includes('WRITTEN-LATER'), 'each pane shows the text brought back');
	for (const v of await p.ev(`${eds(K)}`)) t.ok(!v.includes('WRITTEN-LATER-K'), 'the hidden tab shows it too');
	const auto = (await list(p)).find((f) => AUTO.test(f)), kept = await snapshot(p, `${SN}/${auto}`);
	t.ok(kept.items.find((i) => i.path === 'Part One/Arrival.md').text.endsWith('TYPED-IN-PANE-2'), 'typed words are in the snapshot taken first');
	await sleep(p, 1500);
	t.eq((await bytes(p))[A], then[A], 'and nothing writes the stale pane text back after a second or two');
	for (const path of Object.keys(mid)) if (![A, K, NOTE].includes(path)) t.eq(after[path], mid[path], `${path} unchanged`);
}, 120000);

test('bringing back into a section of the manuscript with unsaved typing: the section shows the text brought back; one Undo gives it back; the typing is in the snapshot taken first', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await p.ev(`app.vault.process(${file(A)}, (t) => t + '\\nWRITTEN-LATER.\\n').then(() => 1)`);
	await sleep(p, 300);
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].view.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-manuscript .cm-content')`, 8000);
	await sleep(p, 600);
	await p.ev(`(async () => { const m = app.workspace.getLeavesOfType('binders-view')[0].view.current, s = m.scenes.find(s => s.file?.path === ${j(A)}) ?? m.scenes[0]; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); window.__sec = s.file.path; return 1; })()`);
	await sleep(p, 150);
	await p.type(' TYPED-IN-MS');
	const sec = await p.ev('window.__sec');
	t.ok(await until(p, `document.querySelector('.binders-manuscript')?.textContent.includes('TYPED-IN-MS')`, 4000), 'typed in the manuscript (section ' + sec + ')');
	await showDialog(p);
	await backScreen(p);
	const said = await confirmBack(p);
	await sleep(p, 1200);
	const after = await bytes(p);
	t.eq(after[A], then[A], 'Arrival byte for byte: ' + said);
	const shown = await p.ev(`document.querySelector('.binders-manuscript')?.textContent ?? ''`);
	t.ok(!shown.includes('TYPED-IN-MS') && !shown.includes('WRITTEN-LATER'), 'the manuscript shows the text brought back');
	const auto = (await list(p)).find((f) => AUTO.test(f)), kept = await snapshot(p, `${SN}/${auto}`);
	t.ok(kept.items.find((i) => i.path === 'Part One/Arrival.md').text.includes('TYPED-IN-MS'), 'typed words are in the snapshot taken first');
	await closeAll(p);
	if (sec === A) {
		await p.ev(`(() => { const m = app.workspace.getLeavesOfType('binders-view')[0].view.current, s = m.scenes.find(s => s.file?.path === ${j(A)}); s.live.editor.focus(); s.live.editor.undo(); return 1; })()`);
		await until(p, `app.vault.adapter.read(${j(A)}).then(s => s.includes('TYPED-IN-MS'))`, 6000);
		t.ok((await read(p, A)).includes('TYPED-IN-MS'), 'one Undo in the section gives the typed text back');
	}
	await sleep(p, 1500);
	t.ok((await read(p, A)).includes('WRITTEN-LATER') || (await read(p, A)) === textOf(then[A]) || (await read(p, A)).includes('TYPED-IN-MS'), 'the note is one of: as it was, or as before: never a mixture');
}, 120000);

test('a binder of 35 notes: a progress notice shows above 20 notes and every note comes back byte for byte', async (p, h, t) => {
	const items = `Array.from({length: 35}, (_, i) => ({ path: 'N' + String(i + 1).padStart(2, '0') + '.md', text: '---\\nsynopsis: s' + i + '\\n---\\nOriginal text of note ' + i + '. ' + 'word '.repeat(50) + '\\n' }))`;
	await make(p, 'Big', items);
	await p.ev(`(() => { ${PL}.snapshotsApi && 0; return 1; })()`);
	await openView(p, 'Big');
	const first = await take(p, 'Big/Snapshots');
	await age(p, first.files[0], '2026-09-19 16.20.05 Big draft', 'Big/Snapshots');
	const then = await bytes(p);
	await p.ev(`(async () => { for (let i = 1; i <= 35; i++) await app.vault.process(app.vault.getAbstractFileByPath('Big/N' + String(i).padStart(2, '0') + '.md'), (t) => t + 'EDITED-' + i + '\\n'); })().then(() => 1)`);
	await sleep(p, 600);
	await showDialog(p, 'Big');
	const screen = await backScreen(p);
	t.ok(/^35 notes get the text they had/.test(screen.will[0]), screen.will[0]);
	await p.ev(`(() => { window.__seen = []; const o = new MutationObserver(() => { document.querySelectorAll('.notice').forEach(n => { if (!window.__seen.includes(n.textContent)) window.__seen.push(n.textContent); }); }); o.observe(document.body, { childList: true, subtree: true, characterData: true }); window.__obs = o; return 1; })()`);
	const said = await confirmBack(p);
	const seen = await p.ev('window.__seen');
	t.ok(seen.some((x) => /^Bringing back/.test(x)), 'a progress notice was shown: ' + j(seen));
	const after = await bytes(p);
	for (const path of Object.keys(then)) if (path.startsWith('Big/N')) t.eq(after[path], then[path], path + ' byte for byte');
	t.ok(/^Brought back the text of 35 notes/.test(said), said);
	t.ok(!/Bringing back/.test(said) && !(await notices(p)).includes('Bringing back'), 'the progress notice is gone when it is done: ' + said);
}, 180000);

test('a Longform project with nested scenes moved: scenes block and indentation come back; the index note is written only in its scenes', async (p, h, t) => {
	const D = 'Longform demo', I = D + '/Index.md', DS = D + '/Snapshots';
	const then = await aged(p, D, 'Ferry draft', DS);
	// move a nested scene out and another one in: the group changes
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await ${B}.move(f(${j(D + '/The crossing.md')}), f(${j(D)}), 0); await ${B}.move(f(${j(D + '/Harbor.md')}), f(${j(D)}), 3); await ${B}.flush(); await app.vault.process(f(${j(D + '/Ticket office.md')}), (t) => t + 'Edited.\\n'); })().then(() => 1)`);
	await sleep(p, 600);
	const before = await bytes(p);
	t.ok(textOf(before[I]) !== textOf(then[I]), '(the index note changed)');
	await showDialog(p, D);
	const screen = await backScreen(p);
	const said = await confirmBack(p);
	p.errors.length = 0; // (the inspector's exception on a Longform reorder is the BUG test below)
	const after = await bytes(p);
	t.eq(after[I], then[I], 'the index note is byte for byte what it was: scenes block, indentation and the rest: ' + said + ' / ' + j(screen.will));
	for (const path of Object.keys(then)) if (path.startsWith(D + '/') && !path.includes('Snapshots')) t.eq(after[path], then[path], path + ' byte for byte');
}, 120000);

test('the screen in the dark theme (and light): nothing clipped, text readable', async (p, h, t) => {
	await aged(p, L, 'Draft');
	await work(p);
	await openDialog(p); await drawn(p);
	await backScreen(p);
	const r = await p.ev(`(() => {
		const m = document.querySelector(${j(BACK)}), box = m.getBoundingClientRect(), bad = [];
		const rgb = (c) => c.match(/[\\d.]+/g).map(Number);
		const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
		const bg = (e) => { for (; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length < 4 || c[3] > 0.5) return c; } return [255, 255, 255]; };
		let worst = 99;
		for (const e of m.querySelectorAll('p, li, button, label, select, .modal-title')) {
			if (!e.offsetParent) continue; const b = e.getBoundingClientRect();
			if (b.right > box.right + 1 || b.left < box.left - 1 || b.bottom > box.bottom + 1) bad.push(e.tagName + ':' + e.textContent.slice(0, 30));
			if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') bad.push('clip:' + e.textContent.slice(0, 30));
			const fg = rgb(getComputedStyle(e).color), back = bg(e), l1 = lum(fg), l2 = lum(back), cr = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
			if (e.textContent.trim() && cr < worst) worst = cr;
		}
		return { dark: document.body.classList.contains('theme-dark'), bad, worst, w: box.width, h: box.height, vw: innerWidth, vh: innerHeight };
	})()`);
	t.eq(j(r.bad), j([]), 'nothing clipped or outside the screen (' + (r.dark ? 'dark' : 'light') + ')');
	t.ok(r.worst >= 3, 'text contrast at least 3:1, worst ' + r.worst.toFixed(2));
	t.ok(r.w <= r.vw && r.h <= r.vh, 'fits the window');
}, 90000);

test('a note deleted and another renamed while the screen is open: the rest comes back, nothing else is lost', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await p.ev(`(async () => { await app.vault.process(${file(A)}, (t) => t + 'LATER-A\\n'); await app.vault.process(${file(K)}, (t) => t + 'LATER-K\\n'); await app.vault.process(${file(W)}, (t) => t + 'LATER-W\\n'); })().then(() => 1)`);
	await sleep(p, 500);
	await showDialog(p);
	const screen = await backScreen(p);
	t.ok(/^3 notes get/.test(screen.will[0]), screen.will[0]);
	const mid = await bytes(p);
	await p.ev(`(async () => { await app.vault.delete(${file(A)}); await app.fileManager.renameFile(${file(K)}, ${j(P1 + '/The renamed keeper.md')}); })().then(() => 1)`);
	await sleep(p, 600);
	const before = await bytes(p);
	let said, err = null;
	try { said = await confirmBack(p); } catch (e) { err = e.message; said = await notices(p); }
	await sleep(p, 600);
	const after = await bytes(p);
	t.eq(after[W], then[W], 'the untouched note came back byte for byte: ' + said + (err ? ' / ' + err : ''));
	const R = P1 + '/The renamed keeper.md';
	t.ok(after[R] === before[R] || after[R] === then[K], 'the renamed note is either left as it was or has the old text, never a mixture');
	t.ok(!(A in after), 'the deleted note is not made again');
	for (const path of Object.keys(before)) if (![W, R, NOTE].includes(path)) t.eq(after[path], before[path], path + ' unchanged');
	const auto = (await list(p)).filter((f) => AUTO.test(f));
	t.ok(auto.length <= 1, 'at most one automatic snapshot');
	if (auto.length) { const kept = await snapshot(p, `${SN}/${auto[0]}`); t.ok(kept.items.some((i) => i.text?.includes('LATER-K')) && !kept.items.some((i) => i.path.endsWith('Arrival.md')) , 'automatic snapshot holds the renamed note\'s latest text (A was already deleted)'); }
}, 120000);

test('BUG: reordering a Longform project that has indented scenes throws in the inspector\'s contents list (Dh.sync insertBefore)', async (p, h, t) => {
	const D = 'Longform demo';
	await openView(p, D);
	p.errors.length = 0;
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await ${B}.move(f(${j(D + '/The crossing.md')}), f(${j(D)}), 0); await ${B}.move(f(${j(D + '/Harbor.md')}), f(${j(D)}), 3); await ${B}.flush(); await new Promise(r => setTimeout(r, 800));
		await ${B}.change('x', [], async () => { await ${B}.reorder(f(${j(D)}), ['Harbor','Ticket office','The crossing','Island','Return'].map(n => f(${j(D)} + '/' + n + '.md'))); }); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 1500);
	t.ok(!p.errors.some((e) => /insertBefore/.test(e)), 'no exception: ' + j(p.errors.slice(0, 1)).slice(0, 200));
});

test('BUG: a note with Windows line endings and a byte-order mark, open in an editor: brought back byte for byte, and the typing is kept in the snapshot taken first', async (p, h, t) => {
	const M = P2 + '/Marked.md', raw = (x) => '\uFEFF---\nstatus: draft\n---\nWindows lines.\r\nAnd a mark.\r\n' + x;
	await p.ev(`app.vault.adapter.write(${j(M)}, ${j(raw(''))}).then(() => 1)`);
	await until(p, `!!${file(M)}`);
	const then = await aged(p, L, 'Draft');
	await p.ev(`app.vault.adapter.write(${j(M)}, ${j(raw('Later line.\r\n'))}).then(() => 1)`);
	await sleep(p, 500);
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(M)}, { state: { mode: 'source' } }).then(() => 1)`);
	await sleep(p, 700);
	await showDialog(p);
	await backScreen(p);
	const said = await confirmBack(p);
	await sleep(p, 1500);
	const after = await bytes(p);
	t.eq(after[M], then[M], 'byte for byte, line endings and mark included, with the note open: ' + said);
}, 90000);

test('a note open in reading mode, and one in a pane that is not the active one, brought back: bytes exact', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await p.ev(`(async () => { await app.vault.process(${file(A)}, (t) => t + '\\nLATER.\\n'); await app.vault.process(${file(W)}, (t) => t + 'LATER-W \\u{1F600} \\u00e9\\n'); })().then(() => 1)`);
	await sleep(p, 400);
	await p.ev(`(async () => { await app.workspace.getLeaf('tab').openFile(${file(A)}, { state: { mode: 'preview' } }); await app.workspace.getLeaf('split').openFile(${file(W)}, { state: { mode: 'source' } }); })().then(() => 1)`);
	await sleep(p, 700);
	await showDialog(p);
	await backScreen(p);
	await confirmBack(p);
	await sleep(p, 1500);
	const after = await bytes(p);
	t.eq(after[A], then[A], 'reading-mode note byte for byte');
	t.eq(after[W], then[W], 'split-pane note byte for byte');
}, 90000);

test('control: the same note with Windows line endings and a mark, closed: brought back byte for byte', async (p, h, t) => {
	const M = P2 + '/Marked.md', raw = (x) => '\uFEFF---\nstatus: draft\n---\nWindows lines.\r\nAnd a mark.\r\n' + x;
	await p.ev(`app.vault.adapter.write(${j(M)}, ${j(raw(''))}).then(() => 1)`);
	await until(p, `!!${file(M)}`);
	const then = await aged(p, L, 'Draft');
	await p.ev(`app.vault.adapter.write(${j(M)}, ${j(raw('Later line.\r\n'))}).then(() => 1)`);
	await sleep(p, 500);
	await showDialog(p); await backScreen(p); await confirmBack(p);
	t.eq((await bytes(p))[M], then[M], 'closed: byte for byte');
}, 90000);

test('words typed in an open note after the screen was drawn, and in a hidden tab before: none is lost (left in the note, or in the snapshot taken first)', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await p.ev(`(async () => { await app.vault.process(${file(A)}, (t) => t + '\\nLATER-A\\n'); await app.vault.process(${file(K)}, (t) => t + '\\nLATER-K\\n'); })().then(() => 1)`);
	await sleep(p, 400);
	await p.ev(`(async () => { await app.workspace.getLeaf('tab').openFile(${file(K)}, { state: { mode: 'source' } }); await app.workspace.getLeaf('tab').openFile(${file(A)}, { state: { mode: 'source' } }); })().then(() => 1)`);
	await sleep(p, 700);
	const type = (path, words) => p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(path)}); const e = l.view.editor; e.replaceRange(${j(words)}, { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); return 1; })()`);
	await type(K, ' TYPED-HIDDEN-K');                      // K is in a tab that is behind A's now
	await showDialog(p);
	const screen = await backScreen(p);
	await type(A, ' TYPED-AFTER-SCREEN-A');                // after the screen was drawn
	const said = await confirmBack(p);
	await sleep(p, 1500);
	const all = async (word) => {
		const fileHas = (await Promise.all([A, K].map((x) => read(p, x)))).some((x) => x.includes(word));
		const edHas = await p.ev(`app.workspace.getLeavesOfType('markdown').some(l => l.view.editor?.getValue().includes(${j(word)}))`);
		const snaps = await list(p); let inSnap = false;
		for (const f of snaps.filter((x) => AUTO.test(x))) inSnap = inSnap || (await snapshot(p, `${SN}/${f}`)).items.some((i) => i.text?.includes(word));
		return fileHas || edHas || inSnap;
	};
	t.ok(await all('TYPED-AFTER-SCREEN-A'), 'words typed after the screen was drawn are kept somewhere: ' + said);
	t.ok(await all('TYPED-HIDDEN-K'), 'words typed in the hidden tab are kept somewhere');
	t.ok(await all('LATER-A') && await all('LATER-K'), 'text written since is kept in the snapshot taken first');
	const edA = await p.ev(`app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(A)}).view.editor.getValue()`);
	t.eq(edA.replace(/\r/g, ''), (await read(p, A)).replace(/\r/g, ''), 'the editor and the file agree after a moment');
}, 90000);

test('keyboard: the screen opens with focus inside it; Enter does not bring anything back by itself; Tab reaches the dropdown and both buttons; Space on “Bring back” does it', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await work(p);
	const before = await bytes(p), files = await allFiles(p);
	await openDialog(p); await drawn(p);
	await backScreen(p);
	const focus = await p.ev(`(() => { const a = document.activeElement; return { in: !!a?.closest(${j(BACK)}), tag: a?.tagName, text: a?.textContent?.slice(0, 20) }; })()`);
	t.ok(focus.in, 'focus is inside the screen: ' + j(focus));
	await p.key('Enter'); await sleep(p, 600);
	const stillOpen = await p.ev(`!!document.querySelector(${j(BACK)})`);
	const mid = await bytes(p);
	if (!stillOpen) t.ok(j(mid) === j(before), 'Enter on the opened screen did something (the screen closed): it must change nothing unless it was on “Bring back”: focus was ' + j(focus));
	else t.ok(true, 'Enter did nothing');
	if (stillOpen) {
		const reach = [];
		for (let i = 0; i < 4; i++) { await p.key('Tab'); reach.push(await p.ev(`(() => { const a = document.activeElement; return a?.closest(${j(BACK)}) ? (a.tagName + ':' + (a.textContent || a.value || '').slice(0, 14)) : 'outside'; })()`)); }
		t.ok(reach.some((x) => /Bring back/.test(x)) && reach.some((x) => /Cancel/.test(x)) && reach.some((x) => /^SELECT/.test(x)) && !reach.includes('outside'), 'Tab goes around the dropdown and both buttons and stays inside the screen: ' + j(reach));
		await p.ev(`(() => { [...document.querySelectorAll(${j(BACK + ' button')})].find(b => b.textContent === 'Bring back').focus(); return 1; })()`);
		await p.key(' '); await until(p, `!document.querySelector(${j(BACK)})`, 20000); await settle(p);
		t.eq((await bytes(p))[A], then[A], 'Space on the focused “Bring back” brings back');
	}
	t.ok((await allFiles(p)).length >= files.length, 'no file lost');
}, 90000);

test('the snapshot file is deleted while the screen is open: pressing Bring back says so and changes nothing, takes no snapshot', async (p, h, t) => {
	await aged(p, L, 'Draft');
	await work(p);
	const before = await bytes(p);
	await showDialog(p); await backScreen(p);
	const f = (await list(p))[0];
	await p.ev(`app.vault.adapter.remove(${j(SN + '/' + f)}).then(() => 1)`);
	await sleep(p, 500);
	const files = await allFiles(p);
	await noNotices(p);
	await clickIn(p, BACK + ' .modal-button-container button', 'Bring back');
	await sleep(p, 1500);
	same(t, before, await bytes(p));
	t.eq(j(await allFiles(p)), j(files), 'no file made or lost');
	t.ok(!(await p.ev(`document.querySelector(${j(BACK + ' .modal-button-container button')})?.disabled`)), 'the screen is not stuck busy: ' + await notices(p));
});

test('Bring back pressed twice quickly: one bring back, one snapshot taken first, bytes exact', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await work(p);
	await showDialog(p); await backScreen(p);
	const files = await allFiles(p);
	await p.ev(`(() => { const b = [...document.querySelectorAll(${j(BACK + ' .modal-button-container button')})].find(b => b.textContent === 'Bring back'); b.click(); b.click(); return 1; })()`);
	await until(p, `!document.querySelector(${j(BACK)}) && document.querySelectorAll('.notice').length > 0`, 30000);
	await settle(p);
	const now = await allFiles(p);
	t.eq(now.filter((x) => !files.includes(x)).length, 1, 'one snapshot taken first');
	t.eq((await bytes(p))[A], then[A], 'Arrival exact');
});

test('the manuscript open while the order and the text are brought back: its sections follow the order, show the text, and the files are exact', async (p, h, t) => {
	const then = await aged(p, L, 'Draft');
	await work(p);
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].view.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-manuscript .cm-content, .binders-manuscript')`, 8000);
	await sleep(p, 800);
	await showDialog(p); await backScreen(p);
	await confirmBack(p);
	await sleep(p, 1500);
	const after = await bytes(p);
	t.eq(after[A], then[A], 'Arrival exact');
	t.eq(after[K.replace('The keeper', 'The old keeper')], then[K], 'keeper exact');
	const want = (await contents(p)).filter((x) => !x.endsWith('/'));
	const titles = await p.ev(`[...document.querySelectorAll('.binders-manuscript-scene .binders-manuscript-title')].map(e => e.textContent)`);
	t.eq(j(titles.filter((x, i) => titles.indexOf(x) === i)), j(want.map((x) => x.replace(/^.*\//, ''))), 'sections are in the order brought back');
	const shown = await p.ev(`document.querySelector('.binders-manuscript')?.textContent ?? ''`);
	t.ok(!shown.includes('Nobody had come down to meet her'), 'the manuscript shows the text brought back, not the later text');
}, 90000);

test('30 notes all open in tabs, each with unsaved typing: every typed word is in the snapshot taken first, every file comes back exact, every editor shows it', async (p, h, t) => {
	const items = `Array.from({length: 30}, (_, i) => ({ path: 'N' + String(i + 1).padStart(2, '0') + '.md', text: 'Original ' + i + '.\\n\\nSecond paragraph ' + i + '.\\n' }))`;
	await make(p, 'Big', items);
	await openView(p, 'Big');
	const first = await take(p, 'Big/Snapshots');
	await age(p, first.files[0], '2026-09-19 16.20.05 Big draft', 'Big/Snapshots');
	const then = await bytes(p);
	await p.ev(`(async () => { for (let i = 1; i <= 30; i++) await app.vault.process(app.vault.getAbstractFileByPath('Big/N' + String(i).padStart(2, '0') + '.md'), (t) => t + 'LATER-' + i + '\\n'); })().then(() => 1)`);
	await sleep(p, 500);
	await p.ev(`(async () => { for (let i = 1; i <= 30; i++) { const f = app.vault.getAbstractFileByPath('Big/N' + String(i).padStart(2, '0') + '.md'); const l = app.workspace.getLeaf('tab'); await l.openFile(f, { state: { mode: 'source' } }); const e = l.view.editor; e.replaceRange(' TYPED-' + i, { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); } })().then(() => 1)`);
	await sleep(p, 800);
	await showDialog(p, 'Big');
	const screen = await backScreen(p);
	t.ok(/^30 notes get/.test(screen.will[0]), screen.will[0]);
	const said = await confirmBack(p);
	await sleep(p, 2000);
	const after = await bytes(p);
	const bad = Object.keys(then).filter((x) => x.startsWith('Big/N') && after[x] !== then[x]);
	t.eq(j(bad), j([]), 'every note exact: ' + said);
	const auto = (await list(p, 'Big/Snapshots')).find((f) => AUTO.test(f)), kept = await snapshot(p, `Big/Snapshots/${auto}`);
	const lost = [];
	for (let i = 1; i <= 30; i++) if (!kept.items.some((x) => x.path === 'N' + String(i).padStart(2, '0') + '.md' && x.text.includes(' TYPED-' + i))) lost.push(i);
	t.eq(j(lost), j([]), 'every typed word is in the snapshot taken first');
	const stale = await p.ev(`app.workspace.getLeavesOfType('markdown').filter(l => /TYPED|LATER/.test(l.view.editor?.getValue() ?? '')).length`);
	t.eq(stale, 0, 'no editor shows the later text');
	await sleep(p, 2500);
	const again = await bytes(p);
	t.eq(j(Object.keys(then).filter((x) => x.startsWith('Big/N') && again[x] !== then[x])), j([]), 'and nothing wrote the later text back');
}, 180000);

test('odd notes: no properties then properties added; properties then removed; an empty note then written in; a body that is only rules; body with a rule after properties: every one comes back to its text, byte for byte where the properties allow', async (p, h, t) => {
	const N = (n) => L + '/Odd ' + n + '.md';
	const orig = { 1: 'Plain text.\n\n---\n\nMore after a rule.\n', 2: '---\nstatus: draft\ntags: [a]\n---\nHad properties.\n', 3: '', 4: '---\n---\n---\n', 5: '---\nstatus: x\n---\n\n---\n\nBody after a rule.\n' };
	const later = { 1: '---\nstatus: new\n---\nPlain text.\n\n---\n\nMore after a rule.\nAnd later.\n', 2: 'No properties now. Written later.\n', 3: 'Now it has words.\n', 4: 'Words.\n', 5: '---\nstatus: y\n---\nChanged.\n' };
	for (const n of [1, 2, 3, 4, 5]) await p.ev(`app.vault.adapter.write(${j(N(n))}, ${j(orig[n])}).then(() => 1)`);
	await until(p, `!!${file(N(5))}`);
	await sleep(p, 600);
	const then = await bytes(p);
	await openView(p);
	const first = await take(p);
	await age(p, first.files[0], '2026-09-19 16.20.05 Odd');
	for (const n of [1, 2, 3, 4, 5]) await p.ev(`app.vault.adapter.write(${j(N(n))}, ${j(later[n])}).then(() => 1)`);
	await sleep(p, 800);
	const before = await bytes(p);
	await showDialog(p);
	const screen = await backScreen(p, 'text');
	const said = await confirmBack(p);
	await sleep(p, 800);
	const after = await bytes(p);
	for (const n of [1, 2, 3, 4, 5]) {
		const got = textOf(after[N(n)]), was = orig[n], now = later[n];
		t.ok(got === was || bodyOf(got) === bodyOf(was) || got.endsWith(bodyOf(was)), `odd ${n}: text back. was ${j(was)} now ${j(now)} got ${j(got)} (${said})`);
	}
	const auto = (await list(p)).find((f) => AUTO.test(f)), kept = await snapshot(p, `${SN}/${auto}`);
	for (const n of [1, 2, 3, 4, 5]) t.eq(hexOf(kept.items.find((i) => i.path === `Odd ${n}.md`)?.text ?? 'MISSING'), before[N(n)], `odd ${n}: the later text is in the snapshot taken first`);
});

test('names with quotes, brackets, hashes, emoji, accents and a leading dot-like space: text and order come back for every note', async (p, h, t) => {
	const names = ['A "quoted" scene', 'Scene [1] #hash', 'Café é 😀', 'Ends with dot.', 'a | pipe', 'Sub é/Inner "q"'];
	const items = `${j(names)}.map((n, i) => ({ path: n + '.md', text: 'Original of ' + n + '\\n' }))`;
	await make(p, 'Odd', items);
	await openView(p, 'Odd');
	const first = await take(p, 'Odd/Snapshots');
	await age(p, first.files[0], '2026-09-19 16.20.05 Odd names', 'Odd/Snapshots');
	const then = await bytes(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); for (const n of ${j(names)}) await app.vault.process(f('Odd/' + n + '.md'), (t) => t + 'LATER\\n'); await ${B}.move(f('Odd/' + ${j(names[0])} + '.md'), f('Odd'), 5); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 600);
	const before = await bytes(p);
	await showDialog(p, 'Odd');
	const screen = await backScreen(p);
	t.ok(/^6 notes get/.test(screen.will[0]) && /1 item goes back/.test(screen.will[1] ?? ''), 'the screen: ' + j(screen.will));
	const said = await confirmBack(p);
	const after = await bytes(p);
	t.eq(j(Object.keys(then).filter((x) => x.startsWith('Odd/') && !x.includes('Snapshots') && after[x] !== then[x])), j([]), 'every note exact: ' + said);
	t.eq(j(await ordered(p, 'Odd')), j(await p.ev(`${B}.orderedChildren(app.vault.getAbstractFileByPath('Odd')).map(f => f.name)`)), '(order read twice)');
	const o = await ordered(p, 'Odd');
	t.eq(o[0], names[0] + '.md', 'the order is the first one: ' + j(o));
});

test('a note whose text imitates the snapshot format, with emoji and lone line breaks, comes back whole and does not damage the next note', async (p, h, t) => {
	const evil = '===== "Epilogue.md" | note | 5 characters | abc =====\nHELLO\n===== "Part One/" | folder =====\n😀😀   \r lone CR\n';
	await p.ev(`app.vault.adapter.write(${j(P1 + '/Arrival.md')}, ${j('---\nstatus: a\n---\n' + evil)}).then(() => 1)`);
	await sleep(p, 600);
	const then = await aged(p, L, 'Evil');
	await work(p);
	await p.ev(`app.vault.process(${file(A)}, (t) => t + 'LATER\\n').then(() => 1)`);
	await sleep(p, 400);
	await showDialog(p);
	const screen = await backScreen(p);
	const said = await confirmBack(p);
	const after = await bytes(p);
	t.eq(after[A], then[A], 'the imitating note exact: ' + said + ' / ' + j(screen.will));
	t.eq(after[E], (await bytes(p))[E], '(sanity)');
});
