// QA round 11, find and replace on a phone (390 × 844, 320 × 568) and a tablet (820 × 1180), by touch: the way in
// through the view's menu, every button reachable and finger-sized, the review dialog scrolled by a finger with many
// changes, turning the device with the bar open (and with the review open), the bar over the boards, the keyboard up
// over the bar, Undo by touch, closing. The device is Obsidian's mobile mode with real touches over CDP (see
// specs-qa5-manuscript.mjs for how it is emulated and what that can't do). Tests named "qa11 find touch: …".
// What specs-find-replace.mjs already covers (the phone's first way in, one Next, one Replace all, Undo, the tablet's
// review fitting) is not repeated here. Every test that writes reads the disk afterwards, byte for byte.
import { PL, VIEW, file, j, openView, until, withTidy } from './view-helpers.mjs';
import { LEAF, PHONE, SMALL, TABLET, binder, caret, disk, land, metrics, onDevice, saveAll, settle, snap, swipe, tap, tapText } from './specs-qa5-manuscript.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 find touch: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeAll(p); } }) });
const on = (size, fn) => async (p, h, t) => { await onDevice(p, size, () => fn(p, h, t)); };
const log = (...a) => { if (process.env.QA11_LOG) console.log('   ', ...a); };

const BAR = `${VIEW}.findBar`;
const BARSEL = `${LEAF} .binders-view .binders-find`;
const REVIEW = '.modal.binders-find-review';

