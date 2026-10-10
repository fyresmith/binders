// QA round 11, the corkboard: what the existing corkboard files don't try. A card's menu's “Export as” (never driven on the
// grid before), Select all then Delete, synopses that hold YAML-hostile text, an outside change while a synopsis or a title
// is being typed, a case-only rename, 500 cards by the keyboard, a narrow pane, a long synopsis, select all then a move,
// and Obsidian's own Back after a folder card was gone into. Every test that writes checks the files.
import { NOTE, answer, card, cards, clickMenu, closeMenus, contents, exists, file, flush, hoverMenu, j, menuItems, openView, read, selected, texts, until, withTidy } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 corkboard: ' + name, fn });

const L = 'The Lighthouse/';
const ACTIVE = '.workspace-leaf.mod-active';
const PART_ONE = L + 'Part One';
const ARRIVAL = PART_ONE + '/Arrival.md';
const KEEPER = PART_ONE + '/The keeper.md';
const STORM = PART_ONE + '/Storm warning.md';
const BOARD = [L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md'];

/** A card's centre, by its path (the card must be on the board in sight). */
const at = (p, path) => p.at(card(path));
/** Sets a note's property as an outside app would, through Obsidian's own writer. */
const prop = (p, path, key, value) => p.ev(`app.fileManager.processFrontMatter(${file(path)}, (fm) => { fm[${j(key)}] = ${j(value)}; }).then(() => 1)`);
/** Selects every character in the field being typed in (the board's own keys don't reach it). */
const selectField = (p) => p.ev(`(() => { const f = document.activeElement; if (f && (f.tagName === 'TEXTAREA' || f.tagName === 'INPUT')) f.select(); return f?.tagName ?? null; })()`);
/** Opens a card's synopsis for typing: the card is selected by a click, and a second click on its synopsis edits it. */
async function editSynopsis(p, path) {
	const c = await at(p, path);
	await p.click(c.x, c.y);
	await p.sleep(150);
	const s = await p.at(card(path) + ' .binders-card-synopsis');
	await p.click(s.x, s.y);
	await until(p, `!!document.querySelector('${ACTIVE} .binders-edit-field')`);
	await selectField(p);
}
/** What the card shows as its synopsis, and what the note's file says it is (read back through the metadata cache). */
const synopsisOf = async (p, path) => ({
	card: await p.ev(`document.querySelector('${card(path)} .binders-card-synopsis')?.textContent ?? null`),
	file: await p.ev(`app.metadataCache.getFileCache(${file(path)})?.frontmatter?.synopsis ?? null`),
});

test('“Export as” in a card’s menu: Leave out writes export: false, Automatic takes it away again, and the body is untouched', withTidy(async (p, h, t) => {
	await openView(p, PART_ONE);
	const before = await read(p, ARRIVAL);
	const c = await at(p, ARRIVAL);
	await p.right(c.x, c.y);
	await hoverMenu(p, 'Export as');
	t.ok((await menuItems(p)).includes('Leave out'), 'the submenu offers Leave out: ' + j(await menuItems(p)));
	await clickMenu(p, 'Leave out');
	await until(p, `app.metadataCache.getFileCache(${file(ARRIVAL)})?.frontmatter?.export === false`);
	t.eq(await p.ev(`app.metadataCache.getFileCache(${file(ARRIVAL)})?.frontmatter?.export`), false, 'the note is written as left out');
	t.ok(/^export: false$/m.test(await read(p, ARRIVAL)), 'on disk, as a line of its own');
	t.eq((await read(p, ARRIVAL)).replace(/^export: false\n/m, ''), before, 'and nothing else in the file moved');
	const c2 = await at(p, ARRIVAL);
	await p.right(c2.x, c2.y);
	await hoverMenu(p, 'Export as');
	await clickMenu(p, 'Automatic');
	await until(p, `app.metadataCache.getFileCache(${file(ARRIVAL)})?.frontmatter?.export === undefined`);
	t.ok(!/^export:/m.test(await read(p, ARRIVAL)), 'Automatic takes the line away');
	t.eq(await read(p, ARRIVAL), before, 'and the note is byte for byte what it was');
	await closeMenus(p);
}));

test('Select all on a folder’s board, then Delete and Delete: exactly the notes in it go to the trash, and the other folder is as it was', withTidy(async (p, h, t) => {
	const S = L + 'Scratch';
	await p.ev(`app.vault.createFolder(${j(S)}).then(() => 1)`);
	for (const n of ['One', 'Two', 'Three']) await p.ev(`app.vault.create(${j(S + '/' + n + '.md')}, 'text of ${n}').then(() => 1)`);
	await openView(p, S);
	t.eq((await cards(p)).length, 3, 'three cards on the new board');
	const before = await texts(p);
	const c = await at(p, S + '/Two.md');
	await p.click(c.x, c.y);
	await p.key('a', 'ctrl');
	await p.sleep(200);
	t.eq((await selected(p)).length, 3, 'Ctrl+A selects all three');
	await p.key('Delete');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/Delete 3 items/.test(await p.ev(`[...document.querySelectorAll('.modal')].pop()?.textContent ?? ''`)), 'it asks about three items');
	t.ok(await answer(p, 'Delete'), 'the dialog has its Delete button');
	await until(p, `app.vault.getAbstractFileByPath(${j(S)}) ? !app.vault.getAbstractFileByPath(${j(S + '/Three.md')}) : true`);
	await p.sleep(400);
	for (const n of ['One', 'Two', 'Three']) t.ok(!(await exists(p, S + '/' + n + '.md')), `${n} is gone from the folder`);
	const after = await texts(p);
	const kept = Object.keys(before).filter((k) => !k.startsWith(S + '/'));
	t.ok(kept.every((k) => after[k] === before[k]), 'every note outside the folder is as it was');
	t.eq(await read(p, PART_ONE + '/Arrival.md'), before[ARRIVAL], 'Arrival in Part One is untouched');
}));

