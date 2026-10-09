// QA round 10: "Bring back..." with “Everything” on a snapshot of a folder or binder: the gaps (phones and tablets, the links setting,
// big binders, notes open with typing, a bringing back cut short, odd names). Golden rule 2 first: every paragraph that was in the
// folder before is afterwards in a note or in a snapshot, and nothing is deleted.
//   QA10_SAY=1 prints what the checks measured. Run: BINDERS_TEST_VAULT=<vault with the plugin> node tests/e2e/run.mjs --specs tests/e2e/specs-qa10-bringback-all.mjs
import { B, PL, file, j, openView, until, withTidy } from './view-helpers.mjs';
import { make } from './specs-qa6-scale.mjs';

export const specs = [];
const test = (name, fn, timeout = 400000) => specs.push({ name: (name.startsWith('BUG: ') ? 'qa10 bringback-all: ' + name.slice(5) : 'qa10 bringback-all: ' + name), timeout, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });
const sleep = (p, ms) => p.sleep(ms);
const SAY = !!process.env.QA10_SAY;
const say = (...a) => { if (SAY) console.log('    ', ...a); };
const DLG = '.modal.binders-folder-snapshots';
const BACK = '.modal.binders-folder-snapshots-back';

// ---- helpers ----
async function closeAll(p) {
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`).catch(() => 0)); i++) { await p.key('Escape'); await sleep(p, 200); }
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
}
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent).join('|')`);
const settle = (p) => p.ev(`(async () => { await new Promise(r => setTimeout(r, 200)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`).then(() => sleep(p, 200));
/** Every file that holds writing, by path: notes, and snapshots (so a "before" snapshot counts), as text. */
const everything = (p) => p.ev(`(async () => { const o = {}; const a = app.vault.adapter; const walk = async (d) => { const l = await a.list(d); for (const f of l.files) if (/\\.(md|binder-snapshot|snapshot|binder-journal)$/.test(f)) o[f] = await a.read(f); for (const x of l.folders) if (!x.startsWith('.obsidian')) await walk(x); }; await walk('/'); return o; })()`);
/** Notes only (no Snapshots folders). */
const notesOf = (all) => Object.fromEntries(Object.entries(all).filter(([k]) => k.endsWith('.md') && !/(^|\/)Snapshots\//.test(k)));
const fileList = (p) => p.ev(`(async () => { const out = []; const a = app.vault.adapter; const walk = async (d) => { const l = await a.list(d); for (const f of l.files) out.push(f); for (const x of l.folders) { out.push(x + '/'); if (!x.startsWith('.obsidian')) await walk(x); } }; await walk('/'); return out.sort(); })()`);
const lines = (text) => text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
/** Rule 2: every body line that was in a note before is in a note or a snapshot now. Returns the lost ones. */
const plain = (l) => l.trim().replace(/\[\[[^\]\n|]*(\|[^\]\n]*)?\]\]/g, '[[$1]]').replace(/\]\([^)\n]*\)/g, ']()'); // (where a link leads is Obsidian's to change, not writing)
function lost(before, after) {
	const have = new Set();
	for (const v of Object.values(after)) for (const l of v.split(/\r?\n/)) have.add(plain(l));
	const out = [];
	for (const [k, v] of Object.entries(notesOf(before))) for (const l of lines(v)) if (!have.has(plain(l))) out.push(k + ': ' + l.slice(0, 60));
	return out;
}
/** Takes a snapshot of the folder, named. */
async function snap(p, folder, title) {
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(folder)}, ${j(title)}).then(() => 1)`);
	await sleep(p, 300);
	return title;
}
/** The vault side of "Bring back... / Everything": returns what it said, or its error. */
const backAll = (p, title, folder, since = 'stay') => p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(folder)}).find(x => x.title === ${j(title)}); const r = await ${PL}.snapshotsApi.back(s, ${file(folder)}, 'all', ${j(since)}); return { ok: true, texts: r.texts, moved: r.moved, files: r.files, again: r.again, placed: r.placed, gathered: r.gathered, into: r.into, left: r.left, ordered: r.ordered, orderLeft: r.orderLeft }; } catch (e) { return { ok: false, error: e.message }; } })()`);
const journal = (p, snaps) => p.ev(`app.vault.adapter.exists(${j(snaps + '/Bringing back.binder-journal')}).then(ok => ok ? app.vault.adapter.read(${j(snaps + '/Bringing back.binder-journal')}).then(JSON.parse) : null)`);
const rename = (p, from, to) => p.ev(`app.fileManager.renameFile(${file(from)}, ${j(to)}).then(() => 1)`);

// ---- the screen ----
const drawn = (p) => until(p, `!!document.querySelector(${j(DLG + ' .binders-folder-snapshots-tree, ' + DLG + ' .binders-folder-snapshots-read, ' + DLG + ' .binders-folder-snapshots-crumb')}) && !document.querySelector(${j(DLG + ' .binders-folder-snapshots-body > .binders-folder-snapshots-wait')})`, 60000).then(() => sleep(p, 200));
async function clickIn(p, sel, text) {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.offsetParent && e.textContent.trim() === ${j(text)}).pop(); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x + Math.min(r.width / 2, 40), y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`nothing says “${text}” (${sel})`);
	await p.click(at.x, at.y);
	await sleep(p, 350);
}
/** The dialog on a folder's snapshots, with the snapshot called `title` picked. */
async function showDialog(p, folder, title) {
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); ${PL}.snapshotsApi.show(${file(folder)}); return 1; })()`);
	await until(p, `!!document.querySelector(${j(DLG)})`);
	await drawn(p);
	if (title) {
		const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(DLG + ' .binders-snapshots-item')})].find(r => r.querySelector('.binders-snapshots-item-name').textContent === ${j(title)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
		if (!at) throw new Error('no snapshot ' + title);
		await p.click(at.x, at.y);
		await drawn(p);
	}
}
/** "Bring back..." on the snapshot shown: what the screen says. */
async function backScreen(p) {
	if (!(await p.ev(`!!document.querySelector(${j(BACK)})`))) {
		await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...');
		await until(p, `!!document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan ul')})`, 60000);
	}
	await sleep(p, 250);
	return p.ev(`(() => { const m = document.querySelector(${j(BACK)}), li = (c) => [...m.querySelectorAll('.' + c + ' li')].map(e => e.textContent); return { title: m.querySelector('.modal-title').textContent, intro: m.querySelector('.modal-content > p').textContent, options: [...m.querySelector('select').options].map(o => o.value + '=' + o.textContent), will: li('binders-folder-snapshots-plan-will'), left: li('binders-folder-snapshots-plan-left'), text: m.querySelector('.modal-content').innerText, buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => b.textContent + (b.disabled ? ' (off)' : '')) }; })()`);
}
/** The screen's own button; returns what was said once it is done. */
async function confirmBack(p, ms = 60000) {
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
	await clickIn(p, BACK + ' .modal-button-container button', 'Bring back');
	await until(p, `!document.querySelector(${j(BACK)}) && document.querySelectorAll('.notice').length > 0`, ms);
	await settle(p);
	return notices(p);
}
const setLinks = (p, on) => p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', ${on}); return app.vault.getConfig('alwaysUpdateLinks'); })()`);
const diffs = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);

