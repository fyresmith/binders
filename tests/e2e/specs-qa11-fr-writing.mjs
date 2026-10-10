// QA round 11, find and replace and never losing writing, adversarial (src/find/, src/view/find-bar.ts, src/scenes.ts's
// saveOpen, src/binder-snapshots.ts). Races and edges around Replace one, Replace all and Undo: files changed on disk
// during the review, mid-way and between the replace and Undo; a note open in a tab, two panes and the manuscript at once;
// typing while it runs; failures; Undo twice; odd text (CRLF, a byte-order mark, no last line break, an empty note, a note
// that is only properties). Every test compares whole files byte for byte, every note of the binder. Tests named
// "qa11 fr writing: …"; a confirmed bug is "BUG: …", a small one "NIT: …".
import { B, PL, VIEW, file, j, openView, until, withTidy, writeRaw } from './view-helpers.mjs';
import { LEAF, binder, disk, saveAll, settle, snap, M } from './specs-qa5-manuscript.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 fr writing: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await cleanup(p); } }) });

const BAR = `${VIEW}.findBar`;
const BARSEL = `${LEAF} .binders-view .binders-find`;
async function cleanup(p) {
	await p.ev(`(() => { try { window.__restore?.(); window.__restore = null; } catch {} try { ${BAR}?.close(); } catch {} document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); document.querySelectorAll('.menu').forEach(m => m.remove()); app.workspace.getLeavesOfType('markdown').forEach(l => { try { l.detach(); } catch {} }); return 1; })()`).catch(() => {});
}
const vault = (p) => Object.fromEntries(Object.entries(snap(p)).filter(([k]) => !/(^|\/)Snapshots\//.test(k)));
const doneText = (p) => p.ev(`(() => { const e = document.querySelector(${j(BARSEL + ' .binders-find-done')}); return e && e.style.display !== 'none' ? e.textContent : null; })()`);
const snapshots = (p, folder) => p.ev(`${PL}.snapshotsApi.list(${file(folder)}).map(s => ({ title: s.title, auto: s.auto, path: s.file.path }))`);

/** A binder written as an outside app would write it: bytes as given (line breaks and byte-order marks kept). */
async function rawBinder(p, name, notes) {
	const names = notes.map(([n]) => n);
	await p.ev(`(async () => {
		if (!app.vault.getAbstractFileByPath(${j(name)})) await app.vault.createFolder(${j(name)});
		for (const [n, s] of ${j(notes)}) await app.vault.adapter.write(${j(name)} + '/' + n + '.md', s);
		await app.vault.adapter.write(${j(name + '/' + name + '.md')}, '---\\nbinder: 1\\ncontents:\\n' + ${j(names)}.map(c => '  - ' + JSON.stringify(c)).join('\\n') + '\\n---\\n');
		for (let i = 0; i < 150; i++) { if (${j(names)}.every(n => app.vault.getAbstractFileByPath(${j(name)} + '/' + n + '.md')) && ${B}.scenes(app.vault.getAbstractFileByPath(${j(name)}))?.length === ${names.length}) break; await new Promise(r => setTimeout(r, 100)); }
		return 1; })()`);
	await p.sleep(500);
}
async function start(p, name, mode) {
	await openView(p, name);
	await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
	if (mode === 'manuscript') await settle(p); else await p.sleep(900);
}
async function ask(p, q, by = null, match = true) {
	await p.ev(`(async () => {
		const v = ${VIEW};
		if (!v.findBar) v.showSearch(${by != null}); else if (${by != null}) v.findBar.setReplacing(true);
		const b = v.findBar;
		if (b.options.matchCase !== ${match}) b.options = { matchCase: ${match} };
		b.input.value = ${j(q)};
		${by != null ? `b.by.value = ${j(by)};` : ''}
		await b.search();
	})().then(() => 1)`);
	await p.sleep(250);
}
/** Replace all as a person does it; `between` runs while the review is open. */
async function replaceAll(p, between = null) {
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(200);
	if (between) await between();
	await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta').click(); return 1; })()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(300);
}
const undo = async (p) => { await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')}).click()`); await p.sleep(900); };
/** Every note the bar's plan holds, paths. */
const planned = (p) => p.ev(`${BAR}.found.map(f => f.source.file.path)`);
const frontOf = (s) => (/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(s) ?? [''])[0];
/** The text with each "Mara" of its text (not of its properties) as `by`. */
const rep = (s, by, q = 'Mara') => { const f = frontOf(s); return f + s.slice(f.length).split(q).join(by); };
function same(t, before, after, changes = {}) {
	for (const k of new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(changes)])) {
		if (k in changes) { if (changes[k] === null) t.ok(!(k in after), `“${k}” is gone`); else t.eq(after[k], changes[k], `“${k}” is exactly what it should be`); }
		else t.eq(after[k], before[k], `“${k}” is untouched, byte for byte`);
	}
}
const types = (p, path, text) => p.ev(`(async () => { const s = ${M}.scenes.find(s => s.file.path === ${j(path)}); const cm = s.live.cm; cm.dispatch({ changes: { from: cm.state.doc.length, insert: ${j(text)} } }); return 1; })()`);
const inTab = (p, path) => p.ev(`app.workspace.getLeaf('tab').openFile(${file(path)}).then(() => 1)`).then(() => p.sleep(900));
const flushTabs = async (p) => { await p.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('markdown')) await l.view.save?.(); })().then(() => 1)`); await saveAll(p); await p.sleep(2300); };
const goBinder = (p) => p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`).then(() => p.sleep(300));