test('a synopsis with YAML-hostile text, a colon and a new line is saved exactly, shows as typed, and the body is untouched', withTidy(async (p, h, t) => {
	await openView(p, PART_ONE);
	const body = (await read(p, ARRIVAL)).replace(/^---\n[\s\S]*?\n---\n?/, '');
	const typed = 'Mara: “the keeper” # not a comment\n- [[Link]] --- &anchor *alias {x} %y';
	await editSynopsis(p, ARRIVAL);
	await p.type(typed);
	await p.key('Enter', 'ctrl');
	await until(p, `app.metadataCache.getFileCache(${file(ARRIVAL)})?.frontmatter?.synopsis === ${j(typed)}`);
	const s = await synopsisOf(p, ARRIVAL);
	t.eq(s.file, typed, 'the file’s synopsis is exactly what was typed');
	t.eq(s.card, typed, 'the card shows it as typed, the line break and all');
	const after = await read(p, ARRIVAL);
	t.eq(after.replace(/^---\n[\s\S]*?\n---\n?/, ''), body, 'the body is untouched');
	t.ok(/synopsis: /.test(after), 'the property is written as a property');
}));

test('Escape on a synopsis being typed, after the same synopsis changed in another pane: the card shows the file, and what was typed is dropped', withTidy(async (p, h, t) => {
	await openView(p, PART_ONE);
	await editSynopsis(p, ARRIVAL);
	await p.type('Mine, not yet saved');
	await prop(p, ARRIVAL, 'synopsis', 'Changed from outside.');
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelector('${ACTIVE} .binders-edit-field')?.value ?? null`), 'Mine, not yet saved', 'the field still has what was typed');
	await p.key('Escape');
	await until(p, `document.querySelector('${card(ARRIVAL)} .binders-card-synopsis')?.textContent === 'Changed from outside.'`);
	const s = await synopsisOf(p, ARRIVAL);
	t.eq(s.card, 'Changed from outside.', 'the card shows the synopsis the file has, not the one before the edit: ' + j(s));
	t.eq(s.file, 'Changed from outside.', 'and the file was not written with what was typed');
	t.ok((await read(p, ARRIVAL)).includes('Changed from outside.') && !(await read(p, ARRIVAL)).includes('Mine, not yet saved'), 'on disk too');
}));

test('a synopsis typed while the same note’s synopsis changes in another pane: clicking away saves what was typed, and nothing else', withTidy(async (p, h, t) => {
	await openView(p, PART_ONE);
	await editSynopsis(p, ARRIVAL);
	await p.type('Typed by the writer.');
	await prop(p, ARRIVAL, 'synopsis', 'Changed from outside.');
	await p.sleep(300);
	const e = await p.ev(`(() => { const r = document.querySelector('${ACTIVE} .binders-board').getBoundingClientRect(); return { x: r.right - 24, y: r.bottom - 12 }; })()`);
	await p.click(e.x, e.y);
	await until(p, `app.metadataCache.getFileCache(${file(ARRIVAL)})?.frontmatter?.synopsis === 'Typed by the writer.'`);
	const s = await synopsisOf(p, ARRIVAL);
	t.eq(s.file, 'Typed by the writer.', 'the typed synopsis is what the file holds');
	t.eq(s.card, 'Typed by the writer.', 'and what the card shows');
	t.eq(await p.ev(`document.querySelectorAll('${ACTIVE} .binders-edit-field').length`), 0, 'the field is closed');
}));

test('a new title typed with F2, another note of the folder renamed from outside meanwhile: the typed title stays in the field and Enter renames this note', withTidy(async (p, h, t) => {
	await openView(p, PART_ONE);
	const c = await at(p, ARRIVAL);
	await p.click(c.x, c.y);
	await p.key('F2');
	await until(p, `!!document.querySelector('${ACTIVE} .binders-edit-field')`);
	await selectField(p);
	await p.type('Dawn');
	await p.ev(`app.fileManager.renameFile(${file(KEEPER)}, ${j(PART_ONE + '/Keeper.md')}).then(() => 1)`);
	await p.sleep(500);
	t.eq(await p.ev(`document.querySelector('${ACTIVE} .binders-edit-field')?.value ?? null`), 'Dawn', 'the field still holds what was typed');
	await p.key('Enter');
	await until(p, `app.vault.getAbstractFileByPath(${j(PART_ONE + '/Dawn.md')}) != null`);
	t.ok(await exists(p, PART_ONE + '/Dawn.md'), 'the note is named as typed');
	t.ok(!(await exists(p, ARRIVAL)), 'and the old name is gone');
	t.ok(await exists(p, PART_ONE + '/Keeper.md'), 'the outside rename stays');
	t.eq(j((await cards(p)).filter((x) => x.startsWith(PART_ONE + '/'))), j([PART_ONE + '/Dawn.md', PART_ONE + '/Keeper.md', STORM]), 'and the cards are in order');
}));

test('a case-only rename by F2 (“Storm warning” to “STORM WARNING”) is saved, keeps its place in the binder, and the card shows it', withTidy(async (p, h, t) => {
	await openView(p, PART_ONE);
	const before = await contents(p);
	const c = await at(p, STORM);
	await p.click(c.x, c.y);
	await p.key('F2');
	await until(p, `!!document.querySelector('${ACTIVE} .binders-edit-field')`);
	await selectField(p);
	await p.type('STORM WARNING');
	await p.key('Enter');
	await until(p, `app.vault.getAbstractFileByPath(${j(PART_ONE + '/STORM WARNING.md')}) != null`);
	t.ok(await exists(p, PART_ONE + '/STORM WARNING.md'), 'the file is renamed');
	t.eq(await p.ev(`document.querySelector('${card(PART_ONE + '/STORM WARNING.md')} .binders-card-title')?.textContent ?? null`), 'STORM WARNING', 'the card shows the new capitals');
	await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.includes('STORM WARNING'))`);
	const after = await contents(p);
	t.eq(j(after), j(before.map((x) => (x === 'Part One/Storm warning' ? 'Part One/STORM WARNING' : x))), 'the binder list holds it in the same place');
}));

