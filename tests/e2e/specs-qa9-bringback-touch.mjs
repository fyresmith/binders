// QA round 9: "Bring back..." of a folder's or the binder's snapshot (BringBackModal, src/view/binder-snapshots.ts), by touch,
// on an emulated phone and tablet. Golden rule 2: every test that brings something back checks the files byte for byte.
//   QA9_SHOTS=<dir> saves a screenshot of the Bring back screen at each size.
import { B, PL, clickMenu, closeMenus, file, j, menuItems, openView, read, reload, texts, until, withTidy } from './view-helpers.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const specs = [];
const test = (name, fn, timeout = 400000) => specs.push({ name: (name.startsWith('BUG: ') ? 'BUG: qa9 bringback touch: ' + name.slice(5) : 'qa9 bringback touch: ' + name), timeout, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });
const sleep = (p, ms) => p.sleep(ms);
const L = 'The Lighthouse', P1 = L + '/Part One', P2 = L + '/Part Two';
const A = P1 + '/Arrival.md', K = P1 + '/The keeper.md', S = P1 + '/Storm warning.md', W = P2 + '/The wreck.md', E = L + '/Epilogue.md';
const SN = L + '/Snapshots';
const DLG = '.modal.binders-folder-snapshots';
const BACK = '.modal.binders-folder-snapshots-back';
const SHOTS = process.env.QA9_SHOTS || '';

