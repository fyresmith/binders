// QA round 11, the emulated phone (390 × 844, and on its side) and tablet (820 × 1180), by touch, away from find and
// paragraphs: a card or title that draws empty (checked in the screenshot's pixels, not only in the DOM), the view's
// More options menu (what it holds, and what each item does), undo and redo of a move from that menu, New and New
// folder, the export window and the snapshots list (opened, and shut, with nothing written), focus mode's way out, a
// manuscript swept through by a finger and typed in far from where it was typed. Obsidian's mobile mode is emulated as
// in specs-qa5-manuscript.mjs (touches over CDP, the keyboard as a shorter viewport). Tests named "qa11 mobile: …" pass
// now; "BUG: qa11 mobile: …" and "NIT: qa11 mobile: …" fail on purpose (each seen in three runs). Every test that writes
// reads the disk afterwards.
//
// QA11_SHOTS=<dir> keeps the screenshots taken for the blank-card checks (default test-dist/qa11-mobile-views).
import { inflateSync } from 'zlib';
import { mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { menuItemsAllTouch } from './menu-routes.mjs';
import { VIEW, closeMenus, contents, exists, j, menuItems, openView, until, withTidy } from './view-helpers.mjs';
import { LEAF, PHONE, TABLET, binder, dialogs, disk, metrics, notices, onDevice, swipe, tap, tapText, hold, touch, menuTap, keys, openMs, saveAll, snap } from './specs-qa5-manuscript.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 mobile: ' + name, fn: withTidy(fn) });
const bug = (name, fn) => specs.push({ name: 'BUG: qa11 mobile: ' + name, fn: withTidy(fn) });
const on = (size, fn) => async (p, h, t) => { await onDevice(p, size, () => fn(p, h, t)); };

const OUT = process.env.QA11_SHOTS || 'test-dist/qa11-mobile-views';
mkdirSync(OUT, { recursive: true });
let shots = 0;

// ---- a sample of notes ----
/** `n` scenes of `paras` paragraphs each, with a synopsis and a status. */
const scenes = (n, paras = 1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [
	`Scene ${String(i + 1).padStart(2, '0')}`,
	`---\nstatus: ${i % 2 ? 'draft' : 'idea'}\nsynopsis: Scene ${i + 1}, in which the keeper keeps the light.\n---\n` +
		Array.from({ length: paras }, (_, k) => `Scene ${i + 1} paragraph ${k + 1}. The sea came up the rocks and the light turned over it, and the keeper wrote it down.`).join('\n\n') + '\n',
]));
const NOVEL = 'Novel/Novel.md';
const sceneAt = (i) => `Novel/Scene ${String(i).padStart(2, '0')}.md`;

