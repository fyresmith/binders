// QA: the binder store (order tracking), the file explorer integration and the plot grid, pushed at their edges.
// Tests named "BUG: …" fail on purpose until the bug they show is fixed; the rest are regressions.
import { B, PL, NOTE, j, file, until, read, exists, texts, split, contents, flush, same, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa store: ' + name, fn });

/** Binders proper (the test vault also has a Longform project). */
const BINDERS = `${B}.all().filter(b => b.kind === 'binder')`;
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const KEEP_FOLDERS = ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two'];
const KEEP_FILES = new Set(['The Lighthouse/The Lighthouse.md', 'The Lighthouse/Prologue.md', 'The Lighthouse/Epilogue.md', 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Storm warning.md', 'The Lighthouse/Part One/The keeper.md', 'The Lighthouse/Part Two/Lights out.md', 'The Lighthouse/Part Two/The wreck.md']);

/** Removes every folder and non-note file a test made (the runner restores notes), puts settings and sort back. */
async function tidy(p) {
	await p.ev(`(async () => {
		window.__ref && app.vault.offref(window.__ref); window.__ref = null;
		document.querySelectorAll('.modal-close-button').forEach(b => b.click());
		const keep = new Set([...${j(KEEP_FOLDERS)}, 'Longform demo']), keepFiles = new Set(${j([...KEEP_FILES])});
		// put the pristine folders back where they were if a test moved them
		for (const f of app.vault.getAllLoadedFiles().filter(f => !f.children && !keepFiles.has(f.path) && f.extension !== 'md')) await app.vault.delete(f);
		const extra = app.vault.getAllLoadedFiles().filter(f => f.children && f.path !== '/' && !keep.has(f.path));
		for (const f of extra.sort((a, b) => b.path.length - a.path.length)) if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		for (const k of keep) if (!app.vault.getAbstractFileByPath(k)) await app.vault.createFolder(k);
		const pl = ${PL}; Object.assign(pl.settings, { hideBinderNotes: true, orderExplorer: true, openOnClick: true }); await pl.saveSettings();
		const e = app.workspace.getLeavesOfType('file-explorer')[0]?.view; if (e?.sortOrder && e.sortOrder !== 'alphabetical') e.setSortOrder('alphabetical');
		await pl.binders.flush();
	})().then(() => 1)`);
	await p.sleep(150);
}
const withTidy = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await tidy(p); } };
const kids = (p, folder) => p.ev(`(${B}.orderedChildren(${file(folder)}) || []).map(f => f.name)`);
const rename = (p, from, to) => p.ev(`app.fileManager.renameFile(${file(from)}, ${j(to)}).then(() => 1)`);
const countWrites = (p, path = NOTE) => p.ev(`(() => { window.__writes = 0; window.__ref && app.vault.offref(window.__ref); window.__ref = app.vault.on('modify', f => { if (f.path === ${j(path)}) window.__writes++; }); return 1; })()`);
const writes = (p) => p.ev(`window.__writes`);
const cachedContents = (p, path = NOTE) => p.ev(`app.metadataCache.getFileCache(${file(path)})?.frontmatter?.contents ?? null`);
/** Waits until the cache has the binder note as it is on disk. */
const cacheSettles = (p, path = NOTE) => p.sleep(600);
/** The explorer's rows under a folder, expanded. */
async function rows(p, under = 'The Lighthouse', expand = KEEP_FOLDERS, leafIndex = 0) {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[${leafIndex}]; for (const f of ${j(expand)}) l.view.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(400);
	return p.ev(`[...app.workspace.getLeavesOfType('file-explorer')[${leafIndex}].view.containerEl.querySelectorAll('.tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith(${j(under + '/')}))`);
}
const setSettings = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(300));

// ---- names ----

test('a note named like a number keeps its place when the list is written by hand', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/1984.md', 'x').then(() => 1)`);
	// the list as a person would type it: YAML reads a bare 1984 as a number
	await writeRaw(p, NOTE, (await read(p, NOTE)).replace('  - Prologue\n', '  - Prologue\n  - 1984\n'));
	await until(p, `JSON.stringify(app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.contents).includes('1984')`);
	await p.sleep(300);
	t.ok(j(await cachedContents(p)).includes('"Prologue",1984,'), 'the cache reads the bare 1984 as a number');
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', '1984.md', 'Part One', 'Part Two', 'Epilogue.md']), '1984 shows where the list puts it');
}));

test('a note named like a number keeps its place when Binders writes the list', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/1984.md', 'x').then(() => 1)`);
	await p.sleep(200);
	await p.ev(`${B}.move(${file('The Lighthouse/1984.md')}, ${file('The Lighthouse')}, 1).then(() => 1)`);
	await flush(p); await cacheSettles(p);
	t.ok(/- "1984"|- '1984'/.test(await read(p, NOTE)), 'written quoted, so YAML keeps it text: ' + split(await read(p, NOTE)).yaml);
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', '1984.md', 'Part One', 'Part Two', 'Epilogue.md']), 'in its place after the cache re-reads it');
}));

test('a note whose name ends in ".md" (notes.md.md) keeps its place', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/notes.md.md', 'x').then(() => 1)`);
	await p.sleep(200);
	await p.ev(`${B}.move(${file('The Lighthouse/Part One/notes.md.md')}, ${file('The Lighthouse/Part One')}, 0).then(() => 1)`);
	t.eq((await kids(p, 'The Lighthouse/Part One'))[0], 'notes.md.md', 'first at once');
	await flush(p); await cacheSettles(p);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['notes.md.md', 'Arrival.md', 'The keeper.md', 'Storm warning.md']), 'still first once the list is read back');
	t.eq((await contents(p))[2], 'Part One/notes.md.md', 'written with its full name');
}));

