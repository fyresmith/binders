// Deadlines in the progress window (src/view/progress.ts, src/progress/plan.ts) and on the toolbar's word count
// (src/view/BinderView.ts): set, change and clear a deadline from the window (the note gains, changes and loses
// exactly its properties; one step of Undo each); the plan section and the sentence on pace, behind, ahead, passed
// and reached, over histories written here in the record's own format; today a day the plan doesn't write on; a
// folder's own deadline; a Longform project and a newer binder; a deadline typed into the note's properties; the
// count's tick, its tooltip and its click, at three widths. On a computer and an emulated phone; the runner's
// --theme both runs it in both themes. Shots: BINDERS_DEADLINE_SHOTS=dir keeps a picture of each state.
import { mkdirSync } from 'fs';
import { PL, B, NOTE, VIEW, file, j, openView, reload, until, withTidy } from './view-helpers.mjs';
import { DESK, recordToday, scenesOf } from './progress-history.mjs';

export const specs = [];
const L = 'The Lighthouse', HIST = `${L}/Snapshots/History`, PART = `${L}/Part One/Part One.md`;
const WIN = '.modal.binders-pot', LEAF = '.workspace-leaf.mod-active';
const SHOTS = process.env.BINDERS_DEADLINE_SHOTS || '';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const plus = (day, n) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n)).toISOString().slice(0, 10);
const weekdayOf = (day) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))).getUTCDay();
/** "21 October", with its year when it is not this one's, as the window says a date. */
const say = (day, today = recordToday()) => `${+day.slice(8)} ${MONTHS[+day.slice(5, 7) - 1]}${day.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + day.slice(0, 4)}`;
const fmt = (n) => Math.round(n).toLocaleString('en-US');

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
	const x = app.vault.getAbstractFileByPath('Newer'); if (x) await app.vault.delete(x, true);
	const a = app.vault.adapter; if (await a.exists(${j(L + '/Snapshots')})) await a.rmdir(${j(L + '/Snapshots')}, true);
	pl.progress.forget();
	return 1;
})()`).catch(() => {});
/** The test's checks, with lists and objects compared by what they say. */
const sane = (t) => Object.assign(Object.create(t), { eq: (a, b, m) => t.eq(typeof a === 'object' && a !== null ? j(a) : a, typeof b === 'object' && b !== null ? j(b) : b, m) });
const test = (name, fn) => specs.push({ name: 'progress deadline: ' + name, fn: withTidy(async (p, h, t) => { try { await start(p); await fn(p, h, sane(t)); } finally { await stop(p); } }) });

/** What the binder note (or another) has in its properties, without Obsidian's own position data. */
const props = (p, path = NOTE) => p.ev(`(() => { const f = app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? {}; const o = { ...f }; delete o.position; return o; })()`);
/** Sets (or, with undefined, takes away) properties of a note, then waits for Obsidian to have them. */
const setProps = (p, path, patch) => p.ev(`(async () => {
	const patch = ${j(patch)}, gone = ${j(Object.keys(patch).filter((k) => patch[k] === undefined))};
	await app.fileManager.processFrontMatter(${file(path)}, (fm) => { for (const [k, v] of Object.entries(patch)) fm[k] = v; for (const k of gone) delete fm[k]; });
	await new Promise(r => setTimeout(r, 500));
	return 1;
})()`);
const body = (p, path = NOTE) => p.ev(`app.vault.adapter.read(${j(path)}).then(t => t.replace(/^---\\r?\\n[\\s\\S]*?\\r?\\n---\\r?\\n?/, ''))`);
/** The book's real words, and the book made bigger: a body of this many words in the Prologue (the test vault's is tiny). */
async function fill(p, words = 30000) {
	await p.ev(`(async () => { const f = ${file(L + '/Prologue.md')}, t = await app.vault.read(f), m = /^---\\r?\\n[\\s\\S]*?\\r?\\n---\\r?\\n?/.exec(t); await app.vault.modify(f, (m ? m[0] : '') + ('word '.repeat(80) + '\\n\\n').repeat(${Math.ceil(words / 80)})); await new Promise(r => setTimeout(r, 900)); return 1; })()`);
	return (await scenesOf(p, L)).reduce((a, s) => a + s.words, 0);
}

/** A record in the format of its files: a line a day from the day before `from` (the book had `before` words) to
    today, `added` words a day, and the deadline set on `from`. Written through the adapter, as a device's file is. */
async function plantPlan(p, { from, before, added, target, deadline, off = [] }) {
	const today = recordToday(), lines = {}, ms = (d, h) => new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h).getTime();
	const put = (d, line) => { (lines[d.slice(0, 4)] ??= []).push(JSON.stringify(line)); };
	let total = before;
	for (let d = plus(from, -1); d <= today; d = plus(d, 1)) {
		const wrote = d >= from && !off.includes(weekdayOf(d)), a = wrote ? added : 0;
		total += a;
		put(d, { t: 'day', d, u: ms(d, 22), k: 'desktop', n: a ? { Prologue: [a, 0, 0, 0] } : {}, h: a ? { 9: a } : {}, s: a ? [[Math.floor(ms(d, 9) / 60000), Math.floor(ms(d, 9) / 60000) + 30]] : [], m: a ? 30 : 0, tot: { at: ms(d, 22), w: total, n: 9, st: {} } });
	}
	if (deadline) put(from, { t: 'ev', at: ms(from, 12), d: from, k: 'deadline', p: '', from: '', to: deadline, n: target });
	const files = {};
	for (const [year, l] of Object.entries(lines)) files[`${year} Writing desk ${DESK}.binder-history`] = [JSON.stringify({ 'binders-history': 1, device: DESK, label: 'Writing desk', kind: 'desktop', year: +year }), ...l].join('\n') + '\n';
	await p.ev(`(async () => {
		const a = app.vault.adapter, dir = ${j(HIST)}, pl = ${PL};
		pl.progress.forget();
		if (!(await a.exists(${j(L + '/Snapshots')}))) await a.mkdir(${j(L + '/Snapshots')});
		if (!(await a.exists(dir))) await a.mkdir(dir);
		for (const [name, text] of Object.entries(${j(files)})) await a.write(dir + '/' + name, text);
		pl.progress.setDevice({ id: ${j(DESK)}, label: 'Writing desk', kind: 'desktop' });
		pl.progress.forget();
	})().then(() => 1)`);
}

/** A plan 20 days along its 40 (all days written on): `gained` words in those 20 days, 8,000 to write in all. The note
    gets the target and the deadline first, so a change typed into it is not an event that outdates the record. */
async function planned(p, W, { gained, deadlineIn = 20, off = [], noRecord = false }) {
	const today = recordToday(), from = plus(today, -19), before = W - gained, target = before + 8000, deadline = plus(today, deadlineIn);
	await setProps(p, NOTE, { target, deadline, 'writing-days': off.length ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !off.includes(d)).map((d) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]) : undefined });
	if (!noRecord) await plantPlan(p, { from, before, added: gained / 20, target, deadline, off });
	return { today, from, before, target, deadline };
}

// ---- the window ----
const shut = async (p) => { for (let i = 0; i < 10 && await p.ev(`!!document.querySelector(${j(WIN)})`); i++) { await p.key('Escape'); await p.sleep(120); } };
async function show(p, folder = L) {
	await shut(p);
	await openView(p, folder);
	await p.ev(`app.commands.executeCommandById('binders:show-progress')`);
	await until(p, `!!document.querySelector('${WIN} .binders-chart-life, ${WIN} .binders-pot-nothing')`, 6000);
	await p.sleep(300);
}
const paceText = (p) => p.ev(`(() => { const e = document.querySelector('${WIN} .binders-pot-paceline .binders-pot-pacetext'); return { said: e?.querySelector('.binders-pot-pace')?.textContent ?? '', state: [...(e?.querySelector('.binders-pot-pace')?.classList ?? [])].find(c => /^is-/.test(c)) ?? '', all: e?.textContent ?? '', button: document.querySelector('${WIN} .binders-pot-paceline button')?.textContent ?? null }; })()`);
const figures = (p) => p.ev(`[...document.querySelectorAll('${WIN} .binders-pot-figure')].map(f => ({ label: f.querySelector('.binders-pot-figure-label').textContent, value: f.querySelector('.binders-pot-figure-value').textContent, note: f.querySelector('.binders-pot-figure-note').textContent }))`);
const sections = (p) => p.ev(`[...document.querySelectorAll('${WIN} section.binders-pot-section')].map(s => s.getAttribute('aria-label'))`);
const colorOf = (p, sel) => p.ev(`getComputedStyle(document.querySelector('${WIN} ${sel}')).color`);
const typeInto = (p, key, value) => p.ev(`(() => { const i = document.querySelector('${WIN} [data-binders-key="${key}"]'); i.value = ${j(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
const clickIn = (p, text) => p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].find(b => b.textContent === ${j(text)}); if (!b) return false; b.click(); return true; })()`);
const clickDay = (p, day) => p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="form-day-${day}"]').click(); return 1; })()`);
const shot = async (p, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); const theme = await p.ev(`document.body.classList.contains('theme-dark') ? 'dark' : 'light'`); await p.shot(`${SHOTS}/${name}-${theme}.png`); };
const nothingChanged = async (p, t, before, what) => { t.eq(j(await props(p)), j(before), what); };
const undo = (p) => p.ev(`${B}.undo(${file(L)}).then(r => r)`);

