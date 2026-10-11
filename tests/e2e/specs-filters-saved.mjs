// Saved filters kept with the binder: the `filters` property of the binder note, written by the store and nothing else in any
// note, with what it doesn't understand left alone, never in a binder of a newer format or a Longform project, followed when
// it is edited by hand or arrives by sync, and each save, rename, duplicate, delete and move one step of Undo.
import { B, PL, VIEW, answer, file, j, openView, read, texts, until, viewState, withTidy } from './view-helpers.mjs';
import { POP, addRow, chooseOperator, clickEl, closeFilter, filterBy, openFilter, rows, typeValue } from './filter-helpers.mjs';
import { tide, ITEMS } from './specs-filters.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'filters saved: ' + name, fn: withTidy(fn) });
const T = 'Tide', NOTE = `${T}/${T}.md`, LEAF = '.workspace-leaf.mod-active';

const fm = (p, path = NOTE) => p.ev(`app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? null`);
const filtersOf = async (p) => (await fm(p))?.filters ?? null;
const names = async (p) => ((await filtersOf(p)) ?? []).map((f) => f?.name ?? null);
const shown = (p) => p.ev(`(() => { const v = ${VIEW}; return v.store.scenes(v.folder).filter(f => v.visible(f)).map(f => f.basename); })()`);
const waitFilters = (p, expr) => until(p, `(() => { const f = app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.filters; return ${expr}; })()`, 6000);
const SAVED = `${POP} .bases-toolbar-menu-item`;
const savedNames = (p) => p.ev(`[...document.querySelectorAll('${SAVED} .bases-toolbar-menu-item-name, ${SAVED} input.binders-filter-name')].map(e => e.value ?? e.textContent)`);
async function rowMenu(p, name, item) {
	const i = (await savedNames(p)).indexOf(name);
	await clickEl(p, `${SAVED} .bases-toolbar-menu-action-icon`, i);
	await until(p, `!!document.querySelector('.menu:not(.binders-filter-menu):not(.binders-picker)')`);
	await p.ev(`[...document.querySelectorAll('.menu:not(.binders-filter-menu):not(.binders-picker) .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === ${j(item)}).click()`);
	await p.sleep(500);
}
/** Saves the filter that is on, under a name, through the popover's own “Save as…”. */
async function saveAs(p, name) {
	await openFilter(p);
	await clickEl(p, `${POP} .binders-filter-foot .text-icon-button`);
	await until(p, `!!document.querySelector('${POP} .binders-filter-foot input.binders-filter-name')`);
	await p.type(name);
	await p.key('Enter');
	await p.sleep(700);
}
async function twoRows(p) {
	await openFilter(p);
	await addRow(p, { property: 'Status', values: ['Draft'] });
	await addRow(p, { property: 'characters', values: ['Mara'] });
}

test('Save as… writes the filter into the binder note’s `filters` and nothing else anywhere; the name is on the line and in the state', async (p, h, t) => {
	await tide(p);
	await p.ev(`${B}.undos = []; ${B}.redos = []`);
	const before = await texts(p);
	await twoRows(p);
	await closeFilter(p);
	t.eq(j(await shown(p)), j(['Prologue', 'Arrival']), 'a filter on: Draft, with Mara');
	await saveAs(p, 'Mara, drafts');
	await waitFilters(p, `Array.isArray(f) && f.length === 1`);
	t.eq(j(await filtersOf(p)), j([{ name: 'Mara, drafts', conditions: [{ property: 'status', operator: 'is', value: 'Draft' }, { property: 'characters', operator: 'contains any of', value: '[[Mara]]' }] }]), 'written as the file format says: one value plain, no match when all');
	const after = await texts(p);
	const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
	t.eq(j(changed), j([NOTE]), 'only the binder note changed');
	const b = before[NOTE].split('---')[1], a = after[NOTE].split('---')[1];
	t.ok(a.replace(/filters:[\s\S]*$/, '').trim() === b.trim() || a.startsWith(b.trim().split('\n')[0]), 'its binder and contents lines are as they were');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-scope-name')?.textContent`), 'Mara, drafts', 'the line says its name');
	t.eq(j(await savedNames(p)), j(['Mara, drafts']), 'the popover lists it, ticked');
	t.eq(j((await viewState(p)).filter), j({ name: 'Mara, drafts', conditions: [{ property: 'status', operator: 'is', value: 'Draft' }, { property: 'characters', operator: 'contains any of', value: '[[Mara]]' }] }), 'the view’s state has its name, so it comes back with the tab');
	t.eq(j(await p.ev(`${B}.undos.map(e => e.label)`)), j(['Save the filter “Mara, drafts”']), 'it is a step of Undo');
	await closeFilter(p);
});

