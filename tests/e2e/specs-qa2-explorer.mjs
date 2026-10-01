// QA round 2: the file explorer (dragging to reorder above all) and the binder store, driven as a writer would.
// Tests named "BUG: …" fail on purpose until the bug they show is fixed, and "UX: …" until the roughness they show is
// smoothed; the rest are regressions for behaviour that was checked and is solid.
import { B, PL, NOTE, j, file, until, read, contents, flush } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa2 explorer: ' + name, fn });

const L = 'The Lighthouse', LF = 'Longform demo';
const EXP = `app.workspace.getLeavesOfType('file-explorer').find(l => l.getRoot() === app.workspace.leftSplit).view`;
const FOLDERS = [L, `${L}/Part One`, `${L}/Part Two`];
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const KEEP_FILES = ['Prologue.md', 'Epilogue.md', 'The Lighthouse.md', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two/The wreck.md', 'Part Two/Lights out.md'].map((x) => `${L}/${x}`);
const same = (t, a, b, m) => t.eq(j(a), j(b), m);
const short = (a) => a.map((x) => (x ?? 'nothing').replace(L + '/', ''));

/** Removes every folder and non-note file a test made (the runner restores notes and settings), closes extra explorers,
    clears the explorer's selection and puts its sort order back. */
async function tidy(p) {
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 500, button: 'left', clickCount: 1 }); // a drag a failed test left held
	await p.ev(`(async () => {
		document.querySelectorAll('.modal-close-button').forEach(b => b.click());
		for (const l of app.workspace.getLeavesOfType('file-explorer')) if (l.getRoot() !== app.workspace.leftSplit) l.detach();
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
const withTidy = (fn) => async (p, h, t) => { try { await clearSelection(p); await fn(p, h, t); } finally { await tidy(p); } };
const clearSelection = (p) => p.ev(`(() => { ${EXP}.tree?.clearSelectedDoms?.(); return 1; })()`);

/** Makes notes, folders (a path ending in "/") and other files (text "BIN:") and waits for the cache. */
const mk = (p, files) => p.ev(`(async () => { for (const [path, text] of ${j(Object.entries(files))}) { const dir = path.split('/').slice(0, -1).join('/'); if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir); if (path.endsWith('/')) continue; if (text === 'BIN:') await app.vault.createBinary(path, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer); else await app.vault.create(path, text); } await new Promise(r => setTimeout(r, 500)); })().then(() => 1)`);
/** The sidebar explorer's rows under a folder ('' for all), top to bottom, with the given folders expanded. */
async function rows(p, under = L, expand = FOLDERS) {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = ${EXP}; app.workspace.revealLeaf(v.leaf); for (const f of ${j(expand)}) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(400);
	return p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => ${j(under)} === '' || x.startsWith(${j(under + '/')}))`);
}
/** A row of the sidebar explorer: its centre and edges. */
const row = (p, path) => p.ev(`(() => { const e = ${EXP}.containerEl.querySelector('.tree-item-self[data-path=${j(path).replace(/'/g, "\\'")}]'); if (!e) return null; const r = e.getBoundingClientRect(), i = e.querySelector('.tree-item-inner').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height, name: i.left }; })()`);
const listOnDisk = async (p, path = NOTE) => { await flush(p); await p.sleep(150); return contents(p, path); };
const scenes = async (p, path = `${LF}/Index.md`) => { await flush(p); await p.sleep(300); return p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)}).frontmatter.longform.scenes)`); };
const notices = (p) => p.ev(`(() => { const n = new Notice('probe'); const doc = n.noticeEl.ownerDocument; n.hide(); return [...doc.querySelectorAll('.notice')].map(e => e.textContent).filter(x => x !== 'probe'); })()`);
const texts = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
const setSettings = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(300));
const rename = (p, from, to) => p.ev(`app.fileManager.renameFile(${file(from)}, ${j(to)}).then(() => 1)`);
const move = (p, item, folder, index) => p.ev(`${B}.move(${file(item)}, ${file(folder)}, ${index}).then(() => 1)`);

/** What shows while a drag is held: Binders' line, the hint under the pointer, and the folder Obsidian tints. */
const held = (p) => p.ev(`(() => { const l = document.querySelector('.binders-explorer-drop')?.getBoundingClientRect(); return { line: l ? { y: l.top + l.height / 2, left: l.left, right: l.right } : null, hint: document.querySelector('.drag-ghost-action')?.textContent ?? '', ghost: document.querySelector('.drag-ghost-self')?.textContent ?? document.querySelector('.drag-ghost')?.textContent ?? null, into: [...document.querySelectorAll('.is-being-dragged-over')].map(e => e.dataset.path ?? e.querySelector('[data-path]')?.dataset.path) }; })()`);
/** Starts a real drag of an explorer row (a path, or a point) and holds it at `to`; returns what shows. */
async function hold(p, from, to) {
	const a = typeof from === 'string' ? await row(p, from) : from;
	if (!a) throw new Error(`no row for ${from}`);
	await p.move(a.x, a.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
	await p.move(a.x + 6, a.y + 6, 3, { buttons: 1 });
	await p.move(to.x, to.y, 8, { buttons: 1 });
	await p.sleep(250);
	const seen = await held(p);
	seen.files = await p.ev(`(() => { const d = app.dragManager?.draggable; return d ? (d.files ?? [d.file]).map(f => f?.path) : null; })()`);
	return seen;
}
const release = async (p, to, wait = 500) => { await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 }); await p.sleep(wait); };
/** Lets go of a drag where nothing takes it: outside the window's content. */
const cancel = async (p) => { await p.move(2, 2, 3, { buttons: 1 }); await release(p, { x: 2, y: 2 }, 200); };
const drag = async (p, from, to) => { const seen = await hold(p, from, to); await release(p, to); return seen; };
const top = (r) => ({ x: r.x, y: r.t + 3 }), bottom = (r) => ({ x: r.x, y: r.b - 3 });

// ---- dragging to reorder: what was checked and holds ----

test('every row’s drop zones: a note’s halves, a folder’s edges and middle, and the line starts where the names start', withTidy(async (p, h, t) => {
	await mk(p, { [`${L}/Part Three/`]: '' });
	await rows(p, L, [...FOLDERS, `${L}/Part Three`]);
	const src = `${L}/Epilogue.md`, a = await row(p, src);
	await hold(p, src, { x: a.x, y: a.y });
	const over = async (path, f) => { const r = await row(p, path); await p.move(r.x, r.t + r.h * f, 3, { buttons: 1 }); await p.sleep(150); return { ...(await held(p)), r }; };
	const line = (s, y, left, what) => { t.ok(s.line, `${what}: a line shows (hint “${s.hint}”)`); t.ok(Math.abs(s.line.y - y) <= 1.5, `${what}: the line is on the row’s edge (${s.line.y} vs ${y})`); t.ok(Math.abs(s.line.left - left) <= 1, `${what}: the line starts where the names start (${s.line.left} vs ${left})`); t.ok(Math.abs(s.line.right - s.r.r) <= 1, `${what}: and ends at the row’s end`); };
	try {
		for (const f of [0.05, 0.45]) { const s = await over(`${L}/Part One/Arrival.md`, f); t.eq(s.hint, 'Move before “Arrival”', `a note’s top half (${f})`); line(s, s.r.t, s.r.name, 'top half'); same(t, s.into, [], 'no folder tinted'); }
		for (const f of [0.55, 0.95]) { const s = await over(`${L}/Part One/Arrival.md`, f); t.eq(s.hint, 'Move after “Arrival”', `a note’s bottom half (${f})`); line(s, s.r.b, s.r.name, 'bottom half'); }
		let s = await over(`${L}/Part One`, 0.1); t.eq(s.hint, 'Move before “Part One”', 'a folder’s top edge'); line(s, s.r.t, s.r.name, 'folder top');
		s = await over(`${L}/Part One`, 0.5); t.eq(s.hint, 'Move into “Part One”', 'a folder’s middle is Obsidian’s own'); t.eq(s.line, null, 'no line there'); same(t, s.into, [`${L}/Part One`], 'the folder is tinted');
		const child = await row(p, `${L}/Part One/Arrival.md`);
		s = await over(`${L}/Part One`, 0.9); t.eq(s.hint, 'Move to the top of “Part One”', 'an open folder’s bottom edge'); line(s, s.r.b, child.name, 'folder bottom (indented as its items)');
		// an empty folder: its bottom edge still means "into it", with the line indented one level
		s = await over(`${L}/Part Three`, 0.9); t.eq(s.hint, 'Move to the top of “Part Three”', 'an empty folder’s bottom edge'); t.ok(s.line && s.line.left > s.r.name + 8, 'the line is indented under the empty folder');
		// the binder's own row, and the dragged row itself: nothing of ours
		s = await over(L, 0.9); t.eq(s.line, null, 'no line on the binder’s own row'); t.eq(s.hint, 'Move into “The Lighthouse”', 'Obsidian’s hint there');
		s = await over(src, 0.2); t.eq(s.line, null, 'no line on the dragged row');
		// the line is Obsidian's drop indicator, in the accent colour
		await over(`${L}/Part One/Arrival.md`, 0.2);
		const css = await p.ev(`(() => { const e = document.querySelector('.binders-explorer-drop'), c = getComputedStyle(e); const probe = document.body.createDiv({ cls: 'drop-indicator is-active' }); const n = getComputedStyle(probe).borderTopColor; probe.remove(); return { cls: e.className, color: c.borderTopColor, native: n, h: e.getBoundingClientRect().height, pe: c.pointerEvents }; })()`);
		t.ok(/drop-indicator/.test(css.cls) && css.color === css.native, 'the line has the colour of Obsidian’s own drop indicator: ' + j(css));
		t.eq(css.pe, 'none', 'and never takes the pointer');
	} finally { await cancel(p); }
	t.eq(await p.ev(`document.querySelectorAll('.binders-explorer-drop').length`), 0, 'the line goes when the drag ends');
	same(t, await listOnDisk(p), LIST, 'a drag let go outside the explorer changes nothing');
}));

test('a collapsed folder’s bottom edge means after it, and holding there doesn’t open it', withTidy(async (p, h, t) => {
	await rows(p);
	await p.ev(`(() => { ${EXP}.fileItems[${j(`${L}/Part Two`)}].setCollapsed(true); return 1; })()`); await p.sleep(400);
	const two = await row(p, `${L}/Part Two`);
	const s = await hold(p, `${L}/Prologue.md`, bottom(two));
	t.eq(s.hint, 'Move after “Part Two”', 'the hint');
	for (let i = 0; i < 4; i++) { await p.sleep(350); await p.move(two.x + (i % 2), two.b - 3, 1, { buttons: 1 }); }
	t.eq(await p.ev(`${EXP}.fileItems[${j(`${L}/Part Two`)}].collapsed`), true, 'still collapsed after 1.4 s on its edge');
	t.eq((await held(p)).hint, 'Move after “Part Two”', 'and the hint hasn’t changed under the pointer');
	await release(p, bottom(two));
	same(t, await listOnDisk(p), [...LIST.slice(1, 8), 'Prologue', 'Epilogue'], 'Prologue is after Part Two, not in it');
}));

test('images, PDFs and canvases in a binder reorder by dragging and are written into the list', withTidy(async (p, h, t) => {
	await mk(p, { [`${L}/map.png`]: 'BIN:', [`${L}/Part One/notes.pdf`]: 'BIN:', [`${L}/sketch.canvas`]: '{}' });
	same(t, short(await rows(p)).slice(-2), ['map.png', 'sketch.canvas'], 'unlisted files show last, by name');
	let s = await drag(p, `${L}/map.png`, top(await row(p, `${L}/Prologue.md`)));
	t.eq(s.hint, 'Move before “Prologue”', 'an image can be dragged');
	same(t, await listOnDisk(p), ['map.png', ...LIST.slice(0, 5), 'Part One/notes.pdf', ...LIST.slice(5), 'sketch.canvas'], 'the image is first, and every other file’s place is written down');
	s = await drag(p, `${L}/Epilogue.md`, top(await row(p, `${L}/Part One/notes.pdf`)));
	t.eq(s.hint, 'Move before “notes”', 'a note can go beside a PDF');
	s = await drag(p, `${L}/Part One/notes.pdf`, bottom(await row(p, `${L}/Part Two/The wreck.md`)));
	same(t, await listOnDisk(p), ['map.png', ...LIST.slice(0, 5), 'Part One/Epilogue', 'Part Two/', 'Part Two/The wreck', 'Part Two/notes.pdf', 'Part Two/Lights out', 'sketch.canvas'], 'the PDF moved to Part Two, after The wreck');
	t.ok(await p.ev(`app.vault.adapter.exists(${j(`${L}/Part Two/notes.pdf`)})`), 'the file moved');
}));

test('a folder can’t be dropped among its own items, and goes between another folder’s', withTidy(async (p, h, t) => {
	await rows(p);
	const one = await row(p, `${L}/Part One`);
	let s = await hold(p, { x: one.x, y: one.y }, bottom(await row(p, `${L}/Part One/Arrival.md`)));
	t.eq(s.line, null, 'no line among its own items'); await cancel(p);
	same(t, await listOnDisk(p), LIST, 'nothing moved');
	await rows(p);
	const one2 = await row(p, `${L}/Part One`);
	s = await drag(p, { x: one2.x, y: one2.y }, bottom(await row(p, `${L}/Part Two/The wreck.md`)));
	t.eq(s.hint, 'Move after “The wreck”', 'the hint');
	same(t, await listOnDisk(p), ['Prologue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Part One/', 'Part Two/Part One/Arrival', 'Part Two/Part One/The keeper', 'Part Two/Part One/Storm warning', 'Part Two/Lights out', 'Epilogue'], 'the folder is inside Part Two, after The wreck, its items in order');
}));

test('from outside into a place in the binder, between two binders, and into and out of a Longform project: no text changes', withTidy(async (p, h, t) => {
	await mk(p, { 'Loose.md': 'loose [[Prologue]]', 'Inbox/Idea.md': 'idea', 'Other/Other.md': '---\nbinder: 1\ncontents:\n  - One\n  - Two\n---\n', 'Other/One.md': '1', 'Other/Two.md': '2' });
	const all = [...FOLDERS, 'Inbox', 'Other', LF];
	const before = await texts(p);
	await rows(p, '', all);
	let s = await drag(p, 'Loose.md', bottom(await row(p, `${L}/Part One/Arrival.md`)));
	t.eq(s.hint, 'Move after “Arrival”', 'a note from outside');
	await rows(p, '', all);
	s = await drag(p, 'Inbox', bottom(await row(p, `${L}/Prologue.md`)));
	t.eq(s.hint, 'Move after “Prologue”', 'a folder from outside');
	await rows(p, '', [...all, `${L}/Inbox`]);
	s = await drag(p, `${L}/Part One/The keeper.md`, top(await row(p, 'Other/Two.md')));
	t.eq(s.hint, 'Move before “Two”', 'into another binder');
	await rows(p, '', [...all, `${L}/Inbox`]);
	s = await drag(p, 'Other/One.md', top(await row(p, `${L}/Epilogue.md`)));
	await rows(p, '', [...all, `${L}/Inbox`]);
	s = await drag(p, `${L}/Epilogue.md`, top(await row(p, `${LF}/Harbor.md`)));
	t.eq(s.hint, 'Move before “Harbor”', 'into a Longform project');
	await rows(p, '', [...all, `${L}/Inbox`]);
	s = await drag(p, `${LF}/Return.md`, top(await row(p, `${L}/Prologue.md`)));
	t.eq(s.hint, 'Move before “Prologue”', 'out of a Longform project');
	same(t, await listOnDisk(p), ['Return', 'Prologue', 'Inbox/', 'Inbox/Idea', 'Part One/', 'Part One/Arrival', 'Part One/Loose', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'One'], 'the first binder’s list');
	same(t, await listOnDisk(p, 'Other/Other.md'), ['The keeper', 'Two'], 'the second binder’s list');
	t.eq(await scenes(p), j(['Epilogue', 'Harbor', ['Ticket office', 'The crossing'], 'Island']), 'the project’s scenes');
	const after = await texts(p), moved = { 'Loose.md': `${L}/Part One/Loose.md`, 'Inbox/Idea.md': `${L}/Inbox/Idea.md`, [`${L}/Part One/The keeper.md`]: 'Other/The keeper.md', 'Other/One.md': `${L}/One.md`, [`${L}/Epilogue.md`]: `${LF}/Epilogue.md`, [`${LF}/Return.md`]: `${L}/Return.md` };
	for (const [path, text] of Object.entries(before)) if (![NOTE, 'Other/Other.md', `${LF}/Index.md`].includes(path)) t.eq(after[moved[path] ?? path], text, `“${path}” is unchanged`);
}));

test('a binder in a newer format takes no drop between its rows and is never written', withTidy(async (p, h, t) => {
	await mk(p, { 'Newer/Newer.md': '---\nbinder: 2\ncontents:\n  - Zed\n  - Alpha\n---\n', 'Newer/Zed.md': 'z', 'Newer/Alpha.md': 'a' });
	await rows(p, '', [...FOLDERS, 'Newer']);
	const was = await read(p, 'Newer/Newer.md');
	let s = await hold(p, 'Newer/Alpha.md', top(await row(p, 'Newer/Zed.md')));
	t.eq(s.line, null, 'no line for its own notes'); await cancel(p);
	s = await drag(p, `${L}/Epilogue.md`, top(await row(p, 'Newer/Zed.md')));
	t.eq(s.line, null, 'no line for a note from another binder');
	t.eq(s.hint, 'Move into “Newer”', 'Obsidian’s own move into the folder');
	await flush(p); await p.sleep(300);
	t.eq(await read(p, 'Newer/Newer.md'), was, 'its binder note is byte for byte the same');
	same(t, await listOnDisk(p), LIST.slice(0, 8), 'the note left the first binder');
}));

test('two explorers: a drag from one to a place in the other, and both show the result', withTidy(async (p, h, t) => {
	await rows(p);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split'); await l.setViewState({ type: 'file-explorer', active: false }); window.__second = l; await new Promise(r => setTimeout(r, 700)); for (const f of ${j(FOLDERS)}) l.view.fileItems[f]?.setCollapsed(false); })().then(() => 1)`);
	await p.sleep(500);
	const to = await p.ev(`(() => { const e = window.__second.view.containerEl.querySelector('.tree-item-self[data-path=${j(`${L}/Part One/Arrival.md`)}]'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.top + 3, t: r.top, name: e.querySelector('.tree-item-inner').getBoundingClientRect().left }; })()`);
	const s = await drag(p, `${L}/Epilogue.md`, to);
	t.eq(s.hint, 'Move before “Arrival”', 'the hint');
	t.ok(s.line && Math.abs(s.line.y - to.t) <= 1.5 && Math.abs(s.line.left - to.name) <= 1, 'the line is in the pane under the pointer: ' + j(s.line));
	await p.sleep(400);
	const both = await p.ev(`app.workspace.getLeavesOfType('file-explorer').map(l => [...l.view.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith(${j(L + '/Part One/')})).join())`);
	t.eq(both[0], both[1], 'both panes show the same order');
	t.ok(both[0].startsWith(`${L}/Part One/Epilogue.md,${L}/Part One/Arrival.md`), 'Epilogue is before Arrival: ' + both[0]);
}));

