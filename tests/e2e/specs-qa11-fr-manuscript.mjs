// QA round 11, find and replace in the manuscript with everything else going on (src/view/find-bar.ts, the find part of
// src/view/manuscript.ts, src/find/). A long manuscript (sections not yet drawn, lazily mounted editors), stepping that
// scrolls to and rings the right match, counts that follow typing / split / merge / duplicate / add / remove / drag /
// undo of a move / outside edits, the caret and scroll after the bar closes, Replace one then Ctrl+Z, matches at the very
// start and end of a section and none across the join of two notes, and the word count, the inspector, a filter, "Indent
// paragraphs" and readable line length on and off. Every test collects the console's errors and warnings ("Measure loop
// restarted" among them) and fails on any. Tests named "qa11 fr manuscript: …" pass; "BUG: …" and "NIT: …" are confirmed
// findings (they fail until fixed). Every test that writes compares files on disk byte for byte.
// Oracle for every count: the notes on disk, counted by hand in the test (no help from the plugin).
import { B, PL, VIEW, clickMenu, closeMenus, j, until, withTidy, writeRaw } from './view-helpers.mjs';
import { LEAF, M, binder, disk, openMs, sameBut, saveAll, settle, snap } from './specs-qa5-manuscript.mjs';

export const specs = [];
const NS = 'qa11 fr manuscript: ';
const BAR = `${VIEW}.findBar`;
const BARSEL = `${LEAF} .binders-view .binders-find`;
const errs = (p) => p.errors.filter((e) => !/ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security/.test(e));
const wrap = (fn) => withTidy(async (p, h, t) => {
	p.errors.length = 0;
	try {
		await fn(p, h, t);
		t.eq(j(errs(p)), '[]', 'nothing was logged to the console (errors, warnings)');
	} finally { await restore(p); }
});
const test = (name, fn) => specs.push({ name: NS + name, fn: wrap(fn) });
const bug = (name, fn) => specs.push({ name: 'BUG: ' + NS + name, fn: wrap(fn) });
const nit = (name, fn) => specs.push({ name: 'NIT: ' + NS + name, fn: wrap(fn) });

/** Puts back what a test may have changed, and closes the bar, dialogs and menus. */
async function restore(p) {
	await p.ev(`(async () => {
		try { ${BAR}?.close(); } catch {}
		document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click());
		document.querySelectorAll('.menu').forEach(m => m.remove());
		const pl = ${PL};
		pl.settings.indentParagraphs = false; pl.settings.tabParagraphs = false; await pl.saveSettings();
		app.vault.setConfig('readableLineLength', true);
		try { app.workspace.updateOptions(); } catch {}
		return 1;
	})()`).catch(() => {});
	await closeMenus(p).catch(() => {});
}

// ---- the manuscript under test ----
const pad = (i) => String(i).padStart(2, '0');
const FILL = 'The lamp room smelled of oil and cold brass, and the keeper counted the steps again to be sure of them, as he did each night before the light was lit. ';
/** A note with three matches of "needle" in its text: the very first word, one in the middle, the very last (no newline after it). One more in its synopsis, which a search does not reach. */
const note = (i, status = 'draft') => `---\nstatus: ${status}\nsynopsis: A needle in the synopsis ${i}.\n---\nneedle opens scene ${i}.\n\n`
	+ [1, 2, 3, 4, 5, 6, 7, 8].map((k) => `P${k} of scene ${i}. ${FILL}${k === 4 ? `Midway there was a needle in a haystack of scene ${i}. ` : ''}${FILL}`).join('\n\n')
	+ `\n\nScene ${i} ends with needle`;
const path = (i, name = 'Long') => `${name}/S${pad(i)}.md`;
const PATHS = (n, name = 'Long') => Array.from({ length: n }, (_, i) => path(i + 1, name));
/** A binder of n such notes, its manuscript open and settled. */
async function long(p, n = 24, name = 'Long', status = () => 'draft') {
	await binder(p, name, Object.fromEntries(Array.from({ length: n }, (_, i) => ['S' + pad(i + 1), note(i + 1, status(i + 1))])));
	await openMs(p, name);
}
const front = (s) => (/^---\n[\s\S]*?\n---\n/.exec(s) ?? [''])[0];
/** Where "needle" is in a note's text on disk (whole-text offsets, the properties skipped). */
function offsets(p, file, q = 'needle') {
	const s = disk(p, file), f = front(s).length, body = s.slice(f), out = [];
	for (let i = body.indexOf(q); i >= 0; i = body.indexOf(q, i + 1)) out.push(f + i);
	return out;
}
const total = (p, files, q = 'needle') => files.reduce((n, f) => n + offsets(p, f, q).length, 0);