// the odd notes: CRLF, a byte-order mark, no last line break, empty, only properties, a rule in the middle, symbols
const ODD = [
	['1 Crlf', '---\r\nstatus: draft\r\nsynopsis: Mara\r\n---\r\nMara walked.\r\nMara ran.\r\n'],
	['2 Bom', '﻿---\nstatus: draft\n---\nMara has a mark before her.\n'],
	['3 NoEnd', 'Mara'],
	['4 Empty', ''],
	['5 Props', '---\nsynopsis: Mara\nstatus: Mara\n---\n'],
	['6 Rule', 'Plain.\n\n---\nstatus: Mara\n---\nMara after a rule.\n'],
	['7 Plain', 'Mara, MaraMara and Mara\n\nMara.\n'],
	['8 Aaa', '---\nstatus: x\n---\nMara Mara Mara \u{1F600}Mara\n'],
];
const BY = '$&$1\\\\ Mara-$$ \\n';

// =====================================================================================================================
// Replace all on odd text, then Undo, then the snapshot
// =====================================================================================================================

test('Replace all on CRLF, BOM, no last line break, empty, only-properties, a rule in the middle; the replacement holds $&, $1, backslashes and the query; Undo and the snapshot give back every byte of every note', async (p, h, t) => {
	await rawBinder(p, 'Odd', ODD);
	await start(p, 'Odd', 'outliner');
	const before = vault(p);
	await ask(p, 'Mara', BY);
	await replaceAll(p);
	await saveAll(p);
	const after = vault(p), want = {};
	for (const [n, s] of ODD) want[`Odd/${n}.md`] = rep(s, BY);
	same(t, before, after, want);
	t.ok(/^Replaced \d+ in \d+ notes?\./.test(await doneText(p) ?? ''), 'the bar says what it did: ' + await doneText(p));
	await undo(p);
	await saveAll(p);
	same(t, before, vault(p));
	// and the snapshot it took (before) holds every note, whole
	const s = (await snapshots(p, 'Odd')).filter((x) => x.auto);
	t.eq(s.length, 1, 'one automatic snapshot');
	await ask(p, 'Mara', BY);
	await replaceAll(p);
	await saveAll(p);
	same(t, before, vault(p), want);
	const snapNow = (await snapshots(p, 'Odd')).filter((x) => x.auto).sort((a, b) => a.path.localeCompare(b.path));
	const oldest = await p.ev(`(async () => { const s = ${PL}.snapshotsApi.list(${file('Odd')}).filter(x => x.auto).pop(); await ${PL}.snapshotsApi.back(s, ${file('Odd')}, 'text'); return 1; })()`);
	void oldest; void snapNow;
	await p.sleep(900);
	await saveAll(p);
	same(t, before, vault(p));
});

test('the snapshot taken before Replace all holds every note of the binder (the ones with no match, the empty one, the one that is only properties) as they were, byte for byte', async (p, h, t) => {
	await rawBinder(p, 'Whole', ODD);
	await start(p, 'Whole', 'outliner');
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	const s = (await snapshots(p, 'Whole')).find((x) => x.auto);
	t.ok(!!s, 'a snapshot exists');
	const raw = s ? disk(p, s.path) : '';
	const decoded = await p.ev(`(async () => { const r = await app.vault.adapter.readBinary(${j(s?.path ?? '')}); return new TextDecoder('utf-8', { ignoreBOM: true }).decode(r); })()`);
	void decoded;
	for (const [n, text] of ODD) {
		const body = text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
		if (!body) continue;
		t.ok(raw.includes(body.replace(/\r\n/g, '\n')) || raw.includes(body), `the snapshot holds “${n}” as it was (${JSON.stringify(body.slice(0, 30))})`);
	}
	// bringing it back through the app's own path gives each note back
	const before = Object.fromEntries(ODD.map(([n, x]) => [`Whole/${n}.md`, x]));
	await p.ev(`(async () => { const s = ${PL}.snapshotsApi.list(${file('Whole')}).find(x => x.auto); await ${PL}.snapshotsApi.back(s, ${file('Whole')}, 'text'); return 1; })()`);
	await p.sleep(900);
	await saveAll(p);
	const now = vault(p);
	for (const k of Object.keys(before)) t.eq(now[k], before[k], `“${k}” is back, byte for byte`);
});

