// The outliner (src/view/outliner.ts): the tree of rows, folding, selection and the keyboard, editing in place (title,
// synopsis, target, properties), the label and status cells, columns (show, hide, move, resize, sort), dragging rows,
// new notes and folders, the filter, read-only binders. Every test that changes files checks no text was lost.
import { B, NOTE, PL, VIEW, clickMenu, closeMenus, contents, exists, file, flush, hoverMenu, j, menuItems, openView, read, same, split, texts, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'outliner: ' + name, fn });

const L = 'The Lighthouse/';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const O = '.workspace-leaf.mod-active .binders-outliner';
const R = `${O} .binders-outliner-row`;
const rowSel = (path) => `${R}[data-path="${L}${path}"]`;
const cellSel = (path, col) => `${rowSel(path)} [data-col="${col}"]`;
const nameAt = (p, path) => p.at(`${rowSel(path)} .binders-outliner-name`);

/** Opens the outliner on a folder, with these columns (default: Label, Status, Words). */
async function open(p, folder = 'The Lighthouse', prefs = null) {
	await openView(p, folder);
	await p.ev(`(() => { const v = ${VIEW}; ${prefs ? `v.options = { ...v.options, outliner: ${j(prefs)} };` : ''} v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('${R}')`);
	await p.sleep(250);
}
/** Rows as they show: [name, level]. */
const rows = (p) => p.ev(`[...document.querySelectorAll('${R}')].map(r => [r.dataset.path.slice(${L.length}), +r.getAttribute('aria-level')])`);
const names = async (p) => (await rows(p)).map((r) => r[0]);
const selected = (p) => p.ev(`[...document.querySelectorAll('${R}.is-selected')].map(r => r.dataset.path.slice(${L.length}))`);
const cellText = (p, path, col) => p.ev(`document.querySelector(${j(cellSel(path, col))})?.textContent ?? null`);
const headers = (p) => p.ev(`[...document.querySelectorAll('${O} .binders-outliner-th[data-col]')].map(e => e.dataset.col)`);
const prefs = async (p) => (await viewState(p)).options?.outliner ?? {};
async function written(p, want) {
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.includes(${j(want)}))`);
	return contents(p);
}
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + path)}))?.frontmatter ?? {})`).then(JSON.parse);
/** Presses a row and moves to a point with the button held; `seen` is what shows before letting go. */
async function dragRow(p, from, to, { drop = true } = {}) {
	const a = await nameAt(p, from);
	await p.move(a.x, a.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
	await p.move(to.x, to.y, 12, { buttons: 1 });
	await p.sleep(200);
	const seen = await p.ev(`(() => { const l = document.querySelector('.binders-drop-line.is-active')?.getBoundingClientRect(); return { hint: document.querySelector('.binders-outliner-ghost .drag-ghost-action')?.textContent ?? null, ghost: document.querySelector('.binders-outliner-ghost .drag-ghost-self')?.textContent ?? null, line: l ? { y: Math.round(l.top + l.height / 2), left: Math.round(l.left) } : null, into: [...document.querySelectorAll('${R}.is-being-dragged-over')].map(r => r.dataset.path.slice(${L.length})), dragging: [...document.querySelectorAll('${R}.is-dragging')].map(r => r.dataset.path.slice(${L.length})), grabbing: document.body.classList.contains('is-grabbing') }; })()`);
	if (!drop) await p.key('Escape');
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
	await p.sleep(350);
	return seen;
}

test('rows in binder order, as a tree: folders with their notes under them, the default columns, and what they add up to', async (p, h, t) => {
	await open(p);
	t.eq(j(await rows(p)), j([['Prologue.md', 1], ['Part One', 1], ['Part One/Arrival.md', 2], ['Part One/The keeper.md', 2], ['Part One/Storm warning.md', 2], ['Part Two', 1], ['Part Two/The wreck.md', 2], ['Part Two/Lights out.md', 2], ['Epilogue.md', 1]]), 'in order, at their levels');
	t.eq(j(await headers(p)), j(['title', 'label', 'status', 'words']), 'Title, then Label, Status and Words');
	const arrival = await p.ev(`(() => { const r = document.querySelector(${j(rowSel('Part One/Arrival.md'))}); return { name: r.querySelector('.binders-outliner-name').textContent, synopsis: r.querySelector('.binders-outliner-synopsis').textContent, status: r.querySelector('[data-col="status"]').textContent, words: r.querySelector('[data-col="words"]').textContent, role: r.getAttribute('role'), grid: r.closest('[role="treegrid"]') != null }; })()`);
	t.eq(j(arrival), j({ name: 'Arrival', synopsis: 'Mara arrives on the island with the supply boat.', status: 'Revised', words: '18', role: 'row', grid: true }), 'a row: title with its synopsis under it, status, words');
	t.eq(await cellText(p, 'Part One', 'words'), '51', 'a folder counts the words in it');
	t.eq(await p.ev(`document.querySelector(${j(rowSel('Part One'))}).getAttribute('aria-expanded')`), 'true', 'and says it’s open');
	const foot = await p.ev(`[...document.querySelectorAll('${O} .binders-outliner-foot .binders-outliner-cell')].map(c => c.textContent)`);
	t.eq(j(foot.slice(0, 4)), j(['7 notes', '', '', '106']), 'the last row: how many notes, and the words together');
	// the title column takes what the others leave, and nothing sticks out sideways
	t.ok(await p.ev(`(() => { const o = document.querySelector('${O}'); return o.scrollWidth <= o.clientWidth; })()`), 'as wide as the pane');
});

test('folders fold: by the chevron and the arrow keys; what’s folded is kept with the view', async (p, h, t) => {
	await open(p);
	const chev = await p.at(`${rowSel('Part One')} .binders-outliner-chevron`);
	await p.click(chev.x, chev.y);
	await p.sleep(250);
	t.eq(j(await names(p)), j(['Prologue.md', 'Part One', 'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md']), 'Part One’s notes are folded away');
	t.eq(await p.ev(`document.querySelector(${j(rowSel('Part One'))}).getAttribute('aria-expanded')`), 'false', 'and it says so');
	t.eq(j((await prefs(p)).collapsed), j([L + 'Part One']), 'kept with the view');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One', 'the focus is on the folder');
	await p.key('ArrowRight');
	await p.sleep(250);
	t.eq((await names(p)).length, 9, 'Right unfolds it');
	// (as in any tree with columns: Right on an open folder goes into the row's cells; Down goes into the folder)
	await p.key('ArrowRight');
	t.eq(await p.ev(`document.activeElement?.dataset?.col`), 'label', 'Right again goes into the row’s cells');
	await p.key('ArrowRight');
	t.eq(await p.ev(`document.activeElement?.dataset?.col`), 'status', 'and on to the next');
	await p.key('ArrowLeft'); await p.key('ArrowLeft');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One', 'Left from the first cell is the row again');
	await p.key('ArrowDown');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One/Arrival.md', 'Down goes into the folder');
	await p.key('ArrowLeft');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One', 'Left goes back up to the folder');
	await p.key('ArrowLeft');
	await p.sleep(250);
	t.eq((await names(p)).length, 6, 'and Left on the folder folds it');
	// collapse all, expand all, from the view's own menu
	const board = await p.at(O);
	await p.right(board.x, board.t + board.h - 30);
	t.ok((await menuItems(p)).includes('Collapse all') && (await menuItems(p)).includes('Expand all'), 'the outliner’s menu');
	await clickMenu(p, 'Collapse all');
	await p.sleep(250);
	t.eq(j(await names(p)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'Collapse all');
	await p.right(board.x, board.t + board.h - 30);
	await clickMenu(p, 'Expand all');
	await p.sleep(250);
	t.eq((await names(p)).length, 9, 'Expand all');
});

test('selection and the keyboard: arrows, Shift and Ctrl, Enter opens, Alt+arrows reorder', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	t.eq(j(await selected(p)), j(['Part One/Arrival.md']), 'a click selects a row');
	await p.key('ArrowDown');
	t.eq(j(await selected(p)), j(['Part One/The keeper.md']), 'Down');
	await p.key('ArrowDown', 'shift');
	t.eq(j(await selected(p)), j(['Part One/The keeper.md', 'Part One/Storm warning.md']), 'Shift+Down extends');
	const w = await nameAt(p, 'Part Two/The wreck.md');
	await p.click(w.x, w.y, { modifiers: 2 });
	t.eq((await selected(p)).length, 3, 'Ctrl-click adds a row');
	await p.key('Escape');
	t.eq(j(await selected(p)), j(['Part Two/The wreck.md']), 'Escape: back to one');
	await p.key('Home');
	t.eq(j(await selected(p)), j(['Prologue.md']), 'Home');
	await p.key('End');
	t.eq(j(await selected(p)), j(['Epilogue.md']), 'End');
	// Alt+Up: Epilogue goes up past Part Two
	await p.key('ArrowUp', 'alt');
	t.eq(j(await written(p, '  - Epilogue\n  - Part Two/\n')), j([...LIST.slice(0, 5), 'Epilogue', ...LIST.slice(5, 8)]), 'Alt+Up moves the row, in the list on disk');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Epilogue.md', 'and it keeps the focus');
	same(t, before, await texts(p), { skip: [NOTE] });
	// Enter opens the note
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Epilogue.md')}`);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Epilogue.md', 'Enter opens the note');
}));

