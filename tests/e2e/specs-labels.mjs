// Labels, statuses and targets: the lists in Binders' settings tab (add, rename, recolor, delete, restore), the labels
// a card offers and shows (presets, a color of your own, a tint), label dots in the file explorer, and word count
// targets on cards. Settings are the plugin's own data (never a note), so each test puts them back.
import { NOTE, PL, answer, card, clickMenu, closeMenus, file, hoverMenu, j, menuItems, openView, read, same, split, texts, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const L = 'The Lighthouse/';
const DEFAULTS = `{ labels: [['Red','red'],['Orange','orange'],['Yellow','yellow'],['Green','green'],['Cyan','cyan'],['Blue','blue'],['Purple','purple'],['Pink','pink']].map(([name, color]) => ({ name, color })), statuses: ['Idea','Draft','Revised','Done'], explorerLabels: true }`;
const reset = (p) => p.ev(`(async () => { Object.assign(${PL}.settings, ${DEFAULTS}); await ${PL}.saveSettings(); try { app.setting.close(); } catch {} })().then(() => 1)`);
const test = (name, fn) => specs.push({ name: 'labels: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeMenus(p); await p.ev(`(() => { document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); return 1; })()`); await reset(p); } }) });

const set = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(300));
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? null)`).then(JSON.parse);
const saved = (p) => p.ev(`app.vault.adapter.read(app.vault.configDir + '/plugins/binders/data.json')`).then(JSON.parse);
// The settings dialog may be a window of its own: its page is reached through the tab, and worked by events.
const TAB = `app.setting.activeTab.containerEl`;
const openSettings = async (p) => { await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`); await until(p, `${TAB}.querySelectorAll('.binders-settings-label').length > 0`); };
const names = (p, kind) => p.ev(`[...${TAB}.querySelectorAll('.binders-settings-${kind} input[type="text"]')].map(i => i.value)`);
const typeName = (p, kind, i, value) => p.ev(`(() => { const el = ${TAB}.querySelectorAll('.binders-settings-${kind} input[type="text"]')[${i}]; el.focus(); el.value = ${j(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`).then(() => p.sleep(200));
const press = (p, label, within = '') => p.ev(`(() => { const b = ${TAB}.querySelector(${j(`${within} [aria-label="${label}"]`.trim())}); if (!b) return false; b.click(); return true; })()`).then(async (ok) => { await p.sleep(350); return ok; });
const labels = (p) => p.ev(`JSON.stringify(${PL}.settings.labels)`).then(JSON.parse);
const cardLabel = (p, path) => p.ev(`(() => { const c = document.querySelector(${j(card(L + path))}); const cs = getComputedStyle(c); return { has: c.classList.contains('has-label'), kind: [...c.classList].find(x => x.startsWith('mod-label-')) ?? null, color: c.style.getPropertyValue('--binders-label') || cs.getPropertyValue('--binders-label').trim() }; })()`);
const setLabelMenu = async (p, path) => { const c = await p.at(card(L + path)); await p.right(c.x, c.y); await hoverMenu(p, 'Set label'); };

