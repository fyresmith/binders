// A split in the binder's history: Undo last change puts the first note back and takes the new note away, under the
// guards the editor's own undo has (the new note exactly as the split wrote it, the first exactly as the split left it),
// with the editor's undo still working as before, and the two never both acting on one split.
import { B, VIEW, contents, file, j, openView, read, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'undo split: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const P1 = L + 'Part One/';
const SW = P1 + 'Storm warning.md', SW2 = P1 + 'Storm warning 2.md';
const FM = '---\nstatus: draft\nsynopsis: The storm.\n---\n';
const TEXT = FM + 'First half of the storm.\n\nSecond half of the storm.\n';
const sleep = (p, ms) => p.sleep(ms);

const reset = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
const back = (p, redo = false) => p.ev(`${B}.undo(${file('The Lighthouse')}, ${redo}).then(x => x, e => 'refused: ' + e.message)`);
const labels = async (p) => j(await p.ev(`${B}.undos.map(u => u.label)`));
const there = (p, path) => p.ev(`!!${file(path)}`);
const settle = async (p) => { await sleep(p, 700); await p.ev(`${B}.flush().then(() => 1)`); await sleep(p, 300); };
const notes = (p) => p.ev(`app.vault.getFiles().map(f => f.path).filter(x => x.startsWith(${j(P1)}) && x.endsWith('.md')).sort()`);

/** Splits the note before "Second half", in a tab, from the command; leaves the tab open (or closes it). */
async function split(p, text = TEXT, { keepOpen = true } = {}) {
	await writeRaw(p, SW, text);
	await sleep(p, 500);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(${file(SW)}, { state: { mode: 'source', source: false } }); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await sleep(p, 600);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, i = ed.getValue().indexOf('Second half'); ed.focus(); ed.setCursor(ed.offsetToPos(i)); return 1; })()`);
	await p.ev(`app.commands.executeCommandById('binders:split-scene')`);
	await sleep(p, 1200);
	if (!keepOpen) { await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`); await sleep(p, 400); }
}
const closeTabs = (p) => p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`);

test('a split is in the history: Undo puts the first note back and trashes the new one, Redo splits again; the notes the same each time, byte for byte', async (p, h, t) => {
	await openView(p); await reset(p);
	const list = await contents(p);
	await split(p);
	const head = await read(p, SW), second = await read(p, SW2), listAfter = await contents(p);
	t.ok(await there(p, SW2) && head !== TEXT, 'split in two');
	t.eq(await labels(p), j(['Split “Storm warning”']), 'one change, named for what it did');
	t.eq(await back(p), 'Split “Storm warning”', 'undo says what it undid');
	await settle(p);
	t.eq(await read(p, SW), TEXT, 'the first note is as it was, byte for byte');
	t.ok(!(await there(p, SW2)), 'the new note is gone (in the trash)');
	t.eq(j(await contents(p)), j(list), 'the list is as it was');
	t.eq(await back(p, true), 'Split “Storm warning”', 'redo');
	await settle(p);
	t.eq(await read(p, SW), head, 'split again: the first half the same');
	t.eq(await read(p, SW2), second, 'and the second half the same, byte for byte');
	t.eq(j(await contents(p)), j(listAfter), 'in the same place');
	await back(p); await settle(p);
	t.eq(await read(p, SW), TEXT, 'undo again: as it began');
	await closeTabs(p);
});

test('with no editor open on the note, Undo does the same', async (p, h, t) => {
	await openView(p); await reset(p);
	await split(p, TEXT, { keepOpen: false });
	t.eq(await back(p), 'Split “Storm warning”', 'undone');
	await settle(p);
	t.eq(await read(p, SW), TEXT, 'the first note is as it was');
	t.ok(!(await there(p, SW2)), 'the new note is gone');
});

test('the editor’s own undo still takes the split back, and then Undo last change has nothing of that split to take: the two never both act', async (p, h, t) => {
	await openView(p); await reset(p);
	await split(p);
	await p.key('z', 'ctrl');
	await sleep(p, 1500);
	t.eq(await read(p, SW), TEXT, 'the editor’s undo put the text back');
	t.ok(!(await there(p, SW2)), 'and the new note went');
	t.eq(await p.ev(`${B}.undoable(${file('The Lighthouse')})`), null, 'Undo last change offers nothing');
	t.eq(j(await notes(p)), j([P1 + 'Arrival.md', SW, P1 + 'The keeper.md']), 'no note was made or lost');
	await p.key('z', 'ctrl', 'shift');
	await sleep(p, 1500);
	t.ok(await there(p, SW2), 'the editor’s redo splits again');
	t.eq(await p.ev(`${B}.undoable(${file('The Lighthouse')})`), 'Split “Storm warning”', 'and the history offers it again');
	await closeTabs(p);
});

test('Undo last change, then the editor’s undo in the same note: the text is not put back twice', async (p, h, t) => {
	await openView(p); await reset(p);
	await split(p);
	await back(p);
	await settle(p);
	await p.ev(`(() => { app.workspace.activeEditor?.editor?.focus(); return 1; })()`);
	await p.key('z', 'ctrl');
	await sleep(p, 1500);
	const text = await read(p, SW);
	t.eq(text.split('Second half of the storm.').length - 1, 1, 'the second half is in the first note once: ' + JSON.stringify(text));
	t.ok(!(await there(p, SW2)), 'and the new note stays gone');
	await closeTabs(p);
});

test('the first note typed in since the split: Undo is refused, both notes keep every word', async (p, h, t) => {
	await openView(p); await reset(p);
	await split(p, TEXT, { keepOpen: false });
	const second = await read(p, SW2);
	await writeRaw(p, SW, (await read(p, SW)) + 'Typed since.\n');
	await sleep(p, 500);
	const said = await back(p);
	t.ok(String(said).startsWith('refused: “Storm warning” has been changed since the split'), 'it says why: ' + said);
	t.ok((await read(p, SW)).endsWith('Typed since.\n'), 'the first note is untouched');
	t.eq(await read(p, SW2), second, 'and so is the new one');
});

test('the new note edited since: Undo is refused and nothing is changed', async (p, h, t) => {
	await openView(p); await reset(p);
	await split(p, TEXT, { keepOpen: false });
	const head = await read(p, SW);
	await writeRaw(p, SW2, (await read(p, SW2)) + 'Added to the new note.\n');
	await sleep(p, 500);
	const said = await back(p);
	t.ok(String(said).startsWith('refused: “Storm warning 2” has been changed since the split'), 'it says why: ' + said);
	t.eq(await read(p, SW), head, 'the first note is untouched');
	t.ok((await read(p, SW2)).endsWith('Added to the new note.\n'), 'the new note keeps its words');
	t.eq(await back(p), null, 'asked again it is given up');
});

test('typing in the first note’s tab that has not been saved yet is written first, counts as a change, and is kept', async (p, h, t) => {
	await openView(p); await reset(p);
	await split(p);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setCursor({ line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 1; })()`);
	await p.type(' PENDING-WORDS');
	const said = await back(p);
	t.ok(String(said).startsWith('refused: '), 'refused: ' + said);
	t.ok((await read(p, SW)).includes('PENDING-WORDS'), 'what was typed is on the disk');
	t.ok(await there(p, SW2), 'the new note is still there');
	await closeTabs(p);
});