test('the same odd notes open in tabs of their own with unsaved typing: Replace all keeps the typing and the line breaks and mark the way an ordinary edit does', async (p, h, t) => {
	const notes = [
		['1 Crlf', '---\r\nstatus: draft\r\n---\r\nMara walked.\r\nMara ran.\r\n'],
		['2 Bom', '﻿---\nstatus: draft\n---\nMara has a mark.\n'],
		['3 CtlCrlf', '---\r\nstatus: x\r\n---\r\nNo name here.\r\nNone.\r\n'],
		['4 CtlBom', '﻿---\nstatus: x\n---\nNo name here.\n'],
	];
	await rawBinder(p, 'Tabs', notes);
	await start(p, 'Tabs', 'outliner');
	for (const [n] of notes) {
		await inTab(p, `Tabs/${n}.md`);
		await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.replaceRange('Typed Mara.\\n', { line: e.lineCount() - 1, ch: e.getLine(e.lineCount() - 1).length }); return 1; })()`);
	}
	// (the controls get the same typing without the word, to see what an ordinary save does to the line breaks and the mark)
	await goBinder(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await flushTabs(p);
	const ctlCrlf = disk(p, 'Tabs/3 CtlCrlf.md'), ctlBom = disk(p, 'Tabs/4 CtlBom.md');
	const crlf = disk(p, 'Tabs/1 Crlf.md'), bom = disk(p, 'Tabs/2 Bom.md');
	t.eq(crlf.includes('\r\n'), ctlCrlf.includes('\r\n'), 'a CRLF note is saved with the line breaks an ordinary edit leaves: ' + JSON.stringify(crlf));
	t.eq(bom.startsWith('﻿'), ctlBom.startsWith('﻿'), 'a note with a byte-order mark keeps it as an ordinary edit does: ' + JSON.stringify(bom.slice(0, 12)));
	t.ok(/Maren walked\./.test(crlf) && /Maren ran\./.test(crlf) && /Typed Maren\./.test(crlf), 'every match of the CRLF note, the typing included: ' + JSON.stringify(crlf));
	t.ok(/Maren has a mark\./.test(bom) && /Typed Maren\./.test(bom), 'and of the mark note: ' + JSON.stringify(bom));
	t.ok(crlf.startsWith('---') && /status: draft/.test(crlf), 'the properties are as they were');
});

// =====================================================================================================================
// One note, several editors
// =====================================================================================================================

test('one note in the manuscript, in a tab and in a second tab with unsaved typing in the tab: Replace all replaces once everywhere, no text doubled or lost; Undo takes it back', async (p, h, t) => {
	await rawBinder(p, 'Multi', [['1 A', '---\nstatus: a\n---\nMara. Mara.\n'], ['2 B', 'Other Mara.\n']]);
	await start(p, 'Multi', 'manuscript');
	await inTab(p, 'Multi/1 A.md');
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.replaceRange('Typed Mara.\\n', { line: e.lineCount() - 1, ch: e.getLine(e.lineCount() - 1).length }); return 1; })()`);
	await p.ev(`app.workspace.getLeaf('split').openFile(${file('Multi/1 A.md')}).then(() => 1)`);
	await p.sleep(900);
	await goBinder(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await flushTabs(p);
	const a = disk(p, 'Multi/1 A.md');
	t.eq(a, '---\nstatus: a\n---\nMaren. Maren.\nTyped Maren.\n', 'replaced once, the typing kept and replaced');
	const eds = await p.ev(`[...app.workspace.getLeavesOfType('markdown')].map(l => l.view.file?.path + '|' + l.view.editor.getValue())`);
	for (const e of eds) t.ok(!e.startsWith('Multi/1 A.md|') || e.endsWith('|---\nstatus: a\n---\nMaren. Maren.\nTyped Maren.\n'), 'an editor of the note shows it replaced once: ' + JSON.stringify(e));
	const sc = await p.ev(`${M}.scenes.find(s => s.file.path === 'Multi/1 A.md')?.live?.cm?.state.doc.toString() ?? null`);
	t.ok(sc === null || sc.endsWith('Maren. Maren.\nTyped Maren.\n'), 'and so does the manuscript’s section: ' + JSON.stringify(sc));
	await undo(p);
	await flushTabs(p);
	const back = disk(p, 'Multi/1 A.md');
	t.eq(back, '---\nstatus: a\n---\nMara. Mara.\nTyped Mara.\n', 'Undo puts the words back (the typing was in the note when it was replaced)');
	t.eq(disk(p, 'Multi/2 B.md'), before['Multi/2 B.md'], 'the other note is as it was');
});

