// QA round 5: journeys on a phone and a tablet, by touch, across the seams between the plugin's parts: a novel from
// nothing (390 × 844 and 320 × 568), the same on a tablet (820 × 1180 and on its side) with panes, tabs and a hardware
// keyboard, interruptions in the middle of every kind of edit, a Longform project, and a binder of 1,000 notes.
// Obsidian's mobile mode (app.emulateMobile) with real touches over CDP, as in specs-qa4-mobile.mjs (whose header says
// what the emulation can't do: a long press sends no `contextmenu`, the keyboard is only a shorter viewport).
// "qa5 journey: …" pass; "BUG: …" are confirmed bugs (they fail now and pass once fixed); "UX: …" are wished behaviour.
//   QA5_SHOTS=<dir> saves screenshots of every step there.
//
// Since 2026-10-01 the corkboard shows one folder at a time: a subfolder is one card, a stack, gone into by a tap on its
// name and left by the way up in the toolbar. What these journeys did among a chapter's cards is done on that chapter's
// board (`intoStack`, `upOut`), a card goes into a chapter by being dropped on its stack, and what was a heading's menu
// is the stack's.
import { mkdirSync } from 'fs';
import { B, PL, VIEW, card, closeMenus, contents, flush, j, menuItems, openView, read, reload, split, texts, tidy, until, viewState } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa5 journey: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa5 journey: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa5 journey: ' + name, fn });

const L = 'The Lighthouse/';
const LEAF = '.workspace-leaf.mod-active';
const PHONE = [390, 844], SMALL = [320, 568], TABLET = [820, 1180], TABLET_WIDE = [1180, 820];
const KEYBOARD = 336, KEYBOARD_SMALL = 260;
const SHOTS = process.env.QA5_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const log = (...a) => console.log('    ·', ...a);

// ---- touch ----
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const hold = async (p, x, y, ms = 700) => { await touch(p, 'touchStart', x, y); await p.sleep(ms); await touch(p, 'touchEnd'); await p.sleep(550); };
const swipe = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(500); };
const pressAndMove = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); await p.sleep(620); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(20); } await p.sleep(200); };

// ---- the device ----
const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
/** Runs fn in Obsidian's mobile mode at this size, with touch; then puts the desktop back whatever happened. Errors
    logged while on the device fail the test. */
async function onDevice(p, [width, height], fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	await metrics(p, width, height);
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await theme();
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	await p.sleep(200);
	let logged = [];
	try { await fn(); logged = p.errors.filter((e) => !NOISE.test(e)); } finally {
		await touch(p, 'touchCancel').catch(() => {});
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		await p.send('Emulation.setEmulatedMedia', { features: [] });
		await gone(p).catch(() => {});
		for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(300); }
		await p.ev(`(async () => { try { app.setting.close(); } catch {} try { app.workspace.leftSplit.setPinned?.(false); } catch {} app.vault.setConfig('trashOption', 'system');
			for (const f of app.vault.getFiles()) if (f.extension !== 'md' || / \\(exported\\)\\.md$/.test(f.path)) await app.vault.delete(f);
			if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true);
			const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach());
			if ((app.vault.getConfig('baseFontSize') ?? 16) !== 16) { app.vault.setConfig('baseFontSize', 16); app.updateFontSize?.(); } })().then(() => 1)`).catch(() => {});
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
const orow = (path) => `${LEAF} .binders-outliner-row[data-path="${path}"]`;
const ocell = (path, col) => `${orow(path)} .binders-outliner-cell[data-col="${col}"]`;
const scene = (name) => `[...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === ${j(name)})`;
const CORK = `document.querySelector('${LEAF} .binders-corkboard')`;
const OUT = `document.querySelector('${LEAF} .binders-outliner')`;
const MAN = `document.querySelector('${LEAF} .binders-manuscript')`;
async function open(p, folder = 'The Lighthouse') {
	await openView(p, folder);
	await until(p, `/\\d/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '') || innerWidth < 340`, 5000);
	await p.sleep(500);
}
const setMode = async (p, m) => { await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`); await p.sleep(m === 'manuscript' ? 1500 : 500); };
const selected = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-selected, ${LEAF} .binders-outliner-row.is-selected')].map(c => c.dataset.path)`);
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? null)`).then(JSON.parse);
const body = async (p, path) => split(await read(p, path)).body;
const exists = (p, path) => p.ev(`!!app.vault.getAbstractFileByPath(${j(path)})`);
const navbarTop = (p) => p.ev(`(() => { const b = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return b && b.height ? Math.round(b.top) : null; })()`);
const cardsIn = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path)`);
const rowsIn = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-row')].map(r => r.dataset.path)`);
const sectionsIn = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-scene .binders-manuscript-title')].map(e => e.textContent)`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).filter(Boolean).join(' | '); })()`);
const clearNotices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const focusIs = (p) => p.ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; return a.tagName.toLowerCase() + (typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + (a.dataset?.path ? '[' + a.dataset.path + ']' : ''); })()`);
/** The binder note's list on disk, once anything pending is written. */
const list = async (p, note) => { await flush(p); await p.sleep(150); return contents(p, note); };
/** The notes a list names, as base names in order (folders left out). */
const names = (l) => l.filter((x) => !x.endsWith('/')).map((x) => x.split('/').pop());

// ---- touching things ----
/** Scrolls the first element matching `sel` to the middle of its scroller and returns where it is. */
async function see(p, sel, i = 0) {
	await p.ev(`(() => { document.querySelectorAll(${j(sel)})[${i}]?.scrollIntoView({ block: 'center', inline: 'nearest' }); return 1; })()`);
	await p.sleep(250);
	return p.at(sel, i);
}
async function tapEl(p, sel, i = 0) {
	const at = await see(p, sel, i);
	if (!at) throw new Error('nothing to tap: ' + sel);
	await tap(p, at.x, at.y);
	return at;
}
const sheet = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), bottom: Math.round(r.bottom), inner: [innerWidth, innerHeight] }; })()`);
const isSheet = (s) => !!s && s.left === 0 && s.width === s.inner[0] && s.bottom === s.inner[1];
async function menuTap(p, title) {
	const find = `[...document.querySelectorAll('.menu .menu-item')].filter(e => (e.querySelector('.menu-item-title')?.textContent ?? '') === ${j(title)}).pop()`;
	if (!(await p.ev(`(() => { const it = ${find}; if (!it) return false; it.scrollIntoView({ block: 'center' }); return true; })()`))) return false;
	await p.sleep(250);
	const at = await p.ev(`(() => { const r = (${find}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await tap(p, at.x, at.y);
	return true;
}
/** Taps one menu item after another (a submenu's parent, then its item). Throws with what the menu had if one's missing. */
async function pick(p, ...titles) {
	for (const t of titles) { if (!(await menuTap(p, t))) throw new Error(`no “${t}” in the menu: ${j(await menuItems(p))}`); await p.sleep(300); }
	await p.sleep(300);
}
async function gone(p) {
	await closeMenus(p);
	await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`);
	await p.sleep(250);
}
const menus = (p) => p.ev(`document.querySelectorAll('.menu').length`);
const dialogs = (p) => p.ev(`document.querySelectorAll('.modal-container').length`);
const dialogTitle = (p) => p.ev(`[...document.querySelectorAll('.modal .modal-title')].pop()?.textContent ?? null`);
const dialogTap = async (p, text) => {
	await p.sleep(400); // (a dialog slides in on a phone: where its buttons are a moment after it opens isn't where they end up)
	const at = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); const b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`no “${text}” button in the dialog`);
	await p.sleep(150);
	await tap(p, at.x, at.y);
	await p.sleep(400);
};
/** Holds a card (by its foot, clear of its title and synopsis) until its menu shows. */
async function cardMenu(p, path) {
	const c = await see(p, card(path));
	if (!c) throw new Error('no card for ' + path);
	await hold(p, c.x, c.t + c.h - 14);
	if (!(await menus(p))) throw new Error('no menu after holding the card of ' + path);
}
/** Holds an outliner row (by its name) until its menu shows. */
async function rowMenu(p, path) {
	const c = await see(p, orow(path) + ' .binders-outliner-name');
	if (!c) throw new Error('no row for ' + path);
	await hold(p, c.x, c.y);
	if (!(await menus(p))) throw new Error('no menu after holding the row of ' + path);
}
/** The menu a long press on a manuscript title asks for on a device (the emulation sends no contextmenu). */
async function titleMenu(p, name) {
	await p.ev(`(() => { const e = (${scene(name)}).querySelector('.binders-manuscript-title'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10, button: 0 })); return 1; })()`);
	await p.sleep(500);
}
/** The mode, switched as a writer does on a touch screen: the button, then the menu. */
async function modeByTouch(p, name) {
	await tapEl(p, `${LEAF} .binders-mode-button`);
	await pick(p, name);
	await until(p, `!!document.querySelector('${LEAF} .binders-mode-${name.toLowerCase()}')`);
	await p.sleep(name === 'Manuscript' ? 1500 : 500);
}

// ---- the file explorer ----
const drawerOpen = (p) => p.ev(`!app.workspace.leftSplit.collapsed`);
const explorerRow = (path) => `.nav-files-container .tree-item-self[data-path="${path}"]`;
const showExplorer = async (p, folders = []) => {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); const v = l.view; for (const f of ${j(folders)}) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(900);
};
const explorerMenu = async (p, path) => {
	await p.ev(`(() => { const e = document.querySelector(${j(explorerRow(path))}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2, button: 0 })); return 1; })()`);
	await p.sleep(500);
};
/** What the explorer lists in a folder, in its order (asked of the view: only the rows in sight are in the page). */
const explorerOrder = (p, folder) => p.ev(`(() => { const v = app.workspace.getLeavesOfType('file-explorer')[0].view, f = app.vault.getAbstractFileByPath(${j(folder)}); return v.getSortedFolderItems(f).map(i => i.file.path).filter(x => !${B}.isHiddenNote(app.vault.getAbstractFileByPath(x)) || !${PL}.settings.hideNotes); })()`);

// ---- a novel, made quickly (for the journeys that start in the middle) ----
const NAMES = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
const N = 'Novel/', NNOTE = 'Novel/Novel.md';
const TEXT = (n) => `${n} begins here. The tide was out and the sand ran grey to the rocks.\n\nA second paragraph of ${n}, so there is somewhere to split.\n`;
/** A binder "Novel" of twenty scenes, flat or in three chapters, as the first journey leaves it. */
async function novel(p, { chapters = false, bare = false } = {}) {
	await p.ev(`(async () => {
		const names = ${j(NAMES)}, chapters = ${j(chapters)};
		await app.vault.createFolder('Novel');
		const list = [];
		if (chapters) for (const c of ['Chapter 1', 'Chapter 2', 'Chapter 3']) await app.vault.createFolder('Novel/' + c);
		for (let i = 0; i < names.length; i++) {
			const dir = chapters && i < 18 ? 'Chapter ' + (1 + Math.floor(i / 6)) + '/' : '';
			if (dir && i % 6 === 0) list.push(dir);
			const n = names[i];
			await app.vault.create('Novel/' + dir + n + '.md', (${j(bare)} ? '' : '---\\nsynopsis: What happens in ' + n.toLowerCase() + '.\\nstatus: ' + (i % 2 ? 'Draft' : 'Idea') + '\\n---\\n') + ${j(TEXT('@@'))}.replaceAll('@@', n));
			list.push(dir + n);
		}
		await app.vault.create('Novel/Novel.md', '---\\nbinder: 1\\ncontents:\\n' + list.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Novel') ?? app.vault.getRoot())?.length === 20 && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Novel/')).every(f => app.metadataCache.getFileCache(f))`, 20000);
}
/** What the three modes show, as base names in order, switching through them and back to the one it was on. */
async function threeModes(p) {
	const was = (await viewState(p)).mode, out = {};
	for (const m of ['corkboard', 'outliner', 'manuscript']) {
		await setMode(p, m);
		// (the board of the folder shown: its own notes, and each folder in it as one stack, with the count it says)
		if (m === 'corkboard') out[m] = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.classList.contains('is-stack') ? c.dataset.path.split('/').pop() + '/ ' + parseInt(c.querySelector('.binders-card-words')?.textContent ?? '') : c.dataset.path.split('/').pop().replace(/\.md$/, ''))`);
		if (m === 'outliner') out[m] = (await rowsIn(p)).filter((x) => x.endsWith('.md')).map((x) => x.split('/').pop().replace(/\.md$/, ''));
		if (m === 'manuscript') out[m] = await sectionsIn(p);
	}
	await setMode(p, was);
	return out;
}
/** Checks the binder note on disk, and the three modes, all name these notes in this order. */
async function agree(p, t, note, want, what) {
	const all = await list(p, note), disk = names(all);
	t.eq(j(disk), j(want), `${what}: the binder note’s order`);
	const m = await threeModes(p);
	for (const k of ['outliner', 'manuscript']) t.eq(j(m[k]), j(want), `${what}: the ${k} shows the same order`);
	// (the corkboard: the binder's own items in that order, a folder as one stack that counts the notes listed in it)
	const own = all.filter((x) => (x.endsWith('/') ? x.split('/').length === 2 : !x.includes('/'))).map((x) => (x.endsWith('/') ? `${x} ${all.filter((y) => y.startsWith(x) && !y.endsWith('/')).length}` : x));
	t.eq(j(m.corkboard), j(own), `${what}: the corkboard shows the binder’s own notes and a stack for each folder, in the same order`);
}
/** Into a folder from the board it's a stack on, by touch: a tap on the stack's name. */
async function intoStack(p, folder) {
	if (!(await p.ev(`!!document.querySelector(${j(card(folder))})`))) throw new Error(`no stack for ${folder} on the board of ${(await viewState(p))?.folder} (${(await viewState(p))?.mode}): ${j(await cardsIn(p))}`);
	await tapEl(p, card(folder) + ' .binders-card-title');
	await until(p, `${VIEW}?.folder?.path === ${j(folder)} && !document.querySelector(${j(card(folder))})`, 4000);
	await p.sleep(500);
}
/** And back out, by the way up in the toolbar (on a phone an arrow and the name of the folder above; else the breadcrumb). */
async function upOut(p) {
	// (the arrow first: on a narrow phone the name beside it gives way to the word count)
	const at = await p.at(`${LEAF} .binders-crumb-up[data-path]`) ?? await p.at(`${LEAF} .binders-crumb[role="link"]`);
	if (!at) throw new Error('no way up in the toolbar');
	const was = (await viewState(p)).folder;
	await tap(p, at.x, at.y);
	await until(p, `${VIEW}?.folder?.path !== ${j(was)}`, 4000);
	await p.sleep(500);
}

/** Checks that carry on after a failure, so one run of a journey says everything that's wrong with it. */
function softly(t) {
	const bad = [];
	const S = {
		ok: (c, m) => { if (!c) { bad.push(m); log('✗', String(m).slice(0, 400)); } return !!c; },
		eq: (a, b, m) => S.ok(a === b, `${m}: expected ${j(b)}, got ${j(a)}`),
		done: () => { if (bad.length) t.ok(false, `${bad.length} wrong: ` + bad.map((m) => String(m).slice(0, 300)).join(' ¶ ')); },
	};
	return S;
}
/** The on-screen keyboard: the page is that much shorter while it's up. */
const keyboard = async (p, [w, h], up) => { await metrics(p, w, h - (up ? (h < 700 ? KEYBOARD_SMALL : KEYBOARD) : 0)); await p.sleep(450); };
/** Is the thing with the focus (the field being typed in) in sight: inside the window and above the navigation bar? */
const fieldInSight = (p) => p.ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return { none: true }; const r = a.getBoundingClientRect(); const nav = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); const bottom = Math.min(innerHeight, nav && nav.height ? nav.top : innerHeight); return { top: Math.round(r.top), bottom: Math.round(r.bottom), limit: Math.round(bottom), ok: r.top >= 0 && r.bottom <= bottom + 1 }; })()`);
/** Drags a card by touch to just after (or before) another card, or 'into' a folder (onto the middle of its stack), both
    scrolled into sight first. */
async function dragCard(p, from, to, where = 'after') {
	await p.ev(`(() => { document.querySelector(${j(card(to))})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	await p.sleep(300);
	let a = await p.at(card(from));
	const view = await rect(p, `${LEAF} .binders-corkboard`);
	// (on a small phone both don't fit the board with one in its middle: then the card's foot, where it's held, is brought
	// just inside the board's top or bottom edge, whichever leaves the other in sight)
	const nav = (await navbarTop(p)) ?? view[1] + view[3], low = Math.min(view[1] + view[3], nav) - 60;
	if (!a || a.t + a.h - 14 > low || a.t + a.h - 14 < view[1] + 10) {
		await p.ev(`(() => { const s = ${CORK}, c = document.querySelector(${j(card(from))}), t = document.querySelector(${j(card(to))}); if (!c || !t) return 0; const foot = c.getBoundingClientRect().bottom - 14; s.scrollTop += t.getBoundingClientRect().top > c.getBoundingClientRect().top ? foot - (${view[1]} + 16) : foot - ${low}; return 1; })()`);
		await p.sleep(300);
		a = await p.at(card(from));
	}
	const b = await p.at(card(to));
	if (!a || !b) throw new Error(`no card to drag: ${from} → ${to}`);
	await pressAndMove(p, a.x, a.t + a.h - 14, b.x, where === 'into' ? b.y : where === 'after' ? b.t + b.h - 5 : b.t + 5, 14);
	const mid = await p.ev(`({ ghost: document.querySelectorAll('.binders-drag-ghost').length, line: !!document.querySelector('.binders-drop-indicator.is-active'), over: document.querySelector('${LEAF} .is-being-dragged-over')?.dataset.path ?? null })`);
	await touch(p, 'touchEnd');
	await p.sleep(900);
	return mid;
}
/** Runs a command from the real command palette, by typing its name and tapping it. */
async function palette(p, name) {
	await p.ev(`app.commands.executeCommandById('command-palette:open')`);
	await until(p, `!!document.querySelector('.prompt input')`);
	await p.type(name);
	await p.sleep(500);
	const first = await p.at('.prompt .suggestion-item');
	const text = await p.ev(`document.querySelector('.prompt .suggestion-item')?.textContent ?? ''`);
	if (!first || !text.includes(name)) { await p.key('Escape'); await p.sleep(300); return false; }
	await tap(p, first.x, first.y);
	await p.sleep(600);
	return true;
}

// =====================================================================================================================
// 1. A novel from nothing, on a phone
// =====================================================================================================================

for (const [dev, size] of [['phone (390 × 844)', PHONE], ['small phone (320 × 568)', SMALL]]) {
	const tag = size[0];

	test(`${dev} 1a. a novel from nothing: “New binder” in the explorer’s empty space, named there, opened by a tap; twenty scenes from the tile, the toolbar’s New in each mode, each named as it’s made`, async (p, h, t) => {
		const S = softly(t);
		await onDevice(p, size, async () => {
			await showExplorer(p);
			await p.ev(`(() => { const c = document.querySelector('.nav-files-container'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 100, clientY: r.bottom - 60, button: 0 })); return 1; })()`);
			await p.sleep(500);
			S.ok((await menuItems(p)).includes('New binder'), '“New binder” is in the menu of the explorer’s empty space: ' + j(await menuItems(p)));
			S.ok(isSheet(await sheet(p)), 'which is a sheet');
			await shot(p, `${tag}-1a-01-empty-menu`);
			await pick(p, 'New binder');
			await until(p, `document.activeElement?.classList.contains('nav-folder-title-content')`, 3000);
			await shot(p, `${tag}-1a-02-naming`);
			S.eq(await p.ev(`getSelection().toString()`), 'Untitled binder', 'the new binder’s name is selected, ready to type over');
			S.ok(await drawerOpen(p), 'with the drawer still open');
			S.ok((await fieldInSight(p)).ok, 'and the name in sight: ' + j(await fieldInSight(p)));
			await p.type('Novel');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel')`, 4000);
			await p.sleep(900);
			await shot(p, `${tag}-1a-03-named`);
			S.ok(await exists(p, 'Novel'), 'the folder has the name typed');
			S.ok(await p.ev(`!!${B}.binderOf(app.vault.getAbstractFileByPath('Novel'))`), 'it is a binder');
			// (its binder note keeps the name “Untitled binder”: see the BUG test below)
			const NNOTE = await p.ev(`${B}.binderOf(app.vault.getAbstractFileByPath('Novel')).note.path`);
			// a tap on it opens it
			await tapEl(p, explorerRow('Novel'));
			await until(p, `${VIEW}?.folder?.path === 'Novel'`, 4000);
			await p.sleep(600);
			await shot(p, `${tag}-1a-04-opened`);
			S.eq((await viewState(p))?.folder, 'Novel', 'a tap on the new binder opens it');
			S.ok(!(await drawerOpen(p)), 'and closes the drawer');
			S.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-empty')`), 'an empty binder says so');
			S.eq(await p.ev(`document.querySelector('${LEAF} .binders-empty-title')?.textContent`), 'No notes in this folder yet', 'in these words');
			// eight scenes from the tile, Enter after each
			await tapEl(p, `${LEAF} .binders-card-new`);
			S.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'a tap on “New note” opens its field');
			await keyboard(p, size, true);
			for (const n of NAMES.slice(0, 8)) {
				S.eq(await p.ev(`document.activeElement.tagName + '.' + document.activeElement.className`), 'INPUT.binders-edit-field', `the field for “${n}” has the keyboard`);
				await p.type(n);
				await p.key('Enter');
				await until(p, `!!app.vault.getAbstractFileByPath(${j(N + n + '.md')})`, 3000);
				await p.sleep(350);
			}
			await shot(p, `${tag}-1a-05-tile-keyboard-up`);
			await keyboard(p, size, false);
			// a tap on the board ends it (no “Untitled” left behind)
			const board = await rect(p, `${LEAF} .binders-corkboard`);
			await tap(p, board[0] + board[2] - 6, board[1] + 4);
			await p.sleep(400);
			S.eq(j(names(await list(p, NNOTE))), j(NAMES.slice(0, 8)), 'eight notes, in the order they were typed');
			S.eq(await p.ev(`app.vault.getMarkdownFiles().filter(f => /Untitled(?! binder)/.test(f.path)).length`), 0, 'and no “Untitled” left behind');
			// four more from the toolbar's New
			await tapEl(p, `${LEAF} .binders-new-button`);
			S.eq(j(await menuItems(p)), j(['New note', 'New folder']), 'the toolbar’s New, on the corkboard');
			await pick(p, 'New note');
			S.eq(await p.ev(`document.activeElement.tagName + '.' + document.activeElement.className`), 'INPUT.binders-edit-field', 'New → New note opens the tile’s field');
			for (const n of NAMES.slice(8, 12)) { await p.type(n); await p.key('Enter'); await until(p, `!!app.vault.getAbstractFileByPath(${j(N + n + '.md')})`, 3000); await p.sleep(350); }
			await p.key('Escape');
			await p.sleep(400);
			S.eq(j(names(await list(p, NNOTE))), j(NAMES.slice(0, 12)), 'twelve notes');
			// four in the outliner
			await modeByTouch(p, 'Outliner');
			await shot(p, `${tag}-1a-06-outliner`);
			for (const n of NAMES.slice(12, 16)) {
				await tapEl(p, `${LEAF} .binders-new-button`);
				await pick(p, 'New note');
				await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
				const f = await p.ev(`({ tag: document.activeElement.tagName, value: document.activeElement.value ?? null, sel: document.activeElement.selectionEnd - document.activeElement.selectionStart })`);
				S.ok(f.tag === 'INPUT' && f.value === 'Untitled' && f.sel === 8, `outliner, New note: the new row’s name is selected to type over (${j(f)})`);
				await p.type(n);
				await p.key('Enter');
				await until(p, `!!app.vault.getAbstractFileByPath(${j(N + n + '.md')})`, 3000);
				await p.sleep(400);
			}
			S.eq(j(names(await list(p, NNOTE))), j(NAMES.slice(0, 16)), 'sixteen notes, the outliner’s after the others');
			// four in the manuscript
			await modeByTouch(p, 'Manuscript');
			for (const n of NAMES.slice(16, 20)) {
				await tapEl(p, `${LEAF} .binders-new-button`);
				S.eq(j(await menuItems(p)), j(['New note']), 'the toolbar’s New, in the manuscript');
				await pick(p, 'New note');
				await until(p, `document.activeElement?.classList.contains('is-renaming')`, 3000);
				const f = await p.ev(`({ renaming: document.activeElement.classList.contains('is-renaming'), sel: getSelection().toString() })`);
				S.ok(f.renaming && f.sel === 'Untitled', `manuscript, New note: the new section’s title is selected to type over (${j(f)})`);
				await p.type(n);
				await p.key('Enter');
				await until(p, `!!app.vault.getAbstractFileByPath(${j(N + n + '.md')})`, 3000);
				await p.sleep(500);
				// (Enter puts the caret in the new section's text: leave it, as a tap on the toolbar does)
				await p.ev(`document.activeElement?.blur?.()`);
			}
			await shot(p, `${tag}-1a-09-manuscript-twenty`);
			await agree(p, S, NNOTE, NAMES, 'twenty notes');
			S.eq(await p.ev(`app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Novel/')).length`), 21, 'twenty notes and the binder note in the folder');
			// the explorer shows the same order
			await showExplorer(p, ['Novel']);
			await shot(p, `${tag}-1a-10-explorer`);
			S.eq(j((await explorerOrder(p, 'Novel')).map((x) => x.split('/').pop().replace(/\.md$/, ''))), j(NAMES), 'the file explorer lists them in the same order, without the binder note');
		});
		S.done();
	});
}


