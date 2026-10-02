// QA round 4: the whole thing, end to end, the way a writer uses it for a working day. Six journeys, each driven with
// real clicks, keys and drags (set-up aside), checking after every step that the notes hold the bytes a writer would
// expect, that the binder note's `contents` is what the three modes and the file explorer show, and that the keyboard is
// somewhere sensible. What only shows up when features are used together is at the end: `BUG:` tests fail now and pass
// when fixed; `UX:` tests say what a writer (or a Scrivener user) would expect instead.
//   QA4_SHOTS=<dir> saves screenshots along the way.
//
// Since 2026-10-01 the corkboard shows one folder at a time: a subfolder is one card, a stack, gone into with a
// double-click and left by the breadcrumb. What these journeys did among a folder's cards is done on that folder's
// board (`into`, `upTo`), and what was a heading's (its synopsis, its menu, its count) is the stack's.
import { B, PL, VIEW, answer, card, clickMenu, closeMenus, contents, exists, flush, hoverMenu, j, menuItems, openView, read, reload, same, split, texts, until, withTidy as tidyAfter } from './view-helpers.mjs';

export const specs = [];
const SHOTS = process.env.QA4_SHOTS || '';
const shot = (p, name) => (SHOTS ? p.shot(`${SHOTS}/${name}.png`) : Promise.resolve());
/** Every test: deleted notes go to the vault's own trash (not the computer's), dialogs and menus are closed, the
    settings are closed, and what the test made is removed. */
const wrap = (fn) => tidyAfter(async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	try { await fn(p, h, t); } finally {
		await closeMenus(p);
		await p.ev(`(async () => { document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); try { app.setting.close(); } catch {} app.vault.setConfig('trashOption', 'system'); app.vault.setConfig('promptDelete', true);
			for (const n of ['The Lighthouse (compiled).md', 'Part Two (compiled).md', 'Longform demo (compiled).md']) { const f = app.vault.getAbstractFileByPath(n); if (f) await app.vault.delete(f); }
			if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`);
	}
});
const test = (name, fn) => specs.push({ name: 'journey: ' + name, fn: wrap(fn) });

// ---- what's on screen ----

const AL = '.workspace-leaf.mod-active';
const L = 'The Lighthouse/', NOTE = L + 'The Lighthouse.md';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const NAMES = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
const N = 'Novel/', NNOTE = 'Novel/Novel.md';
const CHAPTERS = ['Chapter 1/', ...NAMES.slice(0, 6).map((n) => 'Chapter 1/' + n), 'Chapter 2/', ...NAMES.slice(6, 12).map((n) => 'Chapter 2/' + n), 'Chapter 3/', ...NAMES.slice(12, 18).map((n) => 'Chapter 3/' + n), 'Nineteen', 'Twenty'];
const sleep = (p, ms) => p.sleep(ms);
/** What has the keyboard, in words: "BODY" when nothing has. */
const focus = (p) => p.ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; return a.tagName.toLowerCase() + (typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + (a.dataset?.path ? '[' + a.dataset.path + ']' : '') + (a.dataset?.col ? '{' + a.dataset.col + '}' : ''); })()`);
/** Is the keyboard in the binder view (on a card, a row, a field, the text), not lost to the page? */
const inView = (p) => p.ev(`!!document.activeElement?.closest?.('.binders-view')`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).filter(Boolean).join(' | '); })()`);
const clearNotices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const cardsIn = (p) => p.ev(`[...document.querySelectorAll('${AL} .binders-card[data-path]')].map(c => c.dataset.path)`);
const rowsIn = (p) => p.ev(`[...document.querySelectorAll('${AL} .binders-outliner-row')].map(r => r.dataset.path)`);
const sectionsIn = (p) => p.ev(`[...document.querySelectorAll('${AL} .binders-manuscript-scene .binders-manuscript-title')].map(e => e.textContent)`);
const selCards = (p) => p.ev(`[...document.querySelectorAll('${AL} .binders-card.is-selected')].map(c => c.dataset.path)`);
const selRows = (p) => p.ev(`[...document.querySelectorAll('${AL} .binders-outliner-row.is-selected')].map(c => c.dataset.path)`);
const orow = (path) => `${AL} .binders-outliner-row[data-path="${path}"]`;
const oname = (p, path) => p.at(orow(path) + ' .binders-outliner-name');
const toolbar = (p, cls) => p.at(`${AL} .binders-toolbar .${cls}`);
const toolbarCount = (p) => p.ev(`document.querySelector('${AL} .binders-word-count')?.textContent ?? null`);
const modal = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); return m ? m.textContent : null; })()`);
/** Presses a button of the dialog on top. */
const press = (p, text) => p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); const b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return false; b.click(); return true; })()`).then(async (ok) => { await p.sleep(300); return ok; });
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? null)`).then(JSON.parse);
/** The binder note's list as written on disk, once anything pending is written. */
const list = async (p, note = NOTE) => { await flush(p); await p.sleep(150); return contents(p, note); };
/** A folder's stack on the board of the folder it's in. */
const stackSel = (folder) => `${AL} .binders-card.is-stack[data-path="${folder}"]`;
/** Into a folder from the board it's a stack on, as a writer goes: a double-click on the stack. */
async function into(p, folder) {
	const s = await p.at(stackSel(folder));
	if (!s) throw new Error('no stack for ' + folder);
	await p.dbl(s.x, s.t + 12);
	await until(p, `${VIEW}?.folder?.path === ${j(folder)} && !document.querySelector(${j(stackSel(folder))})`);
	await p.sleep(400);
}
/** And back out, by the breadcrumb, to a folder above (the binder itself if none is named). */
async function upTo(p, folder = null) {
	const sel = `${AL} .binders-crumb[role="link"]` + (folder ? `[data-path="${folder}"]` : '');
	const c = await p.at(sel);
	if (!c) throw new Error('no breadcrumb to go up by');
	const to = await p.ev(`document.querySelector(${j(sel)}).dataset.path`);
	await p.click(c.x, c.y);
	await until(p, `${VIEW}?.folder?.path === ${j(to)}`);
	await p.sleep(400);
}
const tabs = (p) => p.ev(`(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; })()`);
const mode = async (p, h, m) => { await h.run('show-' + m); await p.sleep(400); };
/** A press, a move with the button held, and a release, as a hand does it. */
async function drag(p, from, to, steps = 16) { await p.drag(from.x, from.y, to.x, to.y, steps); await p.sleep(450); }
/** Runs a command from the real command palette. */
async function palette(p, name) {
	await p.key('p', 'ctrl');
	await until(p, `!!document.querySelector('.prompt input')`);
	await p.type(name);
	await p.sleep(250);
	await p.key('Enter');
	await p.sleep(350);
}

// ---- the file explorer ----

/** The explorer's rows under a folder, top to bottom, with everything in it unfolded. */
async function explorerRows(p, under) {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[0].view; for (const k of Object.keys(v.fileItems)) if (k === ${j(under)} || k.startsWith(${j(under + '/')})) v.fileItems[k].setCollapsed?.(false); return 1; })()`);
	await p.sleep(350);
	return p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith(${j(under + '/')}))`);
}
const exRow = (p, path) => p.at(`.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="${path}"]`);
/** A real drag of explorer rows to a point; returns the hint that showed under the pointer. */
async function exDrag(p, from, to) {
	await p.move(from.x, from.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
	await p.move(from.x + 6, from.y - 6, 3, { buttons: 1 });
	await p.move(to.x, to.y, 12, { buttons: 1 });
	await p.sleep(300);
	const hint = await p.ev(`document.querySelector('.drag-ghost-action')?.textContent ?? ''`);
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
	await p.sleep(700);
	return hint;
}
/** Back to the binder view's pane after working elsewhere: its tab, then the empty middle of its toolbar. */
async function intoView(p) {
	const tab = await p.at('.mod-root .workspace-tab-header[data-type="binders-view"] .workspace-tab-header-inner-title');
	if (tab) { await p.click(tab.x, tab.y); await p.sleep(250); }
	const s = await p.at('.mod-root .workspace-leaf.mod-active .binders-view .binders-toolbar-spacer') ?? await p.at('.mod-root .binders-view .binders-toolbar-spacer');
	if (s) await p.click(s.x, s.y);
	await p.sleep(150);
}

/** The binder's notes as each mode and the file explorer show them, and as the binder note lists them: all one order.
    (Leaves the view in the manuscript.) */
async function agree(p, h, t, folder, when) {
	const strip = (x) => x.slice(folder.length + 1).replace(/\.md$/, '');
	const all = await list(p, `${folder}/${folder.split('/').pop()}.md`), disk = all.filter((x) => !x.endsWith('/'));
	await mode(p, h, 'corkboard');
	// (the board shows the binder's own items: its loose notes, and each folder as one stack that counts its notes)
	const own = all.filter((x) => (x.endsWith('/') ? x.split('/').length === 2 : !x.includes('/')));
	const shown = await p.ev(`[...document.querySelectorAll('${AL} .binders-card[data-path]')].map(c => [c.dataset.path, c.classList.contains('is-stack'), c.querySelector('.binders-card-words')?.textContent ?? ''])`);
	t.eq(j(shown.map(([path, stack]) => strip(path) + (stack ? '/' : ''))), j(own), `${when}: the corkboard shows the binder’s own items in the binder note’s order, each folder as one stack`);
	for (const [path, stack, text] of shown) {
		if (!stack) continue;
		const n = disk.filter((x) => x.startsWith(strip(path) + '/')).length;
		t.ok(text.startsWith(`${n} ${n === 1 ? 'note' : 'notes'}`), `${when}: the stack of “${strip(path)}” counts the ${n} notes the binder note lists in it: ${text}`);
	}
	await mode(p, h, 'outliner');
	t.eq(j((await rowsIn(p)).filter((x) => /\.md$/.test(x)).map(strip)), j(disk), `${when}: so does the outliner`);
	await mode(p, h, 'manuscript');
	await p.sleep(200);
	t.eq(j(await sectionsIn(p)), j(disk.map((x) => x.split('/').pop())), `${when}: and the manuscript`);
	t.eq(j((await explorerRows(p, folder)).filter((x) => /\.md$/.test(x)).map(strip)), j(disk), `${when}: and the file explorer`);
	return disk;
}

// ---- the manuscript ----

const scene = (title) => `[...document.querySelectorAll('${AL} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === ${j(title)})`;
/** Clicks in the last line of a section's text and presses End: the cursor is at the end of its text. */
async function clickEnd(p, title) {
	await p.ev(`(${scene(title)}).scrollIntoView({ block: 'center' })`);
	await p.sleep(500);
	const r = await p.ev(`(() => { const s = ${scene(title)}; const lines = [...s.querySelectorAll('.cm-line, .binders-manuscript-rendered p')]; const l = lines.reverse().find(x => x.textContent.trim()) ?? s.querySelector('.binders-manuscript-body'); const b = l.getBoundingClientRect(); return { x: b.left + 20, y: b.bottom - 8 }; })()`);
	await p.click(r.x, r.y);
	await p.sleep(350);
	await p.key('End');
	await p.sleep(100);
}
const titleAt = (p, title) => p.ev(`(() => { const b = (${scene(title)}).querySelector('.binders-manuscript-title').getBoundingClientRect(); return { x: b.left + 10, y: b.top + b.height / 2 }; })()`);
/** The section the cursor is in (null when it isn't in the manuscript's text). */
const caretScene = (p) => p.ev(`(() => { const a = document.activeElement; return a?.closest?.('.cm-content') ? a.closest('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title').textContent ?? null : null; })()`);
const editorText = (p) => p.ev(`app.workspace.activeEditor?.editor?.getValue() ?? null`);
/** Types as a person does: a key at a time, `ms` apart. */
async function typeAt(p, text, ms = 0) { for (const ch of text) { await p.send('Input.insertText', { text: ch }); if (ms) await p.sleep(ms); } await p.sleep(60); }
/** Long enough for an editor to have saved what was typed (Obsidian saves two seconds after the last key). */
const SAVED = 2700;

// ---- word counts ----

/** Words in each note's text on disk, counted here (letters, digits, hyphens and apostrophes make a word). */
const diskWords = (p, under) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(under + '/')}))) { const t = (await app.vault.adapter.read(f.path)).replace(/^---\\n[\\s\\S]*?\\n---(?:\\n|$)/, ''); o[f.path] = (t.match(/(?:[0-9]+(?:[,.][0-9]+)*|[\\-'’\\p{L}\\p{M}])+/gu) ?? []).length; } return o; })()`);
const words = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'word' : 'words'}`;
/** Every count in the view (toolbar, cards, folders' stacks, outliner rows and the last row) against the notes on disk.
    `pass`: with a filter on, the notes that pass it; `bar` false leaves the toolbar out. (Leaves the view in the
    outliner.) */
async function countsAgree(p, h, t, folder, when, pass = null, bar = true) {
	const disk = await diskWords(p, folder), binderNote = `${folder}/${folder.split('/').pop()}.md`;
	const scenes = await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath(${j(folder)})).map(f => f.path)`);
	const shown = pass ? scenes.filter((s) => pass.includes(s)) : scenes;
	const sum = (paths) => paths.reduce((a, x) => a + disk[x], 0), total = sum(scenes);
	t.ok(!scenes.includes(binderNote), 'the binder note is not a scene');
	const want = pass ? `${sum(shown).toLocaleString('en-US')} of ${words(total)}` : words(total);
	await mode(p, h, 'corkboard');
	if (bar) {
		await until(p, `document.querySelector('${AL} .binders-word-count')?.textContent === ${j(want)}`, 4000);
		t.eq(await toolbarCount(p), want, `${when}: the toolbar counts what’s on disk`);
	}
	await until(p, `[...document.querySelectorAll('${AL} .binders-card[data-path]')].every(c => c.querySelector('.binders-card-words'))`, 4000);
	// the board of the folder shown: its own notes' cards, and a stack for each folder in it; then each folder's board
	const board = async (dir) => {
		const cards = await p.ev(`[...document.querySelectorAll('${AL} .binders-card[data-path]')].map(c => [c.dataset.path, c.classList.contains('is-stack'), c.querySelector('.binders-card-words')?.textContent ?? null])`);
		const own = shown.filter((s) => s.startsWith(dir + '/') && !s.slice(dir.length + 1).includes('/'));
		t.eq(j(cards.filter(([, stack]) => !stack).map(([path, , text]) => [path, text])), j(own.map((s) => [s, words(disk[s])])), `${when}: each card ${dir === folder ? '' : `in “${dir.split('/').pop()}” `}counts its note`);
		const stacks = cards.filter(([, stack]) => stack);
		for (const [path, , text] of stacks) {
			const all = scenes.filter((s) => s.startsWith(path + '/')), on = all.filter((s) => shown.includes(s));
			t.eq(text, `${on.length === all.length ? `${all.length} ${all.length === 1 ? 'note' : 'notes'}` : `${on.length} of ${all.length} notes`} · ${words(sum(on))}`, `${when}: the stack of “${path.split('/').pop()}” adds up its notes`);
		}
		return stacks.map(([path]) => path);
	};
	for (const sub of await board(folder)) {
		await into(p, sub);
		await until(p, `[...document.querySelectorAll('${AL} .binders-card[data-path]')].every(c => c.querySelector('.binders-card-words'))`, 4000);
		await board(sub);
		await upTo(p, folder);
	}
	await mode(p, h, 'outliner');
	const rows = await p.ev(`[...document.querySelectorAll('${AL} .binders-outliner-row')].map(r => [r.dataset.path, r.querySelector('[data-col="words"]')?.textContent ?? null])`);
	for (const [path, text] of rows) {
		const want = /\.md$/.test(path) ? disk[path] : sum(shown.filter((s) => s.startsWith(path + '/')));
		t.eq(text, want.toLocaleString('en-US'), `${when}: the outliner’s Words for “${path.split('/').pop()}”`);
	}
	const foot = await p.ev(`[...document.querySelectorAll('${AL} .binders-outliner-foot .binders-outliner-cell')].map(c => c.textContent).filter(Boolean)`);
	t.eq(j(foot.slice(0, 2)), j([`${shown.length} ${shown.length === 1 ? 'note' : 'notes'}`, sum(shown).toLocaleString('en-US')]), `${when}: the last row adds up what shows`);
}

// ---- set-up (through the store: what's under test is driven by hand) ----

/** A binder "Novel" with these empty scenes. */
async function novel(p, names = NAMES) {
	await p.ev(`(async () => { await app.vault.createFolder('Novel'); await ${B}.makeBinder(app.vault.getAbstractFileByPath('Novel')); for (let i = 0; i < 60 && !${B}.binderOf('Novel'); i++) await new Promise(r => setTimeout(r, 50)); for (const n of ${j(names)}) await ${B}.newScene(app.vault.getAbstractFileByPath('Novel'), Infinity, n); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(400);
}
/** "Novel" as three chapters of six scenes and two loose ones, each with `paragraphs` of text. */
async function chapters(p, paragraphs = 1) {
	await novel(p);
	await p.ev(`(async () => { const f = (n) => app.vault.getAbstractFileByPath('Novel/' + n + '.md'), names = ${j(NAMES)};
		for (let c = 0; c < 3; c++) await ${B}.group(names.slice(c * 6, c * 6 + 6).map(f), 'Chapter ' + (c + 1));
		for (const file of ${B}.scenes(app.vault.getAbstractFileByPath('Novel'))) await app.vault.modify(file, Array.from({ length: ${paragraphs} }, (_, i) => 'Paragraph ' + (i + 1) + ' of ' + file.basename + ': the sea kept on at the rocks below and nobody came.').join('\\n\\n') + '\\n');
		await ${B}.flush(); ${B}.undos = []; ${B}.redos = []; })().then(() => 1)`);
	await p.sleep(600);
}
/** Every scene's text by its name (names are unique here), so a note that changed folder is still found. */
const byName = (p, under) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(under + '/')}))) o[f.basename] = await app.vault.adapter.read(f.path); return o; })()`);

// ================================================================================================================
// 1. A new novel from nothing
// ================================================================================================================

test('1a. a new novel from nothing: a folder made a binder, twenty scenes from the toolbar, the keyboard and the explorer’s menus, statuses, labels and synopses for many at once, and labels and statuses changed in settings', async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`app.vault.createFolder('Novel').then(() => 1)`);
	await p.sleep(300);
	await explorerRows(p, 'Novel');
	let r = await exRow(p, 'Novel');
	await p.right(r.x, r.y);
	t.ok((await menuItems(p)).includes('Make this folder a binder'), 'a folder’s menu offers to make it a binder');
	await clickMenu(p, 'Make this folder a binder');
	await until(p, `app.vault.adapter.exists('Novel/Novel.md')`);
	t.eq(await read(p, NNOTE), '---\nbinder: 1\ncontents: []\n---\n', 'the binder note: its format, and an empty list');
	t.ok(/“Novel” is now a binder/.test(await notices(p)), 'and a notice says so');
	await until(p, `!!${B}.binderOf('Novel')`);
	// a click on the folder opens it, as a corkboard
	r = await exRow(p, 'Novel');
	await p.click(r.x, r.y);
	await until(p, `!!document.querySelector('${AL} .binders-view .binders-toolbar')`);
	await p.sleep(300);
	t.eq(await p.ev(`${VIEW}.mode`), 'corkboard', 'a click on the binder opens it as a corkboard');
	t.eq(await p.ev(`document.querySelector('${AL} .binders-empty')?.textContent`), 'No notes in this folder yetUse “New” above to add one.', 'which says it’s empty, and what to do');
	await shot(p, '1a-empty');

	// eight from the toolbar's New: a title, Enter, the next
	const nb = await toolbar(p, 'binders-new-button');
	await p.click(nb.x, nb.y);
	t.eq(j(await menuItems(p)), j(['New note', 'New folder']), 'New makes notes and folders');
	await clickMenu(p, 'New note');
	t.ok(await p.ev(`document.activeElement.matches('.binders-card-new input')`), 'a title to type');
	for (const name of NAMES.slice(0, 8)) { await p.type(name); await p.key('Enter'); await until(p, `app.vault.adapter.exists('Novel/${name}.md')`); await p.sleep(200); }
	await p.key('Escape');
	await p.sleep(200);
	t.ok(await p.ev(`document.activeElement.matches('.binders-card-new')`), 'Escape ends it, with the focus on the New note card');
	// six from the keyboard: the command, from the palette, with the binder view in front
	await palette(p, 'New scene here');
	t.ok(await p.ev(`document.activeElement.matches('.binders-card-new input')`), '“New scene here” from the command palette starts a card');
	for (const name of NAMES.slice(8, 14)) { await p.type(name); await p.key('Enter'); await until(p, `app.vault.adapter.exists('Novel/${name}.md')`); await p.sleep(200); }
	await p.key('Escape');
	await p.sleep(200);
	t.eq(j(await list(p, NNOTE)), j(NAMES.slice(0, 14)), 'fourteen, in the order they were made');
	// six from the explorer: the folder's menu, then each new note's own
	r = await exRow(p, 'Novel');
	await p.right(r.x, r.y);
	const binderMenu = await menuItems(p);
	t.ok(['Open binder', 'New scene here', 'Compile...'].every((x) => binderMenu.includes(x)), 'a binder’s menu has Binders’ own items: ' + binderMenu.join(', '));
	// (a note made from the explorer shows on the board in front, to be named there. On a desktop its name isn't put
	// ready to type: the BUG: qa7 test below. Here it's then opened as a writer would, with F2 on the new card.)
	const naming = async () => {
		if (await until(p, `document.activeElement?.matches('.inline-title, .binders-edit-field')`, 1500)) return;
		await p.ev(`document.querySelector(${j(card(N + 'Untitled.md'))})?.scrollIntoView({ block: 'center' })`);
		await p.sleep(200);
		const c = await p.at(card(N + 'Untitled.md'));
		await p.click(c.x, c.t + 12);
		await p.key('F2');
		await until(p, `document.activeElement?.matches('.binders-edit-field')`);
	};
	await clickMenu(p, 'New scene here');
	await until(p, `app.vault.adapter.exists('Novel/Untitled.md')`);
	await naming();
	await p.type('Fifteen');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('Novel/Fifteen.md')`);
	for (let i = 15; i < 20; i++) {
		await explorerRows(p, 'Novel');
		const at = await exRow(p, `Novel/${NAMES[i - 1]}.md`);
		if (!at) throw new h.Fail(`no row for “${NAMES[i - 1]}” in the file explorer: ` + j(await explorerRows(p, 'Novel')) + ' / on disk: ' + j(await p.ev(`app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Novel/')).map(f => f.basename)`)) + ' / focus: ' + await focus(p));
		await p.right(at.x, at.y);
		await clickMenu(p, 'New scene after this');
		await until(p, `app.vault.adapter.exists('Novel/Untitled.md')`);
		await naming();
		await p.sleep(150);
		await p.type(NAMES[i]);
		await p.key('Enter');
		await until(p, `app.vault.adapter.exists('Novel/${NAMES[i]}.md')`);
	}
	t.eq(j(await list(p, NNOTE)), j(NAMES), 'twenty scenes, each where it was made');
	for (const n of NAMES) t.eq(await read(p, `${N}${n}.md`), '', `“${n}” is an empty note`);
	// back to the binder: every mode and the explorer agree
	await explorerRows(p, 'Novel');
	r = await exRow(p, 'Novel');
	await p.click(r.x, r.y);
	await until(p, `!!document.querySelector('.mod-root .binders-view .binders-toolbar')`);
	// (the binder's view was in front all along: the new notes showed on its board, and the explorer still has the keyboard)
	await intoView(p);
	await agree(p, h, t, 'Novel', 'twenty scenes');
	await mode(p, h, 'corkboard');
	await shot(p, '1a-twenty');

	// statuses and labels for many at once: a range on the corkboard
	// (the board comes back where the last new card left it, at its end, and holds there a moment: then back to its top)
	await p.sleep(800);
	await p.ev(`(() => { document.querySelector('${AL} .binders-corkboard').scrollTop = 0; return 1; })()`);
	await p.sleep(300);
	t.eq(await p.ev(`Math.round(document.querySelector('${AL} .binders-corkboard').scrollTop)`), 0, 'the board is at its top');
	const one = await p.at(card(N + 'One.md')), ten = await p.at(card(N + 'Ten.md'));
	await p.click(one.x, one.t + 12);
	await p.click(ten.x, ten.t + 12, { modifiers: 8 });
	t.eq((await selCards(p)).length, 10, 'Shift-click selects One to Ten');
	await p.right(ten.x, ten.y);
	await hoverMenu(p, 'Set status');
	await clickMenu(p, 'Draft');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Novel/One.md'))?.frontmatter?.status === 'Draft' && app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Novel/Ten.md'))?.frontmatter?.status === 'Draft'`);
	t.eq((await selCards(p)).length, 10, 'they stay selected');
	t.ok(await inView(p), 'and the keyboard stays on the board: ' + await focus(p));
	await p.key('F10', 'shift');
	await p.sleep(200);
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Blue');
	await until(p, `['One', 'Ten'].every(n => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Novel/' + n + '.md'))?.frontmatter?.label === 'Blue')`);
	await p.sleep(300);
	for (const n of NAMES.slice(0, 10)) t.eq(await read(p, `${N}${n}.md`), '---\nstatus: Draft\nlabel: Blue\n---\n', `“${n}” has the status and the label, and nothing else`);
	// a synopsis: a click on a selected card's synopsis
	const syn = await p.at(card(N + 'Three.md') + ' .binders-card-synopsis');
	await p.click(syn.x, syn.y);
	t.ok(await p.ev(`document.activeElement.matches('.binders-card-synopsis textarea')`), 'a click on a selected card’s synopsis edits it');
	await p.type('The third scene.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.read('Novel/Three.md').then(s => s.includes('synopsis'))`);
	t.eq(await read(p, N + 'Three.md'), '---\nstatus: Draft\nlabel: Blue\nsynopsis: The third scene.\n---\n', 'the synopsis is written with the rest');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), N + 'Three.md', 'and the card has the focus again');
	// the other ten in the outliner: Shift+Down, then the cells of a selected row
	await mode(p, h, 'outliner');
	const el = await oname(p, N + 'Eleven.md');
	await p.click(el.x, el.y);
	for (let i = 0; i < 9; i++) await p.key('ArrowDown', 'shift');
	t.eq((await selRows(p)).length, 10, 'Shift+Down selects Eleven to Twenty');
	let cell = await p.at(orow(N + 'Twenty.md') + ' [data-col="status"]');
	await p.click(cell.x, cell.y);
	await clickMenu(p, 'Idea');
	await until(p, `['Eleven', 'Twenty'].every(n => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Novel/' + n + '.md'))?.frontmatter?.status === 'Idea')`);
	t.eq((await selRows(p)).length, 10, 'the rows stay selected');
	cell = await p.at(orow(N + 'Twenty.md') + ' [data-col="label"]');
	await p.click(cell.x, cell.y);
	await clickMenu(p, 'Custom color...');
	await until(p, `!!document.querySelector('.modal input[aria-label="Hex color"]')`);
	await p.key('a', 'ctrl');
	await p.type('#7C3AED');
	await p.key('Enter');
	await until(p, `['Eleven', 'Twenty'].every(n => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Novel/' + n + '.md'))?.frontmatter?.label === '#7c3aed')`);
	await p.sleep(300);
	for (const n of NAMES.slice(10)) t.eq(await read(p, `${N}${n}.md`), '---\nstatus: Idea\nlabel: "#7c3aed"\n---\n', `“${n}” has the status and a color of its own`);
	t.ok(await inView(p), 'the keyboard is still in the outliner: ' + await focus(p));

	// settings: a label and a status added and named; one of each renamed, the question answered both ways
	const TAB = `app.setting.activeTab.containerEl`;
	const typeName = (kind, i, value) => p.ev(`(() => { const el = ${TAB}.querySelectorAll('.binders-settings-${kind} input[type="text"]')[${i}]; el.focus(); el.value = ${j(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); el.dispatchEvent(new FocusEvent('blur')); return 1; })()`).then(() => p.sleep(300));
	const add = (label) => p.ev(`(() => { const b = ${TAB}.querySelector('[aria-label="${label}"]'); if (!b) return false; b.click(); return true; })()`).then(async (ok) => { await p.sleep(350); return ok; });
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `${TAB}.querySelectorAll('.binders-settings-label').length > 0`);
	t.ok(await add('Add label'), 'a label can be added');
	await typeName('labels', 8, 'Subplot');
	t.ok(await add('Add status'), 'and a status');
	await typeName('statuses', 4, 'Final');
	await typeName('labels', 5, 'Sea');
	t.ok(/10 notes have the label “Blue”\. Change it to “Sea” there too\?/.test(await modal(p) ?? await p.ev(`[...${TAB}.ownerDocument.querySelectorAll('.modal')].pop()?.textContent ?? ''`)), 'renaming a label asks about the notes that have it');
	t.ok(await answer(p, 'Change them'), 'yes');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Novel/Ten.md'))?.frontmatter?.label === 'Sea'`);
	await typeName('statuses', 1, 'First draft');
	t.ok(await answer(p, 'Cancel'), 'renaming a status asks too; this time, no');
	await p.sleep(300);
	t.eq(j(await p.ev(`${PL}.settings.statuses`)), j(['Idea', 'First draft', 'Revised', 'Done', 'Final']), 'the statuses in settings');
	t.eq(j((await p.ev(`${PL}.settings.labels`)).map((l) => l.name)), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Sea', 'Purple', 'Pink', 'Subplot']), 'the labels in settings');
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	await p.sleep(300);
	for (const n of NAMES.slice(0, 10)) if (n !== 'Three') t.eq(await read(p, `${N}${n}.md`), '---\nstatus: Draft\nlabel: Sea\n---\n', `“${n}” took the label’s new name and kept its status`);
	t.eq(await read(p, N + 'Three.md'), '---\nstatus: Draft\nlabel: Sea\nsynopsis: The third scene.\n---\n', '“Three” too, with its synopsis');
	// the menus follow: the status no longer in the list is still offered, after it
	await intoView(p);
	const o = await oname(p, N + 'One.md');
	await p.click(o.x, o.y);
	cell = await p.at(orow(N + 'One.md') + ' [data-col="status"]');
	await p.click(cell.x, cell.y);
	t.eq(j(await menuItems(p)), j(['Idea', 'First draft', 'Revised', 'Done', 'Final', 'Draft', 'New status...', 'No status']), 'the status menu: the list from settings, then what the notes still use');
	await closeMenus(p);
	cell = await p.at(orow(N + 'One.md') + ' [data-col="label"]');
	await p.click(cell.x, cell.y);
	t.eq(j(await menuItems(p)), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Sea', 'Purple', 'Pink', 'Subplot', 'Custom color...', 'No label', 'Edit labels...']), 'the label menu, with the renamed and the new label');
	await closeMenus(p);
	t.eq(await p.ev(`document.querySelector(${j(orow(N + 'One.md') + ' [data-col="label"]')}).textContent`), 'Sea', 'the row shows the label by its new name');
	t.eq(j(await list(p, NNOTE)), j(NAMES), 'the order is as it was');
	same(t, before, await texts(p));
});

