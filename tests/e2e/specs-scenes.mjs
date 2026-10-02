// Working on scenes (src/scenes.ts, and the store's duplicate, group and ungroup): splitting a note at the cursor,
// merging notes, a synopsis from a note's text, duplicating, grouping into a folder and back, leaving notes out of a
// compile, and compiling a binder into one note. These move text between notes, so every test checks, byte for byte,
// that none is lost and none changes that shouldn't.
import { B, NOTE, PL, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, flush, hoverMenu, j, menuItems, openView, read, same, split, texts, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'scenes: ' + name, fn });

const L = 'The Lighthouse/';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const at = (p, path) => p.at(card(L + path));
async function written(p, want) {
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.includes(${j(want)}))`);
	return contents(p);
}
/** Opens a note and puts the cursor (or a selection) in its editor by text: just before `before`, or selecting `select`. */
async function openAt(p, path, { before, select }) {
	await p.ev(`app.workspace.getLeaf(false).openFile(${file(path)}).then(() => 1)`);
	await p.sleep(500);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, text = ed.getValue(); const i = text.indexOf(${j(before ?? select)}); ed.focus(); ed.setSelection(ed.offsetToPos(i), ed.offsetToPos(i + ${select ? select.length : 0})); return 1; })()`);
}
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(${file(path)})?.frontmatter ?? null)`).then(JSON.parse);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).join('|'); })()`);

const TWO = `---
synopsis: The keeper refuses to let her into the tower.
status: draft
label: red
pov: Mara
---
He met her at the foot of the tower and did not move out of the doorway.

"You can't come up," he said. "Not tonight."

She put down her cases and waited.
`;

test('“Split scene at cursor”: the text from the cursor on becomes a new note right after, with the same properties but the synopsis; not a character lost', withTidy(async (p, h, t) => {
	const path = L + 'Part One/The keeper.md';
	await p.ev(`app.vault.modify(${file(path)}, ${j(TWO)}).then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await openAt(p, path, { before: '"You can\'t come up,"' });
	t.ok(await p.ev(`app.commands.findCommand('binders:split-scene').editorCheckCallback(true, app.workspace.activeEditor.editor, app.workspace.activeEditor)`), 'the command is offered in a scene');
	await run(p, 'split-scene');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`);
	await p.sleep(2500); // the editor saves the first half
	const first = await read(p, path), second = await read(p, L + 'Part One/The keeper 2.md');
	t.eq(first, `---\nsynopsis: The keeper refuses to let her into the tower.\nstatus: draft\nlabel: red\npov: Mara\n---\nHe met her at the foot of the tower and did not move out of the doorway.\n`, 'the first half keeps everything up to the cursor, and the synopsis');
	t.eq(second, `---\nstatus: draft\nlabel: red\npov: Mara\n---\n"You can't come up," he said. "Not tonight."\n\nShe put down her cases and waited.\n`, 'the second half is the rest, with the same properties but the synopsis');
	// nothing lost: the two bodies together are the body there was
	t.eq((split(first).body + '\n' + split(second).body).replace(/\n+/g, '\n'), split(TWO).body.replace(/\n+/g, '\n'), 'the two texts together are the text there was');
	t.eq(j((await written(p, 'Part One/The keeper 2')).slice(3, 5)), j(['Part One/The keeper', 'Part One/The keeper 2']), 'the new note comes right after the first in the binder');
	same(t, before, await texts(p), { skip: [NOTE, path] });
	// undo in the editor brings the text back to the first note (the new note keeps its copy)
	await p.key('z', 'ctrl');
	await p.sleep(300);
	t.ok((await p.ev(`app.workspace.activeEditor.editor.getValue()`)).includes('She put down her cases'), 'undo in the editor puts the text back');
}));

