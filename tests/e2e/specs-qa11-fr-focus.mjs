// QA round 11: Find in focus mode, with "Show the scenes before and after" on and off (src/focus/find.ts, src/view/find-bar.ts,
// src/find/highlight.ts, src/find/replace.ts). specs-find-replace.mjs covers the focus bar's basic look-through and its
// Replace all with a snapshot; these go where it doesn't: stepping across the three sources, the first and last scene,
// the option off, leaving focus with the bar open, Escape, a click on a neighbour, Replace one (in the note, and on a
// neighbour's match), the review's count, tab paragraphs and indented paragraphs, and typing while the bar is open.
// Every test that writes compares the vault byte for byte (snapshots aside). Tests named "qa11 focus find: …".
import { PL, VIEW, file, j, until, withTidy } from './view-helpers.mjs';
import { binder, disk, snap } from './specs-qa5-manuscript.mjs';

export const specs = [];
const NV = 'app.workspace.getMostRecentLeaf().view';
const ED = `${NV}.editor`;
const OFF = { focusNeighbours: false, tabParagraphs: true, indentParagraphs: false };
const inFocus = (p) => p.ev(`document.body.classList.contains('binders-focus')`);
const bar = (p) => p.ev(`!!document.querySelector('.binders-find-in-note')`);
const ownBar = (p) => p.ev(`!!document.querySelector('.document-search-container:not(.binders-find)')`);
const count = (p) => p.ev(`document.querySelector('.binders-find-in-note .document-search-count')?.textContent ?? null`);
const total = (s) => Number((/\/ (\d+)/.exec(s ?? '') ?? [])[1]);
/** The bar's own state: its query and each source's hits, and where the writer is (source id and hit). */
const state = (p) => p.ev(`(() => { const b = ${NV}.bindersFind?.(); if (!b) return null; return { q: b.input.value, found: b.found.map(f => [f.source.id, f.hits.length]), at: b.at ? [b.at.found.source.id, b.at.hit] : null }; })()`);
const vault = (p) => Object.fromEntries(Object.entries(snap(p)).filter(([k]) => !/(^|\/)Snapshots\//.test(k)));
/** A bar's hit as the tests name it: “before”, “note” or “after”, and the hit's index in it. */
const where = (s) => `${s.at[0] === 'before' || s.at[0] === 'after' ? s.at[0] : 'note'}:${s.at[1]}`;
const snapsOf = (p, needle) => p.ev(`app.vault.getFiles().filter(f => /(^|\\/)Snapshots\\//.test(f.path) && f.path.includes(${j(needle)})).map(f => f.path)`);
/** Every file but the ones named is byte for byte what it was; `changes` maps the ones that should differ to what they should be. */
function onlyThese(t, before, after, changes = {}) {
	for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (k in changes) t.eq(after[k], changes[k], `“${k}” is exactly what the replace should have made it`);
		else t.eq(after[k], before[k], `“${k}” is untouched, byte for byte`);
	}
}

/** Settings as the focus test wants them, the note opened in its tab and focus on it, with the keyboard in its editor. */
async function focusOn(p, path, { near = true, tabs = true, indent = false } = {}) {
	await p.ev(`(async () => { Object.assign(${PL}.settings, ${j({ focusNeighbours: near, tabParagraphs: tabs, indentParagraphs: indent })}); await ${PL}.saveSettings(); })().then(() => 1)`);
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await p.sleep(700);
	await p.ev(`(async () => { if (!document.body.classList.contains('binders-focus')) await ${PL}.focus.toggle(); })().then(() => 1)`);
	await p.sleep(1200);
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await p.sleep(150);
}
/** The caret at a place in the note (an offset), and the editor with the keyboard. */
const caretTo = (p, offset) => p.ev(`(() => { const e = ${ED}; e.setCursor(e.offsetToPos(${offset})); e.focus(); return 1; })()`).then(() => p.sleep(120));
const caretEnd = (p) => p.ev(`(() => { const e = ${ED}; e.setCursor(e.offsetToPos(e.getValue().length)); e.focus(); return 1; })()`).then(() => p.sleep(120));
/** Ctrl+F in the note, as a writer presses it, and what is typed into the bar. */
async function find(p, q) {
	await p.key('f', 'ctrl');
	await p.sleep(400);
	await p.type(q);
	await p.sleep(600);
}
/** Replace mode: Obsidian's own command for it, with the note's editor in front, then the query and the replacement typed as a writer would. */
async function replaceWith(p, q, by) {
	await p.ev(`(() => { ${ED}.focus(); app.commands.executeCommandById('editor:open-search-replace'); return 1; })()`);
	await p.sleep(400);
	// (a bar that is open already keeps its query: the field is selected, so what is typed replaces it)
	await p.ev(`(() => { const b = ${NV}.bindersFind(); b.input.focus(); b.input.select(); return 1; })()`);
	await p.type(q);
	await p.sleep(400);
	await p.key('Tab');
	await p.sleep(200);
	await p.ev(`(() => { ${NV}.bindersFind().by.select(); return 1; })()`);
	await p.type(by);
	await p.sleep(400);
}
/** Puts focus back in the note (the bar's keys go to the bar only while the keyboard is in it). */
const backToNote = (p) => p.ev(`(() => { ${ED}.focus(); return 1; })()`).then(() => p.sleep(200));
const save = (p) => p.ev(`(async () => { await ${NV}.save(); })().then(() => 1)`).then(() => p.sleep(1500));

async function stop(p) {
	await p.ev(`(async () => {
		document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click());
		try { ${NV}.bindersFind?.()?.close(); } catch {}
		document.querySelectorAll('.menu').forEach(m => m.remove());
		const pl = app.plugins.plugins.binders;
		if (pl?.focus) pl.focus.leave(true);
		if (pl) { Object.assign(pl.settings, ${j(OFF)}); await pl.saveSettings(); }
	})().then(() => 1)`).catch(() => {});
	await p.sleep(300);
}
const test = (name, fn) => specs.push({
	name: 'qa11 focus find: ' + name,
	fn: withTidy(async (p, h, t) => {
		await p.ev(`(() => { app.saveLocalStorage('binders-focus-hinted', true); return 1; })()`).catch(() => {});
		try { await fn(p, h, t); } finally { await stop(p); }
	}),
});

// A binder of three scenes, the note in the middle: the scene before has one match, the note two, the scene after one.
const WALK = {
	'1 One': 'Mara opens the book.\n',
	'2 Two': 'Start. Mara here, and Mara there.\n',
	'3 Three': 'The end, with Mara.\n',
};

// =====================================================================================================================
// What the bar looks through
// =====================================================================================================================

test('two paragraphs of the scene before, “Ma” at the end of one and “ra” at the start of the next, are not joined into a match', async (p, h, t) => {
	await binder(p, 'Seam', { '1 Before': 'Opening line.\n\nIt was the Ma\n\nra came in the night.\n', '2 Note': 'The note has nothing of the kind.\n', '3 After': 'Nothing here.\n' });
	await focusOn(p, 'Seam/2 Note.md');
	t.ok(await p.ev(`!!document.querySelector('.binders-focus-near.is-before')`), 'the scene before is shown above the note');
	t.eq(await p.ev(`[...document.querySelectorAll('.binders-focus-near.is-before .binders-focus-near-text p')].some(e => e.textContent.includes('Mara'))`), false, 'no paragraph shown has the word Mara in it');
	await find(p, 'Mara');
	t.eq(await count(p), '0 / 0', 'so the count is none (the bar joins the two paragraphs’ text and finds it)');
	t.eq(await p.ev(`document.querySelector('.binders-find-in-note input').classList.contains('mod-no-match')`), true, 'and the field says no match');
});

test('stepping goes from the scene before, through the note, to the scene after, and wraps; Shift+Enter goes back the same way; the note’s match is selected in its editor', async (p, h, t) => {
	await binder(p, 'Walk', WALK);
	await focusOn(p, 'Walk/2 Two.md');
	await caretTo(p, 0);
	await find(p, 'Mara');
	// where the writer is, what the count says, and what the note's editor has selected
	const at = async () => {
		const s = await state(p);
		// (the note's editor keeps its selection while the writer is on a scene beside it: only a match in the note is selected)
		const sel = s.at[0] === 'before' || s.at[0] === 'after' ? null : await p.ev(`(() => { const c = ${ED}.cm, m = c?.state.selection.main; return m && !m.empty ? c.state.sliceDoc(m.from, m.to) : null; })()`);
		return `${where(s)} (${await count(p)}${sel ? ', selected ' + sel : ''})`;
	};
	t.eq(await at(p), 'note:0 (2 / 4 in 3 notes, selected Mara)', 'starting at the top, the match in the note comes first, selected in its editor');
	const steps = ['note:1 (3 / 4 in 3 notes, selected Mara)', 'after:0 (4 / 4 in 3 notes)', 'before:0 (1 / 4 in 3 notes)', 'note:0 (2 / 4 in 3 notes, selected Mara)'];
	for (const want of steps) {
		await p.key('Enter');
		await p.sleep(250);
		t.eq(await at(p), want, 'Enter goes on to ' + want);
	}
	await p.key('Enter', 'shift');
	await p.sleep(250);
	t.eq(await at(p), 'before:0 (1 / 4 in 3 notes)', 'Shift+Enter goes back to the scene before');
	await p.key('Enter', 'shift');
	await p.sleep(250);
	t.eq(await at(p), 'after:0 (4 / 4 in 3 notes)', 'and back past the start, to the last match, in the scene after');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await bar(p), false, 'Escape closes the bar');
	t.eq(await inFocus(p), true, 'and focus stays on (the bar takes the Escape only while it is open)');
});

