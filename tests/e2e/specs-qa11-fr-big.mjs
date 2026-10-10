// QA round 11, find and replace at size (src/find/, src/view/find-bar.ts, src/view/find-review.ts). A binder of 2,000
// notes and one note of 300,000 characters (Find11, in the test's own temporary vault). Every replace is checked file
// by file on disk, byte for byte. Timings print as "fr11 …" lines in the run's output and are reported as a table.
// Tests named "BUG: …" and "NIT: …" were written to fail until what they show is fixed.
import { statSync } from 'fs';
import { join } from 'path';
import { B, PL, VIEW, file, j, tidy, until, writeRaw } from './view-helpers.mjs';
import { LEAF, M, openMs, snap } from './specs-qa5-manuscript.mjs';
import { make } from './specs-qa6-scale.mjs';

export const specs = [];

const ROOT = 'Find11', BIG = 'Long note';
const N = 2000, OLD = 'Quorra', NEW = 'Vesna';
const ALL = N + 1; // 2,000 notes and the long one
// 2 matches in each note's text and 1,000 in the long one. The synopses also say OLD, as properties: never matched.
const TOTAL = 5000;
const TAIL = /\/ 5,000 in 2,001 notes$/;
const BARSEL = `${LEAF} .binders-view .binders-find`;
const BAR = `${VIEW}.findBar`;
const COUNT = `${BARSEL} .document-search-count`;
const DONE = `${BARSEL} .binders-find-done`;
const REVIEW = '.modal.binders-find-review';
const EXT = 'Changed by hand, outside Obsidian.\n';
// no letter q in it: the old word can't be found inside the filler
const FILLER = 'The lamp burned over the harbour while the gulls wheeled above the wet rope and the salt.';
const MIN = 15 * 60000;

const say = (label, o) => console.log(`    fr11 ${label} ${JSON.stringify(o)}`);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
const pos = (s) => { const m = /^(\d[\d,]*) \/ /.exec(s ?? ''); return m ? Number(m[1].replace(/,/g, '')) : null; };

const test = (name, fn, timeout = MIN) => specs.push({
	name: 'qa11 fr big: ' + name,
	timeout,
	fn: async (p, h, t) => { try { await fn(p, h, t); } finally { await clearUp(p); } },
});

// ---- the binder, on disk ----

/** The items of the binder: 2,000 notes that each say OLD twice (and once as a synopsis, which is a property), and the
    long note: 1,000 lines of 299 characters and a newline, 300,000 characters, each line with OLD once. */
const items = (bigFirst) => `(() => {
	const filler = ${j(FILLER)}, out = [];
	for (let i = 0; i < ${N}; i++) {
		const id = String(i).padStart(4, '0');
		out.push({ path: 'Note ' + id + '.md', text: '---\\nsynopsis: ${OLD} in the synopsis of note ' + id + '.\\n---\\n${OLD} came down the steps at ' + id + '. ' + filler + ' Then ${OLD} said nothing.\\n' });
	}
	let long = '';
	for (let k = 0; k < 1000; k++) long += (${j(OLD)} + ' ' + k + ' ' + filler.repeat(4)).slice(0, 299) + '\\n';
	const big = { path: '${BIG}.md', text: long };
	return ${bigFirst ? '[big, ...out]' : '[...out, big]'};
})()`;

async function build(p, bigFirst = false) {
	const r = await make(p, ROOT, items(bigFirst), { timeout: MIN });
	await openMs(p, ROOT);
	say('build', { notes: r.n, wrote_ms: r.wrote, settled_ms: r.settled, big_first: bigFirst });
	return r;
}

