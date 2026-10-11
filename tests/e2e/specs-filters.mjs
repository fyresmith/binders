// Saved filters, step by step: the Filter popover (a condition on any property, in Bases' words), and what each mode
// shows under it. Each test makes its own binder, "Tide", with its characters and properties, in the throwaway vault.
import { B, VIEW, cards, closeMenus, file, j, openView, until, viewState, withTidy } from './view-helpers.mjs';
import { BUTTON, POP, PICKER, ROW, rowSel, addRow, chooseOperator, chooseProperty, chooseValues, clearFilter, clickEl, closeFilter, filterBy, openFilter, pick, pickerItems, rows, typeValue } from './filter-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'filters: ' + name, fn: withTidy(fn) });

const T = 'Tide';
const note = (path, props, body = 'Some words to count in this note.') => ({ path, text: `---\n${Object.entries(props).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : j(v)}`).join('\n')}\n---\n${body}\n` });
/** Tide: eight notes with a status, a label, characters (links, one with an alias), a target, a story date and a point of view. */
export const ITEMS = [
	note('Prologue.md', { status: 'Draft', label: 'Red', characters: ['[[Mara]]'], target: 1200, 'story-date': 1925, pov: 'Mara' }),
	note('One/Arrival.md', { status: 'Draft', label: 'Red', characters: ['[[Mara]]', '[[Harrow|the keeper]]'], target: 800, 'story-date': '1925-06-19', pov: 'Mara' }),
	note('One/Storm.md', { status: 'Revised', label: 'Blue', characters: ['[[Harrow]]'], 'story-date': '1926-02', pov: 'Harrow' }),
	note('Two/Wreck.md', { status: 'Idea', characters: ['Mara'], export: false, 'story-date': 'June 1925' }),
	note('Two/Lights.md', { characters: [], pov: 'Mara' }),
	note('Two/Dawn.md', { status: 'Draft', label: 'Green', characters: ['[[Harrow]]'], target: 3000 }),
	note('Epilogue.md', { status: 'Final', label: 'Green', characters: ['[[Mara]]'], target: 3000, 'story-date': '1930-01-01' }),
];
export const FILES = ['Prologue', 'One/Arrival', 'One/Storm', 'Two/Wreck', 'Two/Lights', 'Two/Dawn', 'Epilogue'].map((n) => `${T}/${n}.md`);

/** Makes Tide (and its cast, outside it), waits for it to be a binder, and opens its view in the mode. */
export async function tide(p, mode = 'corkboard', items = ITEMS) {
	// (a binder's view is opened as it was last left, by the binder note's path: not as an earlier test left it)
	await p.ev(`(() => { app.plugins.plugins.binders.lastView.clear(); app.workspace.detachLeavesOfType('binders-view'); document.querySelectorAll('.binders-filter-menu, .binders-picker').forEach(e => e.remove()); return 1; })()`);
	await p.ev(`(async () => {
		const a = app.vault.adapter, items = ${j(items)};
		for (const d of ['${T}', '${T}/One', '${T}/Two', 'Cast']) { try { await a.mkdir(d); } catch (e) { /* there */ } }
		for (const it of items) await a.write('${T}/' + it.path, it.text);
		await a.write('Cast/Mara.md', '---\\nrole: keeper\\n---\\nMara.\\n');
		await a.write('Cast/Harrow.md', '---\\nrole: keeper\\n---\\nHarrow.\\n');
		const list = ['Prologue', 'One/', 'One/Arrival', 'One/Storm', 'Two/', 'Two/Wreck', 'Two/Lights', 'Two/Dawn', 'Epilogue'];
		await a.write('${T}/${T}.md', '---\\nbinder: 1\\ncontents:\\n' + list.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('${T}'))?.length >= ${items.length} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('${T}/') || f.path.startsWith('Cast/')).every(f => app.metadataCache.getFileCache(f))`, 8000);
	await openView(p, T);
	if (mode !== 'corkboard') await setMode(p, mode);
}
export async function setMode(p, mode) {
	await p.ev(`${VIEW}.setMode(${j(mode)})`);
	await p.sleep(500);
}
const LEAF = '.workspace-leaf.mod-active';
const board = (p) => cards(p);
const rowsOf = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-row[data-path]')].map(r => r.dataset.path)`);
const propsOf = (p, path, key) => p.ev(`app.metadataCache.getFileCache(${file(path)})?.frontmatter?.[${j(key)}]`);
/** The paths of notes shown, in whatever mode, from the view itself. */
const shown = (p) => p.ev(`(() => { const v = ${VIEW}; return v.store.scenes(v.folder).filter(f => v.visible(f)).map(f => f.path); })()`);
const label = (p) => p.ev(`document.querySelector('${BUTTON} .text-button-label').textContent`);
const names = (list) => list.map((x) => x.replace(`${T}/`, '').replace('.md', ''));

