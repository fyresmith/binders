// The outliner's summaries (src/view/outliner-summary.ts, drawFoot and summaryMenu in src/view/outliner.ts): the last row
// in sight at the foot, a summary chosen for each column from Bases' list, "By value" for a column of names with a value
// chosen to put on a filter (and every count agreeing with the filter's), and the Revision column with its pane.
import { LEAF } from './filter-helpers.mjs';
import { VIEW, file, j, openView, read, until } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn, extra = {}) => specs.push({ name: 'outliner summaries: ' + name, fn, ...extra });

const L = 'The Lighthouse/';
// (the one binder view open: the Revision pane, once open, can be the active tab)
const O = '.workspace-leaf .binders-view .binders-outliner';
const F = `${O} .binders-outliner-foot`;
const NOTES = ['Prologue.md', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md'];

async function open(p, cols, folder = 'The Lighthouse') {
	await openView(p, folder);
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: ${j(cols)} } }; v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('${O} .binders-outliner-row')`, 5000);
	await until(p, `/\\d/.test(document.querySelector('${F} [data-col="words"]')?.textContent ?? 'x')`, 5000);
	await p.sleep(250);
}
/** The last row: each cell's text. */
const foot = (p) => p.ev(`[...document.querySelectorAll('${F} .binders-outliner-cell:not(.mod-filler)')].map(c => c.textContent)`);
const footOf = (p, col) => p.ev(`document.querySelector('${F} [data-col=${j(col)}]')?.textContent ?? null`);
async function clickFoot(p, col) {
	const c = await p.at(`${F} [data-col=${j(col)}]`);
	await p.click(c.x, c.y);
	await until(p, `!!document.querySelector('.menu')`);
	await p.sleep(150);
}
/** The open menu's rows: a plain title, or for a value [name, its count]. */
const menuRows = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item')].map(e => { const n = e.querySelector('.binders-summary-value-name'); return n ? [n.textContent, e.querySelector('.binders-summary-value-count').textContent] : e.textContent.trim(); })`);
const checked = (p) => p.ev(`[...document.querySelectorAll('.menu .menu-item')].filter(e => e.classList.contains('mod-checked') || e.classList.contains('is-checked') || e.querySelector('.mod-checked')).map(e => e.textContent.trim())`);
const choose = (p, title) => p.ev(`(() => { const e = [...document.querySelectorAll('.menu .menu-item')].find(e => (e.querySelector('.binders-summary-value-name')?.textContent ?? e.textContent.trim()) === ${j(title)}); e?.click(); return !!e; })()`);
const closeMenus = async (p) => { for (let i = 0; i < 3 && await p.ev(`!!document.querySelector('.menu')`); i++) { await p.key('Escape'); await p.sleep(120); } };
const scope = (p) => p.ev(`document.querySelector('${LEAF} .binders-scope:not(.is-hidden) .binders-scope-count')?.textContent ?? null`);
const allText = async (p) => { const o = {}; for (const n of NOTES) o[n] = await read(p, L + n); o.binder = await read(p, L + 'The Lighthouse.md'); return o; };