test('the first scene in a binder shows only the scene after, and Ctrl+F looks through the note and that', async (p, h, t) => {
	await binder(p, 'Firsts', { '1 First': 'Mara opens.\n', '2 Second': 'Mara again.\n', '3 Third': 'End.\n' });
	await focusOn(p, 'Firsts/1 First.md');
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-near.is-before').length`), 0, 'no scene before is shown');
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-near.is-after').length`), 1, 'the scene after is');
	await caretTo(p, 0);
	await find(p, 'Mara');
	t.ok(await bar(p), 'Ctrl+F gives the binder’s bar (a scene after is shown)');
	t.eq(j((await state(p)).found.map((f) => f[0])), j(['Firsts/1 First.md', 'after']), 'it looks through the note and the scene after, in that order');
	t.eq(await count(p), '1 / 2 in 2 notes', 'and counts them');
	await p.key('Enter');
	await p.sleep(250);
	t.eq(j((await state(p)).at), j(['after', 0]), 'Enter goes on to the scene after');
	t.eq(await count(p), '2 / 2 in 2 notes', 'counted as the second');
});

test('the last scene shows only the scene before: stepping from its match wraps to the scene before, and nothing is looked for after the note', async (p, h, t) => {
	await binder(p, 'Lasts', { '1 A': 'Opening.\n', '2 B': 'Mara ends the middle.\n', '3 C': 'The last note has Mara.\n' });
	await focusOn(p, 'Lasts/3 C.md');
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-near.is-after').length`), 0, 'no scene after is shown');
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-near.is-before').length`), 1, 'the scene before is');
	await caretTo(p, 0);
	await find(p, 'Mara');
	t.eq(j((await state(p)).found.map((f) => f[0])), j(['before', 'Lasts/3 C.md']), 'it looks through the scene before, then the note');
	t.eq(j((await state(p)).at), j(['Lasts/3 C.md', 0]), 'the note’s match is the one the writer is on (where the caret is)');
	await p.key('Enter');
	await p.sleep(250);
	t.eq(j((await state(p)).at), j(['before', 0]), 'Enter goes past the end to the scene before');
});

