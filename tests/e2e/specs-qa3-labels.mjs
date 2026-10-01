// QA round 3, labels area: the labels and statuses lists and the property names in the settings tab, what a label
// means on cards, in the outliner, the filter and the file explorer, the "Set label" / "Set status" / "Set target..."
// menus and their dialogs, tinted cards, targets and the toolbar's progress, the filter, and all of it on a phone.
// Tests named "BUG:" fail until the bug is fixed; "UX:" ones describe a behaviour that should exist.
//
// In Obsidian 1.13 the settings dialog is a window of its own (a BrowserWindow titled "Settings - …"): its DOM is
// reached through the tab's containerEl, and real keys and pointer events are sent to it through Electron.
import { B, NOTE, PL, VIEW, answer, card, cards, clickMenu, closeMenus, exists, file, hoverMenu, j, menuItems, openView, read, reload, same, texts, until, viewState, withTidy } from './view-helpers.mjs';

export const specs = [];
const L = 'The Lighthouse/';
const DEFAULTS = `{ labels: [['Red','red'],['Orange','orange'],['Yellow','yellow'],['Green','green'],['Cyan','cyan'],['Blue','blue'],['Purple','purple'],['Pink','pink']].map(([name, color]) => ({ name, color })), statuses: ['Idea','Draft','Revised','Done'], explorerLabels: true, hideBinderNotes: true, orderExplorer: true, openOnClick: true, synopsisProp: 'synopsis', statusProp: 'status', labelProp: 'label', targetProp: 'target' }`;
const clearNotices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), d = probe.noticeEl.ownerDocument; probe.hide(); return [...d.querySelectorAll('.notice')].map(n => n.textContent).filter(Boolean); })()`);
const reset = (p) => p.ev(`(async () => { Object.assign(${PL}.settings, ${DEFAULTS}); await ${PL}.saveSettings(); try { app.setting.close(); } catch {} })().then(() => 1)`);
const add = (prefix) => (name, fn) => specs.push({ name: `${prefix}${name}`, fn: withTidy(async (p, h, t) => {
	try { await fn(p, h, t); } finally {
		await closeMenus(p);
		await p.ev(`(() => { document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); document.body.removeClass('mod-rtl'); document.documentElement.dir = ''; return 1; })()`);
		await reset(p);
		await clearNotices(p);
	}
}) });
const test = add('labels qa3: '), bug = add('BUG: labels: '), ux = add('UX: labels: ');

const set = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(300));
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? {})`).then(JSON.parse);
const setFm = (p, path, obj) => p.ev(`app.fileManager.processFrontMatter(${file(path)}, fm => { const o = ${j(obj)}; for (const k in o) { if (o[k] === null) delete fm[k]; else fm[k] = o[k]; } }).then(() => 1)`).then(() => p.sleep(300));
const saved = (p) => p.ev(`app.vault.adapter.read(app.vault.configDir + '/plugins/binders/data.json')`).then(JSON.parse);
const labels = (p) => p.ev(`JSON.stringify(${PL}.settings.labels)`).then(JSON.parse);