test('the corkboard, an open note’s tab and the explorer’s scroll position follow a drag', withTidy(async (p, h, t) => {
	const many = {}; for (let i = 1; i <= 40; i++) many[`${L}/Part Two/Scene ${String(i).padStart(2, '0')}.md`] = 's' + i;
	await mk(p, many);
	await rows(p);
	await p.ev(`(async () => { await app.workspace.getLeaf(false).openFile(${file(`${L}/Part Two/Scene 20.md`)}); await ${PL}.openBinder(${file(`${L}/Part Two`)}, 'tab'); })().then(() => 1)`);
	await until(p, `document.querySelectorAll('.binders-card[data-path]').length >= 40`);
	const sc = `${EXP}.containerEl.querySelector('.nav-files-container')`;
	await p.ev(`(() => { ${sc}.scrollTop = 420; return 1; })()`); await p.sleep(300);
	const s = await drag(p, `${L}/Part Two/Scene 20.md`, top(await row(p, `${L}/Part Two/Scene 15.md`)));
	t.eq(s.hint, 'Move before “Scene 15”', 'the hint');
	await p.sleep(500);
	t.eq(await p.ev(`${sc}.scrollTop`), 420, 'the explorer hasn’t scrolled');
	const cards = await p.ev(`[...app.workspace.getLeavesOfType('binders-view')[0].view.containerEl.querySelectorAll('.binders-card[data-path]')].map(c => c.dataset.path.split('/').pop())`);
	same(t, cards.slice(15, 18), ['Scene 14.md', 'Scene 20.md', 'Scene 15.md'], 'the corkboard shows the new order');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.file.path`), `${L}/Part Two/Scene 20.md`, 'the note’s tab is still on it');
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'binders-view', 'and the drag opened nothing');
}));

test('unsaved typing survives a drag: in the binder note, and in the note being dragged to another folder', withTidy(async (p, h, t) => {
	await rows(p);
	const type = async (path, text) => { await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); const ed = l.view.editor; ed.setCursor(ed.lastLine(), ed.getLine(ed.lastLine()).length); ed.focus(); })().then(() => 1)`); await p.sleep(400); await p.type(text); };
	await type(NOTE, ' TYPED-IN-BINDER-NOTE');
	await drag(p, `${L}/Part One/Storm warning.md`, top(await row(p, `${L}/Part One/Arrival.md`)));
	await type(`${L}/Epilogue.md`, ' TYPED-IN-EPILOGUE');
	await drag(p, `${L}/Epilogue.md`, top(await row(p, `${L}/Part Two/The wreck.md`)));
	await p.sleep(2600); // Obsidian saves typing two seconds after the last key
	same(t, await listOnDisk(p), ['Prologue', 'Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper', 'Part Two/', 'Part Two/Epilogue', 'Part Two/The wreck', 'Part Two/Lights out'], 'both drags are in the list');
	t.ok((await read(p, NOTE)).includes('TYPED-IN-BINDER-NOTE'), 'the typing in the binder note is on disk');
	t.ok((await read(p, `${L}/Part Two/Epilogue.md`)).endsWith('TYPED-IN-EPILOGUE'), 'the typing in the dragged note moved with it');
}));

