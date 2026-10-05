// QA round 3, the outliner (src/view/outliner.ts, outliner-data.ts, actions.ts, drag.ts): what a writer does with it,
// driven with real mouse, keys and touches. Tests named "qa3 outliner: …" pass; "BUG: …" are confirmed bugs (they fail
// until fixed) and "UX: …" are behaviours that should exist (they fail until built). specs-outliner.mjs covers the
// basics; this file goes after the edges: how drops look frame by frame, focus after every action, locales, narrow
// panes, long binders, touch.
//   BINDERS_QA_SHOTS=<dir>   also saves screenshots of the states looked at (light and dark with --theme both)
import { inflateSync } from 'zlib';
import { mkdirSync } from 'fs';
import { B, NOTE, VIEW, clickMenu, closeMenus, contents, exists, flush, j, menuItems, openView, read, reload, same, split, texts, until, viewState, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa3 outliner: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: outliner: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: outliner: ' + name, fn });

const L = 'The Lighthouse/';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const O = '.workspace-leaf.mod-active .binders-outliner';
const R = `${O} .binders-outliner-row`;
const rowSel = (path) => `${R}[data-path="${L}${path}"]`;
const cellSel = (path, col) => `${rowSel(path)} [data-col="${col}"]`;
const nameAt = (p, path) => p.at(`${rowSel(path)} .binders-outliner-name`);
const thAt = (p, id) => p.at(`${O} .binders-outliner-th[data-col="${id}"]`);

/** Opens the outliner on a folder, with these columns (default: Label, Status, Words). */
async function open(p, folder = 'The Lighthouse', prefs = null) {
	await openView(p, folder);
	await p.ev(`(() => { const v = ${VIEW}; ${prefs ? `v.options = { ...v.options, outliner: ${j(prefs)} };` : ''} v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('${R}')`);
	await p.sleep(250);
}
const rows = (p) => p.ev(`[...document.querySelectorAll('${R}')].map(r => [r.dataset.path.slice(${L.length}), +r.getAttribute('aria-level')])`);
const names = async (p) => (await rows(p)).map((r) => r[0]);
const selected = (p) => p.ev(`[...document.querySelectorAll('${R}.is-selected')].map(r => r.dataset.path.slice(${L.length}))`);
const cellText = (p, path, col) => p.ev(`document.querySelector(${j(cellSel(path, col))})?.textContent ?? null`);
const headers = (p) => p.ev(`[...document.querySelectorAll('${O} .binders-outliner-th[data-col]')].map(e => e.dataset.col)`);
const prefs = async (p) => (await viewState(p)).options?.outliner ?? {};
const foot = (p) => p.ev(`[...document.querySelectorAll('${O} .binders-outliner-foot .binders-outliner-cell')].map(c => c.textContent)`);
/** What has the focus: "row:<path>", "th:<column>", "<body>", or the element's tag and classes. */
const active = (p) => p.ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return '<body>'; return a.classList.contains('binders-outliner-row') ? 'row:' + a.dataset.path.slice(${L.length}) : a.classList.contains('binders-outliner-th') && a.dataset.col ? 'th:' + a.dataset.col : a.tagName.toLowerCase() + '.' + [...a.classList].join('.'); })()`);
const inOutliner = (p) => p.ev(`!!document.activeElement?.closest?.('${O}')`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).filter(x => x); })()`);
const press = (p, x, y) => p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
const release = (p, x, y) => p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
/** What a drag shows right now. */
const dragState = (p) => p.ev(`(() => { const l = document.querySelector('.binders-drop-line.is-active')?.getBoundingClientRect(); return { hint: document.querySelector('.binders-outliner-ghost .drag-ghost-action')?.textContent ?? null, ghost: document.querySelector('.binders-outliner-ghost .drag-ghost-self')?.textContent ?? null, line: l ? { y: Math.round(l.top + l.height / 2), left: Math.round(l.left) } : null, into: [...document.querySelectorAll('${R}.is-being-dragged-over')].map(r => r.dataset.path.slice(${L.length})), dragging: [...document.querySelectorAll('${R}.is-dragging')].map(r => r.dataset.path.slice(${L.length})), grabbing: document.body.classList.contains('is-grabbing') }; })()`);
/** Presses a row (by path, or a point) and moves to a point with the button held; returns what shows before letting go. */
async function dragRow(p, from, to, { drop = true } = {}) {
	const a = typeof from === 'string' ? await nameAt(p, from) : from;
	await p.move(a.x, a.y, 2);
	await press(p, a.x, a.y);
	await p.move(to.x, to.y, 12, { buttons: 1 });
	await p.sleep(200);
	const seen = await dragState(p);
	if (!drop) await p.key('Escape');
	await release(p, to.x, to.y);
	await p.sleep(350);
	return seen;
}
/** Anything a drag could leave behind. */
const leftovers = (p) => p.ev(`document.querySelectorAll('.binders-outliner-ghost, .binders-drop-line, .binders-drop-indicator, ${R}.is-dragging, ${R}.is-being-dragged-over, ${R}.is-lifted').length + (document.body.classList.contains('is-grabbing') ? 100 : 0)`);
async function written(p, want) {
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.includes(${j(want)}))`);
	return contents(p);
}
/** Samples, every frame, each row's top and the scroll position, until sampleStop. */
const sampleStart = (p) => p.ev(`(() => { const o = document.querySelector('${O}'); const S = window.__qa3 = { on: true, frames: [] }; const t0 = performance.now(); const tick = () => { if (!S.on) return; const f = { t: Math.round(performance.now() - t0), scroll: o.scrollTop, rows: {} }; for (const r of o.querySelectorAll('.binders-outliner-row')) f.rows[r.dataset.path] = Math.round(r.getBoundingClientRect().top * 10) / 10; S.frames.push(f); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()`);
const sampleStop = (p) => p.ev(`(() => { window.__qa3.on = false; return window.__qa3.frames; })()`);
/** Evaluates `body` (a function body returning a value) once per frame for n frames, after the frame's own callbacks
    have run: what the frame was painted with. */
const painted = (p, n, body) => p.ev(`new Promise((res) => { const out = []; let n = 0; const one = () => { ${body} }; const tick = () => { setTimeout(() => { out.push(one()); if (++n < ${n}) requestAnimationFrame(tick); else res(out); }, 0); }; requestAnimationFrame(tick); })`);
/** Adds n notes to the binder, each with a synopsis and a few words. */
async function many(p, n) {
	await p.ev(`(async () => { for (let i = 1; i <= ${n}; i++) await app.vault.create('The Lighthouse/Scene ' + String(i).padStart(3, '0') + '.md', '---\\nsynopsis: Scene ' + i + ' happens.\\nstatus: draft\\n---\\nSome words here for scene ' + i + '.\\n'); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(600);
}
const setFm = (p, path, patch) => p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + path)}), (fm) => { Object.assign(fm, ${j(patch)}); }).then(() => 1)`);
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + path)}))?.frontmatter ?? {})`).then(JSON.parse);
const rawKey = async (p, key, vk, modifiers = 0) => { await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: vk, modifiers }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk, modifiers }); await p.sleep(80); };
const theme = (p) => p.ev(`document.body.classList.contains('theme-dark') ? 'dark' : 'light'`);
const SHOTS = process.env.BINDERS_QA_SHOTS;
async function shot(p, name) {
	if (!SHOTS) return;
	mkdirSync(SHOTS, { recursive: true });
	await p.shot(`${SHOTS}/${name}-${await theme(p)}.png`);
}
/** The pixels of a part of the page (a PNG read by hand): at(x, y) → "r,g,b". */
async function pixels(p, clip) {
	const r = await p.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
	const buf = Buffer.from(r.result.data, 'base64'), idat = [];
	let pos = 8, w = 0, h = 0, ct = 0;
	while (pos < buf.length) { const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len); if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; } if (type === 'IDAT') idat.push(data); pos += 12 + len; }
	const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
	for (let y = 0; y < h; y++) {
		const f = raw[y * (stride + 1)];
		for (let x = 0; x < stride; x++) {
			const v = raw[y * (stride + 1) + 1 + x], a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
			let pr = 0;
			if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1; else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
			out[y * stride + x] = (v + pr) & 255;
		}
	}
	return { w, h, at: (x, y) => [0, 1, 2].map((k) => out[y * stride + x * bpp + k]).join(',') };
}
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(400); };
/** Runs fn on a phone (Obsidian's mobile mode, with touch), then puts the desktop back. */
async function onPhone(p, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Dragging rows
// ---------------------------------------------------------------------------------------------------------------

test('drag: a wobble under 5 px stays a click; nothing moves, nothing shows', async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.move(a.x, a.y, 2);
	await press(p, a.x, a.y);
	await p.move(a.x + 3, a.y + 3, 3, { buttons: 1 });
	const seen = await dragState(p);
	t.eq(seen.ghost, null, 'no ghost for a 4 px wobble');
	t.ok(!seen.grabbing, 'no grabbing hand');
	await release(p, a.x + 3, a.y + 3);
	await p.sleep(200);
	t.eq(j(await selected(p)), j(['Part One/Arrival.md']), 'it selected the row, as a click does');
	t.eq(await active(p), 'row:Part One/Arrival.md', 'and gave it the focus');
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
});

test('drag: a row dropped in its own folder glides to its place; the page doesn’t scroll; focus and selection stay on it', async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	const a = await nameAt(p, 'Epilogue.md'), to = await p.at(rowSel('Prologue.md'));
	await p.move(a.x, a.y, 2);
	await press(p, a.x, a.y);
	await p.move(to.x, to.t + 4, 14, { buttons: 1 });
	await p.sleep(150);
	await shot(p, 'drag-held');
	await sampleStart(p);
	await release(p, to.x, to.t + 4);
	await p.sleep(700);
	const frames = await sampleStop(p);
	const tops = frames.map((f) => f.rows[L + 'Epilogue.md']).filter((v) => v != null), final = tops[tops.length - 1], dist = Math.abs(tops[0] - final);
	t.ok(Math.abs(final - to.t) < 2, `it ends where Prologue was (${final} vs ${to.t})`);
	t.ok(new Set(tops).size >= 6, `it passes through places on the way (${[...new Set(tops)].length} of them)`);
	t.ok(tops.every((v, i) => !i || v <= tops[i - 1] + 0.5), 'always upwards, never back: ' + tops.slice(0, 12).join(' '));
	t.ok(tops.every((v, i) => !i || Math.abs(v - tops[i - 1]) < dist * 0.5), 'no frame jumps half the way');
	t.eq(new Set(frames.map((f) => f.scroll)).size, 1, 'the scroll position never changes');
	t.eq(j(await written(p, '  - Epilogue\n  - Prologue')), j(['Epilogue', ...LIST.slice(0, 8)]), 'the order on disk');
	t.eq(j(await selected(p)), j(['Epilogue.md']), 'still selected');
	t.eq(await active(p), 'row:Epilogue.md', 'and focused');
	t.eq(await leftovers(p), 0, 'nothing of the drag is left');
	same(t, before, await texts(p), { skip: [NOTE] });
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
});

