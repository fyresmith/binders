// The corkboard (src/view/corkboard.ts): one folder's items as cards in binder order, a subfolder as one stack that's
// gone into; dragging (within a folder, onto a stack, out to a folder in the breadcrumb, several at once, by touch),
// editing a synopsis (also while the note changes on disk), new cards, rename, delete, status and label, the keyboard,
// and mobile. Every test that changes files checks no text was lost.
import { B, NOTE, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, flush, hoverMenu, j, menuItems, openView, read, reload, same, selected, split, texts, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'corkboard: ' + name, fn });

const L = 'The Lighthouse/';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const at = (p, path) => p.at(card(L + path));
/** Waits for the binder note's list to be written, and returns it. */
async function written(p, want) {
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.includes(${j(want)}))`);
	return contents(p);
}
/** A mouse drag with the button held, in small steps, as a person would. */
async function drag(p, from, to) {
	await p.drag(from.x, from.y, to.x, to.y, 16);
	await p.sleep(250);
}

/** The folders on the way up, in the toolbar: the one with this path. */
const crumb = (path) => `.workspace-leaf.mod-active .binders-crumb[data-path="${path}"]`;
const folderShown = (p) => p.ev(`app.workspace.getMostRecentLeaf().getViewState().state?.folder`);
const PART_ONE = ['Arrival', 'The keeper', 'Storm warning'].map((x) => L + 'Part One/' + x + '.md');
const BOARD = [L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md'];
const undo = (p, redo = false) => p.ev(`(() => { const c = app.commands.findCommand('binders:${redo ? 'redo' : 'undo'}-move'); if (!c.checkCallback(true)) return false; app.commands.executeCommandById(c.id); return c.name; })()`);

test('the board shows one folder: its notes and folders as cards in binder order, a folder as one stack', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', '---\\nsynopsis: Arrivals.\\n---\\n').then(() => 1)`);
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Part One/Part One.md')})?.frontmatter?.synopsis === 'Arrivals.'`);
	await openView(p);
	t.eq(j(await cards(p)), j(BOARD), 'Prologue, the two parts as one card each, then Epilogue');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-group').length`), 1, 'in one grid');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active :is(.binders-group.is-folder, .binders-group-heading, .binders-group-title)').length`), 0, 'no sections, no headings');
	const s = await p.ev(`(() => { const c = document.querySelector('${card(L + 'Part One')}'); return { stack: c.classList.contains('is-stack'), title: c.querySelector('.binders-card-title').textContent, syn: c.querySelector('.binders-card-synopsis').textContent, words: c.querySelector('.binders-card-words').textContent, role: c.getAttribute('role'), name: c.getAttribute('aria-label'), icon: !!c.querySelector('.binders-card-icon svg') }; })()`);
	t.eq(j(s), j({ stack: true, title: 'Part One', syn: 'Arrivals.', words: '3 notes · 51 words', role: 'option', name: 'Part One', icon: true }), 'a stack shows the folder’s name, its synopsis and what it holds');
	t.eq(await p.ev(`document.querySelector('${card(L + 'Part Two')} .binders-card-words').textContent`), '2 notes · 28 words', 'each stack counts its own notes');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-stack').length`), 2, 'only folders are stacks');
	t.eq(j(await p.ev(`(() => { const n = document.querySelectorAll('.workspace-leaf.mod-active .binders-card-new'); return [n.length, n[0] === n[0].parentElement.lastElementChild, n[0].querySelector('.binders-card-new-label')?.textContent]; })()`)), j([1, true, 'New note']), 'one “New note” tile ends the board');
	// the notes of a folder are on that folder's board
	await openView(p, L + 'Part One');
	t.eq(j(await cards(p)), j(PART_ONE), 'Part One’s notes, in order, on its own board');
	const c = await p.ev(`(() => { const c = document.querySelector('${card(L + 'Part One/Arrival.md')}'); return { title: c.querySelector('.binders-card-title').textContent, syn: c.querySelector('.binders-card-synopsis').textContent, chip: c.querySelector('.binders-chip').textContent, words: c.querySelector('.binders-card-words').textContent, role: c.getAttribute('role'), list: c.parentElement.getAttribute('role') }; })()`);
	t.eq(j(c), j({ title: 'Arrival', syn: 'Mara arrives on the island with the supply boat.', chip: 'Revised', words: '18 words', role: 'option', list: 'listbox' }), 'a card shows title, synopsis, status and words');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card-new').length`), 1, 'and one “New note” tile ends it');
	t.ok(!(await p.ev(`!!document.querySelector('${card(L + 'Part One/Part One.md')}')`)), 'the folder’s own note is not a card');
}));

test('a stack is gone into by a double-click anywhere on it, or Enter; the breadcrumb leads back out', async (p, h, t) => {
	await openView(p);
	let s = await at(p, 'Part One');
	await p.dbl(s.x, s.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	t.eq(await folderShown(p), L + 'Part One', 'a double-click on its name shows the folder');
	await until(p, `document.activeElement?.dataset?.path === ${j(PART_ONE[0])}`);
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), PART_ONE[0], 'the keyboard is on its first card');
	t.eq(j(await cards(p)), j(PART_ONE), 'with its notes as cards');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, 'in the same tab');
	// out again by the breadcrumb
	const up = await p.at(crumb('The Lighthouse'));
	await p.click(up.x, up.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	t.eq(j(await cards(p)), j(BOARD), 'the breadcrumb leads back to the binder’s board');
	await until(p, `document.activeElement?.dataset?.path === ${j(L + 'Part One')}`);
	t.eq(j([await p.ev(`document.activeElement?.dataset?.path ?? null`), await selected(p)]), j([L + 'Part One', [L + 'Part One']]), 'with the stack come out of selected, and the keyboard on it');
	// the middle of the stack (where its synopsis is): still a way in, not a field
	s = await at(p, 'Part Two');
	await p.dbl(s.x, s.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part Two'`);
	t.eq(await folderShown(p), L + 'Part Two', 'a double-click on its middle shows the folder too');
	t.ok(!(await p.ev(`document.activeElement.matches('textarea, input')`)), 'and edits nothing');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	await until(p, `document.activeElement?.dataset?.path === ${j(L + 'Part Two')}`);
	t.eq(j(await selected(p)), j([L + 'Part Two']), 'Back comes out again, to the stack gone into');
	// Enter, with the keyboard on the stack
	s = await at(p, 'Part One');
	await p.click(s.x, s.t + 14);
	t.eq(j(await selected(p)), j([L + 'Part One']), 'a click selects the stack');
	t.eq(await folderShown(p), 'The Lighthouse', 'and goes nowhere');
	await p.key('Enter');
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	t.eq(await folderShown(p), L + 'Part One', 'Enter shows the folder');
	t.eq(j(await cards(p)), j(PART_ONE), 'with its notes');
});

