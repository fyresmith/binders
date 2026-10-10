// QA round 11, the outliner: what the earlier rounds did not try. Two thousand rows through the keyboard, the wheel and
// the typed start of a name; a selection kept through scrolling, outside renames and deletes, a redraw and a switch of
// mode; a filter with Select all, Delete and Alt+arrows; sorting that has to hold when a note changes under it; fifteen
// folders deep; hand-written statuses and labels that Binders' settings don't list; a column's width kept across hide
// and show. Tests named "qa11 outliner: …" pass; "BUG: qa11 outliner: …" are confirmed bugs (they fail until fixed).
// Golden rule 2: every test that moves or deletes a note checks the files on disk.
import { VIEW, B, clickMenu, closeMenus, contents, exists, flush, j, openView, read, split, until, viewState, withTidy, answer, file } from './view-helpers.mjs';
import { make } from './specs-qa6-scale.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 outliner: ' + name, fn: withTidy(fn) });
const bug = (name, fn) => specs.push({ name: 'BUG: qa11 outliner: ' + name, fn: withTidy(fn) });

const O = '.workspace-leaf.mod-active .binders-outliner';
const R = `${O} .binders-outliner-row`;
const rowSel = (path) => `${R}[data-path="${path}"]`;
const pad = (n, w = 4) => String(n).padStart(w, '0');

// ---- helpers ----
/** Opens the binder view on a folder and switches it to the outliner (with `prefs` as its options, if given). */
async function open(p, folder, prefs = null) {
	await openView(p, folder);
	await p.ev(`(() => { const v = ${VIEW}; ${prefs ? `v.options = { ...v.options, outliner: ${j(prefs)} };` : ''} v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('${R}')`);
	await p.sleep(300);
}
const rowPaths = (p) => p.ev(`[...document.querySelectorAll('${R}')].map(r => r.dataset.path)`);
const selPaths = (p) => p.ev(`[...document.querySelectorAll('${R}.is-selected')].map(r => r.dataset.path)`);
/** What has the keyboard: the row's path, and whether the row itself (not one of its cells) has it. */
const focus = (p) => p.ev(`(() => { const a = document.activeElement, r = a?.closest?.('.binders-outliner-row'); return { path: r?.dataset.path ?? null, row: a === r, col: a?.dataset?.col ?? null, body: a === document.body }; })()`);
/** Whether a row is wholly in the outliner's visible part (below a sticky header, if there is one). */
const inSight = (p, path) => p.ev(`(() => { const o = document.querySelector('${O}'), r = document.querySelector('${rowSel(path)}'); if (!o || !r) return null; const a = o.getBoundingClientRect(), h = o.querySelector('.binders-outliner-head'), top = h && getComputedStyle(h).position === 'sticky' ? Math.max(a.top, h.getBoundingClientRect().bottom) : a.top, b = r.getBoundingClientRect(); return b.top >= top - 1 && b.bottom <= a.bottom + 1; })()`);
const scrollTop = (p) => p.ev(`document.querySelector('${O}')?.scrollTop ?? -1`);
const rowIndex = async (p, path) => (await rowPaths(p)).indexOf(path);
const cellText = (p, path, col) => p.ev(`document.querySelector('${rowSel(path)} [data-col="${col}"]')?.textContent ?? null`);
const foot = (p) => p.ev(`[...document.querySelectorAll('${O} .binders-outliner-foot .binders-outliner-cell')].map(c => c.textContent)`);
/** Clicks the centre of an element of the outliner, as a pointer would. */
async function clickAt(p, sel) {
	const at = await p.at(sel);
	if (!at) throw new Error('nothing to click: ' + sel);
	await p.click(at.x, at.y);
	await p.sleep(300);
}
const nameAt = (path) => `${rowSel(path)} .binders-outliner-name`;
/** Waits until the rows are the ones wanted (a redraw after a change of files or sort). */
const rowsAre = (p, want) => until(p, `[...document.querySelectorAll('${R}')].map(r => r.dataset.path).join('|') === ${j(want.join('|'))}`, 4000);
/** Adds a status or a label to a filter (the view's filter button), then closes its menu. */
async function filterBy(p, title) {
	const at = await p.at('.workspace-leaf.mod-active .binders-filter-button');
	await p.click(at.x, at.y);
	await clickMenu(p, title);
	await closeMenus(p);
	await p.sleep(300);
}
/** Clears the status and label filter (its menu's "Clear filter"). */
async function clearFilter(p) {
	const at = await p.at('.workspace-leaf.mod-active .binders-filter-button');
	await p.click(at.x, at.y);
	await clickMenu(p, 'Clear filter');
	await closeMenus(p);
	await p.sleep(300);
}
const note = (dir, name, status, body) => ({ path: `${dir}/${name}.md`, text: `---\nstatus: ${status}\n---\n${body}\n` });
const bodyOf = (words) => Array.from({ length: words }, (_, i) => 'w' + i).join(' ');
const pathsOf = (root, names) => names.map((n) => `${root}/${n}.md`);

