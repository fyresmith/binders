// The corkboard (src/view/corkboard.ts): cards in binder order, groups and stacks, dragging (within and between groups,
// several at once, by touch), editing a synopsis (also while the note changes on disk), new cards, rename, delete,
// status and label, the keyboard, and mobile. Every test that changes files checks no text was lost.
import { B, NOTE, VIEW, card, cards, dblclick, clickMenu, closeMenus, contents, exists, file, flush, hoverMenu, j, menuItems, openView, read, reload, same, selected, split, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

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

test('cards in binder order, grouped under their folders', async (p, h, t) => {
	await openView(p);
	t.eq(j(await cards(p)), j(['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((x) => L + x + '.md')), 'in order');
	const groups = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-group')].map(g => (g.querySelector('.binders-group-title')?.textContent ?? '') + ':' + [...g.querySelectorAll('.binders-card[data-path]')].length)`);
	t.eq(j(groups), j([':1', 'Part One:3', 'Part Two:2', ':1']), 'Prologue, the two parts with headings, then Epilogue');
	const c = await p.ev(`(() => { const c = document.querySelector('${card(L + 'Part One/Arrival.md')}'); return { title: c.querySelector('.binders-card-title').textContent, syn: c.querySelector('.binders-card-synopsis').textContent, chip: c.querySelector('.binders-chip').textContent, words: c.querySelector('.binders-card-words').textContent, role: c.getAttribute('role'), list: c.parentElement.getAttribute('role') }; })()`);
	t.eq(j(c), j({ title: 'Arrival', syn: 'Mara arrives on the island with the supply boat.', chip: 'revised', words: '18 words', role: 'option', list: 'listbox' }), 'a card shows title, synopsis, status and words');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card-new').length`), 4, 'a “New note” card ends each group');
});

test('subfolders as stacks: one card each, opened by double-click', async (p, h, t) => {
	await openView(p);
	const more = await p.at(`.workspace-leaf.mod-active .view-action[aria-label="More options"]`);
	await p.click(more.x, more.y);
	await p.sleep(200);
	await clickMenu(p, 'Show subfolders as stacks');
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'the parts are single cards, in order');
	t.eq(await p.ev(`document.querySelector('${card(L + 'Part One')} .binders-card-words').textContent`), '3 notes · 51 words', 'a stack counts its notes');
	t.eq(await p.ev(`${VIEW}.getState().options.stacks`), true, 'the option is kept with the view');
	const s = await at(p, 'Part One');
	await dblclick(p, s.x, s.t + 14);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse/Part One'`);
	t.eq(j(await cards(p)), j(['Arrival', 'The keeper', 'Storm warning'].map((x) => L + 'Part One/' + x + '.md')), 'double-click shows the folder');
});

test('drag to reorder within a group: the list changes, no note does', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const a = await at(p, 'Part One/Storm warning.md'), b = await at(p, 'Part One/Arrival.md');
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 10, y: b.y });
	t.eq(j(await cards(p)).includes(j([L + 'Part One/Storm warning.md', L + 'Part One/Arrival.md']).slice(1, -1)), true, 'Storm warning is first in Part One');
	const list = await written(p, '  - Part One/Storm warning\n  - Part One/Arrival');
	t.eq(j(list), j(['Prologue', 'Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'contents on disk');
	const after = await texts(p);
	same(t, before, after, { skip: [NOTE] });
	t.eq(split(after[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is untouched');
	t.eq(j(await selected(p)), j([L + 'Part One/Storm warning.md']), 'the moved card stays selected');
}));

test('drag into another group moves the note into that folder', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const a = await at(p, 'Part One/Arrival.md'), b = await at(p, 'Part Two/Lights out.md');
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 10, y: b.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Arrival.md')`);
	t.ok(!(await exists(p, L + 'Part One/Arrival.md')), 'the note left Part One');
	const list = await written(p, '  - Part Two/Arrival\n  - Part Two/Lights out');
	t.eq(j(list), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Arrival', 'Part Two/Lights out', 'Epilogue']), 'it sits before Lights out');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Arrival.md']: L + 'Part Two/Arrival.md' } });
	// to the top level, at the end (the "New note" card of the last group)
	const c = await at(p, 'Part Two/Arrival.md'), end = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
	await drag(p, { x: c.x, y: c.t + 12 }, { x: end.x, y: end.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Arrival.md')`);
	t.eq(j(await written(p, '  - Epilogue\n  - Arrival')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue', 'Arrival']), 'at the end of the binder');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Arrival.md']: L + 'Arrival.md' } });
}));

