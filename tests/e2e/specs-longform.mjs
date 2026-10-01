// Longform projects as binders (src/longform.ts, the Longform parts of src/binders.ts): detection, order and groups,
// reordering that writes only `longform.scenes`, rename and delete tracking, "Convert to binder", and projects nested
// in a binder, and the three views on a project. Every test that changes files checks no text was lost.
import { VIEW, card, cards, openView } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'longform: ' + name, fn });

const B = `app.plugins.plugins.binders.binders`;
const DIR = 'Longform demo';
const INDEX = `${DIR}/Index.md`;
const PRISTINE_FOLDERS = ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', DIR];
const SCENES = ['Harbor', 'Ticket office', 'The crossing', 'Island', 'Return'];
const j = (x) => JSON.stringify(x);
const file = (path) => `app.vault.getAbstractFileByPath(${j(path)})`;
const scene = (name) => file(`${DIR}/${name}.md`);

async function until(p, expr, ms = 3000) {
	let v;
	for (let i = 0; i < ms / 50; i++) { v = await p.ev(expr).catch(() => undefined); if (v) return v; await p.sleep(50); }
	return v;
}
const read = (p, path) => p.ev(`app.vault.adapter.read(${j(path)})`);
const texts = (p) => p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
function split(text) {
	const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
	return m ? { yaml: m[1], body: m[2] } : { yaml: '', body: text };
}
/** The `scenes:` block inside `longform:` as written on disk, and the rest of the properties without it. */
function scenesBlock(yaml) {
	const lines = yaml.split('\n'), i = lines.findIndex((l) => /^ {2}scenes:/.test(l));
	let k = i + 1;
	while (k < lines.length && /^ {4}/.test(lines[k])) k++;
	return { block: lines.slice(i + 1, k).join('\n'), rest: [...lines.slice(0, i), ...lines.slice(k)].join('\n') };
}
const flush = (p) => p.ev(`${B}.flush().then(() => 1)`);
const names = (p, folder = DIR, hidden = false) => p.ev(`(${B}.orderedChildren(${file(folder)}, { hidden: ${hidden} }) || []).map(f => f.basename)`);
const countWrites = (p, path = INDEX) => p.ev(`(() => { window.__writes = 0; window.__ref && app.vault.offref(window.__ref); window.__ref = app.vault.on('modify', f => { if (f.path === ${j(path)}) window.__writes++; }); return 1; })()`);
const writes = (p) => p.ev(`window.__writes`);
async function tidy(p) {
	await p.ev(`(async () => {
		window.__ref && app.vault.offref(window.__ref); window.__ref = null;
		delete app.plugins.plugins.longform;
		const keep = new Set(${j(PRISTINE_FOLDERS)});
		const extra = app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !keep.has(f.path));
		for (const f of extra.sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		await ${B}.flush();
	})().then(() => 1)`);
	await p.sleep(100);
}
const withTidy = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await tidy(p); } };
function same(t, before, after, { skip = [], moved = {} } = {}) {
	for (const [path, text] of Object.entries(before)) {
		if (skip.includes(path)) continue;
		t.eq(after[moved[path] ?? path], text, `“${path}” is unchanged`);
	}
}
const kind = (p) => p.ev(`${B}.binderOf(${j(DIR + '/Harbor.md')})?.kind ?? null`);

test('a project is a binder: its order, groups, hidden index note and ignored notes', async (p, h, t) => {
	await p.ev(`${B}.ready.then(() => 1)`);
	t.eq(j(await p.ev(`${B}.all().filter(b => b.kind === 'longform').map(b => [b.folder.path, b.note.path])`)), j([[DIR, INDEX]]), 'one Longform project');
	t.ok(await p.ev(`${B}.isBinderFolder(${file(DIR)})`), 'its folder is a binder folder');
	t.eq(await p.ev(`${B}.binderOf(${scene('Island')}).note.path`), INDEX, 'a scene knows its project');
	t.ok(await p.ev(`${B}.isHiddenNote(${file(INDEX)})`), 'the index note is the hidden binder note');
	t.ok(!(await p.ev(`${B}.isHiddenNote(${scene('Harbor')})`)), 'a scene is not');
	t.eq(j(await names(p)), j(SCENES), 'scenes in Longform order; the ignored note left out');
	t.eq(j(await names(p, DIR, true)), j(['Index', ...SCENES]), 'with hidden notes, the index note first');
	t.eq(j(await p.ev(`${B}.scenes(${file(DIR)}).map(f => f.basename)`)), j(SCENES), 'reading order');
	t.eq(j(await p.ev(`${B}.groups(${file(DIR)}).map(g => [g.title, g.depth, g.head?.basename ?? null, g.continued, g.files.map(f => f.basename)])`)),
		j([[null, 0, null, false, ['Harbor']], ['Harbor', 1, 'Harbor', false, ['Ticket office', 'The crossing']], [null, 0, null, true, ['Island', 'Return']]]), 'groups: the indented scenes under the scene above them');
	t.eq(await p.ev(`${B}.folderNote(${file(DIR)}).path`), INDEX, 'the folder’s note is the index note');
	// the file explorer shows the same order, the index note hidden, the rest after
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const v = app.workspace.getLeavesOfType('file-explorer')[0].view; v.fileItems[${j(DIR)}]?.setCollapsed(false); return 1; })()`);
	await p.sleep(350);
	const rows = await p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith(${j(DIR + '/')}))`);
	t.eq(j(rows), j([...SCENES, 'Notes on ferries'].map((n) => `${DIR}/${n}.md`)), 'explorer: Longform order, index hidden, ignored note after');
});

