// QA round 11, Longform projects: the odd and adversarial cases the existing longform specs don't reach. Names that
// YAML or a file system makes odd, renames of the index note and the project's folder, undo of a reorder, keys that
// indent a scene, split, duplicate and merge in a project, a project with one scene or none, an index note edited from
// outside while the binder is open, two index notes in one folder, a snapshot, nesting three deep, a list that starts
// indented, and an index note deleted. Every test that changes a file checks that no other text was lost.
import { VIEW, newNote, card, cards, openView, clickMenu, closeMenus, answer, until, read, texts, split, same, withTidy, j, file } from './view-helpers.mjs';

export const specs = [];
// (a test for a confirmed bug starts its name with "BUG: ", as the findings list does)
const test = (name, fn) => { const m = /^(BUG: )?(.*)$/.exec(name); specs.push({ name: (m[1] ?? '') + 'qa11 longform: ' + m[2], fn }); };

const B = `app.plugins.plugins.binders.binders`;
const DIR = 'Longform demo', INDEX = `${DIR}/Index.md`, FERRY = `${DIR}/The ferry.md`, PLAN = `${DIR}/Plan.md`;
const SCENES = ['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return'];
const scene = (name, folder = DIR) => file(`${folder}/${name}.md`);
const flush = (p) => p.ev(`${B}.flush().then(() => 1)`);
const names = (p, folder = DIR) => p.ev(`(${B}.orderedChildren(${file(folder)}, { hidden: false }) || []).map(f => f.basename)`);
const setMode = (p, m) => p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`).then(() => p.sleep(300));
/** Each scene in the file's `longform.scenes` as Obsidian reads it now, with its depth: [name, depth]. */
const diskPairs = (p, path = INDEX) => p.ev(`(() => {
	const fm = app.metadataCache.getFileCache(${file(path)})?.frontmatter, out = [];
	const walk = (a, d) => { for (const x of Array.isArray(a) ? a : []) { if (Array.isArray(x)) walk(x, d + 1); else out.push([String(x), d]); } };
	walk(fm?.longform?.scenes, 0); return out;
})()`);
/** Waits (a few seconds at most) until the file's list reads as `want`; returns what it reads last. */
async function pairsSettle(p, path, want) {
	let v;
	for (let i = 0; i < 60; i++) { v = await diskPairs(p, path); if (want == null || j(v) === j(want)) return v; await p.sleep(50); }
	return v;
}
/** The scenes as Binders groups them, with their depth: the same list, as the view sees it. */
const groupPairs = (p, folder = DIR) => p.ev(`${B}.groups(${file(folder)}).flatMap(g => g.files.map(f => [f.basename, g.depth]))`);
/** The head of each group that holds a scene, by its name (null at the top). */
const headsOf = (p, title) => p.ev(`${B}.groups(${file(DIR)}).filter(g => g.files.some(f => f.basename === ${j(title)})).map(g => g.head?.basename ?? null)`);
const waitFor = (p, expr, ms = 4000) => until(p, expr, ms);
const bodyOf = (text) => split(text).body;
const yamlOf = (text) => split(text).yaml;
/** The file's list without its `scenes` lines, so two versions of an index note can be compared line by line. */
const withoutScenes = (yaml) => {
	const lines = yaml.split('\n'), i = lines.findIndex((l) => /^ {2}scenes:/.test(l));
	if (i < 0) return yaml;
	let k = i + 1;
	while (k < lines.length && /^ {4}/.test(lines[k])) k++;
	return [...lines.slice(0, i), ...lines.slice(k)].join('\n');
};

// --------------------------------------------------------------------------------------------------------------------
// The list as written: names that YAML or a file name makes odd
// --------------------------------------------------------------------------------------------------------------------

test('scene names that look like YAML: listed as they are, shown in the list’s order, and still listed after a reorder', withTidy(async (p, h, t) => {
	const made = ['2041-03-02', 'Yes', '1984', '- wait', '[Draft] Tide', 'Night - the crossing'];
	await p.ev(`(async () => { for (const n of ${j(made)}) await app.vault.create(${j(DIR + '/')} + n + '.md', 'Text of ' + n + '.\\n'); })().then(() => 1)`);
	// the list as Longform writes it for these names: a number, a quoted dash and a flow-looking name in quotes
	const body = `---\nlongform:\n  format: scenes\n  title: The ferry\n  sceneFolder: /\n  scenes:\n    - 2041-03-02\n    - - Yes\n      - 1984\n    - Harbor\n    - - "- wait"\n      - Ticket office\n    - "[Draft] Tide"\n    - The crossing\n    - Island\n    - Night - the crossing\n    - Return\n  ignoredFiles:\n    - Notes*\n---\nA Longform project.\n`;
	await p.ev(`app.vault.adapter.write(${j(INDEX)}, ${j(body)}).then(() => 1)`);
	await waitFor(p, `${B}.binderOf(${scene('Harbor')})?.kind === 'longform'`);
	const want = ['2041-03-02', 'Yes', '1984', 'Harbor', '- wait', 'Ticket office', '[Draft] Tide', 'The crossing', 'Island', 'Night - the crossing', 'Return'];
	await waitFor(p, `(${B}.orderedChildren(${file(DIR)}) || []).length === ${want.length} && (${B}.orderedChildren(${file(DIR)}) || [])[0]?.basename === ${j(want[0])}`);
	t.eq(j(await names(p)), j(want), 'every name shown, in the list’s order (a date, a number, a dash and a bracket as written)');
	const parsed = await pairsSettle(p, INDEX, null);
	t.eq(j(parsed.map((x) => x[0])), j(want), 'and the list reads back with the same names');
	await openView(p, DIR);
	t.eq(j(await cards(p)), j(want.map((n) => `${DIR}/${n}.md`)), 'the corkboard shows them in the same order');
	// a reorder moves one to the top: every name must still be in the list, read back as the same name
	await p.ev(`${B}.move(${scene('Night - the crossing')}, ${file(DIR)}, 0, 0)`);
	await flush(p);
	const want2 = [['Night - the crossing', 0], ['2041-03-02', 0], ['Yes', 1], ['1984', 1], ['Harbor', 0], ['- wait', 1], ['Ticket office', 1], ['[Draft] Tide', 0], ['The crossing', 0], ['Island', 0], ['Return', 0]];
	t.eq(j(await pairsSettle(p, INDEX, want2)), j(want2), 'after the reorder, the list reads back with every name and depth');
	t.eq(j(await groupPairs(p)), j(want2), 'and the groups show what the file says');
	t.eq(bodyOf(await read(p, INDEX)), 'A Longform project.\n', 'the index note’s text is untouched');
	t.ok(/title: The ferry/.test(await read(p, INDEX)) && /ignoredFiles:/.test(await read(p, INDEX)), 'the rest of the properties are there');
}));

test('the index note renamed: it is still the project, and a reorder writes to the renamed note', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`app.fileManager.renameFile(${file(INDEX)}, ${j(FERRY)}).then(() => 1)`);
	await waitFor(p, `${B}.binderOf(${scene('Harbor')})?.note?.path === ${j(FERRY)}`);
	t.eq(await p.ev(`${B}.binderOf(${scene('Harbor')})?.kind`), 'longform', 'still a Longform project');
	t.eq(j(await names(p)), j(SCENES), 'the same order');
	await p.ev(`${B}.moveDown(${scene('Island')})`);
	await flush(p);
	const want = [['Harbor', 0], ['Ticket office', 1], ['The crossing', 1], ['Return', 0], ['Island', 0]];
	t.eq(j(await pairsSettle(p, FERRY, want)), j(want), 'the renamed note’s list is reordered');
	const after = await texts(p);
	t.ok(!(await p.ev(`!!app.vault.getAbstractFileByPath(${j(INDEX)})`)), 'the old name is gone');
	t.eq(bodyOf(after[FERRY]), bodyOf(before[INDEX]), 'its text is untouched');
	same(t, before, after, { skip: [INDEX, FERRY] });
}));

test('the project’s folder renamed: still a project, and a reorder writes its index note under the new name', withTidy(async (p, h, t) => {
	const NEW = 'Ferry book';
	try {
		await p.ev(`app.fileManager.renameFile(${file(DIR)}, ${j(NEW)}).then(() => 1)`);
		await waitFor(p, `${B}.binderOf(${scene('Harbor', NEW)})?.kind === 'longform'`);
		t.eq(j(await names(p, NEW)), j(SCENES), 'the same scenes, in order, in the renamed folder');
		const before = await texts(p);
		await p.ev(`${B}.moveUp(${scene('Return', NEW)})`);
		await flush(p);
		const want = [['Harbor', 0], ['Ticket office', 1], ['The crossing', 1], ['Return', 0], ['Island', 0]];
		t.eq(j(await pairsSettle(p, `${NEW}/Index.md`, want)), j(want), 'the renamed index note’s list is reordered');
		const after = await texts(p);
		same(t, before, after, { skip: [`${NEW}/Index.md`] });
		t.eq(bodyOf(after[`${NEW}/Index.md`]), bodyOf(before[`${NEW}/Index.md`]), 'its text is untouched');
	} finally {
		if (await p.ev(`!!app.vault.getAbstractFileByPath(${j(NEW)})`)) await p.ev(`app.fileManager.renameFile(${file(NEW)}, ${j(DIR)}).then(() => 1)`);
		await p.sleep(300);
	}
}));

// --------------------------------------------------------------------------------------------------------------------
// Undo, and the keys
// --------------------------------------------------------------------------------------------------------------------

test('undo of a reorder in a Longform project puts the index note back byte for byte', withTidy(async (p, h, t) => {
	const before = await read(p, INDEX);
	await p.ev(`${B}.moveDown(${scene('Island')})`);
	await flush(p);
	await waitFor(p, `app.vault.adapter.read(${j(INDEX)}).then(s => s !== ${j(before)})`);
	t.ok((await read(p, INDEX)) !== before, 'the reorder was written');
	await h.run('undo-move');
	await p.sleep(300);
	await flush(p);
	await waitFor(p, `app.vault.adapter.read(${j(INDEX)}).then(s => s === ${j(before)})`);
	t.eq(await read(p, INDEX), before, 'undo wrote the note back exactly as it was');
	t.eq(j(await names(p)), j(SCENES), 'and the order is back on screen');
}));

test('outliner: Alt+Right indents a scene into the group above, Alt+Left takes it out, and only the list changes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, DIR);
	await setMode(p, 'outliner');
	const R = '.workspace-leaf.mod-active .binders-outliner-row';
	const nm = await p.at(`${R}[data-path="${DIR}/Island.md"] .binders-outliner-name`);
	await p.click(nm.x, nm.y);
	await p.key('ArrowRight', 'alt');
	await flush(p);
	const indented = [['Harbor', 0], ['Ticket office', 1], ['The crossing', 1], ['Island', 1], ['Return', 0]];
	t.eq(j(await pairsSettle(p, INDEX, indented)), j(indented), 'Island is now indented under Harbor’s group');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${R}')].map((r) => [r.dataset.path.split('/').pop(), +r.getAttribute('aria-level')])`)),
		j([['Harbor.md', 1], ['Ticket office.md', 2], ['The crossing.md', 2], ['Island.md', 2], ['Return.md', 1]]), 'and the rows show it');
	await p.key('ArrowLeft', 'alt');
	await flush(p);
	t.eq(j(await pairsSettle(p, INDEX, [['Harbor', 0], ['Ticket office', 1], ['The crossing', 1], ['Island', 0], ['Return', 0]])), j([['Harbor', 0], ['Ticket office', 1], ['The crossing', 1], ['Island', 0], ['Return', 0]]), 'Alt+Left takes it back out');
	const after = await texts(p);
	t.eq(yamlOf(after[INDEX]), yamlOf(before[INDEX]), 'the index note’s properties are the same text as before');
	t.eq(bodyOf(after[INDEX]), bodyOf(before[INDEX]), 'and its text');
	same(t, before, after, { skip: [INDEX] });
}));

