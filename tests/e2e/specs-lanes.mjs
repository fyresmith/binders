// The corkboard arranged by label (src/view/lanes.ts, lanes-data.ts; the view chooses the board in BinderView.ts): "Arrange" in the toolbar, a line per
// label with the cards along them in binder order, dragging across the lines (the label), along them (the order) and
// both at once, undone as one change; stacks, the filter, outside edits, the keyboard, a line's menu, Longform
// projects, the notes in subfolders, right to left, reduced motion, a phone, and a board of a thousand cards.
// Every test that changes files checks no text was lost.
import { B, NOTE, PL, VIEW, card, cards, clickMenu, closeMenus, contents, file, flush, j, menuItems, openView, read, reload, same, split, texts, tidy, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'lanes: ' + name, fn });

const L = 'The Lighthouse/', P1 = L + 'Part One/';
const LEAF = '.workspace-leaf.mod-active';
const PART_ONE = ['Arrival', 'The keeper', 'Storm warning'].map((x) => P1 + x + '.md');
const BOARD = [L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md'];
// the labels a new vault has, in order: the lines after "No label"
const LABELS = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'];
const lane = (name) => (name ? LABELS.indexOf(name) + 1 : 0);

/** Opens the corkboard on a folder, arranged by label. */
async function openBy(p, folder = L + 'Part One', options = {}) {
	await openView(p, folder);
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), mode: 'corkboard', options: { arrange: 'label', ...${j(options)} } } }); })().then(() => 1)`);
	await until(p, `!!document.querySelector('${LEAF} .binders-lanes > .binders-lane')`);
	await p.sleep(350);
}
const laneEl = (i) => `${LEAF} .binders-lanes > .binders-lane[data-lane="${i}"]`;
const head = (i) => `${LEAF} .binders-lane-head[data-lane="${i}"]`;
const laneOfCard = (p, path) => p.ev(`Number(document.querySelector(${j(card(path))})?.dataset.lane ?? -1)`);
const label = (p, path) => p.ev(`app.metadataCache.getFileCache(${file(path)})?.frontmatter?.label ?? null`);
const labelIs = (p, path, value) => until(p, `(app.metadataCache.getFileCache(${file(path)})?.frontmatter?.label ?? null) === ${j(value)}`, 4000);
const setLabel = async (p, path, value) => { await p.ev(`app.fileManager.processFrontMatter(${file(path)}, fm => { fm.label = ${j(value)}; }).then(() => 1)`); await labelIs(p, path, value); await p.sleep(250); };
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')].map(n => n.textContent)).filter(Boolean); })()`);
const undo = (p, redo = false) => p.ev(`(() => { const c = app.commands.findCommand('binders:${redo ? 'redo' : 'undo'}-move'); if (!c.checkCallback(true)) return false; app.commands.executeCommandById(c.id); return true; })()`);
const order = (p, folder = L + 'Part One') => p.ev(`${B}.orderedChildren(${file(folder)}).map(f => f.name)`);
/** Takes a card by its middle and lets it go with its middle on a line (`to.lane`) and/or at `to.x`. */
async function dragCard(p, path, to, { drop = true } = {}) {
	const from = await p.at(card(path)), ln = to.lane != null ? await p.at(laneEl(to.lane)) : null;
	const x = to.x ?? from.x, y = ln ? ln.y : from.y;
	await p.move(from.x, from.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
	await p.move(x, y, 14, { buttons: 1 });
	await p.sleep(200);
	if (drop) { await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await p.sleep(250); }
	return { x, y };
}
const release = async (p, at) => { await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }); await p.sleep(250); };
/** Every note but `changed` is byte-for-byte what it was; the changed ones keep their text under the properties. */
function intact(t, before, after, changed = [], moved = {}) {
	same(t, before, after, { skip: changed, moved });
	for (const path of changed) t.eq(split(after[moved[path] ?? path]).body, split(before[path]).body, `the text of “${path}” is untouched`);
}

