// Revision tasks (src/revision/): the revision note a binder keeps its tasks in. Step 1: the note is found through the
// binder note's `revision` property and is never a scene, a count, a search hit, an export or the record's typing;
// it follows a rename and a move by the writer; it is read again when anything changes it; a binder's other
// properties and order are untouched; a Longform project has none; split and merge leave its links where they should be.
import { B, NOTE, PL, VIEW, card, clickMenu, cards, exists, file, flush, j, menuItems, openView, read, split, texts, until, withTidy } from './view-helpers.mjs';
import { open as openExport, pick as pickExport, press as pressExport, closeAll as closeExport } from './specs-export.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'revision: ' + name, fn: withTidy(fn) });

export const L = 'The Lighthouse', REV = `${L}/Revision.md`;
export const BN = `${B}.binderOf(${file(L)})`;
const R = `${PL}.revision`;
const SENTINEL = 'SENTINEL-REVISION-TEXT';
const ORDER = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((x) => `${L}/${x}.md`);

/** A note of tasks, as a writer might keep one (the first line says where each is about). */
export const TASKS = [
	`- [ ] [[Epilogue]]: ${SENTINEL} end it better`,
	`- [ ] [[Arrival]]: ${SENTINEL} say why nobody meets her`,
	'\t> She had been told a man would meet her.',
	'- [x] [[The keeper]]: already done',
	'- [ ] [[Lights out]], [[The wreck]]: two scenes at once',
	'- [ ] Check the tides against the almanac',
	'- [ ] [[Nowhere at all]]: a scene that is not there',
	'- [ ] [[Elsewhere note]]: a note outside the binder',
	'',
].join('\n');

/** Makes the revision note with this text and names it in the binder note, as the first task will: then waits for
    Binders to have it. */
export async function seed(p, text = TASKS, path = REV, link = '[[Revision]]') {
	await p.ev(`(async () => {
		const bn = ${BN}.note;
		if (!app.vault.getAbstractFileByPath(${j(path)})) await app.vault.create(${j(path)}, ${j(text)});
		await app.fileManager.processFrontMatter(bn, (fm) => { fm.revision = ${j(link)}; });
	})().then(() => 1)`);
	await until(p, `${R}.noteOf(${BN})?.path === ${j(path)}`);
	await p.sleep(250);
}
/** The tasks as the store lists them: the places in the order they are visited, each with its kind and task count. */
export const listing = (p) => p.ev(`(() => { const l = ${R}.list(${BN}); return JSON.stringify({ open: l.open, done: l.done, note: l.note?.path ?? null, groups: l.groups.map((g) => [g.place.kind, g.place.key, g.tasks.length]) }); })()`).then(JSON.parse);
const loaded = (p) => until(p, `${R}.list(${BN}).groups.length > 0`);

// ---- the note is not part of the book ----