test('drag: Escape with the pointer outside the window cancels; over the sidebar the row is a file and the outliner shows nowhere to go, and Escape there cancels too', async (p, h, t) => {
	await open(p);
	const k = await nameAt(p, 'Part One/The keeper.md');
	await p.move(k.x, k.y, 2);
	await press(p, k.x, k.y);
	await p.move(k.x, 1000, 8, { buttons: 1 });
	await p.sleep(100);
	t.eq((await dragState(p)).ghost, 'The keeper', 'dragging, below the window');
	await p.key('Escape');
	t.eq(await leftovers(p), 0, 'Escape: nothing of the drag is left');
	await release(p, k.x, 1000);
	await p.sleep(300);
	t.eq(await active(p), 'row:Part One/The keeper.md', 'the focus is still on the row');
	await p.move(k.x, k.y, 2);
	await press(p, k.x, k.y);
	await p.move(150, 300, 8, { buttons: 1 });
	await p.sleep(100);
	// (since rows dragged out of the view are files, a release here is the file explorer's to act on, see
	// specs-card-file-drag.mjs; the outliner itself shows nowhere to go, and Escape ends it with nothing moved)
	const seen = await dragState(p);
	t.eq(seen.hint, '', 'over the sidebar: nowhere to go in the outliner');
	t.eq(seen.line, null, 'no line');
	t.ok(await p.ev(`app.dragManager.draggable?.file?.path === ${j(L + 'Part One/The keeper.md')}`), 'the row is a file there, and the drag Obsidian’s');
	await p.key('Escape');
	await release(p, 150, 300);
	await p.sleep(400);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'and no note opened');
	t.eq(await leftovers(p), 0, 'nothing left');
});

test('drag: started while a title is being typed, the title is saved first and the drag goes on', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('F2');
	await p.type('Landing');
	const pr = await p.at(rowSel('Prologue.md'));
	const seen = await dragRow(p, 'Epilogue.md', { x: pr.x, y: pr.t + 3 });
	t.eq(seen.hint, 'Move before “Prologue”', 'the other row drags');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Landing.md')})`);
	t.ok(await exists(p, L + 'Part One/Landing.md'), 'what was typed is saved');
	t.eq(j(await written(p, 'Part One/Landing')), j(['Epilogue', 'Prologue', 'Part One/', 'Part One/Landing', ...LIST.slice(3, 8)]), 'both the rename and the move are in the list');
	t.ok(!(await p.ev(`!!document.querySelector('${O} input, ${O} textarea')`)), 'no field left open');
	// pressing on the field itself never drags
	const k = await nameAt(p, 'Part One/The keeper.md');
	await p.click(k.x, k.y);
	await p.key('F2');
	const inp = await p.at(`${O} input`);
	await p.move(inp.x, inp.y, 2);
	await press(p, inp.x, inp.y);
	await p.move(inp.x, inp.y + 120, 8, { buttons: 1 });
	t.eq((await dragState(p)).ghost, null, 'a press inside the field selects text, it doesn’t drag the row');
	await release(p, inp.x, inp.y + 120);
	await p.key('Escape');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Arrival.md']: L + 'Part One/Landing.md' } });
}));

test('drag: rows selected in any order land in binder order; onto a folded folder goes into it', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	// Epilogue first, then Prologue: they still go Prologue, Epilogue
	const e = await nameAt(p, 'Epilogue.md'), pr = await nameAt(p, 'Prologue.md');
	await p.click(e.x, e.y);
	await p.click(pr.x, pr.y, { modifiers: 2 });
	const w = await p.at(rowSel('Part Two/The wreck.md'));
	let seen = await dragRow(p, 'Prologue.md', { x: w.x, y: w.t + 3 });
	t.eq(seen.ghost, '2 items', 'two rows');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Epilogue.md')})`);
	const list = await written(p, 'Part Two/Epilogue');
	t.eq(j(list.slice(list.indexOf('Part Two/'))), j(['Part Two/', 'Part Two/Prologue', 'Part Two/Epilogue', 'Part Two/The wreck', 'Part Two/Lights out']), 'in the binder’s order, not the order they were clicked in');
	t.eq(j(await selected(p)), j(['Part Two/Prologue.md', 'Part Two/Epilogue.md']), 'both still selected');
	// a folded folder takes a row over its middle
	const chev = await p.at(`${rowSel('Part One')} .binders-outliner-chevron`);
	await p.click(chev.x, chev.y);
	await p.sleep(250);
	const one = await p.at(rowSel('Part One'));
	seen = await dragRow(p, 'Part Two/Lights out.md', { x: one.x, y: one.y });
	t.eq(seen.hint, 'Move into “Part One”', 'over a folded folder');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Lights out.md')})`);
	t.eq(j((await written(p, 'Part One/Lights out')).slice(0, 5)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Lights out']), 'last in it');
	t.eq(j(await selected(p)), j(['Part One']), 'the folder is selected, as the row is out of sight');
	t.eq(await leftovers(p), 0, 'nothing left');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md', [L + 'Epilogue.md']: L + 'Part Two/Epilogue.md', [L + 'Part Two/Lights out.md']: L + 'Part One/Lights out.md' } });
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
}));

test('drag: in a Longform project a scene takes the indent of where it’s dropped; only the scenes list is written', async (p, h, t) => {
	const before = await texts(p);
	await open(p, 'Longform demo');
	const LF = 'Longform demo/';
	const lrows = () => p.ev(`[...document.querySelectorAll('${R}')].map(r => [r.dataset.path.slice(${LF.length}), +r.getAttribute('aria-level')])`);
	t.eq(j(await lrows()), j([['Harbor.md', 1], ['Ticket office.md', 2], ['The crossing.md', 2], ['Island.md', 1], ['Return.md', 1]]), 'the scenes, indented as in Longform');
	const at = (n) => p.at(`${R}[data-path="${LF}${n}"]`), nm = (n) => p.at(`${R}[data-path="${LF}${n}"] .binders-outliner-name`);
	const to = await at('Ticket office.md'), island = await at('Island.md');
	let seen = await dragRow(p, await nm('Return.md'), { x: island.x, y: island.t + 3 }, { drop: false });
	const outer = seen.line.left;
	seen = await dragRow(p, await nm('Return.md'), { x: to.x, y: to.t + to.h * 0.8 });
	t.eq(seen.hint, 'Move after “Ticket office”', 'after an indented scene');
	t.ok(seen.line.left > outer, `the line starts at that scene’s indent (${seen.line.left} > ${outer})`);
	await until(p, `document.querySelectorAll('${R}')[2]?.dataset.path === ${j(LF + 'Return.md')}`);
	t.eq(j(await lrows()), j([['Harbor.md', 1], ['Ticket office.md', 2], ['Return.md', 2], ['The crossing.md', 2], ['Island.md', 1]]), 'it’s indented with them');
	await flush(p);
	const index = await read(p, LF + 'Index.md');
	t.ok(index.includes('    - Harbor\n    - - Ticket office\n      - Return\n      - The crossing\n    - Island\n'), 'the scenes list on disk: ' + index.split('\n').slice(6, 12).join(' | '));
	t.eq(split(index).body, split(before[LF + 'Index.md']).body, 'the index note’s text is untouched');
	same(t, before, await texts(p), { skip: [LF + 'Index.md'] });
	t.eq(await leftovers(p), 0, 'nothing left');
});

test('a long binder (300 notes): quick to draw, the header stays, autoscroll is even, a drop while scrolled keeps the place', async (p, h, t) => {
	await many(p, 300);
	await openView(p);
	const ms = await p.ev(`(() => { const t0 = performance.now(); ${VIEW}.setMode('outliner'); document.querySelector('${O}').getBoundingClientRect(); return Math.round(performance.now() - t0); })()`);
	await until(p, `document.querySelectorAll('${R}').length >= 300`);
	await p.sleep(300);
	t.ok(ms < 600, `drawn in ${ms} ms`);
	t.eq(await p.ev(`document.querySelectorAll('${R}').length`), 309, 'every row');
	// arrow keys keep the focused row in sight, clear of the header
	const a = await nameAt(p, 'Prologue.md');
	await p.click(a.x, a.y);
	for (let i = 0; i < 30; i++) await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
	for (let i = 0; i < 12; i++) await p.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
	await p.sleep(150);
	const vis = await p.ev(`(() => { const o = document.querySelector('${O}'); const r = document.activeElement.getBoundingClientRect(), hd = o.querySelector('.binders-outliner-head').getBoundingClientRect(), or = o.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, head: hd.bottom, pane: or.bottom, headTop: Math.round(hd.top - or.top), scroll: o.scrollTop }; })()`);
	t.ok(vis.scroll > 0 && vis.top >= vis.head - 1 && vis.bottom <= vis.pane + 1, 'the focused row is in sight below the header: ' + j(vis));
	t.eq(vis.headTop, 0, 'the header stays at the top while the rows scroll');
	// dragging near the bottom edge scrolls evenly
	const o = await p.at(O);
	const mid = await p.ev(`(() => { const o = document.querySelector('${O}').getBoundingClientRect(); const rs = [...document.querySelectorAll('${R}')]; const i = rs.findIndex(r => r.getBoundingClientRect().top > o.top + 200); const n = rs[i].querySelector('.binders-outliner-name').getBoundingClientRect(); return { path: rs[i].dataset.path, x: n.x + 20, y: n.y + 8 }; })()`);
	await p.move(mid.x, mid.y, 2);
	await press(p, mid.x, mid.y);
	await p.move(mid.x, o.t + o.h - 20, 8, { buttons: 1 });
	await sampleStart(p);
	await p.sleep(500);
	let frames = await sampleStop(p);
	const steps = frames.slice(1).map((f, i) => Math.round(f.scroll - frames[i].scroll)).filter((s, i, all) => i > 0 && i < all.length - 1);
	// (it picks up speed the longer the row is held at the edge, gently: about half as fast again over half a second)
	t.ok(steps.length > 10 && steps.every((s, i) => s > 0 && (i === 0 || Math.abs(s - steps[i - 1]) <= 2)), 'no jump from one frame to the next: ' + steps.slice(0, 12).join(' '));
	t.ok(steps[steps.length - 1] >= steps[0] - 2 && steps[steps.length - 1] <= steps[0] * 1.6 + 2, 'and no faster than the gentle speeding up of a row held at the edge: ' + steps[0] + ' → ' + steps[steps.length - 1]);
	await p.key('Escape');
	await release(p, mid.x, o.t + o.h - 20);
	await p.sleep(300);
	// a drop three rows down, while scrolled: the page stays where it is and the row glides
	const d = await p.ev(`(() => { const o = document.querySelector('${O}').getBoundingClientRect(); const rs = [...document.querySelectorAll('${R}')]; const i = rs.findIndex(r => r.getBoundingClientRect().top > o.top + 200); const n = rs[i].querySelector('.binders-outliner-name').getBoundingClientRect(), tgt = rs[i + 3].getBoundingClientRect(); return { path: rs[i].dataset.path, over: rs[i + 3].dataset.path, x: n.x + 20, y: n.y + 8, ty: tgt.bottom - 4, scroll: document.querySelector('${O}').scrollTop }; })()`);
	await p.move(d.x, d.y, 2);
	await press(p, d.x, d.y);
	await p.move(d.x, d.ty, 10, { buttons: 1 });
	await p.sleep(100);
	await sampleStart(p);
	await release(p, d.x, d.ty);
	await p.sleep(600);
	frames = await sampleStop(p);
	t.eq(j([...new Set(frames.map((f) => Math.round(f.scroll)))]), j([Math.round(d.scroll)]), 'the scroll position doesn’t move');
	const tops = frames.map((f) => f.rows[d.path]);
	t.ok(new Set(tops).size >= 6, 'the row glides down: ' + tops.slice(0, 10).join(' '));
	t.eq(await p.ev(`(() => { const rs = [...document.querySelectorAll('${R}')].map(r => r.dataset.path); return rs.indexOf(${j(d.path)}) - rs.indexOf(${j(d.over)}); })()`), 1, 'and is right after the row it was dropped under');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), d.path, 'with the focus');
	t.eq(await leftovers(p), 0, 'nothing left');
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
});

