// QA round 5, the corkboard on a phone and a tablet, by touch: Obsidian's mobile mode (app.emulateMobile) at four phone
// sizes (320 × 568, 360 × 640, 390 × 844, 430 × 932) and their landscapes, a tablet's (820 × 1180, 1180 × 820), with real
// touches sent over CDP (taps, long presses, swipes, drags). Tests named "qa5 cork: …" pass; "BUG: …" are confirmed bugs
// (they fail now and will pass once fixed); "UX: …" are behaviours that should exist. Every test puts Obsidian back on
// the desktop when it ends.
//
// What the emulation can't do (as in specs-qa4-mobile.mjs): a long press never sends `contextmenu` (a device does), so
// menus that hang on `contextmenu` (the board itself) are opened by dispatching that event as Obsidian does; the
// on-screen keyboard is only a shorter viewport.
//
// Since 2026-10-01 the board shows one folder at a time: a subfolder is one card drawn as a stack (its menu is the
// folder's), gone into by a tap on its name and left by the breadcrumb. Tests about a folder's notes open that folder's
// board; what was a heading's menu is the stack's.
//
// QA5_SHOTS=<dir> saves screenshots of every step there.
import { mkdirSync } from 'fs';
import { B, PL, VIEW, card, closeMenus, contents, flush, j, menuItems, openView, read, reload, texts, tidy, until, viewState, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa5 cork: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa5 cork: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa5 cork: ' + name, fn });
/** Found in round 7 (the board of one folder at a time). */
const bug7 = (name, fn) => specs.push({ name: 'BUG: qa7: cork: ' + name, fn });

const L = 'The Lighthouse/';
const LEAF = '.workspace-leaf.mod-active';
const SMALL = [320, 568], P360 = [360, 640], PHONE = [390, 844], BIG = [430, 932], TABLET = [820, 1180];
const side = ([w, h]) => [h, w];
/** How much shorter the page is with the on-screen keyboard up (a phone's is about 40% of the screen). */
const KEYBOARD = 336, KEYBOARD_SMALL = 260;
const SHOTS = process.env.QA5_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const say = (...a) => { if (process.env.QA5_SAY) console.log('    ·', ...a); };

// ---- touch ----
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
/** A long press that's let go without moving. */
const hold = async (p, x, y, ms = 700) => { await touch(p, 'touchStart', x, y); await p.sleep(ms); await touch(p, 'touchEnd'); await p.sleep(550); };
/** A finger put down and moved straight away (a scroll). */
const swipe = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(500); };
/** A long press, then a move to (x1, y1), the finger still down. */
const pressAndMove = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); await p.sleep(620); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(20); } await p.sleep(200); };
const moveOn = async (p, x0, y0, x1, y1, steps = 8) => { for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(20); } await p.sleep(200); };

// ---- the device ----
const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
/** Runs fn in Obsidian's mobile mode at this size, with touch, in the theme the run asked for (or `theme`); then puts
    the desktop back whatever happened: menus, dialogs and settings closed, the text size, motion and CPU as they were.
    Errors logged while on the device fail the test (the reload back would otherwise forget them). */
async function onDevice(p, [width, height], fn, theme = null) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const set = (d) => p.ev(`(() => { app.changeTheme(${j(d ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await metrics(p, width, height);
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await set(theme == null ? dark : theme === 'dark');
	await p.sleep(200);
	let logged = [];
	try { await fn(); logged = p.errors.filter((e) => !NOISE.test(e)); } finally {
		await touch(p, 'touchCancel').catch(() => {});
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		await p.send('Emulation.setEmulatedMedia', { features: [] });
		await gone(p).catch(() => {});
		for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(300); }
		// (the text size is saved a moment after it's set: wait until it's on disk, or the reload brings the large one back)
		await p.ev(`(async () => { try { app.setting.close(); } catch {} document.body.classList.remove('mod-rtl'); if ((app.vault.getConfig('baseFontSize') ?? 16) !== 16) { app.vault.setConfig('baseFontSize', 16); app.updateFontSize?.(); } for (let i = 0; i < 60; i++) { let saved = 16; try { saved = JSON.parse(await app.vault.adapter.read(app.vault.configDir + '/appearance.json')).baseFontSize ?? 16; } catch {} if (saved === 16) break; await new Promise(r => setTimeout(r, 100)); } })().then(() => 1)`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
		await set(dark);
		await tidy(p);
	}
	if (logged.length) throw new Error('errors logged on the device: ' + logged.slice(0, 3).join(' ; '));
}

// ---- looking ----
const R = `(e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }`;
const rect = (p, sel) => p.ev(`(${R})(document.querySelector(${j(sel)}))`);
const CORK = `document.querySelector('${LEAF} .binders-corkboard')`;
/** Opens the binder view and waits until its word counts are in: the cards are their final height from then on. */
async function open(p, folder = 'The Lighthouse') {
	await openView(p, folder);
	await until(p, `/\\d/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '') || !!document.querySelector('${LEAF} .binders-card-words')`, 5000);
	await p.sleep(500);
}
const selected = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-selected')].map(c => c.dataset.path)`);
const prop = async (p, path, key) => (await read(p, path)).split('\n').find((l) => l.startsWith(key + ':'))?.slice(key.length + 1).trim() ?? null;
const navbarTop = (p) => p.ev(`(() => { const b = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return b && b.height ? Math.round(b.top) : null; })()`);
const scrollTo = async (p, y) => { await p.ev(`(() => { const s = ${CORK}; s.scrollTop = ${y === 'end' ? 's.scrollHeight' : y}; return 1; })()`); await p.sleep(300); };
const active = (p) => p.ev(`(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { tag: a.tagName, cls: a.className, value: a.value ?? null, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), inner: [innerWidth, innerHeight] }; })()`);
const menus = (p) => p.ev(`document.querySelectorAll('.menu').length`);
const dialogs = (p) => p.ev(`document.querySelectorAll('.modal-container').length`);
/** What sticks out of the screen sideways, and whether the view or the board scroll sideways. */
const sideways = (p) => p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'), c = ${CORK}; const out = []; for (const e of v.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; if (r.right > innerWidth + 0.5 || r.left < -0.5) out.push((e.className || e.tagName) + ' ' + Math.round(r.left) + '–' + Math.round(r.right)); } return { view: v.scrollWidth - v.clientWidth, board: c ? c.scrollWidth - c.clientWidth : 0, out: out.slice(0, 6) }; })()`);
/** The size of everything on the board a finger is meant to hit. */
const targets = (p) => p.ev(`(() => { const R = ${R}; const all = (sel) => [...document.querySelectorAll('${LEAF} ' + sel)].filter(e => e.getBoundingClientRect().height > 0).map(R); const min = (rs, k) => rs.length ? Math.min(...rs.map(r => r[k])) : null; const of = (sel) => { const rs = all(sel); return { n: rs.length, w: min(rs, 2), h: min(rs, 3) }; }; return { toolbar: of('.binders-toolbar-button'), count: of('.binders-word-count'), crumb: of('.binders-crumb[role="link"]'), head: of('.binders-card[data-path] .binders-card-head'), title: of('.binders-card[data-path] .binders-card-title'), synopsis: of('.binders-card-synopsis:not(.is-empty)'), stack: of('.binders-card.is-stack[data-path] .binders-card-head'), tile: of('.binders-card-new'), viewSynopsis: of('.binders-view-synopsis'), up: of('.binders-crumb-up'), more: of('.view-actions .clickable-icon') }; })()`);

// ---- menus and dialogs ----
/** The last menu shown: where it is, and its items. On a phone Obsidian shows a menu as a sheet along the bottom. */
const sheet = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom), inner: [innerWidth, innerHeight], itemHeights: [...m.querySelectorAll('.menu-item:not(.is-label)')].map(i => Math.round(i.getBoundingClientRect().height)) }; })()`);
const isSheet = (s) => !!s && s.left === 0 && s.width === s.inner[0] && s.bottom === s.inner[1];
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
const dialog = (p) => p.ev(`(() => { const R = ${R}; const c = [...document.querySelectorAll('.modal-container')].pop(), m = c?.querySelector('.modal'); if (!m) return null; const t = m.querySelector('.modal-title'); return { inner: [innerWidth, innerHeight], box: R(m), title: t?.textContent ?? '', text: m.querySelector('.modal-content p')?.textContent ?? '', fields: [...m.querySelectorAll('input[type="text"], select')].map(i => ({ rect: R(i), value: i.value })), buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => ({ text: b.textContent, cls: b.className, rect: R(b) })), menus: document.querySelectorAll('.menu').length, focus: document.activeElement.tagName }; })()`);
const dialogTap = async (p, text) => {
	const at = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); const b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`no “${text}” button in the dialog`);
	await p.sleep(150);
	await tap(p, at.x, at.y);
	await p.sleep(400);
};
const closeDialog = async (p) => { const x = await p.at('.modal .modal-header-button'); if (x) await tap(p, x.x, x.y); else await p.key('Escape'); await p.sleep(500); };
const seeTop = async (p, sel) => { await p.ev(`(() => { document.querySelector(${j(sel)})?.scrollIntoView({ block: 'start' }); return 1; })()`); await p.sleep(300); };
const see = async (p, sel) => { await p.ev(`(() => { document.querySelector(${j(sel)})?.scrollIntoView({ block: 'center' }); return 1; })()`); await p.sleep(300); };
/** Where to press a card so neither its title nor its synopsis is under the finger: its foot. */
const foot = async (p, path) => { const c = await p.at(card(L + path)); if (!c) throw new Error('no card for ' + path); return { x: c.x, y: c.t + c.h - 14, c }; };
/** Holds a card (by its foot) until its menu shows. */
async function cardMenu(p, path, base = L) {
	await see(p, card(base + path));
	const c = await p.at(card(base + path));
	if (!c) throw new Error('no card for ' + path);
	await hold(p, c.x, c.t + c.h - 14);
	if (!(await menus(p))) throw new Error('no menu after holding the card of ' + path);
}
/** A folder's menu: its stack held, on the board of the folder it's in. */
const stackMenu = (p, folder) => cardMenu(p, folder, '');
const STACK = (folder) => `${LEAF} .binders-card.is-stack[data-path="${folder}"]`;
/** What a stack shows. */
const stack = (p, folder) => p.ev(`(() => { const R = ${R}; const c = document.querySelector(${j(STACK(folder))}); if (!c) return null; const w = c.querySelector('.binders-card-words'), n = c.querySelector('.binders-card-title'); return { chip: c.querySelector('.binders-chip')?.textContent ?? null, label: c.classList.contains('has-label'), count: w?.textContent ?? null, countCut: w ? w.scrollWidth - w.clientWidth : 0, name: n?.textContent ?? null, nameCut: n ? n.scrollWidth - n.clientWidth : 0, nameW: n ? Math.round(n.getBoundingClientRect().width) : 0, synopsis: c.querySelector('.binders-card-synopsis')?.textContent ?? null, rect: R(c) }; })()`);
/** The way up on a phone: the arrow in the toolbar, and the folder it leads to. */
const UP = `${LEAF} .binders-crumb-up[data-path]`;
/** The board's own menu, asked for the same way, on the board's empty foot. */
async function boardMenu(p) {
	await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-board'), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.bottom - 6, button: 0 })); return 1; })()`);
	await p.sleep(500);
}
const MORE = `${LEAF} .view-actions .clickable-icon[aria-label="More options"]`;
const moreMenu = async (p) => { const m = await p.at(MORE); await tap(p, m.x, m.y); await p.sleep(300); };
const setOptions = async (p, o) => { await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, ...${j(o)} }; v.rebuild(); return 1; })()`); await p.sleep(500); };
/** The on-screen keyboard, as Obsidian's mobile app sees it: `--keyboard-height` on the body, which shortens the app
    (`.app-container { max-height: calc(100vh - var(--keyboard-height)) }`) and takes the navigation bar down with it. */
const keyboard = async (p, size, up, by = KEYBOARD) => { await p.ev(`(() => { document.body.style.setProperty('--keyboard-height', ${j(up ? by + 'px' : '0px')}); return 1; })()`); await p.sleep(500); };
const fm = (p, path, patch) => p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(path)}), fm => { Object.assign(fm, ${j(patch)}); }).then(() => 1)`);

// =====================================================================================================================
// A look at every size
// =====================================================================================================================

test('every phone size, upright and on its side: nothing sticks out or scrolls sideways, the board’s end clears the navigation bar, and every control is a finger tall', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await fm(p, L + 'Prologue.md', { label: 'Red', target: 500 });
		await fm(p, L + 'Part One/Arrival.md', { label: 'Blue' });
		await open(p);
		const out = {};
		for (const size of [SMALL, P360, PHONE, BIG, side(SMALL), side(P360), side(PHONE), side(BIG)]) {
			const name = size.join('x');
			await metrics(p, ...size);
			await p.sleep(700);
			await scrollTo(p, 0);
			await shot(p, `size-${name}-top`);
			const s = await sideways(p), tg = await targets(p);
			out[name] = tg;
			t.ok(s.view <= 0 && s.board <= 0 && s.out.length === 0, `${name}: nothing sticks out sideways: ${j(s)}`);
			await scrollTo(p, 'end');
			await shot(p, `size-${name}-end`);
			const end = await p.ev(`(() => { const cs = ${CORK}.querySelectorAll('.binders-card'); return Math.round(cs[cs.length - 1].getBoundingClientRect().bottom); })()`), nav = await navbarTop(p);
			t.ok(nav == null || end <= nav, `${name}: the last tile (bottom ${end}) is above the navigation bar (top ${nav})`);
			t.ok(tg.toolbar.h >= 32 && tg.tile.h >= 40, `${name}: the toolbar’s buttons and the “New note” tiles are a finger tall: ${j(tg)}`);
		}
		say(j(out));
	});
});

// =====================================================================================================================
// Every item of a card's sheet
// =====================================================================================================================

test('card sheet: “Rename” puts the title in a field with the name selected and the sheet gone; Enter renames; “Edit synopsis” opens the synopsis, and a tap elsewhere saves it', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await cardMenu(p, 'Part One/The keeper.md');
		await shot(p, 'sheet-card');
		const s = await sheet(p);
		t.ok(isSheet(s) && s.itemHeights.every((x) => x >= 40), 'the card’s menu is a sheet with rows a finger tall: ' + j(s));
		t.ok(await menuTap(p, 'Rename'), 'Rename');
		await p.sleep(400);
		let a = await active(p);
		say('after Rename', j(a), await menus(p));
		await shot(p, 'sheet-rename');
		t.eq(await menus(p), 0, 'the sheet is gone');
		t.eq(a.tag, 'INPUT', 'the title is a field, with the keyboard’s focus');
		t.eq(await p.ev(`document.activeElement.value.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd)`), 'The keeper', 'with the name selected, to type over');
		await p.type('The keeper refuses');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper refuses.md')})`);
		await p.sleep(500);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper refuses.md')})`), 'Enter renames the note');
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-edit-field').length`), 0, 'and closes the field');
		await flush(p);
		t.eq((await contents(p))[3], 'Part One/The keeper refuses', 'in the same place');
		// Edit synopsis
		await cardMenu(p, 'Part One/The keeper refuses.md');
		t.ok(await menuTap(p, 'Edit synopsis'), 'Edit synopsis');
		await p.sleep(400);
		a = await active(p);
		say('after Edit synopsis', j(a));
		t.eq(await menus(p), 0, 'the sheet is gone');
		t.eq(a.tag, 'TEXTAREA', 'the synopsis is a field with the focus');
		await p.type(' Twice.');
		const pr = await foot(p, 'Part One/Arrival.md');
		await tap(p, pr.x, pr.y);
		await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
		await flush(p);
		t.eq(await prop(p, L + 'Part One/The keeper refuses.md', 'synopsis'), 'The keeper refuses to let her into the tower. Twice.', 'a tap elsewhere saves what was typed');
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (!/keeper|The Lighthouse\.md/.test(path)) t.eq(after[path], text, `“${path}” is unchanged`);
	t.eq(after[L + 'Part One/The keeper refuses.md'].split('---\n').pop(), before[L + 'Part One/The keeper.md'].split('---\n').pop(), 'the renamed note’s text is the same');
});

test('card sheet: “Duplicate”, “Move down”, “Move up”, “Include in compile”, “Set synopsis from text” and “Put in a new folder” each do their job and close the sheet', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const pick = async (path, title) => { await cardMenu(p, path); if (!(await menuTap(p, title))) throw new Error(`no “${title}” in the sheet of ${path}: ` + j(await menuItems(p))); await p.sleep(700); };
		// Duplicate
		await pick('Part One/Arrival.md', 'Duplicate');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival 2.md')})`);
		await p.sleep(600);
		await flush(p);
		t.eq(await menus(p), 0, 'Duplicate closes the sheet');
		t.eq(j((await contents(p)).slice(2, 4)), j(['Part One/Arrival', 'Part One/Arrival 2']), 'the copy is after the note');
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival 2.md']), 'and is the card selected');
		t.eq((await active(p)).tag, 'DIV', 'with no field open (so no keyboard)');
		// Move down, Move up
		await pick('Part One/Arrival.md', 'Move down');
		await flush(p);
		t.eq(j((await contents(p)).slice(2, 4)), j(['Part One/Arrival 2', 'Part One/Arrival']), 'Move down');
		t.eq(await menus(p), 0, 'closes the sheet');
		await pick('Part One/Arrival.md', 'Move up');
		await flush(p);
		t.eq(j((await contents(p)).slice(2, 4)), j(['Part One/Arrival', 'Part One/Arrival 2']), 'Move up');
		// the first card of a folder has no "Move up", the last no "Move down"
		await cardMenu(p, 'Part One/Arrival.md');
		t.ok(!(await menuItems(p)).includes('Move up') && (await menuItems(p)).includes('Move down'), 'the first card of a folder has “Move down” only');
		await gone(p);
		await cardMenu(p, 'Part One/Storm warning.md');
		t.ok((await menuItems(p)).includes('Move up') && !(await menuItems(p)).includes('Move down'), 'its last card “Move up” only');
		await gone(p);
		// (the rest on the binder's own board)
		await open(p);
		await cardMenu(p, 'Prologue.md');
		t.ok(!(await menuItems(p)).includes('Move up') && (await menuItems(p)).includes('Move down'), 'the first card has “Move down” only');
		await gone(p);
		// Include in compile
		await pick('Prologue.md', 'Include in compile');
		await flush(p);
		t.eq(await prop(p, L + 'Prologue.md', 'compile'), 'false', '“Include in compile”, ticked, takes the note out');
		t.eq(await menus(p), 0, 'and closes the sheet');
		// Set synopsis from text
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')}), fm => { delete fm.synopsis; }).then(() => 1)`);
		await p.sleep(500);
		await pick('Epilogue.md', 'Set synopsis from text');
		await flush(p);
		t.eq(await prop(p, L + 'Epilogue.md', 'synopsis'), 'They sell postcards of it now.', '“Set synopsis from text”');
		// Put in a new folder: the folder's stack is named in place
		await pick('Epilogue.md', 'Put in a new folder');
		await p.sleep(500);
		const a = await active(p), nav = await navbarTop(p);
		say('after Put in a new folder', j(a), nav);
		await shot(p, 'sheet-put-in-folder');
		t.eq(a.tag, 'INPUT', 'the new folder’s name is a field with the focus');
		t.ok(a.top >= 150 && a.bottom <= nav, `in sight, above the navigation bar (${nav}): ${j(a)}`);
		t.ok(a.left >= 0 && a.right <= a.inner[0], 'and on the screen sideways');
		await p.type('Coda');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Coda/Epilogue.md')})`);
		await p.sleep(500);
		await flush(p);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Coda/Epilogue.md')})`), 'Enter names the folder, with the note in it');
		t.eq(j((await contents(p)).slice(-2)), j(['Coda/', 'Coda/Epilogue']), 'in the binder’s order');
		await shot(p, 'sheet-folder-named');
	});
});