test('1b. chapters: scenes grouped into three folders by “New folder from selection” (corkboard, keyboard menu, outliner), named in place, with synopses and targets; the binder’s target from the toolbar', async (p, h, t) => {
	await novel(p);
	await openView(p, 'Novel');
	const c = (n) => card(`${N}${n}.md`);
	// One to Six: a range, the menu
	let a = await p.at(c('One')), e = await p.at(c('Six'));
	await p.click(a.x, a.t + 12);
	await p.click(e.x, e.t + 12, { modifiers: 8 });
	await p.right(e.x, e.y);
	await clickMenu(p, 'New folder from selection');
	await until(p, `document.activeElement?.matches('${AL} .binders-card.is-stack .binders-card-title input')`);
	t.ok(await p.ev(`document.activeElement?.matches('${AL} .binders-card.is-stack .binders-card-title input')`), 'the new folder’s name is ready to type, on its stack: ' + await focus(p));
	await p.type('Chapter 1');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 1/Six.md')`);
	t.eq(j((await list(p, NNOTE)).slice(0, 8)), j([...CHAPTERS.slice(0, 7), 'Seven']), 'a folder where One was, holding the six in order');
	await until(p, `document.querySelectorAll('${AL} .binders-card[data-path]').length === 15`);
	t.eq(j((await cardsIn(p)).slice(0, 2)), j(['Novel/Chapter 1', 'Novel/Seven.md']), 'on the board the six are one stack now, where One was');
	t.eq(await p.ev(`document.querySelector(${j(stackSel('Novel/Chapter 1'))} + ' .binders-card-words')?.textContent`), '6 notes · 0 words', 'which counts them');
	// Seven to Twelve: Ctrl-clicks, and the menu from the keyboard
	await p.sleep(400);
	for (const n of NAMES.slice(6, 12)) { const x = await p.at(c(n)); await p.click(x.x, x.t + 12, n === 'Seven' ? {} : { modifiers: 2 }); }
	t.eq((await selCards(p)).length, 6, 'Ctrl-click selects six');
	await p.key('F10', 'shift');
	await p.sleep(200);
	await clickMenu(p, 'New folder from selection');
	await until(p, `document.activeElement?.matches('${AL} .binders-card.is-stack .binders-card-title input')`);
	await p.type('Chapter 2');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 2/Twelve.md')`);
	// Thirteen to Eighteen: in the outliner
	await mode(p, h, 'outliner');
	a = await oname(p, N + 'Thirteen.md'); e = await oname(p, N + 'Eighteen.md');
	await p.click(a.x, a.y);
	await p.click(e.x, e.y, { modifiers: 8 });
	await p.right(e.x, e.y);
	await clickMenu(p, 'New folder from selection');
	await until(p, `document.activeElement?.matches('${AL} .binders-outliner-name input')`);
	await p.type('Chapter 3');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 3/Eighteen.md')`);
	await p.sleep(400);
	t.eq(j(await selRows(p)), j(['Novel/Chapter 3']), 'in the outliner the new folder is selected once it’s named');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'Novel/Chapter 3', 'and has the focus');
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'three chapters and two loose scenes');
	for (const n of NAMES) t.eq(await p.ev(`app.vault.getMarkdownFiles().find(f => f.basename === ${j(n)}).stat.size`), 0, `“${n}” is still an empty note`);

	// a chapter's target in the outliner's Target column, its synopsis from its row's menu
	const plus = await p.at(`${AL} .binders-outliner-th.mod-add`);
	await p.click(plus.x, plus.y);
	t.eq(j(await menuItems(p)), j(['Label', 'Status', 'Words', 'Target', 'Progress', 'Compile', 'Created', 'Modified', 'Other property...']), 'the columns to choose from');
	await clickMenu(p, 'Target');
	await p.sleep(300);
	let n = await oname(p, 'Novel/Chapter 1');
	await p.click(n.x, n.y);
	const tg = await p.at(orow('Novel/Chapter 1') + ' [data-col="target"]');
	await p.click(tg.x, tg.y);
	await until(p, `document.activeElement?.matches('${AL} [data-col="target"] input')`);
	await p.type('6000');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 1/Chapter 1.md')`);
	await p.sleep(300);
	t.eq(await read(p, 'Novel/Chapter 1/Chapter 1.md'), '---\ntarget: 6000\n---\n', 'the chapter’s target is in its folder note, made for it');
	n = await oname(p, 'Novel/Chapter 1');
	await p.right(n.x, n.y);
	await clickMenu(p, 'Edit synopsis');
	t.ok(await p.ev(`document.activeElement?.matches('${AL} .binders-outliner-synopsis textarea')`), '“Edit synopsis” puts the cursor under the folder’s name');
	await p.type('The first chapter.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.read('Novel/Chapter 1/Chapter 1.md').then(s => s.includes('synopsis'))`);
	t.eq(await read(p, 'Novel/Chapter 1/Chapter 1.md'), '---\ntarget: 6000\nsynopsis: The first chapter.\n---\n', 'the synopsis joins it');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'Novel/Chapter 1', 'and the row has the focus again');
	// the other two on the corkboard: the folder card's synopsis (the first from "Edit synopsis" in its menu, since a
	// folder's card with none has no line for one; then a click on it once the card is selected), and "Set target..."
	// in its menu
	await mode(p, h, 'corkboard');
	t.eq(j(await cardsIn(p)), j(['Novel/Chapter 1', 'Novel/Chapter 2', 'Novel/Chapter 3', 'Novel/Nineteen.md', 'Novel/Twenty.md']), 'the board: three stacks and the two loose scenes');
	for (const name of ['Chapter 2', 'Chapter 3']) {
		const field = stackSel('Novel/' + name) + ' .binders-card-synopsis textarea';
		const st = await p.at(stackSel('Novel/' + name));
		t.eq(await p.at(stackSel('Novel/' + name) + ' .binders-card-synopsis'), null, 'a folder’s card with no synopsis shows no line for one');
		await p.right(st.x, st.t + 12);
		await clickMenu(p, 'Edit synopsis');
		await until(p, `document.activeElement?.matches(${j(field)})`);
		t.ok(await p.ev(`document.activeElement?.matches(${j(field)})`), `“Edit synopsis” in the folder card’s menu opens its synopsis: ${await focus(p)}`);
		t.eq(await p.ev(`${VIEW}.folder.path`), 'Novel', 'and doesn’t go into the folder');
		await p.type(`${name}, in a line.`);
		await p.key('Enter', 'ctrl');
		await until(p, `app.vault.adapter.exists('Novel/${name}/${name}.md')`);
		// once it has one: the card selected a moment, then a click on the synopsis edits it in place
		await until(p, `document.querySelector(${j(stackSel('Novel/' + name) + ' .binders-card-synopsis')})?.textContent === ${j(`${name}, in a line.`)}`);
		const again = await p.at(stackSel('Novel/' + name));
		await p.click(again.x, again.t + 12);
		await p.sleep(700);
		const sy = await p.at(stackSel('Novel/' + name) + ' .binders-card-synopsis');
		await p.click(sy.x, sy.y);
		await until(p, `document.activeElement?.matches(${j(field)})`);
		t.ok(await p.ev(`document.activeElement?.matches(${j(field)})`), `a click on the selected folder card’s synopsis edits it: ${await focus(p)}`);
		t.eq(await p.ev(`${VIEW}.folder.path`), 'Novel', 'and doesn’t go into the folder either');
		await p.key('Escape');
		const hd = await p.at(stackSel('Novel/' + name));
		await p.right(hd.x, hd.t + 12);
		await clickMenu(p, 'Set target...');
		await until(p, `!!document.querySelector('.modal .binders-ask input')`);
		await p.type('5,000');
		await p.key('Enter');
		await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Novel/${name}/${name}.md'))?.frontmatter?.target === 5000`);
		t.eq(await read(p, `Novel/${name}/${name}.md`), `---\nsynopsis: ${name}, in a line.\ntarget: 5000\n---\n`, `“${name}” has its synopsis and target in its folder note`);
	}
	await until(p, `document.querySelectorAll('${AL} .binders-card.is-stack .binders-card-words')[2]?.textContent.includes('5,000')`);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${AL} .binders-card.is-stack .binders-card-words')].map(e => e.textContent)`)), j(['6 notes · 0 / 6,000 words', '6 notes · 0 / 5,000 words', '6 notes · 0 / 5,000 words']), 'each stack says how far along its chapter is');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${AL} .binders-card.is-stack .binders-card-synopsis')].map(e => e.textContent)`)), j(['The first chapter.', 'Chapter 2, in a line.', 'Chapter 3, in a line.']), 'and shows its synopsis');
	// into a chapter and back: its six scenes are its board, the breadcrumb is the way out
	await into(p, 'Novel/Chapter 2');
	t.eq(j((await cardsIn(p)).map((x) => x.split('/').pop().replace('.md', ''))), j(NAMES.slice(6, 12)), 'a double-click on a stack goes into the folder: its six scenes, and no card for its folder note');
	t.eq(await p.ev(`document.querySelector('${AL} .binders-view-synopsis')?.textContent`), 'Chapter 2, in a line.', 'with its synopsis under the toolbar');
	t.ok(await inView(p), 'and the keyboard: ' + await focus(p));
	await upTo(p);
	t.eq((await cardsIn(p)).length, 5, 'the breadcrumb leads back out');
	// the binder's own target: a click on the toolbar's word count
	const wc = await toolbar(p, 'binders-word-count');
	await p.click(wc.x, wc.y);
	await until(p, `!!document.querySelector('.modal .binders-ask input')`);
	t.ok(/^Word count target for the binder/.test(await modal(p)), 'the word count asks for the binder’s target');
	await p.type('80,000');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Novel/Novel.md'))?.frontmatter?.target === 80000`);
	await until(p, `document.querySelector('${AL} .binders-word-count')?.textContent === '0 / 80,000 words'`);
	t.eq(await toolbarCount(p), '0 / 80,000 words', 'the toolbar shows it');
	t.ok(await inView(p), 'and the keyboard is back in the view: ' + await focus(p));
	t.eq(await read(p, NNOTE), `---\nbinder: 1\ncontents:\n${CHAPTERS.map((x) => '  - ' + x).join('\n')}\ntarget: 80000\n---\n`, 'the binder note: the order, then the target; folder notes are not in the list');
	await shot(p, '1b-chapters');
	await agree(p, h, t, 'Novel', 'three chapters');
});

