// The binder view (src/view/BinderView.ts): opening it, its state, the breadcrumb, modes, word count, filter, the
// folder's synopsis, read-only newer-format binders, and following renames. Every test that changes files checks no
// text was lost.
import { B, NOTE, PL, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, j, menuItems, openView, read, reload, same, selected, split, texts, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'view: ' + name, fn });

const leaves = (p) => p.ev(`app.workspace.getLeavesOfType('binders-view').length`);
const headerTitle = (p) => p.ev(`document.querySelector('.workspace-leaf.mod-active .view-header-title')?.textContent`);
const tabTitle = (p) => p.ev(`app.workspace.getMostRecentLeaf().tabHeaderInnerTitleEl?.textContent`);
const crumbs = (p) => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-crumb')].map(e => e.textContent)`);
// (the corkboard shows one folder: its notes as cards, and one stacked card for each of its folders)
const LIGHTHOUSE_CARDS = ['The Lighthouse/Prologue.md', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'The Lighthouse/Epilogue.md'];
const PART_ONE_CARDS = ['Arrival', 'The keeper', 'Storm warning'].map((x) => 'The Lighthouse/Part One/' + x + '.md');

test('clicking a binder in the file explorer opens it; a folder in it opens in the same tab', async (p, h, t) => {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); l.view.fileItems['The Lighthouse'].setCollapsed(true); return 1; })()`);
	await p.sleep(300);
	let at = await p.at(`.nav-folder-title[data-path="The Lighthouse"] .nav-folder-title-content`);
	await p.click(at.x, at.y);
	await until(p, `!!document.querySelector('.binders-view .binders-card')`);
	await p.sleep(300);
	t.eq(await leaves(p), 1, 'a binder view opened');
	t.eq((await viewState(p)).folder, 'The Lighthouse', 'on the binder');
	t.eq(await headerTitle(p), 'The Lighthouse', 'the header shows the folder’s name');
	t.eq(await p.ev(`${VIEW}.getIcon()`), 'book', 'its icon is the book');
	t.eq(j(await cards(p)), j(LIGHTHOUSE_CARDS), 'the cards are in binder order, a folder as one card');
	at = await p.at(`.nav-folder-title[data-path="The Lighthouse/Part One"] .nav-folder-title-content`);
	await p.click(at.x, at.y);
	await until(p, `app.workspace.getLeavesOfType('binders-view')[0]?.getViewState().state.folder === 'The Lighthouse/Part One'`);
	await p.sleep(300);
	t.eq(await leaves(p), 1, 'the same view is reused');
	t.eq(await headerTitle(p), 'Part One', 'the header follows');
	t.eq(await tabTitle(p), 'Part One', 'so does the tab');
	t.eq(j(await crumbs(p)), j(['The Lighthouse', 'Part One']), 'the breadcrumb shows the way down');
	t.eq(j(await cards(p)), j(PART_ONE_CARDS), 'and the board shows that folder’s notes');
});

test('“Open binder” from a note shows its folder with the note’s card selected', async (p, h, t) => {
	await h.open('The Lighthouse/Part One/The keeper.md');
	t.ok(await p.ev(`app.commands.findCommand('binders:open-binder').checkCallback(true)`), 'offered in a binder');
	await h.run('open-binder');
	await until(p, `!!document.querySelector('.binders-card.is-selected')`);
	t.eq((await viewState(p)).folder, 'The Lighthouse/Part One', 'the note’s folder');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.binders-card.is-selected')].map(c => c.dataset.path)`)), j(['The Lighthouse/Part One/The keeper.md']), 'its card is selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'The Lighthouse/Part One/The keeper.md', 'and has the focus');
	await p.ev(`app.vault.create('Elsewhere.md', 'x').then(() => 1)`);
	await h.open('Elsewhere.md');
	t.ok(!(await p.ev(`app.commands.findCommand('binders:open-binder').checkCallback(true)`)), 'not offered outside binders');
});

test('“Open binder” in a folder’s menu; Mod-click opens a new tab', async (p, h, t) => {
	// the file explorer's own menu for the folder
	const menuFor = async (path) => {
		await p.ev(`(() => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); for (const f of ['The Lighthouse']) l.view.fileItems[f]?.setCollapsed(false); return 1; })()`);
		await p.sleep(250);
		const at = await p.at(`.nav-folder-title[data-path="${path}"]`);
		await p.right(at.x, at.y);
	};
	await menuFor('The Lighthouse/Part Two');
	t.ok((await menuItems(p)).includes('Open binder'), 'the folder menu has “Open binder”');
	await clickMenu(p, 'Open binder');
	await until(p, `app.workspace.getLeavesOfType('binders-view').length === 1`);
	t.eq((await viewState(p)).folder, 'The Lighthouse/Part Two', 'it opens that folder');
	await menuFor('The Lighthouse');
	t.ok((await menuItems(p)).includes('Open binder'), 'the binder’s own menu has it too');
	await closeMenus(p);
	await p.ev(`(async () => { await app.vault.createFolder('Plain'); })().then(() => 1)`);
	try {
		await menuFor('Plain');
		t.ok(!(await menuItems(p)).includes('Open binder'), 'a plain folder’s menu doesn’t');
		await closeMenus(p);
	} finally { await p.ev(`app.vault.delete(${file('Plain')}, true).then(() => 1)`); }
	// a crumb with Mod opens the folder in a new tab
	await openView(p, 'The Lighthouse/Part Two');
	const at = await p.at(`.workspace-leaf.mod-active .binders-crumb[role="link"]`);
	await p.click(at.x, at.y, { modifiers: 2 });
	await until(p, `app.workspace.getLeavesOfType('binders-view').length === 2`);
	t.eq(await leaves(p), 2, 'Ctrl-click on a crumb opened another tab');
});

test('a tab saved on the plot grid of an earlier version opens as the outliner', async (p, h, t) => {
	await p.ev(`(async () => { await ${B}.ready; await app.workspace.getLeaf(false).setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'plotgrid' }, active: true }); })().then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-view .binders-mode-outliner .binders-outliner-row')`);
	t.eq((await viewState(p)).mode, 'outliner', 'the outliner');
});

