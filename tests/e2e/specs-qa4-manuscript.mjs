// QA round 4: the manuscript after the caret-following, filter, title menu, spacing and split/merge work. One question
// for everything: can a writer lose, duplicate or corrupt words here, or be thrown out of their flow?
// Tests named “BUG: …” and “UX: …” fail on purpose until fixed; the rest record behaviour that is solid.
// (Earlier rounds: specs-manuscript.mjs, specs-qa-manuscript.mjs, specs-qa2-manuscript.mjs. Nothing here repeats them.)
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { VIEW, answer, clickMenu, closeMenus, hoverMenu, menuItems, openView, reload, until, withTidy } from './view-helpers.mjs';

export const specs = [];
/** Every test tidies up after itself: menus and dialogs closed, the folders it made deleted. */
const test = (name, fn) => specs.push({ name: 'qa4-manuscript: ' + name, fn: withTidy(async (p, h, t) => {
	try { await fn(p, h, t); } finally {
		await closeMenus(p).catch(() => {});
		await p.ev(`(() => { document.querySelectorAll('.modal-close-button').forEach(b => b.click()); return 1; })()`).catch(() => {});
	}
}) });

const B = 'The Lighthouse';
const ORDER = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((n) => `${B}/${n}.md`);
const [PROLOGUE, ARRIVAL, KEEPER, STORM, , , EPILOGUE] = ORDER;
const J = JSON.stringify;
const M = `${VIEW}.current`;
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
const onDisk = (p, path) => existsSync(join(p.vaultDir, path));
/** Every Markdown file of the vault as it is on disk, by path (the trash too). */
function snap(p) {
	const out = {};
	const walk = (dir) => { for (const f of readdirSync(dir)) { const q = join(dir, f); if (f === '.obsidian') continue; if (statSync(q).isDirectory()) walk(q); else if (/\.md$/.test(f)) out[relative(p.vaultDir, q)] = readFileSync(q, 'utf8'); } };
	walk(p.vaultDir);
	return out;
}
/** Paths whose bytes differ between two snapshots (added, removed or changed). */
const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
const fm = (s) => (s.match(/^---\n[\s\S]*?\n---\n/) || [''])[0];
const body = (s) => s.slice(fm(s).length);
const count = (s, sub) => s.split(sub).length - 1;
const idx = (path) => `${M}.scenes.findIndex(s => s.file.path === ${J(path)})`;
const scene = (path) => `${M}.scenes[${idx(path)}]`;
const value = (p, path) => p.ev(`${scene(path)}.live?.editor.getValue() ?? null`);

async function settle(p, ms = 4000) {
	for (let i = 0; i < ms / 50; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; if (!m || !m.scenes) return false; const near = m.scenes.filter(s => m.near.has(s.el)); return (near.length > 0 || m.scenes.length === 0) && near.slice(0, m.liveMax).every(s => m.editable ? (s.live || s.broken) && !s.mounting : s.shown !== null); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(150);
}
/** The real binder view on a folder, in manuscript mode. */
async function openMs(p, folder = B, newLeaf = false) {
	await openView(p, folder, newLeaf);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}
/** A binder “Novel”: `scenes` notes of `paras` two-line paragraphs each, with properties (odd scenes draft, even idea). */
async function novel(p, scenes = 14, paras = 8, open = true) {
	await p.ev(`(async () => {
		await app.vault.createFolder('Novel');
		for (let i = 1; i <= ${scenes}; i++) {
			const ps = []; for (let k = 1; k <= ${paras}; k++) ps.push('Scene ' + i + ' paragraph ' + k + '. The sea came up the rocks and the light turned over it, and the keeper wrote it down in the long book he kept by the window, as he had every night since the war.');
			await app.vault.create('Novel/Scene ' + String(i).padStart(2, '0') + '.md', '---\\nstatus: ' + (i % 2 ? 'draft' : 'idea') + '\\nsynopsis: Scene ' + i + '\\n---\\n' + ps.join('\\n\\n') + '\\n');
		}
		await new Promise(r => setTimeout(r, 600));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Novel'));
		return 1; })()`);
	await p.sleep(800);
	if (open) await openMs(p, 'Novel');
}
const N = (i) => `Novel/Scene ${String(i).padStart(2, '0')}.md`;
/** A binder “Odd” with these notes (name → text), in this order. */
async function odd(p, notes, open = true) {
	await p.ev(`(async () => {
		if (!app.vault.getAbstractFileByPath('Odd')) await app.vault.createFolder('Odd');
		for (const [n, s] of ${J(Object.entries(notes))}) await app.vault.adapter.write('Odd/' + n + '.md', s);
		await new Promise(r => setTimeout(r, 900));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Odd'));
		return 1; })()`);
	await p.sleep(800);
	if (open) await openMs(p, 'Odd');
}
/** A real click on a section's text (its first line, dx px in). */
async function clickIn(p, path, dx = 100) {
	const r = await p.ev(`(() => { const e = ${scene(path)}.el.querySelector('.cm-line, p'); const r = e.getBoundingClientRect(); return { x: r.left + ${dx}, y: r.top + 10 }; })()`);
	await p.click(r.x, r.y);
	await p.sleep(150);
}
/** The caret at the end of a section's text (scrolled to the middle of the window first). */
async function focusEnd(p, path) {
	await p.ev(`(async () => { const m = ${M}, s = ${scene(path)}; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.sleep(120);
}
/** The caret just before some text of a section (or selecting `len` characters from there). Returns where. */
const caretAt = (p, path, text, len = 0) => p.ev(`(() => { const cm = ${scene(path)}.live.cm, i = cm.state.doc.toString().indexOf(${J(text)}, ${J(text)}.length ? cm.state.doc.toString().indexOf('\\n---\\n') + 5 : 0); cm.focus(); cm.dispatch({ selection: { anchor: i, head: i + ${len} } }); return i; })()`);
/** Where the focus is: the section's note, or null. */
const focused = (p) => p.ev(`(() => { const m = ${M}; const s = m?.scenes?.find(s => s.el.contains(document.activeElement)); return s && document.activeElement.classList.contains('cm-content') ? s.file.path : null; })()`);
/** What has the focus, in words: "body", or its class and the section it's in. */
const active = (p) => p.ev(`(() => { const a = document.activeElement; return a === document.body ? 'body' : (a.className || a.tagName).toString().split(' ').slice(0, 2).join(' ') + (a.closest('.binders-manuscript-scene') ? ' in ' + a.closest('.binders-manuscript-scene').querySelector('.binders-manuscript-title').textContent : ''); })()`);
/** The caret of the focused section: where it is in the text and on screen. */
const caret = (p) => p.ev(`(() => { const m = ${M}; const s = m.scenes.find(s => s.el.contains(document.activeElement)); if (!s?.live?.cm || !document.activeElement.classList.contains('cm-content')) return null; const cm = s.live.cm, sel = cm.state.selection.main, c = cm.coordsAtPos(sel.head), v = m.root.getBoundingClientRect(); return { path: s.file.path, from: sel.from, to: sel.to, head: sel.head, len: cm.state.doc.length, y: c ? Math.round(c.top) : null, top: Math.round(v.top), bottom: Math.round(v.bottom), before: cm.state.sliceDoc(Math.max(0, sel.head - 14), sel.head), after: cm.state.sliceDoc(sel.head, sel.head + 14) }; })()`);
const onScreen = (c) => !!c && c.y != null && c.y >= c.top - 1 && c.y <= c.bottom;
const scrollTop = (p) => p.ev(`(() => { const m = ${M}; return Math.round(m.root.scrollTop); })()`);
/** What the manuscript knows: the caret left behind, what has the focus, which sections have editors or unsaved typing. */
const st = (p) => p.ev(`(() => { const m = ${M}; if (!m) return null; const a = document.activeElement; return { left: m.left?.path ?? null, coming: m.coming != null, strays: m.strays.join(''), active: a === document.body ? 'body' : a.className.split(' ')[0] || a.tagName, top: Math.round(m.root.scrollTop), live: m.scenes.filter(s => s.live).map(s => s.file.basename), dirty: m.scenes.filter(s => s.live?.dirty).map(s => s.file.basename) }; })()`);
/** Real keys, as fast as they can be sent: each a keydown with its text and a keyup (Input.insertText has no keydown,
    and the manuscript brings the caret back on a keydown). "\n" is Enter. */
async function keys(p, text, gap = 0) {
	for (const ch of text) {
		const enter = ch === '\n', key = enter ? 'Enter' : ch;
		const code = enter ? 'Enter' : ch === ' ' ? 'Space' : /^[a-z]$/i.test(ch) ? 'Key' + ch.toUpperCase() : /^[0-9]$/.test(ch) ? 'Digit' + ch : undefined;
		// (a virtual key code only where it's the character's own: “.” is 46, which is Delete's)
		const vk = enter ? 13 : /^[a-z0-9 ]$/i.test(ch) ? ch.toUpperCase().charCodeAt(0) : undefined;
		p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: enter ? '\r' : ch });
		const up = p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
		if (gap) { await up; await p.sleep(gap); }
	}
	await p.ev('1');
}
const pageKey = async (p, key, mods = 0) => { const vk = { PageDown: 34, PageUp: 33, End: 35, Home: 36 }[key]; await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: vk, modifiers: mods }); await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk, modifiers: mods }); await p.sleep(250); };
/** An IME composition as a keyboard sends it: the key (229), the composing text growing, then the commit. */
async function compose(p, parts = ['k', 'か', 'かn', 'かな'], commit = '仮名') {
	await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Process', code: 'KeyK', windowsVirtualKeyCode: 229 });
	for (const part of parts) await p.send('Input.imeSetComposition', { text: part, selectionStart: part.length, selectionEnd: part.length });
	if (commit != null) await p.send('Input.insertText', { text: commit });
}
/** Turns the wheel over the page: `n` notches of `dy`. */
async function wheel(p, dy, n = 1, gap = 20) {
	const at = await p.ev(`(() => { const r = ${M}.root.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
	for (let i = 0; i < n; i++) { await p.wheel(at.x, at.y, dy); if (gap) await p.sleep(gap); }
}
/** Types " AAA" at the end of a section and scrolls far from it by the wheel, so its editor lets go of the focus; then
    waits for it to be saved and go back to plain text (`unload`), or not. */
async function leave(p, t, path, { down = true, unload = false, type = ' AAA', notches = 24 } = {}) {
	await focusEnd(p, path);
	if (type) await keys(p, type);
	await wheel(p, down ? 240 : -240, notches);
	await p.sleep(unload ? 3500 : 150);
	const s = await st(p);
	t.eq(s.left, path, 'the caret was left behind in the section');
	t.eq(s.active, 'body', 'and nothing has the focus');
	// (a section is saved as soon as the cursor leaves it, so its editor may go at any time after: only "gone" is checked)
	if (unload) t.eq(s.live.includes(path.split('/').pop().replace(/\.md$/, '')), false, 'its editor is gone');
}
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')].map(n => n.textContent)).filter(Boolean).join(' | '); })()`);
const clearNotices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
/** Somewhere on a section's title (near its start). */
const titleAt = (p, path) => p.ev(`(() => { const r = ${scene(path)}.titleEl.getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }; })()`);
const titleMenu = async (p, path) => { const at = await titleAt(p, path); await p.right(at.x, at.y); await p.sleep(300); };
/** What the page shows: headings and sections, in order. */
const shown = (p) => p.ev(`${M}.entries.map(e => e.kind === 'heading' ? '# ' + e.key.name : e.file.basename).join(' | ')`);
const countText = (p) => p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count')?.textContent`);
const setFilter = async (p, status = [], label = []) => { await p.ev(`(() => { ${VIEW}.setFilter({ status: ${J(status)}, label: ${J(label)} }); return 1; })()`); await p.sleep(400); await settle(p); };
const write = (p, path, text) => p.ev(`app.vault.modify(app.vault.getAbstractFileByPath(${J(path)}), ${J(text)}).then(() => 1)`);
const setProps = (p, path, props) => p.ev(`${VIEW}.setProps(app.vault.getAbstractFileByPath(${J(path)}), ${J(props)}).then(() => 1)`);
/** Obsidian's trash in the vault (“.trash”), emptied and in use, so a test reads what it trashed itself. Returns the setting to put back. */
async function localTrash(p) {
	const was = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
	await p.ev(`(async () => { if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	return was;
}
const trashBack = (p, was) => p.ev(`(() => { app.vault.setConfig('trashOption', ${J(was)} ?? undefined); return 1; })()`);
const desktop = (p) => p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
/** "Measure loop restarted" warnings logged so far. */
const measureLoops = (p) => p.errors.filter((e) => /Measure loop/.test(e)).length;

// ================================================================================================================
// 1. The caret left behind when the page is scrolled far from it
// ================================================================================================================

test('scrolled far by the wheel, a fast burst of keys goes in at the caret, in order: editor still there, and after it has gone', async (p, h, t) => {
	await novel(p);
	const a = disk(p, N(2)), b = disk(p, N(12));
	await leave(p, t, N(2));
	await keys(p, 'hello world\nnext line');
	await p.sleep(400);
	t.eq(await focused(p), N(2), 'the first key put the caret back');
	t.ok(onScreen(await caret(p)), 'and the page with it');
	await leave(p, t, N(12), { down: false, unload: true });
	await keys(p, 'quick brown fox\njumps');
	await p.sleep(500);
	t.ok(onScreen(await caret(p)), 'the page came back to the caret');
	await p.sleep(2500);
	t.eq(disk(p, N(2)), a.replace(/\n$/, ' AAAhello world\nnext line\n'), 'not a key lost or out of order (editor still there)');
	t.eq(disk(p, N(12)), b.replace(/\n$/, ' AAAquick brown fox\njumps\n'), 'nor when the section had gone back to plain text');
	t.eq(measureLoops(p), 0, 'no “Measure loop restarted”');
});

test('scrolled far: Backspace, ArrowLeft, Delete, a paste and an IME composition as the first key act at the caret', async (p, h, t) => {
	await novel(p);
	const before = snap(p);
	await leave(p, t, N(2));
	await p.key('Backspace'); await keys(p, 'x');
	await leave(p, t, N(3));
	await p.key('ArrowLeft'); await keys(p, 'x');
	await leave(p, t, N(4));
	await p.ev(`(() => { require('electron').clipboard.writeText('PASTED'); return 1; })()`);
	await p.key('v', 'ctrl');
	await p.sleep(200);
	await leave(p, t, N(11), { down: false, unload: true });
	await p.key('Backspace'); await keys(p, 'x');
	await leave(p, t, N(12), { down: false, unload: true });
	await compose(p);
	await p.sleep(200);
	await leave(p, t, N(13), { down: false });
	await compose(p);
	await p.sleep(2600);
	const end = (i, tail) => t.eq(disk(p, N(i)), before[N(i)].replace(/\n$/, tail + '\n'), `scene ${i}`);
	end(2, ' AAx'); end(3, ' AAxA'); end(4, ' AAAPASTED'); end(11, ' AAx'); end(12, ' AAA仮名'); end(13, ' AAA仮名');
	t.eq(changed(before, snap(p)).join(), [2, 3, 4, 11, 12, 13].map((i) => N(i)).join(), 'nothing else changed');
	// (Electron says its clipboard is deprecated in a page: not the plugin's)
	for (let i = p.errors.length - 1; i >= 0; i--) if (/clipboard/.test(p.errors[i])) p.errors.splice(i, 1);
});

test('scrolled far: Ctrl+A then a letter replaces the section’s text and leaves its properties', async (p, h, t) => {
	await novel(p);
	const before = disk(p, N(2));
	await leave(p, t, N(2));
	await p.key('a', 'ctrl'); await p.sleep(200);
	await keys(p, 'x');
	await p.sleep(2600);
	t.eq(disk(p, N(2)), fm(before) + 'x', 'the properties are as they were');
});

test('scrolled far: scrolling back shows the caret again without moving the page; the command palette and a menu opened meanwhile take nothing', async (p, h, t) => {
	await novel(p);
	const before = disk(p, N(2));
	await leave(p, t, N(2), { unload: true });
	// the palette: what's typed goes to it, the page stays, the caret is still kept
	const top = await scrollTop(p);
	await p.key('p', 'ctrl'); await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector('.prompt')`), 'the command palette opened');
	await p.type('zz'); await p.key('Escape'); await p.sleep(400);
	t.eq(await scrollTop(p), top, 'the page didn’t move');
	t.eq((await st(p)).left, N(2), 'the caret is still kept');
	// a menu
	const b = await p.at('.workspace-leaf.mod-active .binders-mode-button');
	await p.click(b.x, b.y); await p.sleep(300);
	await keys(p, 'x'); await p.sleep(200);
	t.eq(await scrollTop(p), top, 'a key with a menu open doesn’t move the page');
	await closeMenus(p);
	await p.ev(`document.activeElement.blur()`);
	// back by the wheel: the caret shows again, in its place
	await wheel(p, -120, 60, 25);
	await p.sleep(700);
	const c = await caret(p);
	t.eq(c?.path, N(2), 'scrolling back gives the section the caret again');
	t.eq(c.before, ' the war. AAA'.padStart(14, 'e'), 'where it was: ' + J(c.before));
	await keys(p, 'back');
	await p.sleep(2600);
	t.eq(disk(p, N(2)), before.replace(/\n$/, ' AAAback\n'), 'typing carries on there, and nothing typed elsewhere got in');
});

test('scrolled far: the note renamed meanwhile still gets the typing; closing the tab or disabling the plugin saves what was typed', async (p, h, t) => {
	await novel(p);
	const s2 = disk(p, N(2)), s3 = disk(p, N(3)), s4 = disk(p, N(4));
	await leave(p, t, N(2));
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${J(N(2))}), 'Novel/Renamed.md').then(() => 1)`);
	await p.sleep(600);
	await keys(p, 'typed');
	await p.sleep(2600);
	t.eq(disk(p, 'Novel/Renamed.md'), s2.replace(/\n$/, ' AAAtyped\n'), 'typed into the renamed note');
	t.ok(!onDisk(p, N(2)), 'the old name isn’t written back');
	await focusEnd(p, N(3)); await keys(p, ' BBB');
	await wheel(p, 240, 24); await p.sleep(100);
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].detach(); return 1; })()`); await p.sleep(400);
	t.eq(disk(p, N(3)), s3.replace(/\n$/, ' BBB\n'), 'closing the tab saved it');
	await openMs(p, 'Novel');
	await focusEnd(p, N(4)); await keys(p, ' CCC');
	await wheel(p, 240, 24); await p.sleep(100);
	try {
		await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`); await p.sleep(300);
		t.eq(disk(p, N(4)), s4.replace(/\n$/, ' CCC\n'), 'disabling the plugin saved it');
	} finally { await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`); await p.sleep(800); }
});

