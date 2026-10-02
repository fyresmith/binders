// QA round 6, size and extremes: binders far beyond what the other specs use (5,000 notes in one folder, 5,000 over 200
// folders, 20 deep, 300 subfolders, a note of 100,000 words, a Longform project of 1,000 scenes, awkward names), driven
// in every mode and in the file explorer. Each test prints its numbers ("scale ..."), and checks the binder note's
// `contents` on disk entry by entry, in order, with nothing dropped or doubled.
// Tests named "BUG: ..." / "PERF: ..." / "UX: ..." were written to fail until what they show is fixed.
import { B, PL, VIEW, clickMenu, closeMenus, contents, file, flush, j, menuItems, read, split, tidy, until, viewState } from './view-helpers.mjs';

export const specs = [];
/** Runs a test, then clears what it made: the views are closed and each big folder is deleted in one go (one delete
    at a time, with a view open, takes minutes on a binder of 5,000 notes: see the diagnosis tests). */
const ROOTS = ['Big', 'Parts', 'Many', 'Deep', 'Names', 'Huge', 'Empty', 'Long', 'LF', 'Cycle', 'Scroll', 'Edit', ...Array.from({ length: 10 }, (_, k) => 'Tab' + k), ...[250, 500, 1000, 2000].map((n) => 'Keep' + n)];
const withTidy = (fn) => async (p, h, t) => {
	try { await fn(p, h, t); } finally {
		await p.ev(`(async () => { app.workspace.detachLeavesOfType('binders-view'); for (const r of ${j(ROOTS)}) { const f = app.vault.getAbstractFileByPath(r); if (f) await app.vault.delete(f, true); } })().then(() => 1)`).catch(() => {});
		await tidy(p);
	}
};
const test = (name, fn) => specs.push({ name: 'qa6 scale: ' + name, fn: withTidy(fn) });
const bug = (name, fn) => specs.push({ name: 'BUG: qa6 scale: ' + name, fn: withTidy(fn) });
const perf = (name, fn) => specs.push({ name: 'PERF: qa6 scale: ' + name, fn: withTidy(fn) });
const ux = (name, fn) => specs.push({ name: 'UX: qa6 scale: ' + name, fn: withTidy(fn) });

const LEAF = '.workspace-leaf.mod-active';
const say = (label, o) => console.log(`    scale ${label} ${j(o)}`);
const step = (m) => { if (process.env.QA6_SAY) console.log(`    ${new Date().toISOString().slice(11, 19)} ${m}`); };

// =====================================================================================================================
// helpers
// =====================================================================================================================

/** Makes a binder in the page. `items` is the JS source of an array of { path (inside root), text }; `order` the source
    of the contents list (default: every item's path without ".md", in the order given, folders as "dir/"). Files are
    written through the adapter in parallel batches, as an external app (a sync) would. Returns the ms it took to write
    and the ms until the store and the metadata cache had settled. */
export async function make(p, root, itemsSrc, { order = null, binderNote = true, extra = '', settle = true, timeout = 120000 } = {}) {
	const t0 = Date.now();
	const n = await p.ev(`(async () => {
		const root = ${j(root)}, items = (${itemsSrc});
		const a = app.vault.adapter, dirs = new Set([root]);
		for (const it of items) { const parts = it.path.split('/'); parts.pop(); let d = root; for (const x of parts) { d += '/' + x; dirs.add(d); } }
		for (const d of [...dirs].sort((x, y) => x.length - y.length)) { try { await a.mkdir(d); } catch (e) { if (!/exist/i.test(String(e))) throw e; } }
		for (let i = 0; i < items.length; i += 40) await Promise.all(items.slice(i, i + 40).map(it => a.write(root + '/' + it.path, it.text)));
		const seen = new Set(), list = [];
		for (const it of items) {
			const parts = it.path.replace(/\\.md$/, '').split('/');
			for (let k = 1; k < parts.length; k++) { const d = parts.slice(0, k).join('/') + '/'; if (!seen.has(d)) { seen.add(d); list.push(d); } }
			list.push(parts.join('/'));
		}
		const contents = ${order ? `(${order})` : 'list'};
		if (${j(binderNote)}) await a.write(root + '/' + root.split('/').pop() + '.md', '---\\nbinder: 1\\n' + ${j(extra)} + 'contents:\\n' + contents.map(c => '  - ' + (/^[#!&*%@\`>|{\\[?:,'"-]|: | #|^\\s|\\s$/.test(c) ? JSON.stringify(c) : c)).join('\\n') + '\\n---\\n');
		return items.length;
	})()`);
	const wrote = Date.now() - t0;
	if (!settle) return { n, wrote };
	const ok = await until(p, `(() => { const f = app.vault.getAbstractFileByPath(${j(root)}); return !!f && ${B}.scenes(f)?.length >= ${n} && app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(root + '/')})).every(f => app.metadataCache.getFileCache(f)); })()`, timeout);
	if (!ok) throw new Error('the binder did not settle: ' + await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath(${j(root)}) ?? app.vault.getRoot())?.length`));
	return { n, wrote, settled: Date.now() - t0 };
}

const timed = (p, expr) => p.ev(`(async () => { const t = performance.now(); await (${expr}); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t); })()`);
const heap = (p) => p.ev(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1`);
const dom = (p) => p.ev(`document.getElementsByTagName('*').length`);

/** Opens the view on a folder in the mode and options given; returns ms until the first card/row/editor is there. */
async function show(p, folder, mode, options = {}) {
	const sel = { corkboard: '.binders-card[data-path]', outliner: '.binders-outliner-row', manuscript: '.binders-manuscript .cm-editor' }[mode];
	const lanes = options.arrange === 'label';
	const t0 = Date.now();
	await p.ev(`(async () => { await ${B}.ready; const f = app.vault.getAbstractFileByPath(${j(folder)}); const leaf = app.workspace.getLeavesOfType('binders-view')[0] ?? null; if (!leaf) { await ${PL}.openBinder(f, false); } const l = app.workspace.getLeavesOfType('binders-view')[0]; app.workspace.setActiveLeaf(l, { focus: true }); await l.setViewState({ type: 'binders-view', active: true, state: { folder: ${j(folder)}, mode: ${j(mode)}, options: ${j(options)} } }); })().then(() => 1)`);
	const ok = await until(p, `!!document.querySelector('${LEAF} ${lanes ? '.binders-lanes .binders-card[data-path], .binders-lanes > .binders-lane' : sel}')`, 60000);
	const first = Date.now() - t0;
	await p.ev(`new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))).then(() => 1)`);
	return { ok: !!ok, ms: Date.now() - t0, first };
}
const count = (p, sel) => p.ev(`document.querySelectorAll(${j(LEAF + ' ' + sel)}).length`);

/** The order of a folder's items on disk: contents of its binder note, exactly. */
const onDisk = (p, root) => contents(p, `${root}/${root.split('/').pop()}.md`);

/** The expected contents of a flat folder, checked entry by entry against the disk. */
function sameList(t, got, want, what) {
	let bad = got.length === want.length ? -1 : Math.min(got.length, want.length);
	if (bad < 0) for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) { bad = i; break; }
	t.ok(bad < 0, `${what}: ${got.length} entries, expected ${want.length}` + (bad >= 0 ? `; first difference at ${bad}: got ${j(got[bad])}, expected ${j(want[bad])}` : ''));
}
const dupes = (list) => list.length - new Set(list).size;

