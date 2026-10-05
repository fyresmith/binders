// QA round 5, the manuscript on a phone and a tablet, by touch: Obsidian's mobile mode (app.emulateMobile) at phone
// sizes (320 × 568, 360 × 640, 390 × 844, 430 × 932 and their landscapes) and a tablet's (820 × 1180, 1180 × 820), with
// real touches sent over CDP. One question for everything: does it feel like writing in an Obsidian note on a phone, and
// can a word be lost, doubled or corrupted? Tests named "qa5 manuscript: …" pass; "BUG: …" are confirmed bugs (they
// fail now and pass once fixed); "UX: …" are behaviours that should exist. Every test that types checks the files on
// disk byte for byte, and puts Obsidian back on the desktop when it ends.
//
// How the phone is emulated, and what that can't do (see specs-qa4-mobile.mjs too): the on-screen keyboard is a shorter
// viewport and `Input.insertText` (text arrives as `beforeinput`/`input` with no `keydown`, as from an on-screen
// keyboard); a hardware keyboard is real key events; a long press never sends `contextmenu`, so it's dispatched as
// Obsidian does it; the app going to the background is `visibilitychange` (Capacitor's `appStateChange`, which Obsidian
// itself listens to, can't be sent); safe-area insets are 0.
//
// QA5_SHOTS=<dir> saves screenshots of every step there.
import { mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { B, PL, VIEW, closeMenus, flush, j, menuItems, openView, reload, tidy, until } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa5 manuscript: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa5 manuscript: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa5 manuscript: ' + name, fn });

export const L = 'The Lighthouse/';
export const LEAF = '.workspace-leaf.mod-active';
export const PHONE = [390, 844], SMALL = [320, 568], ANDROID = [360, 640], BIG = [430, 932], TABLET = [820, 1180];
export const land = ([w, h]) => [h, w];
/** How much shorter the page is with the on-screen keyboard up. */
export const KEYBOARD = { 320: 260, 360: 280, 390: 336, 430: 346, 568: 180, 640: 190, 844: 210, 932: 220, 820: 340, 1180: 400 };
const SHOTS = process.env.QA5_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
export const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };

export const ORDER = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((n) => `${L}${n}.md`);
export const [PROLOGUE, ARRIVAL, KEEPER, STORM, WRECK, LIGHTS, EPILOGUE] = ORDER;
export const NOTE = L + 'The Lighthouse.md';

// ---- the disk ----
export const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
/** Every file of the vault as it is on disk, by path (not Obsidian's own settings). */
export function snap(p) {
	const out = {};
	const walk = (dir) => { for (const f of readdirSync(dir)) { const q = join(dir, f); if (f === '.obsidian' || f === '.trash') continue; if (statSync(q).isDirectory()) walk(q); else out[relative(p.vaultDir, q)] = readFileSync(q, 'utf8'); } };
	walk(p.vaultDir);
	return out;
}
/** The vault is what it was, byte for byte, but for `changes` (path → the whole text expected; null: gone). */
export function sameBut(t, before, after, changes = {}) {
	for (const k of new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(changes)])) {
		if (k in changes) { if (changes[k] === null) t.ok(!(k in after), `“${k}” is gone`); else t.eq(after[k], changes[k], `“${k}” on disk`); }
		else t.eq(after[k], before[k], `“${k}” is unchanged on disk`);
	}
}
export const fm = (s) => (s.match(/^---\n[\s\S]*?\n---\n/) || [''])[0];
export const body = (s) => s.slice(fm(s).length);
export const count = (s, sub) => s.split(sub).length - 1;

// ---- touch ----
export const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
export const tap = async (p, x, y, wait = 450) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(wait); };
/** A long press that's let go without moving. */
export const hold = async (p, x, y, ms = 700) => { await touch(p, 'touchStart', x, y); await p.sleep(ms); await touch(p, 'touchEnd'); await p.sleep(550); };
/** A finger put down and moved straight away (a scroll). */
export const swipe = async (p, x0, y0, x1, y1, steps = 10, wait = 500) => { await touch(p, 'touchStart', x0, y0); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(wait); };
/** A long press, then a move to (x1, y1), the finger still down. */
export const pressAndMove = async (p, x0, y0, x1, y1, steps = 10) => { await touch(p, 'touchStart', x0, y0); await p.sleep(620); for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.sleep(20); } await p.sleep(200); };

// ---- the device ----
export const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
/** Runs fn in Obsidian's mobile mode at this size, with touch, in the theme the run asked for; then puts the desktop
    back whatever happened: menus, dialogs and settings closed, the text size, motion and CPU as they were, files that
    aren't notes deleted. Errors logged while on the device fail the test (the reload back would otherwise forget them). */
export async function onDevice(p, [width, height], fn) {
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
		await p.ev(`(async () => { try { app.setting.close(); } catch {} app.workspace.leftSplit.collapse?.(); for (const f of app.vault.getFiles()) if (f.extension !== 'md') await app.vault.delete(f); for (const [k, v] of [['baseFontSize', 16], ['readableLineLength', true], ['rightToLeft', false], ['vimMode', false]]) if ((app.vault.getConfig(k) ?? v) !== v) app.vault.setConfig(k, v); app.updateFontSize?.(); for (let i = 0; i < 60; i++) { let saved = 16; try { saved = JSON.parse(await app.vault.adapter.read(app.vault.configDir + '/appearance.json')).baseFontSize ?? 16; } catch {} if (saved === 16) break; await new Promise(r => setTimeout(r, 100)); } const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach()); })().then(() => 1)`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
		await theme();
		await tidy(p);
	}
	if (logged.length) throw new Error('errors logged on the device: ' + logged.slice(0, 3).join(' ; '));
}
/** The on-screen keyboard comes up (the page is that much shorter) or goes. */
export const keyboard = async (p, [w, h], up = true) => { await metrics(p, w, h - (up ? KEYBOARD[w] ?? Math.round(h * 0.4) : 0)); await p.sleep(450); };

// ---- the manuscript ----
export const M = `${VIEW}.current`;
export const MAN = `document.querySelector('${LEAF} .binders-manuscript')`;
export const sc = (path) => `${M}.scenes.find(s => s.file.path === ${j(path)})`;
export const R = `(e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }`;
export const rect = (p, sel) => p.ev(`(${R})(document.querySelector(${j(sel)}))`);
export async function settle(p, ms = 5000) {
	for (let i = 0; i < ms / 50; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; if (!m || !m.scenes) return false; const near = m.scenes.filter(s => m.near.has(s.el)); return (near.length > 0 || m.scenes.length === 0) && near.slice(0, m.liveMax).every(s => m.editable && !m.byTap ? (s.live || s.broken) && !s.mounting : (s.shown !== null || s.live) && !s.mounting); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(200);
}
/** The binder view on a folder, as its manuscript, settled. */
export async function openMs(p, folder = 'The Lighthouse', newLeaf = false) {
	await openView(p, folder, newLeaf);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}
/** A binder with these notes (name → whole text), in this order. */
export async function binder(p, name, notes) {
	await p.ev(`(async () => {
		if (!app.vault.getAbstractFileByPath(${j(name)})) await app.vault.createFolder(${j(name)});
		const names = [];
		for (const [n, s] of ${j(Object.entries(notes))}) { await app.vault.create(${j(name)} + '/' + n + '.md', s); names.push(n); }
		await app.vault.create(${j(name + '/' + name + '.md')}, '---\\nbinder: 1\\ncontents:\\n' + names.map(c => '  - ' + JSON.stringify(c)).join('\\n') + '\\n---\\n');
		for (let i = 0; i < 100; i++) { if (${B}.scenes(app.vault.getAbstractFileByPath(${j(name)}))?.length === names.length) break; await new Promise(r => setTimeout(r, 100)); }
		return 1; })()`);
	await p.sleep(400);
}
/** Where some text of a section is on screen (the left edge and middle of the character `off` into `needle`; rendered or
    live). */
export const textAt = (p, path, needle, off = 0) => p.ev(`(() => { const s = ${sc(path)}; const w = document.createTreeWalker(s.bodyEl, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.data.indexOf(${j(needle)}); if (i < 0) continue; const at = i + ${off}, r = document.createRange(), end = at >= n.data.length; r.setStart(n, end ? n.data.length - 1 : at); r.setEnd(n, end ? n.data.length : at + 1); const b = r.getClientRects()[0]; if (!b || !b.height) continue; return { x: end ? b.right : b.left, y: (b.top + b.bottom) / 2, top: b.top, bottom: b.bottom }; } return null; })()`);
/** Taps just before the character `off` into `needle` in a section's text. */
export async function tapText(p, path, needle, off = 0, wait = 700) {
	const at = await textAt(p, path, needle, off);
	if (!at) throw new Error(`“${needle}” isn’t shown in ${path}`);
	await tap(p, at.x + 1, at.y, wait);
	return at;
}
/** The caret: the section it's in, where in its text (counted from the start of the body), and where on screen. */
export const caret = (p) => p.ev(`(() => { const m = ${M}; const a = document.activeElement; const s = m?.scenes?.find(s => s.el.contains(a)); if (!s?.live?.cm || !a.classList.contains('cm-content')) return null; const cm = s.live.cm, sel = cm.state.selection.main, text = cm.state.doc.toString(), start = (/^---\\r?\\n(?:[\\s\\S]*?\\r?\\n)?---[ \\t]*(?:\\r?\\n|$)/.exec(text)?.[0].length ?? 0); const c = cm.coordsAtPos(sel.head), v = m.root.getBoundingClientRect(), tb = document.querySelector('.mobile-toolbar')?.getBoundingClientRect(); return { path: s.file.path, head: sel.head - start, anchor: sel.anchor - start, empty: sel.empty, len: text.length - start, top: c ? Math.round(c.top) : null, bottom: c ? Math.round(c.bottom) : null, viewTop: Math.round(v.top), viewBottom: Math.round(v.bottom), toolbar: tb && tb.height ? Math.round(tb.top) : null, inner: innerHeight, before: text.slice(Math.max(start, sel.head - 12), sel.head), after: text.slice(sel.head, sel.head + 12) }; })()`);
/** Is the caret in sight: below the view's top, above its bottom and above Obsidian's editing toolbar? */
export const seen = (c) => !!c && c.top != null && c.top >= c.viewTop - 1 && c.bottom <= Math.min(c.viewBottom, c.toolbar ?? c.inner, c.inner) + 1;
/** What has the focus, in a word. */
export const active = (p) => p.ev(`(() => { const a = document.activeElement; return a === document.body ? 'body' : (a.className || a.tagName).toString().split(' ').slice(0, 2).join(' ') + (a.closest('.binders-manuscript-scene') ? ' in ' + a.closest('.binders-manuscript-scene').querySelector('.binders-manuscript-title').textContent : ''); })()`);
export const st = (p) => p.ev(`(() => { const m = ${M}; if (!m) return null; const a = document.activeElement; return { left: m.left?.path ?? null, active: a === document.body ? 'body' : a.className.split(' ')[0] || a.tagName, top: Math.round(m.root.scrollTop), max: Math.round(m.root.scrollHeight - m.root.clientHeight), live: m.scenes.filter(s => s.live).map(s => s.file.basename), dirty: m.scenes.filter(s => s.live?.dirty).map(s => s.file.basename), scenes: m.scenes.length }; })()`);
export const scrollTop = (p) => p.ev(`Math.round(${M}.root.scrollTop)`);
export const titles = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-title, ${LEAF} .binders-manuscript-heading > *')].map(e => (e.matches('.binders-manuscript-title') ? '' : '# ') + e.textContent)`);
export const titleOf = (path) => `${sc(path)}.titleEl`;
export const titleAt = (p, path) => p.ev(`(() => { const r = ${titleOf(path)}.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 30), y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
/** The menu a long press on a title asks for on a device. */
export const titleMenu = async (p, path) => { await p.ev(`(() => { const e = ${titleOf(path)}, r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + r.height / 2, button: 0 })); return 1; })()`); await p.sleep(500); };
/** Writes down everything pending, in Obsidian and in the manuscript, and waits for the disk. */
export const saveAll = async (p) => { await p.ev(`(async () => { const m = ${M}; if (m?.scenes) await Promise.all(m.scenes.filter(s => s.live).map(s => s.live.flush())); await ${B}.flush(); await app.vault.adapter.promise; })().then(() => 1)`); await p.sleep(150); };
/** Real keys, as a hardware keyboard sends them. "\n" is Enter. */
export async function keys(p, text, gap = 0) {
	for (const ch of text) {
		const enter = ch === '\n', key = enter ? 'Enter' : ch;
		const code = enter ? 'Enter' : ch === ' ' ? 'Space' : /^[a-z]$/i.test(ch) ? 'Key' + ch.toUpperCase() : /^[0-9]$/.test(ch) ? 'Digit' + ch : undefined;
		const vk = enter ? 13 : /^[a-z0-9 ]$/i.test(ch) ? ch.toUpperCase().charCodeAt(0) : undefined;
		p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: enter ? '\r' : ch });
		const up = p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
		if (gap) { await up; await p.sleep(gap); }
	}
	await p.ev('1');
}
/** A word composed as an on-screen keyboard does it (each letter extends the composition), then committed. */
export async function compose(p, word, commit = word) {
	for (let i = 1; i <= word.length; i++) { await p.send('Input.imeSetComposition', { text: word.slice(0, i), selectionStart: i, selectionEnd: i }); await p.sleep(15); }
	await p.send('Input.insertText', { text: commit });
	await p.sleep(60);
}

// ---- menus and dialogs ----
export const sheet = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom), inner: [innerWidth, innerHeight], itemHeights: [...m.querySelectorAll('.menu-item:not(.is-label)')].map(i => Math.round(i.getBoundingClientRect().height)) }; })()`);
export const isSheet = (s) => !!s && s.left === 0 && s.width === s.inner[0] && s.bottom === s.inner[1];
/** Taps the menu item with this title (in the last menu shown), scrolled into view first. False if there's none. */
export async function menuTap(p, title) {
	const find = `[...document.querySelectorAll('.menu .menu-item')].filter(e => (e.querySelector('.menu-item-title')?.textContent ?? '') === ${j(title)}).pop()`;
	if (!(await p.ev(`(() => { const it = ${find}; if (!it) return false; it.scrollIntoView({ block: 'center' }); return true; })()`))) return false;
	await p.sleep(250);
	const at = await p.ev(`(() => { const r = (${find}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await tap(p, at.x, at.y);
	return true;
}
/** Closes any menu left open, and forgets its elements. */
export async function gone(p) {
	await closeMenus(p);
	await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`);
	await p.sleep(250);
}
export const dialogTap = async (p, text) => {
	const at = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); const b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`no “${text}” button in the dialog`);
	await p.sleep(150);
	await tap(p, at.x, at.y);
	await p.sleep(400);
};
export const dialogs = (p) => p.ev(`document.querySelectorAll('.modal-container').length`);
export const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')].map(n => n.textContent)).filter(Boolean); })()`);
export { test, bug, ux, B, PL, VIEW, flush, j, menuItems, openView, reload, tidy, until };

// =====================================================================================================================
// Tests are added below.
// =====================================================================================================================

/** A test on a device: `before` is the vault on disk as the test found it. */
const on = (size, fn) => async (p, h, t) => { const before = snap(p); await onDevice(p, size, () => fn(p, h, t, before)); };
const say = (...a) => { if (process.env.QA5_VERBOSE) console.log('      ' + a.map((x) => (typeof x === 'string' ? x : j(x))).join(' ')); };
/** Scrolls a section into the window (by script: where a swipe isn't what's being tested), and waits for the page. */
const scrollTo = async (p, path, block = 'center') => {
	// Until the page is where it was put and has stopped: a swipe's fling that is still running carries the page on
	// after a scroll made by script (found 2026-10-05: the first test of a fresh Obsidian, where the fling outlasts the
	// wait after the swipe, ended 148 px past the section, its first line under the toolbar, and the tap missed it),
	// and sections above are still being drawn, each at its own height.
	const still = () => p.ev(`(async () => { const m = ${M}, s = ${sc(path)}; let last = null, same = 0; for (let i = 0; i < 40 && same < 3; i++) { await new Promise(r => setTimeout(r, 80)); const now = m.root.scrollTop + ':' + s.el.getBoundingClientRect().top + ':' + m.scenes.filter(x => m.near.has(x.el) && x.shown === null && !x.live).length; if (now === last) same++; else { same = 0; last = now; } } return m.root.scrollTop; })()`);
	for (let i = 0, was = null; i < 4; i++) {
		await p.ev(`(() => { ${sc(path)}.el.scrollIntoView({ block: ${j(block)} }); return 1; })()`); await p.sleep(300); await settle(p);
		const now = await still();
		if (was !== null && Math.abs(now - was) <= 1) break;
		was = now;
	}
};
/** Sixteen notes of one line each: more sections in sight than the manuscript keeps editors for. */
const SHORT = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`S${String(i + 1).padStart(2, '0')}`, `---\nstatus: ${i % 2 ? 'draft' : 'idea'}\n---\nLine ${i + 1} of the short notes.\n`]));
/** Notes long enough to scroll far: `n` notes of `paras` paragraphs. */
const long = (n = 12, paras = 6) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`Scene ${String(i + 1).padStart(2, '0')}`, `---\nstatus: ${i % 2 ? 'draft' : 'idea'}\nsynopsis: Scene ${i + 1}\n---\n` + Array.from({ length: paras }, (_, k) => `Scene ${i + 1} paragraph ${k + 1}. The sea came up the rocks and the light turned over it, and the keeper wrote it down in the long book he kept by the window, as he had every night since the war.`).join('\n\n') + '\n']));
const N = (i) => `Novel/Scene ${String(i).padStart(2, '0')}.md`;