test('1c. reordering: several cards dragged onto a folder’s stack and along a folder’s own board, rows dragged and moved with Alt+arrows, notes dragged in the file explorer (one, then two at once), each taken back with Ctrl+Z or the command and made again; a sort kept as the binder’s order, and undone', async (p, h, t) => {
	await chapters(p);
	const before = await byName(p, 'Novel');
	const unchanged = async (when) => { const now = await byName(p, 'Novel'); for (const n of NAMES) t.eq(now[n], before[n], `${when}: “${n}” has the text it had`); };
	await openView(p, 'Novel');
	const c = (n) => card(`${N}${n}.md`);
	const moved = (l) => l.map((x, i) => (x === CHAPTERS[i] ? null : `${i}:${x}`)).filter(Boolean).join(' ');
	// corkboard: the two loose scenes, Nineteen and Twenty, onto chapter 2's stack
	const nineteen = await p.at(c('Nineteen')), twentyCard = await p.at(c('Twenty'));
	await p.click(nineteen.x, nineteen.t + 12);
	await p.click(twentyCard.x, twentyCard.t + 12, { modifiers: 2 });
	const ch2 = await p.at(stackSel('Novel/Chapter 2'));
	await drag(p, { x: nineteen.x, y: nineteen.t + 12 }, { x: ch2.x, y: ch2.y });
	await until(p, `app.vault.adapter.exists('Novel/Chapter 2/Twenty.md')`);
	await p.sleep(500);
	const CORK = [...CHAPTERS.slice(0, 14), 'Chapter 2/Nineteen', 'Chapter 2/Twenty', ...CHAPTERS.slice(14, 21)];
	t.eq(j(await list(p, NNOTE)), j(CORK), 'both are in chapter 2, last, in their order');
	t.eq(j(await cardsIn(p)), j(['Novel/Chapter 1', 'Novel/Chapter 2', 'Novel/Chapter 3']), 'and off the binder’s board');
	t.eq(await p.ev(`document.querySelector(${j(stackSel('Novel/Chapter 2'))} + ' .binders-card-words')?.textContent.split(' · ')[0]`), '8 notes', 'the stack counts them');
	// (the keyboard is lost with the cards that left the board: the BUG: qa7 test below. A writer would click the board.)
	const again = await p.at(stackSel('Novel/Chapter 3'));
	await p.click(again.x, again.t + 12);
	await p.key('z', 'ctrl');
	await until(p, `app.vault.adapter.exists('Novel/Twenty.md')`);
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'Ctrl+Z puts both back, files and order');
	t.eq(j((await cardsIn(p)).slice(3)), j(['Novel/Nineteen.md', 'Novel/Twenty.md']), 'and their cards are on the board again');
	t.ok(/Undid: move 2 items/.test(await notices(p)), 'and says what it undid');
	await p.key('z', 'ctrl', 'shift');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 2/Twenty.md')`);
	t.eq(j(await list(p, NNOTE)), j(CORK), 'Ctrl+Shift+Z makes the move again');
	await p.key('z', 'ctrl');
	await until(p, `app.vault.adapter.exists('Novel/Twenty.md')`);
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'and Ctrl+Z takes it back again');
	// inside a chapter: Two and Three dragged to its end
	await into(p, 'Novel/Chapter 1');
	const two = await p.at(c('Chapter 1/Two')), three = await p.at(c('Chapter 1/Three'));
	await p.click(two.x, two.t + 12);
	await p.click(three.x, three.t + 12, { modifiers: 2 });
	const six = await p.at(c('Chapter 1/Six'));
	await drag(p, { x: two.x, y: two.t + 12 }, { x: six.l + six.w - 8, y: six.y });
	await p.sleep(500);
	const INSIDE = ['Chapter 1/', 'Chapter 1/One', 'Chapter 1/Four', 'Chapter 1/Five', 'Chapter 1/Six', 'Chapter 1/Two', 'Chapter 1/Three', ...CHAPTERS.slice(7)];
	t.eq(j(await list(p, NNOTE)), j(INSIDE), 'inside chapter 1, two cards dragged past Six end the chapter, in their order');
	t.eq(j(await selCards(p)), j(['Novel/Chapter 1/Two.md', 'Novel/Chapter 1/Three.md']), 'still selected');
	t.ok(await inView(p), 'with the focus on one of them: ' + await focus(p));
	await p.key('z', 'ctrl');
	await until(p, `${B}.undoable('Novel') == null`);
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'and Ctrl+Z puts them back');
	await upTo(p);
	await unchanged('after the corkboard');
	await clearNotices(p);

	// outliner: onto a folder, then two rows below everything, then Alt+arrows
	await mode(p, h, 'outliner');
	const nt = await oname(p, N + 'Nineteen.md'), ch3 = await p.at(orow('Novel/Chapter 3'));
	await drag(p, nt, { x: nt.x, y: ch3.y });
	await until(p, `app.vault.adapter.exists('Novel/Chapter 3/Nineteen.md')`);
	await p.sleep(400);
	t.eq(moved(await list(p, NNOTE)), '21:Chapter 3/Nineteen', 'a row dropped onto a folder goes to its end');
	t.eq(j(await selRows(p)), j(['Novel/Chapter 3/Nineteen.md']), 'and is selected there');
	const seven = await oname(p, N + 'Chapter 2/Seven.md'), eightRow = await oname(p, N + 'Chapter 2/Eight.md');
	await p.click(seven.x, seven.y);
	await p.click(eightRow.x, eightRow.y, { modifiers: 8 });
	const twenty = await p.at(orow(N + 'Twenty.md'));
	await drag(p, seven, { x: seven.x, y: twenty.t + twenty.h - 3 });
	await until(p, `app.vault.adapter.exists('Novel/Eight.md')`);
	await p.sleep(400);
	t.eq(j((await list(p, NNOTE)).slice(-3)), j(['Twenty', 'Seven', 'Eight']), 'two rows dropped below the last one end the binder, in their order');
	t.eq(j(await selRows(p)), j(['Novel/Seven.md', 'Novel/Eight.md']), 'both selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'Novel/Seven.md', 'the focus on the first');
	await p.key('ArrowUp', 'alt');
	await p.sleep(400);
	t.eq(j((await list(p, NNOTE)).slice(-3)), j(['Seven', 'Eight', 'Twenty']), 'Alt+Up moves both up one');
	await p.key('ArrowRight', 'alt');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 3/Eight.md')`);
	await p.sleep(400);
	t.eq(j((await list(p, NNOTE)).slice(-4)), j(['Chapter 3/Nineteen', 'Chapter 3/Seven', 'Chapter 3/Eight', 'Twenty']), 'Alt+Right puts both in the folder above, last');
	t.eq(j(await selRows(p)), j(['Novel/Chapter 3/Seven.md', 'Novel/Chapter 3/Eight.md']), 'still selected, by their new paths');
	await p.key('ArrowLeft', 'alt');
	await until(p, `app.vault.adapter.exists('Novel/Eight.md')`);
	await p.sleep(400);
	t.eq(j((await list(p, NNOTE)).slice(-3)), j(['Seven', 'Eight', 'Twenty']), 'Alt+Left takes both out again, to just after the folder');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), 'Novel/Seven.md', 'the focus still on the row the keys were pressed on');
	// the command, five times: everything the outliner did is taken back
	for (let i = 0; i < 5; i++) { await h.run('undo-move'); await p.sleep(600); }
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), '“Undo last move”, five times: the order it started with');
	t.eq(await p.ev(`${B}.undoable('Novel')`), null, 'and nothing left to undo');
	t.eq(j(await selRows(p)), j(['Novel/Chapter 2/Seven.md', 'Novel/Chapter 2/Eight.md']), 'the rows that went back are still the selection');
	t.ok(await inView(p), 'and the outliner still has the keyboard: ' + await focus(p));
	await unchanged('after the outliner');
	await clearNotices(p);

	// the file explorer: one note above another in another folder; then two at once
	await explorerRows(p, 'Novel');
	let from = await exRow(p, N + 'Twenty.md'), to = await exRow(p, N + 'Chapter 2/Nine.md');
	t.eq(await exDrag(p, from, { x: to.x, y: to.t + 3 }), 'Move before “Nine”', 'the explorer says where a drop will go');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 2/Twenty.md')`);
	t.eq(j((await list(p, NNOTE)).slice(7, 12)), j(['Chapter 2/', 'Chapter 2/Seven', 'Chapter 2/Eight', 'Chapter 2/Twenty', 'Chapter 2/Nine']), 'Twenty is in chapter 2, before Nine');
	const th = await exRow(p, N + 'Chapter 3/Thirteen.md'), fi = await exRow(p, N + 'Chapter 3/Fifteen.md');
	await p.click(th.x, th.y, { modifiers: 1 });
	await p.click(fi.x, fi.y, { modifiers: 1 });
	to = await exRow(p, N + 'Chapter 1/One.md');
	t.eq(await exDrag(p, fi, { x: to.x, y: to.t + 3 }), 'Move before “One”', 'two notes dragged together');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 1/Fifteen.md')`);
	t.eq(j((await list(p, NNOTE)).slice(0, 4)), j(['Chapter 1/', 'Chapter 1/Thirteen', 'Chapter 1/Fifteen', 'Chapter 1/One']), 'both arrive before One, in the order they showed in');
	t.eq(j((await explorerRows(p, 'Novel')).slice(0, 4)), j(['Novel/Chapter 1', 'Novel/Chapter 1/Thirteen.md', 'Novel/Chapter 1/Fifteen.md', 'Novel/Chapter 1/One.md']), 'and the explorer shows them there');
	await h.run('undo-move');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 3/Fifteen.md')`);
	await h.run('undo-move');
	await until(p, `app.vault.adapter.exists('Novel/Twenty.md')`);
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'the command takes back the explorer’s drags too');
	await unchanged('after the explorer');
	await clearNotices(p);

	// a sort, kept as the binder's order, and undone
	await p.ev(`(async () => { const st = ['Done', 'Draft', 'Idea', 'Revised']; let i = 0; for (const f of ${B}.scenes(app.vault.getAbstractFileByPath('Novel'))) await app.fileManager.processFrontMatter(f, fm => { fm.status = st[i++ % 4]; }); })().then(() => 1)`);
	await p.sleep(500);
	await intoView(p);
	const head = await p.at(`${AL} .binders-outliner-th[data-col="status"]`);
	await p.click(head.x, head.y);
	await p.sleep(400);
	const SORTED = ['Nineteen', 'Twenty', 'Chapter 1/', 'Chapter 1/Three', 'Chapter 1/Two', 'Chapter 1/Six', 'Chapter 1/Four', 'Chapter 1/One', 'Chapter 1/Five', 'Chapter 2/', 'Chapter 2/Seven', 'Chapter 2/Eleven', 'Chapter 2/Ten', 'Chapter 2/Eight', 'Chapter 2/Twelve', 'Chapter 2/Nine', 'Chapter 3/', 'Chapter 3/Fifteen', 'Chapter 3/Fourteen', 'Chapter 3/Eighteen', 'Chapter 3/Sixteen', 'Chapter 3/Thirteen', 'Chapter 3/Seventeen'];
	t.eq(j((await rowsIn(p)).map((x) => x.slice(N.length).replace(/\.md$/, '') + (/\.md$/.test(x) ? '' : '/'))), j(SORTED), 'a click on Status sorts each folder’s rows by it, in the order settings list the statuses');
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'which changes nothing on disk');
	const row = await oname(p, N + 'Nineteen.md');
	await drag(p, row, { x: row.x, y: (await p.at(orow('Novel/Chapter 3'))).y });
	t.ok(/The outliner is sorted by status\. Choose “Binder order” in a column’s menu to rearrange it\./.test(await notices(p)), 'a drag while sorted says why it can’t be');
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'and moves nothing');
	await p.right(head.x, head.y);
	t.eq(j(await menuItems(p)), j(['Sort ascending', 'Sort descending', 'Binder order', 'Make this the binder order', 'Move left', 'Move right', 'Hide column']), 'the header’s menu');
	await clickMenu(p, 'Make this the binder order');
	await until(p, `${VIEW}.getState().options.outliner.sort == null`, 8000);
	t.eq(j(await list(p, NNOTE)), j(SORTED), 'the sorted order is the binder’s now');
	t.ok(await inView(p), 'the keyboard is still in the outliner: ' + await focus(p));
	await p.key('z', 'ctrl');
	await until(p, `${B}.undoable('Novel') == null`, 8000);
	t.eq(j(await list(p, NNOTE)), j(CHAPTERS), 'Ctrl+Z takes the whole sort back');
	t.ok(/Undid: sort by status/.test(await notices(p)), 'and says so');
	await agree(p, h, t, 'Novel', 'after all that');
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

// ================================================================================================================
// 2. A day of writing
// ================================================================================================================

