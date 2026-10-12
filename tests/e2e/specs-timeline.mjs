// The timeline (src/view/timeline.ts, timeline-data.ts): the binder view's fourth mode, the scenes of a folder along
// story time. Each test sets its own story dates in the throwaway vault (test-vault has none). The view reads only:
// what a test does through it that writes (a card's "Set story date...", its undo) is Binders' own menu, and what the
// view does by being opened, scrolled, filtered and switched is checked against the files' bytes and times.
import { mkdirSync } from 'fs';
import { B, PL, VIEW, clickMenu, closeMenus, flush, j, menuItems, openView, read, texts, until, withTidy, menuItemsAll } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'timeline: ' + name, fn: withTidy(fn) });

const SHOTS = process.env.TIMELINE_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };

const L = 'The Lighthouse/';
const PROLOGUE = 'Prologue.md', ARRIVAL = 'Part One/Arrival.md', KEEPER = 'Part One/The keeper.md', STORM = 'Part One/Storm warning.md', WRECK = 'Part Two/The wreck.md', LIGHTS = 'Part Two/Lights out.md', EPILOGUE = 'Epilogue.md';
// a prologue the winter before, a week in June (two scenes on one day, twice), an epilogue not yet placed
const DATES = { [PROLOGUE]: '1986-12', [ARRIVAL]: '1987-06-11', [KEEPER]: '1987-06-11', [STORM]: '1987-06-17', [WRECK]: '1987-06-19', [LIGHTS]: '1987-06-19' };
export const T = '.workspace-leaf.mod-active .mod-timeline';
const cardSel = (path) => `${T} .binders-card[data-path="${L}${path}"]`;

