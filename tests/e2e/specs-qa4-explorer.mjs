// QA round 4: everything Binders does inside Obsidian's own file explorer and to the vault's files, and the plugin's
// lifecycle. Judged against how the stock explorer behaves.
// Tests named "BUG: …" fail on purpose until the bug they show is fixed, and "UX: …" until the roughness they show is
// smoothed; the rest are regressions for behaviour that was checked and is solid.
import { B, PL, NOTE, j, file, until, read, contents, flush, reload } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa4 explorer: ' + name, fn: withTidy(fn) });
const testRaw = (name, fn) => specs.push({ name: 'qa4 explorer: ' + name, fn });

export const L = 'The Lighthouse', LF = 'Longform demo';
export const EXP = `app.workspace.getLeavesOfType('file-explorer').find(l => l.getRoot() === app.workspace.leftSplit).view`;
export const FOLDERS = [L, `${L}/Part One`, `${L}/Part Two`];
export const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const KEEP_FILES = ['Prologue.md', 'Epilogue.md', 'The Lighthouse.md', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two/The wreck.md', 'Part Two/Lights out.md'].map((x) => `${L}/${x}`);
export const same = (t, a, b, m) => t.eq(j(a), j(b), m);
export const short = (a) => a.map((x) => (x ?? 'nothing').replace(L + '/', ''));

/** Removes every folder and non-note file a test made (the runner restores notes and settings), closes extra explorers
    and popout windows, clears the explorer's selection and puts its sort order back. */
export async function tidy(p) {
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 500, button: 'left', clickCount: 1 }); // a drag a failed test left held
	await p.ev(`(async () => {
		for (let i = 0; i < 3 && document.querySelector('.menu'); i++) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelectorAll('.menu').forEach(m => m.remove()); }
		document.querySelectorAll('.modal-close-button').forEach(b => b.click());
		if (!app.plugins.plugins.binders) { await app.plugins.enablePlugin('binders'); await new Promise(r => setTimeout(r, 600)); }
		const strays = []; app.workspace.iterateAllLeaves(l => { if (l.view.containerEl.ownerDocument !== document) strays.push(l); }); strays.forEach(l => l.detach()); // popout windows
		for (const l of app.workspace.getLeavesOfType('file-explorer')) if (l.getRoot() !== app.workspace.leftSplit) l.detach();
		if (!app.workspace.getLeavesOfType('file-explorer').length) { await app.workspace.getLeftLeaf(false).setViewState({ type: 'file-explorer' }); await new Promise(r => setTimeout(r, 400)); }
		const keep = new Set([...${j(FOLDERS)}, ${j(LF)}]), keepFiles = new Set(${j(KEEP_FILES)});
		for (const f of app.vault.getAllLoadedFiles().filter(f => !f.children && !keepFiles.has(f.path) && !f.path.startsWith(${j(LF + '/')}))) if (f.extension !== 'md' || !f.path.startsWith(${j(L + '/')})) await app.vault.delete(f);
		const extra = app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !keep.has(f.path));
		for (const f of extra.sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		for (const k of keep) if (!app.vault.getAbstractFileByPath(k)) await app.vault.createFolder(k);
		const e = ${EXP}; if (e.sortOrder && e.sortOrder !== 'alphabetical') e.setSortOrder('alphabetical');
		e.tree?.clearSelectedDoms?.();
		await ${B}.flush();
	})().then(() => 1)`);
	await p.sleep(150);
}
export const clearSelection = (p) => p.ev(`(() => { ${EXP}.tree?.clearSelectedDoms?.(); return 1; })()`);
/** The undo history is the plugin's, not a test's: each test starts with none. */
export const noHistory = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
export const withTidy = (fn) => async (p, h, t) => { try { await clearSelection(p); await noHistory(p); await fn(p, h, t); } finally { await tidy(p); } };

