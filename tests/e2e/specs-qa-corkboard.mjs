// QA: the binder view and the corkboard. Scenarios named "BUG: …" fail until the bug they show is fixed; the others
// are regressions that pass.
import { B, NOTE, PL, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, flush, hoverMenu, j, menuItems, openView, read, reload, same, selected, split, texts, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';
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
}

// ---- order ----

test('Alt+Down while filtered moves the card past the next card shown, keeping hidden ones in place', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await filterBy(p, 'revised');
	await filterBy(p, 'idea');
	t.eq(j(await cards(p)), j([L + 'Part One/Arrival.md', L + 'Part One/Storm warning.md']), 'filtered');
	const a = await at(p, 'Part One/Arrival.md');
	await p.click(a.x, a.t + 12);
	await p.key('ArrowDown', 'alt');
	t.eq(j(await written(p, '  - Part One/Storm warning\n  - Part One/Arrival')), j(['Prologue', 'Part One/', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Arrival', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue']), 'past Storm warning; The keeper stays first');
	t.eq(await p.ev(`document.activeElement?.dataset?.path`), L + 'Part One/Arrival.md', 'still focused');
}));

test('Alt+Up on the first card shown while filtered changes nothing, though hidden cards are above it', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await filterBy(p, 'draft'); // Part One: Arrival (revised), The keeper (draft), Storm warning (?)
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
	await openView(p);
	await filterBy(p, 'draft');
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part One/The keeper.md', L + 'Part Two/The wreck.md']), 'drafts only');
	const w = await at(p, 'Part Two/The wreck.md'), k = await at(p, 'Part One/The keeper.md');
	await drag(p, { x: w.x, y: w.t + 12 }, { x: k.l + 8, y: k.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/The wreck.md')`);
	const list = await written(p, 'Part One/The wreck');
	t.eq(j(list), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The wreck', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/', 'Part Two/Lights out', 'Epilogue']), 'just before The keeper, after hidden Arrival');
}));

test('drop a card into an empty subfolder', withTidy(async (p, h, t) => {
	await p.ev(`app.vault.createFolder('The Lighthouse/Part Three').then(() => 1)`);
	await p.sleep(300);
	await openView(p);
	let g = await p.at(`.workspace-leaf.mod-active .binders-card-new[aria-label="New note in Part Three"]`);
	t.ok(g, 'Part Three has a group with a New note card');
	await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card-new[aria-label="New note in Part Three"]').scrollIntoView({ block: 'end' })`);
	await p.sleep(200);
	g = await p.at(`.workspace-leaf.mod-active .binders-card-new[aria-label="New note in Part Three"]`);
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
	await openView(p);
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
}));

test('Escape cancels a card drag', withTidy(async (p, h, t) => {
	await openView(p);
	const a = await at(p, 'Part One/The keeper.md'), b = await at(p, 'Part Two/The wreck.md');
	await p.move(a.x, a.t + 12, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.t + 12, button: 'left', clickCount: 1 });
	await p.move(b.l + 8, b.y, 12, { buttons: 1 });
	t.ok(await p.ev(`!!document.querySelector('.binders-drag-ghost')`), 'dragging');
	await p.key('Escape');
	await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.l + 8, y: b.y, button: 'left', clickCount: 1 });
	await p.sleep(600);
	await flush(p);
	t.ok(await exists(p, L + 'Part One/The keeper.md'), 'Escape cancels the drag, as in Obsidian’s file explorer: nothing moves');
}));