test('settings: the labels list — rename, recolor, a color of your own, add, delete, restore; saved in the plugin’s data, never in a note', async (p, h, t) => {
	const before = await texts(p);
	await openSettings(p);
	t.eq(j(await names(p, 'labels')), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']), 'the eight labels, named for their colors');
	// rename
	await typeName(p, 'labels', 0, 'Mara');
	t.eq((await labels(p))[0].name, 'Mara', 'a label takes the name typed');
	t.eq((await saved(p)).labels[0].name, 'Mara', 'and it’s saved');
	await typeName(p, 'labels', 0, 'orange');
	t.eq(j((await names(p, 'labels')).slice(0, 2)), j(['Mara', 'Orange']), 'a name another label has is refused: the field goes back');
	await typeName(p, 'labels', 0, '   ');
	t.eq((await labels(p))[0].name, 'Mara', 'and so is an empty one');
	// one of the theme's colors
	const hex0 = await p.ev(`${TAB}.querySelector('.binders-settings-label input[type="color"]').value`);
	await p.ev(`(() => { const s = ${TAB}.querySelector('.binders-settings-label select[aria-label="Color"]'); s.value = 'purple'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	await p.sleep(250);
	t.eq((await labels(p))[0].color, 'purple', 'a color picked from the list is kept by its name, so it follows the theme');
	const hex1 = await p.ev(`${TAB}.querySelector('.binders-settings-label input[type="color"]').value`);
	t.ok(/^#[0-9a-f]{6}$/.test(hex1) && hex1 !== hex0, `the color well shows the theme’s purple (${hex0} -> ${hex1})`);
	// a color of your own
	await p.ev(`(() => { const c = ${TAB}.querySelector('.binders-settings-label input[type="color"]'); c.value = '#123456'; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	await p.sleep(250);
	t.eq((await labels(p))[0].color, '#123456', 'a color from the color well is kept as it is');
	t.eq(await p.ev(`${TAB}.querySelector('.binders-settings-label select[aria-label="Color"]').value`), 'custom', 'and the list says Custom');
	// add: named, in a color no label has yet, its name ready to type over
	t.ok(await press(p, 'Add label'), 'there is an “Add label” button');
	const added = (await labels(p))[8];
	t.eq(j([added?.name, added?.color]), j(['New label', 'red']), 'a new label, in the first color no label has (red is free again)');
	t.ok(await p.ev(`(() => { const inputs = ${TAB}.querySelectorAll('.binders-settings-labels input[type="text"]'), last = inputs[inputs.length - 1]; return last.ownerDocument.activeElement === last && last.selectionEnd - last.selectionStart === last.value.length; })()`), 'its name is selected, to type over');
	// delete the second (Orange)
	await p.ev(`(() => { ${TAB}.querySelectorAll('.binders-settings-label')[1].querySelector('[aria-label="Delete"]').click(); return 1; })()`);
	await p.sleep(350);
	t.eq(j((await names(p, 'labels')).slice(0, 3)), j(['Mara', 'Yellow', 'Green']), 'a label deleted');
	t.eq((await saved(p)).labels.length, 8, 'saved');
	// restore
	t.ok(await press(p, 'Restore the default labels'), 'there is a restore button');
	t.eq((await labels(p))[0].name, 'Mara', 'it asks first: nothing is restored yet');
	t.ok(await answer(p, 'Restore'), 'the question has a Restore button');
	t.eq(j(await names(p, 'labels')), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']), 'the defaults are back');
	same(t, before, await texts(p));
});

test('settings: the statuses list — add, rename, delete, restore; the binder view offers them in that order', async (p, h, t) => {
	await openSettings(p);
	t.eq(j(await names(p, 'statuses')), j(['Idea', 'Draft', 'Revised', 'Done']), 'the four statuses');
	t.ok(await press(p, 'Add status'), 'there is an “Add status” button');
	t.eq(j(await p.ev(`${PL}.settings.statuses`)), j(['Idea', 'Draft', 'Revised', 'Done', 'New status']), 'a new status, last');
	await typeName(p, 'statuses', 4, 'Final');
	await typeName(p, 'statuses', 0, 'draft');
	t.eq(j(await p.ev(`${PL}.settings.statuses`)), j(['Idea', 'Draft', 'Revised', 'Done', 'Final']), 'renamed; a name another status has (in any case) is refused');
	await p.ev(`(() => { ${TAB}.querySelectorAll('.binders-settings-status')[0].querySelector('[aria-label="Delete"]').click(); return 1; })()`);
	await p.sleep(350);
	t.eq(j((await saved(p)).statuses), j(['Draft', 'Revised', 'Done', 'Final']), 'deleted, and saved');
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	// a card's status menu follows
	await openView(p);
	const c = await p.at(card(L + 'Epilogue.md'));
	await p.right(c.x, c.y);
	await hoverMenu(p, 'Set status');
	const items = await menuItems(p);
	// (Epilogue is "idea", which settings no longer have: statuses notes use are still offered, after the list, as written)
	t.eq(j(items.slice(-7)), j(['Draft', 'Revised', 'Done', 'Final', 'idea', 'New status...', 'No status']), 'the menu lists the statuses from settings in their order, then the ones only notes use: ' + j(items));
	await closeMenus(p);
	await openSettings(p);
	await press(p, 'Restore the default statuses');
	await answer(p, 'Restore');
	t.eq(j(await names(p, 'statuses')), j(['Idea', 'Draft', 'Revised', 'Done']), 'the defaults are back');
});

test('cards: a label is a preset by name, a theme color by name, or a color of your own; only the label property is written', async (p, h, t) => {
	await set(p, { labels: [{ name: 'Mara', color: 'purple' }, { name: 'Storm', color: '#ff8800' }] });
	await p.ev(`app.fileManager.processFrontMatter(${file(L + 'Epilogue.md')}, fm => { fm.label = 'red'; }).then(() => 1)`);
	const before = await texts(p);
	await openView(p);
	// a note whose label names a theme color, though no preset does, still shows it
	await until(p, `document.querySelector(${j(card(L + 'Epilogue.md'))})?.classList.contains('has-label')`);
	t.eq((await cardLabel(p, 'Epilogue.md')).kind, 'mod-label-red', 'a label that names a theme color shows in it');
	// a preset, from the card's menu
	await setLabelMenu(p, 'Prologue.md');
	t.eq(j(await menuItems(p)).includes('"Mara","Storm"'), true, 'the menu offers the presets: ' + j(await menuItems(p)));
	t.ok((await menuItems(p)).includes('Custom color...') && (await menuItems(p)).includes('Edit labels...'), 'a color of your own, and a way to the settings');
	await clickMenu(p, 'Mara');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.label === 'Mara'`);
	t.eq((await fm(p, L + 'Prologue.md')).label, 'Mara', 'the note’s label is the preset’s name');
	await until(p, `document.querySelector(${j(card(L + 'Prologue.md'))})?.classList.contains('mod-label-purple')`);
	t.eq((await cardLabel(p, 'Prologue.md')).kind, 'mod-label-purple', 'and its card shows the preset’s color');
	t.eq(split(await read(p, L + 'Prologue.md')).body, split(before[L + 'Prologue.md']).body, 'its text untouched');
	// a preset with a color of its own
	await setLabelMenu(p, 'Prologue.md');
	await clickMenu(p, 'Storm');
	await until(p, `document.querySelector(${j(card(L + 'Prologue.md'))})?.classList.contains('mod-label-custom')`);
	const storm = await cardLabel(p, 'Prologue.md');
	t.eq(j([storm.kind, storm.color]), j(['mod-label-custom', '#ff8800']), 'a preset with a color of its own shows in exactly that');
	// a color of your own for one note
	await setLabelMenu(p, 'Prologue.md');
	await clickMenu(p, 'Custom color...');
	await until(p, `!!document.querySelector('.modal input[aria-label="Hex color"]')`);
	t.eq(await p.ev(`document.querySelector('.modal input[aria-label="Hex color"]').value`), '#ff8800', 'the dialog starts from the color the card has');
	await p.key('a', 'ctrl');
	await p.type('#12ab34');
	t.eq(await p.ev(`document.querySelector('.modal input[type="color"]').value`), '#12ab34', 'the color well follows what’s typed');
	t.eq(await p.ev(`document.querySelector('.modal input[aria-label="Hex color"]').value`), '#12ab34', 'and doesn’t rewrite it meanwhile');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.label === '#12ab34'`);
	t.eq((await fm(p, L + 'Prologue.md')).label, '#12ab34', 'the note’s label is the color');
	await until(p, `document.querySelector(${j(card(L + 'Prologue.md'))})?.style.getPropertyValue('--binders-label') === '#12ab34'`);
	t.eq((await cardLabel(p, 'Prologue.md')).color, '#12ab34', 'and its card shows it');
	// several at once (on the board of the folder they're in), then none
	await openView(p, L + 'Part One');
	const a = await p.at(card(L + 'Part One/Arrival.md')), k = await p.at(card(L + 'Part One/The keeper.md'));
	await p.click(a.x, a.t + 12);
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await p.right(k.x, k.y);
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Mara');
	await until(p, `['Arrival', 'The keeper'].every(n => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/')} + n + '.md'))?.frontmatter?.label === 'Mara')`);
	t.eq(j([(await fm(p, L + 'Part One/Arrival.md')).label, (await fm(p, L + 'Part One/The keeper.md')).label]), j(['Mara', 'Mara']), 'a label set on every selected note');
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card.mod-label-purple').length === 2`);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].map(c => c.classList.contains('mod-label-purple'))`)), j([true, true, false]), 'and both cards show it, the third not');
	// a note and a folder's stack together: the folder's label goes to its folder note
	await openView(p);
	const e = await p.at(card(L + 'Epilogue.md')), st = await p.at(card(L + 'Part Two'));
	await p.click(e.x, e.t + 12);
	await p.click(st.x, st.t + 12, { modifiers: 2 });
	await p.right(st.x, st.t + 12);
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Storm');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Part Two/Part Two.md')})?.frontmatter?.label === 'Storm' && app.metadataCache.getFileCache(${file(L + 'Epilogue.md')})?.frontmatter?.label === 'Storm'`);
	t.eq(j([(await fm(p, L + 'Epilogue.md')).label, (await fm(p, L + 'Part Two/Part Two.md'))?.label]), j(['Storm', 'Storm']), 'a label set on a note and a folder together: the folder’s is in its folder note');
	await until(p, `document.querySelector(${j(card(L + 'Part Two'))})?.classList.contains('mod-label-custom')`);
	const stack = await cardLabel(p, 'Part Two');
	t.eq(j([stack.kind, stack.color]), j(['mod-label-custom', '#ff8800']), 'and its stack shows the color');
	t.eq((await cardLabel(p, 'Part One')).has, false, 'the other stack has none');
	t.eq(split(await read(p, L + 'Epilogue.md')).body, split(before[L + 'Epilogue.md']).body, 'Epilogue’s text untouched');
	await p.ev(`app.fileManager.processFrontMatter(${file(L + 'Epilogue.md')}, fm => { fm.label = 'red'; }).then(() => 1)`);
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Epilogue.md')})?.frontmatter?.label === 'red'`);
	await setLabelMenu(p, 'Prologue.md');
	t.ok((await menuItems(p)).includes('No label'), 'a labeled note can have its label taken away');
	await clickMenu(p, 'No label');
	await until(p, `!('label' in (app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter ?? {}))`);
	t.eq('label' in (await fm(p, L + 'Prologue.md')), false, 'the property is removed, not left empty');
	t.eq((await cardLabel(p, 'Prologue.md')).has, false, 'and the card has no label');
	same(t, before, await texts(p), { skip: [L + 'Prologue.md', L + 'Part One/Arrival.md', L + 'Part One/The keeper.md'] });
	for (const f of ['Prologue.md', 'Part One/Arrival.md', 'Part One/The keeper.md']) t.eq(split(await read(p, L + f)).body, split(before[L + f]).body, `${f}: text untouched`);
	// "Edit labels..." opens Binders' settings
	await setLabelMenu(p, 'Epilogue.md');
	await clickMenu(p, 'Edit labels...');
	await until(p, `app.setting.activeTab?.id === 'binders'`);
	t.eq(await p.ev(`app.setting.activeTab?.id`), 'binders', '“Edit labels...” opens Binders’ settings');
});

