// QA round 2 on the corkboard (src/view/corkboard.ts, edit.ts, the toolbar in BinderView.ts): the rewritten drag (ghost,
// slot, insertion line, glide), the toolbar, focus and keyboard, narrow panes, touch, and a big board. Tests named
// "BUG:" fail on purpose: each is a confirmed bug (see the QA report); the rest passed and pin down what is solid.
import { B, NOTE, PL, VIEW, card, cards, closeMenus, contents, exists, file, flush, j, openView, selected, texts, same, until, viewState, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa2 corkboard: ' + name, fn });

const L = 'The Lighthouse/';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const LEAF = '.workspace-leaf.mod-active';
const at = (p, path) => p.at(card(L + path));
const press = (p, x, y) => p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
const letGo = (p, x, y) => p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
/** Press on a card and move away with the button held: the drag stays open until `letGo`. */
async function hold(p, from, to, steps = 12) {
	await p.move(from.x, from.y, 2);
	await press(p, from.x, from.y);
	await p.move(to.x, to.y, steps, { buttons: 1 });
	await p.sleep(150);
}
const rectOf = (p, sel) => p.ev(`(() => { const r = document.querySelector(${j(sel)})?.getBoundingClientRect(); return r ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } : null; })()`);
const line = (p) => rectOf(p, '.binders-drop-indicator.is-active');
const leftovers = (p) => p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .binders-card.is-dragging, .binders-card.is-landing, .binders-group.is-drop-target, .is-being-dragged-over').length + (document.body.classList.contains('is-grabbing') ? 1 : 0)`);
const active = (p) => p.ev(`(() => { const a = document.activeElement; return a ? (a.dataset?.path ?? '') + '<' + a.tagName + '.' + String(a.className).split(' ').slice(0, 2).join('.') + '>' : null; })()`);
const scrollTop = (p) => p.ev(`document.querySelector('${LEAF} .binders-corkboard').scrollTop`);
const names = async (p) => (await cards(p)).map((x) => x.replace(L, '').replace(/\.md$/, ''));
const size = (p, width, height = p.height) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
/** A narrow window with the sidebar closed, put back afterwards. */
async function narrow(p, width, fn) {
	await p.ev(`app.workspace.leftSplit.collapse()`);
	await size(p, width);
	await p.sleep(400);
	try { await fn(); } finally { await size(p, p.width); await p.ev(`app.workspace.leftSplit.expand()`); await p.sleep(300); }
}
/** A folder of `n` notes with synopses of very different lengths, so rows differ in height. */
async function bigFolder(p, name, n) {
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + name)}); for (let i = 0; i < ${n}; i++) { const s = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do. '.repeat(i % 6).trim(); await app.vault.create(${j(L + name)} + '/Scene ' + String(i).padStart(3, '0') + '.md', '---\\n' + (s ? 'synopsis: ' + s + '\\n' : '') + (i % 3 ? 'status: draft\\n' : '') + '---\\n' + 'word '.repeat(10 + i)); } })().then(() => 1)`);
	await p.sleep(1200);
}

// ---- confirmed bugs (these fail) ----

test('BUG: a card dropped on the “New note” tile, when the tile has wrapped onto its own row, goes to the board’s end', withTidy(async (p, h, t) => {
	// a fourth note in Part One fills its row of four, so the "New note" tile sits alone on the next row
	await p.ev(`app.vault.create(${j(L + 'Part One/Fourth.md')}, 'four words are here').then(() => 1)`);
	await p.sleep(700);
	await openView(p, L + 'Part One');
	const tile = await p.at(`${LEAF} .binders-card-new`), last = await at(p, 'Part One/Fourth.md'), e = await at(p, 'Part One/Arrival.md');
	t.ok(tile.t > last.t + last.h - 1, `the tile is on a row of its own (${j(tile)} under ${j(last)})`);
	await hold(p, { x: e.x, y: e.t + 12 }, { x: tile.x, y: tile.y });
	const mark = await line(p);
	await letGo(p, tile.x, tile.y);
	await p.sleep(600);
	t.eq(j(await names(p)), j(['Part One/The keeper', 'Part One/Storm warning', 'Part One/Fourth', 'Part One/Arrival']), `dropped on the tile after the last card, it is last (the line was at ${j(mark)}, the pointer at ${j({ x: tile.x, y: tile.y })})`);
	await flush(p);
	t.eq(j((await contents(p)).slice(1, 6)), j(['Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Fourth', 'Part One/Arrival']), 'and in the binder’s list');
}));