test('drag to reorder within a folder: the list changes, no note does', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	const a = await at(p, 'Part One/Storm warning.md'), b = await at(p, 'Part One/Arrival.md');
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 10, y: b.y });
	t.eq(j(await cards(p)), j(['Storm warning', 'Arrival', 'The keeper'].map((x) => L + 'Part One/' + x + '.md')), 'Storm warning is first in Part One');
	const list = await written(p, '  - Part One/Storm warning\n  - Part One/Arrival');
	t.eq(j(list), j(['Prologue', 'Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'contents on disk');
	const after = await texts(p);
	same(t, before, after, { skip: [NOTE] });
	t.eq(split(after[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is untouched');
	t.eq(j(await selected(p)), j([L + 'Part One/Storm warning.md']), 'the moved card stays selected');
}));

test('a stack is a card among the others: dropped at a stack’s edge a note goes beside it, and a stack is dragged with all it holds', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	// Epilogue to the left edge of Part One: before it, not into it
	const e = await at(p, 'Epilogue.md'), one = await at(p, 'Part One');
	await drag(p, { x: e.x, y: e.t + 12 }, { x: one.l + 10, y: one.y });
	t.eq(j(await written(p, '  - Epilogue\n  - Part One/\n')), j(['Prologue', 'Epilogue', ...LIST.slice(1, 8)]), 'before the folder, still in the binder’s own folder');
	t.ok(await exists(p, L + 'Epilogue.md'), 'the note is where it was on disk');
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Epilogue.md', L + 'Part One', L + 'Part Two']), 'and the board shows it there');
	// the stack Part Two, taken by its name, to before Part One
	const two = await at(p, 'Part Two'), one2 = await at(p, 'Part One');
	await drag(p, { x: two.l + 40, y: two.t + 14 }, { x: one2.l + 10, y: one2.y });
	t.eq(j(await written(p, '  - Part Two/Lights out\n  - Part One/\n')), j(['Prologue', 'Epilogue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning']), 'the folder moves with its notes, in their order');
	const after = await texts(p);
	same(t, before, after, { skip: [NOTE] });
	t.eq(split(after[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is untouched');
}));

test('a note goes into another folder by its stack; within a folder it’s placed by the line, or on the “New note” tile for the end', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	// from the binder's own folder into Part Two: onto its stack
	const c = await at(p, 'Prologue.md'), two = await at(p, 'Part Two');
	await drag(p, { x: c.x, y: c.t + 12 }, { x: two.x, y: two.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Prologue.md')`);
	t.ok(!(await exists(p, L + 'Prologue.md')), 'the note left the binder’s own folder');
	t.eq(j(await written(p, '  - Part Two/Lights out\n  - Part Two/Prologue')), j([...LIST.slice(1, 8), 'Part Two/Prologue', 'Epilogue']), 'it is last in Part Two');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md' } });
	// gone into Part Two: to before Lights out
	const st = await at(p, 'Part Two');
	await p.dbl(st.x, st.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part Two'`);
	await until(p, `!!document.querySelector('${card(L + 'Part Two/Prologue.md')}')`);
	t.eq(j(await cards(p)), j(['The wreck', 'Lights out', 'Prologue'].map((x) => L + 'Part Two/' + x + '.md')), 'on Part Two’s board it is the last card');
	const d = await at(p, 'Part Two/Prologue.md'), lights = await at(p, 'Part Two/Lights out.md');
	await drag(p, { x: d.x, y: d.t + 12 }, { x: lights.l + 10, y: lights.y });
	t.eq(j(await written(p, '  - Part Two/Prologue\n  - Part Two/Lights out')), j([...LIST.slice(1, 7), 'Part Two/Prologue', 'Part Two/Lights out', 'Epilogue']), 'it sits before Lights out');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md' } });
	// to the end of the folder shown: the "New note" tile
	const w = await at(p, 'Part Two/The wreck.md'), end = await p.at(`.workspace-leaf.mod-active .binders-card-new`);
	await drag(p, { x: w.x, y: w.t + 12 }, { x: end.x, y: end.y });
	t.eq(j(await written(p, '  - Part Two/Lights out\n  - Part Two/The wreck')), j([...LIST.slice(1, 6), 'Part Two/Prologue', 'Part Two/Lights out', 'Part Two/The wreck', 'Epilogue']), 'dropped on the “New note” tile: at the end of Part Two, not of the binder');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md' } });
	// and on the binder's board, where the tile is on a row of its own
	await openView(p);
	const one = await at(p, 'Part One'), end2 = await p.at(`.workspace-leaf.mod-active .binders-card-new`);
	await drag(p, { x: one.l + 40, y: one.t + 14 }, { x: end2.x, y: end2.y });
	t.eq(j(await written(p, '  - Epilogue\n  - Part One/\n')), j(['Part Two/', 'Part Two/Prologue', 'Part Two/Lights out', 'Part Two/The wreck', 'Epilogue', ...LIST.slice(1, 5)]), 'a stack dropped on the binder’s tile goes last, with its notes');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md' } });
}));

test('Ctrl and Shift select several cards, and they move together', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const pro = await at(p, 'Prologue.md'), one = await at(p, 'Part One'), two = await at(p, 'Part Two'), epi = await at(p, 'Epilogue.md');
	await p.click(pro.x, pro.t + 12);
	await p.click(epi.x, epi.t + 12, { modifiers: 2 });
	t.eq(j(await selected(p)), j([L + 'Prologue.md', L + 'Epilogue.md']), 'Ctrl-click adds a card');
	await p.click(pro.x, pro.t + 12);
	await p.click(two.x, two.t + 12, { modifiers: 8 });
	t.eq(j(await selected(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two']), 'Shift-click selects a range, stacks too');
	await p.click(one.x, one.t + 12, { modifiers: 2 });
	t.eq(j(await selected(p)), j([L + 'Prologue.md', L + 'Part Two']), 'Ctrl-click takes one out');
	// two notes of a folder, moved together within it
	await openView(p, L + 'Part One');
	const arr = await at(p, 'Part One/Arrival.md'), keeper = await at(p, 'Part One/The keeper.md'), storm = await at(p, 'Part One/Storm warning.md');
	await p.click(keeper.x, keeper.t + 12);
	await p.click(storm.x, storm.t + 12, { modifiers: 2 });
	await drag(p, { x: keeper.x, y: keeper.t + 12 }, { x: arr.l + 10, y: arr.y });
	t.eq(j(await written(p, '  - Part One/The keeper\n  - Part One/Storm warning\n  - Part One/Arrival')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'both moved, in their order');
	t.eq(j(await selected(p)), j([L + 'Part One/The keeper.md', L + 'Part One/Storm warning.md']), 'still selected');
	same(t, before, await texts(p), { skip: [NOTE] });
	// and together into another folder: the binder's two loose notes onto Part Two's stack
	await openView(p);
	const pro2 = await at(p, 'Prologue.md'), epi2 = await at(p, 'Epilogue.md'), two2 = await at(p, 'Part Two');
	await p.click(pro2.x, pro2.t + 12);
	await p.click(epi2.x, epi2.t + 12, { modifiers: 2 });
	await drag(p, { x: epi2.x, y: epi2.t + 12 }, { x: two2.x, y: two2.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Prologue.md') && app.vault.adapter.exists('The Lighthouse/Part Two/Epilogue.md')`);
	await p.sleep(300);
	t.eq(j(await written(p, '  - Part Two/Lights out\n  - Part Two/Prologue\n  - Part Two/Epilogue')), j(['Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Prologue', 'Part Two/Epilogue']), 'both go into the folder, at its end, in their order');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md', [L + 'Epilogue.md']: L + 'Part Two/Epilogue.md' } });
	t.eq(j(await cards(p)), j([L + 'Part One', L + 'Part Two']), 'and are no longer on the binder’s board');
	t.eq(await p.ev(`document.querySelector('${card(L + 'Part Two')} .binders-card-words').textContent.split(' · ')[0]`), '4 notes', 'the stack counts them');
}));

test('a card’s synopsis: edited in place, only that property written', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const syn = `${card(L + 'Epilogue.md')} .binders-card-synopsis`;
	let s = await p.at(syn);
	await p.click(s.x, s.y);
	t.ok(await p.ev(`document.activeElement.matches('${syn} textarea')`), 'clicking the synopsis edits it');
	t.eq(j(await selected(p)), j([L + 'Epilogue.md']), 'and selects the card');
	await p.key('End', 'ctrl');
	await p.type(' It has a gift shop.\nTwo lines.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('gift shop'))`);
	const now = await read(p, L + 'Epilogue.md');
	t.eq(split(now).body, split(before[L + 'Epilogue.md']).body, 'the body is untouched');
	t.ok(/synopsis: \|-\n\s+Years later, the lighthouse is a museum\. It has a gift shop\.\n\s+Two lines\./.test(now), 'the synopsis, with its new line: ' + split(now).yaml);
	t.ok(/status: idea/.test(now) && /plotlines:\n\s+- Mara/.test(now), 'the other properties are kept');
	same(t, before, await texts(p), { skip: [L + 'Epilogue.md'] });
	// Escape cancels
	s = await p.at(syn);
	await p.click(s.x, s.y);
	await p.type('Oops');
	await p.key('Escape');
	await p.sleep(300);
	t.ok(!(await read(p, L + 'Epilogue.md')).includes('Oops'), 'Escape writes nothing');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Epilogue.md', 'and the card has the focus back');
}));

test('a synopsis being typed survives the note changing on disk', withTidy(async (p, h, t) => {
	await openView(p);
	const syn = `${card(L + 'Prologue.md')} .binders-card-synopsis`;
	const s = await p.at(syn);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' Or has it?');
	// meanwhile, another app changes the note's text and a property
	const orig = await read(p, L + 'Prologue.md');
	const external = orig.replace('status: draft', 'status: revised').replace('nobody on the island was surprised.', 'nobody on the island was surprised.\n\nA new paragraph from elsewhere.');
	await writeRaw(p, L + 'Prologue.md', external);
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Prologue.md')})?.frontmatter?.status === 'revised'`);
	await p.sleep(400);
	t.ok(await p.ev(`document.activeElement.matches('${syn} textarea')`), 'still editing: the redraw waits');
	t.eq(await p.ev(`document.activeElement.value`), 'The light has not gone out in forty years. Or has it?', 'nothing typed was lost');
	await p.type(' Yes.');
	await p.ev(`document.activeElement.blur()`);
	await until(p, `app.vault.adapter.read('The Lighthouse/Prologue.md').then(s => s.includes('Or has it? Yes.'))`);
	const now = await read(p, L + 'Prologue.md');
	t.eq(split(now).body, split(external).body, 'the other app’s text is kept');
	t.ok(/status: revised/.test(now), 'and its property');
	t.ok(/synopsis: The light has not gone out in forty years\. Or has it\? Yes\./.test(now), 'with the new synopsis');
	await until(p, `document.querySelector('${card(L + 'Prologue.md')} .binders-chip')?.textContent === 'Revised'`);
	t.eq(await p.ev(`document.querySelector('${card(L + 'Prologue.md')} .binders-chip').textContent`), 'Revised', 'the card shows the change once editing ends');
}));

test('a stack’s synopsis is the folder’s: edited on the card, it goes to the folder note', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const c = await at(p, 'Part One');
	await p.click(c.x, c.t + 14);
	// (a stack is gone into by a double-click, so its synopsis takes a click once it has been selected a moment)
	await p.sleep(800);
	const syn = `${card(L + 'Part One')} .binders-card-synopsis`;
	// (with none yet, the card gives the room to the names of what the folder holds: its menu adds one)
	t.ok(!(await p.at(syn)), 'a selected folder with no synopsis doesn’t offer one on its card');
	await p.right(c.x, c.t + 14);
	await clickMenu(p, 'Edit synopsis');
	await until(p, `document.activeElement?.matches('${syn} textarea')`);
	t.ok(await p.ev(`document.activeElement.matches('${syn} textarea')`), '“Edit synopsis”, in its menu, edits it on the card');
	t.eq(await folderShown(p), 'The Lighthouse', 'and doesn’t go into the folder');
	await p.type('Mara arrives.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Part One.md')`);
	await p.sleep(200);
	t.eq((await read(p, L + 'Part One/Part One.md')).trim(), '---\nsynopsis: Mara arrives.\n---', 'the folder note holds it');
	await until(p, `document.querySelector('${syn}')?.textContent === 'Mara arrives.'`);
	t.eq(await p.ev(`document.querySelector('${syn}').textContent`), 'Mara arrives.', 'the stack shows it');
	// once it has one, a click on it (the card selected a moment) edits it
	const c2 = await at(p, 'Part One');
	await p.click(c2.x, c2.t + 14);
	await p.sleep(800);
	const s = await p.at(syn);
	t.ok(s, 'a folder’s synopsis shows on its card');
	await p.click(s.x, s.y);
	t.ok(await p.ev(`document.activeElement.matches('${syn} textarea')`), 'a click on the synopsis of a selected stack edits it');
	t.eq(await folderShown(p), 'The Lighthouse', 'and doesn’t go into the folder');
	await p.key('Escape');
	await p.sleep(200);
	t.eq(j(await contents(p)), j(LIST), 'and the folder note is not in the list');
	t.eq(j(await cards(p)), j(BOARD), 'nor a card');
	same(t, before, await texts(p));
}));

test('a folder’s card names the first things it holds, each with its label’s dot; a long name is cut; the names are not controls', withTidy(async (p, h, t) => {
	const LONG = 'The night the keeper finally told Mara what had happened to the first light and why';
	await p.ev(`(async () => {
		await app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}), (fm) => { fm.label = 'blue'; });
		await app.vault.createFolder(${j(L + 'Part Two/Letters')});
		await app.vault.create(${j(L + 'Part Two/' + LONG + '.md')}, 'Long.');
		await app.vault.createFolder(${j(L + 'Empty')});
		await ${B}.settled;
	})().then(() => 1)`);
	await openView(p);
	const held = (path) => p.ev(`[...document.querySelectorAll('${card(L + path)} .binders-card-held-item')].map(r => ({ name: r.querySelector('.binders-card-held-name').textContent, dot: r.querySelector('.binders-label-dot')?.className.match(/mod-(\\w+)/)?.[1] ?? null, folder: !!r.querySelector('.binders-card-held-icon svg'), shown: r.getBoundingClientRect().left < r.closest('.binders-card').getBoundingClientRect().right && r.getBoundingClientRect().width > 0 }))`);
	await until(p, `document.querySelectorAll('${card(L + 'Part One')} .binders-card-held-item').length === 3`);
	const one = await held('Part One');
	t.eq(j(one.map((r) => r.name)), j(['Arrival', 'The keeper', 'Storm warning']), 'the folder’s first things by name, in the binder’s order');
	t.eq(j(one.map((r) => r.dot)), j(['blue', null, null]), 'a labeled note has its label’s dot, the others none');
	t.ok(one.every((r) => r.shown && !r.folder), 'three show on a card of the usual size');
	const two = await held('Part Two');
	t.ok(two.some((r) => r.name === 'Letters' && r.folder), `a subfolder in it has the folder’s glyph (${j(two)})`);
	t.eq(await p.ev(`document.querySelectorAll('${card(L + 'Empty')} .binders-card-held-item').length`), 0, 'an empty folder’s card names nothing');
	// the same size as a note's card, whatever it names
	const size = (path) => p.ev(`(() => { const r = document.querySelector('${card(L + path)}').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
	t.eq(j(await size('Part Two')), j(await size('Epilogue.md')), 'a folder’s card is the size of a note’s, a long name in it or not');
	t.eq(j(await size('Part One')), j(await size('Epilogue.md')), '(and the other)');
	const cut = await p.ev(`(() => { const n = [...document.querySelectorAll('${card(L + 'Part Two')} .binders-card-held-name')].find(e => e.textContent === ${j(LONG)}); return !!n && n.scrollWidth > n.clientWidth && n.getBoundingClientRect().height < 24; })()`);
	t.ok(cut, 'a long name is cut on one line');
	// a look inside, not controls: nothing in the list takes the focus or is said twice
	const list = await p.ev(`(() => { const l = document.querySelector('${card(L + 'Part One')} .binders-card-held'); return { hidden: l.getAttribute('aria-hidden'), focusable: l.querySelectorAll('[tabindex], a, button, input').length, name: l.closest('.binders-card').getAttribute('aria-label'), about: l.closest('.binders-card').getAttribute('aria-description') }; })()`);
	t.eq(j(list), j({ hidden: 'true', focusable: 0, name: 'Part One', about: '3 notes · 51 words' }), 'the names are hidden from a screen reader, which hears the card’s name and count as before, and nothing in them takes the focus');
	// small cards: two names
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), options: { ...v.getState().options, cardSize: 'small' } } }); })().then(() => 1)`);
	await p.sleep(500);
	const seen = (path) => p.ev(`(() => { const l = document.querySelector('${card(L + path)} .binders-card-held'); if (!l) return -1; const b = l.getBoundingClientRect(); return [...l.querySelectorAll('.binders-card-held-item')].filter(r => { const x = r.getBoundingClientRect(); return x.width > 0 && x.left < b.right - 1 && x.bottom <= b.bottom + 1; }).length; })()`);
	t.eq(await seen('Part One'), 2, 'a small card shows two');
}));

test('a folder’s card keeps up with what it holds: a note in it renamed, and one moved to its front, are named as they now are', withTidy(async (p, h, t) => {
	await openView(p);
	const names = `[...document.querySelectorAll('${card(L + 'Part One')} .binders-card-held-name')].map(e => e.textContent)`;
	await until(p, `${names}.length === 3`);
	t.eq(j(await p.ev(names)), j(['Arrival', 'The keeper', 'Storm warning']), 'as the folder stands');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Arrival.md')}, ${j(L + 'Part One/Landing.md')}).then(() => 1)`);
	await until(p, `${names}[0] === 'Landing'`);
	t.eq(j(await p.ev(names)), j(['Landing', 'The keeper', 'Storm warning']), 'a note renamed is named anew on the folder’s card');
	// moved to the front of its folder (the binder's list, as a drop writes it)
	await p.ev(`app.fileManager.processFrontMatter(${file(NOTE)}, (fm) => { fm.contents = ['Prologue', 'Part One/', 'Part One/Storm warning', 'Part One/Landing', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']; }).then(() => 1)`);
	await until(p, `${names}[0] === 'Storm warning'`);
	t.eq(j(await p.ev(names)), j(['Storm warning', 'Landing', 'The keeper']), 'and the names follow the folder’s order');
}));