test('the revision note is never a scene: not in the order, a card, a row, a count, a search, the record or an export', async (p, h, t) => {
	const bytes = await texts(p);
	await openView(p, L);
	const toolbar = () => p.ev(`/[\\d,]+ words/.exec(document.querySelector('.workspace-leaf.mod-active .binders-toolbar').textContent)?.[0] ?? null`);
	const scenesBefore = await p.ev(`${B}.scenes(${file(L)}).map((f) => f.path)`), cardsBefore = await cards(p), barBefore = await toolbar();
	t.eq(j(scenesBefore), j(ORDER), 'the scenes are the seven, in the binder’s order');
	// a note with a great many words, so any count it got into would show
	await seed(p, `${SENTINEL} ${'lorem '.repeat(600)}\n${TASKS}`);
	await p.sleep(400);
	t.eq(j(await p.ev(`${B}.scenes(${file(L)}).map((f) => f.path)`)), j(ORDER), 'still the seven scenes');
	t.ok(!(await p.ev(`${B}.orderedChildren(${file(L)}).some((f) => f.path === ${j(REV)})`)), 'not among the binder’s items');
	t.ok(!(await p.ev(`${B}.orderedChildren(${file(L)}, { hidden: true }).some((f) => f.path === ${j(REV)})`)), 'nor among the items with the hidden notes');
	t.eq(j(await cards(p)), j(cardsBefore), 'no card for it on the corkboard');
	t.eq(await toolbar(), barBefore, 'the toolbar’s count is the same (' + barBefore.replace(/\s+/g, ' ') + ')');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-outliner-row')`);
	t.ok(!(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-row')].some((r) => r.dataset.path === ${j(REV)})`)), 'no row in the outliner');
	t.eq(await toolbar(), barBefore, 'and the same count there');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!${VIEW}.current?.scenes?.length`);
	t.eq(j(await p.ev(`${VIEW}.current.scenes.map((s) => s.file.path)`)), j(ORDER), 'seven scenes in the manuscript, none of them the note');
	// the record of the writing: typing in the note is nobody’s scene
	t.eq(await p.ev(`${PL}.progress.binderOf(${file(REV)})`), null, 'typing in it is not counted in the binder’s record');
	t.ok(await p.ev(`!!${PL}.progress.binderOf(${file(ORDER[0])})`), 'while typing in a scene is');
	t.ok(await p.ev(`${B}.isRevisionNote(${file(REV)})`), 'the store knows it for the revision note');
	t.ok(!(await p.ev(`${B}.isRevisionNote(${file(ORDER[0])})`)), 'and a scene for no such thing');
	// an export: its text is not in the book
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await openExport(p);
	await pickExport(p, 'One note');
	await pressExport(p, 'Export');
	await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse (exported).md'`, 8000);
	const made = await read(p, 'The Lighthouse (exported).md');
	t.ok(made.length > 100 && !made.includes(SENTINEL) && !made.includes('lorem lorem'), 'the exported note has none of the revision note’s text');
	await closeExport(p);
	// nothing else in the vault moved
	const after = await texts(p);
	for (const [path, text] of Object.entries(bytes)) if (path !== NOTE) t.eq(after[path], text, `“${path}” is unchanged`);
	t.eq(after[REV].includes(SENTINEL), true, 'and the note is as written');
});

test('the revision note shows in the file explorer after the last scene', async (p, h, t) => {
	await seed(p);
	const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); for (const f of ${j([L, `${L}/Part One`, `${L}/Part Two`])}) ${EXP}.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(450);
	const rows = await p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path]')].map((e) => e.dataset.path).filter((x) => x.startsWith(${j(L + '/')}))`);
	t.eq(rows[rows.length - 1], REV, 'last, after the last scene: ' + rows.join(' | '));
	t.eq(rows.indexOf(`${L}/Epilogue.md`), rows.length - 2, 'right after Epilogue');
	t.ok(!rows.includes(NOTE), 'the binder note itself is still hidden');
});

test('the note is read through the binder note’s link: one a writer points elsewhere, one that names the binder note or nothing', async (p, h, t) => {
	await p.ev(`app.vault.create('My own fixes.md', ${j(TASKS)}).then(() => 1)`);
	await seed(p, TASKS, 'My own fixes.md', '[[My own fixes]]');
	await loaded(p);
	t.eq((await listing(p)).note, 'My own fixes.md', 'a note the writer keeps already, outside the binder folder');
	t.eq(j(await p.ev(`${B}.scenes(${file(L)}).map((f) => f.path)`)), j(ORDER), 'the scenes are the same');
	// the binder note itself, a folder’s note, a note that doesn’t exist, plain text: none is a revision note
	for (const [link, why] of [[`[[${L}]]`, 'the binder note'], ['[[No such note]]', 'a note that is not there'], ['', 'nothing'], ['not a link', 'text that names no note']]) {
		await p.ev(`app.fileManager.processFrontMatter(${BN}.note, (fm) => { fm.revision = ${j(link)}; }).then(() => 1)`);
		await until(p, `${R}.noteOf(${BN}) === null`);
		t.eq(await p.ev(`${R}.noteOf(${BN})`), null, `${why}: no revision note`);
		t.eq((await listing(p)).groups.length, 0, `${why}: no tasks`);
	}
	t.ok(!(await p.ev(`${B}.isRevisionNote(${file(L + '/The Lighthouse.md')})`)), 'the binder note is never taken for one');
});

// ---- the writer renames it, moves it, edits it, or changes it from outside ----

