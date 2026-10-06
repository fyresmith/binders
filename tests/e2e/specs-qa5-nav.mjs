// QA round 5, on a phone and a tablet, by touch: everything AROUND the three modes. The file explorer in its drawer,
// getting into and around a binder, the view's toolbar and header, every dialog and sheet, the settings tab and the
// commands. Obsidian's mobile mode (app.emulateMobile) at phone sizes (320–430 px wide, and on their sides) and a
// tablet's, with real touches sent over CDP. Tests named "qa5 nav: …" pass; "BUG: …" are confirmed bugs (they fail now
// and pass once fixed); "UX: …" are behaviours that should exist. Every test puts Obsidian back on the desktop.
//
// What the emulation can't do (see specs-qa4-mobile.mjs): a long press sends no `contextmenu`, so the explorer's menus
// are asked for as Obsidian asks for them; the keyboard is only a shorter viewport; HTML drag can't start by touch.
//
// QA5_SHOTS=<dir> saves screenshots of every step there; QA5_LOG=1 prints what each scenario measured.
import { mkdirSync } from 'fs';
import { B, PL, VIEW, card, closeMenus, contents, flush, j, menuItems, openView, read, reload, texts, tidy, until, viewState } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa5 nav: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa5 nav: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa5 nav: ' + name, fn });

const L = 'The Lighthouse/';
const LEAF = '.workspace-leaf.mod-active';
const PHONE = [390, 844], SMALL = [320, 568], TABLET = [820, 1180];
const KEYBOARD = 336, KEYBOARD_SMALL = 260;
const SHOTS = process.env.QA5_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const log = (what, x) => { if (process.env.QA5_LOG) console.log(`    [${what}] ${typeof x === 'string' ? x : j(x)}`); };

// ---- touch ----
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const hold = async (p, x, y, ms = 700) => { await touch(p, 'touchStart', x, y); await p.sleep(ms); await touch(p, 'touchEnd'); await p.sleep(550); };
const swipe = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(500); };

// ---- the device ----
const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
/** Runs fn in Obsidian's mobile mode at this size, with touch; then puts the desktop back whatever happened. Errors
    logged while on the device fail the test. */
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
		await p.send('Emulation.setEmulatedMedia', { features: [] });
		await gone(p).catch(() => {});
		for (let i = 0; i < 5 && (await p.ev(`document.querySelectorAll('.modal-container').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(300); }
		await p.ev(`(async () => {
			try { app.setting.close(); } catch {}
			document.body.classList.remove('mod-rtl'); document.documentElement.removeAttribute('dir');
			// what a test made that the runner doesn't take away: files that aren't notes
			for (const f of app.vault.getFiles()) if (f.extension !== 'md') await app.vault.delete(f);
			if ((app.vault.getConfig('baseFontSize') ?? 16) !== 16) { app.vault.setConfig('baseFontSize', 16); app.updateFontSize?.(); }
			for (let i = 0; i < 60; i++) { let saved = 16; try { saved = JSON.parse(await app.vault.adapter.read(app.vault.configDir + '/appearance.json')).baseFontSize ?? 16; } catch {} if (saved === 16) break; await new Promise(r => setTimeout(r, 100)); }
		})().then(() => 1)`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
		await theme();
		await p.ev(`(() => { const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach()); return 1; })()`).catch(() => {});
		await tidy(p);
	}
	if (logged.length) throw new Error('errors logged on the device: ' + logged.slice(0, 3).join(' ; '));
}

// ---- looking ----
const R = `(e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }`;
const rect = (p, sel) => p.ev(`(${R})(document.querySelector(${j(sel)}))`);
const CORK = `document.querySelector('${LEAF} .binders-corkboard')`;
async function open(p, folder = 'The Lighthouse') {
	await openView(p, folder);
	await until(p, `/\\d/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '')`, 5000);
	await p.sleep(500);
}
const setMode = async (p, m) => { await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`); await p.sleep(m === 'manuscript' ? 1500 : 500); };
const prop = async (p, path, key) => (await read(p, path)).split('\n').find((l) => l.startsWith(key + ':'))?.slice(key.length + 1).trim() ?? null;
const has = (p, path) => p.ev(`!!app.vault.getAbstractFileByPath(${j(path)})`);
const activeFile = (p) => p.ev(`app.workspace.getActiveFile()?.path ?? null`);
const activeType = (p) => p.ev(`app.workspace.getMostRecentLeaf()?.view.getViewType() ?? null`);
/** The toolbar's parts that show, left to right, with what overlaps, sticks out or is cut. */
const toolbar = (p) => p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'), b = v.querySelector('.binders-toolbar'); const kids = [...b.children].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { cls: e.className.split(' ').filter(c => c.startsWith('binders-')).pop(), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), cut: e.scrollWidth - e.clientWidth, text: e.classList.contains('binders-toolbar-spacer') ? '' : e.textContent.slice(0, 40) }; }); const overlap = []; for (let i = 1; i < kids.length; i++) if (kids[i].l < kids[i - 1].r) overlap.push(kids[i - 1].cls + '/' + kids[i].cls); const br = b.getBoundingClientRect(); return { bar: [Math.round(br.left), Math.round(br.top), Math.round(br.width), Math.round(br.height)], out: Math.max(v.scrollWidth - v.clientWidth, b.scrollWidth - b.clientWidth, Math.round(br.right - innerWidth)), kids, overlap }; })()`);
const navbarTop = (p) => p.ev(`(() => { const b = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return b && b.height ? Math.round(b.top) : null; })()`);

// ---- menus and dialogs ----
const sheet = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), bottom: Math.round(r.bottom), inner: [innerWidth, innerHeight], itemHeights: [...m.querySelectorAll('.menu-item:not(.is-label)')].map(i => Math.round(i.getBoundingClientRect().height)) }; })()`);
const isSheet = (s) => !!s && s.left === 0 && s.width === s.inner[0] && s.bottom === s.inner[1];
const menus = (p) => p.ev(`document.querySelectorAll('.menu').length`);
async function menuTap(p, title) {
	const find = `[...document.querySelectorAll('.menu .menu-item')].filter(e => (e.querySelector('.menu-item-title')?.textContent ?? '') === ${j(title)}).pop()`;
	if (!(await p.ev(`(() => { const it = ${find}; if (!it) return false; it.scrollIntoView({ block: 'center' }); return true; })()`))) return false;
	await p.sleep(250);
	const at = await p.ev(`(() => { const r = (${find}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await tap(p, at.x, at.y);
	return true;
}
async function gone(p) {
	await closeMenus(p);
	await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`);
	await p.sleep(250);
}
/** The dialog on top: its box, title, text, fields and buttons, and whether its text scrolls. */
const dialog = (p) => p.ev(`(() => { const R = ${R}; const c = [...document.querySelectorAll('.modal-container')].pop(), m = c?.querySelector('.modal'); if (!m) return null; const t = m.querySelector('.modal-title'), content = m.querySelector('.modal-content'); return { inner: [innerWidth, innerHeight], container: c.className, cls: m.className, box: R(m), title: t?.textContent ?? '', text: content?.innerText.slice(0, 600) ?? '', fields: [...m.querySelectorAll('input[type="text"], select')].map(i => ({ rect: R(i), value: i.value, inputMode: i.inputMode ?? '', enterkeyhint: i.getAttribute('enterkeyhint'), font: parseFloat(getComputedStyle(i).fontSize) })), buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => ({ text: b.textContent, cls: b.className, rect: R(b), disabled: b.disabled })), scrolls: content ? content.scrollHeight - content.clientHeight : 0, menus: document.querySelectorAll('.menu').length, focus: document.activeElement?.tagName + '.' + (document.activeElement?.className ?? '') }; })()`);
const dialogTap = async (p, text) => {
	const at = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); const b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`no “${text}” button in the dialog`);
	await p.sleep(150);
	await tap(p, at.x, at.y);
	await p.sleep(400);
};
const closeDialog = async (p) => { const x = await p.at('.modal .modal-header-button'); if (x) await tap(p, x.x, x.y); else await p.key('Escape'); await p.sleep(500); };
const dialogs = (p) => p.ev(`document.querySelectorAll('.modal-container').length`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); const out = []; for (const d of docs) d.querySelectorAll('.notice').forEach(n => { if (n.textContent) out.push(n.textContent); }); return out; })()`);
async function cardMenu(p, path) {
	await p.ev(`(() => { document.querySelector(${j(card(L + path))})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	await p.sleep(300);
	const c = await p.at(card(L + path));
	if (!c) throw new Error('no card for ' + path);
	await hold(p, c.x, c.t + c.h - 16);
	if (!(await menus(p))) throw new Error('no menu after holding the card of ' + path);
}

// ---- the file explorer (a drawer on a phone) ----
const TOGGLE = { x: 34, y: 81 };
const drawerOpen = (p) => p.ev(`!app.workspace.leftSplit.collapsed`);
const explorerRow = (path) => `.nav-files-container .tree-item-self[data-path="${path}"]`;
const showExplorer = async (p, folders = ['The Lighthouse', 'The Lighthouse/Part One']) => {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[0].view; app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); for (const f of ${j(folders)}) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(900);
};
const explorerMenu = async (p, path) => {
	await p.ev(`(() => { const e = document.querySelector(${j(explorerRow(path))}); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2, button: 0 })); return 1; })()`);
	await p.sleep(500);
};
/** The explorer's rows in sight, top to bottom: path, whether folded, marked as open, the tag and the dot. */
const explorerRows = (p) => p.ev(`[...document.querySelectorAll('.nav-files-container .tree-item-self')].filter(e => e.getBoundingClientRect().height > 0).map(e => ({ path: e.dataset.path, folded: e.parentElement.classList.contains('is-collapsed'), active: e.classList.contains('is-active'), tag: e.querySelector(':scope > .nav-file-tag')?.textContent ?? null, dot: !!e.querySelector(':scope > .binders-explorer-label') }))`);
const folded = (p, path) => p.ev(`app.workspace.getLeavesOfType('file-explorer')[0].view.fileItems[${j(path)}]?.collapsed`);
const palette = async (p, query) => {
	await p.ev(`app.commands.executeCommandById('command-palette:open')`);
	await until(p, `!!document.querySelector('.prompt input')`);
	await p.type(query);
	await p.sleep(500);
	return p.ev(`[...document.querySelectorAll('.prompt .suggestion-item')].map(e => e.textContent.trim())`);
};
const closePalette = async (p) => { await p.key('Escape'); await p.sleep(350); };

const emptyMenu = async (p) => {
	await p.ev(`(() => { const e = document.querySelector('.nav-files-container'); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.bottom - 20, button: 0 })); return 1; })()`);
	await p.sleep(500);
};
const focusInfo = (p) => p.ev(`(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { tag: a.tagName, cls: a.className, editable: a.isContentEditable, text: (a.value ?? a.textContent ?? '').slice(0, 60), sel: getSelection().toString(), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inner: [innerWidth, innerHeight] }; })()`);
/** The header's title of the tab in sight (with the drawer open, the active leaf is the file explorer). */
const headerTitle = (p) => p.ev(`[...document.querySelectorAll('.workspace-split.mod-root .view-header-title')].find(e => e.getBoundingClientRect().width > 0)?.textContent ?? null`);
const viewText = (p) => p.ev(`[...document.querySelectorAll('.workspace-split.mod-root .view-content')].find(e => e.getBoundingClientRect().width > 0)?.innerText ?? ''`);
const tabs = (p) => p.ev(`(() => { const out = []; app.workspace.iterateRootLeaves(l => { out.push(l.view.getViewType() + ':' + (l.getViewState().state?.folder ?? l.getViewState().state?.file ?? '') + ':' + (l.getViewState().state?.mode ?? '')); }); return out; })()`);
const clearNotices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const select = (p, paths) => p.ev(`(() => { const v = app.workspace.getLeavesOfType('file-explorer')[0].view; v.tree.clearSelectedDoms?.(); for (const path of ${j(paths)}) v.tree.selectItem(v.fileItems[path]); return 1; })()`);
const selectedCards = (p) => p.ev(`[...document.querySelectorAll('.binders-view .binders-card.is-selected')].map(c => c.dataset.path)`);
const MORE = `${LEAF} .view-actions .clickable-icon[aria-label="More options"]`;
const NAVBACK = `document.querySelector('.mobile-navbar-action-back button')`, NAVFWD = `document.querySelector('.mobile-navbar-action-forward button')`;
const openSettings = async (p) => {
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `app.setting.activeTab?.containerEl.querySelectorAll('.binders-settings-label').length > 0`);
	await p.sleep(700);
};
const TAB = `app.setting.activeTab.containerEl`;
/** A menu's “Export...” and the command open the Export window on the kind last used: this is a writer who made one note last time. */
const NOTE_KIND = `(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`;
/** The Export window on “One note” (what Compile was), by the command. On a phone: its choices, with Preview, Copy and Export at their foot. */
const openOneNote = async (p) => { await p.ev(`(app.plugins.plugins.binders.settings.exportKind = 'note', app.commands.executeCommandById('binders:export'))`); await until(p, `!!document.querySelector('.modal .binders-export-path')`); await p.sleep(500); };
/** The Export window's own buttons in sight: Preview, Copy, Export at the foot of a phone's choices; Copy, Export in the bar elsewhere. */
const exportButtons = (p) => p.ev(`[...document.querySelectorAll('.modal.binders-export .binders-export-phone-row button, .modal.binders-export .modal-setting-titlebar-actions button')].filter(b => b.getBoundingClientRect().width).map(b => ({ text: b.textContent, rect: (${R})(b) }))`);
const setPath = async (p, v) => { await p.ev(`(() => { const i = document.querySelector('.modal .binders-export-path'); i.focus(); i.select(); return 1; })()`); if (v) await p.type(v); else await p.key('Backspace'); await p.sleep(200); };
const fitsScreen = (d) => d.box[0] >= 0 && d.box[1] >= 0 && d.box[0] + d.box[2] <= d.inner[0] && d.box[1] + d.box[3] <= d.inner[1];
const FUTURE = `(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/Future.md', '---\\nbinder: 99\\ncontents:\\n  - One\\n---\\n'); await app.vault.create('Future/One.md', 'one'); })().then(() => 1)`;

// =====================================================================================================================
// The file explorer, in its drawer
// =====================================================================================================================

test('phone explorer: a binder says “binder” exactly as a canvas says “canvas”; a tap opens it, closes the drawer, unfolds it and marks its row; a tap on the binder in front folds it and keeps the drawer; a note takes the mark; a plain folder only folds', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}), fm => { fm.label = 'Red'; }); await app.vault.create('Board.canvas', '{}'); await app.vault.createFolder('Plain'); await app.vault.create('Plain/A note.md', 'x'); })().then(() => 1)`);
		await tap(p, TOGGLE.x, TOGGLE.y);
		await p.sleep(800);
		t.ok(await drawerOpen(p), 'the drawer opens');
		await shot(p, 'explorer-drawer');
		let rows = await explorerRows(p);
		t.eq(j(rows.map((r) => [r.path, r.tag])), j([['Longform demo', 'binder'], ['Plain', null], ['The Lighthouse', 'binder'], ['Board.canvas', 'canvas']]), 'binders are tagged, a plain folder isn’t');
		const tags = await p.ev(`[...document.querySelectorAll('.nav-files-container .nav-file-tag')].map(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(), row = e.parentElement.getBoundingClientRect(); return { text: e.textContent, look: [s.fontSize, s.color, s.backgroundColor, s.padding, s.borderRadius, s.textTransform, s.fontWeight, s.lineHeight, Math.round(r.height), Math.round(row.right - r.right), Math.round(r.top + r.height / 2 - row.top - row.height / 2)].join(' ') }; })`);
		const canvas = tags.find((x) => x.text === 'canvas');
		for (const x of tags.filter((x) => x.text === 'binder')) t.eq(x.look, canvas.look, 'the “binder” tag has the size, color, case, place and height of Obsidian’s “canvas” tag');
		// a tap on the binder
		let bf = await p.at(explorerRow('The Lighthouse'));
		await tap(p, bf.x, bf.y);
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view'`);
		await p.sleep(700);
		t.eq(j([await drawerOpen(p), await activeType(p), await folded(p, 'The Lighthouse'), (await viewState(p)).folder]), j([false, 'binders-view', false, 'The Lighthouse']), 'a tap on a binder opens its view, closes the drawer and unfolds it');
		await tap(p, TOGGLE.x, TOGGLE.y);
		await p.sleep(800);
		await shot(p, 'explorer-binder-open');
		rows = await explorerRows(p);
		t.eq(j(rows.filter((r) => r.path.startsWith(L)).map((r) => r.path)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'in binder order, without the binder note');
		t.eq(j(rows.filter((r) => r.active).map((r) => r.path)), j(['The Lighthouse']), 'the binder’s row is marked as the open note’s would be');
		t.eq(j(rows.filter((r) => r.dot).map((r) => r.path)), j([L + 'Prologue.md']), 'the labeled note has its dot');
		// the binder in front: a tap folds it, and the drawer stays (there's nothing new to show)
		bf = await p.at(explorerRow('The Lighthouse'));
		await tap(p, bf.x, bf.y);
		await p.sleep(800);
		t.eq(j([await drawerOpen(p), await folded(p, 'The Lighthouse'), await activeType(p)]), j([true, true, 'binders-view']), 'a tap on the binder already in front folds it and leaves the drawer open');
		await tap(p, bf.x, bf.y);
		await p.sleep(800);
		t.eq(j([await drawerOpen(p), await folded(p, 'The Lighthouse')]), j([true, false]), 'and another unfolds it');
		// a note
		const n = await p.at(explorerRow(L + 'Prologue.md'));
		await tap(p, n.x, n.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Prologue.md')}`);
		await p.sleep(600);
		t.eq(j([await drawerOpen(p), await activeType(p)]), j([false, 'markdown']), 'a tap on a note opens the note and closes the drawer');
		await tap(p, TOGGLE.x, TOGGLE.y);
		await p.sleep(800);
		t.eq(j((await explorerRows(p)).filter((r) => r.active).map((r) => r.path)), j([L + 'Prologue.md']), 'the mark is on the note now, and no longer on the binder');
		// a folder that isn't in a binder
		const pl = await p.at(explorerRow('Plain'));
		await tap(p, pl.x, pl.y);
		await p.sleep(600);
		t.eq(j([await drawerOpen(p), await activeType(p), await folded(p, 'Plain')]), j([true, 'markdown', false]), 'a plain folder only unfolds');
	});
});

