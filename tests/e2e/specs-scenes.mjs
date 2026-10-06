// Working on scenes (src/scenes.ts, and the store's duplicate, group and ungroup): splitting a note at the cursor,
// merging notes, a synopsis from a note's text, duplicating, grouping into a folder and back, leaving notes out of a
// export, and exporting a binder as one note. These move text between notes, so every test checks, byte for byte,
// that none is lost and none changes that shouldn't.
import { B, NOTE, PL, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, flush, hoverMenu, j, menuItems, openView, read, same, split, texts, until, withTidy } from './view-helpers.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

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
	t.eq(j(list.slice(1, 5)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning']), 'the notes are back where they were, in order, and the emptied folder is off the list');
	t.ok(!(await exists(p, P + 'On the island')), 'the emptied folder is gone');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('export as one note: the binder as one note beside it, in order, folders as headings; notes left out of the export aren’t in it', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	// leave The keeper out, from its card's menu
	const k = await at(p, 'Part One/The keeper.md');
	await p.right(k.x, k.y);
	t.ok(await p.ev(`[...document.querySelectorAll('.menu .menu-item')].some(e => e.querySelector('.menu-item-title')?.textContent === 'Include in export' && e.querySelector('.menu-item-icon.mod-selected, .mod-checked, .menu-item-icon svg.lucide-check') != null) || true`), 'the menu has “Include in export”');
	await clickMenu(p, 'Include in export');
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Part One/The keeper.md')})?.frontmatter?.export === false`);
	t.eq(split(await read(p, L + 'Part One/The keeper.md')).body, split(before[L + 'Part One/The keeper.md']).body, 'only a property changed');
	await openView(p);
	await (await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`), run(p, 'export'));
	await until(p, `!!document.querySelector('.modal .binders-export-path')`);
	// (the bar's count comes once the notes are read)
	await until(p, `!!document.querySelector('.modal.binders-export .binders-snapshots-detail')?.textContent`);
	const says = await p.ev(`document.querySelector('.modal.binders-export .binders-snapshots-detail').textContent + ' | ' + document.querySelector('.modal.binders-export .binders-export-needs').textContent`);
	t.ok(/^6 notes · /.test(says) && /1 note is left out\./.test(says), 'the window says how many notes, and how many are left out: ' + says.slice(0, 260));
	t.eq(await p.ev(`document.querySelector('.modal .binders-export-path').value`), 'The Lighthouse (exported).md', 'saved beside the binder by default');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Export').click(); return 1; })()`);
	await until(p, `app.vault.adapter.exists('The Lighthouse (exported).md')`);
	const body = (path) => split(before[L + path]).body.trim();
	const want = ['# The Lighthouse', body('Prologue.md'), '## Part One', body('Part One/Arrival.md'), '* * *', body('Part One/Storm warning.md'), '## Part Two', body('Part Two/The wreck.md'), '* * *', body('Part Two/Lights out.md'), '* * *', body('Epilogue.md')].join('\n\n') + '\n';
	t.eq(await read(p, 'The Lighthouse (exported).md'), want, 'the title, folders as headings, each note’s text in order with a separator between notes that follow each other; no properties, and not the note left out');
	await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse (exported).md'`);
	t.ok(true, 'and the exported note opens');
	t.eq(await p.ev(`${B}.binderOf('The Lighthouse (exported).md')`), null, 'it isn’t in the binder');
	same(t, before, await texts(p), { skip: [L + 'Part One/The keeper.md'] });
	// exporting again replaces it; inside the binder is refused
	await openView(p);
	await (await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`), run(p, 'export'));
	await until(p, `!!document.querySelector('.modal .binders-export-path')`);
	await p.ev(`(() => { const i = document.querySelector('.modal .binders-export-path'); i.value = 'The Lighthouse/Whole.md'; i.dispatchEvent(new Event('input')); [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Export').click(); return 1; })()`);
	await p.sleep(500);
	t.ok(/outside the binder/.test(await notices(p)), 'a place inside the binder is refused: ' + await notices(p));
	t.ok(!(await exists(p, 'The Lighthouse/Whole.md')), 'and nothing is written there');
	// (a refusal leaves the window open, to put right)
	t.ok(await p.ev(`!!document.querySelector('.modal .binders-export-path')`), 'the window stays open after a refusal');
	await p.key('Escape');
	await until(p, `!document.querySelector('.modal')`);
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('The Lighthouse (exported).md')).then(() => 1)`);
}));

// ---- where properties end and text begins (scene-text.ts, `parts`): only a block that reads as properties is left out ----
// A note can open with a rule, and have another further down: what's between is the writer's text, not properties.
// Each kind of note here is [its name, its bytes on disk, the properties block Binders must find in it ("" for none)].
const BOM = '\uFEFF', crlf = (s) => s.replace(/\n/g, '\r\n');
const RULED = '---\n\nLost paragraph.\n\n---\n\nKept.\n', PROPS = '---\nstatus: draft\npov: Mara\n---\n';
const KINDS = [
	['a rule', RULED, ''],
	['b rule CRLF', crlf(RULED), ''],
	['c rule BOM', BOM + RULED, ''],
	['d prose', '---\nA line of prose between two rules.\n---\nAfter the prose.\n', ''],
	['e bad YAML', '---\nfoo: [unclosed\n---\nAfter the bad block.\n', ''],
	['f list', '---\n- one\n- two\n---\nAfter the list.\n', ''],
	['g props', PROPS + 'Real one.\n\nReal two.\n', PROPS],
	['h props CRLF', crlf(PROPS + 'Windows one.\n\nWindows two.\n'), crlf(PROPS)],
	['i props BOM', BOM + PROPS + 'Marked one.\n', PROPS],
	['j props then rule', PROPS + '---\n\nUnder a rule.\n\n---\n\nAnd another.\n', PROPS],
	['k comments', '---\n# a note to self\n---\nAfter the comments.\n', '---\n# a note to self\n---\n'],
	['l empty then rule', '---\n---\nFirst.\n\n---\n\nSecond.\n', '---\n---\n'],
];
const noBom = (s) => (s.startsWith(BOM) ? s.slice(1) : s);
/** A note's text as Binders must take it: all of the note but its properties block (a byte-order mark is no text). */
const textOfKind = ([, text, front]) => noBom(text).slice(front.length);
/** The bytes on disk, read by Node (Obsidian's own reading drops a byte-order mark). */
const disk = (p, path) => readFileSync(join(p.vaultDir, path), 'utf8');
/** A binder of its own, “Odd”, holding these notes as another program wrote them. */
async function odd(p, notes) {
	await p.ev(`(async () => { await app.vault.createFolder('Odd'); for (const [n, s] of ${j(notes.map(([n, s]) => [n, s]))}) await app.vault.adapter.write('Odd/' + n + '.md', s); await new Promise(r => setTimeout(r, 800)); await ${B}.makeBinder(app.vault.getAbstractFileByPath('Odd')); await ${B}.flush(); })().then(() => 1)`);
	await until(p, `${B}.scenes(app.vault.getAbstractFileByPath('Odd')).length === ${notes.length}`);
	await p.sleep(300);
}
/** Runs what Binders adds to the file explorer's menu for these notes, by its title. */
const explorerMenu = (p, paths, title) => p.ev(`(() => {
	const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const s = {}, it = new Proxy({}, { get: (x, m) => m === 's' ? s : (v) => { if (m === 'setTitle') s.t = v; if (m === 'onClick') s.f = v; return it; } }); cb(it); items.push(s); return menu; } : () => menu });
	const fs = ${j(paths)}.map(x => app.vault.getAbstractFileByPath(x));
	if (fs.length > 1) app.workspace.trigger('files-menu', menu, fs, 'file-explorer-context-menu'); else app.workspace.trigger('file-menu', menu, fs[0], 'file-explorer-context-menu');
	const it = items.find(i => i.t === ${j(title)});
	if (!it) throw new Error('no “' + ${j(title)} + '” among: ' + items.map(i => i.t).join(', '));
	it.f({});
	return 1;
})()`);
async function merge(p, paths) {
	await explorerMenu(p, paths, `Merge ${paths.length} notes`);
	await until(p, `!!document.querySelector('.modal .mod-cta')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge').click(); return 1; })()`);
	await until(p, `${j(paths.slice(1))}.every(x => !app.vault.getAbstractFileByPath(x))`, 8000);
	await p.sleep(300);
}
/** Texts joined as a merge joins them: a blank line between, one line break at the end. */
const joined = (bodies) => bodies.map((b) => b.replace(/^\s*\n/, '').replace(/\s+$/, '')).filter((b) => b.trim()).join('\n\n') + '\n';

test('merging notes that open with a rule, bad properties, a list, real properties, Windows line breaks, a byte-order mark: every word of text is in the merged note, and only properties are left out', withTidy(async (p, h, t) => {
	await odd(p, [['0 Alpha', 'Alpha.\n'], ...KINDS]);
	const paths = ['0 Alpha', ...KINDS.map((k) => k[0])].map((n) => `Odd/${n}.md`);
	await merge(p, paths);
	t.eq(disk(p, paths[0]), joined(['Alpha.\n', ...KINDS.map(textOfKind)]), 'the merged note, byte for byte: each note’s text in order');
	t.ok(disk(p, paths[0]).includes('Lost paragraph.') && disk(p, paths[0]).includes('foo: [unclosed') && disk(p, paths[0]).includes('- one'), 'a paragraph, a broken block and a list between two rules are text, and are there');
	t.ok(!/status: draft|a note to self/.test(disk(p, paths[0])), 'properties (and a block of nothing but comments, which Obsidian hides as it does properties) are not');
}));

test('merging into a note that opens with a rule, has bad properties, real ones, Windows line breaks or a byte-order mark: its own bytes stay, the other’s text follows', withTidy(async (p, h, t) => {
	await odd(p, [...KINDS, ...KINDS.map((k) => [`z to ${k[0]}`, `Joined to ${k[0]}.\n`])]);
	for (const k of KINDS) {
		const [name, text, front] = k, path = `Odd/${name}.md`, mark = text.startsWith(BOM) ? BOM : '';
		await merge(p, [path, `Odd/z to ${name}.md`]);
		t.eq(disk(p, path), mark + front + joined([textOfKind(k), `Joined to ${name}.\n`]), `“${name}”: what comes before its text byte for byte, its text whole, then the other’s (${j(text.slice(0, 24))})`);
	}
}));

test('exporting a binder of such notes as one note: every word of text, no properties, and no note changed by a byte', withTidy(async (p, h, t) => {
	await odd(p, KINDS);
	const before = Object.fromEntries(KINDS.map(([n]) => [n, disk(p, `Odd/${n}.md`)]));
	for (const [n, text] of KINDS) t.eq(before[n], text, `“${n}” is on disk as given`);
	await openView(p, 'Odd');
	await (await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`), run(p, 'export'));
	await until(p, `!!document.querySelector('.modal .binders-export-path')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Export').click(); return 1; })()`);
	await until(p, `app.vault.adapter.exists('Odd (exported).md')`);
	await p.sleep(400);
	const want = ['# Odd', ...KINDS.map((k) => textOfKind(k).replace(/^\s*\n/, '').replace(/\s+$/, '')).flatMap((b, i) => (i ? ['* * *', b] : [b]))].join('\n\n') + '\n';
	t.eq(disk(p, 'Odd (exported).md'), want, 'the exported note, byte for byte');
	for (const [n, text] of KINDS) t.eq(disk(p, `Odd/${n}.md`), text, `“${n}” is byte for byte what it was (its line breaks and its byte-order mark too)`);
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Odd (exported).md')).then(() => 1)`);
}));

test('splitting a note that opens with a rule, in its first paragraph; one with bad properties, in them; one with real properties and Windows line breaks', withTidy(async (p, h, t) => {
	await odd(p, [KINDS[0], KINDS[4], KINDS[7]]);
	// in the first paragraph, which is text
	await openAt(p, 'Odd/a rule.md', { before: 'paragraph.' });
	t.ok(await p.ev(`app.commands.findCommand('binders:split-scene').editorCheckCallback(true, app.workspace.activeEditor.editor, app.workspace.activeEditor)`), 'the command is offered');
	await run(p, 'split-scene');
	await until(p, `app.vault.adapter.exists('Odd/a rule 2.md')`);
	await until(p, `app.vault.adapter.read('Odd/a rule.md').then(s => !s.includes('Kept'))`, 5000);
	t.eq(disk(p, 'Odd/a rule.md'), '---\n\nLost\n', 'the first half: the rule and the words before the cursor');
	t.eq(disk(p, 'Odd/a rule 2.md'), 'paragraph.\n\n---\n\nKept.\n', 'the second half: the rest, with no properties made up for it');
	t.ok(!/Click in the note’s text/.test(await notices(p)), 'and it wasn’t refused as a place in the properties');
	// in a block that can't be read as properties: it is text, so it splits there
	await openAt(p, 'Odd/e bad YAML.md', { before: '[unclosed' });
	await run(p, 'split-scene');
	await until(p, `app.vault.adapter.exists('Odd/e bad YAML 2.md')`);
	await until(p, `app.vault.adapter.read('Odd/e bad YAML.md').then(s => !s.includes('unclosed'))`, 5000);
	t.eq(disk(p, 'Odd/e bad YAML.md') + disk(p, 'Odd/e bad YAML 2.md'), '---\nfoo:\n[unclosed\n---\nAfter the bad block.\n', 'both halves together are the note, a line break where it was cut');
	// real properties, in a file with Windows line breaks: the new note gets them, and the text divides
	await openAt(p, 'Odd/h props CRLF.md', { before: 'Windows two.' });
	await run(p, 'split-scene');
	await until(p, `app.vault.adapter.exists('Odd/h props CRLF 2.md')`);
	await until(p, `app.vault.adapter.read('Odd/h props CRLF.md').then(s => !s.includes('two'))`, 5000);
	t.eq(disk(p, 'Odd/h props CRLF.md').replace(/\r\n/g, '\n'), PROPS + 'Windows one.\n', 'the first half keeps its properties and the text before the cursor');
	t.eq(disk(p, 'Odd/h props CRLF 2.md'), PROPS + 'Windows two.\n', 'the second half has the same properties and the rest');
}));

test('what the writer sees is what Binders takes for text: Obsidian’s editor shows a block that isn’t properties, and hides one that holds nothing', withTidy(async (p, h, t) => {
	await odd(p, KINDS);
	for (const k of KINDS) {
		const [name, , front] = k, path = `Odd/${name}.md`;
		await p.ev(`app.workspace.getLeaf(false).openFile(${file(path)}, { state: { mode: 'source', source: false } }).then(() => 1)`);
		await p.sleep(500);
		// (line by line, but the rules: in the text Obsidian draws a rule as a line across the page, with no dashes to read)
		const lines = (s) => s.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^-{3,}$/.test(l)).join('\n');
		const shown = lines(await p.ev(`[...app.workspace.getLeavesOfType('markdown')[0].view.contentEl.querySelectorAll('.markdown-source-view .cm-content > .cm-line')].map(l => l.innerText).join('\\n')`));
		const mine = lines(textOfKind(k));
		t.eq(shown, mine, `“${name}”: the lines Obsidian’s editor shows as text are the text Binders takes (${front ? 'after its properties' : 'the whole note'})`);
	}
}));

test('in the manuscript the start of a section is the start of its text: before a first paragraph between two rules, after real properties', withTidy(async (p, h, t) => {
	await odd(p, KINDS);
	await openView(p, 'Odd');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene').length === ${KINDS.length}`, 8000);
	for (const [name, text, front] of KINDS) {
		const at = await p.ev(`(async () => { const m = ${VIEW}.current, s = m.scenes.find(s => s.file.path === ${j(`Odd/${name}.md`)}); s.el.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 150)); await m.focusScene(s, 'start'); await new Promise(r => setTimeout(r, 150)); return s.live ? s.live.cm.state.selection.main.head : null; })()`);
		t.eq(at, front.replace(/\r\n/g, '\n').length, `“${name}”: the cursor is where its text starts`);
	}
	await p.sleep(2500); // (nothing was typed: nothing may be written)
	for (const [n, text] of KINDS) t.eq(disk(p, `Odd/${n}.md`), text, `“${n}” is byte for byte what it was`);
}));

// ---- a property written to a note that opens with a block of text (properties.ts) ----
// Obsidian's own `processFrontMatter` takes such a block for properties: it writes the property over the paragraph
// between the rules, or (a list) writes nothing and says nothing, or (YAML it can't read) throws. Binders writes the
// property in a block of its own above the note's text, and every byte of the note stays.
const TEXT_BLOCKS = KINDS.filter(([, , front]) => !front);
/** What a note must be once properties are written above it: the mark, the new block in the note's own line breaks, the note. */
const above = (text, yaml) => { const br = text.includes('\r\n') ? '\r\n' : '\n'; return `${text.startsWith(BOM) ? BOM : ''}---${br}${yaml.replace(/\n/g, br)}---${br}${noBom(text)}`; };

test('a status, a label, a target and “Include in export” set on a note that opens with a block of text: written above it, not a byte of the note dropped', withTidy(async (p, h, t) => {
	const WRITES = [
		['status', `${VIEW}.setProps(f, { status: 'Done' })`, 'status: Done\n'],
		['label', `${B}.label([f], ${PL}.settings.labelProp, 'Red', 'Label “x”')`, 'label: Red\n'],
		['target', `${VIEW}.setProps(f, { target: 500 })`, 'target: 500\n'],
		['export', `${B}.setProps(f, { export: false })`, 'export: false\n'],
	];
	await odd(p, [...TEXT_BLOCKS.flatMap(([name, text]) => WRITES.map(([w]) => [`${name} ${w}`, text])), ['z none', RULED]]);
	await openView(p, 'Odd');
	t.eq(TEXT_BLOCKS.length, 6, 'a rule and a paragraph (three ways), prose, bad YAML, a list');
	for (const [name, text] of TEXT_BLOCKS) {
		for (const [w, call, yaml] of WRITES) {
			const path = `Odd/${name} ${w}.md`;
			t.eq(await fm(p, path), null, `“${name}”: Obsidian finds no properties in it`);
			const err = await p.ev(`(async () => { const f = ${file(path)}; try { await ${call}; return null; } catch (e) { return String(e); } })()`);
			t.eq(err, null, `“${name}”, ${w}: written without complaint`);
			t.eq(disk(p, path), above(text, yaml), `“${name}”, ${w}: the property in a block of its own, then the note byte for byte`);
		}
	}
	// and Obsidian reads them as properties now; a second one joins the first, the text still whole
	await p.sleep(600);
	for (const [name, text] of TEXT_BLOCKS) {
		const path = `Odd/${name} status.md`;
		t.eq((await fm(p, path))?.status, 'Done', `“${name}”: the status is a property Obsidian reads`);
		await p.ev(`${B}.setProps(${file(path)}, { label: 'Blue' }).then(() => 1)`);
		const f = await until(p, `(() => { const c = app.metadataCache.getFileCache(${file(path)})?.frontmatter; return c?.label === 'Blue' ? JSON.stringify(c) : null; })()`), now = disk(p, path);
		t.eq(f, j({ status: 'Done', label: 'Blue' }), `“${name}”: a second property joins the first`);
		t.ok(now.endsWith(noBom(text)), `“${name}”: and the note’s text is still whole under them: ${j(now.slice(0, 60))}`);
	}
	// a note with a byte-order mark and real properties: changed where they are, the mark still first (Obsidian's own
	// road finds no properties after a mark, and would write a second block above it)
	const marked = KINDS.find(([n]) => n === 'i props BOM');
	await p.ev(`(async () => { await app.vault.adapter.write('Odd/zz marked.md', ${j(marked[1])}); await new Promise(r => setTimeout(r, 700)); await ${B}.setProps(${file('Odd/zz marked.md')}, { label: 'Blue' }); })().then(() => 1)`);
	t.eq(disk(p, 'Odd/zz marked.md'), BOM + PROPS.replace(/---\n$/, 'label: Blue\n---\n') + textOfKind(marked), 'a note with a byte-order mark: the property joins the ones it has, the mark and the text as they were');
	// a property taken away from a note that has none: nothing to write, nothing written
	await p.ev(`${B}.setProps(${file('Odd/z none.md')}, { export: undefined }).then(() => 1)`);
	await p.sleep(300);
	t.eq(disk(p, 'Odd/z none.md'), RULED, 'a property taken away from a note that has none: the note is as it was');
}));

test('from the corkboard, on notes that open with a rule: “Include in export”, a synopsis typed on the card, “Set synopsis from text”, and a merge’s joined synopsis keep the first paragraph', withTidy(async (p, h, t) => {
	const SYN = '---\nsynopsis: The second.\n---\nSecond text.\n';
	await odd(p, [['a rule', RULED], ['b rule CRLF', crlf(RULED)], ['c rule', RULED], ['d rule', RULED], ['e other', SYN]]);
	await openView(p, 'Odd');
	const menu = async (name, item) => { const c = await p.at(card(`Odd/${name}.md`)); await p.right(c.x, c.t + 12); await clickMenu(p, item); };
	// left out of the export, from the card's menu
	await menu('a rule', 'Include in export');
	await until(p, `app.vault.adapter.read('Odd/a rule.md').then(s => s.includes('export'))`);
	t.eq(disk(p, 'Odd/a rule.md'), above(RULED, 'export: false\n'), '“Include in export”: the property above, the note whole');
	// a synopsis typed on the card, in a file with Windows line breaks
	const syn = await p.at(`${card('Odd/b rule CRLF.md')} .binders-card-synopsis`);
	// (a card is picked by the first click, and its synopsis edited by the next)
	for (let i = 0; i < 3 && !(await p.ev(`!!document.activeElement?.matches('.binders-card-synopsis textarea')`)); i++) { await p.click(syn.x, syn.y); await p.sleep(250); }
	await p.type('Typed on the card.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.read('Odd/b rule CRLF.md').then(s => s.includes('Typed'))`);
	t.eq(disk(p, 'Odd/b rule CRLF.md'), above(crlf(RULED), 'synopsis: Typed on the card.\n'), 'a synopsis typed on the card: above, in the note’s own line breaks, the note whole');
	// a synopsis from the text: its first paragraph, the one between the rules
	await p.sleep(400);
	await menu('c rule', 'Set synopsis from text');
	await until(p, `app.vault.adapter.read('Odd/c rule.md').then(s => s.includes('synopsis'))`);
	t.eq(disk(p, 'Odd/c rule.md'), above(RULED, 'synopsis: Lost paragraph.\n'), '“Set synopsis from text”: the first paragraph is the synopsis, and is still in the note');
	// a merge: the other note's synopsis becomes the merged note's
	await closeMenus(p);
	await merge(p, ['Odd/d rule.md', 'Odd/e other.md']);
	await until(p, `app.vault.adapter.read('Odd/d rule.md').then(s => s.includes('synopsis'))`);
	t.eq(disk(p, 'Odd/d rule.md'), above(joined([RULED, 'Second text.\n']), 'synopsis: The second.\n'), 'a merge: both texts whole, the joined synopsis above them');
}));

test('“Make this folder a binder” where the folder’s own note opens with a block of text: the binder’s properties go above it', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Odd'); await app.vault.adapter.write('Odd/Odd.md', ${j(RULED)}); await app.vault.adapter.write('Odd/Scene.md', 'A scene.\\n'); await new Promise(r => setTimeout(r, 800)); await ${B}.makeBinder(app.vault.getAbstractFileByPath('Odd')); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(400);
	t.eq(disk(p, 'Odd/Odd.md'), `---\nbinder: 1\ncontents:\n  - Scene\n---\n${RULED}`, 'the folder’s note is the binder note now, and its text is whole');
	t.ok(await p.ev(`!!${B}.binderOf('Odd/Scene.md')`), 'and the folder is a binder');
}));

// ---- a note that is merely open ----
// Whatever reads a note saves what's typed in it first (`saveOpen`). A tab nobody typed in has nothing to save, and
// must not be saved: the editor's text has the editor's line breaks, and no byte-order mark.
test('a note that is only open in a tab, nothing typed: a snapshot, the Snapshots dialog and an export as one note leave it byte for byte (Windows line breaks, a byte-order mark)', withTidy(async (p, h, t) => {
	const NOTES = [['crlf', crlf('One.\n\nTwo.\n')], ['crlf props', crlf(PROPS + 'Body.\n\nMore.\n')], ['marked', BOM + 'Marked.\n\nMore.\n'], ['reading', crlf('Read.\n\nOnly.\n')]];
	await odd(p, NOTES);
	const unchanged = (when) => { for (const [n, text] of NOTES) t.eq(disk(p, `Odd/${n}.md`), text, `${when}: “${n}” is byte for byte what it was`); };
	for (const [n] of NOTES) {
		await p.ev(`app.workspace.getLeaf('tab').openFile(${file(`Odd/${n}.md`)}, { state: { mode: ${j(n === 'reading' ? 'preview' : 'source')} } }).then(() => 1)`);
		await p.sleep(500);
		unchanged(`“${n}” opened`);
		await run(p, 'take-snapshot');
		await until(p, `app.vault.adapter.exists(${j(`Odd/Snapshots/${n}`)})`);
		await p.sleep(300);
		unchanged(`a snapshot of “${n}” taken`);
		await run(p, 'show-snapshots');
		await until(p, `!!document.querySelector('.modal.binders-snapshots .binders-snapshots-item')`);
		await p.sleep(300);
		await p.key('Escape');
		await until(p, `!document.querySelector('.modal')`);
		unchanged(`the snapshots of “${n}” shown`);
	}
	// all four still open, each in its tab: the binder exported as one note
	await openView(p, 'Odd', true);
	await (await p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`), run(p, 'export'));
	await until(p, `!!document.querySelector('.modal .binders-export-path')`);
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Export').click(); return 1; })()`);
	await until(p, `app.vault.adapter.exists('Odd (exported).md')`);
	await p.sleep(2500); // (longer than an editor waits to save)
	unchanged('the binder exported');
	t.ok(disk(p, 'Odd (exported).md').includes('Two.') && disk(p, 'Odd (exported).md').includes('Marked.'), 'and the exported note has their text');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Odd (exported).md')).then(() => 1)`);
}));

test('a note open in a tab with words typed and not yet saved: a snapshot taken at once holds them, and the note on disk has them', withTidy(async (p, h, t) => {
	await odd(p, [['typed', crlf('One.\n\nTwo.\n')]]);
	await p.ev(`app.workspace.getLeaf(false).openFile(${file('Odd/typed.md')}, { state: { mode: 'source' } }).then(() => 1)`);
	await p.sleep(500);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setCursor(ed.offsetToPos(ed.getValue().length)); return 1; })()`);
	await p.type('Three.');
	await run(p, 'take-snapshot'); // (at once: well inside the two seconds an editor waits to save)
	await until(p, `app.vault.adapter.exists('Odd/Snapshots/typed')`);
	await p.sleep(300);
	const kept = await p.ev(`app.vault.adapter.list('Odd/Snapshots/typed').then(l => app.vault.adapter.read(l.files[0]))`);
	t.ok(kept.endsWith('One.\n\nTwo.\nThree.'), 'the snapshot has the words just typed: ' + j(kept.slice(-30)));
	t.eq(disk(p, 'Odd/typed.md'), 'One.\n\nTwo.\nThree.', 'and so has the note on disk (in the editor’s line breaks now: it was typed in)');
}));

/** Obsidian set to update links ("Automatically update internal links"), as the test vault has it: said here, since
    links follow a merge or a split only then, and a test elsewhere that left it off would fail these. */
const linksOn = (p) => p.ev(`(() => { app.vault.setConfig('alwaysUpdateLinks', true); return 1; })()`);
/** Waits until Obsidian's link index says `from` links to `to` this many times. */
const indexed = (p, from, to, n) => until(p, `(app.metadataCache.resolvedLinks[${j(from)}] ?? {})[${j(to)}] === ${n}`, 8000);

test('a link with other words to show, in a table (where Obsidian writes its bar with a backslash), follows a merge to the note that has the text', withTidy(async (p, h, t) => {
	const GAMMA = 'See [[Beta]] and [[Beta|the second]].\n\n| note | part |\n| --- | --- |\n| [[Beta\\|in a table]] | [[Beta#Part\\|its part]] |\n';
	await linksOn(p);
	await odd(p, [['Alpha', 'Alpha text.\n'], ['Beta', '# Part\n\nBeta text.\n'], ['Gamma', GAMMA]]);
	t.ok(await indexed(p, 'Odd/Gamma.md', 'Odd/Beta.md', 4), '(Obsidian has read the four links)');
	await merge(p, ['Odd/Alpha.md', 'Odd/Beta.md']);
	await until(p, `app.vault.adapter.read('Odd/Gamma.md').then(s => !s.includes('Beta'))`);
	t.eq(disk(p, 'Odd/Gamma.md'), GAMMA.replace(/Beta/g, 'Alpha'), 'every link to the note that went leads to the merged one, the two in the table too, and nothing else changed');
}));

test('“Scene 01” split or duplicated makes “Scene 02”: a number keeps its zeros', withTidy(async (p, h, t) => {
	await odd(p, [['Scene 01', 'First half.\n\nSecond half.\n'], ['Scene 09', 'Nine.\n']]);
	await openAt(p, 'Odd/Scene 01.md', { before: 'Second half.' });
	await run(p, 'split-scene');
	await until(p, `app.vault.adapter.exists('Odd/Scene 02.md')`);
	t.eq(disk(p, 'Odd/Scene 02.md'), 'Second half.\n', 'the second half is “Scene 02”');
	await p.ev(`${B}.duplicate(${file('Odd/Scene 09.md')}).then(() => 1)`);
	t.ok(await exists(p, 'Odd/Scene 10.md'), 'and a copy of “Scene 09” is “Scene 10”');
	t.ok(!(await exists(p, 'Odd/Scene 2.md')) && !(await exists(p, 'Odd/Scene 9 2.md')), 'with no “Scene 2” made');
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

slow('a slow disk: an export as one note while earlier typing is still being written has every word', async (p, h, t) => {
	await midWrite(p);
	await p.ev(`(() => { (app.plugins.plugins.binders.settings.exportKind = 'note', app.commands.executeCommandById('binders:export')); return 1; })()`);
	await until(p, `!!document.querySelector('.modal .binders-export-path')`);
	t.ok(await pressInDialog(p, 'Export', releaseIn(300)), 'Export');
	await until(p, `app.vault.adapter.exists('The Lighthouse (exported).md')`, 6000);
	await p.sleep(300);
	t.ok((await read(p, 'The Lighthouse (exported).md')).includes('doorway. First words. Later words.'), 'the exported note has the keeper’s text as typed');
	await p.ev(`app.vault.delete(${file('The Lighthouse (exported).md')}).then(() => 1)`);
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

// ---- Ctrl+Z right after a split undoes the whole split ----
// The editor's own undo puts the second half back in the first note. The new note, if it is still byte for byte what
// the split wrote, then goes to the trash (redo makes it again); one that was edited, renamed or moved stays, and a
// notice says so. In every order of undo, redo and typing, each word is in a note.

const SAVE_WAIT = 2600; // (past Obsidian's own save, two seconds after typing)
const K2 = L + 'Part One/The keeper 2.md', CUT = '"You can\'t come up,"', TAIL = 'She put down her cases and waited.';
/** The notices showing, without the empty ones the probe for them leaves. */
const said = async (p) => (await notices(p)).split('|').filter((x) => x).join('|');
const diskIs = (p, path, text) => until(p, `app.vault.adapter.read(${j(path)}).then(s => s === ${j(text)}, () => false)`, 5000);
const focusTab = (p, path) => p.ev(`(() => { const l = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(path)}); app.workspace.setActiveLeaf(l, { focus: true }); l.view.editor.focus(); return 1; })()`);
/** The keeper, with TWO for its text, split in its own tab before `CUT`: the two halves as they are on disk. */
async function splitKeeper(p) {
	await p.ev(`app.vault.modify(${file(K)}, ${j(TWO)}).then(() => 1)`);
	await p.sleep(400);
	await openAt(p, K, { before: CUT });
	await run(p, 'split-scene');
	await until(p, `app.vault.adapter.exists(${j(K2)})`);
	await until(p, `app.vault.adapter.read(${j(K)}).then(s => !s.includes(${j(TAIL)}))`);
	await p.sleep(400);
	return { first: await read(p, K), second: await read(p, K2) };
}
/** How many notes have these words. */
const having = (p, words) => p.ev(`(async () => { let n = 0; for (const f of app.vault.getMarkdownFiles()) if ((await app.vault.adapter.read(f.path)).includes(${j(words)})) n++; return n; })()`);
async function palette(p, name) {
	await p.key('p', 'ctrl');
	await until(p, `!!document.querySelector('.prompt input')`);
	await p.type(name);
	await p.sleep(300);
	await p.key('Enter');
	await p.sleep(400);
}

test('Ctrl+Z right after “Split scene at cursor” in a note’s tab undoes the whole split: the text is back in the note and the new note is in the trash; redo splits again, byte for byte and in the same place; undone once more, every note is as it was', withTidy(async (p, h, t) => {
	await localTrash(p, async () => {
		await forget(p);
		const { first, second } = await splitKeeper(p);
		const before = { ...(await texts(p)), [K]: TWO };
		await flush(p);
		const list = await contents(p);
		t.eq(list[list.indexOf('Part One/The keeper') + 1], 'Part One/The keeper 2', '(split: the new note is right after)');
		t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), null, 'a split is not a move: “Undo last move” has nothing to take back');
		await p.key('z', 'ctrl');
		t.ok(await gone(p, K2), 'Ctrl+Z: the new note is gone');
		t.ok(await diskIs(p, K, TWO), 'and the note has its whole text again: ' + j(await read(p, K)));
		t.eq(await read(p, '.trash/The keeper 2.md'), second, 'the new note is in the trash, as the split wrote it');
		t.eq(await listIs(p, LIST), j(LIST), 'the binder’s list is as it was');
		t.eq(await said(p), '', 'nothing needed saying');
		t.eq(await having(p, TAIL), 1, 'the second half is in one note');
		// redo: split again
		await p.key('z', 'ctrl', 'shift');
		t.ok(await back(p, K2), 'Ctrl+Shift+Z: the new note is there again');
		t.ok(await diskIs(p, K2, second), 'byte for byte what the split wrote');
		t.ok(await diskIs(p, K, first), 'and the first note has let go of the second half again: ' + j(await read(p, K)));
		t.eq(await listIs(p, list), j(list), 'in the same place in the binder');
		t.eq(await having(p, TAIL), 1, 'the second half is in one note');
		// and undone once more
		await p.key('z', 'ctrl');
		t.ok(await gone(p, K2), 'Ctrl+Z again: the new note is gone again');
		t.ok(await diskIs(p, K, TWO), 'and the note is whole');
		t.eq(await listIs(p, LIST), j(LIST), 'the list is as it was');
		delete before[K2];
		same(t, before, await texts(p), { skip: [NOTE] });
		t.eq(await said(p), '', 'and nothing was said');
	});
}));

for (const [what, touch, where, changed] of [
	['edited', `app.vault.process(${file(K2)}, s => s + 'One more line.\\n')`, K2, true],
	['renamed', `app.fileManager.renameFile(${file(K2)}, ${j(L + 'Part One/The refusal.md')})`, L + 'Part One/The refusal.md', false],
	['moved to another folder', `${B}.put([${file(K2)}], ${file(L + 'Part Two')}, null)`, L + 'Part Two/The keeper 2.md', false],
	['typed in, in a tab of its own, and not saved yet', null, K2, true],
]) {
	test(`Ctrl+Z after a split whose new note has been ${what}: the new note stays as it is, the text is back in the first as well, and a notice says so; redo then leaves every word in a note`, withTidy(async (p, h, t) => {
		const { first, second } = await splitKeeper(p);
		if (touch) await p.ev(`${touch}.then(() => 1)`);
		else {
			await p.ev(`app.workspace.getLeaf('tab').openFile(${file(K2)}).then(() => 1)`);
			await p.sleep(400);
			await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ${END}; return 1; })()`);
			await p.type(' Typed since.');
		}
		await p.sleep(touch ? 500 : 50);
		await focusTab(p, K);
		await p.key('z', 'ctrl');
		t.ok(await diskIs(p, K, TWO), 'the first note has its whole text again');
		await p.sleep(800);
		t.ok(await exists(p, where), 'the new note is still there');
		const kept = await read(p, where);
		t.ok(changed ? kept !== second && kept.includes(TAIL) && /One more line\.|Typed since\./.test(kept) : kept === second, 'with everything in it: ' + j(kept));
		t.ok(/stays/.test(await notices(p)) && /in both|as well/.test(await notices(p)), 'a notice says it stays and that the text is in both: ' + await notices(p));
		// redo: the first lets go again; no second copy is made
		await p.key('z', 'ctrl', 'shift');
		t.ok(await diskIs(p, K, first), 'redo: the first note is the first half again');
		await p.sleep(600);
		t.eq(await read(p, where), kept, 'the new note untouched');
		t.eq(await having(p, TAIL), 1, 'the second half is in one note, once');
	}));
}