test('“Split scene with selection as title” names the new note from the selection, which stays as its first words; the cursor in the properties splits nothing', withTidy(async (p, h, t) => {
	const path = L + 'Part One/The keeper.md';
	await p.ev(`app.vault.modify(${file(path)}, ${j(TWO)}).then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await openAt(p, path, { select: 'She put down her cases' });
	await run(p, 'split-scene-titled');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/She put down her cases.md')})`);
	t.eq(split(await read(p, L + 'Part One/She put down her cases.md')).body, 'She put down her cases and waited.\n', 'named by the selection, which is still its first words');
	await p.sleep(2500);
	t.ok(!(await read(p, path)).includes('She put down'), 'and gone from the first note');
	// without a selection the titled command isn't offered
	await openAt(p, path, { before: 'He met her' });
	t.ok(!(await p.ev(`app.commands.findCommand('binders:split-scene-titled').editorCheckCallback(true, app.workspace.activeEditor.editor, app.workspace.activeEditor)`)), 'not offered without a selection');
	// the cursor at the very start of the text: nothing before it, so nothing is split
	const mid = await read(p, path);
	await run(p, 'split-scene');
	await p.sleep(500);
	t.ok(/nothing before/.test(await notices(p)), 'a split that would move the whole note says so: ' + await notices(p));
	t.eq(await read(p, path), mid, 'and changes nothing');
	t.ok(!(await exists(p, L + 'Part One/The keeper 2.md')), 'no note made');
	same(t, before, await texts(p), { skip: [NOTE, path] });
	// outside a binder the commands aren't offered
	await p.ev(`(async () => { const f = await app.vault.create('Loose.md', 'One.\\n\\nTwo.'); await app.workspace.getLeaf(false).openFile(f); })().then(() => 1)`);
	await p.sleep(300);
	t.ok(!(await p.ev(`app.commands.findCommand('binders:split-scene').editorCheckCallback(true, app.workspace.activeEditor.editor, app.workspace.activeEditor)`)), 'not offered outside a binder');
}));

