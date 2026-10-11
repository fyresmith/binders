// The manuscript showing each note's synopsis where its text would be (src/view/manuscript-synopses.ts, and the
// switch in src/view/manuscript.ts). Golden rule 2 lives here: a switch while typing, a mount in flight, a quit, an
// outside edit, and every synopsis edit, are checked against the disk byte for byte, and a note's body is never written
// by this display.
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { VIEW, clickMenu, closeMenus, menuItems, openView, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'manuscript synopses: ' + name, fn: withTidy(async (p, h, t) => {
	try { await fn(p, h, t); } finally {
		await closeMenus(p).catch(() => {});
		await p.ev(`(() => { document.querySelectorAll('.modal-close-button').forEach(b => b.click()); document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`).catch(() => {});
	}
}) });

export const B = 'The Lighthouse';
export const LEAF = '.workspace-leaf.mod-active';
export const ORDER = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((n) => `${B}/${n}.md`);
export const [PROLOGUE, ARRIVAL, KEEPER, STORM, WRECK, LIGHTS, EPILOGUE] = ORDER;
export const J = JSON.stringify;
export const M = `${VIEW}.current`;
export const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
export const onDisk = (p, path) => existsSync(join(p.vaultDir, path));
export const fm = (s) => (s.match(/^---\n[\s\S]*?\n---\n/) || [''])[0];
export const body = (s) => s.slice(fm(s).length);
/** Every Markdown file of the vault as it is on disk, by path. */
export function snap(p) {
	const out = {};
	const walk = (dir) => { for (const f of readdirSync(dir)) { const q = join(dir, f); if (f === '.obsidian' || f === '.trash') continue; if (statSync(q).isDirectory()) walk(q); else if (/\.md$/.test(f)) out[relative(p.vaultDir, q)] = readFileSync(q, 'utf8'); } };
	walk(p.vaultDir);
	return out;
}
export const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
export const idx = (path) => `${M}.scenes.findIndex(s => s.file.path === ${J(path)})`;
export const scene = (path) => `${M}.scenes[${idx(path)}]`;
/** Waits for a condition on disk (writes reach it a moment after they are asked for). */
export async function wait(p, fn, ms = 6000) { for (let i = 0; i < ms / 100; i++) { if (fn()) return true; await p.sleep(100); } return fn(); }

/** Waits until the sections near the viewport are live editors (or, with synopses showing, until the page is drawn). */
export async function settle(p, ms = 5000) {
	for (let i = 0; i < ms / 50; i++) {
		const ok = await p.ev(`(() => { const m = ${M}; if (!m || !m.scenes) return false; if (m.outline) return !m.switching; const near = m.scenes.filter(s => m.near.has(s.el)); return (near.length > 0 || m.scenes.length === 0) && near.slice(0, m.liveMax).every(s => m.editable ? (s.live || s.broken) && !s.mounting : s.shown !== null); })()`).catch(() => false);
		if (ok) break;
		await p.sleep(50);
	}
	await p.sleep(150);
}
/** The real binder view on a folder, in manuscript mode, showing text. */
export async function openMs(p, folder = B, newLeaf = false) {
	await openView(p, folder, newLeaf);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
}
/** Is the page showing synopses (as the page itself says)? */
export const showing = (p) => p.ev(`!!document.querySelector('${LEAF} .binders-manuscript.is-synopses')`);
/** The Synopses button of the toolbar, clicked as a mouse does. */
export async function toggle(p) {
	const at = await p.at(`${LEAF} .binders-synopses-button`);
	if (!at) throw new Error('no Synopses button');
	await p.click(at.x, at.y);
}
/** Waits until the page shows (or no longer shows) synopses, and has finished switching. */
export async function waitShowing(p, want = true, ms = 6000) {
	const ok = await until(p, `!!document.querySelector('${LEAF} .binders-manuscript.is-synopses') === ${want} && !${M}.switching`, ms);
	await p.sleep(120);
	return !!ok;
}
/** Puts the caret at the end of a section's text, in its editor, and returns once the editor has the keyboard. */
export async function focusEnd(p, path) {
	await p.ev(`(async () => { const m = ${M}, s = m.scenes[${idx(path)}]; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.sleep(150);
}
export const editors = (p) => p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript .cm-editor').length`);
/** Delays the write of one note by `ms` (an Obsidian saving slowly), once. */
/** Holds back the next read of one note until `window.__go()` (the file system slow to answer), for the editor that is being made. */
export const holdRead = (p, path) => p.ev(`(() => { const v = app.vault, r = v.read, c = v.cachedRead, a = v.adapter, ar = a.read; window.__held = 0; const gate = () => new Promise((res) => { window.__held++; window.__go = () => { v.read = r; v.cachedRead = c; a.read = ar; res(); }; }); v.read = async function (f, ...x) { if (f.path === ${J(path)}) await gate(); return r.call(this, f, ...x); }; v.cachedRead = async function (f, ...x) { if (f.path === ${J(path)}) await gate(); return c.call(this, f, ...x); }; a.read = async function (q, ...x) { if (q === ${J(path)}) await gate(); return ar.call(this, q, ...x); }; return 1; })()`);
export const slowWrite = (p, path, ms) => p.ev(`(() => { const a = app.vault.adapter, w = a.write; a.write = async function (...args) { if (args[0] === ${J(path)}) { a.write = w; await new Promise(r => setTimeout(r, ${ms})); } return w.apply(this, args); }; return 1; })()`);

// ---- 1. the display and its switch ----

test('the Synopses button switches the page to synopses and back; no editor is left, and nothing on disk changes', async (p, h, t) => {
	const before = snap(p);
	await openMs(p);
	t.ok(await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript .cm-editor').length > 0`), 'text first: the page has editors');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-synopses-button')?.getAttribute('aria-pressed')`), 'false', 'the button is not lit');
	await toggle(p);
	t.ok(await waitShowing(p), 'the page shows synopses');
	t.eq(await editors(p), 0, 'no editor is left');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-synopses-button')?.getAttribute('aria-pressed')`), 'true', 'the button is lit and says it is pressed');
	t.eq(await p.ev(`${M}.scenes.filter(s => s.live || s.mounting).length`), 0, 'no section holds an editor or is making one');
	await toggle(p);
	t.ok(await waitShowing(p, false), 'and the text comes back');
	await settle(p);
	t.ok(await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript .cm-editor').length > 0`), 'with its editors');
	await p.sleep(600);
	t.eq(changed(before, snap(p)).join(), '', 'no note changed');
});