test('2a. a day of writing: typing in the manuscript with Enter, Backspace and undo; the arrows, Page Down, Mod+End and Mod+Home across sections; a split at the cursor and one named by the selection; a scene renamed from its title; two scenes merged right after typing in one; every count agreeing with the disk', async (p, h, t) => {
	const before = await texts(p), body = (path) => split(before[L + path]).body, front = (path) => before[L + path].slice(0, before[L + path].length - body(path).length);
	await openView(p);
	await mode(p, h, 'manuscript');
	t.eq(await caretScene(p), 'Prologue', 'the manuscript opens with the cursor in its first section');
	await clickEnd(p, 'Prologue');
	await p.key('Enter');
	await p.type('The keeper had seen it coming.');
	await p.sleep(700);
	await p.key('Enter'); await p.key('Enter');
	await p.sleep(700);
	await p.type('He said nothing, because nobody had asked himm');
	await p.sleep(700);
	await p.key('Backspace');
	await p.type('.');
	await p.sleep(700);
	await p.type(' Oops');
	await p.key('z', 'ctrl');
	await p.sleep(200);
	const PROLOGUE = body('Prologue.md') + 'The keeper had seen it coming.\n\nHe said nothing, because nobody had asked him.\n';
	t.eq(split(await editorText(p)).body, PROLOGUE, 'what was typed, with its new lines, the Backspace taken, and the last words undone');
	// the arrows go on into the next section, and back
	await p.key('ArrowDown'); await p.key('ArrowDown');
	await p.sleep(400);
	t.eq(await caretScene(p), 'Arrival', 'Down from the last line goes on into the next section');
	await p.key('ArrowUp');
	await p.sleep(400);
	t.eq(await caretScene(p), 'Prologue', 'Up from its first line goes back');
	await p.key('ArrowDown');
	await p.sleep(400);
	await p.type('At last. ');
	await p.key('PageDown');
	await p.sleep(500);
	t.ok(!['Prologue', 'Arrival', null].includes(await caretScene(p)), 'Page Down takes the cursor a screen on, into a later section: ' + await caretScene(p));
	await p.key('End', 'ctrl');
	await p.sleep(500);
	t.eq(await caretScene(p), 'Epilogue', 'Mod+End goes to the end of the manuscript');
	await p.type('And a tea room.');
	await p.key('Home', 'ctrl');
	await p.sleep(500);
	t.eq(await caretScene(p), 'Prologue', 'Mod+Home goes back to its start');
	await p.sleep(SAVED);
	let now = await texts(p);
	t.eq(now[L + 'Prologue.md'], front('Prologue.md') + PROLOGUE, 'Prologue on disk: its properties as they were, then the text as typed');
	t.eq(now[L + 'Part One/Arrival.md'], front('Part One/Arrival.md') + 'At last. ' + body('Part One/Arrival.md'), 'Arrival: what was typed at its start');
	t.eq(now[L + 'Epilogue.md'], front('Epilogue.md') + body('Epilogue.md') + 'And a tea room.', 'Epilogue: what was typed at its end');
	same(t, before, now, { skip: [L + 'Prologue.md', L + 'Part One/Arrival.md', L + 'Epilogue.md'] });

	// split at the cursor
	await clickEnd(p, 'The keeper');
	await p.key('Enter'); await p.key('Enter');
	await p.type('She waited in the rain.');
	await p.key('Home');
	await h.run('split-scene');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`);
	await p.sleep(600);
	t.eq(j(await sectionsIn(p)), j(['Prologue', 'Arrival', 'The keeper', 'The keeper 2', 'Storm warning', 'The wreck', 'Lights out', 'Epilogue']), 'the new section comes right after');
	t.eq(await caretScene(p), 'The keeper', 'the cursor stays in the first half');
	// a split named by the selected words
	await clickEnd(p, 'Storm warning');
	await p.key('Enter'); await p.key('Enter');
	await p.type('The radio room was cold.');
	await p.key('Home');
	for (let i = 0; i < 3; i++) await p.key('ArrowRight', 'ctrl', 'shift');
	t.eq((await p.ev(`app.workspace.activeEditor?.editor?.getSelection()`)).trim(), 'The radio room', 'three words selected');
	await h.run('split-scene-titled');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The radio room.md')})`);
	await p.sleep(SAVED);
	now = await texts(p);
	t.eq(now[L + 'Part One/The keeper.md'], before[L + 'Part One/The keeper.md'], 'The keeper is what it was before the new text was typed and split off');
	t.eq(now[L + 'Part One/The keeper 2.md'], '---\nstatus: draft\nplotlines:\n  - Mara\n  - The keeper\'s secret\n---\nShe waited in the rain.\n', 'the second half: the same properties but the synopsis, and the text');
	t.eq(now[L + 'Part One/Storm warning.md'], before[L + 'Part One/Storm warning.md'], 'Storm warning likewise');
	t.eq(now[L + 'Part One/The radio room.md'], '---\nstatus: idea\nplotlines:\n  - Mara\n---\nThe radio room was cold.\n', 'the note named by the selection begins with it');
	// a scene renamed from its title
	await p.ev(`(${scene('The keeper 2')}).scrollIntoView({ block: 'center' })`);
	await p.sleep(400);
	const ti = await titleAt(p, 'The keeper 2');
	await p.click(ti.x, ti.y);
	t.ok(await p.ev(`document.activeElement.matches('.binders-manuscript-title.is-renaming')`), 'a click on a title edits it');
	await p.type('At the door');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/At the door.md')})`);
	await p.sleep(400);
	t.eq(await caretScene(p), 'At the door', 'Enter renames it, and the cursor goes to its text');
	t.eq(j(await list(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/At the door', 'Part One/Storm warning', 'Part One/The radio room', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the list: both new notes after the notes they were split from, the renamed one in its place');

	// typing, and at once a merge on the corkboard: the words just typed are in the merged note
	await clickEnd(p, 'The wreck');
	await p.type(' It took an hour to sink.');
	await mode(p, h, 'corkboard');
	t.ok(await inView(p), 'the corkboard has the keyboard: ' + await focus(p));
	await into(p, L + 'Part Two');
	const a = await p.at(card(L + 'Part Two/The wreck.md')), b = await p.at(card(L + 'Part Two/Lights out.md'));
	await p.click(a.x, a.t + 12);
	await p.click(b.x, b.t + 12, { modifiers: 2 });
	await p.right(b.x, b.y);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/Their text is joined into “The wreck” in this order.*“Lights out” goes to the vault’s trash/.test(await modal(p)), 'the merge says what it will do: ' + await modal(p));
	await press(p, 'Merge');
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part Two/Lights out.md')})`);
	await p.sleep(500);
	const merged = await read(p, L + 'Part Two/The wreck.md');
	t.eq(split(merged).body, body('Part Two/The wreck.md').trimEnd() + ' It took an hour to sink.\n\n' + body('Part Two/Lights out.md'), 'the merged text: the first note with the words just typed, a blank line, the second');
	t.eq((await fm(p, L + 'Part Two/The wreck.md')).synopsis, 'A ship founders on the rocks below the light.\n\nMara climbs the tower and finds out why.', 'the synopses joined the same way');
	t.eq(await p.ev(`app.vault.adapter.read('.trash/Lights out.md')`), before[L + 'Part Two/Lights out.md'], 'the merged-away note is in the trash, whole');
	t.eq(j(await selCards(p)), j([L + 'Part Two/The wreck.md']), 'the merged note is selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part Two/The wreck.md', 'and has the focus');
	await shot(p, '2a-merged');
	await upTo(p);
	t.eq(await p.ev(`document.querySelector(${j(stackSel(L + 'Part Two'))} + ' .binders-card-words')?.textContent.split(' · ')[0]`), '1 note', 'back on the binder’s board, the folder’s stack counts the one note left');
	await countsAgree(p, h, t, 'The Lighthouse', 'after a day’s writing');
	await agree(p, h, t, 'The Lighthouse', 'after a day’s writing');
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

test('2b. more of the day: a scene duplicated, deleted (asked first) and put back from the trash by hand; “Set synopsis from text” on everything, which fills only the notes without one; a filter by Draft, with counts that say “of”, and writing in the manuscript under it', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await into(p, L + 'Part One');
	const k = await p.at(card(L + 'Part One/The keeper.md'));
	await p.right(k.x, k.y);
	await clickMenu(p, 'Duplicate');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`);
	await until(p, `document.querySelector('${AL} .binders-card.is-selected')?.dataset.path === ${j(L + 'Part One/The keeper 2.md')}`);
	t.eq(await read(p, L + 'Part One/The keeper 2.md'), before[L + 'Part One/The keeper.md'], 'the copy is the note, byte for byte');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One/The keeper 2.md', 'selected, with the focus');
	const WITH = [...LIST.slice(0, 4), 'Part One/The keeper 2', ...LIST.slice(4)];
	t.eq(j(await list(p)), j(WITH), 'right after the original');
	// Delete, Enter: gone to the trash; put back by hand, it's where it was
	await p.key('Delete');
	await until(p, `!!document.querySelector('.modal')`);
	t.eq(await modal(p), 'Delete noteDelete “The keeper 2”? It goes to the vault’s trash.DeleteCancel', 'Delete asks, naming the note and where it goes');
	await p.key('Enter');
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper 2.md')})`);
	await p.sleep(500);
	t.eq(j(await list(p)), j(LIST), 'it’s out of the list');
	t.eq(j(await selCards(p)), j([L + 'Part One/Storm warning.md']), 'the next card is selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One/Storm warning.md', 'and has the focus');
	await p.ev(`app.vault.adapter.rename('.trash/The keeper 2.md', ${j(L + 'Part One/The keeper 2.md')}).then(() => 1)`);
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper 2.md')})`, 8000);
	await p.sleep(800);
	t.eq(j(await list(p)), j(WITH), 'moved back from the trash by hand, it’s after the note it’s named for again');
	t.eq(await read(p, L + 'Part One/The keeper 2.md'), before[L + 'Part One/The keeper.md'], 'with all its text');
	t.eq(j((await cardsIn(p)).map((x) => x.slice(L.length))), j(['Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/The keeper 2.md', 'Part One/Storm warning.md']), 'and its card is back');
	await upTo(p);
	t.eq(j((await cardsIn(p)).map((x) => x.slice(L.length))), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'the binder’s own board: its two loose notes and a stack for each folder');
	t.eq(await p.ev(`document.querySelector(${j(stackSel(L + 'Part One'))} + ' .binders-card-words')?.textContent.split(' · ')[0]`), '4 notes', 'Part One’s counting four');

	// "Set synopsis from text" on everything: only the three without a synopsis get one
	await p.ev(`(async () => { for (const n of ['Prologue.md', 'Epilogue.md', 'Part Two/The wreck.md']) await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L)} + n), fm => { delete fm.synopsis; }); })().then(() => 1)`);
	await p.sleep(500);
	const mid = await texts(p);
	await intoView(p);
	// (a board at a time: the binder's own two notes, then Part Two's)
	const pr = await p.at(card(L + 'Prologue.md'));
	await p.click(pr.x, pr.t + 12);
	await p.click((await p.at(card(L + 'Epilogue.md'))).x, (await p.at(card(L + 'Epilogue.md'))).t + 12, { modifiers: 2 });
	t.eq((await selCards(p)).length, 2, 'Ctrl-click selects the binder’s two loose notes');
	await p.key('F10', 'shift');
	await p.sleep(200);
	await clickMenu(p, 'Set synopsis from text');
	await until(p, `['Prologue.md', 'Epilogue.md'].every(n => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L)} + n))?.frontmatter?.synopsis)`);
	await into(p, L + 'Part Two');
	const wr = await p.at(card(L + 'Part Two/The wreck.md'));
	await p.click(wr.x, wr.t + 12);
	await p.key('a', 'ctrl');
	t.eq((await selCards(p)).length, 2, 'Ctrl+A selects every card of the folder shown');
	await p.key('F10', 'shift');
	await p.sleep(200);
	await clickMenu(p, 'Set synopsis from text');
	await until(p, `['Prologue.md', 'Epilogue.md', 'Part Two/The wreck.md'].every(n => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L)} + n))?.frontmatter?.synopsis)`);
	await p.sleep(300);
	for (const n of ['Prologue.md', 'Epilogue.md', 'Part Two/The wreck.md']) {
		t.eq((await fm(p, L + n)).synopsis, split(before[L + n]).body.trim(), `“${n}” has its opening lines as its synopsis`);
		t.eq(split(await read(p, L + n)).body, split(before[L + n]).body, 'and its text is untouched');
	}
	same(t, mid, await texts(p), { skip: ['Prologue.md', 'Epilogue.md', 'Part Two/The wreck.md'].map((n) => L + n) });
	t.eq((await selCards(p)).length, 2, 'the cards stay selected');
	t.ok(await inView(p), 'the keyboard is on the board: ' + await focus(p));
	await upTo(p);

	// a filter: only the drafts, in every mode, with every count saying so
	const DRAFTS = ['Prologue.md', 'Part One/The keeper.md', 'Part One/The keeper 2.md', 'Part Two/The wreck.md'].map((n) => L + n);
	let f = await toolbar(p, 'binders-filter-button');
	await p.click(f.x, f.y);
	t.eq(j(await menuItems(p)), j(['Status', 'Idea', 'Draft', 'Revised']), 'the filter offers the statuses the notes have');
	await clickMenu(p, 'Draft');
	await p.sleep(300);
	t.ok((await menuItems(p)).includes('Clear filter'), 'the menu stays open for another pick, and can clear the filter');
	await closeMenus(p);
	t.eq(j(await cardsIn(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two']), 'of the binder’s own notes only the draft shows, beside the folders’ stacks');
	await into(p, L + 'Part One');
	t.eq(j(await cardsIn(p)), j(DRAFTS.slice(1, 3)), 'inside a folder, only its drafts show');
	await upTo(p);
	t.eq(await p.ev(`document.querySelector('${AL} .binders-filter-button .text-button-label').textContent`), 'Filter (1)', 'the button says a filter is on');
	await shot(p, '2b-filter');
	// write under the filter, in the manuscript
	await mode(p, h, 'manuscript');
	t.eq(j(await sectionsIn(p)), j(['Prologue', 'The keeper', 'The keeper 2', 'The wreck']), 'the manuscript is the drafts only');
	await clickEnd(p, 'The keeper');
	await p.type(' She waited some more.');
	await p.sleep(600);
	const typed = await diskWords(p, 'The Lighthouse'), all = Object.entries(typed).filter(([k2]) => k2 !== NOTE), total = all.reduce((a2, [, n]) => a2 + n, 0) + 4, shown = DRAFTS.reduce((a2, x) => a2 + typed[x], 0) + 4;
	t.eq(await toolbarCount(p), `${shown} of ${total} words`, 'the count follows the typing before it’s saved, and says how much of the whole passes the filter');
	await p.sleep(SAVED);
	t.eq(split(await read(p, L + 'Part One/The keeper.md')).body, split(before[L + 'Part One/The keeper.md']).body.trimEnd() + ' She waited some more.\n', 'what was typed under the filter is in its note');
	// every other count with the filter on (the toolbar's, right after a change of mode, is the BUG test below)
	await countsAgree(p, h, t, 'The Lighthouse', 'with the filter on', DRAFTS, false);
	f = await toolbar(p, 'binders-filter-button');
	await p.click(f.x, f.y);
	await clickMenu(p, 'Clear filter');
	await p.sleep(400);
	await countsAgree(p, h, t, 'The Lighthouse', 'with the filter off');
	await agree(p, h, t, 'The Lighthouse', 'at the end');
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

test('2c. places: each mode comes back where it was left (the selected card and the board’s scroll, the outliner’s selection, the manuscript’s cursor, which carries on typing), and Back from a note or a folder returns to the same place', async (p, h, t) => {
	await chapters(p, 12);
	// (thirty more loose scenes, so the binder's own board, three stacks and these, is long enough to scroll)
	await p.ev(`(async () => { for (let i = 1; i <= 30; i++) await ${B}.newScene(app.vault.getAbstractFileByPath('Novel'), Infinity, 'Loose ' + i); await ${B}.flush(); ${B}.undos = []; ${B}.redos = []; })().then(() => 1)`);
	await p.sleep(400);
	await openView(p, 'Novel');
	const top = () => p.ev(`Math.round(document.querySelector('${AL} .binders-corkboard').scrollTop)`);
	const far = card(N + 'Loose 28.md');
	await p.ev(`document.querySelector(${j(far)}).scrollIntoView({ block: 'center' })`);
	await p.sleep(300);
	const c = await p.at(far);
	await p.click(c.x, c.t + 12);
	const corkTop = await top();
	t.ok(corkTop > 100, 'the board is scrolled down to Loose 28');
	await mode(p, h, 'manuscript');
	await clickEnd(p, 'Nine');
	await p.type(' TYPED-IN-NINE.');
	// a look at the corkboard, and back: the cursor where it was. (A scene inside a chapter has no card on the binder's
	// own board, so the board just keeps the keyboard: the UX: qa7 test. With a row or a card selected on the way, the
	// manuscript goes to that note instead, one selection across the modes: the UX tests and the BUG: qa7 test below.)
	await mode(p, h, 'corkboard');
	t.ok(await inView(p), 'back on the corkboard: it has the keyboard: ' + await focus(p));
	t.ok(Math.abs(await top() - corkTop) < 40, `and is scrolled where it was (${corkTop}, now ${await top()})`);
	await mode(p, h, 'manuscript');
	await p.sleep(500);
	t.eq(await caretScene(p), 'Nine', 'back in the manuscript: the cursor in the section it was in');
	await p.type(' AND-MORE.');
	await p.sleep(SAVED);
	t.ok((await read(p, N + 'Chapter 2/Nine.md')).endsWith('nobody came. TYPED-IN-NINE. AND-MORE.\n'), 'and typing carries on where it left off: ' + (await read(p, N + 'Chapter 2/Nine.md')).slice(-60));
	// a row selected in the outliner, a look at the corkboard, and back
	await mode(p, h, 'outliner');
	const el = await oname(p, N + 'Chapter 2/Eleven.md');
	await p.click(el.x, el.y);
	await mode(p, h, 'corkboard');
	await mode(p, h, 'outliner');
	t.eq(j(await selRows(p)), j([N + 'Chapter 2/Eleven.md']), 'back in the outliner: the row that was selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), N + 'Chapter 2/Eleven.md', 'with the focus');
	// Enter opens the note; Back returns to the outliner as it was
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(N + 'Chapter 2/Eleven.md')}`);
	await p.sleep(300);
	const back = async () => { const b = await p.at('.mod-root .workspace-leaf.mod-active .view-header-nav-buttons button:first-child'); await p.click(b.x, b.y); await p.sleep(900); };
	await back();
	t.eq(await p.ev(`${VIEW}?.mode`), 'outliner', 'Back from the note: the outliner');
	t.eq(j(await selRows(p)), j([N + 'Chapter 2/Eleven.md']), 'with the same row selected');
	// into a folder from the manuscript's heading, and Back: the same part of the page
	await mode(p, h, 'manuscript');
	await p.ev(`[...document.querySelectorAll('${AL} .binders-manuscript-heading h1')].find(x => x.textContent === 'Chapter 2').scrollIntoView({ block: 'center' })`);
	await p.sleep(600);
	const topScene = () => p.ev(`(() => { const root = document.querySelector('${AL} .binders-manuscript'), y = root.getBoundingClientRect().top; return [...root.querySelectorAll('.binders-manuscript-scene')].find(x => x.getBoundingClientRect().bottom > y + 1)?.querySelector('.binders-manuscript-title').textContent; })()`);
	const was = await topScene();
	const hd = await p.ev(`(() => { const b = [...document.querySelectorAll('${AL} .binders-manuscript-heading h1')].find(x => x.textContent === 'Chapter 2').getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; })()`);
	await p.click(hd.x, hd.y);
	await until(p, `${VIEW}?.folder?.path === 'Novel/Chapter 2'`);
	await p.sleep(500);
	t.eq(j(await sectionsIn(p)), j(NAMES.slice(6, 12)), 'a folder’s heading opens the folder: its six scenes');
	t.eq(await p.ev(`document.querySelector('${AL} .binders-breadcrumbs').textContent`), 'NovelChapter 2', 'the breadcrumb says where');
	await back();
	t.eq(await p.ev(`${VIEW}?.folder?.path`), 'Novel', 'Back: the whole binder again');
	t.eq(await topScene(), was, 'at the same part of the page');
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

// ================================================================================================================
// 3. Finishing
// ================================================================================================================

test('3. finishing: every scene marked Done at once; two left out of the compile (a card’s menu, the outliner’s Compile column); compiled with each separator, with and without headings; again after an edit (replaced), again after the compiled note was written in (asked first); copied; one chapter compiled from its folder’s menu', async (p, h, t) => {
	const before = await texts(p), body = (path) => split(before[L + path]).body.trim();
	const OUT = 'The Lighthouse (compiled).md';
	await openView(p);
	await mode(p, h, 'outliner');
	// every note (not the folders: see the BUG test on a selection with folders in it)
	const NOTES = ['Prologue.md', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md'];
	for (const [i, n] of NOTES.entries()) { const r = await oname(p, L + n); await p.click(r.x, r.y, i ? { modifiers: 2 } : {}); }
	t.eq((await selRows(p)).length, 7, 'seven notes selected');
	let cell = await p.at(orow(L + 'Epilogue.md') + ' [data-col="status"]');
	await p.click(cell.x, cell.y);
	await clickMenu(p, 'Done');
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('The Lighthouse')).every(f => app.metadataCache.getFileCache(f)?.frontmatter?.status === 'Done')`);
	await p.sleep(300);
	const done = Object.fromEntries(Object.entries(before).map(([k, v]) => [k, NOTES.some((n) => L + n === k) ? v.replace(/^status: .*$/m, 'status: Done') : v]));
	same(t, done, await texts(p));
	t.ok(!(await exists(p, L + 'Part One/Part One.md')), 'no folder got a note it wasn’t asked for');
	// two left out: the Compile column's tick, and a card's menu
	const plus = await p.at(`${AL} .binders-outliner-th.mod-add`);
	await p.click(plus.x, plus.y);
	await clickMenu(p, 'Compile');
	await p.sleep(300);
	const box = await p.at(orow(L + 'Part One/Storm warning.md') + ' [data-col="compile"] input');
	await p.click(box.x, box.y);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Storm warning.md')}))?.frontmatter?.compile === false`);
	await mode(p, h, 'corkboard');
	await into(p, L + 'Part One');
	const k = await p.at(card(L + 'Part One/The keeper.md'));
	await p.right(k.x, k.y);
	t.ok(await p.ev(`!![...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'Include in compile')?.querySelector('.mod-checked, .mod-selected, .menu-item-icon.mod-selected')`), '“Include in compile” is ticked on a note that’s in');
	await clickMenu(p, 'Include in compile');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')}))?.frontmatter?.compile === false`);
	await upTo(p);
	for (const n of ['Part One/The keeper.md', 'Part One/Storm warning.md']) t.eq(await read(p, L + n), done[L + n].replace(/\n---\n/, '\ncompile: false\n---\n'), `“${n}”: one more property, nothing else changed`);

	// the dialog, worked by hand
	const setting = (name) => `[...document.querySelectorAll('.modal .setting-item')].find(s => s.querySelector('.setting-item-name')?.textContent === ${j(name)})`;
	const toggle = async (name, on) => { const r = await p.ev(`(() => { const tg = (${setting(name)}).querySelector('.checkbox-container'), b = tg.getBoundingClientRect(); return { is: tg.classList.contains('is-enabled'), x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`); if (r.is !== on) await p.click(r.x, r.y); };
	const compile = async (o = {}) => {
		await intoView(p);
		await h.run('compile');
		await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
		for (const [name, on] of Object.entries(o.toggles ?? {})) await toggle(name, on);
		if (o.sep !== undefined) await p.ev(`(() => { const s = (${setting('Between notes')}).querySelector('select'); s.value = ${j(o.sep)}; s.dispatchEvent(new Event('change')); return 1; })()`);
		await press(p, o.copy ? 'Copy' : 'Compile');
		await p.sleep(800);
	};
	const P = body('Prologue.md'), A = body('Part One/Arrival.md'), W = body('Part Two/The wreck.md'), LO = body('Part Two/Lights out.md'), E = body('Epilogue.md');
	const text = (parts) => parts.filter((x) => x !== '').join('\n\n') + '\n';
	await intoView(p);
	await h.run('compile');
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	t.eq(await p.ev(`document.querySelector('.modal .modal-title').textContent`), 'Compile “The Lighthouse”', 'the dialog names the binder');
	t.eq(await p.ev(`document.querySelector('.modal p').textContent`), '5 notes, in binder order, become one note: their text only, without properties. 2 are left out (“Include in compile” is off). Your notes aren’t changed.', 'and says what goes in and what’s left out');
	t.eq(await p.ev(`document.querySelector('.modal .binders-compile-path').value`), OUT, 'saved beside the binder');
	await shot(p, '3-compile');
	await p.key('Escape');
	await until(p, `!document.querySelector('.modal')`);
	for (const sep of ['* * *', '#', '---', '']) {
		await compile({ sep, toggles: { 'Title': true, 'Folders as headings': true, 'Note titles as headings': false } });
		t.eq(await read(p, OUT), text(['# The Lighthouse', P, '## Part One', A, '## Part Two', W, sep, LO, sep, E]), `with “${sep || 'a blank line'}” between notes: the title, folders as headings, the five notes in order`);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), OUT, 'the compiled note is in front');
		t.eq(await tabs(p), 2, 'in one tab of its own, however often it’s compiled');
	}
	await compile({ sep: '* * *', toggles: { 'Title': false, 'Folders as headings': false, 'Note titles as headings': false } });
	t.eq(await read(p, OUT), text([P, '* * *', A, '* * *', W, '* * *', LO, '* * *', E]), 'without any headings: the text alone, a separator between every two notes');
	await compile({ toggles: { 'Title': true, 'Folders as headings': true, 'Note titles as headings': true } });
	const HEADED = text(['# The Lighthouse', '## Prologue', P, '## Part One', '### Arrival', A, '## Part Two', '### The wreck', W, '### Lights out', LO, '## Epilogue', E]);
	t.eq(await read(p, OUT), HEADED, 'with note titles as headings: each under its folder’s');
	// after an edit to a scene: replaced without a question
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')}), s => s + 'A new last line.\\n').then(() => 1)`);
	await p.sleep(400);
	await compile();
	t.eq(await modal(p), null, 'compiling again after an edit to a scene asks nothing');
	t.eq(await read(p, OUT), HEADED.replace(E + '\n', E + '\nA new last line.\n'), 'and the compiled note has the edit');
	// after the compiled note itself was written in: asked first
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${j(OUT)}), s => s + '\\nMy own notes on the draft.\\n').then(() => 1)`);
	await p.sleep(400);
	await compile();
	t.eq(await modal(p), 'Replace this note“The Lighthouse (compiled)” has been changed since it was compiled. Replace its text with the compiled binder?ReplaceCancel', 'a compiled note that’s been written in is asked about');
	await press(p, 'Cancel');
	t.ok((await read(p, OUT)).endsWith('My own notes on the draft.\n'), 'Cancel keeps what was written');
	t.ok(await p.ev(`!!document.querySelector('.modal .binders-compile-path')`), 'and the compile dialog is still there');
	await press(p, 'Compile');
	await p.sleep(600);
	await press(p, 'Replace');
	await p.sleep(800);
	t.ok(!(await read(p, OUT)).includes('My own notes'), 'Replace compiles over it');
	t.eq(await modal(p), null, 'and the dialogs are gone');
	// copy
	await clearNotices(p);
	await compile({ copy: true });
	t.ok(/Copied 5 notes as one text\./.test(await notices(p)), 'Copy says what it copied');
	t.eq(await p.ev(`navigator.clipboard.readText().catch(() => null)`), await read(p, OUT), 'the clipboard has the compiled text');
	// one chapter, from its folder's menu in the explorer
	await explorerRows(p, 'The Lighthouse');
	const r = await exRow(p, L + 'Part Two');
	await p.right(r.x, r.y);
	await clickMenu(p, 'Compile...');
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	t.eq(await p.ev(`document.querySelector('.modal .modal-title').textContent`), 'Compile “Part Two”', 'a folder’s “Compile...” compiles that folder');
	await press(p, 'Compile');
	await until(p, `app.vault.adapter.exists('Part Two (compiled).md')`);
	t.eq(await read(p, 'Part Two (compiled).md'), text(['# Part Two', '## The wreck', W, '## Lights out', LO]), 'the chapter alone, beside the binder');
	t.eq(await p.ev(`${B}.binderOf('Part Two (compiled).md')`), null, 'neither compiled note is in the binder');
	t.eq(j(await list(p)), j(LIST), 'whose order is as it was');
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

// ================================================================================================================
// 4. Living with Obsidian
// ================================================================================================================

/** Something in the nth binder view open (0: the first), whichever pane is active. */
const inLeaf = (p, i, js) => p.ev(`(() => { const l = app.workspace.getLeavesOfType('binders-view')[${i}]; return (${js})(l.view.contentEl, l.view); })()`);
const leafOpen = (p, state) => p.ev(`(async () => { const leaf = app.workspace.getLeaf('split'); await leaf.setViewState({ type: 'binders-view', state: ${j(state)}, active: true }); })().then(() => 1)`).then(() => p.sleep(700));

test('4a. living with Obsidian: three binder views side by side (corkboard, outliner, manuscript) and the file explorer all follow notes renamed, moved, copied and deleted by Obsidian’s own commands, properties changed in the Properties panel, and the binder note’s list edited by hand', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await leafOpen(p, { folder: 'The Lighthouse', mode: 'outliner' });
	await leafOpen(p, { folder: 'The Lighthouse', mode: 'manuscript' });
	await p.sleep(400);
	t.eq(j(await p.ev(`app.workspace.getLeavesOfType('binders-view').map(l => l.view.mode)`)), j(['corkboard', 'outliner', 'manuscript']), 'one binder, three views of it');
	await shot(p, '4a-three-views');
	const strip = (x) => x.split('/').pop().replace('.md', '');
	const all = async (when) => {
		await p.sleep(700);
		const full = await list(p), want = full.filter((x) => !x.endsWith('/')).map(strip);
		// (the corkboard: the binder's own notes, and a stack for each folder that counts the notes in it)
		const own = full.filter((x) => (x.endsWith('/') ? x.split('/').length === 2 : !x.includes('/'))).map((x) => (x.endsWith('/') ? `${x.slice(0, -1)} (${full.filter((y) => y.startsWith(x) && !y.endsWith('/')).length})` : x));
		t.eq(j(await inLeaf(p, 0, `(el) => [...el.querySelectorAll('.binders-card[data-path]')].map(c => c.dataset.path.split('/').pop().replace('.md', '') + (c.classList.contains('is-stack') ? ' (' + parseInt(c.querySelector('.binders-card-words')?.textContent ?? '') + ')' : ''))`)), j(own), `${when}: the corkboard`);
		t.eq(j((await inLeaf(p, 1, `(el) => [...el.querySelectorAll('.binders-outliner-row')].map(c => c.dataset.path)`)).filter((x) => /\.md$/.test(x)).map(strip)), j(want), `${when}: the outliner`);
		t.eq(j(await inLeaf(p, 2, `(el) => [...el.querySelectorAll('.binders-manuscript-scene .binders-manuscript-title')].map(c => c.textContent)`)), j(want), `${when}: the manuscript`);
		t.eq(j((await explorerRows(p, 'The Lighthouse')).filter((x) => /\.md$/.test(x)).map(strip)), j(want), `${when}: the file explorer`);
		return want;
	};
	await all('at first');
	const rename = (from, to) => p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${j(from)}), ${j(to)}).then(() => 1)`);
	// renamed (as F2 in the explorer does), with its row selected in the outliner
	await inLeaf(p, 1, `(el, v) => { app.workspace.setActiveLeaf(v.leaf, { focus: true }); return 1; }`);
	const row = await oname(p, L + 'Part One/Arrival.md');
	await p.click(row.x, row.y);
	await rename(L + 'Part One/Arrival.md', L + 'Part One/Landing.md');
	t.eq(j(await all('a note renamed')), j(['Prologue', 'Landing', 'The keeper', 'Storm warning', 'The wreck', 'Lights out', 'Epilogue']), 'in its place, by its new name');
	t.eq(j(await inLeaf(p, 1, `(el) => [...el.querySelectorAll('.binders-outliner-row.is-selected')].map(c => c.dataset.path)`)), j([L + 'Part One/Landing.md']), 'the outliner’s selection follows the rename');
	// moved to another folder ("Move file to..."), out of the binder, and back in
	await rename(L + 'Part One/Landing.md', L + 'Part Two/Landing.md');
	t.eq(j(await all('moved to another folder')), j(['Prologue', 'The keeper', 'Storm warning', 'The wreck', 'Lights out', 'Landing', 'Epilogue']), 'last in the folder it went to');
	await rename(L + 'Part Two/Landing.md', 'Landing.md');
	t.eq(j(await all('moved out of the binder')), j(['Prologue', 'The keeper', 'Storm warning', 'The wreck', 'Lights out', 'Epilogue']), 'no longer in it');
	await rename('Landing.md', L + 'Part One/Arrival.md');
	t.eq(j(await list(p)), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'moved back in: last in its folder');
	await all('moved back in');
	// "Make a copy" and "Delete file", on the note open in a tab
	await p.ev(`app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')})).then(() => 1)`);
	await p.sleep(500);
	await p.ev(`(() => { app.commands.executeCommandById('file-explorer:duplicate-file'); return 1; })()`);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 1.md')})`);
	t.eq(j((await all('“Make a copy”')).slice(1, 3)), j(['The keeper', 'The keeper 1']), 'Obsidian’s copy goes right after its original');
	t.eq(await read(p, L + 'Part One/The keeper 1.md'), before[L + 'Part One/The keeper.md'], 'with the same text');
	await p.ev(`(() => { app.vault.setConfig('promptDelete', false); app.commands.executeCommandById('app:delete-file'); return 1; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper 1.md')})`);
	t.eq((await all('“Delete file”')).length, 7, 'and is gone from everywhere once deleted');
	// properties, as the Properties panel writes them
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')}), fm => { fm.status = 'Done'; fm.label = 'Green'; fm.synopsis = 'Changed in Properties.'; fm.target = 12; }).then(() => 1)`);
	await p.sleep(900);
	t.eq(j(await inLeaf(p, 0, `(el) => { const c = el.querySelector('.binders-card[data-path="The Lighthouse/Epilogue.md"]'); return [c.querySelector('.binders-card-synopsis').textContent, c.querySelector('.binders-chip')?.textContent, c.classList.contains('mod-label-green'), c.querySelector('.binders-card-words').textContent]; }`)), j(['Changed in Properties.', 'Done', true, '6 / 12 words']), 'the card shows the new synopsis, status, label and target');
	t.eq(j(await inLeaf(p, 1, `(el) => [...el.querySelector('.binders-outliner-row[data-path="The Lighthouse/Epilogue.md"]').querySelectorAll('.binders-outliner-cell[data-col]')].map(x => x.textContent)`)), j(['EpilogueChanged in Properties.', 'Green', 'Done', '6']), 'and so does its row');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.binders-explorer-label')].map(d => d.parentElement.dataset.path)`)), j([L + 'Epilogue.md']), 'and the explorer has its label’s dot');
	// the binder note's list, edited by hand: Prologue last, and a line for a note that isn't there
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${j(NOTE)}), s => s.replace('  - Prologue\\n', '').replace('  - Epilogue\\n', '  - Epilogue\\n  - Prologue\\n  - Ghost\\n')).then(() => 1)`);
	await p.sleep(900);
	const shown = ['The keeper', 'Storm warning', 'Arrival', 'The wreck', 'Lights out', 'Epilogue', 'Prologue'];
	t.eq(j(await inLeaf(p, 0, `(el) => [...el.querySelectorAll('.binders-card[data-path]')].map(c => c.dataset.path.split('/').pop().replace('.md', ''))`)), j(['Part One', 'Part Two', 'Epilogue', 'Prologue']), 'the list edited by hand: the corkboard follows (a line for a note that isn’t there shows nothing)');
	t.eq(j(await inLeaf(p, 2, `(el) => [...el.querySelectorAll('.binders-manuscript-scene .binders-manuscript-title')].map(c => c.textContent)`)), j(shown), 'and the manuscript');
	t.eq(j((await explorerRows(p, 'The Lighthouse')).filter((x) => /\.md$/.test(x)).map(strip)), j(shown), 'and the explorer');
	const now = await texts(p);
	same(t, before, now, { skip: [NOTE, L + 'Epilogue.md'] });
	t.eq(split(now[NOTE]).body, split(before[NOTE]).body, 'the binder note’s own text is untouched');
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

test('4b. the same scene in a tab beside the manuscript, typed in turn in both at a writer’s pace: every word is kept, once; a corkboard beside the manuscript counts the words as they’re saved, and a folder’s stack dragged there moves its sections in the manuscript', async (p, h, t) => {
	const before = await texts(p), A = L + 'Part One/Arrival.md', bodyA = split(before[A]).body.trimEnd();
	await openView(p);
	await mode(p, h, 'manuscript');
	await p.ev(`(async () => { const leaf = app.workspace.getLeaf('split'); await leaf.openFile(app.vault.getAbstractFileByPath(${j(A)})); })().then(() => 1)`);
	await p.sleep(800);
	const noteLine = () => p.ev(`(() => { const l = [...document.querySelectorAll('.mod-root .markdown-source-view .cm-line')].reverse().find(x => x.textContent.trim()); const b = l.getBoundingClientRect(); return { x: b.left + 30, y: b.top + 8 }; })()`);
	const msLine = () => p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === 'Arrival'); const l = [...s.querySelectorAll('.cm-line')].reverse().find(x => x.textContent.trim()); const b = l.getBoundingClientRect(); return { x: b.left + 20, y: b.top + 8 }; })()`);
	const n = await noteLine(), m = await msLine();
	await p.click(n.x, n.y); await p.key('End', 'ctrl'); await p.key('ArrowLeft');
	await typeAt(p, ' From the note.', 80);
	await p.sleep(1200);
	t.ok(await p.ev(`[...document.querySelectorAll('.binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === 'Arrival').textContent.includes('From the note.')`), 'the manuscript shows what’s typed in the note’s own tab');
	await p.click(m.x, m.y); await p.sleep(100); await p.key('Home');
	await typeAt(p, 'From the manuscript. ', 80);
	await p.sleep(1200);
	await p.click(n.x, n.y); await p.sleep(100); await p.key('End', 'ctrl'); await p.key('ArrowLeft');
	await typeAt(p, ' And the note again.', 80);
	await p.sleep(SAVED + 500);
	const want = 'From the manuscript. ' + bodyA + ' From the note. And the note again.\n';
	t.eq(split(await read(p, A)).body, want, 'on disk: everything typed in either, once, in its place');
	t.eq(split(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.getValue()`)).body, want, 'the tab shows the same');
	same(t, before, await texts(p), { skip: [A] });
	// the tab becomes a corkboard of the same binder
	await p.ev(`(async () => { const l = app.workspace.getLeavesOfType('markdown')[0]; await l.setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'corkboard' }, active: true }); })().then(() => 1)`);
	await p.sleep(800);
	const E = L + 'Epilogue.md';
	await p.ev(`[...document.querySelectorAll('.binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === 'Epilogue').scrollIntoView({ block: 'center' })`);
	await p.sleep(500);
	const e = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === 'Epilogue'); const l = [...s.querySelectorAll('.cm-line, p')].reverse().find(x => x.textContent.trim()); const b = l.getBoundingClientRect(); return { x: b.left + 20, y: b.bottom - 8 }; })()`);
	await p.click(e.x, e.y); await p.sleep(400); await p.key('End');
	await p.type(' Four more words here.');
	const cardWords = () => p.ev(`document.querySelector('.binders-card[data-path="${E}"] .binders-card-words')?.textContent`);
	await until(p, `document.querySelector('.binders-card[data-path="${E}"] .binders-card-words')?.textContent === '10 words'`, SAVED + 2000);
	t.eq(await cardWords(), '10 words', 'the card beside the manuscript counts the new words once they’re saved');
	const onDisk = await diskWords(p, 'The Lighthouse'), total = Object.entries(onDisk).filter(([path]) => path !== NOTE).reduce((sum, [, k]) => sum + k, 0);
	t.eq(j(await p.ev(`app.workspace.getLeavesOfType('binders-view').map(l => l.view.contentEl.querySelector('.binders-word-count')?.textContent)`)), j(new Array(2).fill(words(total))), 'and both toolbars say what’s on disk');
	// a card dragged in the corkboard, while the cursor is in the manuscript's text
	const cs = (path) => `.binders-card[data-path="${path}"]`;
	// (the binder's own board: Part Two's stack, to before Part One's)
	const a = await p.at(cs(L + 'Part Two')), b = await p.at(cs(L + 'Part One'));
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 8, y: b.y });
	await p.sleep(500);
	t.eq(j((await list(p)).filter((x) => !x.includes('/') || x.endsWith('/'))), j(['Prologue', 'Part Two/', 'Part One/', 'Epilogue']), 'Part Two’s stack dragged before Part One’s, on the corkboard');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.binders-manuscript-scene .binders-manuscript-title')].map(e => e.textContent)`)), j(['Prologue', 'The wreck', 'Lights out', 'Arrival', 'The keeper', 'Storm warning', 'Epilogue']), 'the manuscript beside it follows: the folder’s sections move with it');
	t.eq(split(await read(p, E)).body, split(before[E]).body.trimEnd() + ' Four more words here.\n', 'and the scene being written has all its words');
	same(t, before, await texts(p), { skip: [A, E, NOTE] });
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