test('the groups of a binder are its folders', async (p, h, t) => {
	t.eq(j(await p.ev(`${B}.groups(${file('The Lighthouse')}).map(g => [g.title, g.depth, g.folder.path, g.continued, g.files.map(f => f.basename)])`)), j([
		[null, 0, 'The Lighthouse', false, ['Prologue']],
		['Part One', 1, 'The Lighthouse/Part One', false, ['Arrival', 'The keeper', 'Storm warning']],
		['Part Two', 1, 'The Lighthouse/Part Two', false, ['The wreck', 'Lights out']],
		[null, 0, 'The Lighthouse', true, ['Epilogue']],
	]), 'one group per folder, in reading order');
	t.eq(j(await p.ev(`${B}.groups(${file('The Lighthouse/Part One')}).map(g => [g.title, g.depth])`)), j([[null, 0]]), 'from a subfolder');
	t.eq(j(await p.ev(`${B}.groups(app.vault.getRoot())`)), '[]', 'outside binders: none');
});

test('reordering writes only longform.scenes, once, in Longform’s shape', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await countWrites(p);
	t.ok(await p.ev(`${B}.moveDown(${scene('Island')})`), 'moves down');
	t.ok(await p.ev(`${B}.moveUp(${scene('Harbor')}).then(ok => !ok)`), 'the first can’t go up');
	t.eq(j(await names(p)), j(['Harbor', 'Ticket office', 'The crossing', 'Return', 'Island']), 'shows at once');
	await p.ev(`${B}.move(${scene('Return')}, ${file(DIR)}, 2, 1)`); // into the group, after Ticket office
	await flush(p);
	t.eq(await writes(p), 1, 'written once');
	const now = await read(p, INDEX), a = scenesBlock(split(now).yaml), b = scenesBlock(split(before[INDEX]).yaml);
	t.eq(a.block, ['    - Harbor', '    - - Ticket office', '      - Return', '      - The crossing', '    - Island'].join('\n'), 'nested list on disk');
	t.eq(a.rest, b.rest, 'every other property byte-for-byte');
	t.eq(split(now).body, split(before[INDEX]).body, 'the index note’s text is untouched');
	same(t, before, await texts(p), { skip: [INDEX] });
	t.eq(j(await p.ev(`${B}.groups(${file(DIR)}).map(g => g.files.map(f => f.basename))`)), j([['Harbor'], ['Ticket office', 'Return', 'The crossing'], ['Island']]), 'groups follow');
}));

