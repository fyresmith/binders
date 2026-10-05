// QA round 6: Binders on a tablet, and accessibility and themes everywhere. Keyboard only (focus never lost to <body>,
// a visible ring, Escape backs out one level), names and states for screen readers, contrast measured in light and
// dark, Obsidian's appearance settings (font size, zoom, right to left), and a tablet (768 × 1024, 820 × 1180,
// 1024 × 1366, upright and on its side) with panes, a hardware keyboard and a narrow window.
// "qa6: …" pass; "BUG: …", "UX: …" and "A11Y: …" are confirmed findings (they fail now and pass once fixed).
//   QA6_SHOTS=<dir> saves screenshots of the steps there.
import { mkdirSync } from 'fs';
import { B, VIEW, closeMenus, contents, flush, j, menuItems, openView, read, reload, tidy, until, viewState } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa6: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa6: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa6: ' + name, fn });
const a11y = (name, fn) => specs.push({ name: 'A11Y: qa6: ' + name, fn });

const LEAF = '.workspace-leaf.mod-active';
const SHOTS = process.env.QA6_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const log = (...a) => console.log('    ·', ...a);

const setMode = async (p, m) => { await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`); await p.sleep(m === 'manuscript' ? 1500 : 600); };
const focusIs = (p) => p.ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; return a.tagName.toLowerCase() + (typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + (a.dataset?.path ? '[' + a.dataset.path + ']' : ''); })()`);

// ---- colors: contrast as a screen shows it ----
/** In the page: parses a computed color to [r, g, b, a], blends over what's behind an element, and gives WCAG contrast. */
const CONTRAST = `(() => {
	// (any CSS color, color-mix and oklch included, drawn on a pixel and read back)
	const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
	const parse = (s) => { if (!s || s === 'transparent') return [0, 0, 0, 0]; cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
	const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
	const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	// what's behind an element: its own and its ancestors' backgrounds, blended down to the first opaque one
	const behind = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } } let out = parse(getComputedStyle(document.body).backgroundColor); if (!out || out[3] < 1) out = [255, 255, 255, 1]; for (const c of stack.reverse()) out = over(c, out); return out; };
	window.__contrast = (el, bg) => { const cs = getComputedStyle(el); let fg = parse(cs.color); const back = bg ? parse(bg) : behind(el); fg = over([fg[0], fg[1], fg[2], fg[3] * (+cs.opacity)], back); return { fg: fg.slice(0, 3).map(Math.round), bg: back.slice(0, 3).map(Math.round), ratio: Math.round(ratio(fg, back) * 100) / 100 }; };
	window.__parse = parse; window.__over = over; window.__ratio = ratio;
	return 1;
})()`;
const contrast = async (p, sel, i = 0) => { await p.ev(CONTRAST); return p.ev(`(() => { const e = document.querySelectorAll(${j(sel)})[${i}]; return e ? window.__contrast(e) : null; })()`); };

// ---- what a screen reader would need ----
/** Every focusable or role'd control inside the view, with its accessible name (aria-label, aria-labelledby, text). */
const CONTROLS = (scope) => `(() => {
	const root = document.querySelector(${j(scope)}); if (!root) return null;
	const name = (e) => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') ? document.getElementById(e.getAttribute('aria-labelledby'))?.textContent : '') || e.textContent || e.getAttribute('title') || e.getAttribute('placeholder') || '').trim();
	const hidden = (e) => !!e.closest('[aria-hidden="true"]');
	const out = [];
	for (const e of root.querySelectorAll('[tabindex], button, input, textarea, select, a[href], [role]')) {
		if (hidden(e)) continue;
		const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue;
		const role = e.getAttribute('role') || e.tagName.toLowerCase();
		if (['presentation', 'none', 'rowgroup', 'status', 'group'].includes(role)) continue;
		out.push({ cls: String(e.className).split(' ').slice(0, 2).join('.'), role, name: name(e).slice(0, 50), tab: e.tabIndex, path: e.dataset?.path ?? '' });
	}
	return out;
})()`;

// ======================================================================== screen readers (desktop)
test('names: every control of every mode (and the toolbar) has a role and a name; the folder card’s name list is hidden from a screen reader', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	for (const mode of ['corkboard', 'outliner', 'manuscript']) {
		await setMode(p, mode).catch(() => {});
		const cur = (await viewState(p)).mode;
		if (cur !== mode) { log('no mode', mode, '→', cur); continue; }
		const all = await p.ev(CONTROLS(`${LEAF} .binders-view`));
		const unnamed = all.filter((c) => !c.name && !['textbox', 'gridcell'].includes(c.role)); // (an empty status or label cell is named by its column)
		log(mode, all.length, 'controls; unnamed:', j(unnamed.slice(0, 8)));
		t.eq(j(unnamed), '[]', `${mode}: every control has a name`);
	}
	await setMode(p, 'corkboard');
	const held = await p.ev(`(() => { const c = document.querySelector('${LEAF} .binders-card.is-stack'); const h = c.querySelector('.binders-card-held'); return { hidden: h?.getAttribute('aria-hidden'), items: h?.children.length, desc: c.getAttribute('aria-description'), focusableInside: [...(h?.querySelectorAll('[tabindex],button,a') ?? [])].length }; })()`);
	t.eq(j(held), j({ hidden: 'true', items: held.items, desc: held.desc, focusableInside: 0 }), 'the held list is aria-hidden with nothing focusable in it');
	t.ok(/notes?/.test(held.desc ?? ''), 'and the description says what it holds: ' + held.desc);
});

test('states: aria-selected follows every selection change in each mode; aria-expanded follows a folder row; aria-sort one column; the mode button says what it is', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	const sel = () => p.ev(`[...document.querySelectorAll('${LEAF} [aria-selected="true"]')].map(e => e.dataset.path)`);
	const consistent = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path], ${LEAF} .binders-outliner-row')].filter(e => (e.getAttribute('aria-selected') === 'true') !== e.classList.contains('is-selected')).map(e => e.dataset.path)`);
	const cardAt = (n) => p.ev(`document.querySelectorAll('${LEAF} .binders-card[data-path]')[${n}].focus()`);
	await cardAt(0);
	await p.key('ArrowRight');
	t.eq(j(await consistent()), '[]', 'corkboard: classes and aria-selected agree after Right');
	await p.key('ArrowRight', 'shift');
	t.eq((await sel()).length, 2, 'Shift+Right selects two');
	t.eq(j(await consistent()), '[]', 'and agree');
	await p.key('Escape');
	t.eq((await sel()).length, 1, 'Escape back to one');
	t.eq(j(await consistent()), '[]', 'and agree');
	await p.key('a', 'ctrl');
	t.ok((await sel()).length > 2, 'Ctrl+A selects all');
	await p.key('Delete', 'ctrl'); // (harmless: Ctrl+Delete isn't bound to remove while a modifier is down)
	await closeMenus(p);
	// outliner
	await setMode(p, 'outliner');
	await p.ev(`document.querySelector('${LEAF} .binders-outliner-row').focus()`);
	await p.key('ArrowDown');
	t.eq(j(await consistent()), '[]', 'outliner: classes and aria-selected agree after Down');
	const folderRow = `${LEAF} .binders-outliner-row.is-folder`;
	const before = await p.ev(`document.querySelector('${folderRow}')?.getAttribute('aria-expanded')`);
	await p.ev(`document.querySelector('${folderRow}').focus()`);
	await p.key('ArrowLeft');
	const mid = await p.ev(`document.querySelector('${folderRow}').getAttribute('aria-expanded')`);
	await p.key('ArrowRight');
	const after = await p.ev(`document.querySelector('${folderRow}').getAttribute('aria-expanded')`);
	log('aria-expanded', before, mid, after);
	t.ok(before !== mid && after === before, `aria-expanded flips with the arrows: ${before} → ${mid} → ${after}`);
	const sortOf = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-th')].map(e => e.getAttribute('aria-sort')).filter(Boolean)`);
	log('aria-sort at start', j(await sortOf()));
	t.eq((await sortOf()).filter((x) => x !== 'none').length <= 1, true, 'at most one column is sorted');
	const mb = await p.ev(`(() => { const b = document.querySelector('${LEAF} .binders-mode-button'); return [b.getAttribute('aria-label'), b.getAttribute('aria-haspopup'), b.getAttribute('aria-expanded'), b.textContent.trim()]; })()`);
	log('mode button', j(mb));
	t.ok(mb[0] && /mode|view/i.test(mb[0] + mb[3]), 'the mode button says what it is');
});

test('focus: after rename, mode switch, a menu closed, a dialog closed and an undo, the focus is on something in the view, never <body>', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path$="Prologue.md"]')`);
	const where = [];
	const check = async (what) => { await p.sleep(350); const f = await focusIs(p); where.push(what + ' → ' + f); t.ok(f !== 'BODY', `${what}: the focus is not on <body> (${f})`); };
	// rename a card with F2, commit with Enter
	await p.ev(`document.querySelector('${LEAF} .binders-card[data-path$="Prologue.md"]').focus()`);
	await p.key('F2'); await p.type('x'); await p.key('Enter');
	await check('corkboard rename, Enter');
	await p.key('F2'); await p.key('Escape');
	await check('corkboard rename, Escape');
	// mode switch by the command, then by the button and menu
	await h.run('show-outliner'); await check('command: show outliner');
	await p.ev(`document.querySelector('${LEAF} .binders-mode-button').focus()`);
	await p.key('Enter'); await p.sleep(200); await p.key('ArrowDown'); await p.key('Enter');
	await check('mode menu: pick a mode');
	await p.ev(`document.querySelector('${LEAF} .binders-mode-button').focus()`);
	await p.key('Enter'); await p.sleep(200); await p.key('Escape');
	await check('mode menu closed with Escape');
	t.eq(await p.ev(`document.activeElement?.classList.contains('binders-mode-button')`), true, 'back on the mode button');
	// a row's menu closed
	await setMode(p, 'outliner');
	await p.ev(`document.querySelector('${LEAF} .binders-outliner-row').focus()`);
	await p.key('F10', 'shift'); await p.sleep(250); await p.key('Escape');
	await check('row menu closed');
	// delete a row: the focus goes to a neighbour
	await p.ev(`document.querySelector('${LEAF} .binders-outliner-row[data-path$="Epilogue.md"]')?.focus()`);
	await p.key('Delete'); await p.sleep(500);
	log('dialog after Delete:', await p.ev(`document.querySelector('.modal .modal-title, .modal')?.textContent?.slice(0, 80) ?? null`));
	await check('delete: the dialog');
	await p.key('Escape');
	await check('delete: the dialog cancelled');
	log(where.join(' | '));
});

// ======================================================================== the device (as qa5's helpers)
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
			for (const f of app.vault.getFiles()) if (f.extension !== 'md' || / \\(compiled\\)\\.md$/.test(f.path)) await app.vault.delete(f);
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

const R = `(e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }`;
const rect = (p, sel) => p.ev(`(${R})(document.querySelector(${j(sel)}))`);
async function open(p, folder = 'The Lighthouse') {
	await openView(p, folder);
	await until(p, `/\\d/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '') || innerWidth < 340`, 5000);
	await p.sleep(500);
}
const menus = (p) => p.ev(`document.querySelectorAll('.menu').length`);
const sheet = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), bottom: Math.round(r.bottom), inner: [innerWidth, innerHeight] }; })()`);
const isSheet = (s) => !!s && s.left === 0 && s.width === s.inner[0] && s.bottom === s.inner[1];
async function gone(p) {
	await closeMenus(p);
	await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`);
	await p.sleep(250);
}
const PHONE = [390, 844], SMALL = [320, 568];
const TABLETS = [['768 × 1024', [768, 1024]], ['820 × 1180', [820, 1180]], ['1024 × 1366', [1024, 1366]]];
const side = ([w, h]) => [h, w];

// ======================================================================== tablet
/** Layout facts of the view right now: overflow, overlapping toolbar items, small touch targets. */
const LAYOUT = `(() => {
	const v = document.querySelector('${LEAF} .binders-view'); if (!v) return null;
	const vr = v.getBoundingClientRect();
	const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
	const tb = [...v.querySelectorAll('.binders-toolbar > *, .binders-toolbar .binders-toolbar-button, .binders-word-count, .binders-crumbs > *')].filter(vis);
	const boxes = tb.map((e) => ({ cls: String(e.className).split(' ').slice(0, 3).join('.'), r: e.getBoundingClientRect() }));
	const overlaps = [];
	for (let i = 0; i < boxes.length; i++) for (let k = i + 1; k < boxes.length; k++) {
		const a = boxes[i].r, b = boxes[k].r;
		if (tb[i].contains(tb[k]) || tb[k].contains(tb[i])) continue;
		const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
		if (w > 2 && h > 2) overlaps.push(boxes[i].cls + ' × ' + boxes[k].cls);
	}
	const outside = [...v.querySelectorAll('.binders-toolbar *')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.right > vr.right + 1 || r.left < vr.left - 1; }).map((e) => String(e.className).split(' ').slice(0, 2).join('.'));
	const small = [...v.querySelectorAll('.binders-toolbar-button, .binders-mode-button, .binders-word-count, .binders-crumb[role="link"]')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { cls: String(e.className).split(' ').slice(0, 2).join('.'), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w < 32 || x.h < 32);
	return { body: ['is-phone', 'is-tablet', 'is-mobile'].filter((c) => document.body.classList.contains(c)).join(' '), view: [Math.round(vr.width), Math.round(vr.height)], overX: v.scrollWidth - v.clientWidth, scrollX: document.scrollingElement.scrollWidth - innerWidth, overlaps, outside: [...new Set(outside)], small };
})()`;