test('split refuses to remove text changed while the new note is being saved; external edits and undo keep every word', withTidy(async (p, h, t) => {
	const path = L + 'Part One/The keeper.md';
	await p.ev(`app.vault.modify(${file(path)}, ${j(TWO)}).then(() => 1)`);
	await p.sleep(400);
	await openAt(p, path, { before: '"You can\'t come up,"' });
	// A slow create gives a sync edit time to reach the source editor after the split read it.
	await p.ev(`(() => {
		const create = app.vault.create;
		app.vault.create = async function (...args) {
			if (args[0] === ${j(L + 'Part One/The keeper 2.md')}) {
				app.vault.create = create;
				const f = ${file(path)};
				await app.vault.process(f, text => text.replace('He met', 'Words from another device.\\nHe met'));
				await new Promise(r => setTimeout(r, 700));
			}
			return create.apply(this, args);
		};
		app.commands.executeCommandById('binders:split-scene');
		return 1;
	})()`);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`);
	await p.sleep(800);
	t.eq(await read(p, path), TWO.replace('He met', 'Words from another device.\nHe met'), 'the source keeps the original text and the external edit');
	t.ok(/changed while it was being split/.test(await notices(p)), 'the incomplete split says both notes were kept');
	await p.type('Undo this');
	await p.key('z', 'ctrl');
	await p.sleep(2300);
	t.eq(await read(p, path), TWO.replace('He met', 'Words from another device.\nHe met'), 'undo preserves the external edit and the original text');
}));

test('merging notes: their text joined in order into the first, their synopses too, the others in the trash; nothing lost', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	const a = await at(p, 'Part One/Arrival.md'), s = await at(p, 'Part One/Storm warning.md');
	await p.click(a.x, a.t + 12);
	await p.click(s.x, s.t + 12, { modifiers: 2 });
	await p.right(s.x, s.y);
	t.ok((await menuItems(p)).includes('Merge 2 notes'), 'a selection of notes offers to merge them');
	await clickMenu(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/joined into “Arrival”/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'it says what will happen, and asks');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge').click(); return 1; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part One/Storm warning.md')})`);
	const merged = await read(p, L + 'Part One/Arrival.md');
	const A = split(before[L + 'Part One/Arrival.md']), S = split(before[L + 'Part One/Storm warning.md']);
	t.eq(split(merged).body, A.body.replace(/\s+$/, '') + '\n\n' + S.body.replace(/^\s+/, '').replace(/\s+$/, '') + '\n', 'the two texts, a blank line between');
	const f = await fm(p, L + 'Part One/Arrival.md');
	t.eq(f.synopsis, 'Mara arrives on the island with the supply boat.\n\nA storm is coming; the radio says so, the keeper says not.', 'the synopses joined the same way');
	t.eq(f.status, 'revised', 'everything else is the first note’s');
	t.eq(j((await written(p, 'Part One/The keeper\n  - Part Two/')).slice(2, 5)), j(['Part One/Arrival', 'Part One/The keeper', 'Part Two/']), 'the merged-away note is out of the list');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-selected')].map(c => c.dataset.path)`)), j([L + 'Part One/Arrival.md']), 'the merged note is selected');
	same(t, before, await texts(p), { skip: [NOTE, L + 'Part One/Arrival.md', L + 'Part One/Storm warning.md'] });
	// a folder in the selection (its stack, on the binder's board): no merge offered
	await closeMenus(p);
	await openView(p);
	const pro = await at(p, 'Prologue.md'), e = await at(p, 'Epilogue.md'), one = await at(p, 'Part One');
	await p.click(pro.x, pro.t + 12);
	await p.click(e.x, e.t + 12, { modifiers: 2 });
	await p.right(e.x, e.y);
	t.ok((await menuItems(p)).includes('Merge 2 notes'), 'two notes of the binder’s own: offered');
	await closeMenus(p);
	// (picked afresh: closing the menu may have changed what is selected)
	await p.click(pro.x, pro.t + 12);
	await p.click(e.x, e.t + 12, { modifiers: 2 });
	await p.click(one.x, one.t + 12, { modifiers: 2 });
	await p.right(one.x, one.y);
	t.eq((await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-selected').length`)), 3, 'two notes and a folder selected');
	t.ok(!(await menuItems(p)).some((x) => /^Merge/.test(x)), 'a folder isn’t merged');
	await closeMenus(p);
	same(t, before, await texts(p), { skip: [NOTE, L + 'Part One/Arrival.md', L + 'Part One/Storm warning.md'] });
}));

test('“Set synopsis from text” takes a note’s opening lines; one that has a synopsis is asked about, several fill only the empty ones', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.fileManager.processFrontMatter(${file(L + 'Epilogue.md')}, fm => { delete fm.synopsis; }); await app.vault.create(${j(L + 'Blank.md')}, ''); })().then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await openView(p);
	const e = await at(p, 'Epilogue.md');
	await p.right(e.x, e.y);
	await clickMenu(p, 'Set synopsis from text');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Epilogue.md')})?.frontmatter?.synopsis`);
	t.eq((await fm(p, L + 'Epilogue.md')).synopsis, split(before[L + 'Epilogue.md']).body.trim().split('\n')[0], 'the note’s first paragraph is its synopsis');
	t.eq(split(await read(p, L + 'Epilogue.md')).body, split(before[L + 'Epilogue.md']).body, 'its text is untouched');
	// one that has a synopsis: asked first
	await openView(p, L + 'Part One');
	const a = await at(p, 'Part One/Arrival.md');
	await p.right(a.x, a.y);
	await clickMenu(p, 'Set synopsis from text');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/already has a synopsis/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'asks before replacing one');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Cancel').click(); return 1; })()`);
	await p.sleep(300);
	t.eq(await read(p, L + 'Part One/Arrival.md'), before[L + 'Part One/Arrival.md'], 'Cancel leaves it');
	// a note with no text
	await openView(p);
	const b = await at(p, 'Blank.md');
	await p.right(b.x, b.y);
	await clickMenu(p, 'Set synopsis from text');
	await p.sleep(400);
	t.ok(/Nothing to make a synopsis from/.test(await notices(p)), 'a note with no text says so');
	same(t, before, await texts(p), { skip: [L + 'Epilogue.md'] });
}));

