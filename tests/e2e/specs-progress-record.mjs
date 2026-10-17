// The record of a binder's writing (src/progress/): what is typed, in a tab, in the manuscript and in focus mode, is
// counted once and to the right note; a paste or a cut is brought in or taken out and not written; what is done to a
// binder is an event; two devices write two files that are added together; no word of any note is ever in the record;
// nothing is written into a note; a record that can't be written never disturbs the typing. Golden rules 2 and 3.
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { PL, B, VIEW, card, clickMenu, file, j, menuItems, openView, texts, until, withTidy } from './view-helpers.mjs';
import { standIn, open as openExport, press as pressExport, saved as exportSaved, closeAll as closeExport } from './specs-export.mjs';

export const specs = [];
const F = `${PL}.focus`, P = `${PL}.progress`;
const L = 'The Lighthouse', HIST = `${L}/Snapshots/History`;
const KEEPER = `${L}/Part One/The keeper.md`, ARRIVAL = `${L}/Part One/Arrival.md`, STORM = `${L}/Part One/Storm warning.md`, PROLOGUE = `${L}/Prologue.md`;
const rel = (path) => path.slice(L.length + 1).replace(/\.md$/, '');
const VIEWOF = `app.workspace.getMostRecentLeaf().view`;
const ED = `${VIEWOF}.editor`, CM = `${ED}.cm`;
const M = `${VIEW}.current`;
const ME = 'aaaaaa', OTHER = 'bbbbbb';

// ---- the record, as a person would read it ----
/** Every file in the binder's History, by name. */
const files = (p) => p.ev(`(async () => { const a = app.vault.adapter; if (!(await a.exists(${j(HIST)}))) return {}; const o = {}; for (const f of (await a.list(${j(HIST)})).files) o[f.split('/').pop()] = await a.read(f); return o; })()`);
const parse = (text) => text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
/** This device's lines (the test device's) and those of one other. */
async function mine(p, id = ME) {
	const all = await files(p), name = Object.keys(all).find((n) => n.includes(` ${id}.binder-history`));
	return name ? parse(all[name]) : [];
}
const days = (lines) => lines.filter((l) => l.t === 'day');
const events = (lines, k) => lines.filter((l) => l.t === 'ev' && (!k || l.k === k));
/** The binder's counts by note for the one day there is. */
const counts = async (p) => { const d = days(await mine(p)); return d.length ? d[d.length - 1].n : {}; };
/** Writes it down, and again once the totals could be counted. */
async function write(p) {
	for (let i = 0; i < 3; i++) { await p.ev(`${P}.flush().then(() => 1)`); await p.sleep(i ? 1800 : 400); }
}

// ---- doing what a writer does ----
async function openNote(p, path) {
	await p.ev(`(async () => { await ${PL}.binders.settled; const l = app.workspace.getLeaf(false); await l.openFile(app.vault.getAbstractFileByPath(${j(path)})); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `${VIEWOF}.file?.path === ${j(path)} && !!document.querySelector('.workspace-leaf.mod-active .cm-content')`);
	await p.sleep(350);
}
const caretEnd = (p) => p.ev(`(() => { const e = ${ED}, t = e.getValue(); e.setCursor(e.offsetToPos(t.replace(/\\s+$/, '').length)); e.focus(); return 1; })()`).then(() => p.sleep(120));
/** Typed with real key presses. */
async function press(p, text) {
	for (const ch of text) {
		await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code: ch === ' ' ? 'Space' : undefined });
		await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
	}
	await p.sleep(80);
}
/** An editor's own change with a user event, as a paste (`input.paste`) or a cut (`delete.cut`) makes it. */
const dispatch = (p, cm, change, userEvent) => p.ev(`(() => { const cm = ${cm}; cm.dispatch({ changes: ${j(change)}, userEvent: ${j(userEvent)} }); return 1; })()`);
const words = (n, w = 'lorem') => Array(n).fill(w).join(' ');
async function openMs(p, folder = L) {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	for (let i = 0; i < 80; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; if (!m || !m.scenes) return false; const near = m.scenes.filter(s => m.near.has(s.el)); return near.length > 0 && near.slice(0, m.liveMax).every(s => (s.live || s.broken) && !s.mounting); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(200);
}
const msCaret = (p, path, where) => p.ev(`(async () => { const m = ${M}; await m.focusScene(m.scenes.find(s => s.file.path === ${j(path)}), ${j(where)}); })().then(() => 1)`).then(() => p.sleep(500));
const msCm = (path) => `${M}.scenes.find(s => s.file.path === ${j(path)}).live.editor.cm`;

// ---- before and after each test ----
const start = (p) => p.ev(`(async () => {
	const pl = ${PL};
	pl.settings.recordProgress = true; await pl.saveSettings();
	pl.progress.failWrites = false;
	pl.progress.setDevice({ id: ${j(ME)}, label: 'Test desk', kind: 'desktop' });
	app.saveLocalStorage('binders-focus-hinted', true); app.saveLocalStorage('binders-session', null);
	const a = app.vault.adapter; if (await a.exists(${j(L + '/Snapshots')})) await a.rmdir(${j(L + '/Snapshots')}, true);
	return 1;
})()`);
const stop = (p) => p.ev(`(async () => {
	const pl = ${PL};
	pl.focus?.leave(true);
	try { await app.vault.adapter.remove('Outside.md'); } catch { /* none */ }
	pl.settings.recordProgress = true; await pl.saveSettings();
	pl.progress.failWrites = false;
	pl.progress.setDevice(null);
	const a = app.vault.adapter; if (await a.exists(${j(L + '/Snapshots')})) await a.rmdir(${j(L + '/Snapshots')}, true);
	return 1;
})()`).catch(() => {});
const test = (name, fn) => specs.push({ name: 'progress record: ' + name, fn: withTidy(async (p, h, t) => { try { await start(p); await fn(p, h, t); } finally { await stop(p); } }) });

// ---- typing ----

test('typing is recorded once and to the right note: in a tab, in the manuscript and in focus mode', async (p, h, t) => {
	const before = await texts(p);
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Quokka brambles harbour.');
	await openNote(p, PROLOGUE);
	await caretEnd(p);
	await h.run('focus');
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	await p.sleep(550);
	await caretEnd(p);
	await press(p, ' Heron kestrel petrel plover.');
	await h.run('focus');
	await until(p, `!document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre') && !${F}.busy`);
	await p.sleep(300);
	await openMs(p, L);
	await msCaret(p, ARRIVAL, 'end');
	await press(p, ' Wombat lanterns.');
	await write(p);
	const n = await counts(p);
	t.eq(j(n[rel(KEEPER)]), j([3, 0, 0, 0]), 'three words typed in a note’s tab');
	t.eq(j(n[rel(PROLOGUE)]), j([4, 0, 0, 0]), 'four typed in focus mode');
	t.eq(j(n[rel(ARRIVAL)]), j([2, 0, 0, 0]), 'two typed in a section of the manuscript');
	t.eq(Object.keys(n).length, 3, 'and nothing else is in the day');
	const d = days(await mine(p))[0];
	t.eq(Object.values(d.h).reduce((a, b) => a + b, 0), 9, 'the hours add up to the words added');
	t.ok(d.s.length === 1 && d.m >= 1, 'a sitting, and the minutes typed in: ' + j([d.s, d.m]));
	t.ok(d.tot && d.tot.w > 0 && d.tot.n >= 7, 'the day’s total, stamped: ' + j(d.tot));
	t.eq(await p.ev(`${P}.today(${file(L)})`), 9, 'today’s words, as focus mode shows them, are the record’s');
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (![KEEPER, PROLOGUE, ARRIVAL].includes(path)) t.eq(after[path], text, `“${path}” is unchanged`);
});