test('the popover opens with a row to begin with, and its properties are listed in the designed order', async (p, h, t) => {
	await tide(p);
	await openFilter(p);
	t.eq(j((await rows(p)).map((r) => r.property)), j(['']), 'a row to begin with, with no property');
	await clickEl(p, `${rowSel(0)} .filter-property-select`);
	await until(p, `!!document.querySelector('${PICKER}')`);
	const titles = (await pickerItems(p)).map((i) => i.title);
	t.eq(j(titles), j(['Status', 'Label', 'Target', 'Story date', 'Include in export', 'characters', 'pov', 'Words', 'Title', 'Folder', 'Created', 'Modified']), 'Binders’ own, then the notes’ own properties, then the file’s: ' + j(titles));
	await p.key('Escape');
	await closeFilter(p);
	t.eq(await p.ev(`!!document.querySelector('${POP}')`), false, 'Escape twice shuts both');
	t.eq(await label(p), 'Filter', 'a row with nothing in it is no filter');
	t.eq(j(await shown(p)).length > 0, true, 'and everything shows');
	t.eq((await shown(p)).length, 7, 'all seven notes');
});

test('status and label: the values in use, several at once, “No status”; the button counts conditions; the state keeps the old shape', async (p, h, t) => {
	await tide(p);
	await openFilter(p);
	await chooseProperty(p, 0, 'Status');
	t.eq(j((await rows(p))[0].operator), j('is'), 'a status is …');
	await clickEl(p, `${rowSel(0)} .binders-filter-values`);
	await until(p, `!!document.querySelector('${PICKER}')`);
	const items = await pickerItems(p);
	t.eq(j(items.map((i) => i.title)), j(['Idea', 'Draft', 'Revised', 'Final', 'No status']), 'the statuses in use in settings’ order, and “No status”: ' + j(items));
	t.eq(j(items.map((i) => i.count)), j(['1', '3', '1', '1', null]), 'with how many notes have each');
	await pick(p, 'Draft');
	await pick(p, 'No status');
	await p.key('Escape');
	await p.sleep(400);
	t.eq(j(names(await shown(p))), j(['Prologue', 'One/Arrival', 'Two/Lights', 'Two/Dawn']), 'Draft or no status shows those four');
	t.eq(await label(p), 'Filter (1)', 'the button counts the one condition');
	t.eq(j((await viewState(p)).filter), j({ status: ['Draft', ''], label: [] }), 'the view’s state is the shape an older Binders reads');
	await closeFilter(p);
	t.eq(j((await cards(p)).map((c) => c.replace(`${T}/`, ''))), j(['Prologue.md', 'One', 'Two']), 'the corkboard: the note, and the two folders with something to show');
	// a label as well
	await openFilter(p);
	await addRow(p, { property: 'Label', values: ['Red'] });
	t.eq(j(names(await shown(p))), j(['Prologue', 'One/Arrival']), 'and a Red label as well: both hold');
	t.eq(await label(p), 'Filter (2)', 'two conditions');
	t.eq(j((await viewState(p)).filter), j({ status: ['Draft', ''], label: ['Red'] }), 'still the older shape');
	await closeFilter(p);
});