test('card sheet: “Open” opens the note; “Open in new tab” opens it in another tab, the board kept in the first; “Delete” then “Delete” removes the note and selects the next card', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part Two');
		await cardMenu(p, 'Part Two/The wreck.md');
		t.ok(await menuTap(p, 'Open in new tab'), 'Open in new tab');
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Part Two/The wreck.md')}`);
		await p.sleep(500);
		await shot(p, 'sheet-open-new-tab');
		const tabs = await p.ev(`(() => { const out = []; app.workspace.iterateRootLeaves(l => { out.push(l.view.getViewType()); }); return out; })()`);
		t.eq(j(tabs.sort()), j(['binders-view', 'markdown']), 'two tabs: the board and the note');
		t.eq(await menus(p), 0, 'no sheet left');
		// back to the board's tab
		await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
		await p.sleep(600);
		await cardMenu(p, 'Part Two/The wreck.md');
		t.ok(await menuTap(p, 'Open'), 'Open');
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'markdown'`);
		await p.sleep(400);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), L + 'Part Two/The wreck.md', 'Open opens the note in the board’s tab');
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`);
		await p.sleep(500);
		// Delete
		await cardMenu(p, 'Part Two/The wreck.md');
		t.ok(await menuTap(p, 'Delete'), 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(400);
		const d = await dialog(p);
		t.eq(d.title, 'Delete note', 'asked first');
		t.ok(/Delete “The wreck”\?/.test(d.text), 'by name: ' + d.text);
		await dialogTap(p, 'Delete');
		await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part Two/The wreck.md')})`);
		await p.sleep(600);
		await shot(p, 'sheet-deleted');
		t.ok(!(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Part Two/The wreck.md')})`)), 'the note is deleted');
		t.eq(j(await selected(p)), j([L + 'Part Two/Lights out.md']), 'and the next card is selected');
		t.eq(await dialogs(p) + await menus(p), 0, 'with nothing left open');
		await flush(p);
		t.ok(!(await contents(p)).includes('Part Two/The wreck'), 'and it’s out of the binder’s order');
	});
});

// =====================================================================================================================
// A folder's sheet (its stack, held)
// =====================================================================================================================

test('stack sheet: every item is there; “Rename” names the folder on its card; “Edit synopsis”, “Set status”, “Set label” and “Set target...” show on the stack; “Move down”, “Duplicate” and “Ungroup” work', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const P1 = L + 'Part One';
		await stackMenu(p, P1);
		await shot(p, 'sheet-stack');
		const items = await menuItems(p);
		say('stack items', j(items));
		t.ok(isSheet(await sheet(p)), 'a stack’s menu is a sheet');
		for (const x of ['Open', 'Open in new tab', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Compile...', 'Ungroup', 'Include in compile', 'Move down', 'Delete']) t.ok(items.includes(x), `“${x}” is in it`);
		t.ok(items.includes('Move up'), '“Move up” too (Prologue is above it)');
		// Rename
		t.ok(await menuTap(p, 'Rename'), 'Rename');
		await p.sleep(400);
		let a = await active(p);
		say('stack rename', j(a));
		await shot(p, 'sheet-stack-rename');
		t.eq(a.tag, 'INPUT', 'the folder’s name is a field with the focus');
		t.eq(await menus(p), 0, 'the sheet is gone');
		t.ok(a.left >= 0 && a.right <= a.inner[0], 'the field is on the screen: ' + j(a));
		await p.type('Act One');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Act One/Arrival.md')})`);
		await p.sleep(600);
		await flush(p);
		t.eq(j((await contents(p)).slice(1, 3)), j(['Act One/', 'Act One/Arrival']), 'Enter renames the folder, its notes with it');
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'and the board stays where it was (Enter didn’t open the folder)');
		const A1 = L + 'Act One';
		// Edit synopsis
		await stackMenu(p, A1);
		t.ok(await menuTap(p, 'Edit synopsis'), 'Edit synopsis');
		await p.sleep(400);
		a = await active(p);
		t.eq(a.tag, 'TEXTAREA', 'the stack’s synopsis is a field with the focus');
		await p.type('Mara comes to the island.');
		const pr = await foot(p, 'Prologue.md');
		await tap(p, pr.x, pr.y);
		await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
		await flush(p);
		t.eq(await prop(p, A1 + '/Act One.md', 'synopsis'), 'Mara comes to the island.', 'kept in the folder’s note when another card is tapped');
		// Set status, Set label, Set target
		await stackMenu(p, A1);
		await menuTap(p, 'Set status');
		await p.sleep(300);
		await menuTap(p, 'Revised');
		await p.sleep(600);
		t.eq(await menus(p), 0, 'a status picked closes the sheet');
		await stackMenu(p, A1);
		await menuTap(p, 'Set label');
		await p.sleep(300);
		await shot(p, 'sheet-stack-labels');
		await menuTap(p, 'Green');
		await p.sleep(600);
		t.eq(await menus(p), 0, 'a label picked closes the sheet');
		await stackMenu(p, A1);
		await menuTap(p, 'Set target...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		await p.type('5000');
		await dialogTap(p, 'Set target');
		await flush(p);
		await p.sleep(500);
		await shot(p, 'sheet-stack-props');
		const head = await stack(p, A1);
		say('stack', j(head));
		t.eq(head.chip, 'Revised', 'the status shows on the stack');
		t.ok(head.label, 'and the label’s color');
		t.ok(/3 notes · 51 \/ 5,000 words/.test(head.count), 'and how far along its target it is: ' + head.count);
		t.eq(head.synopsis, 'Mara comes to the island.', 'and its synopsis');
		t.ok(head.rect[0] >= 0 && head.rect[0] + head.rect[2] <= 390, 'the stack fits the screen');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path)`)), j([L + 'Prologue.md', A1, L + 'Part Two', L + 'Epilogue.md']), 'and the folder’s note isn’t a card');
		// Move down
		await stackMenu(p, A1);
		t.ok(await menuTap(p, 'Move down'), 'Move down');
		await p.sleep(700);
		await flush(p);
		t.eq(j((await contents(p)).filter((x) => x.endsWith('/'))), j(['Part Two/', 'Act One/']), 'the folder moves after the next one');
		// Duplicate
		await stackMenu(p, L + 'Part Two');
		t.ok(await menuTap(p, 'Duplicate'), 'Duplicate');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part Two 2/The wreck.md')})`, 5000);
		await p.sleep(600);
		await flush(p);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Part Two 2/Lights out.md')})`), 'Duplicate copies the folder and its notes');
		// Ungroup
		await stackMenu(p, L + 'Part Two 2');
		t.ok(await menuTap(p, 'Ungroup'), 'Ungroup');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Lights out.md')})`, 5000);
		await p.sleep(600);
		await flush(p);
		await shot(p, 'sheet-stack-ungrouped');
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'The wreck.md')}) && !!app.vault.getAbstractFileByPath(${j(L + 'Lights out.md')})`), 'Ungroup moves the folder’s notes out, after it');
		say('after ungroup', j(await contents(p)));
		t.eq(await menus(p) + await dialogs(p), 0, 'nothing left open');
	});
});

test('stack sheet: “Delete” asks, naming the folder and how many notes go with it, and deletes; “Compile...” opens the dialog; “Open” goes into the folder', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await stackMenu(p, L + 'Part Two');
		t.ok(await menuTap(p, 'Compile...'), 'Compile...');
		await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
		await p.sleep(400);
		let d = await dialog(p);
		t.eq(d.title, 'Compile “Part Two”', 'the dialog opens');
		t.eq(d.menus, 0, 'with no sheet over it');
		await closeDialog(p);
		await stackMenu(p, L + 'Part Two');
		t.ok(await menuTap(p, 'Delete'), 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(400);
		d = await dialog(p);
		await shot(p, 'sheet-stack-delete');
		t.eq(d.title, 'Delete folder', 'asked first');
		t.ok(/“Part Two” and the 2 notes in it/.test(d.text), 'saying what goes: ' + d.text);
		await dialogTap(p, 'Delete');
		await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part Two')})`);
		await p.sleep(600);
		await flush(p);
		t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Epilogue']), 'the folder and its notes are gone from the order');
		await shot(p, 'sheet-stack-deleted');
		await stackMenu(p, L + 'Part One');
		t.ok(await menuTap(p, 'Open'), 'Open');
		await until(p, `${VIEW}.folder?.path === ${j(L + 'Part One')}`);
		t.eq((await viewState(p)).folder, L + 'Part One', 'Open goes into the folder');
		await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === 3`);
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'whose notes are its board’s cards');
	});
});

// =====================================================================================================================
// The board's own sheet, the toolbar's New, and the view's "More options"
// =====================================================================================================================

test('“New” in the toolbar: “New note” opens the last tile’s field, in sight, with the sheet gone; what’s typed makes a note at the end; “New folder” names a folder on its stack', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const n = await p.at(`${LEAF} .binders-new-button`);
		await tap(p, n.x, n.y);
		t.ok(await menuTap(p, 'New note'), 'New note');
		await p.sleep(600);
		let a = await active(p);
		const nav = await navbarTop(p);
		say('New note', j(a), nav);
		await shot(p, 'new-note-from-toolbar');
		t.eq(await menus(p), 0, 'the sheet is gone');
		t.eq(a.tag, 'INPUT', 'a title field has the focus');
		await p.type('Afterword');
		const pr = await p.at(`${LEAF} .binders-toolbar-spacer`);
		await tap(p, pr.x, pr.y);
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Afterword.md')})`);
		await p.sleep(500);
		await flush(p);
		t.eq((await contents(p)).pop(), 'Afterword', 'a tap elsewhere makes the note, at the binder’s end');
		// New folder
		await tap(p, n.x, n.y);
		t.ok(await menuTap(p, 'New folder'), 'New folder');
		await p.sleep(700);
		a = await active(p);
		say('New folder', j(a));
		await shot(p, 'new-folder-from-toolbar');
		t.eq(await menus(p), 0, 'the sheet is gone');
		t.eq(a.tag, 'INPUT', 'the folder’s name is a field with the focus');
		await p.type('Part Three');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part Three')})`);
		await p.sleep(600);
		await flush(p);
		t.eq((await contents(p)).pop(), 'Part Three/', 'Enter names it, at the binder’s end');
		await shot(p, 'new-folder-named');
	});
});

test('the board’s own sheet (a long press on the board): “New note”, “New folder”, card size, tint and numbers are in it and work', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await scrollTo(p, 'end');
		await boardMenu(p);
		await shot(p, 'sheet-board');
		const items = await menuItems(p);
		t.eq(j(items), j(['New note', 'New folder', 'Card size', 'Tint cards with their label color', 'Number the cards']), 'the board’s menu');
		t.ok(isSheet(await sheet(p)), 'a sheet');
		t.ok(await menuTap(p, 'Number the cards'), 'Number the cards');
		await p.sleep(500);
		t.eq(await menus(p), 0, 'a pick closes the sheet');
		t.eq((await viewState(p)).options.numbers, true, 'and numbers the cards');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop() + ' ' + (c.querySelector('.binders-card-number')?.textContent ?? '-'))`)), j(['Prologue.md 1', 'Part One -', 'Part Two -', 'Epilogue.md 2']), 'the notes, not the folders’ stacks');
		await shot(p, 'board-stacks-numbered');
		await boardMenu(p);
		t.ok(await menuTap(p, 'Tint cards with their label color'), 'Tint cards with their label color');
		await p.sleep(500);
		t.eq(await menus(p), 0, 'a pick closes the sheet');
		t.eq((await viewState(p)).options.labelStyle, 'stripe', 'and, ticked as it comes, turns the tint off');
		await boardMenu(p);
		t.ok(await menuTap(p, 'New note'), 'New note');
		await p.sleep(500);
		const a = await active(p);
		t.eq(a.tag, 'INPUT', '“New note” opens the tile’s field');
		await p.key('Escape');
	});
});

test('“More options”: the three modes, the board’s options, “Compile...” and “Open binder note” are there; a mode picked switches; “Open binder note” opens it', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await moreMenu(p);
		const items = await menuItems(p);
		say('more', j(items));
		for (const x of ['Corkboard', 'Outliner', 'Manuscript', 'Card size', 'Tint cards with their label color', 'Number the cards', 'Compile...', 'Open binder note']) t.ok(items.includes(x), `“${x}” is in it`);
		t.ok(!items.includes('Show subfolders as stacks'), 'and no “Show subfolders as stacks” (a folder is always a stack)');
		t.ok(await menuTap(p, 'Compile...'), 'Compile...');
		await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
		await p.sleep(400);
		t.eq((await dialog(p)).menus, 0, 'Compile opens with no sheet over it');
		await closeDialog(p);
		await moreMenu(p);
		t.ok(await menuTap(p, 'Outliner'), 'Outliner');
		await until(p, `!!document.querySelector('${LEAF} .binders-mode-outliner')`);
		t.eq((await viewState(p)).mode, 'outliner', 'a mode picked switches to it');
		await moreMenu(p);
		t.ok(await menuTap(p, 'Corkboard'), 'Corkboard');
		await until(p, `!!document.querySelector('${LEAF} .binders-mode-corkboard')`);
		await moreMenu(p);
		t.ok(await menuTap(p, 'Open binder note'), 'Open binder note');
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'The Lighthouse.md')}`);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), L + 'The Lighthouse.md', 'the binder note opens');
	});
});

bug('“New” in the toolbar leaves the field it opens in sight: “New note” opens the last tile’s title under the navigation bar (816–837 px down an 844 px screen whose bar starts at 760), “New folder” the folder’s name (824–844)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const n = await p.at(`${LEAF} .binders-new-button`), nav = await navbarTop(p), under = [];
		await tap(p, n.x, n.y);
		t.ok(await menuTap(p, 'New note'), 'New note');
		await p.sleep(700);
		let a = await active(p);
		await shot(p, 'bug-new-note-under-navbar');
		t.eq(a.tag, 'INPUT', 'a title field has the focus');
		if (a.bottom > nav) under.push(`“New note”: the field is at ${a.top}–${a.bottom}`);
		await p.key('Escape');
		await p.sleep(400);
		await scrollTo(p, 0);
		await tap(p, n.x, n.y);
		t.ok(await menuTap(p, 'New folder'), 'New folder');
		await p.sleep(800);
		a = await active(p);
		await shot(p, 'bug-new-folder-under-navbar');
		t.eq(a.tag, 'INPUT', 'the folder’s name is a field with the focus');
		if (a.bottom > nav) under.push(`“New folder”: the field is at ${a.top}–${a.bottom}`);
		t.eq(under.join('; '), '', `under the navigation bar (which starts at ${nav})`);
	});
});

// =====================================================================================================================
// Taps
// =====================================================================================================================