for (const [label, size] of TABLETS) for (const [orient, dims] of [['upright', size], ['on its side', side(size)]]) {
	test(`tablet ${label} ${orient}: each mode fits, the toolbar doesn't overlap, menus are popovers, targets are a finger wide`, async (p, h, t) => {
		await onDevice(p, dims, async () => {
			await open(p);
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await setMode(p, mode);
				if ((await viewState(p)).mode !== mode) continue;
				const f = await p.ev(LAYOUT);
				log(`${label} ${orient} ${mode}:`, j(f));
				await shot(p, `tablet-${dims[0]}x${dims[1]}-${mode}`);
				t.eq(f.overX <= 1 && f.scrollX <= 1, true, `${mode}: nothing overflows sideways (${f.overX}, ${f.scrollX})`);
				t.eq(j(f.overlaps), '[]', `${mode}: toolbar items don't overlap`);
				t.eq(j(f.outside), '[]', `${mode}: toolbar items stay in the view`);
				t.eq(j(f.small), '[]', `${mode}: toolbar targets are at least 32 px`);
			}
			await setMode(p, 'corkboard');
			await tap(p, ...(await p.at(`${LEAF} .binders-mode-button`).then((a) => [a.x, a.y])));
			const s = await sheet(p);
			t.ok(s && !isSheet(s), 'the mode menu is a popover, not a sheet: ' + j(s));
			await gone(p);
		});
	});
}


async function menuTap(p, title) {
	const find = `[...document.querySelectorAll('.menu .menu-item')].filter(e => (e.querySelector('.menu-item-title')?.textContent ?? '') === ${j(title)}).pop()`;
	if (!(await p.ev(`(() => { const it = ${find}; if (!it) return false; it.scrollIntoView({ block: 'center' }); return true; })()`))) return false;
	await p.sleep(250);
	const at = await p.ev(`(() => { const r = (${find}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await tap(p, at.x, at.y);
	return true;
}
/** Holds a card (by its foot, clear of its title) until its menu shows, then taps one of its items. */
async function cardDo(p, path, title) {
	const c = await p.at(`${LEAF} .binders-card[data-path="${path}"]`);
	await hold(p, c.x, c.t + c.h - 14);
	if (!(await menus(p))) throw new Error('no menu after holding ' + path);
	if (!(await menuTap(p, title))) throw new Error(`no “${title}”: ${j(await menuItems(p))}`);
	await p.sleep(400);
}

const NOTE = 'The Lighthouse/The Lighthouse.md';
const TOP = (l) => l.filter((x) => !x.includes('/')).join(',');

test('tablet with a keyboard and a trackpad: the mouse drags a card, a click selects, a right click opens a popover, Alt+arrow moves, F2 renames; a touch in the middle changes nothing about them', async (p, h, t) => {
	await onDevice(p, [820, 1180], async () => {
		await open(p);
		const before = await contents(p, NOTE);
		// mouse drag of Prologue onto the place after Epilogue
		const a = await p.at(`${LEAF} .binders-card[data-path="The Lighthouse/Prologue.md"]`);
		const e = await p.at(`${LEAF} .binders-card[data-path="The Lighthouse/Epilogue.md"]`);
		await p.drag(a.x, a.y + 20, e.x + e.w / 2 - 20, e.y, 16);
		await p.sleep(700);
		const after = await contents(p, NOTE);
		log('mouse drag:', TOP(before), '→', TOP(after));
		t.ok(TOP(after) !== TOP(before), 'a mouse drag on a tablet reorders');
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .is-dragging, .is-lifted').length`), 0, 'nothing is left dragging');
		// a touch, then the mouse again: a right click opens a popover (not a sheet) with the card's items
		const c = await p.at(`${LEAF} .binders-card[data-path="The Lighthouse/Epilogue.md"]`);
		await tap(p, c.x, c.t + c.h - 12);
		await p.right(c.x, c.t + c.h - 12);
		await p.sleep(400);
		const s = await sheet(p);
		t.ok(s && !isSheet(s), 'right click: a popover, on screen: ' + j(s));
		log('items', j(await menuItems(p)));
		await gone(p);
		// the keyboard: arrows, Alt+arrow, F2
		await p.ev(`document.querySelector('${LEAF} .binders-card[data-path="The Lighthouse/Epilogue.md"]').focus()`);
		await p.key('ArrowLeft', 'alt');
		await p.sleep(500);
		log('after Alt+Left', TOP(await contents(p, NOTE)));
		t.ok(await p.ev(`document.activeElement?.dataset?.path === 'The Lighthouse/Epilogue.md'`), 'the focus stays on the moved card');
		await p.key('F2'); await p.type('!'); await p.key('Enter');
		await p.sleep(500);
		t.ok(await p.ev(`app.vault.adapter.exists('The Lighthouse/!.md')`), 'F2 renames (typing replaces the selected name)');
		t.eq(await focusIs(p) !== 'BODY', true, 'focus is not lost: ' + (await focusIs(p)));
	});
});

const pinSidebar = (p, on) => p.ev(`(() => { const s = app.workspace.leftSplit; if (${on}) { s.expand(); s.setPinned?.(true); } else { s.setPinned?.(false); s.collapse(); } return 1; })()`);

for (const [label, dims] of [['768 × 1024', [768, 1024]], ['1024 × 768', [1024, 768]], ['820 × 1180', [820, 1180]]]) {
	test(`tablet ${label}: with the file explorer pinned beside the view every mode still fits (toolbar, rows, cards); unpinned it goes away and the view takes the room back`, async (p, h, t) => {
		await onDevice(p, dims, async () => {
			await open(p);
			const full = (await p.ev(LAYOUT)).view[0];
			await pinSidebar(p, true);
			await p.sleep(900);
			const sb = await p.ev(`Math.round(document.querySelector('.mod-left-split')?.getBoundingClientRect().width ?? 0)`);
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await setMode(p, mode);
				const f = await p.ev(LAYOUT);
				log(label, 'pinned', mode, 'sidebar', sb, j(f));
				await shot(p, `pinned-${dims[0]}x${dims[1]}-${mode}`);
				t.ok(f.view[0] < full, `${mode}: the view is narrower with the explorer pinned (${f.view[0]} < ${full})`);
				t.eq(f.overX <= 1 && f.scrollX <= 1, true, `${mode}: nothing overflows sideways (${f.overX}, ${f.scrollX})`);
				t.eq(j(f.overlaps), '[]', `${mode}: toolbar items don't overlap`);
				t.eq(j(f.outside), '[]', `${mode}: toolbar items stay in the view`);
			}
			// a binder in the explorer opens in the view beside it, with the explorer staying
			await setMode(p, 'corkboard');
			await pinSidebar(p, false);
			await p.sleep(700);
			t.eq((await p.ev(LAYOUT)).view[0], full, 'unpinned: the view has its width back');
		});
	});
}

test('tablet: the window resized to 500 px and back in the middle of each edit (a title, a synopsis, a new note’s name, the manuscript) keeps what was typed and the focus', async (p, h, t) => {
	await onDevice(p, [820, 1180], async () => {
		await open(p);
		const resize = async (w, hh) => { await metrics(p, w, hh); await p.sleep(700); };
		// 1. a card's title being renamed
		await cardDo(p, 'The Lighthouse/Prologue.md', 'Rename');
		t.ok(await p.ev(`document.activeElement?.matches('input, textarea, [contenteditable]')`), 'Rename starts an edit: ' + (await focusIs(p)));
		await p.type('Zed');
		await resize(500, 800);
		t.ok(await p.ev(`document.activeElement?.matches('input, textarea, [contenteditable]')`), 'narrowed: the title is still being edited');
		await resize(820, 1180);
		t.ok(await p.ev(`document.activeElement?.matches('input, textarea, [contenteditable]')`), 'widened: still editing');
		await p.key('Enter'); await p.sleep(600);
		t.ok(await p.ev(`app.vault.adapter.exists('The Lighthouse/Zed.md')`), 'the note is renamed to what was typed');
		// 2. the view's synopsis
		await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-view-synopsis'); e.focus(); return 1; })()`);
		await p.key('Enter'); await p.type('Resized synopsis');
		await resize(500, 800);
		t.eq(await p.ev(`document.activeElement?.value ?? document.activeElement?.textContent`), 'Resized synopsis', 'the synopsis is as typed after narrowing');
		await resize(820, 1180);
		t.eq(await p.ev(`document.activeElement?.value ?? document.activeElement?.textContent`), 'Resized synopsis', 'and after widening');
		await p.key('Tab'); await p.sleep(600);
		await flush(p);
		log('after Tab:', await focusIs(p), j((await read(p, NOTE)).slice(0, 200)));
		t.ok((await read(p, NOTE)).includes('Resized synopsis'), 'the synopsis is written');
		// (where the focus goes after the synopsis is the BUG test’s)
		// 3. in the manuscript
		await setMode(p, 'manuscript');
		const ed = await p.at(`${LEAF} .binders-manuscript-scene .cm-content`);
		await tap(p, ed.x, ed.y);
		await p.type(' AAA');
		await resize(500, 800);
		await p.type(' BBB');
		await resize(1180, 820);
		await p.type(' CCC');
		await resize(820, 1180);
		await p.sleep(800);
		await flush(p);
		const first = await read(p, 'The Lighthouse/Prologue.md').catch(() => '');
		const any = await p.ev(`(async () => { for (const f of app.vault.getMarkdownFiles()) { const t = await app.vault.read(f); if (t.includes('AAA')) return t; } return ''; })()`);
		log('note', j(any.slice(-120)));
		t.ok(/AAA BBB CCC/.test(any), 'what was typed through two resizes is in the note, once, in order');
		t.eq((any.match(/AAA/g) ?? []).length, 1, 'no doubling');
	});
});

bug('the binder’s own synopsis: after Escape, Tab or Ctrl+Enter in it the focus stays on it (a moment later the view draws it again, and the focus goes to <body>: a keyboard writer starts again from the top of the window)', async (p, h, t) => {
	await open(p);
	for (const [what, key, mod, typed] of [['Escape', 'Escape', null, 'x'], ['Tab, unchanged', 'Tab', null, ''], ['Tab, changed', 'Tab', null, 'q'], ['Ctrl+Enter', 'Enter', 'ctrl', 'q']]) {
		await p.ev(`document.querySelector('${LEAF} .binders-view-synopsis').focus()`);
		await p.key('Enter');
		if (typed) await p.type(typed);
		await (mod ? p.key(key, mod) : p.key(key));
		await p.sleep(800);
		const f = await focusIs(p);
		t.ok(f !== 'BODY', `${what}: the focus is on something after the view has drawn again (${f})`);
	}
});

// ======================================================================== keyboard only: where the focus is after each action
/** Presses what `act` does, waits for the view to draw again, and says what has the focus. */
async function after(p, what, act, out) {
	await act();
	await p.sleep(900);
	const f = await focusIs(p);
	out.push(`${what} → ${f}`);
	if (process.env.QA6_TRACE) log(out[out.length - 1], '| leaf:', await p.ev(`app.workspace.getMostRecentLeaf()?.view?.getViewType()`));
	return f;
}
const pickKeys = async (p, ...titles) => {
	// a menu opened from the keyboard: arrow to the title and Enter, one level at a time
	for (const title of titles) {
		let n = 0;
		for (; n < 40; n++) {
			const on = await p.ev(`document.querySelector('.menu:last-of-type .menu-item.selected .menu-item-title, .menu .menu-item.selected .menu-item-title')?.textContent ?? null`);
			if (on === title) break;
			await p.key('ArrowDown');
		}
		await p.key('Enter');
		await p.sleep(300);
	}
};

test('keyboard only, corkboard: after a move (Alt+arrow), a delete and its dialog, an undo, a new note, a status from the menu, the focus is on a card or a control, never <body>', async (p, h, t) => {
	await open(p);
	const out = [];
	const bad = [];
	const chk = async (what, act) => { const f = await after(p, what, act, out); if (f === 'BODY') bad.push(what); };
	await p.ev(`document.querySelector('${LEAF} .binders-card[data-path$="Prologue.md"]').focus()`);
	await chk('Alt+Right (move)', () => p.key('ArrowRight', 'alt'));
	await chk('Alt+Left (move back)', () => p.key('ArrowLeft', 'alt'));
	await chk('undo command', () => h.run('undo-move'));
	await p.ev(`document.querySelector('${LEAF} .binders-card[data-path$="Epilogue.md"]').focus()`);
	await chk('Delete: dialog shows', () => p.key('Delete'));
	await chk('Delete: Escape', () => p.key('Escape'));
	await p.ev(`document.querySelector('${LEAF} .binders-card[data-path$="Epilogue.md"]').focus()`);
	await p.key('Delete'); await p.sleep(500);
	await chk('Delete: confirmed with Enter', () => p.key('Enter'));
	await p.ev(`document.querySelector('${LEAF} .binders-card[data-path$="Prologue.md"]').focus()`);
	await p.key('F10', 'shift'); await p.sleep(300);
	await chk('menu: Set status → pick', () => pickKeys(p, 'Set status', 'Draft'));
	await p.ev(`document.querySelector('${LEAF} .binders-card-new').focus()`);
	await p.key('Enter'); await p.type('Fresh'); 
	await chk('new note named, Enter', () => p.key('Enter'));
	await chk('undo again', () => h.run('undo-move'));
	log(out.join(' | '));
	t.eq(j(bad), '[]', 'the focus is never <body> after: ' + j(bad));
});

test('keyboard only, outliner: after a rename, Space on a folder, a delete, a status cell’s menu, a sort from the header, the focus is on a row or a control, never <body>', async (p, h, t) => {
	await open(p);
	await setMode(p, 'outliner');
	const out = [], bad = [];
	const chk = async (what, act) => { const f = await after(p, what, act, out); if (f === 'BODY') bad.push(what); };
	const row = (n) => p.ev(`document.querySelector('${LEAF} .binders-outliner-row[data-path$="${n}"]').focus()`);
	await row('Prologue.md');
	await chk('F2, typing, Enter', async () => { await p.key('F2'); await p.type('Pro'); await p.key('Enter'); });
	await row('Part One');
	await chk('Space folds Part One', () => p.key(' '));
	await chk('Space opens it again', () => p.key(' '));
	await row('Arrival.md');
	await chk('Alt+Down (move)', () => p.key('ArrowDown', 'alt'));
	await chk('Alt+Up (move back)', () => p.key('ArrowUp', 'alt'));
	await chk('undo', () => h.run('undo-move'));
	// a status cell: Right x2 (Label, Status) then Enter opens its menu
	await row('Arrival.md');
	await p.key('ArrowRight'); await p.key('ArrowRight');
	log('cell', await focusIs(p));
	await chk('status cell menu opened with Enter', () => p.key('Enter'));
	await chk('status menu: Escape', () => p.key('Escape'));
	await p.key('ArrowRight'); await p.key('ArrowRight'); await p.key('Enter'); await p.sleep(300);
	await chk('status menu: pick an item', async () => { await p.key('ArrowDown'); await p.key('Enter'); });
	// sort by a header
	await p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-th')].find(e => /Words/.test(e.textContent)).focus()`);
	await chk('header: Enter on Words', () => p.key('Enter'));
	await row('Epilogue.md');
	await p.key('Delete'); await p.sleep(500);
	await chk('Delete confirmed', () => p.key('Enter'));
	log(out.join(' | '));
	t.eq(j(bad), '[]', 'the focus is never <body> after: ' + j(bad));
});