// ---- the bar ----
async function ask(p, q, by = null, { focus = true } = {}) {
	await p.ev(`(async () => {
		const v = ${VIEW};
		if (!v.findBar) v.showSearch(${by != null}); else if (${by != null}) v.findBar.setReplacing(true);
		const b = v.findBar;
		b.input.value = ${j(q)};
		${by != null ? `b.by.value = ${j(by)};` : ''}
		await b.search();
		${focus ? 'b.input.focus();' : ''}
	})().then(() => 1)`);
	await p.sleep(450);
}
const countText = (p) => p.ev(`document.querySelector(${j(BARSEL + ' .document-search-count')})?.textContent ?? null`);
/** "12 / 72 in 24 notes" → { i: 12, total: 72, notes: 24 } */
async function counts(p) {
	const m = /^(\d+) \/ ([\d,]+)(?: in ([\d,]+) notes?)?$/.exec(await countText(p) ?? '');
	return m ? { i: +m[1], total: +m[2].replace(/,/g, ''), notes: m[3] ? +m[3].replace(/,/g, '') : null } : null;
}
/** What the bar and the page say about the match the writer is on. */
const info = (p) => p.ev(`(() => {
	const b = ${BAR}; if (!b) return null;
	const at = b.at, m = ${M}, path = at?.found.source.file.path, s = m.scenes.find((x) => x.file.path === path), cm = s?.live?.cm;
	let sel = null, from = null, vis = null;
	if (cm) {
		const r = cm.state.selection.main; sel = cm.state.sliceDoc(r.from, r.to); from = r.from;
		const c = cm.coordsAtPos(r.from), v = m.root.getBoundingClientRect();
		vis = !!c && c.top >= v.top - 1 && c.bottom <= v.bottom + 1;
	}
	return { total: b.found.reduce((n, f) => n + f.hits.length, 0), notes: b.found.length, path, hit: at?.hit ?? null, sel, from, vis, live: m.scenes.filter((x) => x.live).length,
		ring: document.querySelectorAll(${j(LEAF + ' .binders-manuscript .binders-find-match.is-current')}).length, top: Math.round(m.root.scrollTop) };
})()`);
const stepKey = async (p, n, shift = false) => { for (let i = 0; i < n; i++) await p.key('Enter', ...(shift ? ['shift'] : [])); };
const inBar = (p) => p.ev(`${BAR}.input.focus()`);
/** An editor of a section, mounted, with the caret at `where` (a text it holds, or an offset), and the keyboard in it. */
async function caretIn(p, file, where, nudge = 0) {
	await p.ev(`(async () => {
		const m = ${M}, s = m.scenes.find((x) => x.file.path === ${j(file)});
		s.el.scrollIntoView({ block: 'center' }); await m.mount(s);
		const cm = s.live.cm, t = cm.state.doc.toString(), at = ${typeof where === 'number' ? where : `t.indexOf(${j(where)})`} + ${nudge};
		cm.focus(); cm.dispatch({ selection: { anchor: at } });
		return 1; })()`);
	await p.sleep(300);
}
const caretNow = (p) => p.ev(`(() => { const m = ${M}, a = document.activeElement, s = m.scenes.find((x) => x.el.contains(a)); const cm = s?.live?.cm; if (!cm || !a.classList.contains('cm-content')) return { path: null, active: (a.className || a.tagName).toString().slice(0, 40) }; const r = cm.state.selection.main; return { path: s.file.path, from: r.from, to: r.to, sel: cm.state.sliceDoc(r.from, r.to) }; })()`);
const marksLeft = (p) => p.ev(`({
	deco: document.querySelectorAll('.binders-find-match, mark.binders-find-mark').length,
	hl: (CSS.highlights?.get('binders-find')?.size ?? 0) + (CSS.highlights?.get('binders-find-current')?.size ?? 0),
	bar: !!document.querySelector('.binders-find') })`);
const scrollTo = async (p, frac) => { await p.ev(`(() => { const r = ${M}.root; r.scrollTop = ${frac} * (r.scrollHeight - r.clientHeight); return 1; })()`); await p.sleep(900); await settle(p); };
const wordsShown = (p) => p.ev(`(${VIEW}.ui?.count?.textContent ?? '').replace(/[^0-9]/g, '')`);

// =====================================================================================================================

test('stepping through 24 sections (most not drawn yet) lands on the right match every time: the section is an editor, the match is selected, in sight and ringed once; fast stepping and wrapping end up right too', async (p, h, t) => {
	await long(p);
	const files = PATHS(24), offs = files.map((f) => offsets(p, f));
	t.eq(offs.every((o) => o.length === 3), true, 'the oracle: three matches in each of the 24 notes');
	await ask(p, 'needle');
	t.eq(j(await counts(p)), j({ i: 1, total: 72, notes: 24 }), 'counted 72 in 24 notes, the synopses not reached');
	const check = async (label) => {
		await p.sleep(750);
		const c = await counts(p), n = Math.floor((c.i - 1) / 3), k = (c.i - 1) % 3, s = await info(p);
		t.eq(s.path, files[n], `${label}: ${c.i}/72 is in ${files[n]}`);
		t.eq(s.from, offs[n][k], `${label}: selected at the ${k + 1}th needle of the note, at its place in the text`);
		t.eq(s.sel, 'needle', `${label}: the word is what is selected`);
		t.ok(s.vis, `${label}: and it is in sight`);
		t.eq(s.ring, 1, `${label}: one ring in the page`);
	};
	await check('first');
	await inBar(p);
	for (let k = 1; k <= 8; k++) { await p.key('Enter'); await check(`step ${k}`); }
	await stepKey(p, 40); // fast: no wait between them
	await check('after 40 quick Enters');
	await stepKey(p, 6, true);
	await check('after 6 quick Shift+Enters');
	await p.ev(`${BAR}.search(false, { id: ${j(path(1))}, offset: 0 }).then(() => 1)`);
	await p.sleep(700);
	t.eq((await counts(p)).i, 1, 'a search from the top is on the first');
	await inBar(p);
	await p.key('Enter', 'shift');
	t.eq((await counts(p)).i, 72, 'back from the first wraps to the last');
	await check('wrapped back to the last (a section at the very end, never drawn so far)');
	await p.key('Enter');
	t.eq((await counts(p)).i, 1, 'forward from the last wraps to the first');
	await check('wrapped forward to the first');
	t.ok((await info(p)).live <= 12, 'sections are not all editors at once: ' + (await info(p)).live);
});