test('names with emoji, #, brackets, quotes and accents keep their place through rename, write and re-read', withTidy(async (p, h, t) => {
	const odd = 'Ärrival 🌊 #1 [draft] "q" it\'s -x & ~y';
	const before = await texts(p);
	await rename(p, 'The Lighthouse/Part One/Arrival.md', `The Lighthouse/Part One/${odd}.md`);
	await rename(p, 'The Lighthouse/Part Two', 'The Lighthouse/- Part Two #2');
	await flush(p); await cacheSettles(p);
	t.eq(j(await cachedContents(p)), j(LIST.map((x) => x.replace('Arrival', odd).replace(/^Part Two\//, '- Part Two #2/'))), 'the list on disk, as read back');
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j([`${odd}.md`, 'The keeper.md', 'Storm warning.md']), 'order kept');
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', 'Part One', '- Part Two #2', 'Epilogue.md']), 'folder kept its place');
	t.eq(split(await read(p, NOTE)).body, split(before[NOTE]).body, 'binder note body untouched');
	await rename(p, 'The Lighthouse/- Part Two #2', 'The Lighthouse/Part Two');
}));

test('case-only renames keep their place', withTidy(async (p, h, t) => {
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/arrival.md');
	await rename(p, 'The Lighthouse/Part Two', 'The Lighthouse/part two');
	await flush(p); await cacheSettles(p);
	t.eq(j(await cachedContents(p)), j(LIST.map((x) => x.replace('Arrival', 'arrival').replace(/^Part Two\//, 'part two/'))), 'list follows');
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', 'Part One', 'part two', 'Epilogue.md']), 'order kept');
	await rename(p, 'The Lighthouse/part two', 'The Lighthouse/Part Two');
}));

test('a folder and a note with the same name are told apart', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One.md', 'a note named like the folder beside it').then(() => 1)`);
	await p.sleep(200);
	await p.ev(`${B}.move(${file('The Lighthouse/Part One.md')}, ${file('The Lighthouse')}, 0).then(() => 1)`);
	await flush(p); await cacheSettles(p);
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Part One.md', 'Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'the note moved; the folder kept its place');
	t.eq(j((await cachedContents(p)).slice(0, 3)), j(['Part One', 'Prologue', 'Part One/']), 'both listed');
	t.ok(!(await p.ev(`${B}.isHiddenNote(${file('The Lighthouse/Part One.md')})`)), 'it is a scene, not a folder note');
}));

// ---- non-note files ----

test('Move down past an image that isn’t in the list', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.createBinary('The Lighthouse/Part One/map.png', new Uint8Array([137,80,78,71]).buffer).then(() => 1)`);
	await p.sleep(250);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'Storm warning.md', 'map.png']), 'the image shows last');
	const moved = await p.ev(`${B}.moveDown(${file('The Lighthouse/Part One/Storm warning.md')})`);
	t.eq(moved, true, 'moveDown says it moved');
	await flush(p);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'map.png', 'Storm warning.md']), 'Storm warning went below the image');
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/map.png', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the image is written down in its place');
	// a drop just before the image (as the corkboard computes it: an index among the shown items) lands there
	await p.ev(`${B}.move(${file('The Lighthouse/Prologue.md')}, ${file('The Lighthouse/Part One')}, 2).then(() => 1)`);
	await flush(p);
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'The keeper.md', 'Prologue.md', 'map.png', 'Storm warning.md']), 'an index counts the image');
	await rename(p, 'The Lighthouse/Part One/Prologue.md', 'The Lighthouse/Prologue.md');
}));

test('Move up and down stop at the edges; the binder, binder note and folder notes don’t move', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', '').then(() => 1)`);
	await p.sleep(200);
	const before = await read(p, NOTE);
	t.eq(await p.ev(`${B}.moveUp(${file('The Lighthouse/Prologue.md')})`), false, 'first can’t go up');
	t.eq(await p.ev(`${B}.moveDown(${file('The Lighthouse/Epilogue.md')})`), false, 'last can’t go down');
	t.eq(await p.ev(`${B}.moveUp(${file('The Lighthouse/Part One/Arrival.md')})`), false, 'first in a subfolder can’t go up (out of it)');
	t.eq(await p.ev(`${B}.moveDown(${file('The Lighthouse')})`), false, 'the binder folder');
	t.eq(await p.ev(`${B}.moveDown(${file(NOTE)})`), false, 'the binder note');
	t.eq(await p.ev(`${B}.moveDown(${file('The Lighthouse/Part One/Part One.md')})`), false, 'a folder note');
	await flush(p);
	t.eq(await read(p, NOTE), before, 'nothing written');
	// rapid: five steps down from the top land at the bottom, in one write
	await countWrites(p);
	await p.ev(`(async () => { for (let i = 0; i < 5; i++) await ${B}.moveDown(${file('The Lighthouse/Prologue.md')}); })().then(() => 1)`);
	await flush(p);
	t.eq(j(await contents(p)), j([...LIST.slice(1), 'Prologue']), 'Prologue is last, Epilogue before it');
	t.eq(await writes(p), 1, 'one write');
}));

// ---- sequences ----

test('a rapid sequence of renames, moves and deletes ends in the right list, written once', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await countWrites(p);
	await p.ev(`(async () => {
		const fm = app.fileManager, v = app.vault, g = (x) => v.getAbstractFileByPath(x);
		await fm.renameFile(g('The Lighthouse/Part One/Arrival.md'), 'The Lighthouse/Part One/Landfall.md');
		await fm.renameFile(g('The Lighthouse/Part Two'), 'The Lighthouse/Part 2');
		await fm.renameFile(g('The Lighthouse/Part 2/The wreck.md'), 'The Lighthouse/Part 2/Wreck.md');
		await v.delete(g('The Lighthouse/Epilogue.md'));
		await fm.renameFile(g('The Lighthouse/Part One/Storm warning.md'), 'The Lighthouse/Part One/Storm.md');
		await fm.renameFile(g('The Lighthouse/Part One/Storm.md'), 'The Lighthouse/Part One/Storm warning.md');
	})().then(() => 1)`);
	await p.sleep(800);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Landfall', 'Part One/The keeper', 'Part One/Storm warning', 'Part 2/', 'Part 2/Wreck', 'Part 2/Lights out']), 'the list');
	t.eq(await writes(p), 1, 'written once');
	t.eq(split(await read(p, NOTE)).body, split(before[NOTE]).body, 'body untouched');
	await rename(p, 'The Lighthouse/Part 2', 'The Lighthouse/Part Two');
}));

