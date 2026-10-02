// QA round 6, the boards: the corkboard (grid and arranged by label), the outliner and the view shell, with the
// folder card that names what it holds (0.12.17), the outliner's column code (0.12.14) and what both boards share
// (0.12.16: cardKey, sumWords, numberCards, overPane). Tests named "BUG: …" or "UX: …" fail until what they show is fixed.
import { B, NOTE, VIEW, card, cards, clickMenu, closeMenus, contents, exists, file, flush, j, menuItems, openView, read, reload, same, selected, split, texts, until, viewState, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa6 boards: ' + name, fn });

const L = 'The Lighthouse/';
const ACTIVE = '.workspace-leaf.mod-active';
/** What a folder's card names: the names, which have a label's dot, its words, and its description for a screen reader. */
const heldOf = (p, path) => p.ev(`(() => { const c = document.querySelector('${ACTIVE} .binders-card[data-path="${path}"]'); if (!c) return null;
	return { names: [...c.querySelectorAll('.binders-card-held-item')].map(r => r.textContent), dots: [...c.querySelectorAll('.binders-card-held-item')].map(r => !!r.querySelector('.binders-label-dot')),
	words: c.querySelector('.binders-card-words')?.textContent, desc: c.getAttribute('aria-description'), subs: [...c.querySelectorAll('.binders-card-held-icon')].length }; })()`);
/** Sets a note's property as a person's other pane or an external edit would, through Obsidian. */
const prop = (p, path, key, value) => p.ev(`app.fileManager.processFrontMatter(${file(path)}, (fm) => { if (${j(value)} === null) delete fm[${j(key)}]; else fm[${j(key)}] = ${j(value)}; }).then(() => 1)`);
const settle = (p, ms = 500) => p.sleep(ms);

test('a folder’s card names what it holds, in order, and follows a rename, a relabel, a reorder, a move in and out, a delete and a note made elsewhere', withTidy(async (p, h, t) => {
	await openView(p);
	const P1 = L + 'Part One';
	let s = await heldOf(p, P1);
	t.eq(j(s.names), j(['Arrival', 'The keeper', 'Storm warning']), 'its three notes');
	t.eq(j(s.dots), j([false, false, false]), 'none has a label');
	// a rename
	await p.ev(`app.fileManager.renameFile(${file(P1 + '/Arrival.md')}, ${j(P1 + '/Landfall.md')}).then(() => 1)`);
	await settle(p);
	t.eq(j((await heldOf(p, P1)).names), j(['Landfall', 'The keeper', 'Storm warning']), 'a rename shows');
	// a label
	await prop(p, P1 + '/The keeper.md', 'label', 'Blue');
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${P1}"] .binders-label-dot')`);
	t.eq(j((await heldOf(p, P1)).dots), j([false, true, false]), 'a label shows its dot');
	await prop(p, P1 + '/The keeper.md', 'label', null);
	await settle(p);
	t.eq(j((await heldOf(p, P1)).dots), j([false, false, false]), 'and removing it takes the dot away');
	// a reorder
	await p.ev(`(async () => { const b = ${B}; const f = app.vault.getAbstractFileByPath(${j(P1)}); await b.move(b.orderedChildren(f)[2], f, 0); })().then(() => 1)`);
	await settle(p);
	t.eq(j((await heldOf(p, P1)).names), j(['Storm warning', 'Landfall', 'The keeper']), 'a reorder shows');
	// a note made by another pane
	await p.ev(`app.vault.create(${j(P1 + '/Fourth.md')}, 'x').then(() => 1)`);
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${P1}"] .binders-card-words')?.textContent.startsWith('4 notes')`);
	s = await heldOf(p, P1);
	t.ok(s.names.includes('Fourth'), 'a new note shows: ' + j(s));
	t.ok(s.words.startsWith('4 notes'), 'and is counted: ' + s.words);
	// moved out, into another folder
	await p.ev(`app.fileManager.renameFile(${file(P1 + '/Fourth.md')}, ${j(L + 'Part Two/Fourth.md')}).then(() => 1)`);
	await settle(p, 800);
	s = await heldOf(p, P1);
	t.ok(!s.names.includes('Fourth') && s.words.startsWith('3 notes'), 'a note moved out is gone from it: ' + j(s));
	t.ok((await heldOf(p, L + 'Part Two')).names.includes('Fourth'), 'and on the folder it went into');
	// deleted
	await p.ev(`app.vault.delete(${file(L + 'Part Two/Fourth.md')}).then(() => 1)`);
	await settle(p, 800);
	t.eq(j((await heldOf(p, L + 'Part Two')).names), j(['The wreck', 'Lights out']), 'a delete shows');
}));

/** Changes the view's state as the workspace would restore it: `patch` (mode, filter, folder) and `options` merged in. */
const setView = async (p, patch = {}, options = {}) => {
	await p.ev(`(async () => { const v = ${VIEW}; const s = v.getState(); await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...s, ...${j(patch)}, options: { ...s.options, ...${j(options)} } } }); })().then(() => 1)`);
	await p.sleep(450);
};
const make = (p, path, text = '') => p.ev(`app.vault.create(${j(path)}, ${j(text)}).then(() => 1)`);
const mkdir = (p, path) => p.ev(`app.vault.createFolder(${j(path)}).then(() => 1)`);

test('a folder’s card: an empty folder, one of only subfolders, one of seven, with a synopsis added and removed, and in each size', withTidy(async (p, h, t) => {
	await openView(p);
	await mkdir(p, L + 'Empty');
	await mkdir(p, L + 'Subs'); await mkdir(p, L + 'Subs/Inner'); await mkdir(p, L + 'Subs/Other');
	await mkdir(p, L + 'Many');
	for (let i = 1; i <= 7; i++) await make(p, L + `Many/Note ${i}.md`, `word ${i}`);
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${L}Many"] .binders-card-held-item')`);
	await p.sleep(400);
	t.eq(j(await heldOf(p, L + 'Empty')), j({ names: [], dots: [], words: '0 notes · 0 words', desc: '0 notes · 0 words', subs: 0 }), 'an empty folder names nothing (and has no empty list)');
	const subs = await heldOf(p, L + 'Subs');
	t.eq(j(subs.names), j(['Inner', 'Other']), 'a folder of only folders names them');
	t.eq(subs.subs, 2, 'each with its glyph');
	const many = await heldOf(p, L + 'Many');
	t.eq(many.names.length, 5, 'only five of seven are named');
	t.eq(many.words, '7 notes · 14 words', 'and all seven are counted');
	// a synopsis written, then taken away
	await prop(p, L + 'Many/Note 1.md', 'label', 'Red');
	await p.ev(`app.vault.create(${j(L + 'Many/Many.md')}, '---\\nsynopsis: Seven in all.\\n---\\n').then(() => 1)`);
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${L}Many"] .binders-card-synopsis')?.textContent === 'Seven in all.'`);
	t.eq((await heldOf(p, L + 'Many')).names.length, 5, 'a synopsis added leaves the names');
	await writeRaw(p, L + 'Many/Many.md', '---\n---\n');
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${L}Many"] .binders-card-synopsis')?.textContent === ''`);
	t.eq(j((await heldOf(p, L + 'Many')).dots), j([true, false, false, false, false]), 'the synopsis taken away, the names and the first one’s dot are still there');
	// every size: the names are drawn and no card is shorter than another's of the same row
	for (const size of ['small', 'large', 'medium']) {
		await setView(p, {}, { cardSize: size });
		const m = await p.ev(`(() => { const c = document.querySelector('${ACTIVE} .binders-card[data-path="${L}Many"]'), h = c.querySelector('.binders-card-held'); const r = c.getBoundingClientRect(), hr = h.getBoundingClientRect(); const rows = [...h.children].filter(x => x.getBoundingClientRect().bottom <= hr.bottom + 1 && x.getBoundingClientRect().height > 0).length; return { h: Math.round(r.height), held: Math.round(hr.height), rows, inside: hr.bottom <= r.bottom, footer: c.querySelector('.binders-card-footer').getBoundingClientRect().top >= hr.bottom - 1 }; })()`);
		t.ok(m.inside && m.footer, `${size}: the names stay inside the card and above its foot: ` + j(m));
	}
}));

test('a folder’s card under a filter names the notes that pass and every folder, counts the rest, and follows the filter and a note changing meanwhile', withTidy(async (p, h, t) => {
	await openView(p);
	const P1 = L + 'Part One';
	await mkdir(p, P1 + '/Sub');
	await prop(p, P1 + '/Arrival.md', 'label', 'Red');
	await prop(p, P1 + '/The keeper.md', 'label', 'Blue');
	await until(p, `app.metadataCache.getFileCache(${file(P1 + '/The keeper.md')})?.frontmatter?.label === 'Blue'`);
	await setView(p, { filter: { status: [], label: ['Red'] } });
	let s = await heldOf(p, P1);
	t.eq(j(s.names), j(['Arrival', 'Sub']), 'the red note and the folder');
	t.ok(/^1 of 3 notes/.test(s.words), 'it counts what passes out of all: ' + s.words);
	t.ok(/1 of 3 notes/.test(s.desc), 'and says so aloud');
	// a note starts to pass
	await prop(p, P1 + '/The keeper.md', 'label', 'Red');
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${P1}"] .binders-card-words')?.textContent.startsWith('2 of 3')`);
	t.eq(j((await heldOf(p, P1)).names), j(['Arrival', 'The keeper', 'Sub']), 'a note that now passes is named, in its place');
	// and one stops
	await prop(p, P1 + '/Arrival.md', 'label', 'Green');
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${P1}"] .binders-card-words')?.textContent.startsWith('1 of 3')`);
	t.eq(j((await heldOf(p, P1)).names), j(['The keeper', 'Sub']), 'a note that stops passing goes');
	// the filter lifted
	await setView(p, { filter: { status: [], label: [] } });
	s = await heldOf(p, P1);
	t.eq(j(s.names), j(['Arrival', 'The keeper', 'Storm warning', 'Sub']), 'with no filter, all of them');
	t.ok(s.words.startsWith('3 notes'), 'counted all');
	// a filter that passes nothing in the folder
	await setView(p, { filter: { status: [], label: ['Pink'] } });
	s = await heldOf(p, P1);
	t.eq(j(s.names), j(['Sub']), 'a folder that holds nothing that passes still names its folders');
	await setView(p, { filter: { status: [], label: [] } });
}));

test('a folder’s card arranged by label, across and down: it names what it holds there too, and follows a change', withTidy(async (p, h, t) => {
	await openView(p);
	for (const lines of ['across', 'down']) {
		await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines });
		await until(p, `document.querySelector('${ACTIVE} .binders-lanes .binders-card.is-stack')`);
		const names = await p.ev(`[...document.querySelectorAll('${ACTIVE} .binders-lanes .binders-card.is-stack')].map(c => c.dataset.path + ': ' + [...c.querySelectorAll('.binders-card-held-item')].map(r => r.textContent).join('|'))`);
		t.eq(j(names), j([L + 'Part One: Arrival|The keeper|Storm warning', L + 'Part Two: The wreck|Lights out']), `${lines}: the stacks name their notes`);
		await p.ev(`app.fileManager.renameFile(${file(L + 'Part Two/The wreck.md')}, ${j(L + 'Part Two/The wreck 2.md')}).then(() => 1)`);
		await until(p, `[...document.querySelectorAll('${ACTIVE} .binders-lanes .binders-card.is-stack[data-path="${L}Part Two"] .binders-card-held-name')].some(e => e.textContent === 'The wreck 2')`);
		await p.ev(`app.fileManager.renameFile(${file(L + 'Part Two/The wreck 2.md')}, ${j(L + 'Part Two/The wreck.md')}).then(() => 1)`);
		await until(p, `[...document.querySelectorAll('${ACTIVE} .binders-lanes .binders-card.is-stack[data-path="${L}Part Two"] .binders-card-held-name')].some(e => e.textContent === 'The wreck')`);
	}
}));