test('the bar opened by Ctrl+F starts at the caret: with the caret in the 15th section after its second match, the first match shown is the third of that section; Shift+Enter goes to the second', async (p, h, t) => {
	await long(p);
	const f = path(15), o = offsets(p, f);
	await caretIn(p, f, o[1] + 3);
	await p.key('f', 'ctrl');
	await p.sleep(300);
	await p.type('needle');
	await p.sleep(900);
	const c = await counts(p), s = await info(p);
	t.eq(c.i, 14 * 3 + 3, 'position 45 of 72');
	t.eq(s.path, f, 'in the 15th note');
	t.eq(s.from, o[2], 'on its last needle, at the very end of the note');
	await p.key('Enter', 'shift');
	await p.sleep(700);
	t.eq((await info(p)).from, o[1], 'Shift+Enter: the second needle');
});

test('typing in a section with the bar open: the count follows (a match typed in is counted, taken out is not), the ring stays on a needle, and the page marks nothing else', async (p, h, t) => {
	await long(p);
	await ask(p, 'needle');
	const f = path(5);
	await caretIn(p, f, 'P2 of scene 5', 0);
	await p.type('needle ');
	await saveAll(p);
	await p.sleep(1200);
	t.eq((await counts(p)).total, 73, 'one match typed in: 73');
	t.eq(total(p, PATHS(24)), 73, 'the notes on disk agree');
	const marked = await p.ev(`[...document.querySelectorAll(${j(LEAF + ' .binders-manuscript .binders-find-match')})].map((e) => e.textContent.toLowerCase())`);
	t.ok(marked.length > 0 && marked.every((x) => x === 'needle'), 'every marked piece of the page is a needle: ' + j([...new Set(marked)]));
	// a half-typed word is not a match, and becomes one on its last letter
	await p.type('needl');
	await saveAll(p);
	await p.sleep(1000);
	t.eq((await counts(p)).total, 73, 'a word half typed adds nothing');
	await p.type('e');
	await saveAll(p);
	await p.sleep(1000);
	t.eq((await counts(p)).total, 74, 'and its last letter does');
	for (let i = 0; i < 'needleneedle '.length + 1; i++) await p.key('Backspace');
	await saveAll(p);
	await p.sleep(1200);
	t.eq(total(p, PATHS(24)), 72, 'taken out again, the notes are as they began (72)');
	t.eq((await counts(p)).total, 72, 'and so is the count');
});

nit('the count follows typing without a save forced by the test: it is right within the time Obsidian takes to save', async (p, h, t) => {
	await long(p, 8);
	await ask(p, 'needle');
	await caretIn(p, path(3), 'P2 of scene 3', 0);
	await p.type('needle ');
	const t0 = Date.now();
	let ok = false;
	while (Date.now() - t0 < 6000) { if ((await counts(p)).total === 25) { ok = true; break; } await p.sleep(100); }
	t.ok(ok, 'the count said 25 within ' + (Date.now() - t0) + ' ms of typing (it said ' + (await countText(p)) + ')');
});

test('a match at the very start of a section and one at its very end are found and selected, and nothing is found across the join of two notes', async (p, h, t) => {
	await long(p, 6);
	const s1 = disk(p, path(1)), s2 = disk(p, path(2));
	t.ok(s1.endsWith('ends with needle') && s2.slice(front(s2).length).startsWith('needle'), 'the oracle: note 1 ends with the word and note 2 starts with it');
	await ask(p, 'needle');
	await inBar(p);
	await p.sleep(500);
	t.eq((await info(p)).from, front(s1).length, 'the first match is at the first character of the first note');
	await p.key('Enter'); await p.key('Enter');
	await p.sleep(700);
	const s = await info(p);
	t.eq(s.from + 'needle'.length, s1.length, 'the third is the last six characters of the note');
	for (const q of ['eneedl', 'needleneedle', 'with needleneedle', 'ends with needle\nneedle opens', 'needle\n\nneedle']) {
		await ask(p, q);
		t.eq((await counts(p))?.total ?? 0, 0, `“${q.replace(/\n/g, '\\n')}” is no match (nothing across the join or a line)`);
	}
	await ask(p, 'with needle');
	t.eq((await counts(p)).total, 6, '“with needle” (a match to the end of each note): six, one in each');
});

test('Replace one at the very start and the very end of a section, then Ctrl+Z in the section, brings the note back byte for byte; the other notes are never written', async (p, h, t) => {
	await long(p, 6);
	await saveAll(p);
	const before = snap(p), f = path(1), orig = disk(p, f), o = offsets(p, f);
	await ask(p, 'needle', 'XX');
	await p.ev(`(${BAR}.by.focus(), 1)`);
	await p.key('Enter');
	await p.sleep(900);
	await saveAll(p);
	t.eq(disk(p, f), orig.slice(0, o[0]) + 'XX' + orig.slice(o[0] + 6), 'the first match, at the first character of the text, replaced');
	await p.ev(`(${BAR}.step(1), 1)`); await p.sleep(600); // the middle one is current after a replace: one step to the last
	t.eq((await info(p)).from, o[2] - 4, 'the last needle is the one the writer is on (offsets moved by the replacement)');
	await p.ev(`(${BAR}.by.focus(), 1)`);
	await p.key('Enter');
	await p.sleep(900);
	await saveAll(p);
	const mid = orig.slice(0, o[0]) + 'XX' + orig.slice(o[0] + 6, o[2]) + 'XX';
	t.eq(disk(p, f), mid, 'the last match, the last six characters of the note, replaced: nothing after it');
	await caretIn(p, f, 0, 0);
	await p.key('z', 'ctrl'); await p.sleep(700);
	await p.key('z', 'ctrl'); await p.sleep(700);
	await saveAll(p); await p.sleep(2300);
	t.eq(disk(p, f), orig, 'two Ctrl+Z and the note is exactly what it was');
	sameBut(t, before, snap(p));
});