test('two undos asked at once: the split is taken back once, and the second finds nothing', async (p, h, t) => {
	await openView(p); await reset(p);
	await split(p, TEXT, { keepOpen: false });
	const both = await p.ev(`Promise.all([${B}.undo(${file('The Lighthouse')}).catch(e => 'refused'), ${B}.undo(${file('The Lighthouse')}).catch(e => 'refused')])`);
	t.eq(j(both), j(['Split “Storm warning”', null]), 'once');
	await settle(p);
	t.eq(await read(p, SW), TEXT, 'the first note is as it was');
	t.ok(!(await there(p, SW2)), 'the new note is gone');
});

test('a note with Windows line endings: split and undone, byte for byte', async (p, h, t) => {
	await openView(p); await reset(p);
	const crlf = TEXT.replace(/\n/g, '\r\n');
	await split(p, crlf, { keepOpen: false });
	t.ok(await there(p, SW2), 'split');
	await back(p); await settle(p);
	t.eq(await read(p, SW), crlf, 'the first note is as it was, line endings and all');
});

test('a name taken meanwhile: redo makes the new note under the next name and touches the note in the way not at all', async (p, h, t) => {
	await openView(p); await reset(p);
	await split(p, TEXT, { keepOpen: false });
	await back(p); await settle(p);
	await p.ev(`app.vault.create(${j(SW2)}, 'Another note.\\n').then(() => 1)`);
	await settle(p);
	await back(p, true); await settle(p);
	t.eq(await read(p, SW2), 'Another note.\n', 'the note in the way is untouched');
	t.ok(await there(p, P1 + 'Storm warning 3.md'), 'the second half is in a note of its own');
});

test('the inspector has the view’s undo keys for the binder it follows: Ctrl+Z there, with no field focused, takes the last change back', async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One'); await reset(p);
	const orig = await read(p, P1 + 'Arrival.md');
	await p.ev(`${VIEW}.setProps(${file(P1 + 'Arrival.md')}, { synopsis: 'By hand.' }).then(() => 1)`);
	await p.ev(`(async () => { const ws = app.workspace; ws.rightSplit.expand(); const l = ws.getRightLeaf(false); await l.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(l); })().then(() => 1)`);
	await sleep(p, 600);
	await p.ev(`(() => { const el = document.querySelector('.workspace-leaf-content[data-type="binders-inspector"]'); el.tabIndex = -1; el.focus(); return 1; })()`);
	await p.key('z', 'ctrl');
	await sleep(p, 800);
	t.eq(await read(p, P1 + 'Arrival.md'), orig, 'the change is taken back');
});