/** Changes a note's text below its properties only. */
const inBody = (text, a, b) => fm(text) + body(text).replace(a, b);
/** Taps just past the end of a section's last line of text. */
const tapEnd = async (p, path, wait = 700) => {
	const at = await p.ev(`(() => { const s = ${sc(path)}; const ls = [...s.bodyEl.querySelectorAll('.cm-content > .cm-line, .binders-manuscript-rendered > *')].filter(x => x.textContent.trim()); const r = document.createRange(); r.selectNodeContents(ls.pop()); const b = [...r.getClientRects()].pop(); return { x: b.right + 2, y: (b.top + b.bottom) / 2 }; })()`);
	await tap(p, at.x, at.y, wait);
};

// =====================================================================================================================
// The caret, by touch
// =====================================================================================================================

test('phone: a tap puts the caret on the letter tapped in the first, a middle and the last section, at a line’s end, beside a title’s rule, under a section and in the room after the last one; what’s typed goes there', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	t.eq(await active(p), 'body', 'opening the manuscript puts no caret anywhere (no keyboard)');
	let c;
	await tapText(p, PROLOGUE, 'forty', 2);
	c = await caret(p);
	t.eq(j([c?.path, c?.before.slice(-4), c?.after.slice(0, 3)]), j([PROLOGUE, 'n fo', 'rty']), 'first section: the caret is between the letters tapped');
	t.eq(await p.ev(`app.workspace.activeEditor?.file?.path ?? null`), PROLOGUE, 'and it’s Obsidian’s active editor');
	await p.type('A');
	await tapText(p, STORM, 'keeper', 0);
	c = await caret(p);
	t.eq(j([c?.path, c?.after.slice(0, 6)]), j([STORM, 'keeper']), 'a middle section: before the word tapped');
	await p.type('B');
	// the end of a line: a tap past its last letter
	const end = await textAt(p, ARRIVAL, 'opened.', 7);
	await tap(p, end.x + 40, end.y, 700);
	c = await caret(p);
	t.eq(j([c?.path, c?.head]), j([ARRIVAL, body(before[ARRIVAL]).trimEnd().length]), 'a tap past the end of a section’s last line: the caret is at its end');
	await p.type('C');
	// beside the title, on its rule: the start of that section
	const title = await titleAt(p, KEEPER);
	await tap(p, 300, title.y, 700);
	c = await caret(p);
	t.eq(j([c?.path, c?.head]), j([KEEPER, 0]), 'a tap on the rule beside a title: the caret is at the start of its section');
	await p.type('D');
	// the last section, and the room after it
	for (let i = 0; i < 3; i++) await swipe(p, 200, 600, 200, 250, 8);
	await settle(p);
	await tapText(p, EPILOGUE, 'postcards', 4);
	c = await caret(p);
	t.eq(j([c?.path, c?.before.slice(-4), c?.after.slice(0, 5)]), j([EPILOGUE, 'post', 'cards']), 'the last section: on the letter tapped');
	await p.type('E');
	const last = await textAt(p, EPILOGUE, 'now.', 4);
	await p.ev(`document.activeElement.blur()`);
	await tap(p, 200, last.bottom + 150, 700);
	c = await caret(p);
	t.eq(j([c?.path, c?.head]), j([EPILOGUE, body(before[EPILOGUE]).length + 1]), 'a tap in the room after the last section: the caret is at the end of its text (its empty last line, as in a note)');
	await p.type('F');
	await shot(p, 'caret-taps');
	await saveAll(p);
	sameBut(t, before, snap(p), {
		[PROLOGUE]: inBody(before[PROLOGUE], 'in forty', 'in foArty'),
		[STORM]: before[STORM].replace('The keeper', 'The Bkeeper'),
		[ARRIVAL]: before[ARRIVAL].replace('opened.', 'opened.C'),
		[KEEPER]: before[KEEPER].replace('He met', 'DHe met'),
		[EPILOGUE]: before[EPILOGUE].replace('postcards', 'postEcards').replace('now.\n', 'now.\nF'),
	});
}));

// On a phone a section is its editor only once it's tapped (decided 2026-10-05: making an editor costs a phone a frame
// or more, and swiping through a long manuscript made one after another for text that was only being read).
test('phone: a section becomes its editor only when tapped: none by opening or swiping; the tap puts the caret on the letter under the finger without moving the page, and the keyboard’s field has the focus; every key lands in the tapped note; a section left goes back to plain text with what was typed, undo still takes it back, an outside change is kept; a tablet is as before', async (p, h, t) => {
	const live = () => p.ev(`${M}.scenes.filter(s => s.live || s.mounting).map(s => s.file.basename).join(', ')`);
	const editors = () => p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript .cm-editor').length`);
	await onDevice(p, PHONE, async () => {
		await binder(p, 'Novel', long(14, 6));
		const before = snap(p);
		await openMs(p, 'Novel');
		await p.sleep(1500);
		t.eq(await p.ev(`${M}.byTap`), true, 'a phone');
		t.eq(j([await live(), await editors(), await active(p)]), j(['', 0, 'body']), 'opened: every section is plain text, and nothing has the focus');
		t.ok(await p.ev(`${M}.scenes.filter(s => ${M}.near.has(s.el)).every(s => s.shown !== null)`), 'the sections near the screen are drawn');
		await p.ev(`(() => { window.__tapf = 0; window.__tapfl = () => window.__tapf++; document.addEventListener('focusin', window.__tapfl, true); return 1; })()`);
		for (let i = 0; i < 4; i++) { await swipe(p, 200, 640, 200, 180, 6, 300); }
		await p.sleep(1200);
		for (let i = 0; i < 3; i++) { await swipe(p, 200, 250, 200, 640, 6, 300); }
		await p.sleep(2500);
		t.eq(j([await live(), await editors(), await p.ev(`window.__tapf`)]), j(['', 0, 0]), 'swiped down the page and back, and left alone: still no editor, and nothing took the focus');
		// the tap
		await scrollTo(p, N(3), 'start');
		const top0 = await scrollTop(p), at0 = await textAt(p, N(3), 'Scene 3 paragraph 2.', 0);
		await tapText(p, N(3), 'Scene 3 paragraph 2.', 8, 1200);
		let c = await caret(p);
		t.eq(j([c?.path, c?.before.slice(-8), c?.after.slice(0, 5)]), j([N(3), 'Scene 3 ', 'parag']), 'a tap: the caret is on the letter under the finger');
		t.ok(await p.ev(`document.activeElement.isContentEditable && document.activeElement.matches('.cm-content')`), 'in a field the keyboard opens for');
		t.eq(await p.ev(`app.workspace.activeEditor?.file?.path ?? null`), N(3), 'which is Obsidian’s active editor');
		t.eq(await live(), 'Scene 03', 'only the tapped section is an editor');
		const at1 = await textAt(p, N(3), 'Scene 3 paragraph 2.', 0);
		t.ok((await scrollTop(p)) === top0 && Math.abs(at1.y - at0.y) <= 1 && Math.abs(at1.x - at0.x) <= 1, `the page didn’t move under the finger (${j([top0, at0.x, at0.y])} → ${j([await scrollTop(p), at1.x, at1.y])})`);
		// every key: an on-screen keyboard's text, a composed word, a hardware keyboard's keys
		await p.type('one ');
		await compose(p, 'two');
		await keys(p, ' three\n');
		t.eq((await caret(p))?.path, N(3), 'typing keeps the caret in the tapped section');
		// a tap in another section: the caret goes there, at once, and the one left is plain text again once saved
		await scrollTo(p, N(4), 'start');
		await tapText(p, N(4), 'Scene 4 paragraph 1.', 6, 1200);
		c = await caret(p);
		t.eq(j([c?.path, c?.after.slice(0, 2)]), j([N(4), '4 ']), 'a tap in the next section moves the caret there');
		await p.type('four ');
		await until(p, `${M}.scenes.filter(s => s.live).length === 1`, 8000);
		t.eq(await live(), 'Scene 04', 'the section left is plain text again once what was typed in it is saved');
		const typed3 = before[N(3)].replace('Scene 3 paragraph 2.', 'Scene 3 one two three\nparagraph 2.');
		t.eq(disk(p, N(3)), typed3, 'every key typed in the first is in its note, once, in order');
		t.ok(await p.ev(`${sc(N(3))}.bodyEl.querySelector('.binders-manuscript-rendered')?.textContent.includes('Scene 3 one two three')`), 'and its plain text shows it');
		// the keyboard put away to read: the section the caret was in stays as it is while it's near
		await p.ev(`(() => { document.activeElement.blur(); return 1; })()`);
		await p.sleep(4500);
		t.eq(j([await live(), await active(p)]), j(['Scene 04', 'body']), 'the keyboard put away: the section the caret was last in is still its editor');
		await tapText(p, N(4), 'Scene 4 paragraph 2.', 6, 900);
		await p.type('five ');
		// back in the first: its editor is a new one, with its undo history
		await scrollTo(p, N(3), 'start');
		await tapText(p, N(3), 'paragraph 3.', 0, 1200);
		t.eq((await caret(p))?.path, N(3), 'a tap back in the first');
		await p.type('six ');
		await p.sleep(700);
		await p.ev(`app.commands.executeCommandById('editor:undo')`); await p.sleep(200);
		t.eq(await p.ev(`${sc(N(3))}.live.text`), typed3, 'undo takes back what was just typed');
		// (as many steps as the typing made: a word composed and Enter are steps of their own)
		for (let i = 0; i < 12 && (await p.ev(`${sc(N(3))}.live.text`)) !== before[N(3)]; i++) { await p.ev(`app.commands.executeCommandById('editor:undo')`); await p.sleep(150); }
		t.eq(await p.ev(`${sc(N(3))}.live.text`), before[N(3)], 'and then what was typed before the section was left: its undo history came back with its editor');
		for (let i = 0; i < 12 && (await p.ev(`${sc(N(3))}.live.text`)) !== typed3; i++) { await p.ev(`app.commands.executeCommandById('editor:redo')`); await p.sleep(150); }
		t.eq(await p.ev(`${sc(N(3))}.live.text`), typed3, 'redo puts it back');
		// a note changed outside while it's plain text: drawn again; then tapped and typed in, both are kept
		const synced = before[N(5)].replace('Scene 5 paragraph 1.', 'Scene 5 paragraph 1, synced.');
		await p.ev(`app.vault.adapter.write(${j(N(5))}, ${j(synced)}).then(() => 1)`);
		await scrollTo(p, N(5), 'start');
		await until(p, `!!${sc(N(5))}.bodyEl.querySelector('.binders-manuscript-rendered')?.textContent.includes('synced')`, 6000);
		await tapText(p, N(5), 'synced', 0, 1200);
		await p.type('and ');
		// swiped far away: the caret is let go, and no editor is left
		for (let i = 0; i < 8; i++) await swipe(p, 200, 640, 200, 180, 6, 120);
		await until(p, `${M}.scenes.every(s => !s.live && !s.mounting)`, 10000);
		t.eq(j([await live(), await editors(), await active(p)]), j(['', 0, 'body']), 'swiped far from the caret: no editor is left');
		await saveAll(p);
		sameBut(t, before, snap(p), {
			[N(3)]: typed3,
			[N(4)]: before[N(4)].replace('Scene 4 paragraph 1.', 'Scene four 4 paragraph 1.').replace('Scene 4 paragraph 2.', 'Scene five 4 paragraph 2.'),
			[N(5)]: synced.replace('synced', 'and synced'),
		});
	});
	// a tablet has the room and the speed: sections near the screen are editors without a tap, as on a computer
	await onDevice(p, TABLET, async () => {
		t.ok(await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('The Lighthouse') ?? app.vault.getRoot())?.length === 7`, 30000), 'the binder is there on the tablet');
		await openMs(p);
		t.eq(await p.ev(`${M}.byTap`), false, 'a tablet');
		t.ok(await until(p, `${M}.scenes.filter(s => s.live).length >= 3`, 6000), 'tablet: the sections near the screen are editors without a tap: ' + await live());
		t.eq(await active(p), 'body', 'tablet: and none has the focus');
	});
});

test('tablet, upright and on its side: a tap in a section that’s in sight but not live yet (more sections in sight than editors) puts the caret where it was tapped, without moving the page', async (p, h, t) => {
	for (const size of [TABLET, land(TABLET)]) {
		await onDevice(p, size, async () => {
			await binder(p, 'Shorts', SHORT);
			const before = snap(p);
			await openMs(p, 'Shorts');
			await p.sleep(800);
			const plain = await p.ev(`(() => { const m = ${M}, v = m.root.getBoundingClientRect(); return m.scenes.filter(s => !s.live && s.shown !== null && s.bodyEl.getBoundingClientRect().top > v.top && s.bodyEl.getBoundingClientRect().bottom < v.bottom - 80).map(s => s.file.path); })()`);
			say(size, 'in sight, not live:', plain);
			if (size !== TABLET && !plain.length) return; // (on its side every section in sight has its editor)
			t.ok(plain.length > 0, `${size[0]} px: some sections in sight are shown as plain text: ${j(plain)}`);
			const path = plain[plain.length - 1], n = /S(\d+)/.exec(path)[1], top0 = await scrollTop(p);
			const at0 = await textAt(p, path, 'short', 0);
			await tapText(p, path, 'short', 2, 1200);
			const c = await caret(p);
			await shot(p, `caret-not-live-${size[0]}`);
			t.eq(j([c?.path, c?.before.slice(-5), c?.after.slice(0, 3)]), j([path, 'he sh', 'ort']), `${size[0]} px: the caret is on the letter tapped`);
			t.eq(await scrollTop(p), top0, `${size[0]} px: the page didn’t move`);
			const at1 = await textAt(p, path, 'short', 0);
			t.ok(Math.abs(at1.y - at0.y) <= 1 && Math.abs(at1.x - at0.x) <= 1, `${size[0]} px: nor did the text tapped (${j([at0.x, at0.y])} → ${j([at1.x, at1.y])})`);
			await p.type(size === TABLET ? 'p' : 't');
			await saveAll(p);
			t.eq(disk(p, path), before[path].replace('short', size === TABLET ? 'shport' : 'shtort'), `${size[0]} px: what’s typed is in the note, once`);
		});
	}
});

test('every phone size, upright: with the keyboard up, the caret is in sight above Obsidian’s editing toolbar after typing a long run and after Enter; nothing sticks out sideways', async (p, h, t) => {
	const before = snap(p);
	const report = {};
	await onDevice(p, PHONE, async () => {
		for (const size of [SMALL, ANDROID, PHONE, BIG]) {
			const name = size.join('x');
			await metrics(p, ...size);
			await p.sleep(500);
			await openMs(p);
			await p.sleep(400);
			t.ok(await p.ev(`(() => { const m = ${MAN}; return m.scrollWidth <= m.clientWidth && [...m.querySelectorAll('.binders-manuscript-page *')].every(e => e.getBoundingClientRect().right <= innerWidth + 1); })()`), `${name}: nothing is wider than the screen`);
			await scrollTo(p, KEEPER, 'start');
			await tapText(p, KEEPER, 'doorway', 0);
			await keyboard(p, size, true);
			await p.sleep(500);
			let c = await caret(p);
			report[name] = { band: c ? Math.min(c.viewBottom, c.toolbar ?? c.inner) - c.viewTop : null, afterTap: seen(c) };
			await p.type('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen ');
			await p.sleep(300);
			c = await caret(p);
			await shot(p, `keyboard-${name}`);
			t.ok(seen(c), `${name}: after a long run typed with the keyboard up, the caret is in sight (${j(c)})`);
			await p.key('Enter'); await p.key('Enter');
			await p.type('x');
			await p.sleep(300);
			c = await caret(p);
			t.ok(seen(c), `${name}: after Enter twice, the caret is in sight (${j(c)})`);
			t.ok(await p.ev(`${MAN}.scrollLeft === 0 && document.scrollingElement.scrollLeft === 0`), `${name}: the page didn’t go sideways`);
			await keyboard(p, size, false);
			await saveAll(p);
			t.eq(disk(p, KEEPER), before[KEEPER].replace('doorway', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen \n\nxdoorway'), `${name}: every key is in the note, once`);
			await p.ev(`(async () => { document.activeElement.blur(); await app.vault.adapter.write(${j(KEEPER)}, ${j(before[KEEPER])}); })().then(() => 1)`);
			await p.sleep(900);
		}
		say('room for text with the keyboard up (px):', report);
		sameBut(t, before, snap(p), {});
	});
});

ux('phone: when the keyboard comes up after a tap low on the screen, the caret is brought above it, as in a note (it stays under the keyboard until something is typed)', on(PHONE, async (p, h, t, before) => {
	await binder(p, 'Novel', long(4, 8));
	// a note of its own, for what Obsidian does
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(N(1))})).then(() => 1)`);
	await p.sleep(900);
	const low = await p.ev(`(() => { const ls = [...document.querySelectorAll('${LEAF} .cm-content .cm-line')].map(l => l.getBoundingClientRect()).filter(r => r.height > 20 && r.top > 560 && r.top < 700); const r = ls[0]; return { x: r.left + 60, y: r.top + 12 }; })()`);
	await tap(p, low.x, low.y, 700);
	await keyboard(p, PHONE, true);
	await p.sleep(700);
	const native = await p.ev(`(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(), tb = document.querySelector('.mobile-toolbar').getBoundingClientRect(); return { caret: Math.round(r.bottom), toolbar: Math.round(tb.top), focused: document.activeElement.classList.contains('cm-content') }; })()`);
	await shot(p, 'ux-keyboard-native');
	await keyboard(p, PHONE, false);
	t.ok(native.focused && native.caret <= native.toolbar, `in a note, the caret tapped at ${Math.round(low.y)} px is above the editing toolbar once the keyboard is up: ${j(native)}`);
	// the same in the manuscript
	await openMs(p, 'Novel');
	const at = await p.ev(`(() => { const ls = [...document.querySelectorAll('${LEAF} .binders-manuscript :is(.cm-content .cm-line, .binders-manuscript-rendered > p)')].flatMap(l => { const g = document.createRange(); g.selectNodeContents(l); return [...g.getClientRects()]; }).filter(r => r.height > 15 && r.top > 560 && r.top < 700); const r = ls[0]; return { x: r.left + 60, y: r.top + 12 }; })()`);
	await tap(p, at.x, at.y, 700);
	t.ok(await caret(p), 'a tap low on the screen puts the caret there');
	await keyboard(p, PHONE, true);
	await p.sleep(700);
	const c = await caret(p);
	await shot(p, 'ux-keyboard-manuscript');
	await keyboard(p, PHONE, false);
	t.ok(seen(c), `in the manuscript, the caret tapped at ${Math.round(at.y)} px is in sight once the keyboard is up: ${j(c)}`);
}));