test('BUG: Enter at the end of a paragraph, as the first key after scrolling far, adds two line breaks', async (p, h, t) => {
	await novel(p);
	await focusEnd(p, N(2));
	const at = await caretAt(p, N(2), '\n\nScene 2 paragraph 4');
	const before = await value(p, N(2));
	await wheel(p, 240, 24); await p.sleep(200);
	t.eq((await st(p)).left, N(2), 'the caret was left behind');
	await p.key('Enter'); await p.sleep(200);
	await keys(p, 'x'); await p.sleep(300);
	const v = await value(p, N(2));
	t.eq(v.length - before.length, 2, 'Enter and “x” are two characters');
	t.eq(v, before.slice(0, at) + '\nx' + before.slice(at), 'one line break, then the x');
});

test('BUG: a key pressed for a section that was deleted while scrolled away is kept, and typed into another note later', async (p, h, t) => {
	await novel(p);
	const s1 = disk(p, N(1));
	await leave(p, t, N(13), { down: false, unload: true });
	await p.ev(`app.vault.trash(app.vault.getAbstractFileByPath(${J(N(13))}), false).then(() => 1)`);
	await p.sleep(500);
	await keys(p, 'q'); // nowhere to go
	await p.sleep(300);
	// later: type in the first scene, read further down, come back by typing
	await leave(p, t, N(1), { type: ' B', unload: true });
	await keys(p, 'z');
	await p.sleep(2800);
	t.eq(disk(p, N(1)).slice(-16), s1.replace(/\n$/, ' Bz\n').slice(-16), 'only what was typed for this note is in it (not the “q”)');
});

test('BUG: a key pressed for a section the filter hid while scrolled away is kept, and typed into another note later', async (p, h, t) => {
	await novel(p);
	const s2 = disk(p, N(2));
	await leave(p, t, N(13), { down: false, unload: true, notches: 45 }); // scene 13 is a draft; the page is at its top
	await setFilter(p, ['Idea']);
	t.ok(!(await shown(p)).includes('Scene 13'), 'the section is hidden by the filter');
	await keys(p, 'q');
	await p.sleep(300);
	await leave(p, t, N(2), { type: ' B', unload: true });
	await keys(p, 'z');
	await p.sleep(2800);
	t.eq(disk(p, N(2)).slice(-16), s2.replace(/\n$/, ' Bz\n').slice(-16), 'only what was typed for this note is in it (not the “q”)');
});

test('BUG: the note changes outside while its section is scrolled away (unsaved typing in it): the next keys land in the wrong place', async (p, h, t) => {
	await novel(p);
	await leave(p, t, N(2));
	// a sync, or another app: a sentence added at the start
	await p.ev(`(async () => { const f = ${J(N(2))}; const s = await app.vault.adapter.read(f); await app.vault.adapter.write(f, s.replace('Scene 2 paragraph 1.', 'OUTSIDE. Scene 2 paragraph 1.')); return 1; })()`);
	await p.sleep(900);
	await clearNotices(p);
	await keys(p, 'bbb');
	await p.sleep(2600);
	const d = disk(p, N(2));
	t.ok(count(d, 'OUTSIDE. ') === 1 && count(d, ' AAA') === 1 && count(d, 'bbb') === 1, 'the outside change and the typing are both there, once');
	t.ok(d.endsWith('since the war. AAAbbb\n'), 'the keys went in where the caret was, after “AAA”: ' + J(d.slice(-40)));
});