// ---- the settings window ----
const TAB = `app.setting.activeTab.containerEl`, SDOC = `${TAB}.ownerDocument`;
const SWIN = `require('@electron/remote').BrowserWindow.getAllWindows().find(w => /^Settings/.test(w.getTitle()))`;
/** Opens Binders' settings; if they're a window of their own, gives it a size so its rows can be pointed at. */
async function openSettings(p, w = 1100, h = 1700) {
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `${TAB}.querySelectorAll('.binders-settings-label').length > 0 || !!${TAB}.querySelector('.binders-settings-labels')`);
	const popout = await p.ev(`${SDOC} !== document`);
	if (popout) { await p.ev(`(() => { ${SWIN}.setContentSize(${w}, ${h}); return 1; })()`); await p.sleep(300); }
	return popout;
}
const closeSettings = (p) => p.ev(`(() => { app.setting.close(); return 1; })()`).then(() => p.sleep(250));
const sat = (p, sel, i = 0) => p.ev(`(() => { const e = ${TAB}.querySelectorAll(${j(sel)})[${i}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
const sInput = (p, ev) => p.ev(`(() => { ${SWIN}.webContents.sendInputEvent(${j(ev)}); return 1; })()`);
/** Real pointer and key events in the settings window (or the main one, where settings are a dialog in it). */
async function sclick(p, popout, x, y) {
	if (!popout) return p.click(x, y);
	for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) await sInput(p, { type, x, y, button: 'left', clickCount: 1 });
	await p.sleep(150);
}
async function sdrag(p, popout, x0, y0, x1, y1, steps = 12) {
	if (!popout) return p.drag(x0, y0, x1, y1, steps);
	await sInput(p, { type: 'mouseMove', x: x0, y: y0 });
	await sInput(p, { type: 'mouseDown', x: x0, y: y0, button: 'left', clickCount: 1 });
	for (let i = 1; i <= steps; i++) { await sInput(p, { type: 'mouseMove', x: Math.round(x0 + (x1 - x0) * i / steps), y: Math.round(y0 + (y1 - y0) * i / steps), button: 'left', modifiers: ['leftButtonDown'] }); await p.sleep(30); }
	await sInput(p, { type: 'mouseUp', x: x1, y: y1, button: 'left', clickCount: 1 });
	await p.sleep(350);
}
async function skey(p, popout, key, ctrl = false) {
	if (!popout) return p.key(key, ...(ctrl ? ['ctrl'] : []));
	const modifiers = ctrl ? ['control'] : [];
	await sInput(p, { type: 'keyDown', keyCode: key, modifiers });
	if (!ctrl && key.length === 1) await sInput(p, { type: 'char', keyCode: key });
	await sInput(p, { type: 'keyUp', keyCode: key, modifiers });
	await p.sleep(80);
}
async function stype(p, popout, text) {
	if (!popout) return p.type(text);
	for (const ch of text) await sInput(p, { type: 'char', keyCode: ch });
	await p.sleep(120);
}
const names = (p, kind) => p.ev(`[...${TAB}.querySelectorAll('.binders-settings-${kind} input[type="text"]')].map(i => i.value)`);
/** Types a name into a row's field and leaves it (events, as the existing settings test does). */
const typeName = (p, kind, i, value) => p.ev(`(() => { const el = ${TAB}.querySelectorAll('.binders-settings-${kind} input[type="text"]')[${i}]; el.focus(); el.value = ${j(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`).then(() => p.sleep(300));
const sactive = (p) => p.ev(`(() => { const a = ${SDOC}.activeElement; return a ? { tag: a.tagName, label: a.getAttribute('aria-label'), inLabels: !!a.closest('.binders-settings-labels'), cls: a.className } : null; })()`);

// ---- the binder view ----
const cardLabel = (p, path) => p.ev(`(() => { const c = document.querySelector(${j(card(L + path))}); if (!c) return null; return { has: c.classList.contains('has-label'), kind: [...c.classList].find(x => x.startsWith('mod-label-')) ?? null, stripe: (() => { const v = getComputedStyle(c).getPropertyValue('--binders-label').trim(); if (!v) return 'rgba(0, 0, 0, 0)'; const d = document.body.createDiv(); d.style.color = v; const out = getComputedStyle(d).color; d.remove(); return out; })(), label: c.dataset.label ?? null }; })()`);
const openItemMenu = async (p, path, sub) => { const c = await p.at(card(L + path)); await p.right(c.x, c.y); if (sub) await hoverMenu(p, sub); };
const checked = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item')].filter(e => e.querySelector('.mod-checked') || e.classList.contains('mod-checked')).map(e => e.querySelector('.menu-item-title').textContent)`);
const moreOptions = async (p, title) => { const b = await p.at('.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="More options"]'); await p.click(b.x, b.y); await p.sleep(250); await clickMenu(p, title); await p.sleep(500); };
const showExplorer = async (p) => { await p.ev(`(async () => { app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[0]; await app.workspace.revealLeaf(v); for (const k of ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'Longform demo']) v.view.fileItems[k]?.setCollapsed(false); return 1; })()`); await p.sleep(500); };
const EX = '.workspace-leaf-content[data-type="file-explorer"]';
const dots = (p) => p.ev(`Object.fromEntries([...document.querySelectorAll('${EX} .binders-explorer-label')].map(d => [d.parentElement.dataset.path, getComputedStyle(d).backgroundColor]))`);
const setMode = async (p, mode) => { await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`); await p.sleep(500); };
const outlinerCells = (p, col) => p.ev(`Object.fromEntries([...document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-row')].map(r => [r.dataset.path.slice(${L.length}), (r.querySelector('[data-col="${col}"] input, [data-col="${col}"] textarea')?.value ?? r.querySelector('[data-col="${col}"]')?.textContent ?? null)]))`);
const filterButton = '.workspace-leaf.mod-active .binders-filter-button';
const openFilter = async (p) => { const f = await p.at(filterButton); await p.click(f.x, f.y); await p.sleep(300); };
const short = (list) => list.map((x) => x.split('/').pop().replace('.md', ''));
const toolbar = (p) => p.ev(`(() => { const v = document.querySelector('.workspace-leaf.mod-active .binders-view'), pr = v.querySelector('.binders-toolbar .binders-progress'), c = v.querySelector('.binders-word-count'); return { count: c.textContent, hidden: pr.classList.contains('is-hidden'), complete: pr.classList.contains('is-complete'), width: pr.querySelector('.binders-progress-bar').style.width }; })()`);
const foot = (p, path) => p.ev(`(() => { const c = document.querySelector(${j(card(L + path))}); return c ? { text: c.querySelector('.binders-card-words')?.textContent ?? null, pct: c.style.getPropertyValue('--binders-card-progress'), target: c.classList.contains('has-target'), done: c.classList.contains('is-complete') } : null; })()`);
/** "Set target..." on a card, typing `typed` over what's there (nothing typed: the field is emptied). Leaves the dialog as it ends up. */
async function typeTarget(p, path, typed) {
	await openItemMenu(p, path);
	await clickMenu(p, 'Set target...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.key('a', 'ctrl');
	if (typed) await p.type(typed); else await p.key('Backspace');
	await p.key('Enter');
	await p.sleep(500);
}
/** WCAG contrast of the parts of a card against what's behind them (every layer flattened on a canvas). */
const CONTRAST = `(sel) => { const c = document.querySelector(sel); const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); const flat = (layers) => { cv.clearRect(0, 0, 1, 1); for (const s of layers) { cv.fillStyle = s; cv.fillRect(0, 0, 1, 1); } const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }; const lum = (rgb) => { const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const bgs = (el) => { const out = []; for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)') out.unshift(b); if (e === document.body) break; } return ['#fff', ...out]; }; const out = {}; for (const [k, s] of Object.entries({ title: '.binders-card-title', synopsis: '.binders-card-synopsis', chip: '.binders-chip', words: '.binders-card-words' })) { const el = c.querySelector(s); if (!el) continue; const a = lum(flat([...bgs(el), getComputedStyle(el).color])), b = lum(flat(bgs(el))); out[k] = Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100; } return out; }`;

// ---- a phone ----
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const hold = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(700); await touch(p, 'touchEnd'); await p.sleep(450); };
const itemAt = (p, title) => p.ev(`(() => { const all = [...document.querySelectorAll('.menu .menu-item')].filter(e => (e.querySelector('.menu-item-title')?.textContent ?? '') === ${j(title)}); const it = all[all.length - 1]; if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
async function onPhone(p, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await closeMenus(p);
		await p.ev(`(() => { document.querySelectorAll('.modal-close-button').forEach(b => b.click()); try { app.setting.close(); } catch {} return 1; })()`);
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
}

// =====================================================================================================================
// What works
// =====================================================================================================================

test('settings: labels and statuses reorder by their drag handles (real pointer), and a rename afterwards goes to the right row', async (p, h, t) => {
	const popout = await openSettings(p);
	const a = await sat(p, '.binders-settings-label .mod-drag-handle', 0), b = await sat(p, '.binders-settings-label .mod-drag-handle', 3);
	t.ok(a && b, 'each label row has Obsidian’s drag handle');
	await sdrag(p, popout, a.x, a.y, b.x, b.y + 8);
	t.eq(j((await labels(p)).map((l) => l.name)), j(['Orange', 'Yellow', 'Green', 'Red', 'Cyan', 'Blue', 'Purple', 'Pink']), 'Red dragged below Green');
	t.eq(j((await saved(p)).labels.map((l) => l.name).slice(0, 4)), j(['Orange', 'Yellow', 'Green', 'Red']), 'and saved');
	const c = await sat(p, '.binders-settings-status .mod-drag-handle', 3), d = await sat(p, '.binders-settings-status .mod-drag-handle', 0);
	await sdrag(p, popout, c.x, c.y, d.x, d.y - 8);
	t.eq(j(await p.ev(`${PL}.settings.statuses`)), j(['Done', 'Idea', 'Draft', 'Revised']), 'Done dragged to the top');
	await typeName(p, 'labels', 0, 'First');
	t.eq(j((await labels(p))[0]), j({ name: 'First', color: 'orange' }), 'the row now first is the one renamed');
	// deleting, then renaming what took its place
	await p.ev(`(() => { ${TAB}.querySelectorAll('.binders-settings-label')[0].querySelector('[aria-label="Delete"]').click(); return 1; })()`);
	await p.sleep(350);
	await typeName(p, 'labels', 0, 'Sun');
	t.eq(j((await labels(p))[0]), j({ name: 'Sun', color: 'yellow' }), 'after a delete, rows still name the right label');
});

test('settings: names are trimmed and may be long or emoji; a clash in another case and an empty name are refused; search finds the rows', async (p, h, t) => {
	const popout = await openSettings(p, 1100, 900);
	await typeName(p, 'labels', 2, '  Padded  ');
	t.eq((await labels(p))[2].name, 'Padded', 'trimmed');
	await typeName(p, 'labels', 2, '🔥 Hot');
	t.eq((await labels(p))[2].name, '🔥 Hot', 'emoji');
	await typeName(p, 'labels', 2, 'x'.repeat(300));
	t.eq((await labels(p))[2].name.length, 300, 'a very long name is taken');
	t.ok(await p.ev(`${TAB}.scrollWidth <= ${TAB}.clientWidth + 1`), 'and doesn’t widen the page');
	await typeName(p, 'labels', 2, 'RED');
	t.eq((await labels(p))[2].name.length, 300, 'a name another label has in another case is refused');
	await typeName(p, 'statuses', 1, 'IDEA');
	t.eq(j(await p.ev(`${PL}.settings.statuses`)), j(['Idea', 'Draft', 'Revised', 'Done']), 'the same for statuses');
	// Obsidian's settings search
	const s = await p.ev(`(() => { const e = ${SDOC}.querySelector('input[type="search"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
	t.ok(s, 'the settings have a search field');
	await sclick(p, popout, s.x, s.y);
	await stype(p, popout, 'Purple');
	await p.sleep(800);
	const found = await p.ev(`[...${SDOC}.querySelectorAll('.vertical-tab-header .vertical-tab-nav-item, .vertical-tab-header [class*="search"] *')].map(e => e.textContent.trim()).filter(Boolean)`);
	t.ok(found.includes('Purple') && found.includes('Binders'), 'searching the settings for “Purple” finds the label under Binders: ' + j(found.slice(0, 6)));
});

test('settings: the color list and the color well stay in step', async (p, h, t) => {
	await openSettings(p);
	const st = () => p.ev(`(() => { const r = ${TAB}.querySelector('.binders-settings-label'); return { dd: r.querySelector('select[aria-label="Color"]').value, well: r.querySelector('input[type=color]').value, color: ${PL}.settings.labels[0].color }; })()`);
	const dd = (v) => p.ev(`(() => { const s = ${TAB}.querySelector('.binders-settings-label select[aria-label="Color"]'); s.value = ${j(v)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`).then(() => p.sleep(250));
	const well = (v) => p.ev(`(() => { const c = ${TAB}.querySelector('.binders-settings-label input[type="color"]'); c.value = ${j(v)}; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`).then(() => p.sleep(250));
	const red = (await st()).well;
	await dd('custom');
	t.eq(j(await st()), j({ dd: 'custom', well: red, color: red }), '“Custom” starts from the color the label had');
	await dd('blue');
	const blue = await st();
	t.ok(blue.color === 'blue' && blue.well !== red && /^#[0-9a-f]{6}$/.test(blue.well), 'a theme color: the well shows the theme’s shade');
	await well('#123456');
	t.eq(j(await st()), j({ dd: 'custom', well: '#123456', color: '#123456' }), 'a color picked in the well turns the list to Custom');
	await dd('green');
	const green = (await st()).well;
	await well(green);
	t.eq((await st()).color, 'green', 'the well set to the shade it already shows doesn’t make it a custom color');
	// a ninth label, when every theme color is taken: grey, "Custom"
	await p.ev(`(async () => { Object.assign(${PL}.settings, ${DEFAULTS}); await ${PL}.saveSettings(); })().then(() => 1)`);
	await closeSettings(p);
	await openSettings(p);
	await p.ev(`(() => { ${TAB}.querySelector('[aria-label="Add label"]').click(); return 1; })()`);
	await p.sleep(400);
	const all = await labels(p);
	t.eq(j(all[8]), j({ name: 'New label', color: '#808080' }), 'with all eight colors used, a new label is grey');
	t.eq(await p.ev(`[...${TAB}.querySelectorAll('.binders-settings-label select[aria-label="Color"]')].pop().value`), 'custom', 'and its list says Custom');
	await p.ev(`(() => { ${TAB}.querySelector('[aria-label="Add label"]').click(); return 1; })()`);
	await p.sleep(400);
	t.eq((await labels(p))[9].name, 'New label 2', 'another gets a name that’s free');
});

test('settings survive a plugin reload, and a broken or odd data.json is put right', async (p, h, t) => {
	await set(p, { labels: [{ name: 'Mara', color: '#ff8800' }], statuses: ['A', 'B'], labelProp: 'colour', explorerLabels: false });
	const reloadPlugin = (raw) => p.ev(`(async () => { await app.plugins.disablePlugin('binders'); ${raw == null ? '' : `await app.vault.adapter.write(app.vault.configDir + '/plugins/binders/data.json', ${j(raw)});`} await app.plugins.enablePlugin('binders'); await ${B}.ready; })().then(() => 1)`).then(() => p.sleep(500));
	const now = () => p.ev(`JSON.stringify({ l: ${PL}.settings.labels, s: ${PL}.settings.statuses, lp: ${PL}.settings.labelProp, sp: ${PL}.settings.statusProp, ex: ${PL}.settings.explorerLabels })`).then(JSON.parse);
	await reloadPlugin(null);
	t.eq(j(await now()), j({ l: [{ name: 'Mara', color: '#ff8800' }], s: ['A', 'B'], lp: 'colour', sp: 'status', ex: false }), 'as they were');
	for (const raw of ['null', '[]', '"text"', '{"labels":"x","statuses":{"a":1},"labelProp":5,"explorerLabels":"yes","compile":7,"outlinerColumns":"z"}']) {
		await reloadPlugin(raw);
		const s = await now();
		t.ok(s.l.length === 8 && s.s.length === 4 && s.lp === 'label' && s.ex === true, `${raw.slice(0, 30)}: the defaults`);
	}
	await reloadPlugin('{"labels":[{"name":"A","color":"#GGGGGG"},{"name":"a","color":"blue"},{"name":" ","color":"red"},{"name":"B"},null,5,{"name":"C","color":"BLUE"},{"name":"D","color":"#ABC"}],"statuses":["x","X"," ",5,null,"y"],"labelProp":"  spaced  ","statusProp":""}');
	t.eq(j(await now()), j({ l: [{ name: 'A', color: 'red' }, { name: 'C', color: 'blue' }, { name: 'D', color: '#aabbcc' }], s: ['x', 'y'], lp: 'spaced', sp: 'status', ex: true }), 'only what’s well formed is kept: no repeats, blanks or non-text; colors as CSS can show them');
	await reloadPlugin('{"labels":[],"statuses":[]}');
	t.eq(j([(await now()).l, (await now()).s]), j([[], []]), 'empty lists stay empty');
	await openSettings(p);
	t.ok(/No labels/.test(await p.ev(`${TAB}.querySelector('.binders-settings-labels').textContent`)), 'and the tab says there are no labels');
	await closeSettings(p);
	await openView(p);
	await openItemMenu(p, 'Prologue.md', 'Set label');
	const items = await menuItems(p);
	t.ok(items.includes('Custom color...') && items.includes('Edit labels...') && !items.includes('Red'), 'with no labels the menu still offers a custom color and the settings');
	await closeMenus(p);
	t.eq(p.errors.filter((e) => /binders/i.test(e) && !/failed to read JSON/.test(e)).length, 0, 'nothing of Binders’ logged');
	p.errors.length = 0;
	await reloadPlugin('{}');
});

test('settings: every toggle applies at once; a label property of another name is read and written, the old one left alone', async (p, h, t) => {
	await setFm(p, L + 'Prologue.md', { label: 'red', colour: 'blue' });
	await showExplorer(p);
	const rows = () => p.ev(`[...document.querySelectorAll('${EX} .tree-item-self')].map(r => (r.dataset.path || '').replace('The Lighthouse/', '') + (r.querySelector('.binders-explorer-label') ? '•' : ''))`);
	await openSettings(p);
	const toggle = (i) => p.ev(`(() => { ${TAB}.querySelectorAll('.checkbox-container')[${i}].click(); return 1; })()`).then(() => p.sleep(500));
	await toggle(3);
	t.ok(!(await rows()).some((r) => r.endsWith('•')), '“Show label colors” off: the dots go at once');
	await toggle(3);
	t.ok((await rows()).includes('Prologue.md•'), 'and on again');
	await toggle(2);
	t.ok((await rows()).includes('The Lighthouse.md'), '“Hide binder and folder notes” off: the binder note shows at once');
	await toggle(2);
	await toggle(0);
	const byName = (await rows()).filter((r) => r && !r.includes('/') && !['Longform demo', 'The Lighthouse'].includes(r));
	t.eq(j(byName.filter((r) => r !== 'The Lighthouse.md')), j(['Part One', 'Part Two', 'Epilogue.md', 'Prologue.md•']), '“Order binders” off: by name at once');
	await toggle(0);
	// the label property's name, typed in its field
	const typeProp = (i, v) => p.ev(`(() => { const el = [...${TAB}.querySelectorAll('.setting-group:last-child input[type=text]')][${i}]; el.focus(); el.value = ${j(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`).then(() => p.sleep(300));
	await typeProp(2, 'colour');
	t.eq(await p.ev(`${PL}.settings.labelProp`), 'colour', 'the Label property renamed');
	await closeSettings(p);
	await openView(p);
	t.eq((await cardLabel(p, 'Prologue.md')).kind, 'mod-label-blue', 'cards read the new property');
	t.eq((await dots(p))[L + 'Prologue.md'], (await cardLabel(p, 'Prologue.md')).stripe, 'so does the explorer');
	await openItemMenu(p, 'Prologue.md', 'Set label');
	await clickMenu(p, 'Green');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.colour === 'Green'`);
	const f = await fm(p, L + 'Prologue.md');
	t.eq(j([f.colour, f.label]), j(['Green', 'red']), 'the menu writes the new property and leaves the old one alone');
	await openSettings(p);
	await typeProp(2, '   ');
	t.eq(await p.ev(`${PL}.settings.labelProp`), 'label', 'an emptied name goes back to the default');
});

test('what a label is: a preset in any case, a theme color by name, #abc or #AABBCC; anything else is neutral; cards, outliner, filter and explorer agree', async (p, h, t) => {
	await set(p, { labels: [{ name: 'Red', color: 'red' }, { name: 'Blue', color: 'blue' }, { name: 'Twin', color: 'blue' }, { name: 'Mara', color: '#ff8800' }] });
	const vals = { 'Prologue.md': 'RED', 'Part One/Arrival.md': 'cyan', 'Part One/The keeper.md': '#abc', 'Part One/Storm warning.md': '  twin  ', 'Part Two/The wreck.md': 'mara', 'Part Two/Lights out.md': 'Nobody', 'Epilogue.md': '' };
	for (const [path, label] of Object.entries(vals)) await setFm(p, L + path, { label });
	const before = await texts(p);
	await openView(p);
	await showExplorer(p);
	const want = { 'Prologue.md': ['mod-label-red', 'rgb(233, 49, 71)'], 'Part One/Arrival.md': ['mod-label-cyan', 'rgb(0, 191, 188)'], 'Part One/The keeper.md': ['mod-label-custom', 'rgb(170, 187, 204)'], 'Part One/Storm warning.md': ['mod-label-blue', 'rgb(8, 109, 221)'], 'Part Two/The wreck.md': ['mod-label-custom', 'rgb(255, 136, 0)'], 'Part Two/Lights out.md': ['mod-label-other', null] };
	const light = await p.ev(`document.body.classList.contains('theme-light')`), d = await dots(p);
	for (const [path, [kind, rgb]] of Object.entries(want)) {
		const c = await cardLabel(p, path);
		t.eq(c.kind, kind, `${vals[path]}: the card’s kind`);
		// (theme colors differ by theme: the shades are checked in the light one)
		if (rgb && (light || kind === 'mod-label-custom')) t.eq(c.stripe, rgb, `${vals[path]}: the card’s stripe`);
		t.eq(d[L + path], c.stripe, `${vals[path]}: the explorer’s dot is the card’s color`);
	}
	t.eq((await cardLabel(p, 'Epilogue.md')).has, false, 'an empty label is no label');
	t.ok(!(L + 'Epilogue.md' in d), 'and no dot');
	// the menu ticks the preset whatever the case, and lists what notes use after the presets
	await openItemMenu(p, 'Prologue.md', 'Set label');
	t.eq(j((await menuItems(p)).slice(-9)), j(['Red', 'Blue', 'Twin', 'Mara', 'Cyan', 'Nobody', 'Custom color...', 'No label', 'Edit labels...']), 'the label menu');
	t.eq(j((await checked(p)).filter((x) => x !== 'Include in compile')), j(['Red']), '“RED” ticks Red');
	await closeMenus(p);
	await openFilter(p);
	const items = await menuItems(p);
	t.eq(j(items.slice(items.indexOf('Label'))), j(['Label', 'Red', 'Twin', 'Mara', 'Cyan', 'Custom color', 'Nobody', 'No label']), 'the filter lists them as settings order them, then the rest');
	await closeMenus(p);
	await setMode(p, 'outliner');
	const cells = await outlinerCells(p, 'label');
	t.eq(j([cells['Prologue.md'], cells['Part One/Arrival.md'], cells['Part One/The keeper.md'], cells['Part One/Storm warning.md'], cells['Part Two/The wreck.md'], cells['Part Two/Lights out.md'], cells['Epilogue.md']]), j(['Red', 'Cyan', 'Custom color', 'Twin', 'Mara', 'Nobody', '']), 'the outliner names them the same way');
	same(t, before, await texts(p));
});

test('a preset’s color changed in settings shows at once on open cards and in the explorer', async (p, h, t) => {
	await set(p, { labels: [{ name: 'Mara', color: 'purple' }] });
	await setFm(p, L + 'Prologue.md', { label: 'Mara' });
	await openView(p);
	await showExplorer(p);
	t.eq((await cardLabel(p, 'Prologue.md')).kind, 'mod-label-purple', 'purple');
	await openSettings(p);
	await p.ev(`(() => { const s = ${TAB}.querySelector('.binders-settings-label select[aria-label="Color"]'); s.value = 'green'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	await until(p, `document.querySelector(${j(card(L + 'Prologue.md'))})?.classList.contains('mod-label-green')`);
	const c = await cardLabel(p, 'Prologue.md');
	t.eq(c.kind, 'mod-label-green', 'the card follows without being reopened');
	t.eq((await dots(p))[L + 'Prologue.md'], c.stripe, 'and the explorer’s dot');
});

test('menus: ticks for the current value, none for a mixed selection; by keyboard alone; “New status...” is the note’s only; a folder’s label goes in its folder note', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await openItemMenu(p, 'Prologue.md', 'Set status');
	t.eq(j((await menuItems(p)).slice(-6)), j(['Idea', 'Draft', 'Revised', 'Done', 'New status...', 'No status']), 'the status menu');
	t.eq(j((await checked(p)).filter((x) => x !== 'Include in compile')), j(['Draft']), '“draft” in the note ticks Draft');
	await clickMenu(p, 'New status...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	t.eq(await p.ev(`document.activeElement === document.querySelector('.modal .binders-ask input')`), true, 'the dialog’s field has the focus');
	await p.type('  Proofed  ');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.status === 'Proofed'`);
	t.eq((await fm(p, L + 'Prologue.md')).status, 'Proofed', 'a new status, trimmed, on the note');
	t.eq(j(await p.ev(`${PL}.settings.statuses`)), j(['Idea', 'Draft', 'Revised', 'Done']), 'and not added to settings');
	// two cards that differ: nothing ticked
	const a = await p.at(card(L + 'Part One/Arrival.md')), k = await p.at(card(L + 'Part One/The keeper.md'));
	await p.click(a.x, a.t + 12);
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await p.right(k.x, k.y);
	await hoverMenu(p, 'Set status');
	t.eq(j((await menuItems(p)).slice(-7)), j(['Idea', 'Draft', 'Revised', 'Done', 'Proofed', 'New status...', 'No status']), 'a status a note uses is offered after the presets');
	t.eq(j((await checked(p)).filter((x) => x !== 'Include in compile')), j([]), 'a mixed selection ticks nothing');
	await closeMenus(p);
	// keyboard only: the card's menu, down to "Set label", into its submenu, a label
	const c = await p.at(card(L + 'Epilogue.md'));
	await p.click(c.x, c.t + 12);
	await p.key('F10', 'shift');
	await p.sleep(300);
	t.ok((await menuItems(p)).includes('Set label'), 'Shift+F10 opens the card’s menu');
	const sel = () => p.ev(`[...document.querySelectorAll('.menu .menu-item.selected')].map(e => e.textContent)`);
	for (let i = 0; i < 14 && !(await sel()).includes('Set label'); i++) await p.key('ArrowDown');
	await p.key('ArrowRight');
	await p.sleep(300);
	await p.key('ArrowDown');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Epilogue.md')})?.frontmatter?.label === 'Orange'`);
	t.eq((await fm(p, L + 'Epilogue.md')).label, 'Orange', 'a label set with the keyboard alone');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Epilogue.md', 'and the focus is back on the card');
	// a folder (first closing the card's menu, which a pick by keyboard leaves open: see the BUG test below)
	await closeMenus(p);
	await p.sleep(300);
	const g = await p.at('.workspace-leaf.mod-active .binders-group-title');
	await p.right(g.x, g.y);
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Red');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Part One.md')})`);
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Part One/Part One.md')})?.frontmatter?.label === 'Red'`);
	t.eq((await fm(p, L + 'Part One/Part One.md')).label, 'Red', 'a folder’s label is in its folder note');
	await showExplorer(p);
	t.ok(L + 'Part One' in (await dots(p)), 'and the folder has a dot in the explorer');
	same(t, before, await texts(p), { skip: [L + 'Prologue.md', L + 'Epilogue.md'] });
});

test('custom color dialog: starts from the color shown; a three-digit hex in capitals; Escape and Cancel change nothing', async (p, h, t) => {
	await setFm(p, L + 'Prologue.md', { label: 'Blue' });
	await openView(p);
	const openDialog = async () => { await openItemMenu(p, 'Prologue.md', 'Set label'); await clickMenu(p, 'Custom color...'); await until(p, `!!document.querySelector('.modal input[aria-label="Hex color"]')`); };
	await openDialog();
	const light = await p.ev(`document.body.classList.contains('theme-light')`);
	if (light) t.eq(await p.ev(`document.querySelector('.modal input[aria-label="Hex color"]').value`), '#086ddd', 'from the theme’s blue');
	await p.key('a', 'ctrl');
	await p.type('#F0A');
	t.eq(await p.ev(`document.querySelector('.modal input[type="color"]').value`), '#ff00aa', 'the well follows a three-digit hex');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.label === '#ff00aa'`);
	t.eq((await fm(p, L + 'Prologue.md')).label, '#ff00aa', 'written as six digits, lower case');
	await openItemMenu(p, 'Prologue.md', 'Set label');
	t.eq(j((await checked(p)).filter((x) => x !== 'Include in compile')), j(['Custom color...']), 'the menu ticks “Custom color...”');
	await clickMenu(p, 'Custom color...');
	await until(p, `!!document.querySelector('.modal input[aria-label="Hex color"]')`);
	await p.key('a', 'ctrl');
	await p.type('#000000');
	await p.key('Escape');
	await p.sleep(400);
	t.eq((await fm(p, L + 'Prologue.md')).label, '#ff00aa', 'Escape changes nothing');
	await openDialog();
	await p.ev(`(() => { const c = document.querySelector('.modal input[type=color]'); c.value = '#00ff00'; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	await p.sleep(200);
	t.eq(await p.ev(`document.querySelector('.modal input[aria-label="Hex color"]').value`), '#00ff00', 'the field follows the well');
	const cancel = await p.ev(`(() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Cancel'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await p.click(cancel.x, cancel.y);
	await p.sleep(300);
	t.eq((await fm(p, L + 'Prologue.md')).label, '#ff00aa', 'Cancel changes nothing');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Prologue.md', 'and the focus is back on the card');
});

test('tint: title and synopsis read on every theme color (contrast ≥ 4.5), tinted or not', async (p, h, t) => {
	await openView(p);
	await moreOptions(p, 'Tint cards with their label color');
	const sel = card(L + 'Prologue.md');
	for (const v of ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'Nobody']) {
		await setFm(p, L + 'Prologue.md', { label: v });
		await until(p, `document.querySelector(${j(sel)})?.dataset.label?.toLowerCase() === ${j(v.toLowerCase())}`);
		const c = await p.ev(`(${CONTRAST})(${j(sel)})`);
		t.ok(c.title >= 4.5 && c.synopsis >= 4.5 && c.chip >= 4.5, `${v}: title ${c.title}, synopsis ${c.synopsis}, status ${c.chip}`);
	}
	// selected and tinted: the selection ring, over the tint
	const at = await p.at(sel);
	await p.click(at.x, at.t + 12);
	await p.sleep(400); // (the ring fades in)
	// (the selection is the card's border grown to a ring, in its label's color)
	t.ok(/0px 0px 0px 2px/.test(await p.ev(`getComputedStyle(document.querySelector(${j(sel)})).boxShadow`)), 'a selected tinted card has the selection ring');
});

test('targets: several notes at once; by hand as text; never more than a full line; a folder’s shows in the toolbar; the outliner agrees', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const a = await p.at(card(L + 'Part One/Arrival.md')), k = await p.at(card(L + 'Part One/The keeper.md'));
	await p.click(a.x, a.t + 12);
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await typeTarget(p, 'Part One/The keeper.md', '40');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Part One/Arrival.md')})?.frontmatter?.target === 40`);
	t.eq(j([(await fm(p, L + 'Part One/Arrival.md')).target, (await fm(p, L + 'Part One/The keeper.md')).target]), j([40, 40]), 'a target for every selected note');
	t.eq((await foot(p, 'Part One/Arrival.md')).text, '18 / 40 words', 'said on the card');
	for (const [v, text, pct] of [['1,500', '21 / 1,500 words', '1%'], ['10', '21 / 10 words', '100%'], [-3, '21 words', ''], [0, '21 words', ''], ['lots', '21 words', '']]) {
		await setFm(p, L + 'Prologue.md', { target: v });
		await until(p, `document.querySelector(${j(card(L + 'Prologue.md'))}).querySelector('.binders-card-words')?.textContent === ${j(text)}`);
		const f = await foot(p, 'Prologue.md');
		t.eq(j([f.text, f.pct]), j([text, pct]), `target: ${j(v)} written by hand`);
	}
	await typeTarget(p, 'Prologue.md', '-5');
	// (said in the dialog, which stays open with what was typed)
	t.ok(/number of words/.test(await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent ?? ''`)), 'a negative target is refused, and said');
	await p.key('Escape');
	await p.sleep(250);
	await p.ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`);
	// a folder's target: in its folder note; the toolbar shows it when the folder is the one shown
	const g = await p.at('.workspace-leaf.mod-active .binders-group-title');
	await p.right(g.x, g.y);
	await clickMenu(p, 'Set target...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.type('100');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Part One/Part One.md')})?.frontmatter?.target === 100`);
	t.eq(j(await toolbar(p)), j({ count: '106 words', hidden: true, complete: false, width: '0%' }), 'the binder has no target: no bar');
	await p.ev(`${VIEW}.navigate(${file('The Lighthouse/Part One')})`);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-word-count')?.textContent === '51 / 100 words'`);
	t.eq(j(await toolbar(p)), j({ count: '51 / 100 words', hidden: false, complete: false, width: '51%' }), 'inside the folder: its count against its target');
	await p.ev(`${VIEW}.navigate(${file('The Lighthouse')})`);
	await p.sleep(400);
	await setFm(p, NOTE, { target: 50 });
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-toolbar .binders-progress')?.classList.contains('is-complete')`);
	t.eq(j(await toolbar(p)), j({ count: '106 / 50 words', hidden: false, complete: true, width: '100%' }), 'over the binder’s target: a full bar, never more');
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'words' }, { id: 'target' }, { id: 'progress' }] } }; v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-outliner-row')`);
	await p.sleep(300);
	const tg = await outlinerCells(p, 'target'), pr = await outlinerCells(p, 'progress');
	t.eq(j([tg['Part One'], tg['Part One/Arrival.md'], tg['Part One/The keeper.md'], tg['Part One/Storm warning.md']]), j(['100', '40', '40', '']), 'the outliner’s targets are the cards’');
	t.eq(j([pr['Part One'], pr['Part One/Arrival.md']]), j(['51%', '45%']), 'and its progress');
	same(t, before, await texts(p), { skip: [L + 'Prologue.md', L + 'Part One/Arrival.md', L + 'Part One/The keeper.md', NOTE] });
});

test('filter: status and label together, kept across modes and in the view’s state; “Clear filter”; a note made while filtering shows', async (p, h, t) => {
	await setFm(p, L + 'Prologue.md', { label: 'Red' });
	await setFm(p, L + 'Part One/Arrival.md', { label: 'Red' });
	await openView(p);
	await openFilter(p);
	await clickMenu(p, 'Draft');
	await p.sleep(350);
	t.ok((await p.ev(`document.querySelectorAll('.menu').length`)) === 1, 'the menu is there again for the next pick');
	await clickMenu(p, 'Idea');
	await p.sleep(350);
	t.eq(j(short(await cards(p))), j(['Prologue', 'The keeper', 'Storm warning', 'The wreck', 'Lights out', 'Epilogue']), 'two statuses: either');
	await clickMenu(p, 'Red');
	await p.sleep(350);
	t.eq(j(short(await cards(p))), j(['Prologue']), 'and a label: both');
	t.eq(await p.ev(`document.querySelector('${filterButton}').innerText`), 'Filter (3)', 'the button counts what’s picked');
	t.eq(j((await viewState(p)).filter), j({ status: ['Draft', 'Idea'], label: ['Red'] }), 'in the view’s state');
	await p.key('Escape');
	await p.sleep(200);
	t.ok(await p.ev(`document.activeElement === document.querySelector('${filterButton}')`), 'Escape gives the focus back to the button');
	await setMode(p, 'outliner');
	t.eq(j(Object.keys(await outlinerCells(p, 'label'))), j(['Prologue.md']), 'the outliner filters the same');
	await setMode(p, 'corkboard');
	// a new note while filtering: shown, though it has no status
	const nb = await p.at('.workspace-leaf.mod-active .binders-new-button');
	await p.click(nb.x, nb.y);
	await p.sleep(250);
	await clickMenu(p, 'New note');
	await p.sleep(400);
	await p.type('Fresh');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Fresh.md')})`);
	await p.sleep(400);
	t.ok(short(await cards(p)).includes('Fresh'), 'a note just made shows though the filter would hide it');
	await openFilter(p);
	await clickMenu(p, 'Clear filter');
	await p.sleep(300);
	t.eq((await cards(p)).length, 8, 'cleared: every card');
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and the menu closes');
});

test('explorer dots: on notes and folders, in a Longform project, following renames and moves in and out of a binder; mirrored in RTL; rows keep their height', async (p, h, t) => {
	await setFm(p, L + 'Prologue.md', { label: 'Red' });
	await setFm(p, 'Longform demo/Harbor.md', { label: 'green' });
	await p.ev(`(async () => { const n = await ${B}.ensureFolderNote(${file('The Lighthouse/Part Two')}); await app.fileManager.processFrontMatter(n, fm => { fm.label = 'purple'; }); await app.vault.create('Loose.md', '---\\nlabel: red\\n---\\nx'); })().then(() => 1)`);
	await showExplorer(p);
	await until(p, `document.querySelectorAll('${EX} .binders-explorer-label').length === 3`);
	t.eq(j(Object.keys(await dots(p)).sort()), j(['Longform demo/Harbor.md', L + 'Part Two', L + 'Prologue.md']), 'a note, a folder, a Longform scene; not a note outside any binder');
	const geom = (path) => p.ev(`(() => { const r = document.querySelector('${EX} .tree-item-self[data-path=${j(path)}]'), b = r.getBoundingClientRect(), c = r.querySelector('.tree-item-inner').getBoundingClientRect(), d = r.querySelector('.binders-explorer-label')?.getBoundingClientRect(); return { h: b.height, textL: Math.round(c.left), dotMid: d ? Math.round((d.top + d.height / 2 - b.top) * 2) / 2 : null, textMid: Math.round((c.top + c.height / 2 - b.top) * 2) / 2, dotR: d ? Math.round(b.right - d.right) : null, dotL: d ? Math.round(d.left - b.left) : null }; })()`);
	const withDot = await geom(L + 'Prologue.md'), plain = await geom(L + 'Epilogue.md');
	t.eq(j([withDot.h, withDot.textL]), j([plain.h, plain.textL]), 'a row with a dot is as tall as any, its name where the others are');
	t.eq(withDot.dotMid, withDot.textMid, 'the dot is level with the name');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Prologue.md')}, ${j(L + 'Part Two/Opening.md')}).then(() => 1)`);
	await until(p, `!!document.querySelector('${EX} .tree-item-self[data-path=${j(L + 'Part Two/Opening.md')}] .binders-explorer-label')`);
	t.ok(L + 'Part Two/Opening.md' in (await dots(p)), 'renamed and moved: the dot goes along');
	await p.ev(`(async () => { await app.fileManager.renameFile(${file(L + 'Part Two/Opening.md')}, 'Opening.md'); await app.fileManager.renameFile(${file('Loose.md')}, ${j(L + 'Loose.md')}); })().then(() => 1)`);
	await until(p, `!!document.querySelector('${EX} .tree-item-self[data-path=${j(L + 'Loose.md')}] .binders-explorer-label')`);
	const d = await dots(p);
	t.ok(!('Opening.md' in d) && L + 'Loose.md' in d, 'moved out of the binder: no dot; moved in: a dot');
	await p.ev(`(() => { document.body.addClass('mod-rtl'); document.documentElement.dir = 'rtl'; return 1; })()`);
	await p.sleep(400);
	const rtl = await geom(L + 'Loose.md');
	t.ok(rtl.dotL != null && rtl.dotL < 60, `right to left, the dot is at the row’s left end (${rtl.dotL}px in)`);
});

test('phone: the filter and the target dialog work by touch; the settings have rows to add a label and a status', async (p, h, t) => {
	await onPhone(p, async () => {
		await openView(p);
		await p.sleep(400);
		const f = await p.at(filterButton);
		await tap(p, f.x, f.y);
		const d = await itemAt(p, 'Draft');
		t.ok(d, 'the filter opens as a sheet');
		await tap(p, d.x, d.y);
		await p.sleep(600);
		t.eq(j((await viewState(p)).filter), j({ status: ['Draft'], label: [] }), 'a status picked by touch');
		await closeMenus(p);
		const c = await p.at(card(L + 'Prologue.md'));
		await hold(p, c.x, c.y);
		const st = await itemAt(p, 'Set target...');
		t.ok(st, 'a held card opens its menu');
		await tap(p, st.x, st.y);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(600);
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'the sheet is gone when the dialog opens');
		const b = await p.ev(`[...document.querySelectorAll('.modal button')].map(b => Math.round(b.getBoundingClientRect().height))`);
		t.ok(b.every((x) => x >= 40), 'its buttons are big enough for a finger: ' + j(b));
		await p.ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`);
		await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
		await until(p, `app.setting.activeTab?.containerEl.querySelectorAll('.binders-settings-label').length > 0`);
		const text = await p.ev(`app.setting.activeTab.containerEl.innerText`);
		t.ok(/Add label/.test(text) && /Add status/.test(text), 'the lists end in “Add label” and “Add status”');
		t.ok(await p.ev(`app.setting.activeTab.containerEl.scrollWidth <= app.setting.activeTab.containerEl.clientWidth + 1`), 'and nothing is wider than the screen');
	});
});

// =====================================================================================================================
// Bugs
// =====================================================================================================================

bug('settings: the color probe of a label row is unseen, and there’s one of it however often the list is redrawn', async (p, h, t) => {
	await openSettings(p);
	const probes = () => p.ev(`[...${TAB}.querySelectorAll('.binders-settings-label')].map(r => [...r.querySelectorAll('.binders-settings-probe')].map(d => Math.round(d.getBoundingClientRect().width)))`);
	// redraw the list a few times: add, then delete, a status (a change that isn't to any label)
	for (let i = 0; i < 3; i++) {
		await p.ev(`(() => { ${TAB}.querySelector('[aria-label="Add status"]').click(); return 1; })()`);
		await p.sleep(350);
		await p.ev(`(() => { const rows = ${TAB}.querySelectorAll('.binders-settings-status'); rows[rows.length - 1].querySelector('[aria-label="Delete"]').click(); return 1; })()`);
		await p.sleep(350);
	}
	const now = await probes();
	t.eq(Math.max(...now.map((r) => r.length)), 1, 'one probe a row, not one more each time the tab is drawn: ' + j(now.map((r) => r.length)));
	t.eq(Math.max(...now.flat()), 0, 'and it takes no room (it’s 8px wide, a stray dot after the drag handle)');
	// so the two lists' buttons line up
	const x = await p.ev(`[${TAB}.querySelector('.binders-settings-label [aria-label="Delete"]'), ${TAB}.querySelector('.binders-settings-status [aria-label="Delete"]')].map(e => Math.round(e.getBoundingClientRect().left))`);
	t.eq(x[0], x[1], 'the labels’ delete buttons are in line with the statuses’');
});

bug('settings: Tab after typing a label’s name moves to the row’s next control (the keyboard’s place isn’t lost)', async (p, h, t) => {
	const popout = await openSettings(p);
	const a = await sat(p, '.binders-settings-label input[type="text"]');
	await sclick(p, popout, a.x, a.y);
	t.eq((await sactive(p))?.label, 'Label name', 'the name field has the focus');
	await skey(p, popout, 'a', true);
	await stype(p, popout, 'Mara');
	await skey(p, popout, 'Tab');
	await p.sleep(500);
	t.eq((await labels(p))[0].name, 'Mara', 'the name is saved');
	const now = await sactive(p);
	t.ok(now?.inLabels, `the focus is still in the labels list, on the next control (it’s on ${now?.tag}.${now?.cls?.slice(0, 40)})`);
});

bug('custom color: Enter with text that isn’t a color doesn’t give the note a color nobody chose', async (p, h, t) => {
	await openView(p);
	await openItemMenu(p, 'Prologue.md', 'Set label');
	await clickMenu(p, 'Custom color...');
	await until(p, `!!document.querySelector('.modal input[aria-label="Hex color"]')`);
	await p.key('a', 'ctrl');
	await p.type('nonsense');
	await p.key('Enter');
	await p.sleep(600);
	t.eq((await fm(p, L + 'Prologue.md')).label ?? null, null, 'the note has no label (it got the dialog’s starting orange)');
});

bug('phone: a label picked from “Set label” closes the sheet, and the sheet doesn’t cover the custom color dialog', async (p, h, t) => {
	await onPhone(p, async () => {
		await openView(p);
		await p.sleep(400);
		const c = await p.at(card(L + 'Prologue.md'));
		await hold(p, c.x, c.y);
		const sl = await itemAt(p, 'Set label');
		t.ok(sl, 'the card’s menu has “Set label”');
		await tap(p, sl.x, sl.y);
		await p.sleep(400);
		const or = await itemAt(p, 'Orange');
		await tap(p, or.x, or.y);
		await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.label === 'Orange'`);
		await p.sleep(1200);
		const left = await p.ev(`document.querySelectorAll('.menu').length`);
		await closeMenus(p);
		// the dialog under the sheet
		await hold(p, c.x, c.y);
		const sl2 = await itemAt(p, 'Set label');
		await tap(p, sl2.x, sl2.y);
		await p.sleep(400);
		const cc = await itemAt(p, 'Custom color...');
		await tap(p, cc.x, cc.y);
		await until(p, `!!document.querySelector('.modal input[aria-label="Hex color"]')`);
		await p.sleep(1200);
		const over = await p.ev(`(() => { const m = document.querySelector('.modal input[aria-label="Hex color"]'), r = m.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === m ? null : e.className; })()`);
		t.eq(left, 0, 'the sheet closes once a label is picked (as Obsidian’s own “Copy path” submenu does)');
		t.eq(over, null, 'and the hex field can be reached: nothing is over it');
	});
});

bug('keyboard: Enter on a label in the “Set label” submenu closes the card’s menu', async (p, h, t) => {
	await openView(p);
	const c = await p.at(card(L + 'Epilogue.md'));
	await p.click(c.x, c.t + 12);
	const sel = () => p.ev(`[...document.querySelectorAll('.menu .menu-item.selected')].map(e => e.textContent)`);
	const pick = async (item) => {
		await p.key('F10', 'shift');
		await p.sleep(300);
		for (let i = 0; i < 30 && !(await sel()).includes(item); i++) await p.key('ArrowDown');
		await p.key('ArrowRight');
		await p.sleep(300);
		await p.key('Enter');
		await p.sleep(800);
		const left = await p.ev(`document.querySelectorAll('.menu').length`);
		await closeMenus(p);
		return left;
	};
	t.eq(await pick('Copy path'), 0, 'Obsidian’s own submenu (“Copy path”): Enter closes every menu');
	const left = await pick('Set label');
	t.eq((await fm(p, L + 'Epilogue.md')).label, 'Red', 'the label is set');
	t.eq(left, 0, 'and the menus are gone (the card’s menu stays open, over the board)');
});

bug('tint: a labeled stack keeps its stack edges', async (p, h, t) => {
	await p.ev(`(async () => { const n = await ${B}.ensureFolderNote(${file('The Lighthouse/Part One')}); await app.fileManager.processFrontMatter(n, fm => { fm.label = 'green'; }); })().then(() => 1)`);
	await openView(p);
	await moreOptions(p, 'Show subfolders as stacks');
	await until(p, `!!document.querySelector(${j(card(L + 'Part One'))})?.classList.contains('is-stack')`);
	await p.move(5, 5);
	const layers = (path) => p.ev(`getComputedStyle(document.querySelector(${j(card(L + path))})).boxShadow.split(/,(?![^(]*\\))/).length`);
	const plain = await layers('Part Two');
	t.ok(plain > 1, 'a stack is drawn as a pile of cards');
	t.eq(await layers('Part One'), plain, 'a labeled one too, before tinting');
	await moreOptions(p, 'Tint cards with their label color');
	await p.move(5, 5);
	await p.sleep(300);
	t.eq(await layers('Part One'), plain, 'and tinted (the tint’s ring replaces the pile: it looks like a single card)');
});

bug('explorer: a label written as a list shows its dot, as its card shows its color', async (p, h, t) => {
	await setFm(p, L + 'Epilogue.md', { label: ['red'] });
	await setFm(p, L + 'Prologue.md', { label: 'red' });
	await openView(p);
	await showExplorer(p);
	await until(p, `!!document.querySelector('${EX} .tree-item-self[data-path=${j(L + 'Prologue.md')}] .binders-explorer-label')`);
	const c = await cardLabel(p, 'Epilogue.md');
	t.eq(c.kind, 'mod-label-red', 'the card is red');
	t.eq((await dots(p))[L + 'Epilogue.md'] ?? null, c.stripe, 'and so is its dot in the explorer');
});

bug('explorer: a name cut short doesn’t run into its dot', async (p, h, t) => {
	const long = L + 'A very long note name that will certainly need an ellipsis in a narrow explorer.md';
	await p.ev(`app.vault.create(${j(long)}, '---\\nlabel: red\\n---\\nx').then(() => 1)`);
	await showExplorer(p);
	await until(p, `!!document.querySelector('${EX} .tree-item-self[data-path=${j(long)}] .binders-explorer-label')`);
	const gap = await p.ev(`(() => { const r = document.querySelector('${EX} .tree-item-self[data-path=${j(long)}]'); const c = r.querySelector('.tree-item-inner'), d = r.querySelector('.binders-explorer-label').getBoundingClientRect(); return { cut: c.scrollWidth > c.clientWidth, gap: Math.round(d.left - c.getBoundingClientRect().right) }; })()`);
	t.ok(gap.cut, 'the name is cut short');
	t.ok(gap.gap >= 4, `there’s room between the name’s ellipsis and the dot (${gap.gap}px)`);
});

bug('a labeled folder renamed in the explorer isn’t told its note “is now the note of the folder”', async (p, h, t) => {
	await openView(p);
	const g = await p.at('.workspace-leaf.mod-active .binders-group-title');
	await p.right(g.x, g.y);
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Red');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Part One.md')})`);
	await clearNotices(p);
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One')}, ${j(L + 'Part 1')}).then(() => 1)`);
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part 1/Part 1.md')})`);
	await p.sleep(500);
	t.ok(await exists(p, L + 'Part 1/Part 1.md'), 'the folder note follows its folder');
	t.eq(j((await notices(p)).filter((n) => /is now the note of the folder/.test(n))), j([]), 'without a notice about a scene becoming a folder note');
});

