// QA round 11, find and replace: how the bar looks and how it is run from the keyboard (src/view/find-bar.ts, the
// "Find and replace" part of styles.css), set beside Obsidian's own bar in a note's own tab. Tests named
// "qa11 find look: …"; a test for a confirmed bug is named "BUG: …" (or "NIT: …") and fails until it is fixed.
// Run in both themes (--theme dark). Assertions here throw at the first failure, so the look comparisons collect
// what differs and say it once, at the end.
import { j, until, withTidy, file, VIEW } from './view-helpers.mjs';
import { LEAF, M, binder, disk, metrics, openMs, saveAll } from './specs-qa5-manuscript.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 find look: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await close(p); } }) });
const LOG = !!process.env.QA11_LOG;
const log = (...a) => { if (LOG) console.log('   ', ...a); };

// ---- where things are ----
const BARSEL = `${LEAF} .binders-view .binders-find`;
const NATIVE = `${LEAF} .document-search-container:not(.binders-find)`;
const ONE = 'Mara came. Mara waved.\n\nA Storm was coming, and the Storm broke.\n\n\tA tab paragraph about Mara.\n';
const TWO = 'Only Mara here.\n';
const ONE_PATH = 'Look/1 One.md', TWO_PATH = 'Look/2 Two.md';
const span = (text, word) => [text.indexOf(word), text.indexOf(word) + word.length];
const MODS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

// ---- the keys: the driver has no F3, so it is sent here ----
const fkey = async (p, key, code, vk, ...m) => {
	const modifiers = m.reduce((a, k) => a | MODS[k], 0);
	await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
	await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
	await p.sleep(60);
};
const F3 = (p, ...m) => fkey(p, 'F3', 'F3', 114, ...m);