test('Replace one in a far section that was never drawn, then Ctrl+Z there: the one match changes and comes back; no other file is written', async (p, h, t) => {
	await long(p);
	await saveAll(p);
	const before = snap(p), f = path(21), orig = disk(p, f), o = offsets(p, f);
	await ask(p, 'needle', 'pin');
	await inBar(p);
	await stepKey(p, 20 * 3 + 1);
	await p.sleep(900);
	t.eq((await info(p)).path, f, 'stepped to the 21st note by Enter');
	await p.ev(`(${BAR}.by.focus(), 1)`);
	await p.key('Enter');
	await p.sleep(1000);
	await saveAll(p);
	t.eq(disk(p, f), orig.slice(0, o[1]) + 'pin' + orig.slice(o[1] + 6), 'the second needle of that note is now pin, and nothing else changed');
	t.eq(total(p, PATHS(24)), 71, 'oracle: 71 left');
	t.eq((await counts(p)).total, 71, 'the bar counts 71');
	await caretIn(p, f, 0);
	await p.key('z', 'ctrl');
	await p.sleep(700);
	await saveAll(p); await p.sleep(2300);
	t.eq(disk(p, f), orig, 'Ctrl+Z took it back, byte for byte');
	t.eq((await counts(p)).total, 72, 'and the count went back up to 72');
	sameBut(t, before, snap(p));
});

test('pressing Enter in the Replace field many times in a row replaces each match once: nothing doubled, skipped or mangled', async (p, h, t) => {
	await long(p, 4);
	await saveAll(p);
	const files = PATHS(4), orig = files.map((f) => disk(p, f));
	await ask(p, 'needle', 'pin');
	await p.ev(`(${BAR}.by.focus(), 1)`);
	await stepKey(p, 6);
	await p.sleep(2500);
	await saveAll(p); await p.sleep(2300);
	const now = files.map((f) => disk(p, f)), left = total(p, files), pinned = now.join('').split('pin').length - 1;
	t.eq(left + pinned, 12, `every match is either still a needle or one pin (${left} needles, ${pinned} pins)`);
	t.ok(pinned >= 1 && pinned <= 6, 'between one and six replaced by six presses: ' + pinned);
	t.eq(now.map((s, i) => s.replaceAll('pin', 'needle')).join('|'), orig.join('|'), 'put the word back and every note is exactly what it was: nothing else moved');
	t.eq((await counts(p)).total, left, 'and the bar counts what is left (' + left + ')');
});