const flat = (n, extra = '') => `Array.from({ length: ${n} }, (_, i) => ({ path: 'N' + String(i + 1).padStart(5, '0') + '.md', text: ${extra || `'---\\nsynopsis: Note ' + (i + 1) + '\\nstatus: ' + ['draft', 'revised', 'done'][i % 3] + '\\nlabel: ' + ['Red', 'Blue', 'Green', ''][i % 4] + '\\n---\\nBody of note ' + (i + 1) + ' with a few words in it.\\n'`} }))`;
const names = (n) => Array.from({ length: n }, (_, i) => 'N' + String(i + 1).padStart(5, '0'));
const R = 'Big';

// =====================================================================================================================
// 1. 5,000 notes in one folder
// =====================================================================================================================

perf('5,000 notes in one folder: every mode opens, and the numbers', async (p, h, t) => {
	const out = {};
	out.heap0 = await heap(p);
	out.make = await make(p, R, flat(5000));
	sameList(t, await onDisk(p, R), names(5000), 'the binder note as made');
	out.cork = await show(p, R, 'corkboard');
	out.corkCards = await count(p, '.binders-card[data-path]');
	out.across = await show(p, R, 'corkboard', { arrange: 'label', lines: 'across' });
	out.acrossCards = await count(p, '.binders-card[data-path]');
	out.down = await show(p, R, 'corkboard', { arrange: 'label', lines: 'down' });
	out.downCards = await count(p, '.binders-card[data-path]');
	out.outliner = await show(p, R, 'outliner');
	out.rows = await count(p, '.binders-outliner-row');
	out.dom = await dom(p);
	out.manuscript = await show(p, R, 'manuscript');
	out.editors = await count(p, '.binders-manuscript .cm-editor');
	out.msDom = await dom(p);
	out.heap1 = await heap(p);
	say('5,000 flat', out);
	t.eq(out.corkCards, 5000, 'the corkboard draws every card');
	t.eq(out.rows, 5000, 'the outliner draws every row');
});

// =====================================================================================================================
// 2. The corkboard of 5,000 cards: select, drag one and fifty, undo, redo, filter, delete
// =====================================================================================================================

