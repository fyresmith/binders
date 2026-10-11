// Saved filters on a phone and a tablet, by touch: Obsidian's mobile mode (app.emulateMobile) at a phone's size (390 × 844)
// and a tablet's (820 × 1180), with real touches over CDP. The popover is a sheet on a phone (Bases' own rules), the scope
// line has a cross in place of its words, and every control is a finger tall.
import { j, openView, reload, tidy, until, viewState } from './view-helpers.mjs';
import { POP, PICKER, closeFilter, rowSel, rows, tapDone, tapPick, tapSel, tapTick } from './filter-helpers.mjs';
import { tide } from './specs-filters.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'filters phone: ' + name, fn });
const LEAF = '.workspace-leaf.mod-active';
const PHONE = [390, 844], TABLET = [820, 1180];
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;

const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
/** Runs fn in Obsidian's mobile mode at this size, with touch, in the theme the run asked for; then puts the desktop back. */
async function onDevice(p, [width, height], fn) {
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
		await p.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
		await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
		await theme();
		await tidy(p);
	}
	if (logged.length) throw new Error('errors logged on the device: ' + logged.slice(0, 3).join(' ; '));
}
const box = (p, sel) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height), inner: [innerWidth, innerHeight] }; })()`);
const shown = (p) => p.ev(`(() => { const v = (app.workspace.getLeavesOfType('binders-view').find(l => l === app.workspace.getMostRecentLeaf()) || app.workspace.getLeavesOfType('binders-view')[0]).view; return v.store.scenes(v.folder).filter(f => v.visible(f)).map(f => f.basename); })()`);

test('phone: the popover is a sheet along the foot of the screen; a property, an operator and values are picked by tap; the scope line has a cross for the way back', async (p, h, t) => {
	await tide(p);
	await onDevice(p, PHONE, async () => {
		await openView(p, 'Tide');
		await p.sleep(500);
		await tapSel(p, `${LEAF} .binders-filter-button`);
		await until(p, `!!document.querySelector('${POP} .filter-row')`);
		await p.sleep(500);
		const s = await box(p, POP);
		t.ok(s && s.left === 0 && s.width === s.inner[0] && s.bottom === s.inner[1], 'the popover is a sheet: ' + j(s));
		t.eq(await p.ev(`!!document.querySelector('${POP} .modal-header-button')`), true, 'with a Done button');
		// the property list: a sheet too, with a field to search in
		await tapSel(p, `${rowSel(0)} .filter-property-select`);
		await until(p, `!!document.querySelector('${PICKER}')`);
		const list = await box(p, PICKER);
		t.ok(list && list.width === list.inner[0] && list.bottom === list.inner[1], 'the property list is a sheet: ' + j(list));
		t.eq(await p.ev(`!!document.querySelector('${PICKER} .binders-picker-input')`), true, 'with a search field');
		const heights = await p.ev(`[...document.querySelectorAll('${PICKER} .menu-item')].map(e => Math.round(e.getBoundingClientRect().height))`);
		t.ok(heights.length > 0 && heights.every((x) => x >= 36), 'its rows are a finger tall: ' + j(heights));
		await tapPick(p, 'Story date');
		t.eq(j((await rows(p)).map((r) => [r.property, r.operator])), j([['Story date', 'on']]), 'a property by tap');
		// (an operator is a menu: a sheet, with its items a finger tall)
		await tapSel(p, `${rowSel(0)} .filter-operator`);
		await p.sleep(400);
		const op = await p.ev(`(() => { const m = [...document.querySelectorAll('.menu:not(.binders-filter-menu):not(.binders-picker)')].pop(); if (!m) return null; return [...m.querySelectorAll('.menu-item')].map(e => [e.querySelector('.menu-item-title')?.textContent, Math.round(e.getBoundingClientRect().height)]); })()`);
		t.ok(op && op.length === 8 && op.every((x) => x[1] >= 36), 'the operator menu has its eight, each a finger tall: ' + j(op));
		await p.ev(`[...document.querySelectorAll('.menu:not(.binders-filter-menu):not(.binders-picker) .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'before').click()`);
		await p.sleep(400);
		// a date typed with the keyboard that is up
		await tapSel(p, `${rowSel(0)} .filter-rhs-container input`);
		await p.type('1926');
		await p.sleep(600);
		t.eq(j((await shown(p)).sort()), j(['Arrival', 'Prologue', 'Wreck']), 'before 1926: the dated notes that are wholly before it');
		await tapDone(p);
		await p.sleep(300);
		t.eq(await p.ev(`!!document.querySelector('${POP}')`), false, 'Done shuts the sheet');
		// the scope line: the name, the count, a cross
		const sc = await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-scope'); if (!s || s.classList.contains('is-hidden')) return null; const all = s.querySelector('.binders-scope-all'); const r = all.getBoundingClientRect(); const lab = getComputedStyle(all.querySelector('.text-button-label')).display, ic = getComputedStyle(all.querySelector('.text-button-icon')).display; return { name: s.querySelector('.binders-scope-name').textContent, count: s.querySelector('.binders-scope-count').textContent, aria: all.getAttribute('aria-label'), lab, ic, h: Math.round(r.height), w: Math.round(r.width), out: Math.round(s.scrollWidth - s.clientWidth) }; })()`);
		t.ok(sc && sc.name === 'Filter' && /^3 of 7/.test(sc.count), 'the scope line says the filter and the count: ' + j(sc));
		t.ok(sc && sc.lab === 'none' && sc.ic !== 'none' && sc.aria === 'Show the whole binder', 'its way back is a cross, with the words for a screen reader: ' + j(sc));
		t.ok(sc && sc.h >= 32 && sc.w >= 32 && sc.out <= 0, 'a finger tall, and nothing sticks out: ' + j(sc));
		await tapSel(p, `${LEAF} .binders-scope-all`);
		await p.sleep(500);
		t.eq((await shown(p)).length, 7, 'a tap on it shows the whole binder');
		t.eq(j((await viewState(p)).filter), j({ status: [], label: [] }), 'and the filter is off');
	});
});