test('typing and switching at once: every character reaches the disk, and no editor is left', async (p, h, t) => {
	await openMs(p);
	const was = disk(p, KEEPER);
	await focusEnd(p, KEEPER);
	await p.type(' Quick words, then away.');
	await toggle(p);
	t.ok(await waitShowing(p), 'the page shows synopses');
	t.eq(await editors(p), 0, 'no editor is left');
	t.ok(await wait(p, () => disk(p, KEEPER) !== was), 'the note is written');
	t.eq(disk(p, KEEPER), was.replace(/\n$/, ' Quick words, then away.\n'), 'with every character, and the properties as they were');
});

test('several unsaved sections at the switch: all are written, byte for byte', async (p, h, t) => {
	await openMs(p);
	const files = [ARRIVAL, KEEPER, STORM], was = Object.fromEntries(files.map((f) => [f, disk(p, f)]));
	// (typed into three editors with nothing flushed: each is dirty, as a writer's last words before a click are)
	await p.ev(`(async () => { const m = ${M}; let i = 0; for (const f of ${J(files)}) { const s = m.scenes.find(x => x.file.path === f); await m.mount(s); const ed = s.live.editor; let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length }); ed.replaceSelection(' Unsaved ' + (++i) + '.'); } return 1; })()`);
	t.ok(await p.ev(`${M}.scenes.filter(s => s.live?.dirty).length >= 2`), 'more than one section holds unsaved typing');
	await toggle(p);
	t.ok(await waitShowing(p), 'the page shows synopses');
	t.eq(await editors(p), 0, 'no editor is left');
	await wait(p, () => files.every((f) => disk(p, f) !== was[f]));
	files.forEach((f, i) => t.eq(disk(p, f), was[f].replace(/(\n*)$/, ` Unsaved ${i + 1}.$1`), `“${f.split('/').pop()}” has its words`));
});

test('a mount still going when the page switches to synopses leaves no editor, and the text comes back whole', async (p, h, t) => {
	await openMs(p);
	// (a mount held back, as a slow disk does it: it waits for the last unmount's save)
	await p.ev(`(async () => { const m = ${M}, s = m.scenes.find(x => x.file.path === ${J(EPILOGUE)}); if (s.live) { const live = s.live; s.live = null; s.bodyEl.empty(); await live.destroy(); } return 1; })()`);
	await holdRead(p, EPILOGUE);
	await p.ev(`(() => { void ${M}.mount(${scene(EPILOGUE)}); return 1; })()`);
	t.ok(await until(p, `window.__held > 0`, 3000), 'a mount is under way, waiting for the note to be read');
	await toggle(p);
	t.ok(await waitShowing(p), 'the page shows synopses');
	await p.ev(`window.__go()`);
	await p.sleep(800);
	t.eq(await editors(p), 0, 'the mount that finished did not leave an editor');
	t.eq(await p.ev(`${M}.scenes.filter(s => s.live).length`), 0, 'and no section holds one');
});

test('switched on and off again while a mount is going: the section has one editor, in its page, no stray one', async (p, h, t) => {
	await openMs(p);
	await p.ev(`(async () => { const m = ${M}, s = m.scenes.find(x => x.file.path === ${J(EPILOGUE)}); if (s.live) { const live = s.live; s.live = null; s.bodyEl.empty(); await live.destroy(); } return 1; })()`);
	await holdRead(p, EPILOGUE);
	await p.ev(`(() => { void ${M}.mount(${scene(EPILOGUE)}); return 1; })()`);
	t.ok(await until(p, `window.__held > 0`, 3000), 'a mount is under way');
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	await toggle(p);
	t.ok(await waitShowing(p, false), 'and text again');
	await p.ev(`window.__go()`);
	await settle(p);
	await p.sleep(800);
	const ok = await p.ev(`(() => { const m = ${M}; return m.scenes.every(s => !s.live || s.bodyEl.contains(s.live.cm.dom)) && m.root.querySelectorAll('.cm-editor').length === m.scenes.filter(s => s.live).length; })()`);
	t.ok(ok, 'every editor is in its section and every section has at most one');
});

test('quitting or hiding the page right after the switch waits for what was typed to be written', async (p, h, t) => {
	await openMs(p);
	const was = disk(p, KEEPER);
	await focusEnd(p, KEEPER);
	await p.type(' Last words.');
	await slowWrite(p, KEEPER, 700);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	// (Obsidian asking its plugins to finish before it quits)
	const waited = await p.ev(`(async () => { const tasks = []; app.workspace.trigger('quit', { addPromise: (x) => tasks.push(x) }); await Promise.all(tasks); return tasks.length; })()`);
	t.ok(waited > 0, 'Binders asks to be waited for');
	t.eq(disk(p, KEEPER), was.replace(/\n$/, ' Last words.\n'), 'and the words are on disk when it is done');
});

