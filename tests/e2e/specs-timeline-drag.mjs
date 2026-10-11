// Dragging on the timeline (src/view/timeline.ts): a card carried to a date takes it, at the exactness that date has; a
// stretch between two dates unfolds, while a card is over it, into a place to drop for each date in it; before the first
// date and after the last a dialog asks; the tray takes the date away and gives one; several cards all take the date; a
// day's cards can be put in another order. Real mouse drags. Each test sets its own story dates in the throwaway vault.
import { mkdirSync } from 'fs';
import { B, VIEW, clickMenu, flush, j, menuItems, read, reload, texts, until, withTidy } from './view-helpers.mjs';
import { T, look, open, seed } from './specs-timeline.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'timeline drag: ' + name, fn: withTidy(fn) });

const SHOTS = process.env.TIMELINE_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };

export const L = 'The Lighthouse/';
export const PROLOGUE = 'Prologue.md', ARRIVAL = 'Part One/Arrival.md', KEEPER = 'Part One/The keeper.md', STORM = 'Part One/Storm warning.md', WRECK = 'Part Two/The wreck.md', LIGHTS = 'Part Two/Lights out.md', EPILOGUE = 'Epilogue.md';
// a prologue the winter before; the 11th (two scenes), the 17th, the 19th (two scenes); an epilogue not yet placed
export const DATES = { [PROLOGUE]: '1986-12', [ARRIVAL]: '1987-06-11', [KEEPER]: '1987-06-11', [STORM]: '1987-06-17', [WRECK]: '1987-06-19', [LIGHTS]: '1987-06-19' };
export const cardSel = (path) => `${T} .binders-card[data-path="${L}${path}"]`;
const ALL = [PROLOGUE, ARRIVAL, KEEPER, STORM, WRECK, LIGHTS, EPILOGUE];