/** Sets properties as Obsidian writes them, then waits for its index to have them. */
export async function seed(p, map, key = 'story-date', root = L) {
	await p.ev(`(async () => { for (const [path, v] of Object.entries(${j(map)})) await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(root)} + path), (fm) => { if (v == null) delete fm[${j(key)}]; else fm[${j(key)}] = v; }); })().then(() => 1)`);
	await until(p, `Object.entries(${j(map)}).every(([path, v]) => { const got = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(root)} + path))?.frontmatter?.[${j(key)}]; return v == null ? got === undefined : String(got) === String(v); })`, 6000);
	await flush(p);
}
/** Opens the binder view on a folder as the timeline, in a shape. */
export async function open(p, shape = 'down', folder = 'The Lighthouse', extra = {}) {
	await openView(p, folder);
	// (already on the timeline, the options are given to the mode as the view gives them; either way the page starts at its beginning)
	await p.ev(`(() => { const v = ${VIEW}, options = { ...v.options, timelineShape: ${j(shape)}, ...${j(extra)} }; if (v.mode === 'timeline') v.setOptions(options); else { v.options = options; v.setMode('timeline'); } return 1; })()`);
	await until(p, `!!document.querySelector('${T} .binders-timeline-board') && document.querySelector('${T}').classList.contains(${j(shape === 'across' ? 'mod-across' : 'mod-down')})`);
	await p.ev(`(() => { const b = document.querySelector('${T}'); b.scrollTo(0, 0); ${VIEW}.current.sync(); return 1; })()`);
	await p.sleep(350);
}
/** What the page shows: the years, the dates, the gaps, the cards in the page's order with their numbers, the tray. */
export const look = (p) => p.ev(`(() => {
	const box = document.querySelector('${T}'), text = (sel) => [...box.querySelectorAll(sel)].map(e => e.textContent);
	const card = (c) => c.querySelector('.binders-card-number').textContent + ' ' + c.querySelector('.binders-card-title').textContent;
	return {
		shape: ['mod-across', 'mod-down', 'mod-strip', 'mod-heads'].filter(c => box.classList.contains(c)).join(' '),
		years: text('.binders-timeline-yearname'), dates: text('.binders-timeline > .binders-timeline-date, .binders-timeline-group > .binders-timeline-date'), gaps: text('.binders-timeline-gap-text'),
		line: [...box.querySelectorAll('.binders-timeline .binders-card[data-path]')].map(card),
		tray: [...box.querySelectorAll('.binders-timeline-tray .binders-card[data-path]')].map(card),
		count: box.querySelector('.binders-timeline-tray:not(.is-hidden) .binders-timeline-tray-count')?.textContent ?? null,
	};
})()`);
const selected = (p) => p.ev(`${VIEW}.current.selected().map(f => f.basename)`);
const focusedCard = (p) => p.ev(`document.activeElement?.closest?.('.binders-card')?.querySelector('.binders-card-title')?.textContent ?? null`);
const mtimes = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getFiles()) o[f.path] = (await app.vault.adapter.stat(f.path)).mtime; return o; })()`);
const clickCard = async (p, path, extra = {}) => { const at = await p.at(`${cardSel(path)} .binders-card-footer`); if (!at) throw new Error(`no card for ${path}`); await p.click(at.x, at.y, extra); await p.sleep(120); };
const overlaps = (p) => p.ev(`(() => { const r = [...document.querySelectorAll('${T} .binders-card[data-path]')].map(c => c.getBoundingClientRect()); let n = 0; for (let i = 0; i < r.length; i++) for (let k = i + 1; k < r.length; k++) if (r[i].left < r[k].right - 1 && r[k].left < r[i].right - 1 && r[i].top < r[k].bottom - 1 && r[k].top < r[i].bottom - 1) n++; return n; })()`);

test('opens from the view’s switcher; time runs down by default: the years, the dates, a gap drawn short, cards in story order numbered as the manuscript has them, the undated in the tray', async (p, h, t) => {
	await seed(p, DATES);
	await openView(p);
	const btn = await p.at('.workspace-leaf.mod-active .binders-mode-button');
	await p.click(btn.x, btn.y);
	t.eq(j(await menuItems(p)), j(['Corkboard', 'Outliner', 'Manuscript', 'Timeline']), 'the switcher lists four modes');
	await clickMenu(p, 'Timeline');
	await until(p, `!!document.querySelector('${T} .binders-card[data-path]')`);
	await p.sleep(300);
	t.eq(await p.ev(`${VIEW}.mode`), 'timeline', 'the view is on the timeline');
	t.ok(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-mode-button svg.binders-timeline, .workspace-leaf.mod-active .binders-mode-button svg')`), 'its button has an icon');
	const s = await look(p);
	t.eq(s.shape, 'mod-down mod-strip', 'time runs down, the dates beside the line');
	t.eq(j(s.years), j(['1986', '1987']), 'each year is named');
	t.eq(j(s.dates), j(['December', '11 June', '17 June', '19 June']), 'each date says its day and month, under its year');
	t.eq(j(s.gaps), j(['5 months']), 'the stretch from the winter to June is drawn short, and says how long it was');
	t.eq(j(s.line), j(['1 Prologue', '2 Arrival', '3 The keeper', '4 Storm warning', '5 The wreck', '6 Lights out']), 'the cards in story order, each with its number in the manuscript');
	t.eq(j(s.tray), j(['7 Epilogue']), 'the scene with no date waits in the tray, numbered too');
	t.eq(s.count, '1', 'which says how many it holds');
	t.eq(await overlaps(p), 0, 'no card lies over another');
	// two scenes on one day stand side by side in the day's row
	const row = await p.ev(`(() => { const a = document.querySelector(${j(cardSel(ARRIVAL))}).getBoundingClientRect(), b = document.querySelector(${j(cardSel(KEEPER))}).getBoundingClientRect(); return [Math.round(a.top - b.top), a.right < b.left]; })()`);
	t.eq(j(row), j([0, true]), 'two scenes of one day are side by side');
	t.ok(await p.ev(`app.commands.commands['binders:show-timeline'] != null`), 'and there is a command to show it');
	await shot(p, 'down');
});

