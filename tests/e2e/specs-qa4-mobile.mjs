// QA round 4, the whole plugin on a phone and a tablet, by touch: Obsidian's mobile mode (app.emulateMobile) at a phone's
// size (390 × 844, and 320 × 568), a tablet's (820 × 1180) and their landscapes, with real touches sent over CDP (taps,
// long presses, swipes, drags). Tests named "qa4 mobile: …" pass; "BUG: …" are confirmed bugs (they fail now and will
// pass once fixed); "UX: …" are behaviours that should exist. Every test puts Obsidian back on the desktop when it ends.
//
// What the emulation can't do, so isn't tested here: a long press never sends `contextmenu` (on a device, Android's
// WebView sends it and Obsidian sends it itself on iOS after 800 ms), so menus that hang on `contextmenu` (a manuscript
// title, a file explorer row) are opened by dispatching that event as Obsidian does; the on-screen keyboard is only a
// shorter viewport (no device scrolls the focused field into view for us); and HTML drag and drop in the file explorer
// can't be started by touch.
//
// QA4_SHOTS=<dir> saves screenshots of every step there.
import { mkdirSync } from 'fs';
import { B, PL, VIEW, card, closeMenus, contents, flush, j, menuItems, openView, read, reload, texts, tidy, until, viewState } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa4 mobile: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa4 mobile: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa4 mobile: ' + name, fn });

const L = 'The Lighthouse/';
const LEAF = '.workspace-leaf.mod-active';
const PHONE = [390, 844], SMALL = [320, 568], TABLET = [820, 1180];
/** How much shorter the page is with the on-screen keyboard up (a phone's is about 40% of the screen). */
const KEYBOARD = 336, KEYBOARD_SMALL = 260;
const SHOTS = process.env.QA4_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };

// ---- touch ----
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
/** A long press that's let go without moving. */
const hold = async (p, x, y, ms = 700) => { await touch(p, 'touchStart', x, y); await p.sleep(ms); await touch(p, 'touchEnd'); await p.sleep(550); };
/** A finger put down and moved straight away (a scroll). */
const swipe = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(500); };
/** A long press, then a move to (x1, y1), the finger still down. */
const pressAndMove = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); await p.sleep(620); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(20); } await p.sleep(200); };

// ---- the device ----
const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
/** Runs fn in Obsidian's mobile mode at this size, with touch, in the theme the run asked for; then puts the desktop
    back whatever happened: menus, dialogs and settings closed, the text size, motion and CPU as they were. Errors logged
    while on the device fail the test (the reload back would otherwise forget them). */
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
		await p.ev(`(async () => { try { app.setting.close(); } catch {} const base = app.vault.getAbstractFileByPath('Scenes.base'); if (base) await app.vault.delete(base); if ((app.vault.getConfig('baseFontSize') ?? 16) !== 16) { app.vault.setConfig('baseFontSize', 16); app.updateFontSize?.(); } for (let i = 0; i < 60; i++) { let saved = 16; try { saved = JSON.parse(await app.vault.adapter.read(app.vault.configDir + '/appearance.json')).baseFontSize ?? 16; } catch {} if (saved === 16) break; await new Promise(r => setTimeout(r, 100)); } })().then(() => 1)`).catch(() => {});
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
const row = (path) => `${LEAF} .binders-outliner-row[data-path="${L}${path}"]`;
const cell = (path, col) => `${row(path)} .binders-outliner-cell[data-col="${col}"]`;
const scene = (name) => `[...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === ${j(name)})`;
const CORK = `document.querySelector('${LEAF} .binders-corkboard')`;
const OUT = `document.querySelector('${LEAF} .binders-outliner')`;
const MAN = `document.querySelector('${LEAF} .binders-manuscript')`;
/** Opens the binder view and waits until its word counts are in: the cards are their final height from then on. */
async function open(p, folder = 'The Lighthouse') {
	await openView(p, folder);
	await until(p, `/\\d/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '')`, 5000);
	await p.sleep(500);
}
/** More loose notes at the binder's end: its own board (two notes and a stack for each folder) then scrolls on a phone. */
const longer = async (p, n = 6) => { await p.ev(`(async () => { for (let i = 1; i <= ${n}; i++) await ${B}.newScene(app.vault.getAbstractFileByPath('The Lighthouse'), Infinity, 'Extra ' + i); await ${B}.flush(); ${B}.undos = []; ${B}.redos = []; })().then(() => 1)`); await p.sleep(400); };
const setMode = async (p, m) => { await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`); await p.sleep(m === 'manuscript' ? 1500 : 500); };
const selected = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-selected, ${LEAF} .binders-outliner-row.is-selected')].map(c => c.dataset.path)`);
const prop = async (p, path, key) => (await read(p, path)).split('\n').find((l) => l.startsWith(key + ':'))?.slice(key.length + 1).trim() ?? null;
/** The toolbar's parts that show, left to right, and whether any two overlap or anything sticks out. */
const toolbar = (p) => p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'), b = v.querySelector('.binders-toolbar'); const kids = [...b.children].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { cls: e.className.split(' ').filter(c => c.startsWith('binders-')).pop(), l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) }; }); const overlap = []; for (let i = 1; i < kids.length; i++) if (kids[i].l < kids[i - 1].r) overlap.push(kids[i - 1].cls + '/' + kids[i].cls); return { out: Math.max(v.scrollWidth - v.clientWidth, b.scrollWidth - b.clientWidth, Math.round(b.getBoundingClientRect().right - innerWidth)), kids, overlap }; })()`);
const navbarTop = (p) => p.ev(`(() => { const b = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return b && b.height ? Math.round(b.top) : null; })()`);

// ---- menus and dialogs ----
/** The last menu shown: where it is, and its items. On a phone Obsidian shows a menu as a sheet along the bottom. */
const sheet = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom), inner: [innerWidth, innerHeight], itemHeights: [...m.querySelectorAll('.menu-item:not(.is-label)')].map(i => Math.round(i.getBoundingClientRect().height)) }; })()`);
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
/** The dialog on top: its box, title, fields and buttons, and whether its text scrolls. */
const dialog = (p) => p.ev(`(() => { const R = ${R}; const c = [...document.querySelectorAll('.modal-container')].pop(), m = c?.querySelector('.modal'); if (!m) return null; const t = m.querySelector('.modal-title'), content = m.querySelector('.modal-content'); const under = (() => { const x = m.querySelector('.modal-header-button')?.getBoundingClientRect(); if (!t || !x || !x.width) return 0; const r = document.createRange(); r.selectNodeContents(t); const b = r.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(b.right, x.right) - Math.max(b.left, x.left))); })(); return { inner: [innerWidth, innerHeight], container: c.className, box: R(m), title: t?.textContent ?? '', titleCut: t ? t.scrollWidth - t.clientWidth : 0, titleUnderClose: under, fields: [...m.querySelectorAll('input[type="text"], select')].map(i => ({ rect: R(i), inputMode: i.inputMode ?? '', font: parseFloat(getComputedStyle(i).fontSize) })), buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => ({ text: b.textContent, cls: b.className, rect: R(b) })), scrolls: content ? content.scrollHeight - content.clientHeight : 0, menus: document.querySelectorAll('.menu').length }; })()`);
const dialogTap = async (p, text) => {
	const at = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); const b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`no “${text}” button in the dialog`);
	await p.sleep(150);
	await tap(p, at.x, at.y);
	await p.sleep(400);
};
const closeDialog = async (p) => { const x = await p.at('.modal .modal-header-button'); if (x) await tap(p, x.x, x.y); else await p.key('Escape'); await p.sleep(500); };
const dialogs = (p) => p.ev(`document.querySelectorAll('.modal-container').length`);
/** Holds a card (by its foot, clear of its title and synopsis) until its menu shows. */
async function cardMenu(p, path) {
	await p.ev(`(() => { document.querySelector(${j(card(L + path))})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	await p.sleep(300);
	const c = await p.at(card(L + path));
	if (!c) throw new Error('no card for ' + path);
	await hold(p, c.x, c.t + c.h - 16);
	if (!(await p.ev(`document.querySelectorAll('.menu').length`))) throw new Error('no menu after holding the card of ' + path);
}

// ---- the file explorer (a drawer on a phone) ----
const TOGGLE = { x: 34, y: 81 }; // the drawer's button, top left of a phone's screen
const drawerOpen = (p) => p.ev(`!app.workspace.leftSplit.collapsed`);
const explorerRow = (path) => `.nav-files-container .tree-item-self[data-path="${path}"]`;
/** Opens the drawer with the binder's folders unfolded. */
const showExplorer = async (p, folders = ['The Lighthouse', 'The Lighthouse/Part One']) => {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[0].view; for (const f of ${j(folders)}) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(900);
};
/** A row's menu, asked for as Obsidian asks for it after a long press on a device. */
const explorerMenu = async (p, path) => {
	await p.ev(`(() => { const e = document.querySelector(${j(explorerRow(path))}); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2, button: 0 })); return 1; })()`);
	await p.sleep(500);
};

// =====================================================================================================================
// The toolbar
// =====================================================================================================================

test('phone: the toolbar fits at 390 and at 320 px in every mode, its menus are sheets, its buttons as big as a base’s, and the last card clears the navigation bar', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		// a base's own toolbar, for the sizes
		await p.ev(`(async () => { await app.vault.create('Scenes.base', 'views:\\n  - type: cards\\n    name: Cards\\n'); await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Scenes.base')); })().then(() => 1)`);
		await until(p, `!!document.querySelector('${LEAF} .bases-toolbar .text-icon-button')`, 5000);
		await p.sleep(500);
		await shot(p, 'toolbar-native-base');
		const base = await p.ev(`({ bar: Math.round(document.querySelector('${LEAF} .bases-header').getBoundingClientRect().height), buttons: [...document.querySelectorAll('${LEAF} .bases-toolbar .text-icon-button')].map(e => Math.round(e.getBoundingClientRect().height)) })`);
		for (const [w, hh] of [PHONE, SMALL]) {
			await metrics(p, w, hh);
			await p.sleep(400);
			for (const folder of ['The Lighthouse', L + 'Part One']) {
				await open(p, folder);
				for (const mode of ['corkboard', 'outliner', 'manuscript']) {
					await setMode(p, mode);
					const bar = await toolbar(p);
					await shot(p, `toolbar-${w}-${folder === 'The Lighthouse' ? 'binder' : 'folder'}-${mode}`);
					t.ok(bar.out <= 0, `${w} px, ${mode}: nothing sticks out sideways (${j(bar)})`);
					t.eq(j(bar.overlap), '[]', `${w} px, ${mode}: nothing overlaps`);
					const buttons = bar.kids.filter((k) => /button/.test(k.cls));
					t.ok(buttons.length >= 2 && buttons.every((k) => k.h >= Math.min(...base.buttons)), `${w} px, ${mode}: its buttons are as tall as a base’s (${Math.min(...base.buttons)} px): ${j(buttons)}`);
				}
				await setMode(p, 'corkboard');
			}
		}
		await metrics(p, ...PHONE);
		await p.sleep(400);
		await open(p);
		t.eq(Math.round((await rect(p, `${LEAF} .binders-toolbar`))[3]), base.bar, 'the toolbar is as tall as a base’s');
		// the mode menu, by touch: a sheet along the bottom, with rows a finger can hit
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y);
		let s = await sheet(p);
		await shot(p, 'toolbar-mode-sheet');
		t.ok(isSheet(s), 'the mode menu is a sheet along the bottom: ' + j(s));
		t.ok(s.itemHeights.every((x) => x >= 40), 'its rows are 40 px or more: ' + j(s.itemHeights));
		t.ok(await menuTap(p, 'Outliner'), 'Outliner is in it');
		await until(p, `!!document.querySelector('${LEAF} .binders-mode-outliner')`);
		t.eq((await viewState(p)).mode, 'outliner', 'a tap on a mode switches to it');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and the sheet is gone');
		t.ok(!(await p.ev(`document.activeElement.matches(':focus-visible')`)), 'no focus ring is left after a tap');
		await setMode(p, 'corkboard');
		// the filter and the New menu
		const f = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, f.x, f.y);
		s = await sheet(p);
		t.ok(isSheet(s) && (await menuItems(p)).includes('Draft'), 'the filter is a sheet with the statuses in it');
		await gone(p);
		const n = await p.at(`${LEAF} .binders-new-button`);
		await tap(p, n.x, n.y);
		t.eq(j(await menuItems(p)), j(['New note', 'New folder']), 'the New menu');
		t.ok(isSheet(await sheet(p)), 'a sheet too');
		await gone(p);
		// the board's end: the last "New note" tile is above Obsidian's floating navigation bar
		const end = await p.ev(`(() => { const s = ${CORK}; s.scrollTop = s.scrollHeight; const cs = s.querySelectorAll('.binders-card'); return Math.round(cs[cs.length - 1].getBoundingClientRect().bottom); })()`);
		const nav = await navbarTop(p);
		await shot(p, 'toolbar-board-end');
		t.ok(nav != null && end <= nav, `the last tile (bottom ${end}) is above the navigation bar (top ${nav})`);
	});
});