// ---- helpers ----
async function closeAll(p) {
	await p.ev(`(() => { try { ${BAR}?.close(); } catch {} document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); return 1; })()`).catch(() => {});
	await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
}
/** The bar open on the view in front (as Obsidian's find and replace command opens it), with this query and replacement. */
async function ask(p, q, by = null, { match = false } = {}) {
	await p.ev(`(async () => {
		const v = ${VIEW};
		if (!v.findBar) v.showSearch(${by != null}); else if (${by != null}) v.findBar.setReplacing(true);
		const b = v.findBar;
		if (b.options.matchCase !== ${match}) b.options = { matchCase: ${match} };
		b.input.value = ${j(q)};
		${by != null ? `b.by.value = ${j(by)};` : ''}
		await b.search();
	})().then(() => 1)`);
	await p.sleep(250);
}
const countText = (p) => p.ev(`document.querySelector(${j(BARSEL + ' .document-search-count')})?.textContent ?? null`);
const total = (p) => p.ev(`${BAR}.found.reduce((n, f) => n + f.hits.length, 0)`);
const rectOf = (p, sel) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
const inside = (r, w, h) => !!r && r.l >= 0 && r.t >= 0 && r.r <= w && r.b <= h;
const tapSel = async (p, sel) => { const at = await p.at(sel); if (!at) throw new Error('nothing to tap: ' + sel); await tap(p, at.x, at.y, 500); };
/** The n-th match of a selector, tapped at its middle (a finger on a list of rows). */
async function tapNth(p, sel, n) {
	const at = await p.ev(`(() => { const e = document.querySelectorAll(${j(sel)})[${n}]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
	if (!at) throw new Error('no ' + n + 'th of ' + sel);
	await tap(p, at.x, at.y, 500);
}
const isOpen = (p) => p.ev(`!!document.querySelector(${j(REVIEW)})`);
/** Opens Replace all's review, as a writer does (the bar's button), and waits for it. */
async function startReview(p) {
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector(${j(REVIEW)})`, 5000);
	await p.sleep(400);
}
/** The review's own Replace all has been answered: the replace has finished. */
const finished = async (p) => { await p.ev(`(window.__all ?? Promise.resolve()).then(() => 1)`); await p.sleep(400); };
const vault = (p) => Object.fromEntries(Object.entries(snap(p)).filter(([k]) => !/(^|\/)Snapshots\//.test(k)));
const snapshots = (p, folder) => p.ev(`${PL}.snapshotsApi.list(${file(folder)}).length`);
/** Every file in `before` is byte for byte what it was, but for the ones in `changes` (path → whole new text). */
function onlyThese(t, before, after, changes = {}) {
	for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (k in changes) t.eq(after[k], changes[k], `“${k}” is exactly what the replace should have made it`);
		else t.eq(after[k], before[k], `“${k}” is untouched, byte for byte`);
	}
}
const doneText = (p) => p.ev(`(() => { const e = document.querySelector(${j(BARSEL + ' .binders-find-done')}); return e && e.style.display !== 'none' ? e.textContent : null; })()`);
/** The page's own scrolling boxes inside the review (the one that moves the list, and how far it can go). */
const SCROLLERS = `(() => { const m = document.querySelector(${j(REVIEW)}); if (!m) return []; return [m, ...m.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4; }).map(e => ({ cls: String(e.className).split(' ').slice(0, 3).join('.'), top: Math.round(e.scrollTop), max: e.scrollHeight - e.clientHeight })); })()`;
/** The box a finger scrolls the review's list in: the list's own body. */
const listBox = (p) => rectOf(p, `${REVIEW} .binders-snapshots-text`);
/** The phone's keyboard shows as a shorter page (the emulation of the keyboard in specs-qa5-manuscript.mjs). */
const KB = { 390: 336, 320: 260 };
const typing = (p) => p.ev(`(() => { const a = document.activeElement; return !!a && (a.isContentEditable || !!a.closest?.('.cm-editor')); })()`);

// ---- the notes ----
// A binder of two notes with the word in every place a replace has to reach, and no link or tag in the way.
const MIXED = '---\nstatus: draft\nsynopsis: Mara in the synopsis.\n---\nMara came. mara waved. MARA! A Maramures rug.\n\nThe last line says Mara.\n\n';
const TWO = '---\nstatus: idea\n---\nOnly Mara here, and Mara there.\n';
const MIXED_MAREN = '---\nstatus: draft\nsynopsis: Mara in the synopsis.\n---\nMaren came. Maren waved. Maren! A Marenmures rug.\n\nThe last line says Maren.\n\n';
const TWO_MAREN = '---\nstatus: idea\n---\nOnly Maren here, and Maren there.\n';
// Seven matches in two notes: 5 and 2.
async function mixed(p, name = 'Find') {
	await binder(p, name, { '1 One': MIXED, '2 Two': TWO });
	await openView(p, name);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}
// Many changes: 180 places in three notes, one a paragraph, so the review is far longer than the screen.
const LINES = (k) => Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} of part ${k}: Mara turned to the window and said the light was late again, and the keeper would not come up before the tide.`).join('\n\n') + '\n';
const MANY = (k) => '---\nstatus: draft\n---\n' + LINES(k);
async function many(p) {
	await binder(p, 'Many', { '1 One': MANY(1), '2 Two': MANY(2), '3 Three': MANY(3) });
	await openView(p, 'Many');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}

// =====================================================================================================================
// 1. Undo, and the review, by touch on a phone
// =====================================================================================================================

test('phone: after Replace all, Undo is in the window, finger-sized, and a tap on it puts every note back byte for byte', on(PHONE, async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await startReview(p);
	await tapSel(p, `${REVIEW} button.mod-cta`);
	await finished(p);
	await saveAll(p);
	t.ok(!!(await doneText(p)) && /^Replaced 7 in 2 notes/.test(await doneText(p)), 'the line says what was done: ' + (await doneText(p)));
	const w = await p.ev('innerWidth'), hh = await p.ev('innerHeight');
	const u = await rectOf(p, `${BARSEL} .binders-find-undo`);
	log('undo', j(u));
	t.ok(inside(u, w, hh), 'Undo is in the window: ' + j(u));
	t.ok(!!u && u.w >= 44 && u.h >= 44, 'Undo can be touched with a finger, 44 points at least: ' + u?.w + '×' + u?.h);
	await tapSel(p, `${BARSEL} .binders-find-undo`);
	await p.sleep(900);
	await saveAll(p);
	t.ok(/^Put back in 2 notes/.test((await doneText(p)) ?? ''), 'and it says so: ' + (await doneText(p)));
	onlyThese(t, before, vault(p));
}));

test('phone: a review of 180 changes is scrolled by a finger to its last note; Replace all is still in sight at the end of the list, and a tap on it makes every change', on(PHONE, async (p, h, t) => {
	await many(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	t.eq(await countText(p), '1 / 180 in 3 notes', 'the bar counts 180 places in three notes');
	await startReview(p);
	const w = await p.ev('innerWidth'), hh = await p.ev('innerHeight');
	const body0 = await listBox(p);
	log('scrollers', j(await p.ev(SCROLLERS)));
	t.ok(!!body0, 'the list is drawn in the review');
	const x = Math.round((body0.l + body0.r) / 2);
	// a finger from the foot of the list up, again and again, until the list is at its end (its last paragraph in sight)
	const END = `(() => { const e = document.querySelector('.binders-snapshots-text'); return e.scrollTop + e.clientHeight >= e.scrollHeight - 2; })()`;
	let swipes = 0;
	for (; swipes < 40; swipes++) {
		const box = await listBox(p);
		await swipe(p, x, box.b - 70, x, box.t + 70, 10, 120);
		if (await p.ev(END)) break;
	}
	const lastPara = await rectOf(p, `${REVIEW} .binders-snapshots-text p:last-of-type`);
	log('swipes to the end of the list', swipes + 1, 'last paragraph', j(lastPara));
	t.ok(await p.ev(END), `a finger takes the list to its end in ${swipes + 1} swipes`);
	const cta = await rectOf(p, `${REVIEW} button.mod-cta`);
	t.ok(inside(cta, w, hh), 'Replace all is still in sight at the end of the list: ' + j(cta));
	await tapSel(p, `${REVIEW} button.mod-cta`);
	await finished(p);
	await saveAll(p);
	t.eq(disk(p, 'Many/1 One.md'), MANY(1).replace(/Mara/g, 'Maren'), 'note 1: all 60 places made, nothing else');
	t.eq(disk(p, 'Many/3 Three.md'), MANY(3).replace(/Mara/g, 'Maren'), 'note 3: all 60 places made, nothing else');
	t.ok(/^Replaced 180 in 3 notes/.test((await doneText(p)) ?? ''), 'and the line says so: ' + (await doneText(p)));
	const after = vault(p);
	t.ok(Object.keys(before).every((k) => k in after), 'no note was made or lost');
}));

test('phone: the review is closed by its close button, by touch, and changes nothing: no snapshot, no note touched', on(PHONE, async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await startReview(p);
	const w = await p.ev('innerWidth'), hh = await p.ev('innerHeight');
	const x = await rectOf(p, `${REVIEW} .modal-header-button`);
	log('close', j(x));
	t.ok(inside(x, w, hh) && x.w >= 36 && x.h >= 36, 'the close button is in the window and can be touched: ' + j(x));
	await tapSel(p, `${REVIEW} .modal-header-button`);
	await p.sleep(500);
	t.ok(!(await isOpen(p)), 'a tap closes the review');
	await finished(p);
	await saveAll(p);
	onlyThese(t, before, vault(p));
	t.eq(await snapshots(p, 'Find'), 0, 'and no snapshot was taken');
	t.eq(await doneText(p), null, 'nothing says it was replaced');
}));

// =====================================================================================================================
// 2. Turning the device with the bar open
// =====================================================================================================================

test('phone: turned to landscape with the bar open, it keeps its query and place, its buttons stay in the window, Next still goes, and it is the same turned back', on(PHONE, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara', 'Maren');
	await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
	await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
	const was = await countText(p);
	t.eq(was.split(' ')[0], '3', 'two Nexts: the third match ' + was);
	await metrics(p, ...land(PHONE));
	await p.sleep(800);
	const [w, hh] = [await p.ev('innerWidth'), await p.ev('innerHeight')];
	t.eq(w, 844, 'the page is landscape');
	t.eq(await countText(p), was, 'the count is the same after turning');
	t.eq(await p.ev(`document.querySelector(${j(BARSEL + ' input')}).value`), 'Mara', 'the query is kept');
	for (const sel of ['button[aria-label^="Previous"]', 'button[aria-label^="Next"]', 'button[aria-label^="Match case"]', '.document-search-close-button', '.document-replace-buttons button:first-child', 'button[aria-label^="Replace all..."]']) {
		const r = await rectOf(p, `${BARSEL} ${sel}`);
		t.ok(inside(r, w, hh), `${sel} is in the landscape window: ${j(r)}`);
	}
	t.ok(await p.ev(`document.documentElement.scrollWidth <= innerWidth`), 'the page does not scroll sideways');
	await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
	t.eq((await countText(p)).split(' ')[0], '4', 'Next by touch still steps, in landscape');
	await metrics(p, ...PHONE);
	await p.sleep(800);
	t.eq((await countText(p)).split(' ')[0], '4', 'turned back, the count and place are kept');
	const r = await rectOf(p, `${BARSEL} button[aria-label^="Replace all..."]`);
	t.ok(inside(r, PHONE[0], PHONE[1]), 'and the Replace all button is in the window again: ' + j(r));
}));

test('phone: turned to landscape with the review open, it still fits the window, its button is in sight and a tap makes the replace exactly', on(PHONE, async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await startReview(p);
	await metrics(p, ...land(PHONE));
	await p.sleep(800);
	const [w, hh] = [await p.ev('innerWidth'), await p.ev('innerHeight')];
	const m = await rectOf(p, REVIEW);
	log('review in landscape', j(m), w, hh);
	t.ok(!!m && m.l >= 0 && m.r <= w + 1, 'the review is within the width: ' + j(m));
	const cta = await rectOf(p, `${REVIEW} button.mod-cta`);
	t.ok(inside(cta, w, hh), 'its Replace all button is in the window: ' + j(cta));
	await tapSel(p, `${REVIEW} button.mod-cta`);
	await finished(p);
	await saveAll(p);
	onlyThese(t, before, vault(p), { 'Find/1 One.md': MIXED_MAREN, 'Find/2 Two.md': TWO_MAREN });
	await metrics(p, ...PHONE);
}));

test('tablet: turned from portrait to landscape with the bar open over the manuscript, the bar stays in the note’s column and in the window, keeps its query, and Next goes', on(TABLET, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara', 'Maren');
	let w = await p.ev('innerWidth'), r = await rectOf(p, `${BARSEL} .document-search`);
	t.ok(inside(r, w, await p.ev('innerHeight')) && r.w < w - 100, 'portrait: the bar is in the note’s column: ' + j(r));
	await metrics(p, ...land(TABLET));
	await p.sleep(800);
	w = await p.ev('innerWidth');
	const hh = await p.ev('innerHeight');
	r = await rectOf(p, `${BARSEL} .document-search`);
	log('landscape bar', j(r), w);
	t.ok(inside(r, w, hh), 'landscape: the bar is in the window: ' + j(r));
	t.ok(!!r && r.w < w - 100, 'and still the note’s column, not the whole width: ' + r?.w + ' of ' + w);
	t.eq((await countText(p)).split(' ')[0], '1', 'the place is kept');
	await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
	t.eq((await countText(p)).split(' ')[0], '2', 'Next by touch steps, turned');
	await metrics(p, ...TABLET);
	await p.sleep(800);
	t.eq((await countText(p)).split(' ')[0], '2', 'turned back, the same place');
}));

// =====================================================================================================================
// 3. The bar over the boards, on a tablet, and the keyboard over the bar on a phone
// =====================================================================================================================

test('tablet: on the corkboard and the outliner the bar is the width of the view, lights what matches, and Next by touch goes to the next lit card or row', on(TABLET, async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	for (const mode of ['corkboard', 'outliner']) {
		await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
		await p.sleep(900);
		await ask(p, 'the');
		const w = await p.ev('innerWidth');
		const bar = await rectOf(p, BARSEL), view = await rectOf(p, `${LEAF} .binders-view`);
		t.ok(bar && view && bar.l <= view.l + 8 && bar.r >= view.r - 8, `the bar is the width of the view in the ${mode}: ${j(bar)} in ${j(view)} of ${w}`);
		const lit = () => p.ev(mode === 'corkboard'
			? `[...document.querySelectorAll(${j(LEAF + ' .binders-card.is-find-hit[data-path]')})].map(c => c.dataset.path)`
			: `document.querySelectorAll(${j(LEAF + ' .is-find-hit')}).length`);
		const litBefore = await lit();
		t.ok(mode === 'corkboard' ? litBefore.length > 0 : litBefore > 0, 'something is lit in the ' + mode);
		const sel = () => p.ev(`[...document.querySelectorAll(${j(LEAF + (mode === 'corkboard' ? ' .binders-card.is-selected' : ' .binders-outliner-row.is-selected'))})].map(c => c.dataset.path)`);
		const selBefore = await sel();
		await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
		await p.sleep(500);
		const selAfter = await sel();
		log(mode, 'selected before', j(selBefore), 'after Next', j(selAfter), 'lit', j(litBefore));
		t.ok(selAfter.length === 1 && selAfter[0] !== selBefore[0] && (mode === 'outliner' || litBefore.includes(selAfter[0])), `Next by touch selects the next lit ${mode === 'corkboard' ? 'card' : 'row'}: ${j(selBefore)} to ${j(selAfter)}`);
		await p.ev(`(() => { ${BAR}.close(); return 1; })()`);
		await p.sleep(300);
	}
}));

test('phone: with the keyboard up over the bar (Replace with in use), the bar and its buttons are above the keyboard, and the match Next goes to is in sight above it', on(PHONE, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara', 'Maren');
	await tapSel(p, `${BARSEL} .document-replace-input`);
	await p.sleep(300);
	t.ok(await p.ev(`document.activeElement === ${BAR}.by`), 'the replace field has the keyboard');
	await metrics(p, PHONE[0], PHONE[1] - KB[PHONE[0]]);
	await p.sleep(600);
	const hh = await p.ev('innerHeight');
	t.eq(hh, PHONE[1] - KB[PHONE[0]], 'the page is the height the keyboard leaves');
	for (const sel of ['.document-replace-input', '.document-replace-buttons button:first-child', 'button[aria-label^="Replace all..."]']) {
		const r = await rectOf(p, `${BARSEL} ${sel}`);
		t.ok(inside(r, PHONE[0], hh), `${sel} is above the keyboard: ${j(r)}`);
	}
	await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
	await p.sleep(500);
	t.ok(await p.ev(`document.activeElement === ${BAR}.by || document.activeElement === ${BAR}.input`), 'the keyboard is still in the bar');
	const mark = await rectOf(p, `${LEAF} .binders-find-match.is-current, ${LEAF} .binders-find-mark.is-current`);
	const bar = await rectOf(p, `${BARSEL} .document-search`);
	log('current match', j(mark), 'bar', j(bar), 'height', hh);
	t.ok(!!mark && mark.t >= (bar?.b ?? 0) && mark.b <= hh, 'the match is in sight, below the bar and above the keyboard: ' + j(mark));
	await metrics(p, ...PHONE);
}));

// =====================================================================================================================
// 4. Buttons by touch: the case toggle, quick taps, Replace one, the narrowest phone, Replace all with nothing to replace
// =====================================================================================================================

test('phone: Match case by touch: pressed and counting only the match as typed, and pressed again, the count is what it was', on(PHONE, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara');
	t.eq(await total(p), 7, 'case off: seven places');
	await tapSel(p, `${BARSEL} button[aria-label^="Match case"]`);
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelector(${j(BARSEL + ' button[aria-label^="Match case"]')}).getAttribute('aria-pressed')`), 'true', 'the button says it is on');
	t.eq(await total(p), 5, 'case on: “Mara” as typed, five places (not mara, MARA)');
	await tapSel(p, `${BARSEL} button[aria-label^="Match case"]`);
	await p.sleep(400);
	t.eq(await total(p), 7, 'pressed again, all seven');
	t.eq(await p.ev(`document.querySelector(${j(BARSEL + ' button[aria-label^="Match case"]')}).getAttribute('aria-pressed')`), 'false', 'and it says so');
}));