test('double-click opens a note, and a folder in the view; a middle click opens a new tab', async (p, h, t) => {
	await open(p);
	const tabs = () => p.ev(`(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; })()`);
	const n = await tabs(), k = await nameAt(p, 'Part One/The keeper.md');
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: k.x, y: k.y, button: 'middle', clickCount: 1 });
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: k.x, y: k.y, button: 'middle', clickCount: 1 });
	await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Part One/The keeper.md')}`);
	t.eq(await tabs(), n + 1, 'a middle click opens the note in a new tab');
	await p.ev(`(() => { app.workspace.activeLeaf.detach(); return 1; })()`);
	await open(p);
	const f = await nameAt(p, 'Part Two');
	await p.dbl(f.x, f.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part Two'`);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${R}')].map(r => r.dataset.path.split('/').pop())`)), j(['The wreck.md', 'Lights out.md']), 'double-clicking a folder shows it');
	const w = await p.at(`${R}[data-path="${L}Part Two/The wreck.md"] .binders-outliner-name`);
	await p.dbl(w.x, w.y);
	await until(p, `app.workspace.getActiveFile()?.path === ${j(L + 'Part Two/The wreck.md')}`);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Part Two/The wreck.md', 'double-clicking a note opens it');
});

test('F2 renames a row in place; a selected row’s synopsis is edited by clicking it; only that is written', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.key('F2');
	t.ok(await p.ev(`document.activeElement?.matches('${R} .binders-outliner-name input')`), 'F2 puts the title in a field');
	await p.type('Landing');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Landing.md')})`);
	t.ok(!(await exists(p, L + 'Part One/Arrival.md')), 'the note is renamed');
	t.eq(j(await selected(p)), j(['Part One/Landing.md']), 'and stays selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One/Landing.md', 'with the focus back on its row');
	t.eq(j(await written(p, 'Part One/Landing')), j(LIST.map((x) => (x === 'Part One/Arrival' ? 'Part One/Landing' : x))), 'in place in the list');
	// the synopsis: the first click on another row only selects it
	const s = await p.at(`${rowSel('Part One/The keeper.md')} .binders-outliner-synopsis`);
	await p.click(s.x, s.y);
	t.ok(!(await p.ev(`!!document.querySelector('${O} textarea')`)), 'a click on an unselected row’s synopsis selects the row');
	t.eq(j(await selected(p)), j(['Part One/The keeper.md']), 'selected');
	await p.click(s.x, s.y);
	t.ok(await p.ev(`document.activeElement?.matches('${R} .binders-outliner-synopsis textarea')`), 'a second click edits it');
	await p.type(' Twice.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.read(${j(L + 'Part One/The keeper.md')}).then(s => s.includes('tower. Twice.'))`);
	const now = await texts(p);
	t.eq(split(now[L + 'Part One/The keeper.md']).body, split(before[L + 'Part One/The keeper.md']).body, 'the note’s text is untouched');
	t.eq(split(now[L + 'Part One/The keeper.md']).yaml, split(before[L + 'Part One/The keeper.md']).yaml.replace('into the tower.', 'into the tower. Twice.'), 'only the synopsis changed');
	same(t, before, now, { skip: [NOTE, L + 'Part One/The keeper.md'], moved: { [L + 'Part One/Arrival.md']: L + 'Part One/Landing.md' } });
	// a name that can't be used stays in the field
	const k = await nameAt(p, 'Part One/The keeper.md');
	await p.click(k.x, k.y);
	await p.key('F2');
	await p.type('Storm warning');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(await p.ev(`document.activeElement?.matches('${R} .binders-outliner-name input') && document.activeElement.value === 'Storm warning'`), 'a name already taken stays in the field, nothing lost');
	await p.key('Escape');
	t.ok(await exists(p, L + 'Part One/The keeper.md'), 'and Escape leaves the note as it was');
}));

