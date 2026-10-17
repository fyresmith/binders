// The title property (src/shown-name.ts; GitHub issue #34): a note that has one is shown by it wherever Binders shows a
// note's name (the views, the inspector, the contents, the file explorer, export's headings), and editing a shown name
// changes the property, not the file's name. A note without one is shown, and renamed, by its file name as ever.
import { WIN, closeAll, open as openExport } from './specs-export.mjs';
import { B, NOTE, PL, VIEW, clickMenu, j, openView, read, split, texts, until, withTidy, writeRaw } from './view-helpers.mjs';
import { plant, lastDays, recordToday, scenesOf } from './progress-history.mjs';

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export const specs = [];
const test = (name, fn, o = {}) => specs.push({ name: 'title property: ' + name, fn: withTidy(fn), ...o });

const L = 'The Lighthouse/';
const ARRIVAL = L + 'Part One/Arrival.md', KEEPER = L + 'Part One/The keeper.md';
const TITLE = 'The supply boat';
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const I = '.workspace-leaf-content[data-type="binders-inspector"] .binders-inspector';
const C = '.workspace-leaf-content[data-type="binders-contents"] .binders-contents-list';
const ACTIVE = '.workspace-leaf.mod-active';

/** Gives a note a `title` property (the first line of its properties), keeping everything else as it is. */
async function titled(p, path, title = TITLE, prop = 'title') {
	const text = await read(p, path), { yaml } = split(text);
	await writeRaw(p, path, yaml ? text.replace(/^---\n/, `---\n${prop}: ${title}\n`) : `---\n${prop}: ${title}\n---\n${text}`);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter?.[${j(prop)}] === ${j(title)}`, 4000);
	await p.sleep(300);
}
const mode = async (p, m, folder = 'The Lighthouse/Part One') => {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`);
	await p.sleep(m === 'manuscript' ? 1000 : 500);
};
const one = (p, sel) => p.ev(`document.querySelector(${j(sel)})?.textContent ?? null`);
const frontmatter = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? {})`).then(JSON.parse);
/** The explorer's text for a note, with its folders open. */
async function explorerName(p, path) {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); for (const f of ['The Lighthouse', 'The Lighthouse/Part One']) ${EXP}.fileItems[f]?.setCollapsed?.(false); return 1; })()`);
	await p.sleep(400);
	return p.ev(`(() => { const it = ${EXP}.fileItems[${j(path)}]; const el = document.querySelector('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path=${j(path)}] .tree-item-inner'); return el ? el.textContent : 'NO ROW (item ' + !!it + ', status ' + ${PL}.explorer.status + ')'; })()`);
}
const setSettings = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(400));
/** The inspector and the contents in the right sidebar, as the plugin puts them. */
async function side(p) {
	await p.ev(`(async () => {
		const ws = app.workspace;
		for (const t of ['binders-inspector', 'binders-contents']) ws.detachLeavesOfType(t);
		ws.rightSplit.expand();
		const a = ws.getRightLeaf(false); await a.setViewState({ type: 'binders-contents', active: true });
		const b = ws.getRightLeaf(true); await b.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(b);
		const main = ws.getMostRecentLeaf(ws.rootSplit); if (main) ws.setActiveLeaf(main, { focus: true });
	})().then(() => 1)`);
	await p.sleep(500);
}

test('the corkboard, the outliner, the manuscript and the timeline show the title; a note without one shows its file name', async (p, h, t) => {
	await titled(p, ARRIVAL);
	await writeRaw(p, ARRIVAL, (await read(p, ARRIVAL)).replace(/^---\n/, '---\nstory-date: 1987-06-14\n'));
	await p.sleep(500);
	await mode(p, 'corkboard');
	const card = (path) => `${ACTIVE} .binders-card[data-path=${j(path)}] .binders-card-title`;
	t.eq(await one(p, card(ARRIVAL)), TITLE, 'corkboard: a card shows the title');
	t.eq(await one(p, card(KEEPER)), 'The keeper', 'and a card without one the file name');
	t.eq(await p.ev(`document.querySelector(${j(ACTIVE + ` .binders-card[data-path=${j(ARRIVAL)}]`)}).getAttribute('aria-label')`), TITLE, 'and says it to a screen reader');
	await mode(p, 'outliner');
	const row = (path) => `${ACTIVE} .binders-outliner-row[data-path=${j(path)}] .binders-outliner-name`;
	t.eq(await one(p, row(ARRIVAL)), TITLE, 'outliner: a row shows the title');
	t.eq(await one(p, row(KEEPER)), 'The keeper', 'and a row without one the file name');
	await mode(p, 'manuscript');
	const titles = await p.ev(`[...document.querySelectorAll('${ACTIVE} .binders-manuscript-title')].map(e => e.textContent)`);
	t.ok(titles.includes(TITLE) && !titles.includes('Arrival') && titles.includes('The keeper'), 'manuscript: the heading shows the title: ' + titles.join(' | '));
	await mode(p, 'timeline');
	const line = await p.ev(`[...document.querySelectorAll('${ACTIVE} .binders-timeline-board .binders-card[data-path=${j(ARRIVAL)}] .binders-card-title')].map(e => e.textContent)`);
	t.eq(j(line), j([TITLE]), 'timeline: a dated scene’s card shows the title');
});