/** Everything of the binder on disk, by vault path (its snapshots left out). */
const notes = (p) => Object.fromEntries(Object.entries(snap(p)).filter(([k]) => k.startsWith(ROOT + '/') && !/(^|\/)Snapshots\//.test(k)));
const front = (s) => (/^---\n[\s\S]*?\n---\n/.exec(s) ?? [''])[0];
/** A note as a replace all leaves it: its properties as they were, each match in its text made the new word. */
const swap = (s) => { const f = front(s); return f + s.slice(f.length).split(OLD).join(NEW); };
const bodyCount = (files, word) => Object.values(files).reduce((n, s) => n + (s.slice(front(s).length).split(word).length - 1), 0);
const allCount = (files, word) => Object.values(files).reduce((n, s) => n + (s.split(word).length - 1), 0);
/** Every file is exactly what `expect` says it should be (path, text before → text expected). Returns the wrong ones. */
function exact(t, before, after, expect, what) {
	const bad = [];
	for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (after[k] !== expect(k, before[k])) bad.push(k);
	t.eq(bad.length, 0, `${what}: every one of ${Object.keys(after).length} files is exactly right${bad.length ? '; wrong: ' + bad.slice(0, 6).join(', ') : ''}`);
	return bad;
}
const toReplace = (k, b) => (k.startsWith(ROOT + '/') && k.endsWith('.md') ? swap(b) : b);
const snaps = (p, folder = ROOT) => p.ev(`${PL}.snapshotsApi.list(${file(folder)}).map(s => ({ title: s.title, auto: s.auto, path: s.file.path }))`);

// ---- the bar ----

/** The bar on the binder in front, over the manuscript (or a board); with the replace row. Its count is watched from here. */
async function openBar(p, replace = false) {
	await p.ev(`(() => { ${M}?.scenes?.find(s => s.live)?.live?.cm?.focus(); app.commands.executeCommandById(${j(replace ? 'editor:open-search-replace' : 'editor:open-search')}); return 1; })()`);
	if (!(await until(p, `!!document.querySelector(${j(BARSEL)})`, 8000))) throw new Error('the bar did not open');
	await p.sleep(200);
	await watch(p);
}
const countText = (p) => p.ev(`document.querySelector(${j(COUNT)})?.textContent ?? null`);
const doneText = (p) => p.ev(`(() => { const e = document.querySelector(${j(DONE)}); return e && e.style.display !== 'none' ? e.textContent : null; })()`);
/** Every change to the count, as [page time, text]: a draw of the count is a search's result, or a step. */
const watch = (p) => p.ev(`(() => { const el = document.querySelector(${j(COUNT)}); if (!el) return 0; window.__fr11Obs?.disconnect(); window.__fr11 = []; window.__fr11Obs = new MutationObserver(() => window.__fr11.push([performance.now(), el.textContent])); window.__fr11Obs.observe(el, { childList: true, subtree: true, characterData: true }); return 1; })()`);
const markCount = (p) => p.ev(`(window.__fr11 || []).length`);
const marks = (p, from) => p.ev(`(window.__fr11 || []).slice(${from})`);
/** Waits until the count has not changed for `ms`: the search and its draw are done. */
async function quiet(p, ms = 500, max = 300000) {
	const t0 = Date.now();
	let last = -1, since = Date.now();
	while (Date.now() - t0 < max) {
		const n = await markCount(p);
		if (n !== last) { last = n; since = Date.now(); } else if (Date.now() - since >= ms) return n;
		await p.sleep(50);
	}
	return last;
}
async function typeQ(p, q) { await p.type(q); await quiet(p); }
/** The bar's classes and buttons, for a message that says what was not there. */
const barState = (p) => p.ev(`(() => { const b = document.querySelector(${j(BARSEL)}); return b ? b.className + ' | buttons: ' + [...b.querySelectorAll('button, svg')].map(x => x.tagName + ':' + (x.getAttribute('aria-label') ?? '') + ':' + x.getAttribute('class')).join(' ; ') : 'no bar'; })()`);
/** A press on a button as a person makes it (the page sees a real mouse). */
async function click(p, sel) {
	const at = await p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
	if (!at) throw new Error('no ' + sel + ' — the bar is ' + await barState(p));
	await p.click(at.x, at.y);
}
/** Replace all, pressed: the review opens. */
async function openReview(p) {
	const t0 = Date.now();
	await click(p, `${BARSEL} .lucide-replace-all`);
	const ok = await until(p, `!!document.querySelector(${j(REVIEW)})`, 120000);
	return { ok: !!ok, ms: Date.now() - t0 };
}
/** The review's button, pressed: the replace runs and the bar says what it did. */
async function confirm(p) {
	const t0 = Date.now();
	await click(p, `${REVIEW} button.mod-cta`);
	const text = await until(p, `(() => { const e = document.querySelector(${j(DONE)}); return e && e.style.display !== 'none' && /^(Replaced|Removed) /.test(e.textContent) ? e.textContent : null; })()`, MIN);
	return { text, ms: Date.now() - t0 };
}
/** The bar for the binder's text with the old word, and the new word in the replace row. */
async function replaceSetup(p, t, bigFirst = false) {
	await build(p, bigFirst);
	await openBar(p, true);
	await typeQ(p, OLD);
	t.ok(TAIL.test(await countText(p)), 'the query finds 5,000 in 2,001 notes before anything is changed: ' + (await countText(p)));
	await click(p, `${BARSEL} .document-replace-input`);
	await p.type(NEW);
	await p.sleep(150);
}

/** Clears what a test made: the views and bars shut, the binder's folder deleted in one go (with no view open). */
async function clearUp(p) {
	await p.ev(`(async () => {
		try { ${BAR}?.close(); } catch {}
		// (a review or a dialog left open by a test that failed: closed, or taken off the page, so the next test starts clean)
		document.querySelectorAll('.modal-container').forEach(m => { const c = m.querySelector('.modal-close-button'); if (c) c.click(); else m.remove(); });
		document.querySelectorAll('.menu').forEach(m => m.remove());
		app.workspace.iterateAllLeaves(l => { if (l.view?.file?.path?.startsWith(${j(ROOT + '/')})) l.detach(); });
		app.workspace.detachLeavesOfType('binders-view');
		await new Promise(r => setTimeout(r, 200));
		const f = app.vault.getAbstractFileByPath(${j(ROOT)});
		if (f) await app.vault.delete(f, true);
		return 1;
	})().then(() => 1)`).catch(() => {});
	await tidy(p);
}

// =====================================================================================================================
// Typing, and the count after each letter
// =====================================================================================================================

test('typing the query letter by letter: the count follows every letter, and a query typed fast is counted once it stops', async (p, h, t) => {
	await build(p);
	await openBar(p);
	const lat = [];
	for (let i = 0; i < OLD.length; i++) {
		const at = await markCount(p), t0 = await p.ev('performance.now()');
		await p.key(OLD[i]);
		await quiet(p, 400);
		const got = await marks(p, at);
		const last = got[got.length - 1];
		lat.push(last ? Math.round(last[0] - t0) : null);
		t.ok(last && TAIL.test(last[1]), `after “${OLD.slice(0, i + 1)}” the count says 5,000 in 2,001 notes: “${last?.[1]}”`);
		await p.sleep(250); // one letter, then a pause: each letter is its own search
	}
	say('type letter by letter', { ms_to_count_per_letter: lat, first_cold: lat[0], median_rest: med(lat.slice(1)), max: Math.max(...lat.slice(1)) });
	// fast: the whole word at once, then the field cleared key by key
	for (let i = 0; i < OLD.length; i++) await p.key('Backspace');
	await quiet(p);
	t.ok(await p.ev(`(() => { const el = document.querySelector(${j(COUNT)}); return !el || el.offsetParent === null || getComputedStyle(el).display === 'none'; })()`), 'the field emptied: the count is hidden');
	const at = await markCount(p);
	await p.type(OLD);
	const tEnd = await p.ev('performance.now()');
	await quiet(p);
	const got = await marks(p, at), last = got[got.length - 1];
	say('type fast', { ms_from_last_letter_to_count: last ? Math.round(last[0] - tEnd) : null, draws: got.length, text: last?.[1] ?? null });
	t.ok(last && TAIL.test(last[1]), 'typed fast, it is counted once it stops: ' + last?.[1]);
	await click(p, `${BARSEL} button[aria-label^="Match case"]`);
	await quiet(p);
	t.ok(TAIL.test(await countText(p)), 'with Match case on, the word as typed: all 5,000');
	await p.key('a', 'ctrl');
	await p.type('quorra');
	await quiet(p);
	t.eq(await countText(p), '0 / 0', 'in lower case, with Match case on: none');
	t.ok(await p.ev(`document.querySelector(${j(BARSEL + ' input')}).classList.contains('mod-no-match')`), 'and the field says so');
	await click(p, `${BARSEL} button[aria-label^="Match case"]`);
	await quiet(p);
	t.ok(TAIL.test(await countText(p)), 'Match case off again: all 5,000 in lower case too');
}, MIN);

// =====================================================================================================================
// Stepping through the 5,000 matches
// =====================================================================================================================

/** Steps with Enter from match `p0`, `steps` times, checking that each press is the next match and the count says so.
    The manuscript is scrolled to the note that holds match `p0` first (two matches to a note), as a reader would be.
    Returns the draw-to-draw gaps in ms. */
async function stepRun(p, t, p0, steps, what, pre = null) {
	const note = Math.floor((p0 - 1) / 2);
	if (note > 0) await p.ev(`(() => { const s = ${M}.scenes[${note}]; if (!s || s.file.path !== ${j(ROOT + '/Note ' + String(note).padStart(4, '0') + '.md')}) return 'wrong note'; s.el.scrollIntoView({ block: 'start' }); return 1; })()`);
	await p.sleep(300);
	await openBar(p);
	await typeQ(p, OLD);
	if (pre) await pre();
	const start = pos(await countText(p));
	t.eq(start, p0, `${what}: the search starts at match ${p0}, where the reader is`);
	const lat = [], wrong = [];
	const t0 = Date.now();
	for (let i = 1; i <= steps; i++) {
		const at = await markCount(p);
		await p.key('Enter');
		let got = null;
		for (let k = 0; k < 600 && !got; k++) { const more = await marks(p, at); if (more.length) got = more[more.length - 1]; else await p.sleep(5); }
		if (!got) { wrong.push({ i, got: 'no draw' }); break; }
		lat.push(got[0]);
		const want = ((start - 1 + i) % TOTAL) + 1;
		if (pos(got[1]) !== want || !TAIL.test(got[1])) wrong.push({ i, want, got: got[1] });
		if (wrong.length > 5) break;
		if (i % 250 === 0) {
			const st = await p.ev(`(() => { const m = ${M}; return { live: m?.scenes?.filter(s => s.live).length ?? null, nodes: document.getElementsByTagName('*').length, heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 }; })()`);
			console.log(`    fr11 ${what}: step ${i} of ${steps} at ${Date.now() - t0} ms, last 250 took ${Math.round((lat[lat.length - 1] - lat[lat.length - 250]) / 249)} ms each (draw to draw), ${j(st)}`);
		}
	}
	const gaps = lat.slice(1).map((x, i) => x - lat[i]);
	say(what, { from: start, steps: lat.length, total_ms: Date.now() - t0, gap_median_ms: Math.round(med(gaps)), gap_p95_ms: Math.round(pct(gaps, 0.95)), gap_max_ms: Math.round(Math.max(...gaps)), first100_ms: Math.round(med(gaps.slice(0, 100))), last100_ms: Math.round(med(gaps.slice(-100))), text_check_failures: wrong.length });
	t.eq(wrong.length, 0, `${what}: each press is the next match and the count says so (of ${lat.length} presses${wrong.length ? '; first wrong: ' + j(wrong[0]) : ''})`);
	return { gaps, lat };
}
const clearedCount = (p) => p.ev(`(() => { const el = document.querySelector(${j(COUNT)}); return !el || el.offsetParent === null || getComputedStyle(el).display === 'none'; })()`);

test('stepping through matches 1 to 1,250 with Enter: each press moves the count one on; Shift+Enter from the first goes to the last, and Enter comes back', async (p, h, t) => {
	await build(p);
	// from the first match, Shift+Enter goes round to the last, and Enter comes back to the first
	const pre = async () => {
		await p.key('Enter', 'shift');
		await quiet(p);
		t.eq(pos(await countText(p)), TOTAL, 'Shift+Enter from match 1 goes back round to 5,000');
		await p.key('Enter');
		await quiet(p);
		t.eq(pos(await countText(p)), 1, 'and Enter comes forward to 1 again');
	};
	await stepRun(p, t, 1, 1249, 'matches 1 to 1,250', pre);
	await p.key('Enter', 'shift');
	await quiet(p);
	t.eq(pos(await countText(p)), 1249, 'Shift+Enter from 1,250 goes back to 1,249');
	await p.key('Enter');
	await quiet(p);
	t.eq(pos(await countText(p)), 1250, 'and Enter brings it forward to 1,250 again');
	await p.key('a', 'ctrl');
	await p.key('Backspace');
	await quiet(p);
	t.ok(await clearedCount(p), 'with the field cleared, the count goes');
}, 20 * 60000);

test('stepping through matches 1,251 to 2,500 with Enter: each press is the next match, and the count says so', async (p, h, t) => {
	await build(p);
	await stepRun(p, t, 1251, 1249, 'matches 1,251 to 2,500');
}, 20 * 60000);

test('stepping through matches 2,501 to 3,750 with Enter: each press is the next match, and the count says so', async (p, h, t) => {
	await build(p);
	await stepRun(p, t, 2501, 1249, 'matches 2,501 to 3,750');
}, 20 * 60000);

test('stepping through matches 3,751 to 5,000 with Enter: each press is the next match; the last wraps to the first', async (p, h, t) => {
	await build(p);
	await stepRun(p, t, 3751, 1249, 'matches 3,751 to 5,000');
	await p.key('Enter');
	await quiet(p);
	t.eq(pos(await countText(p)), 1, 'one more Enter from 5,000 wraps to 1');
}, 20 * 60000);

test('each Enter takes longer than the one before: the last 250 of the first 3,000 matches take at most twice as long as the first 250', async (p, h, t) => {
	await build(p);
	const { gaps } = await stepRun(p, t, 1, 3000, 'matches 1 to 3,000, for the slowdown');
	const first = med(gaps.slice(0, 250)), last = med(gaps.slice(-250));
	t.ok(last <= 2 * first, `the median gap of the first 250 presses is ${Math.round(first)} ms and of the last 250 is ${Math.round(last)} ms: a press costs more the further the search has gone`);
}, 40 * 60000);

// =====================================================================================================================
// Replace all, and Undo
// =====================================================================================================================

test('replace all over 2,000 notes and the 300,000-character note: every file on disk is exactly what the replace makes it, and the totals add up', async (p, h, t) => {
	await replaceSetup(p, t);
	const before = notes(p);
	t.eq(bodyCount(before, OLD), TOTAL, 'before: 5,000 matches in the text of the notes');
	const snapsBefore = await snaps(p);
	const r = await openReview(p);
	t.ok(r.ok, 'the review opens');
	const c = await confirm(p);
	t.ok(c.text && /^Replaced 5,000 in 2,001 notes\./.test(c.text), 'the bar says “Replaced 5,000 in 2,001 notes.”: ' + c.text);
	const t1 = Date.now();
	const after = notes(p);
	const readMs = Date.now() - t1;
	const changed = Object.keys(after).filter((k) => after[k] !== before[k]).length;
	const wrong = exact(t, before, after, toReplace, 'replace all');
	t.eq(changed, ALL, 'the 2,001 notes that had a match are the ones changed');
	t.eq(bodyCount(after, NEW), TOTAL, 'total of the new word in the text of the notes: 5,000');
	t.eq(bodyCount(after, OLD), 0, 'total of the old word left in the text: none');
	t.eq(allCount(after, OLD), N, 'the old word left is only the 2,000 synopses, which are properties, and untouched');
	t.eq(allCount(after, NEW), TOTAL, 'the new word in the whole of the binder: 5,000, and none in a synopsis');
	const sample = ['Note 0000.md', 'Note 0999.md', 'Note 1999.md', BIG + '.md'].map((n) => ROOT + '/' + n);
	say('replace all', { notes: ALL, review_ms: r.ms, bar_says_done_ms: c.ms, disk_read_ms: readMs, changed, wrong: wrong.length, sample: sample.map((k) => after[k]?.length) });
	const snapsAfter = await snaps(p);
	const made = snapsAfter.filter((s) => !snapsBefore.some((b) => b.path === s.path));
	t.eq(made.length, 1, 'a snapshot of the binder is taken first (one more in the list)');
	if (made.length) {
		const size = statSync(join(p.vaultDir, made[0].path)).size;
		t.ok(size >= 300000, `the snapshot holds the long note: ${size} bytes`);
		say('snapshot before replace', { bytes: size });
	}
}, 2 * MIN);

test('Undo takes a replace all back: every file is byte for byte as it was before, and the bar says so', async (p, h, t) => {
	await replaceSetup(p, t);
	const before = notes(p);
	await openReview(p);
	const c = await confirm(p);
	t.ok(c.text, 'the replace is done: ' + c.text);
	const after = notes(p);
	t.ok(await p.ev(`!!document.querySelector(${j(BARSEL + ' .binders-find-undo')})`), 'and offers Undo');
	const t0 = Date.now();
	await click(p, `${BARSEL} .binders-find-undo`);
	const u = await until(p, `(() => { const e = document.querySelector(${j(DONE)}); return e && /^Put back in /.test(e.textContent) ? e.textContent : null; })()`, MIN);
	const undoMs = Date.now() - t0;
	t.ok(u && /^Put back in 2,001 notes\.$/.test(u), 'the bar says it put back 2,001 notes: ' + u);
	const back = notes(p);
	exact(t, before, back, (k, b) => b, 'undo');
	t.eq(Object.keys(after).filter((k) => after[k] !== before[k]).length, ALL, 'the replace had changed all 2,001 notes first');
	say('undo', { undo_ms: undoMs, bar_says: u });
}, 2 * MIN);

test('Undo leaves the note that was typed in since as it is, says so, and puts back the rest', async (p, h, t) => {
	await replaceSetup(p, t);
	const before = notes(p);
	await openReview(p);
	await confirm(p);
	const path = `${ROOT}/Note 0007.md`;
	await writeRaw(p, path, EXT);
	await p.sleep(600);
	await click(p, `${BARSEL} .binders-find-undo`);
	const u = await until(p, `(() => { const e = document.querySelector(${j(DONE)}); return e && /^Put back in /.test(e.textContent) ? e.textContent : null; })()`, MIN);
	t.eq(u, 'Put back in 2,000 notes. 1 note was changed since, and left as it is.', 'the bar says one was left as it is');
	const back = notes(p);
	exact(t, before, back, (k, b) => (k === path ? EXT : b), 'undo after a note was changed by hand');
}, 2 * MIN);

// =====================================================================================================================
// The review, with thousands of changes
// =====================================================================================================================

const reviewInfo = (p) => p.ev(`(() => {
	const m = document.querySelector(${j(REVIEW)});
	if (!m) return null;
	return {
		title: m.querySelector('.modal-title, .modal-setting-title')?.textContent ?? null,
		detail: m.querySelector('.binders-snapshots-detail')?.textContent ?? null,
		rows: m.querySelectorAll('.binders-find-review-tree .binders-folder-snapshots-row').length,
		heads: m.querySelectorAll('.binders-find-review-note').length,
		places: m.querySelectorAll('.binders-snapshots-changes del').length,
		fold: m.querySelector('.binders-snapshots-folded')?.textContent ?? null,
	};
})()`);

test('the review of thousands of changes lists every note, draws the first few hundred places and counts the rest; cancelling it replaces nothing and takes no snapshot', async (p, h, t) => {
	await replaceSetup(p, t);
	const before = notes(p);
	const snapsBefore = await snaps(p);
	const r = await openReview(p);
	const info = await reviewInfo(p);
	say('review of 5,000 places', { opens_ms: r.ms, ...info });
	t.ok(r.ok && info, 'the review is open');
	t.eq(info.rows, ALL, 'every note is listed in the review’s tree');
	t.ok(/5,000 places in 2,001 notes/.test(info.detail ?? ''), 'and it says how many: ' + info.detail);
	const folded = info.fold ? Number(/[\d,]+/.exec(info.fold)[0].replace(/,/g, '')) : 0;
	t.eq(info.places + folded, TOTAL, `the places drawn (${info.places}) and the ones counted (${folded}) are all 5,000`);
	t.ok(info.places < TOTAL, 'not all of them are drawn: the rest is counted, as the code says');
	await p.key('Escape');
	await p.sleep(400);
	t.ok(!(await p.ev(`!!document.querySelector(${j(REVIEW)})`)), 'Escape closes the review');
	exact(t, before, notes(p), (k, b) => b, 'cancelled review');
	t.eq((await snaps(p)).length, snapsBefore.length, 'no snapshot was taken');
	t.ok(!(await doneText(p)), 'and the bar says nothing was done');
}, 2 * MIN);

test('the review lists every note, but a row past the first few hundred changes looks clickable and does nothing', async (p, h, t) => {
	await replaceSetup(p, t);
	await openReview(p);
	const rowAt = (name) => p.ev(`(() => { const row = [...document.querySelectorAll('.binders-find-review-tree .binders-folder-snapshots-row')].find(r => r.querySelector('.tree-item-inner')?.textContent === ${j(name)}); const s = row?.querySelector('.tree-item-self'); if (!s) return null; const b = s.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, clickable: s.classList.contains('is-clickable') }; })()`);
	const shown = (name) => p.ev(`[...document.querySelectorAll('${REVIEW} .binders-find-review-name')].some(e => e.textContent === ${j(name)})`);
	// the control: a note drawn in the review
	let at = await rowAt('Note 0010');
	t.ok(at, 'the row for a note near the top is there');
	await p.click(at.x, at.y);
	await p.sleep(400);
	t.ok(await shown('Note 0010'), 'control: a row for a note drawn in the review shows its changes');
	const dead = [];
	for (const name of ['Note 0300', 'Note 1500']) {
		at = await rowAt(name);
		if (!at) { dead.push(name + ' (no row)'); continue; }
		await p.click(at.x, at.y);
		await p.sleep(400);
		if (at.clickable && !(await shown(name))) dead.push(name);
	}
	say('review rows past the cap', { clicked: dead });
	t.eq(dead.length, 0, `a row offered as clickable shows its note’s changes (dead: ${dead.join(', ')}; the review draws only the first 201 notes, then counts the rest)`);
	await p.key('Escape');
}, 2 * MIN);

test('the review draws every change of a note that is first in the binder, past the cap it sets for the notes after', async (p, h, t) => {
	await replaceSetup(p, t, true);
	const r = await openReview(p);
	const order = await p.ev(`({ scenes: ${B}.scenes(app.vault.getAbstractFileByPath(${j(ROOT)})).slice(0, 3).map(f => f.basename), heads: [...document.querySelectorAll('${REVIEW} .binders-find-review-name')].slice(0, 3).map(e => e.textContent), contents: app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ROOT + '/' + ROOT + '.md')}))?.frontmatter?.contents?.slice(0, 3) ?? null })`);
	console.log('    fr11 order ' + JSON.stringify(order));
	const info = await reviewInfo(p);
	say('review, long note first', { opens_ms: r.ms, places_drawn: info?.places, fold: info?.fold, heads: info?.heads });
	t.ok(info, 'the review is open');
	t.ok(info.places <= 400, `the first note has 1,000 changes, and the review draws ${info.places} of them (the cap is 400 places, for the notes after the first)`);
	await p.key('Escape');
}, MIN);

// =====================================================================================================================
// Trouble in the middle
// =====================================================================================================================

test('replace all with the 300,000-character note open in its own tab and typed in: the typed text is kept, and the replace is made in what the editor holds', async (p, h, t) => {
	const T0 = Date.now();
	await build(p);
	console.log('    fr11 open-tab: built at ' + (Date.now() - T0) + ' ms');
	const path = `${ROOT}/${BIG}.md`;
	await p.ev(`(async () => { const leaf = app.workspace.getLeaf('tab'); await leaf.openFile(app.vault.getAbstractFileByPath(${j(path)})); app.workspace.setActiveLeaf(leaf, { focus: true }); return 1; })().then(() => 1)`);
	await p.sleep(800);
	await p.ev(`(() => { const v = app.workspace.activeLeaf?.view; v?.editor?.focus(); v?.editor?.setCursor({ line: 0, ch: 0 }); return 1; })()`);
	await p.type('ZZ');
	console.log('    fr11 open-tab: typed ZZ at ' + (Date.now() - T0) + ' ms');
	const saved = await until(p, `app.vault.adapter.read(${j(path)}).then(s => s.startsWith('ZZ'))`, 20000);
	t.ok(saved, 'the typed text is saved to disk');
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(400);
	console.log('    fr11 open-tab: bar ready at ' + (Date.now() - T0) + ' ms');
	await openBar(p, true);
	await typeQ(p, OLD);
	await click(p, `${BARSEL} .document-replace-input`);
	await p.type(NEW);
	await p.sleep(150);
	const before = notes(p);
	console.log('    fr11 open-tab: before read at ' + (Date.now() - T0) + ' ms');
	t.ok(before[path]?.startsWith('ZZQuorra 0 '), 'before the replace the note starts with the typed text');
	const ro = await openReview(p);
	t.ok(ro.ok, 'the review opens');
	const c = await confirm(p);
	t.ok(c.text && /^Replaced 5,000 in 2,001 notes\./.test(c.text), 'the bar says it replaced 5,000 in 2,001 notes: ' + c.text);
	await p.sleep(800);
	const after = notes(p);
	exact(t, before, after, toReplace, 'replace all with an open, typed-in note');
	t.ok(after[path].startsWith('ZZVesna 0 '), 'the typed text is still there, and the match after it is replaced');
	const inEditor = await p.ev(`(() => { const v = app.workspace.getLeavesOfType('markdown').map(l => l.view).find(v => v.file?.path === ${j(path)}); return v ? v.editor.getValue() === ${j(after[path])} : 'no tab'; })()`);
	t.ok(inEditor === true, 'and the open tab shows what is on disk: ' + inEditor);
}, 2 * MIN);

test('closing the bar while a replace all is running: every note is replaced once, and nothing fails', async (p, h, t) => {
	await replaceSetup(p, t);
	const before = notes(p);
	await openReview(p);
	await click(p, `${REVIEW} button.mod-cta`);
	await p.ev(`${BAR}.input.focus()`);
	await p.key('Escape');
	t.ok(!(await p.ev(`!!document.querySelector(${j(BARSEL)})`)), 'the bar closes at once');
	for (let i = 0; i < 240; i++) {
		await p.sleep(500);
		const left = Object.values(notes(p)).reduce((n, s) => n + (s.slice(front(s).length).split(OLD).length - 1), 0);
		if (left === 0) break;
	}
	await p.sleep(800);
	exact(t, before, notes(p), toReplace, 'replace all after the bar was closed');
}, 2 * MIN);

test('Escape at once after typing, and again while the search is under way: the bar closes, nothing is left behind, and a new search counts 5,000', async (p, h, t) => {
	await build(p);
	await openBar(p);
	await p.type(OLD);
	await p.key('Escape');
	await p.sleep(1200);
	t.ok(!(await p.ev(`!!document.querySelector(${j(BARSEL)})`)), 'closed before its search began');
	await openBar(p);
	await p.type(OLD);
	await p.sleep(180);
	await p.key('Escape');
	await p.sleep(1500);
	t.ok(!(await p.ev(`!!document.querySelector(${j(BARSEL)})`)), 'closed under way');
	t.ok(!(await p.ev(`!!${BAR}`)), 'and the view has no bar left in it');
	await openBar(p);
	await typeQ(p, OLD);
	t.ok(TAIL.test(await countText(p)), 'a new search counts 5,000 in 2,001 notes: ' + (await countText(p)));
}, MIN);

test('replace one match in the 300,000-character note: only that match changes, and the file is otherwise byte for byte as it was', async (p, h, t) => {
	await build(p);
	const path = `${ROOT}/${BIG}.md`;
	const before = notes(p);
	await openBar(p, true);
	await typeQ(p, 'Quorra 500 ');
	t.eq(await countText(p), '1 / 1 in 1 note', 'one match, in the long note');
	await click(p, `${BARSEL} .document-replace-input`);
	await p.type(NEW);
	await p.key('Enter');
	await until(p, `app.vault.adapter.read(${j(path)}).then(s => s.includes('${NEW}'))`, 20000);
	await p.sleep(800);
	const after = notes(p);
	t.eq(after[path], before[path].replace('Quorra 500 ', NEW), 'the long note is what it was, with its one match replaced');
	exact(t, before, after, (k, b) => (k === path ? b.replace('Quorra 500 ', NEW) : b), 'replace one');
}, 2 * MIN);

// =====================================================================================================================
// Memory, and a board
// =====================================================================================================================

const dom = (p) => p.ev(`document.getElementsByTagName('*').length`);
/** The heap after a garbage collection (the page's own count of what it holds; -1 if the page doesn't say). */
async function heap(p) {
	await p.send('HeapProfiler.collectGarbage').catch(() => {});
	await p.sleep(200);
	return p.ev(`performance.memory ? performance.memory.usedJSHeapSize : -1`);
}

test('memory: ten open and close cycles of the bar over this binder leave the page as it was, nodes and heap', async (p, h, t) => {
	await build(p);
	const rows = [];
	rows.push({ at: 'start', dom: await dom(p), heap_mb: Math.round((await heap(p)) / 1048576) });
	for (let i = 1; i <= 10; i++) {
		await openBar(p);
		await typeQ(p, OLD);
		const ok = TAIL.test(await countText(p));
		t.ok(ok, `cycle ${i}: the count is right`);
		await p.key('Escape');
		await until(p, `!document.querySelector(${j(BARSEL)})`, 5000);
		await p.sleep(300);
		rows.push({ at: i, dom: await dom(p), heap_mb: Math.round((await heap(p)) / 1048576) });
	}
	say('ten cycles', rows);
	const heaps = rows.map((r) => r.heap_mb);
	if (heaps[0] >= 0) t.ok(heaps[10] - heaps[3] <= 20, `the heap after cycle 10 is no more than 20 MB above cycle 3 (${heaps[3]} → ${heaps[10]} MB)`);
	t.ok(rows[10].dom - rows[3].dom <= 300, `the nodes after cycle 10 are no more than 300 above cycle 3 (${rows[3].dom} → ${rows[10].dom})`);
	t.ok(!(await p.ev(`!!document.querySelector(${j(BARSEL)})`)), 'and the bar is gone');
}, 2 * MIN);

test('the corkboard over 2,000 cards: the count says matches in notes, and Enter goes card to card', async (p, h, t) => {
	await build(p);
	const t0 = Date.now();
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	const drawn = await until(p, `document.querySelectorAll('${LEAF} .binders-card[data-path]').length > 0`, 120000);
	say('corkboard open', { ms: Date.now() - t0, drawn: !!drawn });
	t.ok(drawn, 'the corkboard draws its cards');
	await openBar(p);
	await typeQ(p, OLD);
	t.eq(await countText(p), '5,000 in 2,001 notes', 'the board’s count: matches, and in how many notes (no position)');
	const seen = [];
	const selected = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-selected')].map(c => c.dataset.path)`);
	for (let i = 0; i < 3; i++) {
		await p.key('Enter');
		await quiet(p, 300);
		seen.push((await selected()).join(','));
	}
	say('corkboard steps', { seen });
	t.eq(seen.join(' | '), [1, 2, 3].map((i) => `${ROOT}/Note ${String(i).padStart(4, '0')}.md`).join(' | '), 'three Enters take the selection to the next three notes, in order');
}, 2 * MIN);