// ---- helpers ----
/** Where the view is: the mode on, the corkboard, outliner or manuscript, for a moment to draw. */
const mode = async (p, m) => { await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`); await p.sleep(800); };
/** The view's "More options" (Obsidian's button in the view's header). */
const more = async (p) => {
	const sel = `${LEAF} [aria-label="More options"]`;
	const covered = () => p.ev(`(() => { const b = document.querySelector(${j(sel)}); if (!b) return 'none'; const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return at && (b.contains(at) || at.contains(b)) ? 'ok' : 'covered'; })()`);
	let st = 'none';
	for (let i = 0; i < 60 && st !== 'ok'; i++) { st = await covered(); if (st !== 'ok') await p.sleep(100); }
	if (st !== 'ok') throw new Error('More options is not there to tap: ' + st);
	const a = await p.at(sel);
	await tap(p, a.x, a.y, 400);
};
/** The menu's item with the text starting so, or null (an undo or redo names the move, so only its start is known). */
const itemStarting = async (p, start) => (await menuItems(p)).find((x) => x.startsWith(start)) ?? null;
/** Do these appear in the list, in this order (other items may be between them)? */
const inOrder = (list, want) => { let i = 0; for (const x of list) if (x === want[i]) i++; return i === want.length; };

/** What is in sight of the view: the elements matching `sel` (under the view) that are at least a little way in the
    screen's part the view covers (below its header and toolbar, above Obsidian's bar at the foot), and not under
    something else (a drawer, a menu). Each has its text and the rectangle it shows in. */
const VISIBLE = (sel) => `(() => {
	const edge = Math.max(0, ...[...document.querySelectorAll(${j(`${LEAF} .view-header, ${LEAF} .binders-toolbar`)})].map(e => e.getBoundingClientRect().bottom));
	const nav = document.querySelector('.mobile-navbar')?.getBoundingClientRect();
	const bottom = nav && nav.height > 0 && nav.top > edge + 100 ? Math.min(innerHeight, nav.top) : innerHeight;
	const out = [];
	for (const e of document.querySelectorAll(${j(`${LEAF} ${sel}`)})) {
		const r = e.getBoundingClientRect();
		const l = Math.max(r.left, 0), t = Math.max(r.top, edge), rr = Math.min(r.right, innerWidth), b = Math.min(r.bottom, bottom);
		if (rr - l < 12 || b - t < 12) continue;
		// (a title cut off by the screen's edge to under two thirds of its height has too little of its text in sight to count its ink)
		if (r.height <= 60 && b - t < r.height * 0.65) continue;
		const at = document.elementFromPoint((l + rr) / 2, (t + b) / 2);
		if (!at || !(e.contains(at) || at.contains(e))) continue;
		out.push({ text: (e.textContent || '').trim().slice(0, 40), rect: [Math.round(l), Math.round(t), Math.round(rr - l), Math.round(b - t)] });
	}
	return out;
})()`;

// Counts the pixels in each rectangle that differ from the rectangle's commonest colour by more than a little: a
// title drawn in its card has some, an empty card has none. (The PNG is decoded here, in node, so the test needs no
// imaging library on the machine, as GitHub's runners have none.)
function decodePng(buf) {
	const idat = [];
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
	return { w, h, bpp, stride, out };
}
function inkIn(img, rects) {
	return rects.map(([x, y, w, ht]) => {
		const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(img.w, Math.floor(x + w)), y0 = Math.max(0, Math.floor(y)), y1 = Math.min(img.h, Math.floor(y + ht));
		if (x1 <= x0 || y1 <= y0) return -1;
		const px = [], count = new Map();
		for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
			const o = j * img.stride + i * img.bpp, key = (img.out[o] << 16) | (img.out[o + 1] << 8) | img.out[o + 2];
			px.push(key); count.set(key, (count.get(key) || 0) + 1);
		}
		let bg = 0, best = -1;
		for (const [k, n] of count) if (n > best) { best = n; bg = k; }
		const br = bg >> 16, bgc = (bg >> 8) & 255, bb = bg & 255;
		return px.reduce((n, k) => n + (Math.abs((k >> 16) - br) + Math.abs(((k >> 8) & 255) - bgc) + Math.abs((k & 255) - bb) > 60 ? 1 : 0), 0);
	});
}
const INK_MIN = 25; // pixels: a title of a few words is a hundred or more

/** The screen as it is now, and what is drawn in each of the elements `sel` in sight. Returns the ones that draw nothing
    (no text, or no ink in their rectangle), and how many were looked at. */
async function blankIn(p, sel, label) {
	for (let i = 0; i < 20 && (await p.ev(`document.querySelectorAll('.menu, .modal-container').length`)); i++) await p.sleep(100);
	await p.sleep(150);
	const rows = await p.ev(VISIBLE(sel));
	const png = join(OUT, `${label.replace(/[^\w]+/g, '-')}-${++shots}.png`);
	await p.shot(png);
	let ink = [];
	if (rows.length) ink = inkIn(decodePng(readFileSync(png)), rows.map((r) => r.rect));
	const blank = [];
	rows.forEach((r, i) => { if (!r.text || ink[i] < INK_MIN) blank.push(`${r.text || '(no text)'} [${r.rect.join(',')}] ink ${ink[i]}`); });
	if (process.env.QA11_LOG) console.log(`      ${label}: ${rows.length} in sight, ink ${JSON.stringify(ink.slice(0, 8))}`);
	return { seen: rows.length, blank };
}
/** Asserts that nothing in sight is blank, and says how many were looked at. */
async function drawn(t, p, sel, label) {
	const { seen, blank } = await blankIn(p, sel, label);
	t.ok(seen > 0, `${label}: something in sight to look at (${seen})`);
	t.ok(blank.length === 0, `${label}: every one in sight is drawn (${seen} looked at): ${blank.slice(0, 4).join(' | ')}`);
	return seen;
}

// =====================================================================================================================
// The blank card: the corkboard on a phone
// =====================================================================================================================

test('the corkboard on a phone draws every card in sight, at the top and after each swipe down and back up through forty cards', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(40));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length >= 40`, 8000);
	await p.sleep(800);
	await drawn(t, p, '.binders-card-title', 'top');
	for (let k = 1; k <= 7; k++) { await swipe(p, 200, 640, 200, 240, 8, 350); await drawn(t, p, '.binders-card-title', `down ${k}`); }
	// (a finger moving down while the board is at its top is Obsidian's pull-down gesture, which opens the command palette over it)
	const atTop = () => p.ev(`(() => { let e = document.querySelector('${LEAF} .binders-card[data-path]'); while (e && e.scrollHeight <= e.clientHeight + 1) e = e.parentElement; return !e || e.scrollTop <= 0; })()`);
	for (let k = 1; k <= 7; k++) {
		if (await atTop()) break;
		await swipe(p, 200, 240, 200, 640, 8, 350);
		await drawn(t, p, '.binders-card-title', `up ${k}`);
	}
}));