test('a folder outside binders is exactly Obsidian’s, with Binders on and off', withTidy(async (p, h, t) => {
	const probe = async () => {
		await clearSelection(p);
		await mk(p, { 'Plain/b.md': 'b', 'Plain/a.md': 'a', 'Plain/Plain.md': 'named like its folder', 'Plain/Sub/c.md': 'c', 'Plain/Empty/': '', 'Plain/pic.png': 'BIN:' });
		const out = { rows: await rows(p, 'Plain', ['Plain', 'Plain/Sub']), hover: [] };
		out.dom = await p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path^="Plain"]')].map(e => e.outerHTML.replace(/\\s+/g, ' '))`);
		for (const over of ['Plain/a.md', 'Plain/Sub', 'Plain/Sub/c.md', 'Plain/Empty']) for (const f of [0.1, 0.5, 0.9]) {
			const r = await row(p, over), s = await hold(p, 'Plain/b.md', { x: r.x, y: r.t + r.h * f });
			out.hover.push([over, f, s.hint, s.line, s.into.join()]);
			await cancel(p);
		}
		await drag(p, 'Plain/b.md', top(await row(p, 'Plain/Sub/c.md')));
		out.afterDrop = await rows(p, 'Plain', ['Plain', 'Plain/Sub']);
		const sub = await row(p, 'Plain/Sub'); await p.click(sub.x, sub.y); await p.sleep(300);
		out.collapsed = await p.ev(`${EXP}.fileItems['Plain/Sub'].collapsed`);
		out.tabs = await p.ev(`(() => { const o = []; app.workspace.iterateRootLeaves(l => { o.push(l.view.getViewType()); }); return o; })()`);
		await p.ev(`app.vault.delete(${file('Plain')}, true).then(() => 1)`); await p.sleep(300);
		return out;
	};
	const on = await probe();
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`); await p.sleep(400);
	let off;
	try { off = await probe(); } finally { await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`); await until(p, `${PL}?.explorer?.status === 'patched'`, 4000); await p.sleep(300); }
	for (const k of Object.keys(on)) t.eq(j(on[k]), j(off[k]), `${k} is the same with Binders on and off`);
	t.ok(on.hover.every((x) => x[3] === null && /^Move into/.test(x[2])), 'no line of ours anywhere in a plain folder');
}));