test('a rename and a move by the writer: the link follows, the note stays out of the book, the tasks are read, the binder’s order is untouched', async (p, h, t) => {
	const order = await p.ev(`JSON.stringify(app.metadataCache.getFileCache(${BN}.note).frontmatter.contents)`);
	await seed(p);
	await loaded(p);
	const f = (path) => file(path);
	await p.ev(`app.fileManager.renameFile(${f(REV)}, ${j(L + '/Fixes.md')}).then(() => 1)`);
	await until(p, `${R}.noteOf(${BN})?.path === ${j(L + '/Fixes.md')}`);
	await until(p, `app.metadataCache.getFileCache(${BN}.note).frontmatter.revision === '[[Fixes]]'`, 5000);
	t.eq(await p.ev(`app.metadataCache.getFileCache(${BN}.note).frontmatter.revision`), '[[Fixes]]', 'Obsidian rewrote the link in the binder note');
	t.eq((await listing(p)).open, 6, 'the six unfinished tasks are still read');
	t.ok(!(await p.ev(`${B}.scenes(${file(L)}).some((s) => s.path === ${j(L + '/Fixes.md')})`)), 'renamed, it is still not a scene');
	t.ok(await p.ev(`${B}.isRevisionNote(${f(L + '/Fixes.md')})`), 'and the store still knows it');
	// moved into a folder of the binder
	await p.ev(`app.fileManager.renameFile(${f(L + '/Fixes.md')}, ${j(L + '/Part One/Fixes.md')}).then(() => 1)`);
	await until(p, `${R}.noteOf(${BN})?.path === ${j(L + '/Part One/Fixes.md')}`);
	await p.sleep(400);
	t.ok(!(await p.ev(`${B}.scenes(${file(L)}).some((s) => s.path.endsWith('Fixes.md'))`)), 'moved into a folder of the binder, it is not a scene there either');
	t.ok(!(await p.ev(`${B}.orderedChildren(${file(L + '/Part One')}).some((s) => s.path.endsWith('Fixes.md'))`)), 'nor an item of that folder');
	t.eq((await listing(p)).open, 6, 'the tasks are read');
	// out of the binder altogether
	await p.ev(`app.fileManager.renameFile(${f(L + '/Part One/Fixes.md')}, 'Fixes.md').then(() => 1)`);
	await until(p, `${R}.noteOf(${BN})?.path === 'Fixes.md'`);
	t.eq((await listing(p)).open, 6, 'and from outside the binder’s folder');
	await flush(p);
	t.eq(await p.ev(`JSON.stringify(app.metadataCache.getFileCache(${BN}.note).frontmatter.contents)`), order, 'the binder’s order was not touched by any of it');
	t.eq(j(await p.ev(`${B}.scenes(${file(L)}).map((f) => f.path)`)), j(ORDER), 'and the scenes are the same seven');
});

test('the note is read again when it changes, whoever changes it: typing in it, a file written from outside, another plugin ticking a box', async (p, h, t) => {
	await seed(p);
	await loaded(p);
	t.eq((await listing(p)).open, 6, 'six unfinished to begin with');
	// another plugin ticks a box
	await p.ev(`app.vault.process(${file(REV)}, (s) => s.replace('- [ ] Check the tides', '- [x] Check the tides')).then(() => 1)`);
	await until(p, `${R}.list(${BN}).open === 5`);
	t.eq((await listing(p)).done, 2, 'a box ticked by another plugin: five open, two done');
	// a file written from outside (another device, a sync)
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(TASKS + '- [ ] [[Prologue]]: added on another device\n')}).then(() => 1)`);
	await until(p, `${R}.list(${BN}).open === 7`);
	t.eq((await listing(p)).done, 1, 'a file written from outside: seven open, one done');
	// typing in the note’s own tab
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(REV)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `app.workspace.activeEditor?.file?.path === ${j(REV)}`);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.replaceRange('- [ ] [[Prologue]]: typed here\\n', ed.offsetToPos(ed.getValue().length)); return 1; })()`);
	await until(p, `${R}.list(${BN}).open === 8`, 8000);
	t.eq((await listing(p)).open, 8, 'typing in its own tab: eight open once Obsidian has saved');
	// and a note that goes: no tasks, and nothing breaks
	await p.ev(`app.vault.delete(${file(REV)}).then(() => 1)`);
	await until(p, `${R}.noteOf(${BN}) === null || !app.vault.getAbstractFileByPath(${j(REV)})`);
	await p.sleep(300);
	t.eq((await listing(p)).groups.length, 0, 'deleted: no tasks');
});

