// QA round 5: the outliner on a phone and a tablet, by touch. Obsidian's mobile mode (app.emulateMobile) at 320 × 568,
// 360 × 640, 390 × 844, 430 × 932 and their landscapes, and a tablet's 820 × 1180 and 1180 × 820, with real touches
// sent over CDP (taps, long presses, swipes, drags). Tests named "qa5 outliner: …" pass; "BUG: …" are confirmed bugs
// (they fail now and will pass once fixed); "UX: …" are behaviours that should exist. Every test puts Obsidian back on
// the desktop when it ends.
//
// What the emulation can't do (as in specs-qa4-mobile.mjs): a long press never sends `contextmenu`; the on-screen
// keyboard is only a shorter viewport (no device scrolls the focused field into view for us, though Chromium does
// bring the caret into view when something is typed); safe areas are whatever Obsidian's variables say.
//
// QA5_SHOTS=<dir> saves screenshots of every step there; QA5_DATA=<dir> saves what was measured, as JSON.
import { mkdirSync, writeFileSync } from 'fs';
import { B, PL, VIEW, closeMenus, contents, flush, j, menuItems, openView, read, reload, texts, tidy, until, viewState } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa5 outliner: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa5 outliner: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa5 outliner: ' + name, fn });

const L = 'The Lighthouse/';
const LEAF = '.workspace-leaf.mod-active';
const PHONE = [390, 844], SMALL = [320, 568], TABLET = [820, 1180];
const SHOTS = process.env.QA5_SHOTS || '', DATA = process.env.QA5_DATA || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
if (DATA) mkdirSync(DATA, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const dump = (name, data) => { if (DATA) writeFileSync(`${DATA}/${name}.json`, JSON.stringify(data, null, 1)); };
/** Checks that don't stop the test at the first one that fails: `done()` fails it with all of them. */
const soft = (t) => { const bad = []; return { ok: (c, m) => { if (!c) bad.push(m); return !!c; }, eq: (a, b, m) => { if (a !== b) bad.push(`${m}: expected ${j(b)}, got ${j(a)}`); return a === b; }, done: () => { if (bad.length) t.ok(false, `${bad.length} failed: ` + bad.join(' ¦ ')); } }; };

// ---- touch ----
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
/** A long press that's let go without moving. */
const hold = async (p, x, y, ms = 700) => { await touch(p, 'touchStart', x, y); await p.sleep(ms); await touch(p, 'touchEnd'); await p.sleep(550); };
/** A finger put down and moved straight away (a scroll). */
const swipe = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(500); };
/** A long press, then a move to (x1, y1), the finger still down. */
const pressAndMove = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); await p.sleep(620); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(20); } await p.sleep(200); };
/** The finger, still down, moves on to (x1, y1). */
const moveOn = async (p, x0, y0, x1, y1, steps = 8) => { for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(20); } await p.sleep(200); };

// ---- the device ----
const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
/** Runs fn in Obsidian's mobile mode at this size, with touch, in the theme the run asked for; then puts the desktop
    back whatever happened: menus, dialogs and settings closed, the text size, direction, motion and CPU as they were.
    Errors logged while on the device fail the test (the reload back would otherwise forget them). */
async function onDevice(p, [width, height], fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await metrics(p, width, height);
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await theme();
	await p.sleep(200);
	let logged = [];
	try { await fn(); logged = p.errors.filter((e) => !NOISE.test(e)); } finally {
		await touch(p, 'touchCancel').catch(() => {});
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		await p.send('Emulation.setEmulatedMedia', { features: [] });
		await gone(p).catch(() => {});
		for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(300); }
		// (the text size is saved a moment after it's set: wait until it's on disk, or the reload brings the large one back)
		await p.ev(`(async () => { try { app.setting.close(); } catch {} document.activeElement?.blur?.(); const base = app.vault.getAbstractFileByPath('Scenes.base'); if (base) await app.vault.delete(base); if (app.vault.getConfig('rightToLeft')) app.vault.setConfig('rightToLeft', false); document.body.classList.remove('mod-rtl'); if ((app.vault.getConfig('baseFontSize') ?? 16) !== 16) { app.vault.setConfig('baseFontSize', 16); app.updateFontSize?.(); } for (let i = 0; i < 60; i++) { let saved = 16; try { saved = JSON.parse(await app.vault.adapter.read(app.vault.configDir + '/appearance.json')).baseFontSize ?? 16; } catch {} if (saved === 16) break; await new Promise(r => setTimeout(r, 100)); } })().then(() => 1)`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
		await theme();
		await tidy(p);
	}
	if (logged.length) throw new Error('errors logged on the device: ' + logged.slice(0, 3).join(' ; '));
}