const CHAPTERS = ['Chapter 1/', ...NAMES.slice(0, 6).map((n) => 'Chapter 1/' + n), 'Chapter 2/', ...NAMES.slice(6, 12).map((n) => 'Chapter 2/' + n), 'Chapter 3/', ...NAMES.slice(12, 18).map((n) => 'Chapter 3/' + n), 'Nineteen', 'Twenty'];
/** A chapter's menu on the corkboard: its stack held, on the board of the folder it's in. */
const stackMenu = (p, path) => cardMenu(p, path);
const stackCount = (p, path) => p.ev(`document.querySelector(${j(card(path))} + ' .binders-card-words')?.textContent ?? null`);
/** Drags an outliner row by touch: onto another row's middle ('into'), or to its lower edge ('after') or upper ('before'). */
async function dragRow(p, from, to, where = 'after') {
	await p.ev(`(() => { document.querySelector(${j(orow(to))})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	await p.sleep(300);
	let a = await p.at(orow(from) + ' .binders-outliner-main');
	// (on a small phone the row to drag may be under the header that stays at the top: it's brought just below it)
	const head = await rect(p, `${LEAF} .binders-outliner-head`);
	if (a && head && a.t < head[1] + head[3] + 4) {
		await p.ev(`(() => { const s = ${OUT}; s.scrollTop -= ${head[1] + head[3] + 8} - document.querySelector(${j(orow(from))}).getBoundingClientRect().top; return 1; })()`);
		await p.sleep(300);
		a = await p.at(orow(from) + ' .binders-outliner-main');
	}
	const b = await p.at(orow(to));
	if (!a || !b) throw new Error(`no row to drag: ${from} → ${to}`);
	await pressAndMove(p, a.x, a.y, a.x, where === 'into' ? b.y : where === 'after' ? b.t + b.h - 3 : b.t + 3, 14);
	const mid = await p.ev(`({ ghost: document.querySelectorAll('.drag-ghost').length, hint: document.querySelector('.drag-ghost-action')?.textContent ?? null })`);
	await touch(p, 'touchEnd');
	await p.sleep(900);
	return mid;
}
const backdropTap = async (p) => { const s = await sheet(p); if (s) await tap(p, s.inner[0] / 2, Math.max(8, s.top - 60)); await p.sleep(400); };

for (const [dev, size] of [['phone (390 × 844)', PHONE], ['small phone (320 × 568)', SMALL]]) {
	const tag = size[0];

	test(`${dev} 1b. the novel’s cards filled in: synopses typed on cards and rows, statuses, labels and a custom colour from each mode’s menu; three chapters made with “Put in a new folder”, named in place, filled by dragging cards and rows; targets for the binder, a chapter and a scene`, async (p, h, t) => {
		const S = softly(t);
		await novel(p, { bare: true });
		const before = await texts(p);
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			// --- synopses ---
			const one = await see(p, card(N + 'One.md'));
			await tap(p, one.x, one.t + one.h - 14);
			S.eq(j(await selected(p)), j([N + 'One.md']), 'a tap selects the card');
			await tapEl(p, card(N + 'One.md') + ' .binders-card-synopsis');
			S.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', 'a tap on the selected card’s empty synopsis opens it');
			await p.type('Mara arrives.');
			const two = await p.at(card(N + 'Two.md'));
			await tap(p, two.x, two.t + two.h - 14);
			await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
			await flush(p);
			S.eq((await fm(p, N + 'One.md'))?.synopsis, 'Mara arrives.', 'a tap on another card saves the synopsis');
			S.eq(j(await selected(p)), j([N + 'Two.md']), 'and selects that card');
			await tapEl(p, card(N + 'Two.md') + ' .binders-card-synopsis');
			await p.type('The keeper is met.');
			// (straight to the mode button: what's typed is saved by leaving the field)
			await modeByTouch(p, 'Outliner');
			await flush(p);
			S.eq((await fm(p, N + 'Two.md'))?.synopsis, 'The keeper is met.', 'a synopsis being typed when the mode is switched is saved');
			S.eq(await p.ev(`document.querySelectorAll('.binders-edit-field').length`), 0, 'and no field is left open');
			await shot(p, `${tag}-1b-01-outliner`);
			// the outliner: "Edit synopsis" in a row's menu, for a row without one
			await rowMenu(p, N + 'Three.md');
			S.ok((await menuItems(p)).includes('Edit synopsis'), 'a row’s menu has “Edit synopsis”: ' + j(await menuItems(p)));
			await pick(p, 'Edit synopsis');
			S.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', '“Edit synopsis” opens the row’s synopsis');
			S.ok((await fieldInSight(p)).ok, 'in sight: ' + j(await fieldInSight(p)));
			await p.type('A storm is coming.');
			await shot(p, `${tag}-1b-02-row-synopsis`);
			const four = await see(p, ocell(N + 'Four.md', 'words'));
			if (four) await tap(p, four.x, four.y); else { const r4 = await p.at(orow(N + 'Four.md')); await tap(p, r4.l + r4.w - 20, r4.y); }
			await until(p, `!document.querySelector('${LEAF} .binders-edit-field')`);
			await flush(p);
			S.eq((await fm(p, N + 'Three.md'))?.synopsis, 'A storm is coming.', 'a tap on another row saves it');
			await p.ev(`(() => { ${OUT}.scrollLeft = 0; return 1; })()`);
			// --- statuses, from each mode ---
			await rowMenu(p, N + 'Two.md');
			await pick(p, 'Set status', 'Revised');
			S.eq(await menus(p), 0, 'outliner: a status picked closes the sheet');
			const sc = await see(p, ocell(N + 'Three.md', 'status'));
			await tap(p, sc.x, sc.y);
			await tap(p, sc.x, sc.y);
			S.ok((await menuItems(p)).includes('Done'), 'outliner: a second tap on a row’s status opens the statuses: ' + j(await menuItems(p)));
			await pick(p, 'Done');
			await p.ev(`(() => { ${OUT}.scrollLeft = 0; return 1; })()`);
			await modeByTouch(p, 'Manuscript');
			await titleMenu(p, 'Four');
			await shot(p, `${tag}-1b-03-title-menu`);
			await pick(p, 'Set status', 'Idea');
			S.eq(await menus(p), 0, 'manuscript: a status picked closes the sheet');
			await modeByTouch(p, 'Corkboard');
			await cardMenu(p, N + 'One.md');
			await pick(p, 'Set status', 'Draft');
			await flush(p);
			S.eq(j([(await fm(p, N + 'One.md'))?.status, (await fm(p, N + 'Two.md'))?.status, (await fm(p, N + 'Three.md'))?.status, (await fm(p, N + 'Four.md'))?.status]), j(['Draft', 'Revised', 'Done', 'Idea']), 'the four statuses, each set from a different place');
			// --- labels ---
			await cardMenu(p, N + 'One.md');
			await pick(p, 'Set label', 'Red');
			await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`); await p.sleep(500);
			await rowMenu(p, N + 'Two.md');
			await pick(p, 'Set label', 'Blue');
			await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`); await p.sleep(1200);
			await titleMenu(p, 'Four');
			await pick(p, 'Set label', 'Green');
			await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`); await p.sleep(500);
			await cardMenu(p, N + 'Three.md');
			await pick(p, 'Set label', 'Custom color...');
			await until(p, `!!document.querySelector('.modal .binders-ask input')`);
			await p.sleep(400);
			S.eq(await dialogTitle(p), 'Custom color', 'the custom colour dialog');
			S.eq(await menus(p), 0, 'with no sheet left over it');
			await p.ev(`(() => { const i = document.querySelector('.modal .binders-ask input[type="text"]'); i.focus(); i.select(); return 1; })()`);
			await p.type('#7c3aed');
			await shot(p, `${tag}-1b-04-custom-color`);
			await dialogTap(p, 'Set color');
			await flush(p);
			await p.sleep(300);
			S.eq(j([(await fm(p, N + 'One.md'))?.label, (await fm(p, N + 'Two.md'))?.label, (await fm(p, N + 'Three.md'))?.label, (await fm(p, N + 'Four.md'))?.label]), j(['Red', 'Blue', '#7c3aed', 'Green']), 'the labels, and the colour of its own');
			S.eq(await p.ev(`getComputedStyle(document.querySelector(${j(card(N + 'Three.md'))})).getPropertyValue('--binders-label').trim()`), '#7c3aed', 'the card is painted in its own colour');
			await shot(p, `${tag}-1b-05-labeled`);
			S.eq(await dialogs(p), 0, 'no dialog left');
			// what was typed in the notes is untouched by all of that
			for (const n of ['One', 'Two', 'Three', 'Four']) S.eq(await body(p, N + n + '.md'), TEXT(n), `“${n}” has its text, byte for byte`);
			// --- chapters ---
			await cardMenu(p, N + 'One.md');
			S.ok((await menuItems(p)).includes('Put in a new folder'), '“Put in a new folder” is in a card’s menu');
			await pick(p, 'Put in a new folder');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			const nf = await p.ev(`({ tag: document.activeElement.tagName, value: document.activeElement.value ?? null, sel: (document.activeElement.selectionEnd ?? 0) - (document.activeElement.selectionStart ?? 0), stack: !!document.activeElement.closest('.binders-card.is-stack') })`);
			S.ok(nf.tag === 'INPUT' && nf.stack && nf.sel === (nf.value ?? '').length && nf.sel > 0, 'the new folder’s name is selected on its stack, ready to type over: ' + j(nf));
			S.ok((await fieldInSight(p)).ok, 'in sight: ' + j(await fieldInSight(p)));
			await shot(p, `${tag}-1b-06-new-folder`);
			await p.type('Chapter 1');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Chapter 1/One.md')`, 4000);
			await p.sleep(600);
			S.ok(await exists(p, 'Novel/Chapter 1/One.md'), 'the folder has its name, and the note is in it');
			S.eq((await fm(p, 'Novel/Chapter 1/One.md'))?.label, 'Red', 'with its properties');
			S.ok(/^1 note · /.test(await stackCount(p, 'Novel/Chapter 1') ?? ''), 'on the board the folder is one stack, which counts the note in it: ' + await stackCount(p, 'Novel/Chapter 1'));
			for (const n of NAMES.slice(1, 6)) {
				const mid = await dragCard(p, N + n + '.md', 'Novel/Chapter 1', 'into');
				if (n === 'Two') { S.eq(mid.ghost, 1, 'a held card, moved, follows the finger'); S.eq(mid.over, 'Novel/Chapter 1', 'and over the stack’s middle, the stack is marked'); }
				await until(p, `!!app.vault.getAbstractFileByPath(${j(`Novel/Chapter 1/${n}.md`)})`, 4000);
				if (!(await exists(p, `Novel/Chapter 1/${n}.md`))) { S.ok(false, `“${n}” dragged into Chapter 1 arrives there`); break; }
			}
			await shot(p, `${tag}-1b-07-chapter-1`);
			S.eq(j((await list(p, NNOTE)).slice(0, 8)), j([...CHAPTERS.slice(0, 7), 'Seven']), 'Chapter 1 has six notes, in order, each dropped on its stack going in after the last');
			S.eq((await stackCount(p, 'Novel/Chapter 1'))?.split(' · ')[0], '6 notes', 'and the stack counts six');
			// Chapter 2: the same
			await cardMenu(p, N + 'Seven.md');
			await pick(p, 'Put in a new folder');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			await p.type('Chapter 2');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Chapter 2/Seven.md')`, 4000);
			await p.sleep(600);
			for (const n of NAMES.slice(7, 12)) {
				await dragCard(p, N + n + '.md', 'Novel/Chapter 2', 'into');
				await until(p, `!!app.vault.getAbstractFileByPath(${j(`Novel/Chapter 2/${n}.md`)})`, 4000);
				if (!(await exists(p, `Novel/Chapter 2/${n}.md`))) { S.ok(false, `“${n}” dragged into Chapter 2 arrives there`); break; }
			}
			S.eq(j((await list(p, NNOTE)).slice(0, 15)), j([...CHAPTERS.slice(0, 14), 'Thirteen']), 'Chapter 2 too');
			// Chapter 3 in the outliner: a row's menu, then rows dragged onto the folder
			await modeByTouch(p, 'Outliner');
			await rowMenu(p, N + 'Thirteen.md');
			S.ok((await menuItems(p)).includes('Put in a new folder'), '“Put in a new folder” is in a row’s menu, in the same words');
			await pick(p, 'Put in a new folder');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			const nr = await p.ev(`({ tag: document.activeElement.tagName, value: document.activeElement.value ?? null, row: document.activeElement.closest('.binders-outliner-row')?.dataset.path ?? null })`);
			S.ok(nr.tag === 'INPUT' && /^Novel\/Untitled/.test(nr.row ?? ''), 'outliner: the new folder’s name is ready to type over: ' + j(nr));
			S.ok((await fieldInSight(p)).ok, 'in sight: ' + j(await fieldInSight(p)));
			await p.type('Chapter 3');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Chapter 3/Thirteen.md')`, 4000);
			await p.sleep(600);
			await shot(p, `${tag}-1b-08-chapter-3-outliner`);
			for (const n of NAMES.slice(13, 18)) {
				const prev = NAMES[NAMES.indexOf(n) - 1];
				const mid = await dragRow(p, N + n + '.md', `Novel/Chapter 3/${prev}.md`, 'after');
				if (n === 'Fourteen') S.ok(mid.ghost >= 1, 'a held row, moved, is dragged: ' + j(mid));
				await until(p, `!!app.vault.getAbstractFileByPath(${j(`Novel/Chapter 3/${n}.md`)})`, 4000);
				if (!(await exists(p, `Novel/Chapter 3/${n}.md`))) { S.ok(false, `“${n}” dragged into Chapter 3 in the outliner arrives there (hint was ${j(mid)})`); break; }
			}
			await shot(p, `${tag}-1b-09-chapters`);
			S.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'three chapters of six, and two notes after them');
			await agree(p, S, NNOTE, NAMES, 'after the chapters are made');
			// --- targets ---
			await setMode(p, 'corkboard');
			const count = await p.at(`${LEAF} .binders-word-count`);
			if (count) { await tap(p, count.x, count.y); } else { S.ok(await palette(p, 'Set word count target'), 'no count in the toolbar at this width: “Set word count target” is in the command palette'); }
			await until(p, `!!document.querySelector('.modal .binders-ask input')`);
			await p.sleep(300);
			S.eq(await dialogTitle(p), 'Word count target for the binder', 'the binder’s target is asked for');
			await p.type('60000');
			await dialogTap(p, 'Set target');
			await flush(p);
			S.eq((await fm(p, NNOTE))?.target, 60000, 'the binder’s target is in the binder note');
			await stackMenu(p, 'Novel/Chapter 1');
			S.ok((await menuItems(p)).includes('Set target...') && (await menuItems(p)).includes('Rename'), 'a chapter’s stack has a menu, with “Rename” and “Set target...”: ' + j(await menuItems(p)));
			await pick(p, 'Set target...');
			await until(p, `!!document.querySelector('.modal .binders-ask input')`);
			await p.type('9000');
			await dialogTap(p, 'Set target');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Chapter 1/Chapter 1.md')`, 3000);
			await flush(p);
			S.eq((await fm(p, 'Novel/Chapter 1/Chapter 1.md'))?.target, 9000, 'the chapter’s target is in a folder note made for it');
			await p.sleep(500);
			S.ok(/\/ 9,000 words/.test(await stackCount(p, 'Novel/Chapter 1') ?? ''), 'the chapter’s stack shows how far along it is: ' + await stackCount(p, 'Novel/Chapter 1'));
			// (a scene's target: on its chapter's own board)
			await intoStack(p, 'Novel/Chapter 1');
			S.eq(j((await cardsIn(p)).map((x) => x.split('/').pop().replace(/\.md$/, ''))), j(NAMES.slice(0, 6)), 'a tap on the stack’s name goes into the chapter: its six notes, and no card for its folder note');
			await cardMenu(p, 'Novel/Chapter 1/One.md');
			await pick(p, 'Set target...');
			await until(p, `!!document.querySelector('.modal .binders-ask input')`);
			await p.type('1200');
			await dialogTap(p, 'Set target');
			await flush(p);
			S.eq((await fm(p, 'Novel/Chapter 1/One.md'))?.target, 1200, 'the scene’s target');
			await p.sleep(500);
			await p.ev(`(() => { ${CORK}.scrollTop = 0; return 1; })()`);
			await p.sleep(300);
			await shot(p, `${tag}-1b-10-targets`);
			S.ok(/\/ 1,200 words/.test(await p.ev(`document.querySelector(${j(card('Novel/Chapter 1/One.md'))})?.textContent ?? ''`)), 'the card shows how far along its scene is');
			await upOut(p);
			S.eq((await viewState(p))?.folder, 'Novel', 'the way up in the toolbar leads back to the binder’s board');
			// the chapter renamed from its stack: its folder note follows, with the target
			await stackMenu(p, 'Novel/Chapter 1');
			await pick(p, 'Rename');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			S.eq(await p.ev(`document.activeElement.value`), 'Chapter 1', 'Rename opens the stack’s name');
			await p.type('Part One');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Part One/Part One.md')`, 4000);
			await flush(p);
			S.ok(await exists(p, 'Novel/Part One/Part One.md'), 'the renamed chapter’s folder note follows it');
			S.eq((await fm(p, 'Novel/Part One/Part One.md'))?.target, 9000, 'with its target');
			S.eq(j((await list(p, NNOTE)).slice(0, 3)), j(['Part One/', 'Part One/One', 'Part One/Two']), 'and the binder note follows');
			await agree(p, S, NNOTE, NAMES, 'at the end');
			S.eq(await menus(p) + await dialogs(p), 0, 'nothing left open');
			// every note's text is what it was: only properties were written
			const after = await texts(p);
			for (const n of NAMES) { const path = Object.keys(after).find((k) => k.endsWith('/' + n + '.md')); S.eq(split(after[path] ?? '').body, split(before[N + n + '.md']).body, `“${n}” still has its text`); }
		});
		S.done();
	});
}


const moveBy = async (p, what) => { await p.sleep(700); await flush(p); };
/** A tap on the page above an open sheet closes it, as on a device. */
const C = (ch, ...ns) => ns.map((n) => `Chapter ${ch}/${n}`);