export const mouse = (p, type, x, y, extra = {}) => p.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
/** Takes a card by its foot and moves it a little, so the drag has begun; returns where the pointer is. */
export async function lift(p, path, modifiers = 0, sel = cardSel) {
	const at = await p.at(`${sel(path)} .binders-card-footer`);
	if (!at) throw new Error('no card for ' + path);
	await p.move(at.x, at.y, 2);
	await mouse(p, 'mousePressed', at.x, at.y, { modifiers });
	await p.move(at.x + 12, at.y + 12, 3, { buttons: 1 });
	return { x: at.x + 12, y: at.y + 12 };
}
/** Carries the pointer on to (x, y) and waits a moment (a stretch unfolds after the pointer rests on its boundary). */
export async function carry(p, x, y, wait = 0) { await p.move(x, y, 10, { buttons: 1 }); if (wait) await p.sleep(wait); return { x, y }; }
export const letGo = async (p, at, wait = 450) => { await mouse(p, 'mouseReleased', at.x, at.y); await p.sleep(wait); };
/** The tag by the card in hand. */
export const tag = (p) => p.ev(`(() => { const t = document.querySelector('.binders-drag-ghost .binders-timeline-tag'); return t && !t.classList.contains('is-hidden') ? t.textContent : null; })()`);
/** A note's `story-date` and `story-order`, as written in the file. */
export async function props(p, path) {
	const text = await read(p, L + path);
	const get = (k) => { const m = new RegExp(`^${k}: (.*)$`, 'm').exec(text); return m ? m[1] : null; };
	return { date: get('story-date'), order: get('story-order') };
}
export const placed = async (p, paths = ALL) => { const o = {}; for (const f of paths) o[f.replace(/^.*\//, '').replace('.md', '')] = j(await props(p, f)); return o; };

test('a card dropped on another date’s cards takes that date, and nothing else of it changes', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	const before = await texts(p);
	const pos = await lift(p, ARRIVAL);
	const to = await p.at(cardSel(STORM));
	const at = await carry(p, to.x + 30, to.y + 30, 100);
	t.eq(await tag(p), '17 June 1987, 1 of 2', 'while it is over the 17th, the tag says the date it would get, and its place in the day');
	await shot(p, 'down-over-a-date');
	await letGo(p, at);
	await flush(p);
	t.eq(j(await props(p, ARRIVAL)), j({ date: '1987-06-17', order: null }), 'it has the date of the card it was dropped on, and no place in the day: that is the manuscript’s order');
	t.eq(j(await props(p, STORM)), j({ date: '1987-06-17', order: null }), 'the card it was dropped by is not written to');
	const after = await texts(p);
	for (const f of Object.keys(before)) if (f !== L + ARRIVAL) t.eq(after[f], before[f], `“${f}” is as it was`);
	t.eq(after[L + ARRIVAL].replace(/story-date: .*\n/, 'story-date: 1987-06-11\n'), before[L + ARRIVAL], 'and its own text and properties are as they were');
});

test('a gap of days unfolds under a card carried to the boundary between two dates; a drop on a day in it writes that day', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	const pos = await lift(p, KEEPER);
	// the foot of the 11th's row: the boundary with the 17th
	const g = await p.at(`${T} .binders-timeline-group[data-date="1987-06-11"]`);
	const at = await carry(p, g.x + 100, g.t + g.h - 3, 500);
	t.eq(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.dataset.date).join()`), '1987-06-12,1987-06-13,1987-06-14,1987-06-15,1987-06-16', 'the days that are missing are there to drop on');
	await shot(p, 'down-unfolded-days');
	const chip = await p.at(`${T} .binders-timeline-target[data-date="1987-06-14"]`);
	await carry(p, chip.x, chip.y, 100);
	t.eq(await tag(p), '14 June 1987', 'over one, the tag says its date');
	await letGo(p, chip);
	await flush(p);
	t.eq(j(await props(p, KEEPER)), j({ date: '1987-06-14', order: null }), 'the card has that day');
	t.eq(await p.ev(`document.querySelectorAll('${T} .binders-timeline-unfold').length`), 0, 'the stretch is shut again');
});

/** Waits until a note's cached `story-date` is this (or `story-order`, with the key), then lets the view draw. */
export async function settledAs(p, path, value, key = 'story-date') {
	await until(p, `String(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + path)}))?.frontmatter?.[${j(key)}] ?? null) === ${j(String(value))}`, 6000);
	await flush(p);
	await p.sleep(250);
}
export const undoBtn = '.workspace-leaf.mod-active .binders-undo-button', redoBtn = '.workspace-leaf.mod-active .binders-redo-button';
export const press = async (p, sel) => { const at = await p.at(sel); await p.click(at.x, at.y); await p.sleep(500); await flush(p); };
export const clearHistory = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
export const steps = (p) => p.ev(`${B}.undos.length`);

test('a gap of months unfolds into its months, and a drop on one writes the month alone', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await lift(p, ARRIVAL);
	const gap = await p.at(`${T} .binders-timeline-gap`);
	await carry(p, gap.x + 60, gap.y, 500);
	t.eq(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.dataset.date).join()`), '1987-01,1987-02,1987-03,1987-04,1987-05', 'the months of the gap');
	t.eq(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.textContent).join()`), 'Jan 1987,Feb 1987,Mar 1987,Apr 1987,May 1987', 'each says its month');
	await shot(p, 'down-unfolded-months');
	const chip = await p.at(`${T} .binders-timeline-target[data-date="1987-03"]`);
	const at = await carry(p, chip.x, chip.y, 100);
	t.eq(await tag(p), 'March 1987', 'the tag says the month');
	await letGo(p, at);
	await flush(p);
	t.eq(j(await props(p, ARRIVAL)), j({ date: '1987-03', order: null }), 'the card has the month, not a day');
	t.eq(j((await look(p)).dates.slice(0, 3)), j(['December', 'March', '11 June']), 'and stands at it, before the days of June');
});

test('a gap of years unfolds into its years: a drop on 1971 writes 1971', async (p, h, t) => {
	await seed(p, { ...DATES, [PROLOGUE]: '1952' });
	await open(p, 'down');
	await lift(p, ARRIVAL);
	const gap = await p.at(`${T} .binders-timeline-gap`);
	await carry(p, gap.x + 60, gap.y, 500);
	const years = await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.dataset.date)`);
	t.eq(years.length, 34, 'every year between: ' + years[0] + ' to ' + years[years.length - 1]);
	t.eq(years[0] + '/' + years[years.length - 1], '1953/1986', 'from the year after the earlier date to the year before the later');
	await shot(p, 'down-unfolded-years');
	const chip = await p.at(`${T} .binders-timeline-target[data-date="1971"]`);
	const at = await carry(p, chip.x, chip.y, 100);
	t.eq(await tag(p), '1971', 'the tag says the year');
	await letGo(p, at);
	await flush(p);
	t.eq(await read(p, L + ARRIVAL).then((x) => /^story-date: 1971$/m.test(x)), true, 'the note has `story-date: 1971`');
	t.eq(j((await look(p)).dates.slice(0, 3)), j(['In 1952', 'In 1971', '11 June']), 'and the card stands in that year');
});