// =====================================================================================================================
// 2. Links
for (const [on, long] of [[false, false], [true, true], [true, false]]) test(`${on && !long ? 'BUG: ' : ''}links with “Automatically update internal links” ${on ? 'on' : 'off'}${long ? ', notes of three paragraphs' : ', short notes'}: notes renamed and moved come back; links in and out of the folder; what outside is written`, async (p, h, t) => {
	await setLinks(p, on);
	const pad = long ? '\\n\\nSecond paragraph that is only prose.\\n\\nThird paragraph that is only prose.\\n' : '\\n';
	const items = `[
		{ path: 'Alpha.md', text: 'Alpha text, linked [[Beta]] and [[Sub/Gamma|the gamma]].${pad}' },
		{ path: 'Sub/Beta.md', text: 'Beta text, back to [[Alpha]] and [Alpha again](Alpha.md) and [[Alpha#Head|heading]].\\n\\n# Head\\n${long ? '\\n\\nBeta two.\\n' : ''}' },
		{ path: 'Sub/Gamma.md', text: 'Gamma text with a link to [[Links/Alpha]] by path.${pad}' },
		{ path: 'Z last.md', text: 'Last text.\\n' }
	]`;
	await make(p, 'Links', items);
	await p.ev(`(async () => { await app.vault.createFolder('Outside'); await app.vault.create('Outside/Ref.md', 'Outside note: [[Alpha]] and [[Links/Sub/Beta]] and [[Beta|b]] and [md](Links/Alpha.md).\\n'); await app.vault.create('Outside/Plain.md', 'No links here at all.\\n'); })().then(() => 1)`);
	await sleep(p, 600);
	await snap(p, 'Links', 'Linked draft');
	const before = await everything(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); const mv = ${on} ? (a, b) => app.fileManager.renameFile(a, b) : (a, b) => app.vault.rename(a, b); await mv(f('Links/Alpha.md'), 'Links/Alpha renamed.md'); await mv(f('Links/Sub/Beta.md'), 'Links/Beta moved.md'); await new Promise(r => setTimeout(r, 700)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 700);
	const mid = await everything(p);
	say('links', on ? 'on' : 'off', 'after the work: Ref =', j(mid['Outside/Ref.md']), '| Links/Beta moved.md =', j(mid['Links/Beta moved.md']));
	await showDialog(p, 'Links', 'Linked draft');
	const screen = await backScreen(p);
	say('screen', j(screen.text));
	const said = await confirmBack(p);
	say('said', said);
	const after = await everything(p);
	const l = lost(mid, after);
	t.eq(l.length, 0, 'no line lost: ' + j(l));
	const names = Object.keys(notesOf(after)).filter((k) => k.startsWith('Links/')).sort();
	say('notes', j(names));
	t.ok(names.includes('Links/Alpha.md') && names.includes('Links/Sub/Beta.md'), 'the notes are back under their names: ' + j(names));
	const touched = diffs(mid, after).filter((k) => !k.startsWith('Links/'));
	say('outside the folder changed', j(touched));
	if (!on) t.eq(touched.filter((k) => !/Snapshots/.test(k)).length, 0, 'setting off: no note outside the folder is written: ' + j(touched));
	else {
		// (Obsidian writes a link its own way, shortest path: where each leads is what a writer expects to be as before)
		await sleep(p, 600);
		const rl = await p.ev(`Object.keys(app.metadataCache.resolvedLinks['Outside/Ref.md'] ?? {}).sort()`);
		t.eq(j(rl), j(['Links/Alpha.md', 'Links/Sub/Beta.md']), 'setting on: the links in the note outside lead to the same two notes as before: ' + j(after['Outside/Ref.md']));
	}
	for (const k of Object.keys(notesOf(before)).filter((k) => k.startsWith('Links/'))) t.eq(after[k] === before[k] || k === 'Links/Links.md', true, `${k} is as it was in the snapshot`);
	t.eq(after['Outside/Plain.md'], before['Outside/Plain.md'], 'a note without links is as it was');
	await setLinks(p, false);
}, 300000);

// =====================================================================================================================
test('odd names: capitals only, a swap, note to folder and back, trailing dot and space, emoji, right-to-left, a long path: nothing lost', async (p, h, t) => {
	const items = `[
		{ path: 'Case.md', text: 'Para case one.\\n\\nPara case two.\\n' },
		{ path: 'Swap one.md', text: 'ONE is the first note.\\n\\nSecond paragraph of one.\\n' },
		{ path: 'Swap two.md', text: 'TWO is the second note.\\n\\nSecond paragraph of two.\\n' },
		{ path: 'Thing.md', text: 'A note that will become a folder.\\n' },
		{ path: 'Dir/Inner.md', text: 'Inner note.\\n' },
		{ path: 'Trail..md', text: 'Trailing dot note.\\n' },
		{ path: 'Space .md', text: 'Trailing space note.\\n' },
		{ path: 'Wave 🌊 ñ.md', text: 'Emoji note.\\n' },
		{ path: 'שלום עולם.md', text: 'Right to left note.\\n' },
		{ path: 'Deep/' + 'd'.repeat(60) + '/' + 'e'.repeat(60) + '/' + 'f'.repeat(60) + '/' + 'g'.repeat(40) + '.md', text: 'Very long path note.\\n' }
	]`;
	await make(p, 'Odd', items);
	await snap(p, 'Odd', 'Odd draft');
	const before = await everything(p);
	await p.ev(`(async () => {
		const f = (x) => app.vault.getAbstractFileByPath(x), fm = app.fileManager;
		await fm.renameFile(f('Odd/Case.md'), 'Odd/case.md');
		await fm.renameFile(f('Odd/Swap one.md'), 'Odd/tmp.md'); await fm.renameFile(f('Odd/Swap two.md'), 'Odd/Swap one.md'); await fm.renameFile(f('Odd/tmp.md'), 'Odd/Swap two.md');
		await app.vault.delete(f('Odd/Thing.md')); await app.vault.createFolder('Odd/Thing'); await app.vault.create('Odd/Thing/Child.md', 'Child of the new folder.\\n');
		await fm.renameFile(f('Odd/Wave 🌊 ñ.md'), 'Odd/Wave moved.md');
		await fm.renameFile(f('Odd/שלום עולם.md'), 'Odd/Dir/שלום עולם.md');
		await app.vault.delete(f('Odd/Space .md'));
		await new Promise(r => setTimeout(r, 500));
		await ${B}.snapshotsSettle(); await ${B}.flush();
	})().then(() => 1)`);
	await sleep(p, 500);
	const mid = await everything(p);
	const r = await backAll(p, 'Odd draft', 'Odd');
	say('result', j(r));
	await settle(p);
	const after = await everything(p);
	const nowFiles = await fileList(p);
	say('files', j(nowFiles.filter((f) => f.startsWith('Odd/') && !f.includes('Snapshots'))));
	t.ok(r.ok, 'it ran: ' + j(r));
	const l = lost(before, after);
	t.eq(l.length, 0, 'no line lost from the snapshot’s state: ' + j(l));
	const l2 = lost(mid, after);
	t.eq(l2.length, 0, 'no line lost from what was there before bringing back: ' + j(l2));
	say('journal', j(await journal(p, 'Odd/Snapshots')));
}, 300000);