// ---- setup and the bar ----
async function setup(p) {
	await binder(p, 'Look', { '1 One': ONE, '2 Two': TWO });
	await openMs(p, 'Look');
}
/** Puts the keyboard in a section's editor of the manuscript, optionally selecting [from, to) of it. */
async function editor(p, path = ONE_PATH, select = null) {
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === ${j(path)}); const cm = s.live.cm; cm.focus(); ${select ? `cm.dispatch({ selection: { anchor: ${select[0]}, head: ${select[1]} } });` : ''} return 1; })()`);
	await p.sleep(200);
}
/** Ctrl+F (or Ctrl+H) as a writer does, from the keyboard. */
async function openKey(p, replace = false) {
	await p.key(replace ? 'h' : 'f', 'ctrl');
	await p.sleep(400);
}
const countText = (p, base = BARSEL) => p.ev(`document.querySelector(${j(base + ' .document-search-count')})?.textContent ?? null`);
const stepOf = (s) => Number(String(s ?? '').split(' ')[0]);
/** What has the keyboard, in words a writer would use. */
const who = (p) => p.ev(`(() => { const a = document.activeElement; if (!a) return null; if (a.classList.contains('document-replace-input')) return 'replace field'; if (a.tagName === 'INPUT') return 'find field'; return a.getAttribute('aria-label') || (a.className || a.tagName).toString().split(' ')[0]; })()`);
const fieldValue = (p, base = BARSEL) => p.ev(`(() => { const i = document.querySelector(${j(base + ' .document-search-input input')}); return i ? { v: i.value, s: i.selectionStart, e: i.selectionEnd, focused: document.activeElement === i } : null; })()`);
const barOpen = (p) => p.ev(`!!document.querySelector(${j(BARSEL)})`);
const replaceMode = (p) => p.ev(`!!document.querySelector(${j(BARSEL + '.mod-replace-mode')})`);
/** Obsidian's own bar in a note: opened in a tab of its own, as the note's own command opens it. */
async function nativeBar(p, { replace = false, q = null, path = ONE_PATH, select = null } = {}) {
	await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); window.__qa11Leaf = l; await l.openFile(${file(path)}); await l.setViewState({ type: 'markdown', state: { file: ${j(path)}, mode: 'source', source: true }, active: true }); return 1; })().then(() => 1)`);
	await p.sleep(700);
	await p.ev(`(() => { const c = document.querySelector(${j(LEAF + ' .cm-content')}); ${select ? `app.workspace.activeLeaf?.view?.editor?.cm?.dispatch({ selection: { anchor: ${select[0]}, head: ${select[1]} } });` : ''} c.focus(); return 1; })()`);
	await p.sleep(150);
	await p.key(replace ? 'h' : 'f', 'ctrl');
	await p.sleep(400);
	if (q != null) { await p.type(q); await p.sleep(400); }
}
async function closeNative(p) {
	await p.key('Escape');
	await p.sleep(250);
	await p.ev(`(() => { try { window.__qa11Leaf?.detach(); } catch {} window.__qa11Leaf = null; return 1; })()`);
	await p.sleep(250);
}
async function close(p) {
	await p.ev(`(() => { try { ${VIEW}?.findBar?.close(); } catch {} try { window.__qa11Leaf?.detach(); } catch {} window.__qa11Leaf = null; document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
	await p.sleep(100);
}

/** Computed look of a set of elements under one bar (font, box, padding, colours). */
const LOOKS = (base) => ({ row: base + ' .document-search', box: base + ' .document-search-input', input: base + ' .document-search-input input', count: base + ' .document-search-count', btn: base + ' .document-search-buttons button', icon: base + ' .document-search-buttons button svg' });
const measure = (p, sels) => p.ev(`((sels) => { const o = {}; for (const [k, s] of Object.entries(sels)) { const e = document.querySelector(s); if (!e) { o[k] = null; continue; } const b = e.getBoundingClientRect(), c = getComputedStyle(e); o[k] = { w: +b.width.toFixed(1), h: +b.height.toFixed(1), font: c.fontSize, family: c.fontFamily, weight: c.fontWeight, lh: c.lineHeight, pad: c.padding, gap: c.gap, radius: c.borderRadius, color: c.color, bg: c.backgroundColor }; } o.buttons = document.querySelectorAll(sels.btn).length; return o; })(${j(sels)})`);
/** Focus ring on what has the keyboard, read as the page draws it. */
const ring = (p, sel) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); if (!e) return null; const c = getComputedStyle(e); return { focused: document.activeElement === e, visible: e.matches(':focus-visible'), outline: c.outlineStyle + ' ' + c.outlineWidth + ' ' + c.outlineColor, shadow: c.boxShadow, bg: c.backgroundColor }; })()`);
const bgOf = (p, sel) => p.ev(`(() => { const e = document.querySelector(${j(sel)}); return e ? getComputedStyle(e).backgroundColor : null; })()`);

// =====================================================================================================================
// The keyboard
// =====================================================================================================================

test('Tab in the bar’s field goes where it goes in Obsidian’s bar (compared: find and replace)', async (p, h, t) => {
	const reach = (seq) => seq.some((w) => w && /Previous|Next|Match case|Exit|Replace/.test(w));
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(400);
	const ours = [];
	for (let i = 0; i < 4; i++) { await p.key('Tab'); ours.push(await who(p)); }
	await p.key('Escape');
	await p.sleep(250);
	await nativeBar(p, { q: 'Mara' });
	const theirs = [];
	for (let i = 0; i < 4; i++) { await p.key('Tab'); theirs.push(await who(p)); }
	await closeNative(p);
	await editor(p);
	await openKey(p, true);
	await p.type('Mara');
	await p.sleep(300);
	const oursR = [];
	for (let i = 0; i < 6; i++) { await p.key('Tab'); oursR.push(await who(p)); }
	await p.key('Escape');
	await p.sleep(250);
	await nativeBar(p, { replace: true, q: 'Mara' });
	const theirsR = [];
	for (let i = 0; i < 6; i++) { await p.key('Tab'); theirsR.push(await who(p)); }
	await closeNative(p);
	log('find: binders', ours.join(' > '), '| obsidian', theirs.join(' > '));
	log('replace: binders', oursR.join(' > '), '| obsidian', theirsR.join(' > '));
	t.ok(reach(ours) === reach(theirs) && reach(oursR) === reach(theirsR), `Tab reaches a button in Binders' bar (find: ${reach(ours)}, replace: ${reach(oursR)}) as in Obsidian's (find: ${reach(theirs)}, replace: ${reach(theirsR)}); Binders: ${ours.join(' > ')} / ${oursR.join(' > ')}; Obsidian: ${theirs.join(' > ')} / ${theirsR.join(' > ')}`);
});

test('Enter on a bar button presses it: on Exit search it closes the bar (it stepped to the next match instead)', async (p, h, t) => {
	const fails = [];
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(400);
	const before = stepOf(await countText(p));
	await p.ev(`document.querySelector(${j(BARSEL + ' .document-search-buttons button[aria-label="Exit search"]')}).focus()`);
	await p.sleep(100);
	await p.key('Enter');
	await p.sleep(400);
	if (await barOpen(p)) fails.push('Binders: Enter on the focused Exit search stepped instead (count ' + before + ' → ' + stepOf(await countText(p)) + ')');
	// Obsidian's own bar, the same key on its own close button
	await nativeBar(p, { q: 'Mara' });
	await p.ev(`document.querySelector(${j(NATIVE + ' .document-search-close-button')})?.focus()`);
	await p.sleep(100);
	await p.key('Enter');
	await p.sleep(400);
	const nativeClosed = !(await p.ev(`!!document.querySelector(${j(NATIVE + ' .document-search-container')})`));
	log('obsidian: Enter on its close button closes it:', nativeClosed);
	if (!nativeClosed) await closeNative(p); else await p.ev(`(() => { try { window.__qa11Leaf?.detach(); } catch {} window.__qa11Leaf = null; return 1; })()`);
	t.ok(fails.length === 0, fails.join(' ; ') || 'fine');
});

test('Enter on Match case turns the case on and off, as Space does (it stepped to the next match instead)', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(400);
	const mc = `${BARSEL} .document-search-buttons button[aria-label="Match case"]`;
	await p.ev(`document.querySelector(${j(mc)}).focus()`);
	await p.sleep(100);
	await p.key(' ');
	await p.sleep(300);
	const space = await p.ev(`document.querySelector(${j(mc)}).getAttribute('aria-pressed')`);
	const pre = stepOf(await countText(p));
	await p.key('Enter');
	await p.sleep(300);
	const enter = await p.ev(`document.querySelector(${j(mc)}).getAttribute('aria-pressed')`);
	log('space gave', space, 'enter gave', enter, 'count', pre, '→', stepOf(await countText(p)));
	t.eq(space, 'true', 'Space on Match case turns it on');
	t.eq(enter, 'false', 'Enter on Match case (on, so it should turn off) toggles it: it is still ' + enter);
});