// ---------------------------------------------------------------------------------------------------------------
// Two thousand rows
// ---------------------------------------------------------------------------------------------------------------

const BIG = Array.from({ length: 2000 }, (_, i) => ({ path: 'N' + pad(i) + '.md', text: 'Row ' + i + ' has a few words.\n' }));

test('2,000 rows: End, Home and Page Down move the focus and the view with it; each row the focus lands on is in sight', async (p, h, t) => {
	await make(p, 'Long', j(BIG));
	await open(p, 'Long');
	t.eq((await rowPaths(p)).length, 2000, 'every row is drawn');
	await clickAt(p, nameAt('Long/N0000.md'));
	await p.key('End'); await p.sleep(400);
	let f = await focus(p);
	t.eq(f.path, 'Long/N1999.md', 'End goes to the last row');
	t.ok(await inSight(p, 'Long/N1999.md'), 'and scrolls it into sight');
	t.ok((await scrollTop(p)) > 0, 'the rows scrolled');
	await p.key('Home'); await p.sleep(400);
	f = await focus(p);
	t.eq(f.path, 'Long/N0000.md', 'Home goes back to the first row');
	t.eq(await scrollTop(p), 0, 'and the view goes back to the top');
	await p.key('PageDown'); await p.sleep(400);
	f = await focus(p);
	const i = await rowIndex(p, f.path);
	t.ok(i >= 5, `Page Down moves a page, not a row (now at row ${i})`);
	t.ok(await inSight(p, f.path), 'the row the focus is on is in sight');
	t.ok(f.row, 'and it is the row, not one of its cells, that has the focus');
});

test('2,000 rows: typing the start of a name goes to that row, past 1,500 others, and brings it into sight; a pause starts a new search', async (p, h, t) => {
	await make(p, 'Long', j(BIG));
	await open(p, 'Long');
	await clickAt(p, nameAt('Long/N0000.md'));
	for (const ch of 'N01500') { await p.key(ch); }
	await p.sleep(500);
	let f = await focus(p);
	t.eq(f.path, 'Long/N1500.md', 'the typed start of the name is found among 2,000 rows');
	t.ok(await inSight(p, 'Long/N1500.md'), 'and the row is brought into sight');
	t.eq(j(await selPaths(p)), j(['Long/N1500.md']), 'and it is the one selected');
	// a pause of more than 700 ms starts a new search: "N0" alone goes to the next row starting with N after the focus
	await p.sleep(900);
	await p.key('N'); await p.sleep(100);
	f = await focus(p);
	t.eq(f.path, 'Long/N1501.md', 'after a pause, "N" is a new search from the row after the focus');
});