test('phone explorer: every row’s menu is a sheet with Binders’ items where they apply and nowhere else: a binder, a folder, a scene, a plain folder, the empty space, a Longform project, a read-only binder, a selection', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { await app.vault.createFolder('Plain'); await app.vault.create('Plain/A note.md', 'x'); })().then(() => 1)`);
		await p.ev(FUTURE);
		await p.sleep(1200);
		await showExplorer(p, ['The Lighthouse', L + 'Part One', 'Longform demo', 'Future', 'Plain']);
		const OURS = ['Open binder', 'Show in binder', 'New scene here', 'New scene after this', 'Make this folder a binder', 'New binder', 'Convert to binder', 'Export...', 'Move up', 'Move down', 'Merge 2 notes', 'New folder from selection'];
		const want = {
			'The Lighthouse': ['Open binder', 'New scene here', 'Export...'],
			[L + 'Part One']: ['Open binder', 'New scene here', 'Export...', 'Move up', 'Move down'],
			[L + 'Prologue.md']: ['Show in binder', 'New scene after this', 'Move down'],
			[L + 'Part One/Storm warning.md']: ['Show in binder', 'New scene after this', 'Move up'],
			'Plain': ['Make this folder a binder', 'New binder'],
			'Plain/A note.md': [],
			'Longform demo': ['Open binder', 'New scene here', 'Convert to binder', 'Export...'],
			'Longform demo/Harbor.md': ['Show in binder', 'New scene after this', 'Move down'],
			'Longform demo/Notes on ferries.md': [],
			'Future': ['Open binder', 'Export...'],
			'Future/One.md': ['Show in binder'],
		};
		for (const [path, items] of Object.entries(want)) {
			await p.ev(`(() => { document.querySelector(${j(explorerRow(path))}).scrollIntoView({ block: 'center' }); return 1; })()`);
			await p.sleep(200);
			await explorerMenu(p, path);
			const all = await menuItems(p);
			t.ok(isSheet(await sheet(p)), `${path}: its menu is a sheet`);
			t.eq(j(all.filter((x) => OURS.includes(x))), j(items), `${path}: Binders’ items`);
			if (path === 'The Lighthouse') { await shot(p, 'explorer-binder-menu'); t.ok(all.indexOf('Open binder') < all.indexOf('New note') && all.indexOf('New scene here') > all.indexOf('New folder') && all.indexOf('New scene here') < all.indexOf('Make a copy') && all.indexOf('Delete') === all.length - 1, 'in Obsidian’s own sections: opening first, making with “New note”, Delete last: ' + j(all)); }
			await gone(p);
		}
		// the vault's empty space
		await p.ev(`(() => { document.querySelector('.nav-files-container').scrollTop = 0; return 1; })()`);
		await emptyMenu(p);
		await shot(p, 'explorer-empty-menu');
		const empty = await menuItems(p);
		t.eq(j(empty.slice(1)), j(['New note', 'New folder', 'New canvas', 'New base', 'New binder']), 'the empty space: “New binder” after Obsidian’s own “New…”');
		t.ok(isSheet(await sheet(p)), 'a sheet too');
		await gone(p);
		// several selected
		await select(p, [L + 'Part One/Arrival.md', L + 'Part One/The keeper.md']);
		await explorerMenu(p, L + 'Part One/Arrival.md');
		t.eq(j((await menuItems(p)).filter((x) => OURS.includes(x))), j(['New folder from selection', 'Merge 2 notes']), 'two notes of a binder selected');
		await gone(p);
		await select(p, [L + 'Part One/Arrival.md', 'Plain/A note.md']);
		await explorerMenu(p, L + 'Part One/Arrival.md');
		t.eq(j((await menuItems(p)).filter((x) => OURS.includes(x))), '[]', 'a note of a binder and one outside: nothing of Binders’');
		await gone(p);
	});
});

test('phone explorer: “New binder” makes one where the list is, its name selected to type over with the drawer still open; named, it’s a binder still; a tap opens an empty binder that says what to do, and its “New note” tile makes the first note', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await showExplorer(p, []);
		await emptyMenu(p);
		t.ok(await menuTap(p, 'New binder'), 'New binder');
		await until(p, `document.activeElement?.isContentEditable`, 4000);
		await p.sleep(500);
		await shot(p, 'new-binder-naming');
		let f = await focusInfo(p);
		t.eq(j([f.editable, f.text, f.sel, await drawerOpen(p)]), j([true, 'Untitled binder', 'Untitled binder', true]), 'its name is selected in the list, the drawer open');
		t.eq((await explorerRows(p)).find((r) => r.path === 'Untitled binder')?.tag, 'binder', 'and it’s a binder already');
		// the keyboard comes up: the row is above it
		t.ok(f.rect[1] + f.rect[3] <= PHONE[1] - KEYBOARD, 'the name is above where the keyboard comes: ' + j(f.rect));
		await p.type('My book');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath('My book')`);
		await p.sleep(900);
		t.ok(await p.ev(`${B}.isBinderFolder(app.vault.getAbstractFileByPath('My book'))`), 'named, it’s a binder');
		t.eq((await explorerRows(p)).find((r) => r.path === 'My book')?.tag, 'binder', 'with its tag');
		t.ok(await drawerOpen(p), 'the drawer is still open');
		const r = await p.at(explorerRow('My book'));
		await tap(p, r.x, r.y);
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view'`);
		await p.sleep(900);
		await shot(p, 'new-binder-empty');
		t.eq(await headerTitle(p), 'My book', 'a tap opens it');
		t.ok(/No notes in this folder yet/.test(await viewText(p)), 'an empty binder says so');
		const bar = await toolbar(p);
		t.ok(bar.out <= 0 && bar.overlap.length === 0 && bar.kids.some((k) => /0 words/.test(k.text)), 'its toolbar fits and counts 0 words: ' + j(bar.kids.map((k) => k.text)));
		const tile = await p.at(`${LEAF} .binders-card-new`);
		await tap(p, tile.x, tile.y);
		t.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'the “New note” tile opens its field');
		await p.type('Chapter one');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath('My book/Chapter one.md')`);
		await p.key('Escape');
		await p.sleep(400);
		await flush(p);
		const note = await p.ev(`${B}.binderOf('My book').note.path`);
		t.eq(j(await contents(p, note)), j(['Chapter one']), 'and the first note is in the binder’s order');
	});
});

bug('phone explorer: a binder made by “New binder” and named has its binder note named like it (the note stays “Untitled binder.md” for good: that’s what the quick switcher, search and “Open binder note” show for every binder made this way)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await showExplorer(p, []);
		await emptyMenu(p);
		await menuTap(p, 'New binder');
		await until(p, `document.activeElement?.isContentEditable`, 4000);
		await p.sleep(500);
		await p.type('My book');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath('My book')`);
		await p.sleep(2500);
		const note = await p.ev(`${B}.binderOf('My book')?.note.path ?? null`);
		await p.ev(`app.commands.executeCommandById('switcher:open')`);
		await until(p, `!!document.querySelector('.prompt input')`);
		await p.type('book');
		await p.sleep(600);
		await shot(p, 'bug-new-binder-note-name');
		const listed = await p.ev(`[...document.querySelectorAll('.prompt .suggestion-item')].map(e => e.textContent.trim())`);
		await closePalette(p);
		t.eq(note, 'My book/My book.md', 'the binder note is named like its folder (the quick switcher lists: ' + j(listed) + ')');
	});
});

test('phone explorer: “New scene here” on a binder and on a folder closes the drawer with the new note’s name ready to type, last in that folder; “Make this folder a binder” keeps the order shown and says so', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { await app.vault.createFolder('Plain'); await app.vault.create('Plain/B note.md', 'x'); await app.vault.create('Plain/A note.md', 'x'); await app.vault.createFolder('Plain/Sub'); await app.vault.create('Plain/Sub/C.md', 'c'); })().then(() => 1)`);
		await showExplorer(p, ['Plain']);
		await explorerMenu(p, 'The Lighthouse');
		t.ok(await menuTap(p, 'New scene here'), 'New scene here');
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Untitled.md')}`);
		await p.sleep(900);
		await shot(p, 'new-scene-here');
		let f = await focusInfo(p);
		t.eq(j([await drawerOpen(p), f.cls, f.sel]), j([false, 'inline-title', 'Untitled']), 'the drawer closes and the note’s title is selected');
		await p.type('Coda');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Coda.md')})`);
		await p.sleep(500);
		await flush(p);
		t.eq((await contents(p)).pop(), 'Coda', 'named, it’s last in the binder');
		t.ok((await focusInfo(p)).cls.includes('cm-content'), 'and the caret goes on into its text');
		await showExplorer(p);
		await explorerMenu(p, L + 'Part One');
		await menuTap(p, 'New scene here');
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Part One/Untitled.md')}`);
		await p.sleep(700);
		await flush(p);
		t.eq(j((await contents(p)).slice(4, 7)), j(['Part One/Storm warning', 'Part One/Untitled', 'Part Two/']), 'on a folder: last in that folder');
		t.ok(!(await drawerOpen(p)), 'the drawer closed');
		await p.key('Escape');
		// a folder made a binder
		await showExplorer(p, ['Plain']);
		await explorerMenu(p, 'Plain');
		t.ok(await menuTap(p, 'Make this folder a binder'), 'Make this folder a binder');
		await until(p, `!!app.vault.getAbstractFileByPath('Plain/Plain.md')`);
		await p.sleep(900);
		await shot(p, 'made-binder');
		t.eq(j(await notices(p)), j(['“Plain” is now a binder.']), 'it says so');
		t.eq(j(await contents(p, 'Plain/Plain.md')), j(['Sub/', 'Sub/C', 'A note', 'B note']), 'in the order the explorer showed');
		t.eq(j((await explorerRows(p)).filter((r) => r.path.startsWith('Plain')).map((r) => [r.path, r.tag])), j([['Plain', 'binder'], ['Plain/Sub', null], ['Plain/A note.md', null], ['Plain/B note.md', null]]), 'tagged, its note hidden, the drawer as it was');
		t.ok(await drawerOpen(p), 'the drawer stays');
	});
});