test('“Arrange” in the toolbar: in a grid or by label, with the lines’ options; it stays through a reload', async (p, h, t) => {
	await openView(p);
	const btn = `${LEAF} .binders-arrange-button`;
	t.eq(await p.ev(`document.querySelector('${btn} .text-button-label')?.textContent`), 'Arrange', 'the corkboard’s toolbar has “Arrange”');
	let b = await p.at(btn);
	await p.click(b.x, b.y);
	await p.sleep(250);
	t.eq(j(await menuItems(p)), j(['In a grid', 'By label']), 'in a grid, or by label');
	await clickMenu(p, 'By label');
	await until(p, `!!document.querySelector('${LEAF} .binders-lanes > .binders-lane')`);
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelector('${btn} .text-button-label')?.textContent`), 'By label', 'the button says so');
	t.ok(await p.ev(`document.querySelector('${btn}').classList.contains('is-active')`), 'as a filter that’s on does');
	t.eq((await viewState(p)).options.arrange, 'label', 'it’s one of the view’s options');
	t.eq((await viewState(p)).mode, 'corkboard', 'still the corkboard');
	t.eq(j(await cards(p)), j(BOARD), 'the same cards, in binder order');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-lane-name')].map(e => e.textContent)`)), j(['No label', ...LABELS]), 'a line for no label, then one for each label in settings, in their order');
	t.ok(await p.ev(`document.querySelector('${LEAF} .binders-lanes').classList.contains('mod-across')`), 'the lines run across');
	// one place each, along the lines
	const xs = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => Math.round(c.getBoundingClientRect().left))`);
	t.ok(xs.every((x, i) => !i || x > xs[i - 1]), `each card a place further along (${j(xs)})`);
	b = await p.at(btn);
	await p.click(b.x, b.y);
	await p.sleep(250);
	t.eq(j(await menuItems(p)), j(['In a grid', 'By label', 'Lines across', 'Lines down', 'Show notes in subfolders', 'Show unused labels']), 'by label, the menu has the lines’ options too');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.menu .menu-item')].filter(e => e.querySelector('.menu-item-icon.mod-checked, .mod-checked') || e.classList.contains('mod-checked')).map(e => e.querySelector('.menu-item-title').textContent)`)), j(['By label', 'Lines across', 'Show unused labels']), 'ticked: by label, lines across, unused labels shown (subfolders’ notes not)');
	await clickMenu(p, 'Lines down');
	await p.sleep(300);
	t.ok(await p.ev(`document.querySelector('${LEAF} .binders-lanes').classList.contains('mod-down')`), 'the lines run down');
	const ys = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => Math.round(c.getBoundingClientRect().top))`);
	t.ok(ys.every((y, i) => !i || y > ys[i - 1]), `each card a place further down (${j(ys)})`);
	// the mode switch is as it was: three modes
	const m = await p.at(`${LEAF} .binders-mode-button`);
	await p.click(m.x, m.y);
	await p.sleep(250);
	t.eq(j(await menuItems(p)), j(['Corkboard', 'Outliner', 'Manuscript']), 'the mode switch has its three modes');
	await closeMenus(p);
	// only the corkboard has arrangements
	await p.ev(`${VIEW}.setMode('outliner')`);
	await p.sleep(300);
	t.ok(await p.ev(`document.querySelector('${btn}').classList.contains('is-hidden')`), 'the outliner has no “Arrange”');
	await p.ev(`${VIEW}.setMode('corkboard')`);
	await until(p, `!!document.querySelector('${LEAF} .binders-lanes > .binders-lane')`);
	t.ok(await p.ev(`document.querySelector('${LEAF} .binders-lanes').classList.contains('mod-down') && !document.querySelector('${btn}').classList.contains('is-hidden')`), 'back on the corkboard, it’s as it was left');
	// the same items in More options
	t.ok(await p.ev(`(() => { const items = []; const menu = { addItem(cb) { const it = { setSection() { return it; }, setTitle(x) { items.push(typeof x === 'string' ? x : x.textContent); return it; }, setIcon() { return it; }, setChecked() { return it; }, onClick() { return it; }, setIsLabel() { return it; }, setSubmenu() { return menu; }, setWarning() { return it; }, setDisabled() { return it; } }; cb(it); return menu; }, addSeparator() { return menu; } }; ${VIEW}.onPaneMenu(menu, 'more-options'); return ['In a grid', 'By label', 'Lines across', 'Lines down', 'Show notes in subfolders', 'Show unused labels'].every(x => items.includes(x)); })()`), '“More options” has them too');
	await flush(p);
	await p.ev(`app.workspace.requestSaveLayout.run?.() ?? app.workspace.saveLayout?.()`).catch(() => {});
	await p.sleep(600);
	await reload(p);
	await until(p, `!!document.querySelector('.binders-lanes > .binders-lane')`, 8000);
	const s = await viewState(p);
	t.eq(j([s.mode, s.options.arrange, s.options.lines]), j(['corkboard', 'label', 'down']), 'after a reload: by label, lines down');
	t.ok(await p.ev(`document.querySelector('.binders-lanes').classList.contains('mod-down')`), 'and drawn so');
	// the command goes back to the grid
	await p.focusMain();
	await p.ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true })`);
	t.ok(await p.ev(`!!app.commands.findCommand('binders:arrange-by-label')?.checkCallback(true)`), 'the command “Arrange corkboard by label” is there');
	await h.run('arrange-by-label');
	await until(p, `!document.querySelector('.binders-lanes') && !!document.querySelector('.binders-card-new')`);
	t.eq((await viewState(p)).options.arrange, 'grid', 'the command puts the cards back in their grid');
	await h.run('arrange-by-label');
	await until(p, `!!document.querySelector('.binders-lanes > .binders-lane')`);
	t.eq((await viewState(p)).options.arrange, 'label', 'and by label again');
});

test('lines down: the lines are columns; across them is the label, down them the order; the arrows turn with them', async (p, h, t) => {
	await openBy(p, L + 'Part One', { lines: 'down' });
	const before = await texts(p);
	const g = await p.ev(`(() => { const R = (s) => document.querySelector(s).getBoundingClientRect(); const c = R(${j(card(PART_ONE[0]))}), l = R('${laneEl(0)}'), hd = R('${head(0)}'); return { onLine: Math.abs((c.left + c.width / 2) - (l.left + l.width / 2)) < 6, headAbove: hd.bottom <= c.top + 1 }; })()`);
	t.eq(j(g), j({ onLine: true, headAbove: true }), 'a card’s middle is on its line, the line’s name above it');
	// across (sideways): the label alone
	const blue = await p.at(laneEl(lane('Blue')));
	await dragCard(p, PART_ONE[0], { x: blue.x });
	t.ok(await labelIs(p, PART_ONE[0], 'Blue'), 'dragged sideways to another line, it has that label');
	t.eq(j(await order(p)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'and its place');
	await p.sleep(450);
	// down the lines: the order; and both at once
	const last = await p.at(card(PART_ONE[2])), red = await p.at(laneEl(lane('Red'))), from = await p.at(card(PART_ONE[0]));
	await p.move(from.x, from.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
	await p.move(red.x, last.y + last.h / 2 + 20, 14, { buttons: 1 });
	await p.sleep(200);
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost .binders-lane-tag')?.textContent`), 'Red', 'the label it would take');
	t.ok(await p.ev(`(() => { const l = document.querySelector('.binders-drop-indicator'); return l.classList.contains('is-active') && !l.classList.contains('is-vertical'); })()`), 'the insertion line lies across the lines');
	await release(p, { x: red.x, y: last.y + last.h / 2 + 20 });
	t.ok(await labelIs(p, PART_ONE[0], 'Red'), 'dropped lower down on another line: the label');
	await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[2]?.name === 'Arrival.md'`);
	t.eq(j(await order(p)), j(['The keeper.md', 'Storm warning.md', 'Arrival.md']), 'and the last place');
	await p.sleep(450);
	// the arrows: down and up go through the order, left and right across the lines
	await p.ev(`document.querySelector(${j(card(PART_ONE[1]))}).focus()`);
	await p.key('ArrowDown');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), PART_ONE[2], 'Down goes to the next card in the order');
	await p.key('ArrowRight');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), PART_ONE[0], 'Right goes to the nearest card on the next line');
	await p.key('ArrowLeft', 'alt');
	t.ok(await labelIs(p, PART_ONE[0], null), 'Alt+Left gives it the line before’s label (none)');
	await until(p, `document.activeElement?.dataset?.path === ${j(PART_ONE[0])} && document.activeElement.dataset.lane === '0'`);
	await p.key('ArrowUp', 'alt');
	await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[1]?.name === 'Arrival.md'`);
	t.eq(j(await order(p)), j(['The keeper.md', 'Arrival.md', 'Storm warning.md']), 'Alt+Up moves it one place back');
	await flush(p);
	intact(t, before, await texts(p), [NOTE]);
});

test('a card dragged straight across to another line takes that label: only `label` is written, no text changes', async (p, h, t) => {
	await openBy(p);
	const before = await texts(p), list = j(await contents(p));
	t.eq(await laneOfCard(p, PART_ONE[0]), 0, 'a card with no label is on the first line');
	const at = await dragCard(p, PART_ONE[0], { lane: lane('Blue') }, { drop: false });
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost .binders-lane-tag')?.textContent`), 'Blue', 'while it’s held over a line, the card in hand says the label it would take');
	t.ok(await p.ev(`document.querySelector('${laneEl(lane('Blue'))}').classList.contains('is-drop-target') && document.querySelector('${head(lane('Blue'))}').classList.contains('is-drop-target')`), 'and that line is marked');
	t.ok(!(await p.ev(`document.querySelector('.binders-drop-indicator')?.classList.contains('is-active')`)), 'no insertion line: its place doesn’t change');
	await release(p, at);
	t.ok(await labelIs(p, PART_ONE[0], 'Blue'), `the note has the label (${await label(p, PART_ONE[0])})`);
	await until(p, `document.querySelector(${j(card(PART_ONE[0]))})?.dataset.lane === '${lane('Blue')}'`);
	t.eq(await laneOfCard(p, PART_ONE[0]), lane('Blue'), 'its card is on that label’s line');
	await flush(p);
	const after = await texts(p);
	intact(t, before, after, [PART_ONE[0]]);
	t.eq(split(after[PART_ONE[0]]).yaml, split(before[PART_ONE[0]]).yaml + '\nlabel: Blue', 'its properties are as they were, with the label added');
	t.eq(j(await contents(p)), list, 'the binder’s order is untouched');
	t.eq(j(await cards(p)), j(PART_ONE), 'the cards keep their places');
	// back to no label: the property goes
	await dragCard(p, PART_ONE[0], { lane: 0 });
	t.ok(await labelIs(p, PART_ONE[0], null), 'dragged to “No label”, the property is taken away');
	await flush(p);
	t.eq((await texts(p))[PART_ONE[0]], before[PART_ONE[0]], 'and the note is byte for byte what it was');
});

test('a card dragged along its line changes place in the binder: only `contents` is written', async (p, h, t) => {
	await openBy(p);
	const before = await texts(p);
	const last = await p.at(card(PART_ONE[2]));
	const at = await dragCard(p, PART_ONE[0], { x: last.x + last.w / 2 + 30 }, { drop: false });
	t.ok(await p.ev(`document.querySelector('.binders-drop-indicator')?.classList.contains('is-active')`), 'a line shows where it would go');
	t.ok(!(await p.ev(`!!document.querySelector('.binders-drag-ghost .binders-lane-tag')`)), 'no label is named: it stays on its line');
	await release(p, at);
	await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[2]?.name === 'Arrival.md'`);
	t.eq(j(await order(p)), j(['The keeper.md', 'Storm warning.md', 'Arrival.md']), 'it’s last in the folder now');
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.indexOf('Part One/Storm warning') < s.indexOf('Part One/Arrival'))`);
	const after = await texts(p);
	intact(t, before, after, [NOTE]);
	t.eq(j((await contents(p)).filter((c) => c.startsWith('Part One/'))), j(['Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival']), 'the binder note lists it there');
	t.ok(!/label/.test(after[PART_ONE[0]]), 'no label was written');
	t.eq(j(await cards(p)), j([PART_ONE[1], PART_ONE[2], PART_ONE[0]]), 'and the cards read in that order');
});