test('the keys in the bar: F3 and Enter step on, Shift+F3 and Shift+Enter back, Ctrl+G and Ctrl+Shift+G too; Escape closes it and the caret goes back to the match', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(400);
	const n = async () => stepOf(await countText(p));
	const start = await n();
	t.eq(start, 1, 'the first match, to start');
	await F3(p);
	t.eq(await n(), 2, 'F3 steps on');
	await F3(p, 'shift');
	t.eq(await n(), 1, 'Shift+F3 steps back');
	await p.key('Enter');
	t.eq(await n(), 2, 'Enter steps on');
	await p.key('Enter', 'shift');
	t.eq(await n(), 1, 'Shift+Enter steps back');
	await p.key('g', 'ctrl');
	t.eq(await n(), 2, 'Ctrl+G steps on');
	await p.key('g', 'ctrl', 'shift');
	t.eq(await n(), 1, 'Ctrl+Shift+G steps back');
	await p.key('Escape');
	await p.sleep(300);
	t.ok(!(await barOpen(p)), 'Escape closes the bar');
	t.eq(await p.ev(`document.activeElement?.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent ?? null`), '1 One', 'and the keyboard is back in the note of the match');
});

test('Ctrl+H opens the bar with its replace row and the keyboard in the find field; Enter in the replace field replaces the match the writer is on and nothing else (bytes), then Escape closes', async (p, h, t) => {
	await setup(p);
	await editor(p, ONE_PATH, [0, 0]);
	await openKey(p, true);
	t.ok(await replaceMode(p), 'Ctrl+H opens the replace row');
	t.eq(await who(p), 'find field', 'with the keyboard in the find field');
	await p.type('Mara');
	await p.sleep(400);
	await p.key('Tab');
	t.eq(await who(p), 'replace field', 'Tab (in the replace bar) goes to the replace field');
	await p.type('Maren');
	await p.key('Enter');
	await p.sleep(600);
	await saveAll(p);
	t.eq(disk(p, ONE_PATH), ONE.replace('Mara came', 'Maren came'), 'Enter replaced the first match, and no other byte of the note moved');
	t.eq(disk(p, TWO_PATH), TWO, 'the other note is untouched');
	await p.key('Escape');
	await p.sleep(300);
	t.ok(!(await barOpen(p)), 'Escape closes it');
});