bug('a row dropped into another folder jumps to its place instead of gliding there (rows moved within a folder glide)', withTidy(async (p, h, t) => {
	await open(p);
	const two = await p.at(rowSel('Part Two')), b = await nameAt(p, 'Prologue.md');
	await p.move(b.x, b.y, 2);
	await press(p, b.x, b.y);
	await p.move(two.x, two.y, 14, { buttons: 1 });
	await p.sleep(150);
	await sampleStart(p);
	await release(p, two.x, two.y);
	await p.sleep(700);
	const frames = await sampleStop(p);
	const tops = frames.map((f) => f.rows[L + 'Part Two/Prologue.md']).filter((v) => v != null);
	t.ok(tops.length > 5, 'the row arrived in Part Two');
	// (the rows it left behind do glide: Part One moves up over ~300 ms)
	const one = frames.map((f) => f.rows[L + 'Part One']);
	t.ok(new Set(one).size >= 6, 'the rows around it glide: ' + one.slice(0, 8).join(' '));
	t.ok(new Set(tops).size >= 6, `the dropped row glides too, rather than appearing in place at once: ${tops.slice(0, 8).join(' ')}`);
}));

bug('while a drag scrolls the outliner, the insertion line is painted a frame behind the rows (14–20 px off the row’s edge)', async (p, h, t) => {
	await many(p, 40);
	await open(p);
	const o = await p.at(O), a = await nameAt(p, 'Part One/Arrival.md');
	await p.move(a.x, a.y, 2);
	await press(p, a.x, a.y);
	await p.move(a.x, o.t + o.h - 20, 8, { buttons: 1 });
	const off = await painted(p, 20, `const o = document.querySelector('${O}'); const l = document.querySelector('.binders-drop-line.is-active')?.getBoundingClientRect(); if (!l) return null; const y = l.top + l.height / 2; let best = 1e9; for (const r of o.querySelectorAll('.binders-outliner-row')) { const b = r.getBoundingClientRect(); for (const e of [b.top, b.bottom]) if (Math.abs(e - y) < Math.abs(best)) best = e - y; } return Math.round(best);`);
	await shot(p, 'drag-autoscroll');
	await p.key('Escape');
	await release(p, a.x, o.t + o.h - 20);
	const shown = off.filter((v) => v != null);
	t.ok(shown.length > 10, 'the line shows while scrolling');
	t.ok(shown.every((v) => Math.abs(v) <= 2), 'in every painted frame the line is on a row’s edge; px off: ' + shown.join(' '));
});

bug('a row dropped into a folded folder leaves the focus on nothing (<body>): the keyboard is dead', withTidy(async (p, h, t) => {
	await open(p);
	const chev = await p.at(`${rowSel('Part Two')} .binders-outliner-chevron`);
	await p.click(chev.x, chev.y);
	await p.sleep(250);
	const two = await p.at(rowSel('Part Two'));
	await dragRow(p, 'Prologue.md', { x: two.x, y: two.y });
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Prologue.md')})`);
	await p.sleep(400);
	t.eq(j(await selected(p)), j(['Part Two']), 'the folder is selected');
	t.eq(await active(p), 'row:Part Two', 'and has the focus');
}));