// ---- the outliner's columns, by keyboard ----
const OL = `${ACTIVE} .binders-outliner`;
const HEAD = `${OL} .binders-outliner-th`;
const toOutliner = async (p) => { await openView(p); await setView(p, { mode: 'outliner' }); await until(p, `document.querySelector('${HEAD}[data-col="title"]')`); await p.sleep(300); };
/** Where the keyboard is: `th:<column>`, `add` (the “+”), `row:<path>`, the outliner itself, or something else. */
const where = (p) => p.ev(`(() => { const a = document.activeElement; if (!a) return null; if (a.classList.contains('binders-outliner-th')) return a.classList.contains('mod-add') ? 'add' : 'th:' + a.dataset.col; if (a.closest('.binders-outliner-row')) return 'row:' + a.closest('.binders-outliner-row').dataset.path; if (a.classList.contains('binders-outliner')) return 'outliner'; return a.tagName + '.' + a.className; })()`);
const focusHead = (p, col) => p.ev(`document.querySelector('${HEAD}[data-col="${col}"]').focus()`);
const menuPick = async (p, title) => {
	const items = await menuItems(p), i = items.indexOf(title);
	if (i < 0) throw new Error(`no “${title}” in ${items.join(', ')}`);
	for (let k = 0; k <= i; k++) await p.key('ArrowDown');
	await p.key('Enter');
	await p.sleep(350);
};

test('BUG: the outliner: after a column’s menu sorts, moves or hides by keyboard, the keyboard is still on that column’s header (it was thrown out to the rows: the header is drawn again)', async (p, h, t) => {
	await toOutliner(p);
	const seen = {};
	await focusHead(p, 'status');
	await p.key('Enter'); await p.sleep(200);
	await menuPick(p, 'Sort ascending');
	seen.sort = await where(p);
	await focusHead(p, 'status');
	await p.key('Enter'); await p.sleep(200);
	await menuPick(p, 'Move left');
	seen.move = await where(p);
	await focusHead(p, 'status');
	await p.key('Enter'); await p.sleep(200);
	await menuPick(p, 'Hide column');
	seen.hide = await where(p);
	t.eq(j([seen.sort, seen.move]), j(['th:status', 'th:status']), 'after Sort ascending and Move left, on the header of that column');
	t.ok(/^th:|^add$/.test(seen.hide), 'after Hide column, on another header or the “+”, not thrown out to the rows: ' + seen.hide);
});

test('BUG: the outliner: after the “+” shows or hides a column by keyboard, the keyboard is still on the “+”', async (p, h, t) => {
	await toOutliner(p);
	await p.ev(`document.querySelector('${HEAD}.mod-add').focus()`);
	await p.key('Enter'); await p.sleep(250);
	await menuPick(p, 'Target');
	t.eq(await where(p), 'add', 'after adding Target');
	t.ok(await p.ev(`!!document.querySelector('${HEAD}[data-col="target"]')`), 'the column was added');
});

// ---- what both boards share: numbers and word sums ----
/** The notes' numbers as drawn, in the order the cards are in the page; and every card's words. */
const numbersOf = (p) => p.ev(`[...document.querySelectorAll('${ACTIVE} .binders-card[data-path]')].map(c => { const n = c.querySelector(':scope > .binders-card-head > .binders-card-number'); return [c.dataset.path.replace('${L}', ''), n && getComputedStyle(n).display !== 'none' ? n.textContent : '']; })`);
const wordsOf = (p, path) => p.ev(`document.querySelector('${ACTIVE} .binders-card[data-path="${path}"] .binders-card-words')?.textContent ?? null`);
/** The numbers are 1, 2, 3 … down the notes in page order, and no folder has one. */
function consecutive(t, list, say) {
	let n = 0;
	for (const [path, num] of list) {
		const folder = !path.endsWith('.md');
		t.eq(num, folder ? '' : String(++n), `${say}: ${path}`);
	}
}
const BOARDS = [['the grid', { arrange: 'grid' }], ['by label, across', { arrange: 'label', lines: 'across' }], ['by label, down', { arrange: 'label', lines: 'down' }]];

test('numbers and word counts on each board stay true after a rename, a relabel, a note made, moved and deleted elsewhere, an outside edit, a filter and a visit to another mode', withTidy(async (p, h, t) => {
	await openView(p);
	for (const [name, options] of BOARDS) {
		await setView(p, { mode: 'corkboard', filter: { status: [], label: [] } }, { ...options, numbers: true });
		await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path]')`);
		await p.sleep(300);
		consecutive(t, await numbersOf(p), name + ', at first');
		const P1 = L + 'Part One';
		// a note made by another pane, in the folder shown and in a folder
		await make(p, L + 'Added.md', 'one two three');
		await make(p, P1 + '/Added too.md', 'four five six seven');
		await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${L}Added.md"]')`);
		await p.sleep(500);
		consecutive(t, await numbersOf(p), name + ', after notes were made');
		t.ok((await wordsOf(p, P1)).startsWith('4 notes · 55 words'), name + ': the folder counts its new note: ' + await wordsOf(p, P1));
		// an outside edit changes a note's words, and its folder's
		await writeRaw(p, P1 + '/Added too.md', 'four five six seven eight nine ten');
		await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${P1}"] .binders-card-words')?.textContent.startsWith('4 notes · 58 words')`, 4000);
		t.ok((await wordsOf(p, P1)).startsWith('4 notes · 58 words'), name + ': an outside edit changes the folder’s words: ' + await wordsOf(p, P1));
		t.eq(await wordsOf(p, L + 'Added.md'), '3 words', name + ': and a note’s own is unchanged');
		// a move of a note elsewhere, then a delete, then a rename
		await p.ev(`app.fileManager.renameFile(${file(L + 'Added.md')}, ${j(L + 'Part Two/Added.md')}).then(() => 1)`);
		await until(p, `!document.querySelector('${ACTIVE} .binders-card[data-path="${L}Added.md"]')`);
		await p.sleep(400);
		consecutive(t, await numbersOf(p), name + ', after a note went into a folder');
		t.ok((await wordsOf(p, L + 'Part Two')).startsWith('3 notes · 31 words'), name + ': Part Two counts it: ' + await wordsOf(p, L + 'Part Two'));
		await p.ev(`app.vault.delete(${file(L + 'Prologue.md')}).then(() => 1)`);
		await until(p, `!document.querySelector('${ACTIVE} .binders-card[data-path="${L}Prologue.md"]')`);
		await p.sleep(400);
		consecutive(t, await numbersOf(p), name + ', after a delete');
		// a filter
		await prop(p, L + 'Epilogue.md', 'label', 'Red');
		await settle(p);
		await setView(p, { filter: { status: [], label: ['Red'] } });
		consecutive(t, await numbersOf(p), name + ', with a filter');
		await setView(p, { filter: { status: [], label: [] } });
		// to another mode and back
		await setView(p, { mode: 'outliner' });
		await setView(p, { mode: 'corkboard' });
		await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path]')`);
		consecutive(t, await numbersOf(p), name + ', after the outliner');
		// put things back for the next board
		await p.ev(`app.vault.delete(${file(P1 + '/Added too.md')}).then(() => 1)`);
		await p.ev(`app.vault.delete(${file(L + 'Part Two/Added.md')}).then(() => 1)`);
		await prop(p, L + 'Epilogue.md', 'label', null);
		await p.ev(`app.vault.create(${j(L + 'Prologue.md')}, 'x').then(() => 1)`).catch(() => {});
		await settle(p, 600);
		await setView(p, {}, { numbers: true });
	}
}));

// ---- the board changing underneath ----
async function hold(p, from, to, steps = 12) {
	await p.focusMain();
	await p.move(from.x, from.y, 2);
	await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
	await p.move(to.x, to.y, steps, { buttons: 1 });
	await p.sleep(200);
}
const letGo = async (p, at) => { await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }); await p.sleep(500); };
const grip = async (p, path) => { const a = await p.at(card(path)); if (!a) throw new Error('no card ' + path); return { x: a.x, y: a.t + 14 }; };
const clean = (t, p) => p.errors.length === 0 || t.ok(false, 'logged: ' + p.errors.join(' ; '));

test('a stack’s synopsis typed while a note inside it is renamed, another made and the folder note made elsewhere: what’s typed is saved to the folder note, the names catch up after', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const P2 = L + 'Part Two';
	const syn = `${card(P2)} .binders-card-synopsis`;
	const s = await grip(p, P2);
	await p.right(s.x, s.y);
	await clickMenu(p, 'Edit synopsis');
	await until(p, `document.activeElement.matches('${syn} textarea')`);
	await p.type('Where the wreck lies.');
	await p.ev(`app.fileManager.renameFile(${file(P2 + '/The wreck.md')}, ${j(P2 + '/The hulk.md')}).then(() => 1)`);
	await make(p, P2 + '/Third.md', 'a b c');
	await p.sleep(500);
	t.ok(await p.ev(`document.activeElement.matches('${syn} textarea')`), 'still editing');
	t.eq(await p.ev(`document.activeElement.value`), 'Where the wreck lies.', 'what was typed is there');
	await p.type(' Cold.');
	await p.ev(`document.activeElement.blur()`);
	await until(p, `app.vault.adapter.exists(${j(P2 + '/Part Two.md')})`);
	await flush(p);
	await p.sleep(500);
	t.ok(/synopsis: Where the wreck lies\. Cold\./.test(await read(p, P2 + '/Part Two.md')), 'the folder note has the synopsis');
	const s2 = await heldOf(p, P2);
	t.eq(j(s2.names), j(['The hulk', 'Lights out', 'Third']), 'and the card names what is in the folder now');
	t.ok(s2.words.startsWith('3 notes'), 'and counts it: ' + s2.words);
	t.ok(!(await cards(p)).some((c) => c.endsWith('Part Two.md')), 'the folder note is not a card');
	const after = await texts(p);
	same(t, before, after, { skip: [NOTE, P2 + '/Part Two.md', P2 + '/The wreck.md'] });
	t.eq(after[P2 + '/The hulk.md'], before[P2 + '/The wreck.md'], 'the renamed note’s text is whole');
	clean(t, p);
}));

test('a card carried while its note is deleted by another pane: dropped on a stack, nothing comes back, nothing is thrown, and the board is whole', withTidy(async (p, h, t) => {
	await openView(p);
	const a = await grip(p, L + 'Epilogue.md'), two = await p.at(card(L + 'Part Two'));
	await hold(p, a, { x: two.x, y: two.y });
	await p.ev(`app.vault.delete(${file(L + 'Epilogue.md')}).then(() => 1)`);
	await p.sleep(400);
	await letGo(p, { x: two.x, y: two.y });
	await p.sleep(600);
	t.ok(!(await exists(p, L + 'Epilogue.md')) && !(await exists(p, P2 + '/Epilogue.md')), 'the note is not brought back anywhere');
	t.eq(j(await cards(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two']), 'three cards are left');
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-dragging, .is-being-dragged-over').length`), 0, 'nothing of the drag is left');
	t.eq(j((await heldOf(p, L + 'Part Two')).names), j(['The wreck', 'Lights out']), 'Part Two is as it was');
	clean(t, p);
}));
const P2 = L + 'Part Two';

test('a card carried onto a stack whose folder is deleted by another pane meanwhile: nothing is lost or thrown', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p);
	const a = await grip(p, L + 'Epilogue.md'), two = await p.at(card(L + 'Part Two'));
	await hold(p, a, { x: two.x, y: two.y });
	await p.ev(`app.vault.delete(${file(L + 'Part Two')}, true).then(() => 1)`);
	await p.sleep(400);
	await letGo(p, { x: two.x, y: two.y });
	await p.sleep(600);
	t.ok(await exists(p, L + 'Epilogue.md'), 'Epilogue is where it was');
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-drop-indicator, .is-dragging, .is-being-dragged-over').length`), 0, 'nothing of the drag is left');
	const text = await read(p, L + 'Epilogue.md').catch(() => null);
	t.eq(text, before[L + 'Epilogue.md'], 'its text is whole');
	clean(t, p);
}));