// --------------------------------------------------------------------------------------------------------------------
// Split, duplicate, merge in a project
// --------------------------------------------------------------------------------------------------------------------

test('split a scene that has scenes indented under it: the new scene is listed, and the group stays with the scene it belongs to', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${j(DIR + '/Harbor.md')}), x => x + '\\nThe ferry was late again.\\n').then(() => 1)`);
	await p.sleep(300);
	const before = await texts(p);
	await h.open(`${DIR}/Harbor.md`);
	await p.ev(`(() => { const ed = app.workspace.activeEditor?.editor; if (!ed) return 0; const L = ed.getValue().split('\\n'); const i = L.findIndex(l => l.startsWith('The ferry was late')); ed.setCursor({ line: i, ch: 0 }); return 1; })()`);
	await h.run('split-scene');
	await waitFor(p, `!!${scene('Harbor 2')}`);
	await flush(p);
	await p.sleep(300);
	t.ok(await p.ev(`!!${scene('Harbor 2')}`), 'the second part is a note of its own');
	const heads = await headsOf(p, 'Ticket office');
	t.eq(j(heads), j(['Harbor']), 'Ticket office is still under Harbor, not under the new scene: ' + j(heads));
	t.eq(j(await headsOf(p, 'The crossing')), j(['Harbor']), 'and so is The crossing');
	const after = await texts(p);
	t.ok(/The ferry was late again/.test(after[`${DIR}/Harbor 2.md`] ?? ''), 'the second part has the text after the cursor');
	t.ok(!/The ferry was late again/.test(after[`${DIR}/Harbor.md`] ?? ''), 'and Harbor no longer has it');
	t.eq(bodyOf(after[INDEX]), bodyOf(before[INDEX]), 'the index note’s text is untouched');
	t.eq(withoutScenes(yamlOf(after[INDEX])), withoutScenes(yamlOf(before[INDEX])), 'and its other properties');
}));

test('duplicate a scene that has scenes indented under it: the copy is listed, and the group stays with the scene it belongs to', withTidy(async (p, h, t) => {
	await openView(p, DIR);
	const c = await p.at(card(`${DIR}/Harbor.md`));
	await p.right(c.x, c.y);
	await p.sleep(200);
	await clickMenu(p, 'Duplicate');
	await waitFor(p, `!!${scene('Harbor 2')}`);
	await flush(p);
	await p.sleep(300);
	t.ok(await p.ev(`!!${scene('Harbor 2')}`), 'the copy is a note of its own');
	t.eq(j(await headsOf(p, 'Ticket office')), j(['Harbor']), 'Ticket office is still under Harbor, not the copy');
	t.eq(j(await headsOf(p, 'The crossing')), j(['Harbor']), 'and The crossing');
	await closeMenus(p);
}));

test('merge two scenes in a project: the text is joined in reading order, the other scene leaves the list, nothing else changes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, DIR);
	const a = await p.at(card(`${DIR}/Island.md`));
	await p.click(a.x, a.y);
	const b = await p.at(card(`${DIR}/Return.md`));
	await p.click(b.x, b.y, { modifiers: 2 });
	await p.sleep(200);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-selected')].map(c => c.dataset.path.split('/').pop())`)), j(['Island.md', 'Return.md']), 'both are selected');
	await p.right(b.x, b.y);
	await p.sleep(200);
	await clickMenu(p, 'Merge 2 notes');
	await answer(p, 'Merge');
	await waitFor(p, `!${file(DIR + '/Return.md')}`);
	await flush(p);
	await p.sleep(400);
	t.ok(!(await p.ev(`!!${scene('Return')}`)), 'Return is gone');
	t.ok(/^---\nstatus: draft\n---\nNobody met the ferry\.\n+She took the last boat back\.\n?$/.test(await read(p, `${DIR}/Island.md`)), 'Island has both texts, in order: ' + JSON.stringify(await read(p, `${DIR}/Island.md`)));
	t.eq(j(await names(p)), j(['Harbor', 'Ticket office', 'The crossing', 'Island']), 'the list shows the rest');
	t.eq(j(await pairsSettle(p, INDEX, [['Harbor', 0], ['Ticket office', 1], ['The crossing', 1], ['Island', 0]])), j([['Harbor', 0], ['Ticket office', 1], ['The crossing', 1], ['Island', 0]]), 'and the file lists the same');
	const after = await texts(p);
	same(t, before, after, { skip: [INDEX, `${DIR}/Island.md`, `${DIR}/Return.md`] });
	t.eq(bodyOf(after[INDEX]), bodyOf(before[INDEX]), 'the index note’s text is untouched');
}));