test('multi-select across groups, dropped at the binder’s end, keeps their order', withTidy(async (p, h, t) => {
	await openView(p);
	const pro = await at(p, 'Prologue.md'), w = await at(p, 'Part Two/The wreck.md');
	await p.click(pro.x, pro.t + 12);
	await p.click(w.x, w.t + 12, { modifiers: 2 });
	const end = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
	await drag(p, { x: w.x, y: w.t + 12 }, { x: end.x, y: end.y });
	await until(p, `app.vault.adapter.exists('The Lighthouse/The wreck.md')`);
	const list = await written(p, '  - Epilogue\n  - Prologue\n  - The wreck');
	t.eq(j(list.slice(-3)), j(['Epilogue', 'Prologue', 'The wreck']), 'both at the end, in card order');
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
		await openView(p);
		const sc = `document.querySelector('.workspace-leaf.mod-active .binders-corkboard')`;
		const view = await p.at(`.workspace-leaf.mod-active .binders-corkboard`);
		const a = await at(p, 'Prologue.md');
		await p.move(a.x, a.t + 12, 2);
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.t + 12, button: 'left', clickCount: 1 });
		await p.move(a.x, view.t + view.h - 10, 10, { buttons: 1 });
		await p.sleep(800);
		const top = await p.ev(`${sc}.scrollTop`);
		t.ok(top > 100, 'the board scrolled: ' + top);
		// over Lights out: the line must be at its left edge
		const lo = await at(p, 'Part Two/Lights out.md');
		await p.move(lo.l + 10, lo.y, 6, { buttons: 1 });
		await p.sleep(100);
		const line = await p.ev(`(() => { const r = document.querySelector('.workspace-leaf.mod-active .binders-drop-indicator.is-active')?.getBoundingClientRect(); return r ? { x: Math.round(r.left), t: Math.round(r.top), b: Math.round(r.bottom) } : null; })()`);
		await p.shot(`${SHOTS}/drag-scrolled-${await theme(p)}.png`);
		t.ok(line && Math.abs(line.x - lo.l) < 12 && Math.abs(line.t - lo.t) < 12, `the line by Lights out (${j(line)} vs ${Math.round(lo.l)},${Math.round(lo.t)})`);
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lo.l + 10, y: lo.y, button: 'left', clickCount: 1 });
		await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Prologue.md')`);
		t.eq(j(await written(p, 'Part Two/Prologue\n  - Part Two/Lights out')).includes('Part Two/Prologue'), true, 'dropped there');
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
	await h.run('show-plotgrid');
	await until(p, `app.vault.adapter.read('The Lighthouse/Prologue.md').then(s => s.includes('years. Switch.'))`);
	t.ok((await read(p, L + 'Prologue.md')).includes('years. Switch.'), 'saved on switching to the plot grid');
	await h.run('show-corkboard');
}));

test('synopsis being typed survives a drag of another card', withTidy(async (p, h, t) => {
	await openView(p);
	const s = await p.at(`${card(L + 'Epilogue.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.key('End', 'ctrl');
	await p.type(' While dragging.');
	const a = await at(p, 'Part One/Storm warning.md'), b = await at(p, 'Part One/Arrival.md');
	await drag(p, { x: a.x, y: a.t + 12 }, { x: b.l + 8, y: b.y });
	await until(p, `app.vault.adapter.read('The Lighthouse/Epilogue.md').then(s => s.includes('While dragging.'))`);
	t.ok((await read(p, L + 'Epilogue.md')).includes('museum. While dragging.'), 'the synopsis was saved');
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
	const nc = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
	await p.click(nc.x, nc.y);
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
	const nc = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
	await p.click(nc.x, nc.y);
	const long = 'A'.repeat(300);
	await p.ev(`(() => { document.activeElement.value = ${j(long)}; return 1; })()`);
	await p.key('Enter');
	await p.sleep(800);
	p.errors.length = 0;
	const v = await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-card-new input')?.value ?? null`);
	t.ok(v === long, `the title stays in the field after the error, as a rename’s does (field has ${v?.length ?? 'no'} characters)`);
}));