test('BUG: an insertion line shows only where letting go moves the card (not just outside the pane, not over the toolbar)', withTidy(async (p, h, t) => {
	// The line is drawn from the pointer's place among the cards alone (dropAt), but a drop counts only inside the
	// scroller, and what the scroller is depends on whether the board overflows: so the two disagree.
	const tryAt = async (where, grab, x, y) => {
		const before = j(await contents(p));
		await hold(p, grab, { x, y });
		const mark = await line(p);
		await letGo(p, x, y);
		await p.sleep(500);
		await flush(p);
		const moved = j(await contents(p)) !== before;
		t.eq(await leftovers(p), 0, `${where}: nothing of the drag is left`);
		return { where, line: !!mark, moved };
	};
	const out = [];
	// a short board (nothing to scroll): a few pixels left of the pane, the card itself still mostly over the board.
	// That's the sidebar: since a card dragged out of the view is a file (specs-card-file-drag.mjs), the drag there is
	// Obsidian's, with no line on the board, and what a drop does is the file explorer's to say. Brought back to its
	// own place and let go, nothing has moved.
	await openView(p, L + 'Part One');
	let s = await at(p, 'Part One/Storm warning.md'), k = await at(p, 'Part One/The keeper.md');
	const pane = await rectOf(p, `${LEAF} .binders-corkboard`);
	const was = j(await contents(p));
	await hold(p, { x: s.x, y: s.t + 12 }, { x: pane.l - 5, y: k.y });
	t.eq(await line(p), null, '5px left of the pane: no line on the board');
	t.ok(await p.ev(`!!app.dragManager.draggable && document.querySelector('.binders-drag-ghost').classList.contains('is-handed-over')`), '5px left of the pane: the card is a file, and the drag Obsidian’s');
	await p.move(s.x, s.t + 12, 8, { buttons: 1 });
	await letGo(p, s.x, s.t + 12);
	await p.sleep(500);
	await flush(p);
	t.eq(j(await contents(p)), was, 'brought back and let go where it was: nothing moved');
	t.eq(await leftovers(p), 0, '5px left of the pane, and back: nothing of the drag is left');
	// a board long enough to scroll: over the toolbar
	await bigFolder(p, 'Big', 30);
	await openView(p, L + 'Big');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === 30`);
	// (over the toolbar's word count: a folder in its breadcrumb is a place to drop, the rest of it isn't)
	const c = await p.at(card(L + 'Big/Scene 005.md')), bar = await p.at(`${LEAF} .binders-word-count`);
	out.push(await tryAt('over the toolbar of a board that scrolls', { x: c.x, y: c.t + 12 }, bar.x, bar.y));
	const lied = out.filter((o) => o.line !== o.moved);
	t.eq(lied.length, 0, 'the line and the drop disagree: ' + j(lied));
}));

test('BUG: Back from a note opened from a card returns to the board where it was (scrolled, the card selected)', withTidy(async (p, h, t) => {
	await bigFolder(p, 'Big', 40);
	await openView(p, L + 'Big');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === 40`);
	await p.ev(`document.querySelector('${LEAF} .binders-corkboard').scrollTop = 900`);
	await p.sleep(300);
	const was = await scrollTop(p);
	t.ok(was > 800, 'scrolled down: ' + was);
	// what's in sight: the first card showing, and how far down the pane it is (cards out of sight are stand-ins of a
	// guessed height until they're drawn, so the scroll position alone isn't the place)
	const place = () => p.ev(`(() => { const top = document.querySelector('${LEAF} .binders-corkboard').getBoundingClientRect().top; const c = [...document.querySelectorAll('${LEAF} .binders-card[data-path]')].find(c => c.getBoundingClientRect().bottom > top + 1); return { card: c.dataset.path, y: Math.round(c.getBoundingClientRect().top - top) }; })()`);
	const before = await place();
	const path = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].find(c => { const r = c.getBoundingClientRect(); return r.top > 300 && r.bottom < 800; }).dataset.path`);
	const c = await p.at(card(path));
	await p.dbl(c.x, c.t + 12);
	await until(p, `app.workspace.getActiveFile()?.path === ${j(path)}`);
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `app.workspace.getMostRecentLeaf().view.getViewType() === 'binders-view' && !!document.querySelector('${LEAF} .binders-card[data-path]')`);
	await p.sleep(500);
	const now = await place();
	t.ok(now.card === before.card && Math.abs(now.y - before.y) < 20, `the board is where it was (${j(before)}), not at ${j(now)}`);
	t.eq(j(await selected(p)), j([path]), 'and the card that was opened is selected');
}));

test('BUG: cancelling Delete leaves the focus on the card, not on the first card of the board', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part Two');
	const c = await at(p, 'Part Two/Lights out.md');
	await p.click(c.x, c.t + 12);
	await p.key('Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await p.key('Escape');
	await p.sleep(300);
	t.eq(j(await selected(p)), j([L + 'Part Two/Lights out.md']), 'still selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), L + 'Part Two/Lights out.md', 'and focused (so the arrows carry on from it)');
	// and a folder's stack, on the binder's board
	await openView(p);
	const two = await at(p, 'Part Two');
	await p.click(two.x, two.t + 12);
	await p.key('Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await p.key('Escape');
	await p.sleep(300);
	t.ok(await exists(p, L + 'Part Two/The wreck.md'), 'cancelled: the folder and its notes are still there');
	t.eq(j(await selected(p)), j([L + 'Part Two']), 'the stack is still selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), L + 'Part Two', 'and focused');
}));

test('BUG: Escape after a note made with Enter leaves the focus on the “New note” tile, not on the page', withTidy(async (p, h, t) => {
	await openView(p);
	const tile = await p.at(`${LEAF} .binders-group:last-child .binders-card-new`);
	// a tile not used yet: Escape puts the focus back on it
	await p.click(tile.x, tile.y);
	await until(p, `document.activeElement?.matches('${LEAF} .binders-card-new input')`);
	await p.key('Escape');
	await p.sleep(200);
	t.ok(await p.ev(`document.activeElement?.matches('${LEAF} .binders-card-new')`), 'Escape on a fresh tile: the tile has the focus');
	await p.click(tile.x, tile.y);
	await until(p, `document.activeElement?.matches('${LEAF} .binders-card-new input')`);
	await p.type('Afterword');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Afterword.md')})`);
	await until(p, `document.activeElement?.matches('${LEAF} .binders-card-new input')`);
	t.ok(await p.ev(`document.activeElement?.matches('${LEAF} .binders-card-new input')`), 'Enter offers the next title');
	// a moment later (the new note's words are counted, its properties read: the board wants a redraw, and waits)
	await p.sleep(1500);
	await p.key('Escape');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.activeElement?.closest('${LEAF} .binders-board')`), 'after Escape the focus is still on the board, not on ' + await active(p));
}));

test('BUG: a narrow pane (one column): a stack with a long name doesn’t widen the cards past the pane', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.createFolder(${j(L + 'Part One/Chapter three in which nothing much happens for a very long time')}).then(() => 1)`);
	await p.sleep(800);
	await narrow(p, 430, async () => {
		await openView(p, L + 'Part One');
		t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-card.is-stack')`), 'the folder is a stack on Part One’s board');
		const m = await p.ev(`(() => { const b = document.querySelector('${LEAF} .binders-corkboard'); return { pane: b.clientWidth, content: b.scrollWidth, right: Math.max(...[...b.querySelectorAll('.binders-card')].map(c => Math.round(c.getBoundingClientRect().right))), edge: Math.round(b.getBoundingClientRect().right) }; })()`);
		t.ok(m.content <= m.pane + 1 && m.right <= m.edge, `nothing is wider than the pane: ${j(m)}`);
	});
}));