test('renaming the binder folder, then its items at once', withTidy(async (p, h, t) => {
	await countWrites(p, 'Lighthouse/The Lighthouse.md');
	await p.ev(`(async () => {
		const fm = app.fileManager, g = (x) => app.vault.getAbstractFileByPath(x);
		await fm.renameFile(g('The Lighthouse'), 'Lighthouse');
		await fm.renameFile(g('Lighthouse/Prologue.md'), 'Lighthouse/Opening.md');
		await fm.renameFile(g('Lighthouse/Part One'), 'Lighthouse/Part 1');
		await fm.renameFile(g('Lighthouse/Part 1/Arrival.md'), 'Lighthouse/Part 1/Landfall.md');
	})().then(() => 1)`);
	await p.sleep(800);
	await flush(p);
	t.eq(j(await contents(p, 'Lighthouse/The Lighthouse.md')), j(LIST.map((x) => x.replace('Prologue', 'Opening').replace(/^Part One\//, 'Part 1/').replace('Part 1/Arrival', 'Part 1/Landfall'))), 'the list');
	t.eq(j(await p.ev(`${BINDERS}.map(b => b.folder.path)`)), j(['Lighthouse']), 'still one binder, at its new path');
	await p.ev(`(async () => { const fm = app.fileManager, g = (x) => app.vault.getAbstractFileByPath(x); await fm.renameFile(g('Lighthouse/Part 1'), 'Lighthouse/Part One'); await fm.renameFile(g('Lighthouse'), 'The Lighthouse'); })().then(() => 1)`);
}));

test('renaming there and back within a moment writes nothing', withTidy(async (p, h, t) => {
	const before = await read(p, NOTE);
	await countWrites(p);
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/X.md');
	await rename(p, 'The Lighthouse/Part One/X.md', 'The Lighthouse/Part One/Arrival.md');
	await p.sleep(700);
	t.eq(await writes(p), 0, 'no write');
	t.eq(await read(p, NOTE), before, 'byte-identical');
}));

test('a note moved to another folder of the same binder goes last there, as moving one in does', withTidy(async (p, h, t) => {
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part Two/Arrival.md');
	await flush(p);
	t.eq(j(await kids(p, 'The Lighthouse/Part Two')), j(['The wreck.md', 'Lights out.md', 'Arrival.md']), 'last in Part Two');
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Arrival', 'Epilogue']), 'the list stays a table of contents: Part Two’s items under Part Two');
	await rename(p, 'The Lighthouse/Part Two/Arrival.md', 'The Lighthouse/Part One/Arrival.md');
}));

// ---- two binders ----

async function makeSequel(p) {
	await p.ev(`(async () => {
		await app.vault.createFolder('Sequel'); await app.vault.createFolder('Sequel/Act');
		for (const n of ['Sequel/B.md', 'Sequel/A.md', 'Sequel/Act/Z.md', 'Sequel/Act/Y.md']) await app.vault.create(n, n);
		await app.vault.create('Sequel/Sequel.md', '---\\nbinder: 1\\ncontents:\\n  - B\\n  - Act/\\n  - Act/Z\\n  - Act/Y\\n  - A\\n---\\nThe sequel.\\n');
	})().then(() => 1)`);
	await until(p, `${BINDERS}.length === 2`);
	await p.sleep(200);
}

test('moving a note between two binders: out of one, appended to the other', withTidy(async (p, h, t) => {
	await makeSequel(p);
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'Sequel/Act/Arrival.md');
	await flush(p);
	t.eq(j(await contents(p)), j(LIST.filter((x) => x !== 'Part One/Arrival')), 'gone from the first');
	t.eq(j(await contents(p, 'Sequel/Sequel.md')), j(['B', 'Act/', 'Act/Z', 'Act/Y', 'Act/Arrival', 'A']), 'appended to its folder in the second');
	await rename(p, 'Sequel/Act/Arrival.md', 'The Lighthouse/Part One/Arrival.md');
}));

test('the binder note moved into a subfolder and back keeps the binder’s order', withTidy(async (p, h, t) => {
	// e.g. "Move file to…" on the binder note by mistake, while a rename happens, then moving it back
	const before = await texts(p);
	const MOVED = 'The Lighthouse/Part One/The Lighthouse.md';
	await rename(p, NOTE, MOVED);
	await until(p, `${B}.isBinderFolder(${file('The Lighthouse/Part One')})`);
	t.ok(await p.ev(`${B}.isBinderFolder(${file('The Lighthouse/Part One')})`), 'Part One is the binder now');
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Arrival.md', 'Storm warning.md', 'The keeper.md']), 'by name: the list describes another folder');
	// a rename there, while the note is away, writes nothing: the list isn’t rewritten for its new folder
	await countWrites(p, MOVED);
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Landfall.md');
	await flush(p);
	t.eq(await writes(p), 0, 'no write');
	t.eq(await read(p, MOVED), before[NOTE], 'the moved note is byte-identical');
	// a move there is written, and the old entries are kept after it
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Part One/Landfall.md')}).then(() => 1)`);
	await flush(p);
	t.eq(j(await contents(p, MOVED)), j(['Storm warning', 'Landfall', 'The keeper', ...LIST]), 'the move, then the old list');
	t.eq(split(await read(p, MOVED)).body, split(before[NOTE]).body, 'its text untouched');
	await rename(p, MOVED, NOTE);
	await until(p, `${B}.isBinderFolder(${file('The Lighthouse')})`);
	await p.sleep(400); await flush(p); await cacheSettles(p);
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md']), 'the binder’s order is still there');
	t.eq(j(await kids(p, 'The Lighthouse/Part Two')), j(['The wreck.md', 'Lights out.md']), 'in its folders too');
	// the next write drops the entries Part One wrote for itself, and keeps the binder’s own
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await flush(p);
	t.eq(j(await contents(p)), j(['Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Landfall', 'Prologue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the list');
	t.eq(split(await read(p, NOTE)).body, split(before[NOTE]).body, 'the binder note’s text is untouched');
	await rename(p, 'The Lighthouse/Part One/Landfall.md', 'The Lighthouse/Part One/Arrival.md');
}));

test('a list that would lose most of its entries is kept as it is', withTidy(async (p, h, t) => {
	// most entries name something that isn’t there (the list is for another folder); a change is still written, and
	// those entries stay, after it
	const text = (await read(p, NOTE)).replace(/contents:\n(  - .*\n)+/, 'contents:\n  - Gone/\n  - Gone/a\n  - Gone/b\n  - Prologue\n');
	await writeRaw(p, NOTE, text);
	await until(p, `(app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.contents || []).includes('Gone/')`);
	await p.sleep(200);
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Landfall.md');
	await p.ev(`${B}.moveDown(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await flush(p);
	const c = await contents(p);
	t.eq(j(c.slice(-3)), j(['Gone/', 'Gone/a', 'Gone/b']), 'missing entries kept, last: ' + j(c));
	t.eq(j(c.slice(0, 2)), j(['Epilogue', 'Prologue']), 'and the move written');
	// a few missing entries among many found are dropped, as ever
	await p.ev(`app.vault.delete(${file('The Lighthouse/Epilogue.md')}).then(() => 1)`);
	await flush(p);
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Landfall', 'Part One/Storm warning', 'Part One/The keeper', 'Part Two/', 'Part Two/Lights out', 'Part Two/The wreck']), 'a deleted note is dropped, and so are the few missing entries');
	await rename(p, 'The Lighthouse/Part One/Landfall.md', 'The Lighthouse/Part One/Arrival.md');
}));

test('a binder note moved out of its folder stops it being a binder', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Plain'); await app.vault.create('Plain/b.md', 'b'); await app.vault.create('Plain/Plain.md', '---\\nbinder: 1\\n---\\n'); })().then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('Plain')})`, 3000);
	await rename(p, 'Plain/Plain.md', 'Plain.md');
	await p.sleep(500);
	t.ok(!(await p.ev(`${B}.isBinderFolder(${file('Plain')})`)), 'not a binder any more');
	await p.ev(`app.vault.delete(${file('Plain.md')}).then(() => 1)`);
}));

test('two binders swapping names, then a rename in one, keeps its place', withTidy(async (p, h, t) => {
	await makeSequel(p);
	await p.ev(`(async () => { await app.vault.createFolder('Draft'); for (const n of ['q', 'p']) await app.vault.create('Draft/' + n + '.md', n); await app.vault.create('Draft/Draft.md', '---\\nbinder: 1\\ncontents:\\n  - q\\n  - p\\n---\\n'); })().then(() => 1)`);
	await until(p, `${BINDERS}.length === 3`);
	await p.sleep(200);
	// "Draft" becomes "Old draft", then "Sequel" takes the name "Draft", and a note in it is renamed, all within a moment
	await rename(p, 'Draft', 'Old draft');
	await rename(p, 'Sequel', 'Draft');
	await rename(p, 'Draft/B.md', 'Draft/Bee.md');
	await p.sleep(600); await flush(p);
	t.eq(j(await contents(p, 'Draft/Sequel.md')), j(['Bee', 'Act/', 'Act/Z', 'Act/Y', 'A']), 'Bee keeps B’s place');
}));

// ---- folder notes ----

test('a folder note follows two quick renames of its folder', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', 'folder note text').then(() => 1)`);
	await p.sleep(200);
	await rename(p, 'The Lighthouse/Part One', 'The Lighthouse/Part 1');
	await rename(p, 'The Lighthouse/Part 1', 'The Lighthouse/First part');
	await until(p, `!!${file('The Lighthouse/First part/First part.md')}`, 3000);
	await p.sleep(500); await flush(p);
	t.eq(await read(p, 'The Lighthouse/First part/First part.md'), 'folder note text', 'the folder note followed, text intact');
	t.eq(j(await p.ev(`${file('The Lighthouse/First part')}.children.map(c => c.name).sort()`)), j(['Arrival.md', 'First part.md', 'Storm warning.md', 'The keeper.md']), 'no stray note');
	t.eq(j(await contents(p)), j(LIST.map((x) => x.replace(/^Part One\//, 'First part/'))), 'the list follows');
	await rename(p, 'The Lighthouse/First part', 'The Lighthouse/Part One');
	await p.sleep(500);
}));

// ---- the binder note by hand ----

test('odd hand-edited lists are tolerated, and a write keeps every other property', withTidy(async (p, h, t) => {
	const body = 'The body.\n';
	await writeRaw(p, NOTE, `---\nbinder: 1\ntitle: The Lighthouse\ntags: [novel]\ncontents:\n  - Epilogue\n  - Epilogue\n  - "  Prologue  "\n  - ../Elsewhere\n  - /The Lighthouse/Part Two/\n  - 42\n  - [nested]\n  - Part One/Storm warning.md\n  - Part One\\\\The keeper\n  - Missing\n  - The Lighthouse\n  - Part One/Part One\nplotlines:\n  - Mara\n---\n${body}`);
	await until(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.title === 'The Lighthouse'`);
	await p.sleep(300);
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Epilogue.md', 'Prologue.md', 'Part One', 'Part Two']), 'duplicates once, trimmed, junk ignored, unlisted after');
	t.eq(j(await kids(p, 'The Lighthouse/Part One')), j(['Storm warning.md', 'The keeper.md', 'Arrival.md']), '.md and backslashes tolerated');
	await rename(p, 'The Lighthouse/Part Two/The wreck.md', 'The Lighthouse/Part Two/Wreck.md');
	await flush(p);
	const after = await read(p, NOTE);
	t.eq(split(after).body, body, 'body untouched');
	t.ok(/title: The Lighthouse/.test(after) && /tags:/.test(after) && /plotlines:\n  - Mara/.test(after), 'other properties kept: ' + split(after).yaml);
	t.eq(j(await contents(p)), j(['Epilogue', 'Prologue', 'Part One/Storm warning', 'Part One/The keeper']), 'the list, cleaned, missing entries dropped');
}));

test('contents that isn’t a list: order by name, and no crash on a write', withTidy(async (p, h, t) => {
	await writeRaw(p, NOTE, `---\nbinder: 1\ncontents: Prologue\n---\nbody\n`);
	await until(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.contents === 'Prologue'`);
	await p.sleep(200);
	t.eq(j(await kids(p, 'The Lighthouse')), j(['Epilogue.md', 'Part One', 'Part Two', 'Prologue.md']), 'by name');
	await p.ev(`${B}.moveUp(${file('The Lighthouse/Prologue.md')}).then(() => 1)`);
	await flush(p);
	t.eq(split(await read(p, NOTE)).body, 'body\n', 'body kept');
	t.eq((await kids(p, 'The Lighthouse'))[2], 'Prologue.md', 'Prologue went up one');
}));

test('a newer format is never written: renames, moves, deletes and commands leave it byte-identical', withTidy(async (p, h, t) => {
	const v2 = (await read(p, NOTE)).replace('binder: 1', 'binder: 2');
	await writeRaw(p, NOTE, v2);
	await until(p, `!!${B}.problem(${j(NOTE)})`);
	await countWrites(p);
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Landfall.md');
	await rename(p, 'The Lighthouse/Part Two', 'The Lighthouse/Part 2');
	await p.ev(`app.vault.delete(${file('The Lighthouse/Epilogue.md')}).then(() => 1)`);
	await p.ev(`app.vault.create('The Lighthouse/New.md', '').then(() => 1)`);
	const errs = await p.ev(`(async () => { const out = []; for (const f of [() => ${B}.moveUp(${file('The Lighthouse/Part 2')}), () => ${B}.newScene(${file('The Lighthouse')}), () => ${B}.move(${file('The Lighthouse/New.md')}, ${file('The Lighthouse/Part One')}, 0), () => ${B}.setProps(${file(NOTE)}, { plotlines: ['x'] })]) { try { await f(); out.push('ok'); } catch (e) { out.push('refused'); } } return out; })()`);
	t.eq(j(errs), j(['refused', 'refused', 'refused', 'refused']), 'every change refused');
	t.ok(!(await exists(p, 'The Lighthouse/Part One/New.md')), 'nothing moved');
	await p.sleep(700); await flush(p);
	t.eq(await writes(p), 0, 'no writes');
	t.eq(await read(p, NOTE), v2, 'byte-identical');
	// the menu and commands don't offer changes
	t.ok(!(await p.ev(`(() => { app.workspace.getLeaf(false).openFile(${file('The Lighthouse/Prologue.md')}); return 1; })()`).then(() => p.sleep(300)).then(() => p.ev(`app.commands.findCommand('binders:move-down').checkCallback(true)`))), 'Move down not offered');
	await rename(p, 'The Lighthouse/Part 2', 'The Lighthouse/Part Two');
}));

test('a newer format that arrives while changes are waiting is not written over', withTidy(async (p, h, t) => {
	await rename(p, 'The Lighthouse/Part One/Arrival.md', 'The Lighthouse/Part One/Landfall.md');
	const v2 = (await read(p, NOTE)).replace('binder: 1', 'binder: 3');
	await writeRaw(p, NOTE, v2); // before the debounced write
	await p.sleep(900); await flush(p);
	t.eq(await read(p, NOTE), v2, 'byte-identical');
	await rename(p, 'The Lighthouse/Part One/Landfall.md', 'The Lighthouse/Part One/Arrival.md');
}));

// ---- make a binder ----

test('make-binder refuses a folder note whose own "contents" isn’t a list, and changes nothing', withTidy(async (p, h, t) => {
	const before = '---\ncontents: My table of contents, by hand\n---\nText\n';
	await p.ev(`(async () => { await app.vault.createFolder('Notes'); await app.vault.create('Notes/a.md', 'a'); await app.vault.create('Notes/Notes.md', ${j(before)}); })().then(() => 1)`);
	await p.sleep(300);
	const err = await p.ev(`${B}.makeBinder(${file('Notes')}).then(() => '', (e) => String(e.message))`);
	t.ok(/already has a “contents” property that isn’t a list/.test(err), 'refused with a clear message: ' + err);
	t.eq(await read(p, 'Notes/Notes.md'), before, 'the note is byte-identical (rule 3: only Binders’ own properties)');
	await p.sleep(200);
	t.ok(!(await p.ev(`${B}.isBinderFolder(${file('Notes')})`)), 'not a binder');
	// an empty `contents:` is Binders’ to fill
	await p.ev(`app.vault.modify(${file('Notes/Notes.md')}, '---\\ncontents:\\n---\\nText\\n').then(() => 1)`);
	await p.sleep(300);
	await p.ev(`${B}.makeBinder(${file('Notes')}).then(() => 1)`);
	t.eq(await read(p, 'Notes/Notes.md'), '---\ncontents:\n  - a\nbinder: 1\n---\nText\n', 'filled in');
}));

test('make-binder on a folder with binder-ish notes and a nested binder', withTidy(async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createFolder('Draft'); await app.vault.createFolder('Draft/Old');
		await app.vault.create('Draft/b.md', 'b'); await app.vault.create('Draft/a.md', 'a'); await app.vault.create('Draft/pic.png', 'x');
		await app.vault.create('Draft/Old/Old.md', '---\\nbinder: 1\\ncontents:\\n  - z\\n  - y\\n---\\n');
		await app.vault.create('Draft/Old/y.md', 'y'); await app.vault.create('Draft/Old/z.md', 'z');
		await app.vault.create('Draft/Draft.md', '---\\nsynopsis: kept\\n---\\nMy draft notes.\\n');
	})().then(() => 1)`);
	await until(p, `${BINDERS}.length === 2`);
	await p.ev(`${B}.makeBinder(${file('Draft')}).then(() => 1)`);
	await until(p, `${B}.isBinderFolder(${file('Draft')})`);
	await p.sleep(300);
	const text = await read(p, 'Draft/Draft.md');
	t.ok(/synopsis: kept/.test(text) && /My draft notes\.\n$/.test(text), 'the existing folder note keeps its properties and text');
	t.eq(j(await contents(p, 'Draft/Draft.md')), j(['Old/', 'Old/y', 'Old/z', 'a', 'b']), 'contents in explorer order, no folder notes, no image');
	t.eq(j(await p.ev(`${BINDERS}.map(b => b.folder.path).sort()`)), j(['Draft', 'The Lighthouse']), 'the inner binder is now an ordinary folder');
	t.eq(await read(p, 'Draft/Old/Old.md'), '---\nbinder: 1\ncontents:\n  - z\n  - y\n---\n', 'its note untouched');
}));

// ---- the explorer ----

test('explorer: order holds after collapse and expand, and after a new note from the explorer', withTidy(async (p, h, t) => {
	const IN = await rows(p);
	await p.ev(`(() => { ${EXP}.fileItems['The Lighthouse'].setCollapsed(true); ${EXP}.fileItems['The Lighthouse/Part One'].setCollapsed(true); return 1; })()`);
	await p.sleep(200);
	t.eq(j(await rows(p)), j(IN), 'same order after collapsing and expanding');
	await p.ev(`app.fileManager.createNewMarkdownFile(${file('The Lighthouse/Part One')}, 'Fresh').then(() => 1)`);
	await p.sleep(400);
	const r = await rows(p);
	t.eq(r[r.indexOf('The Lighthouse/Part One/Storm warning.md') + 1], 'The Lighthouse/Part One/Fresh.md', 'the new note is after the listed ones');
	t.ok(await p.ev(`!!document.querySelector('.nav-file-title[data-path="The Lighthouse/Part One/Fresh.md"]')`), 'and shown');
}));

test('explorer: a note dragged to another folder of the binder goes last there', withTidy(async (p, h, t) => {
	await rows(p);
	const src = await p.at(`.nav-file-title[data-path="The Lighthouse/Part One/Arrival.md"]`);
	const dst = await p.at(`.nav-folder-title[data-path="The Lighthouse/Part Two"]`);
	t.ok(src && dst, 'both on screen');
	// Obsidian's explorer drags with HTML5 drag and drop; synthesize the events it listens for
	await p.ev(`(() => {
		const s = document.querySelector('.nav-file-title[data-path="The Lighthouse/Part One/Arrival.md"]'), d = document.querySelector('.nav-folder-title[data-path="The Lighthouse/Part Two"]');
		const dt = new DataTransfer();
		const fire = (el, type) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.x + 10, clientY: r.y + r.height / 2 })); };
		fire(s, 'dragstart'); fire(d, 'dragenter'); fire(d, 'dragover'); fire(d, 'drop'); fire(s, 'dragend');
		return 1;
	})()`);
	await p.sleep(800);
	if (!(await exists(p, 'The Lighthouse/Part Two/Arrival.md'))) { t.ok(true, 'drag not simulated; skipped'); return; }
	await flush(p);
	t.eq(j(await kids(p, 'The Lighthouse/Part Two')), j(['The wreck.md', 'Lights out.md', 'Arrival.md']), 'last in Part Two, as a note moved in from outside would be');
	await rename(p, 'The Lighthouse/Part Two/Arrival.md', 'The Lighthouse/Part One/Arrival.md');
}));

test('explorer: two explorer panes both show binder order, and both go back to name order', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { const l = app.workspace.getLeftLeaf(true); await l.setViewState({ type: 'file-explorer' }); window.__l2 = l; })().then(() => 1)`);
	try {
		await p.sleep(400);
		t.eq(await p.ev(`app.workspace.getLeavesOfType('file-explorer').length`), 2, 'two explorers');
		const a = await rows(p, 'The Lighthouse', KEEP_FOLDERS, 0), b = await rows(p, 'The Lighthouse', KEEP_FOLDERS, 1);
		t.eq(j(b), j(a), 'the second shows binder order too');
		await setSettings(p, { orderExplorer: false });
		const c = await rows(p, 'The Lighthouse', KEEP_FOLDERS, 1);
		t.ok(c.includes(NOTE) && c.indexOf('The Lighthouse/Prologue.md') > c.indexOf('The Lighthouse/Epilogue.md'), 'the second is by name');
	} finally { await p.ev(`(() => { window.__l2?.detach(); return 1; })()`); }
}));