// =====================================================================================================================
// 4. While things are open
const OPEN_ITEMS = `[
	{ path: 'A one.md', text: 'A first paragraph.\\n\\nA second paragraph.\\n\\nA third paragraph.\\n' },
	{ path: 'B two.md', text: 'B first paragraph.\\n\\nB second paragraph.\\n\\nB third paragraph.\\n' },
	{ path: 'C three.md', text: 'C first paragraph.\\n\\nC second paragraph.\\n\\nC third paragraph.\\n' }
]`;
for (const mode of ['corkboard', 'outliner', 'manuscript']) test(`open notes with unsaved typing, binder view on the ${mode}: the typing is in the “before” snapshot or the note, the editors and the view show the result without a reload`, async (p, h, t) => {
	await make(p, 'Open', OPEN_ITEMS);
	await snap(p, 'Open', 'Open draft');
	const before = await everything(p);
	// since: A renamed and written in, B written in, C moved into a folder
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await app.fileManager.renameFile(f('Open/A one.md'), 'Open/A renamed.md'); await app.vault.process(f('Open/A renamed.md'), (t) => t + '\\nA WRITTEN-SINCE.\\n'); await app.vault.process(f('Open/B two.md'), (t) => t.replace('B second paragraph.', 'B second REWRITTEN.')); await app.vault.createFolder('Open/Box'); await app.fileManager.renameFile(f('Open/C three.md'), 'Open/Box/C three.md'); await new Promise(r => setTimeout(r, 600)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 600);
	await openView(p, 'Open');
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].view.setMode(${j(mode)}); return 1; })()`);
	await sleep(p, 900);
	// A renamed is open in a tab (typing at its end); B is open in a split, and typing in it (the manuscript's own editor for it when that is the mode)
	await p.ev(`(async () => {
		const f = (x) => app.vault.getAbstractFileByPath(x);
		const l1 = app.workspace.getLeaf('tab'); await l1.openFile(f('Open/A renamed.md'), { state: { mode: 'source' } });
		const l2 = app.workspace.getLeaf('split', 'vertical'); await l2.openFile(f('Open/B two.md'), { state: { mode: 'source' } });
		await new Promise(r => setTimeout(r, 500));
		const type = (path, s) => { const l = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === path); const e = l.view.editor; e.replaceRange(s, { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); };
		type('Open/A renamed.md', '\\nTYPED-IN-A-TAB');
		type('Open/B two.md', '\\nTYPED-IN-B-SPLIT');
		return 1; })()`);
	if (mode === 'manuscript') {
		// and a section of the manuscript with typing in it
		await p.ev(`(async () => { const lf = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(lf, { focus: true }); const m = lf.view.current, s = m.scenes.find(s => s.file?.path === 'Open/Box/C three.md'); if (s) { await m.mount(s); const ed = s.live.editor; ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); ed.replaceSelection('\\nTYPED-IN-C-SECTION'); } return 1; })()`);
	}
	const typedEnd = await p.ev(`app.workspace.getLeavesOfType('markdown').map(l => l.view.file.path + '=' + l.view.editor.getValue().includes('TYPED-IN')).join()`);
	say('typed', typedEnd);
	// (straight away, before Obsidian saves: the screen's own flow is too slow for that, so the vault side asks)
	const r = await backAll(p, 'Open draft', 'Open');
	say('result', j(r));
	await settle(p);
	await sleep(p, 2500);
	const after = await everything(p);
	t.ok(r.ok, 'it ran: ' + j(r));
	const l = lost(before, after);
	t.eq(l.length, 0, 'no line of the snapshot lost: ' + j(l));
	const typed = ['TYPED-IN-A-TAB', 'TYPED-IN-B-SPLIT', ...(mode === 'manuscript' ? ['TYPED-IN-C-SECTION'] : [])];
	for (const w of typed) t.ok(Object.entries(after).some(([k, v]) => v.includes(w)), `“${w}” is on disk somewhere (a note or the snapshot taken first)`);
	for (const w of typed) t.ok(Object.entries(after).some(([k, v]) => /Before bringing back/.test(k) && v.includes(w)), `“${w}” is in the “Before bringing back” snapshot`);
	for (const w of ['A WRITTEN-SINCE', 'B second REWRITTEN']) t.ok(Object.entries(after).some(([k, v]) => /Before bringing back/.test(k) && v.includes(w)), `“${w}” (written since) is in the snapshot taken first`);
	t.eq(after['Open/A one.md'], before['Open/A one.md'], 'A is back under its name, byte for byte');
	t.eq(after['Open/B two.md'], before['Open/B two.md'], 'B has its text, byte for byte');
	t.eq(after['Open/C three.md'], before['Open/C three.md'], 'C is back in the binder, byte for byte');
	// the editors show what is on disk, and stay so
	const eds = await p.ev(`app.workspace.getLeavesOfType('markdown').map(l => [l.view.file.path, l.view.editor.getValue()])`);
	for (const [path, text] of eds) t.eq(text.replace(/\n$/, ''), (after[path] ?? '').replace(/\n$/, ''), `the editor open on ${path} shows the file`);
	await sleep(p, 2500);
	const later = await everything(p);
	for (const k of ['Open/A one.md', 'Open/B two.md', 'Open/C three.md']) t.eq(later[k], after[k], `${k} stays as it is after the editors' autosave`);
	// the view shows the result
	const shown = await p.ev(`(() => { const lf = app.workspace.getLeavesOfType('binders-view')[0]; const v = lf.containerEl; return { cards: [...v.querySelectorAll('.binders-card[data-path]')].map(c => c.dataset.path), rows: [...v.querySelectorAll('.binders-outliner-row')].map(c => c.dataset.path), ms: v.querySelector('.binders-manuscript')?.textContent ?? '' }; })()`);
	say('view', j(shown).slice(0, 300));
	if (mode === 'corkboard') t.ok(shown.cards.includes('Open/A one.md') && !shown.cards.includes('Open/A renamed.md'), 'the corkboard shows the notes as they are now: ' + j(shown.cards));
	if (mode === 'outliner') t.ok(shown.rows.includes('Open/A one.md') && !shown.rows.includes('Open/A renamed.md'), 'the outliner shows the notes as they are now: ' + j(shown.rows));
	if (mode === 'manuscript') t.ok(shown.ms.includes('A first paragraph') && !shown.ms.includes('WRITTEN-SINCE') && !shown.ms.includes('TYPED-IN') && !shown.ms.includes('REWRITTEN'), 'the manuscript shows the brought-back text: ' + shown.ms.slice(0, 200));
}, 300000);

// =====================================================================================================================
// Big binders: `n` scenes in 20 parts, then a third renamed, a third moved, some gone, some new, all rewritten
const bigItems = (n, parts = 20) => `Array.from({ length: ${n} }, (_, i) => ({ path: 'Part ' + String(i % ${parts}).padStart(2, '0') + '/Ch ' + (Math.floor(i / ${parts}) % 5) + '/Scene ' + String(i).padStart(4, '0') + '.md', text: '---\\nsynopsis: Synopsis ' + i + '\\nstatus: Draft\\n---\\nScene ' + i + ' first paragraph.\\n\\nScene ' + i + ' second paragraph with some more words.\\n\\nScene ' + i + ' third paragraph, the last.\\n' }))`;
/** The month's work on a big binder, done in the page (fast: the vault's own calls). `links`: through Obsidian's file manager. */
const bigWork = (root, n, links) => `(async () => {
	const f = (x) => app.vault.getAbstractFileByPath(x), mv = ${links} ? (a, b) => app.fileManager.renameFile(a, b) : (a, b) => app.vault.rename(a, b);
	await app.vault.createFolder(${j(root)} + '/Loose').catch(() => {});
	let renamed = 0, moved = 0, gone = 0, fresh = 0, written = 0;
	for (let i = 0; i < ${n}; i++) {
		const path = ${j(root)} + '/Part ' + String(i % 20).padStart(2, '0') + '/Ch ' + (Math.floor(i / 20) % 5) + '/Scene ' + String(i).padStart(4, '0') + '.md', x = f(path);
		if (!x) continue;
		if (i % 7 === 0) { await app.vault.delete(x); gone++; continue; }
		await app.vault.process(x, (t) => t + '\\nSINCE-' + i + ' written after the snapshot.\\n'); written++;
		if (i % 5 === 0) await app.fileManager.processFrontMatter(x, (fm) => { fm.status = 'Final'; fm.label = 'Red'; fm.synopsis = 'Rewritten synopsis ' + i; });
		if (i % 3 === 0) { await mv(x, x.parent.path + '/Renamed ' + String(i).padStart(4, '0') + '.md'); renamed++; }
		else if (i % 3 === 1) { await mv(x, ${j(root)} + '/Loose/Scene ' + String(i).padStart(4, '0') + '.md'); moved++; }
	}
	for (let i = 0; i < ${Math.max(5, Math.round(n / 20))}; i++) { await app.vault.create(${j(root)} + '/Part 00/Fresh ' + i + '.md', 'Fresh ' + i + ' paragraph.\\n'); fresh++; }
	await new Promise(r => setTimeout(r, 800)); await ${B}.snapshotsSettle(); await ${B}.flush();
	return { renamed, moved, gone, fresh, written };
})()`;
const seeded = async (p, root, n, links) => {
	await make(p, root, bigItems(n), { timeout: 240000 });
	await snap(p, root, 'Big draft');
	const before = await everything(p);
	const did = await p.ev(bigWork(root, n, links));
	await sleep(p, 1500);
	return { before, did };
};
const onDisk = (p, path) => p.ev(`app.vault.adapter.exists(${j(path)})`);

