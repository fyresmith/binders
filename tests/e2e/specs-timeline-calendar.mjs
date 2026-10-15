// A book's own calendar and its eras (src/time/calendar.ts, src/view/calendar-modal.ts): kept in the binder note, read
// everywhere a story date is; a date typed in the book's words is written on the book's one count with its month as a
// number; eras are headings on the timeline that stay in sight; the Calendar dialog writes the binder note only, or
// with the dates of months that moved when the writer asks; a calendar that can't be read is said, and no date is
// written in it. Each test gives The Lighthouse the calendar of "The Lamplighter" and dates in it.
import { B, NOTE, VIEW, clickMenu, flush, j, menuItemsAll, read, texts, until, withTidy } from './view-helpers.mjs';
import { T, look, open, seed } from './specs-timeline.mjs';
import { L, PROLOGUE, ARRIVAL, KEEPER, STORM, WRECK, LIGHTS, EPILOGUE, carry, letGo, lift, tag } from './specs-timeline-drag.mjs';

export const specs = [];
const test = (name, fn, o = {}) => specs.push({ name: 'timeline calendar: ' + name, fn: withTidy(fn), ...o });

const MONTHS = ['Thaw', 'Seedfall', 'Bloom', 'Greening', 'Highsun', 'Longday', 'Midsummer', 'Ember', 'Harvest', 'Fading', 'Frost', 'Deepnight', 'Stillwater'];
export const CALENDAR = { months: MONTHS.map((m) => ({ [m]: m === 'Midsummer' ? 1 : 30 })), leap: [{ month: 'Midsummer', days: 1, every: 4 }] };
export const ERAS = [{ name: 'Before the Drowning', abbr: 'BD', counts: 'down' }, { name: 'The Age of Lamps', abbr: 'AL', from: 1 }, { name: 'The Long Quiet', abbr: 'LQ', from: 803 }];
// 40 BD; two scenes on 14 Frost 802; Midsummer 802; the last day of 802; the first of the Long Quiet; the epilogue undated
const DATES = { [PROLOGUE]: '-0039', [ARRIVAL]: '0802-11-14', [KEEPER]: '0802-11-14', [STORM]: '0802-07', [WRECK]: '0802-13-30', [LIGHTS]: '0803-01-01' };
const cardSel = (path) => `${T} .binders-card[data-path="${L}${path}"]`;