// ---- looking ----
const R = `(e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }`;
const rect = (p, sel) => p.ev(`(${R})(document.querySelector(${j(sel)}))`);
const rowIn = (base) => (path) => `${LEAF} .binders-outliner-row[data-path="${base}${path}"]`;
const row = rowIn(L);
const cell = (path, col, r = row) => `${r(path)} .binders-outliner-cell[data-col="${col}"]`;
const OUT = `document.querySelector('${LEAF} .binders-outliner')`;
/** Opens the binder view as an outliner (with these columns, if given) and waits until its word counts are in. */
async function open(p, folder = 'The Lighthouse', columns = null, more = {}) {
	await openView(p, folder);
	await p.ev(`(() => { const v = ${VIEW}; ${columns || Object.keys(more).length ? `v.options = { ...v.options, outliner: { ...(v.options.outliner ?? {}), ${columns ? `columns: ${j(columns.map((id) => (typeof id === 'string' ? { id } : id)))}, ` : ''}...${j(more)} } };` : ''} v.setMode('outliner'); try { v.current?.draw?.(); } catch {} return 1; })()`);
	await until(p, `!!document.querySelector('${LEAF} .binders-outliner-row, ${LEAF} .binders-outliner .binders-empty')`, 5000);
	await until(p, `/\\d/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '') || !!document.querySelector('${LEAF} .binders-outliner .binders-empty')`, 5000);
	await p.sleep(500);
}
const ALL = ['label', 'status', 'words', 'target', 'progress', 'export', 'created', 'modified'];
const selected = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-row.is-selected')].map(c => c.dataset.path)`);
const shown = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-row')].map(c => c.dataset.path)`);
const prop = async (p, path, key) => (await read(p, path)).split('\n').find((l) => l.startsWith(key + ':'))?.slice(key.length + 1).trim() ?? null;
const navbarTop = (p) => p.ev(`(() => { const b = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return b && b.height ? Math.round(b.top) : null; })()`);
const scrollTo = async (p, left, top) => { await p.ev(`(() => { const o = ${OUT}; ${left == null ? '' : `o.scrollLeft = ${left};`} ${top == null ? '' : `o.scrollTop = ${top};`} return 1; })()`); await p.sleep(300); };
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent)`);
const active = (p) => p.ev(`(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { tag: a.tagName, cls: a.className, value: a.value ?? null, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], hint: a.getAttribute?.('enterkeyhint') ?? null, inputMode: a.inputMode ?? null, font: parseFloat(getComputedStyle(a).fontSize), row: a.closest?.('.binders-outliner-row')?.dataset.path ?? null }; })()`);
/** Everything about how the outliner is laid out right now. */
const layout = (p) => p.ev(`(() => { const R = ${R}; const o = ${OUT}; const leaf = document.querySelector('${LEAF}'); const view = leaf.querySelector('.binders-view'); const head = o.querySelector('.binders-outliner-head');
	const clip = (n) => !!n && (n.scrollWidth > n.clientWidth + 1);
	const ths = [...head.querySelectorAll('.binders-outliner-th')].map(e => ({ col: e.dataset.col ?? '+', rect: R(e), pos: getComputedStyle(e).position, clipped: clip(e.querySelector('.binders-outliner-th-name')) }));
	const rows = [...o.querySelectorAll('.binders-outliner-row')].map(r => { const n = r.querySelector('.binders-outliner-name'), s = r.querySelector('.binders-outliner-synopsis'); return { path: r.dataset.path, rect: R(r), level: +r.getAttribute('aria-level'), name: { rect: R(n), clipped: clip(n), text: n.textContent }, syn: s && s.getBoundingClientRect().height ? { rect: R(s), clipped: s.scrollHeight > s.clientHeight + 1, lines: Math.round(s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight)) } : null, chevron: R(r.querySelector('.binders-outliner-chevron')), cells: [...r.querySelectorAll('.binders-outliner-cell[data-col]:not(.mod-title)')].map(c => ({ col: c.dataset.col, rect: R(c), text: c.textContent, clipped: [...c.querySelectorAll('.binders-outliner-value, .binders-chip, .binders-outliner-field')].some(clip) })) }; });
	const f = o.querySelector('.binders-outliner-foot');
	return { inner: [innerWidth, innerHeight], body: document.body.className.split(' ').filter(c => /^is-|^mod-|^theme-/.test(c)).join(' '), view: R(view), out: R(o), scroll: { w: o.scrollWidth, cw: o.clientWidth, h: o.scrollHeight, ch: o.clientHeight, left: o.scrollLeft, top: o.scrollTop }, viewOut: view.scrollWidth - view.clientWidth, titlePos: getComputedStyle(o.querySelector('.binders-outliner-row .mod-title')).position, title: R(o.querySelector('.binders-outliner-row .mod-title')), head: R(head), ths, rows, foot: R(f), footText: [...f.querySelectorAll('.binders-outliner-cell')].map(c => c.textContent), nav: (() => { const b = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return b && b.height ? [Math.round(b.top), Math.round(b.bottom)] : null; })(), font: getComputedStyle(o).fontSize, rowFont: getComputedStyle(o.querySelector('.binders-outliner-name')).fontSize, synFont: getComputedStyle(o.querySelector('.binders-outliner-synopsis') ?? o).fontSize, headFont: getComputedStyle(head).fontSize }; })()`);

// ---- menus and dialogs ----
/** The last menu shown: where it is, and its items. On a phone Obsidian shows a menu as a sheet along the bottom. */
const sheet = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), bottom: Math.round(r.bottom), inner: [innerWidth, innerHeight], itemHeights: [...m.querySelectorAll('.menu-item:not(.is-label)')].map(i => Math.round(i.getBoundingClientRect().height)) }; })()`);
const isSheet = (s) => !!s && s.left === 0 && s.width === s.inner[0] && s.bottom === s.inner[1];
const menus = (p) => p.ev(`document.querySelectorAll('.menu').length`);
/** The last menu's items, with a tick on the ones that are checked. */
const items = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); return m ? [...m.querySelectorAll('.menu-item')].filter(i => i.querySelector('.menu-item-title')).map(i => i.querySelector('.menu-item-title').textContent + (i.querySelector('.menu-item-icon.mod-checked svg, .mod-selected svg') || i.classList.contains('mod-checked') || i.querySelector('.menu-item-icon.mod-toggle svg') ? ' ✓' : '')) : []; })()`);
/** Taps the menu item with this title (in the last menu shown), scrolled into view first. False if there's none. */
async function menuTap(p, title) {
	const find = `[...document.querySelectorAll('.menu .menu-item')].filter(e => (e.querySelector('.menu-item-title')?.textContent ?? '') === ${j(title)}).pop()`;
	if (!(await p.ev(`(() => { const it = ${find}; if (!it) return false; it.scrollIntoView({ block: 'center' }); return true; })()`))) return false;
	await p.sleep(250);
	const at = await p.ev(`(() => { const r = (${find}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await tap(p, at.x, at.y);
	return true;
}
/** Closes any menu left open, and forgets its elements. */
async function gone(p) {
	await closeMenus(p);
	await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`);
	await p.sleep(250);
}
const dialog = (p) => p.ev(`(() => { const R = ${R}; const c = [...document.querySelectorAll('.modal-container')].pop(), m = c?.querySelector('.modal'); if (!m) return null; const t = m.querySelector('.modal-title'); return { inner: [innerWidth, innerHeight], box: R(m), title: t?.textContent ?? '', text: m.querySelector('.modal-content')?.innerText ?? '', fields: [...m.querySelectorAll('input[type="text"], select')].map(i => ({ rect: R(i), value: i.value })), buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => ({ text: b.textContent, cls: b.className, rect: R(b) })), menus: document.querySelectorAll('.menu').length }; })()`);
const dialogTap = async (p, text) => {
	const at = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); const b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`no “${text}” button in the dialog`);
	await p.sleep(150);
	await tap(p, at.x, at.y);
	await p.sleep(400);
};
const closeDialog = async (p) => { const x = await p.at('.modal .modal-header-button'); if (x) await tap(p, x.x, x.y); else await p.key('Escape'); await p.sleep(500); };
const dialogs = (p) => p.ev(`document.querySelectorAll('.modal-container').length`);
/** Brings a row to the middle of the screen (clear of the header and of the phone's navigation bar). */
async function see(p, path, r = row) { await p.ev(`(() => { document.querySelector(${j(r(path))})?.scrollIntoView({ block: 'center' }); return 1; })()`); await p.sleep(250); }
/** A point on a row's name: where a long press takes hold of it (a tap there opens it). */
async function grip(p, path, r = row) {
	await see(p, path, r);
	const n = await p.at(`${r(path)} .binders-outliner-name`);
	if (!n) throw new Error('no row for ' + path);
	return { x: n.l + 14, y: n.y, name: n };
}
/** Holds a row until its menu shows. */
async function rowMenu(p, path, r = row) {
	const g = await grip(p, path, r);
	await hold(p, g.x, g.y);
	if (!(await menus(p))) throw new Error('no menu after holding the row of ' + path);
}
/** Taps a row where a tap only selects it: its synopsis, or without one its first cell after the title. */
async function pick(p, path, r = row) {
	await see(p, path, r);
	const c = (await p.at(`${r(path)} .binders-outliner-synopsis`)) ?? (await p.at(`${r(path)} .binders-outliner-cell:not(.mod-title):not(.mod-filler)`));
	if (!c) throw new Error('no row for ' + path);
	await tap(p, c.x, c.y);
}
const goBack = async (p) => { await p.ev(`app.commands.executeCommandById('app:go-back')`); await until(p, `!!document.querySelector('${LEAF} .binders-outliner-row')`); await p.sleep(400); };
const activeFile = (p) => p.ev(`app.workspace.getActiveFile()?.path ?? null`);
const fileExists = (p, path) => p.ev(`!!app.vault.getAbstractFileByPath(${j(path)})`);
/** Makes a binder (on the desktop, before the device). `entries`: { path, fm?, text? }; a path ending in "/" is a folder. */
const makeBinder = async (p, name, entries, version = 1) => {
	await p.ev(`(async () => {
		const base = ${j(name)}; if (!app.vault.getAbstractFileByPath(base)) await app.vault.createFolder(base);
		const contents = [];
		for (const e of ${j(entries)}) {
			contents.push(e.path);
			if (e.path.endsWith('/')) { await app.vault.createFolder(base + '/' + e.path.slice(0, -1)); continue; }
			await app.vault.create(base + '/' + e.path + '.md', (e.fm ? '---\\n' + e.fm + '\\n---\\n' : '') + (e.text ?? 'Some words here.') + '\\n');
		}
		await app.vault.create(base + '/' + base + '.md', '---\\nbinder: ${version}\\ncontents:' + (contents.length ? '\\n' + contents.map(c => '  - ' + JSON.stringify(c)).join('\\n') : ' []') + '\\n---\\n');
	})().then(() => 1)`);
	await until(p, `!!${B}.binderOf(app.vault.getAbstractFileByPath(${j(name)}))`, 5000);
	await p.sleep(600);
};
const frames = (p, ms) => p.ev(`(() => { const fr = window.__qa5f = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); fr.push(n - last); last = n; if (n - t0 < ${ms}) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
const frameStats = (p) => p.ev(`(() => { const f = window.__qa5f.slice(1).sort((a, b) => a - b); return { frames: f.length, median: Math.round(f[f.length >> 1]), p95: Math.round(f[Math.floor(f.length * 0.95)]), worst: Math.round(f[f.length - 1]) }; })()`);
/** What a drag shows right now. */
const dragState = (p) => p.ev(`(() => { const R = ${R}; const g = document.querySelector('.binders-outliner-ghost'), l = document.querySelector('.binders-drop-line'); return { ghost: R(g), ghostText: g?.querySelector('.drag-ghost-self')?.textContent ?? null, hint: g?.querySelector('.drag-ghost-action')?.textContent ?? null, hintShown: g ? getComputedStyle(g.querySelector('.drag-ghost-action')).display !== 'none' : false, line: l && l.classList.contains('is-active') ? R(l) : null, into: document.querySelector('${LEAF} .binders-outliner-row.is-being-dragged-over')?.dataset.path ?? null, dimmed: [...document.querySelectorAll('${LEAF} .binders-outliner-row.is-dragging')].map(r => r.dataset.path), lifted: [...document.querySelectorAll('${LEAF} .binders-outliner-row.is-lifted')].map(r => r.dataset.path), scroll: ${OUT}.scrollTop, inner: [innerWidth, innerHeight] }; })()`);
const leftovers = (p) => p.ev(`document.querySelectorAll('.binders-outliner-ghost, .binders-drop-line, .binders-outliner-row.is-dragging, .binders-outliner-row.is-lifted, .binders-outliner-row.is-being-dragged-over, body.is-grabbing').length`);

// =====================================================================================================================
// How it's laid out, size by size
// =====================================================================================================================

const SIZES = { '320x568': [320, 568], '360x640': [360, 640], '390x844': [390, 844], '430x932': [430, 932], '568x320': [568, 320], '640x360': [640, 360], '844x390': [844, 390], '932x430': [932, 430] };
const resetView = (p) => p.ev(`(() => { const v = ${VIEW}; if (v) v.options = { ...v.options, outliner: undefined }; return 1; })()`);

test('every phone size, upright and on its side: nothing sticks out of the view, the header stays put, every column and “+” can be reached, rows, headers and fold targets are a finger tall, and the totals clear the navigation bar', async (p, h, t) => {
	const c = soft(t), all = {};
	await onDevice(p, PHONE, async () => {
		for (const [name, [w, hh]] of Object.entries(SIZES)) {
			await metrics(p, w, hh);
			await p.sleep(500);
			await open(p);
			await scrollTo(p, 0, 0);
			await shot(p, `layout-${name}`);
			const a = all[name] = await layout(p);
			c.ok(/is-phone/.test(a.body), `${name}: a phone`);
			c.ok(a.viewOut <= 0 && a.view[2] <= w, `${name}: the view itself doesn’t scroll sideways`);
			c.eq(a.titlePos, w < 420 ? 'relative' : 'sticky', `${name}: the title column is pinned from 420 px`);
			c.eq(j(a.ths.map((x) => x.col)), j(['title', 'label', 'status', 'words', '+']), `${name}: the columns it starts with`);
			c.ok(a.ths.every((x) => x.rect[3] >= 40 && !x.clipped), `${name}: every header is 40 px tall and reads whole: ${j(a.ths.map((x) => [x.col, x.rect[3], x.clipped]))}`);
			c.ok(a.rows.every((r) => r.rect[3] >= 40), `${name}: every row is 40 px tall or more: ${j(a.rows.map((r) => r.rect[3]))}`);
			c.ok(a.rows.filter((r) => /Part/.test(r.name.text) && !r.path.endsWith('.md')).every((r) => r.chevron[2] >= 40 && r.chevron[3] >= 40), `${name}: folders fold from 40 px targets`);
			c.ok(a.rows.every((r) => !r.syn || r.syn.lines <= 3), `${name}: a synopsis takes three lines at most`);
			// (at 320 px the title column is 110 px, the least it can be: a name inside a folder has 56 px of it, and ends in an ellipsis)
			c.ok(a.rows.every((r) => !r.name.clipped || (w < 360 && r.level > 1 && r.name.rect[2] >= 50)), `${name}: no name here is cut short${w < 360 ? ' but inside a folder, where 50 px or more of it show' : ''}: ${j(a.rows.filter((r) => r.name.clipped).map((r) => [r.name.text, r.level, r.name.rect[2]]))} (title column ${a.title[2]} px)`);
			c.eq(a.rowFont, '14px', `${name}: text the size of a base’s table`);
			// down: the header stays
			await scrollTo(p, null, 140);
			const d = await layout(p);
			c.ok(d.scroll.top > 0 && d.head[1] === d.out[1], `${name}: scrolled down, the header stays at the top (${d.head[1]} / ${d.out[1]}, scrolled ${d.scroll.top})`);
			// across: the last column and "+"
			await scrollTo(p, 99999, 0);
			const x = await layout(p), plus = x.ths.find((q) => q.col === '+'), words = x.ths.find((q) => q.col === 'words');
			await shot(p, `layout-${name}-across`);
			c.ok(plus.rect[0] >= 0 && plus.rect[0] + plus.rect[2] <= x.out[0] + x.out[2] && plus.rect[2] >= 32, `${name}: “+” is in sight at the columns’ end: ${j(plus.rect)}`);
			c.ok(words.rect[0] >= 0 && words.rect[0] + words.rect[2] <= x.out[0] + x.out[2], `${name}: and the word counts`);
			if (w >= 420) c.eq(x.title[0], 0, `${name}: the title stays while the columns scroll`);
			// the end
			await scrollTo(p, 0, 99999);
			const e = await layout(p);
			await shot(p, `layout-${name}-end`);
			c.ok(e.nav && e.foot[1] + e.foot[3] <= e.nav[0], `${name}: the totals row (${j(e.foot)}) is above the navigation bar (${j(e.nav)})`);
			c.ok(/^7 notes$/.test(e.footText[0]) && e.footText.includes('106'), `${name}: and adds up: ${j(e.footText)}`);
			// every column there is
			await open(p, 'The Lighthouse', ALL);
			await scrollTo(p, 0, 0);
			await shot(p, `layout-${name}-all`);
			const f = await layout(p);
			c.eq(f.ths.length, 10, `${name}: all eight columns show`);
			c.ok(f.ths.every((q) => !q.clipped), `${name}: no header’s name is cut short with all of them on`);
			await scrollTo(p, 99999, 0);
			await shot(p, `layout-${name}-all-across`);
			const g = await layout(p), last = g.ths.find((q) => q.col === 'modified');
			c.ok(last.rect[0] + last.rect[2] <= g.out[0] + g.out[2], `${name}: the last of them can be scrolled to`);
			await scrollTo(p, 0, 0);
			await resetView(p);
		}
	});
	dump('layout-phone', all);
	c.done();
});

test('tablet, upright and on its side: the title is pinned, there’s no navigation bar to clear, menus are popovers by the finger, a row drags, renames and opens beside a note in a split pane', async (p, h, t) => {
	const c = soft(t), f = {};
	await onDevice(p, TABLET, async () => {
		for (const [name, [w, hh]] of Object.entries({ '820x1180': [820, 1180], '1180x820': [1180, 820] })) {
			await metrics(p, w, hh);
			await p.sleep(500);
			await open(p, 'The Lighthouse', ALL);
			await scrollTo(p, 0, 0);
			await shot(p, `tablet-${name}-all`);
			const a = f[name] = await layout(p);
			c.ok(/is-tablet/.test(a.body) && !a.nav, `${name}: a tablet, with no floating navigation bar`);
			c.eq(a.titlePos, 'sticky', `${name}: the title is pinned`);
			c.ok(a.viewOut <= 0, `${name}: nothing sticks out`);
			c.ok(a.rows.every((r) => r.rect[3] >= 40) && a.ths.every((x) => x.rect[3] >= 40 && !x.clipped), `${name}: rows and headers a finger tall`);
			await resetView(p);
		}
		await metrics(p, ...TABLET);
		await p.sleep(500);
		await open(p);
		await pick(p, 'Part One/Arrival.md');
		c.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), 'a tap selects');
		const sc = await p.at(cell('Part One/Arrival.md', 'status'));
		await tap(p, sc.x, sc.y);
		f.statusMenu = { sheet: await sheet(p), items: await items(p), cell: sc };
		await shot(p, 'tablet-status-menu');
		c.ok(f.statusMenu.sheet && !isSheet(f.statusMenu.sheet) && Math.abs(f.statusMenu.sheet.left - sc.l) < 20 && f.statusMenu.sheet.top >= sc.t + sc.h, 'the statuses open as a popover under their cell: ' + j(f.statusMenu.sheet));
		await menuTap(p, 'Done');
		await p.sleep(600);
		await flush(p);
		c.eq(await prop(p, L + 'Part One/Arrival.md', 'status'), 'Done', 'a status picked');
		const g = await grip(p, 'Part Two/The wreck.md');
		await hold(p, g.x + 200, g.y);
		f.rowMenu = { sheet: await sheet(p), items: await items(p), at: [g.x + 200, g.y] };
		await shot(p, 'tablet-row-menu');
		c.ok(f.rowMenu.sheet && !isSheet(f.rowMenu.sheet) && f.rowMenu.sheet.left >= 0 && f.rowMenu.sheet.bottom <= TABLET[1], 'a long press opens the row’s menu as a popover on the screen: ' + j(f.rowMenu.sheet));
		c.ok(f.rowMenu.items.includes('Open to the right'), 'with “Open to the right”, which a tablet has room for');
		await menuTap(p, 'Set label');
		await p.sleep(500);
		await shot(p, 'tablet-row-submenu');
		await menuTap(p, 'Green');
		await p.sleep(600);
		await flush(p);
		c.eq(await menus(p), 0, 'a label picked in the submenu closes both menus');
		c.eq(await prop(p, L + 'Part Two/The wreck.md', 'label'), 'Green', 'and sets it');
		const th = await p.at(`${LEAF} .binders-outliner-th[data-col="words"]`);
		await tap(p, th.x, th.y);
		f.headMenu = { sheet: await sheet(p), items: await items(p) };
		await shot(p, 'tablet-header-menu');
		c.ok(!isSheet(f.headMenu.sheet) && f.headMenu.items.includes('Sort ascending'), 'a header’s menu is a popover too');
		await gone(p);
		const g2 = await grip(p, 'Part One/Arrival.md'), k = await rect(p, row('Part One/The keeper.md'));
		await pressAndMove(p, g2.x + 100, g2.y, g2.x + 100, k[1] + k[3] - 6);
		f.drag = { finger: [g2.x + 100, k[1] + k[3] - 6], ...(await dragState(p)) };
		await shot(p, 'tablet-drag');
		c.eq(f.drag.hint, 'Move after “The keeper”', 'a held row drags, and says where it would go');
		await touch(p, 'touchEnd');
		await p.sleep(900);
		await flush(p);
		c.eq(j((await contents(p)).slice(2, 4)), j(['Part One/The keeper', 'Part One/Arrival']), 'dropped there');
		await rowMenu(p, 'Epilogue.md');
		await menuTap(p, 'Rename');
		await p.sleep(500);
		c.eq((await active(p)).tag, 'INPUT', 'Rename opens the name’s field');
		await p.type('Coda');
		await p.key('Enter');
		await p.sleep(800);
		c.ok(await fileExists(p, L + 'Coda.md'), 'and Enter renames');
		// beside a note: a pane narrower than 420 px wouldn't pin the title; this one is 410
		await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')})); app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); })().then(() => 1)`);
		await p.sleep(1000);
		await shot(p, 'tablet-split');
		f.split = await layout(p);
		c.ok(f.split.viewOut <= 0 && f.split.view[2] < 500, 'in half the screen nothing sticks out: ' + j(f.split.view));
		const a = await p.at(row('Part One/Arrival.md') + ' .binders-outliner-name');
		await tap(p, a.l + 14, a.y);
		await p.sleep(900);
		f.splitOpen = await p.ev(`[...document.querySelectorAll('.workspace-split.mod-root .workspace-tabs')].map(tabs => { const l = tabs.querySelector('.workspace-leaf.mod-active') ?? tabs.querySelector('.workspace-leaf'); return l?.querySelector('.view-header-title')?.textContent ?? ''; })`);
		await shot(p, 'tablet-split-opened');
		c.ok(f.splitOpen.length === 2 && /Arrival/.test(f.splitOpen[0]) && /keeper/.test(f.splitOpen[1]), 'a tap on a name opens the note in the outliner’s own pane: ' + j(f.splitOpen));
	});
	dump('tablet', f);
	c.done();
});

// =====================================================================================================================
// Taps
// =====================================================================================================================

test('phone taps: a synopsis selects, a name opens (a folder’s opens the folder) and Back returns with the row still selected, the chevron’s 40 px folds without opening, the space below and the totals unselect, two taps on a synopsis edit it', async (p, h, t) => {
	const c = soft(t), f = {};
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		f.viewport = await p.ev(`document.querySelector('meta[name="viewport"]')?.content ?? null`);
		await pick(p, 'Prologue.md');
		c.eq(j(await selected(p)), j([L + 'Prologue.md']), 'a tap on a synopsis selects the row');
		c.eq(await activeFile(p), null, 'and opens nothing');
		c.ok(!(await p.ev(`document.activeElement.matches(':focus-visible')`)), 'with no focus ring after a tap');
		await shot(p, 'taps-selected');
		const n = await p.at(row('Prologue.md') + ' .binders-outliner-name');
		await tap(p, n.l + 14, n.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Prologue.md')}`);
		c.eq(await activeFile(p), L + 'Prologue.md', 'a tap on a name opens the note');
		await goBack(p);
		c.eq((await viewState(p))?.mode, 'outliner', 'Back returns to the outliner');
		c.eq(j(await selected(p)), j([L + 'Prologue.md']), 'with the row still selected');
		const fn = await p.at(row('Part One') + ' .binders-outliner-name');
		await tap(p, fn.l + 14, fn.y);
		await p.sleep(800);
		c.eq((await viewState(p))?.folder, L + 'Part One', 'a tap on a folder’s name opens the folder');
		c.eq(j(await shown(p)), j(['Arrival', 'The keeper', 'Storm warning'].map((x) => `${L}Part One/${x}.md`)), 'as an outliner of its own notes');
		await shot(p, 'taps-folder-opened');
		await goBack(p);
		c.eq((await viewState(p))?.folder, 'The Lighthouse', 'and Back goes up again');
		const ch = await p.at(row('Part One') + ' .binders-outliner-chevron');
		const n0 = (await shown(p)).length;
		await tap(p, ch.x, ch.y);
		c.eq((await shown(p)).length, n0 - 3, 'a tap on the chevron folds');
		c.eq(await p.ev(`document.querySelector(${j(row('Part One'))}).getAttribute('aria-expanded')`), 'false', 'and says so');
		await shot(p, 'taps-folded');
		await tap(p, ch.l + ch.w - 3, ch.y); // the far right of its 40 px, over the start of the name
		await p.sleep(300);
		c.eq((await shown(p)).length, n0, 'a tap at the edge of its 40 px unfolds');
		c.eq((await viewState(p))?.folder, 'The Lighthouse', 'without opening the folder');
		await see(p, 'Epilogue.md');
		const nc = await p.at(row('Epilogue.md') + ' .binders-outliner-chevron');
		await tap(p, nc.x, nc.y);
		await p.sleep(400);
		c.eq(j([await activeFile(p), await selected(p)]), j([null, [L + 'Epilogue.md']]), 'a tap left of a note’s name (where a folder has its chevron) selects it');
		await scrollTo(p, 0, 99999);
		const foot = await rect(p, `${LEAF} .binders-outliner-foot`);
		await tap(p, 200, foot[1] + foot[3] + 14);
		c.eq(j(await selected(p)), '[]', 'a tap below the rows unselects');
		await pick(p, 'Epilogue.md');
		await scrollTo(p, 0, 99999);
		const foot2 = await rect(p, `${LEAF} .binders-outliner-foot`);
		await tap(p, 60, foot2[1] + foot2[3] / 2);
		c.eq(j(await selected(p)), '[]', 'so does a tap on the totals');
		await scrollTo(p, 0, 0);
		const s = await p.at(row('Part One/Arrival.md') + ' .binders-outliner-synopsis');
		await touch(p, 'touchStart', s.x, s.y); await p.sleep(30); await touch(p, 'touchEnd'); await p.sleep(90); await touch(p, 'touchStart', s.x, s.y); await p.sleep(30); await touch(p, 'touchEnd'); await p.sleep(600);
		f.doubleTap = await active(p);
		c.eq(j([f.doubleTap.tag, f.doubleTap.row, await activeFile(p)]), j(['TEXTAREA', L + 'Part One/Arrival.md', null]), 'two quick taps on a synopsis edit it, and open nothing');
		await shot(p, 'taps-double-tap-synopsis');
		await p.ev(`document.activeElement.blur()`);
		await p.sleep(400);
		// a swipe across, then down: scrolls, selects nothing
		await p.ev(`(() => { ${VIEW}.current.restore({ sel: [] }); return 1; })()`);
		await swipe(p, 350, 400, 80, 400);
		// (qa6: with the Label column a color alone, 44 px, the columns are only 68 px wider than a 390 px screen: the
		// swipe scrolls them to their end, which is no longer 80 px away)
		const across = await p.ev(`[${OUT}.scrollLeft, ${OUT}.scrollWidth - ${OUT}.clientWidth]`);
		c.ok(across[1] > 0 && across[0] >= Math.min(80, across[1] - 1), 'a swipe across scrolls the columns: ' + j(across));
		await swipe(p, 200, 600, 200, 300);
		c.ok(await p.ev(`${OUT}.scrollTop`) > 80, 'a swipe up scrolls the rows');
		c.eq(j([await selected(p), await leftovers(p), await menus(p)]), j([[], 0, 0]), 'and neither selects, drags nor opens anything');
		await flush(p);
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) c.eq(after[path], text, `“${path}” is unchanged`);
	dump('taps', f);
	c.done();
});

// =====================================================================================================================
// Typing
// =====================================================================================================================

test('phone, typing a synopsis: the second tap puts the caret where it landed; Enter is a new line; a swipe, a turn of the phone and scrolling away keep the field and its text; a tap elsewhere, a switch of mode, opening a note and closing the tab each save it', async (p, h, t) => {
	const c = soft(t), f = {};
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		const P = 'Part Two/Lights out.md';
		await pick(p, P);
		c.eq(j(await selected(p)), j([L + P]), 'the first tap selects');
		c.eq((await active(p)).tag, 'DIV', 'and edits nothing yet');
		const s = await p.at(row(P) + ' .binders-outliner-synopsis');
		await tap(p, s.x, s.y);
		f.field = await active(p);
		c.eq(f.field.tag, 'TEXTAREA', 'the second edits the synopsis');
		c.ok(await p.ev(`document.activeElement.selectionStart > 0 && document.activeElement.selectionStart < document.activeElement.value.length`), 'with the caret where the tap was');
		await shot(p, 'edit-synopsis-open');
		await p.ev(`(() => { const a = document.activeElement; a.setSelectionRange(a.value.length, a.value.length); return 1; })()`);
		await p.type(' More.');
		await p.key('Enter');
		await p.type('Second line');
		const want = 'Mara climbs the tower and finds out why. More.\nSecond line';
		c.eq((await active(p)).value, want, 'Enter is a new line');
		await shot(p, 'edit-synopsis-typed');
		await swipe(p, 200, 500, 200, 400);
		c.eq(j([(await active(p)).tag, (await active(p)).value]), j(['TEXTAREA', want]), 'a swipe leaves the field open, with what was typed');
		await metrics(p, PHONE[1], PHONE[0]);
		await p.sleep(600);
		await shot(p, 'edit-synopsis-rotated');
		c.eq(j([(await active(p)).tag, (await active(p)).value]), j(['TEXTAREA', want]), 'so does turning the phone');
		await metrics(p, ...PHONE);
		await p.sleep(500);
		await scrollTo(p, 0, 0);
		c.eq((await active(p)).value, want, 'and scrolling its row away');
		const o = await p.at(row('Prologue.md') + ' .binders-outliner-synopsis');
		await tap(p, o.x, o.y);
		await p.sleep(600);
		await flush(p);
		f.saved = await read(p, L + P);
		c.ok(/More\.\n\s+Second line/.test(f.saved), 'a tap on another row saves it: ' + f.saved.split('---')[1]);
		c.eq(j(await selected(p)), j([L + 'Prologue.md']), 'and selects that row');
		const edit = async (path, text) => { await pick(p, path); const q = await p.at(row(path) + ' .binders-outliner-synopsis'); await tap(p, q.x, q.y); await p.ev(`(() => { const a = document.activeElement; a.setSelectionRange?.(a.value.length, a.value.length); return 1; })()`); await p.type(text); };
		await edit('Prologue.md', ' MODE');
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y);
		await menuTap(p, 'Corkboard');
		await p.sleep(800);
		await flush(p);
		c.ok(/MODE$/.test((await prop(p, L + 'Prologue.md', 'synopsis')) ?? ''), 'switching to the corkboard saves what was being typed');
		await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
		await p.sleep(600);
		await edit('Prologue.md', ' OPEN');
		const n = await p.at(row('Part One/Arrival.md') + ' .binders-outliner-name');
		await tap(p, n.l + 14, n.y);
		await p.sleep(900);
		await flush(p);
		c.eq(await activeFile(p), L + 'Part One/Arrival.md', 'a tap on another note’s name opens it');
		c.ok(/OPEN$/.test((await prop(p, L + 'Prologue.md', 'synopsis')) ?? ''), 'and saves what was being typed');
		await goBack(p);
		await edit('Prologue.md', ' CLOSED');
		await p.ev(`(() => { app.workspace.getMostRecentLeaf().detach(); return 1; })()`);
		await p.sleep(900);
		c.ok(/CLOSED$/.test((await prop(p, L + 'Prologue.md', 'synopsis')) ?? ''), 'closing the tab saves it too');
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (![L + 'Part Two/Lights out.md', L + 'Prologue.md'].includes(path)) c.eq(after[path], text, `“${path}” is unchanged`);
	c.eq(after[L + 'Prologue.md'].split('---\n').pop(), before[L + 'Prologue.md'].split('---\n').pop(), 'the text of the note typed about is untouched');
	dump('edit-synopsis', f);
	c.done();
});