/** Makes notes, folders (a path ending in "/") and other files (text "BIN:") and waits for the cache. */
export const mk = (p, files, wait = 500) => p.ev(`(async () => { for (const [path, text] of ${j(Object.entries(files))}) { const dir = path.split('/').slice(0, -1).join('/'); if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir); if (path.endsWith('/')) continue; if (text === 'BIN:') await app.vault.createBinary(path, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer); else await app.vault.create(path, text); } await new Promise(r => setTimeout(r, ${wait})); })().then(() => 1)`);
/** The sidebar explorer's rows under a folder ('' for all), top to bottom, with the given folders expanded. */
export async function rows(p, under = L, expand = FOLDERS) {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = ${EXP}; app.workspace.revealLeaf(v.leaf); for (const f of ${j(expand)}) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(400);
	return p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => ${j(under)} === '' || x.startsWith(${j(under + '/')}))`);
}
const sel = (path) => `.tree-item-self[data-path="${path.replace(/["\\]/g, '\\$&')}"]`;
/** A row of the sidebar explorer: its centre and edges, and where its name starts. */
export const row = (p, path) => p.ev(`(() => { const e = ${EXP}.containerEl.querySelector(${j(sel(path))}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(), i = e.querySelector('.tree-item-inner').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height, name: i.left, nameR: i.right }; })()`);
export const listOnDisk = async (p, path = NOTE) => { await flush(p); await p.sleep(150); return contents(p, path); };
export const scenes = async (p, path = `${LF}/Index.md`) => { await flush(p); await p.sleep(300); return p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)}).frontmatter.longform.scenes)`); };
export const notices = (p) => p.ev(`(() => { const n = new Notice('probe'); const doc = n.noticeEl.ownerDocument; n.hide(); return [...doc.querySelectorAll('.notice')].map(e => e.textContent).filter(x => x !== 'probe'); })()`);
export const clearNotices = (p) => p.ev(`(() => { const n = new Notice('probe'); const doc = n.noticeEl.ownerDocument; n.hide(); doc.querySelectorAll('.notice').forEach(e => e.remove()); return 1; })()`);
export const texts = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
export const setSettings = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(300));
export const rename = (p, from, to) => p.ev(`app.fileManager.renameFile(${file(from)}, ${j(to)}).then(() => 1)`);
export const move = (p, item, folder, index) => p.ev(`${B}.move(${file(item)}, ${file(folder)}, ${index}).then(() => 1)`);
/** The store's order of a binder, depth first, as paths. */
export const order = (p, folder = L) => p.ev(`(() => { const out = []; const walk = (f) => { for (const c of ${B}.orderedChildren(f) ?? []) { out.push(c.path); if (c.children) walk(c); } }; walk(${file(folder)}); return out; })()`);
/** `put`, as a drop does: items (paths), into a folder, before an anchor (or null: last). */
export const put = (p, items, folder, anchor = null, wait = true) => p.ev(`(() => { const pr = ${B}.put(${j(items)}.map(x => app.vault.getAbstractFileByPath(x)), ${file(folder)}, ${anchor ? file(anchor) : 'null'}); return ${wait ? 'pr.then(() => 1)' : '(pr.catch(() => 0), 1)'}; })()`);
export const cmd = (p, id) => p.ev(`(() => { const c = app.commands.commands['binders:${id}']; if (!c.checkCallback(true)) return false; c.checkCallback(false); return true; })()`);
export const undo = async (p, wait = 500) => { const ok = await cmd(p, 'undo-move'); await p.sleep(wait); return ok; };
export const redo = async (p, wait = 500) => { const ok = await cmd(p, 'redo-move'); await p.sleep(wait); return ok; };

/** What shows while a drag is held: Binders' line, the hint under the pointer, and the folder Obsidian tints. */
export const held = (p) => p.ev(`(() => { const l = document.querySelector('.binders-explorer-drop')?.getBoundingClientRect(); return { line: l ? { y: l.top + l.height / 2, left: l.left, right: l.right } : null, hint: document.querySelector('.drag-ghost-action')?.textContent ?? '', ghost: document.querySelector('.drag-ghost-self')?.textContent ?? document.querySelector('.drag-ghost')?.textContent ?? null, into: [...document.querySelectorAll('.is-being-dragged-over')].map(e => e.dataset.path ?? e.querySelector('[data-path]')?.dataset.path) }; })()`);
/** Starts a real drag of an explorer row (a path, or a point) and holds it at `to`; returns what shows. */
export async function hold(p, from, to, steps = 8) {
	const a = typeof from === 'string' ? await row(p, from) : from;
	if (!a) throw new Error(`no row for ${from}`);
	await p.move(a.x, a.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
	await p.move(a.x + 6, a.y + 6, 3, { buttons: 1 });
	await p.move(to.x, to.y, steps, { buttons: 1 });
	await p.sleep(250);
	const seen = await held(p);
	seen.files = await p.ev(`(() => { const d = app.dragManager?.draggable; return d ? (d.files ?? [d.file]).map(f => f?.path) : null; })()`);
	return seen;
}
export const over = async (p, to, wait = 150) => { await p.move(to.x, to.y, 3, { buttons: 1 }); await p.sleep(wait); return held(p); };
export const release = async (p, to, wait = 500) => { await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 }); await p.sleep(wait); };
/** Lets go of a drag where nothing takes it: outside the window's content. */
export const cancel = async (p) => { await p.move(2, 2, 3, { buttons: 1 }); await release(p, { x: 2, y: 2 }, 200); };
export const drag = async (p, from, to) => { const seen = await hold(p, from, to); await release(p, to); return seen; };
export const top = (r) => ({ x: r.x, y: r.t + 3 }), bottom = (r) => ({ x: r.x, y: r.b - 3 });
/** Alt-clicks rows, which adds them to the explorer's selection, in the order given. */
export async function select(p, paths) { for (const f of paths) { const a = await row(p, f); await p.click(a.x, a.y, { modifiers: 1 }); await p.sleep(120); } }
/** The open menu, top to bottom: item titles, with "---" where a separator is. */
export const menuOf = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); if (!m) return null; return [...m.querySelectorAll('.menu-item, .menu-separator')].filter(e => e.offsetParent !== null || e.classList.contains('menu-separator')).map(e => e.classList.contains('menu-separator') ? '---' : (e.querySelector('.menu-item-title')?.textContent ?? '')); })()`);
export const closeMenu = async (p) => { for (let i = 0; i < 3 && (await p.ev(`document.querySelectorAll('.menu').length`)); i++) { await p.key('Escape'); await p.sleep(120); } };
export const rightClick = async (p, path) => { const a = await row(p, path); await p.right(a.x, a.y); await p.sleep(250); return menuOf(p); };
export const pick = async (p, title) => { const ok = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}); if (!it) return false; it.click(); return true; })()`); if (!ok) throw new Error(`no menu item “${title}”`); await p.sleep(300); };
export { B, PL, NOTE, j, file, until, read, contents, flush, reload };

const ord = async (p, f = L) => short(await order(p, f)).join(' | ');
const OTHER = { 'Other/Other.md': '---\nbinder: 1\ncontents:\n  - One\n  - Two\n  - Three\n---\n', 'Other/One.md': '1', 'Other/Two.md': '2', 'Other/Three.md': '3' };
const off = (p) => p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`).then(() => p.sleep(500));
const on = async (p) => { await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`); await until(p, `${PL}?.explorer?.status === 'patched'`, 5000); await p.sleep(400); };
/** Makes `fileManager.renameFile` fail the nth time it's called (a locked file, a sync conflict), while `run` runs. */
const failingRename = (n, run) => `(async () => { const fm = app.fileManager, orig = fm.renameFile; let k = 0; fm.renameFile = function (f, to) { if (++k === ${n}) return Promise.reject(new Error('EBUSY: the file is locked')); return orig.call(this, f, to); }; try { return await (${run}).then(() => 'ok', e => 'refused: ' + e.message); } finally { fm.renameFile = orig; } })()`;

// ================================================================================================================
// Dragging in the explorer: what was checked and holds
// ================================================================================================================

test('drag: several selected items, a folder and a note inside it among them, land in binder order; one undo takes it back', async (p, h, t) => {
	await rows(p);
	const o0 = await ord(p);
	// clicked out of order; Arrival is inside Part One, so it comes along with it
	await select(p, [`${L}/Part One/Arrival.md`, `${L}/Part One`, `${L}/Prologue.md`]);
	const s = await drag(p, `${L}/Part One`, bottom(await row(p, `${L}/Part Two/The wreck.md`)));
	t.eq(s.hint, 'Move after “The wreck”', 'the hint');
	t.eq(s.files?.length, 3, 'all three are dragged');
	same(t, await listOnDisk(p), ['Part Two/', 'Part Two/The wreck', 'Part Two/Prologue', 'Part Two/Part One/', 'Part Two/Part One/Arrival', 'Part Two/Part One/The keeper', 'Part Two/Part One/Storm warning', 'Part Two/Lights out', 'Epilogue'], 'Prologue, then Part One with everything in it, after The wreck');
	const o1 = await ord(p);
	t.ok(await undo(p), 'there is something to undo');
	t.eq(await ord(p), o0, 'one undo puts everything back');
	t.ok(await redo(p), 'and to redo');
	t.eq(await ord(p), o1, 'redo makes the move again');
});

test('drag: four notes selected across three folders go to one place in binder order, and back', async (p, h, t) => {
	await rows(p);
	const o0 = await ord(p);
	await select(p, [`${L}/Epilogue.md`, `${L}/Part Two/Lights out.md`, `${L}/Part One/Arrival.md`, `${L}/Prologue.md`]);
	const s = await drag(p, `${L}/Prologue.md`, top(await row(p, `${L}/Part One/Storm warning.md`)));
	t.eq(s.hint, 'Move before “Storm warning”', 'the hint');
	t.eq(s.ghost, '4 files', 'Obsidian’s own ghost');
	same(t, await listOnDisk(p), ['Part One/', 'Part One/The keeper', 'Part One/Prologue', 'Part One/Arrival', 'Part One/Lights out', 'Part One/Epilogue', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck'], 'in the order they showed, not the order they were clicked');
	t.ok(await undo(p, 700), 'undo');
	t.eq(await ord(p), o0, 'each is back in its own folder, beside its old neighbours');
});

test('drag: below the last item of nested folders, the pointer’s x picks the level, and the line shows it', async (p, h, t) => {
	await mk(p, { [`${L}/Part Two/Deep/X.md`]: 'x', [`${L}/Part Two/Deep/Y.md`]: 'y' });
	await move(p, `${L}/Part Two/Deep`, `${L}/Part Two`, 2); await flush(p);
	const all = [...FOLDERS, `${L}/Part Two/Deep`];
	await rows(p, L, all);
	const y = await row(p, `${L}/Part Two/Deep/Y.md`), deep = await row(p, `${L}/Part Two/Deep`), two = await row(p, `${L}/Part Two`);
	await hold(p, `${L}/Prologue.md`, { x: y.x, y: y.b - 3 });
	try {
		for (const [x, hint, left] of [[y.name + 20, 'Move after “Y”', y.name], [y.name - 2, 'Move after “Deep”', deep.name], [deep.name + 2, 'Move after “Deep”', deep.name], [deep.name - 2, 'Move after “Part Two”', two.name], [y.l + 2, 'Move after “Part Two”', two.name]]) {
			const s = await over(p, { x, y: y.b - 3 });
			t.eq(s.hint, hint, `pointer at x=${x}`);
			t.ok(s.line && Math.abs(s.line.left - left) <= 1 && Math.abs(s.line.y - y.b) <= 1.5, `the line starts where that level’s names start (${j(s.line)} vs ${left})`);
		}
		await over(p, { x: y.name - 2, y: y.b - 3 });
	} finally { await release(p, { x: y.name - 2, y: y.b - 3 }); }
	same(t, await listOnDisk(p), ['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Deep/', 'Part Two/Deep/X', 'Part Two/Deep/Y', 'Part Two/Prologue', 'Epilogue'], 'dropped one level out: after Deep, inside Part Two');
});

test('drag: a place the items can’t take says why under the pointer, shows no line, and moves nothing', async (p, h, t) => {
	await mk(p, { [`${L}/Part One/The wreck.md`]: 'another wreck', [`${L}/Part Two.md`]: 'a scene called Part Two', [`${L}/Part One/Dup.md`]: 'd1', [`${L}/Part Two/Dup.md`]: 'd2' });
	const o0 = await ord(p);
	const refused = async (from, to, hint, what) => {
		await rows(p);
		const s = await hold(p, from, top(await row(p, to)));
		try { t.eq(s.hint, hint, what + ': the hint'); t.eq(s.line, null, what + ': no line'); same(t, s.into, [], what + ': no folder tinted'); } finally { await release(p, top(await row(p, to))); }
		t.eq(await ord(p), o0, what + ': nothing moved');
	};
	await refused(`${L}/Part Two/The wreck.md`, `${L}/Part One/Arrival.md`, '“Part One” already has “The wreck”', 'a name already there');
	await refused(`${L}/Part Two.md`, `${L}/Part Two/The wreck.md`, '“Part Two” would become the note of the folder “Part Two”, not a scene in it', 'a note named like the folder');
	await select(p, [`${L}/Part One/Dup.md`, `${L}/Part Two/Dup.md`]);
	await refused(`${L}/Part One/Dup.md`, `${L}/Prologue.md`, 'Two of these are called “Dup”', 'two of one name');
	await clearSelection(p);
	// over the folder's middle the drop is Obsidian's: the note goes in, becomes the folder's note, and that is said
	await rows(p);
	const two = await row(p, `${L}/Part Two`);
	await clearNotices(p);
	await drag(p, `${L}/Part Two.md`, { x: two.x, y: two.y });
	await p.sleep(500);
	t.ok((await notices(p)).some((n) => /is now the note of the folder “Part Two”/.test(n)), 'a notice says it became the folder’s note: ' + j(await notices(p)));
});

test('drag: a Longform scene takes the indent of the row it’s dropped beside; what a project can’t order is left to Obsidian', async (p, h, t) => {
	await mk(p, { 'pic.png': 'BIN:', 'Fold/': '' });
	await rows(p, '', [LF]);
	let s = await drag(p, `${LF}/Return.md`, bottom(await row(p, `${LF}/Ticket office.md`)));
	t.eq(s.hint, 'Move after “Ticket office”', 'the hint');
	t.eq(await scenes(p), j(['Harbor', ['Ticket office', 'Return', 'The crossing'], 'Island']), 'dropped beside an indented scene, it is indented');
	await rows(p, '', [LF]);
	s = await drag(p, `${LF}/The crossing.md`, top(await row(p, `${LF}/Harbor.md`)));
	t.eq(await scenes(p), j(['The crossing', 'Harbor', ['Ticket office', 'Return'], 'Island']), 'dropped beside a top-level scene, it isn’t');
	for (const from of ['pic.png', 'Fold', `${LF}/Notes on ferries.md`]) {
		await rows(p, '', [LF]);
		s = await hold(p, from, top(await row(p, `${LF}/Island.md`))); await cancel(p);
		t.eq(s.line, null, `${from}: no line`); t.eq(s.hint, 'Move into “Longform demo”', `${from}: Obsidian’s own move`);
	}
});

test('drag: dropping a row on itself, and six drags made as fast as events can be sent', async (p, h, t) => {
	await rows(p);
	const a = await row(p, `${L}/Part One/Arrival.md`);
	for (const to of [top(a), bottom(a)]) { const s = await drag(p, `${L}/Part One/Arrival.md`, to); t.eq(s.line, null, 'no line on the dragged row itself'); }
	same(t, await listOnDisk(p), LIST, 'nothing changed');
	const want = ['Prologue.md', 'Part One', 'Part One/Epilogue.md', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md'].join(' | ');
	for (let i = 0; i < 6; i++) {
		await rows(p);
		const from = await row(p, `${L}/Epilogue.md`), to = await row(p, `${L}/Part One/Arrival.md`);
		// press, two moves, release: no waiting between them
		await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none' });
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
		await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + 8, y: from.y - 8, button: 'left', buttons: 1 });
		await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: to.x, y: to.t + 3, button: 'left', buttons: 1 });
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.t + 3, button: 'left', clickCount: 1 });
		await p.sleep(700);
		t.eq(await ord(p), want, `fast drag ${i + 1}: Epilogue is before Arrival`);
		t.eq(await p.ev(`document.querySelectorAll('.binders-explorer-drop').length`), 0, 'no line left behind');
		t.ok(await undo(p), 'undo it');
	}
	same(t, await listOnDisk(p), LIST, 'and six undos give back the list');
});

test('drag: binder order and dragging hold in each of Obsidian’s sort orders, and a plain folder follows the sort', async (p, h, t) => {
	await mk(p, { 'Plain/b.md': 'b', 'Plain/a.md': 'a' });
	const want = j(short(await rows(p)));
	for (const [o, plain] of [['alphabetical', 'ab'], ['alphabeticalReverse', 'ba'], ['byModifiedTime', null], ['byModifiedTimeReverse', null], ['byCreatedTime', null], ['byCreatedTimeReverse', null]]) {
		await p.ev(`(() => { ${EXP}.setSortOrder(${j(o)}); return 1; })()`); await p.sleep(400);
		t.eq(j(short(await rows(p))), want, `${o}: the binder is in binder order`);
		const s = await drag(p, `${L}/Epilogue.md`, top(await row(p, `${L}/Part One/Arrival.md`)));
		t.eq(s.hint, 'Move before “Arrival”', `${o}: the hint`);
		await p.sleep(300);
		t.eq(short(await rows(p)).slice(1, 4).join(), 'Part One,Part One/Epilogue.md,Part One/Arrival.md', `${o}: the drop lands`);
		t.ok(await undo(p, 600), `${o}: undo`);
		t.eq(j(short(await rows(p))), want, `${o}: and the explorer shows it undone`);
		if (plain) t.eq((await rows(p, 'Plain', ['Plain'])).map((x) => x[6]).join(''), plain, `${o}: the plain folder follows Obsidian’s sort`);
	}
});

test('drag: at the list’s top edge the line is hidden (it would be drawn over the explorer’s header) but the hint still shows', async (p, h, t) => {
	const many = {}; for (let i = 1; i <= 50; i++) many[`${L}/Part One/Scene ${String(i).padStart(2, '0')}.md`] = 's' + i;
	await mk(p, many); await rows(p);
	const sc = `${EXP}.containerEl.querySelector('.nav-files-container')`;
	// scroll so a row is cut by the top of the list
	const g = await p.ev(`(() => { const s = ${sc}; const e = ${EXP}.containerEl.querySelector('.tree-item-self[data-path="The Lighthouse/Part One/Scene 10.md"]'); s.scrollTop += e.getBoundingClientRect().top - s.getBoundingClientRect().top + 8; const r = e.getBoundingClientRect(), l = s.getBoundingClientRect(); return { rowT: r.top, listT: l.top, x: r.x + r.width / 2 }; })()`);
	t.ok(g.rowT < g.listT - 2, 'the row’s top is above the list’s: ' + j(g));
	const from = await p.ev(`(() => { const e = ${EXP}.containerEl.querySelector('.tree-item-self[data-path="The Lighthouse/Part One/Scene 20.md"]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	const s = await hold(p, from, { x: g.x, y: g.listT + 2 });
	await cancel(p);
	t.eq(s.hint, 'Move before “Scene 10”', 'the hint says where');
	t.eq(s.line, null, 'no line over the header');
});

test('drag: an explorer in its own window keeps binder order, draws the line in that window, hides it outside the list, and takes the drop', async (p, h, t) => {
	await rows(p);
	// (the pointer can't be driven in a second window from here: the same events a drag sends are made by hand)
	const r = await p.ev(`(async () => {
		const o = {};
		const l = app.workspace.openPopoutLeaf(); await l.setViewState({ type: 'file-explorer', active: true });
		await new Promise(r => setTimeout(r, 1200));
		try {
			for (const f of ${j(FOLDERS)}) l.view.fileItems[f]?.setCollapsed(false);
			await new Promise(r => setTimeout(r, 600));
			const doc = l.view.containerEl.ownerDocument, win = doc.defaultView, sc = l.view.containerEl.querySelector('.nav-files-container');
			o.otherWindow = doc !== document;
			o.order = [...l.view.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith('The Lighthouse/')).slice(0, 3);
			o.icons = l.view.containerEl.querySelectorAll('.binders-folder-tag').length;
			const target = l.view.containerEl.querySelector('.tree-item-self[data-path="The Lighthouse/Part One/Arrival.md"]'), inner = target.querySelector('.tree-item-inner');
			app.dragManager.draggable = { type: 'file', file: app.vault.getAbstractFileByPath('The Lighthouse/Epilogue.md') };
			const dt = new win.DataTransfer();
			const fire = (type) => { const tr = target.getBoundingClientRect(); const e = new win.DragEvent(type, { bubbles: true, cancelable: true, clientX: tr.left + 60, clientY: tr.top + 3, dataTransfer: dt }); inner.dispatchEvent(e); return e.defaultPrevented; };
			// in sight (the window is tiny when there's no screen: put the row at the list's top)
			sc.scrollTop += target.getBoundingClientRect().top - sc.getBoundingClientRect().top;
			await new Promise(r => setTimeout(r, 100));
			o.taken = fire('dragover');
			const line = doc.querySelector('.binders-explorer-drop'), tr = target.getBoundingClientRect();
			o.lineInMain = !!document.querySelector('.binders-explorer-drop');
			o.line = line ? { dy: Math.abs(line.getBoundingClientRect().top + line.getBoundingClientRect().height / 2 - tr.top), dx: Math.abs(line.getBoundingClientRect().left - inner.getBoundingClientRect().left), position: win.getComputedStyle(line).position } : null;
			// out of sight: scrolled past the end of the list
			sc.scrollTop = 0; await new Promise(r => setTimeout(r, 100));
			const lr = sc.getBoundingClientRect(), tr2 = target.getBoundingClientRect();
			o.outside = tr2.top > lr.bottom + 1;
			o.takenOutside = fire('dragover');
			o.lineOutside = !!doc.querySelector('.binders-explorer-drop');
			o.drop = fire('drop');
			app.dragManager.draggable = null;
			await new Promise(r => setTimeout(r, 900));
			o.lineAfterDrop = !!doc.querySelector('.binders-explorer-drop');
			o.after = [...l.view.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith('The Lighthouse/'));
		} finally { app.dragManager.draggable = null; l.detach(); }
		return o; })()`);
	await p.focusMain();
	t.ok(r.otherWindow, 'the explorer is in a window of its own');
	same(t, r.order, [`${L}/Prologue.md`, `${L}/Part One`, `${L}/Part One/Arrival.md`], 'binder order there');
	t.eq(r.icons, 2, 'and the binder icons');
	t.ok(r.taken, 'the drag is taken there');
	t.ok(r.line && r.line.dy <= 1.5 && r.line.dx <= 1 && r.line.position === 'fixed', 'the line is in that window, on the row’s top edge, from where its name starts: ' + j(r.line));
	t.ok(!r.lineInMain, 'and not in the main window');
	t.ok(r.outside && r.takenOutside && !r.lineOutside, 'a row outside the list’s box still takes the drag, without a line: ' + j([r.outside, r.takenOutside, r.lineOutside]));
	t.ok(r.drop && !r.lineAfterDrop, 'the drop is taken and the line goes');
	same(t, (await listOnDisk(p)).slice(1, 4), ['Part One/', 'Part One/Epilogue', 'Part One/Arrival'], 'the list has the move');
	t.ok(r.after.indexOf(`${L}/Part One/Epilogue.md`) >= 0, 'and the other window’s explorer follows');
});

test('drag: with “Order binders in the file explorer” off, rows and drags are exactly Obsidian’s (as with Binders disabled)', async (p, h, t) => {
	const probe = async () => {
		const out = { rows: await rows(p), hover: [] };
		for (const o of [`${L}/Part One/Arrival.md`, `${L}/Part Two`, `${L}/Part Two/The wreck.md`]) for (const f of [0.1, 0.5, 0.9]) {
			const r = await row(p, o), s = await hold(p, `${L}/Epilogue.md`, { x: r.x, y: r.t + r.h * f });
			out.hover.push([o, f, s.hint, s.line, s.into.join()]);
			await cancel(p);
		}
		await drag(p, `${L}/Epilogue.md`, top(await row(p, `${L}/Part One/Arrival.md`))); await p.sleep(400);
		out.afterDrop = await rows(p);
		await rename(p, `${L}/Part One/Epilogue.md`, `${L}/Epilogue.md`); await p.sleep(400);
		return out;
	};
	await setSettings(p, { orderExplorer: false });
	const offSetting = await probe();
	t.eq(await p.ev(`${PL}.explorer.status`), 'off', 'status');
	t.eq(await p.ev(`${B}.undoable(${j(L)})`), null, 'a drop there is not a move of Binders’');
	await off(p);
	let disabled;
	try { disabled = await probe(); } finally { await on(p); }
	for (const k of Object.keys(offSetting)) t.eq(j(offSetting[k]), j(disabled[k]), `${k} is the same with the setting off as with Binders disabled`);
	t.ok(offSetting.hover.every((x) => x[3] === null && /^Move into/.test(x[2])), 'no line of ours anywhere');
});

test('drag: a note dragged from the explorer onto a note’s text inserts a link, and onto a canvas adds a card, exactly as without Binders', async (p, h, t) => {
	await mk(p, { 'Loose.md': 'l', 'board.canvas': '{}', 'Target.md': 'line one\n\n\n\n\n\n\n\n\n\nend' });
	const probe = async () => {
		const out = {};
		await rows(p);
		await h.open('Target.md');
		const ed = await p.at('.workspace-leaf.mod-active .cm-content');
		for (const src of [`${L}/Part One/Arrival.md`, 'Loose.md', `${L}/Part One`]) { const s = await hold(p, src, { x: ed.x, y: ed.y }); out['hint ' + src] = [s.hint, s.line]; await release(p, { x: ed.x, y: ed.y }, 500); }
		out.text = await p.ev(`app.workspace.getMostRecentLeaf().view.editor?.getValue()`);
		await p.ev(`app.workspace.getLeaf(false).openFile(${file('board.canvas')}).then(() => 1)`); await p.sleep(700);
		const cv = await p.at('.workspace-leaf.mod-active .canvas-wrapper');
		const s = await hold(p, `${L}/Part One/Arrival.md`, { x: cv.x, y: cv.y }); out.canvasLine = s.line;
		await release(p, { x: cv.x, y: cv.y }, 800);
		out.canvas = await p.ev(`[...(app.workspace.getMostRecentLeaf().view.canvas?.nodes?.values() ?? [])].map(n => n.file?.path ?? n.filePath ?? '?')`);
		out.files = await p.ev(`app.vault.getFiles().map(f => f.path).sort().join()`);
		await p.ev(`(async () => { app.workspace.getMostRecentLeaf().detach(); await new Promise(r => setTimeout(r, 300)); await app.vault.adapter.write('board.canvas', '{}'); await app.vault.modify(${file('Target.md')}, 'line one\\n\\n\\n\\n\\n\\n\\n\\n\\n\\nend'); })().then(() => 1)`); await p.sleep(400);
		return out;
	};
	const withBinders = await probe();
	same(t, await listOnDisk(p), LIST, 'the binder’s list is untouched');
	t.eq(withBinders.text, 'line one\n\n\n\n\n\n\n\n\n\nend[[Arrival]][[Loose]]', 'links were inserted');
	same(t, withBinders.canvas, [`${L}/Part One/Arrival.md`], 'the canvas has the note');
	await off(p);
	let without;
	try { without = await probe(); } finally { await on(p); }
	t.eq(j(withBinders), j(without), 'everything is as it is without Binders');
});

// ================================================================================================================
// Menus
// ================================================================================================================

const isOurs = (x) => ['Open binder', 'Show in binder', 'New scene here', 'New scene after this', 'Export...', 'Move up', 'Move down', 'Convert to binder', 'Make this folder a binder', 'New binder', 'New folder from selection', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Snapshots of notes that are gone...'].includes(x) || /^Merge \d+ notes$/.test(x);
/** A menu without Binders' items (and without the separators that leaves doubled or dangling). */
const stock = (m) => m.filter((x) => !isOurs(x)).filter((x, i, a) => !(x === '---' && (i === 0 || a[i - 1] === '---'))).filter((x, i, a) => !(x === '---' && i === a.length - 1));
const menuIcons = (p) => p.ev(`Object.fromEntries([...document.querySelectorAll('.menu .menu-item')].map(e => [e.querySelector('.menu-item-title')?.textContent, [...(e.querySelector('.menu-item-icon svg')?.classList ?? [])].find(c => c.startsWith('lucide-')) ?? null]))`);

test('menus: Binders’ items sit in Obsidian’s own sections, with its icons, and the rest of each menu is the stock one', async (p, h, t) => {
	await mk(p, { 'Plain/x.md': 'x' });
	await rows(p, '', [...FOLDERS, 'Plain']);
	const note = await rightClick(p, `${L}/Part One/The keeper.md`), noteIcons = await menuIcons(p); await closeMenu(p);
	const plainNote = await rightClick(p, 'Plain/x.md'); await closeMenu(p);
	const folder = await rightClick(p, `${L}/Part One`), folderIcons = await menuIcons(p); await closeMenu(p);
	const plainFolder = await rightClick(p, 'Plain'); await closeMenu(p);
	same(t, stock(note), stock(plainNote), 'a scene’s menu, less Binders’ items, is a note’s stock menu');
	same(t, stock(folder), stock(plainFolder), 'a binder folder’s menu, less Binders’ items, is a folder’s stock menu');
	// a note: with "Open in new tab", then a new note of its own section, then with "Make a copy"; "Delete" last
	let i = note.indexOf('Show in binder');
	same(t, note.slice(i - 1, i + 5), ['Open in new window', 'Show in binder', '---', 'New scene after this', '---', 'Make a copy'], 'a scene: “Show in binder” ends the opening section, “New scene after this” has the section before “Make a copy”');
	i = note.indexOf('Move up');
	same(t, [note[i + 1], note[i + 2]], ['Move down', '---'], '“Move up” and “Move down” end the section “Make a copy” is in');
	t.ok(note.slice(note.indexOf('Make a copy'), i).every((x) => x !== '---'), 'the same section');
	t.eq(note[note.length - 1], 'Delete', '“Delete” is last');
	// a folder
	same(t, folder.slice(0, 3), ['Open binder', '---', 'New note'], 'a folder: “Open binder” first, in a section of its own');
	i = folder.indexOf('New scene here');
	t.ok(i > folder.indexOf('New note') && folder.slice(folder.indexOf('New note'), i).every((x) => x !== '---') && folder[i + 1] === '---', '“New scene here” ends the section “New note” is in: ' + j(folder.slice(0, i + 2)));
	i = folder.indexOf('Export...');
	t.ok(folder.slice(folder.indexOf('Make a copy'), i).every((x) => x !== '---'), '“Export...” is in the section “Make a copy” is in');
	same(t, folder.slice(i, i + 6), ['Export...', 'Take a snapshot', 'Show snapshots...', 'Move up', 'Move down', '---'], 'then its snapshots, then “Move up” and “Move down”');
	i = note.indexOf('Take a snapshot');
	same(t, note.slice(i - 1, i + 4), ['Merge entire file with...', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move up'], 'a scene’s snapshots: after Obsidian’s own items of that section, before “Move up”');
	t.eq(folder[folder.length - 1], 'Delete', '“Delete” is last');
	same(t, [noteIcons['Show in binder'], noteIcons['New scene after this'], noteIcons['Move up'], noteIcons['Move down']], ['lucide-book', 'lucide-file-plus', 'lucide-arrow-up', 'lucide-arrow-down'], 'a scene’s icons');
	same(t, [noteIcons['Take a snapshot'], noteIcons['Rewrite...'], noteIcons['Show snapshots...'], folderIcons['Take a snapshot']], ['lucide-camera', 'lucide-file-pen-line', 'lucide-history', 'lucide-camera'], 'the snapshot items’ icons');
	same(t, [folderIcons['Open binder'], folderIcons['New scene here'], folderIcons['Export...']], ['lucide-book', 'lucide-file-plus', 'lucide-book-up'], 'a folder’s icons');
});

test('menus: what’s offered where — scenes, folders, the binder’s own note, folder notes, other files, a Longform project, a binder in a newer format, and selections', async (p, h, t) => {
	await mk(p, { [`${L}/Part One/Part One.md`]: 'folder note', [`${L}/map.png`]: 'BIN:', 'Plain/x.md': 'x', 'Plain/y.md': 'y', 'Loose.md': 'l', 'Newer/Newer.md': '---\nbinder: 99\ncontents:\n  - Zed\n  - Alpha\n---\n', 'Newer/Zed.md': 'z', 'Newer/Alpha.md': 'a', 'Newer/Sub/In.md': 'i' });
	await setSettings(p, { hideBinderNotes: false });
	await rows(p, '', [...FOLDERS, 'Plain', LF, 'Newer', 'Newer/Sub']);
	const ours = async (path) => { const m = await rightClick(p, path); await closeMenu(p); if (!m) throw new Error(`no menu for ${path}`); return m.filter(isOurs); };
	const want = {
		[L]: ['Open binder', 'New scene here', 'Export...', 'Take a snapshot', 'Show snapshots...'], [`${L}/Part One`]: ['Open binder', 'New scene here', 'Export...', 'Take a snapshot', 'Show snapshots...', 'Move up', 'Move down'],
		[`${L}/Prologue.md`]: ['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move down'], [`${L}/Part One/The keeper.md`]: ['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move up', 'Move down'],
		// (the binder's own note, where the quick switcher lands for a binder's name, leads to its binder)
		[NOTE]: ['Open binder'], [`${L}/Part One/Part One.md`]: [], [`${L}/map.png`]: ['Show in binder', 'Move up'],
		Plain: ['Make this folder a binder', 'New binder'], 'Plain/x.md': [], 'Loose.md': [],
		[LF]: ['Open binder', 'New scene here', 'Convert to binder', 'Export...', 'Take a snapshot', 'Show snapshots...'], [`${LF}/Index.md`]: ['Open binder', 'Convert to binder'], [`${LF}/Island.md`]: ['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move up', 'Move down'], [`${LF}/Notes on ferries.md`]: [],
		// a binder Binders can't change: it can be opened and exported, and a note's snapshots read, nothing more
		Newer: ['Open binder', 'Export...', 'Show snapshots...'], 'Newer/Zed.md': ['Show in binder', 'Show snapshots...'], 'Newer/Sub': ['Open binder', 'Export...', 'Show snapshots...'], 'Newer/Newer.md': ['Open binder'],
	};
	for (const [path, items] of Object.entries(want)) same(t, await ours(path), items, `the menu of “${path}”`);
	const selection = async (paths) => { await clearSelection(p); await select(p, paths); const a = await row(p, paths[paths.length - 1]); await p.right(a.x, a.y); await p.sleep(250); const m = await menuOf(p); await closeMenu(p); if (!m) throw new Error(`no menu for ${paths}`); return m.filter(isOurs); };
	same(t, await selection([`${L}/Part One/Storm warning.md`, `${L}/Part One/Arrival.md`]), ['New folder from selection', 'Merge 2 notes'], 'two scenes of one folder');
	same(t, await selection([`${L}/Prologue.md`, `${L}/Part One`]), ['New folder from selection'], 'a scene and a folder beside it');
	same(t, await selection([`${L}/Prologue.md`, `${L}/map.png`]), ['New folder from selection'], 'a scene and an image beside it');
	same(t, await selection([`${L}/Prologue.md`, `${L}/Part One/Arrival.md`]), ['Merge 2 notes'], 'scenes of two folders');
	same(t, await selection([`${LF}/Island.md`, `${LF}/Harbor.md`]), ['Merge 2 notes'], 'two Longform scenes (a project has no folders)');
	for (const [what, paths] of [['a scene and a note outside', [`${L}/Prologue.md`, 'Loose.md']], ['a scene and the binder’s own note', [`${L}/Prologue.md`, NOTE]], ['a scene and its folder’s note', [`${L}/Part One/Arrival.md`, `${L}/Part One/Part One.md`]], ['two notes of a binder in a newer format', ['Newer/Zed.md', 'Newer/Alpha.md']], ['two notes outside binders', ['Plain/x.md', 'Plain/y.md']], ['the binder folder and a scene', [L, `${L}/Prologue.md`]]]) same(t, await selection(paths), [], what);
});

// ================================================================================================================
// Undo and redo of moves
// ================================================================================================================

test('undo: with a rename, a new note, a delete and an outside edit of the binder note in between, each moved note still goes back to its folder', async (p, h, t) => {
	await put(p, [`${L}/Prologue.md`, `${L}/Part One/The keeper.md`, `${L}/Epilogue.md`], `${L}/Part Two`, `${L}/Part Two/Lights out.md`);
	t.eq(await ord(p), 'Part One | Part One/Arrival.md | Part One/Storm warning.md | Part Two | Part Two/The wreck.md | Part Two/Prologue.md | Part Two/The keeper.md | Part Two/Epilogue.md | Part Two/Lights out.md', 'three notes moved into Part Two');
	await rename(p, `${L}/Part Two/The keeper.md`, `${L}/Part Two/The lamp.md`);
	await p.ev(`app.vault.create(${j(`${L}/Part One/New one.md`)}, 'n').then(() => 1)`);
	await p.ev(`app.vault.delete(${file(`${L}/Part Two/The wreck.md`)}).then(() => 1)`);
	await p.ev(`(async () => { await ${B}.flush(); const f = ${file(NOTE)}; const text = await app.vault.read(f); await app.vault.adapter.write(f.path, text.replace('plotlines:', 'edited: outside\\nplotlines:')); })().then(() => 1)`); await p.sleep(800);
	t.ok(await undo(p, 800), 'undo');
	t.eq(await ord(p), 'Prologue.md | Part One | Part One/Arrival.md | Part One/The lamp.md | Part One/Storm warning.md | Part One/New one.md | Part Two | Part Two/Lights out.md | Epilogue.md', 'the renamed note is back between its old neighbours; the new note and the delete stay');
	t.ok(/edited: outside/.test(await read(p, NOTE)), 'the outside edit of the binder note is kept');
	same(t, await listOnDisk(p), ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The lamp', 'Part One/Storm warning', 'Part One/New one', 'Part Two/', 'Part Two/Lights out', 'Epilogue'], 'and the list says so');
	t.ok(await redo(p, 800), 'redo');
	t.eq(await ord(p), 'Part One | Part One/Arrival.md | Part One/Storm warning.md | Part One/New one.md | Part Two | Part Two/Prologue.md | Part Two/The lamp.md | Part Two/Epilogue.md | Part Two/Lights out.md', 'redo moves the three again, under the names they have now');
});

test('undo: sixty moves, fifty undos (the limit) each giving back the order before, fifty redos', async (p, h, t) => {
	const states = [await ord(p)], items = ['Prologue.md', 'Epilogue.md', 'Part One', 'Part Two'];
	for (let i = 0; i < 60; i++) {
		const sibs = await p.ev(`${B}.orderedChildren(${file(L)}).map(f => f.name)`), it = items[i % 4];
		await put(p, [`${L}/${it}`], L, `${L}/${sibs[(sibs.indexOf(it) + 2) % 4]}`);
		states.push(await ord(p));
	}
	t.eq(states.filter((s, i) => i && s !== states[i - 1]).length, 60, 'sixty moves that each changed the order');
	let n = 0; const bad = [];
	for (; n < 62 && (await undo(p, 30)); n++) if ((await ord(p)) !== states[59 - n]) bad.push(n + 1);
	t.eq(n, 50, 'fifty can be undone');
	same(t, bad, [], 'each undo gave back the order before that move');
	let m = 0; for (; m < 62 && (await redo(p, 30)); m++);
	t.eq(m, 50, 'and redone');
	t.eq(await ord(p), states[60], 'back at the last order');
	same(t, await listOnDisk(p), ['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue', 'Prologue'], 'the list on disk');
});

test('undo: two binders’ moves interleaved are undone per binder; a new move drops what could be redone', async (p, h, t) => {
	await mk(p, OTHER);
	const a0 = await ord(p);
	await put(p, [`${L}/Epilogue.md`], L, `${L}/Prologue.md`); const a1 = await ord(p);
	await put(p, ['Other/Three.md'], 'Other', 'Other/One.md'); const b1 = await ord(p, 'Other');
	await put(p, [`${L}/Part Two`], L, `${L}/Part One`);
	await put(p, ['Other/Two.md'], 'Other', 'Other/Three.md'); const b2 = await ord(p, 'Other');
	const back = (at, redo = false) => p.ev(`${B}.undo(${j(at)}, ${redo}).then(x => x, e => 'refused: ' + e.message)`);
	t.eq(await back(L), 'Move “Part Two”', 'the first binder’s last move');
	t.eq(await ord(p), a1, 'is undone'); t.eq(await ord(p, 'Other'), b2, 'the other binder is untouched');
	t.eq(await back(L), 'Move “Epilogue”', 'then its first'); t.eq(await ord(p), a0, 'undone');
	t.eq(await back('Other'), 'Move “Two”', 'the other binder’s last move'); t.eq(await ord(p, 'Other'), b1, 'is undone');
	t.eq(await back(L, true), 'Move “Epilogue”', 'redo in the first'); t.eq(await ord(p), a1, 'redone');
	await put(p, [`${L}/Part One`], L, null);
	t.eq(await p.ev(`${B}.undoable(${j(L)}, true)`), null, 'after a new move nothing is left to redo');
	t.eq(await redo(p), false, 'and “Redo last move” is not offered');
});

test('undo: a Longform project’s moves are undone and redone with their indents', async (p, h, t) => {
	const s0 = await scenes(p);
	await p.ev(`${B}.put([${file(`${LF}/Return.md`)}, ${file(`${LF}/Ticket office.md`)}], ${file(LF)}, ${file(`${LF}/Island.md`)}, 0).then(() => 1)`);
	const s1 = await scenes(p);
	t.eq(s1, j(['Harbor', ['The crossing'], 'Return', 'Ticket office', 'Island']), 'two scenes moved to the top level');
	t.eq(await p.ev(`${B}.undo(${j(LF)})`), 'Move 2 items', 'undo'); t.eq(await scenes(p), s0, 'the scenes are as they were, indents too');
	t.eq(await p.ev(`${B}.undo(${j(LF)}, true)`), 'Move 2 items', 'redo'); t.eq(await scenes(p), s1, 'and as they were moved');
});

test('undo: asked for while a drop’s files are still moving, nothing is lost and the list ends up consistent', async (p, h, t) => {
	const before = await texts(p), o0 = await ord(p);
	await put(p, [`${L}/Epilogue.md`], L, `${L}/Prologue.md`);
	const ran = await p.ev(`(async () => {
		const pr = ${B}.put([${file(`${L}/Part One/Arrival.md`)}, ${file(`${L}/Part One/The keeper.md`)}, ${file(`${L}/Part One/Storm warning.md`)}], ${file(`${L}/Part Two`)}, ${file(`${L}/Part Two/Lights out.md`)});
		const c = app.commands.commands['binders:undo-move']; const can = c.checkCallback(true); if (can) c.checkCallback(false);
		await pr; await new Promise(r => setTimeout(r, 800)); return can; })()`);
	t.ok(ran, 'undo ran while the files were moving');
	while (await undo(p, 600));
	t.eq(await ord(p), o0, 'undoing everything gives back the first order');
	const list = await listOnDisk(p);
	same(t, list, LIST, 'the list on disk, no duplicates');
	const after = await texts(p);
	for (const [k, v] of Object.entries(before)) if (k !== NOTE) t.eq(after[k], v, `“${k}” is unchanged`);
});

test('undo: a folder made around notes is taken away again, and made again by redo; ungroup is undone too', async (p, h, t) => {
	const o0 = await ord(p);
	const made = await p.ev(`${B}.group([${file(`${L}/Part One/Arrival.md`)}, ${file(`${L}/Part One/Storm warning.md`)}]).then(f => f.path)`);
	t.eq(made, `${L}/Part One/Untitled`, 'the folder');
	const o1 = await ord(p);
	t.eq(o1, 'Prologue.md | Part One | Part One/Untitled | Part One/Untitled/Arrival.md | Part One/Untitled/Storm warning.md | Part One/The keeper.md | Part Two | Part Two/The wreck.md | Part Two/Lights out.md | Epilogue.md', 'where the first note was, holding both');
	t.ok(await undo(p, 800), 'undo'); t.eq(await ord(p), o0, 'the notes are back');
	t.ok(await p.ev(`!app.vault.getAbstractFileByPath(${j(made)})`), 'and the empty folder is gone');
	t.ok(await redo(p, 800), 'redo'); t.eq(await ord(p), o1, 'the folder is made again, with both in it');
	t.ok(await undo(p, 800), 'undo again'); t.eq(await ord(p), o0, 'back');
	await p.ev(`${B}.ungroup(${file(`${L}/Part Two`)}).then(() => 1)`);
	const o2 = await ord(p);
	t.eq(o2, 'Prologue.md | Part One | Part One/Arrival.md | Part One/The keeper.md | Part One/Storm warning.md | The wreck.md | Lights out.md | Epilogue.md', 'ungrouped: its notes stand where it stood, and the emptied folder is gone');
	t.ok(await undo(p, 800), 'undo'); t.eq(await ord(p), o0, 'they are back in it');
	t.ok(await redo(p, 800), 'redo'); t.eq(await ord(p), o2, 'and out again');
	same(t, await notices(p).then((n) => n.filter((x) => /^(Undid|Redid)/.test(x)).slice(-2)), ['Undid: ungroup “Part Two”', 'Redid: ungroup “Part Two”'], 'each says what it did');
});

// ================================================================================================================
// The store
// ================================================================================================================

test('store: Obsidian’s “Make a copy” of a scene puts the copy right after it, and the list says so', async (p, h, t) => {
	await rows(p);
	await rightClick(p, `${L}/Part One/Arrival.md`); await pick(p, 'Make a copy'); await p.sleep(900);
	t.eq(await ord(p), 'Prologue.md | Part One | Part One/Arrival.md | Part One/Arrival 1.md | Part One/The keeper.md | Part One/Storm warning.md | Part Two | Part Two/The wreck.md | Part Two/Lights out.md | Epilogue.md', '“Arrival 1” is right after “Arrival”');
	same(t, (await listOnDisk(p)).slice(2, 5), ['Part One/Arrival', 'Part One/Arrival 1', 'Part One/The keeper'], 'written down');
	t.eq(await p.ev(`${B}.undoable(${j(L)})`), null, 'that is not a move to undo');
});

test('store: a scene renamed to its folder’s name becomes the folder’s note, with a notice; a folder renamed along with its note says nothing', async (p, h, t) => {
	await clearNotices(p);
	await rename(p, `${L}/Part One/Arrival.md`, `${L}/Part One/Part One.md`); await p.sleep(500);
	same(t, await notices(p), ['“Part One” is now the note of the folder “Part One”, so it no longer shows as a scene. Rename it to make it a scene again.'], 'the notice');
	t.eq(await ord(p), 'Prologue.md | Part One | Part One/The keeper.md | Part One/Storm warning.md | Part Two | Part Two/The wreck.md | Part Two/Lights out.md | Epilogue.md', 'it no longer shows');
	same(t, await listOnDisk(p), LIST.filter((x) => x !== 'Part One/Arrival'), 'and is out of the list');
	await clearNotices(p);
	await rename(p, `${L}/Part One`, `${L}/First`); await p.sleep(800);
	same(t, await notices(p), [], 'a folder renamed with its note: nothing to say');
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(`${L}/First/First.md`)})`), 'the note followed its folder');
	// a folder renamed to the name of a scene in it: that scene becomes its note, and that is said
	await rename(p, `${L}/Part Two`, `${L}/The wreck`); await p.sleep(800);
	t.ok((await notices(p)).some((n) => /“The wreck” is now the note of the folder “The wreck”/.test(n)), 'said: ' + j(await notices(p)));
});

test('store: what the list doesn’t mention shows after what it does, folders first, then by name; label dots follow a list, a number and a hex color', async (p, h, t) => {
	await mk(p, { [`${L}/zeta.md`]: 'z', [`${L}/Alpha.md`]: 'a', [`${L}/beta 10.md`]: 'b', [`${L}/beta 9.md`]: 'b', [`${L}/Zulu/`]: '', [`${L}/apple/`]: '', [`${L}/pic.png`]: 'BIN:' });
	same(t, short(await rows(p)).slice(9), ['apple', 'Zulu', 'Alpha.md', 'beta 9.md', 'beta 10.md', 'pic.png', 'zeta.md'], 'unlisted: folders, then files, by name (numbers as numbers, case ignored)');
	const set = (path, v) => p.ev(`app.fileManager.processFrontMatter(${file(path)}, fm => { fm.label = ${j(v)}; }).then(() => 1)`);
	await set(`${L}/Prologue.md`, ['red', 'blue']); await set(`${L}/Part One/Arrival.md`, 3); await set(`${L}/Part One/The keeper.md`, '#ff8800'); await set(`${L}/Part One/Storm warning.md`, 'Green'); await set(`${L}/Part Two/The wreck.md`, '#abc');
	await p.sleep(800); await rows(p);
	const dots = await p.ev(`Object.fromEntries([...${EXP}.containerEl.querySelectorAll('.binders-explorer-label')].map(e => [e.parentElement.dataset.path.split('/').pop(), e.style.getPropertyValue('--binders-label')]))`);
	same(t, dots, { 'Prologue.md': 'var(--color-red)', 'Arrival.md': 'var(--text-faint)', 'The keeper.md': '#ff8800', 'Storm warning.md': 'var(--color-green)', 'The wreck.md': '#aabbcc' }, 'a list’s first entry, a number (no color of its own), a hex color, a preset in another case, a short hex');
});

// ================================================================================================================
// Random walks
// ================================================================================================================

/* A seeded random walk, run inside Obsidian with no waiting between steps (the list's write is debounced, so most
   steps land on changes not yet written): notes and folders made, copied as "Make a copy" does, renamed (to their
   folder's name too), moved through the vault, put as a drop puts them, stepped, grouped, ungrouped, duplicated,
   deleted, moved out of the binder and back in, moves undone and redone, and the binder note edited from outside.
   Checked after each step: what that step promises (a put's items are together, in order, before their anchor; undo
   right after a change gives back the order before it, and redo the order after it; a copy is right after its
   original). Checked every few steps: `contents` has no duplicates, nothing that isn't there and no folder notes; each
   folder shows its listed items in the list's order; the explorer's rows are the store's order; the binder note's text
   and other properties are untouched; no note's text changed, none vanished and none appeared. */
const WALK = String(async function walk(seed, steps, opts) {
	const B = app.plugins.plugins.binders.binders, { vault, fileManager } = app, L = 'The Lighthouse';
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	let s = seed | 0;
	const rand = () => { s = (s + 0x6d2b79f5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
	const int = (n) => Math.floor(rand() * n), pick = (a) => a[int(a.length)];
	const root = () => vault.getAbstractFileByPath(L);
	const kids = (f) => B.orderedChildren(f) ?? [];
	const all = (f = root(), acc = []) => { for (const c of kids(f)) { acc.push(c); if (c.children) all(c, acc); } return acc; };
	const folders = () => [root(), ...all().filter((f) => f.children)];
	const depth = (f) => f.path.split('/').length - 1;
	const inside = (a, f) => f === a || f.path.startsWith(a.path + '/');
	const snap = () => all().map((f) => f.path).join(' | ');
	const fails = [], history = [];
	const bodies = new Map(); // TFile -> text
	for (const f of vault.getMarkdownFiles()) if (f.path.startsWith(L + '/')) bodies.set(f, await vault.adapter.read(f.path));
	const noteText = bodies.get(vault.getAbstractFileByPath(L + '/' + L + '.md'));
	bodies.delete(vault.getAbstractFileByPath(L + '/' + L + '.md'));
	const track = async (f) => { if (f.children) { for (const c of [...f.children]) await track(c); } else if (f.extension === 'md') bodies.set(f, await vault.adapter.read(f.path)); };
	const untrack = (f) => { if (f.children) f.children.forEach(untrack); else bodies.delete(f); };
	let count = 0;
	const fresh = () => `${['Dawn', 'tide', 'Ash', 'bell', 'Cove'][int(5)]} ${++count}x`;
	const out = vault.getAbstractFileByPath('Walk out') ?? await vault.createFolder('Walk out');
	const canGo = (item, folder) => !(item.children && inside(item, folder)) && B.whyNot(item, folder) === null && !(item.extension === 'md' && item.basename === folder.name);
	const undoable = (redo) => B.undoable(L, redo);
	/** undo right after a change must give back the order before it, and redo the order after it */
	const roundTrip = async (name, before) => {
		if (!opts.roundTrips || rand() > 0.5 || !undoable(false)) return '';
		const after = snap();
		if (after === before) return '';
		await B.undo(L);
		if (snap() !== before) fails.push(`undo right after ${name} didn’t give back the order before it\n      before: ${before}\n      undone: ${snap()}\n      (after the change: ${after})`);
		if (rand() < 0.6) { await B.undo(L, true); if (snap() !== after) fails.push(`redo right after undoing ${name} didn’t give back the order after it\n      after:  ${after}\n      redone: ${snap()}`); return ' +undo+redo'; }
		return ' +undo';
	};
	const ops = {
		async createNote() { const d = pick(folders()), n = fresh(); const f = await vault.create(`${d.path}/${n}.md`, `body of ${n}`); bodies.set(f, `body of ${n}`); return `create ${f.path}`; },
		async createFolder() { const d = pick(folders().filter((x) => depth(x) < 3)); const f = await vault.createFolder(`${d.path}/${fresh()}`); return `mkdir ${f.path}`; },
		async copy() { // as Obsidian's "Make a copy": "Arrival 1" beside "Arrival"
			const n = pick(all().filter((f) => f.extension === 'md')); if (!n) return null;
			let k = 1; while (vault.getAbstractFileByPath(`${n.parent.path}/${n.basename} ${k}.md`)) k++;
			// (only checked when no move is waiting to be written: see the BUG test about a copy made right after a move)
			const st = B.at(n.path), listed = B.contents(st).includes(n.path.slice(L.length + 1).replace(/\.md$/, '')) && (opts.strictCopy || !st.ops.length);
			const c = await vault.copy(n, `${n.parent.path}/${n.basename} ${k}.md`); bodies.set(c, bodies.get(n));
			await sleep(20);
			const sibs = kids(n.parent);
			if (listed && sibs[sibs.indexOf(n) + 1] !== c) fails.push(`a copy made beside “${n.path}” isn’t right after it: ${sibs.map((f) => f.name).join(', ')}`);
			return `copy ${n.path} -> ${c.name}`;
		},
		async rename() { const n = pick(all()); if (!n) return null; const from = n.path; await fileManager.renameFile(n, `${n.parent.path}/${fresh()}${n.children ? '' : '.' + n.extension}`); return `rename ${from} -> ${n.name}`; },
		async toFolderNote() { // a scene renamed to its folder's name becomes the folder's note
			const n = pick(all().filter((f) => f.extension === 'md' && f.parent !== root() && !vault.getAbstractFileByPath(`${f.parent.path}/${f.parent.name}.md`))); if (!n) return null;
			const from = n.path; await fileManager.renameFile(n, `${n.parent.path}/${n.parent.name}.md`);
			await sleep(20);
			if (!B.isHiddenNote(n) || all().includes(n)) fails.push(`“${from}” renamed to its folder’s name still shows as a scene`);
			return `to folder note ${from}`;
		},
		async vaultMove() {
			const n = pick(all()); if (!n) return null;
			const d = pick(folders().filter((x) => x !== n.parent && canGo(n, x) && (!n.children || depth(x) < 3))); if (!d) return null;
			const from = n.path; await fileManager.renameFile(n, `${d.path}/${n.name}`); return `mv ${from} -> ${d.path}/`;
		},
		async put() {
			const d = pick(folders());
			const pool = all().filter((x) => canGo(x, d) && (!x.children || depth(d) < 3)), items = [];
			for (let i = 0, k = 1 + int(3); i < k && pool.length; i++) { const x = pool.splice(int(pool.length), 1)[0]; if (!items.some((y) => inside(y, x) || inside(x, y) || y.name === x.name)) items.push(x); }
			if (!items.length) return null;
			const ordered = B.inOrder(items), rest = kids(d).filter((x) => !items.includes(x)), anchor = rand() < 0.3 ? null : pick(rest) ?? null;
			const before = snap(), names = ordered.map((f) => f.path).join(', ');
			await B.put(ordered, d, anchor);
			const now = kids(d), at = now.indexOf(ordered[0]);
			const okPlace = ordered.every((f, i) => now[at + i] === f) && (anchor ? now[at + ordered.length] === anchor : at + ordered.length === now.length);
			if (!okPlace) fails.push(`put [${names}] before ${anchor?.name ?? 'the end'} of ${d.path}: they show as ${now.map((f) => f.name).join(', ')}`);
			return `put [${names}] -> ${d.path}/ before ${anchor?.name ?? 'end'}` + await roundTrip('a put', before);
		},
		async step() {
			const n = pick(all()); if (!n) return null;
			const sibs = kids(n.parent), i = sibs.indexOf(n), d = rand() < 0.5 ? -1 : 1, k = i + d, can = k >= 0 && k < sibs.length, before = snap();
			const ok = await (d < 0 ? B.moveUp(n) : B.moveDown(n));
			if (ok !== can) fails.push(`step ${n.path} ${d}: returned ${ok}, expected ${can}`);
			else if (can && kids(n.parent).indexOf(n) !== k) fails.push(`step ${n.path} ${d}: it is at ${kids(n.parent).indexOf(n)}, expected ${k}`);
			return `step ${n.path} ${d}` + await roundTrip('a step', before);
		},
		async undo() { return this.back(false); },
		async redo() { return this.back(true); },
		/** An undo that can't be made (its folder is gone, the note is a folder's note now) says so and stays on the stack,
		    where it would block every later undo (see the BUG test): the walk drops it and carries on. */
		async back(redo) {
			if (!undoable(redo)) return null;
			try { return `${redo ? 'redo' : 'undo'} (${await B.undo(L, redo)})`; }
			catch (e) { if (!/can’t|stay with their folder|already has|isn’t in a binder/.test(e.message)) throw e; (redo ? B.redos : B.undos).pop(); return `${redo ? 'redo' : 'undo'} refused: ${e.message}`; }
		},
		async group() {
			const d = pick(folders().filter((x) => depth(x) < 3 && kids(x).length)); if (!d) return null;
			const sibs = kids(d), i = int(sibs.length), items = sibs.slice(i, i + 1 + int(3)), before = snap();
			const made = await B.group(items);
			const inner = kids(made);
			if (inner.length !== items.length || !items.every((f, k) => inner[k] === f) || kids(d)[i] !== made) fails.push(`group of ${items.map((f) => f.name).join(', ')}: the folder is at ${kids(d).indexOf(made)} (expected ${i}) holding ${inner.map((f) => f.name).join(', ')}`);
			return `group ${items.map((f) => f.path).join(', ')} -> ${made.path}` + await roundTrip('a group', before);
		},
		async ungroup() {
			const f = pick(all().filter((x) => x.children && kids(x).every((c) => canGo(c, x.parent)))); if (!f) return null;
			const before = snap(), from = f.path, n = kids(f).length;
			await B.ungroup(f);
			if (kids(f).length) fails.push(`ungroup ${from}: ${kids(f).length} items are still in it`);
			return `ungroup ${from} (${n})` + await roundTrip('an ungroup', before);
		},
		async duplicate() {
			if (all().length > 60) return null;
			const n = pick(all().filter((x) => !x.children || depth(x) < 3)); if (!n) return null;
			const c = await B.duplicate(n); await track(c);
			const sibs = kids(n.parent);
			if (sibs[sibs.indexOf(n) + 1] !== c) fails.push(`duplicate of ${n.path} isn’t right after it`);
			if (n.children && kids(c).map((f) => f.name).join() !== kids(n).map((f) => f.name).join()) fails.push(`duplicate of ${n.path} doesn’t keep its order: ${kids(c).map((f) => f.name).join()} vs ${kids(n).map((f) => f.name).join()}`);
			return `duplicate ${n.path} -> ${c.name}`;
		},
		async remove() { if (all().length < 6) return null; const n = pick(all()), was = n.path; untrack(n); await vault.delete(n, true); return `rm ${was}`; },
		async moveOut() { const n = pick(all()); if (!n || all().length < 6 || vault.getAbstractFileByPath(`${out.path}/${n.name}`)) return null; const from = n.path; await fileManager.renameFile(n, `${out.path}/${n.name}`); return `out ${from}`; },
		async moveIn() {
			const n = pick(out.children); if (!n) return null;
			const d = pick(folders().filter((x) => (!n.children || depth(x) < 2) && !vault.getAbstractFileByPath(`${x.path}/${n.name}`) && !(n.extension === 'md' && n.basename === x.name))); if (!d) return null;
			await fileManager.renameFile(n, `${d.path}/${n.name}`); return `in ${n.path}`;
		},
		async newScene() { const d = pick(folders()), i = int(kids(d).length + 1); const f = await B.newScene(d, i, fresh()); bodies.set(f, ''); if (kids(d)[i] !== f) fails.push(`new scene at ${i} of ${d.path} shows at ${kids(d).indexOf(f)}`); return `new ${f.path} at ${i}`; },
		async outsideEdit() { // another app rewrites the binder note: two of the top level's entries swap
			await B.flush(); await sleep(150);
			const f = vault.getAbstractFileByPath(L + '/' + L + '.md'), text = await vault.adapter.read(f.path), lines = text.split('\n');
			const c0 = lines.findIndex((l) => /^contents:/.test(l)); let c1 = c0 + 1; while (/^\s+- /.test(lines[c1] ?? '')) c1++;
			const idx = lines.map((l, i) => (i > c0 && i < c1 && /^  - [^/]*$/.test(l) ? i : -1)).filter((i) => i >= 0);
			if (idx.length < 2) return null;
			const a = pick(idx), b = pick(idx.filter((i) => i !== a)); [lines[a], lines[b]] = [lines[b], lines[a]];
			await vault.adapter.write(f.path, lines.join('\n')); await sleep(700);
			return `outside edit: swapped ${lines[b].trim()} and ${lines[a].trim()}`;
		},
	};
	const weights = { createNote: 3, createFolder: 1, copy: 2, rename: 3, toFolderNote: 1, vaultMove: 2, put: 7, step: 3, undo: 4, redo: 2, group: 2, ungroup: 2, duplicate: 2, remove: 1, moveOut: 1, moveIn: 2, newScene: 1, outsideEdit: 1, ...(opts.weights ?? {}) };
	const bag = Object.entries(weights).flatMap(([k, w]) => Array(w).fill(k));
	const EXP = app.workspace.getLeavesOfType('file-explorer').find((l) => l.getRoot() === app.workspace.leftSplit).view;
	const verify = async (at) => {
		await B.flush(); await sleep(150); await B.flush(); await sleep(450);
		const note = vault.getAbstractFileByPath(L + '/' + L + '.md');
		const text = await vault.adapter.read(note.path), m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
		if (!m) { fails.push(`${at}: the binder note lost its properties`); return; }
		const lines = m[1].split('\n'), ci = lines.findIndex((l) => /^contents:/.test(l)), list = [];
		let end = ci + 1;
		for (; end < lines.length; end++) { const mm = /^\s+- (.*)$/.exec(lines[end]); if (!mm) break; list.push(mm[1].replace(/^(["'])(.*)\1$/, '$2').replace(/''/g, "'")); }
		const others = [...lines.slice(0, ci), ...lines.slice(end)].join('\n');
		if (others !== 'binder: 1\nplotlines:\n  - Mara\n  - The keeper\'s secret') fails.push(`${at}: the binder note’s other properties changed: ${JSON.stringify(others)}`);
		if (m[2] !== /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(noteText)[1]) fails.push(`${at}: the binder note’s text changed`);
		if (new Set(list).size !== list.length) fails.push(`${at}: duplicates in contents: ${JSON.stringify(list.filter((x, i) => list.indexOf(x) !== i))}`);
		const resolve = (e) => vault.getAbstractFileByPath(`${L}/${e.endsWith('/') ? e.slice(0, -1) : e}`) ?? vault.getAbstractFileByPath(`${L}/${e}.md`);
		const dangling = list.filter((e) => { const f = resolve(e); return !f || !!f.children !== e.endsWith('/'); });
		if (dangling.length) fails.push(`${at}: contents lists items that don’t exist: ${JSON.stringify(dangling)}`);
		const hidden = list.filter((e) => { const f = resolve(e); return f && B.isHiddenNote(f); });
		if (hidden.length) fails.push(`${at}: contents lists folder notes: ${JSON.stringify(hidden)}`);
		// shown order = written order: per folder, the listed items show in the list's order, and the rest after them
		const rel = (f) => f.path.slice(L.length + 1).replace(/\.md$/, '') + (f.children ? '/' : '');
		const parentOf = (x) => { const q = x.replace(/\/$/, ''), i = q.lastIndexOf('/'); return i < 0 ? '' : q.slice(0, i + 1); };
		for (const d of folders()) {
			const fr = d === root() ? '' : rel(d), written = list.filter((x) => parentOf(x) === fr), shown = kids(d).map(rel);
			if (JSON.stringify(shown.slice(0, written.length)) !== JSON.stringify(written)) fails.push(`${at}: “${fr || L}” shows ${JSON.stringify(shown)} but the list has ${JSON.stringify(written)}`);
		}
		// the explorer's rows
		for (const f of folders()) EXP.fileItems[f.path]?.setCollapsed(false);
		await sleep(500);
		// (the explorer only draws the rows in sight: scroll through them all)
		const sc = EXP.containerEl.querySelector('.nav-files-container'), seen = [];
		for (let y = 0; ; y += sc.clientHeight / 2) {
			sc.scrollTop = y; await sleep(70);
			for (const e of EXP.containerEl.querySelectorAll('.tree-item-self[data-path]')) if (e.dataset.path.startsWith(L + '/') && !seen.includes(e.dataset.path)) seen.push(e.dataset.path);
			if (y >= sc.scrollHeight - sc.clientHeight) break;
		}
		sc.scrollTop = 0;
		const rowsNow = seen.join(' | ');
		if (rowsNow !== snap()) fails.push(`${at}: the explorer’s rows differ from the store’s order\n      rows:  ${rowsNow}\n      store: ${snap()}`);
		// no note's text changed, none vanished, none appeared
		for (const [f, body] of bodies) {
			if (vault.getAbstractFileByPath(f.path) !== f) { fails.push(`${at}: “${f.path}” is gone`); bodies.delete(f); continue; }
			if (await vault.adapter.read(f.path) !== body) fails.push(`${at}: the text of “${f.path}” changed`);
		}
		const extra = vault.getMarkdownFiles().filter((f) => (f.path.startsWith(L + '/') || f.path.startsWith(out.path + '/')) && !bodies.has(f) && f !== note);
		if (extra.length) fails.push(`${at}: notes nobody made: ${extra.map((f) => f.path).join(', ')}`);
	};
	for (let i = 1; i <= steps && !fails.length; i++) {
		const name = pick(bag);
		let did = null;
		try { did = await ops[name](); } catch (e) { fails.push(`step ${i} (${name}) threw: ${e.message}`); }
		if (did) history.push(`${i}. ${did}`);
		if (rand() < 0.25) await sleep(int(400)); // sometimes the debounced write lands mid-burst
		if (i % opts.every === 0 || i === steps) await verify(`after step ${i}`);
	}
	return { fails, history };
});

for (const seed of [2, 5, 9]) {
	test(`walk: 120 changes at random without waiting (seed ${seed}): the list, the store and the explorer agree, and no note’s text changes`, async (p, h, t) => {
		const r = await p.ev(`(${WALK})(${seed}, 120, { every: 8, roundTrips: true })`);
		t.ok(r.history.length > 90, `most steps did something (${r.history.length})`);
		t.ok(!r.fails.length, `${r.fails.slice(0, 2).join('\n    ')}\n    last steps: ${r.history.slice(-8).join(' | ')}`);
	});
}

// ================================================================================================================
// Lifecycle
// ================================================================================================================

/** How many listeners the main window's document, window and body have (through the debugger, as DevTools counts). */
const listeners = async (p) => {
	const out = {};
	for (const expr of ['document', 'window', 'document.body']) {
		const d = await p.send('Runtime.evaluate', { expression: expr });
		const r = await p.send('DOMDebugger.getEventListeners', { objectId: d.result.result.objectId });
		out[expr] = r.result.listeners.length;
	}
	return out;
};
const handlers = (p) => p.ev(`[app.workspace._['layout-change']?.length, app.workspace._['file-menu']?.length, app.workspace._['files-menu']?.length, app.vault._['rename']?.length, app.vault._['create']?.length, app.vault._['delete']?.length, app.metadataCache._['changed']?.length]`);
const ALPHABETICAL = ['Part One', 'Part One/Arrival.md', 'Part One/Storm warning.md', 'Part One/The keeper.md', 'Part Two', 'Part Two/Lights out.md', 'Part Two/The wreck.md', 'Epilogue.md', 'Prologue.md', 'The Lighthouse.md'];
const IN_ORDER = ['Prologue.md', 'Part One', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md'];

test('lifecycle: disabled and enabled eight times, Binders leaves nothing behind and comes back the same', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(${file(`${L}/Prologue.md`)}, fm => { fm.label = 'red'; }).then(() => 1)`); await p.sleep(500);
	await rows(p);
	const dom = () => p.ev(`({ icons: document.querySelectorAll('.binders-folder-tag').length, dots: document.querySelectorAll('.binders-explorer-label').length, lines: document.querySelectorAll('.binders-explorer-drop').length, anything: document.querySelectorAll('[class*="binders"], [style*="--binders"]').length, styles: [...document.querySelectorAll('style')].filter(s => /binders-/.test(s.textContent)).length, stockMethod: /sortOrder/.test(Object.getPrototypeOf(${EXP}).getSortedFolderItems.toString()), commands: Object.keys(app.commands.commands).filter(k => k.startsWith('binders:')).length })`);
	/** How often the explorer sorts a folder, and how often the store says "changed", for one move. */
	const work = () => p.ev(`(async () => { const v = ${EXP}, o = Object.getPrototypeOf(v).getSortedFolderItems; let n = 0, ch = 0; v.getSortedFolderItems = function (f) { n++; return o.call(this, f); }; const ref = ${B}.on('changed', () => ch++); await ${B}.moveDown(${file(`${L}/Prologue.md`)}); await new Promise(r => setTimeout(r, 1200)); delete v.getSortedFolderItems; ${B}.offref(ref); await ${B}.moveUp(${file(`${L}/Prologue.md`)}); await ${B}.flush(); return [n, ch]; })()`);
	const on0 = { dom: await dom(), listeners: await listeners(p), handlers: await handlers(p), work: await work() };
	same(t, [on0.dom.icons, on0.dom.dots, on0.dom.stockMethod], [2, 1, false], 'on: two binder icons, one dot, the explorer patched');
	let off0;
	for (let i = 0; i < 8; i++) {
		await off(p);
		const d = await dom();
		same(t, d, { icons: 0, dots: 0, lines: 0, anything: 0, styles: 0, stockMethod: true, commands: 0 }, `off #${i + 1}: nothing of Binders’ in the page, Obsidian’s own sort method back`);
		same(t, short(await rows(p)), ALPHABETICAL, `off #${i + 1}: Obsidian’s order, binder note shown`);
		const now = { listeners: await listeners(p), handlers: await handlers(p) };
		if (!off0) {
			off0 = now;
			// listeners that still act: a click on a folder of the binder, a drag over its rows, the menus
			const a = await p.at(`.nav-folder-title[data-path="${L}/Part Two"] .nav-folder-title-content`);
			await p.click(a.x, a.y); await p.sleep(400);
			t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 0, 'off: a click opens no binder view');
			await rows(p);
			const s = await hold(p, `${L}/Epilogue.md`, top(await row(p, `${L}/Part One/Arrival.md`))); await cancel(p);
			same(t, [s.hint, s.line], ['Move into “Part One”', null], 'off: a drag is Obsidian’s');
			const m = await rightClick(p, `${L}/Part One`); await closeMenu(p);
			same(t, m.filter(isOurs), [], 'off: nothing of ours in a menu');
			await p.move(900, 500, 2);
			off0 = { listeners: await listeners(p), handlers: await handlers(p) };
		} else if (i === 7) same(t, now, off0, 'off: as many listeners and handlers as the first time');
		await on(p);
	}
	await rows(p);
	same(t, short(await rows(p)), IN_ORDER, 'on again: binder order');
	const on8 = { dom: await dom(), listeners: await listeners(p), handlers: await handlers(p), work: await work() };
	same(t, on8, on0, 'after eight rounds: the same elements, listeners, handlers, and the same work for one move');
});

test('lifecycle: the explorer closed (a move made meanwhile), opened in the right sidebar, dragged in there, and back on the left', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(${file(`${L}/Prologue.md`)}, fm => { fm.label = 'red'; }).then(() => 1)`); await p.sleep(500);
	const snap = () => p.ev(`(async () => { const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); await new Promise(r => setTimeout(r, 300)); const v = l.view; for (const f of ${j(FOLDERS)}) v.fileItems[f]?.setCollapsed(false); await new Promise(r => setTimeout(r, 500)); return { rows: [...v.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith('The Lighthouse/')).map(x => x.slice(15)).join(' | '), icons: v.containerEl.querySelectorAll('.binders-folder-tag').length, dots: v.containerEl.querySelectorAll('.binders-explorer-label').length, side: l.getRoot() === app.workspace.rightSplit ? 'right' : l.getRoot() === app.workspace.leftSplit ? 'left' : 'other' }; })()`);
	await p.ev(`(() => { app.workspace.getLeavesOfType('file-explorer').forEach(l => l.detach()); return 1; })()`); await p.sleep(400);
	await p.ev(`${B}.moveDown(${file(`${L}/Prologue.md`)}).then(() => 1)`); await p.sleep(500);
	await p.ev(`(async () => { await app.workspace.getRightLeaf(false).setViewState({ type: 'file-explorer', active: true }); app.workspace.rightSplit.expand(); })().then(() => 1)`); await p.sleep(900);
	const moved = 'Part One | Part One/Arrival.md | Part One/The keeper.md | Part One/Storm warning.md | Prologue.md | Part Two | Part Two/The wreck.md | Part Two/Lights out.md | Epilogue.md';
	same(t, await snap(), { rows: moved, icons: 2, dots: 1, side: 'right' }, 'in the right sidebar: binder order (with the move made while it was closed), icons and dots');
	const at = await p.ev(`(() => { const v = app.workspace.getLeavesOfType('file-explorer')[0].view; const q = (x) => { const r = v.containerEl.querySelector('.tree-item-self[data-path="' + x + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: r.top }; }; return { from: q('The Lighthouse/Epilogue.md'), to: q('The Lighthouse/Part One/Arrival.md') }; })()`);
	const s = await drag(p, at.from, { x: at.to.x, y: at.to.t + 3 });
	t.eq(s.hint, 'Move before “Arrival”', 'a drag there');
	t.ok(s.line && Math.abs(s.line.y - at.to.t) <= 1.5, 'its line is on the row in the right sidebar: ' + j(s.line));
	same(t, (await listOnDisk(p)).slice(0, 3), ['Part One/', 'Part One/Epilogue', 'Part One/Arrival'], 'the drop lands');
	await p.ev(`(async () => { app.workspace.getLeavesOfType('file-explorer').forEach(l => l.detach()); await app.workspace.getLeftLeaf(false).setViewState({ type: 'file-explorer' }); app.workspace.rightSplit.collapse(); app.workspace.leftSplit.expand(); })().then(() => 1)`); await p.sleep(900);
	same(t, await snap(), { rows: 'Part One | Part One/Epilogue.md | Part One/Arrival.md | Part One/The keeper.md | Part One/Storm warning.md | Prologue.md | Part Two | Part Two/The wreck.md | Part Two/Lights out.md', icons: 2, dots: 1, side: 'left' }, 'back on the left: the same');
});

test('lifecycle: another plugin wrapping the explorer’s sort after Binders: either can be turned off first', async (p, h, t) => {
	const proto = `Object.getPrototypeOf(${EXP})`;
	await rows(p);
	try {
		// the other plugin wraps what it finds (Binders' patch) and counts its calls
		await p.ev(`(() => { const pr = ${proto}; window.__theirs = pr.getSortedFolderItems; window.__calls = 0; pr.getSortedFolderItems = function (f) { window.__calls++; return window.__theirs.call(this, f); }; ${EXP}.requestSort(); return 1; })()`); await p.sleep(500);
		same(t, short(await rows(p)), IN_ORDER, 'wrapped: still binder order');
		await off(p);
		same(t, short(await rows(p)), ALPHABETICAL, 'Binders off first: Obsidian’s order');
		t.ok(await p.ev(`(() => { const n = window.__calls; ${EXP}.sort(); return window.__calls > n; })()`), 'and the other plugin’s wrapper still runs');
		// the other plugin goes: it puts back what it found, which no longer does anything
		await p.ev(`(() => { ${proto}.getSortedFolderItems = window.__theirs; ${EXP}.requestSort(); return 1; })()`); await p.sleep(500);
		same(t, short(await rows(p)), ALPHABETICAL, 'both off: Obsidian’s order');
		await on(p);
		same(t, short(await rows(p)), IN_ORDER, 'Binders on again: binder order');
		// the other way round: the other plugin goes first, while Binders stays on
		await p.ev(`(() => { const pr = ${proto}; window.__theirs = pr.getSortedFolderItems; pr.getSortedFolderItems = function (f) { return window.__theirs.call(this, f); }; ${EXP}.requestSort(); return 1; })()`); await p.sleep(400);
		await p.ev(`(() => { ${proto}.getSortedFolderItems = window.__theirs; ${EXP}.requestSort(); return 1; })()`); await p.sleep(500);
		same(t, short(await rows(p)), IN_ORDER, 'the other plugin off first: still binder order');
		await off(p);
		t.ok(await p.ev(`/sortOrder/.test(${proto}.getSortedFolderItems.toString())`), 'then Binders off: Obsidian’s own method is back');
	} finally { await p.ev(`(async () => { if (app.plugins.plugins.binders) await app.plugins.disablePlugin('binders'); })().then(() => 1)`); await on(p); }
	same(t, short(await rows(p)), IN_ORDER, 'and on again: binder order');
});

// ================================================================================================================
// Look
// ================================================================================================================

test('look: the binder icon, label dots and the drop line, measured against the rows Obsidian draws', async (p, h, t) => {
	const LONG = 'A very long scene name that will certainly not fit in the sidebar at all', RTL = 'שלום עולם פרק ראשון';
	await mk(p, { [`${L}/Part One/Part One.md`]: '---\nlabel: purple\n---\n', [`${L}/Part One/${LONG}.md`]: '---\nlabel: orange\n---\n', [`${L}/Part One/${RTL}.md`]: '---\nlabel: cyan\n---\n', [`${L}/Part One/Deep/Deeper/Deepest scene.md`]: '---\nlabel: pink\n---\n', 'Plain/y.md': 'y' });
	await p.ev(`app.fileManager.processFrontMatter(${file(`${L}/Prologue.md`)}, fm => { fm.label = 'red'; }).then(() => 1)`); await p.sleep(800);
	await rows(p, '', [...FOLDERS, `${L}/Part One/Deep`, `${L}/Part One/Deep/Deeper`, 'Plain']);
	const m = await p.ev(`(() => { const v = ${EXP}; const q = (path) => v.containerEl.querySelector('.tree-item-self[data-path="' + path + '"]'); const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, h: r.height, cy: (r.top + r.bottom) / 2 }; };
		const binder = q('The Lighthouse'), plain = q('Plain'), icon = binder.querySelector('.binders-folder-tag'), chev = binder.querySelector('.collapse-icon');
		return {
			icon: { dy: Math.abs(R(icon).cy - R(binder).cy), last: binder.lastElementChild === icon, fromEnd: R(binder).r - R(icon).r, chev: !!chev },
			rowH: [R(binder).h, R(plain).h, R(q('The Lighthouse/Prologue.md')).h, R(q('Plain/y.md')).h],
			dots: [...v.containerEl.querySelectorAll('.binders-explorer-label')].map(d => { const row = d.parentElement, name = row.querySelector('.tree-item-inner'); return { w: R(d).w, h: R(d).h, dy: Math.abs(R(d).cy - R(row).cy), fromEnd: R(row).r - R(d).r, gap: R(d).l - R(name).r, clipped: name.scrollWidth > name.clientWidth }; }),
			padEnd: parseFloat(getComputedStyle(q('The Lighthouse/Prologue.md')).paddingRight),
		}; })()`);
	// (a binder says so in Obsidian's own tag at the end of its row, where the icon before its name was)
	t.ok(m.icon.dy <= 1 && m.icon.last && Math.abs(m.icon.fromEnd - m.padEnd) <= 0.5, 'the binder’s tag is centred on its row, at the row’s end padding: ' + j(m.icon));
	t.ok(m.rowH.every((x) => Math.abs(x - m.rowH[1]) < 0.1), 'rows with an icon or a dot are as tall as plain ones: ' + j(m.rowH));
	t.eq(m.dots.length, 5, 'five dots (a folder’s is its folder note’s label)');
	// (a small square with rounded corners, as a color is shown in a canvas's menu)
	t.ok(m.dots.every((d) => d.w === 10 && d.h === 7 && d.dy <= 0.5 && Math.abs(d.fromEnd - m.padEnd) <= 0.5), 'each 10 by 7 px, centred on its row, at the row’s end padding: ' + j(m.dots));
	t.ok(m.dots.filter((d) => d.clipped).length === 1 && m.dots.every((d) => d.gap >= 4 - 0.5), 'a long name is cut short with 4 px before its dot');
	const a = await row(p, `${L}/Part One/Arrival.md`);
	await hold(p, `${L}/Epilogue.md`, top(a));
	let line;
	try { line = await p.ev(`(() => { const e = document.querySelector('.binders-explorer-drop'); const r = e.getBoundingClientRect(), c = getComputedStyle(e); const probe = document.body.createDiv({ cls: 'drop-indicator is-active' }); const native = getComputedStyle(probe).borderTopColor; probe.remove(); return { l: r.left, r: r.right, y: r.top + r.height / 2, h: r.height, color: c.borderTopColor, native, pointer: c.pointerEvents }; })()`); } finally { await cancel(p); }
	t.ok(Math.abs(line.l - a.name) <= 1 && Math.abs(line.r - a.r) <= 1 && Math.abs(line.y - a.t) <= 1.5, 'the line runs from where the name starts to the row’s end, on its top edge: ' + j(line));
	same(t, [line.color, line.pointer], [line.native, 'none'], 'in the color of Obsidian’s own insertion line, and never under the pointer');
});

// ================================================================================================================
// A big binder
// ================================================================================================================

/** A binder with one folder of `n` notes, listed last to first. */
async function bigBinder(p, n) {
	await p.ev(`(async () => { await app.vault.createFolder('Big'); await app.vault.createFolder('Big/Part'); const c = []; for (let i = 0; i < ${n}; i++) { const name = 'Scene ' + String(i).padStart(4, '0'); await app.vault.adapter.write('Big/Part/' + name + '.md', 'scene ' + i); c.push('Part/' + name); } c.reverse(); await app.vault.create('Big/Big.md', '---\\nbinder: 1\\ncontents:\\n  - Part/\\n' + c.map(x => '  - ' + x).join('\\n') + '\\n---\\n'); })().then(() => 1)`);
	if (!(await until(p, `app.vault.getAbstractFileByPath('Big/Part')?.children.length === ${n} && ${B}.isBinderFolder(${file('Big')})`, 120000))) throw new Error('the big binder wasn’t made');
	await p.sleep(2500);
	await p.ev(`(async () => { const v = ${EXP}; app.workspace.leftSplit.expand(); await v.fileItems['Big'].setCollapsed(false); await v.fileItems['Big/Part'].setCollapsed(false); })().then(() => 1)`); await p.sleep(600);
}
const dropBig = (p) => p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Big'); if (f) await app.vault.delete(f, true); })().then(() => 1)`).then(() => p.sleep(1500));
/** What one `dragover` over a row of the big folder costs, in ms (the mean of ten), with these files being dragged. */
const dragoverCost = (p, files) => p.ev(`(() => { const v = ${EXP}; const target = [...v.containerEl.querySelectorAll('.tree-item-self[data-path^="Big/Part/"]')][5]; const r = target.getBoundingClientRect(); const fs = ${j(files)}.map(x => app.vault.getAbstractFileByPath(x)); app.dragManager.draggable = fs.length === 1 ? { type: 'file', file: fs[0] } : { type: 'files', files: fs }; const dt = new DataTransfer(); let total = 0, taken = 0; for (let i = 0; i < 10; i++) { const e = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: r.left + 80, clientY: r.top + 3 + (i % 2), dataTransfer: dt }); const t0 = performance.now(); target.querySelector('.tree-item-inner').dispatchEvent(e); total += performance.now() - t0; if (document.querySelector('.binders-explorer-drop')) taken++; } app.dragManager.draggable = null; document.querySelectorAll('.binders-explorer-drop').forEach(e => e.remove()); return { ms: total / 10, taken }; })()`);