test('BUG: the note’s status and synopsis change while its section is scrolled away: the next keys land mid-word', async (p, h, t) => {
	await novel(p);
	await clickIn(p, N(2));
	await caretAt(p, N(2), 'Scene 2 paragraph 4');
	await keys(p, 'AAA ');
	await wheel(p, 240, 24); await p.sleep(3500);
	t.eq((await st(p)).left, N(2), 'the caret was left behind');
	await setProps(p, N(2), { status: 'Revised', synopsis: 'A much longer synopsis than before, written on the corkboard.' });
	await p.sleep(900);
	await keys(p, 'zzz');
	await p.sleep(2600);
	const d = disk(p, N(2)), i = d.indexOf('zzz');
	t.eq(d.slice(i - 4, i + 22), 'AAA zzzScene 2 paragraph 4', 'the keys went in where the caret was');
});

test('BUG: back from the corkboard after a synopsis changed there, the caret is somewhere else and typing lands mid-sentence', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, ARRIVAL);
	await caretAt(p, ARRIVAL, 'with two cases');
	await keys(p, 'X');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`); await p.sleep(500);
	await setProps(p, ARRIVAL, { synopsis: 'Mara arrives on the island with the supply boat, two cases and a letter.' });
	await p.sleep(700);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`); await p.sleep(700); await settle(p);
	t.eq(await focused(p), ARRIVAL, 'the caret is back in the section');
	const c = await caret(p);
	t.eq(c.before.slice(-11) + '|' + c.after, 'the jetty X|with two cases', 'where it was');
	await keys(p, 'Y');
	await p.sleep(2600);
	t.eq(body(disk(p, ARRIVAL)), 'The supply boat left Mara on the jetty XYwith two cases and a letter she had not opened.\n', 'typing carries on there');
});

test('BUG: a selection is gone after scrolling far away and back', async (p, h, t) => {
	await novel(p);
	await focusEnd(p, N(2));
	const from = await caretAt(p, N(2), 'Scene 2 paragraph 8', 40);
	await wheel(p, 240, 24); await p.sleep(400);
	t.eq((await st(p)).left, N(2), 'the caret was left behind');
	await wheel(p, -240, 24); await p.sleep(700);
	const c = await caret(p);
	t.eq(c?.path, N(2), 'the section has the focus again');
	t.eq(`${c.from}-${c.to}`, `${from}-${from + 40}`, 'with the same 40 characters selected (Cut, or typing over them, would act on them)');
});

test('BUG: Vim mode: a normal-mode key pressed after scrolling far is typed into the text', async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('vimMode', true); return 1; })()`);
	try {
		await novel(p);
		await clickIn(p, N(2));
		await keys(p, 'ihello '); await p.key('Escape'); await p.sleep(300);
		t.ok((await value(p, N(2))).includes('hello '), 'Vim is on: “i”, text, Escape');
		const before = await value(p, N(2));
		await wheel(p, 240, 24); await p.sleep(300);
		t.eq((await st(p)).left, N(2), 'the caret was left behind');
		await keys(p, 'j'); // down a line, in normal mode
		await p.sleep(500);
		t.eq(await focused(p), N(2), 'the key brought the caret back');
		t.eq((await value(p, N(2))).length - before.length, 0, '“j” moved the caret; no character was typed');
		await p.sleep(2400);
	} finally { await p.ev(`(() => { app.vault.setConfig('vimMode', false); return 1; })()`); }
});

test('UX: Ctrl+Z as the first key after scrolling far, once the section has gone back to plain text, undoes', async (p, h, t) => {
	await novel(p);
	const before = disk(p, N(2));
	await leave(p, t, N(2), { unload: true });
	await p.key('z', 'ctrl'); await p.sleep(500);
	t.eq(await focused(p), N(2), 'the key brought the caret back');
	t.eq((await value(p, N(2))).slice(-20), before.slice(-20), 'and undid “ AAA”, as it does while the editor is still there');
});

test('BUG: “Measure loop restarted” while scrolling up in a pane narrower than the page (sidebar open, or a split)', async (p, h, t) => {
	await novel(p, 20, 8);
	try {
		// a 940 px window: the pane is 596 px wide (the readable line width is 700)
		await p.send('Emulation.setDeviceMetricsOverride', { width: 940, height: 900, deviceScaleFactor: 1, mobile: false }); await p.sleep(500);
		await p.ev(`(() => { const m = ${M}; document.activeElement.blur(); m.root.scrollTop = 0; return 1; })()`); await p.sleep(600); await settle(p);
		for (let k = 0; k < 8; k++) { await wheel(p, 240, 6, 16); await p.sleep(450); }
		const down = measureLoops(p);
		for (let k = 0; k < 8; k++) { await wheel(p, -240, 6, 16); await p.sleep(450); }
		const up = measureLoops(p) - down;
		p.errors.length = 0;
		t.eq(`${down} down, ${up} up`, '0 down, 0 up', 'warnings while scrolling by the wheel');
	} finally { await desktop(p); await p.sleep(300); }
});

// ================================================================================================================
// 2. The filter
// ================================================================================================================

test('the filter, set from the toolbar, hides sections and headings with nothing left; the count says “55 of 106 words”; arrows and Mod+End keep to what shows', async (p, h, t) => {
	await openMs(p);
	t.eq(await countText(p), '106 words', 'the whole binder');
	const b = await p.at('.workspace-leaf.mod-active .binders-filter-button');
	await p.click(b.x, b.y); await p.sleep(300);
	await clickMenu(p, 'Draft'); await p.sleep(300);
	await closeMenus(p); await settle(p);
	t.eq(await shown(p), 'Prologue | # Part One | The keeper | # Part Two | The wreck', 'only the drafts, under their folders');
	t.eq(await countText(p), '55 of 106 words', 'the count');
	await focusEnd(p, PROLOGUE);
	await p.key('ArrowDown'); await p.key('ArrowDown'); await p.sleep(300);
	t.eq(await focused(p), KEEPER, 'ArrowDown goes on into the next section that shows');
	await p.key('End', 'ctrl'); await p.sleep(300);
	t.eq(await focused(p), ORDER[4], 'Mod+End goes to the last one that shows');
	await keys(p, ' one two three'); await p.sleep(700);
	t.eq(await countText(p), '58 of 109 words', 'the count follows typing');
	await setFilter(p, ['Done']);
	await p.ev(`document.activeElement.blur()`); await p.sleep(2600);
	await p.ev(`(() => { ${VIEW}.refresh(); return 1; })()`); await p.sleep(400);
	t.eq(await shown(p), '', 'a filter nothing passes hides everything');
	t.ok(/No notes match the filter/.test(await p.ev(`document.querySelector('.binders-manuscript .binders-empty')?.textContent ?? ''`)), 'and says so');
	t.eq(await countText(p), '0 of 109 words', 'the count');
	t.ok(disk(p, ORDER[4]).endsWith('below the light.\n one two three'), 'what was typed (at the very end, after Mod+End) is on disk');
});

test('the filter: a section being typed in stays when its status changes so it no longer passes, and when the filter is turned on; nothing typed is lost', async (p, h, t) => {
	await openMs(p);
	const k = disk(p, KEEPER), a = disk(p, ARRIVAL);
	await setFilter(p, ['Draft']);
	await focusEnd(p, KEEPER);
	await keys(p, ' typed-before');
	await setProps(p, KEEPER, { status: 'Idea' }); // as the corkboard or another pane would
	await p.sleep(600);
	t.ok((await shown(p)).includes('The keeper'), 'the section stays while it’s being typed in');
	t.eq(await focused(p), KEEPER, 'with the caret');
	await keys(p, ' typed-after');
	await p.sleep(2600);
	t.eq(disk(p, KEEPER), k.replace('status: draft', 'status: Idea').replace(/\n$/, ' typed-before typed-after\n'), 'the new status and all the typing are saved');
	// the filter turned on and off around unsaved typing
	await setFilter(p, []);
	await focusEnd(p, ARRIVAL);
	await keys(p, ' unsaved');
	await setFilter(p, ['Draft']); // Arrival is “revised”
	t.ok((await shown(p)).includes('Arrival'), 'a section with unsaved typing stays when the filter comes on');
	t.eq(await focused(p), ARRIVAL, 'and keeps the caret');
	await keys(p, ' more');
	await setFilter(p, []);
	await keys(p, ' end');
	await p.sleep(2600);
	t.eq(disk(p, ARRIVAL), a.replace(/\n$/, ' unsaved more end\n'), 'every key, once');
	await clearNotices(p);
});

test('BUG: “New note after this” (and “New note”) under a filter makes a note that doesn’t show; its name is typed into nothing and Enter opens another note', async (p, h, t) => {
	await openMs(p);
	await setFilter(p, ['Draft']);
	await focusEnd(p, KEEPER);
	await titleMenu(p, KEEPER);
	await clickMenu(p, 'New note after this');
	await p.sleep(800);
	t.ok(onDisk(p, `${B}/Part One/Untitled.md`), 'the note was made');
	t.ok((await shown(p)).includes('Untitled'), 'and shows, though it has no status yet (as a new card does on the corkboard): ' + await shown(p));
	t.ok(/is-renaming in Untitled/.test(await active(p)), 'with its title ready to type: ' + await active(p));
	await keys(p, 'Named'); await p.key('Enter'); await p.sleep(600);
	t.ok(onDisk(p, `${B}/Part One/Named.md`), 'the name typed is its name');
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'binders-view', 'and the manuscript is still there');
});

test('UX: a section that no longer passes the filter goes once its typing is saved and the caret has left it', async (p, h, t) => {
	await openMs(p);
	await setFilter(p, ['Draft']);
	await focusEnd(p, KEEPER);
	await keys(p, ' typed');
	await setProps(p, KEEPER, { status: 'Idea' });
	await p.sleep(2800); // saved
	await clickIn(p, PROLOGUE); // and left
	await p.sleep(1500);
	await clearNotices(p);
	t.eq(await shown(p), 'Prologue | # Part Two | The wreck', 'only what passes the filter shows');
	t.eq(await countText(p), '38 of 107 words', 'and the count is of what shows');
});

test('UX: under a filter, “Move up” moves a section above the one shown before it', async (p, h, t) => {
	await novel(p, 6, 2);
	await setFilter(p, ['Draft']);
	t.eq(await shown(p), 'Scene 01 | Scene 03 | Scene 05', 'the drafts');
	await titleMenu(p, N(3));
	await clickMenu(p, 'Move up');
	await p.sleep(700);
	t.eq(await shown(p), 'Scene 03 | Scene 01 | Scene 05', 'it moved on the page (not only past a hidden note)');
});

// ================================================================================================================
// 3. A section's title: renaming in place, and its menu
// ================================================================================================================

/** Unsaved typing in the prologue and in Arrival, the caret left in Arrival 15 characters before its end. */
async function typing(p) {
	await openMs(p);
	await focusEnd(p, PROLOGUE); await keys(p, ' P-unsaved');
	await focusEnd(p, ARRIVAL); await keys(p, ' A-unsaved');
	await p.ev(`(() => { const cm = ${scene(ARRIVAL)}.live.cm; cm.dispatch({ selection: { anchor: cm.state.doc.length - 15 } }); return 1; })()`);
}
const P_TYPED = (before) => before[PROLOGUE].replace(/\n$/, ' P-unsaved\n'), A_TYPED = (before) => before[ARRIVAL].replace(/\n$/, ' A-unsaved\n');

test('a click on another section’s title renames it in place while two sections have unsaved typing; a clash keeps what was typed; Escape cancels', async (p, h, t) => {
	const before = snap(p);
	await typing(p);
	let at = await titleAt(p, KEEPER);
	await p.click(at.x, at.y); await p.sleep(200);
	t.ok(/is-renaming in The keeper/.test(await active(p)), 'the title is being edited');
	await keys(p, 'Arrival'); await p.key('Enter'); await p.sleep(500);
	t.ok(/already a note called “Arrival”/.test(await notices(p)), 'a clash says so');
	t.eq(await p.ev(`${scene(KEEPER)}.titleEl.textContent`), 'Arrival', 'and keeps what was typed, to change');
	await keys(p, 'The guard'); await p.key('Enter'); await p.sleep(700);
	const GUARD = `${B}/Part One/The guard.md`;
	t.eq(await focused(p), GUARD, 'renamed: the caret goes to its text');
	at = await titleAt(p, STORM);
	await p.click(at.x, at.y); await p.sleep(200);
	await keys(p, 'Nothing'); await p.key('Escape'); await p.sleep(300);
	await p.sleep(2600);
	const s = snap(p);
	t.eq(s[PROLOGUE], P_TYPED(before), 'the prologue’s typing is saved');
	t.eq(s[ARRIVAL], A_TYPED(before), 'Arrival’s too');
	t.eq(s[GUARD], before[KEEPER], 'the renamed note is byte for byte the old one');
	t.eq(changed(before, s).filter((k) => k !== `${B}/${B}.md`).join(), [ARRIVAL, GUARD, KEEPER, PROLOGUE].join(), 'Escape renamed nothing; nothing else changed');
	await clearNotices(p);
});

for (const [item, check] of [
	['Set status', (t, b, s) => t.eq(s[ARRIVAL], A_TYPED(b).replace('status: revised', 'status: Idea'), 'the status and the typing')],
	['Set target...', (t, b, s) => t.eq(s[ARRIVAL], A_TYPED(b).replace('  - Mara\n---', '  - Mara\ntarget: 500\n---'), 'the target and the typing')],
	['Include in export', (t, b, s) => t.eq(s[ARRIVAL], A_TYPED(b).replace('  - Mara\n---', '  - Mara\nexport: false\n---'), 'left out of exports, with the typing')],
	['Duplicate', (t, b, s) => { t.eq(s[ARRIVAL], A_TYPED(b), 'the note'); t.eq(s[`${B}/Part One/Arrival 2.md`], A_TYPED(b), 'its copy has the unsaved typing too'); }],
	['Put in a new folder', (t, b, s) => { t.eq(s[`${B}/Part One/Untitled/Arrival.md`], A_TYPED(b), 'moved into the folder with its typing'); t.ok(!(ARRIVAL in s), 'and not left behind'); }],
	['Move down', (t, b, s) => { t.eq(s[ARRIVAL], A_TYPED(b), 'the typing'); t.ok(/Part One\/The keeper\n {2}- Part One\/Arrival\n/.test(s[`${B}/${B}.md`]), 'the new order'); }],
	['New note after this', (t, b, s) => { t.eq(s[ARRIVAL], A_TYPED(b), 'the typing'); t.eq(s[`${B}/Part One/Fresh.md`], '', 'the new note, named'); t.ok(/Part One\/Arrival\n {2}- Part One\/Fresh\n/.test(s[`${B}/${B}.md`]), 'right after it'); }],
]) test(`a title’s menu on the section being typed in: “${item}” keeps the unsaved typing of every section`, async (p, h, t) => {
	const before = snap(p);
	await typing(p);
	await titleMenu(p, ARRIVAL);
	if (item === 'Set status') { await hoverMenu(p, 'Set status'); await clickMenu(p, 'Idea'); } else await clickMenu(p, item);
	await p.sleep(500);
	if (item === 'Set target...') { await p.type('500'); await p.key('Enter'); await p.sleep(500); }
	if (item === 'New note after this') {
		t.ok(/is-renaming in Untitled/.test(await active(p)), 'the new note’s title is ready to type: ' + await active(p));
		await keys(p, 'The keeper'); await p.key('Enter'); await p.sleep(400);
		t.ok(/already a note called “The keeper”/.test(await notices(p)), 'a clash says so');
		await keys(p, 'Fresh'); await p.key('Enter'); await p.sleep(600);
		t.eq(await focused(p), `${B}/Part One/Fresh.md`, 'named: the caret is in its text');
	}
	if (item === 'Duplicate') t.eq(await focused(p), `${B}/Part One/Arrival 2.md`, 'the caret is in the copy');
	await p.sleep(2600);
	const s = snap(p);
	t.eq(s[PROLOGUE], P_TYPED(before), 'the prologue’s typing is saved');
	check(t, before, s);
	await clearNotices(p);
});

test('“Move up” on the section being typed in moves it on the page and in the binder; the editor keeps its caret', async (p, h, t) => {
	const before = snap(p);
	await openMs(p);
	await focusEnd(p, KEEPER); await keys(p, ' K-unsaved');
	const at = await caretAt(p, KEEPER, 'out of the doorway');
	await titleMenu(p, KEEPER);
	await clickMenu(p, 'Move up');
	await p.sleep(700);
	t.eq(await shown(p), 'Prologue | # Part One | The keeper | Arrival | Storm warning | # Part Two | The wreck | Lights out | Epilogue', 'moved');
	t.eq(await p.ev(`${scene(KEEPER)}.live.cm.state.selection.main.head`), at, 'the editor still has its caret where it was');
	await p.sleep(2400);
	t.eq(disk(p, KEEPER), before[KEEPER].replace(/\n$/, ' K-unsaved\n'), 'the typing is saved');
});

test('BUG: “Delete” from the menu of the section being typed in puts the note in the trash without the last words typed', async (p, h, t) => {
	const before = snap(p);
	const was = await localTrash(p);
	try {
		await typing(p);
		await titleMenu(p, ARRIVAL);
		await clickMenu(p, 'Delete');
		await p.sleep(400);
		t.ok(await answer(p, 'Delete'), 'it asks first');
		await p.sleep(700);
		t.ok(!(await shown(p)).includes('Arrival'), 'the section is gone');
		await p.sleep(2600);
		const s = snap(p);
		t.ok(!(ARRIVAL in s), 'the note isn’t written back');
		t.eq(s[PROLOGUE], P_TYPED(before), 'the other section’s typing is saved');
		t.eq(body(s['.trash/Arrival.md'] ?? ''), body(A_TYPED(before)), 'the note in the trash has everything that was typed (it can be restored from there)');
	} finally { await trashBack(p, was); }
});

test('control: Obsidian’s own “Delete current file” on a note with unsaved typing: the note in the trash has it', async (p, h, t) => {
	const before = disk(p, ARRIVAL);
	const was = await localTrash(p);
	try {
		await h.open(ARRIVAL);
		await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setCursor(ed.offsetToPos(ed.getValue().length - 1)); return 1; })()`);
		await keys(p, ' A-unsaved');
		await p.ev(`(() => { app.commands.executeCommandById('app:delete-file'); return 1; })()`);
		await p.sleep(500);
		t.ok(await answer(p, 'Delete'), 'it asks first');
		await p.sleep(2600);
		t.eq(snap(p)['.trash/Arrival.md'], before.replace(/\n$/, ' A-unsaved\n'), 'everything typed is in the trashed note');
	} finally { await trashBack(p, was); }
});

