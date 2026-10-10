// QA round 11, cross-feature journeys: a novelist's whole path through Binders, in different orders, with the files on
// disk checked at every step. Import from Scrivener (a zip, through the real dialog) -> reorder -> write with tab
// paragraphs -> Replace all (review, snapshot) -> "Show changes" -> undo -> replace again -> split and merge -> folder
// snapshot -> bring back -> export EPUB and DOCX. Native binder and Longform binder, on a computer and on a phone.
// Tests named "BUG:" fail until the finding they show is fixed; "NIT:" are small things.
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { zipSync, strFromU8, unzipSync } from 'fflate';
import { B, PL, VIEW, file, j, openView, read, until, texts, withTidy, writeRaw, clickMenu, menuItems, split } from './view-helpers.mjs';
import { docx, epub, epubcheck, words, press as xpress, pick as xpick, saved, status, standIn, WIN as XWIN } from './specs-export.mjs';
import { LEAF, M, binder, disk, saveAll, settle, snap, openMs, onDevice, PHONE, tap, menuTap } from './specs-qa5-manuscript.mjs';

export const specs = [];
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
const errs = (p) => p.errors.filter((e) => !NOISE.test(e));
const test = (name, fn) => specs.push({ name: 'qa11 cross: ' + name, fn: withTidy(async (p, h, t) => {
	try { await fn(p, h, t); } finally { await cleanup(p); }
	const bad = errs(p);
	if (bad.length) t.ok(false, 'console errors during the journey: ' + bad.slice(0, 3).join(' ; '));
}) });
const bug = (name, fn) => test('BUG: ' + name, fn);
const nit = (name, fn) => test('NIT: ' + name, fn);

// ---- the Scrivener project ----
const ROOT = 'Novel', WIN = '.modal.binders-import';
const ID = (n) => `22222222-2222-2222-2222-${String(n).padStart(12, '0')}`;
const inc = '<IncludeInCompile>Yes</IncludeInCompile>', enc = new TextEncoder();
const item = (n, type, title, meta = inc, kids = '') => `<BinderItem UUID="${ID(n)}" Type="${type}"><Title>${title}</Title><MetaData>${meta}</MetaData>${kids ? `<Children>${kids}</Children>` : ''}</BinderItem>`;
// five scenes in two chapters; the name Mara is in every kind of place
const SCENES = {
	3: ['Arrival', 'Mara came ashore at dusk. mara looked back at the boat.\\par\\tab The keeper did not wave. MARA waited.\\par A Maramures rug lay by the door.'],
	4: ['The keeper', 'The keeper said nothing to Mara.\\par\\tab She had come a long way. Mara knew it.'],
	5: ['Storm warning', 'The glass fell. Mara watched it fall.\\par\\tab Wind. More wind. Mara counted the seconds.'],
	7: ['The wreck', 'Mara found the wreck at low tide.\\par\\tab Nothing of the boat was left but Mara\\u8217?s own memory.'],
	8: ['Lights out', 'The lamp went dark. Mara did not move.'],
};
const fixture = new Map();
fixture.set(`${ROOT}.scrivx`, enc.encode(`<ScrivenerProject Version="2.0" Creator="Test"><Binder>${item(1, 'DraftFolder', 'Manuscript', inc,
	item(2, 'Folder', 'Part One', inc, item(3, 'Text', SCENES[3][0]) + item(4, 'Text', SCENES[4][0]) + item(5, 'Text', SCENES[5][0])) +
	item(6, 'Folder', 'Part Two', inc, item(7, 'Text', SCENES[7][0]) + item(8, 'Text', SCENES[8][0])))}</Binder></ScrivenerProject>`));
for (const [n, [, rtf]] of Object.entries(SCENES)) fixture.set(`Files/Data/${ID(n)}/content.rtf`, enc.encode(`{\\rtf1\\ansi\\uc1 ${rtf}}`));
const dir = resolve('test-dist/qa11-source');
const zipPath = join(dir, 'novel.zip');
mkdirSync(dir, { recursive: true });
writeFileSync(zipPath, zipSync(Object.fromEntries([...fixture].map(([p, b]) => [`${ROOT}.scriv/${p}`, b]))));