test('the status and label cells open their menus; a color of the note’s own; several rows at once', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	// a click on a row selects it; a click on a cell of a selected row opens the cell's menu, as in a base's table
	let c = await p.at(cellSel('Epilogue.md', 'status'));
	await p.click(c.x, c.y);
	t.eq((await menuItems(p)).length, 0, 'the click that selects a row doesn’t open a menu');
	t.eq(j(await selected(p)), j(['Epilogue.md']), 'it selects the row');
	await p.click(c.x, c.y);
	t.eq(j(await menuItems(p)), j(['Idea', 'Draft', 'Revised', 'Done', 'New status...', 'No status']), 'the status cell’s menu: the statuses from settings');
	await clickMenu(p, 'Done');
	await until(p, `app.vault.adapter.read(${j(L + 'Epilogue.md')}).then(s => s.includes('status: Done'))`);
	await until(p, `document.querySelector(${j(cellSel('Epilogue.md', 'status'))})?.textContent === 'Done'`);
	t.eq(await cellText(p, 'Epilogue.md', 'status'), 'Done', 'the cell shows it');
	c = await p.at(cellSel('Epilogue.md', 'label'));
	await p.click(c.x, c.y);
	const items = await menuItems(p);
	t.eq(j(items), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Custom color...', 'Edit labels...']), 'the label cell’s menu: the labels from settings, a color of its own, and where to change them');
	await clickMenu(p, 'Custom color...');
	await until(p, `!!document.querySelector('.modal input[type="text"]')`);
	await p.ev(`(() => { const i = document.querySelector('.modal input[type="text"]'); i.select(); return 1; })()`);
	await p.type('#0EA5E9');
	await p.key('Enter');
	await until(p, `app.vault.adapter.read(${j(L + 'Epilogue.md')}).then(s => s.includes('label: "#0ea5e9"'))`);
	await until(p, `document.querySelector(${j(cellSel('Epilogue.md', 'label'))})?.textContent === 'Custom color'`);
	const dot = await p.ev(`getComputedStyle(document.querySelector(${j(cellSel('Epilogue.md', 'label') + ' .binders-label-dot')})).backgroundColor`);
	t.eq(dot, 'rgb(14, 165, 233)', 'the dot is that color');
	const text = await read(p, L + 'Epilogue.md');
	t.eq(split(text).body, split(before[L + 'Epilogue.md']).body, 'the body is untouched');
	// two rows selected: the cell's menu sets both
	const a = await nameAt(p, 'Part One/Arrival.md'), k = await nameAt(p, 'Part One/The keeper.md');
	await p.click(a.x, a.y);
	await p.click(k.x, k.y, { modifiers: 2 });
	c = await p.at(cellSel('Part One/The keeper.md', 'label'));
	await p.click(c.x, c.y);
	await clickMenu(p, 'Green');
	await until(p, `app.vault.adapter.read(${j(L + 'Part One/Arrival.md')}).then(s => s.includes('label: Green'))`);
	await until(p, `app.vault.adapter.read(${j(L + 'Part One/The keeper.md')}).then(s => s.includes('label: Green'))`);
	t.eq((await selected(p)).length, 2, 'both rows got it, and stay selected');
	same(t, before, await texts(p), { skip: [L + 'Epilogue.md', L + 'Part One/Arrival.md', L + 'Part One/The keeper.md'] });
}));

test('targets: typed into the cell, shown as progress, added up for a folder and in the last row', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p, 'The Lighthouse', { columns: [{ id: 'words' }, { id: 'target' }, { id: 'progress' }] });
	const type = async (path, text) => {
		const n = await nameAt(p, path);
		await p.click(n.x, n.y);
		const c = await p.at(cellSel(path, 'target'));
		await p.click(c.x, c.y);
		await until(p, `document.activeElement?.matches('${R} [data-col="target"] input')`);
		await p.ev(`document.activeElement.select()`);
		if (text) await p.type(text); else await p.key('Backspace');
		await p.key('Enter');
	};
	await type('Part One/Arrival.md', '36');
	await until(p, `app.vault.adapter.read(${j(L + 'Part One/Arrival.md')}).then(s => /^target: 36$/m.test(s))`);
	await until(p, `document.querySelector(${j(cellSel('Part One/Arrival.md', 'progress'))})?.textContent === '50%'`);
	t.eq(await cellText(p, 'Part One/Arrival.md', 'target'), '36', 'the target shows');
	t.eq(await p.ev(`document.querySelector(${j(cellSel('Part One/Arrival.md', 'progress') + ' [role="progressbar"]')}).getAttribute('aria-valuenow')`), '50', '18 of 36 words: half way');
	await type('Part One/The keeper.md', '1,000');
	await until(p, `app.vault.adapter.read(${j(L + 'Part One/The keeper.md')}).then(s => /^target: 1000$/m.test(s))`);
	await until(p, `document.querySelector(${j(cellSel('Part One', 'target'))})?.textContent === '1,036'`);
	t.eq(await cellText(p, 'Part One', 'target'), '1,036', 'a folder without a target of its own shows its notes’ together');
	t.eq(await cellText(p, 'Part One', 'progress'), '4%', 'and how far along they are (51 of 1,036)');
	const foot = await p.ev(`[...document.querySelectorAll('${O} .binders-outliner-foot .binders-outliner-cell')].map(c => c.textContent)`);
	t.eq(j(foot.slice(0, 4)), j(['7 notes', '106', '1,036', '10%']), 'the last row adds them up');
	// not a number: refused, and what was typed stays
	const n = await nameAt(p, 'Epilogue.md');
	await p.click(n.x, n.y);
	const c = await p.at(cellSel('Epilogue.md', 'target'));
	await p.click(c.x, c.y);
	await p.type('soon');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(await p.ev(`document.activeElement?.matches('${R} [data-col="target"] input') && document.activeElement.value === 'soon'`), 'text isn’t a target: it stays in the field');
	await p.key('Escape');
	// emptied: the target goes
	await type('Part One/Arrival.md', '');
	await until(p, `app.vault.adapter.read(${j(L + 'Part One/Arrival.md')}).then(s => !/target:/.test(s))`);
	t.eq(await read(p, L + 'Part One/Arrival.md'), before[L + 'Part One/Arrival.md'], 'emptying the cell removes the target: the note is as it was');
	same(t, before, await texts(p), { skip: [L + 'Part One/The keeper.md'] });
	t.eq(split(await read(p, L + 'Part One/The keeper.md')).body, split(before[L + 'Part One/The keeper.md']).body, 'no text changed');
}));

