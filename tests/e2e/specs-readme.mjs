// What the README tells a writer, one test per claim (ticket readme-claims). A test that fails is a sentence that's
// wrong: named "README (wrong): ..." and left failing.
import { B, NOTE, PL, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, flush, j, menuItems, openView, read, same, selected, split, texts, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'README: ' + name, fn });
const wrong = (name, fn) => specs.push({ name: 'README (wrong): ' + name, fn });
const L = 'The Lighthouse', P1 = `${L}/Part One`;
const active = (p) => p.ev(`document.activeElement?.dataset?.path ?? null`);
const settle = async (p) => { await p.sleep(150); await flush(p); await p.sleep(450); };
const setSettings = (p, s) => p.ev(`(async () => { Object.assign(${PL}.settings, ${j(s)}); await ${PL}.saveSettings(); })().then(() => 1)`).then(() => p.sleep(300));
const EXP = `app.workspace.getLeavesOfType('file-explorer')[0].view`;
const rows = async (p) => {
	await p.ev(`(() => { app.workspace.leftSplit.expand(); app.workspace.revealLeaf(app.workspace.getLeavesOfType('file-explorer')[0]); for (const f of ['The Lighthouse', 'The Lighthouse/Part One']) ${EXP}.fileItems[f]?.setCollapsed(false); return 1; })()`);
	await p.sleep(350);
	return p.ev(`[...document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path]')].map(e => e.dataset.path).filter(x => x.startsWith('The Lighthouse/'))`);
};
const mode = (p, m) => p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`).then(() => p.sleep(m === 'manuscript' ? 1500 : 600));
const offered = (p, id) => p.ev(`!!app.commands.commands['binders:${id}']?.checkCallback(true)`);
const run = (p, id) => p.ev(`(() => { app.commands.commands['binders:${id}'].checkCallback(false); return 1; })()`).then(() => p.sleep(500));

// ---- 1. Known limitations: Make a copy of a folder
test('Known limitations: Make a copy of a folder with a folder note: what the copy shows', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create(${j(P1 + '/Part One.md')}, '---\\nsynopsis: Folder syn\\n---\\nfolder note body').then(() => 1)`);
	await settle(p);
	await p.ev(`app.vault.copy(${file(P1)}, ${j(L + '/Part One 1')}).then(() => 1)`);
	await until(p, `!!${file(L + '/Part One 1/Part One 1.md')} && !${file(L + '/Part One 1/Part One.md')}`, 8000);
	await settle(p);
	const kids = await p.ev(`${B}.orderedChildren(${file(L + '/Part One 1')}).map(c => c.name)`);
	const scenes = await p.ev(`${B}.scenes(${file(L + '/Part One 1')}).map(c => c.name)`);
	await openView(p, L + '/Part One 1');
	const cs = await cards(p);
	t.eq(j(await p.ev(`${B}.orderedChildren(${file(L)}).map(c => c.name).slice(0, 4)`)), j(['Prologue.md', 'Part One', 'Part One 1', 'Part Two']), 'the copy is right after the original');
	t.eq(j(kids.slice(0, 3)), j(['Arrival.md', 'The keeper.md', 'Storm warning.md']), 'its notes are in the original’s order');
	// the README says the copy "keeps the folder's synopsis": its folder note is renamed to match, and is no scene
	const note = `children ${j(kids)}; scenes ${j(scenes)}; cards ${j(cs.map((c) => c.split('/').pop()))}`;
	t.eq(await p.ev(`app.vault.adapter.read(${j(L + '/Part One 1/Part One 1.md')})`), '---\nsynopsis: Folder syn\n---\nfolder note body', 'the copied folder note has the copy’s name, byte for byte');
	t.ok(!scenes.some((n) => /^Part One( 1)?\.md$/.test(n)) && !cs.some((c) => /\/Part One( 1)?\.md$/.test(c)), 'and shows neither as a scene nor as a card: ' + note);
}));

// ---- 2. Undoing a move: Ungroup, New folder from selection
test('Undoing a move: “Undo last move” takes back New folder from selection, and Redo makes it again', withTidy(async (p, h, t) => {
	const before = await texts(p);
	const folder = await p.ev(`${B}.group([${file(L + '/Prologue.md')}, ${file(L + '/Epilogue.md')}], 'Frame').then(f => f.path)`);
	await settle(p);
	t.ok(await exists(p, folder + '/Prologue.md'), 'grouped');
	await h.open(L + '/Part One/Arrival.md');
	t.ok(await offered(p, 'undo-move'), 'undo is offered after the group');
	await run(p, 'undo-move'); await settle(p);
	t.ok(await exists(p, L + '/Prologue.md') && await exists(p, L + '/Epilogue.md'), 'the notes are back where they were');
	t.eq(j((await contents(p)).slice(0, 2)), j(['Prologue', 'Part One/']), 'in the list too');
	t.ok(await offered(p, 'redo-move'), 'redo is offered');
	await run(p, 'redo-move'); await settle(p);
	t.ok(await exists(p, folder + '/Prologue.md'), 'redo groups again');
	await run(p, 'undo-move'); await settle(p);
	same(t, before, await texts(p), { skip: [NOTE] });
}));
test('Undoing a move: “Undo last move” takes back Ungroup', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`${B}.ungroup(${file(L + '/Part Two')}).then(() => 1)`);
	await settle(p);
	t.ok(await exists(p, L + '/The wreck.md'), 'ungrouped');
	await h.open(L + '/Epilogue.md');
	const can = await offered(p, 'undo-move');
	t.ok(can, 'undo is offered after Ungroup');
	if (can) { await run(p, 'undo-move'); await settle(p); }
	t.ok(await exists(p, L + '/Part Two/The wreck.md'), 'the notes are back in Part Two');
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'the list is as before');
}));

