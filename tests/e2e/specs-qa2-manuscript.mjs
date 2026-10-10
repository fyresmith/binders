// QA round 2: the manuscript as a writer uses it (keys, scrolling, focus, the view around it). Not about losing text
// (specs-qa-manuscript.mjs covers that) but about feel: what a note does that the manuscript doesn't.
// Tests named “BUG: …” and “UX: …” fail on purpose until fixed; the rest record behaviour that is solid.
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { VIEW, settled, until, openView, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa2-manuscript: ' + name, fn: withTidy(fn) });

const B = 'The Lighthouse';
const ARRIVAL = `${B}/Part One/Arrival.md`, KEEPER = `${B}/Part One/The keeper.md`, PROLOGUE = `${B}/Prologue.md`;
const J = JSON.stringify;
const M = `${VIEW}.current`;
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
const idx = (path) => `${M}.scenes.findIndex(s => s.file.path === ${J(path)})`;
const scene = (path) => `${M}.scenes[${idx(path)}]`;

async function settle(p, ms = 4000) {
	for (let i = 0; i < ms / 50; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; if (!m || !m.scenes) return false; const near = m.scenes.filter(s => m.near.has(s.el)); return (near.length > 0 || m.scenes.length === 0) && near.slice(0, m.liveMax).every(s => m.editable ? (s.live || s.broken) && !s.mounting : s.shown !== null); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(150);
}
async function openMs(p, folder = B) {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}
/** A binder “Novel”: `scenes` notes of `paras` two-line paragraphs each, with properties. */
async function novel(p, scenes = 14, paras = 8) {
	await p.ev(`(async () => {
		await app.vault.createFolder('Novel');
		for (let i = 1; i <= ${scenes}; i++) {
			const ps = []; for (let k = 1; k <= ${paras}; k++) ps.push('Scene ' + i + ' paragraph ' + k + '. The sea came up the rocks and the light turned over it, and the keeper wrote it down in the long book he kept by the window, as he had every night since the war.');
			await app.vault.create('Novel/Scene ' + String(i).padStart(2, '0') + '.md', '---\\nstatus: draft\\nsynopsis: Scene ' + i + '\\n---\\n' + ps.join('\\n\\n') + '\\n');
		}
		await new Promise(r => setTimeout(r, 600));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Novel'));
		return 1; })()`);
	await p.sleep(800);
	await openMs(p, 'Novel');
}
/** A binder “Odd” with these notes (name → text). */
async function odd(p, notes) {
	await p.ev(`(async () => {
		await app.vault.createFolder('Odd');
		for (const [n, s] of ${J(Object.entries(notes))}) await app.vault.adapter.write('Odd/' + n + '.md', s);
		await new Promise(r => setTimeout(r, 700));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Odd'));
		return 1; })()`);
	await p.sleep(800);
	await openMs(p, 'Odd');
}
const N = (i) => `Novel/Scene ${String(i).padStart(2, '0')}.md`;
/** A real click on a section's text (its first line, 100 px in). */
async function clickIn(p, path, dx = 100) {
	const r = await p.ev(`(() => { const e = ${scene(path)}.el.querySelector('.cm-line, p'); const r = e.getBoundingClientRect(); return { x: r.left + ${dx}, y: r.top + 10 }; })()`);
	await p.click(r.x, r.y);
	await p.sleep(150);
}
/** Where the focus is: the section's note, or null. */
const focused = (p) => p.ev(`(() => { const m = ${M}; const s = m?.scenes?.find(s => s.el.contains(document.activeElement)); return s && document.activeElement.classList.contains('cm-content') ? s.file.path : null; })()`);
/** The caret of the focused section: position, where it is on screen, and the page's viewport. */
const caret = (p) => p.ev(`(() => { const m = ${M}; const s = m.scenes.find(s => s.el.contains(document.activeElement)); if (!s?.live?.cm) return null; const cm = s.live.cm, sel = cm.state.selection.main, c = cm.coordsAtPos(sel.head), v = m.root.getBoundingClientRect(); return { path: s.file.path, from: sel.from, to: sel.to, len: cm.state.doc.length, y: c ? Math.round(c.top) : null, top: Math.round(v.top), bottom: Math.round(v.bottom) }; })()`);
const onScreen = (c) => !!c && c.y != null && c.y >= c.top - 1 && c.y <= c.bottom;
const value = (p, path) => p.ev(`${scene(path)}.live.editor.getValue()`);
const scrollTop = (p) => p.ev(`(() => { const m = ${M}; return m.root.scrollTop; })()`);
const scrollTo = async (p, y) => { await p.ev(`(() => { const m = ${M}; m.root.scrollTop = ${y}; return 1; })()`); await p.sleep(700); await settle(p); };
/** The section at the top of the page, and how far its top is from the page's. */
const topScene = (p) => p.ev(`(() => { const m = ${M}; const v = m.root.getBoundingClientRect(); const s = m.scenes.find(s => s.el.getBoundingClientRect().bottom > v.top + 40); return s.file.basename + '@' + Math.round(s.el.getBoundingClientRect().top - v.top); })()`);
const pageKey = async (p, key) => { const vk = key === 'PageDown' ? 34 : 33; await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: vk }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk }); await p.sleep(200); };
/** Puts the caret at the start or end of a section's text (Ctrl+Home and Ctrl+End go to the start and end of the whole manuscript). */
const caretTo = (p, path, where) => p.ev(`(() => { const cm = ${scene(path)}.live.cm, text = cm.state.doc.toString(); const close = text.startsWith('---') ? text.indexOf('---', 3) : -1; const start = close < 0 ? 0 : text.indexOf(String.fromCharCode(10), close) + 1; cm.focus(); cm.dispatch({ selection: { anchor: ${where === 'end' ? 'text.length' : 'start'} }, scrollIntoView: true }); return 1; })()`).then(() => p.sleep(150));
const fmLength = (text) => /^---\n[\s\S]*?\n---\n/.exec(text)?.[0].length ?? 0;