test('phone explorer: “Convert to binder” on a Longform project: the dialog fits at 390 and 320 px, its switches work by touch and rewrite what will happen, its buttons can be reached, and Convert does it', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await showExplorer(p, []);
		await explorerMenu(p, 'Longform demo');
		t.ok(await menuTap(p, 'Convert to binder'), 'Convert to binder');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(600);
		await shot(p, 'convert-390');
		let d = await dialog(p);
		t.eq(j([d.title, d.menus]), j(['Convert to binder', 0]), 'the dialog opens over the drawer, no sheet left');
		t.ok(fitsScreen(d), 'on the screen: ' + j(d.box));
		t.ok(/5 notes keep their place. No text changes./.test(d.text) && !/new folder/.test(d.text), 'it says what will happen');
		const tg = await p.ev(`[...document.querySelectorAll('.modal .checkbox-container')].map(${R})`);
		t.ok(tg.length === 2 && tg.every((r) => r[2] >= 44 || r[3] >= 28), 'two switches a finger can hit: ' + j(tg));
		await tap(p, tg[0][0] + tg[0][2] / 2, tg[0][1] + tg[0][3] / 2);
		await p.sleep(400);
		d = await dialog(p);
		t.ok(/“Harbor” is a new folder, and 2 notes move into it\./.test(await p.ev(`document.querySelector('.modal .modal-content').innerText`)), '“Move groups into folders” by touch: the plan says which folder');
		await metrics(p, ...SMALL);
		await p.sleep(600);
		await shot(p, 'convert-320');
		d = await dialog(p);
		t.ok(fitsScreen(d) && d.scrolls > 0, 'at 320 px it fits, and scrolls: ' + j(d.box));
		t.ok(await p.ev(`[...document.querySelectorAll('.modal .setting-item')].every(s => { const r = s.getBoundingClientRect(), b = document.querySelector('.modal').getBoundingClientRect(); return r.left >= b.left && r.right <= b.right; })`), 'no setting wider than the dialog');
		await dialogTap(p, 'Convert');
		await until(p, `${B}.binderOf('Longform demo')?.kind === 'binder'`, 5000);
		await p.sleep(900);
		await metrics(p, ...PHONE);
		await p.sleep(400);
		t.eq(await dialogs(p), 0, 'Convert (scrolled to and tapped) closes the dialog');
		t.eq(await p.ev(`${B}.binderOf('Longform demo')?.kind`), 'binder', 'and it’s a binder');
		t.ok((await notices(p)).includes('“Longform demo” is now a binder.'), 'which it says');
		await flush(p);
		t.eq(j(await contents(p, 'Longform demo/Index.md')), j(['Harbor', 'Harbor/', 'Harbor/Ticket office', 'Harbor/The crossing', 'Island', 'Return']), 'in the same order, the group in its folder');
		const after = await texts(p);
		for (const [path, text] of Object.entries(before)) if (path.startsWith('Longform demo/') && !/Index/.test(path)) t.eq(after[path.replace(/(Ticket office|The crossing)/, 'Harbor/$1')], text, `“${path}” has the same text`);
	});
});

test('phone explorer: a binder and the folder shown renamed in place while their view is open: the view, its title and the mark follow; two notes selected are merged with no text lost; “New folder from selection” is named in place; the binder deleted leaves the view saying so', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await showExplorer(p);
		const rename = async (path, name) => {
			await explorerMenu(p, path);
			if (!(await menuTap(p, 'Rename...'))) throw new Error('no Rename... for ' + path);
			await until(p, `document.activeElement?.isContentEditable`, 4000);
			await p.sleep(300);
			await p.ev(`(() => { document.execCommand('selectAll'); return 1; })()`);
			await p.type(name);
			await p.key('Enter');
			await p.sleep(1500);
		};
		await rename('The Lighthouse', 'Beacon');
		await shot(p, 'renamed-binder');
		t.eq((await viewState(p)).folder, 'Beacon/Part One', 'the binder renamed: the view is on the same folder, under its new path');
		t.eq(j((await explorerRows(p)).filter((r) => r.active).map((r) => r.path)), j(['Beacon/Part One']), 'still marked');
		t.eq(j(await p.ev(`[...document.querySelectorAll('.binders-view .binders-crumb')].map(e => e.textContent)`)), j(['Beacon', 'Part One']), 'the breadcrumb has the new name');
		await rename('Beacon/Part One', 'Act I');
		t.eq(j([(await viewState(p)).folder, await headerTitle(p)]), j(['Beacon/Act I', 'Act I']), 'the folder shown renamed: the view and its title follow');
		t.eq(await p.ev(`document.querySelectorAll('.binders-view .binders-card[data-path]').length`), 3, 'with its cards');
		// merge two notes selected in the explorer
		await select(p, ['Beacon/Act I/Arrival.md', 'Beacon/Act I/The keeper.md']);
		await explorerMenu(p, 'Beacon/Act I/Arrival.md');
		await shot(p, 'selection-menu');
		t.ok(await menuTap(p, 'Merge 2 notes'), 'Merge 2 notes');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(500);
		let d = await dialog(p);
		t.ok(d.title === 'Merge 2 notes' && fitsScreen(d) && /“The keeper” goes to/.test(d.text), 'it asks first, saying what goes where: ' + d.text.slice(0, 80));
		await metrics(p, ...SMALL);
		await p.sleep(500);
		await shot(p, 'merge-320');
		d = await dialog(p);
		t.ok(fitsScreen(d) && d.scrolls <= 0 && d.buttons.every((b) => b.rect[3] >= 44), 'at 320 px it fits whole: ' + j(d.box));
		await metrics(p, ...PHONE);
		await p.sleep(400);
		await dialogTap(p, 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath('Beacon/Act I/The keeper.md')`, 5000);
		await p.sleep(700);
		await flush(p);
		const merged = await read(p, 'Beacon/Act I/Arrival.md');
		t.ok(merged.includes('The supply boat left Mara on the jetty with two cases and a letter she had not opened.\n\nHe met her at the foot of the tower and did not move out of the doorway.'), 'both texts are in the first, in order: ' + merged.slice(-180));
		t.ok(/Mara arrives on the island with the supply boat\.\n\n  The keeper refuses to let her into the tower\./.test(merged), 'and both synopses');
		const binderNote = await p.ev(`${B}.binderOf('Beacon').note.path`);
		t.eq(j((await contents(p, binderNote)).slice(1, 4)), j(['Act I/', 'Act I/Arrival', 'Act I/Storm warning']), 'the order has one note fewer');
		// a folder from two notes
		await select(p, ['Beacon/Prologue.md', 'Beacon/Epilogue.md']);
		await explorerMenu(p, 'Beacon/Prologue.md');
		t.ok(await menuTap(p, 'New folder from selection'), 'New folder from selection');
		await until(p, `document.activeElement?.isContentEditable`, 4000);
		await p.sleep(400);
		const f = await focusInfo(p);
		t.eq(j([f.text, f.sel, await drawerOpen(p)]), j(['Untitled', 'Untitled', true]), 'the new folder’s name is selected in the list');
		await p.type('Frame');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath('Beacon/Frame/Epilogue.md')`);
		await p.sleep(700);
		await flush(p);
		t.eq(j((await contents(p, binderNote)).slice(0, 3)), j(['Frame/', 'Frame/Prologue', 'Frame/Epilogue']), 'named, with the notes in it, where the first was');
		// the binder deleted with its view open
		await explorerMenu(p, 'Beacon');
		await menuTap(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(500);
		await dialogTap(p, 'Delete');
		await until(p, `!app.vault.getAbstractFileByPath('Beacon')`, 5000);
		await p.sleep(900);
		await p.ev(`app.workspace.leftSplit.collapse()`);
		await p.sleep(700);
		await shot(p, 'binder-deleted');
		t.ok(/This folder isn’t in a binder/.test(await viewText(p)) && /was moved or deleted/.test(await viewText(p)), 'the view says the folder is gone: ' + (await viewText(p)).slice(0, 120));
	});
});

bug('phone explorer: “New scene here” (the command) in a note a Longform project leaves out puts the new scene last, as from the project’s own note (it’s put first, above every scene)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await h.open('Longform demo/Notes on ferries.md');
		t.ok((await palette(p, 'New scene here')).some((x) => /New scene here/.test(x)), 'the command is offered there');
		await closePalette(p);
		await p.ev(`app.commands.executeCommandById('binders:new-scene')`);
		await until(p, `!!app.vault.getAbstractFileByPath('Longform demo/Untitled.md')`);
		await p.sleep(900);
		await flush(p);
		const scenes = await p.ev(`app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Longform demo/Index.md')).frontmatter.longform.scenes.flat(9)`);
		t.eq(j(scenes), j(['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return', 'Untitled']), 'the new scene is last');
	});
});

// =====================================================================================================================
// Getting around
// =====================================================================================================================

test('phone navigation: a tap on a folder’s stack (its name) goes into it, the breadcrumb goes up, Back and Forward step through folders with the mode each had; a note opened from a card comes back, by the navigation bar, to the same scroll place and selection', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const head = await p.at(card(L + 'Part One') + ' .binders-card-title');
		await tap(p, head.l + 20, head.y);
		await until(p, `${VIEW}.folder?.path === ${j(L + 'Part One')}`);
		await p.sleep(600);
		await shot(p, 'nav-part-one');
		t.eq(j([(await viewState(p)).folder, await headerTitle(p)]), j([L + 'Part One', 'Part One']), 'a tap on a folder’s stack, on its name, goes into it, and the header says so');
		await setMode(p, 'outliner');
		const up = await p.at(`${LEAF} .binders-crumb[role="link"]`);
		await tap(p, up.x, up.y);
		await until(p, `${VIEW}.folder?.path === 'The Lighthouse'`);
		await p.sleep(600);
		t.eq(j([(await viewState(p)).folder, (await viewState(p)).mode, await headerTitle(p)]), j(['The Lighthouse', 'outliner', 'The Lighthouse']), 'the breadcrumb goes up, in the same mode');
		const go = async (dir) => { await p.ev(`app.commands.executeCommandById('app:go-${dir}')`); await p.sleep(900); const s = await viewState(p); return [s.folder, s.mode]; };
		t.eq(j(await go('back')), j([L + 'Part One', 'outliner']), 'Back: the folder');
		t.eq(j(await go('back')), j(['The Lighthouse', 'corkboard']), 'Back again: the binder, as the corkboard it was');
		t.eq(j(await go('forward')), j([L + 'Part One', 'outliner']), 'Forward: the folder');
		t.eq(await p.ev(`(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; })()`), 1, 'all in one tab');
		// to a note and back (with eight more loose notes: the binder's own board, two notes and two stacks, then scrolls)
		await p.ev(`(async () => { for (let i = 1; i <= 8; i++) await ${B}.newScene(app.vault.getAbstractFileByPath('The Lighthouse'), Infinity, 'Extra ' + i); await ${B}.flush(); })().then(() => 1)`);
		await open(p);
		await setMode(p, 'corkboard');
		await until(p, `!!document.querySelector(${j(card(L + 'Extra 8.md'))})`);
		await p.ev(`(() => { ${CORK}.scrollTop = 300; return 1; })()`);
		await p.sleep(400);
		t.eq(await p.ev(`Math.round(${CORK}.scrollTop)`), 300, 'the board is scrolled 300 px down');
		const far = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path$=".md"]')].filter(c => { const r = c.getBoundingClientRect(); return r.top > 230 && r.bottom < 700; }).map(c => c.dataset.path)[0]`);
		const c = await p.at(card(far));
		await tap(p, c.x, c.t + c.h - 16);
		// (where the board is as the note is opened. Not 300 any more: the folder's card that was selected, above what's
		// in sight, offered a synopsis and is 8 px shorter now that another card is selected; the browser keeps what's
		// in sight where it was by scrolling that much less.)
		const place = () => p.ev(`(() => { const b = ${CORK}, top = b.getBoundingClientRect().top, first = [...b.querySelectorAll('.binders-card[data-path]')].find(c => c.getBoundingClientRect().bottom > top + 1); return { scroll: b.scrollTop, first: first?.dataset.path ?? null, at: first ? first.getBoundingClientRect().top - top : 0 }; })()`);
		const left = await place();
		const title = await p.at(card(far) + ' .binders-card-title');
		await tap(p, title.l + 20, title.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(far)}`);
		await p.sleep(700);
		t.eq(await p.ev(`${NAVBACK}.ariaDisabled`), 'false', 'in the note, the navigation bar’s Back is lit');
		const back = await p.ev(`(${R})(${NAVBACK})`);
		await tap(p, back[0] + back[2] / 2, back[1] + back[3] / 2);
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view'`);
		await p.sleep(900);
		t.eq((await viewState(p)).folder, 'The Lighthouse', 'a tap on it returns to the binder');
		const now = await place();
		t.ok(Math.abs(now.scroll - left.scroll) <= 2 && now.first === left.first && Math.abs(now.at - left.at) <= 2, `scrolled where it was when the note was opened, the same card at the same place at its top: ${j(left)}, now ${j(now)}`);
		t.eq(j(await selectedCards(p)), j([far]), 'with the card still selected');
	});
});

bug('phone navigation: after going into a folder of a binder, the navigation bar’s Back is lit, and after Back its Forward is (both stay greyed out, `aria-disabled`, though a tap on them works: the bar only looks at the history when the tab changes)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const head = await p.at(card(L + 'Part One') + ' .binders-card-title');
		await tap(p, head.l + 20, head.y);
		await until(p, `${VIEW}.folder?.path === ${j(L + 'Part One')}`);
		await p.sleep(900);
		await shot(p, 'bug-navbar-back-greyed');
		const inFolder = { history: await p.ev(`app.workspace.getMostRecentLeaf().history.backHistory.length`), disabled: await p.ev(`${NAVBACK}.ariaDisabled`), opacity: await p.ev(`getComputedStyle(${NAVBACK}).opacity`) };
		const back = await p.ev(`(${R})(${NAVBACK})`);
		await tap(p, back[0] + back[2] / 2, back[1] + back[3] / 2);
		await p.sleep(900);
		const after = { folder: (await viewState(p)).folder, forward: await p.ev(`app.workspace.getMostRecentLeaf().history.forwardHistory.length`), disabled: await p.ev(`${NAVFWD}.ariaDisabled`) };
		t.eq(inFolder.history, 1, 'the tab’s history has the binder to go back to');
		t.eq(after.folder, 'The Lighthouse', 'and a tap on Back does go back');
		t.eq(inFolder.disabled, 'false', `in the folder, Back isn’t shown as disabled (opacity ${inFolder.opacity})`);
		t.eq(after.disabled, 'false', 'back on the binder, Forward isn’t shown as disabled (there’s ' + after.forward + ' step forward)');
	});
});