for (const [dev, size] of [['phone (390 × 844)', PHONE], ['small phone (320 × 568)', SMALL]]) {
	const tag = size[0];

	test(`${dev} 1c. reordering: a card dragged within a chapter and onto another’s stack, a row dragged, “Move up” and “Move down” from a card, a row, a manuscript title and the file explorer; each taken back with “Undo last move” and made again with “Redo last move”, the three modes and the explorer agreeing throughout`, async (p, h, t) => {
		const S = softly(t);
		await novel(p, { chapters: true });
		const before = await texts(p);
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			const history = [j(await list(p, NNOTE))];
			const step = async (what, want) => {
				await p.sleep(500);
				const now = await list(p, NNOTE);
				if (want) S.eq(j(now.filter((x) => x.startsWith(want[0].split('/')[0] + '/') && !x.endsWith('/'))), j(want), what);
				S.ok(j(now) !== history[history.length - 1], what + ': the order changed');
				history.push(j(now));
			};
			// a card within its chapter (on the chapter's own board)
			await intoStack(p, 'Novel/Chapter 1');
			const mid = await dragCard(p, 'Novel/Chapter 1/Two.md', 'Novel/Chapter 1/Four.md');
			S.ok(mid.ghost === 1 && mid.line, 'the card follows the finger, with a line: ' + j(mid));
			await step('corkboard: Two dragged to after Four', C(1, 'One', 'Three', 'Four', 'Two', 'Five', 'Six'));
			S.eq(j(await selected(p)), j(['Novel/Chapter 1/Two.md']), 'the dropped card is selected');
			S.eq(await menus(p), 0, 'and no menu opens after a drag');
			await upOut(p);
			// a card into a chapter: dropped on its stack
			const into3 = await dragCard(p, 'Novel/Nineteen.md', 'Novel/Chapter 3', 'into');
			S.eq(into3.over, 'Novel/Chapter 3', 'over a chapter’s stack, the stack is marked');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Chapter 3/Nineteen.md')`, 4000);
			await step('corkboard: Nineteen dragged into Chapter 3', C(3, 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'));
			await shot(p, `${tag}-1c-01-dragged`);
			// a row
			await modeByTouch(p, 'Outliner');
			const rmid = await dragRow(p, 'Novel/Chapter 1/One.md', 'Novel/Chapter 1/Three.md', 'after');
			S.ok(rmid.ghost >= 1, 'outliner: a held row, moved, is dragged: ' + j(rmid));
			await step('outliner: One dragged to after Three', C(1, 'Three', 'One', 'Four', 'Two', 'Five', 'Six'));
			// Move down, Move up: the same words in each place
			await modeByTouch(p, 'Corkboard');
			await intoStack(p, 'Novel/Chapter 2');
			await cardMenu(p, 'Novel/Chapter 2/Seven.md');
			S.ok((await menuItems(p)).includes('Move down') && !(await menuItems(p)).includes('Move up'), 'the first card of a chapter has “Move down” and no “Move up”: ' + j((await menuItems(p)).filter((x) => /Move/.test(x))));
			await pick(p, 'Move down');
			await step('corkboard: Seven moved down', C(2, 'Eight', 'Seven', 'Nine', 'Ten', 'Eleven', 'Twelve'));
			await upOut(p);
			await modeByTouch(p, 'Outliner');
			await rowMenu(p, 'Novel/Chapter 2/Nine.md');
			await pick(p, 'Move up');
			await step('outliner: Nine moved up', C(2, 'Eight', 'Nine', 'Seven', 'Ten', 'Eleven', 'Twelve'));
			await modeByTouch(p, 'Manuscript');
			await titleMenu(p, 'Ten');
			S.ok((await menuItems(p)).includes('Move down') && (await menuItems(p)).includes('Move up'), 'a manuscript title’s menu has both: ' + j((await menuItems(p)).filter((x) => /Move/.test(x))));
			await pick(p, 'Move down');
			await step('manuscript: Ten moved down', C(2, 'Eight', 'Nine', 'Seven', 'Eleven', 'Ten', 'Twelve'));
			S.eq(j((await sectionsIn(p)).slice(6, 12)), j(['Eight', 'Nine', 'Seven', 'Eleven', 'Ten', 'Twelve']), 'and the page follows at once');
			await showExplorer(p, ['Novel', 'Novel/Chapter 2']);
			await explorerMenu(p, 'Novel/Chapter 2/Twelve.md');
			S.ok((await menuItems(p)).includes('Move up') && !(await menuItems(p)).includes('Move down'), 'the explorer: the last note of a chapter has “Move up” and no “Move down”');
			await pick(p, 'Move up');
			await step('explorer: Twelve moved up', C(2, 'Eight', 'Nine', 'Seven', 'Eleven', 'Twelve', 'Ten'));
			S.eq(j((await explorerOrder(p, 'Novel/Chapter 2')).map((x) => x.split('/').pop().replace(/\.md$/, ''))), j(['Eight', 'Nine', 'Seven', 'Eleven', 'Twelve', 'Ten']), 'the explorer shows it');
			await shot(p, `${tag}-1c-02-explorer`);
			await p.ev(`(() => { app.workspace.leftSplit.collapse(); return 1; })()`);
			await p.sleep(500);
			await agree(p, S, NNOTE, names(JSON.parse(history[history.length - 1])), 'after seven moves');
			// every one taken back, in turn, from the command palette (the only way on a phone), then made again
			await clearNotices(p);
			for (let i = history.length - 2; i >= 0; i--) {
				S.ok(await palette(p, 'Undo last move'), `“Undo last move” is in the palette (${history.length - 1 - i})`);
				await p.sleep(700);
				if (i === history.length - 2) { S.ok(/^Undid: /.test(await notices(p)), 'it says what it undid: ' + await notices(p)); await shot(p, `${tag}-1c-03-undid`); }
				S.eq(j(await list(p, NNOTE)), history[i], `undo ${history.length - 1 - i} puts the order back as it was`);
			}
			S.ok(await exists(p, 'Novel/Nineteen.md') && !(await exists(p, 'Novel/Chapter 3/Nineteen.md')), 'the note dragged into Chapter 3 is back out of it');
			S.ok(!(await palette(p, 'Undo last move')), 'with nothing left to undo, the command isn’t offered');
			await agree(p, S, NNOTE, NAMES, 'everything undone');
			for (let i = 1; i < history.length; i++) {
				S.ok(await palette(p, 'Redo last move'), `“Redo last move” is in the palette (${i})`);
				await p.sleep(700);
				S.eq(j(await list(p, NNOTE)), history[i], `redo ${i} makes the move again`);
			}
			await agree(p, S, NNOTE, names(JSON.parse(history[history.length - 1])), 'everything redone');
			const after = await texts(p);
			for (const n of NAMES) { const path = Object.keys(after).find((k) => k.endsWith('/' + n + '.md')), was = Object.keys(before).find((k) => k.endsWith('/' + n + '.md')); S.eq(after[path], before[was], `“${n}” is byte for byte what it was`); }
			S.eq(await menus(p) + await dialogs(p), 0, 'nothing left open');
		});
		S.done();
	});

	test(`${dev} 1d. writing: typing in the manuscript with the keyboard up, a split at the cursor from the palette, a scene duplicated and the copy deleted (asked first, whole in the trash), a filter by status that holds in each mode, the book exported as one note, opened, and the way back`, async (p, h, t) => {
		const S = softly(t);
		await novel(p, { chapters: true });
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			await modeByTouch(p, 'Manuscript');
			S.eq(await focusIs(p), 'BODY', 'switching to the manuscript puts no caret anywhere (no keyboard comes up)');
			// a tap at the end of One's first paragraph, then typing with the keyboard up
			const at = await p.ev(`(() => { const l = (${scene('One')}).querySelector('.cm-line, .binders-manuscript-rendered > p'); const r = document.createRange(); r.selectNodeContents(l); const rs = r.getClientRects(), last = rs[rs.length - 1]; return { x: last.right - 2, y: last.top + last.height / 2 }; })()`);
			await tap(p, at.x, at.y);
			// (on a phone the section is plain text until this tap: its editor is made by it)
			await until(p, `!!document.activeElement?.matches('.binders-manuscript .cm-content')`, 5000);
			await p.sleep(400);
			S.eq(await p.ev(`document.activeElement.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), 'One', 'a tap puts the caret in the section tapped');
			await keyboard(p, size, true);
			await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: ed.getCursor().line, ch: ed.getLine(ed.getCursor().line).length }); return 1; })()`);
			await p.type(' Typed on a phone.');
			await p.sleep(300);
			const k = await p.ev(`({ caret: Math.round(getSelection().getRangeAt(0).getBoundingClientRect().bottom), toolbar: Math.round(document.querySelector('.mobile-toolbar')?.getBoundingClientRect().top ?? innerHeight), inner: innerHeight })`);
			S.ok(k.caret <= k.toolbar, `with the keyboard up, the caret (${k.caret}) is above the editing toolbar (${k.toolbar})`);
			await shot(p, `${tag}-1d-01-typing`);
			await until(p, `app.vault.adapter.read('Novel/Chapter 1/One.md').then(x => /Typed on a phone\\./.test(x))`, 6000);
			const typed = TEXT('One').replace('rocks.\n', 'rocks. Typed on a phone.\n');
			S.eq(await body(p, 'Novel/Chapter 1/One.md'), typed, 'what was typed is in the note, once, where the caret was');
			// the caret to the start of the second paragraph, and the split
			await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; let n = 0; for (let i = 0; i < ed.lineCount(); i++) if (/^A second paragraph/.test(ed.getLine(i))) n = i; ed.setCursor({ line: n, ch: 0 }); return 1; })()`);
			S.ok(await palette(p, 'Split scene at cursor'), '“Split scene at cursor” is in the palette with the caret in a section');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Chapter 1/One 2.md')`, 5000);
			// (the first half lets go of the second in its editor, which writes it a moment later: see the BUG test below)
			const t0 = Date.now();
			await until(p, `app.vault.adapter.read('Novel/Chapter 1/One.md').then(x => !/A second paragraph/.test(x))`, 6000);
			log(`${tag}: after the split, the first note on disk still had the second half for`, Date.now() - t0, 'ms');
			await p.sleep(300);
			await shot(p, `${tag}-1d-02-split`);
			S.eq(j((await sectionsIn(p)).slice(0, 3)), j(['One', 'One 2', 'Two']), 'the section is two, in place');
			const a = await body(p, 'Novel/Chapter 1/One.md'), b = await exists(p, 'Novel/Chapter 1/One 2.md') ? await body(p, 'Novel/Chapter 1/One 2.md') : '';
			S.eq((a.trimEnd() + '\n\n' + b.trimStart()).trim(), typed.trim(), 'every word is in one of the two, once');
			S.eq(j((await list(p, NNOTE)).slice(0, 4)), j(['Chapter 1/', 'Chapter 1/One', 'Chapter 1/One 2', 'Chapter 1/Two']), 'and the new note is right after the first in the binder note');
			log(`${tag}: after the split the keyboard is on`, await focusIs(p), 'in', await p.ev(`document.activeElement.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`));
			// more typing, in the new section, then straight to the corkboard: nothing lost on the way
			await tapEnd(p, `(${scene('One 2')})`);
			await p.type('LAST WORDS');
			await keyboard(p, size, false);
			await modeByTouch(p, 'Corkboard');
			await flush(p);
			S.ok(/LAST WORDS/.test(await read(p, 'Novel/Chapter 1/One 2.md').catch(() => '')), 'typing just before the mode is switched is in the note');
			// duplicate, then delete the copy (on the chapter's own board)
			await intoStack(p, 'Novel/Chapter 1');
			await cardMenu(p, 'Novel/Chapter 1/Two.md');
			await pick(p, 'Duplicate');
			await p.sleep(900);
			const copy = await p.ev(`app.vault.getMarkdownFiles().map(f => f.path).find(x => /Chapter 1\\/Two .+\\.md$/.test(x)) ?? null`);
			S.ok(!!copy, 'Duplicate makes a copy beside it');
			if (copy) {
				S.eq(await read(p, copy), await read(p, 'Novel/Chapter 1/Two.md'), 'with the same text and properties');
				const l = await list(p, NNOTE);
				S.eq(l[l.indexOf('Chapter 1/Two') + 1], copy.replace(/^Novel\//, '').replace(/\.md$/, ''), 'right after the original');
				S.eq(j(await selected(p)), j([copy]), 'and it’s the selected card');
				await shot(p, `${tag}-1d-03-duplicated`);
				await cardMenu(p, copy);
				await pick(p, 'Delete');
				await until(p, `!!document.querySelector('.modal .modal-button-container')`);
				await p.sleep(300);
				S.eq(await dialogTitle(p), 'Delete note', 'Delete asks first');
				S.ok(/vault’s trash/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'and says where it goes');
				await shot(p, `${tag}-1d-04-delete`);
				await dialogTap(p, 'Delete');
				await until(p, `!app.vault.getAbstractFileByPath(${j(copy)})`, 4000);
				S.ok(!(await exists(p, copy)), 'the copy is gone');
				S.ok(await p.ev(`app.vault.adapter.exists(${j('.trash/' + copy.split('/').pop())})`), 'and whole in the vault’s trash');
				S.ok(!(await list(p, NNOTE)).includes(copy.replace(/^Novel\//, '').replace(/\.md$/, '')), 'and out of the binder note');
				S.ok((await selected(p)).length === 1, 'the next card is selected: ' + j(await selected(p)));
			}
			// the filter, in each mode
			const drafts = await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('Novel')).filter(f => app.metadataCache.getFileCache(f)?.frontmatter?.status === 'Draft').map(f => f.basename)`);
			const draftsIn = (folder) => p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('Novel')).filter(f => f.parent.path === ${j(folder)} && app.metadataCache.getFileCache(f)?.frontmatter?.status === 'Draft').map(f => f.basename)`);
			await tapEl(p, `${LEAF} .binders-filter-button`);
			await pick(p, 'Draft');
			await backdropTap(p);
			await gone(p);
			await shot(p, `${tag}-1d-05-filtered`);
			S.eq(j((await cardsIn(p)).map((x) => x.split('/').pop().replace(/\.md$/, ''))), j(await draftsIn('Novel/Chapter 1')), 'corkboard, inside a chapter: only its drafts show');
			await upOut(p);
			S.eq(j((await cardsIn(p)).map((x) => x.split('/').pop().replace(/\.md$/, ''))), j(['Chapter 1', 'Chapter 2', 'Chapter 3', ...(await draftsIn('Novel'))]), 'on the binder’s board: its own drafts, beside the chapters’ stacks (the filter came along)');
			await modeByTouch(p, 'Outliner');
			S.eq(j((await rowsIn(p)).filter((x) => x.endsWith('.md')).map((x) => x.split('/').pop().replace(/\.md$/, ''))), j(drafts), 'outliner: the filter holds');
			S.ok(/Filter \(1\)/.test(await p.ev(`document.querySelector('${LEAF} .binders-filter-button').textContent`)) || size[0] < 340, 'the button says a filter is on: ' + await p.ev(`document.querySelector('${LEAF} .binders-filter-button').textContent`));
			await modeByTouch(p, 'Manuscript');
			S.eq(j(await sectionsIn(p)), j(drafts), 'manuscript: the filter holds');
			await shot(p, `${tag}-1d-06-filtered-manuscript`);
			await tapEl(p, `${LEAF} .binders-filter-button`);
			await pick(p, 'Clear filter');
			await p.sleep(500);
			S.eq((await sectionsIn(p)).length, 21, 'cleared: every note shows again');
			// export as one note, from the view's own menu (“Export...” opens on the kind last made: one note)
			await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`);
			await tapEl(p, `${LEAF} .view-actions .clickable-icon[aria-label="More options"]`);
			S.ok((await menuItems(p)).includes('Export...'), 'the view’s “More options” has “Export...”: ' + j(await menuItems(p)));
			await pick(p, 'Export...');
			await until(p, `!!document.querySelector('.modal .binders-export-path')`);
			await p.sleep(400);
			await shot(p, `${tag}-1d-07-compile`);
			S.eq(await p.ev(`document.querySelector('.modal .binders-export-path').value`), 'Novel (exported).md', 'it will be saved beside the binder');
			await dialogTap(p, 'Export');
			await until(p, `app.workspace.getActiveFile()?.path === 'Novel (exported).md'`, 6000);
			await p.sleep(700);
			await shot(p, `${tag}-1d-08-compiled`);
			S.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), 'Novel (exported).md', 'the exported note opens');
			const out = await read(p, 'Novel (exported).md').catch(() => '');
			const firsts = (await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('Novel')).map(f => f.basename)`)).map((n) => out.indexOf(n === 'One 2' ? 'A second paragraph of One' : `${n} begins here.`));
			S.ok(firsts.every((x, i) => x >= 0 && (i === 0 || x > firsts[i - 1])), 'with every scene’s text, in binder order: ' + j(firsts));
			S.eq(out.split('Typed on a phone.').length - 1, 1, 'and what was typed, once');
			S.eq(out.split('LAST WORDS').length - 1, 1, 'and the last words, once');
			// the way back
			const nav = await p.ev(`[...document.querySelectorAll('.mobile-navbar .mobile-navbar-action, .mobile-navbar .clickable-icon')].map(e => ({ label: e.getAttribute('aria-label'), cls: e.className, disabled: e.classList.contains('is-disabled') || e.getAttribute('aria-disabled') }))`);
			log(`${tag}: after Export, the navigation bar:`, j(nav), 'tabs:', await p.ev(`(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; })()`));
			await p.ev(`app.commands.executeCommandById('app:go-back')`);
			await p.sleep(800);
			const back = await p.ev(`app.workspace.getMostRecentLeaf()?.view.getViewType()`);
			log(`${tag}: after Back from the exported note the tab shows:`, back);
			await p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === 'Novel (exported).md'); l?.detach(); return 1; })()`);
			await p.sleep(800);
			S.eq(await p.ev(`app.workspace.getMostRecentLeaf()?.view.getViewType()`), 'binders-view', 'closing the exported note’s tab comes back to the binder');
			S.eq((await viewState(p))?.mode, 'manuscript', 'in the mode it was left in');
			S.eq(await menus(p) + await dialogs(p), 0, 'nothing left open');
		});
		S.done();
	});
}


// =====================================================================================================================
// 2. The same on a tablet: the sidebar pinned open, a hardware keyboard beside touch, panes, rotation
// =====================================================================================================================

/** A real key for each character, as a hardware keyboard sends them. */
const keys = async (p, text) => { for (const ch of text) { if (/[A-Za-z0-9 .]/.test(ch)) await p.key(ch); else await p.send('Input.insertText', { text: ch }); } await p.sleep(80); };
/** A tap with a modifier key of a hardware keyboard held (8: Shift, 2: Ctrl). */
const tapMod = async (p, x, y, modifiers) => { await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], modifiers }); await p.sleep(40); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], modifiers }); await p.sleep(450); };
const tabsOpen = (p) => p.ev(`(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; })()`);
/** Pins the tablet's sidebar open beside the panes (its pin button). False where it can't be pinned. */
const pin = async (p, on = true) => { const ok = await p.ev(`(() => { const l = app.workspace.leftSplit; if (typeof l.setPinned !== 'function') return false; if (${on}) l.expand(); l.setPinned(${on}); return l.isPinned === ${on}; })()`); await p.sleep(600); return ok; };
const TABLETS = [['tablet upright (820 × 1180)', TABLET], ['tablet on its side (1180 × 820)', TABLET_WIDE]];

for (const [dev, size] of TABLETS) {
	const tag = 't' + size[0];

	test(`${dev} 2a. the sidebar pinned open: “New binder” from the explorer’s menu (a popover), named with the keyboard, opened by a tap with the sidebar staying; scenes from the tile; the explorer marks the folder shown, follows a folder opened in the view, and a tap on a folder there shows it`, async (p, h, t) => {
		const S = softly(t);
		await onDevice(p, size, async () => {
			S.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
			await showExplorer(p);
			S.ok(await pin(p), 'the sidebar can be pinned open on a tablet');
			const side = await p.ev(`(() => { const s = document.querySelector('.workspace-split.mod-left-split, .workspace-drawer.mod-left'); const r = s?.getBoundingClientRect(); const root = document.querySelector('.workspace-split.mod-root').getBoundingClientRect(); return { cls: s?.className, w: Math.round(r?.width ?? 0), rootLeft: Math.round(root.left), rootW: Math.round(root.width), pinned: document.body.classList.contains('is-left-sidedock-open') || null }; })()`);
			log(`${tag}: the sidebar:`, j(side));
			await p.ev(`(() => { const c = document.querySelector('.nav-files-container'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 100, clientY: r.bottom - 60, button: 0 })); return 1; })()`);
			await p.sleep(500);
			const s0 = await sheet(p);
			S.ok(s0 && !isSheet(s0), 'the explorer’s menu is a popover on a tablet: ' + j(s0));
			await shot(p, `${tag}-2a-01-menu`);
			await pick(p, 'New binder');
			await until(p, `document.activeElement?.classList.contains('nav-folder-title-content')`, 3000);
			S.eq(await p.ev(`getSelection().toString()`), 'Untitled binder', 'the new binder’s name is selected');
			await keys(p, 'Novel');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel')`, 4000);
			await p.sleep(900);
			const NNOTE = await p.ev(`${B}.binderOf(app.vault.getAbstractFileByPath('Novel'))?.note.path ?? null`);
			S.ok(!!NNOTE, 'typed on a hardware keyboard, the name makes the binder “Novel”');
			await tapEl(p, explorerRow('Novel'));
			await until(p, `${VIEW}?.folder?.path === 'Novel'`, 4000);
			await p.sleep(600);
			S.eq((await viewState(p))?.folder, 'Novel', 'a tap opens it');
			const pinned = await drawerOpen(p);
			log(`${tag}: after a tap on the binder the sidebar is`, pinned ? 'still open' : 'closed');
			await shot(p, `${tag}-2a-02-opened`);
			if (!pinned) await showExplorer(p);
			S.ok(await p.ev(`document.querySelector(${j(explorerRow('Novel'))})?.classList.contains('is-active')`), 'the explorer marks the folder shown, as it marks the open note: ' + await p.ev(`document.querySelector(${j(explorerRow('Novel'))})?.className`));
			// six scenes and a folder, typed on the keyboard
			await tapEl(p, `${LEAF} .binders-card-new`);
			for (const n of NAMES.slice(0, 6)) { await keys(p, n); await p.key('Enter'); await until(p, `!!app.vault.getAbstractFileByPath(${j(N + n + '.md')})`, 3000); await p.sleep(300); }
			await p.key('Escape');
			await p.sleep(300);
			S.eq(await focusIs(p).then((x) => /binders-card-new/.test(x)), true, 'Escape leaves the keyboard on the “New note” tile: ' + await focusIs(p));
			S.eq(j(names(await list(p, NNOTE))), j(NAMES.slice(0, 6)), 'six notes, in order');
			if (await drawerOpen(p)) S.eq(j((await explorerOrder(p, 'Novel')).map((x) => x.split('/').pop().replace(/\.md$/, ''))), j(NAMES.slice(0, 6)), 'and the explorer beside the board lists them as they’re made');
			await tapEl(p, `${LEAF} .binders-new-button`);
			const s1 = await sheet(p);
			S.ok(s1 && !isSheet(s1) && s1.width < 400, 'the toolbar’s New is a popover: ' + j(s1));
			await pick(p, 'New folder');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			await keys(p, 'Part One');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Part One')`, 4000);
			await p.sleep(500);
			S.ok(await exists(p, 'Novel/Part One'), 'New → New folder, named with the keyboard');
			S.eq(j((await cardsIn(p)).slice(-2)), j(['Novel/Six.md', 'Novel/Part One']), 'the new folder is a stack, last on the board');
			// (that the keyboard is on the new stack once it's named, so Enter opens it, is the BUG: qa7 test below)
			// a tap on the stack, then Enter, opens the folder; the explorer follows
			const st = await see(p, card('Novel/Part One'));
			await tap(p, st.x, st.t + st.h - 14);
			S.ok(/^div\.binders-card\.is-stack.*\[Novel\/Part One\]$/.test(await focusIs(p)), 'a tap puts the keyboard on the stack: ' + await focusIs(p));
			await p.key('Enter');
			await until(p, `${VIEW}?.folder?.path === 'Novel/Part One'`, 3000);
			await p.sleep(500);
			S.eq((await viewState(p))?.folder, 'Novel/Part One', 'Enter on a folder’s stack opens the folder');
			await showExplorer(p, ['Novel']);
			S.ok(await p.ev(`document.querySelector(${j(explorerRow('Novel/Part One'))})?.classList.contains('is-active') && !document.querySelector(${j(explorerRow('Novel'))})?.classList.contains('is-active')`), 'and the explorer marks that folder now');
			await shot(p, `${tag}-2a-03-folder`);
			// a tap on the binder in the explorer goes back up
			await tapEl(p, explorerRow('Novel'));
			await until(p, `${VIEW}?.folder?.path === 'Novel'`, 3000);
			await p.sleep(400);
			S.eq((await viewState(p))?.folder, 'Novel', 'a tap on the binder in the explorer shows the binder again');
			S.eq(await tabsOpen(p), 1, 'in the same tab');
			S.eq(await menus(p) + await dialogs(p), 0, 'nothing left open');
		});
		S.done();
	});

	test(`${dev} 2b. a hardware keyboard beside touch: arrows, F2, Enter and Back, Alt+arrows and Ctrl+Z on the corkboard; Shift-tap and Ctrl-tap select several, which are put in a folder and merged; the outliner’s rows and cells; the manuscript’s arrows across sections, F2 and its own undo`, async (p, h, t) => {
		const S = softly(t);
		await novel(p);
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			const cols = await p.ev(`getComputedStyle(document.querySelector('${LEAF} .binders-cards')).gridTemplateColumns.trim().split(/\\s+/).length`);
			log(`${tag}: the board has`, cols, 'columns');
			S.ok(cols >= 2, 'the cards are in columns');
			const one = await p.at(card(N + 'One.md'));
			await tap(p, one.x, one.t + one.h - 14);
			S.eq(await focusIs(p), `div.binders-card.is-selected[${N}One.md]`, 'a tap puts the keyboard on the card');
			await p.key('ArrowRight');
			S.eq(j(await selected(p)), j([N + 'Two.md']), 'Right goes to the next card');
			await p.key('ArrowDown');
			S.eq(j(await selected(p)), j([N + NAMES[1 + cols] + '.md']), 'Down to the card below');
			await p.key('ArrowUp'); await p.key('ArrowLeft');
			S.eq(j(await selected(p)), j([N + 'One.md']), 'Up and Left back');
			// F2, a new name, Enter
			await p.key('F2');
			S.eq(await p.ev(`document.activeElement.tagName + ':' + (document.activeElement.value ?? '')`), 'INPUT:One', 'F2 renames the card');
			await keys(p, 'First');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/First.md')`, 3000);
			await p.sleep(400);
			S.ok(await exists(p, 'Novel/First.md'), 'Enter keeps the name');
			S.eq(await focusIs(p), `div.binders-card.is-selected[${N}First.md]`, 'and the keyboard is on the card again');
			// Enter opens, Back returns with the keyboard on the card
			await p.key('Enter');
			await until(p, `app.workspace.getActiveFile()?.path === 'Novel/First.md'`, 3000);
			S.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), 'Novel/First.md', 'Enter opens the note');
			await p.ev(`app.commands.executeCommandById('app:go-back')`);
			await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`);
			await p.sleep(500);
			S.eq(await focusIs(p), `div.binders-card.is-selected[${N}First.md]`, 'Back returns to the board with the keyboard on that card');
			// Alt+Right moves it; Ctrl+Z takes that back, Ctrl+Shift+Z makes it again
			const NNOTE2 = NNOTE;
			await p.key('ArrowRight', 'alt');
			await p.sleep(600);
			S.eq(j(names(await list(p, NNOTE2)).slice(0, 3)), j(['Two', 'First', 'Three']), 'Alt+Right moves the card');
			await p.key('z', 'ctrl');
			await p.sleep(700);
			S.eq(j(names(await list(p, NNOTE2)).slice(0, 3)), j(['First', 'Two', 'Three']), 'Ctrl+Z takes the move back');
			await p.key('z', 'ctrl', 'shift');
			await p.sleep(700);
			S.eq(j(names(await list(p, NNOTE2)).slice(0, 3)), j(['Two', 'First', 'Three']), 'Ctrl+Shift+Z makes it again');
			await p.key('z', 'ctrl');
			await p.sleep(700);
			S.ok(/binders-card/.test(await focusIs(p)), 'and the keyboard is still on a card: ' + await focusIs(p));
			// Shift-tap: a range; its menu makes a folder of it
			const c3 = await p.at(card(N + 'Three.md')), c5 = await p.at(card(N + 'Five.md'));
			await tap(p, c3.x, c3.t + c3.h - 14);
			await tapMod(p, c5.x, c5.t + c5.h - 14, 8);
			S.eq(j(await selected(p)), j(['Three', 'Four', 'Five'].map((n) => N + n + '.md')), 'a tap with Shift held selects the range');
			await hold(p, c5.x, c5.t + c5.h - 14);
			S.ok((await menuItems(p)).includes('Move') && (await menuItems(p)).includes('Merge 3 notes'), 'held, the selection’s menu offers “Move” (a tablet’s short menu: the new folder is under it) and a merge: ' + j(await menuItems(p)));
			await shot(p, `${tag}-2b-01-selection-menu`);
			await pick(p, 'Move', 'New folder from selection');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			await keys(p, 'Middle');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Middle/Five.md')`, 4000);
			await p.sleep(600);
			S.eq(j((await list(p, NNOTE2)).slice(0, 7)), j(['First', 'Two', 'Middle/', 'Middle/Three', 'Middle/Four', 'Middle/Five', 'Six']), 'the three are in a folder named with the keyboard, where the first was');
			// Ctrl-tap: two that aren't neighbours, merged
			const c6 = await see(p, card(N + 'Six.md'));
			await tap(p, c6.x, c6.t + c6.h - 14);
			const c8 = await p.at(card(N + 'Eight.md'));
			await tapMod(p, c8.x, c8.t + c8.h - 14, 2);
			S.eq(j(await selected(p)), j([N + 'Six.md', N + 'Eight.md']), 'a tap with Ctrl held adds a card to the selection');
			await hold(p, c8.x, c8.t + c8.h - 14);
			await pick(p, 'Merge 2 notes');
			await until(p, `!!document.querySelector('.modal .modal-button-container')`, 3000);
			await p.sleep(300);
			await shot(p, `${tag}-2b-02-merge`);
			log(`${tag}: the merge asks:`, await p.ev(`document.querySelector('.modal')?.textContent`));
			const mergeBtn = await p.ev(`[...document.querySelectorAll('.modal .modal-button-container button')].map(b => b.textContent)`);
			await dialogTap(p, mergeBtn.find((x) => /Merge/.test(x)) ?? mergeBtn[0]);
			await until(p, `!app.vault.getAbstractFileByPath('Novel/Eight.md')`, 4000);
			await p.sleep(500);
			const merged = await body(p, 'Novel/Six.md');
			S.ok(merged.includes(TEXT('Six').trim()) && merged.includes(TEXT('Eight').trim()) && merged.indexOf('Six begins') < merged.indexOf('Eight begins'), 'the merged note has both texts, in order');
			S.eq(merged.split('Eight begins here.').length - 1, 1, 'once');
			S.ok(await p.ev(`app.vault.adapter.exists('.trash/Eight.md')`), 'and the other is in the trash');
			S.eq((await fm(p, 'Novel/Six.md'))?.synopsis, 'What happens in six.\n\nWhat happens in eight.', 'their synopses joined');
			// Delete asks; Escape keeps
			await p.sleep(300);
			const c9 = await see(p, card(N + 'Nine.md'));
			await tap(p, c9.x, c9.t + c9.h - 14);
			await p.key('Delete');
			await until(p, `!!document.querySelector('.modal .modal-button-container')`, 3000);
			S.eq(await dialogTitle(p), 'Delete note', 'Delete asks first');
			await p.key('Escape');
			await p.sleep(400);
			S.ok(await exists(p, N + 'Nine.md'), 'Escape keeps the note');
			S.eq(await focusIs(p), `div.binders-card.is-selected[${N}Nine.md]`, 'and the keyboard is back on its card');
			// --- the outliner ---
			await modeByTouch(p, 'Outliner');
			const r2 = await p.at(orow(N + 'Two.md') + ' .binders-outliner-synopsis') ?? await p.at(orow(N + 'Two.md'));
			await tap(p, r2.x, r2.y);
			S.eq(j(await selected(p)), j([N + 'Two.md']), 'outliner: a tap selects the row');
			await p.key('ArrowUp');
			S.eq(j(await selected(p)), j([N + 'First.md']), 'Up goes to the row above');
			await p.key('ArrowDown'); await p.key('ArrowDown');
			S.eq(j(await selected(p)), j([N + 'Middle']), 'Down twice: the folder');
			await p.key('ArrowLeft');
			await p.sleep(300);
			S.ok(!(await rowsIn(p)).includes('Novel/Middle/Three.md'), 'Left folds it');
			await p.key('ArrowRight');
			await p.sleep(300);
			S.ok((await rowsIn(p)).includes('Novel/Middle/Three.md'), 'Right unfolds it');
			await p.key('ArrowUp');
			await p.key('ArrowRight');
			const cellFocus = await p.ev(`document.activeElement.dataset?.col ?? null`);
			S.ok(!!cellFocus, 'Right on a note’s row goes into its cells: ' + await focusIs(p));
			// to the status cell, Enter opens its menu, a status picked with the keyboard
			for (let i = 0; i < 6 && (await p.ev(`document.activeElement.dataset?.col`)) !== 'status'; i++) await p.key('ArrowRight');
			await p.key('Enter');
			await p.sleep(400);
			S.ok((await menuItems(p)).includes('Revised'), 'Enter in the status cell opens the statuses: ' + j(await menuItems(p)));
			await gone(p);
			await p.key('Escape');
			// Tab: where does it go?
			await tap(p, r2.x, r2.y);
			await p.key('Tab');
			log(`${tag}: outliner, Tab from a row goes to`, await focusIs(p));
			await p.key('F2');
			log(`${tag}: outliner, then F2:`, await focusIs(p), await p.ev(`document.activeElement.value ?? null`));
			await p.key('Escape');
			// --- the manuscript ---
			await modeByTouch(p, 'Manuscript');
			const at = await p.ev(`(() => { const l = (${scene('First')}).querySelector('.cm-line, .binders-manuscript-rendered > p'); const r = l.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 12 }; })()`);
			await tap(p, at.x, at.y);
			await until(p, `!!document.activeElement?.matches('.binders-manuscript .cm-content')`, 5000);
			await p.sleep(400);
			await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 1; })()`);
			await keys(p, 'Typed with keys.');
			await p.key('ArrowDown');
			await p.sleep(500);
			S.eq(await p.ev(`document.activeElement.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), 'Two', 'Down on a section’s last line goes into the next');
			await keys(p, 'X');
			await p.key('z', 'ctrl');
			await p.sleep(300);
			await p.key('ArrowUp');
			await p.sleep(500);
			S.eq(await p.ev(`document.activeElement.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), 'First', 'Up on its first line goes back');
			await p.key('F2');
			S.eq(j(await p.ev(`[document.activeElement.classList.contains('is-renaming'), getSelection().toString()]`)), j([true, 'First']), 'F2 in a section’s text renames the section');
			await keys(p, 'One');
			log(`${tag}: manuscript F2, after typing:`, await focusIs(p), j(await p.ev(`document.activeElement.textContent`)));
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/One.md')`, 3000);
			log(`${tag}: after Enter:`, await focusIs(p), await notices(p), j(await p.ev(`app.vault.getMarkdownFiles().map(f => f.path).filter(x => /One|First/.test(x))`)));
			await p.sleep(500);
			await keys(p, 'w');
			await until(p, `app.vault.adapter.read('Novel/One.md').then(x => /Typed with keys\\.w/.test(x)).catch(() => false)`, 6000);
			S.eq((await body(p, 'Novel/One.md')).slice(TEXT('One').length - 10), 'to split.\nTyped with keys.w', 'what was typed before and after the rename is in the renamed note, where the caret was');
			S.eq(await body(p, 'Novel/Two.md'), TEXT('Two'), 'the X typed in Two and undone with Ctrl+Z left it as it was');
			S.eq(j(names(await list(p, NNOTE2)).slice(0, 2)), j(['One', 'Two']), 'Ctrl+Z in the text didn’t undo a move');
			await shot(p, `${tag}-2b-03-manuscript`);
			await p.ev(`document.activeElement?.blur?.()`);
			await agree(p, S, NNOTE2, ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', ...NAMES.slice(8)], 'at the end');
		});
		S.done();
	});
}