test('keyboard in the explorer: arrows walk in binder order, F2 renames in place, Delete drops it from the list', withTidy(async (p, h, t) => {
	await rows(p);
	await h.open(`${L}/Prologue.md`); // already open, so the click below leaves the keyboard with the explorer
	const pr = await row(p, `${L}/Prologue.md`);
	await p.click(pr.x, pr.y); await p.sleep(500);
	const focus = () => p.ev(`${EXP}.containerEl.querySelector('.tree-item-self.has-focus')?.dataset.path ?? null`);
	const walk = [];
	for (let i = 0; i < 5; i++) { await p.key('ArrowDown'); await p.sleep(80); walk.push(await focus()); }
	same(t, short(walk), ['Part One', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two'], 'Arrow down follows binder order');
	await p.key('ArrowUp'); await p.key('ArrowUp'); await p.sleep(100);
	await p.key('F2'); await p.sleep(300);
	await p.ev(`document.execCommand('selectAll')`); await p.type('The lamp'); await p.key('Enter'); await p.sleep(600);
	same(t, await listOnDisk(p), LIST.map((x) => (x === 'Part One/The keeper' ? 'Part One/The lamp' : x)), 'renamed with F2, it keeps its place');
	await p.ev(`(() => { ${EXP}.containerEl.querySelector('.nav-files-container').focus(); return 1; })()`);
	await p.key('Delete'); await p.sleep(500);
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => /delete/i.test(b.textContent))?.click()`); await p.sleep(600);
	same(t, await listOnDisk(p), LIST.filter((x) => x !== 'Part One/The keeper'), 'deleted with Delete, it leaves the list');
}));

test('file menus and commands: what’s offered where', withTidy(async (p, h, t) => {
	await mk(p, { [`${L}/Part One/Part One.md`]: 'folder note', [`${L}/map.png`]: 'BIN:', 'Plain/x.md': 'x', 'Loose.md': 'l' });
	await setSettings(p, { hideBinderNotes: false });
	await rows(p, '', [...FOLDERS, 'Plain', LF]);
	const menu = async (path) => { const a = await row(p, path); await p.right(a.x, a.y); await p.sleep(250); const items = await p.ev(`[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`); await p.key('Escape'); await p.sleep(120); return items.filter((x) => /binder|scene|^Move up$|^Move down$/i.test(x)); };
	const want = {
		[L]: ['Open binder', 'New scene here'], [`${L}/Part One`]: ['Open binder', 'New scene here', 'Move up', 'Move down'], [`${L}/Prologue.md`]: ['Show in binder', 'New scene after this', 'Move down'],
		[`${L}/Part One/The keeper.md`]: ['Show in binder', 'New scene after this', 'Move up', 'Move down'], [NOTE]: [], [`${L}/Part One/Part One.md`]: [], [`${L}/map.png`]: ['Show in binder', 'Move up'],
		Plain: ['Make this folder a binder', 'New binder'], 'Plain/x.md': [], 'Loose.md': [], [LF]: ['Open binder', 'New scene here', 'Convert to binder'], [`${LF}/Index.md`]: ['Convert to binder'],
		[`${LF}/Island.md`]: ['Show in binder', 'New scene after this', 'Move up', 'Move down'], [`${LF}/Notes on ferries.md`]: [],
	};
	for (const [path, items] of Object.entries(want)) same(t, await menu(path), items, `the menu of “${path}”`);
	const cmds = async (path) => { await h.open(path); return p.ev(`['open-binder', 'make-binder', 'new-scene', 'move-up', 'move-down', 'convert-longform'].filter(id => app.commands.commands['binders:' + id]?.checkCallback(true))`); };
	same(t, await cmds(`${L}/Prologue.md`), ['open-binder', 'new-scene', 'move-down'], 'commands in the first scene');
	same(t, await cmds(NOTE), ['open-binder', 'new-scene'], 'commands in the binder note');
	same(t, await cmds(`${L}/Part One/Part One.md`), ['open-binder', 'new-scene'], 'commands in a folder note');
	same(t, await cmds('Plain/x.md'), ['make-binder'], 'commands in a note in a plain folder');
	same(t, await cmds('Loose.md'), [], 'commands in a note at the top of the vault');
	same(t, await cmds(`${LF}/Notes on ferries.md`), ['open-binder', 'new-scene', 'convert-longform'], 'commands in a note a Longform project ignores');
}));

test('“Make this folder a binder” on odd folders: empty, deep with mixed names, a note with other properties or a list of its own', withTidy(async (p, h, t) => {
	const make = (path) => p.ev(`${B}.makeBinder(${file(path)}).then(() => new Promise(r => setTimeout(r, 600))).then(() => 'ok', e => 'refused: ' + e.message)`);
	await mk(p, {
		'Empty/': '', 'A/B/Novel/Novel.md': 'Notes about the novel.\n\n---\n\nA rule above.', 'A/B/Novel/Chapter 10.md': 'c10', 'A/B/Novel/Chapter 2.md': 'c2', 'A/B/Novel/chapter 1.md': 'c1', 'A/B/Novel/img.png': 'BIN:',
		'A/B/Novel/Research/Research.md': 'r', 'A/B/Novel/Research/Boats.md': 'b', 'A/B/Novel/Äpfel.md': 'ä', 'A/B/Novel/Zebra/': '',
		'P1/P1.md': '---\ntags:\n  - novel\n---\nBody stays.', 'P1/x.md': 'x', 'P2/P2.md': '---\ncontents:\n  - Chapter one summary\n  - 42\n---\nBody.', 'P2/a.md': 'a',
	});
	t.eq(await make('Empty'), 'ok', 'an empty folder');
	t.eq(await read(p, 'Empty/Empty.md'), '---\nbinder: 1\ncontents: []\n---\n', 'its binder note');
	const novel = ['A', 'A/B', 'A/B/Novel', 'A/B/Novel/Research'];
	const shown = (await rows(p, 'A/B/Novel', novel)).filter((x) => !/Novel\.md$|Research\.md$/.test(x));
	t.eq(await make('A/B/Novel'), 'ok', 'a deep folder');
	same(t, await rows(p, 'A/B/Novel', novel), shown, 'the explorer shows what it showed before, less the binder and folder notes');
	const text = await read(p, 'A/B/Novel/Novel.md');
	t.ok(text.endsWith('---\nNotes about the novel.\n\n---\n\nA rule above.'), 'the note’s own text is untouched, its rule too');
	same(t, await contents(p, 'A/B/Novel/Novel.md'), ['Research/', 'Research/Boats', 'Zebra/', 'Äpfel', 'chapter 1', 'Chapter 2', 'Chapter 10'], 'the list is the order the explorer showed (the image isn’t listed until something moves)');
	t.eq(await make('P1'), 'ok', 'a folder note with other properties');
	t.eq(await read(p, 'P1/P1.md'), '---\ntags:\n  - novel\nbinder: 1\ncontents:\n  - x\n---\nBody stays.', 'they’re kept');
	t.eq(await make('P2'), 'ok', 'a folder note with a contents list of its own');
	t.eq(await read(p, 'P2/P2.md'), '---\ncontents:\n  - Chapter one summary\n  - 42\nbinder: 1\n---\nBody.', 'its list is left as it is');
	// undoing it: remove the property
	await p.ev(`app.fileManager.processFrontMatter(${file('P1/P1.md')}, fm => { delete fm.binder; }).then(() => 1)`); await p.sleep(800);
	t.ok(!(await p.ev(`!!${B}.binderOf('P1')`)), 'without the property it’s a plain folder again');
	same(t, await rows(p, 'P1', ['P1']), ['P1/P1.md', 'P1/x.md'], 'and its note shows again, by name');
}));

// ---- a seeded random walk, checked against a model of what the format promises ----

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
/** Creates, renames, moves (through the vault and through the store), deletes, moves out and back in, at random; after
    every few steps the store, the explorer's rows and the list on disk must match the model, and every note's bytes
    must be what they were. `settle`: each store move is written before the next change (see the BUG tests below for why). */
async function soak(p, seed, steps, { settle = true, every = 5 } = {}) {
	const rand = rng(seed), pick = (a) => a[Math.floor(rand() * a.length)], int = (n) => Math.floor(rand() * n);
	const key = (n) => (n.dir ? n.name : n.name.replace(/\.md$/, ''));
	// (what the list doesn't mention shows folders first, then notes, each by name)
	const byName = (a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' }));
	const N = (name, dir, listed = []) => { const n = { name, dir, parent: null, listed, unlisted: [], body: null }; for (const k of listed) k.parent = n; return n; };
	const note = (name) => N(name + '.md', false);
	const root = N(L, true, [note('Prologue'), N('Part One', true, [note('Arrival'), note('The keeper'), note('Storm warning')]), N('Part Two', true, [note('The wreck'), note('Lights out')]), note('Epilogue')]);
	const out = N('Soak out', true);
	await p.ev(`app.vault.createFolder(${j(out.name)}).then(() => 1)`);
	const path = (n) => (n.parent ? path(n.parent) + '/' + n.name : n.name);
	const kids = (n) => [...n.listed, ...[...n.unlisted].sort(byName)];
	const all = (n, acc = []) => { for (const k of kids(n)) { acc.push(k); if (k.dir) all(k, acc); } return acc; };
	const folders = () => [root, ...all(root).filter((n) => n.dir)];
	const depth = (n) => (n.parent ? depth(n.parent) + 1 : 0);
	const inside = (n, f) => { for (let x = f; x; x = x.parent) if (x === n) return true; return false; };
	const detach = (n) => { const q = n.parent; q.listed = q.listed.filter((x) => x !== n); q.unlisted = q.unlisted.filter((x) => x !== n); };
	const listAll = (n = root) => { n.listed = kids(n); n.unlisted = []; for (const k of n.listed) if (k.dir) listAll(k); };
	const unlistAll = (n) => { n.unlisted = [...n.listed, ...n.unlisted]; n.listed = []; for (const k of n.unlisted) if (k.dir) unlistAll(k); };
	let count = 0;
	const fresh = () => `${['Dawn', 'tide', 'Ash', 'bell', 'Cove'][int(5)]} ${++count}`;
	const f = (n) => file(path(n));
	const history = [], fails = [];
	const ops = {
		async createNote() { const d = pick(folders()), n = note(fresh()); n.body = `body of ${n.name}`; n.parent = d; await p.ev(`app.vault.create(${j(path(n))}, ${j(n.body)}).then(() => 1)`); d.unlisted.push(n); return `create ${path(n)}`; },
		async createFolder() { const d = pick(folders().filter((x) => depth(x) < 3)), n = N(fresh(), true); n.parent = d; await p.ev(`app.vault.createFolder(${j(path(n))}).then(() => 1)`); d.unlisted.push(n); return `mkdir ${path(n)}`; },
		async rename() { const n = pick(all(root)); if (!n) return null; const from = path(n), was = f(n); n.name = fresh() + (n.dir ? '' : '.md'); await p.ev(`app.fileManager.renameFile(${was}, ${j(path(n))}).then(() => 1)`); return `rename ${from} -> ${n.name}`; },
		async vaultMove() {
			const n = pick(all(root)); if (!n) return null;
			const d = pick(folders().filter((x) => x !== n.parent && !inside(n, x) && (!n.dir || depth(x) < 3))); if (!d) return null;
			const from = path(n), was = f(n), listed = n.parent.listed.includes(n);
			detach(n); n.parent = d; (listed ? d.listed : d.unlisted).push(n); // a listed item goes last among the listed; an unlisted one stays unlisted
			await p.ev(`app.fileManager.renameFile(${was}, ${j(path(n))}).then(() => 1)`);
			return `mv ${from} -> ${path(d)}/`;
		},
		async storeMove() {
			const n = pick(all(root)); if (!n) return null;
			const d = pick(folders().filter((x) => !inside(n, x) && (!n.dir || depth(x) < 3))); if (!d) return null;
			const was = f(n), from = path(n), dest = f(d);
			listAll(); detach(n); // a move writes down the place of everything
			const i = int(d.listed.length + 1); d.listed.splice(i, 0, n); n.parent = d;
			await p.ev(`${B}.move(${was}, ${dest}, ${i}).then(() => 1)`);
			return `move ${from} -> ${path(d)}/ at ${i}`;
		},
		async step() {
			const n = pick(all(root)); if (!n) return null;
			const sibs = kids(n.parent), i = sibs.indexOf(n), d = rand() < 0.5 ? -1 : 1, k = i + d, can = k >= 0 && k < sibs.length;
			const ok = await p.ev(`${B}.${d < 0 ? 'moveUp' : 'moveDown'}(${f(n)})`);
			if (ok !== can) fails.push(`step ${path(n)} ${d}: returned ${ok}, expected ${can}`);
			if (can) { listAll(); const q = n.parent.listed; q.splice(q.indexOf(n), 1); q.splice(k, 0, n); }
			return `step ${path(n)} ${d}`;
		},
		async remove() { if (all(root).length < 6) return null; const n = pick(all(root)), was = path(n); await p.ev(`app.vault.delete(${f(n)}, true).then(() => 1)`); detach(n); return `rm ${was}`; },
		async moveOut() { const n = pick(all(root)); if (!n || all(root).length < 6) return null; const from = path(n), was = f(n); detach(n); n.parent = out; out.unlisted.push(n); await p.ev(`app.fileManager.renameFile(${was}, ${j(path(n))}).then(() => 1)`); return `out ${from}`; },
		async moveIn() {
			const n = pick(out.unlisted); if (!n) return null;
			const d = pick(folders().filter((x) => !n.dir || depth(x) < 2)), was = f(n);
			out.unlisted = out.unlisted.filter((x) => x !== n); n.parent = d; d.listed.push(n); if (n.dir) unlistAll(n); // appended; a folder's items come in unlisted
			await p.ev(`app.fileManager.renameFile(${was}, ${j(path(n))}).then(() => 1)`);
			return `in ${path(n)}`;
		},
		async newScene() {
			const d = pick(folders()); listAll();
			const i = int(d.listed.length + 1), name = await p.ev(`${B}.newScene(${f(d)}, ${i}, ${j(fresh())}).then(x => x.name)`);
			const n = N(name, false); n.body = ''; n.parent = d; d.listed.splice(i, 0, n);
			return `new ${path(n)} at ${i}`;
		},
	};
	const bag = Object.entries({ createNote: 3, createFolder: 1, rename: 3, vaultMove: 3, storeMove: 5, step: 3, remove: 1, moveOut: 1, moveIn: 2, newScene: 1 }).flatMap(([k, w]) => Array(w).fill(k));
	const rel = (n) => path(n).slice(L.length + 1).replace(/\.md$/, '') + (n.dir ? '/' : '');
	const parentOf = (x) => { const q = x.replace(/\/$/, ''), i = q.lastIndexOf('/'); return i < 0 ? '' : q.slice(0, i + 1); };
	const verify = async (at) => {
		await p.ev(`${B}.flush().then(() => new Promise(r => setTimeout(r, 120))).then(() => ${B}.flush()).then(() => 1)`);
		await p.sleep(350);
		const want = all(root).map(path);
		const store = await p.ev(`(() => { const out = []; const walk = (f) => { for (const c of ${B}.orderedChildren(f) ?? []) { out.push(c.path); if (c.children) walk(c); } }; walk(${file(L)}); return out; })()`);
		if (j(store) !== j(want)) fails.push(`${at}: the store’s order differs from the model\n      store: ${j(short(store))}\n      model: ${j(short(want))}`);
		await p.ev(`(() => { const v = ${EXP}; for (const f of ${j(folders().map(path))}) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
		await p.sleep(450);
		const shown = await p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith(${j(L + '/')}))`);
		if (j(shown) !== j(want)) fails.push(`${at}: the explorer’s rows differ from the model\n      rows:  ${j(short(shown))}\n      model: ${j(short(want))}`);
		const text = await read(p, NOTE), m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
		if (!m) { fails.push(`${at}: the binder note lost its properties`); return; }
		const list = await contents(p);
		const others = m[1].split('\n').filter((l) => !/^contents:/.test(l) && !/^\s+- /.test(l) || /Mara|keeper's secret/.test(l)).join('\n');
		if (others !== 'binder: 1\nplotlines:\n  - Mara\n  - The keeper\'s secret') fails.push(`${at}: the binder note’s other properties changed: ${j(others)}`);
		if (!m[2].startsWith('A short novel about a lighthouse')) fails.push(`${at}: the binder note’s text changed`);
		if (new Set(list).size !== list.length) fails.push(`${at}: duplicates in contents: ${j(list)}`);
		const existing = new Set(all(root).map(rel)), stale = list.filter((x) => !existing.has(x));
		if (stale.length) fails.push(`${at}: contents lists items that don’t exist: ${j(stale)}`);
		for (const d of folders()) {
			const fr = d === root ? '' : rel(d), got = list.filter((x) => parentOf(x) === fr), show = kids(d).map(rel), exp = d.listed.map(rel);
			// (a note made while a move waited to be written is written down with it, where it shows)
			if (!(exp.every((x) => got.includes(x)) && j(show.slice(0, got.length)) === j(got))) fails.push(`${at}: in “${fr || L}” contents has ${j(got)}; the model lists ${j(exp)} and shows ${j(show)}`);
			else { const by = new Map(kids(d).map((k) => [rel(k), k])); d.listed = got.map((x) => by.get(x)); d.unlisted = kids(d).filter((k) => !d.listed.includes(k)); }
		}
		const bodies = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) if (f.path.startsWith(${j(L + '/')}) || f.path.startsWith(${j(out.name + '/')})) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
		const notes = [...all(root), ...all(out)].filter((n) => !n.dir);
		for (const n of notes) { if (!(path(n) in bodies)) fails.push(`${at}: “${path(n)}” is missing`); else if (bodies[path(n)] !== n.body) fails.push(`${at}: the text of “${path(n)}” changed`); }
		const extra = Object.keys(bodies).filter((x) => x !== NOTE && !notes.some((n) => path(n) === x));
		if (extra.length) fails.push(`${at}: notes nobody made: ${j(extra)}`);
	};
	const first = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
	for (const n of all(root)) if (!n.dir) n.body = first[path(n)];
	for (let s = 1; s <= steps && !fails.length; s++) {
		const name = pick(bag);
		let did = null;
		try { did = await ops[name](); } catch (e) { fails.push(`step ${s} (${name}) threw: ${e.message}`); }
		if (did && settle && /^(move|step|new) /.test(did)) await flush(p);
		if (did) history.push(`${s}. ${did}`);
		if (rand() < 0.3) await p.sleep(int(400)); // sometimes the debounced write lands mid-burst
		if (s % every === 0 || s === steps) await verify(`after step ${s}`);
	}
	return { fails, history };
}

for (const seed of [11, 12]) {
	test(`a random walk of 70 changes (seed ${seed}): the store, the explorer and the list on disk agree, and no note’s text changes`, withTidy(async (p, h, t) => {
		const r = await soak(p, seed, 70);
		t.ok(!r.fails.length, `${r.fails.slice(0, 2).join('\n    ')}\n    last steps: ${r.history.slice(-8).join(' | ')}`);
	}));
}

// ---- bugs ----

test('BUG: a note renamed right after another was moved (before the list is written) keeps its place', withTidy(async (p, h, t) => {
	// e.g. "Move down" on a hotkey, then a rename by another plugin or a sync within the 300 ms the write waits
	await move(p, `${L}/Part One/Storm warning.md`, L, 1);
	await rename(p, `${L}/Prologue.md`, `${L}/Opening.md`);
	same(t, await listOnDisk(p), ['Opening', 'Storm warning', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', ...LIST.slice(5)], 'the renamed note is still first');
}));

test('BUG: a folder renamed right after a move keeps its place and its items’ order', withTidy(async (p, h, t) => {
	await move(p, `${L}/Prologue.md`, `${L}/Part One`, 3);
	await rename(p, `${L}/Part Two`, `${L}/Second part`);
	await p.sleep(500);
	same(t, await listOnDisk(p), ['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Prologue', 'Second part/', 'Second part/The wreck', 'Second part/Lights out', 'Epilogue'], 'the folder is still before Epilogue, The wreck still before Lights out');
}));

test('BUG: a moved note keeps the place it was put when a folder before it leaves before the write', withTidy(async (p, h, t) => {
	await mk(p, { 'Elsewhere/': '' });
	await move(p, `${L}/Part Two/Lights out.md`, L, 3); // before Epilogue
	same(t, await p.ev(`${B}.orderedChildren(${file(L)}).map(f => f.name)`), ['Prologue.md', 'Part One', 'Part Two', 'Lights out.md', 'Epilogue.md'], 'it shows before Epilogue');
	await rename(p, `${L}/Part Two`, 'Elsewhere/Part Two');
	await p.sleep(500);
	same(t, await listOnDisk(p), [...LIST.slice(0, 5), 'Lights out', 'Epilogue'], 'still before Epilogue once Part Two has left the binder');
}));

test('BUG: two moves in one write never leave duplicates in contents', withTidy(async (p, h, t) => {
	await mk(p, { [`${L}/Part Two/Inner/`]: '' });
	await flush(p);
	await move(p, `${L}/Part One/Arrival.md`, `${L}/Part Two/Inner`, 0); // a note into a folder…
	await move(p, `${L}/Part Two/Inner`, L, 1); // …and the folder somewhere else, within the 300 ms the write waits
	const list = await listOnDisk(p);
	t.eq(new Set(list).size, list.length, 'no entry is listed twice: ' + j(list));
	same(t, list, ['Prologue', 'Inner/', 'Inner/Arrival', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', ...LIST.slice(5)], 'and the list is what the two moves made');
}));

test('BUG: a random walk without waiting for each move to be written (seed 3)', withTidy(async (p, h, t) => {
	const r = await soak(p, 3, 40, { settle: false, every: 4 });
	t.ok(!r.fails.length, `${r.fails.slice(0, 2).join('\n    ')}\n    last steps: ${r.history.slice(-6).join(' | ')}`);
}));

test('BUG: several notes dragged together from other folders land in the order they show in, not the order they were clicked', withTidy(async (p, h, t) => {
	await rows(p);
	// Alt-click selects: the later scene first, then the earlier one
	for (const f of [`${L}/Part Two/Lights out.md`, `${L}/Part One/Arrival.md`]) { const a = await row(p, f); await p.click(a.x, a.y, { modifiers: 1 }); await p.sleep(150); }
	const s = await drag(p, `${L}/Part One/Arrival.md`, top(await row(p, `${L}/Epilogue.md`)));
	t.eq(s.hint, 'Move before “Epilogue”', 'the hint');
	t.eq(s.files?.length, 2, 'both notes are dragged');
	await p.sleep(400);
	same(t, (await listOnDisk(p)).slice(-3), ['Arrival', 'Lights out', 'Epilogue'], 'Arrival (earlier in the binder) comes before Lights out');
}));

test('BUG: a Longform project is found when its scene folder appears after its index note', withTidy(async (p, h, t) => {
	// as a sync or a clone delivers them, or when the folder is made second
	await mk(p, { 'Outside/Idx.md': '---\nlongform:\n  format: scenes\n  sceneFolder: Scenes\n  scenes:\n    - B\n    - A\n---\n' });
	await p.sleep(500);
	await mk(p, { 'Outside/Scenes/A.md': 'a', 'Outside/Scenes/B.md': 'b' });
	await p.sleep(1000);
	t.ok(await p.ev(`!!${B}.binderOf('Outside/Scenes')`), 'the scene folder is a binder once it exists');
	same(t, await rows(p, 'Outside/Scenes', ['Outside', 'Outside/Scenes']), ['Outside/Scenes/B.md', 'Outside/Scenes/A.md'], 'and shows in the project’s order');
}));

test('BUG: a Longform project is found when a folder is renamed to the name its index note expects', withTidy(async (p, h, t) => {
	await mk(p, { 'Outside/Idx.md': '---\nlongform:\n  format: scenes\n  sceneFolder: Scenes\n  scenes:\n    - B\n    - A\n---\n', 'Outside/Drafts/A.md': 'a', 'Outside/Drafts/B.md': 'b' });
	await rename(p, 'Outside/Drafts', 'Outside/Scenes');
	await p.sleep(1000);
	t.ok(await p.ev(`!!${B}.binderOf('Outside/Scenes')`), 'the renamed folder is the project’s binder');
}));

test('BUG: a scene named like a folder doesn’t silently vanish when it’s dragged into that folder', withTidy(async (p, h, t) => {
	await mk(p, { [`${L}/Part Two.md`]: 'A scene that happens to be called Part Two.' });
	await rows(p);
	const s = await drag(p, `${L}/Part Two.md`, top(await row(p, `${L}/Part Two/The wreck.md`)));
	await p.sleep(600);
	const shown = (await rows(p)).some((x) => /Part Two\.md$/.test(x)), said = (await notices(p)).length > 0;
	// Binders takes no drop there (hint: “${s.hint}”), so Obsidian moves the note in; it becomes the folder’s note, which
	// is hidden: gone from the explorer, the corkboard and the manuscript, with nothing said
	t.ok(shown || said, `the note still shows somewhere, or a notice says what became of it (hint was “${s.hint}”; it is now at ${j(await p.ev(`app.vault.getFiles().map(f => f.path).filter(x => /Part Two\\.md$/.test(x))`))})`);
}));

test('BUG: Longform: a scene from a group dropped after a top-level scene isn’t indented under it', withTidy(async (p, h, t) => {
	await rows(p, LF, [LF]);
	const s = await drag(p, `${LF}/Ticket office.md`, bottom(await row(p, `${LF}/Island.md`)));
	t.eq(s.hint, 'Move after “Island”', 'the hint');
	// the explorer shows no indents, so the drop can only mean "next to Island", at Island's level
	t.eq(await scenes(p), j(['Harbor', ['The crossing'], 'Island', 'Ticket office', 'Return']), 'Ticket office is a top-level scene between Island and Return');
}));

test('BUG: an explorer in its own window: clicking a folder of a binder opens it there too', withTidy(async (p, h, t) => {
	const click = `(el) => { const w = el.ownerDocument.defaultView; el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, view: w })); }`;
	await rows(p);
	const r = await p.ev(`(async () => {
		const pl = ${PL}, o = { main: [], popout: [] }; let into = o.main;
		pl.openBinder = (f) => { into.push(f.path); };
		try {
			(${click})(${EXP}.containerEl.querySelector('.nav-folder-title[data-path=${j(`${L}/Part One`)}] .nav-folder-title-content'));
			await new Promise(r => setTimeout(r, 200));
			const l = app.workspace.openPopoutLeaf(); await l.setViewState({ type: 'file-explorer', active: true });
			await new Promise(r => setTimeout(r, 1200));
			await l.view.fileItems[${j(L)}]?.setCollapsed(false); await new Promise(r => setTimeout(r, 500));
			o.order = [...l.view.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith(${j(L + '/')})).slice(0, 2);
			into = o.popout;
			(${click})(l.view.containerEl.querySelector('.nav-folder-title[data-path=${j(`${L}/Part One`)}] .nav-folder-title-content'));
			await new Promise(r => setTimeout(r, 300));
			l.detach();
		} finally { delete pl.openBinder; }
		return o; })()`);
	await p.focusMain();
	same(t, r.main, [`${L}/Part One`], 'in the main window a click opens the folder (the same made-up click)');
	same(t, r.order, [`${L}/Prologue.md`, `${L}/Part One`], 'the popped-out explorer shows binder order');
	same(t, r.popout, [`${L}/Part One`], 'and a click there opens the folder too');
}));

// ---- roughness ----

test('UX: a note can be dropped after an open folder that is the binder’s last item', withTidy(async (p, h, t) => {
	await rows(p);
	await drag(p, `${L}/Epilogue.md`, top(await row(p, `${L}/Prologue.md`)));
	same(t, short(await rows(p)).slice(-3), ['Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md'], 'Part Two, open, is now last');
	// every place below Part Two's last note: none of them means "after Part Two, at the binder's top level"
	const lo = await row(p, `${L}/Part Two/Lights out.md`), hints = [];
	for (const at of [{ x: lo.x, y: lo.b - 2 }, { x: lo.l + 4, y: lo.b - 2 }, { x: lo.x, y: lo.b + 4 }, { x: lo.x, y: lo.b + 16 }]) { hints.push((await hold(p, `${L}/Epilogue.md`, at)).hint); await cancel(p); }
	t.ok(hints.includes('Move after “Part Two”'), 'somewhere below the open folder means “after Part Two”: ' + j(hints));
}));

test('UX: “New scene here” leaves the new note’s name ready to type over, as Obsidian’s “New note” does', withTidy(async (p, h, t) => {
	await h.open(`${L}/Part One/The keeper.md`);
	await p.ev(`app.commands.executeCommandById('file-explorer:new-file')`); await p.sleep(900);
	const native = await p.ev(`[document.activeElement?.className, window.getSelection()?.toString()]`);
	await h.open(`${L}/Part One/The keeper.md`);
	await h.run('new-scene'); await p.sleep(900);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), `${L}/Part One/Untitled.md`, 'the new scene is open');
	same(t, await p.ev(`[document.activeElement?.className, window.getSelection()?.toString()]`), native, 'the title is focused with “Untitled” selected, as after “New note”');
}));
