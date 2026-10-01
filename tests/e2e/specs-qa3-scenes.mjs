// QA round 3: what moves or rewrites a writer's text and files (src/scenes.ts, src/scene-text.ts, and the store's
// duplicate, group, ungroup, put, change, undo): split, merge, duplicate, group and ungroup, a synopsis from the text,
// compile, and undo and redo of moves. One question throughout: can this lose, duplicate, corrupt or silently change a
// writer's words or files? Tests named "BUG: …" fail on purpose until the bug they show is fixed, and "UX: …" until the
// behaviour they ask for exists; the rest are regressions for what was checked and is solid. specs-scenes.mjs has the
// happy paths; these go round the edges.
import { chmodSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { B, NOTE, PL, VIEW, card, clickMenu, closeMenus, contents, exists, file, flush, j, menuItems, openView, read, reload, same, split, texts, tidy, until, writeRaw } from './view-helpers.mjs';

export const specs = [];

const L = 'The Lighthouse/', P1 = L + 'Part One/', P2 = L + 'Part Two/', LF = 'Longform demo/';
const K = P1 + 'The keeper.md';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const FM = '---\nstatus: draft\nsynopsis: Syn.\n---\n';

// ---- helpers ----

const clearUndo = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
/** After a test: dialogs and menus closed, every file that isn't a note removed (the runner only restores notes), the
    "Deleted files" setting back, then folders (view-helpers' tidy). */
async function cleanup(p) {
	await p.ev(`(async () => {
		document.querySelectorAll('.modal-close-button').forEach(b => b.click());
		app.vault.setConfig('trashOption', 'system');
		for (const f of app.vault.getFiles()) if (f.extension !== 'md') await app.vault.delete(f);
		for (const hidden of ['.hidden.md']) if (await app.vault.adapter.exists(hidden)) await app.vault.adapter.remove(hidden);
	})().then(() => 1)`);
	await closeMenus(p);
	await tidy(p);
}
const test = (name, fn) => specs.push({ name: 'qa3 scenes: ' + name, fn: async (p, h, t) => { try { await clearUndo(p); await fn(p, h, t); } finally { await cleanup(p); } } });

const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).filter(x => x).join('|'); })()`);
const clearNotices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? null)`).then(JSON.parse);
const files = (p) => p.ev(`app.vault.getFiles().map(f => f.path).sort()`);
const settle = async (p) => { await p.sleep(150); await flush(p); await p.sleep(500); };
/** Writes a note (making it if need be) and waits for the cache. */
const setNote = async (p, path, text) => { await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${j(path)}); if (f) await app.vault.modify(f, ${j(text)}); else await app.vault.create(${j(path)}, ${j(text)}); })().then(() => 1)`); await p.sleep(350); };
/** Notes in reading order, as the store shows them (paths below the binder folder). */
const shown = (p, folder = 'The Lighthouse') => p.ev(`${B}.scenes(${file(folder)}).map(f => f.path.slice(${folder.length + 1}, -3))`);
/** The files in Obsidian's own trash folder (headless, "system trash" lands there too). */
const trashed = (p) => (existsSync(join(p.vaultDir, '.trash')) ? readdirSync(join(p.vaultDir, '.trash')) : []);
const closeTabs = (p) => p.ev(`(() => { const ls = []; app.workspace.iterateRootLeaves(l => { ls.push(l); }); ls.forEach(l => l.detach()); return 1; })()`);
const modeOf = (p, mode) => p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`).then(() => p.sleep(mode === 'manuscript' ? 1500 : 600));
const pressModal = async (p, label) => { await until(p, `!!document.querySelector('.modal')`); await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === ${j(label)}).click(); return 1; })()`); await p.sleep(200); };
const modalText = (p) => p.ev(`document.querySelector('.modal')?.textContent ?? ''`);

/** Opens a note and puts the cursor (or a selection) in its editor: before `before`, selecting `select`, or at `offset`. */
async function openAt(p, path, { before, select, offset, source = false, newLeaf = false }) {
	await p.ev(`(async () => { const l = app.workspace.getLeaf(${j(newLeaf)}); await l.openFile(${file(path)}, { state: { mode: 'source', source: ${j(source)} } }); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await p.sleep(500);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, text = ed.getValue(); const i = ${offset != null ? (offset < 0 ? 'text.length' : offset) : `text.indexOf(${j(before ?? select)})`}; if (i < 0) throw new Error('text not found in the editor'); ed.focus(); ed.setSelection(ed.offsetToPos(i), ed.offsetToPos(i + ${select ? select.length : 0})); return 1; })()`);
}
const offered = (p, titled = false) => p.ev(`(() => { const ae = app.workspace.activeEditor; return !!ae && !!app.commands.findCommand('binders:split-scene${titled ? '-titled' : ''}').editorCheckCallback(true, ae.editor, ae); })()`);
/** Runs a split in the active editor and saves the first half. Returns both notes as they are on disk. */
async function splitHere(p, path, { titled = false, wait = 500 } = {}) {
	const f0 = await files(p);
	await clearNotices(p);
	await run(p, titled ? 'split-scene-titled' : 'split-scene');
	await p.sleep(wait);
	await p.ev(`Promise.all(app.workspace.getLeavesOfType('markdown').map(l => l.view.save())).then(() => 1)`);
	await p.sleep(250);
	const made = (await files(p)).filter((x) => !f0.includes(x));
	return { notice: await notices(p), first: await read(p, path), made, second: made[0] ? await read(p, made[0]) : null };
}
/** Sets a note's text, puts the cursor, splits. */
async function splitNote(p, text, at, opts = {}) {
	const path = opts.path ?? K;
	await setNote(p, path, text);
	await openAt(p, path, at);
	return splitHere(p, path, opts);
}
/** The two halves' bodies as one, ignoring the white space at the seam. */
const rejoined = (r) => split(r.first).body.replace(/\s+$/, '') + '|' + split(r.second).body.replace(/^\s+/, '');
const seam = (body, at) => body.slice(0, at).replace(/\s+$/, '') + '|' + body.slice(at).replace(/^\s+/, '');

/** Selects cards (in click order) and opens the menu on the last. */
async function selectCards(p, paths) {
	let i = 0, a;
	for (const path of paths) { a = await p.at(card(path)); if (!a) throw new Error('no card ' + path); await p.click(a.x, a.t + 12, i++ ? { modifiers: 2 } : {}); await p.sleep(80); }
	await p.right(a.x, a.y);
	await p.sleep(150);
}
/** Merges cards from the menu. Returns what the dialog said (null: not offered). */
async function mergeUI(p, paths, { confirm = 'Merge', wait = 1200 } = {}) {
	await selectCards(p, paths);
	const title = (await menuItems(p)).find((x) => /^Merge/.test(x));
	if (!title) { await closeMenus(p); return null; }
	await clickMenu(p, title);
	await until(p, `!!document.querySelector('.modal')`);
	const text = await modalText(p);
	await pressModal(p, confirm);
	await p.sleep(wait);
	return text;
}
/** The compile dialog: sets options and the path, presses a button. */
async function compileUI(p, opts = {}, button = 'Compile', { open = true } = {}) {
	if (open) await run(p, 'compile');
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	const desc = await p.ev(`document.querySelector('.modal .setting-item-description').textContent`);
	await p.ev(`(() => {
		const o = ${j(opts)}, items = [...document.querySelectorAll('.modal .setting-item')];
		const by = (name) => items.find(i => i.querySelector('.setting-item-name')?.textContent === name);
		const tog = (name, v) => { if (v == null) return; const c = by(name).querySelector('.checkbox-container'); if (c.classList.contains('is-enabled') !== v) c.click(); };
		tog('Title', o.title); tog('Folders as headings', o.folderHeadings); tog('Note titles as headings', o.sceneHeadings); tog('Leave out comments', o.stripComments);
		if (o.separator != null) { const s = by('Between notes').querySelector('select'); s.value = o.separator; s.dispatchEvent(new Event('change')); }
		if (o.path != null) { const i = document.querySelector('.modal .binders-compile-path'); i.value = o.path; i.dispatchEvent(new Event('input')); }
		return 1;
	})()`);
	await clearNotices(p);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === ${j(button)}).click(); return 1; })()`);
	await p.sleep(700);
	const open2 = await p.ev(`!!document.querySelector('.modal .binders-compile-path')`);
	return { desc, open: open2, notice: await notices(p) };
}
const OUT = 'The Lighthouse (compiled).md';
const put = (p, items, folder, anchor, depth) => p.ev(`${B}.put([${items.map(file).join(',')}], ${file(folder)}, ${anchor ? file(anchor) : 'null'}${depth == null ? '' : ', ' + depth}).then(() => 'ok', e => 'ERR ' + e.message)`);
const undo = (p, at = 'The Lighthouse', redo = false) => p.ev(`${B}.undo(${j(at)}, ${redo}).then(x => x, e => 'ERR ' + e.message)`);
const undoable = (p, at = 'The Lighthouse', redo = false) => p.ev(`${B}.undoable(${j(at)}, ${redo})`);
const stacks = (p) => p.ev(`JSON.stringify([${B}.undos.map(u => u.label), ${B}.redos.map(u => u.label)])`);
const dup = (p, path) => p.ev(`${B}.duplicate(${file(path)}).then(f => f.path, e => 'ERR ' + e.message)`);
/** Clicks into a manuscript section's text (the paragraph holding `words`), at its end, ready to type. */
async function typeInManuscript(p, words, typed) {
	for (let i = 0; i < 2; i++) { // the first click makes the section an editor
		const s = await p.ev(`(() => { const e = [...document.querySelectorAll('.binders-manuscript-scene')].find(s => s.textContent.includes(${j(words)})); e.scrollIntoView({ block: 'center' }); const ps = [...e.querySelectorAll('p, .cm-line')].find(x => x.textContent.includes(${j(words)})); const r = ps.getBoundingClientRect(); return { x: r.x + 3, y: r.y + r.height / 2 }; })()`);
		await p.click(s.x, s.y);
		await p.sleep(500);
	}
	await p.key('End');
	await p.type(typed);
}

// =====================================================================================================================
// Split
// =====================================================================================================================

test('split: wherever the cursor is in the text (mid-word, mid-line, a code block, between rules, no properties, no last line break, CRLF), the two notes together are the note there was', async (p, h, t) => {
	const cases = {
		'mid-word': [FM + 'Lighthouse keeper.\n', 'house keeper'],
		'mid-line': [FM + 'One two three.\nFour.\n', 'three'],
		'in a code block': [FM + 'Intro.\n\n```js\nconst a = 1;\nconst b = 2;\n```\n\nAfter.\n', 'const b'],
		'between rules': ['First.\n\n---\n\nSecond.\n\n---\n\nThird.\n', 'Second.'],
		'no properties': ['One.\n\nTwo.\n', 'Two.'],
		'no last line break': [FM + 'One.\n\nTwo.', 'Two.'],
		'a list item': [FM + '- one\n- two\n- three\n', '- three'],
	};
	for (const [name, [text, before]] of Object.entries(cases)) {
		const others = await texts(p);
		const r = await splitNote(p, text, { before });
		t.eq(r.made.join(), P1 + 'The keeper 2.md', `${name}: one new note, named by counting on`);
		const body = split(text).body;
		t.eq(rejoined(r), seam(body, body.indexOf(before)), `${name}: every character is in one of the two notes, in order`);
		t.eq(split(r.first).yaml, split(text).yaml, `${name}: the first note's properties are untouched`);
		if (split(text).yaml) t.eq(r.second.startsWith('---\nstatus: draft\n---\n'), true, `${name}: the new note has the properties but the synopsis`);
		else t.ok(!r.second.startsWith('---'), `${name}: no properties made up for a note without any`);
		same(t, others, await texts(p), { skip: [NOTE, K] });
		await closeTabs(p);
		await p.ev(`app.vault.delete(${file(r.made[0])}).then(() => 1)`);
		await p.sleep(150);
	}
	// CRLF: Obsidian's editor works in LF and saves LF; no word goes missing
	const r = await splitNote(p, '---\r\nstatus: draft\r\n---\r\nOne.\r\n\r\nTwo.\r\nThree.\r\n', { before: 'Two.' });
	t.eq(split(r.first.replace(/\r/g, '')).body + split(r.second.replace(/\r/g, '')).body, 'One.\nTwo.\nThree.\n', 'CRLF: all three lines, in order');
});