test('phone: a status and a label by tap, kept when the app restarts; a value list is searched by typing', async (p, h, t) => {
	await tide(p);
	await onDevice(p, PHONE, async () => {
		await openView(p, 'Tide');
		await tapTick(p, 'status', 'Draft');
		await tapTick(p, 'label', 'Green');
		t.eq(j(await shown(p)), j(['Dawn']), 'a Draft that is Green: the one note');
		// a list searched by typing
		await tapSel(p, `${rowSel(0)} .binders-filter-values`);
		await until(p, `!!document.querySelector('${PICKER}')`);
		await p.type('rev');
		await p.sleep(300);
		t.eq(j(await p.ev(`[...document.querySelectorAll('${PICKER} .menu-item:not(.binders-picker-none) .menu-item-title')].map(e => e.textContent)`)), j(['Revised', 'Use “rev”']), 'typing narrows the list (and offers what was typed, to be used as it is)');
		await p.key('Escape');
		await tapDone(p);
		await p.ev(`app.workspace.requestSaveLayout()`);
		await p.sleep(3500);
		await reload(p, true);
		await p.focusMain();
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
		await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path]')`, 8000);
		await p.sleep(800);
		t.eq(j((await viewState(p)).filter), j({ status: ['Draft'], label: ['Green'] }), 'after a restart the filter is as it was left (in the shape an older Binders reads)');
		t.eq(j(await shown(p)), j(['Dawn']), 'and so is what it shows');
	});
});

test('tablet: the popover opens under its button as a popover, its lists beside what they open from; touch picks; the scope line has its words', async (p, h, t) => {
	await tide(p);
	await onDevice(p, TABLET, async () => {
		await openView(p, 'Tide');
		await p.sleep(500);
		await tapTick(p, 'status', 'Revised');
		const pop = await box(p, POP), btn = await box(p, `${LEAF} .binders-filter-button`);
		t.ok(pop && btn && pop.width < pop.inner[0] - 100 && pop.top >= btn.bottom - 2, 'under the button, not a sheet: ' + j({ pop, btn }));
		t.eq(j(await shown(p)), j(['Storm']), 'Revised: one note');
		await closeFilter(p);
		const sc = await p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-scope'); return s && !s.classList.contains('is-hidden') ? { count: s.querySelector('.binders-scope-count').textContent, label: getComputedStyle(s.querySelector('.binders-scope-all .text-button-label')).display, name: s.querySelector('.binders-scope-name').textContent } : null; })()`);
		t.ok(sc && sc.label !== 'none' && /^1 of 7 notes$/.test(sc.count), 'the line has its words: ' + j(sc));
		await tapSel(p, `${LEAF} .binders-scope-all`);
		await p.sleep(400);
		t.eq((await shown(p)).length, 7, 'and shows the whole binder');
	});
});