bug('small phone with the keyboard up, or on its side: the view itself doesn’t scroll (the page can’t be shorter than its own padding, 50vh + 8 px, so it sticks out of its pane; the pane scrolls, the toolbar goes with it, and the caret’s line is under the editing toolbar)', on(SMALL, async (p, h, t) => {
	await openMs(p);
	const outer = () => p.ev(`(() => { const v = document.querySelector('${LEAF} .view-content'), m = ${MAN}, tb = document.querySelector('${LEAF} .binders-toolbar').getBoundingClientRect(); return { over: v.scrollHeight - v.clientHeight, top: v.scrollTop, page: Math.round(m.getBoundingClientRect().bottom), pane: Math.round(v.getBoundingClientRect().bottom), toolbar: tb.height ? Math.round(tb.top) : null, header: Math.round(document.querySelector('${LEAF} .view-header').getBoundingClientRect().bottom) }; })()`);
	const seenAt = {};
	seenAt.upright = await outer();
	t.eq(seenAt.upright.over, 0, 'upright with no keyboard, the view doesn’t scroll');
	await scrollTo(p, KEEPER, 'start');
	await tapText(p, KEEPER, 'He met', 0);
	await keyboard(p, SMALL, true);
	await p.type('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen ');
	await p.sleep(400);
	seenAt.keyboard = await outer();
	await shot(p, 'bug-view-scrolls-keyboard');
	await keyboard(p, SMALL, false);
	await p.ev(`document.activeElement.blur()`);
	await metrics(p, ...land(SMALL));
	await p.sleep(600);
	await scrollTo(p, STORM, 'start');
	seenAt.side = await outer();
	await shot(p, 'bug-view-scrolls-landscape');
	say(seenAt);
	t.ok(seenAt.keyboard.over <= 0 && seenAt.keyboard.top === 0 && (seenAt.keyboard.toolbar == null || seenAt.keyboard.toolbar >= seenAt.keyboard.header - 1), `320 × 568, keyboard up, after typing (the toolbar has given its line to the page, or is still under the header): the view can scroll ${seenAt.keyboard.over} px and has scrolled ${seenAt.keyboard.top}; the page ends at ${seenAt.keyboard.page}, its pane at ${seenAt.keyboard.pane}`);
	t.ok(seenAt.side.over <= 0 && seenAt.side.top === 0, `568 × 320, no keyboard: the view can scroll ${seenAt.side.over} px and has scrolled ${seenAt.side.top}`);
}));

// =====================================================================================================================
// Nothing typed is lost or doubled
// =====================================================================================================================

/** Taps at the end of The keeper's text and types. */
const typeInKeeper = async (p, text = ' XYZ') => { await tapEnd(p, KEEPER); await p.type(text); };
const KEPT = (before, text = ' XYZ') => before[KEEPER].replace('doorway.', 'doorway.' + text);

test('phone: typing, then at once another mode from the toolbar’s sheet (and back, and typing again): every key is in the note once', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await typeInKeeper(p);
	const b = await p.at(`${LEAF} .binders-mode-button`);
	await tap(p, b.x, b.y, 300);
	t.ok(await menuTap(p, 'Corkboard'), 'Corkboard, in the sheet');
	await until(p, `!!document.querySelector('${LEAF} .binders-card')`);
	await p.sleep(700);
	t.eq(disk(p, KEEPER), KEPT(before), 'on the corkboard a moment later, what was typed is on disk');
	await tap(p, b.x, b.y, 300);
	await menuTap(p, 'Manuscript');
	await settle(p);
	t.eq(await active(p), 'body', 'back in the manuscript, no caret (no keyboard) until a tap');
	await typeInKeeper(p, '!');
	// and with no pause at all
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(700);
	sameBut(t, before, snap(p), { [KEEPER]: KEPT(before, ' XYZ!') });
}));

test('phone: typing in a folder’s manuscript, then at once up by the breadcrumb, then into the folder by its heading, then Back: every key once', on(PHONE, async (p, h, t, before) => {
	await openMs(p, L + 'Part One');
	await typeInKeeper(p);
	const up = await p.at(`${LEAF} .binders-crumb[role="link"]`);
	t.ok(up, 'the breadcrumb has the binder to go up to');
	await tap(p, up.x, up.y, 200);
	await until(p, `${VIEW}.folder?.path === 'The Lighthouse'`);
	await p.sleep(600);
	t.eq(disk(p, KEEPER), KEPT(before), 'up in the binder, what was typed is on disk');
	await settle(p);
	t.eq((await p.ev(`${VIEW}.mode`)), 'manuscript', 'still the manuscript');
	await tapText(p, PROLOGUE, 'surprised.', 10);
	await p.type(' QQ');
	// into Part One by its heading
	const hd = await p.at(`${LEAF} .binders-manuscript-heading h1`);
	await tap(p, hd.l + 20, hd.y, 200);
	await until(p, `${VIEW}.folder?.path === ${j(L + 'Part One')}`);
	await p.sleep(600);
	t.eq((await p.ev(`${VIEW}.folder?.path`)), L + 'Part One', 'a tap on a folder’s heading goes into the folder');
	t.eq(disk(p, PROLOGUE), before[PROLOGUE].replace('surprised.', 'surprised. QQ'), 'what was typed just before is on disk');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `${VIEW}.folder?.path === 'The Lighthouse'`);
	await settle(p);
	t.eq(await active(p), 'body', 'Back: no caret by itself');
	sameBut(t, before, snap(p), { [KEEPER]: KEPT(before), [PROLOGUE]: before[PROLOGUE].replace('surprised.', 'surprised. QQ') });
}));

test('phone: typing, then at once “Open” from the title’s menu: the note opens with what was typed, and typing carries on there; Back to the manuscript shows it all, once', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await typeInKeeper(p);
	await titleMenu(p, KEEPER);
	t.ok(isSheet(await sheet(p)), 'the title’s menu is a sheet');
	t.ok(await menuTap(p, 'Open'), 'Open');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(KEEPER)}`);
	await p.sleep(500);
	t.eq(await p.ev(`app.workspace.activeEditor?.editor?.getValue() ?? null`), KEPT(before), 'the note opens with what was typed');
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setCursor(ed.lastLine() - 1, ed.getLine(ed.lastLine() - 1).length); return 1; })()`);
	await p.type(' note');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `!!document.querySelector('${LEAF} .binders-manuscript')`);
	await settle(p);
	await p.sleep(600);
	t.ok(/doorway\. XYZ note$/.test((await p.ev(`${sc(KEEPER)}.bodyEl.innerText`)).trim()), 'Back: the manuscript shows both');
	await saveAll(p);
	sameBut(t, before, snap(p), { [KEEPER]: KEPT(before, ' XYZ note') });
}));

bug('phone: typing, then the app goes to the background at once (the page is hidden): what was typed is written down then, as Obsidian writes its notes (it stays unsaved for two seconds more, and is lost if the app is closed there)', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await typeInKeeper(p);
	await p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('blur')); return 1; })()`);
	await p.sleep(700);
	const hidden = disk(p, KEEPER);
	await p.ev(`(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('focus')); return 1; })()`);
	await p.sleep(2600);
	t.eq(disk(p, KEEPER), KEPT(before), 'left alone, it’s written two seconds after the last key');
	t.eq(hidden, KEPT(before), '0.7 s after the page was hidden, the note on disk has what was typed');
}));

test('phone: typing, then the drawer and another note tapped there; typing, then the tab closed; typing, then the plugin turned off: every key is on disk once', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await typeInKeeper(p);
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[0].view; v.fileItems['Longform demo']?.setCollapsed(false); return 1; })()`);
	await p.sleep(900);
	await shot(p, 'loss-drawer');
	const row = await p.at(`.nav-files-container .tree-item-self[data-path="Longform demo/Island.md"]`);
	t.ok(row, 'the drawer shows the other note');
	await tap(p, row.x, row.y, 300);
	await until(p, `app.workspace.getActiveFile()?.path === 'Longform demo/Island.md'`);
	await p.sleep(500);
	t.eq(disk(p, KEEPER), KEPT(before), 'a note opened from the drawer over the manuscript: what was typed is on disk');
	// the tab closed
	await openMs(p);
	// (its line in the middle of the page: where the page opens, it is under Obsidian's bar of buttons at the foot of a
	// phone, and the tap would open the list of tabs instead)
	await scrollTo(p, STORM);
	await tapText(p, STORM, 'war.', 4);
	t.eq((await caret(p))?.path, STORM, 'the tab closed: the caret is in the note tapped');
	await p.type(' AB');
	await p.ev(`(() => { app.workspace.getMostRecentLeaf().detach(); return 1; })()`);
	await p.sleep(600);
	t.eq(disk(p, STORM), before[STORM].replace('war.', 'war. AB'), 'the tab closed: on disk');
	// the plugin turned off
	await openMs(p);
	await tapText(p, PROLOGUE, 'surprised.', 10);
	await p.type(' CD');
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	await p.sleep(600);
	const off = disk(p, PROLOGUE);
	await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
	await p.sleep(800);
	t.eq(off, before[PROLOGUE].replace('surprised.', 'surprised. CD'), 'the plugin turned off: on disk');
	sameBut(t, before, snap(p), { [KEEPER]: KEPT(before), [STORM]: before[STORM].replace('war.', 'war. AB'), [PROLOGUE]: off });
}));

test('phone: the note changes outside (a sync) while its section has unsaved typing: at its start, at its end, in its properties, and in the line being typed in: both are kept, once', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	const outside = async (edit) => { await p.ev(`(async () => { const t = await app.vault.adapter.read(${j(KEEPER)}); await app.vault.adapter.write(${j(KEEPER)}, (${edit})(t)); })().then(() => 1)`); await p.sleep(1200); };
	await tapText(p, KEEPER, 'tower', 0);
	await p.type('tall ');
	await outside(`t => t.replace('He met', 'Synced. He met')`);
	await p.type('white ');
	await outside(`t => t.replace('status: draft', 'status: done')`);
	await p.type('old ');
	await outside(`t => t + 'A line added by the other device.\\n'`);
	await p.type('stone ');
	await p.sleep(300);
	await saveAll(p);
	const want = inBody(before[KEEPER], 'tower', 'tall white old stone tower').replace('He met', 'Synced. He met').replace('status: draft', 'status: done') + 'A line added by the other device.\n';
	t.eq(disk(p, KEEPER), want, 'changes around the typing, and the typing');
	t.eq(await p.ev(`${sc(KEEPER)}.live.editor.getValue()`), want, 'and the section shows the same');
	const c = await caret(p);
	t.eq(j([c?.path, c?.after.slice(0, 5)]), j([KEEPER, 'tower']), 'the caret is still where it was typing');
	// in the very line being typed in, at another place
	await p.type('grey ');
	await outside(`t => t.replace('doorway.', 'doorway, not an inch.')`);
	await p.type('wet ');
	await saveAll(p);
	t.eq(disk(p, KEEPER), want.replace('stone tower', 'stone grey wet tower').replace('doorway.', 'doorway, not an inch.'), 'a change elsewhere in the line being typed in');
	sameBut(t, before, snap(p), { [KEEPER]: want.replace('stone tower', 'stone grey wet tower').replace('doorway.', 'doorway, not an inch.') });
}));