ux('outliner: Escape in a menu opened from a cell (Status, Label) closes the menu and leaves the focus on the cell, as it does after a pick; it goes on to the row (the same Escape reaches the cell’s own handler, which backs out one level more)', async (p, h, t) => {
	await open(p);
	await setMode(p, 'outliner');
	await p.ev(`document.querySelector('${LEAF} .binders-outliner-row[data-path$="Arrival.md"]').focus()`);
	await p.key('ArrowRight'); await p.key('ArrowRight');
	const cell = await focusIs(p);
	await p.key('Enter'); await p.sleep(300);
	t.ok(await menus(p), 'Enter opens the cell’s menu');
	await p.key('Escape'); await p.sleep(500);
	t.eq(await menus(p), 0, 'Escape closes it');
	t.eq(await focusIs(p), cell, 'and the focus is back on the cell it came from');
});

// ======================================================================== tooltips (needs hover: run with --hover)
/** Marks every icon-only button of the view (no label showing) with data-qa6 and says what they are. */
const MARK_ICON_ONLY = `(() => {
	document.querySelectorAll('[data-qa6]').forEach((e) => e.removeAttribute('data-qa6'));
	const out = []; let k = 0;
	for (const e of document.querySelectorAll('${LEAF} .binders-view :is([role="button"], .clickable-icon, .text-icon-button, .binders-toolbar-button)')) {
		const r = e.getBoundingClientRect();
		if (!r.width || !r.height || e.closest('[aria-hidden="true"], .is-hidden')) continue;
		const lab = e.querySelector('.text-button-label');
		const labelShown = lab ? getComputedStyle(lab).display !== 'none' : false;
		if ((e.textContent ?? '').trim() && !(lab && !labelShown)) continue;
		if (labelShown) continue;
		e.setAttribute('data-qa6', String(k)); out.push({ k: k++, cls: String(e.className).split(' ').slice(0, 3).join('.'), label: e.getAttribute('aria-label') });
	}
	return out;
})()`;

async function tooltipAudit(p, t, where, missing) {
	for (const mode of ['corkboard', 'outliner', 'manuscript']) {
		await setMode(p, mode);
		const list = await p.ev(MARK_ICON_ONLY);
		for (const { k, cls, label } of list) {
			const tip = await p.hover(`[data-qa6="${k}"]`, { ms: 1400 });
			log(where, mode, cls, '|', label, '| tooltip:', tip);
			if (!tip) missing.push(`${where} ${mode}: ${label}`);
			await p.move(5, 5, 2);
		}
	}
}
test('hover: every icon-only control names itself in a tooltip (desktop, and in a narrow pane where the toolbar is icons only)', async (p, h, t) => {
	if ((await p.pointer()) !== 'mouse') { log('(run with --hover)'); return; }
	await open(p);
	const missing = [];
	await tooltipAudit(p, t, 'wide', missing);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 800, deviceScaleFactor: 1, mobile: false });
	await p.sleep(600);
	try { await tooltipAudit(p, t, '500 px', missing); } finally { await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); }
	t.eq(j(missing), '[]', 'every icon-only control has a tooltip');
});

// (needs hover: run with --hover)
a11y('manuscript: the “Focus mode” button, which is an icon with no label, says what it is when pointed at (every other icon-only button of the toolbar does; this one’s tooltip is turned off by `.binders-toolbar-button { --no-tooltip: true }` and only the narrow-pane rule turns it back on)', async (p, h, t) => {
	if ((await p.pointer()) !== 'mouse') { log('(run with --hover)'); return; }
	await open(p);
	await setMode(p, 'manuscript');
	t.eq(await p.hover(`${LEAF} .binders-focus-button`, { ms: 1800 }), 'Focus mode', 'a tooltip names the Focus mode button');
});

// ======================================================================== contrast, light and dark (run with --theme both)
/** Gives the Lighthouse's notes every default label, a status and a target, so each tint and chip shows. */
async function dress(p) {
	await p.ev(`(async () => {
		const labels = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'];
		const files = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith('The Lighthouse/') && !f.name.startsWith('The Lighthouse'));
		let i = 0;
		for (const f of files) await app.fileManager.processFrontMatter(f, (fm) => { fm.label = labels[i++ % labels.length]; fm.status = ['Idea', 'Draft', 'Revised', 'Done'][i % 4]; if (i === 2) fm.target = 40; });
		return 1;
	})()`);
	await p.sleep(900);
}
const WANT_TEXT = 4.5, WANT_UI = 3;

test('contrast: titles, synopses, chips, the toolbar and the outliner’s headers and values reach 4.5:1 (the faint counts and placeholders are the findings below and Obsidian’s own convention)', async (p, h, t) => {
	await open(p);
	await dress(p);
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	await p.ev(CONTRAST);
	const rows = [];
	const m = (name, sel, i = 0, need = WANT_TEXT) => rows.push({ name, sel, i, need });
	// corkboard
	m('card title', `${LEAF} .binders-card[data-path] .binders-card-title`);
	m('card synopsis', `${LEAF} .binders-card[data-path] .binders-card-synopsis`);
	m('card words (tinted)', `${LEAF} .binders-card.has-label .binders-card-words`);
	m('stack held names', `${LEAF} .binders-card.is-stack .binders-card-held-name`);
	m('status chip', `${LEAF} .binders-card .binders-chip`);
	m('word count', `${LEAF} .binders-word-count`);
	m('toolbar label', `${LEAF} .binders-filter-button .text-button-label`);
	await setMode(p, 'corkboard');
	const out = {};
	const fail = [];
	const measure = async (r) => {
		const c = await p.ev(`(() => { const e = document.querySelectorAll(${j(r.sel)})[${r.i}]; return e ? window.__contrast(e) : null; })()`);
		out[r.name] = c;
		if (!c) { log('(not on screen)', r.name); return; }
		if (c.ratio < r.need) fail.push(`${r.name} ${c.ratio} (${c.fg} on ${c.bg})`);
	};
	for (const r of rows) await measure(r);
	await setMode(p, 'outliner');
	for (const r of [
		{ name: 'outliner header', sel: `${LEAF} .binders-outliner-th[data-col="status"]`, i: 0, need: WANT_TEXT },
		{ name: 'outliner title', sel: `${LEAF} .binders-outliner-row .binders-outliner-name`, i: 0, need: WANT_TEXT },
		{ name: 'outliner synopsis', sel: `${LEAF} .binders-outliner-row .binders-outliner-synopsis`, i: 0, need: WANT_TEXT },
		{ name: 'outliner word value', sel: `${LEAF} .binders-outliner-row .binders-outliner-value`, i: 0, need: WANT_TEXT },
		{ name: 'outliner folder total', sel: `${LEAF} .binders-outliner-row.is-folder .binders-outliner-cell[data-col="words"]`, i: 0, need: WANT_TEXT },
		{ name: 'outliner status chip', sel: `${LEAF} .binders-outliner-row .binders-chip`, i: 0, need: WANT_TEXT },
	]) await measure(r);
	log((dark ? 'dark' : 'light') + ' contrast', j(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v && v.ratio]))));
	// references: Obsidian's own muted and faint text on the primary background
	const ref = await p.ev(`(() => { const mk = (c) => { const e = document.body.createDiv(); e.style.color = c; e.textContent = 'x'; document.body.appendChild(e); const r = window.__contrast(e, getComputedStyle(document.body).getPropertyValue('--background-primary')); e.remove(); return r.ratio; }; return { muted: mk('var(--text-muted)'), faint: mk('var(--text-faint)'), normal: mk('var(--text-normal)') }; })()`);
	log('Obsidian itself on --background-primary:', j(ref));
	t.eq(j(fail), '[]', 'every text Binders draws reaches 4.5:1');
});

a11y('contrast: the counts Binders prints (a card’s words, a folder card’s notes and words, the outliner’s total row) are in muted text, 4.5:1 or better (they’re in the faintest text: 2.3:1 in the light theme, 3.0:1 in the dark)', async (p, h, t) => {
	await open(p);
	await p.ev(CONTRAST);
	const need = 4.5, fail = [];
	const probe = async (name, sel) => {
		const c = await p.ev(`(() => { const e = document.querySelector(${j(sel)}); return e ? window.__contrast(e) : null; })()`);
		log(name, j(c));
		if (c && c.ratio < need) fail.push(`${name} ${c.ratio}`);
	};
	await probe('a note card’s words', `${LEAF} .binders-card:not(.is-stack) .binders-card-words`);
	await probe('a folder card’s count', `${LEAF} .binders-card.is-stack .binders-card-words`);
	await setMode(p, 'outliner');
	await probe('the outliner’s total row', `${LEAF} .binders-outliner-foot .binders-outliner-cell.mod-title`);
	t.eq(j(fail), '[]', 'counts reach 4.5:1');
});

a11y('contrast: the ring of a selected labeled card is seen against the board: the ring that is drawn (the label, taken 35% toward the text color in a light theme, since 0.12.66) reaches 3:1 on the page for every default label', async (p, h, t) => {
	await open(p);
	await p.ev(CONTRAST);
	const P = 'The Lighthouse/Prologue.md', sel = `${LEAF} .binders-card[data-path="${P}"]`;
	const res = {};
	for (const name of ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink']) {
		await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(P)}), fm => { fm.label = ${j(name[0].toUpperCase() + name.slice(1))}; }).then(() => 1)`);
		await until(p, `document.querySelector(${j(sel)})?.classList.contains('has-label')`);
		await p.sleep(300);
		const c = await p.at(sel);
		await p.click(c.x, c.t + c.h - 12);
		await p.sleep(500); // the ring fades in
		// (the ring as drawn: the selected card's outline or its box-shadow's first color)
		res[name] = await p.ev(`(() => {
			const e = document.querySelector(${j(sel)}); if (!e?.classList.contains('is-selected')) return null;
			const cs = getComputedStyle(e);
			const leading = (s) => { const m = /^\\s*(rgba?\\([^)]*\\)|color\\([^)]*\\)|oklch\\([^)]*\\)|oklab\\([^)]*\\)|#[0-9a-f]+)/i.exec(s); return m ? m[1] : null; };
			const color = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? cs.outlineColor : cs.boxShadow !== 'none' ? leading(cs.boxShadow) : null;
			if (!color) return null;
			const page = window.__over(window.__parse(getComputedStyle(document.body).getPropertyValue('--background-primary') || '#fff'), [255, 255, 255, 1]);
			return Math.round(window.__ratio(window.__over(window.__parse(color), page), page) * 100) / 100;
		})()`);
	}
	log('drawn ring contrast by label', j(res));
	t.ok(Object.values(res).every((r) => r !== null), 'a selected labeled card has a ring drawn: ' + j(res));
	const low = Object.entries(res).filter(([, r]) => r !== null && r < 3).map(([l, r]) => `${l} ${r}`);
	t.eq(j(low), '[]', 'each label’s ring, as drawn, reaches 3:1: ' + j(res));
});

test('contrast: every focus ring Binders draws (toolbar, cards, rows, headers, titles) is as strong as the ring on Obsidian’s own icon buttons (Obsidian’s own is 1.9:1 in light, 2.3:1 in dark: a theme matter, not Binders’)', async (p, h, t) => {
	await open(p);
	await p.ev(CONTRAST);
	const ringNow = () => p.ev(`(() => {
		const e = document.activeElement; if (!e || e === document.body) return null;
		const cs = getComputedStyle(e);
		const leading = (s) => { const m = /^\\s*(rgba?\\([^)]*\\)|color\\([^)]*\\)|oklch\\([^)]*\\)|oklab\\([^)]*\\)|#[0-9a-f]+)/i.exec(s); return m ? m[1] : null; };
		let src = null, color = null;
		if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) { src = 'outline'; color = cs.outlineColor; }
		else if (cs.boxShadow !== 'none') { src = 'shadow'; color = leading(cs.boxShadow); }
		else { const a = getComputedStyle(e, '::after'); if (a.boxShadow !== 'none') { src = 'after'; color = leading(a.boxShadow); } }
		if (!color) return { cls: String(e.className).split(' ').slice(0, 3).join('.'), src: null };
		const page = window.__parse(getComputedStyle(document.body).getPropertyValue('--background-primary') || '#fff');
		const fg = window.__parse(color);
		return { cls: String(e.className).split(' ').slice(0, 3).join('.'), src, ratio: Math.round(window.__ratio(window.__over(fg, window.__over(page, [255, 255, 255, 1])), window.__over(page, [255, 255, 255, 1])) * 100) / 100 };
	})()`);
	const seen = new Map();
	for (const mode of ['corkboard', 'outliner', 'manuscript']) {
		await setMode(p, mode);
		await p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'); v.setAttribute('tabindex', '-1'); v.focus(); v.removeAttribute('tabindex'); return 1; })()`);
		for (let i = 0; i < 14; i++) {
			await p.key('Tab');
			await p.sleep(400);
			const r = await ringNow();
			if (r?.cls && !seen.has(r.cls)) seen.set(r.cls, r);
		}
	}
	log([...seen.values()].map((r) => `${r.cls}: ${r.ratio ?? r.src}`).join(' | '));
	const base = Math.max(...[...seen.values()].filter((r) => /clickable-icon/.test(r.cls)).map((r) => r.ratio));
	const low = [...seen.values()].filter((r) => r.ratio !== undefined && r.ratio < base - 0.05).map((r) => `${r.cls} ${r.ratio} (Obsidian’s ${base})`);
	t.eq(j(low), '[]', 'rings are as strong as Obsidian’s');
});