test('big: 5,000 notes in one folder of a binder: the first sort, a whole re-sort, a drag, a move and its write stay quick', async (p, h, t) => {
	try {
		await bigBinder(p, 5000);
		const sort = await p.ev(`(() => { const v = ${EXP}, f = app.vault.getAbstractFileByPath('Big/Part'); ${B}.touch(${B}.at('Big'), false); const out = []; for (let i = 0; i < 6; i++) { const t0 = performance.now(); v.getSortedFolderItems(f); out.push(performance.now() - t0); } return { first: out[0], warm: out.slice(1).reduce((a, b) => a + b) / 5, top: v.getSortedFolderItems(f).slice(0, 2).map(i => i.file.name) }; })()`);
		same(t, sort.top, ['Scene 4999.md', 'Scene 4998.md'], 'in binder order');
		t.ok(sort.first < 150 && sort.warm < 80, `sorting the folder: ${sort.first.toFixed(1)} ms the first time after a change, ${sort.warm.toFixed(1)} ms after`);
		const whole = await p.ev(`(() => { const v = ${EXP}; const t0 = performance.now(); v.sort(); return performance.now() - t0; })()`);
		t.ok(whole < 150, `re-sorting the whole explorer: ${whole.toFixed(1)} ms`);
		const one = await dragoverCost(p, ['Big/Part/Scene 0100.md']);
		t.eq(one.taken, 10, 'each dragover places the line');
		t.ok(one.ms < 50, `one note dragged: ${one.ms.toFixed(1)} ms per dragover`);
		const moved = await p.ev(`(async () => { const f = ${file('Big/Part')}, kids = ${B}.orderedChildren(f); const t0 = performance.now(); await ${B}.put([kids[10]], f, kids[3]); const t1 = performance.now(); await ${B}.flush(); return [t1 - t0, performance.now() - t1]; })()`);
		t.ok(moved[0] < 300 && moved[1] < 1500, `a move: ${moved[0].toFixed(0)} ms, and its write: ${moved[1].toFixed(0)} ms`);
		t.eq((await contents(p, 'Big/Big.md')).length, 5001, 'every note still listed');
		console.log(`    (5,000 notes: sort ${sort.first.toFixed(1)}/${sort.warm.toFixed(1)} ms, whole explorer ${whole.toFixed(1)} ms, dragover ${one.ms.toFixed(1)} ms, move ${moved[0].toFixed(0)} ms + write ${moved[1].toFixed(0)} ms)`);
	} finally { await dropBig(p); }
});

