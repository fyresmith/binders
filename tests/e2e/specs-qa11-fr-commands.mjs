// QA round 11: find and replace, the commands and their lifecycle. The palette and Obsidian's own search keys (Ctrl+F,
// Ctrl+H, Ctrl+Alt+Enter) with a binder view in front in each mode; a read-only binder and a Longform project by keys; a
// folder that can't have snapshots; the plugin switched off and on with the bar open; a tab closed or left with the bar
// open; two binder views side by side, each with a bar; a folder renamed or deleted in the file explorer with the bar open.
// Tests named "find and replace commands: …". Not repeated from specs-find-replace.mjs: its programmatic checks of the
// matches and of each replace; these drive the keys and the lifecycle around them.
import { PL, VIEW, file, j, openView, until, withTidy } from './view-helpers.mjs';
import { LEAF, binder, disk, saveAll, settle, snap, M } from './specs-qa5-manuscript.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'find and replace commands: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });

// ---- helpers ----
const BAR = `${VIEW}.findBar`;
const BARSEL = `${LEAF} .binders-view .binders-find`;
const INPUT = `${BARSEL} .document-search-input input`;
const BYIN = `${BARSEL} .document-replace-input`;

async function closeAll(p) {
	await p.ev(`(() => { try { ${BAR}?.close(); } catch {} document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); return 1; })()`).catch(() => {});
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); document.querySelectorAll('.prompt').forEach(m => m.closest('.modal-container')?.remove()); return 1; })()`).catch(() => {});
	// (a plugin switched off by a failing test is switched on again, for the tests that come after)
	await p.ev(`(async () => { if (!app.plugins.plugins.binders) await app.plugins.enablePlugin('binders'); await app.plugins.plugins.binders.binders.ready; })().then(() => 1)`).catch(() => {});
}
const countText = (p) => p.ev(`document.querySelector(${j(BARSEL + ' .document-search-count')})?.textContent ?? null`);
const doneText = (p) => p.ev(`(() => { const e = document.querySelector(${j(BARSEL + ' .binders-find-done')}); return e && e.style.display !== 'none' ? e.textContent : null; })()`);
const barOpen = (p) => p.ev(`!!document.querySelector(${j(BARSEL)})`);
const replaceRow = (p) => p.ev(`!!document.querySelector(${j(BARSEL + '.mod-replace-mode')})`);
const reviewOpen = (p) => p.ev(`!!document.querySelector('.modal.binders-find-review')`);
const total = (p) => p.ev(`${BAR} ? ${BAR}.found.reduce((n, f) => n + f.hits.length, 0) : null`);
const vault = (p) => Object.fromEntries(Object.entries(snap(p)).filter(([k]) => !/(^|\/)Snapshots\//.test(k)));
const snapshotsOf = (p, folder) => p.ev(`${PL}.snapshotsApi.list(${file(folder)}).map(s => ({ title: s.title, auto: s.auto }))`);
const focusBody = (p) => p.ev(`(() => { document.activeElement?.blur?.(); return 1; })()`);
const focusField = (p, sel = INPUT) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (e) e.focus(); return !!e; })()`);
/** Puts the keyboard where a writer has it before Ctrl+F: in a section's text, else on a card, a row or a section. */
async function focusIn(p) {
	const did = await p.ev(`(() => { const s = ${M}?.scenes?.find(s => s.live); if (s) { s.live.cm.focus(); return true; } return false; })()`);
	if (did) return;
	const at = await p.at(`${LEAF} .binders-card[data-path], ${LEAF} .binders-outliner-row[data-path], ${LEAF} .binders-manuscript-scene`);
	if (at) await p.click(at.x, at.y);
	await p.sleep(200);
}
/** What a writer does to find: Ctrl+F from where they are, then the words. */
async function findWith(p, q) {
	if (!(await barOpen(p))) { await focusIn(p); await p.key('f', 'ctrl'); await p.sleep(300); }
	await p.type(q);
	await p.sleep(500);
}
/** Onlythese: every file of `before` is byte for byte as it was, but for the ones in `changes`. */
function onlyThese(t, before, after, changes = {}) {
	for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (k in changes) t.eq(after[k], changes[k], `“${k}” is exactly what the replace should have made it`);
		else t.eq(after[k], before[k], `“${k}” is untouched, byte for byte`);
	}
}