test('Ctrl+Alt+Enter opens the review of Replace all, and Escape closes it with nothing changed on disk', async (p, h, t) => {
	await setup(p);
	await editor(p, ONE_PATH, [0, 0]);
	await openKey(p, true);
	await p.type('Mara');
	await p.sleep(400);
	await p.key('Tab');
	await p.type('Maren');
	await p.sleep(200);
	await p.key('Enter', 'ctrl', 'alt');
	const shown = await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	t.ok(shown, 'Ctrl+Alt+Enter opens the review');
	await p.key('Escape');
	await p.sleep(400);
	t.ok(!(await p.ev(`!!document.querySelector('.modal.binders-find-review')`)), 'Escape closes the review');
	await saveAll(p);
	t.eq(disk(p, ONE_PATH), ONE, 'and the note is as it was');
	t.eq(disk(p, TWO_PATH), TWO, 'and the other one');
});

// =====================================================================================================================
// Selection, and what the bar remembers
// =====================================================================================================================

test('Ctrl+F with text selected in the note: the field takes it, selected, with the count of its matches; typing then replaces it', async (p, h, t) => {
	await setup(p);
	await editor(p, ONE_PATH, span(ONE, 'Storm'));
	await openKey(p);
	const f = await fieldValue(p);
	t.eq(f?.v, 'Storm', 'the field has the selection');
	t.ok(f?.s === 0 && f?.e === 5 && f?.focused, 'selected, with the keyboard in it: ' + JSON.stringify(f));
	t.ok((await countText(p))?.startsWith('1 / 2'), 'and the count is the first of its two matches: ' + (await countText(p)));
	await p.type('Mara');
	await p.sleep(400);
	t.eq((await fieldValue(p))?.v, 'Mara', 'typing replaces the selection');
});

test('Ctrl+F again while the bar is open, with another text selected in the other note: the field takes the new selection and the keyboard', async (p, h, t) => {
	await setup(p);
	await editor(p, ONE_PATH, span(ONE, 'Storm'));
	await openKey(p);
	t.eq((await fieldValue(p))?.v, 'Storm', 'opened on Storm');
	await editor(p, TWO_PATH, span(TWO, 'Mara'));
	await openKey(p);
	const f = await fieldValue(p);
	t.eq(f?.v, 'Mara', 'the second Ctrl+F takes the new selection: ' + JSON.stringify(f));
	t.ok(f?.focused, 'and the keyboard is in the field');
	t.ok((await countText(p))?.includes('in 2 notes'), 'and the count is of the binder again: ' + (await countText(p)));
});

test('NIT: Ctrl+F with a two-line selection: Obsidian’s bar puts the selection in its field (line breaks dropped); Binders’ leaves the field as it was', async (p, h, t) => {
	await setup(p);
	const two = span(ONE, 'Mara came. Mara waved.\n\nA Storm');
	await editor(p, ONE_PATH, two);
	await openKey(p);
	const ours = await fieldValue(p);
	await p.key('Escape');
	await p.sleep(250);
	await nativeBar(p, { select: two });
	const theirs = await fieldValue(p, NATIVE);
	await closeNative(p);
	log('two lines: binders', JSON.stringify(ours), 'native', JSON.stringify(theirs));
	t.eq(ours?.v ?? '', theirs?.v ?? '', 'the field after a two-line selection, as Obsidian’s bar leaves it');
});