test('tablet: the same note open beside the manuscript: typing in one then at once in the other, by touch, both ways round, keeps every key once', on(TABLET, async (p, h, t, before) => {
	await openMs(p);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(app.vault.getAbstractFileByPath(${j(KEEPER)})); })().then(() => 1)`);
	await p.sleep(1200);
	await shot(p, 'tablet-split');
	const NOTEV = `app.workspace.getLeavesOfType('markdown')[0].view`;
	const noteEnd = () => p.ev(`(() => { const ls = ${NOTEV}.contentEl.querySelectorAll('.cm-content > .cm-line'); const l = [...ls].filter(x => x.textContent.trim()).pop(); const r = document.createRange(); r.selectNodeContents(l); const b = [...r.getClientRects()].pop(); return { x: b.right + 2, y: (b.top + b.bottom) / 2 }; })()`);
	const msEnd = async () => { const e = await p.ev(`(() => { const ls = ${sc(KEEPER)}.bodyEl.querySelectorAll('.cm-content > .cm-line'); const l = [...ls].filter(x => x.textContent.trim()).pop(); const r = document.createRange(); r.selectNodeContents(l); const b = [...r.getClientRects()].pop(); return { x: b.right + 2, y: (b.top + b.bottom) / 2 }; })()`); return e; };
	let at = await msEnd();
	await tap(p, at.x, at.y, 500);
	await p.type(' m1');
	at = await noteEnd();
	await tap(p, at.x, at.y, 300);
	await p.type(' n1');
	at = await msEnd();
	await tap(p, at.x, at.y, 300);
	await p.type(' m2');
	await p.sleep(2600); // the notes save themselves
	at = await noteEnd();
	await tap(p, at.x, at.y, 300);
	await p.type(' n2');
	at = await msEnd();
	await tap(p, at.x, at.y, 300);
	await p.type(' m3');
	await p.sleep(300);
	const shown = [await p.ev(`${NOTEV}.editor.getValue()`), await p.ev(`${sc(KEEPER)}.live.editor.getValue()`)];
	await saveAll(p);
	await p.sleep(2600);
	const want = KEPT(before, ' m1 n1 m2 n2 m3');
	t.eq(shown[0], want, 'the note shows every key');
	t.eq(shown[1], want, 'the manuscript too');
	sameBut(t, before, snap(p), { [KEEPER]: want });
}));

test('phone: typing, then at once from the title’s menu: a status, a label, “Include in export”, “Move down”, “Duplicate”; the properties change and every key stays, the copy has them too', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await typeInKeeper(p, ' a');
	await titleMenu(p, KEEPER);
	t.ok(await menuTap(p, 'Set status'), 'Set status');
	await p.sleep(300);
	t.ok(await menuTap(p, 'Done'), 'Done');
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'a status picked closes the sheets');
	await typeInKeeper(p, 'b');
	await titleMenu(p, KEEPER);
	t.ok(await menuTap(p, 'Set label'), 'Set label');
	await p.sleep(300);
	t.ok(await menuTap(p, 'Red'), 'Red');
	await p.sleep(400);
	await typeInKeeper(p, 'c');
	await titleMenu(p, KEEPER);
	t.ok(await menuTap(p, 'Include in export'), 'Include in export');
	await p.sleep(400);
	await typeInKeeper(p, 'd');
	await titleMenu(p, KEEPER);
	t.ok(await menuTap(p, 'Move down'), 'Move down');
	await p.sleep(600);
	t.eq(j((await titles(p)).slice(2, 5)), j(['Arrival', 'Storm warning', 'The keeper']), 'the section moves down the page');
	await typeInKeeper(p, 'e');
	await titleMenu(p, KEEPER);
	t.ok(await menuTap(p, 'Duplicate'), 'Duplicate');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper 2.md')}) || !!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper copy.md')}) || app.vault.getMarkdownFiles().length > 16`, 4000);
	await p.sleep(800);
	await shot(p, 'loss-menu-props');
	t.eq(j(await notices(p)), '[]', 'no notice about any of it');
	await saveAll(p);
	const after = snap(p), made = Object.keys(after).filter((k) => !(k in before));
	t.eq(made.length, 1, 'one new note: ' + j(made));
	const want = before[KEEPER].replace('doorway.', 'doorway. abcde');
	t.eq(body(after[KEEPER]), body(want), 'every key is in the note’s text, once');
	t.ok(/^status: Done$/m.test(after[KEEPER]) && /^label: Red$/m.test(after[KEEPER]) && /^export: false$/m.test(after[KEEPER]), 'with its status, label and export set: ' + fm(after[KEEPER]));
	t.ok(/^synopsis: The keeper refuses to let her into the tower\.$/m.test(after[KEEPER]) && /^plotlines:\n  - Mara\n  - The keeper's secret$/m.test(after[KEEPER]), 'and its other properties as they were');
	t.eq(body(after[made[0]]), body(want), 'the copy has every key too');
	const order = fm(after[NOTE]);
	t.ok(/- Part One\/Arrival\n  - Part One\/Storm warning\n  - Part One\/The keeper\n  - (")?Part One\/The keeper/.test(order), 'the binder’s order has the move and the copy: ' + order);
	for (const k of Object.keys(before)) if (![KEEPER, NOTE].includes(k)) t.eq(after[k], before[k], `“${k}” is unchanged`);
}));

test('phone: a word still being composed by the keyboard (underlined, not committed) when the mode is switched, when the page is swiped far away, and when a title is tapped: it’s in the note, once', on(PHONE, async (p, h, t, before) => {
	await binder(p, 'Novel', long(8, 6));
	const b0 = snap(p);
	await openMs(p, 'Novel');
	const composing = async (word) => { for (let i = 1; i <= word.length; i++) { await p.send('Input.imeSetComposition', { text: word.slice(0, i), selectionStart: i, selectionEnd: i }); await p.sleep(20); } };
	await tapText(p, N(1), 'Scene 1 paragraph 1.', 20);
	await p.type(' ');
	await composing('alpha');
	t.ok(await p.ev(`${sc(N(1))}.live.cm.composing || ${sc(N(1))}.live.cm.compositionStarted`), 'the word is being composed');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(900);
	t.eq(disk(p, N(1)), b0[N(1)].replace('paragraph 1.', 'paragraph 1. alpha'), 'the mode switched mid-word: the word is on disk');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	// swiped far away mid-word
	await tapText(p, N(1), 'Scene 1 paragraph 2.', 20);
	await p.type(' ');
	await composing('beta');
	for (let i = 0; i < 9; i++) await swipe(p, 200, 640, 200, 180, 6, 120);
	await p.sleep(1500);
	const s = await st(p);
	t.eq(s.active, 'body', 'swiped far away, the section has let go of the caret');
	t.eq(disk(p, N(1)), b0[N(1)].replace('paragraph 1.', 'paragraph 1. alpha').replace('paragraph 2.', 'paragraph 2. beta'), 'swiped far away mid-word: the word is on disk');
	// a title tapped mid-word
	const near = N(7), n = 7;
	await scrollTo(p, near, 'start');
	await tapText(p, near, `Scene ${n} paragraph 1.`, `Scene ${n} paragraph 1.`.length);
	await p.type(' ');
	await composing('gamma');
	const ti = await titleAt(p, near);
	await tap(p, ti.x, ti.y, 600);
	t.eq(await p.ev(`document.activeElement.classList.contains('is-renaming')`), true, 'the title is being renamed');
	await p.key('Escape');
	await p.sleep(900);
	await saveAll(p);
	sameBut(t, b0, snap(p), { [N(1)]: b0[N(1)].replace('paragraph 1.', 'paragraph 1. alpha').replace('paragraph 2.', 'paragraph 2. beta'), [near]: b0[near].replace('paragraph 1.', 'paragraph 1. gamma') });
}));

// =====================================================================================================================
// Editing by the on-screen keyboard
// =====================================================================================================================

test('phone: Backspace at the very start of a section and Delete at its very end touch nothing outside it; “Select all” then a letter replaces the section’s text and leaves its properties; autocorrected and swipe-typed words, a cut and a paste land once', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	// (a section that was left is plain text again on a phone: its text is then the note's)
	const val = (path) => p.ev(`(async () => { const s = ${sc(path)}; if (s.live) return s.live.editor.getValue(); await s.saved; return app.vault.read(s.file); })()`);
	await tapText(p, KEEPER, 'He met', 0);
	await p.key('Backspace'); await p.key('Backspace');
	// (as an on-screen keyboard deletes: no key, the browser's own deletion)
	await p.ev(`document.execCommand('delete')`);
	await p.sleep(200);
	t.eq(await val(KEEPER), before[KEEPER], 'Backspace at the start of a section’s text changes nothing (its hidden properties are whole)');
	t.eq((await caret(p))?.head, 0, 'and the caret stays there');
	await tapEnd(p, EPILOGUE.replace('Epilogue', 'Part One/Arrival'));
	await p.key('ArrowDown'); // (onto the empty last line)
	await p.key('Delete'); await p.ev(`document.execCommand('forwardDelete')`);
	await p.sleep(200);
	t.eq(await val(ARRIVAL), before[ARRIVAL], 'Delete at the very end of a section changes nothing');
	t.eq(await val(KEEPER), before[KEEPER], 'nor the section after it');
	// select all, as the text menu's "Select all" does it
	await tapText(p, STORM, 'keeper', 0);
	await p.ev(`document.execCommand('selectAll')`);
	await p.sleep(300);
	const sel = await caret(p);
	t.eq(j([sel.path, sel.anchor, sel.head]), j([STORM, 0, body(before[STORM]).length]), '“Select all” selects the section’s text, and only that');
	await shot(p, 'edit-select-all');
	await p.type('New text.');
	// autocorrect: each word composed, the last one committed as something else; then a word typed in one go
	await tapEnd(p, KEEPER);
	await p.type(' ');
	await compose(p, 'teh', 'the'); await p.type(' ');
	await compose(p, 'recieve', 'receive');
	await p.send('Input.insertText', { text: ' swiped words' });
	await p.sleep(200);
	// cut "swiped" and paste it, with a second paragraph, into another section
	await p.ev(`(() => { const cm = ${sc(KEEPER)}.live.cm; const i = cm.state.doc.toString().indexOf(' swiped words'); cm.dispatch({ selection: { anchor: i, head: i + 13 } }); const dt = new DataTransfer(); cm.contentDOM.dispatchEvent(new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true })); window.__qa5clip = dt.getData('text/plain'); return 1; })()`);
	await p.sleep(200);
	t.eq(await p.ev(`window.__qa5clip`), ' swiped words', 'a cut takes the selection');
	await tapText(p, PROLOGUE, 'surprised.', 10);
	t.eq((await caret(p))?.path, PROLOGUE, 'a tap in another section moves the caret there');
	await p.ev(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', window.__qa5clip + '\\n\\nA pasted paragraph.'); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return 1; })()`);
	await p.sleep(300);
	await saveAll(p);
	sameBut(t, before, snap(p), {
		[STORM]: fm(before[STORM]) + 'New text.',
		[KEEPER]: KEPT(before, ' the receive'),
		[PROLOGUE]: before[PROLOGUE].replace('surprised.', 'surprised. swiped words\n\nA pasted paragraph.'),
	});
}));

// =====================================================================================================================
// Reading: swiping with the caret in a section
// =====================================================================================================================

test('phone: swiped far from the caret and back, the caret never comes back by itself; nothing takes the focus while reading; what’s in sight holds still as sections turn into editors; a tap then puts the caret where it’s tapped', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', long(14, 6));
	const before = snap(p);
	await openMs(p, 'Novel');
	await tapText(p, N(1), 'Scene 1 paragraph 2.', 20);
	await p.type(' typed');
	t.ok(await p.ev(`(() => { const b = document.querySelector('.mobile-toolbar')?.getBoundingClientRect(); return !!b && b.height > 0; })()`), 'with the caret in a section, Obsidian’s editing toolbar shows');
	// every focus taken from here on is counted
	await p.ev(`(() => { window.__qa5f = []; window.__qa5fl = (e) => window.__qa5f.push((e.target.className || e.target.tagName).toString().split(' ')[0]); document.addEventListener('focusin', window.__qa5fl, true); return 1; })()`);
	const moved = [];
	for (let i = 0; i < 12; i++) {
		await swipe(p, 200, 640, 200, 180, 6, 50);
		// once the fling has stopped: what's in the middle of the screen holds still while the page settles around it
		const d = await p.ev(`(async () => { const m = ${M}, root = m.root; let last = -1, same = 0; for (let k = 0; k < 200 && same < 3; k++) { await new Promise(r => setTimeout(r, 25)); if (root.scrollTop === last) same++; else { same = 0; last = root.scrollTop; } } const v = root.getBoundingClientRect(); const pick = () => [...root.querySelectorAll('.cm-line, .binders-manuscript-rendered p')].filter(e => e.textContent.length > 40); const e = pick().find(e => { const r = e.getBoundingClientRect(); return r.top > v.top + 200; }); if (!e) return null; const key = e.textContent.slice(0, 40), y = e.getBoundingClientRect().top, top = root.scrollTop; await new Promise(r => setTimeout(r, 1500)); const now = pick().find(x => x.textContent.slice(0, 40) === key); return now ? { d: Math.round(now.getBoundingClientRect().top - y), scrolled: root.scrollTop - top } : null; })()`);
		if (d) moved.push(d.d);
	}
	say('page moved while settling after each swipe (px):', moved);
	let s = await st(p);
	t.ok(s.top > 3000, 'the swipes scroll the page: ' + s.top);
	t.eq(s.active, 'body', 'far from its section, the caret is let go');
	t.ok(await p.ev(`(() => { const b = document.querySelector('.mobile-toolbar')?.getBoundingClientRect(); return !b || b.height === 0 || getComputedStyle(document.querySelector('.mobile-toolbar')).display === 'none'; })()`), 'and the editing toolbar goes');
	await p.sleep(2500);
	t.eq(disk(p, N(1)), before[N(1)].replace('paragraph 2.', 'paragraph 2. typed'), 'what was typed is on disk');
	t.ok(Math.max(...moved.map(Math.abs)) <= 2, `what’s in sight holds still as the page settles (moved by ${j(moved)} px after each swipe)`);
	// back up to the section
	// (not past the top: a pull down there is Obsidian's own gesture)
	for (let i = 0; i < 20 && (await scrollTop(p)) > 250; i++) await swipe(p, 200, 250, 200, 560, 6, 400);
	await p.sleep(2500);
	s = await st(p);
	t.ok(s.top < 300, 'swiped back to the top: ' + s.top);
	t.eq(s.active, 'body', 'the caret hasn’t come back by itself (no keyboard while reading)');
	const taken = await p.ev(`(() => { document.removeEventListener('focusin', window.__qa5fl, true); return window.__qa5f; })()`);
	t.eq(j(taken), '[]', 'and nothing took the focus at any moment while reading (each would flash the keyboard)');
	t.ok(s.live.length <= 7, 'at most six editors are alive, and the one with unsaved typing: ' + j(s.live));
	// a tap after all that
	await scrollTo(p, N(2), 'start');
	await tapText(p, N(2), 'Scene 2 paragraph 1.', 20);
	const c = await caret(p);
	t.eq(j([c?.path, c?.before.slice(-5)]), j([N(2), 'ph 1.']), 'a tap puts the caret where it’s tapped');
	await p.type(' again');
	await saveAll(p);
	sameBut(t, before, snap(p), { [N(1)]: before[N(1)].replace('paragraph 2.', 'paragraph 2. typed'), [N(2)]: before[N(2)].replace('paragraph 1.', 'paragraph 1. again') });
}));

test('tablet with a keyboard: keys go where the tap put the caret, ArrowDown walks into the next section, and after a swipe far away the next key brings the page back to the caret and lands there', on(TABLET, async (p, h, t) => {
	await binder(p, 'Novel', long(14, 6));
	const before = snap(p);
	await openMs(p, 'Novel');
	await tapEnd(p, N(1));
	await keys(p, ' abc', 15);
	await p.key('ArrowDown'); await p.key('ArrowDown');
	let c = await caret(p);
	t.eq(c?.path, N(2), 'ArrowDown past the end of a section goes into the next');
	await keys(p, 'Q', 15);
	await tapEnd(p, N(1));
	await keys(p, 'd', 15);
	for (let i = 0; i < 10; i++) await swipe(p, 400, 1000, 400, 200, 6, 120);
	await p.sleep(600);
	let s = await st(p);
	t.eq(j([s.active, s.left]), j(['body', N(1)]), 'swiped far away, the caret is left in its section');
	await keys(p, 'efg\nh', 40);
	await p.sleep(900);
	c = await caret(p);
	await shot(p, 'tablet-keys-after-far-swipe');
	t.eq(c?.path, N(1), 'the next keys go back to it');
	t.ok(seen(c), 'and the page comes back so the caret is in sight: ' + j(c));
	await saveAll(p);
	const two = before[N(2)].split('\n'), i = two.findIndex((l) => l.startsWith('Scene 2 paragraph 1.'));
	const after = snap(p);
	t.eq(after[N(1)], before[N(1)].replace(/\n$/, ' abcdefg\nh\n'), 'every key is in the first note, in order');
	t.eq(count(after[N(2)], 'Q'), 1, 'and the Q in the second, once');
	t.eq(after[N(2)].replace('Q', ''), before[N(2)], 'with nothing else changed there');
	for (const k of Object.keys(before)) if (![N(1), N(2)].includes(k)) t.eq(after[k], before[k], `“${k}” is unchanged`);
}));

/** Where a paragraph of a live section wraps: the start of its second line on screen, and the end of its first. */
const wrapOf = (p, path) => p.ev(`(() => { const cm = ${sc(path)}.live.cm, doc = cm.state.doc.toString(); const start = (/^---\\n[\\s\\S]*?\\n---\\n/.exec(doc)?.[0].length ?? 0); let prev = cm.coordsAtPos(start, 1); for (let i = start + 1; i < doc.length; i++) { const c = cm.coordsAtPos(i, 1); if (c && prev && c.top > prev.top + 5) { const e = cm.coordsAtPos(i - 1, -1); return { pos: i - start, x: c.left, y: (c.top + c.bottom) / 2, endX: e.right, endY: (e.top + e.bottom) / 2, text: doc.slice(i, i + 12) }; } prev = c ?? prev; } return null; })()`);