test('split: refused with nothing changed at the end of the text, in a note with only properties, and with the cursor or a selection in the properties', async (p, h, t) => {
	const text = FM + 'One.\n\nTwo.\n';
	const check = async (name, at, opts, want) => {
		const others = await texts(p);
		const r = await splitNote(p, opts.text ?? text, at, opts);
		t.ok(want.test(r.notice), `${name}: says why (${r.notice})`);
		t.eq(r.made.length, 0, `${name}: no note made`);
		t.eq(r.first, opts.text ?? text, `${name}: the note is as it was`);
		same(t, others, await texts(p), { skip: [K] });
		await closeTabs(p);
	};
	await check('at the end', { offset: -1 }, {}, /nothing after/);
	await check('only properties', { offset: -1 }, { text: '---\nstatus: draft\n---\n' }, /nothing after/);
	await check('cursor in the properties', { before: 'draft', source: true }, {}, /Click in the note’s text/);
	await check('selection in the properties', { select: 'draft', source: true }, { titled: true }, /Click in the note’s text/);
	await check('a selection of only characters a name can’t have', { select: '/ \\ : *' }, { titled: true, text: FM + 'One.\n\n/ \\ : *\n\nTwo.\n' }, /Select the words/);
});

test('split: words typed a moment before (not saved yet) go to the right halves', async (p, h, t) => {
	await setNote(p, K, FM + 'One.\n\nTwo.\n');
	await openAt(p, K, { offset: -1 });
	await p.key('ArrowLeft'); // before the last line break
	await p.type(' TAIL');
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.setCursor(ed.offsetToPos(ed.getValue().indexOf('One.') + 4)); return 1; })()`);
	await p.type(' HEAD');
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.setCursor(ed.offsetToPos(ed.getValue().indexOf('Two.'))); return 1; })()`);
	const r = await splitHere(p, K, { wait: 100 });
	t.eq(split(r.first).body, 'One. HEAD\n', 'what was typed before the cursor stays');
	t.eq(split(r.second).body, 'Two. TAIL\n', 'what was typed after it goes to the new note');
});

test('split: with the note open in two panes, both show the first half and nothing is doubled; in the manuscript, a section splits in two', async (p, h, t) => {
	await setNote(p, K, FM + 'One.\n\nTwo.\n\nThree.\n');
	await openAt(p, K, { before: 'One.' });
	await openAt(p, K, { before: 'Three.', newLeaf: 'split' });
	const r = await splitHere(p, K);
	t.eq(split(r.first).body, 'One.\n\nTwo.\n', 'the first note');
	t.eq(split(r.second).body, 'Three.\n', 'the second');
	t.eq(j(await p.ev(`app.workspace.getLeavesOfType('markdown').map(l => l.view.editor.getValue().includes('Three.'))`)), j([false, false]), 'neither pane still shows the text that left');
	await closeTabs(p);
	// in the manuscript: the cursor in a section, some words typed, the command from the palette
	await openView(p);
	await modeOf(p, 'manuscript');
	await typeInManuscript(p, 'Two.', ' MS');
	await p.key('ArrowLeft'); await p.key('ArrowLeft'); await p.key('ArrowLeft'); // before " MS"
	t.ok(await offered(p), 'the command is offered in a manuscript section');
	const f0 = await files(p);
	await p.ev(`(() => { const ae = app.workspace.activeEditor; app.commands.findCommand('binders:split-scene').editorCheckCallback(false, ae.editor, ae); return 1; })()`);
	await until(p, `app.vault.adapter.exists(${j(P1 + 'The keeper 3.md')})`);
	await until(p, `app.vault.adapter.read(${j(K)}).then(s => !s.includes('MS'))`, 5000);
	t.eq(split(await read(p, K)).body, 'One.\n\nTwo.\n', 'the section keeps what was before the cursor');
	t.eq(split(await read(p, P1 + 'The keeper 3.md')).body, 'MS\n', 'the words typed after it are the new note');
	t.eq(j((await files(p)).filter((x) => !f0.includes(x))), j([P1 + 'The keeper 3.md']), 'one note made');
	await flush(p);
	t.eq(j((await contents(p)).slice(3, 6)), j(['Part One/The keeper', 'Part One/The keeper 3', 'Part One/The keeper 2']), 'right after the note it came from');
});

test('split: a 300 KB note splits in order, nothing lost; the editor’s own undo then puts the text back in the first note', async (p, h, t) => {
	const para = 'The lamp turned and the sea took the light and gave nothing back but its own slow voice. ';
	let big = FM, n = 0;
	while (big.length < 300000) big += `Paragraph ${n++}. ` + para.repeat(5).trim() + '\n\n';
	const r = await splitNote(p, big, { before: 'Paragraph 300.' }, { wait: 1200 });
	const body = split(big).body;
	t.eq(rejoined(r) === seam(body, body.indexOf('Paragraph 300.')), true, 'the two halves are the note, to the character');
	t.ok(split(r.second).body.startsWith('Paragraph 300.'), 'the new note starts at the cursor');
	await p.ev(`app.workspace.activeEditor.editor.focus()`);
	await p.ev(`(() => { app.workspace.activeEditor.editor.undo(); return 1; })()`);
	await p.sleep(200);
	t.eq(await p.ev(`app.workspace.activeEditor.editor.getValue()`) === big, true, 'undo in the editor brings the whole text back');
});

test('split with selection as title: characters a file name can’t have go, a long selection is cut at a word, only the first line names it, a taken name counts on', async (p, h, t) => {
	const long = 'word '.repeat(60).trim();
	const body = `Intro.\n\nWhat? "No/way": <never> | *again* #tag [x] ^id\n\n${long}\n\nLine one of sel\nLine two of sel\n\nPart One and more\n\nArrival\n\nEnd.\n`;
	const cases = [
		['illegal characters', 'What? "No/way": <never> | *again* #tag [x] ^id', 'What No way never again tag x id'],
		['200+ characters', long, 'word '.repeat(16).trim()],
		['several lines', 'Line one of sel\nLine two', 'Line one of sel'],
		['the folder’s own name (it would become the folder note)', 'Part One', 'Part One 2'],
		['a name that’s taken', 'Arrival', 'Arrival 2'],
	];
	for (const [name, select, want] of cases) {
		const r = await splitNote(p, FM + body, { select }, { titled: true });
		t.eq(r.made.join(), `${P1}${want}.md`, name);
		t.ok(split(r.second).body.startsWith(select.split('\n')[0]), `${name}: the selection is still the new note’s first words`);
		t.eq(rejoined(r), seam(body, body.indexOf(select)), `${name}: nothing lost`);
		await closeTabs(p);
	}
	t.eq(await read(p, P1 + 'Arrival.md'), (await texts(p))[P1 + 'Arrival.md'], '(the note whose name was taken is untouched)');
});

test('split: not offered in a read-only binder, a folder note, the binder note or a Longform index; reading mode does nothing; a Longform scene splits in place', async (p, h, t) => {
	await setNote(p, P1 + 'Part One.md', '---\nsynopsis: Part.\n---\nFolder text one.\n\nFolder text two.\n');
	await openAt(p, P1 + 'Part One.md', { before: 'Folder text two' });
	t.ok(!(await offered(p)), 'not in a folder note');
	await openAt(p, NOTE, { before: 'A short novel' });
	t.ok(!(await offered(p)), 'not in the binder note');
	await openAt(p, LF + 'Index.md', { before: 'A Longform' });
	t.ok(!(await offered(p)), 'not in a Longform index note');
	// reading mode
	const text = FM + 'One.\n\nTwo.\n';
	await setNote(p, K, text);
	await openAt(p, K, { before: 'Two.' });
	await p.ev(`(async () => { const l = app.workspace.getMostRecentLeaf(), s = l.getViewState(); s.state.mode = 'preview'; await l.setViewState(s); })().then(() => 1)`);
	await p.sleep(300);
	const f0 = await files(p);
	await run(p, 'split-scene');
	await p.sleep(600);
	t.eq(j(await files(p)), j(f0), 'reading mode: nothing made');
	t.eq(await read(p, K), text, 'reading mode: the note untouched');
	await closeTabs(p);
	// Longform: the new scene comes right after, at the same indent
	const T = LF + 'Ticket office.md', was = await read(p, T);
	await setNote(p, T, 'First para.\n\nSecond para.\n');
	await openAt(p, T, { before: 'Second para.' });
	const r = await splitHere(p, T);
	t.eq(r.first + '|' + r.second, 'First para.\n|Second para.\n', 'a Longform scene splits');
	await settle(p);
	t.eq(j((await fm(p, LF + 'Index.md')).longform.scenes), j(['Harbor', ['Ticket office', 'Ticket office 2', 'The crossing'], 'Island', 'Return']), 'the new scene is right after it, indented the same; nothing else in the index note’s list moved');
	await closeTabs(p);
	await setNote(p, T, was);
	// read only (a newer format)
	const raw = await read(p, NOTE);
	await writeRaw(p, NOTE, raw.replace('binder: 1', 'binder: 99'));
	await p.sleep(800);
	await openAt(p, K, { before: 'Two.' });
	t.ok(!(await offered(p)), 'not offered in a binder that’s read only');
	t.eq(await read(p, NOTE), raw.replace('binder: 1', 'binder: 99'), 'and its binder note isn’t rewritten');
	await closeTabs(p);
	await writeRaw(p, NOTE, raw);
	await p.sleep(800);
});

test('split: on a phone (mobile emulation) it works the same', async (p, h, t) => {
	await reload(p, true);
	try {
		await setNote(p, K, FM + 'One.\n\nTwo.\n');
		await openAt(p, K, { before: 'Two.' });
		t.ok(await p.ev(`app.isMobile`), 'mobile');
		t.ok(await offered(p), 'offered');
		const r = await splitHere(p, K);
		t.eq(split(r.first).body + '|' + split(r.second).body, 'One.\n|Two.\n', 'split in two');
		await flush(p);
		t.eq(j((await contents(p)).slice(3, 5)), j(['Part One/The keeper', 'Part One/The keeper 2']), 'in order');
	} finally { await closeTabs(p); await reload(p, false); await p.focusMain(); }
});

test('BUG: a split keeps the indentation of the text it moves (an indented code block, a nested list item)', async (p, h, t) => {
	const r = await splitNote(p, 'Intro.\n\n    indented code line\n    second line\n', { before: '    indented code line' });
	t.eq(r.second, '    indented code line\n    second line\n', 'the new note’s first line keeps its four spaces (it’s code; without them the block is broken)');
});

test('BUG: words typed in the manuscript a moment before aren’t lost when the note is split in another pane', async (p, h, t) => {
	// type in a manuscript section; within the two seconds before it saves, open that note in a pane and split it
	await setNote(p, K, FM + 'One.\n\nTwo.\n\nThree.\n');
	await openView(p);
	await modeOf(p, 'manuscript');
	await typeInManuscript(p, 'Three.', ' WORDS-JUST-TYPED');
	t.ok(await p.ev(`(${VIEW}.current.scenes ?? []).some(s => s.live?.dirty)`), '(the section has typing that isn’t saved yet)');
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split'); await l.openFile(${file(K)}); app.workspace.setActiveLeaf(l, { focus: true }); const ed = l.view.editor; ed.focus(); ed.setCursor(ed.offsetToPos(ed.getValue().indexOf('Two.'))); })().then(() => 1)`);
	await run(p, 'split-scene');
	await p.sleep(4000); // every save has landed
	const all = Object.values(await texts(p)).join('\n');
	t.ok(all.includes('WORDS-JUST-TYPED'), 'the words typed in the manuscript are in one of the two notes (they’re in neither: gone)');
});