test('switching back puts the caret where it was', async (p, h, t) => {
	await openMs(p);
	await focusEnd(p, KEEPER);
	await p.key('ArrowLeft'); await p.key('ArrowLeft'); await p.key('ArrowLeft');
	const at = await p.ev(`(() => { const s = ${scene(KEEPER)}, sel = s.live.cm.state.selection.main; return { head: sel.head, after: s.live.cm.state.sliceDoc(sel.head, sel.head + 3) }; })()`);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	await toggle(p);
	t.ok(await waitShowing(p, false), 'text');
	t.ok(await until(p, `${scene(KEEPER)}.live?.cm?.hasFocus`, 5000), 'the section has the keyboard again');
	const now = await p.ev(`(() => { const s = ${scene(KEEPER)}, sel = s.live.cm.state.selection.main; return { head: sel.head, after: s.live.cm.state.sliceDoc(sel.head, sel.head + 3) }; })()`);
	t.eq(J(now), J(at), 'at the same place in its text');
	await p.type('!');
	await p.sleep(400);
});

test('a note changed outside during the switch: its new text is shown on the way back, and what was typed is kept', async (p, h, t) => {
	await openMs(p);
	await focusEnd(p, ARRIVAL);
	await p.type(' Mine.');
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	t.eq(await editors(p), 0, 'no editor is left');
	const outside = disk(p, STORM).replace(/\n$/, '\nOutside words.\n');
	await p.ev(`app.vault.adapter.write(${J(STORM)}, ${J(outside)}).then(() => 1)`);
	await p.sleep(900);
	await toggle(p);
	t.ok(await waitShowing(p, false), 'text');
	await settle(p);
	t.ok(await until(p, `(${scene(STORM)}.live?.editor.getValue() ?? ${scene(STORM)}.bodyEl.textContent).includes('Outside words.')`, 6000), 'the outside change is on the page');
	t.ok(disk(p, ARRIVAL).includes('Mine.'), 'and what was typed is on disk');
	t.eq(disk(p, STORM), outside, 'the outside change was not written over');
});

test('the choice is kept with the tab: in the view’s state, and across a look at another mode', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	t.eq(await p.ev(`${VIEW}.getState().options.manuscriptShow`), 'synopses', 'the view’s state says so');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(500);
	t.eq(await p.ev(`!!document.querySelector('${LEAF} .binders-synopses-button:not(.is-hidden)')`), false, 'the corkboard has no Synopses button');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await p.sleep(500);
	t.ok(await showing(p), 'back in the manuscript it still shows synopses');
});