test('a diagonal drag does both, as one change: Undo takes back the label and the place, Redo makes both again', async (p, h, t) => {
	await openBy(p);
	const before = await texts(p), list = j(await contents(p));
	const last = await p.at(card(PART_ONE[2]));
	const at = await dragCard(p, PART_ONE[0], { lane: lane('Blue'), x: last.x + last.w / 2 + 30 }, { drop: false });
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost .binders-lane-tag')?.textContent`), 'Blue', 'the label it would take');
	t.ok(await p.ev(`document.querySelector('.binders-drop-indicator')?.classList.contains('is-active')`), 'and the place it would take');
	await release(p, at);
	t.ok(await labelIs(p, PART_ONE[0], 'Blue'), 'the label');
	await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[2]?.name === 'Arrival.md'`);
	t.eq(j(await order(p)), j(['The keeper.md', 'Storm warning.md', 'Arrival.md']), 'and the place');
	await flush(p);
	intact(t, before, await texts(p), [PART_ONE[0], NOTE]);
	t.eq(await p.ev(`${B}.undoable(${file(L + 'Part One')})`), 'Move “Arrival” and label it Blue', 'one change to take back');
	t.ok(await undo(p), '“Undo last move” is offered');
	t.ok(await labelIs(p, PART_ONE[0], null), 'Undo takes the label away');
	await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[0]?.name === 'Arrival.md'`);
	t.eq(j(await order(p)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'and puts the card back');
	t.ok((await notices(p)).some((n) => n === 'Undid: move “Arrival” and label it Blue'), `and says what it undid (${j(await notices(p))})`);
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.indexOf('Part One/Arrival') < s.indexOf('Part One/The keeper'))`);
	const undone = await texts(p);
	t.eq(undone[PART_ONE[0]], before[PART_ONE[0]], 'the note is byte for byte what it was');
	t.eq(j(await contents(p)), list, 'and so is the order');
	intact(t, before, undone, [NOTE]);
	await until(p, `document.querySelector(${j(card(PART_ONE[0]))})?.dataset.lane === '0'`);
	t.eq(j(await cards(p)), j(PART_ONE), 'the board shows it');
	t.ok(await undo(p, true), '“Redo last move” is offered');
	t.ok(await labelIs(p, PART_ONE[0], 'Blue'), 'Redo gives the label again');
	await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[2]?.name === 'Arrival.md'`);
	t.eq(j(await order(p)), j(['The keeper.md', 'Storm warning.md', 'Arrival.md']), 'and the place');
	await flush(p);
	intact(t, before, await texts(p), [PART_ONE[0], NOTE]);
	// a label alone is a change to undo too, by Ctrl+Z in the view
	await p.sleep(500); // (the cards have glided to their places)
	await dragCard(p, PART_ONE[1], { lane: lane('Red') });
	t.ok(await labelIs(p, PART_ONE[1], 'Red'), 'another card, to another line');
	t.eq(await p.ev(`${B}.undoable(${file(L + 'Part One')})`), 'Label “The keeper” as Red', 'a label alone is a change to take back');
	await p.ev(`document.querySelector(${j(card(PART_ONE[1]))}).focus()`);
	await p.key('z', 'ctrl');
	t.ok(await labelIs(p, PART_ONE[1], null), 'Ctrl+Z in the view takes it back');
	await flush(p);
	t.eq((await texts(p))[PART_ONE[1]], before[PART_ONE[1]], 'byte for byte');
});