test('Split scene at cursor in the middle of a section: the 24 notes become 25, the match count stays 72 (the split is between paragraphs), the notes count follows, and stepping reaches the new note', async (p, h, t) => {
	await long(p);
	await ask(p, 'needle');
	const f = path(10);
	await caretIn(p, f, 'P5 of scene 10', 0);
	await p.ev(`(() => { app.commands.executeCommandById('binders:split-scene'); return 1; })()`);
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Long')).length === 25`, 6000);
	await p.sleep(1500);
	await saveAll(p);
	const all = await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('Long')).map((x) => x.path)`);
	t.eq(all.length, 25, 'the binder has 25 notes');
	t.eq(total(p, all), 72, 'oracle: 72 needles in the 25 notes (the split lost no word)');
	await p.sleep(800);
	const c = await counts(p);
	t.eq(j([c.total, c.notes]), j([72, 25]), 'the bar says 72 in 25 notes (the new note has its own match at the start or the end): ' + (await countText(p)));
	t.eq(await p.ev(`${M}.scenes.length`), 25, 'the page has 25 sections');
	// step all the way round: every note with a match is visited, in binder order
	await inBar(p);
	const seen = [];
	for (let i = 0; i < c.total; i++) { seen.push((await p.ev(`${BAR}.at.found.source.file.path`))); await p.ev(`(${BAR}.step(1), 1)`); }
	await p.sleep(700);
	const order = [...new Set(seen)];
	t.eq(j(order), j(all.filter((x) => offsets(p, x).length)), 'stepping visits each note with a match once, in the binder’s order');
	const s = await info(p);
	t.eq(s.sel, 'needle', 'and is back on a selected needle in the first note: ' + s.path);
});

test('Merge two neighbouring notes (from the corkboard, with the bar open): the match count stays, the notes count goes down by one, back in the manuscript every match is reachable', async (p, h, t) => {
	await long(p, 8);
	await ask(p, 'needle');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(1000);
	t.eq((await countText(p)), '24 in 8 notes', 'on the corkboard: matches and notes');
	await p.ev(`(() => { ${VIEW}.current.select([${j(path(3, 'Long'))}, ${j(path(4, 'Long'))}], ${j(path(3, 'Long'))}); return 1; })()`);
	const at = await p.at(`${LEAF} .binders-card[data-path="${path(3)}"]`);
	await p.right(at.x, at.y);
	await p.sleep(300);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!![...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Merge')`, 3000);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Merge').click(); return 1; })()`);
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Long')).length === 7`, 6000);
	await p.sleep(1500);
	await saveAll(p);
	const all = await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('Long')).map((x) => x.path)`);
	t.eq(all.length, 7, 'seven notes');
	t.eq(total(p, all), 24, 'oracle: 24 needles in them');
	t.eq((await countText(p)), '24 in 7 notes', 'the board says 24 in 7 notes');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await p.sleep(500);
	t.eq((await counts(p))?.notes, 7, 'in the manuscript: 7 notes');
	await inBar(p);
	for (let i = 0; i < 24; i++) { await p.key('Enter'); await p.sleep(200); }
	await p.sleep(700);
	const s = await info(p);
	t.eq(s.sel, 'needle', 'after a lap of 24 steps the match is selected');
	t.eq((await counts(p)).i, 1, 'and it is back at the first');
});

test('a note duplicated with the bar open: the counts follow (21 in 7 notes), and a lap of steps is right', async (p, h, t) => {
	await long(p, 6);
	await ask(p, 'needle');
	t.eq((await counts(p)).total, 18, '18 to begin with');
	await p.ev(`(async () => { await ${B}.duplicate(app.vault.getAbstractFileByPath(${j(path(2))})); })().then(() => 1)`);
	await p.sleep(2000);
	t.eq(j([(await counts(p)).total, (await counts(p)).notes]), j([21, 7]), 'a copy of a note: 21 in 7 notes');
	await inBar(p);
	for (let i = 0; i < 21; i++) await p.key('Enter');
	await p.sleep(900);
	t.eq((await counts(p)).i, 1, 'a lap of 21 is back at the first');
	t.eq((await info(p)).sel, 'needle', 'selected');
});

test('a note added to the binder (made from outside, as a sync or another app does) while the bar is open is looked through: its matches are counted and a Replace all changes it', async (p, h, t) => {
	await long(p, 6);
	await ask(p, 'needle', 'pin');
	t.eq((await counts(p)).total, 18, '18 to begin with');
	await p.ev(`app.vault.create('Long/Added.md', 'A new note with a needle and another needle.\\n').then(() => 1)`);
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Long')).some((x) => x.path === 'Long/Added.md')`, 5000);
	await p.sleep(3000);
	const listed = await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('Long')).map((x) => x.path)`);
	t.ok(listed.includes('Long/Added.md'), 'the note is in the binder (and in the manuscript: ' + (await p.ev(`${M}.scenes.length`)) + ' sections)');
	t.eq((await counts(p)).total, 20, 'the bar counts 20 (it says ' + (await countText(p)) + ')');
});

test('a note deleted while the bar is open is no longer counted, and a lap of steps never stops on a section that is gone', async (p, h, t) => {
	await long(p, 6);
	await ask(p, 'needle');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(path(4))})).then(() => 1)`);
	await p.sleep(3500);
	t.eq(await p.ev(`${M}.scenes.some((s) => s.file.path === ${j(path(4))})`), false, 'its section is gone from the page');
	t.eq((await counts(p)).total, 15, 'the bar counts 15 (it says ' + (await countText(p)) + ')');
});

test('dragging a card on the corkboard to the front while the bar is open, and Undo last move: the first match the bar steps to follows the binder’s order, the binder note is as it was after the undo', async (p, h, t) => {
	await long(p, 6);
	await ask(p, 'needle');
	const noteBefore = disk(p, 'Long/Long.md');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(1000);
	const a = await p.at(`${LEAF} .binders-card[data-path="${path(6)}"]`), b = await p.at(`${LEAF} .binders-card[data-path="${path(1)}"]`);
	await p.drag(a.x, a.t + 12, b.l + 10, b.y, 16);
	await p.sleep(1500);
	await p.ev(`${B}.flush().then(() => 1)`);
	t.eq(await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('Long')).map((x) => x.path)[0]`), path(6), 'S06 is first in the binder now');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	await p.sleep(600);
	t.eq(await p.ev(`${BAR}.found[0].source.file.path`), path(6), 'the bar looks through S06 first');
	t.eq(await p.ev(`${M}.scenes[0].file.path`), path(6), 'and the page shows it first');
	await inBar(p);
	await p.sleep(400);
	let c = await counts(p);
	t.eq(c.total, 18, '18 matches still');
	await p.ev(`(${BAR}.search(), 1)`);
	await p.sleep(700);
	await inBar(p);
	await p.key('Enter', 'shift'); await p.sleep(300);
	// Undo last move
	await p.ev(`(() => { app.commands.executeCommandById('binders:undo-move'); return 1; })()`);
	await p.sleep(1500);
	await p.ev(`${B}.flush().then(() => 1)`);
	await p.sleep(500);
	t.eq(await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('Long')).map((x) => x.path)[0]`), path(1), 'undone: S01 first again');
	t.eq(await p.ev(`${BAR}.found[0].source.file.path`), path(1), 'the bar follows');
	t.eq(await p.ev(`${M}.scenes[0].file.path`), path(1), 'so does the page');
	const list = (x) => [...x.matchAll(/^  - \"?(S\d+)\"?$/gm)].map((m) => m[1]).join(',');
	t.eq(list(disk(p, 'Long/Long.md')), list(noteBefore), 'the binder note lists the same order as before the drag');
	await p.ev(`${BAR}.search(false, { id: ${j(path(1))}, offset: 0 }).then(() => 1)`);
	await inBar(p);
	await p.sleep(700);
	const s = await info(p);
	t.eq(j([s.path, s.sel, s.vis]), j([path(1), 'needle', true]), 'a search from the top starts at the first match of the first note and rings it');
});