bug('phone: with the caret at the start of a wrapped line (or past the end of one), a tap in another section moves the caret there (it stays where it was, and what’s typed next goes into the first note; CodeMirror pulls the selection back into an editor that has just lost the focus)', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await tapText(p, PROLOGUE, 'forty', 0); // (a section is its editor once tapped)
	const w = await wrapOf(p, PROLOGUE);
	t.ok(w, 'the first paragraph wraps on a phone');
	const got = {};
	// the start of its second line on screen: where a thumb taps to go to "the start of the line"
	await tap(p, w.x + 1, w.y, 700);
	let c = await caret(p);
	t.eq(j([c?.path, c?.head]), j([PROLOGUE, w.pos]), 'a tap at the start of the second line puts the caret there');
	await tapText(p, KEEPER, 'tower', 0);
	c = await caret(p);
	got.start = c?.path;
	await p.type('z');
	await p.sleep(300);
	await saveAll(p);
	const after1 = snap(p);
	// past the end of its first line
	await p.ev(`document.activeElement.blur()`);
	await p.sleep(300);
	await tap(p, 360, w.endY, 700);
	c = await caret(p);
	say('past the end of the first line:', c);
	await tapText(p, STORM, 'keeper', 0);
	got.end = (await caret(p))?.path;
	// and a title can be tapped for renaming from there
	await p.ev(`document.activeElement.blur()`);
	await p.sleep(300);
	await tap(p, w.x + 1, w.y, 700);
	const ti = await titleAt(p, ARRIVAL);
	await tap(p, ti.x, ti.y, 700);
	got.title = await active(p);
	await p.key('Escape');
	await p.sleep(300);
	say(got);
	// (and swiped far away from there, the caret is let go like any other: no keyboard while reading)
	await binder(p, 'Novel', long(10, 6));
	await openMs(p, 'Novel');
	await tapText(p, N(1), 'Scene 1 paragraph 1.', 0);
	const w2 = await wrapOf(p, N(1));
	await tap(p, w2.x + 1, w2.y, 700);
	for (let i = 0; i < 9; i++) await swipe(p, 200, 640, 200, 180, 6, 150);
	await p.sleep(1200);
	got.far = (await st(p)).active;
	say(got);
	t.eq(got.far, 'body', 'swiped far from a caret at the start of a wrapped line, the section lets go of it');
	t.eq(after1[KEEPER], inBody(before[KEEPER], 'tower', 'ztower'), `after a tap in “The keeper”, what’s typed goes there (the caret was in ${got.start}; Prologue is now ${j(body(after1[PROLOGUE]))})`);
	t.eq(got.end, STORM, 'from past the end of a wrapped line, a tap in “Storm warning” moves the caret there');
	t.ok(/is-renaming/.test(got.title), 'and a tap on another section’s title starts renaming it: ' + got.title);
}));

// =====================================================================================================================
// Titles, their menu, and folder headings
// =====================================================================================================================

const renaming = (p) => p.ev(`(() => { const a = document.activeElement; if (!a.classList.contains('is-renaming')) return null; const r = a.getBoundingClientRect(), s = getSelection(), c = s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null; return { text: a.textContent, selected: s.toString(), box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], caret: c ? [Math.round(c.left), Math.round(c.right)] : null, inner: [innerWidth, innerHeight], hint: a.getAttribute('enterkeyhint'), spell: a.spellcheck, cap: a.getAttribute('autocapitalize') }; })()`);

test('small phone: a tap on a title renames it in place (after unsaved typing in its section), Enter renames the note and puts the caret in its text; a bad name and a clash stay to be put right; a tap elsewhere keeps the new name', on(SMALL, async (p, h, t, before) => {
	await openMs(p);
	await scrollTo(p, KEEPER, 'start');
	await typeInKeeper(p);
	let ti = await titleAt(p, KEEPER);
	await tap(p, ti.x, ti.y, 600);
	let r = await renaming(p);
	t.eq(j([r?.text, r?.selected]), j(['The keeper', 'The keeper']), 'a tap on a title selects it for renaming');
	await keyboard(p, SMALL, true);
	r = await renaming(p);
	await shot(p, 'title-renaming-320-keyboard');
	t.ok(r && r.box[1] >= 104 && r.box[3] <= r.inner[1], 'with the keyboard up, the title being typed is in sight: ' + j(r));
	await p.type('The old man');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/The old man.md')})`);
	await p.sleep(600);
	const NEW = L + 'Part One/The old man.md';
	let c = await caret(p);
	t.eq(c?.path, NEW, 'Enter renames the note and the caret goes into its text');
	await p.type('!');
	await keyboard(p, SMALL, false);
	// a name that can't be: said, and kept to be changed
	await scrollTo(p, ARRIVAL, 'start');
	ti = await titleAt(p, ARRIVAL);
	await tap(p, ti.x, ti.y, 600);
	await p.type('a/b');
	await p.key('Enter');
	await p.sleep(500);
	r = await renaming(p);
	t.eq(r?.text, 'a/b', 'a name with a slash stays in the title to be changed');
	t.ok((await notices(p)).some((n) => /can’t contain/.test(n)), 'with why: ' + j(await notices(p)));
	await p.ev(`document.execCommand('selectAll')`);
	await p.type('Storm warning');
	await p.key('Enter');
	await p.sleep(500);
	r = await renaming(p);
	t.eq(r?.text, 'Storm warning', 'a name another note has stays too');
	// a tap on another section's text: the name typed is kept, the caret goes where it was tapped
	await p.ev(`document.execCommand('selectAll')`);
	await p.type('Landing');
	await tapText(p, NEW, 'He met', 3, 900);
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Landing.md')})`);
	c = await caret(p);
	t.eq(j([c?.path, c?.before.slice(-3)]), j([NEW, 'He ']), 'a tap in another section’s text commits the name and puts the caret there');
	await saveAll(p);
	const after = snap(p);
	sameBut(t, before, after, {
		[KEEPER]: null, [NEW]: KEPT(before, ' XYZ!'),
		[ARRIVAL]: null, [L + 'Part One/Landing.md']: before[ARRIVAL],
		[NOTE]: before[NOTE].replace('  - Part One/Arrival\n  - Part One/The keeper\n', '  - Part One/Landing\n  - Part One/The old man\n'),
	});
}));

bug('small phone: typing a long name into a title doesn’t push the page sideways (the title grows past the screen’s edge and the whole page scrolls left with the caret: the text’s first letters are cut off until the rename ends)', on(SMALL, async (p, h, t) => {
	await openMs(p);
	const ti = await titleAt(p, PROLOGUE);
	await tap(p, ti.x, ti.y, 600);
	await p.type('The night the light went out and nobody was surprised');
	await p.sleep(300);
	const r = await renaming(p);
	const during = await p.ev(`({ left: ${MAN}.scrollLeft, text: Math.round(${sc(PROLOGUE)}.bodyEl.getBoundingClientRect().left) })`);
	await shot(p, 'bug-title-long-320');
	await p.key('Enter');
	await p.sleep(900);
	const after = await p.ev(`({ left: ${MAN}.scrollLeft, text: Math.round(${M}.scenes[0].bodyEl.getBoundingClientRect().left), title: ${M}.scenes[0].titleEl.textContent })`);
	await shot(p, 'bug-title-long-320-after');
	say(r, during, after);
	t.eq(after.title, 'The night the light went out and nobody was surprised', 'the note is renamed');
	t.ok(r && r.caret && r.caret[1] <= r.inner[0], 'the caret is on the screen while typing the name');
	t.eq(j(during), j({ left: 0, text: 24 }), 'while the name is typed, the page hasn’t moved sideways (scrollLeft, and where its text starts)');
	t.eq(j([after.left, after.text]), j([0, 24]), 'nor after the rename');
}));

ux('phone: a title being renamed asks the keyboard for a “done” key and capital letters, as a note’s own title does', on(PHONE, async (p, h, t) => {
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(PROLOGUE)})).then(() => 1)`);
	await p.sleep(800);
	const native = await p.ev(`(() => { const e = document.querySelector('${LEAF} .inline-title'); return e ? { hint: e.getAttribute('enterkeyhint'), spell: e.getAttribute('spellcheck'), cap: e.getAttribute('autocapitalize'), ce: e.contentEditable } : null; })()`);
	say('a note’s inline title:', native);
	await openMs(p);
	const ti = await titleAt(p, PROLOGUE);
	await tap(p, ti.x, ti.y, 600);
	const r = await renaming(p);
	await p.key('Escape');
	await p.sleep(300);
	t.ok(r, 'the title is being renamed');
	t.eq(r.hint, native?.hint ?? 'done', `the title’s enterkeyhint is as a note’s (${j(native)}; ours ${j({ hint: r.hint, cap: r.cap })})`);
}));

test('phone: a title’s menu: its items; “New note after this” names a note and types in it; “Move up”; “Set target...”; “Put in a new folder” names the folder; “Delete” asks first', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await titleMenu(p, KEEPER);
	const items = await menuItems(p);
	await shot(p, 'title-menu');
	say('title menu:', items);
	t.ok(isSheet(await sheet(p)), 'the menu is a sheet');
	for (const x of ['Open', 'Open in new tab', 'Rename', 'Set synopsis from text', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in export', 'Move up', 'Move down', 'New note after this', 'Delete']) t.ok(items.includes(x), `“${x}” is in it`);
	t.ok(!items.includes('Open to the right') && !items.includes('Edit synopsis'), 'and nothing that can’t be done here');
	t.ok((await sheet(p)).itemHeights.every((x) => x >= 40), 'its rows are a finger tall');
	// New note after this
	t.ok(await menuTap(p, 'New note after this'), 'New note after this');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Untitled.md')})`);
	await p.sleep(700);
	let r = await renaming(p);
	await shot(p, 'title-new-note');
	t.eq(j([r?.text, r?.selected]), j(['Untitled', 'Untitled']), 'the new note’s title is ready to type over');
	t.eq(j((await titles(p)).slice(2, 6)), j(['Arrival', 'The keeper', 'Untitled', 'Storm warning']), 'right after the section it was asked from');
	await p.type('The stair');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/The stair.md')})`);
	await p.sleep(700);
	const STAIR = L + 'Part One/The stair.md';
	t.eq((await caret(p))?.path, STAIR, 'Enter: the caret is in the new note’s text');
	await p.type('One hundred steps.');
	// Move up
	await titleMenu(p, STAIR);
	t.ok(await menuTap(p, 'Move up'), 'Move up');
	await p.sleep(600);
	t.eq(j((await titles(p)).slice(2, 6)), j(['Arrival', 'The stair', 'The keeper', 'Storm warning']), 'the section moves up');
	// Set target...
	await titleMenu(p, STAIR);
	t.ok(await menuTap(p, 'Set target...'), 'Set target...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.sleep(400);
	t.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'the dialog’s field has the focus');
	await p.type('1200');
	await dialogTap(p, 'Set target');
	await p.sleep(400);
	// Put in a new folder
	await titleMenu(p, STAIR);
	t.ok(await menuTap(p, 'Put in a new folder'), 'Put in a new folder');
	await until(p, `app.vault.getAbstractFileByPath(${j(STAIR)}) === null`, 4000);
	await p.sleep(900);
	await shot(p, 'title-new-folder');
	r = await renaming(p);
	t.ok(r && r.selected === r.text && r.text.length > 0, 'the new folder’s heading is ready to type over: ' + j(r) + ' / ' + await active(p));
	await p.type('Interlude');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Interlude/The stair.md')})`, 4000);
	await p.sleep(600);
	const MOVED = L + 'Part One/Interlude/The stair.md';
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(MOVED)})`), 'Enter names the folder');
	t.ok((await titles(p)).includes('# Interlude'), 'which is a heading on the page: ' + j(await titles(p)));
	// Delete: asked first
	await titleMenu(p, EPILOGUE);
	t.ok(await menuTap(p, 'Delete'), 'Delete');
	await until(p, `!!document.querySelector('.modal .modal-button-container')`);
	await p.sleep(400);
	await shot(p, 'title-delete-confirm');
	t.eq(await p.ev(`document.querySelector('.modal .modal-title')?.textContent`), 'Delete note', 'it asks first');
	await dialogTap(p, 'Cancel');
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(EPILOGUE)})`), 'Cancel keeps the note');
	await titleMenu(p, EPILOGUE);
	await menuTap(p, 'Delete');
	await until(p, `!!document.querySelector('.modal .modal-button-container')`);
	await p.sleep(400);
	await dialogTap(p, 'Delete');
	await until(p, `app.vault.getAbstractFileByPath(${j(EPILOGUE)}) === null`, 4000);
	await p.sleep(600);
	t.ok(!(await titles(p)).includes('Epilogue'), 'Delete takes the section off the page');
	t.ok(!(await p.ev(`document.activeElement.isContentEditable || document.activeElement.matches('input, textarea')`)), 'and puts no caret anywhere (no keyboard): ' + await active(p));
	await saveAll(p);
	const after = snap(p);
	t.eq(body(after[MOVED]), 'One hundred steps.', 'the new note has what was typed');
	t.ok(/^target: 1200$/m.test(after[MOVED]), 'and its target: ' + after[MOVED]);
	t.ok(/- Part One\/Arrival\n  - Part One\/Interlude\/\n  - Part One\/Interlude\/The stair\n  - Part One\/The keeper\n  - Part One\/Storm warning\n/.test(after[NOTE]) && !/Epilogue/.test(after[NOTE]), 'the binder’s order has it all: ' + fm(after[NOTE]));
	for (const k of Object.keys(before)) if (![NOTE, EPILOGUE].includes(k)) t.eq(after[k], before[k], `“${k}” is unchanged`);
}));

test('phone: a folder’s heading: a tap goes into the folder, its menu renames it in place, and “Split scene at cursor” right after typing splits the section where the caret is', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	const H1 = `${LEAF} .binders-manuscript-heading h1`;
	const hd = await p.at(H1);
	await p.ev(`(() => { const e = document.querySelector(${j(H1)}), r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10, button: 0 })); return 1; })()`);
	await p.sleep(500);
	await shot(p, 'heading-menu');
	t.eq(j(await menuItems(p)), j(['Open', 'Open in new tab', 'Rename']), 'a heading’s menu (the folder has no note of its own)');
	t.ok(isSheet(await sheet(p)), 'a sheet');
	t.ok(await menuTap(p, 'Rename'), 'Rename');
	await p.sleep(500);
	const r = await renaming(p);
	t.eq(j([r?.text, r?.selected]), j(['Part One', 'Part One']), 'the heading is ready to type over');
	await shot(p, 'heading-renaming');
	await p.type('Book One');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Book One')})`, 4000);
	await p.sleep(700);
	t.ok((await titles(p)).includes('# Book One'), 'Enter renames the folder: ' + j(await titles(p)));
	const K2 = L + 'Book One/The keeper.md';
	// split right after typing
	await settle(p);
	await tapText(p, K2, 'and did', 0);
	await p.type('NEW ');
	await p.ev(`app.commands.executeCommandById('binders:split-scene')`);
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Book One/The keeper 2.md')})`, 5000);
	await p.sleep(900);
	await shot(p, 'split');
	t.eq(j((await titles(p)).slice(1, 6)), j(['# Book One', 'Arrival', 'The keeper', 'The keeper 2', 'Storm warning']), 'the section is split in two, in place');
	await saveAll(p);
	const after = snap(p);
	t.eq(body(after[K2]).trimEnd() + '|' + body(after[L + 'Book One/The keeper 2.md']).trimEnd(), 'He met her at the foot of the tower NEW|and did not move out of the doorway.', 'every word in one half or the other, once');
	// the heading: a tap goes in
	await p.ev(`document.activeElement.blur()`);
	const h2 = await p.at(H1);
	await tap(p, h2.l + 20, h2.y, 300);
	await until(p, `${VIEW}.folder?.path === ${j(L + 'Book One')}`);
	t.eq(await p.ev(`${VIEW}.folder?.path`), L + 'Book One', 'a tap on the heading goes into the folder');
	t.eq(after[PROLOGUE], before[PROLOGUE], 'other notes are unchanged');
}));

// =====================================================================================================================
// The toolbar and the folder's synopsis
// =====================================================================================================================