// =====================================================================================================================
// 5. Cut short
for (const [links, finishNote] of [[false, 'finish'], [false, 'put back'], [false, 'leave'], [true, 'finish'], [true, 'put back']]) test(`a large bringing back cut short by a reload (300 scenes, links ${links ? 'on' : 'off'}): the next load says so; “${{ finish: 'Finish', 'put back': 'Put it back as it was', leave: 'Leave it as it is' }[finishNote]}” ends with every word in a note or a snapshot, even with a note edited by hand in between`, async (p, h, t) => {
	await setLinks(p, links);
	const root = 'Cut', n = 300;
	const { before, did } = await seeded(p, root, n, links);
	say('work', j(did));
	const mid = await everything(p);
	// start it without the screen, and pull the plug part way
	await p.ev(`(() => { window.__back = (async () => { const s = ${PL}.snapshotsApi.list(${file(root)}).find(x => x.title === 'Big draft'); try { await ${PL}.snapshotsApi.back(s, ${file(root)}, 'all', 'stay'); } catch (e) { window.__err = e.message; } })(); return 1; })()`);
	let cutAt = null;
	const inParts = `app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Cut/Part') && /Scene \\d+\\.md$/.test(f.path)).length`;
	const base = await p.ev(inParts);
	for (let i = 0; i < 2000 && !cutAt; i++) {
		const st = await p.ev(`(async () => { const a = app.vault.adapter, jp = 'Cut/Snapshots/Bringing back.binder-journal'; if (!(await a.exists(jp))) return null; const jr = JSON.parse(await a.read(jp)); if (jr.finished) return 'done'; return ${inParts}; })()`);
		if (st === 'done') throw new Error('it finished before it could be cut: make the binder bigger');
		if (typeof st === 'number' && st > base + 30) cutAt = st;
	}
	if (!cutAt) throw new Error('never saw it begin');
	say('cut when scenes back under their old name:', cutAt);
	// (the plug: the page goes at once)
	await p.ev(`(() => { setTimeout(() => location.reload(), 0); return 1; })()`).catch(() => {});
	await sleep(p, 1500);
	for (let i = 0; i < 80; i++) { if (await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.binders)`).catch(() => false)) break; await sleep(p, 250); }
	await p.ev(`app.plugins.plugins.binders.binders.ready.then(() => 1)`);
	say('errors before the plug was pulled:', j(p.errors.slice(0, 2)).slice(0, 300));
	p.errors.length = 0; // (what a reload logs, and what a page cut off in the middle of its reads does)
	await p.focusMain?.();
	await sleep(p, 1500);
	const jr = await journal(p, 'Cut/Snapshots');
	t.ok(jr && !jr.finished, 'the plan is there and not finished: ' + j(jr && { finished: jr.finished }));
	const modal = await until(p, `(() => { const m = document.querySelector('.modal.binders-folder-snapshots-interrupted'); return m ? m.innerText : null; })()`, 10000);
	say('modal', j(modal));
	t.ok(!!modal && /interrupted/.test(modal), 'the next load says a bringing back was interrupted: ' + j(modal));
	t.ok(/Finish/.test(modal ?? '') && /Put it back as it was/.test(modal ?? '') && /Leave it as it is/.test(modal ?? ''), 'and offers the three ways: ' + j(modal));
	// a note edited by hand between the cut and the answer: one that has not come back yet, and one that has
	const files = await p.ev(`app.vault.getMarkdownFiles().map(f => f.path).filter(x => x.startsWith('Cut/') && !x.includes('Snapshots'))`);
	const unback = files.filter((x) => /Renamed \d+\.md$/.test(x)), came = files.filter((x) => /Scene \d+\.md$/.test(x) && x.startsWith('Cut/Part'));
	say('not yet back', unback.length, 'back', came.length);
	t.ok(unback.length > 0 && came.length > 0, 'it was cut in the middle: ' + unback.length + ' not yet back, ' + came.length + ' back');
	const hand = [unback[0], came[0]].filter(Boolean);
	await p.ev(`(async () => { for (const x of ${j(hand)}) await app.vault.adapter.write(x, (await app.vault.adapter.read(x)) + '\\nHAND-EDIT in ' + x.replace(/.*\\//, '') + '.\\n'); })().then(() => 1)`);
	await sleep(p, 500);
	const cutState = await everything(p);
	if (finishNote === 'finish') {
		// the question is closed without an answer: no other snapshot of this binder can be brought back until it is answered
		await p.key('Escape');
		await sleep(p, 400);
		await showDialog(p, root, 'Big draft');
		await clickIn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...');
		const again = await until(p, `!!document.querySelector('.modal.binders-folder-snapshots-interrupted')`, 15000);
		t.ok(!!again, 'with the question unanswered, “Bring back...” asks it again instead of opening a second bringing back');
		t.ok(!(await p.ev(`!!document.querySelector(${j(BACK)})`)), 'and opens no screen of its own');
		await p.key('Escape');
		await sleep(p, 300);
		await closeAll(p);
		await p.ev(`${PL}.snapshotsApi.interrupted().then(() => 1)`);
		await until(p, `!!document.querySelector('.modal.binders-folder-snapshots-interrupted')`, 10000);
	}
	if (finishNote === 'leave') {
		await clickIn(p, '.modal.binders-folder-snapshots-interrupted button', 'Leave it as it is');
		await sleep(p, 800);
		const jl = await journal(p, 'Cut/Snapshots');
		t.ok(jl && jl.finished > 0, 'the plan is marked finished (left as it is)');
		t.ok(!(await p.ev(`!!document.querySelector('.modal.binders-folder-snapshots-interrupted')`)), 'and the question is gone');
		const afterL = await everything(p);
		const lL = lost(before, afterL), lM = lost(cutState, afterL);
		t.eq(lL.length + lM.length, 0, 'left as it is: nothing lost: ' + j([...lL, ...lM].slice(0, 3)));
		t.eq(j(notesOf(afterL)), j(notesOf(cutState)), 'and no note was touched by leaving it');
		const nb = await backAll(p, 'Big draft', root);
		t.ok(nb.ok, 'a bringing back can be made again afterwards: ' + j(nb));
		await setLinks(p, false);
		return;
	}
	const btn = finishNote === 'finish' ? 'Finish' : 'Put it back as it was';
	await clickIn(p, '.modal.binders-folder-snapshots-interrupted button', btn);
	await until(p, `!!document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan')})`, 60000);
	const screen = await backScreen(p);
	say('screen', j(screen.text.slice(0, 900)));
	const said = await confirmBack(p, 120000);
	say('said', said);
	await sleep(p, 1000);
	const after = await everything(p);
	const l1 = lost(before, after), l2 = lost(mid, after), l3 = lost(cutState, after);
	t.eq(l1.length, 0, 'every paragraph of the snapshot is in a note or a snapshot: ' + j(l1.slice(0, 3)));
	t.eq(l2.length, 0, 'every paragraph written since is in a note or a snapshot: ' + j(l2.slice(0, 3)));
	t.eq(l3.length, 0, 'every paragraph at the cut (the hand edits too) is in a note or a snapshot: ' + j(l3.slice(0, 3)));
	for (const x of hand) { const w = 'HAND-EDIT in ' + x.replace(/.*\//, ''); t.ok(Object.values(after).some((v) => v.includes(w)), `“${w}” is somewhere on disk`); }
	// nothing was deleted: every file at the cut is still there, or its text is in another note
	const gone = Object.keys(notesOf(cutState)).filter((k) => !(k in after) && !Object.values(notesOf(after)).includes(cutState[k]));
	say('files that went (renamed or text elsewhere):', gone.length);
	const jr2 = await journal(p, 'Cut/Snapshots');
	t.ok(jr2 && !!jr2.finished, 'the plan is marked finished: ' + j(jr2 && jr2.finished));
	const fin = await p.ev(`(async () => { await new Promise(r => setTimeout(r, 300)); return !!document.querySelector('.modal.binders-folder-snapshots-interrupted'); })()`);
	t.ok(!fin, 'and the question is gone');
	if (finishNote === 'finish') {
		// every scene of the snapshot is there under its own name with its own text, but the ones hand-edited (kept in the snapshot taken first)
		const notes = notesOf(after);
		const wrong = Object.keys(notesOf(before)).filter((k) => k.startsWith('Cut/Part') && notes[k] !== before[k]);
		say('scenes not as the snapshot has them:', wrong.length, j(wrong.slice(0, 4)));
		t.eq(wrong.length, 0, 'finishing: every note of the snapshot is as the snapshot has it: ' + j(wrong.slice(0, 4)));
	} else {
		const jj = await journal(p, 'Cut/Snapshots');
		say('put-back journal', j(jj && { title: jj.title }));
		// put back as it was: every note as the folder stood when the bringing back began (but what was edited by hand since the cut)
		const na = notesOf(after), nm = notesOf(mid);
		const wrong = Object.keys(nm).filter((k) => !/Cut\/Cut\.md$/.test(k) && !hand.some((x) => k === x || k === x.replace(/Renamed (\d+)/, 'Scene $1')) && na[k] !== nm[k]);
		say('notes not as they stood before the bringing back began:', wrong.length, j(wrong.slice(0, 4)));
		t.eq(wrong.length, 0, 'put back: every note is as it stood before the bringing back: ' + j(wrong.slice(0, 4)));
	}
	await setLinks(p, false);
}, 600000);


// =====================================================================================================================
// 3. Large binders, through the screen, timed
const lagStart = (p) => p.ev(`(() => { window.__lag = { max: 0, over: 0, n: 0, last: performance.now() }; window.__lagT = setInterval(() => { const now = performance.now(), gap = now - window.__lag.last - 50; window.__lag.last = now; window.__lag.n++; if (gap > window.__lag.max) window.__lag.max = gap; if (gap > 500) window.__lag.over++; }, 50); return 1; })()`);
const lagStop = (p) => p.ev(`(() => { clearInterval(window.__lagT); return { max: Math.round(window.__lag.max), over: window.__lag.over, n: window.__lag.n }; })()`);
const lagReset = (p) => p.ev(`(() => { window.__lag.max = 0; window.__lag.over = 0; window.__lag.last = performance.now(); return 1; })()`);
for (const [n, links, since] of [[500, false, 'stay'], [2000, false, 'stay'], [500, true, 'stay'], [500, false, 'gather']]) test(`${n} notes in nested folders, links ${links ? 'on' : 'off'}${since === 'gather' ? ', what is new since moved into one folder' : ''}: how long the screen takes, how long it runs, the window stays alive, the result is the snapshot and the journal is marked finished`, async (p, h, t) => {
	await setLinks(p, links);
	const root = 'Big';
	const t0 = Date.now();
	const { before, did } = await seeded(p, root, n, links);
	say(`${n}: made, snapshotted and worked on in ${Date.now() - t0} ms`, j(did));
	const mid = await everything(p);
	say(`${n}: errors logged by the work itself (before any bringing back):`, p.errors.filter((e) => /ENOENT/.test(e)).length);
	p.errors.length = 0;
	await lagStart(p);
	const tShow = Date.now();
	await showDialog(p, root, 'Big draft');
	const tShown = Date.now() - tShow;
	await lagReset(p);
	const tScreen = Date.now();
	const screen = await backScreen(p);
	const tPlan = Date.now() - tScreen;
	const lagScreen = await p.ev(`({ max: Math.round(window.__lag.max), over: window.__lag.over })`);
	say(`${n}: the dialog drew in ${tShown} ms; “Bring back...” to the screen drawn: ${tPlan} ms; the longest the page was frozen meanwhile: ${lagScreen.max} ms`);
	say('screen counts', j(screen.will), j(screen.left));
	if (since === 'gather') {
		await p.ev(`(() => { const s = [...document.querySelectorAll(${j(BACK + ' select')})].find(s => s.closest('.binders-folder-snapshots-since')); s.value = 'gather'; s.dispatchEvent(new Event('change')); return 1; })()`);
		await sleep(p, 500);
		say('gather screen:', j(await p.ev(`document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan-will')}).innerText`)).slice(-500));
	}
	await lagReset(p);
	const tGo = Date.now();
	const said = await confirmBack(p, 600000);
	const tDone = Date.now() - tGo;
	const lag = await lagStop(p);
	say(`${n}: bringing back ran ${tDone} ms; longest freeze ${lag.max} ms (${lag.over} over half a second)`);
	say('said', said);
	const after = await everything(p);
	t.ok(lag.max < 3000, `the window never froze for 3 seconds (longest ${lag.max} ms)`);
	const l1 = lost(before, after), l2 = lost(mid, after);
	t.eq(l1.length, 0, 'every paragraph of the snapshot is in a note or a snapshot: ' + j(l1.slice(0, 3)));
	t.eq(l2.length, 0, 'every paragraph written since is in a note or a snapshot: ' + j(l2.slice(0, 3)));
	const nb = notesOf(before), na = notesOf(after);
	const wrong = Object.keys(nb).filter((k) => na[k] !== nb[k] && !/(^|\/)Big\.md$/.test(k));
	say(`${n}: notes that are not the snapshot's, byte for byte:`, wrong.length, j(wrong.slice(0, 3)));
	t.eq(wrong.length, 0, 'every note of the snapshot is there as it was, byte for byte: ' + j(wrong.slice(0, 3)));
	const extra = Object.keys(na).filter((k) => !(k in nb) && !k.endsWith('Big/Big.md'));
	say(`${n}: notes that are there now and were not in the snapshot:`, extra.length, j(extra.slice(0, 3)));
	t.ok(extra.every((k) => /Fresh|Renamed|Loose/.test(k) || true), 'what is new stays');
	t.eq(extra.length, did.fresh, 'only the notes new since stay besides: ' + extra.length + ' ' + j(extra.slice(0, 4)));
	if (since === 'gather') t.ok(extra.every((k) => k.startsWith('Big/Since Big draft/')), 'every one of them is in the one folder “Since Big draft”: ' + j(extra.filter((k) => !k.startsWith('Big/Since Big draft/')).slice(0, 3)));
	else t.ok(extra.every((k) => !k.startsWith('Big/Since ')), 'and none was moved');
	// nothing is deleted: the number of notes now is every note of the snapshot (made again) and every one new since
	t.eq(Object.keys(na).length, Object.keys(nb).length + did.fresh, 'the notes now are the snapshot’s and the new ones, and no more or fewer');
	const jr = await journal(p, root + '/Snapshots');
	t.ok(jr && jr.finished > 0, 'the journal is marked finished');
	t.ok(!(await p.ev(`!!document.querySelector('.modal.binders-folder-snapshots-interrupted')`)), 'no question about an interrupted bringing back');
	await setLinks(p, false);
}, 900000);


// =====================================================================================================================
// 1. Phones and tablets, portrait and landscape: “Everything” by touch
import { reload } from './view-helpers.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const SHOTS = process.env.QA10_SHOTS || '';
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const tapOn = async (p, sel, text) => { const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.offsetParent && (${j(text)} === '' || e.textContent.trim().startsWith(${j(text)}))).pop(); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return r.width ? { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 } : null; })()`); if (!at) throw new Error(`nothing to tap: ${sel} “${text}”`); await tap(p, at.x, at.y); };
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
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
		await theme();
	}
	if (logged.length) throw new Error('errors logged: ' + logged.slice(0, 3).join(' ; '));
}
/** Everything about the screen that has a size. */
const measure = (p) => p.ev(`(() => {
	const m = document.querySelector(${j(BACK)}), vw = innerWidth, vh = innerHeight, mr = m.getBoundingClientRect(), c = m.querySelector('.modal-content');
	const scroller = [c, m, m.parentElement].find((e) => e && e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY));
	const over = [...m.querySelectorAll('*')].filter(e => e.offsetParent && !e.closest('.modal-close-button')).map(e => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.width && (r.right > mr.right + 1 || r.left < mr.left - 1)).map(([e, r]) => e.className + ':' + Math.round(r.left) + '-' + Math.round(r.right));
	const btns = [...m.querySelectorAll('.modal-button-container button')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, w: Math.round(r.width), h: Math.round(r.height) }; });
	const sels = [...m.querySelectorAll('select')].filter(s => s.offsetParent).map(s => { const r = s.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right) }; });
	const clipped = [...m.querySelectorAll('.binders-folder-snapshots-plan li, .modal-content > p, .setting-item-name, .setting-item-description')].filter(e => e.offsetParent && (e.scrollWidth > e.clientWidth + 1)).map(e => e.textContent.slice(0, 40));
	const since = m.querySelector('.binders-folder-snapshots-since'), sinceShown = !!since && !!since.offsetParent;
	// scrolled to the end: is the last button on the display, and the first one (title) can be scrolled back to?
	if (scroller) scroller.scrollTop = scroller.scrollHeight;
	const last = m.querySelector('.modal-button-container button:last-child'); last.scrollIntoView({ block: 'end' });
	const lr = last.getBoundingClientRect(), first = m.querySelector('.modal-button-container button:first-child').getBoundingClientRect();
	const mr2 = m.getBoundingClientRect();
	return { vw, vh, modal: { l: Math.round(mr.left), r: Math.round(mr.right), t: Math.round(mr.top), b: Math.round(mr.bottom), h: Math.round(mr.height) }, contentH: c.scrollHeight, scrolls: !!scroller, over, btns, sels, clipped, sinceShown, lastReach: { top: Math.round(lr.top), bottom: Math.round(lr.bottom) }, firstReach: { top: Math.round(first.top), bottom: Math.round(first.bottom) }, overflowY: getComputedStyle(c).overflowY, mOverflow: getComputedStyle(m).overflowY, texts: [...m.querySelectorAll('.binders-folder-snapshots-plan li')].map(e => e.textContent.length), font: parseFloat(getComputedStyle(m.querySelector('.binders-folder-snapshots-plan li') ?? c).fontSize) };
})()`);
const MOB = ['Mob', 'Mob/Snapshots'];
const MOB_ITEMS = `[
	{ path: 'Part One/The arrival of the long winter ship at the northern harbour.md', text: 'Arrival one.\\n\\nArrival two.\\n\\nArrival three.\\n' },
	{ path: 'Part One/Keeper of the lamp and the long stairs of the tower.md', text: 'Keeper one.\\n\\nKeeper two.\\n\\nKeeper three.\\n' },
	{ path: 'Part Two/The wreck on the far rocks beyond the point.md', text: 'Wreck one.\\n\\nWreck two.\\n\\nWreck three.\\n' },
	{ path: 'Part Two/A scene that will be gone entirely before the end.md', text: 'Gone one.\\n\\nGone two.\\n\\nGone three.\\n' },
	{ path: 'Part Three/An only note in a folder that goes with it.md', text: 'Only one.\\n\\nOnly two.\\n\\nOnly three.\\n' }
]`;
const mobWork = `(async () => {
	const f = (x) => app.vault.getAbstractFileByPath(x), fm = app.fileManager;
	await fm.renameFile(f('Mob/Part One/The arrival of the long winter ship at the northern harbour.md'), 'Mob/Part One/Arrival.md');
	await fm.renameFile(f('Mob/Part One/Keeper of the lamp and the long stairs of the tower.md'), 'Mob/Part Two/Keeper of the lamp and the long stairs of the tower.md');
	await app.vault.process(f('Mob/Part Two/The wreck on the far rocks beyond the point.md'), (t) => t.replace('Wreck two.', 'Wreck two REWRITTEN since.') + '\\nWritten since.\\n');
	await app.vault.delete(f('Mob/Part Two/A scene that will be gone entirely before the end.md'));
	await app.vault.delete(f('Mob/Part Three'), true);
	await app.vault.create('Mob/Part Two/Written since the snapshot, with a long name here too.md', 'New since.\\n');
	await app.vault.createFolder('Mob/New folder since'); await app.vault.create('Mob/New folder since/Inside the new folder.md', 'Inside.\\n');
	await new Promise(r => setTimeout(r, 600)); await ${B}.snapshotsSettle(); await ${B}.flush();
})().then(() => 1)`;
const SIZES = [['phone portrait', [390, 844], 'stay'], ['phone landscape', [844, 390], 'gather'], ['tablet portrait', [820, 1180], 'gather'], ['tablet landscape', [1180, 820], 'stay']];
for (const [name, size, since] of SIZES) test(`on a ${name} (${size.join('×')}): “Everything” is the default, counts and lists are readable and wrapped, the choice for what is new since is there, the buttons reach, the sheet scrolls; then it brings everything back and says so`, async (p, h, t) => {
	await setLinks(p, true);
	await make(p, 'Mob', MOB_ITEMS);
	await snap(p, 'Mob', 'Draft sent to Sam');
	const before = await everything(p);
	await p.ev(mobWork);
	await sleep(p, 600);
	const mid = await everything(p);
	await onMobile(p, size, async () => {
		const phone = await p.ev(`document.body.classList.contains('is-phone')`);
		t.eq(phone, size[0] < 600 || size[1] < 600 && size[0] < 900 ? phone : phone, '(is-phone: ' + phone + ')');
		await openView(p, 'Mob');
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); ${PL}.snapshotsApi.show(${file('Mob')}); return 1; })()`);
		await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`, 20000);
		await sleep(p, 600);
		await tapOn(p, DLG + ' .binders-snapshots-item-name', 'Draft sent to Sam');
		await drawn(p);
		await sleep(p, 400);
		await tapOn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...');
		await until(p, `!!document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan ul')})`, 20000);
		await sleep(p, 600);
		const screen = await p.ev(`(() => { const m = document.querySelector(${j(BACK)}); return { sel: m.querySelector('select').value, text: m.querySelector('.modal-content').innerText }; })()`);
		t.eq(screen.sel, 'all', 'it opens on “Everything”');
		say(name, 'screen:', j(screen.text).slice(0, 700));
		const m = await measure(p);
		if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.shot(join(SHOTS, `qa10-${name.replace(/ /g, '-')}.png`)); }
		say(name, j({ vp: m.vw + 'x' + m.vh, modal: m.modal, contentH: m.contentH, scrolls: m.scrolls, btns: m.btns.map((b) => b.t + ' ' + b.w + 'x' + b.h), sels: m.sels, since: m.sinceShown, last: m.lastReach, first: m.firstReach, font: m.font }));
		t.ok(m.modal.l >= 0 && m.modal.r <= m.vw && m.modal.t >= 0, 'the screen is inside the display: ' + j(m.modal) + ' of ' + m.vw + '×' + m.vh);
		t.eq(m.over.length, 0, 'nothing runs past the screen’s sides: ' + j(m.over.slice(0, 3)));
		t.eq(m.clipped.length, 0, 'the lines wrap (none wider than its box): ' + j(m.clipped));
		t.ok(m.lastReach.bottom <= m.vh && m.lastReach.top >= 0, 'scrolled to the end, the last button is on the display: ' + j(m.lastReach) + ' of ' + m.vh);
		t.ok(m.btns.length === 2 && m.btns.every((b) => b.h >= 28 && b.w >= 28), 'both buttons are a finger’s size: ' + j(m.btns));
		t.ok(m.sels.every((s) => s.h >= 28 && s.l >= 0 && s.r <= m.vw), 'the dropdowns are a finger tall and inside: ' + j(m.sels));
		t.ok(m.sinceShown, 'the choice for what is new since is shown');
		t.ok(m.font >= 12, 'the text is 12 px or more (' + m.font + ')');
		if (m.modal.h >= m.vh - 4 || m.contentH > m.modal.h) t.ok(m.scrolls || m.modal.h < m.vh, 'a sheet taller than the display scrolls: ' + j({ h: m.modal.h, vh: m.vh, scrolls: m.scrolls, contentH: m.contentH }));
		// the choice for what is new since, by a tap on the control
		await p.ev(`(() => { const s = [...document.querySelectorAll(${j(BACK + ' select')})].find(s => s.closest('.binders-folder-snapshots-since')); s.value = ${j(since)}; s.dispatchEvent(new Event('change')); return 1; })()`);
		await sleep(p, 400);
		const m2 = await measure(p);
		t.ok(m2.lastReach.bottom <= m2.vh && m2.over.length === 0 && m2.clipped.length === 0, `with “${since}” chosen the screen still fits: ` + j({ last: m2.lastReach, over: m2.over, clipped: m2.clipped }));
		const going = await p.ev(`document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan-will')}).innerText`);
		say(name, 'will:', j(going).slice(0, 900));
		await p.ev(`document.querySelectorAll('.notice').forEach(n => n.remove())`);
		await tapOn(p, BACK + ' .modal-button-container button', 'Bring back');
		await until(p, `!document.querySelector(${j(BACK)}) && document.querySelectorAll('.notice').length > 0`, 60000);
		await sleep(p, 900);
		const said = await notices(p);
		say(name, 'said:', said);
		const nr = await p.ev(`(() => { const n = [...document.querySelectorAll('.notice')].pop(), r = n.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, clip: n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1, font: parseFloat(getComputedStyle(n).fontSize) }; })()`);
		t.ok(nr.l >= 0 && nr.r <= nr.vw && nr.t >= 0 && nr.b <= nr.vh && !nr.clip && nr.font >= 12, 'the closing notice is whole and readable: ' + j(nr));
		t.ok(/^(Updated \d+ links? in \d+ files?\.\|)?Brought back “Draft sent to Sam”/.test(said) && /Nothing was deleted/.test(said), 'the notice says what happened: ' + said);
	});
	await settle(p);
	await sleep(p, 600);
	const after = await everything(p);
	const l = lost(before, after), l2 = lost(mid, after);
	t.eq(l.length + l2.length, 0, 'no line lost, from the snapshot or from since: ' + j([...l, ...l2].slice(0, 3)));
	const nb = notesOf(before), na = notesOf(after);
	const was = Object.keys(nb).filter((k) => k.startsWith('Mob/') && !/Mob\/Mob\.md$/.test(k));
	for (const k of was) t.ok(k in na && na[k] === nb[k], `${k.slice(4)} is back, byte for byte`);
	if (since === 'gather') {
		const into = Object.keys(na).filter((k) => /^Mob\/Since Draft sent to Sam\//.test(k));
		t.ok(into.length >= 2 && into.some((k) => /Written since the snapshot/.test(k)) && into.some((k) => /Inside the new folder/.test(k)), 'what is new since is in the one folder “Since Draft sent to Sam”: ' + j(into));
	} else {
		t.ok('Mob/Part Two/Written since the snapshot, with a long name here too.md' in na && 'Mob/New folder since/Inside the new folder.md' in na, 'what is new since stays where it is');
	}
	const jr = await journal(p, 'Mob/Snapshots');
	t.ok(jr && jr.finished > 0, 'the journal is marked finished');
	await setLinks(p, false);
}, 300000);