bug('targets: “1.500” isn’t a target of 2 words', async (p, h, t) => {
	await openView(p);
	await typeTarget(p, 'Prologue.md', '1.500');
	await p.ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`);
	const target = (await fm(p, L + 'Prologue.md')).target ?? null;
	t.ok(target === 1500 || target === null, `1.500 is 1500 (a thousands point, as “1,500” is) or refused, not ${target}`);
});

// =====================================================================================================================
// What should be
// =====================================================================================================================

ux('settings: renaming a label doesn’t strip its color from the notes that have it', async (p, h, t) => {
	await set(p, { labels: [{ name: 'Mara', color: 'purple' }, { name: 'Red', color: 'red' }] });
	await setFm(p, L + 'Prologue.md', { label: 'Mara' });
	await openView(p);
	t.eq((await cardLabel(p, 'Prologue.md')).kind, 'mod-label-purple', 'purple');
	await openSettings(p);
	await typeName(p, 'labels', 0, 'Marianne');
	t.eq((await labels(p))[0].name, 'Marianne', 'renamed');
	// (it asks whether the notes that have the old name should take the new one)
	t.ok(await answer(p, 'Change it'), 'it offers to rename the label in the note that has it');
	await p.sleep(600);
	const said = await p.ev(`/renam|notes that|already (have|use)/i.test(${TAB}.querySelector('.binders-settings-labels').innerText)`);
	const c = await cardLabel(p, 'Prologue.md');
	t.ok(c.kind === 'mod-label-purple' || said, `the note is still purple (its label renamed with the preset), or the settings say notes keep the old name (it’s ${c.kind}, “${c.label}”, and nothing says why)`);
});

ux('settings: “Hide binder and folder notes” still hides them when “Order binders in the file explorer” is off (or says it can’t)', async (p, h, t) => {
	await showExplorer(p);
	const listed = () => p.ev(`!!document.querySelector('${EX} .tree-item-self[data-path=${j(NOTE)}]')`);
	t.eq(await listed(), false, 'the binder note isn’t listed');
	await set(p, { orderExplorer: false });
	await p.sleep(400);
	const shows = await listed();
	await openSettings(p);
	const disabled = await p.ev(`(() => { const rows = [...${TAB}.querySelectorAll('.setting-item')], r = rows.find(x => x.querySelector('.setting-item-name')?.textContent === 'Hide binder and folder notes'); return !!r && (r.classList.contains('is-disabled') || !!r.querySelector('.checkbox-container.is-disabled, [disabled]')); })()`);
	t.ok(!shows || disabled, 'with ordering off the binder note is still hidden, or the toggle shows it has no effect (the note is listed; the toggle still looks on)');
});

ux('settings: Escape in a name field puts the name back', async (p, h, t) => {
	const popout = await openSettings(p);
	// (the settings window must be the one in front: a field in a window that's lost the focus is left, and saved,
	// before the key arrives)
	if (popout) { await p.sleep(600); await p.ev(`(() => { ${SWIN}.focus(); return 1; })()`); await p.sleep(300); }
	const a = await sat(p, '.binders-settings-label input[type="text"]');
	await sclick(p, popout, a.x, a.y);
	await skey(p, popout, 'a', true);
	await stype(p, popout, 'Zed');
	await skey(p, popout, 'Escape');
	await p.sleep(300);
	t.ok(await p.ev(`!!app.setting.activeTab`), 'the settings are still open');
	t.eq(await p.ev(`${TAB}.querySelector('.binders-settings-label input[type="text"]').value`), 'Red', 'the field shows the name it had');
	await p.ev(`${TAB}.querySelector('.binders-settings-label input[type="text"]').blur()`);
	await p.sleep(300);
	t.eq((await labels(p))[0].name, 'Red', 'and it isn’t renamed when the field is left');
});

ux('settings: restoring the default labels asks first when there are labels of your own to lose', async (p, h, t) => {
	await set(p, { labels: [{ name: 'Mara', color: '#ff8800' }, { name: 'The keeper', color: 'blue' }] });
	await openSettings(p);
	await p.ev(`(() => { ${TAB}.querySelector('[aria-label="Restore the default labels"]').click(); return 1; })()`);
	const asked = await answer(p, 'Cancel');
	await p.sleep(500);
	t.eq(j((await labels(p)).map((l) => l.name)), j(['Mara', 'The keeper']), 'the labels are still there until it’s confirmed (they’re replaced at once, with no way back)');
});

ux('settings: two properties can’t be given the same name', async (p, h, t) => {
	await openSettings(p);
	await p.ev(`(() => { const el = [...${TAB}.querySelectorAll('.setting-group:last-child input[type=text]')][2]; el.focus(); el.value = 'status'; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`);
	await p.sleep(400);
	const s = await p.ev(`[${PL}.settings.statusProp, ${PL}.settings.labelProp]`);
	t.ok(s[0] !== s[1], `Label and Status don’t share “${s[0]}” (they do: every status shows as a label, and “Set label” overwrites the status)`);
});

ux('custom color: a hex typed without its # is taken', async (p, h, t) => {
	await openView(p);
	await openItemMenu(p, 'Prologue.md', 'Set label');
	await clickMenu(p, 'Custom color...');
	await until(p, `!!document.querySelector('.modal input[aria-label="Hex color"]')`);
	await p.key('a', 'ctrl');
	await p.type('ff0000');
	await p.key('Enter');
	await p.sleep(600);
	t.eq((await fm(p, L + 'Prologue.md')).label ?? null, '#ff0000', '“ff0000” is red');
});

ux('targets: something that isn’t a number keeps the dialog open, with what was typed', async (p, h, t) => {
	await openView(p);
	await typeTarget(p, 'Prologue.md', '2k');
	const still = await p.ev(`document.querySelector('.modal .binders-ask input')?.value ?? null`);
	t.eq(still, '2k', 'the dialog is still there to correct (it closes, and a notice says a target is a number)');
});

ux('targets: the binder’s own target can be set from the view', async (p, h, t) => {
	await openView(p);
	const found = [];
	const wc = await p.at('.workspace-leaf.mod-active .binders-word-count');
	for (const act of ['click', 'right']) {
		await p[act](wc.x, wc.y);
		await p.sleep(250);
		found.push(...(await menuItems(p)));
		if (await p.ev(`!!document.querySelector('.modal .binders-ask input')`)) found.push('target dialog');
		await closeMenus(p);
		await p.ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`);
	}
	const more = await p.at('.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="More options"]');
	await p.click(more.x, more.y);
	await p.sleep(250);
	found.push(...(await menuItems(p)));
	await closeMenus(p);
	found.push(...(await p.ev(`Object.values(app.commands.commands).filter(c => c.id.startsWith('binders:')).map(c => c.name)`)));
	t.ok(found.some((x) => /target/i.test(x)), 'the word count, the view’s menu or a command sets the target of the folder shown (only editing the hidden binder note’s properties does)');
});