/** Gives the binder note a calendar and eras, as Obsidian writes properties. */
export async function useCalendar(p, calendar = CALENDAR, eras = ERAS) {
	await p.ev(`(async () => { await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(NOTE)}), (fm) => { if (${j(calendar)} == null) delete fm.calendar; else fm.calendar = ${j(calendar)}; if (${j(eras)} == null) delete fm.eras; else fm.eras = ${j(eras)}; }); })().then(() => 1)`);
	await until(p, `JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(NOTE)}))?.frontmatter?.calendar ?? null) === ${j(j(calendar ?? null))}`, 6000);
	await flush(p);
}
const dateOf = async (p, path) => /^story-date: (.*)$/m.exec(await read(p, L + path))?.[1] ?? null;
const resetHistory = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
const undo = async (p) => { const u = await p.at('.workspace-leaf.mod-active .binders-undo-button'); await p.click(u.x, u.y); await p.sleep(400); await flush(p); };
const openCalendar = async (p) => {
	await p.ev(`(() => { app.commands.executeCommandById('binders:edit-calendar'); return 1; })()`);
	await until(p, `!!document.querySelector('.binders-calendar-modal')`);
};
const save = async (p) => { const b = await p.at('.binders-calendar-modal .mod-cta'); await p.click(b.x, b.y); await until(p, `!document.querySelector('.binders-calendar-modal')`, 6000); await flush(p); };
/** Types into the dialog's field, as a writer does. */
const setField = (p, sel, i, value) => p.ev(`(() => { const x = document.querySelectorAll(${j(sel)})[${i}]; x.value = ${j(value)}; x.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
const askDate = async (p, path) => {
	const at = await p.at(`${cardSel(path)} .binders-card-footer`);
	await p.right(at.x, at.y);
	await clickMenu(p, 'Set story date...');
	await until(p, `!!document.querySelector('.modal input[type="text"]')`);
};

test('a date typed in the book’s words is written on its one count, its month by number; Undo puts the note back byte for byte', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	await resetHistory(p);
	// a dated card's dialog says its date in the book's words, and the book's example
	await askDate(p, ARRIVAL);
	t.eq(await p.ev(`document.querySelector('.modal input[type="text"]').value`), '14 Frost 802 AL', 'the field has the date as the book says it, not as written');
	t.eq(await p.ev(`document.querySelector('.modal input[type="text"]').placeholder`), '14 Bloom 12 LQ, Bloom 12 LQ or 12 LQ', 'and the example is in the book’s calendar');
	await p.key('Escape');
	const body = await read(p, L + EPILOGUE);
	await askDate(p, EPILOGUE);
	await p.type('14 Frost 12 LQ');
	await p.key('Enter');
	await until(p, `!document.querySelector('.modal input[type="text"]')`, 6000);
	await flush(p);
	t.eq(await dateOf(p, EPILOGUE), '0814-11-14', 'written on the one count, Frost as its number, 11');
	t.eq((await read(p, L + EPILOGUE)).replace(/story-date: .*\n/, ''), body, 'and nothing else in the note changed');
	t.ok((await look(p)).years.includes('12'), 'its year is on the line, under its era');
	await undo(p);
	t.eq(await read(p, L + EPILOGUE), body, 'Undo puts the note back, byte for byte');
}, { tier: 'guard' });

test('a date the calendar hasn’t got is refused, saying why, and nothing is written', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	const before = await texts(p);
	await askDate(p, ARRIVAL);
	await p.ev(`document.querySelector('.modal input[type="text"]').select()`);
	await p.type('31 Frost 802');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.modal input[type="text"]')`), 'the dialog stays open');
	t.ok(/Frost has 30 days\./.test(await p.ev(`document.querySelector('.modal').textContent`)), 'and says why: Frost has 30 days');
	await p.ev(`document.querySelector('.modal input[type="text"]').select()`);
	await p.type('900 AL');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(/The Age of Lamps has 802 years/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'a year past an era’s end says how long the era is');
	await p.key('Escape');
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'no file changed');
}, { tier: 'guard' });

test('eras are headings over their years, and years say the era’s year; the dates read in the book’s calendar; switching shapes writes nothing', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	const before = await texts(p);
	await open(p, 'down');
	const down = await look(p);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-erahead .binders-timeline-eraname')].map(e => e.textContent)`)), j(['Before the Drowning', 'The Age of Lamps', 'The Long Quiet']), 'one heading for each era a date is in, in order');
	t.eq(j(down.years), j(['40', '802', '1']), 'a year under its era says the era’s year');
	t.eq(j(down.dates), j(['In 40 BD', 'Midsummer', '14 Frost', '30 Stillwater', '1 Thaw']), 'the dates in the book’s months, a festival by its name');
	t.eq(j(down.line), j(['1 Prologue', '4 Storm warning', '2 Arrival', '3 The keeper', '5 The wreck', '6 Lights out']), 'in story order, by the book’s calendar');
	t.eq(j(down.tray), j(['7 Epilogue']), 'the undated in the tray');
	t.eq(j(down.gaps), j(['841 years']), 'the long stretch from 40 BD to Midsummer 802 AL is said in the book’s years');
	t.eq(await p.ev(`[...document.querySelectorAll('${T} .binders-card[data-path]')].find(c => c.dataset.path.endsWith('Arrival.md'))?.getAttribute('aria-label')`), 'Arrival, 14 Frost 802 AL, scene 2', 'a card is said aloud with its date in the book’s words');
	// the era stays at the top while its dates scroll
	await p.ev(`(() => { const b = document.querySelector('${T}'), h = [...b.querySelectorAll('.binders-timeline-erahead')][1]; b.scrollTop = h.offsetTop + 260; ${VIEW}.current.sync(); return 1; })()`);
	await p.sleep(200);
	t.ok(await p.ev(`(() => { const b = document.querySelector('${T}').getBoundingClientRect(), h = [...document.querySelectorAll('${T} .binders-timeline-erahead')][1].getBoundingClientRect(); return Math.abs(h.top - b.top) < 2; })()`), 'scrolled into it, the era’s heading is at the top of the pane');
	await open(p, 'across');
	const across = await look(p);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-eraspan .binders-timeline-eraname')].map(e => e.textContent)`)), j(['Before the Drowning', 'The Age of Lamps', 'The Long Quiet']), 'time across: the eras in a strip over the years');
	t.eq(j(across.line.slice().sort()), j(down.line.slice().sort()), 'the same scenes');
	await open(p, 'down');
	t.eq(j((await look(p)).line), j(down.line), 'and back, as it was');
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'looking, scrolling and switching shapes wrote nothing');
});