test('phone: quick taps on Next, five in a row, each steps once; Previous by touch from there goes back and wraps to the last', on(PHONE, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara');
	const n = await total(p);
	const at = await p.at(`${BARSEL} button[aria-label^="Next"]`);
	for (let i = 0; i < 5; i++) await tap(p, at.x, at.y, 50);
	await p.sleep(400);
	t.eq((await countText(p)).split(' ')[0], '6', 'five taps: the sixth match (not lost, not doubled)');
	const pv = await p.at(`${BARSEL} button[aria-label^="Previous"]`);
	for (let i = 0; i < 5; i++) await tap(p, pv.x, pv.y, 50);
	await p.sleep(400);
	t.eq((await countText(p)).split(' ')[0], '1', 'five taps back: the first');
	await tap(p, pv.x, pv.y, 500);
	await p.sleep(300);
	t.eq((await countText(p)).split(' ')[0], String(n), 'one more Previous wraps to the last of ' + n);
}));

test('phone: Replace one by touch changes the match the writer is on and no other byte; the next tap changes the next, and each write is exactly that', on(PHONE, async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await tapSel(p, `${BARSEL} .document-replace-buttons button:first-child`);
	await p.sleep(900);
	await saveAll(p);
	onlyThese(t, before, vault(p), { 'Find/1 One.md': MIXED.replace('Mara came', 'Maren came') });
	t.eq(await total(p), 6, 'one place fewer: six');
	await tapSel(p, `${BARSEL} .document-replace-buttons button:first-child`);
	await p.sleep(900);
	await saveAll(p);
	onlyThese(t, before, vault(p), { 'Find/1 One.md': MIXED.replace('Mara came', 'Maren came').replace('mara waved', 'Maren waved') });
	t.eq(await total(p), 5, 'and five');
	t.eq(await doneText(p), null, 'Replace one says nothing of a replace all');
}));