a11y('forced colors (Windows high contrast): a focused or selected card, a focused row and a focused toolbar button still show a ring (the rings are box-shadows, which forced colors removes; there is no `@media (forced-colors: active)` rule giving them an outline)', async (p, h, t) => {
	await open(p);
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
	try {
		await p.sleep(400);
		t.ok(await p.ev(`matchMedia('(forced-colors: active)').matches`), 'forced colors are on');
		const ring = () => p.ev(`(() => { const e = document.activeElement; if (!e) return null; const cs = getComputedStyle(e); const a = getComputedStyle(e, '::after'); return { cls: String(e.className).split(' ').slice(0, 2).join('.'), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow !== 'none' || a.boxShadow !== 'none' }; })()`);
		const miss = [];
		await p.ev(`document.querySelector('${LEAF} .binders-card[data-path]').focus()`);
		await p.key('ArrowRight'); await p.sleep(500);
		let r = await ring(); log('card', j(r)); if (!r.outline) miss.push('selected card');
		await p.ev(`document.querySelector('${LEAF} .binders-filter-button').focus()`);
		await p.sleep(300);
		r = await ring(); log('filter button', j(r)); if (!r.outline) miss.push('toolbar button');
		await setMode(p, 'outliner');
		await p.ev(`document.querySelector('${LEAF} .binders-outliner-row').focus()`);
		await p.key('ArrowDown'); await p.sleep(500);
		r = await ring(); log('row', j(r)); if (!r.outline) miss.push('outliner row');
		await p.key('Tab'); await p.key('Tab'); await p.sleep(300);
		log('Obsidian’s own, for comparison (the next controls Tab reaches):', j(await ring()));
		await p.ev(`document.querySelector('.workspace-tab-header-container .clickable-icon, .clickable-icon.view-action').focus()`);
		await p.key('Tab', 'shift'); await p.key('Tab'); await p.sleep(300);
		log('Obsidian’s own clickable-icon', j(await ring()));
		t.eq(j(miss), '[]', 'what has the focus shows an outline in forced colors');
	} finally { await p.send('Emulation.setEmulatedMedia', { features: [] }); }
});

test('reduced motion: with “reduce motion” on, nothing of Binders’ moves, spins or scales over time (a 0.14 s fade of a card’s edge is left: it moves nothing)', async (p, h, t) => {
	await open(p);
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
	try {
		await p.sleep(300);
		const found = {};
		const scan = async (mode) => {
			await setMode(p, mode);
			const r = await p.ev(`(() => {
				const out = {};
				const ms = (s) => Math.max(0, ...s.split(',').map((x) => parseFloat(x) * (x.includes('ms') ? 1 : 1000)));
				for (const e of document.querySelectorAll('${LEAF} .binders-view *')) for (const pseudo of [null, '::before', '::after']) {
					const cs = getComputedStyle(e, pseudo);
					const tr = ms(cs.transitionDuration), an = cs.animationName !== 'none' ? ms(cs.animationDuration) : 0;
					if (tr <= 0 && an <= 0) continue;
					const props = cs.transitionProperty;
					// (colors alone are fine: they don't move)
					const moving = an > 0 || /all|transform|translate|scale|rotate|width|height|top|left|margin|inset|opacity/.test(props);
					if (!moving) continue;
					const k = String(e.className).split(' ').slice(0, 2).join('.') + (pseudo ?? '') + ' ' + (an > 0 ? 'animation ' + cs.animationName : 'transition ' + props + ' ' + cs.transitionDuration);
					out[k] = (out[k] ?? 0) + 1;
				}
				return out;
			})()`);
			Object.assign(found, r);
		};
		for (const m of ['corkboard', 'outliner', 'manuscript']) await scan(m);
		log(j(found));
		// (Obsidian’s own: its icons, the embeds’ node-inserted, the editor’s caret blink)
	const mine = Object.keys(found).filter((k) => /^binders-/.test(k) && !/transition box-shadow, opacity/.test(k));
	t.eq(j(mine), '[]', 'nothing moves over time');
	} finally { await p.send('Emulation.setEmulatedMedia', { features: [] }); }
});

// ======================================================================== appearance
const setFont = (p, px) => p.ev(`(() => { app.vault.setConfig('baseFontSize', ${px}); app.updateFontSize?.(); return 1; })()`);
const setRtl = (p, on) => p.ev(`(() => { document.body.classList.toggle('mod-rtl', ${on}); document.documentElement.dir = ${on} ? 'rtl' : ''; document.body.dir = ${on} ? 'rtl' : ''; return 1; })()`);
/** Things that look wrong on the page right now: clipped text with no ellipsis, parts of a card or row that overlap. */
const LOOKS = `(() => {
	const v = document.querySelector('${LEAF} .binders-view'); if (!v) return null;
	const bad = [];
	const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
	const name = (e) => String(e.className).split(' ').slice(0, 3).join('.');
	// text cut off without an ellipsis (a clamp of lines is meant)
	for (const e of v.querySelectorAll('.binders-card *, .binders-outliner-row *, .binders-toolbar *, .binders-outliner-th')) {
		if (!vis(e) || !(e.textContent ?? '').trim() || e.children.length > 2) continue;
		const cs = getComputedStyle(e);
		if (!/hidden|clip/.test(cs.overflowX) || cs.textOverflow === 'ellipsis' || /-webkit-box/.test(cs.display)) continue;
		if (e.scrollWidth > e.clientWidth + 1) bad.push('clipped ' + name(e) + ' "' + e.textContent.trim().slice(0, 24) + '" ' + e.scrollWidth + '>' + e.clientWidth);
	}
	// cards: head, words and chip must not overlap
	for (const c of v.querySelectorAll('.binders-card[data-path]')) {
		const parts = [...c.querySelectorAll(':scope > .binders-card-head, :scope > .binders-card-footer > *')].filter(vis);
		const rs = parts.map((e) => e.getBoundingClientRect());
		for (let i = 0; i < rs.length; i++) for (let k = i + 1; k < rs.length; k++) {
			const w = Math.min(rs[i].right, rs[k].right) - Math.max(rs[i].left, rs[k].left), h = Math.min(rs[i].bottom, rs[k].bottom) - Math.max(rs[i].top, rs[k].top);
			if (w > 2 && h > 2) bad.push('overlap in card ' + (c.dataset.path.split('/').pop()) + ': ' + name(parts[i]) + ' × ' + name(parts[k]));
		}
		const cr = c.getBoundingClientRect();
		for (const e of c.querySelectorAll('*')) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.bottom > cr.bottom + 1 || r.right > cr.right + 1 || r.left < cr.left - 1) { if (!e.closest('.binders-card-held')) bad.push('outside card ' + (c.dataset.path.split('/').pop()) + ': ' + name(e)); break; } }
	}
	return [...new Set(bad)];
})()`;

for (const [label, px, rtl] of [['font 12', 12, false], ['font 30', 30, false], ['right to left, font 16', 16, true], ['right to left, font 30', 30, true]]) {
	test(`appearance: ${label}: each mode shows nothing clipped or overlapping, in the toolbar, cards and rows`, async (p, h, t) => {
		await open(p);
		await dress(p);
		try {
			await setFont(p, px);
			if (rtl) await setRtl(p, true);
			await p.sleep(900);
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await setMode(p, mode);
				const f = await p.ev(LAYOUT), looks = await p.ev(LOOKS);
				log(label, mode, j({ over: [f.overX, f.scrollX], overlaps: f.overlaps, outside: f.outside }), j(looks));
				await shot(p, `appearance-${label.replace(/\W+/g, '-')}-${mode}`);
				t.eq(j(f.overlaps), '[]', `${mode}: toolbar items don't overlap`);
				t.eq(j(f.outside), '[]', `${mode}: toolbar items stay in the view`);
				t.eq(j(looks), '[]', `${mode}: nothing clipped or overlapping`);
			}
		} finally { await setFont(p, 16); await setRtl(p, false); }
	});
}

const probeCss = (p, css) => p.ev(`(() => { document.getElementById('qa6-theme')?.remove(); if (${j(css)}) { const s = document.head.createEl('style', { attr: { id: 'qa6-theme' } }); s.textContent = ${j(css)}; } return 1; })()`);
const THEMES = [
	['interface text 1.5 times larger (a theme’s --font-ui sizes)', 'body { --font-ui-smaller: 18px; --font-ui-small: 21px; --font-ui-medium: 24px; --font-ui-large: 30px; }'],
	['a compact theme (small interface text, tight spacing, square corners)', 'body { --font-ui-smaller: 10px; --font-ui-small: 11px; --font-ui-medium: 12px; --radius-s: 0; --radius-m: 0; --radius-l: 0; --size-4-1: 2px; --size-4-2: 3px; --size-4-3: 4px; --size-4-4: 6px; --size-2-1: 1px; --size-2-2: 2px; --size-2-3: 2px; }'],
	['a roomy theme with round corners, thick borders and a wide serif', 'body { --radius-s: 20px; --radius-m: 28px; --radius-l: 40px; --border-width: 3px; --font-interface-theme: Georgia, serif; --font-text-theme: Georgia, serif; --size-4-1: 8px; --size-4-2: 14px; --size-4-3: 20px; --size-4-4: 28px; --input-height: 44px; --icon-size: 24px; --icon-s: 20px; --icon-m: 24px; }'],
	['a theme with translucent panes (no solid page behind)', 'body { --background-primary: rgba(255, 255, 255, 0.4); --background-secondary: rgba(255, 255, 255, 0.3); --bases-cards-background: rgba(255,255,255,0.4); }'],
];
for (const [label, css] of THEMES) {
	test(`appearance: ${label}: each mode shows nothing clipped or overlapping`, async (p, h, t) => {
		await open(p);
		await dress(p);
		try {
			await probeCss(p, css);
			await p.sleep(700);
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await setMode(p, mode);
				const f = await p.ev(LAYOUT), looks = await p.ev(LOOKS);
				log(label.slice(0, 30), mode, j({ over: [f.overX, f.scrollX], overlaps: f.overlaps, outside: f.outside }), j(looks));
				await shot(p, `theme-${label.slice(0, 12).replace(/\W+/g, '-')}-${mode}`);
				t.eq(j(f.overlaps), '[]', `${mode}: toolbar items don't overlap`);
				t.eq(j(f.outside), '[]', `${mode}: toolbar items stay in the view`);
				t.eq(j(looks), '[]', `${mode}: nothing clipped or overlapping`);
			}
		} finally { await probeCss(p, ''); }
	});
}

for (const [label, [w, hh, dsf]] of [['zoom 200% (a 720 × 450 window)', [720, 450, 2]], ['zoom 300% (a 480 × 300 window)', [480, 300, 3]]]) {
	test(`appearance: ${label}: every mode is usable (nothing sideways, the toolbar in reach)`, async (p, h, t) => {
		await open(p);
		try {
			await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: hh, deviceScaleFactor: dsf, mobile: false });
			await p.sleep(900);
			for (const mode of ['corkboard', 'outliner', 'manuscript']) {
				await setMode(p, mode);
				const f = await p.ev(LAYOUT), looks = await p.ev(LOOKS);
				log(label, mode, j({ view: f.view, over: [f.overX, f.scrollX], overlaps: f.overlaps, outside: f.outside, small: f.small }), j(looks));
				await shot(p, `zoom-${w}-${mode}`);
				t.eq(f.overX <= 1 && f.scrollX <= 1, true, `${mode}: nothing overflows sideways`);
				t.eq(j(f.overlaps), '[]', `${mode}: toolbar items don't overlap`);
				t.eq(j(f.outside), '[]', `${mode}: toolbar items stay in the view`);
				t.eq(j(looks), '[]', `${mode}: nothing clipped or overlapping`);
			}
		} finally { await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); }
	});
}

// ======================================================================== dialogs from the keyboard
const inModal = () => `(() => { const a = document.activeElement; const m = [...document.querySelectorAll('.modal')].pop(); return !!(m && a && m.contains(a)); })()`;
test('keyboard only: each dialog (set target, compile, delete, snapshots, “Put in a new folder”) takes the focus when it opens, keeps it through Tab and Shift+Tab, and gives it back to the card on Escape', async (p, h, t) => {
	await open(p);
	const results = [];
	const cardPath = 'The Lighthouse/Prologue.md';
	const toCard = () => p.ev(`document.querySelector('${LEAF} .binders-card[data-path="${cardPath}"]').focus()`);
	const dialogs = [
		['set target', async () => { await h.run('set-target'); }],
		['compile', async () => { await h.run('compile'); }],
		['delete', async () => { await p.key('Delete'); }],
		['snapshots', async () => { await h.run('show-snapshots'); }],
	];
	for (const [name, open_] of dialogs) {
		await toCard();
		await p.key('ArrowRight'); await p.key('ArrowLeft'); // (selects the card, so commands for a note apply)
		await open_();
		await p.sleep(700);
		const has = await p.ev(`document.querySelectorAll('.modal').length`);
		if (!has) { log(name, '→ no dialog'); results.push(name + ': none'); continue; }
		const first = await p.ev(inModal());
		let escaped = 0;
		for (let i = 0; i < 14; i++) { await p.key('Tab', i % 3 === 2 ? 'shift' : undefined); if (!(await p.ev(inModal()))) escaped++; }
		await p.key('Escape'); await p.sleep(600);
		const left = await p.ev(`document.querySelectorAll('.modal').length`);
		const f = await focusIs(p);
		log(name, j({ focusInside: first, escapedOnTab: escaped, closedByEscape: !left, after: f }));
		results.push(`${name}: inside ${first}, escaped ${escaped}, closed ${!left}, back on ${f}`);
		t.ok(first, `${name}: the focus is in the dialog when it opens`);
		t.eq(escaped, 0, `${name}: Tab never leaves the dialog`);
		t.eq(left, 0, `${name}: Escape closes it`);
		t.ok(f !== 'BODY', `${name}: the focus goes back somewhere after Escape (${f})`);
		for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.modal').length`)); i++) { await p.key('Escape'); await p.sleep(300); }
	}
});