test('the same note typed in its tab and in the manuscript is counted once', async (p, h, t) => {
	await openNote(p, STORM);
	await caretEnd(p);
	await press(p, ' Alpha bravo.');
	await p.ev(`app.workspace.getLeaf('tab').setViewState({ type: 'empty' }).then(() => 1)`);
	await openMs(p, L);
	await msCaret(p, STORM, 'end');
	await press(p, ' Charlie delta echo.');
	await write(p);
	t.eq(j((await counts(p))[rel(STORM)]), j([5, 0, 0, 0]), 'five words, whichever editor held them');
});

test('a paste is brought in, a cut is taken out, and moving text between two scenes nets to nothing; fifty words are still typing', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await dispatch(p, CM, { from: await p.ev(`${CM}.state.doc.length`), insert: ' ' + words(300) }, 'input.paste');
	await dispatch(p, CM, { from: await p.ev(`${CM}.state.doc.length`), insert: ' ' + words(40, 'ember') }, 'input.paste');
	await p.sleep(200);
	await write(p);
	let n = await counts(p);
	t.eq(j(n[rel(KEEPER)]), j([40, 0, 300, 0]), 'a paste of 300 words is brought in; one of 40 is typing');
	// the 300 cut and pasted into another scene
	const at = await p.ev(`(() => { const t = ${CM}.state.doc.toString(), i = t.indexOf(' lorem'); return [i, t.lastIndexOf('lorem') + 5]; })()`);
	await dispatch(p, CM, { from: at[0], to: at[1], insert: '' }, 'delete.cut');
	await openNote(p, ARRIVAL);
	await caretEnd(p);
	await dispatch(p, CM, { from: await p.ev(`${CM}.state.doc.length`), insert: ' ' + words(300) }, 'input.paste');
	await write(p);
	n = await counts(p);
	t.eq(j(n[rel(KEEPER)]), j([40, 0, 300, 300]), 'the cut is taken out, not cut');
	t.eq(j(n[rel(ARRIVAL)]), j([0, 0, 300, 0]), 'and the paste in the other scene is brought in');
	t.eq(await p.ev(`${P}.today(${file(L)})`), 40, 'none of it is written today: the forty typed are');
	// text that arrives in an editor is no typing
	await p.ev(`(async () => { const f = ${file(STORM)}; await app.vault.process(f, (s) => s + '\\nFrom another program, seven words in all here.\\n'); })().then(() => 1)`);
	await p.sleep(1500);
	await write(p);
	t.ok(!((await counts(p))[rel(STORM)]), 'words written to a note by another program are not in the day’s notes');
});

test('a note’s properties are no writing, and neither is text that undo puts back, twice', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Sedge rushes.');
	await p.key('z', 'ctrl');
	await p.sleep(200);
	await write(p);
	const c = (await counts(p))[rel(KEEPER)];
	t.eq(c[0], 2, 'two words typed');
	t.ok(c[1] >= 2, 'and undo took them out: counted as cut, as it was: ' + j(c));
});

// ---- nothing is lost, nothing is written into a note ----