test('state (folder, mode, filter, options) comes back after a reload', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`(() => { const v = ${VIEW}; v.setMode('outliner'); return 1; })()`);
	await p.ev(`(() => { const v = ${VIEW}; v.filter = { status: ['draft'], label: [] }; v.options = { cardSize: 'large', numbers: true }; app.workspace.requestSaveLayout(); return 1; })()`);
	await p.ev(`app.workspace.requestSaveLayout.run().then(() => 1)`);
	await p.sleep(300);
	await reload(p);
	await until(p, `app.workspace.getLeavesOfType('binders-view').length > 0`);
	const st = await p.ev(`(async () => { const l = app.workspace.getLeavesOfType('binders-view')[0]; await l.loadIfDeferred?.(); return l.getViewState().state; })()`);
	t.eq(st.folder, 'The Lighthouse/Part One', 'the folder');
	t.eq(st.mode, 'outliner', 'the mode');
	t.eq(j(st.filter?.status), j(['Draft']), 'the filter (a status saved in another case is the one settings have)');
	t.eq(j([st.options?.cardSize, st.options?.numbers]), j(['large', true]), 'the corkboard’s options');
	await p.ev(`(async () => { const l = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-view .binders-mode-outliner')`);
	t.eq(await headerTitle(p), 'Part One', 'the header after a reload');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-board.mod-cards-large.mod-numbers')`);
	t.ok(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-board.mod-cards-large.mod-numbers')`), 'and the corkboard is drawn with them');
});

test('a tab saved by an earlier version with subfolders as sections (“stacks” off) shows them as stacks', async (p, h, t) => {
	await p.ev(`(async () => { await ${B}.ready; await app.workspace.getLeaf(false).setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'corkboard', options: { stacks: false } }, active: true }); })().then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-view .binders-card.is-stack')`);
	t.eq(j(await cards(p)), j(LIGHTHOUSE_CARDS), 'one card per folder, as every board has now');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-group-heading').length`), 0, 'and no headings');
	const more = await p.at(`.workspace-leaf.mod-active .view-action[aria-label="More options"]`);
	await p.click(more.x, more.y);
	const items = await menuItems(p);
	t.ok(!items.some((x) => /stacks/i.test(x)), 'nothing in the menu turns stacks off: ' + items.join(', '));
	await closeMenus(p);
});

test('before the vault’s metadata is complete, a view says it’s loading, never that its folder isn’t in a binder', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.createFolder('Plain').then(() => 1)`);
	await p.ev(`(() => { window.__settled = ${B}.settled; ${B}.settled = new Promise(r => { window.__settle = r; }); return 1; })()`);
	try {
		// a folder the store hasn't found as a binder yet (on a cold start it may be one once the cache is complete)
		await p.ev(`app.workspace.getLeaf(true).setViewState({ type: 'binders-view', state: { folder: 'Plain' }, active: true }).then(() => 1)`);
		await p.sleep(1000);
		const empty = () => p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view .binders-empty')?.textContent ?? null`);
		t.eq(await empty(), 'Loading…', 'a quiet loading state');
		t.eq(await p.ev(`getComputedStyle(document.querySelector('.workspace-leaf.mod-active .binders-empty')).opacity`), '1', 'shown after a moment');
		// a binder that has been found draws at once
		await openView(p, 'The Lighthouse', true);
		t.ok((await cards(p)).length > 0, 'a binder already found shows its cards');
		await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view').find(l => l.getViewState().state.folder === 'Plain'), { focus: true }); return 1; })()`);
		await p.sleep(200);
		t.eq(await empty(), 'Loading…', 'still loading');
		await p.ev(`(() => { window.__settle(); return 1; })()`);
		await until(p, `/isn’t in a binder/.test(document.querySelector('.workspace-leaf.mod-active .binders-empty')?.textContent)`);
		t.ok(/isn’t in a binder/.test(await empty()), 'once it is complete: the folder isn’t in a binder');
	} finally {
		await p.ev(`(() => { window.__settle?.(); ${B}.settled = window.__settled; return 1; })()`);
	}
}));

test('a cold start (no metadata cache) restores a binder view without saying its folder isn’t in a binder', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`app.workspace.requestSaveLayout.run().then(() => 1)`);
	await p.sleep(300);
	// Obsidian keeps the metadata cache in IndexedDB: drop it, so the restart parses every note again
	await p.ev(`(() => { app.metadataCache.db?.close?.(); indexedDB.deleteDatabase(app.appId + '-cache'); setTimeout(() => location.reload(), 100); return 1; })()`);
	await p.sleep(150);
	const seen = [];
	let shown = false;
	for (let i = 0; i < 600 && !shown; i++) {
		const v = await p.ev(`(() => { const e = document.querySelector('.binders-view'); return e ? { text: e.textContent, bar: !!e.querySelector('.binders-toolbar') } : null; })()`).catch(() => null);
		if (v) { seen.push(v.text.slice(0, 60)); shown = v.bar; }
		await p.sleep(20);
	}
	for (let i = 0; i < 80 && !(await p.ev(`!!(window.app && app.workspace?.layoutReady && app.plugins?.plugins?.binders?.explorer)`).catch(() => false)); i++) await p.sleep(250);
	await p.ev(`app.plugins.plugins.binders.binders.settled.then(() => 1)`);
	await p.ev(`(() => { window.activeWindow = window; window.activeDocument = document; return 1; })()`);
	await p.sleep(500);
	p.errors.length = 0; // a restart logs Electron's own warnings again
	t.ok(shown, 'the binder view is restored');
	t.ok(!seen.some((x) => /isn’t in a binder/.test(x)), 'never said its folder isn’t in a binder: ' + j([...new Set(seen)]));
});

