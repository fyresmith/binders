// QA: the binder view and the corkboard. Scenarios named "BUG: …" fail until the bug they show is fixed; the others
// are regressions that pass.
import { B, NOTE, PL, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, flush, hoverMenu, j, menuItems, newNote, openView, read, reload, same, selected, split, texts, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';
import { mkdirSync } from 'fs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa corkboard: ' + name, fn });

const L = 'The Lighthouse/';
const LIST = ['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
const at = (p, path) => p.at(card(L + path));
const SHOTS = 'test-dist/qa-corkboard';
mkdirSync(SHOTS, { recursive: true });
const theme = (p) => p.ev(`document.body.hasClass('theme-dark') ? 'dark' : 'light'`);
async function drag(p, from, to) { await p.drag(from.x, from.y, to.x, to.y, 16); await p.sleep(300); }
async function written(p, want) {
	await flush(p);
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.includes(${j(want)}))`);
	return contents(p);
}
async function filterBy(p, title) {
	const b = await p.at(`.workspace-leaf.mod-active .binders-filter-button`);
	await p.click(b.x, b.y);
	await clickMenu(p, title);
	await closeMenus(p); // the filter's menu stays open for another pick
}

// ---- order ----

test('Alt+Down while filtered moves the card past the next card shown, keeping hidden ones in place', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await filterBy(p, 'Revised');
	await filterBy(p, 'Idea');
	t.eq(j(await cards(p)), j([L + 'Part One/Arrival.md', L + 'Part One/Storm warning.md']), 'filtered');
	const a = await at(p, 'Part One/Arrival.md');
	await p.click(a.x, a.t + 12);
	await p.key('ArrowDown', 'alt');
	t.eq(j(await written(p, '  - Part One/Storm warning\n  - Part One/Arrival')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'past Storm warning; The keeper stays first');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One/Arrival.md', 'still focused');
}));

test('Alt+Up on the first card shown while filtered changes nothing, though hidden cards are above it', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await filterBy(p, 'Draft'); // Part One: Arrival (revised), The keeper (draft), Storm warning (?)
	const shown = await cards(p);
	t.ok(shown.includes(L + 'Part One/The keeper.md') && !shown.includes(L + 'Part One/Arrival.md'), 'filtered: ' + j(shown));
	const k = await at(p, 'Part One/The keeper.md');
	await p.click(k.x, k.t + 12);
	await p.key('ArrowUp', 'alt');
	await p.sleep(400);
	await flush(p);
	// The keeper is the first card shown: Alt+Up has nowhere visible to go, so the hidden order must not change
	t.eq(j(await contents(p)), j(LIST), 'Alt+Up on the first visible card changes nothing on disk');
}));

test('drag while filtered keeps hidden cards where they were', withTidy(async (p, h, t) => {
	const before = await texts(p);
	// (the board shows one folder: Part One, where Arrival is revised, The keeper a draft and Storm warning an idea)
	await openView(p, 'The Lighthouse/Part One');
	await filterBy(p, 'Draft');
	await filterBy(p, 'Idea');
	t.eq(j(await cards(p)), j([L + 'Part One/The keeper.md', L + 'Part One/Storm warning.md']), 'drafts and ideas only');
	const s = await at(p, 'Part One/Storm warning.md'), k = await at(p, 'Part One/The keeper.md');
	await drag(p, { x: s.x, y: s.t + 12 }, { x: k.l + 8, y: k.y });
	const list = await written(p, 'Part One/Storm warning\n  - Part One/The keeper');
	t.eq(j(list), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/Storm warning', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'just before The keeper, after hidden Arrival');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('drag onto a stack while filtered: the card goes into that folder, at its end, past the notes the filter hides', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await filterBy(p, 'Draft');
	// (folders always show: a filter hides notes, and the stacks say how many of theirs it leaves)
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two']), 'drafts, and the folders');
	const pro = await at(p, 'Prologue.md'), one = await at(p, 'Part One');
	await drag(p, { x: pro.x, y: pro.t + 12 }, { x: one.x, y: one.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Prologue.md')`);
	const list = await written(p, 'Part One/Prologue');
	t.eq(j(list), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Prologue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'last in Part One');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Prologue.md']: L + 'Part One/Prologue.md' } });
}));

test('drop a card into an empty subfolder', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.createFolder('The Lighthouse/Part Three').then(() => 1)`);
	await p.sleep(300);
	await openView(p);
	const g = await at(p, 'Part Three');
	t.ok(g, 'Part Three has a card, a stack, though nothing is in it');
	t.ok(await p.ev(`document.querySelector('${card(L + 'Part Three')}').classList.contains('is-stack')`), 'drawn as a stack');
	const e = await at(p, 'Epilogue.md');
	await drag(p, { x: e.x, y: e.t + 12 }, { x: g.x, y: g.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part Three/Epilogue.md')`);
	t.ok(await exists(p, L + 'Part Three/Epilogue.md'), 'moved into the empty folder');
	await flush(p);
	const list = await contents(p);
	t.ok(list.indexOf('Part Three/Epilogue') === list.indexOf('Part Three/') + 1, 'listed under it: ' + j(list));
}));