test('cards: “Tint cards with their label color” washes a labeled card in its color, and is remembered', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(${file(L + 'Prologue.md')}, fm => { fm.label = 'blue'; }).then(() => 1)`);
	await openView(p);
	await until(p, `document.querySelector(${j(card(L + 'Prologue.md'))})?.classList.contains('has-label')`);
	const bg = () => p.ev(`[${j(card(L + 'Prologue.md'))}, ${j(card(L + 'Epilogue.md'))}].map(s => getComputedStyle(document.querySelector(s)).backgroundColor)`);
	// (the board's own menu: a right-click away from any card, below them, where the board is empty)
	const box = await p.at('.workspace-leaf.mod-active .binders-corkboard');
	const board = { l: box.l, w: box.w, t: box.t + box.h - 120 };
	// as it comes, a labeled card is tinted, as a colored card on a canvas is; the menu turns that off
	const first = await bg();
	t.ok(first[0] !== first[1], `at first a labeled card is tinted (${first[0]})`);
	await p.right(board.l + board.w - 30, board.t + 40);
	await clickMenu(p, 'Tint cards with their label color');
	await p.sleep(400);
	const plain = await bg();
	t.eq(plain[0], plain[1], 'turned off, a labeled card’s background is any card’s');
	await p.right(board.l + board.w - 30, board.t + 40);
	await clickMenu(p, 'Tint cards with their label color');
	await p.sleep(400);
	const tinted = await bg();
	t.ok(tinted[0] !== plain[0], `the labeled card is tinted (${plain[0]} -> ${tinted[0]})`);
	t.eq(tinted[1], plain[1], 'a card without a label is as it was');
	t.ok(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-board').classList.contains('mod-label-tint')`), 'the board says so');
	// the text on a tinted card still reads (contrast with its own background)
	const contrast = await p.ev(`(() => { const c = document.querySelector(${j(card(L + 'Prologue.md'))}), t = c.querySelector('.binders-card-title'); const lum = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s)[1].split(',').map(Number); const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const cv = document.createElement('canvas').getContext('2d'); const flat = (s) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = getComputedStyle(document.body).backgroundColor; cv.fillRect(0, 0, 1, 1); cv.fillStyle = s; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')'; }; const a = lum(flat(getComputedStyle(t).color)), b = lum(flat(getComputedStyle(c).backgroundColor)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })()`);
	t.ok(contrast >= 4.5, `a tinted card’s title still reads: contrast ${contrast.toFixed(1)}`);
	// remembered with the view
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getState().options?.labelStyle ?? app.workspace.getMostRecentLeaf().view.getState().labelStyle ?? JSON.stringify(app.workspace.getMostRecentLeaf().view.getState())`), 'tint', 'the choice is part of the view’s state');
	await p.right(board.l + board.w - 30, board.t + 40);
	await clickMenu(p, 'Tint cards with their label color');
	await p.sleep(400);
	t.eq((await bg())[0], plain[0], 'and off again');
});

test('the file explorer shows label dots when asked, in the label’s color, and takes them away again', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(${file(L + 'Prologue.md')}, fm => { fm.label = '#12ab34'; }).then(() => 1)`);
	await p.ev(`(async () => { app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[0]; await app.workspace.revealLeaf(v); v.view.fileItems['The Lighthouse']?.setCollapsed(false); return 1; })()`);
	await p.sleep(500);
	const dots = () => p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .binders-explorer-label')].map(d => [d.parentElement.dataset.path, getComputedStyle(d).backgroundColor])`);
	await set(p, { explorerLabels: false });
	t.eq((await dots()).length, 0, 'no dots when the setting is off');
	await set(p, { explorerLabels: true });
	await until(p, `document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .binders-explorer-label').length > 0`);
	const shown = await dots();
	t.eq(j(shown.map((d) => d[0])), j([L + 'Prologue.md']), 'a dot on the labeled note’s row, and only there');
	t.eq(shown[0][1], 'rgb(18, 171, 52)', 'in the label’s color');
	// it follows the note's label
	await p.ev(`app.fileManager.processFrontMatter(${file(L + 'Epilogue.md')}, fm => { fm.label = 'Blue'; }).then(() => 1)`);
	await until(p, `document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .binders-explorer-label').length === 2`);
	await p.ev(`app.fileManager.processFrontMatter(${file(L + 'Prologue.md')}, fm => { delete fm.label; }).then(() => 1)`);
	await until(p, `document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .binders-explorer-label').length === 1`);
	t.eq(j((await dots()).map((d) => d[0])), j([L + 'Epilogue.md']), 'dots follow the notes’ labels as they change');
	// the row is still a row: the name isn't pushed out of line with its neighbours
	const lefts = await p.ev(`['Epilogue.md', 'Prologue.md'].map(n => Math.round(document.querySelector('.nav-file-title[data-path="${L}' + n + '"] .nav-file-title-content').getBoundingClientRect().left))`);
	t.eq(lefts[0], lefts[1], 'a row with a dot starts its name where the others do');
	await set(p, { explorerLabels: false });
	await until(p, `document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .binders-explorer-label').length === 0`);
	t.eq((await dots()).length, 0, 'and gone when the setting is off');
});