const ONE = '---\nstatus: draft\nsynopsis: Mara in the synopsis.\n---\nMara came. Mara waved.\n';
const TWO = '---\nstatus: idea\nsynopsis: Mara again.\n---\nOnly Mara here.\n';
const ONE_MAREN = ONE.replace('Mara came. Mara waved.', 'Maren came. Maren waved.');
const TWO_MAREN = TWO.replace('Only Mara here.', 'Only Maren here.');

/** A binder of two notes, open in the view in `mode`. Three matches for “Mara” in two notes (the synopses are not looked through). */
async function mixed(p, name = 'Find', mode = 'manuscript') {
	await binder(p, name, { '1 One': ONE, '2 Two': TWO });
	await openView(p, name);
	await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
	if (mode === 'manuscript') await settle(p);
	else await p.sleep(900);
}

// =====================================================================================================================
// The plugin switched off and on, the bar open
// =====================================================================================================================

test('the plugin switched off with the bar open takes the bar and the view away with no error, leaves Obsidian’s own bar working, and switched on again the binder finds as before', async (p, h, t) => {
	await mixed(p);
	await findWith(p, 'Mara');
	t.eq(await countText(p), '1 / 3 in 2 notes', 'before: the bar counts three');
	try {
		await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
		await p.sleep(900);
		t.eq(await p.ev(`document.querySelectorAll('.binders-find, .binders-view').length`), 0, 'the bar and the view are gone from the page');
		t.eq(await p.ev(`document.querySelectorAll('.is-finding').length`), 0, 'no class of the bar is left on the page');
		// Obsidian's own bar, in a note, works now (a stale Binders scope would swallow the keys)
		await p.ev(`app.workspace.getLeaf(false).openFile(${file('Find/1 One.md')}).then(() => 1)`);
		await p.sleep(900);
		await p.key('f', 'ctrl');
		await p.sleep(400);
		t.ok(await p.ev(`!!document.querySelector('.document-search-container:not(.binders-find) input')`), 'Ctrl+F in a note opens Obsidian’s own bar');
		await p.type('Mara');
		await p.sleep(300);
		t.eq(await p.ev(`document.querySelector('.document-search-container:not(.binders-find) input').value`), 'Mara', 'and its field takes the keys');
		await p.key('Escape');
		await p.sleep(300);
		await p.ev(`(async () => { await app.plugins.enablePlugin('binders'); await app.plugins.plugins.binders.binders.ready; })().then(() => 1)`);
		await p.sleep(900);
		await openView(p, 'Find');
		await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
		await settle(p);
		await findWith(p, 'Mara');
		t.eq(await countText(p), '1 / 3 in 2 notes', 'switched on again, the bar counts the same three');
	} finally {
		await p.ev(`(async () => { if (!app.plugins.plugins.binders) await app.plugins.enablePlugin('binders'); await app.plugins.plugins.binders.binders.ready; })().then(() => 1)`).catch(() => {});
		await p.sleep(400);
	}
});

// =====================================================================================================================
// A folder renamed or deleted in the file explorer, with the bar open
// =====================================================================================================================

test('a folder renamed in the file explorer with the bar open: the bar stays open, and its count keeps the writer’s place (it says 0 / 3 after the rename)', async (p, h, t) => {
	await mixed(p);
	await findWith(p, 'Mara');
	const c0 = await countText(p);
	await p.ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Find'), 'Found'); })().then(() => 1)`);
	await p.sleep(900);
	t.ok(await barOpen(p), 'the bar stays open');
	t.eq(await total(p), 3, 'and still finds the three matches in the renamed folder');
	t.eq(await countText(p), c0, 'the count reads as before the rename: ' + c0 + ' (it says where the writer is, and the writer was on the first)');
	t.eq(await p.ev(`${VIEW}.folder?.path`), 'Found', 'the view is on the folder’s new name');
});