const CARD = (path) => `${LEAF} .binders-card[data-path="${path}"]`;
const seeCard = async (p, path) => {
	await p.ev(`(() => { const c = document.querySelector(${j(CARD(path))}); c?.scrollIntoView({ block: 'center' }); return 1; })()`);
	await p.sleep(120);
	return p.at(CARD(path));
};
const selectedCards = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-selected')].map(c => c.dataset.path)`);
const undoCmd = (p, redo = false) => p.ev(`(() => { const c = app.commands.findCommand('binders:${redo ? 'redo' : 'undo'}-move'); if (!c.checkCallback(true)) return false; app.commands.executeCommandById(c.id); return c.name; })()`);
/** Picks up a card by its middle, carries it to the left half of another and, if asked, lets go. Returns the drop line. */
async function carry(p, from, onto, { drop = true } = {}) {
	const a0 = await seeCard(p, from), a = { x: a0.l + 8, y: a0.t + 6 };
	await p.move(a.x, a.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
	await p.move(a.x + 12, a.y + 4, 4, { buttons: 1 });
	// (the board scrolls under the pointer as it nears an edge: the target is found again where it is now)
	const b = await p.at(CARD(onto));
	if (!b) throw new Error('the target card is not on screen: ' + onto);
	const x = b.l + 12, y = b.y;
	await p.move(x, y, 14, { buttons: 1 });
	await p.sleep(250);
	const line = await p.ev(`(() => { const l = document.querySelector('.binders-drop-indicator.is-active'); if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
	const ghost = await p.ev(`document.querySelector('.binders-drag-count')?.textContent ?? null`);
	if (!line && process.env.QA6_SAY) console.log('    no line', j(await p.ev(`({ ghost: document.querySelectorAll('.binders-drag-ghost').length, ind: [...document.querySelectorAll('.binders-drop-indicator')].map(e => e.className + ' ' + JSON.stringify(e.getBoundingClientRect())), over: document.querySelector('.is-being-dragged-over')?.dataset.path })`)), j({ a, b, x, y }));
	const tgt = await p.at(CARD(onto));
	if (drop) { await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await p.sleep(300); }
	return { line, ghost, tgt };
}
const settled = async (p, root, ms = 20000) => { await flush(p); await p.sleep(200); return onDisk(p, root); };

perf('5,000 cards: select all, drag 1 and 50 to where the line showed, undo and redo, all exact on disk', async (p, h, t) => {
	const out = {};
	await make(p, R, flat(5000));
	const all = names(5000);
	await show(p, R, 'corkboard');
	// scrolling: how long a frame takes while the board is scrolled in big steps
	out.scroll = await p.ev(`(async () => { const s = document.querySelector('${LEAF} .binders-corkboard') ?? document.querySelector('${LEAF} .binders-view-content'); let el = document.querySelector('${LEAF} .binders-card').parentElement; while (el && el.scrollHeight <= el.clientHeight + 5) el = el.parentElement; if (!el) return null; const frames = []; let last = performance.now(); for (let i = 0; i < 40; i++) { el.scrollTop += 600; await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); frames.push(Math.round(n - last)); last = n; } el.scrollTop = 0; frames.sort((a, b) => a - b); return { median: frames[20], p95: frames[38], max: frames[39], height: el.scrollHeight }; })()`);
	// one card, a few places on
	const a = await seeCard(p, 'Big/N00001.md');
	await p.click(a.l + 8, a.t + 6); // (not its middle: a click on the synopsis edits it)
	let r = await carry(p, 'Big/N00001.md', 'Big/N00005.md');
	out.drag1 = { line: !!r.line };
	t.ok(r.line, 'a drop line showed while carrying one card among 5,000');
	let want = [...all]; want.splice(0, 1); want.splice(3, 0, 'N00001');
	let got = await settled(p, R);
	sameList(t, got, want, 'one card dragged before the fifth');
	t.eq(dupes(got), 0, 'nothing doubled');
	// 50 selected (a click and a shift-click), dragged far down within the screen's reach
	const first = await seeCard(p, 'Big/N00100.md');
	await p.click(first.l + 8, first.t + 6);
	const last = await seeCard(p, 'Big/N00149.md');
	await p.click(last.l + 8, last.t + 6, { modifiers: 8 });
	const sel = await selectedCards(p);
	t.eq(sel.length, 50, 'a shift-click selects fifty cards');
	const t0 = Date.now();
	await seeCard(p, 'Big/N00100.md');
	const before50 = await settled(p, R);
	r = await carry(p, 'Big/N00100.md', 'Big/N00095.md', { drop: false });
	out.count = r.ghost;
	t.eq(r.ghost, '50', 'the drag says how many it carries');
	t.ok(r.line, 'a line shows where they would land');
	const lineY = r.line?.y, tgt = r.tgt;
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tgt.l + 12, y: tgt.y, button: 'left', clickCount: 1 });
	await p.sleep(400);
	got = await settled(p, R);
	out.drop50 = Date.now() - t0;
	t.ok(r.line && Math.abs(lineY - tgt.t) < 40 || Math.abs((r.line?.x ?? 0) - tgt.l) < 40, 'the line was at the left of the target card: ' + j({ line: r.line, tgt: { l: tgt.l, t: tgt.t } }));
	const moved = before50.slice(before50.indexOf('N00100'), before50.indexOf('N00100') + 50);
	const rest = before50.filter((x) => !moved.includes(x));
	const at = rest.indexOf('N00095');
	const wantB = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
	sameList(t, got, wantB, 'fifty cards dragged before card 95 land there, in order');
	t.eq(dupes(got), 0, 'none doubled');
	// undo, redo
	const tu = Date.now();
	await undoCmd(p); got = await settled(p, R); out.undo = Date.now() - tu;
	sameList(t, got, before50, 'undo puts the fifty back');
	await undoCmd(p, true); got = await settled(p, R);
	sameList(t, got, wantB, 'redo moves them again');
	await undoCmd(p); got = await settled(p, R);
	sameList(t, got, before50, 'undo again');
	await undoCmd(p); got = await settled(p, R);
	sameList(t, got, all, 'a second undo puts the first card back, so the binder is as it was made');
	say('5,000 corkboard', out);
});

// =====================================================================================================================
// 3. The outliner of 5,000 rows: select all, sort and "Make this the binder order", undo, delete 500
// =====================================================================================================================

const O = `${LEAF} .binders-outliner`;
const ROW = (path) => `${O} .binders-outliner-row[data-path="${path}"]`;
const seeRow = async (p, path) => { await p.ev(`document.querySelector(${j(ROW(path) + ' .binders-outliner-name')})?.scrollIntoView({ block: 'center' })`); await p.sleep(120); return p.at(ROW(path) + ' .binders-outliner-name'); };
const sortBy = async (p, col, item) => { const th = await p.at(`${O} .binders-outliner-th[data-col="${col}"]`); await p.right(th.x, th.y); await clickMenu(p, item); await p.sleep(300); };
const confirm = async (p, button = 'Delete') => { await until(p, `!!document.querySelector('.modal')`, 5000); const text = await p.ev(`document.querySelector('.modal')?.textContent ?? ''`); await p.ev(`[...document.querySelectorAll('.modal button')].find(b => b.textContent === ${j(button)})?.click()`); return text; };

perf('5,000 rows in the outliner: select all, sort, delete 500', async (p, h, t) => {
	const out = {};
	await make(p, R, flat(5000));
	const all = names(5000);
	await show(p, R, 'outliner'); step("await show(p, R, 'outliner');");
	// select all
	const r1 = await seeRow(p, 'Big/N00001.md');
	await p.click(r1.x, r1.y);
	const t0 = Date.now();
	await p.key('a', 'ctrl');
	await until(p, `document.querySelectorAll('${O} .binders-outliner-row.is-selected').length === 5000`, 10000);
	out.selectAll = Date.now() - t0;
	t.eq(await count(p, '.binders-outliner-row.is-selected'), 5000, 'Ctrl+A selects every row');
	// sort descending by title: the rows follow
	const ts = Date.now();
	await sortBy(p, 'title', 'Sort descending');
	out.sort = Date.now() - ts;
	t.eq(await p.ev(`document.querySelector('${O} .binders-outliner-row').dataset.path`), 'Big/N05000.md', 'sorted: the last note first');
	t.eq(j(await onDisk(p, R)), j(all), 'sorting does not touch the binder note');
	await sortBy(p, 'title', 'Binder order');
	// delete 500: a click, a shift-click on the 500th
	const a = await seeRow(p, 'Big/N00101.md');
	await p.click(a.x, a.y);
	const b = await seeRow(p, 'Big/N00600.md');
	await p.click(b.x, b.y, { modifiers: 8 });
	t.eq(await count(p, '.binders-outliner-row.is-selected'), 500, 'a shift-click selects 500 rows');
	await p.key('Delete'); step("await p.key('Delete');");
	const said = await confirm(p); step('const said = await confirm(p);');
	out.said = said;
	const t3 = Date.now();
	const ok = await until(p, `!app.vault.getAbstractFileByPath('Big/N00101.md') && !app.vault.getAbstractFileByPath('Big/N00600.md')`, 60000);
	out.deleteFiles = Date.now() - t3;
	t.ok(ok, 'the notes are gone');
	await until(p, `document.querySelectorAll('${O} .binders-outliner-row').length === 4500`, 30000);
	out.deleteRows = Date.now() - t3;
	const got = await settled(p, R);
	out.deleteDone = Date.now() - t3;
	const want = all.filter((x) => { const n = Number(x.slice(1)); return n < 101 || n > 600; });
	sameList(t, got, want, 'the binder note lists the 4,500 left, in order');
	t.eq(await count(p, '.binders-outliner-row'), 4500, 'the outliner shows 4,500 rows');
	t.eq(await p.ev(`app.vault.getFolderByPath('Big').children.filter(f => f.extension === 'md').length - 1`), 4500, 'and 4,500 notes are on disk');
	say('5,000 outliner', out);
});

// =====================================================================================================================
// 4. Shapes: 5,000 notes over 200 folders, 20 deep, 300 subfolders; every mode opens
// =====================================================================================================================

const pad = (n, w) => String(n).padStart(w, '0');
const NOTE_TEXT = `'---\\nsynopsis: Note ' + i + '\\nstatus: ' + ['draft', 'revised', 'done'][i % 3] + '\\nlabel: ' + ['Red', 'Blue', 'Green', ''][i % 4] + '\\n---\\nBody of note ' + i + ' with a few words in it.\\n'`;

/** Opens every mode on a folder and prints what a writer would feel: the time to the first card/row/editor, and the DOM. */
async function survey(p, root, label, { modes = ['corkboard', 'across', 'down', 'outliner', 'manuscript'] } = {}) {
	const out = { heap: await heap(p) };
	const opts = { corkboard: ['corkboard', {}], across: ['corkboard', { arrange: 'label', lines: 'across' }], down: ['corkboard', { arrange: 'label', lines: 'down' }], outliner: ['outliner', {}], manuscript: ['manuscript', {}] };
	for (const m of modes) {
		const [mode, o] = opts[m];
		const r = await show(p, root, mode, o);
		out[m] = { ok: r.ok, ms: r.ms, cards: await count(p, '.binders-card[data-path]'), rows: await count(p, '.binders-outliner-row'), editors: await count(p, '.cm-editor'), dom: await dom(p) };
	}
	out.heapEnd = await heap(p);
	say(label, out);
	return out;
}

perf('5,000 notes over 200 folders: every mode opens; the board shows 200 stacks', async (p, h, t) => {
	const made = await make(p, 'Parts', `Array.from({ length: 5000 }, (_, i) => ({ path: 'Part ' + String(Math.floor(i / 25)).padStart(3, '0') + '/Scene ' + String(i).padStart(4, '0') + '.md', text: ${NOTE_TEXT} }))`);
	say('5,000 over 200 folders: files written, store settled (ms)', made);
	const o = await survey(p, 'Parts', '5,000 over 200 folders');
	for (const m of ['corkboard', 'across', 'down', 'outliner', 'manuscript']) t.ok(o[m].ok, `${m} opens`);
	t.eq(o.corkboard.cards, 200, 'the board: 200 stacks');
	t.eq(o.outliner.rows, 5200, 'the outliner: 200 folders and 5,000 notes');
	const contents0 = await onDisk(p, 'Parts');
	t.eq(contents0.length, 5200, 'the binder note has 5,200 entries');
	t.eq(dupes(contents0), 0, 'none twice');
});

perf('folders nested 20 deep: every mode opens, the outliner indents, the binder note keeps every path', async (p, h, t) => {
	const dirs = Array.from({ length: 20 }, (_, k) => Array.from({ length: k + 1 }, (_, d) => 'L' + pad(d + 1, 2)).join('/'));
	const items = `${j(dirs)}.flatMap((d, k) => [1, 2, 3].map(i => ({ path: d + '/Deep ' + (k + 1) + '-' + i + '.md', text: 'Note at depth ' + (k + 1) + '\\n' })))`;
	await make(p, 'Deep', items);
	const o = await survey(p, 'Deep', 'nested 20 deep');
	t.eq(o.outliner.rows, 80, 'the outliner: 20 folders and 60 notes');
	const levels = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-row')].map(r => +r.getAttribute('aria-level'))`).catch(() => []);
	await show(p, 'Deep', 'outliner');
	const lv = await p.ev(`Math.max(...[...document.querySelectorAll('${LEAF} .binders-outliner-row')].map(r => +r.getAttribute('aria-level')))`);
	t.eq(lv, 21, 'the deepest row is at level 21');
	// the manuscript: 60 scenes, each under its folders
	await show(p, 'Deep', 'manuscript');
	say('deep levels', { max: lv });
	const list = await onDisk(p, 'Deep');
	t.eq(list.length, 80, '80 entries in the binder note');
	t.eq(list[list.length - 1], dirs[19] + '/Deep 20-3', 'the deepest note is last');
});