test('phone: “New” makes a note after the section with the caret, named in place; the word count follows the typing and opens the target dialog; the synopsis at the top of the page is typed in place; “More options” has the modes and Export', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	const count = () => p.ev(`document.querySelector('${LEAF} .binders-word-count').textContent`);
	t.eq(await count(), '106 words', 'the count');
	await typeInKeeper(p, ' two words');
	await until(p, `document.querySelector('${LEAF} .binders-word-count').textContent === '108 words'`, 3000);
	t.eq(await count(), '108 words', 'follows the typing, before it’s saved');
	// New: after the section the caret is in
	const add = await p.at(`${LEAF} .binders-new-button`);
	await tap(p, add.x, add.y, 400);
	t.eq(j(await menuItems(p)), j(['New note']), 'New: a note');
	t.ok(await menuTap(p, 'New note'), 'New note');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Untitled.md')})`);
	await p.sleep(700);
	t.eq(await p.ev(`document.activeElement.classList.contains('is-renaming') && getSelection().toString()`), 'Untitled', 'its title is ready to type over');
	t.eq(j((await titles(p)).slice(2, 6)), j(['Arrival', 'The keeper', 'Untitled', 'Storm warning']), 'after the section the caret was in');
	await p.type('Night watch');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Night watch.md')})`);
	await p.sleep(600);
	await p.type('First words');
	const WATCH = L + 'Part One/Night watch.md';
	t.eq((await caret(p))?.path, WATCH, 'Enter: typing goes into the new note');
	// the count's dialog
	const cnt = await p.at(`${LEAF} .binders-word-count`);
	await tap(p, cnt.x, cnt.y, 500);
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.sleep(400);
	t.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'a tap on the count asks for the target, its field focused');
	await p.type('200');
	await dialogTap(p, 'Set target');
	await until(p, `/\\/ 200/.test(document.querySelector('${LEAF} .binders-word-count').textContent)`, 3000);
	await shot(p, 'toolbar-target');
	t.eq(await count(), '110 / 200 words', 'the count shows the target');
	t.ok(await p.ev(`(() => { const b = document.querySelector('${LEAF} .binders-toolbar'); return b.scrollWidth <= b.clientWidth && [...b.children].every(e => e.getBoundingClientRect().right <= innerWidth); })()`), 'and the toolbar still fits');
	// the synopsis
	await p.ev(`(() => { ${MAN}.scrollTop = 0; return 1; })()`);
	await p.sleep(300);
	const syn = await p.at(`${LEAF} .binders-view-synopsis`);
	t.ok(syn && syn.t > 160, 'the folder’s synopsis is the page’s first line: ' + j(syn));
	await tap(p, syn.x, syn.y, 500);
	t.eq(await p.ev(`document.activeElement.tagName`), 'TEXTAREA', 'a tap on it edits it');
	t.eq(await p.ev(`getComputedStyle(document.activeElement).fontSize`), '16px', 'in text no smaller than 16 px (iOS zooms the page into a smaller field)');
	await p.type('A keeper, a storm, a wreck.');
	await shot(p, 'synopsis-editing');
	await tapText(p, PROLOGUE, 'forty', 0, 900);
	t.eq((await caret(p))?.path, PROLOGUE, 'a tap in the text saves it and puts the caret in the text');
	// More options
	const more = await p.at(`${LEAF} .view-actions .clickable-icon[aria-label="More options"]`);
	await tap(p, more.x, more.y, 500);
	const items = await menuItems(p);
	await shot(p, 'more-options');
	for (const x of ['Corkboard', 'Outliner', 'Manuscript', 'Export...', 'Open binder note']) t.ok(items.includes(x), `“${x}” is in More options: ${j(items)}`);
	await gone(p);
	await saveAll(p);
	const after = snap(p);
	t.ok(/^synopsis: A keeper, a storm, a wreck\.$/m.test(after[NOTE]) && /^target: 200$/m.test(after[NOTE]) && /- Part One\/The keeper\n  - Part One\/Night watch\n/.test(after[NOTE]), 'the binder note has the synopsis, the target and the new note: ' + fm(after[NOTE]));
	t.eq(body(after[NOTE]), body(before[NOTE]), 'and its text is as it was');
	sameBut(t, before, after, { [KEEPER]: KEPT(before, ' two words'), [WATCH]: 'First words', [NOTE]: after[NOTE] });
}));

test('phone: under a filter, typing in a section that passes; “New” under the filter makes a note after it that shows though it has no status, and can be named and typed in', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	const f = await p.at(`${LEAF} .binders-filter-button`);
	await tap(p, f.x, f.y, 400);
	t.ok(await menuTap(p, 'Draft'), 'Draft, in the filter');
	await p.sleep(600);
	await gone(p);
	await settle(p);
	await shot(p, 'filter-draft');
	t.eq(j(await titles(p)), j(['Prologue', '# Part One', 'The keeper', '# Part Two', 'The wreck']), 'only drafts show, under their folders');
	t.ok(/of 106 words/.test(await p.ev(`document.querySelector('${LEAF} .binders-word-count').textContent`)), 'the count says how many of how many');
	await typeInKeeper(p, ' FILTERED');
	// New under the filter
	const add = await p.at(`${LEAF} .binders-new-button`);
	await tap(p, add.x, add.y, 400);
	await menuTap(p, 'New note');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Untitled.md')})`);
	await p.sleep(700);
	t.ok((await titles(p)).includes('Untitled'), 'a note made under the filter shows: ' + j(await titles(p)));
	t.eq(await p.ev(`document.activeElement.classList.contains('is-renaming')`), true, 'with its title ready to type');
	await p.type('Made here');
	await p.key('Enter');
	await p.sleep(900);
	await p.type('Typed under a filter.');
	await p.sleep(300);
	await saveAll(p);
	const after = snap(p), MADE = L + 'Part One/Made here.md';
	say(Object.keys(after).filter((k) => !(k in before)), await titles(p), await active(p), await notices(p));
	t.eq(after[MADE], 'Typed under a filter.', 'the new note has its text');
	sameBut(t, before, after, { [KEEPER]: KEPT(before, ' FILTERED'), [MADE]: 'Typed under a filter.', [NOTE]: before[NOTE].replace('  - Part One/The keeper\n', '  - Part One/The keeper\n  - Part One/Made here\n') });
}));

bug('phone: with the caret at the start of a wrapped line, the toolbar’s dialog, a title and the synopsis can be typed in (what’s typed for them goes into the note instead)', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await tapText(p, PROLOGUE, 'forty', 0); // (a section is its editor once tapped)
	const w = await wrapOf(p, PROLOGUE);
	await tap(p, w.x + 1, w.y, 700);
	const cnt = await p.at(`${LEAF} .binders-word-count`);
	await tap(p, cnt.x, cnt.y, 500);
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	await p.sleep(500);
	const inDialog = await p.ev(`document.activeElement.tagName`);
	await p.type('500');
	await p.sleep(300);
	const field = await p.ev(`document.querySelector('.modal .binders-ask input').value`);
	await shot(p, 'bug-wrap-caret-dialog');
	await p.ev(`(() => { document.querySelectorAll('.modal-close-button, .modal .modal-header-button').forEach(b => b.click()); return 1; })()`);
	await p.key('Escape');
	await p.sleep(400);
	await saveAll(p);
	const after = snap(p);
	say({ inDialog, field, prologue: body(after[PROLOGUE]) });
	t.eq(field, '500', `the target typed is in the dialog’s field (the focus was on ${inDialog})`);
	sameBut(t, before, after, {});
}));

ux('phone: a task list (4 px taller rendered), and at 320 px a quote (a whole line taller: it wraps once more rendered), are as tall rendered as in their editor, so the page doesn’t move when the section turns live', on(PHONE, async (p, h, t) => {
	await binder(p, 'Mixed', { Tasks: '- [ ] Trim the lamp\n- [x] Wind the clock\n- [ ] Write the log\n', Quote: '> A quote that goes on long enough to wrap on a phone, as quotes do.\n', Nested: '1. One\n2. Two\n   - nested\n   - more\n', Heading: '# A heading\n\nText.\n', Rule: 'Above.\n\n---\n\nLast line.\n' });
	const got = {};
	for (const size of [PHONE, SMALL]) {
		await metrics(p, ...size);
		await p.sleep(500);
		await openMs(p, 'Mixed');
		const m = await measure(p);
		for (const n of ['Tasks', 'Quote', 'Nested', 'Heading', 'Rule']) got[`${n} at ${size[0]}`] = [m[n].rendered, m[n].live];
	}
	say(got);
	const off = Object.entries(got).filter(([, v]) => v[0] !== v[1]);
	t.eq(j(off), '[]', 'sections whose height differs, [rendered, live] px');
}));

// =====================================================================================================================
// Reading: what a note can hold
// =====================================================================================================================

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const MIXED = {
	Para: 'A long paragraph. ' + 'The sea kept on at the rocks below and nobody came up the stair that night or the next. '.repeat(6).trim() + '\n',
	Table: 'Before the table.\n\n| Day | Weather at the light | Ships seen from the gallery | Notes kept by the keeper |\n| --- | --- | --- | --- |\n| Monday | Fog from the south-west | Two trawlers and a collier | Nothing to report at all |\n| Tuesday | Clear | None | Lamp trimmed |\n\nAfter the table.\n',
	Code: 'Before the code.\n\n```js\nconst light = keeper.climb(stairs).then((lamp) => lamp.trim()).then((lamp) => lamp.light()).catch(() => console.log("dark"));\n```\n\nAfter the code.\n',
	Callout: '> [!note] A note\n> The callout’s text, long enough to wrap on a phone’s screen at least once or twice.\n\nAfter the callout.\n',
	Tasks: '- [ ] Trim the lamp\n- [x] Wind the clock\n- [ ] Write the log\n',
	Links: 'See [[Para]] and [the site](https://example.com) and #tag.\n',
	Image: 'Before the image.\n\n![[pixel.png|300x150]]\n\nAfter the image.\n',
	Embed: 'Before the embed.\n\n![[Tasks]]\n\nAfter the embed.\n',
	RTL: 'هذه فقرة عربية طويلة بما يكفي لتلتف على شاشة الهاتف مرة واحدة على الأقل.\n\nשלום עולם, זו פסקה בעברית.\n\nThen English again.\n',
	Lists: '# A heading\n\n1. One\n2. Two\n   - nested\n   - more\n\n> A quote that goes on long enough to wrap on a phone, as quotes do.\n\n---\n\nLast line.\n',
	Empty: '',
};
const X = (n) => `Mixed/${n}.md`;
const mixed = async (p) => {
	await binder(p, 'Mixed', MIXED);
	await p.ev(`app.vault.adapter.writeBinary('Mixed/pixel.png', Uint8Array.from(atob(${j(PNG)}), c => c.charCodeAt(0)).buffer).then(() => 1)`);
	await p.sleep(700);
};
/** Every section's height as plain text and as an editor, and what sticks out of the page or scrolls sideways. */
const measure = (p) => p.ev(`(async () => { const m = ${M}, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {};
	const look = (s) => ({ h: Math.round(s.bodyEl.getBoundingClientRect().height), right: Math.round(Math.max(0, ...[...s.bodyEl.querySelectorAll('*')].filter(e => e.getClientRects().length && !e.closest('.metadata-container')).map(e => e.getBoundingClientRect().right))), scrolls: [...s.bodyEl.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX)).map(e => e.tagName.toLowerCase() + '.' + e.className.toString().split(' ')[0]) });
	for (const s of m.scenes) {
		s.el.scrollIntoView({ block: 'center' }); await wait(150);
		m.editable = false; if (s.live) m.unmount(s); for (let i = 0; i < 40 && s.shown === null; i++) await wait(50); await wait(250);
		const r = look(s);
		m.editable = true; await m.mount(s); await wait(600);
		const l = look(s);
		out[s.file.basename] = { rendered: r.h, live: l.h, right: [r.right, l.right], scrolls: [r.scrolls, l.scrolls] };
	}
	out.page = { wide: m.root.scrollWidth - m.root.clientWidth, left: m.root.scrollLeft, inner: innerWidth };
	return out; })()`);

test('phone, 390 and 320 px: paragraphs, callouts, lists, quotes, rules, links, embeds and right-to-left text are as tall rendered as in their editor (nothing moves when a section turns live); nothing but a table is wider than the page', on(PHONE, async (p, h, t) => {
	await mixed(p);
	for (const size of [PHONE, SMALL]) {
		await metrics(p, ...size);
		await p.sleep(500);
		await openMs(p, 'Mixed');
		await p.sleep(600);
		const m = await measure(p);
		say(size[0], m);
		for (const n of ['Para', 'Callout', 'Links', 'Embed', 'RTL', 'Empty'].concat(size === PHONE ? ['Lists'] : [])) {
			t.ok(Math.abs(m[n].rendered - m[n].live) <= 1, `${size[0]} px, ${n}: ${m[n].rendered} px rendered, ${m[n].live} px in its editor`);
			t.ok(m[n].right[0] <= size[0] && m[n].right[1] <= size[0], `${size[0]} px, ${n}: nothing is wider than the screen (${j(m[n].right)})`);
		}
		t.ok(m.Code.right[0] <= size[0] && m.Code.right[1] <= size[0], `${size[0]} px: a code block’s long line wraps (${j(m.Code.right)})`);
		t.ok(m.Image.right[0] <= size[0] && m.Image.right[1] <= size[0], `${size[0]} px: an image wider than the page is fitted to it (${j(m.Image.right)})`);
	}
	// right-to-left paragraphs start from the right, rendered and live
	await metrics(p, ...PHONE);
	await p.sleep(400);
	await scrollTo(p, X('RTL'), 'center');
	const rtl = await p.ev(`(async () => { await ${M}.mount(${sc(X('RTL'))}); await new Promise(r => setTimeout(r, 300)); const l = ${sc(X('RTL'))}.bodyEl.querySelector('.cm-content > .cm-line'); const r = document.createRange(); r.selectNodeContents(l); const b = r.getClientRects()[0], box = l.getBoundingClientRect(); return { dir: getComputedStyle(l).direction, gapRight: Math.round(box.right - b.right), gapLeft: Math.round(b.left - box.left) }; })()`);
	await shot(p, 'reading-rtl');
	t.ok(rtl.dir === 'rtl' && rtl.gapRight <= 2, 'an Arabic paragraph reads from the right in its editor: ' + j(rtl));
}));

test('small phone: a table wider than the screen scrolls inside itself by a swipe, and the page never goes sideways', on(SMALL, async (p, h, t, before) => {
	await mixed(p);
	const b0 = snap(p);
	await openMs(p, 'Mixed');
	await scrollTo(p, X('Table'), 'center');
	await p.sleep(600);
	const look = () => p.ev(`(() => { const m = ${M}, s = ${sc(X('Table'))}, w = s.bodyEl.querySelector('.cm-table-widget, table'), sc = s.bodyEl.querySelector('.cm-scroller'); const r = w.getBoundingClientRect(); return { page: [m.root.scrollWidth, m.root.clientWidth, m.root.scrollLeft], table: [Math.round(r.left), Math.round(r.right)], inner: innerWidth, tableScrolls: w.scrollWidth - w.clientWidth, tableLeft: w.scrollLeft, editorScrolls: sc ? sc.scrollWidth - sc.clientWidth : null, editorLeft: sc?.scrollLeft ?? null, live: !!s.live }; })()`);
	const at0 = await look();
	await shot(p, 'bug-table-320');
	// a swipe along the table
	const y = await p.ev(`(() => { const r = ${sc(X('Table'))}.bodyEl.querySelector('table').getBoundingClientRect(); return r.top + r.height / 2; })()`);
	await swipe(p, 280, y, 60, y, 8, 600);
	const swiped = await look();
	await shot(p, 'bug-table-320-swiped');
	// the caret put in the last cell
	const cell = await p.ev(`(() => { const tds = ${sc(X('Table'))}.bodyEl.querySelectorAll('td'); const c = tds[tds.length - 1]; c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = c.getBoundingClientRect(); return { x: Math.min(r.left + 10, innerWidth - 20), y: r.top + r.height / 2 }; })()`);
	await p.sleep(300);
	const scrolledTo = await look();
	say({ at0, swiped, scrolledTo, opened: await p.ev(`!app.workspace.rightSplit.collapsed`) });
	t.ok(!at0.live, 'the table’s section is plain text (a phone: nothing tapped)');
	t.ok(at0.page[0] <= at0.page[1], `the page is no wider than the screen (it is ${at0.page[0]} px in ${at0.page[1]})`);
	t.eq(swiped.page[2], 0, 'a swipe along the table doesn’t move the page sideways');
	t.ok(swiped.tableLeft > 0 || swiped.editorLeft > 0, 'it scrolls the table: ' + j(swiped));
	t.eq(scrolledTo.page[2], 0, 'bringing the last cell into view doesn’t move the page sideways: ' + j(scrolledTo.page));
	sameBut(t, b0, snap(p), {});
}));

test('phone: a task’s checkbox is ticked by a tap, a tap on a link opens its note (with what was typed just before saved), and Back returns to the same place', on(PHONE, async (p, h, t) => {
	await mixed(p);
	const before = snap(p);
	await openMs(p, 'Mixed');
	await scrollTo(p, X('Tasks'), 'center');
	const box = await p.ev(`(() => { const c = ${sc(X('Tasks'))}.bodyEl.querySelectorAll('input[type="checkbox"]')[0].getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2, w: c.width }; })()`);
	await tap(p, box.x, box.y, 700);
	await saveAll(p);
	t.eq(disk(p, X('Tasks')), before[X('Tasks')].replace('- [ ] Trim', '- [x] Trim'), 'a tap on a checkbox ticks the task in the note');
	await tapText(p, X('Tasks'), 'Write the log', 13);
	await p.type('book');
	const top = await scrollTop(p);
	const link = await textAt(p, X('Links'), 'Para', 2);
	await tap(p, link.x, link.y, 700);
	await until(p, `app.workspace.getActiveFile()?.path === ${j(X('Para'))}`, 3000);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), X('Para'), 'a tap on a link opens the note it points to');
	await p.sleep(300);
	t.eq(disk(p, X('Tasks')), before[X('Tasks')].replace('- [ ] Trim', '- [x] Trim').replace('Write the log', 'Write the logbook'), 'what was typed just before is on disk');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `!!document.querySelector('${LEAF} .binders-manuscript')`);
	await settle(p);
	await p.sleep(800);
	t.ok(Math.abs((await scrollTop(p)) - top) <= 30, `Back returns to the place the page was at (${top} → ${await scrollTop(p)})`);
	sameBut(t, before, snap(p), { [X('Tasks')]: before[X('Tasks')].replace('- [ ] Trim', '- [x] Trim').replace('Write the log', 'Write the logbook') });
}));