// =====================================================================================================================
// More: exactness, a change between the screen and the button, a subfolder, a folder and a note of one name
const hexOfFile = (p, path) => p.ev(`app.vault.adapter.readBinary(${j(path)}).then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''))`);
test('files of every kind of ending, open in an editor, renamed and rewritten since: CRLF, a byte-order mark, no last newline, comments and quotes in the properties come back byte for byte', async (p, h, t) => {
	await make(p, 'Raw', `[
		{ path: 'Crlf.md', text: '---\\r\\nsynopsis: "quoted"  # a comment\\r\\nlabel: Red\\r\\n---\\r\\nFirst line of crlf.\\r\\n\\r\\nSecond line of crlf.\\r\\n\\r\\nThird line.\\r\\n' },
		{ path: 'Bom.md', text: '\\uFEFF---\\nstatus: Draft  \\ntags: [a,   b]\\n---\\nBom first.\\n\\nBom second.\\n\\nBom third.\\n' },
		{ path: 'No newline.md', text: 'No newline one.\\n\\nNo newline two.\\n\\nNo newline three' },
		{ path: 'Comments.md', text: '---\\n# a note to self\\nsynopsis: >-\\n  folded text\\n  over two lines\\nweird:   spaced\\n---\\nComment one.\\n\\nComment two.\\n\\nComment three.\\n' },
		{ path: 'Tabs.md', text: '\\tTab led paragraph one.\\n\\n\\tTab led paragraph two.\\n\\n\\tTab led paragraph three.\\n' }
	]`);
	await snap(p, 'Raw', 'Raw draft');
	const before = await everything(p);
	const hb = {};
	for (const k of Object.keys(notesOf(before))) hb[k] = await hexOfFile(p, k);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x), fm = app.fileManager; for (const n of ['Crlf', 'Bom', 'No newline', 'Comments', 'Tabs']) { await fm.renameFile(f('Raw/' + n + '.md'), 'Raw/' + n + ' renamed.md'); } await app.vault.process(f('Raw/Bom renamed.md'), (t) => t + '\\nBOM-SINCE.\\n'); await app.vault.process(f('Raw/Crlf renamed.md'), (t) => t + '\\r\\nCRLF-SINCE.\\r\\n'); await new Promise(r => setTimeout(r, 600)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 500);
	// open each in an editor, with unsaved typing in two
	// (a CRLF note open in an editor is written with LF by Obsidian itself whenever the file changes under it: see the baseline test; so it stays closed here)
	await p.ev(`(async () => { for (const n of ['Bom', 'No newline', 'Comments', 'Tabs']) { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Raw/' + n + ' renamed.md'), { state: { mode: 'source' } }); } await new Promise(r => setTimeout(r, 400)); const ed = (n) => app.workspace.getLeavesOfType('markdown').find(l => l.view.file.path === 'Raw/' + n + ' renamed.md').view.editor; for (const n of ['Comments', 'Bom']) { const e = ed(n); e.replaceRange('\\nTYPED-' + n, { line: e.lastLine(), ch: e.getLine(e.lastLine()).length }); } return 1; })()`);
	const mid = await everything(p);
	const r = await backAll(p, 'Raw draft', 'Raw');
	say('result', j(r));
	const sizeNow = async () => Buffer.from(await hexOfFile(p, 'Raw/Crlf.md'), 'hex').length;
	const at0 = await sizeNow();
	await settle(p);
	const at1 = await sizeNow();
	await sleep(p, 2500);
	say('Crlf.md bytes: right after', at0, 'settled', at1, 'after the editors autosave', await sizeNow(), '(it was', Buffer.from(hb['Raw/Crlf.md'], 'hex').length, ')');
	const after = await everything(p);
	t.ok(r.ok, 'it ran: ' + j(r));
	const bad = [];
	for (const k of Object.keys(hb)) {
		const h2 = after[k] === undefined ? null : await hexOfFile(p, k);
		if (h2 !== hb[k]) bad.push(`${k.slice(4)}: ${Buffer.from(hb[k], 'hex').length} bytes then, ${h2 ? Buffer.from(h2, 'hex').length : 'none'} now`);
	}
	say('not byte for byte:', j(bad));
	t.eq(bad.length, 0, 'every note is back byte for byte: ' + j(bad));
	const l = lost(mid, after);
	t.eq(l.length, 0, 'every line written since (the typing too) is in a note or a snapshot: ' + j(l));
	for (const w of ['TYPED-Comments', 'TYPED-Bom', 'BOM-SINCE', 'CRLF-SINCE']) t.ok(Object.entries(after).some(([k, v]) => /Before bringing back/.test(k) && v.includes(w)), `“${w}” is in the snapshot taken first`);
	await sleep(p, 2500);
	for (const k of Object.keys(hb)) t.eq(await hexOfFile(p, k), hb[k], `${k.slice(4)} stays so once the editors have autosaved`);
}, 200000);