const press = async (p, label, sel = WIN) => {
	const ok = await p.ev(`(() => { const b = [...document.querySelectorAll('${sel} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b || b.disabled) return false; b.click(); return true; })()`);
	if (!ok) throw new Error(`no enabled button “${label}” in ${sel}`);
	await p.sleep(120);
};
/** Imports the project through the real dialog (a zip, through the browser's own chooser). */
async function importNovel(p) {
	await p.ev(`(() => { ${PL}.importHost.desktop = () => null; app.commands.executeCommandById('binders:import-scrivener'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN}')`);
	await p.send('Page.setInterceptFileChooserDialog', { enabled: true });
	await press(p, 'Choose a zipped backup...');
	const doc = await p.send('DOM.getDocument');
	const found = await p.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: WIN + ' input[type="file"]' });
	await p.send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files: [zipPath] });
	await p.send('Page.setInterceptFileChooserDialog', { enabled: false });
	if (!(await until(p, `!!document.querySelector('${WIN} [data-binders-key="name"]')`, 15000))) throw new Error('import did not load');
	await until(p, `document.querySelectorAll('${WIN}').length === 1`, 3000);
	await p.sleep(150);
	await press(p, 'Import');
	if (!(await until(p, `!!${B}.binderOf(${j(ROOT)}) && !document.querySelector('${WIN}')`, 20000))) throw new Error('import did not finish');
	await p.sleep(400);
}
async function cleanup(p) {
	await p.ev(`(() => { try { ${VIEW}?.findBar?.close(); } catch {} document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(200); }
	await p.ev(`(async () => { const pl = ${PL}; if (window.__qa11tab !== undefined) { pl.settings.tabParagraphs = window.__qa11tab; await pl.saveSettings(); delete window.__qa11tab; } app.workspace.detachLeavesOfType('markdown'); if (window.__bx) pl.exportHost.desktop = window.__bx.real; return 1; })()`).catch(() => {});
}
const vault = (p) => Object.fromEntries(Object.entries(snap(p)).filter(([k]) => !/(^|\/)Snapshots\//.test(k) && !/^Exports\//.test(k)));
const order = (p, f = ROOT) => p.ev(`${B}.scenes(${file(f)}).map(f => f.path.slice(${f.length + 1}, -3))`);
const flushAll = (p) => saveAll(p);


// ---- shared steps ----
const BAR = `${VIEW}.findBar`, BARSEL = `${LEAF} .binders-view .binders-find`;
const DLG = '.modal.binders-folder-snapshots';
const noNotices = (p) => p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
async function ask(p, q, by = null) {
	await p.ev(`(async () => { const v = ${VIEW}; if (!v.findBar) v.showSearch(${by != null}); else if (${by != null}) v.findBar.setReplacing(true); const b = v.findBar; b.input.value = ${j(q)}; ${by != null ? `b.by.value = ${j(by)};` : ''} await b.search(); })().then(() => 1)`);
	await p.sleep(250);
}
const found = (p) => p.ev(`${BAR}.found.map(f => [f.source.file.path, f.hits.length])`);
const doneText = (p) => p.ev(`(() => { const e = document.querySelector(${j(BARSEL + ' .binders-find-done')}); return e && e.style.display !== 'none' ? e.textContent : null; })()`);
const reviewText = (p) => p.ev(`document.querySelector('.modal.binders-find-review')?.textContent ?? null`);
async function replaceAll(p, go = true, between = null) {
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(200);
	if (between) await between();
	if (go) await p.ev(`(() => { document.querySelector('.modal.binders-find-review button.mod-cta').click(); return 1; })()`);
	else { await p.key('Escape'); await p.sleep(300); }
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(300);
}
const snaps = (p, folder = ROOT) => p.ev(`${PL}.snapshotsApi.list(${file(folder)}).map(s => ({ title: s.title, auto: s.auto, name: s.file.name }))`);
const setTabs = (p, on) => p.ev(`(async () => { const pl = ${PL}; if (window.__qa11tab === undefined) window.__qa11tab = pl.settings.tabParagraphs; pl.settings.tabParagraphs = ${on}; await pl.saveSettings(); return 1; })()`);
/** The import, then the binder open as its manuscript. */
async function start(p, mode = 'manuscript') {
	await setTabs(p, true);
	await importNovel(p);
	await openView(p, ROOT);
	await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
	await (mode === 'manuscript' ? settle(p) : p.sleep(600));
}
/** Keys and text in one string: `<Tab>`, `<Enter>`, `<S-Tab>`, `<C-z>`; anything else is typed. */
async function keys(p, s) {
	for (const part of s.split(/(<[^>]+>)/).filter(Boolean)) {
		const m = /^<(?:(S|C|A)-)?([^>]+)>$/.exec(part);
		if (m) { await p.key(m[2], ...(m[1] ? [{ S: 'shift', C: 'ctrl', A: 'alt' }[m[1]]] : [])); await p.sleep(60); } else await p.type(part);
	}
	await p.sleep(250);
}
/** Real keys in the section's editor: the caret to the end of the note, then these keys. */
async function typeInto(p, path, text) {
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === ${j(path)}); s.el.scrollIntoView({ block: 'center' }); s.live.cm.focus(); s.live.cm.dispatch({ selection: { anchor: s.live.cm.state.doc.length } }); return 1; })()`);
	await p.sleep(250);
	await keys(p, text);
	await p.sleep(400);
}
/** "mara" in any case becomes Maren (what a query of Mara, match case off, does to a body). */
const maren = (s) => s.replace(/mara/gi, 'Maren');
const bodyOnly = (s) => s;
const F = (n) => `${ROOT}/${n}.md`;
const ARR = F('Part One/Arrival'), KEE = F('Part One/The keeper'), STO = F('Part One/Storm warning'), WRE = F('Part Two/The wreck'), LIG = F('Part Two/Lights out');
const NOTES5 = [ARR, KEE, STO, WRE, LIG];
const onlyDiff = (t, before, after, changes = {}) => {
	for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (k in changes) t.eq(after[k], changes[k], `“${k}” is what it should be`);
		else t.eq(after[k], before[k], `“${k}” is untouched, byte for byte`);
	}
};

// =====================================================================================================================
// Journey A: import, reorder on the corkboard, write with tabs, replace all with review + snapshot, show changes, undo, again
// =====================================================================================================================