test('changing a saved filter changes it at once, in the note; another can be chosen; a name that is taken is refused', async (p, h, t) => {
	await tide(p);
	await twoRows(p);
	await saveAs(p, 'First');
	await clickEl(p, `${POP} .binders-filter-foot .text-icon-button`);
	await p.sleep(400);
	await filterBy(p, { status: ['Final'] });
	await saveAs(p, 'first');
	t.eq(await p.ev(`document.querySelector('${POP} .binders-filter-said.mod-error')?.textContent`), 'There is a filter of that name', 'a name that is taken (in any case) is said so');
	await p.key('Escape');
	await saveAs(p, 'Finals');
	t.eq(j(await names(p)), j(['First', 'Finals']), 'two saved');
	// choose the first, change a condition: it is written
	await openFilter(p);
	await clickEl(p, `${SAVED}`, 0);
	await p.sleep(500);
	t.eq(j(await shown(p)), j(['Prologue', 'Arrival']), 'choosing it puts its conditions on');
	await openFilter(p);
	await chooseOperator(p, 1, 'does not contain any of');
	await waitFilters(p, `f?.[0]?.conditions?.[1]?.operator === 'does not contain any of'`);
	t.eq(j((await filtersOf(p))[0].conditions[1].operator), j('does not contain any of'), 'a changed operator is in the note');
	t.eq(j((await filtersOf(p))[1].name), j('Finals'), 'and the other filter is as it was');
	await closeFilter(p);
});

test('rename, duplicate, move up and down and delete: each one step of Undo, and Undo takes it back', async (p, h, t) => {
	await tide(p);
	await p.ev(`${B}.undos = []; ${B}.redos = []`);
	await twoRows(p);
	await saveAs(p, 'One');
	await filterBy(p, { status: ['Final'] });
	await saveAs(p, 'Two');
	await openFilter(p);
	await rowMenu(p, 'One', 'Duplicate');
	await waitFilters(p, `f?.length === 3`);
	t.eq(j(await names(p)), j(['One', 'One 2', 'Two']), 'duplicate: right after it, with its own name');
	await rowMenu(p, 'Two', 'Move up');
	await waitFilters(p, `f?.[1]?.name === 'Two'`);
	t.eq(j(await names(p)), j(['One', 'Two', 'One 2']), 'move up');
	await rowMenu(p, 'One', 'Move down');
	await waitFilters(p, `f?.[0]?.name === 'Two'`);
	t.eq(j(await names(p)), j(['Two', 'One', 'One 2']), 'move down');
	await rowMenu(p, 'One 2', 'Rename');
	await p.key('a', 'ctrl');
	await p.type('Mara again');
	await p.key('Enter');
	await waitFilters(p, `f?.[2]?.name === 'Mara again'`);
	t.eq(j(await names(p)), j(['Two', 'One', 'Mara again']), 'rename');
	await rowMenu(p, 'Mara again', 'Delete');
	await waitFilters(p, `f?.length === 2`);
	t.eq(j(await names(p)), j(['Two', 'One']), 'delete');
	t.eq(j(await p.ev(`${B}.undos.map(e => e.label)`)), j(['Save the filter “One”', 'Save the filter “Two”', 'Duplicate the filter “One”', 'Move the filter “Two” up', 'Move the filter “One” down', 'Rename the filter “One 2” to “Mara again”', 'Delete the filter “Mara again”']), 'seven steps, said as what they were');
	await closeFilter(p);
	for (const [want, n] of [[['Two', 'One', 'Mara again'], 1], [['Two', 'One', 'One 2'], 2], [['One', 'Two', 'One 2'], 3]]) {
		await p.ev(`${PL}.undoMove(app.vault.getAbstractFileByPath('${T}'), false).then(() => 1)`);
		await p.sleep(900);
		t.eq(j(await names(p)), j(want), `Undo ${n}`);
	}
	await p.ev(`${PL}.undoMove(app.vault.getAbstractFileByPath('${T}'), true).then(() => 1)`);
	await p.sleep(900);
	t.eq(j(await names(p)), j(['Two', 'One', 'One 2']), 'and Redo');
});