test('the last row: each column’s own sum as before, a summary chosen from Bases’ list and kept with the columns, and what is counted said', async (p, h, t) => {
	await open(p, [{ id: 'label' }, { id: 'status' }, { id: 'words' }, { id: 'target' }]);
	t.eq(j(await foot(p)), j(['7 notes', '', '', '106', '']), 'the notes, and the words together with no name (as the row always was); nothing for a column not asked to');
	await clickFoot(p, 'words');
	const rows = await menuRows(p);
	t.eq(j(rows), j(['Sum', 'Average', 'Median', 'Min', 'Max', 'Range', 'Filled', 'Empty', 'None']), 'a number’s summaries, as Bases offers them: ' + j(rows));
	t.eq(j(await checked(p)), j(['Sum']), 'the one shown is ticked');
	await choose(p, 'Max');
	await until(p, `/Max/.test(document.querySelector('${F} [data-col="words"]')?.textContent ?? '')`);
	const max = await p.ev(`Math.max(...[...document.querySelectorAll('${O} .binders-outliner-row:not(.is-folder) [data-col="words"]')].map(c => +c.textContent.replace(/\\D/g, '')))`);
	t.eq(await footOf(p, 'words'), 'Max' + max.toLocaleString('en-US'), 'a summary chosen says its name, then the value: the most words in a note');
	t.eq(j(await p.ev(`${VIEW}.options.outliner.columns.find(c => c.id === 'words')`)), j({ id: 'words', summary: 'max' }), 'kept with the outliner’s columns');
	t.eq(j(await p.ev(`app.plugins.plugins.binders.settings.outlinerColumns.find(c => c.id === 'words')`)), j({ id: 'words', summary: 'max' }), 'and for the next outliner opened');
	await clickFoot(p, 'words');
	await choose(p, 'None');
	await until(p, `document.querySelector('${F} [data-col="words"]')?.textContent === ''`);
	t.eq(await footOf(p, 'words'), '', 'None: nothing');
	await clickFoot(p, 'words');
	await choose(p, 'Sum');
	await until(p, `document.querySelector('${F} [data-col="words"]')?.textContent === '106'`);
	t.eq(j(await p.ev(`${VIEW}.options.outliner.columns.find(c => c.id === 'words')`)), j({ id: 'words' }), 'back to its own sum: nothing kept');
	// a part of the book: what is counted is said
	await open(p, [{ id: 'words' }], L + 'Part One');
	t.eq((await foot(p))[0], '3 notes in Part One', 'in a folder, the last row says which');
});

test('By value: the values with their notes and words, and one chosen shows those notes, every count agreeing; no note is written', async (p, h, t) => {
	const before = await allText(p);
	await open(p, [{ id: 'status', summary: 'values' }, { id: 'words' }]);
	t.eq(await footOf(p, 'status'), '3 values', 'shut: how many values there are');
	await clickFoot(p, 'status');
	const rows = (await menuRows(p)).filter(Array.isArray);
	t.eq(j(rows.map((r) => r[0])), j(['Idea', 'Draft', 'Revised']), 'each status in the order settings list them, as the rows spell them: ' + j(rows));
	// every count is what the notes say
	const said = await p.ev(`(() => { const out = {}; for (const r of document.querySelectorAll('${O} .binders-outliner-row:not(.is-folder)')) { const s = r.querySelector('[data-col="status"]').textContent, w = +r.querySelector('[data-col="words"]').textContent.replace(/\\D/g, ''); out[s] ??= [0, 0]; out[s][0]++; out[s][1] += w; } return out; })()`);
	for (const [name, count] of rows) {
		const [n, w] = said[name];
		t.eq(count, `${n} ${n === 1 ? 'note' : 'notes'} · ${w} ${w === 1 ? 'word' : 'words'}`, `${name}: its notes and their words`);
	}
	await choose(p, 'Draft');
	await until(p, `!!document.querySelector('${LEAF} .binders-scope:not(.is-hidden)')`);
	await p.sleep(300);
	const [n, w] = said.Draft;
	t.eq(await scope(p), `${n} of 7 notes`, 'a filter is on: the scope line counts the notes the menu said');
	t.eq((await foot(p))[0], `${n} notes shown`, 'and so does the last row, saying they are what shows');
	t.eq(await footOf(p, 'words'), String(w), 'with the words the menu said');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-word-count')?.textContent`), `${w} of 106 words`, 'and the toolbar the same');
	t.eq(j(await p.ev(`${VIEW}.subset.def.conditions`)), j([{ property: 'status', operator: 'is', value: ['Draft'] }]), 'the condition is the status as settings spell it (the filter ignores case)');
	t.ok(!(await allText(p)).binder.includes('filters'), 'nothing is saved in the binder note');
	t.eq(j(await allText(p)), j(before), 'no note was written');
}, { tier: 'guard' });