test('new card: a duplicate title, the folder’s own name, slashes, empty', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, 'The Lighthouse/Part One');
	const newCard = async (title) => {
		await p.ev(`document.querySelectorAll('.notice').forEach(n => n.remove())`); // the last title's notice can cover the card
		const nc = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
		await p.click(nc.x, nc.y);
		await p.type(title);
		await p.key('Enter');
		await p.sleep(500);
		await p.key('Escape');
		await p.sleep(200);
		await p.ev(`document.querySelectorAll('.notice').forEach(n => n.remove())`);
	};
	await newCard('Arrival');
	t.ok(await exists(p, L + 'Part One/Arrival 1.md'), 'a taken name gets a number');
	await newCard('Part One');
	t.ok(await exists(p, L + 'Part One/Part One 1.md') && !(await exists(p, L + 'Part One/Part One.md')), 'the folder’s name gets a number (not the folder note)');
	await newCard('a/b');
	t.ok(!(await exists(p, L + 'Part One/a/b.md')) && !(await exists(p, L + 'Part One/a b.md')), 'a slash is refused');
	p.errors.length = 0;
	await newCard('   ');
	t.eq((await cards(p)).length, 5, 'blank makes nothing');
	same(t, before, await texts(p), { skip: [NOTE] });
}));

test('new card: typing the next title right after Enter loses nothing', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part Two');
	const nc = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
	await p.click(nc.x, nc.y);
	for (const ch of 'One') await p.send('Input.insertText', { text: ch });
	await p.key('Enter');
	for (const ch of 'Two') await p.send('Input.insertText', { text: ch });
	await p.sleep(20);
	await p.key('Enter');
	await p.sleep(800);
	await p.key('Escape');
	t.ok(await exists(p, L + 'Part Two/One.md'), 'One made');
	t.ok(await exists(p, L + 'Part Two/Two.md'), 'Two made, with every letter typed: ' + j((await cards(p)).map((c) => c.split('/').pop())));
}));

test('a new card made while a filter is on stays until the filter changes', withTidy(async (p, h, t) => {
	await openView(p, 'The Lighthouse/Part One');
	await filterBy(p, 'draft');
	const nc = await p.at(`.workspace-leaf.mod-active .binders-group:last-child .binders-card-new`);
	await p.click(nc.x, nc.y);
	await p.type('Filtered');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Filtered.md')`);
	await p.sleep(400);
	await p.key('Escape');
	await p.shot(`${SHOTS}/new-card-filtered-${await theme(p)}.png`);
	t.ok((await cards(p)).includes(L + 'Part One/Filtered.md'), 'the new card shows, though it has no status yet');
	await filterBy(p, 'revised');
	await p.sleep(300);
	t.ok(!(await cards(p)).includes(L + 'Part One/Filtered.md'), 'once the filter changes, the filter decides');
}));

// ---- rename / delete ----

test('renaming a card to its folder’s name is refused (it would become the folder note)', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
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
	t.eq(shown, 7, 'no card vanished');
	void before;
}));

test('dragging a note into a folder of the same name is refused (it would become the folder note)', withTidy(async (p, h, t) => {
	await p.ev(`${B}.newScene(${file('The Lighthouse')}, 1, 'Part Two').then(() => 1)`);
	await p.sleep(300);
	await openView(p);
	const c = await at(p, 'Part Two.md'), w = await at(p, 'Part Two/The wreck.md');
	t.ok(c, 'a top-level note called Part Two');
	await drag(p, { x: c.x, y: c.t + 12 }, { x: w.l + 8, y: w.y });
	await p.sleep(600);
	p.errors.length = 0;
	const became = await exists(p, L + 'Part Two/Part Two.md');
	t.ok(!became, 'refused: it would become Part Two’s folder note and vanish from the board');
}));

test('renaming a stack to the name of a note in it is refused (the note would become its folder note)', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	await p.ev(`(() => { const v = ${VIEW}; v.options = { stacks: true }; v.setMode('plotgrid'); v.setMode('corkboard'); return 1; })()`);
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
	await p.ev(`(() => { const v = ${VIEW}; v.options = { stacks: true }; v.setMode('plotgrid'); v.setMode('corkboard'); return 1; })()`);
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
	await openView(p);
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
	await until(p, `document.querySelectorAll('.binders-view .binders-card[data-path]').length === 14`);
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
	t.eq(j(lefts), j(['done', 'done']), 'both views show the status');
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
	t.eq((await cards(p)).length, 7, 'and back when it returns');
}));