test('UX: after a title’s menu (“Move up”), the caret is back in the text and typing carries on', async (p, h, t) => {
	const before = snap(p);
	await openMs(p);
	await focusEnd(p, KEEPER); await keys(p, ' K-unsaved');
	await caretAt(p, KEEPER, 'out of the doorway');
	await titleMenu(p, KEEPER);
	await clickMenu(p, 'Move up');
	await p.sleep(600);
	await keys(p, 'ZZ ');
	await p.sleep(300);
	t.eq(await focused(p), KEEPER, 'the section has the caret (not its title: there, typing goes nowhere and Enter opens the note): ' + await active(p));
	t.eq(body(await value(p, KEEPER)), body(before[KEEPER]).replace('out of the doorway.', 'ZZ out of the doorway. K-unsaved'), 'typing goes in where the caret was');
});

test('UX: F2 in a section’s text, then Escape, gives the caret back where it was', async (p, h, t) => {
	await typing(p);
	const c0 = await caret(p);
	await p.key('F2'); await p.sleep(200);
	t.ok(/is-renaming in Arrival/.test(await active(p)), 'F2 edits the title');
	await p.key('Escape'); await p.sleep(300);
	const c = await caret(p);
	t.eq(`${c?.path}@${c?.head}`, `${ARRIVAL}@${c0.head}`, 'the caret is back in the text, where it was (not on the title): ' + await active(p));
});

test('UX: F2 in a section’s text, a new name, Enter: the caret is back where it was, not at the start of the section', async (p, h, t) => {
	await typing(p);
	const c0 = await caret(p);
	await p.key('F2'); await p.sleep(200);
	await keys(p, 'Landing'); await p.key('Enter'); await p.sleep(700);
	const c = await caret(p);
	t.eq(c?.path, `${B}/Part One/Landing.md`, 'renamed, and the caret is in its text');
	t.eq(c.head, c0.head, 'where it was');
});

test('UX: setting a status from the title’s menu while the section has unsaved typing shows no “modified externally” notice', async (p, h, t) => {
	await typing(p);
	await clearNotices(p);
	await titleMenu(p, ARRIVAL);
	await hoverMenu(p, 'Set status'); await clickMenu(p, 'Idea');
	await p.sleep(900);
	const said = await notices(p);
	await clearNotices(p);
	t.eq(said, '', 'nothing is said: the change was the writer’s own');
});

test('UX: “Put in a new folder” lets the folder be named', async (p, h, t) => {
	await typing(p);
	await titleMenu(p, ARRIVAL);
	await clickMenu(p, 'Put in a new folder');
	await p.sleep(700);
	t.ok((await shown(p)).includes('# Untitled | Arrival'), 'the folder is made around the note');
	await keys(p, 'Chapter one'); await p.key('Enter'); await p.sleep(700);
	t.ok(onDisk(p, `${B}/Part One/Chapter one/Arrival.md`), 'and takes the name typed (as on the corkboard), instead of staying “Untitled” with no way to rename it here');
});

// ================================================================================================================
// 4. Rendered sections are spaced like the live editor
// ================================================================================================================