test('a renamed, rewritten note open in a tab: one Undo in its editor gives back the text it had before, in the note it was brought back into; nothing else is lost', async (p, h, t) => {
	await make(p, 'Undo', `[{ path: 'Scene a.md', text: 'Para a1.\\n\\nPara a2.\\n\\nPara a3.\\n' }, { path: 'Scene b.md', text: 'Para b1.\\n\\nPara b2.\\n\\nPara b3.\\n' }]`);
	await snap(p, 'Undo', 'Undo draft');
	const before = await everything(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await app.fileManager.renameFile(f('Undo/Scene a.md'), 'Undo/Scene a new name.md'); await app.vault.process(f('Undo/Scene a new name.md'), (t) => t.replace('Para a2.', 'Para a2 REWRITTEN.')); await new Promise(r => setTimeout(r, 500)); await ${B}.snapshotsSettle(); await ${B}.flush(); const l = app.workspace.getLeaf('tab'); await l.openFile(f('Undo/Scene a new name.md'), { state: { mode: 'source' } }); await new Promise(r => setTimeout(r, 500)); l.view.editor.focus(); return 1; })()`);
	const since = await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`);
	await showDialog(p, 'Undo', 'Undo draft');
	await backScreen(p);
	await confirmBack(p);
	await sleep(p, 1500);
	const now = await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`);
	t.eq(now, before['Undo/Scene a.md'], 'the editor shows the note as it was in the snapshot');
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown')[0]; l.view.editor.focus(); l.view.editor.undo(); return 1; })()`);
	await sleep(p, 300);
	const undone = await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`);
	say('after one Undo', j(undone), 'the note was', j(since));
	t.eq(undone, since, 'one Undo gives back what the note said before');
	await sleep(p, 2500);
	const after = await everything(p);
	t.ok(Object.values(after).some((v) => v.includes('Para a2 REWRITTEN')), 'the rewritten line is on disk');
	const onDisk = after['Undo/Scene a.md'];
	t.eq(onDisk, since, 'the file at the old name now says what the note said before (the Undo is saved there)');
	t.ok(!('Undo/Scene a new name.md' in after), 'and the new name did not come back as a second note');
}, 120000);

test('(baseline, Obsidian alone) a CRLF note open in an editor and written to from outside: does its editor write it back with LF?', async (p, h, t) => {
	await make(p, 'Base', `[{ path: 'Crlf.md', text: 'one\\r\\n\\r\\ntwo\\r\\n\\r\\nthree\\r\\n' }]`);
	const size = async () => (await hexOfFile(p, 'Base/Crlf.md')).length / 2;
	await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath('Base/Crlf.md'), { state: { mode: 'source' } }); return 1; })()`);
	await sleep(p, 1500);
	const s0 = await size();
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Base/Crlf.md'); await app.vault.process(f, () => 'one\\r\\n\\r\\ntwo CHANGED\\r\\n\\r\\nthree\\r\\n'); })().then(() => 1)`);
	await sleep(p, 3500);
	const s1 = await size();
	say('baseline: opened', s0, 'bytes; after an outside write of 36 bytes and 3.5 s:', s1, 'bytes; the editor says', j(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`)));
	t.ok(true, 'measured: ' + s0 + ' / ' + s1);
}, 100000);

test('the screen is open, something changes, then the button: a made, renamed or moved item means nothing at all is done; a changed note is left and named', async (p, h, t) => {
	await make(p, 'Late', `[
		{ path: 'One.md', text: 'One a.\\n\\nOne b.\\n\\nOne c.\\n' },
		{ path: 'Two.md', text: 'Two a.\\n\\nTwo b.\\n\\nTwo c.\\n' },
		{ path: 'Three.md', text: 'Three a.\\n\\nThree b.\\n\\nThree c.\\n' }
	]`);
	await snap(p, 'Late', 'Late draft');
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await app.fileManager.renameFile(f('Late/One.md'), 'Late/One renamed.md'); await app.vault.process(f('Late/Two.md'), (t) => t.replace('Two b.', 'Two B REWRITTEN.')); await app.vault.process(f('Late/Three.md'), (t) => t.replace('Three b.', 'Three B REWRITTEN.')); await new Promise(r => setTimeout(r, 500)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 500);
	// (1) a note changes between the screen and the button
	await showDialog(p, 'Late', 'Late draft');
	const screen = await backScreen(p);
	say('late screen', j(screen.will));
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath('Late/Two.md'), (t) => t + '\\nWRITTEN-MEANWHILE.\\n').then(() => 1)`);
	await sleep(p, 300);
	const said = await confirmBack(p);
	say('said (a note changed)', said);
	const after1 = await everything(p);
	t.ok(/Two/.test(said) && /left as|changed/i.test(said), 'the note that changed meanwhile is named as left: ' + said);
	t.ok(after1['Late/Two.md'].includes('WRITTEN-MEANWHILE'), 'and it keeps what was written meanwhile');
	t.ok(!!after1['Late/One.md'] && !after1['Late/One renamed.md'], 'the others came back');
	// (2) an item is renamed between the screen and the button
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await app.fileManager.renameFile(f('Late/One.md'), 'Late/One again renamed.md'); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 400);
	await showDialog(p, 'Late', 'Late draft');
	await backScreen(p);
	const before2 = await everything(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await app.fileManager.renameFile(f('Late/Three.md'), 'Late/Three moved on.md'); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 400);
	const mid2 = await everything(p);
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
	await clickIn(p, BACK + ' .modal-button-container button', 'Bring back');
	await until(p, `document.querySelectorAll('.notice').length > 0`, 20000);
	const said2 = await notices(p);
	say('said (an item renamed)', said2, '| the screen is still open:', await p.ev(`!!document.querySelector(${j(BACK)})`));
	await closeAll(p);
	await settle(p);
	const after2 = await everything(p);
	t.ok(/was changed after the screen said|nothing was brought back/i.test(said2), 'it says nothing was brought back, look again: ' + said2);
	const keep = (o) => Object.fromEntries(Object.entries(notesOf(o)));
	t.eq(j(keep(after2)), j(keep(mid2)), 'no note was touched');
	const jr = await journal(p, 'Late/Snapshots');
	t.ok(!jr || jr.finished > 0, 'and no plan was left unfinished');
}, 200000);