test('a drag over a gap unfolds into the book’s months; the drop writes that month; Undo takes it back', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	await resetHistory(p);
	const body = await read(p, L + EPILOGUE);
	await lift(p, EPILOGUE);
	// the foot of Midsummer's row: the boundary with 14 Frost
	const g = await p.at(`${T} .binders-timeline-group[data-date="0802-07"]`);
	await carry(p, g.x + 100, g.t + g.h - 3, 600);
	t.eq(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.dataset.date).join()`), '0802-08,0802-09,0802-10', 'it unfolds into the book’s months between them');
	t.eq(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-target')].map(e => e.textContent).join()`), 'Ember 802 AL,Harvest 802 AL,Fading 802 AL', 'each says its month, in the book’s words');
	const chip = await p.at(`${T} .binders-timeline-target[data-date="0802-09"]`);
	const at = await carry(p, chip.x, chip.y, 120);
	t.eq(await tag(p), 'Harvest 802 AL', 'the tag says the month');
	await letGo(p, at);
	await flush(p);
	t.eq(await dateOf(p, EPILOGUE), '0802-09', 'the card has the month, by its number');
	await undo(p);
	t.eq(await read(p, L + EPILOGUE), body, 'Undo puts the note back, byte for byte');
}, { tier: 'guard' });

test('the Calendar dialog writes the binder note’s calendar and nothing else; Undo puts it back; the timeline reads the new names', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	await resetHistory(p);
	const before = await texts(p);
	await openCalendar(p);
	t.ok(/6 notes have story dates/.test(await p.ev(`document.querySelector('.binders-calendar-about').textContent`)), 'it says how many notes have dates');
	await setField(p, '.binders-calendar-month input.binders-calendar-name', 10, 'Rime');
	await save(p);
	const after = await texts(p);
	for (const f of Object.keys(before)) if (f !== NOTE) t.eq(after[f], before[f], `“${f}” is as it was`);
	t.ok(/- Rime: 30/.test(after[NOTE]) && !/- Frost: 30/.test(after[NOTE]), 'the binder note’s month is renamed');
	t.eq(after[NOTE].replace(/\ncalendar:[\s\S]*?\n(?=[a-z])/, '\n'), before[NOTE].replace(/\ncalendar:[\s\S]*?\n(?=[a-z])/, '\n'), 'and nothing else in it changed');
	await until(p, `[...document.querySelectorAll('${T} .binders-timeline-date')].some(e => e.textContent === '14 Rime')`, 6000);
	t.ok(true, 'the timeline says “14 Rime” for the same written date');
	await undo(p);
	t.eq(await read(p, NOTE), before[NOTE], 'Undo puts the binder note back, byte for byte');
}, { tier: 'guard' });

test('a month moved in the dialog: its dates are rewritten only when asked, as one step with the calendar', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	await resetHistory(p);
	const before = await texts(p);
	await openCalendar(p);
	// Midsummer (7) one place down, by the keys on its name
	await p.ev(`document.querySelectorAll('.binders-calendar-month input.binders-calendar-name')[6].focus()`);
	await p.key('ArrowDown', 'alt');
	await p.sleep(200);
	t.eq(await p.ev(`[...document.querySelectorAll('.binders-calendar-month input.binders-calendar-name')].slice(6, 8).map(e => e.value).join()`), 'Ember,Midsummer', 'Alt+Down moves the month down');
	t.ok(await p.ev(`document.activeElement?.value === 'Midsummer'`), 'and the cursor stays in its name');
	t.ok(/would read differently/.test(await p.ev(`document.querySelector('.binders-calendar-about').textContent`)), 'the dialog says a date would read differently');
	const tick = await p.ev(`(() => { const x = document.querySelector('.binders-calendar-follow input'); return x ? x.checked : null; })()`);
	t.eq(tick, false, '“Move their dates with their months” is offered, and not ticked');
	await p.ev(`(() => { const x = document.querySelector('.binders-calendar-follow input'); x.click(); return 1; })()`);
	await p.sleep(100);
	await save(p);
	const after = await texts(p);
	t.eq(await dateOf(p, STORM), '0802-08', 'the scene in Midsummer is written with Midsummer’s new number');
	for (const f of [PROLOGUE, ARRIVAL, KEEPER, WRECK, LIGHTS, EPILOGUE]) t.eq(after[L + f], before[L + f], `“${f}” is as it was`);
	t.ok(/leap:\n\s+- month: Midsummer/.test(after[NOTE]), 'the leap day stays with Midsummer');
	await until(p, `[...document.querySelectorAll('${T} .binders-timeline-date')].some(e => e.textContent === 'Midsummer')`, 6000);
	await undo(p);
	const back = await texts(p);
	t.eq(back[NOTE], before[NOTE], 'one Undo puts the binder note back');
	t.eq(back[L + STORM], before[L + STORM], 'and the scene, byte for byte');
}, { tier: 'guard' });