test('the “New note” tile: type a title, Enter makes the note at the end of the folder shown and offers another', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const tile = '.workspace-leaf.mod-active .binders-card-new';
	const nc = await p.at(tile);
	await p.click(nc.x, nc.y);
	t.ok(await p.ev(`document.activeElement.matches('.binders-card-new input')`), 'the title field has the focus');
	await p.type('The rescue');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/The rescue.md')`);
	await p.sleep(300);
	t.ok(await p.ev(`document.activeElement.matches('.binders-card-new input')`), 'another new card is ready');
	await p.type('Dawn');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Dawn.md')`);
	await p.sleep(300);
	await p.key('Escape');
	await p.sleep(200);
	t.ok(!(await p.ev(`!!document.querySelector('.binders-card-new input')`)), 'Escape ends it');
	t.eq(await read(p, L + 'The rescue.md'), '', 'an empty note');
	t.eq(j(await cards(p)), j([...BOARD, L + 'The rescue.md', L + 'Dawn.md']), 'at the end of the binder’s board, in order');
	t.eq(await p.ev(`document.querySelectorAll('${tile}').length`), 1, 'and the one tile is still last');
	t.eq(j(await written(p, '  - Dawn')), j([...LIST, 'The rescue', 'Dawn']), 'written into the list, after everything in the binder');
	// in a folder: at that folder's end, which is not the binder's
	await openView(p, L + 'Part One');
	const first = await p.at(tile);
	await p.click(first.x, first.y);
	await p.type('Interlude');
	await p.ev(`document.activeElement.blur()`);
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Interlude.md')`);
	t.eq(j((await written(p, '  - Part One/Interlude')).slice(1, 7)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Interlude', 'Part Two/']), 'clicking away with a title makes it too, last in Part One');
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 4`);
	t.eq(j(await cards(p)), j([...PART_ONE, L + 'Part One/Interlude.md']), 'and it shows there');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('New note in the toolbar’s New: after the selected card; with none selected, or the last one, in the tile at the end', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const newNote = async () => {
		const btn = await p.at(`.workspace-leaf.mod-active .binders-new-button`);
		await p.click(btn.x, btn.y);
		await p.sleep(200);
		await clickMenu(p, 'New note');
	};
	// with Prologue selected: the note is made right after it, and named in place
	const c = await at(p, 'Prologue.md');
	await p.click(c.x, c.t + 12);
	await newNote();
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-card[data-path] input')`);
	const made = await p.ev(`document.activeElement.closest('.binders-card').dataset.path`);
	t.eq(made, L + 'Untitled.md', 'a new note’s card, its title ready to type over');
	t.eq(j((await cards(p)).slice(0, 3)), j([L + 'Prologue.md', L + 'Untitled.md', L + 'Part One']), 'right after the selected card');
	await p.type('Interlude');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Interlude.md')`);
	t.ok(!(await exists(p, L + 'Untitled.md')), 'renamed, not copied');
	t.eq(j(await written(p, '  - Prologue\n  - Interlude\n  - Part One/')), j(['Prologue', 'Interlude', ...LIST.slice(1)]), 'written into the list after Prologue');
	t.eq(await read(p, L + 'Interlude.md'), '', 'an empty note');
	// with a stack selected: after the folder, beside it, not in it
	await until(p, `!!document.querySelector('${card(L + 'Part One')}')`);
	const one = await at(p, 'Part One');
	await p.click(one.x, one.t + 14);
	await newNote();
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-card[data-path] input')`);
	await p.type('Between');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Between.md')`);
	t.eq(j(await written(p, '  - Part One/Storm warning\n  - Between\n  - Part Two/')), j(['Prologue', 'Interlude', ...LIST.slice(1, 5), 'Between', ...LIST.slice(5)]), 'after a selected stack: after the folder and all it holds');
	// with the last card selected: the tile at the end takes the title
	await until(p, `!!document.querySelector('${card(L + 'Epilogue.md')}')`);
	const e = await at(p, 'Epilogue.md');
	await p.click(e.x, e.t + 12);
	await newNote();
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-card-new input')`);
	t.ok(await p.ev(`document.activeElement.matches('.workspace-leaf.mod-active .binders-card-new input')`), 'after the last card is the tile: the title is typed there');
	await p.type('Afterword');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Afterword.md')`);
	await p.sleep(300);
	await p.key('Escape');
	await p.sleep(200);
	// with nothing selected: the tile too
	const board = await rectOf(p, '.workspace-leaf.mod-active .binders-corkboard');
	await p.click(board.r - 40, board.b - 40);
	t.eq(j(await selected(p)), j([]), 'a click on the empty board selects nothing');
	await newNote();
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-card-new input')`);
	await p.type('Notes');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Notes.md')`);
	await p.sleep(300);
	await p.key('Escape');
	t.eq(j((await written(p, '  - Afterword\n  - Notes')).slice(-3)), j(['Epilogue', 'Afterword', 'Notes']), 'both at the end, in the order they were made');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('rename from the menu', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	const c = await at(p, 'Part One/The keeper.md');
	await p.right(c.x, c.y);
	await clickMenu(p, 'Rename');
	t.ok(await p.ev(`document.activeElement.matches('${card(L + 'Part One/The keeper.md')} input')`), 'the title is editable');
	await p.key('a', 'ctrl');
	await p.type('The lighthouse keeper');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/The lighthouse keeper.md')`);
	t.eq(j(await written(p, 'Part One/The lighthouse keeper')), j(LIST.map((x) => (x === 'Part One/The keeper' ? 'Part One/The lighthouse keeper' : x))), 'keeps its place');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/The keeper.md']: L + 'Part One/The lighthouse keeper.md' } });
	// a name that's taken is refused, and what was typed stays
	await until(p, `!!document.querySelector('${card(L + 'Part One/The lighthouse keeper.md')}')`);
	const k = await at(p, 'Part One/The lighthouse keeper.md');
	await p.right(k.x, k.y);
	await clickMenu(p, 'Rename');
	await p.key('a', 'ctrl');
	await p.type('Arrival');
	await p.key('Enter');
	await p.sleep(300);
	t.ok(await exists(p, L + 'Part One/The lighthouse keeper.md'), 'not renamed over Arrival');
	t.eq(await p.ev(`document.activeElement.value`), 'Arrival', 'the field keeps the text');
	await p.key('Escape');
}));

test('delete asks first, then trashes', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part Two');
	const c = await at(p, 'Part Two/Lights out.md');
	await p.click(c.x, c.t + 12);
	await p.key('Delete');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/Delete “Lights out”\?/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'asks, naming the note');
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Cancel').click()`);
	await p.sleep(300);
	t.ok(await exists(p, L + 'Part Two/Lights out.md'), 'Cancel keeps it');
	await p.right(c.x, c.y);
	await clickMenu(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Delete').click()`);
	await until(p, `!app.vault.getAbstractFileByPath('The Lighthouse/Part Two/Lights out.md')`);
	await until(p, `!document.querySelector('${card(L + 'Part Two/Lights out.md')}')`);
	t.ok(!(await p.ev(`!!document.querySelector('${card(L + 'Part Two/Lights out.md')}')`)), 'the card is gone');
	t.eq(j(await written(p, '  - Part Two/The wreck\n  - Epilogue')), j(LIST.filter((x) => x !== 'Part Two/Lights out')), 'and so is its entry');
}));

test('status and label from the menu', withTidy(async (p, h, t) => {
	const before = await read(p, L + 'Epilogue.md');
	await openView(p);
	const c = await at(p, 'Epilogue.md');
	await p.right(c.x, c.y);
	t.ok(await p.ev(`!!document.querySelector('.menu .menu-item.has-submenu')`), 'Obsidian’s menus still have submenus (MenuItem.setSubmenu, an internal: see docs/internals.md)');
	await hoverMenu(p, 'Set status');
	const items = await menuItems(p);
	t.eq(j(items.slice(-6)), j(['Idea', 'Draft', 'Revised', 'Done', 'New status...', 'No status']), 'the statuses from settings (the notes’ own “draft” is “Draft”), a new one, and none: ' + items.join(', '));
	await clickMenu(p, 'Revised');
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('status: Revised'))`);
	const d = await at(p, 'Epilogue.md');
	await p.right(d.x, d.y);
	await hoverMenu(p, 'Set label');
	const colors = await menuItems(p);
	t.ok(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'].every((x) => colors.includes(x)), 'the colors: ' + colors.join(', '));
	await clickMenu(p, 'Blue');
	await until(p, `!!document.querySelector('${card(L + 'Epilogue.md')}.mod-label-blue')`);
	// (the label is the card's border: its color is the card's --binders-label)
	const stripe = await p.ev(`(() => { const c = document.querySelector('${card(L + 'Epilogue.md')}'); return (() => { const v = getComputedStyle(c).getPropertyValue('--binders-label').trim(); if (!v) return 'rgba(0, 0, 0, 0)'; const d = document.body.createDiv(); d.style.color = v; const out = getComputedStyle(d).color; d.remove(); return out; })(); })()`);
	const blue = await p.ev(`(() => { const e = document.body.createDiv(); e.style.color = 'var(--color-blue)'; const c = getComputedStyle(e).color; e.remove(); return c; })()`);
	t.eq(stripe, blue, 'the card’s label color is the theme’s blue');
	const text = await read(p, L + 'Epilogue.md');
	t.ok(/label: Blue/.test(text) && /status: Revised/.test(text), 'both written');
	t.eq(split(text).body, split(before).body, 'the body is untouched');
	// a new status, through the dialog
	await p.right(d.x, d.y);
	await hoverMenu(p, 'Set status');
	await clickMenu(p, 'New status...');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.type('final');
	await p.key('Enter');
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('status: final'))`);
	t.ok(true, 'a new status');
}));

test('keyboard: arrows move, Enter opens, Alt+arrows reorder', withTidy(async (p, h, t) => {
	await openView(p);
	// (a pane two cards wide: Prologue and Part One, then Part Two and Epilogue under them)
	await p.send('Emulation.setDeviceMetricsOverride', { width: 900, height: p.height, deviceScaleFactor: 1, mobile: false });
	await p.sleep(400);
	try {
		const rows = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].map(c => Math.round(c.getBoundingClientRect().left))`);
		t.ok(rows[0] === rows[2] && rows[1] === rows[3] && rows[0] < rows[1], 'two cards to a row: ' + rows.join(','));
		const c = await at(p, 'Prologue.md');
		await p.click(c.x, c.t + 12);
		await p.key('ArrowUp', 'alt');
		await p.sleep(300);
		await flush(p);
		t.eq(j(await contents(p)), j(LIST), 'the first card can’t go further up');
		await p.key('ArrowRight');
		t.eq(j(await selected(p)), j([L + 'Part One']), 'right: the next card, a stack as any other');
		await p.key('ArrowDown');
		t.eq(j(await selected(p)), j([L + 'Epilogue.md']), 'down: the card below');
		await p.key('ArrowLeft', 'shift');
		t.eq(j(await selected(p)), j([L + 'Part Two', L + 'Epilogue.md']), 'Shift extends');
		await p.key('Escape');
		t.eq(j(await selected(p)), j([L + 'Part Two']), 'Escape keeps just the focused card');
		await p.key('ArrowDown', 'alt');
		await p.sleep(300);
		t.eq(j(await written(p, '  - Epilogue\n  - Part Two/\n')), j([...LIST.slice(0, 5), 'Epilogue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out']), 'Alt+Down moves the folder one later, with its notes');
		t.eq(await p.ev(`document.activeElement.dataset.path`), L + 'Part Two', 'and it keeps the focus');
		t.ok(await exists(p, L + 'Part Two/The wreck.md'), 'nothing moved on disk');
		await p.key('ArrowLeft');
		t.eq(j(await selected(p)), j([L + 'Epilogue.md']), 'left: the card before, which is Epilogue now');
		await p.key('ArrowLeft', 'alt');
		await p.sleep(300);
		t.eq(j(await written(p, '  - Epilogue\n  - Part One/\n')), j(['Prologue', 'Epilogue', ...LIST.slice(1, 5), 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out']), 'Alt+Left moves a note one earlier: before the folder, not into it');
		t.ok(await exists(p, L + 'Epilogue.md'), 'still in the binder’s own folder');
		await p.key('Enter');
		await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse/Epilogue.md'`);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Epilogue.md', 'Enter opens the note');
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card')`);
		t.eq((await cards(p)).length, 4, 'Back returns to the corkboard');
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await p.sleep(300);
	}
}));