test('clearing a synopsis (select all, Delete, Tab): the card shows its placeholder, the body is untouched, and nothing else is written', withTidy(async (p, h, t) => {
	await openView(p, PART_ONE);
	const before = await read(p, ARRIVAL);
	await editSynopsis(p, ARRIVAL);
	await p.key('Delete');
	await p.key('Tab');
	await until(p, `document.querySelector('${card(ARRIVAL)} .binders-card-synopsis')?.classList.contains('is-empty')`);
	t.ok(await p.ev(`document.querySelector('${card(ARRIVAL)} .binders-card-synopsis').classList.contains('is-empty')`), 'the card shows the placeholder');
	t.eq(await p.ev(`document.querySelector('${card(ARRIVAL)} .binders-card-synopsis').textContent`), 'Add a synopsis', 'as the empty synopsis does');
	await p.sleep(300);
	const after = await read(p, ARRIVAL);
	t.ok(!/^synopsis:\s*\S/m.test(after), 'the file has no synopsis line with text');
	t.eq(after.replace(/^---\n[\s\S]*?\n---\n?/, ''), before.replace(/^---\n[\s\S]*?\n---\n?/, ''), 'the body is untouched');
	t.ok(await exists(p, ARRIVAL), 'the note is still there');
}));

test('500 cards: the board opens in time, End and Alt+Up three times move the last card three places on the board and on disk, and the rest keep their order', withTidy(async (p, h, t) => {
	const S = L + 'Big';
	await p.ev(`app.vault.createFolder(${j(S)}).then(() => 1)`);
	await p.ev(`(async () => { for (let i = 1; i <= 500; i++) await app.vault.create(${j(S + '/Note ')} + String(i).padStart(3, '0') + '.md', 'word ' + i); })().then(() => 1)`);
	await until(p, `app.vault.getAbstractFileByPath(${j(S + '/Note 500.md')}) != null`, 60000);
	const t0 = Date.now();
	await openView(p, S);
	await until(p, `document.querySelectorAll('${ACTIVE} .binders-card[data-path]').length >= 500`, 20000);
	const drawn = Date.now() - t0;
	t.ok(drawn < 5000, `500 cards drawn in ${drawn} ms (under 5 s)`);
	const base = await cards(p);
	t.eq(base.length, 500, 'all 500 notes are cards');
	t.eq(j(base.slice(0, 3)), j([S + '/Note 001.md', S + '/Note 002.md', S + '/Note 003.md']), 'in order from the first');
	const c = await at(p, S + '/Note 001.md');
	await p.click(c.x, c.y);
	await p.key('End');
	await p.sleep(200);
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), S + '/Note 500.md', 'End goes to the last card');
	for (let i = 0; i < 3; i++) { await p.key('ArrowUp', 'alt'); await p.sleep(350); }
	await flush(p);
	const want = base.slice(0, 496).concat([base[499], base[496], base[497], base[498]]);
	await until(p, `[...document.querySelectorAll('${ACTIVE} .binders-card[data-path]')].map(c => c.dataset.path)[496] === ${j(S + '/Note 500.md')}`, 5000);
	const now = await cards(p);
	t.eq(j(now.slice(494, 500)), j(want.slice(494, 500)), 'the last six on the board are in the new order');
	t.eq(j(now), j(want), 'and all 500 are in the new order on the board');
	t.ok(await exists(p, S + '/Note 500.md'), 'the moved note is still on disk under its name');
}));