test('“Arrange” in the toolbar chooses which way time runs, as does the board’s own menu; the choice is kept with the view', async (p, h, t) => {
	await seed(p, DATES);
	await open(p);
	const A = '.workspace-leaf.mod-active .binders-arrange-button';
	t.eq(await p.ev(`(() => { const b = document.querySelector('${A}'); return [b.classList.contains('is-hidden'), b.getAttribute('aria-label')].join(' | '); })()`), 'false | Arrange: time down', 'the toolbar has Arrange on the timeline, and it says which way');
	let at = await p.at(A);
	await p.click(at.x, at.y);
	t.eq(j(await menuItems(p)), j(['Time down', 'Time across']), 'its menu: the two ways');
	t.eq(await p.ev(`[...document.querySelectorAll('.menu .menu-item')].filter(i => i.querySelector('.menu-item-icon.mod-checked, .mod-checked') || i.classList.contains('is-checked') || i.querySelector('.menu-item-icon:last-child svg.lucide-check')).map(i => i.querySelector('.menu-item-title').textContent).join()`), 'Time down', 'the one in use is ticked');
	await clickMenu(p, 'Time across');
	await until(p, `document.querySelector('${T}')?.classList.contains('mod-across')`);
	await p.sleep(300);
	const s = await look(p);
	t.eq(s.shape, 'mod-across', 'time runs across');
	t.eq(j(s.years), j(['1986', '1987']), 'the years over the cards');
	t.eq(j(s.dates), j(['Dec', '11 Jun', '17 Jun', '19 Jun']), 'the dates on the line, short');
	t.eq(j(s.gaps), j(['5 months']), 'the same gap');
	t.eq(j(s.line), j(['1 Prologue', '2 Arrival', '3 The keeper', '4 Storm warning', '5 The wreck', '6 Lights out']), 'the same cards in the same order');
	t.eq(j(s.tray), j(['7 Epilogue']), 'the tray along the foot');
	t.eq(await overlaps(p), 0, 'no card lies over another');
	const sides = await p.ev(`(() => { const y = document.querySelector('${T} .binders-timeline-line').getBoundingClientRect().top; return [...document.querySelectorAll('${T} .binders-timeline .binders-card[data-path]')].map(c => c.getBoundingClientRect().bottom <= y ? 'above' : c.getBoundingClientRect().top >= y ? 'below' : 'on').join(' '); })()`);
	t.ok(/above/.test(sides) && /below/.test(sides) && !/on/.test(sides), 'cards stand on both sides of the line: ' + sides);
	t.eq(await p.ev(`document.querySelector('${A}').getAttribute('aria-label')`), 'Arrange: time across', 'the toolbar’s button says so');
	t.eq(await p.ev(`${VIEW}.getState().options.timelineShape`), 'across', 'the choice is in the view’s state, so it comes back with the workspace');
	await shot(p, 'across');
	// the same two on the board's ground (More options has Cards only: Arrange is the toolbar's)
	const more = await p.at('.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="More options"]');
	await p.click(more.x, more.y);
	let items = await menuItems(p);
	t.ok(!items.includes('Time down') && !items.includes('Time across') && items.includes('Cards'), 'More options has how the cards show, under Cards, and not the two (the toolbar’s Arrange has them): ' + items.join(', '));
	await closeMenus(p);
	const ground = await p.ev(`(() => { const b = document.querySelector('${T}').getBoundingClientRect(); return { x: Math.round(b.right - 40), y: Math.round(b.top + 60) }; })()`);
	await p.right(ground.x, ground.y);
	items = await menuItems(p);
	t.ok(items.includes('Time down') && items.includes('Time across') && items.includes('New note'), 'the board’s own menu has them, and a new note: ' + items.join(', '));
	await clickMenu(p, 'Time down');
	await until(p, `document.querySelector('${T}')?.classList.contains('mod-down')`);
	t.eq(await p.ev(`${VIEW}.getState().options.timelineShape`), 'down', 'and back');
	// another mode has no such Arrange; the corkboard keeps its own
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(300);
	t.ok(await p.ev(`document.querySelector('${A}').classList.contains('is-hidden')`), 'the outliner has no Arrange');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(300);
	at = await p.at(A);
	await p.click(at.x, at.y);
	t.ok((await menuItems(p)).includes('In a grid'), 'the corkboard’s Arrange is its own');
	await closeMenus(p);
});