bug('a folded folder dragged into another folder springs open (what’s folded is kept by path)', withTidy(async (p, h, t) => {
	await open(p);
	const chev = await p.at(`${rowSel('Part Two')} .binders-outliner-chevron`);
	await p.click(chev.x, chev.y);
	await p.sleep(250);
	const one = await p.at(rowSel('Part One'));
	const seen = await dragRow(p, 'Part Two', { x: one.x, y: one.y });
	t.eq(seen.hint, 'Move into “Part One”', 'into Part One');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Part Two')})`);
	await until(p, `!!document.querySelector(${j(rowSel('Part One/Part Two'))})`);
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelector(${j(rowSel('Part One/Part Two'))}).getAttribute('aria-expanded')`), 'false', 'it’s still folded where it landed');
	t.ok(!(await names(p)).includes('Part One/Part Two/The wreck.md'), 'its notes stay out of sight');
}));

ux('a drag let go over the tab bar or above the window is cancelled, not dropped at the top of the binder', async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.move(a.x, a.y, 2);
	await press(p, a.x, a.y);
	await p.move(a.x, 20, 8, { buttons: 1 }); // the tab bar, two bars above the outliner
	await p.sleep(150);
	await release(p, a.x, 20);
	await p.sleep(500);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
});

ux('over the column headers, with rows scrolled under them, a drag offers no place it can’t show (no hint without a line)', async (p, h, t) => {
	await many(p, 40);
	await open(p);
	await p.ev(`(() => { document.querySelector('${O}').scrollTop = 900; return 1; })()`);
	await p.sleep(200);
	const mid = await p.ev(`(() => { const o = document.querySelector('${O}').getBoundingClientRect(); const r = [...document.querySelectorAll('${R}')].find(r => r.getBoundingClientRect().top > o.top + 200); const n = r.querySelector('.binders-outliner-name').getBoundingClientRect(); return { x: n.x + 20, y: n.y + 8 }; })()`);
	const hd = await p.at(`${O} .binders-outliner-head`);
	await p.move(mid.x, mid.y, 2);
	await press(p, mid.x, mid.y);
	await p.move(mid.x, hd.y, 6, { buttons: 1 });
	const seen = await painted(p, 20, `const hint = document.querySelector('.binders-outliner-ghost .drag-ghost-action')?.textContent ?? ''; const line = !!document.querySelector('.binders-drop-line.is-active'), into = !!document.querySelector('${R}.is-being-dragged-over'); return (hint ? 'H' : '-') + (line || into ? 'L' : '-');`);
	await p.key('Escape');
	await release(p, mid.x, hd.y);
	t.ok(!seen.includes('H-'), 'every frame that names a place shows where it is (H = hint, L = line): ' + seen.join(' '));
});

ux('at the end of a nested folder, how far left the pointer is chooses the level (there’s no way to drop after a folder that ends its parent)', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Part Two/Sub'); await app.vault.create('The Lighthouse/Part Two/Sub/Deep.md', 'text'); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(600);
	await open(p);
	t.eq(j((await rows(p)).slice(-3)), j([['Part Two/Sub', 2], ['Part Two/Sub/Deep.md', 3], ['Epilogue.md', 1]]), 'a folder that ends Part Two, then Epilogue');
	const deep = await p.at(rowSel('Part Two/Sub/Deep.md')), a = await nameAt(p, 'Prologue.md');
	await p.move(a.x, a.y, 2);
	await press(p, a.x, a.y);
	const hints = new Set();
	for (const y of [deep.t + deep.h - 8, deep.t + deep.h - 3, deep.t + deep.h + 3, deep.t + deep.h + 8]) {
		for (const x of [deep.l + 12, deep.l + 34, deep.l + 54, deep.l + 80, deep.l + 300]) { await p.move(x, y, 2, { buttons: 1 }); await p.sleep(40); hints.add((await dragState(p)).hint); }
	}
	await p.key('Escape');
	await release(p, deep.l + 300, deep.t + deep.h);
	t.ok(hints.has('Move after “Sub”'), 'somewhere along that edge a row can go after “Sub”, inside Part Two; offered: ' + [...hints].join(' | '));
}));

// ---------------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------------

test('columns: every one from “+”, ticked in its menu; a property typed by name; widths clamp at 48 and 640; a double click on an edge resets it', async (p, h, t) => {
	await open(p);
	const plus = () => p.at(`${O} .binders-outliner-th.mod-add`);
	const ticked = () => p.ev(`[...document.querySelectorAll('.menu .menu-item.mod-checked .menu-item-title')].map(e => e.textContent)`);
	let b = await plus();
	await p.click(b.x, b.y);
	t.eq(j(await ticked()), j(['Label', 'Status', 'Words']), 'the columns that show are ticked');
	await shot(p, 'columns-menu');
	await closeMenus(p);
	// the edge of Label: as narrow and as wide as it goes, then back
	const drag = async (dx) => { const e = await p.at(`${O} .binders-outliner-th[data-col="label"] .binders-outliner-resizer`); await p.move(e.x, e.y, 2); await press(p, e.x, e.y); await p.move(e.x + dx, e.y, 8, { buttons: 1 }); await release(p, e.x + dx, e.y); await p.sleep(300); };
	await drag(-400);
	t.eq(Math.round((await thAt(p, 'label')).w), 48, 'no narrower than 48 px');
	t.ok(await p.ev(`(() => { const e = document.querySelector('${O} .binders-outliner-th[data-col="label"] .binders-outliner-th-name'); return e.scrollWidth <= e.clientWidth || getComputedStyle(e).textOverflow === 'ellipsis'; })()`), 'its name fits or is cut with an ellipsis');
	await drag(500);
	t.eq(Math.round((await thAt(p, 'label')).w), 548, 'wider by what the pointer moved');
	await drag(400);
	t.eq(Math.round((await thAt(p, 'label')).w), 640, 'no wider than 640 px');
	t.eq((await prefs(p)).columns.find((c) => c.id === 'label').width, 640, 'kept with the view');
	await p.ev(`(() => { document.querySelector('${O}').scrollLeft = 0; return 1; })()`);
	const e = await p.at(`${O} .binders-outliner-th[data-col="label"] .binders-outliner-resizer`);
	await p.dbl(e.x, e.y);
	await until(p, `Math.round(document.querySelector('${O} .binders-outliner-th[data-col="label"]')?.getBoundingClientRect().width) === 120`, 6000);
	t.eq(Math.round((await thAt(p, 'label')).w), 120, 'a double click on the edge puts the width back');
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and opens no menu');
	// the rest of the columns, one by one (the "+" moves right as they're added)
	for (const name of ['Target', 'Progress', 'Export', 'Created', 'Modified', 'plotlines']) {
		await p.ev(`(() => { const o = document.querySelector('${O}'); o.scrollLeft = o.scrollWidth; return 1; })()`);
		b = await plus();
		await p.click(b.x, b.y);
		await clickMenu(p, name);
		await closeMenus(p);
	}
	t.eq(j(await headers(p)), j(['title', 'label', 'status', 'words', 'target', 'progress', 'export', 'created', 'modified', 'prop:plotlines']), 'all of them, in the order added');
	await p.ev(`(() => { const o = document.querySelector('${O}'); o.scrollLeft = o.scrollWidth; return 1; })()`);
	b = await plus();
	await p.click(b.x, b.y);
	await clickMenu(p, 'Other property...');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.type('pov');
	await p.key('Enter');
	await until(p, `!!document.querySelector('${O} .binders-outliner-th[data-col="prop:pov"]')`);
	t.eq((await headers(p)).pop(), 'prop:pov', 'a property typed by name is the last column');
	await shot(p, 'columns-all');
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
});

test('columns: a header dragged past the last one goes last; Escape cancels a header drag; nothing is left, no menu opens', async (p, h, t) => {
	await open(p);
	const st = await thAt(p, 'label'), pl = await p.at(`${O} .binders-outliner-th.mod-add`);
	await p.move(st.x, st.y, 2);
	await press(p, st.x, st.y);
	await p.move(pl.x + 5, st.y, 10, { buttons: 1 });
	await p.sleep(150);
	t.ok(await p.ev(`!!document.querySelector('.binders-drop-indicator.is-active')`), 'a line shows where it goes');
	t.eq(await p.ev(`document.querySelector('${O} .binders-outliner-th.is-dragging')?.dataset.col ?? null`), 'label', 'the header being moved is dimmed');
	await shot(p, 'header-drag');
	await release(p, pl.x + 5, st.y);
	await p.sleep(300);
	t.eq(j(await headers(p)), j(['title', 'status', 'words', 'label']), 'Label is last');
	const a = await thAt(p, 'status'), b = await thAt(p, 'label');
	await p.move(a.x, a.y, 2);
	await press(p, a.x, a.y);
	await p.move(b.x + 20, b.y, 10, { buttons: 1 });
	await p.key('Escape');
	await release(p, b.x + 20, b.y);
	await p.sleep(300);
	t.eq(j(await headers(p)), j(['title', 'status', 'words', 'label']), 'Escape: nothing moved');
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'no menu opened');
	t.eq(await leftovers(p), 0, 'nothing of the drag is left');
});

test('sorting: blanks last both ways; labels and statuses in the order of the settings; numbers by size; inside folders too', withTidy(async (p, h, t) => {
	await setFm(p, 'Prologue.md', { target: 100, label: 'Blue', day: 3 });
	await setFm(p, 'Epilogue.md', { target: 6, label: 'Red', day: 12 });
	await setFm(p, 'Part One/Arrival.md', { label: 'Green' });
	await p.sleep(400);
	await open(p, 'The Lighthouse', { columns: [{ id: 'label' }, { id: 'status' }, { id: 'target' }, { id: 'progress' }, { id: 'prop:day' }] });
	const sort = async (id, item) => { const th = await thAt(p, id); await p.right(th.x, th.y); await clickMenu(p, item); await p.sleep(250); };
	const top = async () => (await names(p)).filter((n) => !n.includes('/')).join(',');
	const inOne = async () => (await names(p)).filter((n) => n.startsWith('Part One/')).map((n) => n.slice(9)).join(',');
	await sort('target', 'Sort ascending');
	t.eq(await top(), 'Epilogue.md,Prologue.md,Part One,Part Two', 'target, smallest first; no target last');
	await sort('target', 'Sort descending');
	t.eq(await top(), 'Prologue.md,Epilogue.md,Part One,Part Two', 'largest first; no target still last');
	await sort('progress', 'Sort ascending');
	t.eq(await top(), 'Prologue.md,Epilogue.md,Part One,Part Two', 'progress: 21% before 100%');
	await sort('label', 'Sort ascending');
	t.eq(await top(), 'Epilogue.md,Prologue.md,Part One,Part Two', 'labels in the order of the settings (Red before Blue), not the alphabet');
	t.eq(await inOne(), 'Arrival.md,The keeper.md,Storm warning.md', 'in a folder: the labelled note first, the rest as they were');
	await sort('label', 'Sort descending');
	t.eq(await inOne(), 'Arrival.md,The keeper.md,Storm warning.md', 'descending: the unlabelled ones are still last');
	await sort('status', 'Sort ascending');
	t.eq(await inOne(), 'Storm warning.md,The keeper.md,Arrival.md', 'statuses in the order of the settings: idea, draft, revised');
	await sort('prop:day', 'Sort descending');
	t.eq(await top(), 'Epilogue.md,Prologue.md,Part One,Part Two', 'a number property by size (12 before 3)');
	const th = await thAt(p, 'prop:day');
	await p.right(th.x, th.y);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.menu .menu-item.mod-checked .menu-item-title')].map(e => e.textContent)`)), j(['Sort descending']), 'the column’s menu ticks how it’s sorted');
	t.ok((await menuItems(p)).includes('Binder order'), 'and offers the binder’s order back');
	await shot(p, 'sorted-menu');
	await closeMenus(p);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'the binder’s own order is untouched');
}));

test('what the view keeps: sorting, widths and folded folders survive a switch of mode and a restart of Obsidian', async (p, h, t) => {
	await open(p);
	const th = await thAt(p, 'words');
	await p.right(th.x, th.y);
	await clickMenu(p, 'Sort descending');
	const chev = await p.at(`${rowSel('Part Two')} .binders-outliner-chevron`);
	await p.click(chev.x, chev.y);
	await p.sleep(200);
	const e = await p.at(`${O} .binders-outliner-th[data-col="label"] .binders-outliner-resizer`);
	await p.move(e.x, e.y, 2);
	await press(p, e.x, e.y);
	await p.move(e.x + 50, e.y, 6, { buttons: 1 });
	await release(p, e.x + 50, e.y);
	await p.sleep(300);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	const want = ['Part One', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two', 'Prologue.md', 'Epilogue.md'];
	t.eq(j(await names(p)), j(want), 'sorted by words, Part Two folded');
	await h.run('show-corkboard');
	await p.sleep(400);
	await h.run('show-outliner');
	await until(p, `!!document.querySelector('${R}')`);
	await p.sleep(300);
	t.eq(j(await names(p)), j(want), 'the same after the corkboard and back');
	t.eq(j(await selected(p)), j(['Part One/Arrival.md']), 'with the same row selected');
	t.eq(await active(p), 'row:Part One/Arrival.md', 'and focused');
	await p.sleep(2500); // Obsidian saves its layout a couple of seconds after it changes
	await reload(p);
	await until(p, `!!document.querySelector('${R}')`, 8000);
	await p.sleep(500);
	t.eq(j(await names(p)), j(want), 'the same after restarting Obsidian');
	t.eq(Math.round((await thAt(p, 'label')).w), 170, 'the width too');
	t.eq(await p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]').getAttribute('aria-sort')`), 'descending', 'and the header says how it’s sorted');
});

test('a 500 px pane: the columns scroll sideways under the title, which stays; the header stays when scrolling down', async (p, h, t) => {
	await p.ev(`(() => { app.workspace.leftSplit.collapse(); return 1; })()`);
	try {
		await p.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 600, deviceScaleFactor: 1, mobile: false });
		await open(p, 'The Lighthouse', { columns: [{ id: 'label' }, { id: 'status' }, { id: 'words' }, { id: 'target' }, { id: 'progress' }] });
		const geo = () => p.ev(`(() => { const o = document.querySelector('${O}'), or = o.getBoundingClientRect(); const g = (s) => { const r = o.querySelector(s).getBoundingClientRect(); return [Math.round(r.left - or.left), Math.round(r.top - or.top), Math.round(r.width)]; }; return { pane: Math.round(or.width), wide: o.scrollWidth, left: o.scrollLeft, top: o.scrollTop, headTitle: g('.binders-outliner-th.mod-title'), headStatus: g('.binders-outliner-th[data-col="status"]'), title: g('.binders-outliner-row .mod-title'), status: g('.binders-outliner-row [data-col="status"]'), view: document.querySelector('.workspace-leaf.mod-active .binders-view').scrollWidth - document.querySelector('.workspace-leaf.mod-active .binders-view').clientWidth }; })()`);
		// (the window is resized and the sidebar folded: the pane has its width once the layout has caught up)
		await until(p, `(() => { const w = document.querySelector('${O}')?.getBoundingClientRect().width; return w >= 440 && w <= 500; })()`, 8000);
		let g = await geo();
		t.ok(g.pane >= 440 && g.pane <= 500, 'a narrow pane: ' + g.pane);
		t.ok(g.wide > g.pane, 'the columns don’t fit, so the outliner scrolls sideways');
		t.ok(g.view <= 0, 'and only the outliner: the view itself doesn’t');
		await shot(p, 'pane-500');
		const o = await p.at(O);
		await p.wheel(o.x, o.y, 0, false, 150);
		await p.sleep(300);
		await p.wheel(o.x, o.y, 120);
		await p.sleep(300);
		const s = await geo();
		t.ok(s.left === 150 && s.top > 0, 'scrolled sideways and down: ' + j([s.left, s.top]));
		t.eq(s.headTitle[0], 0, 'the title’s header stays at the left');
		t.eq(s.title[0], 0, 'and the titles under it');
		t.eq(s.headStatus[0], g.headStatus[0] - 150, 'the other columns move under them');
		t.eq(s.status[0], s.headStatus[0], 'cells stay under their headers');
		t.eq(s.headTitle[1], 0, 'the header row stays at the top');
		await shot(p, 'pane-500-scrolled');
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await p.ev(`(() => { app.workspace.leftSplit.expand(); return 1; })()`);
		await p.sleep(300);
	}
});