test('new notes show after the listed scenes; new scenes are listed where they’re made', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create(${j(DIR + '/Aboard.md')}, 'On deck.').then(() => 1)`);
	await until(p, `${B}.scenes(${file(DIR)}).length === 6`);
	t.eq(j(await names(p)), j([...SCENES, 'Aboard']), 'an unlisted note shows last');
	await p.ev(`${B}.newScene(${file(DIR)}, 2, 'Queue').then(() => 1)`);
	await flush(p);
	t.eq(j(await names(p)), j(['Harbor', 'Ticket office', 'Queue', 'The crossing', 'Island', 'Return', 'Aboard']), 'the new scene in place');
	t.eq(scenesBlock(split(await read(p, INDEX)).yaml).block, ['    - Harbor', '    - - Ticket office', '      - Queue', '      - The crossing', '    - Island', '    - Return'].join('\n'), 'listed, in the group; the unlisted note stays unlisted');
}));

test('renames and deletes keep the list right, without Longform running', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await countWrites(p);
	await p.ev(`app.fileManager.renameFile(${scene('Ticket office')}, ${j(DIR + '/Ticket booth.md')}).then(() => 1)`);
	await p.ev(`app.vault.delete(${scene('Island')}).then(() => 1)`);
	t.eq(j(await names(p)), j(['Harbor', 'Ticket booth', 'The crossing', 'Return']), 'shows in place at once');
	await flush(p);
	t.eq(await writes(p), 1, 'written once');
	t.eq(scenesBlock(split(await read(p, INDEX)).yaml).block, ['    - Harbor', '    - - Ticket booth', '      - The crossing', '    - Return'].join('\n'), 'the list follows');
	same(t, before, await texts(p), { skip: [INDEX, `${DIR}/Island.md`], moved: { [`${DIR}/Ticket office.md`]: `${DIR}/Ticket booth.md` } });
	// moving a scene out of the project drops it; moving a note in shows it after the listed ones
	await p.ev(`app.fileManager.renameFile(${scene('Return')}, 'Return.md').then(() => 1)`);
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse/Epilogue.md')}, ${j(DIR + '/Epilogue.md')}).then(() => 1)`);
	await flush(p);
	t.eq(j(await names(p)), j(['Harbor', 'Ticket booth', 'The crossing', 'Epilogue']), 'moved out and in');
	t.ok(!/Return/.test(await read(p, INDEX)), 'moved out: dropped from the list');
	t.ok(!(await read(p, 'The Lighthouse/The Lighthouse.md')).includes('  - Epilogue'), 'and dropped from the binder it left');
	await p.ev(`app.vault.delete(${file('Return.md')}).then(() => 1)`);
}));