test('taps: a card’s foot selects it, its title opens it, a selected card’s synopsis edits; a tap on the board’s empty foot deselects; a stack’s foot selects it, its name opens the folder, and the arrow in the toolbar leads back up', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const K = 'Part One/The keeper.md';
		let f = await foot(p, K);
		await tap(p, f.x, f.y);
		t.eq(j(await selected(p)), j([L + K]), 'a tap on a card’s foot selects it');
		t.ok(!(await p.ev(`document.activeElement.matches(':focus-visible')`)), 'with no keyboard focus ring');
		// the same card again: still selected, nothing else
		await tap(p, f.x, f.y);
		t.eq(j([await selected(p), (await active(p)).tag, await menus(p)]), j([[L + K], 'DIV', 0]), 'a second tap on its foot changes nothing');
		// its status chip and its word count: nothing but the selection
		const chip = await p.at(card(L + K) + ' .binders-chip'), words = await p.at(card(L + K) + ' .binders-card-words');
		await tap(p, chip.x, chip.y);
		await tap(p, words.x, words.y);
		t.eq(j([(await active(p)).tag, await menus(p), await p.ev(`app.workspace.getActiveFile()?.path ?? null`)]), j(['DIV', 0, null]), 'a tap on its status or its count does nothing more');
		// another card: the selection moves
		f = await foot(p, 'Part One/Arrival.md');
		await tap(p, f.x, f.y);
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), 'a tap on another card selects that one alone');
		// the board's empty foot: deselects
		await scrollTo(p, 'end');
		let board = await rect(p, `${LEAF} .binders-board`), nav = await navbarTop(p);
		await tap(p, 200, Math.min(board[1] + board[3] - 30, nav - 12));
		say('after foot tap', j(await selected(p)), j(await active(p)));
		t.eq(j(await selected(p)), '[]', 'a tap on the board’s empty foot deselects');
		// a selected card's synopsis: its field
		await scrollTo(p, 0);
		f = await foot(p, K);
		await tap(p, f.x, f.y);
		const syn = await p.at(card(L + K) + ' .binders-card-synopsis');
		await tap(p, syn.x, syn.y);
		t.eq((await active(p)).tag, 'TEXTAREA', 'a tap on a selected card’s synopsis edits it');
		await p.key('Escape');
		await p.sleep(300);
		// its title: the note
		const title = await p.at(card(L + K) + ' .binders-card-title');
		await tap(p, title.l + 20, title.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + K)}`);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), L + K, 'a tap on a card’s title opens the note');
		// the binder's own board: a stack's foot and its count select it and open nothing
		await open(p);
		const P1 = L + 'Part One';
		f = await foot(p, 'Part One');
		await tap(p, f.x, f.y);
		t.eq(j([await selected(p), (await viewState(p)).folder]), j([[P1], 'The Lighthouse']), 'a tap on a stack’s foot selects it, and opens nothing');
		const count = await p.at(STACK(P1) + ' .binders-card-words');
		await tap(p, count.x, count.y);
		t.eq(j([await selected(p), (await viewState(p)).folder, (await active(p)).tag]), j([[P1], 'The Lighthouse', 'DIV']), 'nor does a tap on its count');
		// a stack's name: the folder
		const name = await p.at(STACK(P1) + ' .binders-card-title');
		await tap(p, name.l + 20, name.y);
		await until(p, `${VIEW}.folder?.path === ${j(P1)}`);
		t.eq((await viewState(p)).folder, P1, 'a tap on a stack’s name opens the folder');
		await until(p, `!!document.querySelector(${j(card(L + K))})`);
		await shot(p, 'taps-in-folder');
		const tg = await targets(p);
		say('targets in folder', j(tg));
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card[data-path]').length`), 3, 'whose three notes are the board’s cards');
		// the way back up: the arrow and the binder's name in the toolbar
		const up = await p.at(`${LEAF} .binders-crumb[role="link"]`) ?? await p.at(UP);
		await tap(p, up.x, up.y);
		await until(p, `${VIEW}.folder?.path === 'The Lighthouse'`);
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'and the breadcrumb goes back up');
	});
});

test('typing is never lost: a synopsis being typed is saved when another card’s title is tapped (the note opens), when the mode is switched, when a folder’s stack is gone into, when another note is opened in the tab, and when the tab is closed', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		const P = card(L + 'Prologue.md');
		const edit = async (text) => {
			const f = await foot(p, 'Prologue.md');
			await tap(p, f.x, f.y);
			const syn = await p.at(P + ' .binders-card-synopsis');
			await tap(p, syn.x, syn.y);
			if ((await active(p)).tag !== 'TEXTAREA') throw new Error('the synopsis didn’t open: ' + j(await active(p)));
			await p.ev(`(() => { const f = document.activeElement; f.setSelectionRange(f.value.length, f.value.length); return 1; })()`);
			await p.type(text);
		};
		const saved = async (want, what) => { await until(p, `app.vault.adapter.read(${j(L + 'Prologue.md')}).then(x => x.includes(${j(want)}))`, 4000); t.eq(await prop(p, L + 'Prologue.md', 'synopsis'), want, what); };
		// another card's title
		await edit(' One.');
		await see(p, card(L + 'Epilogue.md'));
		const title = await p.at(card(L + 'Epilogue.md') + ' .binders-card-title');
		await tap(p, title.l + 20, title.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Epilogue.md')}`);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), L + 'Epilogue.md', 'a tap on another card’s title opens that note');
		await saved('The light has not gone out in forty years. One.', 'and what was typed is saved');
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`);
		await p.sleep(600);
		// the mode switched from the toolbar
		await edit(' Two.');
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y);
		await menuTap(p, 'Outliner');
		await until(p, `!!document.querySelector('${LEAF} .binders-mode-outliner')`);
		await saved('The light has not gone out in forty years. One. Two.', 'switching the mode saves what was typed');
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
		await p.sleep(600);
		// a stack's name tapped: into the folder
		await edit(' Three.');
		const name = await p.at(STACK(L + 'Part One') + ' .binders-card-title');
		await tap(p, name.l + 20, name.y);
		await until(p, `${VIEW}.folder?.path === ${j(L + 'Part One')}`);
		await saved('The light has not gone out in forty years. One. Two. Three.', 'going into a folder saves what was typed');
		// Back, with the field open
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `${VIEW}.folder?.path === 'The Lighthouse'`);
		await p.sleep(600);
		await edit(' Four.');
		await p.ev(`(async () => { await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')})); })().then(() => 1)`);
		await saved('The light has not gone out in forty years. One. Two. Three. Four.', 'another note opened in the tab saves what was typed');
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`);
		await p.sleep(600);
		// the tab closed
		await edit(' Five.');
		await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].detach(); return 1; })()`);
		await saved('The light has not gone out in forty years. One. Two. Three. Four. Five.', 'closing the tab saves what was typed');
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (path !== L + 'Prologue.md') t.eq(after[path], text, `“${path}” is unchanged`);
	t.eq(after[L + 'Prologue.md'].split('---\n').pop(), before[L + 'Prologue.md'].split('---\n').pop(), 'Prologue’s text is unchanged');
});

test('typing is never lost: a title being typed in the “New note” tile makes its note when the mode is switched, when a card’s title is tapped, and when the tab is closed', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const start = async (name) => {
			// (the tile ends the board: brought clear of the navigation bar, which floats over the board's foot)
			await see(p, `${LEAF} .binders-card-new`);
			const tile = await p.at(`${LEAF} .binders-card-new`);
			await tap(p, tile.x, tile.y);
			say('tile', name, j(tile), j(await active(p)), await p.ev(`Math.round(${CORK}.scrollTop)`));
			if ((await active(p)).tag !== 'INPUT') throw new Error('the tile didn’t open');
			await p.type(name);
			say('typed', j(await active(p)), await p.ev(`Math.round(${CORK}.scrollTop)`));
		};
		const made = async (name, what) => { await until(p, `!!app.vault.getAbstractFileByPath(${j(L + name + '.md')})`, 4000); t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + name + '.md')})`), what); };
		await start('Made by a mode switch');
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y);
		await menuTap(p, 'Outliner');
		await until(p, `!!document.querySelector('${LEAF} .binders-mode-outliner')`);
		await made('Made by a mode switch', 'switching the mode makes the note being named');
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
		await p.sleep(700);
		await start('Made by a title tap');
		await scrollTo(p, 0);
		const title = await p.at(card(L + 'Prologue.md') + ' .binders-card-title');
		say('title', j(title));
		await tap(p, title.l + 20, title.y);
		say('after the tap', j(await active(p)), await p.ev(`app.workspace.getActiveFile()?.path ?? null`), j(await p.ev(`app.vault.getMarkdownFiles().map(f => f.path).filter(x => /Made/.test(x))`)));
		await made('Made by a title tap', 'a tap on a card’s title makes the note being named');
		await p.sleep(600);
		say('after title tap', await p.ev(`app.workspace.getActiveFile()?.path ?? null`));
		if (await p.ev(`app.workspace.getMostRecentLeaf()?.view.getViewType() !== 'binders-view'`)) { await p.ev(`app.commands.executeCommandById('app:go-back')`); await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`); await p.sleep(600); }
		await start('Made by closing');
		await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].detach(); return 1; })()`);
		await made('Made by closing', 'closing the tab makes the note being named');
		await flush(p);
		say(j(await contents(p)));
	});
});

// =====================================================================================================================
// Editing in place, with the keyboard up
// =====================================================================================================================

test('keyboard up: for a card’s synopsis and title, a stack’s name, the “New note” tile and the binder’s synopsis, at 390 × 844, 320 × 568 and 844 × 390, the first letter typed brings the line being typed above the keyboard', async (p, h, t) => {
	const out = {};
	await onDevice(p, PHONE, async () => {
		for (const size of [PHONE, SMALL, side(PHONE)]) {
			const name = size.join('x'), kb = size === SMALL ? KEYBOARD_SMALL : size[1] < 400 ? 200 : KEYBOARD;
			await metrics(p, ...size);
			await p.sleep(600);
			await open(p);
			const probe = async (what, begin) => {
				await keyboard(p, size, false);
				await begin();
				await p.sleep(300);
				const a0 = await active(p);
				await keyboard(p, size, true, kb);
				const a1 = await active(p);
				await p.type('x');
				await p.sleep(400);
				const a2 = await active(p), nav = await navbarTop(p);
				await shot(p, `kb-${name}-${what}`);
				out[`${name} ${what}`] = { tag: a2.tag, before: [a0.top, a0.bottom], up: [a1.top, a1.bottom], typed: [a2.top, a2.bottom], keyboardTop: size[1] - kb, nav };
				await p.key('Escape');
				await p.sleep(300);
				await keyboard(p, size, false);
			};
			await probe('synopsis-last', async () => { await scrollTo(p, 'end'); const f = await foot(p, 'Epilogue.md'); await tap(p, f.x, f.y); const s = await p.at(card(L + 'Epilogue.md') + ' .binders-card-synopsis'); await tap(p, s.x, s.y); });
			await probe('rename-last', async () => { await scrollTo(p, 'end'); await cardMenu(p, 'Epilogue.md'); await menuTap(p, 'Rename'); });
			await probe('stack-rename', async () => { await stackMenu(p, L + 'Part Two'); await menuTap(p, 'Rename'); });
			// (on its side, Obsidian's navigation bar floats over the last tile: it can't be tapped there)
			if (size[1] >= 500) await probe('tile-last', async () => { await scrollTo(p, 'end'); const all = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card-new')].map(${R})`); const r = all[all.length - 1]; await tap(p, r[0] + r[2] / 2, r[1] + r[3] / 2); });
			await probe('view-synopsis', async () => { await scrollTo(p, 0); const s = await p.at(`${LEAF} .binders-view-synopsis`); await tap(p, s.x, s.y); });
		}
	});
	for (const [k, v] of Object.entries(out)) {
		say(k, j(v));
		t.ok(/INPUT|TEXTAREA/.test(v.tag), `${k}: the field opens`);
		// (on its side with the keyboard up, Obsidian's header and the toolbar leave 27 px of board: there the line only has to be above the keyboard)
		t.ok((v.typed[0] >= 150 || v.keyboardTop < 200) && v.typed[0] < v.keyboardTop - 12, `${k}: once a letter is typed its line is in sight above the keyboard: ${j(v)}`);
	}
});

// =====================================================================================================================
// Long press and drag
// =====================================================================================================================

const dragState = (p) => p.ev(`({ ghost: document.querySelectorAll('.binders-drag-ghost').length, count: document.querySelector('.binders-drag-count')?.textContent ?? null, line: (${R})(document.querySelector('.binders-drop-indicator.is-active')), over: document.querySelector('${LEAF} .is-being-dragged-over')?.dataset.path ?? null, slot: [...document.querySelectorAll('${LEAF} .binders-card.is-dragging')].map(c => c.dataset.path), scroll: Math.round(${CORK}.scrollTop) })`);
const leftovers = (p) => p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-lifted, .is-dragging, .is-drop-target, .is-being-dragged-over').length + (document.body.classList.contains('is-grabbing') ? 1 : 0)`);

test('drag: a card goes from the binder into a folder (dropped on its stack, which is marked), and a card inside a folder is moved along its board (a line shows where); nothing of any note’s text changes', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		// Prologue onto Part One's stack
		const pr = await foot(p, 'Prologue.md'), s1 = await p.at(card(L + 'Part One'));
		await pressAndMove(p, pr.x, pr.y, s1.x, s1.y, 14);
		const mid = await dragState(p);
		await shot(p, 'drag-into-stack');
		say('into stack', j(mid));
		t.eq(mid.ghost, 1, 'the card follows the finger');
		t.eq(mid.over, L + 'Part One', 'and the folder it would move into is marked');
		t.eq(mid.line, null, 'with no line');
		t.eq(j(mid.slot), j([L + 'Prologue.md']), 'its own place is held');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Prologue.md')})`);
		await p.sleep(700);
		await flush(p);
		t.eq(j((await contents(p)).slice(0, 5)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Prologue']), 'dropped on the stack, it’s the folder’s last');
		t.eq(await leftovers(p) + await menus(p), 0, 'nothing of the drag is left, and no menu');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['Part One', 'Part Two', 'Epilogue.md']), 'and it’s off the binder’s board');
		// inside the folder: Prologue (last) to between Arrival and The keeper
		await open(p, L + 'Part One');
		const f = await foot(p, 'Part One/Prologue.md'), k = await p.at(card(L + 'Part One/The keeper.md'));
		await pressAndMove(p, f.x, f.y, f.x, k.t + 10, 14);
		const mid2 = await dragState(p);
		await shot(p, 'drag-in-folder');
		say('in the folder', j(mid2));
		t.ok(mid2.line && mid2.line[3] <= 3 && mid2.line[2] > 200, 'a line across the column shows where it will go: ' + j(mid2.line));
		await touch(p, 'touchEnd');
		await p.sleep(900);
		await flush(p);
		t.eq(j((await contents(p)).slice(0, 5)), j(['Part One/', 'Part One/Arrival', 'Part One/Prologue', 'Part One/The keeper', 'Part One/Storm warning']), 'dropped between Arrival and The keeper');
		t.eq(j(await selected(p)), j([L + 'Part One/Prologue.md']), 'the moved card is selected');
		t.eq(await leftovers(p) + await menus(p), 0, 'nothing of the drag is left, and no menu');
	});
	const after = await texts(p);
	const moved = { [L + 'Prologue.md']: L + 'Part One/Prologue.md' };
	for (const [path, text] of Object.entries(before)) if (path !== L + 'The Lighthouse.md') t.eq(after[moved[path] ?? path], text, `“${path}” is unchanged`);
});

bug7('a card dropped on the way up in the toolbar (the arrow, or the folder’s name beside it) moves out to that folder, at its end (the folder is marked while the card is over it, but let go there nothing moves)', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part Two');
		const lo = await foot(p, 'Part Two/Lights out.md'), up = await p.at(UP);
		t.ok(up, 'inside a folder the toolbar has the way up');
		await pressAndMove(p, lo.x, lo.y, up.x, up.y, 14);
		const mid = await dragState(p);
		await shot(p, 'drag-out-by-breadcrumb');
		say('onto the way up', j(mid));
		t.eq(mid.ghost, 1, 'the card follows the finger');
		t.eq(mid.over, 'The Lighthouse', 'over the way up, the folder it leads to is marked');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Lights out.md')})`, 4000);
		await p.sleep(700);
		await flush(p);
		t.eq(await leftovers(p) + await menus(p), 0, 'nothing of the drag is left, and no menu');
		t.eq((await viewState(p)).folder, L + 'Part Two', 'the board stays in the folder');
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Lights out.md')})`), 'let go there, the note moves out to the binder');
		t.eq(j((await contents(p)).slice(-3)), j(['Part Two/The wreck', 'Epilogue', 'Lights out']), 'at its end');
	});
	const after = await texts(p);
	const moved = { [L + 'Part Two/Lights out.md']: L + 'Lights out.md' };
	for (const [path, text] of Object.entries(before)) if (path !== L + 'The Lighthouse.md') t.eq(after[moved[path] ?? path], text, `“${path}” is unchanged`);
});

test('drag: a card lifted, moved away and brought back to its place, then let go, moves nothing and opens no menu; let go over the toolbar, the same; a long press on a title opens the menu, not the note', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const order = await contents(p);
		const a = await foot(p, 'Part One/Arrival.md');
		await pressAndMove(p, a.x, a.y, a.x + 30, a.y + 90, 8);
		t.eq((await dragState(p)).ghost, 1, 'dragging');
		await moveOn(p, a.x + 30, a.y + 90, a.x, a.y);
		const back = await dragState(p);
		t.eq(back.line, null, 'back over its own place, there’s no line');
		await touch(p, 'touchEnd');
		await p.sleep(700);
		await flush(p);
		t.eq(j(await contents(p)), j(order), 'let go there, nothing moves');
		t.eq(await menus(p) + await leftovers(p), 0, 'no menu, nothing left over');
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-edit-field').length`), 0, 'and no field opens');
		// over the toolbar (its “New” button: a folder in the breadcrumb is somewhere to drop)
		const bar = await rect(p, `${LEAF} .binders-toolbar`), nb = await p.at(`${LEAF} .binders-new-button`);
		await pressAndMove(p, a.x, a.y, nb.x, bar[1] + 10, 12);
		const up = await dragState(p);
		t.eq(up.line, null, 'over the toolbar there’s no line');
		await touch(p, 'touchEnd');
		await p.sleep(700);
		await flush(p);
		t.eq(j(await contents(p)), j(order), 'let go there, nothing moves');
		t.eq((await viewState(p)).mode + '|' + await menus(p), 'corkboard|0', 'and the toolbar’s button under the finger isn’t pressed');
		// a long press on a title
		await scrollTo(p, 0);
		const title = await p.at(card(L + 'Part One/Arrival.md') + ' .binders-card-title');
		await hold(p, title.l + 20, title.y);
		t.ok((await menuItems(p)).includes('Rename'), 'a long press on a title opens the card’s menu');
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'and not the note');
		await gone(p);
		// a long press on a selected card's synopsis: the menu, not the field
		const syn = await p.at(card(L + 'Part One/Arrival.md') + ' .binders-card-synopsis');
		await hold(p, syn.x, syn.y);
		t.ok((await menuItems(p)).includes('Rename'), 'a long press on a selected card’s synopsis opens the menu');
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-edit-field').length`), 0, 'and doesn’t start editing it');
		await gone(p);
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-edit-field').length`), 0, 'nor once the menu is closed');
	});
});