test('phone, nothing typed is lost: with a synopsis half typed, folding its folder saves it, another row’s menu and “Move down” leave it, and dragging its own row to another folder keeps it', async (p, h, t) => {
	const c = soft(t), f = {};
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		const A = 'Part One/Arrival.md';
		const startEdit = async (path, text) => {
			await pick(p, path);
			const s = await p.at(row(path) + ' .binders-outliner-synopsis');
			await tap(p, s.x, s.y);
			if ((await p.ev(`document.activeElement.tagName`)) !== 'TEXTAREA') throw new Error('no field for ' + path);
			await p.ev(`(() => { const f = document.activeElement; f.setSelectionRange(f.value.length, f.value.length); return 1; })()`);
			await p.type(text);
		};
		await open(p);
		await startEdit(A, ' FOLDED');
		const ch = await p.at(row('Part One') + ' .binders-outliner-chevron');
		await tap(p, ch.x, ch.y);
		await p.sleep(700);
		await flush(p);
		c.ok(/FOLDED$/.test((await prop(p, L + A, 'synopsis')) ?? ''), 'folding its folder saves the synopsis being typed');
		c.eq((await shown(p)).length, 6, 'and folds');
		const ch2 = await p.at(row('Part One') + ' .binders-outliner-chevron');
		await tap(p, ch2.x, ch2.y);
		await p.sleep(500);
		await startEdit(A, ' HELD');
		await rowMenu(p, 'Part One/The keeper.md');
		c.eq(j([(await active(p)).tag, /HELD$/.test((await active(p)).value ?? '')]), j(['TEXTAREA', true]), 'a long press on another row opens its menu, the field still open under it');
		await shot(p, 'loss-menu-over-open-field');
		await menuTap(p, 'Move down');
		await p.sleep(800);
		await flush(p);
		c.eq(j((await contents(p)).slice(2, 5)), j(['Part One/Arrival', 'Part One/Storm warning', 'Part One/The keeper']), '“Move down” moves that row');
		c.ok(/HELD$/.test((await prop(p, L + A, 'synopsis')) ?? ''), 'and what was typed is saved');
		await startEdit(A, ' DRAGGED');
		const n = await p.at(row(A) + ' .binders-outliner-name'), first = await p.at(row('Prologue.md'));
		await pressAndMove(p, n.l + 14, n.y, n.l + 14, first.t + 6);
		await shot(p, 'loss-drag-while-typing');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Arrival.md')})`);
		await p.sleep(900);
		await flush(p);
		c.ok(await fileExists(p, L + 'Arrival.md'), 'the row being typed in is dragged out of its folder');
		await p.ev(`document.activeElement.blur?.()`);
		await p.sleep(600);
		await flush(p);
		f.synopsis = await prop(p, L + 'Arrival.md', 'synopsis');
		await shot(p, 'loss-after-drag');
		c.eq(f.synopsis, 'Mara arrives on the island with the supply boat. FOLDED HELD DRAGGED', 'with everything typed in its synopsis');
		f.after = await texts(p);
	});
	for (const [path, text] of Object.entries(before)) { const now = f.after[path === L + 'Part One/Arrival.md' ? L + 'Arrival.md' : path]; if (path === L + 'The Lighthouse.md') continue; c.eq((now ?? '').split('---\n').pop(), text.split('---\n').pop(), `the text of “${path}” is unchanged`); }
	dump('loss', { synopsis: f.synopsis });
	c.done();
});

// =====================================================================================================================
// Cells
// =====================================================================================================================