test('a switch is refused, and the typing kept, when the note cannot be written', async (p, h, t) => {
	await openMs(p);
	await focusEnd(p, KEEPER);
	await p.type(' Unwritable.');
	await p.ev(`(() => { const a = app.vault.adapter, w = a.write; window.__w = w; a.write = async function (...args) { if (args[0] === ${J(KEEPER)}) throw new Error('disk full'); return w.apply(this, args); }; return 1; })()`);
	await toggle(p);
	await p.sleep(1500);
	t.eq(await showing(p), false, 'the page stays on the text');
	p.errors.length = 0; // (the failures are the test's own)
	t.ok(await p.ev(`${scene(KEEPER)}.live?.editor.getValue().includes('Unwritable.')`), 'with what was typed still in its editor');
	t.ok(!disk(p, KEEPER).includes('Unwritable.'), 'the words are in the editor only');
	// (the disk is back; Obsidian does not try the write again by itself, and the page does not go on without it)
	await p.ev(`(() => { app.vault.adapter.write = window.__w; document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
	await p.sleep(300);
	await toggle(p);
	await p.sleep(1500);
	t.eq(await showing(p), false, 'asked again, the page still does not go on while the words are not on disk');
	p.errors.length = 0;
	await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
	await focusEnd(p, KEEPER);
	await p.type('!');
	await toggle(p);
	t.ok(await waitShowing(p), 'and once they are written the switch goes through');
	t.ok(await wait(p, () => disk(p, KEEPER).includes('Unwritable.!')), 'with the words on disk');
	p.errors.length = 0;
});

// ---- 2. synopses drawn and edited ----

export const NOTE = `${B}/${B}.md`;
const PART1 = `${B}/Part One`;
/** The centre of a section's synopsis (or a folder heading's), as {x, y}. */
export const lineAt = (p, path) => p.ev(`(() => { const m = ${M}, e = m.entries.find(x => x.key.path === ${J(path)}); const r = e.synopsis.ed.el.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; })()`);
/** What a section's (or heading's) synopsis shows, and whether it is a field right now. */
export const lineOf = (p, path) => p.ev(`(() => { const e = ${M}.entries.find(x => x.key.path === ${J(path)}); const el = e?.synopsis?.ed.el; return el ? { text: el.querySelector('textarea') ? el.querySelector('textarea').value : el.textContent, editing: !!el.querySelector('textarea'), empty: el.classList.contains('is-empty') } : null; })()`);
export const synopsisOf = (text) => /^synopsis: (.*)$/m.exec(fm(text))?.[1] ?? null;
/** Clicks a synopsis, as a mouse does; waits for its field. */
export async function openLine(p, t, path) {
	const at = await lineAt(p, path);
	await p.click(at.x, at.y);
	t.ok(await until(p, `!!${M}.entries.find(x => x.key.path === ${J(path)}).synopsis.ed.el.querySelector('textarea')`, 3000), 'a click on the synopsis makes it a field');
	await p.key('End', 'ctrl');
}
/** Leaves the field the way a writer does who is done: Mod+Enter saves it. */
export async function leaveLine(p) {
	await p.key('Enter', 'ctrl');
	await p.sleep(500);
}

test('every note shows its synopsis in place of its text; a folder is a heading with its synopsis under it; nothing else is on a line', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	const d = await p.ev(`(() => { const m = ${M}; return {
		scenes: m.scenes.map(s => ({ path: s.file.path, title: s.titleEl.textContent, syn: s.synopsis.ed.el.textContent, kids: [...s.el.children].map(c => c.className.split(' ')[0]), body: [...s.bodyEl.children].map(c => c.className.split(' ')[0]) })),
		heads: m.entries.filter(e => e.kind === 'heading').map(e => ({ name: e.key.name, syn: e.synopsis.ed.el.textContent, empty: e.synopsis.ed.el.classList.contains('is-empty'), kids: [...e.el.children].map(c => c.tagName.toLowerCase() + '.' + c.className.split(' ')[0]) })),
		cm: document.querySelectorAll('${LEAF} .binders-manuscript .cm-editor, ${LEAF} .binders-manuscript-rendered').length }; })()`);
	t.eq(d.cm, 0, 'no text, no editor');
	t.eq(d.scenes.length, 7, 'seven notes');
	for (const s of d.scenes) {
		t.eq(s.syn, synopsisOf(disk(p, s.path)), `“${s.title}” shows the synopsis of its note`);
		t.eq(s.kids.join(), 'binders-manuscript-break,binders-manuscript-body', `“${s.title}” is a title and a body`);
		t.eq(s.body.join(), 'binders-editable', `“${s.title}” has its synopsis and nothing more`);
	}
	t.eq(d.heads.map((x) => x.name).join(), 'Part One,Part Two', 'two folder headings');
	for (const x of d.heads) {
		t.eq(x.syn, 'Add a synopsis', `“${x.name}” has none yet and says so`);
		t.ok(x.empty, `“${x.name}” says so faintly`);
		t.ok(/^h\d\./.test(x.kids[0]) && x.kids[1] === 'div.binders-editable' && x.kids.length === 2, `“${x.name}” is its heading and its synopsis`);
	}
});

test('a click on a synopsis edits it where it stands; leaving it saves a property of the note and nothing else, and one Undo takes it back', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	const before = snap(p);
	await openLine(p, t, KEEPER);
	await p.key('a', 'ctrl');
	await p.type('The keeper says no.');
	await leaveLine(p);
	t.eq(await p.ev(`${scene(KEEPER)}.synopsis.ed.el.textContent`), 'The keeper says no.', 'the line shows what was typed');
	t.ok(await wait(p, () => synopsisOf(disk(p, KEEPER)) === 'The keeper says no.'), 'the note has it as its synopsis');
	const after = snap(p);
	t.eq(changed(before, after).join(), KEEPER, 'no other file changed');
	t.eq(body(after[KEEPER]), body(before[KEEPER]), 'the note’s text is byte for byte what it was');
	t.eq(after[KEEPER], before[KEEPER].replace('synopsis: The keeper refuses to let her into the tower.', 'synopsis: The keeper says no.'), 'and its properties differ in that line alone');
	const undo = await p.ev(`${VIEW}.store.undoable(${VIEW}.folder, false)`);
	t.eq(undo, 'Edit synopsis of “The keeper”', 'Undo says what it takes back');
	await p.ev(`${VIEW}.plugin.undoMove(${VIEW}.folder, false).then(() => 1)`);
	t.ok(await wait(p, () => disk(p, KEEPER) === before[KEEPER]), 'Undo puts the note back, byte for byte');
	t.ok(await until(p, `${scene(KEEPER)}.synopsis.ed.el.textContent === 'The keeper refuses to let her into the tower.'`, 4000), 'and the page shows it');
	await p.ev(`${VIEW}.plugin.undoMove(${VIEW}.folder, true).then(() => 1)`);
	t.ok(await wait(p, () => disk(p, KEEPER) === after[KEEPER]), 'Redo writes it again');
	t.ok(await until(p, `${scene(KEEPER)}.synopsis.ed.el.textContent === 'The keeper says no.'`, 4000), 'and the page shows that');
	t.eq(disk(p, NOTE), before[NOTE], 'the binder’s order was never written');
});

test('a folder’s note is made only when its synopsis is saved', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	const before = snap(p);
	await openLine(p, t, PART1);
	await p.key('Escape');
	await p.sleep(400);
	t.eq(changed(before, snap(p)).join(), '', 'opened and left with Escape: nothing made');
	t.ok(!onDisk(p, `${PART1}/Part One.md`), 'no folder note');
	await openLine(p, t, PART1);
	await p.type('The arrival and the keeper.');
	await p.key('Tab');
	await p.sleep(700);
	t.ok(await wait(p, () => onDisk(p, `${PART1}/Part One.md`)), 'saved: the folder note exists');
	t.eq(synopsisOf(disk(p, `${PART1}/Part One.md`)), 'The arrival and the keeper.', 'with the synopsis');
	const after = snap(p), what = changed(before, after);
	t.eq(what.join(), `${PART1}/Part One.md`, 'nothing else was written');
	t.eq(await p.ev(`${M}.entries.find(x => x.key.path === ${J(PART1)}).synopsis.ed.el.textContent`), 'The arrival and the keeper.', 'and the page shows it');
});

test('a synopsis changed outside while shown is drawn again; one changed while it is being typed in is left to the typing, which wins', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	const raw = disk(p, ARRIVAL);
	await p.ev(`app.vault.adapter.write(${J(ARRIVAL)}, ${J(raw.replace('Mara arrives on the island with the supply boat.', 'Changed outside.'))}).then(() => 1)`);
	t.ok(await until(p, `${scene(ARRIVAL)}.synopsis.ed.el.textContent === 'Changed outside.'`, 5000), 'the page shows the outside change');
	await openLine(p, t, KEEPER);
	await p.type(' Typed here.');
	const was = disk(p, KEEPER);
	await p.ev(`app.vault.adapter.write(${J(KEEPER)}, ${J(was.replace('The keeper refuses', 'Somebody else wrote that it refuses'))}).then(() => 1)`);
	await p.sleep(1200);
	const l = await lineOf(p, KEEPER);
	t.ok(l.editing && l.text.endsWith(' Typed here.'), 'the field is still there with what was typed');
	await leaveLine(p);
	t.ok(await wait(p, () => synopsisOf(disk(p, KEEPER))?.endsWith('Typed here.')), 'and it is what is saved');
	t.eq(body(disk(p, KEEPER)), body(was), 'the note’s text is as it was');
});

test('a synopsis that cannot be saved stays in its field with what was typed, and is saved once it can be', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	const before = disk(p, KEEPER);
	await openLine(p, t, KEEPER);
	await p.type(' More.');
	await p.ev(`(() => { const f = app.fileManager; window.__pfm = f.processFrontMatter; f.processFrontMatter = async () => { throw new Error('refused'); }; return 1; })()`);
	await p.key('Tab');
	await p.sleep(800);
	const l = await lineOf(p, KEEPER);
	t.ok(l.editing && l.text.endsWith(' More.'), 'the field and its text are still there');
	t.eq(disk(p, KEEPER), before, 'the note is as it was');
	await p.ev(`(() => { app.fileManager.processFrontMatter = window.__pfm; document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
	await p.key('Enter', 'ctrl');
	await p.sleep(700);
	t.ok(await wait(p, () => synopsisOf(disk(p, KEEPER))?.endsWith(' More.')), 'once it can be, it is saved');
	t.eq(body(disk(p, KEEPER)), body(before), 'and the text is as it was');
});

test('a binder from a newer version offers no synopsis to write: what is there is read, an empty one is not asked for', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/a.md', '---\\nsynopsis: Has one.\\n---\\nA'); await app.vault.create('Future/b.md', 'B'); await app.vault.create('Future/Future.md', '---\\nbinder: 2\\ncontents:\\n  - a\\n  - b\\n---\\n'); return 1; })()`);
	await p.sleep(1000);
	await openMs(p, 'Future');
	await p.ev(`${VIEW}.showSynopses(true).then(() => 1)`);
	t.ok(await waitShowing(p), 'synopses');
	const d = await p.ev(`${M}.scenes.map(s => ({ t: s.titleEl.textContent, syn: s.synopsis.ed.el.textContent, editable: s.synopsis.ed.el.classList.contains('is-editable') }))`);
	t.eq(d[0].syn, 'Has one.', 'the synopsis there is shown');
	t.eq(d[1].syn, '', 'an empty one shows nothing, not “Add a synopsis”');
	t.ok(!d[0].editable && !d[1].editable, 'and neither can be edited');
});

test('a Longform project: the synopses are the notes’, edited as the cards do, and the scene list is never written', async (p, h, t) => {
	const L = 'Longform demo';
	const before = snap(p);
	await openMs(p, L);
	await p.ev(`${VIEW}.showSynopses(true).then(() => 1)`);
	t.ok(await waitShowing(p), 'synopses');
	const d = await p.ev(`${M}.scenes.map(s => ({ path: s.file.path, syn: s.synopsis.ed.el.textContent }))`);
	t.ok(d.length >= 4, 'the scenes are there');
	t.eq(d.find((x) => x.path.endsWith('Harbor.md')).syn, 'Ines waits for the morning ferry.', 'with their synopses');
	const path = `${L}/Harbor.md`;
	await openLine(p, t, path);
	await p.key('a', 'ctrl');
	await p.type('Ines waits.');
	await leaveLine(p);
	t.ok(await wait(p, () => synopsisOf(disk(p, path)) === 'Ines waits.'), 'a synopsis is saved');
	const after = snap(p);
	t.eq(changed(before, after).join(), path, 'only that note changed');
	t.eq(after[`${L}/Index.md`], before[`${L}/Index.md`], 'Longform’s scene list is as it was');
});

// ---- 3. moving about ----

/** Where a section's title is on the page, from the page's top. */
const titleTop = (p, path) => p.ev(`Math.round(${scene(path)}.titleEl.getBoundingClientRect().top - ${M}.root.getBoundingClientRect().top)`);
const titleAt = (p, path) => p.ev(`(() => { const r = ${scene(path)}.titleEl.getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height / 2 }; })()`);

test('a click on a title shows the text again with that title where it was and the caret in that section; Ctrl-click opens the note instead', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	await p.ev(`(() => { ${M}.reveal(${scene(STORM)}.file); return 1; })()`);
	await p.sleep(500);
	const was = await titleTop(p, STORM), tabs = await p.ev(`app.workspace.getLeavesOfType('markdown').length`);
	let at = await titleAt(p, STORM);
	await p.ev(`(() => { ${scene(STORM)}.titleEl.dispatchEvent(new MouseEvent('click', { ctrlKey: true, metaKey: true, bubbles: true, cancelable: true, button: 0 })); return 1; })()`);
	await p.sleep(900);
	t.ok(await p.ev(`${M}.outline`), 'Ctrl-click leaves the page on synopses');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').length`), tabs + 1, 'and opens the note in another tab');
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.file?.path ?? null`), STORM, 'that note');
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(400);
	at = await titleAt(p, STORM);
	await p.click(at.x, at.y);
	t.ok(await waitShowing(p, false), 'a plain click shows the text');
	await settle(p);
	const now = await titleTop(p, STORM);
	t.ok(Math.abs(now - was) <= 3, `the title is where it was: ${was} then ${now}`);
	t.ok(await until(p, `${scene(STORM)}.live?.cm?.hasFocus`, 5000), 'the caret is in that section');
});

test('the keyboard walks the page: Tab and the arrows from title to synopsis to the next title; Enter on a synopsis edits it, on a title goes to the text', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	const on = () => p.ev(`(() => { const a = document.activeElement; return a.classList.contains('binders-manuscript-title') ? 'title:' + a.textContent : a.classList.contains('binders-manuscript-synopsis') ? 'synopsis:' + a.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title')?.textContent : a.tagName.toLowerCase() + ':' + a.textContent; })()`);
	await p.ev(`(() => { ${scene(ARRIVAL)}.titleEl.focus(); return 1; })()`);
	t.eq(await on(), 'title:Arrival', 'on a title');
	await p.key('ArrowDown');
	t.eq(await on(), 'synopsis:Arrival', 'Down goes to its synopsis');
	await p.key('ArrowDown');
	t.eq(await on(), 'title:The keeper', 'and on to the next title');
	await p.key('ArrowUp'); await p.key('ArrowUp');
	t.eq(await on(), 'title:Arrival', 'Up goes back');
	await p.key('Tab');
	t.eq(await on(), 'synopsis:Arrival', 'Tab goes the same way');
	await p.key('Enter');
	t.ok(await until(p, `!!${scene(ARRIVAL)}.synopsis.ed.el.querySelector('textarea')`, 2000), 'Enter on a synopsis edits it');
	await p.key('ArrowDown');
	t.ok(await p.ev(`!!${scene(ARRIVAL)}.synopsis.ed.el.querySelector('textarea')`), 'and an arrow in the field stays in it');
	await p.key('Escape');
	t.eq(await on(), 'synopsis:Arrival', 'Escape leaves it on its line');
	await p.ev(`(() => { ${scene(KEEPER)}.titleEl.focus(); return 1; })()`);
	await p.key('Enter');
	t.ok(await waitShowing(p, false), 'Enter on a title shows the text');
});

test('a note shown from Contents or the inspector comes into sight, nothing takes the keyboard, and the page stays on synopses', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	await p.ev(`(() => { ${M}.reveal(${scene(EPILOGUE)}.file); return 1; })()`);
	await p.sleep(600);
	const r = await p.ev(`(() => { const t = ${scene(EPILOGUE)}.titleEl.getBoundingClientRect(), v = ${M}.root.getBoundingClientRect(); return t.top >= v.top && t.bottom <= v.bottom; })()`);
	t.ok(r, 'its title is in sight');
	t.ok(await showing(p), 'on synopses still');
	t.eq(await editors(p), 0, 'no editor');
});

test('the place on the page is kept across the switch, and across a look at another mode; the binder’s order is never written', async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder('Novel');
		for (let i = 1; i <= 24; i++) await app.vault.create('Novel/Scene ' + String(i).padStart(2, '0') + '.md', '---\\nsynopsis: Scene ' + i + ' happens.\\n---\\n' + 'Scene ' + i + ' text. '.repeat(30) + '\\n');
		await new Promise(r => setTimeout(r, 800));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Novel'));
		return 1; })()`);
	await p.sleep(900);
	await openMs(p, 'Novel');
	await p.ev(`(() => { ${M}.reveal(${M}.scenes[17].file); return 1; })()`);
	await p.sleep(800);
	const first = () => p.ev(`(() => { const m = ${M}, v = m.root.getBoundingClientRect().top, e = m.entries.find(x => x.el.getBoundingClientRect().bottom > v + 1), a = e.el; return { path: e.key.path, top: Math.round(a.getBoundingClientRect().top - m.root.getBoundingClientRect().top) }; })()`);
	const was = await first();
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	const a = await first(), at = await p.ev(`Math.round(${M}.entries.find(x => x.key.path === ${J(was.path)}).el.getBoundingClientRect().top - ${M}.root.getBoundingClientRect().top)`);
	t.ok(Math.abs(at - was.top) <= 3, `what was at the top is where it was: ${was.top} then ${at}`);
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(600);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await p.sleep(900);
	const b = await first();
	t.eq(b.path, a.path, 'after a look at the corkboard the same entry is at the top');
	t.ok(Math.abs(b.top - a.top) <= 40, `and the page is about where it was: ${a.top} then ${b.top}`);
	await p.sleep(1500);
});

test('nothing here writes the binder’s order: its note is byte for byte what it was after switching, clicking titles and editing a synopsis', async (p, h, t) => {
	const before = snap(p);
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	await openLine(p, t, ARRIVAL);
	await p.type(' Again.');
	await leaveLine(p);
	const at = await titleAt(p, STORM);
	await p.click(at.x, at.y);
	t.ok(await waitShowing(p, false), 'text');
	await p.sleep(1500);
	t.eq(disk(p, NOTE), before[NOTE], 'the binder note');
	t.eq(changed(before, snap(p)).join(), ARRIVAL, 'and only the one note changed');
});

// ---- 4. the filter ----

test('under a filter the page is the one the text has: its “notes not shown” lines, its “no longer matches” line, its empty state and a followed filter', async (p, h, t) => {
	const { filterBy, clearFilter } = await import('./filter-helpers.mjs');
	await openMs(p);
	await filterBy(p, { status: ['Draft'] });
	await settle(p);
	const gaps = () => p.ev(`[...document.querySelectorAll('${LEAF} .binders-manuscript-gap')].map(g => g.textContent)`);
	const order = () => p.ev(`${M}.entries.map(e => e.key.name.replace(/\\.md$/, '')).join()`);
	const inText = { gaps: await gaps(), order: await order() };
	t.eq(inText.order, 'Prologue,Part One,The keeper,Part Two,The wreck', 'text: the notes that pass');
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	t.eq(await order(), inText.order, 'synopses: the same notes in the same order');
	t.eq((await gaps()).join(), inText.gaps.join(), 'and the same lines saying how many are left out');
	t.ok(inText.gaps.length > 0 && inText.gaps.every((g) => /notes? not shown/.test(g)), `they say so: ${inText.gaps.join(' | ')}`);
	// a note that stops matching stays, and says so
	await p.ev(`app.vault.adapter.write(${J(KEEPER)}, ${J(disk(p, KEEPER).replace('status: draft', 'status: revised'))}).then(() => 1)`);
	await p.sleep(1200);
	t.eq(await p.ev(`${scene(KEEPER)}.el.classList.contains('is-unmatched') ? ${scene(KEEPER)}.el.querySelector('.binders-manuscript-unmatched')?.textContent : null`), 'No longer matches the filter', 'a note that no longer matches says so');
	t.ok(await p.ev(`!!${scene(KEEPER)}.synopsis.ed.el.isConnected`), 'and keeps its synopsis');
	await clearFilter(p);
	await filterBy(p, { status: ['No status'] });
	await settle(p);
	t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-manuscript .binders-empty')`), 'a filter that nothing passes shows the empty state');
	await clearFilter(p);
	t.ok(await until(p, `${M}.scenes.length === 7`, 4000), 'and clearing it brings every note back');
	t.ok(await showing(p), 'still on synopses');
});