ux('phone: the word count, which sets the target when tapped, is as tall as the toolbar’s buttons (it is 21 px; they are 32)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const c = await p.at(`${LEAF} .binders-word-count`), b = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, c.x, c.y);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		t.eq((await dialog(p))?.title, 'Word count target for the binder', 'a tap on the count asks for the target');
		await closeDialog(p);
		t.ok(c.h >= b.h, `the count’s tap target is ${Math.round(c.h)} px tall; the buttons beside it are ${Math.round(b.h)}`);
	});
});

bug('phone: in a subfolder the breadcrumb shows the folder above and the one shown, neither cut to nothing (at 390 px it reads “Th… ›”, the current folder clipped away)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await p.sleep(300);
		await shot(p, 'bug-breadcrumb-390');
		const seen = await p.ev(`(() => { const box = document.querySelector('${LEAF} .binders-breadcrumbs').getBoundingClientRect(); return [...document.querySelectorAll('${LEAF} .binders-crumb')].filter(e => getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { text: e.textContent, current: e.matches('.is-current'), visible: Math.round(Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left))), needs: Math.round(Math.min(e.scrollWidth, 45)) }; }); })()`);
		// every crumb that shows has room for at least three letters and an ellipsis (its own min-width)
		t.ok(seen.every((c) => c.visible >= c.needs), 'every crumb shown can be read: ' + j(seen));
		// and going up still works by touch
		const up = await p.at(`${LEAF} .binders-crumb[role="link"]`);
		await tap(p, up.x, up.y);
		await until(p, `${VIEW}.folder?.path === 'The Lighthouse'`);
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'a tap on the folder above goes up');
	});
});

// Round 7: the board shows one folder at a time, so the way up is how a writer leaves a folder.
specs.push({ name: 'BUG: qa7: mobile: phone: in a folder that has a word count target, the way up still names the folder above (the count, “51 / 9,000 words”, takes its room: beside the arrow the name is cut to 9 px, and a tap where it should be does nothing)', fn: async (p, h, t) => {
	await p.ev(`(async () => { const f = await ${B}.ensureFolderNote(app.vault.getAbstractFileByPath(${j(L + 'Part One')})); await app.fileManager.processFrontMatter(f, fm => { fm.target = 9000; }); })().then(() => 1)`);
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await p.sleep(300);
		await shot(p, 'bug7-way-up-with-target');
		const seen = await p.ev(`(() => { const box = document.querySelector('${LEAF} .binders-breadcrumbs').getBoundingClientRect(); const vis = (e) => { const r = e.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left))); }; const up = document.querySelector('${LEAF} .binders-crumb-up'), name = document.querySelector('${LEAF} .binders-crumb[role="link"]'); return { count: document.querySelector('${LEAF} .binders-word-count').textContent, arrow: vis(up), name: vis(name), needs: Math.round(Math.min(name.scrollWidth, 45)), text: name.textContent }; })()`);
		t.ok(/\/ 9,000 words/.test(seen.count), 'the count shows the folder’s target: ' + seen.count);
		t.ok(seen.arrow >= 16, 'the arrow shows: ' + j(seen));
		// the arrow itself goes up
		const up = await p.at(`${LEAF} .binders-crumb-up`);
		await tap(p, up.x, up.y);
		await until(p, `${VIEW}.folder?.path === 'The Lighthouse'`);
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'a tap on the arrow goes up');
		t.ok(seen.name >= seen.needs, `beside the arrow, “${seen.text}” can be read (three letters and an ellipsis at least: ${seen.needs} px): ${seen.name} px of it show`);
	});
} });

// =====================================================================================================================
// The corkboard
// =====================================================================================================================

test('phone corkboard: a tap selects, a tap on a selected card’s synopsis edits it, a swipe scrolls without dragging or losing what’s typed, a tap on the title opens the note', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await longer(p);
		await open(p);
		const P = card(L + 'Prologue.md');
		const c = await p.at(P), syn = await p.at(P + ' .binders-card-synopsis');
		await tap(p, c.x, c.t + c.h - 16);
		t.eq(j(await selected(p)), j([L + 'Prologue.md']), 'a tap selects the card');
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'and opens nothing');
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-edit-field').length`), 0, 'nor edits anything');
		await tap(p, syn.x, syn.y);
		t.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', 'a tap on its synopsis edits it');
		await shot(p, 'cork-synopsis-editing');
		await p.ev(`(() => { const f = document.activeElement; f.setSelectionRange(f.value.length, f.value.length); return 1; })()`);
		await p.type(' Typed.');
		// a swipe up the board, starting on another card, while the field is open
		await swipe(p, 200, 620, 200, 300);
		const after = await p.ev(`({ tag: document.activeElement.tagName, value: document.activeElement.value ?? null, scroll: ${CORK}.scrollTop, ghosts: document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator.is-active').length })`);
		t.ok(after.scroll > 100, 'the swipe scrolls the board: ' + j(after));
		t.eq(after.ghosts, 0, 'and drags nothing');
		t.eq(after.value, 'The light has not gone out in forty years. Typed.', 'what was typed is still in the field');
		t.eq(j(await selected(p)), j([L + 'Prologue.md']), 'and the selection is the same');
		// a tap somewhere else saves it
		await p.ev(`(() => { ${CORK}.scrollTop = 0; return 1; })()`);
		await p.sleep(300);
		const k = await p.at(card(L + 'Epilogue.md'));
		await tap(p, k.x, k.t + k.h - 16);
		await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
		await flush(p);
		t.eq(await prop(p, L + 'Prologue.md', 'synopsis'), 'The light has not gone out in forty years. Typed.', 'saved when another card is tapped');
		t.eq(j(await selected(p)), j([L + 'Epilogue.md']), 'which is selected');
		// a tap on a title opens the note; Back returns to the board, where it was
		const title = await p.at(card(L + 'Epilogue.md') + ' .binders-card-title');
		await tap(p, title.l + 20, title.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Epilogue.md')}`);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), L + 'Epilogue.md', 'a tap on a title opens the note');
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`);
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'Back returns to the board');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-selected')].map(c => c.dataset.path)`)), j([L + 'Epilogue.md']), 'with the card still selected');
		// a stack: a tap on its foot selects it, a tap on its name goes into the folder, whose notes are its board
		const st = await p.at(card(L + 'Part One'));
		await tap(p, st.x, st.t + st.h - 16);
		t.eq(j([await selected(p), (await viewState(p)).folder]), j([[L + 'Part One'], 'The Lighthouse']), 'a tap on a folder’s stack selects it');
		const name = await p.at(card(L + 'Part One') + ' .binders-card-title');
		await tap(p, name.l + 20, name.y);
		await until(p, `${VIEW}.folder?.path === ${j(L + 'Part One')} && !!document.querySelector(${j(card(L + 'Part One/The keeper.md'))})`);
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'a tap on its name goes into the folder: its three notes');
	});
	const after = await texts(p);
	// (the binder note lists the six notes added to make the board scroll: its own text is what it was)
	for (const [path, text] of Object.entries(before)) if (path !== L + 'Prologue.md' && path !== L + 'The Lighthouse.md') t.eq(after[path], text, `“${path}” is unchanged`);
	t.eq(after[L + 'The Lighthouse.md'].split('---\n').pop(), before[L + 'The Lighthouse.md'].split('---\n').pop(), 'the binder note’s text is unchanged');
	t.eq(after[L + 'Prologue.md'].split('---\n').pop(), before[L + 'Prologue.md'].split('---\n').pop(), 'and so is Prologue’s');
});

test('phone corkboard: a long press opens the card’s menu as a sheet; a status picked closes it; “Custom color...”, “Set target...” and “Delete” open their dialogs with nothing left over them', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const c = await p.at(card(L + 'Part One/Arrival.md'));
		await touch(p, 'touchStart', c.x, c.t + c.h - 16);
		await p.sleep(650);
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card.is-lifted').length`), 1, 'a held card lifts');
		await touch(p, 'touchEnd');
		await p.sleep(550);
		await shot(p, 'cork-card-menu');
		const items = await menuItems(p);
		t.ok(isSheet(await sheet(p)), 'letting go opens its menu as a sheet');
		for (const x of ['Open', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Delete']) t.ok(items.includes(x), `“${x}” is in it`);
		t.ok(!items.includes('Open to the right'), 'no “Open to the right” on a phone');
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), 'the card is selected');
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'and nothing opened');
		// Set status: the statuses take the sheet's place, and a pick closes everything
		t.ok(await menuTap(p, 'Set status'), 'Set status');
		await p.sleep(300);
		await shot(p, 'cork-status-sheet');
		t.ok((await menuItems(p)).includes('Revised') && (await menuItems(p)).includes('New status...'), 'the statuses show');
		t.ok(await menuTap(p, 'Draft'), 'Draft');
		await p.sleep(500);
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'a pick closes the sheet');
		await flush(p);
		t.eq(await prop(p, L + 'Part One/Arrival.md', 'status'), 'Draft', 'and sets the status');
		// Set label → Custom color...
		await cardMenu(p, 'Part One/Arrival.md');
		t.ok(await menuTap(p, 'Set label'), 'Set label');
		await p.sleep(300);
		await shot(p, 'cork-label-sheet');
		t.ok(await menuTap(p, 'Custom color...'), 'Custom color...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(500);
		let d = await dialog(p);
		await shot(p, 'cork-custom-color');
		t.eq(d.title, 'Custom color', 'the color dialog opens');
		t.eq(d.menus, 0, 'with no sheet left over it');
		t.ok(d.buttons.every((b) => b.rect[3] >= 44), 'its buttons are 44 px tall: ' + j(d.buttons));
		await dialogTap(p, 'Set color');
		t.eq(await dialogs(p), 0, 'Set color closes it');
		await flush(p);
		t.eq(await prop(p, L + 'Part One/Arrival.md', 'label'), '"#d97706"', 'the color is the note’s label');
		// Set target...
		await cardMenu(p, 'Part One/Arrival.md');
		t.ok(await menuTap(p, 'Set target...'), 'Set target...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		d = await dialog(p);
		t.eq(d.menus, 0, 'the target dialog has no sheet over it');
		t.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'its field has the focus');
		await p.type('1200');
		await dialogTap(p, 'Set target');
		await flush(p);
		t.eq(await prop(p, L + 'Part One/Arrival.md', 'target'), '1200', 'the target is set');
		await until(p, `/1,200/.test(document.querySelector(${j(card(L + 'Part One/Arrival.md'))})?.textContent ?? '')`);
		await shot(p, 'cork-target-set');
		// Delete: asked first; Cancel keeps the note
		await cardMenu(p, 'Part One/Arrival.md');
		t.ok(await menuTap(p, 'Delete'), 'Delete (at the sheet’s end, scrolled to)');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(400);
		d = await dialog(p);
		await shot(p, 'cork-delete-confirm');
		t.eq(d.title, 'Delete note', 'it asks first');
		t.eq(d.menus, 0, 'with no sheet over the question');
		await dialogTap(p, 'Cancel');
		t.eq(await dialogs(p), 0, 'Cancel closes it');
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})`), 'and the note is still there');
	});
});

test('phone corkboard: a long press and a move drags (within a folder, and into one by its stack); near the top edge the board scrolls; a drag cut short leaves nothing behind', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await longer(p);
		await open(p, L + 'Part One');
		// Arrival to after The keeper
		const a = await p.at(card(L + 'Part One/Arrival.md')), k = await p.at(card(L + 'Part One/The keeper.md'));
		await pressAndMove(p, a.x, a.t + a.h - 16, a.x, k.t + k.h - 6);
		await shot(p, 'cork-drag');
		const mid = await p.ev(`({ ghost: document.querySelectorAll('.binders-drag-ghost').length, line: !!document.querySelector('.binders-drop-indicator.is-active'), scroll: ${CORK}.scrollTop })`);
		t.eq(mid.ghost, 1, 'the card follows the finger');
		t.ok(mid.line, 'with a line where it will go');
		t.eq(mid.scroll, 0, 'and the board doesn’t scroll under it');
		await touch(p, 'touchEnd');
		await p.sleep(800);
		await flush(p);
		t.eq(j((await contents(p)).slice(1, 5)), j(['Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning']), 'dropped after The keeper');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'no menu after a drag');
		// on the binder's own board: Prologue onto Part Two's stack
		await open(p);
		const pr = await p.at(card(L + 'Prologue.md')), s2 = await p.at(card(L + 'Part Two'));
		await pressAndMove(p, pr.x, pr.t + pr.h - 16, s2.x, s2.y);
		t.eq(await p.ev(`document.querySelector('${LEAF} .is-being-dragged-over')?.dataset.path ?? null`), L + 'Part Two', 'over a folder’s stack, the stack is marked');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part Two/Prologue.md')})`);
		await p.sleep(500);
		await flush(p);
		t.eq(j((await contents(p)).slice(4, 8)), j(['Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Prologue']), 'dropped on the stack, it goes into the folder, last');
		// from the end of the board, held near its top edge: the board scrolls up; then the system cuts the touch short
		await p.ev(`(() => { ${CORK}.scrollTop = ${CORK}.scrollHeight; return 1; })()`);
		await p.sleep(300);
		const order = await contents(p);
		const top = (await rect(p, `${LEAF} .binders-corkboard`))[1], from = await p.ev(`${CORK}.scrollTop`);
		const e = await p.at(card(L + 'Extra 6.md'));
		await pressAndMove(p, e.x, e.t + e.h - 16, e.x, top + 20);
		await p.sleep(1000);
		const to = await p.ev(`${CORK}.scrollTop`);
		t.ok(to < from - 100, `held 20 px from the top edge, the board scrolls up (${from} → ${to})`);
		await touch(p, 'touchCancel');
		await p.sleep(500);
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-lifted, .is-dragging').length`), 0, 'a drag cut short leaves nothing behind');
		await flush(p);
		t.eq(j(await contents(p)), j(order), 'and moves nothing');
	});
});