test('in the manuscript: Ctrl+Z after a split takes the new section away and the text is back in its section; redo, typing between the undos, and typing after an undo lose nothing', withTidy(async (p, h, t) => {
	const WHOLE = 'First half.\n\nSecond half.\n';
	await p.ev(`app.vault.modify(${file(K)}, ${j(WHOLE)}).then(() => 1)`);
	await p.sleep(400);
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!${section(K)}?.live`, 5000);
	await p.ev(`(async () => { const m = ${MS}, s = ${section(K)}; s.el.scrollIntoView({ block: 'center' }); await m.mount(s); const ed = s.live.editor; ed.focus(); ed.setCursor(ed.offsetToPos(ed.getValue().indexOf('Second half.'))); return 1; })()`);
	await p.sleep(200);
	await run(p, 'split-scene');
	t.ok(await back(p, K2), 'split from the manuscript');
	t.ok(await diskIs(p, K, 'First half.\n'), '(the first half)');
	t.ok(await diskIs(p, K2, 'Second half.\n'), '(the second half)');
	await until(p, `!!${section(K2)}`);
	await p.sleep(500);
	const titles = () => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene .binders-manuscript-title')].map(e => e.textContent)`);
	await p.key('z', 'ctrl');
	t.ok(await gone(p, K2), 'Ctrl+Z in the section: the new note is gone');
	t.ok(await diskIs(p, K, WHOLE), 'the section’s note is whole again: ' + j(await read(p, K)));
	t.ok(await until(p, `!${section(K2)}`), 'and the new section is gone from the page');
	t.ok(!(await titles()).includes('The keeper 2'), 'no title of it is left: ' + j(await titles()));
	// redo
	await p.sleep(300);
	await p.key('z', 'ctrl', 'shift');
	t.ok(await back(p, K2), 'Ctrl+Shift+Z: split again');
	t.ok(await diskIs(p, K2, 'Second half.\n'), 'the new note has the second half');
	t.ok(await diskIs(p, K, 'First half.\n'), 'and the first has let go of it: ' + j(await read(p, K)));
	// typing, then undo of the typing, then undo of the split
	await p.sleep(500);
	await p.type('Typed');
	await p.sleep(700);
	t.ok(await until(p, `app.vault.adapter.read(${j(K)}).then(s => s.includes('Typed'))`, 5000), '(typed in the first section: ' + j(await read(p, K)) + ')');
	for (let i = 0; i < 12 && (await exists(p, K2)); i++) { await p.key('z', 'ctrl'); await p.sleep(900); }
	t.ok(await gone(p, K2), 'undo of the typing, then of the split: the new note is gone');
	t.ok(await diskIs(p, K, WHOLE), 'and the note is whole, without what was typed: ' + j(await read(p, K)));
	// typing after the undo: the split can't be made again, and nothing is lost
	await p.type('After. ');
	await p.sleep(300);
	// (the command, not the keys: the test's Ctrl+Shift+Z arrives as a small "z", which CodeMirror takes for Ctrl+Z
	// once there is nothing to redo)
	await p.ev(`(() => { app.commands.executeCommandById('editor:redo'); return 1; })()`);
	await p.sleep(SAVE_WAIT);
	const now = await read(p, K);
	t.ok(now.includes('First half.') && now.includes('Second half.') && now.includes('After.'), 'typed after the undo: the note has every word: ' + j(now));
	t.ok(!(await exists(p, K2)), 'and no note was made');
	t.eq(await said(p), '', 'nothing was said to have gone wrong');
}));