const para = 'The sea came up the rocks and the light turned over it, and the keeper wrote it down in the long book he kept by the window. ';
const mid = (x) => `Before.\n\n${x}\n\nAfter.\n`;
/** Kinds of Markdown: name → note text. */
const KINDS = {
	'paragraphs': `${para}\n\n${para}${para}\n\n${para}\n`,
	'nested list': mid('- one\n- two\n    - nested\n        - deeper\n    - nested two\n- three'),
	'ordered list': mid('1. first\n2. second\n    1. inner\n    2. inner two\n3. third'),
	'task list': mid('- [ ] todo\n- [x] done\n    - [ ] nested todo'),
	'list with long items': mid(`- ${para}${para}\n- ${para}`),
	'block quote': mid(`> ${para}\n> Second line of the quote.`),
	'nested quote': mid('> Outer quote.\n>\n> > Inner quote.\n>\n> Outer again.'),
	'callout': mid('> [!note] A note\n> Inside the callout.\n> A second line.'),
	'callout folded': mid('> [!tip]- Folded\n> Hidden inside.\n> More hidden.'),
	'callout without a title': mid('> [!warning]\n> Just a warning.'),
	'table': mid('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |'),
	'table wider than the page': mid('| ' + Array.from({ length: 24 }, (_, i) => `Column number ${i}`).join(' | ') + ' |\n|' + '---|'.repeat(24) + '\n| ' + Array.from({ length: 24 }, (_, i) => `value ${i} of the row`).join(' | ') + ' |'),
	'table first': '| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter.\n',
	'table last': 'Before.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
	'code block, 3 lines': mid('```js\nconst a = 1;\n```'),
	'code block, 60 lines': mid('```js\n' + Array.from({ length: 60 }, (_, i) => `const line${i} = ${i}; // a line of code`).join('\n') + '\n```'),
	'code block, indented': mid('    indented code\n    second line'),
	'mermaid': mid('```mermaid\ngraph TD;\nA-->B;\n```'),
	'image': mid('![[pixel.png]]'),
	'image, sized': mid('![[pixel.png|200]]'),
	'image first': '![[pixel.png]]\n\nAfter.\n',
	'embedded note': mid('![[Embedded]]'),
	'embed of a missing note': mid('![[No such note]]'),
	'math block': mid('$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$'),
	'math, inline': mid('Inline $e^{i\\pi} + 1 = 0$ math in a line.'),
	'footnotes': 'A claim.[^1] Another.[^note]\n\nMore text.\n\n[^1]: The first footnote.\n[^note]: The second footnote, with more words.\n',
	'footnote, inline': mid('A sentence with an inline footnote.^[The inline note.]'),
	'footnote, then blank lines and text': 'P.[^a]\n\n[^a]: def\n\n\nNext para.\n',
	'footnote, then blank lines at the end': 'P.[^a]\n\n[^a]: def\n\n\n',
	'footnote with a line run on': 'P.[^a]\n\n[^a]: def\nlazy line\n\nNext.\n',
	'footnote first': '[^a]: def first\n\nP.[^a]\n',
	'footnote last, no final line break': 'P.[^a]\n\n[^a]: def',
	'footnotes among a list and a heading': 'P.[^a]\n\n[^a]: def\n\n- item\n- two\n\n[^b]: other\n\n\n\n## Head\n',
	'footnotes of every sort': 'One.[^a]\n\n[^a]: Defined in the middle,\n    with a second line.\n\nTwo.[^b] And an inline one.^[Inline here.]\n\n[^b]: Last.\n\n[^unused]: Never referred to.\n',
	'footnote long enough to wrap': `Text.[^long]\n\n[^long]: ${para} ${para}\n`,
	'h1 then text': `# Heading one\nText right after the heading.\n\n${para}\n`,
	'h2 then text': `## Heading two\nText right after the heading.\n\n${para}\n`,
	'h3 then text': `### Heading three\nText right after the heading.\n\n${para}\n`,
	'h4 then text': `#### Heading four\nText right after the heading.\n\n${para}\n`,
	'h5 then text': `##### Heading five\nText right after the heading.\n\n${para}\n`,
	'h6 then text': `###### Heading six\nText right after the heading.\n\n${para}\n`,
	'heading between lines of text': 'Before.\n## Heading\nAfter.\n',
	'heading between blank lines': mid('## Heading'),
	'headings in a row': '# One\n## Two\n### Three\nText.\n',
	'heading last': 'Text.\n\n## Heading at the end\n',
	'rule': mid('---'),
	'rule of stars': mid('* * *'),
	'rule last': 'Before.\n\n---\n',
	'comment, inline': mid('Text with %%a hidden comment%% in it.'),
	'comment block': mid('%%\nA hidden block\nof two lines.\n%%'),
	'HTML div': mid('<div style="color: red">A red div.</div>'),
	'HTML details': mid('<details><summary>More</summary>Hidden text.</details>'),
	'HTML comment': mid('<!-- an HTML comment -->'),
	'empty note': '',
	'only properties': '---\nstatus: draft\nsynopsis: Nothing yet.\n---\n',
	'only properties, no line break': '---\nstatus: draft\n---',
	'very long paragraph': `${para.repeat(120)}\n`,
	'right-to-left': mid('هذا نص عربي طويل قليلاً لاختبار اتجاه الكتابة من اليمين إلى اليسار في المخطوطة.\n\nזהו טקסט בעברית לבדיקת כיוון הכתיבה.'),
	'soft line breaks': 'Line one\nLine two\nLine three\n\nNext paragraph.\n',
	'hard line breaks': 'Line one  \nLine two\\\nLine three\n',
	'three blank lines between paragraphs': 'Paragraph one.\n\n\n\nParagraph two.\n',
	'blank lines at the end': 'Text.\n\n\n\n',
	'blank lines at the start': '\n\nText after two blank lines.\n',
	'no final line break': 'Text without a final newline.',
	'tags, links, bold': mid('A #tag, a [[Embedded|link]], **bold**, *italic*, ==highlight==, `code`, ~~struck~~ and a https://example.com link.'),
	'list right after a paragraph': 'Paragraph.\n- one\n- two\n',
	'list then paragraph then list': '- one\n- two\n\nParagraph.\n\n1. a\n2. b\n',
	'quote first': '> Quote at the start.\n\nAfter.\n',
	'callout last': 'Before.\n\n> [!note] A note\n> Inside.\n',
	'dialogue': '— Where is he?\n— Gone.\n\n"Quoted," she said.\n',
};
/** The kinds whose rendered text was as tall as its editor (within 2 px) in round 4: they must stay so. */
const SPACED = ['paragraphs', 'nested list', 'ordered list', 'task list', 'list with long items', 'block quote', 'nested quote', 'callout', 'callout folded', 'callout without a title', 'table', 'table last', 'code block, 3 lines', 'mermaid', 'embed of a missing note', 'math, inline', 'heading between blank lines', 'heading last', 'rule', 'rule of stars', 'comment, inline', 'HTML div', 'HTML details', 'empty note', 'only properties', 'only properties, no line break', 'very long paragraph', 'right-to-left', 'soft line breaks', 'hard line breaks', 'no final line break', 'tags, links, bold', 'list then paragraph then list', 'quote first', 'callout last', 'dialogue'];
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAAKElEQVR4nO3NMQEAAAjDMMC/52ECvlRA00nqo3m5AgAAAAAAAAAAOy0zGgM5yaNm+gAAAABJRU5ErkJggg==';
let heights = null;
/** Every kind's height as an editor and as rendered text, in a window tall enough to draw them all in full (an editor
    only measures what's in the window). The difference is how far the text under a section moves when it turns live. */
async function measureKinds(p, t) {
	if (heights) return heights;
	const names = Object.keys(KINDS), notes = {};
	names.forEach((n, i) => { notes[String(i + 1).padStart(2, '0') + ' ' + n.replace(/[,:]/g, '')] = KINDS[n]; });
	await p.ev(`(async () => { const b = Uint8Array.from(atob(${J(PNG)}), c => c.charCodeAt(0)); await app.vault.createFolder('Odd'); await app.vault.createBinary('Odd/pixel.png', b.buffer); await app.vault.adapter.write('Embedded.md', 'An embedded note of one line.\\n\\nAnd a second paragraph.\\n'); return 1; })()`);
	let live, rendered;
	try {
		await odd(p, notes, false);
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: 30000, deviceScaleFactor: 1, mobile: false });
		await openView(p, 'Odd');
		await p.ev(`(() => { ${VIEW}.setMode('manuscript'); const m = ${M}; m.liveMax = 200; document.activeElement.blur(); return 1; })()`);
		await p.sleep(1000);
		for (let i = 0; i < 100; i++) { if (await p.ev(`${M}.scenes.every(s => s.live && !s.mounting)`)) break; await p.sleep(200); }
		await p.sleep(2500);
		await p.ev(`document.activeElement.blur()`);
		await p.sleep(500);
		live = await p.ev(`${M}.scenes.map(s => [!!s.live, s.bodyEl.getBoundingClientRect().height])`);
		await p.ev(`(() => { const m = ${M}; m.editable = false; for (const s of m.scenes) if (s.live) m.unmount(s); return 1; })()`);
		await p.sleep(3500);
		rendered = await p.ev(`${M}.scenes.map(s => [s.shown !== null, s.bodyEl.getBoundingClientRect().height])`);
	} finally {
		await desktop(p);
		await p.sleep(300);
		await p.ev(`(async () => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); const f = app.vault.getAbstractFileByPath('Embedded.md'); if (f) await app.vault.delete(f); return 1; })()`);
	}
	t.eq(live.length, names.length, 'a section for every kind');
	t.ok(live.every((x) => x[0]), 'every section had its editor');
	t.ok(rendered.every((x) => x[0]), 'every section was rendered');
	heights = Object.fromEntries(names.map((n, i) => [n, { live: live[i][1], rendered: rendered[i][1], jump: Math.round((rendered[i][1] - live[i][1]) * 10) / 10 }]));
	return heights;
}