test('BUG: the toolbar’s word count isn’t squeezed away by a long breadcrumb, and the folder shown stays readable', withTidy(async (p, h, t) => {
	const deep = L + 'Part One/Chapter three in which nothing much happens for a very long time/Interlude/Deepest';
	await p.ev(`(async () => { let at = ''; for (const part of ${j(deep)}.split('/')) { at += (at ? '/' : '') + part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); } await app.vault.create(${j(deep + '/A scene.md')}, 'some words here'); })().then(() => 1)`);
	await p.sleep(900);
	await narrow(p, 1000, async () => {
		await openView(p, deep);
		await until(p, `/word/.test(document.querySelector('${LEAF} .binders-word-count')?.textContent ?? '')`);
		const m = await p.ev(`(() => { const w = document.querySelector('${LEAF} .binders-word-count'), c = document.querySelector('${LEAF} .binders-crumb.is-current'); return { text: w.textContent, shown: w.clientWidth, needs: w.scrollWidth, crumb: c.textContent, crumbShown: c.clientWidth, crumbNeeds: c.scrollWidth }; })()`);
		t.ok(m.crumbShown >= Math.min(m.crumbNeeds, 60), `the folder shown keeps (most of) its name in the breadcrumb: ${j(m)}`);
		t.ok(m.shown >= m.needs - 1, `“${m.text}” is shown whole, though the pane is 956px wide: ${j(m)}`);
	});
}));