bug('tablet: in a section in sight that’s still plain text (more sections in sight than editors), a tap on a checkbox ticks the task in the note and a tap on a link opens it (the box looks ticked but the note isn’t changed; the link does nothing)', on(TABLET, async (p, h, t) => {
	await binder(p, 'Chores', Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`C${String(i + 1).padStart(2, '0')}`, `- [ ] Chore ${i + 1}, see [[C01]]\n`])));
	const before = snap(p);
	await openMs(p, 'Chores');
	await p.sleep(800);
	const plain = await p.ev(`(() => { const m = ${M}, v = m.root.getBoundingClientRect(); return m.scenes.filter(s => !s.live && s.shown !== null && s.bodyEl.getBoundingClientRect().top > v.top && s.bodyEl.getBoundingClientRect().bottom < v.bottom - 80).map(s => s.file.path); })()`);
	t.ok(plain.length > 0, 'some sections in sight are plain text: ' + j(plain));
	const path = plain[plain.length - 1];
	const box = await p.ev(`(() => { const c = ${sc(path)}.bodyEl.querySelector('input[type="checkbox"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: c.disabled }; })()`);
	t.ok(box, 'its checkbox shows');
	await tap(p, box.x, box.y, 900);
	const looks = await p.ev(`(() => { const c = ${sc(path)}.bodyEl.querySelector('input[type="checkbox"]'); return { checked: c?.checked ?? null, live: !!${sc(path)}.live }; })()`);
	await shot(p, 'bug-rendered-checkbox');
	await saveAll(p);
	await p.sleep(400);
	const ticked = disk(p, path);
	// a link in another plain section
	const other = plain[0] !== path ? plain[0] : null;
	let opened = null;
	if (other) {
		const link = await textAt(p, other, 'C01', 1);
		await tap(p, link.x, link.y, 900);
		opened = await p.ev(`app.workspace.getActiveFile()?.path ?? null`);
	}
	say({ plain, looks, ticked, opened });
	t.eq(ticked, before[path].replace('- [ ]', '- [x]'), `after a tap on the checkbox (which now shows ${looks.checked ? 'ticked' : 'unticked'}), the note has the task ticked`);
	if (other) t.eq(opened, 'Chores/C01.md', 'a tap on a link in a plain section opens the note');
}));

// =====================================================================================================================
// Other binders: empty, one empty note, read only, Longform, large
// =====================================================================================================================

test('phone: an empty binder says so and “New” starts its first note; a folder with one empty note takes a tap and typing; nothing else is written', on(PHONE, async (p, h, t) => {
	await binder(p, 'Blank', {});
	await binder(p, 'Single', { Only: '' });
	const before = snap(p);
	await openMs(p, 'Blank');
	await shot(p, 'empty-binder');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-manuscript .binders-empty-title')?.textContent ?? null`), 'No notes in this folder yet', 'an empty binder says so');
	t.ok(await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-manuscript .binders-empty').getBoundingClientRect(), n = document.querySelector('.mobile-navbar').getBoundingClientRect(); return e.bottom <= n.top && e.right <= innerWidth; })()`), 'above the navigation bar');
	const add = await p.at(`${LEAF} .binders-new-button`);
	await tap(p, add.x, add.y, 400);
	await menuTap(p, 'New note');
	await until(p, `!!app.vault.getAbstractFileByPath('Blank/Untitled.md')`);
	await p.sleep(700);
	t.eq(await p.ev(`document.activeElement.classList.contains('is-renaming')`), true, '“New” makes the first note, its title ready to type');
	await p.type('First');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath('Blank/First.md')`);
	await p.sleep(700);
	await p.type('Words in an empty binder.');
	t.eq((await caret(p))?.path, 'Blank/First.md', 'and typing goes into it');
	await saveAll(p);
	// one empty note
	await openMs(p, 'Single');
	await p.sleep(500);
	const b = await p.ev(`(${R})(${sc('Single/Only.md')}.bodyEl)`);
	t.ok(b[3] >= 20, 'an empty note has a line to tap: ' + j(b));
	await tap(p, b[0] + 60, b[1] + b[3] / 2, 800);
	t.eq((await caret(p))?.path, 'Single/Only.md', 'a tap on it puts the caret there');
	await p.type('No longer empty.');
	await p.key('Enter');
	await p.type('Two lines.');
	// and far below it, in the empty room
	await p.ev(`document.activeElement.blur()`);
	await tap(p, 200, 600, 800);
	t.eq(j([(await caret(p))?.path, (await caret(p))?.head]), j(['Single/Only.md', 27]), 'a tap in the room under it puts the caret at its end');
	await saveAll(p);
	const after = snap(p);
	t.eq(after['Blank/Blank.md'], '---\nbinder: 1\ncontents:\n  - First\n---\n', 'the binder lists its first note');
	sameBut(t, before, after, { 'Blank/First.md': 'Words in an empty binder.', 'Blank/Blank.md': after['Blank/Blank.md'], 'Single/Only.md': 'No longer empty.\nTwo lines.' });
}));

test('phone: a binder in a newer format is read only: it says so, a tap on its text or a title opens the note, nothing can be typed or renamed, and nothing is written', on(PHONE, async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/One.md', '---\\nstatus: draft\\n---\\nThe first note of a newer binder.\\n'); await app.vault.create('Future/Two.md', 'The second.\\n'); await app.vault.create('Future/Future.md', '---\\nbinder: 99\\ncontents:\\n  - One\\n  - Two\\n---\\n'); })().then(() => 1)`);
	await p.sleep(1200);
	const before = snap(p);
	await openMs(p, 'Future');
	await p.sleep(600);
	await shot(p, 'read-only');
	const said = await p.ev(`document.querySelector('${LEAF} .binders-notice')?.textContent ?? ''`);
	t.ok(/Read only/.test(said), 'it says it’s read only: ' + said);
	t.ok(await p.ev(`(() => { const n = document.querySelector('${LEAF} .binders-notice').getBoundingClientRect(); return n.right <= innerWidth && n.height > 0; })()`), 'in a notice that fits the screen');
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript .cm-editor').length`), 0, 'no section is an editor');
	t.ok(await p.ev(`document.querySelector('${LEAF} .binders-new-button').classList.contains('is-hidden')`), 'there’s no “New”');
	await titleMenu(p, 'Future/One.md');
	const items = await menuItems(p);
	t.ok(items.includes('Open') && !items.includes('Rename') && !items.includes('Delete') && !items.includes('Set status'), 'a title’s menu only opens: ' + j(items));
	await gone(p);
	const ti = await titleAt(p, 'Future/Two.md');
	await tap(p, ti.x, ti.y, 300);
	await until(p, `app.workspace.getActiveFile()?.path === 'Future/Two.md'`, 3000);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), 'Future/Two.md', 'a tap on a title opens the note');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `!!document.querySelector('${LEAF} .binders-manuscript')`);
	await settle(p);
	await tapText(p, 'Future/One.md', 'newer', 0, 300);
	await until(p, `app.workspace.getActiveFile()?.path === 'Future/One.md'`, 3000);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), 'Future/One.md', 'a tap on a section’s text opens its note');
	await p.sleep(400);
	sameBut(t, before, snap(p), {});
}));

test('phone: a Longform project as a manuscript: its scenes in Longform’s order, typing by touch, a title renamed in place; Longform’s list follows and nothing else in its note changes', on(PHONE, async (p, h, t, before) => {
	await openMs(p, 'Longform demo');
	await p.sleep(500);
	await shot(p, 'longform');
	t.eq(j(await titles(p)), j(['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return']), 'the scenes, in Longform’s order');
	await tapEnd(p, 'Longform demo/Return.md');
	await p.type(' Late.');
	await tapEnd(p, 'Longform demo/Harbor.md');
	await p.type(' Cold.');
	const ti = await titleAt(p, 'Longform demo/Island.md');
	await tap(p, ti.x, ti.y, 600);
	await p.type('The island');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath('Longform demo/The island.md')`);
	await p.sleep(700);
	await p.type('At last. ');
	await saveAll(p);
	const I = 'Longform demo/Index.md';
	sameBut(t, before, snap(p), {
		'Longform demo/Return.md': before['Longform demo/Return.md'].replace('back.', 'back. Late.'),
		'Longform demo/Harbor.md': before['Longform demo/Harbor.md'].replace('rope.', 'rope. Cold.'),
		'Longform demo/Island.md': null,
		'Longform demo/The island.md': before['Longform demo/Island.md'].replace('Nobody met', 'At last. Nobody met'),
		[I]: before[I].replace('    - Island\n', '    - The island\n'),
	});
}));

test('phone, CPU four times slower, 300 notes: swipes through the manuscript stay at 20 ms a frame, no editor is made by swiping, memory stays flat over three passes, and typing far down lands once', async (p, h, t) => {
	const PARTS = 6, PER = 50, out = {};
	await p.ev(`(async () => {
		const words = 'the keeper climbed the stair again while the sea kept on at the rocks below and nobody came '.repeat(12);
		await app.vault.createFolder('Saga');
		const contents = [];
		for (let a = 1; a <= ${PARTS}; a++) {
			const part = 'Part ' + String(a).padStart(2, '0');
			await app.vault.createFolder('Saga/' + part);
			contents.push(part + '/');
			for (let i = 1; i <= ${PER}; i++) { const n = (a - 1) * ${PER} + i, name = 'Scene ' + String(n).padStart(4, '0'); await app.vault.create('Saga/' + part + '/' + name + '.md', '---\\nstatus: draft\\n---\\nScene ' + n + '. ' + words + '\\n'); contents.push(part + '/' + name); }
		}
		await app.vault.create('Saga/Saga.md', '---\\nbinder: 1\\ncontents:\\n' + contents.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	const ready = `${B}.scenes(app.vault.getAbstractFileByPath('Saga') ?? app.vault.getRoot())?.length === ${PARTS * PER}`;
	t.ok(await until(p, ready, 60000), 'the big binder is made');
	const before = snap(p);
	await onDevice(p, PHONE, async () => {
		t.ok(await until(p, ready, 60000), 'and found again on the phone');
		await p.send('HeapProfiler.enable').catch(() => {});
		const heap = async () => { await p.send('HeapProfiler.collectGarbage').catch(() => {}); await p.sleep(200); return p.ev(`Math.round(performance.memory.usedJSHeapSize / 1048576)`); };
		await openView(p, 'Saga');
		const t0 = Date.now();
		await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
		await until(p, `!!document.querySelector('${LEAF} .binders-manuscript .binders-manuscript-rendered')`, 30000);
		out.opens = Date.now() - t0;
		await settle(p);
		await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		const frames = (ms) => p.ev(`(() => { const fr = window.__qa5fr = []; let last = performance.now(); const t0 = last; const f = () => { const n = performance.now(); fr.push(n - last); last = n; if (n - t0 < ${ms}) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
		const stats = () => p.ev(`(() => { const f = window.__qa5fr.slice(1).sort((a, b) => a - b); return { frames: f.length, median: Math.round(f[f.length >> 1]), p95: Math.round(f[Math.floor(f.length * 0.95)]), worst: Math.round(f[f.length - 1]) }; })()`);
		const alive = () => p.ev(`({ editors: document.querySelectorAll('${LEAF} .binders-manuscript .cm-editor').length, live: ${M}.scenes.filter(s => s.live).length, rendered: document.querySelectorAll('${LEAF} .binders-manuscript-rendered').length, nodes: document.querySelectorAll('${LEAF} .binders-manuscript *').length })`);
		out.heap = [await heap()];
		out.alive = [];
		for (let pass = 0; pass < 3; pass++) {
			await p.ev(`(() => { ${MAN}.scrollTop = ${pass} * 40000; return 1; })()`);
			await p.sleep(600);
			await frames(3200);
			for (let k = 0; k < 5; k++) { await touch(p, 'touchStart', 200, 650); for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', 200, 650 - i * 38); await p.sleep(16); } await touch(p, 'touchEnd'); await p.sleep(180); }
			await p.sleep(700);
			out['scroll' + pass] = await stats();
			await p.sleep(2600);
			out.alive.push(await alive());
			out.heap.push(await heap());
		}
		await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
		// typing, far down
		const line = await until(p, `[...document.querySelectorAll('${LEAF} .binders-manuscript .binders-manuscript-rendered > p')].map(e => e.getBoundingClientRect()).filter(r => r.top < 500 && r.bottom > 400).map(r => [r.left + 60, Math.max(r.top + 12, 300)])[0]`, 15000);
		t.ok(line, 'after the swipes, the sections in sight are drawn');
		await tap(p, line[0], line[1], 900);
		const c = await caret(p);
		t.ok(c, 'a tap puts the caret in one');
		await p.type('QA5 ');
		await shot(p, 'big-binder');
		await saveAll(p);
		const after = snap(p);
		const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
		t.eq(j(changed), j([c.path]), 'only the note typed in changed');
		t.eq(count(after[c.path], 'QA5 '), 1, 'with what was typed, once');
		t.eq(after[c.path].replace('QA5 ', ''), before[c.path], 'and nothing else');
	});
	console.log('    qa5 manuscript, 300 notes (CPU ×4 while swiping): ' + j(out));
	t.ok(out.opens < 6000, `the manuscript opens in ${out.opens} ms`);
	for (const k of ['scroll0', 'scroll1', 'scroll2']) t.ok(out[k].median <= 20 && out[k].p95 <= 60, `${k}: ${j(out[k])}`);
	t.ok(out.alive.every((a) => a.live === 0 && a.editors === 0), 'no editor is made by swiping: ' + j(out.alive));
	t.ok(out.heap[3] - out.heap[1] <= 25, 'memory after each pass (MB): ' + j(out.heap));
});

// =====================================================================================================================
// Looks: like a note, at every size
// =====================================================================================================================

/** How a line of text is set: in the manuscript, or in the note open in the active tab. */
const typeset = (p, sel) => p.ev(`(() => { const l = [...document.querySelectorAll(${j(sel)})].find(e => e.textContent.trim().length > 20 && e.getBoundingClientRect().height > 0); if (!l) return null; const s = getComputedStyle(l), r = l.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), font: s.fontSize, family: s.fontFamily.slice(0, 30), line: s.lineHeight, color: s.color, align: s.textAlign }; })()`);

test('phone, tablet, upright and on their sides, light or dark: a section’s text is set exactly as a note’s is (the same left edge, width, size, line height and color); with “Readable line length” off it’s as wide as a note is then; at 22 px text everything still fits', async (p, h, t) => {
	const got = {};
	await onDevice(p, PHONE, async () => {
		for (const size of [SMALL, PHONE, land(PHONE), TABLET, land(TABLET)]) {
			const name = size.join('x');
			await metrics(p, ...size);
			await p.sleep(600);
			for (const readable of [true, false]) {
				await p.ev(`(() => { app.vault.setConfig('readableLineLength', ${readable}); return 1; })()`);
				await p.sleep(300);
				await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(PROLOGUE)})).then(() => 1)`);
				await p.sleep(700);
				const note = await typeset(p, `${LEAF} .cm-content > .cm-line`);
				await openMs(p);
				await p.sleep(300);
				// (on a phone a section is plain text until it's tapped: that is what's read, and what's compared)
				const ours = await typeset(p, `${LEAF} .binders-manuscript :is(.cm-content > .cm-line, .binders-manuscript-rendered > p)`);
				got[`${name}${readable ? '' : ' wide'}`] = { note, ours };
				if (readable) await shot(p, `looks-${name}`);
				// (the emulated desktop draws a 12 px scrollbar beside the page; a device's lies over it)
				t.eq(j({ ...ours, width: 0 }), j({ ...note, width: 0 }), `${name}${readable ? '' : ', readable line length off'}: a line of the manuscript is set as a note’s`);
				t.ok(Math.abs(ours.width - note.width) <= 12, `${name}${readable ? '' : ', readable line length off'}: and as wide (${ours.width} px, a note’s ${note.width})`);
				t.ok(await p.ev(`(() => { const m = ${MAN}, b = document.querySelector('${LEAF} .binders-toolbar'); return m.scrollWidth <= m.clientWidth && b.scrollWidth <= b.clientWidth; })()`), `${name}: nothing sticks out sideways`);
			}
			await p.ev(`(() => { app.vault.setConfig('readableLineLength', true); return 1; })()`);
		}
		say(got);
		// large text
		await metrics(p, ...SMALL);
		await p.ev(`(() => { app.vault.setConfig('baseFontSize', 22); app.updateFontSize?.(); return 1; })()`);
		await p.sleep(900);
		await openMs(p);
		await p.sleep(500);
		await shot(p, 'looks-large-text-320');
		const big = await p.ev(`(() => { const m = ${MAN}, b = document.querySelector('${LEAF} .binders-toolbar'); return { text: getComputedStyle(m.querySelector('.cm-line, .binders-manuscript-rendered > p')).fontSize, title: parseFloat(getComputedStyle(m.querySelector('.binders-manuscript-title')).fontSize), heading: parseFloat(getComputedStyle(m.querySelector('.binders-manuscript-heading h1')).fontSize), wide: m.scrollWidth - m.clientWidth, bar: b.scrollWidth - b.clientWidth, out: [...m.querySelectorAll('.binders-manuscript-page *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length }; })()`);
		say('22 px:', big);
		t.eq(big.text, '22px', 'at 22 px the manuscript’s text grows with it');
		t.ok(big.wide <= 0 && big.bar <= 0 && big.out === 0, 'and nothing sticks out at 320 px: ' + j(big));
		t.ok(big.title >= 14, `the titles grow too (${big.title} px)`);
	});
});