test('4c. a reload in the middle of it all: the view comes back in its mode, with its filter, its sort, its folded folders and its column widths; the quick switcher and the graph take its tab and Back brings it back as it was; “Open binder” goes to a scene’s folder', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'outliner');
	const grip = await p.at(`${AL} .binders-outliner-th[data-col="status"] .binders-outliner-resizer`);
	await drag(p, grip, { x: grip.x + 60, y: grip.y });
	const chev = await p.at(orow(L + 'Part Two') + ' .binders-outliner-chevron');
	await p.click(chev.x, chev.y);
	const f = await toolbar(p, 'binders-filter-button');
	await p.click(f.x, f.y);
	await clickMenu(p, 'Draft');
	await p.sleep(300);
	await closeMenus(p);
	const th = await p.at(`${AL} .binders-outliner-th[data-col="words"]`);
	await p.click(th.x, th.y);
	await p.sleep(300);
	const state = () => p.ev(`JSON.stringify(${VIEW}.getState())`);
	const was = { state: await state(), rows: await rowsIn(p), bar: await toolbarCount(p), width: await p.ev(`Math.round(document.querySelector('${AL} .binders-outliner-th[data-col="status"]').getBoundingClientRect().width)`) };
	t.eq(was.state, j({ folder: 'The Lighthouse', mode: 'outliner', filter: { status: ['Draft'], label: [] }, options: { outliner: { columns: [{ id: 'label' }, { id: 'status', width: was.width }, { id: 'words' }], collapsed: [L + 'Part Two'], sort: { id: 'words', dir: 1 } } } }), 'the view’s state: a wider Status column, Part Two folded, the drafts only, sorted by words');
	t.eq(j(was.rows.map((x) => x.slice(L.length))), j(['Part One', 'Part One/The keeper.md', 'Part Two', 'Prologue.md']), 'what shows');
	await p.sleep(2500); // (Obsidian saves the workspace a moment after it changes)
	await reload(p);
	await until(p, `!!document.querySelector('${AL} .binders-outliner-row')`, 10000);
	await p.sleep(800);
	t.eq(await state(), was.state, 'after a reload: the same state');
	t.eq(j(await rowsIn(p)), j(was.rows), 'the same rows');
	t.eq(await p.ev(`Math.round(document.querySelector('${AL} .binders-outliner-th[data-col="status"]').getBoundingClientRect().width)`), was.width, 'the same column width');
	t.eq(await toolbarCount(p), was.bar, 'the same count');
	t.eq(j(await list(p)), j(LIST), 'and the binder’s order untouched');
	// the quick switcher opens a scene in this tab; Back returns to the binder view as it was
	const switchTo = async (name) => {
		await intoView(p);
		await p.key('o', 'ctrl');
		await until(p, `!!document.querySelector('.prompt input')`);
		await p.type(name);
		await p.sleep(300);
		await p.key('Enter');
		await until(p, `app.workspace.getActiveFile()?.basename === ${j(name)}`);
		await p.sleep(300);
	};
	await switchTo('Storm warning');
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Part One/Storm warning.md', 'the quick switcher opens a scene');
	t.eq(await tabs(p), 1, 'in the binder’s tab, as it opens any note');
	await backButton(p);
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'binders-view', 'Back: the binder view');
	t.eq(await state(), was.state, 'in the same state');
	t.eq(j(await rowsIn(p)), j(was.rows), 'with the same rows');
	// the graph takes the tab too; Back again. Backlinks open beside it.
	await p.ev(`(() => { app.commands.executeCommandById('graph:open'); return 1; })()`);
	await until(p, `app.workspace.getMostRecentLeaf().view.getViewType() === 'graph'`);
	await p.sleep(600);
	await backButton(p);
	t.eq(await state(), was.state, 'Back from the graph: the binder view, in the same state');
	await p.ev(`(() => { app.commands.executeCommandById('backlink:open'); return 1; })()`);
	await p.sleep(600);
	t.eq(j(await list(p)), j(LIST), 'and none of it changed the binder');
	// "Open binder", from a scene: the folder the scene is in (in a view started afresh: see the UX test)
	await switchTo('Storm warning');
	await palette(p, 'Open binder');
	await until(p, `app.workspace.getMostRecentLeaf().view.getViewType() === 'binders-view'`);
	await p.sleep(500);
	t.eq(await p.ev(`${VIEW}.folder.path`), L + 'Part One', '“Open binder” shows the folder the scene is in');
	t.eq(await tabs(p), 1, 'in the same tab');
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