// ---- confirmed bugs ----

test('BUG: Escape in a section leaves it read only: clicking it gives no caret, and arrows skip it', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, ARRIVAL);
	t.eq(await focused(p), ARRIVAL, 'the caret is in the section');
	await p.key('Escape');
	await p.sleep(300);
	// a note keeps its caret on Escape; here the embed switches to its reading view and the editor is gone
	await clickIn(p, ARRIVAL);
	await p.type('Z');
	await p.sleep(200);
	t.ok(await p.ev(`!!${scene(ARRIVAL)}.live?.cm`), 'the section still has its editor after Escape');
	t.eq(await focused(p), ARRIVAL, 'clicking the section after Escape puts the caret in it');
});

test('BUG: “Toggle reading view” with the caret in a section leaves it read only for good', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, KEEPER);
	await p.ev(`app.commands.executeCommandById('markdown:toggle-preview')`);
	await p.sleep(400);
	await p.ev(`app.commands.executeCommandById('markdown:toggle-preview')`); // a second time doesn't bring it back
	await p.sleep(400);
	await clickIn(p, KEEPER);
	t.ok(await p.ev(`!!${scene(KEEPER)}.live?.cm`), 'the section still has its editor');
	t.eq(await focused(p), KEEPER, 'clicking the section puts the caret in it');
});

test('BUG: switching to another tab and back scrolls the manuscript to the end', async (p, h, t) => {
	await novel(p);
	await scrollTo(p, 3000);
	const before = await scrollTop(p), top = await topScene(p);
	await p.ev(`app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${J(N(1))})).then(() => 1)`);
	await p.sleep(800);
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(800);
	const after = await scrollTop(p);
	t.ok(Math.abs(after - before) < 5, `the page is where it was left: scrollTop ${before} → ${after} (${top} → ${await topScene(p)})`);
});