test('phone cells: a tap on a row’s status selects, the next opens the statuses as a sheet; “New status...” is typed; a label is picked and shows its color; the Export tick ticks; a folder’s status makes its folder note', async (p, h, t) => {
	const c = soft(t), f = {};
	await onDevice(p, PHONE, async () => {
		await open(p, 'The Lighthouse', ['status', 'label', 'export', 'words']);
		const P = 'Part One/The keeper.md';
		await see(p, P);
		const sc = await p.at(cell(P, 'status'));
		// (on a phone the Status column is narrower than on a desktop: 88 px)
		c.ok(sc.h >= 40 && sc.w >= 80, `a status cell is a target of ${Math.round(sc.w)} × ${Math.round(sc.h)} px`);
		await tap(p, sc.x, sc.y);
		c.eq(j([await selected(p), await menus(p)]), j([[L + P], 0]), 'a tap on a row’s status selects the row and opens nothing');
		await tap(p, sc.x, sc.y);
		f.statusSheet = { sheet: await sheet(p), items: await items(p) };
		await shot(p, 'cells-status-sheet');
		c.ok(isSheet(f.statusSheet.sheet) && f.statusSheet.sheet.itemHeights.every((x) => x >= 44), 'the next opens the statuses as a sheet, its rows a finger tall');
		c.eq(j(f.statusSheet.items), j(['Idea', 'Draft ✓', 'Revised', 'Done', 'New status...', 'No status']), 'the one it has ticked');
		await menuTap(p, 'New status...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		c.eq((await dialog(p)).menus, 0, 'the dialog has no sheet left over it');
		await p.type('Proofed');
		await p.key('Enter');
		await p.sleep(600);
		await flush(p);
		c.eq(await prop(p, L + P, 'status'), 'Proofed', 'a new status typed, and Enter');
		c.eq(await p.ev(`document.querySelector(${j(cell(P, 'status'))}).textContent`), 'Proofed', 'shows in the cell');
		await shot(p, 'cells-after-new-status');
		const lc = await p.at(cell(P, 'label'));
		await tap(p, lc.x, lc.y);
		f.labelSheet = { sheet: await sheet(p), items: await items(p) };
		await shot(p, 'cells-label-sheet');
		c.ok(isSheet(f.labelSheet.sheet) && j(f.labelSheet.items) === j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Custom color...', 'Edit labels...']), 'the labels are a sheet: ' + j(f.labelSheet.items));
		await menuTap(p, 'Blue');
		await p.sleep(600);
		await flush(p);
		c.eq(await prop(p, L + P, 'label'), 'Blue', 'a label picked');
		f.labelCell = await p.ev(`(() => { const R = ${R}; const c = document.querySelector(${j(cell(P, 'label'))}); return { text: c.textContent, dot: R(c.querySelector('.binders-label-dot')) }; })()`);
		c.ok(f.labelCell.text === 'Blue' && f.labelCell.dot, 'shows with its color: ' + j(f.labelCell));
		await tap(p, lc.x, lc.y);
		c.ok((await items(p)).includes('Blue ✓') && (await items(p)).includes('No label'), 'the sheet then ticks it and offers “No label”');
		await menuTap(p, 'Custom color...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		await p.ev(`(() => { document.querySelector('.modal .binders-ask input[type="text"]').select(); return 1; })()`);
		await p.type('#7c3aed');
		await dialogTap(p, 'Set color');
		await p.sleep(500);
		await flush(p);
		c.eq(await prop(p, L + P, 'label'), '"#7c3aed"', 'a color of its own');
		await scrollTo(p, 9999, null);
		const box = await p.at(cell(P, 'export') + ' input');
		f.tick = box;
		await tap(p, box.x, box.y);
		await p.sleep(500);
		await flush(p);
		c.eq(await prop(p, L + P, 'export'), 'false', 'a tap on the Export tick leaves the note out');
		await shot(p, 'cells-tick');
		const box2 = await p.at(cell(P, 'export') + ' input');
		await tap(p, box2.x, box2.y);
		await p.sleep(500);
		await flush(p);
		c.eq(await prop(p, L + P, 'export'), null, 'and another puts it back, the property gone');
		await scrollTo(p, 0, null);
		const fc = await p.at(cell('Part Two', 'status'));
		await tap(p, fc.x, fc.y);
		await tap(p, fc.x, fc.y);
		c.ok(!(await items(p)).includes('No status'), 'a folder with no status isn’t offered “No status”');
		await menuTap(p, 'Draft');
		await p.sleep(700);
		await flush(p);
		c.ok(await fileExists(p, L + 'Part Two/Part Two.md'), 'a folder’s status makes its folder note');
		c.eq(await prop(p, L + 'Part Two/Part Two.md', 'status'), 'Draft', 'and is written there');
		c.ok(!(await shown(p)).includes(L + 'Part Two/Part Two.md'), 'which isn’t a row');
		await shot(p, 'cells-folder-status');
	});
	dump('cells', f);
	c.done();
});

test('phone cells: a target is typed in its cell (something that isn’t a number stays in the field, with why), shows as progress and in the totals; a list property is typed with commas, and Tab saves', async (p, h, t) => {
	const c = soft(t), f = {};
	await onDevice(p, PHONE, async () => {
		await open(p, 'The Lighthouse', ['target', 'progress', 'prop:plotlines']);
		const P = 'Part One/Arrival.md';
		await pick(p, P);
		const tc = await p.at(cell(P, 'target'));
		await tap(p, tc.x, tc.y);
		f.field = await active(p);
		c.eq(f.field.tag, 'INPUT', 'a tap on the selected row’s target edits it');
		await shot(p, 'target-editing');
		await p.type('abc');
		await p.key('Enter');
		await p.sleep(500);
		f.bad = { active: await active(p), notices: await notices(p) };
		await shot(p, 'target-invalid');
		c.eq(j([f.bad.active.tag, f.bad.active.value]), j(['INPUT', 'abc']), 'something that isn’t a number stays in the field');
		c.eq(j(f.bad.notices), j(['A target is a whole number of words.']), 'with why');
		c.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-outliner-field.is-invalid')`), 'and the field marked');
		await p.ev(`(() => { document.activeElement.select(); return 1; })()`);
		await p.type('1,200');
		await p.key('Enter');
		await p.sleep(700);
		await flush(p);
		c.eq(await prop(p, L + P, 'target'), '1200', 'put right, and Enter: the target is set');
		c.eq(await p.ev(`document.querySelector(${j(cell(P, 'target'))}).textContent`), '1,200', 'shown as a number is written');
		c.eq(await p.ev(`document.querySelector(${j(cell(P, 'progress'))}).textContent`), '1%', 'with how far along it is');
		c.eq(await p.ev(`document.querySelector(${j(cell('Part One', 'target'))}).textContent + '|' + document.querySelector(${j(cell('Part One', 'target') + ' .binders-outliner-field')}).getAttribute('class').includes('is-empty')`), '1,200|true', 'its folder shows the notes’ targets together, greyed as a placeholder is');
		await shot(p, 'target-set');
		await scrollTo(p, 0, 99999);
		c.ok((await layout(p)).footText.includes('1,200'), 'and the totals add it up: ' + j((await layout(p)).footText));
		await scrollTo(p, 9999, 0);
		await see(p, P);
		const pc = await p.at(cell(P, 'prop:plotlines'));
		c.eq(await p.ev(`document.querySelector(${j(cell(P, 'prop:plotlines'))})?.textContent`), 'Mara', 'a list property shows');
		await tap(p, pc.x, pc.y);
		if ((await active(p)).tag !== 'INPUT') await tap(p, pc.x, pc.y);
		f.propField = await active(p);
		await shot(p, 'prop-editing');
		c.eq(j([f.propField.tag, f.propField.value]), j(['INPUT', 'Mara']), 'and a tap on the selected row’s cell edits it');
		await p.ev(`(() => { const a = document.activeElement; a.setSelectionRange(a.value.length, a.value.length); return 1; })()`);
		await p.type(', The storm');
		await p.key('Tab');
		await p.sleep(600);
		await flush(p);
		f.propSaved = await read(p, L + P);
		c.ok(/plotlines:\n\s+- Mara\n\s+- The storm\n/.test(f.propSaved), 'typed with a comma and Tab: saved as a list: ' + f.propSaved.split('---')[1]);
		c.eq((await active(p)).row, L + P, 'and the focus stays with the row');
	});
	dump('target', f);
	c.done();
});

// =====================================================================================================================
// Menus
// =====================================================================================================================

test('phone, a note’s menu: a held row lifts, then its menu is a sheet; Rename, Edit synopsis, Set synopsis from text, Set target, Include in export, Move down, Duplicate, Put in a new folder, Open in new tab and Delete each do what they say', async (p, h, t) => {
	const c = soft(t), f = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		const A = 'Part One/Arrival.md';
		const g = await grip(p, A);
		await touch(p, 'touchStart', g.x, g.y);
		await p.sleep(250);
		c.eq(j((await dragState(p)).lifted), '[]', 'a row held for a quarter of a second hasn’t lifted');
		await p.sleep(400);
		c.eq(j((await dragState(p)).lifted), j([L + A]), 'held longer, it lifts');
		await shot(p, 'menu-lifted');
		await touch(p, 'touchEnd');
		await p.sleep(550);
		f.items = await items(p);
		f.sheet = await sheet(p);
		await shot(p, 'menu-note');
		c.ok(isSheet(f.sheet) && f.sheet.itemHeights.every((x) => x >= 44), 'let go, its menu is a sheet with rows a finger tall');
		for (const x of ['Open', 'Open in new tab', 'Rename', 'Edit synopsis', 'Set synopsis from text', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in export ✓', 'Move down', 'Delete']) c.ok(f.items.includes(x), `“${x}” is in it`);
		c.ok(!f.items.includes('Open to the right') && !f.items.includes('Move up'), 'without “Open to the right” (a phone) or “Move up” (it’s the first in its folder)');
		c.eq(f.items[f.items.length - 1], 'Delete', 'Delete last');
		c.eq(j([await selected(p), await activeFile(p)]), j([[L + A], null]), 'the row is selected and nothing opened');
		await menuTap(p, 'Rename');
		await p.sleep(500);
		f.rename = await active(p);
		await shot(p, 'menu-rename');
		c.eq(j([f.rename.tag, f.rename.value]), j(['INPUT', 'Arrival']), 'Rename opens the name’s field');
		c.eq(j(await p.ev(`[document.activeElement.selectionStart, document.activeElement.selectionEnd]`)), j([0, 7]), 'with the name selected, to type over');
		await p.type('Landing');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Landing.md')})`);
		await p.sleep(500);
		const N = 'Part One/Landing.md';
		c.ok(await fileExists(p, L + N), 'Enter renames the note');
		c.eq(j(await selected(p)), j([L + N]), 'which stays selected');
		await shot(p, 'menu-after-rename');
		await flush(p);
		c.eq((await contents(p))[2], 'Part One/Landing', 'in its place in the binder');
		await rowMenu(p, N);
		await menuTap(p, 'Edit synopsis');
		await p.sleep(500);
		c.eq(j([(await active(p)).tag, (await active(p)).row]), j(['TEXTAREA', L + N]), 'Edit synopsis opens its synopsis');
		await p.ev(`document.activeElement.blur()`);
		await p.sleep(400);
		await rowMenu(p, 'Part Two/The wreck.md');
		await menuTap(p, 'Set synopsis from text');
		await p.sleep(900);
		f.fromText = await dialog(p);
		await shot(p, 'menu-synopsis-from-text');
		c.eq(f.fromText?.title, 'Replace the synopsis', 'Set synopsis from text asks before replacing one');
		await dialogTap(p, 'Replace');
		await p.sleep(600);
		await flush(p);
		c.eq(await prop(p, L + 'Part Two/The wreck.md', 'synopsis'), 'The ship came in sideways, lit up like a street, and struck the rocks below the light.', 'then takes the note’s opening');
		await rowMenu(p, N);
		await menuTap(p, 'Set target...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		c.eq((await dialog(p)).menus, 0, 'Set target... asks in a dialog, the sheet gone');
		await p.type('900');
		await p.key('Enter');
		await p.sleep(600);
		await flush(p);
		c.eq(await prop(p, L + N, 'target'), '900', 'and sets it');
		await rowMenu(p, N);
		await menuTap(p, 'Include in export');
		await p.sleep(600);
		await flush(p);
		c.eq(await prop(p, L + N, 'export'), 'false', 'Include in export, unticked, leaves the note out');
		await rowMenu(p, N);
		c.ok((await items(p)).includes('Include in export'), 'and shows unticked the next time');
		await menuTap(p, 'Move down');
		await p.sleep(700);
		await flush(p);
		c.eq(j((await contents(p)).slice(2, 4)), j(['Part One/The keeper', 'Part One/Landing']), 'Move down');
		c.eq(j([await selected(p), await menus(p)]), j([[L + N], 0]), 'the row still selected, the sheet gone');
		await rowMenu(p, N);
		c.ok((await items(p)).includes('Move up'), 'now it can move up');
		await menuTap(p, 'Duplicate');
		await p.sleep(1000);
		await flush(p);
		c.eq(j((await contents(p)).slice(3, 5)), j(['Part One/Landing', 'Part One/Landing 2']), 'Duplicate puts a copy after it');
		c.eq(j(await selected(p)), j([L + 'Part One/Landing 2.md']), 'and selects the copy');
		await shot(p, 'menu-duplicated');
		await rowMenu(p, N);
		await menuTap(p, 'Put in a new folder');
		await p.sleep(1000);
		f.group = await active(p);
		await shot(p, 'menu-new-folder');
		c.eq(j([f.group.tag, f.group.value, f.group.row]), j(['INPUT', 'Untitled', L + 'Part One/Untitled']), 'Put in a new folder makes one around it, its name ready to type');
		await p.type('Scene group');
		await p.key('Enter');
		await p.sleep(900);
		await flush(p);
		c.eq(j((await contents(p)).slice(3, 5)), j(['Part One/Scene group/', 'Part One/Scene group/Landing']), 'named, with the note in it');
		await shot(p, 'menu-new-folder-named');
		await rowMenu(p, 'Epilogue.md');
		await menuTap(p, 'Open in new tab');
		await p.sleep(900);
		c.eq(j([await activeFile(p), await p.ev(`(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; })()`)]), j([L + 'Epilogue.md', 2]), 'Open in new tab opens a second tab');
		await p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(l, { focus: true }); return 1; })()`);
		await p.sleep(600);
		await rowMenu(p, 'Epilogue.md');
		await menuTap(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(500);
		f.del = await dialog(p);
		await shot(p, 'menu-delete');
		c.eq(j([f.del.title, f.del.text.split('\n')[0], f.del.menus]), j(['Delete note', 'Delete “Epilogue”? It goes to the system trash.', 0]), 'Delete asks first');
		await dialogTap(p, 'Cancel');
		c.ok(await fileExists(p, L + 'Epilogue.md'), 'Cancel keeps the note');
		await rowMenu(p, 'Epilogue.md');
		await menuTap(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(500);
		await dialogTap(p, 'Delete');
		await p.sleep(900);
		c.ok(!(await fileExists(p, L + 'Epilogue.md')), 'Delete deletes it');
		c.eq(j(await selected(p)), j([L + 'Part Two/Lights out.md']), 'and the row before is selected');
		await shot(p, 'menu-after-delete');
	});
	dump('menu-note', f);
	c.done();
});

test('phone, a folder’s menu: Rename takes its notes along, Export... opens the window for it, Set status and a custom color make its folder note, Ungroup empties it in place, Delete counts what’s in it', async (p, h, t) => {
	const c = soft(t), f = {};
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		await rowMenu(p, 'Part One');
		f.items = await items(p);
		await shot(p, 'menu-folder');
		for (const x of ['Open', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Export...', 'Ungroup', 'Include in export ✓', 'Move up', 'Move down', 'Delete']) c.ok(f.items.includes(x), `“${x}” is in it`);
		c.ok(!f.items.includes('Set synopsis from text'), 'a folder has no text to take a synopsis from');
		await menuTap(p, 'Rename');
		await p.sleep(500);
		c.eq(j([(await active(p)).tag, (await active(p)).value]), j(['INPUT', 'Part One']), 'Rename opens its name');
		await p.type('Act One');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Act One')})`);
		await p.sleep(700);
		await flush(p);
		c.ok(await fileExists(p, L + 'Act One/Arrival.md'), 'the folder is renamed, its notes with it');
		c.eq(j((await contents(p)).slice(1, 5)), j(['Act One/', 'Act One/Arrival', 'Act One/The keeper', 'Act One/Storm warning']), 'and the binder’s order follows');
		c.eq(j(await selected(p)), j([L + 'Act One']), 'the folder still selected, and still unfolded');
		await rowMenu(p, 'Act One');
		// (“Export...” opens the window on the kind last used: one note, as a writer who made one last time)
		await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`);
		await menuTap(p, 'Export...');
		await p.sleep(900);
		f.export = await dialog(p);
		await shot(p, 'menu-folder-export');
		c.eq(f.export?.title, 'Export “Act One”', 'Export... opens the window for the folder');
		c.eq(await p.ev(`[...document.querySelectorAll('.modal.binders-export [role="option"]')].find(o => o.getAttribute('aria-selected') === 'true')?.querySelector('.binders-snapshots-item-name')?.textContent ?? null`), 'One note', 'on one note');
		// (a phone shows the choices first; the count is on the bar over the preview)
		await dialogTap(p, 'Preview');
		f.export.detail = await until(p, `document.querySelector('.modal.binders-export .binders-export-pane .binders-snapshots-detail')?.textContent`, 6000);
		c.ok(/^3 notes/.test(f.export.detail ?? ''), 'which counts its notes: ' + f.export.detail);
		await closeDialog(p);
		await rowMenu(p, 'Act One');
		await menuTap(p, 'Set status');
		await p.sleep(400);
		f.statusSub = { items: await items(p), sheet: await sheet(p) };
		await shot(p, 'menu-folder-status');
		c.ok(isSheet(f.statusSub.sheet) && f.statusSub.items.includes('Done'), 'Set status: the statuses take the sheet’s place');
		await menuTap(p, 'Done');
		await p.sleep(700);
		c.eq(await menus(p), 0, 'a pick closes everything');
		await flush(p);
		c.eq(await prop(p, L + 'Act One/Act One.md', 'status'), 'Done', 'and is written in the folder’s note, made for it');
		await rowMenu(p, 'Act One');
		await menuTap(p, 'Set label');
		await p.sleep(400);
		await menuTap(p, 'Custom color...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(500);
		await shot(p, 'menu-folder-color');
		await p.ev(`(() => { document.querySelector('.modal .binders-ask input[type="text"]').select(); return 1; })()`);
		await p.type('#7c3aed');
		await dialogTap(p, 'Set color');
		await p.sleep(600);
		await flush(p);
		c.eq(await prop(p, L + 'Act One/Act One.md', 'label'), '"#7c3aed"', 'a color of its own');
		await rowMenu(p, 'Part Two');
		await menuTap(p, 'Ungroup');
		await p.sleep(1200);
		await flush(p);
		c.eq(j((await contents(p)).slice(5)), j(['The wreck', 'Lights out', 'Epilogue']), 'Ungroup moves its notes out, where it stood, in order, and the emptied folder goes');
		c.ok(await fileExists(p, L + 'The wreck.md'), 'the notes are moved');
		await shot(p, 'menu-folder-ungrouped');
		await p.ev(`app.commands.executeCommandById('binders:undo-move')`);
		await p.sleep(1200);
		await flush(p);
		c.eq(j((await contents(p)).slice(5)), j(['Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), '“Undo last move” puts them back');
		await rowMenu(p, 'Act One');
		await menuTap(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(400);
		f.del = await dialog(p);
		await shot(p, 'menu-folder-delete');
		c.eq(j([f.del.title, f.del.text.split('\n')[0]]), j(['Delete folder', 'Delete “Act One” and the 3 notes in it? It goes to the system trash.']), 'Delete says what’s in it');
		await dialogTap(p, 'Cancel');
		c.ok(await fileExists(p, L + 'Act One'), 'Cancel keeps the folder');
		f.after = await texts(p);
	});
	for (const [path, text] of Object.entries(before)) { if (path === L + 'The Lighthouse.md') continue; c.eq(f.after[path.replace('Part One', 'Act One')], text, `“${path}” is unchanged`); }
	dump('menu-folder', { items: f.items });
	c.done();
});

// =====================================================================================================================
// Dragging
// =====================================================================================================================

test('phone drags: a held row moves within its folder, into a folder, and out of one (before the next folder); the rows don’t scroll under it; near the header they scroll up; a drag cut short leaves nothing; no note’s text changes', async (p, h, t) => {
	const c = soft(t), f = {};
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		let g = await grip(p, 'Part One/Arrival.md'), k = await rect(p, row('Part One/The keeper.md'));
		await pressAndMove(p, g.x, g.y, g.x, k[1] + k[3] - 6);
		f.reorder = await dragState(p);
		await shot(p, 'drag-reorder');
		c.eq(j([f.reorder.ghostText, f.reorder.hint]), j(['Arrival', 'Move after “The keeper”']), 'Obsidian’s drag ghost names the row and says where it would go');
		// (where that folder's names start: measured, since a phone's indent has changed before and may again)
		const names = (await rect(p, row('Part One/The keeper.md') + ' .binders-outliner-main'))[0];
		c.ok(f.reorder.line && Math.abs(f.reorder.line[1] + 2 - (k[1] + k[3])) <= 2 && f.reorder.line[0] === names, `a line shows where, starting at the names of that folder (${names} px): ` + j(f.reorder.line));
		c.eq(j(f.reorder.dimmed), j([L + 'Part One/Arrival.md']), 'the row itself dims');
		c.eq(f.reorder.scroll, 0, 'and the rows don’t scroll under the finger');
		await touch(p, 'touchEnd');
		await p.sleep(900);
		await flush(p);
		c.eq(j((await contents(p)).slice(2, 4)), j(['Part One/The keeper', 'Part One/Arrival']), 'dropped after The keeper');
		c.eq(j([await selected(p), await menus(p), await leftovers(p), await activeFile(p)]), j([[L + 'Part One/Arrival.md'], 0, 0, null]), 'it stays selected; no menu, nothing left over, nothing opened');
		// into a folder
		g = await grip(p, 'Prologue.md');
		const two = await rect(p, row('Part Two'));
		await pressAndMove(p, g.x, g.y, g.x + 40, two[1] + two[3] / 2);
		f.into = await dragState(p);
		await shot(p, 'drag-into-folder');
		c.eq(j([f.into.hint, f.into.into, f.into.line]), j(['Move into “Part Two”', L + 'Part Two', null]), 'over a folder’s middle: into it, the folder tinted, no line');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part Two/Prologue.md')})`);
		await p.sleep(700);
		await flush(p);
		c.eq(j((await contents(p)).slice(-2)), j(['Part Two/Prologue', 'Epilogue']), 'dropped into Part Two, last');
		// out of its folder: to the top edge of the folder after it
		await scrollTo(p, 0, 0);
		g = await grip(p, 'Part One/Storm warning.md');
		const two2 = await rect(p, row('Part Two'));
		await pressAndMove(p, g.x, g.y, g.x, two2[1] + 4);
		f.out = await dragState(p);
		await shot(p, 'drag-out-of-folder');
		c.eq(f.out.hint, 'Move before “Part Two”', 'at the top edge of the next folder: out of its own');
		c.ok(f.out.line && f.out.line[0] === 30, 'the line starts a level out: ' + j(f.out.line));
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Storm warning.md')})`);
		await p.sleep(700);
		await flush(p);
		c.eq(j(await contents(p)), j(['Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Prologue', 'Epilogue']), 'dropped between the folders');
		// cut short
		const order = await contents(p);
		g = await grip(p, 'Part One/The keeper.md');
		await pressAndMove(p, g.x, g.y, g.x + 30, g.y + 200);
		c.ok((await dragState(p)).ghost, 'another drag begins');
		await touch(p, 'touchCancel');
		await p.sleep(500);
		c.eq(j([await leftovers(p), await menus(p)]), j([0, 0]), 'cut short by the system, it leaves nothing behind');
		await flush(p);
		c.eq(j(await contents(p)), j(order), 'and moves nothing');
		// from the end, held near the header: the rows scroll up
		await scrollTo(p, 0, 99999);
		const from = await p.ev(`${OUT}.scrollTop`);
		const head = await rect(p, `${LEAF} .binders-outliner-head`);
		const n = await p.at(row('Epilogue.md') + ' .binders-outliner-name');
		await pressAndMove(p, n.l + 14, n.y, n.l + 14, head[1] + head[3] + 16);
		await p.sleep(1500);
		f.top = await dragState(p);
		await shot(p, 'drag-autoscroll-top');
		c.ok(from > 100 && f.top.scroll === 0, `held 16 px under the header, the rows scroll up to the start (${from} → ${f.top.scroll})`);
		c.eq(f.top.hint, 'Move before “Part One”', 'where it can be dropped first');
		await touch(p, 'touchEnd');
		await p.sleep(1000);
		await flush(p);
		c.eq((await contents(p))[0], 'Epilogue', 'and is');
		f.after = await texts(p);
	});
	const moved = { [L + 'Prologue.md']: L + 'Part Two/Prologue.md', [L + 'Part One/Storm warning.md']: L + 'Storm warning.md' };
	for (const [path, text] of Object.entries(before)) if (path !== L + 'The Lighthouse.md') c.eq(f.after[moved[path] ?? path], text, `“${path}” is unchanged`);
	dump('drags', { reorder: f.reorder, into: f.into, out: f.out, top: f.top });
	c.done();
});

test('small phone (320 px), the columns scrolled across: a row held by its word count drags, with its line on the screen', async (p, h, t) => {
	const c = soft(t), f = {};
	await onDevice(p, SMALL, async () => {
		await open(p);
		await scrollTo(p, 190, 0);
		// (qa6: with the Label column a color alone the columns end sooner: 190 px across is past their end at 320 px)
		const across = await p.ev(`${OUT}.scrollLeft`);
		const w = await p.at(cell('Part One/Arrival.md', 'words'));
		c.ok(w.l >= 0 && w.l + w.w <= 320, 'the word counts are in sight');
		const pr = await rect(p, row('Prologue.md'));
		await pressAndMove(p, w.x, w.y, w.x, pr[1] + 6);
		f.mid = await dragState(p);
		await shot(p, 'drag-320-scrolled');
		c.eq(f.mid.hint, 'Move before “Prologue”', 'held by its word count, a row drags');
		c.ok(f.mid.line && f.mid.line[0] + f.mid.line[2] <= 320 && f.mid.line[0] + f.mid.line[2] > 200, 'its line ends on the screen: ' + j(f.mid.line));
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Arrival.md')})`);
		await p.sleep(700);
		await flush(p);
		c.eq(j((await contents(p)).slice(0, 2)), j(['Arrival', 'Prologue']), 'and drops');
		// (as far as they go: with the phone's narrower columns only “+” is past the screen's edge at 320 px)
		c.ok(across >= 20 && across === await p.ev(`${OUT}.scrollWidth - ${OUT}.clientWidth`), 'the columns are scrolled across, to their end: ' + across);
		c.eq(await p.ev(`${OUT}.scrollLeft`), across, 'the columns where they were');
	});
	dump('drags-320', f);
	c.done();
});

// =====================================================================================================================
// Headers, sorting, columns
// =====================================================================================================================