test('an empty binder: one New note card, 0 words, a filter menu that says so', withTidy(async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Empty'); await ${B}.makeBinder(app.vault.getAbstractFileByPath('Empty')); })().then(() => 1)`);
	await until(p, `!!${B}.binderOf('Empty')`);
	await openView(p, 'Empty');
	t.eq(await p.ev(`document.querySelectorAll('.workspace-leaf.mod-active .binders-card-new').length`), 1, 'one New note card');
	t.eq(await p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-word-count').textContent`), '0 words', '0 words');
	const f = await p.at(`.workspace-leaf.mod-active .binders-filter-button`);
	await p.click(f.x, f.y);
	t.eq(j(await menuItems(p)), j(['No statuses or labels to filter by']), 'the filter menu');
	await closeMenus(p);
	await p.shot(`${SHOTS}/empty-binder-${await theme(p)}.png`);
	const nc = await p.at(`.workspace-leaf.mod-active .binders-card-new`);
	await p.click(nc.x, nc.y);
	await p.type('First');
	await p.key('Enter');
	await until(p, `app.vault.adapter.exists('Empty/First.md')`);
	await p.key('Escape');
	await flush(p);
	await until(p, `app.vault.adapter.read('Empty/Empty.md').then(s => s.includes('- First'))`);
	t.ok((await read(p, 'Empty/Empty.md')).includes('- First'), 'listed');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Empty'), true).then(() => 1)`);
}));