ux('in a pane as narrow as a sidebar (256 px) the pinned title leaves room to see the other columns', async (p, h, t) => {
	await p.ev(`(() => { app.workspace.leftSplit.collapse(); return 1; })()`);
	try {
		await p.send('Emulation.setDeviceMetricsOverride', { width: 300, height: 600, deviceScaleFactor: 1, mobile: false });
		await open(p);
		await shot(p, 'pane-256');
		const g = await p.ev(`(() => { const o = document.querySelector('${O}'); return { pane: o.clientWidth, title: Math.round(o.querySelector('.binders-outliner-th.mod-title').getBoundingClientRect().width), sticky: getComputedStyle(o.querySelector('.binders-outliner-row .mod-title')).position }; })()`);
		t.ok(g.sticky !== 'sticky' || g.title <= g.pane * 0.6, `the title column takes ${g.title} of ${g.pane} px and stays put: ${g.pane - g.title} px is all that’s left for every other column`);
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await p.ev(`(() => { app.workspace.leftSplit.expand(); return 1; })()`);
		await p.sleep(300);
	}
});

ux('a click on a column’s header sorts by it, as in a base’s table (its menu is on a right-click)', async (p, h, t) => {
	// in a base: one click sorts ascending, a second descending, a third puts the order back; no menu opens
	await open(p);
	const th = await thAt(p, 'words');
	await p.click(th.x, th.y);
	await p.sleep(250);
	const menus = await p.ev(`document.querySelectorAll('.menu').length`);
	await closeMenus(p);
	t.eq(menus, 0, 'no menu on a click');
	t.eq(await p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]').getAttribute('aria-sort')`), 'ascending', 'sorted by words');
});

bug('the reserved “export” property is offered as a property column once a note is left out of exports', withTidy(async (p, h, t) => {
	// (“compile” is the property's name from before export: typed by hand it is still read, and still Binders' own)
	await setFm(p, 'Epilogue.md', { export: false });
	await setFm(p, 'Prologue.md', { compile: false });
	await p.sleep(400);
	await open(p);
	const plus = await p.at(`${O} .binders-outliner-th.mod-add`);
	await p.click(plus.x, plus.y);
	const items = await menuItems(p);
	await closeMenus(p);
	t.ok(items.includes('Export'), 'Binders’ own Export column is there');
	t.ok(!items.includes('export'), 'and the property behind it isn’t listed as one of the notes’ own: ' + items.join(', '));
	t.ok(!items.includes('compile'), 'nor is “compile”, its name before export: ' + items.join(', '));
	t.ok(!items.includes('Compile'), 'and there is no Compile column any more');
}));

// ---------------------------------------------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------------------------------------------

test('renaming: a bad name stays in the field with a notice; nothing typed is nothing changed; spaces are trimmed; case can change; bodies untouched', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('F2');
	await p.type('a/b:c');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(/can’t contain/.test((await notices(p)).join('|')), 'a notice says which characters can’t be used');
	t.ok(await p.ev(`document.activeElement?.matches('${R} .binders-outliner-name input') && document.activeElement.value === 'a/b:c'`), 'what was typed stays in the field');
	await p.key('Escape');
	t.eq(await active(p), 'row:Part One/Arrival.md', 'Escape: back on the row');
	t.ok(await exists(p, L + 'Part One/Arrival.md'), 'not renamed');
	await p.key('F2');
	await p.ev(`document.activeElement.select()`);
	await p.key('Backspace');
	await p.key('Enter');
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelector(${j(rowSel('Part One/Arrival.md') + ' .binders-outliner-name')})?.textContent`), 'Arrival', 'an emptied title is left as it was');
	await p.key('F2');
	await p.type('  Landing  ');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Landing.md')})`);
	t.eq(await active(p), 'row:Part One/Landing.md', 'spaces around a name are trimmed; the row keeps the focus');
	await p.key('F2');
	await p.type('landing');
	await p.key('Enter');
	await until(p, `app.vault.getAbstractFileByPath(${j(L + 'Part One/landing.md')}) != null`);
	t.eq(await p.ev(`app.vault.getAbstractFileByPath(${j(L + 'Part One/landing.md')})?.name`), 'landing.md', 'only the case of a name can change');
	// a folder can't take the name of a note in it; renamed properly, its notes come along and it keeps the focus
	const f = await nameAt(p, 'Part One');
	await p.click(f.x, f.y);
	await p.key('F2');
	await p.type('The keeper');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(/would become its folder note/.test((await notices(p)).join('|')), 'a folder can’t be named like a note in it');
	await p.ev(`document.activeElement.select()`);
	await p.type('Act I');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Act I/The keeper.md')})`);
	await p.sleep(300);
	t.eq(await active(p), 'row:Act I', 'the renamed folder keeps the focus');
	t.eq(j(await written(p, 'Act I/')), j(['Prologue', 'Act I/', 'Act I/landing', 'Act I/The keeper', 'Act I/Storm warning', ...LIST.slice(5)]), 'the list follows');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Arrival.md']: L + 'Act I/landing.md', [L + 'Part One/The keeper.md']: L + 'Act I/The keeper.md', [L + 'Part One/Storm warning.md']: L + 'Act I/Storm warning.md' } });
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
}));

test('synopsis and target cells: Enter is a new line and Escape drops it; a click away saves; odd targets; a folder’s target makes its folder note', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p, 'The Lighthouse', { columns: [{ id: 'words' }, { id: 'target' }, { id: 'progress' }] });
	const ep = await nameAt(p, 'Epilogue.md');
	await p.click(ep.x, ep.y);
	const s = await p.at(`${rowSel('Epilogue.md')} .binders-outliner-synopsis`);
	await p.click(s.x, s.y);
	await until(p, `document.activeElement?.matches('${R} .binders-outliner-synopsis textarea')`);
	await p.type(' More');
	await p.key('Enter');
	await p.type('line two');
	t.eq(await p.ev(`document.activeElement.value`), 'Years later, the lighthouse is a museum. More\nline two', 'Enter is a new line in a synopsis');
	await p.key('Escape');
	await p.sleep(200);
	t.eq(await read(p, L + 'Epilogue.md'), before[L + 'Epilogue.md'], 'Escape: nothing written');
	t.eq(await active(p), 'row:Epilogue.md', 'and the row has the focus again');
	await p.click(s.x, s.y);
	await until(p, `document.activeElement?.matches('${R} .binders-outliner-synopsis textarea')`);
	await p.type(' More.');
	const k = await nameAt(p, 'Part One/The keeper.md');
	await p.click(k.x, k.y);
	await until(p, `app.vault.adapter.read(${j(L + 'Epilogue.md')}).then(s => s.includes('museum. More.'))`);
	t.eq(split(await read(p, L + 'Epilogue.md')).yaml, split(before[L + 'Epilogue.md']).yaml.replace('is a museum.', 'is a museum. More.'), 'a click on another row saves it: only the synopsis changed');
	t.eq(j(await selected(p)), j(['Part One/The keeper.md']), 'and selects that row');
	// targets
	const type = async (path, text) => {
		const n = await nameAt(p, path);
		await p.click(n.x, n.y);
		const c = await p.at(cellSel(path, 'target'));
		await p.click(c.x, c.y);
		await until(p, `document.activeElement?.matches('${R} [data-col="target"] input')`);
		await p.ev(`document.activeElement.select()`);
		if (text) await p.type(text); else await p.key('Backspace');
		await p.key('Enter');
		await p.sleep(350);
		const stuck = await p.ev(`document.activeElement?.matches('${R} [data-col="target"] input')`);
		if (stuck) await p.key('Escape');
		return stuck;
	};
	const target = async (path) => (await read(p, L + path)).match(/^target: (.*)$/m)?.[1] ?? null;
	t.ok(!(await type('Part One/The keeper.md', '2 000')), 'a space between thousands is taken');
	t.eq(await target('Part One/The keeper.md'), '2000', '2 000 is 2000');
	t.eq(await cellText(p, 'Part One/The keeper.md', 'progress'), '0%', '17 of 2,000 words: under 1%');
	t.ok(await type('Part One/The keeper.md', '-3'), 'a negative number is refused and stays in the field');
	t.ok(await type('Part One/The keeper.md', '12 words'), 'so is text');
	t.eq(await target('Part One/The keeper.md'), '2000', 'the target is what it was');
	t.ok(!(await type('Part One/The keeper.md', '0')), '0 is taken');
	t.eq(await target('Part One/The keeper.md'), null, 'and means no target');
	t.eq(await read(p, L + 'Part One/The keeper.md'), before[L + 'Part One/The keeper.md'], 'the note is byte for byte as it was');
	// a folder's own target lives in its folder note
	t.ok(!(await type('Part One', '200')), 'a folder takes a target');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Part One.md')})`);
	t.eq(await read(p, L + 'Part One/Part One.md'), '---\ntarget: 200\n---\n', 'in its folder note, made for it');
	t.eq(await cellText(p, 'Part One', 'progress'), '25%', '51 of 200 words');
	t.eq((await names(p)).length, 9, 'the folder note doesn’t show as a row');
	same(t, before, await texts(p), { skip: [L + 'Epilogue.md'] });
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
}));

test('the Export column: a tick writes only “export: false”; a folder’s tick greys the ticks of what’s in it', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p, 'The Lighthouse', { columns: [{ id: 'export' }] });
	const ticks = () => p.ev(`[...document.querySelectorAll('${R} [data-col="export"] input')].map(i => (i.checked ? 'x' : '-') + (i.disabled ? 'd' : '')).join(' ')`);
	t.eq(await ticks(), 'x x x x x x x x x', 'everything is exported to begin with');
	let cb = await p.at(`${cellSel('Epilogue.md', 'export')} input`);
	await p.click(cb.x, cb.y);
	await until(p, `app.vault.adapter.read(${j(L + 'Epilogue.md')}).then(s => s.includes('export: false'))`);
	const text = await read(p, L + 'Epilogue.md');
	t.eq(split(text).yaml, split(before[L + 'Epilogue.md']).yaml + '\nexport: false', 'one property added');
	t.eq(split(text).body, split(before[L + 'Epilogue.md']).body, 'the text untouched');
	cb = await p.at(`${cellSel('Part Two', 'export')} input`);
	await p.click(cb.x, cb.y);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Part Two.md')})`);
	await until(p, `document.querySelector(${j(cellSel('Part Two/The wreck.md', 'export') + ' input')})?.disabled === true`);
	t.eq(await ticks(), 'x x x x x - -d -d -', 'Part Two’s notes are out with it, and say so');
	cb = await p.at(`${cellSel('Epilogue.md', 'export')} input`);
	await p.click(cb.x, cb.y);
	await until(p, `app.vault.adapter.read(${j(L + 'Epilogue.md')}).then(s => !s.includes('export'))`);
	t.eq(await read(p, L + 'Epilogue.md'), before[L + 'Epilogue.md'], 'ticked again, the note is byte for byte as it was');
	same(t, before, await texts(p));
}));