perf('300 subfolders in one folder: the board shows 300 stacks, each naming what it holds', async (p, h, t) => {
	await make(p, 'Many', `Array.from({ length: 300 * 3 }, (_, i) => ({ path: 'Folder ' + String(Math.floor(i / 3)).padStart(3, '0') + '/Note ' + (i % 3 + 1) + ' of ' + Math.floor(i / 3) + '.md', text: '---\\nsynopsis: Synopsis ' + i + '\\n---\\nWords ' + i + '\\n' }))`);
	const o = await survey(p, 'Many', '300 subfolders');
	t.eq(o.corkboard.cards, 300, '300 stacks');
	await show(p, 'Many', 'corkboard');
	const s = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-stack')].slice(0, 2).map(c => c.textContent)`);
	say('stack text', s);
});

// =====================================================================================================================
// 5. Awkward names
// =====================================================================================================================

const NAMES = [
	'🌊 Tide', 'q\u0323\u0301 (marks)', 'Café (composed)', 'مرحبا بالعالم', 'שלום עולם', 'mixed العربية and English', 'dots..', 'a..b', 'Case', 'case', 'CASE',
	'a#b', 'a^b', 'a[b]', 'a]b', 'a|b', '50%', 'a%20b', '#hash first', '^caret first', '[[wiki]]', '- dash first', 'yes', 'no', 'null', 'true', '123', '1e3', '~tilde', "it's", 'say "hi"', 'a: b', 'a:b', '{brace}', '*star*', '&amp', '!bang', '@at', '`tick`', '> quote', '| pipe first', '? question', '%percent first', 'x'.repeat(200), 'Names 2', 'binder', 'Binder', 'contents',
];

test('awkward names: every note is listed once, the binder note round-trips through disk, a reorder keeps every one', async (p, h, t) => {
	const made = await p.ev(`(async () => {
		const names = ${j(NAMES)}, a = app.vault.adapter, made = [], failed = [];
		await a.mkdir('Names');
		for (const n of names) { try { await a.write('Names/' + n + '.md', '---\\nsynopsis: ' + n.length + '\\n---\\nBody of ' + n.length + '\\n'); made.push(n); } catch (e) { failed.push([n, String(e).slice(0, 80)]); } }
		const listed = new Set((await a.list('Names')).files.map(f => f.slice(6).replace(/\\.md$/, '')));
		return { made: made.filter(n => listed.has(n)), failed, missing: made.filter(n => !listed.has(n)) };
	})()`);
	say('names made', { made: made.made.length, failed: made.failed });
	const want = NAMES.filter((n) => !made.failed.some((x) => x[0] === n)); // (the listing reports a decomposed name composed: it is not a missing file)
	// the binder note is written by Binders itself ("Make this folder a binder"), so the quoting is its own
	await p.ev(`(async () => { await ${B}.ready; await ${B}.makeBinder(app.vault.getAbstractFileByPath('Names')); })().then(() => 1)`);
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Names'))?.length >= ${want.length}`, 15000);
	const fmList = () => p.ev(`(async () => { await new Promise(r => setTimeout(r, 400)); const f = app.vault.getAbstractFileByPath('Names/Names.md'); return app.metadataCache.getFileCache(f)?.frontmatter?.contents ?? null; })()`);
	const shown = () => p.ev(`${B}.orderedChildren(app.vault.getAbstractFileByPath('Names')).map(f => f.basename)`);
	await p.sleep(500);
	let list = await fmList();
	const esc = (x) => x.replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
	say('names listed', { listed: list?.length, want: want.length, extra: list.filter((x) => !want.includes(x)).map(esc), missing: want.filter((x) => !list.includes(x)).map(esc), files: await p.ev(`app.vault.getFolderByPath('Names').children.map(f => f.name).filter(n => /^\\.|cafe|Caf/i.test(n)).map(n => [...n].map(c => c.charCodeAt(0) > 126 ? '\\\\u' + c.charCodeAt(0).toString(16) : c).join(''))`) });
	t.eq(list.length, want.length, 'every note is in the list');
	t.eq(dupes(list), 0, 'none twice');
	t.eq(j([...list].sort()), j([...want].sort()), 'the names read back exactly as they were written (' + j(want.filter((n) => !list.includes(n))) + ' missing; ' + j(list.filter((n) => !want.includes(n))) + ' extra)');
	t.eq(j(await shown()), j(list), 'the store shows them in the list’s order');
	// every mode draws them all
	const o = await survey(p, 'Names', 'names', { modes: ['corkboard', 'outliner', 'manuscript'] });
	t.eq(o.corkboard.cards, want.length, 'the board has a card for each');
	t.eq(o.outliner.rows, want.length, 'the outliner has a row for each');
	// reorder: the outliner's sort made the order, read back from a fresh read of the disk
	await show(p, 'Names', 'outliner');
	await p.sleep(600);
	await sortBy(p, 'title', 'Sort descending');
	await sortBy(p, 'title', 'Make this the binder order');
	await flush(p);
	list = await fmList();
	t.eq(list.length, want.length, 'after “Make this the binder order”: every note still listed');
	t.eq(dupes(list), 0, 'none twice');
	t.eq(j([...list].sort()), j([...want].sort()), 'and spelled as before');
	t.eq(j(await shown()), j(list), 'the store agrees with the disk');
	await undoCmd(p);
	await flush(p);
	t.eq(j([...(await fmList())].sort()), j([...want].sort()), 'undo too');
});

// =====================================================================================================================
// 6. Huge notes, empty notes, huge synopses and titles
// =====================================================================================================================

const lorem = (words) => `Array.from({ length: ${words} }, (_, i) => ['the', 'keeper', 'climbed', 'stair', 'again', 'while', 'sea', 'kept', 'on', 'at', 'rocks'][i % 11] + (i % 17 === 16 ? '.\\n\\n' : '')).join(' ')`;