test('the breadcrumb goes up, and Back comes down again', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part Two');
	const at = await p.at(`.workspace-leaf.mod-active .binders-crumb[role="link"]`);
	await p.click(at.x, at.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	t.eq(await headerTitle(p), 'The Lighthouse', 'on the binder');
	t.eq(await leaves(p), 1, 'in the same tab');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part Two'`);
	t.eq((await viewState(p)).folder, 'The Lighthouse/Part Two', 'Back returns to Part Two');
	t.eq(j(await cards(p)), j(['The Lighthouse/Part Two/The wreck.md', 'The Lighthouse/Part Two/Lights out.md']), 'and draws it');
	// a subfolder's stack goes down, and Back and the breadcrumb both come up again
	await openView(p, 'The Lighthouse');
	const hd = await p.at(card('The Lighthouse/Part One'));
	await p.dbl(hd.x, hd.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	t.eq(await headerTitle(p), 'Part One', 'a double-click on a folder’s stack opens its folder');
	t.eq(await leaves(p), 1, 'in the same tab');
	t.eq(j(await crumbs(p)), j(['The Lighthouse', 'Part One']), 'with the way back up in the breadcrumb');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	t.eq(await headerTitle(p), 'The Lighthouse', 'Back comes up again');
	t.eq(j(await cards(p)), j(LIGHTHOUSE_CARDS), 'to the binder’s board');
	await p.ev(`app.commands.executeCommandById('app:go-forward')`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	t.eq(j(await cards(p)), j(PART_ONE_CARDS), 'and Forward goes down into the folder');
});

test('the mode menu and commands switch modes', async (p, h, t) => {
	await h.open('The Lighthouse/Prologue.md');
	t.ok(!(await p.ev(`app.commands.findCommand('binders:show-outliner').checkCallback(true)`)), 'mode commands need a binder view');
	await openView(p);
	t.ok(await p.ev(`app.commands.findCommand('binders:show-outliner').checkCallback(true)`), 'offered in a binder view');
	const at = await p.at(`.workspace-leaf.mod-active .binders-mode-button`);
	await p.click(at.x, at.y);
	t.eq(j(await menuItems(p)), j(['Corkboard', 'Outliner', 'Manuscript']), 'the mode menu');
	await clickMenu(p, 'Manuscript');
	t.eq((await viewState(p)).mode, 'manuscript', 'switched');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-mode-button .text-button-label').textContent`), 'Manuscript', 'the button says so');
	await h.run('show-corkboard');
	await p.sleep(200);
	t.eq((await viewState(p)).mode, 'corkboard', 'the command switches back');
	t.eq((await cards(p)).length, 4, 'the corkboard is drawn again');
	// the pane's "More options" menu has them too
	const more = await p.at(`.workspace-leaf.mod-active .view-action[aria-label="More options"]`);
	await p.click(more.x, more.y);
	const items = await menuItems(p);
	t.ok(['Corkboard', 'Outliner', 'Manuscript', 'Card size', 'Tint cards with their label color', 'Number the cards'].every((x) => items.includes(x)), 'More options lists the modes and the corkboard’s options: ' + items.join(', '));
	await closeMenus(p);
});

test('“Arrange” opens the other board on the card a switch of mode carried in, as another switch of mode would', async (p, h, t) => {
	const K = 'The Lighthouse/Part One/The keeper.md';
	await openView(p, 'The Lighthouse/Part One');
	const c = await p.at(card(K));
	await p.click(c.x, c.t + c.h - 12);
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(700);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-row.is-selected')].map(r => r.dataset.path)`)), j([K]), 'the outliner opens on the card’s row');
	// (long enough that the corkboard counts the card as where it started, not somewhere the writer went)
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(1000);
	t.eq(j(await selected(p)), j([K]), 'the corkboard comes back on it');
	await p.ev(`(() => { ${VIEW}.arrange('label', 'across'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-lanes')`);
	await p.sleep(600);
	t.eq(j(await selected(p)), j([K]), 'arranged by label: still on it');
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), K, 'with the keyboard on it');
	await p.ev(`(() => { ${VIEW}.arrange('grid'); return 1; })()`);
	await p.sleep(700);
	t.eq(j(await selected(p)), j([K]), 'and back in a grid');
});

test('all three modes mount in the view, each scrolling itself; typing in the manuscript is saved on switching', withTidy(async (p, h, t) => {
	const before = await texts(p);
	const ARR = 'The Lighthouse/Part One/Arrival.md';
	await openView(p, 'The Lighthouse/Part One');
	const box = (sel) => p.ev(`(() => { const e = document.querySelector('.workspace-leaf.mod-active ' + ${j(sel)}); if (!e) return null; const r = e.getBoundingClientRect(), v = e.closest('.binders-view').getBoundingClientRect(); return { h: Math.round(r.height), inside: r.bottom <= v.bottom + 1, scrolls: getComputedStyle(e).overflowY }; })()`);
	let b = await box('.binders-corkboard');
	t.ok(b && b.h > 200 && b.inside && b.scrolls === 'auto', 'the corkboard fills the view and scrolls itself: ' + j(b));
	t.ok(!(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-filter-button').hasClass('is-hidden')`)), 'the corkboard has the filter');
	await h.run('show-outliner');
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-outliner .binders-outliner-row')`);
	b = await box('.binders-outliner');
	t.ok(b && b.h > 200 && b.inside && b.scrolls === 'auto', 'the outliner fills the view and scrolls itself: ' + j(b));
	t.ok(!(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-filter-button').hasClass('is-hidden')`)), 'and has the filter too');
	await h.run('show-manuscript');
	await until(p, `(() => { const m = ${VIEW}.current; return m && m.scenes?.length === 3 && m.scenes.some(s => s.live); })()`, 5000);
	b = await box('.binders-manuscript');
	t.ok(b && b.h > 200 && b.inside && b.scrolls === 'auto', 'the manuscript fills the view and scrolls itself: ' + j(b));
	// type at the end of Arrival, and switch away before it's saved
	await p.ev(`(async () => { const m = ${VIEW}.current, s = m.scenes.find(s => s.file.path === ${j(ARR)}); await m.mount(s); const ed = s.live.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.sleep(100);
	const count = () => p.ev(`parseInt(document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent.replace(/,/g, ''), 10)`);
	const words = await count();
	await p.type(' Typed in the manuscript.');
	await until(p, `parseInt(document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent.replace(/,/g, ''), 10) === ${words + 4}`);
	t.eq(await count(), words + 4, 'the word count follows the typing before it’s saved');
	await h.run('show-corkboard');
	await until(p, `app.vault.adapter.read(${j(ARR)}).then(s => s.includes('Typed in the manuscript.'))`);
	const now = await read(p, ARR);
	t.eq(now, before[ARR].replace(/\n?$/, (m) => ' Typed in the manuscript.' + m), 'the typing was saved, and nothing else changed');
	same(t, before, await texts(p), { skip: [ARR] });
	t.eq((await cards(p)).length, 3, 'the corkboard is back');
	// and round again, with nothing lost or left behind
	for (const m of ['manuscript', 'outliner', 'corkboard', 'outliner', 'manuscript', 'corkboard']) { await h.run('show-' + m); await p.sleep(150); }
	await p.sleep(400);
	// (the corkboard takes the folder's synopsis line in, above its cards, so the two scroll together; and a board has
	// a line that's said to a screen reader, not shown)
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-mode > :not(.binders-view-synopsis-row, .binders-live)').length`), 1, 'one mode drawn at a time');
	same(t, { ...before, [ARR]: now }, await texts(p));
}));

test('word count, and the binder’s target', withTidy(async (p, h, t) => {
	await openView(p);
	const count = () => p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent`);
	// a note's card says its words; a folder's stack, the words of the notes in it ("3 notes · 51 words")
	const words = () => p.ev(`Object.fromEntries([...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].map(c => [c.dataset.path, parseInt(c.querySelector('.binders-card-words').textContent.split(' · ').pop().replace(/,/g, ''), 10)]))`);
	const onBoard = await words();
	const cardWords = Object.values(onBoard).reduce((a, b) => a + b, 0);
	t.eq(Object.keys(onBoard).length, 4, 'two notes and two stacks');
	t.eq(await count(), `${cardWords} words`, 'the sum of the cards: the notes’ words and the stacks’');
	// each folder's stack says what its own board adds up to
	const perCard = { 'The Lighthouse/Prologue.md': onBoard['The Lighthouse/Prologue.md'], 'The Lighthouse/Epilogue.md': onBoard['The Lighthouse/Epilogue.md'] };
	for (const part of ['The Lighthouse/Part One', 'The Lighthouse/Part Two']) {
		await openView(p, part);
		const inside = await words();
		t.eq(Object.values(inside).reduce((a, b) => a + b, 0), onBoard[part], `the stack of “${part}” counts the words of the cards on its board`);
		t.eq(await count(), `${onBoard[part]} words`, 'as the toolbar does there');
		Object.assign(perCard, inside);
	}
	t.eq(Object.keys(perCard).length, 7, 'seven notes in all');
	// each card agrees with Obsidian's own count in the status bar
	for (const [path, n] of Object.entries(perCard)) {
		await p.ev(`app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${j(path)})).then(() => 1)`);
		const bar = await until(p, `(() => { const e = document.querySelector('.status-bar-item.plugin-word-count'); return e && /\\d/.test(e.textContent) && app.workspace.getActiveFile()?.path === ${j(path)} ? e.textContent : null; })()`);
		await p.sleep(300);
		const obs = parseInt((await p.ev(`document.querySelector('.status-bar-item.plugin-word-count').textContent`)).replace(/,/g, ''), 10);
		t.eq(n, obs, `“${path}” has as many words as Obsidian counts (${bar})`);
		await p.ev(`(() => { app.workspace.activeLeaf.detach(); return 1; })()`);
	}
	await openView(p);
	await p.ev(`app.fileManager.processFrontMatter(${file(NOTE)}, fm => { fm.target = 1000; }).then(() => 1)`);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent.includes('/')`);
	t.eq(await count(), `${cardWords} / 1,000 words`, 'with the target');
	// typing in a note updates it
	await p.ev(`app.vault.process(${file('The Lighthouse/Epilogue.md')}, s => s + ' Four more words here.').then(() => 1)`);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent.startsWith('${cardWords + 4}')`);
	t.eq(await count(), `${cardWords + 4} / 1,000 words`, 'after an edit');
	// and typing in a note inside a folder updates that folder's stack
	await p.ev(`app.vault.process(${file('The Lighthouse/Part Two/The wreck.md')}, s => s + ' Three more words.').then(() => 1)`);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card[data-path="The Lighthouse/Part Two"] .binders-card-words').textContent === '2 notes · ${onBoard['The Lighthouse/Part Two'] + 3} words'`);
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card[data-path="The Lighthouse/Part Two"] .binders-card-words').textContent`), `2 notes · ${onBoard['The Lighthouse/Part Two'] + 3} words`, 'a stack’s count follows an edit to a note in it');
	t.eq(await count(), `${cardWords + 7} / 1,000 words`, 'and so does the binder’s');
	await openView(p, 'The Lighthouse/Part One');
	const partOne = ['Arrival', 'The keeper', 'Storm warning'].reduce((a, x) => a + perCard['The Lighthouse/Part One/' + x + '.md'], 0);
	t.eq(await count(), `${partOne} words`, 'a subfolder counts its own notes, without the binder’s target');
	t.eq(await p.at(`.workspace-leaf.mod-active .binders-progress`), null, 'and shows no progress bar');
}));