// ================================================================================================================
// 5. A Longform user
// ================================================================================================================

const D = 'Longform demo', INDEX = D + '/Index.md';
/** Longform's own list, as the index note has it: one scene a line, a dash more for each indent. */
const lfScenes = async (p) => { await flush(p); await p.sleep(150); const m = / {2}scenes:\n([\s\S]*?)\n {2}ignoredFiles/.exec(await read(p, INDEX)); return m ? m[1].split('\n').map((l) => l.replace(/^ {4}/, '')) : null; };
const levels = (p) => p.ev(`[...document.querySelectorAll('${AL} .binders-outliner-row')].map(r => r.getAttribute('aria-level') + ' ' + r.dataset.path.split('/').pop().replace('.md', ''))`);

test('5a. a Longform project in each mode: cards grouped under the scene they’re indented under, a drag and a new card, rows indented and outdented with Alt+Left and Alt+Right and undone, a split and a merge, a compile; only Longform’s own list is written, in its own shape', async (p, h, t) => {
	const before = await texts(p), rest = (text) => text.replace(/ {2}scenes:\n[\s\S]*?\n( {2}ignoredFiles)/, '  scenes:\n$1');
	const WAS = ['- Harbor', '- - Ticket office', '  - The crossing', '- Island', '- Return'];
	await openView(p, D);
	t.eq(j(await lfScenes(p)), j(WAS), 'Longform’s list, to start with');
	t.eq(j((await cardsIn(p)).map((x) => x.split('/').pop())), j(['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Return.md']), 'the corkboard: its scenes in its order (the note it ignores isn’t one)');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${AL} .binders-group-heading')].map(h => h.textContent)`)), j(['Harbor2 notes · 13 words']), 'the scenes indented under Harbor are a group under its name');
	await shot(p, '5a-corkboard');
	const a = await p.at(card(D + '/Return.md')), b = await p.at(card(D + '/Island.md'));
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 8, y: b.y });
	t.eq(j(await lfScenes(p)), j(['- Harbor', '- - Ticket office', '  - The crossing', '- Return', '- Island']), 'a card dragged: the list follows, the indents as they were');
	t.eq(j(await selCards(p)), j([D + '/Return.md']), 'the card stays selected');
	const nb = await toolbar(p, 'binders-new-button');
	await p.click(nb.x, nb.y);
	t.eq(j(await menuItems(p)), j(['New note']), 'New makes notes only: a Longform project has no folders');
	await clickMenu(p, 'New note');
	// (the card just dragged is selected: the new scene goes after it, its name ready to type)
	await until(p, `document.activeElement?.matches('${AL} .binders-card-title input')`);
	await p.type('Customs');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(D + '/Customs.md')})`);
	await p.sleep(300);
	await p.key('Escape');
	const NOW = ['- Harbor', '- - Ticket office', '  - The crossing', '- Return', '- Customs', '- Island'];
	t.eq(j(await lfScenes(p)), j(NOW), 'a new scene is listed after the selected card');
	// the outliner: indents, with the keyboard
	await mode(p, h, 'outliner');
	t.eq(j(await levels(p)), j(['1 Harbor', '2 Ticket office', '2 The crossing', '1 Return', '1 Customs', '1 Island']), 'the outliner indents as Longform does');
	const r = await oname(p, D + '/Return.md');
	await p.click(r.x, r.y);
	await p.key('ArrowRight', 'alt');
	await p.sleep(500);
	t.eq(j(await lfScenes(p)), j(['- Harbor', '- - Ticket office', '  - The crossing', '  - Return', '- Customs', '- Island']), 'Alt+Right indents the scene: it joins the group above');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), D + '/Return.md', 'and keeps the focus');
	await p.key('ArrowLeft', 'alt');
	await p.sleep(500);
	t.eq(j(await lfScenes(p)), j(NOW), 'Alt+Left takes it out again');
	await p.key('z', 'ctrl');
	await p.sleep(600);
	t.eq(j(await lfScenes(p)), j(['- Harbor', '- - Ticket office', '  - The crossing', '  - Return', '- Customs', '- Island']), 'Ctrl+Z puts the indent back');
	await p.key('z', 'ctrl');
	await p.sleep(600);
	t.eq(j(await lfScenes(p)), j(NOW), 'and again takes it away');
	// the manuscript: a split; then a merge of the two halves on the corkboard
	await mode(p, h, 'manuscript');
	t.eq(j(await sectionsIn(p)), j(['Harbor', 'Ticket office', 'The crossing', 'Return', 'Customs', 'Island']), 'the manuscript: every scene in order');
	await clickEnd(p, 'Island');
	await p.key('Enter'); await p.key('Enter');
	await p.type('The far side of the island had no path.');
	await p.key('Home');
	await h.run('split-scene');
	await until(p, `app.vault.adapter.exists(${j(D + '/Island 2.md')})`);
	await p.sleep(600);
	t.eq(j(await lfScenes(p)), j(['- Harbor', '- - Ticket office', '  - The crossing', '- Return', '- Customs', '- Island', '- Island 2']), 'a split lists the new scene right after, at the same indent');
	await mode(p, h, 'corkboard');
	const i1 = await p.at(card(D + '/Island.md')), i2 = await p.at(card(D + '/Island 2.md'));
	await p.click(i1.x, i1.t + 12);
	await p.click(i2.x, i2.t + 12, { modifiers: 2 });
	await p.right(i2.x, i2.y);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	await press(p, 'Merge');
	await until(p, `!app.vault.getAbstractFileByPath(${j(D + '/Island 2.md')})`);
	await p.sleep(500);
	t.eq(await read(p, D + '/Island.md'), before[D + '/Island.md'].trimEnd() + '\n\nThe far side of the island had no path.\n', 'merged back: the scene has both halves');
	t.eq(j(await lfScenes(p)), j(NOW), 'and the list is as before the split');
	// compile: flat, in Longform's order
	await h.run('compile');
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	t.eq(await p.ev(`document.querySelector('.modal .binders-compile-path').value`), 'Longform demo (compiled).md', 'compiled beside the project');
	await press(p, 'Compile');
	await until(p, `app.vault.adapter.exists('Longform demo (compiled).md')`);
	const body = (n) => split(before[`${D}/${n}.md`]).body.trim();
	t.eq(await read(p, 'Longform demo (compiled).md'), ['# Longform demo', body('Harbor'), '* * *', body('Ticket office'), '* * *', body('The crossing'), '* * *', body('Return'), '* * *', body('Island') + '\n\nThe far side of the island had no path.'].join('\n\n') + '\n', 'the scenes in order (the empty new one adds nothing)');
	// nothing but Longform's list changed in the index note, and no other note changed
	const now = await texts(p);
	t.eq(rest(now[INDEX]), rest(before[INDEX]), 'the index note: only longform.scenes changed');
	same(t, before, now, { skip: [INDEX, D + '/Island.md'] });
	t.eq(j((await explorerRows(p, D)).map((x) => x.split('/').pop())), j(['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Return.md', 'Customs.md', 'Island.md', 'Notes on ferries.md']), 'the explorer shows the project in its order, the note Longform ignores last');
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

for (const [folders, remove] of [[false, false], [true, true]]) {
	test(`5${folders ? 'c' : 'b'}. “Convert to binder” from the project’s menu, ${folders ? 'moving groups into folders and removing Longform’s property' : 'keeping Longform’s property and moving nothing'}: the open view carries on as a binder, and a drag then writes the binder’s list`, async (p, h, t) => {
		const before = await texts(p);
		await openView(p, D);
		await mode(p, h, 'outliner');
		const is = await oname(p, D + '/Island.md');
		await p.click(is.x, is.y);
		await explorerRows(p, D);
		const row = await exRow(p, D);
		await p.right(row.x, row.y);
		await clickMenu(p, 'Convert to binder');
		await until(p, `!!document.querySelector('.modal .checkbox-container')`);
		const boxes = await p.ev(`[...document.querySelectorAll('.modal .checkbox-container')].map(c => { const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })`);
		if (folders) await p.click(boxes[0].x, boxes[0].y);
		if (remove) await p.click(boxes[1].x, boxes[1].y);
		await p.sleep(200);
		t.eq(j(await p.ev(`[...document.querySelectorAll('.modal li')].map(l => l.textContent)`)), j(folders
			? ['“Index” becomes the binder note and gets the order in a “contents” property.', '5 notes keep their place. No text changes.', '“Harbor” is a new folder, and 2 notes move into it.', 'Also shown in the binder: “Notes on ferries”.', 'The “longform” property is removed from “Index”.']
			: ['“Index” becomes the binder note and gets the order in a “contents” property.', '5 notes keep their place. No text changes.', 'Also shown in the binder: “Notes on ferries”.', 'Longform’s own properties stay, so Longform still lists the project.']), 'the dialog says what will happen');
		await shot(p, `5-convert-${folders ? 'folders' : 'plain'}`);
		t.eq(await read(p, INDEX), before[INDEX], 'and nothing has, yet');
		await press(p, 'Convert');
		await until(p, `${B}.binderOf(${j(D + '/Island.md')})?.kind === 'binder'`);
		await p.sleep(900);
		t.ok(/“Longform demo” is now a binder\./.test(await notices(p)), 'a notice says it’s a binder now');
		const moved = folders ? { [`${D}/Ticket office.md`]: `${D}/Harbor/Ticket office.md`, [`${D}/The crossing.md`]: `${D}/Harbor/The crossing.md` } : {};
		same(t, before, await texts(p), { skip: [INDEX], moved });
		// the view that was open is the binder's now, in the same mode, with the same row selected
		await intoView(p);
		t.eq(await p.ev(`${VIEW}.mode`), 'outliner', 'the view is still the outliner');
		t.eq(j(await selRows(p)), j([D + '/Island.md']), 'with the same row selected');
		// (drawn afresh: with folders, a view left open still draws the project the Longform way; see the BUG test)
		await mode(p, h, 'corkboard');
		await mode(p, h, 'outliner');
		const ROWS = folders ? ['Harbor.md', 'Harbor', 'Harbor/Ticket office.md', 'Harbor/The crossing.md', 'Island.md', 'Return.md', 'Notes on ferries.md'] : ['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Return.md', 'Notes on ferries.md'];
		t.eq(j((await rowsIn(p)).map((x) => x.slice(D.length + 1))), j(ROWS), 'and the binder’s rows: the note Longform ignored is a scene now, last');
		t.eq(j((await explorerRows(p, D)).map((x) => x.slice(D.length + 1))), j(ROWS), 'the explorer shows the same');
		const yaml = split(await read(p, INDEX)).yaml;
		t.eq(/^longform:/m.test(yaml), !remove, remove ? 'Longform’s property is gone' : 'Longform’s property stays');
		t.ok(yaml.includes(folders ? 'binder: 1\ncontents:\n  - Harbor\n  - Harbor/\n  - Harbor/Ticket office\n  - Harbor/The crossing\n  - Island\n  - Return' : 'binder: 1\ncontents:\n  - Harbor\n  - Ticket office\n  - The crossing\n  - Island\n  - Return'), 'the index note is the binder note, with the order: ' + yaml);
		// carry on: a drag on the corkboard writes the binder's list
		await intoView(p);
		await mode(p, h, 'corkboard');
		const a = await p.at(card(D + '/Return.md')), b = await p.at(card(D + '/Island.md'));
		await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 8, y: b.y });
		await p.sleep(400);
		t.eq(j((await list(p, INDEX)).slice(-3)), j(['Return', 'Island', 'Notes on ferries']), 'Return dragged before Island: the binder’s list has it, and now lists every note');
		if (!remove) t.ok(split(await read(p, INDEX)).yaml.includes('    - Island\n    - Return'), 'Longform’s own list is left as it was');
		same(t, before, await texts(p), { skip: [INDEX], moved });
		t.eq(j(p.errors), '[]', 'nothing was logged as an error');
	});
}

// ================================================================================================================
// 6. A big book
// ================================================================================================================

test('6. a big book, 300 scenes in 30 folders: every mode opens quickly, a drag within a chapter and one of a whole chapter to far below (the board scrolling under the pointer) are written at once and undone, a row dragged, the whole book sorted, kept and undone, and typing at the very end of the manuscript saved', async (p, h, t) => {
	await p.ev(`(async () => {
		const words = 'the keeper climbed the stair again while the sea kept on at the rocks below and nobody came '.repeat(14);
		const statuses = ['Idea', 'Draft', 'Revised', 'Done'], labels = ['Red', 'Blue', 'Green', ''];
		await app.vault.createFolder('Saga');
		const contents = [];
		for (let a = 1; a <= 30; a++) {
			const part = 'Chapter ' + String(a).padStart(2, '0');
			await app.vault.createFolder('Saga/' + part);
			contents.push(part + '/');
			for (let i = 1; i <= 10; i++) {
				const n = (a - 1) * 10 + i, name = 'Scene ' + String(n).padStart(3, '0');
				const props = ['synopsis: Scene ' + n + ', in which something happens.', 'status: ' + statuses[n % 4], labels[n % 4] ? 'label: ' + labels[n % 4] : ''].filter(Boolean).join('\\n');
				await app.vault.create('Saga/' + part + '/' + name + '.md', '---\\n' + props + '\\n---\\n' + words + '\\n');
				contents.push(part + '/' + name);
			}
		}
		await app.vault.create('Saga/Saga.md', '---\\nbinder: 1\\ncontents:\\n' + contents.map(c => '  - ' + c).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	t.ok(await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Saga') ?? app.vault.getRoot())?.length === 300 && app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Saga/')).every(f => app.metadataCache.getFileCache(f)?.frontmatter)`, 60000), 'the big book is made');
	const before = await byName(p, 'Saga'), SN = 'Saga/Saga.md';
	const ch = (a) => `Chapter ${String(a).padStart(2, '0')}`, sc = (n) => `Scene ${String(n).padStart(3, '0')}`;
	const first = async () => (await list(p, SN)).slice(0, 11).map((x) => x.split(' ').pop().replace(/^0+/, '')).join(' ');
	const LIMIT = { open: 1500, drag: 3000, sort: 1000, keep: 8000, undo: 15000 };
	await openView(p, 'Saga');
	// each mode, timed from the switch to the frame that shows it
	const show = (m, sel) => p.ev(`(async () => { const v = ${VIEW}, t0 = performance.now(); v.setMode(${j(m)}); for (let i = 0; i < 500 && !document.querySelector(${j(AL + ' ' + sel)}); i++) await new Promise(r => setTimeout(r, 10)); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t0); })()`);
	for (const [m, sel] of [['outliner', '.binders-outliner-row'], ['manuscript', '.binders-manuscript-scene'], ['corkboard', '.binders-card[data-path]']]) {
		const ms = await show(m, sel);
		t.ok(ms < LIMIT.open, `the ${m} opens in ${ms}ms (limit ${LIMIT.open})`);
		await p.sleep(700);
	}
	t.eq((await cardsIn(p)).length, 30, 'thirty stacks, one for each chapter');
	await until(p, `document.querySelector('${AL} .binders-word-count')?.textContent === '75,600 words'`, 15000);
	t.eq(await toolbarCount(p), '75,600 words', 'and their words, all counted');
	t.eq(j(await p.ev(`[...new Set([...document.querySelectorAll('${AL} .binders-card.is-stack .binders-card-words')].map(e => e.textContent))]`)), j(['10 notes · 2,520 words']), 'each stack counting its ten scenes');
	// a drag within the first chapter: written, and the board doesn't jump
	const c = (a, n) => card(`Saga/${ch(a)}/${sc(n)}.md`);
	const top = () => p.ev(`Math.round(document.querySelector('${AL} .binders-corkboard').scrollTop)`);
	await into(p, 'Saga/' + ch(1));
	t.eq((await cardsIn(p)).length, 10, 'inside a chapter: its ten cards');
	let a = await p.at(c(1, 1)), b = await p.at(c(1, 4)), t0 = Date.now();
	await p.drag(a.x, a.t + 12, b.x + b.w / 2 - 6, b.y, 16);
	t.ok(await until(p, `${B}.orderedChildren(app.vault.getAbstractFileByPath('Saga/Chapter 01'))[3]?.basename === 'Scene 001'`, LIMIT.drag), 'a card dragged past three others lands after them');
	t.ok(Date.now() - t0 < LIMIT.drag, `in ${Date.now() - t0}ms (limit ${LIMIT.drag})`);
	t.eq(await first(), '1/ 2 3 4 1 5 6 7 8 9 10', 'the list on disk has it');
	t.eq(await top(), 0, 'and the board hasn’t moved');
	await p.sleep(500);
	// back on the binder's board: the first chapter's stack dragged far below: held at the bottom edge, the board
	// scrolls; dropped at the edge of a stack down there, the whole chapter is there
	await upTo(p);
	const far = await p.ev(`(() => { const s = document.querySelector('${AL} .binders-corkboard'); return s.scrollHeight - s.clientHeight; })()`);
	t.ok(far > 150, `thirty stacks are more than a screen (${far}px to scroll)`);
	a = await p.at(stackSel('Saga/' + ch(1)));
	const view = await p.at(`${AL} .binders-corkboard`);
	await p.move(a.x, a.t + 12, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.t + 12, button: 'left', clickCount: 1 });
	await p.move(a.x, view.t + view.h - 10, 10, { buttons: 1 });
	await p.sleep(2500);
	const scrolled = await top();
	t.ok(scrolled > Math.min(800, far - 5), `held at the bottom edge, the board scrolls on (${scrolled}px of ${far} in 2.5s)`);
	// (the left edge of a stack in the lowest row that's clear of the board's edges: beside it, not into it)
	const edge = await p.ev(`(() => { const v = document.querySelector('${AL} .binders-corkboard').getBoundingClientRect(); const rs = [...document.querySelectorAll('${AL} .binders-card.is-stack[data-path]:not(.is-dragging)')].map(c => c.getBoundingClientRect()).filter(r => r.top > v.top + 70 && r.bottom < v.bottom - 70); if (!rs.length) return null; const low = Math.max(...rs.map(r => r.top)); const r = rs.filter(r => Math.abs(r.top - low) < 2).sort((a, b) => Math.abs(a.left - ${a.x}) - Math.abs(b.left - ${a.x}))[0]; return { x: r.left + 6, y: r.top + r.height / 2 }; })()`);
	t.ok(edge != null, 'a row of stacks is in sight down there');
	await p.move(edge.x, edge.y, 4, { buttons: 1 });
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.binders-drop-indicator.is-active')`), 'a line shows where the chapter will go');
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: edge.x, y: edge.y, button: 'left', clickCount: 1 });
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Saga'))[0]?.basename !== 'Scene 002'`, LIMIT.drag);
	await p.sleep(800);
	const landed = await p.ev(`${B}.orderedChildren(app.vault.getAbstractFileByPath('Saga')).map(f => f.name).indexOf('Chapter 01')`);
	t.ok(landed >= 20, `dropped there, the chapter is far down the binder (place ${landed + 1} of 30)`);
	t.eq(await p.ev(`app.vault.getMarkdownFiles().filter(f => f.path.startsWith('Saga/Chapter 01/')).length`), 10, 'with its ten scenes');
	t.ok(Math.abs(await top() - scrolled) < 40, 'the board stays where it was scrolled to');
	t.eq(j(await selCards(p)), j(['Saga/Chapter 01']), 'the stack is selected where it landed');
	t.ok(await inView(p), 'with the keyboard on the board: ' + await focus(p));
	await p.key('z', 'ctrl');
	await until(p, `${B}.orderedChildren(app.vault.getAbstractFileByPath('Saga'))[0]?.name === 'Chapter 01'`, LIMIT.drag);
	t.eq(await first(), '1/ 2 3 4 1 5 6 7 8 9 10', 'Ctrl+Z brings it back to the front of the book');
	// the outliner: a row into the next chapter; then the whole book sorted, kept, and undone
	await mode(p, h, 'outliner');
	await p.sleep(600);
	const r = await oname(p, `Saga/${ch(1)}/${sc(3)}.md`), next = await p.at(orow(`Saga/${ch(2)}`));
	t0 = Date.now();
	await p.drag(r.x, r.y, r.x, next.y, 14);
	t.ok(await until(p, `!!app.vault.getAbstractFileByPath('Saga/Chapter 02/Scene 003.md')`, LIMIT.drag), 'a row dropped on the next chapter moves into it');
	t.ok(Date.now() - t0 < LIMIT.drag, `in ${Date.now() - t0}ms (limit ${LIMIT.drag})`);
	await p.sleep(600);
	const head = await p.at(`${AL} .binders-outliner-th[data-col="status"]`);
	t0 = Date.now();
	await p.click(head.x, head.y);
	await until(p, `document.querySelector('${AL} .binders-outliner')?.classList.contains('is-sorted')`);
	t.ok(Date.now() - t0 < LIMIT.sort, `sorting 300 rows takes ${Date.now() - t0}ms (limit ${LIMIT.sort})`);
	await p.sleep(400);
	await p.right(head.x, head.y);
	t0 = Date.now();
	await clickMenu(p, 'Make this the binder order');
	t.ok(await until(p, `${VIEW}.getState().options.outliner.sort == null`, LIMIT.keep), 'the sort is kept as the binder’s order');
	t.ok(Date.now() - t0 < LIMIT.keep, `in ${Date.now() - t0}ms (limit ${LIMIT.keep})`);
	t.eq(await first(), '1/ 4 8 1 5 9 2 6 10 7 2/', 'chapter 1 is in the order of its statuses now (Idea, Draft, Revised, Done)');
	t0 = Date.now();
	await p.key('z', 'ctrl');
	t.ok(await until(p, `${B}.undoable('Saga') !== 'Sort by status'`, LIMIT.undo), 'Ctrl+Z undoes the sort');
	t.ok(Date.now() - t0 < LIMIT.undo, `in ${Date.now() - t0}ms (limit ${LIMIT.undo})`);
	t.eq(await first(), '1/ 2 4 1 5 6 7 8 9 10 2/', 'chapter 1 is as it was before the sort');
	// the manuscript: the very end, typed in, saved
	await mode(p, h, 'manuscript');
	await p.sleep(1200);
	await p.key('End', 'ctrl');
	await until(p, `document.activeElement?.closest?.('.binders-manuscript-scene')?.querySelector('.binders-manuscript-title').textContent === 'Scene 300'`, 6000);
	t.eq(await caretScene(p), 'Scene 300', 'Mod+End goes to the last of the 300 sections');
	await p.type('The end of the saga.');
	await until(p, `document.querySelector('${AL} .binders-word-count')?.textContent === '75,605 words'`, 4000);
	t.eq(await toolbarCount(p), '75,605 words', 'the count follows the typing');
	await p.sleep(SAVED);
	const now = await byName(p, 'Saga');
	t.eq(now['Scene 300'], before['Scene 300'] + 'The end of the saga.', 'what was typed at the very end is in the last note');
	for (const n of Object.keys(before)) if (n !== 'Scene 300' && n !== 'Saga') t.eq(now[n], before[n], `“${n}” is byte for byte what it was`);
	t.eq(j(p.errors), '[]', 'nothing was logged as an error');
});

