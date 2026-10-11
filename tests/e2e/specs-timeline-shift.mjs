// "Shift story dates..." (src/view/shift-dates.ts, src/time/shift.ts): the menu item that moves the story dates of
// several selected scenes together. Each test sets its own dates in the throwaway vault.
import { VIEW, clickMenu, flush, j, menuItems, texts, until, withTidy } from './view-helpers.mjs';
import { T, open, seed } from './specs-timeline.mjs';
import { ARRIVAL, DATES, EPILOGUE, KEEPER, L, PROLOGUE, STORM, WRECK, cardSel, clearHistory, placed, press, props, settledAs, steps, undoBtn } from './specs-timeline-drag.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'timeline shift: ' + name, fn: withTidy(fn) });
const SHOTS = process.env.TIMELINE_SHOTS || '';
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };

test('“Shift story dates...” is in the menu when more than one dated scene is selected, in the timeline, the corkboard and the outliner; it moves them together, keeping their spacing, as one step', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clearHistory(p);
	const before = await texts(p);
	// one card: not there
	let a = await p.at(`${cardSel(ARRIVAL)} .binders-card-footer`);
	await p.right(a.x, a.y);
	t.ok(!(await menuItems(p)).includes('Shift story dates...'), 'with one scene selected there is no such item');
	await p.key('Escape');
	// two dated and one without a date: the two are shifted
	const w = await p.at(`${cardSel(WRECK)} .binders-card-footer`);
	await p.click(w.x, w.y, { modifiers: 2 });
	const e = await p.at(`${cardSel(EPILOGUE)} .binders-card-footer`);
	await p.click(e.x, e.y, { modifiers: 2 });
	await p.right(w.x, w.y);
	t.ok((await menuItems(p)).includes('Shift story dates...'), 'with several selected it is: ' + (await menuItems(p)).join(', '));
	await clickMenu(p, 'Shift story dates...');
	await until(p, `!!document.querySelector('.modal input')`);
	t.eq(await p.ev(`document.querySelector('.modal-title')?.textContent`), 'Shift story dates', 'a dialog asks how far');
	await shot(p, 'shift-dialog');
	await p.ev(`(() => { const m = document.querySelector('.modal'), sel = m.querySelectorAll('select:not(.is-measuring)'); sel[1].value = 'd'; sel[1].dispatchEvent(new Event('change')); const i = m.querySelector('input'); i.value = '3'; i.dispatchEvent(new Event('input')); return 1; })()`);
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Shift').click()`);
	await settledAs(p, WRECK, '1987-06-22');
	t.eq(j(await placed(p, [ARRIVAL, WRECK, EPILOGUE])), j({ 'Arrival': j({ date: '1987-06-14', order: null }), 'The wreck': j({ date: '1987-06-22', order: null }), 'Epilogue': j({ date: null, order: null }) }), 'the selected dated scenes moved three days; the one without a date was left alone');
	t.eq(await steps(p), 1, 'one step');
	await press(p, undoBtn);
	t.eq(j(await texts(p)), j(before), 'one Undo puts every note back, byte for byte');
	// by months, earlier, with a typed time and a month: each moves by what it can hold
	await clearHistory(p);
	await seed(p, { [ARRIVAL]: '1987-06-11T21:30', [KEEPER]: '1987-06' });
	await open(p, 'down');
	const k = await p.at(`${cardSel(KEEPER)} .binders-card-footer`);
	await p.click(k.x, k.y);
	const a2 = await p.at(`${cardSel(ARRIVAL)} .binders-card-footer`);
	await p.click(a2.x, a2.y, { modifiers: 2 });
	await p.right(a2.x, a2.y);
	await clickMenu(p, 'Shift story dates...');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.ev(`(() => { const m = document.querySelector('.modal'), sel = m.querySelectorAll('select:not(.is-measuring)'); sel[0].value = 'earlier'; sel[0].dispatchEvent(new Event('change')); sel[1].value = 'm'; sel[1].dispatchEvent(new Event('change')); const i = m.querySelector('input'); i.value = '2'; i.dispatchEvent(new Event('input')); return 1; })()`);
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Shift').click()`);
	await settledAs(p, ARRIVAL, '1987-04-11T21:30');
	t.eq(j(await placed(p, [ARRIVAL, KEEPER])), j({ 'Arrival': j({ date: '1987-04-11T21:30', order: null }), 'The keeper': j({ date: '1987-04', order: null }) }), 'two months earlier: a typed time goes along, a month moves as a month');
	// a month cannot be moved by days: it stays, and the notice says so
	await p.ev(`(() => { const m = ${VIEW}.current; return 1; })()`);
	const k2 = await p.at(`${cardSel(KEEPER)} .binders-card-footer`);
	await p.click(k2.x, k2.y);
	const a3 = await p.at(`${cardSel(ARRIVAL)} .binders-card-footer`);
	await p.click(a3.x, a3.y, { modifiers: 2 });
	await p.right(a3.x, a3.y);
	await clickMenu(p, 'Shift story dates...');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.ev(`(() => { const m = document.querySelector('.modal'), i = m.querySelector('input'); i.value = '5'; i.dispatchEvent(new Event('input')); return 1; })()`);
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Shift').click()`);
	await settledAs(p, ARRIVAL, '1987-04-16T21:30');
	t.eq((await props(p, KEEPER)).date, '1987-04', 'five days on: the scene dated only to a month stays as it is');
	t.ok(/stays? as it is/.test(await p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent).join(' ')`)), 'and a notice says so');
	// the corkboard's and the outliner's menus have it too
	await seed(p, { [EPILOGUE]: '1990' });
	for (const mode of ['corkboard', 'outliner']) {
		await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
		await p.sleep(500);
		const sel = mode === 'corkboard' ? (path) => `.workspace-leaf.mod-active .binders-card[data-path="${L}${path}"]` : (path) => `.workspace-leaf.mod-active .binders-outliner-row[data-path="${L}${path}"] .binders-outliner-name`;
		const x = await p.at(sel(PROLOGUE)), y = await p.at(sel(EPILOGUE));
		await p.click(x.x, x.y);
		await p.click(y.x, y.y, { modifiers: 2 });
		await p.right(y.x, y.y);
		t.ok((await menuItems(p)).includes('Shift story dates...'), `in the ${mode}'s menu: ` + (await menuItems(p)).join(', '));
		await p.key('Escape');
	}
});
