// QA round 11, find and replace on the boards: the corkboard (in a grid and arranged by label, across and down), the
// outliner, folder cards and the notes they list, subfolder scope, a filter on, folders three deep, an empty binder, a
// long outliner scrolled by the wheel, modes switched with the bar open, and notes renamed, deleted or moved while it's
// open. Tests named "qa11 fr-boards: …", and "BUG: qa11 fr-boards: …" where a bug is confirmed (they fail until fixed).
// Golden rules 2 and 3: a replace is checked against the files on disk, byte for byte.
import { VIEW, card, clickMenu, closeMenus, j, openView, withTidy } from './view-helpers.mjs';
import { LEAF, disk, saveAll, snap } from './specs-qa5-manuscript.mjs';
import { make } from './specs-qa6-scale.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 fr-boards: ' + name, fn: withTidy(run(fn)) });
const bug = (name, fn) => specs.push({ name: 'BUG: qa11 fr-boards: ' + name, fn: withTidy(run(fn)) });
const run = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } };

// ---- helpers ----
const BAR = `${VIEW}.findBar`;
const BARSEL = `${LEAF} .binders-view .binders-find`;
// (the corkboard is its mode's own element, which is the one that scrolls; the outliner is a child of it)
const ROOT = `${LEAF} .binders-mode.binders-corkboard, ${LEAF} .binders-mode > .binders-outliner`;
const CARD = '.binders-card[data-path]', ROW = '.binders-outliner-row[data-path]';
const countText = (p) => p.ev(`document.querySelector(${j(BARSEL + ' .document-search-count')})?.textContent ?? null`);
const barOpen = (p) => p.ev(`!!document.querySelector(${j(BARSEL)})`);