// --------------------------------------------------------------------------------------------------------------------
// Single-scene and empty projects
// --------------------------------------------------------------------------------------------------------------------

test('a project of one scene: one card, no group, nothing to move, and a new card is listed after it', withTidy(async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder('Short');
		await app.vault.create('Short/Short.md', '---\\nlongform:\\n  format: scenes\\n  sceneFolder: /\\n  scenes:\\n    - Only\\n---\\nThe one.\\n');
		await app.vault.create('Short/Only.md', 'Only scene.\\n');
	})().then(() => 1)`);
	await waitFor(p, `${B}.binderOf(${scene('Only', 'Short')})?.kind === 'longform'`);
	await openView(p, 'Short');
	t.eq(j(await cards(p)), j(['Short/Only.md']), 'one card');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-group-title').length`), 0, 'no group heading');
	t.ok(!(await p.ev(`${B}.moveDown(${scene('Only', 'Short')})`)), 'nothing to move down');
	t.ok(!(await p.ev(`${B}.moveUp(${scene('Only', 'Short')})`)), 'nothing to move up');
	await p.sleep(200);
	const before = await texts(p);
	await newNote(p, 'Second');
	await p.key('Escape');
	await waitFor(p, `!!${scene('Second', 'Short')}`);
	await flush(p);
	t.eq(j(await pairsSettle(p, 'Short/Short.md', [['Only', 0], ['Second', 0]])), j([['Only', 0], ['Second', 0]]), 'the new card is listed after it');
	const after = await texts(p);
	t.eq(bodyOf(after['Short/Short.md']), bodyOf(before['Short/Short.md']), 'the index note’s text is untouched');
	t.eq(after['Short/Only.md'], before['Short/Only.md'], 'and the scene’s');
}));