// ================================================================================================================
// Bugs
// ================================================================================================================

test('BUG: a drop let go in the gap between two rows (where the line is drawn) goes where the line showed', async (p, h, t) => {
	await rows(p);
	const a = await row(p, `${L}/Part One/Arrival.md`), k = await row(p, `${L}/Part One/The keeper.md`);
	t.ok(k.t - a.b >= 1, `rows are ${(k.t - a.b).toFixed(1)} px apart`);
	const gap = { x: a.x, y: (a.b + k.t) / 2 };
	let s = await hold(p, `${L}/Epilogue.md`, bottom(a));
	try {
		t.eq(s.hint, 'Move after “Arrival”', 'just above the gap: after Arrival, with a line');
		s = await over(p, gap);
	} finally { await release(p, gap); }
	// between the rows the pointer is over neither title, so the drag falls back to Obsidian's "move into the folder":
	// the line goes, the whole folder is tinted, and a drop there puts the note last in the folder
	same(t, (await listOnDisk(p)).slice(1, 6), ['Part One/', 'Part One/Arrival', 'Part One/Epilogue', 'Part One/The keeper', 'Part One/Storm warning'], `the note dropped between Arrival and The keeper is between them (in the gap the hint was “${s.hint}”, the line ${s.line ? 'showed' : 'was gone'}, tinted: ${j(s.into)})`);
	t.ok(s.line && !s.into.length, 'and the line stays (no folder tint) while the pointer crosses the gap');
});