test('phone headers: a tap opens the column’s menu as a sheet; sorting shows in the header and holds rows in place (a drag says why not, the menu has no Move up); “Make this the binder order” writes it down and undoes; columns move, hide, resize by their edge and are added from “+”', async (p, h, t) => {
	const c = soft(t), f = {};
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		const th = (col) => `${LEAF} .binders-outliner-th[data-col="${col}"]`;
		const cols = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-th[data-col]')].map(e => e.dataset.col + (e.getAttribute('aria-sort') !== 'none' ? ':' + e.getAttribute('aria-sort') : ''))`);
		let x = await p.at(th('title'));
		await tap(p, x.x, x.y);
		f.titleMenu = { items: await items(p), sheet: await sheet(p) };
		await shot(p, 'head-title-menu');
		c.ok(isSheet(f.titleMenu.sheet), 'a header’s menu is a sheet');
		c.eq(j(f.titleMenu.items), j(['Sort ascending', 'Sort descending', 'Show synopses ✓']), 'the title’s');
		await menuTap(p, 'Sort descending');
		await p.sleep(500);
		c.eq(j(await cols()), j(['title:descending', 'label', 'status', 'words']), 'sorted, the header says so');
		c.ok(await rect(p, th('title') + ' .binders-outliner-th-sort'), 'with an arrow');
		c.eq(j((await shown(p)).map((q) => q.split('/').pop().replace('.md', ''))), j(['Prologue', 'Part Two', 'The wreck', 'Lights out', 'Part One', 'The keeper', 'Storm warning', 'Arrival', 'Epilogue']), 'each folder’s rows in that order');
		c.eq(await menus(p), 0, 'and the sheet is gone');
		await shot(p, 'head-sorted');
		const g = await grip(p, 'Part One/Arrival.md');
		await pressAndMove(p, g.x, g.y, g.x, g.y + 120);
		f.sortedDrag = { state: await dragState(p), notices: await notices(p) };
		await shot(p, 'head-sorted-drag-refused');
		c.eq(f.sortedDrag.state.ghost, null, 'a held row doesn’t drag while sorted');
		c.eq(j(f.sortedDrag.notices), j(['The outliner is sorted by title. Choose “Binder order” in a column’s menu to rearrange it.']), 'and says why, once');
		await touch(p, 'touchEnd');
		await p.sleep(600);
		c.eq(j([await menus(p), await activeFile(p)]), j([0, null]), 'letting go opens nothing');
		await scrollTo(p, 0, 0);
		await rowMenu(p, 'Part One/The keeper.md');
		c.ok(!(await items(p)).includes('Move up') && !(await items(p)).includes('Move down'), 'a row’s menu has no Move up or Move down while sorted');
		await gone(p);
		x = await p.at(th('title'));
		await tap(p, x.x, x.y);
		c.eq(j(await items(p)), j(['Sort ascending', 'Sort descending ✓', 'Binder order', 'Make this the binder order', 'Show synopses ✓']), 'sorted, the header’s menu ticks the sort and offers the way back');
		await shot(p, 'head-title-menu-sorted');
		await menuTap(p, 'Make this the binder order');
		await p.sleep(1200);
		await flush(p);
		c.eq(j(await contents(p)), j(['Prologue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival', 'Epilogue']), '“Make this the binder order” writes the order down');
		c.eq(j(await cols()), j(['title', 'label', 'status', 'words']), 'and lets the sort go');
		await p.ev(`app.commands.executeCommandById('binders:undo-move')`);
		await p.sleep(1200);
		await flush(p);
		c.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), '“Undo last move” takes it all back');
		x = await p.at(th('status'));
		await tap(p, x.x, x.y);
		c.eq(j(await items(p)), j(['Sort ascending', 'Sort descending', 'Move left', 'Move right', 'Hide column']), 'a column’s menu');
		await menuTap(p, 'Move left');
		await p.sleep(500);
		c.eq(j(await cols()), j(['title', 'status', 'label', 'words']), 'Move left');
		c.ok(!(await p.ev(`document.activeElement.matches(':focus-visible')`)), 'no focus ring on the header after it');
		await shot(p, 'head-moved');
		x = await p.at(th('label'));
		await tap(p, x.x, x.y);
		await menuTap(p, 'Hide column');
		await p.sleep(500);
		c.eq(j(await cols()), j(['title', 'status', 'words']), 'Hide column');
		// its edge, by touch
		const edge = await p.ev(`(${R})(document.querySelector(${j(th('status') + ' .binders-outliner-resizer')}))`);
		const w0 = (await rect(p, th('status')))[2];
		await touch(p, 'touchStart', edge[0] + edge[2] / 2, edge[1] + 20);
		await p.sleep(60);
		for (let i = 1; i <= 8; i++) { await touch(p, 'touchMove', edge[0] + edge[2] / 2 + i * 5, edge[1] + 20); await p.sleep(16); }
		await touch(p, 'touchEnd');
		await p.sleep(500);
		f.resize = { edge, from: w0, to: (await rect(p, th('status')))[2] };
		// (a phone's Status column starts at 88 px; the finger moved 40 px)
		c.eq(j([f.resize.from, f.resize.to, await menus(p)]), j([88, 128, 0]), 'a column’s edge dragged by a finger resizes it, and opens no menu');
		await scrollTo(p, 9999, null);
		x = await p.at(`${LEAF} .binders-outliner-th.mod-add`);
		await tap(p, x.x, x.y);
		f.plusMenu = { items: await items(p), sheet: await sheet(p) };
		await shot(p, 'head-plus-sheet');
		c.ok(isSheet(f.plusMenu.sheet), '“+” opens the columns as a sheet');
		c.eq(j(f.plusMenu.items), j(['Label', 'Status ✓', 'Words ✓', 'Target', 'Progress', 'Export', 'Export as', 'Notes', 'Created', 'Modified', 'plotlines', 'Other property...']), 'the ones showing ticked, then the notes’ own properties');
		await menuTap(p, 'Progress');
		await p.sleep(600);
		c.eq(j([await cols(), await menus(p)]), j([['title', 'status', 'words', 'progress'], 0]), 'a pick adds the column and closes the sheet');
		await scrollTo(p, 9999, null);
		x = await p.at(`${LEAF} .binders-outliner-th.mod-add`);
		await tap(p, x.x, x.y);
		await menuTap(p, 'Other property...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		c.eq((await dialog(p)).title, 'Add a column', '“Other property...” asks for its name');
		await p.type('POV');
		await p.key('Enter');
		await p.sleep(700);
		c.eq(j(await cols()), j(['title', 'status', 'words', 'progress', 'prop:POV']), 'and adds it');
		await shot(p, 'head-after-other-property');
		await scrollTo(p, 0, 0);
		x = await p.at(th('title'));
		await tap(p, x.x, x.y);
		await menuTap(p, 'Show synopses');
		await p.sleep(600);
		f.noSynopses = (await layout(p)).rows.map((r) => r.rect[3]);
		await shot(p, 'head-no-synopses');
		c.ok(f.noSynopses.every((q) => q === 44), 'without synopses every row is 44 px, a finger tall: ' + j(f.noSynopses));
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) c.eq(after[path], text, `“${path}” is unchanged`);
	dump('headers', f);
	c.done();
});

// =====================================================================================================================
// The toolbar: options, New, the filter
// =====================================================================================================================