test('drag: several cards selected (with “Select more” in a card’s sheet) are carried together as a pile with their number, and land in order', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		// Arrival, then Storm warning with it
		await cardMenu(p, 'Part One/Arrival.md');
		t.ok(await menuTap(p, 'Select more'), 'a card’s sheet has “Select more”');
		await p.sleep(400);
		const sw = await foot(p, 'Part One/Storm warning.md');
		await tap(p, sw.x, sw.y);
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md', L + 'Part One/Storm warning.md']), 'then a tap on another card adds it to the selection');
		const a = await foot(p, 'Part One/Arrival.md'), k = await p.at(card(L + 'Part One/The keeper.md'));
		await pressAndMove(p, a.x, a.y, a.x, k.t + k.h - 6, 14);
		const mid = await dragState(p);
		await shot(p, 'drag-several');
		say('several', j(mid));
		t.eq(mid.count, '2', 'the pile says how many');
		t.eq(mid.slot.length, 2, 'both places are held');
		await touch(p, 'touchEnd');
		await p.sleep(1000);
		await flush(p);
		t.eq(j((await contents(p)).slice(1, 5)), j(['Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning']), 'both land after The keeper, in their order');
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md', L + 'Part One/Storm warning.md']), 'still selected');
		// the sheet of several: what it offers
		const c = await foot(p, 'Part One/Arrival.md');
		await hold(p, c.x, c.y);
		const items = await menuItems(p);
		await shot(p, 'sheet-several');
		say('several sheet', j(items));
		for (const x of ['Set status', 'Set label', 'Set target...', 'Merge 2 notes', 'New folder from selection', 'Delete 2 items']) t.ok(items.includes(x), `“${x}” is in the sheet of two cards`);
		t.ok(!items.includes('Rename') && !items.includes('Open'), 'and nothing that’s for one card');
		t.ok(await menuTap(p, 'New folder from selection'), 'New folder from selection');
		await p.sleep(800);
		const f = await active(p);
		t.eq(f.tag, 'INPUT', 'the new folder is named on its stack');
		await p.type('Opening');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Opening/Storm warning.md')})`);
		await flush(p);
		t.eq(j((await contents(p)).slice(1, 6)), j(['Part One/', 'Part One/The keeper', 'Part One/Opening/', 'Part One/Opening/Arrival', 'Part One/Opening/Storm warning']), 'with both notes in it');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['The keeper.md', 'Opening']), 'and the board shows it as one stack');
	});
});

ux('several cards can be selected by touch (there’s no way to: no “Select” in a card’s sheet, a tap always selects one card alone, so “Merge notes”, “New folder from selection” and moving several at once can’t be reached on a phone)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await cardMenu(p, 'Part One/Arrival.md');
		const items = await menuItems(p);
		await gone(p);
		// with one card selected, a tap on another card's foot
		const k = await foot(p, 'Part One/The keeper.md');
		await tap(p, k.x, k.y);
		const sel = await selected(p);
		t.ok(items.some((x) => /^Select/.test(x)) || sel.length > 1, `a card’s sheet has no item to select more (${items.join(', ')}), and a tap on another card leaves ${sel.length} selected`);
	});
});

test('stacks: a card dropped on a stack’s middle goes into that folder; dropped at a stack’s edge it goes beside it; a stack is dragged like a card; a tap on its title opens it', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await shot(p, 'stacks');
		const pr = await foot(p, 'Prologue.md'), s1 = await p.at(card(L + 'Part One'));
		say('stack card', j(s1));
		await pressAndMove(p, pr.x, pr.y, s1.x, s1.y, 12);
		let mid = await dragState(p);
		await shot(p, 'stacks-drag-into');
		t.eq(mid.over, L + 'Part One', 'over a stack’s middle, the stack is marked');
		t.eq(mid.line, null, 'and there’s no line');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Prologue.md')})`);
		await p.sleep(700);
		await flush(p);
		t.eq(j((await contents(p)).slice(0, 5)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Prologue']), 'dropped on the stack, the note goes to the folder’s end');
		t.eq(await p.ev(`document.querySelector(${j(card(L + 'Part One'))} + ' .binders-card-words')?.textContent`), '4 notes · 72 words', 'the stack counts it');
		// Epilogue to between the two stacks: the lower edge of Part One
		const e = await foot(p, 'Epilogue.md'), s = await p.at(card(L + 'Part One'));
		await pressAndMove(p, e.x, e.y, e.x, s.t + s.h + 4, 12);
		mid = await dragState(p);
		await shot(p, 'stacks-drag-between');
		say('between stacks', j(mid));
		t.ok(mid.line && mid.over == null, 'between two stacks there’s a line, and neither is marked');
		await touch(p, 'touchEnd');
		await p.sleep(900);
		await flush(p);
		t.eq(j((await contents(p)).filter((x) => !x.includes('/') || x.endsWith('/'))), j(['Part One/', 'Epilogue', 'Part Two/']), 'dropped between them, it stays in the binder');
		// a stack dragged: Part Two to the top
		const s2 = await foot(p, 'Part Two'), top = await p.at(card(L + 'Part One'));
		await pressAndMove(p, s2.x, s2.y, s2.x, top.t + 4, 12);
		await touch(p, 'touchEnd');
		await p.sleep(900);
		await flush(p);
		t.eq(j((await contents(p)).filter((x) => x.endsWith('/'))), j(['Part Two/', 'Part One/']), 'a stack is moved like a card');
		t.eq(await leftovers(p) + await menus(p), 0, 'nothing left over');
		// its sheet
		await cardMenu(p, 'Part One');
		const items = await menuItems(p);
		say('stack sheet', j(items));
		for (const x of ['Open', 'Rename', 'Edit synopsis', 'Set status', 'Duplicate', 'Ungroup', 'Compile...', 'Delete']) t.ok(items.includes(x), `“${x}” is in a stack’s sheet`);
		t.ok(await menuTap(p, 'Rename'), 'Rename');
		await p.sleep(400);
		t.eq((await active(p)).tag, 'INPUT', 'a stack is renamed on its card');
		await p.type('First part');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'First part/Arrival.md')})`);
		await p.sleep(500);
		const title = await p.at(card(L + 'First part') + ' .binders-card-title');
		await tap(p, title.l + 20, title.y);
		await until(p, `${VIEW}.folder?.path === ${j(L + 'First part')}`);
		await p.sleep(400);
		await shot(p, 'stacks-inside');
		t.eq((await viewState(p)).folder, L + 'First part', 'a tap on a stack’s title opens the folder');
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card[data-path]').length`), 4, 'with its four notes');
	});
});

// =====================================================================================================================
// Other binders: empty, read only, Longform
// =====================================================================================================================

test('an empty binder: it says so, and the “New note” tile is in sight under it; a note named there is the binder’s first', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Blank'); await app.vault.create('Blank/Blank.md', '---\\nbinder: 1\\ncontents: []\\n---\\n'); })().then(() => 1)`);
	await until(p, `!!${B}.binderOf(app.vault.getAbstractFileByPath('Blank'))`, 5000);
	await onDevice(p, PHONE, async () => {
		await until(p, `!!${B}.binderOf(app.vault.getAbstractFileByPath('Blank'))`, 8000);
		for (const size of [PHONE, SMALL]) {
			await metrics(p, ...size);
			await p.sleep(500);
			await openView(p, 'Blank');
			await p.sleep(600);
			await shot(p, `empty-${size.join('x')}`);
			const e = await p.ev(`(() => { const R = ${R}; return { empty: R(document.querySelector('${LEAF} .binders-empty')), text: document.querySelector('${LEAF} .binders-empty')?.innerText ?? null, tile: R(document.querySelector('${LEAF} .binders-card-new')), scrolls: ${CORK}.scrollHeight - ${CORK}.clientHeight, inner: innerHeight }; })()`), nav = await navbarTop(p);
			say('empty', size.join('x'), j(e), nav);
			t.ok(/No notes in this folder yet/.test(e.text ?? ''), 'it says the binder is empty');
			t.ok(e.tile && e.tile[1] + e.tile[3] <= (nav ?? e.inner), `${size.join('x')}: the “New note” tile is in sight (${j(e.tile)}, navigation bar at ${nav})`);
		}
		await metrics(p, ...PHONE);
		await p.sleep(500);
		const tile = await p.at(`${LEAF} .binders-card-new`);
		await tap(p, tile.x, tile.y);
		t.eq((await active(p)).tag, 'INPUT', 'a tap on the tile opens its field');
		await p.type('First');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath('Blank/First.md')`);
		await p.key('Escape');
		await p.sleep(500);
		await flush(p);
		t.eq(j(await contents(p, 'Blank/Blank.md')), j(['First']), 'the note is the binder’s first');
		t.eq(await p.ev(`!!document.querySelector('${LEAF} .binders-empty')`), false, 'and the board no longer says it’s empty');
	});
});

test('a read-only binder (a newer format): it says why, has no “New”, no tiles and no fields; a long press offers only what changes nothing; a held card can’t be dragged', async (p, h, t) => {
	const note = await read(p, L + 'The Lighthouse.md');
	await writeRaw(p, L + 'The Lighthouse.md', note.replace('binder: 1', 'binder: 99'));
	await p.sleep(800);
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		await shot(p, 'read-only');
		const ro = await p.ev(`({ notice: document.querySelector('${LEAF} .binders-notice')?.textContent ?? '', add: getComputedStyle(document.querySelector('${LEAF} .binders-new-button')).display, tiles: document.querySelectorAll('${LEAF} .binders-card-new').length, cards: document.querySelectorAll('${LEAF} .binders-card[data-path]').length })`);
		say('read only', j(ro));
		t.ok(/^Read only\./.test(ro.notice), 'it says it’s read only: ' + ro.notice);
		t.eq(j([ro.add, ro.tiles, ro.cards]), j(['none', 0, 4]), 'no “New” button, no tile, the binder’s four cards');
		t.ok((await sideways(p)).out.length === 0, 'the notice fits the screen');
		// taps: select, but no field
		const f = await foot(p, 'Prologue.md');
		await tap(p, f.x, f.y);
		const syn = await p.at(card(L + 'Prologue.md') + ' .binders-card-synopsis');
		await tap(p, syn.x, syn.y);
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-edit-field').length`), 0, 'a tap on a selected card’s synopsis opens no field');
		// the sheet
		await cardMenu(p, 'Prologue.md');
		const items = await menuItems(p);
		await shot(p, 'read-only-sheet');
		say('read-only sheet', j(items));
		for (const x of ['Rename', 'Edit synopsis', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in compile', 'Move down']) t.ok(!items.includes(x), `no “${x}” in a read-only binder’s sheet`);
		t.ok(items.includes('Open'), 'but “Open”');
		await gone(p);
		// a drag
		const k = await p.at(card(L + 'Part One'));
		await pressAndMove(p, f.x, f.y, k.x, k.y, 10);
		const mid = await dragState(p);
		await touch(p, 'touchEnd');
		await p.sleep(600);
		t.eq(mid.ghost, 0, 'a held card isn’t dragged');
		await gone(p);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')})`), 'nor moved into the stack it was let go on');
		// a stack: gone into by its name, renamed by nothing
		await cardMenu(p, 'Part One');
		const folder = await menuItems(p);
		for (const x of ['Rename', 'Edit synopsis', 'Set status', 'Duplicate', 'Ungroup', 'Delete']) t.ok(!folder.includes(x), `no “${x}” in a stack’s sheet`);
		t.ok(folder.includes('Open'), 'but “Open”');
		await gone(p);
		t.eq(await leftovers(p), 0, 'and nothing is left over');
		// the board's own sheet: how it shows, nothing to make
		await boardMenu(p);
		t.eq(j(await menuItems(p)), j(['Card size', 'Tint cards with their label color', 'Number the cards']), 'the board’s sheet has only how it shows');
		await gone(p);
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) t.eq(after[path], text, `“${path}” is unchanged`);
});

test('a Longform project: scenes in its order, the indented ones under their scene; a card is dragged to reorder (only `longform.scenes` changes); a new scene is named in a tile; no folders are offered', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p, 'Longform demo');
		await shot(p, 'longform');
		const LF = 'Longform demo/';
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Return.md']), 'the scenes, in order');
		t.eq((await sideways(p)).out.length, 0, 'nothing sticks out');
		const n = await p.at(`${LEAF} .binders-new-button`);
		await tap(p, n.x, n.y);
		t.eq(j(await menuItems(p)), j(['New note']), '“New” offers a note only');
		await gone(p);
		await moreMenu(p);
		t.ok(!(await menuItems(p)).includes('Show subfolders as stacks'), 'and no stacks');
		await gone(p);
		await cardMenu(p, 'Harbor.md', LF);
		const items = await menuItems(p);
		say('longform sheet', j(items));
		t.ok(!items.includes('Put in a new folder') && items.includes('Duplicate') && items.includes('Rename'), 'a scene’s sheet has no folders');
		await gone(p);
		// Return to before Island (both in the middle of the screen: near its foot the board would scroll under the card)
		await see(p, card(LF + 'Island.md'));
		const a = await p.at(card(LF + 'Return.md')), isl = await p.at(card(LF + 'Island.md'));
		await pressAndMove(p, a.x, a.t + a.h - 14, a.x, isl.t + 8, 14);
		await shot(p, 'longform-drag');
		const mid = await dragState(p);
		say('longform drag', j(mid));
		t.ok(mid.ghost === 1 && mid.line, 'the card is carried, with a line where it will go: ' + j(mid));
		await touch(p, 'touchEnd');
		await p.sleep(1200);
		await flush(p);
		const idx = await read(p, LF + 'Index.md');
		say(idx.split('---')[1]);
		t.ok(/scenes:\n\s+- Harbor\n\s+- - Ticket office\n\s+- The crossing\n\s+- Return\n\s+- Island\n/.test(idx), 'Return is before Island in `longform.scenes`, the indents as they were: ' + idx.split('scenes:')[1].split('ignoredFiles')[0]);
		// a new scene, in the last tile
		await scrollTo(p, 'end');
		const all = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card-new')].map(${R})`), r = all[all.length - 1];
		await tap(p, r[0] + r[2] / 2, r[1] + r[3] / 2);
		t.eq((await active(p)).tag, 'INPUT', 'the tile opens');
		await p.type('Coda');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(LF + 'Coda.md')})`);
		await p.key('Escape');
		await p.sleep(600);
		await flush(p);
		t.ok(/- Island\n\s+- Coda\n/.test(await read(p, LF + 'Index.md')), 'the new scene is the project’s last');
		await shot(p, 'longform-after');
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (path !== 'Longform demo/Index.md') t.eq(after[path], text, `“${path}” is unchanged`);
	t.eq(after['Longform demo/Index.md'].split('---\n').pop(), before['Longform demo/Index.md'].split('---\n').pop(), 'the index note’s text is unchanged');
});

// =====================================================================================================================
// What a finger meets: focus rings, placeholders, tap targets, swipes
// =====================================================================================================================

const TOGGLE = { x: 34, y: 81 }; // the drawer's button, top left of a phone's screen
const explorerRow = (path) => `.nav-files-container .tree-item-self[data-path="${path}"]`;

test('a binder opened by a tap in the file explorer shows no keyboard focus ring on its first card, nor after the mode is switched by touch', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await tap(p, TOGGLE.x, TOGGLE.y);
		await p.sleep(800);
		const row = await p.at(explorerRow('The Lighthouse'));
		t.ok(row, 'the binder is in the drawer');
		await tap(p, row.x, row.y);
		await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`);
		await p.sleep(900);
		await shot(p, 'bug-focus-ring-on-open');
		const first = await p.ev(`(() => { const c = document.querySelector('${LEAF} .binders-card[data-path]'); return { active: document.activeElement === c, ring: c.matches(':focus-visible'), selected: c.classList.contains('is-selected'), shadow: getComputedStyle(c).boxShadow.slice(0, 60) }; })()`);
		t.ok(!first.ring, 'the first card has no focus ring after a tap opened the board: ' + j(first));
		// and after a tap on the mode button's sheet (to the outliner and back)
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y); await menuTap(p, 'Outliner'); await p.sleep(500);
		await tap(p, b.x, b.y); await menuTap(p, 'Corkboard'); await p.sleep(700);
		const again = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].filter(c => c.matches(':focus-visible')).length`);
		t.eq(again, 0, 'nor after the mode is switched by touch');
	});
});

ux('what a tap opens is a finger tall: a card’s title (the only part of a card that opens its note) is 21 px, a stack’s name (the only part that opens its folder) the same, a breadcrumb 23 px; a card in a base opens wherever it’s tapped', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		// a base's card, for what Obsidian does: a tap anywhere on it opens the note
		await p.ev(`(async () => { await app.vault.create('Scenes.base', 'views:\\n  - type: cards\\n    name: Cards\\n'); await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Scenes.base')); })().then(() => 1)`);
		const got = await until(p, `!!document.querySelector('${LEAF} .bases-cards-item')`, 6000);
		let native = null;
		if (got) {
			await p.sleep(500);
			await shot(p, 'ux-native-base-cards');
			const c = await p.at(`${LEAF} .bases-cards-item`);
			await tap(p, c.x, c.t + c.h - 10);
			await p.sleep(700);
			native = { card: [Math.round(c.w), Math.round(c.h)], opened: await p.ev(`app.workspace.getMostRecentLeaf()?.view.getViewType()`) };
			say('native base card', j(native));
		}
		await p.ev(`(async () => { const b = app.vault.getAbstractFileByPath('Scenes.base'); if (b) await app.vault.delete(b); })().then(() => 1)`);
		await open(p, L + 'Part One');
		const tg = await targets(p);
		await open(p);
		const tg2 = await targets(p);
		t.ok(tg.head.h >= 40 && tg2.stack.h >= 40 && tg.crumb.h >= 40, `a card’s title is ${tg.head.h} px tall, a stack’s name ${tg2.stack.h} px, a breadcrumb ${tg.crumb.h} px (Obsidian’s own base: ${j(native)})`);
	});
});