test('BUG: ArrowDown into a section that starts below the window leaves the caret off screen', async (p, h, t) => {
	await novel(p);
	// Ctrl+End: the caret on the last line of scene 2, which the page scrolls to its bottom edge; scene 3 starts below it
	await clickIn(p, N(2));
	await caretTo(p, N(2), 'end');
	await p.sleep(400);
	const c0 = await caret(p);
	t.ok(c0.path === N(2) && c0.from === c0.len && onScreen(c0), 'the caret is at the end of scene 2, on screen: ' + J(c0));
	t.ok(await p.ev(`${scene(N(3))}.bodyEl.getBoundingClientRect().top > ${M}.root.getBoundingClientRect().bottom`), 'scene 3 starts below the window');
	await p.key('ArrowDown');
	await p.sleep(600);
	const c = await caret(p);
	t.eq(c?.path, N(3), 'ArrowDown went into scene 3');
	t.ok(onScreen(c), 'the page scrolled to keep the caret in view: ' + J(c));
});

test('BUG: holding ArrowDown through several sections: the caret runs off screen and skips lines', async (p, h, t) => {
	await novel(p);
	await clickIn(p, N(1));
	// 8 paragraphs of two lines and the blank lines between: about 24 lines a scene
	for (let i = 0; i < 60; i++) await p.key('ArrowDown');
	await p.sleep(600);
	const c = await caret(p);
	t.ok(onScreen(c), 'the caret is on screen after 60 lines down: ' + J(c));
	t.ok([N(3), N(4)].includes(c.path), 'and about 60 lines down, in scene 3 or 4: ' + c.path);
});

test('BUG: PageDown scrolls the page but leaves the caret behind, off screen', async (p, h, t) => {
	await novel(p);
	await clickIn(p, N(2));
	for (let i = 0; i < 4; i++) await pageKey(p, 'PageDown');
	await p.sleep(400);
	const c = await caret(p);
	t.ok(onScreen(c), 'after PageDown ×4 the caret is on screen, as in a note: ' + J(c));
});

test('BUG: a section’s text is 12 px narrower than the page (a scrollbar gutter), so lines wrap differently from the rendered text and from a note', async (p, h, t) => {
	await openMs(p);
	const w = await p.ev(`(() => { const s = ${scene(ARRIVAL)}; return { text: s.el.querySelector('.cm-content').getBoundingClientRect().width, page: s.bodyEl.getBoundingClientRect().width }; })()`);
	t.ok(Math.abs(w.text - w.page) < 1, 'the editor is as wide as the page: ' + J(w));
});

test('BUG: a section with a table gets its own horizontal scrollbar', async (p, h, t) => {
	await odd(p, { '1 Table': '| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter the table.\n', '2 Text': 'Text.\n' });
	await p.sleep(600);
	const s = await p.ev(`(() => { const e = ${scene('Odd/1 Table.md')}.el.querySelector('.cm-scroller'); return { scrollWidth: e.scrollWidth, clientWidth: e.clientWidth }; })()`);
	t.ok(s.scrollWidth <= s.clientWidth, 'nothing to scroll sideways inside the section: ' + J(s));
});