test('the toolbar is laid out as a base’s: the view first, the way up only inside a subfolder, the target as a bar', withTidy(async (p, h, t) => {
	await openView(p);
	const order = () => p.ev(`[...document.querySelector('.workspace-leaf.mod-active .binders-toolbar').children].filter(e => e.getBoundingClientRect().width > 0 && !e.classList.contains('binders-toolbar-spacer')).map(e => e.className.split(' ').find(c => /^binders-(mode|arrange|filter|new)-button$|^binders-(breadcrumbs|progress|word-count)$/.test(c)))`);
	t.eq(j(await order()), j(['binders-mode-button', 'binders-word-count', 'binders-arrange-button', 'binders-filter-button', 'binders-new-button']), 'on the binder itself: the view, the count, Arrange, Filter, New');
	const bar = await p.ev(`(() => { const b = document.querySelector('.workspace-leaf.mod-active .binders-toolbar').getBoundingClientRect(), v = document.querySelector('.workspace-leaf.mod-active .view-content').getBoundingClientRect(); return { left: b.left - v.left, right: v.right - b.right, top: b.top - v.top }; })()`);
	t.eq(j(bar), j({ left: 0, right: 0, top: 0 }), 'edge to edge under the header, as a base’s toolbar is');
	await p.ev(`app.fileManager.processFrontMatter(${file(NOTE)}, fm => { fm.target = 212; }).then(() => 1)`);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-progress')?.getAttribute('aria-valuenow') === '50'`);
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-progress').getAttribute('aria-valuenow')`), '50', '106 of 212 words: the bar says 50%');
	const fill = await p.ev(`(() => { const b = document.querySelector('.workspace-leaf.mod-active .binders-progress'), f = b.firstElementChild; f.getAnimations().forEach(a => a.finish()); return f.getBoundingClientRect().width / b.getBoundingClientRect().width; })()`);
	t.ok(Math.abs(fill - 0.5) < 0.05, 'and is half full: ' + fill);
	await openView(p, 'The Lighthouse/Part One');
	t.eq(j(await order()), j(['binders-mode-button', 'binders-breadcrumbs', 'binders-word-count', 'binders-arrange-button', 'binders-filter-button', 'binders-new-button']), 'in a subfolder: the way up too');
	t.eq(j(await crumbs(p)), j(['The Lighthouse', 'Part One']), 'the binder, then the folder');
}));