test('a link is the note it names, whatever it shows; a name typed plain is the same name', async (p, h, t) => {
	await tide(p);
	await openFilter(p);
	await addRow(p, { property: 'characters' });
	t.eq(j((await rows(p))[0].operator), j('contains any of'), 'a list: contains any of');
	await clickEl(p, `${rowSel(0)} .binders-filter-values`);
	await until(p, `!!document.querySelector('${PICKER}')`);
	const items = await pickerItems(p);
	t.eq(j(items.map((i) => i.title)), j(['Mara', 'Harrow']), 'the people in use, a link by the note’s name, an alias not a person of its own: ' + j(items));
	t.eq(j(items.map((i) => i.count)), j(['4', '3']), 'Mara in four notes (one typed plain), Harrow in three (one under an alias)');
	await pick(p, 'Harrow');
	await p.key('Escape');
	await p.sleep(400);
	t.eq(j(names(await shown(p))), j(['One/Arrival', 'One/Storm', 'Two/Dawn']), 'Harrow, also where he is “the keeper”');
	await chooseOperator(p, 0, 'does not contain any of');
	t.eq(j(names(await shown(p))), j(['Prologue', 'Two/Wreck', 'Two/Lights', 'Epilogue']), 'not Harrow');
	await chooseOperator(p, 0, 'contains all of');
	await chooseValues(p, 0, ['Mara']);
	t.eq(j(names(await shown(p))), j(['One/Arrival']), 'Harrow and Mara both');
	await closeFilter(p);
});

test('a number, a date and a checkbox: the operators of each, a date typed as a writer writes it', async (p, h, t) => {
	await tide(p);
	await openFilter(p);
	await addRow(p, { property: 'Target', operator: '≥', text: '1000' });
	t.eq(j(names(await shown(p))), j(['Prologue', 'Two/Dawn', 'Epilogue']), 'a target of 1,000 or more');
	await chooseProperty(p, 0, 'Story date');
	t.eq(j((await rows(p))[0].operator), j('on'), 'a date: on');
	await chooseOperator(p, 0, 'before');
	await typeValue(p, 0, 'someday');
	t.eq((await rows(p))[0].error?.slice(0, 18), 'That isn’t a date.', 'text that is not a date is said so on the row');
	t.eq((await shown(p)).length, 7, 'and a row that cannot be read filters nothing');
	await typeValue(p, 0, 'June 1925');
	t.eq(j(names(await shown(p))), j([]), 'before June 1925: nothing dated is wholly before it');
	await chooseOperator(p, 0, 'on');
	t.eq(j(names(await shown(p))), j(['Prologue', 'One/Arrival', 'Two/Wreck']), 'on June 1925: the year 1925 could be, the 19th is, “June 1925” is');
	await chooseOperator(p, 0, 'after');
	t.eq(j(names(await shown(p))), j(['One/Storm', 'Epilogue']), 'after June 1925: wholly after the 30th');
	await chooseProperty(p, 0, 'Include in export');
	t.eq((await rows(p))[0].value, 'true', 'a checkbox: checked');
	t.eq(names(await shown(p)).includes('Two/Wreck'), false, 'checked: not the one left out of the export (a note that says nothing is in it)');
	t.eq((await shown(p)).length, 6, 'the other six');
	await clickEl(p, `${rowSel(0)} input[type=checkbox]`);
	await p.sleep(300);
	t.eq(j(names(await shown(p))), j(['Two/Wreck']), 'unchecked: only the one left out of the export');
	await closeFilter(p);
});