// ---- selection and focus carried through a change of mode or of arrangement ----
const sels = (p) => p.ev(`({ cards: [...document.querySelectorAll('${ACTIVE} .binders-card.is-selected')].map(c => c.dataset.path.split('/').pop()), rows: [...document.querySelectorAll('${ACTIVE} .binders-outliner-row.is-selected')].map(c => c.dataset.path.split('/').pop()), focus: document.activeElement?.dataset?.path?.split('/').pop() ?? null })`);
const gotoCard = async (p, path) => { const c = await p.at(card(path)); await p.click(c.x, c.t + 14); };

test('BUG: Arrange (by label, back to a grid) keeps the card the writer was on after a look at the outliner and back, as a switch of mode does', async (p, h, t) => {
	await openView(p, L + 'Part One');
	await gotoCard(p, L + 'Part One/The keeper.md');
	await p.ev(`${VIEW}.setMode('outliner')`); await p.sleep(700);
	t.eq(j((await sels(p)).rows), j(['The keeper.md']), 'the outliner opens on the card');
	await p.ev(`${VIEW}.setMode('corkboard')`); await p.sleep(1000);
	t.eq(j(await sels(p)), j({ cards: ['The keeper.md'], rows: [], focus: 'The keeper.md' }), 'the corkboard comes back on it');
	await p.ev(`${VIEW}.arrange('label', 'across')`); await p.sleep(800);
	t.eq(j(await sels(p)), j({ cards: ['The keeper.md'], rows: [], focus: 'The keeper.md' }), 'arranged by label: still on it (it opened on the first card, nothing selected)');
	await p.ev(`${VIEW}.arrange('grid')`); await p.sleep(800);
	t.eq(j((await sels(p)).cards), j(['The keeper.md']), 'and back in the grid');
});

test('BUG: arranged by label with a filter on, a line’s count adds up the notes its folder cards show (“1 of 3 notes”), not every note in the folders', withTidy(async (p, h, t) => {
	await openView(p);
	await prop(p, L + 'Part One/Arrival.md', 'label', 'Red');
	await settle(p);
	await setView(p, { mode: 'corkboard', filter: { status: [], label: ['Red'] } }, { arrange: 'label', lines: 'across' });
	await until(p, `document.querySelector('${ACTIVE} .binders-lanes .binders-lane-head')`);
	const s = await p.ev(`({
		cards: [...document.querySelectorAll('${ACTIVE} .binders-lanes .binders-card.is-stack')].map(c => c.dataset.path.split('/').pop() + ': ' + c.querySelector('.binders-card-words').textContent),
		head: [...document.querySelectorAll('${ACTIVE} .binders-lane-head[data-lane="0"]')].map(h => h.getAttribute('aria-label')),
		count: document.querySelector('${ACTIVE} .binders-lane-head[data-lane="0"] .binders-lane-count')?.textContent ?? null })`);
	t.eq(j(s.cards), j(['Part One: 1 of 3 notes · 18 words', 'Part Two: 0 of 2 notes · 0 words']), 'what the folder cards say');
	t.eq(s.count, '1', 'the “No label” line counts what those cards show (' + j(s) + ')');
	await setView(p, { filter: { status: [], label: [] } });
}));

// ---- the outliner's columns, right to left ----
const rtl = (p, on) => p.ev(`(() => { app.vault.setConfig('rightToLeft', ${on}); document.body.classList.toggle('mod-rtl', ${on}); document.body.dir = ${on ? "'rtl'" : "''"}; return 1; })()`);
const cols = (p) => p.ev(`[...document.querySelectorAll('${HEAD}[data-col]')].map(e => e.dataset.col)`);
const thBox = (p, col) => p.ev(`(() => { const r = document.querySelector('${HEAD}[data-col="${col}"]').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; })()`);

test('the outliner right to left: a header’s edge resizes toward the reading side, a header dragged and Alt+arrows move it the way the pointer or the arrow points, and the arrow keys walk the headers by sight', async (p, h, t) => {
	await toOutliner(p);
	try {
		await rtl(p, true);
		await p.sleep(500);
		t.eq(j(await cols(p)), j(['title', 'label', 'status', 'words']), 'the columns, in reading order');
		const lab = await thBox(p, 'label'), st = await thBox(p, 'status');
		t.ok(lab.l > st.l, 'Label is to the right of Status: it comes first, as a reader of Hebrew sees it');
		// a resize: the edge is on the left of a column; pulling it left makes it wider
		const edge = await p.at(`${HEAD}[data-col="status"] .binders-outliner-resizer`);
		const w0 = st.w;
		await p.move(edge.x, edge.y, 2);
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: edge.x, y: edge.y, button: 'left', clickCount: 1 });
		await p.move(edge.x - 50, edge.y, 8, { buttons: 1 });
		const during = (await thBox(p, 'status')).w;
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: edge.x - 50, y: edge.y, button: 'left', clickCount: 1 });
		await p.sleep(300);
		t.ok(Math.abs(during - (w0 + 50)) <= 2, `pulled toward the left, the column is 50 px wider (${w0} to ${during})`);
		t.ok(Math.abs((await thBox(p, 'status')).w - (w0 + 50)) <= 2, 'and it stays so after the drop');
		// keyboard: ArrowLeft goes to the header on the left (the next one, reading from the right)
		await focusHead(p, 'label');
		await p.key('ArrowLeft');
		t.eq(await where(p), 'th:status', 'ArrowLeft from Label is the header to its left');
		await p.key('ArrowLeft', 'alt');
		await p.sleep(300);
		t.eq(j(await cols(p)), j(['title', 'label', 'words', 'status']), 'Alt+Left moves Status to the left');
		t.eq(await where(p), 'th:status', 'with the keyboard still on it');
		// a header dragged to the left
		const w = await p.at(`${HEAD}[data-col="words"]`), lb = await p.at(`${HEAD}[data-col="label"]`);
		await p.move(w.x, w.y, 2);
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: w.x, y: w.y, button: 'left', clickCount: 1 });
		await p.move(w.l + 6, w.y, 3, { buttons: 1 });
		await p.move(lb.l + lb.w - 6, lb.y, 10, { buttons: 1 });
		await p.sleep(150);
		const line = await p.ev(`(() => { const l = document.querySelector('.binders-drop-indicator.is-vertical.is-active'); if (!l) return null; const r = l.getBoundingClientRect(); return Math.round(r.left); })()`);
		await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: lb.l + lb.w - 6, y: lb.y, button: 'left', clickCount: 1 });
		await p.sleep(300);
		t.ok(line !== null, 'a line shows where it will go');
		t.eq(j(await cols(p)), j(['title', 'words', 'label', 'status']), 'dragged to the right of Label, Words is before it in the order');
	} finally { await rtl(p, false); }
});

// ---- editing in place on the board arranged by label ----
const bySel = (path) => `${ACTIVE} .binders-lanes .binders-card[data-path="${path}"]`;
const laneNo = (p, path) => p.ev(`Number(document.querySelector(${j(bySel(path))})?.dataset.lane ?? -1)`);

test('by label: a synopsis typed on a card whose label is changed meanwhile is saved whole, and the card then goes to its new line; Escape drops it; F2 renames, and a name that’s taken stays in the field', withTidy(async (p, h, t) => {
	const before = await texts(p);
	for (const lines of ['across', 'down']) {
		await openView(p, L + 'Part One');
		await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines });
		await until(p, `document.querySelector('${bySel(L + 'Part One/The keeper.md')}')`);
		await p.sleep(300);
		const path = L + 'Part One/The keeper.md', syn = `${bySel(path)} .binders-card-synopsis`;
		t.eq(await laneNo(p, path), 0, `${lines}: on the “No label” line`);
		const c = await p.at(bySel(path));
		await p.click(c.x, c.t + 14); // select the card
		const s = await p.at(syn);
		await p.click(s.x, s.y); // then its synopsis edits
		await until(p, `document.activeElement.matches('${syn} textarea')`);
		await p.key('End', 'ctrl');
		await p.type(' And more.');
		await prop(p, path, 'label', 'Green');
		await p.sleep(600);
		t.ok(await p.ev(`document.activeElement.matches('${syn} textarea')`), `${lines}: the field is still there after the label changed`);
		t.eq(await p.ev(`document.activeElement.value`), 'The keeper refuses to let her into the tower. And more.', `${lines}: with what was typed`);
		t.eq(await laneNo(p, path), 0, `${lines}: the card waits where it is while it is typed in`);
		await p.ev(`document.activeElement.blur()`);
		await until(p, `app.vault.adapter.read(${j(path)}).then(s => s.includes('And more.'))`);
		await p.sleep(500);
		const text = await read(p, path);
		t.ok(/label: Green/.test(text) && /synopsis: The keeper refuses to let her into the tower\. And more\./.test(text), `${lines}: both the label and the synopsis are in the note`);
		t.eq(await laneNo(p, path), 4, `${lines}: the card is on the Green line now`);
		// Escape drops what is typed
		const s2 = await p.at(syn);
		await p.click(s2.x, s2.y);
		await until(p, `document.activeElement.matches('${syn} textarea')`);
		await p.type(' Never kept.');
		await p.key('Escape');
		await p.sleep(300);
		t.ok(!/Never kept/.test(await read(p, path)), `${lines}: Escape keeps nothing`);
		t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), path, `${lines}: the keyboard is back on the card`);
		// F2: a name already taken stays in the field, with a notice
		await p.key('F2');
		await until(p, `document.activeElement.matches('input')`);
		await p.type('Arrival');
		await p.key('Enter');
		await p.sleep(400);
		t.ok(await p.ev(`document.activeElement.matches('${bySel(path)} input')`), `${lines}: a taken name stays in the field`);
		t.ok(await exists(p, path), `${lines}: nothing was renamed`);
		await p.key('Escape');
		await p.sleep(200);
		await p.key('F2');
		await until(p, `document.activeElement.matches('input')`);
		await p.type('The lamp');
		await p.key('Enter');
		await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The lamp.md')})`);
		await p.sleep(500);
		t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), L + 'Part One/The lamp.md', `${lines}: renamed, and the keyboard is on its card`);
		// put it back for the next run through
		await p.ev(`app.fileManager.renameFile(${file(L + 'Part One/The lamp.md')}, ${j(path)}).then(() => 1)`);
		await writeRaw(p, path, before[path]);
		await p.sleep(600);
	}
	const after = await texts(p);
	t.eq(split(after[L + 'Part One/The keeper.md']).body, split(before[L + 'Part One/The keeper.md']).body, 'the note’s text is untouched');
}));