test('a month moved in the dialog without asking rewrites no scene; its handle’s menu moves it by touch', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	const before = await texts(p);
	await openCalendar(p);
	const grip = await p.at('.binders-calendar-month .binders-calendar-grip', 6);
	await p.click(grip.x, grip.y);
	await p.sleep(200);
	t.ok((await menuItemsAll(p)).includes('Move down'), 'the handle opens a menu that moves the month');
	await clickMenu(p, 'Move down');
	await p.sleep(200);
	t.eq(await p.ev(`document.querySelectorAll('.binders-calendar-month input.binders-calendar-name')[7].value`), 'Midsummer', 'it moved');
	await save(p);
	const after = await texts(p);
	for (const f of Object.keys(before)) if (f !== NOTE) t.eq(after[f], before[f], `“${f}” is as it was`);
}, { tier: 'guard' });

test('a calendar changed outside Binders is read at once; no scene is written', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	const before = await texts(p);
	const renamed = { ...CALENDAR, months: CALENDAR.months.map((m) => (Object.keys(m)[0] === 'Stillwater' ? { 'Still Water': 30 } : m)) };
	await useCalendar(p, renamed, [...ERAS.slice(0, 2), { name: 'The Dark', abbr: 'TD', from: 803 }]);
	await until(p, `[...document.querySelectorAll('${T} .binders-timeline-date')].some(e => e.textContent === '30 Still Water')`, 6000);
	t.ok(await p.ev(`[...document.querySelectorAll('${T} .binders-timeline-eraname')].some(e => e.textContent === 'The Dark')`), 'a renamed era is its heading');
	const after = await texts(p);
	for (const f of Object.keys(before)) if (f !== NOTE) t.eq(after[f], before[f], `“${f}” is as it was`);
	// the calendar taken away: dates the ordinary calendar hasn't got wait in the tray, as written
	await useCalendar(p, null, null);
	await until(p, `document.querySelector('${T} .binders-timeline-tray-count')?.textContent === '2'`, 6000);
	t.eq(j((await look(p)).tray), j(['5 The wreck', '7 Epilogue']), 'with no calendar, the thirteenth month isn’t a date: its scene waits in the tray');
	t.eq(await dateOf(p, WRECK), '0802-13-30', 'and its date is as written');
}, { tier: 'guard' });