test('footnotes in a section that is plain text are drawn as its editor draws them: each footnote’s text where the note has it, a mark as “[^a]”, one written in the line in full, no list at the foot; a click on a footnote’s word puts the caret on it, the section is as tall as before, and what’s typed is in the note', async (p, h, t) => {
	const NOTE = 'One.[^a] Two.^[said aside]\n\nMore text here.\n\n[^a]: The first footnote.\n';
	// (the caret goes to the first section as the manuscript opens: the footnotes are in the second)
	await odd(p, { '00 First': 'The first section.\n', '01 Notes': NOTE }, false);
	await openView(p, 'Odd');
	// (no section becomes its editor by being near: only by the click below)
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); const m = ${M}; m.liveMax = 0; return 1; })()`);
	const S = `${M}.scenes[1]`;
	t.ok(await until(p, `${S}?.shown != null && !!${S}.bodyEl.querySelector('.binders-manuscript-rendered.is-spaced')`, 6000), 'the section is drawn, spaced from the note');
	const drawn = await p.ev(`(() => { const el = ${S}.bodyEl; return { list: el.querySelectorAll('.footnotes').length, notes: [...el.querySelectorAll('.binders-manuscript-footnote')].map(e => e.textContent), marks: [...el.querySelectorAll('sup.footnote-ref')].map(e => e.textContent), order: [...el.querySelector('.binders-manuscript-rendered').children].map(e => e.tagName + (e.className ? '.' + e.className : '')).join(' '), back: el.textContent.includes('↩'), h: el.getBoundingClientRect().height, live: !!${S}.live }; })()`);
	t.eq(J([drawn.live, drawn.list, drawn.back]), J([false, 0, false]), 'plain text, with no list of footnotes at its foot');
	t.eq(J(drawn.notes), J(['a The first footnote.']), 'the footnote’s text, under its name');
	t.eq(drawn.order, 'P P DIV.binders-manuscript-footnote', 'where the note has it');
	t.eq(J(drawn.marks), J(['[^a]', '^[said aside]']), 'the marks in the text, as the editor writes them');
	const at = await p.ev(`(() => { const w = document.createTreeWalker(${S}.bodyEl.querySelector('.binders-manuscript-footnote'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const i = n.data.indexOf('first'); if (i < 0) continue; const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getClientRects()[0]; return { x: b.left + 1, y: (b.top + b.bottom) / 2 }; } return null; })()`);
	await p.click(at.x, at.y);
	t.ok(await until(p, `!!${S}.live?.cm?.hasFocus`, 5000), 'a click on the footnote makes the section its editor');
	await p.sleep(300);
	const c = await p.ev(`(() => { const cm = ${S}.live.cm, h = cm.state.selection.main.head; return { after: cm.state.doc.sliceString(h, h + 5), h: ${S}.bodyEl.getBoundingClientRect().height }; })()`);
	t.eq(c.after, 'first', 'with the caret on the word clicked');
	t.ok(Math.abs(c.h - drawn.h) <= 1, `and the section is as tall as it was (${drawn.h} px, then ${c.h})`);
	await p.type('X');
	await p.ev(`${S}.live.flush().then(() => 1)`);
	t.eq(disk(p, 'Odd/01 Notes.md'), NOTE.replace('first', 'Xfirst'), 'what’s typed is in the note, and nothing else changed');
});

test('rendered text is as tall as its editor (nothing moves when a section turns live) for 36 kinds of Markdown: lists, quotes, callouts, tables, rules, long and right-to-left paragraphs…', async (p, h, t) => {
	const hs = await measureKinds(p, t);
	const off = SPACED.filter((n) => Math.abs(hs[n].jump) > 2).map((n) => `${n}: ${hs[n].jump > 0 ? '+' : ''}${hs[n].jump} px`);
	t.eq(off.join(', '), '', 'kinds that move the page by more than 2 px');
});

test('BUG: rendered text and its editor differ in height, so the page moves when a section turns live: blank lines, headings right before text, footnotes, comments, code, math, images, embeds…', async (p, h, t) => {
	const hs = await measureKinds(p, t);
	const off = Object.keys(KINDS).filter((n) => Math.abs(hs[n].jump) > 2).map((n) => `${n}: ${hs[n].jump > 0 ? '+' : ''}${hs[n].jump} px`);
	t.eq(off.join(', '), '', `${off.length} of ${Object.keys(KINDS).length} kinds move the page by more than 2 px (rendered height less editor height)`);
});

// ================================================================================================================
// 5. Splitting and merging from inside the manuscript
// ================================================================================================================

test('“Split scene at cursor” right after typing, with unsaved typing in two other sections: every word in the right note, once; typing carries on', async (p, h, t) => {
	await openMs(p);
	const before = snap(p); // (before any typing: a section is saved as soon as the cursor leaves it)
	await focusEnd(p, PROLOGUE); await keys(p, ' P-unsaved');
	await focusEnd(p, KEEPER); await keys(p, ' K-unsaved');
	await caretAt(p, ARRIVAL, ' with two cases');
	await keys(p, ' NEW');
	await p.ev(`(() => { app.commands.executeCommandById('binders:split-scene'); return 1; })()`); // within a few ms of the last key
	await p.sleep(1500);
	t.eq(await shown(p), 'Prologue | # Part One | Arrival | Arrival 2 | The keeper | Storm warning | # Part Two | The wreck | Lights out | Epilogue', 'the new section shows after the split one');
	t.eq(await focused(p), ARRIVAL, 'the caret stays in the first half');
	await keys(p, 'ZZ');
	await p.sleep(2600);
	const s = snap(p);
	t.eq(body(s[ARRIVAL]), 'The supply boat left Mara on the jetty NEW\nZZ', 'the first half, with what was typed before and after the split');
	t.eq(body(s[`${B}/Part One/Arrival 2.md`]), 'with two cases and a letter she had not opened.\n', 'the second half');
	t.eq(s[PROLOGUE], before[PROLOGUE].replace(/\n$/, ' P-unsaved\n'), 'the prologue’s typing');
	t.eq(s[KEEPER], before[KEEPER].replace(/\n$/, ' K-unsaved\n'), 'the keeper’s typing');
	t.eq(changed(before, s).filter((k) => k !== `${B}/${B}.md`).join(), [ARRIVAL, `${B}/Part One/Arrival 2.md`, KEEPER, PROLOGUE].sort().join(), 'nothing else changed');
});

test('“Split scene with selection as title” right after typing: the selection names the new note, the typing goes with its half', async (p, h, t) => {
	await openMs(p);
	await caretAt(p, ARRIVAL, 'with two cases', 14);
	await p.key('ArrowRight'); await keys(p, ' NEW');
	await caretAt(p, ARRIVAL, 'with two cases', 14);
	await p.ev(`(() => { app.commands.executeCommandById('binders:split-scene-titled'); return 1; })()`);
	await p.sleep(1500);
	t.ok((await shown(p)).includes('Arrival | with two cases | The keeper'), 'the new section, named by the selection');
	await p.sleep(2600);
	t.eq(body(disk(p, ARRIVAL)), 'The supply boat left Mara on the jetty\n', 'the first half');
	t.eq(body(disk(p, `${B}/Part One/with two cases.md`)), 'with two cases NEW and a letter she had not opened.\n', 'the second half, with what was just typed');
});

test('a split re-points links to the heading and block that moved, in notes with unsaved manuscript typing: links and typing both kept', async (p, h, t) => {
	await write(p, ARRIVAL, '---\nstatus: revised\n---\nFirst half of the scene.\n\n## Landing\n\nSecond half of the scene. ^blk\n');
	await write(p, EPILOGUE, '---\nstatus: idea\n---\nSee [[Arrival#Landing]] and [[Arrival#^blk]] and [[Arrival]].\n\nThey sell postcards of it now.\n');
	await write(p, STORM, '---\nstatus: idea\n---\nThe radio said a storm: [[Arrival#Landing|the landing]].\n');
	await p.sleep(1200);
	await openMs(p);
	await focusEnd(p, EPILOGUE); await keys(p, ' E-unsaved');
	await focusEnd(p, STORM); await keys(p, ' S-unsaved');
	await focusEnd(p, ARRIVAL);
	await caretAt(p, ARRIVAL, '## Landing');
	await p.ev(`(() => { app.commands.executeCommandById('binders:split-scene'); return 1; })()`);
	await p.sleep(1500);
	await focusEnd(p, EPILOGUE); await keys(p, ' E-after');
	await p.sleep(2800);
	t.eq(body(disk(p, EPILOGUE)), 'See [[Arrival 2#Landing]] and [[Arrival 2#^blk]] and [[Arrival]].\n\nThey sell postcards of it now. E-unsaved E-after\n', 'links follow what moved; typing before and after is kept, once');
	t.eq(body(disk(p, STORM)), 'The radio said a storm: [[Arrival 2#Landing|the landing]]. S-unsaved\n', 'in the other note too');
	t.eq(body(disk(p, ARRIVAL)), 'First half of the scene.\n', 'the first half');
	t.eq(body(disk(p, `${B}/Part One/Arrival 2.md`)), '## Landing\n\nSecond half of the scene. ^blk\n', 'the second half');
	await clearNotices(p);
});

test('merging two notes (from a corkboard beside the manuscript) with unsaved manuscript typing in both, and in a note that links to the one that goes', async (p, h, t) => {
	await write(p, EPILOGUE, '---\nstatus: idea\n---\nSee [[Storm warning]].\n\nThey sell postcards of it now.\n');
	await p.sleep(1000);
	const was = await localTrash(p);
	try {
		await openMs(p);
		// a corkboard, of the folder both notes are in (a board shows one folder; a binder opens as its view was last left, so it's asked for)
		await openView(p, `${B}/Part One`, 'split');
		await p.ev(`(() => { app.workspace.getMostRecentLeaf().view.setMode?.('corkboard'); return 1; })()`); await p.sleep(400);
		await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`); await p.sleep(300);
		const before = snap(p);
		await focusEnd(p, EPILOGUE); await keys(p, ' E-unsaved');
		await focusEnd(p, ARRIVAL); await keys(p, ' A-unsaved');
		await focusEnd(p, STORM); await keys(p, ' S-unsaved');
		const a = await p.at(`.binders-card[data-path="${ARRIVAL}"]`), s = await p.at(`.binders-card[data-path="${STORM}"]`);
		await p.click(a.x, a.t + 12);
		await p.click(s.x, s.t + 12, { modifiers: 2 });
		await p.right(s.x, s.y);
		await clickMenu(p, 'Merge 2 notes');
		await p.sleep(300);
		t.ok(await answer(p, 'Merge'), 'it asks first');
		await p.sleep(1500);
		t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view')[0].view.current.scenes.map(s => s.file.basename).join(' | ')`), 'Prologue | Arrival | The keeper | The wreck | Lights out | Epilogue', 'the manuscript shows the merged note, and not the one that went');
		await p.sleep(2600);
		const after = snap(p);
		t.eq(body(after[ARRIVAL]), body(before[ARRIVAL]).replace(/\n$/, ' A-unsaved\n\n') + body(before[STORM]).replace(/\n$/, ' S-unsaved\n'), 'both texts, with the typing that wasn’t saved yet');
		t.eq(body(after[EPILOGUE]), 'See [[Arrival]].\n\nThey sell postcards of it now. E-unsaved\n', 'the link follows, and that note’s typing is kept');
		t.eq(after['.trash/Storm warning.md'], before[STORM].replace(/\n$/, ' S-unsaved\n'), 'the note that went has its typing too');
		t.ok(!(STORM in after), 'and isn’t written back');
	} finally { await trashBack(p, was); await clearNotices(p); }
});

// ================================================================================================================
// 6. Editing in a section as in a note
// ================================================================================================================

test('typing a long run at the bottom of the window keeps the caret in sight; PageDown, PageUp, Mod+End and Mod+Home move it through the page and typing goes there', async (p, h, t) => {
	await novel(p, 14, 8);
	const first = disk(p, N(1)), last = disk(p, N(14));
	await p.ev(`(() => { const m = ${M}; m.scenes[2].el.scrollIntoView(); m.root.scrollTop += 200; return 1; })()`);
	await p.sleep(800); await settle(p);
	const x = await p.ev(`${M}.scenes[2].bodyEl.getBoundingClientRect().left + 300`);
	await p.click(x, 880); await p.sleep(200);
	let off = 0;
	for (let i = 0; i < 10; i++) { await keys(p, 'the quick brown fox jumps over the lazy dog and runs away '); if (!onScreen(await caret(p))) off++; }
	for (let i = 0; i < 6; i++) { await p.key('Enter'); if (!onScreen(await caret(p))) off++; }
	t.eq(off, 0, 'times the caret was out of sight while typing 580 characters and 6 new lines at the bottom');
	for (let i = 0; i < 4; i++) await pageKey(p, 'PageDown');
	let c = await caret(p);
	t.ok(onScreen(c) && c.path > N(4), 'PageDown ×4: the caret is on screen, sections further on: ' + c?.path);
	for (let i = 0; i < 8; i++) await pageKey(p, 'PageUp');
	c = await caret(p);
	t.ok(onScreen(c) && c.path === N(1), 'PageUp ×8: back in the first section: ' + c?.path);
	await pageKey(p, 'End', 2); await p.sleep(400);
	await keys(p, 'END');
	await pageKey(p, 'Home', 2); await p.sleep(400);
	await keys(p, 'START ');
	t.ok(onScreen(await caret(p)), 'the caret is on screen');
	await p.sleep(2600);
	t.eq(disk(p, N(14)), last + 'END', 'Mod+End, then typing: at the very end of the last note');
	t.eq(disk(p, N(1)), fm(first) + 'START ' + body(first), 'Mod+Home, then typing: at the start of the first note’s text');
	t.eq(measureLoops(p), 0, 'no “Measure loop restarted”');
});