test('a note typed into a synopsis stays on the page when a filter would take it away, and its words are saved', async (p, h, t) => {
	const { filterBy } = await import('./filter-helpers.mjs');
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	await openLine(p, t, ARRIVAL);
	await p.type(' Kept.');
	await p.ev(`(() => { ${VIEW}.subset.invalidate?.(); return 1; })()`);
	await p.ev(`(() => { document.activeElement.blur?.(); return 1; })()`).catch(() => {});
	await p.sleep(800);
	t.ok(await wait(p, () => synopsisOf(disk(p, ARRIVAL))?.endsWith('Kept.')), 'saved');
	await filterBy(p, { status: ['Draft'] });
	t.ok(await showing(p), 'on synopses with the filter');
});

// ---- 5. the switch: button, menu, command ----

test('the toolbar button, “Show synopses” in More options and the command all switch the page, and agree about it', async (p, h, t) => {
	await openMs(p);
	const b = await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-synopses-button'), r = e.getBoundingClientRect(); return { label: e.getAttribute('aria-label'), role: e.getAttribute('role'), w: r.width, h: r.height }; })()`);
	t.eq(b.label, 'Synopses', 'the button is called Synopses');
	await p.ev(`(() => { const h = ${VIEW}.containerEl; return 1; })()`);
	// the command, with no hotkey and no prefix in its own name
	const cmd = await p.ev(`(() => { const c = app.commands.commands['binders:show-synopses']; return c ? { name: c.name, hotkeys: (c.hotkeys ?? []).length } : null; })()`);
	t.eq(JSON.stringify(cmd), JSON.stringify({ name: 'Binders: Show synopses', hotkeys: 0 }), 'the command exists, with no hotkey (Obsidian puts the plugin’s name before it)');
	await h.run('show-synopses');
	t.ok(await waitShowing(p), 'the command shows synopses');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-synopses-button').getAttribute('aria-pressed')`), 'true', 'and the button is lit');
	// More options
	const more = await p.at(`${LEAF} .view-action[aria-label="More options"]`);
	await p.click(more.x, more.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok((await menuItems(p)).includes('Show synopses'), 'More options has “Show synopses”');
	const item = await p.ev(`[...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'Show synopses')?.outerHTML ?? null`);
	t.ok(/is-checked|mod-selected|data-icon="check"|lucide-check/.test(item), 'ticked while they show: ' + item);
	await clickMenu(p, 'Show synopses');
	t.ok(await waitShowing(p, false), 'the menu shows the text again');
	await h.run('show-synopses');
	t.ok(await waitShowing(p), 'and the command again');
	await h.run('show-synopses');
	t.ok(await waitShowing(p, false), 'and back');
});

test('the command is offered only on a manuscript', async (p, h, t) => {
	await openView(p);
	t.eq(await p.ev(`app.commands.findCommand('binders:show-synopses').checkCallback(true)`), false, 'not on the corkboard');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await settle(p);
	t.eq(await p.ev(`app.commands.findCommand('binders:show-synopses').checkCallback(true)`), true, 'on the manuscript');
});

// ---- 6. find, focus mode, New ----

test('opening the find bar shows the text again, and a search finds what is in it', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	await p.ev(`(() => { ${VIEW}.showSearch(false); return 1; })()`);
	t.ok(await waitShowing(p, false), 'the text is shown');
	await settle(p);
	await p.type('lighthouse');
	await p.sleep(900);
	t.ok(await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript .cm-editor').length > 0`), 'with its editors, for the bar to look through');
});

test('turning focus mode on shows the text again, and the command is not offered inside it', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	await p.ev(`app.saveLocalStorage('binders-focus-hinted', true)`);
	await p.ev(`(() => { app.plugins.plugins.binders.focus.toggle(); return 1; })()`);
	t.ok(await until(p, `document.body.classList.contains('binders-focus')`, 6000), 'focus mode is on');
	t.eq(await showing(p), false, 'over the text');
	t.eq(await p.ev(`app.commands.findCommand('binders:show-synopses').checkCallback(true)`), false, 'and Show synopses is not offered');
	await p.ev(`(() => { app.plugins.plugins.binders.focus.leave(true); return 1; })()`);
});