test('the view writes nothing: opened in both shapes, scrolled, filtered, selected in, switched from and back, every file is byte for byte and to the millisecond what it was', async (p, h, t) => {
	await seed(p, DATES);
	await seed(p, { [EPILOGUE]: 'sometime in spring' });
	await flush(p);
	await p.sleep(600);
	const before = await texts(p), times = await mtimes(p);
	await open(p, 'down');
	await clickCard(p, STORM);
	await p.key('ArrowDown');
	await p.key('ArrowRight');
	await p.ev(`(() => { const b = document.querySelector('${T}'); b.scrollTop = 400; return 1; })()`);
	await p.sleep(200);
	await p.ev(`(() => { ${VIEW}.setFilter({ match: 'all', conditions: [{ property: 'status', operator: 'is', value: ['Draft'] }] }); return 1; })()`);
	await p.sleep(400);
	await p.ev(`(() => { ${VIEW}.setFilter({ match: 'all', conditions: [] }); return 1; })()`);
	await p.sleep(300);
	await open(p, 'across');
	await p.ev(`(() => { const b = document.querySelector('${T}'); b.scrollLeft = 500; return 1; })()`);
	await clickCard(p, WRECK);
	const head = await p.at(`${T} .binders-timeline-tray-head`);
	await p.click(head.x, head.y);
	await p.sleep(300);
	const again = await p.at(`${T} .binders-timeline-tray-head`);
	await p.click(again.x, again.y);
	await p.sleep(300);
	for (const mode of ['corkboard', 'outliner', 'manuscript', 'timeline']) { await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`); await p.sleep(400); }
	await flush(p);
	await p.sleep(800);
	const after = await texts(p), now = await mtimes(p);
	t.eq(j(Object.keys(after).sort()), j(Object.keys(before).sort()), 'no note was made or taken away');
	for (const path of Object.keys(before)) t.eq(after[path], before[path], `“${path}” is byte for byte what it was`);
	const touched = Object.keys(times).filter((path) => /\.md$/.test(path) && now[path] !== times[path]);
	t.eq(j(touched), j([]), 'no note’s modification time changed');
	// a value that isn't a date is left as typed, and its scene waits with the undated
	t.ok(/story-date: sometime in spring/.test(await read(p, L + EPILOGUE)), 'a story date that isn’t a date is still as it was typed');
	await open(p, 'down');
	t.eq(j((await look(p)).tray), j(['7 Epilogue']), 'and its scene is in the tray');
});

test('selection: a click, Ctrl and Shift, the arrows through story order, Enter and a double-click to open; the inspector’s selection follows', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clickCard(p, ARRIVAL);
	t.eq(j(await selected(p)), j(['Arrival']), 'a click selects');
	t.ok(await p.ev(`document.querySelector(${j(cardSel(ARRIVAL))}).classList.contains('is-selected') && document.querySelector(${j(cardSel(ARRIVAL))}).getAttribute('aria-selected') === 'true'`), 'the card shows it, and says it');
	t.eq(await p.ev(`${VIEW}.current.current()?.basename`), 'Arrival', 'the view’s current item is the card’s note');
	await clickCard(p, WRECK, { modifiers: 2 });
	t.eq(j(await selected(p)), j(['Arrival', 'The wreck']), 'Ctrl adds a card');
	await clickCard(p, ARRIVAL);
	await clickCard(p, LIGHTS, { modifiers: 8 });
	t.eq(j(await selected(p)), j(['Arrival', 'The keeper', 'Storm warning', 'The wreck', 'Lights out']), 'Shift selects through story order');
	await clickCard(p, ARRIVAL);
	await p.key('ArrowRight');
	t.eq(await focusedCard(p), 'The keeper', 'Right: the next in story order');
	await p.key('ArrowDown');
	t.eq(await focusedCard(p), 'Storm warning', 'Down: the row below');
	await p.key('ArrowUp');
	t.eq(await focusedCard(p), 'Arrival', 'Up: the row above, the card over this one');
	await p.key('ArrowLeft');
	t.eq(await focusedCard(p), 'Prologue', 'Left: the one before');
	await p.key('End');
	t.eq(await focusedCard(p), 'Epilogue', 'End: the last, which is in the tray');
	await p.key('Home');
	t.eq(await focusedCard(p), 'Prologue', 'Home: the first');
	await p.key('ArrowRight', 'shift');
	await p.key('ArrowRight', 'shift');
	t.eq(j(await selected(p)), j(['Prologue', 'Arrival', 'The keeper']), 'Shift and the arrows extend the selection');
	await p.key('a', 'ctrl');
	t.eq((await selected(p)).length, 7, 'Ctrl+A selects every scene, the tray’s too');
	await p.key('Escape');
	t.eq((await selected(p)).length, 1, 'Escape goes back to one');
	const ground = await p.ev(`(() => { const b = document.querySelector('${T}').getBoundingClientRect(); return { x: Math.round(b.left + b.width * 0.55), y: Math.round(b.top + 120) }; })()`);
	await p.click(ground.x, ground.y);
	t.eq((await selected(p)).length, 0, 'a click on the ground selects nothing');
	// opening: Enter, and a double-click on the card
	await clickCard(p, STORM);
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(L + STORM)}`);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + STORM, 'Enter opens the note');
});