test('columns: shown and hidden from “+”, moved and hidden from their header, kept with the view and for the next outliner', withTidy(async (p, h, t) => {
	await open(p);
	const plus = await p.at(`${O} .binders-outliner-th.mod-add`);
	await p.click(plus.x, plus.y);
	const items = await menuItems(p);
	t.ok(['Label', 'Status', 'Words', 'Target', 'Progress', 'Created', 'Modified', 'Other property...'].every((x) => items.includes(x)), 'Binders’ own columns: ' + items.join(', '));
	t.ok(items.includes('plotlines'), 'and the properties your notes have');
	t.ok(!items.includes('synopsis') && !items.includes('status') && !items.includes('contents'), 'but not the ones a column or the binder already has');
	await clickMenu(p, 'Target');
	await until(p, `document.querySelectorAll('${O} .binders-outliner-th[data-col]').length === 5`);
	t.eq(j(await headers(p)), j(['title', 'label', 'status', 'words', 'target']), 'Target is added last');
	await p.click(plus.x + 80, plus.y);
	await closeMenus(p);
	const plus2 = await p.at(`${O} .binders-outliner-th.mod-add`);
	await p.click(plus2.x, plus2.y);
	await clickMenu(p, 'plotlines');
	await until(p, `document.querySelectorAll('${O} .binders-outliner-th[data-col]').length === 6`);
	t.eq(await cellText(p, 'Part One/The keeper.md', 'prop:plotlines'), 'Mara, The keeper\'s secret', 'a property column shows the property (a list, with commas)');
	// a header's menu (a right-click: a click sorts): move, hide
	let th = await p.at(`${O} .binders-outliner-th[data-col="status"]`);
	await p.right(th.x, th.y);
	t.eq(j(await menuItems(p)), j(['Sort ascending', 'Sort descending', 'Move left', 'Move right', 'Hide column']), 'a column’s menu');
	await clickMenu(p, 'Move left');
	await p.sleep(250);
	t.eq(j((await headers(p)).slice(0, 3)), j(['title', 'status', 'label']), 'Move left');
	th = await p.at(`${O} .binders-outliner-th[data-col="label"]`);
	await p.right(th.x, th.y);
	await clickMenu(p, 'Hide column');
	await p.sleep(250);
	t.eq(j(await headers(p)), j(['title', 'status', 'words', 'target', 'prop:plotlines']), 'Hide column');
	t.eq(j((await prefs(p)).columns.map((c) => c.id)), j(['status', 'words', 'target', 'prop:plotlines']), 'kept with the view');
	t.eq(j(await p.ev(`${PL}.settings.outlinerColumns.map(c => c.id)`)), j(['status', 'words', 'target', 'prop:plotlines']), 'and what the next outliner starts with');
	await openView(p, 'Longform demo', 'tab');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('${R}')`);
	t.eq(j(await headers(p)), j(['title', 'status', 'words', 'target', 'prop:plotlines']), 'another binder’s outliner opens with them');
}));

test('columns: the keyboard stays in the header through a redraw: on a column sorted from its menu or by a click, on its neighbor when it’s hidden, on “+” when that shows a column', async (p, h, t) => {
	await open(p);
	const TH = `${O} .binders-outliner-th`;
	const on = () => p.ev(`(() => { const a = document.activeElement; return a?.classList.contains('binders-outliner-th') ? (a.classList.contains('mod-add') ? '+' : a.dataset.col) : (a?.className || a?.tagName) ?? null; })()`);
	const pick = async (title) => {
		const items = await menuItems(p), i = items.indexOf(title);
		if (i < 0) throw new Error(`no “${title}” in ${items.join(', ')}`);
		for (let k = 0; k <= i; k++) await p.key('ArrowDown');
		await p.key('Enter');
		await p.sleep(350);
	};
	const menuOf = async (sel) => { await p.ev(`(() => { document.querySelector(${j(sel)}).focus(); return 1; })()`); await p.key('Enter'); await p.sleep(200); };
	// (the pointer away from where the menus open: an item under it would be where the arrow keys start from)
	await p.move(2, 2, 1);
	await menuOf(`${TH}[data-col="status"]`);
	await pick('Sort ascending');
	t.eq(await on(), 'status', 'sorted from its menu: the keyboard is on that header');
	t.eq(await p.ev(`document.activeElement.getAttribute('aria-sort') + ' ' + document.activeElement.getAttribute('tabindex')`), 'ascending 0', 'the one drawn again, which says it’s sorted and is the header’s tab stop');
	await p.key('ArrowLeft');
	t.eq(await on(), 'label', 'and the arrow keys carry on from it');
	await menuOf(`${TH}[data-col="status"]`);
	await pick('Hide column');
	t.eq(j(await headers(p)), j(['title', 'label', 'words']), 'Status is hidden');
	t.eq(await on(), 'words', 'the keyboard is on the header now in its place');
	await menuOf(`${TH}.mod-add`);
	await pick('Target');
	t.eq(j(await headers(p)), j(['title', 'label', 'words', 'target']), '“+” shows Target');
	t.eq(await on(), '+', 'the keyboard is still on “+”');
	const label = await p.at(`${TH}[data-col="label"]`);
	await p.click(label.x, label.y);
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelector(${j(`${TH}[data-col="label"]`)}).getAttribute('aria-sort')`), 'ascending', 'a click on a header sorts by it');
	t.eq(await on(), 'label', 'and leaves the keyboard on it');
	// rows still take the keyboard back when it was among them
	const a = await nameAt(p, 'Epilogue.md');
	await p.click(a.x, a.y);
	await p.ev(`(() => { ${VIEW}.current.setSort?.(null); return 1; })()`).catch(() => {});
	await p.sleep(200);
	t.ok(await p.ev(`!!document.activeElement.closest('${R}')`), 'a row with the keyboard keeps it');
});

test('columns: dragging a header moves it; dragging its edge resizes it', async (p, h, t) => {
	await open(p);
	const th = (id) => p.at(`${O} .binders-outliner-th[data-col="${id}"]`);
	const w = await th('words'), lab = await th('label');
	// Words dragged to before Label
	await p.move(w.x, w.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: w.x, y: w.y, button: 'left', clickCount: 1 });
	await p.move(lab.l + 10, lab.y, 10, { buttons: 1 });
	await p.sleep(150);
	const line = await p.ev(`(() => { const r = document.querySelector('.binders-drop-indicator.is-active')?.getBoundingClientRect(); return r ? Math.round(r.left) : null; })()`);
	t.ok(line != null && Math.abs(line - lab.l) <= 2, `a line shows where it will go (${line} vs ${lab.l})`);
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lab.l + 10, y: lab.y, button: 'left', clickCount: 1 });
	await p.sleep(300);
	t.eq(j(await headers(p)), j(['title', 'words', 'label', 'status']), 'Words comes first');
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and the drag didn’t open its menu');
	t.eq(await p.ev(`document.querySelectorAll('.binders-drop-indicator').length`), 0, 'nothing of the drag is left');
	// the edge of Label: 60px wider
	const before = (await th('label')).w;
	const edge = await p.at(`${O} .binders-outliner-th[data-col="label"] .binders-outliner-resizer`);
	await p.move(edge.x, edge.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: edge.x, y: edge.y, button: 'left', clickCount: 1 });
	await p.move(edge.x + 60, edge.y, 8, { buttons: 1 });
	t.ok(Math.abs((await th('label')).w - (before + 60)) <= 2, 'the column follows the pointer as it’s dragged');
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: edge.x + 60, y: edge.y, button: 'left', clickCount: 1 });
	await p.sleep(300);
	t.ok(Math.abs((await th('label')).w - (before + 60)) <= 2, 'and stays that wide');
	t.eq((await prefs(p)).columns.find((c) => c.id === 'label').width, Math.round(before + 60), 'the width is kept with the view');
	const cell = await p.at(cellSel('Prologue.md', 'label'));
	t.ok(Math.abs(cell.w - (before + 60)) <= 2, 'the cells under it are as wide');
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'resizing didn’t open the menu');
});