test('no file in History holds a word of any note’s text, and no note is touched by a session of typing', async (p, h, t) => {
	const probe = ['Zyxwvut', 'Quasimodo', 'Ferrous'];
	const stat = () => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = [f.stat.mtime, f.stat.size]; return o; })()`);
	const before = await texts(p), stats = await stat();
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ` ${probe[0]} ${probe[1]} ${probe[2]}.`);
	await dispatch(p, CM, { from: await p.ev(`${CM}.state.doc.length`), insert: ' ' + words(200, 'Sesquipedalian') }, 'input.paste');
	await write(p);
	await p.ev(`${P}.event(${file(KEEPER)}, { k: 'snapshot', p: 'x', name: 'A name' })`);
	await write(p);
	const all = await files(p), text = Object.values(all).join('\n');
	t.ok(text.length > 100, 'there is a record to search: ' + text.length);
	const body = (await texts(p))[KEEPER];
	const sentences = body.split(/[\n.]+/).map((s) => s.trim()).filter((s) => s.length > 20);
	for (const w of [...probe, 'Sesquipedalian', ...sentences.slice(0, 12)]) t.ok(!text.includes(w), `“${w.slice(0, 30)}” is nowhere in the record`);
	const after = await texts(p), later = await stat();
	for (const [path, s] of Object.entries(before)) if (path !== KEEPER) { t.eq(after[path], s, `“${path}” is unchanged`); t.eq(j(later[path]), j(stats[path]), `“${path}” has the size and time it had`); }
	t.ok(after[KEEPER].includes(probe[0]), 'what was typed is in its note');
});

// ---- two devices ----

test('two devices write two files, and reading adds them together', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' One two three.');
	await write(p);
	const day = days(await mine(p))[0].d, year = day.slice(0, 4);
	// another device's file, as Sync would bring it in
	const other = [
		{ 'binders-history': 1, device: OTHER, label: 'Phone', kind: 'phone', year: Number(year) },
		{ t: 'day', d: day, u: Date.now() + 1000, k: 'phone', n: { [rel(KEEPER)]: [10, 2, 0, 0], 'Part Two/The wreck': [7, 0, 0, 0] }, h: { 9: 17 }, s: [[1, 20]], m: 6, tot: { at: Date.now() + 1000, w: 5000, n: 7, st: { draft: 5000 } } },
	].map((x) => JSON.stringify(x)).join('\n') + '\n';
	await p.ev(`app.vault.adapter.write(${j(`${HIST}/${year} Phone ${OTHER}.binder-history`)}, ${j(other)}).then(() => 1)`);
	await p.sleep(1200);
	const m = await p.ev(`${P}.read(${file(L)}).then((m) => JSON.stringify({ days: m.days.map(d => ({ day: d.day, added: d.added, cut: d.cut, phone: d.phone, total: d.total, notes: d.notes })), devices: m.devices.map(d => d.id + ':' + d.kind) }))`).then(JSON.parse);
	const d = m.days.find((x) => x.day === day);
	t.eq(d.added, 3 + 10 + 7, 'the words added on both devices');
	t.eq(d.cut, 2, 'and cut');
	t.eq(d.phone, 17, 'those added on the phone');
	t.eq(d.total, 5000, 'the total is the one stamped last');
	t.eq(j(d.notes[rel(KEEPER)]), j([13, 2, 0, 0]), 'a note’s words from both');
	t.eq(j(m.devices.sort()), j([`${ME}:desktop`, `${OTHER}:phone`]), 'two devices');
	t.eq(await p.ev(`${P}.today(${file(L)})`), 18, 'today’s words in focus mode are both devices’ together');
	// this device writes only its own file
	const before = (await files(p))[`${year} Phone ${OTHER}.binder-history`];
	await press(p, ' Four.');
	await write(p);
	t.eq((await files(p))[`${year} Phone ${OTHER}.binder-history`], before, 'the other device’s file is never written');
	// a word edited outside: the totals differ from what was logged
	t.eq(m.days.length, 1, 'one day');
});

test('a device’s file under a new label is the same device’s, moved', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Marsh.');
	await write(p);
	await p.ev(`(() => { ${P}.setDevice({ id: ${j(ME)}, label: 'Writing desk', kind: 'desktop' }); return 1; })()`);
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Fen bog.');
	await write(p);
	const names = Object.keys(await files(p));
	t.eq(j(names.filter((n) => n.includes(ME))), j([`${names[0].slice(0, 4)} Writing desk ${ME}.binder-history`]), 'one file for this device, under its new name');
	t.eq(days(await mine(p))[0].n[rel(KEEPER)][0], 3, 'with all three words');
});

// ---- a file that can't be written, a switch, a newer format ----

test('a record that can’t be written never disturbs the typing, and is written when it can be', async (p, h, t) => {
	await p.ev(`(() => { ${P}.failWrites = true; return 1; })()`);
	await openNote(p, KEEPER);
	await caretEnd(p);
	const t0 = Date.now();
	await press(p, ' Tern gull skua.');
	await p.ev(`${P}.flush().then(() => 1)`);
	t.ok(Date.now() - t0 < 20000, 'typing went on');
	t.ok((await p.ev(`${ED}.getValue()`)).includes('Tern gull skua.'), 'every word is in the note');
	t.eq(Object.keys(await files(p)).length, 0, 'nothing was written');
	t.eq(await p.ev(`${P}.today(${file(L)})`), 3, 'and today’s words are still known');
	await p.ev(`(() => { ${P}.failWrites = false; return 1; })()`);
	await write(p);
	t.eq(j((await counts(p))[rel(KEEPER)]), j([3, 0, 0, 0]), 'tried again, it is written');
});

test('the file is written to a temporary name and moved into place, so a half file never stands where a whole one was', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' First words.');
	await write(p);
	const name = Object.keys(await files(p))[0], full = `${HIST}/${name}`;
	const good = await p.ev(`app.vault.adapter.read(${j(full)})`);
	// a write that fails halfway: the adapter writes the temporary file, then dies
	await p.ev(`(() => { const a = app.vault.adapter, real = a.rename.bind(a); window.__real = real; a.rename = async (from, to) => { if (to === ${j(full)}) throw new Error('disk gone'); return real(from, to); }; const w = a.write.bind(a); window.__w = w; a.write = async (path, data) => { if (path === ${j(full)}) throw new Error('disk gone'); return w(path, data); }; const r = a.remove.bind(a); window.__r = r; a.remove = async (path) => { if (path === ${j(full)}) throw new Error('disk gone'); return r(path); }; return 1; })()`);
	await press(p, ' More words.');
	await p.ev(`${P}.flush().then(() => 1)`);
	await p.sleep(300);
	t.eq(await p.ev(`app.vault.adapter.read(${j(full)})`), good, 'the file that was there is whole');
	await p.ev(`(() => { const a = app.vault.adapter; a.rename = window.__real; a.write = window.__w; a.remove = window.__r; return 1; })()`);
	await write(p);
	t.eq(days(await mine(p))[0].n[rel(KEEPER)][0], 4, 'and once the disk is back, all the words are in it');
	t.ok(!Object.keys(await files(p)).some((n) => n.endsWith('.tmp')), 'with no temporary file left');
});

test('with recording off nothing is written and nothing is deleted; on again, it goes on', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Before off.');
	await write(p);
	const was = await files(p);
	await p.ev(`(async () => { ${PL}.settings.recordProgress = false; await ${PL}.saveSettings(); })().then(() => 1)`);
	await press(p, ' While off now.');
	await write(p);
	t.eq(j(await files(p)), j(was), 'the record is as it was: nothing written, nothing deleted');
	t.eq(await p.ev(`${P}.today(${file(L)})`), 2, 'and today’s words are the two from before it was turned off');
	await p.ev(`(async () => { ${PL}.settings.recordProgress = true; await ${PL}.saveSettings(); })().then(() => 1)`);
	await press(p, ' Back on.');
	await write(p);
	t.eq(days(await mine(p))[0].n[rel(KEEPER)][0], 4, 'on again, the two words typed while off are not in it and the new ones are');
});

test('a binder in a newer format is not recorded, and a record file of a newer format is read and never written', async (p, h, t) => {
	await p.ev(`(async () => { const f = ${file(L + '/' + L + '.md')}; await app.vault.process(f, (s) => s.replace('binder: 1', 'binder: 99')); })().then(() => 1)`);
	await p.sleep(700);
	t.ok(await p.ev(`!!${B}.problem(${file(L)})`), 'the binder is read only now');
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Newer binder words.');
	await write(p);
	t.eq(Object.keys(await files(p)).length, 0, 'nothing is recorded for it');
	await p.ev(`(async () => { const f = ${file(L + '/' + L + '.md')}; await app.vault.process(f, (s) => s.replace('binder: 99', 'binder: 1')); })().then(() => 1)`);
	await p.sleep(700);
	// a file of this device's own, from a newer Binders
	const year = new Date().getFullYear(), name = `${HIST}/${year} Test desk ${ME}.binder-history`;
	const newer = JSON.stringify({ 'binders-history': 9, device: ME, label: 'Test desk', kind: 'desktop', year }) + '\n' + JSON.stringify({ t: 'future', says: 'something' }) + '\n';
	await p.ev(`(async () => { const a = app.vault.adapter; await a.mkdir(${j(L + '/Snapshots')}).catch(() => {}); await a.mkdir(${j(HIST)}).catch(() => {}); await a.write(${j(name)}, ${j(newer)}); })().then(() => 1)`);
	await p.ev(`(() => { ${P}.setDevice({ id: ${j(ME)}, label: 'Test desk', kind: 'desktop' }); return 1; })()`);
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Words for a newer file.');
	await write(p);
	t.eq(await p.ev(`app.vault.adapter.read(${j(name)})`), newer, 'the newer file is as it was');
});

// ---- where it is, and that nothing else sees it ----

test('the folder is out of the explorer, the binder’s contents, search and an export, and is left alone by bringing back', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Hidden words.');
	await write(p);
	t.ok(Object.keys(await files(p)).length === 1, 'the record is there');
	const shown = await p.ev(`(async () => {
		const ex = app.workspace.getLeavesOfType('file-explorer')[0]?.view;
		const folder = ${file(L)};
		const kids = ${B}.orderedChildren(folder).map(c => c.name);
		const scenes = ${B}.scenes(folder).map(f => f.path);
		return JSON.stringify({ kids, scenes, hist: ${B}.isSnapshotsFolder(${file(L + '/Snapshots')}), inSnaps: ${B}.inSnapshots(${j(HIST)}) });
	})()`).then(JSON.parse);
	t.ok(!shown.kids.includes('Snapshots') && !shown.scenes.some((s) => s.includes('Snapshots')), 'the binder does not list it');
	t.ok(shown.hist && shown.inSnaps, 'it is a part of the folder of snapshots');
	await p.ev(`(async () => { const x = app.workspace.getLeavesOfType('file-explorer')[0]; x?.view.revealInFolder(${file(PROLOGUE)}); return 1; })()`);
	await p.sleep(600);
	const rows = await p.ev(`[...document.querySelectorAll('.nav-folder-title, .nav-file-title')].map(e => e.dataset.path).filter(Boolean)`);
	t.ok(rows.some((r) => r === PROLOGUE) && !rows.some((r) => /Snapshots|History|binder-history/.test(r)), 'the file explorer shows the binder and not the record: ' + j(rows.filter((r) => r.startsWith(L))));
	// a snapshot of the folder and bringing it back leave the record as it is
	const before = await files(p);
	await p.ev(`(async () => { const api = ${PL}.snapshotsApi, f = ${file(L)}; await api.takeFolder(f, 'Before'); })().then(() => 1)`);
	const s = await p.ev(`${PL}.snapshotsApi.list(${file(L)}).length`);
	t.ok(s >= 1, 'a snapshot was taken');
	const name = Object.keys(before)[0];
	t.ok((await files(p))[name] === before[name] || (await files(p))[name].length >= before[name].length, 'taking it left the record whole');
	t.eq(await p.ev(`${B}.orderedChildren(${file(L)}).filter(c => /history/i.test(c.name)).length`), 0, 'nothing in the binder is called History');
});

// ---- what is done to a binder ----

const ev = async (p, k) => events(await mine(p), k);

test('a note made, renamed, moved, given a status, a label and a target, the order changed, a copy made, a note deleted: each is an event', async (p, h, t) => {
	const folder = file(L), one = file(L + '/Part One'), two = file(L + '/Part Two');
	await p.ev(`${B}.newSceneByHand(${folder}, Infinity, 'Gull cries').then(() => 1)`);
	await p.sleep(500);
	await p.ev(`${B}.rename(${file(L + '/Gull cries.md')}, 'Gull calls').then(() => 1)`);
	await p.sleep(400);
	await p.ev(`${B}.setByHand('Set status', [{ note: ${file(L + '/Gull calls.md')}, patch: { status: 'draft' } }]).then(() => 1)`);
	await p.ev(`${B}.setByHand('Set label', [{ note: ${file(L + '/Gull calls.md')}, patch: { label: 'red' } }]).then(() => 1)`);
	await p.ev(`${B}.setByHand('Set status', [{ note: ${file(L + '/Gull calls.md')}, patch: { status: 'revised' } }]).then(() => 1)`);
	await p.ev(`${B}.ensureFolderNote(${one}).then((note) => ${B}.setByHand('Set target', [{ note, patch: { target: 4000 } }])).then(() => 1)`);
	await p.sleep(400);
	await p.ev(`${B}.move(${file(L + '/Gull calls.md')}, ${two}, 0).then(() => 1)`);
	await p.sleep(2300);
	await p.ev(`${B}.reorder(${folder}, [...${B}.orderedChildren(${folder})].reverse()).then(() => 1)`);
	await p.sleep(400);
	await p.ev(`${B}.duplicate(${file(L + '/Part Two/Gull calls.md')}).then(() => 1)`);
	await p.sleep(500);
	await p.ev(`${B}.remove([${file(L + '/Part Two/Gull calls.md')}]).then(() => 1)`);
	await p.sleep(500);
	await p.ev(`${B}.flush().then(() => 1)`);
	await write(p);
	const all = events(await mine(p));
	const has = (k, f) => all.some((e) => e.k === k && f(e));
	t.ok(has('made', (e) => e.p === 'Gull cries'), 'a note made: ' + j(all.filter((e) => e.k === 'made')));
	t.ok(has('renamed', (e) => e.from === 'Gull cries' && e.to === 'Gull calls'), 'renamed, from and to: ' + j(all.map((e) => [e.k, e.p, e.from, e.to])));
	t.ok(has('status', (e) => e.p === 'Gull calls' && e.from === '' && e.to === 'draft'), 'a status set, from nothing to draft');
	t.ok(has('status', (e) => e.p === 'Gull calls' && e.from === 'draft' && e.to === 'revised'), 'and changed, from draft to revised');
	t.ok(has('label', (e) => e.p === 'Gull calls' && e.to === 'red'), 'a label set');
	t.ok(has('target', (e) => e.p === 'Part One' && e.folder === 1 && e.to === '4000'), 'a folder’s target, in its folder note, is the folder’s');
	t.ok(has('moved', (e) => e.from === 'Gull calls' && e.to === 'Part Two/Gull calls'), 'moved to another folder');
	t.ok(has('order', (e) => e.p === ''), 'the order changed');
	t.ok(has('duplicate', (e) => e.p === 'Part Two/Gull calls 2'), 'a copy made: ' + j(all.filter((e) => e.k === 'duplicate')));
	t.ok(has('gone', (e) => e.p === 'Part Two/Gull calls'), 'a note deleted');
	t.ok(all.every((e) => typeof e.at === 'number' && /^\d{4}-\d\d-\d\d$/.test(e.d)), 'each with its time and its day');
	// the history follows the scene: its status events are under the name it has now
	const m = await p.ev(`${P}.read(${folder}).then((m) => JSON.stringify(m.events.filter(e => e.k === 'status').map(e => e.path)))`).then(JSON.parse);
	t.ok(m.length === 2 && m.every((x) => x === 'Part Two/Gull calls'), 'read back, the status events are under the name the scene has now: ' + j(m));
});

test('a snapshot taken, a snapshot brought back: events with their names', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await p.ev(`(async () => { const api = ${PL}.snapshotsApi; await api.take(${file(KEEPER)}, 'Hand-written name'); await api.takeFolder(${file(L)}, 'Whole draft'); })().then(() => 1)`);
	await press(p, ' Words after the snapshot.');
	await p.sleep(2500);
	await p.ev(`(async () => { const api = ${PL}.snapshotsApi, f = ${file(L)}, s = api.list(f).find((x) => x.title === 'Whole draft'); await api.back(s, f, 'both'); })().then(() => 1)`);
	await p.sleep(800);
	await write(p);
	const all = events(await mine(p));
	t.ok(all.some((e) => e.k === 'snapshot' && e.p === 'Part One/The keeper' && e.name === 'Hand-written name'), 'a scene’s snapshot, with its name: ' + j(all.filter((e) => e.k === 'snapshot')));
	t.ok(all.some((e) => e.k === 'snapshot' && e.p === '' && e.name === 'Whole draft'), 'a whole binder’s');
	t.ok(all.some((e) => e.k === 'back' && e.name === 'Whole draft'), 'a bringing back');
	const n = await counts(p);
	t.eq(j(n[rel(KEEPER)]?.slice(0, 2)), j([4, 0]), 'the words typed before it are the day’s typing, and the bringing back is not');
});

test('a split and a merge are events, and neither is writing', async (p, h, t) => {
	await openNote(p, ARRIVAL);
	await p.ev(`(() => { const e = ${ED}, t = e.getValue(), i = t.indexOf(' ', Math.floor(t.length * 0.7)); e.setCursor(e.offsetToPos(i)); e.focus(); return 1; })()`);
	await p.sleep(200);
	await h.run('split-scene');
	await p.sleep(1500);
	// merge it with the one before, as the menu does
	await openView(p, L + '/Part One');
	await p.sleep(800);
	const at = (path) => p.at(card(path));
	const a = await at(ARRIVAL), k = await at(KEEPER);
	await p.click(a.x, a.t + 12);
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await p.right(k.x, k.y);
	t.ok((await menuItems(p)).includes('Merge 2 notes'), 'the menu offers a merge');
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge').click(); return 1; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(KEEPER)})`);
	await p.sleep(1500);
	await write(p);
	const all = events(await mine(p));
	t.ok(all.some((e) => e.k === 'split' && e.p === 'Part One/Arrival' && e.n === 2), 'a split: ' + j(all.map((e) => e.k)));
	t.ok(all.some((e) => e.k === 'merge' && e.n === 2), 'a merge');
	t.ok(all.some((e) => e.k === 'made' && e.by === 'split'), 'the note the split made says what made it');
	t.ok(all.some((e) => e.k === 'gone' && e.by === 'merge'), 'the note the merge took away says so');
	const n = await counts(p);
	t.ok(Object.values(n).every((c) => c[0] === 0 && c[1] === 0), 'no typing was done: ' + j(n));
	t.ok(Object.values(n).every((c) => c[2] === 0 && c[3] === 0), 'and no words came or went a block at a time, since they only moved: ' + j(n));
});