test('the corkboard on a phone turned on its side and back, and redrawn on each turn: every card in sight is drawn each time', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(20));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length >= 20`, 8000);
	await p.sleep(600);
	await drawn(t, p, '.binders-card-title', 'portrait');
	await metrics(p, 844, 390); await p.sleep(900);
	await drawn(t, p, '.binders-card-title', 'on its side');
	await p.ev(`app.workspace.trigger('resize')`); await p.sleep(500);
	await drawn(t, p, '.binders-card-title', 'on its side, redrawn');
	await swipe(p, 300, 300, 300, 120, 6, 400);
	await drawn(t, p, '.binders-card-title', 'on its side, scrolled');
	await metrics(p, 390, 844); await p.sleep(900);
	await drawn(t, p, '.binders-card-title', 'back up');
	await p.ev(`app.workspace.trigger('resize')`); await p.sleep(500);
	await drawn(t, p, '.binders-card-title', 'back up, redrawn');
}));

test('the corkboard after the app is sent to the background and brought back, and after the file drawer is opened and shut: every card in sight is drawn', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(12));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length >= 12`, 8000);
	await p.sleep(600);
	await p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); return 1; })()`);
	await p.sleep(1200);
	await p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); return 1; })()`);
	await p.sleep(900);
	await drawn(t, p, '.binders-card-title', 'back from the background');
	await p.ev(`app.workspace.leftSplit.expand()`); await p.sleep(800);
	t.ok(await p.ev(`!app.workspace.leftSplit.collapsed`), 'the file drawer is open');
	await p.ev(`app.workspace.leftSplit.collapse()`); await p.sleep(800);
	await drawn(t, p, '.binders-card-title', 'drawer shut');
}));

// =====================================================================================================================
// The blank title: the tablet's three modes, switched from the More options menu
// =====================================================================================================================