test('an empty project: its first card is listed, and only the scenes list is added to the index note', withTidy(async (p, h, t) => {
	const idx = '---\nlongform:\n  format: scenes\n  title: Nothing yet\n  sceneFolder: /\n---\nNo scenes.\n';
	await p.ev(`(async () => { await app.vault.createFolder('Empty'); await app.vault.create('Empty/Empty.md', ${j(idx)}); })().then(() => 1)`);
	await waitFor(p, `${B}.all().some(b => b.folder.path === 'Empty')`);
	await openView(p, 'Empty');
	t.eq(j(await cards(p)), '[]', 'no cards');
	await newNote(p, 'First');
	await p.key('Escape');
	await waitFor(p, `!!${scene('First', 'Empty')}`);
	await flush(p);
	const now = await read(p, 'Empty/Empty.md');
	t.eq(now, '---\nlongform:\n  format: scenes\n  title: Nothing yet\n  sceneFolder: /\n  scenes:\n    - First\n---\nNo scenes.\n', 'the index note gets a scenes list and nothing else changes');
	t.eq(j(await pairsSettle(p, 'Empty/Empty.md', [['First', 0]])), j([['First', 0]]), 'the list reads back');
}));

// --------------------------------------------------------------------------------------------------------------------
// Outside edits, two index notes, snapshots
// --------------------------------------------------------------------------------------------------------------------