test('any and none of the conditions; rows removed; Clear filter', async (p, h, t) => {
	await tide(p);
	await openFilter(p);
	await addRow(p, { property: 'Status', values: ['Final'] });
	await addRow(p, { property: 'Target', operator: '<', text: '1000' });
	t.eq(j(names(await shown(p))), j([]), 'both: a Final note with a target under 1,000: none');
	t.eq(await p.ev(`!!document.querySelector('${POP} select.conjunction')`), true, 'with more than one, a choice of how they combine');
	await p.ev(`(() => { const s = document.querySelector('${POP} select.conjunction'); s.value = 'any'; s.dispatchEvent(new Event('change')); })()`);
	await p.sleep(400);
	t.eq(j(names(await shown(p))), j(['One/Arrival', 'Epilogue']), 'any: Final, or a target under 1,000');
	t.eq(j((await rows(p)).map((r) => r.conj)), j(['where', 'or']), 'the words say so');
	await p.ev(`(() => { const s = document.querySelector('${POP} select.conjunction'); s.value = 'none'; s.dispatchEvent(new Event('change')); })()`);
	await p.sleep(400);
	t.eq(j(names(await shown(p))), j(['Prologue', 'One/Storm', 'Two/Wreck', 'Two/Lights', 'Two/Dawn']), 'none: all the others');
	t.eq(j((await rows(p)).map((r) => r.conj)), j(['not', 'nor']), 'nor');
	await clickEl(p, `${rowSel(1)} .filter-row-actions button`);
	await p.sleep(300);
	t.eq(j((await rows(p)).length), '1', 'a row removed');
	t.eq(await p.ev(`!!document.querySelector('${POP} select.conjunction')`), false, 'and the choice goes with the second');
	await clearFilter(p);
	t.eq((await shown(p)).length, 7, 'Clear filter shows every note');
	t.eq(await label(p), 'Filter', 'and the button says so');
	t.eq(j((await viewState(p)).filter), j({ status: [], label: [] }), 'the state is the older empty shape');
});

test('the keyboard: Enter on the button opens it, Tab and Enter choose, Escape shuts a list then the popover, and focus goes back', async (p, h, t) => {
	await tide(p);
	await p.ev(`document.querySelector('${BUTTON}').focus()`);
	await p.key('Enter');
	await until(p, `!!document.querySelector('${POP}')`);
	await p.sleep(300);
	t.eq(await p.ev(`document.activeElement?.classList.contains('filter-property-select')`), true, 'the first thing to choose has the keyboard');
	await p.key('Enter');
	await until(p, `!!document.querySelector('${PICKER}')`);
	t.eq(await p.ev(`document.activeElement?.classList.contains('binders-picker-input')`), true, 'the list’s search field has it');
	await p.type('sta');
	await p.sleep(150);
	t.eq(j((await pickerItems(p)).map((i) => i.title)), j(['Status']), 'search narrows the list');
	await p.key('Enter');
	await p.sleep(300);
	t.eq(j((await rows(p))[0].property), j('Status'), 'Enter picks the first');
	await p.ev(`document.querySelector('${ROW} .binders-filter-values').focus()`);
	await p.key('Enter');
	await until(p, `!!document.querySelector('${PICKER}')`);
	await p.key('ArrowDown');
	await p.key('Enter');
	await p.sleep(300);
	t.eq(j((await rows(p))[0].value).length > 4, true, 'arrows and Enter tick a value: ' + j((await rows(p))[0].value));
	await p.key('Escape');
	await p.sleep(200);
	t.eq(await p.ev(`!!document.querySelector('${PICKER}')`), false, 'Escape shuts the list');
	t.eq(await p.ev(`!!document.querySelector('${POP}')`), true, 'and not the popover');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await p.ev(`!!document.querySelector('${POP}')`), false, 'a second Escape shuts it');
	t.eq(await p.ev(`document.activeElement === document.querySelector('${BUTTON}')`), true, 'and the keyboard is back on the Filter button');
});

test('a filter saved by 0.51 opens as the same filter, and nothing is written to any note', async (p, h, t) => {
	await tide(p);
	const before = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
	await p.ev(`(async () => { const l = app.workspace.getMostRecentLeaf(); const s = l.getViewState(); await l.setViewState({ ...s, state: { ...s.state, filter: { status: ['draft'], label: ['Red'] } } }); })().then(() => 1)`);
	await p.sleep(500);
	t.eq(j(names(await shown(p))), j(['Prologue', 'One/Arrival']), 'the old two lists filter as they did');
	t.eq(await label(p), 'Filter (2)', 'as two conditions');
	await openFilter(p);
	const r = await rows(p);
	t.eq(j(r.map((x) => [x.property, x.operator, x.value])), j([['Status', 'is', 'Draft'], ['Label', 'is', 'Red']]), 'and the popover shows them, spelled as settings spell them: ' + j(r));
	await closeFilter(p);
	const after = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
	t.eq(j(after), j(before), 'opening, reading and closing it wrote nothing to any note');
});