test('phone 320 × 568: with the replace row, every button and field of the bar is in the window and none is drawn over another', on(SMALL, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara', 'Maren');
	const w = await p.ev('innerWidth'), hh = await p.ev('innerHeight');
	const boxes = await p.ev(`[...document.querySelectorAll(${j(BARSEL + ' button, ' + BARSEL + ' input')})].map(e => { const r = e.getBoundingClientRect(); return { name: e.getAttribute('aria-label') || e.className.toString().split(' ')[0] || e.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, shown: r.width > 0 && r.height > 0 }; }).filter(b => b.shown)`);
	log('bar at 320', j(boxes));
	for (const b of boxes) t.ok(b.l >= 0 && b.r <= w + 0.5, `${b.name} is in the window: ${Math.round(b.l)}–${Math.round(b.r)} of ${w}`);
	for (let i = 0; i < boxes.length; i++) for (let k = i + 1; k < boxes.length; k++) {
		const a = boxes[i], c = boxes[k];
		const over = a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5;
		t.ok(!over, `${a.name} and ${c.name} do not overlap`);
	}
	t.ok(await p.ev(`document.documentElement.scrollWidth <= innerWidth`), 'the page does not scroll sideways');
	const replace = boxes.filter((b) => /Replace/.test(b.name));
	t.ok(replace.every((b) => b.h >= 28), 'the replace buttons are at least 28 points tall: ' + replace.map((b) => Math.round(b.h)).join(', '));
	void hh;
}));