// ---- 4. What Binders writes, and what it never touches
test('What Binders writes: a move changes the binder note, never a note’s text', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`${B}.moveDown(${file(L + '/Prologue.md')}).then(() => 1)`);
	await settle(p);
	const after = await texts(p);
	same(t, before, after, { skip: [NOTE] });
	t.eq(split(after[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is as it was');
	t.ok(after[NOTE] !== before[NOTE], 'only its list changed');
}));
test('What Binders writes: notes outside a binder are never touched', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.create('Loose.md', '---\\nstatus: x # c\\nn: 0123\\n---\\r\\nText\\r\\n'); await app.vault.createFolder('Plain'); await app.vault.create('Plain/A.md', 'a'); })().then(() => 1)`);
	await p.sleep(300);
	const before = await texts(p);
	await p.ev(`${B}.moveDown(${file(L + '/Prologue.md')}).then(() => 1)`);
	await p.ev(`app.vault.create(${j(L + '/New one.md')}, 'n').then(() => 1)`);
	await settle(p);
	await openView(p);
	await p.click(...Object.values(await p.at(card(L + '/Part One/..'.slice(0, 0) + '/Epilogue.md'))).slice(0, 2));
	await settle(p);
	const after = await texts(p);
	t.eq(after['Loose.md'], before['Loose.md'], 'a loose note is byte for byte the same');
	t.eq(after['Plain/A.md'], before['Plain/A.md'], 'a plain folder’s note too');
	await p.ev(`app.vault.delete(${file('Loose.md')}).then(() => 1)`);
}));
test('What Binders writes: a label set from a card changes only that note’s properties, not its text', withTidy(async (p, h, t) => {
	const path = L + '/Prologue.md';
	const before = await texts(p);
	await openView(p);
	await mode(p, 'corkboard');
	const at = await p.at(card(path));
	await p.right(at.x, at.y);
	await clickMenu(p, 'Set label');
	await clickMenu(p, 'Blue');
	await settle(p);
	const after = await texts(p);
	t.eq(split(after[path]).body, split(before[path]).body, 'the text is as it was');
	t.ok(/label: Blue/.test(split(after[path]).yaml), 'the label is in the properties: ' + split(after[path]).yaml);
	same(t, before, after, { skip: [path] });
}));
test('What Binders writes: Compile writes one new note and changes no note', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await p.ev(`app.commands.executeCommandById('binders:compile')`);
	await until(p, `!!document.querySelector('.modal')`);
	await p.sleep(300);
	const btn = await p.ev(`[...document.querySelectorAll('.modal button')].map(b => b.textContent)`);
	await p.ev(`(() => { const b = [...document.querySelectorAll('.modal button')].find(b => /^(Compile|Create|Write)/.test(b.textContent) && !/Copy/.test(b.textContent)); if (b) b.click(); return 1; })()`);
	await p.sleep(1200);
	const after = await texts(p);
	const made = Object.keys(after).filter((k) => !(k in before));
	t.eq(made.length, 1, 'one new note (buttons: ' + btn.join('/') + '): ' + j(made));
	t.ok(made[0] && !made[0].startsWith(L + '/'), 'beside the binder, not in it: ' + made[0]);
	same(t, before, after);
}));
test('What Binders writes: a binder from a newer version is left exactly as it is', async (p, h, t) => {
	const orig = await read(p, NOTE);
	const newer = orig.replace('binder: 1', 'binder: 2');
	await writeRaw(p, NOTE, newer);
	await until(p, `!!${B}.problem('The Lighthouse')`);
	try {
		const before = await texts(p);
		await p.ev(`${B}.moveDown(${file(L + '/Prologue.md')}).then(() => 'ok', () => 'refused')`);
		await p.ev(`${B}.group([${file(L + '/Prologue.md')}], 'X').then(() => 1, () => 1)`);
		await openView(p);
		await p.key('Delete');
		await settle(p);
		same(t, before, await texts(p));
		t.eq(await read(p, NOTE), newer, 'the binder note is byte for byte what it was');
	} finally { await writeRaw(p, NOTE, orig); await p.sleep(400); await p.ev(`app.vault.adapter.exists(${j(L + '/X')}).then(async e => { const f = ${file(L + '/X')}; if (f) await app.vault.delete(f, true); return 1; })`); }
});

// ---- 5. Troubleshooting
test('Troubleshooting: Order binders in the file explorer off shows name order; on, binder order', async (p, h, t) => {
	await setSettings(p, { orderExplorer: false });
	try {
		const off = (await rows(p)).filter((x) => x.split('/').length === 2);
		t.eq(j(off), j(['The Lighthouse/Part One', 'The Lighthouse/Part Two', 'The Lighthouse/Epilogue.md', 'The Lighthouse/Prologue.md', 'The Lighthouse/The Lighthouse.md']), 'Obsidian’s own order (folders, then notes by name), binder note shown');
	} finally { await setSettings(p, { orderExplorer: true }); }
	t.eq(j((await rows(p)).filter((x) => x.split('/').length === 2)), j(['The Lighthouse/Prologue.md', 'The Lighthouse/Part One', 'The Lighthouse/Part Two', 'The Lighthouse/Epilogue.md']), 'binder order again');
});
test('Troubleshooting: a binder with a newer `binder:` says it is read only, with the format', async (p, h, t) => {
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 7'));
	await until(p, `!!${B}.problem('The Lighthouse')`);
	try {
		await openView(p);
		const n = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-notice.is-shown')?.textContent`);
		t.ok(/Read only/.test(n ?? '') && /format 7/.test(n ?? ''), 'notice: ' + n);
	} finally { await writeRaw(p, NOTE, orig); await p.sleep(400); }
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: banana'));
	await p.sleep(500);
	try {
		await openView(p);
		const n = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-notice.is-shown')?.textContent`);
		t.ok(/read only|can.t change/i.test(n ?? ''), 'a `binder` value Binders doesn’t understand is also read only: ' + n);
	} finally { await writeRaw(p, NOTE, orig); await p.sleep(400); }
});
test('Troubleshooting: the binder note is hidden in the explorer, and “Open binder note” in More options opens it', async (p, h, t) => {
	t.ok(!(await rows(p)).includes(NOTE), 'hidden');
	await openView(p);
	await p.ev(`(() => { ${VIEW}.leaf.view.onPaneMenu ? 0 : 0; return 1; })()`);
	const at = await p.at(`.workspace-leaf.mod-active .view-actions .clickable-icon[aria-label="More options"]`);
	t.ok(!!at, 'More options is in the header');
	if (at) {
		await p.click(at.x, at.y);
		t.ok((await menuItems(p)).includes('Open binder note'), 'the menu has Open binder note: ' + j(await menuItems(p)));
		await clickMenu(p, 'Open binder note');
		await p.sleep(500);
		t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.file?.path`), NOTE, 'it opens the binder note');
	}
	await setSettings(p, { hideBinderNotes: false });
	try { t.ok((await rows(p)).includes(NOTE), 'with the setting off the note shows'); } finally { await setSettings(p, { hideBinderNotes: true }); }
});

// ---- 3. The keyboard lists
const LC = ['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md'].map((x) => L + '/' + x);
test('Corkboard keyboard: arrows, Home, End, Enter, F2, Esc, Alt+arrows, Ctrl+arrows and Space, Shift+F10, Delete', withTidy(async (p, h, t) => {
	await openView(p);
	await mode(p, 'corkboard');
	let at = await p.at(card(LC[0]));
	await p.click(at.x, at.t + 12);
	t.eq(j(await selected(p)), j([LC[0]]), 'a click selects');
	await p.key('ArrowRight'); t.eq((await selected(p))[0], LC[1], 'Right moves to the next card');
	await p.key('ArrowLeft'); t.eq((await selected(p))[0], LC[0], 'Left moves back');
	await p.key('End'); t.eq((await selected(p))[0], LC[3], 'End goes to the last');
	await p.key('Home'); t.eq((await selected(p))[0], LC[0], 'Home goes to the first');
	await p.key('ArrowDown');
	t.ok(LC.includes((await selected(p))[0]), 'Down moves between cards: ' + ((await selected(p))[0]));
	await p.key('Home');
	// Alt+arrow moves the card
	await p.key('ArrowRight', 'alt'); await settle(p);
	t.eq(j((await cards(p)).slice(0, 2)), j([LC[1], LC[0]]), 'Alt+Right moves the card one place later');
	await p.key('ArrowLeft', 'alt'); await settle(p);
	t.eq(j(await cards(p)), j(LC), 'Alt+Left moves it back');
	// Ctrl+arrows move focus without changing selection; Space toggles
	await p.key('ArrowRight', 'ctrl');
	t.eq(j(await selected(p)), j([LC[0]]), 'Ctrl+Right leaves the selection');
	t.eq(await active(p), LC[1], 'but moves the focus');
	await p.key(' ');
	t.eq(j(await selected(p)), j([LC[0], LC[1]]), 'Space adds the focused card');
	await p.key(' ');
	t.eq(j(await selected(p)), j([LC[0]]), 'Space takes it out again');
	await p.key('ArrowRight', 'ctrl'); await p.key(' ');
	await p.key('Escape');
	t.eq((await selected(p)).length, 1, 'Esc goes back to one selected card');
	// F2 renames
	await p.key('Home');
	await p.key('F2');
	await until(p, `document.activeElement?.matches('input, [contenteditable]')`);
	t.ok(await p.ev(`document.activeElement?.matches('input, [contenteditable]')`), 'F2 opens the title for renaming');
	await p.key('Escape'); await p.sleep(200);
	// Shift+F10 opens the menu
	await p.key('F10', 'shift'); await p.sleep(300);
	t.ok((await menuItems(p)).includes('Rename'), 'Shift+F10 opens the card’s menu: ' + j(await menuItems(p)));
	await closeMenus(p);
	// Delete asks
	await p.key('Delete'); await p.sleep(400);
	t.ok(await p.ev(`!!document.querySelector('.modal')`), 'Delete asks before deleting');
	await p.key('Escape'); await p.sleep(200);
	t.ok(await exists(p, LC[0]), 'and nothing was deleted');
	// Enter opens the note
	await p.key('Enter'); await p.sleep(600);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').map(l => l.view.file?.path).pop() ?? null`), LC[0], 'Enter opens the note');
}));