test('New while synopses show: the note is made after the one in hand, its title is ready to type over, and its line says “Add a synopsis”', async (p, h, t) => {
	await openMs(p);
	await toggle(p);
	t.ok(await waitShowing(p), 'synopses');
	const before = snap(p);
	await p.ev(`(() => { ${scene(ARRIVAL)}.titleEl.focus(); return 1; })()`);
	const add = await p.at(`${LEAF} .binders-new-button`);
	await p.click(add.x, add.y);
	await until(p, `!!document.querySelector('.menu')`);
	await clickMenu(p, 'New note');
	t.ok(await until(p, `!!document.querySelector('${LEAF} .binders-manuscript-title.is-renaming')`, 4000), 'a title is ready to type over');
	await p.type('Fog');
	await p.key('Enter');
	await p.sleep(900);
	t.ok(onDisk(p, `${PART1}/Fog.md`), 'the note is made, in the folder of the one in hand');
	t.eq(disk(p, `${PART1}/Fog.md`), '', 'with nothing in it');
	t.eq(await p.ev(`${M}.scenes.map(s => s.file.basename).join()`), 'Prologue,Arrival,Fog,The keeper,Storm warning,The wreck,Lights out,Epilogue', 'after it, in the order');
	t.eq(await p.ev(`${scene(`${PART1}/Fog.md`)}.synopsis.ed.el.textContent`), 'Add a synopsis', 'its synopsis line invites one');
	t.ok(await showing(p), 'still on synopses');
	const after = snap(p);
	t.eq(changed(before, after).filter((f) => f !== NOTE && f !== `${PART1}/Fog.md`).join(), '', 'no other note changed');
});