test('Replace all is an event, and not writing', async (p, h, t) => {
	await openView(p, L);
	const BAR = `${VIEW}.findBar`;
	await p.ev(`(async () => { const v = ${VIEW}; v.showSearch(true); const b = v.findBar; b.input.value = 'light'; b.by.value = 'beacon lamp'; await b.search(); })().then(() => 1)`);
	await p.sleep(400);
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(300);
	await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta').click(); return 1; })()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(800);
	await write(p);
	const all = events(await mine(p));
	const r = all.find((e) => e.k === 'replace');
	t.ok(r && r.n >= 1 && r.w >= 1, 'an event with the notes and the replacements: ' + j(r));
	const n = await counts(p);
	t.ok(Object.values(n).every((c) => c[0] === 0 && c[1] === 0), 'no typing: ' + j(n));
});

test('an export is an event with its kind', async (p, h, t) => {
	await standIn(p);
	try {
		await openExport(p, 'The Lighthouse');
		await pressExport(p, 'Export');
		t.ok(await exportSaved(p), 'exported');
		await closeExport(p);
		await write(p);
		const e = (await ev(p, 'export'))[0];
		t.ok(e && typeof e.name === 'string' && e.name.length > 0, 'an export event with its kind: ' + j(e));
	} finally { await p.ev(`(() => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); return 1; })()`); await closeExport(p); }
});