/** Names the panes of the main area p0, p1… in order, so each can be looked at whichever is active. */
const markPanes = (p) => p.ev(`(() => { const out = []; let i = 0; app.workspace.iterateRootLeaves(l => { l.containerEl.dataset.qa = 'p' + i++; out.push(l.view.getViewType() + ':' + (l.view.file?.path ?? l.view.folder?.path ?? '') + (l.view.mode && l.view.getViewType() === 'binders-view' ? ':' + l.view.mode : '')); }); return out; })()`);
const pane = (i) => `.workspace-leaf[data-qa="p${i}"]`;
const paneScene = (i, name) => `[...document.querySelectorAll('${pane(i)} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === ${j(name)})`;
/** A tap at the end of the last line of an editor (a note's, or a manuscript section's), which puts the caret there. */
async function tapEnd(p, expr) {
	// (a section out of sight is plain text until it's near: scrolled to, it becomes an editor a moment later. On a
	// phone it stays plain text until it's tapped: the tap is on whichever is there, and its editor is waited for.)
	await p.ev(`(() => { (${expr})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	await until(p, `!!(${expr})?.querySelector('.cm-line, .binders-manuscript-rendered > *')`, 5000);
	const where = `(() => { const root = ${expr}; const live = root.querySelectorAll('.cm-line'), ls = live.length ? live : root.querySelectorAll('.binders-manuscript-rendered > *'); const l = ls[ls.length - 1]; l.scrollIntoView({ block: 'center' }); const r = document.createRange(); r.selectNodeContents(l); const rs = r.getClientRects(), last = rs[rs.length - 1] ?? l.getBoundingClientRect(); return { x: Math.max(last.right - 1, last.left + 1), y: last.top + last.height / 2 }; })()`;
	await p.ev(where);
	await p.sleep(250);
	const at = await p.ev(where);
	await tap(p, at.x, at.y);
	if (!(await until(p, `(() => { const root = ${expr}, a = document.activeElement; return !!a?.matches('.cm-content') && (root === a || root.contains(a)); })()`, 5000))) throw new Error('a tap at the end of the text put no caret there');
	await p.ev(`(() => { const ed = app.workspace.activeEditor?.editor; if (ed) ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 1; })()`);
	return at;
}
const count = (text, token) => text.split(token).length - 1;

for (const [dev, size] of TABLETS) {
	const tag = 't' + size[0];

	test(`${dev} 2c. panes: a card’s “Open to the right” puts its note beside the board, where typing moves the card’s count and a synopsis typed on the card doesn’t disturb what was just typed in the note; a corkboard and a manuscript of the same binder side by side follow each other (a drag, typing, a rename, a delete right after typing); a card dragged over the other pane moves nothing`, async (p, h, t) => {
		const S = softly(t);
		await novel(p);
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			// --- the board, and a note of it to the right ---
			await cardMenu(p, N + 'One.md');
			S.ok((await menuItems(p)).includes('Open to the right'), 'a tablet’s card menu has “Open to the right”');
			await pick(p, 'Open to the right');
			await until(p, `app.workspace.getActiveFile()?.path === 'Novel/One.md'`, 4000);
			await p.sleep(700);
			let panes = await markPanes(p);
			S.eq(j(panes), j(['binders-view:Novel:corkboard', 'markdown:Novel/One.md']), 'the note opens to the right of the board');
			await shot(p, `${tag}-2c-01-beside`);
			const view = await p.ev(`(() => { const v = document.querySelector('${pane(0)} .binders-view'), b = v.querySelector('.binders-toolbar'); return { width: Math.round(v.getBoundingClientRect().width), out: Math.max(v.scrollWidth - v.clientWidth, b.scrollWidth - b.clientWidth) }; })()`);
			S.ok(view.out <= 0, 'the board’s toolbar fits its half: ' + j(view));
			await tapEnd(p, `document.querySelector('${pane(1)} .cm-content')`);
			await p.type(' Extra words here.');
			await until(p, `/29 words/.test(document.querySelector('${pane(0)} .binders-card[data-path="Novel/One.md"]')?.textContent ?? '')`, 5000);
			S.ok(/29 words/.test(await p.ev(`document.querySelector('${pane(0)} .binders-card[data-path="Novel/One.md"]')?.textContent ?? ''`)), 'typing in the note moves its card’s word count: ' + await p.ev(`document.querySelector('${pane(0)} .binders-card[data-path="Novel/One.md"] .binders-card-words')?.textContent`));
			// more typing, and straight away a synopsis on its card
			await p.type('MORE');
			const c = await p.at(`${pane(0)} .binders-card[data-path="Novel/One.md"]`);
			await tap(p, c.x, c.t + c.h - 14);
			const syn = await p.at(`${pane(0)} .binders-card[data-path="Novel/One.md"] .binders-card-synopsis`);
			await tap(p, syn.x, syn.y);
			S.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', 'a tap on the selected card’s synopsis, in the other pane, edits it');
			await p.ev(`document.activeElement.select()`);
			await p.type('Changed from the board.');
			const c2 = await p.at(`${pane(0)} .binders-card[data-path="Novel/Two.md"]`);
			await tap(p, c2.x, c2.t + c2.h - 14);
			await p.sleep(2600);
			await flush(p);
			const one = await read(p, 'Novel/One.md');
			S.eq(split(one).body, TEXT('One') + ' Extra words here.MORE', 'the note has what was typed in it, once, and nothing else changed');
			S.eq((await fm(p, 'Novel/One.md'))?.synopsis, 'Changed from the board.', 'and the synopsis typed on the card');
			S.eq(await p.ev(`document.querySelector('${pane(1)} .cm-content').innerText.includes('Extra words here.MORE')`), true, 'the note’s editor still shows it');
			await p.ev(`(() => { app.workspace.getLeavesOfType('markdown').forEach(l => l.detach()); return 1; })()`);
			await p.sleep(500);
			// --- a corkboard and a manuscript of the same binder ---
			await p.ev(`(async () => { await ${PL}.openBinder(app.vault.getAbstractFileByPath('Novel'), 'split'); })().then(() => 1)`);
			await until(p, `app.workspace.getLeavesOfType('binders-view').length === 2`, 4000);
			await p.sleep(600);
			await tapEl(p, `${LEAF} .binders-mode-button`);
			await pick(p, 'Manuscript');
			await p.sleep(1500);
			panes = await markPanes(p);
			S.eq(j(panes), j(['binders-view:Novel:corkboard', 'binders-view:Novel:manuscript']), 'two views of the binder: a corkboard and a manuscript');
			await shot(p, `${tag}-2c-02-two-modes`);
			// a drag on the board moves the section
			const a = await p.at(`${pane(0)} .binders-card[data-path="Novel/Two.md"]`), b = await p.at(`${pane(0)} .binders-card[data-path="Novel/Three.md"]`);
			await pressAndMove(p, a.x, a.t + a.h - 14, b.x + b.w / 2 - 6, b.t + b.h - 14, 12);
			await touch(p, 'touchEnd');
			await p.sleep(1200);
			S.eq(j(names(await list(p, NNOTE)).slice(0, 4)), j(['One', 'Three', 'Two', 'Four']), 'a card dragged on the board');
			S.eq(j(await p.ev(`[...document.querySelectorAll('${pane(1)} .binders-manuscript-title')].map(e => e.textContent).slice(0, 4)`)), j(['One', 'Three', 'Two', 'Four']), 'moves its section in the manuscript beside it');
			// typing in the manuscript moves the card's count
			await tapEnd(p, `(${paneScene(1, 'Four')})`);
			await p.type(' Four more words typed.');
			await until(p, `/30 words/.test(document.querySelector('${pane(0)} .binders-card[data-path="Novel/Four.md"]')?.textContent ?? '')`, 5000);
			S.ok(/30 words/.test(await p.ev(`document.querySelector('${pane(0)} .binders-card[data-path="Novel/Four.md"]')?.textContent ?? ''`)), 'typing in the manuscript moves the card’s count beside it: ' + await p.ev(`document.querySelector('${pane(0)} .binders-card[data-path="Novel/Four.md"] .binders-card-words')?.textContent`));
			// typing in a section, and straight away its card renamed on the board
			await tapEnd(p, `(${paneScene(1, 'Five')})`);
			await p.type('UNSAVED');
			const c5 = await p.at(`${pane(0)} .binders-card[data-path="Novel/Five.md"]`);
			await hold(p, c5.x, c5.t + c5.h - 14);
			await pick(p, 'Rename');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			await keys(p, 'Fifth');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Fifth.md')`, 4000);
			await p.sleep(2600);
			S.eq(count(await read(p, 'Novel/Fifth.md').catch(() => ''), 'UNSAVED'), 1, 'a section typed in, then renamed from its card in the other pane straight away: what was typed is in the renamed note, once');
			S.ok((await p.ev(`[...document.querySelectorAll('${pane(1)} .binders-manuscript-title')].map(e => e.textContent)`)).includes('Fifth'), 'and its section has the new name');
			// typing in a section, and straight away its card deleted on the board
			await tapEnd(p, `(${paneScene(1, 'Six')})`);
			await p.type('GOING');
			const c6 = await p.at(`${pane(0)} .binders-card[data-path="Novel/Six.md"]`);
			await hold(p, c6.x, c6.t + c6.h - 14);
			await pick(p, 'Delete');
			await until(p, `!!document.querySelector('.modal .modal-button-container')`, 3000);
			await dialogTap(p, 'Delete');
			await until(p, `!app.vault.getAbstractFileByPath('Novel/Six.md')`, 4000);
			await p.sleep(600);
			S.eq(count(await p.ev(`app.vault.adapter.read('.trash/Six.md').catch(() => '')`), 'GOING'), 1, 'a section typed in, then deleted from the board straight away: the note in the trash has what was typed');
			S.ok(!(await p.ev(`[...document.querySelectorAll('${pane(1)} .binders-manuscript-title')].map(e => e.textContent)`)).includes('Six'), 'and its section is gone from the manuscript');
			// a card dragged over the other pane: nothing moves, nothing is left behind
			const order = await list(p, NNOTE);
			const c7 = await p.at(`${pane(0)} .binders-card[data-path="Novel/Seven.md"]`), other = await rect(p, `${pane(1)} .binders-manuscript`);
			await pressAndMove(p, c7.x, c7.t + c7.h - 14, other[0] + other[2] / 2, other[1] + other[3] / 2, 14);
			const over = await p.ev(`({ ghost: document.querySelectorAll('.binders-drag-ghost').length, line: !!document.querySelector('.binders-drop-indicator.is-active') })`);
			await shot(p, `${tag}-2c-03-drag-over-other-pane`);
			await touch(p, 'touchEnd');
			await p.sleep(900);
			S.ok(over.ghost === 1 && !over.line, 'over the other pane the card follows the finger with no line: ' + j(over));
			S.eq(j(await list(p, NNOTE)), j(order), 'and let go there, nothing moves');
			S.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-lifted, .binders-card.is-dragging').length`), 0, 'nor is anything left behind');
			S.eq(await menus(p) + await dialogs(p), 0, 'nothing left open');
		});
		S.done();
	});

	test(`${dev} 2d. the manuscript beside the same note in its own pane: typed in turn in both by touch, at a writer’s pace and then without a pause, every word is kept once, in both, and on disk`, async (p, h, t) => {
		const S = softly(t);
		await novel(p);
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			await setMode(p, 'manuscript');
			await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(app.vault.getAbstractFileByPath('Novel/One.md')); })().then(() => 1)`);
			await p.sleep(1200);
			S.eq(j(await markPanes(p)), j(['binders-view:Novel:manuscript', 'markdown:Novel/One.md']), 'the manuscript, and the note beside it');
			const tokens = [];
			for (const [pace, n] of [[700, 4], [0, 4]]) {
				for (let i = 0; i < n; i++) {
					const a = `n${pace ? 'slow' : 'fast'}${i} `, b = `m${pace ? 'slow' : 'fast'}${i} `;
					await tapEnd(p, `document.querySelector('${pane(1)} .cm-content')`);
					await p.type(a); tokens.push(a);
					if (pace) await p.sleep(pace);
					await tapEnd(p, `(${paneScene(0, 'One')})`);
					await p.type(b); tokens.push(b);
					if (pace) await p.sleep(pace);
				}
				await p.sleep(3200);
				await shot(p, `${tag}-2d-${pace ? 'paced' : 'fast'}`);
				const disk = split(await read(p, 'Novel/One.md')).body;
				const inNote = await p.ev(`document.querySelector('${pane(1)} .cm-content').innerText`), inMan = await p.ev(`(${paneScene(0, 'One')}).querySelector('.cm-content').innerText`);
				const wrong = tokens.filter((x) => count(disk, x.trim()) !== 1), wrongNote = tokens.filter((x) => count(inNote, x.trim()) !== 1), wrongMan = tokens.filter((x) => count(inMan, x.trim()) !== 1);
				S.ok(!wrong.length, `${pace ? 'at a writer’s pace' : 'without a pause'}: every word typed is on disk once (not once: ${j(wrong.map((x) => x.trim() + '×' + count(disk, x.trim())))}); the note’s end: ${j(disk.slice(TEXT('One').length - 12))}`);
				S.ok(!wrongNote.length, `… and in the note’s pane once (not: ${j(wrongNote.map((x) => x.trim() + '×' + count(inNote, x.trim())))})`);
				S.ok(!wrongMan.length, `… and in the manuscript once (not: ${j(wrongMan.map((x) => x.trim() + '×' + count(inMan, x.trim())))})`);
				S.ok(disk.startsWith(TEXT('One').trimEnd()), 'and the note’s own text is whole before them');
			}
		});
		S.done();
	});

	test(`${dev} 2e. turned on its side in the middle of an edit (a synopsis, a row’s target, a manuscript title, the manuscript’s text, a dialog half filled) and of a drag: what was typed is still in its field, typing carries on, it’s saved once, and a drag cut short by the turn leaves nothing behind`, async (p, h, t) => {
		const S = softly(t);
		await novel(p);
		const turned = [size[1], size[0]];
		const turn = async (to) => { await metrics(p, ...to); await p.sleep(900); };
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			// a synopsis
			const c = await p.at(card(N + 'Two.md'));
			await tap(p, c.x, c.t + c.h - 14);
			await tapEl(p, card(N + 'Two.md') + ' .binders-card-synopsis');
			await p.ev(`document.activeElement.select?.()`);
			await p.type('Half');
			await turn(turned);
			S.eq(j(await p.ev(`[document.activeElement.tagName, document.activeElement.value ?? null]`)), j(['TEXTAREA', 'Half']), 'a synopsis being typed is still open, with what was typed, after the turn');
			S.ok((await fieldInSight(p)).ok, 'and in sight: ' + j(await fieldInSight(p)));
			await shot(p, `${tag}-2e-01-synopsis-turned`);
			await p.type(' way');
			const o = await p.at(card(N + 'Nine.md')) ?? await p.at(card(N + 'Three.md'));
			await tap(p, o.x, o.t + o.h - 14);
			await p.sleep(400); await flush(p);
			S.eq((await fm(p, N + 'Two.md'))?.synopsis, 'Half way', 'typing carries on, and it’s saved once');
			// a row's target
			await turn(size);
			await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'target' }, { id: 'status' }] } }; v.setMode('outliner'); return 1; })()`);
			await p.sleep(600);
			const tc = await see(p, ocell(N + 'Three.md', 'target'));
			await tap(p, tc.x, tc.y); await tap(p, tc.x, tc.y);
			S.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'a row’s target opens');
			await p.type('15');
			await turn(turned);
			S.eq(j(await p.ev(`[document.activeElement.tagName, document.activeElement.value ?? null]`)), j(['INPUT', '15']), 'a target being typed is still open after the turn');
			await p.type('00');
			await p.key('Enter');
			await p.sleep(500); await flush(p);
			S.eq((await fm(p, N + 'Three.md'))?.target, 1500, 'and saved as typed');
			// a manuscript title, then its text
			await turn(size);
			await setMode(p, 'manuscript');
			const ti = await p.ev(`(() => { const r = (${scene('Four')}).querySelector('.binders-manuscript-title').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			await tap(p, ti.x, ti.y);
			S.ok(await p.ev(`document.activeElement.classList.contains('is-renaming')`), 'a tap on a title renames it');
			await p.type('Fou');
			await turn(turned);
			S.eq(j(await p.ev(`[document.activeElement.classList.contains('is-renaming'), document.activeElement.textContent]`)), j([true, 'Fou']), 'a title being typed is still open after the turn');
			await p.type('rth');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Fourth.md')`, 3000);
			S.ok(await exists(p, 'Novel/Fourth.md'), 'and renames the note as typed');
			await p.sleep(500);
			await tapEnd(p, `(${scene('Fourth')})`);
			await p.type('before the turn ');
			await turn(size);
			S.eq(await p.ev(`document.activeElement.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), 'Fourth', 'the caret is still in its section after the turn');
			const caret = await p.ev(`(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(), v = ${MAN}.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), view: [Math.round(v.top), Math.round(v.bottom)] }; })()`);
			S.ok(caret.top >= caret.view[0] && caret.bottom <= caret.view[1], 'and in sight: ' + j(caret));
			await p.type('and after it.');
			await until(p, `app.vault.adapter.read('Novel/Fourth.md').then(x => /and after it\\./.test(x))`, 6000);
			S.eq(count(await read(p, 'Novel/Fourth.md'), 'before the turn and after it.'), 1, 'typing carries on where it was, and is saved once');
			await p.ev(`document.activeElement?.blur?.()`);
			// a dialog half filled
			await setMode(p, 'corkboard');
			await p.ev(`app.commands.executeCommandById('binders:set-target')`);
			await until(p, `!!document.querySelector('.modal .binders-ask input')`);
			await p.sleep(300);
			await p.type('12');
			await turn(turned);
			S.eq(j(await p.ev(`[document.querySelectorAll('.modal-container').length, document.querySelector('.modal .binders-ask input')?.value, document.activeElement === document.querySelector('.modal .binders-ask input')]`)), j([1, '12', true]), 'a dialog half filled is still there after the turn, its field with the keyboard');
			const box = await p.ev(`(() => { const r = document.querySelector('.modal').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`);
			S.ok(box, 'and on the screen');
			await p.type('000');
			await dialogTap(p, 'Set target');
			await flush(p);
			S.eq((await fm(p, NNOTE))?.target, 12000, 'and sets what was typed');
			// a drag, turned in the middle
			await turn(size);
			await p.ev(`(() => { ${CORK}.scrollTop = 0; return 1; })()`);
			await p.sleep(300);
			const order = await list(p, NNOTE);
			const d = await p.at(card(N + 'One.md')), e = await p.at(card(N + 'Three.md'));
			await pressAndMove(p, d.x, d.t + d.h - 14, e.x, e.t + e.h - 14, 8);
			S.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 1, 'a card is being dragged');
			await turn(turned);
			await shot(p, `${tag}-2e-02-drag-turned`);
			const mid = await p.ev(`({ ghost: document.querySelectorAll('.binders-drag-ghost').length, ghostBox: (${R})(document.querySelector('.binders-drag-ghost > *')), inner: [innerWidth, innerHeight] })`);
			log(`${tag}: in the middle of a drag, after the turn:`, j(mid));
			// (a device cancels the touch when it turns)
			await touch(p, 'touchCancel');
			await p.sleep(900);
			S.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-lifted, .binders-card.is-dragging').length + (document.body.classList.contains('is-grabbing') ? 1 : 0)`), 0, 'a drag cut short by the turn leaves nothing behind');
			S.eq(j(await list(p, NNOTE)), j(order), 'and moves nothing');
			// and one finished after the turn: dropped where the finger is then
			const d2 = await p.at(card(N + 'One.md')), e2 = await p.at(card(N + 'Three.md'));
			await pressAndMove(p, d2.x, d2.t + d2.h - 14, e2.x, e2.t + e2.h - 14, 8);
			await turn(size);
			const e3 = await p.at(card(N + 'Three.md'));
			await touch(p, 'touchMove', e3.x + e3.w / 2 - 8, e3.t + e3.h - 14);
			await p.sleep(300);
			await touch(p, 'touchEnd');
			await p.sleep(1000);
			const now = await list(p, NNOTE);
			S.eq(j([...now].sort()), j([...order].sort()), 'a drag finished after a turn loses no note');
			S.eq(j(names(now).slice(0, 3)), j(['Two', 'Three', 'One']), 'and drops the card where the finger is then');
			S.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-lifted, .binders-card.is-dragging').length`), 0, 'with nothing left behind');
		});
		S.done();
	});
}


