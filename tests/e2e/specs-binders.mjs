// Binders in the vault (src/binders.ts): detection, keeping the list in step with renames, moves and deletes, batching,
// external edits, refusing newer formats, and the commands. Every test that changes files checks no text was lost.
export const specs = [];
const test = (name, fn) => specs.push({ name, fn });

const B = `app.plugins.plugins.binders.binders`;
const NOTE = 'The Lighthouse/The Lighthouse.md';
const PRISTINE_FOLDERS = ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two'];
const j = (x) => JSON.stringify(x);
const file = (path) => `app.vault.getAbstractFileByPath(${j(path)})`;

/** Polls an expression until it's truthy; returns its last value. */
async function until(p, expr, ms = 3000) {
	let v;
	for (let i = 0; i < ms / 50; i++) { v = await p.ev(expr).catch(() => undefined); if (v) return v; await p.sleep(50); }
	return v;
}
const read = (p, path) => p.ev(`app.vault.adapter.read(${j(path)})`);
const exists = (p, path) => p.ev(`app.vault.adapter.exists(${j(path)})`);
/** Every note's text, by path. */
const texts = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
/** A note's frontmatter and body, split by hand so we test the bytes on disk, not Obsidian's cache. */
function split(text) {
	const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
	return m ? { yaml: m[1], body: m[2] } : { yaml: '', body: text };
}
/** The `contents` list as written on disk. */
async function contents(p, path = NOTE) {
	const lines = split(await read(p, path)).yaml.split('\n');
	const i = lines.findIndex((l) => /^contents:/.test(l)), out = [];
	if (i < 0) return out;
	for (const l of lines.slice(i + 1)) { const m = /^\s+- (.*)$/.exec(l); if (!m) break; out.push(m[1].replace(/^(["'])(.*)\1$/, '$2')); }
	return out;
}
/** Whether a command is offered right now (executeCommandById runs it whatever it returns). */
const offered = (p, id) => p.ev(`app.commands.findCommand('binders:' + ${JSON.stringify(id)}).checkCallback(true)`);
const flush = (p) => p.ev(`${B}.flush().then(() => 1)`);
/** Names of a folder's items in binder order. */
const children = (p, folder, hidden = false) => p.ev(`(${B}.orderedChildren(${file(folder)}, { hidden: ${hidden} }) || []).map(f => f.name)`);
/** Counts writes to a note from now on. */
const countWrites = (p, path = NOTE) => p.ev(`(() => { window.__writes = 0; window.__ref && app.vault.offref(window.__ref); window.__ref = app.vault.on('modify', f => { if (f.path === ${j(path)}) window.__writes++; }); return 1; })()`);
const writes = (p) => p.ev(`window.__writes`);
/** Removes folders a test made, then writes anything pending, so the next test starts clean. */
async function tidy(p) {
	await p.ev(`(async () => {
		window.__ref && app.vault.offref(window.__ref); window.__ref = null;
		const keep = new Set(${j(PRISTINE_FOLDERS)});
		const extra = app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !keep.has(f.path));
		for (const f of extra.sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		await ${B}.flush();
	})().then(() => 1)`);
	await p.sleep(100);
}
/** Checks every note but the ones named is byte-for-byte what it was. `moved` maps old paths to new ones. */
function same(t, before, after, { skip = [], moved = {} } = {}) {
	for (const [path, text] of Object.entries(before)) {
		if (skip.includes(path)) continue;
		const now = after[moved[path] ?? path];
		t.eq(now, text, `“${path}” is unchanged`);
	}
}
/** The binder note's body (everything after its properties) is untouched. */
async function bodyKept(p, t, before, path = NOTE) {
	t.eq(split(await read(p, path)).body, split(before[path]).body, 'the binder note’s text is untouched');
}
/** Part One's folder note (not in test-vault, where the explorer tests make their own). */
const FOLDER_NOTE = 'The Lighthouse/Part One/Part One.md';
const addFolderNote = (p) => p.ev(`app.vault.create(${j(FOLDER_NOTE)}, '---\\nsynopsis: Mara comes to the island.\\nstatus: draft\\n---\\nNotes on Part One.\\n').then(() => 1)`).then(() => p.sleep(150));
const withTidy = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await tidy(p); } };

const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];

test('binders: finds the binder, orders it, and tells binder and folder notes from scenes', async (p, h, t) => {
	await addFolderNote(p);
	await p.ev(`${B}.ready.then(() => 1)`);
	t.eq(j(await p.ev(`${B}.all().filter(b => b.kind === 'binder').map(b => b.folder.path)`)), j(['The Lighthouse']), 'one binder (and a Longform project, in specs-longform)');
	t.ok(await p.ev(`${B}.isBinderFolder(${file('The Lighthouse')})`), 'the folder is a binder');
	t.ok(!(await p.ev(`${B}.isBinderFolder(${file('The Lighthouse/Part One')})`)), 'a subfolder is not');
	t.eq(await p.ev(`${B}.binderOf(${j('The Lighthouse/Part One/Arrival.md')}).note.path`), NOTE, 'a scene knows its binder');
	t.eq(await p.ev(`${B}.binderOf('Elsewhere.md')`), null, 'a note outside has none');
	t.ok(await p.ev(`${B}.isHiddenNote(${file(NOTE)}) && ${B}.isHiddenNote(${file('The Lighthouse/Part One/Part One.md')})`), 'binder and folder notes are hidden notes');
	t.ok(!(await p.ev(`${B}.isHiddenNote(${file('The Lighthouse/Part One/Arrival.md')})`)), 'a scene is not');
	t.eq(j(await children(p, 'The Lighthouse')), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'top level in binder order');
	t.eq(j(await children(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'a folder in binder order, without its folder note');
	t.eq(j(await children(p, 'The Lighthouse/Part One', true)), j(['Part One.md', 'Arrival.md', 'The keeper.md', 'Storm warning.md']), 'with hidden notes asked for, they come first');
	t.eq(await p.ev(`${B}.orderedChildren(app.vault.getRoot())`), null, 'outside binders: no order');
	t.eq(j(await p.ev(`${B}.scenes(${file('The Lighthouse')}).map(f => f.basename)`)), j(['Prologue', 'Arrival', 'The keeper', 'Storm warning', 'The wreck', 'Lights out', 'Epilogue']), 'scenes in reading order');
	t.eq(await p.ev(`${B}.folderNote(${file('The Lighthouse/Part One')}).path`), 'The Lighthouse/Part One/Part One.md', 'a folder’s note');
	t.eq(await p.ev(`${B}.folderNote(${file('The Lighthouse')}).path`), NOTE, 'the binder folder’s note is the binder note');
	t.eq(await p.ev(`${B}.problem(${file('The Lighthouse')})`), null, 'no problem');
});

test('binders: the hide setting is on by default and in the settings tab', async (p, h, t) => {
	t.eq(await p.ev(`app.plugins.plugins.binders.settings.hideBinderNotes`), true, 'on by default');
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`); await p.sleep(600);
	try {
		const txt = await p.ev(`app.setting.activeTab.containerEl.innerText`);
		t.ok(/Hide binder and folder notes/.test(txt) && /Synopsis/.test(txt), 'shown with the property names');
	} finally { await p.ev(`(() => { app.setting.close(); return 1; })()`); }
});

test('binders: a renamed note keeps its place, and no text changes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Part One/Arrival.md')}, 'The Lighthouse/Part One/Landfall.md').then(() => 1)`);
	t.eq(j(await children(p, 'The Lighthouse/Part One')), j(['Landfall.md', 'The keeper.md', 'Storm warning.md']), 'shows in place at once');
	await flush(p);
	t.eq(j(await contents(p)), j(LIST.map((x) => (x === 'Part One/Arrival' ? 'Part One/Landfall' : x))), 'the list follows the rename');
	same(t, before, await texts(p), { skip: [NOTE], moved: { 'The Lighthouse/Part One/Arrival.md': 'The Lighthouse/Part One/Landfall.md' } });
	await bodyKept(p, t, before);
}));

test('binders: a renamed folder carries its items and its folder note, in one write', withTidy(async (p, h, t) => {
	await addFolderNote(p);
	const before = await texts(p);
	await countWrites(p);
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Part One')}, 'The Lighthouse/Part 1').then(() => 1)`);
	t.ok(await until(p, `!!${file('The Lighthouse/Part 1/Part 1.md')}`), 'the folder note follows the folder’s name');
	await p.sleep(700);
	t.eq(j(await contents(p)), j(LIST.map((x) => x.replace(/^Part One\//, 'Part 1/'))), 'the list follows the folder');
	t.eq(await writes(p), 1, 'written once');
	t.eq(j(await children(p, 'The Lighthouse/Part 1')), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'the folder note is still hidden');
	const moved = {};
	for (const k of Object.keys(before)) if (k.startsWith('The Lighthouse/Part One/')) moved[k] = k.replace('Part One/', 'Part 1/').replace('Part 1/Part One.md', 'Part 1/Part 1.md');
	same(t, before, await texts(p), { skip: [NOTE], moved });
	await bodyKept(p, t, before);
}));

test('binders: moving out removes, moving in appends, deleting removes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Epilogue.md')}, 'Epilogue.md').then(() => 1)`);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST.filter((x) => x !== 'Epilogue')), 'moved out: gone from the list');
	await p.ev(`app.fileManager.renameFile(${file('Epilogue.md')}, 'The Lighthouse/Part One/Epilogue.md').then(() => 1)`);
	await flush(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Epilogue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out']), 'moved in: last in its folder');
	same(t, before, await texts(p), { skip: [NOTE], moved: { 'The Lighthouse/Epilogue.md': 'The Lighthouse/Part One/Epilogue.md' } });
	await p.ev(`app.vault.delete(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await flush(p);
	t.ok(!(await contents(p)).includes('Prologue'), 'deleted: gone from the list');
	await bodyKept(p, t, before);
}));

test('binders: a new note shows last without a write', withTidy(async (p, h, t) => {
	await countWrites(p);
	await p.ev(`app.vault.create('The Lighthouse/Appendix.md', 'Notes.').then(() => 1)`);
	t.eq(j(await until(p, `(() => { const c = (${B}.orderedChildren(${file('The Lighthouse')}) || []).map(f => f.name); return c.includes('Appendix.md') && c; })()`)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md', 'Appendix.md']), 'unlisted items come after listed ones');
	await p.sleep(600);
	t.eq(await writes(p), 0, 'the binder note isn’t written');
}));

test('binders: moving a folder of 40 notes in and out writes the binder note once each way', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Extras'); for (let i = 1; i <= 40; i++) await app.vault.create('Extras/Note ' + i + '.md', 'Text ' + i); })().then(() => 1)`);
	const before = await texts(p);
	await countWrites(p);
	await p.ev(`app.fileManager.renameFile(${file('Extras')}, 'The Lighthouse/Extras').then(() => 1)`);
	await until(p, `window.__writes > 0`);
	await p.sleep(800);
	t.eq(await writes(p), 1, 'moved in: one write');
	t.eq(j(await contents(p)), j([...LIST, 'Extras/']), 'the folder is listed; its notes come with it');
	t.eq((await p.ev(`${B}.scenes(${file('The Lighthouse/Extras')}).length`)), 40, 'all 40 notes are in the binder');
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Extras')}, 'Extras').then(() => 1)`);
	await until(p, `window.__writes > 1`);
	await p.sleep(800);
	t.eq(await writes(p), 2, 'moved out: one more write');
	t.eq(j(await contents(p)), j(LIST), 'the list is as it was');
	same(t, before, await texts(p), { skip: [NOTE] });
	await bodyKept(p, t, before);
}));

test('binders: external edits to the binder note are followed, and pending changes apply on top', withTidy(async (p, h, t) => {
	const before = await texts(p);
	const edited = before[NOTE].replace('  - Prologue\n', '').replace('  - Epilogue\n', '  - Epilogue\n  - Prologue\n');
	await p.ev(`app.vault.modify(${file(NOTE)}, ${j(edited)}).then(() => 1)`);
	t.eq(j(await until(p, `(() => { const c = (${B}.orderedChildren(${file('The Lighthouse')}) || []).map(f => f.name); return c[3] === 'Prologue.md' && c; })()`)), j(['Part One', 'Part Two', 'Epilogue.md', 'Prologue.md']), 'the new order shows');
	// a rename waiting to be written, then an edit from outside: both survive
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Part Two/The wreck.md')}, 'The Lighthouse/Part Two/Wreckage.md').then(() => 1)`);
	const edited2 = edited.replace('  - Part Two/Lights out\n', '').replace('  - Part Two/\n', '  - Part Two/\n  - Part Two/Lights out\n');
	await p.ev(`app.vault.modify(${file(NOTE)}, ${j(edited2)}).then(() => 1)`);
	await p.sleep(200);
	await flush(p);
	t.eq(j(await contents(p)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/Lights out', 'Part Two/Wreckage', 'Epilogue', 'Prologue']), 'the edit and the rename are both kept');
	await bodyKept(p, t, before);
	same(t, before, await texts(p), { skip: [NOTE], moved: { 'The Lighthouse/Part Two/The wreck.md': 'The Lighthouse/Part Two/Wreckage.md' } });
}));

test('binders: a binder from a newer version is listed, explained, and never written', withTidy(async (p, h, t) => {
	const note = '---\nbinder: 2\ncontents:\n  - b\n  - a\nfuture: {x: 1}\n---\nFrom the future.\n';
	await p.ev(`(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/a.md', 'A'); await app.vault.create('Future/b.md', 'B'); await app.vault.create('Future/Future.md', ${j(note)}); })().then(() => 1)`);
	t.ok(await until(p, `!!${B}.problem('Future/a.md')`), 'the binder is found, with a problem');
	t.ok(/newer version of Binders/.test(await p.ev(`${B}.problem('Future')`)), 'the reason says why');
	t.ok(await until(p, `[...document.querySelectorAll('.notice')].some(n => /newer version of Binders/.test(n.textContent))`), 'a notice explains it');
	t.ok(await p.ev(`${B}.isBinderFolder(${file('Future')})`), 'still a binder');
	await p.ev(`app.fileManager.renameFile(${file('Future/a.md')}, 'Future/c.md').then(() => 1)`);
	await p.ev(`app.vault.delete(${file('Future/b.md')}).then(() => 1)`);
	await p.ev(`app.vault.create('Future/d.md', 'D').then(() => 1)`);
	t.ok(/newer version/.test(await p.ev(`${B}.newScene(${file('Future')}).then(() => 'made', e => e.message)`)), 'no new scenes');
	t.ok(/newer version/.test(await p.ev(`${B}.move(${file('Future/c.md')}, ${file('Future')}, 0).then(() => 'moved', e => e.message)`)), 'no moves');
	t.ok(/newer version/.test(await p.ev(`${B}.setProps(${file('Future/Future.md')}, { x: 1 }).then(() => 'set', e => e.message)`)), 'no property changes to its binder note');
	await flush(p); await p.sleep(500);
	t.eq(await read(p, 'Future/Future.md'), note, 'the binder note is byte for byte the same');
}));

test('binders: "Make this folder a binder" writes the current order, and keeps an existing note’s text', withTidy(async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder('Novella'); await app.vault.createFolder('Novella/Notes');
		await app.vault.create('Novella/Chapter 10.md', 'Ten'); await app.vault.create('Novella/Chapter 2.md', 'Two'); await app.vault.create('Novella/Notes/Idea.md', 'An idea');
		await app.vault.create('Novella/Notes/Notes.md', 'Folder note');
	})().then(() => 1)`);
	const before = await texts(p);
	await h.open('The Lighthouse/Part One/Arrival.md');
	t.eq(await offered(p, 'make-binder'), false, 'not offered inside a binder');
	await h.open('Novella/Chapter 2.md');
	t.ok(await h.run('make-binder'), 'offered in a plain folder');
	t.ok(await until(p, `${B}.isBinderFolder(${file('Novella')})`), 'the folder becomes a binder');
	const text = await read(p, 'Novella/Novella.md');
	t.ok(/^binder: 1$/m.test(split(text).yaml), 'binder: 1');
	t.eq(j(await contents(p, 'Novella/Novella.md')), j(['Notes/', 'Notes/Idea', 'Chapter 2', 'Chapter 10']), 'the order it showed in: folders first, then by name, no folder notes');
	t.eq(split(text).body, '', 'no text of its own');
	t.eq(await offered(p, 'make-binder'), false, 'not offered twice');
	same(t, before, await texts(p));
	// a folder that already has a note named like it: that note gets the property, and keeps everything else
	const draft = '---\ntags:\n  - wip\n---\nMy own words.\n\nMore of them.\n';
	await p.ev(`(async () => { await app.vault.createFolder('Draft'); await app.vault.create('Draft/Scene.md', 'S'); await app.vault.create('Draft/Draft.md', ${j(draft)}); })().then(() => 1)`);
	await p.ev(`${B}.makeBinder(${file('Draft')}).then(() => 1)`);
	t.ok(await until(p, `${B}.isBinderFolder(${file('Draft')})`), 'it becomes the binder note');
	const d = await read(p, 'Draft/Draft.md');
	t.eq(split(d).body, split(draft).body, 'its text is untouched');
	t.ok(/tags:\n\s+- wip/.test(split(d).yaml) && /binder: 1/.test(split(d).yaml), 'its properties are kept and binder added');
	t.eq(j(await contents(p, 'Draft/Draft.md')), j(['Scene']), 'with the order');
}));

test('binders: the folder menu offers "Make this folder a binder" and "New scene here"', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.createFolder('Loose').then(() => 1)`);
	const menu = async (path) => {
		await p.ev(`(() => { document.body.click(); return 1; })()`);
		const at = await until(p, `(() => { const e = document.querySelector('.nav-folder-title[data-path="${path}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
		t.ok(at, `“${path}” is in the file explorer`);
		await p.right(at.x, at.y);
		const items = await until(p, `[...document.querySelectorAll('.menu .menu-item-title')].map(e => e.textContent)`);
		await p.key('Escape');
		return items || [];
	};
	const loose = await menu('Loose');
	t.ok(loose.includes('Make this folder a binder') && !loose.includes('New scene here'), 'a plain folder can become a binder');
	const binder = await menu('The Lighthouse');
	t.ok(binder.includes('New scene here') && !binder.includes('Make this folder a binder'), 'a binder can get a new scene');
}));

test('binders: "New scene here" makes an empty note in place and opens it', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`${B}.newScene(${file('The Lighthouse/Part One')}, 1, 'Interlude').then(() => 1)`);
	t.eq(await read(p, 'The Lighthouse/Part One/Interlude.md'), '', 'an empty note');
	t.eq(j(await children(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'Interlude.md', 'The keeper.md', 'Storm warning.md']), 'at the place asked for');
	await p.ev(`${B}.newScene(${file('The Lighthouse/Part One')}, undefined, 'Part One').then(() => 1)`);
	t.ok(await exists(p, 'The Lighthouse/Part One/Part One 1.md'), 'never named like its folder (that would be the folder note)');
	await h.open('The Lighthouse/Part Two/The wreck.md');
	t.ok(await h.run('new-scene'), 'the command runs in a binder');
	t.ok(await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse/Part Two/Untitled.md'`), 'the new note opens');
	t.eq(j(await children(p, 'The Lighthouse/Part Two')), j(['The wreck.md', 'Untitled.md', 'Lights out.md']), 'right after the note you were in');
	await flush(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Interlude', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Part One 1', 'Part Two/', 'Part Two/The wreck', 'Part Two/Untitled', 'Part Two/Lights out', 'Epilogue']), 'the list has them');
	same(t, before, await texts(p), { skip: [NOTE] });
	await bodyKept(p, t, before);
}));

