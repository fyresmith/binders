// Helpers for driving the Filter popover (src/view/filter-popover.ts) as a person does: real clicks and keys.
import { closeMenus, j, until } from './view-helpers.mjs';

export const LEAF = '.workspace-leaf.mod-active';
export const BUTTON = `${LEAF} .binders-filter-button`;
export const POP = '.binders-filter-menu';
export const ROW = `${POP} .filter-row`;
export const PICKER = '.binders-picker';
/** Row `n` (from 0) of the conditions. */
export const rowSel = (n) => `${POP} .filter-group-statements > .filter-row:nth-child(${n + 1})`;

const click = async (p, sel, i = 0) => {
	const at = await p.at(sel, i);
	if (!at) throw new Error('nothing to click: ' + sel + ' #' + i);
	await p.click(at.x, at.y);
	await p.sleep(120);
};
export { click as clickEl };

/** Opens the popover from the toolbar's Filter button (if it is not open). */
export async function openFilter(p) {
	if (await p.ev(`!!document.querySelector('${POP}')`)) return;
	await click(p, BUTTON);
	await until(p, `!!document.querySelector('${POP} .filter-row, ${POP} .binders-filter-add')`);
	await p.sleep(150);
}
/** Closes it with Escape, as a person does. */
export async function closeFilter(p) {
	for (let i = 0; i < 4 && (await p.ev(`!!document.querySelector('${POP}, ${PICKER}')`)); i++) { await p.key('Escape'); await p.sleep(150); }
}
/** The rows now: property, operator, value as the popover says them, and any error line. */
export const rows = (p) => p.ev(`[...document.querySelectorAll('${ROW}')].map(r => ({
	conj: r.querySelector('.conjunction')?.textContent ?? '',
	property: r.querySelector('.filter-property-select .combobox-button-label')?.textContent ?? '',
	operator: r.querySelector('.filter-operator .combobox-button-label')?.textContent ?? null,
	value: r.querySelector('.binders-filter-values .combobox-button-label')?.textContent ?? r.querySelector('.filter-rhs-container input:not([type=checkbox])')?.value ?? (r.querySelector('.filter-rhs-container input[type=checkbox]') ? String(r.querySelector('.filter-rhs-container input[type=checkbox]').checked) : null),
	error: (r.querySelector('.filter-row-error:not(.is-hidden)')?.textContent ?? '') || null,
}))`);
/** The items the picker open now lists: title, ticked, count. */
export const pickerItems = (p) => p.ev(`[...document.querySelectorAll('${PICKER} .menu-item:not(.binders-picker-none)')].map(e => ({ title: e.querySelector('.menu-item-title')?.textContent, checked: e.getAttribute('aria-selected') === 'true', count: e.querySelector('.binders-picker-count')?.textContent ?? null }))`);
/** Picks an item of the open picker by its title. */
export async function pick(p, title) {
	const i = await p.ev(`[...document.querySelectorAll('${PICKER} .menu-item:not(.binders-picker-none)')].findIndex(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)})`);
	if (i < 0) throw new Error(`nothing to pick called “${title}”: ` + j(await pickerItems(p)));
	await click(p, `${PICKER} .menu-item:not(.binders-picker-none)`, i);
}
/** Chooses an operator of row `n` from its menu. */
export async function chooseOperator(p, n, title) {
	await click(p, `${rowSel(n)} .filter-operator`);
	await until(p, `!!document.querySelector('.menu:not(.binders-filter-menu):not(.binders-picker)')`);
	const ok = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu:not(.binders-filter-menu):not(.binders-picker) .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}); if (!it) return false; it.click(); return true; })()`);
	if (!ok) throw new Error('no operator ' + title);
	await p.sleep(250);
}
/** Chooses the property of row `n`. */
export async function chooseProperty(p, n, title) {
	await click(p, `${rowSel(n)} .filter-property-select`);
	await until(p, `!!document.querySelector('${PICKER}')`);
	await pick(p, title);
	await p.sleep(250);
}
/** Ticks values in row `n`'s value list, then closes the list. */
export async function chooseValues(p, n, titles) {
	await click(p, `${rowSel(n)} .binders-filter-values`);
	await until(p, `!!document.querySelector('${PICKER}')`);
	for (const t of titles) await pick(p, t);
	await p.key('Escape');
	await p.sleep(300);
}
/** Types into row `n`'s text, number or date field, and waits for the page to follow. */
export async function typeValue(p, n, text) {
	await click(p, `${rowSel(n)} .filter-rhs-container input:not([type=checkbox])`);
	await p.key('a', 'ctrl');
	await p.type(text);
	await p.sleep(450);
}
/** Adds a row and chooses its property, operator (if not the first of the kind) and values. */
export async function addRow(p, { property, operator = null, values = null, text = null, nth = null }) {
	const have = await p.ev(`document.querySelectorAll('${ROW}').length`);
	let n = nth;
	if (n == null) {
		// (a half-made row at the end is the one to use, else a new one is added)
		const blank = await p.ev(`[...document.querySelectorAll('${ROW}')].findIndex(r => !r.querySelector('.filter-operator'))`);
		if (blank >= 0) n = blank; else { await click(p, `${POP} .binders-filter-add`); n = have; await p.sleep(200); }
	}
	await chooseProperty(p, n, property);
	if (operator) await chooseOperator(p, n, operator);
	if (values) await chooseValues(p, n, values);
	if (text != null) await typeValue(p, n, text);
	return n;
}
/** Clears the filter ("Clear filter" in the popover), which also closes it. */
export async function clearFilter(p) {
	await openFilter(p);
	if (await p.at(`${POP} .binders-filter-foot .text-icon-button`)) await click(p, `${POP} .binders-filter-foot .text-icon-button`);
	await p.sleep(300);
	await closeFilter(p);
	await closeMenus(p);
}
/** The filter as the old status and label menu had it: `status` and `label` are lists of values to keep ("No status" for
    none). Replaces whatever filter is on. */
export async function filterBy(p, { status = [], label = [] }) {
	await clearFilter(p);
	await openFilter(p);
	if (status.length) await addRow(p, { property: 'Status', values: status });
	if (label.length) await addRow(p, { property: 'Label', values: label });
	await closeFilter(p);
	await p.sleep(300);
}

/** What the old menu's tick did: toggles one status or label value (`kind`: 'status' or 'label'), opening the popover if
    it is not open and adding the row for that property if there is none. The popover is left open. */
export async function tick(p, kind, title) {
	await openFilter(p);
	const prop = kind === 'status' ? 'Status' : 'Label';
	let n = await p.ev(`[...document.querySelectorAll('${ROW}')].findIndex(r => r.querySelector('.filter-property-select .combobox-button-label')?.textContent === ${j(prop)})`);
	if (n < 0) n = await addRow(p, { property: prop });
	await chooseValues(p, n, [title]);
}

/** Toggles one status or label by its title, whichever it is ("No status" and "No label" too), and shuts the popover:
    the old menu's `filterBy(p, 'Draft')`. */
export async function filterToggle(p, title) {
	const labels = await p.ev(`app.plugins.plugins.binders.settings.labels.map(l => l.name)`);
	await tick(p, title === 'No label' || labels.includes(title) ? 'label' : 'status', title);
	await closeFilter(p);
}

// ---- by touch (a phone or a tablet in Obsidian's mobile mode, with touch emulated) ----

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
export async function tapAt(p, x, y) { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); }
/** Taps the centre of an element (scrolled into view first). */
export async function tapSel(p, sel, i = 0) {
	await p.ev(`document.querySelectorAll(${j(sel)})[${i}]?.scrollIntoView({ block: 'center' })`);
	await p.sleep(150);
	const at = await p.at(sel, i);
	if (!at) throw new Error('nothing to tap: ' + sel + ' #' + i);
	await tapAt(p, at.x, at.y);
}
/** Taps the picker's item with this title. */
export async function tapPick(p, title) {
	const i = await p.ev(`[...document.querySelectorAll('${PICKER} .menu-item:not(.binders-picker-none)')].findIndex(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)})`);
	if (i < 0) throw new Error(`nothing to pick called “${title}”`);
	await tapSel(p, `${PICKER} .menu-item:not(.binders-picker-none)`, i);
}
/** `tick`, by touch: opens the popover (the Filter button), makes the row for the property if there is none, and taps the
    value in its list. The popover is left open. */
export async function tapTick(p, kind, title) {
	if (!(await p.ev(`!!document.querySelector('${POP}')`))) { await tapSel(p, BUTTON); await until(p, `!!document.querySelector('${POP} .filter-row')`); }
	const prop = kind === 'status' ? 'Status' : 'Label';
	let n = await p.ev(`[...document.querySelectorAll('${ROW}')].findIndex(r => r.querySelector('.filter-property-select .combobox-button-label')?.textContent === ${j(prop)})`);
	if (n < 0) {
		n = await p.ev(`[...document.querySelectorAll('${ROW}')].findIndex(r => !r.querySelector('.filter-operator'))`);
		if (n < 0) { await tapSel(p, `${POP} .binders-filter-add`); n = await p.ev(`document.querySelectorAll('${ROW}').length - 1`); }
		await tapSel(p, `${rowSel(n)} .filter-property-select`);
		await until(p, `!!document.querySelector('${PICKER}')`);
		await tapPick(p, prop);
	}
	await tapSel(p, `${rowSel(n)} .binders-filter-values`);
	await until(p, `!!document.querySelector('${PICKER}')`);
	await tapPick(p, title);
	await p.key('Escape');
	await p.sleep(300);
}

/** Taps "Done" on a phone's sheet (the popover shuts). */
export async function tapDone(p) { await tapSel(p, `${POP} .modal-header-button`); }
/** The old sheet's pick, by touch: ticks one status or label by its title and shuts the popover. */
export async function tapToggle(p, title) {
	const labels = await p.ev(`app.plugins.plugins.binders.settings.labels.map(l => l.name)`);
	await tapTick(p, title === 'No label' || labels.includes(title) ? 'label' : 'status', title);
	await tapDone(p);
}
/** "Clear filter", by touch: opens the popover if it is shut, taps it, and it shuts. */
export async function tapClear(p) {
	if (!(await p.ev(`!!document.querySelector('${POP}')`))) { await tapSel(p, BUTTON); await until(p, `!!document.querySelector('${POP} .filter-row')`); }
	await tapSel(p, `${POP} .binders-filter-foot .text-icon-button`);
	await p.sleep(400);
}