test('what each task is about: in manuscript order, the book first, a task about two scenes under both and counted once, a missing scene and a note outside last', async (p, h, t) => {
	await p.ev(`app.vault.create('Elsewhere note.md', 'A note outside the binder.').then(() => 1)`);
	await seed(p);
	await loaded(p);
	const l = await listing(p);
	t.eq(l.open, 6, 'six unfinished (the two-scene task counted once)');
	t.eq(l.done, 1, 'one done');
	t.eq(j(l.groups.map((g) => g[1])), j(['', ...['Part One/Arrival', 'Part One/The keeper', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((x) => `${L}/${x}.md`), `!Elsewhere note.md`, '?Nowhere at all']), 'the book, then the scenes in manuscript order, then the note outside, then the missing one');
	t.eq(j(l.groups.map((g) => g[0])), j(['book', 'item', 'item', 'item', 'item', 'item', 'outside', 'missing']), 'what kind each is');
	t.eq(j(l.groups.map((g) => g[2])), j([1, 1, 1, 1, 1, 1, 1, 1]), 'a task each');
	t.eq(await p.ev(`${R}.openFor(${file(ORDER[1])})`), 1, '“open for” Arrival: one');
	t.eq(await p.ev(`${R}.openFor(${file(ORDER[2])})`), 0, '“open for” The keeper: none (its one is done)');
	t.eq(await p.ev(`${R}.openFor(${file(L + '/Part Two')})`), 1, '“open for” Part Two: the one task about two of its scenes, once');
	t.eq(await p.ev(`${R}.openFor(${file(L)})`), 3, '“open for” the whole binder folder counts the scenes’ tasks (the book’s and the missing and outside are not about a scene)');
	// move a scene: the order follows
	await p.ev(`${B}.moveDown(${file(ORDER[4])}).then(() => 1)`);
	await flush(p);
	await p.sleep(400);
	t.eq(j((await listing(p)).groups.map((g) => g[1]).filter((k) => k.includes('Part Two'))), j([`${L}/Part Two/Lights out.md`, `${L}/Part Two/The wreck.md`]), 'The wreck moved down: its tasks are visited after Lights out’s');
});

test('a Longform project has no revision note; the same property in a binder’s note is ignored in the project', async (p, h, t) => {
	const project = await p.ev(`${B}.all().filter((b) => b.kind === 'longform').map((b) => b.note.path)`);
	t.ok(project.length >= 1, 'the fixture has a Longform project');
	await p.ev(`(async () => { const b = ${B}.all().find((b) => b.kind === 'longform'); await app.vault.create('Longform demo/Revision.md', ${j(TASKS)}); await app.fileManager.processFrontMatter(b.note, (fm) => { fm.revision = '[[Revision]]'; }); })().then(() => 1)`);
	await p.sleep(600);
	t.eq(await p.ev(`${R}.noteOf(${B}.all().find((b) => b.kind === 'longform'))`), null, 'a Longform project’s note does not name a revision note');
});

// ---- split and merge ----

test('a split leaves the task on the first half; a merge points the merged-away note’s tasks at the one that stays, and undo puts them back', async (p, h, t) => {
	await seed(p, '- [ ] [[Arrival]]: about the first\n- [ ] [[Storm warning]]: about the one that will be merged away\n');
	await loaded(p);
	const before = await texts(p);
	// merge Arrival and Storm warning from the board
	await openView(p, L + '/Part One');
	const a = await p.at(card(`${L}/Part One/Arrival.md`)), s = await p.at(card(`${L}/Part One/Storm warning.md`));
	await p.click(a.x, a.t + 12);
	await p.click(s.x, s.t + 12, { modifiers: 2 });
	await p.right(s.x, s.y);
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal .mod-cta')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find((b) => b.textContent === 'Merge').click(); return 1; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + '/Part One/Storm warning.md')})`);
	await p.sleep(800);
	const merged = await read(p, REV);
	t.eq(merged, '- [ ] [[Arrival]]: about the first\n- [ ] [[Arrival]]: about the one that will be merged away\n', 'the merged-away note’s task now names the note that stays; nothing else in the note changed');
	await until(p, `${R}.list(${BN}).groups.length === 1`);
	t.eq(j((await listing(p)).groups.map((g) => [g[1], g[2]])), j([[`${L}/Part One/Arrival.md`, 2]]), 'both tasks are about Arrival');
	await p.ev(`(() => { app.commands.executeCommandById('binders:undo-move'); return 1; })()`);
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + '/Part One/Storm warning.md')})`, 8000);
	await p.sleep(1200);
	await flush(p);
	t.eq(await read(p, REV), before[REV], 'undo puts the revision note back byte for byte');
});

test('a split leaves the task on the first half, and the revision note is not touched', async (p, h, t) => {
	const A = `${L}/Part One/Arrival.md`;
	await p.ev(`app.vault.modify(${file(A)}, ${j('---\nsynopsis: Mara arrives.\n---\nThe boat left her on the jetty.\n\nShe walked up to the tower.\n')}).then(() => 1)`);
	await seed(p, '- [ ] [[Arrival]]: about the first half\n');
	await loaded(p);
	const note = await read(p, REV);
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(A)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `app.workspace.activeEditor?.file?.path === ${j(A)}`);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, i = ed.getValue().indexOf('She walked'); ed.focus(); ed.setCursor(ed.offsetToPos(i)); return 1; })()`);
	await p.ev(`(() => { app.commands.executeCommandById('binders:split-scene'); return 1; })()`);
	await until(p, `${B}.scenes(${file(L)}).length === 8`, 8000);
	await p.sleep(500);
	t.eq(await read(p, REV), note, 'the revision note is byte for byte what it was');
	t.eq(j((await listing(p)).groups.map((g) => [g[1], g[2]])), j([[A, 1]]), 'its task is still about Arrival, the first half');
});