test('with Longform running, it tracks renames itself: Binders doesn’t write', withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.plugins.plugins.longform = { manifest: { id: 'longform' } }; return 1; })()`); // a stand-in
	const before = await read(p, INDEX);
	await countWrites(p);
	await p.ev(`app.fileManager.renameFile(${scene('The crossing')}, ${j(DIR + '/Crossing.md')}).then(() => 1)`);
	await p.ev(`app.vault.delete(${scene('Return')}).then(() => 1)`);
	t.eq(j(await names(p)), j(['Harbor', 'Ticket office', 'Crossing', 'Island']), 'still shows in place');
	await flush(p); await p.sleep(400);
	t.eq(await writes(p), 0, 'the index note isn’t written');
	t.eq(await read(p, INDEX), before, 'the index note is untouched');
	// reordering is still Binders' to write
	await p.ev(`${B}.moveUp(${scene('Island')})`);
	await flush(p);
	t.eq(await writes(p), 1, 'a reorder is written');
	await p.ev(`app.vault.create(${j(DIR + '/Return.md')}, 'She took the last boat back.\\n').then(() => 1)`);
}));

test('convert to binder, keeping Longform: no text lost, nothing moved', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`${B}.convertToBinder(${B}.binderOf(${file(INDEX)}), { folders: false, removeLongform: false }).then(() => 1)`);
	t.ok(await until(p, `${B}.binderOf(${j(DIR + '/Harbor.md')})?.kind === 'binder'`), 'now a binder');
	t.eq(await p.ev(`${B}.binderOf(${j(DIR + '/Harbor.md')}).note.path`), INDEX, 'the index note is its binder note');
	const { yaml, body } = split(await read(p, INDEX));
	t.ok(/^binder: 1$/m.test(yaml), 'binder: 1');
	t.ok(yaml.includes('contents:\n  - Harbor\n  - Ticket office\n  - The crossing\n  - Island\n  - Return'), 'contents in Longform order');
	t.eq(scenesBlock(yaml).block, scenesBlock(split(before[INDEX]).yaml).block, 'Longform’s list is kept');
	t.ok(/^ {2}ignoredFiles:/m.test(yaml) && /^plotlines:\n {2}- Ines/m.test(yaml), 'the rest of the properties kept');
	t.eq(body, split(before[INDEX]).body, 'the index note’s text is untouched');
	same(t, before, await texts(p), { skip: [INDEX] });
	t.eq(j(await names(p)), j([...SCENES, 'Notes on ferries']), 'the note Longform ignored is now a scene, last');
}));

test('convert to binder from the menu, moving groups into folders and removing Longform', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await h.open(`${DIR}/Harbor.md`);
	t.ok(await p.ev(`app.commands.findCommand('binders:convert-longform').checkCallback(true)`), 'offered in a Longform project');
	t.ok(!(await p.ev(`(async () => { await app.workspace.getLeaf(false).openFile(${file('The Lighthouse/Prologue.md')}); return app.commands.findCommand('binders:convert-longform').checkCallback(true); })()`)), 'not in a binder');
	await h.open(INDEX);
	await h.run('convert-longform');
	await until(p, `!!document.querySelector('.modal .checkbox-container')`);
	const modal = await p.ev(`document.querySelector('.modal').innerText`);
	t.ok(/Convert to binder/.test(modal) && /becomes the binder note/.test(modal) && /Notes on ferries/.test(modal), 'it says what will happen');
	t.ok(!/new folder/.test(modal), 'no folders unless asked');
	await p.ev(`(() => { document.querySelectorAll('.modal .checkbox-container').forEach(c => c.click()); return 1; })()`);
	await p.sleep(150);
	const modal2 = await p.ev(`document.querySelector('.modal').innerText`);
	t.ok(/“Harbor” is a new folder, and 2 notes move into it/.test(modal2), 'with folders: which');
	t.ok(/property is removed/.test(modal2), 'and the Longform property removed');
	t.eq(await read(p, INDEX), before[INDEX], 'nothing changed before confirming');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Convert').click(); return 1; })()`);
	t.ok(await until(p, `${B}.binderOf(${j(DIR + '/Harbor/Ticket office.md')})?.kind === 'binder'`), 'now a binder with a subfolder');
	t.ok(!(await p.ev(`!!document.querySelector('.modal')`)), 'the dialog closed');
	await flush(p);
	const { yaml, body } = split(await read(p, INDEX));
	t.ok(yaml.includes('contents:\n  - Harbor\n  - Harbor/\n  - Harbor/Ticket office\n  - Harbor/The crossing\n  - Island\n  - Return'), 'contents with the folder');
	t.ok(!/longform/.test(yaml) && /^plotlines:/m.test(yaml), 'longform removed, the rest kept');
	t.eq(body, split(before[INDEX]).body, 'the index note’s text is untouched');
	same(t, before, await texts(p), { skip: [INDEX], moved: { [`${DIR}/Ticket office.md`]: `${DIR}/Harbor/Ticket office.md`, [`${DIR}/The crossing.md`]: `${DIR}/Harbor/The crossing.md` } });
	t.eq(j(await p.ev(`${B}.scenes(${file(DIR)}).map(f => f.path)`)), j([`${DIR}/Harbor.md`, `${DIR}/Harbor/Ticket office.md`, `${DIR}/Harbor/The crossing.md`, `${DIR}/Island.md`, `${DIR}/Return.md`, `${DIR}/Notes on ferries.md`]), 'reading order kept');
}));

test('a Longform project inside a binder is ordinary notes', withTidy(async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder('The Lighthouse/Draft');
		await app.vault.create('The Lighthouse/Draft/A.md', 'A');
		await app.vault.create('The Lighthouse/Draft/B.md', 'B');
		await app.vault.create('The Lighthouse/Draft/Index.md', '---\\nlongform:\\n  format: scenes\\n  sceneFolder: /\\n  scenes:\\n    - B\\n    - A\\n---\\n');
	})().then(() => 1)`);
	await until(p, `app.metadataCache.getFileCache(${file('The Lighthouse/Draft/Index.md')})?.frontmatter?.longform`);
	await p.sleep(200);
	t.eq(j(await p.ev(`${B}.all().map(b => b.kind + ' ' + b.folder.path).sort()`)), j(['binder The Lighthouse', `longform ${DIR}`]), 'not a project');
	t.eq(await p.ev(`${B}.binderOf('The Lighthouse/Draft/A.md').folder.path`), 'The Lighthouse', 'its notes are in the binder');
	t.eq(j(await names(p, 'The Lighthouse/Draft')), j(['A', 'B', 'Index']), 'in the binder’s order (by name, unlisted), the index note an ordinary note');
	// and a single-note Longform project is never a binder
	await p.ev(`app.vault.create('Single.md', '---\\nlongform:\\n  format: single\\n---\\nText.').then(() => 1)`);
	await p.sleep(300);
	t.eq(await p.ev(`${B}.all().length`), 2, 'single-note projects are not binders');
}));

test('a project whose scenes are in a subfolder', withTidy(async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder('Novel/Scenes');
		await app.vault.create('Novel/Scenes/One.md', 'One');
		await app.vault.create('Novel/Scenes/Two.md', 'Two');
		await app.vault.create('Novel/Novel.md', '---\\nlongform:\\n  format: scenes\\n  sceneFolder: Scenes\\n  scenes:\\n    - Two\\n    - One\\nplotlines:\\n  - Ines\\n---\\nThe project.\\n');
	})().then(() => 1)`);
	t.ok(await until(p, `${B}.binderOf('Novel/Scenes/One.md')?.kind === 'longform'`), 'found');
	t.eq(await p.ev(`${B}.binderOf('Novel/Scenes/One.md').folder.path`), 'Novel/Scenes', 'the binder folder is the scene folder');
	t.eq(await p.ev(`${B}.binderOf(${file('Novel')})`), null, 'the project folder isn’t in it');
	t.eq(j(await names(p, 'Novel/Scenes')), j(['Two', 'One']), 'in order');
	await p.ev(`${B}.convertToBinder(${B}.binderOf('Novel/Scenes/One.md'), { folders: false, removeLongform: true }).then(() => 1)`);
	t.ok(await until(p, `${B}.binderOf('Novel/Scenes/One.md')?.kind === 'binder'`), 'converted');
	const { yaml } = split(await read(p, 'Novel/Scenes/Scenes.md'));
	t.ok(/^binder: 1$/m.test(yaml) && yaml.includes('contents:\n  - Two\n  - One'), 'a new binder note with the order');
	t.eq(await read(p, 'Novel/Novel.md'), '---\nplotlines:\n  - Ines\n---\nThe project.\n', 'the index note keeps everything but longform');
}));