// ---- set, change and clear: the note's properties, one step each ----

test('set a deadline from the window: the form checks it, the note gains target, deadline and writing days and nothing else, one Undo takes them back', async (p, h, t) => {
	const W = await fill(p), today = recordToday(), due = plus(today, 40);
	await setProps(p, NOTE, { 'zz-mine': 'kept' });
	const before = await props(p), text = await body(p);
	await plantPlan(p, { from: plus(today, -2), before: W - 300, added: 100 });
	await show(p);
	let s = await paceText(p);
	t.eq([s.all, s.button], ['No deadline is set.', 'Set a deadline'], 'no deadline: it says so, and offers to set one');
	t.eq((await figures(p)).map((f) => f.label).join(','), 'Today,Seven days,The book', 'and the numbers are the ones there were');
	await clickIn(p, 'Set a deadline');
	await p.sleep(150);
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-pot-form [data-binders-key="form-target"]')`), 'the form opens, with Obsidian’s own rows');
	t.eq(await p.ev(`document.activeElement?.dataset?.bindersKey`), 'form-target', 'and the target field has the focus');
	t.eq(await p.ev(`[...document.querySelectorAll('${WIN} .binders-pot-form .setting-item-name')].map(e => e.textContent).filter(Boolean).join(' | ')`), 'Word count target | Deadline | Writing days', 'the target, the deadline and the writing days');
	await shot(p, 'form');
	// nothing typed
	await clickIn(p, 'Save');
	t.ok(/Give the number of words/.test(await p.ev(`document.querySelector('${WIN} .binders-pot-form-problem').textContent`)), 'no target: it says what is needed');
	await typeInto(p, 'form-target', String(W - 100));
	await clickIn(p, 'Save');
	t.ok(/already\. Choose a target above that\./.test(await p.ev(`document.querySelector('${WIN} .binders-pot-form-problem').textContent`)), 'a target the book has passed: it says so');
	await typeInto(p, 'form-target', fmt(W + 20000));
	await typeInto(p, 'form-deadline', plus(today, -1));
	await clickIn(p, 'Save');
	t.ok(/has passed/.test(await p.ev(`document.querySelector('${WIN} .binders-pot-form-problem').textContent`)), 'a date that has passed: it says so');
	await typeInto(p, 'form-deadline', due);
	for (const d of [0, 1, 2, 3, 4, 5, 6]) await clickDay(p, d);
	await clickIn(p, 'Save');
	t.ok(/at least one day/.test(await p.ev(`document.querySelector('${WIN} .binders-pot-form-problem').textContent`)), 'no writing day ticked: it says so');
	await nothingChanged(p, t, before, 'and the note has not been touched by any of those');
	for (const d of [1, 2, 3, 4, 5]) await clickDay(p, d);
	await clickIn(p, 'Save');
	await until(p, `!document.querySelector('${WIN} .binders-pot-form') && /gets there by/.test(document.querySelector('${WIN} .binders-pot-paceline')?.textContent ?? '')`, 5000);
	const after = await props(p);
	t.eq(j(after), j({ ...before, target: W + 20000, deadline: due, 'writing-days': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] }), 'the note has gained exactly the three properties, and every other is as it was');
	t.eq(await body(p), text, 'and its text is as it was');
	s = await paceText(p);
	t.ok(!!s.state && /gets there by/.test(s.all), `the sentence is there: “${s.all}”`);
	t.eq(s.button, 'Change the plan', 'and the button now changes it');
	t.ok((await sections(p)).includes('The plan'), 'the plan has its section');
	t.eq(await p.ev(`document.querySelector('${WIN} section[aria-label="The plan"] .binders-pot-section-detail').textContent`), `${fmt(W + 20000)} words by ${+due.slice(8)} ${MONTHS[+due.slice(5, 7) - 1]} ${due.slice(0, 4)}, writing weekdays`, 'its heading says the target, the date and the days');
	const fig = await figures(p);
	t.ok(/ a day$/.test(fig[fig.length - 1].value) && /writing days? left$/.test(fig[fig.length - 1].note), `the last number is a day’s share: ${fig[fig.length - 1].value}, ${fig[fig.length - 1].note}`);
	await shot(p, 'set');
	await shut(p);
	// one step of Undo takes all three
	const said1 = await undo(p);
	t.ok(/Set a deadline of “The Lighthouse”/.test(said1 ?? ''), `Undo names it: ${said1}`);
	await p.sleep(600);
	await nothingChanged(p, t, before, 'one Undo takes back the target, the deadline and the writing days together');
	t.eq(await body(p), text, 'and the text is still as it was');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('a binder with no record: the small dialog still sets the plan, and says the share a day', async (p, h, t) => {
	const W = await fill(p), today = recordToday(), due = plus(today, 20);
	const before = await props(p);
	await show(p);
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-pot-nothing')`), 'no record: the small dialog');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-pot-paceline .binders-pot-pacetext').textContent`), 'No deadline is set.', 'it says no deadline is set');
	await clickIn(p, 'Set a deadline');
	await p.sleep(150);
	await typeInto(p, 'form-target', fmt(W + 4000));
	await typeInto(p, 'form-deadline', due);
	await clickIn(p, 'Save');
	await until(p, `/a day\\./.test(document.querySelector('${WIN} .binders-pot-paceline')?.textContent ?? '')`, 6000);
	const said = await p.ev(`document.querySelector('${WIN} .binders-pot-paceline .binders-pot-pacetext').textContent`);
	t.ok(new RegExp(`^${fmt(W + 4000)} words by ${+due.slice(8)} ${MONTHS[+due.slice(5, 7) - 1]} ${due.slice(0, 4)}: \\d+ a day\\.`).test(said), `it says the share without a record: “${said}”`);
	t.eq(j(await props(p)), j({ ...before, target: W + 4000, deadline: due }), 'and the note has the target and the deadline');
	await shot(p, 'no-record');
	await shut(p);
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('change the plan and remove the deadline: each is one step, the target stays when the deadline goes', async (p, h, t) => {
	const W = await fill(p), today = recordToday();
	await setProps(p, NOTE, { target: W + 9000, deadline: plus(today, 30), 'writing-days': ['Monday', 'Friday'] });
	const start_ = await props(p);
	await show(p);
	t.eq((await paceText(p)).button, 'Change the plan', 'a deadline: “Change the plan”');
	await clickIn(p, 'Change the plan');
	await p.sleep(150);
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="form-target"]').value`), String(W + 9000), 'the form has what the note has: the target');
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="form-deadline"]').value`), plus(today, 30), 'the date');
	t.eq(await p.ev(`[...document.querySelectorAll('${WIN} .binders-pot-weekday.is-active')].map(b => b.getAttribute('aria-label')).join()`), 'Monday,Friday', 'and the days');
	await typeInto(p, 'form-deadline', plus(today, 60));
	for (const d of [1, 5]) await clickDay(p, d);
	for (const d of [0]) await clickDay(p, d);
	await clickIn(p, 'Save');
	await until(p, `!document.querySelector('${WIN} .binders-pot-form')`, 5000);
	await p.sleep(500);
	t.eq(j(await props(p)), j({ ...start_, deadline: plus(today, 60), 'writing-days': ['Sunday'] }), 'only the date and the days changed');
	// every day ticked takes the days property away
	await clickIn(p, 'Change the plan');
	await p.sleep(100);
	for (const d of [1, 2, 3, 4, 5, 6]) await clickDay(p, d);
	await clickIn(p, 'Save');
	await until(p, `!document.querySelector('${WIN} .binders-pot-form')`, 5000);
	await p.sleep(500);
	t.eq(j(await props(p)), j({ ...start_, deadline: plus(today, 60), 'writing-days': undefined }), 'every day ticked is no property at all');
	// remove
	await clickIn(p, 'Change the plan');
	await p.sleep(100);
	await clickIn(p, 'Remove the deadline');
	await until(p, `!document.querySelector('${WIN} .binders-pot-form')`, 5000);
	await p.sleep(500);
	const end = await props(p);
	t.eq(j(end), j({ ...start_, deadline: undefined, 'writing-days': undefined }), 'removing the deadline takes the deadline and the days, and leaves the target');
	t.eq((await paceText(p)).all, 'No deadline is set.', 'and the window says so');
	await shut(p);
	// three steps, taken back in turn
	t.ok(/Remove the deadline/.test(await undo(p) ?? ''), 'the last step is the removal');
	await p.sleep(500);
	t.eq((await props(p)).deadline, plus(today, 60), 'which gave the deadline back');
	await undo(p); await p.sleep(500);
	t.eq(j((await props(p))['writing-days'] ?? null), j(['Sunday']), 'the one before gave back the days it had');
	await undo(p); await p.sleep(500);
	t.eq(j((await props(p))['writing-days']), j(['Monday', 'Friday']), 'and the one before it the days and the date it had');
	await nothingChanged(p, t, start_, 'and with that the note is as it was');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