test('the inspector, the contents and the file explorer show the title', async (p, h, t) => {
	await titled(p, ARRIVAL);
	t.eq(await explorerName(p, ARRIVAL), TITLE, 'file explorer: a note in a binder shows its title');
	t.eq(await explorerName(p, KEEPER), 'The keeper', 'and one without it its file name');
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(ARRIVAL)})`), 'the file is still called Arrival');
	await mode(p, 'corkboard');
	await side(p);
	await p.ev(`(() => { const v = ${VIEW}; app.workspace.setActiveLeaf(v.leaf, { focus: true }); v.revealItem(app.vault.getAbstractFileByPath(${j(ARRIVAL)})); return 1; })()`);
	t.ok(await until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === ${j(TITLE)}`, 4000), 'inspector: names the note by its title');
	const rows = await p.ev(`[...document.querySelectorAll(${j(C + ' .tree-item-inner')})].map(e => e.textContent)`);
	t.ok(rows.includes(TITLE) && !rows.includes('Arrival') && rows.includes('The keeper'), 'contents: the row shows the title: ' + rows.join(' | '));
});

test('a title put in or taken out of a note changes what is shown at once', async (p, h, t) => {
	await mode(p, 'corkboard');
	const title = `${ACTIVE} .binders-card[data-path=${j(ARRIVAL)}] .binders-card-title`;
	t.eq(await one(p, title), 'Arrival', 'to begin with, the file name');
	await titled(p, ARRIVAL);
	t.ok(await until(p, `document.querySelector(${j(title)})?.textContent === ${j(TITLE)}`, 4000), 'the card follows a title written to the note');
	t.eq(await explorerName(p, ARRIVAL), TITLE, 'and so does the file explorer');
	await writeRaw(p, ARRIVAL, (await read(p, ARRIVAL)).replace(/^title: .*\n/m, ''));
	t.ok(await until(p, `document.querySelector(${j(title)})?.textContent === 'Arrival'`, 4000), 'and again when it is taken away');
	t.eq(await explorerName(p, ARRIVAL), 'Arrival', 'the file explorer goes back to the file name');
});

test('editing a shown title changes the property and leaves the file and its text alone', async (p, h, t) => {
	await titled(p, ARRIVAL);
	const before = await texts(p);
	await mode(p, 'corkboard');
	const card = `${ACTIVE} .binders-card[data-path=${j(ARRIVAL)}]`;
	const c = await p.at(card);
	await p.right(c.x, c.y);
	await clickMenu(p, 'Rename');
	t.ok(await p.ev(`document.activeElement.matches(${j(card + ' input')})`), 'the title is editable');
	t.eq(await p.ev(`document.activeElement.value`), TITLE, 'and holds the title, not the file name');
	await p.key('a', 'ctrl');
	await p.type('The boat from the mainland');
	await p.key('Enter');
	t.ok(await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.title === 'The boat from the mainland'`, 4000), 'the note’s title is the new one');
	await p.ev(`${PL}.binders.flush().then(() => 1)`);
	const after = await texts(p);
	t.ok(!!after[ARRIVAL] && !after[L + 'Part One/The boat from the mainland.md'], 'no file was renamed');
	t.eq(after[ARRIVAL], before[ARRIVAL].replace(`title: ${TITLE}\n`, 'title: The boat from the mainland\n'), 'only the title line of the note changed');
	for (const [path, text] of Object.entries(before)) if (path !== ARRIVAL && path !== NOTE) t.eq(after[path], text, `${path} is as it was`);
	t.ok(await until(p, `document.querySelector(${j(card + ' .binders-card-title')})?.textContent === 'The boat from the mainland'`, 4000), 'and the card shows it');
}, { tier: 'guard' });

test('editing the title in the outliner and in the manuscript changes the property too', async (p, h, t) => {
	await titled(p, ARRIVAL);
	await mode(p, 'outliner');
	const name = `${ACTIVE} .binders-outliner-row[data-path=${j(ARRIVAL)}] .binders-outliner-name`;
	const r = await p.at(name);
	await p.right(r.x, r.y);
	await clickMenu(p, 'Rename');
	await p.key('a', 'ctrl');
	await p.type('Landfall');
	await p.key('Enter');
	t.ok(await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.title === 'Landfall'`, 4000), 'outliner: the title changed');
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(ARRIVAL)})`), 'and the file is still Arrival');
	await mode(p, 'manuscript');
	const head = `[...document.querySelectorAll('${ACTIVE} .binders-manuscript-title')].find(e => e.textContent === 'Landfall')`;
	t.ok(await p.ev(`!!${head}`), 'manuscript: the heading shows it');
	await p.ev(`(() => { const h = ${head}; h.focus(); return 1; })()`);
	await p.key('F2');
	await until(p, `!!document.querySelector('${ACTIVE} .binders-manuscript-title.is-renaming')`, 4000);
	await p.key('a', 'ctrl');
	await p.type('Arrival at last');
	await p.key('Enter');
	t.ok(await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.title === 'Arrival at last'`, 4000), 'manuscript: the title changed');
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(ARRIVAL)})`) && !(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival at last.md')})`)), 'and the file kept its name');
}, { tier: 'guard' });