test('drag a card onto itself changes nothing; released outside the board changes nothing', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, 'The Lighthouse/Part One');
	const a = await at(p, 'Part One/The keeper.md');
	await drag(p, { x: a.x, y: a.t + 12 }, { x: a.x + 8, y: a.y });
	await drag(p, { x: a.x, y: a.t + 12 }, { x: a.l + 4, y: a.y });
	await p.sleep(500);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'onto itself');
	// out over the ribbon
	await drag(p, { x: a.x, y: a.t + 12 }, { x: 5, y: 300 });
	await p.sleep(500);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'outside the board');
	same(t, before, await texts(p));
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator').length`), 0, 'no ghost left behind');
	// a stack onto its own middle: a folder doesn't go into itself
	await openView(p);
	const one = await at(p, 'Part One');
	await drag(p, { x: one.x, y: one.t + 12 }, { x: one.x + 10, y: one.y + 6 });
	await p.sleep(500);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'a stack onto itself');
	t.ok(await exists(p, L + 'Part One/Arrival.md'), 'the folder is where it was');
	same(t, before, await texts(p));
}));

test('Escape cancels a card drag', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	// held over the middle of Part Two's stack, where letting go would move it into that folder
	const a = await at(p, 'Prologue.md'), b = await at(p, 'Part Two');
	await p.move(a.x, a.t + 12, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.t + 12, button: 'left', clickCount: 1 });
	await p.move(b.x, b.y, 12, { buttons: 1 });
	t.ok(await p.ev(`!!document.querySelector('.binders-drag-ghost')`), 'dragging');
	t.eq(await p.ev(`document.querySelector('.binders-card.is-being-dragged-over')?.dataset.path ?? null`), L + 'Part Two', 'over the stack: it would go in');
	await p.key('Escape');
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
	await p.sleep(600);
	await flush(p);
	t.ok(await exists(p, L + 'Prologue.md') && !(await exists(p, L + 'Part Two/Prologue.md')), 'Escape cancels the drag, as in Obsidian’s file explorer: nothing moves');
	t.eq(j(await contents(p)), j(LIST), 'the order is as it was');
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-being-dragged-over').length`), 0, 'nothing of the drag is left');
	same(t, before, await texts(p));
}));

// BUG (2026-10-01, the one-folder board): the breadcrumb marks itself as the place the cards will go, but letting go
// there moves nothing: onPointerUp only drops when the pointer is over the board (`over()`), and the breadcrumb is in
// the toolbar above it.
test('BUG: multi-select in a folder, dropped on the binder in the breadcrumb, goes out to the binder’s end, keeping their order', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, 'The Lighthouse/Part One');
	// picked in the other order: they still arrive in the order they were on the board
	const s = await at(p, 'Part One/Storm warning.md'), a = await at(p, 'Part One/Arrival.md');
	await p.click(s.x, s.t + 12);
	await p.click(a.x, a.t + 12, { modifiers: 2 });
	const up = await p.at(`.workspace-leaf.mod-active .binders-crumb[data-path="The Lighthouse"]`);
	t.ok(up, 'the binder is in the breadcrumb');
	await drag(p, { x: a.x, y: a.t + 12 }, { x: up.x, y: up.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Storm warning.md')`);
	const list = await written(p, '  - Epilogue\n  - Arrival\n  - Storm warning');
	t.eq(j(list), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue', 'Arrival', 'Storm warning']), 'both at the binder’s end, in card order');
	t.eq(j(await cards(p)), j([L + 'Part One/The keeper.md']), 'the board still shows Part One, without them');
	same(t, before, await texts(p), { skip: [NOTE], moved: { [L + 'Part One/Arrival.md']: L + 'Arrival.md', [L + 'Part One/Storm warning.md']: L + 'Storm warning.md' } });
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-being-dragged-over').length`), 0, 'nothing of the drag is left');
}));

test('multi-select on a board, dropped at its end, keeps their order', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	const a = await at(p, 'Part One/Arrival.md'), k = await at(p, 'Part One/The keeper.md');
	await p.click(k.x, k.t + 12);
	await p.click(a.x, a.t + 12, { modifiers: 2 });
	const end = await at(p, 'Part One/Storm warning.md');
	await drag(p, { x: a.x, y: a.t + 12 }, { x: end.l + end.w - 10, y: end.y });
	const list = await written(p, '  - Part One/Storm warning\n  - Part One/Arrival\n  - Part One/The keeper');
	t.eq(j(list.slice(1, 5)), j(['Part One/', 'Part One/Storm warning', 'Part One/Arrival', 'Part One/The keeper']), 'both at the end, in card order');
}));

test('keyboard reorder at the edges: first card up, last card down', withTidy(async (p, h, t) => {
	await openView(p);
	const pro = await at(p, 'Prologue.md');
	await p.click(pro.x, pro.t + 12);
	await p.key('ArrowUp', 'alt');
	await p.key('ArrowLeft', 'alt');
	await p.key('End');
	t.eq(j(await selected(p)), j([L + 'Epilogue.md']), 'End goes to the last card');
	await p.key('ArrowDown', 'alt');
	await p.key('ArrowRight', 'alt');
	await p.sleep(400);
	await flush(p);
	t.eq(j(await contents(p)), j(LIST), 'nothing moved');
	await p.key('ArrowUp', 'alt');
	await p.sleep(400);
	t.eq(j(await written(p, '  - Epilogue\n  - Part Two/\n')), j([...LIST.slice(0, 5), 'Epilogue', ...LIST.slice(5, 8)]), 'Epilogue goes up past Part Two');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Epilogue.md', 'and keeps the focus');
}));

