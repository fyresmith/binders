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

// The store keeps each folder's order once it has worked it out (a drag over the file explorer asks for it many times
// per pointer move). What's kept must never outlive a change: asked again at once after each kind, it's the new order.
test('binders: a folder’s order, kept between changes, is never stale, and is what the binder note says on disk', withTidy(async (p, h, t) => {
	const before = await texts(p), L = 'The Lighthouse', P1 = `${L}/Part One`, LF = 'Longform demo';
	const now = (folder = P1, hidden = false) => children(p, folder, hidden);
	t.eq(j(await now()), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'to begin with');
	// what's handed out is the asker's own: changing it changes nothing for the next
	await p.ev(`(() => { const a = ${B}.orderedChildren(${file(P1)}); a.reverse(); a.length = 1; return 1; })()`);
	t.eq(j(await now()), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'a list handed out and changed by whoever asked isn’t the list that’s kept');
	// each change is asked about in the same task it's made in: no write, no cache event has happened yet
	const after = (change, folder = P1, hidden = false) => p.ev(`(async () => { ${B}.orderedChildren(${file(folder)}, { hidden: ${hidden} }); await (${change}); return (${B}.orderedChildren(${file(folder)}, { hidden: ${hidden} }) || []).map(f => f.name); })()`);
	t.eq(j(await after(`${B}.move(${file(`${P1}/Storm warning.md`)}, ${file(P1)}, 0)`)), j(['Storm warning.md', 'Arrival.md', 'The keeper.md']), 'a move');
	t.eq(j(await after(`app.vault.create(${j(`${P1}/Landfall.md`)}, 'New.')`)), j(['Storm warning.md', 'Arrival.md', 'The keeper.md', 'Landfall.md']), 'a note made');
	t.eq(j(await after(`app.fileManager.renameFile(${file(`${P1}/The keeper.md`)}, ${j(`${P1}/The warden.md`)})`)), j(['Storm warning.md', 'Arrival.md', 'The warden.md', 'Landfall.md']), 'a rename');
	t.eq(j(await after(`app.vault.create(${j(FOLDER_NOTE)}, 'About Part One.')`, P1, true)), j(['Part One.md', 'Storm warning.md', 'Arrival.md', 'The warden.md', 'Landfall.md']), 'a folder note made: first among the hidden');
	t.eq(j(await now()), j(['Storm warning.md', 'Arrival.md', 'The warden.md', 'Landfall.md']), 'and not an item');
	t.eq(j(await after(`app.vault.delete(${file(`${P1}/Landfall.md`)})`)), j(['Storm warning.md', 'Arrival.md', 'The warden.md']), 'a delete');
	t.eq(j(await after(`app.fileManager.renameFile(${file(`${L}/Prologue.md`)}, ${j(`${P1}/Prologue.md`)})`)), j(['Storm warning.md', 'Arrival.md', 'The warden.md', 'Prologue.md']), 'a note moved in from another folder');
	t.eq(j(await now(L)), j(['Part One', 'Part Two', 'Epilogue.md']), 'and gone from the folder it left');
	t.eq(j(await after(`${B}.moveUp(${file(`${L}/Part Two`)})`, L)), j(['Part Two', 'Part One', 'Epilogue.md']), 'a folder moved up');
	t.eq(j(await after(`${B}.undo(${file(L)})`, L)), j(['Part One', 'Part Two', 'Epilogue.md']), 'and that undone');
	await flush(p); await p.sleep(200);
	t.eq(j(await contents(p)), j(['Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The warden', 'Part One/Prologue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the binder note on disk has every entry, in the order shown');
	// an edit of the binder note from outside, with the order just asked for
	const text = await read(p, NOTE);
	await now();
	await p.ev(`app.vault.adapter.write(${j(NOTE)}, ${j(text.replace('  - Part One/Storm warning\n', '').replace('  - Part One/Prologue\n', '  - Part One/Prologue\n  - Part One/Storm warning\n'))}).then(() => 1)`);
	t.eq(j(await until(p, `(() => { const c = (${B}.orderedChildren(${file(P1)}) || []).map(f => f.name); return c[3] === 'Storm warning.md' && c; })()`)), j(['Arrival.md', 'The warden.md', 'Prologue.md', 'Storm warning.md']), 'an edit made outside is followed');
	// a Longform project's order is kept the same way
	t.eq(j(await now(LF)), j(['Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Return.md']), 'a Longform project, to begin with');
	t.eq(j(await after(`${B}.move(${file(`${LF}/Return.md`)}, ${file(LF)}, 0)`, LF)), j(['Return.md', 'Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md']), 'a scene moved');
	t.eq(j(await after(`app.vault.create(${j(`${LF}/Quay.md`)}, 'New.')`, LF)), j(['Return.md', 'Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Quay.md']), 'a scene made');
	t.eq(j(await now(LF, true)), j(['Index.md', 'Return.md', 'Harbor.md', 'Ticket office.md', 'The crossing.md', 'Island.md', 'Quay.md']), 'with its index note');
	await flush(p); await p.sleep(200);
	t.eq(await p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(`${LF}/Index.md`)}).frontmatter.longform.scenes)`), j(['Return', 'Harbor', ['Ticket office', 'The crossing'], 'Island']), 'the index note on disk has the order shown (a note not yet moved isn’t listed, as in Longform)');
	same(t, before, await texts(p), { skip: [NOTE, `${LF}/Index.md`], moved: { [`${P1}/The keeper.md`]: `${P1}/The warden.md`, [`${L}/Prologue.md`]: `${P1}/Prologue.md` } });
}));

// Snapshots follow their note when it's renamed (the store queues each rename and moves the folders a moment later).
// Renames that come in a burst can pass one name from note to note: the moves must be made in the order the renames
// came in, one at a time, or a note's snapshots are left under a name it no longer has.
const SNAPS = 'The Lighthouse/Snapshots';
const snapshotText = (who) => `---\nsnapshot-of: "Part One/${who}"\ntaken: 2026-09-12T09:15:40\n---\n${who} wrote this, and only ${who}.\r\nA second line, with a Windows line break before it.\n`;
/** Puts a snapshot of a note in place, as Binders writes them (the folder is the note's path in the binder). */
const seedSnapshot = (p, rel, who) => p.ev(`(async () => { let at = ''; for (const part of ${j(`${SNAPS}/${rel}`)}.split('/')) { at = at ? at + '/' + part : part; if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at); } await app.vault.create(${j(`${SNAPS}/${rel}/2026-09-12 09.15.40.snapshot`)}, ${j(snapshotText(who))}); })().then(() => 1)`);
/** Every snapshot file under the binder's Snapshots folder: its path there and its bytes. */
const snapshotsOnDisk = (p) => p.ev(`(async () => { const out = {}; const walk = async (dir) => { if (!(await app.vault.adapter.exists(dir))) return; const l = await app.vault.adapter.list(dir); for (const f of l.files) out[f.slice(${SNAPS.length + 1})] = await app.vault.adapter.read(f); for (const d of l.folders) await walk(d); }; await walk(${j(SNAPS)}); return out; })()`);
const renames = (p, pairs, pauseAfter = -1, pause = 0) => p.ev(`(async () => { const pairs = ${j(pairs)}; for (let i = 0; i < pairs.length; i++) { await app.fileManager.renameFile(app.vault.getAbstractFileByPath(pairs[i][0]), pairs[i][1]); if (i === ${pauseAfter}) await new Promise(r => setTimeout(r, ${pause})); } await ${B}.snapshotsSettle(); })().then(() => 1)`);
const FILE = '2026-09-12 09.15.40.snapshot', P1 = 'The Lighthouse/Part One';

test('binders: renames in a burst that pass a name from note to note: each note’s snapshots follow it, and none is lost or changed', withTidy(async (p, h, t) => {
	await seedSnapshot(p, 'Part One/Arrival', 'Arrival'); await seedSnapshot(p, 'Part One/The keeper', 'Keeper'); await seedSnapshot(p, 'Part One/Storm warning', 'Storm');
	await p.sleep(300);
	// Arrival and The keeper swap names by way of a short one, and Storm warning takes a new one, with no pause
	await renames(p, [[`${P1}/Arrival.md`, `${P1}/Q.md`], [`${P1}/The keeper.md`, `${P1}/Arrival.md`], [`${P1}/Storm warning.md`, `${P1}/Gale.md`], [`${P1}/Q.md`, `${P1}/The keeper.md`]]);
	await p.sleep(400);
	t.eq(j(await snapshotsOnDisk(p)), j({ [`Part One/Arrival/${FILE}`]: snapshotText('Keeper'), [`Part One/Gale/${FILE}`]: snapshotText('Storm'), [`Part One/The keeper/${FILE}`]: snapshotText('Arrival') }), 'the note now called Arrival has the keeper’s, the one now called The keeper has Arrival’s, Gale has the storm’s: three files, byte for byte, and no folder left under a name no note has');
	// three notes pass their names round in a ring (four renames)
	await renames(p, [[`${P1}/Arrival.md`, `${P1}/T.md`], [`${P1}/The keeper.md`, `${P1}/Arrival.md`], [`${P1}/Gale.md`, `${P1}/The keeper.md`], [`${P1}/T.md`, `${P1}/Gale.md`]]);
	await p.sleep(400);
	t.eq(j(await snapshotsOnDisk(p)), j({ [`Part One/Arrival/${FILE}`]: snapshotText('Arrival'), [`Part One/Gale/${FILE}`]: snapshotText('Keeper'), [`Part One/The keeper/${FILE}`]: snapshotText('Storm') }), 'a ring of three');
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Gale', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'and the binder note on disk lists each note once, where it was');
}));

test('binders: renames that come in while snapshots are being moved wait their turn: a swap finished a moment later is still followed', withTidy(async (p, h, t) => {
	await seedSnapshot(p, 'Part One/Arrival', 'Arrival'); await seedSnapshot(p, 'Part One/The keeper', 'Keeper');
	await p.sleep(300);
	// the first two renames, then the moment it takes the store to start moving snapshots (80 ms), then the third
	await renames(p, [[`${P1}/Arrival.md`, `${P1}/Q.md`], [`${P1}/The keeper.md`, `${P1}/Arrival.md`], [`${P1}/Q.md`, `${P1}/The keeper.md`]], 1, 85);
	await p.sleep(400);
	t.eq(j(await snapshotsOnDisk(p)), j({ [`Part One/Arrival/${FILE}`]: snapshotText('Keeper'), [`Part One/The keeper/${FILE}`]: snapshotText('Arrival') }), 'each note has the other’s old name and its own snapshots');
}));

test('binders: a folder renamed and a note in it renamed in the same burst: the folder’s snapshots go as one, the note’s follow its new name', withTidy(async (p, h, t) => {
	await seedSnapshot(p, 'Part One/Arrival', 'Arrival'); await seedSnapshot(p, 'Part One/The keeper', 'Keeper');
	await p.sleep(300);
	try {
		await renames(p, [[`${P1}/Arrival.md`, `${P1}/Landing.md`], [P1, 'The Lighthouse/Part 1'], ['The Lighthouse/Part 1/The keeper.md', 'The Lighthouse/Part 1/Arrival.md']]);
		await p.sleep(500);
		t.eq(j(await snapshotsOnDisk(p)), j({ [`Part 1/Arrival/${FILE}`]: snapshotText('Keeper'), [`Part 1/Landing/${FILE}`]: snapshotText('Arrival') }), 'under the folder’s new name, each under its note’s new name; nothing left under “Part One”');
		t.ok(!(await exists(p, `${SNAPS}/Part One`)), 'no empty folder is left behind');
	} finally {
		await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('The Lighthouse/Part 1'); if (f) await app.fileManager.renameFile(f, ${j(P1)}); })().then(() => 1)`);
		await p.sleep(400);
	}
}));