test('BUG: a right-click while a card is being dragged opens no menu (and doesn’t change the selection)', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part One');
	const a = await at(p, 'Part One/Arrival.md'), s = await at(p, 'Part One/Storm warning.md');
	const to = { x: s.x + 60, y: s.y };
	await hold(p, { x: a.x, y: a.t + 12 }, to);
	try {
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: to.x, y: to.y, button: 'right', buttons: 3, clickCount: 1 });
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'right', buttons: 1, clickCount: 1 });
		await p.sleep(250);
		const menus = await p.ev(`document.querySelectorAll('.menu').length`), sel = await selected(p);
		t.eq(j(sel), j([L + 'Part One/Arrival.md']), 'the dragged card is still the selection');
		t.eq(menus, 0, 'no menu over the drag');
	} finally {
		await p.key('Escape');
		await letGo(p, to.x, to.y);
		await closeMenus(p);
		await p.sleep(300);
	}
}));

// ---- verified solid (these pass) ----

test('a click that wobbles up to 5px is still a click: it selects, and on a synopsis it edits; nothing is dragged', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part One');
	const a = await at(p, 'Part One/Arrival.md');
	for (const d of [3, 5]) {
		await p.move(a.x, a.t + 12, 2);
		await press(p, a.x, a.t + 12);
		await p.move(a.x + d, a.t + 12, 3, { buttons: 1 });
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 0, `${d}px: no drag`);
		await letGo(p, a.x + d, a.t + 12);
		await p.sleep(100);
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), `${d}px: selected`);
	}
	const syn = await p.at(`${card(L + 'Part One/Arrival.md')} .binders-card-synopsis`);
	await p.move(syn.x, syn.y, 2);
	await press(p, syn.x, syn.y);
	await p.move(syn.x + 4, syn.y + 2, 3, { buttons: 1 });
	await letGo(p, syn.x + 4, syn.y + 2);
	await p.sleep(200);
	t.ok(await p.ev(`document.activeElement?.matches('${LEAF} .binders-card-synopsis textarea')`), 'a wobbly click on the synopsis edits it');
	await p.key('Escape');
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
}));

test('a drop on a long board of uneven rows: the scroll never jumps, the card lands exactly in its place, nothing is left', withTidy(async (p, h, t) => {
	await bigFolder(p, 'Big', 48);
	await openView(p, L + 'Big');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === 48`);
	await p.ev(`document.querySelector('${LEAF} .binders-corkboard').scrollTop = 700`);
	await p.sleep(400);
	const vis = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].filter(c => { const r = c.getBoundingClientRect(); return r.top > 200 && r.bottom < 860; }).map(c => c.dataset.path)`);
	t.ok(vis.length >= 8, 'two rows or more in sight');
	const from = await p.at(card(vis[0])), to = await p.at(card(vis[6]));
	const st0 = await scrollTop(p);
	await hold(p, { x: from.x, y: from.t + 12 }, { x: to.x + to.w / 2 - 10, y: to.y });
	t.eq(await scrollTop(p), st0, 'dragging within the board scrolls nothing');
	// every frame from the drop on: the scroll position and the dropped card
	await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-corkboard'), t0 = performance.now(); window.__f = []; const tick = () => { const c = document.querySelector(${j(card(vis[0]))}); window.__f.push([s.scrollTop, document.querySelectorAll('.binders-drag-ghost').length, c ? Math.round(c.getBoundingClientRect().left) : null]); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else window.__fDone = true; }; requestAnimationFrame(tick); return 1; })()`);
	await letGo(p, to.x + to.w / 2 - 10, to.y);
	await until(p, `window.__fDone === true`);
	const frames = await p.ev(`window.__f`);
	t.eq(j([...new Set(frames.map((f) => f[0]))]), j([st0]), `the scroll position is the same in all ${frames.length} frames after the drop`);
	t.ok(frames.filter((f) => f[1]).length <= 3, 'the card under the pointer is gone within a few frames');
	const order = await cards(p);
	t.eq(order.indexOf(vis[0]), order.indexOf(vis[6]) + 1, 'the card went after the one it was dropped past');
	t.eq(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card')].filter(c => c.getAnimations().length || getComputedStyle(c).transform !== 'none').length`), 0, 'no card is left offset or still moving');
	t.eq(await leftovers(p), 0, 'nothing of the drag is left');
	t.eq(j(await selected(p)), j([vis[0]]), 'the dropped card is selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), vis[0], 'and focused');
}));

test('Escape mid-drag: the button still down then does nothing, the next click is a click; let go outside the window: nothing moves', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part One');
	const a = await at(p, 'Part One/Arrival.md'), k = await at(p, 'Part One/The keeper.md');
	await hold(p, { x: a.x, y: a.t + 12 }, { x: k.x + 60, y: k.y });
	await p.key('Escape');
	await p.sleep(60);
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .binders-card.is-dragging').length`), 0, 'Escape ends the drag at once');
	await p.move(k.x + 200, k.y + 60, 5, { buttons: 1 });
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 0, 'moving on with the button down starts nothing');
	await letGo(p, k.x + 200, k.y + 60);
	await p.sleep(400);
	await p.click(k.x, k.t + 12);
	t.eq(j(await selected(p)), j([L + 'Part One/The keeper.md']), 'the next click selects');
	// out of the window altogether
	await hold(p, { x: a.x, y: a.t + 12 }, { x: k.x + 60, y: k.y });
	await p.move(-20, 300, 5, { buttons: 1 });
	await letGo(p, -20, 300);
	await p.sleep(500);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	t.eq(await leftovers(p), 0, 'nothing of either drag is left');
}));