test('BUG: undo puts back the last two notes of a folder dragged to its top', async (p, h, t) => {
	await rows(p);
	const o0 = await ord(p);
	await select(p, [`${L}/Part One/The keeper.md`, `${L}/Part One/Storm warning.md`]);
	await drag(p, `${L}/Part One/The keeper.md`, top(await row(p, `${L}/Part One/Arrival.md`)));
	t.eq(short(await order(p)).slice(2, 5).join(), 'Part One/The keeper.md,Part One/Storm warning.md,Part One/Arrival.md', 'both are above Arrival');
	await clearNotices(p);
	t.ok(await undo(p), 'undo');
	// each goes back "beside the neighbours it had", but the only neighbour the last one had is the other moved note,
	// still at the top: nothing moves, and the notice says it did
	t.eq(await ord(p), o0, `the order is as before (notice: ${j(await notices(p))})`);
});

test('BUG: redo puts notes back at the end of the folder they were moved to the end of', async (p, h, t) => {
	const o0 = await ord(p);
	await put(p, [`${L}/Part One/Arrival.md`, `${L}/Prologue.md`], `${L}/Part One`, null);
	const o1 = await ord(p);
	t.eq(o1, 'Part One | Part One/The keeper.md | Part One/Storm warning.md | Part One/Arrival.md | Part One/Prologue.md | Part Two | Part Two/The wreck.md | Part Two/Lights out.md | Epilogue.md', 'Arrival and Prologue are last in Part One');
	t.ok(await undo(p), 'undo'); t.eq(await ord(p), o0, 'undone');
	t.ok(await redo(p), 'redo');
	t.eq(await ord(p), o1, 'redone: they are last in Part One again');
});