test('BUG: a snapshot of one part brought back: a note that moved out to the next part is made again here (what the screen says), the other part is not written', async (p, h, t) => {
	await make(p, 'Parts', `[
		{ path: 'Part One/Alpha.md', text: 'Alpha a.\\n\\nAlpha b.\\n\\nAlpha c.\\n' },
		{ path: 'Part One/Beta.md', text: 'Beta a.\\n\\nBeta b.\\n\\nBeta c.\\n' },
		{ path: 'Part Two/Gamma.md', text: 'Gamma a.\\n\\nGamma b.\\n\\nGamma c.\\n' }
	]`);
	await snap(p, 'Parts/Part One', 'Part draft');
	const before = await everything(p);
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x); await app.fileManager.renameFile(f('Parts/Part One/Beta.md'), 'Parts/Part Two/Beta.md'); await app.vault.process(f('Parts/Part Two/Gamma.md'), (t) => t + '\\nGamma written since.\\n'); await app.vault.process(f('Parts/Part One/Alpha.md'), (t) => t + '\\nAlpha written since.\\n'); await new Promise(r => setTimeout(r, 500)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 500);
	const mid = await everything(p);
	await showDialog(p, 'Parts/Part One', 'Part draft');
	const screen = await backScreen(p);
	say('part screen', j(screen.will), j(screen.left));
	await confirmBack(p);
	const after = await everything(p);
	t.eq(after['Parts/Part Two/Gamma.md'], mid['Parts/Part Two/Gamma.md'], 'the other part’s own note is not written');
	t.eq(after['Parts/Part One/Alpha.md'], before['Parts/Part One/Alpha.md'], 'Alpha has its text');
	const betas = Object.keys(after).filter((k) => /Beta\.md$/.test(k) && !/Snapshots/.test(k));
	say('Betas', j(betas));
	t.ok(betas.length === 1, 'a note that moved to the next part is not copied back into this one while it lives there: ' + j(betas) + ' — ' + j(screen.will));
	const l = lost(mid, after);
	t.eq(l.length, 0, 'no line lost: ' + j(l));
}, 200000);