test('swipes that start on a title, a folder card’s name or the names on it, a synopsis, the “New note” tile or the binder’s synopsis scroll the board and open nothing; a double tap on a card’s foot opens its note', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		// enough notes that the board scrolls a long way
		await p.ev(`(async () => { for (let i = 1; i <= 6; i++) await ${B}.newScene(app.vault.getAbstractFileByPath('The Lighthouse'), Infinity, 'Extra ' + i); await ${B}.flush(); })().then(() => 1)`);
		await open(p);
		const nav = await navbarTop(p);
		/** A swipe up the screen from that thing, the board at its start (or, `low`: scrolled until that thing's top 50 px show above the navigation bar). */
		const from = async (sel, what, low = false) => {
			await scrollTo(p, 0);
			if (low) { await p.ev(`(() => { const s = ${CORK}, c = document.querySelector(${j(sel)}); s.scrollTop += c.getBoundingClientRect().top - (${nav} - 50); return 1; })()`); await p.sleep(400); }
			const at = await p.at(sel), was = await p.ev(`Math.round(${CORK}.scrollTop)`);
			if (!at) throw new Error('nothing at ' + sel);
			const y = low ? at.t + 25 : at.y;
			// (what's at the board's top has no board above it to swipe over: the finger goes on up over the toolbar)
			await swipe(p, at.l + 30, y, at.l + 30, Math.max(y < 400 ? 20 : 170, y - 250));
			const s = { scroll: await p.ev(`Math.round(${CORK}.scrollTop)`) - was, file: await p.ev(`app.workspace.getActiveFile()?.path ?? null`), folder: (await viewState(p))?.folder, field: await p.ev(`document.querySelectorAll('${LEAF} .binders-edit-field').length`), menus: await menus(p) };
			t.ok(s.scroll > 30 && s.file == null && s.folder === 'The Lighthouse' && s.field === 0 && s.menus === 0, `a swipe from ${what} scrolls and opens nothing: ${j(s)}`);
		};
		await from(card(L + 'Part Two') + ' .binders-card-title', 'a stack’s name');
		// (a folder's card with no synopsis has no line for one since 0.12.17: it names what the folder holds there)
		await from(card(L + 'Part Two') + ' .binders-card-held', 'the names on a folder’s card');
		await from(card(L + 'Epilogue.md') + ' .binders-card-title', 'a card’s title');
		await from(`${LEAF} .binders-card-new`, 'the “New note” tile', true);
		await from(`${LEAF} .binders-view-synopsis`, 'the binder’s synopsis');
		// a selected card's synopsis: a swipe from it doesn't edit it; nor one from the names on a selected folder's card
		for (const [path, part, what] of [['Epilogue.md', '.binders-card-synopsis', 'a selected card’s synopsis'], ['Part Two', '.binders-card-held', 'the names on a selected folder’s card']]) {
			await scrollTo(p, 0);
			const f = await foot(p, path);
			await tap(p, f.x, f.y);
			await p.sleep(600);
			await from(card(L + path) + ' ' + part, what);
		}
		// nor one from a folder's synopsis, once it has one (selected, as a tap on it would then edit it)
		await p.ev(`(async () => { const f = await ${B}.ensureFolderNote(app.vault.getAbstractFileByPath(${j(L + 'Part Two')})); await app.fileManager.processFrontMatter(f, fm => { fm.synopsis = 'The wreck, and the light going out.'; }); })().then(() => 1)`);
		await until(p, `document.querySelector(${j(card(L + 'Part Two') + ' .binders-card-synopsis')})?.textContent === 'The wreck, and the light going out.'`);
		await scrollTo(p, 0);
		await from(card(L + 'Part Two') + ' .binders-card-synopsis', 'a selected folder card’s synopsis');
		// a double tap
		await scrollTo(p, 0);
		const k = await foot(p, 'Epilogue.md');
		await touch(p, 'touchStart', k.x, k.y); await p.sleep(30); await touch(p, 'touchEnd'); await p.sleep(90);
		await touch(p, 'touchStart', k.x, k.y); await p.sleep(30); await touch(p, 'touchEnd'); await p.sleep(700);
		say('after double tap', await p.ev(`app.workspace.getActiveFile()?.path ?? null`));
	});
});

// =====================================================================================================================
// Names that can't be used, with no Escape key
// =====================================================================================================================

ux('a rename that can’t be used can be given up by touch (a name with “/” or one that exists keeps its field, as it should; but a tap elsewhere puts the focus back in it every time, and a phone has no Escape: the only way out is to clear the field or type a good name)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await cardMenu(p, 'Part One/Arrival.md');
		await menuTap(p, 'Rename');
		await p.sleep(400);
		await p.type('The keeper');
		await p.key('Enter');
		await p.sleep(700);
		const refused = await p.ev(`({ notice: [...document.querySelectorAll('.notice')].map(n => n.textContent).join(' | '), tag: document.activeElement.tagName, value: document.activeElement.value ?? null })`);
		await shot(p, 'ux-rename-refused');
		t.eq(j([refused.tag, refused.value]), j(['INPUT', 'The keeper']), 'a name already taken is refused, and stays in the field: ' + refused.notice);
		t.ok(/already exists/.test(refused.notice), 'with why: ' + refused.notice);
		// a tap elsewhere, twice
		const pr = await foot(p, 'Part One/Storm warning.md');
		await tap(p, pr.x, pr.y);
		await p.sleep(500);
		await tap(p, pr.x, pr.y);
		await p.sleep(500);
		const after = await p.ev(`({ tag: document.activeElement.tagName, value: document.activeElement.value ?? null, fields: document.querySelectorAll('${LEAF} .binders-edit-field').length })`);
		say('after taps elsewhere', j(after), j(await selected(p)));
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})`), 'the note keeps its name meanwhile');
		t.ok(after.fields === 0 || await p.ev(`!!document.querySelector('${LEAF} .binders-card .is-invalid ~ [aria-label="Cancel"], ${LEAF} .binders-card [aria-label="Cancel"]')`), `after two taps elsewhere the field is still open with the keyboard on it (${j(after)}), and there’s nothing to tap to give up`);
	});
});

// =====================================================================================================================
// A synopsis of several lines; the keyboard's Enter key
// =====================================================================================================================

test('a synopsis of several lines (Enter is a new line on a phone’s keyboard) is kept line for line, shows as lines on the card, and comes back whole into the field', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await cardMenu(p, 'Part One/Arrival.md');
		await menuTap(p, 'Edit synopsis');
		await p.sleep(400);
		await p.ev(`(() => { document.activeElement.select(); return 1; })()`);
		await p.type('Mara arrives.');
		await p.key('Enter');
		await p.type('“Nobody” meets her: a colon, a #hash, a - dash.');
		await p.key('Enter');
		await p.key('Enter');
		await p.type('  Then the keeper.  ');
		const grow = await active(p);
		await shot(p, 'synopsis-lines-editing');
		t.ok(grow.bottom - grow.top >= 80, 'the field grows with its lines: ' + j([grow.top, grow.bottom]));
		const pr = await foot(p, 'Part One/Storm warning.md');
		await tap(p, pr.x, pr.y);
		await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
		await flush(p);
		await p.sleep(500);
		const want = 'Mara arrives.\n“Nobody” meets her: a colon, a #hash, a - dash.\n\n  Then the keeper.';
		t.eq(await p.ev(`app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})).frontmatter.synopsis`), want, 'the synopsis is kept line for line');
		await shot(p, 'synopsis-lines');
		const shown = await p.ev(`(() => { const e = document.querySelector(${j(card(L + 'Part One/Arrival.md'))} + ' .binders-card-synopsis'); return { text: e.textContent, h: Math.round(e.getBoundingClientRect().height) }; })()`);
		t.eq(shown.text, want, 'the card shows it');
		t.ok(shown.h >= 80, 'on its lines: ' + shown.h + ' px');
		// back into the field
		const a = await foot(p, 'Part One/Arrival.md');
		await tap(p, a.x, a.y);
		const syn = await p.at(card(L + 'Part One/Arrival.md') + ' .binders-card-synopsis');
		await tap(p, syn.x, syn.y);
		t.eq(await p.ev(`document.activeElement.value`), want, 'and the field has it whole again');
		await tap(p, pr.x, pr.y);
		await p.sleep(500);
	});
	const after = await texts(p);
	t.eq(after[L + 'Part One/Arrival.md'].split('---\n').pop(), before[L + 'Part One/Arrival.md'].split('---\n').pop(), 'the note’s text is unchanged');
});

ux('a title’s field asks the keyboard for a “Done” key, as the “New note” tile’s does (a card’s title and a folder’s name get the keyboard’s default return key)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await cardMenu(p, 'Prologue.md');
		await menuTap(p, 'Rename');
		await p.sleep(400);
		const title = await p.ev(`document.activeElement.getAttribute('enterkeyhint')`);
		await p.key('Escape');
		await p.sleep(300);
		await stackMenu(p, L + 'Part One');
		await menuTap(p, 'Rename');
		await p.sleep(400);
		const folder = await p.ev(`document.activeElement.getAttribute('enterkeyhint')`);
		await p.key('Escape');
		t.eq(j([title, folder]), j(['done', 'done']), 'enterkeyhint of a card’s title field and a stack’s');
	});
});

// =====================================================================================================================
// Statuses, labels, the filter, undo
// =====================================================================================================================

test('statuses and labels by touch: “New status...”, “No status”, a label, “No label” and “Edit labels...” (which opens Binders’ settings) each work and leave no sheet', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const A = 'Part One/Arrival.md';
		const pick = async (...titles) => { await cardMenu(p, A); for (const x of titles) { if (!(await menuTap(p, x))) throw new Error(`no “${x}”: ` + j(await menuItems(p))); await p.sleep(350); } await p.sleep(400); };
		await pick('Set status', 'New status...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		let d = await dialog(p);
		t.eq(j([d.title, d.menus, d.focus]), j(['New status', 0, 'INPUT']), 'the dialog, its field focused, no sheet over it');
		await p.type('Proofread by the editor in chief');
		await p.key('Enter');
		await p.sleep(600);
		await flush(p);
		t.eq(await prop(p, L + A, 'status'), 'Proofread by the editor in chief', 'Enter in the dialog sets the new status');
		await shot(p, 'status-long');
		const chip = await p.ev(`(() => { const c = document.querySelector(${j(card(L + A))}), ch = c.querySelector('.binders-chip'), w = c.querySelector('.binders-card-words'); return { chip: (${R})(ch), cut: ch.scrollWidth - ch.clientWidth, words: (${R})(w), wordsCut: w.scrollWidth - w.clientWidth, card: (${R})(c) }; })()`);
		say('long status', j(chip));
		t.ok(chip.chip[0] + chip.chip[2] <= chip.words[0] + 1, 'a long status doesn’t run over the word count');
		await cardMenu(p, A);
		await menuTap(p, 'Set status');
		await p.sleep(300);
		await shot(p, 'status-sheet-with-custom');
		t.ok((await menuItems(p)).includes('Proofread by the editor in chief'), 'the new status is offered from then on');
		t.ok(await menuTap(p, 'No status'), 'No status');
		await p.sleep(600);
		await flush(p);
		t.eq(await prop(p, L + A, 'status'), null, '“No status” takes it away');
		t.eq(await menus(p), 0, 'and closes the sheet');
		await pick('Set label', 'Purple');
		await flush(p);
		t.eq(await prop(p, L + A, 'label'), 'Purple', 'a label is set');
		t.ok(await p.ev(`document.querySelector(${j(card(L + A))}).classList.contains('has-label')`), 'and the card takes its color');
		await shot(p, 'label-purple');
		await pick('Set label', 'No label');
		await flush(p);
		t.eq(await prop(p, L + A, 'label'), null, '“No label” takes it away');
		await pick('Set label', 'Edit labels...');
		await until(p, `app.setting.activeTab?.id === 'binders'`, 4000);
		await p.sleep(500);
		await shot(p, 'edit-labels-settings');
		t.eq(await p.ev(`app.setting.activeTab?.id ?? null`), 'binders', '“Edit labels...” opens Binders’ settings');
		t.eq(await menus(p), 0, 'with no sheet over them');
	});
});

test('the filter by touch: only matching cards show, stacks count “1 of 3 notes”, a note made meanwhile stays in sight, a folder where nothing matches says so, and “Clear filter” brings everything back', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await fm(p, L + 'Epilogue.md', { label: 'Red' });
		await open(p);
		const names = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`);
		const counts = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-stack .binders-card-words')].map(e => e.textContent)`);
		const f = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, f.x, f.y);
		await shot(p, 'filter-sheet');
		const s = await sheet(p);
		t.ok(isSheet(s) && s.itemHeights.every((x) => x >= 40), 'the filter is a sheet with rows a finger tall');
		t.ok(await menuTap(p, 'Idea'), 'Idea');
		await p.sleep(600);
		t.ok(await menus(p) > 0, 'the sheet stays open, for another value');
		await gone(p);
		await shot(p, 'filter-idea');
		t.eq(j(await names()), j(['Part One', 'Part Two', 'Epilogue.md']), 'of the binder’s notes only the idea shows, beside the folders’ stacks');
		t.eq((await sideways(p)).out.length, 0, 'nothing sticks out');
		// a note made under the filter stays
		const tile = await p.at(`${LEAF} .binders-card-new`);
		await tap(p, tile.x, tile.y);
		await p.type('Made under a filter');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Made under a filter.md')})`);
		await p.key('Escape');
		await p.sleep(600);
		t.ok((await names()).includes('Made under a filter.md'), 'a note made under the filter stays in sight');
		// inside a folder: its ideas
		await open(p, L + 'Part One');
		t.eq(j(await names()), j(['Storm warning.md']), 'inside a folder, its one idea (the filter came along)');
		await open(p);
		// (on a board drawn with the filter on; that a stack follows a filter set while it shows is the BUG test below)
		t.eq(j(await counts()), j(['1 of 3 notes · 16 words', '1 of 2 notes · 11 words']), 'the stacks count what would show in them');
		// a second value: Red and Idea is Epilogue alone
		await tap(p, f.x, f.y);
		t.ok(await menuTap(p, 'Red'), 'Red');
		await p.sleep(700);
		await gone(p);
		t.eq(j(await names()), j(['Part One', 'Part Two', 'Epilogue.md']), 'a status and a label together (the note made before the filter changed is held to it now)');
		// a folder where nothing matches says so
		await open(p, L + 'Part One');
		await shot(p, 'filter-nothing');
		const none = await p.ev(`({ text: document.querySelector('${LEAF} .binders-empty')?.innerText ?? null, cards: document.querySelectorAll('${LEAF} .binders-card[data-path]').length, button: document.querySelector('${LEAF} .binders-filter-button').classList.contains('is-active') })`);
		say('nothing matches', j(none));
		t.ok(/No notes match the filter/.test(none.text ?? '') && none.cards === 0, 'a folder none of whose notes pass says so: ' + j(none));
		const f2 = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, f2.x, f2.y);
		t.ok(await menuTap(p, 'Clear filter'), 'Clear filter');
		await p.sleep(700);
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card[data-path]').length`), 3, 'everything is back');
		t.eq(await menus(p), 0, 'and the sheet is closed');
	});
});

bug7('a filter set (or changed, or cleared) while the board shows: each folder’s stack says how many of its notes pass, “1 of 3 notes” (it keeps the count it was drawn with until the board is made again)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const counts = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-stack .binders-card-words')].map(e => e.textContent)`);
		t.eq(j(await counts()), j(['3 notes · 51 words', '2 notes · 28 words']), 'with no filter: every note');
		const f = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, f.x, f.y);
		t.ok(await menuTap(p, 'Idea'), 'Idea');
		await p.sleep(600);
		await gone(p);
		await p.sleep(600);
		const stale = await counts();
		// (what a board drawn with the filter on says)
		await open(p, L + 'Part One');
		await open(p);
		t.eq(j(await counts()), j(['1 of 3 notes · 16 words', '1 of 2 notes · 11 words']), 'a board drawn with the filter on counts the ideas');
		t.eq(j(stale), j(['1 of 3 notes · 16 words', '1 of 2 notes · 11 words']), 'and so do the stacks that were showing when the filter was set');
		// and cleared
		await tap(p, f.x, f.y);
		t.ok(await menuTap(p, 'Clear filter'), 'Clear filter');
		await p.sleep(900);
		await gone(p);
		t.eq(j(await counts()), j(['3 notes · 51 words', '2 notes · 28 words']), 'the filter cleared, every note again');
	});
});

test('a drop made by touch is taken back with “Undo last move” from the command palette, and made again with “Redo last move”', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const order = await contents(p);
		// Prologue, onto Part One's stack
		const a = await foot(p, 'Prologue.md'), s1 = await p.at(card(L + 'Part One'));
		await pressAndMove(p, a.x, a.y, s1.x, s1.y, 12);
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Prologue.md')})`);
		await p.sleep(700);
		await flush(p);
		const run = async (name) => {
			await p.ev(`app.commands.executeCommandById('command-palette:open')`);
			await until(p, `!!document.querySelector('.prompt input')`);
			await p.type(name);
			await p.sleep(500);
			const first = await p.at('.prompt .suggestion-item');
			const text = await p.ev(`document.querySelector('.prompt .suggestion-item')?.textContent ?? ''`);
			if (!text.includes(name)) { await p.key('Escape'); throw new Error(`“${name}” isn’t offered: ${text}`); }
			await tap(p, first.x, first.y);
			await p.sleep(900);
		};
		await run('Undo last move');
		await flush(p);
		t.eq(j(await contents(p)), j(order), '“Undo last move” puts the note back in its folder, in its place');
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')})`), 'the file too');
		await run('Redo last move');
		await flush(p);
		t.eq((await contents(p))[4], 'Part One/Prologue', '“Redo last move” makes the move again');
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Prologue.md')})`), 'the file too');
		// and from the view's own menu, where a phone has it (the notice that says what was redone lies over the button)
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		await p.sleep(200);
		await moreMenu(p);
		const items = await menuItems(p);
		const undo = items.find((x) => /^Undo: /.test(x));
		t.ok(undo, '“More options” has an “Undo: …” for it: ' + j(items));
		t.ok(await menuTap(p, undo), undo);
		await p.sleep(900);
		await flush(p);
		t.eq(j(await contents(p)), j(order), 'which takes the move back');
	});
});

// =====================================================================================================================
// Looks: long names, right-to-left names, large text, dark, an interface that reads from the right
// =====================================================================================================================