// ---- a title being typed when the view goes ----
const closeTab = (p) => p.ev(`(() => { app.workspace.getMostRecentLeaf().detach(); return 1; })()`);
for (const [kind, setup, target] of [['corkboard', async (p) => { await openView(p, L + 'Part One'); }, (path) => `${ACTIVE} .binders-card[data-path="${path}"] .binders-card-title`],
	['outliner', async (p) => { await toOutliner(p); }, (path) => `${OL} .binders-outliner-row[data-path="${path}"] .binders-outliner-title`]]) {
	for (const leave of ['the tab is closed', 'the mode is switched', 'another card is clicked']) {
		test(`a ${kind} title typed (no Enter) is saved when ${leave}: the note is renamed, its text whole`, withTidy(async (p, h, t) => {
			const before = await texts(p);
			await setup(p);
			const path = L + 'Part One/The keeper.md';
			const sel = await p.at(kind === 'corkboard' ? card(path) : `${OL} .binders-outliner-row[data-path="${path}"]`);
			await p.click(sel.x, sel.t + 14);
			await p.key('F2');
			await until(p, `document.activeElement.matches('input')`);
			await p.type('The lamp room');
			if (leave === 'the tab is closed') await closeTab(p);
			else if (leave === 'the mode is switched') await p.ev(`${VIEW}.setMode(${j(kind === 'corkboard' ? 'outliner' : 'corkboard')})`);
			else { const o = await p.at(kind === 'corkboard' ? card(L + 'Part One/Arrival.md') : `${OL} .binders-outliner-row[data-path="${L}Part One/Arrival.md"]`); await p.click(o.x, o.t + 14); }
			await until(p, `app.vault.adapter.exists(${j(L + 'Part One/The lamp room.md')})`, 3000);
			t.ok(await exists(p, L + 'Part One/The lamp room.md'), 'renamed to what was typed');
			t.ok(!(await exists(p, path)), 'the old name is gone');
			await p.sleep(400);
			const after = await texts(p);
			t.eq(after[L + 'Part One/The lamp room.md'], before[path], 'its text is whole');
		}));
	}
}

// ---- a long run of changes made elsewhere, with each board checked against the vault as it goes ----
/** A small seeded generator, so a failure can be run again. */
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
/** What each board should show, worked out from the vault by the test (not by the plugin's own code for counts). */
const expected = (p, folder, filter, flat = false) => p.ev(`(() => {
	const store = ${B}, filter = ${j(filter)}, words = (f) => app.vault.cachedRead(f).then(s => (s.replace(/^---\\n[\\s\\S]*?\\n---\\n?/, '').match(/\\S+/g) || []).length);
	const fm = (f) => app.metadataCache.getFileCache(f)?.frontmatter ?? {};
	const passes = (f) => (!filter.status.length || filter.status.map(x => x.toLowerCase()).includes(String(fm(f).status ?? '').toLowerCase())) && (!filter.label.length || filter.label.map(x => x.toLowerCase()).includes(String(fm(f).label ?? '').toLowerCase()));
	const kids = (d) => (store.orderedChildren(d) ?? []).filter(c => c.children || c.extension === 'md');
	const notesIn = (d) => kids(d).flatMap(c => c.children ? notesIn(c) : [c]);
	return (async () => {
		const out = [];
		let n = 0;
		for (const c of ${flat ? 'notesIn' : 'kids'}(app.vault.getAbstractFileByPath(${j(folder)}))) {
			if (c.children) {
				const all = notesIn(c), shown = filter.status.length || filter.label.length ? all.filter(passes) : all;
				let w = 0; for (const f of shown) w += await words(f);
				out.push({ path: c.path, held: kids(c).filter(x => x.children || !(filter.status.length || filter.label.length) || passes(x)).slice(0, 5).map(x => x.children ? x.name : x.basename), count: shown.length === all.length ? all.length + (all.length === 1 ? ' note' : ' notes') : shown.length + ' of ' + all.length + ' notes', words: w, num: '' });
			} else if (passes(c) || !(filter.status.length || filter.label.length)) out.push({ path: c.path, words: await words(c), num: String(++n) });
		}
		return out;
	})();
})()`);
/** The outliner's rows from the vault: depth first, a folder before what it holds, with the words of what shows. */
const expectedRows = (p, filter) => p.ev(`(() => {
	const store = ${B}, filter = ${j(filter)}, on = filter.status.length || filter.label.length, words = (f) => app.vault.cachedRead(f).then(s => (s.replace(/^---\\n[\\s\\S]*?\\n---\\n?/, '').match(/\\S+/g) || []).length);
	const fm = (f) => app.metadataCache.getFileCache(f)?.frontmatter ?? {};
	const passes = (f) => (!filter.status.length || filter.status.map(x => x.toLowerCase()).includes(String(fm(f).status ?? '').toLowerCase())) && (!filter.label.length || filter.label.map(x => x.toLowerCase()).includes(String(fm(f).label ?? '').toLowerCase()));
	const kids = (d) => (store.orderedChildren(d) ?? []).filter(c => c.children || c.extension === 'md');
	const notesIn = (d) => kids(d).flatMap(c => c.children ? notesIn(c) : [c]);
	return (async () => {
		const out = [];
		const walk = async (d, depth) => {
			for (const c of kids(d)) {
				if (c.children) {
					const all = notesIn(c).filter(f => !on || passes(f));
					if (on && !all.length) continue;
					let w = 0; for (const f of all) w += await words(f);
					out.push({ path: c.path, depth, words: w });
					await walk(c, depth + 1);
				} else if (!on || passes(c)) out.push({ path: c.path, depth, words: await words(c) });
			}
		};
		await walk(app.vault.getAbstractFileByPath('The Lighthouse'), 0);
		return out;
	})();
})()`);
const rowsOn = (p) => p.ev(`[...document.querySelectorAll('${ACTIVE} .binders-outliner-row')].map(r => ({ path: r.dataset.path, depth: Number(r.getAttribute('aria-level')) - 1, words: Number((r.querySelector('[data-col="words"]')?.textContent ?? '').replace(/,/g, '')) }))`);
const shownOn = (p) => p.ev(`[...document.querySelectorAll('${ACTIVE} .binders-card[data-path]')].map(c => { const n = c.querySelector(':scope > .binders-card-head > .binders-card-number'); const w = c.querySelector('.binders-card-words')?.textContent ?? ''; return { path: c.dataset.path, held: [...c.querySelectorAll('.binders-card-held-name')].map(e => e.textContent), text: w, num: n && getComputedStyle(n).display !== 'none' ? n.textContent : '' }; })`);
function compare(t, want, got, say) {
	t.eq(j(got.map((c) => c.path)), j(want.map((c) => c.path)), say + ': the cards');
	want.forEach((w, i) => {
		const g = got[i];
		if (!g || g.path !== w.path) return;
		if (w.held) {
			t.eq(j(g.held), j(w.held), `${say}: ${w.path} names`);
			const m = /^(.*?)(?: · ([\d,]+) words?)?$/.exec(g.text);
			t.eq(m?.[1], w.count, `${say}: ${w.path} count`);
			t.eq(Number((m?.[2] ?? '0').replace(/,/g, '')), w.words, `${say}: ${w.path} words`);
		} else t.eq(g.text, `${w.words} ${w.words === 1 ? 'word' : 'words'}`, `${say}: ${w.path} words`);
		t.eq(g.num, w.num, `${say}: ${w.path} number`);
	});
}

test('a run of 60 changes made elsewhere (renames, moves, deletes, new notes, labels, outside edits, reorders), with a filter on and off: the grid and both lines of the board by label match the vault after each handful', withTidy(async (p, h, t) => {
	const seed = Number(process.env.QA6_SEED || 7);
	const rand = rng(seed), pick = (a) => a[Math.floor(rand() * a.length)];
	await openView(p);
	await setView(p, { mode: 'corkboard', filter: { status: [], label: [] } }, { arrange: 'grid', numbers: true });
	const log = [];
	let serial = 0;
	const notes = () => p.ev(`app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(L)}) && f.path !== ${j(NOTE)} && !/(^|\\/)(Part One|Part Two)\\/\\1\\.md$/.test(f.path)).map(f => f.path)`);
	const folders = ['The Lighthouse', 'The Lighthouse/Part One', 'The Lighthouse/Part Two'];
	/** Folders now in the binder (not the binder's own), by path. */
	const subs = () => p.ev(`app.vault.getAllLoadedFiles().filter(f => f.children && f.path.startsWith(${j(L)})).map(f => f.path)`);
	const word = (n) => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
	const ops = {
		async rename() { const f = pick(await notes()); const to = f.replace(/[^/]*$/, `Renamed ${++serial}.md`); log.push(`rename ${f} -> ${to}`); await p.ev(`app.fileManager.renameFile(${file(f)}, ${j(to)}).then(() => 1)`); },
		async move() { const f = pick(await notes()), d = pick([L.slice(0, -1), ...(await subs())]); const to = d + '/' + f.split('/').pop(); if (to === f || await exists(p, to)) return; log.push(`move ${f} -> ${to}`); await p.ev(`app.fileManager.renameFile(${file(f)}, ${j(to)}).then(() => 1)`); },
		async del() { const all = await notes(); if (all.length < 4) return; const f = pick(all); log.push(`delete ${f}`); await p.ev(`app.vault.delete(${file(f)}).then(() => 1)`); },
		async make() { const d = pick([L.slice(0, -1), ...(await subs())]), f = `${d}/Made ${++serial}.md`; log.push(`make ${f}`); await make(p, f, word(1 + Math.floor(rand() * 9))); },
		async label() { const f = pick(await notes()), l = pick(['Red', 'Blue', null]); log.push(`label ${f} ${l}`); await prop(p, f, 'label', l); },
		async status() { const f = pick(await notes()), l = pick(['Draft', 'Done', null]); log.push(`status ${f} ${l}`); await prop(p, f, 'status', l); },
		async edit() { const f = pick(await notes()), n = 1 + Math.floor(rand() * 40); log.push(`edit ${f} ${n} words`); await writeRaw(p, f, (await read(p, f)).replace(/^(---\n[\s\S]*?\n---\n)?[\s\S]*$/, (m, y) => (y ?? '') + word(n) + '\n')); },
		async reorder() { const d = pick([L.slice(0, -1), ...(await subs())]); log.push(`reorder in ${d}`); await p.ev(`(async () => { const b = ${B}, f = app.vault.getAbstractFileByPath(${j(d)}), k = b.orderedChildren(f); if (k.length > 1) await b.move(k[k.length - 1], f, 0); })().then(() => 1)`); },
		async newFolder() { if ((await p.ev(`app.vault.getAllLoadedFiles().filter(f => f.children && f.path.startsWith(${j(L)})).length`)) > 5) return; const f = `${L}Folder ${++serial}`; log.push(`folder ${f}`); await mkdir(p, f); folders.push(f); },
	};
	// folders: renamed, nested into another, emptied of their place by a delete
	ops.renameFolder = async () => { const all = await subs(); if (!all.length) return; const f = pick(all), to = f.replace(/[^/]*$/, `Folder ${++serial}`); log.push(`rename folder ${f} -> ${to}`); await p.ev(`app.fileManager.renameFile(${file(f)}, ${j(to)}).then(() => 1)`); };
	ops.nestFolder = async () => { const all = await subs(); if (all.length < 2) return; const f = pick(all), into = pick(all); if (into === f || into.startsWith(f + '/') || f.slice(0, f.lastIndexOf('/')) === into) return; const to = into + '/' + f.split('/').pop(); if (await p.ev(`!!app.vault.getAbstractFileByPath(${j(to)})`)) return; log.push(`nest folder ${f} -> ${to}`); await p.ev(`app.fileManager.renameFile(${file(f)}, ${j(to)}).then(() => 1)`); };
	ops.rmFolder = async () => { const all = await subs(); if (all.length < 3) return; const f = pick(all); log.push(`delete folder ${f}`); await p.ev(`app.vault.delete(${file(f)}, true).then(() => 1)`); };
	// "Undo last move" and "Redo last move", when there is one (a move made by the store, or a drop on a board)
	for (const redo of [false, true]) ops[redo ? 'redo' : 'undo'] = async () => { log.push(redo ? 'redo move' : 'undo move'); await p.ev(`(() => { const c = app.commands.findCommand('binders:${redo ? 'redo' : 'undo'}-move'); if (c?.checkCallback?.(true)) app.commands.executeCommandById(c.id); return 1; })()`); };
	const names = Object.keys(ops);
	const arrangements = [['the grid', { arrange: 'grid' }], ['by label, across', { arrange: 'label', lines: 'across' }], ['by label, down', { arrange: 'label', lines: 'down' }], ['by label, with the notes in folders', { arrange: 'label', lines: 'across', linesFlat: true }]];
	let filter = { status: [], label: [] };
	const check = async (say) => {
		await flush(p);
		await p.sleep(700);
		for (const [name, options] of arrangements) {
			await setView(p, { filter }, { linesFlat: false, ...options });
			await p.sleep(250);
			const want = await expected(p, 'The Lighthouse', filter, !!options.linesFlat);
			const got = await shownOn(p);
			try { compare(t, want, got, `${say}, ${name}, filter ${j(filter)}`); }
			catch (e) { throw new Error(e.message + '\n  seed ' + seed + ', changes so far:\n  ' + log.join('\n  ')); }
		}
		await setView(p, { mode: 'outliner', filter });
		await p.sleep(400);
		try { t.eq(j(await rowsOn(p)), j(await expectedRows(p, filter)), `${say}, the outliner, filter ${j(filter)}: its rows, their depth and words`); }
		catch (e) { throw new Error(e.message + '\n  seed ' + seed + ', changes so far:\n  ' + log.join('\n  ')); }
		await setView(p, { mode: 'corkboard' });
	};
	for (let i = 1; i <= 60; i++) {
		await pick(names.map((n) => ops[n]))();
		if (i % 6 === 0) {
			if (i % 18 === 0) filter = pick([{ status: [], label: [] }, { status: [], label: ['Red'] }, { status: ['Draft'], label: [] }, { status: ['Draft'], label: ['Blue'] }]);
			await check(`after ${i}`);
		}
	}
	t.eq(p.errors.length, 0, 'nothing logged');
}));