test('what the note holds that Binders does not know is kept: other entries and keys, the other properties of the binder note', async (p, h, t) => {
	await tide(p);
	const note = await read(p, NOTE);
	const odd = note.replace('---\n', `---\ninspector:\n  pins:\n    - pov\nrevision:\n  note: Revision\nfilters:\n  - name: By hand\n    mood: grim\n    conditions:\n      - property: pov\n        operator: is\n        value: Mara\n      - all:\n          - property: x\n            operator: is\n            value: y\n  - just a line\n  - unnamed: true\n`);
	await p.ev(`app.vault.adapter.write(${j(NOTE)}, ${j(odd)}).then(() => 1)`);
	await until(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.revision?.note === 'Revision'`);
	await p.sleep(500);
	await twoRows(p);
	await saveAs(p, 'Mine');
	await waitFilters(p, `f?.length === 4`);
	const f = await filtersOf(p), keys = await fm(p);
	t.eq(j(f[0]), j({ name: 'By hand', mood: 'grim', conditions: [{ property: 'pov', operator: 'is', value: 'Mara' }, { all: [{ property: 'x', operator: 'is', value: 'y' }] }] }), 'a filter with a key and a condition Binders does not know is as it was');
	t.eq(j([f[1], f[2]]), j(['just a line', { unnamed: true }]), 'entries that are not filters are kept, in their place');
	t.eq(f[3].name, 'Mine', 'and ours is after them');
	t.eq(j([keys.inspector, keys.revision]), j([{ pins: ['pov'] }, { note: 'Revision' }]), 'the binder note’s `inspector` and `revision` are untouched');
	t.ok(Array.isArray(keys.contents) && keys.binder === 1, 'and so are `binder` and `contents`');
	// the other way: what the other writers write is not lost by changing the filter
	await openFilter(p);
	await chooseOperator(p, 0, 'is not');
	await waitFilters(p, `f?.[3]?.conditions?.[0]?.operator === 'is not'`);
	const after = await fm(p);
	t.eq(j([after.inspector, after.revision, (after.filters)[0].mood]), j([{ pins: ['pov'] }, { note: 'Revision' }, 'grim']), 'a condition changed afterwards: still all there');
	await closeFilter(p);
});

test('a binder of a newer format and a Longform project: a filter can be put on, but not saved, and nothing is written', async (p, h, t) => {
	await tide(p);
	const note = await read(p, NOTE);
	await p.ev(`app.vault.adapter.write(${j(NOTE)}, ${j(note.replace('binder: 1', 'binder: 2'))}).then(() => 1)`);
	await until(p, `!!${B}.problem('${T}')`);
	await openView(p, T);
	const before = await texts(p);
	await filterBy(p, { status: ['Draft'] });
	await openFilter(p);
	const cant = await p.ev(`(() => { const b = document.querySelector('${POP} .binders-filter-foot .text-icon-button'); return { disabled: b?.classList.contains('is-disabled'), why: b?.getAttribute('aria-label') }; })()`);
	t.eq(cant.disabled, true, 'newer format: “Save as…” is disabled');
	t.ok(/newer version/.test(cant.why ?? ''), 'and says why: ' + cant.why);
	await clickEl(p, `${POP} .binders-filter-foot .text-icon-button`);
	t.eq(await p.ev(`!!document.querySelector('${POP} input.binders-filter-name')`), false, 'pressing it asks for no name');
	await closeFilter(p);
	t.eq(j(await texts(p)), j(before), 'nothing is written');
	// a Longform project
	await openView(p, 'Longform demo');
	await filterBy(p, { status: ['Draft'] });
	await openFilter(p);
	const lf = await p.ev(`(() => { const b = document.querySelector('${POP} .binders-filter-foot .text-icon-button'); return { disabled: b?.classList.contains('is-disabled'), why: b?.getAttribute('aria-label') }; })()`);
	t.eq(lf.disabled, true, 'a Longform project: “Save as…” is disabled');
	t.ok(/convert/i.test(lf.why ?? ''), 'and says to convert it to a binder: ' + lf.why);
	t.ok((await shown(p)).length >= 0, 'while the filter itself works');
	await closeFilter(p);
	t.eq(j(await texts(p)), j(before), 'and nothing is written there either');
});

test('a saved filter edited by hand or arriving by sync is followed while it is on; one deleted elsewhere stays on, not saved, and says so', async (p, h, t) => {
	await tide(p);
	await twoRows(p);
	await saveAs(p, 'Followed');
	await closeFilter(p);
	await p.sleep(1800);
	t.eq(j(await shown(p)), j(['Prologue', 'Arrival']), 'on');
	// by hand: Draft becomes Final
	const note = await read(p, NOTE);
	await p.ev(`app.vault.adapter.write(${j(NOTE)}, ${j(note.replace('value: Draft', 'value: Final'))}).then(() => 1)`);
	await until(p, `${VIEW}.visible(app.vault.getAbstractFileByPath('${T}/Epilogue.md'))`, 6000);
	t.eq(j(await shown(p)), j(['Epilogue']), 'the view follows the note: Final, with Mara');
	t.eq(j((await viewState(p)).filter.conditions[0].value), j('Final'), 'and so does its state');
	// deleted elsewhere
	const note2 = await read(p, NOTE);
	await p.ev(`app.vault.adapter.write(${j(NOTE)}, ${j(note2.replace(/filters:[\s\S]*?\n---/, '---'))}).then(() => 1)`);
	await until(p, `!${VIEW}.subset.def.name`, 6000);
	t.eq(await p.ev(`${VIEW}.subset.def.name ?? null`), null, 'the filter has no name any more');
	t.eq(j(await shown(p)), j(['Epilogue']), 'but still its conditions');
	t.ok(/deleted elsewhere/.test(await p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent).join(' | ')`)), 'and the writer is told');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-scope-name')?.textContent`), 'Filter', 'the line says “Filter”');
});