test('a folder renamed in the file explorer with the bar open: Ctrl+Alt+Enter replaces in the new folder, and the old folder is not made again', async (p, h, t) => {
	await mixed(p);
	await findWith(p, 'Mara');
	await p.ev(`(async () => { await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Find'), 'Found'); })().then(() => 1)`);
	await p.sleep(900);
	await p.key('h', 'ctrl');
	await p.sleep(400);
	await focusField(p, BYIN);
	await p.type('Maren');
	await p.sleep(200);
	await focusField(p);
	await p.key('Enter', 'ctrl', 'alt');
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(300);
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.sleep(1200);
	await saveAll(p);
	t.eq(disk(p, 'Found/1 One.md'), ONE_MAREN, 'the first note in the new folder is replaced, byte for byte');
	t.eq(disk(p, 'Found/2 Two.md'), TWO_MAREN, 'and the second');
	t.ok(!(await p.ev(`app.vault.adapter.exists('Find')`)), 'the old folder is not made again');
	t.ok(!(await p.ev(`app.vault.adapter.exists('Find/1 One.md')`)), 'nor its note');
	const s = await snapshotsOf(p, 'Found');
	t.ok(s.length === 1 && s[0].auto, 'a snapshot of the folder, in its new place: ' + j(s));
});

test('a folder deleted in the file explorer with the bar open: Ctrl+Alt+Enter brings it back to no folder and writes no note', async (p, h, t) => {
	await mixed(p, 'Gone');
	await findWith(p, 'Mara');
	t.ok(await barOpen(p), 'the bar is open with its matches');
	await p.ev(`(async () => { await app.vault.delete(app.vault.getAbstractFileByPath('Gone'), true); })().then(() => 1)`);
	await p.sleep(900);
	await p.key('h', 'ctrl');
	await p.sleep(400);
	await focusField(p, BYIN);
	await p.type('Maren');
	await p.sleep(200);
	await focusField(p);
	await p.key('Enter', 'ctrl', 'alt');
	await p.sleep(800);
	if (await reviewOpen(p)) await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.sleep(1200);
	await saveAll(p);
	t.ok(!(await p.ev(`app.vault.adapter.exists('Gone')`)), 'the folder is not made again');
	const leftover = Object.keys(vault(p)).filter((k) => k.startsWith('Gone/'));
	t.eq(leftover.length, 0, 'and no note is written under it: ' + j(leftover));
});

// =====================================================================================================================
// Two binder views side by side, each with a bar
// =====================================================================================================================

test('two binder views side by side, each with its own bar: each counts its own, the marks stay in their view, and closing one bar leaves the other', async (p, h, t) => {
	await mixed(p, 'Find', 'manuscript');
	// the second view in a split beside the first (openBinder takes 'split' as a pane type)
	await p.ev(`(async () => { await ${PL}.openBinder(${file('The Lighthouse')}, 'split'); })().then(() => 1)`);
	await p.sleep(1200);
	const leafOf = (folder) => `app.workspace.getLeavesOfType('binders-view').find(l => l.view.folder?.path === ${j(folder)})`;
	await p.ev(`(() => { ${leafOf('The Lighthouse')}.view.setMode('corkboard'); return 1; })()`);
	await p.sleep(900);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 2, 'two binder views are open');
	t.ok(await p.ev(`${leafOf('The Lighthouse')} !== undefined && ${leafOf('Find')} !== undefined`), 'one of each folder');
	// the one on the right (Find, the split): a bar with Mara
	await p.ev(`(() => { ${leafOf('Find')}.view.showSearch(false); return 1; })()`);
	await p.sleep(300);
	await p.type('Mara');
	await p.sleep(500);
	// the other (the corkboard): a bar with a word of its own
	await p.ev(`(() => { ${leafOf('The Lighthouse')}.view.showSearch(false); return 1; })()`);
	await p.sleep(300);
	await p.type('jetty');
	await p.sleep(500);
	const both = await p.ev(`[...document.querySelectorAll('.binders-find')].length`);
	t.eq(both, 2, 'each view has its bar');
	const counts = await p.ev(`(() => ({ find: ${leafOf('Find')}.view.findBar?.found.reduce((n, f) => n + f.hits.length, 0), lighthouse: ${leafOf('The Lighthouse')}.view.findBar?.found.reduce((n, f) => n + f.hits.length, 0) }))()`);
	t.eq(j(counts), j({ find: 3, lighthouse: 1 }), 'each counts its own query only: ' + j(counts));
	const marksIn = await p.ev(`(() => { const lit = [...document.querySelectorAll('.is-find-hit, .is-find-miss')]; const home = ${leafOf('The Lighthouse')}.containerEl; return [lit.length, lit.filter(e => home.contains(e)).length]; })()`);
	t.eq(marksIn[0], marksIn[1], 'the marks on the cards are all in the corkboard’s view: ' + j(marksIn));
	// Escape in the left one's bar closes only that bar
	await p.ev(`(() => { ${leafOf('The Lighthouse')}.view.findBar.el.querySelector('.document-search-input input').focus(); return 1; })()`);
	await p.sleep(200);
	await p.key('Escape');
	await p.sleep(400);
	t.eq(await p.ev(`${leafOf('The Lighthouse')}.view.findBar`), null, 'Escape closes the corkboard’s bar');
	t.ok(await p.ev(`!!${leafOf('Find')}.view.findBar && !!${leafOf('Find')}.view.findBar.el.isConnected`), 'the other view’s bar is still open');
	t.eq(await p.ev(`document.querySelectorAll('.is-find-hit, .is-find-miss').length`), 0, 'and the corkboard’s marks are gone with it');
});