test('values asked for that no note has are kept and said; a property no note has is said', async (p, h, t) => {
	await tide(p);
	await openFilter(p);
	await addRow(p, { property: 'characters' });
	await clickEl(p, `${rowSel(0)} .binders-filter-values`);
	await until(p, `!!document.querySelector('${PICKER}')`);
	await p.type('Pell');
	await p.sleep(150);
	t.eq(j((await pickerItems(p)).map((i) => i.title)), j(['Use “Pell”']), 'a name nobody has yet can be used as typed');
	await p.key('Enter');
	await p.key('Escape');
	await p.sleep(400);
	t.eq((await shown(p)).length, 0, 'nobody is Pell: nothing shows');
	t.eq((await rows(p))[0].error, 'No note here has “Pell” as its characters'.replace('as its characters', 'in its characters'), 'and the row says that nobody has: ' + j(await rows(p)));
	await closeFilter(p);
	await p.sleep(300);
	t.eq(await p.ev(`!!document.querySelector('${LEAF} .binders-empty')`), true, 'the board says nothing is shown');
});

// ---- the scope line, the counts, the way back ----

const scope = (p) => p.ev(`(() => { const s = document.querySelector('${LEAF} .binders-scope'); if (!s || s.classList.contains('is-hidden')) return null; return { name: s.querySelector('.binders-scope-name')?.textContent, count: s.querySelector('.binders-scope-count')?.textContent, all: s.querySelector('.binders-scope-all .text-button-label')?.textContent, tip: s.querySelector('.binders-scope-name')?.title }; })()`);
const wordsSaid = (p) => p.ev(`document.querySelector('${LEAF} .binders-word-count')?.textContent`);

test('the scope line says the filter, how many notes show, and the way back; the word count is the words shown of the whole', async (p, h, t) => {
	await tide(p);
	t.eq(await scope(p), null, 'with no filter there is no line');
	const whole = await wordsSaid(p);
	await filterBy(p, { status: ['Draft'] });
	const s = await scope(p);
	t.eq(j([s.name, s.count, s.all]), j(['Filter', '3 of 7 notes', 'Show the whole binder']), 'under a filter: its name, the count, the way back: ' + j(s));
	t.eq(s.tip, 'Status is Draft', 'and its conditions in a tooltip');
	t.ok(/^\d+ of /.test(await wordsSaid(p)), 'the toolbar’s count is the words shown, of the whole: ' + await wordsSaid(p) + ' (' + whole + ')');
	await clickEl(p, `${LEAF} .binders-scope-all`);
	await p.sleep(400);
	t.eq(await scope(p), null, '“Show the whole binder” takes the line away');
	t.eq((await shown(p)).length, 7, 'and all seven notes show');
	t.eq(j((await viewState(p)).filter), j({ status: [], label: [] }), 'the filter is off in the state');
	t.eq(await label(p), 'Filter', 'and on its button');
	// a click on its name opens the popover
	await filterBy(p, { status: ['Draft'] });
	await clickEl(p, `${LEAF} .binders-scope-name`);
	await until(p, `!!document.querySelector('${POP}')`);
	t.eq(j((await rows(p)).map((r) => r.property)), j(['Status']), 'the name opens the popover');
	await closeFilter(p);
});

test('inside a folder the line says the folder, not the binder', async (p, h, t) => {
	await tide(p);
	await filterBy(p, { status: ['Draft'] });
	await openView(p, `${T}/Two`);
	const s = await scope(p);
	t.eq(j([s.count, s.all]), j(['1 of 3 notes', 'Show the whole folder']), 'the filter belongs to the binder, applies to the folder shown: ' + j(s));
	await clickEl(p, `${LEAF} .binders-scope-all`);
	await p.sleep(300);
	t.eq((await shown(p)).length, 3, 'the whole folder');
});