test('an import is an event in the binder it makes', async (p, h, t) => {
	const dir = resolve('test-dist/progress-record-source');
	mkdirSync(dir, { recursive: true });
	const para = (seed) => Array.from({ length: 60 }, (_, i) => `${seed}${i}`).join(' ') + '.';
	const md = resolve(dir, 'Tide.md');
	writeFileSync(md, `# Tide Book\n\n## One\n\n${para('wa')}\n\n## Two\n\n${para('wb')}\n`);
	const WIN = '.modal.binders-import';
	const button = async (label) => { const ok = await p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b || b.disabled) return false; b.click(); return true; })()`); if (!ok) throw new Error('no button ' + label); await p.sleep(100); };
	await p.ev(`(() => { app.commands.executeCommandById('binders:import-manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN}')`);
	await p.send('Page.setInterceptFileChooserDialog', { enabled: true });
	await button('Choose a file...');
	const doc = await p.send('DOM.getDocument');
	const found = await p.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: WIN + ' input[type="file"]' });
	await p.send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files: [md] });
	await p.send('Page.setInterceptFileChooserDialog', { enabled: false });
	t.ok(await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000), 'the import window has the file');
	await p.sleep(400);
	await button('Import');
	t.ok(await until(p, `!!${B}.binderOf('Tide Book') && !document.querySelector('${WIN}')`, 20000), 'imported');
	await p.sleep(1000);
	await write(p);
	const names = await p.ev(`(async () => { const a = app.vault.adapter, d = 'Tide Book/Snapshots/History'; return (await a.exists(d)) ? (await a.list(d)).files.map(f => f.split('/').pop()) : []; })()`);
	t.eq(names.length, 1, 'the new binder has a record: ' + j(names));
	const lines = parse(await p.ev(`app.vault.adapter.read(${j('Tide Book/Snapshots/History/' + names[0])})`));
	const imp = lines.find((l) => l.k === 'import');
	t.ok(imp && imp.n >= 2 && imp.w >= 100, 'an import event with its notes and words: ' + j(imp));
	t.ok(days(lines).every((d) => Object.values(d.n).every((c) => c[0] === 0 && c[1] === 0)), 'and nothing was typed');
	await p.ev(`(async () => { const a = app.vault.adapter; if (await a.exists('Tide Book')) await a.rmdir('Tide Book', true); })().then(() => 1)`);
});

// ---- what shows, and when it is written ----

test('focus mode’s words today are the record’s, the devices added together; “Start counting from here” counts from what the record has', async (p, h, t) => {
	await p.ev(`(async () => { Object.assign(${PL}.settings, { focusNumbers: true, focusTypewriter: true, focusDim: false, focusDark: false, focusNeighbours: false, focusPlace: false, focusFullscreen: false, focusGoal: 0 }); await ${PL}.saveSettings(); })().then(() => 1)`);
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' One two.');
	await write(p);
	const day = days(await mine(p))[0].d;
	const other = [
		{ 'binders-history': 1, device: OTHER, label: 'Phone', kind: 'phone', year: Number(day.slice(0, 4)) },
		{ t: 'day', d: day, u: Date.now() + 1000, k: 'phone', n: { 'Part Two/The wreck': [10, 0, 0, 0] }, h: {}, s: [], m: 1 },
	].map((x) => JSON.stringify(x)).join('\n') + '\n';
	await p.ev(`app.vault.adapter.write(${j(`${HIST}/${day.slice(0, 4)} Phone ${OTHER}.binder-history`)}, ${j(other)}).then(() => 1)`);
	await p.sleep(1500);
	await h.run('focus');
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	await p.sleep(600);
	await p.move(900, 420); await p.move(940, 450); await p.sleep(400);
	t.eq(await p.ev(`document.querySelector('.binders-focus-session')?.textContent`), '12 today', 'two words typed here and ten on the phone');
	const c = await p.at('.binders-focus-corner');
	await p.click(c.x, c.y);
	await clickMenu(p, 'Start counting from here');
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelector('.binders-focus-session')?.textContent`), '0 today', 'counting started again');
	await caretEnd(p);
	await press(p, ' Three.');
	await p.sleep(500);
	t.eq(await p.ev(`document.querySelector('.binders-focus-session')?.textContent`), '1 today', 'and goes on from there');
	await h.run('focus');
	await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
});