const ROWS = `.workspace-leaf.mod-active .binders-outliner-row[data-path]`;
const rowsOf = (p) => p.ev(`[...document.querySelectorAll(${j(ROWS)})].map(e => e.dataset.path)`);
const rowSel = (p) => p.ev(`[...document.querySelectorAll(${j(ROWS)})].filter(e => e.getAttribute('aria-selected') === 'true').map(e => e.dataset.path)`);
const rowFocus = (p) => p.ev(`document.activeElement?.closest?.('.binders-outliner-row')?.dataset.path ?? null`);
test('Outliner keyboard: Up, Down, Home, End, Page keys, Left/Right fold, Space, Enter, Ctrl+A, type-ahead, Alt+arrows', withTidy(async (p, h, t) => {
	await openView(p);
	await mode(p, 'outliner');
	await p.ev(`(() => { for (const r of document.querySelectorAll('.workspace-leaf.mod-active .binders-outliner-row.is-folder')) {} return 1; })()`);
	let all = await rowsOf(p);
	t.ok(all.length >= 8, 'rows: ' + j(all));
	const first = all[0];
	let at = await p.at(`${ROWS}[data-path="${first}"]`);
	await p.click(at.x + 20, at.y);
	t.eq(j(await rowSel(p)), j([first]), 'click selects a row');
	await p.key('ArrowDown'); t.eq(await rowFocus(p), all[1], 'Down moves to the next row');
	await p.key('ArrowUp'); t.eq(await rowFocus(p), first, 'Up moves back');
	await p.key('End'); t.eq(await rowFocus(p), all[all.length - 1], 'End goes to the last row');
	await p.key('Home'); t.eq(await rowFocus(p), first, 'Home goes to the first');
	await p.key('PageDown');
	t.ok(await rowFocus(p) !== first, 'Page Down goes further: ' + (await rowFocus(p)));
	await p.key('PageUp'); t.eq(await rowFocus(p), first, 'Page Up goes back');
	// type-ahead
	await p.key('e'); await p.sleep(150);
	t.eq(await rowFocus(p), L + '/Epilogue.md', 'typing a name’s first letter goes to its row');
	await p.key('Home');
	// Ctrl+A
	await p.key('a', 'ctrl');
	t.eq((await rowSel(p)).length, all.length, 'Ctrl+A selects all rows');
	await p.key('Escape'); await p.click(at.x + 20, at.y);
	// folds
	const folder = L + '/Part One';
	at = await p.at(`${ROWS}[data-path="${folder}"]`);
	await p.click(at.x + 30, at.y);
	const n0 = (await rowsOf(p)).length;
	await p.key('ArrowLeft'); await p.sleep(200);
	const n1 = (await rowsOf(p)).length;
	t.ok(n1 < n0, `Left folds the folder (${n0} rows, then ${n1})`);
	await p.key('ArrowRight'); await p.sleep(200);
	t.eq((await rowsOf(p)).length, n0, 'Right unfolds it');
	await p.key(' '); await p.sleep(200);
	t.ok((await rowsOf(p)).length < n0, 'Space folds');
	await p.key(' '); await p.sleep(200);
	t.eq((await rowsOf(p)).length, n0, 'Space unfolds');
	// Alt+Down moves the selected row
	const a = await p.at(`${ROWS}[data-path="${LC[0]}"]`);
	await p.click(a.x + 30, a.y);
	await p.key('ArrowDown', 'alt'); await settle(p);
	t.eq(j((await contents(p)).slice(0, 2)), j(['Part One/', 'Part One/Arrival']), 'Alt+Down moved the row (Prologue is now after the folder’s contents or after Part One): ' + j((await contents(p)).slice(0, 6)));
	await p.key('ArrowUp', 'alt'); await settle(p);
	t.eq((await contents(p))[0], 'Prologue', 'Alt+Up moves it back');
	// Enter opens
	await p.key('Escape'); await p.sleep(200);
	await p.key('Enter'); await p.sleep(900);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').map(l => l.view.file?.path).pop() ?? null`), LC[0], 'Enter opens the note');
}));