test('BUG: undo puts a note that was first in its folder first again when the note after it is gone', async (p, h, t) => {
	await put(p, [`${L}/Part One/Arrival.md`], L, null);
	await p.ev(`app.vault.delete(${file(`${L}/Part One/The keeper.md`)}).then(() => 1)`); await p.sleep(300);
	t.ok(await undo(p), 'undo');
	t.eq(short(await order(p)).slice(1, 4).join(), 'Part One,Part One/Arrival.md,Part One/Storm warning.md', 'Arrival is first in Part One, where it was (not last)');
});

test('BUG: an undo that can’t be made doesn’t block the undos before it', async (p, h, t) => {
	const o0 = await ord(p);
	await put(p, [`${L}/Epilogue.md`], L, `${L}/Prologue.md`);
	await put(p, [`${L}/Part Two/The wreck.md`], L, null);
	await p.ev(`app.vault.delete(${file(`${L}/Part Two`)}, true).then(() => 1)`); await p.sleep(400);
	await clearNotices(p);
	// The wreck can't go back (its folder is gone): said once, and then the move before it is next
	const said = [];
	for (let i = 0; i < 3; i++) { await undo(p); said.push(...(await notices(p))); await clearNotices(p); }
	t.ok(short(await order(p)).indexOf('Epilogue.md') > short(await order(p)).indexOf('Prologue.md'), `three undos later Epilogue is back after Prologue (the notices: ${j(said)}; still waiting: ${j(await p.ev(`${B}.undos.map(u => u.label)`))}; first order: ${o0})`);
});