ux('phone corkboard: a card dragged down to the navigation bar scrolls the board (the bar floats 760–812 px down an 844 px screen; the board only scrolls from 796 px, under the bar and in the home indicator’s strip)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await longer(p);
		await open(p);
		const nav = await navbarTop(p), pr = await p.at(card(L + 'Prologue.md'));
		t.ok(nav != null, 'the navigation bar shows');
		// held 10 px into the navigation bar: as low as a finger goes without leaving the board for the bar
		await pressAndMove(p, pr.x, pr.t + pr.h - 16, pr.x, nav + 10);
		await p.sleep(1000);
		const scrolled = await p.ev(`${CORK}.scrollTop`);
		await shot(p, 'ux-autoscroll-at-navbar');
		await touch(p, 'touchCancel');
		await p.sleep(400);
		t.ok(scrolled > 50, `held at ${nav + 10} px for a second, the board scrolled ${scrolled} px`);
	});
});

ux('phone corkboard: a held card shows it’s held in the dark theme too (there it only changes its 1 px ring from #333 to #3f3f3f; its shadow is black on black)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(() => { app.changeTheme('obsidian'); return 1; })()`);
		await p.sleep(300);
		await open(p, L + 'Part One');
		const sel = card(L + 'Part One/Arrival.md');
		const look = () => p.ev(`(() => { const s = getComputedStyle(document.querySelector(${j(sel)})); return { background: s.backgroundColor, transform: s.transform, opacity: s.opacity, outline: s.outlineStyle + ' ' + s.outlineWidth, ring: s.boxShadow.split(' 0px 0px 0px ')[0] }; })()`);
		await p.sleep(800); // (the cards have landed)
		const rest = await look();
		const c = await p.at(sel);
		await touch(p, 'touchStart', c.x, c.t + c.h - 16);
		await p.sleep(650);
		const held = await look();
		await shot(p, 'ux-held-dark');
		await touch(p, 'touchCancel');
		await p.sleep(300);
		t.ok(held.background !== rest.background || held.transform !== rest.transform || held.opacity !== rest.opacity || held.outline !== rest.outline, `something of the card changes besides its ring and a shadow: at rest ${j(rest)}, held ${j(held)}`);
	});
});

bug('phone corkboard: after Enter in the “New note” tile, the next title field is in sight (it’s left under the navigation bar, then below the screen)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await p.ev(`(() => { ${CORK}.scrollTop = ${CORK}.scrollHeight; return 1; })()`);
		await p.sleep(300);
		const last = await p.ev(`(() => { const all = document.querySelectorAll('${LEAF} .binders-card-new'); return (${R})(all[all.length - 1]); })()`);
		await tap(p, last[0] + last[2] / 2, last[1] + last[3] / 2);
		t.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'a tap on the tile opens its field');
		const nav = await navbarTop(p), seen = [];
		for (const name of ['Coda one', 'Coda two', 'Coda three']) {
			await p.type(name);
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath(${j(L + name + '.md')})`);
			await p.sleep(600);
			seen.push(await p.ev(`(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { tag: a.tagName, top: Math.round(r.top), bottom: Math.round(r.bottom) }; })()`));
		}
		await shot(p, 'bug-new-note-next-field');
		t.ok(seen.every((s) => s.tag === 'INPUT'), 'the field for the next note has the focus each time: ' + j(seen));
		t.ok(seen.every((s) => s.bottom <= nav), `and is above the navigation bar (top ${nav}) each time: ${j(seen)}`);
	});
});

test('phone corkboard: the “New note” tile is a finger tall and names a note; the options sheet numbers and tints the cards; a folder is a stack, which a tap on its name opens', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}), fm => { fm.label = 'Red'; }).then(() => 1)`);
		await open(p);
		await p.ev(`(() => { document.querySelector('${LEAF} .binders-card-new').scrollIntoView({ block: 'center' }); return 1; })()`);
		await p.sleep(300);
		const tiles = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card-new')].map(${R})`);
		t.eq(tiles.length, 1, 'one “New note” tile ends the board');
		t.ok(tiles.every((r) => r[3] >= 40), 'the “New note” tile is 40 px tall or more: ' + j(tiles.map((r) => r[3])));
		await tap(p, tiles[0][0] + tiles[0][2] / 2, tiles[0][1] + tiles[0][3] / 2);
		t.eq(await p.ev(`document.activeElement.getAttribute('enterkeyhint')`), 'done', 'its field asks the keyboard for a Done key');
		await p.type('After the prologue');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'After the prologue.md')})`);
		await p.key('Escape');
		await p.sleep(300);
		await flush(p);
		t.eq(j((await contents(p)).slice(-2)), j(['Epilogue', 'After the prologue']), 'the note is made where its tile was: at the binder’s end');
		// the options, from the header's ⋮
		const more = await p.at(`${LEAF} .view-actions .clickable-icon[aria-label="More options"]`);
		const pick = async (title) => { await tap(p, more.x, more.y); await p.sleep(300); if (!(await menuTap(p, title))) throw new Error('no ' + title); await p.sleep(500); await gone(p); };
		await tap(p, more.x, more.y);
		await p.sleep(300);
		await shot(p, 'cork-options-sheet');
		t.ok(isSheet(await sheet(p)), 'the options are a sheet');
		for (const x of ['Card size', 'Tint cards with their label color', 'Number the cards', 'Outliner', 'Open binder note']) t.ok((await menuItems(p)).includes(x), `“${x}” is in it`);
		t.ok(!(await menuItems(p)).includes('Show subfolders as stacks'), 'and no “Show subfolders as stacks”: a folder is always one');
		await gone(p);
		await pick('Number the cards');
		await pick('Tint cards with their label color');
		await p.ev(`(() => { ${CORK}.scrollTop = 0; return 1; })()`);
		await p.sleep(300);
		await shot(p, 'cork-numbered-tinted-stacked');
		const o = (await viewState(p)).options;
		// (cards are tinted as they come: the item turns that off)
		t.ok(o.numbers === true && o.labelStyle === 'stripe', 'each option is changed: ' + j(o));
		t.eq(await p.ev(`document.querySelector(${j(card(L + 'Prologue.md'))} + ' .binders-card-number')?.textContent ?? null`), '1', 'the cards are numbered');
		t.ok(!(await p.ev(`document.querySelector('${LEAF} .binders-board').classList.contains('mod-label-tint')`)), 'and no longer tinted');
		const stack = await p.at(card(L + 'Part One') + ' .binders-card-title');
		t.ok(stack, 'Part One is a stack');
		await tap(p, stack.l + 20, stack.y);
		await until(p, `${VIEW}.folder?.path === ${j(L + 'Part One')}`);
		t.eq((await viewState(p)).folder, L + 'Part One', 'a tap on a stack’s title opens the folder');
		t.ok((await toolbar(p)).out <= 0, 'whose toolbar fits');
	});
});

bug('phone corkboard: a card size picked in the options sheet closes the sheet (it stays open, still ticking the old size)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const more = await p.at(`${LEAF} .view-actions .clickable-icon[aria-label="More options"]`);
		await tap(p, more.x, more.y);
		await p.sleep(300);
		t.ok(await menuTap(p, 'Card size'), 'Card size');
		await p.sleep(400);
		t.ok(await menuTap(p, 'Large'), 'Large');
		await p.sleep(1200);
		await shot(p, 'bug-card-size-sheet-stays');
		t.eq((await viewState(p)).options.cardSize, 'large', 'the size is set');
		const left = await p.ev(`[...document.querySelectorAll('.menu')].map(m => [...m.querySelectorAll('.menu-item')].map(i => (i.querySelector('.menu-item-title')?.textContent ?? '') + (i.querySelector('.menu-item-icon.mod-selected, .mod-checked, .menu-item-icon.mod-toggle svg') || i.classList.contains('mod-selected') ? '✓' : '')))`);
		t.eq(j(left), '[]', 'and no sheet is left open, as after a status or a column is picked');
	});
});

// =====================================================================================================================
// The outliner
// =====================================================================================================================

test('phone outliner: a column’s header opens its menu, “+” adds a column, a folder folds from a 40 px target, a tap on a selected row’s status sets it, a target is typed in place, and the totals clear the navigation bar', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y);
		await menuTap(p, 'Outliner');
		await until(p, `!!document.querySelector('${LEAF} .binders-outliner-row')`);
		await p.sleep(400);
		await shot(p, 'outliner-phone');
		t.ok(await p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'); return v.scrollWidth <= v.clientWidth; })()`), 'the view doesn’t scroll sideways, only the rows do');
		const size = await p.ev(`[${OUT}.scrollWidth, ${OUT}.clientWidth]`);
		t.ok(size[0] > size[1], 'the columns are wider than the screen: ' + j(size));
		// across: a swipe scrolls to the other columns, and moves nothing
		const a = await p.at(row('Part One/Arrival.md'));
		await swipe(p, 350, a.y, 60, a.y);
		// (how far there is to go: with the label a color alone and the title narrower, the columns nearly fit)
		t.ok(await p.ev(`${OUT}.scrollWidth - ${OUT}.clientWidth <= 1 || ${OUT}.scrollLeft > Math.min(40, (${OUT}.scrollWidth - ${OUT}.clientWidth) / 2)`), 'a swipe across scrolls to the other columns');
		t.eq((await selected(p)).length, 0, 'and selects nothing');
		await shot(p, 'outliner-phone-scrolled-across');
		// "+": the columns, as a sheet; Target is added
		const add = await p.at(`${LEAF} .binders-outliner-th.mod-add`);
		t.ok(add.w >= 32 && add.h >= 40, `“+” is ${Math.round(add.w)} × ${Math.round(add.h)} px`);
		await tap(p, add.x, add.y);
		t.ok(isSheet(await sheet(p)), '“+” opens the columns as a sheet');
		t.ok(await menuTap(p, 'Target'), 'Target');
		await p.sleep(500);
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'a pick closes it');
		t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-outliner-th[data-col="target"]')`), 'and the column is there');
		// a header: its menu (a tap can't sort and open a menu both)
		await p.ev(`(() => { ${OUT}.scrollLeft = 9999; return 1; })()`);
		await p.sleep(300);
		const th = await p.at(`${LEAF} .binders-outliner-th[data-col="status"]`);
		await tap(p, th.x, th.y);
		await shot(p, 'outliner-header-menu');
		t.eq(j(await menuItems(p)), j(['Sort ascending', 'Sort descending', 'Move left', 'Move right', 'Hide column']), 'a tap on a header opens its menu');
		await gone(p);
		// a status: the first tap selects the row, the second opens the statuses
		const sc = await p.at(cell('Part One/The keeper.md', 'status'));
		await tap(p, sc.x, sc.y);
		t.eq(j(await selected(p)), j([L + 'Part One/The keeper.md']), 'a tap on a row’s status selects the row');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and opens nothing');
		await tap(p, sc.x, sc.y);
		t.ok(isSheet(await sheet(p)) && (await menuItems(p)).includes('Revised'), 'a second tap opens the statuses');
		await menuTap(p, 'Revised');
		await p.sleep(500);
		await flush(p);
		t.eq(await prop(p, L + 'Part One/The keeper.md', 'status'), 'Revised', 'a pick sets it');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and closes the sheet');
		// a target, typed in its cell
		const tc = await p.at(cell('Part One/The keeper.md', 'target'));
		await tap(p, tc.x, tc.y);
		t.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'a tap on the selected row’s target edits it');
		await shot(p, 'outliner-target-editing');
		await p.type('1500');
		await p.key('Enter');
		await p.sleep(500);
		await flush(p);
		t.eq(await prop(p, L + 'Part One/The keeper.md', 'target'), '1500', 'Enter saves it');
		// folding
		await p.ev(`(() => { ${OUT}.scrollLeft = 0; return 1; })()`);
		await p.sleep(300);
		const ch = await p.at(`${row('Part One')} .binders-outliner-chevron`);
		t.ok(ch.w >= 40 && ch.h >= 40, `a folder’s fold target is ${Math.round(ch.w)} × ${Math.round(ch.h)} px`);
		const rows = () => p.ev(`document.querySelectorAll('${LEAF} .binders-outliner-row').length`);
		const n = await rows();
		await tap(p, ch.x, ch.y);
		t.eq(await rows(), n - 3, 'a tap folds the folder');
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'without opening it');
		await tap(p, ch.x, ch.y);
		t.eq(await rows(), n, 'and unfolds it');
		// the end: the last row and the totals above the navigation bar
		const end = await p.ev(`(() => { ${OUT}.scrollTop = ${OUT}.scrollHeight; const R = ${R}; return { foot: R(document.querySelector('${LEAF} .binders-outliner-foot')), text: document.querySelector('${LEAF} .binders-outliner-foot').textContent }; })()`);
		const nav = await navbarTop(p);
		await shot(p, 'outliner-end');
		t.ok(nav != null && end.foot[1] + end.foot[3] <= nav, `the totals row (${j(end.foot)}) is above the navigation bar (top ${nav})`);
		t.ok(/7 notes/.test(end.text), 'and counts the notes: ' + end.text);
	});
});