// ================================================================================================================
// What the journeys found. BUG: fails now, passes when fixed. UX: what a writer would expect instead.
// ================================================================================================================

const bug = (name, fn) => specs.push({ name: 'BUG: ' + name, fn: wrap(fn) });
const ux = (name, fn) => specs.push({ name: 'UX: ' + name, fn: wrap(fn) });
const A = L + 'Part One/Arrival.md', K = L + 'Part One/The keeper.md';
const filterBy = async (p, what) => { const f = await toolbar(p, 'binders-filter-button'); await p.click(f.x, f.y); await clickMenu(p, what); await p.sleep(300); await closeMenus(p); };
const backButton = async (p) => { const b = await p.at('.mod-root .workspace-leaf.mod-active .view-header-nav-buttons button:first-child'); await p.click(b.x, b.y); await p.sleep(900); };

// ---- writing lost, doubled or put in the wrong place ----

bug('two manuscripts side by side (the binder, and one of its folders): typing in one and straight away in the other writes each word once (src/view/editable-embed.ts onFileChanged: an echo of the section’s own earlier text is merged as an outside change)', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'manuscript');
	await leafOpen(p, { folder: 'The Lighthouse/Part One', mode: 'manuscript' });
	await p.sleep(600);
	const line = (i) => p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].filter(s => s.querySelector('.binders-manuscript-title').textContent === 'Arrival')[${i}]; const l = [...s.querySelectorAll('.cm-line')].reverse().find(x => x.textContent.trim()); const b = l.getBoundingClientRect(); return { x: b.left + 20, y: b.top + 8 }; })()`);
	const left = await line(0), right = await line(1);
	// a fast typist (30ms a key), and no pause between the panes
	await p.click(left.x, left.y); await p.sleep(80); await p.key('Home');
	await typeAt(p, 'LEFT-ONE. ', 30);
	await p.sleep(300);
	await p.click(right.x, right.y); await p.sleep(80); await p.key('Home');
	await typeAt(p, 'RIGHT-TWO. ', 30);
	await p.sleep(300);
	await p.click(left.x, left.y); await p.sleep(80); await p.key('Home');
	await typeAt(p, 'LEFT-THREE. ', 30);
	await p.sleep(SAVED + 500);
	t.eq(split(await read(p, A)).body, 'LEFT-THREE. RIGHT-TWO. LEFT-ONE. The supply boat left Mara on the jetty with two cases and a letter she had not opened.\n', 'each thing typed is in the note once');
});

bug('a scene open in a tab beside the manuscript: typing in the tab and straight away in the manuscript writes each word once', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'manuscript');
	await p.ev(`(async () => { const leaf = app.workspace.getLeaf('split'); await leaf.openFile(app.vault.getAbstractFileByPath(${j(A)})); })().then(() => 1)`);
	await p.sleep(800);
	const n = await p.ev(`(() => { const l = [...document.querySelectorAll('.mod-root .markdown-source-view .cm-line')].reverse().find(x => x.textContent.trim()); const b = l.getBoundingClientRect(); return { x: b.left + 30, y: b.top + 8 }; })()`);
	const m = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === 'Arrival'); const l = [...s.querySelectorAll('.cm-line')].reverse().find(x => x.textContent.trim()); const b = l.getBoundingClientRect(); return { x: b.left + 20, y: b.top + 8 }; })()`);
	await p.click(n.x, n.y); await p.key('End', 'ctrl'); await p.key('ArrowLeft');
	await typeAt(p, ' NOTE-ONE.', 30);
	await p.sleep(300);
	await p.click(m.x, m.y); await p.sleep(80); await p.key('Home');
	await typeAt(p, 'MS-TWO. ', 30);
	await p.sleep(300);
	await p.click(n.x, n.y); await p.sleep(80); await p.key('End', 'ctrl'); await p.key('ArrowLeft');
	await typeAt(p, ' NOTE-THREE.', 30);
	await p.sleep(SAVED + 500);
	t.eq(split(await read(p, A)).body, 'MS-TWO. The supply boat left Mara on the jetty with two cases and a letter she had not opened. NOTE-ONE. NOTE-THREE.\n', 'each thing typed is in the note once');
});

bug('“New note” in the manuscript with a filter on: the new note shows, to be named; what’s typed for its name doesn’t go into the scene the cursor was in (src/view/manuscript.ts create → reveal: the note doesn’t pass the filter, so there is no section to name)', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await filterBy(p, 'Draft');
	await mode(p, h, 'manuscript');
	await clickEnd(p, 'The keeper');
	const nb = await toolbar(p, 'binders-new-button');
	await p.click(nb.x, nb.y);
	await clickMenu(p, 'New note');
	await p.sleep(700);
	await p.type('Named in the manuscript');
	await p.key('Enter');
	await p.sleep(SAVED);
	t.eq(await read(p, K), before[K], 'the scene the cursor was in is untouched');
	t.ok(await exists(p, L + 'Part One/Named in the manuscript.md'), 'and the new note has the name that was typed');
	t.ok((await sectionsIn(p)).includes('Named in the manuscript'), 'and shows, though it has no status yet (as a new card does on the corkboard)');
});

bug('“New note” in the outliner with a filter on: the new note shows, its name ready to type (src/view/outliner.ts make: the row isn’t drawn, so an “Untitled” note is made out of sight)', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'outliner');
	await filterBy(p, 'Draft');
	const r = await oname(p, K);
	await p.click(r.x, r.y);
	const nb = await toolbar(p, 'binders-new-button');
	await p.click(nb.x, nb.y);
	await clickMenu(p, 'New note');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Untitled.md')})`);
	await p.sleep(500);
	t.ok((await rowsIn(p)).includes(L + 'Part One/Untitled.md'), 'the new note has a row');
	t.ok(await p.ev(`document.activeElement?.matches('${AL} .binders-outliner-name input')`), 'with its name ready to type: ' + await focus(p));
});

bug('deleting a scene from the manuscript right after typing in it: the copy in the trash has what was typed (src/view/actions.ts removeItems trashes without saving open editors first, as merge, split, duplicate and compile do)', async (p, h, t) => {
	const W = L + 'Part Two/The wreck.md', before = await read(p, W);
	await openView(p);
	await mode(p, h, 'manuscript');
	await clickEnd(p, 'The wreck');
	await p.type(' LAST-WORDS.');
	const ti = await titleAt(p, 'The wreck');
	await p.right(ti.x, ti.y);
	await clickMenu(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await press(p, 'Delete');
	await until(p, `!app.vault.getAbstractFileByPath(${j(W)})`);
	await p.sleep(SAVED);
	t.ok(!(await exists(p, W)), 'the note is gone from the binder');
	t.eq(await p.ev(`app.vault.adapter.read('.trash/The wreck.md')`), before.trimEnd() + ' LAST-WORDS.\n', 'and what’s in the trash is the note as it was on screen');
});

bug('“Convert to binder” with “Move groups into folders”, while the project’s binder view is open: the view shows the new folder as a folder, and a card dragged within it stays in it (src/view/BinderView.ts key(): the binder’s kind isn’t part of it, so the mode keeps the Longform project it was made with)', async (p, h, t) => {
	await openView(p, D);
	await p.ev(`${B}.convertToBinder(${B}.binderOf(${j(INDEX)}), { folders: true, removeLongform: true }).then(() => 1)`);
	await until(p, `${B}.binderOf(${j(D + '/Island.md')})?.kind === 'binder'`);
	await p.sleep(1200);
	t.eq(j(await list(p, INDEX)), j(['Harbor', 'Harbor/', 'Harbor/Ticket office', 'Harbor/The crossing', 'Island', 'Return']), 'the binder has a Harbor folder');
	t.eq(j((await cardsIn(p)).map((x) => x.slice(D.length + 1))), j(['Harbor.md', 'Harbor', 'Island.md', 'Return.md', 'Notes on ferries.md']), 'which the corkboard shows as a folder’s stack, after the scene it’s named for');
	t.eq(await p.ev(`document.querySelectorAll('${AL} .binders-card.is-stack').length + ' ' + document.querySelectorAll('${AL} .binders-group-heading').length`), '1 0', 'a stack, and no Longform group under a heading');
	const nb = await toolbar(p, 'binders-new-button');
	await p.click(nb.x, nb.y);
	const items = await menuItems(p);
	await closeMenus(p);
	t.ok(items.includes('New folder'), 'New offers a folder now: ' + items.join(', '));
	await into(p, D + '/Harbor');
	const a = await p.at(card(D + '/Harbor/The crossing.md')), b = await p.at(card(D + '/Harbor/Ticket office.md'));
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 8, y: b.y });
	await p.sleep(800);
	t.ok(await exists(p, D + '/Harbor/The crossing.md'), 'a card dragged before its neighbour stays in its folder');
	t.eq(j((await list(p, INDEX)).slice(1, 4)), j(['Harbor/', 'Harbor/The crossing', 'Harbor/Ticket office']), 'in its new place');
});

// ---- state that goes stale ----

bug('the outliner, with every row selected (Ctrl+A): a status picked in a cell is set on every selected note, the ones inside the selected folders too (src/view/outliner.ts targets(): a selected folder “stands for” the selected notes in it, which is right for a drag and wrong for a property)', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'outliner');
	const r = await oname(p, L + 'Prologue.md');
	await p.click(r.x, r.y);
	await p.key('a', 'ctrl');
	t.eq((await selRows(p)).length, 9, 'nine rows selected: seven notes and two folders');
	const cell = await p.at(orow(L + 'Prologue.md') + ' [data-col="status"]');
	await p.click(cell.x, cell.y);
	await clickMenu(p, 'Done');
	await p.sleep(1200);
	t.eq(j(await p.ev(`${B}.scenes(app.vault.getAbstractFileByPath('The Lighthouse')).map(f => f.basename + ': ' + app.metadataCache.getFileCache(f)?.frontmatter?.status)`)), j(['Prologue', 'Arrival', 'The keeper', 'Storm warning', 'The wreck', 'Lights out', 'Epilogue'].map((n) => n + ': Done')), 'every selected note is Done');
});

bug('with a filter on, the toolbar’s count still says how much passes it after a change of mode (src/view/BinderView.ts rebuild(): the toolbar is drawn before the mode is made, so “filtering” is false)', async (p, h, t) => {
	await openView(p);
	await filterBy(p, 'Draft');
	t.eq(await toolbarCount(p), '55 of 106 words', 'on the corkboard, with the drafts only');
	await mode(p, h, 'outliner');
	t.eq(await toolbarCount(p), '55 of 106 words', 'and the same in the outliner');
	await mode(p, h, 'manuscript');
	t.eq(await toolbarCount(p), '55 of 106 words', 'and in the manuscript');
});