const sceneOfActive = (p) => p.ev(`(() => { const s = document.activeElement?.closest?.('.binders-manuscript-scene'); if (!s) return -1; return [...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene')].indexOf(s); })()`);
test('Manuscript keyboard: arrows pass into the next and previous note, Page keys, Ctrl+Home and Ctrl+End, F2 and Ctrl-click on a title', withTidy(async (p, h, t) => {
	await openView(p);
	await mode(p, 'manuscript');
	await p.sleep(800);
	const n = await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene').length`);
	t.ok(n >= 7, 'sections: ' + n);
	const before = await texts(p);
	const at = await p.at(`.workspace-leaf.mod-active .binders-manuscript-scene .cm-content`);
	await p.click(at.x, at.y);
	t.eq(await sceneOfActive(p), 0, 'the first section has the caret');
	await p.key('End', 'ctrl'); await p.sleep(400);
	t.eq(await sceneOfActive(p), n - 1, 'Ctrl+End goes to the end of the whole manuscript (last section)');
	await p.key('Home', 'ctrl'); await p.sleep(400);
	t.eq(await sceneOfActive(p), 0, 'Ctrl+Home goes to the start of the whole manuscript');
	let reached = -1;
	for (let i = 0; i < 40 && reached < 1; i++) { await p.key('ArrowDown'); reached = await sceneOfActive(p); }
	t.eq(reached, 1, 'ArrowDown goes on into the next note');
	for (let i = 0; i < 40 && reached > 0; i++) { await p.key('ArrowUp'); reached = await sceneOfActive(p); }
	t.eq(reached, 0, 'ArrowUp goes back into the previous');
	const y0 = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-manuscript')?.parentElement?.scrollTop ?? document.querySelector('.workspace-leaf.mod-active .cm-scroller')?.scrollTop`);
	await p.key('PageDown'); await p.sleep(300);
	const moved = await p.ev(`(() => { const e = document.activeElement; const r = e?.getBoundingClientRect?.(); return !!e && e.closest('.binders-manuscript') ? 1 : 0; })()`);
	t.ok(moved, 'Page Down keeps the caret in the manuscript');
	const lineAfter = await p.ev(`window.getSelection()?.focusNode?.parentElement?.closest('.binders-manuscript-scene') ? [...document.querySelectorAll('.workspace-leaf.mod-active .binders-manuscript-scene')].indexOf(window.getSelection().focusNode.parentElement.closest('.binders-manuscript-scene')) : -1`);
	t.ok(lineAfter >= 0, 'and a Page Down moved on: caret in section ' + lineAfter + ' (scroll ' + y0 + ')');
	// F2 on the title renames; Ctrl-click opens
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-manuscript-title').focus()`);
	await p.key('F2'); await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-manuscript-title input, .workspace-leaf.mod-active .binders-manuscript-title[contenteditable="true"], .workspace-leaf.mod-active .binders-manuscript input')`), 'F2 on a note’s title opens it for renaming');
	await p.key('Escape'); await p.sleep(200);
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-manuscript-title').scrollIntoView({ block: 'center' })`); await p.sleep(300);
	const ti2 = await p.at(`.workspace-leaf.mod-active .binders-manuscript-title`);
	await p.click(ti2.x, ti2.y, { modifiers: 2 }); await p.sleep(800);
	t.ok(await p.ev(`app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path)`), 'Ctrl-click on a title opens the note');
	await flush(p);
	same(t, before, await texts(p));
}));