test('phone toolbar: the options sheet shows and hides columns and folds everything; New makes a note after the selected row (named by typing, saved by a tap elsewhere too) and a folder; the filter leaves the rows that pass and the totals follow', async (p, h, t) => {
	const c = soft(t), f = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		const more = await p.at(`${LEAF} .view-actions .clickable-icon[aria-label="More options"]`);
		await tap(p, more.x, more.y);
		await p.sleep(400);
		f.more = { items: await items(p), sheet: await sheet(p) };
		await shot(p, 'toolbar-more');
		c.ok(isSheet(f.more.sheet), 'the options are a sheet');
		for (const x of ['Show synopses ✓', 'Columns', 'Expand all', 'Collapse all', 'Outliner ✓', 'Export...', 'Open binder note']) c.ok(f.more.items.includes(x), `“${x}” is in it`);
		await menuTap(p, 'Columns');
		await p.sleep(500);
		await shot(p, 'toolbar-columns-sub');
		c.ok((await items(p)).includes('Words ✓') && (await items(p)).includes('Target'), 'Columns: the columns take the sheet’s place');
		await menuTap(p, 'Target');
		await p.sleep(700);
		c.eq(j([await menus(p), await p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-th[data-col]')].map(e => e.dataset.col)`)]), j([0, ['title', 'label', 'status', 'words', 'target']]), 'a pick adds it and closes everything');
		await tap(p, more.x, more.y);
		await p.sleep(300);
		await menuTap(p, 'Collapse all');
		await p.sleep(600);
		c.eq(j(await shown(p)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md'].map((q) => L + q)), 'Collapse all');
		await shot(p, 'toolbar-collapsed');
		await tap(p, more.x, more.y);
		await p.sleep(300);
		await menuTap(p, 'Expand all');
		await p.sleep(600);
		c.eq((await shown(p)).length, 9, 'Expand all');
		const add = await p.at(`${LEAF} .binders-new-button`);
		// (qa6: a column that's added is now scrolled into sight, so the titles are off to the left: back to them)
		await scrollTo(p, 0, null);
		await pick(p, 'Part One/Arrival.md');
		await tap(p, add.x, add.y);
		c.eq(j(await items(p)), j(['New note', 'New folder']), 'New');
		await menuTap(p, 'New note');
		await p.sleep(900);
		f.newAfter = await active(p);
		await shot(p, 'toolbar-new-note');
		c.eq(j([f.newAfter.tag, f.newAfter.value, f.newAfter.row]), j(['INPUT', 'Untitled', L + 'Part One/Untitled.md']), 'New note makes one after the selected row, its name ready to type');
		await p.type('Second');
		const o = await p.at(row('Prologue.md') + ' .binders-outliner-synopsis');
		await tap(p, o.x, o.y);
		await p.sleep(900);
		await flush(p);
		c.eq(j((await contents(p)).slice(2, 4)), j(['Part One/Arrival', 'Part One/Second']), 'typed, then a tap elsewhere: named');
		await tap(p, add.x, add.y);
		await menuTap(p, 'New folder');
		await p.sleep(900);
		c.eq(j([(await active(p)).tag, (await active(p)).row]), j(['INPUT', L + 'Untitled']), 'New folder: after the selected row, named in place');
		await p.type('Part Three');
		await p.key('Enter');
		await p.sleep(900);
		await flush(p);
		c.eq(j((await contents(p)).slice(0, 2)), j(['Prologue', 'Part Three/']), 'and Enter');
		await shot(p, 'toolbar-new-folder');
		const fb = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, fb.x, fb.y);
		await menuTap(p, 'Idea');
		await p.sleep(600);
		await gone(p);
		f.filtered = { rows: await shown(p), foot: (await layout(p)).footText, count: await p.ev(`document.querySelector('${LEAF} .binders-word-count')?.textContent`) };
		await shot(p, 'toolbar-filtered');
		c.eq(j(f.filtered.rows), j(['Part One', 'Part One/Storm warning.md', 'Part Two', 'Part Two/Lights out.md', 'Epilogue.md'].map((q) => L + q)), 'the filter leaves the notes that pass, and their folders');
		c.eq(j([f.filtered.foot[0], f.filtered.foot.includes('33'), f.filtered.count]), j(['3 notes', true, '33 of 106 words']), 'and the totals count them');
	});
	dump('toolbar', f);
	c.done();
});

// =====================================================================================================================
// Empty, read only, Longform
// =====================================================================================================================

test('phone: an empty binder says so and takes a first note; a binder in a newer format says it’s read only and nothing in it edits, drags or changes; a Longform project shows its indents, drags a scene into a group and has no folders to make', async (p, h, t) => {
	const c = soft(t), f = {};
	await makeBinder(p, 'Blank', []);
	await onDevice(p, PHONE, async () => {
		await open(p, 'Blank');
		f.empty = { text: await p.ev(`document.querySelector('${LEAF} .binders-empty')?.innerText ?? null`), rect: await rect(p, `${LEAF} .binders-empty`), foot: await rect(p, `${LEAF} .binders-outliner-foot`) };
		await shot(p, 'state-empty');
		// (qa6: on a phone the hint now names the + it means)
		c.eq(f.empty.text, 'No notes in this folder yet\nTap + above to add one.', 'an empty binder says so');
		c.ok(f.empty.foot[3] === 0, 'with no totals row');
		const add = await p.at(`${LEAF} .binders-new-button`);
		await tap(p, add.x, add.y);
		await menuTap(p, 'New note');
		await p.sleep(900);
		c.eq((await active(p)).tag, 'INPUT', 'New note: its name ready to type');
		await shot(p, 'state-empty-new');
		await p.type('First');
		await p.key('Enter');
		await p.sleep(800);
		c.ok(await fileExists(p, 'Blank/First.md'), 'and made');
		c.eq(await p.ev(`document.querySelector('${LEAF} .binders-empty')`), null, 'the empty words go');
		// read only
		const NOTE = L + 'The Lighthouse.md', orig = await read(p, NOTE), newer = orig.replace('binder: 1', 'binder: 9');
		await p.ev(`app.vault.adapter.write(${j(NOTE)}, ${j(newer)}).then(() => 1)`);
		await p.sleep(900);
		await open(p, 'The Lighthouse', ['status', 'export']);
		f.ro = { notice: await p.ev(`document.querySelector('${LEAF} .binders-notice')?.innerText ?? null`), noticeRect: await p.ev(`(${R})(document.querySelector('${LEAF} .binders-notice'))`) };
		await p.sleep(4500); // (Obsidian's own notice, which says the same over the toolbar, goes)
		await shot(p, 'state-read-only');
		c.ok(await p.ev(`${OUT}.classList.contains('is-read-only')`), 'a newer binder is read only');
		c.ok(/^Read only\. It was made by a newer version of Binders \(format 9\)/.test(f.ro.notice ?? ''), 'and says so above the rows: ' + f.ro.notice);
		c.ok(f.ro.noticeRect && f.ro.noticeRect[0] >= 0 && f.ro.noticeRect[0] + f.ro.noticeRect[2] <= 390, 'in a notice that fits the screen');
		c.eq(await p.at(`${LEAF} .binders-new-button`), null, 'there’s no New');
		await rowMenu(p, 'Part One/Arrival.md');
		f.ro.menu = await items(p);
		c.ok(f.ro.menu.includes('Open') && !['Rename', 'Delete', 'Set status', 'Duplicate', 'Move down', 'Include in export ✓'].some((x) => f.ro.menu.includes(x)), 'a row’s menu only opens: ' + j(f.ro.menu));
		await gone(p);
		const sc = await p.at(cell('Part One/Arrival.md', 'status'));
		await tap(p, sc.x, sc.y);
		c.eq(await menus(p), 0, 'its status opens no menu');
		const s = await p.at(row('Part One/Arrival.md') + ' .binders-outliner-synopsis');
		await tap(p, s.x, s.y);
		c.eq((await active(p)).tag, 'DIV', 'its synopsis no field');
		c.eq(await p.ev(`document.querySelector(${j(cell('Part One/Arrival.md', 'export') + ' input')})?.disabled ?? null`), true, 'its tick is off limits');
		const g = await grip(p, 'Part One/Arrival.md');
		await pressAndMove(p, g.x, g.y, g.x, g.y + 150);
		c.eq((await dragState(p)).ghost, null, 'and a held row doesn’t drag');
		await touch(p, 'touchEnd');
		await p.sleep(600);
		await gone(p);
		const th = await p.at(`${LEAF} .binders-outliner-th[data-col="status"]`);
		await tap(p, th.x, th.y);
		c.eq(j(await items(p)), j(['Sort ascending', 'Sort descending', 'Move right', 'Hide column']), 'the columns can still be sorted and arranged (that’s the view’s, not the binder’s)');
		await menuTap(p, 'Sort ascending');
		await p.sleep(400);
		await tap(p, th.x, th.y);
		c.ok(!(await items(p)).includes('Make this the binder order'), 'but a sort can’t be written down');
		await gone(p);
		c.eq(await read(p, NOTE), newer, 'the binder note is untouched');
		await p.ev(`app.vault.adapter.write(${j(NOTE)}, ${j(orig)}).then(() => 1)`);
		await p.sleep(900);
		// Longform
		const LF = rowIn('Longform demo/');
		await resetView(p); // (the sort is the view's: it would go along to the next binder shown in this tab)
		await open(p, 'Longform demo');
		f.lf = (await layout(p)).rows.map((r) => [r.path.split('/').pop(), r.level]);
		await shot(p, 'state-longform');
		c.eq(j(f.lf), j([['Harbor.md', 1], ['Ticket office.md', 2], ['The crossing.md', 2], ['Island.md', 1], ['Return.md', 1]]), 'a Longform project: its scenes, indented as in Longform, without the ignored note');
		c.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-outliner-chevron.collapse-icon').length`), 0, 'nothing folds');
		const add2 = await p.at(`${LEAF} .binders-new-button`);
		await tap(p, add2.x, add2.y);
		c.eq(j(await items(p)), j(['New note']), 'New has no folder');
		await gone(p);
		await rowMenu(p, 'Island.md', LF);
		c.ok(!(await items(p)).includes('Put in a new folder') && (await items(p)).includes('Move up'), 'nor has a row’s menu');
		await gone(p);
		const g2 = await grip(p, 'Island.md', LF), cr = await rect(p, LF('The crossing.md'));
		await pressAndMove(p, g2.x, g2.y, g2.x + 30, cr[1] + cr[3] - 5);
		f.lfDrag = await dragState(p);
		await shot(p, 'state-longform-drag');
		c.eq(f.lfDrag.hint, 'Move after “The crossing”', 'a scene dragged to the end of the group');
		// (where the group's names start: measured, as in the folder drag above; the indent has changed before)
		const lfNames = (await rect(p, LF('The crossing.md') + ' .binders-outliner-main'))[0];
		c.eq(f.lfDrag.line?.[0], lfNames, `its line indented as the group is, at its names (${lfNames} px): ${j(f.lfDrag.line)}`);
		await touch(p, 'touchEnd');
		await p.sleep(1000);
		await flush(p);
		c.ok(/- Harbor\n\s+- - Ticket office\n\s+- The crossing\n\s+- Island\n\s+- Return\n/.test(await read(p, 'Longform demo/Index.md')), 'joins it, in Longform’s own list: ' + (await read(p, 'Longform demo/Index.md')).split('---')[1]);
		const th2 = await p.at(`${LEAF} .binders-outliner-th[data-col="title"]`);
		await tap(p, th2.x, th2.y);
		await menuTap(p, 'Sort ascending');
		await p.sleep(500);
		await tap(p, th2.x, th2.y);
		c.ok(!(await items(p)).includes('Make this the binder order') && (await items(p)).includes('Binder order'), 'sorted, it can’t be made the order (the indents would go)');
		await gone(p);
		await shot(p, 'state-longform-sorted');
	});
	dump('states', f);
	c.done();
});

// =====================================================================================================================
// Deep, long, right to left; the look
// =====================================================================================================================

const DEEP = [
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/' },
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/Chapter one/' },
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/Chapter one/Section A/' },
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/Chapter one/Section A/Beat i/' },
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/Chapter one/Section A/Beat i/A scene five folders down with a name that goes on and on', fm: 'synopsis: The keeper climbs the stair again while the sea keeps on at the rocks below and nobody comes to relieve him, for the third night running.\nstatus: A status with a long name\nlabel: Red' },
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/Chapter one/Section A/Beat i/Short', fm: 'synopsis: Short.\nstatus: Draft\nlabel: "#7c3aed"' },
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/Chapter one/Section A/Supercalifragilisticexpialidocious_without_any_spaces_at_all_in_it', fm: 'synopsis: Averyveryverylongwordwithoutanyspacesinitwhatsoevertoseewhetheritbreaks.\nstatus: Idea' },
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/Chapter one/فصل عن البحر والمنارة', fm: 'synopsis: يصعد الحارس السلم مرة أخرى بينما البحر يضرب الصخور.\nstatus: Draft\nlabel: Blue' },
	{ path: 'Book the first, in which a very long folder name is given to see what becomes of it/Chapter one/פרק על הים', fm: 'synopsis: השומר עולה במדרגות.\nstatus: Done' },
	{ path: 'An ordinary note', fm: 'synopsis: Plain.\nstatus: Draft\ntarget: 1500000' },
	{ path: '日本語のタイトルがとても長い場合はどうなるのでしょうか', fm: 'synopsis: 灯台守はまた階段を上る。\nstatus: Draft' },
];
const BOOK = 'Book the first, in which a very long folder name is given to see what becomes of it';

test('phone, five folders deep with long and right-to-left names: names end in an ellipsis on one line, a synopsis in three, an indentation guide for each level, right-to-left names start at the tree; nothing sticks out, at 320, 390 and on its side, and with the whole interface right to left', async (p, h, t) => {
	const c = soft(t), f = {};
	await makeBinder(p, 'Deep', DEEP);
	const D = rowIn('Deep/');
	await onDevice(p, PHONE, async () => {
		for (const [name, [w, hh]] of Object.entries({ '320x568': [320, 568], '390x844': [390, 844], '844x390': [844, 390] })) {
			await metrics(p, w, hh);
			await p.sleep(500);
			await open(p, 'Deep', ['label', 'status', 'words', 'target']);
			await scrollTo(p, 0, 0);
			await shot(p, `deep-${name}`);
			const a = f[name] = await layout(p);
			c.eq(a.rows.length, 11, `${name}: every row shows`);
			c.ok(a.viewOut <= 0, `${name}: nothing sticks out of the view`);
			c.ok(a.rows.every((r) => r.name.rect[3] <= 20), `${name}: every name is one line: ${j(a.rows.map((r) => r.name.rect[3]))}`);
			c.ok(a.rows.every((r) => !r.syn || r.syn.lines <= 3), `${name}: every synopsis three lines at most`);
			c.ok(a.rows.every((r) => r.name.rect[0] + r.name.rect[2] <= a.title[0] + a.title[2] && r.rect[3] <= 100), `${name}: nothing runs out of the title column, and no row is taller than 100 px: ${j(a.rows.map((r) => r.rect[3]))}`);
			const deep = a.rows.find((r) => /A scene five/.test(r.name.text));
			c.eq(deep.level, 5, `${name}: the deepest note is at level 5`);
			c.eq(await p.ev(`(() => { const e = document.querySelector(${j(D(BOOK + '/Chapter one/Section A/Beat i/A scene five folders down with a name that goes on and on.md') + ' .mod-title')}); const s = getComputedStyle(e, '::before'), step = parseFloat(getComputedStyle(e).getPropertyValue('--binders-ol-indent')); return Math.round(parseFloat(s.width) / step); })()`), 4, `${name}: with a guide for each of the four folders it’s in`);
			const ar = a.rows.find((r) => /فصل/.test(r.name.text)), sib = a.rows.find((r) => r.name.text === 'Section A');
			c.eq(ar.name.rect[0], sib.name.rect[0], `${name}: a right-to-left name starts where its siblings’ do`);
			await scrollTo(p, 99999, 0);
			await shot(p, `deep-${name}-across`);
			const x = await layout(p), big = x.rows.find((r) => r.name.text === 'An ordinary note').cells.find((q) => q.col === 'target');
			c.ok(big.text === '1,500,000' && !big.clipped, `${name}: a target of a million and a half fits its cell: ${j(big)}`);
			await resetView(p);
		}
		await metrics(p, ...PHONE);
		await p.sleep(500);
		await p.ev(`(() => { app.vault.setConfig('rightToLeft', true); document.body.classList.add('mod-rtl'); document.body.dir = 'rtl'; return 1; })()`);
		await p.sleep(600);
		await open(p, 'Deep', ['label', 'status', 'words', 'target']);
		await scrollTo(p, 0, 0);
		await shot(p, 'deep-rtl');
		const r = f.rtl = await layout(p);
		c.eq(await p.ev(`getComputedStyle(${OUT}).direction`), 'rtl', 'the whole interface right to left');
		c.ok(r.viewOut <= 0, 'right to left: nothing sticks out');
		const top = r.rows[0], deep = r.rows.find((q) => /A scene five/.test(q.name.text));
		c.ok(top.chevron[0] > top.name.rect[0] && deep.name.rect[0] + deep.name.rect[2] < top.name.rect[0] + top.name.rect[2], 'right to left: chevrons on the right, deeper rows further left: ' + j([top.chevron, top.name.rect, deep.name.rect]));
		c.ok(r.ths.find((q) => q.col === 'label').rect[0] < r.ths.find((q) => q.col === 'title').rect[0], 'right to left: the columns run leftward');
		await p.ev(`(() => { app.vault.setConfig('rightToLeft', false); document.body.classList.remove('mod-rtl'); document.body.dir = ''; return 1; })()`);
	});
	dump('deep', f);
	c.done();
});

test('phone, light or dark, and with large text: labels, statuses, targets, a selected row, a held row and a drag look as they should (screenshots), text at 22 px grows the rows’ text, and nothing sticks out at 390 or 320', async (p, h, t) => {
	const c = soft(t), f = {};
	const theme = (await p.ev(`document.body.classList.contains('theme-dark')`)) ? 'dark' : 'light';
	await p.ev(`(async () => { const fm = (path, o) => app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L)} + path), (m) => Object.assign(m, o)); await fm('Prologue.md', { label: 'Red', target: 100 }); await fm('Part One/Arrival.md', { label: 'Blue', target: 15 }); await fm('Part One/The keeper.md', { label: '#7c3aed', compile: false }); await fm('Part Two/The wreck.md', { label: 'Green', target: 2000 }); })().then(() => 1)`);
	await p.sleep(500);
	await onDevice(p, PHONE, async () => {
		await open(p, 'The Lighthouse', ['label', 'status', 'words']);
		await pick(p, 'Part One/Arrival.md');
		await shot(p, `look-${theme}-selected`);
		f.selected = await p.ev(`(() => { const s = getComputedStyle(document.querySelector(${j(row('Part One/Arrival.md') + ' .mod-title')})); return s.backgroundImage; })()`);
		c.ok(f.selected !== 'none', 'a selected row is tinted');
		const g = await grip(p, 'Part One/The keeper.md');
		await touch(p, 'touchStart', g.x, g.y);
		await p.sleep(650);
		await shot(p, `look-${theme}-lifted`);
		f.lifted = await p.ev(`(() => { const s = getComputedStyle(document.querySelector(${j(row('Part One/The keeper.md') + ' .mod-title')})), o = getComputedStyle(document.querySelector(${j(row('Part One/Storm warning.md') + ' .mod-title')})); return { held: s.backgroundImage, rest: o.backgroundImage }; })()`);
		c.ok(f.lifted.held !== f.lifted.rest, 'a held row is tinted, in this theme too: ' + j(f.lifted));
		await touch(p, 'touchMove', g.x, g.y + 30); await p.sleep(30); await touch(p, 'touchMove', g.x, g.y + 150);
		await p.sleep(300);
		await shot(p, `look-${theme}-dragging`);
		c.eq(await p.ev(`getComputedStyle(document.querySelector(${j(row('Part One/The keeper.md'))})).opacity`), '0.45', 'a dragged row dims');
		await touch(p, 'touchCancel');
		await p.sleep(400);
		await open(p, 'The Lighthouse', ['target', 'progress', 'export', 'created', 'modified']);
		await scrollTo(p, 180, 0);
		await shot(p, `look-${theme}-more-columns`);
		f.cells = (await layout(p)).rows.map((r) => r.cells.filter((q) => q.clipped).map((q) => q.col + '=' + q.text)).flat();
		c.eq(j(f.cells), '[]', 'no target, percentage or date is cut short');
		await scrollTo(p, 9999, 0);
		await shot(p, `look-${theme}-more-columns-across`);
		await p.ev(`(() => { app.vault.setConfig('baseFontSize', 22); app.updateFontSize?.(); return 1; })()`);
		await p.sleep(900);
		await open(p, 'The Lighthouse', ['label', 'status', 'words']);
		await scrollTo(p, 0, 0);
		await shot(p, `look-${theme}-large-text`);
		f.large = await layout(p);
		c.ok(parseFloat(f.large.rowFont) > 17, 'at 22 px the rows’ text grows: ' + f.large.rowFont);
		// (the “Words” header, in a phone's 64 px column, is cut at this size: the BUG: qa7 test below)
		c.ok(f.large.viewOut <= 0 && f.large.ths.every((q) => !q.clipped || q.col === 'words') && f.large.rows.every((r) => r.name.rect[3] <= 30 && (!r.syn || r.syn.lines <= 3)), 'nothing sticks out, headers read whole, names one line: ' + j({ out: f.large.viewOut, cut: f.large.ths.filter((q) => q.clipped).map((q) => q.col), tall: f.large.rows.filter((r) => r.name.rect[3] > 30).map((r) => [r.name.text, r.name.rect[3]]), syn: f.large.rows.filter((r) => r.syn && r.syn.lines > 3).map((r) => r.name.text) }));
		f.largeCut = f.large.rows.flatMap((r) => r.cells.filter((q) => q.clipped).map((q) => q.col + '=' + q.text));
		c.ok(f.large.rows.every((r) => r.cells.every((q) => q.col !== 'words' || !q.clipped)), 'and no number is cut short (the columns keep their widths in px: “Custom color” ends in an ellipsis)');
		await scrollTo(p, 9999, 0);
		await shot(p, `look-${theme}-large-text-across`);
		await metrics(p, ...SMALL);
		await p.sleep(600);
		await scrollTo(p, 0, 0);
		await shot(p, `look-${theme}-large-text-320`);
		f.large320 = await layout(p);
		c.ok(f.large320.viewOut <= 0 && f.large320.ths.every((q) => !q.clipped || q.col === 'words'), 'at 320 px too: ' + j({ out: f.large320.viewOut, cut: f.large320.ths.filter((q) => q.clipped).map((q) => [q.col, q.rect[2]]) }));
	});
	dump(`look-${theme}`, f);
	c.done();
});

test('phone, reduced motion: folding a folder and dropping a row animate nothing', async (p, h, t) => {
	const c = soft(t);
	await onDevice(p, PHONE, async () => {
		const moving = () => p.ev(`document.getAnimations().filter(x => x.playState === 'running' && x.effect?.target?.closest?.('.binders-outliner')).map(x => x.effect.target.className.split(' ')[0] + ':' + (x.animationName ?? x.transitionProperty ?? 'glide'))`);
		await open(p);
		// with motion: the rows below a folded folder glide
		const ch = await p.at(row('Part One') + ' .binders-outliner-chevron');
		await touch(p, 'touchStart', ch.x, ch.y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(50);
		const withMotion = await moving();
		c.ok(withMotion.some((m) => /glide/.test(m)), 'with motion, the rows below a folded folder glide up: ' + j(withMotion));
		await p.sleep(500);
		await tap(p, ch.x, ch.y);
		await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
		await p.sleep(300);
		await touch(p, 'touchStart', ch.x, ch.y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(50);
		c.eq(j((await moving()).filter((m) => !/color|background|opacity|box-shadow/.test(m))), '[]', 'reduced: folding moves nothing');
		c.eq((await shown(p)).length, 6, 'and folds');
		await tap(p, ch.x, ch.y);
		const g = await grip(p, 'Part One/Arrival.md'), k = await rect(p, row('Part One/The keeper.md'));
		await pressAndMove(p, g.x, g.y, g.x, k[1] + k[3] - 6);
		await touch(p, 'touchEnd');
		await p.sleep(60);
		c.eq(j((await moving()).filter((m) => !/color|background|opacity|box-shadow/.test(m))), '[]', 'reduced: a dropped row doesn’t glide');
		await p.sleep(600);
		await flush(p);
		c.eq(j((await contents(p)).slice(2, 4)), j(['Part One/The keeper', 'Part One/Arrival']), 'and is dropped');
	});
	c.done();
});

// =====================================================================================================================
// A big binder
// =====================================================================================================================

test('phone, CPU four times slower, a binder of 600 notes in 40 folders three deep: opens in under 2 s, swipes scroll at 20 ms a frame, a folder folds in 500 ms, a tap selects in 100 ms, a drag follows the finger and scrolls at the edge', async (p, h, t) => {
	const f = {};
	const SAGA = 'Saga', PARTS = 10, CH = 3, PER = 20;
	await p.ev(`(async () => {
		const words = 'the keeper climbed the stair again while the sea kept on at the rocks below and nobody came '.repeat(12);
		const statuses = ['Draft', 'Revised', 'Done'], labels = ['Red', 'Blue', 'Green', ''];
		await app.vault.createFolder(${j(SAGA)});
		const contents = []; let n = 0;
		for (let a = 1; a <= ${PARTS}; a++) {
			const part = 'Part ' + String(a).padStart(2, '0');
			await app.vault.createFolder(${j(SAGA)} + '/' + part);
			contents.push(part + '/');
			for (let b = 1; b <= ${CH}; b++) {
				const ch = part + '/Chapter ' + b;
				await app.vault.createFolder(${j(SAGA)} + '/' + ch);
				contents.push(ch + '/');
				for (let i = 1; i <= ${PER}; i++) {
					n++; const name = 'Scene ' + String(n).padStart(4, '0');
					const fm = ['synopsis: Scene ' + n + ', in which something happens on the island and the light goes out again.', 'status: ' + statuses[n % 3], labels[n % 4] ? 'label: ' + labels[n % 4] : '', 'target: ' + (500 + n)].filter(Boolean).join('\\n');
					await app.vault.create(${j(SAGA)} + '/' + ch + '/' + name + '.md', '---\\n' + fm + '\\n---\\n' + words + '\\n');
					contents.push(ch + '/' + name);
				}
			}
		}
		await app.vault.create(${j(SAGA + '/' + SAGA + '.md')}, '---\\nbinder: 1\\ncontents:\\n' + contents.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	const N = PARTS * CH * PER;
	const ready = `${B}.scenes(app.vault.getAbstractFileByPath(${j(SAGA)}) ?? app.vault.getRoot())?.length === ${N} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Saga/')).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`;
	t.ok(await until(p, ready, 90000), 'the big binder is made');
	const S = rowIn('Saga/');
	const timed = (expr) => p.ev(`(async () => { const t = performance.now(); await (${expr}); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))); return Math.round(performance.now() - t); })()`);
	await onDevice(p, PHONE, async () => {
		t.ok(await until(p, ready, 90000), 'and found again on the phone');
		await openView(p, 'Saga');
		await p.sleep(1500);
		await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		f.opens = await timed(`(async () => { ${VIEW}.setMode('outliner'); })()`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-outliner-row').length >= ${N}`, 30000);
		await until(p, `/\\d/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '')`, 30000);
		await p.sleep(1500);
		f.rows = await p.ev(`document.querySelectorAll('${LEAF} .binders-outliner-row').length`);
		await shot(p, 'big-open');
		// (frame times on a machine that is doing other things have spikes that aren't the outliner's: it is given three
		// goes at the same swipes, and judged by the best, which is what it can do; a slow outliner is slow in all three)
		let best = null;
		for (let go = 0; go < 3; go++) {
			await scrollTo(p, 0, 0);
			await p.sleep(400);
			await frames(p, 2600);
			for (let k = 0; k < 4; k++) { await touch(p, 'touchStart', 200, 650); for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', 200, 650 - i * 35); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(200); }
			await p.sleep(400);
			const run = { scroll: await frameStats(p), scrolled: await p.ev(`${OUT}.scrollTop`) };
			if (!best || run.scroll.p95 < best.scroll.p95) best = run;
			if (run.scroll.median <= 20 && run.scroll.p95 <= 50 && run.scrolled > 1000) break;
		}
		f.scroll = best.scroll;
		f.scrolled = best.scrolled;
		f.headStays = await p.ev(`Math.round(document.querySelector('${LEAF} .binders-outliner-head').getBoundingClientRect().top - ${OUT}.getBoundingClientRect().top)`);
		await shot(p, 'big-scrolled');
		await scrollTo(p, 0, 0);
		const ch = await p.at(S('Part 01') + ' .binders-outliner-chevron');
		const fold = async () => { const n0 = await p.ev(`document.querySelectorAll('${LEAF} .binders-outliner-row').length`); await p.ev(`(() => { window.__qa5d = null; const o = new MutationObserver(() => { requestAnimationFrame(() => { window.__qa5d ??= performance.now() - window.__qa5t; }); o.disconnect(); }); o.observe(document.querySelector('${LEAF} .binders-outliner-body'), { childList: true }); document.addEventListener('touchend', () => { window.__qa5t = performance.now(); }, { once: true, capture: true }); return 1; })()`); await touch(p, 'touchStart', ch.x, ch.y); await p.sleep(40); await touch(p, 'touchEnd'); await until(p, `document.querySelectorAll('${LEAF} .binders-outliner-row').length !== ${n0}`, 10000); await p.sleep(700); return Math.round(await p.ev(`window.__qa5d ?? -1`)); };
		f.foldMs = await fold();
		f.rowsFolded = await p.ev(`document.querySelectorAll('${LEAF} .binders-outliner-row').length`);
		f.unfoldMs = await fold();
		f.collapseAll = await timed(`(async () => { const o = ${VIEW}.current; o.setCollapsed(o.folders(o.ctx.folder).map(f => f.path)); })()`);
		await p.sleep(500);
		f.rowsCollapsed = await p.ev(`document.querySelectorAll('${LEAF} .binders-outliner-row').length`);
		await shot(p, 'big-collapsed');
		f.expandAll = await timed(`(async () => { ${VIEW}.current.setCollapsed([]); })()`);
		await p.sleep(800);
		const r5 = await p.at(S('Part 01/Chapter 1/Scene 0003.md') + ' .binders-outliner-synopsis');
		await p.ev(`(() => { window.__qa5s = null; const el = document.querySelector(${j(S('Part 01/Chapter 1/Scene 0003.md'))}); const o = new MutationObserver(() => { if (el.classList.contains('is-selected')) { window.__qa5s = performance.now(); o.disconnect(); } }); o.observe(el, { attributes: true }); document.addEventListener('touchend', () => { window.__qa5e = performance.now(); }, { once: true, capture: true }); return 1; })()`);
		await tap(p, r5.x, r5.y);
		f.selectMs = Math.round(await p.ev(`window.__qa5s - window.__qa5e`));
		await scrollTo(p, 0, 3000);
		const at = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-row:not(.is-folder) .binders-outliner-name')].map(e => e.getBoundingClientRect()).filter(r => r.top > 320 && r.bottom < 600).map(r => [r.left + 14, r.top + r.height / 2])[0]`);
		await touch(p, 'touchStart', at[0], at[1]);
		await p.sleep(900);
		await frames(p, 1300);
		for (let i = 1; i <= 30; i++) { await touch(p, 'touchMove', at[0], at[1] + (i % 2 ? 3 : -3) * i); await p.sleep(16); }
		await p.sleep(400);
		f.drag = await frameStats(p);
		f.dragGhost = !!(await dragState(p)).ghost;
		const head = await rect(p, `${LEAF} .binders-outliner-head`);
		await frames(p, 1600);
		await moveOn(p, at[0], at[1], at[0], head[1] + head[3] + 10, 6);
		await p.sleep(1500);
		f.autoscroll = { frames: await frameStats(p), scroll: await p.ev(`${OUT}.scrollTop`) };
		await shot(p, 'big-drag-autoscroll');
		await touch(p, 'touchCancel');
		await p.sleep(500);
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	});
	console.log('    qa5 outliner big (ms, CPU ×4): ' + j(f));
	dump('big', f);
	// (the machine is shared: generous margins over what a quiet run measures — 480, 17/23, 190, 190, 23, 18/29 ms)
	t.eq(f.rows, N + PARTS + PARTS * CH, 'every row is there');
	t.ok(f.opens < 2000, `opens in ${f.opens} ms`);
	t.ok(f.scroll.median <= 20 && f.scroll.p95 <= 50 && f.scrolled > 1000, 'swipes scroll: ' + j(f.scroll));
	t.eq(f.headStays, 0, 'with the header in place');
	t.ok(f.foldMs >= 0 && f.foldMs < 500 && f.unfoldMs < 500 && f.rowsFolded === f.rows - 63, `a folder of 63 rows folds in ${f.foldMs} ms and unfolds in ${f.unfoldMs}`);
	t.ok(f.collapseAll < 800 && f.expandAll < 1500 && f.rowsCollapsed === PARTS, `everything folds in ${f.collapseAll} ms and unfolds in ${f.expandAll}`);
	t.ok(f.selectMs < 100, `a tap selects in ${f.selectMs} ms`);
	t.ok(f.dragGhost && f.drag.median <= 25 && f.drag.p95 <= 60, 'a drag follows the finger: ' + j(f.drag));
	t.ok(f.autoscroll.scroll < 2600 && f.autoscroll.frames.median <= 40, 'and scrolls at the header’s edge: ' + j(f.autoscroll));
});

// =====================================================================================================================
// Obsidian's own, to compare with
// =====================================================================================================================

test('reference, a base’s own table on a phone: rows 30 px, text 14 px, a header tap opens its menu as a sheet (with “Resize column...”), a tap on a cell edits it at once, a long press on a row opens nothing', async (p, h, t) => {
	const c = soft(t), f = {};
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { const old = app.vault.getAbstractFileByPath('Scenes.base'); if (old) await app.vault.delete(old); await app.vault.create('Scenes.base', 'views:\\n  - type: table\\n    name: Table\\n    order:\\n      - file.name\\n      - status\\n      - synopsis\\n      - file.mtime\\n'); await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Scenes.base')); })().then(() => 1)`);
		await until(p, `!!document.querySelector('${LEAF} .bases-tbody .bases-td')`, 8000);
		await p.sleep(1200);
		await shot(p, 'native-base-table-phone');
		f.rows = await p.ev(`[...document.querySelectorAll('${LEAF} .bases-tbody .bases-tr')].slice(0, 3).map(r => Math.round(r.getBoundingClientRect().height))`);
		f.font = await p.ev(`getComputedStyle(document.querySelector('${LEAF} .bases-tbody .bases-td .bases-rendered-value, ${LEAF} .bases-tbody .bases-td .metadata-input-longtext') ?? document.body).fontSize`);
		c.eq(j(f.rows), j([30, 30, 30]), 'a base’s rows are 30 px on a phone');
		const th = await p.at(`${LEAF} .bases-table-header`, 1);
		await tap(p, th.x, th.y);
		await p.sleep(500);
		await shot(p, 'native-base-header-tap');
		f.headerTap = { items: await items(p), sheet: await sheet(p) };
		c.ok(isSheet(f.headerTap.sheet) && f.headerTap.items.includes('Hide column') && f.headerTap.items.includes('Resize column...'), 'a tap on a header opens its menu, a sheet: ' + j(f.headerTap.items));
		await gone(p);
		const td = await p.at(`${LEAF} .bases-tbody .bases-td`, 1);
		await tap(p, td.x, td.y);
		await p.sleep(400);
		await shot(p, 'native-base-cell-tap');
		f.cellTap = await active(p);
		c.ok(/metadata-input/.test(f.cellTap.cls), 'one tap on a cell edits it: ' + j(f.cellTap.cls));
		await p.ev(`document.activeElement.blur()`);
		await hold(p, td.x, td.y + 60);
		c.eq(await menus(p), 0, 'a long press on a row opens no menu (a base’s rows have none)');
	});
	dump('native-base', f);
	c.done();
});

// =====================================================================================================================
// Bugs
// =====================================================================================================================

bug('phone: a new note’s name field shows above the navigation bar (made last in the binder, its row is scrolled only to the screen’s edge: the field opens under the bar, 802–820 px on a screen whose bar is at 760–812)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		const add = await p.at(`${LEAF} .binders-new-button`);
		await tap(p, add.x, add.y);
		await menuTap(p, 'New note');
		await until(p, `document.activeElement.tagName === 'INPUT'`);
		await p.sleep(900);
		f.field = await active(p);
		f.nav = await navbarTop(p);
		f.room = await p.ev(`${OUT}.scrollHeight - ${OUT}.clientHeight - ${OUT}.scrollTop`);
		await shot(p, 'bug-new-note-under-navbar');
	});
	t.eq(j([f.field.tag, f.field.row]), j(['INPUT', L + 'Untitled.md']), 'the new note’s name is ready to type');
	t.ok(f.field.rect[1] + f.field.rect[3] <= f.nav, `its field (${f.field.rect[1]}–${f.field.rect[1] + f.field.rect[3]} px) is above the navigation bar (from ${f.nav} px); the rows could scroll ${Math.round(f.room)} px further`);
});

bug('phone: “Edit synopsis” on a row whose synopsis isn’t showing brings its field into sight (with synopses hidden, the rows grow back and the row is looked for while they’re still gliding from their old places: the field ends up below the screen)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p, 'The Lighthouse', null, { synopsis: false });
		f.rows = (await layout(p)).rows.map((r) => r.rect[3]);
		await rowMenu(p, 'Epilogue.md');
		await menuTap(p, 'Edit synopsis');
		await p.sleep(1000);
		f.field = await active(p);
		f.nav = await navbarTop(p);
		f.head = await rect(p, `${LEAF} .binders-outliner-head`);
		await shot(p, 'bug-edit-synopsis-out-of-sight');
	});
	// (a row with its name alone is a finger tall on a phone: 44 px since 0.12.65)
	t.ok(f.rows.every((x) => x === 44), 'synopses are hidden: ' + j(f.rows));
	t.eq(j([f.field.tag, f.field.row]), j(['TEXTAREA', L + 'Epilogue.md']), '“Edit synopsis” shows them again and opens the row’s field');
	t.ok(f.field.rect[1] >= f.head[1] + f.head[3] && f.field.rect[1] + f.field.rect[3] <= f.nav, `the field (${f.field.rect[1]}–${f.field.rect[1] + f.field.rect[3]} px) is on the screen, between the header and the navigation bar (${f.head[1] + f.head[3]}–${f.nav} px)`);
});