test('a one-note binder has no scene before or after, so Ctrl+F there is Obsidian’s own bar, as it is outside a binder', async (p, h, t) => {
	await binder(p, 'Solo', { '1 Only': 'Mara alone.\n' });
	await focusOn(p, 'Solo/1 Only.md');
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-near.is-before, .binders-focus-near.is-after').length`), 0, 'no scene is shown beside the note');
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.eq(await bar(p), false, 'not Binders’ bar');
	t.eq(await ownBar(p), true, 'Obsidian’s own bar is in the note’s tab');
	await p.key('Escape');
});

test('with “Show the scenes before and after” off, Ctrl+F in a note in the middle of a binder is Obsidian’s own bar, and the scenes are not shown; turned on again, it is Binders’ bar', async (p, h, t) => {
	await binder(p, 'Walk', WALK);
	await focusOn(p, 'Walk/2 Two.md', { near: false });
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-near').length`), 0, 'no scene is shown');
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.eq(await bar(p), false, 'Binders’ bar is not there');
	t.eq(await ownBar(p), true, 'Obsidian’s own bar is');
	await p.key('Escape');
	await p.sleep(200);
	await p.ev(`(async () => { await ${PL}.focus.toggle(); })().then(() => 1)`);
	await p.sleep(1200);
	await focusOn(p, 'Walk/2 Two.md', { near: true });
	await find(p, 'Mara');
	t.ok(await bar(p), 'with it on again, Ctrl+F in focus is Binders’ bar');
});

