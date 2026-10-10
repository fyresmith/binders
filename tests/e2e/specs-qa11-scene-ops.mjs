// QA round 11, scene operations: split at the cursor (and with a selection as the title), merge, duplicate, undo of
// moves (Undo last move, Redo last move) after those, and export as one note. Driven from the palette and from the
// corkboard's menus, on the first and last scene, on notes with properties, links and paragraphs that start with a tab.
// Every test reads the files on disk after each step: text is never lost, and the order in the binder note is right.
import { B, card, clickMenu, closeMenus, contents, file, flush, j, menuItems, openView, split, tidy, until } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({
	name: 'qa11 scene ops: ' + name,
	fn: async (p, h, t0) => {
		// (the runner's eq compares by identity: lists are compared by what they hold)
		const t = { ...t0, eq: (a, b, m) => t0.eq(typeof a === 'object' && a !== null ? JSON.stringify(a) : a, typeof b === 'object' && b !== null ? JSON.stringify(b) : b, m) };
		try {
			await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`);
			await fn(p, h, t);
		} finally { await cleanup(p); }
	},
});

const L = 'The Lighthouse/', P1 = L + 'Part One/', P2 = L + 'Part Two/';
const PRO = L + 'Prologue.md', EPI = L + 'Epilogue.md', A = P1 + 'Arrival.md', K = P1 + 'The keeper.md', SW = P1 + 'Storm warning.md';
const FM = '---\nstatus: draft\n---\n';
// the binder's order as the fixture has it, as the binder note's list writes it
const FULL = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const OUT = 'The Lighthouse (exported).md';
const WIN = '.modal.binders-export';

const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const setNote = (p, path, text) => p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${j(path)}); if (f) await app.vault.modify(f, ${j(text)}); else await app.vault.create(${j(path)}, ${j(text)}); })().then(() => 1)`);
const readText = (p, path) => p.ev(`app.vault.adapter.read(${j(path)}).catch(() => null)`);
const mdPaths = (p) => p.ev(`app.vault.getMarkdownFiles().map(f => f.path)`);
const gone = (p, path) => p.ev(`!app.vault.getAbstractFileByPath(${j(path)})`);
const fmOf = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? null)`).then(JSON.parse);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join('|'); })()`);
const body = (text) => (text == null ? null : split(text).body);
const settle = async (p) => { await p.sleep(200); await flush(p); await p.sleep(500); };
/** The binder note's list on disk, after the writes have landed. */
const list = async (p) => { await settle(p); return contents(p); };

async function cleanup(p) {
	await p.ev(`(async () => { document.querySelectorAll('.modal-close-button').forEach(b => b.click()); })().then(() => 1)`);
	await closeMenus(p);
	await tidy(p);
}

/** Puts the cursor (or a selection) in a note's editor, by its text. */
async function openAt(p, path, { before, select } = {}) {
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}, { state: { mode: 'source', source: false } }); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await p.sleep(500);
	if (before == null && select == null) return;
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, text = ed.getValue(); const i = text.indexOf(${j(before ?? select)}); if (i < 0) throw new Error('text not in the editor'); ed.focus(); ed.setSelection(ed.offsetToPos(i), ed.offsetToPos(i + ${select ? select.length : 0})); return 1; })()`);
}

/** Runs a split from the palette, saves the editors, and returns the new note and both halves as they are on disk. */
async function doSplit(p, path, { titled = false } = {}) {
	const before = await mdPaths(p);
	await run(p, titled ? 'split-scene-titled' : 'split-scene');
	await p.sleep(600);
	await p.ev(`Promise.all(app.workspace.getLeavesOfType('markdown').map(l => l.view.save())).then(() => 1)`);
	await settle(p);
	const made = (await mdPaths(p)).filter((x) => !before.includes(x));
	return { made, notice: await notices(p), first: await readText(p, path), second: made[0] ? await readText(p, made[0]) : null };
}

/** Opens the binder view on a folder (the root of the binder by default). */
const board = (p, folder = 'The Lighthouse') => openView(p, folder);

/** Selects cards in click order and opens the menu on the last one. */
async function selectCards(p, paths) {
	const dir = (x) => x.slice(0, x.lastIndexOf('/'));
	if (!(await p.at(card(paths[0]))) && paths.every((x) => dir(x) === dir(paths[0]))) await openView(p, dir(paths[0]));
	let i = 0, a;
	for (const path of paths) { a = await p.at(card(path)); if (!a) throw new Error('no card ' + path); await p.click(a.x, a.t + 12, i++ ? { modifiers: 2 } : {}); await p.sleep(80); }
	await p.right(a.x, a.y);
	await p.sleep(150);
}

const pressModal = async (p, label) => {
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === ${j(label)}).click(); return 1; })()`);
	await p.sleep(400);
};