test('double-click opens a note, Ctrl+double-click in a new tab, but not on a synopsis', async (p, h, t) => {
	await openView(p, L + 'Part One');
	let c = await at(p, 'Part One/Arrival.md');
	await p.dbl(c.x, c.t + 12, 2);
	await until(p, `app.workspace.getLeavesOfType('markdown').length === 1`);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.file.path`), L + 'Part One/Arrival.md', 'Ctrl+double-click opens the note');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, 'in a new tab, keeping the corkboard');
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(300);
	c = await at(p, 'Part One/The keeper.md');
	await p.dbl(c.x, c.t + 12);
	await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse/Part One/The keeper.md'`);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 0, 'a double-click opens it in the same tab, as a link would');
	// on the synopsis, a double-click edits instead
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card')`);
	t.eq(await folderShown(p), L + 'Part One', 'Back returns to the folder’s board');
	const s = await p.at(`${card(L + 'Part One/Storm warning.md')} .binders-card-synopsis`);
	await p.dbl(s.x, s.y);
	t.ok(await p.ev(`document.activeElement.matches('textarea')`), 'a double-click on a note’s synopsis edits it');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').length`), 1, 'and opens nothing');
	await p.key('Escape');
	// Ctrl+double-click on a stack: its folder in a new tab
	await openView(p);
	const st = await at(p, 'Part Two');
	await p.dbl(st.x, st.t + 14, 2);
	await until(p, `app.workspace.getLeavesOfType('binders-view').length === 2`);
	t.eq(j(await p.ev(`app.workspace.getLeavesOfType('binders-view').map(l => l.view.getState().folder).sort()`)), j(['The Lighthouse', L + 'Part Two']), 'Ctrl+double-click on a stack opens its folder in a new tab, keeping the board');
});

test('a middle click opens a note in a new tab, and a stack’s folder in a new binder tab', withTidy(async (p, h, t) => {
	await openView(p);
	let c = await at(p, 'Prologue.md');
	await p.click(c.x, c.t + 12, { button: 'middle' });
	await until(p, `app.workspace.getLeavesOfType('markdown').length === 1`);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.file.path`), L + 'Prologue.md', 'the note, in a new tab');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, 'keeping the corkboard');
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(300);
	const st = await at(p, 'Part One');
	await p.click(st.x, st.y, { button: 'middle' });
	await until(p, `app.workspace.getLeavesOfType('binders-view').length === 2`);
	t.ok(await p.ev(`app.workspace.getLeavesOfType('binders-view').some(l => l.view.getState().folder === 'The Lighthouse/Part One')`), 'the stack’s folder, in a new binder tab');
	t.ok(await p.ev(`app.workspace.getLeavesOfType('binders-view').some(l => l.view.getState().folder === 'The Lighthouse')`), 'and the board it was on is still there');
}));

test('editing the synopsis of a card half out of sight scrolls the card into view', withTidy(async (p, h, t) => {
	await openView(p);
	// (a short pane two cards wide, so the board has three rows and scrolls)
	await p.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 420, deviceScaleFactor: 1, mobile: false });
	await p.sleep(300);
	try {
		const sc = `document.querySelector('.workspace-leaf.mod-active .binders-corkboard')`, c = `document.querySelector('${card(L + 'Prologue.md')}')`;
		const pro = await at(p, 'Prologue.md');
		await p.click(pro.x, pro.t + 12);
		// scroll so the card's top is cut off by the top edge
		await p.ev(`(() => { const s = ${sc}; s.scrollTop += ${c}.getBoundingClientRect().top - s.getBoundingClientRect().top + 50; return 1; })()`);
		await p.sleep(200);
		const cut = () => p.ev(`Math.round(${sc}.getBoundingClientRect().top - ${c}.getBoundingClientRect().top) || 0`); // never -0, which doesn't come back
		t.ok(await cut() > 20, 'cut off at first: ' + (await cut()));
		const syn = await p.at(`${card(L + 'Prologue.md')} .binders-card-synopsis`);
		await p.click(syn.x, syn.t + syn.h - 4);
		t.ok(await p.ev(`document.activeElement.matches('textarea')`), 'editing');
		t.ok(await cut() <= 0, 'the whole card shows: ' + (await cut()));
		await p.key('Escape');
	} finally { await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); }
}));

test('Rename in a stack’s menu (or F2) renames the folder on its card; its folder note follows', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', '---\\nsynopsis: Arrivals.\\n---\\n').then(() => 1)`);
	await openView(p);
	await until(p, `document.querySelector('${card(L + 'Part One')} .binders-card-synopsis')?.textContent === 'Arrivals.'`);
	const st = await at(p, 'Part One');
	await p.right(st.x, st.t + 14);
	const items = await menuItems(p);
	t.ok(['Open', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Ungroup', 'Delete'].every((x) => items.includes(x)), 'a stack’s menu is the folder’s: ' + items.join(', '));
	await clickMenu(p, 'Rename');
	t.ok(await p.ev(`document.activeElement.matches('${card(L + 'Part One')} .binders-card-title input')`), 'the stack’s name is a field');
	await p.key('a', 'ctrl');
	await p.type('Book one');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Book one/Book one.md')`, 4000);
	t.ok(!(await exists(p, L + 'Part One')), 'the folder is renamed');
	await until(p, `document.querySelector('${card(L + 'Book one')} .binders-card-title')?.textContent === 'Book one'`);
	t.eq(await p.ev(`document.querySelector('${card(L + 'Book one')} .binders-card-synopsis')?.textContent`), 'Arrivals.', 'its synopsis comes along');
	t.eq(await p.ev(`document.querySelector('${card(L + 'Book one')} .binders-card-words')?.textContent`), '3 notes · 51 words', 'and its notes');
	t.eq(await folderShown(p), 'The Lighthouse', 'the view stays where it was');
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Book one', L + 'Part Two', L + 'Epilogue.md']), 'and the stack keeps its place');
	t.eq(j(await written(p, '  - Book one/Storm warning')), j(LIST.map((x) => x.replace('Part One/', 'Book one/'))), 'as does its entry in the list, with its notes');
	await until(p, `document.activeElement?.dataset?.path === ${j(L + 'Book one')}`);
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? document.activeElement?.className`), L + 'Book one', 'the keyboard stays on the stack');
	// F2 too; Escape cancels
	await p.key('F2');
	t.ok(await p.ev(`document.activeElement.matches('${card(L + 'Book one')} .binders-card-title input')`), 'F2 renames a stack');
	await p.type('Nope');
	await p.key('Escape');
	await p.sleep(300);
	t.ok(await exists(p, L + 'Book one'), 'Escape leaves the name');
	t.ok(!(await exists(p, L + 'Nope')), 'and makes nothing');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Book one')}, 'The Lighthouse/Part One').then(() => 1)`);
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Part One.md')`, 4000);
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('The Lighthouse/Part One/Part One.md')).then(() => 1)`);
	await p.sleep(300);
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('a note dropped on the middle of a stack goes into that folder, at its end; “Undo last move” puts it back', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const e = await at(p, 'Epilogue.md'), s = await at(p, 'Part Two');
	await p.move(e.x, e.t + 12, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: e.x, y: e.t + 12, button: 'left', clickCount: 1 });
	await p.move(s.x, s.y, 12, { buttons: 1 });
	t.ok(await p.ev(`document.querySelector('${card(L + 'Part Two')}').classList.contains('is-being-dragged-over')`), 'the stack shows it will take it');
	t.ok(!(await p.ev(`document.querySelector('.binders-drop-indicator')?.classList.contains('is-active')`)), 'no insertion line');
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: s.x, y: s.y, button: 'left', clickCount: 1 });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Epilogue.md')`);
	await flush(p);
	t.ok(!(await exists(p, L + 'Epilogue.md')), 'the note left the binder’s own folder');
	t.eq(j(await contents(p)), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Epilogue']), 'last in Part Two');
	t.eq(await p.ev(`document.querySelectorAll('.is-being-dragged-over').length`), 0, 'no highlight left');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Epilogue.md']: L + 'Part Two/Epilogue.md' } });
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 3`);
	t.eq(j(await cards(p)), j(BOARD.slice(0, 3)), 'its card is off this board');
	t.eq(await p.ev(`document.querySelector('${card(L + 'Part Two')} .binders-card-words').textContent`), '3 notes · 34 words', 'and the stack counts it');
	// undone
	t.eq(await undo(p), 'Binders: Undo last move', 'there is a move to undo');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Epilogue.md')`);
	await flush(p);
	t.ok(!(await exists(p, L + 'Part Two/Epilogue.md')), 'undone: the note is out of Part Two');
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => /- Part Two\\/Lights out\\n  - Epilogue\\n/.test(s))`);
	t.eq(j(await contents(p)), j(LIST), 'and the list is as it was');
	same(t, before, await texts(p));
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 4`);
	t.eq(j(await cards(p)), j(BOARD), 'the board shows it where it was');
	// and done again
	t.eq(await undo(p, true), 'Binders: Redo last move', 'and to redo');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Epilogue.md')`);
	await flush(p);
	t.eq(j((await contents(p)).slice(-2)), j(['Part Two/Lights out', 'Part Two/Epilogue']), 'redone: last in Part Two again');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Epilogue.md']: L + 'Part Two/Epilogue.md' } });
}));

test('a drop on a stack that can’t be made moves nothing and says why: a name the folder has, a note that would become the folder’s note', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.create('The Lighthouse/Arrival.md', 'Another arrival.'); await app.vault.create('The Lighthouse/Part Two.md', 'A note named as the folder.'); })().then(() => 1)`);
	await until(p, `${B}.orderedChildren(${file('The Lighthouse')}).length === 6`);
	const before = await texts(p);
	await openView(p);
	t.eq(j(await cards(p)), j([...BOARD, L + 'Arrival.md', L + 'Part Two.md']), 'two more notes in the binder’s own folder');
	const notices = () => p.ev(`(() => { const probe = new Notice(''), d = probe.noticeEl.ownerDocument; probe.hide(); return [...d.querySelectorAll('.notice')].map(n => n.textContent).filter(Boolean).join(' | '); })()`);
	for (const [name, to, why] of [['Arrival.md', 'Part One', /already has/], ['Part Two.md', 'Part Two', /folder’s note/]]) {
		const a = await at(p, name), st = await at(p, to);
		await drag(p, { x: a.x, y: a.t + 12 }, { x: st.x, y: st.y });
		await p.sleep(500);
		await flush(p);
		t.ok(why.test(await notices()), `“${name}” onto “${to}”: a notice says why not (${await notices()})`);
		t.ok(await exists(p, L + name), 'the note is where it was');
		same(t, before, await texts(p));
		t.eq(j(await cards(p)), j([...BOARD, L + 'Arrival.md', L + 'Part Two.md']), 'and the board is as it was');
		t.eq(await p.ev(`document.querySelectorAll('.is-being-dragged-over, .binders-drag-ghost, .binders-card.is-dragging').length`), 0, 'with nothing of the drag left');
	}
	t.eq(await read(p, L + 'Part One/Arrival.md'), before[L + 'Part One/Arrival.md'], 'the note of that name in the folder is untouched');
	p.errors.length = 0; // (a refused move is said in a notice; nothing else is wrong)
}));

test('a stack dropped on a stack goes into it: folders nest, the breadcrumb leads out level by level, and the move undoes', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const two = await at(p, 'Part Two'), one = await at(p, 'Part One');
	await hold(p, { x: two.l + 40, y: two.t + 14 }, { x: one.x, y: one.y });
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-being-dragged-over')].map(c => c.dataset.path)`)), j([L + 'Part One']), 'Part One’s stack will take the folder');
	await letGo(p, one);
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Part Two/The wreck.md')`);
	t.ok(!(await exists(p, L + 'Part Two')), 'the folder moved');
	const nested = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Part Two/', 'Part One/Part Two/The wreck', 'Part One/Part Two/Lights out', 'Epilogue'];
	t.eq(j(await written(p, '  - Part One/Part Two/Lights out')), j(nested), 'last in Part One, with its notes');
	const moved = { [L + 'Part Two/The wreck.md']: L + 'Part One/Part Two/The wreck.md', [L + 'Part Two/Lights out.md']: L + 'Part One/Part Two/Lights out.md' };
	same(t, before, await texts(p), { skip: [NOTE], moved });
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 3`);
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Epilogue.md']), 'one stack on the binder’s board now');
	await until(p, `/^5 notes/.test(document.querySelector('${card(L + 'Part One')} .binders-card-words').textContent)`);
	t.eq(await p.ev(`document.querySelector('${card(L + 'Part One')} .binders-card-words').textContent`), '5 notes · 79 words', 'which counts every note under it');
	// down two levels, and out again one at a time
	let s = await at(p, 'Part One');
	await p.dbl(s.x, s.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	await until(p, `!!document.querySelector('${card(L + 'Part One/Part Two')}')`);
	t.eq(j(await cards(p)), j([...PART_ONE, L + 'Part One/Part Two']), 'Part One’s board: its notes, then the folder as a stack');
	s = await at(p, 'Part One/Part Two');
	await p.dbl(s.x, s.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One/Part Two'`);
	t.eq(j(await cards(p)), j([L + 'Part One/Part Two/The wreck.md', L + 'Part One/Part Two/Lights out.md']), 'and its own board inside that');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-crumb')].map(e => e.textContent + (e.dataset.path ? '' : '*'))`)), j(['The Lighthouse', 'Part One', 'Part Two*']), 'the breadcrumb names every folder on the way down');
	const mid = await p.at(crumb(L + 'Part One'));
	await p.click(mid.x, mid.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	t.eq(j(await selected(p)), j([L + 'Part One/Part Two']), 'up one level, on the stack come out of');
	// undone
	t.ok(await undo(p), 'there is a move to undo');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/The wreck.md')`);
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => /\\n  - Part Two\\/\\n/.test(s))`);
	t.eq(j(await contents(p)), j(LIST), 'undone: the list is as it was');
	same(t, before, await texts(p));
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 3`);
	t.eq(j(await cards(p)), j(PART_ONE), 'and Part One’s board has only its notes again');
}));