test('the list edited in another app while the binder is open: the view follows it, and a reorder keeps that order and the other text', withTidy(async (p, h, t) => {
	await openView(p, DIR);
	t.eq(j(await cards(p)), j(SCENES.map((n) => `${DIR}/${n}.md`)), 'before: the usual order');
	const ext = `---\nlongform:\n  format: scenes\n  title: The ferry\n  workflow: Default Workflow\n  sceneFolder: /\n  scenes:\n    - Return\n    - Island\n    - Harbor\n    - - Ticket office\n      - The crossing\n  ignoredFiles:\n    - Notes*\nplotlines:\n  - Ines\n---\nA Longform project, edited in another app.\n`;
	await p.ev(`app.vault.adapter.write(${j(INDEX)}, ${j(ext)}).then(() => 1)`);
	const want = ['Return', 'Island', 'Harbor', 'Ticket office', 'The crossing'];
	await waitFor(p, `(${B}.orderedChildren(${file(DIR)}) || []).map(f => f.basename).join() === ${j(want.join())}`, 5000);
	t.eq(j(await names(p)), j(want), 'the scenes show in the order the other app wrote');
	const cardsWant = j(want.map((n) => `${DIR}/${n}.md`));
	await waitFor(p, `[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].map(c => c.dataset.path).join() === ${j(want.map((n) => `${DIR}/${n}.md`).join())}`, 4000);
	t.eq(j(await cards(p)), cardsWant, 'and the corkboard too (given four seconds to redraw)');
	await p.ev(`${B}.moveDown(${scene('Return')})`);
	await flush(p);
	const after = await read(p, INDEX);
	t.eq(j(await pairsSettle(p, INDEX, [['Island', 0], ['Return', 0], ['Harbor', 0], ['Ticket office', 1], ['The crossing', 1]])), j([['Island', 0], ['Return', 0], ['Harbor', 0], ['Ticket office', 1], ['The crossing', 1]]), 'the reorder is made on the other app’s order');
	t.eq(bodyOf(after), 'A Longform project, edited in another app.\n', 'the text the other app wrote is kept');
	t.ok(/title: The ferry/.test(after) && /workflow: Default Workflow/.test(after) && /plotlines:\n {2}- Ines/.test(after), 'and the other properties');
}));