// =====================================================================================================================
// Leaving focus, Escape, a click on a neighbour
// =====================================================================================================================

test('leaving focus with the bar open takes the bar and its marks away; the note’s tab has Obsidian’s bar after, and focus again starts with none; no byte is written', async (p, h, t) => {
	await binder(p, 'Walk', WALK);
	const before = vault(p);
	await focusOn(p, 'Walk/2 Two.md');
	await find(p, 'Mara');
	t.ok(await bar(p), 'the bar is open in focus');
	t.ok(await p.ev(`document.querySelectorAll('.binders-find-match').length`) > 0, 'with its marks in the note');
	await p.ev(`(async () => { await ${PL}.focus.toggle(); })().then(() => 1)`);
	await p.sleep(1800);
	t.eq(await inFocus(p), false, 'focus is off');
	t.eq(await bar(p), false, 'Binders’ bar is gone');
	t.eq(await p.ev(`document.querySelectorAll('.binders-find, .binders-find-match, .binders-focus-near').length`), 0, 'and nothing of it is left in the page');
	await backToNote(p);
	await p.key('f', 'ctrl');
	await p.sleep(400);
	t.eq(await ownBar(p), true, 'Ctrl+F in the note is Obsidian’s bar again');
	t.eq(await bar(p), false, 'and not ours');
	await p.key('Escape');
	await p.sleep(200);
	await p.ev(`(async () => { await ${PL}.focus.toggle(); })().then(() => 1)`);
	await p.sleep(1200);
	await backToNote(p);
	t.eq(await bar(p), false, 'focus again: no bar comes back with the old query');
	await p.sleep(200);
	t.eq(await count(p), null, 'and no count');
	await p.sleep(1200);
	const now = vault(p);
	const bad = Object.keys(before).filter(k => before[k] !== now[k]); if (bad.length) console.log('DIFF text', bad.map(k => k + ' => ' + JSON.stringify(now[k])).join(' | '));
	t.eq(bad.length, 0, 'nothing in the vault was written');
});

test('Escape with the keyboard in the bar closes the bar and nothing else: focus stays, the keyboard goes back to the note; a second Escape leaves focus', async (p, h, t) => {
	await binder(p, 'Walk', WALK);
	await focusOn(p, 'Walk/2 Two.md');
	await find(p, 'Mara');
	t.ok(await bar(p), 'the bar is open');
	await p.key('Escape');
	await p.sleep(400);
	t.eq(await bar(p), false, 'Escape closes the bar');
	t.eq(await inFocus(p), true, 'focus is still on');
	t.ok(await p.ev(`!!document.activeElement?.closest('.cm-editor')`), 'the keyboard is back in the note’s editor');
	t.eq(await p.ev(`document.querySelectorAll('.binders-find-match').length`), 0, 'and the marks are taken off');
	await p.key('Escape');
	await p.sleep(1200);
	t.eq(await inFocus(p), false, 'a second Escape, with no bar, leaves focus, as it does without the bar');
});

test('a click on the scene after while the bar is open: the bar does not stay on the note it left (it is closed, or it looks through the note in front)', async (p, h, t) => {
	await binder(p, 'Walk', WALK);
	await focusOn(p, 'Walk/2 Two.md');
	await find(p, 'Mara');
	const OLD = 'Walk/2 Two.md';
	t.ok(await bar(p), 'the bar is open on the middle note');
	const at = await p.at('.binders-focus-near.is-after .binders-focus-near-text');
	t.ok(!!at, 'the scene after is there to click');
	await p.click(at.x, at.y);
	await p.sleep(1500);
	const now = await p.ev(`${NV}.file?.path ?? null`);
	t.eq(now, 'Walk/3 Three.md', 'the click went to the scene after');
	const s = await state(p);
	t.ok(!s || !s.found.some((f) => f[0] === OLD), 'the bar, if it is still open, does not look through the note it left: ' + (s ? j(s.found) : 'closed'));
});