/** Merges cards from the menu, confirming. Returns what the dialog said. */
async function mergeCards(p, paths) {
	await selectCards(p, paths);
	const title = (await menuItems(p)).find((x) => /^Merge/.test(x));
	if (!title) { await closeMenus(p); throw new Error('no merge in the menu'); }
	await clickMenu(p, title);
	await until(p, `!!document.querySelector('.modal')`);
	const text = await p.ev(`document.querySelector('.modal')?.textContent ?? ''`);
	await pressModal(p, 'Merge');
	await settle(p);
	return text;
}

/** Runs one card-menu item on one card. */
async function menuOn(p, path, title) {
	await selectCards(p, [path]);
	await clickMenu(p, title);
	await settle(p);
}

/** Undo or redo of the last move, from the palette. */
const undoMove = (p) => run(p, 'undo-move').then(() => settle(p));

/** The Export window on "One note", with its defaults, pressed. */
async function exportNote(p) {
	await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`);
	await run(p, 'export');
	await until(p, `!!document.querySelector('${WIN} .binders-export-path')`);
	await until(p, `!!document.querySelector('${WIN} .binders-snapshots-detail')?.textContent`, 6000);
	await p.sleep(300);
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Export').click(); return 1; })()`);
	await until(p, `!document.querySelector('${WIN} .binders-export-status') || document.querySelectorAll('.modal').length > 1`, 8000);
	await p.sleep(700);
}

// ---- splitting ----

test('BUG: a split with the cursor just after a paragraph’s tab (where its visible text starts): the new scene keeps the paragraph’s indent', async (p, h, t) => {
	await setNote(p, A, FM + 'The harbour was quiet.\n\n\tThe rain came in off the sea.\n\tThe lamp was lit.\n');
	await settle(p);
	await openAt(p, A, { before: 'The rain' });
	const r = await doSplit(p, A);
	t.eq(r.made.length, 1, 'one new note (' + r.notice + ')');
	t.eq(body(r.second), '\tThe rain came in off the sea.\n\tThe lamp was lit.\n', 'the new scene’s first paragraph keeps its tab, as the text had it');
	t.eq(body(r.first), 'The harbour was quiet.\n', 'the first scene ends where it did, with no stray tab');
});

test('split with the cursor before a paragraph’s tab: the tab goes with the paragraph into the new scene (the control for the test above)', async (p, h, t) => {
	await setNote(p, A, FM + 'The harbour was quiet.\n\n\tThe rain came in off the sea.\n\tThe lamp was lit.\n');
	await settle(p);
	await openAt(p, A, { before: '\tThe rain' });
	const r = await doSplit(p, A);
	t.eq(body(r.second), '\tThe rain came in off the sea.\n\tThe lamp was lit.\n', 'the new scene opens with the tab');
	t.eq(body(r.first), 'The harbour was quiet.\n', 'the first scene keeps its text');
});