test('phone navigation: a reload brings the view back on the same folder, in the same mode, with the same filter; the binder moved to another folder while open is followed; its binder note deleted, the view says it’s no longer a binder', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await setMode(p, 'outliner');
		await p.ev(`(() => { ${VIEW}.setFilter({ status: ['Draft'], label: [] }); return 1; })()`);
		await p.sleep(500);
		const was = j(await viewState(p));
		await p.ev(`app.workspace.requestSaveLayout()`);
		await until(p, `app.vault.adapter.read(app.vault.configDir + '/workspace-mobile.json').then(x => /outliner/.test(x) && /Draft/.test(x)).catch(() => false)`, 8000);
		await reload(p);
		await p.focusMain();
		await until(p, `!!document.querySelector('.binders-view .binders-outliner-row')`, 8000);
		await p.sleep(800);
		await shot(p, 'reloaded');
		t.eq(j([await activeType(p), j(await viewState(p)), await headerTitle(p)]), j(['binders-view', was, 'Part One']), 'after a reload: the same folder, mode and filter');
		t.eq(j(await p.ev(`[...document.querySelectorAll('.binders-view .binders-outliner-row[data-path]')].map(r => r.dataset.path)`)), j([L + 'Part One/The keeper.md']), 'showing only what passes the filter');
		t.ok(/Filter \(1\)/.test(await p.ev(`document.querySelector('.binders-view .binders-filter-button').textContent`)), 'and the Filter button counts it');
		// moved
		await p.ev(`(() => { ${VIEW}.setFilter({ status: [], label: [] }); return 1; })()`);
		await p.ev(`(async () => { await app.vault.createFolder('Books'); await app.fileManager.renameFile(app.vault.getAbstractFileByPath('The Lighthouse'), 'Books/The Lighthouse'); })().then(() => 1)`);
		await p.sleep(1500);
		t.eq((await viewState(p)).folder, 'Books/The Lighthouse/Part One', 'the binder moved into another folder: the view follows');
		t.eq(await p.ev(`document.querySelectorAll('.binders-view .binders-outliner-row[data-path]').length`), 3, 'with its rows');
		await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Books/The Lighthouse/The Lighthouse.md')).then(() => 1)`);
		await p.sleep(1500);
		await shot(p, 'binder-note-deleted');
		t.ok(/This folder isn’t in a binder/.test(await viewText(p)), 'its binder note deleted: the view says the folder isn’t in a binder');
		t.eq(await p.ev(`document.querySelectorAll('.binders-view .binders-toolbar').length`), 0, 'and offers nothing that would change it');
	});
});

ux('phone navigation: when the folder shown is deleted, the view goes up to the nearest folder of the binder that’s still there (it stays on “This folder isn’t in a binder”, under the deleted folder’s name)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(L + 'Part One')}), true).then(() => 1)`);
		await p.sleep(1500);
		await shot(p, 'ux-folder-deleted');
		t.eq(j([(await viewState(p)).folder, await headerTitle(p)]), j(['The Lighthouse', 'The Lighthouse']), 'the view shows the binder: ' + (await viewText(p)).slice(0, 110));
	});
});

ux('phone navigation: the binder note, which is what the quick switcher finds a binder by, has “Open binder” in its “More options” (a scene has “Show in binder” there; the binder’s own note has no way to its binder but the command palette)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.commands.executeCommandById('switcher:open')`);
		await until(p, `!!document.querySelector('.prompt input')`);
		await p.type('The Lighthouse');
		await p.sleep(600);
		await shot(p, 'ux-switcher');
		const first = await p.at('.prompt .suggestion-item');
		t.ok(/The Lighthouse\/The Lighthouse/.test(await p.ev(`document.querySelector('.prompt .suggestion-item').textContent`)), 'the quick switcher’s first hit for a binder’s name is its binder note');
		await tap(p, first.x, first.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'The Lighthouse.md')}`);
		await p.sleep(700);
		const more = await p.at(MORE);
		await tap(p, more.x, more.y);
		await p.sleep(500);
		await shot(p, 'ux-binder-note-menu');
		const items = await menuItems(p);
		await gone(p);
		t.ok(items.includes('Open binder') || items.includes('Show in binder'), 'its menu has a way to the binder: ' + j(items));
	});
});

bug('phone: in a scene’s “More options”, “New scene after this” is with the note’s other actions, above “Delete file” (it’s the sheet’s very last item, under “Delete file”)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await h.open(L + 'Part One/Arrival.md');
		await p.sleep(600);
		const more = await p.at(MORE);
		await tap(p, more.x, more.y);
		await p.sleep(500);
		const items = await menuItems(p);
		await p.ev(`(() => { const m = document.querySelector('.menu'); (m.querySelector('.menu-scroll') ?? m).scrollTop = 99999; return 1; })()`);
		await p.sleep(300);
		await shot(p, 'bug-scene-menu-end');
		await gone(p);
		t.ok(items.includes('Show in binder') && items.includes('New scene after this'), 'the items are there: ' + j(items));
		t.ok(items.indexOf('New scene after this') < items.indexOf('Delete file'), 'and “New scene after this” comes before “Delete file”: ' + j(items.slice(-4)));
	});
});

bug('phone: “Show in binder” and “Open binder” on a binder’s last note show its card (the board stops with the card under the floating navigation bar and partly below the screen: it’s scrolled to the nearest edge, which the bar covers)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		const seen = {};
		for (const [what, run] of [['Show in binder', async () => { const more = await p.at(MORE); await tap(p, more.x, more.y); await p.sleep(500); await menuTap(p, 'Show in binder'); }], ['Open binder', async () => { await p.ev(`app.commands.executeCommandById('binders:open-binder')`); }]]) {
			await p.ev(`(() => { const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach()); return 1; })()`);
			await h.open(L + 'Epilogue.md');
			await p.sleep(600);
			await run();
			await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view' && !!document.querySelector('.binders-view .binders-card.is-selected')`);
			await p.sleep(1500);
			await shot(p, 'bug-reveal-under-navbar-' + what.replace(/ /g, '-'));
			seen[what] = await p.ev(`(() => { const r = document.querySelector('.binders-view .binders-card.is-selected').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), navbar: Math.round(document.querySelector('.mobile-navbar').getBoundingClientRect().top), screen: innerHeight }; })()`);
		}
		for (const [what, s] of Object.entries(seen)) t.ok(s.bottom <= s.navbar, `${what}: the selected card ends (${s.bottom}) above the navigation bar (${s.navbar}; the screen ends at ${s.screen})`);
	});
});

test('phone: “Show in binder” in a scene’s “More options” opens the binder on its card; “Open binder note” in the view’s opens the note, and Back returns', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await h.open(L + 'Epilogue.md');
		await p.sleep(600);
		const more = await p.at(MORE);
		await tap(p, more.x, more.y);
		await p.sleep(500);
		t.ok(await menuTap(p, 'Show in binder'), 'Show in binder');
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view'`);
		await p.sleep(800);
		t.eq(j([(await viewState(p)).folder, j(await selectedCards(p))]), j(['The Lighthouse', j([L + 'Epilogue.md'])]), 'the binder, with the note’s card selected');
		await tap(p, more.x, more.y);
		await p.sleep(500);
		t.ok(await menuTap(p, 'Open binder note'), 'Open binder note');
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'The Lighthouse.md')}`);
		await p.sleep(600);
		t.eq(await activeFile(p), L + 'The Lighthouse.md', 'the binder note opens');
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view'`);
		t.eq(await activeType(p), 'binders-view', 'Back returns to the binder');
	});
});

// =====================================================================================================================
// The toolbar and the header
// =====================================================================================================================

test('phone toolbar: at 320, 360, 390 and 430 px and on its side (568, 844, 932 px), on a binder with a target and in a folder, with and without a filter: nothing overlaps or sticks out, buttons keep their size, the count shows at the root (as its number alone below 360 px) and from 440 px in a folder, the bar from 440, the buttons’ words from 540; the header’s title is centred', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'The Lighthouse.md')}), fm => { fm.target = 50000; }).then(() => 1)`);
		await open(p);
		for (const [w, hh] of [[320, 568], [360, 740], [390, 844], [430, 932], [568, 320], [844, 390], [932, 430]]) {
			await metrics(p, w, hh);
			await p.sleep(600);
			for (const folder of ['The Lighthouse', L + 'Part One']) {
				await open(p, folder);
				for (const filter of [false, true]) {
					await p.ev(`(() => { ${VIEW}.setFilter({ status: ${filter ? `['Draft', 'Idea']` : '[]'}, label: [] }); return 1; })()`);
					await p.sleep(400);
					const bar = await toolbar(p), what = `${w} × ${hh}, ${folder === 'The Lighthouse' ? 'binder' : 'folder'}${filter ? ', filtered' : ''}`;
					await shot(p, `toolbar-${w}x${hh}-${folder === 'The Lighthouse' ? 'binder' : 'folder'}${filter ? '-filter' : ''}`);
					const has = (c) => bar.kids.find((k) => k.cls === 'binders-' + c);
					t.ok(bar.out <= 0 && bar.overlap.length === 0, `${what}: nothing sticks out or overlaps: ${j(bar.kids.map((k) => [k.cls, k.l, k.r]))}`);
					t.ok(bar.kids.every((k) => k.l >= 0 && k.r <= w), `${what}: everything is on the screen`);
					t.ok(['mode-button', 'filter-button', 'new-button'].every((c) => has(c) && has(c).h >= 32 && has(c).w >= 32), `${what}: the three buttons are there, 32 px or more each way`);
					// (since 0.12.101 the count on the binder's own board is never hidden: below 360 px it's its number alone; in a
					// folder, where the way up needs the room, it still goes below 440)
					const showing = folder === 'The Lighthouse' || w >= 440, wc = has('word-count');
					t.eq(!!wc, showing, `${what}: the word count ${showing ? 'is there' : 'gives way to the folder breadcrumb and Arrange button'}`);
					if (wc) {
						const words = await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-word-count-unit') ?? document.body).display !== 'none'`), shown = await p.ev(`document.querySelector('${LEAF} .binders-word-count').innerText.trim()`);
						t.eq(words, w >= 360, `${what}: the word “words” ${w >= 360 ? 'is' : 'is not'} shown`);
						t.ok(wc.cut <= 0 && wc.r <= w && wc.l >= 0, `${what}: the count is whole and on the screen: ${shown}`);
						t.ok(w >= 360 ? (filter ? / of /.test(shown) : folder === 'The Lighthouse' ? /106 \/ 50,000 words/.test(shown) : /51 words/.test(shown)) : (filter ? /^\d+ of \d+$/.test(shown) : /^106 \/ 50,000$/.test(shown)), `${what}: and right: ${shown}`);
					}
					t.eq(!!has('progress'), w >= 440 && folder === 'The Lighthouse', `${what}: the progress bar shows from 440 px, where there’s a target`);
					t.eq(await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-filter-button .text-button-label')).display !== 'none'`), w >= 540, `${what}: “Filter” is spelled out from 540 px (the button itself is a finger tall by padding at any width: ${has('filter-button').w} px)`);
					// (below 360 px the mode button is its icon and chevron, whole: its name is what a screen reader says and its tooltip)
					const mode = await p.ev(`(() => { const b = document.querySelector('${LEAF} .binders-mode-button'), l = b.querySelector('.text-button-label'), box = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.width]; }, br = box(b); return { label: getComputedStyle(l).display !== 'none', name: b.getAttribute('aria-label'), tip: getComputedStyle(b).getPropertyValue('--no-tooltip').trim(), whole: [b.querySelector('.text-button-icon:not(.mod-aux), svg'), b.querySelector('.mod-aux')].every(e => { if (!e) return false; const r = box(e); return r[2] >= 12 && r[0] >= br[0] - 0.5 && r[1] <= br[1] + 0.5; }) }; })()`);
					t.eq(mode.label, w >= 360, `${what}: the mode’s name is ${w >= 360 ? 'shown' : 'not shown'} on its button`);
					t.ok(/^View as: \S/.test(mode.name ?? '') && mode.whole && (w >= 360 || mode.tip === 'false'), `${what}: the mode button is named for a screen reader, its icon and chevron are whole${w >= 360 ? '' : ', and its name is its tooltip'}: ${JSON.stringify(mode)}`);
					if (filter) t.ok(await p.ev(`document.querySelector('${LEAF} .binders-filter-button').classList.contains('is-active')`), `${what}: the filter button shows it’s on`);
				}
				await p.ev(`(() => { ${VIEW}.setFilter({ status: [], label: [] }); return 1; })()`);
			}
			const head = await p.ev(`({ header: (${R})(document.querySelector('${LEAF} .view-header')), title: (${R})(document.querySelector('${LEAF} .view-header-title')), navbar: (${R})(document.querySelector('.mobile-navbar')), bar: (${R})(document.querySelector('${LEAF} .binders-toolbar')) })`);
			t.ok(Math.abs(head.title[0] + head.title[2] / 2 - w / 2) <= 2, `${w} × ${hh}: the header’s title is centred: ${j(head.title)}`);
			t.eq(head.bar[1], head.header[1] + head.header[3] + 7, `${w} × ${hh}: the toolbar sits right under the header: ${j(head)}`);
			t.ok(head.navbar[0] >= 0 && head.navbar[0] + head.navbar[2] <= w && head.navbar[1] + head.navbar[3] <= hh, `${w} × ${hh}: the navigation bar is on the screen`);
		}
	});
});

test('phone header: “More options” in each mode is a sheet of finger-tall rows: the mode’s own options, the three modes with the current one ticked, “Export...” and the binder’s note; a folder without a note of its own offers none', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const more = await p.at(MORE);
		t.ok(more.w >= 40 && more.h >= 40, `the button is ${Math.round(more.w)} × ${Math.round(more.h)} px`);
		const want = {
			corkboard: ['Close', 'Pin', 'Card size', 'Tint cards with their label color', 'Number the cards', 'Corkboard', 'Outliner', 'Manuscript', 'In a grid', 'By label, across', 'By label, down', 'Show notes in subfolders', 'Show unused labels', 'Export...', 'Take a snapshot of every note...', 'Open binder note'],
			outliner: ['Close', 'Pin', 'Show synopses', 'Columns', 'Expand all', 'Collapse all', 'Corkboard', 'Outliner', 'Manuscript', 'Export...', 'Take a snapshot of every note...', 'Open binder note'],
			manuscript: ['Close', 'Pin', 'Corkboard', 'Outliner', 'Manuscript', 'Export...', 'Take a snapshot of every note...', 'Open binder note'],
		};
		for (const [mode, items] of Object.entries(want)) {
			await setMode(p, mode);
			await tap(p, more.x, more.y);
			await p.sleep(500);
			await shot(p, 'more-options-' + mode);
			const s = await sheet(p);
			t.eq(j(await menuItems(p)), j(items), mode + ': its items');
			t.ok(isSheet(s) && s.itemHeights.every((x) => x >= 44), mode + ': a sheet, each row 44 px or more');
			t.eq(await p.ev(`[...document.querySelectorAll('.menu .menu-item')].filter(i => i.querySelector('.menu-item-icon.mod-checked, .mod-selected, .menu-item-icon.mod-toggle svg') || i.classList.contains('mod-selected') || i.classList.contains('is-checked')).map(i => i.querySelector('.menu-item-title').textContent).filter(x => ['Corkboard', 'Outliner', 'Manuscript'].includes(x)).join()`), mode[0].toUpperCase() + mode.slice(1), mode + ': ticked among the modes');
			await gone(p);
		}
		// a mode picked there
		await tap(p, more.x, more.y);
		await p.sleep(500);
		t.ok(await menuTap(p, 'Corkboard'), 'Corkboard');
		await until(p, `${VIEW}.mode === 'corkboard'`);
		t.eq(j([(await viewState(p)).mode, await menus(p)]), j(['corkboard', 0]), 'a mode picked in the sheet switches to it and closes the sheet');
		// Export... from there
		await p.ev(NOTE_KIND);
		await tap(p, more.x, more.y);
		await p.sleep(500);
		t.ok(await menuTap(p, 'Export...'), 'Export...');
		await until(p, `!!document.querySelector('.modal .binders-export-path')`);
		await p.sleep(400);
		t.eq(j([(await dialog(p)).title, await menus(p)]), j(['Export “The Lighthouse”', 0]), 'opens the Export window, with no sheet left');
		await closeDialog(p);
		// in a folder
		await open(p, L + 'Part One');
		await tap(p, more.x, more.y);
		await p.sleep(500);
		const inFolder = await menuItems(p);
		t.ok(inFolder.includes('Export...') && !inFolder.includes('Open binder note') && !inFolder.includes('Open folder note'), 'in a folder with no note of its own: Export, and no note to open: ' + j(inFolder));
		await p.ev(NOTE_KIND);
		await menuTap(p, 'Export...');
		await until(p, `!!document.querySelector('.modal .binders-export-path')`);
		await p.sleep(400);
		const d = await dialog(p);
		// (how many notes go in is said in the bar over the preview: a phone's second screen)
		await dialogTap(p, 'Preview');
		await until(p, `/ · /.test(document.querySelector('.modal.binders-export .binders-snapshots-detail')?.textContent ?? '')`, 5000);
		const detail = await p.ev(`document.querySelector('.modal.binders-export .binders-snapshots-detail')?.textContent ?? ''`);
		t.ok(d.title === 'Export “Part One”' && /^3 notes · /.test(detail) && /Part One \(exported\)\.md/.test(j(d.fields)), 'which exports that folder: ' + detail);
		await closeDialog(p);
	});
});