// =====================================================================================================================
// A tab closed or left with the bar open
// =====================================================================================================================

test('a binder tab closed with the bar open: its marks and bar go with it, the next Ctrl+F in a new view starts empty, and Obsidian’s bar still opens in a note', async (p, h, t) => {
	await mixed(p, 'Find', 'corkboard');
	await findWith(p, 'Mara');
	t.ok(await p.ev(`document.querySelectorAll('.binders-card.is-find-hit, .binders-card.is-find-miss').length`) > 0, 'the cards are marked');
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(l, { focus: true }); l.tabHeaderEl?.querySelector('.workspace-tab-header-inner-close-button')?.click(); return 1; })()`);
	await p.sleep(700);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 0, 'the tab is closed');
	t.eq(await p.ev(`document.querySelectorAll('.binders-find, .is-find-hit, .is-find-miss, .binders-find-excerpt').length`), 0, 'nothing of the bar or its marks is left on the page');
	t.eq(await p.ev(`document.querySelectorAll('.is-finding').length`), 0, 'and nothing says it is finding');
	await p.ev(`app.workspace.getLeaf(false).openFile(${file('Find/1 One.md')}).then(() => 1)`);
	await p.sleep(900);
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector('.document-search-container:not(.binders-find)') && !document.querySelector('.binders-find')`), 'Ctrl+F in the note opens Obsidian’s own bar, not a stale one of ours');
	await p.key('Escape');
	await p.sleep(200);
	await openView(p, 'Find');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelector(${j(INPUT)})?.value ?? null`), '', 'a new bar starts with no query');
});

test('switching to a note in another tab with the bar open: the bar keeps its query, what is typed in the note is not typed in the bar, and the bar counts it when back', async (p, h, t) => {
	await mixed(p);
	await findWith(p, 'Mara');
	const t0 = await total(p);
	t.eq(t0, 3, 'three matches before');
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file('Find/2 Two.md')}).then(() => 1)`);
	await p.sleep(900);
	await p.ev(`(() => { const e = app.workspace.activeEditor?.editor; e?.focus?.(); return !!e; })()`);
	await p.key('End', 'ctrl');
	await p.type(' Mara typed.');
	await p.sleep(300);
	await p.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('markdown')) await l.view.save?.(); })().then(() => 1)`);
	await p.sleep(2200);
	await p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(l, { focus: true }); return 1; })()`);
	await p.sleep(900);
	t.ok(await barOpen(p), 'the bar is still open in its tab');
	t.eq(await p.ev(`document.querySelector(${j(INPUT)})?.value ?? null`), 'Mara', 'with its query, and the typing in the note went to the note');
	t.ok(disk(p, 'Find/2 Two.md').includes(' Mara typed.'), 'the note has the typing on disk');
	t.eq(await total(p), 4, 'the bar counts the typed word too, when it is back: ' + (await total(p)));
	t.eq(await countText(p), '1 / 4 in 2 notes', 'the count says so');
});

// =====================================================================================================================
// The keys in the boards and the manuscript, the replace row, the Enter of replace all
// =====================================================================================================================

