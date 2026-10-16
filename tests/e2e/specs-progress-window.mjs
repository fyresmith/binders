// The progress window (src/view/progress.ts): a binder's writing over time, read from its record. It opens from the
// command and the view's menu; shows a record's first days honestly and everything once there is something to say;
// follows what is typed and what another device's file brings; scopes to a folder; says why when there is no record;
// and writes nothing, to a note or to the record. The records are real history files (progress-history.mjs), read by
// the plugin's own reader. On a computer and an emulated phone; the runner's --theme both runs it in both themes.
import { PL, VIEW, clickMenu, closeMenus, file, j, menuItems, openView, reload, until, withTidy } from './view-helpers.mjs';
import { DESK, PHONE, dayOne, lastDays, novel, plant, recordToday, scenesOf } from './progress-history.mjs';

export const specs = [];
const P = `${PL}.progress`;
const L = 'The Lighthouse', HIST = `${L}/Snapshots/History`, KEEPER = `${L}/Part One/The keeper.md`;
const WIN = '.modal.binders-pot';
/** Opening on a three-year, two-device record of a 300-note book: the charts are drawn within this (ms). About 180 ms
    on a quiet machine, 600 on one busy with other Obsidians. */
const OPEN_LIMIT = 1500;

const start = (p) => p.ev(`(async () => {
	const pl = ${PL};
	pl.settings.recordProgress = true; await pl.saveSettings();
	pl.progress.setDevice({ id: ${j(DESK)}, label: 'Writing desk', kind: 'desktop' });
	const a = app.vault.adapter; if (await a.exists(${j(L + '/Snapshots')})) await a.rmdir(${j(L + '/Snapshots')}, true);
	pl.progress.forget();
	return 1;
})()`);
const stop = (p) => p.ev(`(async () => {
	const pl = ${PL};
	document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click());
	pl.settings.recordProgress = true; await pl.saveSettings();
	pl.progress.setDevice(null);
	for (const f of ['Newer', 'Empty book']) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x, true); }
	const a = app.vault.adapter; if (await a.exists(${j(L + '/Snapshots')})) await a.rmdir(${j(L + '/Snapshots')}, true);
	pl.progress.forget();
	return 1;
})()`).catch(() => {});
const test = (name, fn) => specs.push({ name: 'progress window: ' + name, fn: withTidy(async (p, h, t) => { try { await start(p); await fn(p, h, t); } finally { await stop(p); } }) });

// ---- the window, as a person reads it ----
const shut = async (p) => { for (let i = 0; i < 10 && await p.ev(`!!document.querySelector(${j(WIN)})`); i++) { await p.key('Escape'); await p.sleep(120); } };
/** Runs the command with a binder in front, and waits for the window to have something in it. */
async function show(p, folder = L) {
	await shut(p);
	await openView(p, folder);
	await p.ev(`app.commands.executeCommandById('binders:show-progress')`);
	await until(p, `!!document.querySelector('${WIN} .binders-chart-life, ${WIN} .binders-pot-nothing')`, 6000);
	await p.sleep(250);
}
const num = (s) => Number(String(s).replace(/[^\d-]/g, ''));
/** The numbers at the head, by their names. */
const figures = (p) => p.ev(`Object.fromEntries([...document.querySelectorAll('${WIN} .binders-pot-figure')].map(f => [f.querySelector('.binders-pot-figure-label').textContent, f.querySelector('.binders-pot-figure-value').textContent]))`);
/** The parts of the page, by name, in order. */
const sections = (p) => p.ev(`[...document.querySelectorAll('${WIN} section.binders-pot-section')].map(s => s.getAttribute('aria-label'))`);
const said = (p) => p.ev(`document.querySelector('${WIN} .binders-pot-said')?.textContent ?? ''`);
const nothing = (p) => p.ev(`(() => { const m = document.querySelector(${j(WIN)}); return m ? { text: m.querySelector('.binders-pot-nothing')?.textContent ?? null, buttons: [...m.querySelectorAll('.modal-button-container button')].map(b => b.textContent), title: m.querySelector('.modal-title')?.textContent } : null; })()`);
const facts = (p) => p.ev(`Object.fromEntries([...document.querySelectorAll('${WIN} dt.binders-pot-fact-label')].map(dt => [dt.textContent, dt.nextElementSibling.querySelector('.binders-pot-fact-value').textContent]))`);
const bookWords = (p, folder = L) => scenesOf(p, folder).then((s) => s.reduce((a, x) => a + x.words, 0));
/** Every note and every history file: its bytes' length and when it was last written. */
const disk = (p) => p.ev(`(async () => {
	const a = app.vault.adapter, out = {};
	const walk = async (dir) => { const l = await a.list(dir); for (const f of l.files) { if (f.startsWith('.obsidian')) continue; const s = await a.stat(f); out[f] = [s.size, s.mtime]; } for (const d of l.folders) if (!d.startsWith('.obsidian') && !d.startsWith('.trash')) await walk(d); };
	await walk('/');
	return out;
})()`);
const press = async (p, text) => { for (const ch of text) { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code: ch === ' ' ? 'Space' : undefined }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); } await p.sleep(80); };