test('typing in a manuscript section while the review is open: the typing is kept, whole, and nothing is replaced over it', async (p, h, t) => {
	await rawBinder(p, 'Type', [['1 A', 'Mara one.\nMara two.\n'], ['2 B', 'Mara in B.\n']]);
	await start(p, 'Type', 'manuscript');
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p, async () => { await types(p, 'Type/1 A.md', 'Typed while reviewing.\n'); await p.sleep(200); });
	await saveAll(p);
	await p.sleep(2300);
	const a = disk(p, 'Type/1 A.md');
	t.ok(a.includes('Typed while reviewing.\n'), 'the typing is on disk: ' + JSON.stringify(a));
	t.ok(a === 'Mara one.\nMara two.\nTyped while reviewing.\n' || a === 'Maren one.\nMaren two.\nTyped while reviewing.\n', 'and the note is whole, left or replaced, never half: ' + JSON.stringify(a));
	t.eq(disk(p, 'Type/2 B.md'), 'Maren in B.\n', 'the other note is replaced');
});

test('typing in a manuscript section at the moment Replace all runs (a burst of keystrokes while it takes its snapshot and writes): every typed character survives, in order, once', async (p, h, t) => {
	await rawBinder(p, 'Burst', [['1 A', 'Mara one.\nMara two.\n'], ['2 B', 'Mara in B.\n'], ['3 C', 'Mara in C.\n']]);
	await start(p, 'Burst', 'manuscript');
	await ask(p, 'Mara', 'Maren');
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(200);
	const typed = 'abcdefghijklmnopqrstuvwxyz0123456789';
	await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta').click(); const s = ${M}.scenes.find(s => s.file.path === 'Burst/1 A.md'); const cm = s.live.cm; let i = 0; const id = setInterval(() => { if (i >= ${typed.length}) return clearInterval(id); cm.dispatch({ changes: { from: cm.state.doc.length, insert: ${j(typed)}[i++] } }); }, 15); return 1; })()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(1500);
	await saveAll(p);
	await p.sleep(2300);
	const a = disk(p, 'Burst/1 A.md');
	const m = /^(Mara|Maren) one\.\n(Mara|Maren) two\.\n(.*)$/s.exec(a);
	t.ok(!!m, 'the note is still its two lines and what followed: ' + JSON.stringify(a));
	t.eq(m?.[3], typed, 'every typed character is there, in order, once');
	t.eq(disk(p, 'Burst/2 B.md'), 'Maren in B.\n', 'the second note is replaced');
	t.eq(disk(p, 'Burst/3 C.md'), 'Maren in C.\n', 'the third too');
	const ed = await p.ev(`${M}.scenes.find(s => s.file.path === 'Burst/1 A.md').live.cm.state.doc.toString()`);
	t.eq(ed, a, 'the section shows what the disk holds');
});

// =====================================================================================================================
// Files changed from outside
// =====================================================================================================================

test('a note changed on disk after the first note was written and before the second (the replace itself): the second is left exactly as written from outside, the third is replaced', async (p, h, t) => {
	await rawBinder(p, 'Mid', [['1 A', 'Mara A.\n'], ['2 B', 'Mara B.\n'], ['3 C', 'Mara C.\n']]);
	await start(p, 'Mid', 'outliner');
	await ask(p, 'Mara', 'Maren');
	const ext = 'Written by a sync, Mara and more Mara.\n';
	await p.ev(`(() => { const v = app.vault, orig = v.process.bind(v); let n = 0; window.__restore = () => { v.process = orig; }; v.process = async (f, fn, o) => { const r = await orig(f, fn, o); if (f.path.startsWith('Mid/') && ++n === 1) await v.adapter.write('Mid/2 B.md', ${j(ext)}); return r; }; return 1; })()`);
	await replaceAll(p);
	await p.ev(`(() => { window.__restore(); return 1; })()`);
	await saveAll(p);
	t.eq(disk(p, 'Mid/1 A.md'), 'Maren A.\n', 'the first is replaced');
	t.eq(disk(p, 'Mid/2 B.md'), ext, 'the second is what the sync wrote, byte for byte');
	t.eq(disk(p, 'Mid/3 C.md'), 'Maren C.\n', 'the third is replaced');
	t.ok(/1 note was changed meanwhile/.test(await doneText(p) ?? ''), 'the bar counts it: ' + await doneText(p));
});