test('Ctrl and Shift select several cards, and they move together', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const pro = await at(p, 'Prologue.md'), keeper = await at(p, 'Part One/The keeper.md'), storm = await at(p, 'Part One/Storm warning.md');
	await p.click(pro.x, pro.t + 12);
	await p.click(storm.x, storm.t + 12, { modifiers: 2 });
	t.eq(j(await selected(p)), j([L + 'Prologue.md', L + 'Part One/Storm warning.md']), 'Ctrl-click adds a card');
	const arr = await at(p, 'Part One/Arrival.md');
	await p.click(arr.x, arr.t + 12);
	await p.click(storm.x, storm.t + 12, { modifiers: 8 });
	t.eq(j(await selected(p)), j(['Arrival', 'The keeper', 'Storm warning'].map((x) => L + 'Part One/' + x + '.md')), 'Shift-click selects a range');
	await p.click(keeper.x, keeper.t + 12, { modifiers: 2 });
	t.eq((await selected(p)).length, 2, 'Ctrl-click takes one out');
	// drag both into Part Two, before The wreck
	const wreck = await at(p, 'Part Two/The wreck.md');
	await drag(p, { x: arr.x, y: arr.t + 12 }, { x: wreck.l + 10, y: wreck.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Storm warning.md') && app.vault.adapter.exists('The Lighthouse/Part Two/Arrival.md')`);
	await p.sleep(300);
	t.eq(j(await written(p, '  - Part Two/Arrival\n  - Part Two/Storm warning\n  - Part Two/The wreck')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part Two/', 'Part Two/Arrival', 'Part Two/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'both moved, in their order');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Arrival.md']: L + 'Part Two/Arrival.md', [L + 'Part One/Storm warning.md']: L + 'Part Two/Storm warning.md' } });
	t.eq(j(await selected(p)), j([L + 'Part Two/Arrival.md', L + 'Part Two/Storm warning.md']), 'still selected');
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
	await until(p, `document.querySelector('${card(L + 'Prologue.md')} .binders-chip')?.textContent === 'revised'`);
	t.eq(await p.ev(`document.querySelector('${card(L + 'Prologue.md')} .binders-chip').textContent`), 'revised', 'the card shows the change once editing ends');
}));

test('a subfolder’s heading synopsis goes to its folder note', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const s = await p.at(`.workspace-leaf.mod-active .binders-group.is-folder .binders-group-synopsis`);
	await p.move(s.x, s.y);
	await p.click(s.x, s.y);
	await p.type('Mara arrives.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Part One.md')`);
	await p.sleep(200);
	t.eq((await read(p, L + 'Part One/Part One.md')).trim(), '---\nsynopsis: Mara arrives.\n---', 'the folder note holds it');
	t.eq(j(await contents(p)), j(LIST), 'and is not in the list');
	same(t, before, await texts(p));
}));

test('new card: type a title, Enter makes the note there and offers another', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const nc = await p.at(`.workspace-leaf.mod-active .binders-group.is-folder:nth-child(3) .binders-card-new`);
	await p.click(nc.x, nc.y);
	t.ok(await p.ev(`document.activeElement.matches('.binders-card-new input')`), 'the title field has the focus');
	await p.type('The rescue');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/The rescue.md')`);
	await p.sleep(300);
	t.ok(await p.ev(`document.activeElement.matches('.binders-card-new input')`), 'another new card is ready');
	await p.type('Dawn');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Dawn.md')`);
	await p.sleep(300);
	await p.key('Escape');
	await p.sleep(200);
	t.ok(!(await p.ev(`!!document.querySelector('.binders-card-new input')`)), 'Escape ends it');
	t.eq(await read(p, L + 'Part Two/The rescue.md'), '', 'an empty note');
	t.eq(j(await cards(p)).includes(j(['The wreck', 'Lights out', 'The rescue', 'Dawn'].map((x) => L + 'Part Two/' + x + '.md')).slice(1, -1)), true, 'at the end of Part Two, in order');
	t.eq(j(await written(p, 'Part Two/Dawn')), j([...LIST.slice(0, 8), 'Part Two/The rescue', 'Part Two/Dawn', 'Epilogue']), 'written into the list');
	// in the run of top-level notes before Part One: between Prologue and Part One
	const first = await p.at(`.workspace-leaf.mod-active .binders-group:first-child .binders-card-new`);
	await p.click(first.x, first.y);
	await p.type('Interlude');
	await p.ev(`document.activeElement.blur()`);
	await until(p, `app.vault.adapter.exists('The Lighthouse/Interlude.md')`);
	t.eq(j((await written(p, '  - Interlude')).slice(0, 3)), j(['Prologue', 'Interlude', 'Part One/']), 'clicking away with a title makes it too, after Prologue');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('rename from the menu', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
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
	await openView(p);
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
	t.ok(['draft', 'revised', 'idea', 'New status…'].every((x) => items.includes(x)), 'statuses in use, and a new one: ' + items.join(', '));
	await clickMenu(p, 'revised');
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('status: revised'))`);
	const d = await at(p, 'Epilogue.md');
	await p.right(d.x, d.y);
	await hoverMenu(p, 'Set label');
	const colors = await menuItems(p);
	t.ok(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'].every((x) => colors.includes(x)), 'the colors: ' + colors.join(', '));
	await clickMenu(p, 'Blue');
	await until(p, `!!document.querySelector('${card(L + 'Epilogue.md')}.mod-label-blue')`);
	const stripe = await p.ev(`getComputedStyle(document.querySelector('${card(L + 'Epilogue.md')}'), '::before').backgroundColor`);
	const blue = await p.ev(`(() => { const e = document.body.createDiv(); e.style.color = 'var(--color-blue)'; const c = getComputedStyle(e).color; e.remove(); return c; })()`);
	t.eq(stripe, blue, 'the stripe is the theme’s blue');
	const text = await read(p, L + 'Epilogue.md');
	t.ok(/label: blue/.test(text) && /status: revised/.test(text), 'both written');
	t.eq(split(text).body, split(before).body, 'the body is untouched');
	// a new status, through the dialog
	await p.right(d.x, d.y);
	await hoverMenu(p, 'Set status');
	await clickMenu(p, 'New status…');
	await until(p, `!!document.querySelector('.modal input')`);
	await p.type('final');
	await p.key('Enter');
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('status: final'))`);
	t.ok(true, 'a new status');
}));