// ---- where the keyboard is after a card leaves the board by its menu ----
test('BUG: “Move to” (a card’s menu) into another folder leaves the keyboard on a card next to where it was, on the corkboard and in the outliner (it goes to the first card, or off the board)', async (p, h, t) => {
	const seen = {};
	for (const kind of ['corkboard', 'outliner']) {
		await openView(p, L + 'Part One');
		if (kind === 'outliner') await setView(p, { mode: 'outliner' }); else await setView(p, { mode: 'corkboard' }, { arrange: 'grid' });
		await p.sleep(400);
		const sel = kind === 'corkboard' ? card(L + 'Part One/Storm warning.md') : `${OL} .binders-outliner-row[data-path="${L}Part One/Storm warning.md"]`;
		const c = await p.at(sel);
		await p.click(c.x + 20, c.t + 14);
		await p.key('ContextMenu');
		await p.sleep(250);
		await hoverMenuItem(p, 'Move to');
		await clickMenu(p, 'Part Two');
		await until(p, `app.vault.adapter.exists(${j(L + 'Part Two/Storm warning.md')})`);
		await p.sleep(700);
		seen[kind] = await p.ev(`(() => { const a = document.activeElement; return (a?.dataset?.path ?? a?.closest?.('[data-path]')?.dataset?.path ?? a?.tagName + '.' + a?.className)?.replace(${j(L)}, ''); })()`);
		// put it back
		await p.ev(`app.fileManager.renameFile(${file(L + 'Part Two/Storm warning.md')}, ${j(L + 'Part One/Storm warning.md')}).then(() => 1)`);
		await p.sleep(500);
	}
	// next to where it was: The keeper, the card before it (it was last in its folder)
	const near = (x) => x === 'Part One/The keeper.md';
	t.ok(near(seen.corkboard) && near(seen.outliner), 'where the keyboard is after: ' + j(seen));
});
const hoverMenuItem = async (p, title) => {
	const pos = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!pos) throw new Error('no menu item ' + title);
	await p.move(pos.x, pos.y, 3);
	await p.click(pos.x, pos.y);
	await p.sleep(300);
};

// ---- the keyboard after each thing a card’s or a row’s menu does (the keyboard user never loses their place) ----
/** Where the keyboard is after an action, by what it holds: a path, or `view` (somewhere in the view, not on an item) or `outside`. */
const keyboardAt = (p) => p.ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return 'nowhere'; const it = a.closest('[data-path]'); if (it && it.closest('.binders-view')) return it.dataset.path.replace(${j(L)}, ''); return a.closest('.binders-view') ? 'view' : 'outside'; })()`);

const ACTIONS = [
	{ say: 'Set status', path: 'Part One/The keeper.md', pick: ['Set status', 'Done'], stays: true },
	{ say: 'Set label', path: 'Part One/The keeper.md', pick: ['Set label', 'Green'], stays: true },
	{ say: 'Move up', path: 'Part One/The keeper.md', pick: ['Move up'], stays: true },
	{ say: 'Move down', path: 'Part One/The keeper.md', pick: ['Move down'], stays: true },
	{ say: 'Include in compile', path: 'Part One/The keeper.md', pick: ['Include in compile'], stays: true },
	{ say: 'Duplicate', path: 'Part One/The keeper.md', pick: ['Duplicate'], to: /^Part One\/The keeper 2\.md$/ },
	{ say: 'Put in a new folder', path: 'Part One/The keeper.md', pick: ['Put in a new folder'], to: /^view$|^Part One\/(The keeper|[^/]*)$/ },
	{ say: 'Ungroup (a folder’s)', path: 'Part Two', pick: ['Ungroup'], to: /^(Part Two|Part Two\/(The wreck|Lights out)\.md|Prologue\.md|Part One|Epilogue\.md|The wreck\.md|Lights out\.md)$/ },
];
for (const kind of ['corkboard', 'outliner']) {
	for (const a of ACTIONS) {
		test(`${kind}: after “${a.say}” in the menu, opened by the keyboard, the keyboard is still on an item of the view`, withTidy(async (p, h, t) => {
			await openView(p, a.path.startsWith('Part One/') ? L + 'Part One' : L.slice(0, -1));
			await setView(p, { mode: kind }, kind === 'corkboard' ? { arrange: 'grid' } : {});
			await p.sleep(500);
			const sel = kind === 'corkboard' ? card(L + a.path) : `${OL} .binders-outliner-row[data-path="${L}${a.path}"]`;
			const c = await p.at(sel);
			await p.click(c.x + 20, c.t + 14);
			t.eq(await keyboardAt(p), a.path, 'the keyboard starts on the item');
			await p.key('ContextMenu');
			await p.sleep(300);
			const items = await menuItems(p);
			if (!items.includes(a.pick[0])) { await closeMenus(p); t.ok(true, `(no “${a.pick[0]}” in this menu: ${items.join(', ')})`); return; }
			if (a.pick.length > 1) { await hoverMenuItem(p, a.pick[0]); await clickMenu(p, a.pick[1]); } else await clickMenu(p, a.pick[0]);
			await p.sleep(900);
			let at = await keyboardAt(p);
			if (/^(view|nowhere|outside)$/.test(at) && !(a.to && a.to.test(at))) {
				t.ok(false, `where the keyboard is: ${at}`);
			}
			if (a.stays) t.eq(at, a.path, 'and on that same item');
			else if (a.to && !/^view$/.test(at)) t.ok(a.to.test(at), `on an item next to where it was (${at})`);
			// a dialog may have been opened (a name, a confirmation): close it
			await p.ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`);
		}));
	}
}

// ---- a drag whose button was let go while the window was away ----
for (const kind of ['corkboard', 'by label', 'outliner']) {
	test(`BUG: ${kind}: a drag whose button was let go while another window had the focus (no pointerup ever comes) ends at the next move with no button down; it doesn’t stay in hand until the next click drops it`, withTidy(async (p, h, t) => {
		const before = await texts(p);
		await openView(p);
		if (kind === 'corkboard') await setView(p, { mode: 'corkboard' }, { arrange: 'grid' });
		else if (kind === 'by label') await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines: 'across' });
		else await setView(p, { mode: 'outliner' });
		await p.sleep(500);
		const item = (name) => (kind === 'outliner' ? `${OL} .binders-outliner-row[data-path="${L}${name}"]` : kind === 'by label' ? bySel(L + name) : card(L + name));
		const a = await p.at(item('Epilogue.md')), b = await p.at(item('Prologue.md'));
		const from = { x: a.x + (kind === 'outliner' ? 40 : 0), y: a.t + 14 };
		await p.move(from.x, from.y, 2);
		await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
		await p.move(b.x + 20, b.y, 12, { buttons: 1 });
		await p.sleep(200);
		const held = () => p.ev(`!!document.querySelector('.binders-drag-ghost, .binders-outliner-ghost') || document.body.classList.contains('is-grabbing')`);
		t.ok(await held(), 'the card is in hand');
		// (the button was let go elsewhere: the page is told of nothing but a pointer that moves with no button down)
		await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x + 40, y: b.y + 10, button: 'none', buttons: 0 });
		await p.sleep(300);
		await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x + 60, y: b.y + 20, button: 'none', buttons: 0 });
		await p.sleep(300);
		const stuck = await held();
		await p.click(b.x + 60, b.y + 20);
		await p.sleep(700);
		const moved = (await read(p, NOTE)) !== before[NOTE];
		t.ok(!stuck && !moved, `the drag is over, and the click that follows is only a click (still in hand: ${stuck}; a card was dropped by it: ${moved})`);
	}));
}