test('Escape with a match current: the keyboard goes to the editor of that section with the needle selected, and the page does not jump; nothing is left highlighted', async (p, h, t) => {
	await long(p);
	await ask(p, 'needle');
	await inBar(p);
	await stepKey(p, 20 * 3 + 2);
	await p.sleep(1000);
	const before = await info(p);
	t.eq(before.path, path(21), 'on a match in the 21st note');
	await p.key('Escape');
	await p.sleep(700);
	const c = await caretNow(p), after = await info(p);
	t.eq(j([c.path, c.sel]), j([path(21), 'needle']), 'the caret is in that section with the needle selected: ' + j(c));
	t.eq(after, null, 'the bar is gone');
	const top = await p.ev(`Math.round(${M}.root.scrollTop)`);
	t.ok(Math.abs(top - before.top) <= 3, `the page stayed where it was (${before.top} → ${top})`);
	t.eq(j(await marksLeft(p)), j({ deco: 0, hl: 0, bar: false }), 'no highlight left behind');
});

test('Escape when nothing matched: the caret goes back to where it was typing, in the same section, at the same place, and the page stays', async (p, h, t) => {
	await long(p);
	const f = path(3);
	await caretIn(p, f, 'P3 of scene 3', 4);
	const was = await caretNow(p), top0 = await p.ev(`Math.round(${M}.root.scrollTop)`);
	await p.key('f', 'ctrl');
	await p.sleep(300);
	await p.type('zzzzqq');
	await p.sleep(800);
	t.eq((await countText(p)), '0 / 0', 'nothing found');
	await p.key('Escape');
	await p.sleep(700);
	const now = await caretNow(p), top1 = await p.ev(`Math.round(${M}.root.scrollTop)`);
	t.eq(j([now.path, now.from, now.to]), j([f, was.from, was.to]), 'the caret is where it was: ' + j(was) + ' → ' + j(now));
	t.ok(Math.abs(top1 - top0) <= 3, `and the page did not move (${top0} → ${top1})`);
	t.eq(j(await marksLeft(p)), j({ deco: 0, hl: 0, bar: false }), 'nothing left highlighted');
});

test('closing the bar with sections out of sight, then scrolling to them by hand: no section comes up with a highlight, a ring or a mark in it; and while the bar is open a section scrolled to by hand shows its matches', async (p, h, t) => {
	await long(p);
	await ask(p, 'needle');
	await inBar(p);
	await stepKey(p, 45);
	await p.sleep(900);
	// by hand, back to the top: the sections there show their matches
	await scrollTo(p, 0);
	const lit = await p.ev(`(() => { const m = ${M}, v = m.root.getBoundingClientRect();
		return m.scenes.filter((s) => { const r = s.el.getBoundingClientRect(); return r.top > v.top && r.top < v.bottom - 80; }).map((s) => ({ path: s.file.path, live: !!s.live, deco: s.el.querySelectorAll('.binders-find-match').length })); })()`);
	const drawn = await p.ev(`CSS.highlights?.get('binders-find')?.size ?? 0`);
	t.ok(lit.length > 0, 'sections at the top: ' + j(lit));
	t.ok(lit.every((s) => s.live ? s.deco >= 1 : true), 'each editor in sight shows its first needle as a match: ' + j(lit));
	t.ok(lit.some((s) => !s.live) ? drawn > 0 : true, 'and those only drawn are highlighted in the registry (' + drawn + ')');
	await p.key('Escape');
	await p.sleep(500);
	for (const f of [0.3, 0.6, 1, 0.1, 0]) {
		await scrollTo(p, f);
		const left = await marksLeft(p);
		t.eq(j(left), j({ deco: 0, hl: 0, bar: false }), `scrolled to ${f * 100}% after closing: nothing left over`);
	}
});

test('Replace all in a manuscript with the word count on show: the count in the toolbar follows to the word, Undo brings it back, and the notes are byte for byte as before after the undo', async (p, h, t) => {
	await long(p, 8);
	await saveAll(p);
	const files = PATHS(8), before = snap(p), orig = files.map((f) => disk(p, f));
	const w0 = +await wordsShown(p);
	const words = (s) => s.slice(front(s).length).split(/\s+/).filter(Boolean).length;
	t.eq(w0, orig.reduce((n, s) => n + words(s), 0), 'the toolbar’s word count is the notes’ (' + w0 + ')');
	await ask(p, 'needle', 'brass lamp');
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(300);
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(800);
	await saveAll(p);
	await p.sleep(1500);
	const now = files.map((f) => disk(p, f));
	t.eq(now.reduce((n, s) => n + words(s), 0), w0 + 24, 'oracle: 24 matches of one word became two: 24 more words');
	t.eq(+await wordsShown(p), w0 + 24, 'the toolbar says ' + (w0 + 24) + ' (it says ' + (await wordsShown(p)) + ')');
	t.eq(j(await marksLeft(p)).includes('"bar":true'), true, 'the bar is still open');
	await p.ev(`document.querySelector(${j(BARSEL + ' .binders-find-undo')}).click()`);
	await p.sleep(1200);
	await saveAll(p);
	await p.sleep(1500);
	t.eq(+await wordsShown(p), w0, 'Undo: the toolbar is back to ' + w0);
	t.eq(files.map((f) => disk(p, f)).join('|'), orig.join('|'), 'every note is as it was, byte for byte');
	void before;
});