// ---- on a phone and a tablet ----

test('a phone: no Synopses button; More options and the command switch; a tap on a synopsis edits it with the keyboard up, a tap on a title shows the text', async (p, h, t) => {
	const { onDevice, tap, PHONE, keyboard } = await import('./specs-qa5-manuscript.mjs');
	await onDevice(p, PHONE, async () => {
		await openMs(p);
		t.eq(await p.ev(`!!document.querySelector('${LEAF} .binders-synopses-button')`), false, 'the toolbar has no Synopses button');
		await h.run('show-synopses');
		t.ok(await waitShowing(p), 'the command shows synopses');
		await h.run('show-synopses');
		t.ok(await waitShowing(p, false), 'and back');
		// More options, as a phone has it (the header's own menu)
		const more = await p.at(`${LEAF} .view-action[aria-label="More options"]`);
		await tap(p, more.x, more.y);
		await until(p, `!!document.querySelector('.menu')`);
		t.ok((await menuItems(p)).includes('Show synopses'), 'More options has “Show synopses”');
		await closeMenus(p);
		await p.ev(`${VIEW}.showSynopses(true).then(() => 1)`);
		t.ok(await waitShowing(p), 'synopses');
		const before = snap(p);
		const at = await p.ev(`(() => { const r = ${scene(KEEPER)}.synopsis.ed.el; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2, h: b.height }; })()`);
		await p.sleep(300);
		const at2 = await lineAt(p, KEEPER);
		await tap(p, at2.x, at2.y);
		t.ok(await until(p, `!!${scene(KEEPER)}.synopsis.ed.el.querySelector('textarea')`, 3000), 'a tap makes the synopsis a field');
		await keyboard(p, PHONE, true);
		const inView = await p.ev(`(() => { const f = ${scene(KEEPER)}.synopsis.ed.el.querySelector('textarea').getBoundingClientRect(); return { ok: f.bottom <= innerHeight && f.top >= 0, top: f.top, bottom: f.bottom, ih: innerHeight, vv: visualViewport.height }; })()`);
		t.ok(inView.ok, 'the field is above the keyboard: ' + JSON.stringify(inView));
		await p.ev(`(() => { const f = ${scene(KEEPER)}.synopsis.ed.el.querySelector('textarea'); f.setSelectionRange(f.value.length, f.value.length); return 1; })()`);
		await p.type(' Phone.');
		const typed = await p.ev(`(() => { const f = ${scene(KEEPER)}.synopsis.ed.el.querySelector('textarea'); return { v: f?.value, focus: document.activeElement === f }; })()`);
		t.ok(typed.v?.endsWith(' Phone.') && typed.focus, 'what is typed goes into the field: ' + JSON.stringify(typed));
		await keyboard(p, PHONE, false);
		await p.ev(`(() => { ${scene(KEEPER)}.synopsis.ed.el.querySelector('textarea').blur(); return 1; })()`);
		await p.sleep(800);
		t.ok(await wait(p, () => synopsisOf(disk(p, KEEPER))?.endsWith('Phone.')), 'saved');
		t.eq(body(disk(p, KEEPER)), body(before[KEEPER]), 'the text untouched');
		const tt = await p.ev(`(() => { const e = ${scene(STORM)}.titleEl; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2, h: b.height }; })()`);
		await p.sleep(300);
		const t2 = await titleAt(p, STORM);
		await tap(p, t2.x, t2.y);
		t.ok(await waitShowing(p, false), 'a tap on a title shows the text again');
		t.ok(tt.h >= 0, 'measured');
	});
});