// ---- the sentence, on a history ----

test('on pace, behind, ahead: the sentence, with the date, the day’s share and no change of color', async (p, h, t) => {
	const W = await fill(p), cases = [];
	// 20 of 40 writing days gone; 8,000 words to write in all, so the line is at 4,000 now
	for (const [gained, state, said, a_day] of [[4000, 'is-on', 'On pace.', 200], [1000, 'is-behind', '3,000 words behind the plan.', 336], [7000, 'is-ahead', '3,000 words ahead, about 15 days.', 65]]) {
		const { today, deadline } = await planned(p, W, { gained });
		await show(p);
		const s = await paceText(p);
		t.eq([s.state, s.said], [state, said], `${state.slice(3)}: “${s.said}”`);
		t.eq(s.all, `${said} ${fmt(a_day)} a day gets there by ${say(deadline, today)}.`, 'with what would do it, and when');
		const f = await figures(p), last = f[f.length - 1], first = f[0];
		t.eq([last.label, last.value, last.note], [say(deadline, today), `${fmt(a_day)} a day`, '21 writing days left'], `the last number is the share and the days left (${last.value})`);
		t.eq([first.label, first.value, first.note], ['Today', fmt(gained / 20), `of ${fmt(a_day)} for the plan`], 'and Today says what it is of');
		t.eq(await colorOf(p, '.binders-pot-pace'), await colorOf(p, '.binders-pot-figure-value'), 'the sentence is in the same color whatever it says');
		t.eq((await sections(p)).slice(0, 2).join(' | '), 'The plan | The book’s life', 'the plan is close up, before the book’s life');
		t.ok(await p.ev(`!!document.querySelector('${WIN} section[aria-label="The plan"] .binders-chart-plan')`), 'with its line drawn');
		t.ok(await p.ev(`!!document.querySelector('${WIN} section[aria-label="The plan"] .binders-pot-swatch.is-plan')`) && await p.ev(`!!document.querySelector('${WIN} section[aria-label="The plan"] .binders-pot-swatch.is-projection')`) === (gained > 0), 'and its key says the plan, and the pace the last days make');
		t.ok(await p.ev(`document.querySelector('${WIN} section[aria-label="The plan"] table tbody tr') !== null`), 'and a table of the same numbers for a screen reader');
		await shot(p, state.slice(3));
		cases.push(state);
	}
	t.eq(cases.length, 3, 'all three');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('passed and reached: the date and the numbers, no plan section, the old date a mark on the book’s life', async (p, h, t) => {
	const W = await fill(p), today = recordToday();
	// passed: the date was yesterday; 6,000 of the 8,000 written
	let r = await planned(p, W, { gained: 6000, deadlineIn: -1 });
	await show(p);
	let s = await paceText(p);
	t.eq(s.state, 'is-passed', 'passed');
	t.eq(s.said, `${say(r.deadline, today)} passed at ${fmt(W)} of ${fmt(r.target)}.`, `the sentence says where the book was: “${s.said}”`);
	t.eq(s.button, 'Set a new date', 'and the way out is “Set a new date”');
	t.ok(!(await sections(p)).includes('The plan'), 'no plan to show');
	const f = await figures(p);
	t.eq([f[f.length - 1].value, f[f.length - 1].note], ['Passed', `${fmt(r.target)} words`], 'the last number says passed');
	t.ok(await p.ev(`[...document.querySelectorAll('${WIN} .binders-chart-life text')].some(x => /words due$/.test(x.textContent)) || /words due/.test(document.querySelector('${WIN} .binders-pot-unsaid')?.textContent ?? '')`), 'the date stays on the book’s life as a mark');
	await shot(p, 'passed');
	await clickIn(p, 'Set a new date');
	await p.sleep(150);
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-pot-form')`), '“Set a new date” opens the form');
	await shut(p);
	// reached: all 8,000 written, the date 20 days off
	r = await planned(p, W, { gained: 8000 });
	await show(p);
	s = await paceText(p);
	t.eq([s.state, s.said], ['is-reached', 'Reached today, 20 days early.'], `reached: “${s.said}”`);
	t.ok(!(await sections(p)).includes('The plan'), 'with nothing left to plan');
	const g = await figures(p);
	t.eq(g[g.length - 1].value, 'Reached', 'the last number says reached');
	await shut(p);
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('the cases: today a day off, a deadline tomorrow and far off, a shrinking book, a record younger than the plan, no record, a deadline without a target', async (p, h, t) => {
	const W = await fill(p), today = recordToday(), me = weekdayOf(today);
	// today is not a writing day: no share today, never "of 0"
	await planned(p, W, { gained: 4000, off: [me] });
	await show(p);
	let f = await figures(p);
	t.eq(f[0].note, 'a day off in the plan', `today not a writing day: “${f[0].note}”`);
	t.ok(!/of 0/.test(f[0].note) && !/for the plan/.test(f[0].note), 'no “of 0”');
	t.ok(/ a day gets there by /.test((await paceText(p)).all), 'the sentence still says what a writing day has to be');
	// a deadline tomorrow
	await planned(p, W, { gained: 4000, deadlineIn: 1 });
	await show(p);
	t.ok(/gets there by tomorrow\.$/.test((await paceText(p)).all), `a deadline tomorrow: “${(await paceText(p)).all}”`);
	// five years off
	await planned(p, W, { gained: 4000, deadlineIn: 365 * 5 });
	await show(p);
	const far = await paceText(p), yr = String(+today.slice(0, 4) + 5);
	t.ok(new RegExp(`by \\d+ [A-Z][a-z]+ (${yr}|${+yr + 1})\\.$`).test(far.all) || /by \d+ [A-Z][a-z]+ 20\d\d\.$/.test(far.all), `five years off: the year is said: “${far.all}”`);
	t.eq(await p.ev(`!!document.querySelector('${WIN} .binders-chart-life')`), true, 'and the window draws');
	// a book that shrinks: behind by more each day, and the sentence stays true and calm (the numbers move, the words don't)
	await planned(p, W, { gained: -2000 });
	await show(p);
	const shrink = await paceText(p);
	t.eq(shrink.state, 'is-behind', 'a book cut in revision is behind');
	t.ok(/^[\d,]+ words behind the plan\. [\d,]+ a day gets there by /.test(shrink.all) && !/[!?]/.test(shrink.all), `and says so plainly: “${shrink.all}”`);
	// a record younger than the plan: the properties say it was set long before; the record began 5 days ago
	const target = W + 8000;
	await setProps(p, NOTE, { target, deadline: plus(today, 20), 'writing-days': undefined });
	await plantPlan(p, { from: plus(today, -4), before: W - 400, added: 100, target, deadline: plus(today, 20) });
	await p.ev(`(async () => { const a = app.vault.adapter, d = ${j(HIST)}; for (const f of (await a.list(d)).files) { const t = (await a.read(f)).split('\\n').filter(l => !l.includes('"k":"deadline"')).join('\\n'); await a.write(f, t); } ${PL}.progress.forget(); })().then(() => 1)`);
	await show(p);
	const young = await paceText(p);
	t.ok(!!young.state && /gets there by/.test(young.all), `a deadline the record never saw set: the sentence is there, from the record’s first day: “${young.all}”`);
	t.ok((await sections(p)).includes('The plan'), 'and so is the plan');
	// no target: a deadline needs one
	await setProps(p, NOTE, { target: undefined, deadline: plus(today, 20) });
	await show(p);
	t.eq((await paceText(p)).all, 'A deadline needs a target. Set both in the plan.', 'a deadline with no target says what is missing');
	t.ok(!(await sections(p)).includes('The plan'), 'and has no plan section');
	await clickIn(p, 'Change the plan');
	await p.sleep(100);
	t.eq(await p.ev(`document.querySelector('${WIN} [data-binders-key="form-target"]').value`), '', 'the form asks for the target');
	await shut(p);
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('words that came at once move the plan, and the window says it; recording off still gives the sentence', async (p, h, t) => {
	const W = await fill(p), today = recordToday();
	const r = await planned(p, W, { gained: 4000 });
	await show(p);
	const before = await paceText(p), f0 = await figures(p);
	// 3,000 words arrive at once (a paste): the total moves, so the plan moves
	await p.ev(`(async () => { const f = ${file(L + '/Epilogue.md')}, t = await app.vault.read(f); await app.vault.modify(f, t + '\\n\\n' + ('more '.repeat(80) + '\\n\\n').repeat(38)); })().then(() => 1)`);
	await until(p, `document.querySelector('${WIN} .binders-pot-paceline .binders-pot-pace')?.textContent !== ${j(before.said)}`, 6000);
	const after = await paceText(p), f1 = await figures(p);
	t.ok(after.said !== before.said, `the sentence moved: “${before.said}” to “${after.said}”`);
	t.ok(await p.ev(`/brought in|changed elsewhere/i.test(document.querySelector('${WIN}').textContent)`), 'and the window says words came at once, or from elsewhere');
	t.ok(f1[f1.length - 1].value !== f0[f0.length - 1].value, 'the day’s share is lower');
	await shut(p);
	// recording off: the sentence needs only the total and the dates
	await p.ev(`(async () => { ${PL}.settings.recordProgress = false; await ${PL}.saveSettings(); })().then(() => 1)`);
	await show(p);
	t.ok(await p.ev(`!!document.querySelector('${WIN} .binders-pot-paceline')`) && /gets there by|On pace|ahead|behind/.test((await paceText(p)).all), `recording off: the plan still says how the book stands: “${(await paceText(p)).all}”`);
	t.ok(/Recording is off/.test(await p.ev(`document.querySelector('${WIN} .binders-pot-said')?.textContent ?? ''`)), 'and says it is off');
	await shut(p);
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('a folder’s own deadline: the form writes the folder’s note, the book’s note is not touched', async (p, h, t) => {
	const W = await fill(p), today = recordToday();
	await plantPlan(p, { from: plus(today, -3), before: W - 300, added: 100, target: W + 4000, deadline: plus(today, 30) });
	await p.ev(`${PL}.progress.forget()`);
	const bookBefore = await props(p);
	await show(p);
	await p.ev(`(() => { const s = document.querySelector('${WIN} select.binders-pot-scope'); s.value = 'Part One'; s.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(250);
	t.eq((await paceText(p)).button, 'Set a deadline', 'a folder with no deadline offers to set one');
	await clickIn(p, 'Set a deadline');
	await p.sleep(150);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-pot-form .setting-item-description').textContent`), 'The words this folder is to have.', 'the form says it is the folder’s');
	const folderWords = await p.ev(`(async () => { const pl = ${PL}, root = ${file(L + '/Part One')}; let w = 0; for (const f of pl.binders.scenes(root)) w += pl.progress.words(await app.vault.cachedRead(f)); return w; })()`);
	await typeInto(p, 'form-target', String(folderWords + 5000));
	await typeInto(p, 'form-deadline', plus(today, 30));
	await clickIn(p, 'Save');
	await until(p, `!document.querySelector('${WIN} .binders-pot-form')`, 5000);
	await p.sleep(600);
	const folder = await props(p, PART);
	t.eq([folder.target, folder.deadline], [folderWords + 5000, plus(today, 30)], 'the folder’s note has the target and the deadline');
	await nothingChanged(p, t, bookBefore, 'the binder’s note is as it was');
	const st = await paceText(p);
	t.ok(!!st.state && /gets there by/.test(st.all), `and the window says how the folder stands against it: “${st.all}”`);
	await shut(p);
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('a deadline typed into the note’s properties is told to the record, and the plan begins that day', async (p, h, t) => {
	const W = await fill(p), today = recordToday();
	await p.ev(`${PL}.progress.forget()`);
	await openView(p, L);
	await p.sleep(800);
	await setProps(p, NOTE, { target: W + 5000, deadline: plus(today, 25) });
	await p.sleep(600);
	const plans = await p.ev(`${PL}.progress.history(${file(L)}).then(h => h?.plans ?? null)`);
	t.ok(Array.isArray(plans) && plans.some((e) => e.kind === 'deadline' && e.to === plus(today, 25) && e.day === today && e.scope === ''), `the record has the deadline set today: ${j(plans)}`);
	t.ok(plans.some((e) => e.kind === 'target' && e.to === String(W + 5000)), 'and the target');
	await setProps(p, NOTE, { deadline: undefined });
	await p.sleep(600);
	const gone = await p.ev(`${PL}.progress.history(${file(L)}).then(h => h?.plans?.filter(e => e.kind === 'deadline').pop() ?? null)`);
	t.eq(gone?.to, '', 'taking it away is told too');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('a Longform project has no deadline, and says so; a binder in a newer format can’t be given one', async (p, h, t) => {
	const idx = 'Longform demo/Index.md', before = await p.ev(`app.vault.adapter.read(${j(idx)})`);
	await show(p, 'Longform demo');
	if (await p.ev(`!!document.querySelector('${WIN} .binders-pot-paceline')`)) {
		const s = await paceText(p);
		t.eq(s.all, 'A Longform project can’t have a deadline. Convert it to a binder to use one.', 'the same words as pins and saved filters have');
		t.eq(s.button, null, 'and no button to set one');
	} else t.ok(!!(await p.ev(`document.querySelector('${WIN} .binders-pot-nothing')?.textContent`)), 'a project with no record says so');
	await shut(p);
	t.eq(await p.ev(`app.vault.adapter.read(${j(idx)})`), before, 'the index note is not touched');
	// a newer format: read, never written
	await p.ev(`(async () => { await app.vault.createFolder('Newer'); await app.vault.create('Newer/Newer.md', '---\\nbinder: 99\\ntarget: 1000\\ndeadline: ${plus(recordToday(), 30)}\\ncontents:\\n  - One\\n---\\n'); await app.vault.create('Newer/One.md', 'One two three.'); await new Promise(r => setTimeout(r, 900)); await ${PL}.binders.settled; })().then(() => 1)`);
	const newer = await p.ev(`app.vault.adapter.read('Newer/Newer.md')`);
	await show(p, 'Newer');
	t.ok(!(await p.ev(`!!document.querySelector('${WIN} .binders-pot-form')`)), 'a newer binder has no form');
	t.ok(!(await p.ev(`[...document.querySelectorAll('${WIN} button')].some(b => /deadline|plan|date/i.test(b.textContent))`)), 'and no button to set a deadline');
	await shut(p);
	t.eq(await p.ev(`app.vault.adapter.read('Newer/Newer.md')`), newer, 'its note is not written');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('opening the window writes nothing, with a deadline set', async (p, h, t) => {
	const W = await fill(p);
	await planned(p, W, { gained: 4000 });
	await p.sleep(1500);
	const walk = () => p.ev(`(async () => { const a = app.vault.adapter, out = {}; const go = async (dir) => { const l = await a.list(dir); for (const f of l.files) { if (f.startsWith('.obsidian')) continue; const s = await a.stat(f); out[f] = [s.size, s.mtime]; } for (const d of l.folders) if (!d.startsWith('.obsidian') && !d.startsWith('.trash')) await go(d); }; await go('/'); return out; })()`);
	const before = await walk();
	await show(p);
	await p.sleep(1500);
	await shut(p);
	await p.sleep(500);
	t.eq(j(await walk()), j(before), 'every note and every history file has the bytes and the time it had');
});

// ---- the toolbar ----

/** The toolbar's count, and what it holds. */
const bar = (p) => p.ev(`(() => { const v = document.querySelector('${LEAF} .binders-view'), c = v.querySelector('.binders-word-count'), g = v.querySelector('.binders-progress'), tk = g.querySelector('.binders-progress-plan'), tb = v.querySelector('.binders-toolbar');
	return { count: c.textContent, label: c.getAttribute('aria-label'), role: c.getAttribute('role'), tickShown: !tk.classList.contains('is-hidden') && getComputedStyle(g).display !== 'none', tickHidden: tk.classList.contains('is-hidden'), left: tk.style.left, barShown: getComputedStyle(g).display !== 'none', now: g.getAttribute('aria-valuenow'), text: g.getAttribute('aria-valuetext'), out: tb.scrollWidth - tb.clientWidth, cr: Math.round(c.getBoundingClientRect().right), vw: Math.round(v.getBoundingClientRect().right) }; })()`);

test('the toolbar: the plan’s place is a tick on the bar, “N a day to date” is in the count’s tooltip, and a click opens the Progress window', async (p, h, t) => {
	const W = await fill(p), today = recordToday();
	const r = await planned(p, W, { gained: 4000 });
	await openView(p, L);
	await until(p, `document.querySelector('${LEAF} .binders-progress-plan:not(.is-hidden)')`, 6000);
	let b = await bar(p);
	const at = ((r.before + 4000) / r.target) * 100;
	t.ok(b.tickShown && Math.abs(parseFloat(b.left) - at) < 0.6, `the tick is where the plan has the book (${b.left}, the plan: ${at.toFixed(1)}%)`);
	t.ok(new RegExp(`\\. 200 a day to ${say(r.deadline, today).replace(' ', ' ')}\\. Show progress$`).test(b.label), `the tooltip says what a day is, and to when: “${b.label}”`);
	t.ok(/The plan has the book at \d+%$/.test(b.text ?? ''), `and a screen reader is told where the plan has it: “${b.text}”`);
	await p.ev(`document.querySelector('${LEAF} .binders-view .binders-word-count').scrollIntoView()`);
	await shot(p, 'toolbar');
	// the click opens the window, not a dialog for the target
	const c = await p.at(`${LEAF} .binders-word-count`);
	await p.click(c.x, c.y);
	await until(p, `!!document.querySelector('${WIN} .binders-chart-life')`, 6000);
	t.ok(!(await p.ev(`[...document.querySelectorAll('.modal')].some(m => /Word count target/.test(m.textContent) && !m.matches('${WIN}'))`)), 'a click on the count opens the Progress window and no dialog for the target');
	t.eq(await p.ev(`document.querySelector('${WIN} .modal-title').textContent`), 'The Lighthouse', 'of this binder');
	await shut(p);
	// the keyboard does the same
	await p.ev(`document.querySelector('${LEAF} .binders-word-count').focus()`);
	await p.key('Enter');
	await until(p, `!!document.querySelector('${WIN} .binders-chart-life')`, 6000);
	t.ok(true, 'and so does Enter on the count');
	await shut(p);
	// the target is still set where it was: the command, and the menus
	await p.ev(`app.commands.executeCommandById('binders:set-target')`);
	await until(p, `[...document.querySelectorAll('.modal')].some(m => /Word count target for the binder/.test(m.textContent))`, 3000);
	t.ok(true, '“Set word count target” is still a command');
	await p.key('Escape');
	await p.sleep(200);
	// the bar says nothing of a plan without a deadline
	await setProps(p, NOTE, { deadline: undefined });
	await p.sleep(700);
	b = await bar(p);
	t.ok(b.tickHidden && !/a day to/.test(b.label) && /Show progress$/.test(b.label), `without a deadline: no tick and no “a day”: “${b.label}”`);
	// a target reached: no plan to keep
	await setProps(p, NOTE, { deadline: plus(today, 20), target: W - 10 });
	await p.sleep(700);
	b = await bar(p);
	t.ok(b.tickHidden && !/a day to/.test(b.label), 'a target reached: nothing is said of a plan');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

test('the toolbar: a folder shows its own plan, and a deadline with no record still says the share', async (p, h, t) => {
	const W = await fill(p), today = recordToday();
	await p.ev(`${B}.ensureFolderNote(${file(L + '/Part One')}).then(() => 1)`);
	await setProps(p, PART, { target: 99999, deadline: plus(today, 30) });
	await plantPlan(p, { from: plus(today, -3), before: W - 300, added: 100 });
	await openView(p, `${L}/Part One`);
	await p.sleep(900);
	let b = await bar(p);
	t.ok(/ a day to /.test(b.label), `a folder with a deadline says it on its own count: “${b.label}”`);
	const c = await p.at(`${LEAF} .binders-word-count`);
	await p.click(c.x, c.y);
	await until(p, `!!document.querySelector('${WIN} .binders-chart-life, ${WIN} .binders-pot-nothing')`, 6000);
	t.eq(await p.ev(`document.querySelector('${WIN} select.binders-pot-scope')?.value ?? null`), 'Part One', 'its click opens the window on that folder');
	await shut(p);
	// the book, with no record: the tooltip needs no history; the tick does
	await p.ev(`(async () => { const a = app.vault.adapter; if (await a.exists(${j(L + '/Snapshots')})) await a.rmdir(${j(L + '/Snapshots')}, true); ${PL}.progress.forget(); })().then(() => 1)`);
	await openView(p, L);
	await setProps(p, NOTE, { target: W + 8000, deadline: plus(today, 40) });
	await p.sleep(900);
	b = await bar(p);
	t.ok(/ a day to /.test(b.label), 'with no record the tooltip still says the share');
	t.ok(b.tickHidden, 'and there is no tick, which needs a record to know where the plan began');
	t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
});

// ---- a phone ----

async function onPhone(p, fn, width = 390) {
	await p.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
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
const tap = async (p, sel) => { const e = await p.at(sel); await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: e.x, y: e.y }] }); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.sleep(400); };
const fits = (p) => p.ev(`(() => { const w = document.querySelector(${j(WIN)}), b = w.querySelector('.binders-pot-body'), r = b.getBoundingClientRect(); return { wide: b.scrollWidth - b.clientWidth, over: [...b.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > r.right + 1 && !e.closest('table') && !e.closest('svg')).slice(0, 5).map(e => e.tagName + '.' + String(e.className?.baseVal ?? e.className).split(' ')[0]).join(' '), window: Math.round(w.getBoundingClientRect().width), vw: innerWidth }; })()`);

specs.push({
	name: 'progress deadline: a phone: a tap on the count opens the window, the sentence and the form fit the screen, a deadline is set and undone',
	fn: withTidy(async (p, h, t0) => {
		const t = sane(t0);
		await onPhone(p, async () => {
			const W = await fill(p), today = recordToday();
			const r = await planned(p, W, { gained: 1000 });
			await openView(p, L);
			await p.sleep(900);
			const b0 = await bar(p);
			t.ok(/ a day to /.test(b0.label), `the count says the share to its tooltip: “${b0.label}”`);
			await tap(p, `${LEAF} .binders-word-count`);
			await until(p, `!!document.querySelector('${WIN} .binders-chart-life')`, 8000);
			await p.sleep(400);
			const s = await paceText(p);
			t.eq(s.state, 'is-behind', `the window opens on the plan: “${s.all}”`);
			let f = await fits(p);
			t.ok(f.wide <= 1 && f.window <= f.vw, `nothing is wider than the screen (${f.wide}px: ${f.over})`);
			t.ok((await sections(p))[0] === 'The plan', 'the plan comes first');
			await shot(p, 'phone-behind');
			await p.ev(`document.querySelector('${WIN} .binders-pot-paceline button').click()`);
			await p.sleep(300);
			f = await fits(p);
			t.ok(f.wide <= 1 && f.window <= f.vw, `with the form open nothing is wider than the screen (${f.wide}px: ${f.over})`);
			const small = await p.ev(`[...document.querySelectorAll('${WIN} .binders-pot-form button, ${WIN} .binders-pot-form input')].map(e => { const r = e.getBoundingClientRect(); return [e.tagName + '.' + (e.dataset.bindersKey || e.textContent), Math.round(r.width), Math.round(r.height)]; }).filter(x => Math.min(x[1], x[2]) < 28)`);
			t.eq(small, [], 'and every button and field in it is big enough to touch');
			await shot(p, 'phone-form');
			await typeInto(p, 'form-target', String(r.target + 2000));
			await clickIn(p, 'Save');
			await until(p, `!document.querySelector('${WIN} .binders-pot-form')`, 5000);
			await p.sleep(600);
			t.eq((await props(p)).target, r.target + 2000, 'a target changed from the phone’s form is written');
			await shut(p);
			t.ok(/Change the plan/.test(await undo(p) ?? ''), 'and one Undo takes it back');
			t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
		});
	}),
});

// The toolbar at the widths of a phone and a computer: what sticks out, and that the plan adds nothing to it.
for (const width of [320, 390, 0]) {
	specs.push({
		name: `progress deadline: the toolbar at ${width || 'a computer’s'} px: a deadline adds nothing to what sticks out, and the tick is where it fits`,
		fn: withTidy(async (p, h, t0) => {
			const t = sane(t0);
			const run = async () => {
				const W = await fill(p), today = recordToday();
				await openView(p, L);
				await p.sleep(800);
				await setProps(p, NOTE, { target: W + 8000 });
				await p.sleep(700);
				const without = await bar(p);
				await planned(p, W, { gained: 4000 });
				await p.ev(`${VIEW}.drawToolbar()`);
				await p.sleep(900);
				if (width === 0 || width >= 440) await until(p, `document.querySelector('${LEAF} .binders-progress-plan:not(.is-hidden)')`, 6000);
				const withPlan = await bar(p);
				t.eq([withPlan.out, withPlan.cr, withPlan.vw], [without.out, without.cr, without.vw], `with a plan the toolbar is as wide as without (sticking out ${withPlan.out}px, the count ends at ${withPlan.cr} of ${withPlan.vw})`);
				t.ok(/ a day to /.test(withPlan.label), 'the tooltip has the share');
				t.eq(withPlan.barShown, width === 0 || width >= 440, `the bar, and its tick, are ${width === 0 || width >= 440 ? 'shown' : 'left out, as the bar is, in a narrow pane'}`);
				if (withPlan.barShown) t.ok(!withPlan.tickHidden && withPlan.left !== '', 'the tick is on it');
				t.ok(withPlan.out >= 0, `measured: the toolbar sticks out ${withPlan.out}px at this width, with or without a plan`);
				await shot(p, `toolbar-${width || 'wide'}`);
			};
			if (width) await onPhone(p, run, width); else { await start(p); try { await run(); } finally { await stop(p); } }
			t.eq(p.errors.filter((e) => /binders/i.test(e)).length, 0, 'with no error');
		}),
	});
}