test('columns: a header drag or a resize under way when the mode is switched leaves nothing behind, and changes nothing', async (p, h, t) => {
	await open(p);
	const th = (id) => p.at(`${O} .binders-outliner-th[data-col="${id}"]`);
	const left = () => p.ev(`JSON.stringify({ lines: document.querySelectorAll('.binders-drop-indicator').length, grabbing: document.body.classList.contains('is-grabbing'), menus: document.querySelectorAll('.menu').length })`).then(JSON.parse);
	const mode = (m) => p.ev(`(() => { ${VIEW}.setMode('${m}'); return 1; })()`);
	// Words held over Label, about to go before it: then the corkboard is shown, the button still down
	const w = await th('words'), lab = await th('label');
	await p.move(w.x, w.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: w.x, y: w.y, button: 'left', clickCount: 1 });
	await p.move(lab.l + 10, lab.y, 10, { buttons: 1 });
	await p.sleep(150);
	const during = await left();
	t.ok(during.lines === 1 && during.grabbing, `the drag is under way: its line shows and the pointer is grabbing (${j(during)})`);
	await mode('corkboard');
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-board')`);
	t.eq(j(await left()), j({ lines: 0, grabbing: false, menus: 0 }), 'the outliner gone, nothing of the header drag is left on the page');
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lab.l + 10, y: lab.y, button: 'left', clickCount: 1 });
	await p.sleep(200);
	t.eq(j(await left()), j({ lines: 0, grabbing: false, menus: 0 }), 'nor once the button is let go, over the corkboard');
	await mode('outliner');
	await until(p, `!!document.querySelector('${R}')`);
	await p.sleep(250);
	t.eq(j(await headers(p)), j(['title', 'label', 'status', 'words']), 'the columns are where they were');
	t.ok(!(await prefs(p)).columns, 'and none was written down for the view');
	// the edge of Label held 60px out: then the corkboard again
	const before = (await th('label')).w;
	const edge = await p.at(`${O} .binders-outliner-th[data-col="label"] .binders-outliner-resizer`);
	await p.move(edge.x, edge.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: edge.x, y: edge.y, button: 'left', clickCount: 1 });
	await p.move(edge.x + 60, edge.y, 8, { buttons: 1 });
	t.ok(Math.abs((await th('label')).w - (before + 60)) <= 2, 'the column follows the pointer');
	t.ok((await left()).grabbing, 'and the pointer is grabbing');
	await mode('corkboard');
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-board')`);
	t.eq(j(await left()), j({ lines: 0, grabbing: false, menus: 0 }), 'the outliner gone, nothing of the resize is left on the page');
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: edge.x + 60, y: edge.y, button: 'left', clickCount: 1 });
	await p.sleep(200);
	await mode('outliner');
	await until(p, `!!document.querySelector('${R}')`);
	await p.sleep(250);
	t.ok(Math.abs((await th('label')).w - before) <= 1, `the column is as wide as it was (${(await th('label')).w} vs ${before})`);
	t.ok(!(await prefs(p)).columns, 'and no width was written down');
	t.eq(await p.ev(`document.querySelectorAll('${O}.is-resizing').length`), 0, 'the outliner isn’t left resizing');
	// a header still does what a header does: a click sorts
	const again = await th('words');
	await p.click(again.x, again.y);
	await p.sleep(250);
	t.eq(await p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]').getAttribute('aria-sort')`), 'ascending', 'a click on a header sorts, as before');
});

test('sorting by a column: within each folder, binder order untouched; rows can’t be dragged while sorted', withTidy(async (p, h, t) => {
	await open(p);
	const sort = async (id, item) => { const th = await p.at(`${O} .binders-outliner-th[data-col="${id}"]`); await p.right(th.x, th.y); await clickMenu(p, item); await p.sleep(250); };
	await sort('words', 'Sort ascending');
	t.eq(j(await names(p)), j(['Epilogue.md', 'Prologue.md', 'Part Two', 'Part Two/Lights out.md', 'Part Two/The wreck.md', 'Part One', 'Part One/Storm warning.md', 'Part One/The keeper.md', 'Part One/Arrival.md']), 'fewest words first, folders by what’s in them, each folder’s notes among themselves');
	t.eq(await p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]').getAttribute('aria-sort')`), 'ascending', 'the header says so');
	await sort('words', 'Sort descending');
	t.eq(j((await names(p)).slice(0, 4)), j(['Part One', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md']), 'most words first');
	await sort('title', 'Sort ascending');
	t.eq(j((await names(p)).filter((n) => !n.includes('/'))), j(['Epilogue.md', 'Part One', 'Part Two', 'Prologue.md']), 'by title');
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'the binder’s own order hasn’t changed');
	// dragging says why it can't
	const to = await nameAt(p, 'Prologue.md');
	const seen = await dragRow(p, 'Epilogue.md', { x: to.x, y: to.y + 6 });
	t.eq(seen.ghost, null, 'no drag while sorted');
	const notice = await p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join('|'); })()`);
	t.ok(/sorted by title/.test(notice), 'a notice says why: ' + notice);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'and nothing moved');
	await sort('title', 'Binder order');
	t.eq(j(await names(p)), j(['Prologue.md', 'Part One', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md']), '“Binder order” puts the rows back');
	t.eq((await prefs(p)).sort ?? null, null, 'and the view remembers');
}));

test('dragging rows: between rows, into a folder, to the top of an open folder, below everything; no note changes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	// The keeper above Arrival
	let a = await p.at(rowSel('Part One/Arrival.md'));
	let seen = await dragRow(p, 'Part One/The keeper.md', { x: a.x, y: a.t + 4 });
	t.eq(seen.ghost, 'The keeper', 'Obsidian’s drag ghost names the row');
	t.eq(seen.hint, 'Move before “Arrival”', 'and says where it would go');
	t.ok(seen.line && Math.abs(seen.line.y - a.t) <= 2, `a line along the top of Arrival (${j(seen.line)} vs ${a.t})`);
	t.eq(j(seen.dragging), j(['Part One/The keeper.md']), 'the row being moved is dimmed');
	t.ok(seen.grabbing, 'with Obsidian’s grabbing hand');
	t.eq(j(await written(p, '  - Part One/The keeper\n  - Part One/Arrival')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Arrival', ...LIST.slice(4)]), 'The keeper is before Arrival');
	t.eq(j(await selected(p)), j(['Part One/The keeper.md']), 'and still selected');
	// Prologue onto the middle of Part Two: into it, last
	let two = await p.at(rowSel('Part Two'));
	seen = await dragRow(p, 'Prologue.md', { x: two.x, y: two.y });
	t.eq(seen.hint, 'Move into “Part Two”', 'over the middle of a folder: into it');
	t.eq(j(seen.into), j(['Part Two']), 'the folder is tinted');
	t.eq(seen.line, null, 'and there’s no line');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Prologue.md')})`);
	let list = await written(p, 'Part Two/Prologue');
	t.eq(j(list.slice(-4)), j(['Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Prologue', 'Epilogue']), 'last in Part Two');
	// Epilogue just below Part One's name: first in Part One
	const one = await p.at(rowSel('Part One'));
	seen = await dragRow(p, 'Epilogue.md', { x: one.x, y: one.t + one.h - 3 });
	t.eq(seen.hint, 'Move to the top of “Part One”', 'below an open folder’s name: the top of what’s in it');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Epilogue.md')})`);
	list = await written(p, 'Part One/Epilogue');
	t.eq(j(list.slice(0, 2)), j(['Part One/', 'Part One/Epilogue']), 'first in Part One');
	// Lights out below everything: last in the binder
	const table = await p.at(`${O} .binders-outliner-foot`);
	seen = await dragRow(p, 'Part Two/Lights out.md', { x: table.x, y: table.t + table.h + 12 });
	t.eq(seen.hint, 'Move to the end of “The Lighthouse”', 'below the last row: the end of the folder shown');
	await until(p, `app.vault.adapter.exists(${j(L + 'Lights out.md')})`);
	list = await written(p, '  - Lights out');
	t.eq(list[list.length - 1], 'Lights out', 'last in the binder');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md', [L + 'Epilogue.md']: L + 'Part One/Epilogue.md', [L + 'Part Two/Lights out.md']: L + 'Lights out.md' } });
	t.eq(await p.ev(`document.querySelectorAll('.binders-outliner-ghost, .binders-drop-line, ${R}.is-dragging, ${R}.is-being-dragged-over').length`), 0, 'nothing of a drag is left');
}));