test('the tablet switches mode from the toolbar’s mode button (corkboard, outliner, manuscript, and back): each mode draws every title in sight', on(TABLET, async (p, h, t) => {
	await binder(p, 'Novel', scenes(14, 2));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length >= 14`, 8000);
	const steps = [['Outliner', '.binders-outliner-cell.mod-title'], ['Manuscript', '.binders-manuscript-title'], ['Corkboard', '.binders-card-title'], ['Outliner', '.binders-outliner-cell.mod-title']];
	for (const [name, sel] of steps) {
		const b = await p.at(`${LEAF} .binders-mode-button`);
		await tap(p, b.x, b.y, 400);
		t.ok(await menuTap(p, name), `“${name}” is in the toolbar’s mode menu`);
		await p.sleep(900);
		t.ok(await p.ev(`${VIEW}.mode === ${j(name.toLowerCase())}`), `the view is on ${name}`);
		await drawn(t, p, sel, name);
	}
}));

// =====================================================================================================================
// More options: what it holds, and what each item does (phone)
// =====================================================================================================================

test('the view’s More options on a phone lists Find, Export..., Show contents and Open binder note, in that order, and not the modes (the toolbar’s); Show contents and Open binder note do what they say', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(4));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await more(p);
	const items = await menuItems(p);
	const want = ['Find in binder', 'Export...', 'Show contents', 'Open binder note'];
	t.ok(inOrder(items, want), `the items, in order: ${items.join(', ')}`);
	t.ok(!items.some((x) => ['Corkboard', 'Outliner', 'Manuscript', 'Timeline'].includes(x)), `the modes are not in it: ${items.join(', ')}`);
	await menuTap(p, 'Show contents');
	await p.sleep(900);
	t.ok(await p.ev(`!!document.querySelector('.binders-contents')`), 'Show contents opens the contents in the drawer');
	await p.ev(`app.workspace.rightSplit?.collapse?.(); app.workspace.leftSplit?.collapse?.()`); await p.sleep(500);
	await openView(p, 'Novel');
	await more(p);
	t.ok(await menuTap(p, 'Open binder note'), 'Open binder note is tapped');
	await p.sleep(900);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), NOVEL, 'the binder note is the note in front');
}));

test('More options, on a phone, has Take a snapshot and Show snapshots..., and both do what they say with nothing else written', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(4));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await p.sleep(300);
	const before = snap(p);
	await more(p);
	const items = await menuItemsAllTouch(p, tap); // (they are in the Snapshots drawer)
	t.ok(items.includes('Snapshots') && items.includes('Take a snapshot') && items.includes('Show snapshots...'), 'the Snapshots drawer, and the snapshot items in it: ' + items.join(', '));
	t.ok(await menuTap(p, 'Take a snapshot'), 'Take a snapshot is tapped');
	await p.sleep(1200);
	const taken = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('Novel/Snapshots/')).map(f => f.path)`);
	t.ok(taken.length >= 1, 'a snapshot of the folder is on disk: ' + j(taken));
	await more(p);
	t.ok(await menuTap(p, 'Show snapshots...'), 'Show snapshots... is tapped');
	await p.sleep(900);
	const modal = await p.ev(`(() => { const m = document.querySelector('.modal'); if (!m) return null; const r = m.getBoundingClientRect(); return { inside: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, text: m.textContent.slice(0, 80) }; })()`);
	t.ok(modal, 'the snapshots list is open');
	t.ok(modal?.inside, 'and fits the screen: ' + j(modal));
	const x = await p.at('.modal .modal-close-button');
	if (x) await tap(p, x.x, x.y, 500); else await p.key('Escape');
	await p.sleep(400);
	t.ok(!(await p.ev(`document.querySelectorAll('.modal-container').length`)), 'the list shuts');
	const after = snap(p);
	const changed = Object.keys(after).filter((k) => !(k in before) || before[k] !== after[k]);
	t.ok(changed.every((k) => k.startsWith('Novel/Snapshots/')), 'only the snapshot file is new on disk: ' + j(changed));
}));

// =====================================================================================================================
// Undo and redo of a move, from More options
// =====================================================================================================================