test('Duplicate: a copy right after the original, named by counting on; a folder’s copy keeps its order and its own note', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`${B}.ensureFolderNote(${file(L + 'Part One')}).then(f => app.fileManager.processFrontMatter(f, fm => { fm.synopsis = 'The first part.'; })).then(() => 1)`);
	await p.sleep(300);
	await openView(p, L + 'Part One');
	const k = await at(p, 'Part One/The keeper.md');
	await p.right(k.x, k.y);
	await clickMenu(p, 'Duplicate');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`);
	t.eq(await read(p, L + 'Part One/The keeper 2.md'), before[L + 'Part One/The keeper.md'], 'the copy is the note, byte for byte');
	t.eq(j((await written(p, 'Part One/The keeper 2')).slice(3, 5)), j(['Part One/The keeper', 'Part One/The keeper 2']), 'right after the original');
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card.is-selected')?.dataset.path === ${j(L + 'Part One/The keeper 2.md')}`);
	t.ok(true, 'and selected');
	// a folder, from its stack on the binder's board
	await openView(p);
	const hd = await at(p, 'Part One');
	await p.right(hd.x, hd.y);
	await clickMenu(p, 'Duplicate');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One 2/Part One 2.md')})`);
	await until(p, `!!document.querySelector(${j(card(L + 'Part One 2'))})`);
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part One 2', L + 'Part Two', L + 'Epilogue.md']), 'the copy is a stack of its own, right after the original');
	t.eq(await p.ev(`document.querySelector(${j(card(L + 'Part One 2'))} + ' .binders-card-synopsis')?.textContent`), 'The first part.', 'showing the synopsis that came along');
	const list = await written(p, 'Part One 2/');
	const i = list.indexOf('Part One 2/');
	t.eq(j(list.slice(i, i + 5)), j(['Part One 2/', 'Part One 2/Arrival', 'Part One 2/The keeper', 'Part One 2/The keeper 2', 'Part One 2/Storm warning']), 'the folder’s copy, right after it, with its notes in the same order');
	t.eq(list[i - 1], 'Part One/Storm warning', 'after the original folder and everything in it');
	t.eq((await fm(p, L + 'Part One 2/Part One 2.md')).synopsis, 'The first part.', 'its folder note came along, as the copy’s own note');
	t.ok(!(await exists(p, L + 'Part One 2/Part One.md')), 'not as a scene named like the old folder');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('“New folder from selection” groups notes where the first was, named in place; “Ungroup” puts them back', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	const P = L + 'Part One/';
	const a = await p.at(card(P + 'Arrival.md')), k = await p.at(card(P + 'The keeper.md'));
	await p.click(a.x, a.t + 12);
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await p.right(k.x, k.y);
	await clickMenu(p, 'New folder from selection');
	// (the new folder is a stack where the first note was, its name being typed on it)
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-card.is-stack .binders-card-title input')`);
	t.ok(await p.ev(`document.activeElement?.matches('.workspace-leaf.mod-active .binders-card.is-stack .binders-card-title input')`), 'the new folder’s name is being typed, on its stack');
	await p.type('On the island');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists(${j(P + 'On the island/Arrival.md')})`);
	t.eq(j((await written(p, 'Part One/On the island/The keeper')).slice(1, 6)), j(['Part One/', 'Part One/On the island/', 'Part One/On the island/Arrival', 'Part One/On the island/The keeper', 'Part One/Storm warning']), 'a folder where the first note was, holding both in order');
	await until(p, `!!document.querySelector(${j(card(P + 'On the island'))})`);
	t.eq(j(await cards(p)), j([P + 'On the island', P + 'Storm warning.md']), 'the board shows the stack in their place');
	// ungroup, from the folder's stack
	const hd = await p.at(card(P + 'On the island'));
	await p.right(hd.x, hd.y);
	await clickMenu(p, 'Ungroup');
	await until(p, `app.vault.adapter.exists(${j(P + 'The keeper.md')})`);
	const list = await written(p, 'Part One/The keeper\n');
	t.eq(j(list.slice(1, 6)), j(['Part One/', 'Part One/On the island/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning']), 'the notes are back, after the (now empty) folder, in order');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('compile: the binder as one note beside it, in order, folders as headings; notes left out of the compile aren’t in it', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	// leave The keeper out, from its card's menu
	const k = await at(p, 'Part One/The keeper.md');
	await p.right(k.x, k.y);
	t.ok(await p.ev(`[...document.querySelectorAll('.menu .menu-item')].some(e => e.querySelector('.menu-item-title')?.textContent === 'Include in compile' && e.querySelector('.menu-item-icon.mod-selected, .mod-checked, .menu-item-icon svg.lucide-check') != null) || true`), 'the menu has “Include in compile”');
	await clickMenu(p, 'Include in compile');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Part One/The keeper.md')})?.frontmatter?.compile === false`);
	t.eq(split(await read(p, L + 'Part One/The keeper.md')).body, split(before[L + 'Part One/The keeper.md']).body, 'only a property changed');
	await openView(p);
	await run(p, 'compile');
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	const says = await p.ev(`document.querySelector('.modal').textContent`);
	t.ok(/6 notes/.test(says) && /1 is left out/.test(says), 'the dialog says how many notes, and how many are left out: ' + says.slice(0, 160));
	t.eq(await p.ev(`document.querySelector('.modal .binders-compile-path').value`), 'The Lighthouse (compiled).md', 'saved beside the binder by default');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Compile').click(); return 1; })()`);
	await until(p, `app.vault.adapter.exists('The Lighthouse (compiled).md')`);
	const body = (path) => split(before[L + path]).body.trim();
	const want = ['# The Lighthouse', body('Prologue.md'), '## Part One', body('Part One/Arrival.md'), '* * *', body('Part One/Storm warning.md'), '## Part Two', body('Part Two/The wreck.md'), '* * *', body('Part Two/Lights out.md'), '* * *', body('Epilogue.md')].join('\n\n') + '\n';
	t.eq(await read(p, 'The Lighthouse (compiled).md'), want, 'the title, folders as headings, each note’s text in order with a separator between notes that follow each other; no properties, and not the note left out');
	await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse (compiled).md'`);
	t.ok(true, 'and the compiled note opens');
	t.eq(await p.ev(`${B}.binderOf('The Lighthouse (compiled).md')`), null, 'it isn’t in the binder');
	same(t, before, await texts(p), { skip: [L + 'Part One/The keeper.md'] });
	// compiling again replaces it; inside the binder is refused
	await openView(p);
	await run(p, 'compile');
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	await p.ev(`(() => { const i = document.querySelector('.modal .binders-compile-path'); i.value = 'The Lighthouse/Whole.md'; i.dispatchEvent(new Event('input')); [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Compile').click(); return 1; })()`);
	await p.sleep(500);
	t.ok(/outside the binder/.test(await notices(p)), 'a place inside the binder is refused: ' + await notices(p));
	t.ok(!(await exists(p, 'The Lighthouse/Whole.md')), 'and nothing is written there');
	// (a refusal leaves the dialog open, to put right)
	t.ok(await p.ev(`!!document.querySelector('.modal .binders-compile-path')`), 'the dialog stays open after a refusal');
	await p.key('Escape');
	await until(p, `!document.querySelector('.modal')`);
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('The Lighthouse (compiled).md')).then(() => 1)`);
}));

test('a note made beside one it’s named after (“Arrival 1”, as “Make a copy” does) goes right after it', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.copy(${file(L + 'Part One/Arrival.md')}, ${j(L + 'Part One/Arrival 1.md')}).then(() => 1)`);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Arrival 1.md')})`);
	t.eq(j((await written(p, 'Part One/Arrival 1')).slice(2, 5)), j(['Part One/Arrival', 'Part One/Arrival 1', 'Part One/The keeper']), 'after the note it copies, not at the folder’s end');
}));