test('BUG: a section changes height when its editor replaces the rendered text (headings, tables, code, rules, callouts, empty notes), so the text under it jumps', async (p, h, t) => {
	const para = 'The sea came up the rocks and the light turned over it, and the keeper wrote it down in the long book he kept by the window. ';
	await odd(p, {
		'1 Paragraphs': `${para}\n\n${para}${para}\n\n${para}\n`,
		'2 Headings': `# Chapter heading\n\n${para}\n\n## Sub heading\n\n${para}\n`,
		'3 Lists': '- one\n- two\n    - nested\n\n1. first\n2. second\n\n- [ ] todo\n- [x] done\n',
		// (not as the note's first line: an editor whose cursor is at the very start of a table shows that row's source)
		'4 Table': 'Before the table.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter the table.\n',
		'5 Code': 'Before.\n\n```js\nconst a = 1;\n```\n\nAfter.\n',
		'6 Callout': '> [!note] A note\n> Inside the callout.\n\nAfter.\n',
		'7 Rule': 'One\n\n---\n\nTwo\n',
		'8 Empty': '',
	});
	// a window tall enough to hold them all, so all get editors
	await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: 2600, deviceScaleFactor: 1, mobile: false });
	let live, shown;
	try {
		await p.sleep(1500); await settle(p);
		live = await p.ev(`${M}.scenes.map(s => [s.file.basename, !!s.live, s.bodyEl.getBoundingClientRect().height])`);
		// the same sections rendered, as they are before their editors mount
		await p.ev(`(() => { const m = ${M}; m.editable = false; for (const s of m.scenes) if (s.live) m.unmount(s); return 1; })()`);
		await p.sleep(1500);
		shown = await p.ev(`${M}.scenes.map(s => [s.file.basename, s.shown !== null, s.bodyEl.getBoundingClientRect().height])`);
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await p.sleep(300);
	}
	t.ok(live.every((x) => x[1]), 'every section was live');
	t.ok(shown.every((x) => x[1]), 'every section was rendered');
	const off = live.map((x, i) => [x[0], Math.round(shown[i][2] - x[2])]).filter((x) => Math.abs(x[1]) > 2);
	t.eq(off.map((x) => `${x[0]}: ${x[1] > 0 ? '+' : ''}${x[1]} px`).join(', '), '', 'rendered and live heights match');
});

// ---- rough edges: where the manuscript doesn't do what a note (or the rest of the view) does ----

// BUG (found 2026-10-01; not from the one-folder board: the outliner and back does the same): the page comes back at
// Scene 01. Opening the manuscript puts the caret in its first section a moment after setMode has noted where the mode
// started (`enteredOn`, read before the section's editor is mounted), so at the next switch that section looks like
// somewhere the writer went: it's carried to the other mode and revealed again on the way back, over the kept place.
test('BUG: switching to the corkboard and back keeps the place in the manuscript', async (p, h, t) => {
	await novel(p);
	await scrollTo(p, 3000);
	const before = await topScene(p);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`); await p.sleep(500);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`); await p.sleep(500); await settle(p);
	const after = await topScene(p), at = (x) => [x.split('@')[0], Number(x.split('@')[1])];
	t.ok(at(after)[0] === at(before)[0] && Math.abs(at(after)[1] - at(before)[1]) <= 3, `the same section is at the top: ${before} → ${after}`);
});

test('UX: opening a note from its title, then Back, returns to the same place', async (p, h, t) => {
	await novel(p);
	await scrollTo(p, 3000);
	const before = await topScene(p);
	const at = await p.ev(`(() => { const m = ${M}, v = m.root.getBoundingClientRect(); const s = m.scenes.find(s => s.titleEl.getBoundingClientRect().top > v.top + 20); const r = s.titleEl.getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; })()`);
	// (a click on a title renames it in place, as a note's own title; Mod-click, the menu or Enter opens the note)
	await p.right(at.x, at.y);
	await p.sleep(250);
	await p.ev(`(() => { [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'Open').click(); return 1; })()`);
	await p.sleep(700);
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'markdown', 'the note opened in the tab');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await p.sleep(900); await settle(p);
	t.eq(await p.ev(`${VIEW}?.mode`), 'manuscript', 'Back shows the manuscript');
	t.eq(await topScene(p), before, 'at the same place');
});

test('UX: “New scene here” with the caret in a section adds the section and keeps the manuscript open', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, ARRIVAL);
	await p.ev(`app.commands.executeCommandById('binders:new-scene')`);
	await p.sleep(1200);
	t.ok(existsSync(join(p.vaultDir, `${B}/Part One/Untitled.md`)), 'the scene was made after the one with the caret');
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'binders-view', 'the tab still shows the manuscript');
});