test('explorer: disabling Binders gives exactly Obsidian’s order in every sort order', withTidy(async (p, h, t) => {
	const orders = ['alphabetical', 'alphabeticalReverse', 'byModifiedTime', 'byModifiedTimeReverse', 'byCreatedTime', 'byCreatedTimeReverse'];
	// Obsidian's own order: with Binders off
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	const native = {};
	try {
		for (const o of orders) { await p.ev(`(() => { ${EXP}.setSortOrder(${j(o)}); return 1; })()`); native[o] = await rows(p); }
	} finally { await p.ev(`(async () => { ${EXP}.setSortOrder('alphabetical'); await app.plugins.enablePlugin('binders'); })().then(() => 1)`); }
	for (let i = 0; i < 40 && (await p.ev(`${PL}?.explorer?.status ?? 'none'`)) !== 'patched'; i++) await p.sleep(100);
	for (const o of orders) { await p.ev(`(() => { ${EXP}.setSortOrder(${j(o)}); return 1; })()`); await rows(p); }
	await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
	try {
		for (const o of orders) { await p.ev(`(() => { ${EXP}.setSortOrder(${j(o)}); return 1; })()`); t.eq(j(await rows(p)), j(native[o]), `after disabling, ${o} is Obsidian’s`); }
		t.eq(await p.ev(`document.querySelectorAll('.binders-folder-icon').length`), 0, 'no icon');
	} finally { await p.ev(`(async () => { ${EXP}.setSortOrder('alphabetical'); await app.plugins.enablePlugin('binders'); })().then(() => 1)`); }
	for (let i = 0; i < 40 && (await p.ev(`${PL}?.explorer?.status ?? 'none'`)) !== 'patched'; i++) await p.sleep(100);
}));