test('binders: move up, move down, and moving to another folder', withTidy(async (p, h, t) => {
	const before = await texts(p);
	t.ok(await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')})`), 'down');
	t.eq(j(await children(p, 'The Lighthouse')), j(['Part One', 'Prologue.md', 'Part Two', 'Epilogue.md']), 'one step down');
	t.eq(await p.ev(`${B}.moveDown(${file('The Lighthouse/Epilogue.md')})`), false, 'the last can’t go down');
	t.eq(await p.ev(`${B}.moveUp(${file(NOTE)})`), false, 'the binder note doesn’t move');
	await h.open('The Lighthouse/Part One/The keeper.md');
	t.ok(await h.run('move-up'), 'the command runs');
	t.eq(j(await children(p, 'The Lighthouse/Part One')), j(['The keeper.md', 'Arrival.md', 'Storm warning.md']), 'one step up');
	t.eq(await offered(p, 'move-up'), false, 'not offered at the top');
	await p.ev(`${B}.move(${file('The Lighthouse/Epilogue.md')}, ${file('The Lighthouse/Part Two')}, 0).then(() => 1)`);
	t.ok(await exists(p, 'The Lighthouse/Part Two/Epilogue.md'), 'the file moved');
	t.eq(j(await children(p, 'The Lighthouse/Part Two')), j(['Epilogue.md', 'The wreck.md', 'Lights out.md']), 'to the place asked for');
	t.ok(/already has/.test(await p.ev(`(async () => { await app.vault.create('The Lighthouse/Part One/Lights out.md', 'x'); return ${B}.move(${file('The Lighthouse/Part One/Lights out.md')}, ${file('The Lighthouse/Part Two')}, 0).then(() => 'moved', e => e.message); })()`)), 'a name clash is refused');
	await flush(p);
	t.eq(j(await contents(p)), j(['Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning', 'Part One/Lights out', 'Prologue', 'Part Two/', 'Part Two/Epilogue', 'Part Two/The wreck', 'Part Two/Lights out']), 'the list has it all');
	same(t, before, await texts(p), { skip: [NOTE], moved: { 'The Lighthouse/Epilogue.md': 'The Lighthouse/Part Two/Epilogue.md' } });
	await bodyKept(p, t, before);
}));

test('binders: folder notes are made on demand and edited through properties only', withTidy(async (p, h, t) => {
	await addFolderNote(p);
	const before = await texts(p);
	await countWrites(p);
	const path = await p.ev(`${B}.ensureFolderNote(${file('The Lighthouse/Part Two')}).then(f => f.path)`);
	t.eq(path, 'The Lighthouse/Part Two/Part Two.md', 'named like the folder');
	t.eq(await read(p, path), '', 'empty');
	t.ok(await p.ev(`${B}.isHiddenNote(${file(path)})`), 'hidden');
	t.ok(!(await children(p, 'The Lighthouse/Part Two')).includes('Part Two.md'), 'not a scene');
	t.eq(await p.ev(`${B}.ensureFolderNote(${file('The Lighthouse/Part One')}).then(f => f.path)`), 'The Lighthouse/Part One/Part One.md', 'an existing one is used');
	await p.ev(`${B}.setProps(${file('The Lighthouse/Part One/Part One.md')}, { synopsis: 'Arrivals.', status: undefined }).then(() => 1)`);
	const po = await read(p, 'The Lighthouse/Part One/Part One.md');
	t.ok(/synopsis: Arrivals\./.test(po) && !/status:/.test(po), 'set and removed');
	t.eq(split(po).body, split(before['The Lighthouse/Part One/Part One.md']).body, 'its text is untouched');
	await flush(p); await p.sleep(400);
	t.eq(await writes(p), 0, 'the binder note isn’t written');
	same(t, before, await texts(p), { skip: ['The Lighthouse/Part One/Part One.md'] });
}));

test('binders: renaming the binder folder keeps the binder and its order, with no write', withTidy(async (p, h, t) => {
	const before = await texts(p);
	// (the binder note follows its folder's name: a rename, not a write)
	await countWrites(p, 'The Beacon/The Beacon.md');
	try {
		await p.ev(`app.fileManager.renameFile(${file('The Lighthouse')}, 'The Beacon').then(() => 1)`);
		t.ok(await until(p, `!!${file('The Beacon/The Beacon.md')} && ${B}.isBinderFolder(${file('The Beacon')})`), 'still a binder, its note named like it');
		t.eq(j(await children(p, 'The Beacon')), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'same order');
		await p.sleep(600); await flush(p);
		t.eq(await writes(p), 0, 'no write');
		t.eq(await read(p, 'The Beacon/The Beacon.md'), before[NOTE], 'the binder note is unchanged');
	} finally {
		await p.ev(`${file('The Beacon')} ? app.fileManager.renameFile(${file('The Beacon')}, 'The Lighthouse').then(() => 1) : 1`);
		await until(p, `!!${file(NOTE)}`);
		await p.sleep(300);
	}
	same(t, before, await texts(p));
}));

test('binders: "changed" fires for real changes only, not for typing in the binder note', withTidy(async (p, h, t) => {
	await p.ev(`(() => { window.__changed = []; window.__cref = ${B}.on('changed', (path) => window.__changed.push(path)); return 1; })()`);
	try {
		const text = await read(p, NOTE);
		await p.ev(`app.vault.modify(${file(NOTE)}, ${j(text + '\nMore about the book.\n')}).then(() => 1)`);
		await p.sleep(600);
		t.eq(j(await p.ev(`window.__changed`)), '[]', 'editing the binder note’s text: nothing');
		await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Prologue.md')}, 'The Lighthouse/Opening.md').then(() => 1)`);
		await p.sleep(100);
		t.eq(j(await p.ev(`window.__changed`)), j(['The Lighthouse']), 'a rename: once, with the binder’s path');
		await flush(p); await p.sleep(600);
		t.eq(await p.ev(`window.__changed.length`), 1, 'writing the list it already shows: nothing more');
	} finally { await p.ev(`(() => { ${B}.offref(window.__cref); return 1; })()`); }
}));