test('By value on a list: a note under each of its values, said so; the value chosen adds to the filter that is on', async (p, h, t) => {
	await p.ev(`(async () => {
		const set = (n, v) => app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L)} + n), (fm) => { fm.characters = v; });
		await set('Part One/Arrival.md', ['[[Mara]]', '[[Harrow]]']); await set('Part One/The keeper.md', ['[[Harrow]]']); await set('Prologue.md', ['Mara']);
	})().then(() => 1)`);
	await p.sleep(600);
	await open(p, [{ id: 'status' }, { id: 'words' }, { id: 'prop:characters', summary: 'values' }]);
	t.eq(await footOf(p, 'prop:characters'), '2 values', 'two characters');
	await clickFoot(p, 'prop:characters');
	const rows = await menuRows(p);
	t.eq(j(rows.filter(Array.isArray).map((r) => [r[0], r[1].split(' · ')[0]])), j([['Harrow', '2 notes'], ['Mara', '2 notes'], ['No characters', '4 notes']]), 'most notes first, then by name; Mara is the same name as [[Mara]]; Arrival is under both: ' + j(rows));
	t.ok(rows.includes('A note with two values is counted under each'), 'and the menu says so');
	await choose(p, 'Harrow');
	await until(p, `!!document.querySelector('${LEAF} .binders-scope:not(.is-hidden)')`);
	t.eq(await scope(p), '2 of 7 notes', 'Harrow’s two notes');
	t.eq(j(await p.ev(`${VIEW}.subset.def.conditions`)), j([{ property: 'characters', operator: 'contains any of', value: ['[[Harrow]]'] }]), 'a list: contains any of');
	await clickFoot(p, 'prop:characters');
	await choose(p, 'Mara');
	await until(p, `document.querySelector('${LEAF} .binders-scope-count')?.textContent === '1 of 7 notes'`);
	t.eq(await scope(p), '1 of 7 notes', 'and Mara too: only Arrival has both');
	t.eq(await p.ev(`${VIEW}.subset.def.conditions.length`), 2, 'two conditions, both to be true');
});