test('phone: Replace all tapped with nothing to replace does nothing: no review, no snapshot, no note written', on(PHONE, async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'zzqx', 'Maren');
	await tapSel(p, `${BARSEL} button[aria-label^="Replace all..."]`);
	await p.sleep(900);
	t.ok(!(await isOpen(p)), 'no review opens for nothing');
	t.eq(await snapshots(p, 'Find'), 0, 'no snapshot is taken');
	await saveAll(p);
	onlyThese(t, before, vault(p));
	t.ok(await p.ev(`!!${BAR}`), 'the bar is still open');
}));

// =====================================================================================================================
// 5. Closing, the keyboard, and where the text goes after it
// =====================================================================================================================

test('phone: closing the bar by touch leaves the keyboard down as Obsidian’s own search bar in a note does (compared in the same run)', on(PHONE, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara');
	await tapSel(p, `${BARSEL} .document-search-close-button`);
	await p.sleep(600);
	t.ok(!(await p.ev(`!!${BAR}`)), 'the bar closes');
	const binders = await typing(p);
	// Obsidian’s own bar, in a note, on the same device
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file('Find/2 Two.md')}); await l.setViewState({ type: 'markdown', state: { file: 'Find/2 Two.md', mode: 'source', source: true } }); return 1; })()`);
	await p.sleep(800);
	await p.ev(`(() => { app.commands.executeCommandById('editor:open-search'); return 1; })()`);
	await p.sleep(600);
	const has = await p.ev(`!!document.querySelector(${j(LEAF + ' .document-search-close-button')})`);
	t.ok(has, 'Obsidian’s search bar is open in the note');
	if (has) await tapSel(p, `${LEAF} .document-search-close-button`);
	await p.sleep(600);
	const obsidian = await typing(p);
	log('keyboard after closing: Binders', binders, 'Obsidian', obsidian);
	t.eq(binders, obsidian, 'closing by touch: the editor is focused (keyboard up) in Binders as it is in Obsidian’s own bar');
}));

test('phone: a tap in the text with the bar open, then Next: the next match is the first after where the writer tapped', on(PHONE, async (p, h, t) => {
	await mixed(p);
	await ask(p, 'Mara');
	await tapText(p, 'Find/2 Two.md', 'Only', 2);
	await p.sleep(500);
	log('caret after the tap', j(await caret(p)));
	t.ok(await p.ev(`!!${BAR}`), 'the bar is still open after the tap');
	await tapSel(p, `${BARSEL} button[aria-label^="Next"]`);
	await p.sleep(400);
	const got = (await countText(p)).split(' ')[0];
	log('after the tap in “Only”, Next went to', await countText(p));
	t.eq(got, '6', 'Next goes to “Mara here” (the sixth), the first match after the tap, not on from the last match (2)');
}));

test('tablet: the review’s list of notes, tapped by a finger, brings that note’s head to the top of the list, and the review stays in the window', on(TABLET, async (p, h, t) => {
	await many(p);
	await ask(p, 'Mara', 'Maren');
	await startReview(p);
	const w = await p.ev('innerWidth'), hh = await p.ev('innerHeight');
	const items = await p.ev(`document.querySelectorAll(${j(REVIEW + ' .binders-find-review-tree .tree-item-self.is-clickable')}).length`);
	t.eq(items, 3, 'the tree lists the three notes');
	await tapNth(p, `${REVIEW} .binders-find-review-tree .tree-item-self.is-clickable`, 2);
	await p.sleep(900);
	const modal = await rectOf(p, REVIEW);
	const heads = await p.ev(`[...document.querySelectorAll(${j(REVIEW + ' .binders-find-review-name')})].map(e => e.textContent)`);
	log('heads', j(heads), 'modal', j(modal), 'window', w, hh);
	t.ok(inside(modal, w, hh), 'the review stays in the window after the tap: ' + j(modal));
	const third = await p.ev(`(() => { const e = [...document.querySelectorAll(${j(REVIEW + ' .binders-find-review-name')})].find(x => x.textContent === '3 Three'); if (!e) return null; const r = e.closest('.binders-find-review-note').getBoundingClientRect(); const m = document.querySelector(${j(REVIEW)}).getBoundingClientRect(); return { top: Math.round(r.top), modalTop: Math.round(m.top) }; })()`);
	log('third note head', j(third));
	t.ok(!!third && third.top - third.modalTop < 160, 'the third note’s head is at the top of the list: ' + j(third));
	await tapSel(p, `${REVIEW} .modal-header-button`);
	await finished(p);
}));

test('phone: after Replace all, turned to landscape, the line with Undo is still there and its Undo puts every note back byte for byte', on(PHONE, async (p, h, t) => {
	await mixed(p);
	const before = vault(p);
	await ask(p, 'Mara', 'Maren');
	await startReview(p);
	await tapSel(p, `${REVIEW} button.mod-cta`);
	await finished(p);
	await saveAll(p);
	await metrics(p, ...land(PHONE));
	await p.sleep(800);
	t.ok(/^Replaced 7 in 2 notes/.test((await doneText(p)) ?? ''), 'the line is still there, turned: ' + (await doneText(p)));
	const w = await p.ev('innerWidth'), hh = await p.ev('innerHeight');
	const u = await rectOf(p, `${BARSEL} .binders-find-undo`);
	t.ok(inside(u, w, hh), 'Undo is in the landscape window: ' + j(u));
	await tapSel(p, `${BARSEL} .binders-find-undo`);
	await p.sleep(900);
	await saveAll(p);
	onlyThese(t, before, vault(p));
	await metrics(p, ...PHONE);
}));