test('tablet, upright and on its side: the page keeps a readable line; menus are popovers; with the keyboard up the caret typed at the end of the page stays in sight; the title’s menu has “Open to the right”, which opens the note beside the manuscript with what was typed', on(TABLET, async (p, h, t, before) => {
	t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
	for (const size of [TABLET, land(TABLET)]) {
		await metrics(p, ...size);
		await p.sleep(600);
		await openMs(p);
		await shot(p, `tablet-${size[0]}`);
		const page = await rect(p, `${LEAF} .binders-manuscript-page`);
		t.ok(page[2] <= 700 && page[0] > 20 && Math.abs(page[0] * 2 + page[2] - size[0]) <= 40, `${size[0]} px: the page is a readable line wide, in the middle: ${j(page)}`);
		await tapEnd(p, EPILOGUE);
		await keyboard(p, size, true);
		await p.type(size === TABLET ? ' Tall.' : ' Wide.');
		await p.key('Enter');
		await p.type('More.');
		await p.sleep(300);
		const c = await caret(p);
		await shot(p, `tablet-${size[0]}-keyboard`);
		t.ok(seen(c), `${size[0]} px, keyboard up: the caret is in sight: ${j(c)}`);
		await keyboard(p, size, false);
		await p.key('Backspace'); await p.key('Backspace'); await p.key('Backspace'); await p.key('Backspace'); await p.key('Backspace'); await p.key('Backspace');
		await p.ev(`document.activeElement.blur()`);
		await p.sleep(300);
	}
	await metrics(p, ...TABLET);
	await p.sleep(500);
	const b = await p.at(`${LEAF} .binders-mode-button`);
	await tap(p, b.x, b.y, 400);
	let s = await sheet(p);
	t.ok(s && !isSheet(s) && s.width < 400, 'the mode menu is a popover: ' + j(s));
	await gone(p);
	await scrollTo(p, KEEPER, 'center');
	await typeInKeeper(p, ' beside');
	await titleMenu(p, KEEPER);
	s = await sheet(p);
	await shot(p, 'tablet-title-menu');
	t.ok(s && !isSheet(s), 'a title’s menu is a popover');
	t.ok(await menuTap(p, 'Open to the right'), 'Open to the right');
	await until(p, `app.workspace.getLeavesOfType('markdown').length === 1`, 3000);
	await p.sleep(700);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`), KEPT(before, ' beside'), 'the note opens beside the manuscript with what was typed');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-split.mod-root .workspace-tabs').length`), 2, 'in a second pane');
	await saveAll(p);
	sameBut(t, before, snap(p), { [KEEPER]: KEPT(before, ' beside'), [EPILOGUE]: before[EPILOGUE].replace('now.', 'now. Tall. Wide.') });
}));

test('phone: Obsidian’s editing toolbar acts on the section with the caret: undo and redo, bold, a heading; “Split scene at cursor” is offered there; with reduced motion nothing in the page animates but the caret', on(PHONE, async (p, h, t, before) => {
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
	await openMs(p);
	await typeInKeeper(p, ' undone');
	await p.sleep(700);
	const bar = await p.ev(`(() => { const b = document.querySelector('.mobile-toolbar'); const r = b?.getBoundingClientRect(); return b ? { top: Math.round(r.top), h: Math.round(r.height), n: b.querySelectorAll('.mobile-toolbar-option').length } : null; })()`);
	t.ok(bar && bar.h > 0 && bar.n > 4, 'the editing toolbar shows: ' + j(bar));
	const undo = await p.at('.mobile-toolbar .mobile-toolbar-option');
	await tap(p, undo.x, undo.y, 400);
	const afterUndo = await p.ev(`${sc(KEEPER)}.live.editor.getValue()`);
	t.ok(afterUndo.length < KEPT(before, ' undone').length && afterUndo.startsWith(before[KEEPER].trimEnd()), 'its first button (Undo) takes back typing in this section: ' + j(body(afterUndo)));
	t.eq((await caret(p))?.path, KEEPER, 'and the caret stays in the section (the keyboard stays up)');
	for (let i = 0; i < 8; i++) await p.ev(`app.commands.executeCommandById('editor:undo')`);
	t.eq(await p.ev(`${sc(KEEPER)}.live.editor.getValue()`), before[KEEPER], 'undone to the start: the note as it was, its properties whole');
	await p.ev(`app.commands.executeCommandById('editor:redo')`);
	for (let i = 0; i < 8; i++) await p.ev(`app.commands.executeCommandById('editor:redo')`);
	t.eq(await p.ev(`${sc(KEEPER)}.live.editor.getValue()`), KEPT(before, ' undone'), 'Redo brings it back');
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, c = ed.getCursor(); ed.setSelection({ line: c.line, ch: c.ch - 6 }, c); return 1; })()`);
	await p.ev(`app.commands.executeCommandById('editor:toggle-bold')`);
	t.ok(await p.ev(`app.commands.listCommands().some(c => c.id === 'binders:split-scene') && !!app.commands.findCommand('binders:split-scene').editorCheckCallback(true, app.workspace.activeEditor.editor, app.workspace.activeEditor)`), '“Split scene at cursor” is offered with the caret in a section');
	const moving = await p.ev(`document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.closest?.('.binders-manuscript') && !a.effect.target.closest('.cm-cursorLayer, .cm-cursor')).map(a => a.effect.target.className + ':' + (a.animationName ?? a.transitionProperty))`);
	t.eq(j(moving), '[]', 'with reduced motion nothing in the page is animating');
	await saveAll(p);
	sameBut(t, before, snap(p), { [KEEPER]: KEPT(before, ' **undone**') });
}));

// =====================================================================================================================
// More of the feel of a note
// =====================================================================================================================

test('phone: at the end of the last section with the keyboard up, Enter after Enter keeps the caret in sight on the same line of the screen; a double tap selects a word, and what’s typed replaces it', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	for (let i = 0; i < 3; i++) await swipe(p, 200, 600, 200, 250, 8);
	await settle(p);
	await tapEnd(p, EPILOGUE);
	await keyboard(p, PHONE, true);
	const ys = [];
	for (let i = 0; i < 9; i++) { await p.key('Enter'); await p.type('line ' + i); await p.sleep(120); const c = await caret(p); t.ok(seen(c), `Enter ${i + 1}: the caret is in sight (${j(c && [c.top, c.bottom, c.toolbar])})`); ys.push(c.bottom); }
	await shot(p, 'end-of-last-section');
	const settled = ys.slice(-4);
	t.ok(Math.max(...settled) - Math.min(...settled) <= 2, 'once at the bottom, the caret stays on the same line of the screen as the page follows: ' + j(ys));
	await keyboard(p, PHONE, false);
	// a double tap on a word
	const w = await textAt(p, EPILOGUE, 'postcards', 4);
	await touch(p, 'touchStart', w.x, w.y); await touch(p, 'touchEnd'); await p.sleep(60); await touch(p, 'touchStart', w.x, w.y); await touch(p, 'touchEnd');
	await p.sleep(600);
	const sel = await p.ev(`getSelection().toString()`);
	t.eq(sel.trim(), 'postcards', 'a double tap selects the word');
	await p.type('pictures');
	await saveAll(p);
	sameBut(t, before, snap(p), { [EPILOGUE]: before[EPILOGUE].replace('postcards', sel === 'postcards ' ? 'pictures' : 'pictures').replace('pictures of', sel.endsWith(' ') ? 'picturesof' : 'pictures of').replace('now.\n', 'now.\n' + Array.from({ length: 9 }, (_, i) => 'line ' + i).join('\n') + '\n') });
}));

test('phone: turned on its side with the caret in a section and back, typing each time: the caret stays in its section and every key lands; to the corkboard and back, the page is where it was, with no caret', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', long(10, 6));
	const before = snap(p);
	await openMs(p, 'Novel');
	for (let i = 0; i < 4; i++) await swipe(p, 200, 640, 200, 180, 6, 400);
	await settle(p);
	const top = await scrollTop(p);
	const path = N(4), n = 4;
	await scrollTo(p, path, 'start');
	await tapText(p, path, `Scene ${n} paragraph 1.`, `Scene ${n} paragraph 1.`.length);
	await p.type(' up');
	await metrics(p, ...land(PHONE));
	await p.sleep(900);
	let c = await caret(p);
	await shot(p, 'rotated');
	t.eq(c?.path, path, 'on its side, the caret is still in its section');
	await p.type(' side');
	await p.sleep(300);
	c = await caret(p);
	t.ok(seen(c), 'and in sight after typing: ' + j(c));
	await metrics(p, ...PHONE);
	await p.sleep(900);
	await p.type(' back');
	await p.sleep(300);
	c = await caret(p);
	t.ok(seen(c), 'upright again, the caret is in sight after typing: ' + j(c));
	const where = () => p.ev(`(() => { const m = ${M}, v = m.root.getBoundingClientRect(); const e = [...m.root.querySelectorAll('.cm-line, .binders-manuscript-rendered p')].find(e => e.textContent.length > 40 && e.getBoundingClientRect().top > v.top + 60); return e ? [e.textContent.slice(0, 22), Math.round(e.getBoundingClientRect().top)] : null; })()`);
	await p.ev(`document.activeElement.blur()`);
	await p.sleep(400);
	const here = await where();
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(700);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await p.sleep(900);
	const now = await where();
	t.ok(now && now[0] === here[0] && Math.abs(now[1] - here[1]) <= 30, `back from the corkboard, the same text is at the same place on the screen (${j(here)} → ${j(now)})`);
	t.eq(await active(p), 'body', 'with no caret (no keyboard)');
	await saveAll(p);
	sameBut(t, before, snap(p), { [path]: before[path].replace('paragraph 1.', 'paragraph 1. up side back') });
}));

test('phone: a long press on a section’s title (the system’s `contextmenu` while the finger is down) opens its menu, and the finger coming up doesn’t also start renaming it', on(PHONE, async (p, h, t) => {
	await openMs(p);
	const ti = await titleAt(p, KEEPER);
	await touch(p, 'touchStart', ti.x, ti.y);
	await p.sleep(650);
	// (what a device sends while the finger is still down)
	await p.ev(`(() => { const e = ${titleOf(KEEPER)}; e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${ti.x}, clientY: ${ti.y}, button: 0 })); return 1; })()`);
	await p.sleep(250);
	await touch(p, 'touchEnd');
	await p.sleep(600);
	const got = { menu: await p.ev(`document.querySelectorAll('.menu').length`), renaming: await p.ev(`${titleOf(KEEPER)}.classList.contains('is-renaming')`), active: await active(p) };
	await shot(p, 'ux-title-long-press');
	await gone(p);
	await p.key('Escape');
	t.eq(j(got.menu > 0 && !got.renaming), 'true', 'after a long press: ' + j(got));
}));

ux('small phone: with the keyboard up there’s room for five lines of text (the header and Binders’ toolbar stay above the page, 163 px in all: at 320 × 568 the text is left 93 px, under four lines; a note’s text runs under its floating header)', on(SMALL, async (p, h, t) => {
	const room = {};
	for (const size of [SMALL, ANDROID, PHONE]) {
		const name = size.join('x');
		await metrics(p, ...size);
		await p.sleep(500);
		await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(PROLOGUE)})).then(() => 1)`);
		await p.sleep(700);
		await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setCursor(ed.lastLine(), 0); return 1; })()`);
		await p.sleep(500);
		await keyboard(p, size, true);
		// (in a note the text runs under the header's floating buttons: from the first line that isn't under one)
		const note = await p.ev(`(() => { const tb = document.querySelector('.mobile-toolbar').getBoundingClientRect(), h = document.querySelector('${LEAF} .view-header').getBoundingClientRect(); return Math.round(tb.top - h.bottom); })()`);
		await keyboard(p, size, false);
		await openMs(p);
		await scrollTo(p, KEEPER, 'start');
		await tapText(p, KEEPER, 'He met', 0);
		await keyboard(p, size, true);
		await p.type('x');
		await p.sleep(300);
		const ours = await p.ev(`(() => { const tb = document.querySelector('.mobile-toolbar').getBoundingClientRect(), m = ${MAN}.getBoundingClientRect(); return Math.round(tb.top - Math.max(m.top, document.querySelector('${LEAF} .view-header').getBoundingClientRect().bottom)); })()`);
		await shot(p, `ux-room-${name}`);
		await p.key('Backspace');
		await keyboard(p, size, false);
		await p.ev(`document.activeElement.blur()`);
		room[name] = { note, ours };
	}
	say('px of text between the header and the editing toolbar, keyboard up:', room);
	t.ok(Object.values(room).every((r) => r.ours >= Math.min(r.note, 120)), 'room for five lines of text at every size (px: a note’s, counted from the top of the screen since its header floats over the text; the manuscript’s): ' + j(room));
}));

test('phone: typing, then at once “Delete” from that section’s title menu: the note in the trash has every key (it can be restored whole), and nothing is written back', on(PHONE, async (p, h, t, before) => {
	const was = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	try {
		await openMs(p);
		await typeInKeeper(p, ' last words');
		await titleMenu(p, KEEPER);
		t.ok(await menuTap(p, 'Delete'), 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await p.sleep(300);
		await dialogTap(p, 'Delete');
		await until(p, `app.vault.getAbstractFileByPath(${j(KEEPER)}) === null`, 4000);
		await p.sleep(2600);
		const after = snap(p);
		t.ok(!(KEEPER in after), 'the note is gone, and isn’t written back by a late save');
		t.eq(disk(p, '.trash/The keeper.md'), KEPT(before, ' last words'), 'the note in the trash has everything that was typed');
		sameBut(t, before, after, { [KEEPER]: null, [NOTE]: before[NOTE].replace('  - Part One/The keeper\n', '') });
	} finally {
		await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(was ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`);
	}
}));

test('phone: a failed save refuses deletion; pending writing, an outside edit and undo are kept', on(PHONE, async (p, h, t, before) => {
	await openMs(p);
	await typeInKeeper(p, ' kept words');
	await p.ev(`(() => { const v = ${VIEW}; window.failedDeleteView = v; window.savedDeleteFlush = v.saveNotes; v.saveNotes = async () => { throw new Error('Test save failure'); }; return 1; })()`);
	try {
		await titleMenu(p, KEEPER);
		t.ok(await menuTap(p, 'Delete'), 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		await dialogTap(p, 'Delete');
		await p.sleep(400);
		t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(KEEPER)})`), 'the note stays when saving fails');
		t.ok((await notices(p)).some(n => /Nothing was deleted because saving failed/.test(n)), 'the writer is told that deletion was refused');
	} finally {
		await p.ev(`(() => { window.failedDeleteView.saveNotes = window.savedDeleteFlush; delete window.failedDeleteView; delete window.savedDeleteFlush; return 1; })()`);
	}
	await saveAll(p);
	const kept = KEPT(before, ' kept words');
	t.eq(disk(p, KEEPER), kept, 'all pending writing remains in the original note');
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${j(KEEPER)}), text => text + 'Outside words.\\n').then(() => 1)`);
	await p.sleep(700);
	await typeInKeeper(p, ' undo me');
	await p.sleep(600); await p.key('z', 'ctrl'); await saveAll(p);
	t.eq(disk(p, KEEPER), kept + 'Outside words.\n', 'undo keeps the original writing and the external edit');
}));