test('a card’s menu sets and removes its story date; the view draws again each time, and the toolbar’s Undo puts it back', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	const body = await read(p, L + EPILOGUE);
	let at = await p.at(`${cardSel(EPILOGUE)} .binders-card-footer`);
	await p.right(at.x, at.y);
	let items = await menuItemsAll(p);
	t.ok(items.includes('Set story date...') && !items.includes('Remove story date'), 'an undated card’s menu sets a date: ' + items.join(', '));
	t.ok(!items.includes('Move up') && !items.includes('Move down'), 'and has no Move up or Move down: a card’s place here is its date');
	await clickMenu(p, 'Set story date...');
	await until(p, `!!document.querySelector('.modal input[type="text"]')`);
	await p.type('2009');
	await p.key('Enter');
	await until(p, `[...document.querySelectorAll('${T} .binders-timeline-yearname')].some(e => e.textContent === '2009')`, 6000);
	await p.sleep(300);
	let s = await look(p);
	t.eq(j(s.years), j(['1986', '1987', '2009']), 'the year it was given is on the line');
	t.eq(s.dates[s.dates.length - 1], 'In 2009', 'a date that is only a year says so');
	t.eq(j(s.gaps), j(['5 months', '22 years']), 'and the stretch before it is drawn short');
	t.eq(j(s.tray), j([]), 'the tray is empty');
	t.eq(s.count, null, 'and gone');
	await flush(p);
	t.ok(/^story-date: 2009$/m.test(await read(p, L + EPILOGUE)), 'the note has the property');
	// undo, from the toolbar
	const undo = await p.at('.workspace-leaf.mod-active .binders-undo-button');
	await p.click(undo.x, undo.y);
	await until(p, `document.querySelector('${T} .binders-timeline-tray-count')?.textContent === '1'`, 6000);
	await flush(p);
	t.eq(await read(p, L + EPILOGUE), body, 'Undo puts the note back, byte for byte');
	t.eq(j((await look(p)).tray), j(['7 Epilogue']), 'and its card back in the tray');
	// several at once, then removed
	await clickCard(p, STORM);
	await clickCard(p, WRECK, { modifiers: 2 });
	at = await p.at(`${cardSel(WRECK)} .binders-card-footer`);
	await p.right(at.x, at.y);
	await clickMenu(p, 'Set story date...');
	await until(p, `!!document.querySelector('.modal input[type="text"]')`);
	await p.ev(`document.querySelector('.modal input[type="text"]').select()`);
	await p.type('1987-06-12');
	await p.key('Enter');
	await until(p, `[...document.querySelectorAll('${T} .binders-timeline-group > .binders-timeline-date')].some(e => e.textContent === '12 June')`, 6000);
	await p.sleep(300);
	s = await look(p);
	t.eq(j(s.dates), j(['December', '11 June', '12 June', '19 June']), 'both took the date: one row for the two');
	t.eq(j(s.line), j(['1 Prologue', '2 Arrival', '3 The keeper', '4 Storm warning', '5 The wreck', '6 Lights out']), 'in the manuscript’s order within the day');
	t.eq(j(await selected(p)), j(['Storm warning', 'The wreck']), 'they are still selected where they stand now');
	at = await p.at(`${cardSel(WRECK)} .binders-card-footer`);
	await p.right(at.x, at.y);
	await clickMenu(p, 'Remove story date');
	await until(p, `document.querySelector('${T} .binders-timeline-tray-count')?.textContent === '3'`, 6000);
	t.eq(j((await look(p)).tray), j(['4 Storm warning', '5 The wreck', '7 Epilogue']), 'with their dates removed they wait in the tray, in the manuscript’s order');
});