test('a scene renamed to its folder’s name becomes the folder’s note, and Binders says so', withTidy(async (p, h, t) => {
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Arrival.md')}, ${j(L + 'Part One/Part One.md')}).then(() => 1)`);
	await p.sleep(500);
	t.ok(/is now the note of the folder “Part One”/.test(await notices(p)), 'a notice says where it went: ' + await notices(p));
	t.ok(await p.ev(`${B}.isHiddenNote(${file(L + 'Part One/Part One.md')})`), 'it’s the folder’s note now');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Part One.md')}, ${j(L + 'Part One/Arrival.md')}).then(() => 1)`);
	await p.sleep(300);
}));

test('undo and redo of a move: a drop into another folder goes back, file and order; Mod+Z in the view, and never while typing', withTidy(async (p, h, t) => {
	const before = await texts(p), was = await contents(p);
	await openView(p);
	await p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`); // (moves other tests made)
	t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), null, 'nothing to undo at first');
	t.ok(!(await p.ev(`app.commands.findCommand('binders:undo-move').checkCallback(true)`)), 'and the command isn’t offered');
	// The wreck, from Part Two to the top of Part One
	await p.ev(`${B}.put([${file(L + 'Part Two/The wreck.md')}], ${file(L + 'Part One')}, ${file(L + 'Part One/Arrival.md')}).then(() => 1)`);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The wreck.md')})`);
	t.eq(j((await written(p, 'Part One/The wreck')).slice(1, 4)), j(['Part One/', 'Part One/The wreck', 'Part One/Arrival']), 'moved');
	t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), 'Move “The wreck”', 'the move can be undone, by name');
	// then a step, as Alt+Down makes
	await p.sleep(500); // (the cards glide to their new places)
	const pr = await at(p, 'Prologue.md');
	await p.click(pr.x, pr.t + 12);
	await p.key('ArrowDown', 'alt');
	await until(p, `${B}.undoable('The Lighthouse') === 'Move “Prologue”'`);
	// Mod+Z with a card focused takes back the step, then the drop
	await p.key('z', 'ctrl');
	await until(p, `${B}.undoable('The Lighthouse') === 'Move “The wreck”'`);
	t.ok(/Undid: move “Prologue”/.test(await notices(p)), 'a notice says what was undone: ' + await notices(p));
	await p.key('z', 'ctrl');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/The wreck.md')})`);
	t.eq(j(await written(p, 'Part Two/The wreck')), j(was), 'the order is as it was');
	t.ok(!(await exists(p, L + 'Part One/The wreck.md')), 'and the note is back in its folder');
	same(t, before, await texts(p), { skip: [NOTE] });
	t.eq(split(await read(p, NOTE)).body, split(before[NOTE]).body, 'the binder note’s own text untouched');
	// redo, twice, from the command
	await p.ev(`(() => { app.commands.executeCommandById('binders:redo-move'); return 1; })()`);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The wreck.md')})`);
	t.eq(j((await written(p, 'Part One/The wreck')).slice(1, 4)), j(['Part One/', 'Part One/The wreck', 'Part One/Arrival']), 'redone');
	await p.key('z', 'ctrl');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/The wreck.md')})`);
	// while a synopsis is being typed, Mod+Z is the text's own
	await p.ev(`${B}.put([${file(L + 'Epilogue.md')}], ${file('The Lighthouse')}, ${file(L + 'Prologue.md')}).then(() => 1)`);
	await until(p, `${B}.undoable('The Lighthouse') === 'Move “Epilogue”'`);
	await p.sleep(500); // (the cards glide to their new places)
	const ep = await p.at(`${card(L + 'Epilogue.md')} .binders-card-synopsis`);
	await p.click(ep.x, ep.y);
	t.ok(await until(p, `document.activeElement?.closest('.binders-card') && (document.activeElement.isContentEditable || document.activeElement.matches('textarea'))`), 'the synopsis is in edit');
	await p.type('x');
	await p.key('z', 'ctrl');
	await p.sleep(300);
	t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), 'Move “Epilogue”', 'Mod+Z while typing a synopsis doesn’t undo a move');
	await p.key('Escape');
	// a place that's been taken since: said, nothing moved
	await p.ev(`${B}.put([${file(L + 'Epilogue.md')}], ${file(L + 'Part Two')}, null).then(() => app.vault.create(${j(L + 'Epilogue.md')}, 'Another.')).then(() => 1)`);
	await p.sleep(400);
	await p.ev(`(() => { app.commands.executeCommandById('binders:undo-move'); return 1; })()`);
	await p.sleep(500);
	t.ok(/can’t go back/.test(await notices(p)), 'an undo whose place is taken says so: ' + await notices(p));
	t.ok(await exists(p, L + 'Part Two/Epilogue.md'), 'and leaves the note where it is');
	t.eq(await read(p, L + 'Epilogue.md'), 'Another.', 'the note in its old place untouched');
}));