test('a gap of centuries unfolds into round years only: every hundredth, never more than sixty', async (p, h, t) => {
	await seed(p, { ...DATES, [PROLOGUE]: '0500' });
	await open(p, 'down');
	await lift(p, ARRIVAL);
	const gap = await p.at(`${T} .binders-timeline-gap`);
	await carry(p, gap.x + 60, gap.y, 500);
	const years = await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.dataset.date)`);
	t.ok(years.length > 0 && years.length <= 60, 'a short list: ' + years.length);
	t.ok(years.every((y) => Number(y) % 100 === 0), 'of round years: ' + years.slice(0, 4).join(', ') + '...');
	await letGo(p, { x: gap.x + 60, y: gap.y });
});

test('before the first date and after the last a dialog asks, with the nearest date in it; cancelling writes nothing', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	const before = await texts(p);
	await lift(p, STORM);
	const first = await p.at(`${T} .binders-timeline-group[data-date="1986-12"]`);
	let at = await carry(p, first.x, first.t - 10, 150);
	t.eq(await tag(p), 'Before December 1986...', 'above the first date the tag says so');
	await letGo(p, at, 300);
	await until(p, `!!document.querySelector('.modal input[type="text"]')`);
	t.eq(await p.ev(`document.querySelector('.modal input[type="text"]').value`), '1986-12', 'the dialog is filled in with the nearest date');
	await p.key('Escape');
	await p.sleep(300);
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'cancelled: nothing is written');
	// (the end of the page, where there is room below the last date)
	await p.ev(`(() => { const b = document.querySelector('${T}'); b.scrollTop = b.scrollHeight; ${VIEW}.current.sync(); return 1; })()`);
	await p.sleep(300);
	await lift(p, STORM);
	const last = await p.at(`${T} .binders-timeline-group[data-date="1987-06-19"]`);
	at = await carry(p, last.x, last.t + last.h + 25, 150);
	t.eq(await tag(p), 'After 19 June 1987...', 'below the last date, after it');
	await letGo(p, at, 300);
	await until(p, `!!document.querySelector('.modal input[type="text"]')`);
	t.eq(await p.ev(`document.querySelector('.modal input[type="text"]').value`), '1987-06-19', 'with that date in it');
	await p.ev(`document.querySelector('.modal input[type="text"]').select()`);
	await p.type('1990');
	await p.key('Enter');
	await settledAs(p, STORM, '1990');
	t.eq(j(await props(p, STORM)), j({ date: '1990', order: null }), 'what is typed is the date');
});

test('from the tray onto the line sets a date; onto the tray takes it away, with the place it had in its day; the tray shows for it even when empty', async (p, h, t) => {
	await seed(p, { ...DATES, [STORM]: '1987-06-19' });
	await seed(p, { [WRECK]: 3 }, 'story-order');
	await open(p, 'down');
	await clearHistory(p);
	// out of the tray onto the 11th
	await lift(p, EPILOGUE);
	const d11 = await p.at(cardSel(ARRIVAL));
	let at = await carry(p, d11.x + 20, d11.y + 20, 100);
	t.eq(await tag(p), '11 June 1987, 3 of 3', 'the tag says the date, and where in the day it will stand');
	await letGo(p, at);
	await flush(p);
	t.eq(j(await props(p, EPILOGUE)), j({ date: '1987-06-11', order: null }), 'the card has the date');
	t.eq(await p.ev(`document.querySelectorAll('${T} .binders-timeline-tray .binders-card').length`), 0, 'the tray is empty');
	// into the tray (which is hidden when it is empty, and shows while a card is carried)
	t.ok(await p.ev(`document.querySelector('${T} .binders-timeline-tray').classList.contains('is-hidden')`), 'with nothing in it the tray is not there');
	await lift(p, WRECK);
	t.ok(!(await p.ev(`document.querySelector('${T} .binders-timeline-tray').classList.contains('is-hidden')`)), 'but it is there while a card is carried');
	const tray = await p.at(`${T} .binders-timeline-tray`);
	at = await carry(p, tray.x, tray.y, 100);
	t.eq(await tag(p), 'No story date', 'over it, the tag says what happens');
	await shot(p, 'down-over-the-tray');
	await letGo(p, at);
	await flush(p);
	t.eq(j(await props(p, WRECK)), j({ date: null, order: null }), 'the card has no date and no place in a day: neither property is left behind');
	t.eq(j((await look(p)).tray), j(['5 The wreck']), 'and is in the tray');
});

test('several cards carried together all take the date; one Undo takes them back', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clearHistory(p);
	const before = await texts(p);
	const a = await p.at(`${cardSel(ARRIVAL)} .binders-card-footer`);
	await p.click(a.x, a.y);
	const s = await p.at(`${cardSel(STORM)} .binders-card-footer`);
	await p.click(s.x, s.y, { modifiers: 2 });
	await lift(p, STORM);
	const to = await p.at(cardSel(LIGHTS));
	const at = await carry(p, to.x + 20, to.y + 20, 100);
	t.ok(/^19 June 1987/.test(await tag(p)), 'the tag says the date: ' + await tag(p));
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost .binders-drag-count')?.textContent`), '2', 'and the card in hand says how many there are');
	await letGo(p, at);
	await flush(p);
	t.eq(j(await placed(p, [ARRIVAL, STORM, WRECK])), j({ 'Arrival': j({ date: '1987-06-19', order: null }), 'Storm warning': j({ date: '1987-06-19', order: null }), 'The wreck': j({ date: '1987-06-19', order: null }) }), 'both have the date');
	t.eq(await steps(p), 1, 'one step in the history');
	await press(p, undoBtn);
	t.eq(j(await texts(p)), j(before), 'one Undo puts every note back, byte for byte');
	await press(p, redoBtn);
	t.eq(j(await props(p, ARRIVAL)), j({ date: '1987-06-19', order: null }), 'and Redo makes it again');
});