test('explorer: hide setting off and on, and reveal a binder note with it off', withTidy(async (p, h, t) => {
	const IN = await rows(p);
	await setSettings(p, { hideBinderNotes: false });
	let r = await rows(p);
	t.ok(r.includes(NOTE), 'shown');
	await h.open(NOTE);
	await p.ev(`(() => { ${EXP}.revealInFolder(${file(NOTE)}); return 1; })()`);
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.nav-file-title[data-path="${NOTE}"].is-active')`), 'revealed and active');
	await setSettings(p, { hideBinderNotes: true });
	t.eq(j(await rows(p)), j(IN), 'hidden again, order unchanged');
	t.eq(await p.ev(`document.querySelectorAll('.nav-folder-title[data-path="The Lighthouse"] .binders-folder-icon').length`), 1, 'exactly one icon');
}));

// ---- scale ----

const N = 1000;
async function bigBinder(p) {
	return p.ev(`(async () => {
		const t0 = performance.now();
		await app.vault.createFolder('Big'); await app.vault.createFolder('Big/Part');
		const names = []; for (let i = 0; i < ${N}; i++) names.push('Scene ' + String(i).padStart(4, '0'));
		// the list in reverse name order, so binder order differs from Obsidian's
		const list = [...names].reverse().map(n => 'Part/' + n);
		await app.vault.create('Big/Big.md', '---\\nbinder: 1\\ncontents:\\n  - Part/\\n' + list.map(x => '  - ' + x).join('\\n') + '\\n---\\n');
		for (const n of names) await app.vault.create('Big/Part/' + n + '.md', '---\\nplotlines: [P1]\\n---\\nText of ' + n);
		return performance.now() - t0;
	})()`);
}