bug('a target is misread where thousands are grouped with a dot (German): 1.500 with a 0 added becomes 2', async (p, h, t) => {
	await p.send('Emulation.setLocaleOverride', { locale: 'de-DE' });
	try {
		t.eq(await p.ev(`(1500).toLocaleString()`), '1.500', 'numbers are written the German way');
		await open(p, 'The Lighthouse', { columns: [{ id: 'words' }, { id: 'target' }] });
		const k = await nameAt(p, 'Part One/The keeper.md');
		await p.click(k.x, k.y);
		const cell = async () => { const c = await p.at(cellSel('Part One/The keeper.md', 'target')); await p.click(c.x, c.y); await until(p, `document.activeElement?.matches('${R} [data-col="target"] input')`); };
		await cell();
		await p.type('1500');
		await p.key('Enter');
		await until(p, `app.vault.adapter.read(${j(L + 'Part One/The keeper.md')}).then(s => /^target: 1500$/m.test(s))`);
		await until(p, `document.querySelector(${j(cellSel('Part One/The keeper.md', 'target'))})?.textContent === '1.500'`);
		t.eq(await cellText(p, 'Part One/The keeper.md', 'target'), '1.500', 'the cell shows 1.500');
		// the writer adds a zero to what the field shows: 15,000 words
		await cell();
		// (the field holds plain digits, so what's shown never has to be read back)
		t.eq(await p.ev(`document.activeElement.value`), '1500', 'its field holds the number as plain digits');
		await p.ev(`(() => { const f = document.activeElement; f.setSelectionRange(f.value.length, f.value.length); return 1; })()`);
		await p.type('0');
		await p.key('Enter');
		await p.sleep(500);
		if (await p.ev(`document.activeElement?.matches('${R} input')`)) await p.key('Escape');
		const now = (await read(p, L + 'Part One/The keeper.md')).match(/^target: (.*)$/m)?.[1];
		t.ok(now === '15000' || now === '1500', `1.5000 typed over 1.500 is 15000 (or is refused and stays 1500), never 2; it is ${now}`);
	} finally { await p.send('Emulation.setLocaleOverride', {}); }
});

ux('a bad name says so once: clicking elsewhere with it still in the field doesn’t stack two more notices per click', withTidy(async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('F2');
	await p.type('a/b');
	await p.key('Enter');
	await p.sleep(300);
	const n0 = (await notices(p)).length;
	const e = await nameAt(p, 'Epilogue.md');
	await p.click(e.x, e.y);
	await p.sleep(300);
	const n1 = (await notices(p)).length;
	await p.key('Escape');
	t.eq(n0, 1, 'one notice for the name');
	t.ok(n1 - n0 <= 1, `one click elsewhere adds at most one more (it added ${n1 - n0})`);
}));

ux('Tab in a cell being edited saves it and stays in the outliner (a base moves to the next cell)', withTidy(async (p, h, t) => {
	await open(p, 'The Lighthouse', { columns: [{ id: 'words' }, { id: 'target' }] });
	const k = await nameAt(p, 'Part One/The keeper.md');
	await p.click(k.x, k.y);
	const c = await p.at(cellSel('Part One/The keeper.md', 'target'));
	await p.click(c.x, c.y);
	await until(p, `document.activeElement?.matches('${R} [data-col="target"] input')`);
	await p.type('750');
	await p.key('Tab');
	await until(p, `app.vault.adapter.read(${j(L + 'Part One/The keeper.md')}).then(s => /^target: 750$/m.test(s))`);
	// (the field gives way to the text a moment after the note is written)
	await until(p, `document.querySelector(${j(cellSel('Part One/The keeper.md', 'target'))})?.textContent === '750'`);
	t.eq(await cellText(p, 'Part One/The keeper.md', 'target'), '750', 'saved');
	t.ok(await inOutliner(p), 'the focus is still in the outliner; it is on: ' + (await active(p)));
}));

// ---------------------------------------------------------------------------------------------------------------
// Keyboard and focus
// ---------------------------------------------------------------------------------------------------------------

test('keyboard: select all, extend to the end, the menu key, Delete asks and gives the focus back, deleting goes to the trash, Ctrl+Enter opens a tab', withTidy(async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('a', 'ctrl');
	t.eq((await selected(p)).length, 9, 'Ctrl+A selects every row');
	await p.key('Escape');
	t.eq(j(await selected(p)), j(['Part One/Arrival.md']), 'Escape: back to the focused one');
	await p.key('End', 'shift');
	t.eq((await selected(p)).length, 7, 'Shift+End extends to the last row');
	await p.key('Home');
	t.eq(j(await selected(p)), j(['Prologue.md']), 'Home');
	await p.key('ArrowDown');
	await p.key('ArrowDown');
	for (const [key, mod] of [['F10', 'shift'], ['ContextMenu']]) {
		await p.key(key, ...(mod ? [mod] : []));
		await p.sleep(200);
		t.ok((await menuItems(p)).includes('Rename'), `${mod ? 'Shift+' : ''}${key} opens the row’s menu`);
		await p.key('Escape');
		await p.sleep(200);
		t.eq(await active(p), 'row:Part One/Arrival.md', 'closing it gives the focus back to the row');
	}
	await p.key('Delete');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/Delete “Arrival”\?/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'Delete asks first');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await active(p), 'row:Part One/Arrival.md', 'No: the row has the focus again');
	t.ok(await exists(p, L + 'Part One/Arrival.md'), 'and the note is still there');
	await p.key('Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await p.key('Enter');
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})`);
	await until(p, `document.querySelectorAll('${R}').length === 8`);
	t.ok(await p.ev(`app.vault.adapter.exists('.trash/Arrival.md')`), 'Yes: it’s in the vault’s trash, not gone');
	t.eq(await active(p), 'row:Part One/The keeper.md', 'the next row has the focus');
	const tabs = () => p.ev(`(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; })()`);
	const n = await tabs();
	await p.key('Enter', 'ctrl');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Part One/The keeper.md')}`);
	t.eq(await tabs(), n + 1, 'Ctrl+Enter opens the note in a new tab');
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
}));

bug('Alt+Down with several rows selected moves only the focused one', withTidy(async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('ArrowDown', 'shift');
	t.eq(j(await selected(p)), j(['Part One/Arrival.md', 'Part One/The keeper.md']), 'Arrival and The keeper are selected');
	await p.key('ArrowDown', 'alt');
	await p.sleep(400);
	await flush(p);
	t.eq(j((await contents(p)).slice(1, 5)), j(['Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper']), 'both move down past Storm warning, in their order');
}));