test('journey A: import -> reorder on the corkboard -> type tab paragraphs -> Replace all -> Show changes -> Undo -> replace again, the disk checked at each step', async (p, h, t) => {
	await start(p, 'corkboard');
	const imported = vault(p);
	t.eq(j(await order(p)), j(['Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out']), 'imported in Scrivener’s order');
	// 1. reorder on the corkboard of Part One: Arrival one later, with Alt+Down
	await openView(p, `${ROOT}/Part One`);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(700);
	const c = await p.at(`${LEAF} .binders-card[data-path="${ARR}"]`);
	await p.click(c.x, c.t + 12);
	await p.key('ArrowDown', 'alt');
	await p.sleep(500);
	await saveAll(p);
	t.eq(j(await order(p)), j(['Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out']), 'Alt+Down moved Arrival one later in the binder’s order');
	onlyDiff(t, imported, vault(p), { [F('Novel')]: vault(p)[F('Novel')] });
	t.ok(/The keeper[\s\S]*Arrival/.test(vault(p)[F('Novel')]), 'the order is recorded in the binder’s note: ' + j(vault(p)[F('Novel')]));
	// 2. the manuscript, in the new order; type a tab paragraph with real keys into Arrival
	await openView(p, ROOT);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	t.eq(j(await p.ev(`${M}.scenes.map(s => s.file.basename)`)), j(['The keeper', 'Arrival', 'Storm warning', 'The wreck', 'Lights out']), 'the manuscript shows the new order');
	const pre = vault(p);
	await typeInto(p, ARR, '<Enter><Enter><Tab>Mara typed a tab paragraph. mara again.');
	await saveAll(p);
	await p.sleep(2200);
	const typed = disk(p, ARR);
	t.eq(typed, pre[ARR] + '\n\n\tMara typed a tab paragraph. mara again.', 'typed with real keys: the text and its tab are on disk, nothing else changed in the note');
	t.eq((typed.match(/^\t/gm) ?? []).length, 2, 'two tab-led paragraphs');
	const typedAll = vault(p);
	// 3. replace all, with the review
	await ask(p, 'Mara', 'Maren');
	const hits = await found(p);
	t.eq(j(hits.map((h) => h[0])), j([KEE, ARR, STO, WRE, LIG]), 'the notes with a match, in the binder’s (new) order');
	await noNotices(p);
	await replaceAll(p);
	await saveAll(p);
	const replaced = vault(p);
	const exp = {};
	for (const n of NOTES5) exp[n] = maren(typedAll[n]);
	onlyDiff(t, typedAll, replaced, exp);
	t.ok(/^Replaced \d+ in 5 notes\.Undo$/.test((await doneText(p)) ?? ''), 'the bar says what was done: ' + (await doneText(p)));
	const sn = await snaps(p);
	t.eq(sn.length, 1, 'one snapshot of the binder');
	t.ok(sn[0].auto && /Before replacing “Mara” with “Maren”/.test(sn[0].title), 'an automatic one, named for the replace: ' + sn[0].title);
	// the snapshot holds the text including what was typed (not what was on disk before the typing)
	const snapFile = sn[0].name;
	const snapText = await read(p, `${ROOT}/Snapshots/${snapFile}`);
	t.ok(snapText.includes('Mara typed a tab paragraph'), 'the snapshot holds the typed paragraph, as it was before the replace');
	// 4. Show changes in the snapshots window
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-binder-snapshots'); return 1; })()`);
	await until(p, `!!document.querySelector(${j(DLG)})`, 5000);
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-folder-snapshots-key')})`, 15000);
	await p.sleep(600);
	const key = await p.ev(`document.querySelector(${j(DLG + ' .binders-folder-snapshots-key')})?.textContent.trim() ?? ''`);
	t.ok(/5 notes? rewritten/.test(key), 'Show changes says the five notes were rewritten since the snapshot: ' + key);
	const rowsTxt = await p.ev(`[...document.querySelectorAll(${j(DLG + ' .binders-folder-snapshots-tree .tree-item-self')})].map(e => e.textContent)`);
	console.log('    changes tree: ' + j(rowsTxt));
	await p.key('Escape');
	await p.sleep(400);
	// 5. Undo from the bar
	await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')})?.click()`);
	await p.sleep(1200);
	await saveAll(p);
	await p.sleep(2200);
	onlyDiff(t, typedAll, vault(p));
	t.ok(/^Put back in 5 notes\.$/.test((await doneText(p)) ?? ''), 'Undo says: ' + (await doneText(p)));
	// 6. replace again, with a different name; the sections show the text, the snapshot count is two
	await ask(p, 'Mara', 'Mari');
	await replaceAll(p);
	await saveAll(p);
	const exp2 = {};
	for (const n of NOTES5) exp2[n] = typedAll[n].replace(/mara/gi, 'Mari');
	onlyDiff(t, typedAll, vault(p), exp2);
	const sn2 = await snaps(p);
	t.eq(sn2.length, 1, 'the binder is the same as at the first snapshot, so that one serves (and is named for this replace): ' + j(sn2.map((x) => x.title)));
	// 7. the editors in the manuscript show the replaced text, not stale text
	const shown = await p.ev(`${M}.scenes.map(s => [s.file.path, s.live?.cm?.state.doc.toString() ?? null])`);
	for (const [path, text] of shown) if (text != null) t.eq(text, split(exp2[path]).body === exp2[path] ? exp2[path] : exp2[path].replace(/^---\n[\s\S]*?\n---\n/, ''), `the section of ${path} shows what is on disk`);
});

// =====================================================================================================================
// Journey B: snapshot first; then split, replace, merge; bring the snapshot back; then export (DOCX and EPUB)
// =====================================================================================================================
const exportAs = async (p, kind) => {
	await openView(p, ROOT);
	await p.ev(`(() => { app.commands.executeCommandById('binders:export'); return 1; })()`);
	await until(p, `!!document.querySelector('${XWIN} .binders-export-paper .binders-export-section, ${XWIN} .binders-export-note > *')`, 8000);
	await p.sleep(200);
	if (kind !== 'Manuscript') { await xpick(p, kind); await p.sleep(500); }
	await xpress(p, 'Export');
	return saved(p, 15000);
};
const stripFront = (x) => x.replace(/^---\n[\s\S]*?\n---\n?/, '');
const exportedWords = (p, files) => words(files.flatMap((f) => stripFront(disk(p, f))).join(' '));
const bodiesInOrder = async (p) => (await p.ev(`${B}.scenes(${file(ROOT)}).map(f => f.path)`));

