// The binder view (src/view/BinderView.ts): opening it, its state, the breadcrumb, modes, word count, filter, the
// folder's synopsis, read-only newer-format binders, and following renames. Every test that changes files checks no
// text was lost.
import { B, NOTE, PL, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, j, menuItems, openView, read, reload, same, split, texts, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'view: ' + name, fn });

const leaves = (p) => p.ev(`app.workspace.getLeavesOfType('binders-view').length`);
const headerTitle = (p) => p.ev(`document.querySelector('.workspace-leaf.mod-active .view-header-title')?.textContent`);
const tabTitle = (p) => p.ev(`app.workspace.getMostRecentLeaf().tabHeaderInnerTitleEl?.textContent`);
const crumbs = (p) => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-crumb')].map(e => e.textContent)`);
const LIGHTHOUSE_CARDS = ['The Lighthouse/Prologue.md', 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part One/Storm warning.md', 'The Lighthouse/Part Two/The wreck.md', 'The Lighthouse/Part Two/Lights out.md', 'The Lighthouse/Epilogue.md'];

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
	t.eq(j(await cards(p)), j(LIGHTHOUSE_CARDS), 'the cards are in binder order');
	at = await p.at(`.nav-folder-title[data-path="The Lighthouse/Part One"] .nav-folder-title-content`);
	await p.click(at.x, at.y);
	await until(p, `app.workspace.getLeavesOfType('binders-view')[0]?.getViewState().state.folder === 'The Lighthouse/Part One'`);
	await p.sleep(300);
	t.eq(await leaves(p), 1, 'the same view is reused');
	t.eq(await headerTitle(p), 'Part One', 'the header follows');
	t.eq(await tabTitle(p), 'Part One', 'so does the tab');
	t.eq(j(await crumbs(p)), j(['The Lighthouse', 'Part One']), 'the breadcrumb shows the way down');
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

test('state (folder, mode, filter, options) comes back after a reload', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`(() => { const v = ${VIEW}; v.setMode('plotgrid'); return 1; })()`);
	await p.ev(`(() => { const v = ${VIEW}; v.filter = { status: ['draft'], label: [] }; v.options = { stacks: true }; app.workspace.requestSaveLayout(); return 1; })()`);
	await p.ev(`app.workspace.requestSaveLayout.run().then(() => 1)`);
	await p.sleep(300);
	await reload(p);
	await until(p, `app.workspace.getLeavesOfType('binders-view').length > 0`);
	const st = await p.ev(`(async () => { const l = app.workspace.getLeavesOfType('binders-view')[0]; await l.loadIfDeferred?.(); return l.getViewState().state; })()`);
	t.eq(st.folder, 'The Lighthouse/Part One', 'the folder');
	t.eq(st.mode, 'plotgrid', 'the mode');
	t.eq(j(st.filter?.status), j(['draft']), 'the filter');
	t.eq(st.options?.stacks, true, 'the corkboard’s option');
	await p.ev(`(async () => { const l = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-view .binders-mode-plotgrid')`);
	t.eq(await headerTitle(p), 'Part One', 'the header after a reload');
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
	// a subfolder's heading goes down
	await openView(p, 'The Lighthouse');
	const hd = await p.at(`.workspace-leaf.mod-active .binders-group-title`);
	await p.click(hd.x, hd.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	t.eq(await headerTitle(p), 'Part One', 'the heading opens its folder');
});