test('a card dragged on a phone is taken back from More options as “Undo: …” (the order on disk is what it was) and made again by “Redo: …”', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(5));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length >= 5`, 8000);
	await p.sleep(500);
	const original = await contents(p, NOVEL);
	// (the last card may be below the fold when the type is wider, as on a runner: both are scrolled into the middle of the view, where a finger can reach them, before they are measured)
	const first = `${LEAF} .binders-card[data-path="${sceneAt(1)}"]`, last = `${LEAF} .binders-card[data-path="${sceneAt(5)}"]`;
	await p.ev(`document.querySelector('${last}')?.scrollIntoView({ block: 'end' })`);
	await p.sleep(300);
	const from = await p.at(last), to = await p.at(first);
	const view = await p.ev(`({ h: innerHeight, top: document.elementFromPoint(${from?.x ?? 0}, ${from?.y ?? 0})?.closest('.binders-card')?.dataset.path ?? null, first: document.querySelector('${first}')?.getBoundingClientRect().top })`);
	t.ok(from && to && to.y > 0 && from.y < view.h, `both cards are in sight (view ${view.h} high, last card at ${Math.round(from?.y)}, first at ${Math.round(to?.y)})`);
	t.eq(view.top, sceneAt(5), 'a finger on the last card’s middle touches that card');
	// (held until the card is lifted, not for a fixed time: on a slow machine the page may take the press late, and a finger that moves before the card is lifted is a swipe)
	await touch(p, 'touchStart', from.x, from.y);
	t.ok(await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path="${sceneAt(5)}"].is-lifted')`, 8000), 'the card is lifted by the press');
	// (a frame and more for each step, a rest over the place before letting go, and the order waited for on disk, not slept for: a slow machine takes each of them late)
	for (let i = 1; i <= 12; i++) { await touch(p, 'touchMove', from.x + (to.x - 30 - from.x) * i / 12, from.y + (to.y - from.y) * i / 12); await p.sleep(50); }
	await p.sleep(500);
	await touch(p, 'touchEnd');
	let moved = await contents(p, NOVEL);
	for (let i = 0; i < 40 && moved.join() === original.join(); i++) { await p.sleep(200); moved = await contents(p, NOVEL); }
	await p.sleep(300);
	t.ok(moved.join() !== original.join(), `the card moved on disk: ${moved.join(', ')}`);
	await more(p);
	const undo = await itemStarting(p, 'Undo: ');
	t.ok(undo, 'More options offers “Undo: …”: ' + (await menuItems(p)).join(', '));
	t.ok(undo && /Scene 05/.test(undo), 'and says which move it takes back: ' + undo);
	t.ok(undo && (await menuTap(p, undo)), 'the undo is tapped');
	await p.sleep(1200);
	t.eq((await contents(p, NOVEL)).join(), original.join(), 'the order on disk is what it was');
	await more(p);
	const redo = await itemStarting(p, 'Redo: ');
	t.ok(redo, 'after the undo, More options offers “Redo: …”: ' + (await menuItems(p)).join(', '));
	t.ok(redo && (await menuTap(p, redo)), 'the redo is tapped');
	await p.sleep(1200);
	t.eq((await contents(p, NOVEL)).join(), moved.join(), 'the move is made again on disk');
	await drawn(t, p, '.binders-card-title', 'after the redo');
}));

test('on a tablet an outliner row moved from its menu is taken back from More options, and the notes’ text is untouched', on(TABLET, async (p, h, t) => {
	await binder(p, 'Novel', scenes(4, 2));
	await openView(p, 'Novel');
	await mode(p, 'outliner');
	await until(p, `document.querySelectorAll('${LEAF} .binders-outliner-row').length >= 4`, 8000);
	await p.sleep(400);
	const text = await snap(p);
	const original = await contents(p, NOVEL);
	const row = await p.at(`${LEAF} .binders-outliner-row[data-path="${sceneAt(1)}"] .binders-outliner-cell.mod-title`);
	t.ok(row, 'the first row is in sight');
	await hold(p, row.x, row.y, 700);
	t.ok(await menuTap(p, 'Move'), 'the row’s menu has Move (a tablet’s shorter menu)');
	await p.sleep(400);
	t.ok(await menuTap(p, 'Move down'), '“Move down” is tapped in Move');
	await p.sleep(1000);
	const moved = await contents(p, NOVEL);
	t.ok(moved.join() !== original.join(), 'the row moved on disk: ' + moved.join(', '));
	await more(p);
	const undo = await itemStarting(p, 'Undo: ');
	t.ok(undo && (await menuTap(p, undo)), 'More options has an undo, and it is tapped: ' + undo);
	await p.sleep(1200);
	t.eq((await contents(p, NOVEL)).join(), original.join(), 'the order on disk is what it was');
	const after = snap(p);
	const notes = Object.keys(text).filter((k) => /\/Scene \d+\.md$/.test(k));
	t.ok(notes.every((k) => after[k] === text[k]), 'every scene is byte for byte what it was');
}));