const LONG = 'The night the lamp went out and nobody on the island was in the least surprised by it at all';
const UNBROKEN = 'Supercalifragilisticexpialidocious' + 'Antidisestablishmentarianism' + 'Pneumonoultramicroscopic';
/** Notes and a folder with awkward names, a long status, a custom color and a target, added to The Lighthouse. */
const awkward = (p) => p.ev(`(async () => {
	const L = ${j(L)}, v = { create: async (path, text) => { if (!app.vault.getAbstractFileByPath(path)) await app.vault.create(path, text); }, createFolder: async (path) => { if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path); } };
	await v.create(L + ${j(LONG)} + '.md', '---\\nstatus: Waiting for the second reader’s notes\\nlabel: "#d97706"\\ntarget: 120000\\nsynopsis: ' + ${j(UNBROKEN + UNBROKEN)} + '\\n---\\nOne two three.\\n');
	await v.create(L + ${j(UNBROKEN)} + '.md', '---\\nstatus: ${UNBROKEN}\\nlabel: Blue\\n---\\nOne.\\n');
	await v.create(L + 'פרק ראשון.md', '---\\nsynopsis: מרה מגיעה לאי עם סירת האספקה, ואיש אינו מחכה לה על המזח.\\nstatus: Draft\\n---\\nשלום.\\n');
	await v.create(L + 'الفصل الثاني.md', '---\\nsynopsis: تصل مارا إلى الجزيرة.\\nlabel: Green\\n---\\nمرحبا.\\n');
	await v.createFolder(L + ${j(LONG + ' folder')});
	await v.create(L + ${j(LONG + ' folder')} + '/Inside.md', '---\\nsynopsis: In the long folder.\\n---\\nText.\\n');
	await new Promise(r => setTimeout(r, 400));
})().then(() => 1)`);
/** Text on the board that's cut without an ellipsis to say so, or runs out of its card. */
const clipped = (p) => p.ev(`(() => { const out = []; for (const c of document.querySelectorAll('${LEAF} .binders-card, ${LEAF} .binders-group-heading, ${LEAF} .binders-toolbar')) { const cr = c.getBoundingClientRect(); for (const e of c.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue; if (r.right > cr.right + 5 || r.left < cr.left - 5) out.push('out of its box: ' + e.className + ' ' + Math.round(r.left) + '–' + Math.round(r.right) + ' in ' + Math.round(cr.left) + '–' + Math.round(cr.right)); const s = getComputedStyle(e); if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && s.textOverflow !== 'ellipsis' && s.overflow !== 'visible' && !s.webkitLineClamp) out.push('cut with no ellipsis: ' + e.className); } } return out.slice(0, 8); })()`);

test('awkward names (very long, unbroken, Hebrew, Arabic), a long status, a big target: at 320, 390 and 430 px nothing runs out of its card or the screen, in light and dark, with text at 16 and 24 px', async (p, h, t) => {
	const heads = [];
	for (const theme of ['light', 'dark']) {
		await awkward(p);
		await onDevice(p, PHONE, async () => {
			await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('The Lighthouse'))?.length === 12`, 8000);
			for (const font of [16, 24]) {
				await p.ev(`(() => { app.vault.setConfig('baseFontSize', ${font}); app.updateFontSize?.(); return 1; })()`);
				await p.sleep(700);
				for (const size of [SMALL, PHONE, BIG, side(PHONE)]) {
					const name = `${theme}-${font}-${size.join('x')}`;
					await metrics(p, ...size);
					await p.sleep(600);
					await open(p);
					await setOptions(p, { numbers: true });
					for (const [i, y] of [0, 420, 'end'].entries()) { await scrollTo(p, y); await shot(p, `look-${name}-${i}`); }
					const s = await sideways(p), c = await clipped(p);
					t.ok(s.view <= 0 && s.board <= 0 && s.out.length === 0, `${name}: nothing sticks out sideways: ${j(s)}`);
					t.eq(j(c), '[]', `${name}: nothing runs out of its card or is cut without an ellipsis`);
					// inside the folder with the long name too (its name is the way up, in the toolbar)
					await open(p, L + LONG + ' folder');
					await shot(p, `look-${name}-in-folder`);
					const s2 = await sideways(p);
					t.ok(s2.view <= 0 && s2.board <= 0 && s2.out.length === 0, `${name}, inside the long folder: nothing sticks out sideways: ${j(s2)}`);
				}
			}
			// the long folder's stack: its name gives way, its count is still readable
			await metrics(p, ...PHONE);
			await p.ev(`(() => { app.vault.setConfig('baseFontSize', 16); app.updateFontSize?.(); return 1; })()`);
			await p.sleep(700);
			await open(p);
			const head = await stack(p, L + LONG + ' folder');
			say('long stack', j(head));
			t.ok(head && head.nameCut > 0 && head.nameW >= 120, 'a long folder name is cut with an ellipsis, most of it still showing: ' + j(head));
			t.ok(head.count === '1 note · 1 word' && head.countCut <= 0, 'and its count is whole: ' + j(head));
			heads.push(head);
		}, theme);
	}
});

test('an interface that reads from the right (Obsidian in Arabic or Hebrew): the board mirrors, nothing sticks out, and a drag still lands where the line was', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(() => { document.body.classList.add('mod-rtl'); document.documentElement.dir = 'rtl'; return 1; })()`);
		await open(p);
		await setOptions(p, { numbers: true });
		await shot(p, 'rtl-board');
		let s = await sideways(p);
		t.ok(s.view <= 0 && s.board <= 0 && s.out.length === 0, 'nothing sticks out sideways: ' + j(s));
		const icon = await p.ev(`(() => { const c = document.querySelector(${j(STACK(L + 'Part One'))}), i = c.querySelector('.binders-card-icon').getBoundingClientRect(), n = c.querySelector('.binders-card-title').getBoundingClientRect(); return { icon: Math.round(i.left), name: Math.round(n.left) }; })()`);
		t.ok(icon.icon > icon.name, 'a stack’s folder icon is on the right of its name: ' + j(icon));
		await open(p, L + 'Part One');
		await shot(p, 'rtl-folder');
		s = await sideways(p);
		t.ok(s.view <= 0 && s.board <= 0 && s.out.length === 0, 'nor inside a folder: ' + j(s));
		const a = await foot(p, 'Part One/Arrival.md'), k = await p.at(card(L + 'Part One/The keeper.md'));
		await pressAndMove(p, a.x, a.y, a.x, k.t + k.h - 6, 12);
		await shot(p, 'rtl-drag');
		t.ok((await dragState(p)).line, 'a line shows');
		await touch(p, 'touchEnd');
		await p.sleep(900);
		await flush(p);
		t.eq(j((await contents(p)).slice(2, 4)), j(['Part One/The keeper', 'Part One/Arrival']), 'the drop lands after The keeper');
		await p.ev(`(() => { document.body.classList.remove('mod-rtl'); document.documentElement.dir = ''; return 1; })()`);
	});
});

test('dark: the board, a selected card, a tinted label, a card’s sheet and a carried card are all drawn (screenshots), and a selected card differs from its neighbours', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await fm(p, L + 'Prologue.md', { label: 'Red', target: 500 });
		await fm(p, L + 'Part One/The keeper.md', { label: '#22d3ee' });
		await open(p);
		await shot(p, 'dark-binder');
		await open(p, L + 'Part One');
		const f = await foot(p, 'Part One/Arrival.md');
		await tap(p, f.x, f.y);
		await shot(p, 'dark-board');
		const look = await p.ev(`(() => { const s = (path) => { const c = getComputedStyle(document.querySelector('${LEAF} .binders-card[data-path="' + path + '"]')); return c.boxShadow + ' | ' + c.backgroundColor; }; return { selected: s(${j(L + 'Part One/Arrival.md')}), plain: s(${j(L + 'Part One/Storm warning.md')}) }; })()`);
		t.ok(look.selected !== look.plain, 'a selected card looks unlike a plain one: ' + j(look));
		await cardMenu(p, 'Part One/Arrival.md');
		await shot(p, 'dark-sheet');
		await menuTap(p, 'Set label');
		await p.sleep(300);
		await shot(p, 'dark-labels');
		await gone(p);
		const a = await foot(p, 'Part One/Arrival.md'), k = await p.at(card(L + 'Part One/Storm warning.md'));
		await pressAndMove(p, a.x, a.y, a.x, k.t + 20, 12);
		await shot(p, 'dark-drag');
		await touch(p, 'touchCancel');
		await p.sleep(500);
		await open(p);
		await setOptions(p, { numbers: true, cardSize: 'small' });
		await shot(p, 'dark-stacks-small');
		await setOptions(p, { cardSize: 'large', labelStyle: 'stripe' });
		await shot(p, 'dark-large-untinted');
	}, 'dark');
});

ux('on a phone the line that shows where a carried card will land can be seen: it’s drawn over the carried card, which is as wide as the column and seen through (it was drawn under the card, all of it)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const pr = await foot(p, 'Part One/Arrival.md'), k = await p.at(card(L + 'Part One/Storm warning.md'));
		await pressAndMove(p, pr.x, pr.y, pr.x, k.t + 10, 14);
		await shot(p, 'ux-line-under-card');
		const s = await p.ev(`(() => { const R = ${R}; const g = document.querySelector('.binders-drag-ghost > .binders-card'), l = document.querySelector('.binders-drop-indicator.is-active'); if (!g || !l) return null; const a = g.getBoundingClientRect(), b = l.getBoundingClientRect(); const hidden = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * (b.top >= a.top && b.bottom <= a.bottom ? 1 : 0); return { ghost: R(g), line: R(l), opacity: getComputedStyle(g).opacity, covered: Math.round(100 * hidden / b.width), lineZ: getComputedStyle(l).zIndex, ghostZ: getComputedStyle(g.parentElement).zIndex }; })()`);
		await touch(p, 'touchCancel');
		await p.sleep(400);
		t.ok(s, 'a card is carried, with a line');
		t.ok(s.covered < 50 || Number(s.lineZ) > Number(s.ghostZ), `the line is clear of the carried card, or drawn over it (${s.covered}% of it is within the card, whose opacity is ${s.opacity}): ${j(s)}`);
	});
});

// =====================================================================================================================
// A big binder
// =====================================================================================================================

// (the board shows one folder at a time: the 600 notes are in one, the binder's own, so they're all cards on its board)
const SAGA = 'Saga', PARTS = 10, PER = 60;
const makeSaga = (p) => p.ev(`(async () => {
	const words = 'the keeper climbed the stair again while the sea kept on at the rocks below and nobody came '.repeat(12);
	const statuses = ['Draft', 'Revised', 'Done'], labels = ['Red', 'Blue', 'Green', ''];
	await app.vault.createFolder(${j(SAGA)});
	const contents = [];
	for (let n = 1; n <= ${PARTS * PER}; n++) {
		const name = 'Scene ' + String(n).padStart(4, '0');
		const fm = ['synopsis: Scene ' + n + ', in which something happens on the island and the light goes out again.', 'status: ' + statuses[n % 3], labels[n % 4] ? 'label: ' + labels[n % 4] : ''].filter(Boolean).join('\\n');
		await app.vault.create(${j(SAGA)} + '/' + name + '.md', '---\\n' + fm + '\\n---\\n' + words + '\\n');
		contents.push(name);
	}
	await app.vault.create(${j(SAGA + '/' + SAGA + '.md')}, '---\\nbinder: 1\\ncontents:\\n' + contents.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
})().then(() => 1)`);
const sagaReady = `${B}.scenes(app.vault.getAbstractFileByPath(${j(SAGA)}) ?? app.vault.getRoot())?.length === ${PARTS * PER} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Saga/')).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`;
const frames = (p, ms) => p.ev(`(() => { const fr = window.__qa5f = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); fr.push(n - last); last = n; if (n - t0 < ${ms}) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
const frameStats = (p) => p.ev(`(() => { const f = window.__qa5f.slice(1).sort((a, b) => a - b); return { frames: f.length, median: Math.round(f[f.length >> 1]), p95: Math.round(f[Math.floor(f.length * 0.95)]), worst: Math.round(f[f.length - 1]) }; })()`);

test('a binder of 600 notes on a phone, CPU four times slower: it opens in under 3 s, swipes scroll smoothly, a tap selects and a long press opens the sheet at once, and a card carried to the top edge scrolls and drops where the line is', async (p, h, t) => {
	await makeSaga(p);
	t.ok(await until(p, sagaReady, 90000), 'the big binder is made');
	const out = {};
	await onDevice(p, PHONE, async () => {
		t.ok(await until(p, sagaReady, 90000), 'and found again on the phone');
		await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		out.opens = await p.ev(`(async () => { const t = performance.now(); await ${PL}.openBinder(app.vault.getAbstractFileByPath(${j(SAGA)})); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); })()`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === ${PARTS * PER}`, 30000);
		await p.sleep(1500);
		await shot(p, 'saga-top');
		t.eq((await sideways(p)).out.length, 0, 'nothing sticks out');
		// swipes
		await frames(p, 2600);
		for (let k = 0; k < 4; k++) { await touch(p, 'touchStart', 200, 650); for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', 200, 650 - i * 35); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(200); }
		await p.sleep(400);
		out.scroll = await frameStats(p);
		t.ok(await p.ev(`${CORK}.scrollTop`) > 1000, 'swipes scroll the board');
		// a tap: how long until the card shows as selected
		const pick = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(e => [e.dataset.path, e.getBoundingClientRect()]).filter(([, r]) => r.top > 220 && r.bottom < 640).map(([path, r]) => ({ path, x: r.left + r.width / 2, y: r.bottom - 14, top: r.top, h: r.height }))[0]`);
		await p.sleep(1500); // (the last swipe's fling has stopped)
		let c = await pick();
		await p.ev(`(() => { window.__qa5t = null; const el = document.querySelector(${j(`${LEAF} .binders-card[data-path="${c.path}"]`)}); const t0 = { v: 0 }; document.addEventListener('touchstart', () => { t0.v = performance.now(); }, { once: true, capture: true }); new MutationObserver((m, o) => { if (el.classList.contains('is-selected')) { window.__qa5t = Math.round(performance.now() - t0.v); o.disconnect(); } }).observe(el, { attributes: true }); return 1; })()`);
		await tap(p, c.x, c.y);
		out.tapToSelect = await p.ev(`window.__qa5t`);
		say('tap', j(c), j(await selected(p)), await p.ev(`Math.round(${CORK}.scrollTop)`), j(await p.ev(`(() => { const e = document.elementFromPoint(${c.x}, ${c.y}); return e ? e.className + ' ' + (e.closest('.binders-card')?.dataset.path ?? '') : null; })()`)));
		t.eq(j(await selected(p)), j([c.path]), 'a tap selects the card');
		// a long press: the sheet
		const t0 = Date.now();
		await hold(p, c.x, c.y);
		t.ok((await menuItems(p)).includes('Rename'), 'a long press opens the sheet');
		await gone(p);
		// a card carried to the top edge: the board scrolls up under it
		const top = (await rect(p, `${LEAF} .binders-corkboard`))[1], from = await p.ev(`${CORK}.scrollTop`);
		c = await pick();
		await touch(p, 'touchStart', c.x, c.y);
		await p.sleep(700);
		await frames(p, 2400);
		for (let i = 1; i <= 10; i++) { await touch(p, 'touchMove', c.x, c.y + (top + 6 - c.y) * i / 10); await p.sleep(20); }
		await p.sleep(2000);
		out.drag = await frameStats(p);
		const to = await p.ev(`${CORK}.scrollTop`);
		out.autoscrollPxPerSecond = Math.round((from - to) / 2.2);
		await shot(p, 'saga-drag-top');
		t.ok(to < from - 300, `held at the top edge for two seconds the board scrolls up (${from} → ${to})`);
		// down a little, onto the board, and dropped
		await moveOn(p, c.x, top + 6, c.x, 420, 6);
		const mid = await dragState(p);
		t.ok(mid.ghost === 1 && mid.line, 'the card is still carried, with a line: ' + j(mid));
		const before = await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath(${j(SAGA)})).map(f => f.basename).indexOf(${j(c.path.split('/').pop().replace('.md', ''))})`);
		const d0 = Date.now();
		await touch(p, 'touchEnd');
		await until(p, `!document.querySelector('.binders-drag-ghost')`, 10000);
		out.drop = Date.now() - d0;
		await p.sleep(800);
		await flush(p);
		const after = await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath(${j(SAGA)})).map(f => f.basename).indexOf(${j(c.path.split('/').pop().replace('.md', ''))})`);
		t.ok(after < before, `the card moved up the order (${before} → ${after})`);
		t.eq(await leftovers(p), 0, 'nothing of the drag is left');
		// "New note" from the toolbar: with nothing selected, in the tile at the binder's end
		await p.ev(`(() => { ${VIEW}.current.select([]); return 1; })()`);
		const n = await p.at(`${LEAF} .binders-new-button`);
		await tap(p, n.x, n.y);
		await menuTap(p, 'New note');
		await p.sleep(900);
		const a = await active(p);
		t.eq(a.tag, 'INPUT', '“New note” opens the last tile');
		t.ok(await p.ev(`${CORK}.scrollTop > ${CORK}.scrollHeight - ${CORK}.clientHeight - 200`), 'at the binder’s end');
		await p.key('Escape');
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	});
	console.log('    qa5 cork speed (ms, CPU ×4, 600 notes): ' + j(out));
	t.ok(out.opens < 3000, `opens in ${out.opens} ms`);
	t.ok(out.scroll.median <= 20 && out.scroll.p95 <= 60, 'scrolling: ' + j(out.scroll));
	t.ok(out.drag.median <= 20 && out.drag.p95 <= 60, 'dragging: ' + j(out.drag));
	t.ok(out.tapToSelect != null && out.tapToSelect < 300, `a tap shows as selected in ${out.tapToSelect} ms`);
	t.ok(out.drop < 3000, `a drop is done in ${out.drop} ms`);
});

ux('a card carried to the edge of a long board gets there: the board scrolls 14 px a frame at most (about 840 px a second), so the far end of a 600-note binder is over a minute away, the finger held still', async (p, h, t) => {
	await makeSaga(p);
	t.ok(await until(p, sagaReady, 90000), 'the big binder is made');
	await onDevice(p, PHONE, async () => {
		t.ok(await until(p, sagaReady, 90000), 'and found again on the phone');
		await open(p, SAGA);
		await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === ${PARTS * PER}`, 30000);
		await p.ev(`(() => { ${CORK}.scrollTop = ${CORK}.scrollHeight / 2; return 1; })()`);
		await p.sleep(800);
		const c = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(e => e.getBoundingClientRect()).filter(r => r.top > 220 && r.bottom < 640).map(r => ({ x: r.left + r.width / 2, y: r.bottom - 14 }))[0]`);
		const top = (await rect(p, `${LEAF} .binders-corkboard`))[1];
		await pressAndMove(p, c.x, c.y, c.x, top + 2, 10);
		const y0 = await p.ev(`${CORK}.scrollTop`), t0 = Date.now();
		await p.sleep(3000);
		const y1 = await p.ev(`${CORK}.scrollTop`), secs = (Date.now() - t0) / 1000, total = await p.ev(`${CORK}.scrollHeight`);
		await touch(p, 'touchCancel');
		await p.sleep(500);
		const speed = (y0 - y1) / secs;
		t.ok(total / 2 / speed <= 15, `held at the top edge the board scrolls ${Math.round(speed)} px a second; from the middle of this board (${Math.round(total)} px tall) to its start is ${Math.round(total / 2 / speed)} s`);
	});
});

// =====================================================================================================================
// A phone on its side
// =====================================================================================================================

test('phone on its side (844 × 390 and 568 × 320): cards are in columns, a tap selects, a long press opens a sheet that fits and scrolls to “Delete”, a card is dragged along its row, a synopsis is edited', async (p, h, t) => {
	await onDevice(p, side(PHONE), async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'still a phone');
		for (const size of [side(PHONE), side(SMALL)]) {
			const name = size.join('x');
			await metrics(p, ...size);
			await p.sleep(600);
			await h.reset();
			await open(p, L + 'Part One');
			const cols = await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-cards')).gridTemplateColumns.trim().split(/\\s+/).length`);
			t.ok(cols >= 2, `${name}: a folder’s cards are in ${cols} columns`);
			// a tap, a long press
			await seeTop(p, card(L + 'Part One/Arrival.md'));
			// (the navigation bar floats over the feet of the middle cards: these are pressed by their middle)
			const mid_ = async (path) => { const c = await p.at(card(L + path)); return { x: c.x, y: c.y + 6 }; };
			let f = await mid_('Part One/Arrival.md');
			await tap(p, f.x, f.y);
			t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), `${name}: a tap selects`);
			await hold(p, f.x, f.y);
			const s = await sheet(p);
			await shot(p, `side-${name}-sheet`);
			say(name, 'sheet', j({ ...s, itemHeights: s.itemHeights.length }));
			t.ok(s && s.top >= 0 && s.bottom <= s.inner[1] && s.left >= 0 && s.left + s.width <= s.inner[0], `${name}: the sheet fits the screen: ${j([s.left, s.top, s.width, s.bottom])}`);
			t.ok(await menuTap(p, 'Move down'), `${name}: “Move down” can be scrolled to and tapped`);
			await p.sleep(700);
			await flush(p);
			t.eq(j((await contents(p)).slice(2, 4)), j(['Part One/The keeper', 'Part One/Arrival']), `${name}: and moves the card`);
			// a drag along the row: Arrival (second now) to before The keeper (first): an upright line
			await seeTop(p, card(L + 'Part One/Arrival.md'));
			f = await mid_('Part One/Arrival.md');
			const k = await p.at(card(L + 'Part One/The keeper.md'));
			await pressAndMove(p, f.x, f.y, k.l + 20, k.y, 12);
			const mid = await dragState(p);
			await shot(p, `side-${name}-drag`);
			say(name, 'drag', j(mid));
			t.eq(mid.ghost, 1, `${name}: a held card, moved, is carried`);
			// (at 568 × 320 the board is 157 px tall, 96 of them its scrolling edges: where the card lands depends on how far it scrolled)
			if (size[1] >= 390) {
				t.ok(mid.line && mid.line[2] <= 3 && mid.line[3] > 30, `${name}: the line is upright, between the cards: ${j(mid.line)}`);
				await touch(p, 'touchEnd');
				await p.sleep(900);
				await flush(p);
				t.eq(j((await contents(p)).slice(2, 4)), j(['Part One/Arrival', 'Part One/The keeper']), `${name}: dropped before The keeper`);
			} else { await touch(p, 'touchCancel'); await p.sleep(600); }
			t.eq(await leftovers(p) + await menus(p), 0, `${name}: nothing left over`);
			// a synopsis, edited
			await seeTop(p, card(L + 'Part One/Arrival.md'));
			f = await mid_('Part One/Arrival.md');
			await tap(p, f.x, f.y);
			const syn = await p.at(card(L + 'Part One/Arrival.md') + ' .binders-card-synopsis');
			await tap(p, syn.x, syn.y);
			const a = await active(p);
			await shot(p, `side-${name}-editing`);
			// (at 568 × 320 Obsidian's navigation bar floats over the middle of the 157 px of board there is)
			if (size[1] >= 390) {
				t.eq(a.tag, 'TEXTAREA', `${name}: a tap on the selected card’s synopsis edits it`);
				t.ok(a.top >= 150 && a.bottom <= a.inner[1], `${name}: the field is on the screen: ${j([a.top, a.bottom])}`);
			}
			await p.key('Escape');
			await p.sleep(300);
		}
	});
});