// =====================================================================================================================
// The commands
// =====================================================================================================================

test('phone commands: the palette offers Binders’ commands where they apply and only there: nothing open, each mode, a scene, the binder note, a Longform project, a plain note, a read-only binder; after a move, “Undo last move”', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { await app.vault.createFolder('Plain'); await app.vault.create('Plain/A note.md', 'x'); await app.vault.create('Loose.md', 'x'); })().then(() => 1)`);
		await p.ev(FUTURE);
		await p.sleep(1200);
		const offered = async () => { const list = await palette(p, 'Binders'); await closePalette(p); return list.filter((x) => /^Binders/.test(x)).map((x) => x.replace(/^Binders/, '')).sort(); };
		// (“New binder” is offered everywhere, since a binder can be made from anywhere)
		const check = async (what, want) => t.eq(j(await offered()), j([...want, 'New binder'].sort()), what);
		const VIEWS = ['Show corkboard', 'Show outliner', 'Show manuscript', 'Export binder'], ARRANGE = 'Arrange corkboard by label', FOCUS = 'Toggle focus mode', STEP = ['Go to previous scene', 'Go to next scene'];
		// snapshots: of every note of the binder, wherever a binder is in view; a scene's own, where a scene is open
		const ALL = 'Take a snapshot of every note in the binder', SCENE = ['Take a snapshot', 'Rewrite', 'Show snapshots', ALL];
		await check('nothing open', []);
		await open(p);
		await check('a binder’s corkboard', [...VIEWS, 'New scene here', 'Set word count target', ALL, ARRANGE]);
		await setMode(p, 'outliner');
		await check('its outliner', [...VIEWS, 'New scene here', 'Set word count target', ALL]);
		await setMode(p, 'manuscript');
		await check('its manuscript, no caret in it', [...VIEWS, 'New scene here', 'Set word count target', ALL, FOCUS]);
		await setMode(p, 'corkboard');
		await h.open(L + 'Part One/Arrival.md');
		await check('a scene, first in its folder', ['Open binder', 'Export binder', 'New scene here', 'Split scene at cursor', 'Move down', ...SCENE, FOCUS, ...STEP]);
		await h.open(L + 'Part One/Storm warning.md');
		await check('a scene, last in its folder', ['Open binder', 'Export binder', 'New scene here', 'Split scene at cursor', 'Move up', ...SCENE, FOCUS, ...STEP]);
		await h.open(L + 'The Lighthouse.md');
		await check('the binder note', ['Open binder', 'Export binder', 'New scene here', ALL]);
		await h.open('Longform demo/Index.md');
		await check('a Longform project’s index', ['Open binder', 'Export binder', 'New scene here', 'Convert to binder', ALL]);
		await h.open('Longform demo/Harbor.md');
		await check('a Longform scene', ['Open binder', 'Export binder', 'New scene here', 'Convert to binder', 'Split scene at cursor', 'Move down', ...SCENE, FOCUS, 'Go to next scene']);
		await open(p, 'Longform demo');
		await check('a Longform project’s view', [...VIEWS, 'New scene here', 'Set word count target', 'Convert to binder', ALL, ARRANGE]);
		await h.open('Plain/A note.md');
		await check('a note in a plain folder', ['Make this folder a binder']);
		await h.open('Loose.md');
		await check('a note in the vault’s root', []);
		await h.open('Future/One.md');
		await check('a scene of a read-only binder', ['Open binder', 'Export binder', 'Show snapshots', FOCUS]);
		await open(p, 'Future');
		await check('a read-only binder’s view', [...VIEWS, ARRANGE]);
		// a command run from the palette by touch
		await open(p);
		await palette(p, 'Show outliner');
		const first = await p.at('.prompt .suggestion-item');
		await tap(p, first.x, first.y);
		await until(p, `${VIEW}.mode === 'outliner'`);
		t.eq((await viewState(p)).mode, 'outliner', '“Show outliner”, tapped in the palette, switches the mode');
		// after a move made in the explorer
		await showExplorer(p, ['The Lighthouse', L + 'Part Two']);
		await explorerMenu(p, L + 'Part Two/Lights out.md');
		await menuTap(p, 'Move up');
		await p.sleep(700);
		await flush(p);
		t.eq(j((await contents(p)).slice(6, 8)), j(['Part Two/Lights out', 'Part Two/The wreck']), '“Move up” in the explorer moves the note');
		t.ok(await drawerOpen(p), 'the drawer stays open for the next move');
		t.ok((await offered()).includes('Undo last move'), 'and “Undo last move” is offered');
		await p.ev(`app.commands.executeCommandById('binders:undo-move')`);
		await p.sleep(800);
		await flush(p);
		t.eq(j((await contents(p)).slice(6, 8)), j(['Part Two/The wreck', 'Part Two/Lights out']), 'which takes it back');
		t.ok((await notices(p)).some((n) => /^Undid: /.test(n)), 'and says so: ' + j(await notices(p)));
	});
});

ux('phone commands: “New binder” is a command (with nothing open the palette offers nothing of Binders’: a first binder can only be made from a long press in the file explorer)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		const list = await palette(p, 'binder');
		await shot(p, 'ux-palette-nothing-open');
		await closePalette(p);
		t.ok(list.some((x) => /New binder/.test(x)), 'offered with nothing open: ' + j(list));
	});
});

// =====================================================================================================================
// Dialogs
// =====================================================================================================================

test('phone dialogs: the word count opens “Set target”; Done on the keyboard sets it, closes the dialog, and the toolbar shows it; an emptied field takes it away', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const c = await p.at(`${LEAF} .binders-word-count`);
		await tap(p, c.x, c.y);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		let d = await dialog(p);
		t.ok(d.title === 'Word count target for the binder' && fitsScreen(d) && d.focus.startsWith('INPUT'), 'the dialog, its field focused: ' + j(d.box));
		t.ok(d.fields[0].font >= 14 && d.fields[0].rect[3] >= 44, 'the field is a finger tall');
		// with the keyboard up, everything is still above it
		await metrics(p, PHONE[0], PHONE[1] - KEYBOARD);
		await p.sleep(500);
		await shot(p, 'target-keyboard');
		d = await dialog(p);
		t.ok(fitsScreen(d) && d.buttons.every((b) => b.rect[1] + b.rect[3] <= d.inner[1]), 'with the keyboard up, the field and both buttons are above it: ' + j(d.buttons.map((b) => b.rect)));
		await metrics(p, ...PHONE);
		await p.sleep(400);
		await p.type('80,000');
		await p.key('Enter');
		await until(p, `document.querySelectorAll('.modal-container').length === 0`);
		await flush(p);
		t.eq(await prop(p, L + 'The Lighthouse.md', 'target'), '80000', 'Enter sets it');
		await until(p, `/80,000/.test(document.querySelector('${LEAF} .binders-word-count').textContent)`);
		const bar = await toolbar(p);
		t.ok(bar.out <= 0 && bar.overlap.length === 0 && bar.kids.some((k) => k.text === '106 / 80,000 words'), 'the toolbar shows it and still fits: ' + j(bar.kids.map((k) => k.text)));
		await tap(p, c.x, c.y);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		t.eq((await dialog(p)).fields[0].value, '80000', 'opened again, the field has the target');
		await p.key('Backspace');
		await dialogTap(p, 'Set target');
		await flush(p);
		t.eq(await prop(p, L + 'The Lighthouse.md', 'target'), null, 'emptied, the target is taken away');
		t.eq(await dialogs(p), 0, 'and the dialog is closed');
	});
});

bug('phone dialogs: after Done on the keyboard in “Set target”, the word count has no focus ring (the dialog hands the focus back to it, and coming from a text field it shows `:focus-visible`: a box around the count nobody asked for)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		const c = await p.at(`${LEAF} .binders-word-count`);
		await tap(p, c.x, c.y);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(400);
		await p.type('80000');
		await p.key('Enter');
		await until(p, `document.querySelectorAll('.modal-container').length === 0`);
		await p.sleep(700);
		await shot(p, 'bug-count-focus-ring');
		const ring = await p.ev(`(() => { const a = document.activeElement, s = getComputedStyle(a); return { on: a.className, visible: a.matches(':focus-visible'), shadow: s.boxShadow, outline: s.outlineStyle + ' ' + s.outlineWidth }; })()`);
		t.ok(!(ring.visible && /binders-word-count/.test(ring.on)), 'no ring on the count after a touch-only exchange: ' + j(ring));
	});
});

test('phone dialogs: Export as one note to a name that’s taken asks before replacing and Cancel keeps that note; names that can’t be used are refused in words; a folder in the name is made; exporting again replaces the last export without asking, and asks once it’s been written in; Copy copies', async (p, h, t) => {
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.vault.create('Mine.md', 'My own writing.').then(() => 1)`);
		await open(p);
		await openOneNote(p);
		const field = await p.ev(`(() => { const i = document.querySelector('.modal .binders-export-path'); return { rect: (${R})(i), cut: i.scrollWidth - i.clientWidth, value: i.value }; })()`);
		t.ok(field.value === 'The Lighthouse (exported).md' && field.cut <= 0 && field.rect[2] >= 300 && field.rect[3] >= 44, 'the name offered shows whole in a full-width field: ' + j(field));
		const rows = await p.ev(`[...document.querySelectorAll('.modal .setting-item')].map(s => { const R = ${R}; return { name: s.querySelector('.setting-item-name').textContent, row: R(s), control: R(s.querySelector('.setting-item-control > *')) }; })`);
		t.eq(j(rows.map((r) => r.name)), j(['Title', 'Folders as headings', 'Note titles as headings', 'Between notes', 'Leave out comments', 'Take tabs off paragraphs', 'Save as']), 'its settings');
		t.eq(j((await exportButtons(p)).map((b) => b.text)), j(['Preview', 'Copy', 'Export']), 'and at their foot Preview, Copy and Export');
		t.ok(rows.every((r) => r.control[0] >= r.row[0] && r.control[0] + r.control[2] <= r.row[0] + r.row[2] && r.control[3] >= 30), 'each control inside its row, a finger tall: ' + j(rows.map((r) => r.control)));
		// taken by a note of the writer's
		await setPath(p, 'Mine');
		await dialogTap(p, 'Export');
		await until(p, `document.querySelectorAll('.modal-container').length === 2`);
		await p.sleep(400);
		await shot(p, 'compile-replace-mine');
		let d = await dialog(p);
		t.ok(d.title === 'Replace this note' && /“Mine” is already there, and wasn’t made by an export/.test(d.text) && fitsScreen(d), 'a note that isn’t an export’s: asked about first');
		await dialogTap(p, 'Cancel');
		t.eq(j([await dialogs(p), await read(p, 'Mine.md')]), j([1, 'My own writing.']), 'Cancel keeps the note, and the Export window');
		for (const [v, why] of [['The Lighthouse/Out', /Save it outside the binder: in it, the note would be one of its scenes\./], ['', /Give the note a name\./], ['a:b', /That name can’t be used/], ['.hidden', /That name can’t be used/], ['   ', /Give the note a name\./]]) {
			await clearNotices(p);
			await setPath(p, v);
			await dialogTap(p, 'Export');
			await p.sleep(700);
			t.ok((await notices(p)).some((n) => why.test(n)) && (await dialogs(p)) === 1, `“${v}” is refused, in words, and the window stays: ${j(await notices(p))}`);
		}
		await shot(p, 'compile-refused');
		await clearNotices(p);
		await setPath(p, 'Exports/Draft one');
		await dialogTap(p, 'Export');
		await until(p, `!!app.vault.getAbstractFileByPath('Exports/Draft one.md')`, 5000);
		await p.sleep(900);
		t.eq(j([await dialogs(p), await activeFile(p)]), j([0, 'Exports/Draft one.md']), 'a folder in the name is made, and the exported note opens');
		t.ok((await notices(p)).includes('Exported 7 notes into “Draft one”.'), 'with a word about it');
		const text = await read(p, 'Exports/Draft one.md');
		t.ok(/^# The Lighthouse\n/.test(text) && /The light had not gone out/.test(text) && !/^---/m.test(text.replace(/\n---\n/g, '')) && !/synopsis:/.test(text), 'the text of the notes, without properties');
		// again, to the same place: no question
		await open(p);
		await openOneNote(p);
		await setPath(p, 'Exports/Draft one');
		await dialogTap(p, 'Export');
		await p.sleep(1200);
		t.eq(j([await dialogs(p), (await tabs(p)).filter((x) => /Draft one/.test(x)).length]), j([0, 1]), 'exported again: replaced without a question, in the tab it’s open in');
		// written in since: asked
		await p.ev(`app.vault.adapter.write('Exports/Draft one.md', 'changed by hand').then(() => 1)`);
		await p.sleep(900);
		await open(p);
		await openOneNote(p);
		await setPath(p, 'Exports/Draft one');
		await dialogTap(p, 'Export');
		await until(p, `document.querySelectorAll('.modal-container').length === 2`);
		await p.sleep(400);
		d = await dialog(p);
		t.ok(/has been changed since it was exported/.test(d.text), 'written in since: asked about');
		await metrics(p, ...SMALL);
		await p.sleep(500);
		await shot(p, 'compile-replace-320');
		d = await dialog(p);
		t.ok(fitsScreen(d) && d.buttons.every((b) => b.rect[3] >= 44 && b.rect[1] + b.rect[3] <= d.box[1] + d.box[3]), 'the question fits at 320 px: ' + j(d.box));
		await metrics(p, ...PHONE);
		await p.sleep(400);
		await dialogTap(p, 'Replace');
		await until(p, `app.vault.adapter.read('Exports/Draft one.md').then(x => /^# The Lighthouse/.test(x))`, 5000);
		t.eq(await dialogs(p), 0, 'Replace exports and closes both');
		// Copy
		await open(p);
		await openOneNote(p);
		await clearNotices(p);
		await dialogTap(p, 'Copy');
		await p.sleep(900);
		t.eq(j([await dialogs(p), j(await notices(p))]), j([0, j(['Copied 7 notes as one text.'])]), 'Copy closes the window and says how much was copied');
	});
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) t.eq(after[path], text, `“${path}” is unchanged`);
});