// =====================================================================================================================
// New, New folder, and a double tap on the New note tile
// =====================================================================================================================

test('New, then New folder, on a phone: the folder is made in the binder on disk, taking the name typed, and the binder lists it', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(3));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	const add = await p.at(`${LEAF} .binders-new-button`);
	t.ok(add, 'the New button is in the toolbar');
	await tap(p, add.x, add.y, 400);
	t.ok(await menuTap(p, 'New folder'), 'New has New folder');
	await p.sleep(900);
	t.ok(await p.ev(`!!document.querySelector('${LEAF} input.binders-edit-field')`), 'the new folder’s name is ready to type');
	await keys(p, 'Part Two');
	await keys(p, '\n');
	await p.sleep(1200);
	await saveAll(p);
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath('Novel/Part Two') && !app.vault.getAbstractFileByPath('Novel/Untitled')`), 'the folder is on disk under the name typed');
	const list = await contents(p, NOVEL);
	t.ok(list.includes('Part Two/'), 'the binder lists it, last: ' + list.join(', '));
}));

test('a double tap on “New note” in the New menu on a phone makes one note, not two, and the title typed goes to it', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(3));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await p.sleep(500);
	const before = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('Novel/')).length`);
	const add = await p.at(`${LEAF} .binders-new-button`);
	t.ok(add, 'the New button is in the toolbar');
	await tap(p, add.x, add.y, 400);
	const item = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'New note'); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	t.ok(item, 'the New menu has New note');
	// (the second tap comes before the menu has gone: it lands on the item or on whatever is under it, and makes nothing)
	await touch(p, 'touchStart', item.x, item.y); await p.sleep(40); await touch(p, 'touchEnd');
	await p.sleep(90);
	await touch(p, 'touchStart', item.x, item.y); await p.sleep(40); await touch(p, 'touchEnd');
	await p.sleep(900);
	// (the second tap can land on the board and so end the new note's naming at once, as any tap elsewhere does: the
	// note is then kept as Untitled; if the field is still open, what is typed goes to it)
	if (await p.ev(`!!document.querySelector('${LEAF} input.binders-edit-field')`)) { await keys(p, 'Double'); await keys(p, '\n'); }
	await p.sleep(1200);
	await saveAll(p);
	const made = await p.ev(`app.vault.getFiles().filter(f => f.path.startsWith('Novel/')).map(f => f.path)`);
	const fresh = made.filter((x) => !/Scene|Novel\/Novel/.test(x));
	t.eq(made.length - before, 1, 'exactly one note was made: ' + fresh.join(', '));
	t.ok(fresh.length === 1 && /^Novel\/(Double|Untitled)\.md$/.test(fresh[0]), 'and it is the new note, called what was typed or kept as Untitled: ' + fresh.join(', '));
}));

// =====================================================================================================================
// The export window and the focus mode's way out, by touch
// =====================================================================================================================