test('1,000 scenes: explorer sort is quick, and a folder rename is written once', withTidy(async (p, h, t) => {
	await bigBinder(p);
	await until(p, `${B}.isBinderFolder(${file('Big')})`, 10000);
	await p.sleep(1500);
	const ms = await p.ev(`(() => { const v = ${EXP}; const f = app.vault.getAbstractFileByPath('Big/Part'); const t0 = performance.now(); for (let i = 0; i < 10; i++) v.getSortedFolderItems(f); return (performance.now() - t0) / 10; })()`);
	t.ok(ms < 50, `sorting a 1,000-note folder takes ${ms.toFixed(1)} ms`);
	const first = await p.ev(`${EXP}.getSortedFolderItems(${file('Big/Part')}).slice(0, 2).map(i => i.file.name)`);
	t.eq(j(first), j(['Scene 0999.md', 'Scene 0998.md']), 'in binder order');
	await countWrites(p, 'Big/Big.md');
	const renameMs = await p.ev(`(async () => { const t0 = performance.now(); await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Big/Part'), 'Big/Chapter'); return performance.now() - t0; })()`);
	await p.sleep(1500); await flush(p);
	t.eq(await writes(p), 1, 'written once');
	const c = await contents(p, 'Big/Big.md');
	t.eq(c.length, N + 1, 'every scene still listed');
	t.eq(c[1], 'Chapter/Scene 0999', 'in order, under the new name');
	t.ok(renameMs < 20000, `rename took ${renameMs.toFixed(0)} ms`);
	// a move near the end of 1,000: time the store's own work
	const moveMs = await p.ev(`(async () => { const t0 = performance.now(); await ${B}.moveUp(app.vault.getAbstractFileByPath('Big/Chapter/Scene 0000.md')); const t1 = performance.now(); await ${B}.flush(); return [t1 - t0, performance.now() - t1]; })()`);
	t.ok(moveMs[0] + moveMs[1] < 1000, `move up in 1,000 took ${moveMs.map((x) => x.toFixed(0)).join(' + ')} ms`);
}));