test('Escape leaves the match selected in the note, so the next Ctrl+F fills the field with it (as Obsidian’s bar does with a selection)', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(400);
	await p.key('Escape');
	await p.sleep(300);
	await editor(p);
	const selected = await p.ev(`(() => { const s = ${M}.scenes.find(s => s.file.path === ${j(ONE_PATH)}); const cm = s.live.cm; const r = cm.state.selection.main; return cm.state.sliceDoc(r.from, r.to); })()`);
	await openKey(p);
	const ours = await fieldValue(p);
	log('after Escape the editor has selected', JSON.stringify(selected), 'and the field reads', JSON.stringify(ours));
	t.eq(ours?.v, selected, 'Ctrl+F fills the field with what is selected in the note');
});

test('the bar looks as Obsidian’s bar in a note does: the same field and count type, row and button heights, icon size and spacing', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(450);
	const ours = await measure(p, LOOKS(BARSEL));
	await p.key('Escape');
	await p.sleep(250);
	await nativeBar(p, { q: 'Mara' });
	const theirs = await measure(p, LOOKS(NATIVE));
	await closeNative(p);
	log('binders', JSON.stringify(ours));
	log('native ', JSON.stringify(theirs));
	const bad = [];
	const same = (k, what, tol = 1) => {
		const a = ours[k], b = theirs[k];
		if (!a || !b) { bad.push(`${k}: missing (binders ${!!a}, native ${!!b})`); return; }
		if (typeof a[what] === 'string' && a[what] !== b[what]) bad.push(`${k} ${what}: ${a[what]} against ${b[what]}`);
		if (typeof a[what] === 'number' && Math.abs(a[what] - b[what]) > tol) bad.push(`${k} ${what}: ${a[what]} against ${b[what]}`);
	};
	// the field, the buttons and their icons are what a writer's eye and finger go to: they must match
	for (const k of ['input', 'btn', 'icon']) {
		same(k, 'font'); same(k, 'weight'); same(k, 'pad'); same(k, 'radius'); same(k, 'h');
	}
	same('btn', 'w', 2); same('icon', 'w', 2);
	// (Obsidian's bar has three buttons here, Binders' four: the Match case button is Binders' own; not compared)
	log('count: ours', JSON.stringify(ours.count), 'native', JSON.stringify(theirs.count));
	log('row: ours font', ours.row.font, 'native', theirs.row.font);
	t.ok(bad.length === 0, 'differences from Obsidian’s bar: ' + (bad.join(' ; ') || 'none'));
});

test('NIT: the count is set in the bar’s own line height, as Obsidian’s count is (12 px type, 18 px line)', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(450);
	const ours = await measure(p, { count: BARSEL + ' .document-search-count' });
	await p.key('Escape');
	await p.sleep(250);
	await nativeBar(p, { q: 'Mara' });
	const theirs = await measure(p, { count: NATIVE + ' .document-search-count' });
	await closeNative(p);
	log('count ours', JSON.stringify(ours.count), 'native', JSON.stringify(theirs.count));
	t.eq(ours.count.lh, theirs.count.lh, 'the count’s line height');
});