test('the wheel scrolls the board mid-drag and the line follows; a second drag straight after a drop between folders works', withTidy(async (p, h, t) => {
	await bigFolder(p, 'Big', 30);
	await openView(p, L + 'Big');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === 30`);
	const a = await p.at(card(L + 'Big/Scene 001.md'));
	await hold(p, { x: a.x, y: a.t + 12 }, { x: a.x + 300, y: 500 });
	await p.wheel(a.x + 300, 500, 500);
	await p.sleep(300);
	t.ok((await scrollTop(p)) > 300, 'the wheel scrolls while a card is held');
	const under = await p.ev(`(() => { const c = document.elementFromPoint(${a.x + 300}, 500)?.closest('.binders-card[data-path]'); if (!c) return null; const r = c.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom) }; })()`);
	const mark = await line(p);
	t.ok(mark && under && mark.t >= under.t - 1 && mark.b <= under.b + 1, `the line is beside the row now under the pointer (${j(mark)} in ${j(under)})`);
	await p.key('Escape');
	await letGo(p, a.x + 300, 500);
	await p.sleep(300);
	// a drop into another folder (a file move), and at once another drag
	// (onto the middle of Part Two's stack: Epilogue goes into that folder; then a card before it, which stays put)
	await openView(p);
	const arr = await at(p, 'Epilogue.md'), w = await at(p, 'Part Two');
	await hold(p, { x: arr.x, y: arr.t + 12 }, { x: w.x, y: w.y }, 6);
	await letGo(p, w.x, w.y);
	const s = await at(p, 'Prologue.md');
	await press(p, s.x, s.t + 12);
	await p.move(s.x + 40, s.t + 40, 3, { buttons: 1 });
	await p.sleep(350);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.binders-drag-ghost .binders-card-title')].map(e => e.textContent)`)), j(['Prologue']), 'the second card follows the pointer, alone');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-dragging')].map(c => c.dataset.path)`)), j([L + 'Prologue.md']), 'its slot holds its place through the first drop’s redraw');
	await letGo(p, s.x + 40, s.t + 40);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Epilogue.md')})`);
	await p.sleep(500);
	t.eq(await leftovers(p), 0, 'nothing is left of either');
	t.eq(j((await names(p)).slice(0, 3)), j(['Prologue', 'Part One', 'Part Two']), 'the first drop was made: Epilogue is off the binder’s board');
	t.ok(!(await names(p)).includes('Epilogue'), 'its card is gone from here');
	await flush(p);
	t.eq(j((await contents(p)).slice(0, 9)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Epilogue']), 'and last in Part Two; the second drag, let go where it was, moved nothing');
}));