test('BUG: “Undo last move” with the file explorer focused undoes the move just made there, not an older one in the open note’s binder', async (p, h, t) => {
	await mk(p, OTHER);
	await h.open(`${L}/Prologue.md`);
	await h.run('move-down'); await p.sleep(300);
	const moved = await ord(p);
	await rows(p, '', [...FOLDERS, 'Other']);
	await drag(p, 'Other/Three.md', top(await row(p, 'Other/One.md')));
	t.eq(await ord(p, 'Other'), 'Other/Three.md | Other/One.md | Other/Two.md', 'Three dragged to the top of the other binder');
	t.eq(await p.ev(`app.workspace.activeLeaf?.view.getViewType()`), 'file-explorer', 'the explorer has the focus');
	await clearNotices(p);
	t.ok(await undo(p), 'undo');
	t.eq(await ord(p, 'Other'), 'Other/One.md | Other/Two.md | Other/Three.md', `the drag is undone (notice: ${j(await notices(p))})`);
	t.eq(await ord(p), moved, 'and the older move in the open note’s binder is left alone');
});

test('BUG: a binder dragged into another binder keeps its order', async (p, h, t) => {
	await mk(p, OTHER);
	await rows(p, '', [...FOLDERS, 'Other']);
	const s = await drag(p, L, top(await row(p, 'Other/Two.md')));
	t.eq(s.hint, 'Move before “Two”', 'the hint');
	await p.sleep(900);
	same(t, await listOnDisk(p, 'Other/Other.md'), ['One', `${L}/`, ...LIST.map((x) => `${L}/${x}`), 'Two', 'Three'], 'it is a folder of the other binder now, before Two, with its scenes in the order they had (not by name)');
});

test('BUG: a binder dragged into another binder can be undone', async (p, h, t) => {
	await mk(p, OTHER);
	await rows(p, '', [...FOLDERS, 'Other']);
	await drag(p, L, top(await row(p, 'Other/Two.md')));
	await p.sleep(900);
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(`Other/${L}`)})`), 'it moved');
	// the move is remembered under the dragged binder's own note, which is no binder's note any more
	t.ok(await undo(p, 900), `“Undo last move” is there (remembered: ${j(await p.ev(`${B}.undos.map(u => u.label + ' in ' + u.note.path)`))})`);
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L)}) && ${B}.isBinderFolder(${file(L)})`), 'and puts the binder back at the top of the vault');
});