test('within a day a card can be put in another place: the day is numbered 1, 2, 3 in the order left, as one step', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clearHistory(p);
	const before = await texts(p);
	await lift(p, LIGHTS);
	const w = await p.at(cardSel(WRECK));
	const at = await carry(p, w.l + 20, w.y, 100);
	t.eq(await tag(p), '19 June 1987, 1 of 2', 'the tag says the place it would take');
	t.ok(await p.ev(`document.querySelector('.binders-drop-indicator.is-active.is-vertical') != null`), 'and a line shows between which cards');
	await shot(p, 'down-reordering-a-day');
	await letGo(p, at);
	await settledAs(p, LIGHTS, 1, 'story-order');
	t.eq(j(await placed(p, [WRECK, LIGHTS, STORM])), j({ 'The wreck': j({ date: '1987-06-19', order: '2' }), 'Lights out': j({ date: '1987-06-19', order: '1' }), 'Storm warning': j({ date: '1987-06-17', order: null }) }), 'the day is numbered in the order left, and no other day is touched');
	t.eq(j((await look(p)).line.slice(-2)), j(['6 Lights out', '5 The wreck']), 'the cards stand so; their numbers are still the manuscript’s');
	t.eq(await steps(p), 1, 'one step');
	await press(p, undoBtn);
	t.eq(j(await texts(p)), j(before), 'one Undo puts both notes back, byte for byte (no order is left)');
});