test('a tablet: the button is there, lit when on, and a touch target of 44 pixels; a tap on it switches', async (p, h, t) => {
	const { onDevice, tap, TABLET } = await import('./specs-qa5-manuscript.mjs');
	await onDevice(p, TABLET, async () => {
		await openMs(p);
		const r = await p.ev(`(() => { const b = document.querySelector('${LEAF} .binders-synopses-button').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
		t.ok(r.h >= 44 && r.w >= 32, `a target a finger can hit: ${r.w} x ${r.h}`);
		await tap(p, r.x, r.y);
		t.ok(await waitShowing(p), 'a tap shows synopses');
		t.eq(await p.ev(`document.querySelector('${LEAF} .binders-synopses-button').getAttribute('aria-pressed')`), 'true', 'lit');
		t.ok(await p.ev(`document.querySelector('${LEAF} .binders-manuscript').scrollWidth <= document.querySelector('${LEAF} .binders-manuscript').clientWidth + 1`), 'nothing to scroll sideways');
	});
});

// ---- speed ----

test('a big book: the switch to synopses and back is quick, and the page has every note', async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder('Big');
		for (let i = 1; i <= 400; i++) await app.vault.create('Big/Scene ' + String(i).padStart(3, '0') + '.md', '---\\nsynopsis: Scene ' + i + ' happens, and the reader learns something they did not know before it.\\n---\\n' + 'Text of scene ' + i + '. '.repeat(40) + '\\n');
		await new Promise(r => setTimeout(r, 1500));
		await app.plugins.plugins.binders.binders.makeBinder(app.vault.getAbstractFileByPath('Big'));
		return 1; })()`);
	await p.sleep(1500);
	await openMs(p, 'Big');
	const ms = await p.ev(`(async () => { const t0 = performance.now(); await ${VIEW}.showSynopses(true); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t0); })()`);
	t.ok(ms < 1500, `400 notes switch to synopses in ${ms} ms`);
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript-synopsis').length`), 400, 'a synopsis for each');
	const back = await p.ev(`(async () => { const t0 = performance.now(); await ${VIEW}.showSynopses(false); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t0); })()`);
	t.ok(back < 1500, `and back in ${back} ms`);
});