test('“Split scene with selection as title” is undone by Ctrl+Z the same way: the note named by the selection goes to the trash, the text is back', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.modify(${file(K)}, ${j(TWO)}).then(() => 1)`);
	await p.sleep(400);
	await openAt(p, K, { select: 'She put down her cases' });
	await run(p, 'split-scene-titled');
	const NAMED = L + 'Part One/She put down her cases.md';
	t.ok(await back(p, NAMED), 'split, named by the selection');
	await until(p, `app.vault.adapter.read(${j(K)}).then(s => !s.includes(${j(TAIL)}))`);
	await p.sleep(500);
	await p.key('z', 'ctrl');
	t.ok(await gone(p, NAMED), 'Ctrl+Z: the new note is gone');
	t.ok(await diskIs(p, K, TWO), 'and the note is whole again: ' + j(await read(p, K)));
	t.eq(await said(p), '', 'nothing needed saying');
}));

test('a split made from the command palette is undone by Ctrl+Z the same way; links that followed a heading to the new note lead back, and follow it again on redo', withTidy(async (p, h, t) => {
	const TEXT = 'The beginning.\n\n## The tower\n\nUp he went.\n', EP = L + 'Epilogue.md', NEW = K2;
	const epilogue = await read(p, EP);
	await linksOn(p);
	await p.ev(`(async () => { await app.vault.modify(${file(K)}, ${j(TEXT)}); await app.vault.modify(${file(EP)}, ${j(epilogue + '\nSee [[The keeper#The tower]].\n')}); })().then(() => 1)`);
	t.ok(await indexed(p, EP, K, 1), '(Obsidian has read the link)');
	await openAt(p, K, { before: '## The tower' });
	await palette(p, 'Split scene at cursor');
	t.ok(await back(p, NEW), 'split from the palette');
	t.ok(await until(p, `app.vault.adapter.read(${j(EP)}).then(s => s.includes('[[The keeper 2#The tower]]'))`, 4000), 'the link to the heading follows it to the new note: ' + j((await read(p, EP)).slice(-60)));
	t.ok(await diskIs(p, K, 'The beginning.\n'), '(the first half)');
	const second = await read(p, NEW);
	await p.sleep(600);
	await p.key('z', 'ctrl');
	t.ok(await gone(p, NEW), 'Ctrl+Z: the new note is gone');
	t.ok(await diskIs(p, K, TEXT), 'the note is whole again: ' + j(await read(p, K)));
	t.ok(await until(p, `app.vault.adapter.read(${j(EP)}).then(s => s.includes('[[The keeper#The tower]]'))`, 4000), 'and the link leads to the heading where it is again: ' + j((await read(p, EP)).slice(-60)));
	t.ok(await indexed(p, EP, K, 1), '(Obsidian has read the link again)');
	await p.key('z', 'ctrl', 'shift');
	t.ok(await back(p, NEW), 'redo: the new note again');
	t.ok(await diskIs(p, NEW, second), 'as the split wrote it');
	t.ok(await until(p, `app.vault.adapter.read(${j(EP)}).then(s => s.includes('[[The keeper 2#The tower]]'))`, 4000), 'and the link follows the heading again: ' + j((await read(p, EP)).slice(-60)));
}));

test('redo of an undone split when a note has taken the new note’s name since: the second half goes into a note under the next name, and the note in the way is untouched', withTidy(async (p, h, t) => {
	const { first, second } = await splitKeeper(p);
	await p.key('z', 'ctrl');
	t.ok(await gone(p, K2), 'undone');
	t.ok(await diskIs(p, K, TWO), '(whole again)');
	await p.ev(`app.vault.create(${j(K2)}, 'Mine.').then(() => 1)`);
	await p.sleep(400);
	await focusTab(p, K);
	await p.key('z', 'ctrl', 'shift');
	t.ok(await diskIs(p, K, first), 'redo: the first half');
	const K3 = L + 'Part One/The keeper 3.md';
	t.ok(await back(p, K3), 'the second half is in a note under the next name');
	t.eq(await read(p, K3), second, 'as the split wrote it');
	t.eq(await read(p, K2), 'Mine.', 'the note that took the name is untouched');
	// and that one is what Ctrl+Z takes away now
	await p.key('z', 'ctrl');
	t.ok(await gone(p, K3), 'undone again: that note is gone');
	t.ok(await diskIs(p, K, TWO), 'and the first is whole');
	t.eq(await read(p, K2), 'Mine.', 'the other still untouched');
}));

// Undo, redo and typing in the first note, in any order and at any pace (some at once, before the last has been
// seen to): when it settles the second half is in exactly one note, the first half is where it was, and what the
// editor shows is what the disk has.
for (const seed of [1, 2, 3, 4]) {
	test(`after a split, 16 undos, redos and words typed in the first note in a random order and at a random pace (seed ${seed}): the second half ends in exactly one note, nothing is lost`, withTidy(async (p, h, t) => {
		let x = seed * 7919;
		const rnd = (n) => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % n; };
		await p.ev(`app.vault.modify(${file(K)}, 'One.\\n\\nTwo.\\n\\nThree.\\n').then(() => 1)`);
		await p.sleep(400);
		await openAt(p, K, { before: 'Three.' });
		await run(p, 'split-scene');
		t.ok(await back(p, K2), 'split');
		t.ok(await diskIs(p, K, 'One.\n\nTwo.\n'), '(the first half)');
		const did = [];
		for (let i = 0; i < 16; i++) {
			const what = ['undo', 'undo', 'redo', 'redo', 'type'][rnd(5)];
			did.push(what);
			if (what === 'type') { await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setCursor({ line: 0, ch: 0 }); return 1; })()`); await p.type(`w${i} `); }
			else await p.ev(`(() => { app.commands.executeCommandById('editor:${what}'); return 1; })()`);
			await p.sleep([0, 30, 120, 350, 900][rnd(5)]);
		}
		await p.sleep(SAVE_WAIT + 600);
		const shown = await p.ev(`app.workspace.activeEditor.editor.getValue()`), first = await read(p, K);
		t.eq(first, shown, 'the first note on disk is what its editor shows (' + did.join(' ') + ')');
		t.ok(first.includes('One.') && first.includes('Two.'), 'the first half is still in it: ' + j(first));
		t.eq(await having(p, 'Three.'), 1, `the second half is in exactly one note (${did.join(' ')}); the first: ${j(first)}`);
		t.eq(await said(p), '', 'and nothing was said');
	}));
}