test('BUG: cards dragged onto a folder in the breadcrumb move out to it, at its end; “Undo last move” puts them back (the drop is thrown away: the breadcrumb is outside the board)', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	const a = await at(p, 'Part One/Arrival.md'), s = await at(p, 'Part One/Storm warning.md'), up = await p.at(crumb('The Lighthouse'));
	t.ok(up, 'the binder is a folder in the breadcrumb');
	await p.click(a.x, a.t + 12);
	await p.click(s.x, s.t + 12, { modifiers: 2 });
	await hold(p, { x: s.x, y: s.t + 12 }, { x: up.x, y: up.y });
	t.ok(await p.ev(`document.querySelector('${crumb('The Lighthouse')}').classList.contains('is-being-dragged-over')`), 'the folder in the breadcrumb shows it will take them');
	t.ok(!(await p.ev(`document.querySelector('.binders-drop-indicator')?.classList.contains('is-active')`)), 'no insertion line on the board meanwhile');
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost.is-multiple .binders-drag-count')?.textContent`), '2', 'both are carried');
	await letGo(p, up);
	await until(p, `app.vault.adapter.exists('The Lighthouse/Arrival.md') && app.vault.adapter.exists('The Lighthouse/Storm warning.md')`);
	await p.sleep(300);
	t.ok(!(await exists(p, L + 'Part One/Arrival.md')) && !(await exists(p, L + 'Part One/Storm warning.md')), 'both left Part One');
	t.eq(j(await written(p, '  - Epilogue\n  - Arrival\n  - Storm warning')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue', 'Arrival', 'Storm warning']), 'at the end of the binder, in their order');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Arrival.md']: L + 'Arrival.md', [L + 'Part One/Storm warning.md']: L + 'Storm warning.md' } });
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 1`);
	t.eq(j(await cards(p)), j([L + 'Part One/The keeper.md']), 'only The keeper is left on Part One’s board');
	t.eq(await folderShown(p), L + 'Part One', 'which is still the folder shown');
	t.eq(await p.ev(`document.querySelectorAll('.is-being-dragged-over, .binders-drag-ghost, .binders-drop-indicator').length`), 0, 'nothing of the drag is left');
	// undone, one move at a time or both at once: back where they were
	for (let i = 0; i < 2 && !(await exists(p, L + 'Part One/Arrival.md') && await exists(p, L + 'Part One/Storm warning.md')); i++) { t.ok(await undo(p), 'there is a move to undo'); await p.sleep(600); }
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Arrival.md') && app.vault.adapter.exists('The Lighthouse/Part One/Storm warning.md')`);
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => /- Part One\\/Arrival\\n  - Part One\\/The keeper\\n  - Part One\\/Storm warning\\n/.test(s))`);
	t.eq(j(await contents(p)), j(LIST), 'undone: the list is as it was');
	same(t, before, await texts(p));
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 3`);
	t.eq(j(await cards(p)), j(PART_ONE), 'and Part One’s board has its three cards, in order');
	// a card let go on the folder shown itself (the last crumb) moves nothing
	const k = await at(p, 'Part One/The keeper.md'), here = await p.at('.workspace-leaf.mod-active .binders-crumb.is-current');
	await hold(p, { x: k.x, y: k.t + 12 }, { x: here.x, y: here.y });
	t.eq(await p.ev(`document.querySelectorAll('.binders-crumb.is-being-dragged-over').length`), 0, 'the folder shown takes no drop of its own cards');
	await letGo(p, here);
	await p.sleep(500);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'let go there: nothing moved');
	same(t, before, await texts(p));
}));

// Reloads Obsidian twice (into mobile and back), so it is last in this file.
// ---- how a drag looks: Obsidian's own reordering (the card follows the pointer, a slot holds its place, a line) ----

/** Presses a card and moves to a point with the button held, in steps, as a person would. */
async function hold(p, from, to) {
	await p.move(from.x, from.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
	await p.move(to.x, to.y, 12, { buttons: 1 });
	await p.sleep(150);
}
const letGo = async (p, at) => { await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }); };
const rectOf = (p, sel) => p.ev(`(() => { const r = document.querySelector(${j(sel)})?.getBoundingClientRect(); return r ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } : null; })()`);

test('a dragged card follows the pointer, a slot holds its place, and a line shows where it goes (a row’s end too)', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part One');
	const a = await at(p, 'Part One/Arrival.md'), k = await at(p, 'Part One/The keeper.md'), s = await at(p, 'Part One/Storm warning.md');
	const grab = { x: a.l + 30, y: a.t + 12 };
	// past the middle of the last card in the row: after it
	await hold(p, grab, { x: s.x + 40, y: s.y });
	const ghost = await rectOf(p, '.binders-drag-ghost > .binders-card');
	t.ok(ghost && Math.abs(ghost.w - a.w) <= 1 && Math.abs(ghost.h - a.h) <= 1, 'the card itself follows the pointer, at its own size');
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost .binders-card-title')?.textContent`), 'Arrival', 'with its title');
	t.ok(Math.abs(ghost.l + 30 - (s.x + 40)) <= 2 && Math.abs(ghost.t + 12 - s.y) <= 2, 'held where it was taken hold of');
	t.ok(await p.ev(`document.querySelector('.drag-reorder-ghost.binders-drag-ghost > .mod-dragged-item') !== null && document.body.classList.contains('is-grabbing')`), 'drawn as Obsidian draws an item being reordered');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-dragging')].map(c => c.dataset.path)`)), j([L + 'Part One/Arrival.md']), 'its place is held by a slot');
	t.eq(await p.ev(`getComputedStyle(document.querySelector('${card(L + 'Part One/Arrival.md')} .binders-card-title')).visibility`), 'hidden', 'which shows nothing of the card');
	let line = await rectOf(p, '.binders-drop-indicator.is-active');
	t.ok(line && line.l > s.l + s.w && line.l < s.l + s.w + 12 && Math.abs(line.t - s.t) <= 1 && Math.abs(line.h - s.h) <= 1, `the line is just past the row’s last card, as tall as the row (${j(line)})`);
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost').contains(document.elementFromPoint(${s.x + 40}, ${s.y}))`), false, 'the card under the pointer takes no clicks');
	// between two cards: in the gap between them
	await p.move(k.l + 20, k.y, 6, { buttons: 1 });
	await p.sleep(120);
	line = await rectOf(p, '.binders-drop-indicator.is-active');
	t.eq(line, null, 'no line where the card already is (before the card after it)');
	await p.move(s.l + 20, s.y, 6, { buttons: 1 });
	await p.sleep(120);
	line = await rectOf(p, '.binders-drop-indicator.is-active');
	t.ok(line && line.l > k.l + k.w && line.r < s.l + 1, `the line is in the gap before Storm warning (${j(line)})`);
	// back over itself: nothing to do, and letting go puts it back
	await p.move(a.x, a.y, 6, { buttons: 1 });
	await p.sleep(120);
	t.eq(await rectOf(p, '.binders-drop-indicator.is-active'), null, 'no line over its own place');
	await letGo(p, a);
	await p.sleep(500);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .binders-card.is-dragging').length`), 0, 'nothing of the drag is left');
	t.ok(!(await p.ev(`document.body.classList.contains('is-grabbing')`)), 'and the pointer is back to normal');
}));

test('dropped cards glide to their places, and the others make room; with reduced motion they just show', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part One');
	const moving = () => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].filter(c => c.getAnimations().some(a => !(a instanceof CSSTransition))).map(c => c.dataset.path.split('/').pop())`);
	let a = await at(p, 'Part One/Storm warning.md'), b = await at(p, 'Part One/Arrival.md');
	await hold(p, { x: a.x, y: a.t + 12 }, { x: b.l + 10, y: b.y });
	await letGo(p, { x: b.l + 10, y: b.y });
	await until(p, `document.querySelectorAll('.binders-drag-ghost').length === 0`);
	const glide = await moving();
	t.ok(['Storm warning.md', 'Arrival.md', 'The keeper.md'].every((n) => glide.includes(n)), 'the dropped card and the two it passed are on their way: ' + glide.join(', '));
	t.ok(await p.ev(`document.querySelector('${card(L + 'Part One/Storm warning.md')}').classList.contains('is-landing')`), 'the dropped one over the others');
	await until(p, `document.querySelectorAll('.binders-card.is-landing').length === 0`);
	t.eq(j(await cards(p)), j(['Storm warning', 'Arrival', 'The keeper'].map((x) => L + 'Part One/' + x + '.md')), 'in their new order');
	const now = await at(p, 'Part One/Storm warning.md');
	t.ok(Math.abs(now.l - b.l) <= 1 && Math.abs(now.t - b.t) <= 1, `and the dropped card is where Arrival was (${j(now)} vs ${j(b)})`);
	// "reduce motion": no gliding
	await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
	try {
		a = await at(p, 'Part One/The keeper.md'); b = await at(p, 'Part One/Storm warning.md');
		await hold(p, { x: a.x, y: a.t + 12 }, { x: b.l + 10, y: b.y });
		await letGo(p, { x: b.l + 10, y: b.y });
		await until(p, `document.querySelectorAll('.binders-drag-ghost').length === 0`);
		t.eq(j(await moving()), j([]), 'nothing glides when the system asks for less motion');
		t.eq(j(await cards(p)), j(['The keeper', 'Storm warning', 'Arrival'].map((x) => L + 'Part One/' + x + '.md')), 'the move is still made');
	} finally { await p.send('Emulation.setEmulatedMedia', { features: [] }); }
}));

test('several cards dragged at once say how many, and the stack they would go into is tinted', withTidy(async (p, h, t) => {
	await openView(p);
	const a = await at(p, 'Prologue.md'), e = await at(p, 'Epilogue.md'), two = await at(p, 'Part Two'), one = await at(p, 'Part One');
	await p.click(a.x, a.t + 12);
	await p.click(e.x, e.t + 12, { modifiers: 2 });
	await hold(p, { x: e.x, y: e.t + 12 }, { x: two.x, y: two.y });
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost.is-multiple .binders-drag-count')?.textContent`), '2', 'the count');
	// (a pile: the top card drawn twice more, a step down and across each time, with the ring the top one has)
	const pile = await p.ev(`getComputedStyle(document.querySelector('.binders-drag-ghost.is-multiple > .binders-card')).boxShadow`);
	t.ok(/ 6px 6px 0px 2px/.test(pile) && / 12px 12px 0px 2px/.test(pile) && /^\S.* 0px 0px 0px 2px/.test(pile), `the cards in hand are a pile: two under the top one, equal steps apart, each with its two-pixel ring (${pile})`);
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-dragging').length`), 2, 'both places are held');
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-being-dragged-over')].map(c => c.dataset.path)`)), j([L + 'Part Two']), 'Part Two’s stack is tinted');
	t.eq(await rectOf(p, '.binders-drop-indicator.is-active'), null, 'and there is no line: they go into it, not beside it');
	// over the other stack: that one instead
	await p.move(one.x, one.y, 8, { buttons: 1 });
	await p.sleep(120);
	t.eq(j(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-being-dragged-over')].map(c => c.dataset.path)`)), j([L + 'Part One']), 'then Part One’s, alone');
	// at a stack's edge: a line beside it, and no stack tinted
	await p.move(two.l + 10, two.y, 8, { buttons: 1 });
	await p.sleep(120);
	t.eq(await p.ev(`document.querySelectorAll('.is-being-dragged-over').length`), 0, 'at a stack’s edge no stack is tinted');
	const line = await rectOf(p, '.binders-drop-indicator.is-active');
	t.ok(line && line.l < two.l && line.l > one.l + one.w, `a line shows between the stacks instead (${j(line)})`);
	await p.move(a.x, a.y, 8, { buttons: 1 });
	await p.sleep(120);
	t.eq(await p.ev(`document.querySelectorAll('.is-being-dragged-over').length`), 0, 'nor over their own place');
	await p.key('Escape');
	await letGo(p, a);
	await p.sleep(400);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'Escape: nothing moved');
	t.ok(await exists(p, L + 'Prologue.md') && await exists(p, L + 'Epilogue.md'), 'on disk either');
	// a stack can't be dropped on itself, or into what it's carried with
	const s2 = await at(p, 'Part Two');
	await hold(p, { x: s2.l + 40, y: s2.t + 14 }, { x: s2.x + 6, y: s2.y + 6 });
	t.eq(await p.ev(`document.querySelectorAll('.is-being-dragged-over').length`), 0, 'a stack held over its own place takes nothing');
	await letGo(p, { x: s2.x + 6, y: s2.y + 6 });
	await p.sleep(400);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'and nothing moved');
}));