test('keyboard: arrows move, Enter opens, Alt+arrows reorder', withTidy(async (p, h, t) => {
	await openView(p);
	const c = await at(p, 'Prologue.md');
	await p.click(c.x, c.t + 12);
	await p.key('ArrowRight');
	t.eq(j(await selected(p)), j([L + 'Part One/Arrival.md']), 'right: the next card');
	await p.key('ArrowRight');
	await p.key('ArrowDown');
	t.eq(j(await selected(p)), j([L + 'Part Two/Lights out.md']), 'down: the card below');
	await p.key('ArrowLeft', 'shift');
	t.eq(j(await selected(p)), j([L + 'Part Two/The wreck.md', L + 'Part Two/Lights out.md']), 'Shift extends');
	await p.key('ArrowUp', 'alt');
	await p.sleep(300);
	t.eq(j(await written(p, '  - Part One/The keeper\n  - Part One/Storm warning\n  - Part Two/\n')), j(LIST), 'the first of the group can’t go up out of it');
	await p.key('Escape');
	t.eq(j(await selected(p)), j([L + 'Part Two/The wreck.md']), 'Escape keeps just the focused card');
	await p.key('ArrowDown', 'alt');
	await p.sleep(300);
	t.eq(j(await written(p, '  - Part Two/Lights out\n  - Part Two/The wreck')), j([...LIST.slice(0, 6), 'Part Two/Lights out', 'Part Two/The wreck', 'Epilogue']), 'Alt+Down moves it one later');
	t.eq(await p.ev(`document.activeElement.dataset.path`), L + 'Part Two/The wreck.md', 'and it keeps the focus');
	await p.key('Enter');
	await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse/Part Two/The wreck.md'`);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Part Two/The wreck.md', 'Enter opens the note');
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card')`);
	t.eq((await cards(p)).length, 7, 'Back returns to the corkboard');
}));

test('double-click opens a note, Ctrl+double-click in a new tab, but not on a synopsis', async (p, h, t) => {
	await openView(p);
	let c = await at(p, 'Part One/Arrival.md');
	await dblclick(p, c.x, c.t + 12, 2);
	await until(p, `app.workspace.getLeavesOfType('markdown').length === 1`);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.file.path`), L + 'Part One/Arrival.md', 'Ctrl+double-click opens the note');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, 'in a new tab, keeping the corkboard');
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(300);
	c = await at(p, 'Part One/The keeper.md');
	await dblclick(p, c.x, c.t + 12);
	await until(p, `app.workspace.getActiveFile()?.path === 'The Lighthouse/Part One/The keeper.md'`);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 0, 'a double-click opens it in the same tab, as a link would');
	// on the synopsis, a double-click edits instead
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card')`);
	const s = await p.at(`${card(L + 'Prologue.md')} .binders-card-synopsis`);
	await dblclick(p, s.x, s.y);
	t.ok(await p.ev(`document.activeElement.matches('textarea')`), 'a double-click on a synopsis edits it');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').length`), 1, 'and opens nothing');
	await p.key('Escape');
});