test('a card with a typed time stands by it: the tag says so before the drop, and nothing is written', async (p, h, t) => {
	await seed(p, { ...DATES, [LIGHTS]: '1987-06-19T21:30' });
	await open(p, 'down');
	const before = await texts(p);
	await lift(p, WRECK);
	const l = await p.at(cardSel(LIGHTS));
	const at = await carry(p, l.l + l.w - 20, l.y, 100);
	t.eq(await tag(p), '19 June 1987, 1 of 2 (its time keeps it there)', 'put after the timed card, an untimed card still comes first, and the tag says why');
	await letGo(p, at, 300);
	// the timed card, carried before the untimed one: its time keeps it where it is
	await lift(p, LIGHTS);
	const w = await p.at(cardSel(WRECK));
	const at2 = await carry(p, w.l + 20, w.y, 100);
	t.eq(await tag(p), '19 June 1987, 2 of 2 (its time keeps it there)', 'the tag says why');
	await letGo(p, at2, 300);
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'nothing is written: a typed time is never rewritten');
});

test('Escape, a drop outside the pane and a drop on nothing write nothing', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clearHistory(p);
	const stamps = async () => { const o = {}; for (const f of ALL) o[f] = await p.ev(`app.vault.adapter.stat(${j(L + f)}).then(s => s.mtime)`); return o; };
	const before = await stamps();
	await lift(p, ARRIVAL);
	const to = await p.at(cardSel(STORM));
	await carry(p, to.x + 30, to.y + 30, 100);
	t.eq(await tag(p), '17 June 1987, 1 of 2', 'carried over a date');
	await p.key('Escape');
	await p.sleep(250);
	await mouse(p, 'mouseReleased', to.x, to.y);
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 0, 'Escape puts the card down');
	t.eq(j(await stamps()), j(before), 'and no note was written');
	// outside the pane: the toolbar
	await lift(p, ARRIVAL);
	const bar = await p.at('.workspace-leaf.mod-active .binders-toolbar');
	const out = await carry(p, bar.x, bar.y, 100);
	t.eq(await tag(p), null, 'over the toolbar the tag says nothing');
	await letGo(p, out);
	t.eq(j(await stamps()), j(before), 'let go there, nothing is written');
	// onto a boundary that has not unfolded (let go at once)
	await lift(p, KEEPER);
	const g = await p.at(`${T} .binders-timeline-group[data-date="1987-06-11"]`);
	const edge = await carry(p, g.x + 100, g.t + g.h - 3, 0);
	await letGo(p, edge, 300);
	t.eq(j(await stamps()), j(before), 'let go on a boundary before it has unfolded, nothing is written');
	t.eq(await steps(p), 0, 'and there is nothing to undo');
});