test('journey B: snapshot, split, replace, merge, bring the snapshot back, then export a Word file and an EPUB: no word lost and none invented, no note changed by the export', async (p, h, t) => {
	await start(p, 'manuscript');
	await standIn(p);
	const base = vault(p);
	const S = await p.ev(`${PL}.snapshotsApi.takeFolder(${file(ROOT)}, 'Imported').then(() => 1)`);
	// split Arrival in a tab of its own, at "A Maramures rug"
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(ARR)}).then(() => 1)`);
	await p.sleep(900);
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.focus(); const i = e.getValue().indexOf('A Maramures'); e.setCursor(e.offsetToPos(i)); return 1; })()`);
	await p.sleep(200);
	await noNotices(p);
	await p.ev(`(() => { app.commands.executeCommandById('binders:split-scene'); return 1; })()`);
	await p.sleep(1200);
	await saveAll(p);
	await p.sleep(1500);
	const afterSplit = vault(p);
	const newOnes = Object.keys(afterSplit).filter((k) => !(k in base));
	t.eq(newOnes.length, 1, 'split made one new note: ' + j(newOnes));
	const [second] = newOnes;
	const joined = (a, b) => stripFront(a).replace(/\n+$/, '') + '\n' + stripFront(b);
	t.eq(words(stripFront(afterSplit[ARR]) + ' ' + stripFront(afterSplit[second])).join(' '), words(stripFront(base[ARR])).join(' '), 'the two together are the text there was');
	t.ok(/rug lay by the door/.test(afterSplit[second]) && !/Maramures/.test(afterSplit[ARR]), 'the second holds the end, the first is cut there');
	t.ok((await bodiesInOrder(p)).includes(second) && (await bodiesInOrder(p)).indexOf(second) === (await bodiesInOrder(p)).indexOf(ARR) + 1, 'the new note is right after Arrival in the binder');
	// replace all over the split binder (the binder view in front)
	await openView(p, ROOT);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await ask(p, 'Mara', 'Maren');
	t.ok((await found(p)).some(([f]) => f === second), 'the new note is looked through');
	await replaceAll(p);
	await saveAll(p);
	const afterReplace = vault(p);
	t.eq(afterReplace[second], afterSplit[second].replace(/mara/gi, 'Maren'), 'the new note was replaced in');
	// merge the two halves again, on the corkboard of Part One
	await openView(p, `${ROOT}/Part One`);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(700);
	const ca = await p.at(`${LEAF} .binders-card[data-path="${ARR}"]`), cb = await p.at(`${LEAF} .binders-card[data-path="${second}"]`);
	await p.click(ca.x, ca.t + 12);
	await p.click(cb.x, cb.t + 12, { modifiers: 2 });
	await p.right(cb.x, cb.y);
	await p.sleep(300);
	t.ok((await menuItems(p)).includes('Merge 2 notes'), 'the menu offers to merge');
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge').click(); return 1; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(second)})`, 6000);
	await saveAll(p);
	await p.sleep(800);
	const merged = disk(p, ARR);
	t.eq(words(stripFront(merged)).join(' '), words(stripFront(afterReplace[ARR]) + ' ' + stripFront(afterReplace[second])).join(' '), 'merged: every word of both is in the first, in order');
	t.ok(!/Mara\b(?!mures)/.test(stripFront(merged)), 'and it is the replaced text');
	// bring the snapshot back: text and order, "everything"
	const r = await p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(ROOT)}).find(x => x.title === 'Imported'); const r = await ${PL}.snapshotsApi.back(s, ${file(ROOT)}, 'all', 'stay'); return 'ok ' + JSON.stringify([r.again, r.placed, r.files, r.ordered, r.gathered, r.left]); } catch (e) { return 'error ' + e.message; } })()`);
	console.log('    bring back: ' + r);
	t.ok(r.startsWith('ok'), 'bringing the snapshot back worked: ' + r);
	await p.sleep(1500);
	await saveAll(p);
	await p.sleep(1500);
	const back = vault(p);
	for (const n of NOTES5) t.eq(stripFront(back[n]), stripFront(base[n]), `“${n}” has the text it had in the snapshot, byte for byte`);
	t.eq(j(await order(p)), j(['Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out']), 'and the order');
	t.ok(!Object.entries(back).some(([k, v]) => k.startsWith(ROOT + '/') && !k.includes('Originals') && /Maren/.test(v)), 'no Maren is left anywhere');
	t.ok(await p.ev(`${PL}.snapshotsApi.list(${file(ROOT)}).some(x => x.auto && /Before bringing back/.test(x.title))`), 'what was there is kept in an automatic snapshot');
	// the manuscript in front shows what is on disk
	await openView(p, ROOT);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	const shown = await p.ev(`${M}.scenes.map(s => [s.file.path, s.live?.cm?.state.doc.toString() ?? null])`);
	for (const [path, text] of shown) if (text != null && back[path]) t.eq(text, stripFront(back[path]), `the section of ${path} shows what is on disk`);
	// export both
	const before = vault(p);
	t.ok(await exportAs(p, 'Manuscript'), 'the Word file was saved: ' + (await status(p)));
	await p.key('Escape'); await p.sleep(400);
	const d = docx(join(p.vaultDir, 'Exports', 'Novel.docx'));
	const want = exportedWords(p, await bodiesInOrder(p));
	t.eq(words(d.body.join(' ')).join(' '), want.join(' '), 'the Word file holds the notes’ words, in the binder’s order');
	t.ok(!/Originals|Imported from the Scrivener/.test(d.all), 'and not the binder note’s own words');
	t.ok(await exportAs(p, 'Ebook'), 'the EPUB was saved: ' + (await status(p)));
	await p.key('Escape'); await p.sleep(400);
	const e = epub(join(p.vaultDir, 'Exports', 'Novel.epub'));
	t.eq(words(e.body).join(' '), want.join(' '), 'the EPUB holds them too');
	const verdict = epubcheck(join(p.vaultDir, 'Exports', 'Novel.epub'));
	if (verdict !== null) t.eq(verdict, '', 'EPUBCheck passes it');
	onlyDiff(t, before, vault(p));
});

// =====================================================================================================================
// Seams: what is typed and not yet saved, meeting a snapshot, an export, a bring back
// =====================================================================================================================
const dirty = (p) => p.ev(`${M}.scenes.filter(s => s.live?.dirty).map(s => s.file.basename)`);

test('typed and not yet saved: a snapshot of the binder holds it, and an export made at once holds it (nothing a writer typed is left out)', async (p, h, t) => {
	await start(p, 'manuscript');
	await standIn(p);
	await typeInto(p, STO, '<Enter><Tab>Zebra crossed the shingle.');
	const d = await dirty(p);
	console.log('    dirty after typing: ' + j(d) + ' on disk has it: ' + disk(p, STO).includes('Zebra'));
	t.ok(d.includes('Storm warning') || disk(p, STO).includes('Zebra'), 'the typing is pending or already saved');
	// at once: a snapshot (the header command)
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(ROOT)}, 'Typed').then(() => 1)`);
	const snapFile = await p.ev(`${PL}.snapshotsApi.list(${file(ROOT)}).find(x => x.title === 'Typed').file.path`);
	t.ok((await read(p, snapFile)).includes('Zebra crossed the shingle.'), 'the snapshot has the typed line');
	// a second line, typed and then exported at once
	await typeInto(p, LIG, '<Enter><Enter><Tab>Quokka watched from the rocks.');
	t.ok(await exportAs(p, 'Manuscript'), 'saved: ' + (await status(p)));
	await p.key('Escape'); await p.sleep(400);
	const dx = docx(join(p.vaultDir, 'Exports', 'Novel.docx'));
	t.ok(dx.all.includes('Quokka watched from the rocks.'), 'the Word file has the line typed just before it');
	t.ok(dx.all.includes('Zebra crossed the shingle.'), 'and the earlier one');
	await saveAll(p);
	t.ok(disk(p, LIG).endsWith('\tQuokka watched from the rocks.'), 'and the note on disk ends with it, the tab kept');
});