const block = async (p) => scenesBlock(split(await read(p, INDEX)).yaml).block;
const groupsShown = (p) => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-group')].map(g => (g.querySelector('.binders-group-title')?.textContent ?? '') + ':' + [...g.querySelectorAll('.binders-card[data-path]')].map(c => c.dataset.path.split('/').pop().replace(/\\.md$/, '')).join(','))`);
const setMode = (p, m) => p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`).then(() => p.sleep(300));

test('corkboard: scenes in Longform order, indented scenes grouped under the scene above', withTidy(async (p, h, t) => {
	await openView(p, DIR);
	t.eq(j(await cards(p)), j(SCENES.map((n) => `${DIR}/${n}.md`)), 'cards in order');
	t.eq(j(await groupsShown(p)), j([':Harbor', 'Harbor:Ticket office,The crossing', ':Island,Return']), 'the group has the scene above it as heading');
	t.ok(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-group.is-indented').length === 1`), 'and is indented');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-view-synopsis')?.textContent`), 'Add a synopsis', 'the synopsis row edits the index note');
	// the heading selects its scene
	const hd = await p.at(`.workspace-leaf.mod-active .binders-group.is-indented .binders-group-title`);
	await p.click(hd.x, hd.y);
	t.eq(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-selected')].map(c => c.dataset.path).join()`), `${DIR}/Harbor.md`, 'the heading selects Harbor');
}));

test('corkboard: dragging a card into a group indents it; only longform.scenes changes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, DIR);
	const a = await p.at(card(`${DIR}/Return.md`)), b = await p.at(card(`${DIR}/The crossing.md`));
	await p.drag(a.x, a.t + 12, b.l + 10, b.y, 16);
	await p.sleep(300);
	await flush(p);
	t.eq(await block(p), ['    - Harbor', '    - - Ticket office', '      - Return', '      - The crossing', '    - Island'].join('\n'), 'into the group, before The crossing');
	t.eq(j(await groupsShown(p)), j([':Harbor', 'Harbor:Ticket office,Return,The crossing', ':Island']), 'shown in the group');
	same(t, before, await texts(p), { skip: [INDEX] });
	t.eq(scenesBlock(split(await read(p, INDEX)).yaml).rest, scenesBlock(split(before[INDEX]).yaml).rest, 'the rest of the index note’s properties unchanged');
	t.eq(split(await read(p, INDEX)).body, split(before[INDEX]).body, 'its text too');
	// and out again, to the end of the top level
	const c = await p.at(card(`${DIR}/Ticket office.md`)), end = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
	await p.drag(c.x, c.t + 12, end.x, end.y, 16);
	await p.sleep(300);
	await flush(p);
	t.eq(await block(p), ['    - Harbor', '    - - Return', '      - The crossing', '    - Island', '    - Ticket office'].join('\n'), 'out of the group, last');
}));

