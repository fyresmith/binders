// Focus mode (src/focus/): a state of the note's tab or of the manuscript. What these check, as AGENTS.md asks:
// nothing typed is ever lost to it (during the fade, across entering and leaving, across the scene before and after,
// with undo intact); Obsidian is exactly as it was after leaving, after a reload while in focus, and after the plugin
// is turned off while in focus; Escape is left to whatever else wants it; a note outside a binder is untouched; every
// undocumented thing it relies on has its fallback. And the options: with the defaults the page is the text and the
// way out, and the last line is held while writing at the end; each option on shows its piece.
import { readFileSync } from 'fs';
import { join } from 'path';
import { PL, VIEW, clickMenu, closeMenus, j, menuItems, openView, reload, texts, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const F = `${PL}.focus`;
const L = 'The Lighthouse/';
const KEEPER = L + 'Part One/The keeper.md', ARRIVAL = L + 'Part One/Arrival.md', STORM = L + 'Part One/Storm warning.md', PROLOGUE = L + 'Prologue.md';
const OUTSIDE = 'Outside.md';
const VIEWOF = `app.workspace.getMostRecentLeaf().view`;
const ED = `${VIEWOF}.editor`, CM = `${ED}.cm`;
const M = `${VIEW}.current`;
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
// (what each test starts from; not the defaults: dimming is on by default, and off here so that each test turns on what it looks at)
const OFF = { focusTypewriter: true, focusNeighbours: false, focusPlace: false, focusNumbers: false, focusDim: false, focusDark: false, focusFullscreen: false, focusGoal: 0 };
const set = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(250));
const inFocus = (p) => p.ev(`document.body.classList.contains('binders-focus')`);

/** Before each test: the way out has been said (its notice would cover what's clicked), the day's words start at none. */
const start = (p) => p.ev(`(() => { app.saveLocalStorage('binders-focus-hinted', true); app.saveLocalStorage('binders-session', null); const f = ${F}; f.session = new f.session.constructor(null, f.session.day); return 1; })()`);
/** After each: out of focus, Obsidian's own settings as they were, nothing left open. */
async function stop(p) {
	await p.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
	await closeMenus(p).catch(() => {});
	await p.ev(`(async () => {
		document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click());
		try { app.setting.close(); } catch {}
		const pl = app.plugins.plugins.binders;
		if (pl?.focus) { pl.focus.leave(true); pl.focus.busy = false; }
		document.body.classList.remove('binders-focus-pre', 'binders-focus-post');
		if (app.vault.getConfig('vimMode')) app.vault.setConfig('vimMode', false);
		if (app.vault.getConfig('readableLineLength') === false) app.vault.setConfig('readableLineLength', true);
		if (pl) { Object.assign(pl.settings, ${j(OFF)}); await pl.saveSettings(); }
	})().then(() => 1)`).catch(() => {});
}
const test = (name, fn) => specs.push({ name: 'focus: ' + name, fn: withTidy(async (p, h, t) => { try { await start(p); await fn(p, h, t); } finally { await stop(p); } }) });

// ---- a binder with text enough to scroll ----
const N = (i) => `Novel/Scene ${String(i).padStart(2, '0')}.md`;
/** A binder “Novel”: `scenes` notes of `paras` paragraphs of a few lines each. */
async function novel(p, scenes = 5, paras = 14) {
	await p.ev(`(async () => {
		await app.vault.createFolder('Novel');
		for (let i = 1; i <= ${scenes}; i++) {
			const ps = []; for (let k = 1; k <= ${paras}; k++) ps.push('Scene ' + i + ' paragraph ' + k + '. The sea came up the rocks and the light turned over it, and the keeper wrote it down in the long book he kept by the window, as he had every night since the war.');
			await app.vault.create('Novel/Scene ' + String(i).padStart(2, '0') + '.md', '---\\nstatus: draft\\nsynopsis: What happens in scene ' + i + '\\ntarget: 600\\n---\\n' + ps.join('\\n\\n') + '\\n');
		}
		await new Promise(r => setTimeout(r, 600));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Novel'));
		return 1; })()`);
	await p.sleep(700);
}