test('several cards dragged together take the line’s label together, and keep their order', async (p, h, t) => {
	await openBy(p);
	const before = await texts(p);
	const a = await p.at(card(PART_ONE[0]) + ' .binders-card-head'), c = await p.at(card(PART_ONE[2]) + ' .binders-card-head');
	await p.click(a.x, a.y);
	await p.click(c.x, c.y, { modifiers: 2 });
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card.is-selected').length`), 2, 'two cards selected');
	await dragCard(p, PART_ONE[2], { lane: lane('Green') });
	t.ok((await labelIs(p, PART_ONE[0], 'Green')) && (await labelIs(p, PART_ONE[2], 'Green')), 'both have the label');
	t.eq(await label(p, PART_ONE[1]), null, 'the one between them doesn’t');
	t.eq(j(await order(p)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'straight across: their places are as they were');
	await flush(p);
	intact(t, before, await texts(p), [PART_ONE[0], PART_ONE[2]]);
	t.eq(await p.ev(`${B}.undoable(${file(L + 'Part One')})`), 'Label 2 items as Green', 'one change');
	await undo(p);
	t.ok((await labelIs(p, PART_ONE[0], null)) && (await labelIs(p, PART_ONE[2], null)), 'undone together');
	await flush(p);
	same(t, before, await texts(p));
});

test('a stack takes a label through its folder note, made if it has none', withTidy(async (p, h, t) => {
	await openBy(p, 'The Lighthouse');
	const before = await texts(p), note = P1 + 'Part One.md';
	t.ok(!(await p.ev(`!!${file(note)}`)), 'Part One has no folder note');
	t.eq(await laneOfCard(p, L + 'Part One'), 0, 'its stack is on the first line');
	await dragCard(p, L + 'Part One', { lane: lane('Red') });
	t.ok(await labelIs(p, note, 'Red'), 'the folder note was made, with the label');
	await until(p, `document.querySelector(${j(card(L + 'Part One'))})?.dataset.lane === '${lane('Red')}'`);
	t.eq(await laneOfCard(p, L + 'Part One'), lane('Red'), 'the stack is on that line');
	await flush(p);
	const after = await texts(p);
	same(t, before, after);
	t.eq(after[note], '---\nlabel: Red\n---\n', 'the folder note holds the label and nothing else');
	t.eq(j(await cards(p)), j(BOARD), 'the folder note is not a card');
	await undo(p);
	t.ok(await labelIs(p, note, null), 'Undo takes the label away again');
	await until(p, `document.querySelector(${j(card(L + 'Part One'))})?.dataset.lane === '0'`);
	await flush(p);
	same(t, before, await texts(p));
}));

test('Escape, and a drop outside the board, change nothing', async (p, h, t) => {
	await openBy(p);
	const before = await texts(p), undoable = await p.ev(`${B}.undoable(${file(L + 'Part One')})`);
	let at = await dragCard(p, PART_ONE[0], { lane: lane('Blue') }, { drop: false });
	t.ok(await p.ev(`!!document.querySelector('.binders-drag-ghost')`), 'a card is in hand');
	await p.key('Escape');
	await p.sleep(200);
	t.ok(!(await p.ev(`!!document.querySelector('.binders-drag-ghost, .binders-drop-indicator')`)), 'Escape puts it down');
	await release(p, at);
	await p.sleep(400);
	t.eq(await label(p, PART_ONE[0]), null, 'no label was given');
	// let go over the toolbar (not above it: past the view's own header the tab strip takes a card as a note to open, see
	// specs-card-file-drag.mjs)
	const bar = await p.at(`${LEAF} .binders-toolbar-spacer`);
	at = await dragCard(p, PART_ONE[0], { x: bar.x }, { drop: false });
	await p.move(bar.x, bar.y, 6, { buttons: 1 });
	await release(p, { x: bar.x, y: bar.y });
	await p.sleep(500);
	t.ok(!(await p.ev(`!!document.querySelector('.binders-drag-ghost, .binders-drop-indicator')`)), 'nothing is left in hand');
	await flush(p);
	same(t, before, await texts(p));
	t.eq(j(await cards(p)), j(PART_ONE), 'the board is as it was');
	t.eq(await p.ev(`${B}.undoable(${file(L + 'Part One')})`), undoable, 'and there’s nothing new to undo');
});

test('a read-only binder (a newer format) can’t be changed: no drag, no keys, no new note', async (p, h, t) => {
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem(${file(NOTE)})`);
	await openBy(p);
	const before = await texts(p), shown = j(await cards(p));
	const at = await dragCard(p, PART_ONE[0], { lane: lane('Blue') }, { drop: false });
	t.ok(!(await p.ev(`!!document.querySelector('.binders-drag-ghost')`)), 'a card can’t be picked up');
	await release(p, at);
	await p.ev(`document.querySelector(${j(card(PART_ONE[0]))}).focus()`);
	await p.key('ArrowDown', 'alt');
	await p.key('ArrowRight', 'alt');
	await p.sleep(500);
	const empty = await p.at(laneEl(lane('Pink')));
	await p.dbl(empty.x + 300, empty.y);
	await p.sleep(400);
	const hd = await p.at(head(1));
	await p.click(hd.x, hd.y);
	await p.sleep(250);
	t.ok(!(await menuItems(p)).some((x) => /New note/.test(x)), 'a line’s menu offers no new note');
	await closeMenus(p);
	await flush(p);
	same(t, before, await texts(p));
	t.eq(j(await cards(p)), shown, 'nothing moved, nothing was made');
});

test('the filter hides cards on the lines too; hidden unused labels leave only the lines in use', async (p, h, t) => {
	await setLabel(p, PART_ONE[0], 'Blue');
	await setLabel(p, PART_ONE[1], 'Red');
	await openBy(p);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.lane)`)), j([String(lane('Blue')), String(lane('Red')), '0']), 'each card on its label’s line');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-lane-head')].map(e => e.querySelector('.binders-lane-count')?.textContent ?? '')`)), j(['1', '1', '', '', '', '', '1', '', '']), 'each line says how many notes are on it');
	const before = await texts(p);
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), filter: { status: [], label: ['Blue'] } } }); })().then(() => 1)`);
	await p.sleep(500);
	t.eq(j(await cards(p)), j([PART_ONE[0]]), 'filtered by a label: only its cards show');
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-lanes > .binders-lane').length`), 9, 'the lines are all still there');
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), filter: { status: [], label: [] }, options: { arrange: 'label', linesUnused: false } } }); })().then(() => 1)`);
	await p.sleep(500);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-lane-name')].map(e => e.textContent)`)), j(['No label', 'Red', 'Blue']), 'with unused labels hidden: no label, and the labels the cards have, in settings’ order');
	t.eq(j(await cards(p)), j(PART_ONE), 'and every card again');
	await flush(p);
	same(t, before, await texts(p));
});