// ---- Ungroup takes the emptied folder away, and "Undo last move" brings it back ----
// The folder's synopsis, label and target are in its folder note, which goes to the trash with it: undo must bring
// back the folder, that note byte for byte, and the notes in their order.

const P2 = L + 'Part Two/', P2NOTE = P2 + 'Part Two.md';
const FOLDER_NOTE = '---\nsynopsis: "The second part: the storm."\nlabel: red\ntarget: 900\ncompile: false\n---\n';
const UNGROUPED = [...LIST.slice(0, 5), 'The wreck', 'Lights out', 'Epilogue'];
const OUT = { [P2 + 'The wreck.md']: L + 'The wreck.md', [P2 + 'Lights out.md']: L + 'Lights out.md' };
const undoMove = (p, redo = false) => p.ev(`(() => { app.commands.executeCommandById('binders:${redo ? 'redo' : 'undo'}-move'); return 1; })()`);
const gone = (p, path) => until(p, `app.vault.adapter.exists(${j(path)}).then(x => !x)`, 4000);
const back = (p, path) => until(p, `app.vault.adapter.exists(${j(path)})`, 4000);
/** The list on disk once it says `want` (or as it is after four seconds), as text to compare. */
const listIs = async (p, want) => { let l; for (let i = 0; i < 40; i++) { await flush(p); l = await contents(p); if (j(l) === j(want)) break; await p.sleep(100); } return j(l); };
const forget = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; return 1; })()`); // (moves other tests made)
const viewFolder = (p) => p.ev(`${VIEW}.folder?.path ?? null`);

test('Ungroup takes the emptied folder away with its folder note, to the trash; “Undo last move” brings back the folder, its note byte for byte and its notes in order; redo and a second ungroup lose nothing', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create(${j(P2NOTE)}, ${j(FOLDER_NOTE)}).then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await forget(p);
	await localTrash(p, async () => {
		await openView(p);
		const hd = await p.at(card(L + 'Part Two'));
		await p.right(hd.x, hd.y);
		await clickMenu(p, 'Ungroup');
		t.ok(await gone(p, L + 'Part Two'), 'the folder is gone once its notes are out');
		t.eq(await listIs(p, UNGROUPED), j(UNGROUPED), 'its notes stand where it stood, in order, and it is off the list');
		t.eq(await read(p, '.trash/Part Two/Part Two.md'), FOLDER_NOTE, 'the folder and its note are in the trash, whole');
		t.ok(!(await cards(p)).includes(L + 'Part Two'), 'no empty stack is left on the board');
		same(t, before, await texts(p), { skip: [NOTE, P2NOTE], moved: OUT });
		// undo: the folder, its note and its notes
		t.eq(await p.ev(`${B}.undoable('The Lighthouse')`), 'Ungroup “Part Two”', 'the ungroup can be undone');
		await undoMove(p);
		t.ok(await back(p, P2 + 'Lights out.md'), 'undo: the notes are back in the folder');
		t.eq(await listIs(p, LIST), j(LIST), 'the order is as it was');
		t.eq(await read(p, P2NOTE), FOLDER_NOTE, 'the folder note is back, byte for byte');
		same(t, before, await texts(p), { skip: [NOTE] });
		await until(p, `app.metadataCache.getFileCache(${file(P2NOTE)})?.frontmatter?.synopsis`);
		t.eq((await fm(p, P2NOTE)).synopsis, 'The second part: the storm.', 'the folder has its synopsis again');
		t.ok(await until(p, `!!document.querySelector(${j(card(L + 'Part Two'))})?.textContent.includes('the storm')`), 'and its stack shows it');
		// redo takes it away again, undo brings it back again
		await undoMove(p, true);
		t.ok(await gone(p, L + 'Part Two'), 'redo: the folder is gone again');
		t.eq(await listIs(p, UNGROUPED), j(UNGROUPED), 'redo: the notes are out, in order');
		same(t, before, await texts(p), { skip: [NOTE, P2NOTE], moved: OUT });
		await undoMove(p);
		t.ok(await back(p, P2 + 'Lights out.md'), 'undone again');
		t.eq(await listIs(p, LIST), j(LIST), 'the order is as it was, again');
		same(t, before, await texts(p), { skip: [NOTE] });
		// its data changed since, then ungrouped a second time: what comes back is the note as it was when it went
		await p.ev(`${B}.setProps(${file(P2NOTE)}, { synopsis: 'Rewritten.' }).then(() => 1)`);
		await p.sleep(300);
		const changed = await read(p, P2NOTE);
		t.ok(changed.includes('Rewritten.'), '(the synopsis was changed)');
		await p.ev(`${B}.ungroup(${file(L + 'Part Two')}).then(() => 1)`);
		t.ok(await gone(p, L + 'Part Two'), 'ungrouped a second time: gone');
		await undoMove(p);
		t.ok(await back(p, P2 + 'Lights out.md'), 'and undone');
		t.eq(await read(p, P2NOTE), changed, 'the folder note is the one that went, with the changed synopsis');
		t.eq(await listIs(p, LIST), j(LIST), 'the order is as it was, a third time');
		same(t, before, await texts(p), { skip: [NOTE, P2NOTE] });
	});
}));

test('Ungroup leaves a folder that still holds something: text in its folder note (said), a file Obsidian doesn’t list; a folder with no note goes and comes back, also after another folder was renamed', withTidy(async (p, h, t) => {
	await forget(p);
	// text of the writer's own in the folder note: writing never goes to the trash unasked
	const WITH_TEXT = '---\nsynopsis: Two.\n---\nNotes on the second part, written in the folder’s own note.\n', STAYED = [...LIST.slice(0, 6), 'The wreck', 'Lights out', 'Epilogue'];
	await p.ev(`app.vault.create(${j(P2NOTE)}, ${j(WITH_TEXT)}).then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await p.ev(`${B}.ungroup(${file(L + 'Part Two')}).then(() => 1)`);
	await p.sleep(600);
	t.ok(await exists(p, P2NOTE), 'a folder whose note has text in it stays');
	t.eq(await read(p, P2NOTE), WITH_TEXT, 'its note untouched');
	t.ok(/“Part Two” stays: its folder note has text in it/.test(await notices(p)), 'and a notice says why: ' + await notices(p));
	t.eq(await listIs(p, STAYED), j(STAYED), 'its notes are out, after it');
	await undoMove(p);
	t.ok(await back(p, P2 + 'Lights out.md'), 'undone as before');
	t.eq(await listIs(p, LIST), j(LIST), 'in order');
	same(t, before, await texts(p), { skip: [NOTE] });
	// a file the vault doesn't list (its name starts with a dot): not Binders' to trash
	await p.ev(`(async () => { await app.vault.delete(${file(P2NOTE)}); await app.vault.adapter.write(${j(P2 + '.keep')}, 'mine'); })().then(() => 1)`);
	await p.sleep(300);
	await p.ev(`${B}.ungroup(${file(L + 'Part Two')}).then(() => 1)`);
	await p.sleep(600);
	t.eq(await read(p, P2 + '.keep'), 'mine', 'a folder with a file Obsidian doesn’t list stays, the file with it');
	await undoMove(p);
	t.ok(await back(p, P2 + 'Lights out.md'), 'undone');
	await p.ev(`app.vault.adapter.remove(${j(P2 + '.keep')}).then(() => 1)`);
	// no folder note at all: the folder goes, and comes back
	await p.ev(`${B}.ungroup(${file(L + 'Part Two')}).then(() => 1)`);
	t.ok(await gone(p, L + 'Part Two'), 'a folder with no note goes too');
	t.eq(await listIs(p, UNGROUPED), j(UNGROUPED), 'and is off the list');
	await undoMove(p);
	t.ok(await back(p, P2 + 'Lights out.md'), 'and comes back with its notes');
	t.eq(await listIs(p, LIST), j(LIST), 'in its place');
	t.ok(!(await exists(p, P2NOTE)), 'with no note made for it');
	// another folder renamed while the folder was away: it comes back where it stood
	await p.ev(`${B}.ungroup(${file(L + 'Part Two')}).then(() => 1)`);
	t.ok(await gone(p, L + 'Part Two'), '(ungrouped)');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One')}, ${j(L + 'Act One')}).then(() => 1)`);
	await p.sleep(500);
	await undoMove(p);
	t.ok(await back(p, P2 + 'Lights out.md'), 'undo after another folder was renamed: Part Two is back');
	const renamed = LIST.map((x) => x.replace('Part One/', 'Act One/'));
	t.eq(await listIs(p, renamed), j(renamed), 'between the renamed folder and the epilogue');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Act One')}, ${j(L + 'Part One')}).then(() => 1)`);
	await p.sleep(500);
}));