test('drag to the bottom edge scrolls the board, and the drop line stays by the card under the pointer', withTidy(async (p, h, t) => {
	await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: 600, deviceScaleFactor: 1, mobile: false });
	try {
		// (a board long enough to scroll: twenty notes in one folder)
		await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Long'); for (let i = 0; i < 20; i++) await app.vault.create('The Lighthouse/Long/Scene ' + String(i).padStart(2, '0') + '.md', 'word '.repeat(5 + i)); })().then(() => 1)`);
		await p.sleep(900);
		await openView(p, 'The Lighthouse/Long');
		await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 20`);
		const sc = `document.querySelector('.workspace-leaf.mod-active .binders-corkboard')`;
		const view = await p.at(`.workspace-leaf.mod-active .binders-corkboard`);
		const a = await at(p, 'Long/Scene 00.md');
		await p.move(a.x, a.t + 12, 2);
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.t + 12, button: 'left', clickCount: 1 });
		await p.move(a.x, view.t + view.h - 10, 10, { buttons: 1 });
		await p.sleep(800);
		const top = await p.ev(`${sc}.scrollTop`);
		t.ok(top > 100, 'the board scrolled: ' + top);
		// over the last card: the line must be at its left edge
		const lo = await at(p, 'Long/Scene 19.md');
		await p.move(lo.l + 10, lo.y, 6, { buttons: 1 });
		await p.sleep(100);
		const line = await p.ev(`(() => { const r = document.querySelector('.binders-drop-indicator.is-active')?.getBoundingClientRect(); return r ? { x: Math.round(r.left), t: Math.round(r.top), b: Math.round(r.bottom) } : null; })()`);
		await p.shot(`${SHOTS}/drag-scrolled-${await theme(p)}.png`);
		t.ok(line && Math.abs(line.x - lo.l) < 12 && Math.abs(line.t - lo.t) < 12, `the line by the last card (${j(line)} vs ${Math.round(lo.l)},${Math.round(lo.t)})`);
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lo.l + 10, y: lo.y, button: 'left', clickCount: 1 });
		const list = await written(p, 'Long/Scene 00\n  - Long/Scene 19');
		t.eq(j(list.slice(-3)), j(['Long/Scene 18', 'Long/Scene 00', 'Long/Scene 19']), 'dropped there, before the last card');
	} finally {
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
	}
}));

// ---- synopsis ----

test('synopsis saved when clicking another card, and when switching modes mid-edit', withTidy(async (p, h, t) => {
	await openView(p);
	let s = await p.at(`${card(L + 'Epilogue.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' Blur.');
	const o = await at(p, 'Prologue.md');
	await p.click(o.x, o.t + o.h - 8); // its foot: editing Epilogue scrolled it into view, which can cut off Prologue's top
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('museum. Blur.'))`);
	t.ok((await read(p, L + 'Epilogue.md')).includes('museum. Blur.'), 'saved on clicking another card');
	t.eq(j(await selected(p)), j([L + 'Prologue.md']), 'and that card is selected');
	s = await p.at(`${card(L + 'Prologue.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' Switch.');
	await h.run('show-outliner');
	await until(p, `app.vault.adapter.read('The Lighthouse/Prologue.md').then(s => s.includes('years. Switch.'))`);
	t.ok((await read(p, L + 'Prologue.md')).includes('years. Switch.'), 'saved on switching to the outliner');
	await h.run('show-corkboard');
}));

test('synopsis being typed survives a drag of another card', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	const s = await p.at(`${card(L + 'Part One/The keeper.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' While dragging.');
	t.eq(await p.ev(`document.activeElement?.value`), 'The keeper refuses to let her into the tower. While dragging.', 'typing in The keeper’s synopsis');
	const a = await at(p, 'Part One/Storm warning.md'), b = await at(p, 'Part One/Arrival.md');
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 8, y: b.y });
	await until(p, `app.vault.adapter.read('The Lighthouse/Part One/The keeper.md').then(s => s.includes('While dragging.'))`);
	t.ok((await read(p, L + 'Part One/The keeper.md')).includes('tower. While dragging.'), 'the synopsis was saved');
	t.eq(j(await written(p, 'Part One/Storm warning\n  - Part One/Arrival')).includes('Storm warning'), true, 'and the drag happened');
}));

test('closing the tab mid-edit saves the synopsis', withTidy(async (p, h, t) => {
	await openView(p);
	const s = await p.at(`${card(L + 'Epilogue.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' Closed.');
	await p.ev(`(() => { app.workspace.getLeavesOfType('binders-view')[0].detach(); return 1; })()`);
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('Closed.'))`);
	t.ok((await read(p, L + 'Epilogue.md')).includes('museum. Closed.'), 'saved');
}));

test('synopsis being typed survives the note being deleted meanwhile (text stays in the field)', withTidy(async (p, h, t) => {
	await openView(p);
	const s = await p.at(`${card(L + 'Epilogue.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' Gone?');
	await p.ev(`app.vault.delete(${file(L + 'Epilogue.md')}).then(() => 1)`);
	await p.sleep(400);
	const v = await p.ev(`document.activeElement?.value ?? null`);
	t.eq(v, 'Years later, the lighthouse is a museum. Gone?', 'the typed text is still there to copy');
	await p.key('Escape');
	p.errors.length = 0;
}));

// ---- new cards ----

test('a new card titled with a leading dot is refused (Obsidian would hide the note)', withTidy(async (p, h, t) => {
	await openView(p);
	await newNote(p);
	await p.type('.notes');
	await p.key('Enter');
	await p.sleep(600);
	await p.key('Escape');
	const hidden = await exists(p, L + '.notes.md');
	const shown = (await cards(p)).some((c) => c.includes('notes'));
	p.errors.length = 0;
	await p.ev(`app.vault.adapter.exists('The Lighthouse/.notes.md').then(e => e && app.vault.adapter.remove('The Lighthouse/.notes.md')).then(() => 1)`);
	t.ok(!hidden || shown, `no invisible note is made (file on disk: ${hidden}, card shown: ${shown})`);
	// the store never makes one either
	const made = await p.ev(`${B}.newScene(${file('The Lighthouse')}, Infinity, '.. hidden').then(f => f.path)`);
	t.eq(made, L + 'hidden.md', 'newScene drops the leading dots');
}));

test('a new card’s title that fails to save stays in the field', withTidy(async (p, h, t) => {
	await openView(p);
	await newNote(p);
	const long = 'A'.repeat(300);
	await p.ev(`(() => { document.activeElement.value = ${j(long)}; return 1; })()`);
	await p.key('Enter');
	await p.sleep(800);
	p.errors.length = 0;
	const v = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card[data-path] input')?.value ?? null`);
	t.ok(v === long, `the title stays in the field after the error, as a rename’s does (field has ${v?.length ?? 'no'} characters)`);
}));

test('new card: named in place, a taken name, the folder’s own name and a slash are refused, and the note keeps the name it was made with', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, 'The Lighthouse/Part One');
	const newCard = async (title) => {
		await p.ev(`document.querySelectorAll('.notice').forEach(n => n.remove())`); // the last title's notice can cover the card
		await newNote(p);
		await p.type(title);
		await p.key('Enter');
		await p.sleep(500);
		await p.key('Escape');
		await p.sleep(200);
		await p.ev(`document.querySelectorAll('.notice').forEach(n => n.remove())`);
	};
	await newCard('Arrival');
	t.ok(await exists(p, L + 'Part One/Untitled.md') && !(await exists(p, L + 'Part One/Arrival 1.md')), 'a taken name is refused: the note stays “Untitled”');
	await newCard('Part One');
	t.ok(await exists(p, L + 'Part One/Untitled 1.md') && !(await exists(p, L + 'Part One/Part One.md')), 'the folder’s name is refused (it would be the folder note)');
	await newCard('a/b');
	t.ok(!(await exists(p, L + 'Part One/a/b.md')) && !(await exists(p, L + 'Part One/a b.md')), 'a slash is refused');
	p.errors.length = 0;
	t.eq((await cards(p)).length, 6, 'three new notes, each under the name it was made with: ' + j(await cards(p)));
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('a new card made while a filter is on stays until the filter changes', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await filterBy(p, 'Draft');
	await newNote(p, 'Filtered');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Filtered.md')`);
	await p.sleep(400);
	await p.shot(`${SHOTS}/new-card-filtered-${await theme(p)}.png`);
	t.ok((await cards(p)).includes(L + 'Part One/Filtered.md'), 'the new card shows, though it has no status yet');
	await filterBy(p, 'Revised');
	await p.sleep(300);
	t.ok(!(await cards(p)).includes(L + 'Part One/Filtered.md'), 'once the filter changes, the filter decides');
}));

// ---- rename / delete ----

test('renaming a card to its folder’s name is refused (it would become the folder note)', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, 'The Lighthouse/Part One');
	const c = await at(p, 'Part One/Arrival.md');
	await p.right(c.x, c.y);
	await clickMenu(p, 'Rename');
	await p.key('a', 'ctrl');
	await p.type('Part One');
	await p.key('Enter');
	await p.sleep(800);
	p.errors.length = 0;
	const renamed = await exists(p, L + 'Part One/Part One.md');
	const shown = (await cards(p)).length;
	if (renamed) await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/Part One.md')}, 'The Lighthouse/Part One/Arrival.md').then(() => 1)`);
	t.ok(!renamed, 'refused, as a new card named like its folder is');
	t.eq(shown, 3, 'no card vanished');
	await p.key('Escape');
	same(t, before, await texts(p));
}));