test('typed and not yet saved, then Bring back: what was typed is in the automatic snapshot taken first, and the notes show the brought-back text', async (p, h, t) => {
	await start(p, 'manuscript');
	const base = vault(p);
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(ROOT)}, 'Imported').then(() => 1)`);
	await typeInto(p, KEE, '<Enter><Tab>Heron lifted off the water.');
	const r = await p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(ROOT)}).find(x => x.title === 'Imported'); const r = await ${PL}.snapshotsApi.back(s, ${file(ROOT)}, 'all', 'stay'); return 'ok'; } catch (e) { return 'error ' + e.message; } })()`);
	t.eq(r, 'ok', 'brought back');
	await p.sleep(1500);
	await saveAll(p);
	await p.sleep(2500);
	const auto = await p.ev(`${PL}.snapshotsApi.list(${file(ROOT)}).filter(x => x.auto).map(x => x.file.path)`);
	const hasTyped = (await Promise.all(auto.map((f) => read(p, f)))).some((x) => x.includes('Heron lifted off the water.'));
	t.ok(hasTyped, 'the automatic snapshot taken before bringing back holds the typed line');
	t.eq(disk(p, KEE), base[KEE], 'the note is as the snapshot had it, byte for byte');
	t.eq(await p.ev(`${M}.scenes.find(s => s.file.path === ${j(KEE)}).live?.cm.state.doc.toString()`), base[KEE], 'and the section shows that, so the typed line is not written back by the editor later');
	await p.sleep(3000);
	t.eq(disk(p, KEE), base[KEE], 'and stays so a few seconds later');
});

test('Replace all, then Bring back the snapshot it took, then the bar’s Undo: nothing is written over the brought-back text, and the bar says what it left', async (p, h, t) => {
	await start(p, 'manuscript');
	const base = vault(p);
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	const r = await p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(ROOT)}).find(x => x.auto && /Before replacing/.test(x.title)); await ${PL}.snapshotsApi.back(s, ${file(ROOT)}, 'all', 'stay'); return 'ok'; } catch (e) { return 'error ' + e.message; } })()`);
	t.eq(r, 'ok', 'brought back');
	await p.sleep(1200);
	await saveAll(p);
	onlyDiff(t, base, vault(p));
	await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')})?.click()`);
	await p.sleep(1200);
	await saveAll(p);
	await p.sleep(2200);
	onlyDiff(t, base, vault(p));
	console.log('    bar after: ' + (await doneText(p)));
	t.ok(!/Put back in [1-9]/.test((await doneText(p)) ?? ''), 'the bar does not claim it put anything back: ' + (await doneText(p)));
});

test('Replace all in one part, merge two of its notes in that same view, then the bar’s Undo: the merged-away note is not made again, nothing is lost, and the merge itself can be undone', async (p, h, t) => {
	await start(p, 'manuscript');
	await openView(p, `${ROOT}/Part One`);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(700);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	t.eq(j((await found(p)).map((x) => x[0])), j([ARR, KEE, STO]), 'the part’s own three notes');
	await replaceAll(p);
	await saveAll(p);
	const replaced = vault(p);
	onlyDiff(t, before, replaced, { [ARR]: maren(before[ARR]), [KEE]: maren(before[KEE]), [STO]: maren(before[STO]) });
	t.eq((await snaps(p, `${ROOT}/Part One`)).length + (await snaps(p, ROOT)).length >= 1, true, 'a snapshot was taken');
	const ca = await p.at(`${LEAF} .binders-card[data-path="${ARR}"]`), cb = await p.at(`${LEAF} .binders-card[data-path="${KEE}"]`);
	await p.click(ca.x, ca.t + 12);
	await p.click(cb.x, cb.t + 12, { modifiers: 2 });
	await p.right(cb.x, cb.y);
	await p.sleep(300);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge').click(); return 1; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(KEE)})`, 6000);
	await saveAll(p);
	await p.sleep(800);
	const merged = vault(p);
	t.ok(!(KEE in merged), 'the merged-away note is gone from the binder');
	t.eq(words(stripFront(merged[ARR])).join(' '), words(stripFront(replaced[ARR]) + ' ' + stripFront(replaced[KEE])).join(' '), 'the merged note holds both');
	// the bar's Undo now
	const had = await p.ev(`!!document.querySelector(${j(BARSEL + ' .binders-find-undo')})`);
	t.ok(had, 'the bar still offers Undo');
	await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')})?.click()`);
	await p.sleep(1200);
	await saveAll(p);
	await p.sleep(2200);
	const afterUndo = vault(p);
	t.ok(!(KEE in afterUndo), 'the merged-away note is not made again by Undo');
	t.eq(afterUndo[STO], before[STO], 'the untouched-since note is put back');
	console.log('    bar: ' + (await doneText(p)) + ' | merged note now: ' + j(afterUndo[ARR]));
	// nothing the writer wrote is gone: every word of the original two notes is somewhere
	const allWords = words(Object.entries(afterUndo).filter(([k]) => k.startsWith(ROOT + '/') && !k.includes('Originals')).map(([, v]) => v).join(' ')).map((w) => w.toLowerCase());
	for (const w of words(stripFront(before[KEE]))) if (!/^mara$/i.test(w)) t.ok(allWords.includes(w.toLowerCase()), `the word “${w}” of the merged-away note is still in the vault`);
});