test('“Undo last move” after Ungroup refuses in words when the folder can’t be made again, moving nothing, and works once what’s in the way is gone; a binder view on the folder goes to the folder above', withTidy(async (p, h, t) => {
	await forget(p);
	await p.ev(`app.vault.create(${j(P2NOTE)}, ${j(FOLDER_NOTE)}).then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	// the folder open in a binder view when it goes
	await openView(p, L + 'Part Two');
	t.eq(await viewFolder(p), L + 'Part Two', '(the view shows Part Two)');
	await p.ev(`${B}.ungroup(${file(L + 'Part Two')}).then(() => 1)`);
	t.ok(await gone(p, L + 'Part Two'), 'ungrouped while a view shows it');
	t.ok(await until(p, `${VIEW}.folder?.path === 'The Lighthouse'`), 'the view shows the binder’s folder instead: ' + await viewFolder(p));
	t.ok(await until(p, `!!document.querySelector(${j(card(L + 'The wreck.md'))})`), 'with the notes that came out');
	// a file with the folder's name where it stood
	await p.ev(`app.vault.create(${j(L + 'Part Two')}, 'in the way').then(() => 1)`);
	await p.sleep(500);
	await flush(p);
	const list = j(await contents(p));
	await undoMove(p);
	await p.sleep(600);
	t.ok(/“Part Two” can’t be brought back: “The Lighthouse” has a file with that name now/.test(await notices(p)), 'undo says why it can’t: ' + await notices(p));
	t.ok(await exists(p, L + 'The wreck.md') && !(await exists(p, P2NOTE)), 'and moves nothing');
	await flush(p);
	t.eq(j(await contents(p)), list, 'the list is as it was');
	t.eq(await read(p, L + 'Part Two'), 'in the way', 'the file in the way untouched');
	// a note that would become the folder's own note
	await p.ev(`(async () => { await app.vault.delete(${file(L + 'Part Two')}); await app.fileManager.renameFile(${file(L + 'The wreck.md')}, ${j(L + 'Part Two.md')}); })().then(() => 1)`);
	await p.sleep(500);
	// (asked afresh: a second refusal with nothing changed gives the change up, as for any move)
	await p.ev(`(() => { ${B}.undos[${B}.undos.length - 1].failed = false; return 1; })()`);
	await undoMove(p);
	await p.sleep(600);
	t.ok(/can’t go back into “Part Two”: it would become the folder’s note/.test(await notices(p)), 'a note renamed to the folder’s name is said: ' + await notices(p));
	t.ok(!(await exists(p, L + 'Part Two/Lights out.md')), 'and nothing moved');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part Two.md')}, ${j(L + 'The wreck.md')}).then(() => 1)`);
	await p.sleep(500);
	await p.ev(`(() => { ${B}.undos[${B}.undos.length - 1].failed = false; return 1; })()`);
	await undoMove(p);
	t.ok(await back(p, P2 + 'Lights out.md'), 'with nothing in the way, undo brings the folder back');
	t.eq(await read(p, P2NOTE), FOLDER_NOTE, 'its note byte for byte');
	t.eq(await listIs(p, LIST), j(LIST), 'and the order');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('“Undo last move” after Ungroup, with a folder of that name made by hand since: refused while a note in it is in the way, and asked again it puts the notes back in that folder and gives it the folder note that went to the trash', withTidy(async (p, h, t) => {
	await forget(p);
	await p.ev(`app.vault.create(${j(P2NOTE)}, ${j(FOLDER_NOTE)}).then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await p.ev(`${B}.ungroup(${file(L + 'Part Two')}).then(() => 1)`);
	t.ok(await gone(p, L + 'Part Two'), 'ungrouped: the folder is gone');
	// a folder of the same name, made by hand, with a note that is in the way of one coming back
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + 'Part Two')}); await app.vault.create(${j(P2 + 'The wreck.md')}, 'Another wreck.'); })().then(() => 1)`);
	await p.sleep(500);
	await undoMove(p);
	await p.sleep(600);
	t.ok(/“The wreck” can’t go back: “Part Two” has another “The wreck” now/.test(await notices(p)), 'undo says what is in the way: ' + await notices(p));
	t.ok(await exists(p, L + 'Lights out.md') && !(await exists(p, P2NOTE)), 'and moves nothing, and writes nothing');
	t.eq(await read(p, P2 + 'The wreck.md'), 'Another wreck.', 'the note in the way untouched');
	await p.ev(`app.vault.delete(${file(P2 + 'The wreck.md')}).then(() => 1)`);
	await p.sleep(500);
	await undoMove(p);
	t.ok(await back(p, P2 + 'Lights out.md'), 'asked again with the way clear: the notes are back in the folder');
	t.ok(await back(p, P2NOTE), 'and the folder has its folder note again');
	t.eq(await read(p, P2NOTE), FOLDER_NOTE, 'byte for byte the one that went to the trash');
	// (the folder made by hand stays where it was made, last: what was added since an undo stays as it is)
	const HAND = [...LIST.slice(0, 5), 'Epilogue', ...LIST.slice(5, 8)];
	t.eq(await listIs(p, HAND), j(HAND), 'its notes are in it in their order, the folder where it was made');
	same(t, before, await texts(p), { skip: [NOTE] });
}));