test('dragging a note into a folder of the same name is refused (it would become the folder note)', withTidy(async (p, h, t) => {
	await p.ev(`${B}.newScene(${file('The Lighthouse')}, 1, 'Part Two').then(() => 1)`);
	await p.sleep(300);
	await openView(p);
	const c = await at(p, 'Part Two.md'), w = await at(p, 'Part Two');
	t.ok(c, 'a top-level note called Part Two');
	// onto the middle of the folder's stack
	await drag(p, { x: c.x, y: c.t + 12 }, { x: w.x, y: w.y });
	await p.sleep(600);
	p.errors.length = 0;
	const became = await exists(p, L + 'Part Two/Part Two.md');
	t.ok(!became, 'refused: it would become Part Two’s folder note and vanish from the board');
	t.ok(await exists(p, L + 'Part Two.md'), 'the note is where it was');
	t.ok((await cards(p)).includes(L + 'Part Two.md'), 'and its card still shows');
}));

test('renaming a stack to the name of a note in it is refused (the note would become its folder note)', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await until(p, `!!document.querySelector('${card(L + 'Part One')}')`);
	const c = await at(p, 'Part One');
	await p.right(c.x, c.y);
	await clickMenu(p, 'Rename');
	await p.key('a', 'ctrl');
	await p.type('Arrival');
	await p.key('Enter');
	await p.sleep(800);
	p.errors.length = 0;
	t.ok(await exists(p, L + 'Part One/Arrival.md') && !(await exists(p, L + 'Arrival')), 'the folder keeps its name');
	t.eq(await p.ev(`document.activeElement?.value`), 'Arrival', 'what was typed stays in the field');
	await p.key('Escape');
	same(t, before, await texts(p));
}));