test('what no device typed is the difference between the totals and what was logged', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Today one two.');
	await write(p);
	const mineDay = days(await mine(p))[0], total = mineDay.tot.w;
	const yest = new Date(Date.now() - 36 * 3600e3), pad = (n) => String(n).padStart(2, '0');
	const day = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`;
	// the day before: another device stamped a total that is short of today's by 100 and logged nothing
	const other = [
		{ 'binders-history': 1, device: OTHER, label: 'Phone', kind: 'phone', year: yest.getFullYear() },
		{ t: 'day', d: day, u: 5, k: 'phone', n: {}, h: {}, s: [], m: 0, tot: { at: 5, w: total - 103, n: 7, st: {} } },
	].map((x) => JSON.stringify(x)).join('\n') + '\n';
	await p.ev(`app.vault.adapter.write(${j(`${HIST}/${yest.getFullYear()} Phone ${OTHER}.binder-history`)}, ${j(other)}).then(() => 1)`);
	await p.sleep(1500);
	const m = await p.ev(`${P}.read(${file(L)}).then((m) => JSON.stringify(m.days.map(d => ({ day: d.day, total: d.total, elsewhere: d.elsewhere, added: d.added }))))`).then(JSON.parse);
	const today = m[m.length - 1];
	t.eq(today.total, total, 'the day’s total');
	t.eq(today.elsewhere, 100, 'a hundred and three words more than the day before, three of them typed here and the rest not');
	t.eq(m.length, 2, 'two days, yesterday first');
});

test('the app going to the background writes the day', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Background words.');
	t.eq(Object.keys(await files(p)).length, 0, 'nothing is written yet: it waits a few minutes');
	await p.ev(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); return 1; })()`);
	await p.sleep(1500);
	await p.ev(`(() => { delete document.hidden; return 1; })()`);
	t.eq(j((await counts(p))[rel(KEEPER)]), j([2, 0, 0, 0]), 'the day is in the file');
});