test('targets: a note’s word count target shows on its card; “Set target...” sets, changes and clears it', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const c = await p.at(card(L + 'Prologue.md'));
	await p.right(c.x, c.y);
	await clickMenu(p, 'Set target...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.type('1,500');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.target === 1500`);
	t.eq((await fm(p, L + 'Prologue.md')).target, 1500, 'a target typed with a comma is the number');
	await until(p, `document.querySelector(${j(card(L + 'Prologue.md'))})?.classList.contains('has-target')`);
	const foot = await p.ev(`(() => { const c = document.querySelector(${j(card(L + 'Prologue.md'))}); return { text: c.querySelector('.binders-card-words').textContent, pct: c.style.getPropertyValue('--binders-card-progress'), done: c.classList.contains('is-complete') }; })()`);
	t.ok(/^\d+ \/ 1,500 words$/.test(foot.text), 'the card says how far along it is: ' + foot.text);
	t.ok(/^\d+%$/.test(foot.pct) && !foot.done, 'with a line as long as the share written: ' + foot.pct);
	// a target already met
	await p.right(c.x, c.y);
	await clickMenu(p, 'Set target...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	t.eq(await p.ev(`document.querySelector('.modal .binders-ask input').value`), '1500', 'the dialog starts from the target there is');
	await p.key('a', 'ctrl');
	await p.type('5');
	await p.key('Enter');
	await until(p, `document.querySelector(${j(card(L + 'Prologue.md'))})?.classList.contains('is-complete')`);
	t.eq(await p.ev(`document.querySelector(${j(card(L + 'Prologue.md'))}).style.getPropertyValue('--binders-card-progress')`), '100%', 'a target met is a full line, never more');
	// not a number: said, nothing written
	await p.right(c.x, c.y);
	await clickMenu(p, 'Set target...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.key('a', 'ctrl');
	await p.type('lots');
	await p.key('Enter');
	await p.sleep(400);
	t.eq((await fm(p, L + 'Prologue.md')).target, 5, 'something that isn’t a number changes nothing');
	// the dialog stays, with what was typed and why it can't be used
	t.eq(await p.ev(`document.querySelector('.modal .binders-ask input')?.value`), 'lots', 'the dialog keeps what was typed');
	t.ok(/whole number of words/.test(await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent ?? ''`)), 'and says why it can’t be used');
	await p.key('Escape');
	await until(p, `!document.querySelector('.modal')`);
	// cleared
	await p.right(c.x, c.y);
	await clickMenu(p, 'Set target...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.key('a', 'ctrl');
	await p.key('Backspace');
	await p.key('Enter');
	await until(p, `!('target' in (app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter ?? {}))`);
	t.eq('target' in (await fm(p, L + 'Prologue.md')), false, 'an empty target removes the property');
	await until(p, `!document.querySelector(${j(card(L + 'Prologue.md'))}).classList.contains('has-target')`);
	t.ok(!(await p.ev(`document.querySelector(${j(card(L + 'Prologue.md'))}).classList.contains('has-target')`)), 'and the card’s line goes');
	same(t, before, await texts(p));
	t.eq(await read(p, NOTE), before[NOTE], 'the binder note untouched');
});

test('“New status...” with nothing typed stays and says a status needs a name, as “New label” does; a name typed then sets it, and only that is written', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const was = (await fm(p, L + 'Epilogue.md'))?.status ?? null;
	const c = await p.at(card(L + 'Epilogue.md'));
	await p.right(c.x, c.y);
	await hoverMenu(p, 'Set status');
	await clickMenu(p, 'New status...');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.sleep(150);
	await p.key('Enter');
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent ?? null`), 'A status needs a name.', 'Enter on an empty field: the dialog stays and says why');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Set status').click(); return 1; })()`);
	await p.sleep(200);
	t.ok(await p.ev(`!!document.querySelector('.modal')`), 'its button on an empty field: the same');
	t.eq((await fm(p, L + 'Epilogue.md'))?.status ?? null, was, 'and nothing was set');
	await p.type('Polished');
	t.eq(await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent`), '', 'typing takes the words away');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Epilogue.md')})?.frontmatter?.status === 'Polished'`);
	t.ok(await p.ev(`!document.querySelector('.modal')`), 'a name typed: the dialog closes and the status is set');
	const after = await texts(p);
	same(t, before, after, { skip: [L + 'Epilogue.md'] });
	t.eq(split(after[L + 'Epilogue.md']).body, split(before[L + 'Epilogue.md']).body, 'the note’s text is untouched');
	// Cancel on an empty field still just closes
	await p.right(c.x, c.y);
	await hoverMenu(p, 'Set status');
	await clickMenu(p, 'New status...');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.key('Escape');
	await p.sleep(200);
	t.ok(await p.ev(`!document.querySelector('.modal')`), 'Escape closes it with nothing said');
});