test('dragging: several rows together; back where it is does nothing; Escape cancels; a folder can’t go into itself', withTidy(async (p, h, t) => {
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md'), s = await nameAt(p, 'Part One/Storm warning.md');
	await p.click(a.x, a.y);
	await p.click(s.x, s.y, { modifiers: 2 });
	const w = await p.at(rowSel('Part Two/The wreck.md'));
	let seen = await dragRow(p, 'Part One/Storm warning.md', { x: w.x, y: w.t + w.h - 4 });
	t.eq(seen.ghost, '2 items', 'the ghost counts them');
	t.eq(seen.dragging.length, 2, 'both rows are dimmed');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Storm warning.md')})`);
	const list = await written(p, 'Part Two/Storm warning');
	t.eq(j(list.slice(list.indexOf('Part Two/'))), j(['Part Two/', 'Part Two/The wreck', 'Part Two/Arrival', 'Part Two/Storm warning', 'Part Two/Lights out', 'Epilogue']), 'both after The wreck, in their order');
	t.eq(j(await selected(p)), j(['Part Two/Arrival.md', 'Part Two/Storm warning.md']), 'both still selected');
	// back where it is
	const k = await p.at(rowSel('Part One/The keeper.md'));
	seen = await dragRow(p, 'Part One/The keeper.md', { x: k.x + 40, y: k.t + 3 });
	t.eq(seen.hint, '', 'over its own row: nowhere to go');
	t.eq(seen.line, null, 'no line');
	// Escape
	const e = await p.at(rowSel('Epilogue.md'));
	seen = await dragRow(p, 'Part One/The keeper.md', { x: e.x, y: e.t + e.h - 3 }, { drop: false });
	t.eq(seen.hint, 'Move after “Epilogue”', 'a place to go');
	await flush(p);
	t.ok(await exists(p, L + 'Part One/The keeper.md'), 'Escape: nothing moved');
	t.eq(await p.ev(`document.querySelectorAll('.binders-outliner-ghost, .binders-drop-line').length`), 0, 'and nothing left of the drag');
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'letting go afterwards didn’t open a note');
	// a folder into itself
	const inside = await p.at(rowSel('Part Two/The wreck.md'));
	seen = await dragRow(p, 'Part Two', { x: inside.x, y: inside.t + 4 });
	t.eq(seen.hint, '', 'a folder has nowhere to go among its own notes');
}));

test('New: a note after the selected row, a folder last, each named in place', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	const btn = await p.at(`.workspace-leaf.mod-active .binders-new-button`);
	await p.click(btn.x, btn.y);
	t.eq(j(await menuItems(p)), j(['New note', 'New folder']), 'the New menu');
	await clickMenu(p, 'New note');
	await until(p, `document.activeElement?.matches('${R} .binders-outliner-name input')`);
	t.eq(await p.ev(`document.activeElement.value`), 'Untitled', 'a new note, its name ready to type over');
	await p.type('On the jetty');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/On the jetty.md')})`);
	t.eq(j((await written(p, 'Part One/On the jetty')).slice(2, 5)), j(['Part One/Arrival', 'Part One/On the jetty', 'Part One/The keeper']), 'right after the row that was selected');
	t.ok(!(await exists(p, L + 'Part One/Untitled.md')), 'renamed, not copied');
	// nothing selected: a folder goes last
	await p.key('Escape');
	const empty = await p.at(`${O} .binders-outliner-foot`);
	await p.click(empty.x, empty.t + empty.h + 16);
	t.eq((await selected(p)).length, 0, 'a click below the rows selects nothing');
	await p.click(btn.x, btn.y);
	await clickMenu(p, 'New folder');
	await until(p, `document.activeElement?.matches('${R}.is-folder .binders-outliner-name input')`);
	await p.type('Part Three');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Three')})`);
	const list = await written(p, '  - Part Three/');
	t.eq(list[list.length - 1], 'Part Three/', 'the folder is last in the binder');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('a row’s menu is a card’s menu; Delete asks first; the filter hides rows and empty folders', withTidy(async (p, h, t) => {
	await open(p);
	const k = await nameAt(p, 'Part One/The keeper.md');
	await p.right(k.x, k.y);
	const items = await menuItems(p);
	const own = ['Open', 'Open in new tab', 'Open to the right', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Set target...', 'Move up', 'Move down', 'Delete'];
	t.eq(j(items.filter((x) => own.includes(x))), j(own), 'the row’s menu: ' + items.join(', '));
	t.eq(j(await selected(p)), j(['Part One/The keeper.md']), 'a right-click selects the row');
	await clickMenu(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/Delete “The keeper”\?/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'Delete asks first');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Delete').click(); return 1; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')})`);
	await until(p, `document.querySelectorAll('${R}').length === 8`);
	t.eq(j(await selected(p)), j(['Part One/Storm warning.md']), 'the row after it is selected');
	// the filter
	const f = await p.at(`.workspace-leaf.mod-active .binders-filter-button`);
	await p.click(f.x, f.y);
	await clickMenu(p, 'Revised');
	await closeMenus(p);
	await p.sleep(250);
	t.eq(j(await names(p)), j(['Part One', 'Part One/Arrival.md']), 'only what passes the filter, and the folder it’s in');
	t.eq(await p.ev(`document.querySelector('${O} .binders-outliner-foot .binders-outliner-cell').textContent`), '1 note', 'the last row counts what shows');
}));

test('a property column edits the property: text, a number, a list, a tick', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`(async () => { const pm = (path, fn) => app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(path), fn); await pm(${j(L + 'Prologue.md')}, (fm) => { fm.pov = 'Mara'; fm.day = 3; fm.final = false; }); })().then(() => 1)`);
	await p.sleep(300);
	await open(p, 'The Lighthouse', { columns: [{ id: 'prop:pov' }, { id: 'prop:day' }, { id: 'prop:plotlines' }, { id: 'prop:final' }] });
	const type = async (path, col, text) => {
		const n = await nameAt(p, path);
		await p.click(n.x, n.y);
		const c = await p.at(cellSel(path, col));
		await p.click(c.x, c.y);
		await until(p, `document.activeElement?.matches('${R} [data-col="${col}"] input')`);
		await p.ev(`document.activeElement.select()`);
		await p.type(text);
		await p.key('Enter');
		await p.sleep(350);
	};
	await type('Prologue.md', 'prop:pov', 'The keeper');
	await type('Prologue.md', 'prop:day', '12');
	await type('Prologue.md', 'prop:plotlines', 'Mara, The sea');
	const box = await p.at(`${cellSel('Prologue.md', 'prop:final')} input[type="checkbox"]`);
	await p.click(box.x, box.y);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}))?.frontmatter?.final === true`);
	const f = await fm(p, 'Prologue.md');
	t.eq(f.pov, 'The keeper', 'text');
	t.eq(f.day, 12, 'a number stays a number');
	t.eq(j(f.plotlines), j(['Mara', 'The sea']), 'a list is split at commas');
	t.eq(f.final, true, 'a tick');
	t.eq(split(await read(p, L + 'Prologue.md')).body, split(before[L + 'Prologue.md']).body, 'the note’s text is untouched');
	// a note without the property gets it when it's typed
	await type('Epilogue.md', 'prop:pov', 'Mara');
	t.eq((await fm(p, 'Epilogue.md')).pov, 'Mara', 'a note that had none gets the property');
	same(t, before, await texts(p), { skip: [L + 'Prologue.md', L + 'Epilogue.md'] });
}));