test('the bar’s buttons have Obsidian’s tooltips: a name and its key, shown on hover; Next says F3 and Previous says Shift + F3', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(400);
	const tips = [];
	for (let i = 0; i < 4; i++) tips.push(await p.hover(`${BARSEL} .document-search-buttons button`, { i, ms: 1500 }));
	await p.key('Escape');
	await p.sleep(250);
	await nativeBar(p, { q: 'Mara' });
	// (Obsidian's bar: only its visible buttons, marked so they can be hovered)
	const n = await p.ev(`(() => { const bs = [...document.querySelectorAll(${j(NATIVE + ' .document-search-buttons button')})].filter(b => b.getBoundingClientRect().width > 0); bs.forEach((b, i) => b.setAttribute('data-qa11', String(i))); return bs.map(b => b.getAttribute('aria-label')); })()`);
	const native = [];
	for (let i = 0; i < n.length; i++) native.push(await p.hover(`${NATIVE} [data-qa11="${i}"]`, { ms: 1500 }));
	await closeNative(p);
	log('binders tooltips', JSON.stringify(tips), 'obsidian', JSON.stringify(n), JSON.stringify(native));
	t.ok(tips.every((x) => x && x.trim()), 'each button has a tooltip: ' + JSON.stringify(tips));
	t.ok(/F3/.test(tips[1] ?? ''), 'Next says F3: ' + JSON.stringify(tips[1]));
	t.ok(/Shift/.test(tips[0] ?? ''), 'Previous says Shift + F3: ' + JSON.stringify(tips[0]));
});

test('no match: the field takes a tint of its own (not the field’s colour), in this theme; a match takes the field back', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('zzqx');
	await p.sleep(450);
	const cls = await p.ev(`document.querySelector(${j(BARSEL + ' .document-search-input input')}).classList.contains('mod-no-match')`);
	const tinted = await bgOf(p, BARSEL + ' .document-search-input input');
	for (let i = 0; i < 4; i++) await p.key('Backspace');
	await p.type('Mara');
	await p.sleep(450);
	const plain = await bgOf(p, BARSEL + ' .document-search-input input');
	const ntint = await (async () => {
		await p.key('Escape');
		await p.sleep(200);
		await nativeBar(p, { q: 'zzqx' });
		const cls2 = await p.ev(`document.querySelector(${j(NATIVE + ' .document-search-input input')})?.classList.contains('mod-no-match') ?? null`);
		const bg = await bgOf(p, NATIVE + ' .document-search-input input');
		const box = await bgOf(p, NATIVE + ' .document-search-input');
		log('native box bg in no match', box);
		await closeNative(p);
		return { cls2, bg };
	})();
	log('tint binders', tinted, 'plain', plain, 'native tint', JSON.stringify(ntint));
	t.ok(cls, 'the field has the no-match class');
	t.ok(tinted !== plain, 'the tint is not the field’s own colour: ' + tinted + ' against ' + plain);
	t.ok(ntint.cls2 === true, 'Obsidian’s own bar marks no match the same way (' + ntint.cls2 + ')');
});

test('keyboard focus: the field and each button show a focus ring, as Obsidian’s do (the button only when the keyboard reached it)', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	const field = await ring(p, BARSEL + ' .document-search-input input');
	await p.key('Escape');
	await p.sleep(200);
	await nativeBar(p, { q: 'Mara' });
	const nfield = await ring(p, NATIVE + ' .document-search-input input');
	await p.key('Tab');
	await p.sleep(100);
	const nbtn = await p.ev(`(() => { const a = document.activeElement; const c = getComputedStyle(a); return { label: a.getAttribute('aria-label'), visible: a.matches(':focus-visible'), outline: c.outlineStyle + ' ' + c.outlineWidth, shadow: c.boxShadow }; })()`);
	await closeNative(p);
	log('field ours', JSON.stringify(field), 'native', JSON.stringify(nfield), 'native button', JSON.stringify(nbtn));
	const ringOf = (r) => !!r && (r.outline.split(' ')[0] !== 'none' || r.shadow !== 'none');
	t.ok(ringOf(field), 'Binders’ field has a ring when focused: ' + JSON.stringify(field));
	t.ok(ringOf(nfield), 'Obsidian’s field has one too: ' + JSON.stringify(nfield));
	await p.key('Escape');
});