test('a filter that is on is remembered for the tab and the binder with its name', async (p, h, t) => {
	await tide(p);
	await twoRows(p);
	await saveAs(p, 'Remembered');
	await closeFilter(p);
	await p.ev(`app.workspace.requestSaveLayout.run?.()`);
	t.eq((await viewState(p)).filter.name, 'Remembered', 'the tab’s state has the name');
	t.eq(await p.ev(`${PL}.lastView.get(${j(NOTE)})?.filter?.name ?? null`), 'Remembered', 'and so does the binder’s, to open it as it was left');
});

test('renaming a status or a label in settings renames it in the saved filters in the same pass, and in the notes the writer agrees to', async (p, h, t) => {
	await tide(p);
	await twoRows(p);
	await saveAs(p, 'Mara drafts');
	await closeFilter(p);
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await p.sleep(600);
	await p.ev(`(() => { const s = ${PL}.settings; s.statuses = s.statuses.map(x => x === 'Draft' ? 'First draft' : x); const tab = app.setting.activeTab; window.__done = tab.renamed('status', 'Draft', 'First draft').then(() => 1); return 1; })()`);
	t.ok(await answer(p, 'Change them'), 'the notes are asked, as they always were');
	await p.ev(`window.__done`);
	await waitFilters(p, `f?.[0]?.conditions?.[0]?.value === 'First draft'`);
	t.eq(j((await filtersOf(p))[0].conditions.map((c) => c.value)), j(['First draft', '[[Mara]]']), 'the filter names the new status, and its other condition is as it was');
	t.eq(await p.ev(`app.metadataCache.getFileCache(${file(T + '/Prologue.md')})?.frontmatter?.status`), 'First draft', 'and the notes that had it');
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
});