ux('phone dialogs: in Export, Done on the keyboard in “Save as” exports, as it sets the target in “Set target” (nothing happens; the Export button is a scroll away under the keyboard)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await openOneNote(p);
		await setPath(p, 'Out');
		await p.key('Enter');
		await p.sleep(1500);
		const made = await has(p, 'Out.md');
		t.ok(made, 'Enter in the name’s field exports (dialogs still open: ' + (await dialogs(p)) + ')');
	});
});

ux('phone dialogs: Export remembers where this binder was last exported to as one note, so that “exporting again replaces the last export” without typing the name again (it offers “… (exported).md” every time)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await openOneNote(p);
		await setPath(p, 'Exports/Second draft');
		await dialogTap(p, 'Export');
		await until(p, `!!app.vault.getAbstractFileByPath('Exports/Second draft.md')`, 5000);
		await p.sleep(700);
		await open(p);
		await openOneNote(p);
		const offered = await p.ev(`document.querySelector('.modal .binders-export-path').value`);
		await closeDialog(p);
		t.ok(/Exports\/Second draft/.test(offered), 'the name offered the second time: ' + offered);
	});
});

ux('phone dialogs: after Export, Back returns from the exported note to the binder (the note opens in a second tab, whose Back is dead: the binder is only reachable through the tab switcher)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p);
		await openOneNote(p);
		await dialogTap(p, 'Export');
		await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse (exported).md'`, 5000);
		await p.sleep(800);
		await shot(p, 'ux-compiled-tab');
		const n = (await tabs(p)).length, back = await p.ev(`${NAVBACK}.ariaDisabled`);
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await p.sleep(900);
		t.eq(await activeType(p), 'binders-view', `Back returns to the binder (tabs: ${n}; Back disabled: ${back})`);
	});
});

// =====================================================================================================================
// Settings
// =====================================================================================================================

test('phone settings: the switches work by touch and “Hide binder and folder notes” is off limits while ordering is off; a label is added with its name ready, renamed (the notes that have it are asked about), refused a taken name, reordered by its handle, deleted, and the defaults restored after a question', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}), fm => { fm.label = 'Red'; }).then(() => 1)`);
		await p.ev(`(() => { app.setting.open(); return 1; })()`);
		await p.sleep(900);
		t.ok(await p.ev(`[...document.querySelectorAll('.modal.mod-settings .vertical-tab-nav-item')].some(e => e.textContent === 'Binders')`), 'Binders is in the settings’ list');
		await openSettings(p);
		await shot(p, 'settings-top');
		t.eq(j(await p.ev(`[...${TAB}.querySelectorAll('.setting-item-heading')].map(e => e.textContent)`)), j(['File explorer', 'Paragraphs', 'Sidebar', 'Word counts', 'Labels', 'Statuses', 'Focus mode', 'Export', 'Property names']), 'its nine parts');
		t.eq(j(await p.ev(`['exports', 'places', 'author', 'contact'].map(c => ${TAB}.querySelector('.binders-settings-' + c + ' .setting-item-name')?.textContent ?? null)`)), j(['Exports folder', 'Remembered places', 'Your name', 'Contact details']), 'Export’s four rows');
		t.ok(await p.ev(`${TAB}.scrollWidth <= ${TAB}.clientWidth + 1`), 'nothing wider than the screen');
		const toggles = () => p.ev(`[...${TAB}.querySelectorAll('.checkbox-container')].slice(0, 4).map(e => { e.scrollIntoView({ block: 'nearest' }); return (${R})(e); })`);
		const flags = () => p.ev(`(({ orderExplorer, openOnClick, hideBinderNotes, explorerLabels }) => [orderExplorer, openOnClick, hideBinderNotes, explorerLabels].join())(${PL}.settings)`);
		let tg = await toggles();
		t.eq(await p.ev(`${TAB}.querySelectorAll('.checkbox-container').length`), 14, 'four explorer switches, two for paragraphs, one for the sidebar, one for word counts and six focus switches');
		t.ok(tg.length === 4 && tg.every((r) => r[2] >= 44 && r[3] >= 28), 'four explorer switches, each a finger wide: ' + j(tg));
		await tap(p, tg[0][0] + tg[0][2] / 2, tg[0][1] + tg[0][3] / 2);
		await p.sleep(700);
		await shot(p, 'settings-order-off');
		t.eq(j([await flags(), await p.ev(`${PL}.explorer.status`)]), j(['false,true,true,true', 'off']), 'the first, tapped, turns ordering off');
		t.ok(await p.ev(`[...${TAB}.querySelectorAll('.setting-item')].find(s => /Hide binder/.test(s.textContent)).classList.contains('is-disabled')`), 'and greys out “Hide binder and folder notes”');
		tg = await toggles();
		await tap(p, tg[2][0] + tg[2][2] / 2, tg[2][1] + tg[2][3] / 2);
		await p.sleep(500);
		t.eq(await flags(), 'false,true,true,true', 'which a tap can’t change meanwhile');
		await tap(p, tg[0][0] + tg[0][2] / 2, tg[0][1] + tg[0][3] / 2);
		await p.sleep(700);
		for (const i of [1, 3]) { tg = await toggles(); await tap(p, tg[i][0] + tg[i][2] / 2, tg[i][1] + tg[i][3] / 2); await p.sleep(500); }
		t.eq(j([await flags(), await p.ev(`${PL}.explorer.status`)]), j(['true,false,true,false', 'patched']), 'ordering back on; the second and fourth switch off by touch');
		// add a label
		const at = async (find) => { await p.ev(`(() => { (${find}).scrollIntoView({ block: 'center' }); return 1; })()`); await p.sleep(300); const r = await p.ev(`(${R})(${find})`); return { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, r }; };
		const names = () => p.ev(`${PL}.settings.labels.map(l => l.name).join()`);
		let a = await at(`[...${TAB}.querySelectorAll('.binders-settings-labels *')].find(e => e.childElementCount === 0 && e.textContent === 'Add label')`);
		await tap(p, a.x, a.y);
		await p.sleep(900);
		await shot(p, 'settings-label-added');
		let f = await focusInfo(p);
		t.eq(j([f.tag, f.text, f.sel]), j(['INPUT', 'New label', 'New label']), '“Add label”: a new row, its name selected');
		t.ok(f.rect[1] >= 60 && f.rect[1] + f.rect[3] <= PHONE[1] - KEYBOARD, 'in sight above where the keyboard comes: ' + j(f.rect));
		await p.type('Subplot');
		await p.key('Enter');
		await p.sleep(700);
		t.eq(await names(), 'Red,Orange,Yellow,Green,Cyan,Blue,Purple,Pink,Subplot', 'typed over and kept by Enter');
		// rename one that a note has
		const first = `${TAB}.querySelector('.binders-settings-label .setting-item-name input')`;
		a = await at(first);
		t.ok(a.r[2] >= 200 && a.r[3] >= 40, 'a label’s name is a wide, finger-tall field: ' + j(a.r));
		await tap(p, a.x, a.y);
		await p.ev(`(() => { ${first}.select(); return 1; })()`);
		await p.type('Crimson');
		await p.key('Enter');
		await until(p, `document.querySelectorAll('.modal-container').length === 2`);
		await p.sleep(400);
		await shot(p, 'settings-rename-label');
		let d = await dialog(p);
		t.ok(d.title === 'Rename the label in your notes' && /One note has the label “Red”/.test(d.text) && fitsScreen(d), 'renamed: the note that has it is asked about, over the settings');
		await dialogTap(p, 'Change it');
		await until(p, `app.vault.adapter.read(${j(L + 'Prologue.md')}).then(x => /label: Crimson/.test(x))`, 4000);
		t.eq(await prop(p, L + 'Prologue.md', 'label'), 'Crimson', '“Change it” renames it in the note');
		// a name that's taken
		await clearNotices(p);
		a = await at(first);
		await tap(p, a.x, a.y);
		await p.ev(`(() => { ${first}.select(); return 1; })()`);
		await p.type('blue');
		await p.key('Enter');
		await p.sleep(700);
		t.eq(j([await p.ev(`${first}.value`), j(await notices(p))]), j(['Crimson', j(['There’s a label called “blue” already.'])]), 'a taken name is refused, and the old one put back');
		// reorder by the handle, by touch
		const hd = await p.ev(`[...${TAB}.querySelectorAll('.binders-settings-label [aria-label="Drag to rearrange"]')].slice(0, 3).map(${R})`);
		t.ok(hd.every((r) => r[2] >= 28 && r[3] >= 28), 'the handles: ' + j(hd));
		await touch(p, 'touchStart', hd[0][0] + hd[0][2] / 2, hd[0][1] + hd[0][3] / 2);
		await p.sleep(700);
		for (let i = 1; i <= 10; i++) { await touch(p, 'touchMove', hd[0][0] + hd[0][2] / 2, hd[0][1] + hd[0][3] / 2 + (hd[2][1] - hd[0][1] + 10) * i / 10); await p.sleep(30); }
		await p.sleep(300);
		await shot(p, 'settings-label-dragging');
		await touch(p, 'touchEnd');
		await p.sleep(900);
		t.eq(await names(), 'Orange,Yellow,Crimson,Green,Cyan,Blue,Purple,Pink,Subplot', 'a label dragged by its handle, by touch, moves down two');
		// delete
		a = await at(`${TAB}.querySelector('.binders-settings-label [aria-label="Delete"]')`);
		await tap(p, a.x, a.y);
		await p.sleep(700);
		t.eq(await names(), 'Yellow,Crimson,Green,Cyan,Blue,Purple,Pink,Subplot', 'its ✕ deletes a label');
		t.eq(await prop(p, L + 'Prologue.md', 'label'), 'Crimson', 'no note changes');
		// restore
		a = await at(`[...${TAB}.querySelectorAll('.clickable-icon, .extra-setting-button')].find(e => /Restore the default labels/.test(e.getAttribute('aria-label') ?? ''))`);
		await tap(p, a.x, a.y);
		await until(p, `document.querySelectorAll('.modal-container').length === 2`);
		await p.sleep(400);
		await shot(p, 'settings-restore');
		d = await dialog(p);
		t.ok(d.title === 'Restore the default labels' && fitsScreen(d) && /Your notes aren’t changed/.test(d.text), 'restoring the defaults asks first');
		await dialogTap(p, 'Cancel');
		t.eq(await names(), 'Yellow,Crimson,Green,Cyan,Blue,Purple,Pink,Subplot', 'Cancel keeps them');
		a = await at(`[...${TAB}.querySelectorAll('.clickable-icon, .extra-setting-button')].find(e => /Restore the default labels/.test(e.getAttribute('aria-label') ?? ''))`);
		await tap(p, a.x, a.y);
		await until(p, `document.querySelectorAll('.modal-container').length === 2`);
		await p.sleep(400);
		await dialogTap(p, 'Restore');
		await p.sleep(700);
		t.eq(await names(), 'Red,Orange,Yellow,Green,Cyan,Blue,Purple,Pink', 'Restore brings the eight back');
	});
});

test('phone settings: statuses are added, renamed (asking about the notes), reordered and deleted by touch; a property name that’s taken or reserved is refused in words, an emptied one goes back to its default, a new one is kept; at 320 px nothing is wider than the screen', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await openSettings(p);
		const at = async (find) => { await p.ev(`(() => { (${find}).scrollIntoView({ block: 'center' }); return 1; })()`); await p.sleep(300); const r = await p.ev(`(${R})(${find})`); return { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, r }; };
		const statuses = () => p.ev(`${PL}.settings.statuses.join()`);
		let a = await at(`[...${TAB}.querySelectorAll('.binders-settings-statuses *')].find(e => e.childElementCount === 0 && e.textContent === 'Add status')`);
		await tap(p, a.x, a.y);
		await p.sleep(900);
		const f = await focusInfo(p);
		t.eq(j([f.tag, f.sel]), j(['INPUT', 'New status']), '“Add status”: a new row, its name selected');
		await p.type('Proofread');
		await p.key('Enter');
		await p.sleep(700);
		t.eq(await statuses(), 'Idea,Draft,Revised,Done,Proofread', 'named');
		await shot(p, 'settings-statuses');
		// rename Draft: three notes have it (as "draft")
		const second = `${TAB}.querySelectorAll('.binders-settings-status .setting-item-name input')[1]`;
		a = await at(second);
		await tap(p, a.x, a.y);
		await p.ev(`(() => { ${second}.select(); return 1; })()`);
		await p.type('First draft');
		await p.key('Enter');
		await until(p, `document.querySelectorAll('.modal-container').length === 2`);
		await p.sleep(400);
		const d = await dialog(p);
		t.ok(d.title === 'Rename the status in your notes' && /notes have the status “Draft”/.test(d.text), 'a status renamed: asked about the notes that have it: ' + d.text.slice(0, 60));
		await dialogTap(p, 'Cancel');
		await p.sleep(500);
		t.eq(j([await statuses(), await prop(p, L + 'Prologue.md', 'status')]), j(['Idea,First draft,Revised,Done,Proofread', 'draft']), 'Cancel: the list has the new name, the notes keep theirs');
		await p.ev(`(() => { ${TAB}.querySelectorAll('.binders-settings-status')[1].scrollIntoView({ block: 'center' }); return 1; })()`);
		await p.sleep(400);
		const hd = await p.ev(`[...${TAB}.querySelectorAll('.binders-settings-status [aria-label="Drag to rearrange"]')].map(${R})`);
		await touch(p, 'touchStart', hd[0][0] + hd[0][2] / 2, hd[0][1] + hd[0][3] / 2);
		await p.sleep(700);
		for (let i = 1; i <= 10; i++) { await touch(p, 'touchMove', hd[0][0] + hd[0][2] / 2, hd[0][1] + hd[0][3] / 2 + (hd[1][1] - hd[0][1] + 20) * i / 10); await p.sleep(30); }
		await p.sleep(300);
		await touch(p, 'touchEnd');
		await p.sleep(900);
		t.eq(await statuses(), 'First draft,Idea,Revised,Done,Proofread', 'a status dragged by its handle moves');
		a = await at(`${TAB}.querySelector('.binders-settings-status [aria-label="Delete"]')`);
		await tap(p, a.x, a.y);
		await p.sleep(700);
		t.eq(await statuses(), 'Idea,Revised,Done,Proofread', 'and its ✕ deletes it');
		// property names
		const props = `[...${TAB}.querySelectorAll('.setting-item:not(.binders-settings-label):not(.binders-settings-status):not(.binders-settings-goal):not(.binders-settings-exports):not(.binders-settings-author) input[type="text"]')]`;
		const fields = await p.ev(`${props}.map(i => { i.scrollIntoView({ block: 'center' }); return { v: i.value, ph: i.placeholder, r: (${R})(i) }; })`);
		t.eq(j(fields.map((x) => [x.v, x.ph])), j([['synopsis', 'synopsis'], ['status', 'status'], ['label', 'label'], ['target', 'target'], ['notes', 'notes']]), 'five property names');
		t.ok(fields.every((x) => x.r[2] >= 200 && x.r[3] >= 40), 'in wide, finger-tall fields');
		for (const [v, value, why] of [['status', 'synopsis', /“status” is the property for the status/], ['contents', 'synopsis', /Binders keeps “contents” for itself/], ['', 'synopsis', null], ['summary', 'summary', null]]) {
			await clearNotices(p);
			a = await at(`${props}[0]`);
			await tap(p, a.x, a.y);
			await p.ev(`(() => { ${props}[0].select(); return 1; })()`);
			if (v) await p.type(v); else await p.key('Backspace');
			await p.key('Enter');
			await p.sleep(700);
			const n = await notices(p);
			t.eq(j([await p.ev(`${props}[0].value`), await p.ev(`${PL}.settings.synopsisProp`)]), j([value, value]), `the synopsis’s property typed as “${v}”: ${value}`);
			t.ok(why ? n.some((x) => why.test(x)) : n.length === 0, `and ${why ? 'it says why not' : 'nothing is said'}: ${j(n)}`);
		}
		await shot(p, 'settings-props');
		await metrics(p, ...SMALL);
		await p.sleep(700);
		await shot(p, 'settings-320');
		t.ok(await p.ev(`${TAB}.scrollWidth <= ${TAB}.clientWidth + 1 && [...${TAB}.querySelectorAll('.setting-item, .setting-item-control > *, input, select:not(.is-measuring)')].every(e => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.left >= 0 && r.right <= innerWidth + 1); })`), 'at 320 px nothing is wider than the screen');
	});
});

bug('phone settings: a label’s color menu shows the color’s name whole (the menu is 90 px wide whatever it says: “Orange” reads “Orang”, “Custom” “Custo”, while Obsidian has measured that they need 98 px and more)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await openSettings(p);
		await p.ev(`(() => { ${TAB}.querySelectorAll('.binders-settings-label')[1].scrollIntoView({ block: 'center' }); return 1; })()`);
		await p.sleep(400);
		await shot(p, 'bug-settings-color-menu');
		const menus = await p.ev(`[...${TAB}.querySelectorAll('.binders-settings-label select:not(.is-measuring)')].map(s => ({ text: s.options[s.selectedIndex].text, width: Math.round(s.getBoundingClientRect().width), needs: Math.round(parseFloat(s.style.getPropertyValue('--dropdown-fitted-width')) || s.parentElement.querySelector('select.is-measuring')?.getBoundingClientRect().width || 0) }))`);
		t.eq(menus.length, 8, 'eight labels');
		t.ok(menus.every((m) => m.needs > 0), 'Obsidian says how wide each needs to be: ' + j(menus));
		t.eq(j(menus.filter((m) => m.width < m.needs).map((m) => `${m.text}: ${m.width} of ${m.needs} px`)), '[]', 'each menu is as wide as its text needs');
	});
});

ux('phone settings: a property’s name is typed without the keyboard capitalizing or correcting it (the fields have no `autocapitalize="none"`: “summary” comes out “Summary” on a phone, which is another property)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await openSettings(p);
		const fields = await p.ev(`[...${TAB}.querySelectorAll('.setting-item:not(.binders-settings-label):not(.binders-settings-status):not(.binders-settings-goal):not(.binders-settings-exports):not(.binders-settings-author) input[type="text"]')].map(i => ({ value: i.value, autocapitalize: i.getAttribute('autocapitalize'), autocorrect: i.getAttribute('autocorrect') }))`);
		t.ok(fields.length === 5 && fields.every((f) => /^(none|off)$/.test(f.autocapitalize ?? '')), 'each field turns capitals off: ' + j(fields));
	});
});

// =====================================================================================================================
// Other binders: read only, Longform, empty, many, long and right-to-left names
// =====================================================================================================================

test('phone: a binder in a newer format says it’s read only in every mode, at 390 and 320 px, with no “New” and no target to set; Export still works', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(FUTURE);
		await p.sleep(1200);
		t.ok((await notices(p)).some((n) => /Binders can’t change “Future”/.test(n)), 'it says so when the binder is found');
		await open(p, 'Future');
		for (const [w, hh] of [PHONE, SMALL]) {
			await metrics(p, w, hh);
			await p.sleep(500);
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await setMode(p, mode);
				await shot(p, `readonly-${w}-${mode}`);
				const n = await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-notice'); return { r: (${R})(e), text: e.textContent, cut: e.scrollWidth - e.clientWidth }; })()`);
				t.ok(/^Read only\. It was made by a newer version of Binders \(format 99\)/.test(n.text) && n.r[3] > 20 && n.r[0] >= 0 && n.r[0] + n.r[2] <= w && n.cut <= 0, `${w} px, ${mode}: the notice shows whole: ${j(n.r)}`);
				const bar = await toolbar(p);
				t.ok(bar.out <= 0 && bar.overlap.length === 0 && !bar.kids.some((k) => k.cls === 'binders-new-button'), `${w} px, ${mode}: the toolbar fits, with no “New”`);
			}
			await setMode(p, 'corkboard');
		}
		await metrics(p, ...PHONE);
		await p.sleep(500);
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card-new').length`), 0, 'no “New note” tile');
		const c = await p.at(`${LEAF} .binders-word-count`);
		await tap(p, c.x, c.y);
		await p.sleep(600);
		t.eq(await dialogs(p), 0, 'a tap on the count asks for no target');
		const one = await p.at(card('Future/One.md'));
		await hold(p, one.x, one.t + one.h - 16);
		const items = await menuItems(p);
		await gone(p);
		t.ok(items.includes('Open') && !items.includes('Rename') && !items.includes('Delete') && !items.includes('Set status'), 'a card’s menu opens the note and changes nothing: ' + j(items));
		await openOneNote(p);
		await dialogTap(p, 'Export');
		await until(p, `!!app.vault.getAbstractFileByPath('Future (exported).md')`, 5000);
		t.ok(/one/.test(await read(p, 'Future (exported).md')), 'Export reads it all the same');
		t.eq(await read(p, 'Future/Future.md'), '---\nbinder: 99\ncontents:\n  - One\n---\n', 'and its binder note is untouched');
	});
});