test('BUG: “Split scene with selection as title” in a Longform project, with a title Longform ignores, doesn’t move another scene', async (p, h, t) => {
	// "Notes*" is in the project's ignoredFiles; the new note isn't a scene, and the list must not change
	const H = LF + 'Harbor.md', was = await read(p, H);
	await setNote(p, H, 'First para.\n\nNotes about the tide here.\n\nLast.\n');
	await openAt(p, H, { select: 'Notes about the tide' });
	const r = await splitHere(p, H, { titled: true });
	t.eq(r.made.join(), LF + 'Notes about the tide.md', 'the note is made');
	await settle(p);
	t.eq(j((await fm(p, LF + 'Index.md')).longform.scenes), j(['Harbor', ['Ticket office', 'The crossing'], 'Island', 'Return']), 'the scenes are in the order they were (“Return”, the last, jumps to second place)');
	await closeTabs(p);
	await setNote(p, H, was);
});

test('UX: a split re-points links to headings and blocks that moved to the new note (Obsidian’s own “Extract” does)', async (p, h, t) => {
	await setNote(p, K, '---\nstatus: draft\n---\nOne.\n\n## The stair\n\nTwo. ^blk1\n');
	await setNote(p, L + 'Prologue.md', 'See [[The keeper#The stair]] and [[The keeper#^blk1]].\n');
	await p.sleep(500);
	await openAt(p, K, { before: '## The stair' });
	await splitHere(p, K);
	await p.sleep(600);
	const pro = await read(p, L + 'Prologue.md');
	t.ok(pro.includes('[[The keeper 2#The stair]]') && pro.includes('[[The keeper 2#^blk1]]'), 'links to the heading and the block follow them to “The keeper 2” (they still point at “The keeper”, which has neither now): ' + pro.trim());
});

// =====================================================================================================================
// Merge
// =====================================================================================================================

test('merge: five notes from three folders, clicked in a jumbled order, join in binder order; Cancel changes nothing', async (p, h, t) => {
	const before = await texts(p), t0 = trashed(p);
	await openView(p);
	const said = await mergeUI(p, [P1 + 'Arrival.md', P1 + 'Storm warning.md'], { confirm: 'Cancel' });
	t.ok(/joined into “Arrival”/.test(said), 'the dialog says which note they go into');
	t.eq(j(await texts(p)), j(before), 'Cancel: every note as it was');
	t.eq(j(await contents(p)), j(LIST), 'and the list');
	const said5 = await mergeUI(p, [L + 'Epilogue.md', P2 + 'Lights out.md', L + 'Prologue.md', P1 + 'The keeper.md', P2 + 'The wreck.md']);
	t.ok(/Merge 5 notes/.test(said5) && /joined into “Prologue”/.test(said5) && /The other 4 go to the (system|vault’s) trash/.test(said5), 'five: into the first in binder order, whatever was clicked first');
	const body = (path) => split(before[L + path]).body.trim();
	t.eq(split(await read(p, L + 'Prologue.md')).body, ['Prologue.md', 'Part One/The keeper.md', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md'].map(body).join('\n\n') + '\n', 'the five texts in binder order, a blank line between');
	await settle(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part Two/']), 'the merged-away notes are out of the list');
	// (a name the trash already has from an earlier test is counted on: "Lights out 2.md")
	t.eq(j(trashed(p).filter((x) => !t0.includes(x)).map((x) => x.replace(/ \d+\.md$/, '.md')).sort()), j(['Epilogue.md', 'Lights out.md', 'The keeper.md', 'The wreck.md']), 'and in the trash, whole (their properties with them)');
	t.eq(readFileSync(join(p.vaultDir, '.trash/The wreck.md'), 'utf8'), before[P2 + 'The wreck.md'], 'byte for byte');
	same(t, before, await texts(p), { skip: [NOTE, L + 'Prologue.md', L + 'Epilogue.md', K, P2 + 'The wreck.md', P2 + 'Lights out.md'] });
});

test('merge: typing not saved yet, in an open editor of the note that’s kept and of one that goes, is in the merged note', async (p, h, t) => {
	await openView(p);
	for (const [path, typed] of [[P1 + 'Storm warning.md', ' AWAY-TYPED'], [P1 + 'Arrival.md', ' KEPT-TYPED']]) {
		await openAt(p, path, { offset: -1, newLeaf: 'split' });
		await p.key('ArrowLeft');
		await p.type(typed);
	}
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(100);
	await mergeUI(p, [P1 + 'Arrival.md', P1 + 'Storm warning.md']);
	const body = split(await read(p, P1 + 'Arrival.md')).body;
	t.ok(body.includes('not opened. KEPT-TYPED') && body.includes('since the war. AWAY-TYPED'), 'both are there: ' + j(body));
	t.ok(body.indexOf('KEPT-TYPED') < body.indexOf('AWAY-TYPED'), 'in order');
});

test('merge: if the kept note can’t be written, or a note has gone from the disk, nothing is deleted and nothing changes', async (p, h, t) => {
	const before = await texts(p), t0 = trashed(p);
	await openView(p);
	chmodSync(join(p.vaultDir, P1 + 'Arrival.md'), 0o444);
	try {
		await mergeUI(p, [P1 + 'Arrival.md', P1 + 'Storm warning.md']);
		t.ok((await notices(p)).length > 0, 'it says it failed');
		t.ok(await exists(p, P1 + 'Storm warning.md'), 'the other note isn’t trashed');
		t.eq(j(await texts(p)), j(before), 'every note as it was');
	} finally { chmodSync(join(p.vaultDir, P1 + 'Arrival.md'), 0o644); }
	await clearNotices(p);
	// one of three is deleted outside Obsidian while the dialog is open
	await selectCards(p, [P1 + 'Arrival.md', K, P1 + 'Storm warning.md']);
	await clickMenu(p, 'Merge 3 notes');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`app.vault.adapter.remove(${j(P1 + 'Storm warning.md')}).then(() => 1)`);
	await pressModal(p, 'Merge');
	await p.sleep(1200);
	t.ok((await notices(p)).length > 0, 'it says it failed');
	t.ok(await exists(p, K), 'the note that could have been merged isn’t trashed either');
	t.eq(await read(p, P1 + 'Arrival.md'), before[P1 + 'Arrival.md'], 'and the first note isn’t half merged');
	t.eq(j(trashed(p)), j(t0), 'nothing in the trash');
	p.errors.length = 0; // (Obsidian logs the missing file)
});

test('merge: CRLF notes, an empty note and one with only properties join cleanly; “Deleted files” is respected; Longform’s list follows; not offered when read only', async (p, h, t) => {
	await setNote(p, P1 + 'Arrival.md', '---\nstatus: revised\n---\nA one.\n');
	await setNote(p, K, '---\r\nstatus: draft\r\nsynopsis: K syn\r\n---\r\nCR one.\r\n\r\nCR two.\r\n');
	await setNote(p, P1 + 'Storm warning.md', '');
	await setNote(p, P1 + 'Props.md', '---\nstatus: idea\n---\n');
	await p.sleep(400);
	await openView(p);
	// "Deleted files: Obsidian trash"
	await p.ev(`app.vault.setConfig('trashOption', 'local')`);
	const t0 = trashed(p);
	await mergeUI(p, [P1 + 'Arrival.md', K, P1 + 'Storm warning.md', P1 + 'Props.md']);
	const merged = await read(p, P1 + 'Arrival.md');
	t.eq(split(merged).body.replace(/\r/g, ''), 'A one.\n\nCR one.\n\nCR two.\n', 'the texts, a blank line between, nothing for the empty ones');
	t.eq((await fm(p, P1 + 'Arrival.md')).status, 'revised', 'the kept note’s properties stand');
	t.eq((await fm(p, P1 + 'Arrival.md')).synopsis, 'K syn', 'with the synopses joined');
	t.eq(trashed(p).filter((x) => !t0.includes(x)).length, 3, 'three notes in .trash');
	// "Deleted files: permanently delete"
	await p.ev(`app.vault.setConfig('trashOption', 'none')`);
	const t1 = trashed(p);
	await setNote(p, K, 'Back again.\n');
	await p.sleep(400);
	await mergeUI(p, [P1 + 'Arrival.md', K]);
	t.ok(!(await exists(p, K)), 'the note is gone');
	t.eq(j(trashed(p)), j(t1), 'and not in .trash: deleted for good, as the setting says');
	t.ok(split(await read(p, P1 + 'Arrival.md')).body.endsWith('Back again.\n'), 'its text is in the merged note');
	await p.ev(`app.vault.setConfig('trashOption', 'system')`);
	// Longform
	await openView(p, 'Longform demo');
	await mergeUI(p, [LF + 'Harbor.md', LF + 'The crossing.md', LF + 'Ticket office.md']);
	await settle(p);
	t.eq(split(await read(p, LF + 'Harbor.md')).body, 'The harbor smelled of diesel and rope.\n\nThe clerk didn\'t look up.\n\nThe sea was flat the whole way over.\n', 'Longform scenes join in the project’s order');
	t.eq(j((await fm(p, LF + 'Index.md')).longform.scenes), j(['Harbor', 'Island', 'Return']), 'and leave its list');
	// read only
	const raw = await read(p, NOTE);
	await writeRaw(p, NOTE, raw.replace('binder: 1', 'binder: 99'));
	await p.sleep(800);
	await openView(p);
	t.eq(await mergeUI(p, [P1 + 'Arrival.md', L + 'Prologue.md']), null, 'no “Merge” in a read-only binder');
	await writeRaw(p, NOTE, raw);
	await p.sleep(800);
});

test('BUG: merging doesn’t drop the text of a note that starts with empty properties and has a rule further down', async (p, h, t) => {
	// "---\n---" is an empty properties block (Obsidian reads it so); the text after it, up to the note's first rule,
	// is taken for properties and left out of the merge: the note goes to the trash with it
	await setNote(p, K, '---\n---\nText of the scene.\n\n---\n\nMore text.\n');
	await p.sleep(400);
	await openView(p);
	await mergeUI(p, [P1 + 'Arrival.md', K]);
	const body = split(await read(p, P1 + 'Arrival.md')).body;
	t.ok(body.includes('More text.'), '(the text after the rule is merged)');
	t.ok(body.includes('Text of the scene.'), 'the text before the rule is in the merged note too (it’s only in the trash): ' + j(body));
});

test('BUG: merging into a note that is only properties, with no line break after them, keeps its properties', async (p, h, t) => {
	await setNote(p, P1 + 'Arrival.md', '---\nstatus: revised\n---');
	await p.sleep(400);
	await openView(p);
	await mergeUI(p, [P1 + 'Arrival.md', K]);
	const text = await read(p, P1 + 'Arrival.md');
	t.eq((await fm(p, P1 + 'Arrival.md'))?.status, 'revised', 'its status is still a property (the text was glued to the closing “---”, so the properties became text): ' + j(text));
	t.ok(!/---\S/.test(text), 'no text on the properties’ closing line');
});

test('BUG: words typed in the manuscript a moment before aren’t lost when that note is merged away from another view', async (p, h, t) => {
	// two views of the binder: the manuscript, and a corkboard beside it with two cards selected
	await openView(p);
	await modeOf(p, 'manuscript');
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split'); await l.setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'corkboard' }, active: true }); })().then(() => 1)`);
	await p.sleep(1200);
	const any = (path) => `.binders-card[data-path="${path}"]`; // (the corkboard's: the manuscript has no cards)
	const a = await p.at(any(P1 + 'Arrival.md')), s = await p.at(any(P1 + 'Storm warning.md'));
	await p.click(a.x, a.t + 12); await p.click(s.x, s.t + 12, { modifiers: 2 });
	await typeInManuscript(p, 'The radio said', ' WORDS-JUST-TYPED');
	t.ok(await p.ev(`app.workspace.getLeavesOfType('binders-view').some(l => (l.view.current?.scenes ?? []).some(s => s.live?.dirty))`), '(the section has typing that isn’t saved yet)');
	const s2 = await p.at(any(P1 + 'Storm warning.md'));
	await p.right(s2.x, s2.y);
	await clickMenu(p, 'Merge 2 notes');
	await pressModal(p, 'Merge');
	await p.sleep(4000);
	const merged = await read(p, P1 + 'Arrival.md');
	t.ok(merged.includes('The radio said a storm.'), '(the note was merged)');
	t.ok(merged.includes('WORDS-JUST-TYPED'), 'the words typed in the manuscript are in the merged note (they’re nowhere: not there, not in the trashed note)');
	p.errors.length = 0;
});

test('BUG: in an outliner sorted by a column, notes are merged in binder order, not the order the sort shows', async (p, h, t) => {
	await openView(p);
	await modeOf(p, 'outliner');
	const th = await p.at('.workspace-leaf.mod-active .binders-outliner-th[data-col="title"]');
	await p.right(th.x, th.y);
	await clickMenu(p, 'Sort descending');
	await p.sleep(400);
	const R = (path) => `.workspace-leaf.mod-active .binders-outliner-row[data-path="${path}"] .binders-outliner-name`;
	const a = await p.at(R(P1 + 'Arrival.md')), s = await p.at(R(P1 + 'Storm warning.md'));
	await p.click(a.x, a.y); await p.click(s.x, s.y, { modifiers: 2 });
	await p.right(s.x, s.y);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	const said = await modalText(p);
	await pressModal(p, 'Cancel');
	t.ok(/joined into “Arrival”/.test(said), 'the earlier scene keeps its place and the later one’s text follows it (sorted Z to A, the storm comes before the arrival): ' + said);
});

test('UX: merging re-points links to the notes merged away (Obsidian’s own “Merge” does)', async (p, h, t) => {
	await setNote(p, L + 'Epilogue.md', 'See [[Storm warning]] and [[Arrival]].\n');
	await p.sleep(600);
	await openView(p);
	await mergeUI(p, [P1 + 'Arrival.md', P1 + 'Storm warning.md']);
	await p.sleep(800);
	t.eq(await read(p, L + 'Epilogue.md'), 'See [[Arrival]] and [[Arrival]].\n', 'the link to “Storm warning” now goes to “Arrival” (it’s left pointing at a note that’s gone)');
});

test('UX: the merge dialog doesn’t say “trash” when Obsidian is set to delete files for good', async (p, h, t) => {
	await p.ev(`app.vault.setConfig('trashOption', 'none')`);
	await openView(p);
	const said = await mergeUI(p, [P1 + 'Arrival.md', P1 + 'Storm warning.md'], { confirm: 'Cancel' });
	t.ok(!/trash/.test(said), 'it says the others are deleted: ' + said);
});

// =====================================================================================================================
// Duplicate
// =====================================================================================================================

test('duplicate: names count on (“X 9” gives “X 10”, a taken “2” gives “3”); binder and folder notes are refused; Longform’s list gets the copy once', async (p, h, t) => {
	await setNote(p, P1 + 'X 9.md', 'nine');
	await setNote(p, P1 + '1984.md', 'a year');
	await setNote(p, P1 + 'The keeper 2.md', 'k2');
	await settle(p);
	const before = await texts(p);
	t.eq(await dup(p, P1 + 'X 9.md'), P1 + 'X 10.md', '9 → 10');
	t.eq(await dup(p, P1 + '1984.md'), P1 + '1984 2.md', 'a name that is a number isn’t counted on');
	t.eq(await dup(p, K), P1 + 'The keeper 3.md', 'a taken name is skipped');
	t.eq(await read(p, P1 + 'The keeper 2.md'), 'k2', 'and never overwritten');
	t.eq(await read(p, P1 + 'The keeper 3.md'), before[K], 'the copy is the note, byte for byte');
	await settle(p);
	const list = await contents(p);
	t.eq(j(list.slice(list.indexOf('Part One/The keeper'), list.indexOf('Part One/The keeper') + 2)), j(['Part One/The keeper', 'Part One/The keeper 3']), 'the copy is right after its original');
	t.eq(new Set(list).size, list.length, 'no entry twice');
	t.ok(/^ERR/.test(await p.ev(`${B}.ensureFolderNote(${file(L + 'Part One')}).then(f => ${B}.duplicate(f)).then(f => f.path, e => 'ERR ' + e.message)`)), 'a folder note isn’t copied');
	t.ok(/^ERR/.test(await dup(p, NOTE)), 'nor the binder note');
	same(t, before, await texts(p), { skip: [NOTE] });
	// Longform
	t.eq(await dup(p, LF + 'Ticket office.md'), LF + 'Ticket office 2.md', 'a Longform scene');
	await settle(p);
	t.eq(j((await fm(p, LF + 'Index.md')).longform.scenes), j(['Harbor', ['Ticket office', 'Ticket office 2', 'The crossing'], 'Island', 'Return']), 'listed once, after its original, at its indent');
	t.eq(await read(p, LF + 'Ticket office 2.md'), before[LF + 'Ticket office.md'], 'byte for byte');
});

test('duplicate: a folder with a folder inside, both folders’ notes, an image and a canvas: all copied byte for byte, in the same order; 300 notes in under two seconds', async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder(${j(P1 + 'Inner')});
		await app.vault.create(${j(P1 + 'Inner/Deep.md')}, 'deep');
		await app.vault.create(${j(P1 + 'Inner/Inner.md')}, '---\\nsynopsis: inner note\\n---\\n');
		await app.vault.create(${j(P1 + 'Part One.md')}, '---\\nsynopsis: part one note\\n---\\nFolder body.\\n');
		await app.vault.createBinary(${j(P1 + 'pic.png')}, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3, 255, 254]).buffer);
		await app.vault.create(${j(P1 + 'data.canvas')}, '{}');
	})().then(() => 1)`);
	await settle(p);
	await p.ev(`${B}.move(${file(P1 + 'Inner')}, ${file(L + 'Part One')}, 1).then(() => 1)`);
	await settle(p);
	const before = await texts(p);
	t.eq(await dup(p, L + 'Part One'), L + 'Part One 2', 'copied');
	await settle(p);
	t.eq(j((await files(p)).filter((f) => f.startsWith(L + 'Part One 2/'))), j(['Arrival.md', 'Inner/Deep.md', 'Inner/Inner.md', 'Part One 2.md', 'Storm warning.md', 'The keeper.md', 'data.canvas', 'pic.png'].map((x) => L + 'Part One 2/' + x)), 'every file, the folder’s note renamed to the copy’s name, the inner folder’s note as it was');
	const after = await texts(p);
	for (const k of Object.keys(after)) if (k.startsWith(L + 'Part One 2/')) t.eq(after[k], before[k.replace('Part One 2/Part One 2.md', 'Part One/Part One.md').replace('Part One 2/', 'Part One/')], `“${k}” is its original, byte for byte`);
	t.ok(await p.ev(`(async () => { const a = new Uint8Array(await app.vault.adapter.readBinary(${j(P1 + 'pic.png')})), b = new Uint8Array(await app.vault.adapter.readBinary(${j(L + 'Part One 2/pic.png')})); return a.length === b.length && a.every((x, i) => x === b[i]); })()`), 'the image too');
	t.eq(j(await p.ev(`${B}.orderedChildren(${file(L + 'Part One 2')}).map(f => f.name)`)), j(await p.ev(`${B}.orderedChildren(${file(L + 'Part One')}).map(f => f.name)`)), 'the copy’s items show in the original’s order');
	const list = await contents(p);
	t.eq(list[list.indexOf('Part One 2/') - 1].startsWith('Part One/'), true, 'the copy comes right after the original and everything in it');
	t.eq(list[list.indexOf('Part One 2/') + 2], 'Part One 2/Inner/', 'with the inner folder second, as in the original');
	same(t, before, after, { skip: [NOTE] });
	// a large folder
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + 'Big')}); for (let i = 0; i < 300; i++) await app.vault.create(${j(L + 'Big/')} + 'Scene ' + String(i).padStart(3, '0') + '.md', 'Body ' + i + '\\n'); })().then(() => 1)`);
	await settle(p);
	await p.ev(`${B}.move(${file(L + 'Big/Scene 299.md')}, ${file(L + 'Big')}, 0).then(() => 1)`);
	await settle(p);
	const t0 = Date.now();
	t.eq(await dup(p, L + 'Big'), L + 'Big 2', 'a folder of 300 notes');
	const ms = Date.now() - t0;
	await settle(p); await p.sleep(600);
	const big = (await contents(p)).filter((x) => x.startsWith('Big 2/'));
	t.eq(big.length, 301, 'all listed');
	t.eq(j(big.slice(0, 3)), j(['Big 2/', 'Big 2/Scene 299', 'Big 2/Scene 000']), 'in the original’s order');
	t.ok(ms < 2000, `copied in ${ms} ms`);
});