test('a saved filter is not changed by a value chosen: what results is a filter not saved', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(${file(L + 'The Lighthouse.md')}, (fm) => { fm.filters = [{ name: 'Drafts', match: 'all', conditions: [{ property: 'status', operator: 'is', value: ['draft'] }] }]; }).then(() => 1)`);
	await p.sleep(500);
	await open(p, [{ id: 'status' }, { id: 'words' }]);
	await p.ev(`(() => { const v = ${VIEW}; v.setFilter({ ...v.savedList()[0] }); return 1; })()`);
	await p.sleep(400);
	await open(p, [{ id: 'status' }, { id: 'words' }, { id: 'label', summary: 'values' }]);
	await p.ev(`(async () => { await app.fileManager.processFrontMatter(${file(L + 'Prologue.md')}, (fm) => { fm.label = 'Mara'; }); })().then(() => 1)`);
	await until(p, `/1 value/.test(document.querySelector('${F} [data-col="label"]')?.textContent ?? '')`, 4000);
	await clickFoot(p, 'label');
	t.ok(await choose(p, 'Mara'), 'the label offered');
	await p.sleep(500);
	t.eq(await p.ev(`${VIEW}.subset.def.name ?? null`), null, 'the filter on is not the saved one');
	t.eq(await p.ev(`${VIEW}.subset.def.conditions.length`), 2, 'the saved filter’s condition and the label');
	await p.sleep(800);
	const saved = await read(p, L + 'The Lighthouse.md');
	t.ok(/name: Drafts/.test(saved) && !/label/.test(saved.split('filters:')[1] ?? ''), 'the saved filter is as it was');
}, { tier: 'guard' });

test('the Revision column: each note’s unfinished tasks, a folder’s added up, the total once each; a click opens the pane, whose count agrees', async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.create(${j(L + 'Revision.md')}, ['- [ ] Check the tides', '- [ ] [[Arrival]]: Why does she come', '- [x] [[Arrival]]: Spelling', '- [ ] [[Arrival]], [[The wreck]]: The weather twice', '- [ ] [[The keeper]]: Too long', ''].join('\\n'));
		await app.fileManager.processFrontMatter(${file(L + 'The Lighthouse.md')}, (fm) => { fm.revision = '[[Revision]]'; });
	})().then(() => 1)`);
	await p.sleep(800);
	await open(p, [{ id: 'words' }, { id: 'revision' }]);
	await until(p, `document.querySelector('${F} [data-col="revision"]')?.textContent === '4'`, 5000);
	const cell = (n) => p.ev(`document.querySelector('${O} .binders-outliner-row[data-path=${j(L + n)}] [data-col="revision"]')?.textContent ?? null`);
	t.eq(await cell('Part One/Arrival.md'), '2', 'Arrival: two unfinished (the done one isn’t counted)');
	t.eq(await cell('Part One/The keeper.md'), '1', 'The keeper: one');
	t.eq(await cell('Part One'), '3', 'Part One: its notes’ added up');
	t.eq(await cell('Part Two'), '1', 'Part Two: the task about two scenes');
	t.eq(await cell('Prologue.md'), '', 'none: nothing');
	t.eq(await footOf(p, 'revision'), '4', 'the total: each task once, and the one about the whole book');
	const r = await p.at(`${O} .binders-outliner-row[data-path=${j(L + 'Part One/Arrival.md')}] .binders-outliner-name`);
	await p.click(r.x, r.y);
	const c = await p.at(`${O} .binders-outliner-row[data-path=${j(L + 'Part One/Arrival.md')}] [data-col="revision"]`);
	await p.click(c.x, c.y);
	await until(p, `!!document.querySelector('.workspace-leaf-content[data-type="binders-revision"]')`, 4000);
	await p.sleep(600);
	const pane = await p.ev(`document.querySelector('.workspace-leaf-content[data-type="binders-revision"]')?.innerText ?? ''`);
	t.ok(/4 unfinished/.test(pane), 'the Revision pane is open, and counts the same 4: ' + pane.slice(-80));
	// ticked in the pane: the column follows
	await p.ev(`(async () => { const v = app.vault.getAbstractFileByPath(${j(L + 'Revision.md')}); await app.vault.modify(v, (await app.vault.read(v)).replace('- [ ] [[The keeper]]', '- [x] [[The keeper]]')); })().then(() => 1)`);
	await until(p, `document.querySelector('${F} [data-col="revision"]')?.textContent === '3'`, 4000);
	t.eq(await cell('Part One/The keeper.md'), '', 'a task ticked off leaves the count');
	t.eq(await footOf(p, 'revision'), '3', 'and the total');
});

test('the last row stays in sight at the foot of the pane while the rows scroll under it', async (p, h, t) => {
	await p.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 420, deviceScaleFactor: 1, mobile: false });
	try {
		await open(p, [{ id: 'status' }, { id: 'words' }]);
		const m = await p.ev(`(() => { const o = document.querySelector('${O}'), f = document.querySelector('${F}'); o.scrollTop = 0; const a = o.getBoundingClientRect(), b = f.getBoundingClientRect(); return { scrolls: o.scrollHeight > o.clientHeight + 20, bottom: Math.round(a.top + o.clientHeight - b.bottom), opaque: getComputedStyle(f).backgroundColor }; })()`);
		t.ok(m.scrolls, 'the rows don’t fit: ' + j(m));
		t.ok(Math.abs(m.bottom) <= 1, 'scrolled to the top, the last row is at the foot of the pane: ' + j(m));
		t.ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(m.opaque), 'over the rows, not through them');
		const end = await p.ev(`(() => { const o = document.querySelector('${O}'); o.scrollTop = o.scrollHeight; const rows = [...o.querySelectorAll('.binders-outliner-row')], last = rows[rows.length - 1].getBoundingClientRect(), f = document.querySelector('${F}').getBoundingClientRect(); return last.bottom <= f.top + 1; })()`);
		t.ok(end, 'at the end the last row of notes is above it');
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
	}
}, { tier: 'look', themes: ['light', 'dark'] });