// =====================================================================================================================
// 3. Interruptions in the middle of an edit
// =====================================================================================================================

/** The app goes to the background, as a phone does it to a web view: the page is hidden, the window loses the focus,
    and the page may be put away. `keyboard`: the field loses the focus too, as when the system takes the keyboard down. */
const background = (p, keyboardGoes = false) => p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); if (${keyboardGoes}) document.activeElement?.blur?.(); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')); window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); return 1; })()`);
const foreground = async (p) => { await p.ev(`(() => { delete document.visibilityState; delete document.hidden; window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); return 1; })()`); await p.sleep(300); };
const away = async (p, keyboardGoes = false, ms = 1200) => { await background(p, keyboardGoes); await p.sleep(ms); await foreground(p); };
const openFields = (p) => p.ev(`document.querySelectorAll('.binders-edit-field, .binders-view .is-renaming').length`);
const active = (p) => p.ev(`(() => { const a = document.activeElement; return { tag: a.tagName, value: a.value ?? (a.isContentEditable ? a.textContent : null), renaming: a.classList.contains('is-renaming') }; })()`);

for (const [dev, size] of [['phone (390 × 844)', PHONE], ['tablet upright (820 × 1180)', TABLET]]) {
	const tag = (size === PHONE ? '' : 't') + size[0];

	test(`${dev} 3a. the app goes to the background and comes back in the middle of each kind of edit (a card’s title, a synopsis, a row’s target, a “New note” name, a manuscript title, the manuscript’s text, a dialog half filled): the field is as it was left, typing carries on, and what’s saved is saved once`, async (p, h, t) => {
		const S = softly(t);
		await novel(p);
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			// a card's title
			await cardMenu(p, N + 'One.md');
			await pick(p, 'Rename');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			await p.type('Fir');
			await away(p);
			S.eq(j(await active(p)), j({ tag: 'INPUT', value: 'Fir', renaming: false }), 'a card’s title: still open, as typed');
			await p.type('st');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/First.md')`, 3000);
			S.ok(await exists(p, 'Novel/First.md') && !(await exists(p, 'Novel/Fir.md')) && !(await exists(p, 'Novel/One.md')), 'and renamed once, to what was typed in the end');
			// a synopsis
			const c = await see(p, card(N + 'Two.md'));
			await tap(p, c.x, c.t + c.h - 14);
			await tapEl(p, card(N + 'Two.md') + ' .binders-card-synopsis');
			await p.ev(`document.activeElement.select?.()`);
			await p.type('Before');
			await away(p);
			S.eq(j(await active(p)), j({ tag: 'TEXTAREA', value: 'Before', renaming: false }), 'a synopsis: still open, as typed');
			await p.type(' and after.');
			const o = await p.at(card(N + 'Three.md'));
			await tap(p, o.x, o.t + o.h - 14);
			await p.sleep(400); await flush(p);
			S.eq((await fm(p, N + 'Two.md'))?.synopsis, 'Before and after.', 'and saved once');
			// the "New note" tile
			await tapEl(p, `${LEAF} .binders-new-button`);
			await pick(p, 'New note');
			await p.type('Twenty');
			await away(p);
			S.eq(j(await active(p)), j({ tag: 'INPUT', value: 'Twenty', renaming: false }), 'a new note’s name: still open, as typed');
			await p.type(' one');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Twenty one.md')`, 3000);
			await p.key('Escape');
			await p.sleep(300);
			S.eq(await p.ev(`app.vault.getMarkdownFiles().filter(f => /^Novel\\/Twenty/.test(f.path)).map(f => f.basename).sort().join()`), 'Twenty,Twenty one', 'and one note made, with the whole name');
			// a row's target
			await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'target' }, { id: 'status' }] } }; v.setMode('outliner'); return 1; })()`);
			await p.sleep(600);
			const tc = await see(p, ocell(N + 'Three.md', 'target'));
			await tap(p, tc.x, tc.y); await tap(p, tc.x, tc.y);
			await p.type('25');
			await away(p);
			S.eq(j(await active(p)), j({ tag: 'INPUT', value: '25', renaming: false }), 'a row’s target: still open, as typed');
			await p.type('00');
			await p.key('Enter');
			await p.sleep(400); await flush(p);
			S.eq((await fm(p, N + 'Three.md'))?.target, 2500, 'and saved as typed in the end');
			// a manuscript title
			await setMode(p, 'manuscript');
			const ti = await p.ev(`(() => { const e = (${scene('Four')}).querySelector('.binders-manuscript-title'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			await tap(p, ti.x, ti.y);
			await p.type('Fou');
			await away(p);
			S.eq(j(await active(p)), j({ tag: 'DIV', value: 'Fou', renaming: true }), 'a manuscript title: still open, as typed');
			await p.type('rth');
			await p.key('Enter');
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Fourth.md')`, 3000);
			S.ok(await exists(p, 'Novel/Fourth.md') && !(await exists(p, 'Novel/Fou.md')), 'and renamed once');
			await p.sleep(500);
			// the manuscript's text
			await tapEnd(p, `(${scene('Fourth')})`);
			await p.type('typed, then away ');
			await away(p, false, 2500);
			S.eq(await p.ev(`document.activeElement.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), 'Fourth', 'the manuscript: the caret is where it was');
			await p.type('and back.');
			await until(p, `app.vault.adapter.read('Novel/Fourth.md').then(x => /and back\\./.test(x))`, 6000);
			S.eq(count(await read(p, 'Novel/Fourth.md'), 'typed, then away and back.'), 1, 'and what was typed before and after is in the note, once');
			await p.ev(`document.activeElement?.blur?.()`);
			// a dialog half filled
			await p.ev(`app.commands.executeCommandById('binders:set-target')`);
			await until(p, `!!document.querySelector('.modal .binders-ask input')`);
			await p.sleep(300);
			await p.type('77');
			await away(p);
			S.eq(j(await p.ev(`[document.querySelectorAll('.modal-container').length, document.querySelector('.modal .binders-ask input')?.value, document.activeElement === document.querySelector('.modal .binders-ask input')]`)), j([1, '77', true]), 'a dialog half filled: still there, its field with the keyboard');
			await p.type('7');
			await dialogTap(p, 'Set target');
			await flush(p);
			S.eq((await fm(p, NNOTE))?.target, 777, 'and sets what was typed in the end');
			S.eq(await openFields(p) + await menus(p) + await dialogs(p), 0, 'nothing is left open');
			await shot(p, `${tag}-3a-end`);
		});
		S.done();
	});

	test(`${dev} 3b. the same, when the system takes the keyboard away with the app (the field loses the focus): what was typed is saved as it stands, nothing is lost or made twice, no field is left stuck open, and the edit can be taken up again`, async (p, h, t) => {
		const S = softly(t);
		await novel(p);
		await onDevice(p, size, async () => {
			await open(p, 'Novel');
			await cardMenu(p, N + 'One.md');
			await pick(p, 'Rename');
			await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
			await p.type('First');
			await away(p, true);
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/First.md')`, 3000);
			S.ok(await exists(p, 'Novel/First.md'), 'a card’s title: renamed to what was typed');
			S.eq(await openFields(p), 0, 'and its field is closed');
			const c = await see(p, card(N + 'Two.md'));
			await tap(p, c.x, c.t + c.h - 14);
			await tapEl(p, card(N + 'Two.md') + ' .binders-card-synopsis');
			await p.ev(`document.activeElement.select?.()`);
			await p.type('Left half');
			await away(p, true);
			await flush(p);
			S.eq((await fm(p, N + 'Two.md'))?.synopsis, 'Left half', 'a synopsis: saved as it stood');
			S.eq(await openFields(p), 0, 'and its field is closed');
			S.eq(j(await selected(p)), j([N + 'Two.md']), 'with its card still selected, to carry on from');
			await tapEl(p, card(N + 'Two.md') + ' .binders-card-synopsis');
			await p.type(' done');
			const o = await p.at(card(N + 'Three.md'));
			await tap(p, o.x, o.t + o.h - 14);
			await p.sleep(400); await flush(p);
			S.eq((await fm(p, N + 'Two.md'))?.synopsis, 'Left half done', 'taken up again where it was left');
			// a new note's name, half typed: the note is made with it (nothing typed is dropped), once
			await tapEl(p, `${LEAF} .binders-new-button`);
			await pick(p, 'New note');
			await p.type('Half a na');
			await away(p, true);
			await p.sleep(500);
			S.eq(await p.ev(`app.vault.getMarkdownFiles().filter(f => /^Novel\\/Half/.test(f.path)).map(f => f.basename).join()`), 'Half a na', 'a new note’s name: a note is made with what was typed, once');
			S.eq(await openFields(p), 0, 'and the tile is a tile again');
			// the manuscript
			await setMode(p, 'manuscript');
			await tapEnd(p, `(${scene('Three')})`);
			await p.type('gone with the keyboard');
			await background(p, true);
			await p.sleep(400);
			const hidden = await read(p, 'Novel/Three.md');
			await p.sleep(800);
			await foreground(p);
			S.eq(count(hidden, 'gone with the keyboard'), 1, 'the manuscript: when its editor loses the focus, what was typed is written at once');
			S.eq(count(await read(p, 'Novel/Three.md'), 'gone with the keyboard'), 1, 'and is there once');
			const ti = await p.ev(`(() => { const e = (${scene('Four')}).querySelector('.binders-manuscript-title'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			await tap(p, ti.x, ti.y);
			await p.type('Fourth');
			await away(p, true);
			await until(p, `!!app.vault.getAbstractFileByPath('Novel/Fourth.md')`, 3000);
			S.ok(await exists(p, 'Novel/Fourth.md'), 'a manuscript title: renamed to what was typed');
			S.eq(await openFields(p), 0, 'and not left open');
			// a dialog: it stays, with what was typed
			await p.ev(`app.commands.executeCommandById('binders:set-target')`);
			await until(p, `!!document.querySelector('.modal .binders-ask input')`);
			await p.sleep(300);
			await p.type('4500');
			await away(p, true);
			S.eq(j(await p.ev(`[document.querySelectorAll('.modal-container').length, document.querySelector('.modal .binders-ask input')?.value]`)), j([1, '4500']), 'a dialog: still there with what was typed');
			await dialogTap(p, 'Set target');
			await flush(p);
			S.eq((await fm(p, NNOTE))?.target, 4500, 'and its button still works');
			S.eq(await openFields(p) + await menus(p) + await dialogs(p), 0, 'nothing is left open');
		});
		S.done();
	});
}

test('phone 3c. the drawer opened, and the mode switched, in the middle of each kind of edit: what was typed is saved (or still in its field), never lost or doubled, and no field is left open behind the drawer or in a mode that’s gone', async (p, h, t) => {
	const S = softly(t);
	await novel(p);
	await onDevice(p, PHONE, async () => {
		await open(p, 'Novel');
		const toggle = async () => { const b = await p.at('.workspace-leaf.mod-active .view-header .sidebar-toggle-button, .view-header-left .clickable-icon, .mod-left.sidebar-toggle-button') ?? { x: 34, y: 81 }; await tap(p, b.x, b.y); await p.sleep(700); };
		const shut = async () => { await p.ev(`(() => { app.workspace.leftSplit.collapse(); return 1; })()`); await p.sleep(600); };
		// --- the drawer ---
		const c = await see(p, card(N + 'Two.md'));
		await tap(p, c.x, c.t + c.h - 14);
		await tapEl(p, card(N + 'Two.md') + ' .binders-card-synopsis');
		await p.ev(`document.activeElement.select?.()`);
		await p.type('Typed, then the drawer.');
		await toggle();
		S.ok(await drawerOpen(p), 'the drawer’s button opens it while a synopsis is being typed');
		await shot(p, 'phone-3c-01-drawer-over-synopsis');
		await flush(p);
		const st = { saved: (await fm(p, N + 'Two.md'))?.synopsis ?? null, open: await openFields(p), focus: await focusIs(p) };
		log('phone: the drawer opened over a synopsis being typed:', j(st));
		S.ok(st.saved === 'Typed, then the drawer.' || st.open === 1, 'the synopsis is saved, or still in its field');
		// (typing now mustn't go into a field hidden behind the drawer)
		await p.type('X');
		await shut();
		await p.sleep(300);
		const c3 = await see(p, card(N + 'Three.md'));
		await tap(p, c3.x, c3.t + c3.h - 14);
		await p.sleep(400); await flush(p);
		S.eq((await fm(p, N + 'Two.md'))?.synopsis, 'Typed, then the drawer.', 'and a key pressed with the drawer open doesn’t go into the card behind it');
		// the manuscript's text
		await setMode(p, 'manuscript');
		await tapEnd(p, `(${scene('Three')})`);
		await p.type('typed, then the drawer');
		await toggle();
		await p.sleep(400);
		S.eq(count(await read(p, 'Novel/Three.md'), 'typed, then the drawer'), 1, 'the manuscript: what was typed is written when the drawer opens');
		await p.type('Y');
		await shut();
		await p.sleep(2600);
		S.eq(count(await read(p, 'Novel/Three.md'), 'Y'), 0, 'and a key pressed with the drawer open doesn’t go into the page behind it');
		// a manuscript title
		const ti = await p.ev(`(() => { const e = (${scene('Four')}).querySelector('.binders-manuscript-title'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		await tap(p, ti.x, ti.y);
		await p.type('Fourth');
		await toggle();
		await until(p, `!!app.vault.getAbstractFileByPath('Novel/Fourth.md')`, 3000);
		S.ok(await exists(p, 'Novel/Fourth.md') || (await active(p)).value === 'Fourth', 'a manuscript title: renamed, or still being typed');
		await shut();
		S.eq(await openFields(p), 0, 'no field is left open');
		// --- the mode switched under an edit (a command's hotkey on a keyboard, or the commands above) ---
		await setMode(p, 'corkboard');
		await cardMenu(p, N + 'Five.md');
		await pick(p, 'Rename');
		await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
		await p.type('Fifth');
		await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
		await until(p, `!!app.vault.getAbstractFileByPath('Novel/Fifth.md')`, 3000);
		S.ok(await exists(p, 'Novel/Fifth.md'), 'a card’s title being typed when the mode changes: the note is renamed');
		await p.sleep(400);
		// outliner: a synopsis
		await rowMenu(p, N + 'Seven.md');
		await pick(p, 'Edit synopsis');
		await p.ev(`document.activeElement.select?.()`);
		await p.type('Row synopsis, then the manuscript.');
		await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
		await p.sleep(1200); await flush(p);
		S.eq((await fm(p, N + 'Seven.md'))?.synopsis, 'Row synopsis, then the manuscript.', 'a row’s synopsis being typed when the mode changes is saved');
		// manuscript: text, then straight to the corkboard
		await tapEnd(p, `(${scene('Eight')})`);
		await p.type('typed, then the corkboard');
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
		await p.sleep(600);
		S.eq(count(await read(p, 'Novel/Eight.md'), 'typed, then the corkboard'), 1, 'the manuscript’s text typed just before the mode changes is in the note, once');
		// the tile, half typed
		await tapEl(p, `${LEAF} .binders-new-button`);
		await pick(p, 'New note');
		await p.type('Half typed');
		await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
		await p.sleep(900);
		const made = await p.ev(`app.vault.getMarkdownFiles().filter(f => /^Novel\\/Half/.test(f.path)).map(f => f.basename).join()`);
		log('phone: a new note’s name half typed when the mode changes makes:', j(made));
		S.ok(made === 'Half typed' || made === '', 'a new note’s name half typed when the mode changes: one note with that name, or none (never two, never “Untitled”)');
		S.eq(await p.ev(`app.vault.getMarkdownFiles().filter(f => /Untitled/.test(f.path)).length`), 0, 'no “Untitled” is left');
		S.eq(await openFields(p) + await menus(p) + await dialogs(p), 0, 'nothing is left open');
	});
	S.done();
});


// =====================================================================================================================
// 4. What the README says, on a phone
// =====================================================================================================================

test('phone 4. the README’s “Getting started” and “On phones and tablets”, sentence by sentence: a folder made a binder keeps the order it showed in; “New binder” is in the right menus; a tap opens the corkboard and doesn’t fold, another folds; “New scene here” from the menu and the palette; the synopsis under the toolbar; a folder’s stack and the way back out; “Open binder” selects the note’s card; menus are sheets; the manuscript has Obsidian’s toolbar', async (p, h, t) => {
	const S = softly(t);
	await p.ev(`(async () => { await app.vault.createFolder('Plain'); for (const n of ['b', 'a', 'c']) await app.vault.create('Plain/' + n + '.md', n + ' text\\n'); await app.vault.createFolder('Plain/sub'); await app.vault.create('Plain/sub/x.md', 'x\\n'); })().then(() => 1)`);
	await onDevice(p, PHONE, async () => {
		// "Right-click a folder … Make this folder a binder. Its notes and subfolders keep the order they show in now."
		await showExplorer(p, ['Plain']);
		const shown = (await explorerOrder(p, 'Plain')).map((x) => x.split('/').pop().replace(/\.md$/, ''));
		await explorerMenu(p, 'Plain');
		const plain = await menuItems(p);
		S.ok(isSheet(await sheet(p)), 'a folder’s menu is a sheet');
		S.ok(plain.includes('Make this folder a binder'), '“Make this folder a binder” is in a plain folder’s menu');
		// "New binder, beside New note and New folder … (and of any folder that isn't in a binder)"
		S.ok(plain.indexOf('New binder') > plain.indexOf('New folder') && plain.indexOf('New folder') > plain.indexOf('New note') && plain.indexOf('New note') >= 0, '“New binder” is there, after “New note” and “New folder”: ' + j(plain.slice(0, 8)));
		await pick(p, 'Make this folder a binder');
		await until(p, `!!app.vault.getAbstractFileByPath('Plain/Plain.md')`, 3000);
		await p.sleep(400);
		S.eq(j((await list(p, 'Plain/Plain.md')).filter((x) => !x.includes('/x')).map((x) => x.replace(/\/$/, ''))), j(shown), 'the binder’s order is the one the folder showed in');
		S.ok(/“Plain” is now a binder/.test(await notices(p)), 'and it says so');
		await explorerMenu(p, 'The Lighthouse');
		const binder = await menuItems(p);
		S.ok(!binder.includes('New binder') && !binder.includes('Make this folder a binder'), 'a binder’s own menu has neither');
		for (const x of ['Open binder', 'New scene here', 'Export...']) S.ok(binder.includes(x), `but has “${x}”`);
		await gone(p);
		// "Click the folder. The binder view opens on it, as a corkboard. A click that opens a folder's view doesn't fold the folder; click it again, or its arrow, to fold it."
		const folded = () => p.ev(`app.workspace.getLeavesOfType('file-explorer')[0].view.fileItems['The Lighthouse'].collapsed`);
		await tapEl(p, explorerRow('The Lighthouse'));
		await until(p, `${VIEW}?.folder?.path === 'The Lighthouse'`, 3000);
		await p.sleep(500);
		S.eq(j([(await viewState(p))?.mode, await folded()]), j(['corkboard', false]), 'a tap opens the binder as a corkboard, unfolded');
		await showExplorer(p);
		await tapEl(p, explorerRow('The Lighthouse'));
		await p.sleep(700);
		S.eq(await folded(), true, 'a second tap folds it');
		const ch = await p.at(explorerRow('The Lighthouse') + ' .collapse-icon');
		await tap(p, ch.x, ch.y);
		await p.sleep(500);
		S.eq(await folded(), false, 'and its arrow unfolds it');
		// "New scene here in the folder's right-click menu or the command palette"
		await p.ev(`(() => { app.workspace.leftSplit.collapse(); return 1; })()`);
		await p.sleep(500);
		await p.ev(`(() => { document.activeElement?.blur?.(); ${VIEW}.focusMode(); return 1; })()`);
		S.ok(await palette(p, 'New scene here'), '“New scene here” is in the palette with the binder view in front');
		await p.sleep(600);
		S.eq(await p.ev(`document.activeElement.tagName + ':' + (document.activeElement.value ?? '')`), 'INPUT:', 'and opens the “New note” tile to be named');
		await p.type('From the palette');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'From the palette.md')})`, 3000);
		await p.key('Escape');
		S.eq((await list(p)).pop(), 'From the palette', 'the note is made at the end');
		// "Click the text under the toolbar to write a synopsis of the binder or folder."
		await tapEl(p, `${LEAF} .binders-view-synopsis`);
		S.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', 'a tap under the toolbar opens the binder’s synopsis');
		await p.type('A keeper and a storm.');
		const c = await see(p, card(L + 'Prologue.md'));
		await tap(p, c.x, c.t + c.h - 14);
		await p.sleep(400); await flush(p);
		S.eq((await fm(p, L + 'The Lighthouse.md'))?.synopsis, 'A keeper and a storm.', 'which is kept in the binder note');
		// "A folder is one card too, drawn as a stack … double-click it (or tap its name) to go into it, and use the
		// breadcrumb above the board to come back out"
		S.eq(j((await cardsIn(p)).map((x) => x.slice(L.length))), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md', 'From the palette.md']), 'the board is the binder’s own items, each folder one card');
		S.eq(await stackCount(p, L + 'Part One'), '3 notes · 51 words', 'a folder’s stack says what it holds');
		await tapEl(p, card(L + 'Part One') + ' .binders-card-title');
		await until(p, `${VIEW}?.folder?.path === ${j(L + 'Part One')}`, 3000);
		S.eq((await viewState(p))?.folder, L + 'Part One', 'a tap on a stack’s name goes into the folder');
		await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === 3`, 3000);
		S.eq(j((await cardsIn(p)).map((x) => x.split('/').pop())), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'whose notes are its board');
		await upOut(p);
		S.eq((await viewState(p))?.folder, 'The Lighthouse', 'the way up in the toolbar comes back out');
		await tapEl(p, card(L + 'Part One') + ' .binders-card-title');
		await until(p, `${VIEW}?.folder?.path === ${j(L + 'Part One')}`, 3000);
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `${VIEW}?.folder?.path === 'The Lighthouse'`, 3000);
		S.eq((await viewState(p))?.folder, 'The Lighthouse', 'and so does Back');
		// "Open binder opens the binder view from any note in it, with that note's card selected."
		await tapEl(p, card(L + 'Part One') + ' .binders-card-title');
		await until(p, `!!document.querySelector(${j(card(L + 'Part One/The keeper.md'))})`, 3000);
		await p.sleep(400);
		await tapEl(p, card(L + 'Part One/The keeper.md') + ' .binders-card-title');
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Part One/The keeper.md')}`, 3000);
		S.ok(await palette(p, 'Open binder'), '“Open binder” is in the palette from a note of the binder');
		await until(p, `${VIEW}?.folder?.path === ${j(L + 'Part One')}`, 3000);
		await p.sleep(500);
		S.eq(j(await selected(p)), j([L + 'Part One/The keeper.md']), 'and shows the note’s folder with its card selected');
		// "the manuscript uses Obsidian's editor and its toolbar"
		await setMode(p, 'manuscript');
		await tapEnd(p, `(${scene('The keeper')})`);
		S.ok(await p.ev(`(() => { const r = document.querySelector('.mobile-toolbar')?.getBoundingClientRect(); return !!r && r.height > 0; })()`), 'with the caret in the manuscript, Obsidian’s editing toolbar shows');
		S.eq(await p.ev(`app.workspace.activeEditor?.file?.path ?? null`), L + 'Part One/The keeper.md', 'on that section’s note');
	});
	S.done();
});