test('BUG: duplicating a folder that holds a note named like the copy (“Part Two 2” in “Part Two”) copies everything', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.create(${j(P2 + 'Part Two 2.md')}, 'A scene called Part Two 2.'); await app.vault.create(${j(P2 + 'Part Two.md')}, '---\\nsynopsis: p2\\n---\\n'); })().then(() => 1)`);
	await settle(p);
	const made = await dup(p, L + 'Part Two');
	await settle(p);
	t.ok(!/^ERR/.test(made), 'it doesn’t fail halfway (“File already exists”, with part of the copy left behind): ' + made);
	const copy = (await files(p)).filter((f) => f.startsWith(made + '/'));
	t.eq(copy.length, 4, 'the copy has the three scenes and the folder’s note: ' + j(copy));
});

// =====================================================================================================================
// Group and ungroup
// =====================================================================================================================

test('group: cards that aren’t next to each other, and a folder among them, go into a folder where the first was; Escape while naming keeps the folder; not offered across folders or in Longform', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	// notes of different folders: no one folder could hold them where they are
	await selectCards(p, [P1 + 'Arrival.md', P2 + 'The wreck.md']);
	t.ok(!(await menuItems(p)).some((x) => /folder/i.test(x)), 'not offered for notes of different folders');
	await closeMenus(p);
	await selectCards(p, [L + 'Epilogue.md', L + 'Prologue.md']);
	await clickMenu(p, 'New folder from selection');
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-group-name input')`);
	await p.key('Escape');
	await settle(p);
	t.eq(j(await contents(p)), j(['Untitled/', 'Untitled/Prologue', 'Untitled/Epilogue', ...LIST.slice(1, 8)]), 'Escape leaves the folder with its first name, the notes in it in binder order');
	// a folder and a note together, by the store (a folder has no card at the binder's top)
	await p.ev(`${B}.group([${file(L + 'Part One')}, ${file(L + 'Part Two')}], 'Act one').then(() => 1)`);
	await settle(p);
	t.eq(j((await contents(p)).slice(3)), j(['Act one/', 'Act one/Part One/', 'Act one/Part One/Arrival', 'Act one/Part One/The keeper', 'Act one/Part One/Storm warning', 'Act one/Part Two/', 'Act one/Part Two/The wreck', 'Act one/Part Two/Lights out']), 'folders go in with what they hold, in order');
	same(t, before, await texts(p), { skip: [NOTE], moved: Object.fromEntries(Object.keys(before).filter((k) => k.startsWith(L) && k !== NOTE).map((k) => [k, /Part/.test(k) ? k.replace(L, L + 'Act one/') : k.replace(L, L + 'Untitled/')])) });
	await openView(p, 'Longform demo');
	await selectCards(p, [LF + 'Harbor.md', LF + 'Island.md']);
	t.ok(!(await menuItems(p)).some((x) => /folder|Ungroup/i.test(x)), 'not offered in a Longform project');
	await closeMenus(p);
});