test('a label written outside Binders moves the card to that line', async (p, h, t) => {
	await openBy(p);
	const text = await read(p, PART_ONE[2]);
	await writeRaw(p, PART_ONE[2], text.replace(/^---\n/, '---\nlabel: green\n'));
	await until(p, `document.querySelector(${j(card(PART_ONE[2]))})?.dataset.lane === '${lane('Green')}'`, 5000);
	t.eq(await laneOfCard(p, PART_ONE[2]), lane('Green'), 'the card is on the green line (a label in any case is the one in settings)');
	await p.sleep(450); // (once it has glided there)
	t.ok(await p.ev(`(() => { const c = document.querySelector(${j(card(PART_ONE[2]))}), l = document.querySelector('${laneEl(lane('Green'))}'); const a = c.getBoundingClientRect(), b = l.getBoundingClientRect(); return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) < 6; })()`), 'its middle on the line');
	await writeRaw(p, PART_ONE[2], text.replace(/^---\n/, '---\nlabel: Ghost\n'));
	await until(p, `[...document.querySelectorAll('${LEAF} .binders-lane-name')].some(e => e.textContent === 'Ghost')`, 5000);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-lane-name')].map(e => e.textContent).slice(-2)`)), j(['Pink', 'Ghost']), 'a label that isn’t in settings gets a line of its own, after the others');
	t.eq(await laneOfCard(p, PART_ONE[2]), 9, 'with the card on it');
	t.eq(await read(p, PART_ONE[2]), text.replace(/^---\n/, '---\nlabel: Ghost\n'), 'the note is as it was written');
});

test('the keyboard: arrows along and across the lines, Alt with them to move and to change label; what a screen reader hears', async (p, h, t) => {
	await setLabel(p, PART_ONE[1], 'Red');
	await openBy(p);
	const before = await texts(p);
	const focused = () => p.ev(`document.activeElement?.dataset?.path ?? null`);
	await p.ev(`document.querySelector(${j(card(PART_ONE[0]))}).focus()`);
	// what's said
	const a11y = await p.ev(`(() => { const g = document.querySelector('${LEAF} .binders-lanes'), c = document.querySelector(${j(card(PART_ONE[0]))}), l0 = document.querySelector('${laneEl(0)}'), l1 = document.querySelector('${laneEl(1)}'); return { list: g.getAttribute('role'), multi: g.getAttribute('aria-multiselectable'), name: g.getAttribute('aria-label'), card: c.getAttribute('aria-label'), role: c.getAttribute('role'), lane: [l0.getAttribute('role'), l0.getAttribute('aria-label')], owns: (l0.getAttribute('aria-owns') || '').split(' ').map(id => document.getElementById(id)?.dataset.path), lane1: l1.getAttribute('aria-label'), head: document.querySelector('${head(1)}').getAttribute('aria-label'), live: !!document.querySelector('${LEAF} .binders-live[aria-live="polite"]') }; })()`);
	t.eq(j(a11y), j({ list: 'listbox', multi: 'true', name: 'Part One, by label', card: 'Arrival, no label', role: 'option', lane: ['group', 'No label: 2 notes, 34 words'], owns: [PART_ONE[0], PART_ONE[2]], lane1: 'Red: 1 note, 17 words', head: 'Red: 1 note, 17 words. Menu', live: true }), 'the board is a list; each line a named group that holds its cards; a card says its label');
	await p.key('ArrowRight');
	t.eq(await focused(), PART_ONE[1], 'Right goes to the next card in the binder’s order, whatever line it’s on');
	await p.key('ArrowUp');
	t.eq(await focused(), PART_ONE[0], 'Up goes to the nearest card on the line above');
	await p.key('ArrowDown');
	t.eq(await focused(), PART_ONE[1], 'Down to the nearest on the line below');
	await p.key('End');
	t.eq(await focused(), PART_ONE[2], 'End goes to the last card');
	await p.key('Home');
	t.eq(await focused(), PART_ONE[0], 'Home to the first');
	// Alt and an arrow across: the next line's label
	await p.key('ArrowDown', 'alt');
	t.ok(await labelIs(p, PART_ONE[0], 'Red'), 'Alt+Down gives the card the next line’s label');
	await until(p, `document.querySelector(${j(card(PART_ONE[0]))})?.dataset.lane === '1' && document.activeElement?.dataset?.path === ${j(PART_ONE[0])}`);
	t.eq(await focused(), PART_ONE[0], 'the keyboard stays on it');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-live').textContent`), 'Arrival: label Red', 'a screen reader is told');
	t.eq(await p.ev(`document.querySelector(${j(card(PART_ONE[0]))}).getAttribute('aria-label')`), 'Arrival, label Red', 'and the card says its label');
	await p.key('ArrowUp', 'alt');
	t.ok(await labelIs(p, PART_ONE[0], null), 'Alt+Up takes it back to no label');
	await until(p, `document.querySelector(${j(card(PART_ONE[0]))})?.dataset.lane === '0' && document.activeElement?.dataset?.path === ${j(PART_ONE[0])}`);
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-live').textContent`), 'Arrival: no label', 'said too');
	await p.key('ArrowUp', 'alt');
	await p.sleep(300);
	t.eq(await label(p, PART_ONE[0]), null, 'there’s no line above the first');
	await flush(p);
	same(t, before, await texts(p));
	// Alt and an arrow along: its place
	await p.key('ArrowRight', 'alt');
	await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[1]?.name === 'Arrival.md'`);
	t.eq(j(await order(p)), j(['The keeper.md', 'Arrival.md', 'Storm warning.md']), 'Alt+Right moves the card one place on');
	await until(p, `document.activeElement?.dataset?.path === ${j(PART_ONE[0])}`);
	await p.key('ArrowLeft', 'alt');
	await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[0]?.name === 'Arrival.md'`);
	t.eq(j(await order(p)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'Alt+Left moves it back');
	await until(p, `document.activeElement?.dataset?.path === ${j(PART_ONE[0])}`);
	// the menu, renaming, opening
	await p.key('F10', 'shift');
	await p.sleep(300);
	t.ok((await menuItems(p)).includes('Set label') && (await menuItems(p)).includes('Rename'), 'Shift+F10 opens the card’s menu');
	await closeMenus(p);
	await p.ev(`document.querySelector(${j(card(PART_ONE[0]))}).focus()`);
	await p.key('F2');
	await p.sleep(200);
	t.ok(await p.ev(`document.activeElement?.matches(${j(card(PART_ONE[0]) + ' .binders-card-title input')})`), 'F2 renames it in place');
	await p.key('Escape');
	await p.sleep(200);
	await p.ev(`document.querySelector(${j(card(PART_ONE[0]))}).focus()`);
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(PART_ONE[0])}`);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), PART_ONE[0], 'Enter opens the note');
	await flush(p);
	intact(t, before, await texts(p), [NOTE]);
});

test('a line’s menu: a new note with its label, its notes selected, a new label added to settings', withTidy(async (p, h, t) => {
	await setLabel(p, PART_ONE[0], 'Blue');
	await setLabel(p, PART_ONE[2], 'Blue');
	await openBy(p);
	const before = await texts(p);
	let hd = await p.at(head(lane('Blue')));
	await p.click(hd.x, hd.y);
	await p.sleep(250);
	t.eq(j(await menuItems(p)), j(['New note with this label', 'Select its notes', 'New label...', 'Edit labels...']), 'what a line’s menu offers');
	await clickMenu(p, 'Select its notes');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-selected')].map(c => c.dataset.path)`)), j([PART_ONE[0], PART_ONE[2]]), 'the notes on the line are selected');
	hd = await p.at(head(lane('Blue')));
	await p.click(hd.x, hd.y);
	await p.sleep(250);
	await clickMenu(p, 'New note with this label');
	const made = P1 + 'Untitled.md';
	t.ok(await labelIs(p, made, 'Blue'), 'a new note, with the line’s label');
	await until(p, `document.activeElement?.matches(${j(card(made) + ' .binders-card-title input')})`);
	t.ok(await p.ev(`document.activeElement?.matches(${j(card(made) + ' .binders-card-title input')})`), 'its title ready to type');
	await p.type('Wake');
	await p.key('Enter');
	await until(p, `!!${file(P1 + 'Wake.md')}`);
	t.eq(await laneOfCard(p, P1 + 'Wake.md'), lane('Blue'), 'named, on the blue line');
	t.eq(j(await order(p)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md', 'Wake.md']), 'at the end of the folder');
	// a new label
	hd = await p.at(head(0));
	await p.click(hd.x, hd.y);
	await p.sleep(250);
	t.eq(j(await menuItems(p)), j(['New note', 'Select its note', 'New label...', 'Edit labels...']), 'the first line’s menu: a note with no label');
	await clickMenu(p, 'New label...');
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	t.eq(await p.ev(`document.querySelector('.modal .modal-title')?.textContent`), 'New label', 'a dialog asks for it');
	await p.type('blue');
	await p.key('Enter');
	await p.sleep(250);
	t.eq(await p.ev(`document.querySelector('.modal .binders-ask-error')?.textContent`), 'There’s a label called “blue” already.', 'a name that’s taken is refused, and the dialog stays');
	await p.ev(`(() => { const i = document.querySelector('.modal .binders-ask input'); i.focus(); i.select(); return 1; })()`);
	await p.type('Mara');
	await p.key('Enter');
	await until(p, `${PL}.settings.labels.some(l => l.name === 'Mara')`);
	t.eq(j(await p.ev(`${PL}.settings.labels.slice(-1)[0]`)), j({ name: 'Mara', color: 'red' }), 'the label is added to settings, after the others');
	await until(p, `[...document.querySelectorAll('${LEAF} .binders-lane-name')].some(e => e.textContent === 'Mara')`);
	t.eq(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-lane-name')].map(e => e.textContent).pop()`), 'Mara', 'and has a line, the last');
	await dragCard(p, PART_ONE[1], { lane: 9 });
	t.ok(await labelIs(p, PART_ONE[1], 'Mara'), 'a card dropped on it takes it');
	await flush(p);
	intact(t, before, await texts(p), [PART_ONE[1], NOTE]);
}));