test('a sync that rewrites a note with other line breaks, or without its byte-order mark, while the review is open: the replace is made in what is there now, nothing else changes', async (p, h, t) => {
	await rawBinder(p, 'Sync', [['1 Crlf', '---\r\nstatus: a\r\n---\r\nMara and\r\nMara.\r\n'], ['2 Bom', '﻿---\nstatus: a\n---\nMara marked.\n'], ['3 Same', 'Mara same.\n']]);
	await start(p, 'Sync', 'outliner');
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p, async () => {
		await writeRaw(p, 'Sync/1 Crlf.md', '---\nstatus: a\n---\nMara and\nMara.\n'); // a tool made it LF
		await writeRaw(p, 'Sync/2 Bom.md', '---\nstatus: a\n---\nMara marked.\n'); // a tool dropped the mark
		await writeRaw(p, 'Sync/3 Same.md', 'Mara same.\n'); // a touch: same bytes, new mtime
		await p.sleep(400);
	});
	await saveAll(p);
	const a = disk(p, 'Sync/1 Crlf.md'), b = disk(p, 'Sync/2 Bom.md'), c = disk(p, 'Sync/3 Same.md');
	t.ok(a === '---\nstatus: a\n---\nMaren and\nMaren.\n' || a === '---\nstatus: a\n---\nMara and\nMara.\n', 'the LF version is whole: replaced or left: ' + JSON.stringify(a));
	t.ok(b === '---\nstatus: a\n---\nMaren marked.\n' || b === '---\nstatus: a\n---\nMara marked.\n', 'the version without the mark is whole: ' + JSON.stringify(b));
	t.eq(c, 'Maren same.\n', 'a note touched with the same bytes is replaced');
});

test('Undo after outside changes: a changed property, appended text, a deleted note and a renamed note; each is kept as it is, the renamed one is put back where it now is, a deleted one is not made again', async (p, h, t) => {
	await rawBinder(p, 'Out', [['1 A', '---\nstatus: a\n---\nMara A.\n'], ['2 B', 'Mara B.\n'], ['3 C', 'Mara C.\n'], ['4 D', 'Mara D.\n'], ['5 E', 'Mara E.\n']]);
	await start(p, 'Out', 'outliner');
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	await writeRaw(p, 'Out/1 A.md', '---\nstatus: a\ntags: synced\n---\nMaren A.\n');
	await writeRaw(p, 'Out/2 B.md', 'Maren B.\nAdded elsewhere.\n');
	await p.ev(`app.vault.delete(${file('Out/3 C.md')}).then(() => 1)`);
	await p.ev(`app.vault.rename(${file('Out/4 D.md')}, 'Out/4 Dee.md').then(() => 1)`);
	await p.sleep(700);
	await undo(p);
	await saveAll(p);
	t.eq(disk(p, 'Out/1 A.md'), '---\nstatus: a\ntags: synced\n---\nMaren A.\n', 'the note whose property was added from outside keeps both (the property, and the replace)');
	t.eq(disk(p, 'Out/2 B.md'), 'Maren B.\nAdded elsewhere.\n', 'the note appended to keeps the appended text');
	t.ok(!(await p.ev(`app.vault.adapter.exists('Out/3 C.md')`)), 'the deleted note is not made again');
	t.ok(!(await p.ev(`app.vault.adapter.exists('Out/4 D.md')`)), 'nothing at the renamed note’s old name');
	t.eq(disk(p, 'Out/4 Dee.md'), 'Mara D.\n', 'the renamed note is put back, under its new name');
	t.eq(disk(p, 'Out/5 E.md'), 'Mara E.\n', 'the untouched one is put back');
	const m = await doneText(p);
	t.ok(/Put back in 2 notes\./.test(m ?? ''), 'the bar counts what it put back: ' + m);
});

test('a note renamed, and another moved out of the binder, while the review is open: nothing is made again at the old paths; each note is whole', async (p, h, t) => {
	await rawBinder(p, 'Mv', [['1 A', 'Mara A.\n'], ['2 B', 'Mara B.\n'], ['3 C', 'Mara C.\n']]);
	await start(p, 'Mv', 'outliner');
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p, async () => {
		await p.ev(`(async () => { await app.vault.rename(${file('Mv/2 B.md')}, 'Mv/2 Bee.md'); await app.vault.rename(${file('Mv/3 C.md')}, 'Moved C.md'); })().then(() => 1)`);
		await p.sleep(600);
	});
	await saveAll(p);
	const now = vault(p);
	t.ok(!('Mv/2 B.md' in now) && !('Mv/3 C.md' in now), 'nothing is made again at the old names');
	t.eq(now['Mv/1 A.md'], 'Maren A.\n', 'the plain note is replaced');
	t.ok(now['Mv/2 Bee.md'] === 'Maren B.\n' || now['Mv/2 Bee.md'] === 'Mara B.\n', 'the renamed note is whole: ' + JSON.stringify(now['Mv/2 Bee.md']));
	t.ok(now['Moved C.md'] === 'Mara C.\n' || now['Moved C.md'] === 'Maren C.\n', 'the moved note is whole: ' + JSON.stringify(now['Moved C.md']));
	await p.ev(`app.vault.delete(${file('Moved C.md')}).then(() => 1)`).catch(() => {});
});

// =====================================================================================================================
// Failures, Undo twice, Replace all twice
// =====================================================================================================================