test('rename a note in the middle of the journey: its links on tab-led lines follow (and no other line is touched); a snapshot shows the rename; Bring back puts the name and the text back', async (p, h, t) => {
	await start(p, 'manuscript');
	await p.ev(`(async () => { app.vault.setConfig('alwaysUpdateLinks', true); await app.vault.rename(${file('The Lighthouse/Part One/Storm warning.md')}, 'The Lighthouse/Part One/Squall.md'); return 1; })()`);
	await p.sleep(800);
	const plain = 'Plain: [[Storm warning]] and [[Storm warning|the storm]].\n\n\tTabbed: she watched [[Storm warning]] from the door.\n\n\tTabbed alias: [[Storm warning|that storm]] again.\n';
	await writeRaw(p, KEE, disk(p, KEE) + '\n' + plain);
	await p.sleep(1200);
	const base = vault(p);
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(ROOT)}, 'Before rename').then(() => 1)`);
	await p.ev(`(async () => { await app.fileManager.renameFile(${file(STO)}, ${j(F('Part One/Gale'))}); })().then(() => 1)`);
	await p.sleep(400);
	await p.ev(`${PL}.paragraphs.renamesSettled().then(() => 1)`);
	await p.sleep(500);
	await p.ev(`${PL}.paragraphs.renamesSettled().then(() => 1)`);
	await saveAll(p);
	await p.sleep(1500);
	const now = vault(p);
	const GALE = F('Part One/Gale');
	t.ok(GALE in now && !(STO in now), 'renamed on disk');
	const want = base[KEE].replaceAll('[[Storm warning]]', '[[Gale]]').replace('[[Storm warning|the storm]]', '[[Gale|the storm]]').replace('[[Storm warning|that storm]]', '[[Gale|that storm]]');
	t.eq(now[KEE], want, 'every link follows: the plain lines (Obsidian’s) and the tab-led lines (Binders’)');
	t.eq(now[GALE], base[STO], 'the renamed note’s text is untouched');
	t.ok(/Gale/.test(now[F('Novel')]) && !/Storm warning/.test(now[F('Novel')]), 'the binder’s order follows the new name');
	// a replace now, over the renamed note
	await openView(p, ROOT);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await ask(p, 'Tabbed', 'Tab-led');
	await replaceAll(p);
	await saveAll(p);
	t.eq(vault(p)[KEE], now[KEE].replaceAll('Tabbed', 'Tab-led'), 'Replace all over the renamed binder changes just the words');
	// the snapshot taken before the rename: show changes says "renamed", and bring it back
	const r = await p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(ROOT)}).find(x => x.title === 'Before rename'); const r = await ${PL}.snapshotsApi.back(s, ${file(ROOT)}, 'all', 'stay'); return 'ok ' + JSON.stringify([r.again, r.placed, r.files, r.ordered, r.gathered, r.left]); } catch (e) { return 'error ' + e.message; } })()`);
	console.log('    bring back after rename: ' + r);
	await p.sleep(1500);
	await saveAll(p);
	await p.sleep(1500);
	const back = vault(p);
	t.ok(r.startsWith('ok'), 'bring back worked: ' + r);
	t.ok(STO in back || GALE in back, 'the note is there, under one name');
	const nm = STO in back ? STO : GALE;
	t.eq(back[nm], base[STO], 'with the text it had');
	t.eq(stripFront(back[KEE]), stripFront(base[KEE]), 'The keeper has the text it had in the snapshot, links as they were');
	t.ok(await p.ev(`${B}.scenes(${file(ROOT)}).length`) === 5, 'five notes in the binder, no duplicate: ' + j(await order(p)));
});

// =====================================================================================================================
// Journey C: a Longform project, the same path (Index.md must keep everything but its scenes list)
// =====================================================================================================================
const LF = 'Longform demo', IDX = `${LF}/Index.md`;
const LFN = ['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return'].map((n) => `${LF}/${n}.md`);
const scenesBlockOf = (x) => { const m = /\n {2}scenes:\n((?: {4}.*\n)+)/.exec(x); return m ? m[1] : null; };
const restOfIndex = (x) => x.replace(/\n {2}scenes:\n(?: {4}.*\n)+/, '\n  scenes:\n');