test('a double-click on a line makes a note there, with that line’s label', withTidy(async (p, h, t) => {
	await openBy(p);
	const before = await texts(p);
	const second = await p.at(card(PART_ONE[1])), ln = await p.at(laneEl(lane('Yellow')));
	await p.dbl(second.x - second.w / 2 - 4, ln.y);
	const made = P1 + 'Untitled.md';
	t.ok(await labelIs(p, made, 'Yellow'), `a new note with the line’s label (${await label(p, made)})`);
	await until(p, `document.activeElement?.matches(${j(card(made) + ' .binders-card-title input')})`);
	await p.key('Escape');
	t.eq(j(await order(p)), j(['Arrival.md', 'Untitled.md', 'The keeper.md', 'Storm warning.md']), 'where it was double-clicked: between the first card and the second');
	await flush(p);
	intact(t, before, await texts(p), [NOTE]);
}));

test('nothing labeled yet: the board says what the lines are for; no labels at all: it offers to add one', async (p, h, t) => {
	await openBy(p);
	t.eq(await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-lanes-hint'); return e.classList.contains('is-shown') ? e.textContent : null; })()`), 'Drag a card onto a line to give it that label.', 'a line of help, until a card has a label');
	await setLabel(p, PART_ONE[0], 'Blue');
	await until(p, `!document.querySelector('${LEAF} .binders-lanes-hint').classList.contains('is-shown')`);
	t.ok(!(await p.ev(`document.querySelector('${LEAF} .binders-lanes-hint').classList.contains('is-shown')`)), 'then it goes');
	await p.ev(`app.fileManager.processFrontMatter(${file(PART_ONE[0])}, fm => { delete fm.label; }).then(() => 1)`);
	await p.ev(`(async () => { ${PL}.settings.labels = []; await ${PL}.saveSettings(); })().then(() => 1)`);
	await until(p, `document.querySelectorAll('${LEAF} .binders-lanes > .binders-lane').length === 1`);
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-lanes-hint').textContent`), 'There are no labels yet. Add a label', 'with no labels in settings, it says so and offers to add one');
	t.eq(j(await cards(p)), j(PART_ONE), 'the cards are all on the one line');
});

test('a Longform project: a scene takes a label, and a new place writes only `longform.scenes`', async (p, h, t) => {
	const F = 'Longform demo', IDX = F + '/Index.md', scene = (n) => `${F}/${n}.md`;
	await openBy(p, F, { cardSize: 'small' }); // (small cards: all five in sight)
	const before = await texts(p), was = await order(p, F);
	t.eq(j(was), j(['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Return.md']), 'its scenes, in order');
	t.eq(j(await cards(p)), j(was.map((n) => F + '/' + n)), 'each a card');
	const first = await p.at(card(scene('Harbor')));
	await dragCard(p, scene('Return'), { lane: lane('Blue'), x: first.x - first.w / 2 + 20 });
	t.ok(await labelIs(p, scene('Return'), 'Blue'), 'the scene has the label');
	await until(p, `${B}.orderedChildren(${file(F)})[0]?.name === 'Return.md'`);
	t.eq(j(await order(p, F)), j(['Return.md', 'Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md']), 'and is first');
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(IDX)}).then(s => s.indexOf('- Return') < s.indexOf('- Harbor'))`);
	const after = await texts(p);
	intact(t, before, after, [scene('Return'), IDX]);
	const rest = (s) => s.replace(/  scenes:\n(?: {4}.*\n)+/, '  scenes:\n');
	t.eq(rest(after[IDX]), rest(before[IDX]), 'in the index note only the scenes’ order changed');
	t.ok(!/contents:|binder:/.test(after[IDX]), 'nothing of a binder’s was written into it');
	await undo(p);
	t.ok(await labelIs(p, scene('Return'), null), 'Undo takes the label away');
	await until(p, `${B}.orderedChildren(${file(F)})[4]?.name === 'Return.md'`);
	t.eq(j(await order(p, F)), j(was), 'and puts the scene back');
	await flush(p);
	t.eq((await texts(p))[scene('Return')], before[scene('Return')], 'the scene is byte for byte what it was');
});

test('“Show notes in subfolders”: every note under its folder’s name; a drop across a folder’s name moves the note there', async (p, h, t) => {
	// (the file explorer out of the way, so the seven cards are all in sight)
	await p.ev(`(() => { app.workspace.leftSplit.collapse(); return 1; })()`);
	try { await flat(p, t); } finally { await p.ev(`(() => { app.workspace.leftSplit.expand(); return 1; })()`); }
});
async function flat(p, t) {
	await openBy(p, 'The Lighthouse', { linesFlat: true, cardSize: 'small' });
	const before = await texts(p), list = j(await contents(p));
	const all = [L + 'Prologue.md', ...PART_ONE, L + 'Part Two/The wreck.md', L + 'Part Two/Lights out.md', L + 'Epilogue.md'];
	t.eq(j(await cards(p)), j(all), 'every note, in the binder’s order; no stacks');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-lane-divider')].map(e => e.textContent)`)), j(['Part One', 'Part Two', 'The Lighthouse']), 'each folder’s name where its notes begin (and the binder’s, where its own carry on)');
	const lights = await p.at(card(L + 'Part Two/Lights out.md'));
	await dragCard(p, L + 'Epilogue.md', { lane: lane('Red'), x: lights.x - lights.w / 2 - 4 });
	const moved = L + 'Part Two/Epilogue.md';
	await until(p, `!!${file(moved)}`);
	t.ok(await p.ev(`!!${file(moved)}`), 'dropped among Part Two’s notes, the note is in Part Two');
	t.ok(await labelIs(p, moved, 'Red'), 'with the label of the line it was dropped on');
	t.eq(j(await order(p, L + 'Part Two')), j(['The wreck.md', 'Epilogue.md', 'Lights out.md']), 'between the two it was dropped between');
	await flush(p);
	intact(t, before, await texts(p), [L + 'Epilogue.md', NOTE], { [L + 'Epilogue.md']: moved });
	await undo(p);
	await until(p, `!!${file(L + 'Epilogue.md')}`);
	t.ok(await labelIs(p, L + 'Epilogue.md', null), 'Undo: back in its folder, without the label');
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => /- Epilogue\\n/.test(s))`);
	same(t, before, await texts(p));
	t.eq(j(await contents(p)), list, 'and the order is as it was');
	// a folder's name leads to that folder
	await p.ev(`document.querySelector('${LEAF} .binders-lane-divider').click()`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().getViewState().state?.folder`), L + 'Part One', 'a click on a folder’s name shows that folder');
}