// =====================================================================================================================
// Replace, in focus
// =====================================================================================================================

test('Replace one in the note changes that one match and nothing else (properties and every other note, byte for byte); the bar goes on to the next match; Undo in the editor takes it back', async (p, h, t) => {
	await binder(p, 'Walk2', { '1 One': 'Opening line.\n', '2 Two': '---\nstatus: draft\nsynopsis: Mara in the synopsis.\n---\nStart. Mara here, and Mara there.\n', '3 Three': 'The end, with Mara.\n' });
	const before = vault(p);
	await focusOn(p, 'Walk2/2 Two.md');
	await caretTo(p, 0);
	await replaceWith(p, 'Mara', 'Maren');
	t.ok(await p.ev(`!!document.querySelector('.binders-find-in-note.mod-replace-mode')`), 'the replace row is there');
	// Enter in the replacement field replaces the match the writer is on
	await p.ev(`(() => { ${NV}.bindersFind().by.focus(); return 1; })()`);
	await p.sleep(200);
	await p.key('Enter');
	await p.sleep(600);
	await save(p);
	const body = '---\nstatus: draft\nsynopsis: Mara in the synopsis.\n---\n';
	onlyThese(t, before, vault(p), { 'Walk2/2 Two.md': body + 'Start. Maren here, and Mara there.\n' });
	t.eq(j((await state(p)).at), j(['Walk2/2 Two.md', 0]), 'the writer is on the next match, the one that says Mara there (now the only one)');
	t.eq(await p.ev(`(() => { const c = ${ED}.cm, m = c.state.selection.main; return c.state.sliceDoc(m.from, m.to) + '@' + c.state.sliceDoc(m.to, m.to + 6); })()`), 'Mara@ there', 'and it is selected in the note');
	await backToNote(p);
	await p.key('z', 'ctrl');
	await p.sleep(500);
	await save(p);
	t.eq(disk(p, 'Walk2/2 Two.md'), before['Walk2/2 Two.md'], 'Ctrl+Z in the note takes the replace back, byte for byte');
});

test('Replace one on a match in a scene before or after changes nothing: the note is only ever replaced in its own text', async (p, h, t) => {
	await binder(p, 'Walk3', { '1 One': 'Mara opens the book.\n', '2 Two': 'Start here.\n', '3 Three': 'End.\n' });
	const before = vault(p);
	await focusOn(p, 'Walk3/2 Two.md');
	await replaceWith(p, 'opens', 'begins');
	await p.sleep(400);
	t.eq(j((await state(p)).at), j(['before', 0]), 'the one match is in the scene before');
	await p.ev(`(() => { const b = ${NV}.bindersFind(); b.by.focus(); return 1; })()`);
	await p.sleep(150);
	await p.key('Enter');
	await p.sleep(700);
	await save(p);
	onlyThese(t, before, vault(p));
	t.eq(await p.ev(`${NV}.bindersFind()?.by.value ?? null`), 'begins', 'the replacement is still in the field (nothing was done with it)');
});

test('BUG candidate: Replace one in focus takes a snapshot of the note first, as Replace all does (README: "replace one or all, after a review and a snapshot")', async (p, h, t) => {
	await binder(p, 'Walk4', { '1 One': 'Opening.\n', '2 Two': 'Start. Mara here.\n', '3 Three': 'End.\n' });
	await focusOn(p, 'Walk4/2 Two.md');
	await caretTo(p, 0);
	await replaceWith(p, 'Mara', 'Maren');
	await p.ev(`(() => { ${NV}.bindersFind().by.focus(); return 1; })()`);
	await p.sleep(150);
	await p.key('Enter');
	await p.sleep(700);
	await save(p);
	t.eq(disk(p, 'Walk4/2 Two.md'), 'Start. Maren here.\n', 'the match was replaced');
	const s = await snapsOf(p, '2 Two');
	t.eq(s.length, 1, 'and the note’s own snapshot was taken before it: ' + (s.join(', ') || 'none'));
});