// ---- new folders, card size, the board's menu, other plugins' items ----

test('New folder (the toolbar’s New): made last, as a stack named in place, and written to the list', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const btn = await p.at(`.workspace-leaf.mod-active .binders-new-button`);
	await p.click(btn.x, btn.y);
	await p.sleep(200);
	t.eq(j(await menuItems(p)), j(['New note', 'New folder']), 'the New menu');
	await clickMenu(p, 'New folder');
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-card.is-stack .binders-card-title input')`);
	t.eq(await p.ev(`document.activeElement.value`), 'Untitled', 'the new folder’s name is ready to type over, on its stack');
	await p.type('Part Three');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Three')`);
	t.ok(!(await exists(p, 'The Lighthouse/Untitled')), 'renamed, not copied');
	t.eq(j(await written(p, '  - Part Three/')), j([...LIST, 'Part Three/']), 'last in the list');
	await until(p, `!!document.querySelector('${card(L + 'Part Three')}')`);
	t.eq(j(await cards(p)), j([...BOARD, L + 'Part Three']), 'and shown as a stack, after the last card');
	t.eq(await p.ev(`document.querySelector('${card(L + 'Part Three')} .binders-card-words').textContent`), '0 notes · 0 words', 'an empty one');
	same(t, before, await texts(p), { skip: [NOTE] });
	// it's gone into as any other, and a note made there is in it
	const st = await at(p, 'Part Three');
	await p.dbl(st.x, st.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part Three'`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card-new')`);
	t.eq(j(await cards(p)), j([]), 'its board is empty');
	const tile = await p.at('.workspace-leaf.mod-active .binders-card-new');
	await p.click(tile.x, tile.y);
	await p.type('Afterword');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Three/Afterword.md')`);
	await p.key('Escape');
	t.eq(j((await written(p, '  - Part Three/Afterword')).slice(-2)), j(['Part Three/', 'Part Three/Afterword']), 'a note made on its board goes into it');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('“New folder from selection” makes a stack of the selected cards, named in place; “Ungroup” puts what a stack holds back on the board', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const pro = await at(p, 'Prologue.md'), epi = await at(p, 'Epilogue.md');
	await p.click(pro.x, pro.t + 12);
	await p.click(epi.x, epi.t + 12, { modifiers: 2 });
	await p.right(epi.x, epi.y);
	await clickMenu(p, 'New folder from selection');
	await until(p, `document.activeElement?.matches('.workspace-leaf.mod-active .binders-card.is-stack .binders-card-title input')`);
	t.eq(await p.ev(`document.activeElement.value`), 'Untitled', 'a new stack, its name ready to type over');
	await p.type('Frame');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Frame/Prologue.md') && app.vault.adapter.exists('The Lighthouse/Frame/Epilogue.md')`);
	t.ok(!(await exists(p, L + 'Untitled')) && !(await exists(p, L + 'Prologue.md')) && !(await exists(p, L + 'Epilogue.md')), 'both notes are in the folder, under its new name');
	t.eq(j(await written(p, '  - Frame/\n  - Frame/Prologue\n  - Frame/Epilogue\n')), j(['Frame/', 'Frame/Prologue', 'Frame/Epilogue', ...LIST.slice(1, 8)]), 'the folder is where the first of them was, with both in it, in order');
	const moved = { [L + 'Prologue.md']: L + 'Frame/Prologue.md', [L + 'Epilogue.md']: L + 'Frame/Epilogue.md' };
	same(t, before, await texts(p), { skip: [NOTE], moved });
	await until(p, `document.querySelector('${card(L + 'Frame')} .binders-card-words')?.textContent === '2 notes · 27 words'`);
	t.eq(j(await cards(p)), j([L + 'Frame', L + 'Part One', L + 'Part Two']), 'the board shows the stack in their place');
	t.eq(await p.ev(`document.querySelector('${card(L + 'Frame')} .binders-card-words').textContent`), '2 notes · 27 words', 'counting them');
	// ungrouped: its notes come out, after it
	const st = await at(p, 'Frame');
	await p.right(st.x, st.t + 14);
	await clickMenu(p, 'Ungroup');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Prologue.md') && app.vault.adapter.exists('The Lighthouse/Epilogue.md')`);
	await flush(p);
	t.ok(!(await exists(p, L + 'Frame/Prologue.md')) && !(await exists(p, L + 'Frame/Epilogue.md')), 'ungrouped: the notes are out of the folder');
	same(t, before, await texts(p), { skip: [NOTE] });
	const list = await contents(p);
	t.eq(j(list.filter((x) => x !== 'Frame/')), j(['Prologue', 'Epilogue', ...LIST.slice(1, 8)]), 'in the binder’s own folder again, in their order, where the folder is');
	await until(p, `!!document.querySelector('${card(L + 'Prologue.md')}') && !!document.querySelector('${card(L + 'Epilogue.md')}')`);
	t.eq(j((await cards(p)).filter((x) => x !== L + 'Frame')), j([L + 'Prologue.md', L + 'Epilogue.md', L + 'Part One', L + 'Part Two']), 'and they are cards on the board again');
	t.eq(split((await texts(p))[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is untouched');
}));

test('card size, from the board’s own menu, is kept with the view', withTidy(async (p, h, t) => {
	await openView(p);
	const width = () => p.ev(`document.querySelector('${card(L + 'Prologue.md')}').getBoundingClientRect().width`);
	const medium = await width();
	// a right-click on the board, away from any card (below them: one row of cards fills the board's width)
	const box = await rectOf(p, '.workspace-leaf.mod-active .binders-corkboard');
	const board = { r: box.r, t: box.b - 80 };
	await p.right(board.r - 30, board.t + 40);
	const items = await menuItems(p);
	t.eq(j(items), j(['New note', 'New folder', 'Card size', 'Tint cards with their label color', 'Number the cards']), 'the board’s menu');
	await hoverMenu(p, 'Card size');
	await clickMenu(p, 'Large');
	await p.sleep(200);
	t.ok(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-board').classList.contains('mod-cards-large')`), 'the board shows large cards');
	t.ok((await width()) > medium + 40, 'which are wider');
	t.eq(await p.ev(`${VIEW}.getState().options.cardSize`), 'large', 'the size is kept with the view');
	await closeMenus(p);
	await p.right(board.r - 30, board.t + 40);
	await hoverMenu(p, 'Card size');
	await clickMenu(p, 'Small');
	await p.sleep(200);
	t.ok((await width()) < medium, 'small cards are narrower');
	await closeMenus(p);
}));

test('a card’s menu has what other plugins add for its note, and not Binders’ own explorer items', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part One');
	await p.ev(`(() => { window.__ref = app.workspace.on('file-menu', (menu, file, source) => menu.addItem((i) => i.setTitle('Plugin item: ' + file.path + ' from ' + source))); window.__refs = app.workspace.on('files-menu', (menu, files, source) => menu.addItem((i) => i.setTitle('Plugin item: ' + files.length + ' files from ' + source))); return 1; })()`);
	try {
		const c = await at(p, 'Part One/The keeper.md');
		await p.right(c.x, c.y);
		let items = await menuItems(p);
		t.ok(items.includes('Plugin item: The Lighthouse/Part One/The keeper.md from binders-card'), 'another plugin’s item for the note: ' + items.join(', '));
		t.eq(items.filter((x) => x === 'Move up').length, 1, '“Move up” once (the card’s own)');
		t.ok(!items.includes('New scene here') && !items.includes('Open binder'), 'none of Binders’ items for the file explorer');
		await closeMenus(p);
		// several cards: the event for several files
		const a = await at(p, 'Part One/Arrival.md');
		await p.click(a.x, a.t + 12);
		await p.click(c.x, c.t + 12, { modifiers: 2 });
		await p.right(c.x, c.y);
		items = await menuItems(p);
		t.ok(items.includes('Plugin item: 2 files from binders-card'), 'and for a selection: ' + items.join(', '));
		await closeMenus(p);
	} finally { await p.ev(`(() => { app.workspace.offref(window.__ref); app.workspace.offref(window.__refs); return 1; })()`); }
}));

test('mobile: one column, tap to open, long press for the menu, long press and drag to move', withTidy(async (p, h, t) => {
	const touch = async (type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
	await reload(p, true);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try {
		const before = await texts(p);
		const tap = async (x, y) => { await touch('touchStart', x, y); await p.sleep(40); await touch('touchEnd'); await p.sleep(400); };
		// the binder's board: a tap on a stack's name goes into the folder
		await openView(p);
		t.eq(j(await cards(p)), j(BOARD), 'the binder’s board: its notes and a stack for each folder');
		const name = await p.at(`${card(L + 'Part One')} .binders-card-title`);
		await tap(name.x, name.y);
		await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
		t.eq(await folderShown(p), L + 'Part One', 'a tap on a stack’s name goes into the folder');
		await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 3`);
		t.eq(j(await cards(p)), j(PART_ONE), 'with its notes as cards');
		const upArrow = await p.at(`.workspace-leaf.mod-active .binders-crumb-up[data-path="The Lighthouse"]`);
		t.ok(upArrow && upArrow.w > 0, 'and the way back up is an arrow in the toolbar');
		const theme = await p.ev(`document.body.hasClass('theme-dark') ? 'dark' : 'light'`);
		await p.shot(`test-dist/mobile-corkboard-${theme}.png`);
		const lefts = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card')].map(c => Math.round(c.getBoundingClientRect().left))`);
		t.ok(lefts.every((x) => x === lefts[0]), 'one column: ' + lefts.join(','));
		// a swipe scrolls and doesn't drag
		let a = await at(p, 'Part One/Arrival.md');
		await touch('touchStart', a.x, a.y);
		for (let i = 1; i <= 6; i++) { await touch('touchMove', a.x, a.y - i * 15); await p.sleep(16); }
		await touch('touchEnd');
		await p.sleep(300);
		t.eq(j(await contents(p)), j(LIST), 'a swipe moves nothing');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'and opens no menu');
		// long press, no move: the menu
		a = await at(p, 'Part One/Arrival.md');
		await touch('touchStart', a.x, a.y);
		await p.sleep(700);
		await touch('touchEnd');
		await p.sleep(300);
		t.ok((await menuItems(p)).includes('Set status'), 'a long press opens the menu');
		await p.shot(`test-dist/mobile-menu-${theme}.png`);
		// "Select more": taps then add cards to the selection, or take them out, instead of opening them
		t.eq((await menuItems(p))[0], 'Select more', 'by touch the menu starts with “Select more”');
		await clickMenu(p, 'Select more');
		await closeMenus(p);
		let kt = await p.at(`${card(L + 'Part One/The keeper.md')} .binders-card-title`);
		await tap(kt.x, kt.y);
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md', L + 'Part One/The keeper.md']), 'then a tap on another card adds it to the selection');
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path ?? null`), null, 'and opens nothing');
		await tap(kt.x, kt.y);
		t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), 'a tap on a selected card takes it out');
		const at0 = await p.at(`${card(L + 'Part One/Arrival.md')} .binders-card-title`);
		await tap(at0.x, at0.y);
		t.eq(j(await selected(p)), j([]), 'and with none left, selecting is over');
		// long press, then drag Arrival below Storm warning
		a = await at(p, 'Part One/Arrival.md');
		const s = await at(p, 'Part One/Storm warning.md');
		await touch('touchStart', a.x, a.y);
		await p.sleep(650);
		for (let i = 1; i <= 12; i++) { await touch('touchMove', a.x, a.y + (s.t + s.h * 0.8 - a.y) * i / 12); await p.sleep(20); }
		await touch('touchEnd');
		await p.sleep(400);
		t.eq(j(await written(p, '  - Part One/Storm warning\n  - Part One/Arrival')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'a long press and drag moves it');
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'without a menu');
		// a tap on a title opens the note
		const k = await p.at(`${card(L + 'Part One/The keeper.md')} .binders-card-title`);
		await touch('touchStart', k.x, k.y);
		await touch('touchEnd');
		await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse/Part One/The keeper.md'`);
		t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Part One/The keeper.md', 'a tap on the title opens it');
		same(t, before, await texts(p), { skip: [NOTE] });
	} finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		// leave no mobile layout behind: the next test in mobile starts as this one did (with the explorer loaded)
	}
	t.ok(!(await p.ev(`app.isMobile`)), 'back on desktop');
}));