// ---- doing what a writer does ----
async function openNote(p, path) {
	await p.ev(`(async () => { await ${PL}.binders.settled; const l = app.workspace.getLeaf(false); await l.openFile(app.vault.getAbstractFileByPath(${j(path)})); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `${VIEWOF}.file?.path === ${j(path)} && !!document.querySelector('.workspace-leaf.mod-active .cm-content')`);
	await p.sleep(350);
}
/** The cursor after (or before) some words of the note, the editor with the keyboard. */
const caretAt = (p, needle, after = true) => p.ev(`(() => { const e = ${ED}, t = e.getValue(), i = t.indexOf(${j(needle)}); if (i < 0) throw new Error('no such text: ' + ${j(needle)}); e.setCursor(e.offsetToPos(i + (${after} ? ${needle.length} : 0))); e.focus(); return 1; })()`).then(() => p.sleep(120));
/** The cursor at the end of the note's text. */
const caretEnd = (p) => p.ev(`(() => { const e = ${ED}, t = e.getValue(); e.setCursor(e.offsetToPos(t.replace(/\\s+$/, '').length)); e.focus(); return 1; })()`).then(() => p.sleep(120));
/** Types with real key presses (the driver's type() inserts text without any: focus mode listens for keys). */
async function press(p, text) {
	for (const ch of text) {
		if (ch === '\n') { await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); continue; }
		await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code: ch === ' ' ? 'Space' : undefined });
		await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
	}
	await p.sleep(60);
}
/** Into focus (by its command), once what's around the page has gone and the text has settled. */
async function enter(p, h, settle = true) {
	await h.run('focus');
	if (!settle) return;
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	await p.sleep(550);
}
/** Out of it (by its command), once everything is back. */
async function leave(p, h) {
	await h.run('focus');
	await until(p, `!document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre') && !${F}.busy`);
	await p.sleep(300);
}
/** The pointer really moved: what's hidden while typing comes back. */
async function wiggle(p, x = 900, y = 420) { await p.move(x, y); await p.move(x + 40, y + 30); await p.sleep(300); }

// ---- looking ----
/** What Obsidian draws around a tab, each as "width x height" (0x0 while hidden), and the layout it would save. */
const chrome = (p) => p.ev(`JSON.stringify(['.workspace-ribbon.mod-left', '.workspace-split.mod-left-split', '.workspace-tab-header-container', '.status-bar', '.workspace-leaf.mod-active .view-header'].map(s => { const e = document.querySelector(s); if (!e) return s + ' is missing'; const r = e.getBoundingClientRect(); return !r.width && !r.height ? '0x0' : s === '.status-bar' ? 'shown' : Math.round(r.width) + 'x' + Math.round(r.height); }))`).then(JSON.parse);
// (the status bar is as wide as what it says, which changes as words are typed: there or not is what's checked)
const layout = (p) => p.ev(`JSON.stringify(app.workspace.getLayout())`);
/** Focus mode's own things on the page. */
const pieces = (p) => p.ev(`(() => { const q = (s) => { const e = document.querySelector('.binders-focus-leaf ' + s); return !!e && e.getBoundingClientRect().height > 0; }; return JSON.stringify({ way: q('.binders-focus-leave'), place: q('.binders-focus-note'), numbers: q('.binders-focus-corner'), before: q('.binders-focus-near.is-before'), here: q('.binders-focus-near.is-here'), after: q('.binders-focus-near.is-after'), title: q('.inline-title'), properties: q('.metadata-container'), toolbar: q('.binders-toolbar'), dim: document.body.classList.contains('binders-focus-dim') }); })()`).then(JSON.parse);
/** Where the cursor's line is in what scrolls a note (as a part of its height), and how far that's scrolled. */
const at = (p) => p.ev(`(() => { const cm = ${CM}, c = cm.coordsAtPos(cm.state.selection.main.head), r = cm.scrollDOM.getBoundingClientRect(); return { frac: (c.top - r.top) / r.height, y: Math.round(c.top), top: Math.round(cm.scrollDOM.scrollTop), line: Math.round(c.bottom - c.top), h: Math.round(r.height) }; })()`);
/** The same for the manuscript's section with the cursor. */
const atMs = (p) => p.ev(`(() => { const m = ${M}, cm = m.editor(); if (!cm) return null; const c = cm.coordsAtPos(cm.state.selection.main.head), r = m.root.getBoundingClientRect(); return { frac: (c.top - r.top) / r.height, top: Math.round(m.root.scrollTop), line: Math.round(c.bottom - c.top), h: Math.round(r.height), file: m.current()?.path }; })()`);
const LINE = 0.42;
/** Held at the line: within a line of text of 42% of the height. */
const held = (g) => Math.abs(g.frac - LINE) <= (g.line + 2) / g.h;

async function openMs(p, folder) {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	for (let i = 0; i < 80; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; if (!m || !m.scenes) return false; const near = m.scenes.filter(s => m.near.has(s.el)); return near.length > 0 && near.slice(0, m.liveMax).every(s => (s.live || s.broken) && !s.mounting); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(200);
}
/** The cursor at the start or end of a section of the manuscript, as a key or a click would put it. */
const msCaret = (p, path, where) => p.ev(`(async () => { const m = ${M}; await m.focusScene(m.scenes.find(s => s.file.path === ${j(path)}), ${j(where)}); })().then(() => 1)`).then(() => p.sleep(500));

// ---- the defaults ----

test('with the defaults the page is the text and the way out, and the last line is held while writing at the end', async (p, h, t) => {
	await novel(p);
	await openNote(p, N(2));
	await caretEnd(p);
	const before = await chrome(p), saved = await layout(p);
	t.ok(before.every((s) => !/^0x0$|missing/.test(s)), 'Obsidian’s ribbon, sidebar, tabs, status bar and header are all there to begin with: ' + j(before));
	await enter(p, h);
	t.ok(await inFocus(p), 'the command goes into focus');
	t.eq(j(await chrome(p)), j(['0x0', '0x0', '0x0', '0x0', '0x0']), 'everything Obsidian draws around the note is out of sight');
	t.eq(await layout(p), saved, 'and nothing of Obsidian’s layout has changed: it’s hidden, not closed');
	await wiggle(p);
	t.eq(j(await pieces(p)), j({ way: true, place: false, numbers: false, before: false, here: false, after: false, title: false, properties: false, toolbar: false, dim: true }), 'the page has the text and the way out, and nothing else (dimming is on, and shows only while typing)');
	t.eq(await p.ev(`[...document.querySelector('.binders-focus-leaf .workspace-leaf-content').children].filter(e => /binders/.test(e.className)).map(e => e.className).join(' | ')`), 'binders-focus-top', 'one thing of focus mode’s is on the page');
	t.eq(await p.ev(`[...document.querySelector('.binders-focus-top').children].map(e => e.className).join(' | ')`), 'binders-focus-way', 'and it holds only the button');
	// the line being written, at the end of the scene
	let g = await at(p);
	t.ok(held(g), `on the way in, the last line (the cursor is on it) is brought to the line being written: ${j(g)}`);
	for (let i = 0; i < 4; i++) {
		await press(p, '\n\nShe wrote another paragraph, and it was long enough to go on to a second line of the page, and perhaps a third.');
		await p.sleep(450);
		g = await at(p);
		t.ok(held(g), `typing on at the end, paragraph ${i + 1}: the line stays where it is and the page moves under it: ${j(g)}`);
	}
	t.ok(await p.ev(`document.body.classList.contains('binders-focus-typing')`), 'while typing…');
	t.ok(await p.ev(`getComputedStyle(document.querySelector('.binders-focus-top')).opacity`) < 0.5 || (await p.sleep(700), (await p.ev(`getComputedStyle(document.querySelector('.binders-focus-top')).opacity`)) < 0.05), '…the way out fades too');
	await wiggle(p);
	t.eq(await p.ev(`getComputedStyle(document.querySelector('.binders-focus-top')).opacity`), '1', 'and is back when the pointer moves');
});

test('typewriter scrolling: typing or clicking above the last line doesn’t move the page; nothing happens in a note too short to scroll; off, the editor scrolls as it does', async (p, h, t) => {
	await novel(p, 3, 24);
	await openNote(p, N(2));
	await caretEnd(p);
	await enter(p, h);
	// in the middle of the text
	await caretAt(p, 'Scene 2 paragraph 9.');
	await p.ev(`(() => { const e = ${ED}; e.scrollIntoView({ from: e.getCursor(), to: e.getCursor() }, false); return 1; })()`);
	await p.sleep(500);
	let was = await at(p);
	t.ok(Math.abs(was.frac - LINE) > 0.05, `the cursor is somewhere other than the typewriter line: ${j(was)}`);
	await press(p, ' Words put in above the end.');
	await p.sleep(450);
	let now = await at(p);
	t.eq(now.top, was.top, 'typing above the last line doesn’t move the page');
	await press(p, '\n\nA new paragraph in the middle.');
	await p.sleep(450);
	now = await at(p);
	t.ok(Math.abs(now.top - was.top) <= 2, `nor does a new paragraph there (the page was at ${was.top}, is at ${now.top})`);
	// a click somewhere else in sight
	const line = await p.ev(`(() => { const r = ${CM}.scrollDOM.getBoundingClientRect(); const el = [...document.querySelectorAll('.binders-focus-leaf .cm-line')].find(e => { const b = e.getBoundingClientRect(); return e.textContent.length > 40 && b.top > r.top + 80 && b.bottom < r.bottom - 80; }); const b = el.getBoundingClientRect(); return { x: b.left + 150, y: b.top + 10 }; })()`);
	was = await at(p);
	await p.click(line.x, line.y);
	await p.sleep(500);
	t.eq((await at(p)).top, was.top, 'a click in the text doesn’t move the page');
	// a click on the last line itself: the page still doesn't move under the pointer; the first key typed there does it
	await p.ev(`(() => { const s = ${CM}.scrollDOM; s.scrollTop = s.scrollHeight; return 1; })()`);
	await p.sleep(400);
	const last = await p.ev(`(() => { const ls = [...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-line')].filter(e => e.textContent.trim()); const b = ls[ls.length - 1].getBoundingClientRect(); return { x: b.left + 200, y: b.top + 10 }; })()`);
	was = await at(p);
	await p.click(last.x, last.y);
	await p.sleep(700);
	now = await at(p);
	t.eq(now.top, was.top, 'a click on the last line doesn’t move the page either');
	await p.key('End');
	await press(p, ' And on.');
	await p.sleep(500);
	now = await at(p);
	t.ok(held(now), `typing there brings it to the line: ${j(now)}`);
	await leave(p, h);
	// a note of one line
	await openNote(p, KEEPER);
	await caretEnd(p);
	await enter(p, h);
	await press(p, ' More.\n\nAnd a second paragraph.');
	await p.sleep(450);
	now = await at(p);
	t.eq(now.top, 0, 'a note too short to scroll isn’t scrolled');
	t.ok(now.frac < LINE, `its last line is where the text puts it, above the line: ${j(now)}`);
	await leave(p, h);
	// off
	await set(p, { focusTypewriter: false });
	await openNote(p, N(3));
	await caretAt(p, 'Scene 3 paragraph 2.');
	await enter(p, h);
	await caretEnd(p);
	await p.ev(`(() => { const e = ${ED}; e.scrollIntoView({ from: e.getCursor(), to: e.getCursor() }, false); return 1; })()`);
	await p.sleep(300);
	await press(p, '\n\nTyped with typewriter scrolling off.');
	await p.sleep(450);
	now = await at(p);
	t.ok(now.frac > LINE + 0.08, `with typewriter scrolling off, the last line is wherever the editor keeps it (low on the page), not at the line: ${j(now)}`);
});

test('the manuscript: the last line of the section being written is held; anywhere else the page scrolls as the manuscript does', async (p, h, t) => {
	await novel(p);
	await openMs(p, 'Novel');
	await msCaret(p, N(2), 'end');
	const before = await chrome(p);
	await enter(p, h);
	t.ok(await inFocus(p), 'the manuscript goes into focus');
	t.eq(j(await chrome(p)), j(['0x0', '0x0', '0x0', '0x0', '0x0']), 'with everything around it out of sight');
	t.eq(j(await pieces(p)), j({ way: true, place: false, numbers: false, before: false, here: false, after: false, title: false, properties: false, toolbar: false, dim: true }), 'its toolbar too: the page and the way out');
	let g = await atMs(p);
	t.ok(g && held(g), `the last line of the section with the cursor is brought to the line: ${j(g)}`);
	for (let i = 0; i < 3; i++) {
		await press(p, '\n\nAnother paragraph at the end of the second scene, long enough to wrap on to a second line of the page.');
		await p.sleep(500);
		g = await atMs(p);
		t.ok(held(g), `typing on at the section’s end, paragraph ${i + 1}: ${j(g)}`);
	}
	t.eq(g.file, N(2), 'in that section');
	// the first lines of the next section: not its last line
	await msCaret(p, N(3), 'start');
	const was = await atMs(p);
	await press(p, 'Typed at the start of the third scene. ');
	await p.sleep(500);
	const now = await atMs(p);
	t.eq(now.top, was.top, 'typing at the start of a section doesn’t move the page');
	t.ok(Math.abs(now.frac - LINE) > 0.03 || Math.abs(was.frac - LINE) <= 0.03, 'and its line isn’t taken to the typewriter line');
	// Escape leaves the manuscript's focus, and everything is back
	await p.key('Escape');
	await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
	await p.sleep(400);
	t.eq(j(await chrome(p)), j(before), 'Escape leaves; Obsidian is as it was');
	await p.sleep(2300);
	t.ok(disk(p, N(2)).includes('Another paragraph at the end of the second scene') && disk(p, N(3)).includes('Typed at the start of the third scene. Scene 3 paragraph 1.'), 'what was typed is in the notes');
});

// ---- the options ----

test('each option shows its piece, from the settings and from the menu, and takes it away again', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await enter(p, h);
	await set(p, { focusDim: false }); // (on by default)
	await wiggle(p);
	const off = { way: true, place: false, numbers: false, before: false, here: false, after: false, title: false, properties: false, toolbar: false, dim: false };
	t.eq(j(await pieces(p)), j(off), 'to begin with: the text and the way out');
	// where you are
	await set(p, { focusPlace: true });
	t.eq(j(await pieces(p)), j({ ...off, place: true }), '“Show where you are” puts the place beside the text');
	t.eq(await p.ev(`[...document.querySelectorAll('.binders-focus-place > span:not(.binders-focus-sep)')].map(e => e.textContent).join(' > ')`), 'Part One > The keeper', 'the folder, then the scene');
	t.eq(await p.ev(`document.querySelector('.binders-focus-synopsis').textContent`), 'The keeper refuses to let her into the tower.', 'with the scene’s synopsis');
	await set(p, { focusPlace: false });
	t.eq(j(await pieces(p)), j(off), 'and off takes it away');
	// word counts
	await set(p, { focusNumbers: true });
	await p.sleep(300);
	t.eq(j(await pieces(p)), j({ ...off, numbers: true }), '“Show word counts” puts the numbers in the corner');
	const words = await p.ev(`(() => { const st = document.querySelector('.status-bar'); return (${ED}.getValue().replace(/^---[\\s\\S]*?---\\n/, '').match(/\\S+/g) ?? []).length; })()`);
	t.eq(await p.ev(`document.querySelector('.binders-focus-scene').textContent`), `${words} words`, 'the scene’s words');
	t.eq(await p.ev(`document.querySelector('.binders-focus-session').textContent`), '0 today', 'and the day’s');
	await set(p, { focusNumbers: false });
	t.eq(j(await pieces(p)), j(off), 'and off takes them away');
	// the scenes before and after
	await set(p, { focusNeighbours: true });
	await p.sleep(500);
	t.eq(j(await pieces(p)), j({ ...off, before: true, here: true, after: true }), '“Show the scenes before and after” draws them above and below the text, with the note’s own title');
	t.eq(await p.ev(`[...document.querySelectorAll('.binders-focus-near .binders-manuscript-title')].map(e => e.textContent).join(' | ')`), 'Arrival | The keeper | Storm warning', 'titled as the manuscript titles its sections');
	t.ok((await p.ev(`document.querySelector('.binders-focus-near.is-before .binders-focus-near-text').textContent`)).includes('The supply boat left Mara on the jetty'), 'the scene before, with its text');
	t.ok((await p.ev(`document.querySelector('.binders-focus-near.is-after .binders-focus-near-text').textContent`)).includes('The radio said a storm.'), 'and the scene after');
	t.ok(!(await p.ev(`document.querySelector('.binders-focus-near').textContent`)).includes('synopsis'), 'without their properties');
	await set(p, { focusNeighbours: false });
	t.eq(j(await pieces(p)), j(off), 'and off takes them away');
	// dimming, while typing
	await set(p, { focusDim: true });
	t.ok((await pieces(p)).dim, '“Dim other paragraphs” is on');
	await press(p, '\n\nA second paragraph.');
	await p.sleep(700);
	const dim = await p.ev(`(() => { const ls = [...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-line')].filter(e => e.textContent.trim()); const o = ls.map(e => Number(getComputedStyle(e).opacity)); return { others: o.slice(0, -1), mine: o[o.length - 1] }; })()`);
	t.ok(dim.mine === 1 && dim.others.length > 0 && dim.others.every((o) => Math.abs(o - 0.3) < 0.01), `while typing, the paragraph being written is whole and the others step back: ${j(dim)}`);
	await wiggle(p);
	await p.sleep(400);
	t.eq(await p.ev(`getComputedStyle([...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-line')].find(e => e.textContent.trim())).opacity`), '1', 'the pointer moving brings them forward again');
	await set(p, { focusDim: false });
	// from the menu on the way out
	const b = await p.at('.binders-focus-leave');
	await p.right(b.x, b.y);
	t.eq(j((await menuItems(p)).filter((x) => !/^(Previous|Next) scene/.test(x))), j(['Typewriter scrolling', 'Show the scenes before and after', 'Show where you are', 'Show word counts', 'Dim other paragraphs', 'Dim the background', 'Enter fullscreen', 'Leave focus mode']), 'a right click on the way out lists the options');
	await clickMenu(p, 'Show word counts');
	await p.sleep(400);
	t.ok((await pieces(p)).numbers, 'picking one turns it on');
	t.eq(await p.ev(`(async () => JSON.parse(await app.vault.adapter.read(app.vault.configDir + '/plugins/binders/data.json')).focusNumbers)()`), true, 'and it’s saved with the settings');
	// and from the numbers
	await wiggle(p);
	const c = await p.at('.binders-focus-corner');
	await p.click(c.x, c.y);
	const items = await menuItems(p);
	t.ok(items.includes('Set a goal for today...') && items.includes('Start counting from here') && items.some((x) => /^The Lighthouse: [\d,]+ words$/.test(x)), 'a click on the numbers opens the same menu, with the binder’s words and the goal: ' + j(items));
	t.ok(items.includes('Previous scene: Arrival') && items.includes('Next scene: Storm warning'), 'and the scenes to go to');
	await clickMenu(p, 'Show word counts');
	await p.sleep(400);
	t.eq(j(await pieces(p)), j(off), 'unticking it there takes the numbers away');
	// and in the text's own menu, while in focus
	const line = await p.ev(`(() => { const b = [...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-line')].find(e => e.textContent.trim()).getBoundingClientRect(); return { x: b.left + 60, y: b.top + 8 }; })()`);
	await p.right(line.x, line.y);
	t.ok((await menuItems(p)).includes('Focus mode'), 'a right click in the text has “Focus mode” in the editor’s menu: ' + j(await menuItems(p)));
	await closeMenus(p);
	await leave(p, h);
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await p.right(line.x + 172, line.y + 120);
	t.ok(!(await menuItems(p)).includes('Focus mode'), 'out of focus, the editor’s menu has nothing of it');
	await closeMenus(p);
});

test('everything on: a narrow window and “Readable line length” off have a strip along the top; the numbers hide while typing and return on a pause', async (p, h, t) => {
	await set(p, { focusPlace: true, focusNumbers: true, focusNeighbours: true });
	await openNote(p, KEEPER);
	await caretEnd(p);
	await enter(p, h);
	await wiggle(p);
	t.ok(await p.ev(`document.querySelector('.binders-focus-leaf').classList.contains('has-margins')`), 'with room beside the text, the place and synopsis are a note in the margin');
	const r = await p.ev(`(() => { const n = document.querySelector('.binders-focus-note').getBoundingClientRect(), c = document.querySelector('.binders-focus-leaf .cm-contentContainer').getBoundingClientRect(); return { right: Math.round(n.right), text: Math.round(c.left) }; })()`);
	t.ok(r.right < r.text, `beside the text, not over it: ${j(r)}`);
	// typing: all gone; a pause: the numbers alone
	await press(p, ' She waited.');
	await p.sleep(800);
	const op = () => p.ev(`JSON.stringify({ top: Number(getComputedStyle(document.querySelector('.binders-focus-top')).opacity), corner: Number(getComputedStyle(document.querySelector('.binders-focus-corner')).opacity) })`).then(JSON.parse);
	let o = await op();
	t.ok(o.top < 0.1 && o.corner < 0.1, `while typing, the place and the numbers are gone: ${j(o)}`);
	await p.sleep(2700);
	o = await op();
	t.ok(o.top < 0.1 && o.corner > 0.9, `after a pause the numbers are back, alone: ${j(o)}`);
	t.eq(await p.ev(`document.querySelector('.binders-focus-session').textContent`), '2 today', 'with the words just written');
	await wiggle(p);
	o = await op();
	t.ok(o.top === 1 && o.corner === 1, 'and the pointer brings everything back');
	// no room beside the text
	await p.ev(`(() => { app.vault.setConfig('readableLineLength', false); return 1; })()`);
	await p.sleep(500);
	await wiggle(p, 700, 300);
	t.ok(!(await p.ev(`document.querySelector('.binders-focus-leaf').classList.contains('has-margins')`)), 'with “Readable line length” off there’s no margin');
	const strip = await p.ev(`(() => { const s = getComputedStyle(document.querySelector('.binders-focus-top')), c = getComputedStyle(document.querySelector('.binders-focus-corner')); return { bg: s.backgroundColor, page: getComputedStyle(document.querySelector('.binders-focus-leaf .view-content')).backgroundColor, corner: c.backgroundColor }; })()`);
	t.ok(strip.bg === strip.page && !/rgba\(0, 0, 0, 0\)/.test(strip.bg), `the place is a strip along the top, on the page’s color: ${j(strip)}`);
	t.ok(!/rgba\(0, 0, 0, 0\)/.test(strip.corner), 'and the numbers are drawn as the status bar is, so text doesn’t show through');
});

test('the scenes before and after, turned on and off in the middle of a long note, don’t move its text; the scene after stands under the last line as in the manuscript', async (p, h, t) => {
	await novel(p, 3, 24);
	await openNote(p, N(2));
	await caretAt(p, 'Scene 2 paragraph 12.');
	await p.ev(`(() => { const e = ${ED}; e.scrollIntoView({ from: e.getCursor(), to: e.getCursor() }, true); return 1; })()`);
	await p.sleep(400);
	await enter(p, h);
	const y0 = (await at(p)).y;
	await set(p, { focusNeighbours: true });
	await p.sleep(600);
	t.ok((await pieces(p)).here, 'they’re drawn');
	t.ok(Math.abs((await at(p)).y - y0) <= 1, `the text being written hasn’t moved (${y0} then, ${(await at(p)).y} now)`);
	await set(p, { focusNeighbours: false });
	await p.sleep(300);
	t.ok(Math.abs((await at(p)).y - y0) <= 1, 'nor when they’re taken away');
	// under the last line
	await set(p, { focusNeighbours: true });
	await caretEnd(p);
	await press(p, ' ');
	await p.sleep(700);
	const gap = await p.ev(`(() => { const ls = [...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-line')].filter(e => e.textContent.trim()); const last = ls[ls.length - 1].getBoundingClientRect(), next = document.querySelector('.binders-focus-near.is-after .binders-manuscript-title').getBoundingClientRect(); return Math.round(next.top - last.bottom); })()`);
	t.ok(gap > 20 && gap < 120, `the scene after starts a break below the last line, not half a screen: ${gap} px`);
	t.ok(held(await at(p)), 'and the last line is still held at the line: ' + j(await at(p)));
});

// ---- Escape ----

test('Escape is left to a menu, the command palette, a dialog, the search field and Vim; alone, it leaves', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await enter(p, h);
	await wiggle(p);
	const b = await p.at('.binders-focus-leave');
	await p.right(b.x, b.y);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'a menu is open');
	await p.key('Escape'); await p.sleep(300);
	t.ok((await inFocus(p)) && !(await p.ev(`!!document.querySelector('.menu')`)), 'Escape closes the menu, and focus stays');
	await p.ev(`(() => { app.commands.executeCommandById('command-palette:open'); return 1; })()`); await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector('.prompt')`), 'the command palette opens over the page');
	await p.key('Escape'); await p.sleep(300);
	t.ok((await inFocus(p)) && !(await p.ev(`!!document.querySelector('.prompt')`)), 'Escape closes the palette, and focus stays');
	await p.ev(`(() => { ${F}.askGoal(); return 1; })()`); await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector('.modal-container')`), 'a dialog');
	await p.key('Escape'); await p.sleep(400);
	t.ok((await inFocus(p)) && !(await p.ev(`!!document.querySelector('.modal-container')`)), 'Escape closes the dialog, and focus stays');
	await p.ev(`(() => { ${ED}.focus(); app.commands.executeCommandById('editor:open-search'); return 1; })()`); await p.sleep(400);
	t.ok(await p.ev(`document.activeElement?.matches('input')`), 'the note’s search field');
	await p.key('Escape'); await p.sleep(300);
	t.ok(await inFocus(p), 'Escape closes the search, and focus stays');
	// Vim's keys: Escape is Vim's (it's settled on the way in)
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await leave(p, h);
	await p.ev(`(() => { app.vault.setConfig('vimMode', true); return 1; })()`); await p.sleep(400);
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await enter(p, h);
	await p.key('Escape'); await p.sleep(400);
	t.ok(await inFocus(p), 'with Vim keys on, Escape doesn’t leave');
	t.eq(await p.ev(`document.querySelector('.binders-focus-leave').getAttribute('aria-label')`), 'Leave focus mode', 'and the way out doesn’t say it does');
	await wiggle(p);
	const out = await p.at('.binders-focus-leave');
	await p.click(out.x, out.y);
	await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
	t.ok(!(await inFocus(p)), 'the button leaves');
	await p.ev(`(() => { app.vault.setConfig('vimMode', false); return 1; })()`); await p.sleep(400);
	// alone, Escape leaves
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await enter(p, h);
	t.eq(await p.ev(`document.querySelector('.binders-focus-leave').getAttribute('aria-label')`), 'Leave focus mode (Esc)', 'the way out names the key');
	await p.key('Escape');
	await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
	t.ok(!(await inFocus(p)), 'Escape in the text leaves');
});