// ======================================================================== turned or resized in the middle of a drag
const base = (l) => l.map((x) => x.split('/').filter(Boolean).pop()).sort().join('|');
const STUCK = `document.querySelectorAll('.binders-drag-ghost, .is-dragging, .is-lifted, .binders-drop-line, .is-being-dragged-over, .binders-drag-source').length`;
for (const [what, mode, sel] of [['a card', 'corkboard', (n) => `${LEAF} .binders-card[data-path="The Lighthouse/${n}"]`], ['an outliner row', 'outliner', (n) => `${LEAF} .binders-outliner-row[data-path="The Lighthouse/${n}"] .binders-outliner-name`]]) {
	test(`tablet: ${what} carried by a long press and the tablet turned on its side (and back) before the drop: the drop lands where it is let go or nowhere, the order on disk is whole, nothing stays lifted`, async (p, h, t) => {
		await onDevice(p, [820, 1180], async () => {
			await open(p);
			await setMode(p, mode);
			const before = await contents(p, NOTE);
			const a = await p.at(sel('Prologue.md'));
			await touch(p, 'touchStart', a.x, a.y + (mode === 'corkboard' ? 20 : 0));
			await p.sleep(700);
			for (let i = 1; i <= 8; i++) { await touch(p, 'touchMove', a.x + 30 * i, a.y + 10 * i); await p.sleep(20); }
			log('lifted during the drag:', await p.ev(STUCK));
			await metrics(p, 1180, 820);
			await p.sleep(500);
			for (let i = 1; i <= 6; i++) { await touch(p, 'touchMove', 600 + 10 * i, 300); await p.sleep(20); }
			await metrics(p, 820, 1180);
			await p.sleep(400);
			for (let i = 1; i <= 4; i++) { await touch(p, 'touchMove', 500 + 10 * i, 400); await p.sleep(20); }
			await touch(p, 'touchEnd');
			await p.sleep(900);
			await flush(p);
			const after = await contents(p, NOTE);
			log(what, 'order', TOP(before), '→', TOP(after), '| stuck:', await p.ev(STUCK));
			t.eq(base(after), base(before), 'the same items are in the binder, once each (it may have been dropped into a folder)');
			t.eq(await p.ev(STUCK), 0, 'nothing is left lifted or dragging');
			t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-view')`), 'the view is still there');
			// and the next touch works (on the toolbar's empty room: a tap 200 px down could land on a note's name, which
			// opens the note, by design, and the leaf would no longer be the binder's)
			const room = await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-toolbar-spacer') ?? document.querySelector('${LEAF} .binders-toolbar'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			await tap(p, room.x, room.y);
			await setMode(p, mode === 'corkboard' ? 'outliner' : 'corkboard');
			t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-view .binders-toolbar')`), 'and the view still answers');
		});
	});
}

test('tablet with a mouse: a card dragged and the window narrowed to 500 px and widened again before the drop: the same', async (p, h, t) => {
	await onDevice(p, [820, 1180], async () => {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await open(p);
		const before = await contents(p, NOTE);
		const a = await p.at(`${LEAF} .binders-card[data-path="The Lighthouse/Prologue.md"]`);
		await p.focusMain();
		await p.move(a.x, a.y + 20, 2);
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y + 20, button: 'left', clickCount: 1 });
		await p.move(a.x + 120, a.y + 80, 10, { buttons: 1 });
		await metrics(p, 500, 800);
		await p.sleep(500);
		await p.move(300, 300, 8, { buttons: 1 });
		await metrics(p, 820, 1180);
		await p.sleep(400);
		await p.move(400, 300, 8, { buttons: 1 });
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 300, button: 'left', clickCount: 1 });
		await p.sleep(900);
		await flush(p);
		const after = await contents(p, NOTE);
		log('order', TOP(before), '→', TOP(after), '| stuck:', await p.ev(STUCK));
		t.eq(base(after), base(before), 'the same items, once each (it may have been dropped into a folder)');
		t.eq(await p.ev(STUCK), 0, 'nothing is left dragging');
	});
});

// ======================================================================== split panes
const splitWith = (p, state) => p.ev(`(async () => {
	const leaf = app.workspace.getLeaf('split', 'vertical');
	await leaf.setViewState(${j(state)}, { focus: true });
	app.workspace.setActiveLeaf(leaf, { focus: true });
	return 1;
})()`);
/** What each pane shows: width, mode and toolbar trouble, by pane. */
const PANES = `(() => [...document.querySelectorAll('.workspace-split.mod-root .workspace-leaf')].map((l) => {
	const v = l.querySelector('.binders-view'); const r = l.getBoundingClientRect();
	if (!v) return { type: l.querySelector('.view-content')?.className.split(' ').slice(0, 2).join('.') ?? '?', w: Math.round(r.width) };
	const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
	const tb = [...v.querySelectorAll('.binders-toolbar > *')].filter(vis);
	const over = [];
	for (let i = 0; i < tb.length; i++) for (let k = i + 1; k < tb.length; k++) { const a = tb[i].getBoundingClientRect(), b = tb[k].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) over.push(i + '×' + k); }
	return { type: 'binder', mode: v.querySelector('.binders-corkboard') ? 'cork' : v.querySelector('.binders-outliner') ? 'outliner' : 'manuscript', w: Math.round(r.width), sideways: v.scrollWidth - v.clientWidth, over };
}))()`;

for (const [label, dims] of [['768 × 1024', [768, 1024]], ['820 × 1180', [820, 1180]], ['1180 × 820', [1180, 820]]]) {
	test(`tablet ${label}: two binder views side by side (cork and outliner), and a binder beside a note: every pane fits; a tap in the other pane moves the keyboard there; a change in one shows in the other`, async (p, h, t) => {
		await onDevice(p, dims, async () => {
			await open(p);
			await splitWith(p, { type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'outliner' } });
			await p.sleep(1200);
			let panes = await p.ev(PANES);
			log(label, 'two binders', j(panes));
			await shot(p, `split-${dims[0]}-two-binders`);
			t.eq(panes.length, 2, 'two panes');
			for (const x of panes) { t.eq(x.sideways <= 1, true, `a ${x.mode} pane of ${x.w} px doesn't overflow sideways`); t.eq(j(x.over), '[]', `a ${x.mode} pane of ${x.w} px has no overlapping toolbar items`); }
			// a change in one shows in the other: rename a note from the active (outliner) pane's menu... by the vault
			await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('The Lighthouse/Epilogue.md'); await app.fileManager.renameFile(f, 'The Lighthouse/Afterword.md'); return 1; })()`);
			await p.sleep(900);
			const seen = await p.ev(`[...document.querySelectorAll('.workspace-split.mod-root .workspace-leaf')].map(l => !!l.querySelector('[data-path="The Lighthouse/Afterword.md"]'))`);
			t.eq(j(seen), '[true,true]', 'the rename shows in both panes');
			// a binder beside a note
			await p.ev(`(async () => { const leaf = app.workspace.getLeaf('split', 'horizontal'); await leaf.openFile(app.vault.getAbstractFileByPath('The Lighthouse/Prologue.md')); return 1; })()`);
			await p.sleep(1000);
			panes = await p.ev(PANES);
			log(label, 'three panes', j(panes));
			await shot(p, `split-${dims[0]}-three`);
			for (const x of panes.filter((x) => x.type === 'binder')) { t.eq(x.sideways <= 1, true, `a ${x.mode} pane of ${x.w} px doesn't overflow sideways`); t.eq(j(x.over), '[]', `a ${x.mode} pane of ${x.w} px has no overlapping toolbar items`); }
			// a tap in the binder pane makes it the active one, and a key goes there
			const at = await p.at('.workspace-split.mod-root .workspace-leaf .binders-card[data-path], .workspace-split.mod-root .workspace-leaf .binders-outliner-row');
			if (at) { await tap(p, at.x, at.y); await p.key('ArrowRight'); }
			t.ok(await p.ev(`!!document.activeElement?.closest('.binders-view')`), 'the focus is in a binder view after a tap there: ' + (await focusIs(p)));
		});
	});
}

test('PROBE manuscript keyboard', async (p, h, t) => {
	await open(p);
	await setMode(p, 'manuscript');
	await until(p, `!!document.querySelector('${LEAF} .binders-manuscript-scene .cm-content')`);
	await p.ev(`document.querySelector('${LEAF} .binders-manuscript-title').focus()`);
	log('title', await focusIs(p));
	await p.key('Tab'); await p.sleep(300); log('Tab from the first title →', await focusIs(p));
	await p.key('Escape'); await p.sleep(300); log('Escape in the editor →', await focusIs(p));
	await p.key('Tab', 'shift'); await p.sleep(300); log('Shift+Tab →', await focusIs(p));
	await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript-title')[1].focus()`);
	await p.key('F10', 'shift'); await p.sleep(400); log('menu', await menus(p), j(await menuItems(p)).slice(0, 120));
	await p.key('Escape'); await p.sleep(300); log('Escape from the title menu →', await focusIs(p));
	await p.key('F2'); await p.sleep(300); log('F2 on a title →', await focusIs(p));
	await p.key('Escape'); await p.sleep(300); log('Escape →', await focusIs(p));
	await p.key('Enter'); await p.sleep(600); log('Enter on a title →', await focusIs(p), await p.ev(`app.workspace.getMostRecentLeaf()?.view?.getViewType()`));
});

const explorerRow = (path) => `.nav-files-container .tree-item-self[data-path="${path}"]`;
for (const [label, dims] of [['820 × 1180', [820, 1180]], ['1024 × 768 on its side', [1024, 768]]]) {
	test(`tablet ${label}, explorer pinned: a note held and dragged in the file explorer by touch moves in the binder’s order (or is refused cleanly), a drop on a folder moves it in, and what the view shows follows`, async (p, h, t) => {
		await onDevice(p, dims, async () => {
			await open(p);
			await pinSidebar(p, true);
			await p.ev(`(() => { const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); const v = l.view; for (const f of ['The Lighthouse', 'The Lighthouse/Part One']) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
			await p.sleep(1000);
			await shot(p, `explorer-${dims[0]}`);
			const before = await contents(p, NOTE);
			const a = await p.at(explorerRow('The Lighthouse/Part One/Arrival.md')), b = await p.at(explorerRow('The Lighthouse/Part One/Storm warning.md'));
			if (!a || !b) { log('rows not in sight', j(!!a), j(!!b)); return; }
			await pressAndMove(p, a.x, a.y, b.x, b.y + 6, 12);
			log('dragging in the explorer:', await p.ev(`document.querySelectorAll('.is-being-dragged, .drag-ghost, .is-dragging, .tree-item-self.is-drop-target, .drag-reorder-ghost').length`));
			await touch(p, 'touchEnd');
			await p.sleep(900);
			await flush(p);
			const after = await contents(p, NOTE);
			log('order', j(before.filter((x) => x.startsWith('Part One/'))), '→', j(after.filter((x) => x.startsWith('Part One/'))));
			t.eq(base(after), base(before), 'the same items remain');
			t.eq(await p.ev(`document.querySelectorAll('.is-being-dragged').length`), 0, 'nothing stays dragged');
			const shown = await p.ev(`(() => { const v = app.workspace.getLeavesOfType('file-explorer')[0].view, f = app.vault.getAbstractFileByPath('The Lighthouse/Part One'); return v.getSortedFolderItems(f).map(i => i.file.name).join(','); })()`);
			log('explorer shows', shown, '| disk', j(after.filter((x) => x.startsWith('Part One/'))));
		});
	});
}

// ======================================================================== the on-screen keyboard, docked (a shorter window)
async function longBinder(p, n = 30) {
	await p.ev(`(async () => {
		await app.vault.createFolder('Long');
		const list = [];
		for (let i = 1; i <= ${n}; i++) { const name = 'Scene ' + String(i).padStart(2, '0'); await app.vault.create('Long/' + name + '.md', '---\\nsynopsis: What happens in scene ' + i + '.\\n---\\nScene ' + i + ' begins here. The tide was out and the sand ran grey to the rocks.\\n\\nA second paragraph.\\n'); list.push(name); }
		await app.vault.create('Long/Long.md', '---\\nbinder: 1\\ncontents:\\n' + list.map((c) => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	await until(p, `app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Long/')).every(f => app.metadataCache.getFileCache(f))`, 20000);
	await p.sleep(600);
}
const visibleNow = (p, sel) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); const vv = window.visualViewport; return { top: Math.round(r.top), bottom: Math.round(r.bottom), inner: Math.round(vv ? vv.height : innerHeight), inSight: r.top >= 0 && r.bottom <= (vv ? vv.height : innerHeight) + 1 }; })()`);

for (const [label, dims, kb] of [['820 × 1180', [820, 1180], 380], ['1180 × 820 on its side', [1180, 820], 300]]) {
	test(`tablet ${label} with the keyboard docked (${kb} px): what’s being typed (the last card’s synopsis, the new note’s name, the last row’s name, the manuscript’s last section) stays above the keyboard`, async (p, h, t) => {
		await onDevice(p, dims, async () => {
			await longBinder(p);
			await open(p, 'Long');
			const [W, H] = dims;
			const keyboard = async (on) => { await metrics(p, W, on ? H - kb : H); await p.sleep(600); };
			// the corkboard: the last card's synopsis
			await setMode(p, 'corkboard');
			const last = 'Long/Scene 30.md';
			await p.ev(`document.querySelector('${LEAF} .binders-card[data-path="${last}"]')?.scrollIntoView({ block: 'center' })`);
			await p.sleep(400);
			const syn = await p.at(`${LEAF} .binders-card[data-path="${last}"] .binders-card-synopsis`);
			await tap(p, syn.x, syn.y); // (selects)
			await tap(p, syn.x, syn.y); // (edits)
			await keyboard(true);
			await p.type('x');
			await p.sleep(500);
			const field = await visibleNow(p, `${LEAF} .binders-card[data-path="${last}"] .binders-edit-field`);
			log(label, 'cork synopsis field', j(field));
			t.ok(field && field.inSight, 'the card’s synopsis field is above the keyboard: ' + j(field));
			await p.key('Escape');
			await keyboard(false);
			// the new note tile
			await p.ev(`document.querySelector('${LEAF} .binders-card-new')?.scrollIntoView({ block: 'center' })`);
			await p.sleep(300);
			const nn = await p.at(`${LEAF} .binders-card-new`);
			await tap(p, nn.x, nn.y);
			await keyboard(true);
			await p.sleep(500);
			const nf = await visibleNow(p, `${LEAF} .binders-card-new .binders-edit-field`);
			log(label, 'new note field', j(nf));
			t.ok(nf && nf.inSight, 'the new note’s name field is above the keyboard: ' + j(nf));
			await p.key('Escape');
			await keyboard(false);
			// the outliner: the last row's name
			await setMode(p, 'outliner');
			await p.ev(`document.querySelector('${LEAF} .binders-outliner-row[data-path="${last}"]')?.scrollIntoView({ block: 'end' })`);
			await p.sleep(300);
			await p.ev(`document.querySelector('${LEAF} .binders-outliner-row[data-path="${last}"]').focus()`);
			await keyboard(true);
			await p.key('F2'); await p.sleep(500);
			const rf = await visibleNow(p, `${LEAF} .binders-outliner-row[data-path="${last}"] .binders-edit-field`);
			log(label, 'row field', j(rf));
			t.ok(rf && rf.inSight, 'the last row’s name field is above the keyboard: ' + j(rf));
			await p.key('Escape');
			await keyboard(false);
			// the manuscript: the last section's caret
			await setMode(p, 'manuscript');
			await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-manuscript'); s.scrollTop = s.scrollHeight; return 1; })()`);
			await p.sleep(900);
			const eds = await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript-scene .cm-content').length`);
			const ed = await p.at(`${LEAF} .binders-manuscript-scene:last-of-type .cm-content`);
			if (ed) { await tap(p, ed.x, ed.y); await keyboard(true); await p.type(' end'); await p.sleep(700);
				const caret = await p.ev(`(() => { const s = window.getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0).getBoundingClientRect(); const vv = window.visualViewport; return { top: Math.round(r.top), bottom: Math.round(r.bottom), inner: Math.round(vv ? vv.height : innerHeight) }; })()`);
				log(label, 'manuscript caret', j(caret), 'editors', eds);
				t.ok(!caret || (caret.bottom <= caret.inner + 1 && caret.top >= 0), 'the caret in the last section is above the keyboard: ' + j(caret));
			}
			await keyboard(false);
		});
	});
}