test('a stack’s menu: “Edit synopsis” edits the folder’s synopsis on its card; “Delete” asks, then trashes the folder and keeps the focus', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const hd = await at(p, 'Part One');
	await p.right(hd.x, hd.t + 14);
	const items = await menuItems(p);
	t.ok(items.includes('Edit synopsis') && items.includes('Delete') && items.indexOf('Delete') === items.length - 1, 'the stack’s menu has Edit synopsis, and Delete last: ' + items.join(', '));
	await clickMenu(p, 'Edit synopsis');
	await until(p, `document.activeElement?.closest('${card(L + 'Part One')} .binders-card-synopsis') != null`);
	t.ok(await p.ev(`document.activeElement.matches('textarea')`), 'the stack’s synopsis is a field');
	await p.type('Mara lands.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.exists(${j(L + 'Part One/Part One.md')})`);
	await until(p, `app.metadataCache.getFileCache(${file(L + 'Part One/Part One.md')})?.frontmatter?.synopsis === 'Mara lands.'`);
	t.eq(await p.ev(`app.metadataCache.getFileCache(${file(L + 'Part One/Part One.md')})?.frontmatter?.synopsis`), 'Mara lands.', 'written to the folder’s note (made for it)');
	same(t, before, await texts(p), { skip: [L + 'Part One/Part One.md'] });
	// delete: asked first; Cancel leaves everything
	await until(p, `document.querySelector('${card(L + 'Part One')} .binders-card-synopsis')?.textContent === 'Mara lands.'`);
	const hd2 = await at(p, 'Part One');
	await p.right(hd2.x, hd2.t + 14);
	await clickMenu(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/Delete “Part One” and the 3 notes in it\?/.test(await p.ev(`document.querySelector('.modal').textContent`)), 'it asks, naming the folder and what goes with it');
	await p.ev(`(() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Cancel').click(); return 1; })()`);
	await p.sleep(300);
	t.ok(await exists(p, L + 'Part One/Arrival.md'), 'Cancel deletes nothing');
	await p.right(hd2.x, hd2.t + 14);
	await clickMenu(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`(() => { const b = [...document.querySelectorAll('.modal button')]; (b.find(x => x.classList.contains('mod-destructive')) ?? b.find(x => /delete|trash/i.test(x.textContent))).click(); return 1; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(L + 'Part One')})`);
	t.ok(!(await exists(p, L + 'Part One')), 'the folder is gone, with what was in it');
	await until(p, `document.activeElement?.closest('.workspace-leaf.mod-active .binders-card') != null`);
	t.eq(await p.ev(`document.activeElement?.closest('.binders-card')?.dataset.path`), L + 'Part Two', 'the focus is on the card that came after the stack');
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => !s.includes('Part One/'))`);
	t.eq(j(await contents(p)), j(['Prologue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'and the list no longer has them');
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part Two', L + 'Epilogue.md']), 'nor the board');
}));

test('a filter hides the notes that don’t pass, on the board and in the folders gone into; the folders stay', withTidy(async (p, h, t) => {
	await openView(p);
	const f = await p.at('.workspace-leaf.mod-active .binders-filter-button');
	await p.click(f.x, f.y);
	await clickMenu(p, 'Revised');
	await closeMenus(p);
	await until(p, `!document.querySelector('${card(L + 'Prologue.md')}')`);
	t.eq(j(await cards(p)), j([L + 'Part One', L + 'Part Two']), 'the notes the filter hides are off the board; the folders stay');
	const s = await at(p, 'Part One');
	await p.dbl(s.x, s.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 1`);
	t.eq(j(await cards(p)), j([L + 'Part One/Arrival.md']), 'gone into, the folder shows the one note that passes');
	// back out, with the filter still on: a stack drawn afresh says how many of its notes show
	const up = await p.at(crumb('The Lighthouse'));
	await p.click(up.x, up.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	await until(p, `!!document.querySelector('${card(L + 'Part One')} .binders-card-words')`);
	t.eq(await p.ev(`document.querySelector('${card(L + 'Part One')} .binders-card-words').textContent`), '1 of 3 notes · 18 words', 'a stack counts the notes that show');
}));

test('BUG: with a filter put on, a stack counts the notes that show (“1 of 3 notes”) and their words (it keeps the count it had: a stack’s card isn’t drawn again when the filter changes)', withTidy(async (p, h, t) => {
	await openView(p);
	const count = () => p.ev(`document.querySelector('${card(L + 'Part One')} .binders-card-words').textContent`);
	t.eq(await count(), '3 notes · 51 words', 'all of them, with no filter');
	// Filter → Revised, from the toolbar
	const f = await p.at('.workspace-leaf.mod-active .binders-filter-button');
	await p.click(f.x, f.y);
	await clickMenu(p, 'Revised');
	await closeMenus(p);
	await until(p, `!document.querySelector('${card(L + 'Prologue.md')}')`);
	await until(p, `/ of /.test(document.querySelector('${card(L + 'Part One')} .binders-card-words').textContent)`);
	t.eq(await count(), '1 of 3 notes · 18 words', 'only Arrival is revised');
	// and cleared again
	await p.click(f.x, f.y);
	await clickMenu(p, 'Clear filter');
	await closeMenus(p);
	await until(p, `!!document.querySelector('${card(L + 'Prologue.md')}')`);
	await until(p, `!/ of /.test(document.querySelector('${card(L + 'Part One')} .binders-card-words').textContent)`);
	t.eq(await count(), '3 notes · 51 words', 'cleared: all of them again');
}));

test('keyboard: Mod+arrows move the focus and leave the selection; Space adds the focused card to it or takes it out', withTidy(async (p, h, t) => {
	await openView(p);
	const c = await p.at(card(L + 'Prologue.md'));
	await p.click(c.x, c.t + 12);
	const focus = () => p.ev(`document.activeElement?.closest('.binders-card')?.dataset.path ?? null`);
	await p.key('ArrowRight', 'ctrl');
	t.eq(await focus(), L + 'Part One', 'Mod+Right moves the focus to the next card');
	t.eq(j(await selected(p)), j([L + 'Prologue.md']), 'and the selection stays');
	await p.key('ArrowRight', 'ctrl');
	await p.key(' ');
	t.eq(j(await selected(p)), j([L + 'Prologue.md', L + 'Part Two']), 'Space adds the focused card');
	t.eq(await focus(), L + 'Part Two', 'the focus stays on it');
	await p.key(' ');
	t.eq(j(await selected(p)), j([L + 'Prologue.md']), 'Space again takes it out');
	t.eq(await p.ev(`getComputedStyle(document.activeElement).outlineStyle !== 'none' || getComputedStyle(document.activeElement).boxShadow !== 'none'`), true, 'the focused card shows where the focus is');
	// a plain arrow selects again, as before
	await p.key('ArrowRight');
	t.eq(j(await selected(p)), j([L + 'Epilogue.md']), 'a plain arrow selects the card it goes to');
	// Space on the only selected card keeps it selected
	await p.key(' ');
	t.eq(j(await selected(p)), j([L + 'Epilogue.md']), 'the last selected card stays selected');
	// Mod+A: every card of the folder shown
	await p.key('a', 'ctrl');
	t.eq(j(await selected(p)), j(BOARD), 'Mod+A selects every card on the board, stacks too');
}));