test('a middle click opens a note in a new tab, and a stack or heading’s folder in a new binder tab', withTidy(async (p, h, t) => {
	await openView(p);
	let c = await at(p, 'Part One/Arrival.md');
	await p.click(c.x, c.t + 12, { button: 'middle' });
	await until(p, `app.workspace.getLeavesOfType('markdown').length === 1`);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown')[0].view.file.path`), L + 'Part One/Arrival.md', 'the note, in a new tab');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, 'keeping the corkboard');
	await p.ev(`(() => { app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('binders-view')[0], { focus: true }); return 1; })()`);
	await p.sleep(300);
	const hd = await p.at(`.workspace-leaf.mod-active .binders-group.is-folder .binders-group-title`);
	await p.click(hd.x, hd.y, { button: 'middle' });
	await until(p, `app.workspace.getLeavesOfType('binders-view').length === 2`);
	t.ok(await p.ev(`app.workspace.getLeavesOfType('binders-view').some(l => l.view.getState().folder === 'The Lighthouse/Part One')`), 'the heading’s folder, in a new binder tab');
}));

test('editing the synopsis of a card half out of sight scrolls the card into view', withTidy(async (p, h, t) => {
	await openView(p);
	await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: 560, deviceScaleFactor: 1, mobile: false });
	await p.sleep(300);
	const sc = `document.querySelector('.workspace-leaf.mod-active .binders-corkboard')`, c = `document.querySelector('${card(L + 'Part One/Arrival.md')}')`;
	// scroll so the card's top is cut off by the top edge
	await p.ev(`(() => { const s = ${sc}; s.scrollTop += ${c}.getBoundingClientRect().top - s.getBoundingClientRect().top + 50; return 1; })()`);
	await p.sleep(200);
	const cut = () => p.ev(`Math.round(${sc}.getBoundingClientRect().top - ${c}.getBoundingClientRect().top) || 0`); // never -0, which doesn't come back
	t.ok(await cut() > 20, 'cut off at first: ' + (await cut()));
	const syn = await p.at(`${card(L + 'Part One/Arrival.md')} .binders-card-synopsis`);
	await p.click(syn.x, syn.t + syn.h - 4);
	t.ok(await p.ev(`document.activeElement.matches('textarea')`), 'editing');
	t.ok(await cut() <= 0, 'the whole card shows: ' + (await cut()));
	await p.key('Escape');
	await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
}));

test('Rename in a group heading’s menu renames the folder in place; its folder note follows', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', '---\\nsynopsis: Arrivals.\\n---\\n').then(() => 1)`);
	await openView(p);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-group-synopsis')?.textContent === 'Arrivals.'`);
	const hd = await p.at(`.workspace-leaf.mod-active .binders-group.is-folder .binders-group-title-row`);
	await p.right(hd.x, hd.y);
	await clickMenu(p, 'Rename');
	t.ok(await p.ev(`document.activeElement.matches('.binders-group-name input')`), 'the heading’s name is a field');
	await p.key('a', 'ctrl');
	await p.type('Book one');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Book one/Book one.md')`, 4000);
	t.ok(!(await exists(p, L + 'Part One')), 'the folder is renamed');
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-group-name')?.textContent === 'Book one'`);
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-group-synopsis')?.textContent`), 'Arrivals.', 'its synopsis comes along');
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().getViewState().state.folder`), 'The Lighthouse', 'the view stays where it was');
	// Escape cancels
	const hd2 = await p.at(`.workspace-leaf.mod-active .binders-group.is-folder .binders-group-title-row`);
	await p.right(hd2.x, hd2.y);
	await clickMenu(p, 'Rename');
	await p.type('Nope');
	await p.key('Escape');
	await p.sleep(300);
	t.ok(await exists(p, L + 'Book one'), 'Escape leaves the name');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Book one')}, 'The Lighthouse/Part One').then(() => 1)`);
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Part One.md')`, 4000);
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('The Lighthouse/Part One/Part One.md')).then(() => 1)`);
	await p.sleep(300);
	same(t, before, await texts(p), { skip: [NOTE] });
}));

// Reloads Obsidian twice (into mobile and back), so it is last in this file.
test('mobile: one column, tap to open, long press for the menu, long press and drag to move', withTidy(async (p, h, t) => {
	const touch = async (type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
	await reload(p, true);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try {
		const before = await texts(p);
		await openView(p, 'The Lighthouse/Part One');
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
		await closeMenus(p);
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
		await p.ev(`(async () => { const f = app.vault.configDir + '/workspace-mobile.json'; if (await app.vault.adapter.exists(f)) await app.vault.adapter.remove(f); })().then(() => 1)`);
	}
	t.ok(!(await p.ev(`app.isMobile`)), 'back on desktop');
}));