test('Ctrl+F with a card or a row in front opens Binders’ bar over the folder, in the corkboard and in the outliner; Ctrl+H does nothing there, as documented (the palette has the replace row)', async (p, h, t) => {
	await mixed(p);
	for (const mode of ['corkboard', 'outliner']) {
		await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
		await p.sleep(900);
		await focusIn(p);
		await p.key('f', 'ctrl');
		await p.sleep(400);
		t.ok(await barOpen(p), `Ctrl+F opens the bar in the ${mode}`);
		await p.type('Mara');
		await p.sleep(500);
		t.eq(await countText(p), '3 in 2 notes', `the bar counts the matches in the ${mode}`);
		await p.key('Escape');
		await p.sleep(300);
		// Obsidian's “Search & replace” needs an editor in source mode in front; a board has none (docs/dev/internals.md, "Find and replace")
		await focusIn(p);
		await p.key('h', 'ctrl');
		await p.sleep(400);
		t.ok(!(await barOpen(p)), `Ctrl+H in the ${mode}: no bar, as documented (activeEditor is ${await p.ev('app.workspace.activeEditor ? "set" : "null"')})`);
		await p.ev(`(() => { app.commands.executeCommandById('binders:find-replace'); return 1; })()`);
		await p.sleep(400);
		t.ok((await barOpen(p)) && (await replaceRow(p)), `and the palette’s “Find and replace in binder” gives the replace row in the ${mode}`);
		await p.key('Escape');
		await p.sleep(300);
	}
});