test('“Number the cards” shows each note’s place in the order, follows a move, and is kept with the view', withTidy(async (p, h, t) => {
	await openView(p);
	const nums = () => p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].map(c => { const n = c.querySelector('.binders-card-number'); return (n && getComputedStyle(n).display !== 'none' ? n.textContent : '') + ' ' + c.querySelector('.binders-card-title').textContent; })`);
	t.eq(j(await nums()), j([' Prologue', ' Part One', ' Part Two', ' Epilogue']), 'no numbers at first');
	const box = await rectOf(p, '.workspace-leaf.mod-active .binders-corkboard');
	await p.right(box.r - 30, box.b - 40);
	await clickMenu(p, 'Number the cards');
	await p.sleep(300);
	t.eq(j(await nums()), j(['1 Prologue', ' Part One', ' Part Two', '2 Epilogue']), 'the notes are numbered in order; a stack has no number, and the notes around it count on');
	// a move renumbers
	await p.ev(`${B}.put([${file(L + 'Epilogue.md')}], ${file('The Lighthouse')}, ${file(L + 'Prologue.md')}).then(() => 1)`);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]')?.dataset.path === ${j(L + 'Epilogue.md')}`);
	await p.sleep(600);
	t.eq(j(await nums()), j(['1 Epilogue', '2 Prologue', ' Part One', ' Part Two']), 'a move renumbers them');
	t.eq((await viewState(p)).options?.numbers, true, 'the choice is kept with the view');
	// in a folder: its own notes, from one
	const s = await at(p, 'Part One');
	await p.dbl(s.x, s.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 3`);
	t.eq(j(await nums()), j(['1 Arrival', '2 The keeper', '3 Storm warning']), 'gone into, a folder’s notes are numbered from one, and the choice comes along');
}));

test('a labeled folder’s card has a labeled card’s edge and tint, and no pile; a selected card’s ring is its own color', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	// from the stack's own menu: the label goes to the folder's note
	const st = await at(p, 'Part One');
	await p.right(st.x, st.t + 14);
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Blue');
	await until(p, `document.querySelector('${card(L + 'Part One')}')?.classList.contains('mod-label-blue')`);
	t.ok(await p.ev(`document.querySelector('${card(L + 'Part One')}').classList.contains('has-label')`), 'the stack has the label');
	t.ok(/label: Blue/.test(await read(p, L + 'Part One/Part One.md')), 'written to the folder’s note');
	same(t, before, await texts(p));
	await closeMenus(p);
	// nothing selected or pointed at, so only the label colors the cards
	const box = await rectOf(p, '.workspace-leaf.mod-active .binders-corkboard');
	await p.click(box.r - 40, box.b - 40);
	await p.sleep(400);
	/** A card's box-shadow: its outline, then its label line (then, for several cards carried, the pile). */
	const shadowOf = (path) => p.ev(`getComputedStyle(document.querySelector('${card(L + path)}')).boxShadow`);
	const mix = (css) => p.ev(`(() => { const e = document.querySelector('.workspace-leaf.mod-active .binders-board').createDiv(); e.style.color = ${j(css)}; const c = getComputedStyle(e).color; e.remove(); return c; })()`);
	const edge = await mix('color-mix(in oklch, var(--color-blue) 70%, transparent)');
	const face = await mix('color-mix(in oklch, var(--color-blue) 7%, var(--bases-cards-background, var(--background-primary)))');
	const blue = await shadowOf('Part One'), plain = await shadowOf('Part Two');
	t.ok(blue.startsWith(edge + ' 0px 0px 0px 1px, ' + edge + ' 0px 0px 0px 1px inset'), `a labeled folder’s card has a labeled card’s edge, a pixel outside and a pixel inside: ${blue}`);
	// a folder's card is a card: nothing is drawn under it, with a label or without
	const offsets = (sh) => (sh.match(/-?\d+(?:\.\d+)?px -?\d+(?:\.\d+)?px -?\d+(?:\.\d+)?px -?\d+(?:\.\d+)?px/g) ?? []).filter((o) => !/^0px 0px 0px /.test(o));
	t.eq(j([offsets(blue), offsets(plain)]), j([[], []]), 'no cards are drawn under a folder’s card');
	t.eq(plain, await shadowOf('Epilogue.md'), 'a folder’s card with no label has the edge of a note’s');
	t.ok(!plain.includes(edge), 'and none of the label’s color');
	const bg = (path) => p.ev(`getComputedStyle(document.querySelector('${card(L + path)}')).backgroundColor`);
	t.eq(await bg('Part One'), face, 'tinted, its face takes a little of the label’s color');
	t.ok((await bg('Part Two')) !== face, 'the stack with no label is not');
	// selected: a ring two pixels wide in the label's color; without a label, in the color of quiet text
	const one = await at(p, 'Part One');
	await p.click(one.x, one.t + 14);
	await p.sleep(400);
	const ring = await p.ev(`getComputedStyle(document.querySelector('${card(L + 'Part One')}')).boxShadow`);
	const full = await mix('var(--color-blue)');
	t.ok(ring.startsWith(full + ' 0px 0px 0px 2px'), `a selected labeled stack’s ring is its label’s color, two pixels wide: ${ring}`);
	const two = await at(p, 'Part Two');
	await p.click(two.x, two.t + 14);
	await p.sleep(400);
	const quiet = await mix('var(--text-muted)'), accent = await mix('var(--interactive-accent)');
	const ring2 = await p.ev(`getComputedStyle(document.querySelector('${card(L + 'Part Two')}')).boxShadow`);
	t.ok(ring2.startsWith(quiet + ' 0px 0px 0px 2px'), `a selected stack with no label has a quiet ring: ${ring2}`);
	t.ok(!ring2.includes(accent) && !ring.includes(accent), 'neither is the accent color');
	// with the tint off: the border alone
	await p.right(box.r - 30, box.b - 40);
	await clickMenu(p, 'Tint cards with their label color');
	await p.click(box.r - 40, box.b - 40);
	await p.sleep(400);
	t.ok((await shadowOf('Part One')).startsWith(edge + ' 0px 0px 0px 1px, ' + edge + ' 0px 0px 0px 1px inset'), 'with the tint off the card keeps its colored border');
	t.eq(await bg('Part One'), await bg('Part Two'), 'and its face is any card’s');
}));

test('“Move to” in a card’s menu lists the binder’s folders as they nest, and moves the note to the end of the one picked; undone by “Undo last move”', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder(${JSON.stringify(L + 'Part One/Flashback')}); await app.vault.create(${JSON.stringify(L + 'Part One/Flashback/Before.md')}, 'Before.'); })().then(() => 1)`);
	await p.sleep(600);
	await openView(p, 'The Lighthouse/Part One');
	await flush(p);
	const before = await contents(p), texts0 = await texts(p);
	const c = await p.at(card(L + 'Part One/Arrival.md'));
	await p.right(c.x, c.y);
	t.ok((await menuItems(p)).includes('Move to'), 'a card’s menu has “Move to”, under Move up and Move down');
	await hoverMenu(p, 'Move to');
	const items = await p.ev(`[...document.querySelectorAll('.menu')].pop() ? [...[...document.querySelectorAll('.menu')].pop().querySelectorAll('.menu-item')].map(e => [e.querySelector('.menu-item-title')?.textContent, e.classList.contains('is-disabled'), getComputedStyle(e.querySelector('.binders-menu-indent')).width]) : []`);
	t.eq(JSON.stringify(items.map((x) => x[0])), JSON.stringify(['The Lighthouse', 'Part One', 'Flashback', 'Part Two']), 'every folder of the binder, in binder order');
	t.ok(items[1][1] && !items[0][1] && !items[2][1] && !items[3][1], 'the folder it is in is there but can’t be picked: ' + JSON.stringify(items));
	t.ok(parseFloat(items[2][2]) > parseFloat(items[1][2]) && parseFloat(items[1][2]) > parseFloat(items[0][2]), 'each set in by its depth');
	await clickMenu(p, 'Part Two');
	await until(p, `!!app.vault.getAbstractFileByPath(${JSON.stringify(L + 'Part Two/Arrival.md')})`);
	await flush(p);
	const after = await contents(p);
	t.eq(after[after.length - 2], 'Part Two/Arrival', 'the note is in Part Two, last in it: ' + JSON.stringify(after));
	t.ok(!(await p.ev(`!!document.querySelector(${JSON.stringify(card(L + 'Part One/Arrival.md'))})`)), 'and its card has left this board');
	t.eq(await read(p, L + 'Part Two/Arrival.md'), texts0[L + 'Part One/Arrival.md'], 'its text is as it was');
	await p.ev(`app.commands.executeCommandById('binders:undo-move')`);
	await until(p, `!!app.vault.getAbstractFileByPath(${JSON.stringify(L + 'Part One/Arrival.md')})`);
	await flush(p);
	// (the folder made for this test is written into the list by the first move, where it showed all along)
	t.eq(JSON.stringify((await contents(p)).filter((x) => !x.includes('Flashback'))), JSON.stringify(before.filter((x) => !x.includes('Flashback'))), '“Undo last move” puts it back where it was');
	// a folder can't be moved into itself or a folder inside it
	await openView(p, 'The Lighthouse');
	const s = await p.at(card(L + 'Part One'));
	await p.right(s.x, s.t + 12);
	await hoverMenu(p, 'Move to');
	const forFolder = await p.ev(`[...[...document.querySelectorAll('.menu')].pop().querySelectorAll('.menu-item')].map(e => [e.querySelector('.menu-item-title')?.textContent, e.classList.contains('is-disabled')])`);
	t.eq(JSON.stringify(forFolder), JSON.stringify([['The Lighthouse', true], ['Part One', true], ['Flashback', true], ['Part Two', false]]), 'a folder isn’t offered itself, what’s inside it, or where it already is');
	await p.key('Escape'); await p.key('Escape');
}));


test('a card in hand when its button is let go unseen (another window in front, so no `pointerup` comes) goes back at the next move with no button down; the click after it drops nothing', async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const a = await at(p, 'Epilogue.md'), b = await at(p, 'Prologue.md');
	await p.move(a.x, a.t + 14, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.t + 14, button: 'left', clickCount: 1 });
	await p.move(b.x + 20, b.y, 12, { buttons: 1 });
	await p.sleep(200);
	const held = () => p.ev(`!!document.querySelector('.binders-drag-ghost') || document.body.classList.contains('is-grabbing') || !!document.querySelector('.workspace-leaf.mod-active .binders-card.is-dragging')`);
	t.ok(await held(), 'the card is in hand');
	// (all the page is told: a pointer that moves with no button down)
	await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x + 40, y: b.y + 10, button: 'none', buttons: 0 });
	await p.sleep(400);
	t.ok(!(await held()), 'at that move the card is no longer in hand: no ghost, no slot kept for it, no grabbing pointer');
	t.eq(await p.ev(`document.querySelectorAll('.binders-drop-indicator').length`), 0, 'and no line is left');
	await p.click(b.x + 60, b.y + 20);
	await p.sleep(600);
	await flush(p);
	t.eq(j(await selected(p)), j([L + 'Prologue.md']), 'the click that follows is a click: it selects the card under it');
	same(t, before, await texts(p));
	// and a card can be taken up again
	const e = await at(p, 'Epilogue.md');
	await drag(p, { x: e.x, y: e.t + 14 }, { x: b.l + 10, y: b.y });
	t.eq(j((await written(p, '- Epilogue\n  - Prologue')).slice(0, 2)), j(['Epilogue', 'Prologue']), 'a drag made afterwards drops as usual');
});

test('an empty binder’s board doesn’t take the keyboard from a note being typed in beside it when its first note arrives; with no card, the keyboard is on the “New note” tile', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Empty'); await ${B}.makeBinder(app.vault.getAbstractFileByPath('Empty')); })().then(() => 1)`);
	await until(p, `!!${B}.binderOf(app.vault.getAbstractFileByPath('Empty'))`);
	await openView(p, 'Empty');
	await p.sleep(300);
	await p.ev(`(() => { ${VIEW}.focusMode(); return 1; })()`);
	t.ok(await p.ev(`document.activeElement.classList.contains('binders-card-new')`), 'with no card to be on, the keyboard is on the “New note” tile');
	await p.ev(`(async () => { const leaf = app.workspace.getLeaf('split', 'vertical'); await leaf.openFile(${file(L + 'Prologue.md')}); app.workspace.setActiveLeaf(leaf, { focus: true }); })().then(() => 1)`);
	await until(p, `!!document.activeElement?.closest('.cm-editor')`);
	await p.sleep(300);
	await p.type('Typing here. ');
	await p.ev(`app.vault.create('Empty/First.md', 'one two').then(() => 1)`);
	await until(p, `!!document.querySelector('.binders-view .binders-card[data-path="Empty/First.md"]')`, 4000);
	await p.sleep(700);
	t.ok(await p.ev(`!!document.activeElement?.closest('.cm-editor')`), 'the cursor is still in the note when the binder’s first card is drawn (it’s on ' + (await p.ev(`document.activeElement?.className`)) + ')');
	await p.type('More. ');
	t.ok(await p.ev(`app.workspace.getLeavesOfType('markdown').some(l => l.view.editor?.getValue().includes('Typing here. More. '))`), 'and what’s typed goes into it');
}));

test('a folder’s card names its notes and folders only: a picture or a canvas kept beside them isn’t named, and doesn’t take a note’s place among the five', withTidy(async (p, h, t) => {
	const P1 = L + 'Part One';
	await p.ev(`(async () => { await app.vault.createBinary(${j(P1 + '/Cover.png')}, new Uint8Array([137, 80, 78, 71]).buffer); await app.vault.create(${j(P1 + '/Map.canvas')}, '{}'); await ${B}.flush(); })().then(() => 1)`);
	await p.sleep(600);
	await openView(p);
	const names = () => p.ev(`[...document.querySelectorAll(${j(card(P1) + ' .binders-card-held-name')})].map(e => e.textContent)`);
	t.eq(j(await names()), j(['Arrival', 'The keeper', 'Storm warning']), 'its three notes, as its count says');
	t.eq(await p.ev(`document.querySelector(${j(card(P1) + ' .binders-card-words')}).textContent`), '3 notes · 51 words', 'which counts three');
	await p.ev(`(async () => { for (const n of ['Fourth', 'Fifth', 'Sixth']) await ${B}.newScene(${file(P1)}, Infinity, n); await ${B}.flush(); })().then(() => 1)`);
	await until(p, `document.querySelectorAll(${j(card(P1) + ' .binders-card-held-name')}).length === 5`);
	t.eq(j(await names()), j(['Arrival', 'The keeper', 'Storm warning', 'Fourth', 'Fifth']), 'with more notes: its first five notes');
	await p.ev(`(async () => { for (const n of ['Cover.png', 'Map.canvas']) await app.vault.delete(${file(P1)}.children.find(c => c.name === n)); })().then(() => 1)`);
}));

test('deleting a folder’s last card from the keyboard leaves the keyboard on the “New note” tile, not on the page', withTidy(async (p, h, t) => {
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	try {
		await openView(p, L + 'Part Two');
		const on = () => p.ev(`(() => { const a = document.activeElement; return a.classList.contains('binders-card-new') ? 'tile' : a.dataset?.path?.split('/').pop() ?? a.tagName; })()`);
		const seen = [];
		for (let i = 0; i < 2; i++) {
			await p.ev(`(() => { document.querySelector('.workspace-leaf.mod-active .binders-card[data-path]').focus(); return 1; })()`);
			await p.key('Delete');
			await until(p, `!!document.querySelector('.modal-container')`);
			await p.key('Enter');
			await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === ${1 - i}`, 4000);
			await p.sleep(700);
			seen.push(await on());
		}
		t.eq(j(seen), j(['Lights out.md', 'tile']), 'after the first delete the keyboard is on the card left; after the last, on the tile');
		await p.key('Enter');
		t.eq(await p.ev(`document.activeElement.tagName`), 'INPUT', 'where Enter starts a new note');
		await p.key('Escape');
	} finally {
		await p.ev(`(async () => { app.vault.setConfig('trashOption', 'system'); if (await app.vault.adapter.exists('.trash')) await app.vault.adapter.rmdir('.trash', true); })().then(() => 1)`);
	}
}));