test('the export window on a phone opens from More options, fits the screen, and shuts with nothing written and no Exports folder', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(4, 2));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	const before = snap(p);
	await more(p);
	t.ok(await menuTap(p, 'Export...'), 'Export... is tapped');
	await p.sleep(900);
	const m = await p.ev(`(() => { const m = document.querySelector('.modal'); if (!m) return null; const r = m.getBoundingClientRect(); const bs = [...m.querySelectorAll('button')].map(b => { const q = b.getBoundingClientRect(); return { t: b.textContent.trim(), inside: q.left >= -1 && q.right <= innerWidth + 1 && q.bottom <= innerHeight + 1 }; }); return { fits: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, buttons: bs }; })()`);
	t.ok(m, 'the export window is open');
	t.ok(m?.fits, 'and fits the screen: ' + j(m));
	t.ok(await p.ev(`(() => { const s = [...document.querySelectorAll('.modal .binders-export-side')][0]; if (!s) return false; s.scrollTop = s.scrollHeight; return true; })()`), 'the window scrolls');
	const x = await p.at('.modal .modal-close-button');
	if (x) await tap(p, x.x, x.y, 500); else await p.key('Escape');
	await p.sleep(500);
	t.ok(!(await p.ev(`document.querySelectorAll('.modal-container').length`)), 'the window shuts');
	t.ok(!(await exists(p, 'Exports')), 'no Exports folder was made');
	const after = snap(p);
	const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
	t.ok(!changed.length, 'nothing on disk changed: ' + j(changed));
}));

const focusOn = async (p, t) => {
	await openMs(p, 'Novel');
	const b = await p.at(`${LEAF} .binders-focus-button`);
	t.ok(b, 'the focus button is in the manuscript');
	await tap(p, b.x, b.y, 1200);
	t.ok(await p.ev(`document.body.classList.contains('binders-focus')`), 'focus mode is on');
};

test('focus mode on a phone: typed words go to the note, a tap on the way out leaves it, and the words are on disk', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(3, 2));
	await focusOn(p, t);
	await tapText(p, sceneAt(1), 'paragraph 1', 3, 900);
	await keys(p, 'Focus line one. ');
	await saveAll(p);
	const leave = await p.at('.binders-focus-leave');
	t.ok(leave, 'the way out is on the screen');
	await tap(p, leave.x, leave.y, 900);
	t.ok(!(await p.ev(`document.body.classList.contains('binders-focus')`)), 'a tap on the way out leaves focus mode');
	await saveAll(p);
	t.ok((await disk(p, sceneAt(1))).includes('Focus line one. '), 'the words typed in focus mode are in the note on disk');
}));

test('focus mode on a phone: the way out’s menu (Typewriter scrolling, Leave focus mode, …) is opened by a press and hold on it, as the docs say', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(3, 2));
	await focusOn(p, t);
	const leave = await p.at('.binders-focus-leave');
	await hold(p, leave.x, leave.y, 700);
	const items = await menuItems(p);
	t.ok(items.includes('Leave focus mode'), 'holding the way out opens a menu with Leave focus mode: ' + j(items));
	await closeMenus(p);
}));

test('focus mode on a phone: the way out’s menu opens when the press comes as a context menu event (what a desktop right click sends)', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(3, 2));
	await focusOn(p, t);
	await p.ev(`(() => { const e = document.querySelector('.binders-focus-leave'); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5, button: 0 })); return 1; })()`);
	await p.sleep(500);
	const items = await menuItems(p);
	t.ok(items.includes('Leave focus mode'), 'the menu has Leave focus mode: ' + j(items));
	await closeMenus(p);
	await p.sleep(300);
	t.ok(await p.ev(`document.body.classList.contains('binders-focus')`), 'and closing the menu keeps focus mode on');
}));

// =====================================================================================================================
// The manuscript, by finger: swept through, and typed in far from where it was typed
// =====================================================================================================================

specs.push({ name: 'qa11 mobile: on a phone the export window shows its Preview and Export buttons without a scroll (they are below the fold of the sheet at 390 × 844)', fn: withTidy(on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(3, 2));
	await openView(p, 'Novel');
	await mode(p, 'corkboard');
	await more(p);
	await menuTap(p, 'Export...');
	await p.sleep(900);
	const below = await p.ev(`[...document.querySelectorAll('.modal button')].filter(b => ['Preview', 'Export'].includes(b.textContent.trim()) && b.getBoundingClientRect().bottom > innerHeight).map(b => b.textContent.trim())`);
	await closeMenus(p);
	t.ok(!below.length, 'the buttons below the window’s foot, without a scroll: ' + j(below));
})) });