async function closeAll(p) {
	await p.ev(`(() => { try { ${BAR}?.close(); } catch {} document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); return 1; })()`).catch(() => {});
	await closeMenus(p);
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`).catch(() => {});
}

/** The bar opened as Ctrl+F opens it, with the query typed into it (the field's text is replaced). */
async function find(p, q) {
	if (!(await barOpen(p))) { await p.key('f', 'ctrl'); await p.sleep(400); }
	if (!(await barOpen(p))) throw new Error('Ctrl+F did not open the bar');
	await p.ev(`(() => { const i = ${BAR}.input; i.focus({ preventScroll: true }); i.select(); return 1; })()`);
	await p.type(q);
	await p.sleep(450);
}
/** Clicks an item of the toolbar's mode menu. */
async function mode(p, name) {
	await clickButton(p, '.binders-mode-button');
	await clickMenu(p, name);
	await p.sleep(700);
}
/** Clicks an element of the view by its centre, as a pointer would. */
async function clickButton(p, sel) {
	const at = await p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' ' + sel)})?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
	if (!at) throw new Error('nothing to click: ' + sel);
	await p.click(at.x, at.y);
	await p.sleep(300);
}
/** Arrange, then one of its items by title (the corkboard's). */
async function arrange(p, title) {
	await clickButton(p, '.binders-arrange-button');
	await clickMenu(p, title);
	await p.sleep(900);
}
/** The filter: one item of its menu by title, then the menu closed. */
async function filterBy(p, title) {
	await clickButton(p, '.binders-filter-button');
	await clickMenu(p, title);
	await closeMenus(p);
	await p.sleep(500);
}
/** Wheel over the board by (dx, dy) pixels (a scroll, as a trackpad makes it), then a settle. */
async function scrollBoard(p, dy, dx = 0) {
	const at = await p.ev(`(() => { const r = document.querySelector(${j(ROOT)})?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
	if (!at) throw new Error('no board to scroll');
	await p.move(at.x, at.y, 2);
	await p.wheel(at.x, at.y, dy, false, dx);
	await p.sleep(800);
}
/** How far the board has scrolled (its own, or the one it sits in). */
const scrolled = (p) => p.ev(`(() => { const e = document.querySelector(${j(ROOT)}); return e ? Math.max(e.scrollTop, e.scrollLeft, e.parentElement?.scrollTop ?? 0, e.parentElement?.scrollLeft ?? 0) : -1; })()`);
/** The cards (or rows) of the view: their path, whether lit or stepped back, and whether any part of them is in sight. */
const seen = (p, row) => p.ev(`(() => {
	const b = document.querySelector(${j(ROOT)})?.getBoundingClientRect();
	return [...document.querySelectorAll(${j(LEAF + ' ' + row)})].map(e => {
		const r = e.getBoundingClientRect();
		const inSight = !!b && r.width > 0 && r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right;
		return { path: e.dataset.path, hit: e.classList.contains('is-find-hit'), miss: e.classList.contains('is-find-miss'), seen: inSight };
	});
})()`);
const selectedPaths = (p) => p.ev(`[...document.querySelectorAll(${j(LEAF + ' .binders-card.is-selected, ' + LEAF + ' .binders-outliner-row.is-selected')})].map(c => c.dataset.path)`);
const lit = async (p, row = CARD) => (await seen(p, row)).filter((c) => c.hit).map((c) => c.path).sort();
/** Every card or row in sight is lit when `want` says its note has a match, and stepped back when not. */
async function inSightAgrees(p, row, want, t, label, { partial = true } = {}) {
	const all = await seen(p, row), sight = all.filter((c) => c.seen);
	t.ok(sight.length > 0 && (!partial || sight.length < all.length), `${label}: ${sight.length} of ${all.length} are in sight`);
	const wrong = sight.filter((c) => (want(c.path) ? !c.hit : !c.miss)).map((c) => c.path + (c.hit ? ' (lit, no match)' : ' (should be lit)'));
	t.eq(wrong.join(', '), '', `${label}: every card in sight with a match is lit, and only those`);
	return sight;
}
const num = (path) => Number(/(\d+)\.md$/.exec(path)?.[1] ?? NaN);
const SHOWN = (p) => p.ev(`(() => { const e = document.querySelector(${j(ROOT)}); return e ? e.scrollHeight > e.clientHeight : false; })()`);

// =====================================================================================================================
// The corkboard arranged by label: the cards in sight are the ones that match, once the board has scrolled
// =====================================================================================================================

const ACROSS = `Array.from({ length: 96 }, (_, i) => ({ path: 'N' + String(i).padStart(2, '0') + '.md', text: '---\\nlabel: L' + (i % 12) + '\\n---\\n' + (i % 4 === 1 ? 'A needle here.\\n' : 'Hay.\\n') }))`;

test('arranged by label, across: once the board is scrolled down, each card in sight is lit exactly when its note has a match', async (p, h, t) => {
	await make(p, 'Across', ACROSS);
	await openView(p, 'Across');
	await arrange(p, 'By label, across');
	await find(p, 'needle');
	const want = (path) => num(path) % 4 === 1;
	await inSightAgrees(p, CARD, want, t, 'at the top');
	await scrollBoard(p, 600);
	t.ok((await scrolled(p)) > 300, 'the board scrolled down: ' + (await scrolled(p)));
	await inSightAgrees(p, CARD, want, t, 'scrolled down');
	await scrollBoard(p, 600);
	await inSightAgrees(p, CARD, want, t, 'scrolled further');
	t.eq(await countText(p), '24 in 24 notes', 'the count is of all the notes');
});

test('arranged by label, down: once the board is scrolled along, each card in sight is lit exactly when its note has a match', async (p, h, t) => {
	await make(p, 'Down', ACROSS);
	await openView(p, 'Down');
	await arrange(p, 'By label, down');
	await find(p, 'needle');
	const want = (path) => num(path) % 4 === 1;
	await inSightAgrees(p, CARD, want, t, 'at the start');
	await scrollBoard(p, 600, 0);
	await scrollBoard(p, 0, 900);
	t.ok((await scrolled(p)) > 100, 'the board scrolled: ' + (await scrolled(p)));
	await inSightAgrees(p, CARD, want, t, 'scrolled');
	await scrollBoard(p, 800, 0);
	await inSightAgrees(p, CARD, want, t, 'scrolled further down');
});

// =====================================================================================================================
// The outliner reached with the bar open, and scrolled by the wheel
// =====================================================================================================================

test('the outliner, reached from the corkboard with the bar open: the rows in sight are marked, and a wheel scroll marks the rows that come into sight and only those', async (p, h, t) => {
	await make(p, 'Rows', `Array.from({ length: 160 }, (_, i) => ({ path: 'R' + String(i).padStart(3, '0') + '.md', text: i % 7 === 3 ? 'A needle.\\n' : 'Hay.\\n' }))`);
	await openView(p, 'Rows');
	await find(p, 'needle');
	t.eq(await countText(p), '23 in 23 notes', 'the corkboard says 23 notes');
	await mode(p, 'Outliner');
	t.ok(await barOpen(p), 'the bar is still open in the outliner');
	t.eq(await countText(p), '23 in 23 notes', 'and says the same');
	const want = (path) => num(path) % 7 === 3;
	await inSightAgrees(p, ROW, want, t, 'at the top');
	await scrollBoard(p, 1500);
	t.ok((await scrolled(p)) > 800, 'the outliner scrolled by the wheel: ' + (await scrolled(p)));
	await inSightAgrees(p, ROW, want, t, 'after the wheel');
	await scrollBoard(p, 1500);
	await inSightAgrees(p, ROW, want, t, 'after a second wheel');
});

// =====================================================================================================================
// A long corkboard: a match far down is brought into sight by Next and selected
// =====================================================================================================================

test('a long corkboard: the bar brings a match far down the board into sight, and Next selects the next one there and it is lit', async (p, h, t) => {
	await make(p, 'Far', `Array.from({ length: 60 }, (_, i) => ({ path: 'F' + String(i).padStart(2, '0') + '.md', text: i === 10 || i === 57 ? 'Needle.\\n' : 'Hay.\\n' }))`);
	await openView(p, 'Far');
	await find(p, 'needle');
	t.eq(await countText(p), '2 in 2 notes', 'two notes, two cards');
	t.ok((await lit(p)).includes('Far/F10.md'), 'the one in sight is lit');
	t.ok(!(await seen(p, CARD)).some((c) => c.path === 'Far/F57.md' && c.seen), 'the one far down is not in sight yet');
	await p.key('F3');
	await p.sleep(700);
	t.eq(j(await selectedPaths(p)), j(['Far/F57.md']), 'Next selects the card far down');
	const c = (await seen(p, CARD)).find((c) => c.path === 'Far/F57.md');
	t.ok(!!c && c.seen, 'and it is in sight (the board was brought to it)');
	t.ok(c?.hit, 'and it is lit');
	t.ok(await barOpen(p), 'with the bar still open, the keyboard in it');
	t.eq(await p.ev(`document.activeElement === ${BAR}.input || ${BARSEL}.contains(document.activeElement)`), true, 'the keyboard stays in the bar');
});

// =====================================================================================================================
// An empty binder
// =====================================================================================================================

test('an empty binder: the bar counts 0, nothing is lit, Next does nothing, and nothing is written', async (p, h, t) => {
	await make(p, 'Empty', '[]');
	await openView(p, 'Empty');
	const before = snap(p);
	await find(p, 'anything');
	t.eq(await countText(p), '0', 'no note, no match');
	t.eq((await seen(p, CARD)).length, 0, 'no card');
	await p.key('F3');
	await p.sleep(300);
	t.eq(await countText(p), '0', 'Next moves nowhere');
	t.eq(await p.ev(`!!document.querySelector('.modal.binders-find-review')`), false, 'no replace review opens');
	await saveAll(p);
	t.eq(JSON.stringify(snap(p)), JSON.stringify(before), 'and nothing on disk changed');
});

// =====================================================================================================================
// Folders three deep
// =====================================================================================================================

test('folders three deep: a match in the deepest note lights its top-level folder card, the count is 1 in 1 note, and the other card steps back', async (p, h, t) => {
	await make(p, 'Deep', `[{ path: 'A/B/C/Deep.md', text: 'The needle is deep.\\n' }, { path: 'A/x.md', text: 'Hay.\\n' }, { path: 'Z.md', text: 'Hay.\\n' }]`);
	await openView(p, 'Deep');
	await find(p, 'needle');
	t.eq(await countText(p), '1 in 1 note', 'one note, in the folder three down');
	t.eq(j(await lit(p)), j(['Deep/A']), 'the folder card at the top is lit');
	const all = await seen(p, CARD);
	t.ok(all.find((c) => c.path === 'Deep/Z.md')?.miss, 'the note beside it steps back');
	t.ok(!all.some((c) => c.path === 'Deep/A/B/C/Deep.md'), 'the deep note has no card of its own on this board');
	await p.key('F3');
	await p.sleep(500);
	t.eq(j(await selectedPaths(p)), j(['Deep/A']), 'Next selects the folder card that holds it');
});

// =====================================================================================================================
// Subfolder scope, following the writer in and out
// =====================================================================================================================

test('with the bar open, going into a subfolder looks through that subfolder only, and going back up looks through the folder again', async (p, h, t) => {
	await make(p, 'Scope', `[{ path: 'Top.md', text: 'needle top\\n' }, { path: 'Sub/one.md', text: 'needle one\\n' }, { path: 'Sub/two.md', text: 'needle two\\n' }, { path: 'Sub/Deeper/three.md', text: 'hay\\n' }]`);
	await openView(p, 'Scope');
	await find(p, 'needle');
	t.eq(await countText(p), '3 in 3 notes', 'in the folder: three notes');
	t.eq(j(await lit(p)), j(['Scope/Sub', 'Scope/Top.md']), 'the folder card and the note are lit');
	const at = await p.at(card('Scope/Sub'));
	await p.dbl(at.x, at.y);
	await p.sleep(900);
	t.ok(await barOpen(p), 'the bar stays open');
	t.eq(await countText(p), '2 in 2 notes', 'in Sub: two notes');
	t.eq(await p.ev(`${BAR}.input.value`), 'needle', 'the query is still there');
	t.eq(j(await lit(p)), j(['Scope/Sub/one.md', 'Scope/Sub/two.md']), 'and those are the lit cards');
	await p.click(...Object.values(await p.ev(`(() => { const r = document.querySelector(${j(LEAF + ' .binders-crumb[data-path="Scope"]')})?.getBoundingClientRect(); return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0]; })()`)));
	await p.sleep(900);
	t.eq(await p.ev(`document.querySelector(${j(LEAF + ' .binders-breadcrumbs')})?.textContent`), 'Scope', 'the Scope crumb took the writer back up');
	t.eq(await countText(p), '3 in 3 notes', 'back up, the count is the folder’s again');
});

// =====================================================================================================================
// A filter on
// =====================================================================================================================

test('with a label filter on, only the notes that show are counted and lit; clearing the filter brings the others back', async (p, h, t) => {
	await make(p, 'Filt', `Array.from({ length: 6 }, (_, i) => ({ path: 'F' + i + '.md', text: '---\\nlabel: ' + (i % 2 ? 'Blue' : 'Red') + '\\n---\\nA needle.\\n' }))`);
	await openView(p, 'Filt');
	await find(p, 'needle');
	t.eq(await countText(p), '6 in 6 notes', 'six notes before the filter');
	await filterBy(p, 'Red');
	t.eq(await countText(p), '3 in 3 notes', 'with Red only: three');
	const shown = await seen(p, CARD);
	t.eq(shown.length, 3, 'and three cards on the board');
	t.eq(shown.filter((c) => c.hit).length, 3, 'all three lit');
	await filterBy(p, 'Clear filter');
	t.eq(await countText(p), '6 in 6 notes', 'cleared: six again');
	t.eq((await seen(p, CARD)).filter((c) => c.hit).length, 6, 'and six lit');
});

// =====================================================================================================================
// Notes renamed, deleted and moved while the bar is open
// =====================================================================================================================

test('renaming a matching note while the bar is open: the count is kept, its new card is lit, and the old name is gone', async (p, h, t) => {
	await make(p, 'Ren', `[{ path: 'A.md', text: 'needle a\\n' }, { path: 'B.md', text: 'needle b\\n' }, { path: 'C.md', text: 'hay\\n' }]`);
	await openView(p, 'Ren');
	await find(p, 'needle');
	t.eq(await countText(p), '2 in 2 notes', 'two before');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Ren/A.md'), 'Ren/Renamed.md').then(() => 1)`);
	await p.sleep(1200);
	t.ok(await barOpen(p), 'the bar is still open');
	t.eq(await countText(p), '2 in 2 notes', 'the count is the same');
	t.eq(j(await lit(p)), j(['Ren/B.md', 'Ren/Renamed.md']), 'the renamed note is lit under its new name, and the other is lit');
	t.ok(!(await seen(p, CARD)).some((c) => c.path === 'Ren/A.md'), 'the old name has no card');
	t.ok(await p.ev(`!!document.querySelector(${j(card('Ren/Renamed.md') + ' .binders-find-excerpt')})`), 'and its card still shows the line of the match');
});

test('deleting a matching note while the bar is open: the count drops by its matches, its card goes, and Next never goes to it', async (p, h, t) => {
	await make(p, 'Del', `[{ path: 'A.md', text: 'needle a\\n' }, { path: 'B.md', text: 'needle b\\n' }, { path: 'C.md', text: 'hay\\n' }]`);
	await openView(p, 'Del');
	await find(p, 'needle');
	t.eq(await countText(p), '2 in 2 notes', 'two before');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Del/A.md')).then(() => 1)`);
	await p.sleep(1200);
	t.eq(await countText(p), '1 in 1 note', 'after the delete: one note, one match (the count of the deleted note is not kept)');
	t.eq(j(await lit(p)), j(['Del/B.md']), 'only the other is lit');
	await p.key('F3');
	await p.sleep(500);
	t.eq(j(await selectedPaths(p)), j(['Del/B.md']), 'Next selects the one left, and nothing else');
});

test('moving a matching note into a subfolder keeps it in the count and lights the subfolder’s card; moving it out of the binder takes it out', async (p, h, t) => {
	await make(p, 'Mv', `[{ path: 'A.md', text: 'needle a\\n' }, { path: 'Sub/hay.md', text: 'hay\\n' }, { path: 'C.md', text: 'hay\\n' }]`);
	await openView(p, 'Mv');
	await find(p, 'needle');
	t.eq(await countText(p), '1 in 1 note', 'one before');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Mv/A.md'), 'Mv/Sub/A.md').then(() => 1)`);
	await p.sleep(1200);
	t.eq(await countText(p), '1 in 1 note', 'in the subfolder it is still in scope: one');
	t.eq(j(await lit(p)), j(['Mv/Sub']), 'and its folder’s card is lit, the note itself is not on the board');
	await p.ev(`(async () => { await app.vault.createFolder('Elsewhere'); await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Mv/Sub/A.md'), 'Elsewhere/A.md'); })().then(() => 1)`);
	await p.sleep(1200);
	t.eq(await countText(p), '0', 'out of the binder, it is no match in this view');
	t.eq(j(await lit(p)), j([]), 'and nothing is lit');
});

// =====================================================================================================================
// Replace all from the corkboard
// =====================================================================================================================

test('Replace all from the corkboard: the files hold the replacement, no card is lit afterwards, and no excerpt is left on a card', async (p, h, t) => {
	await make(p, 'Rep', `[{ path: 'A.md', text: 'one needle.\\n' }, { path: 'B.md', text: 'two needle.\\n' }, { path: 'C.md', text: 'Hay.\\n' }]`);
	await openView(p, 'Rep');
	await p.ev(`(() => { app.commands.executeCommandById('binders:find-replace'); return 1; })()`);
	await p.sleep(500);
	await p.ev(`(() => { const b = ${BAR}; b.input.value = 'needle'; b.by.value = 'pin'; b.input.dispatchEvent(new Event('input')); return 1; })()`);
	await p.sleep(600);
	t.eq(await countText(p), '2 in 2 notes', 'two before the replace');
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await p.sleep(300);
	await p.ev(`(async () => { for (let i = 0; i < 50 && !document.querySelector('.modal.binders-find-review'); i++) await new Promise(r => setTimeout(r, 100)); document.querySelector('.modal.binders-find-review button.mod-cta')?.click(); })().then(() => 1)`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(800);
	await saveAll(p);
	t.eq(disk(p, 'Rep/A.md'), 'one pin.\n', 'A is replaced, and nothing else in it');
	t.eq(disk(p, 'Rep/B.md'), 'two pin.\n', 'B is replaced');
	t.eq(disk(p, 'Rep/C.md'), 'Hay.\n', 'C is not touched');
	t.eq(await countText(p), '0', 'after the replace, nothing is found');
	t.eq(j(await lit(p)), j([]), 'no card is lit');
	t.eq(await p.ev(`document.querySelectorAll(${j(LEAF + ' .binders-find-excerpt')}).length`), 0, 'no card shows an excerpt');
});

// =====================================================================================================================
// Modes switched with the bar open
// =====================================================================================================================

test('switching corkboard, outliner, manuscript and back with the bar open: the bar stays, the count is the same in the boards, and each board marks its own matches', async (p, h, t) => {
	await make(p, 'Cyc', `Array.from({ length: 8 }, (_, i) => ({ path: 'N' + i + '.md', text: i % 3 === 0 ? 'A needle.\\n' : 'Hay.\\n' }))`);
	await openView(p, 'Cyc');
	await find(p, 'needle');
	const want = (path) => num(path) % 3 === 0;
	t.eq(await countText(p), '3 in 3 notes', 'three in the corkboard');
	await inSightAgrees(p, CARD, want, t, 'corkboard', { partial: false });
	await mode(p, 'Outliner');
	t.eq(await countText(p), '3 in 3 notes', 'the outliner says the same');
	await inSightAgrees(p, ROW, want, t, 'outliner', { partial: false });
	await mode(p, 'Manuscript');
	t.ok(await barOpen(p), 'the bar is still open in the manuscript');
	t.ok(await p.ev(`!document.querySelector(${j(BARSEL)}).classList.contains('is-wide')`), 'in the note’s column there');
	t.ok(/\/ 3/.test(String(await countText(p))), 'and counts by position: ' + (await countText(p)));
	await mode(p, 'Corkboard');
	t.ok(await barOpen(p), 'the bar is still open back in the corkboard');
	t.eq(await countText(p), '3 in 3 notes', 'the count is back to notes');
	await inSightAgrees(p, CARD, want, t, 'corkboard again', { partial: false });
	t.eq(await p.ev(`!document.querySelector(${j(BARSEL)}).classList.contains('is-wide')`), false, 'and the bar is the view’s width again');
});

// =====================================================================================================================
// Long lines, many matches
// =====================================================================================================================

test('one note with 1,200 matches and another with a line 20,000 characters long: the outliner row says 1,200, the card’s excerpt stays short and marks its match', async (p, h, t) => {
	await make(p, 'Long', `[{ path: 'Many.md', text: 'needle '.repeat(1200) + '\\n' }, { path: 'Wide.md', text: 'a'.repeat(15000) + ' needle ' + 'b'.repeat(5000) + ' needle\\n' }]`);
	await openView(p, 'Long');
	await find(p, 'needle');
	t.eq(await countText(p), '1,202 in 2 notes', 'the count is of all the matches');
	const ex = await p.ev(`(() => { const e = document.querySelector(${j(card('Long/Wide.md') + ' .binders-find-excerpt')}); return e ? { len: e.textContent.length, marked: e.querySelector('.search-result-file-matched-text')?.textContent ?? null } : null; })()`);
	t.ok(!!ex && ex.len < 400, 'the excerpt is short: ' + JSON.stringify(ex));
	t.eq(ex?.marked, 'needle', 'and marks the match');
	await mode(p, 'Outliner');
	t.eq(await p.ev(`document.querySelector(${j(LEAF + ' .binders-outliner-row[data-path="Long/Many.md"] .binders-find-flair')})?.textContent`), '1,200', 'the row says 1,200');
	t.eq(await p.ev(`document.querySelector(${j(LEAF + ' .binders-outliner-row[data-path="Long/Wide.md"] .binders-find-flair')})?.textContent`), '2', 'and the other says 2');
});

// =====================================================================================================================
// Arranged by label, with the subfolders' notes not shown
// =====================================================================================================================

test('arranged by label with “Show notes in subfolders” off: a match in a subfolder’s note is found behind the subfolder’s card, lit; turning the switch on shows the note itself, lit', async (p, h, t) => {
	await make(p, 'Lab', `[{ path: 'a.md', text: '---\\nlabel: Red\\n---\\nHay.\\n' }, { path: 'Sub/b.md', text: '---\\nlabel: Red\\n---\\nA needle.\\n' }]`);
	await openView(p, 'Lab');
	await arrange(p, 'By label, across');
	await find(p, 'needle');
	t.eq(await countText(p), '1 in 1 note', 'the match is in a subfolder, behind its card');
	t.eq(j(await lit(p)), j(['Lab/Sub']), 'the subfolder’s card is lit, and it is the only card of it');
	await clickButton(p, '.binders-arrange-button');
	await clickMenu(p, 'Show notes in subfolders');
	await closeMenus(p);
	await p.sleep(900);
	t.eq(await countText(p), '1 in 1 note', 'with the switch on, the same one match');
	t.eq(j(await lit(p)), j(['Lab/Sub/b.md']), 'and its own card is lit');
});


test('the corkboard in a grid: cards that a wheel scroll brings into sight are lit, and only those', async (p, h, t) => {
	await make(p, 'Grid', `Array.from({ length: 80 }, (_, i) => ({ path: 'G' + String(i).padStart(2, '0') + '.md', text: i % 5 === 2 ? 'A needle.\\n' : 'Hay.\\n' }))`);
	await openView(p, 'Grid');
	await mode(p, 'Corkboard');
	await find(p, 'needle');
	const want = (path) => num(path) % 5 === 2;
	await inSightAgrees(p, CARD, want, t, 'at the top');
	await scrollBoard(p, 900);
	t.ok((await scrolled(p)) > 300, 'the board scrolled: ' + (await scrolled(p)));
	await inSightAgrees(p, CARD, want, t, 'after the wheel');
	await scrollBoard(p, 900);
	await inSightAgrees(p, CARD, want, t, 'after a second wheel');
	t.eq(await countText(p), '16 in 16 notes', 'the count is of all of them');
});