test('small phone outliner (320 px): the title isn’t pinned and scrolls with the columns, every column can be reached, and a long press drags a row', async (p, h, t) => {
	await onDevice(p, SMALL, async () => {
		await open(p);
		await setMode(p, 'outliner');
		await shot(p, 'outliner-320');
		t.eq(await p.ev(`getComputedStyle(document.querySelector('${row('Prologue.md')} .mod-title')).position`), 'relative', 'under 420 px the title column isn’t pinned');
		const words = () => p.at(cell('Prologue.md', 'words'));
		// (on a phone the label column is its color alone, and the others narrower: a title, a label, a status and the
		// words fit 320 px; "+" after them is what's cut by the edge)
		const fit = await words(), add = await p.at(`${LEAF} .binders-outliner-th.mod-add`);
		t.ok(fit.l >= 0 && fit.l + fit.w <= 320, 'the word counts are on the screen from the start: ' + j([Math.round(fit.l), Math.round(fit.w)]));
		t.ok(add.l + add.w > 320, '“+” runs off it: ' + j([Math.round(add.l), Math.round(add.w)]));
		const a = await p.at(row('Prologue.md'));
		// (a swipe across scrolls the columns while they can scroll; only at their end does it reach Obsidian, which
		// opens its sidebar, as anywhere else)
		await swipe(p, 300, a.y, 20, a.y);
		const end = await p.ev(`[${OUT}.scrollLeft, ${OUT}.scrollWidth - ${OUT}.clientWidth, !app.workspace.rightSplit.collapsed]`);
		t.ok(end[0] >= end[1] - 1 && end[0] > 10, 'a swipe across scrolls to the last column: ' + j(end));
		t.ok(!end[2], 'and doesn’t pull Obsidian’s sidebar in with it');
		const w = await words();
		await shot(p, 'outliner-320-scrolled-across');
		t.ok(w.l >= 0 && w.l + w.w <= 320, 'where the word counts are in view: ' + j([Math.round(w.l), Math.round(w.w)]));
		const plus = await p.at(`${LEAF} .binders-outliner-th.mod-add`);
		t.ok(plus.l >= 0 && plus.l + plus.w <= 320, 'and “+” with them');
		// a long press, then a move: Arrival out of Part One, to before Prologue
		await p.ev(`(() => { ${OUT}.scrollLeft = 0; ${OUT}.scrollTop = 0; return 1; })()`);
		await p.sleep(300);
		const e = await p.at(`${row('Part One/Arrival.md')} .binders-outliner-synopsis`), first = await p.at(row('Prologue.md'));
		await pressAndMove(p, e.x, e.y, e.x, first.t + 6);
		await shot(p, 'outliner-320-drag');
		t.ok(await p.ev(`document.querySelectorAll('.drag-ghost').length`) >= 1, 'a held row, moved, is dragged');
		await touch(p, 'touchEnd');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Arrival.md')})`);
		await p.sleep(500);
		await flush(p);
		t.eq(j((await contents(p)).slice(0, 3)), j(['Arrival', 'Prologue', 'Part One/']), 'and dropped before Prologue');
	});
});

ux('phone: a word count target is typed on a number pad (inputmode="numeric") in the outliner’s cell and in the “Set target” dialog', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'target' }] } }; v.setMode('outliner'); return 1; })()`);
		await until(p, `!!document.querySelector(${j(cell('Prologue.md', 'target'))})`);
		await p.sleep(400);
		const tc = await p.at(cell('Prologue.md', 'target'));
		await tap(p, tc.x, tc.y);
		await tap(p, tc.x, tc.y);
		const inCell = await p.ev(`({ tag: document.activeElement.tagName, inputMode: document.activeElement.inputMode })`);
		t.eq(inCell.tag, 'INPUT', 'the target’s field opens');
		await p.key('Escape');
		await p.sleep(300);
		await p.ev(`app.commands.executeCommandById('binders:set-target')`);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		const inDialog = await p.ev(`document.querySelector('.modal .binders-ask input').inputMode`);
		await closeDialog(p);
		t.ok(/numeric|decimal/.test(inCell.inputMode) && /numeric|decimal/.test(inDialog), `the fields ask for a number pad (cell: “${inCell.inputMode}”, dialog: “${inDialog}”)`);
	});
});

// =====================================================================================================================
// The manuscript
// =====================================================================================================================

test('phone manuscript: a tap puts the caret in that section, typing lands there with Obsidian’s editing toolbar acting on it, the page follows the caret above the keyboard, and scrolling away saves what was typed', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await open(p);
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y);
		await menuTap(p, 'Manuscript');
		await until(p, `!!document.querySelector('${LEAF} .binders-manuscript .cm-editor')`, 6000);
		await p.sleep(1200);
		await shot(p, 'manuscript-phone');
		t.eq(await p.ev(`document.activeElement.tagName`), 'BODY', 'switching to it puts no caret anywhere (so no keyboard comes up)');
		t.eq(await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-manuscript .cm-line')).fontSize`), await p.ev(`getComputedStyle(document.body).getPropertyValue('--font-text-size').trim() || '16px'`), 'its text is the size of a note’s');
		t.ok((await toolbar(p)).out <= 0 && await p.ev(`${MAN}.scrollWidth <= ${MAN}.clientWidth`), 'nothing sticks out sideways');
		// a tap in The keeper's text
		const at = await p.ev(`(() => { const r = (${scene('The keeper')}).querySelector('.cm-line').getBoundingClientRect(); return { x: r.left + 120, y: r.top + 12 }; })()`);
		await tap(p, at.x, at.y);
		await p.sleep(400);
		const where = await p.ev(`({ scene: document.activeElement.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null, editor: app.workspace.activeEditor?.file?.path ?? null, toolbar: (${R})(document.querySelector('.mobile-toolbar')), caret: Math.round(getSelection().getRangeAt(0).getBoundingClientRect().top) })`);
		await shot(p, 'manuscript-caret');
		t.eq(where.scene, 'The keeper', 'the caret is in the section tapped');
		t.ok(Math.abs(where.caret - (at.y - 8)) < 16, 'on the line tapped');
		t.eq(where.editor, L + 'Part One/The keeper.md', 'which is Obsidian’s active editor');
		t.ok(where.toolbar && where.toolbar[3] > 0, 'so its editing toolbar shows: ' + j(where.toolbar));
		await p.type('ZZ');
		t.ok(/ZZ/.test(await p.ev(`(${scene('The keeper')}).querySelector('.cm-content').innerText`)), 'typing lands there');
		// the keyboard comes up: the next thing typed brings the caret above it (and above the toolbar)
		await metrics(p, PHONE[0], PHONE[1] - KEYBOARD);
		await p.sleep(500);
		await p.type('Q');
		await p.sleep(400);
		const k = await p.ev(`({ caret: Math.round(getSelection().getRangeAt(0).getBoundingClientRect().bottom), toolbar: Math.round(document.querySelector('.mobile-toolbar').getBoundingClientRect().top), inner: innerHeight })`);
		await shot(p, 'manuscript-keyboard');
		t.ok(k.caret <= k.toolbar, `with the keyboard up, the caret (${k.caret}) is above the editing toolbar (${k.toolbar})`);
		// a command of the toolbar (bold) applies to this section's text
		await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, c = ed.getCursor(); ed.setSelection({ line: c.line, ch: c.ch - 3 }, c); return 1; })()`);
		await p.ev(`app.commands.executeCommandById('editor:toggle-bold')`);
		await p.sleep(300);
		t.ok(/\*\*ZZQ\*\*/.test(await p.ev(`(${scene('The keeper')}).querySelector('.cm-content').innerText`)), 'Bold wraps the selection in this section');
		await metrics(p, ...PHONE);
		await p.sleep(400);
		// scroll far away straight after typing: nothing typed is lost
		await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.setCursor(ed.getCursor('to')); return 1; })()`);
		await p.type(' unsaved');
		for (let i = 0; i < 3; i++) await swipe(p, 200, 650, 200, 250, 8);
		t.ok(await p.ev(`${MAN}.scrollTop`) > 400, 'swipes scroll the page');
		await until(p, `app.vault.adapter.read(${j(L + 'Part One/The keeper.md')}).then(x => /unsaved/.test(x))`, 6000);
		t.ok(/He met her at the\*\*ZZQ unsaved\*\* foot of the tower/.test(await read(p, L + 'Part One/The keeper.md')), 'what was typed is in the note: ' + (await read(p, L + 'Part One/The keeper.md')).trim().split('\n').pop());
		// the page's end clears the navigation bar
		await p.ev(`(() => { document.activeElement.blur(); ${MAN}.scrollTop = ${MAN}.scrollHeight; return 1; })()`);
		await p.sleep(700);
		const end = await p.ev(`(() => { const ss = document.querySelectorAll('${LEAF} .binders-manuscript-scene'); return Math.round(ss[ss.length - 1].getBoundingClientRect().bottom); })()`);
		const nav = await navbarTop(p);
		t.ok(nav == null || end <= nav, `the last section ends (${end}) above the navigation bar (${nav})`);
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (path !== L + 'Part One/The keeper.md') t.eq(after[path], text, `“${path}” is unchanged`);
});

