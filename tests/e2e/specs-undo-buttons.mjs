// The toolbar's Undo and Redo buttons: in every mode, dimmed (not hidden) when there is nothing to take back, saying what
// they would, and working with a click or a tap.
import { B, VIEW, card, clickMenu, closeMenus, file, j, menuItems, openView, read, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo buttons: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const ARR = L + 'Part One/Arrival.md';

const reset = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
const setSyn = (p, path, text) => p.ev(`${VIEW}.setProps(${file(path)}, { synopsis: ${j(text)} }).then(() => 1)`);
const labels = async (p) => j(await p.ev(`${B}.undos.map(u => u.label)`));
const sleep = (p, ms) => p.sleep(ms);

const BTN = (which) => `.workspace-leaf.mod-active .binders-toolbar .binders-${which}-button`;
const btn = (p, which) => p.ev(`(() => { const b = document.querySelector(${j(BTN(which))}); return b ? { off: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), label: b.getAttribute('aria-label') } : null; })()`);
const press = async (p, which) => { const at = await p.at(BTN(which)); await p.click(at.x, at.y); await sleep(p, 600); };

test('the toolbar’s Undo and Redo: dimmed with nothing to take back, they say what they would, and work with a click', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One'); await reset(p);
	t.ok(await btn(p, 'undo') && await btn(p, 'redo'), 'both are in the toolbar');
	let u = await btn(p, 'undo'), r = await btn(p, 'redo');
	t.ok(u.off && u.aria === 'true' && u.label === 'Nothing to undo', 'Undo is dimmed, not hidden: ' + j(u));
	t.ok(r.off && r.label === 'Nothing to redo', 'Redo too: ' + j(r));
	const orig = await read(p, ARR);
	await setSyn(p, ARR, 'By hand.');
	await until(p, `!document.querySelector(${j(BTN('undo'))}).classList.contains('is-disabled')`);
	u = await btn(p, 'undo'); r = await btn(p, 'redo');
	t.ok(!u.off && u.aria === 'false' && u.label === 'Undo: edit synopsis of “Arrival”', 'Undo says what it would take back: ' + j(u));
	t.ok(r.off, 'Redo is still dimmed');
	await press(p, 'undo');
	t.eq(await read(p, ARR), orig, 'a click takes it back');
	u = await btn(p, 'undo'); r = await btn(p, 'redo');
	t.ok(u.off && !r.off && r.label === 'Redo: edit synopsis of “Arrival”', 'and now Redo is lit: ' + j(r));
	await press(p, 'undo');
	t.eq(await read(p, ARR), orig, 'a click on a dimmed button does nothing');
	await press(p, 'redo');
	t.ok((await read(p, ARR)).includes('By hand.'), 'Redo brings it back');
	// the same history in another mode
	await p.ev(`${VIEW}.setMode('outliner')`);
	await sleep(p, 500);
	u = await btn(p, 'undo');
	t.ok(u && !u.off && u.label === 'Undo: edit synopsis of “Arrival”', 'the outliner has the buttons, and the same history: ' + j(u));
	await p.ev(`${VIEW}.setMode('corkboard')`);
});

test('“Include in export” from a card’s menu is one change the toolbar’s Undo takes back', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One'); await reset(p);
	const orig = await read(p, ARR);
	await until(p, `!!document.querySelector(${j(card(ARR))})`);
	const at = await p.at(card(ARR));
	await p.right(at.x, at.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok((await menuItems(p)).includes('Include in export'), 'the menu has it');
	await clickMenu(p, 'Include in export');
	await sleep(p, 500);
	t.ok(/export: false/.test(await read(p, ARR)), 'the note is left out of export');
	t.eq(await labels(p), j(['Leave “Arrival” out of export']), 'named for what it did');
	await closeMenus(p);
	await press(p, 'undo');
	t.eq(await read(p, ARR), orig, 'one click: the note is as it was, byte for byte');
});