test('two index notes in one folder: a reorder writes only one of them, and neither loses text', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create(${j(PLAN)}, '---\\nlongform:\\n  format: scenes\\n  sceneFolder: /\\n  scenes:\\n    - Island\\n---\\nA second plan.\\n').then(() => 1)`);
	await p.sleep(600);
	const before = await texts(p);
	await openView(p, DIR);
	await p.ev(`${B}.moveDown(${scene('Harbor')})`);
	await flush(p);
	await p.sleep(500);
	await flush(p);
	const after = await texts(p);
	const changed = [INDEX, PLAN].filter((x) => before[x] !== after[x]);
	t.ok(changed.length <= 1, 'at most one of the two index notes is written: ' + j(changed));
	for (const x of [INDEX, PLAN]) t.eq(bodyOf(after[x]), bodyOf(before[x]), `“${x}” keeps its text`);
	same(t, before, after, { skip: [INDEX, PLAN] });
}));

test('a snapshot of a scene in a project: nothing in the list changes, and the snapshot is not a scene', withTidy(async (p, h, t) => {
	const before = await texts(p);
	const filesBefore = j(await p.ev(`app.vault.getFiles().map(f => f.path).sort()`));
	await h.open(`${DIR}/Island.md`);
	t.ok(await p.ev(`app.commands.commands['binders:take-snapshot']?.checkCallback(true) === true`), 'the command is offered for a scene');
	await h.run('take-snapshot');
	await p.sleep(800);
	const made = JSON.parse(await p.ev(`JSON.stringify(app.vault.getFiles().map(f => f.path).sort().filter(x => !${filesBefore}.includes(x)))`));
	t.eq(made.length, 1, 'one file made: ' + j(made) + ' notices: ' + j(await p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent)`)));
	t.ok(made.every((k) => k.startsWith(`${DIR}/Snapshots/`)), 'in the project’s Snapshots folder, not beside the scenes');
	t.eq(j(await names(p)), j(SCENES), 'the scenes are the same five');
	t.eq(j(await p.ev(`(${B}.orderedChildren(${file(DIR)}) || []).map(f => f.basename)`)), j(SCENES), 'and the same five when the list is shown from the folder');
	const after = await texts(p);
	same(t, before, after);
	t.eq(await read(p, INDEX), before[INDEX], 'the index note is byte for byte as it was');
}));