test('rename a stack keeps its folder note and synopsis', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.create('The Lighthouse/Part One/Part One.md', '---\\nsynopsis: Arrivals.\\n---\\n').then(() => 1)`);
	await openView(p);
	await until(p, `!!document.querySelector('${card(L + 'Part One')}')`);
	const c = await at(p, 'Part One');
	await p.right(c.x, c.y);
	await clickMenu(p, 'Rename');
	await p.key('a', 'ctrl');
	await p.type('Book one');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Book one/Book one.md')`, 4000);
	t.ok(await exists(p, L + 'Book one/Book one.md'), 'the folder note followed');
	await until(p, `document.querySelector('${card(L + 'Book one')} .binders-card-synopsis')?.textContent === 'Arrivals.'`);
	t.eq(await p.ev(`document.querySelector('${card(L + 'Book one')} .binders-card-synopsis')?.textContent`), 'Arrivals.', 'its synopsis shows');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Book one')}, 'The Lighthouse/Part One').then(() => 1)`);
	await p.sleep(400);
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('The Lighthouse/Part One/Book one.md') || app.vault.getAbstractFileByPath('The Lighthouse/Part One/Part One.md'); if (f) await app.vault.delete(f); })().then(() => 1)`);
}));

test('after deleting with the keyboard, the next card has the focus', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	const c = await at(p, 'Part One/The keeper.md');
	await p.click(c.x, c.t + 12);
	await p.key('Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Delete').click()`);
	await until(p, `!document.querySelector('${card(L + 'Part One/The keeper.md')}')`);
	await p.sleep(1000);
	const f = await p.ev(`document.activeElement?.closest?.('.binders-board') ? document.activeElement.dataset.path ?? 'board' : document.activeElement?.className`);
	t.eq(f, L + 'Part One/Storm warning.md', 'the card after it has the focus, so the arrows still work');
	await p.key('ArrowLeft');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One/Arrival.md', 'and the arrows work');
}));

test('Ctrl+Enter on a card opens it in exactly one new tab', withTidy(async (p, h, t) => {
	await openView(p);
	const c = await at(p, 'Prologue.md');
	await p.click(c.x, c.t + 12);
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Prologue.md', 'the card has the focus');
	await p.key('Enter', 'ctrl');
	await p.sleep(600);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').length`), 1, 'one note tab');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, 'the corkboard stays');
}));

// ---- the view ----

test('two views of the same binder: a drag in one shows in the other; typing in one survives the other redrawing', withTidy(async (p, h, t) => {
	await openView(p);
	await p.ev(`(async () => { const l = app.workspace.getLeaf('split'); await l.setViewState({ type: 'binders-view', state: { folder: 'The Lighthouse' }, active: true }); })().then(() => 1)`);
	await until(p, `document.querySelectorAll('.binders-view .binders-card[data-path]').length === 8`);
	t.eq(await p.ev(`document.querySelectorAll('.binders-view .binders-card[data-path]').length`), 8, 'both views show the binder’s four cards');
	// type in the right-hand view's Epilogue synopsis
	const syn = `.workspace-leaf.mod-active .binders-card[data-path="${L}Epilogue.md"] .binders-card-synopsis`;
	await p.ev(`document.querySelector(${j(syn)}).scrollIntoView({ block: 'center' })`);
	await p.sleep(200);
	let s = await p.at(syn);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' Two views.');
	t.eq(await p.ev(`document.activeElement?.value`), 'Years later, the lighthouse is a museum. Two views.', 'typing in the right view');
	// the other view changes Epilogue's status
	await p.ev(`(async () => { const v = app.workspace.getLeavesOfType('binders-view').find(l => l !== app.workspace.getMostRecentLeaf()).view; await v.setProps(app.vault.getAbstractFileByPath('The Lighthouse/Epilogue.md'), { status: 'done' }); })().then(() => 1)`);
	await p.sleep(500);
	t.eq(await p.ev(`document.activeElement?.value`), 'Years later, the lighthouse is a museum. Two views.', 'still typing');
	await p.ev(`document.activeElement.blur()`);
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('Two views.') && s.includes('status: done'))`);
	const now = await read(p, L + 'Epilogue.md');
	t.ok(now.includes('Two views.') && now.includes('status: done'), 'both kept: ' + split(now).yaml);
	const lefts = await p.ev(`[...document.querySelectorAll('.binders-card[data-path="${L}Epilogue.md"] .binders-chip')].map(e => e.textContent)`);
	t.eq(j(lefts), j(['Done', 'Done']), 'both views show the status (as settings spell it)');
}));

test('Back after the folder it came from was renamed shows the renamed folder', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part Two');
	const c = await p.at(`.workspace-leaf.mod-active .binders-crumb[role="link"]`);
	await p.click(c.x, c.y);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part Two')}, 'The Lighthouse/Part 2').then(() => 1)`);
	await p.sleep(400);
	await p.ev(`app.commands.executeCommandById('app:go-back')`);
	await p.sleep(600);
	const st = await viewState(p);
	const empty = await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-empty')`);
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part 2')}, 'The Lighthouse/Part Two').then(() => 1)`);
	await p.sleep(300);
	t.ok(!empty, `Back shows the renamed folder (state ${st?.folder}), not “isn’t in a binder”`);
}));