test('phone manuscript: a tap on a title renames the note, its menu has the note’s items, “Split scene at cursor” works from the command palette, and the filter leaves only the notes that pass', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await setMode(p, 'manuscript');
		const title = (name) => p.ev(`(() => { const r = (${scene(name)}).querySelector('.binders-manuscript-title').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		// the menu a long press asks for on a device
		await p.ev(`(() => { const e = (${scene('Prologue')}).querySelector('.binders-manuscript-title'), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10, button: 0 })); return 1; })()`);
		await p.sleep(500);
		await shot(p, 'manuscript-title-menu');
		const items = await menuItems(p);
		t.ok(isSheet(await sheet(p)), 'a title’s menu is a sheet');
		for (const x of ['Open', 'Rename', 'Set status', 'Set label', 'New note after this', 'Delete']) t.ok(items.includes(x), `“${x}” is in it`);
		t.ok(!items.includes('Edit synopsis'), 'no “Edit synopsis” where there’s no synopsis to edit');
		await gone(p);
		// a tap: the title is edited in place
		let at = await title('Prologue');
		await tap(p, at.x, at.y);
		t.eq(j(await p.ev(`[document.activeElement.classList.contains('is-renaming'), getSelection().toString()]`)), j([true, 'Prologue']), 'a tap on a title selects it for renaming');
		await shot(p, 'manuscript-title-renaming');
		await p.type('Opening');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Opening.md')})`);
		await p.sleep(500);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Opening.md')})`), 'Enter renames the note');
		t.eq(await p.ev(`document.activeElement.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), 'Opening', 'and the caret goes into its text');
		await flush(p);
		t.eq((await contents(p))[0], 'Opening', 'in the same place in the binder');
		// split Arrival where the caret is, from the command palette
		const line = await p.ev(`(() => { const r = (${scene('Arrival')}).querySelector('.cm-line').getBoundingClientRect(); return { x: r.left + 150, y: r.top + 12 }; })()`);
		await tap(p, line.x, line.y);
		await p.sleep(400);
		await p.ev(`app.commands.executeCommandById('command-palette:open')`);
		await until(p, `!!document.querySelector('.prompt input')`);
		await p.type('Split scene at');
		await p.sleep(500);
		await shot(p, 'manuscript-palette');
		const first = await p.at('.prompt .suggestion-item');
		t.ok(/Split scene at cursor/.test(await p.ev(`document.querySelector('.prompt .suggestion-item')?.textContent ?? ''`)), 'the command is offered with the caret in a section');
		await tap(p, first.x, first.y);
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival 2.md')})`, 5000);
		await p.sleep(600);
		await shot(p, 'manuscript-split');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-title')].map(e => e.textContent).slice(0, 4)`)), j(['Opening', 'Arrival', 'Arrival 2', 'The keeper']), 'the section is split in two, in place');
		const a = await read(p, L + 'Part One/Arrival.md'), b2 = await read(p, L + 'Part One/Arrival 2.md');
		t.ok((a.split('---\n').pop() + b2.split('---\n').pop()).replace(/\s+/g, ' ').includes('The supply boat left Mara on the jetty with two cases and a letter she had not opened.'.replace(/\s+/g, ' ')) || (a + b2).replace(/\s+/g, '').includes('ThesupplyboatleftMaraonthejettywithtwocasesandalettershehadnotopened.'), 'no text is lost between the two');
		// the filter
		await p.ev(`document.activeElement.blur()`);
		const f = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, f.x, f.y);
		t.ok(await menuTap(p, 'Idea'), 'Idea, in the filter');
		await p.sleep(700);
		await gone(p);
		await p.sleep(500);
		await shot(p, 'manuscript-filtered');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-title')].map(e => e.textContent)`)), j(['Storm warning', 'Lights out', 'Epilogue']), 'only the notes with that status show');
		t.ok(/ of /.test(await p.ev(`document.querySelector('${LEAF} .binders-word-count').textContent`)), 'and the count says how many words of how many');
		t.ok((await toolbar(p)).out <= 0 && (await toolbar(p)).overlap.length === 0, 'with the toolbar still fitting: ' + j(await toolbar(p)));
	});
});

// =====================================================================================================================
// The filter
// =====================================================================================================================

test('phone: the filter is picked by touch in a sheet that stays for the next pick, the button counts what’s picked, and “Clear filter” takes it off', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const f = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, f.x, f.y);
		await menuTap(p, 'Draft');
		await p.sleep(500);
		t.eq(j((await viewState(p)).filter), j({ status: ['Draft'], label: [] }), 'a status picked');
		t.ok((await menuItems(p)).includes('Clear filter'), 'the sheet is still there, now with “Clear filter”');
		await menuTap(p, 'Idea');
		await p.sleep(500);
		t.eq(j((await viewState(p)).filter.status), j(['Draft', 'Idea']), 'and another');
		await gone(p);
		await shot(p, 'filter-on');
		t.eq(await p.ev(`document.querySelector('${LEAF} .binders-filter-button').getAttribute('aria-label') + '|' + document.querySelector('${LEAF} .binders-filter-button').classList.contains('is-active')`), 'Filter: 2 on|true', 'the button shows the filter is on, and how many picks it has (since 0.12.93)');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'of the binder’s own notes, only the ones that pass show (both do), beside the folders’ stacks');
		await open(p, L + 'Part One');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`)), j(['The keeper.md', 'Storm warning.md']), 'and inside a folder only its notes that pass (Arrival, revised, doesn’t)');
		await open(p);
		t.ok((await toolbar(p)).out <= 0 && (await toolbar(p)).overlap.length === 0, 'the toolbar still fits, with the longer count');
		await tap(p, f.x, f.y);
		await menuTap(p, 'Clear filter');
		await p.sleep(500);
		t.eq(j((await viewState(p)).filter), j({ status: [], label: [] }), '“Clear filter” takes it off');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and closes the sheet');
		t.eq(await p.ev(`document.querySelector('${LEAF} .binders-filter-button').getAttribute('aria-label') + '|' + document.querySelector('${LEAF} .binders-filter-button').classList.contains('is-active')`), 'Filter|false', 'with no filter the button says just “Filter”');
	});
});

ux('phone: the filter sheet stays put between picks (after each pick it’s closed and opened again, so it slides up from the bottom of the screen every time)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const f = await p.at(`${LEAF} .binders-filter-button`);
		await tap(p, f.x, f.y);
		await menuTap(p, 'Draft');
		await p.sleep(900);
		// the second pick, with the sheet's top watched every frame
		const at = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'Idea'); const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
		await p.ev(`(() => { const rec = window.__qa4 = []; const t0 = performance.now(); const fn = () => { const m = [...document.querySelectorAll('.menu')].pop(); rec.push(m ? Math.round(m.getBoundingClientRect().top) : null); if (performance.now() - t0 < 900) requestAnimationFrame(fn); }; requestAnimationFrame(fn); return 1; })()`);
		await touch(p, 'touchStart', at.x, at.y);
		await p.sleep(40);
		await touch(p, 'touchEnd');
		await p.sleep(1100);
		const tops = await p.ev(`window.__qa4`), rest = tops[tops.length - 1];
		t.ok(rest != null, 'the sheet is there after the pick');
		const lowest = Math.max(...tops.filter((x) => x != null));
		t.ok(tops.every((x) => x != null) && lowest - rest <= 24, `the sheet holds still (it rests at ${rest} px; during the pick its top went as low as ${lowest} px${tops.some((x) => x == null) ? ', and for a frame there was none' : ''})`);
	});
});

// =====================================================================================================================
// Dialogs and settings
// =====================================================================================================================

test('small phone (320 px): every dialog fits the screen, with its buttons a finger tall and reachable, also with the keyboard up; the Compile dialog scrolls to its buttons', async (p, h, t) => {
	await onDevice(p, SMALL, async () => {
		await open(p);
		const fits = (d, what) => {
			t.ok(d.box[0] >= 0 && d.box[0] + d.box[2] <= d.inner[0] && d.box[1] >= 0 && d.box[1] + d.box[3] <= d.inner[1], `${what}: the dialog is on the screen (${j(d.box)} in ${j(d.inner)})`);
			t.ok(d.buttons.length >= 2 && d.buttons.every((b) => b.rect[3] >= 44 && b.rect[0] >= d.box[0] && b.rect[0] + b.rect[2] <= d.box[0] + d.box[2]), `${what}: its buttons are 44 px tall and inside it: ${j(d.buttons.map((b) => [b.text, ...b.rect]))}`);
			t.ok(d.fields.every((f) => f.rect[3] >= 40 && f.rect[0] >= d.box[0] && f.rect[0] + f.rect[2] <= d.box[0] + d.box[2]), `${what}: its fields are 40 px tall and inside it`);
		};
		/** With the keyboard up: the dialog still fits, and whatever doesn't fit in it scrolls. */
		const withKeyboard = async (what) => {
			await metrics(p, SMALL[0], SMALL[1] - KEYBOARD_SMALL);
			await p.sleep(500);
			const d = await dialog(p);
			await shot(p, `dialog-320-${what}-keyboard`);
			t.ok(d.box[1] >= 0 && d.box[1] + d.box[3] <= d.inner[1], `${what}, keyboard up: the dialog fits what’s left of the screen (${j(d.box)} in ${j(d.inner)})`);
			// its last button can be scrolled to
			const reach = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(), b = [...m.querySelectorAll('.modal-button-container button')]; let low = 0; for (const x of b) { x.scrollIntoView({ block: 'nearest' }); low = Math.max(low, Math.round(x.getBoundingClientRect().bottom)); } return [low, Math.round(m.getBoundingClientRect().bottom)]; })()`);
			t.ok(reach[0] <= reach[1], `${what}, keyboard up: every button can be scrolled into the dialog (${j(reach)})`);
			await metrics(p, ...SMALL);
			await p.sleep(400);
		};
		// Set target (from the command: at 320 px the toolbar has no count to tap)
		await p.ev(`app.commands.executeCommandById('binders:set-target')`);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(500);
		await shot(p, 'dialog-320-target');
		fits(await dialog(p), 'Set target');
		await withKeyboard('target');
		// something that isn't a number: said in the dialog, which stays
		await p.type('abc');
		await p.key('Enter');
		await p.sleep(400);
		t.eq(await p.ev(`document.querySelector('.binders-ask-error')?.textContent`), 'A target is a whole number of words.', 'what’s wrong is said in the dialog');
		t.eq(await dialogs(p), 1, 'which stays open');
		await closeDialog(p);
		t.eq(await dialogs(p), 0, 'its ✕ closes it');
		// New status
		await cardMenu(p, 'Prologue.md');
		await menuTap(p, 'Set status');
		await p.sleep(300);
		await menuTap(p, 'New status...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(500);
		let d = await dialog(p);
		await shot(p, 'dialog-320-status');
		fits(d, 'New status');
		t.eq(d.menus, 0, 'New status: no sheet over it');
		await p.type('Proofread');
		await dialogTap(p, 'Set status');
		await flush(p);
		t.eq(await prop(p, L + 'Prologue.md', 'status'), 'Proofread', 'the new status is set');
		// Custom color
		await cardMenu(p, 'Prologue.md');
		await menuTap(p, 'Set label');
		await p.sleep(300);
		await menuTap(p, 'Custom color...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(500);
		d = await dialog(p);
		await shot(p, 'dialog-320-color');
		fits(d, 'Custom color');
		const well = await rect(p, '.modal input[type="color"]');
		t.ok(well && well[2] >= 40 && well[3] >= 40 && well[0] + well[2] <= d.box[0] + d.box[2], 'the color well is a finger wide, beside the field: ' + j(well));
		await withKeyboard('color');
		await closeDialog(p);
		// Delete
		await cardMenu(p, 'Prologue.md');
		await menuTap(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(500);
		d = await dialog(p);
		await shot(p, 'dialog-320-delete');
		fits(d, 'Delete');
		await dialogTap(p, 'Cancel');
		// Compile: longer than the screen, so it scrolls
		await p.ev(`app.commands.executeCommandById('binders:compile')`);
		await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
		await p.sleep(600);
		d = await dialog(p);
		await shot(p, 'dialog-320-compile');
		t.ok(d.box[0] >= 0 && d.box[0] + d.box[2] <= 320 && d.box[1] >= 0 && d.box[1] + d.box[3] <= SMALL[1], 'Compile: the dialog is on the screen: ' + j(d.box));
		t.ok(d.scrolls > 100, 'Compile: its settings scroll');
		t.eq(j(d.buttons.map((b) => b.text)), j(['Compile', 'Copy', 'Cancel']), 'Compile: three buttons');
		const low = await p.ev(`(() => { const m = document.querySelector('.modal'), c = m.querySelector('.modal-content'); c.scrollTop = c.scrollHeight; return [...m.querySelectorAll('.modal-button-container button')].map(b => Math.round(b.getBoundingClientRect().bottom)).concat(Math.round(m.getBoundingClientRect().bottom)); })()`);
		await p.sleep(300);
		await shot(p, 'dialog-320-compile-end');
		t.ok(low.slice(0, 3).every((y) => y <= low[3]), 'Compile: scrolled to its end, the buttons are inside it: ' + j(low));
		t.ok(await p.ev(`(() => { const m = document.querySelector('.modal'); return [...m.querySelectorAll('.setting-item')].every(s => { const r = s.getBoundingClientRect(), b = m.getBoundingClientRect(); return r.left >= b.left && r.right <= b.right; }); })()`), 'Compile: no setting is wider than the dialog');
		await dialogTap(p, 'Compile');
		await until(p, `!!app.vault.getAbstractFileByPath('The Lighthouse (compiled).md')`, 5000);
		t.ok(/The light had not gone out/.test(await read(p, 'The Lighthouse (compiled).md')), 'and Compile writes the note');
	});
});