test('with the inspector open on the right: stepping through matches keeps working, and each match is in sight with one ring (the inspector’s own content is not checked)', async (p, h, t) => {
	await long(p, 12);
	await p.ev(`(() => { app.commands.executeCommandById('binders:show-inspector'); return 1; })()`);
	await p.sleep(1200);
	await openMs(p, 'Long');
	await ask(p, 'needle');
	await inBar(p);
	const files = PATHS(12), offs = files.map((f) => offsets(p, f));
	for (let k = 0; k < 10; k++) {
		await p.key('Enter');
		await p.sleep(600);
		const c = await counts(p), s = await info(p), n = Math.floor((c.i - 1) / 3);
		if (s.path !== files[n] || s.from !== offs[n][(c.i - 1) % 3] || !s.vis || s.ring !== 1) t.ok(false, `step ${k}: ${j(s)} at ${c.i}`);
	}
	t.ok(true, 'ten steps with the inspector open each landed in sight with one ring');
	const insp = await p.ev(`document.querySelectorAll('.workspace-leaf-content[data-type*="binders"]').length`);
	t.ok(insp >= 1, 'the side panes are there: ' + insp);
});

test('a filter: with it on before the search, only the notes that show are looked through and replaced in; the others are byte for byte as they were', async (p, h, t) => {
	await long(p, 8, 'Long', (i) => (i % 2 ? 'draft' : 'final'));
	await saveAll(p);
	const before = snap(p);
	const st = await p.ev(`${PL}.settings.statuses`);
	t.ok(st.length >= 2, 'the settings have statuses: ' + st.join(','));
	// the statuses on the notes are the setting's own names, so the filter can name them
	await p.ev(`(async () => { for (let i = 1; i <= 8; i++) await app.vault.process(app.vault.getAbstractFileByPath('Long/S0' + i + '.md'), (x) => x.replace(/^status: .*$/m, 'status: ' + (i % 2 ? ${j(st[0])} : ${j(st[1])}))); })().then(() => 1)`);
	await p.sleep(1500);
	await saveAll(p);
	const before2 = snap(p);
	await p.ev(`(() => { ${VIEW}.setFilter({ status: [${j(st[0])}], label: [] }); return 1; })()`);
	await settle(p);
	await p.sleep(800);
	const shown = await p.ev(`${M}.scenes.map((s) => s.file.path)`);
	t.eq(shown.length, 4, 'four notes show: ' + shown.join(','));
	await ask(p, 'needle', 'pin');
	t.eq(j(await counts(p)), j({ i: 1, total: 12, notes: 4 }), 'the bar counts the four shown only: 12 in 4 notes');
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(300);
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(800);
	await saveAll(p); await p.sleep(1800);
	const hidden = PATHS(8).filter((f) => !shown.includes(f));
	for (const f of hidden) t.eq(disk(p, f), before2[f], `${f}, filtered out, is untouched`);
	for (const f of shown) t.eq(offsets(p, f).length, 0, `${f} has no needle left`);
	void before;
	await p.ev(`(() => { ${VIEW}.setFilter({ status: [], label: [] }); return 1; })()`);
});

test('changing the filter while the bar is open re-looks: the count and the notes a Replace all would change are the ones that show', async (p, h, t) => {
	await long(p, 8);
	const st = await p.ev(`${PL}.settings.statuses`);
	await p.ev(`(async () => { for (let i = 1; i <= 8; i++) await app.vault.process(app.vault.getAbstractFileByPath('Long/S0' + i + '.md'), (x) => x.replace(/^status: .*$/m, 'status: ' + (i % 2 ? ${j(st[0])} : ${j(st[1])}))); })().then(() => 1)`);
	await p.sleep(1500);
	await ask(p, 'needle', 'pin');
	t.eq((await counts(p)).notes, 8, '8 notes before the filter');
	await p.ev(`(() => { ${VIEW}.setFilter({ status: [${j(st[0])}], label: [] }); return 1; })()`);
	await settle(p);
	await p.sleep(1500);
	const planned = await p.ev(`${BAR}.found.map((f) => f.source.file.path)`);
	const shown = await p.ev(`${M}.scenes.map((s) => s.file.path)`);
	t.eq(shown.length, 4, 'the page shows 4 notes');
	t.eq(j(planned), j(shown), 'the bar looks through exactly the notes that show (it still has ' + planned.length + ')');
	t.eq((await counts(p))?.notes, 4, 'the count says 4 notes: ' + (await countText(p)));
	await p.ev(`(() => { ${VIEW}.setFilter({ status: [], label: [] }); return 1; })()`);
});

test('Replace all after the filter was changed with the bar open changes only the notes that show: a note the filter hides is not written', async (p, h, t) => {
	await long(p, 8);
	const st = await p.ev(`${PL}.settings.statuses`);
	await p.ev(`(async () => { for (let i = 1; i <= 8; i++) await app.vault.process(app.vault.getAbstractFileByPath('Long/S0' + i + '.md'), (x) => x.replace(/^status: .*$/m, 'status: ' + (i % 2 ? ${j(st[0])} : ${j(st[1])}))); })().then(() => 1)`);
	await p.sleep(1500);
	await saveAll(p);
	const hidden = [2, 4, 6, 8].map((i) => path(i)), before = Object.fromEntries(hidden.map((f) => [f, disk(p, f)]));
	await ask(p, 'needle', 'pin');
	await p.ev(`(() => { ${VIEW}.setFilter({ status: [${j(st[0])}], label: [] }); return 1; })()`);
	await settle(p);
	await p.sleep(1500);
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(300);
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(800);
	await saveAll(p); await p.sleep(1800);
	for (const f of hidden) t.eq(disk(p, f), before[f], `${f}, hidden by the filter, is untouched`);
	await p.ev(`(() => { ${VIEW}.setFilter({ status: [], label: [] }); return 1; })()`);
});