// ---- helpers (copied from specs-binder-snapshots.mjs, which doesn't export its own) ----
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const tapOn = async (p, sel, text) => { const at = await until(p, `(() => { const e = [...document.querySelectorAll(${j(sel)})].filter(e => e.offsetParent && (${j(text)} === '' || e.textContent.trim().startsWith(${j(text)}))).pop(); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return r.width ? { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 } : null; })()`); if (!at) throw new Error(`nothing to tap: ${sel} “${text}”`); await tap(p, at.x, at.y); };
const swipe = async (p, x, y0, y1) => { await touch(p, 'touchStart', x, y0); for (let i = 1; i <= 10; i++) { await p.sleep(16); await touch(p, 'touchMove', x, y0 + ((y1 - y0) * i) / 10); } await touch(p, 'touchEnd'); await p.sleep(600); };
async function onMobile(p, [width, height], fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await theme();
	await p.sleep(200);
	let logged = [];
	try { await fn(); logged = p.errors.filter((e) => !/ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/.test(e)); } finally {
		await touch(p, 'touchCancel').catch(() => {});
		for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(300); }
		await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
		await theme();
	}
	if (logged.length) throw new Error('errors logged: ' + logged.slice(0, 3).join(' ; '));
}
async function closeAll(p) {
	for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`).catch(() => 0)); i++) { await p.key('Escape'); await sleep(p, 200); }
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
}
const list = (p, dir = SN) => p.ev(`app.vault.adapter.exists(${j(dir)}).then(ok => ok ? app.vault.adapter.list(${j(dir)}).then(l => l.files.map(f => f.slice(${dir.length + 1})).filter(f => f.endsWith('.binder-snapshot')).sort()) : [])`);
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent).join('|')`);
const bodyOf = (text) => text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const bytes = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = [...new Uint8Array(await app.vault.adapter.readBinary(f.path))].map(x => x.toString(16).padStart(2, '0')).join(''); return o; })()`);
const diff = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).map((k) => k + (a[k] == null ? ' (new)' : b[k] == null ? ' (gone)' : ' (' + a[k].length / 2 + '→' + b[k].length / 2 + ' bytes)'));
const contentsOf = (p) => p.ev(`(async () => (await app.vault.adapter.read(${j(L + '/' + L + '.md')})).split('\\ncontents:')[1].split('\\n---')[0])()`);
async function age(p, name, to) {
	const next = name.replace(/^\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d/, to);
	await p.ev(`app.vault.rename(${file(`${SN}/${name}`)}, ${j(`${SN}/${next}`)}).then(() => 1)`);
	await sleep(p, 150);
}
/** A snapshot of the binder on the desktop (by the API), named "Draft sent to Sam", then a month's work. `extra` runs between. */
async function seeded(p, { extra = '' } = {}) {
	await openView(p);
	if (extra) await p.ev(extra);
	await sleep(p, 300);
	await p.ev(`(async () => { ${PL}.snapshotsApi.take?.(${file(L)}); })().then(() => 1)`).catch(() => {});
	let files = await list(p);
	if (!files.length) {
		await p.ev(`(() => { app.commands.executeCommandById('binders:take-snapshots'); return 1; })()`);
		await until(p, `app.vault.adapter.exists(${j(SN)})`, 20000);
		await sleep(p, 800);
		files = await list(p);
	}
	await age(p, files[0], '2026-09-19 16.20.05 Draft sent to Sam');
}
async function work(p, more = '') {
	await p.ev(`(async () => {
		const store = ${B}, f = (x) => app.vault.getAbstractFileByPath(x);
		await app.vault.process(f(${j(A)}), (t) => t.replace('two cases and a letter she had not opened', 'one case and a letter she had read twice') + '\\nNobody had come down to meet her.\\n');
		await store.move(f(${j(S)}), f(${j(P2)}), 0);
		await store.move(f(${j(E)}), f(${j(L)}), 0);
		await app.fileManager.renameFile(f(${j(K)}), ${j(P1 + '/The old keeper.md')});
		await app.vault.process(f(${j(W)}), (t) => t + '\\nA line written since.\\n');
		${more}
		await new Promise(r => setTimeout(r, 400));
		await store.snapshotsSettle();
		await store.flush();
	})().then(() => 1)`);
	await sleep(p, 400);
}
const bytesWas = (p) => bytes(p);

/** The way in, by touch: the header ("More options" on a phone, the clock on a tablet), the list, a row, "Bring back...". */
async function wayIn(p, t, { take = false } = {}) {
	const phone = await p.ev(`document.body.classList.contains('is-phone')`);
	const open = async () => {
		if (phone) await tapOn(p, '.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="More options"]', '');
		else await tapOn(p, '.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="Snapshots"]', '');
		await sleep(p, 500);
	};
	await open();
	const items = await menuItems(p);
	t.ok(items.includes('Take a snapshot') && items.includes('Show snapshots...'), (phone ? 'More options' : 'the Snapshots button') + ' has both: ' + j(items));
	if (take) {
		const n0 = (await list(p)).length;
		await tapOn(p, '.menu .menu-item', 'Take a snapshot');
		await until(p, `document.querySelectorAll('.notice').length > 0`, 20000);
		await sleep(p, 500);
		t.eq((await list(p)).length, n0 + 1, 'a tap on “Take a snapshot” takes one');
		t.ok(/^Took a snapshot of “The Lighthouse”/.test(await notices(p)), 'and says so: ' + await notices(p));
		const nr = await p.ev(`(() => { const n = document.querySelector('.notice'); const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight, clip: n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1 }; })()`);
		t.ok(nr.l >= 0 && nr.r <= nr.vw && nr.t >= 0 && nr.b <= nr.vh && !nr.clip, 'the notice is on the screen and whole: ' + j(nr));
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
		await open();
	}
	await tapOn(p, '.menu .menu-item', 'Show snapshots...');
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-snapshots-item')})`, 10000);
	await sleep(p, 600);
	const row = await p.ev(`(() => { const r = document.querySelector(${j(DLG + ' .binders-snapshots-item')}).getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth }; })()`);
	t.ok(row.h >= 28 && row.w <= row.vw, 'a row of the list is a finger tall (' + Math.round(row.h) + ' px) and fits: ' + j(row));
}
async function toBack(p, name = 'Draft sent to Sam') {
	await tapOn(p, DLG + ' .binders-snapshots-item-name', name);
	await until(p, `!!document.querySelector(${j(DLG + ' .binders-folder-snapshots-tree')}) && !document.querySelector(${j(DLG + ' .binders-folder-snapshots-body > .binders-folder-snapshots-wait')})`, 20000);
	await sleep(p, 500);
	await tapOn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...');
	await until(p, `!!document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan ul')})`, 20000);
	await sleep(p, 500);
}
/** Everything about the Bring back screen that has a size. */
const measure = (p) => p.ev(`(() => {
	const m = document.querySelector(${j(BACK)}), vw = innerWidth, vh = innerHeight, vv = window.visualViewport;
	const mr = m.getBoundingClientRect(), c = m.querySelector('.modal-content');
	const scrollers = [m, c, m.querySelector('.modal-container') ].filter(Boolean);
	const sc = [m, c].find(e => e && e.scrollHeight > e.clientHeight + 1);
	const over = [...m.querySelectorAll('*')].filter(e => e.offsetParent && !e.closest('.modal-close-button')).map(e => [e, e.getBoundingClientRect()]).filter(([e, r]) => r.width && (r.right > mr.right + 1 || r.left < mr.left - 1)).map(([e, r]) => e.className + ':' + Math.round(r.left) + '-' + Math.round(r.right));
	const btns = [...m.querySelectorAll('.modal-button-container button')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
	const sel = m.querySelector('select'), sr = sel.getBoundingClientRect();
	const fit = [...m.querySelectorAll('.binders-folder-snapshots-plan li, .modal-content > p')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.slice(0, 40));
	const last = m.querySelector('.modal-button-container button:last-child');
	last.scrollIntoView({ block: 'nearest' });
	const lr = last.getBoundingClientRect();
	const h = m.querySelector('.modal-title').getBoundingClientRect();
	return { vw, vh, kb: vv ? Math.round(vh - vv.height) : 0, modal: { l: Math.round(mr.left), r: Math.round(mr.right), t: Math.round(mr.top), b: Math.round(mr.bottom) }, scrolls: !!sc, scrollH: sc ? sc.scrollHeight : 0, clientH: sc ? sc.clientHeight : 0, over, btns, select: { w: Math.round(sr.width), h: Math.round(sr.height) }, wrapFail: fit, lastReach: { top: Math.round(lr.top), bottom: Math.round(lr.bottom) }, titleFits: m.querySelector('.modal-title').scrollWidth <= m.querySelector('.modal-title').clientWidth + 1, title: m.querySelector('.modal-title').textContent, titleTop: Math.round(h.top), tx: m.querySelector('.modal-content').textContent.length };
})()`);
function judge(t, m, tag, { tall = 28, skipOver = false } = {}) {
	if (process.env.QA9_SAY) console.log('    ' + tag + ' ' + j({ vp: m.vw + 'x' + m.vh, modal: m.modal, scrolls: m.scrolls, sh: m.scrollH, ch: m.clientH, btns: m.btns.map((b) => b.t + ' ' + b.w + 'x' + b.h), select: m.select, last: m.lastReach }));
	t.ok(m.modal.l >= 0 && m.modal.r <= m.vw && m.modal.t >= 0, tag + ': the screen is inside the display: ' + j(m.modal) + ' of ' + m.vw + '×' + m.vh);
	t.ok(skipOver || m.over.length === 0, tag + ': nothing runs past the screen’s sides: ' + j(m.over.slice(0, 3)));
	t.ok(m.wrapFail.length === 0, tag + ': the lines wrap (none wider than its box): ' + j(m.wrapFail));
	t.ok(m.lastReach.bottom <= m.vh && m.lastReach.top >= 0, tag + ': scrolled to, the last button is on the display: ' + j(m.lastReach) + ' of ' + m.vh);
	t.ok(m.btns.length === 2 && m.btns.every((b) => b.h >= tall && b.w >= tall), tag + ': the buttons are a finger’s size (28 px at least, 44 near): ' + j(m.btns));
	t.ok(m.select.h >= tall, tag + ': the dropdown is ' + m.select.h + ' px tall (' + m.select.w + ' wide)');
}
async function shot(p, name) {
	if (!SHOTS) return;
	mkdirSync(SHOTS, { recursive: true });
	await p.shot(join(SHOTS, name + '.png'));
}
/** All three scopes by value (a native menu can't be driven here), measured each time. */
async function scopes(p, t, tag, tall) {
	for (const v of ['text', 'order', 'both']) {
		await p.ev(`(() => { const s = document.querySelector(${j(BACK + ' select')}); s.value = ${j(v)}; s.dispatchEvent(new Event('change')); return 1; })()`);
		await sleep(p, 300);
		judge(t, await measure(p), tag + ' / ' + v, { tall });
	}
}