ux('targets: a folder’s target shows on the corkboard, on its heading', async (p, h, t) => {
	await p.ev(`(async () => { const n = await ${B}.ensureFolderNote(${file('The Lighthouse/Part One')}); await app.fileManager.processFrontMatter(n, fm => { fm.target = 100; }); })().then(() => 1)`);
	await openView(p);
	await p.sleep(400);
	const head = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-group-heading')].find(h => h.querySelector('.binders-group-name')?.textContent === 'Part One')?.innerText ?? ''`);
	t.ok(/100/.test(head), `Part One’s heading says how far along its 100 words it is (it says “${head.replace(/\n/g, ' · ')}”)`);
});

ux('filter: the menu stays where it is after a pick', async (p, h, t) => {
	await openView(p);
	await openFilter(p);
	const left = () => p.ev(`Math.round(document.querySelector('.menu').getBoundingClientRect().left)`);
	const before = await left();
	await clickMenu(p, 'Revised');
	await p.sleep(350);
	const after = await left();
	t.eq(after, before, 'the reopened menu is where the first was (it jumps left as the button grows to “Filter (1)”)');
});

ux('filter: by keyboard, the menu keeps its place after a pick', async (p, h, t) => {
	await openView(p);
	await p.ev(`document.querySelector('${filterButton}').focus()`);
	await p.key('Enter');
	await p.sleep(300);
	const sel = () => p.ev(`document.querySelector('.menu .menu-item.selected')?.textContent ?? null`);
	for (let i = 0; i < 6 && (await sel()) !== 'Draft'; i++) await p.key('ArrowDown');
	t.eq(await sel(), 'Draft', 'the arrows reach Draft');
	await p.key('Enter');
	await p.sleep(400);
	t.eq(j((await viewState(p)).filter.status), j(['Draft']), 'Enter picks it');
	t.eq(await sel(), 'Draft', 'and Draft is still the item selected, to go on from (nothing is: the next arrow starts from the top)');
});