test('cards selected here and there on a board, a folder among them, dropped between two cards, arrive together in board order, all selected', withTidy(async (p, h, t) => {
	// (a board shows one folder, so what's selected is always in one folder: here the binder's own, with two more notes)
	await p.ev(`(async () => { await ${B}.newScene(${file('The Lighthouse')}, Infinity, 'Coda'); await ${B}.newScene(${file('The Lighthouse')}, Infinity, 'Afterword'); })().then(() => 1)`);
	await p.sleep(600);
	const before = await texts(p);
	await openView(p);
	t.eq(j(await names(p)), j(['Prologue', 'Part One', 'Part Two', 'Epilogue', 'Coda', 'Afterword']), 'the board');
	const pro = await at(p, 'Prologue.md'), two = await at(p, 'Part Two'), af = await at(p, 'Afterword.md'), e = await at(p, 'Epilogue.md');
	// picked out of order
	await p.click(af.x, af.t + 12);
	await p.click(pro.x, pro.t + 12, { modifiers: 2 });
	await p.click(two.x, two.t + 12, { modifiers: 2 });
	// held by the folder's stack, and put down just after Epilogue
	await hold(p, { x: two.x, y: two.t + 12 }, { x: e.x + 30, y: e.y });
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost .binders-drag-count')?.textContent`), '3', 'three are held');
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card.is-dragging').length`), 3, 'each place is held by a slot');
	await letGo(p, e.x + 30, e.y);
	await until(p, `[...document.querySelectorAll('${LEAF} .binders-card[data-path]')][0]?.dataset.path === ${j(L + 'Part One')}`);
	await p.sleep(500);
	t.eq(j(await names(p)), j(['Part One', 'Epilogue', 'Prologue', 'Part Two', 'Afterword', 'Coda']), 'after Epilogue, in the order they were on the board');
	t.eq(j(await selected(p)), j([L + 'Prologue.md', L + 'Part Two', L + 'Afterword.md']), 'all three still selected');
	await flush(p);
	t.eq(j(await contents(p)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Epilogue', 'Prologue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Afterword', 'Coda']), 'and so the binder’s list, the folder with its notes');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('stacks: a folder dropped on the middle of another goes into it with its notes; its edge puts it beside', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const one = await at(p, 'Part One'), two = await at(p, 'Part Two');
	await hold(p, { x: two.x, y: two.t + 12 }, { x: one.l + 8, y: one.y });
	t.eq(await p.ev(`document.querySelectorAll('.is-being-dragged-over').length`), 0, 'at its edge: not into it');
	t.ok(await line(p), 'a line beside it instead');
	await p.move(one.x, one.y, 6, { buttons: 1 });
	await p.sleep(150);
	t.eq(await p.ev(`document.querySelector('.is-being-dragged-over')?.dataset.path`), L + 'Part One', 'over its middle: into it');
	t.eq(await line(p), null, 'and no line');
	await letGo(p, one.x, one.y);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Part Two/The wreck.md')})`);
	await flush(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Part Two/', 'Part One/Part Two/The wreck', 'Part One/Part Two/Lights out', 'Epilogue']), 'the folder is last in Part One, its notes in order');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part Two/The wreck.md']: L + 'Part One/Part Two/The wreck.md', [L + 'Part Two/Lights out.md']: L + 'Part One/Part Two/Lights out.md' } });
	t.eq(await leftovers(p), 0, 'nothing of the drag is left');
	// put the folder back, so the runner finds the notes where it expects them
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Part Two')}, ${j(L + 'Part Two')}).then(() => 1)`);
	await p.sleep(400);
}));

test('renaming with an input method: Enter while composing doesn’t save the half-typed title', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part One');
	const c = await at(p, 'Part One/The keeper.md');
	await p.click(c.x, c.t + 12);
	await p.key('F2');
	await until(p, `document.activeElement?.matches('${LEAF} .binders-card-title input')`);
	await p.send('Input.imeSetComposition', { text: 'とうだい', selectionStart: 4, selectionEnd: 4 });
	await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229 });
	await p.sleep(200);
	t.ok(await p.ev(`document.activeElement?.matches('${LEAF} .binders-card-title input')`), 'still editing');
	t.ok(await exists(p, L + 'Part One/The keeper.md'), 'not renamed');
	await p.send('Input.insertText', { text: '灯台' });
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/灯台.md')})`);
	t.ok(await exists(p, L + 'Part One/灯台.md'), 'Enter after the composition saves it');
}));