bug('small phone (320 px): a dialog’s title can be read whole (“Word count target for the binder” and “Compile “The Lighthouse”” are cut off under the ✕, with no ellipsis)', async (p, h, t) => {
	await onDevice(p, SMALL, async () => {
		await open(p);
		const cut = {};
		await p.ev(`app.commands.executeCommandById('binders:set-target')`);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		await shot(p, 'bug-dialog-title-cut');
		let d = await dialog(p);
		cut.target = [d.titleCut, d.titleUnderClose];
		await closeDialog(p);
		await p.ev(`app.commands.executeCommandById('binders:compile')`);
		await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
		await p.sleep(400);
		await shot(p, 'bug-dialog-title-cut-compile');
		d = await dialog(p);
		cut.compile = [d.titleCut, d.titleUnderClose];
		await closeDialog(p);
		t.ok(cut.target.every((x) => x <= 0) && cut.compile.every((x) => x <= 0), `px of each title [cut off, under the ✕]: ${j(cut)}`);
	});
});

bug('phone: the Compile dialog says what it will do (its first line, “7 notes, in binder order, become one note…”, is squashed to 4 px and can’t be seen)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await p.ev(`app.commands.executeCommandById('binders:compile')`);
		await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
		await p.sleep(500);
		await shot(p, 'bug-compile-description');
		const d = await p.ev(`(() => { const e = document.querySelector('.modal .modal-content > p'), s = getComputedStyle(e); return { text: e.textContent.slice(0, 40), height: Math.round(e.getBoundingClientRect().height), lineHeight: s.lineHeight, fontSize: s.fontSize, flexShrink: s.flexShrink, overflow: s.overflow, minHeight: s.minHeight, parent: getComputedStyle(e.parentElement).display + ' ' + getComputedStyle(e.parentElement).flexDirection }; })()`);
		await closeDialog(p);
		t.ok(/^7 notes, in binder order/.test(d.text), 'the line is there: ' + d.text);
		t.ok(d.height >= 16, 'and tall enough to read: ' + j(d));
	});
});

ux('phone: Binders’ dialogs look like Obsidian’s own there: a sheet along the bottom (`mod-confirmation`), the action above and Cancel last, a deletion’s button filled (`mod-destructive`)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const look = () => p.ev(`(() => { const c = [...document.querySelectorAll('.modal-container')].pop(), m = c.querySelector('.modal'), r = m.getBoundingClientRect(); const bs = [...m.querySelectorAll('.modal-button-container button')].map(b => ({ text: b.textContent, top: Math.round(b.getBoundingClientRect().top), cls: b.className })).sort((a, b) => a.top - b.top); return { sheet: c.classList.contains('mod-confirmation'), box: [Math.round(r.left), Math.round(r.width), Math.round(innerHeight - r.bottom)], order: bs.map(b => b.text), last: bs[bs.length - 1], first: bs[0] }; })()`);
		// Obsidian's own question before deleting a note
		await p.ev(`(() => { app.fileManager.promptForDeletion(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')})); return 1; })()`);
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(500);
		const native = await look();
		await shot(p, 'ux-dialog-native-delete');
		await dialogTap(p, 'Cancel');
		// Binders' own
		await cardMenu(p, 'Epilogue.md');
		await menuTap(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(500);
		const ours = await look();
		await shot(p, 'ux-dialog-binders-delete');
		await dialogTap(p, 'Cancel');
		await p.ev(`app.commands.executeCommandById('binders:set-target')`);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(500);
		const target = await look();
		await shot(p, 'ux-dialog-binders-target');
		await closeDialog(p);
		t.ok(native.sheet && native.box[0] === 0 && native.box[1] === PHONE[0] && native.box[2] === 0 && native.last.text === 'Cancel', 'Obsidian’s own is a sheet with Cancel last: ' + j(native));
		t.eq(j([ours.sheet, ours.box, ours.order]), j([native.sheet, native.box, native.order]), 'Binders’ “Delete note” is laid out the same');
		t.ok(/mod-destructive|mod-cta/.test(ours.first.cls), 'its Delete button is filled, as Obsidian’s is: ' + ours.first.cls + ' (Obsidian: ' + native.first.cls + ')');
		t.ok(target.sheet && target.last.text === 'Cancel', '“Set target” is a sheet with Cancel last too: ' + j(target));
	});
});

test('small phone (320 px): in the settings, a label’s name, color, well, delete and drag handle all fit and can be hit; statuses and property names too', async (p, h, t) => {
	await onDevice(p, SMALL, async () => {
		await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
		await until(p, `app.setting.activeTab?.containerEl.querySelectorAll('.binders-settings-label').length > 0`);
		await p.sleep(600);
		const TAB = `app.setting.activeTab.containerEl`;
		const see = async (sel, name) => { await p.ev(`(() => { ${TAB}.querySelector(${j(sel)}).scrollIntoView({ block: 'start' }); return 1; })()`); await p.sleep(300); await shot(p, name); };
		await see('.binders-settings-labels', 'settings-320-labels');
		t.ok(await p.ev(`${TAB}.scrollWidth <= ${TAB}.clientWidth + 1`), 'nothing is wider than the screen');
		const rows = await p.ev(`(() => { const R = ${R}; const of = (row) => ({ row: R(row), name: R(row.querySelector('.setting-item-name input')), select: R(row.querySelector('select')), well: R(row.querySelector('input[type="color"]')), icons: [...row.querySelectorAll('.setting-item-control .clickable-icon, .setting-item-control .extra-setting-button')].map(e => [e.getAttribute('aria-label'), ...R(e)]) }); return { labels: [...${TAB}.querySelectorAll('.binders-settings-label')].map(of), statuses: [...${TAB}.querySelectorAll('.binders-settings-status')].map(of), props: [...${TAB}.querySelectorAll('.setting-item:not(.binders-settings-label):not(.binders-settings-status):not(.binders-settings-goal) input[type="text"]')].map(R), text: ${TAB}.innerText }; })()`);
		t.eq(rows.labels.length, 8, 'eight labels');
		for (const r of rows.labels) {
			const parts = [r.name, r.select, r.well, ...r.icons.map((i) => i.slice(1))];
			t.ok(parts.every((x) => x && x[0] >= r.row[0] && x[0] + x[2] <= r.row[0] + r.row[2] + 1), 'a label row’s parts are all inside it: ' + j(r));
			t.ok(r.name[2] >= 200 && r.name[3] >= 40, 'its name is wide enough to read and a finger tall: ' + j(r.name));
			t.ok(r.select[3] >= 40 && r.well[2] >= 40 && r.well[3] >= 40, 'its color menu and well are a finger tall: ' + j([r.select, r.well]));
			// side by side, nothing on top of anything
			const line = [r.select, r.well, ...r.icons.map((i) => i.slice(1))].sort((a, b) => a[0] - b[0]);
			for (let i = 1; i < line.length; i++) t.ok(line[i][0] >= line[i - 1][0] + line[i - 1][2], 'its controls don’t overlap: ' + j(line));
			t.eq(j(r.icons.map((i) => i[0])), j(['Delete', 'Drag to rearrange']), 'with Obsidian’s own delete and drag handle');
		}
		await see('.binders-settings-statuses', 'settings-320-statuses');
		t.eq(rows.statuses.length, 4, 'four statuses');
		t.ok(rows.statuses.every((r) => r.name[2] >= 200 && r.name[3] >= 40), 'a status’s name is wide and tall enough');
		t.ok(/Add label/.test(rows.text) && /Add status/.test(rows.text), 'the lists end in “Add label” and “Add status”');
		t.eq(rows.props.length, 4, 'four property names');
		t.ok(rows.props.every((r) => r[2] >= 200 && r[3] >= 40), 'each field wide and tall enough: ' + j(rows.props));
		// a name typed by touch is kept
		const first = `${TAB}.querySelector('.binders-settings-status .setting-item-name input')`;
		await p.ev(`(() => { ${first}.scrollIntoView({ block: 'center' }); return 1; })()`);
		await p.sleep(300);
		const f = await p.ev(`(${R})(${first})`);
		await tap(p, f[0] + f[2] / 2, f[1] + f[3] / 2);
		t.ok(await p.ev(`document.activeElement === ${first}`), 'a tap on a status’s name puts the caret in it');
		await p.ev(`(() => { ${first}.select(); return 1; })()`);
		await p.type('Sketch');
		await p.key('Enter');
		await p.sleep(500);
		t.eq(await p.ev(`${PL}.settings.statuses[0]`), 'Sketch', 'and Enter keeps the new name');
		await p.ev(`(() => { ${TAB}.scrollTop = ${TAB}.scrollHeight; const s = [...(function* () { let e = ${TAB}; while (e) { yield e; e = e.parentElement; } })()].find(e => e.scrollHeight > e.clientHeight + 2); if (s) s.scrollTop = s.scrollHeight; return 1; })()`);
		await p.sleep(300);
		await shot(p, 'settings-320-properties');
	});
});

ux('phone: in the settings a status is one row (its name, then delete and the drag handle beside it); it takes two, the icons alone on the second, 112 px in all', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
		await until(p, `app.setting.activeTab?.containerEl.querySelectorAll('.binders-settings-status').length > 0`);
		await p.sleep(600);
		const r = await p.ev(`(() => { const R = ${R}; const row = app.setting.activeTab.containerEl.querySelector('.binders-settings-status'); row.scrollIntoView({ block: 'center' }); return { row: R(row), name: R(row.querySelector('.setting-item-name input')), icon: R(row.querySelector('.setting-item-control .clickable-icon')) }; })()`);
		await p.sleep(300);
		await shot(p, 'ux-settings-status-row');
		t.ok(r.icon[1] < r.name[1] + r.name[3], `the icons are on the name’s line: ${j(r)}`);
	});
});

// =====================================================================================================================
// The file explorer
// =====================================================================================================================