test('binder folder renamed while a subfolder of it is open', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await p.ev(`app.fileManager.renameFile(${file('The Lighthouse')}, 'Lighthouse').then(() => 1)`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'Lighthouse/Part One'`);
	await until(p, `document.querySelector('.workspace-leaf.mod-active .binders-card')?.dataset.path.startsWith('Lighthouse/')`);
	t.eq((await cards(p)).length, 3, 'still shows Part One');
	t.eq(await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-crumb')].map(e => e.textContent).join('/')`), 'Lighthouse/Part One', 'the breadcrumb follows');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('Lighthouse'), 'The Lighthouse').then(() => 1)`);
	await p.sleep(500);
}));

test('binder note deleted while open: an empty state, nothing thrown', withTidy(async (p, h, t) => {
	const orig = await read(p, NOTE);
	await openView(p);
	await p.ev(`app.vault.delete(${file(NOTE)}).then(() => 1)`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-empty')`);
	t.ok(true, 'empty state');
	await p.ev(`app.vault.create(${j(NOTE)}, ${j(orig)}).then(() => 1)`);
	await until(p, `!!${B}.binderOf('The Lighthouse')`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-card')`);
	t.eq((await cards(p)).length, 4, 'and back when it returns');
}));

test('an empty binder: no card, 0 words, a filter menu that says so', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Empty'); await ${B}.makeBinder(app.vault.getAbstractFileByPath('Empty')); })().then(() => 1)`);
	await until(p, `!!${B}.binderOf('Empty')`);
	await openView(p, 'Empty');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path], .workspace-leaf.mod-active .binders-empty').length`), 0, 'no card, and no placeholder');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent`), '0 words', '0 words');
	const f = await p.at(`.workspace-leaf.mod-active .binders-filter-button`);
	await p.click(f.x, f.y);
	t.eq(j(await menuItems(p)), j(['No statuses or labels to filter by']), 'the filter menu');
	await closeMenus(p);
	await p.shot(`${SHOTS}/empty-binder-${await theme(p)}.png`);
	await newNote(p, 'First');
	await until(p, `app.vault.adapter.exists('Empty/First.md')`);
	await flush(p);
	await until(p, `app.vault.adapter.read('Empty/Empty.md').then(s => s.includes('- First'))`);
	t.ok((await read(p, 'Empty/Empty.md')).includes('- First'), 'listed');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Empty'), true).then(() => 1)`);
}));

test('word counts: cards, stacks and the toolbar agree', withTidy(async (p, h, t) => {
	const counts = () => p.ev(`(() => { const q = (s) => [...document.querySelectorAll('.workspace-leaf.mod-active ' + s)]; const num = (e) => parseInt(e.textContent.split('·').pop().replace(/,/g, ''), 10); return { cards: q('.binders-card[data-path] .binders-card-words').map(num), text: q('.binders-card.is-stack .binders-card-words').map(e => e.textContent), total: num(q('.binders-word-count')[0]) }; })()`);
	await openView(p);
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path] .binders-card-words').length === 4 && /words/.test(document.querySelector('.workspace-leaf.mod-active .binders-card.is-stack .binders-card-words').textContent)`);
	const n = await counts();
	// Prologue, the two stacks (each the sum of what it holds) and Epilogue
	t.eq(n.cards.length, 4, 'every card has a count');
	t.eq(n.cards.reduce((a, b) => a + b, 0), n.total, 'cards sum to the toolbar');
	t.eq(j(n.text.map((s) => s.split(' · ')[0])), j(['3 notes', '2 notes']), 'each stack says how many notes it holds');
	for (const [i, name, notes] of [[1, 'Part One', 3], [2, 'Part Two', 2]]) {
		await openView(p, 'The Lighthouse/' + name);
		await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path] .binders-card-words').length === ${notes}`);
		const m = await counts();
		t.eq(m.cards.length, notes, name + ': a card for each note');
		t.eq(m.cards.reduce((a, b) => a + b, 0), n.cards[i], name + ': its notes sum to what its stack said');
		t.eq(m.total, n.cards[i], name + ': and to the toolbar, inside it');
	}
}));


test('Alt+Down pressed quickly three times moves three places, keeping the focus', withTidy(async (p, h, t) => {
	await openView(p);
	const pro = await at(p, 'Prologue.md');
	await p.click(pro.x, pro.t + 12);
	for (let i = 0; i < 3; i++) await p.key('ArrowDown', 'alt');
	await p.sleep(500);
	t.eq(j(await written(p, '  - Epilogue\n  - Prologue')), j([...LIST.slice(1), 'Prologue']), 'past Part One, Part Two and Epilogue');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Prologue.md', 'still focused');
}));

test('renaming a card with a leading dot is refused (Obsidian would hide the note)', withTidy(async (p, h, t) => {
	await openView(p);
	const c = await at(p, 'Epilogue.md');
	await p.right(c.x, c.y);
	await clickMenu(p, 'Rename');
	await p.key('a', 'ctrl');
	await p.type('.Epilogue');
	await p.key('Enter');
	await p.sleep(800);
	p.errors.length = 0;
	const hidden = await exists(p, L + '.Epilogue.md');
	if (hidden) await p.ev(`app.vault.adapter.rename('The Lighthouse/.Epilogue.md', 'The Lighthouse/Epilogue.md').then(() => 1)`);
	await p.sleep(400);
	t.ok(!hidden, 'refused (the note would vanish from the vault)');
}));