// =====================================================================================================================
// A tablet
// =====================================================================================================================

test('tablet, upright and on its side: the board is a grid, menus are popovers by the finger, a status is picked from its submenu, a card is dragged along its row and onto another folder’s stack, a title and a synopsis are edited, a folder is named', async (p, h, t) => {
	await onDevice(p, TABLET, async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
		for (const size of [TABLET, side(TABLET)]) {
			const name = size.join('x');
			await metrics(p, ...size);
			await p.sleep(700);
			await h.reset();
			await open(p, L + 'Part One');
			await shot(p, `tablet-${name}`);
			const s = await sideways(p), tg = await targets(p);
			say(name, j(tg));
			t.ok(s.view <= 0 && s.board <= 0 && s.out.length === 0, `${name}: nothing sticks out: ${j(s)}`);
			t.ok(tg.toolbar.h >= 32 && tg.tile.h >= 40, `${name}: buttons and the tile are a finger tall`);
			const cols = await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-cards')).gridTemplateColumns.trim().split(/\\s+/).length`);
			t.ok(cols >= 3, `${name}: ${cols} columns`);
			// a long press: a popover by the finger
			let f = await foot(p, 'Part One/Arrival.md');
			await hold(p, f.x, f.y);
			let m = await sheet(p);
			await shot(p, `tablet-${name}-menu`);
			t.ok(m && !isSheet(m) && m.width < 400 && m.top >= 0 && m.bottom <= m.inner[1], `${name}: a card’s menu is a popover on the screen: ${j([m.left, m.top, m.width, m.bottom])}`);
			t.ok(Math.abs(m.left - f.x) < 320, `${name}: by the finger`);
			t.ok(m.itemHeights.every((x) => x >= 28), `${name}: its rows are as tall as Obsidian’s there: ${Math.min(...m.itemHeights)}`);
			t.ok(await menuTap(p, 'Set status'), 'Set status');
			await p.sleep(400);
			await shot(p, `tablet-${name}-submenu`);
			t.ok(await menuTap(p, 'Done'), 'Done, in the submenu');
			await p.sleep(600);
			await flush(p);
			t.eq(await prop(p, L + 'Part One/Arrival.md', 'status'), 'Done', `${name}: a status is picked`);
			t.eq(await menus(p), 0, `${name}: and both menus close`);
			// a drag along the row
			f = await foot(p, 'Part One/Arrival.md');
			const sw = await p.at(card(L + 'Part One/Storm warning.md'));
			await pressAndMove(p, f.x, f.y, sw.l + sw.w - 20, sw.y, 12);
			let mid = await dragState(p);
			await shot(p, `tablet-${name}-drag`);
			t.ok(mid.ghost === 1 && mid.line && mid.line[2] <= 3, `${name}: an upright line shows where it goes: ${j(mid.line)}`);
			await touch(p, 'touchEnd');
			await p.sleep(900);
			await flush(p);
			t.eq(j((await contents(p)).slice(2, 5)), j(['Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival']), `${name}: dropped at the row’s end`);
			// on the binder's board: Prologue onto Part Two's stack
			await open(p);
			f = await foot(p, 'Prologue.md');
			const w = await p.at(card(L + 'Part Two'));
			await pressAndMove(p, f.x, f.y, w.x, w.y, 14);
			mid = await dragState(p);
			await shot(p, `tablet-${name}-drag-across`);
			t.eq(mid.over, L + 'Part Two', `${name}: the folder it would go into is marked`);
			await touch(p, 'touchEnd');
			await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part Two/Prologue.md')})`);
			await p.sleep(700);
			await flush(p);
			t.eq(j((await contents(p)).slice(4, 8)), j(['Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Prologue']), `${name}: dropped into Part Two, last`);
			t.eq(await leftovers(p) + await menus(p), 0, `${name}: nothing left over`);
			// in Part Two: rename from the popover, a synopsis by a second tap, a new folder from the toolbar
			const name2 = await p.at(card(L + 'Part Two') + ' .binders-card-title');
			await tap(p, name2.l + 20, name2.y);
			await until(p, `${VIEW}.folder?.path === ${j(L + 'Part Two')} && !!document.querySelector(${j(card(L + 'Part Two/Prologue.md'))})`);
			await p.sleep(500);
			t.eq((await viewState(p)).folder, L + 'Part Two', `${name}: a tap on the stack’s name goes into the folder`);
			await hold(p, (await foot(p, 'Part Two/Prologue.md')).x, (await foot(p, 'Part Two/Prologue.md')).y);
			t.ok(await menuTap(p, 'Rename'), 'Rename');
			await p.sleep(400);
			t.eq((await active(p)).tag, 'INPUT', `${name}: the title is a field`);
			await p.type('Landing');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part Two/Landing.md')})`);
			await p.sleep(500);
			const syn = await p.at(card(L + 'Part Two/Landing.md') + ' .binders-card-synopsis');
			await tap(p, syn.x, syn.y);
			t.eq((await active(p)).tag, 'TEXTAREA', `${name}: a tap on the selected card’s synopsis edits it`);
			await p.key('Escape');
			await p.sleep(300);
			const n = await p.at(`${LEAF} .binders-new-button`);
			await tap(p, n.x, n.y);
			m = await sheet(p);
			t.ok(m && !isSheet(m), `${name}: “New” is a popover`);
			t.ok(await menuTap(p, 'New folder'), 'New folder');
			await p.sleep(700);
			const a = await active(p);
			await shot(p, `tablet-${name}-new-folder`);
			t.eq(a.tag, 'INPUT', `${name}: the new folder’s name is a field`);
			t.ok(a.top >= 100 && a.bottom <= a.inner[1], `${name}: in sight: ${j([a.top, a.bottom, a.inner[1]])}`);
			await p.type('Part Three');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part Two/Part Three')})`);
			await p.sleep(500);
			await flush(p);
			t.eq((await contents(p)).filter((x) => x.startsWith('Part Two/')).pop(), 'Part Two/Part Three/', `${name}: made last in the folder shown`);
			await tidy(p);
		}
	});
});

test('tablet with stacks, small and large cards: a card dropped on a stack goes into it; the three sizes give more or fewer columns', async (p, h, t) => {
	await onDevice(p, side(TABLET), async () => {
		await open(p);
		const cols = () => p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-cards')).gridTemplateColumns.trim().split(/\\s+/).length`);
		await setOptions(p, { cardSize: 'small' });
		await shot(p, 'tablet-stacks-small');
		const small = await cols();
		await setOptions(p, { cardSize: 'large' });
		await shot(p, 'tablet-stacks-large');
		const large = await cols();
		await setOptions(p, { cardSize: 'medium' });
		const medium = await cols();
		t.ok(small > medium && medium > large, `small, medium, large: ${small}, ${medium}, ${large} columns`);
		const e = await foot(p, 'Epilogue.md'), s2 = await p.at(card(L + 'Part Two'));
		await pressAndMove(p, e.x, e.y, s2.x, s2.y, 12);
		const mid = await dragState(p);
		await shot(p, 'tablet-stacks-drop');
		t.eq(mid.over, L + 'Part Two', 'over a stack’s middle, the stack is marked');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part Two/Epilogue.md')})`);
		await p.sleep(600);
		await flush(p);
		t.eq((await contents(p)).pop(), 'Part Two/Epilogue', 'and the note goes into the folder, last');
	});
});

// =====================================================================================================================
// More of what a finger does
// =====================================================================================================================

ux('a long press whose finger wobbles a little still opens the menu (once the card has lifted, 7 px of movement starts a drag instead: let go, nothing moves and no menu opens; Android allows 8 dp of wobble in a long press, iOS 10 pt)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const f = await foot(p, 'Part One/Arrival.md');
		await touch(p, 'touchStart', f.x, f.y);
		await p.sleep(650);
		await touch(p, 'touchMove', f.x + 5, f.y + 6);
		await p.sleep(150);
		const mid = await dragState(p);
		await touch(p, 'touchEnd');
		await p.sleep(600);
		const items = await menuItems(p);
		await gone(p);
		t.ok(items.includes('Rename'), `held 650 ms, moved 8 px, let go: ${mid.ghost ? 'a drag started' : 'no drag'}, and the menu ${items.length ? 'opened' : 'didn’t open'}`);
	});
});

test('a sheet closed by a tap on the dimmed board behind it does nothing to the card under the finger; no focus ring is left on the button that opened it', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await cardMenu(p, 'Prologue.md');
		const s = await sheet(p);
		// a tap above the sheet, where a card's title is
		const title = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path] .binders-card-title')].map(e => e.getBoundingClientRect()).filter(r => r.top > 180 && r.bottom < ${s.top} - 10).map(r => ({ x: r.left + 30, y: r.top + r.height / 2 }))[0]`);
		t.ok(title, 'a card’s title shows above the sheet');
		await tap(p, title.x, title.y);
		await p.sleep(500);
		t.eq(await menus(p), 0, 'a tap behind the sheet closes it');
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'and doesn’t open the note under the finger');
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'nor the folder, if it’s a stack’s name');
		t.eq(j(await selected(p)), j([L + 'Prologue.md']), 'nor change the selection');
		// the filter's sheet, closed the same way
		const fb = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, fb.x, fb.y);
		t.ok(await menus(p), 'the filter’s sheet opens');
		await tap(p, 200, 200);
		await p.sleep(500);
		t.eq(await menus(p), 0, 'and closes at a tap behind it');
		await shot(p, 'sheet-closed-by-tap');
		t.ok(!(await p.ev(`!!document.querySelector('${LEAF} .binders-toolbar-button:focus-visible')`)), 'with no focus ring left on the button');
		t.eq(j((await viewState(p)).filter), j({ status: [], label: [] }), 'and no filter set');
	});
});

test('the binder’s own synopsis is typed in place by touch, and a folder’s on its card (the first time from “Edit synopsis” in its menu, then by a tap on it): kept in the binder note and in a folder note made for it (which doesn’t show as a card)', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		const s = await p.at(`${LEAF} .binders-view-synopsis`);
		await tap(p, s.x, s.y);
		t.eq((await active(p)).tag, 'TEXTAREA', 'a tap on “Add a synopsis” opens its field');
		await p.type('A keeper, a storm, a light that goes out.');
		const f = await foot(p, 'Prologue.md');
		await tap(p, f.x, f.y);
		await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
		await flush(p);
		t.eq(await prop(p, L + 'The Lighthouse.md', 'synopsis'), 'A keeper, a storm, a light that goes out.', 'kept in the binder note');
		t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'whose contents are as they were');
		// a folder's, on its card. With none yet the card has no line for one (it names what the folder holds, since
		// 0.12.17): the card's menu adds it
		t.eq(await p.at(STACK(L + 'Part One') + ' .binders-card-synopsis'), null, 'a folder’s card with no synopsis shows no line for one');
		await cardMenu(p, 'Part One');
		if (!(await menuTap(p, 'Edit synopsis'))) throw new Error('no “Edit synopsis” in a folder card’s menu: ' + j(await menuItems(p)));
		await p.sleep(500);
		t.eq(j([(await active(p)).tag, await p.ev(`document.activeElement.getAttribute('aria-label')`)]), j(['TEXTAREA', 'Synopsis of Part One']), '“Edit synopsis” in its menu opens the folder’s synopsis');
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'and not the folder');
		await p.type('Mara comes.');
		await tap(p, f.x, f.y);
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Part One.md')})`);
		await p.sleep(600);
		await flush(p);
		t.eq(await prop(p, L + 'Part One/Part One.md', 'synopsis'), 'Mara comes.', 'kept in a folder note made for it');
		t.eq((await stack(p, L + 'Part One')).synopsis, 'Mara comes.', 'the card shows it');
		t.eq((await stack(p, L + 'Part One')).count, '3 notes · 51 words', 'and still counts three notes');
		// once it has one: the card selected first, then (a moment later, as on a note's card) a tap on the synopsis
		const sf = await foot(p, 'Part One');
		await tap(p, sf.x, sf.y);
		await p.sleep(700);
		const g = await p.at(STACK(L + 'Part One') + ' .binders-card-synopsis');
		await tap(p, g.x, g.y);
		t.eq((await active(p)).tag, 'TEXTAREA', 'a tap on a selected folder card’s synopsis edits it in place');
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'and doesn’t go into the folder');
		await p.ev(`(() => { document.activeElement.select(); return 1; })()`);
		await p.type('Mara comes ashore.');
		await tap(p, f.x, f.y);
		await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
		await flush(p);
		await until(p, `app.vault.adapter.read(${j(L + 'Part One/Part One.md')}).then(s => s.includes('Mara comes ashore.'))`);
		t.eq(await prop(p, L + 'Part One/Part One.md', 'synopsis'), 'Mara comes ashore.', 'and what’s typed over it is kept');
		await shot(p, 'synopses-typed');
		await open(p, L + 'Part One');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'the folder note isn’t a card on the folder’s board');
		t.eq(await p.ev(`document.querySelector('${LEAF} .binders-view-synopsis')?.textContent ?? null`), 'Mara comes ashore.', 'whose own synopsis, under the toolbar, is the same one');
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (path !== L + 'The Lighthouse.md') t.eq(after[path], text, `“${path}” is unchanged`);
	t.eq(after[L + 'The Lighthouse.md'].split('---\n').pop(), before[L + 'The Lighthouse.md'].split('---\n').pop(), 'the binder note’s text is unchanged');
});