test('UX: a click in the empty space below the last section puts the caret at its end, as below a note’s text', async (p, h, t) => {
	await openMs(p);
	await p.ev(`(() => { const m = ${M}; m.root.scrollTop = m.root.scrollHeight; return 1; })()`);
	await p.sleep(600); await settle(p);
	const last = await p.ev(`(() => { const m = ${M}; const r = m.scenes[m.scenes.length - 1].el.getBoundingClientRect(); return { x: r.left + 200, y: r.bottom + 150 }; })()`);
	await p.click(last.x, last.y);
	await p.sleep(300);
	t.eq(await focused(p), `${B}/Epilogue.md`, 'the caret is in the last section');
});

// ---- solid ----

test('the hidden properties can’t be reached from the body: Backspace, ArrowLeft and Shift+arrows at its start', async (p, h, t) => {
	await openMs(p);
	const before = disk(p, ARRIVAL), fm = fmLength(before);
	await clickIn(p, ARRIVAL);
	// Ctrl+Home: the start of the whole manuscript, which is the start of the first section's text, not of its file
	await p.key('Home', 'ctrl');
	await p.sleep(300);
	const first = await caret(p);
	t.ok(first.path === PROLOGUE && first.from === fmLength(disk(p, PROLOGUE)), 'Ctrl+Home goes to the start of the first section’s text, not of its file: ' + J(first));
	await clickIn(p, ARRIVAL);
	await caretTo(p, ARRIVAL, 'start');
	t.eq((await caret(p)).from, fm, 'the caret at the start of the body');
	const prologue = disk(p, PROLOGUE);
	await p.key('Backspace'); await p.key('Backspace');
	t.eq(await value(p, ARRIVAL), before, 'Backspace at the start removes nothing');
	// (issue 24: ArrowLeft at the start goes on into the previous section's end, never into the properties)
	await p.key('ArrowLeft');
	await p.sleep(300);
	const back = await caret(p);
	t.ok(back && back.path === PROLOGUE && back.from === back.len, 'ArrowLeft at the start goes to the end of the previous section: ' + J(back));
	await p.key('ArrowRight');
	await p.sleep(300);
	const home = await caret(p);
	t.ok(home && home.path === ARRIVAL && home.from === fm, 'and ArrowRight comes back to the start of the body: ' + J(home));
	await p.key('ArrowLeft', 'shift'); await p.key('ArrowUp', 'shift');
	const c = await caret(p);
	t.ok(c.from === fm && c.to === fm, 'Shift+arrows select nothing above the body: ' + J(c));
	await p.key('a', 'ctrl');
	const all = await caret(p);
	t.ok(all.from === fm && all.to === all.len, 'select all is the body: ' + J(all));
	await caretTo(p, ARRIVAL, 'end'); await p.key('Delete'); await p.key('ArrowRight');
	t.eq(await value(p, ARRIVAL), before, 'Delete at the end pulls nothing in');
	// (issue 24: ArrowRight at the very end now goes on into the next section, as ArrowDown does on the last line)
	const next = await p.ev(`(() => { const m = ${M}, i = m.scenes.findIndex(s => s.file.path === ${J(ARRIVAL)}); return m.scenes[i + 1]?.file.path ?? null; })()`);
	t.ok(next && next !== ARRIVAL, 'ArrowRight at the end goes to the next section: ' + next);
	t.eq(await focused(p), next, 'and the caret is in it');
	t.eq(await value(p, ARRIVAL), before, 'the text is unchanged');
	await p.sleep(2300);
	t.eq(disk(p, ARRIVAL), before, 'nothing written');
	t.eq(disk(p, PROLOGUE), prologue, 'nothing written to the previous section either');
});