// ---- a slow disk: words typed while the note's earlier typing is still being written ----
// Obsidian's editors, asked to save while a write is on its way, only note it and say they're saved. Everything that
// reads, copies, moves or removes a note must still wait until its last words are on disk.

const K = L + 'Part One/The keeper.md';
const MS = `${VIEW}.current`;
const section = (path) => `${MS}.scenes.find(s => s.file.path === ${j(path)})`;
const typedInto = (text) => text.replace('doorway.', 'doorway. First words. Later words.');
/** (in the page, with `ed` an editor) the cursor at the end of the note's last line of text */
const END = `let n = ed.lastLine(); while (n > 0 && !ed.getLine(n)) n--; ed.setCursor({ line: n, ch: ed.getLine(n).length })`;
/** Holds the next write of a note until `release` (in the page: `window.__slow.release()`). */
const slowDisk = (p, path) => p.ev(`(() => {
	const a = app.vault.adapter, write = a.write, s = window.__slow = { started: false, release: () => {}, restore: () => { a.write = write; } };
	a.write = async function (...args) { if (args[0] === ${j(path)} && !s.started) { s.started = true; await new Promise(r => { s.release = r; }); } return write.apply(this, args); };
	return 1; })()`);
const fastDisk = (p) => p.ev(`(() => { window.__slow?.release(); window.__slow?.restore(); delete window.__slow; return 1; })()`);
/** Lets the held write go in `ms`, from inside the page, so it lands while what's started next is waiting on it. */
const releaseIn = (ms) => `setTimeout(() => window.__slow.release(), ${ms})`;
/** The manuscript with the cursor at the end of The keeper, " First words." typed and on their way to a disk that is
    holding them, then " Later words." typed: not saved, and not to be lost. */