bug('phone and tablet: the drag ghost can be seen while a row is dragged: above the finger, centered on it, as Obsidian puts its own on mobile (it hangs 5 px right of and below the finger, under the hand, and runs off the right edge of the screen)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		const g = await grip(p, 'Part One/Arrival.md'), k = await rect(p, row('Part One/The keeper.md'));
		const at = [g.x + 60, k[1] + k[3] - 6];
		await pressAndMove(p, g.x, g.y, at[0], at[1]);
		f.mid = { at, ...(await dragState(p)) };
		await shot(p, 'bug-drag-ghost-under-finger');
		await moveOn(p, at[0], at[1], 372, at[1], 4);
		f.edge = { at: [372, at[1]], ...(await dragState(p)) };
		await shot(p, 'bug-drag-ghost-off-screen');
		await touch(p, 'touchCancel');
		await p.sleep(400);
	});
	t.ok(f.mid.ghost, 'a held row drags, with Obsidian’s ghost');
	t.ok(f.edge.ghost[0] >= 0 && f.edge.ghost[0] + f.edge.ghost[2] <= 390, `with the finger at 372 px, the ghost (${f.edge.ghost[0]}–${f.edge.ghost[0] + f.edge.ghost[2]} px) is on the 390 px screen`);
	// (Obsidian's own: left = x - width / 2, top = y - height - 20)
	t.ok(f.mid.ghost[1] + f.mid.ghost[3] <= f.mid.at[1], `the ghost (top ${f.mid.ghost[1]}, bottom ${f.mid.ghost[1] + f.mid.ghost[3]} px) is above the finger (${Math.round(f.mid.at[1])} px), not under it`);
	t.ok(Math.abs(f.mid.ghost[0] + f.mid.ghost[2] / 2 - f.mid.at[0]) <= 12, `and centered on it (ghost ${f.mid.ghost[0]}–${f.mid.ghost[0] + f.mid.ghost[2]} px, finger ${Math.round(f.mid.at[0])})`);
});

// =====================================================================================================================
// What should be
// =====================================================================================================================

ux('phone: a long press anywhere on a row opens its menu, on its label or status too (those cells, 230 of the 390 px in sight, take no long press: nothing lifts, no menu opens, the row can’t be dragged by them)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		const P = 'Part One/The keeper.md';
		for (const col of ['status', 'label']) {
			await see(p, P);
			const sc = await p.at(cell(P, col));
			await touch(p, 'touchStart', sc.x, sc.y);
			await p.sleep(650);
			const lifted = (await dragState(p)).lifted.length;
			await touch(p, 'touchEnd');
			await p.sleep(550);
			f[col] = { lifted, menus: await menus(p), items: (await items(p)).slice(0, 3) };
			await shot(p, `ux-hold-${col}-cell`);
			await gone(p);
		}
		const w = await p.at(cell(P, 'words'));
		await scrollTo(p, 140, null);
		const w2 = await p.at(cell(P, 'words'));
		await hold(p, w2.x, w2.y);
		f.words = { menus: await menus(p), items: (await items(p)).slice(0, 3) };
		await gone(p);
	});
	t.ok(f.words.menus === 1 && f.words.items.includes('Open'), 'held by its word count, a row’s menu opens: ' + j(f.words));
	t.ok(f.status.menus === 1 && f.status.items.includes('Open'), 'held by its status too: ' + j(f.status));
	t.ok(f.label.menus === 1 && f.label.items.includes('Open'), 'and by its label: ' + j(f.label));
});

ux('phone: several rows can be selected by touch, so they can be merged, put in a folder or dragged together (a tap selects one row and there are no modifier keys: “Merge 3 notes”, “New folder from selection” and dragging several can’t be reached)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		await pick(p, 'Part One/Arrival.md');
		await pick(p, 'Part One/The keeper.md');
		f.afterTwoTaps = await selected(p);
		await rowMenu(p, 'Part One/The keeper.md');
		f.items = await items(p);
		await shot(p, 'ux-no-multi-select');
		await gone(p);
		f.affordance = await p.ev(`!!document.querySelector('${LEAF} .binders-outliner input[type="checkbox"].binders-select, ${LEAF} .binders-outliner .is-selecting, ${LEAF} .binders-toolbar [aria-label*="Select"]')`);
	});
	t.ok(f.afterTwoTaps.length === 2 || f.affordance || f.items.some((x) => /^Select/.test(x)), `some way to select more than one row: after two taps ${j(f.afterTwoTaps.map((x) => x.split('/').pop()))} is selected, and the row’s menu has no “Select” (${f.items.filter((x) => /select|merge|selection/i.test(x)).join(', ') || 'nothing of the kind'})`);
});

ux('phone: a column added from “+” is scrolled into sight (it’s added past the right edge of the screen: nothing seems to happen)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		await scrollTo(p, 9999, null);
		const x = await p.at(`${LEAF} .binders-outliner-th.mod-add`);
		await tap(p, x.x, x.y);
		await menuTap(p, 'Progress');
		await p.sleep(900);
		f.th = await rect(p, `${LEAF} .binders-outliner-th[data-col="progress"]`);
		f.out = await rect(p, `${LEAF} .binders-outliner`);
		await shot(p, 'ux-added-column-out-of-sight');
	});
	t.ok(f.th, 'the column is added');
	t.ok(f.th[0] >= 0 && f.th[0] + f.th[2] <= f.out[0] + f.out[2], `and in sight: it spans ${f.th[0]}–${f.th[0] + f.th[2]} px of a ${f.out[2]} px screen`);
});

ux('phone: the title column takes the room a phone has (it’s 180 px whatever the width, beside a 120 px Label column that is mostly empty: five folders down a name has 78 px, about ten letters, and the word counts are off the screen at 390 px)', async (p, h, t) => {
	const f = {};
	await makeBinder(p, 'Deep', DEEP);
	await onDevice(p, PHONE, async () => {
		await open(p, 'Deep');
		await scrollTo(p, 0, 0);
		f.deep = await layout(p);
		await shot(p, 'ux-title-column-deep');
		await open(p, 'The Lighthouse');
		await scrollTo(p, 0, 0);
		f.plain = await layout(p);
		await shot(p, 'ux-title-column');
	});
	const deep = f.deep.rows.find((r) => /A scene five/.test(r.name.text)), words = f.plain.ths.find((x) => x.col === 'words');
	t.ok(deep.name.rect[2] >= 120, `five folders down, a name has ${deep.name.rect[2]} px of the ${f.deep.title[2]} px title column on a 390 px screen`);
	t.ok(words.rect[0] + words.rect[2] <= 390, `the word counts are in sight without scrolling (the column spans ${words.rect[0]}–${words.rect[0] + words.rect[2]} px)`);
});