// ---- a computer ----

test('opens from the command and from the view’s More options, over the binder’s name, and Esc closes it', async (p, h, t) => {
	await plant(p, L, lastDays(await scenesOf(p, L), recordToday(), 3).files);
	await show(p);
	t.eq(await p.ev(`document.querySelector('${WIN} .modal-title')?.textContent`), 'The Lighthouse', 'the window is headed by the binder’s name');
	t.ok(await p.ev(`!!document.querySelector('${WIN}.mod-page .binders-chart-life')`), 'and draws the book’s life');
	await shut(p);
	t.ok(!(await p.ev(`!!document.querySelector(${j(WIN)})`)), 'Esc closes it');
	await p.ev(`(() => { document.querySelector('.workspace-leaf.mod-active .view-action[aria-label="More options"]').click(); return 1; })()`);
	await p.sleep(250);
	t.ok((await menuItems(p)).includes('Show progress'), 'More options has “Show progress”');
	await clickMenu(p, 'Show progress');
	await until(p, `!!document.querySelector('${WIN} .binders-chart-life')`, 6000);
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-chart-life')`), 'and it opens the window');
	await closeMenus(p);
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('a click on the word count opens the window already drawn: its first frame is the page, never an empty dialog that grows into it', async (p, h, t) => {
	await plant(p, L, novel(await scenesOf(p, L), recordToday()).files);
	await shut(p);
	await openView(p);
	// (what the window is on the first frame it is painted: a frame callback runs after the code that opened it, before the
	// paint. The record is read slowly, as on a phone or with a long record: a window opened before it was read was empty)
	await p.ev(`(() => { const pr = ${P}; pr.__read ??= pr.read; pr.read = (f) => new Promise((ok) => setTimeout(ok, 400)).then(() => pr.__read(f)); window.__potFirst = null; const mo = new MutationObserver(() => { const m = document.querySelector(${j(WIN)}); if (!m) return; mo.disconnect(); requestAnimationFrame(() => { window.__potFirst = { page: m.classList.contains('mod-page'), life: !!m.querySelector('.binders-chart-life'), nothing: !!m.querySelector('.binders-pot-nothing') }; }); }); mo.observe(document.body, { childList: true, subtree: true }); return 1; })()`);
	try {
		const at = await p.at('.workspace-leaf.mod-active .binders-word-count');
		await p.click(at.x, at.y);
		await until(p, `!!window.__potFirst`, 6000);
	} finally { await p.ev(`(() => { const pr = ${P}; pr.read = pr.__read; delete pr.__read; return 1; })()`); }
	t.eq(await p.ev(`JSON.stringify(window.__potFirst)`), j({ page: true, life: true, nothing: false }), 'the first frame is the page with the book’s life on it');
	await shut(p);
});

test('three years on two devices: every part of the page, a table behind each chart, the ranges, and the book’s own total', async (p, h, t) => {
	const scenes = await scenesOf(p, L), words = scenes.reduce((a, s) => a + s.words, 0);
	await plant(p, L, novel(scenes, recordToday()).files);
	await show(p);
	t.eq((await sections(p)).join(' | '), 'The book’s life | Every day | When | The parts | Through the statuses | Records and oddities', 'a long record shows every part');
	const f = await figures(p);
	t.eq(Object.keys(f).join(', '), 'Today, Seven days, The book, Thirty days', 'four numbers at the head');
	t.eq(num(f['The book']), words, 'the book’s number is the binder’s words');
	t.ok(/^Recorded since \d+ \w+ \d{4}\.$/.test(await said(p)), `it says since when: “${await said(p)}”`);
	// a table behind every chart, with rows
	const tables = await p.ev(`[...document.querySelectorAll('${WIN} .binders-pot-table table')].map(x => [x.querySelector('caption').textContent, x.querySelectorAll('tbody tr').length])`);
	const charts = await p.ev(`document.querySelectorAll('${WIN} svg.binders-chart[role="img"]').length`);
	t.ok(tables.length >= charts && charts >= 5, `each of the ${charts} charts has a table behind it (${tables.length} tables)`);
	t.ok(tables.every((x) => x[1] > 0), 'and no table is empty: ' + tables.map((x) => `${x[0]} ${x[1]}`).join('; '));
	t.ok(await p.ev(`[...document.querySelectorAll('${WIN} svg.binders-chart[role="img"]')].every(s => !s.hasAttribute('aria-label') && (document.getElementById(s.getAttribute('aria-labelledby'))?.textContent ?? '').length > 10)`), 'every chart is named for a screen reader');
	// what the record says, in the records
	const facts_ = await facts(p);
	for (const name of ['Longest day', 'Best month', 'Longest time away', 'Days written on', 'Time typing', 'Written on a phone or tablet', 'Brought in at once', 'Times the order changed', 'To read it through']) t.ok(name in facts_, `“${name}” is said`);
	t.ok(!('Named most' in facts_) && !('Changed elsewhere' in facts_), 'no names are guessed at, and nothing changed elsewhere in a record that adds up');
	// the ranges
	const ranges = () => p.ev(`[...document.querySelectorAll('${WIN} .binders-pot-range')].map(b => [b.textContent, b.getAttribute('aria-pressed')].join(':'))`);
	t.eq((await ranges()).join(' '), 'All:true Year:false 90 days:false', 'All, Year and 90 days, All chosen');
	const years = () => p.ev(`[...document.querySelectorAll('${WIN} .binders-chart-life text')].map(x => x.textContent).filter(x => /^20\\d\\d$/.test(x))`);
	t.ok((await years()).length >= 3, 'all of it shows its years');
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} .binders-pot-range')].find(b => b.textContent === '90 days').click(); return 1; })()`);
	await p.sleep(200);
	t.eq((await ranges()).join(' '), 'All:false Year:false 90 days:true', '90 days is chosen');
	t.ok((await years()).length <= 1, 'and the chart is the last ninety days, not three years');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('a record’s first days: day one, day three and two weeks each show what there is to show, and say what is to come', async (p, h, t) => {
	const scenes = await scenesOf(p, L), today = recordToday();
	// day one, on a book that was already there
	await plant(p, L, lastDays(scenes, today, 1).files);
	await show(p);
	t.eq((await sections(p)).join(' | '), 'The book’s life | The first two weeks | So far', 'day one: its life, its first two weeks, and what can be said so far');
	// (what the book had before the record: its words less what the planted day typed)
	const typed = Object.values(lastDays(scenes, today, 1).files).flatMap((x) => x.split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((l) => l.t === 'day').reduce((a, l) => a + Object.values(l.n).reduce((b, c) => b + c[0] - c[1], 0), 0);
	const base = scenes.reduce((a, s) => a + s.words, 0) - typed;
	t.ok(base > 50, `the test’s book is older than its record (${base} words before it)`);
	t.eq(await said(p), `The record began today. The book had ${base.toLocaleString('en-US')} words when it began.`, 'it says the record began today, on a book that was there');
	t.eq(Object.keys(await figures(p)).join(', '), 'Today, The book', 'two numbers: today and the book');
	const cells = () => p.ev(`(() => { const c = [...document.querySelectorAll('${WIN} .binders-chart-first rect')]; return { all: c.length, coming: c.filter(x => x.classList.contains('is-coming')).length }; })()`);
	t.eq(j(await cells()), j({ all: 14, coming: 13 }), 'fourteen squares, thirteen still to come');
	t.ok(/^In 13 days this becomes a calendar/.test(await p.ev(`document.querySelector('${WIN} .binders-pot-coming').textContent`)), 'and a sentence says what comes, and when');
	t.ok(!(await p.ev(`!!document.querySelector('${WIN} .binders-chart-calendar, ${WIN} .binders-chart-bars, ${WIN} .binders-chart-status')`)), 'no calendar, hours or statuses with a day to show');
	let f = await facts(p);
	t.ok('Longest day' in f && 'To read it through' in f, 'the day and the text say what they can');
	t.ok(!('It began with' in f) && !('Best month' in f) && !('Longest run' in f), 'and nothing is claimed that a day on an older book can’t say');
	// day three
	await plant(p, L, lastDays(scenes, today, 3).files);
	await show(p);
	t.eq(j(await cells()), j({ all: 14, coming: 11 }), 'day three: eleven to come');
	t.ok(/^The record is 3 days old\./.test(await said(p)), 'it says how old the record is');
	t.eq(Object.keys(await figures(p)).join(', '), 'Today, Seven days, The book', 'three numbers');
	// two weeks and two days
	await plant(p, L, lastDays(scenes, today, 16, { skip: [2, 5, 6, 11, 12] }).files);
	await show(p);
	const parts = await sections(p);
	t.ok(parts.includes('Every day') && !parts.includes('The first two weeks'), 'after two weeks the first days are a calendar: ' + parts.join(' | '));
	t.ok(await p.ev(`document.querySelectorAll('${WIN} .binders-chart-calendar rect').length >= 16`), 'with a square for every day of the record');
	t.ok(await p.ev(`document.querySelector('${WIN} .binders-chart-calendar').getBoundingClientRect().width < 400`), 'and it is those few weeks, not a year of empty squares');
	f = await facts(p);
	t.eq(f['Days written on'], '11', 'eleven of the sixteen days were written on');
	// a book begun in the record says how it began
	await p.ev(`(async () => { await app.vault.createFolder('Empty book'); await app.vault.create('Empty book/Empty book.md', '---\\nbinder: 1\\ncontents:\\n  - Leaving\\n---\\n'); await app.vault.create('Empty book/Leaving.md', ${j('The road went down to the salt flats and stopped. '.repeat(40))}); await new Promise(r => setTimeout(r, 900)); await ${PL}.binders.settled; })().then(() => 1)`);
	const one = (await scenesOf(p, 'Empty book'))[0];
	await plant(p, 'Empty book', dayOne(one, today).files);
	await show(p, 'Empty book');
	t.eq((await said(p)), 'The record began today.', 'a book begun today has no “when it began”');
	t.eq(num((await figures(p))['The book']), one.words, 'its number is its words');
	t.eq((await facts(p))['It began with'], 'Leaving', 'and it began with its first scene');
	await shut(p);
	await openView(p, L);
	await p.ev(`(async () => { const a = app.vault.adapter; if (await a.exists('Empty book/Snapshots')) await a.rmdir('Empty book/Snapshots', true); })().then(() => 1)`);
});

test('today’s typing shows once it is typed, and another device’s file shows when it arrives, with the window open', async (p, h, t) => {
	const today = recordToday(), planted = lastDays(await scenesOf(p, L), today, 3);
	await plant(p, L, planted.files);
	await show(p);
	const before = num((await figures(p)).Today), book = num((await figures(p))['The book']);
	await shut(p);
	// typed in a note, with real keys
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(KEEPER)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `app.workspace.getMostRecentLeaf().view.file?.path === ${j(KEEPER)} && !!document.querySelector('.workspace-leaf.mod-active .cm-content')`);
	await p.sleep(300);
	await p.ev(`(() => { const e = app.workspace.getMostRecentLeaf().view.editor, x = e.getValue(); e.setCursor(e.offsetToPos(x.replace(/\\s+$/, '').length)); e.focus(); return 1; })()`);
	await press(p, ' Quokka brambles harbour lantern.');
	await p.sleep(400);
	await p.ev(`app.commands.executeCommandById('binders:show-progress')`);
	await until(p, `!!document.querySelector('${WIN} .binders-chart-life')`, 6000);
	await until(p, `Number(document.querySelector('${WIN} .binders-pot-figure-value')?.textContent.replace(/\\D/g, '')) === ${before + 4}`, 4000);
	t.eq(num((await figures(p)).Today), before + 4, 'four words typed are four more today');
	await until(p, `[...document.querySelectorAll('${WIN} .binders-pot-figure')].some(f => f.querySelector('.binders-pot-figure-label').textContent === 'The book' && Number(f.querySelector('.binders-pot-figure-value').textContent.replace(/\\D/g, '')) === ${book + 4})`, 5000);
	t.eq(num((await figures(p))['The book']), book + 4, 'and four more in the book, though no total has been stamped since');
	// a phone's file arrives while the window is open
	const phone = [j({ 'binders-history': 1, device: PHONE, label: 'Phone', kind: 'phone', year: +today.slice(0, 4) }), j({ t: 'day', d: today, u: Date.now(), k: 'phone', n: { 'Part One/Arrival': [120, 0, 0, 0] }, h: { 13: 120 }, s: [], m: 9 })].join('\n') + '\n';
	await p.ev(`app.vault.adapter.write(${j(`${HIST}/${today.slice(0, 4)} Phone ${PHONE}.binder-history`)}, ${j(phone)}).then(() => 1)`);
	await until(p, `Number(document.querySelector('${WIN} .binders-pot-figure-value')?.textContent.replace(/\\D/g, '')) === ${before + 124}`, 8000);
	t.eq(num((await figures(p)).Today), before + 124, 'the phone’s 120 words are added to today, without closing the window');
	t.eq((await facts(p))['Written on a phone or tablet'] !== undefined, true, 'and the phone’s share is said');
});

test('scopes to a folder: its own number, its own life, and no statuses', async (p, h, t) => {
	const scenes = await scenesOf(p, L);
	await plant(p, L, novel(scenes, recordToday()).files);
	await show(p);
	const one = scenes.filter((s) => s.rel.startsWith('Part One/')).reduce((a, s) => a + s.words, 0);
	t.eq(await p.ev(`[...document.querySelectorAll('${WIN} select.binders-pot-scope option')].map(o => o.textContent).join(', ')`), 'The whole binder, Part One, Part Two', 'the dropdown has the binder and its folders');
	await p.ev(`(() => { const s = document.querySelector('${WIN} select.binders-pot-scope'); s.value = 'Part One'; s.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(250);
	const f = await figures(p);
	t.eq(num(f['This folder']), one, 'the folder’s number is its words');
	t.ok(!('The book' in f), 'not the book’s');
	const parts = await sections(p);
	t.eq(parts[0], 'This folder’s life', 'the chart is the folder’s life');
	t.ok(!parts.includes('Through the statuses'), 'statuses are the binder’s, and not shown for a folder');
	t.ok(/^Part One, in The Lighthouse\./.test(await said(p)), 'and it says whose it is');
	await p.ev(`(() => { const s = document.querySelector('${WIN} select.binders-pot-scope'); s.value = ''; s.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(250);
	t.ok('The book' in (await figures(p)), 'and back to the whole binder');
});

test('no record: a small dialog that says why (nothing typed yet, recording off, a newer binder), and a Longform project opens', async (p, h, t) => {
	// nothing typed yet
	await show(p);
	let n = await nothing(p);
	t.ok(n?.text?.startsWith('The record of “The Lighthouse” begins with the first words you type in it.'), `nothing typed yet says so: “${n?.text}”`);
	t.eq(n?.title, 'Progress', 'under the title Progress');
	t.eq(n?.buttons.join(','), 'Close', 'one button');
	t.ok(await p.ev(`!document.querySelector('${WIN}').classList.contains('mod-page') && document.querySelector('${WIN}').getBoundingClientRect().width < 700`), 'it is one of Obsidian’s small dialogs, not the page');
	// recording off, with no record
	await p.ev(`(async () => { ${PL}.settings.recordProgress = false; await ${PL}.saveSettings(); })().then(() => 1)`);
	await show(p);
	n = await nothing(p);
	t.ok(/isn’t keeping a record/.test(n?.text ?? ''), `recording off says so: “${n?.text}”`);
	t.eq(n?.buttons.join(','), 'Open settings', 'and offers the settings, once');
	// recording off, with a record from before: it is shown, and says nothing is being added
	await p.ev(`(async () => { ${PL}.settings.recordProgress = true; await ${PL}.saveSettings(); })().then(() => 1)`);
	await plant(p, L, lastDays(await scenesOf(p, L), recordToday(), 16).files);
	await p.ev(`(async () => { ${PL}.settings.recordProgress = false; await ${PL}.saveSettings(); })().then(() => 1)`);
	await show(p);
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-chart-life')`), 'a record kept before recording was turned off is still shown');
	t.ok(/Recording is off, so nothing is being added\.$/.test(await said(p)), `and it says recording is off: “${await said(p)}”`);
	await p.ev(`(async () => { ${PL}.settings.recordProgress = true; await ${PL}.saveSettings(); })().then(() => 1)`);
	// a binder in a newer format
	await p.ev(`(async () => { await app.vault.createFolder('Newer'); await app.vault.create('Newer/Newer.md', '---\\nbinder: 99\\ncontents:\\n  - One\\n---\\n'); await app.vault.create('Newer/One.md', 'One two three.'); await new Promise(r => setTimeout(r, 900)); await ${PL}.binders.settled; })().then(() => 1)`);
	await show(p, 'Newer');
	n = await nothing(p);
	t.ok(/not recorded\.$/.test(n?.text ?? ''), `a binder that can’t be changed says its writing is not recorded: “${n?.text}”`);
	t.eq(n?.buttons.join(','), 'Close', 'with nothing to turn on');
	// a Longform project
	await show(p, 'Longform demo');
	n = await nothing(p);
	t.ok(!!n && (n.text !== null || await p.ev(`!!document.querySelector('${WIN} .binders-chart-life')`)), 'a Longform project opens the window too');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('opening it writes nothing: every note and every history file has the bytes and the time it had', async (p, h, t) => {
	await plant(p, L, novel(await scenesOf(p, L), recordToday()).files);
	await p.sleep(600);
	const before = await disk(p);
	await show(p);
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} .binders-pot-range')].find(b => b.textContent === 'Year').click(); return 1; })()`);
	await p.ev(`(() => { const s = document.querySelector('${WIN} select.binders-pot-scope'); s.value = 'Part Two'; s.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(1500);
	await shut(p);
	await p.ev(`${P}.flush().then(() => 1)`);
	await p.sleep(800);
	const after = await disk(p);
	t.eq(Object.keys(after).sort().join('\n'), Object.keys(before).sort().join('\n'), 'no file made or removed');
	const changed = Object.keys(before).filter((f) => j(before[f]) !== j(after[f]));
	t.eq(changed.join(', '), '', 'no file written');
	t.ok(Object.keys(before).some((f) => f.endsWith('.binder-history')) && Object.keys(before).some((f) => f.endsWith('.md')), 'the notes and the record were looked at');
});

test('by the keyboard: Tab reaches the ranges and the folders, Enter chooses, and the choice keeps the focus', async (p, h, t) => {
	await plant(p, L, novel(await scenesOf(p, L), recordToday()).files);
	await show(p);
	const focused = () => p.ev(`(() => { const e = document.activeElement; return e ? (e.dataset.bindersKey ?? e.className ?? e.tagName) : ''; })()`);
	const seen = [];
	for (let i = 0; i < 12; i++) { await p.key('Tab'); const f = await focused(); seen.push(f); if (f === 'range-year') break; }
	t.ok(seen.includes('scope'), 'Tab reaches the dropdown of folders: ' + seen.join(' > '));
	t.eq(seen[seen.length - 1], 'range-year', 'and the ranges');
	await p.key('Enter');
	await p.sleep(250);
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="range-year"]').getAttribute('aria-pressed')`), 'true', 'Enter chooses the year');
	t.eq(await focused(), 'range-year', 'and the focus stays on it after the page is drawn again');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-pot-body').getAttribute('tabindex')`), '0', 'the page itself can be focused, to scroll by keys');
	await p.key('Escape');
	await p.sleep(200);
	t.ok(!(await p.ev(`!!document.querySelector(${j(WIN)})`)), 'Esc closes the window');
});

test('the charts are in the theme’s own colors, and nothing is wider than the page', async (p, h, t) => {
	await plant(p, L, novel(await scenesOf(p, L), recordToday()).files);
	await show(p);
	const look = await p.ev(`(() => {
		const w = document.querySelector(${j(WIN)}), body = w.querySelector('.binders-pot-body'), cs = (e) => getComputedStyle(e);
		const probe = body.createDiv(); probe.style.color = 'var(--text-normal)'; const ink = cs(probe).color; probe.remove();
		return { line: cs(w.querySelector('.binders-chart-line')).stroke, ink, value: cs(w.querySelector('.binders-pot-figure-value')).color, wide: body.scrollWidth - body.clientWidth, over: [...w.querySelectorAll('svg.binders-chart')].filter(s => s.getBoundingClientRect().right > body.getBoundingClientRect().right + 1).length, width: w.getBoundingClientRect().width };
	})()`);
	t.eq(look.line, look.ink, 'the book’s line is the theme’s text color');
	t.eq(look.value, look.ink, 'and so are the numbers');
	t.ok(look.wide <= 1 && look.over === 0, `nothing is wider than the page (${look.wide}px over, ${look.over} charts)`);
	t.ok(look.width > 900, 'the page is wide on a computer');
});

test(`three years, two devices, a 300-note book: the charts are drawn within ${OPEN_LIMIT} ms of asking`, async (p, h, t) => {
	const scenes = Array.from({ length: 300 }, (_, i) => ({ rel: `Part ${1 + Math.floor(i / 20)}/Scene ${i + 1}`, words: 900 + ((i * 379) % 2600) }));
	const files = novel(scenes, recordToday()).files, size = Object.values(files).reduce((a, x) => a + x.length, 0);
	await plant(p, L, files);
	await openView(p, L);
	// (read once, as a session that has had the binder open has: then the window is the reading again, the merge and the drawing)
	const ms = [];
	for (let i = 0; i < 3; i++) {
		await shut(p);
		ms.push(await p.ev(`(async () => { const t0 = performance.now(); app.commands.executeCommandById('binders:show-progress'); for (let i = 0; i < 400 && !document.querySelector('${WIN} .binders-chart-status'); i++) await new Promise(r => setTimeout(r, 5)); return Math.round(performance.now() - t0); })()`));
		await p.sleep(300);
	}
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-chart-status')`), 'the whole page is drawn');
	t.ok(Math.min(...ms) < OPEN_LIMIT, `drawn in ${ms.join(', ')} ms (${Math.round(size / 1024)} KB of record; the limit is ${OPEN_LIMIT})`);
	console.log(`    (progress window: ${ms.join(', ')} ms to draw ${Math.round(size / 1024)} KB of record)`);
});

// ---- a phone ----

async function onPhone(p, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await start(p); await fn(); } finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
}

test('a phone: the same page in one column, the calendar in half years, nothing wider than the screen, from More options', async (p, h, t) => {
	await onPhone(p, async () => {
		await plant(p, L, novel(await scenesOf(p, L), recordToday()).files);
		await openView(p, L);
		const more = await p.at('.workspace-leaf.mod-active .view-header .view-actions .view-action:last-child, .view-header .clickable-icon[aria-label="More options"]');
		t.ok(!!more, 'the view has More options');
		await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: more.x, y: more.y }] });
		await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await p.sleep(500);
		t.ok((await menuItems(p)).includes('Show progress'), 'which has “Show progress”');
		await clickMenu(p, 'Show progress');
		await until(p, `!!document.querySelector('${WIN} .binders-chart-life')`, 8000);
		await p.sleep(400);
		t.eq((await sections(p)).join(' | '), 'The book’s life | Every day | When | The parts | Through the statuses | Records and oddities', 'every part of the page is there');
		const look = await p.ev(`(() => {
			const w = document.querySelector(${j(WIN)}), body = w.querySelector('.binders-pot-body'), b = body.getBoundingClientRect();
			const figs = [...w.querySelectorAll('.binders-pot-figure')].map(f => Math.round(f.getBoundingClientRect().left));
			const cal = w.querySelector('.binders-chart-calendar'), cell = cal.querySelector('rect.binders-chart-cell').getBoundingClientRect();
			return { wide: body.scrollWidth - body.clientWidth, who: [...body.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > b.right + 1 && !e.closest('table')).slice(0, 6).map(e => e.tagName + '.' + String(e.className.baseVal ?? e.className).split(' ').pop()).join(' '), over: [...w.querySelectorAll('svg.binders-chart')].filter(s => s.getBoundingClientRect().right > b.right + 1).length, columns: new Set(figs).size, cell: Math.round(cell.width), blocks: cal.querySelectorAll('text.is-muted').length, window: Math.round(w.getBoundingClientRect().width), range: Math.round(w.querySelector('.binders-pot-range').getBoundingClientRect().height) };
		})()`);
		t.ok(look.wide <= 1 && look.over === 0, `nothing is wider than the screen (${look.wide}px, ${look.over} charts: ${look.who})`);
		t.eq(look.columns, 2, 'the numbers at the head are two to a row');
		t.ok(look.cell >= 8, `a day’s square is big enough to see (${look.cell}px)`);
		t.ok(look.window <= 390, 'the window fits the phone');
		// the first days on a phone
		await shut(p);
		await plant(p, L, lastDays(await scenesOf(p, L), recordToday(), 3).files);
		await openView(p, L);
		await p.ev(`app.commands.executeCommandById('binders:show-progress')`);
		await until(p, `!!document.querySelector('${WIN} .binders-chart-first')`, 8000);
		const first = await p.ev(`(() => { const w = document.querySelector(${j(WIN)}), body = w.querySelector('.binders-pot-body').getBoundingClientRect(), s = w.querySelector('.binders-chart-first').getBoundingClientRect(); return { fits: s.right <= body.right + 1, cells: w.querySelectorAll('.binders-chart-first rect').length, wide: w.querySelector('.binders-pot-body').scrollWidth - w.querySelector('.binders-pot-body').clientWidth }; })()`);
		t.ok(first.fits && first.cells === 14 && first.wide <= 1, 'the first two weeks fit the phone, all fourteen');
		await shut(p);
		t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
	});
});