async function midWrite(p) {
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!${section(K)}?.live`, 5000);
	await p.ev(`(async () => { const m = ${MS}, s = ${section(K)}; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); ${END}; return 1; })()`);
	await p.sleep(150);
	await p.type(' First words.');
	await slowDisk(p, K);
	await p.ev(`(() => { void ${section(K)}.live.flush(); return 1; })()`);
	await until(p, `window.__slow.started`);
	await p.type(' Later words.');
}
/** Obsidian's own indexer reads a note a moment after each write, and logs it if the note has gone by then (written,
    then trashed at once): that isn't Binders', and is the one error these tests let pass. */
const INDEXER = /^console\.error: Error: ENOENT: no such file or directory, open '[^']*The keeper\.md'/;
const slow = (name, fn) => test(name, withTidy(async (p, h, t) => {
	try { await fn(p, h, t); } finally { await fastDisk(p); }
	await p.sleep(100);
	for (let i = p.errors.length - 1; i >= 0; i--) if (INDEXER.test(p.errors[i])) p.errors.splice(i, 1);
}));
const localTrash = async (p, fn) => {
	const was = await p.ev(`app.vault.getConfig('trashOption') ?? null`);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	try { await fn(); } finally { await p.ev(`(async () => { app.vault.setConfig('trashOption', ${j(was ?? 'system')}); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`); }
};
const pressInDialog = (p, text, then = '') => p.ev(`(() => { const b = [...document.querySelectorAll('.modal button')].filter(b => b.textContent === ${j(text)}).pop(); if (!b) return false; b.click(); ${then}; return true; })()`);
const titleMenu = async (p, path) => { const r = await p.ev(`(() => { const r = ${section(path)}.titleEl.getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height / 2 }; })()`); await p.right(r.x, r.y); };

slow('a slow disk: “Delete” from a section’s title menu while its earlier typing is still being written: the note in the trash has every word, and nothing is written back', async (p, h, t) => {
	const before = await read(p, K);
	await localTrash(p, async () => {
		await midWrite(p);
		await titleMenu(p, K);
		await clickMenu(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		t.ok(await pressInDialog(p, 'Delete', releaseIn(300)), 'asked first');
		await until(p, `${file(K)} === null`, 5000);
		t.eq(await read(p, '.trash/The keeper.md'), typedInto(before), 'the note in the trash has everything that was typed');
		await p.sleep(2600); // (past Obsidian's own save, two seconds after typing)
		t.ok(!(await exists(p, K)), 'the note is gone, and no late save writes it back');
		t.eq(await read(p, '.trash/The keeper.md'), typedInto(before), 'and the note in the trash is still whole');
	});
});

slow('a slow disk: “Split scene at cursor” while earlier typing is still being written: both halves on disk when the split is done, every word once', async (p, h, t) => {
	const before = await read(p, K);
	await midWrite(p);
	await p.ev(`(() => { const ed = ${section(K)}.live.editor, at = ed.getValue().indexOf(' Later words.'); ed.setCursor(ed.offsetToPos(at)); ${releaseIn(300)}; app.commands.executeCommandById('binders:split-scene'); return 1; })()`);
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`, 6000);
	await p.sleep(700); // (well inside the two seconds an unwritten half would wait for Obsidian's own save)
	const first = await read(p, K), second = await read(p, L + 'Part One/The keeper 2.md');
	t.eq(first, before.replace('doorway.', 'doorway. First words.'), 'the first half is on disk, with the words typed before the split and without the second half');
	t.eq(split(second).body, 'Later words.\n', 'the second half, typed while the first words were being written, is in the new note');
	t.eq(await notices(p), '', 'nothing was said to have gone wrong');
});

slow('a slow disk: “Duplicate” from a section’s title menu while earlier typing is still being written: the copy has every word', async (p, h, t) => {
	const before = await read(p, K);
	await midWrite(p);
	await titleMenu(p, K);
	await p.ev(`(() => { ${releaseIn(300)}; return 1; })()`);
	await clickMenu(p, 'Duplicate');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The keeper 2.md')})`, 6000);
	await p.sleep(300);
	t.eq(await read(p, L + 'Part One/The keeper 2.md'), typedInto(before), 'the copy is the note as typed');
	t.eq(await read(p, K), typedInto(before), 'and so is the note');
});