test('corkboard: a new card at the end of the project is listed once', withTidy(async (p, h, t) => {
	await openView(p, DIR);
	const tile = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
	await p.click(tile.x, tile.y);
	await p.type('Landfall');
	await p.key('Enter');
	await until(p, `!!${scene('Landfall')}`);
	await p.key('Escape');
	await flush(p);
	t.eq(await block(p), ['    - Harbor', '    - - Ticket office', '      - The crossing', '    - Island', '    - Return', '    - Landfall'].join('\n'), 'the new scene is last, once');
}));

test('corkboard: a new card in a group makes the scene there, in the group', withTidy(async (p, h, t) => {
	await openView(p, DIR);
	const nc = await p.at(`.workspace-leaf.mod-active .binders-group.is-indented .binders-card-new`);
	await p.click(nc.x, nc.y);
	await p.type('Queue');
	await p.key('Enter');
	await p.key('Escape');
	t.ok(await until(p, `!!${file(DIR + '/Queue.md')}`), 'the note is made in the scene folder');
	await flush(p);
	t.eq(await block(p), ['    - Harbor', '    - - Ticket office', '      - The crossing', '      - Queue', '    - Island', '    - Return'].join('\n'), 'listed at the end of the group');
	t.eq(j(await groupsShown(p)), j([':Harbor', 'Harbor:Ticket office,The crossing,Queue', ':Island,Return']), 'shown there');
}));

test('outliner: scenes indented as in Longform; a status from its cell writes only the scene; a row dragged under a group joins it', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, DIR);
	await setMode(p, 'outliner');
	const R = '.workspace-leaf.mod-active .binders-outliner-row';
	const rows = await p.ev(`[...document.querySelectorAll('${R}')].map((r) => [r.dataset.path.split('/').pop(), +r.getAttribute('aria-level')])`);
	t.eq(j(rows), j([['Harbor.md', 1], ['Ticket office.md', 2], ['The crossing.md', 2], ['Island.md', 1], ['Return.md', 1]]), 'rows in order, the group indented');
	t.eq(await p.ev(`document.querySelectorAll('${R}.is-folder').length`), 0, 'no folder rows');
	// a status from the row's cell
	const cell = await p.at(`${R}[data-path="${DIR}/Island.md"] [data-col="status"]`);
	await p.click(cell.x, cell.y); // (selects the row)
	await p.click(cell.x, cell.y); // (opens the cell's menu)
	await p.sleep(250);
	await p.ev(`(() => { [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === 'Draft').click(); return 1; })()`);
	t.ok(await until(p, `app.vault.adapter.read(${j(DIR + '/Island.md')}).then(s => s.includes('status: Draft'))`), 'the scene gets the status');
	await flush(p);
	same(t, before, await texts(p), { skip: [`${DIR}/Island.md`] });
	// dragging a row below the group's first row puts it in the group
	const r = await p.at(`${R}[data-path="${DIR}/Return.md"] .binders-outliner-name`), o = await p.at(`${R}[data-path="${DIR}/Ticket office.md"]`);
	await p.drag(r.x, r.y, o.x, o.t + o.h * 0.75, 16);
	await p.sleep(300);
	await flush(p);
	t.eq(await block(p), ['    - Harbor', '    - - Ticket office', '      - Return', '      - The crossing', '    - Island'].join('\n'), 'the row joins the group');
	t.eq(split(await read(p, INDEX)).body, split(before[INDEX]).body, 'the index note’s text is untouched');
}));

test('manuscript: every scene in Longform order, editable', withTidy(async (p, h, t) => {
	await openView(p, DIR);
	await setMode(p, 'manuscript');
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene').length === 5`);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-title')].map(e => e.textContent)`)), j(SCENES), 'sections in order, no headings');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-heading').length`), 0, 'no folder headings');
	// typing lands in that scene only
	const before = await texts(p), M = `${VIEW}.current`;
	await p.ev(`(async () => { const m = ${M}, s = m.scenes[3]; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); const n = ed.lastLine() - 1; ed.setCursor({ line: n, ch: ed.getLine(n).length }); return 1; })()`);
	await p.sleep(100);
	await p.type(' Only gulls.');
	await p.ev(`Promise.all(${M}.scenes.filter(s => s.live).map(s => s.live.flush())).then(() => 1)`);
	t.ok(await until(p, `app.vault.adapter.read(${j(DIR + '/Island.md')}).then(s => s.includes('Nobody met the ferry. Only gulls.'))`), 'typed into Island');
	same(t, before, await texts(p), { skip: [`${DIR}/Island.md`] });
}));