test('within a day: a typed time, then story-order, then the manuscript’s order', async (p, h, t) => {
	await seed(p, { ...DATES, [WRECK]: '1987-06-19T02:10', [STORM]: '1987-06-19', [KEEPER]: '1987-06-19', [ARRIVAL]: '1987-06-19' });
	await seed(p, { [KEEPER]: 1, [LIGHTS]: 2 }, 'story-order');
	await open(p, 'down');
	const s = await look(p);
	t.eq(j(s.dates), j(['December', '19 June']), 'one day');
	t.eq(j(s.line), j(['1 Prologue', '3 The keeper', '6 Lights out', '2 Arrival', '4 Storm warning', '5 The wreck']), 'those given a place in the day, then the rest as the manuscript has them, then the one with a time');
	await open(p, 'across');
	t.eq(j((await look(p)).line), j(s.line), 'the same order across');
});

test('the filter, the empty states and a book with no dates', async (p, h, t) => {
	await open(p, 'down');
	let s = await look(p);
	t.eq(j(s.dates), j([]), 'no scene has a date: no dates on the page');
	t.eq(s.tray.length, 7, 'every scene is in the tray, which is the page');
	t.ok(/No scene has a story date yet/.test(await p.ev(`document.querySelector('${T} .binders-timeline-none-text')?.textContent ?? ''`)), 'and a sentence says what to do');
	t.ok(await p.ev(`document.querySelector('${T} .binders-timeline-tray').classList.contains('mod-page') && !document.querySelector('${T} .binders-timeline-tray-fold')`), 'the tray has nothing to fold into');
	await seed(p, DATES);
	await p.sleep(400);
	s = await look(p);
	t.eq(s.line.length, 6, 'given dates, the scenes are on the line (the view drew again by itself)');
	await p.ev(`(() => { ${VIEW}.setFilter({ match: 'all', conditions: [{ property: 'status', operator: 'is', value: ['Draft'] }] }); return 1; })()`);
	await p.sleep(400);
	s = await look(p);
	t.eq(j(s.line), j(['1 Prologue', '3 The keeper', '5 The wreck']), 'a filter shows the scenes that pass, numbered as in the book');
	t.eq(j(s.dates), j(['December', '11 June', '19 June']), 'and only their dates');
	t.eq(s.count, null, 'the tray is gone with nothing in it');
	await p.ev(`(() => { ${VIEW}.setFilter({ match: 'all', conditions: [{ property: 'status', operator: 'is', value: ['Done'] }] }); return 1; })()`);
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-empty-title')?.textContent`), 'No notes match the filter', 'a filter that hides everything says so');
	await p.ev(`(() => { ${VIEW}.setFilter({ match: 'all', conditions: [] }); return 1; })()`);
	await p.sleep(300);
	// an empty folder
	await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Part Nine'); })().then(() => 1)`);
	await p.sleep(400);
	await open(p, 'down', 'The Lighthouse/Part Nine');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-empty-title')?.textContent`), 'No notes in this folder yet', 'an empty folder says what every mode says');
	// a folder inside the binder: its own scenes only
	await open(p, 'down', 'The Lighthouse/Part Two');
	t.eq(j((await look(p)).line), j(['1 The wreck', '2 Lights out']), 'on a folder, the timeline is that folder’s scenes');
});