test('a note without a title is renamed as it always was', async (p, h, t) => {
	await mode(p, 'corkboard');
	const c = await p.at(`${ACTIVE} .binders-card[data-path=${j(KEEPER)}]`);
	await p.right(c.x, c.y);
	await clickMenu(p, 'Rename');
	await p.key('a', 'ctrl');
	await p.type('The lighthouse keeper');
	await p.key('Enter');
	t.ok(await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The lighthouse keeper.md')})`, 4000), 'the file is renamed');
	t.ok(!('title' in (await frontmatter(p, L + 'Part One/The lighthouse keeper.md'))), 'and no title property is written');
}, { tier: 'guard' });

test('the property’s name is a setting: renaming it switches to the other property', async (p, h, t) => {
	await titled(p, ARRIVAL, TITLE, 'title');
	await titled(p, KEEPER, 'Harrow', 'name');
	await mode(p, 'corkboard');
	const title = (path) => `${ACTIVE} .binders-card[data-path=${j(path)}] .binders-card-title`;
	t.eq(await one(p, title(ARRIVAL)), TITLE, 'with “title”, the note that has it is shown by it');
	t.eq(await one(p, title(KEEPER)), 'The keeper', 'and one with “name” is not');
	await setSettings(p, { titleProp: 'name' });
	t.ok(await until(p, `document.querySelector(${j(title(KEEPER))})?.textContent === 'Harrow'`, 4000), 'with “name”, the other note is shown by its name');
	t.eq(await one(p, title(ARRIVAL)), 'Arrival', 'and the first goes back to its file name');
	t.eq(await explorerName(p, KEEPER), 'Harrow', 'the file explorer follows');
	t.eq(await explorerName(p, ARRIVAL), 'Arrival', 'both ways');
});

test('the file explorer shows the title whether or not binder order is on', async (p, h, t) => {
	await titled(p, ARRIVAL);
	t.eq(await explorerName(p, ARRIVAL), TITLE, 'order on: the title');
	await setSettings(p, { orderExplorer: false });
	t.eq(await explorerName(p, ARRIVAL), TITLE, 'order off: the title too (the order is the only thing that setting turns off)');
	t.eq(await explorerName(p, KEEPER), 'The keeper', 'and a note without one its file name');
	await setSettings(p, { orderExplorer: true });
	t.eq(await explorerName(p, ARRIVAL), TITLE, 'and the title is still there with the order back on');
	// a note outside every binder is never touched
	await writeRaw(p, 'Loose.md', '---\ntitle: Not in a binder\n---\nText.\n');
	await p.sleep(500);
	t.eq(await p.ev(`document.querySelector('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="Loose.md"] .tree-item-inner')?.textContent ?? null`), 'Loose', 'a note outside any binder keeps its file name');
});

test('export’s headings use the title', async (p, h, t) => {
	await titled(p, ARRIVAL);
	await openExport(p);
	const heads = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-heading')].map(e => e.innerText.replace(/\\n/g, ' / '))`);
	t.ok(heads.some((x) => x.endsWith(TITLE)) && !heads.some((x) => x.endsWith('Arrival')), 'the preview’s chapter heading is the title: ' + heads.join(' | '));
	await p.ev(`(() => { document.querySelector('${WIN} .binders-snapshots-compare').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} .binders-export-outline .binders-export-row')`);
	const rows = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].map(r => r.querySelector('.nav-file-title-content').textContent)`);
	t.ok(rows.includes(TITLE) && !rows.includes('Arrival') && rows.includes('The keeper'), 'and Contents lists it by the title: ' + rows.join(' | '));
	await closeAll(p);
});

test('Obsidian’s own rename in the file explorer still renames the file, and leaves the title', async (p, h, t) => {
	await titled(p, ARRIVAL);
	t.eq(await explorerName(p, ARRIVAL), TITLE, 'the explorer shows the title');
	await p.ev(`(() => { ${EXP}.startRenameFile(app.vault.getAbstractFileByPath(${j(ARRIVAL)})); return 1; })()`);
	await p.sleep(400);
	const typed = await p.ev(`document.querySelector('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path=${j(ARRIVAL)}] .tree-item-inner')?.textContent`);
	t.eq(typed, 'Arrival', 'the name to edit is the file’s');
	await p.key('a', 'ctrl');
	await p.type('Landfall');
	await p.key('Enter');
	t.ok(await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Landfall.md')})`, 4000), 'the file is renamed');
	t.eq((await frontmatter(p, L + 'Part One/Landfall.md')).title, TITLE, 'the title is as it was');
	t.eq(await explorerName(p, L + 'Part One/Landfall.md'), TITLE, 'and still what the explorer shows');
}, { tier: 'guard' });