test('the folder’s synopsis: edited in place, into its folder note or the binder note', withTidy(async (p, h, t) => {
	const before = await texts(p);
	// from a note, so Obsidian's own Mod-Enter ("Open link in new tab", for the last editor) is in play
	await h.open('The Lighthouse/Prologue.md');
	await openView(p, 'The Lighthouse/Part One');
	const syn = `.workspace-leaf.mod-active .binders-view-synopsis`;
	t.eq(await p.ev(`document.querySelector('${syn}').textContent`), 'Add a synopsis', 'a placeholder when there is none');
	let at = await p.at(syn);
	await p.click(at.x, at.y);
	t.ok(await p.ev(`document.activeElement.matches('${syn} textarea')`), 'clicking edits');
	await p.type('Mara comes to the island.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Part One.md')`);
	await p.sleep(300);
	const fn = await read(p, 'The Lighthouse/Part One/Part One.md');
	t.eq(fn.trim(), '---\nsynopsis: Mara comes to the island.\n---', 'the folder note was made with the synopsis');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').length`), 0, 'Mod-Enter saved, and opened nothing');
	t.eq(await p.ev(`document.querySelector('${syn}').textContent`), 'Mara comes to the island.', 'it shows');
	t.ok(!(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-card[data-path$="Part One.md"]')`)), 'the folder note is not a card');
	// on the binder itself: the binder note, nothing else in it touched
	await openView(p, 'The Lighthouse');
	at = await p.at(syn);
	await p.click(at.x, at.y);
	await p.type('A lighthouse.');
	await p.ev(`document.activeElement.blur()`);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.includes('synopsis: A lighthouse.'))`);
	const after = await texts(p);
	t.eq(split(after[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is untouched');
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the binder’s list is as it was');
	t.ok(split(after[NOTE]).yaml.startsWith(split(before[NOTE]).yaml), 'only a property was added to the binder note');
	same(t, before, after, { skip: [NOTE] });
	// Escape cancels
	at = await p.at(syn);
	await p.click(at.x, at.y);
	await p.type(' Never mind.');
	await p.key('Escape');
	await p.sleep(200);
	t.eq(await p.ev(`document.querySelector('${syn}').textContent`), 'A lighthouse.', 'Escape puts it back');
	t.ok((await read(p, NOTE)).includes('synopsis: A lighthouse.\n'), 'and writes nothing');
}));

test('filter by status and label', async (p, h, t) => {
	await openView(p);
	const at = await p.at(`.workspace-leaf.mod-active .binders-filter-button`);
	await p.click(at.x, at.y);
	const items = await menuItems(p);
	t.eq(j(items.slice(0, 4)), j(['Status', 'Idea', 'Draft', 'Revised']), 'the statuses in use, in the order settings have them: ' + items.join(', '));
	await clickMenu(p, 'Draft');
	t.eq(j(await cards(p)), j(['The Lighthouse/Prologue.md', 'The Lighthouse/Part One', 'The Lighthouse/Part Two']), 'only the drafts among the notes (Epilogue is an idea); folders stay, as the way to theirs');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-filter-button .text-button-label').textContent`), 'Filter (1)', 'the button says a filter is on');
	t.eq(j((await viewState(p)).filter.status), j(['Draft']), 'kept in the view’s state');
	// the filter goes along into a folder
	const st = await p.at(card('The Lighthouse/Part One'));
	await p.dbl(st.x, st.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 1`);
	t.eq(j(await cards(p)), j(['The Lighthouse/Part One/The keeper.md']), 'in Part One, only its draft');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-filter-button .text-button-label').textContent`), 'Filter (1)', 'the filter is still on there');
	await p.click(at.x, at.y);
	await clickMenu(p, 'Idea');
	t.eq(j(await cards(p)), j(['The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part One/Storm warning.md']), 'drafts or ideas');
	await p.click(at.x, at.y);
	await clickMenu(p, 'Clear filter');
	t.eq(j(await cards(p)), j(PART_ONE_CARDS), 'all again');
	// (up by the breadcrumb: Back would return to the board as it was left, filter and all)
	const up = await p.at(`.workspace-leaf.mod-active .binders-crumb[role="link"]`);
	await p.click(up.x, up.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 4`);
	t.eq(j(await cards(p)), j(LIGHTHOUSE_CARDS), 'and on the binder’s board too');
});

test('a binder in a newer format opens read only and writes nothing', async (p, h, t) => {
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem('The Lighthouse')`);
	try {
		const before = await texts(p);
		await openView(p);
		const notice = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-notice.is-shown')?.textContent`);
		t.ok(/Read only\. It was made by a newer version of Binders \(format 2\)/.test(notice ?? ''), 'a notice says why: ' + notice);
		t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-editable.is-editable').length`), 0, 'nothing is editable');
		t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card-new').length`), 0, 'no new cards');
		// try everything that would write: a drag, Delete, Alt+arrow, the menu
		const a = await p.at(card('The Lighthouse/Prologue.md')), b = await p.at(card('The Lighthouse/Epilogue.md'));
		await p.drag(a.x, a.y, b.x + 40, b.y);
		await p.click(a.x, a.y);
		await p.key('ArrowDown', 'alt');
		await p.key('Delete');
		await p.sleep(300);
		t.eq(await p.ev(`document.querySelectorAll('.modal').length`), 0, 'Delete asks nothing');
		await p.right(a.x, a.y);
		const items = await menuItems(p);
		t.ok(items.includes('Open') && !items.includes('Delete') && !items.includes('Rename') && !items.includes('Set status'), 'the menu only opens: ' + items.join(', '));
		await closeMenus(p);
		await p.sleep(500);
		same(t, before, await texts(p));
	} finally { await writeRaw(p, NOTE, orig); await until(p, `!${B}.problem('The Lighthouse')`); }
});

test('follows its folder when it’s renamed; when it’s deleted, shows the folder above; and says so when the binder is gone', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part Two');
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Part Two')}, 'The Lighthouse/Part 2').then(() => 1)`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part 2'`);
	t.eq(await headerTitle(p), 'Part 2', 'the header follows (the view’s titleEl and leaf.updateHeader, internals: see docs/internals.md)');
	t.eq(await tabTitle(p), 'Part 2', 'and the tab');
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card')?.dataset.path.startsWith('The Lighthouse/Part 2/')`);
	t.eq(j(await cards(p)), j(['The Lighthouse/Part 2/The wreck.md', 'The Lighthouse/Part 2/Lights out.md']), 'the cards too');
	t.eq(j(await crumbs(p)), j(['The Lighthouse', 'Part 2']), 'and the breadcrumb');
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Part 2')}, 'The Lighthouse/Part Two').then(() => 1)`);
	await p.sleep(300);
	// the folder shown is deleted: the view goes up to the folder above it, which is still in the binder
	await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Part Three'); await app.vault.create('The Lighthouse/Part Three/Coda.md', 'x'); })().then(() => 1)`);
	await openView(p, 'The Lighthouse/Part Three');
	t.eq(j(await cards(p)), j(['The Lighthouse/Part Three/Coda.md']), 'a new folder’s board');
	await p.ev(`app.vault.delete(${file('The Lighthouse/Part Three')}, true).then(() => 1)`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	t.eq((await viewState(p)).folder, 'The Lighthouse', 'its folder deleted, the view shows the binder it was in');
	t.eq(await headerTitle(p), 'The Lighthouse', 'named in the header');
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 4`);
	t.eq(j(await cards(p)), j(LIGHTHOUSE_CARDS), 'with the board of what is left');
	t.ok(await exists(p, 'The Lighthouse/Part Two/The wreck.md'), 'nothing else went');
	// a binder deleted whole: nothing above it to show
	await p.ev(`(async () => { await app.vault.createFolder('Scratch'); await app.vault.create('Scratch/One.md', 'x'); await app.vault.create('Scratch/Scratch.md', '---\\nbinder: 1\\ncontents:\\n  - One\\n---\\n'); })().then(() => 1)`);
	await until(p, `!!${B}.binderOf(${file('Scratch')})`);
	await openView(p, 'Scratch');
	t.eq(j(await cards(p)), j(['Scratch/One.md']), 'another binder’s board');
	await p.ev(`app.vault.delete(${file('Scratch')}, true).then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-empty')`);
	t.ok(/isn’t in a binder/.test(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-empty')?.textContent ?? ''`)), 'an empty state says the folder is gone');
	t.ok(await exists(p, 'The Lighthouse/Part Two/The wreck.md'), 'nothing else went');
}));