test('keyboard: Down and Up go between rows by position, Left and Right through notes and stacks alike, Shift extends, and Alt+Up carries a note past the folder before it', withTidy(async (p, h, t) => {
	const walk = async (...keys) => { const out = []; for (const k of keys) { await p.key(...[].concat(k)); await p.sleep(60); out.push((await p.ev(`document.activeElement?.dataset?.path ?? '?'`)).replace(L, '').replace('.md', '')); } return out; };
	// a board of two rows: Part One with three more notes
	await p.ev(`(async () => { for (const n of ['Fourth', 'Fifth', 'Sixth']) await ${B}.newScene(${file(L + 'Part One')}, Infinity, n); })().then(() => 1)`);
	await p.sleep(600);
	await openView(p, L + 'Part One');
	const rows = await p.ev(`(() => { const out = []; for (const c of document.querySelectorAll('${LEAF} .binders-card[data-path]')) { const top = Math.round(c.getBoundingClientRect().top); (out.find(r => r.top === top) ?? out[out.push({ top, cards: [] }) - 1]).cards.push(c.dataset.path.replace(${j(L)}, '').replace('.md', '')); } return out.map(r => r.cards); })()`);
	t.ok(rows.length === 2 && rows[0].length > rows[1].length && rows[1].length >= 2, 'two rows, the second shorter: ' + j(rows));
	const [r1, r2] = rows, all = [...r1, ...r2];
	const a = await at(p, 'Part One/Arrival.md');
	await p.click(a.x, a.t + 12);
	t.eq(j(await walk('ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'End', 'Home')), j([r2[0], r2[0], r2[1], r1[1], all[all.length - 1], r1[0]]), 'the arrows');
	// from the end of the first row, Down goes to the nearest card below: the last
	await walk('End', 'ArrowUp');
	const above = await p.ev(`document.activeElement?.dataset?.path`);
	t.eq(above.replace(L, '').replace('.md', ''), r1[r2.length - 1], 'Up from the last card: the card above it');
	await p.click(a.x, a.t + 12);
	await walk(['ArrowRight', 'shift'], ['ArrowDown', 'shift']);
	t.eq(j((await selected(p)).map((x) => x.replace(L, '').replace('.md', ''))), j(all.slice(0, r1.length + 2)), 'Shift+arrows select everything between');
	// the binder's board: notes and stacks are one run of cards
	await openView(p);
	const c = await at(p, 'Prologue.md');
	await p.click(c.x, c.t + 12);
	t.eq(j(await walk('ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'Home')), j(['Part One', 'Part Two', 'Epilogue', 'Epilogue', 'Part Two', 'Part Two', 'Prologue']), 'through the stacks, one card each; nothing below a single row');
	t.eq((await viewState(p)).folder, 'The Lighthouse', 'the arrows go into no folder');
	const e = await at(p, 'Epilogue.md');
	await p.click(e.x, e.t + 12);
	await p.key('ArrowUp', 'alt');
	await p.sleep(400);
	await flush(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Fourth', 'Part One/Fifth', 'Part One/Sixth', 'Epilogue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out']), 'Alt+Up: Epilogue is before Part Two');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Epilogue.md', 'and keeps the focus');
}));

test('a new note typed in the last tile, after a last subfolder, is made last in the binder, and the tile offers another', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + 'Part Three')}); await app.vault.create(${j(L + 'Part Three/Aftermath.md')}, 'a b c'); })().then(() => 1)`);
	await p.sleep(900);
	await openView(p);
	await p.ev(`document.querySelector('${LEAF} .binders-group:last-child .binders-card-new').scrollIntoView({ block: 'center' })`);
	await p.sleep(300);
	const tile = await p.at(`${LEAF} .binders-group:last-child .binders-card-new`);
	await p.click(tile.x, tile.y);
	await until(p, `document.activeElement?.matches('${LEAF} .binders-card-new input')`);
	await p.type('Coda');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Coda.md')})`);
	await until(p, `document.activeElement?.matches('${LEAF} .binders-group:last-child .binders-card-new input')`);
	t.ok(await p.ev(`document.activeElement?.matches('${LEAF} .binders-group:last-child .binders-card-new input')`), 'the tile is ready for the next title');
	await p.key('Escape');
	await flush(p);
	t.eq(j((await contents(p)).slice(-3)), j(['Part Three/', 'Part Three/Aftermath', 'Coda']), 'Coda is after the last folder');
}));