test('the mode menu and commands switch modes; missing modes say they’re coming', async (p, h, t) => {
	await h.open('The Lighthouse/Prologue.md');
	t.ok(!(await p.ev(`app.commands.findCommand('binders:show-plotgrid').checkCallback(true)`)), 'mode commands need a binder view');
	await openView(p);
	t.ok(await p.ev(`app.commands.findCommand('binders:show-plotgrid').checkCallback(true)`), 'offered in a binder view');
	const at = await p.at(`.workspace-leaf.mod-active .binders-mode-button`);
	await p.click(at.x, at.y);
	t.eq(j(await menuItems(p)), j(['Corkboard', 'Plot grid', 'Manuscript']), 'the mode menu');
	await clickMenu(p, 'Manuscript');
	t.eq((await viewState(p)).mode, 'manuscript', 'switched');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-mode-button .text-button-label').textContent`), 'Manuscript', 'the button says so');
	if (!(await p.ev(`!!${PL}.modeFactories.manuscript`))) t.ok(/coming soon/.test(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-mode').textContent`)), 'a mode that isn’t there yet says so');
	await h.run('show-corkboard');
	await p.sleep(200);
	t.eq((await viewState(p)).mode, 'corkboard', 'the command switches back');
	t.eq((await cards(p)).length, 7, 'the corkboard is drawn again');
	// the pane's "More options" menu has them too
	const more = await p.at(`.workspace-leaf.mod-active .view-action[aria-label="More options"]`);
	await p.click(more.x, more.y);
	const items = await menuItems(p);
	t.ok(['Corkboard', 'Plot grid', 'Manuscript', 'Show subfolders as stacks'].every((x) => items.includes(x)), 'More options lists the modes and the stacks option: ' + items.join(', '));
	await closeMenus(p);
});

test('all three modes mount in the view, each scrolling itself; typing in the manuscript is saved on switching', withTidy(async (p, h, t) => {
	const before = await texts(p);
	const ARR = 'The Lighthouse/Part One/Arrival.md';
	await openView(p, 'The Lighthouse/Part One');
	const box = (sel) => p.ev(`(() => { const e = document.querySelector('.workspace-leaf.mod-active ' + ${j(sel)}); if (!e) return null; const r = e.getBoundingClientRect(), v = e.closest('.binders-view').getBoundingClientRect(); return { h: Math.round(r.height), inside: r.bottom <= v.bottom + 1, scrolls: getComputedStyle(e).overflowY }; })()`);
	let b = await box('.binders-corkboard');
	t.ok(b && b.h > 200 && b.inside && b.scrolls === 'auto', 'the corkboard fills the view and scrolls itself: ' + j(b));
	t.ok(!(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-filter-button').hasClass('is-hidden')`)), 'the corkboard has the filter');
	await h.run('show-plotgrid');
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-plotgrid table')`);
	b = await box('.binders-plotgrid');
	t.ok(b && b.h > 200 && b.inside, 'the plot grid fills the view: ' + j(b));
	t.ok(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-filter-button').hasClass('is-hidden')`), 'and has no filter (it shows every scene)');
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
	for (const m of ['manuscript', 'plotgrid', 'corkboard', 'plotgrid', 'manuscript', 'corkboard']) { await h.run('show-' + m); await p.sleep(150); }
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-mode > *').length`), 1, 'one mode drawn at a time');
	same(t, { ...before, [ARR]: now }, await texts(p));
}));

test('word count, and the binder’s target', withTidy(async (p, h, t) => {
	await openView(p);
	const count = () => p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent`);
	const cardWords = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card-words')].filter(e => !e.closest('.is-stack')).map(e => parseInt(e.textContent.replace(/,/g, ''), 10)).reduce((a, b) => a + b, 0)`);
	t.eq(await count(), `${cardWords} words`, 'the sum of the cards');
	// each card agrees with Obsidian's own count in the status bar
	const perCard = await p.ev(`Object.fromEntries([...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].map(c => [c.dataset.path, parseInt(c.querySelector('.binders-card-words').textContent, 10)]))`);
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
	await openView(p, 'The Lighthouse/Part One');
	const partOne = ['Arrival', 'The keeper', 'Storm warning'].reduce((a, x) => a + perCard['The Lighthouse/Part One/' + x + '.md'], 0);
	t.eq(await count(), `${partOne} words`, 'a subfolder counts its own notes, without the binder’s target');
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
	t.ok(['Status', 'draft', 'revised', 'idea'].every((x) => items.includes(x)), 'the statuses in use: ' + items.join(', '));
	await clickMenu(p, 'draft');
	t.eq(j(await cards(p)), j(['The Lighthouse/Prologue.md', 'The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part Two/The wreck.md']), 'only drafts');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-filter-button .text-button-label').textContent`), 'Filter (1)', 'the button says a filter is on');
	t.eq(j((await viewState(p)).filter.status), j(['draft']), 'kept in the view’s state');
	await p.click(at.x, at.y);
	await clickMenu(p, 'idea');
	t.eq((await cards(p)).length, 6, 'drafts or ideas');
	await p.click(at.x, at.y);
	await clickMenu(p, 'Clear filter');
	t.eq((await cards(p)).length, 7, 'all again');
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

test('follows its folder when it’s renamed, and says so when it’s gone', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part Two');
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Part Two')}, 'The Lighthouse/Part 2').then(() => 1)`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part 2'`);
	t.eq(await headerTitle(p), 'Part 2', 'the header follows (the view’s titleEl and leaf.updateHeader, internals: see docs/internals.md)');
	t.eq(await tabTitle(p), 'Part 2', 'and the tab');
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card')?.dataset.path.startsWith('The Lighthouse/Part 2/')`);
	t.eq(j(await cards(p)), j(['The Lighthouse/Part 2/The wreck.md', 'The Lighthouse/Part 2/Lights out.md']), 'the cards too');
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Part 2')}, 'The Lighthouse/Part Two').then(() => 1)`);
	await p.sleep(300);
	await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Part Three'); await app.vault.create('The Lighthouse/Part Three/Coda.md', 'x'); })().then(() => 1)`);
	await openView(p, 'The Lighthouse/Part Three');
	await p.ev(`app.vault.delete(${file('The Lighthouse/Part Three')}, true).then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-empty')`);
	t.ok(/isn’t in a binder/.test(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-empty').textContent`)), 'an empty state says the folder is gone');
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
		t.eq(await cut('.binders-group.is-folder .binders-group-name'), false, `a heading shows the whole name (pane ${pane}px)`);
	}
	await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
	await p.sleep(300);
}));