test('stacks: status and label on a stack go to its folder note', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const hd = await at(p, 'Part One');
	await p.right(hd.x, hd.y);
	const items = await menuItems(p);
	t.ok(items.includes('Set status') && items.includes('Open'), 'the stack’s menu: ' + items.join(', '));
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Green');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Part One.md')`);
	await until(p, `!!document.querySelector('${card(L + 'Part One')}.is-stack.mod-label-green')`);
	t.ok(await p.ev(`!!document.querySelector('${card(L + 'Part One')}.is-stack.has-label.mod-label-green')`), 'the stack shows the label');
	t.eq((await read(p, L + 'Part One/Part One.md')).trim(), '---\nlabel: Green\n---', 'in a new folder note');
	await closeMenus(p);
	const c = await at(p, 'Part One');
	await p.right(c.x, c.y);
	await hoverMenu(p, 'Set status');
	await clickMenu(p, 'Draft');
	await until(p, `app.vault.adapter.read('The Lighthouse/Part One/Part One.md').then(s => /status: Draft/i.test(s))`);
	t.eq((await read(p, L + 'Part One/Part One.md')).trim().toLowerCase(), '---\nlabel: green\nstatus: draft\n---', 'the status beside it');
	await until(p, `!!document.querySelector('${card(L + 'Part One')} .binders-chip')`);
	t.eq(await p.ev(`document.querySelector('${card(L + 'Part One')} .binders-chip')?.textContent`), 'Draft', 'and on the stack');
	t.ok(!(await cards(p)).includes(L + 'Part One/Part One.md'), 'the folder note has no card');
	same(t, before, await texts(p));
}));

// ---- performance ----

test('a folder of 200 notes: opens, redraws and drags quickly', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Big'); for (let i = 0; i < 200; i++) await app.vault.create('The Lighthouse/Big/Scene ' + String(i).padStart(3, '0') + '.md', '---\\nstatus: draft\\nsynopsis: Scene number ' + i + ' of many, with a synopsis long enough to wrap onto a second line.\\n---\\n' + 'word '.repeat(100 + i)); })().then(() => 1)`);
	await p.sleep(1500);
	const t0 = Date.now();
	await openView(p, 'The Lighthouse/Big');
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]').length === 200 && !!document.querySelector('.workspace-leaf.mod-active .binders-card-words')`, 8000);
	const open = Date.now() - t0;
	const draw = await p.ev(`(() => { const m = ${VIEW}.current; const t = performance.now(); m.draw(); return Math.round(performance.now() - t); })()`);
	const sig = await p.ev(`(() => { const m = ${VIEW}.current; const t = performance.now(); m.signature(); return Math.round(performance.now() - t); })()`);
	const wc = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent`);
	t.eq(wc, `${(200 * 100 + 199 * 200 / 2).toLocaleString('en-US')} words`, 'the word count');
	// a drag across the board: time the pointer moves
	const a = await at(p, 'Big/Scene 000.md'), b = await at(p, 'Big/Scene 010.md');
	const m0 = Date.now();
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 8, y: b.y });
	const dragMs = Date.now() - m0;
	await until(p, `document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')[9]?.dataset.path.endsWith('Scene 000.md')`);
	await p.shot(`${SHOTS}/big-${await theme(p)}.png`);
	console.log(`    200 notes: open ${open}ms, draw ${draw}ms, signature ${sig}ms, drag ${dragMs}ms`);
	t.ok(draw < 250, `a full redraw takes ${draw}ms`);
	t.ok(sig < 50, `a refresh check takes ${sig}ms`);
	await p.ev(`app.vault.delete(${file(L + 'Big')}, true).then(() => 1)`);
}));

// ---- look ----

test('look: screenshots (wide, narrow, hover, focus, selection, editing, drag, menus)', withTidy(async (p, h, t) => {
	const th = await theme(p);
	await p.ev(`app.fileManager.processFrontMatter(${file(L + 'Part One/Arrival.md')}, fm => { fm.label = 'red'; }).then(() => 1)`);
	await p.ev(`app.fileManager.processFrontMatter(${file(NOTE)}, fm => { fm.target = 5000; }).then(() => 1)`);
	await openView(p);
	await p.shot(`${SHOTS}/wide-${th}.png`);
	// the binder's board: a note, the two folders as stacks, a note
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'one card per item of the binder');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card.is-stack').length`), 2, 'the folders are stacks');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card-new').length`), 0, 'and no “New note” tile');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-group-heading, .workspace-leaf.mod-active .binders-group.is-folder').length`), 0, 'no sections, no headings');
	const pro = await at(p, 'Prologue.md'), two = await at(p, 'Part Two');
	await p.click(pro.x, pro.t + 12);
	await p.click(two.x, two.t + 12, { modifiers: 2 });
	await p.shot(`${SHOTS}/stacks-${th}.png`);
	await openView(p, 'The Lighthouse/Part One');
	await p.shot(`${SHOTS}/folder-${th}.png`);
	const a = await at(p, 'Part One/Arrival.md');
	await p.click(a.x, a.t + 12);
	const k = await at(p, 'Part One/The keeper.md');
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await p.key('ArrowRight');
	await p.move(k.x + 10, k.y + 10);
	await p.shot(`${SHOTS}/selected-focus-hover-${th}.png`);
	await openView(p);
	const s = await p.at(`${card(L + 'Epilogue.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.shot(`${SHOTS}/editing-${th}.png`);
	await p.key('Escape');
	// a card held beside a card (a line), then over a stack (the stack is marked), then let go outside the board
	const w = await at(p, 'Epilogue.md'), one = await at(p, 'Part One');
	await p.move(w.x, w.t + 12, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: w.x, y: w.t + 12, button: 'left', clickCount: 1 });
	await p.move(one.l + 6, one.y, 10, { buttons: 1 });
	await p.shot(`${SHOTS}/dragging-${th}.png`);
	await p.move(one.x, one.y, 6, { buttons: 1 });
	await p.shot(`${SHOTS}/dragging-into-stack-${th}.png`);
	await p.move(5, 300, 4, { buttons: 1 });
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 300, button: 'left', clickCount: 1 });
	await p.sleep(200);
	const e = await at(p, 'Epilogue.md');
	await p.right(e.x, e.y);
	await hoverMenu(p, 'Set label');
	await p.shot(`${SHOTS}/menu-label-${th}.png`);
	await closeMenus(p);
	const f = await p.at(`.workspace-leaf.mod-active .binders-filter-button`);
	await p.click(f.x, f.y);
	await p.shot(`${SHOTS}/menu-filter-${th}.png`);
	await closeMenus(p);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 620, height: 800, deviceScaleFactor: 1, mobile: false });
	await p.sleep(500);
	await p.shot(`${SHOTS}/narrow-${th}.png`);
	await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
	await p.sleep(300);
	// the read-only notice
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem('The Lighthouse')`);
	await p.sleep(400);
	await p.shot(`${SHOTS}/read-only-${th}.png`);
	await writeRaw(p, NOTE, orig);
	await until(p, `!${B}.problem('The Lighthouse')`);
	p.errors.length = 0;
	t.ok(true);
}));