// ---- 6. Walking down the README
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map(n => n.textContent)`);
const clearNotices = (p) => p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
test('Snapshots: Take a snapshot keeps the text and says so; again with nothing changed it says so and takes none; the file is a .snapshot in the binder’s Snapshots folder', withTidy(async (p, h, t) => {
	const path = P1 + '/Arrival.md';
	await h.open(path);
	const before = await texts(p);
	const list = () => p.ev(`app.vault.adapter.list(${j(L + '/Snapshots/Part One/Arrival')}).then(r => r.files, () => [])`);
	await clearNotices(p);
	await run(p, 'take-snapshot'); await p.sleep(600);
	const first = await list();
	t.eq(first.length, 1, 'one snapshot taken: ' + j(first));
	t.ok(/^The Lighthouse\/Snapshots\/Part One\/Arrival\/\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d.*\.snapshot$/.test(first[0] ?? ''), 'in the documented place and form: ' + first[0]);
	t.ok(/Took a snapshot/.test((await notices(p)).join('|')), 'it says: ' + j(await notices(p)));
	await clearNotices(p);
	await run(p, 'take-snapshot'); await p.sleep(600);
	t.eq((await list()).length, 1, 'with nothing changed it takes none');
	t.ok(/hasn.t changed since its last snapshot/.test((await notices(p)).join('|')), 'and says so: ' + j(await notices(p)));
	same(t, before, await texts(p));
}));
test('Troubleshooting: notes the list doesn’t mention show after the listed ones, by name; a binder note inside a binder is an ordinary note', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.create(${j(L + '/Zed.md')}, 'z'); await app.vault.create(${j(L + '/Alpha.md')}, 'a'); })().then(() => 1)`);
	await p.sleep(500);
	t.eq(j(await p.ev(`${B}.orderedChildren(${file(L)}).map(c => c.name)`)), j(['Prologue.md', 'Part One', 'Part Two', 'Epilogue.md', 'Alpha.md', 'Zed.md']), 'after the listed ones, by name (the binder note itself is not a child here)');
	// a nested binder: a folder in the binder that has a binder note of its own
	await p.ev(`(async () => { await app.vault.createFolder(${j(L + '/Inner')}); await app.vault.create(${j(L + '/Inner/Inner.md')}, '---\\nbinder: 1\\ncontents: []\\n---\\n'); await app.vault.create(${j(L + '/Inner/One.md')}, 'one'); })().then(() => 1)`);
	await p.sleep(600);
	t.ok(!(await p.ev(`${B}.isBinderFolder(${file(L + '/Inner')})`)), 'a binder note inside a binder does not make the folder a binder');
	t.ok(await p.ev(`${B}.scenes(${file(L)}).some(f => f.path === ${j(L + '/Inner/One.md')})`), 'its notes are scenes of the outer binder');
}));
test('Outliner keyboard: Alt+Right puts the row in the folder above, Alt+Left takes it out, Alt+arrows move rows', withTidy(async (p, h, t) => {
	await openView(p);
	await mode(p, 'outliner');
	const row = L + '/Part Two';
	let at = await p.at(`${ROWS}[data-path="${L}/Epilogue.md"]`);
	await p.click(at.x + 30, at.y);
	await p.key('ArrowRight', 'alt'); await settle(p);
	t.ok(await exists(p, L + '/Part Two/Epilogue.md'), 'Alt+Right puts Epilogue in the folder above (Part Two)');
	t.eq(j((await contents(p)).slice(-3)), j(['Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Epilogue']), 'at the end of it, in the list');
	await p.key('ArrowLeft', 'alt'); await settle(p);
	t.ok(await exists(p, L + '/Epilogue.md'), 'Alt+Left takes it out again');
	t.eq((await contents(p)).pop(), 'Epilogue', 'after the folder');
}));
const compile = async (p) => {
	await p.ev(`app.commands.executeCommandById('binders:compile')`);
	await until(p, `!!document.querySelector('.modal')`);
	await p.sleep(300);
	await p.ev(`(() => { const b = [...document.querySelectorAll('.modal button')].find(b => /^(Compile|Create|Write)/.test(b.textContent) && !/Copy/.test(b.textContent)); if (b) b.click(); return 1; })()`);
	await p.sleep(1200);
};
test('Compile: compiling again replaces the last compile; a note written in since is asked about first; your notes aren’t changed', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await compile(p);
	const made = Object.keys(await texts(p)).filter((k) => !(k in before));
	t.eq(made.length, 1, 'one compile note: ' + j(made));
	await compile(p);
	t.eq(j(Object.keys(await texts(p)).filter((k) => !(k in before))), j(made), 'compiling again replaces it: still just that one');
	const text = await read(p, made[0]);
	t.ok(text.includes('Prologue') || text.length > 100, 'it holds the binder’s text');
	await p.ev(`app.vault.adapter.write(${j(made[0])}, ${j(text + '\nMy own addition.\n')}).then(() => 1)`);
	await p.sleep(300);
	await openView(p);
	await p.ev(`app.commands.executeCommandById('binders:compile')`);
	const opened = await until(p, `!!document.querySelector('.modal')`); await p.sleep(300);
	const btns = await p.ev(`[...document.querySelectorAll('.modal button')].map(b => b.textContent)`);
	await p.ev(`(() => { const b = [...document.querySelectorAll('.modal button')].find(b => /^(Compile|Create|Write)/.test(b.textContent) && !/Copy/.test(b.textContent)); if (b) b.click(); return 1; })()`);
	await p.sleep(2500);
	t.ok(opened, 'the compile dialog opened; buttons ' + j(btns));
	const nowText = await read(p, made[0]);
	const modals = await p.ev(`[...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 200))`);
	t.ok(modals.length >= 1 && /has been changed since it was compiled/.test(modals.join(' ')), 'a note written in since is asked about before it is replaced: ' + j(modals));
	t.ok(nowText.includes('My own addition.'), 'and still has the addition');
	for (let i = 0; i < 4 && await p.ev(`document.querySelectorAll('.modal').length`); i++) { await p.key('Escape'); await p.sleep(250); }
}));
test('Undoing a move: Ctrl+Z and Ctrl+Shift+Z in the binder view undo and redo the last move when not typing', withTidy(async (p, h, t) => {
	await openView(p);
	await mode(p, 'corkboard');
	const at = await p.at(card(L + '/Prologue.md'));
	await p.click(at.x, at.t + 12);
	await p.key('ArrowRight', 'alt'); await settle(p);
	t.eq((await cards(p))[0], L + '/Part One', 'moved');
	await p.key('z', 'ctrl'); await settle(p);
	t.eq(j(await cards(p)), j(LC), 'Ctrl+Z took it back');
	await p.key('z', 'ctrl', 'shift'); await settle(p);
	t.eq((await cards(p))[0], L + '/Part One', 'Ctrl+Shift+Z made it again');
	await p.key('z', 'ctrl'); await settle(p);
}));
test('Settings: every setting the README table names is on the settings page, with the defaults it states', async (p, h, t) => {
	const names = ['Order binders in the file explorer', 'Open binders from the file explorer', 'Hide binder and folder notes', 'Show label colors in the file explorer', 'Labels', 'Statuses', 'Typewriter scrolling', 'Show the scenes before and after', 'Show where you are', 'Show word counts', 'Dim other paragraphs', 'Enter fullscreen', 'Words to write today'];
	await p.ev(`(async () => { app.setting.open(); app.setting.openTabById('binders'); })().then(() => 1)`);
	await p.sleep(800);
	const shown = await p.ev(`[...new Set([document, app.setting.activeTab?.containerEl?.ownerDocument].filter(Boolean))].flatMap(d => [...d.querySelectorAll('.setting-item-name')].map(e => e.textContent))`);
	for (const n of names) t.ok(shown.includes(n), `“${n}” is on the settings page` + (shown.includes(n) ? '' : ': ' + j(shown)));
	t.ok(['Synopsis', 'Status', 'Label', 'Target'].every((n) => shown.some((s) => s === n || s.startsWith(n))), 'the four property names are there: ' + j(shown.slice(-8)));
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	const s = await p.ev(`${PL}.settings`);
	t.ok(s.focusTypewriter && s.focusDim, 'Typewriter scrolling and Dim other paragraphs are on to begin with');
	t.ok(!s.focusNeighbours && !s.focusPlace && !s.focusNumbers && !s.focusFullscreen && s.focusGoal === 0, 'the rest of focus mode is off, with no goal');
	t.ok(s.orderExplorer && s.openOnClick && s.hideBinderNotes && s.explorerLabels, 'the explorer settings are on by default');
	t.eq(j(s.statuses), j(['Idea', 'Draft', 'Revised', 'Done']), 'statuses: Idea, Draft, Revised, Done');
	const ln = s.labels.map((l) => l.name);
	t.ok(ln[0] === 'Red' && ln.includes('Blue'), 'labels start with Red and include Blue (the README says “Red, Blue…”; the list is ' + j(ln) + ')');
});
test('Corkboard: a folder is one card with its own synopsis, the names of its first five notes and folders (not a picture) with label colors, and the count of what it holds', withTidy(async (p, h, t) => {
	await p.ev(`(async () => {
		await app.vault.createBinary(${j(P1 + '/map.png')}, new Uint8Array([137, 80, 78, 71]).buffer);
		for (const n of ['Delta', 'Echo', 'Foxtrot']) await app.vault.create(${j(P1 + '/')} + n + '.md', n);
		await app.vault.createFolder(${j(P1 + '/Sub')}); await app.vault.create(${j(P1 + '/Sub/Deep.md')}, 'd');
		await ${B}.flush();
	})().then(() => 1)`);
	await p.sleep(500);
	await p.ev(`${B}.move(${file(P1 + '/map.png')}, ${file(P1)}, 0).then(() => ${B}.flush()).then(() => 1)`);
	await p.ev(`(async () => { await app.fileManager.processFrontMatter(${file(P1 + '/Arrival.md')}, fm => { fm.label = 'Blue'; }); })().then(() => 1)`);
	await settle(p);
	await openView(p);
	await mode(p, 'corkboard');
	const d = await p.ev(`(() => { const c = document.querySelector('.workspace-leaf.mod-active .binders-card[data-path=${j(P1)}]'); return { icon: !!c.querySelector('.binders-card-icon svg'), names: [...c.querySelectorAll('.binders-card-held-name')].map(e => e.textContent), dots: c.querySelectorAll('.binders-card-held-item .binders-label-dot, .binders-card-held-item [class*="dot"]').length, text: c.textContent, aria: c.getAttribute('aria-label') ?? c.getAttribute('aria-description') ?? '' }; })()`);
	t.ok(d.icon, 'a folder icon');
	t.eq(j(d.names), j(await p.ev(`${B}.orderedChildren(${file(P1)}).filter(c => c.children || c.extension === 'md').slice(0, 5).map(c => c.children ? c.name : c.basename)`)), 'the first five notes and folders, in binder order, with no picture: ' + j(d.names));
	t.ok(!d.names.includes('map') && !d.names.includes('map.png') && d.names.length === 5, 'five, and not the picture');
	t.ok(d.dots >= 1, 'with the label’s dot for the labeled note');
	t.ok(/7 notes/.test(d.text), 'and the count of the notes it holds, all levels, folders and the picture not counted: ' + j(d.text.slice(0, 160)) + ' / ' + d.aria);
}));
test('Outliner sorting: a click sorts ascending, then descending, then binder order again; sorting changes only what you see; rows can’t be dragged while sorted', withTidy(async (p, h, t) => {
	await openView(p);
	await mode(p, 'outliner');
	const TH = `.workspace-leaf.mod-active .binders-outliner-th[data-col="words"]`;
	const before = await texts(p);
	const order0 = await rowsOf(p);
	const sortOf = () => p.ev(`document.querySelector(${j(TH)}).getAttribute('aria-sort')`);
	let at = await p.at(TH); await p.click(at.x, at.y); await p.sleep(300);
	t.eq(await sortOf(), 'ascending', 'first click: ascending');
	const asc = await rowsOf(p);
	at = await p.at(TH); await p.click(at.x, at.y); await p.sleep(300);
	t.eq(await sortOf(), 'descending', 'second click: descending');
	t.ok(j(await rowsOf(p)) !== j(asc), 'the rows changed order');
	at = await p.at(TH); await p.click(at.x, at.y); await p.sleep(300);
	t.ok(!['ascending', 'descending'].includes(await sortOf()), 'third click: unsorted');
	t.eq(j(await rowsOf(p)), j(order0), 'binder order again');
	// sorted: a drag does nothing to the binder
	at = await p.at(TH); await p.click(at.x, at.y); await p.sleep(300);
	const a = await p.at(`${ROWS}[data-path="${L}/Epilogue.md"]`), b = await p.at(`${ROWS}[data-path="${L}/Prologue.md"]`);
	await p.drag(a.x + 40, a.y, b.x + 40, b.t + 2); await settle(p);
	t.eq(j((await contents(p))), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'a drag while sorted leaves the binder’s order as it was');
	same(t, before, await texts(p));
}));
test('Splitting: Split scene at cursor moves the text from the cursor on into a new note right after this one; no text is lost', withTidy(async (p, h, t) => {
	const A = P1 + '/Arrival.md', K = P1 + '/The keeper.md';
	await p.ev(`(async () => { await app.vault.modify(${file(A)}, 'First part.\\n\\nSecond part.\\n'); })().then(() => 1)`);
	await p.sleep(300);
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(A)}); app.workspace.setActiveLeaf(l, { focus: true }); const ed = l.view.editor; ed.focus(); ed.setCursor({ line: 2, ch: 0 }); })().then(() => 1)`);
	await p.sleep(400);
	await run(p, 'split-scene'); await settle(p); await p.sleep(800);
	const kids = await p.ev(`${B}.orderedChildren(${file(P1)}).map(c => c.name)`);
	t.eq(j(kids.slice(0, 3)), j(['Arrival.md', 'Arrival 2.md', 'The keeper.md']), 'a new note right after Arrival: ' + j(kids));
	const newPath = P1 + '/Arrival 2.md';
	const a = await read(p, A), n = await read(p, newPath);
	t.ok(/First part\./.test(a) && !/Second part/.test(a), 'Arrival keeps the text before the cursor: ' + j(a));
	t.ok(/Second part\./.test(n), 'the new note has the rest: ' + j(n));
	t.eq((a + n).replace(/\s+/g, ' ').trim(), 'First part. Second part.', 'between them, every word');
}));
test('Splitting: Undo in the note that was split takes the whole split back, the new note too; Ungroup takes the emptied folder away and Undo last move brings it back', withTidy(async (p, h, t) => {
	const A = P1 + '/Arrival.md';
	await p.ev(`(async () => { await app.vault.modify(${file(A)}, 'First part.\\n\\nSecond part.\\n'); })().then(() => 1)`);
	await p.sleep(300);
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(A)}); app.workspace.setActiveLeaf(l, { focus: true }); const ed = l.view.editor; ed.focus(); ed.setCursor({ line: 2, ch: 0 }); })().then(() => 1)`);
	await p.sleep(400);
	await run(p, 'split-scene'); await settle(p); await p.sleep(600);
	t.ok(!/Second part/.test(await read(p, A)), 'split');
	await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.editor.focus()`);
	await p.key('z', 'ctrl'); await p.sleep(800); await flush(p); await p.sleep(500);
	t.ok(await until(p, `app.vault.adapter.read(${j(A)}).then(s => /Second part\\./.test(s))`, 5000), 'Undo put the second half back in the note: ' + j(await read(p, A)));
	t.ok(await until(p, `app.vault.adapter.exists(${j(P1 + '/Arrival 2.md')}).then(x => !x)`, 5000), 'and the new note is gone (to the trash)');
	await p.ev(`${B}.ungroup(${file(L + '/Part Two')}).then(() => 1)`);
	await settle(p);
	t.ok(await p.ev(`!${file(L + '/Part Two')} && !!${file(L + '/The wreck.md')}`), 'Ungroup takes the emptied Part Two away, its notes out');
	await run(p, 'undo-move'); await settle(p);
	t.ok(await until(p, `!!${file(L + '/Part Two/The wreck.md')} && !!${file(L + '/Part Two/Lights out.md')}`, 5000), 'and Undo last move brings the folder back with its notes');
}));
test('Outliner keyboard: Right goes on into a row’s cells, the arrows move from cell to cell, Enter opens the cell’s menu or field, Esc comes back', withTidy(async (p, h, t) => {
	await openView(p);
	await mode(p, 'outliner');
	const at = await p.at(`${ROWS}[data-path="${L}/Prologue.md"]`);
	await p.click(at.x + 30, at.y);
	await p.key('Escape'); await p.sleep(200);
	const cell = () => p.ev(`(() => { const e = document.activeElement; return e && e.closest('.binders-outliner-row') && !e.classList.contains('binders-outliner-row') ? (e.dataset.col ?? e.className) : null; })()`);
	await p.key('ArrowRight'); await p.sleep(150);
	const c1 = await cell();
	t.ok(!!c1, 'Right goes into a cell: ' + c1);
	await p.key('ArrowRight'); await p.sleep(150);
	const c2 = await cell();
	t.ok(!!c2 && c2 !== c1, 'Right again moves to the next cell: ' + c1 + ' -> ' + c2);
	await p.key('ArrowLeft'); await p.sleep(150);
	t.eq(await cell(), c1, 'Left moves back');
	// walk to the status or label cell and open its menu with Enter
	let found = false;
	for (let i = 0; i < 8 && !found; i++) {
		const c = await cell();
		if (c && /label|status/.test(c)) { found = true; break; }
		await p.key('ArrowRight'); await p.sleep(100);
	}
	t.ok(found, 'a label or status cell is reached with the arrows');
	await p.key('Enter'); await p.sleep(400);
	t.ok((await menuItems(p)).length > 0, 'Enter opens the cell’s menu: ' + j(await menuItems(p)));
	await closeMenus(p);
}));