bug('ticking Export with the keyboard (Tab, Space) throws the focus to <body>', withTidy(async (p, h, t) => {
	await open(p, 'The Lighthouse', { columns: [{ id: 'export' }] });
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	// (the arrow keys go from a row into its cells; Tab is left to move between the outliner and the rest of the window)
	await p.key('ArrowRight');
	t.ok(await p.ev(`document.activeElement?.matches(${j(cellSel('Part One/Arrival.md', 'export'))})`), 'Right reaches the row’s Export cell');
	await p.key(' ');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}))?.frontmatter?.export === false`);
	await p.sleep(300);
	t.ok(await inOutliner(p), 'the focus is still in the outliner after the tick; it is on: ' + (await active(p)));
}));

bug('“Collapse all” while a note in a folder has the focus leaves the focus on nothing (<body>)', async (p, h, t) => {
	await open(p);
	const k = await nameAt(p, 'Part One/The keeper.md');
	await p.click(k.x, k.y);
	const board = await p.at(O);
	await p.right(board.x, board.t + board.h - 30);
	await clickMenu(p, 'Collapse all');
	await p.sleep(300);
	t.eq(j(await names(p)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'folded');
	t.eq(await active(p), 'row:Part One', 'the focus goes to the folder the note is in');
	t.eq(j(await selected(p)), j(['Part One']), 'which is selected, as the file explorer does');
});

ux('after a click on the empty space below the rows, the arrow keys still move through them', async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	const f = await p.at(`${O} .binders-outliner-foot`);
	await p.click(f.x, f.t + f.h + 16);
	t.eq((await selected(p)).length, 0, 'nothing selected');
	await p.key('ArrowDown');
	t.ok(await inOutliner(p), 'the focus is in the outliner; it is on: ' + (await active(p)));
	t.eq((await selected(p)).length, 1, 'and Down selects a row');
});

ux('Page Down and Page Up move the selection a page at a time', async (p, h, t) => {
	await many(p, 40);
	await open(p);
	const a = await nameAt(p, 'Prologue.md');
	await p.click(a.x, a.y);
	await rawKey(p, 'PageDown', 34);
	const sel = await selected(p);
	t.ok(sel.length === 1 && sel[0] !== 'Prologue.md', 'Page Down selects a row a page further on; selected: ' + sel.join(', '));
});

ux('typing a letter goes to the next row whose title starts with it, as in the file explorer of any desktop', async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Prologue.md');
	await p.click(a.x, a.y);
	await p.key('e');
	await p.sleep(200);
	t.eq(j(await selected(p)), j(['Epilogue.md']), '“e” selects Epilogue');
});

ux('the keyboard can move a row out of its folder (Alt+Left, as Alt+Up and Alt+Down reorder it)', withTidy(async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	// (Alt+Up on a folder's first note does nothing, and says nothing)
	await p.key('ArrowUp', 'alt');
	await p.key('ArrowLeft', 'alt');
	await p.sleep(500);
	await flush(p);
	const list = await contents(p);
	t.ok(list.includes('Arrival') && !list.includes('Part One/Arrival'), 'Arrival is out of Part One: ' + list.join(', '));
}));

ux('Right on a note’s row goes into its cells, so status, target and property cells can be reached without a mouse', async (p, h, t) => {
	await open(p, 'The Lighthouse', { columns: [{ id: 'status' }, { id: 'target' }, { id: 'prop:plotlines' }] });
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('ArrowRight');
	const on = await p.ev(`(() => { const a = document.activeElement; return a?.getAttribute?.('role') === 'gridcell' || (!!a?.closest?.('[role="gridcell"]') && !a.classList.contains('binders-outliner-row')); })()`);
	t.ok(on, 'the focus is on a cell; it is on: ' + (await active(p)));
});

// ---------------------------------------------------------------------------------------------------------------
// Folding, totals, the filter
// ---------------------------------------------------------------------------------------------------------------

test('folding: folders in folders keep their own state; totals add up through every level; an empty folder counts nothing', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Part One/Chapter A'); await app.vault.createFolder('The Lighthouse/Part One/Chapter A/Deep'); await app.vault.create('The Lighthouse/Part One/Chapter A/Deep/Bottom.md', '---\\nstatus: revised\\ntarget: 10\\n---\\none two three four five'); await app.vault.createFolder('The Lighthouse/Empty'); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(800);
	await open(p, 'The Lighthouse', { columns: [{ id: 'words' }, { id: 'target' }, { id: 'progress' }] });
	t.eq(j((await rows(p)).slice(5, 8)), j([['Part One/Chapter A', 2], ['Part One/Chapter A/Deep', 3], ['Part One/Chapter A/Deep/Bottom.md', 4]]), 'three levels deep, each a level further in');
	const indent = await p.ev(`['Part One', 'Part One/Chapter A', 'Part One/Chapter A/Deep', 'Part One/Chapter A/Deep/Bottom.md'].map(n => Math.round(document.querySelector('${R}[data-path="${L}' + n + '"] .binders-outliner-name').getBoundingClientRect().left))`);
	t.ok(indent[1] - indent[0] === indent[2] - indent[1] && indent[2] - indent[1] === indent[3] - indent[2] && indent[1] > indent[0], 'each level is indented by the same step: ' + indent.join(' '));
	t.eq(await cellText(p, 'Part One/Chapter A', 'words'), '5', 'a folder counts the words of the notes under it, however deep');
	t.eq(await cellText(p, 'Part One', 'words'), '56', 'and so does the folder it’s in');
	t.eq(await cellText(p, 'Part One/Chapter A', 'progress'), '50%', '5 of 10 words');
	t.eq(await cellText(p, 'Empty', 'words'), '0', 'an empty folder has no words');
	t.eq(j((await foot(p)).slice(0, 3)), j(['8 notes', '111', '10']), 'the last row: every note, every word, every target');
	await shot(p, 'nested');
	// fold the inner one, then the outer one, then unfold the outer: the inner is still folded
	for (const f of ['Part One/Chapter A', 'Part One', 'Part One']) { const c = await p.at(`${rowSel(f)} .binders-outliner-chevron`); await p.click(c.x, c.y); await p.sleep(250); }
	const shown = await names(p);
	t.ok(shown.includes('Part One/Chapter A') && !shown.includes('Part One/Chapter A/Deep'), 'the inner folder kept its own fold');
	t.eq(await active(p), 'row:Part One', 'the folder just toggled has the focus');
	// with a filter on, a folded folder still shows for what's in it
	const f = await p.at(`.workspace-leaf.mod-active .binders-filter-button`);
	await p.click(f.x, f.y);
	await clickMenu(p, 'Revised');
	await closeMenus(p);
	await p.sleep(300);
	t.eq(j(await names(p)), j(['Part One', 'Part One/Arrival.md', 'Part One/Chapter A']), 'filtered: the revised notes, and the folders they’re in (one of them folded)');
	t.eq((await foot(p))[0], '2 notes', 'the last row counts the notes that pass, in sight or folded away');
	await shot(p, 'filtered');
	t.eq(p.errors.length, 0, 'no errors: ' + p.errors.join(' ; '));
}));

bug('with a filter on, a folder’s words still count the notes that are hidden, so the rows add up to more than the total under them', async (p, h, t) => {
	await open(p);
	const f = await p.at(`.workspace-leaf.mod-active .binders-filter-button`);
	await p.click(f.x, f.y);
	await clickMenu(p, 'Revised');
	await closeMenus(p);
	await p.sleep(300);
	t.eq(j(await names(p)), j(['Part One', 'Part One/Arrival.md']), 'only Arrival passes, in Part One');
	const total = (await foot(p))[3], folder = await cellText(p, 'Part One', 'words');
	t.eq(total, '18', 'the last row counts what shows: Arrival’s 18 words');
	t.eq(folder, total, 'and Part One, which shows only Arrival, counts the same');
});

// ---------------------------------------------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------------------------------------------

test('look: one row height for folders, a hairline between rows, Obsidian’s colors for selection; screenshots of each state', async (p, h, t) => {
	await open(p, 'The Lighthouse', { columns: [{ id: 'label' }, { id: 'status' }, { id: 'words' }, { id: 'target' }, { id: 'progress' }] });
	const m = await p.ev(`(() => { const o = document.querySelector('${O}'), c = (e) => getComputedStyle(e), v = (k) => c(o).getPropertyValue(k).trim(); const th = o.querySelector('.binders-outliner-th[data-col="status"]'), folder = o.querySelector('.binders-outliner-row.is-folder'), cell = o.querySelector('.binders-outliner-row .mod-title'); return { rowVar: v('--bases-table-row-height'), folderH: folder.getBoundingClientRect().height, thH: th.getBoundingClientRect().height, thColor: c(th).color, thFont: c(th).fontSize, headerVar: c(o.querySelector('.binders-outliner-th-name')).color, cellFont: c(cell).fontSize, border: c(th).borderBottomColor, borderW: c(th).borderBottomWidth, bg: c(cell).backgroundColor, primary: c(document.body).backgroundColor }; })()`);
	t.eq(m.folderH, parseFloat(m.rowVar), 'a one-line row is as tall as a base’s row: ' + m.rowVar);
	t.eq(m.thH, parseFloat(m.rowVar), 'and so is the header');
	t.eq(m.borderW, '1px', 'a hairline under the header');
	await shot(p, 'rest');
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	const tint = await p.ev(`getComputedStyle(document.querySelector(${j(rowSel('Part One/Arrival.md') + ' .mod-title')})).backgroundImage`);
	t.ok(/gradient/.test(tint), 'a selected row is tinted: ' + tint);
	await shot(p, 'selected');
	await p.key('ArrowDown');
	await shot(p, 'keyboard-focus');
	const c = await p.at(cellSel('Part One/The keeper.md', 'status'));
	await p.click(c.x, c.y);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.menu .menu-item.mod-checked .menu-item-title')].map(e => e.textContent)`)), j(['Draft']), 'the status menu ticks the row’s status');
	await shot(p, 'status-menu');
	await closeMenus(p);
	await p.right(a.x, a.y);
	await shot(p, 'row-menu');
	await closeMenus(p);
	const th = await thAt(p, 'status');
	await p.click(th.x, th.y);
	await shot(p, 'header-menu');
	await closeMenus(p);
	// mid drag, and 60 ms after letting go
	const w = await p.at(rowSel('Part Two'));
	await p.move(a.x, a.y, 2);
	await press(p, a.x, a.y);
	await p.move(w.x - 200, w.y, 12, { buttons: 1 });
	await p.sleep(200);
	await shot(p, 'drag-into');
	await p.key('Escape');
	await release(p, w.x - 200, w.y);
	t.eq(await leftovers(p), 0, 'nothing left');
});

bug('the keyboard’s focus ring is hidden under the title column: only the part over the other columns shows', async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('ArrowDown');
	await p.sleep(200);
	t.ok(await p.ev(`document.activeElement.matches('.binders-outliner-row:focus-visible')`), 'The keeper has the keyboard’s focus');
	const r = await p.at(rowSel('Part One/The keeper.md')), title = await p.at(`${rowSel('Part One/The keeper.md')} .mod-title`);
	const top = Math.floor(r.t);
	const px = await pixels(p, { x: Math.round(r.l), y: top, width: Math.round(r.w), height: 8 });
	// the first rows of pixels along the row's top edge, over a column and over the title: the ring crosses both
	// (a ring's pixel: far from the row's own tint, which is what the strip ends in; the hairline between rows isn't)
	const strip = (x) => [0, 1, 2, 3, 4, 5, 6, 7].map((y) => px.at(x, y));
	const sum = (c) => c.split(',').reduce((a, v) => a + Number(v), 0);
	const ring = (s) => s.filter((c) => Math.abs(sum(c) - sum(s[7])) > 60 && c !== s[0]).length;
	const beyond = strip(Math.round(title.w) + 50), over = strip(100);
	t.ok(ring(beyond) >= 1, 'a ring shows over the other columns: ' + beyond.join(' | '));
	t.eq(ring(over), ring(beyond), 'and as much of it over the title: ' + over.join(' | '));
});