test('phone: a Longform project in the explorer and as a binder: its scenes in Longform’s order with the index hidden, a tap opens it, groups show under their scene, and “More options” leaves out stacks', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await showExplorer(p, ['Longform demo']);
		await shot(p, 'longform-explorer');
		t.eq(j((await explorerRows(p)).filter((r) => r.path.startsWith('Longform demo/')).map((r) => r.path.slice(14))), j(['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Return.md', 'Notes on ferries.md']), 'the scenes in Longform’s order, the index hidden, what it ignores last');
		const r = await p.at(explorerRow('Longform demo'));
		await tap(p, r.x, r.y);
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view'`);
		await p.sleep(900);
		await shot(p, 'longform-view');
		t.eq(j([(await viewState(p)).folder, await drawerOpen(p)]), j(['Longform demo', false]), 'a tap opens the project as a binder');
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path.slice(14))`)), j(['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Return.md']), 'its scenes as cards');
		t.ok(/Harbor\n2 notes · 13 words/.test(await viewText(p)), 'the indented scenes under their scene’s name');
		const bar = await toolbar(p);
		t.ok(bar.out <= 0 && bar.overlap.length === 0 && bar.kids.some((k) => k.text === '30 words'), 'the toolbar fits and counts');
		const more = await p.at(MORE);
		await tap(p, more.x, more.y);
		await p.sleep(500);
		const items = await menuItems(p);
		await gone(p);
		t.ok(!items.includes('Show subfolders as stacks') && items.includes('Open binder note') && items.includes('Export...'), 'More options: no stacks, where there are no folders: ' + j(items));
	});
});

ux('phone: an empty binder’s hint names something on the screen (“Use “New” above to add one.”: on a phone the button is a bare + with no word on it, and the “New note” tile is right below)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { await app.vault.createFolder('Empty'); await app.vault.create('Empty/Empty.md', '---\\nbinder: 1\\ncontents: []\\n---\\n'); })().then(() => 1)`);
		await p.sleep(1000);
		await open(p, 'Empty');
		await shot(p, 'ux-empty-binder');
		const hint = await p.ev(`document.querySelector('${LEAF} .binders-empty-text')?.textContent ?? ''`);
		const named = (/“(.+?)”/.exec(hint) ?? [])[1];
		const seen = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-view *')].some(e => e.childElementCount === 0 && !e.closest('.binders-empty') && e.textContent.trim() === ${j(named ?? '')} && e.getBoundingClientRect().width > 0)`);
		t.ok(!named || seen, `the hint says “${hint}”; something reading “${named}” shows`);
	});
});

test('phone: fifty binders, and names too long or written right to left: every binder is tagged, long names end in an ellipsis clear of the tag and the dot, the header’s title is cut with an ellipsis, and the toolbar fits at 390 and 320 px', async (p, h, t) => {
	const LONG = 'A very long binder name that goes on and on past the edge of any phone screen ever made', SUB = 'Sub folder with a long name too, longer than the row', SCENE = 'A scene whose name is also far too long to fit in a row of the file explorer';
	const RTL = 'ספר המגדלור', RSUB = 'פרק ראשון';
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => {
			for (let i = 1; i <= 50; i++) { const n = 'Book ' + String(i).padStart(2, '0'); await app.vault.createFolder(n); await app.vault.create(n + '/' + n + '.md', '---\\nbinder: 1\\ncontents:\\n  - One\\n---\\n'); await app.vault.create(n + '/One.md', 'one'); }
			const long = ${j(LONG)}; await app.vault.createFolder(long); await app.vault.create(long + '/' + long + '.md', '---\\nbinder: 1\\ncontents:\\n  - ${SUB}/\\n  - ${SCENE}\\n---\\n'); await app.vault.createFolder(long + '/${SUB}'); await app.vault.create(long + '/${SCENE}.md', '---\\nlabel: Red\\n---\\none');
			const rtl = ${j(RTL)}; await app.vault.createFolder(rtl); await app.vault.create(rtl + '/' + rtl + '.md', '---\\nbinder: 1\\ncontents:\\n  - ${RSUB}/\\n  - ${RSUB}/הגעה\\n  - פתח דבר\\n---\\n'); await app.vault.createFolder(rtl + '/${RSUB}'); await app.vault.create(rtl + '/${RSUB}/הגעה.md', '---\\nlabel: Blue\\nsynopsis: מרה מגיעה לאי.\\n---\\nטקסט'); await app.vault.create(rtl + '/פתח דבר.md', 'טקסט');
		})().then(() => 1)`);
		t.ok(await until(p, `${B}.all().length === 54`, 15000), 'fifty-four binders are found');
		await showExplorer(p, [LONG, RTL, RTL + '/' + RSUB]);
		await shot(p, 'many-explorer');
		const tagged = await p.ev(`(() => { const v = app.workspace.getLeavesOfType('file-explorer')[0].view; return ${B}.all().map(b => b.folder.path).filter(path => !v.fileItems[path]?.selfEl.querySelector(':scope > .binders-folder-tag')); })()`);
		t.eq(j(tagged), '[]', 'every binder is tagged');
		// (the list only draws the rows near the screen: the long names are at its top, the right-to-left ones at its end)
		const measure = (paths) => p.ev(`${j(paths)}.map(path => { const R = ${R}; const e = [...document.querySelectorAll('.nav-files-container .tree-item-self')].find(x => x.dataset.path === path); if (!e) throw new Error('no row for ' + path); const inner = e.querySelector('.tree-item-inner'); return { row: R(e), inner: R(inner), cut: inner.scrollWidth - inner.clientWidth, ellipsis: getComputedStyle(inner).textOverflow, tag: R(e.querySelector(':scope > .nav-file-tag')), dot: R(e.querySelector(':scope > .binders-explorer-label')) }; })`);
		const rows = await measure([LONG, LONG + '/' + SUB, LONG + '/' + SCENE + '.md']);
		await p.ev(`(() => { const e = document.querySelector('.nav-files-container'); e.scrollTop = e.scrollHeight; return 1; })()`);
		await p.sleep(600);
		rows.push(...await measure([RTL, RTL + '/' + RSUB + '/הגעה.md']));
		for (const r of rows.slice(0, 3)) t.ok(r.cut > 0 && r.ellipsis === 'ellipsis', 'a long name is cut with an ellipsis: ' + j(r));
		for (const r of rows) {
			const end = r.tag ?? r.dot;
			if (end) t.ok(end[0] >= r.inner[0] + r.inner[2] + 2 && end[0] + end[2] <= r.row[0] + r.row[2], 'the tag or dot is after the name, inside the row: ' + j(r));
		}
		await shot(p, 'many-explorer-end');
		// the long one's view
		await open(p, LONG + '/' + SUB);
		await shot(p, 'long-view');
		const head = await p.ev(`(() => { const e = document.querySelector('${LEAF} .view-header-title'), a = document.querySelector('${LEAF} .view-actions').getBoundingClientRect(), r = e.getBoundingClientRect(); return { cut: e.scrollWidth - e.clientWidth, ellipsis: getComputedStyle(e).textOverflow, clear: r.right <= a.left }; })()`);
		t.ok(head.cut > 0 && head.ellipsis === 'ellipsis' && head.clear, 'the header’s title is cut with an ellipsis, clear of its buttons: ' + j(head));
		for (const [w, hh] of [PHONE, SMALL]) {
			await metrics(p, w, hh);
			await p.sleep(500);
			const bar = await toolbar(p);
			t.ok(bar.out <= 0 && bar.overlap.length === 0 && bar.kids.every((k) => k.r <= w), `${w} px: the toolbar fits with long names: ${j(bar.kids.map((k) => [k.cls, k.l, k.r]))}`);
		}
		await metrics(p, ...PHONE);
		await p.sleep(500);
		await open(p, RTL + '/' + RSUB);
		await shot(p, 'rtl-view');
		t.eq(await headerTitle(p), RSUB, 'a right-to-left name is the title');
		const bar = await toolbar(p);
		t.ok(bar.out <= 0 && bar.overlap.length === 0, 'and the toolbar fits');
		t.eq(await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-card-title'), r = document.createRange(); r.selectNodeContents(e); return getComputedStyle(e).direction + ' ' + (innerWidth - r.getBoundingClientRect().right < 60); })()`), 'rtl true', 'its card’s title is written from the card’s right edge');
	});
});