test('Alt and an arrow: Left and Right take a card to the date before or after, through the days of a gap; Up and Down put it in another place in its day; each is one step', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clearHistory(p);
	const a = await p.at(`${cardSel(ARRIVAL)} .binders-card-footer`);
	await p.click(a.x, a.y);
	await p.key('ArrowRight', 'alt');
	await settledAs(p, ARRIVAL, '1987-06-12');
	t.eq((await props(p, ARRIVAL)).date, '1987-06-12', 'Alt+Right: to the first day of the gap after it');
	await p.key('ArrowRight', 'alt');
	await settledAs(p, ARRIVAL, '1987-06-13');
	await p.key('ArrowLeft', 'alt');
	await settledAs(p, ARRIVAL, '1987-06-12');
	await p.key('ArrowLeft', 'alt');
	await settledAs(p, ARRIVAL, '1987-06-11');
	t.eq(await steps(p), 4, 'each is a step of its own');
	// to a date that has scenes: it joins them
	for (const d of ['12', '13', '14', '15', '16', '17']) { await p.key('ArrowRight', 'alt'); await settledAs(p, ARRIVAL, '1987-06-' + d); }
	t.eq(j((await look(p)).line.slice(2, 4)), j(['2 Arrival', '4 Storm warning']), 'the 17th was reached through the days between, and the card stands with the scene that is there, by the manuscript’s order');
	// within a day
	await clearHistory(p);
	const w = await p.at(`${cardSel(WRECK)} .binders-card-footer`);
	await p.click(w.x, w.y);
	await p.key('ArrowDown', 'alt');
	await settledAs(p, WRECK, 2, 'story-order');
	t.eq(j(await placed(p, [WRECK, LIGHTS])), j({ 'The wreck': j({ date: '1987-06-19', order: '2' }), 'Lights out': j({ date: '1987-06-19', order: '1' }) }), 'Alt+Down: one place later in its day');
	t.eq(await steps(p), 1, 'one step');
});

test('time across: a card dropped on a date’s cards takes it; the stretch between two marks unfolds around the line; before the first mark a dialog asks', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'across');
	await lift(p, ARRIVAL);
	const to = await p.at(cardSel(STORM));
	let at = await carry(p, to.x + 30, to.y, 100);
	t.ok((await tag(p)) != null && /^17 June 1987/.test(await tag(p)), 'over a card, the tag says its date: ' + await tag(p));
	await letGo(p, at);
	await flush(p);
	t.eq(j(await props(p, ARRIVAL)), j({ date: '1987-06-17', order: null }), 'it has that date');
	// the stretch between the 11th (now one card) and the 17th
	await lift(p, KEEPER);
	const marks = await p.ev(`(() => { const box = document.querySelector('${T}'), out = {}; for (const e of box.querySelectorAll('.binders-timeline > .binders-timeline-date')) out[e.textContent] = e.getBoundingClientRect().left - 12; return { out, y: box.querySelector('.binders-timeline-line').getBoundingClientRect().top + 1 }; })()`);
	// (the 11th has one card now, its mark is where the card begins; the 17th's is a half card on)
	const mid = (marks.out['11 Jun'] + marks.out['17 Jun']) / 2;
	at = await carry(p, mid, marks.y, 600);
	const chips = await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.dataset.date).join()`);
	t.eq(chips, '1987-06-12,1987-06-13,1987-06-14,1987-06-15,1987-06-16', 'the days between unfold: ' + chips);
	t.eq(await p.ev(`document.querySelectorAll('${T} .binders-timeline-unfold').length`), 1, 'in one place');
	await shot(p, 'across-unfolded-days');
	const chip = await p.at(`${T} .binders-timeline-target[data-date="1987-06-15"]`);
	at = await carry(p, chip.x, chip.y, 120);
	t.eq(await tag(p), '15 June 1987', 'over one, the tag says its date');
	await letGo(p, at);
	await flush(p);
	t.eq(j(await props(p, KEEPER)), j({ date: '1987-06-15', order: null }), 'a drop on it writes that day');
	t.eq(await p.ev(`document.querySelectorAll('${T} .binders-timeline-unfold').length`), 0, 'and the line is shut again');
	// before the first mark
	await lift(p, STORM);
	const line = await p.at(`${T} .binders-timeline-line`);
	at = await carry(p, line.l - 6, line.y + 40, 150);
	t.ok(/^Before /.test((await tag(p)) ?? ''), 'before the first date: ' + await tag(p));
	await p.key('Escape');
	await letGo(p, at, 200);
});

test('time across: a stretch drawn short unfolds into its months, after its break', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'across');
	await lift(p, STORM);
	const gap = await p.at(`${T} .binders-timeline-gap`);
	const y = await p.ev(`document.querySelector('${T} .binders-timeline-line').getBoundingClientRect().top + 1`);
	await carry(p, gap.x, y, 600);
	t.eq(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.dataset.date).join()`), '1987-01,1987-02,1987-03,1987-04,1987-05', 'the months of the break');
	const box = await p.ev(`(() => { const u = document.querySelector('${T} .binders-timeline-unfold').getBoundingClientRect(), g = document.querySelector('${T} .binders-timeline-gap').getBoundingClientRect(); return { after: u.left >= g.right - 1 }; })()`);
	t.ok(box.after, 'the room is after the break');
	const chip = await p.at(`${T} .binders-timeline-target[data-date="1987-02"]`);
	const at = await carry(p, chip.x, chip.y, 120);
	await letGo(p, at);
	await flush(p);
	t.eq(j(await props(p, STORM)), j({ date: '1987-02', order: null }), 'a drop on February writes the month');
});