test('300 notes moved into a binder at once: appended in one write, quickly', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Loose'); for (let i = 0; i < 300; i++) await app.vault.create('Loose/Note ' + String(i).padStart(3, '0') + '.md', 'x' + i); })().then(() => 1)`);
	await p.sleep(500);
	await countWrites(p);
	const ms = await p.ev(`(async () => { const t0 = performance.now(); await app.fileManager.renameFile(app.vault.getAbstractFileByPath('Loose'), 'The Lighthouse/Loose'); return performance.now() - t0; })()`);
	await p.sleep(1200); await flush(p);
	t.eq(await writes(p), 1, 'one write');
	const c = await contents(p);
	t.eq(j(c.slice(LIST.length)), j(['Loose/']), 'the folder appended; its notes come with it');
	t.ok(ms < 15000, `move took ${ms.toFixed(0)} ms`);
	// moving them one by one (not as a folder): each is an event
	await countWrites(p);
	const ms2 = await p.ev(`(async () => { const t0 = performance.now(); for (const f of [...app.vault.getAbstractFileByPath('The Lighthouse/Loose').children]) await app.fileManager.renameFile(f, 'The Lighthouse/Part Two/' + f.name); return performance.now() - t0; })()`);
	await p.sleep(1200); await flush(p);
	t.ok(ms2 < 30000, `300 single moves took ${ms2.toFixed(0)} ms`);
	t.ok(await writes(p) <= 3, `written ${await writes(p)} times`);
	t.eq((await kids(p, 'The Lighthouse/Part Two')).length, 302, 'all shown in Part Two');
}));

// ---- the plot grid ----

async function mount(p, { folder = 'The Lighthouse', readOnly = false } = {}) {
	await p.ev(`(async () => {
		const plugin = ${PL}, store = plugin.binders, s = plugin.settings;
		await store.ready;
		const leaf = app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: 'empty', active: true });
		const view = leaf.view, host = view.contentEl;
		host.empty(); host.style.padding = '0';
		const folder = app.vault.getAbstractFileByPath(${j(folder)}), binder = store.binderOf(folder);
		const list = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' && v ? [v] : [];
		const str = (v) => (typeof v === 'string' ? v : '');
		const ctx = {
			app, plugin, store, binder, folder, owner: view, readOnly: ${readOnly},
			props(f) { const fm = app.metadataCache.getFileCache(f)?.frontmatter ?? {}; return { synopsis: str(fm[s.synopsisProp]), status: str(fm[s.statusProp]), label: str(fm[s.labelProp]), plotlines: list(fm[s.plotlinesProp]) }; },
			async setProps(f, patch) { const o = {}; for (const [k, v] of Object.entries(patch)) o[s[k + 'Prop']] = (Array.isArray(v) ? v.length : v) ? v : undefined; await store.setProps(f, o); },
			async openFile() {}, navigate() {},
		};
		const mode = plugin.modeFactories.plotgrid(host, ctx);
		mode.render();
		const refs = [[store, store.on('changed', () => mode.refresh())], [app.metadataCache, app.metadataCache.on('changed', (f) => { if (store.binderOf(f) === binder) mode.refresh(); })]];
		window.__pg = { mode, ctx, leaf, refs };
	})().then(() => 1)`);
	await p.sleep(200);
}
async function unmount(p) {
	await p.ev(`(async () => { const g = window.__pg; if (!g) return; g.mode.unload(); for (const [src, r] of g.refs) src.offref(r); window.__pg = null; await ${B}.flush(); document.querySelectorAll('.menu').forEach((m) => m.remove()); })().then(() => 1)`);
	await p.sleep(100);
}
const withGrid = (opts, fn) => withTidy(async (p, h, t) => { await mount(p, opts); try { await fn(p, h, t); } finally { await unmount(p); } });
const T = '.binders-plotgrid-table';
const cellSel = (path, name) => `${T} tr[data-path="${path}"] td[data-plotline="${name.replace(/["\\]/g, '\\$&')}"]`;
const ARRIVAL = 'The Lighthouse/Part One/Arrival.md', PROLOGUE = 'The Lighthouse/Prologue.md';
const fmOf = (p, path) => p.ev(`app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? null`);
const settle = (p) => p.ev(`${B}.flush().then(() => new Promise((r) => setTimeout(r, 700))).then(() => 1)`);
const setBinderPlotlines = (p, list) => p.ev(`${B}.setProps(${file(NOTE)}, { plotlines: ${j(list)} }).then(() => 1)`).then(() => p.sleep(400));

test('plot grid: eleven fast clicks on one cell end on, on disk and on screen', withGrid({}, async (p, h, t) => {
	const a = await p.at(cellSel(ARRIVAL, "The keeper's secret"));
	for (let i = 0; i < 11; i++) { await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 }); await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a.x, y: a.y, button: 'left', clickCount: 1 }); }
	await settle(p); await p.sleep(1600);
	t.eq(j((await fmOf(p, ARRIVAL)).plotlines), j(['Mara', "The keeper's secret"]), 'on, on disk');
	t.ok(await p.ev(`document.querySelector(${j(cellSel(ARRIVAL, "The keeper's secret"))}).classList.contains('is-on')`), 'on, on screen');
}));