test('in the manuscript: Ctrl+F takes the selected word as its query; Ctrl+H with the caret in a section opens the replace row; Ctrl+Alt+Enter asks first and Escape changes no byte; Ctrl+Alt+Enter and Replace then change only the matches', async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === 'Find/1 One.md'); s.live.cm.focus(); const doc = s.live.cm.state.doc.toString(); const i = doc.indexOf('Mara came'); s.live.cm.dispatch({ selection: { anchor: i, head: i + 4 } }); return 1; })()`);
	await p.sleep(200);
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelector(${j(INPUT)})?.value ?? null`), 'Mara', 'the selected word is the query');
	await p.key('Escape');
	await p.sleep(300);
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === 'Find/1 One.md'); s.live.cm.focus(); s.live.cm.dispatch({ selection: { anchor: s.live.cm.state.doc.length } }); return 1; })()`);
	await p.key('h', 'ctrl');
	await p.sleep(400);
	t.ok(await replaceRow(p), 'Ctrl+H with the caret in a section opens the replace row');
	await focusField(p, BYIN);
	await p.type('Maren');
	await p.sleep(200);
	await focusField(p, INPUT);
	await p.type('Mara');
	await p.sleep(400);
	await focusField(p, INPUT);
	await p.key('Enter', 'ctrl', 'alt');
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	t.ok(await reviewOpen(p), 'Ctrl+Alt+Enter asks first');
	await p.key('Escape');
	await p.sleep(500);
	await saveAll(p);
	onlyThese(t, before, vault(p));
	await focusField(p, INPUT);
	await p.key('Enter', 'ctrl', 'alt');
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(300);
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.sleep(1000);
	await saveAll(p);
	t.eq(disk(p, 'Find/1 One.md'), ONE_MAREN, 'the second time, the confirmed replace changes the first note’s matches only');
	t.eq(disk(p, 'Find/2 Two.md'), TWO_MAREN, 'and the second note’s');
	t.ok(/^Replaced 3 in 2 notes\.Undo$/.test((await doneText(p)) ?? ''), 'the bar says so, with Undo: ' + (await doneText(p)));
});

// =====================================================================================================================
// A binder that can't be replaced in, by keys
// =====================================================================================================================

test('a binder in a newer format, by keys: Ctrl+H opens the bar with no replace row and says why; Ctrl+Alt+Enter asks nothing and changes no byte; Ctrl+F still finds', async (p, h, t) => {
	await mixed(p, 'Newer');
	await p.ev(`(async () => { await app.vault.adapter.write('Newer/Newer.md', '---\\nbinder: 99\\ncontents:\\n  - 1 One\\n  - 2 Two\\n---\\nA newer binder.\\n'); })().then(() => 1)`);
	await p.sleep(900);
	await openView(p, 'Newer');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	const before = vault(p);
	const box = await p.at(`${LEAF} .binders-view`);
	if (box) await p.click(box.l + 6, box.t + 6);
	await p.sleep(200);
	await p.key('f', 'ctrl');
	await p.sleep(300);
	await p.type('Mara');
	await p.sleep(500);
	const diag = await p.ev(`(() => { const a = app.workspace.activeEditor; const l = app.workspace.activeLeaf; return JSON.stringify({ bar: !!document.querySelector('.binders-find'), activeEditor: a ? (a.constructor?.name ?? 'obj') + ' showSearch=' + typeof a.showSearch : null, activeLeaf: l?.view?.getViewType?.() ?? null, leafHasShowSearch: typeof l?.view?.showSearch, focus: document.activeElement?.className?.toString().slice(0, 60) }); })()`);
	t.ok(/^1 \/ 3/.test((await countText(p)) ?? ''), 'Ctrl+F finds in a newer binder (state ' + diag + ')');
	await p.key('h', 'ctrl');
	await p.sleep(400);
	t.ok(!(await replaceRow(p)), 'Ctrl+H gives no replace row');
	await p.ev(`(() => { app.commands.executeCommandById('binders:find-replace'); return 1; })()`);
	await p.sleep(400);
	t.ok(!(await replaceRow(p)), 'the palette’s “Find and replace in binder” gives no replace row either');
	t.ok(/Nothing can be replaced here/.test((await doneText(p)) ?? ''), 'and says why: ' + (await doneText(p)));
	await focusField(p, INPUT);
	await p.key('Enter', 'ctrl', 'alt');
	await p.sleep(800);
	t.ok(!(await reviewOpen(p)), 'Ctrl+Alt+Enter asks nothing');
	await saveAll(p);
	onlyThese(t, before, vault(p));
});

test('a Longform project, by keys in the manuscript: Ctrl+H, then Ctrl+Alt+Enter, changes its scenes only; the index note and the ignored note stay byte for byte', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.process(app.vault.getAbstractFileByPath('Longform demo/Harbor.md'), (x) => x + '\\nMara met the ferry at the harbor.\\n'); await app.vault.process(app.vault.getAbstractFileByPath('Longform demo/Return.md'), (x) => x + '\\nMara came back.\\n'); await app.vault.process(app.vault.getAbstractFileByPath('Longform demo/Notes on ferries.md'), (x) => x + '\\nMara is in an ignored note.\\n'); await app.vault.process(app.vault.getAbstractFileByPath('Longform demo/Index.md'), (x) => x + '\\nMara in the index.\\n'); })().then(() => 1)`);
	await p.sleep(900);
	await openView(p, 'Longform demo');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	const before = vault(p);
	await focusIn(p);
	await p.key('h', 'ctrl');
	await p.sleep(400);
	await focusField(p, BYIN);
	await p.type('Maren');
	await p.sleep(200);
	await focusField(p, INPUT);
	await p.type('Mara');
	await p.sleep(500);
	t.eq(await p.ev(`${BAR}.found.map(f => f.source.file.basename).join(',')`), 'Harbor,Return', 'the scenes with a match, not the index nor an ignored note');
	await focusField(p, INPUT);
	await p.key('Enter', 'ctrl', 'alt');
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(300);
	const text = await p.ev(`document.querySelector('.modal.binders-find-review')?.textContent ?? ''`);
	t.ok(!/Index|Notes on ferries/.test(text), 'the review names the two scenes, not the others');
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.sleep(1200);
	await saveAll(p);
	const now = vault(p);
	onlyThese(t, before, now, {
		'Longform demo/Harbor.md': before['Longform demo/Harbor.md'].replace('Mara met', 'Maren met'),
		'Longform demo/Return.md': before['Longform demo/Return.md'].replace('Mara came', 'Maren came'),
	});
});

// =====================================================================================================================
// The palette, and the stepping keys
// =====================================================================================================================