ux('filter: a value no note has any more can still be unticked, and an empty board says why', async (p, h, t) => {
	await setFm(p, L + 'Epilogue.md', { status: 'Proofed' });
	await openView(p);
	await openFilter(p);
	await clickMenu(p, 'Proofed');
	await p.sleep(300);
	await closeMenus(p);
	t.eq(j(short(await cards(p))), j(['Epilogue']), 'filtered to the one proofed note');
	await setFm(p, L + 'Epilogue.md', { status: 'Done' });
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 0`);
	const said = await p.ev(`/filter|no notes|nothing/i.test(document.querySelector('.workspace-leaf.mod-active .binders-mode').innerText)`);
	await openFilter(p);
	const items = await menuItems(p);
	await closeMenus(p);
	t.ok(items.includes('Proofed'), 'the menu still lists “Proofed”, ticked, to take it off (it doesn’t: only “Clear filter” can)');
	t.ok(said, 'and the empty board says the filter hides every note');
});

ux('filter: headings and the toolbar count what’s shown', async (p, h, t) => {
	await openView(p);
	await openFilter(p);
	await clickMenu(p, 'Revised');
	await p.sleep(300);
	await closeMenus(p);
	t.eq(j(short(await cards(p))), j(['Arrival']), 'one note shown');
	const count = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-group-heading')].find(h => h.querySelector('.binders-group-name')?.textContent === 'Part Two')?.querySelector('.binders-group-count')?.textContent ?? ''`);
	t.ok(!/^2 notes/.test(count), `Part Two, with none of its notes shown, doesn’t say “${count}” as if they were`);
});