test('wheel scrolling: the text on screen moves only by the scroll while editors mount and unmount', async (p, h, t) => {
	await novel(p, 24);
	await p.ev(`(() => { const m = ${M}; window.__rec = []; window.__run = true;
		const tick = () => { const v = m.root.getBoundingClientRect(), mid = (v.top + v.bottom) / 2; let best = null;
			for (let i = 0; i < m.scenes.length; i++) { const r = m.scenes[i].el.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) { best = [i, r.top]; break; } }
			window.__rec.push({ t: performance.now(), st: m.root.scrollTop, i: best?.[0], top: best?.[1], live: m.scenes.filter(s => s.live).length });
			if (window.__run) requestAnimationFrame(tick); };
		requestAnimationFrame(tick); return 1; })()`);
	for (let k = 0; k < 30; k++) { await p.wheel(800, 500, 240); await p.sleep(30); }
	await p.sleep(1200);
	for (let k = 0; k < 8; k++) { await p.wheel(800, 500, 120); await p.sleep(250); } // slowly: editors mount between steps
	await p.sleep(1200);
	for (let k = 0; k < 25; k++) { await p.wheel(800, 500, -300); await p.sleep(30); }
	await p.sleep(1200);
	const rec = await p.ev(`(() => { window.__run = false; return window.__rec; })()`);
	// what the eye sees: between two frames, the section in the middle moves by exactly what the page scrolled, less
	// what the manuscript added to scrollTop to make up for a height change above it
	let mounts = 0, worst = 0, slow = 0;
	for (let i = 1; i < rec.length; i++) {
		const a = rec[i - 1], b = rec[i];
		if (b.t - a.t > 100) slow++;
		if (a.live !== b.live) mounts++;
		if (a.i !== b.i || a.i == null) continue;
		// a frame where nothing was scrolled by the wheel: the section must not move at all
		const moved = b.top - a.top, scrolled = b.st - a.st;
		if (a.live !== b.live && Math.abs(moved) > worst && Math.abs(moved + scrolled) > 1.5) worst = Math.abs(moved);
	}
	t.ok(mounts > 3, 'editors were mounted and unmounted on the way: ' + mounts);
	t.ok(worst < 2, `no jump on screen when an editor mounts or unmounts (worst ${worst} px)`);
	t.eq(slow, 0, 'no frame over 100 ms');
});