ux('phone: the README’s “The word count shows the target of the binder or folder, if it has one, with a bar for how far along it is. Click the word count in the toolbar to set the target” holds on a phone (at 390 px the bar is hidden; at 320 px the count is too, in every mode, so there’s nothing to see or tap)', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('The Lighthouse/The Lighthouse.md'), fm => { fm.target = 200; }).then(() => 1)`);
	const seen = {};
	await onDevice(p, PHONE, async () => {
		for (const [w, hh] of [PHONE, SMALL]) {
			await metrics(p, w, hh);
			await p.sleep(400);
			await open(p);
			await p.sleep(500);
			seen[w] = await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-word-count'), pr = document.querySelector('${LEAF} .binders-progress'); return { count: e.textContent, countWidth: Math.round(e.getBoundingClientRect().width), barWidth: Math.round(pr.getBoundingClientRect().width) }; })()`);
			await shot(p, `ux-word-count-${w}`);
		}
	});
	t.ok(seen[390].countWidth > 0 && seen[320].countWidth > 0, 'the count shows at both widths: ' + j(seen));
	t.ok(seen[390].barWidth > 0 || / \/ /.test(seen[390].count), 'at 390 px its bar shows, or (no room for it) the count itself says the target: ' + j(seen));
});

ux('phone outliner: the README’s “Rows in the outliner work the same way” (tap to select, then tap its synopsis to edit it) holds for a row that has no synopsis yet, as it does for such a card (the selected row shows nowhere to tap: only “Edit synopsis” in its menu opens one)', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')}), fm => { delete fm.synopsis; }).then(() => 1)`);
	await onDevice(p, PHONE, async () => {
		await open(p);
		// the card first: a tap on it, then a tap where its synopsis would be
		const c = await see(p, card(L + 'Epilogue.md'));
		await tap(p, c.x, c.t + c.h - 14);
		await tapEl(p, card(L + 'Epilogue.md') + ' .binders-card-synopsis');
		t.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', 'a selected card without a synopsis has somewhere to tap for one');
		await p.key('Escape');
		await setMode(p, 'outliner');
		const r = await see(p, ocell(L + 'Epilogue.md', 'label'));
		await tap(p, r.x, r.y);
		await p.sleep(300);
		await shot(p, 'ux-row-no-synopsis');
		const syn = await p.at(orow(L + 'Epilogue.md') + ' .binders-outliner-synopsis');
		t.ok(!!syn && syn.h >= 16, 'a selected row without a synopsis shows where to tap for one: ' + j(await rect(p, orow(L + 'Epilogue.md') + ' .binders-outliner-synopsis')));
	});
});

ux('phone: several cards (or rows) can be selected by touch, so “Merge notes”, “New folder from selection” and moving several together can be reached (README: “Select several notes and their menu offers to merge them”; a tap selects one and there is no other way: no “Select” in the menu, no selection mode)', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const a = await see(p, card(L + 'Part One/Arrival.md')), b = await p.at(card(L + 'Part One/The keeper.md'));
		await tap(p, a.x, a.t + a.h - 14);
		await hold(p, b.x, b.t + b.h - 14);
		const items = await menuItems(p);
		await shot(p, 'ux-no-multi-select');
		await gone(p);
		// (whatever the way is: a held card joining the selection, or an item that starts selecting)
		const two = (await selected(p)).length > 1, way = items.find((x) => /^Select|New folder from selection|^Merge \d/i.test(x));
		t.ok(two || !!way, `with one card selected and another held, the selection is ${j(await selected(p))} and the menu offers ${j(items.filter((x) => !/^(Open|Bookmark|Copy|Make|Move file|Reveal|Show)/.test(x)))}`);
	});
});

// =====================================================================================================================
// 5. The same action in each mode, on a phone
// =====================================================================================================================