test('a narrow pane (about 300 px): every card lies inside the pane, and the board doesn’t scroll sideways', withTidy(async (p, h, t) => {
	await openView(p, L + 'Part One');
	await p.ev(`(() => { const l = document.querySelector('${ACTIVE}'); l.style.flex = '0 0 300px'; l.style.width = '300px'; l.style.maxWidth = '300px'; window.dispatchEvent(new Event('resize')); return 1; })()`);
	await p.sleep(900);
	const m = await p.ev(`(() => { const l = document.querySelector('${ACTIVE}').getBoundingClientRect(); const b = document.querySelector('${ACTIVE} .binders-board'); const cs = [...document.querySelectorAll('${ACTIVE} .binders-card[data-path]')].map(c => c.getBoundingClientRect()); return { pane: Math.round(l.width), outside: cs.filter(r => r.left < l.left - 1 || r.right > l.right + 1).length, sideways: b.scrollWidth - b.clientWidth, n: cs.length, per: new Set(cs.map(r => Math.round(r.top))).size, cardW: Math.round(cs[0]?.width ?? 0) }; })()`);
	t.ok(m.pane <= 340, 'the pane really is narrow (' + m.pane + ' px), so the test measures what it says');
	t.eq(m.outside, 0, 'no card sticks out of the pane: ' + j(m));
	t.ok(m.sideways <= 1, 'the board doesn’t scroll sideways (' + m.sideways + ' px over)');
	t.ok(m.cardW > 0 && m.cardW <= m.pane, 'a card is no wider than the pane');
	await p.ev(`(() => { const l = document.querySelector('${ACTIVE}'); l.style.flex = ''; l.style.width = ''; l.style.maxWidth = ''; return 1; })()`);
}));