test('journey C, a Longform project: reorder -> write -> Replace all -> split -> snapshot -> merge -> bring back -> export; Index.md keeps every property but its scenes list, and no note is lost', async (p, h, t) => {
	await setTabs(p, true);
	await standIn(p);
	await openView(p, LF);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(700);
	const base = vault(p);
	const idx0 = base[IDX];
	// reorder: Harbor one later
	const c = await p.at(`${LEAF} .binders-card[data-path="${LFN[0]}"]`);
	t.ok(!!c, 'the first card is there');
	await p.click(c.x, c.t + 12);
	await p.key('ArrowDown', 'alt');
	await p.sleep(500);
	await saveAll(p);
	const idx1 = disk(p, IDX);
	t.eq(restOfIndex(idx1), restOfIndex(idx0), 'Index.md: only the scenes list changed');
	console.log('    scenes: ' + j(scenesBlockOf(idx1)));
	t.ok(scenesBlockOf(idx1) !== scenesBlockOf(idx0), 'and it did change');
	// write in the manuscript
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	const ord = await p.ev(`${M}.scenes.map(s => s.file.path)`);
	t.eq(j(ord), j([LFN[1], LFN[0], LFN[2], LFN[3], LFN[4]].filter((x) => ord.includes(x))), 'the manuscript is in the new order: ' + j(ord));
	await typeInto(p, LFN[3], '<Enter><Tab>The ferry was late. Ferry, ferry.');
	await saveAll(p);
	await p.sleep(2200);
	t.ok(disk(p, LFN[3]).endsWith('Nobody met the ferry.\n\n\tThe ferry was late. Ferry, ferry.') || disk(p, LFN[3]).endsWith('Nobody met the ferry.\n\tThe ferry was late. Ferry, ferry.'), 'typed, with its tab: ' + j(disk(p, LFN[3])));
	const afterType = vault(p);
	// replace all ferry -> ship
	await ask(p, 'ferry', 'ship');
	console.log('    found: ' + j(await found(p)));
	await replaceAll(p);
	await saveAll(p);
	const rep = vault(p);
	const exp = {};
	for (const k of Object.keys(afterType)) if (k.startsWith(LF + '/') && k !== IDX && k !== `${LF}/Notes on ferries.md`) { const body = afterType[k].replace(/^---\n[\s\S]*?\n---\n/, ''); const front = afterType[k].slice(0, afterType[k].length - body.length); exp[k] = front + body.replace(/ferry/gi, 'ship'); }
	for (const k of Object.keys(exp)) if (exp[k] !== afterType[k]) t.eq(rep[k], exp[k], `${k}: just the words changed`);
	t.eq(rep[IDX].replace(/\n {2}scenes:\n(?: {4}.*\n)+/, ''), afterType[IDX].replace(/\n {2}scenes:\n(?: {4}.*\n)+/, ''), 'Index.md untouched by the replace (its title “The ferry” is a property)');
	t.eq(rep[`${LF}/Notes on ferries.md`], afterType[`${LF}/Notes on ferries.md`], 'an ignored file is not part of the project, so it is not replaced in');
	const sn = await snaps(p, LF);
	t.ok(sn.length >= 1 && sn[0].auto, 'a snapshot was taken first: ' + j(sn.map((x) => x.title)));
	// split The crossing, in a tab
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file(LFN[3])}).then(() => 1)`);
	await p.sleep(900);
	await p.ev(`(() => { const e = app.workspace.activeEditor.editor; e.focus(); const i = e.getValue().indexOf('The ship was late'); e.setCursor(e.offsetToPos(i)); return 1; })()`);
	await p.ev(`(() => { app.commands.executeCommandById('binders:split-scene'); return 1; })()`);
	await p.sleep(1500);
	await saveAll(p);
	await p.sleep(1500);
	const afterSplit = vault(p);
	const added = Object.keys(afterSplit).filter((k) => !(k in rep));
	t.eq(added.length, 1, 'split made one note: ' + j(added));
	const idx2 = afterSplit[IDX];
	t.eq(restOfIndex(idx2), restOfIndex(idx1), 'Index.md: still only the scenes list differs');
	t.ok(added[0] && idx2.includes(added[0].slice(LF.length + 1, -3)), 'the new scene is in the scenes list: ' + j(scenesBlockOf(idx2)));
	// take a snapshot of the project, change, bring back
	await p.ev(`${PL}.snapshotsApi.takeFolder(${file(LF)}, 'Split').then(() => 1)`);
	await ask(p, 'ship', 'boat');
	await replaceAll(p);
	await saveAll(p);
	const r = await p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(LF)}).find(x => x.title === 'Split'); const r = await ${PL}.snapshotsApi.back(s, ${file(LF)}, 'all', 'stay'); return 'ok ' + JSON.stringify([r.again, r.placed, r.files, r.ordered, r.gathered, r.left]); } catch (e) { return 'error ' + e.message; } })()`);
	console.log('    bring back: ' + r);
	t.ok(r.startsWith('ok'), 'brought back');
	await p.sleep(1500);
	await saveAll(p);
	await p.sleep(1500);
	const back = vault(p);
	for (const k of Object.keys(afterSplit)) if (k.startsWith(LF + '/')) t.eq(back[k], afterSplit[k], `${k}: as it was when the snapshot was taken, byte for byte`);
	// export
	t.ok(await exportAsOf(p, LF, 'Manuscript'), 'Word saved: ' + (await status(p)));
	await p.key('Escape'); await p.sleep(400);
	const d = docx(join(p.vaultDir, 'Exports', 'Longform demo.docx')).all;
	const wordsWant = words(stripFront(afterSplit[LFN[0]]) + ' ' + stripFront(afterSplit[LFN[1]]));
	for (const w of ['harbor', 'smelled', 'clerk', 'crossing']) void w;
	t.ok(/diesel and rope/.test(d) && /Nobody met the ship/.test(d), 'the Word file has the scenes’ words');
	t.ok(!/Notes on ferries|Nobody met the ferry/.test(d), 'and not the ignored note');
	void wordsWant;
	t.ok(await exportAsOf(p, LF, 'Ebook'), 'EPUB saved: ' + (await status(p)));
	await p.key('Escape'); await p.sleep(400);
	const e = epub(join(p.vaultDir, 'Exports', 'Longform demo.epub'));
	t.ok(/diesel and rope/.test(e.body), 'the EPUB has them too');
	const verdict = epubcheck(join(p.vaultDir, 'Exports', 'Longform demo.epub'));
	if (verdict !== null) t.eq(verdict, '', 'EPUBCheck passes');
	onlyDiff(t, back, vault(p));
});
async function exportAsOf(p, folder, kind) {
	await openView(p, folder);
	await p.ev(`(() => { app.commands.executeCommandById('binders:export'); return 1; })()`);
	await until(p, `!!document.querySelector('${XWIN} .binders-export-paper .binders-export-section, ${XWIN} .binders-export-note > *')`, 8000);
	await p.sleep(200);
	if (kind !== 'Manuscript') { await xpick(p, kind); await p.sleep(500); }
	await xpress(p, 'Export');
	return saved(p, 15000);
}