test('2,000 rows: a selection kept through a wheel scroll; Shift+End selects from it to the last row, out of sight', async (p, h, t) => {
	await make(p, 'Long', j(BIG));
	await open(p, 'Long');
	await clickAt(p, nameAt('Long/N0010.md'));
	const o = await p.at(O);
	await p.wheel(o.x, o.y, 4000); await p.sleep(700);
	t.ok((await scrollTop(p)) > 2000, 'the wheel scrolled the list a long way');
	t.ok(!(await inSight(p, 'Long/N0010.md')), 'the selected row is out of sight');
	t.eq(j(await selPaths(p)), j(['Long/N0010.md']), 'and still selected');
	await p.key('End', 'shift'); await p.sleep(700);
	const sel = await selPaths(p);
	t.eq(sel.length, 1990, 'Shift+End selects the 1,990 rows from it to the end');
	t.ok(sel.includes('Long/N1999.md') && sel.includes('Long/N0010.md') && !sel.includes('Long/N0009.md'), 'the range has both ends and nothing before it');
	t.ok(await inSight(p, 'Long/N1999.md'), 'and the last row is in sight');
});

test('2,000 rows in 40 folders: Collapse all and Expand all finish quickly and leave the focus on a row', async (p, h, t) => {
	const items = [];
	for (let g = 0; g < 40; g++) for (let k = 0; k < 50; k++) items.push({ path: `G${pad(g, 2)}/N${pad(k, 3)}.md`, text: 'Words.\n' });
	await make(p, 'Groups', j(items));
	await open(p, 'Groups');
	await clickAt(p, nameAt('Groups/G07/N010.md'));
	const menu = async (title) => {
		const at = await p.at('.workspace-leaf.mod-active [aria-label="More options"]');
		if (!at) throw new Error('no More options button');
		await p.click(at.x, at.y);
		await clickMenu(p, title);
		await closeMenus(p);
	};
	const t0 = Date.now();
	await menu('Collapse all');
	await until(p, `document.querySelectorAll('${R}').length === 40`, 4000);
	const took = Date.now() - t0;
	t.eq(await p.ev(`document.querySelectorAll('${R}').length`), 40, 'Collapse all leaves the 40 folders, and none of their notes');
	t.ok(took < 1500, `Collapse all took ${took} ms`);
	const f = await focus(p);
	t.ok(!f.body, 'the focus is not thrown to nothing (' + JSON.stringify(f) + ')');
	await menu('Expand all');
	await until(p, `document.querySelectorAll('${R}').length === 2040`, 4000);
	t.eq(await p.ev(`document.querySelectorAll('${R}').length`), 2040, 'Expand all shows every row again');
});

// ---------------------------------------------------------------------------------------------------------------
// A filter, and rows that change under the outliner
// ---------------------------------------------------------------------------------------------------------------