test('split of the last scene: properties (no synopsis) copied, a link to itself and no line break at the end kept; the new “Epilogue 2” comes last in the list', async (p, h, t) => {
	await setNote(p, EPI, '---\nsynopsis: The last light.\nstatus: final\nlabel: green\n---\nThe light went out at dawn. See [[Epilogue]] for more.\n\nSecond paragraph, with no line break at the end.');
	await settle(p);
	await openAt(p, EPI, { before: 'Second paragraph' });
	const r = await doSplit(p, EPI);
	t.eq(r.made.join('|'), L + 'Epilogue 2.md', 'the new note is named on counting (' + r.notice + ')');
	t.eq(await list(p), [...FULL, 'Epilogue 2'], 'the list on disk has it last');
	t.eq((body(r.second) ?? '').replace(/\n$/, ''), 'Second paragraph, with no line break at the end.', 'its text, as it was');
	const fm2 = await fmOf(p, r.made[0]);
	t.ok(fm2 && fm2.status === 'final' && fm2.label === 'green' && fm2.synopsis === undefined, 'the new note has its properties, not the synopsis: ' + JSON.stringify(fm2));
	const fm1 = await fmOf(p, EPI);
	t.ok(fm1 && fm1.synopsis === 'The last light.', 'the first half keeps the synopsis: ' + JSON.stringify(fm1));
	t.eq(body(r.first), 'The light went out at dawn. See [[Epilogue]] for more.\n', 'the first half, its link as written');
});

test('split of the first scene: “Prologue 2” comes second in the list, on disk, and both halves hold the text', async (p, h, t) => {
	await setNote(p, PRO, FM + 'The first line.\n\nSecond part of the prologue.\n');
	await settle(p);
	await openAt(p, PRO, { before: 'Second part' });
	const r = await doSplit(p, PRO);
	t.eq(await list(p), ['Prologue', 'Prologue 2', ...FULL.slice(1)], 'the list has the new scene right after the first');
	t.eq(body(r.first), 'The first line.\n', 'the first scene');
	t.eq(body(r.second), 'Second part of the prologue.\n', 'the new scene');
});

test('split with selection as title, where the selected paragraph starts with a tab: named by its words, and the tab stays with the paragraph', async (p, h, t) => {
	await setNote(p, A, FM + 'The harbour was quiet.\n\n\tThe rain came in off the sea.\n\tThe lamp was lit.\n');
	await settle(p);
	await openAt(p, A, { select: '\tThe rain came in off the sea.' });
	const r = await doSplit(p, A, { titled: true });
	t.eq(r.made.join('|'), P1 + 'The rain came in off the sea.md', 'named from the selection (' + r.notice + ')');
	t.eq(body(r.second), '\tThe rain came in off the sea.\n\tThe lamp was lit.\n', 'the new scene keeps its tab');
	t.eq(body(r.first), 'The harbour was quiet.\n', 'the first scene');
});