bug('the outliner: a click on a column’s header sorts by it and leaves the selection as it is (src/view/outliner.ts: the header is drawn again inside its own click, so the click then counts as one “below the rows”, which selects nothing)', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'outliner');
	const r = await oname(p, K);
	await p.click(r.x, r.y);
	const th = await p.at(`${AL} .binders-outliner-th[data-col="words"]`);
	await p.click(th.x, th.y);
	await p.sleep(300);
	t.eq(j(await selRows(p)), j([K]), 'the row is still selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), K, 'and still has the focus');
});

bug('the corkboard keeps its selection, and the keyboard, when the selected cards change folder by an undo (the outliner follows renames; src/view/corkboard.ts doesn’t)', async (p, h, t) => {
	await openView(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	// (a board shows one folder: a card that changes folder leaves it. Prologue is dropped on Part Two's stack; inside
	// Part Two it's selected, and the move is taken back: it leaves that board, and the keyboard stays on it)
	const P = L + 'Prologue.md', P2 = L + 'Part Two/Prologue.md';
	const a = await p.at(card(P)), w = await p.at(stackSel(L + 'Part Two'));
	await drag(p, { x: a.x, y: a.t + 12 }, { x: w.x, y: w.y });
	await until(p, `app.vault.adapter.exists(${j(P2)})`);
	await p.sleep(500);
	t.eq(j(await cardsIn(p)), j([L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'dropped on Part Two’s stack, the card is in that folder');
	await into(p, L + 'Part Two');
	const c = await p.at(card(P2));
	await p.click(c.x, c.t + 12);
	t.eq(j(await selCards(p)), j([P2]), 'inside the folder, the card is selected');
	await p.key('z', 'ctrl');
	await until(p, `app.vault.adapter.exists(${j(P)})`);
	await p.sleep(600);
	t.eq(j(await cardsIn(p)), j([L + 'Part Two/The wreck.md', L + 'Part Two/Lights out.md']), 'undone, it’s gone from this board');
	t.ok(await inView(p), 'and the board still has the keyboard: ' + await focus(p));
	await p.key('ArrowRight');
	await p.sleep(150);
	t.eq((await selCards(p)).length, 1, 'an arrow key selects a card');
	await upTo(p);
	t.eq(j(await cardsIn(p)), j([P, L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'and on the binder’s board it’s back where it was');
});

// Round 7 (the board of one folder at a time): cards dropped on a folder's stack leave the board.
bug('qa7: the corkboard keeps the keyboard when the cards being moved leave the board (dropped on a folder’s stack): an arrow key right after goes to a card (the focus goes to the page with the cards that left, so the board’s keys do nothing until it’s clicked)', async (p, h, t) => {
	await openView(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	const P = L + 'Prologue.md';
	const a = await p.at(card(P)), w = await p.at(stackSel(L + 'Part Two'));
	await drag(p, { x: a.x, y: a.t + 12 }, { x: w.x, y: w.y });
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Prologue.md')})`);
	await p.sleep(600);
	t.eq(j(await list(p)), j([...LIST.slice(1, 8), 'Part Two/Prologue', 'Epilogue']), 'dropped on Part Two’s stack, the note is the folder’s last');
	t.ok(await inView(p), 'after the drop the keyboard is still in the view (on the stack the cards went into, say): ' + await focus(p));
	await p.key('ArrowRight');
	await p.sleep(200);
	t.eq((await selCards(p)).length, 1, 'and an arrow key selects a card');
	// (Ctrl+Z is the view's own, whatever has the focus in it)
	await p.key('z', 'ctrl');
	await until(p, `app.vault.adapter.exists(${j(P)})`);
	t.eq(j(await list(p)), j(LIST), 'Ctrl+Z takes the move back: the order as it was');
});

bug('qa7: “New scene here” in the file explorer’s menu, with the binder’s corkboard in front: the new card’s name is ready to type (the card shows, but the keyboard stays where it was: what’s typed for the name goes to the board’s own keys, and Enter opens the card that had the focus)', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const c = await p.at(card(L + 'Prologue.md'));
	await p.click(c.x, c.t + 12);
	await explorerRows(p, 'The Lighthouse');
	const r = await exRow(p, 'The Lighthouse');
	await p.right(r.x, r.y);
	await clickMenu(p, 'New scene here');
	await until(p, `app.vault.adapter.exists(${j(L + 'Untitled.md')})`);
	await until(p, `document.activeElement?.matches('.inline-title, .binders-edit-field')`, 2500);
	const was = await focus(p);
	t.ok((await cardsIn(p)).includes(L + 'Untitled.md'), 'the new note has a card on the board');
	await p.type('Afterword');
	await p.key('Enter');
	await p.sleep(1200);
	const named = await exists(p, L + 'Afterword.md'), opened = await p.ev(`app.workspace.getActiveFile()?.path ?? null`);
	t.ok(named, `its name is ready to type over, and Enter names it (the keyboard was on: ${was}; the note is still “Untitled”, and ${opened ? `“${opened}” was opened instead` : 'nothing else happened'})`);
	t.eq(j((await list(p)).slice(-2)), j(['Epilogue', 'Afterword']), 'last in the binder');
	same(t, before, await texts(p), { skip: [NOTE] });
});

bug('the corkboard keeps its selection when the selected note is renamed somewhere else (the file explorer, the note’s own title)', async (p, h, t) => {
	await openView(p, L + 'Part One');
	const a = await p.at(card(A));
	await p.click(a.x, a.t + 12);
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${j(A)}), ${j(L + 'Part One/Landing.md')}).then(() => 1)`);
	await p.sleep(700);
	t.eq(j(await selCards(p)), j([L + 'Part One/Landing.md']), 'the renamed card is still selected');
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), L + 'Part One/Landing.md', 'with the focus');
});

// ---- the keyboard, lost to nowhere ----

bug('the corkboard: once a folder made by “New folder from selection” is named, the keyboard is still on the board (the folder is drawn again under its new name, and nothing takes the focus)', async (p, h, t) => {
	await novel(p, NAMES.slice(0, 4));
	await openView(p, 'Novel');
	const a = await p.at(card(N + 'One.md')), k = await p.at(card(N + 'Two.md'));
	await p.click(a.x, a.t + 12);
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await p.right(k.x, k.y);
	await clickMenu(p, 'New folder from selection');
	await until(p, `document.activeElement?.matches('${AL} .binders-card.is-stack .binders-card-title input')`);
	await p.type('Chapter 1');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('Novel/Chapter 1/Two.md')`);
	await p.sleep(500);
	t.ok(await inView(p), 'the focus is in the view (on the folder’s stack), not on the page: ' + await focus(p));
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), 'Novel/Chapter 1', 'on the new folder’s stack');
	await p.key('Enter');
	await until(p, `${VIEW}?.folder?.path === 'Novel/Chapter 1'`);
	t.eq(j(await cardsIn(p)), j(['Novel/Chapter 1/One.md', 'Novel/Chapter 1/Two.md']), 'and Enter goes into it: the two scenes');
});

bug('a binder opened from the file explorer has the keyboard: an arrow key goes to a card (src/main.ts openBinder focuses the pane, and nothing in it)', async (p, h, t) => {
	await explorerRows(p, 'The Lighthouse');
	const r = await exRow(p, 'The Lighthouse');
	await p.click(r.x, r.y);
	await until(p, `!!document.querySelector('${AL} .binders-view .binders-card[data-path]')`);
	await p.sleep(400);
	await p.key('ArrowRight');
	await p.sleep(150);
	t.ok(await inView(p), 'the focus is in the view: ' + await focus(p));
	t.eq((await selCards(p)).length, 1, 'and the arrow selected a card');
});

bug('going into a folder (a double-click on its row) leaves the keyboard in the view: Down selects its first row', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'outliner');
	const f = await oname(p, L + 'Part Two');
	await p.dbl(f.x, f.y);
	await until(p, `${VIEW}?.folder?.path === 'The Lighthouse/Part Two'`);
	await p.sleep(500);
	await p.key('ArrowDown');
	await p.sleep(150);
	t.ok(await inView(p), 'the focus is in the view: ' + await focus(p));
	t.eq(j(await selRows(p)), j([L + 'Part Two/The wreck.md']), 'and Down selected the first row');
});

bug('Back from a note to the binder view gives the keyboard back to it, as Back to a note gives it back to the note', async (p, h, t) => {
	// what Obsidian does: Back to a note, and its editor has the focus
	await h.open(L + 'Prologue.md');
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')})).then(() => 1)`);
	await p.sleep(500);
	await backButton(p);
	t.ok(await p.ev(`!!document.activeElement?.closest('.cm-content')`), 'Obsidian: Back to a note puts the cursor in it');
	await p.ev(`app.workspace.getMostRecentLeaf().detach()`);
	await openView(p, L + 'Part One');
	const c = await p.at(card(K));
	await p.click(c.x, c.t + 12);
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(K)}`);
	await p.sleep(400);
	await backButton(p);
	t.eq(j(await selCards(p)), j([K]), 'Back to the corkboard: the card is still selected');
	await p.key('ArrowRight');
	await p.sleep(150);
	t.eq(j(await selCards(p)), j([L + 'Part One/Storm warning.md']), 'and the arrow keys work at once');
});

bug('after a section is deleted in the manuscript, the cursor is in a neighbouring section (the corkboard and the outliner move the focus to the next card or row)', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'manuscript');
	await clickEnd(p, 'The wreck');
	const ti = await titleAt(p, 'The wreck');
	await p.right(ti.x, ti.y);
	await clickMenu(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await press(p, 'Delete');
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part Two/The wreck.md')})`);
	await p.sleep(700);
	t.ok(await inView(p), 'the focus is in the view: ' + await focus(p));
	t.eq(await caretScene(p), 'Lights out', 'in the section that followed');
});

bug('qa7: a note selected in the outliner (or on the corkboard) is the section the manuscript opens on, with the cursor in it (when the section has to be scrolled into view, the cursor is put in the section before it: the section is brought to the window’s foot, and the keyboard goes to the one above)', async (p, h, t) => {
	await chapters(p, 12);
	await openView(p, 'Novel');
	const got = [];
	const from = async (row) => {
		await mode(p, h, 'outliner');
		const r = await oname(p, N + row + '.md');
		await p.click(r.x, r.y);
		await mode(p, h, 'manuscript');
		await p.sleep(800);
		got.push(`${row.split('/').pop()} → ${await caretScene(p)}`);
	};
	for (const row of ['Chapter 2/Eleven', 'Twenty', 'Chapter 1/Three', 'Chapter 3/Sixteen']) await from(row);
	// and from a card
	await mode(p, h, 'corkboard');
	const c = await p.at(card(N + 'Nineteen.md'));
	await p.click(c.x, c.t + 12);
	await mode(p, h, 'manuscript');
	await p.sleep(800);
	got.push(`Nineteen → ${await caretScene(p)}`);
	// (the manuscript logs “Measure loop restarted” on the way: the BUG test of specs-qa4-manuscript.mjs; not this one's)
	p.errors.length = 0;
	t.eq(got.join(', '), 'Eleven → Eleven, Twenty → Twenty, Three → Three, Sixteen → Sixteen, Nineteen → Nineteen', 'the note selected → the section the cursor is in once the manuscript shows');
});

// ---- friction: what a writer would expect ----

ux('“New scene here” with a card selected on the corkboard makes the note after that card, as it does after the selected row in the outliner and after the cursor’s section in the manuscript (Scrivener: a new document goes after the selected one)', async (p, h, t) => {
	await openView(p, L + 'Part One');
	const c = await p.at(card(A));
	await p.click(c.x, c.t + 12);
	await h.run('new-scene');
	await p.sleep(300);
	await p.type('After Arrival');
	await p.key('Enter');
	await until(p, `app.vault.getMarkdownFiles().some(f => f.basename === 'After Arrival')`);
	await p.sleep(300);
	await p.key('Escape');
	t.eq(j((await list(p)).slice(2, 4)), j(['Part One/Arrival', 'Part One/After Arrival']), 'right after the selected card (now: last in the binder, to be dragged back up)');
});

ux('what’s selected on the corkboard is selected in the outliner, and the other way (Scrivener keeps one selection for the corkboard and the outliner; here each mode has its own, and the first card or row has the focus after a switch)', async (p, h, t) => {
	await openView(p, L + 'Part Two');
	const c = await p.at(card(L + 'Part Two/Lights out.md'));
	await p.click(c.x, c.t + 12);
	await mode(p, h, 'outliner');
	t.eq(j(await selRows(p)), j([L + 'Part Two/Lights out.md']), 'the card selected on the corkboard is the selected row');
});

ux('the scene being written in the manuscript is the selected card on the corkboard (so its status or synopsis is a click away: the manuscript itself shows neither)', async (p, h, t) => {
	await openView(p, L + 'Part Two');
	await mode(p, h, 'manuscript');
	await clickEnd(p, 'Lights out');
	await mode(p, h, 'corkboard');
	t.eq(j(await selCards(p)), j([L + 'Part Two/Lights out.md']), 'the corkboard opens on the scene the cursor was in');
});

// (round 7: the board shows one folder at a time, so a scene inside a folder has no card on the binder's own board)
ux('qa7: on the binder’s own board, the scene being written in the manuscript (or the row selected in the outliner) inside a folder is shown by its folder’s stack being selected (now: nothing is selected, and the keyboard starts on the first card)', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'manuscript');
	await clickEnd(p, 'Lights out');
	await mode(p, h, 'corkboard');
	t.eq(j(await selCards(p)), j([L + 'Part Two']), 'from the manuscript: the stack of the folder the cursor’s scene is in');
	await mode(p, h, 'outliner');
	const r = await oname(p, K);
	await p.click(r.x, r.y);
	await mode(p, h, 'corkboard');
	t.eq(j(await selCards(p)), j([L + 'Part One']), 'from the outliner: the stack of the folder the selected row is in');
});

// (Not taken as asked: a row that grew a line when it was clicked would move the rows under the pointer, and a drag
// started on that click would start from the wrong place. The row's menu opens the field instead.)
test('the outliner: a row without a synopsis gets one from “Edit synopsis” in its menu, and stays one line tall when it’s only selected', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')}), fm => { delete fm.synopsis; }).then(() => 1)`);
	await p.sleep(400);
	await openView(p);
	await mode(p, h, 'outliner');
	const r = await oname(p, L + 'Epilogue.md');
	const tall = () => p.ev(`document.querySelector(${j(orow(L + 'Epilogue.md'))}).getBoundingClientRect().height`);
	const was = await tall();
	await p.click(r.x, r.y);
	await p.sleep(150);
	t.eq(await tall(), was, 'selecting the row doesn’t change its height');
	await p.right(r.x, r.y);
	await clickMenu(p, 'Edit synopsis');
	await p.sleep(200);
	const s = await p.at(orow(L + 'Epilogue.md') + ' .binders-outliner-synopsis');
	t.ok(s && s.h > 0, 'the menu opens a field for its synopsis');
	await p.type('Years later.'); await p.key('Tab'); await p.sleep(600);
	t.ok((await read(p, L + 'Epilogue.md')).includes('synopsis: Years later.'), 'and what’s typed is its synopsis');
});

ux('the binder view itself offers Compile (its “More options” menu; now only the command palette and the file explorer’s menu do)', async (p, h, t) => {
	await openView(p);
	const more = await p.at(`${AL} .view-action[aria-label="More options"]`);
	await p.click(more.x, more.y);
	await p.sleep(300);
	const items = await menuItems(p);
	await closeMenus(p);
	t.ok(items.some((x) => /^Compile/.test(x)), '“More options” has a Compile item: ' + items.join(', '));
});

ux('a folder’s menu in the binder view (its stack, its row) has “Compile...”, as its menu in the file explorer has', async (p, h, t) => {
	await openView(p);
	const hd = await p.at(stackSel(L + 'Part One'));
	await p.right(hd.x, hd.t + 12);
	const items = await menuItems(p);
	await closeMenus(p);
	t.ok(items.includes('Compile...'), 'the stack’s menu: ' + items.join(', '));
	await mode(p, h, 'outliner');
	const row = await oname(p, L + 'Part One');
	await p.right(row.x, row.y);
	const inRow = await menuItems(p);
	await closeMenus(p);
	t.ok(inRow.includes('Compile...'), 'its row’s menu: ' + inRow.join(', '));
});

ux('“Convert to binder” is in the command palette while the Longform project’s binder view is in front (now only with a note of the project open)', async (p, h, t) => {
	await openView(p, D);
	t.ok(await p.ev(`!!app.commands.findCommand('binders:convert-longform').checkCallback(true)`), 'the command is offered in the binder view');
});

ux('Ctrl+Z right after “Split scene at cursor” doesn’t leave the second half in both notes (now: the editor’s undo puts it back in the first, the new note keeps it, and nothing says so)', async (p, h, t) => {
	await p.ev(`app.vault.modify(app.vault.getAbstractFileByPath(${j(K)}), 'First half.\\n\\nSecond half.\\n').then(() => 1)`);
	await p.sleep(400);
	await openView(p);
	await mode(p, h, 'manuscript');
	await clickEnd(p, 'The keeper');
	await p.key('Home');
	await h.run('split-scene');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`);
	await p.sleep(600);
	await p.key('z', 'ctrl');
	await p.sleep(SAVED);
	const first = await read(p, K), second = (await exists(p, L + 'Part One/The keeper 2.md')) ? await read(p, L + 'Part One/The keeper 2.md') : '';
	t.ok(!(first.includes('Second half.') && second.includes('Second half.')), 'the text is in one note, not two');
});

ux('the other modes keep their place too when a note is opened and Back comes back (README: “Each mode keeps its place when you look at another, and when you open a note and come back”; now only the mode in front does)', async (p, h, t) => {
	await chapters(p, 12);
	await openView(p, 'Novel');
	await mode(p, h, 'manuscript');
	await clickEnd(p, 'Nine');
	await mode(p, h, 'outliner');
	const r = await oname(p, N + 'Chapter 2/Eleven.md');
	await p.click(r.x, r.y);
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(N + 'Chapter 2/Eleven.md')}`);
	await p.sleep(300);
	await backButton(p);
	await intoView(p);
	await mode(p, h, 'manuscript');
	await p.sleep(500);
	t.eq(await caretScene(p), 'Nine', 'the manuscript’s cursor is where it was left');
});

ux('“Open binder” (or a click on the binder in the file explorer) from a scene that was opened from the binder view comes back to the view as it was left: its mode, its filter (now: a corkboard with no filter; only Back keeps them. src/main.ts openBinder starts from `{ folder }` when the tab shows a note)', async (p, h, t) => {
	await openView(p);
	await mode(p, h, 'outliner');
	await filterBy(p, 'Draft');
	const r = await oname(p, K);
	await p.click(r.x, r.y);
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === ${j(K)}`);
	await p.sleep(400);
	await h.run('open-binder');
	await until(p, `app.workspace.getMostRecentLeaf().view.getViewType() === 'binders-view'`);
	await p.sleep(500);
	t.eq(j(await p.ev(`[${VIEW}.mode, ${VIEW}.getState().filter.status]`)), j(['outliner', ['Draft']]), 'the outliner, with the drafts only, as it was left');
});