test('“Merge 2 notes” from the sheet asks first, in a dialog that fits; merged, the kept note has both texts and both synopses, and “Cancel” changes nothing', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const pickTwo = async () => {
			await p.ev(`(() => { ${VIEW}.current.select([${j(L + 'Part One/Arrival.md')}, ${j(L + 'Part One/The keeper.md')}], ${j(L + 'Part One/Arrival.md')}); return 1; })()`);
			const c = await foot(p, 'Part One/Arrival.md');
			await hold(p, c.x, c.y);
			if (!(await menuTap(p, 'Merge 2 notes'))) throw new Error('no Merge: ' + j(await menuItems(p)));
			await until(p, `!!document.querySelector('.modal .modal-button-container')`);
			await p.sleep(400);
		};
		await pickTwo();
		const d = await dialog(p);
		await shot(p, 'merge-dialog');
		t.eq(d.title, 'Merge 2 notes', 'asked first');
		t.ok(d.box[0] >= 0 && d.box[0] + d.box[2] <= d.inner[0] && d.box[1] >= 0 && d.box[1] + d.box[3] <= d.inner[1], 'the dialog fits the screen: ' + j(d.box));
		t.eq(d.menus, 0, 'with no sheet over it');
		await dialogTap(p, 'Cancel');
		await p.sleep(400);
		t.eq(j(Object.keys(await texts(p)).sort()), j(Object.keys(before).sort()), 'Cancel leaves every note');
		await pickTwo();
		await dialogTap(p, 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')})`, 5000);
		await p.sleep(700);
		await flush(p);
		const merged = await read(p, L + 'Part One/Arrival.md');
		t.ok(merged.includes('The supply boat left Mara on the jetty') && merged.includes(before[L + 'Part One/The keeper.md'].split('---\n').pop().trim()), 'the kept note has both texts');
		t.ok(/Mara arrives on the island with the supply boat\./.test(merged) && /The keeper refuses to let her into the tower\./.test(merged), 'and both synopses');
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), 'and is the card selected');
		await shot(p, 'merged');
	});
});

test('numbers follow a drop: with “Number the cards” on, the cards count 1 to 3 in their new order straight after a drag', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await setOptions(p, { numbers: true });
		const e = await foot(p, 'Part One/Storm warning.md'), a = await p.at(card(L + 'Part One/Arrival.md'));
		await pressAndMove(p, e.x, e.y, e.x, a.t + 6, 12);
		await touch(p, 'touchEnd');
		await p.sleep(1000);
		await shot(p, 'numbers-after-drop');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop().replace('.md', '') + ' ' + c.querySelector('.binders-card-number').textContent)`)), j(['Storm warning 1', 'Arrival 2', 'The keeper 3']), 'the numbers are the new order');
	});
});

ux('when the keyboard comes up over a field just opened (a synopsis in the lower half of the screen), the board scrolls it into sight, with a little room under it (nothing scrolls: the field stays under the keyboard until a letter is typed, and then sits with its foot 3 px under the keyboard’s edge)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await scrollTo(p, 'end');
		const f = await foot(p, 'Epilogue.md');
		await tap(p, f.x, f.y);
		const s = await p.at(card(L + 'Epilogue.md') + ' .binders-card-synopsis');
		await tap(p, s.x, s.y);
		t.eq((await active(p)).tag, 'TEXTAREA', 'the last card’s synopsis is being edited');
		await keyboard(p, PHONE, true);
		await p.sleep(600);
		const up = await active(p);
		await shot(p, 'ux-keyboard-field-up');
		await p.type('x');
		await p.sleep(500);
		const typed = await active(p);
		await shot(p, 'ux-keyboard-field');
		await p.key('Escape');
		await keyboard(p, PHONE, false);
		const edge = PHONE[1] - KEYBOARD;
		t.ok(up.bottom <= edge && typed.bottom <= edge - 8, `the field is at ${up.top}–${up.bottom} when the keyboard comes up (its top edge is ${edge} px down), and at ${typed.top}–${typed.bottom} once a letter is typed`);
	});
});

// (a binder's board has one tile now; a Longform project's still has one for each group of indented scenes)
bug('with a note being named in one “New note” tile, a tap on another group’s tile opens that one (the first note is made, but the tile tapped closes again at once: the board is drawn again under it, and the tap is lost)', async (p, h, t) => {
	const LF = 'Longform demo/';
	await onDevice(p, PHONE, async () => {
		await open(p, 'Longform demo');
		const tiles = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card-new')].map(${R})`);
		t.ok((await tiles()).length >= 2, 'a Longform project with indented scenes has a tile for each group: ' + (await tiles()).length);
		// (the first tile, after Harbor, near the top of the screen: the second, after the scenes indented under it, is in sight too)
		await p.ev(`(() => { const s = ${CORK}, e = document.querySelector('${LEAF} .binders-card-new'); s.scrollTop += e.getBoundingClientRect().top - 200; return 1; })()`);
		await p.sleep(400);
		let ts = await tiles();
		await tap(p, ts[0][0] + 60, ts[0][1] + 20);
		t.eq((await active(p)).tag, 'INPUT', 'the first tile (after Harbor) opens');
		await p.type('One');
		ts = await tiles();
		const nav = await navbarTop(p);
		t.ok(ts[1][1] > 0 && ts[1][1] + 30 < nav, `the second tile is in sight too (${j(ts[1])}, navigation bar at ${nav})`);
		await tap(p, ts[1][0] + 60, ts[1][1] + 20);
		await until(p, `!!app.vault.getAbstractFileByPath(${j(LF + 'One.md')})`);
		await p.sleep(800);
		await shot(p, 'bug-second-tile');
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(LF + 'One.md')})`), 'the first note is made');
		const a = await p.ev(`(() => { const all = [...document.querySelectorAll('${LEAF} .binders-card-new')]; return { tag: document.activeElement.tagName, tile: all.indexOf(document.activeElement.closest('.binders-card-new')), tiles: all.length, open: document.querySelectorAll('${LEAF} .binders-card-new.is-editing').length }; })()`);
		t.eq(j([a.tag, a.tile]), j(['INPUT', 1]), 'and the tile tapped, the one under the indented scenes, has its field open: ' + j(a));
		await p.type('Two');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(LF + 'Two.md')})`);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(LF + 'Two.md')})`), 'where the second note is named');
		await p.key('Escape');
		await p.sleep(400);
		await flush(p);
		const scenes = (await read(p, LF + 'Index.md')).split('scenes:')[1].split('ignoredFiles')[0];
		t.ok(/- Harbor\n\s+- One\n/.test(scenes) && /- The crossing\n\s+- Two\n/.test(scenes), 'each where its tile was: ' + scenes);
	});
});

bug('with a note being named in the “New note” tile, a tap on a selected folder card’s synopsis opens that field and leaves it open (it opened and was thrown away 5 ms later, when the board is drawn again for the note just made)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		// (a folder's card has a synopsis to tap only once the folder has one: since 0.12.17 the first is added from its menu)
		await p.ev(`(async () => { const f = await ${B}.ensureFolderNote(app.vault.getAbstractFileByPath(${j(L + 'Part Two')})); await app.fileManager.processFrontMatter(f, fm => { fm.synopsis = 'The wreck.'; }); })().then(() => 1)`);
		await open(p);
		await until(p, `document.querySelector(${j(STACK(L + 'Part Two') + ' .binders-card-synopsis')})?.textContent === 'The wreck.'`);
		// the card selected first (a tap on a selected card's synopsis is what edits it)
		const sf = await foot(p, 'Part Two');
		await tap(p, sf.x, sf.y);
		await p.sleep(700);
		const tile = await p.at(`${LEAF} .binders-card-new`), nav = await navbarTop(p);
		await tap(p, tile.x, Math.min(tile.y, nav - 16));
		t.eq((await active(p)).tag, 'INPUT', 'the tile opens');
		await p.type('One');
		t.eq(j(await selected(p)), j([L + 'Part Two']), 'the folder’s card is still selected');
		const g = await p.at(STACK(L + 'Part Two') + ' .binders-card-synopsis');
		await tap(p, g.x, g.y);
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'One.md')})`);
		await p.sleep(800);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'One.md')})`), 'the note is made');
		const a = await p.ev(`({ tag: document.activeElement.tagName, label: document.activeElement.getAttribute('aria-label') })`);
		t.eq(j([a.tag, a.label]), j(['TEXTAREA', 'Synopsis of Part Two']), 'and the folder’s synopsis is a field with the focus: ' + j(a));
		await p.ev(`(() => { document.activeElement.select(); return 1; })()`);
		await p.type('The wreck and after.');
		const pr = await foot(p, 'Prologue.md');
		await tap(p, pr.x, pr.y);
		await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
		await flush(p);
		await until(p, `app.vault.adapter.read(${j(L + 'Part Two/Part Two.md')}).then(s => s.includes('The wreck and after.'))`);
		t.eq(await prop(p, L + 'Part Two/Part Two.md', 'synopsis'), 'The wreck and after.', 'what’s typed there is kept in the folder’s note');
	});
});

bug('what the board brings into view on a phone is brought above the navigation bar: a card’s title or synopsis opened from its sheet (“Rename”, “Edit synopsis”) and a copy just made (“Duplicate”) are scrolled only to the screen’s foot, under the bar', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		// enough notes that the board scrolls anywhere
		await p.ev(`(async () => { for (let i = 1; i <= 8; i++) await ${B}.newScene(app.vault.getAbstractFileByPath('The Lighthouse'), Infinity, 'Extra ' + i); await ${B}.flush(); })().then(() => 1)`);
		await open(p);
		const nav = await navbarTop(p), under = [];
		/** Scrolls until this card is cut by the screen's foot, its top 30 px showing above the navigation bar. */
		const atFoot = async (path) => { await p.ev(`(() => { const s = ${CORK}, c = document.querySelector(${j(card(L + path))}); s.scrollTop += c.getBoundingClientRect().top - (${nav} - 30); return 1; })()`); await p.sleep(400); return p.at(card(L + path)); };
		for (const [item, what] of [['Rename', 'INPUT'], ['Edit synopsis', 'TEXTAREA']]) {
			const c = await atFoot('Extra 3.md');
			await hold(p, c.x, c.t + 14);
			if (!(await menuTap(p, item))) throw new Error('no ' + item);
			await p.sleep(600);
			const a = await active(p);
			await shot(p, `bug-under-navbar-${item.replace(' ', '-').toLowerCase()}`);
			t.eq(a.tag, what, `“${item}” opens its field`);
			if (a.bottom > nav) under.push(`“${item}”: the field is at ${a.top}–${a.bottom}`);
			await p.key('Escape');
			await p.sleep(300);
		}
		const c = await atFoot('Extra 5.md');
		await hold(p, c.x, c.t + 14);
		await menuTap(p, 'Duplicate');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Extra 6.md')}) && document.querySelector('${LEAF} .binders-card.is-selected')?.dataset.path !== ${j(L + 'Extra 5.md')}`);
		await p.sleep(700);
		const copy = await p.ev(`(${R})(document.querySelector('${LEAF} .binders-card.is-selected'))`);
		await shot(p, 'bug-under-navbar-duplicate');
		if (copy[1] + copy[3] > nav) under.push(`“Duplicate”: the copy, selected, is at ${copy[1]}–${copy[1] + copy[3]}`);
		t.eq(under.join('; '), '', `under the navigation bar (which starts at ${nav})`);
	});
});

test('safe areas: on its side with a notch (47 px insets left and right, 21 px at the foot), the toolbar and the cards keep inside the area Obsidian’s own view header keeps to, and the board’s end still clears the navigation bar', async (p, h, t) => {
	await onDevice(p, side(PHONE), async () => {
		await p.ev(`(() => { const s = document.body.style; s.setProperty('--safe-area-inset-left', '47px'); s.setProperty('--safe-area-inset-right', '47px'); s.setProperty('--safe-area-inset-bottom', '21px'); return 1; })()`);
		await p.sleep(500);
		await open(p);
		await shot(p, 'safe-area-landscape');
		const g = await p.ev(`(() => { const R = ${R}; const leaf = document.querySelector('${LEAF}'); return { content: R(leaf.querySelector('.view-content')), toolbar: R(leaf.querySelector('.binders-toolbar')), first: R(leaf.querySelector('.binders-toolbar-button')), last: R([...leaf.querySelectorAll('.binders-toolbar-button')].pop()), card: R(leaf.querySelector('.binders-card')), root: R(document.querySelector('.workspace > .mod-root')), inner: innerWidth }; })()`);
		say('safe area', j(g));
		t.ok(g.first[0] >= 47 && g.card[0] >= 47, 'the toolbar’s first button and the first card start past the left inset: ' + j([g.first, g.card]));
		await scrollTo(p, 'end');
		const end = await p.ev(`(() => { const cs = ${CORK}.querySelectorAll('.binders-card'); return Math.round(cs[cs.length - 1].getBoundingClientRect().bottom); })()`), nav = await navbarTop(p);
		await shot(p, 'safe-area-landscape-end');
		t.ok(nav == null || end <= nav, `the last tile (bottom ${end}) is above the navigation bar (top ${nav})`);
		// what Obsidian itself does about the right inset: recorded, to compare with the toolbar's last button
		say('right edge: Obsidian’s content ends at', g.content[0] + g.content[2], 'the toolbar’s last button at', g.last[0] + g.last[2], 'of', g.inner);
	});
});

test('the board comes back as it was left after Obsidian restarts on the phone: the folder, the filter, numbers and card size', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await setOptions(p, { numbers: true, cardSize: 'small' });
		const f = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, f.x, f.y);
		await menuTap(p, 'Idea');
		await p.sleep(600);
		await gone(p);
		await p.ev(`app.workspace.requestSaveLayout()`);
		await p.sleep(3500);
		await reload(p, true);
		await p.focusMain();
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
		await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`, 8000);
		await p.sleep(800);
		await shot(p, 'restarted');
		const s = await viewState(p);
		t.eq(j([s?.folder, s?.mode, s?.filter, s?.options?.numbers, s?.options?.cardSize]), j(['The Lighthouse', 'corkboard', { status: ['Idea'], label: [] }, true, 'small']), 'the view’s state');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['Part One', 'Part Two', 'Epilogue.md']), 'and what it shows: the stacks, and the one idea beside them');
		t.ok(await p.ev(`document.querySelector('${LEAF} .binders-board').classList.contains('mod-cards-small')`), 'small cards');
	});
});

test('on its side with the keyboard up (190 px of screen left), the “Set target” and “New status” dialogs keep what’s typed in their field in sight', async (p, h, t) => {
	await onDevice(p, side(PHONE), async () => {
		await open(p, L + 'Part One');
		const out = {};
		for (const [what, begin] of [['target', async () => { await p.ev(`app.commands.executeCommandById('binders:set-target')`); }], ['status', async () => { await scrollTo(p, 0); const c = await p.at(card(L + 'Part One/The keeper.md')); await hold(p, c.x, c.y + 6); await menuTap(p, 'Set status'); await p.sleep(300); await menuTap(p, 'New status...'); }]]) {
			await begin();
			await until(p, `!!document.querySelector('.modal .binders-ask input')`);
			await p.sleep(500);
			await keyboard(p, side(PHONE), true, 200);
			await p.sleep(300);
			const d = await dialog(p);
			await shot(p, `side-dialog-${what}-keyboard`);
			out[what] = { box: d.box, field: d.fields[0]?.rect, buttons: d.buttons.map((b) => [b.text, b.rect[1], b.rect[3]]) };
			await keyboard(p, side(PHONE), false);
			await closeDialog(p);
		}
		say('dialogs on its side', j(out));
		// (the dialog is Obsidian's own sheet, which keeps to the foot of the screen: the field's line of text is clear of
		// the keyboard, its lower border may sit a few px under the keyboard's edge)
		for (const [what, o] of Object.entries(out)) t.ok(o.field && o.field[1] >= 0 && o.field[1] + o.field[3] - 8 <= 190, `${what}: the field’s text is in the 190 px above the keyboard: ${j(o)}`);
	});
});

test('drag: a card dropped on an empty folder’s stack goes into it; a stack dropped on the board’s empty foot becomes the binder’s last, its notes with it', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { await ${B}.newFolder(app.vault.getAbstractFileByPath('The Lighthouse'), 1, 'Empty'); await ${B}.flush(); })().then(() => 1)`);
		await open(p);
		await shot(p, 'drag-empty-stack');
		t.eq(j((await contents(p)).slice(0, 3)), j(['Prologue', 'Empty/', 'Part One/']), 'an empty folder after Prologue');
		t.eq((await stack(p, L + 'Empty')).count, '0 notes · 0 words', 'its stack says it’s empty');
		// onto the empty folder's stack
		let f = await foot(p, 'Prologue.md');
		const e = await p.at(card(L + 'Empty'));
		await pressAndMove(p, f.x, f.y, e.x, e.y, 12);
		let mid = await dragState(p);
		say('on an empty stack', j(mid));
		t.eq(mid.over, L + 'Empty', 'over an empty folder’s stack, it’s marked');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Empty/Prologue.md')})`);
		await p.sleep(700);
		await flush(p);
		t.eq(j((await contents(p)).slice(0, 3)), j(['Empty/', 'Empty/Prologue', 'Part One/']), 'dropped there, it goes into the empty folder');
		t.ok(/^1 note · /.test((await stack(p, L + 'Empty')).count), 'whose stack counts it: ' + (await stack(p, L + 'Empty')).count);
		// the stack itself, onto the board's empty foot
		await scrollTo(p, 'end');
		f = await foot(p, 'Empty');
		const nav = await navbarTop(p), last = await p.ev(`(() => { const all = document.querySelectorAll('${LEAF} .binders-card-new'); return (${R})(all[all.length - 1]); })()`);
		await pressAndMove(p, f.x, f.y, f.x, Math.min(nav - 8, last[1] + last[3] + 20), 12);
		mid = await dragState(p);
		say('on the foot', j(mid), j(last), nav);
		await touch(p, 'touchEnd');
		await p.sleep(1200);
		await flush(p);
		t.eq(j((await contents(p)).slice(-3)), j(['Epilogue', 'Empty/', 'Empty/Prologue']), 'dropped below the tile, the folder is the binder’s last');
		t.eq(await leftovers(p) + await menus(p), 0, 'nothing left over');
		// (looked at here: leaving the device tidies the folder made for this away)
		const after = await texts(p);
		const moved = { [L + 'Prologue.md']: L + 'Empty/Prologue.md' };
		for (const [path, text] of Object.entries(before)) if (path !== L + 'The Lighthouse.md') t.eq(after[moved[path] ?? path], text, `“${path}” is unchanged`);
	});
});