const POT = '.modal.binders-pot', FSNAP = '.modal.binders-folder-snapshots', BINDER = 'The Lighthouse';
/** Closes whatever windows and menus are open. */
async function closeWindows(p) {
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); }
}
/** The progress window on a binder, with its page drawn. */
async function progressWindow(p, folder = BINDER) {
	await closeWindows(p);
	await openView(p, folder);
	await p.ev(`app.commands.executeCommandById('binders:show-progress')`);
	await until(p, `!!document.querySelector('${POT} .binders-chart-life, ${POT} .binders-pot-nothing')`, 6000);
	await p.sleep(250);
}
const openNote = (p, path) => p.ev(`app.workspace.openLinkText(${j(path)}, '', false).then(() => 1)`).then(() => p.sleep(500));

test('the progress window names a note by its title, in the text’s facts and in the parts', async (p, h, t) => {
	// the longest note in a folder is the one the record and the text both name
	const scenes = await scenesOf(p, BINDER), today = recordToday();
	const inFolder = scenes.filter((s) => s.rel.includes('/') && s.words > 0), top = inFolder.reduce((a, s) => (s.words > a.words ? s : a));
	const folder = top.rel.slice(0, top.rel.indexOf('/')), LONG = 'The longest one';
	const base = top.rel.slice(top.rel.lastIndexOf('/') + 1);
	await titled(p, `${L}${top.rel}.md`, LONG);
	await plant(p, BINDER, lastDays(scenes, today, 20).files);
	await progressWindow(p);
	t.eq((await frontmatter(p, `${L}${top.rel}.md`)).title, LONG, 'the note has its title');
	await p.ev(`(() => { const s = document.querySelector('${POT} select.binders-pot-scope'); s.value = ${j(folder)}; s.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(400);
	const f = await p.ev(`Object.fromEntries([...document.querySelectorAll('${POT} dt.binders-pot-fact-label')].map(dt => [dt.textContent, dt.nextElementSibling.querySelector('.binders-pot-fact-value').textContent]))`);
	t.eq(f['Longest scene'], LONG, 'the text’s “Longest scene” is the title: ' + j(f['Longest scene']));
	const names = await p.ev(`(() => { const d = [...document.querySelectorAll('${POT} .binders-pot-table')].find(x => x.querySelector('caption')?.textContent === 'When each was written'); return d ? [...d.querySelectorAll('tbody th')].map(e => e.textContent) : null; })()`);
	t.ok(!!names && names.includes(LONG) && !names.includes(base), 'the parts table names it by the title: ' + j(names));
	await closeWindows(p);
});

test('snapshot windows: a note’s is headed by its title, and a folder’s list names a note by its title', async (p, h, t) => {
	await titled(p, ARRIVAL);
	await openView(p, BINDER);
	await p.ev(`app.commands.executeCommandById('binders:take-snapshots')`);
	await p.sleep(800);
	await p.ev(`${B}.snapshotsSettle().then(() => 1)`);
	await openView(p, BINDER);
	await p.ev(`app.commands.executeCommandById('binders:show-binder-snapshots')`);
	await until(p, `!!document.querySelector('${FSNAP}')`, 6000);
	await p.sleep(300);
	await p.ev(`(() => { const r = document.querySelector('${FSNAP} .binders-snapshots-list .modal-sidebar-list-item, ${FSNAP} .binders-snapshots-list [role="option"]'); r?.click(); return 1; })()`);
	await p.sleep(400);
	const rows = await p.ev(`[...document.querySelectorAll('${FSNAP} .binders-folder-snapshots-row .tree-item-inner')].map(e => e.textContent)`);
	t.ok(rows.includes(TITLE) && !rows.includes('Arrival'), 'the folder snapshot lists the note by its title: ' + rows.join(' | '));
	await closeWindows(p);
	await openNote(p, ARRIVAL);
	await p.ev(`app.commands.executeCommandById('binders:show-snapshots')`);
	await until(p, `!!document.querySelector('.modal.binders-snapshots')`, 6000);
	t.eq(await p.ev(`document.querySelector('.modal.binders-snapshots .modal-title')?.textContent ?? null`), `Snapshots of “${TITLE}”`, 'the note’s snapshots are headed by its title');
	await closeWindows(p);
});

test('the Scrivener project names a titled note by its title, and its file name is kept for the links', async (p, h, t) => {
	await p.ev(`(async () => { app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportOutside = true; pl.settings.exportSnapshots = true; await pl.saveData(pl.settings); })().then(() => 1)`);
	await titled(p, ARRIVAL);
	// (the save dialog stands in: the folder is written where it would be, in Exports, and read back here)
	await p.ev(`(() => { const pl = ${PL}; window.__bx ??= { real: pl.exportHost.desktop }; pl.exportHost.desktop = (app) => { const d = window.__bx.real(app); return d && { ...d, pick: async (start) => start }; }; return 1; })()`);
	try {
		await openView(p, BINDER);
		await p.ev(`app.commands.executeCommandById('binders:export')`);
		await until(p, `!!document.querySelector('.modal.binders-export [role="option"]')`, 6000);
		await p.sleep(300);
		await p.ev(`(() => { [...document.querySelectorAll('.modal.binders-export [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === 'Scrivener project').click(); return 1; })()`);
		await until(p, `!!document.querySelector('.modal.binders-export .binders-export-binder .binders-export-row')`, 8000);
		await p.sleep(300);
		await p.ev(`[...document.querySelectorAll('.modal.binders-export button')].filter(b => b.textContent === 'Export' && b.getBoundingClientRect().width).pop().click()`);
		await until(p, `(document.querySelector('.modal.binders-export .binders-export-status')?.textContent ?? '').startsWith('Saved to')`, 10000);
		const at = join(p.vaultDir, 'Exports', 'The Lighthouse.scriv'), files = {};
		const walk = (dir, rel) => { for (const n of readdirSync(dir)) { const full = join(dir, n), r = rel ? `${rel}/${n}` : n; if (statSync(full).isDirectory()) walk(full, r); else files[r] = readFileSync(full); } };
		walk(at, '');
		const x = Buffer.from(files[Object.keys(files).find((n) => n.endsWith('.scrivx'))]).toString('utf8');
		const items = [...x.matchAll(/<BinderItem UUID="([^"]+)" Type="([^"]+)"[^>]*>\s*<Title>([^<]*)<\/Title>\s*<MetaData>([\s\S]*?)<\/MetaData>/g)].map((m) => ({ type: m[2], title: m[3], meta: m[4] }));
		const note = items.find((i) => i.title === TITLE);
		t.ok(!!note && note.type === 'Text', 'the binder item is titled by the title: ' + items.map((i) => i.title).join('|'));
		t.ok(!items.some((i) => i.title === 'Arrival') && !!note?.meta.includes('<Value>Part One/Arrival</Value>'), 'and its path in the binder is still the file’s');
	} finally {
		await closeWindows(p);
		await p.ev(`(async () => { const pl = ${PL}; if (window.__bx) pl.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); pl.settings.exportKind = 'manuscript'; pl.settings.exportOutside = true; pl.settings.exportSnapshots = true; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
});