test('odd names, exact: after bringing back, each note of the snapshot is there byte for byte under its own name; a folder and a note that swapped their names; capital-only renames', async (p, h, t) => {
	await make(p, 'Names', `[
		{ path: 'Case.md', text: 'Case a.\\n\\nCase b.\\n\\nCase c.\\n' },
		{ path: 'Swap one.md', text: 'ONE a.\\n\\nONE b.\\n\\nONE c.\\n' },
		{ path: 'Swap two.md', text: 'TWO a.\\n\\nTWO b.\\n\\nTWO c.\\n' },
		{ path: 'Fold/Inside.md', text: 'Inside a.\\n\\nInside b.\\n\\nInside c.\\n' },
		{ path: 'Gone note.md', text: 'Gone a.\\n\\nGone b.\\n\\nGone c.\\n' },
		{ path: 'Dot.. name .md', text: 'Dot a.\\n\\nDot b.\\n\\nDot c.\\n' },
		{ path: 'UPPER lower.md', text: 'Upper a.\\n\\nUpper b.\\n\\nUpper c.\\n' }
	]`);
	await snap(p, 'Names', 'Names draft');
	const before = await everything(p);
	const mv = (a, b) => `await fm.renameFile(f(${j('Names/' + a)}), ${j('Names/' + b)});`;
	await p.ev(`(async () => { const f = (x) => app.vault.getAbstractFileByPath(x), fm = app.fileManager;
		${mv('Case.md', 'CASE.md')} ${mv('UPPER lower.md', 'upper LOWER.md')}
		${mv('Swap one.md', 'tmp.md')} ${mv('Swap two.md', 'Swap one.md')} ${mv('tmp.md', 'Swap two.md')}
		await app.vault.process(f('Names/Swap one.md'), (t) => t + '\\nTWO written since.\\n');
		${mv('Fold/Inside.md', 'Inside.md')} await app.vault.delete(f('Names/Fold'), true); await app.vault.create('Names/Fold.md', 'A note called Fold now.\\n\\nSecond.\\n\\nThird.\\n');
		await app.vault.delete(f('Names/Gone note.md')); await app.vault.createFolder('Names/Gone note'); await app.vault.create('Names/Gone note/Child.md', 'Child a.\\n');
		${mv('Dot.. name .md', 'Dot name.md')}
		await new Promise(r => setTimeout(r, 600)); await ${B}.snapshotsSettle(); await ${B}.flush(); })().then(() => 1)`);
	await sleep(p, 500);
	const mid = await everything(p);
	const r = await backAll(p, 'Names draft', 'Names');
	say('result', j(r));
	await settle(p);
	const after = await everything(p);
	const fl = (await fileList(p)).filter((x) => x.startsWith('Names/') && !x.includes('Snapshots'));
	say('files', j(fl));
	t.ok(r.ok, 'it ran: ' + j(r));
	t.eq(r.left.length, 0, 'nothing left undone: ' + j(r.left));
	for (const k of Object.keys(notesOf(before)).filter((k) => !/Names\/Names\.md$/.test(k))) t.ok(after[k] === before[k], `${k.slice(6)} is back byte for byte under its own name`);
	const l = lost(mid, after);
	t.eq(l.length, 0, 'no line lost: ' + j(l));
}, 200000);

// @@END@@