test('the manuscript on a phone, swept through by a finger, draws every section in sight (titles and text) at each step', on(PHONE, async (p, h, t) => {
	await binder(p, 'Novel', scenes(25, 3));
	await openMs(p, 'Novel');
	await drawn(t, p, '.binders-manuscript-title', 'manuscript top titles');
	for (let k = 1; k <= 9; k++) {
		await swipe(p, 200, 640, 200, 220, 8, 400);
		await drawn(t, p, '.binders-manuscript-title', `sweep ${k} titles`);
		await drawn(t, p, '.binders-manuscript-rendered p, .binders-manuscript-scene .cm-line', `sweep ${k} text`);
	}
}));

// (The palette that once came "after the fourth swipe up" was Obsidian's own pull-down gesture: a finger moving down
// while the page is already at its top opens the command palette, as in any note. The sweep stops at the top.)
test('the manuscript on a tablet, swept by a finger up and down through twenty sections, opens no palette while the page is scrolled (a pull down from its top is Obsidian’s own gesture)', on(TABLET, async (p, h, t) => {
	await binder(p, 'Novel', scenes(20, 2));
	await openMs(p, 'Novel');
	await tapText(p, sceneAt(2), 'paragraph 1', 3, 900);
	await p.sleep(300);
	const opened = [];
	for (let k = 0; k < 8; k++) await swipe(p, 400, 1000, 400, 300, 10, 300);
	t.ok((await p.ev(`${VIEW}.current.root.scrollTop`)) > 0, 'the page has been swept down');
	for (let k = 0; k < 10; k++) {
		const top = await p.ev(`Math.round(${VIEW}.current.root.scrollTop)`);
		if (top <= 0) break; // at the top a pull down is Obsidian's pull-down gesture, which opens the palette
		await swipe(p, 400, 300, 400, 1000, 10, 300);
		if (await p.ev(`!!document.querySelector('.prompt')`)) { opened.push(`after swipe ${k + 1} up (scrolled ${top} before it)`); break; }
	}
	t.ok(!opened.length, 'no palette is brought up by the sweep: ' + opened.join(', '));
	if (await p.ev(`!!document.querySelector('.prompt')`)) await p.key('Escape');
}));

test('the manuscript on a tablet: typed in one section, swept far away and typed in another, then swept back: each lands once in its own note on disk', on(TABLET, async (p, h, t) => {
	await binder(p, 'Novel', scenes(20, 2));
	await openMs(p, 'Novel');
	await tapText(p, sceneAt(2), 'paragraph 1', 3, 900);
	await keys(p, 'Typed far away. ');
	await p.sleep(300);
	for (let k = 0; k < 8; k++) await swipe(p, 400, 1000, 400, 300, 10, 300);
	await p.sleep(500);
	await tapText(p, sceneAt(20), 'paragraph 2', 3, 900);
	await keys(p, 'Typed later. ');
	await p.sleep(300);
	for (let k = 0; k < 10; k++) await swipe(p, 400, 300, 400, 1000, 10, 300);
	// (see the BUG test above: a palette that a sweep brings up is shut here, so this test checks what it is for)
	if (await p.ev(`!!document.querySelector('.prompt')`)) await p.key('Escape');
	await p.sleep(600);
	await saveAll(p);
	const two = await disk(p, sceneAt(2)), twenty = await disk(p, sceneAt(20));
	t.eq(two.split('Typed far away. ').length - 1, 1, 'the first typing is in Scene 02, once');
	t.eq(twenty.split('Typed later. ').length - 1, 1, 'the second typing is in Scene 20, once');
	t.ok(!twenty.includes('Typed far away.') && !two.includes('Typed later.'), 'and nowhere else');
	t.ok(await drawn(t, p, '.binders-manuscript-title', 'back at the top') > 0, 'the sections are drawn again at the top');
}));