ux('filter: one entry for one color, however its hex is written', async (p, h, t) => {
	await setFm(p, L + 'Prologue.md', { label: '#abc' });
	await setFm(p, L + 'Epilogue.md', { label: '#AABBCC' });
	await openView(p);
	await openFilter(p);
	const items = await menuItems(p);
	await closeMenus(p);
	t.eq(items.filter((x) => x === 'Custom color').length, 1, 'the same color is one “Custom color”, not two alike');
});

ux('tint: the word count on a tinted card reads no worse than on a plain one', async (p, h, t) => {
	await setFm(p, L + 'Prologue.md', { label: 'blue' });
	await openView(p);
	const plain = (await p.ev(`(${CONTRAST})(${j(card(L + 'Epilogue.md'))})`)).words;
	await moreOptions(p, 'Tint cards with their label color');
	const tinted = (await p.ev(`(${CONTRAST})(${j(card(L + 'Prologue.md'))})`)).words;
	t.ok(tinted >= plain - 0.05, `contrast ${tinted} on the tint, ${plain} on a plain card`);
});

ux('phone: in the settings, a label’s color list shows the color’s name', async (p, h, t) => {
	await onPhone(p, async () => {
		await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
		await until(p, `app.setting.activeTab?.containerEl.querySelectorAll('.binders-settings-label').length > 0`);
		await p.sleep(400);
		const w = await p.ev(`(() => { const r = app.setting.activeTab.containerEl.querySelectorAll('.binders-settings-label')[1]; r.scrollIntoView({ block: 'center' }); return { dd: Math.round(r.querySelector('select[aria-label="Color"]').getBoundingClientRect().width), name: Math.round(r.querySelector('input[type=text]').getBoundingClientRect().width) }; })()`);
		t.ok(w.dd >= 90, `the list is wide enough to read “Orange” (it’s ${w.dd}px: only its arrows show; the name field is ${w.name}px)`);
	});
});