// ---- by touch: a phone and a tablet ----

export const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
export async function onDevice(p, width, height, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
}
/** A finger held on a card until it lifts, then moved to (x, y) in steps; returns where it is. */
export async function fingerCarry(p, path, x, y, { hold = 650, wait = 0 } = {}) {
	const at = await p.at(`${cardSel(path)} .binders-card-footer`);
	if (!at) throw new Error('no card for ' + path);
	await touch(p, 'touchStart', at.x, at.y);
	await p.sleep(hold);
	const steps = 12;
	for (let i = 1; i <= steps; i++) { await touch(p, 'touchMove', at.x + (x - at.x) * i / steps, at.y + (y - at.y) * i / steps); await p.sleep(16); }
	if (wait) await p.sleep(wait);
	return { x, y };
}
/** Scrolls the page so a card's top is `top` pixels from the top of the screen. */
export const bring = async (p, path, top) => { await p.ev(`(() => { const box = document.querySelector('${T}'); ${VIEW}.current.show(${j(L + path)}); const c = document.querySelector(${j(cardSel(path))}); box.scrollTop += c.getBoundingClientRect().top - ${top}; return 1; })()`); await p.sleep(400); };
export const fingerUp = async (p) => { await touch(p, 'touchEnd'); await p.sleep(500); await flush(p); };

test('a phone: press and hold lifts a card; carried to another date’s cards it takes the date, with the tag above the finger; a swipe writes nothing', async (p, h, t) => {
	await seed(p, DATES);
	await onDevice(p, 390, 844, async () => {
		await open(p, 'down');
		await clearHistory(p);
		const stamp = () => p.ev(`app.vault.adapter.stat(${j(L + ARRIVAL)}).then(s => s.mtime)`);
		const was = await stamp();
		// a swipe on a card scrolls the page and drags nothing
		const at = await p.at(`${cardSel(ARRIVAL)} .binders-card-footer`);
		await touch(p, 'touchStart', at.x, at.y);
		for (let i = 1; i <= 8; i++) { await touch(p, 'touchMove', at.x, at.y - i * 12); await p.sleep(16); }
		await touch(p, 'touchEnd');
		await p.sleep(400);
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 0, 'a swipe drags nothing');
		t.eq(await stamp(), was, 'and writes nothing');
		// held, then carried up to the 11th
		await bring(p, ARRIVAL, 200);
		const dest = await p.at(cardSel(ARRIVAL));
		await fingerCarry(p, STORM, dest.x, dest.y);
		await p.sleep(150);
		t.ok(/^11 June 1987/.test((await tag(p)) ?? ''), 'the tag says the date: ' + await tag(p));
		const geo = await p.ev(`(() => { const g = document.querySelector('.binders-drag-ghost'), tg = g.querySelector('.binders-timeline-tag').getBoundingClientRect(), c = g.querySelector('.binders-card').getBoundingClientRect(); return tg.bottom <= c.top + 1; })()`);
		t.ok(geo, 'the tag is above the card, which a finger would cover');
		await shot(p, 'phone-carrying');
		await fingerUp(p);
		t.eq(j(await props(p, STORM)), j({ date: '1987-06-11', order: null }), 'a held drag writes the date once');
		t.eq(await steps(p), 1, 'as one step');
	});
});