test('word counts: cards, headings, stacks and the toolbar agree', withTidy(async (p, h, t) => {
	await openView(p);
	const n = await p.ev(`(() => { const q = (s) => [...document.querySelectorAll('.workspace-leaf.mod-active ' + s)]; const num = (e) => parseInt(e.textContent.split('·').pop().replace(/,/g, ''), 10); return { cards: q('.binders-card[data-path] .binders-card-words').map(num), heads: q('.binders-group-count').map(num), total: num(q('.binders-word-count')[0]) }; })()`);
	t.eq(n.cards.reduce((a, b) => a + b, 0), n.total, 'cards sum to the toolbar');
	t.eq(n.heads[0], n.cards[1] + n.cards[2] + n.cards[3], 'Part One heading');
	t.eq(n.heads[1], n.cards[4] + n.cards[5], 'Part Two heading');
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

test('stacks: status and label on a stack go to its folder note; the heading menu in groups too', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const hd = await p.at(`.workspace-leaf.mod-active .binders-group.is-folder .binders-group-title-row`);
	await p.right(hd.x + 200, hd.y);
	const items = await menuItems(p);
	t.ok(items.includes('Set status') && items.includes('Open'), 'the heading’s menu: ' + items.join(', '));
	await hoverMenu(p, 'Set label');
	await clickMenu(p, 'Green');
	await until(p, `app.vault.adapter.exists('The Lighthouse/Part One/Part One.md')`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-group.is-folder .binders-label-dot.mod-green')`);
	t.ok(await p.ev(`!!document.querySelector('.workspace-leaf.mod-active .binders-group.is-folder .binders-label-dot.mod-green')`), 'the heading shows the label');
	t.eq((await read(p, L + 'Part One/Part One.md')).trim(), '---\nlabel: green\n---', 'in a new folder note');
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
	const a = await at(p, 'Part One/Arrival.md');
	await p.click(a.x, a.t + 12);
	const k = await at(p, 'Part One/The keeper.md');
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await p.key('ArrowRight');
	await p.move(k.x + 10, k.y + 10);
	await p.shot(`${SHOTS}/selected-focus-hover-${th}.png`);
	const s = await p.at(`${card(L + 'Epilogue.md')} .binders-card-synopsis`);
	await p.click(s.x, s.y);
	await p.shot(`${SHOTS}/editing-${th}.png`);
	await p.key('Escape');
	const nc = await p.at(`.workspace-leaf.mod-active .binders-group:nth-child(2) .binders-card-new`);
	await p.click(nc.x, nc.y);
	await p.shot(`${SHOTS}/new-card-${th}.png`);
	await p.key('Escape');
	const w = await at(p, 'Part Two/The wreck.md');
	await p.move(w.x, w.t + 12, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: w.x, y: w.t + 12, button: 'left', clickCount: 1 });
	await p.move(a.l + 6, a.y, 10, { buttons: 1 });
	await p.shot(`${SHOTS}/dragging-${th}.png`);
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
	await p.ev(`(() => { const v = ${VIEW}; v.options = { stacks: true }; v.setMode('plotgrid'); v.setMode('corkboard'); return 1; })()`);
	await p.sleep(400);
	await p.shot(`${SHOTS}/stacks-${th}.png`);
	await p.ev(`(() => { const v = ${VIEW}; v.options = { stacks: false }; v.setMode('plotgrid'); v.setMode('corkboard'); return 1; })()`);
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
test('mobile: a swipe scrolls, a tap selects then edits a synopsis, long press and drag into another group', withTidy(async (p, h, t) => {
	const touch = async (type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
	const tap = async (x, y) => { await touch('touchStart', x, y); await p.sleep(40); await touch('touchEnd'); await p.sleep(250); };
	await reload(p, true);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try {
		const before = await texts(p);
		await openView(p);
		const th = await theme(p);
		await p.shot(`${SHOTS}/mobile-root-${th}.png`);
		const scrollTop = () => p.ev(`document.querySelector('.workspace-leaf.mod-active .binders-corkboard').scrollTop`);
		// a swipe up scrolls
		const a = await at(p, 'Part One/Arrival.md');
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
		const last = await p.ev(`(() => { const n = [...document.querySelectorAll('.workspace-leaf.mod-active .binders-card-new')].pop().getBoundingClientRect(), bar = document.querySelector('.mobile-navbar')?.getBoundingClientRect(); return { newBottom: Math.round(n.bottom), barTop: bar ? Math.round(bar.top) : null }; })()`);
		t.ok(last.barTop == null || last.newBottom <= last.barTop, 'scrolled to the end, the last New note card clears the navigation bar: ' + j(last));
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
		const e = await at(p, 'Part One/The keeper.md');
		await tap(e.x, e.y + 30);
		await until(p, `app.vault.adapter.read('The Lighthouse/Prologue.md').then(s => s.includes('On a phone.'))`);
		t.ok((await read(p, L + 'Prologue.md')).includes('forty years. On a phone.'), 'tapping another card saves it');
		// long press Prologue, drag it into Part Two before The wreck
		const pro = await at(p, 'Prologue.md');
		await p.ev(`document.querySelector('${card(L + 'Part Two/The wreck.md')}').scrollIntoView({ block: 'center' })`);
		await p.sleep(200);
		const pro2 = await at(p, 'Prologue.md');
		const w = await at(p, 'Part Two/The wreck.md');
		if (pro2 && pro2.y > 0) {
			await touch('touchStart', pro2.x, pro2.y);
			await p.sleep(650);
			for (let i = 1; i <= 14; i++) { await touch('touchMove', w.x, pro2.y + (w.t + 10 - pro2.y) * i / 14); await p.sleep(20); }
			await touch('touchEnd');
			await until(p, `app.vault.adapter.exists('The Lighthouse/Part Two/Prologue.md')`);
			t.ok(await exists(p, L + 'Part Two/Prologue.md'), 'moved into Part Two');
		} else t.ok(!!pro, 'Prologue scrolled out: skip drag');
		same(t, before, await texts(p), { skip: [NOTE, L + 'Prologue.md'], moved: { [L + 'Prologue.md']: L + 'Part Two/Prologue.md' } });
	} finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
	}
}));