const LIVE = `[...document.querySelectorAll('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], .notice')].map((e) => e.textContent.trim()).filter(Boolean).join(' | ')`;
a11y('corkboard: the “New note” tile is not a child of the card list (a listbox owns only options: its button is “list with 5 items” to a screen reader, and may be skipped in browse mode)', async (p, h, t) => {
	await open(p);
	const roles = await p.ev(`(() => { const n = document.querySelector('${LEAF} .binders-card-new'); const box = n.closest('[role="listbox"]'); return box ? [...box.children].map((c) => c.getAttribute('role')) : null; })()`);
	log('children of the listbox', j(roles));
	t.ok(!roles || roles.every((r) => r === 'option' || r === 'group'), 'a listbox holds only options: ' + j(roles));
	// (and the cards are still a list, the tile a button right after it)
	const list = await p.ev(`(() => { const box = document.querySelector('${LEAF} .binders-card[data-path]').closest('[role="listbox"]'), n = document.querySelector('${LEAF} .binders-card-new'); return box ? { kids: [...box.children].map((c) => c.getAttribute('role')), tile: n.getAttribute('role'), next: box.nextElementSibling === n } : null; })()`);
	t.eq(j(list), j({ kids: ['option', 'option', 'option', 'option'], tile: 'button', next: true }), 'the cards are a list of options, and the tile is a button right after it');
});

a11y('moves and undo are said aloud: after Alt+arrow moves a card (or a row), or “Undo last move” takes it back, a polite live region or a notice says what happened and where (nothing does: the card is silently somewhere else in the list)', async (p, h, t) => {
	await open(p);
	await p.ev(`document.querySelector('${LEAF} .binders-card[data-path$="Prologue.md"]').focus()`);
	await p.key('ArrowRight', 'alt');
	await p.sleep(700);
	const said = await p.ev(LIVE);
	log('after Alt+Right:', j(said));
	t.ok(said, 'a move by keyboard is announced: ' + j(said));
});

a11y('a filter that’s on is said to a screen reader (the label on the screen says “Filter (1)”, and in a narrow pane only the button’s colour does; its `aria-label` stays “Filter”)', async (p, h, t) => {
	await open(p);
	await p.ev(`document.querySelector('${LEAF} .binders-filter-button').focus()`);
	await p.key('Enter'); await p.sleep(400);
	log('filter menu', j(await menuItems(p)));
	// pick the first status in the menu (a status filter turns “Filter” into “Filter (1)”)
	for (let i = 0; i < 8; i++) { await p.key('ArrowDown'); const on = await p.ev(`document.querySelector('.menu .menu-item.selected .menu-item-title')?.textContent`); if (on && /^(Idea|Draft|Revised|Done)$/.test(on)) { await p.key('Enter'); break; } }
	await p.sleep(600);
	await closeMenus(p);
	const b = await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-filter-button'); return { label: e.querySelector('.text-button-label').textContent, aria: e.getAttribute('aria-label'), active: e.classList.contains('is-active'), pressed: e.getAttribute('aria-pressed') }; })()`);
	log('filter button', j(b));
	t.ok(b.active, 'a filter is on');
	t.ok(b.aria !== 'Filter' || b.pressed === 'true', 'the button’s name or state says so: ' + j(b));
});

// ======================================================================== turned with something open
test('tablet: a menu, a dialog and a drawer left open while the tablet is turned and narrowed: the menu closes or stays on screen, the dialog fits and keeps its text, the drawer still closes', async (p, h, t) => {
	await onDevice(p, [820, 1180], async () => {
		await open(p);
		const onScreen = (sel) => p.ev(`(() => { const e = [...document.querySelectorAll(${j(sel)})].pop(); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), inW: innerWidth, inH: innerHeight, ok: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 }; })()`);
		// 1. a popover menu
		const mb = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, mb.x, mb.y);
		t.ok(await menus(p), 'the mode menu is open');
		for (const [w, hh] of [[1180, 820], [500, 800], [820, 1180]]) {
			await metrics(p, w, hh); await p.sleep(600);
			const m = await onScreen('.menu');
			log('menu after', w, hh, j(m));
			t.ok(m === null || m.ok, `the menu is closed or on screen at ${w} × ${hh}: ${j(m)}`);
		}
		await gone(p);
		// 2. a dialog with text typed in it
		const wc = await p.at(`${LEAF} .binders-word-count`);
		await tap(p, wc.x, wc.y);
		await p.sleep(700);
		const input = await p.ev(`document.querySelector('.modal input')?.tagName`);
		if (input) {
			await p.type('1234');
			for (const [w, hh] of [[500, 800], [1180, 820], [820, 1180]]) {
				await metrics(p, w, hh); await p.sleep(600);
				const m = await onScreen('.modal');
				const val = await p.ev(`document.querySelector('.modal input')?.value`);
				log('dialog after', w, hh, j(m), 'value', val);
				t.ok(m && m.ok, `the dialog fits at ${w} × ${hh}: ${j(m)}`);
				t.eq(val, '1234', 'and keeps what was typed');
			}
			await p.key('Escape'); await p.sleep(400);
		} else log('(no dialog)');
		// 3. the drawer
		await p.ev(`app.workspace.leftSplit.expand()`);
		await p.sleep(500);
		await metrics(p, 1180, 820); await p.sleep(600);
		const open1 = await drawerOpenNow(p);
		await metrics(p, 500, 800); await p.sleep(600);
		const open2 = await drawerOpenNow(p);
		await metrics(p, 820, 1180); await p.sleep(600);
		log('drawer', open1, open2, await drawerOpenNow(p));
		await p.ev(`app.workspace.leftSplit.collapse()`);
		await p.sleep(500);
		t.eq(await drawerOpenNow(p), false, 'the drawer closes');
		t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-view .binders-toolbar')`), 'the view is there');
	});
});
const drawerOpenNow = (p) => p.ev(`!app.workspace.leftSplit.collapsed`);

// ======================================================================== settings
// (Obsidian 1.13 opens the settings in a window of their own: here 1 px wide, so only names and states are looked at, not layout)
a11y('settings: the label colour pickers (an `<input type="color">` in each label’s row) have a name (they have none: they are tab stops a screen reader says nothing of)', async (p, h, t) => {
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await p.sleep(900);
	const info = await p.ev(`(() => {
		const tab = app.setting.activeTab?.containerEl; if (!tab) return null;
		const out = [];
		for (const e of tab.querySelectorAll('input, select, textarea, button, [role="button"], .clickable-icon, .checkbox-container')) {
			if (e.classList.contains('is-measuring')) continue; // (Obsidian’s own: it sizes a dropdown by a copy)
			const row = e.closest('.setting-item');
			const rowName = row?.querySelector('.setting-item-name')?.textContent?.trim() ?? '';
			const own = (e.getAttribute('aria-label') || e.getAttribute('title') || (e.matches('button, [role="button"]') ? e.textContent : '') || e.getAttribute('placeholder') || '').trim();
			out.push({ tag: e.tagName.toLowerCase() + (e.type ? '[' + e.type + ']' : ''), cls: String(e.className).split(' ')[0], own: own.slice(0, 30), rowName: rowName.slice(0, 30) });
		}
		return out;
	})()`);
	await p.key('Escape'); await p.sleep(300);
	await p.ev(`app.setting.close()`);
	log('settings controls', info?.length);
	const unnamed = (info ?? []).filter((c) => !c.own && !c.rowName && c.cls !== 'checkbox-container');
	const kinds = {};
	for (const c of unnamed) kinds[c.tag + '.' + c.cls] = (kinds[c.tag + '.' + c.cls] ?? 0) + 1;
	log('without any name', j(kinds));
	t.eq(j(kinds), '{}', 'every control has a name');
});

test('outliner headers from the keyboard: Enter opens the column’s menu, a sort picked from it shows in `aria-sort` and keeps the focus on the header, and the sort can be undone from the menu', async (p, h, t) => {
	await open(p);
	await setMode(p, 'outliner');
	const sorts = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-th')].filter(e => e.getAttribute('aria-sort') !== 'none').map(e => e.dataset.col + '=' + e.getAttribute('aria-sort')).join(' ')`);
	const focusWords = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-th')].find(e => /Words/.test(e.textContent)).focus()`);
	await focusWords();
	await p.key('Enter'); await p.sleep(400);
	const items = await menuItems(p);
	log('column menu', j(items));
	const sortItems = items.filter((x) => /sort|order|ascend|descend|low|high|A to Z|Z to A/i.test(x));
	t.ok(sortItems.length >= 1, 'the menu offers sorting: ' + j(items));
	if (!sortItems.length) return;
	await pickKeys(p, sortItems[0]);
	await p.sleep(600);
	const after = await sorts();
	log('sorted:', after, '| focus', await focusIs(p));
	t.ok(/words=(ascending|descending)/.test(after), 'aria-sort follows the sort: ' + after);
	t.ok((await focusIs(p)) !== 'BODY', 'the focus stays on the header: ' + (await focusIs(p)));
});

ux('tablet: turned on its side and back (and narrowed to 500 px and back) while reading far down a long binder, each mode keeps its place: the same note is still in sight', async (p, h, t) => {
	const lost = [];
	await onDevice(p, [820, 1180], async () => {
		await longBinder(p, 40);
		await open(p, 'Long');
		for (const mode of ['corkboard', 'outliner', 'manuscript']) {
			await setMode(p, mode);
			const target = 'Long/Scene 25.md';
			const key = mode === 'corkboard' ? `.binders-card[data-path="${target}"]` : mode === 'outliner' ? `.binders-outliner-row[data-path="${target}"]` : `.binders-manuscript-scene`;
			if (mode === 'manuscript') {
				await p.ev(`(() => { const s = [...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(e => e.querySelector('.binders-manuscript-title')?.textContent === 'Scene 25'); s?.scrollIntoView({ block: 'start' }); return 1; })()`);
			} else await p.ev(`document.querySelector('${LEAF} ${key}')?.scrollIntoView({ block: 'center' })`);
			await p.sleep(900);
			const where = () => p.ev(`(() => { const sc = ${mode === 'manuscript' ? `[...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(e => e.querySelector('.binders-manuscript-title')?.textContent === 'Scene 25')` : `document.querySelector('${LEAF} ${key}')`}; if (!sc) return null; const r = sc.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), inH: innerHeight }; })()`);
			const before = await where();
			const seen = [];
			for (const [w, hh] of [[1180, 820], [820, 1180], [500, 800], [820, 1180]]) {
				await metrics(p, w, hh); await p.sleep(900);
				const f = await where();
				seen.push(`${w}x${hh}:${f ? (f.top >= -f.h / 2 && f.top < f.inH ? 'in sight' : 'gone ' + f.top) : 'not drawn'}`);
			}
			log(mode, 'before', j(before), '→', seen.join(' '));
			if (!before) lost.push(`${mode}: Scene 25 not drawn before`);
			if (!seen.every((s) => /in sight/.test(s))) lost.push(`${mode}: ${seen.join(' ')}`);
		}
	});
	t.eq(j(lost), '[]', 'each mode keeps Scene 25 in sight through the turns');
});

// (needs hover: run with --hover)
test('tablet with a trackpad (mobile layout, a hovering mouse): a card shows its pointed-at edge, an icon-only button in a split pane names itself, right click opens a popover; then a finger (touch on): the hover look goes away and nothing is stuck pointed-at', async (p, h, t) => {
	if ((await p.pointer()) !== 'mouse') { log('(run with --hover)'); return; }
	await onDevice(p, [820, 1180], async () => {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false }); // (the driver gives the mouse back)
		t.eq(await p.pointer(), 'mouse', 'the page has a hovering mouse');
		t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'in the tablet layout');
		await open(p);
		await splitWith(p, { type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'corkboard' } });
		await p.sleep(1000);
		const card = `.workspace-split.mod-root .workspace-leaf.mod-active .binders-card[data-path$="Epilogue.md"]`;
		const edge = () => p.ev(`getComputedStyle(document.querySelector(${j(card)})).boxShadow`);
		const rest = await edge();
		const at = await p.at(card);
		await p.move(at.x, at.y, 6);
		await p.sleep(400);
		const pointed = await edge();
		log('card edge at rest / pointed at', rest, '/', pointed);
		t.ok(pointed !== rest, 'a card pointed at changes its edge');
		const tip = await p.hover(`.workspace-split.mod-root .workspace-leaf.mod-active .binders-filter-button`, { ms: 1600 });
		log('tooltip on the filter icon in a 410 px pane:', tip);
		t.ok(tip, 'an icon-only button in a narrow pane names itself when pointed at: ' + tip);
		// right click: a popover
		await p.right(at.x, at.y);
		await p.sleep(400);
		const s = await sheet(p);
		t.ok(s && !isSheet(s), 'right click opens a popover on a tablet: ' + j(s));
		await gone(p);
		// the finger comes back
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
		await p.sleep(300);
		t.eq(await p.pointer(), 'touch', 'the page now has a finger');
		const c2 = await p.at(card);
		await tap(p, c2.x, c2.t + c2.h - 12);
		await p.sleep(400);
		const afterTap = await edge();
		log('after a tap', afterTap);
		t.ok(/0px 0px 0px 2px/.test(afterTap) || afterTap !== pointed, 'a tapped card shows as selected, not as pointed at: ' + afterTap);
	});
});