const FILT = [note('Filt', 'Alpha', 'Revised', 'Alpha.'), note('Filt', 'Beta', 'Draft', 'Beta.'), note('Filt', 'Gamma', 'Revised', 'Gamma.'),
	note('Filt', 'Delta', 'Draft', 'Delta.'), note('Filt', 'Epsilon', 'Revised', 'Epsilon.'), note('Filt', 'Zeta', 'Draft', 'Zeta.')]
	.map((x) => ({ ...x, path: x.path.replace(/^Filt\//, '') }));
const FILT_ORDER = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];

test('a filter: Ctrl+A selects only the rows shown; Delete counts those; Cancel keeps all; the hidden notes keep their bytes', async (p, h, t) => {
	await make(p, 'Filt', j(FILT));
	const before = Object.fromEntries(await Promise.all(FILT_ORDER.map(async (n) => [n, await read(p, `Filt/${n}.md`)])));
	await open(p, 'Filt');
	await filterBy(p, 'Revised');
	await rowsAre(p, ['Filt/Alpha.md', 'Filt/Gamma.md', 'Filt/Epsilon.md']);
	await clickAt(p, nameAt('Filt/Alpha.md'));
	await p.key('a', 'ctrl'); await p.sleep(300);
	t.eq(j(await selPaths(p)), j(['Filt/Alpha.md', 'Filt/Gamma.md', 'Filt/Epsilon.md']), 'Ctrl+A selects the three shown, and not the hidden ones');
	await p.key('Delete'); await p.sleep(400);
	const said = await p.ev(`[...document.querySelectorAll('.modal .modal-content, .modal-content')].map(m => m.textContent).join(' | ')`);
	t.ok(/3 items|3 notes|these 3/.test(said), 'the question counts the three shown: ' + said.slice(0, 160));
	t.ok(await answer(p, 'Cancel'), 'the question was answered: Cancel');
	await flush(p);
	t.ok(await exists(p, 'Filt/Gamma.md') && await exists(p, 'Filt/Beta.md'), 'Cancel deleted nothing');
	await clearFilter(p);
	await rowsAre(p, pathsOf('Filt', FILT_ORDER));
	t.eq((await rowPaths(p)).length, 6, 'all six rows are back after Clear filter');
	// and the real thing: the filter on again, the same three, confirmed
	await filterBy(p, 'Revised');
	await rowsAre(p, ['Filt/Alpha.md', 'Filt/Gamma.md', 'Filt/Epsilon.md']);
	await clickAt(p, nameAt('Filt/Alpha.md'));
	await p.key('a', 'ctrl'); await p.sleep(300);
	await p.key('Delete'); await p.sleep(400);
	t.ok(await answer(p, 'Delete'), 'confirmed');
	await flush(p);
	await until(p, `!app.vault.getAbstractFileByPath('Filt/Alpha.md')`, 4000);
	t.ok(!(await exists(p, 'Filt/Alpha.md')) && !(await exists(p, 'Filt/Gamma.md')) && !(await exists(p, 'Filt/Epsilon.md')), 'the three shown are gone');
	for (const n of ['Beta', 'Delta', 'Zeta']) t.eq(await read(p, `Filt/${n}.md`), before[n], `“${n}” (hidden by the filter) is byte for byte what it was`);
	const c = await contents(p, 'Filt/Filt.md');
	t.eq(j(c), j(['Beta.md', 'Delta.md', 'Zeta.md']), 'and the binder’s contents list only what is left');
});

test('a filter: Alt+Down moves the selected row past the next row shown, and the hidden notes keep their order on disk', async (p, h, t) => {
	await make(p, 'Filt', j(FILT));
	await open(p, 'Filt');
	await filterBy(p, 'Revised');
	await rowsAre(p, ['Filt/Alpha.md', 'Filt/Gamma.md', 'Filt/Epsilon.md']);
	await clickAt(p, nameAt('Filt/Alpha.md'));
	await p.key('ArrowDown', 'alt'); await p.sleep(700);
	await flush(p);
	t.eq(j(await rowPaths(p)), j(['Filt/Gamma.md', 'Filt/Alpha.md', 'Filt/Epsilon.md']), 'Alpha is now below Gamma, the next row shown');
	const c = await contents(p, 'Filt/Filt.md');
	t.eq(c.length, 6, 'all six notes are still listed');
	t.eq(j(c.filter((x) => x.startsWith('Beta') || x.startsWith('Delta') || x.startsWith('Zeta'))), j(['Beta.md', 'Delta.md', 'Zeta.md']), 'the hidden notes keep their order');
	t.eq(j(c), j(['Beta.md', 'Gamma.md', 'Alpha.md', 'Delta.md', 'Epsilon.md', 'Zeta.md']), 'Alpha was written after Gamma, and the rest did not move');
	for (const n of FILT_ORDER) t.ok(await exists(p, `Filt/${n}.md`), `“${n}” is still a file`);
});

test('an outside rename keeps the selection and focus on the renamed note; a folder renamed outside keeps its child selected', async (p, h, t) => {
	await make(p, 'Ren', j([{ path: 'Part/One.md', text: 'One.\n' }, { path: 'Part/Two.md', text: 'Two.\n' }, { path: 'Three.md', text: 'Three.\n' }]));
	await open(p, 'Ren');
	await clickAt(p, nameAt('Ren/Part/Two.md'));
	t.eq(j(await selPaths(p)), j(['Ren/Part/Two.md']), 'Two is selected');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Ren/Part/Two.md'), 'Ren/Part/Second.md').then(() => 1)`);
	await until(p, `!!document.querySelector('${rowSel('Ren/Part/Second.md')}')`, 4000);
	await p.sleep(400);
	t.eq(j(await selPaths(p)), j(['Ren/Part/Second.md']), 'the selection went with the note to its new name');
	t.eq((await focus(p)).path, 'Ren/Part/Second.md', 'and so did the focus');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Ren/Part'), 'Ren/Chapter').then(() => 1)`);
	await until(p, `!!document.querySelector('${rowSel('Ren/Chapter/Second.md')}')`, 4000);
	await p.sleep(400);
	t.eq(j(await selPaths(p)), j(['Ren/Chapter/Second.md']), 'a folder renamed outside: its selected note is the one under the new name');
	t.eq((await focus(p)).path, 'Ren/Chapter/Second.md', 'and the focus is on it');
	await flush(p);
	t.ok(await exists(p, 'Ren/Chapter/Second.md') && !(await exists(p, 'Ren/Part/Second.md')), 'the files are where the rename put them');
	t.ok((await contents(p, 'Ren/Ren.md')).includes('Chapter/Second.md') || (await contents(p, 'Ren/Ren.md')).some((x) => x.includes('Second')), 'the binder lists the note under its new place: ' + j(await contents(p, 'Ren/Ren.md')));
});

test('an outside delete of the focused row: the focus goes to the row after it, never to nothing, and the selection with it', async (p, h, t) => {
	await make(p, 'Del', j([{ path: 'One.md', text: 'One.\n' }, { path: 'Two.md', text: 'Two.\n' }, { path: 'Three.md', text: 'Three.\n' }]));
	await open(p, 'Del');
	await clickAt(p, nameAt('Del/Two.md'));
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Del/Two.md'), true).then(() => 1)`);
	await until(p, `!document.querySelector('${rowSel('Del/Two.md')}')`, 4000);
	await p.sleep(400);
	const f = await focus(p);
	t.eq(f.path, 'Del/Three.md', 'the focus went to the row after the deleted one (' + JSON.stringify(f) + ')');
	t.eq(j(await selPaths(p)), j(['Del/Three.md']), 'and it is selected');
	t.ok(await p.ev(`document.activeElement !== document.body`), 'the focus is on something');
});

test('an outside edit: the Words cell and the last row’s total change without reopening the binder', async (p, h, t) => {
	await make(p, 'Ext', j([{ path: 'Quiet.md', text: 'One two three.\n' }, { path: 'Other.md', text: 'Four five.\n' }]));
	await open(p, 'Ext', { columns: [{ id: 'words' }] });
	const before = await cellText(p, 'Ext/Quiet.md', 'words');
	t.ok(/\b3\b/.test(before ?? ''), 'Quiet has 3 words at first (' + before + ')');
	await p.ev(`app.vault.adapter.write('Ext/Quiet.md', ${j(bodyOf(60) + '\n')}).then(() => 1)`);
	const ok = await until(p, `/\\b60\\b/.test(document.querySelector('${rowSel('Ext/Quiet.md')} [data-col="words"]')?.textContent ?? '')`, 5000);
	t.ok(ok, 'the cell says 60 after the outside edit (now ' + (await cellText(p, 'Ext/Quiet.md', 'words')) + ')');
	const total = await foot(p);
	t.ok(total.some((x) => /\b62\b/.test(x)), 'the total of the binder says 62, 60 and 2 (' + j(total) + ')');
});

test('sorted by Words, descending: a note that grows outside moves up to its sorted place', async (p, h, t) => {
	await make(p, 'Srt', j([{ path: 'Short.md', text: 'One.\n' }, { path: 'Middle.md', text: bodyOf(20) + '\n' }, { path: 'Long.md', text: bodyOf(40) + '\n' }]));
	await open(p, 'Srt');
	await clickAt(p, `${O} .binders-outliner-th[data-col="words"]`);
	await clickAt(p, `${O} .binders-outliner-th[data-col="words"]`);
	await p.sleep(300);
	t.eq(j(await rowPaths(p)), j(['Srt/Long.md', 'Srt/Middle.md', 'Srt/Short.md']), 'sorted descending by words at first');
	await p.ev(`app.vault.adapter.write('Srt/Short.md', ${j(bodyOf(90) + '\n')}).then(() => 1)`);
	const ok = await rowsAre(p, ['Srt/Short.md', 'Srt/Long.md', 'Srt/Middle.md']);
	t.ok(ok, 'Short, now 90 words, is at the top of the sorted list (' + j(await rowPaths(p)) + ')');
});

test('sorted by Status, a status changed from the keyboard moves the row to its place and keeps the focus and the selection on it', async (p, h, t) => {
	await make(p, 'Stat', j([note('Stat', 'Alpha', 'Draft', 'A.'), note('Stat', 'Beta', 'Done', 'B.'), note('Stat', 'Gamma', 'Idea', 'C.'), note('Stat', 'Delta', 'Draft', 'D.')]
		.map((x) => ({ ...x, path: x.path.replace(/^Stat\//, '') }))));
	await open(p, 'Stat');
	await clickAt(p, `${O} .binders-outliner-th[data-col="status"]`);
	await p.sleep(300);
	t.eq(j(await rowPaths(p)), j(['Stat/Gamma.md', 'Stat/Alpha.md', 'Stat/Delta.md', 'Stat/Beta.md']), 'sorted by status: Idea, Draft, Draft, Done (settings order)');
	await clickAt(p, nameAt('Stat/Alpha.md'));
	await p.key('ArrowRight'); await p.key('ArrowRight'); await p.sleep(200);
	t.eq((await focus(p)).col, 'status', 'Right twice reaches the status cell');
	await p.key('Enter'); await p.sleep(400);
	await clickMenu(p, 'Done');
	await p.sleep(600);
	await flush(p);
	t.eq(j(await rowPaths(p)), j(['Stat/Gamma.md', 'Stat/Delta.md', 'Stat/Alpha.md', 'Stat/Beta.md']), 'Alpha, now Done, sits with Beta (binder order breaks the tie: Alpha first)');
	t.eq(j(await selPaths(p)), j(['Stat/Alpha.md']), 'and it is still the one selected');
	t.eq((await focus(p)).path, 'Stat/Alpha.md', 'and the focus is still in its row');
	t.ok(/status: Done/.test(await read(p, 'Stat/Alpha.md')), 'the note’s file says Done');
});

test('fifteen folders deep: Left and Right fold and open; Alt+Left and Alt+Right move a note out and back, and the files follow', async (p, h, t) => {
	const names = Array.from({ length: 15 }, (_, k) => 'F' + pad(k + 1, 2));
	const items = [];
	for (let k = 1; k <= 15; k++) items.push({ path: names.slice(0, k).join('/') + '/' + pad(k, 2) + '.md', text: 'Level ' + k + '.\n' });
	await make(p, 'Deep', j(items));
	await open(p, 'Deep');
	const all = await rowPaths(p);
	t.eq(all.length, 30, 'every folder and note at every depth is a row');
	const deepest = 'Deep/' + names.join('/') + '/15.md';
	const lvl = await p.ev(`[...document.querySelectorAll('${R}')].map(r => +r.getAttribute('aria-level'))`);
	t.ok(lvl.includes(15) && Math.max(...lvl) === 16, 'the folder at depth 15 is at level 15, its note at level 16 (levels ' + j([...new Set(lvl)].sort((a, b) => a - b)) + ')');
	await clickAt(p, nameAt(deepest));
	const fold = 'Deep/' + names.slice(0, 14).join('/');
	// Left on a note goes to the folder above; Left again folds that folder, the note goes with the view
	await p.key('ArrowLeft'); await p.sleep(250);
	t.eq((await focus(p)).path, 'Deep/' + names.join('/'), 'Left on the note goes to its folder');
	await p.key('ArrowLeft'); await p.sleep(250);
	t.eq((await rowPaths(p)).length, 29, 'Left folds the folder at depth 15: its note goes from view');
	await p.key('ArrowRight'); await p.sleep(250);
	t.eq((await rowPaths(p)).length, 30, 'Right opens it again');
	await clickAt(p, nameAt(deepest));
	await p.key('ArrowLeft', 'alt'); await p.sleep(500);
	await flush(p);
	const outside = 'Deep/' + names.slice(0, 14).join('/') + '/15.md';
	t.ok(await exists(p, outside) && !(await exists(p, deepest)), 'Alt+Left takes the note out of its folder, into the one above (' + outside + ')');
	t.ok((await contents(p, 'Deep/Deep.md')).some((x) => x.endsWith('F14/15.md')), 'the binder lists it at its new place');
	t.eq(await read(p, outside), 'Level 15.\n', 'and its text is unchanged');
	await p.key('ArrowRight', 'alt'); await p.sleep(500);
	await flush(p);
	t.ok(await exists(p, deepest) && !(await exists(p, outside)), 'Alt+Right puts it back in the folder above it');
	t.eq(await read(p, deepest), 'Level 15.\n', 'and its text is still unchanged');
	const w = await p.ev(`(() => { const o = document.querySelector('${O}'), c = document.querySelector('${rowSel(deepest)} [data-col="words"]'); if (!c || !o) return null; return { right: c.getBoundingClientRect().right, room: o.getBoundingClientRect().right }; })()`);
	t.ok(w && w.right <= w.room + 1, 'the Words cell of the deepest note is in sight at its depth (' + j(w) + ')');
});

test('hand-written statuses and labels that the settings don’t list show as written, sort, and are not rewritten by opening', async (p, h, t) => {
	const src = j([
		{ path: 'Odd/One.md', text: '---\nstatus: Revised?\nlabel: Mauve\n---\nOne.\n' },
		{ path: 'Odd/Two.md', text: '---\nstatus: Done\nlabel: Red\n---\nTwo.\n' },
		{ path: 'Odd/Three.md', text: '---\nstatus: 2nd draft\n---\nThree.\n' }]);
	await make(p, 'Odd', src);
	const before = await Promise.all(['One', 'Two', 'Three'].map((n) => read(p, `Odd/${n}.md`)));
	await open(p, 'Odd', { columns: [{ id: 'label' }, { id: 'status' }] });
	t.eq(await cellText(p, 'Odd/One.md', 'status'), 'Revised?', 'a status the settings don’t list shows as written');
	t.ok(/Mauve/.test((await cellText(p, 'Odd/One.md', 'label')) ?? ''), 'a label the settings don’t list shows by its name');
	await clickAt(p, `${O} .binders-outliner-th[data-col="status"]`);
	await p.sleep(300);
	const order = await rowPaths(p);
	t.eq(order.length, 3, 'all three rows are there after a sort');
	await flush(p);
	const after = await Promise.all(['One', 'Two', 'Three'].map((n) => read(p, `Odd/${n}.md`)));
	t.eq(j(after), j(before), 'opening and sorting wrote nothing to the notes');
});

test('a column’s width is kept when it is hidden and shown again', async (p, h, t) => {
	await make(p, 'Wid', j([{ path: 'A.md', text: bodyOf(5) + '\n' }, { path: 'B.md', text: 'Two.\n' }]));
	await open(p, 'Wid', { columns: [{ id: 'label' }, { id: 'status' }, { id: 'words' }] });
	const grip = await p.at(`${O} .binders-outliner-th[data-col="words"] .binders-outliner-resizer`);
	t.ok(grip, 'the Words header has an edge to drag');
	const w0 = await p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]').getBoundingClientRect().width`);
	await p.drag(grip.x, grip.y, grip.x + 90, grip.y, 10);
	await p.sleep(400);
	const w1 = await p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]').getBoundingClientRect().width`);
	t.ok(w1 > w0 + 60, `dragging the edge widens it (${Math.round(w0)} → ${Math.round(w1)})`);
	const th = await p.at(`${O} .binders-outliner-th[data-col="words"]`);
	await p.right(th.x, th.y); await p.sleep(250);
	await clickMenu(p, 'Hide column');
	await closeMenus(p);
	await p.sleep(400);
	t.eq(await p.ev(`!!document.querySelector('${O} .binders-outliner-th[data-col="words"]')`), false, 'Words is hidden');
	const add = await p.at(`${O} .binders-outliner-th.mod-add`);
	await p.click(add.x, add.y); await p.sleep(250);
	await clickMenu(p, 'Words');
	await closeMenus(p);
	await p.sleep(400);
	const w2 = await p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]')?.getBoundingClientRect().width ?? -1`);
	t.ok(Math.abs(w2 - w1) < 3, `shown again at the width it had (${Math.round(w2)} px, it was ${Math.round(w1)})`);
	const stored = (await viewState(p)).options?.outliner?.columns ?? [];
	const words = stored.find((c) => c.id === 'words');
	t.ok(words && words.width != null && Math.abs(words.width - w1) < 3, 'and the view keeps that width for next time: ' + j(words));
});

test('a selection of two rows is kept through a switch to the corkboard and back, with the focus on the same row', async (p, h, t) => {
	await make(p, 'Keep', j([{ path: 'A.md', text: 'A.\n' }, { path: 'B.md', text: 'B.\n' }, { path: 'C.md', text: 'C.\n' }, { path: 'D.md', text: 'D.\n' }]));
	await open(p, 'Keep');
	await clickAt(p, nameAt('Keep/B.md'));
	await p.click(...Object.values(await p.at(nameAt('Keep/D.md'))).slice(0, 2), { modifiers: 2 });
	await p.sleep(300);
	const sel0 = await selPaths(p);
	t.eq(j(sel0), j(['Keep/B.md', 'Keep/D.md']), 'B and D are selected (Ctrl+click)');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(700);
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('${R}')`, 4000);
	await p.sleep(400);
	t.eq(j(await selPaths(p)), j(sel0), 'the same two rows are selected after the switch');
	t.eq((await focus(p)).path, 'Keep/D.md', 'and the focus is where it was');
});

test('a folder folded with a note of it selected: the selection goes to the folder, and Delete names the folder and its notes', async (p, h, t) => {
	await make(p, 'Fold', j([{ path: 'Box/One.md', text: 'One.\n' }, { path: 'Box/Two.md', text: 'Two.\n' }, { path: 'Loose.md', text: 'Loose.\n' }]));
	await open(p, 'Fold');
	await clickAt(p, nameAt('Fold/Box/Two.md'));
	await p.key('ArrowLeft'); await p.sleep(250);
	await p.key('ArrowLeft'); await p.sleep(400);
	t.eq(j(await selPaths(p)), j(['Fold/Box']), 'the folder has the selection once its note is hidden');
	await p.key('Delete'); await p.sleep(400);
	const said = await p.ev(`[...document.querySelectorAll('.modal')].map(m => m.textContent).join(' | ')`);
	t.ok(/Box/.test(said) && /2 notes|two notes/.test(said), 'the question names Box and its two notes: ' + said.slice(0, 200));
	t.ok(await answer(p, 'Cancel'), 'answered with Cancel');
	await flush(p);
	t.ok(await exists(p, 'Fold/Box/Two.md') && await exists(p, 'Fold/Box/One.md'), 'nothing was deleted');
});