test('Replace all in focus: the review counts only the note’s own places (not the scenes before and after), names the note, and changes nothing else', async (p, h, t) => {
	await binder(p, 'Walk5', WALK);
	const before = vault(p);
	await focusOn(p, 'Walk5/2 Two.md');
	await replaceWith(p, 'Mara', 'Maren');
	await p.ev(`(() => { window.__all = ${NV}.bindersFind().replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	const text = await p.ev(`document.querySelector('.modal.binders-find-review')?.textContent ?? ''`);
	console.log('REVIEW1', JSON.stringify(text.slice(0, 400)));
	t.ok(/2 places in 1 note/.test(text), 'the review says 2 places in 1 note, not the 4 in the three: ' + (/\d+ places? in \d+ notes?/.exec(text)?.[0] ?? 'no count'));
	t.ok(/2 Two/.test(text) && !/1 One|3 Three/.test(text), 'with the note by name, and not the scenes beside it');
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(600);
	await save(p);
	onlyThese(t, before, vault(p), { 'Walk5/2 Two.md': 'Start. Maren here, and Maren there.\n' });
	t.eq((await snapsOf(p, '2 Two')).length, 1, 'with the note’s own snapshot');
});

test('Replace all keeps the tab of a tab paragraph and the indented paragraphs as they are: only the words change, in the note, with both paragraph settings on', async (p, h, t) => {
	const body = '---\nstatus: draft\n---\nPlain line with Mara.\n\n\tA tab-led paragraph with Mara in it.\n\n\tAnother tab line, Mara again.\n';
	await binder(p, 'Tabs', { '1 Head': 'Opening.\n', '2 Body': body, '3 Tail': 'End, Mara.\n' });
	const before = vault(p);
	await focusOn(p, 'Tabs/2 Body.md', { tabs: true, indent: true });
	await replaceWith(p, 'Mara', 'Maren');
	await p.ev(`(() => { window.__all = ${NV}.bindersFind().replaceAll(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	const rv = await p.ev(`document.querySelector('.modal.binders-find-review')?.textContent ?? ''`); console.log('REVIEW2', JSON.stringify(rv.slice(0, 400)));
	t.ok(/4 places in 1 note/.test(rv), 'the review counts four places in the note');
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta').click()`);
	await p.ev(`window.__all.then(() => 1)`);
	await p.sleep(600);
	await save(p);
	onlyThese(t, before, vault(p), { 'Tabs/2 Body.md': body.replaceAll('Mara', 'Maren') });
});

test('the scene before, drawn with a tab paragraph in it, shows that paragraph as prose (not code), and the bar finds the words in it', async (p, h, t) => {
	await binder(p, 'Prose', { '1 Before': 'Earlier paragraph.\n\n\tA tab line about the sea.\n', '2 Here': 'Here.\n' });
	await focusOn(p, 'Prose/2 Here.md', { tabs: true });
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-near.is-before .binders-focus-near-text pre').length`), 0, 'the excerpt has no code block');
	console.log('EXCERPT', await p.ev(`document.querySelector('.binders-focus-near.is-before .binders-focus-near-text')?.innerHTML.slice(0, 500) ?? null`));
	t.ok(await p.ev(`document.querySelectorAll('.binders-focus-near.is-before .binders-focus-near-text .binders-tab').length > 0`), 'the tab line is a paragraph, drawn with its tab, as the note has it');
	await find(p, 'sea');
	t.eq(await count(p), '1 / 1 in 1 note', 'and the bar finds “sea” in it (it is prose, not code, which is not looked through)');
});

test('typing in the note while the bar is open: after a save the count takes the new match in, and the scenes beside the note are not changed', async (p, h, t) => {
	await binder(p, 'Walk6', WALK);
	const before = vault(p);
	await focusOn(p, 'Walk6/2 Two.md');
	await find(p, 'Mara');
	const c0 = total(await count(p));
	await backToNote(p);
	await caretEnd(p);
	await p.type(' Mara');
	await p.sleep(400);
	await save(p);
	await p.sleep(800);
	t.eq(total(await count(p)), c0 + 1, 'one more match is counted: ' + c0 + ' before, ' + total(await count(p)) + ' now');
	onlyThese(t, before, vault(p), { 'Walk6/2 Two.md': WALK['2 Two'] + ' Mara' });
});