test('a folder none of whose notes match is hidden in the corkboard, the outliner and the manuscript; one with some says how many', async (p, h, t) => {
	await tide(p);
	await filterBy(p, { status: ['Draft'] });
	t.eq(j((await cards(p)).map((c) => c.replace(`${T}/`, ''))), j(['Prologue.md', 'One', 'Two']), 'the corkboard: the note and the two folders with a match');
	const text = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path="${T}/One"], ${LEAF} .binders-card[data-path="${T}/Two"]')].map(c => c.textContent)`);
	t.ok(/1 of 2 notes/.test(text[0]) && /1 of 3 notes/.test(text[1]), 'a folder’s card says how many of its notes show: ' + j(text));
	await filterBy(p, { status: ['Final'] });
	t.eq(j((await cards(p)).map((c) => c.replace(`${T}/`, ''))), j(['Epilogue.md']), 'Final: no folder has one, so no folder shows');
	await setMode(p, 'outliner');
	t.eq(j((await rowsOf(p)).map((c) => c.replace(`${T}/`, ''))), j(['Epilogue.md']), 'the outliner agrees');
	await setMode(p, 'manuscript');
	await p.sleep(500);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-title')].map(e => e.textContent)`)), j(['Epilogue']), 'and so does the manuscript');
	await setMode(p, 'corkboard');
	await filterBy(p, { status: ['Final'], label: ['Red'] });
	t.eq((await cards(p)).length, 0, 'a filter nothing passes shows no cards');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-empty-title')?.textContent`), 'No notes match the filter', 'and says so');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-empty-action .text-button-label')?.textContent`), 'Show the whole binder', 'with the way out');
	await clickEl(p, `${LEAF} .binders-empty-action`);
	await p.sleep(400);
	t.eq((await cards(p)).length, 4, 'which shows everything again');
	t.eq(await scope(p), null, 'and the line goes');
});

test('a property’s kind is the type Obsidian gives it, and otherwise what its values are', async (p, h, t) => {
	// "stars" holds text that reads as numbers (notes typed by hand); Obsidian's Properties says it is a number
	const items = ITEMS.map((it, i) => (i < 3 ? { ...it, text: it.text.replace('---\n', `---\nstars: "${i + 1}"\nplace: ${['Quay', 'Rock', 'Quay'][i]}\n`) } : it));
	await tide(p, 'corkboard', items);
	const known = await p.ev(`typeof app.metadataTypeManager?.getAssignedWidget === 'function'`);
	t.eq(known, true, 'this Obsidian has the type manager the filter asks (src/view/internals.ts propertyType)');
	await p.ev(`app.metadataTypeManager.setType('stars', 'number')`);
	await p.sleep(300);
	await openFilter(p);
	await addRow(p, { property: 'stars' });
	t.eq(j((await rows(p))[0].operator), j('='), 'a property Obsidian types as a number is read as one: its operators are a number’s');
	await chooseOperator(p, 0, '≥');
	await typeValue(p, 0, '2');
	t.eq(j(names(await shown(p))), j(['One/Arrival', 'One/Storm']), 'and compares as numbers (2 and 3, though the notes hold text)');
	await chooseProperty(p, 0, 'place');
	t.eq(j((await rows(p))[0].operator), j('is'), 'a property with no type, holding text, is text');
	await closeFilter(p);
	await p.ev(`app.metadataTypeManager.setType('stars', 'text')`);
});

test('the manuscript says where notes were left out: “2 notes not shown” between sections that are not neighbours, with their names', async (p, h, t) => {
	await tide(p, 'manuscript');
	await filterBy(p, { status: ['Draft'] });
	await p.sleep(600);
	const gaps = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-gap')].map(g => ({ text: g.textContent, title: g.title, aria: g.getAttribute('aria-label'), role: g.getAttribute('role'), tab: g.tabIndex, end: g.classList.contains('is-after') }))`);
	t.eq(j(gaps.map((g) => g.text)), j(['1 note not shown', '2 notes not shown', '1 note not shown']), 'one for Storm, one for Wreck and Lights, one for the Epilogue at the end: ' + j(gaps));
	t.eq(gaps[1].title, 'Wreck, Lights', 'the names are in its tooltip');
	t.eq(gaps[1].aria, '2 notes not shown: Wreck, Lights', 'and said to a screen reader');
	t.ok(gaps.every((g) => g.role === 'note' && g.tab === 0), 'each can be reached with Tab');
	t.eq(gaps.map((g) => g.end).join(), 'false,false,true', 'the last is after the last section');
	await clearFilter(p);
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript-gap').length`), 0, 'with no filter there are none');
});