test('phone file explorer: the binder is in its own order with its icon and label dots, a tap on it opens the binder, a chevron only unfolds, and the rows’ menus have Binders’ items, which work', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}), fm => { fm.label = 'Red'; }); })().then(() => 1)`);
		await tap(p, TOGGLE.x, TOGGLE.y);
		await p.sleep(700);
		t.ok(await drawerOpen(p), 'the drawer opens');
		await shot(p, 'explorer-drawer');
		t.ok(await p.ev(`!!document.querySelector(${j(explorerRow('The Lighthouse') + ' .binders-folder-tag')})`), 'the binder has its icon');
		// a tap on the binder: it opens, the drawer goes, as when a note is tapped
		const bf = await p.at(explorerRow('The Lighthouse'));
		await tap(p, bf.x, bf.y);
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view'`);
		await p.sleep(500);
		t.eq((await viewState(p))?.folder, 'The Lighthouse', 'a tap on the binder opens it');
		t.ok(!(await drawerOpen(p)), 'and the drawer closes');
		// back in the drawer: the binder is unfolded, in binder order (not by name)
		await tap(p, TOGGLE.x, TOGGLE.y);
		await p.sleep(700);
		await shot(p, 'explorer-binder-unfolded');
		const rows = await p.ev(`[...document.querySelectorAll('.nav-files-container .tree-item-self')].map(e => e.dataset.path).filter(x => x.startsWith('The Lighthouse/'))`);
		t.eq(j(rows), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'in binder order, without the binder note');
		const dot = await p.ev(`(() => { const d = document.querySelector(${j(explorerRow(L + 'Prologue.md') + ' .binders-explorer-label')}); if (!d) return null; const r = d.getBoundingClientRect(), row = d.parentElement.getBoundingClientRect(); return { size: Math.round(r.width), fromEnd: Math.round(row.right - r.right), color: getComputedStyle(d).backgroundColor }; })()`);
		t.ok(dot && dot.size === 10 && dot.fromEnd >= 0 && dot.fromEnd < 40 && dot.color !== 'rgba(0, 0, 0, 0)', 'a labeled note has its dot at the row’s end: ' + j(dot));
		// a folder's chevron unfolds it and opens nothing
		const ch = await p.at(explorerRow(L + 'Part One') + ' .collapse-icon');
		await tap(p, ch.x, ch.y);
		await p.sleep(600);
		t.ok(await p.ev(`!!document.querySelector(${j(explorerRow(L + 'Part One/Arrival.md'))})`), 'a tap on a folder’s chevron unfolds it');
		t.ok(await drawerOpen(p) && (await viewState(p)).folder === 'The Lighthouse', 'and opens nothing');
		t.eq(j(await p.ev(`[...document.querySelectorAll('.nav-files-container .tree-item-self')].map(e => e.dataset.path).filter(x => x.startsWith(${j(L + 'Part One/')}))`)), j([L + 'Part One/Arrival.md', L + 'Part One/The keeper.md', L + 'Part One/Storm warning.md']), 'its notes are in binder order');
		// a note's menu
		await explorerMenu(p, L + 'Part One/The keeper.md');
		await shot(p, 'explorer-note-menu');
		let items = await menuItems(p);
		t.ok(isSheet(await sheet(p)), 'a note’s menu is a sheet');
		for (const x of ['Show in binder', 'New scene after this', 'Move up', 'Move down']) t.ok(items.includes(x), `“${x}” is in a note’s menu`);
		t.ok(await menuTap(p, 'Show in binder'), 'Show in binder');
		await until(p, `${VIEW}?.folder?.path === ${j(L + 'Part One')}`);
		await p.sleep(600);
		await shot(p, 'explorer-show-in-binder');
		t.ok(!(await drawerOpen(p)), '“Show in binder” closes the drawer');
		t.eq(j(await selected(p)), j([L + 'Part One/The keeper.md']), 'and shows the note’s folder with its card selected');
		// the binder's menu
		await showExplorer(p);
		await explorerMenu(p, 'The Lighthouse');
		await shot(p, 'explorer-binder-menu');
		items = await menuItems(p);
		for (const x of ['Open binder', 'New scene here', 'Compile...']) t.ok(items.includes(x), `“${x}” is in the binder’s menu`);
		t.ok(!items.includes('Make this folder a binder'), 'and not “Make this folder a binder”');
		t.ok(await menuTap(p, 'Compile...'), 'Compile...');
		await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
		await p.sleep(400);
		await shot(p, 'explorer-compile');
		const d = await dialog(p);
		t.eq(d.title, 'Compile “The Lighthouse”', 'Compile opens over the drawer');
		t.eq(d.menus, 0, 'with no sheet left');
		await closeDialog(p);
		// Move down, from the menu: the order changes, in the explorer too
		await explorerMenu(p, L + 'Part One/Arrival.md');
		t.ok(await menuTap(p, 'Move down'), 'Move down');
		await p.sleep(700);
		await flush(p);
		t.eq(j((await contents(p)).slice(1, 5)), j(['Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning']), 'the note moves down');
		t.eq(j(await p.ev(`[...document.querySelectorAll('.nav-files-container .tree-item-self')].map(e => e.dataset.path).filter(x => x.startsWith(${j(L + 'Part One/')}))`)), j([L + 'Part One/The keeper.md', L + 'Part One/Arrival.md', L + 'Part One/Storm warning.md']), 'in the explorer too');
	});
});

bug('phone file explorer: “New scene after this”, with the binder open behind the drawer, leaves the new note’s name ready to type (the drawer stays, the note is “Untitled”, and nothing is being named)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		// Obsidian's own "New note", for what's expected: the drawer goes and the title is ready to type over
		await showExplorer(p);
		await explorerMenu(p, 'Longform demo');
		await menuTap(p, 'New note');
		await until(p, `app.workspace.getActiveFile()?.path === 'Longform demo/Untitled.md'`);
		await p.sleep(600);
		const native = { drawer: await drawerOpen(p), naming: await p.ev(`document.activeElement.classList.contains('inline-title') && getSelection().toString() === 'Untitled'`) };
		t.eq(j(native), j({ drawer: false, naming: true }), 'Obsidian’s own “New note”: the drawer closes, the name is selected');
		// the same from Binders, with no binder view open: as Obsidian's
		await showExplorer(p);
		await explorerMenu(p, L + 'Part One/The keeper.md');
		await menuTap(p, 'New scene after this');
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Part One/Untitled.md')}`);
		await p.sleep(600);
		t.eq(j({ drawer: await drawerOpen(p), naming: await p.ev(`document.activeElement.classList.contains('inline-title') && getSelection().toString() === 'Untitled'`) }), j(native), 'Binders’ “New scene after this”, with a note open: the same');
		// with the board of the note's folder open in the tab (the binder's own board has no card for it: see the BUG below)
		await open(p, L + 'Part One');
		await showExplorer(p);
		await explorerMenu(p, L + 'Part One/Arrival.md');
		await menuTap(p, 'New scene after this');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Untitled 1.md')})`);
		await p.sleep(1200);
		await shot(p, 'bug-explorer-new-scene');
		const ours = { drawer: await drawerOpen(p), naming: await p.ev(`(() => { const a = document.activeElement; return (a.matches('input, textarea') || a.isContentEditable) && /Untitled 1/.test(a.value ?? a.textContent ?? ''); })()`) };
		t.eq(j(ours), j(native), 'with the binder open behind the drawer: the drawer closes and the new note’s name is ready to type over');
	});
});

// Round 7: the corkboard shows one folder at a time, so a note made inside a subfolder has no card on the binder's own board.
specs.push({ name: 'BUG: qa7: mobile: phone file explorer: “New scene after this” on a note inside a folder, with the binder’s own corkboard open behind the drawer, leaves the new note’s name ready to type (the drawer closes on a board that has no card for it: the note is “Untitled”, nothing is being named, and nothing shows where it went)', fn: async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await showExplorer(p);
		await explorerMenu(p, L + 'Part One/Arrival.md');
		await menuTap(p, 'New scene after this');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Untitled.md')})`);
		await p.sleep(1500);
		await shot(p, 'bug7-explorer-new-scene');
		await flush(p);
		t.eq(j((await contents(p)).slice(1, 4)), j(['Part One/', 'Part One/Arrival', 'Part One/Untitled']), 'the note is made after Arrival');
		const ours = { drawer: await drawerOpen(p), naming: await p.ev(`(() => { const a = document.activeElement; return (a.matches('input, textarea') || a.isContentEditable) && /Untitled/.test(a.value ?? a.textContent ?? ''); })()`), folder: (await viewState(p))?.folder ?? null, file: await p.ev(`app.workspace.getActiveFile()?.path ?? null`), card: await p.ev(`!!document.querySelector(${j(card(L + 'Part One/Untitled.md'))})`) };
		t.ok(!ours.drawer && ours.naming, 'the drawer closes and the new note’s name is ready to type over (on its folder’s board, or in the note itself): ' + j(ours));
	});
} });

ux('phone file explorer: a tap on a folder inside a binder unfolds it and leaves the drawer open, so its notes can be reached (it opens the folder’s board and closes the drawer; only the 16 × 21 px chevron unfolds)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await showExplorer(p, ['The Lighthouse']);
		const row = await p.at(explorerRow(L + 'Part One')), ch = await p.at(explorerRow(L + 'Part One') + ' .collapse-icon');
		await tap(p, row.x + 30, row.y);
		await p.sleep(900);
		await shot(p, 'ux-explorer-folder-tap');
		const after = { drawer: await drawerOpen(p), unfolded: await p.ev(`!!document.querySelector(${j(explorerRow(L + 'Part One/Arrival.md'))})`) };
		t.ok(after.drawer && after.unfolded, `after a tap on “Part One”: ${j(after)}; its chevron, the only way to unfold it in place, is ${Math.round(ch.w)} × ${Math.round(ch.h)} px`);
	});
});

// =====================================================================================================================
// Rotation, large text, the tablet
// =====================================================================================================================