// =====================================================================================================================
// Journey D: the same path on the emulated phone (touch only)
// =====================================================================================================================
async function tapSel(p, sel, text = null) {
	const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.getBoundingClientRect().width && (${j(text)} === null || e.textContent.trim() === ${j(text)})).pop(); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`, 4000);
	if (!at) throw new Error(`nothing to tap: ${sel} ${text ?? ''}`);
	await p.sleep(200);
	await tap(p, at.x, at.y);
}

test('journey D, on a phone: import a zipped project, Replace all by touch (review, Undo), a binder snapshot, Bring back, then an EPUB; the files are right at each step and nothing is logged', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await setTabs(p, true);
		await importNovel(p);
		const imported = vault(p);
		t.eq(j(await order(p)), j(['Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out']), 'imported on the phone, in Scrivener’s order');
		await openView(p, ROOT);
		await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
		await settle(p);
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		// the way in on a phone: the view's menu
		await tapSel(p, `${LEAF} .view-action[aria-label="More options"]`);
		const items = await menuItems(p);
		t.ok(items.includes('Find and replace in binder'), 'the view’s menu offers Find and replace in binder: ' + items.join(' | '));
		await menuTap(p, 'Find and replace in binder');
		await p.sleep(500);
		t.ok(await p.ev(`!!${BAR}`), 'the bar is open');
		await ask(p, 'Mara', 'Maren');
		const bar = await p.ev(`(() => { const r = document.querySelector(${j(BARSEL)}).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth]; })()`);
		t.ok(bar[0] >= 0 && bar[1] <= bar[2], 'the bar fits the screen: ' + j(bar));
		await tapSel(p, `${BARSEL} button[aria-label="Replace all..."]`);
		t.ok(await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000), 'the review is up');
		const fits = await p.ev(`(() => { const m = document.querySelector('.modal.binders-find-review').getBoundingClientRect(); return [Math.round(m.left), Math.round(m.right), innerWidth, Math.round(m.top), Math.round(m.bottom), innerHeight]; })()`);
		t.ok(fits[0] >= 0 && fits[1] <= fits[2] && fits[4] <= fits[5] + 1, 'the review fits the screen: ' + j(fits));
		await tapSel(p, '.modal.binders-find-review button.mod-cta');
		await p.ev(`window.__all?.then(() => 1)`);
		await p.sleep(1200);
		await saveAll(p);
		await p.sleep(1500);
		const rep = vault(p);
		const exp = {};
		for (const n of NOTES5) exp[n] = maren(imported[n]);
		onlyDiff(t, imported, rep, exp);
		t.ok(/^Replaced \d+ in 5 notes\.Undo$/.test((await doneText(p)) ?? ''), 'the bar says so: ' + (await doneText(p)));
		await tapSel(p, `${BARSEL} .binders-find-undo`);
		await p.sleep(1500);
		await saveAll(p);
		await p.sleep(2200);
		onlyDiff(t, imported, vault(p));
		// a snapshot of the binder, then bring it back after a second replace
		await p.ev(`${PL}.snapshotsApi.takeFolder(${file(ROOT)}, 'On the phone').then(() => 1)`);
		await ask(p, 'keeper', 'warden');
		await tapSel(p, `${BARSEL} button[aria-label="Replace all..."]`);
		await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
		await tapSel(p, '.modal.binders-find-review button.mod-cta');
		await p.ev(`window.__all?.then(() => 1)`);
		await p.sleep(1200);
		await saveAll(p);
		t.ok(disk(p, KEE).includes('The warden said nothing'), 'the second replace is on disk');
		const r = await p.ev(`(async () => { try { const s = ${PL}.snapshotsApi.list(${file(ROOT)}).find(x => x.title === 'On the phone'); await ${PL}.snapshotsApi.back(s, ${file(ROOT)}, 'all', 'stay'); return 'ok'; } catch (e) { return 'error ' + e.message; } })()`);
		t.eq(r, 'ok', 'brought back');
		await p.sleep(1500);
		await saveAll(p);
		await p.sleep(2000);
		onlyDiff(t, imported, vault(p));
		// export an EPUB on the phone
		await p.ev(`(() => { ${VIEW}.findBar?.close(); return 1; })()`);
		await p.ev(`(() => { app.commands.executeCommandById('binders:export'); return 1; })()`);
		await until(p, `!!document.querySelector('${XWIN} [role="option"]')`, 6000);
		await p.sleep(500);
		await tapSel(p, `${XWIN} [role="option"]`, 'Ebook');
		await p.sleep(500);
		await tapSel(p, `${XWIN} button`, 'Export');
		t.ok(await until(p, `app.vault.adapter.exists('Exports/Novel.epub')`, 10000), 'the EPUB is in Exports');
		await p.sleep(500);
		const e = epub(join(p.vaultDir, 'Exports', 'Novel.epub'));
		t.eq(words(e.body).join(' '), words(NOTES5.map((n) => stripFront(imported[n])).join(' ')).join(' '), 'word for word, in the binder’s order');
		const verdict = epubcheck(join(p.vaultDir, 'Exports', 'Novel.epub'));
		if (verdict !== null) t.eq(verdict, '', 'EPUBCheck passes it');
		onlyDiff(t, imported, vault(p));
	});
});

// =====================================================================================================================
// Seams in the editor: undo order
// =====================================================================================================================
test('type in a section, Replace all, type again, then Ctrl+Z three times: each step goes back in order (typing, the replace as one step, typing), the disk follows each, and a fourth Ctrl+Z writes nothing', async (p, h, t) => {
	await start(p, 'manuscript');
	const base = vault(p);
	await typeInto(p, ARR, '<Enter><Tab>Mara one.');
	await saveAll(p);
	const s1 = disk(p, ARR);
	t.eq(s1, base[ARR] + '\n\tMara one.', 'typed');
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	const s2 = disk(p, ARR);
	t.eq(s2, maren(s1), 'replaced');
	await typeInto(p, ARR, ' Then more.');
	await saveAll(p);
	await p.sleep(1500);
	const s3 = disk(p, ARR);
	t.eq(s3, s2 + ' Then more.', 'typed after the replace');
	await p.ev(`(() => { ${M}.scenes.find(s => s.file.path === ${j(ARR)}).live.cm.focus(); return 1; })()`);
	const step = async (want, what) => { await p.key('z', 'ctrl'); await p.sleep(600); await saveAll(p); await p.sleep(2200); t.eq(disk(p, ARR), want, what); };
	await step(s2, 'Ctrl+Z: the typing after the replace is gone, the replace stays');
	await step(s1, 'Ctrl+Z: the replace is taken back, as one step, with the first typing still there');
	await step(base[ARR] + '\n', 'Ctrl+Z: the first typing, down to the paragraph break');
	const other = vault(p);
	await p.key('z', 'ctrl'); await p.sleep(600); await saveAll(p); await p.sleep(2000);
	for (const n of NOTES5) if (n !== ARR) t.eq(vault(p)[n], other[n], `${n}: another Ctrl+Z in Arrival wrote nothing here`);
	console.log('    bar after editor undo: ' + (await doneText(p)));
});

nit('the bar’s Undo after the notes were already put back some other way does not claim they were “changed since”', async (p, h, t) => {
	await start(p, 'manuscript');
	await ask(p, 'Mara', 'Maren');
	await replaceAll(p);
	await saveAll(p);
	// each note put back by its own editor's undo
	for (const n of NOTES5) { await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === ${j(n)}); s.live.cm.focus(); return 1; })()`); await p.key('z', 'ctrl'); await p.sleep(300); }
	await saveAll(p);
	await p.sleep(2200);
	t.ok(!disk(p, ARR).includes('Maren'), 'every note was put back by Ctrl+Z');
	await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')})?.click()`);
	await p.sleep(1200);
	const said = (await doneText(p)) ?? '';
	t.ok(!/changed since/.test(said), 'the bar says nothing about “changed since” when the text is what Undo would have made it: ' + said);
});