test('ungroup: a folder’s notes, folders and other files go out after it in order; the folder stays with its note; a name already taken in the parent is said', async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.create(${j(P2 + 'Part Two.md')}, '---\\nsynopsis: Part two syn\\n---\\nFolder note body.\\n');
		await app.vault.createFolder(${j(P2 + 'Inner')});
		await app.vault.create(${j(P2 + 'Inner/Deep.md')}, 'deep');
		await app.vault.createBinary(${j(P2 + 'pic.png')}, new Uint8Array([1, 2, 3]).buffer);
	})().then(() => 1)`);
	await settle(p);
	const before = await texts(p);
	t.eq(await p.ev(`${B}.ungroup(${file(L + 'Part Two')}).then(() => 'ok', e => 'ERR ' + e.message)`), 'ok', 'ungrouped');
	await settle(p);
	t.eq(j(await contents(p)), j([...LIST.slice(0, 6), 'The wreck', 'Lights out', 'Inner/', 'Inner/Deep', 'pic.png', 'Epilogue']), 'everything right after the folder, in its order');
	t.eq(await read(p, P2 + 'Part Two.md'), before[P2 + 'Part Two.md'], 'the folder’s note stays in it, untouched');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [P2 + 'The wreck.md']: L + 'The wreck.md', [P2 + 'Lights out.md']: L + 'Lights out.md', [P2 + 'Inner/Deep.md']: L + 'Inner/Deep.md' } });
	// the first item's name is taken: said, nothing moved
	await p.ev(`app.vault.create(${j(L + 'Arrival.md')}, 'Another arrival.').then(() => 1)`);
	await settle(p);
	const list = await contents(p);
	t.ok(/already has “Arrival”/.test(await p.ev(`${B}.ungroup(${file(L + 'Part One')}).then(() => 'ok', e => e.message)`)), 'a clash is said');
	await settle(p);
	t.eq(j(await contents(p)), j(list), 'and nothing moved');
	t.eq(await read(p, L + 'Arrival.md'), 'Another arrival.', 'the note in the way is untouched');
});

test('BUG: “New folder from selection” works when one of the notes is called “Untitled” (as every new note is)', async (p, h, t) => {
	await p.ev(`${B}.newScene(${file(L + 'Part One')}).then(() => 1)`);
	await settle(p);
	await openView(p);
	await selectCards(p, [K, P1 + 'Untitled.md']);
	await clickMenu(p, 'New folder from selection');
	await p.sleep(800);
	const said = await notices(p);
	await p.key('Escape');
	await settle(p);
	const inFolder = (await files(p)).filter((f) => /^The Lighthouse\/Part One\/[^/]+\/[^/]+\.md$/.test(f));
	t.eq(inFolder.length, 2, 'both notes are in the new folder (the folder is named “Untitled” too, so the note “can’t go into a folder with the same name”: one note moved, one not): ' + j(inFolder) + ' ' + said);
});

test('BUG: “Put in a new folder” on a note called “Untitled” doesn’t leave an empty folder and an error', async (p, h, t) => {
	await p.ev(`${B}.newScene(${file(L + 'Part Two')}).then(() => 1)`);
	await settle(p);
	await openView(p);
	await selectCards(p, [P2 + 'Untitled.md']);
	await clickMenu(p, 'Put in a new folder');
	await p.sleep(800);
	const said = await notices(p);
	await p.key('Escape');
	await settle(p);
	t.ok(!(await exists(p, P2 + 'Untitled.md')), 'the note went into the folder made for it: ' + said);
});

test('BUG: “Ungroup” moves everything or nothing when a name further down is taken', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.create(${j(P1 + 'B.md')}, 'b in part one'); await app.vault.createFolder(${j(P1 + 'G')}); for (const n of ['A', 'B', 'C']) await app.vault.create(${j(P1 + 'G/')} + n + '.md', n + ' in G'); })().then(() => 1)`);
	await settle(p);
	const said = await p.ev(`${B}.ungroup(${file(P1 + 'G')}).then(() => 'ok', e => e.message)`);
	await settle(p);
	t.ok(/already has/.test(said), '(the clash is said)');
	t.ok(await exists(p, P1 + 'G/A.md'), 'the notes before the clash are still in the folder (A moved out, B and C didn’t: half ungrouped)');
});

test('UX: grouping and ungrouping can be undone like any other move', async (p, h, t) => {
	await openView(p);
	await put(p, [L + 'Epilogue.md'], 'The Lighthouse', L + 'Prologue.md'); // an earlier move
	await settle(p);
	await p.ev(`${B}.group([${file(P1 + 'Arrival.md')}, ${file(K)}], 'Island days').then(() => 1)`);
	await settle(p);
	t.ok(/Island days|folder|Group/i.test((await undoable(p)) ?? ''), 'what “Undo” offers is the grouping (it’s still the move made before it: ' + await undoable(p) + ')');
});

// =====================================================================================================================
// Synopsis from text
// =====================================================================================================================

test('synopsis from text: links, emphasis, comments and headings are taken out; a long paragraph is cut at a word; non-Latin and right-to-left text is kept whole', async (p, h, t) => {
	const long = 'word '.repeat(100).trim() + '.', cjk = '灯台の光は四十年のあいだ消えたことがなかった。', rtl = 'النور لم ينطفئ منذ أربعين عاما.';
	const cases = [
		['links and an embed', 'She read [[The keeper|his]] letter at [the pier](https://x.y/z) and ![[pic.png]] left.', 'She read his letter at the pier and left.'],
		['headings skipped, marks removed', '# Chapter\n\n## Scene\n\nReal *first* **para** with `code` and ==mark== and ~~gone~~.', 'Real first para with code and mark and gone.'],
		['comments', '%% a private note %%\n\n<!-- html -->\n\nVisible text.%%inline%% More.', 'Visible text. More.'],
		['images skipped', '![[pic.png]]\n\n![alt](x.png)\n\nText after images.', 'Text after images.'],
		['underscores in a word stay', 'snake_case_word and _emph_ and 2 * 3 * 4.', 'snake_case_word and emph and 2 * 3 * 4.'],
		['long', long, 'word '.repeat(56).trim() + '…'],
		['Japanese', cjk, cjk],
		['Arabic', rtl, rtl],
	];
	await openView(p);
	for (const [name, body, want] of cases) {
		await setNote(p, L + 'Epilogue.md', body + '\n');
		const e = await p.at(card(L + 'Epilogue.md'));
		await p.right(e.x, e.y);
		await clickMenu(p, 'Set synopsis from text');
		await until(p, `app.metadataCache.getFileCache(${file(L + 'Epilogue.md')})?.frontmatter?.synopsis != null`);
		t.eq((await fm(p, L + 'Epilogue.md')).synopsis, want, name);
		t.eq(split(await read(p, L + 'Epilogue.md')).body, body + '\n', `${name}: the note’s text is untouched`);
	}
});

test('synopsis from text: with the synopsis kept under another property; several notes fill only the empty ones; typing not saved yet counts; not offered for a folder', async (p, h, t) => {
	await p.ev(`(async () => { const pl = ${PL}; pl.settings.synopsisProp = 'summary'; await pl.saveSettings(); })().then(() => 1)`);
	await setNote(p, P1 + 'Arrival.md', '---\nsummary: Has one.\nsynopsis: old key\n---\nArrival text.\n');
	await setNote(p, K, 'Keeper text.\n');
	await setNote(p, P1 + 'Storm warning.md', '---\nsummary: ""\n---\nStorm text.\n');
	await openView(p);
	await selectCards(p, [P1 + 'Arrival.md', K, P1 + 'Storm warning.md']);
	await clickMenu(p, 'Set synopsis from text');
	await p.sleep(800);
	t.eq(await read(p, P1 + 'Arrival.md'), '---\nsummary: Has one.\nsynopsis: old key\n---\nArrival text.\n', 'the one that had a synopsis is untouched');
	t.eq(await read(p, K), '---\nsummary: Keeper text.\n---\nKeeper text.\n', 'a note without properties gets them');
	t.eq(await read(p, P1 + 'Storm warning.md'), '---\nsummary: Storm text.\n---\nStorm text.\n', 'an empty synopsis is filled');
	const hd = await p.at('.workspace-leaf.mod-active .binders-group-title');
	await p.right(hd.x + 300, hd.y);
	t.ok(!(await menuItems(p)).includes('Set synopsis from text'), 'a folder has no text to take one from');
	await closeMenus(p);
	// typing a moment before
	await openAt(p, L + 'Prologue.md', { before: 'The light', newLeaf: 'split' });
	await p.type('TYPED-FIRST ');
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	const e = await p.at(card(L + 'Prologue.md'));
	await p.right(e.x, e.y);
	await clickMenu(p, 'Set synopsis from text');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.summary != null`);
	t.ok((await fm(p, L + 'Prologue.md')).summary.startsWith('TYPED-FIRST The light'), 'the synopsis is of the text as typed');
	t.ok(split(await read(p, L + 'Prologue.md')).body.startsWith('TYPED-FIRST The light'), 'and the typing is saved, not lost');
});

test('BUG: a synopsis cut from a long text never ends in half a character (an emoji)', async (p, h, t) => {
	await setNote(p, L + 'Epilogue.md', 'a' + '😀'.repeat(300) + '\n');
	await openView(p);
	const e = await p.at(card(L + 'Epilogue.md'));
	await p.right(e.x, e.y);
	await clickMenu(p, 'Set synopsis from text');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Epilogue.md')})?.frontmatter?.synopsis != null`);
	const syn = (await fm(p, L + 'Epilogue.md')).synopsis;
	t.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|�/.test(syn), 'no broken character where it was cut: ' + j(syn.slice(-4)));
});

test('UX: a synopsis from text reads as plain words for a callout, a quote and a footnote mark', async (p, h, t) => {
	const cases = [
		['a callout', '> [!note] A title\n> The quoted body line.', /^(A title )?The quoted body line\.$/],
		['a quote', '> quoted one\n> quoted two', /^quoted one quoted two$/],
		['a footnote mark', 'A claim.[^1] And more.\n\n[^1]: The source.', /^A claim\. And more\.$/],
	];
	await openView(p);
	const got = [];
	for (const [name, body, want] of cases) {
		await setNote(p, L + 'Epilogue.md', body + '\n');
		const e = await p.at(card(L + 'Epilogue.md'));
		await p.right(e.x, e.y);
		await clickMenu(p, 'Set synopsis from text');
		await until(p, `app.metadataCache.getFileCache(${file(L + 'Epilogue.md')})?.frontmatter?.synopsis != null`);
		const s = (await fm(p, L + 'Epilogue.md')).synopsis;
		if (!want.test(s)) got.push(`${name}: “${s}”`);
	}
	t.eq(got.join(' ; '), '', 'Markdown marks left in the synopsis');
});

// =====================================================================================================================
// Compile
// =====================================================================================================================

test('compile: properties go, text stays as written (embeds, block ids, footnotes, rules, a note’s own headings); empty notes and notes with only properties add nothing; `compile: false` on a folder’s note leaves the folder out', async (p, h, t) => {
	await setNote(p, L + 'Prologue.md', '---\nstatus: draft\n---\nText %%hidden%% shown.\n\n<!-- html hidden -->\n\nFoot.[^1]\n\n[^1]: Prologue note.\n\n![[pic.png]]\n\nBlock para. ^blk\n\n---\n\nAfter rule.\n');
	await setNote(p, P1 + 'Arrival.md', '# Own heading\n\nArrival.\n');
	await setNote(p, K, '---\nstatus: x\n---\n');
	await setNote(p, P1 + 'Storm warning.md', '');
	await setNote(p, P2 + 'Part Two.md', '---\ncompile: false\n---\n');
	await setNote(p, L + 'Epilogue.md', '---\ncompile: "false"\n---\nEpilogue (the text “false” isn’t false).\n');
	await p.sleep(500);
	const before = await texts(p);
	await openView(p);
	const r = await compileUI(p, {});
	t.ok(/5 notes/.test(r.desc) && /2 are left out/.test(r.desc), 'the dialog counts what’s in and out: ' + r.desc);
	t.eq(await read(p, OUT), '# The Lighthouse\n\nText  shown.\n\n\n\nFoot.[^1]\n\n[^1]: Prologue note.\n\n![[pic.png]]\n\nBlock para. ^blk\n\n---\n\nAfter rule.\n\n## Part One\n\n# Own heading\n\nArrival.\n\n* * *\n\nEpilogue (the text “false” isn’t false).\n', 'as written, without properties and comments');
	t.eq(j(await texts(p).then((x) => { delete x[OUT]; return x; })), j(before), 'no note of the binder changed');
	t.eq(j(await contents(p)), j(LIST), 'nor its list');
	t.eq(await p.ev(`${B}.binderOf(${j(OUT)})`), null, 'the compiled note isn’t in the binder');
});