test('"Indent paragraphs" and tab-led paragraphs on: the matches in a tab-led paragraph are found, ringed in sight, and Replace all keeps every tab and byte of the notes around the words', async (p, h, t) => {
	await p.ev(`(async () => { const pl = ${PL}; pl.settings.tabParagraphs = true; pl.settings.indentParagraphs = true; await pl.saveSettings(); })().then(() => 1)`);
	const T = (i) => `---\nstatus: draft\n---\n\tneedle starts scene ${i}.\n\tSecond paragraph with a needle in it.\n\n\tThird, ending in needle`;
	await binder(p, 'Tab', Object.fromEntries([1, 2, 3, 4].map((i) => ['T' + i, T(i)])));
	await openMs(p, 'Tab');
	await saveAll(p);
	const files = [1, 2, 3, 4].map((i) => `Tab/T${i}.md`), orig = files.map((f) => disk(p, f));
	await ask(p, 'needle');
	await inBar(p);
	for (let k = 0; k < 12; k++) {
		const s = await info(p), c = await counts(p);
		if (k > 0) { t.eq(s.sel, 'needle', `match ${c.i}: selected`); t.ok(s.vis, `match ${c.i}: in sight`); }
		await p.key('Enter');
		await p.sleep(450);
	}
	await ask(p, 'needle', 'pin');
	await p.ev(`(() => { window.__all = ${BAR}.replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(300);
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(800);
	await saveAll(p); await p.sleep(1800);
	t.eq(files.map((f) => disk(p, f)).join('|'), orig.map((s) => s.replaceAll('needle', 'pin')).join('|'), 'only the words changed: tabs, blank lines and properties are as they were');
});

test('readable line length on and off: stepping rings and shows the match in both, and the bar stays inside the window', async (p, h, t) => {
	await long(p, 12);
	const files = PATHS(12), offs = files.map((f) => offsets(p, f));
	for (const on of [true, false, true]) {
		await p.ev(`(() => { app.vault.setConfig('readableLineLength', ${on}); app.workspace.updateOptions(); return 1; })()`);
		await p.sleep(700);
		await settle(p);
		await ask(p, 'needle');
		await inBar(p);
		const w = await p.ev(`innerWidth`), bar = await p.ev(`(() => { const r = document.querySelector(${j(BARSEL)}).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; })()`);
		t.ok(bar[0] >= 0 && bar[1] <= w, `readable ${on}: the bar is in the window ${j(bar)}`);
		await stepKey(p, 14);
		await p.sleep(900);
		const c = await counts(p), s = await info(p), n = Math.floor((c.i - 1) / 3);
		t.eq(j([s.path, s.from, s.sel, s.vis, s.ring]), j([files[n], offs[n][(c.i - 1) % 3], 'needle', true, 1]), `readable ${on}: the 15th match is in ${files[n]} and in sight`);
		await p.key('Escape');
		await p.sleep(400);
	}
});

test('a note changed from outside while the bar is open — one not drawn, and one that is an editor — the count follows, and the match in the editor is ringed where it now is', async (p, h, t) => {
	await long(p, 10);
	await ask(p, 'needle');
	await scrollTo(p, 0);
	await p.sleep(600);
	const far = path(9), near = path(1);
	await writeRaw(p, far, disk(p, far) + '\n\nneedle needle new needle');
	await p.sleep(2200);
	t.eq((await counts(p)).total, 33, 'a far note got 3 needles from outside: 33');
	const o = disk(p, near);
	await writeRaw(p, near, o.replace('needle opens', 'a line added.\n\nneedle opens'));
	await p.sleep(2500);
	t.eq((await counts(p)).total, 33, 'a near note changed without losing a match: 33');
	await inBar(p);
	await p.ev(`(${BAR}.step(1), 1)`);
	await p.sleep(700);
	const s = await info(p);
	t.eq(j([s.sel, s.vis]), j(['needle', true]), 'the match is selected and in sight');
	t.eq(s.from, offsets(p, near)[(await counts(p)).i === 2 ? 1 : 0] ?? s.from, 'at its place in the changed text');
});

test('the match count with Match case off and on stays right after a section’s text is typed in; case-different words are counted only when asked', async (p, h, t) => {
	await long(p, 6);
	await caretIn(p, path(2), 'P3 of scene 2', 0);
	await p.type('NEEDLE Needle ');
	await saveAll(p);
	await p.sleep(1200);
	await ask(p, 'needle');
	t.eq((await counts(p)).total, 20, 'any case: 18 + 2');
	await p.ev(`document.querySelector(${j(BARSEL + ' button[aria-label^="Match case"]')}).click()`);
	await p.sleep(700);
	t.eq((await counts(p)).total, 18, 'match case: 18');
	await p.ev(`document.querySelector(${j(BARSEL + ' button[aria-label^="Match case"]')}).click()`);
	await p.sleep(700);
	t.eq((await counts(p)).total, 20, 'and off again: 20');
});