test('phone 5. one note’s menu in each mode and in the file explorer: the same words for the same things, in the same order; where “New” puts a note with something selected; what’s in view after a change of mode; and each mode back where it was after a look at another, and after a note is opened and Back', async (p, h, t) => {
	const S = softly(t);
	await novel(p, { chapters: true });
	await onDevice(p, PHONE, async () => {
		await open(p, 'Novel');
		const own = (items) => items.filter((x) => !/^(Bookmark|Copy|Make a copy|Move file to|Reveal|Show in system|Open in default|Merge entire|Add to|Duplicate tab|Share|Open version|Search)/.test(x) && !/files?, \d+ folder/.test(x));
		const menu = {};
		// (one note, on its chapter's board, and in that chapter's outliner and manuscript)
		await intoStack(p, 'Novel/Chapter 1');
		await cardMenu(p, 'Novel/Chapter 1/Two.md');
		menu.card = own(await menuItems(p)); await gone(p);
		await modeByTouch(p, 'Outliner');
		await rowMenu(p, 'Novel/Chapter 1/Two.md');
		menu.row = own(await menuItems(p)); await gone(p);
		await modeByTouch(p, 'Manuscript');
		await titleMenu(p, 'Two');
		menu.title = own(await menuItems(p)); await gone(p);
		await showExplorer(p, ['Novel', 'Novel/Chapter 1']);
		await explorerMenu(p, 'Novel/Chapter 1/Two.md');
		menu.explorer = own(await menuItems(p)); await gone(p);
		await p.ev(`(() => { app.workspace.leftSplit.collapse(); return 1; })()`);
		await p.sleep(500);
		log('menus of one note:', j(menu));
		S.eq(j(menu.row), j(menu.card), 'a row’s menu is its card’s, item for item');
		const common = menu.card.filter((x) => menu.title.includes(x));
		S.eq(j(menu.title.filter((x) => menu.card.includes(x))), j(common), 'what a manuscript title’s menu shares with them is in the same order');
		for (const x of ['Open', 'Rename', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in export', 'Move up', 'Move down', 'Delete']) S.ok(menu.title.includes(x) && menu.card.includes(x), `“${x}” is in all three`);
		S.eq(j(menu.card.filter((x) => !menu.title.includes(x))), j(['Select more', 'Edit synopsis']), 'only “Select more” (a card or a row is selected, a section isn’t) and “Edit synopsis” (it shows none) are missing from the manuscript’s');
		S.eq(j(menu.title.filter((x) => !menu.card.includes(x))), j(['New note after this']), 'and only “New note after this” is the manuscript’s alone');
		for (const x of ['Move up', 'Move down']) S.ok(menu.explorer.includes(x), `the explorer’s has “${x}” in the same words`);
		// --- where New puts a note, with something selected ---
		await modeByTouch(p, 'Corkboard');
		const c = await see(p, card('Novel/Chapter 1/Two.md'));
		await tap(p, c.x, c.t + c.h - 14);
		await tapEl(p, `${LEAF} .binders-new-button`);
		await pick(p, 'New note');
		await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
		const tileIn = await p.ev(`document.activeElement.closest('.binders-card-new')?.dataset.new ?? null`);
		await p.type('From the board');
		await p.key('Enter');
		await until(p, `app.vault.getMarkdownFiles().some(f => f.basename === 'From the board')`, 3000);
		await p.key('Escape');
		await p.sleep(400);
		const l1 = await list(p, NNOTE);
		log('corkboard: with “Two” (Chapter 1) selected, New → New note made', l1.find((x) => /From the board/.test(x)), 'at', l1.findIndex((x) => /From the board/.test(x)), 'of', l1.length, '(tile:', j(tileIn), ')');
		S.eq(tileIn, null, 'corkboard: with a card selected, the new note is named on a card of its own, not in the tile at the board’s end');
		await modeByTouch(p, 'Outliner');
		const r = await see(p, ocell('Novel/Chapter 1/Two.md', 'label'));
		await tap(p, r.x, r.y);
		await tapEl(p, `${LEAF} .binders-new-button`);
		await pick(p, 'New note');
		await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
		await p.type('From the outliner');
		await p.key('Enter');
		await until(p, `app.vault.getMarkdownFiles().some(f => f.basename === 'From the outliner')`, 3000);
		await p.sleep(400);
		const l2 = await list(p, NNOTE);
		log('outliner: with “Two” selected, New → New note made', l2.find((x) => /From the outliner/.test(x)), 'at', l2.findIndex((x) => /From the outliner/.test(x)));
		S.eq(l2[l2.indexOf('Chapter 1/Two') + 1], 'Chapter 1/From the outliner', 'outliner: New puts the note after the selected row');
		S.eq(l1[l1.indexOf('Chapter 1/Two') + 1], 'Chapter 1/From the board', 'corkboard: New puts the note after the selected card, as the outliner does after the selected row');
		// --- what's in view after a change of mode ---
		await modeByTouch(p, 'Corkboard');
		await upOut(p);
		await intoStack(p, 'Novel/Chapter 3');
		const far = await see(p, card('Novel/Chapter 3/Sixteen.md'));
		await tap(p, far.x, far.t + far.h - 14);
		await modeByTouch(p, 'Outliner');
		const inView = (sel) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const r = e.getBoundingClientRect(), nav = document.querySelector('.mobile-navbar')?.getBoundingClientRect(), top = document.querySelector('${LEAF} .binders-mode').getBoundingClientRect().top; return { top: Math.round(r.top), bottom: Math.round(r.bottom), ok: r.top >= top && r.bottom <= (nav?.height ? nav.top : innerHeight) }; })()`);
		S.eq(j(await selected(p)), j(['Novel/Chapter 3/Sixteen.md']), 'the card selected on the corkboard is the row selected in the outliner');
		const rv = await inView(orow('Novel/Chapter 3/Sixteen.md'));
		log('phone: the row a change of mode goes to is at', j(rv), '(the navigation bar starts at', await navbarTop(p), ')');
		await shot(p, 'phone-5-01-outliner-after-switch');
		// --- each mode back where it was (in the binder itself: all its notes in the outliner and the manuscript) ---
		await setMode(p, 'corkboard');
		await upOut(p);
		await p.ev(`(() => { ${CORK}.scrollTop = 900; return 1; })()`);
		await p.sleep(400);
		const corkTop = await p.ev(`${CORK}.scrollTop`);
		S.ok(corkTop > 20, `the binder’s own board scrolls on a phone (to ${corkTop})`);
		await setMode(p, 'outliner');
		log('phone: outliner, on arriving from the corkboard: scroll', await p.ev(`${OUT}.scrollTop`), 'selected', j(await selected(p)));
		await p.ev(`(() => { ${OUT}.scrollTop = 300; return 1; })()`);
		await p.sleep(400);
		// (a row in sight selected: with the selected row out of sight the outliner jumps back to it, see the BUG test)
		const mid = await p.ev(`(() => { const r = [...document.querySelectorAll('${LEAF} .binders-outliner-row:not(.is-folder)')].find(e => e.getBoundingClientRect().top > 330); const c = r.querySelector('.binders-outliner-cell[data-col="label"]').getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; })()`);
		await tap(p, mid.x, mid.y);
		const picked = (await selected(p))[0];
		const outTop = await p.ev(`${OUT}.scrollTop`);
		await setMode(p, 'manuscript');
		await p.sleep(800);
		await p.ev(`(() => { ${MAN}.scrollTop = 1500; return 1; })()`);
		await p.sleep(3000);
		const manTop = await p.ev(`(() => { const top = ${MAN}.getBoundingClientRect().top; const s = [...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(e => e.getBoundingClientRect().bottom > top + 1); return s.querySelector('.binders-manuscript-title').textContent; })()`);
		await setMode(p, 'corkboard');
		await p.sleep(700);
		S.ok(Math.abs((await p.ev(`${CORK}.scrollTop`)) - corkTop) <= 40, `the corkboard is back where it was after a look at the others (${corkTop} → ${await p.ev(`${CORK}.scrollTop`)})`);
		await setMode(p, 'outliner');
		await p.sleep(500);
		// (the outliner comes back some way off: see the BUG test below)
		log(`phone: the outliner, left at ${outTop} px with a row in sight selected, comes back at`, await p.ev(`${OUT}.scrollTop`));
		await setMode(p, 'manuscript');
		await p.sleep(2500);
		const manNow = () => p.ev(`(() => { const top = ${MAN}.getBoundingClientRect().top; const s = [...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(e => e.getBoundingClientRect().bottom > top + 1); return s.querySelector('.binders-manuscript-title').textContent; })()`);
		// (the row tapped in the outliner is where the writer went last: one selection across the modes, so that's the
		// section the manuscript comes back on, not where it was scrolled to before)
		const pickedName = picked.split('/').pop().replace(/\.md$/, '');
		S.ok(await p.ev(`(() => { const s = ${scene(pickedName)}; if (!s) return false; const r = s.getBoundingClientRect(), top = ${MAN}.getBoundingClientRect().top; return r.bottom > top + 1 && r.top < innerHeight - 90; })()`), `and the manuscript, on the section of the row tapped in the outliner (“${pickedName}”; it was left at “${manTop}”, and shows “${await manNow()}” first)`);
		// a note opened from the manuscript (its title's menu), and Back
		await titleMenu(p, manTop);
		const manAt = await manNow(); // (asking for the menu brought the title to the middle of the screen)
		await pick(p, 'Open');
		await until(p, `app.workspace.getActiveFile()?.basename === ${j(manTop)}`, 3000);
		await p.sleep(500);
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `!!document.querySelector('${LEAF} .binders-manuscript-scene')`, 4000);
		await p.sleep(1500);
		S.eq((await viewState(p))?.mode, 'manuscript', 'Back from a note opened in the manuscript returns to the manuscript');
		S.eq(await manNow(), manAt, 'at the same section');
		// … and the other modes are still where they were
		await setMode(p, 'corkboard');
		await p.sleep(700);
		S.ok(Math.abs((await p.ev(`${CORK}.scrollTop`)) - corkTop) <= 40, `after that, the corkboard is still where it was left (${corkTop} → ${await p.ev(`${CORK}.scrollTop`)})`);
		await setMode(p, 'outliner');
		await p.sleep(500);
		log(`phone: and after a note was opened and Back, at`, await p.ev(`${OUT}.scrollTop`));
	});
	S.done();
});

// =====================================================================================================================
// 6. A Longform project on a phone
// =====================================================================================================================

const LF = 'Longform demo/', LFNOTE = 'Longform demo/Index.md';
const lfScenes = (p) => p.ev(`(async () => { await ${B}.flush(); const t = await app.vault.adapter.read(${j(LFNOTE)}); const m = /scenes:\\n([\\s\\S]*?)\\n  \\w/.exec(t); return m ? m[1] : t; })()`);

test('phone 6. a Longform project: every mode shows it in Longform’s order with its group; a card dragged, a row moved, “Move down” from a manuscript title, a new scene in each mode, a scene split: only Longform’s own list is written; then “Convert to binder” with groups moved into folders, the view following', async (p, h, t) => {
	const S = softly(t);
	const before = await texts(p);
	await onDevice(p, PHONE, async () => {
		await showExplorer(p);
		await tapEl(p, explorerRow('Longform demo'));
		await until(p, `${VIEW}?.folder?.path === 'Longform demo'`, 4000);
		await p.sleep(700);
		await shot(p, 'phone-6-01-longform-corkboard');
		const base = (xs) => xs.map((x) => x.split('/').pop().replace(/\.md$/, ''));
		const ORDER = ['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return'];
		S.eq(j(base(await cardsIn(p))), j(ORDER), 'the corkboard: Longform’s scenes in its order, without the note it ignores');
		S.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-group.is-indented')`), 'the indented scenes show as a group');
		await tapEl(p, `${LEAF} .binders-new-button`);
		S.eq(j(await menuItems(p)), j(['New note']), 'New has no “New folder” in a Longform project');
		await gone(p);
		await cardMenu(p, LF + 'Harbor.md');
		S.ok(!(await menuItems(p)).includes('Put in a new folder'), 'nor has a card’s menu “Put in a new folder”');
		await gone(p);
		await modeByTouch(p, 'Outliner');
		S.eq(j(base(await rowsIn(p))), j(ORDER), 'the outliner: the same');
		await shot(p, 'phone-6-02-longform-outliner');
		await modeByTouch(p, 'Manuscript');
		S.eq(j(await sectionsIn(p)), j(ORDER), 'the manuscript: the same');
		await shot(p, 'phone-6-03-longform-manuscript');
		// reorder: a card dragged, a row's menu, a title's menu
		await modeByTouch(p, 'Corkboard');
		await dragCard(p, LF + 'Return.md', LF + 'Island.md', 'before');
		await p.sleep(400);
		log('longform after dragging Return before Island:', j(await lfScenes(p)));
		S.eq(j(base(await cardsIn(p))), j(['Harbor', 'Ticket office', 'The crossing', 'Return', 'Island']), 'a card dragged: Return before Island');
		await modeByTouch(p, 'Outliner');
		await rowMenu(p, LF + 'Harbor.md');
		log('longform row menu:', j((await menuItems(p)).filter((x) => /Move|folder|Merge|Dup/.test(x))));
		await gone(p);
		await rowMenu(p, LF + 'Island.md');
		await pick(p, 'Move up');
		await p.sleep(600);
		S.eq(j(base(await rowsIn(p))), j(['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return']), 'a row moved up: back as it was');
		await modeByTouch(p, 'Manuscript');
		await titleMenu(p, 'Island');
		await pick(p, 'Move down');
		await p.sleep(700);
		S.eq(j(await sectionsIn(p)), j(['Harbor', 'Ticket office', 'The crossing', 'Return', 'Island']), 'a manuscript title’s “Move down”');
		const idx = await read(p, LFNOTE);
		S.ok(/scenes:\n    - Harbor\n    - - Ticket office\n      - The crossing\n    - Return\n    - Island\n/.test(idx), 'Longform’s own list has the new order, its group as it was: ' + j(await lfScenes(p)));
		S.ok(!/contents:|binder:/.test(idx), 'and nothing of Binders’ own is written into its index');
		S.ok(idx.endsWith(split(before[LFNOTE]).body), 'the index note’s text is untouched');
		// a new scene in each mode
		await modeByTouch(p, 'Corkboard');
		await p.ev(`(() => { ${CORK}.scrollTop = ${CORK}.scrollHeight; return 1; })()`);
		await p.sleep(300);
		await tapEl(p, `${LEAF} .binders-new-button`);
		await pick(p, 'New note');
		await p.type('Epilogue');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(LF + 'Epilogue.md')})`, 3000);
		await p.key('Escape');
		await p.sleep(500);
		await modeByTouch(p, 'Manuscript');
		await tapEl(p, `${LEAF} .binders-new-button`);
		await pick(p, 'New note');
		await until(p, `document.activeElement?.classList.contains('is-renaming')`, 3000);
		await p.type('Coda');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath(${j(LF + 'Coda.md')})`, 3000);
		await p.sleep(600);
		await p.type('The last line.');
		await until(p, `app.vault.adapter.read(${j(LF + 'Coda.md')}).then(x => /The last line\\./.test(x)).catch(() => false)`, 6000);
		S.eq((await read(p, LF + 'Coda.md').catch(() => '')).trim(), 'The last line.', 'a scene made in the manuscript, named, and written in straight away');
		await p.ev(`document.activeElement?.blur?.()`);
		log('longform after two new scenes:', j(await lfScenes(p)));
		S.ok(/- Island\n\s+- Epilogue\n\s+- Coda$/m.test(await lfScenes(p)) || /Epilogue[\s\S]*Coda/.test(await lfScenes(p)), 'both are in Longform’s list, at the end');
		for (const n of ORDER) S.eq(await read(p, LF + n + '.md'), before[LF + n + '.md'], `“${n}” is byte for byte what it was`);
		S.eq(await read(p, LF + 'Notes on ferries.md'), before[LF + 'Notes on ferries.md'], 'and the note Longform ignores');
		// Convert to binder, from the palette with the view in front
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); ${VIEW}.focusMode(); return 1; })()`);
		await p.sleep(500);
		S.ok(await palette(p, 'Convert to binder'), '“Convert to binder” is in the palette with the project’s view in front');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`, 3000);
		await p.sleep(400);
		await shot(p, 'phone-6-04-convert');
		const d = await p.ev(`(() => { const m = document.querySelector('.modal'), r = m.getBoundingClientRect(); return { title: m.querySelector('.modal-title')?.textContent, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, toggles: m.querySelectorAll('.checkbox-container').length }; })()`);
		S.ok(d.title === 'Convert to binder' && d.fits && d.toggles === 2, 'its dialog fits the phone: ' + j(d));
		const tg = await p.at('.modal .checkbox-container');
		await tap(p, tg.x, tg.y);
		await p.sleep(300);
		S.ok(/“Ticket office” is a new folder|new folder/.test(await p.ev(`document.querySelector('.modal ul').textContent`)), 'with “Move groups into folders” on, it says which folder is made: ' + await p.ev(`document.querySelector('.modal ul').textContent`));
		await shot(p, 'phone-6-05-convert-folders');
		await dialogTap(p, 'Convert');
		await until(p, `/binder: 1/.test(app.vault.getAbstractFileByPath(${j(LFNOTE)}) ? '' : '') || ${B}.binderOf(app.vault.getAbstractFileByPath('Longform demo'))?.kind === 'binder'`, 5000);
		await p.sleep(1200);
		await shot(p, 'phone-6-06-converted');
		S.eq(await p.ev(`${B}.binderOf(app.vault.getAbstractFileByPath('Longform demo'))?.kind`), 'binder', 'it’s a binder now');
		const folders = await p.ev(`app.vault.getAllLoadedFiles().filter(f => f.children && f.path.startsWith('Longform demo/')).map(f => f.path)`);
		log('after converting with folders:', j(folders), j(await p.ev(`${B}.binderOf(app.vault.getAbstractFileByPath('Longform demo')).note.path`)), j(await cardsIn(p)));
		S.ok(folders.length === 1, 'the group is a folder: ' + j(folders));
		S.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-card.is-stack[data-path="' + ${j(folders[0] ?? '')} + '"]') && !document.querySelector('${LEAF} .binders-group.is-indented')`), 'which the view in front shows as a folder’s stack at once, and no longer as a group under its scene');
		S.eq(await dialogs(p) + await menus(p), 0, 'nothing left open');
		const after = await texts(p);
		for (const n of ORDER) { const path = Object.keys(after).find((k) => k.endsWith('/' + n + '.md')); S.eq(split(after[path] ?? '').body, split(before[LF + n + '.md']).body, `“${n}” still has its text`); }
	});
	S.done();
});

// =====================================================================================================================
// 7. Seams: one feature in the middle of another
// =====================================================================================================================

test('phone 7. seams: a chapter renamed in the file explorer while a scene in it has unsaved typing in the manuscript; a moved note deleted, then “Undo last move”; a chapter duplicated, ungrouped (its folder note kept) and deleted; “Set synopsis from text” after typing; compile right after typing: nothing typed is lost or doubled', async (p, h, t) => {
	const S = softly(t);
	await novel(p, { chapters: true });
	await onDevice(p, PHONE, async () => {
		await open(p, 'Novel');
		await setMode(p, 'manuscript');
		// typing, and at once the chapter is renamed elsewhere (the explorer, another device's sync)
		await tapEnd(p, `(${scene('Two')})`);
		await p.type('UNSAVED-A');
		await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Novel/Chapter 1'), 'Novel/Act One').then(() => 1)`);
		await p.sleep(400);
		await p.type(' and-more');
		await until(p, `app.vault.adapter.read('Novel/Act One/Two.md').then(x => /and-more/.test(x)).catch(() => false)`, 6000);
		S.eq(count(await read(p, 'Novel/Act One/Two.md').catch(() => ''), 'UNSAVED-A and-more'), 1, 'a scene being typed in when its chapter is renamed: everything typed is in the note, once');
		S.ok(!(await p.ev(`app.vault.adapter.exists('Novel/Chapter 1')`)), 'and no copy is left under the old name');
		S.eq(await p.ev(`document.querySelector('${LEAF} .binders-manuscript-heading')?.textContent`), 'Act One', 'the heading has the new name');
		// "Set synopsis from text" right after typing: from what's on screen
		await tapEnd(p, `(${scene('Three')})`);
		await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.setCursor({ line: 0, ch: 0 }); return 1; })()`);
		await p.type('FRESH ');
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('Novel/Act One/Three.md'), fm => { delete fm.synopsis; }).then(() => 1)`).catch(() => {});
		await p.sleep(2500);
		await p.type('NEWER ');
		await titleMenu(p, 'Three');
		await pick(p, 'Set synopsis from text');
		await p.sleep(900);
		for (let i = 0; i < 2 && (await dialogs(p)); i++) { await dialogTap(p, 'Replace').catch(() => {}); await p.sleep(500); }
		await flush(p);
		const three = await read(p, 'Novel/Act One/Three.md');
		log('Three after “Set synopsis from text”:', j(three.slice(0, 160)));
		S.ok(/^synopsis: .*NEWER/m.test(three) || /NEWER/.test((await fm(p, 'Novel/Act One/Three.md'))?.synopsis ?? ''), 'the synopsis is made from the text as typed a moment ago: ' + j((await fm(p, 'Novel/Act One/Three.md'))?.synopsis));
		S.eq(count(three, 'NEWER'), /NEWER/.test((await fm(p, 'Novel/Act One/Three.md'))?.synopsis ?? '') ? 2 : 1, 'and the text has it once');
		S.eq(count(split(three).body, 'FRESH'), 1, 'what was typed before is there once');
		await p.ev(`document.activeElement?.blur?.()`);
		// export as one note right after typing
		await tapEnd(p, `(${scene('Four')})`);
		await p.type('JUST-TYPED');
		await p.ev(`(app.plugins.plugins.binders.settings.exportKind = 'note', app.commands.executeCommandById('binders:export'))`);
		await until(p, `!!document.querySelector('.modal .binders-export-path')`);
		await dialogTap(p, 'Export');
		await until(p, `!!app.vault.getAbstractFileByPath('Novel (exported).md')`, 5000);
		await p.sleep(500);
		S.eq(count(await read(p, 'Novel (exported).md').catch(() => ''), 'JUST-TYPED'), 1, 'what was typed a moment before exporting is in the exported note, once');
		// (on a phone the exported note opens in the binder's own tab: Back returns to the binder)
		await until(p, `app.workspace.getActiveFile()?.path === 'Novel (exported).md'`, 4000);
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `app.workspace.getMostRecentLeaf()?.view.getViewType() === 'binders-view'`, 4000);
		await p.sleep(700);
		S.eq(j([(await viewState(p))?.folder, (await viewState(p))?.mode]), j(['Novel', 'manuscript']), 'Back from the exported note returns to the binder, in the manuscript');
		// a moved note deleted, then undo
		await setMode(p, 'corkboard');
		await intoStack(p, 'Novel/Act One');
		await dragCard(p, 'Novel/Act One/Five.md', 'Novel/Act One/Six.md');
		const moved = await list(p, NNOTE);
		S.eq(j(moved.slice(5, 7)), j(['Act One/Six', 'Act One/Five']), 'Five dragged after Six');
		await cardMenu(p, 'Novel/Act One/Five.md');
		await pick(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`, 3000);
		await dialogTap(p, 'Delete');
		await until(p, `!app.vault.getAbstractFileByPath('Novel/Act One/Five.md')`, 3000);
		await p.sleep(500);
		await clearNotices(p);
		const offered = await palette(p, 'Undo last move');
		await p.sleep(700);
		log('undo after the moved note was deleted: offered', offered, '· says:', j(await notices(p)), '· order now:', j((await list(p, NNOTE)).slice(0, 7)));
		S.eq(j((await list(p, NNOTE)).filter((x) => x.startsWith('Act One/') && x !== 'Act One/')), j(['One', 'Two', 'Three', 'Four', 'Six'].map((n) => 'Act One/' + n)), 'undoing a move whose note is gone leaves the others as they are');
		S.eq(j((await cardsIn(p)).map((x) => x.split('/').pop().replace(/\.md$/, ''))), j(['One', 'Two', 'Three', 'Four', 'Six']), 'and the chapter’s board shows every note there is in it');
		await upOut(p);
		S.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-stack[data-path]')].map(c => c.dataset.path.split('/').pop() + ': ' + parseInt(c.querySelector('.binders-card-words')?.textContent ?? ''))`)), j(['Act One: 5', 'Chapter 2: 6', 'Chapter 3: 6']), 'and on the binder’s board each chapter’s stack counts what it holds');
		// a chapter duplicated
		await stackMenu(p, 'Novel/Chapter 2');
		log('a chapter’s stack menu:', j(own2(await menuItems(p))));
		await pick(p, 'Duplicate');
		await p.sleep(1500);
		const dup = await p.ev(`app.vault.getAllLoadedFiles().filter(f => f.children && f.parent?.path === 'Novel' && !['Act One', 'Chapter 2', 'Chapter 3'].includes(f.name)).map(f => f.path)`);
		log('a duplicated “Chapter 2” is called', j(dup));
		S.eq(dup.length, 1, 'Duplicate on a chapter’s stack makes a copy of the chapter: ' + j(dup));
		if (dup.length) {
			const l = await list(p, NNOTE), rel = dup[0].replace('Novel/', '');
			S.eq(j(l.filter((x) => x.startsWith(rel + '/') && x !== rel + '/').map((x) => x.split('/').pop())), j(NAMES.slice(6, 12)), 'with its six notes, in order');
			S.eq(l[l.indexOf('Chapter 2/Twelve') + 1], rel + '/', 'right after the original');
			S.eq(await read(p, dup[0] + '/Seven.md'), await read(p, 'Novel/Chapter 2/Seven.md'), 'each a copy, text and properties');
		}
		// a chapter with a folder note of its own text, ungrouped: the note and its text stay
		await p.ev(`(async () => { const f = await ${B}.ensureFolderNote(app.vault.getAbstractFileByPath('Novel/Chapter 3')); await app.vault.process(f, t => t + 'Notes on chapter three, written by hand.\\n'); await app.fileManager.processFrontMatter(f, fm => { fm.synopsis = 'The end.'; }); })().then(() => 1)`);
		await p.sleep(500);
		await stackMenu(p, 'Novel/Chapter 3');
		await pick(p, 'Ungroup');
		await p.sleep(1200);
		await shot(p, 'phone-7-01-ungrouped');
		const l3 = await list(p, NNOTE);
		log('after Ungroup:', j(l3.slice(-10)), 'folder note:', await exists(p, 'Novel/Chapter 3/Chapter 3.md'));
		S.eq(j(l3.filter((x) => NAMES.slice(12, 18).includes(x))), j(NAMES.slice(12, 18)), 'Ungroup takes the six notes out, in order');
		S.ok(/Notes on chapter three, written by hand\./.test(await read(p, 'Novel/Chapter 3/Chapter 3.md').catch(() => '')), 'and the folder’s own note keeps its text');
		S.ok(await palette(p, 'Undo last move'), 'Ungroup can be undone');
		await p.sleep(900);
		S.eq(j((await list(p, NNOTE)).filter((x) => x.startsWith('Chapter 3/') && x !== 'Chapter 3/')), j(NAMES.slice(12, 18).map((n) => 'Chapter 3/' + n)), 'which puts them back in it, in order');
		// the chapter deleted from its stack: asked, with the number of notes; all of it in the trash
		await stackMenu(p, 'Novel/Chapter 3');
		await pick(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`, 3000);
		S.ok(/Delete “Chapter 3” and the 6 notes in it\?/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'deleting a chapter says how many notes go with it: ' + await p.ev(`document.querySelector('.modal p')?.textContent`));
		await dialogTap(p, 'Delete');
		await until(p, `!app.vault.getAbstractFileByPath('Novel/Chapter 3')`, 4000);
		await p.sleep(600);
		S.ok(await p.ev(`app.vault.adapter.exists('.trash/Chapter 3/Chapter 3.md')`) && await p.ev(`app.vault.adapter.exists('.trash/Chapter 3/Thirteen.md')`), 'the chapter is in the trash whole, its own note too');
		S.ok(!(await list(p, NNOTE)).some((x) => x.startsWith('Chapter 3/')), 'and out of the binder note');
		await agree(p, S, NNOTE, names(await list(p, NNOTE)), 'at the end');
		S.eq(await menus(p) + await dialogs(p), 0, 'nothing left open');
	});
	S.done();
});
const own2 = (items) => items.filter((x) => !/^(Bookmark|Copy|Make a copy|Move f|Reveal|Show in system|Search|New (note|folder|canvas|base))/.test(x) && !/files?, \d+ folder/.test(x));


// =====================================================================================================================
// 8. What's wrong (BUG: fails now, passes once fixed) and what a writer would wish for (UX)
// =====================================================================================================================

// Round 7: a folder on the board is a stack. One made with the toolbar's "New folder" isn't selected, so once it's named
// the keyboard goes back to the card that had it.
specs.push({ name: 'BUG: qa7: journey: a folder made with the toolbar’s “New folder” has the keyboard once it’s named, so Enter goes into it (the keyboard goes back to the card that was selected before, and Enter opens that card’s note instead)', fn: async (p, h, t) => {
	await novel(p);
	const S = softly(t);
	await onDevice(p, TABLET, async () => {
		await open(p, 'Novel');
		const six = await see(p, card(N + 'Six.md'));
		await tap(p, six.x, six.t + six.h - 14);
		await tapEl(p, `${LEAF} .binders-new-button`);
		await pick(p, 'New folder');
		await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
		S.ok(await p.ev(`!!document.activeElement.closest('.binders-card.is-stack')`), 'the new folder’s name is typed on its stack');
		await keys(p, 'Part One');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath('Novel/Part One')`, 4000);
		await p.sleep(600);
		S.ok(/\[Novel\/Part One\]$/.test(await focusIs(p)), 'once it’s named the keyboard is on the new folder’s stack: ' + await focusIs(p));
		S.eq(j(await selected(p)), j(['Novel/Part One']), 'which is the selected card');
		await p.key('Enter');
		await p.sleep(900);
		S.eq((await viewState(p))?.folder ?? null, 'Novel/Part One', `Enter then goes into the folder (the tab shows: ${await p.ev(`app.workspace.getActiveFile()?.path ?? 'the binder view'`)})`);
	});
	S.done();
} });