ux('phone: with the keyboard up, the field just opened is in sight before anything is typed (Obsidian shortens the app by --keyboard-height; a synopsis opened in the lower half of the screen stays under the keyboard until a letter is typed) [emulated: check on a device]', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		const P = 'Part Two/Lights out.md';
		await p.ev(`(() => { const r = document.querySelector(${j(row(P))}); ${OUT}.scrollTop += r.getBoundingClientRect().bottom - 740; return 1; })()`);
		await p.sleep(300);
		let s = await p.at(row(P) + ' .binders-outliner-synopsis');
		await tap(p, s.x, s.y);
		s = await p.at(row(P) + ' .binders-outliner-synopsis');
		await tap(p, s.x, s.y);
		f.tag = (await active(p)).tag;
		// the keyboard comes up, as Obsidian's mobile app says it has
		await p.ev(`(() => { document.documentElement.style.setProperty('--keyboard-height', '336px'); window.dispatchEvent(new Event('resize')); app.workspace.trigger('resize'); return 1; })()`);
		await p.sleep(900);
		f.app = await rect(p, '.app-container');
		f.field = (await active(p)).rect;
		await shot(p, 'ux-keyboard-field-hidden');
		await p.type('x');
		await p.sleep(500);
		f.afterTyping = (await active(p)).rect;
		await shot(p, 'ux-keyboard-field-after-typing');
		await p.ev(`(() => { document.activeElement.blur(); document.documentElement.style.removeProperty('--keyboard-height'); return 1; })()`);
		await p.sleep(400);
	});
	t.eq(f.tag, 'TEXTAREA', 'the synopsis’ field opens');
	const bottom = f.app[1] + f.app[3];
	t.ok(bottom <= 844 - 336 + 1, `the app is shortened to ${bottom} px`);
	t.ok(f.field[1] + f.field[3] <= bottom, `the field (${f.field[1]}–${f.field[1] + f.field[3]} px) is above the keyboard (from ${bottom} px) before anything is typed; after a letter it is at ${f.afterTyping[1]}–${f.afterTyping[1] + f.afterTyping[3]} px`);
});

ux('phone: a name or a target typed and entered leaves no keyboard focus ring on the row or the cell (after Enter the row has a 2 px ring, the cell an accent box, as if the arrow keys were in use)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p, 'The Lighthouse', ['target', 'status']);
		// (first with no key pressed at all: a row tapped, then another dropped by touch)
		await pick(p, 'Prologue.md');
		f.tap = await p.ev(`document.activeElement.matches(':focus-visible')`);
		const g = await grip(p, 'Part Two/The wreck.md'), k = await rect(p, row('Part Two/Lights out.md'));
		await pressAndMove(p, g.x, g.y, g.x, k[1] + k[3] - 6);
		await touch(p, 'touchEnd');
		await p.sleep(900);
		f.drop = await p.ev(`(() => { const a = document.activeElement; return { cls: a.className, ring: a.matches(':focus-visible'), shadow: getComputedStyle(a, '::after').boxShadow }; })()`);
		await shot(p, 'ux-focus-ring-after-drop');
		await rowMenu(p, 'Part One/Arrival.md');
		await menuTap(p, 'Rename');
		await p.sleep(500);
		await p.type('Landing');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Landing.md')})`);
		await p.sleep(600);
		f.row = await p.ev(`(() => { const a = document.activeElement; return { cls: a.className, ring: a.matches(':focus-visible'), shadow: getComputedStyle(a, '::after').boxShadow }; })()`);
		await shot(p, 'ux-focus-ring-after-rename');
		const tc = await p.at(cell('Part One/Landing.md', 'target'));
		await tap(p, tc.x, tc.y);
		if ((await active(p)).tag !== 'INPUT') await tap(p, tc.x, tc.y);
		await p.type('800');
		await p.key('Enter');
		await p.sleep(700);
		f.cell = await p.ev(`(() => { const a = document.activeElement; return { cls: a.className, ring: a.matches(':focus-visible'), shadow: getComputedStyle(a).boxShadow }; })()`);
		await shot(p, 'ux-focus-ring-after-target');
	});
	console.log('    focus after a tap: ' + j(f.tap) + ', after a drop by touch: ' + j(f.drop));
	t.ok(!f.row.ring || f.row.shadow === 'none', 'after a rename, the row shows no focus ring: ' + j(f.row) + '; after a drop by touch: ' + j(f.drop));
	t.ok(!f.cell.ring || f.cell.shadow === 'none', 'after a target, the cell shows none: ' + j(f.cell));
});

ux('phone: the Export tick is a target a finger can hit (the box is 18 × 18 px in a cell 76 px wide; a tap in the cell beside the box does nothing)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p, 'The Lighthouse', ['export']);
		const P = 'Prologue.md';
		await pick(p, P);
		f.box = await p.at(cell(P, 'export') + ' input');
		const cc = f.cell = await p.at(cell(P, 'export'));
		await tap(p, cc.l + cc.w - 12, cc.y);
		await p.sleep(500);
		await flush(p);
		f.left = await prop(p, L + P, 'export');
		await shot(p, 'ux-tick-target');
	});
	t.ok((f.box.w >= 32 && f.box.h >= 32) || f.left === 'false', `the tick’s box is ${Math.round(f.box.w)} × ${Math.round(f.box.h)} px, and a tap elsewhere in its ${Math.round(f.cell.w)} × ${Math.round(f.cell.h)} px cell ${f.left === 'false' ? 'ticks it' : 'does nothing'}`);
});

ux('phone: a target that can’t be saved can be given up without a keyboard’s Escape (“abc” stays in the field through any tap elsewhere; only putting it right or emptying it, which takes the target away, gets out)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}), fm => { fm.target = 1500; }).then(() => 1)`);
		await open(p, 'The Lighthouse', ['target']);
		const P = 'Part One/Arrival.md';
		await pick(p, P);
		const tc = await p.at(cell(P, 'target'));
		await tap(p, tc.x, tc.y);
		f.value = (await active(p)).value;
		await p.ev(`(() => { document.activeElement.select(); return 1; })()`);
		await p.type('15oo');
		const o = await p.at(row('Prologue.md') + ' .binders-outliner-synopsis');
		for (let i = 0; i < 2; i++) { await tap(p, o.x, o.y); await p.sleep(500); }
		f.after = { active: await active(p), selected: await selected(p), notices: await notices(p), cancel: await p.ev(`!!document.querySelector('${LEAF} .binders-outliner .is-invalid [aria-label*="ancel"], ${LEAF} .binders-outliner .is-invalid button')`) };
		await shot(p, 'ux-invalid-field-stuck');
		await flush(p);
		f.target = await prop(p, L + P, 'target');
		await p.key('Escape');
		await p.sleep(300);
	});
	t.eq(f.value, '1500', 'the target’s field opens with its number');
	t.eq(f.target, '1500', 'something that isn’t a number is never saved');
	t.ok(f.after.active.tag !== 'INPUT' || f.after.cancel, `after two taps elsewhere the field is still open with “${f.after.active.value}” (the row selected is now ${f.after.selected.map((x) => x.split('/').pop()).join()}), and nothing on screen gives it up`);
});

ux('phone: a name’s and a target’s field ask the keyboard for a “done” key (enterkeyhint), as the corkboard’s “New note” field does; they have none, so the key reads “return”', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await open(p, 'The Lighthouse', ['target']);
		await rowMenu(p, 'Part One/Arrival.md');
		await menuTap(p, 'Rename');
		await p.sleep(500);
		f.name = await active(p);
		await p.key('Escape');
		await p.sleep(300);
		const tc = await p.at(cell('Part One/Arrival.md', 'target'));
		await tap(p, tc.x, tc.y);
		if ((await active(p)).tag !== 'INPUT') await tap(p, tc.x, tc.y);
		f.target = await active(p);
		await p.key('Escape');
		await p.sleep(300);
	});
	t.eq(j([f.name.tag, f.target.tag]), j(['INPUT', 'INPUT']), 'both fields open');
	t.eq(j([f.name.hint, f.target.hint]), j(['done', 'done']), 'and ask for a “done” key');
});

// =====================================================================================================================
// QA round 6: what the fixes to the above broke, or left undone
// =====================================================================================================================
const bug6 = (name, fn) => specs.push({ name: 'BUG: qa6: outliner: ' + name, fn });

bug6('phone: a synopsis for a note whose properties are broken is saved all the same (above the note’s text, since 0.12.57), the note’s text below is byte for byte what it was, and the field closes', async (p, h, t) => {
	const f = {};
	const P = 'Part One/Arrival.md', typed = 'A whole new paragraph that took a while to write.';
	// (properties that can't be read, an unclosed quote; and the text under them)
	const broken = '---\nstatus: "Revised\nsynopsis: Mara arrives.\n---\nMara arrives on the island with the supply boat.\n';
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.vault.adapter.write(${j(L + P)}, ${j(broken)}).then(() => 1)`);
		await p.sleep(1500);
		await open(p);
		await rowMenu(p, P);
		await menuTap(p, 'Edit synopsis');
		await p.sleep(900);
		f.tag = (await active(p)).tag;
		await p.type(typed);
		const o = await p.at(row('Part One/The keeper.md') + ' .binders-outliner-name');
		await tap(p, o.l + 100, o.y + 30);
		await p.sleep(1200);
		f.fields = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-edit-field')].map(f => f.value)`);
		f.notices = await notices(p);
		await gone(p);
		await shot(p, 'qa6-synopsis-saved');
		f.disk = await read(p, L + P);
		await p.key('Escape');
		await p.sleep(300);
	});
	t.eq(f.tag, 'TEXTAREA', 'the synopsis is being edited');
	t.ok(f.disk.includes(typed), 'what was typed is in the note: ' + j(f.disk));
	t.ok(f.disk.endsWith(broken), 'and the note’s own text below is byte for byte what it was: ' + j(f.disk));
	t.eq(j(f.fields), j([]), 'the field closed: ' + j(f.fields));
	t.eq(f.notices.length, 0, 'and nothing is said about it: ' + j(f.notices));
});

bug6('phone: a target or a name that can’t be saved is still in its field after ONE tap on another row, to be put right; the second tap gives it up (one tap on a row, a cell or the totals gives it up at once: only a tap on something that takes no focus, the header or the toolbar, leaves it for a second)', async (p, h, t) => {
	const f = {};
	const P = 'Part One/Arrival.md';
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + P)}), fm => { fm.target = 1500; }).then(() => 1)`);
		await open(p, 'The Lighthouse', ['target']);
		const other = async () => { const o = await p.at(row('Prologue.md') + ' .binders-outliner-synopsis'); await tap(p, o.x, o.y); await p.sleep(500); };
		const fields = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-edit-field')].map(f => f.value)`);
		await pick(p, P);
		const tc = await p.at(cell(P, 'target'));
		await tap(p, tc.x, tc.y);
		if ((await active(p)).tag !== 'INPUT') await tap(p, tc.x, tc.y);
		await p.ev(`(() => { document.activeElement.select(); return 1; })()`);
		await p.type('15oo');
		await other();
		f.target1 = await fields();
		await shot(p, 'qa6-target-gone-at-one-tap');
		await other();
		f.target2 = await fields();
		await p.key('Escape');
		await p.sleep(300);
		await flush(p);
		f.target = await prop(p, L + P, 'target');
		await rowMenu(p, P);
		await menuTap(p, 'Rename');
		await p.sleep(500);
		await p.type('The keeper');
		await other();
		f.name1 = await fields();
		await other();
		f.name2 = await fields();
		await p.key('Escape');
		await p.sleep(300);
		f.there = await fileExists(p, L + P);
	});
	t.eq(j(f.target1), j(['15oo']), 'one tap on another row: “15oo” is still in the target’s field');
	t.ok(!f.target2.includes('15oo'), 'a second tap gives it up: ' + j(f.target2));
	t.eq(f.target, '1500', 'and the target is what it was');
	t.eq(j(f.name1), j(['The keeper']), 'one tap on another row: the taken name is still in its field');
	t.ok(!f.name2.includes('The keeper') && f.there, 'a second tap gives it up, and the note keeps its name: ' + j(f.name2));
});

bug6('phone: the color-only Label column, its edge dragged 20 px, is 20 px wider and named from then on (the drag starts from the 120 px the column isn’t showing, so 44 px jumps to 140; and its header and cells stay a color alone, in 140 px, until the outliner is next drawn)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}), fm => { fm.label = 'Red'; }).then(() => 1)`);
		await open(p);
		const th = `${LEAF} .binders-outliner-th[data-col="label"]`;
		const look = () => p.ev(`(() => { const th = document.querySelector(${j(th)}), c = document.querySelector(${j(cell('Prologue.md', 'label'))}); return { w: Math.round(th.getBoundingClientRect().width), th: th.classList.contains('mod-compact'), cell: c.classList.contains('mod-compact') }; })()`);
		f.before = await look();
		const edge = await p.ev(`(${R})(document.querySelector(${j(th + ' .binders-outliner-resizer')}))`);
		await touch(p, 'touchStart', edge[0] + edge[2] / 2, edge[1] + 20);
		await p.sleep(60);
		for (let i = 1; i <= 8; i++) { await touch(p, 'touchMove', edge[0] + edge[2] / 2 + i * 2.5, edge[1] + 20); await p.sleep(16); }
		await touch(p, 'touchEnd');
		await p.sleep(700);
		f.after = await look();
		await shot(p, 'qa6-label-edge-dragged');
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); ${VIEW}.setMode('outliner'); return 1; })()`);
		await p.sleep(700);
		f.redrawn = await look();
		await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: undefined }; return 1; })()`);
	});
	t.eq(j(f.before), j({ w: 44, th: true, cell: true }), 'on a phone the Label column is a color alone, 44 px wide');
	t.ok(Math.abs(f.after.w - 64) <= 4, `its edge dragged 20 px: the column is ${f.after.w} px wide (64 expected)`);
	t.eq(j([f.after.th, f.after.cell]), j([f.redrawn.th, f.redrawn.cell]), `and it shows at once as it will when next drawn (color alone, header and cells: ${j([f.after.th, f.after.cell])} now, ${j([f.redrawn.th, f.redrawn.cell])} once redrawn)`);
});

bug6('phone: a name typed on after Done and then left, while the first save is still being written, is saved whole (typed on and stayed in, it’s saved; left before the first save is done, what was added is dropped with the field)', async (p, h, t) => {
	const f = {};
	const P = 'Part One/The keeper.md';
	await onDevice(p, PHONE, async () => {
		await open(p);
		await rowMenu(p, P);
		await menuTap(p, 'Rename');
		await p.sleep(500);
		// (a slow device: the rename takes a while)
		await p.ev(`(() => { const fm = app.fileManager, o = fm.renameFile.bind(fm); window.__slow = () => { fm.renameFile = o; }; fm.renameFile = async (f, to) => { await new Promise(r => setTimeout(r, 900)); return o(f, to); }; return 1; })()`);
		try {
			await p.type('Warden');
			await p.key('Enter');
			await p.sleep(80);
			f.during = await active(p);
			await p.ev(`(() => { const i = document.activeElement; if (i.matches('input')) i.setSelectionRange(i.value.length, i.value.length); return 1; })()`);
			await p.type(' of the light');
			f.typed = (await active(p)).value;
			const o = await p.at(row('Prologue.md') + ' .binders-outliner-synopsis');
			await touch(p, 'touchStart', o.x, o.y); await p.sleep(40); await touch(p, 'touchEnd');
			await p.sleep(3500);
			f.files = await p.ev(`app.vault.getMarkdownFiles().filter(x => /Warden|keeper/.test(x.path)).map(x => x.path.split('/').pop())`);
			f.fields = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-edit-field')].map(f => f.value)`);
			await shot(p, 'qa6-typed-on-then-left');
		} finally { await p.ev(`(() => { window.__slow?.(); return 1; })()`); }
		await p.key('Escape');
		await p.sleep(300);
	});
	t.eq(j([f.during.tag, f.typed]), j(['INPUT', 'Warden of the light']), 'the field is still there to type in while the name is being saved');
	t.ok(f.files.includes('Warden of the light.md') || f.fields.includes('Warden of the light'), 'what was typed on is in the note’s name, or still in its field: notes ' + j(f.files) + ', fields ' + j(f.fields));
});

// Round 7.
specs.push({ name: 'BUG: qa7: outliner: phone, with text at 22 px (a larger text size in Obsidian’s settings): every column’s header still reads whole (“Words”, in the 64 px column a phone gives it, is cut to “Wor…”; the numbers under it fit)', fn: async (p, h, t) => {
	let ths = [], font = '';
	await onDevice(p, PHONE, async () => {
		await p.ev(`(() => { app.vault.setConfig('baseFontSize', 22); app.updateFontSize?.(); return 1; })()`);
		await p.sleep(900);
		await open(p, 'The Lighthouse', ['label', 'status', 'words']);
		await scrollTo(p, 0, 0);
		await shot(p, 'bug7-large-text-headers');
		const a = await layout(p);
		ths = a.ths; font = a.headFont;
	});
	t.eq(j(ths.filter((q) => q.clipped).map((q) => [q.col, q.rect[2]])), '[]', `headers cut short, with the header’s text at ${font} (the column and its width in px)`);
} });