test('NIT: the field is set in the same type stack as Obsidian’s field (compared, names spelled out in code points)', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(300);
	const ours = await measure(p, { input: BARSEL + ' .document-search-input input' });
	await p.key('Escape');
	await p.sleep(250);
	await nativeBar(p, { q: 'Mara' });
	const theirs = await measure(p, { input: NATIVE + ' .document-search-input input' });
	await closeNative(p);
	const cp = (s) => [...s].map((c) => (c.codePointAt(0) > 127 ? '\\u' + c.codePointAt(0).toString(16) : c)).join('');
	log('family ours', cp(ours.input.family), '\nfamily obsidian', cp(theirs.input.family));
	t.eq(ours.input.family, theirs.input.family, 'the field’s font stack');
});

test('the bar’s styles: no !important and no “all” in any rule of the bar (what the review bot flags)', async (p, h, t) => {
	await setup(p);
	await editor(p);
	await openKey(p, true);
	await p.type('Mara');
	await p.sleep(300);
	const bad = await p.ev(`(() => { const out = []; const walk = (rs) => { for (const r of rs) { if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; } if (!r.selectorText || !/binders-find/.test(r.selectorText)) continue; for (const i of r.style) { if (r.style.getPropertyPriority(i)) out.push(r.selectorText + ' { ' + i + ' !important }'); if (i === 'all') out.push(r.selectorText + ' { all }'); } } }; for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { /* another origin */ } } return out; })()`);
	t.eq(bad.length, 0, 'rules of the bar that say !important or all: ' + bad.join(' ; '));
});

// =====================================================================================================================
// Narrow panes
// =====================================================================================================================

test('at 400 px wide: the bar, its replace row, the review and the line after a Replace all are all in the window, nothing clipped or scrolled sideways', async (p, h, t) => {
	await setup(p);
	await editor(p, ONE_PATH, [0, 0]);
	await openKey(p, true);
	await p.type('Mara');
	await p.sleep(300);
	await p.key('Tab');
	await p.type('Maren');
	await p.sleep(300);
	// (the sidebars take their room out of the window: a 400 px window has a pane of 56 px with them open)
	const sides = await p.ev(`(() => { const r = { l: !app.workspace.leftSplit?.collapsed, r: !app.workspace.rightSplit?.collapsed }; app.workspace.leftSplit?.collapse(); app.workspace.rightSplit?.collapse(); return r; })()`);
	await metrics(p, 400, 800, false);
	await p.sleep(900);
	try {
		const g = await p.ev(`(() => { const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; }; const bar = document.querySelector(${j(BARSEL)}); return { win: innerWidth, bar: r(bar), row: r(bar?.querySelector('.document-search')), input: r(bar?.querySelector('.document-search-input input')), replace: r(bar?.querySelector('.document-replace-input')), buttons: [...(bar?.querySelectorAll('button') ?? [])].map(b => [b.getAttribute('aria-label'), r(b)]), scroll: bar ? bar.scrollWidth - bar.clientWidth : null, view: document.querySelector(${j(LEAF + ' .binders-view')}) ? r(document.querySelector(${j(LEAF + ' .binders-view')})) : null }; })()`);
		log('400 px', JSON.stringify(g));
		const bad = [];
		if (!g.bar) bad.push('no bar');
		else {
			if (g.bar.r > g.win) bad.push(`bar runs ${g.bar.r - g.win}px past the window`);
			if (g.scroll > 0) bad.push(`bar scrolls sideways by ${g.scroll}px`);
			if (g.input && g.input.w < 80) bad.push(`find field only ${g.input.w}px wide`);
			for (const [name, b] of g.buttons) if (b && (b.r > g.win || b.r > g.bar.r + 1)) bad.push(`“${name}” is clipped (right edge ${b.r})`);
		}
		t.ok(bad.length === 0, `at ${g.win} px (window): ` + (bad.join(' ; ') || 'fine'));
		await p.key('Enter', 'ctrl', 'alt');
		await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
		await p.sleep(300);
		const m = await p.ev(`(() => { const b = document.querySelector('.modal.binders-find-review')?.getBoundingClientRect(); return b ? { l: Math.round(b.left), r: Math.round(b.right) } : null; })()`);
		t.ok(m && m.l >= 0 && m.r <= 400, 'the review fits the window: ' + JSON.stringify(m));
		await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta')?.click()`);
		await p.sleep(1200);
		const u = await p.ev(`(() => { const d = document.querySelector('.binders-find-done'); const b = d?.querySelector('.binders-find-undo'); if (!d || d.style.display === 'none') return null; const x = b?.getBoundingClientRect(); return { text: d.textContent, undo: x ? { r: Math.round(x.right), l: Math.round(x.left) } : null, win: innerWidth, dr: Math.round(d.getBoundingClientRect().right), scroll: d.scrollWidth - d.clientWidth }; })()`);
		log('done line at 400', JSON.stringify(u));
		t.ok(u && u.undo && u.undo.r <= 400, 'the line after the replace (with Undo) fits: ' + JSON.stringify(u));
	} finally {
		await metrics(p, p.width, p.height, false);
		await p.ev(`(() => { if (${sides.l}) app.workspace.leftSplit?.expand(); if (${sides.r}) app.workspace.rightSplit?.expand(); return 1; })()`);
		await p.sleep(700);
	}
});