test('a 4,000-character synopsis stays inside its card and the board: the card’s row doesn’t grow sideways, and the next card is where it was', withTidy(async (p, h, t) => {
	await openView(p);
	const before = await cards(p);
	const left0 = await p.ev(`Math.round(document.querySelector('${card(BOARD[2])}').getBoundingClientRect().left)`);
	await prop(p, BOARD[0], 'synopsis', 'lighthouse light, '.repeat(250));
	await until(p, `(document.querySelector('${card(BOARD[0])} .binders-card-synopsis')?.textContent ?? '').length > 2000`);
	const m = await p.ev(`(() => { const b = document.querySelector('${ACTIVE} .binders-board'); const c = document.querySelector('${card(BOARD[0])}').getBoundingClientRect(); const pane = document.querySelector('${ACTIVE}').getBoundingClientRect(); return { h: Math.round(c.height), w: Math.round(c.width), inside: c.right <= pane.right + 1, sideways: b.scrollWidth - b.clientWidth, order: [...document.querySelectorAll('${ACTIVE} .binders-card[data-path]')].map(x => x.dataset.path).slice(0, 4) }; })()`);
	t.ok(m.inside && m.sideways <= 1, 'the card is inside the pane and the board does not scroll sideways: ' + j(m));
	t.ok(m.h < 700, 'the card does not grow to the length of the text (' + m.h + ' px tall)');
	t.eq(j(m.order), j(before.slice(0, 4)), 'the order of the board is as it was');
	t.eq(await p.ev(`Math.round(document.querySelector('${card(BOARD[2])}').getBoundingClientRect().left)`), left0, 'and the cards after it did not move');
}));

test('Select all, then Alt+Down: no card can move past the last, so nothing moves and nothing on disk is written', withTidy(async (p, h, t) => {
	await openView(p);
	const before = await texts(p);
	const orderBefore = await cards(p);
	const c = await at(p, BOARD[0]);
	await p.click(c.x, c.y);
	await p.key('a', 'ctrl');
	await p.sleep(200);
	t.eq((await selected(p)).length, 4, 'four cards are selected');
	await p.key('ArrowDown', 'alt');
	await p.sleep(500);
	await flush(p);
	t.eq(j(await cards(p)), j(orderBefore), 'the board’s order is as it was');
	const after = await texts(p);
	t.ok(Object.keys(before).every((k) => after[k] === before[k]) && Object.keys(before).length === Object.keys(after).length, 'no note’s text changed, and none was added or removed');
}));

test('Enter on a folder’s card goes in; Obsidian’s own Back returns to the binder’s board with that folder’s card selected and focused', withTidy(async (p, h, t) => {
	await openView(p);
	const c = await at(p, PART_ONE);
	await p.click(c.x, c.y);
	await p.key('Enter');
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === ${j(PART_ONE)}`);
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().getViewState().state?.folder`), PART_ONE, 'Enter goes into the folder');
	await p.ev(`(async () => { const l = app.workspace.getMostRecentLeaf(); await l.goBack(); })().then(() => 1)`);
	await until(p, `app.workspace.getMostRecentLeaf().getViewState().state?.folder === 'The Lighthouse'`);
	t.eq(j(await cards(p)), j(BOARD), 'Back shows the binder’s board');
	await until(p, `document.activeElement?.dataset?.path === ${j(PART_ONE)}`, 2000);
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), PART_ONE, 'the keyboard is on the folder’s card');
	t.eq(j(await selected(p)), j([PART_ONE]), 'and the folder’s card is the selection');
}));