// Obsidian's "Make a copy" of a folder (`vault.copy`) makes "Part One 1" beside "Part One" and its files one by one.
test('binders: a folder copied by Obsidian goes right after its original, with what’s in it in the original’s order; the list on disk has every entry once', withTidy(async (p, h, t) => {
	const L = 'The Lighthouse', P1 = `${L}/Part One`;
	try { await copied(p, t, L, P1); } finally { await p.ev(`(async () => { const f = ${file(`${P1}/map.png`)}; if (f) await app.vault.delete(f); })().then(() => 1)`); }
}));
async function copied(p, t, L, P1) {
	// a folder inside, a file that isn't a note, a note the list doesn't mention, and the folder's own order not by name
	await p.ev(`(async () => { await app.vault.createFolder(${j(`${P1}/Letters`)}); await app.vault.create(${j(`${P1}/Letters/Second.md`)}, 'Second letter.'); await app.vault.create(${j(`${P1}/Letters/First.md`)}, 'First letter.'); await app.vault.createBinary(${j(`${P1}/map.png`)}, new Uint8Array([137, 80, 78, 71]).buffer); })().then(() => 1)`);
	await p.sleep(300);
	await p.ev(`(async () => { const s = ${B}; await s.move(${file(`${P1}/Letters`)}, ${file(P1)}, 1); await s.move(${file(`${P1}/Letters/Second.md`)}, ${file(`${P1}/Letters`)}, 0); await s.move(${file(`${P1}/map.png`)}, ${file(P1)}, 0); await s.flush(); await app.vault.create(${j(`${P1}/Unlisted.md`)}, 'Not in the list yet.'); })().then(() => 1)`);
	await p.sleep(300);
	const listed = await contents(p);
	t.eq(j(listed.slice(1, 9)), j(['Part One/', 'Part One/map.png', 'Part One/Arrival', 'Part One/Letters/', 'Part One/Letters/Second', 'Part One/Letters/First', 'Part One/The keeper', 'Part One/Storm warning']), 'to begin with');
	const before = await texts(p);
	await countWrites(p);
	await p.ev(`app.vault.copy(${file(P1)}, ${j(`${L}/Part One 1`)}).then(() => 1)`);
	t.ok(await until(p, `!!${file(`${L}/Part One 1/Letters/First.md`)} && !!${file(`${L}/Part One 1/Unlisted.md`)}`, 5000), 'the copy is made');
	t.eq(j(await p.ev(`(() => { const out = []; const walk = (f) => { for (const c of ${B}.orderedChildren(f) ?? []) { out.push(c.path.slice(${L.length + 1})); if (c.children) walk(c); } }; walk(${file(L)}); return out; })()`)), j([
		'Prologue.md',
		'Part One', 'Part One/map.png', 'Part One/Arrival.md', 'Part One/Letters', 'Part One/Letters/Second.md', 'Part One/Letters/First.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part One/Unlisted.md',
		'Part One 1', 'Part One 1/map.png', 'Part One 1/Arrival.md', 'Part One 1/Letters', 'Part One 1/Letters/Second.md', 'Part One 1/Letters/First.md', 'Part One 1/The keeper.md', 'Part One 1/Storm warning.md', 'Part One 1/Unlisted.md',
		'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md',
	]), 'the copy shows right after Part One, in Part One’s order (a note the list didn’t mention last, as in the original)');
	await p.sleep(700); await flush(p); await p.sleep(200);
	const now = await contents(p);
	t.eq(j(now), j(['Prologue', 'Part One/', 'Part One/map.png', 'Part One/Arrival', 'Part One/Letters/', 'Part One/Letters/Second', 'Part One/Letters/First', 'Part One/The keeper', 'Part One/Storm warning',
		'Part One 1/', 'Part One 1/map.png', 'Part One 1/Arrival', 'Part One 1/Letters/', 'Part One 1/Letters/Second', 'Part One 1/Letters/First', 'Part One 1/The keeper', 'Part One 1/Storm warning',
		'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the binder note on disk: every entry it had, in place, and the copy’s after Part One’s');
	t.eq(new Set(now).size, now.length, 'no entry twice');
	t.eq(await writes(p), 1, 'written once, after the last file arrived');
	await bodyKept(p, t, before);
	const after = await texts(p);
	same(t, before, after, { skip: [NOTE] });
	for (const n of ['Arrival', 'The keeper', 'Storm warning', 'Letters/First', 'Letters/Second', 'Unlisted']) t.eq(after[`${L}/Part One 1/${n}.md`], before[`${P1}/${n}.md`], `the copy of “${n}” has its text`);
	// the copy renamed (Obsidian leaves its name ready to type) keeps its place and order; a note made in it later goes last
	await p.ev(`app.fileManager.renameFile(${file(`${L}/Part One 1`)}, ${j(`${L}/Part One, again`)}).then(() => 1)`);
	await p.sleep(2200); // (past the moment the store still takes the folder for one being copied)
	await p.ev(`app.vault.create(${j(`${L}/Part One, again/Later.md`)}, 'Later.').then(() => 1)`);
	await p.sleep(300);
	t.eq(j(await children(p, `${L}/Part One, again`)), j(['map.png', 'Arrival.md', 'Letters', 'The keeper.md', 'Storm warning.md', 'Later.md', 'Unlisted.md']), 'renamed: the same order, and a new note after the listed ones');
	await flush(p); await p.sleep(200);
	t.eq(j((await contents(p)).slice(9, 17)), j(['Part One, again/', 'Part One, again/map.png', 'Part One, again/Arrival', 'Part One, again/Letters/', 'Part One, again/Letters/Second', 'Part One, again/Letters/First', 'Part One, again/The keeper', 'Part One, again/Storm warning']), 'and on disk');
}

test('binders: Binders’ own “Duplicate” of a folder is as it was: the copy after its original, in its order, its folder note renamed, one write', withTidy(async (p, h, t) => {
	const L = 'The Lighthouse', P1 = `${L}/Part One`;
	await addFolderNote(p);
	await p.ev(`(async () => { await ${B}.move(${file(`${P1}/Storm warning.md`)}, ${file(P1)}, 0); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(200);
	const before = await texts(p);
	await countWrites(p);
	t.eq(await p.ev(`${B}.duplicate(${file(P1)}).then(f => f.path)`), `${L}/Part One 2`, 'the copy, named by counting on');
	await p.sleep(700); await flush(p); await p.sleep(200);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper', 'Part One 2/', 'Part One 2/Storm warning', 'Part One 2/Arrival', 'Part One 2/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'on disk: after Part One, in its order');
	t.eq(await writes(p), 1, 'one write');
	t.eq(await read(p, `${L}/Part One 2/Part One 2.md`), before[FOLDER_NOTE], 'the folder note went along under the copy’s name, byte for byte');
	t.eq(j(await children(p, `${L}/Part One 2`)), j(['Storm warning.md', 'Arrival.md', 'The keeper.md']), 'and isn’t an item');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

// "Undo last move" from the command palette is for the binder in front. Only with nothing of a binder in front (the
// file explorer in use, a note outside every binder) is it for the binder that was changed last.
test('binders: “Undo last move” with one binder’s view or note in front never undoes a move made in another binder', withTidy(async (p, h, t) => {
	const L = 'The Lighthouse', cmd = (id) => `app.commands.commands['binders:${id}']`;
	const offered = (id) => p.ev(`!!${cmd(id)}.checkCallback(true)`);
	await p.ev(`(async () => { await app.vault.createFolder('Other'); await app.vault.create('Other/One.md', '1'); await app.vault.create('Other/Two.md', '2'); await ${B}.makeBinder(${file('Other')}); await app.vault.create('Loose.md', 'x'); })().then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('Other')})`);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
	try {
		await p.ev(`${B}.moveUp(${file(`${L}/Epilogue.md`)}).then(() => 1)`);
		await flush(p);
		const moved = await contents(p);
		t.ok(moved.indexOf('Epilogue') === moved.indexOf('Part Two/') - 1, 'Epilogue moved up in The Lighthouse, to before Part Two');
		// the other binder's view in front
		await p.ev(`app.plugins.plugins.binders.openBinder(${file('Other')}).then(() => 1)`); await p.sleep(600);
		t.ok(!(await offered('undo-move')), 'in the other binder’s view, with nothing to undo there: not offered');
		// a note of the other binder in front
		await h.open('Other/One.md'); await p.sleep(300);
		t.ok(!(await offered('undo-move')), 'nor with a note of the other binder open');
		t.eq(j(await contents(p)), j(moved), 'The Lighthouse’s list on disk is as the move left it');
		// a move there is the one its own view undoes, and The Lighthouse's stays
		await p.ev(`${B}.moveDown(${file('Other/One.md')}).then(() => 1)`);
		t.ok(await offered('undo-move'), 'a move in the other binder: offered there');
		await p.ev(`(() => { ${cmd('undo-move')}.checkCallback(false); return 1; })()`); await p.sleep(500); await flush(p);
		t.eq(j(await children(p, 'Other')), j(['One.md', 'Two.md']), 'and it’s that move that is undone');
		t.eq(j(await contents(p)), j(moved), 'The Lighthouse’s list is still as its move left it');
		t.ok(await offered('redo-move'), 'redo is offered there');
		// a note outside every binder in front: the binder changed last (redo made the other binder's the newest undo; here The Lighthouse's is what's left)
		await h.open('Loose.md'); await p.sleep(300);
		t.ok(await offered('undo-move'), 'with a note outside every binder in front: offered, for the binder changed last');
		await p.ev(`(() => { ${cmd('undo-move')}.checkCallback(false); return 1; })()`); await p.sleep(500); await flush(p);
		t.eq((await contents(p)).pop(), 'Epilogue', 'The Lighthouse’s move is undone, on disk');
		// back in The Lighthouse: its own redo
		await h.open(`${L}/Prologue.md`); await p.sleep(300);
		t.ok(await offered('redo-move'), 'in The Lighthouse again: its redo is offered');
	} finally {
		await p.ev(`(async () => { ${B}.undos = []; ${B}.redos = []; app.workspace.getLeavesOfType('binders-view').forEach(l => l.detach()); const f = ${file('Loose.md')}; if (f) await app.vault.delete(f); })().then(() => 1)`);
	}
}));