test('a binder in a split pane: the bar is inside the pane, its buttons and count are not clipped, and Ctrl+F works there', async (p, h, t) => {
	await setup(p);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); window.__qa11Split = l; await l.setViewState({ type: 'binders-view', state: { folder: 'Look', mode: 'manuscript' }, active: true }); return 1; })().then(() => 1)`);
	await p.sleep(1500);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-view .binders-toolbar')`, 4000);
	await p.sleep(800);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(400);
	try {
		const g = await p.ev(`(() => { const leaf = document.querySelector('.workspace-leaf.mod-active'); const L = leaf.getBoundingClientRect(); const bar = leaf.querySelector('.binders-view .binders-find'); const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right) }; }; return { leaf: { l: Math.round(L.left), r: Math.round(L.right) }, bar: bar ? r(bar) : null, buttons: bar ? [...bar.querySelectorAll('button')].map(b => r(b).r) : [], count: bar ? r(bar.querySelector('.document-search-count')) : null, scroll: bar ? bar.scrollWidth - bar.clientWidth : null, count2: bar?.querySelector('.document-search-count')?.textContent }; })()`);
		log('split', JSON.stringify(g));
		t.ok(g.bar, 'the bar is in the split pane');
		const bad = [];
		if (g.bar && g.bar.r > g.leaf.r + 1) bad.push(`bar runs ${g.bar.r - g.leaf.r}px past its pane`);
		for (const x of g.buttons) if (x > g.leaf.r + 1) bad.push(`a button ends at ${x}, past its pane`);
		if (g.scroll > 0) bad.push(`bar scrolls sideways by ${g.scroll}px`);
		t.ok(bad.length === 0, 'in the split: ' + (bad.join(' ; ') || 'fine'));
		t.ok(/\//.test(g.count2 ?? ''), 'the count shows in the pane: ' + g.count2);
	} finally {
		await p.ev(`(() => { try { window.__qa11Split?.detach(); } catch {} window.__qa11Split = null; return 1; })()`);
		await p.sleep(300);
	}
});

// =====================================================================================================================
// The dark theme: the same look on a dark page, once more in the run's own theme (the spec runs in both)
// =====================================================================================================================

test('the tint and the focus ring are drawn in the theme the run is in (the field’s tint differs from its plain colour in this theme)', async (p, h, t) => {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	await setup(p);
	await editor(p);
	await openKey(p);
	await p.type('Mara');
	await p.sleep(350);
	const plain = await bgOf(p, BARSEL + ' .document-search-input input');
	await p.type('qz');
	await p.sleep(450);
	const tint = await bgOf(p, BARSEL + ' .document-search-input input');
	log('theme dark:', dark, 'plain', plain, 'tint', tint);
	t.ok(tint !== plain, `the no-match tint differs from the plain field in ${dark ? 'dark' : 'light'}: ${tint} against ${plain}`);
	t.ok(await p.ev(`document.body.classList.contains('theme-dark') === ${dark}`), 'and the run is in the theme it says');
});