test('right to left: the lines start on the right; arrows and drags follow', async (p, h, t) => {
	try {
		await p.ev(`(() => { document.body.addClass('mod-rtl'); document.documentElement.dir = 'rtl'; return 1; })()`);
		await openBy(p);
		const before = await texts(p);
		const g = await p.ev(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); return { head: r('${head(0)}').left, a: r(${j(card(PART_ONE[0]))}).left, b: r(${j(card(PART_ONE[1]))}).left }; })()`);
		t.ok(g.head > g.a && g.a > g.b, `the names are on the right, and the cards run to the left (${j(g)})`);
		await p.ev(`document.querySelector(${j(card(PART_ONE[0]))}).focus()`);
		await p.key('ArrowLeft');
		t.eq(await p.ev(`document.activeElement?.dataset?.path`), PART_ONE[1], 'Left goes on to the next card');
		const last = await p.at(card(PART_ONE[2]));
		await dragCard(p, PART_ONE[0], { lane: lane('Blue'), x: last.x - last.w / 2 - 30 });
		t.ok(await labelIs(p, PART_ONE[0], 'Blue'), 'a drag gives the label');
		await until(p, `${B}.orderedChildren(${file(L + 'Part One')})[2]?.name === 'Arrival.md'`);
		t.eq(j(await order(p)), j(['The keeper.md', 'Storm warning.md', 'Arrival.md']), 'and, dropped past the last card (to its left), the last place');
		await flush(p);
		intact(t, before, await texts(p), [PART_ONE[0], NOTE]);
	} finally {
		await p.ev(`(() => { document.body.removeClass('mod-rtl'); document.documentElement.dir = ''; return 1; })()`);
	}
});

test('reduced motion: a dropped card is on its line at once, nothing glides', async (p, h, t) => {
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
	try {
		await openBy(p);
		await dragCard(p, PART_ONE[0], { lane: lane('Blue') });
		await until(p, `document.querySelector(${j(card(PART_ONE[0]))})?.dataset.lane === '${lane('Blue')}'`);
		t.eq(await p.ev(`document.querySelector('${LEAF} .binders-lanes').getAnimations({ subtree: true }).filter(a => a.effect?.target?.classList?.contains('binders-card')).length`), 0, 'no card is gliding');
		t.ok(await p.ev(`(() => { const c = document.querySelector(${j(card(PART_ONE[0]))}), l = document.querySelector('${laneEl(lane('Blue'))}'); const a = c.getBoundingClientRect(), b = l.getBoundingClientRect(); return Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) < 6; })()`), 'it’s on its line');
	} finally { await p.send('Emulation.setEmulatedMedia', { features: [] }); }
});

// ---- a phone ----
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
/** Runs fn in Obsidian's mobile mode at this size, with touch; then puts the desktop back whatever happened (as
    specs-qa4-mobile.mjs does). Errors logged while on the device fail the test. */
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
		await touch(p, 'touchCancel').catch(() => {});
		await closeMenus(p).catch(() => {});
		await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`).catch(() => {});
		for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(300); }
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
		await theme();
		await tidy(p);
	}
	if (logged.length) throw new Error('errors logged on the device: ' + logged.slice(0, 3).join(' ; '));
}