// ---- the board taking the keyboard when it shouldn't ----
for (const kind of ['corkboard', 'outliner']) {
	test(`BUG: ${kind}: an empty binder opened beside a note being typed in doesn’t take the keyboard when its first note arrives (made elsewhere, or synced)`, withTidy(async (p, h, t) => {
		await p.ev(`(async () => { await app.vault.createFolder('Empty'); await ${B}.makeBinder(app.vault.getAbstractFileByPath('Empty')); })().then(() => 1)`);
		await until(p, `!!${B}.binderOf('Empty')`);
		await openView(p, 'Empty');
		if (kind === 'outliner') await setView(p, { mode: 'outliner' });
		await p.sleep(400);
		// a note in a pane beside it, with the cursor in it
		await p.ev(`(async () => { const leaf = app.workspace.getLeaf('split', 'vertical'); await leaf.openFile(${file(L + 'Prologue.md')}); app.workspace.setActiveLeaf(leaf, { focus: true }); })().then(() => 1)`);
		await until(p, `document.activeElement?.closest('.markdown-source-view, .cm-editor')`);
		await p.sleep(400);
		await p.type('Typing here. ');
		const inEditor = () => p.ev(`!!document.activeElement?.closest('.cm-editor')`);
		t.ok(await inEditor(), 'the cursor is in the note');
		await make(p, 'Empty/First.md', 'one two');
		await until(p, `document.querySelector('.binders-view .binders-card[data-path="Empty/First.md"], .binders-view .binders-outliner-row[data-path="Empty/First.md"]')`, 4000);
		await p.sleep(700);
		t.ok(await inEditor(), 'and it is still there when the binder’s first note shows up (now: ' + await p.ev(`document.activeElement?.className`) + ')');
		await p.type('More. ');
		t.ok((await p.ev(`app.workspace.getLeavesOfType('markdown').some(l => l.view.editor?.getValue().includes('Typing here. More. '))`)), 'what is typed goes into the note');
		await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath('Empty'), true).then(() => 1)`);
	}));
}

// ---- the binder changing under a carried card or row, on each board ----
for (const kind of ['by label', 'outliner']) {
	for (const change of ['the carried note is deleted', 'a note beside it is renamed and another made', 'the folder it is over is deleted', 'the folder shown is renamed']) {
		test(`${kind}: a card or row carried while ${change}, then dropped: nothing is lost or thrown, nothing of the drag is left, and the board matches the vault`, withTidy(async (p, h, t) => {
			const before = await texts(p);
			await openView(p);
			if (kind === 'by label') await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines: 'across', linesFlat: false });
			else await setView(p, { mode: 'outliner' });
			await p.sleep(500);
			const item = (path) => (kind === 'outliner' ? `${OL} .binders-outliner-row[data-path="${path}"]` : bySel(path));
			const a = await p.at(item(L + 'Epilogue.md')), two = await p.at(item(P2));
			const from = { x: a.x + (kind === 'outliner' ? 40 : 0), y: a.t + 14 };
			await hold(p, from, { x: two.x + (kind === 'outliner' ? 40 : 0), y: two.y });
			if (change === 'the carried note is deleted') await p.ev(`app.vault.delete(${file(L + 'Epilogue.md')}).then(() => 1)`);
			else if (change === 'a note beside it is renamed and another made') { await p.ev(`app.fileManager.renameFile(${file(L + 'Prologue.md')}, ${j(L + 'Opening.md')}).then(() => 1)`); await make(p, L + 'Extra.md', 'a b c'); }
			else if (change === 'the folder it is over is deleted') await p.ev(`app.vault.delete(${file(P2)}, true).then(() => 1)`);
			else await p.ev(`app.fileManager.renameFile(${file(L.slice(0, -1))}, 'The Beacon').then(() => 1)`);
			await p.sleep(500);
			await letGo(p, { x: two.x + (kind === 'outliner' ? 40 : 0), y: two.y });
			await p.sleep(900);
			t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-outliner-ghost, .binders-drop-indicator.is-active, .is-dragging, .is-being-dragged-over, .is-drop-target').length`), 0, 'nothing of the drag is left');
			t.eq(await p.ev(`document.body.classList.contains('is-grabbing')`), false, 'and the pointer is no longer grabbing');
			// the board matches the vault (whatever the drop did)
			const top = await p.ev(`${VIEW}.getState().folder`);
			const want = (await expected(p, top, { status: [], label: [] }, false)).map((c) => c.path);
			const got = await p.ev(`[...document.querySelectorAll('${ACTIVE} .binders-card[data-path]')].map(c => c.dataset.path)`);
			if (kind === 'by label') t.eq(j(got), j(want), 'the cards are the folder’s items, in order');
			// no text is lost: every note that was there has its text (it may have moved, been relabeled or renamed)
			const after = await texts(p), bodies = Object.entries(after).map(([path, text]) => [path.split('/').pop().replace(/\.md$/, ''), split(text).body]);
			const gone = change === 'the carried note is deleted' ? ['Epilogue'] : change === 'the folder it is over is deleted' ? ['The wreck', 'Lights out', 'Part Two'] : [];
			for (const [path, text] of Object.entries(before)) {
				const name = path.split('/').pop().replace(/\.md$/, '');
				if (path === NOTE || gone.includes(name) || /\/(Part One|Part Two)\/\1\.md$/.test(path)) continue;
				const now = bodies.find(([n, b]) => b === split(text).body && (n === name || (change.includes('renamed') && name === 'Prologue' && n === 'Opening')));
				t.ok(!!now, `the text of “${name}” is still in the vault`);
			}
			t.eq(j(p.errors), j([]), 'nothing was logged');
		}));
	}
}

test('BUG: a folder’s card names its notes and folders only: a picture, a PDF or a canvas kept in the folder is not named as if it were a note (the count says “3 notes”, and the board shows no card for it)', withTidy(async (p, h, t) => {
	await openView(p);
	const P1 = L + 'Part One';
	await p.ev(`(async () => { await app.vault.createBinary(${j(P1 + '/Cover.png')}, new Uint8Array([137, 80, 78, 71]).buffer); await app.vault.create(${j(P1 + '/Map.canvas')}, '{}'); })().then(() => 1)`);
	try {
		await settle(p, 900);
		const s = await heldOf(p, P1);
		const inFolder = await p.ev(`${B}.orderedChildren(${file(P1)}).map(f => f.name)`);
		t.eq(j(s.names.filter((n) => /^(Cover|Map)$/.test(n))), j([]), 'only notes and folders are named (orderedChildren has: ' + inFolder.join(', ') + '; the card names: ' + s.names.join(', ') + ')');
		// and the others are still named, up to five
		t.eq(j(s.names), j(['Arrival', 'The keeper', 'Storm warning']), 'its three notes');
	} finally {
		// (the runner puts notes back, not these)
		await p.ev(`(async () => { for (const n of ['Cover.png', 'Map.canvas']) { const f = app.vault.getAbstractFileByPath(${j(P1 + '/')} + n); if (f) await app.vault.delete(f); } })().then(() => 1)`);
	}
}));

test('UX: by label, the keyboard gets from the toolbar to the cards in a few Tab presses: the lines’ heads are one stop, not one each (eight empty lines are eight stops before the first card)', async (p, h, t) => {
	await openView(p);
	await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines: 'across' });
	await p.sleep(500);
	await p.ev(`document.querySelector('${ACTIVE} .binders-toolbar-button').focus()`);
	let presses = 0, at = '';
	for (; presses < 30; presses++) {
		await p.key('Tab');
		at = await p.ev(`(() => { const a = document.activeElement; return a?.closest('.binders-card[data-path]') ? 'card' : a?.closest('.binders-lane-head') ? 'head' : a?.closest('.binders-toolbar') ? 'toolbar' : a?.classList.contains('binders-view-synopsis') ? 'synopsis' : 'other'; })()`);
		if (at === 'card') break;
	}
	t.ok(at === 'card' && presses + 1 <= 8, `Tab presses from the first toolbar button to the first card: ${presses + 1} (toolbar: 4 buttons, then the folder’s synopsis, then the lines, then a card)`);
});

test('UX: a word count target that is too big is told so (it says “a whole number of words” of 99999999999, which is one)', async (p, h, t) => {
	await openView(p);
	const w = await p.at(`${ACTIVE} .binders-word-count`);
	await p.click(w.x, w.y);
	await until(p, `document.querySelector('.modal input')`);
	await p.key('a', 'ctrl');
	await p.type('99999999999');
	await p.key('Enter');
	await p.sleep(300);
	const why = await p.ev(`document.querySelector('.binders-ask-error')?.textContent ?? ''`);
	t.ok(!/whole number/.test(why), `what the dialog says: “${why}”`);
	await p.key('Escape');
});

// ---- the outliner under a filter: moving rows by key and by hand past notes the filter hides ----
test('the outliner with a filter on: Alt+Down moves a row past the next row shown and keeps every hidden note in its place, as the corkboard does; a drag between shown rows does the same', withTidy(async (p, h, t) => {
	const before = await texts(p);
	await openView(p, L + 'Part One');
	await prop(p, L + 'Part One/Arrival.md', 'label', 'Red');
	await prop(p, L + 'Part One/Storm warning.md', 'label', 'Red');
	await settle(p);
	await setView(p, { mode: 'outliner', filter: { status: [], label: ['Red'] } });
	await p.sleep(500);
	const names = () => p.ev(`${B}.orderedChildren(${file(L + 'Part One')}).map(f => f.name)`);
	const rowsShown = () => p.ev(`[...document.querySelectorAll('${OL} .binders-outliner-row')].map(r => r.dataset.path.split('/').pop())`);
	t.eq(j(await rowsShown()), j(['Arrival.md', 'Storm warning.md']), 'the rows that pass');
	const r = await p.at(`${OL} .binders-outliner-row[data-path="${L}Part One/Arrival.md"]`);
	await p.click(r.x + 40, r.y);
	await p.key('ArrowDown', 'alt');
	await p.sleep(700);
	t.eq(j(await names()), j(['The keeper.md', 'Storm warning.md', 'Arrival.md']), 'Alt+Down: past Storm warning; The keeper (hidden) has not moved');
	t.eq(j(await rowsShown()), j(['Storm warning.md', 'Arrival.md']), 'and the rows show it');
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), L + 'Part One/Arrival.md', 'the keyboard is still on the row');
	await p.key('ArrowUp', 'alt');
	await p.sleep(700);
	t.eq(j(await rowsShown()), j(['Arrival.md', 'Storm warning.md']), 'Alt+Up puts it back');
	// by hand: Storm warning dragged above Arrival
	const a = await p.at(`${OL} .binders-outliner-row[data-path="${L}Part One/Storm warning.md"]`), b = await p.at(`${OL} .binders-outliner-row[data-path="${L}Part One/Arrival.md"]`);
	await hold(p, { x: a.x + 40, y: a.y }, { x: b.x + 40, y: b.t + 4 });
	await letGo(p, { x: b.x + 40, y: b.t + 4 });
	await p.sleep(700);
	t.eq(j(await rowsShown()), j(['Storm warning.md', 'Arrival.md']), 'dragged above Arrival, with The keeper hidden between them');
	const order = await names();
	t.ok(order.indexOf('The keeper.md') >= 0 && order.length === 3, 'no note was lost: ' + order.join(', '));
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) { if (path !== NOTE && !/\/Part One\/(Arrival|Storm warning)\.md$/.test(path)) t.eq(after[path], text, `“${path}” is unchanged`); }
	for (const n of ['Arrival', 'Storm warning']) t.eq(split(after[L + `Part One/${n}.md`]).body, split(before[L + `Part One/${n}.md`]).body, `the text of ${n} is untouched`);
}));

test('a folder’s card on a small card: a synopsis added gives the room to the synopsis (the names go), taken away gives it back; a large card has both', withTidy(async (p, h, t) => {
	await openView(p);
	const P2 = L + 'Part Two';
	const shows = () => p.ev(`(() => { const c = document.querySelector('${ACTIVE} .binders-card[data-path="${P2}"]'); const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; return { held: vis(c.querySelector('.binders-card-held')), syn: vis(c.querySelector('.binders-card-synopsis')), inside: c.querySelector('.binders-card-footer').getBoundingClientRect().bottom <= c.getBoundingClientRect().bottom + 1 }; })()`);
	await setView(p, {}, { cardSize: 'small' });
	t.eq(j(await shows()), j({ held: true, syn: false, inside: true }), 'small, no synopsis: the names');
	await writeRaw(p, P2 + '/Part Two.md', '---\nsynopsis: The wreck and what the keeper kept back about it.\n---\n');
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${P2}"] .binders-card-synopsis')?.textContent.startsWith('The wreck')`);
	await p.sleep(300);
	t.eq(j(await shows()), j({ held: false, syn: true, inside: true }), 'small, with a synopsis: the synopsis');
	await setView(p, {}, { cardSize: 'large' });
	t.eq(j(await shows()), j({ held: true, syn: true, inside: true }), 'large, with a synopsis: both');
	await writeRaw(p, P2 + '/Part Two.md', '---\n---\n');
	await until(p, `document.querySelector('${ACTIVE} .binders-card[data-path="${P2}"] .binders-card-synopsis')?.textContent === ''`);
	await setView(p, {}, { cardSize: 'small' });
	t.eq(j(await shows()), j({ held: true, syn: false, inside: true }), 'small again, the synopsis gone: the names are back');
}));