// =====================================================================================================================
// Light, dark, large text; the tablet
// =====================================================================================================================

test('phone explorer, light and dark, and with text at 22 px: the folder shown is marked with Obsidian’s own tint, dots keep their label’s color and sit in the middle of their rows with the tags, and nothing is cut', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`(async () => { for (const [n, l] of [['Prologue.md', 'Red'], ['Part One/Arrival.md', 'Blue'], ['Epilogue.md', '#7c3aed']]) await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L)} + n), fm => { fm.label = l; }); const f = await ${B}.ensureFolderNote(app.vault.getAbstractFileByPath(${j(L + 'Part One')})); await app.fileManager.processFrontMatter(f, fm => { fm.label = 'Green'; }); })().then(() => 1)`);
		await open(p, L + 'Part One');
		const look = () => p.ev(`[...document.querySelectorAll('.nav-files-container .tree-item-self')].filter(e => e.getBoundingClientRect().height > 0).map(e => { const R = ${R}; const s = getComputedStyle(e), tag = e.querySelector(':scope > .nav-file-tag'), dot = e.querySelector(':scope > .binders-explorer-label'), row = e.getBoundingClientRect(); const mid = (x) => x ? Math.round(x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2 - row.top - row.height / 2) : null; return { name: e.dataset.path.split('/').pop(), active: e.classList.contains('is-active'), bg: s.backgroundColor, dot: dot ? getComputedStyle(dot).backgroundColor : null, dotMid: mid(dot), dotEnd: dot ? Math.round(row.right - dot.getBoundingClientRect().right) : null, tagMid: mid(tag), tagEnd: tag ? Math.round(row.right - tag.getBoundingClientRect().right) : null, inner: e.querySelector('.tree-item-inner').scrollWidth - e.querySelector('.tree-item-inner').clientWidth }; })`);
		for (const theme of ['moonstone', 'obsidian']) {
			await p.ev(`(() => { app.changeTheme(${j(theme)}); return 1; })()`);
			await p.sleep(400);
			await showExplorer(p);
			await shot(p, 'look-explorer-' + theme);
			const rows = await look(), by = Object.fromEntries(rows.map((r) => [r.name, r]));
			t.eq(j(rows.filter((r) => r.active).map((r) => r.name)), j(['Part One']), theme + ': the folder shown is marked');
			const native = await p.ev(`(() => { const probe = document.querySelector('.nav-files-container').createDiv({ cls: 'tree-item-self nav-file-title is-active' }); const c = getComputedStyle(probe).backgroundColor; probe.remove(); return c; })()`);
			t.eq(by['Part One'].bg, native, theme + ': in the tint Obsidian gives the open note’s row');
			t.eq(j(rows.filter((r) => r.dot).map((r) => r.name)), j(['Prologue.md', 'Part One', 'Arrival.md', 'Epilogue.md']), theme + ': labeled notes and the labeled folder have dots');
			t.eq(by['Epilogue.md'].dot, 'rgb(124, 58, 237)', theme + ': a color of the note’s own is that color');
			t.ok(new Set(rows.filter((r) => r.dot).map((r) => r.dot)).size === 4, theme + ': each label its own color');
			t.ok(rows.every((r) => (r.dotMid == null || Math.abs(r.dotMid) <= 1) && (r.tagMid == null || Math.abs(r.tagMid) <= 1)), theme + ': dots and tags are in the middle of their rows');
			t.ok(new Set(rows.filter((r) => r.dot).map((r) => r.dotEnd)).size === 1, theme + ': the dots line up at the rows’ ends');
			await p.ev(`app.workspace.leftSplit.collapse()`);
			await p.sleep(500);
		}
		await p.ev(`(() => { app.changeTheme('moonstone'); app.vault.setConfig('baseFontSize', 22); app.updateFontSize?.(); return 1; })()`);
		await p.sleep(900);
		await showExplorer(p);
		await shot(p, 'look-explorer-large');
		const rows = await look();
		t.ok(rows.every((r) => (r.dotMid == null || Math.abs(r.dotMid) <= 1) && (r.tagMid == null || Math.abs(r.tagMid) <= 1) && r.inner <= 0), 'at 22 px: still centred, and no name cut: ' + j(rows.map((r) => [r.name, r.dotMid, r.tagMid, r.inner])));
		await p.ev(`app.workspace.leftSplit.collapse()`);
		await p.sleep(500);
		await openOneNote(p);
		await shot(p, 'look-compile-large');
		const d = await dialog(p);
		t.ok(fitsScreen(d) && await p.ev(`[...document.querySelectorAll('.modal .setting-item')].every(s => { const r = s.getBoundingClientRect(), b = document.querySelector('.modal').getBoundingClientRect(); return r.left >= b.left && r.right <= b.right; })`), 'at 22 px the Export window fits the screen, no setting wider than it');
		await closeDialog(p);
	});
});

test('tablet: the same binder in two tabs shows a change in both, the explorer marks the one in front, dialogs are centred boxes with their buttons in sight, settings rows are one line, and the header’s Back lights after going into a folder', async (p, h, t) => {
	await onDevice(p, TABLET, async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
		await open(p);
		const head = await p.at(card(L + 'Part One') + ' .binders-card-title');
		await tap(p, head.l + 20, head.y);
		await until(p, `${VIEW}.folder?.path === ${j(L + 'Part One')}`);
		await p.sleep(700);
		t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .view-header-nav-buttons button')].map(b => b.ariaLabel + ':' + b.ariaDisabled)`)), j(['Navigate back:false', 'Navigate forward:true']), 'in a folder, the header’s Back is lit');
		await p.ev(`${PL}.openBinder(app.vault.getAbstractFileByPath('The Lighthouse'), 'tab').then(() => 1)`);
		await p.sleep(900);
		await setMode(p, 'outliner');
		await shot(p, 'tablet-two-tabs');
		t.eq(j(await tabs(p)), j([`binders-view:${L}Part One:corkboard`, 'binders-view:The Lighthouse:outliner']), 'the binder in two tabs, each with its folder and mode');
		t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-split.mod-root .workspace-tab-header')].map(e => e.getAttribute('aria-label'))`)), j(['Part One', 'The Lighthouse']), 'named for what they show');
		await showExplorer(p, ['The Lighthouse']);
		await shot(p, 'tablet-explorer');
		t.eq(j((await explorerRows(p)).filter((x) => x.active).map((x) => x.path)), j(['The Lighthouse']), 'the explorer marks the folder of the tab in front');
		await p.ev(`app.workspace.leftSplit.collapse()`);
		await p.ev(`${B}.moveDown(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})).then(() => 1)`);
		await p.sleep(900);
		const shown = await p.ev(`[...document.querySelectorAll('.workspace-split.mod-root .workspace-leaf')].map(l => [...l.querySelectorAll('.binders-card[data-path], .binders-outliner-row[data-path]')].map(c => c.dataset.path.split('/').pop()).filter(x => /Arrival|keeper/.test(x)).join())`);
		t.eq(j(shown), j(['The keeper.md,Arrival.md', 'The keeper.md,Arrival.md']), 'a move shows in both tabs');
		await openOneNote(p);
		await shot(p, 'tablet-compile');
		let d = await dialog(p);
		// (the Export window is Obsidian's two-pane dialog, wider than the small Compile box was: still a box, in the middle, both panes in it)
		const made = await exportButtons(p), panes = await p.ev(`!!document.querySelector('.modal.binders-export .binders-export-side') && !!document.querySelector('.modal.binders-export .binders-export-pane')`);
		t.ok(fitsScreen(d) && d.box[2] < TABLET[0] && Math.abs(d.box[0] - (TABLET[0] - d.box[0] - d.box[2])) <= 2 && d.scrolls <= 0 && panes && j(made.map((b) => b.text)) === j(['Copy', 'Export']) && made.every((b) => b.rect[1] >= d.box[1] && b.rect[1] + b.rect[3] <= d.box[1] + d.box[3]), 'Export is a box in the middle, whole, its two panes side by side and its buttons in sight: ' + j([d.box, made]));
		await p.key('Escape');
		await p.sleep(500);
		await p.ev(`app.commands.executeCommandById('binders:set-target')`);
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.sleep(500);
		d = await dialog(p);
		t.ok(fitsScreen(d) && d.focus.startsWith('INPUT'), '“Set target” too, its field focused');
		await closeDialog(p);
		await openSettings(p);
		await shot(p, 'tablet-settings');
		const rows = await p.ev(`[...${TAB}.querySelectorAll('.binders-settings-label, .binders-settings-status')].map(s => Math.round(s.getBoundingClientRect().height))`);
		t.ok(rows.length === 12 && rows.every((x) => x <= 64), 'in the settings every label and status is one row: ' + j(rows));
		t.ok(await p.ev(`[...${TAB}.querySelectorAll('.binders-settings-label select:not(.is-measuring)')].every(s => s.getBoundingClientRect().width + 1 >= parseFloat(s.style.getPropertyValue('--dropdown-fitted-width')))`), 'and the color menus show their names whole');
	});
});

bug('tablet: with a binder in two tabs, a tap on one of its folders in the explorer opens it in the tab in front (it goes to whichever of the two tabs comes first, and brings that one forward)', async (p, h, t) => {
	await onDevice(p, TABLET, async () => {
		await open(p, L + 'Part One');
		await p.ev(`${PL}.openBinder(app.vault.getAbstractFileByPath('The Lighthouse'), 'tab').then(() => 1)`);
		await p.sleep(900);
		await setMode(p, 'outliner');
		const before = await tabs(p);
		await showExplorer(p, ['The Lighthouse']);
		const r = await p.at(explorerRow(L + 'Part Two'));
		await tap(p, r.x, r.y);
		await until(p, `app.workspace.getLeavesOfType('binders-view').some(l => l.getViewState().state.folder === ${j(L + 'Part Two')})`);
		await p.sleep(800);
		await shot(p, 'bug-two-tabs-tap');
		t.eq(j(before), j([`binders-view:${L}Part One:corkboard`, 'binders-view:The Lighthouse:outliner']), 'two tabs, the second (the binder, as an outliner) in front');
		t.eq(j(await tabs(p)), j([`binders-view:${L}Part One:corkboard`, `binders-view:${L}Part Two:outliner`]), 'the tap goes to the tab in front, which keeps its mode; the other tab stays on its folder');
	});
});

// =====================================================================================================================
// QA round 6: what the fixes to the above left undone
// =====================================================================================================================
const bug6 = (name, fn) => specs.push({ name: 'BUG: qa6: nav: ' + name, fn });

bug6('phone: “Show in binder” and “Open binder” on a binder’s last note show its row when the binder was last left as an outliner (the row is selected but the rows aren’t scrolled: it’s below the screen, 836–914 px of 844; the corkboard looks again once it has settled, the outliner asks once, before it’s laid out)', async (p, h, t) => {
	const seen = {};
	await onDevice(p, PHONE, async () => {
		await open(p);
		await setMode(p, 'outliner');
		for (const [what, run] of [['Show in binder', async () => { const more = await p.at(MORE); await tap(p, more.x, more.y); await p.sleep(500); await menuTap(p, 'Show in binder'); }], ['Open binder', async () => { await p.ev(`app.commands.executeCommandById('binders:open-binder')`); }]]) {
			await p.ev(`(() => { const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach()); return 1; })()`);
			await h.open(L + 'Epilogue.md');
			await p.sleep(600);
			await run();
			await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view' && !!document.querySelector('.binders-view .binders-outliner-row.is-selected')`);
			await p.sleep(1500);
			await shot(p, 'qa6-reveal-outliner-' + what.replace(/ /g, '-'));
			seen[what] = await p.ev(`(() => { const r = document.querySelector('.binders-view .binders-outliner-row.is-selected')?.getBoundingClientRect(), o = document.querySelector('.binders-view .binders-outliner'); return r ? { path: document.querySelector('.binders-view .binders-outliner-row.is-selected').dataset.path, top: Math.round(r.top), bottom: Math.round(r.bottom), navbar: Math.round(document.querySelector('.mobile-navbar').getBoundingClientRect().top), screen: innerHeight, scrolled: o.scrollTop, room: o.scrollHeight - o.clientHeight } : null; })()`);
		}
		await setMode(p, 'corkboard');
	});
	for (const [what, s] of Object.entries(seen)) {
		t.eq(s?.path, L + 'Epilogue.md', `${what}: the note’s row is selected`);
		t.ok(s.bottom <= s.navbar, `${what}: the selected row ends (${s.bottom}) above the navigation bar (${s.navbar}; the screen ends at ${s.screen}; the rows are scrolled ${s.scrolled} of ${s.room} px)`);
	}
});

bug6('phone: “New binder” from the command palette shows the binder it made, its name ready to type (with the drawer closed, as it is whenever the palette is in use, “Untitled binder” is made and nothing shows: no drawer, no name to type, no view, no notice)', async (p, h, t) => {
	const f = {};
	await onDevice(p, PHONE, async () => {
		const list = await palette(p, 'New binder');
		const hit = await p.ev(`(() => { const e = [...document.querySelectorAll('.prompt .suggestion-item')].find(e => /New binder/.test(e.textContent)); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
		f.offered = list.some((x) => /New binder/.test(x));
		if (hit) await tap(p, hit.x, hit.y); else await closePalette(p);
		await until(p, `!!app.vault.getAbstractFileByPath('Untitled binder')`, 4000);
		await p.sleep(2000);
		await shot(p, 'qa6-new-binder-from-palette');
		f.made = await has(p, 'Untitled binder');
		f.focus = await focusInfo(p);
		f.drawer = await drawerOpen(p);
		f.type = await activeType(p);
		f.notices = await notices(p);
		await p.key('Escape');
		await p.sleep(300);
	});
	t.ok(f.offered && f.made, 'the command is offered with nothing open, and makes a binder');
	t.ok((f.focus.editable && f.focus.text === 'Untitled binder') || f.type === 'binders-view' || f.notices.some((n) => /binder/i.test(n)), `and something shows it: its name ready to type in the file explorer, its view, or a word about it (the drawer is ${f.drawer ? 'open' : 'closed'}, the focus on ${f.focus.tag}, the tab shows “${f.type}”, notices: ${j(f.notices)})`);
});