perf('a note of 100,000 words and one of 1 MB among ordinary ones: every mode opens; a typed letter is saved without losing a byte', async (p, h, t) => {
	const out = {};
	const items = `[
		{ path: 'A big.md', text: '---\\nsynopsis: Huge\\n---\\n' + ${lorem(100000)} + '\\n' },
		{ path: 'B one meg.md', text: '---\\nsynopsis: A megabyte\\n---\\n' + ('x'.repeat(79) + '\\n').repeat(13200) },
		...Array.from({ length: 30 }, (_, i) => ({ path: 'C' + String(i).padStart(2, '0') + '.md', text: 'Ordinary note ' + i + '\\n' })),
	]`;
	await make(p, 'Huge', items);
	const sizes = await p.ev(`(async () => ({ a: (await app.vault.adapter.read('Huge/A big.md')).length, b: (await app.vault.adapter.read('Huge/B one meg.md')).length }))()`);
	out.sizes = sizes;
	const before = { a: await read(p, 'Huge/A big.md'), b: await read(p, 'Huge/B one meg.md') };
	for (const m of ['corkboard', 'outliner']) { const r = await show(p, 'Huge', m); out[m] = r.ms; }
	const words = await p.ev(`(async () => { await new Promise(r => setTimeout(r, 1500)); const c = document.querySelector('${LEAF} .binders-card[data-path="Huge/A big.md"] .binders-card-words')?.textContent ?? document.querySelector('${LEAF} .binders-outliner-row[data-path="Huge/A big.md"] [data-col="words"]')?.textContent; return c; })()`);
	out.bigWords = words;
	const ms = await show(p, 'Huge', 'manuscript');
	out.manuscript = ms.ms;
	await p.sleep(1500);
	out.editors = await count(p, '.binders-manuscript .cm-editor');
	out.dom = await dom(p);
	// type a letter at the very start of the first scene (the 100,000-word one) and check the disk
	const at = await p.ev(`(() => { const e = document.querySelector('${LEAF} .binders-manuscript .cm-content'); e.focus(); const r = e.getBoundingClientRect(); return { x: r.x + 40, y: r.y + 10 }; })()`);
	await p.click(at.x, at.y);
	await p.key('Home', 'ctrl');
	const t0 = Date.now();
	await p.type('Q');
	out.typeMs = Date.now() - t0;
	// (the page saves a moment after the last key, as Obsidian's own editor does: waited for, and timed)
	await until(p, `app.vault.adapter.read('Huge/A big.md').then(x => x.length !== ${before.a.length})`, 15000);
	out.savedMs = Date.now() - t0;
	await p.sleep(300);
	const after = await read(p, 'Huge/A big.md');
	const body = before.a.replace(/^(---\n[\s\S]*?\n---\n)/, '');
	const aBody = after.replace(/^(---\n[\s\S]*?\n---\n)/, '');
	t.eq(aBody.length, body.length + 1, 'the 100,000-word note gained exactly one character');
	t.ok(aBody === 'Q' + body || aBody.includes('Q') && aBody.replace('Q', '') === body, 'and nothing else changed');
	t.eq(await read(p, 'Huge/B one meg.md'), before.b, 'the 1 MB note is untouched');
	say('huge notes', out);
});

perf('2,000 empty notes: every mode opens, counts are zero, nothing is invented', async (p, h, t) => {
	await make(p, 'Empty', `Array.from({ length: 2000 }, (_, i) => ({ path: 'E' + String(i).padStart(4, '0') + '.md', text: '' }))`);
	const o = await survey(p, 'Empty', '2,000 empty');
	t.eq(o.corkboard.cards, 2000, 'a card for each');
	t.eq(o.outliner.rows, 2000, 'a row for each');
	const sizes = await p.ev(`(async () => { let n = 0; for (const f of app.vault.getFolderByPath('Empty').children) if (f.extension === 'md' && f.stat.size > 0 && f.name !== 'Empty.md') n++; return n; })()`);
	t.eq(sizes, 0, 'no empty note was written to');
	t.eq((await onDisk(p, 'Empty')).length, 2000, '2,000 entries');
});

perf('5,000-character synopses and 250-character titles (as long as a file name can be): cards stay in their grid, rows in their lines, nothing runs off the page', async (p, h, t) => {
	await make(p, 'Long', `Array.from({ length: 60 }, (_, i) => ({ path: ('T' + String(i).padStart(2, '0') + ' ' + 'long title '.repeat(27)).slice(0, 250) + '.md', text: '---\\nsynopsis: ' + 'a very long synopsis, ' .repeat(230).slice(0, 5000) + '\\n---\\nBody\\n' }))`);
	await show(p, 'Long', 'corkboard');
	await p.sleep(500);
	const m = await p.ev(`(() => { const cs = [...document.querySelectorAll('${LEAF} .binders-card[data-path]')]; const hs = cs.map(c => Math.round(c.getBoundingClientRect().height)), ws = cs.map(c => Math.round(c.getBoundingClientRect().width)); const board = cs[0].parentElement.getBoundingClientRect(); return { n: cs.length, hMax: Math.max(...hs), hMin: Math.min(...hs), wMax: Math.max(...ws), over: cs.filter(c => c.scrollWidth > c.clientWidth + 1).length, boardW: Math.round(board.width), docOver: document.documentElement.scrollWidth > innerWidth }; })()`);
	say('long text cards', m);
	t.eq(m.n, 60, '60 cards');
	t.ok(m.hMax < 400, `the tallest card is ${m.hMax}px, not the whole synopsis`);
	t.ok(m.wMax <= 400, `no card wider than ${m.wMax}`);
	t.ok(!m.docOver, 'the page does not scroll sideways');
	await show(p, 'Long', 'outliner');
	await p.sleep(400);
	const r = await p.ev(`(() => { const rs = [...document.querySelectorAll('${LEAF} .binders-outliner-row')]; return { n: rs.length, hMax: Math.max(...rs.map(r => Math.round(r.getBoundingClientRect().height))) }; })()`);
	say('long text rows', r);
	t.eq(r.n, 60, '60 rows');
	t.ok(r.hMax < 120, `the tallest row is ${r.hMax}px`);
});

// =====================================================================================================================
// 7. A Longform project of 1,000 scenes with deep indents
// =====================================================================================================================

/** The project's scenes as the index says them: [title, indent] pairs, read from the metadata cache. */
const lfScenes = (p) => p.ev(`(() => { const f = app.vault.getAbstractFileByPath('LF/Index.md'), out = []; const walk = (a, d) => { for (const x of a) Array.isArray(x) ? walk(x, d + 1) : out.push([String(x), d]); }; walk(app.metadataCache.getFileCache(f)?.frontmatter?.longform?.scenes ?? [], 0); return out; })()`);