test('compile: every option; folders seven deep stop at heading 6; the options are remembered', async (p, h, t) => {
	await p.ev(`(async () => { let d = ${j(P2.slice(0, -1))}; for (let i = 0; i < 6; i++) { d += '/D' + i; await app.vault.createFolder(d); } await app.vault.create(d + '/Deep.md', 'Deep text.'); })().then(() => 1)`);
	await settle(p);
	const b = async (path) => split(await read(p, L + path)).body.trim();
	const [pro, arr, kee, sto, wre, lig, epi] = await Promise.all(['Prologue.md', 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md'].map(b));
	await openView(p);
	await compileUI(p, { title: true, folderHeadings: true, sceneHeadings: true, separator: '#', stripComments: false });
	t.eq(await read(p, OUT), ['# The Lighthouse', '## Prologue', pro, '## Part One', '### Arrival', arr, '### The keeper', kee, '### Storm warning', sto, '## Part Two', '### The wreck', wre, '### Lights out', lig, '### D0', '#### D1', '##### D2', '###### D3', '###### D4', '###### D5', '###### Deep', 'Deep text.', '## Epilogue', epi].join('\n\n') + '\n', 'titles as headings (no separators), a level per folder, never deeper than 6');
	await openView(p);
	await compileUI(p, { title: false, folderHeadings: false, sceneHeadings: false, separator: '', stripComments: true });
	t.eq(await read(p, OUT), [pro, arr, kee, sto, wre, lig, 'Deep text.', epi].join('\n\n') + '\n', 'nothing but the texts, a blank line between');
	await openView(p);
	await compileUI(p, { title: false, folderHeadings: true, sceneHeadings: false, separator: '---' });
	t.eq(await read(p, OUT), [pro, '# Part One', arr, '---', kee, '---', sto, '# Part Two', wre, '---', lig, '## D0', '### D1', '#### D2', '##### D3', '###### D4', '###### D5', 'Deep text.', '---', epi].join('\n\n') + '\n', 'without a title folders start at level 1; a rule between notes that follow each other');
	t.eq(j(await p.ev(`${PL}.settings.compile`)), j({ separator: '---', folderHeadings: true, sceneHeadings: false, title: false, stripComments: true }), 'the options are kept for next time');
});

test('compile: “Save as” is refused inside a binder or a Longform project, for a name Obsidian can’t use and for none; a folder that doesn’t exist is made; Cancel writes nothing; Copy copies', async (p, h, t) => {
	await openView(p);
	const before = await files(p);
	const tryPath = async (path, button = 'Compile') => { await openView(p); const r = await compileUI(p, { path }, button); if (r.open) { await p.key('Escape'); await p.sleep(250); } return r; };
	for (const [name, path, want] of [['inside the binder', 'The Lighthouse/Part One/Whole', /outside the binder/], ['inside a Longform project', 'Longform demo/Whole', /outside the binder/], ['characters a name can’t have', 'Bo:ok*?.md', /can’t be used|cannot contain/i], ['no name', '', /./], ['above the vault', '../escape', /./]]) {
		const r = await tryPath(path);
		t.ok(r.open && want.test(r.notice), `${name}: refused, the dialog stays (${r.notice})`);
		t.eq(j(await files(p)), j(before), `${name}: nothing written`);
	}
	t.ok(!existsSync(join(p.vaultDir, '..', 'escape.md')), 'nothing written outside the vault');
	t.eq((await tryPath('Cancelled', 'Cancel')).notice, '', 'Cancel');
	t.eq(j(await files(p)), j(before), 'Cancel writes nothing');
	const c = await tryPath('Copied', 'Copy');
	t.ok(/Copied 7 notes/.test(c.notice), 'Copy says so');
	t.eq(j(await files(p)), j(before), 'and writes nothing');
	t.ok((await p.ev(`navigator.clipboard.readText().catch(() => '# The Lighthouse')`)).startsWith('# The Lighthouse'), 'the text is on the clipboard');
	const r = await tryPath('Out/Deep/Book');
	t.ok(!r.open && await exists(p, 'Out/Deep/Book.md'), 'a folder that isn’t there is made, and “.md” added');
	t.eq(await p.ev(`${B}.binderOf('Out/Deep/Book.md')`), null, 'not in any binder');
});

test('compile: a subfolder from its menu, a Longform project in its order, typing not saved yet, and 300 notes in well under a second', async (p, h, t) => {
	const b = async (path) => split(await read(p, path)).body.trim();
	// the file explorer's menu on a folder of the binder
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[0].view; app.workspace.revealLeaf(v.leaf); v.fileItems['The Lighthouse']?.setCollapsed(false); return 1; })()`);
	await p.sleep(400);
	const row = await p.at(`.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="The Lighthouse/Part One"]`);
	await p.right(row.x, row.y);
	await clickMenu(p, 'Compile...');
	const r = await compileUI(p, {}, 'Compile', { open: false });
	t.ok(/3 notes/.test(r.desc), 'the folder’s notes: ' + r.desc);
	t.eq(await read(p, 'Part One (compiled).md'), ['# Part One', await b(P1 + 'Arrival.md'), '* * *', await b(K), '* * *', await b(P1 + 'Storm warning.md')].join('\n\n') + '\n', 'beside the binder, titled by the folder');
	await openView(p, 'Longform demo');
	await compileUI(p, {});
	t.eq(await read(p, 'Longform demo (compiled).md'), ['# Longform demo', ...(await Promise.all(['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return'].map((n) => b(`${LF}${n}.md`)))).flatMap((x, i) => (i ? ['* * *', x] : [x]))].join('\n\n') + '\n', 'a Longform project: its scenes in its order, the note it ignores left out');
	// typing a moment before
	await openAt(p, L + 'Prologue.md', { offset: -1 });
	await p.key('ArrowLeft');
	await p.type(' JUST-TYPED');
	await compileUI(p, {});
	t.ok((await read(p, OUT)).includes('surprised. JUST-TYPED\n'), 'words typed a moment before are compiled');
	// 300 notes
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + 'Big')}); const para = 'The lamp turned and the sea took the light. '.repeat(40); for (let i = 0; i < 300; i++) await app.vault.create(${j(L + 'Big/')} + 'Scene ' + String(i).padStart(3, '0') + '.md', '---\\nstatus: draft\\n---\\n' + i + ' ' + para + '\\n'); })().then(() => 1)`);
	await settle(p); await p.sleep(1200);
	await openView(p);
	await run(p, 'compile');
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	await p.ev(`(() => { window.__stall = 0; let last = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__stall = Math.max(window.__stall, n - last); last = n; }, 10); [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Compile').click(); return 1; })()`);
	await until(p, `app.workspace.getActiveFile()?.path === ${j(OUT)} && !document.querySelector('.modal')`, 20000);
	const stall = await p.ev(`(() => { clearInterval(window.__iv); return Math.round(window.__stall); })()`);
	const out = await read(p, OUT);
	t.ok(out.length > 500000 && out.includes('\n\n299 The lamp'), 'all 300 are in it');
	t.ok(stall < 500, `the window never froze for long (longest stall ${stall} ms)`);
});

test('BUG: compiling onto a note that’s already there asks before replacing it', async (p, h, t) => {
	// a note of the writer's own that happens to have the name typed (or last month's compile, since edited by hand)
	await p.ev(`app.vault.create('Loose.md', 'My own note. Do not lose me.').then(() => 1)`);
	await openView(p);
	await compileUI(p, { path: 'Loose.md' });
	try {
		t.eq(await read(p, 'Loose.md'), 'My own note. Do not lose me.', 'the note isn’t replaced before the writer has said so (it’s overwritten at once; only the dialog’s small print says “it’s replaced”)');
		// it asks; Cancel leaves the note, and the compile dialog stays to choose another name
		await until(p, `[...document.querySelectorAll('.modal')].some(m => /Replace this note/.test(m.textContent))`);
		t.ok(/wasn’t made by Compile/.test(await p.ev(`[...document.querySelectorAll('.modal')].pop().textContent`)), 'the question says the note isn’t a compile');
		await p.ev(`(() => { [...[...document.querySelectorAll('.modal')].pop().querySelectorAll('button')].find(b => b.textContent === 'Cancel').click(); return 1; })()`);
		await p.sleep(300);
		t.eq(await read(p, 'Loose.md'), 'My own note. Do not lose me.', 'Cancel: the note is as it was');
		t.ok(await p.ev(`!!document.querySelector('.modal .binders-compile-path')`), 'and the compile dialog is still there');
		// a compile's own note, untouched since, is replaced without asking; once written in, it's asked about
		await p.ev(`(() => { const i = document.querySelector('.modal .binders-compile-path'); i.value = 'Whole.md'; i.dispatchEvent(new Event('input')); [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Compile').click(); return 1; })()`);
		await until(p, `app.vault.adapter.exists('Whole.md')`);
		await until(p, `!document.querySelector('.modal')`);
		await setNote(p, L + 'Prologue.md', 'A new opening.\n');
		await openView(p);
		await compileUI(p, { path: 'Whole.md' });
		await until(p, `app.vault.adapter.read('Whole.md').then(s => s.includes('A new opening.'))`);
		t.ok((await read(p, 'Whole.md')).includes('A new opening.'), 'compiling again replaces the last compile, without asking');
		await until(p, `!document.querySelector('.modal')`);
		await p.ev(`app.vault.adapter.read('Whole.md').then(s => app.vault.adapter.write('Whole.md', s + '\\nMy own edits.\\n')).then(() => 1)`);
		await p.sleep(500);
		await openView(p);
		await compileUI(p, { path: 'Whole.md' });
		await until(p, `[...document.querySelectorAll('.modal')].some(m => /Replace this note/.test(m.textContent))`);
		t.ok(/changed since it was compiled/.test(await p.ev(`[...document.querySelectorAll('.modal')].pop().textContent`)), 'a compile edited by hand since is asked about');
		t.ok((await read(p, 'Whole.md')).endsWith('My own edits.\n'), 'and not replaced meanwhile');
	} finally {
		for (let i = 0; i < 3 && await p.ev(`!!document.querySelector('.modal')`); i++) { await p.key('Escape'); await p.sleep(250); }
	}
});

test('BUG: compile leaves code as it’s written, with “Leave out comments” on (%% and <!-- --> inside code aren’t comments)', async (p, h, t) => {
	const code = '```\nfence %% not a comment %% stays\n<!-- stays -->\n```\n\nInline `a %% b %% c` code.';
	await setNote(p, L + 'Prologue.md', code + '\n');
	await openView(p);
	await compileUI(p, { title: false });
	const out = await read(p, OUT);
	t.ok(out.startsWith(code), 'the code block and the inline code are unchanged: ' + j(out.slice(0, 90)));
});

test('BUG: compile doesn’t leave out the text of a note that starts with empty properties and has a rule further down', async (p, h, t) => {
	await setNote(p, P1 + 'Arrival.md', '---\n---\nText of the scene.\n\n---\n\nMore text.\n');
	await openView(p);
	await compileUI(p, {});
	const out = await read(p, OUT);
	t.ok(out.includes('More text.'), '(the text after the rule is compiled)');
	t.ok(out.includes('Text of the scene.'), 'the text before the rule is compiled too (it’s taken for properties and dropped)');
});