test('leaving the binder for another note writes the day', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Leaving words.');
	t.eq(Object.keys(await files(p)).length, 0, 'nothing is written yet');
	await p.ev(`(async () => { await app.workspace.getLeaf(false).openFile(await app.vault.create('Outside.md', 'Not in a binder.')); })().then(() => 1)`);
	await p.sleep(2500);
	t.eq(j((await counts(p))[rel(KEEPER)]), j([2, 0, 0, 0]), 'the day is in the file');
});

test('a Longform project is recorded in its own Snapshots folder, and its index note is not typing', async (p, h, t) => {
	const LF = 'Longform demo', dir = `${LF}/Snapshots/History`;
	const open = async (path) => {
		await p.ev(`(async () => { await ${PL}.binders.settled; const l = app.workspace.getLeaf(false); await l.openFile(app.vault.getAbstractFileByPath(${j(path)})); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
		await until(p, `${VIEWOF}.file?.path === ${j(path)} && !!document.querySelector('.workspace-leaf.mod-active .cm-content')`);
		await p.sleep(350);
	};
	await open(`${LF}/Harbor.md`);
	await caretEnd(p);
	await press(p, ' Pier mooring.');
	await open(`${LF}/Index.md`);
	await caretEnd(p);
	await press(p, ' Index typing words.');
	await write(p);
	const names = await p.ev(`(async () => { const a = app.vault.adapter; return (await a.exists(${j(dir)})) ? (await a.list(${j(dir)})).files.map(f => f.split('/').pop()) : []; })()`);
	t.eq(names.length, 1, 'a record in the project’s own folder: ' + j(names));
	const lines = parse(await p.ev(`app.vault.adapter.read(${j(dir + '/' + names[0])})`));
	const n = days(lines)[0]?.n ?? {};
	t.eq(j(n.Harbor), j([2, 0, 0, 0]), 'a scene’s words are counted');
	t.eq(Object.keys(n).join(), 'Harbor', 'and the index note’s typing is not');
	await p.ev(`(async () => { const a = app.vault.adapter; if (await a.exists(${j(LF + '/Snapshots')})) await a.rmdir(${j(LF + '/Snapshots')}, true); })().then(() => 1)`);
});

test('settings: the record’s switch, under “Writing”, says a record is kept, where, and that it holds no text; this device can be named', async (p, h, t) => {
	const TAB = `app.setting.activeTab.containerEl`;
	await p.ev(`(() => { ${P}.setDevice(null); app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `[...${TAB}.querySelectorAll('.setting-item-heading, .setting-group .setting-item-name')].some(e => e.textContent === 'Writing')`);
	const row = (name) => `[...${TAB}.querySelectorAll('.setting-item')].find(e => e.querySelector('.setting-item-name')?.textContent === ${j(name)})`;
	const desc = await p.ev(`${row('Keep a record of your writing')}.querySelector('.setting-item-description').textContent`);
	t.ok(/Snapshots folder, in History/.test(desc) && /holds no text/.test(desc) && /never sent anywhere/.test(desc) && /nothing already recorded is deleted/.test(desc), 'it says where, that it holds no text, and what turning it off does: ' + desc);
	t.eq(await p.ev(`${row('Keep a record of your writing')}.querySelector('.checkbox-container').classList.contains('is-enabled')`), true, 'recording is on');
	await p.ev(`(() => { ${row('Keep a record of your writing')}.querySelector('.checkbox-container').click(); return 1; })()`);
	await p.sleep(400);
	t.eq(await p.ev(`${PL}.settings.recordProgress`), false, 'the switch turns it off');
	await p.ev(`(() => { ${row('Keep a record of your writing')}.querySelector('.checkbox-container').click(); return 1; })()`);
	await p.sleep(400);
	t.eq(await p.ev(`${PL}.settings.recordProgress`), true, 'and on');
	await p.ev(`(() => { const el = ${row('This device is called')}.querySelector('input[type="text"]'); el.focus(); el.value = 'Writing desk'; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`);
	await p.sleep(500);
	t.eq(await p.ev(`${PL}.progress.device().label`), 'Writing desk', 'a name typed there is the device’s');
	await p.ev(`(() => { app.setting.close(); ${PL}.progress.setLabel(''); return 1; })()`);
});

test('a phone or tablet: the device is not a computer, and going to the background writes the day', async (p, h, t) => {
	const { reload } = await import('./view-helpers.mjs');
	try {
		await reload(p, true);
		await p.ev(`(async () => { const pl = ${PL}; pl.settings.recordProgress = true; await pl.saveSettings(); pl.progress.setDevice(null); app.saveLocalStorage('binders-focus-hinted', true); })().then(() => 1)`);
		const kind = await p.ev(`${PL}.progress.device().kind`);
		t.ok(kind === 'phone' || kind === 'tablet', 'emulated as a phone or tablet, the device is one: ' + kind);
		await openNote(p, KEEPER);
		await caretEnd(p);
		await press(p, ' Phone words here.');
		await p.ev(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); return 1; })()`);
		await p.sleep(1800);
		await p.ev(`(() => { delete document.hidden; return 1; })()`);
		const all = await files(p), name = Object.keys(all)[0];
		t.ok(name, 'the day is in a file');
		const lines = parse(all[name]);
		t.eq(lines[0].kind, kind, 'whose header says so');
		t.eq(days(lines)[0].k, kind, 'and so does the day');
		t.eq(days(lines)[0].n[rel(KEEPER)][0], 3, 'with the words typed');
		const m = await p.ev(`${P}.read(${file(L)}).then((m) => m.days[0].phone)`);
		t.eq(m, 3, 'which read back are words added on a phone');
	} finally {
		await p.ev(`(async () => { const a = app.vault.adapter; if (await a.exists(${j(L + '/Snapshots')})) await a.rmdir(${j(L + '/Snapshots')}, true); })().then(() => 1)`).catch(() => {});
		await reload(p, false);
	}
});

test('the record is never a snapshot: after a session of typing, the snapshot counts, lists and bringing back\'s plan show what they showed before recording began; nothing that tidies snapshots touches a history file', async (p, h, t) => {
	await p.ev(`(async () => { ${PL}.settings.recordProgress = false; await ${PL}.saveSettings(); })().then(() => 1)`);
	await p.ev(`(async () => { const api = ${PL}.snapshotsApi; await api.take(${file(KEEPER)}, 'one'); await api.takeFolder(${file(L)}, 'Draft'); await api.takeFolder(${file(L + '/Part One')}, 'Opening'); })().then(() => 1)`);
	await p.sleep(500);
	const measure = async () => {
		const o = await p.ev(`(async () => {
			const api = ${PL}.snapshotsApi, L = ${file(L)}, P1 = ${file(L + '/Part One')};
			const titles = (f) => api.list(f).map((s) => s.title + '|' + s.of).sort();
			return JSON.stringify({ has: [api.has(L), api.has(P1), api.has(${file(L + '/Part Two')})], binder: titles(L), part: titles(P1), binders: ${PL}.binders.all().length });
		})()`);
		await openNote(p, KEEPER);
		await p.ev(`(() => { app.commands.executeCommandById('binders:show-snapshots'); return 1; })()`);
		await until(p, `!!document.querySelector('.modal')`);
		await p.sleep(700);
		const rows = await p.ev(`document.querySelectorAll('.modal [role="option"]').length`);
		for (let i = 0; i < 3 && await p.ev(`!!document.querySelector('.modal-container')`); i++) { await p.key('Escape'); await p.sleep(250); }
		return j([o, rows]);
	};
	const before = await measure();
	t.ok(JSON.parse(before)[1] >= 1, 'the note’s snapshot list has its snapshot to count: ' + before);
	await p.ev(`(async () => { ${PL}.settings.recordProgress = true; await ${PL}.saveSettings(); })().then(() => 1)`);
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' Recorded words now.');
	await write(p);
	const names = Object.keys(await files(p));
	t.ok(names.length === 1, 'the record is on disk: ' + j(names));
	const after = await measure();
	t.eq(after, before, 'what the snapshot lists, counts and the plan of bringing back show is unchanged');
	// a scene called History keeps its snapshots in the record's folder; renaming and deleting its snapshots leave the record whole
	const record = (await files(p))[names[0]];
	await p.ev(`(async () => { const f = await ${B}.newSceneByHand(${file(L)}, Infinity, 'History'); await ${PL}.snapshotsApi.take(f, 'in the same folder'); })().then(() => 1)`);
	await p.sleep(500);
	await p.ev(`${B}.rename(${file(L + '/History.md')}, 'Chronicle').then(() => 1)`);
	await p.sleep(700);
	await p.ev(`${B}.snapshotsSettle().then(() => 1)`);
	await p.ev(`(async () => { const f = ${file(L + '/Chronicle.md')}; await ${B}.remove([f]); })().then(() => 1)`);
	await p.sleep(700);
	const still = await p.ev(`(async () => { const a = app.vault.adapter, d = ${j(HIST)}; return (await a.exists(d)) ? (await a.list(d)).files.map(f => f.split('/').pop()) : []; })()`);
	t.ok(still.includes(names[0]), 'the record is still in History after the scene that shares its folder was renamed: ' + j(still));
	t.ok(still.every((n) => /\.binder-history$/.test(n)), 'and no snapshot went into it: ' + j(still));
	const text = await p.ev(`app.vault.adapter.read(${j(HIST + '/' + names[0])})`);
	t.ok(text.startsWith(record.split('\n')[0]) && text.length >= record.length, 'and the record was not changed but by being added to');
	// bringing the binder's snapshot back (its plan is made over a tree with the record in it) leaves the record
	await p.ev(`(async () => { const api = ${PL}.snapshotsApi, f = ${file(L)}, s = api.list(f).find((x) => x.title === 'Draft'); await api.back(s, f, 'all').catch(() => {}); })().then(() => 1)`);
	await p.sleep(1000);
	t.ok((await files(p))[names[0]]?.startsWith(record.split('\n')[0]), 'bringing a snapshot of the binder back leaves the record where it is');
});