test('phone: turned on its side and back, and with text at 22 px, every mode still fits and nothing overlaps', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const check = async (what) => {
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await setMode(p, mode);
				const bar = await toolbar(p);
				await shot(p, `${what}-${mode}`);
				t.ok(bar.out <= 0 && bar.overlap.length === 0, `${what}, ${mode}: the toolbar fits (${j(bar)})`);
				t.ok(await p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'); return v.scrollWidth <= v.clientWidth && v.getBoundingClientRect().right <= innerWidth; })()`), `${what}, ${mode}: nothing sticks out sideways`);
			}
			await setMode(p, 'corkboard');
		};
		await metrics(p, PHONE[1], PHONE[0]);
		await p.sleep(800);
		await check('landscape');
		t.ok(await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-cards')).gridTemplateColumns.trim().split(/\\s+/).length`) >= 2, 'on its side, the cards are in columns');
		t.eq(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-crumb')].filter(e => e.getBoundingClientRect().width > 0).map(e => e.textContent).join(' › ')`), 'The Lighthouse › Part One', 'and the breadcrumb has room for both folders');
		await metrics(p, ...PHONE);
		await p.sleep(800);
		await check('portrait-again');
		t.eq(await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-cards')).gridTemplateColumns.trim().split(/\\s+/).length`), 1, 'upright again, one column');
		// large text
		await p.ev(`(() => { app.vault.setConfig('baseFontSize', 22); app.updateFontSize?.(); return 1; })()`);
		await p.sleep(800);
		await open(p);
		t.eq(await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-card-title')).fontSize`), '22px', 'at 22 px, the cards’ text grows with it');
		await check('large-text');
		const nav = await navbarTop(p);
		const end = await p.ev(`(() => { const s = ${CORK}; s.scrollTop = s.scrollHeight; const cs = s.querySelectorAll('.binders-card'); return Math.round(cs[cs.length - 1].getBoundingClientRect().bottom); })()`);
		t.ok(end <= nav, 'and the board’s end still clears the navigation bar');
		await metrics(p, ...SMALL);
		await p.sleep(600);
		await check('large-text-320');
	});
});

test('tablet: menus are Obsidian’s popovers, a binder beside a note in a split pane fits, a tap on a title opens the note in the binder’s own pane, and turned on its side the board has more columns', async (p, h, t) => {
	await onDevice(p, TABLET, async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
		t.eq(await p.ev(`getComputedStyle(document.body).getPropertyValue('--font-text-size').trim()`), '16px', 'with text at its usual size');
		await open(p);
		await shot(p, 'tablet-corkboard');
		t.eq(await navbarTop(p), null, 'no floating navigation bar on a tablet');
		const cols = () => p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-cards')).gridTemplateColumns.trim().split(/\\s+/).length`);
		const upright = await cols();
		t.ok(upright >= 2, 'the cards are in columns: ' + upright);
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y);
		const s = await sheet(p);
		await shot(p, 'tablet-mode-menu');
		t.ok(s && !isSheet(s) && s.width < 400, 'the mode menu is a popover under its button, as Obsidian’s menus are on a tablet: ' + j(s));
		await menuTap(p, 'Outliner');
		await until(p, `!!document.querySelector('${LEAF} .binders-outliner-row')`);
		await shot(p, 'tablet-outliner');
		t.eq(await p.ev(`getComputedStyle(document.querySelector('${row('Prologue.md')} .mod-title')).position`), 'sticky', 'in the outliner the title column is pinned');
		t.ok((await p.at(`${row('Part One')} .binders-outliner-chevron`)).w >= 40, 'and a folder folds from a 40 px target');
		await setMode(p, 'manuscript');
		await shot(p, 'tablet-manuscript');
		const page = await rect(p, `${LEAF} .binders-manuscript-page`);
		t.ok(page[2] <= 720 && page[0] > 20, 'the manuscript keeps a readable line length: ' + j(page));
		await setMode(p, 'corkboard');
		// on its side
		await metrics(p, TABLET[1], TABLET[0]);
		await p.sleep(800);
		await shot(p, 'tablet-landscape');
		t.ok(await cols() > upright, 'on its side, more columns');
		t.ok((await toolbar(p)).out <= 0, 'and the toolbar fits');
		await metrics(p, ...TABLET);
		await p.sleep(600);
		// a note beside it
		await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})); })().then(() => 1)`);
		await p.sleep(900);
		await shot(p, 'tablet-split');
		const view = await p.ev(`(() => { const v = document.querySelector('.binders-view'), b = v.querySelector('.binders-toolbar'), r = v.getBoundingClientRect(); return { width: Math.round(r.width), out: Math.max(v.scrollWidth - v.clientWidth, b.scrollWidth - b.clientWidth), kids: [...b.children].filter(e => e.getBoundingClientRect().width > 0).map(e => [Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().right)]) }; })()`);
		t.ok(view.width < 500 && view.out <= 0, 'in half the screen, the binder still fits: ' + j(view));
		for (let i = 1; i < view.kids.length; i++) t.ok(view.kids[i][0] >= view.kids[i - 1][1], 'nothing in its toolbar overlaps: ' + j(view.kids));
		const title = await p.at(`.binders-card[data-path="${L}Prologue.md"] .binders-card-title`);
		await tap(p, title.l + 20, title.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Prologue.md')}`);
		await p.sleep(500);
		await shot(p, 'tablet-split-note-opened');
		const panes = await p.ev(`[...document.querySelectorAll('.workspace-split.mod-root .workspace-tabs')].map(tabs => { const l = tabs.querySelector('.workspace-leaf.mod-active') ?? tabs.querySelector('.workspace-leaf'); return l?.querySelector('.view-header-title')?.textContent ?? l?.querySelector('.inline-title')?.textContent ?? ''; })`);
		t.eq(panes.length, 2, 'two panes still');
		t.ok(/Prologue/.test(panes[0]) && /Arrival/.test(panes[1]), 'the note opens where the binder was, beside the other: ' + j(panes));
	});
});

test('phone, reduced motion: a dropped card doesn’t glide, and nothing else animates', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
		await open(p, L + 'Part One');
		t.ok(await p.ev(`matchMedia('(prefers-reduced-motion: reduce)').matches`), 'reduced motion is on');
		const a = await p.at(card(L + 'Part One/Arrival.md')), k = await p.at(card(L + 'Part One/The keeper.md'));
		await pressAndMove(p, a.x, a.t + a.h - 16, a.x, k.t + k.h - 6);
		await touch(p, 'touchEnd');
		await p.sleep(60);
		const moving = await p.ev(`document.getAnimations().filter(x => x.playState === 'running' && x.effect?.target?.closest?.('.binders-view')).map(x => x.effect.target.className + ':' + (x.animationName ?? x.transitionProperty ?? 'animation'))`);
		await p.sleep(600);
		await flush(p);
		t.eq(j((await contents(p)).slice(0, 5)), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning']), 'the drop is made');
		t.eq(j(moving.filter((m) => !/box-shadow|background|color|opacity/.test(m))), '[]', 'and nothing in the view is moving just after it');
	});
});

// =====================================================================================================================
// Speed
// =====================================================================================================================

test('phone, CPU four times slower, a binder of 300 notes: every mode opens in under 2 s, swipes scroll at 20 ms a frame, a drag follows the finger, a key is on screen in 200 ms', async (p, h, t) => {
	const SAGA = 'Saga', PARTS = 6, PER = 50;
	await p.ev(`(async () => {
		const words = 'the keeper climbed the stair again while the sea kept on at the rocks below and nobody came '.repeat(25);
		const statuses = ['draft', 'revised', 'done'], labels = ['red', 'blue', 'green', ''];
		await app.vault.createFolder(${j(SAGA)});
		const contents = [];
		for (let a = 1; a <= ${PARTS}; a++) {
			const part = 'Part ' + String(a).padStart(2, '0');
			await app.vault.createFolder(${j(SAGA)} + '/' + part);
			contents.push(part + '/');
			for (let i = 1; i <= ${PER}; i++) {
				const n = (a - 1) * ${PER} + i, name = 'Scene ' + String(n).padStart(4, '0');
				const fm = ['synopsis: Scene ' + n + ', in which something happens on the island and the light goes out again.', 'status: ' + statuses[n % 3], labels[n % 4] ? 'label: ' + labels[n % 4] : ''].filter(Boolean).join('\\n');
				await app.vault.create(${j(SAGA)} + '/' + part + '/' + name + '.md', '---\\n' + fm + '\\n---\\n' + words + '\\n');
				contents.push(part + '/' + name);
			}
		}
		await app.vault.create(${j(SAGA + '/' + SAGA + '.md')}, '---\\nbinder: 1\\ncontents:\\n' + contents.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	const ready = `${B}.scenes(app.vault.getAbstractFileByPath(${j(SAGA)}) ?? app.vault.getRoot())?.length === ${PARTS * PER} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Saga/')).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`;
	t.ok(await until(p, ready, 60000), 'the big binder is made');
	const timed = (expr) => p.ev(`(async () => { const t = performance.now(); await (${expr}); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); })()`);
	const frames = (ms) => p.ev(`(() => { const fr = window.__qa4f = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); fr.push(n - last); last = n; if (n - t0 < ${ms}) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
	const frameStats = () => p.ev(`(() => { const f = window.__qa4f.slice(1).sort((a, b) => a - b); return { frames: f.length, median: Math.round(f[f.length >> 1]), p95: Math.round(f[Math.floor(f.length * 0.95)]), worst: Math.round(f[f.length - 1]) }; })()`);
	const swipes = async () => { for (let k = 0; k < 4; k++) { await touch(p, 'touchStart', 200, 650); for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', 200, 650 - i * 35); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(200); } await p.sleep(300); };
	const out = {};
	await onDevice(p, PHONE, async () => {
		t.ok(await until(p, ready, 60000), 'and found again on the phone');
		await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		const saga = `app.vault.getAbstractFileByPath(${j(SAGA)})`;
		out.corkboardOpens = await timed(`${PL}.openBinder(${saga})`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-card.is-stack[data-path]').length === ${PARTS}`, 20000);
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card[data-path]').length`), PARTS, 'the binder’s board: a stack for each part');
		// (a board shows one folder: the first part's fifty cards are what scrolls and drags)
		out.partOpens = await timed(`${PL}.openBinder(app.vault.getAbstractFileByPath(${j(SAGA + '/Part 01')}))`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === ${PER}`, 20000);
		await p.sleep(1200);
		await frames(2600);
		await swipes();
		out.corkboardScroll = await frameStats();
		t.ok(await p.ev(`${CORK}.scrollTop`) > 1000, 'the corkboard scrolls');
		// a drag: the card follows the finger frame by frame
		const at = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(e => e.getBoundingClientRect()).filter(r => r.top > 220 && r.bottom < 640).map(r => [r.left + r.width / 2, r.bottom - 16])[0]`);
		await touch(p, 'touchStart', at[0], at[1]);
		await p.sleep(700);
		await frames(1300);
		for (let i = 1; i <= 30; i++) { await touch(p, 'touchMove', at[0], at[1] + (i % 2 ? 3 : -3) * i); await p.sleep(16); }
		await p.sleep(300);
		out.drag = await frameStats();
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 1, 'a card is dragged');
		await touch(p, 'touchCancel');
		await p.sleep(500);
		await p.ev(`${PL}.openBinder(${saga}).then(() => 1)`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-card.is-stack[data-path]').length === ${PARTS}`, 20000);
		out.outlinerOpens = await timed(`(async () => { ${VIEW}.setMode('outliner'); })()`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-outliner-row').length > 100`, 20000);
		await p.sleep(1000);
		await frames(2600);
		await swipes();
		out.outlinerScroll = await frameStats();
		out.manuscriptOpens = await timed(`(async () => { ${VIEW}.setMode('manuscript'); })()`);
		await until(p, `!!document.querySelector('${LEAF} .binders-manuscript .cm-editor')`, 30000);
		await p.sleep(1500);
		await frames(2800);
		await swipes();
		out.manuscriptScroll = await frameStats();
		// typing: how long each key takes to show
		await p.sleep(1500);
		// (a scene here is one paragraph taller than the screen: anywhere in an editor that's in sight)
		const line = await until(p, `[...document.querySelectorAll('${LEAF} .binders-manuscript .cm-content')].map(e => e.getBoundingClientRect()).filter(r => r.top < 500 && r.bottom > 400).map(r => [r.left + 60, Math.max(r.top + 12, 300)])[0]`, 15000);
		t.ok(line, 'after the swipes, the sections in sight are editors again');
		await tap(p, line[0], line[1]);
		await p.sleep(900);
		t.ok(await p.ev(`document.activeElement.matches('.cm-content')`), 'a tap puts the caret in a section');
		await p.type('x');
		await p.sleep(600);
		// from each key going down to the text changing, and to the second frame drawn after it
		await p.ev(`(() => { const K = window.__qa4k = []; const el = document.activeElement; window.__qa4d = () => { const t0 = performance.now(), rec = { text: null, frame: null }; K.push(rec); const mo = new MutationObserver(() => { rec.text ??= Math.round(performance.now() - t0); mo.disconnect(); }); mo.observe(el, { childList: true, subtree: true, characterData: true }); requestAnimationFrame(() => requestAnimationFrame(() => { rec.frame = Math.round(performance.now() - t0); })); }; window.addEventListener('keydown', window.__qa4d, true); return 1; })()`);
		for (const ch of 'hello world ') { await p.key(ch); await p.sleep(120); }
		await p.sleep(600);
		out.keys = await p.ev(`(() => { window.removeEventListener('keydown', window.__qa4d, true); const of = (k) => { const s = window.__qa4k.map(r => r[k]).filter(x => x != null).sort((a, b) => a - b); return { n: s.length, median: s[s.length >> 1] ?? -1, worst: s[s.length - 1] ?? -1 }; }; return { text: of('text'), frame: of('frame') }; })()`);
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		await shot(p, 'speed-manuscript');
	});
	console.log('    qa4 mobile speed (ms, CPU ×4): ' + j(out));
	for (const k of ['corkboardOpens', 'partOpens', 'outlinerOpens', 'manuscriptOpens']) t.ok(out[k] < 2000, `${k}: ${out[k]} ms`);
	for (const k of ['corkboardScroll', 'outlinerScroll', 'manuscriptScroll', 'drag']) t.ok(out[k].median <= 20 && out[k].p95 <= 50, `${k}: ${j(out[k])}`);
	t.ok(out.keys.text.n === 12 && out.keys.text.median <= 50 && out.keys.frame.median <= 200, 'typing: ' + j(out.keys));
});