test('on a phone: lines across with small cards; a long press and a drag gives a label; “Arrange” is a sheet', async (p, h, t) => {
	await onDevice(p, [390, 844], async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		await openBy(p);
		const before = await texts(p);
		const g = await p.ev(`(() => { const R = (e) => e.getBoundingClientRect(); const box = document.querySelector('${LEAF} .binders-corkboard'), board = box.querySelector('.binders-board'), grid = box.querySelector('.binders-lanes'), c = document.querySelector(${j(card(PART_ONE[0]))}), bar = document.querySelector('.mobile-navbar'); const heads = [...grid.querySelectorAll('.binders-lane-head')].map(R), lanes = [...grid.querySelectorAll(':scope > .binders-lane')].map(R); return { small: board.classList.contains('mod-cards-small'), across: grid.classList.contains('mod-across'), w: Math.round(R(c).width), h: Math.round(R(c).height), headRight: Math.round(Math.max(...heads.map(r => r.right))), cardLeft: Math.round(R(c).left), lanes: lanes.length, lastLine: Math.round(lanes[lanes.length - 1].top + lanes[lanes.length - 1].height / 2), foot: Math.round(bar && R(bar).height ? R(bar).top : R(box).bottom), scrolls: box.scrollHeight > box.clientHeight + 1, pitch: Math.round(lanes[1].top - lanes[0].top) }; })()`);
		t.ok(g.small && g.across, `small cards, the lines across (${j(g)})`);
		t.eq(j([g.w, g.h]), j([160, 104]), 'a small card’s size');
		t.ok(g.headRight <= g.cardLeft + 1 && g.headRight < 140, `the lines’ names take the left edge, not much of it (${g.headRight}px)`);
		t.eq(g.lanes, 9, 'every label’s line');
		t.ok(g.pitch >= 60, `the lines stand at least a little over half a card apart (${g.pitch}px)`);
		// the Arrange button is in the toolbar, an icon, and opens a sheet
		const b = await p.at(`${LEAF} .binders-arrange-button`);
		t.ok(!!b && b.w >= 32 && b.x + b.w / 2 <= 390, `“Arrange” fits the toolbar (${j(b)})`);
		await tap(p, b.x, b.y);
		await p.sleep(400);
		t.eq(j(await menuItems(p)), j(['In a grid', 'By label', 'Lines across', 'Lines down', 'Show notes in subfolders', 'Show unused labels']), 'its menu, as a sheet');
		await closeMenus(p);
		await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`);
		await p.sleep(300);
		// a swipe scrolls along the lines; a long press lifts a card
		const c = await p.at(card(PART_ONE[0])), ln = await p.at(laneEl(lane('Yellow')));
		await touch(p, 'touchStart', c.x, c.y);
		await p.sleep(650);
		for (let i = 1; i <= 10; i++) { await touch(p, 'touchMove', c.x + i, c.y + (ln.y - c.y) * i / 10); await p.sleep(20); }
		await p.sleep(250);
		t.eq(await p.ev(`document.querySelector('.binders-drag-ghost .binders-lane-tag')?.textContent`), 'Yellow', 'held and dragged to a line: the card in hand says the label');
		await touch(p, 'touchEnd');
		t.ok(await labelIs(p, PART_ONE[0], 'Yellow'), 'let go, the note has it');
		await until(p, `document.querySelector(${j(card(PART_ONE[0]))})?.dataset.lane === '${lane('Yellow')}'`);
		t.eq(j(await order(p)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'its place is as it was');
		await flush(p);
		intact(t, before, await texts(p), [PART_ONE[0]]);
		// lines down is still there to choose
		await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), options: { arrange: 'label', lines: 'down' } } }); })().then(() => 1)`);
		await p.sleep(500);
		t.ok(await p.ev(`document.querySelector('${LEAF} .binders-lanes').classList.contains('mod-down')`), 'lines down can be chosen on a phone too');
	});
});

// ---- a big board ----
test('a board of 1,000 cards by label opens and redraws quickly (and 300)', withTidy(async (p, h, t) => {
	const made = await p.ev(`(async () => {
		const labels = ['Red', 'Blue', 'Green', 'Purple', '', 'Yellow', ''];
		for (const [dir, n] of [['Heap', 1000], ['Pile', 300]]) {
			await app.vault.createFolder(dir);
			const contents = [];
			for (let i = 1; i <= n; i++) {
				const name = 'Scene ' + String(i).padStart(4, '0'), l = labels[(i * 7) % labels.length];
				await app.vault.create(dir + '/' + name + '.md', '---\\nsynopsis: Scene ' + i + ', in which something happens on the island.\\nstatus: draft' + (l ? '\\nlabel: ' + l : '') + '\\n---\\nSome words here.\\n');
				contents.push(name);
			}
			await app.vault.create(dir + '/' + dir + '.md', '---\\nbinder: 1\\ncontents:\\n' + contents.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
		}
		return 1;
	})()`);
	t.ok(made && (await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Heap') ?? app.vault.getRoot())?.length === 1000 && ${B}.scenes(app.vault.getAbstractFileByPath('Pile') ?? app.vault.getRoot())?.length === 300 && app.vault.getMarkdownFiles().filter(f => /^(Heap|Pile)\\//.test(f.path)).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`, 90000)), 'the big binders are made');
	const timed = (expr) => p.ev(`(async () => { const t = performance.now(); await (${expr}); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); })()`);
	const out = {};
	for (const [dir, n] of [['Pile', 300], ['Heap', 1000]]) {
		await openView(p, dir);
		out[`${n} open`] = await timed(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), options: { arrange: 'label' } } }); })()`);
		await until(p, `document.querySelectorAll('${LEAF} .binders-lanes > .binders-card[data-path]').length === ${n}`, 8000);
		t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-lanes > .binders-card[data-path]').length`), n, `${n} cards on the lines`);
		out[`${n} lines down`] = await timed(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), options: { arrange: 'label', lines: 'down' } } }); })()`);
		out[`${n} across again`] = await timed(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), options: { arrange: 'label', lines: 'across' } } }); })()`);
		// one card changes label: the board is drawn again, with the cards it has
		const first = `${dir}/Scene 0001.md`;
		out[`${n} relabel`] = await timed(`(async () => { await app.fileManager.processFrontMatter(${file(first)}, fm => { fm.label = 'Pink'; }); for (let i = 0; i < 200 && document.querySelector(${j(card(first))})?.dataset.lane !== '8'; i++) await new Promise(r => setTimeout(r, 10)); })()`);
		t.eq(await laneOfCard(p, first), 8, 'the card went to its line');
		// scrolled to the far end, the last cards are there
		await p.ev(`(() => { const b = document.querySelector('${LEAF} .binders-corkboard'); b.scrollLeft = b.scrollWidth; return 1; })()`);
		await p.sleep(300);
		t.ok(await p.ev(`(() => { const c = [...document.querySelectorAll('${LEAF} .binders-lanes > .binders-card[data-path]')].pop().getBoundingClientRect(), b = document.querySelector('${LEAF} .binders-corkboard').getBoundingClientRect(); return c.right <= b.right + 1 && c.left >= b.left; })()`), 'the far end of the lines can be scrolled to');
	}
	console.log('    lanes perf (ms): ' + j(out));
	for (const [k, ms] of Object.entries(out)) t.ok(ms < (/open|down|across/.test(k) ? 4000 : 1500), `${k}: ${ms}ms`);
}));