test('touch: a tap selects a card, a second tap edits its synopsis; a drag cut short by the system leaves nothing behind', withTidy(async (p, h, t) => {
	const touch = (type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
	await openView(p, L + 'Part One');
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try {
		const syn = await p.at(`${card(L + 'Part One/Arrival.md')} .binders-card-synopsis`);
		await touch('touchStart', syn.x, syn.y); await p.sleep(40); await touch('touchEnd'); await p.sleep(350);
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), 'the first tap selects');
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .is-editing').length`), 0, 'and doesn’t edit');
		await touch('touchStart', syn.x, syn.y); await p.sleep(40); await touch('touchEnd'); await p.sleep(350);
		t.ok(await p.ev(`document.activeElement?.matches('${LEAF} .binders-card-synopsis textarea')`), 'the second tap edits the synopsis');
		await p.key('Escape');
		const k = await at(p, 'Part One/The keeper.md');
		await touch('touchStart', k.x, k.t + 12); await p.sleep(600);
		for (let i = 1; i <= 4; i++) { await touch('touchMove', k.x + 20 * i, k.t + 12 + 10 * i); await p.sleep(20); }
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 1, 'a long press and a move drags');
		await touch('touchCancel');
		await p.sleep(500);
		t.eq(await leftovers(p), 0, 'cancelled: nothing of the drag is left');
		await flush(p);
		t.eq(j(await contents(p)), j(LIST), 'and nothing moved');
	} finally { await p.send('Emulation.setTouchEmulationEnabled', { enabled: false }); }
}));

test('a board of 330 cards (notes, and six folders of ten among them): opens and redraws quickly, and scrolls through without a long frame', withTidy(async (p, h, t) => {
	// (the board shows one folder: so one folder of 330 notes and, here and there among them, six subfolders as stacks)
	await p.ev(`(async () => { const dir = ${j(L)} + 'Act'; await app.vault.createFolder(dir); for (let i = 0; i < 330; i++) { const s = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do. '.repeat((i * 7) % 6).trim(); await app.vault.create(dir + '/S' + String(i).padStart(3, '0') + '.md', '---\\n' + (s ? 'synopsis: ' + s + '\\n' : '') + (i % 3 ? 'status: draft\\n' : '') + '---\\n' + 'word '.repeat(50 + i % 55)); if (i % 55 === 54) { const sub = dir + '/Z' + String(i).padStart(3, '0'); await app.vault.createFolder(sub); for (let k = 0; k < 10; k++) await app.vault.create(sub + '/n' + k + '.md', 'word '.repeat(20)); } } })().then(() => 1)`);
	await p.sleep(2500);
	const t0 = Date.now();
	await openView(p, L + 'Act');
	await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length === 336`, 10000);
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card[data-path]').length`), 336, '330 notes and six stacks');
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card.is-stack').length`), 6, 'the folders are stacks');
	const open = Date.now() - t0;
	const draw = await p.ev(`(() => { const m = ${VIEW}.current; const t = performance.now(); m.draw(); return Math.round(performance.now() - t); })()`);
	await p.ev(`(() => { window.__gaps = []; let last = performance.now(); window.__run = true; const tick = () => { const n = performance.now(); window.__gaps.push(Math.round(n - last)); last = n; if (window.__run) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()`);
	for (let i = 0; i < 50; i++) { await p.wheel(800, 500, 400); await p.sleep(16); }
	await p.sleep(200);
	const gaps = await p.ev(`(() => { window.__run = false; return window.__gaps; })()`);
	// a card moved near the top: the time from the drop to the board showing it
	await p.ev(`document.querySelector('${LEAF} .binders-corkboard').scrollTop = 0`);
	await p.sleep(300);
	const first = await cards(p);
	const a = await p.at(card(first[0])), s = await p.at(card(first[2]));
	await hold(p, { x: a.x, y: a.t + 12 }, { x: s.x + 60, y: s.y });
	await p.ev(`(() => { window.__t0 = performance.now(); window.__moved = 0; const mo = new MutationObserver(() => { if (window.__moved) return; const c = [...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path); if (c.indexOf(${j(first[0])}) === 2) { window.__moved = performance.now() - window.__t0; mo.disconnect(); } }); mo.observe(document.querySelector('${LEAF} .binders-board'), { childList: true, subtree: true }); return 1; })()`);
	await letGo(p, s.x + 60, s.y);
	await until(p, `window.__moved > 0`);
	const moved = Math.round(await p.ev(`window.__moved`));
	console.log(`    330 cards: open ${open}ms, redraw ${draw}ms, drop to redraw ${moved}ms, longest frame while scrolling ${Math.max(...gaps)}ms`);
	t.ok(open < 2500, `opens in ${open}ms`);
	t.ok(draw < 150, `a full redraw takes ${draw}ms`);
	t.ok(moved < 300, `a drop shows in ${moved}ms`);
	t.ok(Math.max(...gaps) < 120, `no long frame while scrolling (longest ${Math.max(...gaps)}ms)`);
}));