test('a narrow pane: folder names win over the counts', withTidy(async (p, h, t) => {
	await openView(p);
	const cut = (sel) => p.ev(`(() => { const e = document.querySelector('.workspace-leaf.mod-active ${sel}'); return !e ? 'missing' : e.scrollWidth > e.clientWidth + 1; })()`);
	for (const width of [700, 620]) {
		await p.send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
		await p.sleep(400);
		const pane = await p.ev(`Math.round(document.querySelector('.workspace-leaf.mod-active .binders-view').getBoundingClientRect().width)`);
		t.eq(await cut('.binders-crumb.is-current'), false, `the breadcrumb shows the whole name (pane ${pane}px)`);
		t.eq(await cut('.binders-card.is-stack .binders-card-title'), false, `a folder’s stack shows the whole name (pane ${pane}px)`);
		t.eq(await p.ev(`(() => { const c = document.querySelector('.workspace-leaf.mod-active .binders-card.is-stack'), n = c.querySelector('.binders-card-title').getBoundingClientRect(), w = c.querySelector('.binders-card-words').getBoundingClientRect(); return n.bottom <= w.top + 1; })()`), true, `with its count under it, out of the name’s way (pane ${pane}px)`);
	}
	await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
	await p.sleep(300);
}));

// The mode button under 360 px (decided 2026-10-05): its icon and chevron, its name in its tooltip and to a screen
// reader, in a narrow pane as on a narrow phone; the way up and the count have the room its name took.
const TOOLBAR = `(() => {
	const v = document.querySelector('.workspace-leaf.mod-active .binders-view'), bar = v.querySelector('.binders-toolbar'), b = bar.querySelector('.binders-mode-button');
	const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0, box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; };
	const br = box(b), kids = [...bar.children].filter(e => shown(e) && !e.classList.contains('binders-toolbar-spacer')).map(e => ({ cls: [...e.classList].find(c => c.startsWith('binders-')), ...box(e) }));
	const count = bar.querySelector('.binders-word-count'), up = bar.querySelector('.binders-crumb[role="link"]:nth-last-child(3)');
	return {
		pane: Math.round(v.getBoundingClientRect().width), label: shown(b.querySelector('.text-button-label')), name: b.getAttribute('aria-label'), tip: getComputedStyle(b).getPropertyValue('--no-tooltip').trim(),
		whole: [b.querySelector('.text-button-icon:not(.mod-aux)'), b.querySelector('.mod-aux')].every(e => { const r = box(e); return r.w >= 12 && r.l >= br.l - 0.5 && r.r <= br.r + 0.5; }),
		button: Math.round(br.w), out: Math.round(Math.max(0, ...kids.map(k => k.r)) - bar.getBoundingClientRect().right), overlap: kids.filter((k, i) => i && k.l < kids[i - 1].r - 0.5).map(k => k.cls),
		count: shown(count) ? { text: count.innerText.trim(), cut: count.scrollWidth - count.clientWidth } : null,
		up: shown(up) ? { text: up.textContent, w: Math.round(box(up).w), cut: up.scrollWidth - up.clientWidth } : null,
	};
})()`;
async function modeButtonAt(p, t, where, setWidth) {
	const ups = {};
	for (const w of [320, 359, 360]) {
		await setWidth(w);
		for (const folder of ['The Lighthouse', 'The Lighthouse/Part One']) {
			await openView(p, folder);
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
				await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-mode-${mode}')`);
				await p.sleep(250);
				const bar = await p.ev(TOOLBAR), what = `${where}, ${w} px, ${folder === 'The Lighthouse' ? 'binder' : 'folder'}, ${mode}`, name = mode.charAt(0).toUpperCase() + mode.slice(1);
				t.eq(bar.pane, w, `${what}: the pane is that wide`);
				t.eq(bar.label, w >= 360, `${what}: the mode’s name is ${w >= 360 ? 'shown' : 'not shown'} on its button`);
				t.eq(bar.name, `View as: ${name}`, `${what}: a screen reader is told the mode`);
				t.ok(bar.whole, `${what}: the button’s icon and chevron are whole: ${j(bar)}`);
				if (w < 360) t.eq(bar.tip, 'false', `${what}: its name is its tooltip`);
				t.ok(bar.out <= 0 && !bar.overlap.length, `${what}: nothing sticks out of the toolbar or overlaps: ${j(bar)}`);
				// (on the corkboard inside a folder the count gives way to the way up below 440 px, as before)
				const counted = !(mode === 'corkboard' && folder !== 'The Lighthouse');
				t.eq(!!bar.count, counted, `${what}: the count ${counted ? 'is there' : 'gives way to the way up'}`);
				if (bar.count) t.ok(bar.count.cut <= 0 && /^\d+( words)?$/.test(bar.count.text) && / words$/.test(bar.count.text) === w >= 360, `${what}: the count is whole: ${j(bar.count)}`);
				if (w < 360) t.ok(bar.button <= (where === 'a phone' ? 76 : 52), `${what}: the button takes its icon and chevron’s room and no more: ${bar.button} px`);
				// (without the name the way up is never cut to less than a few letters; and it has the room the name took: more at 359 px,
				// without the name, than at 360 px with it)
				if (folder !== 'The Lighthouse') {
					t.ok(bar.up && bar.up.text === 'The Lighthouse' && (w >= 360 || bar.up.w >= 40), `${what}: the way up is there: ${j(bar.up)}`);
					ups[`${folder} ${mode} ${w}`] = bar.up.w;
					if (w === 360) t.ok(ups[`${folder} ${mode} 359`] > bar.up.w || bar.up.cut <= 0, `${what}: the way up had more room at 359 px, without the mode’s name (${ups[`${folder} ${mode} 359`]} px), than it has here with it (${bar.up.w} px)`);
				}
			}
		}
	}
}