// --------------------------------------------------------------------------------------------------------------------
// Nesting, and what a file may hold
// --------------------------------------------------------------------------------------------------------------------

test('scenes nested three deep in the file: shown as the file says, and a move keeps every other depth', withTidy(async (p, h, t) => {
	const deep = `---\nlongform:\n  format: scenes\n  sceneFolder: /\n  scenes:\n    - Harbor\n    - - Ticket office\n      - - The crossing\n      - Island\n    - Return\n  ignoredFiles:\n    - Notes*\n---\nDeep.\n`;
	await p.ev(`app.vault.adapter.write(${j(INDEX)}, ${j(deep)}).then(() => 1)`);
	const want = [['Harbor', 0], ['Ticket office', 1], ['The crossing', 2], ['Island', 1], ['Return', 0]];
	t.eq(j(await pairsSettle(p, INDEX, want)), j(want), 'read as nested');
	await waitFor(p, `(${B}.orderedChildren(${file(DIR)}) || []).length === 5`);
	await openView(p, DIR);
	t.eq(j(await cards(p)), j(SCENES.map((n) => `${DIR}/${n}.md`)), 'five cards, in order');
	const before = await texts(p);
	await p.ev(`${B}.move(${scene('Return')}, ${file(DIR)}, 0, 0)`);
	await flush(p);
	const want2 = [['Return', 0], ['Harbor', 0], ['Ticket office', 1], ['The crossing', 2], ['Island', 1]];
	t.eq(j(await pairsSettle(p, INDEX, want2)), j(want2), 'Return moved to the top; the depths of the rest are kept');
	t.eq(j(await groupPairs(p)), j(want2), 'and the groups agree with the file');
	const after = await texts(p);
	t.eq(bodyOf(after[INDEX]), 'Deep.\n', 'the text is untouched');
	same(t, before, after, { skip: [INDEX] });
}));

test('a list that begins indented: no scene is lost by a reorder, and the groups still agree with the file', withTidy(async (p, h, t) => {
	const odd = `---\nlongform:\n  format: scenes\n  sceneFolder: /\n  scenes:\n    - - Ticket office\n      - The crossing\n    - Harbor\n    - Island\n    - Return\n  ignoredFiles:\n    - Notes*\n---\nStarts indented.\n`;
	await p.ev(`app.vault.adapter.write(${j(INDEX)}, ${j(odd)}).then(() => 1)`);
	const want = [['Ticket office', 1], ['The crossing', 1], ['Harbor', 0], ['Island', 0], ['Return', 0]];
	t.eq(j(await pairsSettle(p, INDEX, want)), j(want), 'read as the file says');
	await waitFor(p, `(${B}.orderedChildren(${file(DIR)}) || []).length === 5`);
	await openView(p, DIR);
	t.eq(j(await cards(p)), j(['Ticket office', 'The crossing', 'Harbor', 'Island', 'Return'].map((n) => `${DIR}/${n}.md`)), 'five cards, in order, no crash');
	await p.ev(`${B}.move(${scene('Return')}, ${file(DIR)}, 0, 0)`);
	await flush(p);
	const want2 = [['Return', 0], ['Ticket office', 1], ['The crossing', 1], ['Harbor', 0], ['Island', 0]];
	t.eq(j(await pairsSettle(p, INDEX, want2)), j(want2), 'Return first; all five still listed');
	t.eq(j(await groupPairs(p)), j(want2), 'the groups agree with the file');
	t.eq(bodyOf(await read(p, INDEX)), 'Starts indented.\n', 'the text is untouched');
}));

test('the index note deleted: the project ends, its scenes stay as ordinary notes, and no other note changes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`app.vault.delete(${file(INDEX)}).then(() => 1)`);
	await p.sleep(700);
	t.ok(!(await p.ev(`!!${B}.binderOf(${scene('Harbor')})`)), 'no project any more');
	for (const s of SCENES) t.ok(await p.ev(`!!${scene(s)}`), `“${s}” is still there`);
	const after = await texts(p);
	same(t, before, after, { skip: [INDEX] });
}));