test('a binder in a newer format is read only: nothing edits, drags or opens a menu to change', async (p, h, t) => {
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 2'));
	try {
		await p.sleep(600);
		await open(p);
		t.ok(await p.ev(`document.querySelector('${O}').classList.contains('is-read-only')`), 'read only');
		const a = await nameAt(p, 'Part One/Arrival.md');
		await p.click(a.x, a.y);
		await p.key('F2');
		t.ok(!(await p.ev(`!!document.querySelector('${O} input, ${O} textarea')`)), 'F2 renames nothing');
		const c = await p.at(cellSel('Part One/Arrival.md', 'status'));
		await p.click(c.x, c.y);
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'the status cell opens no menu');
		const to = await p.at(rowSel('Epilogue.md'));
		const seen = await dragRow(p, 'Part One/Arrival.md', { x: to.x, y: to.t + 3 });
		t.eq(seen.ghost, null, 'rows don’t drag');
		await p.right(a.x, a.y);
		const items = await menuItems(p);
		t.ok(items.includes('Open') && !items.includes('Rename') && !items.includes('Delete') && !items.includes('Set status'), 'the menu only opens: ' + items.join(', '));
		await closeMenus(p);
		t.ok(!(await p.at(`.workspace-leaf.mod-active .binders-new-button`)), 'and there’s no New');
		t.eq(await read(p, NOTE), orig.replace('binder: 1', 'binder: 2'), 'the binder note is untouched');
	} finally { await writeRaw(p, NOTE, orig); await p.sleep(500); }
});

test('screenshots: light and dark', async (p, h, t) => {
	const { mkdirSync } = await import('fs');
	mkdirSync('test-dist/e2e-shots', { recursive: true });
	await open(p, 'The Lighthouse', { columns: [{ id: 'label' }, { id: 'status' }, { id: 'words' }, { id: 'target' }, { id: 'progress' }] });
	const theme = await p.ev(`document.body.classList.contains('theme-dark') ? 'dark' : 'light'`);
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	await p.shot(`test-dist/e2e-shots/outliner-${theme}.png`);
	t.ok(true, 'shot');
});

test('“Make this the binder order” writes the sorted order down, folder by folder, as one change that undoes; no note’s text changes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	const sort = async (id, item) => { const th = await p.at(`${O} .binders-outliner-th[data-col="${id}"]`); await p.right(th.x, th.y); await clickMenu(p, item); await p.sleep(250); };
	// not offered until there's a sort
	const th = await p.at(`${O} .binders-outliner-th[data-col="title"]`);
	await p.right(th.x, th.y);
	t.ok(!(await menuItems(p)).includes('Make this the binder order'), 'not offered in binder order');
	await closeMenus(p);
	await sort('title', 'Sort ascending');
	await sort('title', 'Make this the binder order');
	const want = ['Epilogue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part One/The keeper', 'Part Two/', 'Part Two/Lights out', 'Part Two/The wreck', 'Prologue'];
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.indexOf('Epilogue') < s.indexOf('Part One/'))`);
	t.eq(j(await contents(p)), j(want), 'the binder’s list is the order that showed, in every folder');
	t.eq((await prefs(p)).sort ?? null, null, 'the sort is let go: the rows are in binder order again');
	t.eq(j(await names(p)), j(['Epilogue.md', 'Part One', 'Part One/Arrival.md', 'Part One/Storm warning.md', 'Part One/The keeper.md', 'Part Two', 'Part Two/Lights out.md', 'Part Two/The wreck.md', 'Prologue.md']), 'and show as before');
	same(t, before, await texts(p), { skip: [NOTE] });
	t.eq(split(await read(p, NOTE)).body, split(before[NOTE]).body, 'the binder note’s own text untouched');
	// one undo puts every folder back
	t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), 'Sort by title', 'it can be undone, by name');
	await p.ev(`(() => { app.commands.executeCommandById('binders:undo-move'); return 1; })()`);
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.indexOf('Prologue') < s.indexOf('Part One/'))`);
	t.eq(j(await contents(p)), j(LIST), 'one undo puts every folder’s order back');
}));