test('a write that fails for one note: that note is left as it is and counted, the others are replaced, and Undo gives every byte back; a write that fails in Undo leaves that note replaced, whole, and says so', async (p, h, t) => {
	await rawBinder(p, 'Fail', [['1 A', '---\nstatus: a\n---\nMara A.\n'], ['2 B', 'Mara B.\n'], ['3 C', 'Mara C.\r\n']]);
	await start(p, 'Fail', 'outliner');
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await p.ev(`(() => { const v = app.vault, orig = v.process.bind(v); window.__restore = () => { v.process = orig; }; v.process = async (f, fn, o) => { if (f.path === 'Fail/2 B.md') throw new Error('disk full'); return orig(f, fn, o); }; return 1; })()`);
	await replaceAll(p);
	await p.ev(`(() => { window.__restore(); return 1; })()`);
	await saveAll(p);
	same(t, before, vault(p), { 'Fail/1 A.md': '---\nstatus: a\n---\nMaren A.\n', 'Fail/3 C.md': 'Maren C.\r\n' });
	t.ok(/changed meanwhile/.test(await doneText(p) ?? ''), 'the bar counts the note it could not write: ' + await doneText(p));
	await undo(p);
	await saveAll(p);
	same(t, before, vault(p));
	// failure inside Undo
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	const replaced = vault(p);
	await p.ev(`(() => { const v = app.vault, orig = v.process.bind(v); window.__restore = () => { v.process = orig; }; v.process = async (f, fn, o) => { if (f.path === 'Fail/3 C.md') throw new Error('disk full'); return orig(f, fn, o); }; return 1; })()`);
	await undo(p);
	await p.ev(`(() => { window.__restore(); return 1; })()`);
	await saveAll(p);
	same(t, before, vault(p), { 'Fail/3 C.md': replaced['Fail/3 C.md'] });
	t.ok(/Put back in 2 notes\. 1 note was changed since/.test(await doneText(p) ?? ''), 'and the bar says what was not put back: ' + await doneText(p));
});

test('Undo twice, and Undo clicked twice at once: the second does nothing, no byte changes, no error', async (p, h, t) => {
	await rawBinder(p, 'Twice', [['1 A', 'Mara A.\n'], ['2 B', '---\nstatus: b\n---\nMara B. Mara.\r\n']]);
	await start(p, 'Twice', 'outliner');
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	const replaced = vault(p);
	p.errors.length = 0;
	await p.ev(`(async () => { const b = ${BAR}; await Promise.all([b.undo(), b.undo()]); })().then(() => 1)`);
	await p.sleep(900);
	await saveAll(p);
	same(t, before, vault(p));
	await p.ev(`(async () => { await ${BAR}.undo(); })().then(() => 1)`);
	await p.sleep(700);
	await saveAll(p);
	same(t, before, vault(p));
	t.eq(p.errors.filter((e) => !/Electron Security/.test(e)).length, 0, 'no error was logged: ' + p.errors.join(' | '));
	void replaced;
});