test('NIT: a split inside a fenced code block: each half keeps its fences in pairs, so the prose after the code isn’t taken into a code block', async (p, h, t) => {
	await setNote(p, PRO, FM + 'Intro.\n\n```\nline one\nline two\nline three\n```\n\nAfter the code.\n');
	await settle(p);
	await openAt(p, PRO, { before: 'line two' });
	const r = await doSplit(p, PRO);
	const fences = (s) => (s?.match(/^\s*(```|~~~)/gm) || []).length;
	t.eq(fences(body(r.first)) % 2, 0, 'the first scene’s fences are in pairs: ' + JSON.stringify(body(r.first)));
	t.eq(fences(body(r.second)) % 2, 0, 'the new scene’s fences are in pairs: ' + JSON.stringify(body(r.second)));
});

// ---- merging ----

test('merge of the first and the last scene of the binder, clicked last first: joined in binder order into the first; the last goes; the list on disk follows', async (p, h, t) => {
	await setNote(p, PRO, FM + 'Prologue text.\n');
	await setNote(p, EPI, '---\nstatus: final\n---\nEpilogue text.\n');
	await settle(p);
	await board(p);
	const said = await mergeCards(p, [EPI, PRO]);
	t.ok(/Epilogue/.test(said), 'the dialog names the note that goes: ' + said);
	t.eq(await readText(p, PRO), FM + 'Prologue text.\n\nEpilogue text.\n', 'the first holds both, in binder order');
	t.ok(await gone(p, EPI), 'the last is gone');
	t.eq(await list(p), FULL.filter((x) => x !== 'Epilogue'), 'the list on disk');
});

test('merge of two scenes whose paragraphs start with tabs, the first ending with no line break: every tab and paragraph is kept, a blank line between', async (p, h, t) => {
	await setNote(p, A, FM + '\tFirst paragraph.\n\n\tSecond paragraph ends here.');
	await setNote(p, SW, '\tThird paragraph.\n\nPlain line.\n');
	await settle(p);
	await board(p, P1.slice(0, -1));
	await mergeCards(p, [A, SW]);
	t.eq(await readText(p, A), FM + '\tFirst paragraph.\n\n\tSecond paragraph ends here.\n\n\tThird paragraph.\n\nPlain line.\n', 'the merged text, byte for byte');
	t.ok(await gone(p, SW), 'the second is gone');
	t.eq(await list(p), FULL.filter((x) => x !== 'Part One/Storm warning'), 'the list on disk');
});

// ---- undo and redo of moves, after the other operations ----

test('undo of a move whose scene was merged away since: nothing comes back, the rest keeps its order, and the merged-away scene stays gone', async (p, h, t) => {
	await openAt(p, SW);
	await run(p, 'move-up');
	await settle(p);
	const moved = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
	t.eq(await list(p), moved, 'Storm warning moved up, on disk');
	await board(p, P1.slice(0, -1));
	await mergeCards(p, [A, SW]);
	const merged = FULL.filter((x) => x !== 'Part One/Storm warning');
	t.eq(await list(p), merged, 'merged: Storm warning went to the trash');
	await undoMove(p);
	t.eq(await list(p), merged, 'Undo last move brings nothing back');
	t.ok(await gone(p, SW), 'Storm warning is still gone');
});

test('BUG: undo of a move of a scene that has since been split: the new half goes back beside its first half, not in front of another scene', async (p, h, t) => {
	await setNote(p, SW, FM + 'First half of the storm.\n\nSecond half of the storm.\n');
	await settle(p);
	await openAt(p, SW);
	await run(p, 'move-up');
	await settle(p);
	await openAt(p, SW, { before: 'Second half' });
	const r = await doSplit(p, SW);
	const SPLIT = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part One/Storm warning 2', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
	t.eq(r.made.join('|'), P1 + 'Storm warning 2.md', 'the split made “Storm warning 2” (' + r.notice + ')');
	t.eq(await list(p), SPLIT, 'the split puts the new scene right after its first half');
	await undoMove(p);
	const AFTER = FULL.flatMap((x) => (x === 'Part One/Storm warning' ? [x, 'Part One/Storm warning 2'] : [x]));
	t.eq(await list(p), AFTER, 'after undo, the new half is still right after the first half, and before nothing else moved');
	t.eq(body(await readText(p, SW)), 'First half of the storm.\n', 'the first half’s text');
	t.eq(body(await readText(p, P1 + 'Storm warning 2.md')), 'Second half of the storm.\n', 'the second half’s text');
});

test('undo of a move after a copy was made of the scene beside it: the moved scene goes back beside its neighbour, and the copy stays in the list', async (p, h, t) => {
	await openAt(p, SW);
	await run(p, 'move-up');
	await settle(p);
	await board(p, P1.slice(0, -1));
	await menuOn(p, K, 'Duplicate');
	const copy = P1 + 'The keeper 2.md';
	t.ok(await readText(p, copy), 'the copy is made');
	await undoMove(p);
	const l = await list(p);
	t.ok(l.includes('Part One/The keeper 2'), 'the copy is still in the list: ' + l.join(', '));
	t.ok(l.indexOf('Part One/Storm warning') === l.indexOf('Part One/The keeper') + 1, 'Storm warning is back beside The keeper');
	t.eq(l.length, FULL.length + 1, 'nothing else is in or out of the list');
});

test('BUG: redo of an undone move of a scene since split: the new half stays beside its first half, not left behind by the scene it goes in front of', async (p, h, t) => {
	await setNote(p, SW, FM + 'First half of the storm.\n\nSecond half of the storm.\n');
	await settle(p);
	await openAt(p, SW);
	await run(p, 'move-up');
	await settle(p);
	await undoMove(p);
	t.eq(await list(p), FULL, 'undone: Storm warning back at the end');
	await openAt(p, SW, { before: 'Second half' });
	const r = await doSplit(p, SW);
	t.eq(r.made.length, 1, 'split (' + r.notice + ')');
	await run(p, 'redo-move');
	await settle(p);
	const WANT = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part One/Storm warning 2', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
	t.eq(await list(p), WANT, 'redo: the first half is moved up, its new half still beside it');
	t.eq(body(await readText(p, SW)), 'First half of the storm.\n', 'the first half’s text');
	t.eq(body(await readText(p, P1 + 'Storm warning 2.md')), 'Second half of the storm.\n', 'the new half’s text');
});

test('the first and the last scene of the binder: moved and moved back by Undo last move, each time the list on disk is the one before', async (p, h, t) => {
	await openAt(p, PRO);
	await run(p, 'move-down');
	const down = await list(p);
	t.eq([...down].sort().join('|'), [...FULL].sort().join('|'), 'Prologue moved down: nothing added or lost');
	t.ok(down.indexOf('Prologue') > 0, 'Prologue is no longer first');
	await undoMove(p);
	t.eq(await list(p), FULL, 'Undo last move: Prologue is first again');
	await openAt(p, EPI);
	await run(p, 'move-up');
	await settle(p);
	t.ok((await list(p)).indexOf('Epilogue') < (await list(p)).indexOf('Part Two/'), 'Epilogue moved up, before Part Two');
	await undoMove(p);
	t.eq(await list(p), FULL, 'Undo last move: Epilogue is last again');
});

test('undo of a move, after a merge of other scenes: the merge isn’t taken back, the move is', async (p, h, t) => {
	await openAt(p, SW);
	await run(p, 'move-up');
	await settle(p);
	await board(p, P1.slice(0, -1));
	// (Arrival comes first in the binder, so it is kept and The keeper goes)
	await mergeCards(p, [K, A]);
	const merged = FULL.filter((x) => x !== 'Part One/The keeper');
	t.eq(await list(p), ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'], 'merged: The keeper went to the trash, Storm warning kept its place');
	await undoMove(p);
	t.eq(await list(p), merged, 'Undo last move takes back the move before the merge, and only the list is as the merge left it');
	t.ok(await gone(p, K), 'The keeper is still gone');
});

// ---- export as one note ----

test('export as one note: a paragraph’s tab goes, a fenced code block keeps its tabs, and the text is otherwise as written', async (p, h, t) => {
	await setNote(p, PRO, FM + 'Intro line.\n\n\tA tabbed paragraph here.\n\n```\n\tcode kept\n```\n');
	await settle(p);
	await board(p);
	await exportNote(p);
	const out = await readText(p, OUT);
	t.ok(out && out.includes('Intro line.'), 'the book was written');
	t.ok(out && out.includes('\nA tabbed paragraph here.\n'), 'the paragraph is there without its tab');
	t.ok(out && !out.includes('\tA tabbed'), 'and with no tab in front of it');
	t.ok(out && out.includes('```\n\tcode kept\n```'), 'the code keeps its tab');
});