test('under 360 px the mode button is its icon alone, named in its tooltip and to a screen reader; from 360 px it says its name: a narrow pane', withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); return 1; })()`);
	await openView(p);
	try {
		// (the window as wide as leaves the pane that width: the ribbon is beside it)
		const pane = async (w) => {
			for (let i = 0, win = w + 44; i < 3; i++) {
				await p.send('Emulation.setDeviceMetricsOverride', { width: win, height: 800, deviceScaleFactor: 1, mobile: false });
				await p.sleep(400);
				const now = await p.ev(`Math.round(document.querySelector('.workspace-leaf.mod-active .binders-view').getBoundingClientRect().width)`);
				if (now === w) break;
				win += w - now;
			}
		};
		await modeButtonAt(p, t, 'a pane', pane);
		// with a mouse that hovers (--hover), the tooltip itself
		if (await p.pointer() === 'mouse') {
			await pane(359);
			t.eq(await p.hover('.workspace-leaf.mod-active .binders-mode-button'), 'View as: Manuscript', 'at 359 px its name is its tooltip');
		}
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await p.sleep(300);
	}
}));

test('under 360 px the mode button is its icon alone, named in its tooltip and to a screen reader; from 360 px it says its name: a phone', withTidy(async (p, h, t) => {
	const metrics = (width) => p.send('Emulation.setDeviceMetricsOverride', { width, height: 740, deviceScaleFactor: 1, mobile: true });
	await metrics(320);
	await reload(p, true);
	await p.focusMain();
	try {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		await modeButtonAt(p, t, 'a phone', async (w) => { await metrics(w); await p.sleep(500); });
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
}));

// A closed view: what was still on its way when it closed draws nothing.
test('a view closed while binders were still being found stays closed: no board is made in it afterwards', withTidy(async (p, h, t) => {
	await p.ev(`(() => { window.__settled = ${B}.settled; ${B}.settled = new Promise(r => { window.__settle = r; }); return 1; })()`);
	try {
		// a folder that isn't there yet (at a cold start, one the vault hasn't listed yet): the view says it's loading
		await p.ev(`(async () => { const leaf = app.workspace.getLeaf(true); await leaf.setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse/Part Three' }, active: true }); window.__closing = leaf; window.__closed = leaf.view; return 1; })()`);
		await p.sleep(600);
		t.eq(await p.ev(`__closed.contentEl.querySelector('.binders-empty')?.textContent ?? null`), 'Loading…', 'the view is waiting for binders to be found');
		// closed; then the folder turns up, and binders are found
		await p.ev(`(() => { __closing.detach(); return 1; })()`);
		await p.sleep(200);
		await p.ev(`app.vault.createFolder('The Lighthouse/Part Three').then(() => 1)`);
		await p.sleep(400);
		await p.ev(`(() => { window.__settle(); return 1; })()`);
		await p.sleep(600);
		const after = await p.ev(`({ mode: __closed.current != null, drawn: !!__closed.contentEl.querySelector('.binders-toolbar, .binders-mode, .binders-board'), text: __closed.contentEl.textContent, attached: __closed.contentEl.isConnected })`);
		t.eq(j(after), j({ mode: false, drawn: false, text: 'Loading…', attached: false }), 'nothing was made in the closed view');
		// (and a view that is open does draw once they are found)
		await openView(p, 'The Lighthouse/Part Three');
		t.ok(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-view .binders-card-new')`), 'an open view on that folder shows its board');
	} finally {
		await p.ev(`(() => { window.__settle?.(); ${B}.settled = window.__settled; delete window.__closed; delete window.__closing; return 1; })()`);
	}
}));

// A view in a window of its own (a popout). The tests' pointer and keys go to the main window, so here the popout's
// own events are made in it; its size is set through Electron (headless, a new window is a pixel wide).
const POP = `window.__pop.view.contentEl`;
async function popoutSize(p, width, height) {
	await p.ev(`(async () => { const w = ${POP}.win, r = window.require('@electron/remote'); const mine = w.electronWindow ?? r.BrowserWindow.getAllWindows().find(b => { try { return b.id !== r.getCurrentWindow().id && b.webContents.getURL() === w.location.href && b.getContentSize()[0] === w.innerWidth; } catch { return false; } }); mine.setContentSize(${width}, ${height}); for (let i = 0; i < 40 && (w.innerWidth !== ${width} || w.innerHeight !== ${height}); i++) await new Promise(r => setTimeout(r, 50)); return 1; })()`);
	await p.sleep(400);
	const got = await p.ev(`[${POP}.win.innerWidth, ${POP}.win.innerHeight]`);
	if (got[0] !== width || got[1] !== height) throw new Error(`the popout is ${got}, not ${width} × ${height}`);
}
const popoutClose = (p) => p.ev(`(async () => { try { window.__pop?.detach(); } catch { /* gone */ } delete window.__pop; await new Promise(r => setTimeout(r, 300)); return 1; })()`);
const cardSize = (p) => p.ev(`[...${POP}.querySelector('.binders-board').classList].find(c => c.startsWith('mod-cards-'))`);
const cardsAre = (p, size) => until(p, `${POP}.querySelector('.binders-board').classList.contains('mod-cards-${size}')`, 1500);

test('in a window of its own, the board by label follows the window’s size: narrowed, its cards are small; so does a board moved there from the main window', withTidy(async (p, h, t) => {
	const state = { folder: 'The Lighthouse/Part One', mode: 'corkboard', options: { arrange: 'label' } };
	try {
		// opened there
		await p.ev(`(async () => { await ${B}.ready; const leaf = app.workspace.openPopoutLeaf(); await leaf.setViewState({ type: 'binders-view', state: ${j(state)}, active: true }); window.__pop = leaf; return 1; })()`);
		await until(p, `!!${POP}.querySelector('.binders-lanes .binders-card')`);
		t.ok(await p.ev(`${POP}.win !== window && ${POP}.doc !== document`), 'the view is in a window of its own');
		await popoutSize(p, 1000, 700);
		await cardsAre(p, 'medium');
		t.eq(await cardSize(p), 'mod-cards-medium', 'a wide window: cards of the usual size');
		await popoutSize(p, 480, 700);
		await cardsAre(p, 'small');
		t.eq(await cardSize(p), 'mod-cards-small', 'narrowed: small cards, as in a narrow pane of the main window');
		await popoutSize(p, 1000, 700);
		await cardsAre(p, 'medium');
		t.eq(await cardSize(p), 'mod-cards-medium', 'and widened again: the usual size');
		await popoutClose(p);
		// opened in the main window, then moved to one of its own
		await p.ev(`(async () => { const leaf = app.workspace.getLeaf(true); await leaf.setViewState({ type: 'binders-view', state: ${j(state)}, active: true }); window.__pop = leaf; window.__was = leaf.view; return 1; })()`);
		await until(p, `!!${POP}.querySelector('.binders-lanes .binders-card')`);
		t.ok(await p.ev(`${POP}.win === window`), 'a view in the main window');
		await p.ev(`(() => { app.workspace.moveLeafToPopout(window.__pop); return 1; })()`);
		await until(p, `${POP}.win !== window && !!${POP}.querySelector('.binders-lanes .binders-card')`);
		t.ok(await p.ev(`${POP}.win !== window`), 'moved to a window of its own');
		await popoutSize(p, 1000, 700);
		await cardsAre(p, 'medium');
		await popoutSize(p, 480, 700);
		await cardsAre(p, 'small');
		t.eq(await cardSize(p), 'mod-cards-small', `narrowed there: small cards (${await p.ev(`window.__pop.view === window.__was ? 'the same view, moved' : 'a view made again there'`)})`);
	} finally {
		await popoutClose(p);
		await p.ev(`(() => { delete window.__was; return 1; })()`);
		await p.focusMain();
	}
}));