perf('a Longform project of 1,000 scenes, indented up to 8 deep: every mode opens, a move writes only the scene list, nothing is lost', async (p, h, t) => {
	const out = {};
	const N = 1000;
	await p.ev(`(async () => {
		const a = app.vault.adapter; await a.mkdir('LF');
		const items = Array.from({ length: ${N} }, (_, i) => ({ path: 'LF/Scene ' + String(i).padStart(4, '0') + '.md', text: '---\\nsynopsis: Scene ' + i + '\\n---\\nText of scene ' + i + '\\n' }));
		for (let i = 0; i < items.length; i += 40) await Promise.all(items.slice(i, i + 40).map(it => a.write(it.path, it.text)));
		await a.write('LF/Index.md', '---\\nlongform:\\n  format: scenes\\n  title: Big\\n  workflow: Default Workflow\\n  sceneFolder: /\\n  scenes: []\\n  ignoredFiles: []\\n---\\nIndex body\\n');
		await new Promise(r => setTimeout(r, 1000));
		const flat = items.map((_, i) => ({ title: 'Scene ' + String(i).padStart(4, '0'), indent: [0, 1, 2, 3, 2, 1, 4, 5, 6, 7, 8, 8, 7, 0, 0, 3][i % 16] }));
		// nested arrays as Longform writes them
		const root = [], at = [root]; let cur = 0;
		for (const s of flat) { if (s.indent > cur) { while (cur < s.indent) { const inner = []; at[cur].push(inner); at[++cur] = inner; } } else cur = s.indent; at[cur].push(s.title); }
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath('LF/Index.md'), fm => { fm.longform.scenes = root; });
	})().then(() => 1)`);
	t.ok(await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('LF'))?.length === ${N}`, 30000), 'the project’s 1,000 scenes are found');
	await p.sleep(800);
	const before = await lfScenes(p);
	t.eq(before.length, N, 'the index lists 1,000 scenes');
	t.eq(Math.max(...before.map((s) => s[1])), 8, 'down to indent 8');
	const idxBefore = await read(p, 'LF/Index.md');
	const o = await survey(p, 'LF', 'longform 1,000', { modes: ['corkboard', 'across', 'outliner', 'manuscript'] });
	t.eq(o.corkboard.cards, N, 'a card for each scene');
	t.eq(o.outliner.rows, N, 'a row for each scene');
	// a move from the keyboard on the board: the first scene one place on
	await show(p, 'LF', 'corkboard');
	const c = await p.at(`${LEAF} .binders-card[data-path="LF/Scene 0000.md"]`);
	await p.click(c.l + 8, c.t + 6);
	await p.key('ArrowRight', 'alt');
	await p.sleep(500);
	await flush(p);
	await p.sleep(400);
	const after = await lfScenes(p);
	t.eq(after.length, N, 'still 1,000 scenes');
	t.eq(dupes(after.map((s) => s[0])), 0, 'none twice');
	t.eq(j(after.slice(2).map((s) => s.join(':'))), j(before.slice(2).map((s) => s.join(':'))), 'the rest untouched, with their indents');
	t.eq(after[1][0], 'Scene 0000', 'the first scene moved one place on');
	say('longform', { o: { c: o.corkboard.ms, a: o.across.ms, o: o.outliner.ms, m: o.manuscript.ms }, first: after.slice(0, 3) });
	const idxAfter = await read(p, 'LF/Index.md');
	t.eq(idxAfter.replace(/^---\n[\s\S]*?\n---\n/, ''), idxBefore.replace(/^---\n[\s\S]*?\n---\n/, ''), 'the index note’s own text is untouched');
});

// =====================================================================================================================
// 8. Ten binders in ten tabs; repeated mode switches; the manuscript's live editors
// =====================================================================================================================

perf('ten binders of 300 notes open in ten tabs: each opens, switching tabs is quick, each keeps its own notes', async (p, h, t) => {
	const out = { open: [], heap0: await heap(p), dom0: await dom(p) };
	for (let k = 0; k < 10; k++) await make(p, 'Tab' + k, flat(300, `'---\\nsynopsis: Tab ${k} note ' + i + '\\n---\\nBody ' + i + '\\n'`), { settle: k === 9 });
	await until(p, `app.vault.getFolderByPath('Tab9') && ${B}.scenes(app.vault.getFolderByPath('Tab9'))?.length === 300`, 30000);
	await p.sleep(1500);
	for (let k = 0; k < 10; k++) {
		const t0 = Date.now();
		await p.ev(`${PL}.openBinder(app.vault.getAbstractFileByPath('Tab${k}'), 'tab').then(() => 1)`);
		await until(p, `!!document.querySelector('${LEAF} .binders-card[data-path^="Tab${k}/"]')`, 15000);
		out.open.push(Date.now() - t0);
	}
	out.leaves = await p.ev(`app.workspace.getLeavesOfType('binders-view').length`);
	out.heap1 = await heap(p); out.dom1 = await dom(p);
	t.eq(out.leaves, 10, 'ten tabs');
	// switch between them: the visible one shows its own cards
	const sw = [];
	for (const k of [3, 7, 0, 9, 5]) {
		const t0 = Date.now();
		await p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-view').find(l => l.getViewState().state.folder === 'Tab${k}'); app.workspace.setActiveLeaf(l, { focus: true }); return 1; })()`);
		await until(p, `document.querySelector('${LEAF} .binders-card[data-path]')?.dataset.path.startsWith('Tab${k}/')`, 5000);
		sw.push(Date.now() - t0);
		t.eq(await count(p, '.binders-card[data-path]'), 300, `tab ${k} shows its 300 cards`);
		t.eq(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].every(c => c.dataset.path.startsWith('Tab${k}/'))`), true, `and only its own`);
	}
	out.switch = sw;
	// one move in one tab shows in no other
	say('ten tabs', out);
});

perf('mode switches, ten rounds on a binder of 1,000 notes: the heap and the page’s node count stop growing', async (p, h, t) => {
	await make(p, 'Cycle', flat(1000));
	const modes = ['corkboard', 'outliner', 'manuscript', 'corkboard-label'];
	const heaps = [], doms = [], times = [];
	await show(p, 'Cycle', 'corkboard');
	for (let round = 0; round < 10; round++) {
		const t0 = Date.now();
		for (const m of ['outliner', 'manuscript', 'corkboard']) await show(p, 'Cycle', m);
		await show(p, 'Cycle', 'corkboard', { arrange: 'label', lines: 'across' });
		await show(p, 'Cycle', 'corkboard');
		times.push(Date.now() - t0);
		await p.sleep(400);
		// (a collection first, if the page lets us)
		await p.ev(`(() => { try { window.gc?.(); } catch {} return 1; })()`);
		heaps.push(await heap(p)); doms.push(await dom(p));
	}
	say('mode switches', { heaps, doms, times, editors: await count(p, '.cm-editor') });
	t.ok(doms[9] <= doms[2] * 1.05, `the node count is steady: ${doms.join(', ')}`);
	t.ok(heaps[9] < heaps[2] + 60, `the heap does not run away: ${heaps.join(', ')} MB`);
});

perf('the manuscript of 1,000 notes keeps few editors alive and few nodes, however far it is scrolled', async (p, h, t) => {
	await make(p, 'Scroll', flat(1000, `'---\\nsynopsis: n' + i + '\\n---\\n' + ('Line of text in note ' + i + '\\n\\n').repeat(6)`));
	await show(p, 'Scroll', 'manuscript');
	await p.sleep(1500);
	const samples = [];
	for (const y of [0, 0.25, 0.5, 0.75, 0.99]) {
		await p.ev(`(() => { let el = document.querySelector('${LEAF} .binders-manuscript'); while (el && el.scrollHeight <= el.clientHeight + 5) el = el.parentElement; if (!el) return 0; el.scrollTop = (el.scrollHeight - el.clientHeight) * ${y}; return 1; })()`);
		await p.sleep(1200);
		samples.push({ y, editors: await count(p, '.binders-manuscript .cm-editor'), dom: await dom(p) });
	}
	say('manuscript scroll', samples);
	t.ok(Math.max(...samples.map((s) => s.editors)) <= 40, `live editors stay few: ${samples.map((s) => s.editors).join(', ')}`);
});

// =====================================================================================================================
// 9. How a whole-folder reorder scales: “Make this the binder order” on 250, 500, 1,000 and 2,000 notes
// =====================================================================================================================

perf('“Make this the binder order” on 250, 500, 1,000 and 2,000 notes: the time grows with the size, and the result is exact', async (p, h, t) => {
	const times = {};
	for (const n of [250, 500, 1000, 2000]) {
		const root = 'Keep' + n;
		await make(p, root, flat(n));
		await show(p, root, 'outliner');
		await sortBy(p, 'title', 'Sort descending');
		const t0 = Date.now();
		await sortBy(p, 'title', 'Make this the binder order');
		const done = await until(p, `(async () => { const f = app.vault.getAbstractFileByPath(${j(root)}); const o = ${B}.orderedChildren(f); return o[0]?.basename === 'N${pad(n, 5)}' && o.length === ${n}; })()`, 170000);
		times[n] = Date.now() - t0;
		await flush(p);
		times[n + 'flushed'] = Date.now() - t0;
		const got = await onDisk(p, root);
		sameList(t, got, names(n).reverse(), `${n} notes reversed`);
		if (!done) break;
		if (times[n] > 60000) break;
	}
	say('keep order', times);
	t.ok(times[1000] < 8000, `a thousand notes: ${times[1000]} ms (limit 8000)`);
});

// =====================================================================================================================
// 10. The file explorer on big folders
// =====================================================================================================================

const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;

perf('the file explorer opens a folder of 5,000 notes and one of 200 folders, in binder order', async (p, h, t) => {
	const out = {};
	await make(p, 'Big', `Array.from({ length: 5000 }, (_, i) => ({ path: 'N' + String(i + 1).padStart(5, '0') + '.md', text: 'x' + i + '\\n' }))`, { order: `list.slice().reverse()` });
	await make(p, 'Parts', `Array.from({ length: 5000 }, (_, i) => ({ path: 'Part ' + String(Math.floor(i / 25)).padStart(3, '0') + '/Scene ' + String(i).padStart(4, '0') + '.md', text: 'x' + i + '\\n' }))`);
	await p.ev(`(() => { app.workspace.leftSplit.expand(); app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); ${EXP}.fileItems['Big']?.setCollapsed(true); ${EXP}.fileItems['Parts']?.setCollapsed(true); return 1; })()`);
	await p.sleep(500);
	// The explorer draws only the rows in view, so the rows in the page are a few dozen however many notes there are:
	// what it lists, and in what order, is read from the folder's own list of items (the list it draws from).
	const listed = (p, folder) => p.ev(`(() => { const it = ${EXP}.fileItems[${j(folder)}], kids = it?.vChildren?.children ?? ${EXP}.getSortedFolderItems(app.vault.getAbstractFileByPath(${j(folder)})); return kids.map(k => k.file.name); })()`);
	const drawn = (sel, prefix) => p.ev(`[...document.querySelectorAll(${j(sel)})].filter(e => e.dataset.path.startsWith(${j(prefix)}) && !e.dataset.path.slice(${prefix.length}).includes('/')).map(e => e.dataset.path.split('/').pop())`);
	out.expandBig = await timed(p, `${EXP}.fileItems['Big'].setCollapsed(false)`);
	const big = await listed(p, 'Big');
	out.bigListed = big.length;
	out.bigDrawn = (await drawn('.nav-file-title[data-path]', 'Big/')).length;
	out.bigOrder = (await drawn('.nav-file-title[data-path]', 'Big/')).slice(0, 3);
	out.collapse = await timed(p, `${EXP}.fileItems['Big'].setCollapsed(true)`);
	out.expandParts = await timed(p, `${EXP}.fileItems['Parts'].setCollapsed(false)`);
	const parts = await listed(p, 'Parts');
	out.partsListed = parts.length;
	out.partsDrawn = (await drawn('.nav-folder-title[data-path]', 'Parts/')).length;
	out.expandOne = await timed(p, `${EXP}.fileItems['Parts/Part 007'].setCollapsed(false)`);
	const seven = await listed(p, 'Parts/Part 007');
	out.dom = await dom(p);
	say('explorer', out);
	sameList(t, big, names(5000).reverse().map((n) => n + '.md'), 'the explorer lists all 5,000 notes, in the binder’s order (reversed here), not by name');
	t.ok(out.bigDrawn > 0 && out.bigDrawn < 500, `it draws the rows in view, not all 5,000: ${out.bigDrawn}`);
	t.eq(j(out.bigOrder), j(['N05000.md', 'N04999.md', 'N04998.md']), 'the first rows drawn are the first of the binder');
	sameList(t, parts, Array.from({ length: 200 }, (_, k) => 'Part ' + pad(k, 3)), 'and the 200 folders, in order (the binder note is not listed)');
	sameList(t, seven, Array.from({ length: 25 }, (_, k) => 'Scene ' + pad(175 + k, 4) + '.md'), 'a folder of it opened: its 25 notes in order');
	for (const [what, ms] of [['opening the folder of 5,000 notes', out.expandBig], ['opening the folder of 200 folders', out.expandParts], ['opening one of them', out.expandOne], ['closing the folder of 5,000', out.collapse]]) t.ok(ms < 1500, `${what} took ${ms} ms (limit 1500)`);
});

perf('5,000 rows: “Make this the binder order” (the whole folder reversed) finishes, and the list on disk is exact', async (p, h, t) => {
	await make(p, R, flat(5000));
	await show(p, R, 'outliner');
	await sortBy(p, 'title', 'Sort descending');
	const t0 = Date.now();
	await sortBy(p, 'title', 'Make this the binder order');
	const done = await until(p, `${B}.orderedChildren(app.vault.getAbstractFileByPath('Big'))[0]?.basename === 'N05000'`, 280000);
	const ms = Date.now() - t0;
	await flush(p);
	say('keep order 5,000', { done: !!done, ms, flushed: Date.now() - t0 });
	sameList(t, await onDisk(p, R), names(5000).reverse(), '5,000 reversed');
	t.ok(ms < 15000, `5,000 notes took ${ms} ms (limit 15000)`);
});

// =====================================================================================================================
// 11. Deleting 500 selected notes
// =====================================================================================================================

const wantWithout = (all, from, to) => all.filter((x) => { const n = Number(x.slice(1)); return n < from || n > to; });

perf('deleting 500 selected notes of 2,000 from the outliner: it finishes, the binder note lists the 1,500 left in order', async (p, h, t) => {
	const out = {};
	await make(p, R, flat(2000));
	const all = names(2000);
	await show(p, R, 'outliner');
	const a = await seeRow(p, 'Big/N00101.md');
	await p.click(a.x, a.y);
	const b = await seeRow(p, 'Big/N00600.md');
	await p.click(b.x, b.y, { modifiers: 8 });
	t.eq(await count(p, '.binders-outliner-row.is-selected'), 500, 'a shift-click selects 500 rows');
	await p.key('Delete');
	out.said = (await confirm(p)).slice(0, 80);
	const t0 = Date.now();
	const ok = await until(p, `!app.vault.getAbstractFileByPath('Big/N00600.md')`, 150000);
	out.filesGone = Date.now() - t0;
	await until(p, `document.querySelectorAll('${O} .binders-outliner-row').length === 1500`, 150000);
	out.rowsGone = Date.now() - t0;
	const got = await settled(p, R);
	out.done = Date.now() - t0;
	say('delete 500 of 2,000', out);
	t.ok(ok, 'the notes are gone');
	sameList(t, got, wantWithout(all, 101, 600), 'the binder note lists the 1,500 left, in order');
	t.eq(await count(p, '.binders-outliner-row'), 1500, 'the outliner shows 1,500 rows');
	t.ok(out.done < 20000, `deleting 500 notes took ${out.done} ms (limit 20000)`);
});

perf('(diagnosis) trashing 500 of 2,000 notes in a loop with no binder view open, then with the outliner open', async (p, h, t) => {
	const out = {};
	await make(p, R, flat(2000));
	const trash = (from, to) => p.ev(`(async () => { const t = performance.now(); for (let n = ${from}; n <= ${to}; n++) await app.fileManager.trashFile(app.vault.getAbstractFileByPath('Big/N' + String(n).padStart(5, '0') + '.md')); await new Promise(r => setTimeout(r, 50)); return Math.round(performance.now() - t); })()`);
	out.closed100 = await trash(1, 100);
	await show(p, R, 'outliner');
	out.outliner100 = await trash(101, 200);
	await show(p, R, 'corkboard');
	out.cork100 = await trash(201, 300);
	say('trash loop of 100 each, of 2,000', out);
	const got = await settled(p, R);
	sameList(t, got, wantWithout(names(2000), 1, 300), 'the list is exact after 300 deletions');
});

perf('(diagnosis) deleting a whole binder of 2,000 notes in 80 folders: with Binders on, and with it off', async (p, h, t) => {
	const out = {};
	const items = `Array.from({ length: 2000 }, (_, i) => ({ path: 'Part ' + String(Math.floor(i / 25)).padStart(3, '0') + '/Scene ' + String(i).padStart(4, '0') + '.md', text: 'x' + i + '\\n' }))`;
	const del = () => p.ev(`(async () => { const t = performance.now(); await app.vault.delete(app.vault.getAbstractFileByPath('Parts'), true); return Math.round(performance.now() - t); })()`);
	await make(p, 'Parts', items);
	out.on = await del();
	await p.sleep(500);
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	await make(p, 'Parts', items, { settle: false, binderNote: false });
	await p.sleep(500);
	out.off = await del();
	await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
	say('delete a binder of 2,000 notes in 80 folders (ms)', out);
	t.ok(out.on < 3 * out.off + 3000, `with Binders on ${out.on} ms, off ${out.off} ms`);
});

perf('(diagnosis) deleting one folder of 25 notes inside a binder of 5,000 notes in 200 folders, by what is open', async (p, h, t) => {
	const out = {};
	await make(p, 'Parts', `Array.from({ length: 5000 }, (_, i) => ({ path: 'Part ' + String(Math.floor(i / 25)).padStart(3, '0') + '/Scene ' + String(i).padStart(4, '0') + '.md', text: 'x' + i + '\\n' }))`);
	let k = 0;
	const del = () => p.ev(`(async () => { const t = performance.now(); await app.vault.delete(app.vault.getAbstractFileByPath('Parts/Part ${pad(k++, 3)}'), true); await new Promise(r => setTimeout(r, 400)); return Math.round(performance.now() - t); })()`);
	const burst = async () => { const r = []; for (let i = 0; i < 4; i++) r.push(await del()); return r; };
	out.noView = await burst();
	await show(p, 'Parts', 'corkboard'); out.corkboard = await burst();
	await show(p, 'Parts', 'outliner'); out.outliner = await burst();
	await show(p, 'Parts', 'manuscript'); out.manuscript = await burst();
	say('delete a 25-note folder (ms each, incl. 400 ms wait)', out);
	// (the list is written before the binder is cleared away: deleted under a write, Obsidian logs the note it can't read)
	await flush(p); await p.sleep(300);
	const list = await onDisk(p, 'Parts');
	t.eq(list.length, 5200 - 16 * 26, 'the binder note lists what is left: 184 folders and their 4,600 notes');
	t.eq(dupes(list), 0, 'none twice');
	t.eq(list[0], 'Part 016/', 'the sixteen folders deleted are gone from it, the rest in order');
	for (const [mode, ms] of Object.entries(out)) t.ok(Math.max(...ms) < 400 + 1500, `${mode}: deleting a folder of 25 notes took ${Math.max(...ms) - 400} ms at most (limit 1500)`);
});

/** What the page is blocked for after one note is changed from outside (a sync, an editor in another tab): the
    longest task and the total blocked time over the next two seconds, in ms. */
const blockedBy = (p, change) => p.ev(`(async () => {
	const long = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(Math.round(e.duration)); }); po.observe({ type: 'longtask', buffered: false });
	await (${change});
	await new Promise(r => setTimeout(r, 2500));
	po.disconnect();
	return { longest: Math.max(0, ...long), total: long.reduce((a, b) => a + b, 0), tasks: long.length };
})()`);

for (const N of [1000, 5000]) {
	perf(`one note changed from outside while the view is open on ${N.toLocaleString('en-US')} notes: how long the page is blocked, per mode`, async (p, h, t) => {
		const out = {};
		await make(p, 'Edit', flat(N));
		let k = 0;
		const edit = () => `app.vault.adapter.write('Edit/N${pad(10 + k++, 5)}.md', '---\\nsynopsis: Changed ' + Date.now() + '\\n---\\nChanged body\\n')`;
		for (const [label, mode, o] of [['corkboard', 'corkboard', {}], ['across', 'corkboard', { arrange: 'label', lines: 'across' }], ['outliner', 'outliner', {}], ['manuscript', 'manuscript', {}]]) {
			await show(p, 'Edit', mode, o);
			await p.sleep(1500);
			out[label] = await blockedBy(p, edit());
		}
		say(`external edit of one note, ${N} notes`, out);
		t.ok(true, 'measured');
	});
}

bug('a note whose name starts or ends with a space keeps its place in the binder’s order', async (p, h, t) => {
	// (such names come from a sync or another app; cleanPath trims every segment of a list entry, so the entry no longer names the file)
	const want = [' lead space', 'Middle', 'trail space ', 'Last'];
	await make(p, 'Names', `${j(want)}.map((n) => ({ path: n + '.md', text: 'Body of ' + n.length + '\\n' }))`);
	await p.sleep(600);
	const shown = await p.ev(`${B}.orderedChildren(app.vault.getAbstractFileByPath('Names')).map(f => f.basename)`);
	t.eq(j(shown), j(want), 'the binder shows the notes in the order its list gives');
	// and a reorder keeps them: Last goes to the front
	await p.ev(`${B}.move(app.vault.getAbstractFileByPath('Names/Last.md'), app.vault.getAbstractFileByPath('Names'), 0).then(() => 1)`);
	await flush(p);
	await p.sleep(500);
	const list = await p.ev(`(async () => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Names/Names.md'))?.frontmatter?.contents)()`);
	t.eq(j(list), j(['Last', ...want.slice(0, 3)]), 'after moving one note to the front, the list is exact');
});