test('a selection stops at the section’s edge (Shift+arrows, a mouse drag into the next section); a triple click takes the paragraph; nothing changes', async (p, h, t) => {
	await openMs(p);
	const before = snap(p);
	const sel = () => p.ev(`(() => { const m = ${M}; const s = m.scenes.find(s => s.el.contains(document.activeElement)); const cm = s?.live?.cm; if (!cm) return null; const r = cm.state.selection.main; return s.file.basename + ': ' + cm.state.sliceDoc(r.from, r.to); })()`);
	const text = body(before[ARRIVAL]).trimEnd();
	await focusEnd(p, ARRIVAL); await p.key('Home');
	for (let i = 0; i < 4; i++) await p.key('ArrowDown', 'shift');
	t.eq(await sel(p), `Arrival: ${text}\n`, 'Shift+ArrowDown selects to the end of the section and no further');
	await p.key('ArrowDown'); await p.key('ArrowDown'); await p.sleep(300);
	t.eq(await focused(p), KEEPER, 'ArrowDown then goes on into the next one');
	const a = await p.ev(`(() => { const r = ${scene(ARRIVAL)}.el.querySelector('.cm-line').getBoundingClientRect(); return { x: r.left + 120, y: r.top + 10 }; })()`);
	const b = await p.ev(`(() => { const r = ${scene(KEEPER)}.el.querySelector('.cm-line').getBoundingClientRect(); return { x: r.left + 200, y: r.top + 10 }; })()`);
	await p.drag(a.x, a.y, b.x, b.y, 20);
	const dragged = await sel(p);
	t.ok(/^Arrival: /.test(dragged) && dragged.endsWith('not opened.\n'), 'a drag from one section into the next selects to the end of the first: ' + J(dragged));
	await p.move(b.x, b.y, 2);
	for (const clickCount of [1, 2, 3]) { await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount }); }
	await p.sleep(200);
	t.eq(await sel(p), `The keeper: ${body(before[KEEPER]).trimEnd()}`, 'a triple click selects the paragraph');
	await p.sleep(2400);
	t.eq(changed(before, snap(p)).join(), '', 'nothing was written');
});

/** Drags the selection of one section's editor to a place in another's (or its own), with the events a browser sends. */
const dragText = (p, from, word, to, before) => p.ev(`(async () => {
	const a = ${scene(from)}.live.cm, b = ${scene(to)}.live.cm, start = (cm) => cm.state.doc.toString().indexOf('\\n---\\n') + 5;
	const i = a.state.doc.toString().indexOf(${J(word)}, start(a)); a.focus(); a.dispatch({ selection: { anchor: i, head: i + ${word.length} } });
	await new Promise(r => setTimeout(r, 150));
	const c = b.coordsAtPos(b.state.doc.toString().indexOf(${J(before)}, start(b))), c0 = a.coordsAtPos(i + 2), dt = new DataTransfer();
	const ev = (type, at) => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: at.left, clientY: (at.top + at.bottom) / 2 });
	const src = a.contentDOM.querySelector('.cm-line'), dst = b.contentDOM.querySelector('.cm-line');
	src.dispatchEvent(ev('dragstart', c0));
	const text = dt.getData('text/plain');
	dst.dispatchEvent(ev('dragenter', c)); dst.dispatchEvent(ev('dragover', c)); dst.dispatchEvent(ev('drop', c));
	src.dispatchEvent(ev('dragend', c));
	return text;
})()`);

test('selected text dragged to another place in its section moves there; find and replace, the text menu and slash commands work in a section', async (p, h, t) => {
	await p.ev(`(() => { app.internalPlugins.getPluginById('slash-command').enable(); return 1; })()`);
	try {
		await openMs(p);
		const before = snap(p);
		await clickIn(p, ARRIVAL);
		t.eq(await dragText(p, ARRIVAL, 'supply boat ', ARRIVAL, 'two cases'), 'supply boat ', 'the drag carries the selected words');
		await p.sleep(300);
		t.eq(body(await value(p, ARRIVAL)), 'The left Mara on the jetty with supply boat two cases and a letter she had not opened.\n', 'moved, not copied');
		// find and replace (Mod+H) in the section with the caret
		await clickIn(p, KEEPER);
		await p.key('h', 'ctrl'); await p.sleep(400);
		t.ok(await p.ev(`!!${scene(KEEPER)}.el.querySelector('.document-search-container.mod-replace-mode')`), 'the replace bar is in the section');
		await p.type('tower'); await p.sleep(200); await p.key('Tab'); await p.type('lighthouse'); await p.sleep(200);
		const all = await p.ev(`(() => { const b = [...document.querySelectorAll('.document-replace-buttons button')].find(b => /^Replace all/.test(b.getAttribute('aria-label'))); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
		await p.click(all.x, all.y); await p.sleep(300);
		await p.key('Escape'); await p.sleep(300);
		t.eq(await focused(p), KEEPER, 'Escape gives the caret back');
		// the text's own menu
		const r = await p.ev(`(() => { const r = ${scene(STORM)}.el.querySelector('.cm-line').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 10 }; })()`);
		await p.right(r.x, r.y); await p.sleep(400);
		const items = await menuItems(p);
		t.ok(['Cut', 'Copy', 'Paste', 'Select all'].every((x) => items.includes(x)) && !items.includes('Rename'), 'a right-click on text opens the editor’s menu, not the title’s: ' + items.join(', '));
		await closeMenus(p);
		t.eq(await focused(p), STORM, 'and the caret is in the section after it closes');
		// a slash command
		await focusEnd(p, STORM);
		await p.key('Enter'); await keys(p, '/bold'); await p.sleep(600);
		t.ok(/Toggle bold/.test(await p.ev(`document.querySelector('.suggestion-container .suggestion-item')?.textContent ?? ''`)), 'slash commands are suggested');
		await p.key('Enter'); await p.sleep(300); await keys(p, 'strong');
		await p.sleep(2600);
		const s = snap(p);
		t.eq(body(s[ARRIVAL]), 'The left Mara on the jetty with supply boat two cases and a letter she had not opened.\n', 'the drag is saved');
		t.eq(s[KEEPER], before[KEEPER].replace(/tower/g, 'lighthouse'), 'replace all (in the text, and in the synopsis it hides, as in a note)');
		t.eq(s[STORM], before[STORM] + '**strong**\n', 'the slash command and what was typed');
		t.eq(changed(before, s).join(), [ARRIVAL, STORM, KEEPER].sort().join(), 'nothing else changed');
	} finally { await p.ev(`(() => { app.internalPlugins.getPluginById('slash-command').disable(); return 1; })()`); }
});

test('UX: selected text dragged into another section moves there (it is copied: the words are in both notes)', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, ARRIVAL);
	t.eq(await dragText(p, ARRIVAL, 'Mara ', KEEPER, 'at the foot'), 'Mara ', 'the drag carries the selected word');
	await p.sleep(300);
	t.eq(body(await value(p, KEEPER)), 'He met her Mara at the foot of the tower and did not move out of the doorway.\n', 'dropped in the other section');
	t.eq(body(await value(p, ARRIVAL)), 'The supply boat left on the jetty with two cases and a letter she had not opened.\n', 'and gone from the first, as within one section (and one page)');
	await p.sleep(2400);
});

// ================================================================================================================
// 7. The note open elsewhere; outside edits; leaving the mode
// ================================================================================================================

for (const [how, open] of [
	['Mod-click on its title', async (p) => { const at = await titleAt(p, ARRIVAL); await p.click(at.x, at.y, { modifiers: 2 }); }],
	['“Open to the right” in its title’s menu', async (p) => { await titleMenu(p, ARRIVAL); await clickMenu(p, 'Open to the right'); }],
]) test(`BUG: unsaved typing in a section is lost when its note is opened in a tab (${how}) and typed in there within the save delay`, async (p, h, t) => {
	await openMs(p);
	const before = disk(p, ARRIVAL);
	await focusEnd(p, ARRIVAL);
	await keys(p, ' M-unsaved');
	await open(p);
	await p.sleep(400);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').length`), 1, 'the note opened in a tab of its own');
	const tab = await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`);
	await p.ev(`(() => { const ed = app.workspace.getLeavesOfType('markdown')[0].view.editor; ed.focus(); ed.setCursor(ed.offsetToPos(${fm(before).length})); return 1; })()`);
	await keys(p, 'T-typed ');
	await p.sleep(3500);
	const d = disk(p, ARRIVAL);
	await clearNotices(p);
	t.eq(body(d), 'T-typed ' + body(before).replace(/\n$/, ' M-unsaved\n'), 'what was typed in the manuscript and in the tab are both saved');
	t.eq(body(tab), body(before).replace(/\n$/, ' M-unsaved\n'), 'and the tab opened with the manuscript’s unsaved typing (as a second tab of a note does)');
	t.eq(fm(d), fm(before), 'the properties are as they were');
});

test('control: Obsidian’s own tabs: unsaved typing in one, the note opened in a second and typed in at once: both kept', async (p, h, t) => {
	const before = disk(p, ARRIVAL);
	await h.open(ARRIVAL);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setCursor(ed.offsetToPos(ed.getValue().length - 1)); return 1; })()`);
	await keys(p, ' M-unsaved');
	await p.ev(`app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${J(ARRIVAL)})).then(() => 1)`);
	await p.sleep(400);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setCursor(ed.offsetToPos(${fm(before).length})); return 1; })()`);
	await keys(p, 'T-typed ');
	await p.sleep(3500);
	t.eq(disk(p, ARRIVAL), fm(before) + 'T-typed ' + body(before).replace(/\n$/, ' M-unsaved\n'), 'both');
});

test('to another mode and back at a person’s speed, typing before, during and after: every key in order', async (p, h, t) => {
	await openMs(p);
	await clickIn(p, ARRIVAL);
	await caretAt(p, ARRIVAL, 'with two cases');
	await keys(p, 'one ');
	await h.run('show-corkboard'); await p.sleep(120); await h.run('show-manuscript');
	await keys(p, 'two '); await p.sleep(600); await settle(p);
	t.eq(await focused(p), ARRIVAL, 'the caret is back in the section');
	await keys(p, 'three ');
	await p.sleep(2600);
	t.eq(body(disk(p, ARRIVAL)), 'The supply boat left Mara on the jetty one two three with two cases and a letter she had not opened.\n', 'in order, at the caret');
});

test('a Longform project as a manuscript: typing, a title renamed in place and “New note after this” keep Longform’s scene list right', async (p, h, t) => {
	const L = 'Longform demo', before = snap(p);
	await openMs(p, L);
	t.eq(await shown(p), 'Harbor | Ticket office | The crossing | Island | Return', 'the scenes, in Longform’s order');
	await focusEnd(p, `${L}/Ticket office.md`); await keys(p, ' L-unsaved');
	const at = await titleAt(p, `${L}/Ticket office.md`);
	await p.click(at.x, at.y); await p.sleep(200);
	await keys(p, 'Renamed scene'); await p.key('Enter'); await p.sleep(900);
	t.eq(await focused(p), `${L}/Renamed scene.md`, 'renamed; the caret is in its text');
	await titleMenu(p, `${L}/Renamed scene.md`);
	t.ok(!(await menuItems(p)).includes('Put in a new folder'), 'no folders in a Longform project');
	await clickMenu(p, 'New note after this'); await p.sleep(800);
	await keys(p, 'Brand new'); await p.key('Enter'); await p.sleep(800);
	await keys(p, 'Body of the new scene');
	await p.sleep(2800);
	const s = snap(p);
	t.eq(await shown(p), 'Harbor | Renamed scene | Brand new | The crossing | Island | Return', 'the page');
	t.eq(s[`${L}/Index.md`], before[`${L}/Index.md`].replace('    - - Ticket office\n', '    - - Renamed scene\n      - Brand new\n'), 'only the scene list changed in the index: the new name, and the new scene in the same group');
	t.eq(s[`${L}/Renamed scene.md`], before[`${L}/Ticket office.md`].replace(/\n$/, ' L-unsaved\n'), 'the renamed note has its typing');
	t.eq(s[`${L}/Brand new.md`], 'Body of the new scene', 'the new note');
	t.eq(changed(before, s).join(), ['Brand new', 'Index', 'Renamed scene', 'Ticket office'].map((n) => `${L}/${n}.md`).join(), 'nothing else changed');
});

// ================================================================================================================
// 8. A 300-scene binder
// ================================================================================================================

test('300 scenes: wheel through the whole page without a slow frame, memory and editors stay flat over three passes, Mod+Home and Mod+End then typing', async (p, h, t) => {
	const text = 'The sea came up the rocks and the light turned over it, and the keeper wrote it down. '.repeat(6);
	const note = `---\nstatus: draft\nsynopsis: A scene.\n---\n${text}\n\n${text}\n\n${text}\n`;
	const BIG = (i) => `Big/Part ${String(Math.floor(i / 30) + 1).padStart(2, '0')}/Scene ${String(i).padStart(3, '0')}.md`;
	await p.ev(`(async () => {
		await app.vault.createFolder('Big');
		for (let k = 0; k < 10; k++) await app.vault.createFolder('Big/Part ' + String(k + 1).padStart(2, '0'));
		for (let i = 0; i < 300; i++) await app.vault.create('Big/Part ' + String(Math.floor(i / 30) + 1).padStart(2, '0') + '/Scene ' + String(i).padStart(3, '0') + '.md', ${J(note)});
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Big'));
		return 1; })()`);
	await p.sleep(1500);
	const heap = async () => { await p.send('HeapProfiler.collectGarbage'); await p.sleep(200); return p.ev(`Math.round(performance.memory.usedJSHeapSize / 1e6)`); };
	const stats = () => p.ev(`(() => { const m = ${M}; return { live: m.scenes.filter(s => s.live).length, editors: document.querySelectorAll('.binders-manuscript .cm-editor').length, children: m.comp._children.length, nodes: m.root.querySelectorAll('*').length }; })()`);
	try {
		await openMs(p, 'Big');
		t.eq(await p.ev(`${M}.scenes.length`), 300, 'all the scenes');
		await p.ev(`(() => { window.__f = []; window.__run = true; let last = performance.now(); const tick = (now) => { window.__f.push(now - last); last = now; if (window.__run) requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()`);
		for (let n = 0; n < 1500; n += 10) { await wheel(p, 400, 10, 16); if (await p.ev(`(() => { const m = ${M}; return m.root.scrollTop + m.root.clientHeight >= m.root.scrollHeight - 5; })()`)) break; }
		const f = await p.ev(`(() => { window.__run = false; const f = window.__f.slice(2).sort((a, b) => a - b); return { frames: f.length, p95: f[Math.floor(f.length * 0.95)], max: f[f.length - 1] }; })()`);
		t.ok(f.frames > 500 && f.p95 < 34 && f.max < 100, 'frames while wheeling to the end: ' + J(f));
		await p.sleep(1500); await settle(p);
		const s1 = await stats(), h1 = await heap();
		t.ok(s1.live <= 11 && s1.editors === s1.live, 'only the editors near the window are alive: ' + J(s1));
		for (let i = 0; i < 2; i++) {
			await p.ev(`(async () => { const m = ${M}; for (let y = m.root.scrollTop; y > 0; y -= 2000) { m.root.scrollTop = y; await new Promise(r => setTimeout(r, 30)); } m.root.scrollTop = 0; await new Promise(r => setTimeout(r, 400)); for (let y = 0; y < m.root.scrollHeight; y += 2000) { m.root.scrollTop = y; await new Promise(r => setTimeout(r, 30)); } return 1; })()`);
			await p.sleep(1500); await settle(p);
		}
		const s2 = await stats(), h2 = await heap();
		t.ok(s2.live <= 11 && s2.children <= 311 && s2.nodes < s1.nodes * 1.3 && h2 < h1 + 15, `after two more passes nothing has piled up: ${J(s1)} ${h1} MB → ${J(s2)} ${h2} MB`);
		// far down: typing lands at once
		await focusEnd(p, BIG(250));
		const t0 = Date.now();
		await keys(p, ' the quick brown fox', 20);
		const typed = Date.now() - t0;
		t.ok((await value(p, BIG(250))).endsWith(' the quick brown fox\n'), 'typed far down');
		t.ok(typed < 20 * 60, `20 keys 20 ms apart took ${typed} ms`);
		await pageKey(p, 'Home', 2); await keys(p, 'HOME ');
		await p.sleep(500);
		t.eq((await caret(p))?.path, BIG(0), 'Mod+Home goes to the first scene');
		await pageKey(p, 'End', 2); await keys(p, 'END');
		await p.sleep(500);
		const c = await caret(p);
		t.ok(c?.path === BIG(299) && onScreen(c), 'Mod+End goes to the last, on screen: ' + J(c));
		await p.sleep(2600);
		t.eq(disk(p, BIG(0)), fm(note) + 'HOME ' + body(note), 'typed right after Mod+Home: all of it, in the first scene');
		t.eq(disk(p, BIG(299)), note + 'END', 'typed right after Mod+End: all of it, in the last');
		t.eq(disk(p, BIG(250)), note.replace(/\n$/, ' the quick brown fox\n'), 'and scene 250');
		t.ok([...Array(300).keys()].filter((i) => ![0, 250, 299].includes(i)).every((i) => disk(p, BIG(i)) === note), 'the other 297 notes are untouched');
		t.eq(measureLoops(p), 0, 'no “Measure loop restarted”');
	} finally { await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); return 1; })()`); await p.sleep(300); }
});