test('a click on a column’s header sorts by it: ascending, descending, then binder order again; the header says so', withTidy(async (p, h, t) => {
	await open(p);
	const th = await p.at(`${O} .binders-outliner-th[data-col="words"]`);
	const state = () => p.ev(`document.querySelector('${O} .binders-outliner-th[data-col="words"]').getAttribute('aria-sort')`);
	await p.click(th.x, th.y); await p.sleep(250);
	t.eq(await state(), 'ascending', 'one click: ascending');
	t.eq((await names(p))[0], 'Epilogue.md', 'fewest words first');
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'no menu opens');
	await p.click(th.x, th.y); await p.sleep(250);
	t.eq(await state(), 'descending', 'again: descending');
	await p.click(th.x, th.y); await p.sleep(250);
	t.eq(await state(), 'none', 'again: binder order');
	t.eq(j(await names(p)), j(['Prologue.md', 'Part One', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md']), 'the rows are in binder order');
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'sorting never changes the binder’s own order');
	// the keyboard: Enter on a header opens its menu
	await p.ev(`(() => { document.querySelector('${O} .binders-outliner-th[data-col="words"]').focus(); return 1; })()`);
	await p.key('Enter');
	t.ok((await menuItems(p)).includes('Sort ascending'), 'Enter on a header opens its menu');
	await closeMenus(p);
}));

test('the keyboard reaches a row’s cells: Right into them, Enter acts (a menu, a field, a tick), the focus stays; Alt+arrows move rows, several at once, in and out of folders', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await open(p, 'The Lighthouse', { columns: [{ id: 'status' }, { id: 'target' }, { id: 'compile' }] });
	const a = await nameAt(p, 'Part One/Arrival.md');
	await p.click(a.x, a.y);
	const at = () => p.ev(`(() => { const e = document.activeElement, c = e?.closest?.('.binders-outliner-cell'), r = e?.closest?.('${R}'); return (r?.dataset.path ?? '').slice(${L.length}) + '|' + (c?.dataset.col ?? '') + '|' + e?.tagName; })()`);
	await p.key('ArrowRight');
	t.eq(await at(), 'Part One/Arrival.md|status|DIV', 'Right: the first cell');
	await p.key('Enter');
	t.ok((await menuItems(p)).includes('Done'), 'Enter opens the status menu');
	await clickMenu(p, 'Done');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}))?.frontmatter?.status === 'Done'`);
	await p.sleep(300);
	t.eq(await at(), 'Part One/Arrival.md|status|DIV', 'the focus is back in the cell once the row is drawn again');
	await p.key('ArrowRight');
	await p.key('Enter');
	t.eq(await at(), 'Part One/Arrival.md|target|INPUT', 'Enter in a target cell edits it');
	await p.type('1.500');
	await p.key('Tab');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}))?.frontmatter?.target === 1500`);
	await p.sleep(300);
	t.eq(await at(), 'Part One/Arrival.md|target|DIV', 'Tab saves, and the focus stays in the cell');
	await p.key('ArrowRight');
	await p.key(' ');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}))?.frontmatter?.compile === false`);
	await p.sleep(300);
	t.eq((await at()).split('|').slice(0, 2).join('|'), 'Part One/Arrival.md|compile', 'Space ticks, and the focus stays in the cell');
	await p.key('ArrowDown');
	t.eq((await at()).split('|').slice(0, 2).join('|'), 'Part One/The keeper.md|compile', 'Down: the same cell in the next row');
	await p.key('Escape');
	t.eq(await at(), 'Part One/The keeper.md||DIV', 'Escape: back on the row');
	// rows moved by the keyboard: two at once, down; then out of their folder, and back in
	await p.key('ArrowUp', 'shift');
	await p.key('ArrowDown', 'alt');
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.indexOf('Part One/Storm warning') < s.indexOf('Part One/Arrival'))`);
	t.eq(j((await contents(p)).slice(1, 5)), j(['Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper']), 'Alt+Down moves both selected rows past the next');
	t.eq((await selected(p)).length, 2, 'they stay selected');
	await p.key('ArrowLeft', 'alt');
	await until(p, `app.vault.adapter.exists(${j(L + 'Arrival.md')})`);
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => /- Arrival\n/.test(s))`);
	t.eq(j((await contents(p)).slice(1, 6)), j(['Part One/', 'Part One/Storm warning', 'Arrival', 'The keeper', 'Part Two/']), 'Alt+Left takes them out of the folder, to just after it');
	t.ok(await p.ev(`document.activeElement?.matches('${R}')`), 'the focus is on a row');
	await p.key('ArrowRight', 'alt');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Arrival.md')})`);
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => /- Part One\/The keeper\n/.test(s))`);
	t.eq(j((await contents(p)).slice(1, 5)), j(['Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper']), 'Alt+Right puts them into the folder just above, as its last');
	// typing a name's first letters goes to its row
	await p.key('e');
	t.eq((await at()).split('|')[0], 'Epilogue.md', 'typing a letter goes to the next row that starts with it');
	same(t, before, await texts(p), { skip: [NOTE, L + 'Part One/Arrival.md'] });
	t.eq(split(await read(p, L + 'Part One/Arrival.md')).body, split(before[L + 'Part One/Arrival.md']).body, 'Arrival’s text is untouched');
}));

/** Where the keyboard is: the row's path (within the binder), or what else has the focus. */
const keyboardOn = (p) => p.ev(`(() => { const a = document.activeElement; return a?.matches?.('${R}') ? a.dataset.path.slice(${L.length}) : a === document.body ? 'the page' : (a?.tagName + '.' + String(a?.className).split(' ')[0]); })()`);

test('“Move to” in a row’s menu leaves the keyboard on the row that moved, or beside where it was when it left the folder shown; a row taken away from another pane does too', withTidy(async (p, h, t) => {
	const before = await texts(p);
	const moveTo = async (path, folder) => {
		const a = await nameAt(p, path);
		await p.click(a.x, a.y);
		await p.key('ContextMenu');
		await p.sleep(250);
		await hoverMenu(p, 'Move to');
		await clickMenu(p, folder);
	};
	// the folder shown is Part One: its last note leaves for Part Two, and the keyboard is on the row before it
	await open(p, 'The Lighthouse/Part One');
	await moveTo('Part One/Storm warning.md', 'Part Two');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Storm warning.md')})`);
	await p.sleep(700);
	t.eq(await keyboardOn(p), 'Part One/The keeper.md', 'the last row left the folder: the keyboard is on the row before it');
	t.eq(j(await selected(p)), j(['Part One/The keeper.md']), 'which is selected');
	// the first note leaves: the row after it
	await moveTo('Part One/Arrival.md', 'Part Two');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Arrival.md')})`);
	await p.sleep(700);
	t.eq(await keyboardOn(p), 'Part One/The keeper.md', 'the first row left: the keyboard is on the row after it');
	await p.key('ArrowUp'); await p.key('ArrowDown');
	t.eq(await keyboardOn(p), 'Part One/The keeper.md', 'and the arrow keys carry on from there');
	// the whole binder shown: the row is still there, in its new folder, with the keyboard on it
	await open(p);
	await moveTo('Prologue.md', 'Part One');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Prologue.md')})`);
	await p.sleep(700);
	t.eq(await keyboardOn(p), 'Part One/Prologue.md', 'still in view: the keyboard is on the row that moved');
	t.eq(j(await selected(p)), j(['Part One/Prologue.md']), 'which stays selected');
	// a row with the keyboard on it is moved away by something else (another pane, a sync): the row after it
	const w = await nameAt(p, 'Part Two/The wreck.md');
	await p.click(w.x, w.y);
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part Two/The wreck.md')}, 'The wreck.md').then(() => 1)`);
	await p.sleep(900);
	t.eq(await keyboardOn(p), 'Part Two/Lights out.md', 'moved out of the binder from elsewhere: the keyboard is on the next row');
	await p.ev(`app.fileManager.renameFile(${file('The wreck.md')}, ${j(L + 'Part Two/The wreck.md')}).then(() => 1)`);
	await flush(p);
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Storm warning.md']: L + 'Part Two/Storm warning.md', [L + 'Part One/Arrival.md']: L + 'Part Two/Arrival.md', [L + 'Prologue.md']: L + 'Part One/Prologue.md' } });
}));