test('a binder in a newer format (read only): a folder’s card still names what it holds, its menu and its synopsis change nothing, and nothing on any board can be dragged, renamed or typed in', async (p, h, t) => {
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 2'));
	await until(p, `!!${B}.problem('The Lighthouse')`);
	try {
		const before = await texts(p);
		await openView(p);
		await p.sleep(500);
		const s = await heldOf(p, L + 'Part One');
		// (a binder in a format Binders can't read has no order of its own to trust: its notes are as the explorer lists them)
		t.eq(j([...s.names].sort()), j(['Arrival', 'Storm warning', 'The keeper']), 'the card names its notes');
		await openView(p, L + 'Part One');
		t.eq(j((await cards(p)).map((x) => x.split('/').pop().replace('.md', ''))), j(s.names), 'in the order its own board has them');
		await openView(p);
		// no field, no menu item that writes
		const c = await grip(p, L + 'Part One');
		await p.right(c.x, c.y);
		const items = await menuItems(p);
		t.ok(!items.some((x) => /^(Rename|Edit synopsis|Delete|Set status|Set label|Duplicate|Move up|Move down|Put in a new folder|Ungroup|Move to)/.test(x)), 'a folder’s menu has no change in it: ' + items.join(', '));
		await closeMenus(p);
		await p.dbl(c.x, c.y + 40);
		await p.sleep(400);
		t.eq(await p.ev(`${VIEW}.getState().folder`), L + 'Part One', 'a double-click still goes into the folder');
		t.eq(await p.ev(`document.querySelectorAll('input.binders-edit-field, textarea.binders-edit-field').length`), 0, 'and edits nothing');
		await openView(p);
		// a drag of a card: nothing moves
		const e = await grip(p, L + 'Epilogue.md'), two = await p.at(card(L + 'Part Two'));
		await hold(p, e, { x: two.x, y: two.y });
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 0, 'no card is lifted');
		await letGo(p, { x: two.x, y: two.y });
		for (const key of ['F2', 'Delete']) { await p.click(e.x, e.y); await p.key(key); await p.sleep(200); }
		t.eq(await p.ev(`document.querySelectorAll('.modal, input.binders-edit-field, textarea.binders-edit-field').length`), 0, 'F2 and Delete do nothing');
		await setView(p, { mode: 'outliner' });
		await p.sleep(400);
		const r = await p.at(`${OL} .binders-outliner-row[data-path="${L}Epilogue.md"]`);
		await p.click(r.x + 40, r.y);
		await p.key('F2'); await p.key('ArrowDown', 'alt'); await p.key('Delete');
		await p.sleep(300);
		t.eq(await p.ev(`document.querySelectorAll('.modal, input.binders-edit-field').length`), 0, 'in the outliner too');
		const hd = await p.at(`${HEAD}[data-col="status"]`);
		await p.right(hd.x, hd.y);
		t.ok(!(await menuItems(p)).some((x) => /binder order/i.test(x) && /Make/.test(x)), 'no “Make this the binder order”');
		await closeMenus(p);
		same(t, before, await texts(p));
		t.eq(await read(p, NOTE), orig.replace('binder: 1', 'binder: 2'), 'the binder note is as it was');
	} finally { await writeRaw(p, NOTE, orig); }
});

// ---- several selected at once ----
for (const kind of ['corkboard', 'outliner']) {
	test(`${kind}: several items selected (notes and a folder), “Set label” and “Set status” in the menu apply to all of them, the folder’s into its folder note, no body changes, and the selection and the keyboard stay`, withTidy(async (p, h, t) => {
		const before = await texts(p);
		await openView(p);
		await setView(p, { mode: kind }, kind === 'corkboard' ? { arrange: 'grid' } : {});
		await p.sleep(500);
		const item = (path) => (kind === 'corkboard' ? card(path) : `${OL} .binders-outliner-row[data-path="${path}"]`);
		const paths = [L + 'Prologue.md', L + 'Part One', L + 'Epilogue.md'];
		const first = await p.at(item(paths[0])); await p.click(first.x + 20, first.t + 14);
		for (const path of paths.slice(1)) { const c = await p.at(item(path)); await p.click(c.x + 20, c.t + 14, { modifiers: 2 }); }
		const sel = () => p.ev(`[...document.querySelectorAll('${ACTIVE} .binders-card.is-selected, ${ACTIVE} .binders-outliner-row.is-selected')].map(c => c.dataset.path)`);
		t.eq(j(await sel()), j(paths), 'three selected (Ctrl-click)');
		await p.key('ContextMenu'); await p.sleep(300);
		await hoverMenuItem(p, 'Set label'); await clickMenu(p, 'Purple'); await p.sleep(700);
		t.eq(j(await sel()), j(paths), 'still selected after Set label');
		await p.key('ContextMenu'); await p.sleep(300);
		await hoverMenuItem(p, 'Set status'); await clickMenu(p, 'Done'); await p.sleep(700);
		t.eq(j(await sel()), j(paths), 'still selected after Set status');
		const fm = (path) => p.ev(`(() => { const f = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? {}; return [f.label, f.status]; })()`);
		await flush(p);
		for (const path of [L + 'Prologue.md', L + 'Epilogue.md', L + 'Part One/Part One.md']) t.eq(j(await fm(path)), j(['Purple', 'Done']), `${path}: label and status`);
		t.ok(!(await cards(p)).some((c) => c.endsWith('Part One.md')), 'the folder’s own note is not a card');
		t.ok(!!(await p.ev(`document.activeElement?.closest('[data-path]')`)), 'the keyboard is on an item');
		const after = await texts(p);
		for (const path of [L + 'Prologue.md', L + 'Epilogue.md']) t.eq(split(after[path]).body, split(before[path]).body, `${path}: body untouched`);
		for (const [path, text] of Object.entries(before)) if (path !== NOTE && !/Prologue|Epilogue/.test(path)) t.eq(after[path], text, `${path} unchanged`);
	}));
}

// ---- the folder’s own synopsis, in the view’s header, typed in while the board changes ----
for (const kind of ['corkboard', 'outliner', 'by label']) {
	test(`${kind}: the folder’s synopsis typed in the view’s header survives the board redrawing (a note renamed, made and relabeled by another pane) and is saved whole to the binder note`, withTidy(async (p, h, t) => {
		const before = await texts(p);
		await openView(p);
		if (kind === 'outliner') await setView(p, { mode: 'outliner' }); else if (kind === 'by label') await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines: 'across' });
		await p.sleep(500);
		const syn = `${ACTIVE} .binders-view-synopsis`;
		const s = await p.at(syn);
		await p.click(s.x, s.y);
		await until(p, `document.activeElement.matches('${syn} textarea')`);
		await p.type('A lighthouse, ');
		await p.ev(`app.fileManager.renameFile(${file(L + 'Epilogue.md')}, ${j(L + 'Afterword.md')}).then(() => 1)`);
		await p.sleep(300);
		await p.type('a keeper, ');
		await make(p, L + 'Added.md', 'a b c');
		await prop(p, L + 'Prologue.md', 'label', 'Red');
		await p.sleep(500);
		await p.type('a storm.');
		t.ok(await p.ev(`document.activeElement.matches('${syn} textarea')`), 'the field has the keyboard still');
		t.eq(await p.ev(`document.activeElement.value`), 'A lighthouse, a keeper, a storm.', 'with everything typed');
		await p.ev(`document.activeElement.blur()`);
		await until(p, `app.vault.adapter.read(${j(NOTE)}).then(s => s.includes('a storm.'))`);
		await flush(p);
		const text = await read(p, NOTE);
		t.ok(/synopsis: A lighthouse, a keeper, a storm\./.test(text), 'saved in the binder note');
		t.eq(split(text).body, split(before[NOTE]).body, 'whose text is untouched');
		t.eq(await p.ev(`document.querySelector('${syn}').textContent`), 'A lighthouse, a keeper, a storm.', 'and shown');
	}));
}

test('the outliner: a folder folded stays folded when it is renamed or moved into another folder by another pane', withTidy(async (p, h, t) => {
	await toOutliner(p);
	const rowsNow = () => p.ev(`[...document.querySelectorAll('${OL} .binders-outliner-row')].map(r => r.dataset.path.replace(${j(L)}, ''))`);
	const chevron = async (path) => { const c = await p.at(`${OL} .binders-outliner-row[data-path="${L}${path}"] .binders-outliner-chevron`); await p.click(c.x, c.y); await p.sleep(300); };
	await chevron('Part One');
	t.eq(j(await rowsNow()), j(['Prologue.md', 'Part One', 'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md']), 'Part One folded');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Part One')}, ${j(L + 'Act One')}).then(() => 1)`);
	await p.sleep(900);
	t.eq(j(await rowsNow()), j(['Prologue.md', 'Act One', 'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Epilogue.md']), 'renamed by another pane: still folded');
	await p.ev(`app.fileManager.renameFile(${file(L + 'Act One')}, ${j(L + 'Part Two/Act One')}).then(() => 1)`);
	await p.sleep(900);
	t.eq(j(await rowsNow()), j(['Prologue.md', 'Part Two', 'Part Two/The wreck.md', 'Part Two/Lights out.md', 'Part Two/Act One', 'Epilogue.md']), 'moved into Part Two: still folded');
}));

for (const kind of ['by label', 'outliner']) {
	test(`UX: ${kind}: a card carried to the folder above in the breadcrumb goes out to it, as it does on the grid (it is let go with nothing said and nothing moved)`, withTidy(async (p, h, t) => {
		const before = await texts(p);
		await openView(p, L + 'Part One');
		if (kind === 'by label') await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines: 'across', linesFlat: false }); else await setView(p, { mode: 'outliner' });
		await p.sleep(500);
		const path = L + 'Part One/Arrival.md';
		const a = await p.at(kind === 'outliner' ? `${OL} .binders-outliner-row[data-path="${path}"]` : bySel(path)), up = await p.at(`${ACTIVE} .binders-crumb[data-path="${L.slice(0, -1)}"]`);
		await hold(p, { x: a.x + (kind === 'outliner' ? 40 : 0), y: a.t + 14 }, { x: up.x, y: up.y });
		const mid = await p.ev(`({ crumb: document.querySelector('${ACTIVE} .binders-crumb[data-path="${L.slice(0, -1)}"]')?.classList.contains('is-being-dragged-over'), line: !!document.querySelector('.binders-drop-indicator.is-active') })`);
		await letGo(p, { x: up.x, y: up.y });
		await p.sleep(700);
		const moved = !(await exists(p, path));
		t.ok(mid.crumb && moved, `the grid takes a card out to the folder above (its crumb shows it will, and it goes); here the crumb ${mid.crumb ? 'shows it will take it' : 'shows nothing'} and ${moved ? 'the card moved out' : 'nothing moved'}`);
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost, .binders-outliner-ghost, .is-dragging, .is-being-dragged-over').length`), 0, 'nothing of the drag is left');
		if (!moved) same(t, before, await texts(p));
	}));
}

for (const kind of ['corkboard', 'outliner']) {
	test(`UX: ${kind}: Delete with a folder or two among several selected says what is inside them, as it does for one folder (“Delete “Part One” and the 3 notes in it?”)`, async (p, h, t) => {
		await openView(p);
		await setView(p, { mode: kind }, kind === 'corkboard' ? { arrange: 'grid' } : {});
		await p.sleep(500);
		const item = (path) => (kind === 'corkboard' ? card(path) : `${OL} .binders-outliner-row[data-path="${path}"]`);
		const a = await p.at(item(L + 'Part One')); await p.click(a.x + 20, a.t + 14);
		const b = await p.at(item(L + 'Part Two')); await p.click(b.x + 20, b.t + 14, { modifiers: 2 });
		await p.key('Delete');
		await until(p, `document.querySelector('.modal')`);
		const text = await p.ev(`document.querySelector('.modal p')?.textContent ?? ''`);
		await p.key('Escape');
		t.ok(/5 notes|5/.test(text), `the question for two folders holding five notes: “${text}”`);
		t.ok(await exists(p, L + 'Part One/Arrival.md'), 'and nothing was deleted');
	});
}