test('a phone: a held card carried to the foot’s tray row loses its date; carried to the boundary between two dates it unfolds into the days between', async (p, h, t) => {
	await seed(p, DATES);
	await onDevice(p, 390, 844, async () => {
		await open(p, 'down');
		await bring(p, STORM, 300);
		const row = await p.at(`${T} .binders-timeline-tray-head`);
		await fingerCarry(p, STORM, row.x, row.y, { wait: 200 });
		t.eq(await tag(p), 'No story date', 'over the tray’s row the tag says what happens');
		await fingerUp(p);
		t.eq(j(await props(p, STORM)), j({ date: null, order: null }), 'dropped on it, the card has no date');
		// the boundary between the 11th and the 19th (Storm is gone from the 17th)
		await bring(p, KEEPER, 180);
		const g = await p.at(`${T} .binders-timeline-group[data-date="1987-06-11"]`);
		await fingerCarry(p, WRECK, g.x, g.t + g.h - 3, { wait: 800 });
		const chips = await p.ev(`document.querySelectorAll('${T} .binders-timeline-target').length`);
		t.eq(chips, 7, 'the days between 11 and 19 June: seven');
		await shot(p, 'phone-unfolded-days');
		const chip = await p.at(`${T} .binders-timeline-target[data-date="1987-06-14"]`);
		await touch(p, 'touchMove', chip.x, chip.y);
		await p.sleep(200);
		await fingerUp(p);
		t.eq(j(await props(p, WRECK)), j({ date: '1987-06-14', order: null }), 'and a drop on one gives that day');
	});
});

test('a tablet has both shapes: a held drag works in each', async (p, h, t) => {
	await seed(p, DATES);
	await onDevice(p, 820, 1180, async () => {
		await open(p, 'across');
		const dest = await p.at(cardSel(ARRIVAL));
		await fingerCarry(p, STORM, dest.x, dest.y);
		await p.sleep(150);
		t.ok(/^11 June 1987/.test((await tag(p)) ?? ''), 'time across: the tag says the date: ' + await tag(p));
		await fingerUp(p);
		t.eq((await props(p, STORM)).date, '1987-06-11', 'and the drop writes it');
		await open(p, 'down');
		const d2 = await p.at(cardSel(ARRIVAL));
		await fingerCarry(p, WRECK, d2.x, d2.y);
		await p.sleep(150);
		t.ok(/^11 June 1987/.test((await tag(p)) ?? ''), 'time down: ' + await tag(p));
		await fingerUp(p);
		t.eq((await props(p, WRECK)).date, '1987-06-11', 'and the drop writes it');
	});
});

test('a card carried out of the view is a file: Obsidian takes the drag over, the timeline shows no place to drop, and Escape leaves nothing behind', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	const state = () => p.ev(`(() => { const d = app.dragManager.draggable; return { file: d ? d.type + ':' + (d.file?.path ?? '') : null, tag: !!document.querySelector('.binders-timeline-tag:not(.is-hidden)'), mark: !!document.querySelector('.binders-drop-indicator.is-active'), lit: document.querySelectorAll('${T} .is-drop-target').length }; })()`);
	await lift(p, ARRIVAL);
	const ex = await p.at('.workspace-leaf-content[data-type="file-explorer"] .nav-files-container');
	await carry(p, ex.x, ex.y, 300);
	const s = await state();
	t.eq(s.file, 'file:' + L + ARRIVAL, 'outside the view the drag is Obsidian’s, of that note');
	t.ok(!s.tag && !s.mark && s.lit === 0, 'and the timeline offers nowhere to drop it: ' + j(s));
	await p.key('Escape');
	await p.sleep(250);
	await mouse(p, 'mouseReleased', ex.x, ex.y);
	await p.sleep(300);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator.is-active, .binders-card.is-dragging, .drag-ghost')].length + (app.dragManager.draggable ? 1 : 0)`)), '0', 'nothing of the drag is left');
	t.eq((await props(p, ARRIVAL)).date, '1987-06-11', 'and the card has the date it had');
});