test('find: cards whose note has a match stay lit, the rest step back, and the bar’s arrows bring a match’s card into sight', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await p.ev(`(() => { ${VIEW}.showSearch(false); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-find input')`);
	await p.type('light');
	await until(p, `!!document.querySelector('${T} .binders-card.is-find-hit, ${T} .binders-card.is-find-miss')`, 6000);
	await p.sleep(400);
	const marks = await p.ev(`(() => { const c = [...document.querySelectorAll('${T} .binders-card[data-path]')]; return { hit: c.filter(x => x.classList.contains('is-find-hit')).length, miss: c.filter(x => x.classList.contains('is-find-miss')).length, all: c.length, excerpt: c.filter(x => x.querySelector('.binders-find-excerpt')).length }; })()`);
	t.ok(marks.hit > 0 && marks.hit + marks.miss === marks.all, `every card is lit or stepped back: ${j(marks)}`);
	t.eq(marks.excerpt, marks.hit, 'a lit card shows the line its first match is in');
	await p.key('Enter');
	await p.sleep(400);
	t.eq((await selected(p)).length, 1, 'stepping to a match selects its card');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelectorAll('${T} .is-find-hit, ${T} .is-find-miss').length`), 0, 'closing the bar takes the marks away');
});

test('only the cards near what is in sight exist: three hundred scenes draw a few dozen, each saying its place among them all, and the keyboard reaches the far end', async (p, h, t) => {
	const N = 300;
	await p.ev(`(async () => {
		await app.vault.createFolder('Annals');
		const names = [];
		for (let n = 1; n <= ${N}; n++) {
			const name = 'Entry ' + String(n).padStart(3, '0'); names.push(name);
			// (every third day from 1900, three on some days; the last twenty with no date)
			const day = new Date(Date.UTC(1900, 0, 1 + Math.floor(n / 3) * 3)).toISOString().slice(0, 10);
			await app.vault.create('Annals/' + name + '.md', '---\\nsynopsis: Entry ' + n + '.\\n' + (n > ${N - 20} ? '' : 'story-date: ' + day + '\\n') + '---\\nText ' + n + '.\\n');
		}
		await app.vault.create('Annals/Annals.md', '---\\nbinder: 1\\ncontents:\\n' + names.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Annals') ?? app.vault.getRoot())?.length === ${N} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Annals/Entry')).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`, 30000);
	for (const shape of ['down', 'across']) {
		await open(p, shape, 'Annals');
		await p.sleep(300);
		const first = await p.ev(`(() => { const c = [...document.querySelectorAll('${T} .binders-timeline .binders-card[data-path]')]; return { n: c.length, sizes: [...new Set(c.map(x => x.getAttribute('aria-setsize')))].join(), pos: c.map(x => Number(x.getAttribute('aria-posinset'))) }; })()`);
		t.ok(first.n > 0 && first.n < 90, `${shape}: of ${N - 20} dated scenes, ${first.n} cards exist`);
		t.eq(first.sizes, String(N - 20), `${shape}: each says how many there are on the line`);
		t.eq(first.pos[0], 1, `${shape}: and its own place, from 1`);
		t.ok(first.pos.every((x, i) => !i || x > first.pos[i - 1]), `${shape}: in the order they are read`);
		t.eq(await overlaps(p), 0, `${shape}: no card lies over another`);
		// the keyboard goes through the scenes, not the cards that happen to exist
		const at = await p.at(`${T} .binders-timeline .binders-card[data-path] .binders-card-footer`);
		await p.click(at.x, at.y);
		await p.key('End');
		await p.sleep(400);
		t.eq(await focusedCard(p), 'Entry 300', `${shape}: End goes to the last scene, in the tray, which now exists and has the keyboard`);
		await p.key('Home');
		await p.sleep(300);
		t.eq(await focusedCard(p), 'Entry 001', `${shape}: Home comes back to the first`);
		// scrolled far along, other cards exist and the first ones don't
		// (the card with the keyboard stays wherever the page goes: it is let go of first)
		await p.ev(`(() => { document.activeElement?.blur?.(); const b = document.querySelector('${T}'); b.scrollTop = b.scrollHeight; b.scrollLeft = b.scrollWidth; return 1; })()`);
		await p.sleep(400);
		const far = await p.ev(`(() => { const c = [...document.querySelectorAll('${T} .binders-timeline .binders-card[data-path]')]; return { n: c.length, last: Math.max(...c.map(x => Number(x.getAttribute('aria-posinset')))), first: Math.min(...c.map(x => Number(x.getAttribute('aria-posinset')))) }; })()`);
		t.ok(far.n > 0 && far.n < 90 && far.last === N - 20 && far.first > 100, `${shape}: at the far end, the last cards exist and the first don’t: ${j(far)}`);
		// a scene far from what is in sight is brought into sight when the view is asked for it ("Open binder" on a note)
		await p.ev(`(() => { ${VIEW}.current.reveal(app.vault.getAbstractFileByPath('Annals/Entry 140.md')); return 1; })()`);
		await p.sleep(400);
		const shown = await p.ev(`(() => { const c = document.querySelector('${T} .binders-card[data-path="Annals/Entry 140.md"]'); if (!c) return null; const r = c.getBoundingClientRect(), b = document.querySelector('${T}').getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom && r.left >= b.left && r.right <= b.right && c.classList.contains('is-selected'); })()`);
		t.eq(shown, true, `${shape}: a scene asked for is made, selected and whole in the pane`);
	}
	await shot(p, 'many');
});

test('a Longform project has a timeline too: its scenes, flat, read from their own notes', async (p, h, t) => {
	await seed(p, { 'Harbor.md': '1999-05-01', 'Island.md': '1999-05-03' }, 'story-date', 'Longform demo/');
	const index = await read(p, 'Longform demo/Index.md');
	await open(p, 'down', 'Longform demo');
	const s = await look(p);
	t.eq(j(s.dates), j(['1 May', '3 May']), 'its dated scenes are on the line');
	t.ok(s.line.some((c) => / Harbor$/.test(c)) && s.line.some((c) => / Island$/.test(c)), 'by name: ' + s.line.join(', '));
	t.ok(s.tray.length > 0, 'and the rest wait in the tray');
	t.eq(await read(p, 'Longform demo/Index.md'), index, 'the project’s index note is untouched');
});

test('a card’s title and synopsis are edited in place, as on the corkboard, and a new note goes to the tray', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clickCard(p, STORM);
	await p.key('F2');
	await until(p, `!!document.querySelector('${T} .binders-card-title.is-editing, ${T} .binders-card-title input, ${T} .binders-card .is-editing')`);
	await p.ev(`document.activeElement.select?.()`);
	await p.type('Storm coming');
	await p.key('Enter');
	await until(p, `!!app.vault.getAbstractFileByPath('The Lighthouse/Part One/Storm coming.md')`, 6000);
	await p.sleep(400);
	t.ok((await look(p)).line.includes('4 Storm coming'), 'renamed from its card, it stays where its date puts it');
	t.eq(j(await selected(p)), j(['Storm coming']), 'and stays selected under its new name');
	const add = await p.at('.workspace-leaf.mod-active .binders-new-button, .workspace-leaf.mod-active .binders-add-button');
	t.ok(!!add, 'the toolbar has New on the timeline');
	await p.click(add.x, add.y);
	await clickMenu(p, 'New note');
	await until(p, `document.querySelector('${T} .binders-timeline-tray-count')?.textContent === '2'`, 6000);
	await p.key('Escape');
	await p.sleep(300);
	const s = await look(p);
	t.eq(s.tray.length, 2, 'a new note has no date: it is in the tray: ' + s.tray.join(', '));
});

test('a box drawn across empty ground selects the cards it touches, and a double-click on a card opens its note', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	const r = await p.ev(`(() => { const s = document.querySelector(${j(cardSel(STORM))}).getBoundingClientRect(), w = document.querySelector(${j(cardSel(WRECK))}).getBoundingClientRect(); return { x0: Math.round(s.right + 140), y0: Math.round(s.top + 10), x1: Math.round(w.left + 60), y1: Math.round(w.top + 40) }; })()`);
	await p.drag(r.x0, r.y0, r.x1, r.y1);
	await p.sleep(300);
	t.eq(j(await selected(p)), j(['Storm warning', 'The wreck', 'Lights out']), 'the cards the box touched, in story order');
	const at = await p.at(`${cardSel(WRECK)} .binders-card-footer`);
	await p.dbl(at.x, at.y);
	await until(p, `app.workspace.getActiveFile()?.path === ${j(L + WRECK)}`);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + WRECK, 'a double-click opens the note');
});