test('BUG: “No label” or “No status” on a selection that has a folder among its notes makes the folder a hidden folder note it has no use for (nothing is written for a note that has none)', withTidy(async (p, h, t) => {
	await openView(p);
	await prop(p, L + 'Epilogue.md', 'label', 'Red');
	await settle(p);
	t.ok(!(await exists(p, L + 'Part One/Part One.md')), 'Part One has no folder note');
	const a = await p.at(card(L + 'Epilogue.md')); await p.click(a.x + 20, a.t + 14);
	const b = await p.at(card(L + 'Part One')); await p.click(b.x + 20, b.t + 14, { modifiers: 2 });
	t.eq(j(await selected(p)), j([L + 'Epilogue.md', L + 'Part One'].sort((x, y) => (['Part One', 'Epilogue.md'].indexOf(x.split('/').pop()) - ['Part One', 'Epilogue.md'].indexOf(y.split('/').pop())))), 'both are selected');
	await p.key('ContextMenu'); await p.sleep(300);
	await hoverMenuItem(p, 'Set label');
	await clickMenu(p, 'No label');
	await p.sleep(900);
	await flush(p);
	t.ok(!(await exists(p, L + 'Part One/Part One.md')), 'it still has none after the label was taken off (a folder with no label has nothing to take off)');
	t.ok(!/label:/.test(await read(p, L + 'Epilogue.md')), 'the note’s label is gone');
}));

// ---- awkward names and numbers, and a view state that isn’t what Binders wrote ----
const LONG = 'An unbroken name that goes on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on and on';
/** Anything drawn outside the card it belongs to (what a folder card’s list cuts off, it clips); on the grid, the board scrolling sideways as well. */
const overflow = (p, grid) => p.ev(`(() => {
	const out = [];
	for (const c of document.querySelectorAll('${ACTIVE} .binders-card[data-path]')) {
		const box = c.getBoundingClientRect();
		for (const e of c.querySelectorAll('*')) { const b = e.getBoundingClientRect(); if (b.width && !e.closest('.binders-card-held') && (b.right > box.right + 1 || b.left < box.left - 1)) out.push((c.dataset.path ?? '').split('/').pop() + ' > ' + e.className.toString().slice(0, 40)); }
	}
	if (${grid}) { const m = document.querySelector('${ACTIVE} .binders-mode'); if (m && m.scrollWidth - m.clientWidth > 1) out.push('the board scrolls sideways by ' + (m.scrollWidth - m.clientWidth)); }
	return out.slice(0, 4).join(' | ');
})()`);

test('a long name (a note’s, a folder’s, and the names a folder’s card holds) and a big target and count stay inside their cards on every board and size, and the grid doesn’t scroll sideways', withTidy(async (p, h, t) => {
	await openView(p);
	await mkdir(p, L + LONG);
	await make(p, L + LONG + '/' + LONG + ' note.md', 'a b c');
	await make(p, L + LONG + ' loose note.md', 'a b c');
	await prop(p, L + LONG + ' loose note.md', 'target', 1000000000);
	await prop(p, L + 'Prologue.md', 'target', 999999999);
	await settle(p, 900);
	for (const [name, patch, options] of [['grid', { mode: 'corkboard' }, { arrange: 'grid' }], ['by label, across', { mode: 'corkboard' }, { arrange: 'label', lines: 'across' }], ['by label, down', { mode: 'corkboard' }, { arrange: 'label', lines: 'down' }], ['outliner', { mode: 'outliner' }, {}]]) {
		for (const size of name === 'outliner' ? ['medium'] : ['small', 'medium', 'large']) {
			await setView(p, patch, { ...options, cardSize: size });
			await p.sleep(350);
			t.eq(await overflow(p, name === 'grid'), '', `${name}, ${size}: nothing is drawn outside its card${name === 'grid' ? ', and the board doesn’t scroll sideways' : ''}`);
		}
	}
	t.eq(j(p.errors), j([]), 'nothing logged');
}));

test('a view state that isn’t what Binders wrote (a mode that doesn’t exist, an arrangement of 5, filters that aren’t lists, columns and a sort of nonsense, a size of “huge”) opens as the nearest thing that makes sense: no errors, a board shown', async (p, h, t) => {
	const states = [
		{ mode: 'plot grid', options: { arrange: 'bogus', cardSize: 5, numbers: 'yes', lines: 7 } },
		{ mode: 'outliner', options: { outliner: { columns: 'x', sort: { id: 'zzz', dir: 3 }, collapsed: 5, synopsis: 'no' } } },
		{ mode: 'outliner', options: { outliner: { columns: [{ id: 'words', width: -9 }, { id: 'words' }, 'nope', null, { id: 'prop:' }, { id: 'target', width: 1e9 }], sort: { id: 'title', dir: 1 }, collapsed: ['nowhere', 7] } } },
		{ mode: 'corkboard', filter: { status: 5, label: 'Red' }, options: { arrange: 'label', lines: 'sideways', linesUnused: 'maybe', linesFlat: 'yes', cardSize: 'huge', labelStyle: 42 } },
		{ mode: 'corkboard', filter: { status: [null, 3, 'draft'], label: [{}] }, options: null },
		{ mode: 7, filter: [], options: [] },
	];
	for (const [i, state] of states.entries()) {
		await openView(p);
		await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { folder: ${j(L.slice(0, -1))}, ...${j(state)} } }); })().then(() => 1)`);
		await p.sleep(700);
		const shown = await p.ev(`document.querySelectorAll('${ACTIVE} .binders-card[data-path], ${ACTIVE} .binders-outliner-row').length`);
		t.ok(shown > 0 || state.filter, `state ${i}: a board is shown (${shown} items)`);
		const s = await viewState(p);
		t.ok(['corkboard', 'outliner', 'manuscript'].includes(s.mode), `state ${i}: the mode is one that exists (${s.mode})`);
	}
	t.eq(j(p.errors), j([]), 'nothing logged');
});

// ---- a synopsis half typed, and then the writer goes somewhere else ----
const LEAVES = [
	['clicks the Filter button', async (p) => { const b = await p.at(`${ACTIVE} .binders-filter-button`); await p.click(b.x, b.y); }],
	['clicks the Arrange button', async (p) => { const b = await p.at(`${ACTIVE} .binders-arrange-button`); if (b) await p.click(b.x, b.y); else { const f = await p.at(`${ACTIVE} .binders-filter-button`); await p.click(f.x, f.y); } }],
	['clicks the New button', async (p) => { const b = await p.at(`${ACTIVE} .binders-new-button`); await p.click(b.x, b.y); }],
	['clicks the mode button', async (p) => { const b = await p.at(`${ACTIVE} .binders-toolbar-button`); await p.click(b.x, b.y); }],
	['opens the command palette', async (p) => { await p.ev(`app.commands.executeCommandById('command-palette:open')`); }],
	['clicks a note in the file explorer', async (p) => { await p.ev(`app.workspace.getLeaf('split').openFile(${file(L + 'Epilogue.md')}).then(() => 1)`); }],
	['clicks the word count (the target dialog)', async (p) => { const b = await p.at(`${ACTIVE} .binders-word-count`); await p.click(b.x, b.y); }],
	['closes the pane', async (p) => { await p.ev(`app.workspace.getLeavesOfType('binders-view')[0].detach()`); }],
];
for (const kind of ['corkboard', 'outliner', 'by label']) {
	test(`${kind}: a synopsis half typed is kept whole when the writer ${LEAVES.map((l) => l[0]).slice(0, 3).join(', ')} and every other way out (palette, explorer, closing the pane)`, withTidy(async (p, h, t) => {
		const before = await texts(p);
		const path = L + 'Prologue.md';
		for (const [say, leave] of LEAVES) {
			try {
			await writeRaw(p, path, before[path]);
			await p.sleep(300);
			await openView(p);
			if (kind === 'outliner') await setView(p, { mode: 'outliner' }); else if (kind === 'by label') await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines: 'across' }); else await setView(p, { mode: 'corkboard' }, { arrange: 'grid' });
			await p.sleep(400);
			const sel = kind === 'outliner' ? `${OL} .binders-outliner-row[data-path="${path}"]` : kind === 'by label' ? bySel(path) : card(path);
			const row = await p.at(sel);
			await p.click(row.x + (kind === 'outliner' ? 40 : 0), row.t + 14);
			const syn = kind === 'outliner' ? `${OL} .binders-outliner-row[data-path="${path}"] .binders-outliner-synopsis` : `${sel} .binders-card-synopsis`;
			const s = await p.at(syn);
			await p.click(s.x, s.y);
			await until(p, `document.activeElement.matches('textarea')`);
			await p.key('End', 'ctrl');
			await p.type(' TYPED.');
			await leave(p);
			await p.sleep(700);
			await until(p, `app.vault.adapter.read(${j(path)}).then(s => s.includes('TYPED.'))`, 2500);
			await p.ev(`document.querySelectorAll('.modal-close-button').forEach(b => b.click())`);
			if (await p.ev(`!!document.querySelector('.prompt')`)) await p.key('Escape');
			await closeMenus(p);
			const text = await read(p, path);
			t.ok(/synopsis: .*TYPED\./.test(text), `${say}: what was typed is in the note`);
			t.eq(split(text).body, split(before[path]).body, `${say}: and its text is untouched`);
			await p.ev(`(async () => { for (const l of app.workspace.getLeavesOfType('markdown')) l.detach(); })().then(() => 1)`);
			} catch (e) { throw new Error(`after the writer ${say}: ${e.message}`); }
		}
		t.eq(j(p.errors), j([]), 'nothing logged');
	}));
}

for (const kind of ['corkboard', 'outliner', 'by label']) {
	test(`${kind}: a synopsis half typed in a folder gone into is kept whole when the writer goes Back to the folder above (and Forward again brings the folder back as it was)`, withTidy(async (p, h, t) => {
		const before = await texts(p);
		const path = L + 'Part One/Arrival.md';
		await openView(p);
		if (kind === 'outliner') await setView(p, { mode: 'outliner' }); else if (kind === 'by label') await setView(p, { mode: 'corkboard' }, { arrange: 'label', lines: 'across', linesFlat: false }); else await setView(p, { mode: 'corkboard' }, { arrange: 'grid' });
		await p.sleep(400);
		await p.ev(`${VIEW}.leaf.setViewState({ type: 'binders-view', active: true, state: { ...${VIEW}.getState(), folder: ${j(L + 'Part One')} } }).then(() => 1)`);
		await p.sleep(900);
		const sel = kind === 'outliner' ? `${OL} .binders-outliner-row[data-path="${path}"]` : kind === 'by label' ? bySel(path) : card(path);
		const row = await p.at(sel);
		await p.click(row.x + (kind === 'outliner' ? 40 : 0), row.t + 14);
		const s = await p.at(kind === 'outliner' ? `${sel} .binders-outliner-synopsis` : `${sel} .binders-card-synopsis`);
		await p.click(s.x, s.y);
		await until(p, `document.activeElement.matches('textarea')`);
		await p.key('End', 'ctrl');
		await p.type(' TYPED.');
		await p.ev(`app.commands.executeCommandById('app:go-back')`);
		await p.sleep(900);
		await until(p, `app.vault.adapter.read(${j(path)}).then(s => s.includes('TYPED.'))`, 3000);
		const text = await read(p, path);
		t.ok(/synopsis: .*TYPED\./.test(text), 'what was typed is in the note');
		t.eq(split(text).body, split(before[path]).body, 'and its text is untouched');
		t.eq(await p.ev(`${VIEW}.getState().folder`), L.slice(0, -1), 'and the view is on the folder above');
		await p.ev(`app.commands.executeCommandById('app:go-forward')`);
		await p.sleep(900);
		t.eq(await p.ev(`${VIEW}.getState().folder`), L + 'Part One', 'Forward is Part One again');
		t.ok((await p.ev(`document.querySelector('${sel} .binders-card-synopsis, ${sel} .binders-outliner-synopsis')?.textContent ?? ''`)).includes('TYPED.'), 'with the synopsis shown');
		t.eq(j(p.errors), j([]), 'nothing logged');
	}));
}