test('Escape is left to a note preview over a link (.popover.hover-popover): focus stays; with it gone, Escape leaves', async (p, h, t) => {
	await openNote(p, KEEPER);
	await caretEnd(p);
	await enter(p, h);
	// a real preview, made the way Obsidian's page preview makes one; where none comes, a stand-in with its class
	const real = await p.ev(`(async () => {
		app.workspace.trigger('hover-link', { event: new MouseEvent('mouseover', { ctrlKey: true, metaKey: true, bubbles: true }), source: 'editor', hoverParent: { hoverPopover: null }, targetEl: document.querySelector('.cm-content'), linktext: ${j(ARRIVAL.replace(/\.md$/, ''))}, sourcePath: ${j(KEEPER)} });
		await new Promise(r => setTimeout(r, 1200));
		return !!document.querySelector('.popover.hover-popover');
	})()`);
	if (!real) await p.ev(`(() => { document.body.createDiv({ cls: 'popover hover-popover' }); return 1; })()`);
	t.ok(await p.ev(`!!document.querySelector('.popover.hover-popover')`), 'a preview is showing' + (real ? '' : ' (a stand-in: Obsidian made none here)'));
	await p.key('Escape'); await p.sleep(400);
	t.ok(await inFocus(p), 'Escape with a preview open doesn’t leave focus mode');
	await p.ev(`(() => { document.querySelectorAll('.popover.hover-popover').forEach(e => e.remove()); return 1; })()`);
	await p.key('Escape');
	await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
	t.ok(!(await inFocus(p)), 'with it gone, Escape leaves');
});

// ---- Obsidian as it was ----