a11y('outliner: after the mode is switched to it (by the command, or the mode menu) the focus is on a row, which shows it; the corkboard puts it on a card (it is on the outliner’s empty container, which shows no ring, so nothing on the screen says where the keyboard is)', async (p, h, t) => {
	await open(p);
	const ring = () => p.ev(`(() => { const e = document.activeElement; if (!e || e === document.body) return { on: 'BODY', ring: false }; const cs = getComputedStyle(e); const a = getComputedStyle(e, '::after'); return { on: String(e.className).split(' ').slice(0, 3).join('.'), ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none' || a.boxShadow !== 'none' }; })()`);
	await h.run('show-outliner'); await p.sleep(1200);
	const byCommand = await ring();
	await h.run('show-corkboard'); await p.sleep(1200);
	await p.ev(`document.querySelector('${LEAF} .binders-mode-button').focus()`);
	await p.key('Enter'); await p.sleep(250); await p.key('ArrowDown'); await p.key('ArrowDown'); await p.key('Enter'); await p.sleep(1200);
	const byMenu = await ring();
	log('command', j(byCommand), 'menu', j(byMenu), 'mode', (await viewState(p)).mode);
	t.ok(byCommand.ring, 'by the command, the focus shows a ring: ' + j(byCommand));
	t.ok(byMenu.ring, 'by the menu, the focus shows a ring: ' + j(byMenu));
});

for (const mode of ['corkboard', 'outliner']) {
	a11y(`${mode}: deleting the last note of a folder from the keyboard (Delete, Enter) leaves the focus on something in the view (it goes to <body>, with the same keys the first two deletes keep it on a neighbouring ${mode === 'corkboard' ? 'card' : 'row'})`, async (p, h, t) => {
		await openView(p, 'The Lighthouse/Part One');
		await setMode(p, mode);
		const item = mode === 'corkboard' ? `${LEAF} .binders-card[data-path]` : `${LEAF} .binders-outliner-row`;
		await until(p, `!!document.querySelector('${item}')`);
		const out = [];
		for (let i = 0; i < 3; i++) {
			await p.ev(`document.querySelector('${item}').focus()`);
			await p.key('Delete'); await p.sleep(500);
			await p.key('Enter'); await p.sleep(900);
			out.push(await focusIs(p));
		}
		log(mode, j(out));
		t.ok(out.every((f) => f !== 'BODY'), 'the focus stays in the view after each delete: ' + j(out));
	});
}

test('keyboard only, manuscript: after F2 and Enter on a title, after a section is deleted from its title’s menu, and back from the manuscript to the corkboard, the focus is never <body>', async (p, h, t) => {
	await open(p);
	await setMode(p, 'manuscript');
	await until(p, `!!document.querySelector('${LEAF} .binders-manuscript-title')`);
	const out = [];
	await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript-title')[1].focus()`);
	await p.key('F2'); await p.type('Renamed'); await p.key('Enter'); await p.sleep(900);
	out.push('rename: ' + await focusIs(p));
	await h.run('show-corkboard'); await p.sleep(1200);
	out.push('to the corkboard: ' + await focusIs(p));
	await h.run('show-manuscript'); await p.sleep(1500);
	out.push('back to the manuscript: ' + await focusIs(p));
	log(j(out));
	t.ok(out.every((f) => !/BODY/.test(f)), 'the focus is never <body>: ' + j(out));
});

for (const mode of ['corkboard', 'outliner']) {
	test(`keyboard only, ${mode}: after each item of the note’s menu chosen from the keyboard the focus is on something in the view`, async (p, h, t) => {
		await open(p);
		await setMode(p, mode);
		const item = (name) => mode === 'corkboard' ? `${LEAF} .binders-card[data-path$="${name}"]` : `${LEAF} .binders-outliner-row[data-path$="${name}"]`;
		const bad = [], out = [];
		const tries = [['Duplicate'], ['Put in a new folder'], ['Move down'], ['Move up'], ['Include in compile'], ['Set status', 'Draft'], ['Set label', 'Red'], ['Set synopsis from text'], ['Snapshots']];
		for (const titles of tries) {
			await setMode(p, mode);
			await p.ev(`document.querySelector(${j(item('Prologue.md'))})?.focus()`);
			if (!(await p.ev(`document.activeElement?.dataset?.path`))) { out.push(titles.join('>') + ': (no Prologue)'); continue; }
			await p.key('F10', 'shift'); await p.sleep(350);
			if (!(await menus(p))) { out.push(titles.join('>') + ': no menu'); continue; }
			try { await pickKeys(p, ...titles); } catch { out.push(titles.join('>') + ': pick failed'); await closeMenus(p); continue; }
			await p.sleep(1000);
			// a dialog or an editor that opened is the focus's right place; close what's open the way a writer would
			const f = await focusIs(p);
			out.push(titles.join('>') + ' → ' + f.slice(0, 50));
			if (f === 'BODY') bad.push(titles.join('>'));
			for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.modal-container').length`)); i++) { await p.key('Escape'); await p.sleep(300); }
			await p.key('Escape'); await p.sleep(200);
			await closeMenus(p);
		}
		log(out.join(' | '));
		t.eq(j(bad), '[]', 'the focus is never <body> after: ' + j(bad));
	});
}


test('tablet: with a docked keyboard on a small tablet on its side (a 380 px window) typing in the manuscript leaves room for six lines of text (the toolbar steps aside on a phone only, `Platform.isPhone` at BinderView.ts:238: below about 330 px it would be worth doing on a tablet too, where five lines or fewer are left)', async (p, h, t) => {
	await onDevice(p, [1180, 820], async () => {
		await open(p);
		await setMode(p, 'manuscript');
		await until(p, `!!document.querySelector('${LEAF} .binders-manuscript-scene .cm-content')`);
		const ed = await p.at(`${LEAF} .binders-manuscript-scene .cm-content`);
		await tap(p, ed.x, ed.y);
		await metrics(p, 1180, 380);
		await p.sleep(700);
		await p.type(' z');
		await p.sleep(500);
		const room = await p.ev(`(() => { const page = document.querySelector('${LEAF} .binders-manuscript'); const r = page.getBoundingClientRect(); const line = parseFloat(getComputedStyle(document.querySelector('${LEAF} .cm-content')).lineHeight) || 24; const caret = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0).getBoundingClientRect() : null; return { pageTop: Math.round(r.top), pageH: Math.round(r.height), line: Math.round(line), lines: +(r.height / line).toFixed(1), inH: innerHeight, caretIn: caret ? caret.top >= r.top - 1 && caret.bottom <= r.bottom + 1 : null, short: document.querySelector('${LEAF} .binders-view').classList.contains('is-short') }; })()`);
		log('manuscript in a 380 px window', j(room));
		t.ok(room.lines >= 6, 'room for six lines of text: ' + j(room));
		t.ok(room.caretIn !== false, 'the caret is in sight: ' + j(room));
	});
});