// =====================================================================================================================

test('on a phone (390×844): More options, take a snapshot, the list, a tap on a row, “Bring back...”: the screen fits and every button reaches; then it brings text and order back byte for byte, and the notice is readable', async (p, h, t) => {
	await seeded(p);
	const then = await texts(p);
	await work(p);
	const mid = await bytes(p);
	await onMobile(p, [390, 844], async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		await openView(p);
		await wayIn(p, t, { take: true });
		await toBack(p);
		const m = await measure(p);
		await shot(p, 'phone-390x844');
		judge(t, m, 'phone', { tall: 28 });
		t.ok(m.btns.every((b) => b.h >= 40), 'phone: the buttons are near 44 px (a finger): ' + j(m.btns));
		t.ok(m.select.h >= 36, 'phone: the dropdown is near a finger tall: ' + m.select.h + ' px');
		t.eq(m.title, 'Bring back “Draft sent to Sam”', 'named for the snapshot');
		await scopes(p, t, 'phone', 28);
		// do it: both
		const before = await list(p);
		await tapOn(p, BACK + ' .modal-button-container button', 'Bring back');
		await until(p, `!document.querySelector(${j(BACK)}) && document.querySelectorAll('.notice').length > 0`, 30000);
		await sleep(p, 800);
		const say = await notices(p);
		t.ok(/^Brought back the text of \d+ notes? and the place of \d+ items? in the order from “Draft sent to Sam”/.test(say), 'the notice says what came back: ' + say);
		const nr = await p.ev(`(() => { const n = [...document.querySelectorAll('.notice')].pop(), r = n.getBoundingClientRect(); const b = document.querySelector(${j(DLG + ' .modal-setting-titlebar-actions')}), br = b ? b.getBoundingClientRect() : null; return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, clip: n.scrollHeight > n.clientHeight + 1, font: parseFloat(getComputedStyle(n).fontSize), over: br ? !(r.bottom < br.top || r.top > br.bottom || r.right < br.left || r.left > br.right) : false, pe: getComputedStyle(n).pointerEvents }; })()`);
		t.ok(nr.l >= 0 && nr.r <= nr.vw && nr.t >= 0 && nr.b <= nr.vh && !nr.clip && nr.font >= 12, 'the closing notice is whole and readable: ' + j(nr));
		t.ok(!nr.over || nr.pe === 'none', 'and it does not cover the dialog’s buttons (or lets a tap through): ' + j(nr));
		await shot(p, 'phone-after');
		// bytes
		const now = await bytes(p), nowT = await texts(p);
		const map = { [A]: A, [K]: P1 + '/The old keeper.md', [S]: P2 + '/Storm warning.md', [W]: W, [E]: E };
		for (const [was, is] of Object.entries(map)) t.eq(bodyOf(nowT[is]), bodyOf(then[was]), 'the text of ' + was + ' is as it was, byte for byte');
		const files = await list(p);
		t.ok(files.length >= before.length, 'the text it replaced is kept (the snapshot taken a moment ago holds it): ' + files.length);
		const lost = Object.entries(map).filter(([was]) => !bodyOf(then[was]).split(/\s+/).every((w) => nowT[map[was]].includes(w)));
		t.eq(lost.length, 0, 'no word of the snapshot is missing');
	});
});