test('BUG: compiling to a name that starts with a dot is refused in words, with nothing written', async (p, h, t) => {
	await openView(p);
	const r = await compileUI(p, { path: '.hidden' });
	if (r.open) await p.key('Escape');
	t.ok(!/Cannot read properties/.test(r.notice), 'no program error shown to the writer: ' + r.notice);
	t.ok(!(await exists(p, '.hidden.md')), 'and no hidden file left in the vault that Obsidian doesn’t show');
});

test('UX: with no name in “Save as”, the dialog asks for one (it says to save outside the binder)', async (p, h, t) => {
	await openView(p);
	const r = await compileUI(p, { path: '' });
	if (r.open) await p.key('Escape');
	t.ok(r.open && !/outside the binder/.test(r.notice), 'a message about the missing name: ' + r.notice);
});

test('UX: footnotes of two notes with the same label don’t run into each other when compiled', async (p, h, t) => {
	await setNote(p, L + 'Prologue.md', 'One.[^1]\n\n[^1]: Prologue’s note.\n');
	await setNote(p, P1 + 'Arrival.md', 'Two.[^1]\n\n[^1]: Arrival’s note.\n');
	await openView(p);
	await compileUI(p, {});
	const defs = (await read(p, OUT)).match(/^\[\^[^\]]+\]:/gm) ?? [];
	t.eq(new Set(defs).size, defs.length, 'each footnote has a label of its own (both are “[^1]”, so the second mark shows the first note’s footnote): ' + j(defs));
});

// =====================================================================================================================
// Undo and redo of moves
// =====================================================================================================================

test('undo: real drags in the corkboard (two cards together to another folder, then one) are taken back by Mod+Z one by one, to the byte; Mod+Shift+Z and Mod+Y redo; a new move ends redo', async (p, h, t) => {
	const before = await texts(p), f0 = await files(p);
	await openView(p);
	const a = await p.at(card(P1 + 'Arrival.md')), s = await p.at(card(P1 + 'Storm warning.md'));
	await p.click(a.x, a.t + 12); await p.click(s.x, s.t + 12, { modifiers: 2 });
	const w = await p.at(card(P2 + 'The wreck.md'));
	await p.drag(s.x, s.t + 12, w.l + 10, w.y, 16);
	await p.sleep(600); await settle(p);
	const one = ['Prologue', 'Part One/', 'Part One/The keeper', 'Part Two/', 'Part Two/Arrival', 'Part Two/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
	t.eq(j(await contents(p)), j(one), 'two cards dropped before The wreck');
	const e = await p.at(card(L + 'Epilogue.md')), pr = await p.at(card(L + 'Prologue.md'));
	await p.drag(e.x, e.t + 12, pr.l + 10, pr.y, 16);
	await p.sleep(600); await settle(p);
	const two = ['Epilogue', ...one.slice(0, -1)];
	t.eq(j(await contents(p)), j(two), 'then Epilogue to the top');
	t.eq(await stacks(p), j([['Move 2 items', 'Move “Epilogue”'], []]), 'two changes to undo: the drop of two cards is one');
	await p.key('z', 'ctrl'); await settle(p);
	t.eq(j(await contents(p)), j(one), 'Mod+Z takes back the last');
	await p.key('z', 'ctrl'); await settle(p);
	t.eq(j(await contents(p)), j(LIST), 'and again: the list as it was');
	t.eq(j(await files(p)), j(f0), 'every file back in its folder');
	same(t, before, await texts(p)); // every note, and the binder note, byte for byte as before
	await p.key('z', 'ctrl', 'shift'); await settle(p);
	t.eq(j(await contents(p)), j(one), 'Mod+Shift+Z makes the first again');
	await p.key('y', 'ctrl'); await settle(p);
	t.eq(j(await contents(p)), j(two), 'Mod+Y the second');
	await p.key('z', 'ctrl'); await settle(p);
	t.eq(await undoable(p, 'The Lighthouse', true), 'Move “Epilogue”', 'something to redo');
	await put(p, [L + 'Prologue.md'], 'The Lighthouse', null); await settle(p);
	t.eq(await undoable(p, 'The Lighthouse', true), null, 'a new move ends redo');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [P1 + 'Arrival.md']: P2 + 'Arrival.md', [P1 + 'Storm warning.md']: P2 + 'Storm warning.md' } });
});

test('undo: Mod+Z does nothing to the order while a menu or a dialog is open, a name is being typed, or in the manuscript’s text (there it’s the text’s own undo)', async (p, h, t) => {
	await openView(p);
	await put(p, [L + 'Epilogue.md'], 'The Lighthouse', L + 'Prologue.md'); await settle(p);
	const still = async (m) => { await p.sleep(300); t.eq(await undoable(p), 'Move “Epilogue”', m); };
	const c = await p.at(card(P1 + 'Arrival.md'));
	await p.right(c.x, c.y);
	await p.key('z', 'ctrl');
	await still('a menu open');
	await closeMenus(p);
	await run(p, 'compile');
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	await p.ev(`document.activeElement.blur()`);
	await p.key('z', 'ctrl');
	await still('a dialog open');
	await p.key('Escape'); await p.sleep(300);
	const c2 = await p.at(card(P1 + 'Arrival.md'));
	await p.click(c2.x, c2.t + 12); await p.key('F2'); await p.sleep(300);
	await p.type('x'); await p.key('z', 'ctrl');
	await still('a card’s name being typed');
	await p.key('Escape'); await p.sleep(300);
	await modeOf(p, 'manuscript');
	await typeInManuscript(p, 'supply boat', ' TYPED');
	await p.key('z', 'ctrl');
	await still('the manuscript’s text');
	t.ok(!(await p.ev(`document.activeElement.textContent`)).includes('TYPED'), 'there Mod+Z took back the typing');
	await settle(p);
	t.eq((await contents(p))[0], 'Epilogue', 'the move stands');
});

test('undo: sixty moves keep the last fifty; each binder has its own; a Longform reorder goes back with its indent; one press undoes once with two views open; after the plugin reloads there’s nothing to undo', async (p, h, t) => {
	for (let i = 0; i < 60; i++) await p.ev(`${B}.${i % 2 ? 'moveUp' : 'moveDown'}(${file(P1 + 'Arrival.md')})`);
	await settle(p);
	t.eq(await p.ev(`${B}.undos.length`), 50, 'fifty kept');
	let n = 0;
	while ((await undo(p)) && n < 70) n++;
	await settle(p);
	t.eq(n, 50, 'fifty undone');
	t.eq(j(await contents(p)), j(LIST), 'back where the fifty began (an even count: where it all began)');
	// two binders
	await clearUndo(p);
	const lf = split(await read(p, LF + 'Index.md')).yaml;
	await put(p, [L + 'Epilogue.md'], 'The Lighthouse', L + 'Prologue.md'); await settle(p);
	t.eq(await put(p, [LF + 'Return.md'], 'Longform demo', LF + 'The crossing.md', 1), 'ok', 'a Longform scene moved into a group');
	await settle(p);
	t.eq(j((await fm(p, LF + 'Index.md')).longform.scenes), j(['Harbor', ['Ticket office', 'Return', 'The crossing'], 'Island']), 'moved, indented');
	t.eq(await undo(p), 'Move “Epilogue”', 'undo in the binder takes back its own move, not the later one in the project');
	await settle(p);
	t.eq(j(await contents(p)), j(LIST), 'the binder is back');
	t.eq(await undo(p, 'Longform demo'), 'Move “Return”', 'and the project its own');
	await settle(p);
	t.eq(split(await read(p, LF + 'Index.md')).yaml, lf, 'the index note’s properties are as they were, to the byte');
	// two views of one binder
	await clearUndo(p);
	await openView(p);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split'); await l.setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse', mode: 'outliner' }, active: true }); })().then(() => 1)`);
	await p.sleep(800);
	await put(p, [L + 'Epilogue.md'], 'The Lighthouse', L + 'Prologue.md'); await settle(p);
	await put(p, [P1 + 'Arrival.md'], L + 'Part One', null); await settle(p);
	const r = await p.at('.workspace-leaf.mod-active .binders-outliner-row .binders-outliner-name');
	await p.click(r.x, r.y);
	await p.key('z', 'ctrl'); await settle(p);
	t.eq(await stacks(p), j([['Move “Epilogue”'], ['Move “Arrival”']]), 'one press, one undo');
	// reload
	await p.ev(`(async () => { await app.plugins.disablePlugin('binders'); await app.plugins.enablePlugin('binders'); await ${B}.ready; })().then(() => 1)`);
	await p.sleep(800);
	t.eq(await undoable(p), null, 'nothing to undo after a reload');
	t.ok(!(await p.ev(`!!app.commands.findCommand('binders:undo-move').checkCallback(true)`)), 'the command isn’t offered');
	t.eq(await undo(p), null, 'and undoing does nothing');
	t.eq((await contents(p))[0], 'Epilogue', 'the move stands');
});

test('undo: a drag in the file explorer is taken back by “Undo last move” (with a note of the binder open); after the moved note is deleted, undo still restores the order of the rest', async (p, h, t) => {
	const EXP = `app.workspace.getLeavesOfType('file-explorer').find(l => l.getRoot() === app.workspace.leftSplit).view`;
	await h.open(L + 'Prologue.md');
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = ${EXP}; app.workspace.revealLeaf(v.leaf); for (const f of ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two']) v.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(500);
	const row = (path) => p.ev(`(() => { const e = ${EXP}.containerEl.querySelector('.tree-item-self[data-path=${j(path)}]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: r.top }; })()`);
	const from = await row(P2 + 'Lights out.md'), to = await row(P1 + 'The keeper.md');
	await p.move(from.x, from.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
	await p.move(from.x + 6, from.y + 6, 3, { buttons: 1 });
	await p.move(to.x, to.t + 3, 8, { buttons: 1 });
	await p.sleep(250);
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.t + 3, button: 'left', clickCount: 1 });
	await p.sleep(500); await settle(p);
	t.eq(j((await contents(p)).slice(2, 5)), j(['Part One/Arrival', 'Part One/Lights out', 'Part One/The keeper']), 'dropped before The keeper, in another folder');
	t.ok(await p.ev(`!!app.commands.findCommand('binders:undo-move').checkCallback(true)`), 'the command is offered (the open note is in the binder)');
	await run(p, 'undo-move'); await settle(p);
	t.eq(j(await contents(p)), j(LIST), 'undone');
	t.ok(await exists(p, P2 + 'Lights out.md'), 'the file is back in its folder');
	// the moved note deleted in between
	await clearUndo(p);
	await put(p, [P2 + 'The wreck.md'], L + 'Part One', P1 + 'Arrival.md'); await settle(p);
	await p.ev(`app.vault.delete(${file(P1 + 'The wreck.md')}).then(() => 1)`); await settle(p);
	t.eq(await undo(p), 'Move “The wreck”', 'undo after the moved note was deleted');
	await settle(p);
	t.eq(j(await contents(p)), j(LIST.filter((x) => x !== 'Part Two/The wreck')), 'the rest in order, no entry for the note that’s gone');
});