test('BUG: a note dragged from outside any binder to a place in one can be undone', async (p, h, t) => {
	await mk(p, { 'Loose.md': 'loose' });
	await rows(p, '', FOLDERS);
	const s = await drag(p, 'Loose.md', bottom(await row(p, `${L}/Part One/Arrival.md`)));
	t.eq(s.hint, 'Move after “Arrival”', 'the hint');
	t.eq(short(await order(p)).slice(2, 4).join(), 'Part One/Arrival.md,Part One/Loose.md', 'it is after Arrival');
	t.ok(await undo(p, 700), '“Undo last move” is there');
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath('Loose.md')`), 'and puts the note back where it came from');
});

test('BUG: a refused drop says why in a notice when the note is let go', async (p, h, t) => {
	await mk(p, { [`${L}/Part One/The wreck.md`]: 'another wreck' });
	await rows(p);
	await clearNotices(p);
	const to = top(await row(p, `${L}/Part One/Arrival.md`));
	const s = await hold(p, `${L}/Part Two/The wreck.md`, to);
	await release(p, to);
	t.eq(s.hint, '“Part One” already has “The wreck”', 'the hint while held');
	// the refusal sets dropEffect to "none", so Chromium ends the drag without a `drop` event and the notice is never made
	same(t, await notices(p), ['“Part One” already has “The wreck”.'], 'the same reason as a notice once it is dropped');
});

test('BUG: ungroup is all or nothing when a file can’t be moved half-way', async (p, h, t) => {
	const o0 = await ord(p);
	const r = await p.ev(failingRename(2, `${B}.ungroup(${file(`${L}/Part One`)})`));
	await p.sleep(500);
	t.eq(r, 'refused: EBUSY: the file is locked', 'the second note can’t be moved');
	const now = await ord(p);
	t.ok(now === o0 || !!(await p.ev(`${B}.undoable(${j(L)})`)), `either nothing came out of the folder, or the half that did can be undone (now: ${now})`);
});

test('BUG: a copy made right after a move (before the list is written) is still placed after its original', async (p, h, t) => {
	await p.ev(`(async () => { await ${B}.moveDown(${file(`${L}/Prologue.md`)}); await app.vault.copy(${file(`${L}/Part One/Arrival.md`)}, ${j(`${L}/Part One/Arrival 1.md`)}); })().then(() => 1)`);
	await p.sleep(600);
	same(t, (await listOnDisk(p)).slice(0, 5), ['Part One/', 'Part One/Arrival', 'Part One/Arrival 1', 'Part One/The keeper', 'Part One/Storm warning'], '“Arrival 1” is right after “Arrival”, not last');
});

test('BUG: redo of “New folder from selection” makes the folder under the name it was given', async (p, h, t) => {
	const made = await p.ev(`${B}.group([${file(`${L}/Part One/Arrival.md`)}, ${file(`${L}/Part One/Storm warning.md`)}]).then(f => f.path)`);
	await rename(p, made, `${L}/Part One/On the island`); await p.sleep(300); // as typing its name in the explorer does
	const named = await ord(p);
	t.ok(await undo(p, 800), 'undo'); t.ok(await redo(p, 800), 'redo');
	t.eq(await ord(p), named, 'the folder is back as “On the island”, not “Untitled”');
});

test('BUG: undoing the move of a note that has since been deleted doesn’t say it was undone', async (p, h, t) => {
	await put(p, [`${L}/Epilogue.md`], L, `${L}/Prologue.md`);
	await p.ev(`app.vault.delete(${file(`${L}/Epilogue.md`)}).then(() => 1)`); await p.sleep(300);
	await clearNotices(p);
	const offered = await undo(p);
	same(t, (await notices(p)).filter((n) => /^Undid/.test(n)), [], `nothing was put back, so nothing says “Undid” (the command was ${offered ? 'offered' : 'not offered'})`);
});

// ================================================================================================================
// Roughness
// ================================================================================================================

test('UX: a selection in a binder has one “new folder” item, not Obsidian’s and Binders’ side by side', async (p, h, t) => {
	await rows(p);
	await select(p, [`${L}/Part One/Storm warning.md`, `${L}/Part One/Arrival.md`]);
	const a = await row(p, `${L}/Part One/Arrival.md`); await p.right(a.x, a.y); await p.sleep(250);
	const m = await menuOf(p); await closeMenu(p);
	const folders = m.filter((x) => /^New folder (with|from) selection/.test(x));
	// Obsidian's own (first in the menu) puts the folder last in Part One with the notes in the order they were
	// clicked, and can't be undone; Binders' (six items down) puts it where the first note was, in binder order
	t.eq(folders.length, 1, 'one item makes a folder from the selection: ' + j(folders));
});

// (Until 0.12.58 this picked Obsidian's own "New folder with selection (2 items)", which put the folder last with the
// notes in the order clicked. That item is no longer in the menu where Binders offers its own.)
test('UX: the one “new folder” item of a selection in a binder puts the folder where the notes were, in binder order; a selection across two folders still has Obsidian’s own', async (p, h, t) => {
	await rows(p);
	await select(p, [`${L}/Part One/Storm warning.md`, `${L}/Part One/Arrival.md`]);
	const a = await row(p, `${L}/Part One/Arrival.md`); await p.right(a.x, a.y); await p.sleep(250);
	await pick(p, 'New folder from selection'); await p.sleep(900);
	await p.type('Island'); await p.key('Enter'); await p.sleep(900);
	t.eq(short(await order(p)).slice(1, 6).join(' | '), 'Part One | Part One/Island | Part One/Island/Arrival.md | Part One/Island/Storm warning.md | Part One/The keeper.md', 'the folder is where Arrival was, holding Arrival then Storm warning');
	same(t, (await listOnDisk(p)).slice(1, 6), ['Part One/', 'Part One/Island/', 'Part One/Island/Arrival', 'Part One/Island/Storm warning', 'Part One/The keeper'], 'and the binder note on disk says so');
	// notes of two folders: Binders offers no folder for them, so Obsidian's own item is the one there
	await clearSelection(p);
	await select(p, [`${L}/Prologue.md`, `${L}/Part One/The keeper.md`]);
	const k = await row(p, `${L}/Part One/The keeper.md`); await p.right(k.x, k.y); await p.sleep(250);
	const m = await menuOf(p); await closeMenu(p);
	same(t, m.filter((x) => /^New folder (with|from) selection/.test(x)), ['New folder with selection (2 items)'], 'across two folders: one item, Obsidian’s own');
});

test('UX: Obsidian’s “Make a copy” of a folder in a binder puts the copy after it, with its scenes in the same order', async (p, h, t) => {
	await rows(p);
	await rightClick(p, `${L}/Part One`); await pick(p, 'Make a copy'); await p.sleep(1200);
	await p.key('Escape'); await p.sleep(400); // its name is being typed in the explorer
	await rows(p, L, [...FOLDERS, `${L}/Part One 1`]);
	const o = short(await order(p));
	// (a copied scene is put right after its original; a copied folder goes to the end of the binder, its scenes by name)
	t.eq(o.slice(5, 9).join(' | '), 'Part One 1 | Part One 1/Arrival.md | Part One 1/The keeper.md | Part One 1/Storm warning.md', 'the copy is right after Part One, in Part One’s order: ' + o.join(' | '));
});

test('UX: the folder a binder view shows is marked in the explorer, as the open note is', async (p, h, t) => {
	await rows(p);
	await h.open(`${L}/Prologue.md`);
	t.ok(await p.ev(`${EXP}.containerEl.querySelector('.tree-item-self[data-path="${L}/Prologue.md"]').classList.contains('is-active')`), 'the open note’s row is marked (Obsidian’s own)');
	const at = await p.at(`.nav-folder-title[data-path="${L}/Part Two"] .nav-folder-title-content`);
	await p.click(at.x, at.y); await p.sleep(700);
	t.eq(await p.ev(`app.workspace.activeLeaf?.view.getViewType()`), 'binders-view', 'the click opened the binder view');
	same(t, await p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self.is-active')].map(e => e.dataset.path)`), [`${L}/Part Two`], 'the folder it shows is the marked row');
});

test('UX: the last note of a binder’s last folder can be dragged out of it, to after the folder', async (p, h, t) => {
	await put(p, [`${L}/Epilogue.md`], L, `${L}/Prologue.md`); await flush(p);
	await rows(p);
	const lo = await row(p, `${L}/Part Two/Lights out.md`), hints = [];
	// left of its own name, on its own row: one level out, as the same place means for any other note
	for (const at of [{ x: lo.l + 4, y: lo.b - 3 }, { x: lo.l + 4, y: lo.y }, { x: lo.l + 4, y: lo.b + 1 }]) { hints.push((await hold(p, `${L}/Part Two/Lights out.md`, at)).hint); await cancel(p); }
	t.ok(hints.includes('Move after “Part Two”'), 'somewhere left of its name means “after Part Two”: ' + j(hints));
});

test('UX: a note dropped into a folder (Obsidian’s own move) can be undone like a drop between rows', async (p, h, t) => {
	await put(p, [`${L}/Part Two/Lights out.md`], `${L}/Part Two`, `${L}/Part Two/The wreck.md`);
	await rows(p);
	const before = await ord(p), one = await row(p, `${L}/Part One`);
	const s = await drag(p, `${L}/Prologue.md`, { x: one.x, y: one.y });
	t.eq(s.hint, 'Move into “Part One”', 'dropped on the folder’s middle');
	await p.sleep(400);
	await clearNotices(p);
	await undo(p);
	// that drop isn't remembered, so "Undo last move" takes back the move before it instead
	t.eq(await ord(p), before, `undo takes back the drop just made (notice: ${j(await notices(p))})`);
});

test('UX: 20 notes dragged together over a folder of 5,000 keep the pointer smooth (under a frame per dragover)', async (p, h, t) => {
	try {
		await bigBinder(p, 5000);
		const one = await dragoverCost(p, ['Big/Part/Scene 0100.md']);
		const twenty = await dragoverCost(p, Array.from({ length: 20 }, (_, i) => 'Big/Part/Scene ' + String(1000 + i).padStart(4, '0') + '.md'));
		// the order of the dragged items is worked out again for each of them on every dragover
		t.ok(twenty.ms < 16.7, `each dragover takes ${twenty.ms.toFixed(0)} ms with 20 notes (${one.ms.toFixed(0)} ms with one; Obsidian’s own takes under 1 ms)`);
	} finally { await dropBig(p); }
});

test('UX: binder order comes back by itself when another plugin, turned off, takes the explorer patch with it', async (p, h, t) => {
	const proto = `Object.getPrototypeOf(${EXP})`;
	await rows(p);
	try {
		// a plugin that patched the explorer before Binders, by plain assignment, and puts back what it found when it's turned off
		await off(p);
		await p.ev(`(() => { const pr = ${proto}; window.__theirs = pr.getSortedFolderItems; pr.getSortedFolderItems = function (f) { return window.__theirs.call(this, f); }; return 1; })()`);
		await on(p);
		same(t, short(await rows(p)), IN_ORDER, 'binder order on top of the other plugin’s patch');
		await p.ev(`(() => { ${proto}.getSortedFolderItems = window.__theirs; ${EXP}.requestSort(); return 1; })()`); await p.sleep(500);
		await p.ev(`${B}.moveDown(${file(`${L}/Prologue.md`)}).then(() => 1)`); await p.sleep(700); // any change to the binder
		t.eq(short(await rows(p)).join(' | '), await ord(p), `the explorer shows the binder’s order after its next change (Binders says “${await p.ev(`${PL}.explorer.status`)}”)`);
	} finally { await p.ev(`(async () => { if (app.plugins.plugins.binders) await app.plugins.disablePlugin('binders'); })().then(() => 1)`); await on(p); }
});

// ================================================================================================================
// Reloads (last: each starts Obsidian again)
// ================================================================================================================

testRaw('lifecycle: a cold start with no metadata cache ends in binder order, with nothing said', async (p, h, t) => {
	try {
		await p.ev(`(async () => { for (const d of await indexedDB.databases()) if (/-cache$/.test(d.name)) await new Promise(r => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }); })().then(() => 1)`);
		await reload(p);
		await p.focusMain();
		await p.ev(`${B}.settled.then(() => 1)`);
		t.eq(await p.ev(`${PL}.explorer.status`), 'patched', 'the explorer is patched');
		same(t, await p.ev(`${B}.all().map(b => b.folder.path).sort()`), [LF, L], 'both binders are found once the cache has filled');
		same(t, short(await rows(p)), IN_ORDER, 'binder order, binder note hidden');
		t.eq(await p.ev(`document.querySelectorAll('.binders-folder-tag').length`), 2, 'the icons');
		same(t, await notices(p), [], 'no notice');
	} finally { await tidy(p); }
});

testRaw('mobile: the explorer’s menus offer the same items, in the same sections, as on desktop', async (p, h, t) => {
	await reload(p, true);
	try {
		t.ok(await p.ev(`app.isMobile`), 'Obsidian is in mobile mode');
		const EX = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
		await p.ev(`(async () => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); await new Promise(r => setTimeout(r, 500)); for (const f of ${j([...FOLDERS, LF])}) l.view.fileItems[f]?.setCollapsed(false); })().then(() => 1)`); await p.sleep(700);
		same(t, short(await p.ev(`[...${EX}.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith('The Lighthouse/'))`)), IN_ORDER, 'binder order');
		const menu = async (path) => {
			await p.ev(`(() => { const e = ${EX}.containerEl.querySelector('.tree-item-self[data-path="${path}"]'); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + r.height / 2, button: 2 })); return 1; })()`);
			await p.sleep(500);
			const m = await menuOf(p);
			await p.key('Escape'); await p.sleep(300);
			await p.ev(`(() => { document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`);
			return m ?? [];
		};
		const note = await menu(`${L}/Part One/The keeper.md`), folder = await menu(`${L}/Part One`);
		same(t, note.filter(isOurs), ['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move up', 'Move down'], 'a scene');
		same(t, folder.filter(isOurs), ['Open binder', 'New scene here', 'Export...', 'Take a snapshot', 'Show snapshots...', 'Move up', 'Move down'], 'a folder');
		same(t, (await menu(`${LF}/Island.md`)).filter(isOurs), ['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move up', 'Move down'], 'a Longform scene');
		let i = note.indexOf('Show in binder');
		same(t, note.slice(i, i + 5), ['Show in binder', '---', 'New scene after this', '---', 'Make a copy'], 'the same sections as on desktop');
		same(t, folder.slice(0, 3), ['Open binder', '---', 'New note'], '“Open binder” first');
		t.eq(folder[folder.length - 1], 'Delete', '“Delete” last');
	} finally { await reload(p, false); await tidy(p); }
	t.ok(!(await p.ev(`app.isMobile`)), 'back on desktop');
});