bug('right-to-left interface: on the corkboard Right goes to the card on the right (the one before, in a row that starts at the right), Left to the one on its left, and Alt+Right moves a card that way (the arrows go by the order, left for before: in an RTL row they walk the wrong way; the outliner’s cells already know)', async (p, h, t) => {
	await open(p);
	try {
		await setRtl(p, true);
		await p.sleep(800);
		const rects = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => [c.dataset.path.split('/').pop(), Math.round(c.getBoundingClientRect().left)])`);
		log('cards left to right on the screen', j(rects));
		const first = rects[0][1], second = rects[1][1];
		t.ok(first > second, 'in a right-to-left row the first card is at the right: ' + j(rects));
		await p.ev(`document.querySelectorAll('${LEAF} .binders-card[data-path]')[1].focus()`);
		await p.key('ArrowRight'); await p.sleep(300);
		const to = await p.ev(`document.activeElement?.dataset?.path?.split('/').pop()`);
		log('Right from the second card →', to, '(expected', rects[0][0] + ')');
		t.eq(to, rects[0][0], 'Right goes to the card on the right');
	} finally { await setRtl(p, false); }
});

bug('right-to-left interface: in the outliner Right folds an open folder and Left unfolds a closed one or goes into the cells, as a tree’s arrows are mirrored (they act as in a left-to-right tree: the cell keys in the same view are already mirrored)', async (p, h, t) => {
	await open(p);
	await setMode(p, 'outliner');
	try {
		await setRtl(p, true);
		await p.sleep(800);
		const folder = `${LEAF} .binders-outliner-row.is-folder`;
		await p.ev(`document.querySelector('${folder}').focus()`);
		t.eq(await p.ev(`document.querySelector('${folder}').getAttribute('aria-expanded')`), 'true', 'the folder is open');
		await p.key('ArrowRight'); await p.sleep(400);
		const after = await p.ev(`document.querySelector('${folder}').getAttribute('aria-expanded')`);
		log('after Right in RTL', after, await focusIs(p));
		t.eq(after, 'false', 'Right folds an open folder in a right-to-left interface');
	} finally { await setRtl(p, false); }
});

test('right-to-left interface: a card dragged to the right half of another goes before it (the right is the start of the row), to its left half after it', async (p, h, t) => {
	await open(p);
	try {
		await setRtl(p, true);
		await p.sleep(800);
		const ep = await p.at(`${LEAF} .binders-card[data-path$="Epilogue.md"]`);
		const p1 = await p.at(`${LEAF} .binders-card[data-path$="Part One"]`);
		await p.drag(ep.x, ep.y + 20, p1.l + p1.w * 0.8, p1.y, 16);
		await p.sleep(800);
		await flush(p);
		const after = await contents(p, NOTE);
		log('after', j(after.filter((x) => !x.includes('/') || x.endsWith('/'))));
		t.eq(j(after.filter((x) => !x.includes('/') || x.endsWith('/'))), j(['Prologue', 'Epilogue', 'Part One/', 'Part Two/']), 'Epilogue went before Part One');
	} finally { await setRtl(p, false); }
});

a11y('manuscript: a folder’s heading (“Part One”) is a heading to a screen reader, so the page can be walked by headings (it’s an `<h2 role="link">`: the role replaces the heading, so there are no headings on the page, only links)', async (p, h, t) => {
	await open(p);
	await setMode(p, 'manuscript');
	await until(p, `!!document.querySelector('${LEAF} .binders-manuscript-heading')`);
	const r = await p.ev(`(() => { const hs = [...document.querySelectorAll('${LEAF} .binders-manuscript-heading')].map(h => { const e = h.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]') ?? h; return { tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), text: e.textContent.trim().slice(0, 20) }; }); const headings = [...document.querySelectorAll('${LEAF} .binders-manuscript :is(h1, h2, h3, h4, h5, h6, [role="heading"])')].filter(e => e.getAttribute('role') === null || e.getAttribute('role') === 'heading'); return { hs, headings: headings.map(e => e.tagName.toLowerCase() + ':' + e.textContent.trim().slice(0, 20)) }; })()`);
	log(j(r));
	t.ok(r.hs.length > 0, 'the manuscript has a folder heading');
	t.ok(r.headings.some((x) => /Part One/.test(x)), 'a heading named “Part One” is on the page as a heading: ' + j(r));
});

for (const [label, dims] of [['768 × 1024', [768, 1024]], ['1024 × 768', [1024, 768]], ['1024 × 1366', [1024, 1366]]]) {
	test(`tablet ${label}: the dialogs (set target, compile, delete, convert a note to a folder’s “Put in a new folder” name) are boxes on the screen with every button in reach, and the text in them fits`, async (p, h, t) => {
		await onDevice(p, dims, async () => {
			await open(p);
			const bad = [];
			const look = async (what) => {
				await p.sleep(700);
				const m = await p.ev(`(() => { const e = [...document.querySelectorAll('.modal')].pop(); if (!e) return null; const r = e.getBoundingClientRect(); const bs = [...e.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent, ok: q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight, h: Math.round(q.height) }; }); const over = e.scrollWidth > e.clientWidth + 1; return { box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, sheet: r.width === innerWidth, buttons: bs, sideways: over }; })()`);
				log(what, j(m));
				if (!m) { bad.push(what + ': no dialog'); return; }
				if (!m.inside) bad.push(what + ': off screen ' + j(m.box));
				if (m.sheet) bad.push(what + ': a full-width sheet');
				// (Cancel may be a scroll away in the Compile box on a short screen: a tap outside the box, or Escape, is the way out too)
				if (m.buttons.slice(0, -1).some((b) => !b.ok)) bad.push(what + ': a button off screen');
				if (m.buttons.some((b) => b.h < 32)) bad.push(what + ': a button under 32 px tall');
				if (m.sideways) bad.push(what + ': scrolls sideways');
				await p.key('Escape'); await p.sleep(400);
			};
			const card = await p.at(`${LEAF} .binders-card[data-path$="Prologue.md"]`);
			await tap(p, card.x, card.t + card.h - 12);
			await h.run('set-target'); await look('set target');
			await h.run('compile'); await look('compile');
			await p.ev(`document.querySelector('${LEAF} .binders-card[data-path$="Prologue.md"]').focus()`);
			await p.key('Delete'); await look('delete');
			t.eq(j(bad), '[]', 'every dialog fits');
		});
	});
}

test('tablet: a new note’s name, a card’s synopsis and an outliner row’s synopsis typed, the tablet turned and narrowed in the middle of each, then finished: every word is in the vault, once', async (p, h, t) => {
	await onDevice(p, [820, 1180], async () => {
		await open(p);
		const turn = async () => { for (const [w, hh] of [[1180, 820], [500, 800], [820, 1180]]) { await metrics(p, w, hh); await p.sleep(500); } };
		// 1. a new note's name
		const nn = await p.at(`${LEAF} .binders-card-new`);
		await tap(p, nn.x, nn.y); await p.sleep(400);
		await p.type('Night watch');
		await turn();
		t.ok(await p.ev(`document.activeElement?.matches('input, textarea')`), 'the name field still has the focus after turning');
		await p.type(' two');
		await p.key('Enter'); await p.sleep(1000);
		t.ok(await p.ev(`app.vault.adapter.exists('The Lighthouse/Night watch two.md')`), 'the note has the whole name');
		// 2. a card's synopsis
		await p.ev(`document.querySelector('${LEAF} .binders-card[data-path$="Epilogue.md"]').focus()`);
		await p.key('Enter', 'ctrl').catch(() => {}); // (opens the note on a card; harmless here)
		await open(p);
		const c = await p.at(`${LEAF} .binders-card[data-path$="Epilogue.md"] .binders-card-synopsis`);
		await tap(p, c.x, c.y); await p.sleep(300); await tap(p, c.x, c.y); await p.sleep(500);
		if (await p.ev(`document.activeElement?.matches('textarea')`)) {
			await p.type(' Alpha');
			await turn();
			await p.type(' Beta');
			await p.key('Tab'); await p.sleep(900); await flush(p);
			const fm = await p.ev(`app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('The Lighthouse/Epilogue.md')).frontmatter?.synopsis ?? ''`);
			log('card synopsis', j(fm));
			t.ok(/Alpha Beta/.test(fm), 'the card’s synopsis has both words, once, in order: ' + fm);
		} else log('(no card synopsis field opened by two taps)');
		// 3. an outliner row's synopsis
		await setMode(p, 'outliner');
		const r = await p.at(`${LEAF} .binders-outliner-row[data-path$="Prologue.md"] .binders-outliner-synopsis`);
		if (r) {
			await tap(p, r.x, r.y); await p.sleep(300); await tap(p, r.x, r.y); await p.sleep(500);
			if (await p.ev(`document.activeElement?.matches('textarea, input')`)) {
				await p.type(' Gamma');
				await turn();
				await p.type(' Delta');
				await p.key('Tab'); await p.sleep(900); await flush(p);
				const fm = await p.ev(`app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('The Lighthouse/Prologue.md')).frontmatter?.synopsis ?? ''`);
				log('row synopsis', j(fm));
				t.ok(/Gamma Delta/.test(fm), 'the row’s synopsis has both words: ' + fm);
			} else log('(no row synopsis field opened)');
		}
	});
});

for (const [label, dims, n] of [['820 × 1180, three binders side by side (273 px each)', [820, 1180], 3], ['1180 × 820, four binders (295 px each)', [1180, 820], 4], ['768 × 1024, four binders (192 px each)', [768, 1024], 4]]) {
	ux(`tablet ${label}: in each narrow pane the toolbar’s mode button and buttons are whole, a finger wide, and not squashed (the mode button is the way to the other modes)`, async (p, h, t) => {
		await onDevice(p, dims, async () => {
			await open(p);
			for (let i = 1; i < n; i++) { await splitWith(p, { type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'corkboard' } }); await p.sleep(600); }
			await p.sleep(900);
			const facts = await p.ev(`[...document.querySelectorAll('.workspace-split.mod-root .workspace-leaf')].map((l) => {
				const v = l.querySelector('.binders-view'); if (!v) return null;
				const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
				const pane = Math.round(l.getBoundingClientRect().width);
				const btns = [...v.querySelectorAll('.binders-toolbar-button, .binders-word-count')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { cls: String(e.className).split(' ').find((c) => /binders-(mode|filter|new|arrange|focus)/.test(c)) ?? 'count', w: Math.round(r.width), h: Math.round(r.height), clipped: e.scrollWidth > e.clientWidth + 1 }; });
				const mode = v.querySelector('.binders-mode-button'); const mr = mode.getBoundingClientRect();
				const tb = v.querySelector('.binders-toolbar'); 
				return { pane, mode: [Math.round(mr.width), Math.round(mr.height)], sideways: v.scrollWidth - v.clientWidth, toolbarOver: tb.scrollWidth - tb.clientWidth, btns };
			})`);
			log(label, j(facts.filter(Boolean).map((f) => ({ pane: f.pane, mode: f.mode, over: f.toolbarOver, sideways: f.sideways, small: f.btns.filter((b) => b.w < 32 || b.clipped).map((b) => b.cls + ':' + b.w) }))));
			const bad = facts.filter(Boolean).filter((f) => f.mode[0] < 32 || f.toolbarOver > 1 || f.sideways > 1 || f.btns.some((b) => b.w < 24 || b.clipped)).map((f) => `pane ${f.pane}: mode ${f.mode}, over ${f.toolbarOver}`);
			await shot(p, `narrow-panes-${dims[0]}x${n}`);
			t.eq(j(bad), '[]', 'the toolbar is whole in every pane');
		});
	});
}

for (const [label, dims] of [['768 × 1024', [768, 1024]], ['1024 × 768', [1024, 768]]]) {
	test(`tablet ${label}: every menu of the view (mode, filter, new, arrange, columns, a column, “More options”, a card’s, a row’s, an empty board’s) is a popover on the screen, near what opened it, and all of its items are in sight or scroll`, async (p, h, t) => {
		await onDevice(p, dims, async () => {
			await open(p);
			const bad = [];
			const check = async (what, opener) => {
				await gone(p);
				try { await opener(); } catch (e) { bad.push(what + ': ' + e.message); return; }
				await p.sleep(500);
				const s = await p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), b: Math.round(r.bottom), r: Math.round(r.right), inW: innerWidth, inH: innerHeight, n: m.querySelectorAll('.menu-item').length }; })()`);
				log(what, j(s));
				if (!s) { bad.push(what + ': no menu'); return; }
				if (s.l === 0 && s.w === s.inW) bad.push(what + ': a full-width sheet');
				if (s.l < 0 || s.t < 0 || s.r > s.inW || s.b > s.inH) bad.push(what + ': off screen ' + j(s));
			};
			const tapSel = async (sel) => { const a = await p.at(`${LEAF} ${sel}`); if (!a) throw new Error('no ' + sel); await tap(p, a.x, a.y); };
			await check('mode menu', () => tapSel('.binders-mode-button'));
			await check('filter', () => tapSel('.binders-filter-button'));
			await check('new', () => tapSel('.binders-new-button'));
			await check('arrange', () => tapSel('.binders-arrange-button'));
			await check('More options', async () => { const a = await p.ev(`(() => { const e = [...document.querySelectorAll('${LEAF} .view-header [aria-label]')].find((x) => /more options/i.test(x.getAttribute('aria-label'))) ?? [...document.querySelectorAll('${LEAF} .view-header .view-action')].pop(); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); if (!a) throw new Error('no More options'); await tap(p, a.x, a.y); });
			await check('a card’s', async () => { const c = await p.at(`${LEAF} .binders-card[data-path$="Epilogue.md"]`); await hold(p, c.x, c.t + c.h - 14); });
			await check('a stack’s', async () => { const c = await p.at(`${LEAF} .binders-card.is-stack`); await hold(p, c.x, c.t + c.h - 14); });
			await setMode(p, 'outliner');
			await check('columns (+)', () => tapSel('.binders-outliner-th.mod-add'));
			await check('a column', () => tapSel('.binders-outliner-th[data-col="status"]'));
			await check('a row’s', async () => { const c = await p.at(`${LEAF} .binders-outliner-row[data-path$="Epilogue.md"] .binders-outliner-name`); await hold(p, c.x, c.y); });
			await check('a status cell', async () => { const c = await p.at(`${LEAF} .binders-outliner-row[data-path$="Epilogue.md"] .binders-outliner-cell[data-col="status"]`); await tap(p, c.x, c.y); await p.sleep(300); if (!(await menus(p))) await tap(p, c.x, c.y); });
			await gone(p);
			t.eq(j(bad), '[]', 'every menu is a popover on screen');
		});
	});
}

test('tablet: a menu opened from a cell near the bottom of the screen (Status) stays on the screen, to within the few pixels Obsidian’s own menus keep', async (p, h, t) => {
	await onDevice(p, [1024, 768], async () => {
		await open(p);
		await setMode(p, 'outliner');
		const row = `${LEAF} .binders-outliner-row[data-path$="Epilogue.md"]`;
		await p.ev(`document.querySelector('${row}').scrollIntoView({ block: 'end' })`);
		await p.sleep(400);
		const c = await p.at(`${row} .binders-outliner-cell[data-col="status"]`);
		await tap(p, c.x, c.y); await p.sleep(300);
		if (!(await menus(p))) { await tap(p, c.x, c.y); await p.sleep(300); }
		const ours = await sheet(p);
		await gone(p);
		t.ok(ours && ours.bottom <= ours.inner[1] + 5, 'the status menu fits the screen: ' + j(ours));
	});
});

for (const rtl of [false, true]) {
	test(`keyboard only: Tab goes through each mode in reading order (top to bottom, ${rtl ? 'right to left' : 'left to right'} along a line), with no stop out of place and no trap`, async (p, h, t) => {
		await open(p);
		try {
			if (rtl) { await setRtl(p, true); await p.sleep(700); }
			for (const mode of ['corkboard', 'outliner']) {
				await setMode(p, mode);
				await p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'); v.setAttribute('tabindex', '-1'); v.focus(); v.removeAttribute('tabindex'); return 1; })()`);
				const stops = [];
				for (let i = 0; i < 24; i++) {
					await p.key('Tab');
					const s = await p.ev(`(() => { const e = document.activeElement; if (!e || !e.closest('${LEAF} .binders-view')) return null; const r = e.getBoundingClientRect(); return { cls: String(e.className).split(' ').filter((c) => c.startsWith('binders-')).slice(0, 2).join('.') || e.tagName, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), sel: e.dataset?.path ?? '' }; })()`);
					if (!s) break;
					stops.push(s);
				}
				log(mode, rtl ? 'RTL' : '', j(stops.map((s) => s.cls.replace('binders-', '') + '@' + s.x + ',' + s.y)));
				const back = [];
				for (let i = 1; i < stops.length; i++) {
					const a = stops[i - 1], b = stops[i];
					const sameLine = Math.abs(a.y - b.y) < 14;
					if (b.y < a.y - 14) back.push(`${a.cls}→${b.cls}: up`);
					else if (sameLine && (rtl ? b.x > a.x + 4 : b.x < a.x - 4)) back.push(`${a.cls}→${b.cls}: back along the line`);
				}
				t.eq(j(back), '[]', `${mode}: every Tab stop comes after the one before it`);
				t.ok(stops.length >= 3, `${mode}: Tab reaches the controls (${stops.length} stops)`);
			}
		} finally { if (rtl) await setRtl(p, false); }
	});
}

test('keyboard only: Escape closes each toolbar menu (Filter, New, Arrange) and the focus goes back to the button that opened it; Enter on the button opens it again', async (p, h, t) => {
	await open(p);
	const bad = [];
	for (const cls of ['binders-filter-button', 'binders-new-button', 'binders-arrange-button', 'binders-mode-button']) {
		await p.ev(`document.querySelector('${LEAF} .${cls}').focus()`);
		await p.key('Enter'); await p.sleep(350);
		if (!(await menus(p))) { bad.push(cls + ': Enter opened no menu'); continue; }
		await p.key('Escape'); await p.sleep(400);
		const f = await focusIs(p);
		if (await menus(p)) bad.push(cls + ': Escape left the menu open');
		if (!f.includes(cls)) bad.push(`${cls}: the focus is on ${f}`);
		await p.key(' '); await p.sleep(350);
		if (!(await menus(p))) bad.push(cls + ': Space opened no menu');
		await p.key('Escape'); await p.sleep(300);
	}
	t.eq(j(bad), '[]', 'every toolbar menu gives the focus back');
});

test('a binder in a newer format (read only): the word count in the toolbar isn’t offered as a button (nothing happens when it is pressed)', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/Future.md', '---\\nbinder: 99\\ncontents:\\n  - One\\n---\\n'); await app.vault.create('Future/One.md', 'one two three'); })().then(() => 1)`);
	await p.sleep(600);
	await open(p, 'Future');
	const wc = await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-word-count'); return e ? { role: e.getAttribute('role'), tab: e.tabIndex, label: e.getAttribute('aria-label'), disabled: e.getAttribute('aria-disabled'), text: e.textContent } : null; })()`);
	log('word count of a read-only binder', j(wc));
	t.ok(wc, 'there is a word count');
	t.ok(wc.role !== 'button' || wc.disabled === 'true' || wc.tab < 0, 'it is not a live button: ' + j(wc));
});