test('Obsidian is exactly as it was after leaving, after a reload while in focus, and after the plugin is turned off while in focus', async (p, h, t) => {
	await set(p, { focusPlace: true, focusNumbers: true, focusNeighbours: true, focusDim: true });
	await openNote(p, KEEPER);
	await caretEnd(p);
	const before = await chrome(p), saved = await layout(p);
	const sizer = () => p.ev(`[...document.querySelector('.workspace-leaf.mod-active .cm-sizer').children].map(e => e.className).join(' | ')`);
	const column = await sizer();
	const clean = () => p.ev(`JSON.stringify({ body: [...document.body.classList].filter(c => /binders/.test(c)), leaf: [...document.querySelector('.workspace-leaf.mod-active').classList].filter(c => /binders|has-|is-typewriter/.test(c)), left: document.querySelectorAll('.binders-focus-top, .binders-focus-corner, .binders-focus-near, .binders-focus-live').length, style: document.querySelector('.workspace-leaf.mod-active').getAttribute('style') ?? '' })`);
	const CLEAN = j({ body: [], leaf: [], left: 0, style: '' });
	await enter(p, h);
	t.eq(j(await chrome(p)), j(['0x0', '0x0', '0x0', '0x0', '0x0']), 'in focus');
	t.eq(await layout(p), saved, 'the layout Obsidian would save is what it was');
	await press(p, ' TYPED-IN-FOCUS.');
	await leave(p, h);
	await p.sleep(1700);
	t.eq(j(await chrome(p)), j(before), 'after leaving, everything around the note is back, the size it was');
	t.eq(await layout(p), saved, 'the layout is what it was');
	t.eq(await sizer(), column, 'the note’s own page has nothing left in it');
	t.eq(await clean(), CLEAN, 'no class, element or style of focus mode’s is left');
	t.ok(await p.ev(`${CM}.state.selection.ranges.length === 1 && document.activeElement?.matches('.cm-content')`), 'the cursor is still in the text');
	// a reload while in focus (after Obsidian has saved the note: it saves two seconds after typing stops, focus or not)
	await enter(p, h);
	await press(p, ' BEFORE-RELOAD.');
	await p.sleep(2600);
	t.eq(await p.ev(`JSON.stringify(Object.keys(localStorage).filter(k => /binders/.test(k) && /focus/.test(k) && !/hinted/.test(k)))`), '[]', 'nothing is kept that says focus is on');
	await reload(p);
	await p.focusMain();
	await p.sleep(600);
	t.ok(!(await inFocus(p)), 'after a reload Obsidian isn’t in focus');
	t.eq(j(await chrome(p)), j(before), 'and everything is where it was');
	t.eq(await clean(), CLEAN, 'with nothing of focus mode’s on the page');
	t.ok(disk(p, KEEPER).includes('TYPED-IN-FOCUS. BEFORE-RELOAD.'), 'what was typed is in the note');
	// the plugin turned off while in focus
	await openNote(p, KEEPER);
	await caretEnd(p);
	await start(p);
	await set(p, { focusPlace: true, focusNumbers: true, focusNeighbours: true });
	await enter(p, h);
	await press(p, ' BEFORE-OFF.');
	t.ok(await inFocus(p), 'in focus again');
	try {
		await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
		await p.sleep(600);
		t.eq(j(await chrome(p)), j(before), 'with the plugin turned off, everything is back');
		t.eq(await clean(), CLEAN, 'nothing of focus mode’s is left on the page');
		t.eq(await sizer(), column, 'nor in the note’s page');
		t.eq(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .view-actions > *')].filter(e => e.getAttribute('aria-label') === 'Focus mode').length`), 0, 'nor its button in the note’s header');
		t.eq(await p.ev(`${ED}.getValue().includes('BEFORE-OFF.')`), true, 'and the text is as typed');
		await press(p, ' AFTER-OFF.');
		await p.sleep(2500);
		t.ok(disk(p, KEEPER).includes('BEFORE-OFF. AFTER-OFF.'), 'the editor goes on working, and saving');
	} finally {
		await p.ev(`(async () => { await app.plugins.enablePlugin('binders'); await app.plugins.plugins.binders.binders.ready; })().then(() => 1)`);
		await p.sleep(500);
	}
});

// ---- never lose writing ----

test('nothing typed is lost: during the fade, in focus, while leaving; undo still takes it back (a note)', async (p, h, t) => {
	await set(p, { focusNeighbours: true, focusNumbers: true });
	await openNote(p, KEEPER);
	await caretEnd(p);
	const text0 = await p.ev(`${ED}.getValue()`);
	await enter(p, h, false);
	await press(p, ' DURING-THE-FADE');
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	await press(p, ' ON-ARRIVING');
	await p.sleep(500);
	await press(p, ' IN-FOCUS');
	await h.run('focus');
	await press(p, ' WHILE-LEAVING');
	await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
	await press(p, ' AFTER');
	const want = text0.replace(/\n$/, '') + ' DURING-THE-FADE ON-ARRIVING IN-FOCUS WHILE-LEAVING AFTER';
	t.eq(await p.ev(`${ED}.getValue().trimEnd()`), want.trimEnd(), 'every key typed on the way in, in focus and on the way out is in the text, in order');
	await p.sleep(2500);
	t.eq(disk(p, KEEPER).trimEnd(), want.trimEnd(), 'and in the note');
	// undo history is the editor's own, untouched by going in and out
	for (let i = 0; i < 40 && (await p.ev(`${ED}.getValue()`)) !== text0; i++) await p.ev(`(() => { ${ED}.undo(); return 1; })()`);
	t.eq(await p.ev(`${ED}.getValue()`), text0, 'undo takes it all back, through the way in and out');
});

test('nothing typed is lost in the manuscript: during the fade, in focus, across sections, while leaving', async (p, h, t) => {
	await novel(p, 4, 6);
	await openMs(p, 'Novel');
	await msCaret(p, N(1), 'end');
	const t1 = disk(p, N(1)), t2 = disk(p, N(2));
	await enter(p, h, false);
	await press(p, ' DURING-THE-FADE');
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	await press(p, ' IN-FOCUS');
	await p.sleep(400);
	t.ok(await p.ev(`app.commands.commands['binders:next-scene'].checkCallback(true) === true`), '“Go to next scene” is offered in the manuscript');
	await h.run('next-scene');
	await p.sleep(600);
	t.eq((await atMs(p))?.file, N(2), 'puts the cursor in the next section');
	t.ok(await inFocus(p), 'still in focus');
	await press(p, 'NEXT-SCENE ');
	await h.run('previous-scene');
	await p.sleep(600);
	t.eq((await atMs(p))?.file, N(1), '“Go to previous scene” goes back, to the section’s end');
	await press(p, ' BACK');
	await h.run('focus');
	await press(p, ' WHILE-LEAVING');
	await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
	await p.sleep(2600);
	// (the end of a section is after its last line break, as Mod+End puts the cursor there)
	t.eq(disk(p, N(1)).slice(-80), (t1 + ' DURING-THE-FADE IN-FOCUS BACK WHILE-LEAVING').slice(-80), 'the first scene has everything typed in it, in order');
	t.eq(disk(p, N(1)).length, (t1 + ' DURING-THE-FADE IN-FOCUS BACK WHILE-LEAVING').length, 'and nothing else');
	t.eq(disk(p, N(2)), t2.replace('Scene 2 paragraph 1.', 'NEXT-SCENE Scene 2 paragraph 1.'), 'and the second what was typed at its start');
	t.eq(await p.ev(`${F}.session.words('Novel')`), 5, 'the day’s words count what’s typed in the manuscript’s sections');
});

test('“Go to previous scene” and “Go to next scene” in a note tab: what was typed is saved, focus stays, the cursor is where reading carries on; in reading view too', async (p, h, t) => {
	await openNote(p, KEEPER);
	t.ok(await p.ev(`app.commands.commands['binders:next-scene'].checkCallback(true) === true && app.commands.commands['binders:previous-scene'].checkCallback(true) === true`), 'both commands are offered on a note of a binder, in focus or not');
	t.ok(await p.ev(`['binders:focus', 'binders:next-scene', 'binders:previous-scene'].every(id => !(app.hotkeyManager?.getDefaultHotkeys?.(id) ?? []).length && !app.commands.commands[id].hotkeys?.length)`), 'none has a hotkey of its own');
	await caretEnd(p);
	await enter(p, h);
	await press(p, ' TYPED-BEFORE-GOING-ON');
	await h.run('next-scene');
	await until(p, `${VIEWOF}.file?.path === ${j(STORM)}`);
	await p.sleep(500);
	t.ok(await inFocus(p), 'still in focus in the next scene');
	t.ok(disk(p, KEEPER).includes('TYPED-BEFORE-GOING-ON'), 'what was typed in the scene left is in its note at once');
	t.eq(await p.ev(`(() => { const e = ${ED}; return e.posToOffset(e.getCursor()) === e.getValue().indexOf('The radio said'); })()`), true, 'the cursor is at the start of its text');
	await press(p, 'AT-THE-START ');
	await h.run('previous-scene');
	await until(p, `${VIEWOF}.file?.path === ${j(KEEPER)}`);
	await p.sleep(500);
	t.ok(await inFocus(p), 'and back');
	t.ok(disk(p, STORM).includes('AT-THE-START The radio said'), 'with that scene’s typing saved');
	t.eq(await p.ev(`(() => { const e = ${ED}; return e.getValue().slice(0, e.posToOffset(e.getCursor())).endsWith('TYPED-BEFORE-GOING-ON'); })()`), true, 'going back, the cursor is at the end of the scene before');
	await press(p, ' AND-MORE');
	await leave(p, h);
	// at the binder's ends
	await openNote(p, PROLOGUE);
	t.ok(await p.ev(`app.commands.commands['binders:previous-scene'].checkCallback(true) === false && app.commands.commands['binders:next-scene'].checkCallback(true) === true`), 'the first scene has no scene before');
	await p.sleep(2300);
	t.ok(disk(p, KEEPER).includes('TYPED-BEFORE-GOING-ON AND-MORE'), 'and what was typed last is saved');
	// reading view
	await openNote(p, ARRIVAL);
	await p.ev(`(async () => { const l = app.workspace.getMostRecentLeaf(), s = l.getViewState(); s.state.mode = 'preview'; await l.setViewState(s); })().then(() => 1)`);
	await p.sleep(500);
	t.eq(await p.ev(`${VIEWOF}.getMode()`), 'preview', 'a note in reading view');
	await set(p, { focusNeighbours: true });
	await enter(p, h);
	t.ok(await inFocus(p), 'goes into focus');
	await p.sleep(500);
	const near = await pieces(p);
	t.ok(near.before && near.here && near.after, 'with the scenes before and after around what’s read: ' + j(near));
	await h.run('next-scene');
	await until(p, `${VIEWOF}.file?.path === ${j(KEEPER)}`);
	await p.sleep(400);
	t.ok((await inFocus(p)) && (await p.ev(`${VIEWOF}.getMode()`)) === 'preview', 'the command goes on to the next scene, still reading, still in focus');
	await p.ev(`(async () => { const l = app.workspace.getMostRecentLeaf(), s = l.getViewState(); s.state.mode = 'source'; await l.setViewState(s); })().then(() => 1)`);
	await p.sleep(500);
	const again = await pieces(p);
	t.ok(again.before && again.here && again.after, 'back to editing, they’re around the editor: ' + j(again));
	// a click on the scene after goes there
	const n = await p.at('.binders-focus-near.is-after .binders-manuscript-title');
	await p.ev(`(() => { document.querySelector('.binders-focus-near.is-after').scrollIntoView({ block: 'center' }); return 1; })()`);
	await p.sleep(300);
	const n2 = await p.at('.binders-focus-near.is-after .binders-manuscript-title');
	await p.click((n2 ?? n).x, (n2 ?? n).y);
	await until(p, `${VIEWOF}.file?.path === ${j(STORM)}`);
	t.ok(await inFocus(p), 'a click on the scene after goes to it, in focus');
});

// ---- where focus mode isn't ----

test('a note that isn’t in a binder is untouched: no button, the commands aren’t offered, its page is as Obsidian draws it', async (p, h, t) => {
	await p.ev(`app.vault.create(${j(OUTSIDE)}, 'A note outside any binder.\\n\\nWith two paragraphs.\\n').then(() => 1)`);
	const shape = () => p.ev(`(() => { const leaf = document.querySelector('.workspace-leaf.mod-active'); const walk = (e, d) => d > 6 ? '' : e.tagName + '.' + [...e.classList].filter(c => !/^(cm-active|cm-focused|is-focused|mod-active)$/.test(c)).sort().join('.') + (e.getAttribute('style') ? '{' + e.getAttribute('style').replace(/\\d+(\\.\\d+)?px/g, 'Npx') + '}' : '') + '[' + [...e.children].map(c => walk(c, d + 1)).join(',') + ']'; return walk(leaf, 0); })()`);
	try {
		await openNote(p, OUTSIDE);
		await p.ev(`(() => { ${ED}.setCursor(0, 0); return 1; })()`);
		await p.sleep(400);
		t.eq(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .view-actions > *')].filter(e => e.getAttribute('aria-label') === 'Focus mode').length`), 0, 'no focus button in its header');
		t.eq(await p.ev(`['binders:focus', 'binders:next-scene', 'binders:previous-scene'].map(id => app.commands.commands[id].checkCallback(true) === true).join()`), 'false,false,false', 'the commands aren’t offered');
		await h.run('focus');
		await p.sleep(400);
		t.ok(!(await inFocus(p)) && !(await p.ev(`document.body.className.includes('binders-focus')`)), 'and running one does nothing');
		const withPlugin = await shape(), body = await p.ev(`document.body.className`);
		await press(p, 'Typed here. ');
		await p.sleep(500);
		t.eq(await p.ev(`JSON.stringify(${F}.session.toJSON().notes)`), '{}', 'its words aren’t counted');
		// the same note with the plugin off
		await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
		await p.sleep(500);
		t.eq(await shape(), withPlugin, 'its page is element for element what it is with the plugin turned off');
		t.eq(await p.ev(`document.body.className`), body, 'and so are the window’s classes');
	} finally {
		await p.ev(`(async () => { if (!app.plugins.plugins.binders) { await app.plugins.enablePlugin('binders'); await app.plugins.plugins.binders.binders.ready; } })().then(() => 1)`);
		await p.sleep(400);
	}
	// a binder's note has the button; the binder's own note doesn't
	await openNote(p, KEEPER);
	t.eq(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .view-actions > *')].filter(e => e.getAttribute('aria-label') === 'Focus mode').length`), 1, 'a note of a binder has the button');
	await openNote(p, L + 'The Lighthouse.md');
	t.eq(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .view-actions > *')].filter(e => e.getAttribute('aria-label') === 'Focus mode').length`), 0, 'the binder’s own note doesn’t');
	t.eq(await p.ev(`app.commands.commands['binders:focus'].checkCallback(true) === true`), false, 'nor the command');
	// the button goes in
	await openNote(p, KEEPER);
	await p.ev(`(() => { [...document.querySelectorAll('.workspace-leaf.mod-active .view-actions > *')].find(e => e.getAttribute('aria-label') === 'Focus mode').click(); return 1; })()`);
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	t.ok(await inFocus(p), 'the button goes into focus');
});

test('focus ends when another tab is taken up or the tab shows a note outside the binder; another scene of the binder keeps it; so does the manuscript’s button, and leaving the manuscript ends it', async (p, h, t) => {
	await p.ev(`app.vault.create(${j(OUTSIDE)}, 'A note outside any binder.\\n').then(() => 1)`);
	await openNote(p, KEEPER);
	const before = await chrome(p);
	await enter(p, h);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(app.vault.getAbstractFileByPath(${j(ARRIVAL)})); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await p.sleep(600);
	t.ok(!(await inFocus(p)), 'a note opened in a new tab ends focus');
	t.ok((await chrome(p)).every((s) => s !== '0x0'), 'and the tabs are there to see it in');
	await p.ev(`(() => { app.workspace.getMostRecentLeaf().detach(); return 1; })()`);
	await p.sleep(500);
	await openNote(p, KEEPER);
	await enter(p, h);
	await p.ev(`app.workspace.getMostRecentLeaf().openFile(app.vault.getAbstractFileByPath(${j(STORM)})).then(() => 1)`);
	await p.sleep(600);
	t.ok(await inFocus(p), 'another scene of the binder opened in the tab (a link followed): still in focus');
	await p.ev(`app.workspace.getMostRecentLeaf().openFile(app.vault.getAbstractFileByPath(${j(OUTSIDE)})).then(() => 1)`);
	await p.sleep(600);
	t.ok(!(await inFocus(p)), 'a note outside the binder in the tab ends it');
	t.eq(j(await chrome(p)), j(before), 'with everything back');
	t.eq(await p.ev(`document.querySelectorAll('.binders-focus-top, .binders-focus-near, .binders-focus-corner').length`), 0, 'and nothing of focus mode’s on that note');
	// the manuscript
	await openMs(p, 'The Lighthouse');
	const btn = await p.at('.workspace-leaf.mod-active .binders-focus-button');
	t.ok(!!btn, 'the manuscript’s toolbar has the way in');
	await p.click(btn.x, btn.y);
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	t.ok(await inFocus(p), 'which goes into focus');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(500);
	t.ok(!(await inFocus(p)), 'the corkboard shown instead ends it');
	t.eq(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-focus-button:not(.is-hidden)')`), false, 'the corkboard has no such button');
	t.eq(await p.ev(`app.commands.commands['binders:focus'].checkCallback(true) === true`), false, 'nor the command');
});

test('a split window: the other panes go with the rest, and are back afterwards, the same size', async (p, h, t) => {
	await openNote(p, ARRIVAL);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(app.vault.getAbstractFileByPath(${j(KEEPER)})); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await p.sleep(700);
	const panes = () => p.ev(`JSON.stringify([...document.querySelectorAll('.mod-root .workspace-tabs')].map(e => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }))`);
	const before = await panes(), saved = await layout(p);
	t.eq(JSON.parse(before).length, 2, 'two panes side by side');
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await enter(p, h);
	const now = JSON.parse(await panes());
	const wide = String(await p.ev(`innerWidth`));
	t.ok(now.filter((x) => x === '0x0').length === 1 && now.some((x) => x.startsWith(wide + 'x')), `in focus the other pane is out of sight and the note has the whole window: ${j(now)}`);
	t.eq(await p.ev(`${VIEWOF}.file.path`), KEEPER, 'the note that was being written');
	await leave(p, h);
	t.eq(await panes(), before, 'afterwards both panes are back, the size they were');
	t.eq(await layout(p), saved, 'and the layout is what it was');
});

test('the layout changed under focus mode (a pane split beside the tab, the tab’s own pane split, panes closed): the tab being written in has the window all along, never a blank one, and everything is back afterwards', async (p, h, t) => {
	await openNote(p, ARRIVAL);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split', 'vertical'); await l.openFile(app.vault.getAbstractFileByPath(${j(KEEPER)})); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await p.sleep(700);
	await p.ev(`(() => { ${ED}.focus(); window.__focused = app.workspace.getMostRecentLeaf(); window.__other = app.workspace.getLeavesOfType('markdown').find(l => l !== window.__focused && l.getRoot() === app.workspace.rootSplit); window.__made = []; return 1; })()`);
	const start = await layout(p);
	await enter(p, h);
	const wide = await p.ev(`innerWidth`);
	/** Each pane of the middle of the window as "width x height" (0x0 while hidden), the tab in focus first. */
	const SEEN = `(() => { const size = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }; const mine = window.__focused.containerEl; return { focus: document.body.classList.contains('binders-focus'), mine: size(mine), text: size(mine.querySelector('.cm-content')), others: [...document.querySelectorAll('.mod-root .workspace-leaf')].filter(e => e !== mine).map(size) }; })()`;
	const whole = (g, what) => {
		t.ok(g.focus, `${what}: still in focus mode`);
		t.ok(g.mine.startsWith(wide + 'x') && g.text !== '0x0', `${what}: the tab being written in has the window, and its text is in sight (${j(g)})`);
		t.ok(g.others.length > 0 && g.others.every((x) => x === '0x0'), `${what}: every other pane is out of sight (${j(g.others)})`);
	};
	whole(await p.ev(SEEN), 'in focus');
	// Each change is looked at twice: at once, in the same breath as the change (before Obsidian has said anything of
	// it, and before the page is drawn again), and once things have settled.
	const change = async (what, code) => {
		const now = await p.ev(`(async () => { ${code}; await Promise.resolve(); return ${SEEN}; })()`);
		whole(now, `${what}, at once`);
		await p.sleep(500);
		whole(await p.ev(SEEN), `${what}, a moment later`);
	};
	// (a pane made without being gone to, as a plugin or a synced layout might: Obsidian's own commands that split a
	// pane go to the new one, and focus mode ends when its tab is left)
	const SPLIT = `const split = (from, way) => { const l = new from.constructor(app); app.workspace.splitLeaf(from, l, way); window.__made.push(l); }`;
	await change('the other pane split in two', `${SPLIT}; split(window.__other, 'horizontal')`);
	// (the tab's own pane split: Obsidian puts the tab's group inside a new split, which is hidden unless it is known for the tab's)
	await change('the tab’s own pane split in two', `${SPLIT}; split(window.__focused, 'horizontal')`);
	await change('and split again, the other way', `${SPLIT}; split(window.__focused, 'vertical')`);
	t.eq(await p.ev(`document.querySelectorAll('.mod-root .workspace-leaf').length`), 5, 'five panes now');
	// (closed again: the splits made for them go, and the tab is put back where it was)
	await change('a pane beside the tab closed', `window.__made.pop().detach()`);
	await change('the other one beside it closed', `window.__made.pop().detach()`);
	await change('the pane first made closed', `window.__made.pop().detach()`);
	t.eq(await p.ev(`${VIEWOF}.file.path`), KEEPER, 'the note that was being written, all along');
	await leave(p, h);
	const after = await p.ev(`(() => { const out = { sizes: [...document.querySelectorAll('.mod-root .workspace-tabs')].map(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }), left: [...document.querySelectorAll('.workspace-split, .workspace-tabs, .workspace-leaf')].filter(e => /binders-focus/.test(e.className)).length }; delete window.__focused; delete window.__other; delete window.__made; return out; })()`);
	t.eq(j(after.sizes), j([true, true]), 'afterwards both panes are back in sight');
	t.eq(after.left, 0, 'and nothing of focus mode is left on any pane');
	t.eq(await layout(p), start, 'the layout is what it was before focus mode');
});

// ---- the day's words ----

test('the day’s words: counted in and out of focus, kept on this device and never in a note; a goal reached shows quietly; counting can start again', async (p, h, t) => {
	const before = await texts(p);
	await openNote(p, KEEPER);
	await caretEnd(p);
	await press(p, ' One two three.');
	await p.sleep(700);
	t.eq(await p.ev(`${F}.session.words('The Lighthouse')`), 3, 'words typed in a binder’s note before focus count');
	await set(p, { focusNumbers: true, focusGoal: 8 });
	await enter(p, h);
	await wiggle(p);
	t.eq(await p.ev(`document.querySelector('.binders-focus-session').textContent`), '3 / 8 today', 'the numbers show them against the goal');
	t.ok(!(await p.ev(`document.querySelector('.binders-focus-session').classList.contains('is-complete')`)), 'not reached yet');
	await press(p, ' Four five six seven eight.');
	await p.sleep(900);
	t.eq(await p.ev(`document.querySelector('.binders-focus-session').textContent`), '8 / 8 today', 'more typed in focus');
	const reached = await p.ev(`(() => { const c = document.querySelector('.binders-focus-corner'), s = document.querySelector('.binders-focus-session'); return { cls: s.classList.contains('is-complete'), shown: Number(getComputedStyle(c).opacity), held: c.classList.contains('is-reached'), color: getComputedStyle(s).color, plain: getComputedStyle(document.querySelector('.binders-focus-scene')).color, notices: document.querySelectorAll('.notice').length, modals: document.querySelectorAll('.modal').length }; })()`);
	t.ok(reached.cls && reached.held && reached.shown > 0.9 && reached.color !== reached.plain, `the goal reached: the numbers show through the typing, the day’s in the color of a target met: ${j(reached)}`);
	t.eq(reached.notices + reached.modals, 0, 'and nothing else happens');
	// deleting counts against
	for (let i = 0; i < 7; i++) await p.key('Backspace');
	await p.sleep(700);
	t.eq(await p.ev(`document.querySelector('.binders-focus-session').textContent`), '7 / 8 today', 'a word deleted is a word fewer');
	// start again
	await wiggle(p);
	const c = await p.at('.binders-focus-corner');
	await p.click(c.x, c.y);
	await clickMenu(p, 'Start counting from here');
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelector('.binders-focus-session').textContent`), '0 / 8 today', '“Start counting from here” starts the day again');
	// the goal, from the menu
	await p.click(c.x, c.y);
	await clickMenu(p, 'Change today’s goal...');
	await until(p, `!!document.querySelector('.modal input')`);
	t.eq(await p.ev(`document.querySelector('.modal input').value`), '8', 'the goal can be changed from the menu');
	await p.ev(`(() => { const i = document.querySelector('.modal input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
	await p.key('Enter');
	await p.sleep(500);
	t.eq(await p.ev(`${PL}.settings.focusGoal`), 0, 'emptied, there’s no goal');
	t.eq(await p.ev(`document.querySelector('.binders-focus-session').textContent`), '0 today', 'and the numbers say so');
	// where it's kept
	await leave(p, h);
	await p.sleep(2400);
	const kept = await p.ev(`JSON.stringify(app.loadLocalStorage('binders-session'))`).then(JSON.parse);
	t.ok(kept && typeof kept.day === 'string' && Array.isArray(kept.notes[KEEPER]), 'the session is in the vault’s local storage: ' + j(kept));
	const data = await p.ev(`app.vault.adapter.read(app.vault.configDir + '/plugins/binders/data.json')`);
	t.ok(!/binders-session|"notes":|"day":/.test(data), 'not in the plugin’s settings');
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) { if (path !== KEEPER) t.eq(after[path], text, `“${path}” is unchanged`); }
	t.ok(!/session|focus|today/.test(after[KEEPER].split('---')[1]), 'and nothing is written in the note’s properties');
	// a renamed note keeps its words
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await caretEnd(p);
	await press(p, ' Nine ten.');
	await p.sleep(700);
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${j(KEEPER)}), ${j(L + 'Part One/The warden.md')}).then(() => 1)`);
	await p.sleep(500);
	t.eq(await p.ev(`${F}.session.words('The Lighthouse')`), 2, 'a note renamed keeps the words written in it today');
});

// What tells a save of what was typed here from words that arrive from elsewhere: the texts the note's editor has held
// (`hold` in focus.ts), compared with what lands on disk. Typed straight through Obsidian's own save (two seconds
// after a key), the text saved is one the editor held in the middle of the typing.
test('the day’s words: a save in the middle of typing is the writer’s own and changes nothing; words that arrive from another program aren’t written today; the same without the editor’s own document', async (p, h, t) => {
	const words = () => p.ev(`${F}.session.words('The Lighthouse')`);
	const kinds = () => p.ev(`JSON.stringify([...new Set((${F}.held.get(${j(KEEPER)}) ?? []).map(x => typeof x))])`);
	/** Words typed one after another with no pause long enough for the count to wait on, for longer than Obsidian
	    takes to save: true once the note on disk has some of them and not yet all. */
	const through = async (list) => {
		let mid = false;
		for (const w of list) {
			await press(p, ' ' + w);
			await p.sleep(180);
			const d = disk(p, KEEPER);
			if (d.includes(list[0]) && !d.includes(list[list.length - 1])) mid = true;
		}
		return mid;
	};
	await openNote(p, KEEPER);
	await caretEnd(p);
	const first = ['alder', 'birch', 'cedar', 'dogwood', 'elm', 'fir', 'gorse', 'hazel', 'ivy', 'juniper', 'larch', 'maple', 'nettle', 'oak'];
	t.ok(await through(first), 'Obsidian saved the note in the middle of the typing');
	await p.sleep(2600);
	t.ok(disk(p, KEEPER).includes('nettle oak'), 'and all of it once the typing stopped');
	t.eq(await words(), first.length, 'the words typed are the day’s words: neither save was taken for words from elsewhere');
	t.eq(await kinds(), j(['object']), 'what the editor held is kept as its documents, not read through at every key');
	// from elsewhere: another program writes the note, with more words (and with the other kind of line ending)
	for (const [more, crlf] of [[' Pine quince rowan.', false], [' Sorrel thistle.', true]]) {
		const now = disk(p, KEEPER).replace(/\r/g, ''), next = (now.replace(/\s+$/, '') + more + '\n');
		await p.ev(`app.vault.adapter.write(${j(KEEPER)}, ${j(crlf ? next.replace(/\n/g, '\r\n') : next)}).then(() => 1)`);
		await p.sleep(900);
		t.eq(await words(), first.length, `words written by another program${crlf ? ', with the other line ending,' : ''} aren’t counted as written today`);
	}
	t.ok(/Sorrel thistle\.\s*$/.test(await p.ev(`${ED}.getValue()`)), 'the editor shows what arrived');
	// and typing carries on from there
	await caretEnd(p);
	await press(p, ' Upland violet.');
	await p.sleep(2700);
	t.ok(disk(p, KEEPER).includes('Sorrel thistle. Upland violet.'), 'what’s typed next is saved after it');
	t.eq(await words(), first.length + 2, 'and counted');
	// Without the editor's own document (an Obsidian whose `Editor` had no `cm`): a short fingerprint of each text
	// instead, and the same answers. (Hidden only from the one look that asks for the document: the editor's own
	// `getValue()`, which reads the text for the fingerprint, needs it, as Obsidian's editor does all the time.)
	await p.ev(`(() => { const f = ${F}, e = ${ED}, real = e.cm, hold = f.hold; window.__hide = false; Object.defineProperty(e, 'cm', { get: () => { if (!window.__hide) return real; window.__hide = false; return undefined; }, configurable: true }); f.hold = function (...a) { window.__hide = true; try { return hold.apply(this, a); } finally { window.__hide = false; } }; window.__unhide = () => { delete e.cm; f.hold = hold; delete window.__hide; delete window.__unhide; }; f.held.delete(${j(KEEPER)}); return 1; })()`);
	try {
		const second = ['wren', 'yarrow', 'zinnia', 'aster', 'bramble', 'clover', 'dock', 'elder', 'fern', 'gentian', 'heather', 'iris', 'jasmine', 'kelp'];
		t.ok(await through(second), 'without it: saved in the middle of the typing');
		await p.sleep(2600);
		t.ok(disk(p, KEEPER).includes('jasmine kelp'), 'and all of it afterwards');
		t.eq(await kinds(), j(['number']), 'the texts held are kept as fingerprints');
		t.eq(await words(), first.length + 2 + second.length, 'and the words typed are the day’s words, as before');
	} finally {
		await p.ev(`(() => { window.__unhide?.(); return 1; })()`);
	}
});

// ---- "Dim the background": the page a deep charcoal, in a light theme too ----

const CHARCOAL = 'rgb(22, 22, 22)';
/** The strength the paragraphs that aren't being written keep while typing ("Dim other paragraphs"). */
const DIMMED = 0.3;
/** What paints each of a grid of points across the window: the background of the topmost thing there that has one.
    Every color found, with how many points have it. */
const surface = (p, except = '') => p.ev(`(() => { const but = ${j(except)}, clear = (c) => /^rgba?\\(\\d+, \\d+, \\d+, 0\\)$|^transparent$/.test(c), out = {}; for (let i = 0; i < 12; i++) for (let k = 0; k < 9; k++) { const x = (i + 0.5) * innerWidth / 12, y = (k + 0.5) * innerHeight / 9; let c = 'nothing'; for (const e of document.elementsFromPoint(x, y)) { if (but && e.closest(but)) { c = but; break; } const b = getComputedStyle(e).backgroundColor; if (!clear(b)) { c = b; break; } } out[c] = (out[c] ?? 0) + 1; } return JSON.stringify(out); })()`);
/** The window's colors, as Obsidian and its theme set them: <body>'s theme and what it and the parts around a tab
    are drawn in. (To compare before and after: exactly the same means nothing of focus mode's dark page is left.) */
const colors = (p, page = false) => p.ev(`(() => { const of = (s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); return [cs.backgroundColor, cs.color, cs.caretColor].join(' / '); }, b = getComputedStyle(document.body); return JSON.stringify({ theme: [...document.body.classList].filter(c => /^theme-|^binders-focus/.test(c)).sort().join(' '), vars: ['--background-primary', '--background-secondary', '--text-normal', '--text-muted', '--text-accent', '--titlebar-background', '--code-background', '--interactive-accent'].map(v => b.getPropertyValue(v).trim()).join(' | '), body: of('body'), workspace: of('.workspace'), ribbon: of('.workspace-ribbon'), status: of('.status-bar'), titlebar: of('.titlebar'), tabs: of('.mod-root .workspace-tab-header-container'), ...(${page} ? { content: of('.workspace-leaf.mod-active .view-content'), text: of('.workspace-leaf.mod-active .cm-content'), line: of('.workspace-leaf.mod-active .cm-line') } : {}) }); })()`);
/** How a thing reads against the page: its color at its strength (its own opacity and what holds it, up to the
    page), over `bg`. */
const READ = `(el, bg) => {
	const rgb = (s) => (s.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
	const lum = (c) => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
	let o = 1; for (let e = el; e && !e.classList.contains('view-content'); e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
	const back = rgb(bg), fg = rgb(getComputedStyle(el).color).map((v, i) => v * o + back[i] * (1 - o)), a = lum(fg), b = lum(back);
	return { strength: Math.round(o * 100) / 100, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10 };
}`;
const allOf = (s, color) => { const o = JSON.parse(s); return Object.keys(o).length === 1 && Object.keys(o)[0] === color; };
const fresh = (p) => p.ev(`(async () => { const pl = ${PL}; await pl.saveData({}); await pl.loadSettings(); return pl.settings.focusDark; })()`);

test('“Dim the background”, on by default: in focus the whole window is a deep charcoal with light text on it, in a light theme too; leaving, closing the tab and turning the plugin off each put every color back exactly; off, the page is the theme’s', async (p, h, t) => {
	t.eq(await fresh(p), true, 'the setting is on in a vault that has never set it');
	await set(p, { ...OFF, focusDark: true });
	const light = await p.ev(`document.body.classList.contains('theme-light')`);
	// a note with the things that have colors of their own
	await p.ev(`app.vault.modify(app.vault.getAbstractFileByPath(${j(KEEPER)}), ${j('---\nsynopsis: The keeper.\n---\n# A heading\n\nThe keeper, with a [[Prologue]] link, some `code` and **bold** words, climbs the stairs.\n\n> A quotation.\n\nA second paragraph, to stand behind the one being written.\n\nAnd a third.')}).then(() => 1)`);
	await openNote(p, KEEPER);
	await caretEnd(p);
	const before = await colors(p, true), was = await surface(p);
	t.ok(!allOf(was, CHARCOAL), 'out of focus the window is the theme’s: ' + was);
	await enter(p, h);
	await p.sleep(400);
	t.eq(await surface(p), j({ [CHARCOAL]: 108 }), 'in focus every part of the window is the charcoal: the page, the space around the text, and what’s left of Obsidian around it');
	t.eq(await p.ev(`[...document.body.classList].filter(c => /^theme-/.test(c)).join()`), 'theme-dark', 'with Obsidian’s own dark colors over the whole window');
	const read = await p.ev(`(() => { const read = ${READ}, leaf = document.querySelector('.binders-focus-leaf'), q = (s) => leaf.querySelector(s), bg = ${j(CHARCOAL)}; const out = {}; for (const [k, s] of [['line', '.cm-line.cm-active'], ['heading', '.cm-line .cm-header'], ['link', '.cm-line .cm-hmd-internal-link, .cm-line .cm-link'], ['code', '.cm-line .cm-inline-code'], ['quote', '.cm-line.HyperMD-quote'], ['out', '.binders-focus-leave']]) { const e = q(s); out[k] = e ? read(e, bg).ratio : null; } const rgb = (s) => s; out.caret = read(Object.assign(document.createElement('span'), { style: 'color:' + getComputedStyle(q('.cm-content')).caretColor }), bg) && (() => { const s = document.body.appendChild(document.createElement('span')); s.style.color = getComputedStyle(q('.cm-content')).caretColor; const r = read(s, bg).ratio; s.remove(); return r; })(); return out; })()`);
	t.ok(read.line >= 7, `the paragraph being written is 7:1 or better against it: ${j(read)}`);
	t.ok([read.heading, read.link, read.code, read.quote].every((x) => x != null && x >= 4.5), `a heading, a link, code and a quotation are 4.5:1 or better: ${j(read)}`);
	t.ok(read.caret >= 3 && read.out >= 3, `the cursor and the way out are 3:1 or better: ${j(read)}`);
	// leaving
	await leave(p, h);
	await p.sleep(500);
	t.eq(await colors(p, true), before, 'leaving focus puts every color back exactly');
	t.eq(await surface(p), was, 'and the window is drawn as it was');
	// and without Obsidian's own word for its appearance (an Obsidian whose `getConfig('theme')` said nothing): by what
	// <body> said when focus began
	await p.ev(`(() => { const v = app.vault, real = v.getConfig; v.getConfig = function (k) { return k === 'theme' ? undefined : real.call(this, k); }; window.__theme = () => { v.getConfig = real; delete window.__theme; }; return 1; })()`);
	try {
		await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
		await enter(p, h);
		t.ok(allOf(await surface(p), CHARCOAL), 'without it: the charcoal still');
		await leave(p, h);
		await p.sleep(500);
		t.eq(await colors(p, true), before, 'and every color back on leaving');
	} finally { await p.ev(`(() => { window.__theme?.(); return 1; })()`); }
	// the tab closed while in focus
	const chromeBefore = await colors(p);
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await enter(p, h);
	t.ok(allOf(await surface(p), CHARCOAL), 'in focus again');
	await p.ev(`(() => { app.workspace.getMostRecentLeaf().detach(); return 1; })()`);
	await until(p, `!document.body.classList.contains('binders-focus')`);
	await p.sleep(400);
	t.eq(await colors(p), chromeBefore, 'the tab closed while in focus: every color is back');
	// the plugin turned off while in focus
	await openNote(p, KEEPER);
	await enter(p, h);
	t.ok(allOf(await surface(p), CHARCOAL), 'in focus again');
	const off = await colors(p, true).then(() => null);
	void off;
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	await p.sleep(500);
	try {
		t.eq(await colors(p, true), before, 'the plugin turned off while in focus: every color is back, and nothing of the dark page is left');
	} finally {
		await p.ev(`(async () => { await app.plugins.enablePlugin('binders'); await app.plugins.plugins.binders.binders.ready; })().then(() => 1)`);
		await p.sleep(600);
	}
	// off: as before this option
	await set(p, { ...OFF, focusDark: false });
	await openNote(p, KEEPER);
	const plain = await surface(p);
	await enter(p, h);
	const inside = JSON.parse(await colors(p, true)), outside = JSON.parse(before);
	t.eq(j([inside.theme.replace(/ ?binders-focus\S*/g, '').trim(), inside.vars, inside.content, inside.text]), j([outside.theme, outside.vars, outside.content, outside.text]), 'with the option off, focus mode’s page is the theme’s own, as it was before there was one');
	t.ok(!allOf(await surface(p), CHARCOAL) && Object.keys(JSON.parse(await surface(p))).every((c) => Object.keys(JSON.parse(plain)).includes(c)), 'and nothing is charcoal' + (light ? '' : ' (the dark theme’s own page is lighter)'));
	// turned on and off while in focus (the menu on the way out, the settings)
	await set(p, { focusDark: true });
	await p.sleep(500);
	t.ok(allOf(await surface(p), CHARCOAL), 'turned on while in focus: the charcoal');
	await set(p, { focusDark: false });
	await p.sleep(500);
	t.eq(j([JSON.parse(await colors(p, true)).vars, JSON.parse(await colors(p, true)).content]), j([outside.vars, outside.content]), 'and off again: the theme’s page');
	await leave(p, h);
});

test('“Dim other paragraphs” is significant: while typing, every paragraph but the one being written is at three tenths of its strength, on the charcoal and on the theme’s own page; the pointer moving brings them back', async (p, h, t) => {
	for (const dark of [true, false]) {
		const what = dark ? 'on the charcoal' : 'on the theme’s page';
		await set(p, { ...OFF, focusDim: true, focusDark: dark, focusNeighbours: true });
		// (a callout and a table too: blocks of their own in the editor, beside its lines)
		if (dark) await p.ev(`app.vault.modify(app.vault.getAbstractFileByPath(${j(KEEPER)}), ${j('A first paragraph.\n\n> [!note] A callout\n> In it.\n\n| Tide | Time |\n|---|---|\n| High | 04:12 |\n\nA last paragraph.')}).then(() => 1)`);
		await openNote(p, KEEPER);
		await caretEnd(p);
		await enter(p, h);
		await press(p, '\n\nA paragraph being written now.');
		await p.sleep(800);
		const blocks = await p.ev(`[...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-embed-block')].map(e => Number(getComputedStyle(e).opacity))`);
		t.ok(blocks.length >= 2 && blocks.every((o) => o === DIMMED), `${what}: a callout and a table step back with the paragraphs: ${j(blocks)}`);
		const look = await p.ev(`(() => { const read = ${READ}, leaf = document.querySelector('.binders-focus-leaf'), bg = getComputedStyle(leaf.querySelector('.view-content')).backgroundColor; const lines = [...leaf.querySelectorAll('.cm-content > .cm-line')].filter(e => e.textContent.trim()); return { bg, mine: read(lines[lines.length - 1], bg), others: lines.slice(0, -1).map(e => read(e, bg)), near: [...leaf.querySelectorAll('.binders-focus-near-text')].map(e => read(e, bg)), duration: getComputedStyle(lines[0]).transitionDuration, property: getComputedStyle(lines[0]).transitionProperty }; })()`);
		if (dark) t.eq(look.bg, CHARCOAL, `${what}: the page is the charcoal`);
		t.ok(look.mine.strength === 1 && look.mine.ratio >= 7, `${what}: the paragraph being written is whole, 7:1 or better: ${j(look.mine)}`);
		t.ok(look.others.length > 0 && look.others.every((o) => o.strength === DIMMED), `${what}: every other paragraph is at ${DIMMED} of its strength: ${j(look.others)}`);
		t.ok(look.others.every((o) => o.ratio < look.mine.ratio / 3 && o.ratio >= 1.5), `${what}: far back from it, and still to be seen: ${j(look.others)}`);
		t.ok(look.near.length > 0 && look.near.every((o) => o.strength === DIMMED), `${what}: the scenes before and after step back as far: ${j(look.near)}`);
		t.ok(/opacity/.test(look.property) && parseFloat(look.duration) > 0, `${what}: they go and come over a moment, not at a stroke: ${look.property} ${look.duration}`);
		// the next paragraph: the one just left steps back, the new one is whole
		await press(p, '\n\nAnd the next.');
		await p.sleep(800);
		const next = await p.ev(`(() => { const lines = [...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-line')].filter(e => e.textContent.trim()).map(e => Number(getComputedStyle(e).opacity)); return lines.slice(-2); })()`);
		t.eq(j(next), j([DIMMED, 1]), `${what}: on to a new paragraph, the one before steps back and the new one is whole`);
		await wiggle(p);
		await p.sleep(500);
		t.ok(await p.ev(`[...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-line, .binders-focus-leaf .binders-focus-near-text')].every(e => getComputedStyle(e).opacity === '1')`), `${what}: the pointer moving brings them all forward`);
		await leave(p, h);
	}
});

test('“Dim the background” in the manuscript: the page and the space around it are the charcoal, section titles readable, the other sections step back as far while typing; all as it was after leaving', async (p, h, t) => {
	await set(p, { ...OFF, focusDim: true, focusDark: true });
	await openMs(p, L + 'Part One');
	await msCaret(p, KEEPER, 'end');
	const before = await colors(p), was = await surface(p);
	await enter(p, h);
	await p.sleep(400);
	t.eq(await surface(p), j({ [CHARCOAL]: 108 }), 'in focus every part of the window is the charcoal');
	const heads = await p.ev(`(() => { const read = ${READ}; return [...document.querySelectorAll('.binders-focus-leaf .binders-manuscript-title')].map(e => read(e, ${j(CHARCOAL)}).ratio); })()`);
	// (a section's title is set faint on purpose, in every theme: it is no fainter here than on the dark theme's own page)
	t.ok(heads.length >= 3 && heads.every((r) => r >= 3), `the sections’ titles are 3:1 or better against it, as on Obsidian’s dark page: ${j(heads)}`);
	await press(p, ' More.');
	await p.sleep(800);
	const look = await p.ev(`(() => { const read = ${READ}, bg = ${j(CHARCOAL)}; return [...document.querySelectorAll('.binders-focus-leaf .binders-manuscript-scene')].filter(s => s.querySelector('.cm-content')).map(s => ({ mine: s.contains(document.activeElement), body: read(s.querySelector(s.contains(document.activeElement) ? '.cm-line.cm-active' : '.cm-line') ?? s.querySelector('.binders-manuscript-body'), bg) })); })()`);
	t.ok(look.some((s) => s.mine) && look.filter((s) => s.mine).every((s) => s.body.strength === 1 && s.body.ratio >= 7), `the paragraph being written, in its section, is whole, 7:1 or better: ${j(look)}`);
	t.ok(look.some((s) => !s.mine) && look.filter((s) => !s.mine).every((s) => s.body.strength === DIMMED), `the others are at ${DIMMED} of their strength: ${j(look)}`);
	await leave(p, h);
	await p.sleep(500);
	t.eq(await colors(p), before, 'leaving puts every color back');
	t.eq(await surface(p), was, 'and the window is drawn as it was');
});

test('“Dim the background” on a phone: the page, the strip along the top and the room under the text are the charcoal; all as it was after leaving', async (p, h, t) => {
	await set(p, { ...OFF, focusDark: true, focusNumbers: true });
	await novel(p);
	await onDevice(p, [390, 844], async () => {
		await set(p, { ...OFF, focusDark: true, focusNumbers: true });
		await openNote(p, N(2));
		await caretEnd(p);
		const before = await colors(p, true), was = await surface(p);
		await enter(p, h);
		await p.sleep(400);
		// (but for the bar of editing buttons Obsidian keeps over the keyboard, which is its own, in its dark colors)
		const screen = JSON.parse(await surface(p, '.mobile-toolbar'));
		t.ok(screen[CHARCOAL] >= 90 && Object.keys(screen).every((c) => c === CHARCOAL || c === '.mobile-toolbar'), 'in focus the whole screen is the charcoal: ' + j(screen));
		t.ok(await p.ev(`(() => { const b = document.querySelector('.mobile-toolbar'); return !b || /0\\.2 0\\.2 0\\.2|rgba?\\((\\d+), \\1, \\1/.test(getComputedStyle(b.querySelector('.mobile-toolbar-options-list-container') ?? b).backgroundColor); })()`), 'and Obsidian’s bar of editing buttons is in its dark colors');
		const read = await p.ev(`(() => { const read = ${READ}; return { line: read(document.querySelector('.binders-focus-leaf .cm-line.cm-active'), ${j(CHARCOAL)}).ratio, out: read(document.querySelector('.binders-focus-leave'), ${j(CHARCOAL)}).ratio }; })()`);
		t.ok(read.line >= 7 && read.out >= 3, `the text is 7:1 or better, the way out 3:1 or better: ${j(read)}`);
		await leave(p, h);
		await p.sleep(500);
		t.eq(await colors(p, true), before, 'leaving puts every color back');
		// (in the same colors: how much of the screen Obsidian's bars take depends on where the keyboard is)
		t.eq(j(Object.keys(JSON.parse(await surface(p))).sort()), j(Object.keys(JSON.parse(was)).sort()), 'and the screen is drawn in the colors it was');
	});
});

// ---- fullscreen ----

/* Headless Obsidian has no screen to fill and a script has no user gesture to ask with, so the window's own
   fullscreen is stood in for: asked, it says yes and is in fullscreen; what's tested is when focus mode asks and
   when it gives it back. */
const fakeScreen = (p) => p.ev(`(() => { const d = document, el = d.documentElement, log = window.__fs = { asked: 0, left: 0 };
	const put = (v) => { Object.defineProperty(d, 'fullscreenElement', { value: v, configurable: true }); d.dispatchEvent(new Event('fullscreenchange')); };
	el.requestFullscreen = () => { log.asked++; put(el); return Promise.resolve(); };
	d.exitFullscreen = () => { log.left++; put(null); return Promise.resolve(); };
	window.__fsPut = put; return 1; })()`);
const realScreen = (p) => p.ev(`(() => { delete document.documentElement.requestFullscreen; delete document.exitFullscreen; delete document.fullscreenElement; delete window.__fs; delete window.__fsPut; return 1; })()`);
const screen = (p) => p.ev(`JSON.stringify({ ...window.__fs, full: !!document.fullscreenElement })`);

test('fullscreen: off to begin with; on, focus mode takes the screen and gives it back; Esc out of fullscreen leaves; a window already in fullscreen is left alone', async (p, h, t) => {
	t.eq(await p.ev(`${PL}.settings.focusFullscreen`), false, 'off unless turned on');
	await openNote(p, KEEPER);
	await fakeScreen(p);
	try {
		await enter(p, h);
		t.eq(await screen(p), j({ asked: 0, left: 0, full: false }), 'off: focus mode doesn’t touch the screen');
		// turned on while in focus: taken at once; turned off: given back, and focus mode stays
		await set(p, { focusFullscreen: true });
		await p.ev(`${F}.optionsChanged()`);
		await p.sleep(150);
		t.eq(await screen(p), j({ asked: 1, left: 0, full: true }), 'turned on in focus mode: the screen is taken');
		await set(p, { focusFullscreen: false });
		await p.ev(`${F}.optionsChanged()`);
		await p.sleep(150);
		t.eq(await screen(p), j({ asked: 1, left: 1, full: false }), 'turned off: it’s given back');
		t.ok(await inFocus(p), 'and focus mode stays');
		await leave(p, h);
		// on: taken on the way in, given back on the way out
		await set(p, { focusFullscreen: true });
		await enter(p, h);
		t.eq(await screen(p), j({ asked: 2, left: 1, full: true }), 'on: entering focus mode takes the screen');
		await leave(p, h);
		t.eq(await screen(p), j({ asked: 2, left: 2, full: false }), 'and leaving gives it back');
		// Esc in fullscreen is the system's: it ends fullscreen, and focus mode goes with it
		await enter(p, h);
		await p.ev(`(() => { window.__fsPut(null); return 1; })()`);
		await until(p, `!document.body.classList.contains('binders-focus')`);
		t.eq(await screen(p), j({ asked: 3, left: 2, full: false }), 'fullscreen ended from outside: focus mode leaves with it, and doesn’t ask to leave it twice');
		// already in fullscreen (the writer's own doing): not ours to take or give back
		await p.ev(`(() => { window.__fsPut(document.documentElement); return 1; })()`);
		await enter(p, h);
		await leave(p, h);
		t.eq(await screen(p), j({ asked: 3, left: 2, full: true }), 'a window already in fullscreen is left as it was');
		t.eq(await p.ev(`${ED}.getValue() === ${j(disk(p, KEEPER))}`), true, 'the note is as it was');
	} finally { await realScreen(p); }
});

test('fullscreen: for real, the window goes to fullscreen with focus mode and comes back out with it', async (p, h, t) => {
	await set(p, { focusFullscreen: true });
	await openNote(p, KEEPER);
	await enter(p, h);
	t.ok(await inFocus(p), 'in focus mode');
	await until(p, `!!document.fullscreenElement`);
	t.ok(true, 'and the window is in fullscreen');
	await leave(p, h);
	await until(p, `!document.fullscreenElement`);
	t.ok(!(await inFocus(p)), 'out of focus mode, and out of fullscreen');
	t.eq(await p.ev(`${ED}.getValue() === ${j(disk(p, KEEPER))}`), true, 'the note is as it was');
});

// ---- the settings tab ----

test('settings: a “Focus mode” group with every option; a change there shows on the page at once', async (p, h, t) => {
	const TAB = `app.setting.activeTab.containerEl`;
	await set(p, OFF);
	await openNote(p, KEEPER);
	await enter(p, h);
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `[...${TAB}.querySelectorAll('.setting-item-heading, .setting-group .setting-item-name')].some(e => e.textContent === 'Focus mode')`);
	const rows = await p.ev(`(() => { const c = ${TAB}, all = [...c.querySelectorAll('.setting-item')], names = all.map(e => e.querySelector('.setting-item-name')?.textContent ?? ''); const from = names.indexOf('Typewriter scrolling'); return all.slice(from, from + 8).map(e => ({ name: e.querySelector('.setting-item-name').textContent, desc: !!e.querySelector('.setting-item-description')?.textContent, on: e.querySelector('.checkbox-container') ? e.querySelector('.checkbox-container').classList.contains('is-enabled') : e.querySelector('input[type="text"]')?.value })); })()`);
	t.eq(j(rows.map((r) => r.name)), j(['Typewriter scrolling', 'Show the scenes before and after', 'Show where you are', 'Show word counts', 'Dim other paragraphs', 'Dim the background', 'Enter fullscreen', 'Words to write today']), 'the options, in plain words');
	t.eq(j(rows.map((r) => r.on)), j([true, false, false, false, false, false, false, '']), 'each shows whether it is on');
	t.ok(rows.every((r) => r.desc), 'each says what it does');
	// turn one on there
	await p.ev(`(() => { const row = [...${TAB}.querySelectorAll('.setting-item')].find(e => e.querySelector('.setting-item-name')?.textContent === 'Show where you are'); row.querySelector('.checkbox-container').click(); return 1; })()`);
	await p.sleep(500);
	t.eq(await p.ev(`${PL}.settings.focusPlace`), true, 'a toggle there is taken');
	t.ok(await p.ev(`!!document.querySelector('.binders-focus-leaf .binders-focus-note')`), 'and the page in focus has it at once');
	// the goal
	await p.ev(`(() => { const row = [...${TAB}.querySelectorAll('.setting-item')].find(e => e.querySelector('.setting-item-name')?.textContent === 'Words to write today'); const el = row.querySelector('input[type="text"]'); el.focus(); el.value = '1,200'; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`);
	await p.sleep(400);
	t.eq(await p.ev(`${PL}.settings.focusGoal`), 1200, 'a goal typed there is taken as a number');
	await p.ev(`(() => { const row = [...${TAB}.querySelectorAll('.setting-item')].find(e => e.querySelector('.setting-item-name')?.textContent === 'Words to write today'); const el = row.querySelector('input[type="text"]'); el.focus(); el.value = 'lots'; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`);
	await p.sleep(400);
	t.eq(await p.ev(`${PL}.settings.focusGoal`), 1200, 'one that isn’t a number is refused');
	const data = JSON.parse(await p.ev(`app.vault.adapter.read(app.vault.configDir + '/plugins/binders/data.json')`));
	t.ok(data.focusPlace === true && data.focusGoal === 1200 && data.focusTypewriter === true, 'saved with the plugin’s settings');
	await p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
});

// ---- motion, and people who want none ----

test('the way in: what’s around the page fades first, the text doesn’t jump; with reduced motion it’s one step and nothing moves', async (p, h, t) => {
	await novel(p, 3, 24);
	await openNote(p, N(2));
	// (the cursor above the last line: the way in then leaves the page where it is)
	await caretAt(p, 'Scene 2 paragraph 12.');
	await p.ev(`(() => { const e = ${ED}; e.scrollIntoView({ from: e.getCursor(), to: e.getCursor() }, true); return 1; })()`);
	await p.sleep(500);
	const y0 = (await at(p)).y;
	await h.run('focus');
	await p.sleep(40);
	const pre = await p.ev(`JSON.stringify({ pre: document.body.classList.contains('binders-focus-pre'), on: document.body.classList.contains('binders-focus'), tabs: document.querySelector('.workspace-tab-header-container').getBoundingClientRect().height > 0 })`).then(JSON.parse);
	t.ok(pre.pre && !pre.on && pre.tabs, `first what’s around the page fades where it stands: ${j(pre)}`);
	await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
	// (the glide itself: the page's color coming in with it, "Dim the background", is a transition of its own)
	const mid = await p.ev(`(() => { const a = ${VIEWOF}.contentEl.getAnimations().filter(x => !(x instanceof CSSTransition)); return { gliding: a.length, y: Math.round(${CM}.coordsAtPos(${CM}.state.selection.main.head).top) }; })()`);
	t.eq(mid.gliding, 1, 'then the text glides across to the middle');
	await p.sleep(600);
	const g = await at(p);
	t.ok(Math.abs(g.y - y0) <= 2, `and stays at the height it was (${y0} then, ${g.y} now): only what’s around it went`);
	t.eq(await p.ev(`${VIEWOF}.contentEl.getAnimations().length`), 0, 'the glide leaves nothing behind, and the page’s color has arrived');
	await leave(p, h);
	t.ok(Math.abs((await at(p)).y - y0) <= 2, 'on the way out it’s at that height still');
	// the first time ever, the way out is said once
	await p.ev(`(() => { app.saveLocalStorage('binders-focus-hinted', null); return 1; })()`);
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
	await h.run('focus');
	await p.sleep(60);
	const calm = await p.ev(`JSON.stringify({ on: document.body.classList.contains('binders-focus'), pre: document.body.classList.contains('binders-focus-pre'), gliding: ${VIEWOF}.contentEl.getAnimations().length, fade: getComputedStyle(document.querySelector('.binders-focus-top')).animationName })`).then(JSON.parse);
	t.eq(j(calm), j({ on: true, pre: false, gliding: 0, fade: 'none' }), 'with reduced motion: in focus at once, no fade, no glide');
	const said = await p.ev(`(() => { const probe = new Notice(''), d = probe.noticeEl.ownerDocument; probe.hide(); return [...new Set([document, d])].flatMap(x => [...x.querySelectorAll('.notice')]).map(n => n.textContent).filter(Boolean); })()`);
	t.ok(said.includes('Focus mode. Press Esc to leave.'), 'the first time, a notice says how to leave: ' + j(said));
	await h.run('focus');
	await p.sleep(80);
	t.ok(!(await inFocus(p)) && !(await p.ev(`${F}.busy`)), 'and out at once');
	await h.run('focus');
	await p.sleep(200);
	const again = await p.ev(`(() => { const probe = new Notice(''), d = probe.noticeEl.ownerDocument; probe.hide(); return [...new Set([document, d])].flatMap(x => [...x.querySelectorAll('.notice')]).filter(n => n.textContent === 'Focus mode. Press Esc to leave.').length; })()`);
	t.eq(again, 1, 'the notice isn’t said a second time');
	await p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
});

// ---- keyboard and screen readers ----

test('accessibility: entering is announced; the way out is a button the keyboard reaches; hidden parts are out of reach; the paragraph being written keeps its contrast, and the dimmed ones can still be seen', async (p, h, t) => {
	await set(p, { focusDim: true, focusNumbers: true, focusNeighbours: true });
	await openNote(p, KEEPER);
	await caretEnd(p);
	await enter(p, h);
	const live = await p.ev(`(() => { const e = document.querySelector('.binders-focus-live'); return e ? { role: e.getAttribute('role'), live: e.getAttribute('aria-live'), text: e.textContent, w: e.getBoundingClientRect().width } : null; })()`);
	t.eq(j(live), j({ role: 'status', live: 'polite', text: 'Focus mode. Press Escape to leave.', w: 1 }), 'entering is said to a screen reader, with the way out; it isn’t drawn');
	const out = await p.ev(`(() => { const e = document.querySelector('.binders-focus-leave'); return { role: e.getAttribute('role'), tab: e.tabIndex, label: e.getAttribute('aria-label') }; })()`);
	t.eq(j(out), j({ role: 'button', tab: 0, label: 'Leave focus mode (Esc)' }), 'the way out is a button with a name');
	const corner = await p.ev(`(() => { const e = document.querySelector('.binders-focus-corner'); return { role: e.getAttribute('role'), tab: e.tabIndex, menu: e.getAttribute('aria-haspopup'), label: e.getAttribute('aria-label') }; })()`);
	t.ok(corner.role === 'button' && corner.tab === 0 && corner.menu === 'menu' && /words in this scene, \d+ written today\. Focus mode options/.test(corner.label), 'the numbers are a button that says what they are: ' + j(corner));
	t.eq(await p.ev(`[...document.querySelectorAll('.binders-focus-near.is-before, .binders-focus-near.is-after')].map(e => e.getAttribute('role') + ':' + e.tabIndex + ':' + e.getAttribute('aria-label')).join(' | ')`), 'link:0:Previous scene: Arrival | link:0:Next scene: Storm warning', 'the scenes before and after are links with names');
	t.eq(await p.ev(`['.workspace-ribbon.mod-left', '.workspace-split.mod-left-split', '.status-bar', '.workspace-tab-header-container'].map(s => getComputedStyle(document.querySelector(s)).display).join()`), 'none,none,none,none', 'what’s hidden isn’t in the page at all: nothing unseen takes the Tab key');
	// while typing, the way out reached by the keyboard stays in sight
	await press(p, ' Typing.');
	await p.sleep(800);
	await p.ev(`(() => { document.querySelector('.binders-focus-leave').focus(); return 1; })()`);
	await p.sleep(700);
	t.eq(await p.ev(`getComputedStyle(document.querySelector('.binders-focus-top')).opacity`), '1', 'the way out, given the keyboard’s focus while everything is hidden, shows');
	await p.key('Enter');
	await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
	t.ok(!(await inFocus(p)), 'and Enter on it leaves');
	t.eq(await until(p, `document.querySelector('.binders-focus-live')?.textContent === 'Left focus mode.' || !document.querySelector('.binders-focus-live')`), true, 'leaving is said too');
	// contrast of what's dimmed, in this theme
	await p.ev(`(() => { ${ED}.focus(); return 1; })()`);
	await enter(p, h);
	await press(p, '\n\nNew paragraph.');
	await p.sleep(800);
	const ratio = await p.ev(`(() => {
		const rgb = (s) => (s.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
		const lum = (c) => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
		const leaf = document.querySelector('.binders-focus-leaf');
		const bg = rgb(getComputedStyle(leaf.querySelector('.view-content')).backgroundColor);
		const of = (el) => { const cs = getComputedStyle(el), o = Number(cs.opacity), fg = rgb(cs.color).map((v, i) => v * o + bg[i] * (1 - o)); const a = lum(fg), b = lum(bg); return { o, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 }; };
		const line = [...leaf.querySelectorAll('.cm-content > .cm-line')].find(e => e.textContent.trim() && !e.classList.contains('cm-active'));
		return { line: of(line), near: of(leaf.querySelector('.binders-focus-near.is-after .binders-focus-near-text')) };
	})()`);
	// (The paragraphs that aren't being written step well back, to three tenths: the maintainer's decision of
	// 2026-10-05, in place of the 4.5:1 they kept before. What must read is the one being written; the others are
	// there to be seen, and the pointer moving brings them forward whole.)
	const mine = await p.ev(`(() => { const rgb = (s) => (s.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number), lum = (c) => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const leaf = document.querySelector('.binders-focus-leaf'), el = leaf.querySelector('.cm-line.cm-active'), a = lum(rgb(getComputedStyle(el).color)), b = lum(rgb(getComputedStyle(leaf.querySelector('.view-content')).backgroundColor)); return { o: Number(getComputedStyle(el).opacity), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }; })()`);
	t.ok(mine.o === 1 && mine.ratio >= 7, `the paragraph being written is whole, 7:1 or better against the page: ${j(mine)}`);
	t.ok(ratio.line.o === 0.3 && ratio.line.ratio >= 1.5, `a dimmed paragraph is at three tenths, still to be seen: ${j(ratio.line)}`);
	t.ok(ratio.near.ratio >= 1.5, `and so is the text of the scene after: ${j(ratio.near)}`);
	await wiggle(p);
	await p.sleep(500);
	t.eq(await p.ev(`getComputedStyle([...document.querySelectorAll('.binders-focus-leaf .cm-content > .cm-line')].find(e => e.textContent.trim() && !e.classList.contains('cm-active'))).opacity`), '1', 'and whole again when the pointer moves');
});

// ---- when Obsidian isn't built as expected ----

test('fallbacks: without the editor’s own view there’s no typewriter line; without the page’s column nothing is drawn before and after; focus still works, and the commands still go', async (p, h, t) => {
	await novel(p);
	await set(p, { focusNeighbours: true });
	await openNote(p, N(2));
	await caretEnd(p);
	// The Editor without its `cm`, as focus mode would find it in an Obsidian that had none. (Only while focus begins,
	// which with reduced motion is one step: Obsidian's own editor needs it the rest of the time.)
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
	await p.ev(`(() => { const e = ${ED}, real = e.cm; window.__hide = false; Object.defineProperty(e, 'cm', { get: () => (window.__hide ? undefined : real), configurable: true }); window.__real = real; return 1; })()`);
	try {
		await p.ev(`(() => { window.__hide = true; try { app.commands.executeCommandById('binders:focus'); } finally { window.__hide = false; } return 1; })()`);
		t.ok(await inFocus(p), 'without the editor’s CodeMirror view, focus still begins');
		t.eq(await p.ev(`${F}.on.cm`), null, 'with no typewriter line');
		await press(p, '\n\nTyped without it.');
		await p.sleep(400);
		t.ok(await p.ev(`${ED}.getValue().includes('Typed without it.')`), 'and typing works as ever');
		await leave(p, h);
	} finally {
		await p.ev(`(() => { Object.defineProperty(${ED}, 'cm', { value: window.__real, configurable: true, writable: true }); delete window.__real; delete window.__hide; return 1; })()`);
		await p.send('Emulation.setEmulatedMedia', { features: [] });
	}
	// the page's column not as expected
	await p.ev(`(() => { const c = document.querySelector('.workspace-leaf.mod-active .cm-contentContainer'); c.classList.replace('cm-contentContainer', 'cm-x-contentContainer'); return 1; })()`);
	try {
		await enter(p, h);
		t.ok(await inFocus(p), 'without the page’s column as expected, focus still begins');
		t.eq(await p.ev(`document.querySelectorAll('.binders-focus-near').length`), 0, 'nothing is drawn before and after');
		t.eq(j(await chrome(p)), j(['0x0', '0x0', '0x0', '0x0', '0x0']), 'what’s around the page is hidden all the same');
		t.ok(await p.ev(`app.commands.commands['binders:next-scene'].checkCallback(true) === true`), 'and the commands still go to the scenes before and after');
		await leave(p, h);
		t.ok(!(await inFocus(p)), 'and out');
	} finally { await p.ev(`(() => { document.querySelector('.cm-x-contentContainer')?.classList.replace('cm-x-contentContainer', 'cm-contentContainer'); return 1; })()`); }
	// every class of Obsidian's that the style sheet hides is one Obsidian has
	await openNote(p, N(2));
	const missing = await p.ev(`['.workspace-ribbon', '.workspace-split.mod-left-split', '.workspace-split.mod-right-split', '.status-bar', '.workspace-tab-header-container', '.mod-root .workspace-tabs', '.workspace-leaf.mod-active .view-header', '.workspace-leaf.mod-active .inline-title', '.workspace-leaf.mod-active .metadata-container', '.workspace-leaf.mod-active .cm-sizer > .cm-contentContainer', '.workspace-leaf.mod-active .cm-content', '.workspace-leaf.mod-active .view-content', '.workspace-leaf.mod-active .cm-line.cm-active'].filter(s => !document.querySelector(s))`);
	t.eq(j(missing), '[]', 'Obsidian still has every element focus mode hides or reads');
});

// ---- a phone and a tablet ----

const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
/** Runs fn in Obsidian's mobile mode at this size, with touch; then puts the desktop back, whatever happened. */
async function onDevice(p, [width, height], fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await metrics(p, width, height);
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await theme();
	await p.sleep(200);
	let logged = [];
	try { await start(p); await fn(); logged = p.errors.filter((e) => !/ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/.test(e)); } finally {
		await touch(p, 'touchCancel').catch(() => {});
		await stop(p);
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
		await theme();
	}
	if (logged.length) throw new Error('errors logged on the device: ' + logged.slice(0, 3).join(' ; '));
}

test('a phone: the bar of buttons and the header go, a strip under the clock has the way out (and the numbers); typing leaves the text and the keyboard’s toolbar; a touch brings the way out back', async (p, h, t) => {
	await novel(p);
	await onDevice(p, [390, 844], async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-phone')`), 'a phone');
		await openNote(p, N(2));
		await caretEnd(p);
		t.ok(await p.ev(`document.querySelector('.workspace-leaf.mod-active .view-header').getBoundingClientRect().height > 0`), 'the note’s header is there to begin with');
		await enter(p, h);
		t.ok(await inFocus(p), 'into focus');
		t.eq(await p.ev(`[document.querySelector('.mobile-navbar'), document.querySelector('.binders-focus-leaf .view-header')].map(e => Math.round(e?.getBoundingClientRect().height ?? 0)).join()`), '0,0', 'the bar of buttons and the header are gone');
		const way = await p.ev(`(() => { const r = document.querySelector('.binders-focus-leave').getBoundingClientRect(), safe = parseFloat(getComputedStyle(document.body).getPropertyValue('--safe-area-inset-top')) || 0; return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(innerWidth - r.right), safe }; })()`);
		t.ok(way.top >= way.safe && way.w >= 24 && way.h >= 24 && way.right >= 0, `the way out is below the clock and battery, big enough for a finger: ${j(way)}`);
		let g = await at(p);
		t.ok(held(g), `the last line is at the line: ${j(g)}`);
		// the keyboard up: a shorter page
		await metrics(p, 390, 844 - 336);
		await p.sleep(500);
		await press(p, '\n\nTyped on a phone, at the end of the scene, on to a second line.');
		await p.sleep(600);
		g = await at(p);
		t.ok(held(g), `with the keyboard up, the last line is held in what can be seen: ${j(g)}`);
		t.ok(await p.ev(`document.body.classList.contains('binders-focus-typing') && Number(getComputedStyle(document.querySelector('.binders-focus-top')).opacity) < 1`), 'typing hides the way out');
		t.ok(await p.ev(`!document.querySelector('.mobile-toolbar') || document.querySelector('.mobile-toolbar').getBoundingClientRect().height > 0`), 'the keyboard’s own toolbar is left alone');
		await metrics(p, 390, 844);
		await p.sleep(300);
		// a finger moved on the page
		await touch(p, 'touchStart', 195, 500); for (let i = 1; i <= 6; i++) { await touch(p, 'touchMove', 195, 500 + i * 6); await p.sleep(16); } await touch(p, 'touchEnd');
		await p.sleep(500);
		t.ok(await p.ev(`!document.body.classList.contains('binders-focus-typing') && getComputedStyle(document.querySelector('.binders-focus-top')).opacity === '1'`), 'a touch on the page brings it back');
		// everything on: one strip
		await set(p, { focusPlace: true, focusNumbers: true });
		await p.sleep(400);
		const strip = await p.ev(`(() => { const top = document.querySelector('.binders-focus-top'), c = document.querySelector('.binders-focus-corner').getBoundingClientRect(), tr = top.getBoundingClientRect(), pl = document.querySelector('.binders-focus-place').getBoundingClientRect(), w = document.querySelector('.binders-focus-leave').getBoundingClientRect(); return { inStrip: c.top >= tr.top && c.bottom <= tr.bottom + 1, clear: pl.right <= c.left + 1 && c.right <= w.left + 1, bg: getComputedStyle(top).backgroundColor, out: Math.round(Math.max(c.right, w.right) - innerWidth) }; })()`);
		t.ok(strip.inStrip && strip.clear && strip.out <= 0 && !/rgba\(0, 0, 0, 0\)/.test(strip.bg), `with the place and the numbers on they’re one strip along the top, nothing over anything: ${j(strip)}`);
		// out by the button, by touch
		const b = await p.at('.binders-focus-leave');
		await touch(p, 'touchStart', b.x, b.y); await p.sleep(40); await touch(p, 'touchEnd');
		await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
		t.ok(!(await inFocus(p)), 'a tap on the way out leaves');
		// (Obsidian takes its bar of buttons away while an editor has the keyboard: looked for once it hasn't)
		await p.ev(`(() => { document.activeElement?.blur?.(); return 1; })()`);
		t.ok(await until(p, `(document.querySelector('.mobile-navbar')?.getBoundingClientRect().height ?? 0) > 0 && document.querySelector('.workspace-leaf.mod-active .view-header').getBoundingClientRect().height > 0`), 'and the bar of buttons and the header are back');
		await p.sleep(2300);
		t.ok(disk(p, N(2)).includes('Typed on a phone'), 'what was typed is in the note');
	});
});

test('a tablet: focus for a note and for the manuscript, by the manuscript’s own button; everything back afterwards', async (p, h, t) => {
	await novel(p);
	await onDevice(p, [820, 1180], async () => {
		t.ok(await p.ev(`document.body.classList.contains('is-tablet')`), 'a tablet');
		await openNote(p, N(2));
		await caretEnd(p);
		const before = await p.ev(`[...document.querySelectorAll('.workspace-tab-header-container, .workspace-leaf.mod-active .view-header')].map(e => Math.round(e.getBoundingClientRect().height)).join()`);
		await enter(p, h);
		t.eq(await p.ev(`[...document.querySelectorAll('.workspace-tab-header-container, .workspace-leaf.mod-active .view-header')].map(e => Math.round(e.getBoundingClientRect().height)).every(x => x === 0)`), true, 'a note in focus: tabs and header gone');
		const g = await at(p);
		t.ok(held(g), `its last line at the line: ${j(g)}`);
		await leave(p, h);
		t.eq(await p.ev(`[...document.querySelectorAll('.workspace-tab-header-container, .workspace-leaf.mod-active .view-header')].map(e => Math.round(e.getBoundingClientRect().height)).join()`), before, 'and back as they were');
		await openMs(p, 'Novel');
		const b = await p.at('.workspace-leaf.mod-active .binders-focus-button');
		t.ok(b && b.w >= 28 && b.h >= 28, 'the manuscript’s way in is big enough for a finger: ' + j(b));
		await touch(p, 'touchStart', b.x, b.y); await p.sleep(40); await touch(p, 'touchEnd');
		await until(p, `document.body.classList.contains('binders-focus') && !document.body.classList.contains('binders-focus-pre')`);
		t.ok(await inFocus(p), 'a tap on it goes into focus');
		t.eq(await p.ev(`Math.round(document.querySelector('.workspace-leaf.mod-active .binders-toolbar').getBoundingClientRect().height)`), 0, 'the toolbar gone');
		const out = await p.at('.binders-focus-leave');
		await touch(p, 'touchStart', out.x, out.y); await p.sleep(40); await touch(p, 'touchEnd');
		await until(p, `!document.body.classList.contains('binders-focus') && !${F}.busy`);
		t.ok(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-toolbar').getBoundingClientRect().height > 0`), 'and back');
	});
});