// Reloads Obsidian twice (into mobile and back), so it is last in this file.
test('mobile: a swipe scrolls, a tap selects then edits a synopsis, long press and drag onto a stack', withTidy(async (p, h, t) => {
	const touch = async (type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
	const tap = async (x, y) => { await touch('touchStart', x, y); await p.sleep(40); await touch('touchEnd'); await p.sleep(250); };
	await reload(p, true);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try {
		// (five more notes, so the binder's own board is longer than a phone's screen)
		await p.ev(`(async () => { for (let i = 1; i <= 5; i++) await ${B}.newScene(${file('The Lighthouse')}, Infinity, 'Coda ' + i); })().then(() => 1)`);
		await p.sleep(600);
		const before = await texts(p);
		await openView(p);
		const th = await theme(p);
		await p.shot(`${SHOTS}/mobile-root-${th}.png`);
		const scrollTop = () => p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-corkboard').scrollTop`);
		// a swipe up scrolls
		const a = await at(p, 'Part Two');
		await touch('touchStart', a.x, a.y);
		for (let i = 1; i <= 10; i++) { await touch('touchMove', a.x, a.y - i * 25); await p.sleep(16); }
		await touch('touchEnd');
		await p.sleep(500);
		const st = await scrollTop();
		t.ok(st > 50, 'the board scrolled: ' + st);
		t.eq(j(await selected(p)), j([]), 'and selected nothing');
		await p.ev(`(() => { const b = document.querySelector('.workspace-leaf.mod-active .binders-corkboard'); b.scrollTop = b.scrollHeight; return 1; })()`);
		await p.sleep(300);
		await p.shot(`${SHOTS}/mobile-bottom-${th}.png`);
		const last = await p.ev(`(() => { const n = [...document.querySelectorAll('.workspace-leaf.mod-active .binders-card[data-path]')].pop().getBoundingClientRect(), bar = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return { newBottom: Math.round(n.bottom), barTop: bar ? Math.round(bar.top) : null }; })()`);
		t.ok(last.barTop == null || last.newBottom <= last.barTop, 'scrolled to the end, the last card clears the navigation bar: ' + j(last));
		await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-corkboard').scrollTop = 0`);
		await p.sleep(200);
		// a tap on a synopsis selects the card; a second tap edits
		const syn = `${card(L + 'Prologue.md')} .binders-card-synopsis`;
		let s = await p.at(syn);
		await tap(s.x, s.y);
		t.eq(j(await selected(p)), j([L + 'Prologue.md']), 'first tap selects');
		t.ok(!(await p.ev(`!!document.querySelector('${syn} textarea')`)), 'without editing');
		await tap(s.x, s.y);
		t.ok(await p.ev(`!!document.querySelector('${syn} textarea')`), 'second tap edits');
		await p.ev(`(() => { const f = document.querySelector('${syn} textarea'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); return 1; })()`);
		await p.type(' On a phone.');
		await p.shot(`${SHOTS}/mobile-editing-${th}.png`);
		const e = await at(p, 'Part One');
		await tap(e.x, e.y + 30);
		await until(p, `app.vault.adapter.read('The Lighthouse/Prologue.md').then(s => s.includes('On a phone.'))`);
		t.ok((await read(p, L + 'Prologue.md')).includes('forty years. On a phone.'), 'tapping another card saves it');
		// long press Prologue, drag it onto the middle of Part Two's stack: it goes into that folder, at its end
		await p.sleep(400);
		const pro2 = await at(p, 'Prologue.md');
		const w = await at(p, 'Part Two');
		t.ok(pro2 && pro2.y > 0 && w && w.y < 780, 'Prologue and Part Two’s stack are both in sight: ' + j([pro2, w]));
		await touch('touchStart', pro2.x, pro2.y);
		await p.sleep(650);
		for (let i = 1; i <= 14; i++) { await touch('touchMove', w.x, pro2.y + (w.y - pro2.y) * i / 14); await p.sleep(20); }
		await p.sleep(100);
		t.eq(await p.ev(`document.querySelector('.binders-card.is-being-dragged-over')?.dataset.path ?? null`), L + 'Part Two', 'held over the stack: it is marked');
		await touch('touchEnd');
		await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Prologue.md')`);
		t.ok(await exists(p, L + 'Part Two/Prologue.md'), 'moved into Part Two');
		await flush(p);
		t.eq(j((await contents(p)).slice(0, 5)), j(['Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/']), 'out of the binder’s own list');
		t.eq(j((await contents(p)).slice(5, 8)), j(['Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Prologue']), 'last in Part Two');
		same(t, before, await texts(p), { skip: [NOTE, L + 'Prologue.md'], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md' } });
	} finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
	}
}));