test('in a window of its own, a card dragged to the board’s edge scrolls the board though the main window draws no frames (as when it is minimised)', withTidy(async (p, h, t) => {
	const before = await texts(p), order = await contents(p);
	try {
		await p.ev(`(async () => { await ${B}.ready; const leaf = app.workspace.openPopoutLeaf(); await leaf.setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'corkboard' }, active: true }); window.__pop = leaf; return 1; })()`);
		await until(p, `!!${POP}.querySelector('.binders-card[data-path]')`);
		// one column of cards in a short window: more board than fits
		await popoutSize(p, 480, 320);
		const box = await p.ev(`(() => { const s = ${POP}.querySelector('.binders-corkboard'); s.scrollTop = 0; return { more: s.scrollHeight - s.clientHeight, top: s.scrollTop }; })()`);
		t.ok(box.more > 100, `the board is taller than the window: ${j(box)}`);
		// a card picked up and carried to the foot of the board, and held there, with the main window's frames stopped
		const scrolled = await p.ev(`(async () => {
			const el = ${POP}, w = el.win, d = el.doc, s = el.querySelector('.binders-corkboard'), card = el.querySelector('.binders-card[data-path]');
			const r = card.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 20, foot = s.getBoundingClientRect().bottom - 4;
			const ev = (type, cx, cy, buttons) => new w.PointerEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true });
			const raf = window.requestAnimationFrame;
			window.requestAnimationFrame = () => 0;
			try {
				card.dispatchEvent(ev('pointerdown', x, y, 1));
				d.dispatchEvent(ev('pointermove', x, y + 12, 1));
				const dragging = !!d.querySelector('.binders-drag-ghost');
				for (let i = 0; i < 16; i++) { d.dispatchEvent(ev('pointermove', x, foot, 1)); await new Promise(r => setTimeout(r, 50)); }
				const top = s.scrollTop;
				d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
				d.dispatchEvent(ev('pointerup', x, foot, 0));
				return { dragging, top, ghost: !!d.querySelector('.binders-drag-ghost') };
			} finally { window.requestAnimationFrame = raf; }
		})()`);
		t.ok(scrolled.dragging, 'the card is being dragged');
		t.ok(scrolled.top > 20, `held at the foot of the board, the board scrolls: ${scrolled.top} px`);
		t.eq(scrolled.ghost, false, 'Escape puts the card back');
		await p.sleep(300);
		t.eq(j(await contents(p)), j(order), 'and nothing moved');
		same(t, before, await texts(p));
	} finally {
		await popoutClose(p);
		await p.focusMain();
	}
}));

test('the manuscript shows the notes that pass the filter, under the folders that have any; a section being typed in stays till it’s saved', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await h.run('show-manuscript');
	const titles = () => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-title, .workspace-leaf.mod-active .binders-manuscript-heading')].map(e => e.textContent)`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-title').length === 7`);
	t.ok(await p.ev(`!document.querySelector('.workspace-leaf.mod-active .binders-filter-button').classList.contains('is-hidden')`), 'the manuscript has the Filter button too');
	const f = await p.at('.workspace-leaf.mod-active .binders-filter-button');
	await p.click(f.x, f.y);
	await clickMenu(p, 'Revised');
	await closeMenus(p);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-title').length === 1`);
	t.eq(j(await titles()), j(['Part One', 'Arrival']), 'only the revised note, under its folder');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent`), '18 of 106 words', 'the count says how much of the folder shows');
	await p.click(f.x, f.y);
	await clickMenu(p, 'Clear filter');
	await closeMenus(p);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-title').length === 7`);
	t.eq((await titles()).length, 9, 'cleared: everything is back');
	same(t, before, await texts(p));
}));

test('what is still in a field when Obsidian quits is written first: a card’s synopsis, the folder’s synopsis, a card’s new name', withTidy(async (p, h, t) => {
	const L = 'The Lighthouse/', before = await texts(p);
	// (what Obsidian does as it quits: it waits for the promises it's handed, then closes the window)
	const quit = () => p.ev(`(async () => { const ps = []; app.workspace.trigger('quit', { addPromise: (x) => ps.push(x), add: (fn) => ps.push(Promise.resolve().then(fn)) }); await Promise.all(ps); return ps.length; })()`);
	const fmOf = async (path) => split(await read(p, path)).yaml;
	await openView(p);
	// a card's synopsis: the card selected, then its synopsis clicked
	const c = await p.at(card(L + 'Epilogue.md'));
	await p.click(c.x, c.t + c.h - 12);
	const s = await p.at(card(L + 'Epilogue.md') + ' .binders-card-synopsis');
	await p.click(s.x, s.y);
	t.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', 'a card’s synopsis is being typed in');
	await p.type(' Typed late.');
	t.ok((await quit()) > 0, 'the quit is asked to wait');
	t.ok(/^synopsis: .*Typed late\.$/m.test(await fmOf(L + 'Epilogue.md')), 'and the synopsis is in the note by the time it’s done: ' + (await fmOf(L + 'Epilogue.md')));
	t.eq(split(await read(p, L + 'Epilogue.md')).body, split(before[L + 'Epilogue.md']).body, 'whose text is as it was');
	await p.key('Escape');
	// the folder's own synopsis, under the toolbar
	await p.ev(`(() => { document.querySelector('.workspace-leaf.mod-active .binders-view-synopsis').focus(); return 1; })()`);
	await p.key('Enter');
	await p.type('A light that goes out.');
	await quit();
	t.ok(/^synopsis: A light that goes out\.$/m.test(await fmOf(NOTE)), 'the folder’s synopsis too');
	await p.key('Escape');
	// a name
	await p.ev(`(() => { document.querySelector(${j(card(L + 'Prologue.md'))}).focus(); return 1; })()`);
	await p.key('F2');
	await p.type('Before the light');
	await quit();
	t.ok(await exists(p, L + 'Before the light.md'), 'and a name typed over a card’s title: the note is renamed');
	t.eq(split(await read(p, L + 'Before the light.md')).body, split(before[L + 'Prologue.md']).body, 'with its text whole');
	await p.key('Escape');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Before the light.md')}, ${j(L + 'Prologue.md')}).then(() => 1)`);
	await p.sleep(400);
}));