bug('a long title wraps over several lines instead of ending in an ellipsis (as a property’s text does: “white-space: pre-wrap” wins)', withTidy(async (p, h, t) => {
	const long = 'A very long title that goes on and on and on well past the width of the title column for sure, really it does, on and on and on and on, further and further, without end in sight';
	await p.ev(`(async () => { await app.vault.create(${j(L + long + '.md')}, 'text'); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(600);
	await open(p, 'The Lighthouse', { columns: [{ id: 'prop:plotlines', width: 90 }] });
	await shot(p, 'long-title');
	const m = await p.ev(`(() => { const r = [...document.querySelectorAll('${R}')].find(r => r.dataset.path.includes('A very long')); const n = r.querySelector('.binders-outliner-name'), one = document.querySelector(${j(rowSel('Epilogue.md') + ' .binders-outliner-name')}); const f = document.querySelector(${j(cellSel('Part One/The keeper.md', 'prop:plotlines') + ' .binders-outliner-field')}), f1 = document.querySelector(${j(cellSel('Epilogue.md', 'prop:plotlines') + ' .binders-outliner-field')}); return { name: n.getBoundingClientRect().height, line: one.getBoundingClientRect().height, cut: n.scrollWidth > n.clientWidth, field: f.getBoundingClientRect().height, fieldLine: f1.getBoundingClientRect().height }; })()`);
	t.eq(m.name, m.line, 'a long title takes one line, like any other');
	t.ok(m.cut, 'and is cut short (with an ellipsis)');
	t.eq(m.field, m.fieldLine, 'a property’s text too (“Mara, The keeper’s secret” in a 90 px column)');
}));

bug('the “+” that shows and hides columns has no tooltip (“--no-tooltip” on the table reaches everything in it)', async (p, h, t) => {
	await open(p);
	const plus = await p.at(`${O} .binders-outliner-th.mod-add`);
	await p.move(plus.x - 40, plus.y + 80, 2);
	await p.move(plus.x, plus.y, 6);
	await until(p, `!!document.querySelector('.tooltip')`, 2000);
	t.eq(await p.ev(`document.querySelector('.tooltip')?.textContent ?? null`), 'Columns', 'pointing at it says what it is, as every icon button in Obsidian does');
});

bug('a title in a right-to-left script sits at the far end of the title column, away from the tree it belongs to', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.create('The Lighthouse/Part One/مرحبا بالعالم.md', '---\\nsynopsis: ملخص\\n---\\nنص'); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(600);
	await open(p);
	await shot(p, 'rtl-title');
	const m = await p.ev(`(() => { const r = [...document.querySelectorAll('${R}')].find(r => r.dataset.path.includes('مرحبا')); const n = r.querySelector('.binders-outliner-name'); const rg = document.createRange(); rg.selectNodeContents(n); return { text: Math.round(rg.getBoundingClientRect().left), el: Math.round(n.getBoundingClientRect().left), sibling: Math.round(document.querySelector(${j(rowSel('Part One/Arrival.md') + ' .binders-outliner-name')}).getBoundingClientRect().left) }; })()`);
	t.eq(m.el, m.sibling, 'its row is indented like the notes beside it');
	t.ok(m.text - m.el < 40, `and its title starts at that indent, as in the file explorer (it starts ${m.text - m.el} px further on)`);
}));

// ---------------------------------------------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------------------------------------------

test('accessibility: a treegrid of rows and cells; levels, expanded, selected and sorted are said; every control has a name', async (p, h, t) => {
	await open(p, 'The Lighthouse', { columns: [{ id: 'status' }, { id: 'words' }, { id: 'target' }, { id: 'progress' }, { id: 'export' }] });
	await setFm(p, 'Prologue.md', { target: 42 });
	await until(p, `!!document.querySelector(${j(cellSel('Prologue.md', 'progress') + ' [role="progressbar"]')})`);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	const m = await p.ev(`(() => { const o = document.querySelector('${O}'), table = o.querySelector('[role="treegrid"]'); const rowsEl = [...o.querySelectorAll('.binders-outliner-row')]; const at = (e, k) => e.getAttribute(k); return {
		grid: [at(table, 'aria-label'), at(table, 'aria-multiselectable')],
		head: at(o.querySelector('.binders-outliner-head'), 'role'),
		ths: [...o.querySelectorAll('.binders-outliner-th[data-col]')].every(e => at(e, 'role') === 'columnheader' && at(e, 'aria-sort') === 'none' && at(e, 'aria-label')),
		rows: rowsEl.every(r => at(r, 'role') === 'row' && at(r, 'aria-level') && at(r, 'aria-label') && at(r, 'aria-selected') != null),
		folders: rowsEl.filter(r => r.classList.contains('is-folder')).map(r => at(r, 'aria-expanded')).join(','),
		notes: rowsEl.filter(r => !r.classList.contains('is-folder')).every(r => at(r, 'aria-expanded') == null),
		cells: rowsEl.every(r => [...r.children].every(c => ['gridcell', 'presentation'].includes(at(c, 'role')))),
		selected: rowsEl.filter(r => at(r, 'aria-selected') === 'true').map(r => at(r, 'aria-label')).join(','),
		tabStops: rowsEl.filter(r => at(r, 'tabindex') === '0').length,
		boxes: [...o.querySelectorAll('input[type="checkbox"]')].every(i => at(i, 'aria-label')),
		bar: (() => { const b = o.querySelector('[role="progressbar"]'); return [at(b, 'aria-valuenow'), at(b, 'aria-valuemin'), at(b, 'aria-valuemax'), !!at(b, 'aria-label')]; })(),
		plus: [at(o.querySelector('.mod-add'), 'aria-label'), at(o.querySelector('.mod-add'), 'tabindex')],
	}; })()`);
	t.eq(j(m.grid), j(['Outliner', 'true']), 'a named treegrid where several rows can be selected');
	t.eq(m.head, 'row', 'the header is a row');
	t.ok(m.ths, 'of column headers, each named, each saying whether it sorts');
	t.ok(m.rows, 'every row has a level, a name, and says whether it’s selected');
	t.eq(m.folders, 'true,true', 'folders say they’re open');
	t.ok(m.notes, 'notes don’t claim to fold');
	t.ok(m.cells, 'every cell is a gridcell');
	t.eq(m.selected, 'Arrival', 'the selected row says so');
	t.eq(m.tabStops, 1, 'one row is the tab stop');
	t.ok(m.boxes, 'every tick is named for its note');
	t.eq(j(m.bar), j(['50', '0', '100', true]), 'a progress bar says how far along it is');
	t.eq(j(m.plus), j(['Columns', '0']), 'the “+” is named and reachable');
	const th = await thAt(p, 'words');
	await p.right(th.x, th.y);
	await clickMenu(p, 'Sort descending');
	t.eq(await p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]').getAttribute('aria-sort')`), 'descending', 'a sorted column says which way');
	// keyboard only: to the headers and into a column's menu
	const row = await nameAt(p, 'Part One/Arrival.md');
	await p.click(row.x, row.y);
	await p.ev(`document.querySelector('${O} .binders-outliner-th.mod-title').focus()`);
	await p.key('ArrowRight');
	t.eq(await active(p), 'th:status', 'Right moves along the headers');
	await p.key('Enter');
	await p.sleep(250);
	t.ok((await menuItems(p)).includes('Hide column'), 'Enter opens the column’s menu');
	await p.key('Escape');
	await p.sleep(200);
	await p.key('ArrowRight', 'alt');
	await p.sleep(250);
	t.eq(j((await headers(p)).slice(0, 3)), j(['title', 'words', 'status']), 'Alt+Right moves the column');
	t.eq(await active(p), 'th:status', 'and it keeps the focus');
});

ux('Tab from a row leaves the rows: it doesn’t stop at every other row’s Export tick on the way', async (p, h, t) => {
	await open(p, 'The Lighthouse', { columns: [{ id: 'export' }] });
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('Tab');
	await p.key('Tab');
	const on = await p.ev(`document.activeElement?.closest?.('.binders-outliner-row')?.dataset.path ?? null`);
	t.ok(on == null || on === L + 'Part One/Arrival.md', 'two Tabs on, the focus isn’t in another row; it is in: ' + on);
});

// ---------------------------------------------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------------------------------------------

test('phone: a tap selects, a tap on a status opens its menu, a swipe scrolls, a long press opens the menu or drags, a tap on a title opens the note', async (p, h, t) => {
	const before = await texts(p);
	await onPhone(p, async () => {
		await openView(p);
		await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'status' }, { id: 'words' }] } }; v.setMode('outliner'); return 1; })()`);
		await until(p, `!!document.querySelector('${R}')`);
		await p.sleep(500);
		await shot(p, 'phone');
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		t.ok(await p.ev(`(() => { const v = document.querySelector('.workspace-leaf.mod-active .binders-view'); return v.scrollWidth <= v.clientWidth; })()`), 'nothing sticks out of the view sideways');
		// a swipe scrolls, without dragging or selecting anything
		const a = await p.at(rowSel('Part Two'));
		await touch(p, 'touchStart', a.x, a.y);
		for (let i = 1; i <= 8; i++) { await touch(p, 'touchMove', a.x, a.y - i * 20); await p.sleep(16); }
		t.eq((await dragState(p)).ghost, null, 'a swipe isn’t a drag');
		await touch(p, 'touchEnd');
		await p.sleep(500);
		t.ok(await p.ev(`document.querySelector('${O}').scrollTop`) > 50, 'it scrolls the rows');
		t.eq((await selected(p)).length, 0, 'and selects nothing');
		await flush(p);
		t.eq(j(await contents(p)), j(LIST), 'and moves nothing');
		await p.ev(`(() => { document.querySelector('${O}').scrollTop = 0; return 1; })()`);
		await p.sleep(300);
		const w = await p.at(cellSel('Part One/Arrival.md', 'words'));
		await tap(p, w.x, w.y);
		t.eq(j(await selected(p)), j(['Part One/Arrival.md']), 'a tap on a row selects it');
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'and opens nothing');
		const sc = await p.at(cellSel('Part One/Arrival.md', 'status'));
		await tap(p, sc.x, sc.y);
		t.ok((await menuItems(p)).includes('Revised'), 'a tap on its status opens the statuses');
		await p.key('Escape');
		await p.sleep(400);
		await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`);
		// a long press without moving: the menu
		const k = await p.at(`${rowSel('Part One/The keeper.md')} .binders-outliner-name`);
		await touch(p, 'touchStart', k.x + 50, k.y);
		await p.sleep(650);
		t.eq(await p.ev(`document.querySelectorAll('${R}.is-lifted').length`), 1, 'a held row lifts');
		await touch(p, 'touchEnd');
		await p.sleep(500);
		t.ok((await menuItems(p)).includes('Rename'), 'letting go opens its menu');
		t.eq(j(await selected(p)), j(['Part One/The keeper.md']), 'and selects it');
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'without opening the note');
		await p.key('Escape');
		await p.sleep(400);
		await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`);
		// a long press, then a move: a drag (Storm warning above Prologue, out of Part One)
		const e = await p.at(`${rowSel('Part One/Storm warning.md')} .binders-outliner-name`), pr = await p.at(rowSel('Prologue.md'));
		await touch(p, 'touchStart', e.x + 60, e.y);
		await p.sleep(600);
		for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', e.x + 60, e.y + (pr.t + 5 - e.y) * i / 12); await p.sleep(20); }
		await p.sleep(150);
		const seen = await dragState(p);
		t.eq(seen.hint, 'Move before “Prologue”', 'held, then moved: a drag');
		t.ok(seen.line, 'with its line');
		await shot(p, 'phone-drag');
		await touch(p, 'touchEnd');
		await p.sleep(700);
		await until(p, `app.vault.adapter.exists(${j(L + 'Storm warning.md')})`);
		t.eq(j(await written(p, '  - Storm warning\n  - Prologue')), j(['Storm warning', ...LIST.slice(0, 4), ...LIST.slice(5)]), 'dropped: Storm warning is first');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'no menu after a drag');
		t.eq(await leftovers(p), 0, 'nothing left');
		const nm = await p.at(`${rowSel('Prologue.md')} .binders-outliner-name`);
		await tap(p, nm.x, nm.y);
		await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Prologue.md')}`);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), L + 'Prologue.md', 'a tap on a title opens the note');
	});
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Storm warning.md']: L + 'Storm warning.md' } });
});

ux('phone: a folder folds from a target a finger can hit (its chevron is 18 × 19 px, and a tap just beside it opens the folder instead)', async (p, h, t) => {
	await onPhone(p, async () => {
		await openView(p);
		await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
		await until(p, `!!document.querySelector('${R}')`);
		await p.sleep(500);
		const c = await p.at(`${rowSel('Part One')} .binders-outliner-chevron`);
		// a finger lands a little off: 14 px right of the chevron's middle, 5 px past its edge
		await tap(p, c.x + 14, c.y);
		await p.sleep(400);
		const folder = (await viewState(p))?.folder;
		t.eq(folder, 'The Lighthouse', 'the view is still on the binder, not inside Part One');
		t.ok(c.w >= 40 && c.h >= 40, `the chevron’s target is at least 40 × 40 px (it is ${Math.round(c.w)} × ${Math.round(c.h)})`);
	});
});