// ================================================================================================================
// 9. Phones (emulated). These reload the app window: keep them last. Each puts the desktop back.
// ================================================================================================================

const tap = async (p, x, y) => { await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] }); await p.sleep(40); await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.sleep(400); };
/** A finger dragged up or down the page, held still before it lifts (no fling). */
const swipe = async (p, dy, x = 200, y = 500) => { await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); for (let i = 1; i <= 10; i++) { await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy * i / 10 }] }); await p.sleep(16); } for (let i = 0; i < 4; i++) { await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + dy }] }); await p.sleep(40); } await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.sleep(150); };
const phone = (fn) => async (p, h, t) => {
	await novel(p, 14, 8, false);
	await reload(p, true);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
	await p.ev(`(() => { window.activeWindow = window; window.activeDocument = document; const l = []; app.workspace.iterateRootLeaves(x => { l.push(x); }); l.forEach(x => x.detach()); return 1; })()`);
	try {
		t.eq(await p.ev(`app.isMobile`), true, 'mobile');
		await openMs(p, 'Novel');
		await fn(p, h, t);
	} finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await desktop(p);
		await reload(p, false);
		await p.ev(`(() => { window.activeWindow = window; window.activeDocument = document; return 1; })()`);
	}
};
/** A tap in the third paragraph of the first scene, then “TAP ” typed there. */
async function tapAndType(p, t) {
	t.eq(await active(p), 'body', 'opening the manuscript on a phone puts the caret nowhere (no keyboard)');
	// (the third paragraph: on a phone the section is plain text until this tap, which makes it its editor)
	const at = await p.ev(`(() => { const el = ${scene(N(1))}.el, ls = el.querySelectorAll('.cm-line'), third = ls.length ? ls[4] : el.querySelectorAll('.binders-manuscript-rendered > p')[2]; const r = third.getBoundingClientRect(); return { x: r.left + 120, y: r.top + 12 }; })()`);
	await tap(p, at.x, at.y);
	await until(p, `!!document.activeElement?.matches('.binders-manuscript .cm-content')`, 5000);
	const c = await caret(p), text = disk(p, N(1));
	t.ok(c?.path === N(1) && c.head >= text.indexOf('Scene 1 paragraph 3') && c.head < text.indexOf('Scene 1 paragraph 4'), 'a tap puts the caret in the paragraph tapped: ' + J(c && c.before + '|' + c.after));
	await keys(p, 'TAP '); await p.sleep(300);
	return c;
}

test('phone: a tap places the caret, typing goes there, a swipe far away saves it and lets go of the caret, a tap on a title renames in place', phone(async (p, h, t) => {
	const before = disk(p, N(1));
	const c = await tapAndType(p, t);
	for (let k = 0; k < 12; k++) await swipe(p, -380, 200, 600);
	await p.sleep(300);
	const s = await st(p);
	t.ok(s.top > 3000 && s.left === N(1) && s.active === 'body', 'swiped far: the caret is let go (the keyboard goes): ' + J(s));
	await p.sleep(2600);
	t.eq(disk(p, N(1)), before.slice(0, c.head) + 'TAP ' + before.slice(c.head), 'what was typed is saved, where it was typed');
	await p.ev(`(() => { ${scene(N(8))}.titleEl.scrollIntoView({ block: 'center' }); return 1; })()`); await p.sleep(900); await settle(p);
	const ti = await titleAt(p, N(8));
	await tap(p, ti.x, ti.y);
	t.ok(/is-renaming in Scene 08/.test(await active(p)), 'a tap on a title edits it: ' + await active(p));
	await keys(p, 'Eighth'); await p.key('Enter'); await p.sleep(700);
	t.ok(onDisk(p, 'Novel/Eighth.md') && !onDisk(p, N(8)), 'renamed');
}));

test('BUG: phone: swiping back to the section that had the caret gives it the focus again, so the keyboard comes up while reading', phone(async (p, h, t) => {
	await tapAndType(p, t);
	for (let k = 0; k < 12; k++) await swipe(p, -380, 200, 600);
	await p.sleep(2600);
	t.eq((await st(p)).active, 'body', 'swiped far: nothing has the focus');
	// back up, stopping short of the top (a pull at the top is Obsidian's own gesture)
	for (let k = 0; k < 30 && await scrollTop(p) > 500; k++) await swipe(p, Math.min(380, (await scrollTop(p)) - 300), 200, 250);
	await p.sleep(700);
	t.eq(await active(p), 'body', 'scrolling by touch never brings the keyboard up: a tap does');
}));