test('the palette runs “Find in binder” and “Find and replace in binder” with a binder in front, the way a writer types them; neither shows a key', async (p, h, t) => {
	await mixed(p, 'Find', 'outliner');
	await focusBody(p);
	await p.key('p', 'ctrl');
	await until(p, `!!document.querySelector('.prompt input')`, 3000);
	await p.type('Binders: Find in binder');
	await p.sleep(400);
	const rows = await p.ev(`[...document.querySelectorAll('.prompt .suggestion-item')].map(e => ({ t: e.textContent, k: !!e.querySelector('.suggestion-hotkey'), sel: e.classList.contains('is-selected') }))`);
	const first = rows.find((r) => r.sel) ?? rows[0];
	t.ok(first && /Find in binder/.test(first.t) && !/replace/.test(first.t), 'the palette’s first choice is “Find in binder”: ' + (first?.t ?? 'none'));
	t.ok(rows.every((r) => !r.k || !/binder/.test(r.t)), 'with no key shown for it');
	await p.key('Enter');
	await p.sleep(600);
	t.ok(await barOpen(p) && !(await replaceRow(p)), 'Enter opens the bar, without the replace row');
	await p.key('Escape');
	await p.sleep(300);
	await p.key('p', 'ctrl');
	await until(p, `!!document.querySelector('.prompt input')`, 3000);
	await p.type('Binders: Find and replace in binder');
	await p.sleep(400);
	const again = await p.ev(`[...document.querySelectorAll('.prompt .suggestion-item')].map(e => ({ t: e.textContent, sel: e.classList.contains('is-selected') }))`);
	const pick = again.find((r) => r.sel) ?? again[0];
	t.ok(pick && /Find and replace in binder/.test(pick.t), 'and its second is “Find and replace in binder”: ' + (pick?.t ?? 'none'));
	await p.key('Enter');
	await p.sleep(600);
	t.ok(await replaceRow(p), 'Enter opens the bar with the replace row');
});

test('the bar’s keys: Enter and F3 step to the next match, Shift+Enter and Shift+F3 back, Ctrl+G too; Ctrl+F with the keyboard elsewhere selects the query again, as Obsidian’s bar does', async (p, h, t) => {
	await mixed(p);
	await findWith(p, 'Mara');
	const at = async () => Number(((await countText(p)) ?? '').split(' ')[0]);
	t.eq(await at(), 1, 'the first match');
	await p.key('Enter');
	await p.sleep(300);
	t.eq(await at(), 2, 'Enter goes to the next');
	await p.key('F3');
	await p.sleep(300);
	t.eq(await at(), 3, 'F3 goes to the next');
	await p.key('Enter', 'shift');
	await p.sleep(300);
	t.eq(await at(), 2, 'Shift+Enter goes back');
	await p.key('F3', 'shift');
	await p.sleep(300);
	t.eq(await at(), 1, 'Shift+F3 goes back');
	await p.key('g', 'ctrl');
	await p.sleep(300);
	t.eq(await at(), 2, 'Ctrl+G goes to the next');
	await p.key('Enter');
	await p.sleep(300);
	await p.key('Enter');
	await p.sleep(300);
	t.eq(await at(), 1, 'and past the last it wraps to the first');
	await focusBody(p);
	await p.key('f', 'ctrl');
	await p.sleep(300);
	const sel = await p.ev(`(() => { const i = document.querySelector(${j(INPUT)}); return [document.activeElement === i, i.selectionStart, i.selectionEnd, i.value.length]; })()`);
	t.ok(sel[0] && sel[1] === 0 && sel[2] === sel[3], 'Ctrl+F again puts the keyboard in the field with its text selected: ' + j(sel));
});

// =====================================================================================================================
// Obsidian's own bar, to compare with
// =====================================================================================================================

test('after Escape, Ctrl+F brings back the last query the way Obsidian’s own bar does (compared in a note and in a binder)', async (p, h, t) => {
	await mixed(p);
	// Obsidian's own bar, in a note in a tab of its own
	await p.ev(`app.workspace.getLeaf('tab').openFile(${file('Find/2 Two.md')}).then(() => 1)`);
	await p.sleep(900);
	await p.ev(`(() => { app.workspace.activeEditor?.editor?.focus?.(); return 1; })()`);
	await p.key('f', 'ctrl');
	await p.sleep(300);
	await p.type('Mara');
	await p.sleep(300);
	await p.key('Escape');
	await p.sleep(300);
	await p.key('f', 'ctrl');
	await p.sleep(300);
	const native = await p.ev(`document.querySelector('.document-search-container:not(.binders-find) input')?.value ?? null`);
	await p.key('Escape');
	await p.sleep(200);
	await openView(p, 'Find');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await findWith(p, 'Mara');
	await p.key('Escape');
	await p.sleep(300);
	await p.key('f', 'ctrl');
	await p.sleep(300);
	const ours = await p.ev(`document.querySelector(${j(INPUT)})?.value ?? null`);
	t.eq(ours, native, `Obsidian’s bar brings back “${native}” after Escape; Binders’ brings back “${ours}”`);
});