test('Replace all twice, then Undo: only the second is taken back, exactly, and the first replace is still in the notes; the snapshots of both exist', async (p, h, t) => {
	await rawBinder(p, 'Two', [['1 A', 'Mara A.\n'], ['2 B', '---\nstatus: b\n---\nMara B. Maren.\n']]);
	await start(p, 'Two', 'outliner');
	const original = vault(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	const first = vault(p);
	await ask(p, 'Maren', 'Marenn');
	await replaceAll(p);
	await saveAll(p);
	same(t, first, vault(p), { 'Two/1 A.md': 'Marenn A.\n', 'Two/2 B.md': '---\nstatus: b\n---\nMarenn B. Marenn.\n' });
	await undo(p);
	await saveAll(p);
	same(t, first, vault(p));
	t.eq((await snapshots(p, 'Two')).filter((s) => s.auto).length, 2, 'two automatic snapshots');
	void original;
});

test('NIT: Replace all started twice before the first review is answered: the second run must not wipe the first one’s Undo', async (p, h, t) => {
	await rawBinder(p, 'Dbl', [['1 A', 'Mara A.\n'], ['2 B', 'Mara B.\n']]);
	await start(p, 'Dbl', 'outliner');
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	// (the button twice, as a double click or a key repeat would, if the first review did not take the second away)
	await p.ev(`(() => { window.__a = ${BAR}.replaceAll(); window.__b = ${BAR}.replaceAll(); return 1; })()`);
	await p.sleep(500);
	const modals = await p.ev(`document.querySelectorAll('.modal.binders-find-review').length`);
	for (let i = 0; i < 3; i++) { await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta')?.click(); return 1; })()`); await p.sleep(400); }
	await p.ev(`Promise.all([window.__a, window.__b]).then(() => 1)`);
	await p.sleep(500);
	await saveAll(p);
	const mid = vault(p);
	t.eq(mid['Dbl/1 A.md'], 'Maren A.\n', 'replaced once (' + modals + ' reviews were open)');
	const m = await doneText(p);
	t.ok(!/Replaced 0 in 0 notes/.test(m ?? ''), 'the bar does not say it replaced nothing, with an Undo that does nothing: ' + m);
	if (await p.ev(`!!document.querySelector(${j(BARSEL + ' .binders-find-undo')})`)) { await undo(p); await saveAll(p); same(t, before, vault(p)); } else t.ok(false, 'Undo is still there to take the replace back');
});

test('Replace all started twice with the keyboard (Ctrl+Alt+Enter, the second at once): either one review opens, or the first run keeps its Undo', async (p, h, t) => {
	await rawBinder(p, 'Dbl2', [['1 A', 'Mara A.\n'], ['2 B', 'Mara B.\n']]);
	await start(p, 'Dbl2', 'outliner');
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await p.ev(`(() => { ${BAR}.input.focus(); return 1; })()`);
	await p.key('Enter', 'ctrl', 'alt');
	await p.key('Enter', 'ctrl', 'alt');
	await p.sleep(500);
	const modals = await p.ev(`document.querySelectorAll('.modal.binders-find-review').length`);
	t.eq(modals, 1, 'one review is open');
	for (let i = 0; i < 3; i++) { await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta')?.click(); return 1; })()`); await p.sleep(500); }
	await saveAll(p);
	t.eq(disk(p, 'Dbl2/1 A.md'), 'Maren A.\n', 'replaced');
	t.ok(/^Replaced 2 in 2 notes/.test(await doneText(p) ?? ''), 'the bar says so: ' + await doneText(p));
	await undo(p);
	await saveAll(p);
	same(t, before, vault(p));
});

// =====================================================================================================================
// Replace one
// =====================================================================================================================

test('Replace one when the note is changed from outside just before: offsets are never used on text they were not found in (delays from none to a second)', async (p, h, t) => {
	await rawBinder(p, 'One', [['1 A', 'Mara one.\nMara two.\n']]);
	await start(p, 'One', 'manuscript');
	await ask(p, 'Mara', 'Maren');
	for (const delay of [0, 60, 200, 700, 1500]) {
		const base = 'Mara one.\nMara two.\n', ext = `Added by a sync (${delay}).\n` + base;
		await writeRaw(p, 'One/1 A.md', base);
		await p.sleep(1600);
		await ask(p, 'Mara', 'Maren');
		await writeRaw(p, 'One/1 A.md', ext);
		await p.sleep(delay);
		await p.ev(`(async () => { await ${BAR}.replaceOne(); })().then(() => 1)`);
		await p.sleep(1800);
		await saveAll(p);
		await p.sleep(2300);
		const d = disk(p, 'One/1 A.md');
		t.ok(d === ext || d === ext.replace('Mara one.', 'Maren one.'), `after ${delay} ms: the outside text, with at most the first Mara properly replaced: ${JSON.stringify(d)}`);
	}
});

test('Replace one on CRLF and byte-order-mark notes in the manuscript changes that one match and keeps the file’s line breaks and mark as an ordinary edit would', async (p, h, t) => {
	await rawBinder(p, 'One2', [['1 Crlf', 'Mara a.\r\nMara b.\r\n'], ['2 Bom', '﻿Mara c.\nMara d.\n'], ['3 Ctl', 'Control.\r\n'], ['4 CtlB', '﻿Control.\n']]);
	await start(p, 'One2', 'manuscript');
	await types(p, 'One2/3 Ctl.md', 'x');
	await types(p, 'One2/4 CtlB.md', 'y');
	await saveAll(p);
	await p.sleep(2300);
	const ctl = disk(p, 'One2/3 Ctl.md'), ctlB = disk(p, 'One2/4 CtlB.md');
	await ask(p, 'Mara', 'Maren');
	for (let i = 0; i < 2; i++) { await p.ev(`(async () => { await ${BAR}.replaceOne(); })().then(() => 1)`); await p.sleep(700); }
	await saveAll(p);
	await p.sleep(2300);
	const a = disk(p, 'One2/1 Crlf.md'), b = disk(p, 'One2/2 Bom.md');
	t.eq(a.replace(/\r\n/g, '\n'), 'Maren a.\nMaren b.\n', 'the CRLF note: both of its matches, one step each');
	t.eq(a.includes('\r\n'), ctl.includes('\r\n'), 'same line breaks as an ordinary edit leaves (' + JSON.stringify(ctl) + '): ' + JSON.stringify(a));
	t.ok(b.replace('﻿', '') === 'Maren c.\nMara d.\n', 'the second note’s first match: ' + JSON.stringify(b));
});

test('BUG: Replace one with a replacement of three dashes that closes a block at the start of a note must not turn the writer’s lines into properties (Replace all refuses exactly this)', async (p, h, t) => {
	await rawBinder(p, 'Dash', [['1 A', '---\nfoo: 1\nbar: 2\nMara\nthe rest\n']]);
	await start(p, 'Dash', 'manuscript');
	const before = vault(p);
	await ask(p, 'Mara', '---');
	await p.ev(`(async () => { await ${BAR}.replaceOne(); })().then(() => 1)`);
	await p.sleep(900);
	await saveAll(p);
	await p.sleep(2300);
	const d = disk(p, 'Dash/1 A.md');
	t.ok(d === before['Dash/1 A.md'] || d !== '---\nfoo: 1\nbar: 2\n---\nthe rest\n', 'the lines “foo: 1” and “bar: 2” were text; Replace one has made them the note’s properties: ' + JSON.stringify(d));
});

// =====================================================================================================================
// Other edges
// =====================================================================================================================

test('Replace all with the replacement equal to the query, with overlapping and adjacent matches, and with a one-letter query: counts and bytes are right, Undo is exact', async (p, h, t) => {
	await rawBinder(p, 'Edge', [['1 A', 'aaaa aaa a\n'], ['2 B', 'Mara\nMara\n\nMaraMara\n'], ['3 C', 'no match\n']]);
	await start(p, 'Edge', 'outliner');
	const before = vault(p);
	await ask(p, 'aa', 'a');
	await replaceAll(p);
	await saveAll(p);
	same(t, before, vault(p), { 'Edge/1 A.md': 'aa aa a\n' });
	await undo(p);
	await saveAll(p);
	same(t, before, vault(p));
	await ask(p, 'Mara', 'Mara');
	await replaceAll(p);
	await saveAll(p);
	same(t, before, vault(p));
	await ask(p, 'a', '');
	await replaceAll(p);
	await saveAll(p);
	same(t, before, vault(p), { 'Edge/1 A.md': '  \n', 'Edge/2 B.md': 'Mr\nMr\n\nMrMr\n', 'Edge/3 C.md': 'no mtch\n' });
	await undo(p);
	await saveAll(p);
	same(t, before, vault(p));
});

test('a binder note and a folder note are never touched by a replace, even when the query is in them and the binder holds subfolders (whole vault byte for byte)', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Nest'); await app.vault.createFolder('Nest/Sub'); await app.vault.adapter.write('Nest/Sub/Sub.md', '---\\nsynopsis: Mara in a folder note\\n---\\nMara body of a folder note.\\n'); await app.vault.adapter.write('Nest/Sub/Deep.md', 'Mara deep.\\n'); await app.vault.adapter.write('Nest/Top.md', 'Mara top.\\n'); await app.vault.adapter.write('Nest/Nest.md', '---\\nbinder: 1\\nsynopsis: Mara binder\\ncontents:\\n  - Top\\n  - Sub/\\n  - Sub/Deep\\n---\\nMara in the binder note body.\\n'); })().then(() => 1)`);
	await p.sleep(1200);
	await start(p, 'Nest', 'outliner');
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	const plan = await planned(p);
	await replaceAll(p);
	await saveAll(p);
	const now = vault(p);
	t.eq(now['Nest/Nest.md'], before['Nest/Nest.md'], 'the binder note is untouched');
	t.ok(!plan.includes('Nest/Nest.md'), 'and not in the plan: ' + plan.join(', '));
	t.eq(now['Nest/Top.md'], 'Maren top.\n', 'a note is replaced');
	t.eq(now['Nest/Sub/Deep.md'], 'Maren deep.\n', 'a note in a subfolder too');
	t.eq(frontOf(now['Nest/Sub/Sub.md']), frontOf(before['Nest/Sub/Sub.md']), 'a folder note keeps its properties byte for byte');
	t.ok(/Nest\/Sub\/Sub\.md/.test(plan.join()) === (now['Nest/Sub/Sub.md'] !== before['Nest/Sub/Sub.md']), 'a folder note’s text is replaced only if it was in the plan the writer saw: ' + plan.join(', '));
});

test('a snapshot that cannot be taken stops Replace all: nothing is replaced, the bar says so, and the writer can try again', async (p, h, t) => {
	await rawBinder(p, 'NoSnap', [['1 A', 'Mara A.\n'], ['2 B', 'Mara B.\n']]);
	await start(p, 'NoSnap', 'outliner');
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await p.ev(`(() => { const v = app.vault, orig = v.create.bind(v); window.__restore = () => { v.create = orig; }; v.create = async (path, ...r) => { if (/Snapshots\\//.test(path)) throw new Error('no room'); return orig(path, ...r); }; return 1; })()`);
	await replaceAll(p);
	await p.ev(`(() => { window.__restore(); return 1; })()`);
	await saveAll(p);
	same(t, before, vault(p));
	const msg = await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-done')})?.textContent ?? null`);
	t.ok(!!msg && !/^Replaced/.test(msg), 'the bar does not say it replaced: ' + msg);
	await replaceAll(p);
	await saveAll(p);
	same(t, before, vault(p), { 'NoSnap/1 A.md': 'Maren A.\n', 'NoSnap/2 B.md': 'Maren B.\n' });
});