test('on a phone, turned on its side (844×390): the Bring back screen fits, reaches, and the buttons are a finger’s size; Cancel changes nothing and takes no snapshot', async (p, h, t) => {
	await seeded(p);
	await work(p);
	let mid = await bytes(p), order = await contentsOf(p); const snaps = await list(p);
	await onMobile(p, [844, 390], async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		await openView(p);
		await sleep(p, 1500);
		mid = await bytes(p); order = await contentsOf(p);
		await wayIn(p, t);
		await toBack(p);
		const m = await measure(p);
		await shot(p, 'phone-844x390');
		judge(t, m, 'phone landscape', { tall: 28 });
		t.ok(m.modal.b <= m.vh + 1 || m.scrolls, 'phone landscape: the screen is shorter than the display or scrolls: ' + j({ modal: m.modal, scrolls: m.scrolls, vh: m.vh }));
		t.ok(m.btns.every((b) => b.h >= 40), 'phone landscape: the buttons are near 44 px: ' + j(m.btns));
		const ta = await p.ev(`(() => { const r = document.querySelector(${j(BACK + ' .modal-title')}).getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
		await swipe(p, ta.x, ta.y, ta.y + 250);
		t.eq(j(diff(mid, await bytes(p))), '[]', 'a swipe down on its title changes nothing (it ' + ((await p.ev(`!!document.querySelector(${j(BACK)})`)) ? 'stayed open' : 'closed') + ')');
		if (!(await p.ev(`!!document.querySelector(${j(BACK)})`))) { await tapOn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...'); await until(p, `!!document.querySelector(${j(BACK)})`, 10000); await sleep(p, 500); }
		await tapOn(p, BACK + ' .modal-button-container button', 'Cancel');
		await sleep(p, 500);
		t.ok(!(await p.ev(`!!document.querySelector(${j(BACK)})`)), 'Cancel closes it');
		t.eq(j(diff(mid, await bytes(p))), '[]', 'and no note changed, byte for byte');
		t.eq(j(await list(p)), j(snaps), 'and no snapshot was taken');
		t.eq(await contentsOf(p), order, 'and the order is as it was');
		// the back-drop
		await tapOn(p, DLG + ' .modal-setting-titlebar-actions button', 'Bring back...');
		await until(p, `!!document.querySelector(${j(BACK)})`, 10000);
		await sleep(p, 500);
		await tap(p, 4, 4);
		await sleep(p, 500);
		t.ok(!(await p.ev(`!!document.querySelector(${j(BACK)})`)), 'a tap outside it dismisses it');
		t.eq(j(diff(mid, await bytes(p))), '[]', 'and nothing changed');
		t.eq(j(await list(p)), j(snaps), 'and no snapshot was taken');
	});
});

for (const [name, size] of [['portrait', [820, 1180]], ['on its side', [1180, 820]]]) {
	test(`on a tablet (${size.join('×')}, ${name}): the way in by the clock, and the Bring back screen fits, reaches and has finger-sized buttons; swiping it down or Cancel changes nothing`, async (p, h, t) => {
		await seeded(p);
		await work(p);
		let mid = await bytes(p); const snaps = await list(p);
		await onMobile(p, size, async () => {
			t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
			await openView(p);
			await sleep(p, 1500);
			mid = await bytes(p);
			await wayIn(p, t);
			await toBack(p);
			const m = await measure(p);
			await shot(p, 'tablet-' + size.join('x'));
			judge(t, m, 'tablet ' + name, { tall: 28 });
			t.ok(m.btns.every((b) => b.h >= 36), 'tablet: the buttons are near a finger: ' + j(m.btns));
			await scopes(p, t, 'tablet ' + name, 28);
			// swipe the screen down from its title
			const at = await p.ev(`(() => { const r = document.querySelector(${j(BACK + ' .modal-title')}).getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; })()`);
			await swipe(p, at.x, at.y, at.y + 500);
			const swiped = !(await p.ev(`!!document.querySelector(${j(BACK)})`));
			t.eq(j(diff(mid, await bytes(p))), '[]', 'after a swipe down on its title: nothing changed (it ' + (swiped ? 'closed' : 'stayed open') + ')');
			if (!swiped) { await tapOn(p, BACK + ' .modal-button-container button', 'Cancel'); await sleep(p, 400); }
			t.eq(j(await list(p)), j(snaps), 'and no snapshot was taken');
			t.ok(!(await p.ev(`!!document.querySelector(${j(BACK)})`)), 'and the screen is gone after Cancel');
		});
	});
}

test('on a phone, with a long note name and 40 notes changed: the lists wrap and stay on the screen; everything comes back byte for byte', async (p, h, t) => {
	const LONG = 'Supercalifragilisticexpialidocious'.repeat(2) + ' and a long name for a chapter that goes on and on';
	const make40 = `(async () => { const store = ${B}, f = (x) => app.vault.getAbstractFileByPath(x); for (let i = 0; i < 40; i++) await store.newScene(f(${j(P2)}), 99, (i < 3 ? ${j(LONG)} + ' ' : 'Extra ') + i, undefined, 'Original text of extra ' + i + '.\\n'); await new Promise(r => setTimeout(r, 800)); await store.snapshotsSettle(); await store.flush(); })().then(() => 1)`;
	await seeded(p, { extra: make40 });
	const then = await texts(p);
	await work(p, `for (const x of app.vault.getMarkdownFiles().filter(x => x.path.startsWith(${j(P2 + '/')}) && /(Extra|Supercali)/.test(x.path))) await app.vault.process(x, (t) => t.replace('Original', 'REWRITTEN') + 'More words since.\\n');`);
	const nowT0 = await texts(p);
	const changed = Object.keys(nowT0).filter((k) => /Extra|Supercali/.test(k) && nowT0[k] !== then[k]).length;
	t.ok(changed >= 40, 'set up: ' + changed + ' notes changed');
	await onMobile(p, [390, 844], async () => {
		await openView(p);
		await wayIn(p, t);
		await toBack(p);
		const m = await measure(p);
		await shot(p, 'phone-long');
		judge(t, m, 'long', { tall: 28, skipOver: true });
		const text = await p.ev(`document.querySelector(${j(BACK + ' .binders-folder-snapshots-plan')}).textContent`);
		t.ok(/4\d notes get the text they had/.test(text) && /and \d+ more/.test(text), 'it counts them and says “and N more”: ' + text.slice(0, 200));
		await tapOn(p, BACK + ' .modal-button-container button', 'Bring back');
		await until(p, `!document.querySelector(${j(BACK)})`, 60000);
		await sleep(p, 1500);
		const say = await notices(p);
		t.ok(/^Brought back the text of \d+ notes/.test(say), 'done: ' + say.slice(0, 200));
		const nowT = await texts(p);
		const bad = Object.keys(then).filter((k) => /Extra|Supercali/.test(k) && nowT[k] != null && bodyOf(nowT[k]) !== bodyOf(then[k]));
		t.eq(bad.length, 0, 'every changed note has its text again, byte for byte: ' + j(bad.slice(0, 3)));
		const nr = await p.ev(`(() => { const n = [...document.querySelectorAll('.notice')].pop(), r = n ? n.getBoundingClientRect() : null; return r ? { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, clip: n.scrollHeight > n.clientHeight + 1 } : null; })()`);
		t.ok(!nr || (nr.l >= 0 && nr.r <= nr.vw && nr.b <= nr.vh && !nr.clip), 'the long closing notice is whole on the screen: ' + j(nr));
	});
}, 600000);

test('a look at the Bring back screen on a phone, in both themes (screenshot in QA9_SHOTS)', async (p, h, t) => {
	await seeded(p);
	await work(p);
	await onMobile(p, [390, 844], async () => {
		await openView(p);
		await wayIn(p, t);
		await toBack(p);
		const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
		await shot(p, 'look-phone-' + (dark ? 'dark' : 'light'));
		const m = await measure(p);
		judge(t, m, 'look', { tall: 28 });
		const colours = await p.ev(`(() => { const m = document.querySelector(${j(BACK)}); const c = (e) => getComputedStyle(e).color; return { text: c(m.querySelector('.binders-folder-snapshots-plan li span')), bg: getComputedStyle(m).backgroundColor }; })()`);
		t.ok(colours.text !== colours.bg, 'text and ground differ: ' + j(colours));
		if (!SHOTS) await p.shot(`/tmp/claude-1000/-home-calebsmith-Projects-binder/97b4391d-ac90-485a-acbe-1f3e694ce62b/scratchpad/s/look-${dark ? 'dark' : 'light'}.png`);
	});
});

test('BUG: a long unbroken note name in the Bring back list runs off the right edge of the screen on a phone (clipped, with a sideways scroll)', async (p, h, t) => {
	const LONG = 'Supercalifragilisticexpialidocious'.repeat(2);
	await seeded(p, { extra: `(async () => { const store = ${B}, f = (x) => app.vault.getAbstractFileByPath(x); await store.newScene(f(${j(P1)}), 0, ${j(LONG)}, undefined, 'Original text.\\n'); await new Promise(r => setTimeout(r, 800)); await store.snapshotsSettle(); await store.flush(); })().then(() => 1)` });
	await work(p, `await app.vault.process(app.vault.getAbstractFileByPath(${j(P1 + '/' + LONG + '.md')}), (t) => t.replace('Original', 'REWRITTEN'));`);
	await onMobile(p, [390, 844], async () => {
		await openView(p);
		await wayIn(p, t);
		await toBack(p);
		const m = await measure(p);
		t.ok(m.over.length === 0, 'nothing in the plan runs past the screen’s right edge (390 px): ' + j(m.over));
	});
});

test('BUG: on a phone on its side (844×390) the Bring back screen shows only about 112 px of its text: what will change is scrolled out of sight until the writer scrolls the peephole', async (p, h, t) => {
	await seeded(p);
	await work(p);
	await onMobile(p, [844, 390], async () => {
		await openView(p);
		await wayIn(p, t);
		await toBack(p);
		const r = await p.ev(`(() => { const m = document.querySelector(${j(BACK)}), c = [m, m.querySelector('.modal-content')].find(e => e.scrollHeight > e.clientHeight + 1) ?? m, cr = c.getBoundingClientRect(), li = m.querySelector('.binders-folder-snapshots-plan li').getBoundingClientRect(); return { region: Math.round(cr.height), vh: innerHeight, firstLineTop: Math.round(li.top), regionBottom: Math.round(cr.bottom) }; })()`);
		t.ok(r.firstLineTop + 10 <= r.regionBottom, 'the first line of what will change is in sight without scrolling (the scroll area is ' + r.region + ' px of ' + r.vh + '): ' + j(r));
	});
});