test('the first click on a section that isn’t live yet puts the caret on the word clicked', async (p, h, t) => {
	await novel(p, 24);
	await p.ev(`(() => { const m = ${M}; m.scenes[18].el.scrollIntoView(); return 1; })()`);
	// before its editor is mounted (120 ms after scrolling stops): the rendered text
	let at = null;
	for (let i = 0; i < 20 && !at; i++) {
		at = await p.ev(`(() => { const s = ${M}.scenes[18]; if (s.live) return 'live'; const ps = s.bodyEl.querySelectorAll('p'); if (ps.length < 4) return null; const tn = ps[3].firstChild, i = tn.textContent.indexOf('window'); const r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + 6); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
		if (!at) await p.sleep(10);
	}
	if (at === 'live' || !at) return; // too quick to catch here; nothing to check
	await p.click(at.x, at.y);
	await p.sleep(600);
	const c = await p.ev(`(() => { const s = ${M}.scenes[18], cm = s.live?.cm; if (!cm) return null; const h = cm.state.selection.main.head; return { word: cm.state.doc.sliceString(h - 6, h + 6), focused: s.el.contains(document.activeElement), para: cm.state.doc.sliceString(0, h).split('paragraph').length - 1 }; })()`);
	t.ok(c?.focused, 'the section took the focus');
	t.ok(/window/.test(c.word) || /ndow|wind/.test(c.word), 'the caret is in the word clicked: ' + J(c));
	t.eq(c.para, 4, 'in the paragraph clicked');
});

test('inside one section the page follows the caret: arrows and typing at the bottom of the window; ArrowUp into the section above', async (p, h, t) => {
	await novel(p, 6, 30);
	await p.ev(`(() => { const m = ${M}; m.scenes[2].el.scrollIntoView(); m.root.scrollTop += 300; return 1; })()`);
	await p.sleep(800); await settle(p);
	const x = await p.ev(`${M}.scenes[2].bodyEl.getBoundingClientRect().left + 300`);
	await p.click(x, 800);
	t.eq(await focused(p), N(3), 'the caret is in scene 3');
	for (let i = 0; i < 12; i++) await p.key('ArrowDown');
	t.ok(onScreen(await caret(p)), 'on screen after 12 lines down: ' + J(await caret(p)));
	for (let i = 0; i < 5; i++) { await p.key('Enter'); await p.type('New line ' + i); }
	t.ok(onScreen(await caret(p)), 'on screen after typing new lines: ' + J(await caret(p)));
	for (let i = 0; i < 10; i++) await p.key('z', 'ctrl');
	// up, out of the top of a section whose start is at the top of the window
	await p.ev(`(() => { const m = ${M}; const r = m.scenes[2].el.getBoundingClientRect(); m.root.scrollTop += r.top - m.root.getBoundingClientRect().top - 2; return 1; })()`);
	await p.sleep(800); await settle(p);
	await clickIn(p, N(3));
	await caretTo(p, N(3), 'start'); await p.key('ArrowUp');
	await p.sleep(400);
	const c = await caret(p);
	t.eq(c.path, N(2), 'ArrowUp went into scene 2');
	t.ok(onScreen(c), 'and the page scrolled up to it: ' + J(c));
});

test('find opens the view’s own bar (in the note’s column, one bar for the whole manuscript) with the caret’s section as where it starts, and Escape gives the caret back; the command palette returns to the section', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, ARRIVAL);
	await p.key('f', 'ctrl');
	await p.sleep(300);
	t.ok(await p.ev(`!${scene(ARRIVAL)}.el.querySelector('.document-search-container') && !!document.querySelector('.workspace-leaf.mod-active .binders-view > .binders-find') && document.activeElement.tagName === 'INPUT'`), 'the find bar is the view’s, not one in the section, and is focused');
	await p.type('jetty');
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-find .document-search-count')?.textContent`), '1 / 1 in 1 note', 'it counts the matches of every note, and in how many');
	await p.key('Escape');
	await p.sleep(200);
	t.eq(await focused(p), ARRIVAL, 'Escape closes it and the caret is back in the section');
	await p.key('p', 'ctrl');
	await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector('.prompt')`), 'the command palette opened');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await focused(p), ARRIVAL, 'closing the palette returns to the section');
	t.eq(await p.ev(`app.workspace.activeEditor?.file?.path`), ARRIVAL, 'which is the active editor');
});

test('a checkbox in a section toggles on click and saves; link suggestions keep the arrows and insert the link', async (p, h, t) => {
	await odd(p, { '1 Tasks': 'Intro.\n\n- [ ] todo one\n- [ ] todo two\n', '2 Text': 'Some text.\n' });
	const cb = await p.at('.binders-manuscript .task-list-item-checkbox');
	await p.click(cb.x, cb.y);
	await p.sleep(2500);
	t.eq(disk(p, 'Odd/1 Tasks.md'), 'Intro.\n\n- [x] todo one\n- [ ] todo two\n', 'the task is checked on disk');
	await clickIn(p, 'Odd/2 Text.md', 20);
	await p.key('End'); await p.type(' [[');
	await p.sleep(500);
	t.ok(await p.ev(`!!document.querySelector('.suggestion-container .suggestion-item')`), 'suggestions opened');
	await p.key('ArrowDown'); await p.key('ArrowUp'); await p.key('ArrowUp');
	t.eq(await focused(p), 'Odd/2 Text.md', 'arrows move in the list, not to another section');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(/^Some text\. \[\[[^\]]+\]\]\n$/.test(await value(p, 'Odd/2 Text.md')), 'the link was inserted: ' + J(await value(p, 'Odd/2 Text.md')));
});

test('deleting the note with the caret and unsaved typing: its section goes, nothing is written back', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, KEEPER);
	await p.type('UNSAVED ');
	await p.ev(`app.fileManager.trashFile(app.vault.getAbstractFileByPath(${J(KEEPER)})).then(() => 1)`);
	await p.sleep(900);
	t.eq(await p.ev(`${M}.scenes.map(s => s.file.basename).join('|')`), 'Prologue|Arrival|Storm warning|The wreck|Lights out|Epilogue', 'the section is gone');
	await p.type('ghost');
	await p.sleep(2500);
	t.ok(!existsSync(join(p.vaultDir, KEEPER)), 'the note was not written back');
});

test('the section with the caret stays put when the window is resized, the line length setting changes, or the app is zoomed', async (p, h, t) => {
	await novel(p);
	await scrollTo(p, 3000);
	// the section across the middle of the page: its top is above the window
	await p.click(700, 460);
	await p.sleep(200);
	t.ok(await focused(p), 'the caret is in a section');
	const place = () => p.ev(`(() => { const m = ${M}; const s = m.scenes.find(s => s.el.contains(document.activeElement)); return s ? s.file.basename + '@' + Math.round(s.el.getBoundingClientRect().top - m.root.getBoundingClientRect().top) : null; })()`);
	const before = await place();
	try {
		await p.ev(`app.vault.setConfig('readableLineLength', false)`); await p.sleep(800);
		t.eq(await place(), before, 'readable line length off');
		await until(p, `${M}.page.getBoundingClientRect().width > 900`, 8000);
		t.ok(await p.ev(`${M}.page.getBoundingClientRect().width > 900`), 'the page is as wide as the pane');
		await p.ev(`app.vault.setConfig('readableLineLength', true)`); await p.sleep(800);
		t.eq(await place(), before, 'and on again');
		await p.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 900, deviceScaleFactor: 1, mobile: false }); await p.sleep(900);
		t.eq(await place(), before, 'a narrow window');
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); await p.sleep(900);
		t.eq(await place(), before, 'and wide again');
		await p.ev(`(() => { require('electron').webFrame.setZoomLevel(2); return 1; })()`); await p.sleep(900);
		t.eq(await place(), before, 'zoomed in');
	} finally {
		await p.ev(`(() => { require('electron').webFrame.setZoomLevel(0); app.vault.setConfig('readableLineLength', true); return 1; })()`);
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await p.sleep(500);
	}
});

test('a note made in the folder and the folder renamed, while typing: the caret stays where it is', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, ARRIVAL);
	await p.type('one ');
	const c0 = await caret(p);
	await p.ev(`app.vault.create(${J(`${B}/Part One/Brand new.md`)}, 'Fresh text.\\n').then(() => 1)`);
	await p.sleep(1200);
	t.ok(await p.ev(`${M}.scenes.some(s => s.file.basename === 'Brand new')`), 'the new note has a section');
	t.eq((await caret(p)).from, c0.from, 'the caret didn’t move');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${J(`${B}/Part One`)}), ${J(`${B}/Part 1`)}).then(() => 1)`);
	await p.sleep(1200);
	try {
		t.eq(await p.ev(`document.querySelector('.binders-manuscript-heading').textContent`), 'Part 1', 'the heading follows');
		t.eq(await focused(p), `${B}/Part 1/Arrival.md`, 'the caret is still in the section');
		await p.type('two ');
		await p.sleep(2500);
		t.ok(disk(p, `${B}/Part 1/Arrival.md`).includes('one two '), 'typing before and after is saved');
	} finally {
		await p.ev(`(async () => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); await new Promise(r => setTimeout(r, 300)); const f = app.vault.getAbstractFileByPath(${J(`${B}/Part 1`)}); if (f) await app.fileManager.renameFile(f, ${J(`${B}/Part One`)}); await app.plugins.plugins.binders.binders.flush(); return 1; })()`);
		await p.sleep(600);
	}
});