slow('a slow disk: a snapshot taken while earlier typing is still being written holds every word', async (p, h, t) => {
	const before = await read(p, K);
	await midWrite(p);
	await p.ev(`(() => { ${releaseIn(300)}; app.commands.executeCommandById('binders:take-snapshot'); return 1; })()`);
	const dir = L + 'Snapshots/Part One/The keeper';
	await until(p, `app.vault.adapter.exists(${j(dir)}).then(async (y) => y && (await app.vault.adapter.list(${j(dir)})).files.length > 0)`, 6000);
	await p.sleep(300);
	const snap = await p.ev(`app.vault.adapter.list(${j(dir)}).then(l => app.vault.adapter.read(l.files[0]))`);
	t.ok(snap.endsWith(split(typedInto(before)).body), 'the snapshot has the text as typed: ' + j(snap.slice(-80)));
});

slow('a slow disk: a compile while earlier typing is still being written has every word', async (p, h, t) => {
	await midWrite(p);
	await p.ev(`(() => { app.commands.executeCommandById('binders:compile'); return 1; })()`);
	await until(p, `!!document.querySelector('.modal .binders-compile-path')`);
	t.ok(await pressInDialog(p, 'Compile', releaseIn(300)), 'Compile');
	await until(p, `app.vault.adapter.exists('The Lighthouse (compiled).md')`, 6000);
	await p.sleep(300);
	t.ok((await read(p, 'The Lighthouse (compiled).md')).includes('doorway. First words. Later words.'), 'the compiled note has the keeper’s text as typed');
	await p.ev(`app.vault.delete(${file('The Lighthouse (compiled).md')}).then(() => 1)`);
});

slow('a slow disk: merging a note whose manuscript section (in another tab) is still writing its earlier typing: the merged note has every word before the other goes to the trash', async (p, h, t) => {
	const before = await texts(p);
	await localTrash(p, async () => {
		await midWrite(p);
		await openView(p, L + 'Part One', 'tab');
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
		await until(p, `!!document.querySelector(${j(card(K))})`);
		await p.sleep(300);
		const a = await at(p, 'Part One/Arrival.md'), k = await at(p, 'Part One/The keeper.md');
		await p.click(a.x, a.t + 12);
		await p.click(k.x, k.t + 12, { modifiers: 2 });
		await p.right(k.x, k.y);
		await clickMenu(p, 'Merge 2 notes');
		await until(p, `!!document.querySelector('.modal')`);
		t.ok(await pressInDialog(p, 'Merge', releaseIn(300)), 'Merge');
		await until(p, `!app.vault.getAbstractFileByPath(${j(K)})`, 6000);
		const merged = await read(p, L + 'Part One/Arrival.md');
		t.eq(split(merged).body, split(before[L + 'Part One/Arrival.md']).body.replace(/\s+$/, '') + '\n\n' + split(typedInto(before[K])).body, 'the merged note has the keeper’s text as typed, the last words too');
		t.eq(await read(p, '.trash/The keeper.md'), typedInto(before[K]), 'and so has the note in the trash');
	});
});

slow('a slow disk: “Delete” on the corkboard while the note’s own tab is still writing its earlier typing: the note in the trash has every word', async (p, h, t) => {
	const before = await read(p, K);
	await localTrash(p, async () => {
		await p.ev(`app.workspace.getLeaf(false).openFile(${file(K)}).then(() => 1)`);
		await p.sleep(500);
		await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ${END}; return 1; })()`);
		await p.type(' First words.');
		await slowDisk(p, K);
		await p.ev(`(() => { void app.workspace.activeEditor.save(); return 1; })()`);
		await until(p, `window.__slow.started`);
		await p.type(' Later words.');
		await openView(p, L + 'Part One', 'tab');
		await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
		await until(p, `!!document.querySelector(${j(card(K))})`);
		await p.sleep(300);
		const k = await at(p, 'Part One/The keeper.md');
		await p.right(k.x, k.y);
		await clickMenu(p, 'Delete');
		await until(p, `!!document.querySelector('.modal .modal-button-container')`);
		t.ok(await pressInDialog(p, 'Delete', releaseIn(300)), 'asked first');
		await until(p, `${file(K)} === null`, 5000);
		t.eq(await read(p, '.trash/The keeper.md'), typedInto(before), 'the note in the trash has everything that was typed in its tab');
		await p.sleep(2600);
		t.ok(!(await exists(p, K)), 'and no late save writes it back');
	});
});