bug('phone manuscript: what’s typed is written down when the app goes to the background (Obsidian saves its own open notes then, on Capacitor’s “appStateChange”; the manuscript’s editors aren’t notes in tabs, and only save on their 2 s timer or on “quit”, which a phone never sends: a phone that closes the app in the background loses the last words, and a split’s first half keeps the second)', async (p, h, t) => {
	await novel(p);
	let hidden = '', split2 = '';
	await onDevice(p, PHONE, async () => {
		await open(p, 'Novel');
		await setMode(p, 'manuscript');
		await tapEnd(p, `(${scene('One')})`);
		await p.type('the last words before the phone is put down');
		// (the page is hidden and the window loses the focus; the caret stays where it is, as it does on a device)
		await background(p, false);
		await p.sleep(600);
		hidden = await read(p, 'Novel/One.md');
		await foreground(p);
		await p.sleep(2600);
		// the same for a split: the first note still has the second half on disk when the app is hidden right after
		await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; let n = 0; for (let i = 0; i < ed.lineCount(); i++) if (/^A second paragraph/.test(ed.getLine(i))) n = i; ed.setCursor({ line: n, ch: 0 }); return 1; })()`);
		await p.ev(`app.commands.executeCommandById('binders:split-scene')`);
		await until(p, `!!app.vault.getAbstractFileByPath('Novel/One 2.md')`, 5000);
		await background(p, false);
		await p.sleep(600);
		split2 = await read(p, 'Novel/One.md');
		await foreground(p);
	});
	t.eq(count(hidden, 'the last words before the phone is put down'), 1, '600 ms after the app is hidden, what was typed is on disk');
	t.eq(count(split2, 'A second paragraph of One'), 0, 'and right after a split, the first note no longer has the second half on disk (it’s in both notes until the editor’s own save, about 2 s later)');
});

bug('“New binder”, named: the binder note takes the folder’s name, as the README says a binder note has (“The Lighthouse/The Lighthouse.md”); it stays “Untitled binder.md” in every binder made this way, which is what the quick switcher, search and “Open binder note” then show', async (p, h, t) => {
	let made = [], opened = '';
	await onDevice(p, PHONE, async () => {
		await showExplorer(p);
		await p.ev(`(() => { const c = document.querySelector('.nav-files-container'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 100, clientY: r.bottom - 60, button: 0 })); return 1; })()`);
		await p.sleep(500);
		await pick(p, 'New binder');
		await until(p, `document.activeElement?.classList.contains('nav-folder-title-content')`, 3000);
		await p.type('Novel');
		await p.key('Enter');
		await until(p, `!!app.vault.getAbstractFileByPath('Novel')`, 4000);
		await p.sleep(1500);
		made = await p.ev(`app.vault.getFiles().map(f => f.path).filter(x => x.startsWith('Novel/'))`);
		await tapEl(p, explorerRow('Novel'));
		await until(p, `${VIEW}?.folder?.path === 'Novel'`, 4000);
		await tapEl(p, `${LEAF} .view-actions .clickable-icon[aria-label="More options"]`);
		await pick(p, 'Open binder note');
		await p.sleep(800);
		opened = await p.ev(`app.workspace.getActiveFile()?.basename ?? ''`);
		await shot(p, 'bug-binder-note-untitled');
	});
	t.eq(j(made), j(['Novel/Novel.md']), 'the binder “Novel” holds its binder note, named like it');
	t.eq(opened, 'Novel', '“Open binder note” opens a note called “Novel”');
});

bug('phone: a new note’s name is typed in sight, above the floating navigation bar, wherever it’s asked for: “New” in the corkboard’s toolbar, in the manuscript, and (at 320 px) in the outliner (the field is scrolled just into the scroller, whose last 84 px are under the bar)', async (p, h, t) => {
	await novel(p);
	const seen = {};
	await onDevice(p, PHONE, async () => {
		for (const [w, hh] of [PHONE, SMALL]) {
			await metrics(p, w, hh);
			await p.sleep(400);
			await open(p, 'Novel');
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await setMode(p, mode);
				await tapEl(p, `${LEAF} .binders-new-button`);
				await pick(p, 'New note');
				await p.sleep(700);
				seen[`${w} ${mode}`] = await fieldInSight(p);
				await shot(p, `bug-new-name-${w}-${mode}`);
				await p.type(`N ${w} ${mode}`);
				await p.key('Enter');
				await p.sleep(600);
				await p.key('Escape');
				await p.ev(`document.activeElement?.blur?.()`);
				await p.sleep(300);
			}
		}
	});
	const hiddenOnes = Object.entries(seen).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: field ${v.top}–${v.bottom}, bar from ${v.limit}`);
	t.eq(j(hiddenOnes), '[]', 'every name field is above the navigation bar');
});

bug('phone: what a change of mode goes to is in sight: the card selected on the corkboard is a row above the navigation bar in the outliner, and a section that starts on screen in the manuscript (the row is left under the bar, and the section’s title on the screen’s last line, under the bar too: both are scrolled “nearest”, to the scroller’s very edge)', async (p, h, t) => {
	await novel(p);
	let row = null, sec = null, nav = 0, innerH = 0;
	await onDevice(p, PHONE, async () => {
		await open(p, 'Novel');
		nav = await navbarTop(p); innerH = PHONE[1];
		const far = await see(p, card('Novel/Sixteen.md'));
		await tap(p, far.x, far.t + far.h - 14);
		await modeByTouch(p, 'Outliner');
		row = await rect(p, orow('Novel/Sixteen.md'));
		await shot(p, 'bug-mode-switch-row-under-bar');
		await modeByTouch(p, 'Corkboard');
		const again = await see(p, card('Novel/Seventeen.md'));
		await tap(p, again.x, again.t + again.h - 14);
		await modeByTouch(p, 'Manuscript');
		await p.sleep(1500);
		sec = await p.ev(`(${R})((${scene('Seventeen')}))`);
		await shot(p, 'bug-mode-switch-section-at-edge');
	});
	t.ok(row && row[1] + row[3] <= nav, `the row is above the navigation bar (it’s at ${row?.[1]}–${row ? row[1] + row[3] : ''}; the bar starts at ${nav})`);
	t.ok(sec && sec[1] < nav - 60, `the section starts where it can be read (its top is at ${sec?.[1]} of ${innerH}; the bar starts at ${nav})`);
});

bug('the outliner keeps its place after a look at another mode: with the selected row out of sight (it comes back where it was for an instant, then jumps to that row), and with it in sight (it comes back 100 px or more off, in a binder whose rows have synopses)', async (p, h, t) => {
	await novel(p, { chapters: true });
	const got = {};
	await onDevice(p, PHONE, async () => {
		await open(p, 'Novel');
		await setMode(p, 'outliner');
		const r = await see(p, ocell('Novel/Chapter 3/Sixteen.md', 'label'));
		await tap(p, r.x, r.y);
		// back up the list by touch, to the first chapter
		for (let i = 0; i < 4 && (await p.ev(`${OUT}.scrollTop`)) > 300; i++) await swipe(p, 200, 300, 200, 560, 8);
		await p.ev(`(() => { ${OUT}.scrollTop = 300; return 1; })()`);
		await p.sleep(500);
		got.left = await p.ev(`${OUT}.scrollTop`);
		await modeByTouch(p, 'Corkboard');
		await modeByTouch(p, 'Outliner');
		await p.sleep(800);
		got.back = await p.ev(`${OUT}.scrollTop`);
		await shot(p, 'bug-outliner-place');
		// and with a row in sight selected
		await p.ev(`(() => { ${OUT}.scrollTop = 300; return 1; })()`);
		await p.sleep(400);
		const mid = await p.ev(`(() => { const r = [...document.querySelectorAll('${LEAF} .binders-outliner-row:not(.is-folder)')].find(e => e.getBoundingClientRect().top > 330); const c = r.querySelector('.binders-outliner-cell[data-col="label"]').getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; })()`);
		await tap(p, mid.x, mid.y);
		got.left2 = await p.ev(`${OUT}.scrollTop`);
		await modeByTouch(p, 'Corkboard');
		await modeByTouch(p, 'Outliner');
		await p.sleep(800);
		got.back2 = await p.ev(`${OUT}.scrollTop`);
	});
	t.ok(Math.abs(got.back - got.left) <= 20, `selected row out of sight: left scrolled to ${got.left} px, the outliner comes back at ${got.back} px`);
	t.ok(Math.abs(got.back2 - got.left2) <= 20, `selected row in sight: left at ${got.left2} px, it comes back at ${got.back2} px`);
});

ux('phone: after “Export”, Back returns to the binder (the exported note opens in a new tab, which on a phone hides the binder with no way back but the tab switcher: “Navigate back” is disabled)', async (p, h, t) => {
	let back = '', disabled = null;
	await onDevice(p, PHONE, async () => {
		await open(p);
		await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`);
		await tapEl(p, `${LEAF} .view-actions .clickable-icon[aria-label="More options"]`);
		await pick(p, 'Export...');
		await until(p, `!!document.querySelector('.modal .binders-export-path')`);
		await dialogTap(p, 'Export');
		await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse (exported).md'`, 6000);
		await p.sleep(600);
		disabled = await p.ev(`document.querySelector('.mobile-navbar-action-back .clickable-icon')?.getAttribute('aria-disabled') ?? null`);
		const b = await p.at('.mobile-navbar-action-back');
		await tap(p, b.x, b.y);
		await p.sleep(800);
		back = await p.ev(`app.workspace.getMostRecentLeaf()?.view.getViewType()`);
		await shot(p, 'ux-compile-back');
	});
	t.eq(back, 'binders-view', `a tap on Back (disabled: ${disabled}) shows the binder again`);
});

ux('phone: a move can be taken back by touch from the view itself (now only the command palette has “Undo last move”: nothing in “More options”, and the notice after a drop offers nothing)', async (p, h, t) => {
	let items = [], said = '';
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await clearNotices(p);
		await dragCard(p, L + 'Part One/Arrival.md', L + 'Part One/The keeper.md');
		said = await notices(p);
		await tapEl(p, `${LEAF} .view-actions .clickable-icon[aria-label="More options"]`);
		items = await menuItems(p);
		await gone(p);
	});
	t.ok(items.some((x) => /^Undo/.test(x)) || /Undo/.test(said), `after a card is dragged, “More options” has ${j(items.filter((x) => !/^(Close|Pin|Open|Split|Move to|Rename tab|Link)/.test(x)))} and the notice says “${said}”`);
});

ux('phone corkboard: “New” in the toolbar puts the note after the selected card, as it does after the selected row in the outliner and after the cursor’s section in the manuscript (on the corkboard it goes to the end of the binder, out of sight, whatever is selected)', async (p, h, t) => {
	const at = {};
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		const c = await see(p, card(L + 'Part One/Arrival.md'));
		await tap(p, c.x, c.t + c.h - 14);
		await tapEl(p, `${LEAF} .binders-new-button`);
		await pick(p, 'New note');
		await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
		await p.type('From the corkboard');
		await p.key('Enter');
		await until(p, `app.vault.getMarkdownFiles().some(f => f.basename === 'From the corkboard')`, 3000);
		await p.key('Escape');
		await p.sleep(400);
		await setMode(p, 'outliner');
		const r = await see(p, ocell(L + 'Part One/The keeper.md', 'label') ) ?? await see(p, ocell(L + 'Part One/The keeper.md', 'status'));
		await tap(p, r.x, r.y);
		await tapEl(p, `${LEAF} .binders-new-button`);
		await pick(p, 'New note');
		await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
		await p.type('From the outliner');
		await p.key('Enter');
		await until(p, `app.vault.getMarkdownFiles().some(f => f.basename === 'From the outliner')`, 3000);
		await p.sleep(400);
		const l = await list(p);
		at.outliner = l[l.indexOf('Part One/The keeper') + 1];
		at.corkboard = l[l.indexOf('Part One/Arrival') + 1];
		at.where = l.find((x) => /From the corkboard/.test(x)) + ' at ' + l.findIndex((x) => /From the corkboard/.test(x)) + ' of ' + l.length;
	});
	t.eq(at.outliner, 'Part One/From the outliner', 'the outliner’s goes after the selected row');
	t.eq(at.corkboard, 'Part One/From the corkboard', `the corkboard’s goes after the selected card (it’s “${at.where}”)`);
});

ux('phone: the card selected on the corkboard is still where the view is after a look at the outliner on the way to the manuscript (corkboard → outliner goes to its row; outliner → manuscript then opens at the top of the book, since nothing was selected “in” the outliner)', async (p, h, t) => {
	await novel(p);
	let top = '';
	await onDevice(p, PHONE, async () => {
		await open(p, 'Novel');
		const far = await see(p, card('Novel/Sixteen.md'));
		await tap(p, far.x, far.t + far.h - 14);
		await modeByTouch(p, 'Outliner');
		t.eq(j(await selected(p)), j(['Novel/Sixteen.md']), 'the outliner is on its row');
		await modeByTouch(p, 'Manuscript');
		await p.sleep(1500);
		top = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].filter(e => { const r = e.getBoundingClientRect(); return r.bottom > 170 && r.top < innerHeight - 90; }).map(e => e.querySelector('.binders-manuscript-title').textContent).join(', ')`);
	});
	t.ok(/Sixteen/.test(top), `the manuscript shows “Sixteen” (it shows: ${top})`);
});

ux('“Undo last move” isn’t offered when there’s nothing it can take back (after the note that was moved is deleted the command is still there, does nothing and says nothing)', async (p, h, t) => {
	let offered = null, said = '';
	await onDevice(p, PHONE, async () => {
		await open(p, L + 'Part One');
		await dragCard(p, L + 'Part One/Arrival.md', L + 'Part One/The keeper.md');
		await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})).then(() => 1)`);
		await p.sleep(600);
		await clearNotices(p);
		offered = await palette(p, 'Undo last move');
		await p.sleep(600);
		said = await notices(p);
	});
	t.ok(!offered || !!said, `offered: ${offered}; it says: “${said}”`);
});

// =====================================================================================================================
// 9. A thousand notes on a phone, the CPU four times slower
// =====================================================================================================================

test('phone 9. a binder of 1,000 notes in 20 folders, CPU four times slower: each mode opens, swipes scroll, a card and a row are dragged and dropped, a key typed in the manuscript shows and is saved; the numbers are printed', async (p, h, t) => {
	const SAGA = 'Saga', PARTS = 20, PER = 50, ALL = PARTS * PER;
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
	const ready = `${B}.scenes(app.vault.getAbstractFileByPath(${j(SAGA)}) ?? app.vault.getRoot())?.length === ${ALL} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Saga/')).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`;
	t.ok(await until(p, ready, 120000), 'the big binder is made');
	const timed = (expr) => p.ev(`(async () => { const t = performance.now(); await (${expr}); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); })()`);
	const frames = (ms) => p.ev(`(() => { const fr = window.__qa5f = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); fr.push(n - last); last = n; if (n - t0 < ${ms}) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
	const frameStats = () => p.ev(`(() => { const f = window.__qa5f.slice(1).sort((a, b) => a - b); return { frames: f.length, median: Math.round(f[f.length >> 1]), p95: Math.round(f[Math.floor(f.length * 0.95)]), worst: Math.round(f[f.length - 1]) }; })()`);
	const swipes = async () => { for (let k = 0; k < 4; k++) { await touch(p, 'touchStart', 200, 650); for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', 200, 650 - i * 35); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(200); } await p.sleep(300); };
	const out = {};
	await onDevice(p, PHONE, async () => {
		t.ok(await until(p, ready, 120000), 'and found again on the phone');
		await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		const saga = `app.vault.getAbstractFileByPath(${j(SAGA)})`;
		out.corkboardOpens = await timed(`${PL}.openBinder(${saga})`);
		const t0 = Date.now();
		await until(p, `document.querySelectorAll('${LEAF} .binders-card.is-stack[data-path]').length === ${PARTS}`, 30000);
		await until(p, `/\\d/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '')`, 60000);
		out.corkboardCounted = Date.now() - t0;
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card[data-path]').length`), PARTS, 'the binder’s board: a stack for each of its twenty folders');
		t.eq(j(await p.ev(`[...new Set([...document.querySelectorAll('${LEAF} .binders-card.is-stack .binders-card-words')].map(e => e.textContent.split(' · ')[0]))]`)), j([`${PER} notes`]), 'each counting its fifty notes');
		// (a board shows one folder: the first part's fifty cards are what's swiped and dragged)
		out.partOpens = await timed(`${PL}.openBinder(app.vault.getAbstractFileByPath(${j(SAGA + '/Part 01')}))`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === ${PER}`, 30000);
		await p.sleep(1500);
		await frames(2600);
		await swipes();
		out.corkboardScroll = await frameStats();
		t.ok(await p.ev(`${CORK}.scrollTop`) > 1000, 'the corkboard scrolls');
		// a drag: the card follows the finger frame by frame, and the drop is written
		const at = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(e => [e.getBoundingClientRect(), e.dataset.path]).filter(([r]) => r.top > 220 && r.bottom < 560).map(([r, path]) => [r.left + r.width / 2, r.bottom - 16, path, r.height])[0]`);
		await touch(p, 'touchStart', at[0], at[1]);
		await p.sleep(900);
		await frames(1300);
		for (let i = 1; i <= 30; i++) { await touch(p, 'touchMove', at[0], at[1] + (i % 2 ? 3 : -3) * i); await p.sleep(16); }
		await p.sleep(300);
		out.drag = await frameStats();
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 1, 'a card is dragged');
		await touch(p, 'touchMove', at[0], at[1] + at[3] + 40);
		await p.sleep(300);
		const d0 = Date.now();
		await touch(p, 'touchEnd');
		const rel = at[2].replace('Saga/', '').replace(/\.md$/, '');
		const before = await contents(p, 'Saga/Saga.md');
		await until(p, `${B}.flush().then(() => app.vault.adapter.read('Saga/Saga.md')).then(x => { const l = x.split('\\n').map(s => s.trim().replace(/^- /, '')); return l.indexOf(${j(rel)}) !== ${before.indexOf(rel)} + l.indexOf('contents:') + 1; })`, 15000);
		out.dropWritten = Date.now() - d0;
		await p.sleep(1500);
		const after = await contents(p, 'Saga/Saga.md');
		t.eq(after.length, before.length, 'the drop loses nothing from the list');
		t.ok(after.indexOf(rel) === before.indexOf(rel) + 1, `and moves the card one place down (${before.indexOf(rel)} → ${after.indexOf(rel)})`);
		await p.ev(`${PL}.openBinder(${saga}).then(() => 1)`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-card.is-stack[data-path]').length === ${PARTS}`, 30000);
		out.outlinerOpens = await timed(`(async () => { ${VIEW}.setMode('outliner'); })()`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-outliner-row').length > 100`, 30000);
		await p.sleep(1500);
		await frames(2600);
		await swipes();
		out.outlinerScroll = await frameStats();
		// a row dragged
		const ra = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-row:not(.is-folder)')].map(e => e.getBoundingClientRect()).filter(r => r.top > 260 && r.bottom < 560).map(r => [120, r.top + r.height / 2, r.height])[0]`);
		await touch(p, 'touchStart', ra[0], ra[1]);
		await p.sleep(900);
		await frames(1300);
		for (let i = 1; i <= 30; i++) { await touch(p, 'touchMove', ra[0], ra[1] + (i % 2 ? 3 : -3) * i); await p.sleep(16); }
		await p.sleep(300);
		out.rowDrag = await frameStats();
		t.ok(await p.ev(`document.querySelectorAll('.drag-ghost').length`) >= 1, 'a row is dragged');
		await touch(p, 'touchCancel');
		await p.sleep(800);
		out.manuscriptOpens = await timed(`(async () => { ${VIEW}.setMode('manuscript'); })()`);
		const m0 = Date.now();
		// (a phone: the first section drawn; its editor comes with a tap)
		await until(p, `!!document.querySelector('${LEAF} .binders-manuscript :is(.cm-editor, .binders-manuscript-rendered)')`, 60000);
		out.manuscriptFirstEditor = Date.now() - m0;
		await p.sleep(2500);
		await frames(2800);
		await swipes();
		out.manuscriptScroll = await frameStats();
		await p.sleep(2500);
		const line = await until(p, `[...document.querySelectorAll('${LEAF} .binders-manuscript :is(.cm-content, .binders-manuscript-rendered)')].map(e => e.getBoundingClientRect()).filter(r => r.top < 500 && r.bottom > 400).map(r => [r.left + 60, Math.max(r.top + 12, 300)])[0]`, 30000);
		t.ok(line, 'after the swipes, the sections in sight are drawn (plain text on a phone, until one is tapped)');
		await tap(p, line[0], line[1]);
		await p.sleep(1500);
		t.ok(await p.ev(`document.activeElement.matches('.cm-content')`), 'a tap puts the caret in a section');
		await p.type('x');
		await p.sleep(800);
		await p.ev(`(() => { const K = window.__qa5k = []; const el = document.activeElement; window.__qa5d = () => { const t0 = performance.now(), rec = { text: null, frame: null }; K.push(rec); const mo = new MutationObserver(() => { rec.text ??= Math.round(performance.now() - t0); mo.disconnect(); }); mo.observe(el, { childList: true, subtree: true, characterData: true }); requestAnimationFrame(() => requestAnimationFrame(() => { rec.frame = Math.round(performance.now() - t0); })); }; window.addEventListener('keydown', window.__qa5d, true); return 1; })()`);
		for (const ch of 'hello world ') { await p.key(ch); await p.sleep(150); }
		await p.sleep(800);
		out.keys = await p.ev(`(() => { window.removeEventListener('keydown', window.__qa5d, true); const of = (k) => { const s = window.__qa5k.map(r => r[k]).filter(x => x != null).sort((a, b) => a - b); return { n: s.length, median: s[s.length >> 1] ?? -1, worst: s[s.length - 1] ?? -1 }; }; return { text: of('text'), frame: of('frame') }; })()`);
		const file = await p.ev(`app.workspace.activeEditor?.file?.path ?? null`);
		const s0 = Date.now();
		// (all of it, to the last space: a save part of the way through the typing has "hello world" too, without it)
		await until(p, `app.vault.adapter.read(${j(file)}).then(x => /hello world /.test(x))`, 15000);
		out.typingSaved = Date.now() - s0;
		const saved = await read(p, file), near = saved.indexOf('hello');
		t.eq(count(saved, 'xhello world '), 1, 'what was typed is in the note, once: ' + j(near < 0 ? saved.slice(-80) : saved.slice(Math.max(0, near - 20), near + 30)));
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		await shot(p, 'phone-9-speed');
	});
	console.log('    qa5 speed, 1,000 notes on a phone (ms, CPU ×4): ' + j(out));
	// (wide margins: the machine runs other Obsidians beside this one)
	for (const k of ['corkboardOpens', 'partOpens', 'outlinerOpens', 'manuscriptOpens']) t.ok(out[k] < 6000, `${k}: ${out[k]} ms`);
	for (const k of ['corkboardScroll', 'outlinerScroll', 'manuscriptScroll', 'drag', 'rowDrag']) t.ok(out[k].median <= 34 && out[k].p95 <= 120, `${k}: ${j(out[k])}`);
	t.ok(out.keys.text.n === 12 && out.keys.text.median <= 120 && out.keys.frame.median <= 400, 'typing: ' + j(out.keys));
});