test('a calendar that can’t be read is said over the timeline, and no story date is written in it', async (p, h, t) => {
	await useCalendar(p, { months: 'twelve' }, ERAS);
	await seed(p, DATES);
	await open(p, 'down');
	t.ok(/can’t be read/.test(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-timeline-problem')?.textContent ?? ''`)), 'the timeline says the calendar can’t be read');
	const before = await texts(p);
	await askDate(p, EPILOGUE);
	await p.type('1987');
	await p.key('Enter');
	await p.sleep(500);
	await flush(p);
	t.ok(await p.ev(`[...document.querySelectorAll('.notice')].some(n => /can’t be read/.test(n.textContent))`), 'setting a date is refused, saying why');
	t.eq(j(await texts(p)), j(before), 'and no file changed');
	await useCalendar(p);
	await until(p, `!document.querySelector('.workspace-leaf.mod-active .binders-timeline-problem')`, 6000);
	t.ok(true, 'once it is put right, the line goes');
}, { tier: 'guard' });

test('a filter on the story date compares in the book’s calendar', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	await p.ev(`(async () => { const l = app.workspace.getMostRecentLeaf(); const s = l.getViewState(); await l.setViewState({ ...s, state: { ...s.state, filter: { conditions: [{ property: 'story-date', operator: 'before', value: '0803' }] } } }); })().then(() => 1)`);
	await until(p, `document.querySelectorAll('${T} .binders-timeline .binders-card[data-path]').length === 5`, 6000).catch(() => {});
	await p.sleep(300);
	t.eq(j((await look(p)).line), j(['1 Prologue', '4 Storm warning', '2 Arrival', '3 The keeper', '5 The wreck']), 'the scenes before 1 LQ, the thirteenth month among them');
});

test('the undated scenes are reached by the keys, in a book with its own calendar', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	const at = await p.at(`${cardSel(PROLOGUE)} .binders-card-footer`);
	await p.click(at.x, at.y);
	await p.key('End');
	await p.sleep(200);
	t.eq(await p.ev(`document.activeElement?.closest?.('.binders-card')?.querySelector('.binders-card-title')?.textContent ?? null`), 'Epilogue', 'End goes to the last scene, the undated one in the tray');
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(L + EPILOGUE)}`, 6000);
	t.ok(true, 'and Enter opens it');
});

test('“Shift story dates...” moves by the book’s days, over the end of its thirteenth month, as one step', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	await resetHistory(p);
	const before = await texts(p);
	// (the two are far down the page: brought into sight first)
	await p.ev(`(() => { ${VIEW}.current.show(${j(L + LIGHTS)}); return 1; })()`);
	await p.sleep(300);
	const w = await p.at(`${cardSel(WRECK)} .binders-card-footer`);
	await p.click(w.x, w.y);
	const l = await p.at(`${cardSel(LIGHTS)} .binders-card-footer`);
	await p.click(l.x, l.y, { modifiers: 2 });
	t.eq(j(await p.ev(`${VIEW}.current.selected().map(f => f.basename)`)), j(['The wreck', 'Lights out']), 'both are selected');
	await p.right(w.x, w.y);
	await clickMenu(p, 'Shift story dates...');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.ev(`(() => { const m = document.querySelector('.modal'), sel = m.querySelectorAll('select:not(.is-measuring)'); sel[1].value = 'd'; sel[1].dispatchEvent(new Event('change')); const i = m.querySelector('input'); i.value = '1'; i.dispatchEvent(new Event('input')); return 1; })()`);
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Shift').click()`);
	await until(p, `!document.querySelector('.modal input')`, 6000);
	await flush(p);
	// (the step writes the two notes one after the other: wait for the second)
	await until(p, `app.vault.adapter.read(${j(L + LIGHTS)}).then(t => /story-date: 0803-01-02/.test(t))`, 6000).catch(() => {});
	t.eq(await dateOf(p, WRECK), '0803-01-01', '30 Stillwater 802 is followed by 1 Thaw 803');
	t.eq(await dateOf(p, LIGHTS), '0803-01-02', 'and 1 Thaw by 2 Thaw');
	await undo(p);
	t.eq(j(await texts(p)), j(before), 'one Undo puts both back, byte for byte');
}, { tier: 'guard' });

test('the outliner shows story dates in the book’s calendar, in a column wide enough for them', async (p, h, t) => {
	await useCalendar(p);
	await seed(p, DATES);
	await open(p, 'down');
	await p.ev(`(() => { const v = ${VIEW}; v.options = { ...v.options, outliner: { columns: [{ id: 'storydate' }] } }; v.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-outliner-row [data-col="storydate"]')`, 6000);
	await p.sleep(300);
	const cell = (path) => p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-outliner-row[data-path="${L}${path}"] [data-col="storydate"]')?.textContent ?? null`);
	t.eq(await cell(WRECK), '30 Stillwater 802 AL', 'a date in the book’s words');
	t.eq(await cell(PROLOGUE), '40 BD', 'a year in an era counting down');
	t.ok(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-row [data-col="storydate"] .binders-outliner-field')].every(e => e.scrollWidth <= e.clientWidth + 1)`), 'no date is cut');
});