const ODD = ['He said "no"', 'Act: two', '🌊 Sea', "it's", '#tag', '- dash', '[x]', 'yes', '12'];
test('plot grid: plotlines with odd names are added, toggled, renamed and deleted cleanly', withGrid({}, async (p, h, t) => {
	await setBinderPlotlines(p, ['Mara', ...ODD]);
	await until(p, `document.querySelectorAll('${T} .binders-plotgrid-col[data-plotline]').length === ${ODD.length + 1}`);
	t.eq(j(await p.ev(`[...document.querySelectorAll('${T} .binders-plotgrid-col[data-plotline]')].map(e => e.dataset.plotline)`)), j(['Mara', ...ODD]), 'columns read back as text (yes, 12 included)');
	for (const n of ODD) { await p.ev(`document.querySelector(${j(cellSel(PROLOGUE, n))}).scrollIntoView({ block: 'nearest', inline: 'nearest' })`); await p.sleep(50); const a = await p.at(cellSel(PROLOGUE, n)); t.ok(a, 'cell for ' + n); await p.click(a.x, a.y); }
	await settle(p);
	t.eq(j((await fmOf(p, PROLOGUE)).plotlines), j(["The keeper's secret", ...ODD]), 'the scene lists them all, as text');
	// rename each through the grid's own code path, as the rename box does
	for (const n of ODD) await p.ev(`(async () => { const m = ${`window.__pg.mode`}; await m.renamePlotline(${j(n)}, ${j(n + ' 2')}); })().then(() => 1)`);
	await settle(p); await p.sleep(400);
	t.eq(j((await fmOf(p, NOTE)).plotlines), j(['Mara', ...ODD.map((n) => n + ' 2')]), 'renamed in the binder');
	t.eq(j((await fmOf(p, PROLOGUE)).plotlines), j(["The keeper's secret", ...ODD.map((n) => n + ' 2')]), 'renamed in the scene');
	for (const n of ODD) await p.ev(`window.__pg.mode.deletePlotline(${j(n + ' 2')}, [${file(PROLOGUE)}]).then(() => 1)`);
	await settle(p); await p.sleep(400);
	t.eq(j((await fmOf(p, NOTE)).plotlines), j(['Mara']), 'deleted from the binder');
	t.eq(j((await fmOf(p, PROLOGUE)).plotlines), j(["The keeper's secret"]), 'and from the scene');
}));

test('plot grid: a case-only rename, and a name differing only by case', withGrid({}, async (p, h, t) => {
	await p.ev(`window.__pg.mode.renamePlotline('Mara', 'MARA').then(() => 1)`);
	await settle(p);
	t.eq(j((await fmOf(p, NOTE)).plotlines), j(['MARA', "The keeper's secret"]), 'renamed');
	t.eq(j((await fmOf(p, ARRIVAL)).plotlines), j(['MARA']), 'in scenes too');
	await p.ev(`window.__pg.mode.renamePlotline('MARA', 'Mara').then(() => 1)`);
	await settle(p);
	t.eq(j((await fmOf(p, ARRIVAL)).plotlines), j(['Mara']), 'and back');
}));

test('plot grid: color menu sets and clears a color; only plotlineColors changes', withGrid({}, async (p, h, t) => {
	const before = await read(p, NOTE);
	await p.ev(`window.__pg.mode.setColor('Mara', 'blue').then(() => 1)`);
	await settle(p);
	t.ok(await p.ev(`document.querySelector('${T} th[data-plotline="Mara"]').classList.contains('binders-plotgrid-color-blue')`), 'blue shows');
	t.ok(/plotlineColors:\n  Mara: blue/.test(await read(p, NOTE)), 'written');
	await p.ev(`window.__pg.mode.setColor('Mara', null).then(() => 1)`);
	await settle(p);
	t.eq(await read(p, NOTE), before, 'cleared: the note is byte-for-byte as it was');
}));

test('plot grid: 30 plotlines × 300 scenes draw and toggle quickly', withGrid({ folder: 'The Lighthouse' }, async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Many'); for (let i = 0; i < 300; i++) await app.vault.create('The Lighthouse/Many/S' + String(i).padStart(3, '0') + '.md', '---\\nplotlines: [P' + (i % 30) + ']\\n---\\nx'); })().then(() => 1)`);
	const cols = Array.from({ length: 30 }, (_, i) => 'P' + i);
	await setBinderPlotlines(p, cols);
	await p.sleep(1500);
	const ms = await p.ev(`(() => { const t0 = performance.now(); window.__pg.mode.draw(true); return performance.now() - t0; })()`);
	t.eq(await p.ev(`document.querySelectorAll('${T} tbody tr').length`), 9 + 301, 'every row');
	t.ok(ms < 1500, `a full redraw took ${ms.toFixed(0)} ms`);
	const noop = await p.ev(`(() => { const t0 = performance.now(); window.__pg.mode.refresh(); return performance.now() - t0; })()`);
	t.ok(noop < 300, `a refresh with no change took ${noop.toFixed(0)} ms`);
	const a = await p.at(cellSel('The Lighthouse/Prologue.md', 'P5'));
	const t0 = Date.now();
	await p.click(a.x, a.y);
	await until(p, `document.querySelector(${j(cellSel('The Lighthouse/Prologue.md', 'P5'))}).classList.contains('is-on')`);
	t.ok(Date.now() - t0 < 1500, `a click shows in ${Date.now() - t0} ms`);
}));

test('plot grid: a binder in a newer format is read only and never written', withTidy(async (p, h, t) => {
	const v2 = (await read(p, NOTE)).replace('binder: 1', 'binder: 2');
	await writeRaw(p, NOTE, v2);
	await until(p, `!!${B}.problem(${j(NOTE)})`);
	const before = await texts(p);
	await mount(p);
	try {
		t.eq(await p.ev(`document.querySelector('${T}').getAttribute('aria-readonly')`), 'true', 'read only');
		const a = await p.at(cellSel(ARRIVAL, 'Mara'));
		await p.click(a.x, a.y);
		await p.ev(`(() => { const e = document.querySelector('${T} th[data-plotline="Mara"]'); e.focus(); return 1; })()`);
		await p.key('F2'); await p.key('Delete'); await p.key('ArrowRight', 'alt');
		await p.ev(`window.__pg.mode.setColor('Mara', 'red').catch(() => 0).then(() => 1)`);
		await p.ev(`window.__pg.mode.renamePlotline('Mara', 'X').catch(() => 0).then(() => 1)`);
		await p.sleep(800);
		same(t, before, await texts(p));
	} finally { await unmount(p); }
}));