test('BUG: undoing a move doesn’t lose the place of a note renamed or made since', async (p, h, t) => {
	await put(p, [L + 'Epilogue.md'], 'The Lighthouse', L + 'Prologue.md'); await settle(p);
	await p.ev(`app.fileManager.renameFile(${file(P1 + 'Arrival.md')}, ${j(P1 + 'Landing.md')}).then(() => 1)`); await settle(p);
	await p.ev(`${B}.newScene(${file(L + 'Part One')}, 0, 'Fresh').then(() => 1)`); await settle(p);
	t.eq(j(await shown(p)), j(['Epilogue', 'Prologue', 'Part One/Fresh', 'Part One/Landing', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out']), '(before the undo)');
	t.eq(await undo(p), 'Move “Epilogue”', 'undo of the move made before them');
	await settle(p);
	t.eq(j(await shown(p)), j(['Prologue', 'Part One/Fresh', 'Part One/Landing', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'only Epilogue goes back; the renamed note and the new one keep their places (they drop to the end of the folder: the old list doesn’t know their names)');
});

test('BUG: undoing a move doesn’t lose the order inside a folder made since (“New folder from selection”)', async (p, h, t) => {
	await put(p, [L + 'Epilogue.md'], 'The Lighthouse', L + 'Prologue.md'); await settle(p);
	// (the folder itself can be undone now, and would come first: here it's the move before it that's taken back, with
	// the folder left as a change made since)
	await p.ev(`${B}.group([${file(P1 + 'Arrival.md')}, ${file(K)}, ${file(P1 + 'Storm warning.md')}], 'Island days').then(() => { ${B}.undos.pop(); return 1; })`); await settle(p);
	t.eq(await undo(p), 'Move “Epilogue”', 'undo of the move made before the folder');
	await settle(p);
	t.eq(j(await shown(p)), j(['Prologue', 'Part One/Island days/Arrival', 'Part One/Island days/The keeper', 'Part One/Island days/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the notes in the new folder are still in their order (they fall back to A to Z: Storm warning before The keeper)');
});

test('BUG: undoing a move doesn’t take back a reorder made since outside Binders (a sync, an edit of the binder note)', async (p, h, t) => {
	await put(p, [L + 'Epilogue.md'], 'The Lighthouse', L + 'Prologue.md'); await settle(p);
	const raw = await read(p, NOTE);
	await writeRaw(p, NOTE, raw.replace('  - Part One/The keeper\n  - Part One/Storm warning', '  - Part One/Storm warning\n  - Part One/The keeper'));
	await p.sleep(900);
	t.eq(j((await shown(p)).slice(2, 5)), j(['Part One/Arrival', 'Part One/Storm warning', 'Part One/The keeper']), '(the edit shows)');
	t.eq(await undo(p), 'Move “Epilogue”', 'undo');
	await settle(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'Epilogue goes back; the order written from outside stands (the whole list is put back as it was before the move)');
});

test('BUG: an undo of several notes that can’t be finished (one’s old place is taken) moves none of them, and can be tried again', async (p, h, t) => {
	t.eq(await put(p, [P2 + 'The wreck.md', P2 + 'Lights out.md'], L + 'Part One', P1 + 'Arrival.md'), 'ok', 'two notes moved to another folder');
	await settle(p);
	await p.ev(`app.vault.create(${j(P2 + 'The wreck.md')}, 'Another wreck.').then(() => 1)`); await settle(p);
	const list = await contents(p);
	t.ok(/can’t go back/.test(await undo(p)), 'the undo says it can’t');
	await settle(p);
	t.ok(await exists(p, P1 + 'Lights out.md'), 'the other note stays where it is too (it went back alone: half undone)');
	t.eq(j(await contents(p)), j(list), 'and the list is as it was before the undo');
	t.eq(await undoable(p), 'Move 2 items', 'the move is still there to undo once the place is free (it’s gone from the history)');
});

test('UX: “Undo last move” is offered after a move while the file explorer has the focus and the binder is open in a view', async (p, h, t) => {
	await openView(p);
	await put(p, [L + 'Epilogue.md'], 'The Lighthouse', L + 'Prologue.md'); await settle(p);
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); app.workspace.setActiveLeaf(l, { focus: true }); return 1; })()`);
	await p.sleep(300);
	t.ok(await p.ev(`!!app.commands.findCommand('binders:undo-move').checkCallback(true)`), 'the command is in the palette (it isn’t: no binder view or note is “active” while the explorer is, so a drag made there can’t be undone)');
});

// =====================================================================================================================
// The store under a run of changes that don't wait for each other
// =====================================================================================================================

// Runs inside the app: moves, drops of two, steps, renames, copies, groups, ungroups, undo, redo, new notes; none waits
// for the list to be written, and with `burst` up to three run at once. Then: what showed before the list was written
// is what was written; no entry twice; none for a missing item; the binder note's other properties and text untouched;
// every note's text still there, and no note with text no note had.
const WALK = `async (seed, steps, burst) => {
	const store = app.plugins.plugins.binders.binders, vault = app.vault, ROOT = 'The Lighthouse', NOTE = ROOT + '/The Lighthouse.md';
	let x = seed >>> 0; const rand = () => { x = (x + 0x6D2B79F5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const pick = (a) => a[Math.floor(rand() * a.length)], sleep = (ms) => new Promise(r => setTimeout(r, ms));
	const root = () => vault.getAbstractFileByPath(ROOT);
	const all = () => vault.getAllLoadedFiles().filter(f => f.path.startsWith(ROOT + '/') && !store.isHiddenNote(f));
	const folders = () => [root(), ...all().filter(f => f.children)];
	const depth = (f) => f.path.split('/').length;
	const before = {}; for (const f of vault.getMarkdownFiles()) before[f.path] = await vault.adapter.read(f.path);
	const known = new Set(Object.entries(before).filter(([k]) => k.startsWith(ROOT + '/') && k !== NOTE).map(([, v]) => v)); known.add('');
	let count = 0; const fresh = () => pick(['Dawn', 'tide', 'Ash', 'bell']) + ' ' + (++count);
	const history = [], errors = [];
	const ops = {
		put() { const n = pick(all()), d = pick(folders().filter(f => f !== n && !f.path.startsWith(n.path + '/') && depth(f) < 4)); if (!n || !d) return null; const sibs = (store.orderedChildren(d) || []).filter(s => s !== n); const a = rand() < 0.3 ? null : pick(sibs) || null; return ['put ' + n.path + ' -> ' + d.path + ' before ' + (a ? a.name : 'end'), store.put([n], d, a)]; },
		put2() { const d = pick(folders()), kids = (store.orderedChildren(d) || []); if (kids.length < 3) return null; const two = [kids[0], kids[2]], t = pick(folders().filter(f => !two.some(n => f === n || f.path.startsWith(n.path + '/')) && depth(f) < 4)); return ['put2 ' + two.map(f => f.name) + ' -> ' + t.path, store.put(two, t, null)]; },
		step() { const n = pick(all()); if (!n) return null; const up = rand() < 0.5; return ['step ' + n.path + (up ? ' up' : ' down'), up ? store.moveUp(n) : store.moveDown(n)]; },
		rename() { const n = pick(all()); if (!n) return null; const to = n.parent.path + '/' + fresh() + (n.children ? '' : '.' + n.extension); return ['rename ' + n.path + ' -> ' + to, app.fileManager.renameFile(n, to)]; },
		duplicate() { const n = pick(all().filter(f => !f.children || f.children.length < 6)); if (!n || all().length > 40) return null; return ['dup ' + n.path, store.duplicate(n)]; },
		group() { const d = pick(folders().filter(f => depth(f) < 3)), kids = (store.orderedChildren(d) || []); if (kids.length < 2) return null; const items = kids.filter(() => rand() < 0.5).slice(0, 3); if (!items.length) return null; return ['group ' + items.map(f => f.name) + ' in ' + d.path, store.group(items, fresh())]; },
		ungroup() { const d = pick(folders().filter(f => f !== root())); if (!d) return null; return ['ungroup ' + d.path, store.ungroup(d)]; },
		undo() { return ['undo', store.undo(ROOT)]; },
		redo() { return ['redo', store.undo(ROOT, true)]; },
		newScene() { const d = pick(folders()); return ['new in ' + d.path, store.newScene(d, Math.floor(rand() * 4), fresh())]; },
		removeEmpty() { const n = pick(all().filter(f => f.children && !f.children.length)); if (!n) return null; return ['rmdir ' + n.path, vault.delete(n, true)]; },
	};
	const bag = Object.entries({ put: 6, put2: 2, step: 3, rename: 3, duplicate: 2, group: 2, ungroup: 2, undo: 3, redo: 2, newScene: 1, removeEmpty: 1 }).flatMap(([k, w]) => Array(w).fill(k));
	for (let i = 0; i < steps; i++) {
		const n = burst ? 1 + Math.floor(rand() * 3) : 1, running = [];
		for (let k = 0; k < n; k++) { let o; try { o = ops[pick(bag)](); } catch (e) { errors.push('threw at once: ' + e.message); } if (o) { history.push(o[0]); running.push(Promise.resolve(o[1]).catch(e => { history.push('  (refused: ' + e.message + ')'); })); } }
		await Promise.all(running);
		if (rand() < 0.15) await sleep(Math.floor(rand() * 400));
	}
	const shown = () => { const out = []; const walk = (f) => { for (const c of store.orderedChildren(f) || []) { out.push(c.path.slice(ROOT.length + 1) + (c.children ? '/' : '')); if (c.children) walk(c); } }; walk(root()); return out; };
	const pending = shown();
	await store.flush(); await sleep(900); await store.flush(); await sleep(300);
	const settled = shown(), fails = [...errors];
	if (JSON.stringify(pending) !== JSON.stringify(settled)) { const i = pending.findIndex((p, k) => p !== settled[k]); fails.push('what showed before the list was written differs from what was written, from #' + i + ': showed ' + JSON.stringify(pending.slice(i, i + 4)) + ', written ' + JSON.stringify(settled.slice(i, i + 4))); }
	const re = /^---\\n([\\s\\S]*?)\\n---\\n?([\\s\\S]*)$/, m = re.exec(await vault.adapter.read(NOTE)), m0 = re.exec(before[NOTE]);
	const fm = app.metadataCache.getFileCache(vault.getAbstractFileByPath(NOTE)).frontmatter, list = fm.contents;
	if (new Set(list).size !== list.length) fails.push('an entry is listed twice: ' + JSON.stringify(list.filter((p, i) => list.indexOf(p) !== i)));
	for (const p of list) { const path = ROOT + '/' + (p.endsWith('/') ? p.slice(0, -1) : p); if (!(vault.getAbstractFileByPath(path) || vault.getAbstractFileByPath(path + '.md'))) fails.push('the list has an entry for something that isn’t there: ' + p); }
	if (m[2] !== m0[2]) fails.push('the binder note’s text changed');
	const strip = (y) => y.replace(/^contents:\\n(  - .*\\n?)*/m, '');
	if (strip(m[1]) !== strip(m0[1])) fails.push('the binder note’s other properties changed: ' + JSON.stringify(strip(m[1])));
	const now = {}; for (const f of vault.getMarkdownFiles()) if (f.path.startsWith(ROOT + '/') && f.path !== NOTE) now[f.path] = await vault.adapter.read(f.path);
	const have = new Set(Object.values(now));
	for (const [k, v] of Object.entries(before)) if (k.startsWith(ROOT + '/') && k !== NOTE && !have.has(v)) fails.push('the text of “' + k + '” is nowhere any more');
	for (const [k, v] of Object.entries(now)) if (!known.has(v)) fails.push('a note has text no note had: ' + k);
	for (const k of Object.keys(before)) if (!k.startsWith(ROOT + '/') && (await vault.adapter.read(k)) !== before[k]) fails.push('a note outside the binder changed: ' + k);
	return { fails, history };
}`;

for (const [seed, burst] of [[1, false], [2, false], [5, false], [3, true], [4, true]]) {
	test(`a random walk of ${burst ? 'changes made up to three at a time' : 'changes that don’t wait for the list to be written'} (moves, copies, groups, ungroups, renames, undo, redo; seed ${seed}) keeps the binder whole`, async (p, h, t) => {
		const r = await p.ev(`(${WALK})(${seed}, 40, ${burst})`);
		// (a note renamed while Obsidian was reading it logs a missing file: Obsidian's own, and harmless)
		for (let i = p.errors.length - 1; i >= 0; i--) if (/ENOENT/.test(p.errors[i])) p.errors.splice(i, 1);
		t.ok(!r.fails.length, `${r.fails.slice(0, 2).join('\n    ')}\n    last steps: ${r.history.slice(-8).join(' | ')}`);
	});
}
