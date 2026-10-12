// The grouped menus (src/view/actions.ts itemMenu, BinderView.onPaneMenu, menu-groups.ts): a card's, a row's and a
// title's menu has the rows done all day and four drawers (Move, Snapshots, Export as, More); the view's "More options"
// has Cards, Snapshots and Export. The same menu on every screen. These tests pin what is on the top level and in each
// drawer for each kind (a note, a folder, several, each mode, a Longform note, a binder that can't be changed), that
// the drawers work by keyboard, by pointer, by tap on a tablet and a phone (nested sheets), without Obsidian's
// submenu, with forty folders under Move; that nothing the old menus had is lost; and that the modes and Arrange
// (not in More options now) are in the toolbar on a phone 320 px wide. Heights are logged for the record.
import { OLD_ITEM_TITLES, OLD_PANE_TITLES, offers } from './menu-routes.mjs';
import { PHONE, SMALL, TABLET_WIDE, touch, choose, context, drawer, items, longPress, onDevice, reachable, sheetOf, tapEl, tapMenu, titles } from './specs-qa6-menus.mjs';
import { B, PL, VIEW, closeMenus, exists, flush, j, openView, tidy, until } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'menu groups: ' + name, fn: async (p, h, t) => { try { await fn(p, h, t); } finally { await closeMenus(p).catch(() => {}); await tidy(p).catch(() => {}); } } });
const log = (...a) => console.log('    ·', ...a);

const L = 'The Lighthouse/';
const LEAF = '.workspace-leaf.mod-active';
const CARD = (path) => `${LEAF} .binders-card[data-path="${path}"]`;
const ROW = (path) => `${LEAF} .binders-outliner-row[data-path="${path}"]`;
const BTN = (cls) => `${LEAF} .${cls}`;
const MORE = `${LEAF} .view-actions .clickable-icon[aria-label="More options"], ${LEAF} .view-action[aria-label="More options"]`;
const fresh = async (p, folder = 'The Lighthouse') => { await openView(p, folder); await p.sleep(300); await setMode(p, 'corkboard'); };
const setMode = async (p, m) => { await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`); await p.sleep(m === 'manuscript' ? 1500 : 700); };
const names = (list) => list.map((x) => x.title);
/** The binders' own rows of a menu: the sections Binders names (the rest is Obsidian's). */
const OURS = ['open', 'edit', 'groups', 'danger', 'new'];
const ours = (list) => names(list.filter((x) => OURS.includes(x.section)));
const moreOptions = async (p) => {
	for (let i = 0; i < 3; i++) {
		await closeMenus(p);
		const a = await p.at(MORE);
		if (!a) throw new Error('no More options button');
		await p.click(a.x, a.y);
		await p.sleep(500);
		if (await p.ev(`document.querySelectorAll('.menu').length`)) return;
	}
	throw new Error('no menu from More options');
};
/** Opens a drawer of the menu on screen and gives its titles; the menu is closed after. */
const drawerOf = async (p, reopen, name) => { await reopen(); const d = await drawer(p, name); await closeMenus(p); return names(d); };
const geometry = (p) => p.ev(`(() => [...document.querySelectorAll('.menu')].map(m => { const r = m.getBoundingClientRect(), sc = m.querySelector('.menu-scroll') ?? m; return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height), scrolls: sc.scrollHeight > sc.clientHeight + 1 || m.scrollHeight > m.clientHeight + 1, inner: [innerWidth, innerHeight] }; }))()`);

// ================================================================================================================
// asked as a writer would: is it offered, and does it work (wherever the menu keeps it)
// ================================================================================================================

test('a writer’s question: a note’s menu offers Rename, Duplicate and Set target..., and Duplicate makes the copy beside it', async (p, h, t) => {
	await fresh(p, 'The Lighthouse/Part One');
	const at = () => context(p, CARD(L + 'Part One/The keeper.md'));
	await at();
	for (const title of ['Rename', 'Duplicate', 'Set target...', 'Take a snapshot']) t.ok(await offers(p, title), `${title} is offered`);
	t.ok(!(await offers(p, 'Plot grid')), 'what isn’t there is not offered');
	await choose(p, 'Duplicate');
	await until(p, `!!app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper 2.md')})`, 5000);
	t.ok(await exists(p, L + 'Part One/The keeper 2.md'), 'the copy is on disk, beside the note');
});

// ================================================================================================================
// the top level and each drawer, for each kind
// ================================================================================================================

test('a note: the rows, then Move, Snapshots, Export as and More; Obsidian’s items after them and Delete last', async (p, h, t) => {
	await fresh(p, 'The Lighthouse/Part One');
	const at = () => context(p, CARD(L + 'Part One/The keeper.md'));
	await at();
	const it = await items(p);
	t.eq(j(ours(it).filter((x) => x !== 'Open in new window')), j(['Open', 'Open in new tab', 'Open to the right', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Move', 'Snapshots', 'Export as', 'More', 'Delete']), 'the top level');
	t.eq(it[it.length - 1].title, 'Delete', 'Delete is last');
	const iDrawers = ['Move', 'Snapshots', 'Export as', 'More'].map((n) => it.findIndex((x) => x.title === n));
	t.ok(iDrawers.every((i, k) => i > 0 && (k === 0 || i === iDrawers[k - 1] + 1)), 'the four drawers are together, in one section');
	t.ok(it.findIndex((x) => x.title === 'Copy path') > iDrawers[3], 'Obsidian’s own items follow Binders’ own');
	await closeMenus(p);
	t.eq(j(await drawerOf(p, at, 'Move')), j(['Move up', 'Move down', 'Put in a new folder', 'The Lighthouse', 'Part One', 'Part Two']), 'Move: up and down, a new folder, the folders last');
	t.eq(j(await drawerOf(p, at, 'Snapshots')), j(['Take a snapshot', 'Rewrite...', 'Show snapshots...']), 'Snapshots');
	const roles = await drawerOf(p, at, 'Export as');
	t.ok(roles[0].startsWith('Automatic') && roles[roles.length - 1] === 'Leave out' && roles.length >= 4, 'Export as: Automatic, the roles, Leave out last: ' + j(roles));
	t.eq(j(await drawerOf(p, at, 'More')), j(['Set target...', 'Set story date...', 'Set synopsis from text', 'Add revision task...', 'Duplicate', 'Split at headings...']), 'More');
});

test('a note with a story date: More also has Remove story date; two dated notes selected also Shift story dates...', async (p, h, t) => {
	await fresh(p);
	const a = L + 'Prologue.md', b = L + 'Epilogue.md';
	await p.ev(`(async () => { for (const f of [${j(a)}, ${j(b)}]) await ${B}.setProps(app.vault.getAbstractFileByPath(f), { storyDate: '1987-06-14' }); })().then(() => 1)`).catch(() => {});
	// (the property is written the way the menu writes it)
	await context(p, CARD(a));
	await choose(p, 'Set story date...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('14 June 1987');
	await p.key('Enter');
	await p.sleep(700);
	await context(p, CARD(a));
	t.eq(j(names(await drawer(p, 'More'))), j(['Set target...', 'Set story date...', 'Remove story date', 'Set synopsis from text', 'Add revision task...', 'Duplicate', 'Split at headings...']), 'one dated note: Remove story date');
	await closeMenus(p);
	await context(p, CARD(b));
	await choose(p, 'Set story date...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('15 June 1987');
	await p.key('Enter');
	await p.sleep(700);
	const sel = async () => { await p.ev(`document.querySelector(${j(CARD(a))}).scrollIntoView({ block: 'center' })`); const x = await p.at(CARD(a)); await p.click(x.x, x.t + x.h - 8); const y = await p.at(CARD(b)); await p.click(y.x, y.t + y.h - 8, { modifiers: 2 }); await context(p, CARD(b)); };
	await sel();
	const more = names(await drawer(p, 'More'));
	t.eq(j(more), j(['Set target...', 'Set story date...', 'Remove story date', 'Shift story dates...', 'Set synopsis from text', 'Add revision task...']), 'two dated notes: Remove and Shift story dates...');
});

test('a folder: Open, Rename, Edit synopsis, Set status, Set label, Move, Snapshots, Export..., Export as, More; its two snapshot rows are in Snapshots', async (p, h, t) => {
	await fresh(p);
	const at = () => context(p, CARD(L + 'Part One'));
	await at();
	const it = await items(p);
	t.eq(j(ours(it).filter((x) => x !== 'Open folder note')), j(['Open', 'Open in new tab', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Move', 'Snapshots', 'Export...', 'Export as', 'More', 'Delete']), 'the top level');
	await closeMenus(p);
	t.eq(j(await drawerOf(p, at, 'Snapshots')), j(['Take a snapshot', 'Show snapshots...']), 'Snapshots: the folder’s two');
	const mv = await drawerOf(p, at, 'Move');
	t.eq(j(mv.slice(0, 3)), j(['Move up', 'Move down', 'Put in a new folder']), 'Move: up, down, a new folder' + j(mv));
	t.ok(mv.includes('Ungroup') && mv.indexOf('Ungroup') < mv.indexOf('The Lighthouse'), 'and Ungroup, before the folders: ' + j(mv));
	t.eq(j(await drawerOf(p, at, 'More')), j(['Set target...', 'Set story date...', 'Add revision task...', 'Duplicate']), 'More for a folder: no split, no synopsis from text');
});

test('several notes: status, label and Merge as rows, a snapshot of them as one row, Move, Export as and More', async (p, h, t) => {
	await fresh(p);
	const a = L + 'Prologue.md', b = L + 'Epilogue.md';
	const sel = async () => { await p.ev(`document.querySelector(${j(CARD(a))}).scrollIntoView({ block: 'center' })`); const x = await p.at(CARD(a)); await p.click(x.x, x.t + x.h - 8); const y = await p.at(CARD(b)); await p.click(y.x, y.t + y.h - 8, { modifiers: 2 }); await context(p, CARD(b)); };
	await sel();
	const it = await items(p);
	t.eq(j(ours(it)), j(['Set status', 'Set label', 'Merge 2 notes', 'Move', 'Take a snapshot of 2 notes', 'Export as', 'More', 'Delete 2 items']), 'the top level');
	await closeMenus(p);
	t.eq(j(await drawerOf(p, sel, 'Move')), j(['New folder from selection', 'The Lighthouse', 'Part One', 'Part Two']), 'Move');
	t.eq(j(await drawerOf(p, sel, 'More')), j(['Set target...', 'Set story date...', 'Set synopsis from text', 'Add revision task...']), 'More');
});

test('an outliner row, a manuscript title and a timeline card have the card’s menu', async (p, h, t) => {
	await fresh(p);
	const want = ['Open', 'Open in new tab', 'Open to the right', 'Rename', 'Set status', 'Set label', 'Move', 'Snapshots', 'Export as', 'More', 'Delete'];
	await setMode(p, 'outliner');
	await context(p, ROW(L + 'Prologue.md'));
	t.eq(j(ours(await items(p)).filter((x) => x !== 'Open in new window' && x !== 'Edit synopsis')), j(want), 'an outliner row');
	await closeMenus(p);
	await setMode(p, 'manuscript');
	const title = `[...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === 'Prologue').querySelector('.binders-manuscript-title')`;
	await p.ev(`(${title}).scrollIntoView({ block: 'center' })`);
	await p.sleep(200);
	const a = await p.ev(`(() => { const r = (${title}).getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
	await p.right(a.x, a.y);
	t.eq(j(ours(await items(p)).filter((x) => x !== 'Open in new window')), j([...want.slice(0, 10), 'New note after this', 'Delete']), 'a manuscript title, with New note after this');
	await closeMenus(p);
	await setMode(p, 'timeline');
	const card = await p.ev(`document.querySelector('${LEAF} .binders-card[data-path]')?.dataset.path ?? null`);
	if (card) {
		await context(p, CARD(card));
		const tl = ours(await items(p));
		log('timeline card:', j(tl));
		t.ok(['Rename', 'Set status', 'Set label', 'Move', 'Snapshots', 'Export as', 'More', 'Delete'].every((x) => tl.includes(x)), 'a timeline card');
	}
});

test('a Longform project’s note: no Export as (a row for Include in export), Move has only up and down, More has no revision task', async (p, h, t) => {
	await p.ev(`(async () => { await ${PL}.openBinder(app.vault.getAbstractFileByPath('Longform demo')); })().then(() => 1)`);
	await p.sleep(1000);
	const LF = 'Longform demo/';
	const at = () => context(p, CARD(LF + 'Harbor.md'));
	await at();
	const it = await items(p);
	t.eq(j(ours(it).filter((x) => x !== 'Open in new window')), j(['Open', 'Open in new tab', 'Open to the right', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Move', 'Snapshots', 'Include in export', 'More', 'Delete']), 'the top level: Include in export in the place of Export as');
	await closeMenus(p);
	const mv = await drawerOf(p, at, 'Move');
	t.ok(!mv.includes('Put in a new folder') && mv.every((x) => ['Move up', 'Move down'].includes(x)), 'Move: only up and down: ' + j(mv));
	const more = await drawerOf(p, at, 'More');
	t.ok(!more.includes('Add revision task...') && more.includes('Duplicate'), 'More: no revision task in a Longform project: ' + j(more));
});

test('a binder that can’t be changed: the opens and the snapshots to read, no drawer that writes', async (p, h, t) => {
	await p.ev(`(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/a.md', 'A'); await app.vault.create('Future/b.md', 'B'); await app.vault.create('Future/Future.md', ${j('---\nbinder: 2\ncontents:\n  - b\n  - a\n---\n')}); await ${PL}.openBinder(app.vault.getAbstractFileByPath('Future')); })().then(() => 1)`);
	await p.sleep(1200);
	await context(p, `${LEAF} .binders-card[data-path]`);
	const it = await items(p);
	t.eq(j(ours(it).filter((x) => x !== 'Open in new window')), j(['Open', 'Open in new tab', 'Open to the right', 'Show snapshots...']), 'only the opens and “Show snapshots...”, to read, are Binders’ own rows');
	t.ok(!['Move', 'More', 'Export as', 'Set status', 'Delete'].some((x) => names(it).includes(x)), 'nothing that writes');
	await closeMenus(p);
	await moreOptions(p);
	const more = names(await items(p));
	log('read-only More options:', j(more));
	t.ok(!more.includes('Find and replace in binder') && more.includes('Find in binder'), 'More options: Find, no Find and replace');
	t.ok(['Snapshots'].every((x) => more.includes(x)), 'and a Snapshots drawer to read from: ' + j(more));
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Future'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
});

// ================================================================================================================
// More options
// ================================================================================================================

test('More options: Find, the mode’s own rows, then Cards, undo and redo, the book’s rows and drawers; no modes and no Arrange', async (p, h, t) => {
	await fresh(p);
	await moreOptions(p);
	const it = await items(p);
	log('More options (corkboard):', j(names(it)));
	const n = names(it);
	t.ok(!['Corkboard', 'Outliner', 'Manuscript', 'Timeline', 'Arrange', 'In a grid', 'By label, across', 'By label, down', 'Show notes in subfolders', 'Show unused labels', 'Card size'].some((x) => n.includes(x)), 'the modes and Arrange are the toolbar’s, not here');
	for (const x of ['Find in binder', 'Find and replace in binder', 'Cards', 'Add revision task', 'Snapshots', 'Export...', 'Show progress', 'Show contents', 'Open binder note']) t.ok(n.includes(x), `${x} is there`);
	t.ok(n.indexOf('Find in binder') < n.indexOf('Cards') && n.indexOf('Cards') < n.indexOf('Add revision task') && n.indexOf('Add revision task') < n.indexOf('Snapshots') && n.indexOf('Snapshots') < n.indexOf('Export...') && n.indexOf('Export...') < n.indexOf('Show progress') && n.indexOf('Show progress') < n.indexOf('Open binder note'), 'in order');
	await closeMenus(p);
	await moreOptions(p);
	t.eq(j(names(await drawer(p, 'Cards'))), j(['Small', 'Medium', 'Large', 'Tint cards with their label color', 'Number the cards']), 'Cards: the sizes, then the tint and the numbers');
	await closeMenus(p);
	await moreOptions(p);
	t.eq(j(names(await drawer(p, 'Snapshots'))), j(['Take a snapshot', 'Show snapshots...']), 'Snapshots: the binder’s two');
	await closeMenus(p);
	// the timeline has Cards with the sizes and the tint (no numbers)
	await setMode(p, 'timeline');
	await moreOptions(p);
	t.eq(j(names(await drawer(p, 'Cards'))), j(['Small', 'Medium', 'Large', 'Tint cards with their label color']), 'the timeline’s Cards: no numbers');
	await closeMenus(p);
	// the outliner: its own rows stay (synopses, columns, expand)
	await setMode(p, 'outliner');
	await moreOptions(p);
	const o = names(await items(p));
	for (const x of ['Show synopses', 'Columns', 'Add revision task', 'Snapshots']) t.ok(o.includes(x), `the outliner’s menu has ${x}`);
	await closeMenus(p);
	await setMode(p, 'manuscript');
	await moreOptions(p);
	t.ok(names(await items(p)).includes('Show synopses'), 'the manuscript’s menu has Show synopses');
});

test('More options at its longest: Undo and Redo rows, Export again in Export, Snapshots of notes that are gone... in Snapshots', async (p, h, t) => {
	await fresh(p);
	// something to undo and redo
	await context(p, CARD(L + 'Prologue.md'));
	await choose(p, 'Move down');
	await p.sleep(700);
	await context(p, CARD(L + 'Prologue.md'));
	await choose(p, 'Move down');
	await p.sleep(700);
	const folder = `${B}.all().find((b) => b.folder.path === 'The Lighthouse').folder`;
	await until(p, `!!${B}.undoable(${folder}, false)`, 6000);
	await p.ev(`${PL}.undoMove(${folder}, false).then(() => 1)`);
	await until(p, `!!${B}.undoable(${folder}, true) && !!${B}.undoable(${folder}, false)`, 6000);
	// a snapshot of a note that is then deleted, and an export that was made
	await context(p, CARD(L + 'Epilogue.md'));
	await choose(p, 'Take a snapshot');
	await p.sleep(900);
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')})).then(() => 1)`);
	await p.sleep(900);
	await p.ev(`(() => { app.saveLocalStorage('binders-export', { places: {}, written: {}, last: { 'The Lighthouse': { kind: 'manuscript', where: 'vault', path: 'Exports/The Lighthouse.docx' } } }); return 1; })()`);
	try {
		await moreOptions(p);
		const n = names(await items(p));
		log('More options at its longest:', j(n), j(await geometry(p)));
		t.ok(n.some((x) => x.startsWith('Undo:')) && n.some((x) => x.startsWith('Redo:')), 'Undo and Redo are a row each');
		t.ok(n.includes('Export') && !n.includes('Export...') && !n.includes('Export again'), 'with an export made, Export is a drawer');
		t.eq(j(names(await drawer(p, 'Export'))), j(['Export...', 'Export again']), 'Export: the window, and again');
		await closeMenus(p);
		await moreOptions(p);
		t.eq(j(names(await drawer(p, 'Snapshots'))), j(['Take a snapshot', 'Show snapshots...', 'Snapshots of notes that are gone...']), 'Snapshots, with the gone notes’ last');
	} finally { await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`); }
});

// ================================================================================================================
// every action the old menus had is still found somewhere
// ================================================================================================================

/** Opens the menu on screen's drawers one after another (the pointer resting on each) and gives every title found. */
async function everything(p, reopen) {
	await reopen();
	const found = new Set((await items(p)).map((x) => x.title));
	const subs = (await items(p)).filter((x) => x.sub).map((x) => x.title);
	for (const s of subs) {
		await reopen();
		const first = await drawer(p, s);
		for (const x of first) found.add(x.title);
		// the third level: Export as inside nothing; Move's folders have none. A submenu of a drawer is opened too.
		for (const y of first.filter((x) => x.sub)) { await drawer(p, y.title).then((z) => z.forEach((q) => found.add(q.title))).catch(() => {}); }
	}
	await closeMenus(p);
	return found;
}

test('every row the old card menu had is found in the new one: a note, a folder, several (Move to is Move, Include in export is Leave out)', async (p, h, t) => {
	await fresh(p);
	const a = L + 'Prologue.md', b = L + 'Epilogue.md';
	const sel = async () => { await p.ev(`document.querySelector(${j(CARD(a))}).scrollIntoView({ block: 'center' })`); const x = await p.at(CARD(a)); await p.click(x.x, x.t + x.h - 8); const y = await p.at(CARD(b)); await p.click(y.x, y.t + y.h - 8, { modifiers: 2 }); await context(p, CARD(b)); };
	const same = { 'Move to': 'Move', 'Include in export': 'Leave out' };
	const NOT_HERE = {
		note: ['Select more', 'Open folder note', 'Move down', 'Merge 2 notes', 'New folder from selection', 'Export...', 'Ungroup', 'Remove story date', 'Shift story dates...'],
		folder: ['Select more', 'Merge 2 notes', 'New folder from selection', 'Split at headings...', 'Set synopsis from text', 'Open to the right', 'Open folder note', 'Remove story date', 'Shift story dates...', 'Rewrite...', 'Move to', 'Include in export'].filter((x) => !(x in same)),
		several: OLD_ITEM_TITLES.filter((x) => !['Set status', 'Set label', 'Set target...', 'Set story date...', 'Set synopsis from text', 'Add revision task...', 'Merge 2 notes', 'Export as', 'Delete', 'Move to', 'Include in export', 'Put in a new folder'].includes(x)),
	};
	for (const [kind, open] of [['note', () => context(p, CARD(L + 'Epilogue.md'))], ['folder', () => context(p, CARD(L + 'Part One'))], ['several', sel]]) {
		const found = await everything(p, open);
		log(kind, [...found].join(' | '));
		const miss = OLD_ITEM_TITLES.filter((x) => !NOT_HERE[kind].includes(x) && !found.has(same[x] ?? x) && !(kind === 'several' && x === 'Delete' && found.has('Delete 2 items')) && !(kind === 'several' && x === 'Put in a new folder' && found.has('New folder from selection')));
		t.eq(j(miss), '[]', `${kind}: every title the old menu had is found (missing: ${j(miss)})`);
	}
});

test('every row the old More options had is found, or is the toolbar’s: the modes and Arrange there', async (p, h, t) => {
	await fresh(p);
	const found = await everything(p, () => moreOptions(p));
	const gone = ['Card size', 'Tint cards with their label color', 'Number the cards'];
	const miss = OLD_PANE_TITLES.filter((x) => !found.has(x) && !['Show synopses', 'Columns', 'Expand all', 'Collapse all', 'Export again', 'Snapshots of notes that are gone...'].includes(x));
	t.eq(j(miss.filter((x) => !gone.includes(x))), '[]', 'corkboard: every title is found: ' + j(miss));
	t.ok(['Small', 'Medium', 'Large', 'Tint cards with their label color', 'Number the cards'].every((x) => found.has(x)), 'the card size, the tint and the numbers are in Cards');
	// the toolbar has what More options no longer has
	await closeMenus(p);
	const a = await p.at(BTN('binders-mode-button'));
	await p.click(a.x, a.y);
	await p.sleep(400);
	t.eq(j(names(await items(p))), j(['Corkboard', 'Outliner', 'Manuscript', 'Timeline']), 'the toolbar’s mode menu has the four modes');
	await closeMenus(p);
	const b = await p.at(BTN('binders-arrange-button'));
	await p.click(b.x, b.y);
	await p.sleep(400);
	t.eq(j(names(await items(p))), j(['In a grid', 'By label, across', 'By label, down', 'Show notes in subfolders', 'Show unused labels']), 'and Arrange has its five');
});

// ================================================================================================================
// by tap: a tablet's drawer opens beside its row, a phone's takes the sheet's place
// ================================================================================================================

const SNAP_FILES = `app.vault.getFiles().filter(f => f.path.startsWith('The Lighthouse/Snapshots/')).length`;
const DRAWER_ROWS = {
	Move: ['Move down', 'Put in a new folder', 'The Lighthouse', 'Part One', 'Part Two'],
	Snapshots: ['Take a snapshot', 'Rewrite...', 'Show snapshots...'],
	More: ['Set target...', 'Set story date...', 'Set synopsis from text', 'Add revision task...', 'Duplicate', 'Split at headings...'],
};
for (const [name, size] of [['phone', PHONE], ['small phone', SMALL], ['tablet on its side', TABLET_WIDE]]) {
	test(`${name}: each drawer opens by a tap with its rows${name === 'tablet on its side' ? ' beside its row' : ', in a sheet with its name and a way back'}; a row in it works`, async (p, h, t) => {
		await onDevice(p, size, async () => {
			await fresh(p);
			const phone = size[0] < 600, first = L + 'Prologue.md';
			const open = async () => { await closeMenus(p); await p.sleep(300); await longPress(p, CARD(first)); };
			await open();
			for (const [d, rows] of Object.entries(DRAWER_ROWS)) {
				await tapMenu(p, d);
				await p.sleep(450);
				const all = await p.ev(`[...document.querySelectorAll('.menu')].map(m => [...m.querySelectorAll('.menu-item')].map(e => (e.classList.contains('is-label') ? '< ' : '') + e.querySelector('.menu-item-title')?.textContent))`);
				if (phone) {
					t.eq(all.length, 1, `${d}: one sheet, in the place of the first`);
					t.eq(j(all[0]), j([`< ${d}`, ...rows]), `${d}: its name at the head with the chevron (the way back), then its rows`);
					t.ok(reachable(await sheetOf(p)), `${d}: the sheet is on the screen`);
					await tapMenu(p, d);
					await p.sleep(450);
					t.ok((await titles(p)).includes('Select more') && (await titles(p)).includes(d), `${d}: a tap on its name goes back to the menu`);
					await tapMenu(p, d);
					await p.sleep(450);
				} else {
					t.eq(all.length, 2, `${d}: opened beside its row`);
					t.eq(j(all[1]), j(rows), `${d}: its rows`);
					const sub = (await p.ev(`[...document.querySelectorAll('.menu')].map(m => { const r = m.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), inner: [innerWidth, innerHeight] }; })`))[1];
					t.ok(reachable(sub), `${d}: on the screen: ${j(sub)}`);
					t.ok(!(await geometry(p))[1].scrolls, `${d}: nothing to scroll`);
				}
				await open();
			}
			// a row in a drawer: More > Duplicate
			await tapMenu(p, 'More', 'Duplicate');
			await p.sleep(900);
			t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'a pick in a drawer closes every menu');
			t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Prologue 2.md')}) || app.vault.getMarkdownFiles().some(f => /^The Lighthouse\\/Prologue .*\\.md$/.test(f.path))`), 'a copy of the note is made');
			// the third level: Export as > Leave out
			await open();
			await tapMenu(p, 'Export as', 'Leave out');
			await p.sleep(700);
			t.eq(await p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(first)}))?.frontmatter?.export ?? null)`), 'false', 'Export as > Leave out writes export: false');
			// the snapshot, from its drawer
			const before = await p.ev(SNAP_FILES);
			await open();
			await tapMenu(p, 'Snapshots', 'Take a snapshot');
			await p.sleep(900);
			t.eq(await p.ev(SNAP_FILES), before + 1, 'Snapshots > Take a snapshot makes one');
		});
	});
}

// ================================================================================================================
// by keyboard
// ================================================================================================================

const selectedTitle = (p) => p.ev(`(() => { const ms = [...document.querySelectorAll('.menu')], m = ms[ms.length - 1]; return m?.querySelector('.menu-item.selected .menu-item-title')?.textContent ?? null; })()`);
const menuCount = (p) => p.ev(`document.querySelectorAll('.menu').length`);

test('by keyboard: the arrows reach every row of the menu and of each drawer; Right opens a drawer, Left shuts it, Enter chooses', async (p, h, t) => {
	await fresh(p);
	const path = L + 'Prologue.md';
	const open = async () => { await closeMenus(p); await p.ev(`document.querySelector(${j(CARD(path))}).focus()`); await p.key('ContextMenu'); await p.sleep(400); if (!(await menuCount(p))) { await p.key('F10', 'shift'); await p.sleep(400); } };
	await open();
	const top = names(await items(p)).filter(Boolean);
	// the arrows reach every row of the top level
	const seen = [];
	for (let i = 0; i < top.length + 2; i++) { await p.key('ArrowDown'); const s = await selectedTitle(p); if (s && !seen.includes(s)) seen.push(s); }
	t.eq(j([...seen].sort()), j([...top].sort()), 'ArrowDown reaches every row of the top level');
	for (const d of ['Move', 'Snapshots', 'Export as', 'More']) {
		await open();
		for (let i = 0; i < top.length + 1 && (await selectedTitle(p)) !== d; i++) await p.key('ArrowDown');
		t.eq(await selectedTitle(p), d, `the arrows come to ${d}`);
		await p.key('ArrowRight');
		await p.sleep(350);
		t.eq(await menuCount(p), 2, `Right opens ${d}`);
		const rows = (await items(p, 1) ?? []).filter((x) => !x.disabled).map((x) => x.title);
		const reached = [];
		for (let i = 0; i < rows.length + 1; i++) { const s = await selectedTitle(p); if (s && !reached.includes(s)) reached.push(s); await p.key('ArrowDown'); }
		t.eq(j([...reached].sort()), j([...rows].sort()), `the arrows reach every row of ${d}: ${j(rows)}`);
		await p.key('ArrowLeft');
		await p.sleep(300);
		t.eq(await menuCount(p), 1, `Left shuts ${d}`);
		t.eq(await selectedTitle(p), d, `and the keyboard is on ${d} again`);
	}
	// Enter chooses a row of a drawer: Snapshots > Take a snapshot
	await open();
	for (let i = 0; i < top.length + 1 && (await selectedTitle(p)) !== 'Snapshots'; i++) await p.key('ArrowDown');
	const before = await p.ev(SNAP_FILES);
	await p.key('ArrowRight');
	await p.sleep(350);
	t.eq(await selectedTitle(p), 'Take a snapshot', 'Right selects the first row of the drawer');
	await p.key('Enter');
	await p.sleep(900);
	t.eq(await menuCount(p), 0, 'Enter chooses it and the menus close');
	t.eq(await p.ev(SNAP_FILES), before + 1, 'and the snapshot is made');
	// More options by keyboard: Cards
	await closeMenus(p);
	await p.ev(`document.querySelector(${j(MORE)})?.focus()`);
	await p.key('Enter');
	await p.sleep(400);
	const pane = names(await items(p)).filter(Boolean);
	for (let i = 0; i < pane.length + 1 && (await selectedTitle(p)) !== 'Cards'; i++) await p.key('ArrowDown');
	t.eq(await selectedTitle(p), 'Cards', 'the arrows come to Cards in More options');
	await p.key('ArrowRight');
	await p.sleep(350);
	t.eq(await menuCount(p), 2, 'Right opens Cards');
	await p.key('ArrowLeft');
	await p.sleep(300);
	t.eq(await menuCount(p), 1, 'Left shuts it');
});

// ================================================================================================================
// without Obsidian's submenu: every item still offered, flat
// ================================================================================================================

test('without Obsidian’s submenu (setSubmenu missing) every drawer still opens, as a menu of its own, and offers every row', async (p, h, t) => {
	await fresh(p);
	const path = L + 'Prologue.md';
	// take the method off the class of the menu items (found through the menu being built), and put it back after
	await p.ev(`(() => { window.__proto = null; window.__ref = app.workspace.on('file-menu', (menu) => { for (const it of menu.items ?? []) if (!window.__proto && typeof it.setSubmenu === 'function') window.__proto = Object.getPrototypeOf(it); }); return 1; })()`);
	await context(p, CARD(path));
	await closeMenus(p);
	await p.sleep(300);
	const patched = await p.ev(`(() => {
		app.workspace.offref(window.__ref);
		const proto = window.__proto;
		if (!proto) return 'no proto';
		// (missing for Binders, who asks from its own code; Obsidian's own menus use it and still find it)
		const orig = proto.setSubmenu;
		window.__setSubmenu = orig;
		window.__submenuProto = proto;
		Object.defineProperty(proto, 'setSubmenu', { configurable: true, get() { return ((new Error().stack ?? '').split(String.fromCharCode(10))[2] ?? '').includes('plugin:binders') ? undefined : orig; } });
		return 'removed';
	})()`);
	log('setSubmenu:', patched);
	t.eq(patched, 'removed', 'setSubmenu is off the menu items');
	try {
		await closeMenus(p);
		await p.sleep(300);
		await context(p, CARD(path));
		const it = await items(p);
		t.ok(['Move', 'Snapshots', 'Export as', 'More', 'Set status', 'Set label'].every((n) => !it.find((x) => x.title === n)?.sub), 'none of Binders’ drawers is marked as having a submenu (Obsidian’s own “Copy path” still is)');
		for (const d of ['Move', 'Snapshots', 'Export as', 'More', 'Set status', 'Set label']) t.ok(names(it).includes(d), `${d} is still a row`);
		// a drawer opens as a menu of its own, with its rows
		for (const [d, rows] of Object.entries(DRAWER_ROWS)) {
			await closeMenus(p);
			await context(p, CARD(path));
			await choose(p, d);
			await p.sleep(450);
			const n = await menuCount(p);
			t.eq(j(names((await items(p, n - 1)) ?? [])), j(rows), `${d}: opens a menu of its own with its rows`);
		}
		// and a row in it works: More > Duplicate, Export as > Leave out
		await closeMenus(p);
		await context(p, CARD(path));
		await choose(p, 'More');
		await p.sleep(450);
		await choose(p, 'Duplicate');
		await p.sleep(900);
		t.ok(await p.ev(`app.vault.getMarkdownFiles().some(f => /^The Lighthouse\\/Prologue .*\\.md$/.test(f.path))`), 'More > Duplicate makes a copy');
		await closeMenus(p);
		await context(p, CARD(path));
		await choose(p, 'Export as');
		await p.sleep(450);
		await choose(p, 'Leave out');
		await p.sleep(700);
		t.eq(await p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter?.export ?? null)`), 'false', 'Export as > Leave out writes export: false');
		// More options: Cards
		await moreOptions(p);
		t.ok(!(await items(p)).some((x) => x.sub), 'More options: no submenus');
		await choose(p, 'Cards');
		await p.sleep(450);
		const n = await menuCount(p);
		t.ok(names((await items(p, n - 1)) ?? []).includes('Large'), 'More options > Cards opens its menu with the sizes');
	} finally {
		await p.ev(`(() => { if (window.__submenuProto && window.__setSubmenu) Object.defineProperty(window.__submenuProto, 'setSubmenu', { configurable: true, writable: true, value: window.__setSubmenu }); delete window.__submenuProto; delete window.__setSubmenu; return 1; })()`);
	}
});

// ================================================================================================================
// forty folders under Move
// ================================================================================================================

const FORTY = `(async () => { for (let i = 1; i <= 40; i++) await app.vault.createFolder('The Lighthouse/Folder ' + String(i).padStart(2, '0')); })().then(() => 1)`;

test('forty folders under Move: the drawer stays on the screen and scrolls; the last folder can be reached and chosen', async (p, h, t) => {
	await fresh(p);
	await p.ev(FORTY);
	await p.sleep(1500);
	await flush(p);
	const path = L + 'Epilogue.md';
	await context(p, CARD(path));
	const mv = names(await drawer(p, 'Move'));
	const g = (await geometry(p))[1];
	log('Move with forty folders:', mv.length, 'rows', j(g));
	t.ok(mv.length >= 40, 'the drawer lists the folders: ' + mv.length);
	t.eq(j(mv.slice(0, 3)), j(['Move up', 'Move down', 'Put in a new folder']), 'up, down and a new folder are first, the folders last');
	t.ok(g.top >= 0 && g.bottom <= g.inner[1], `the drawer is inside the screen (${g.top}–${g.bottom} of ${g.inner[1]})`);
	t.ok(g.scrolls, 'and it scrolls');
	// the last folder is reached by scrolling and chosen
	const last = mv[mv.length - 1];
	await closeMenus(p);
	await context(p, CARD(path));
	await choose(p, 'Move', last);
	await p.sleep(900);
	t.ok(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + last + '/Epilogue.md')})`), `choosing “${last}” moves the note there`);
});

test('forty folders under Move on a tablet and a phone: the drawer is inside the screen and scrolls, and its last row can be scrolled to', async (p, h, t) => {
	for (const [name, size] of [['tablet on its side', TABLET_WIDE], ['phone', PHONE]]) await onDevice(p, size, async () => {
		await fresh(p);
		await p.ev(FORTY);
		await p.sleep(1500);
		const path = L + 'Epilogue.md';
		await longPress(p, CARD(path));
		await tapMenu(p, 'Move');
		await p.sleep(450);
		const g = await geometry(p);
		const sub = g[g.length - 1];
		log(name, 'Move with forty folders:', j(sub), j(await p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); return [m.className, m.querySelectorAll('.menu-item').length, m.scrollHeight, m.clientHeight, m.parentElement?.className, getComputedStyle(m).overflowY, m.firstElementChild?.className, m.firstElementChild?.scrollHeight, m.firstElementChild?.clientHeight, ...[...m.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 0).slice(0, 4).map(e => e.className + ':' + e.scrollHeight + '/' + e.clientHeight + '/' + getComputedStyle(e).overflowY)]; })()`)));
		t.ok(sub.top >= 0 && sub.bottom <= sub.inner[1], `${name}: the drawer is inside the screen`);
		t.ok(sub.scrolls, `${name}: and scrolls`);
		// A tap on a row of a menu that scrolls lands on another row in this emulation, in Obsidian's own long menus too
		// (60 rows: a tap on the 40th hit the 17th): the scroll under the finger. So no tap is asserted here; the
		// drawer's rows are reached by the pointer and the keyboard on a computer (tests above), and its foot is on
		// the screen (the clamp), which is what Binders owns.
		// the sheet is dragged up as a finger drags it, until the last folder is in it
		const lastRow = `(() => { const m = [...document.querySelectorAll('.menu')].pop(), it = [...m.querySelectorAll('.menu-item')].pop(), r = it.getBoundingClientRect(), b = m.getBoundingClientRect(); return { title: it.querySelector('.menu-item-title')?.textContent, inside: r.top >= b.top && r.bottom <= b.bottom + 1 && r.bottom <= innerHeight, boxInside: b.bottom <= innerHeight, mx: b.x + b.width / 2, my: b.y + b.height / 2, mh: b.height }; })()`;
		let last = await p.ev(lastRow);
		for (let i = 0; i < 25 && !last.inside; i++) {
			const y0 = last.my + last.mh / 3, y1 = last.my - last.mh / 3;
			await touch(p, 'touchStart', last.mx, y0);
			for (let k = 1; k <= 6; k++) { await touch(p, 'touchMove', last.mx, y0 + (y1 - y0) * k / 6); await p.sleep(16); }
			await touch(p, 'touchEnd');
			await p.sleep(350);
			last = await p.ev(lastRow);
		}
		t.eq(last.title, 'Folder 40', `${name}: the last folder is the last row`);
		t.ok(last.inside && last.boxInside, `${name}: dragged up, the last row comes into the sheet and is on the screen`);
	});
});

// ================================================================================================================
// the modes and Arrange are the toolbar's: reachable on a phone 320 px wide
// ================================================================================================================

test('a phone 320 px wide: the mode button and Arrange are in the toolbar, on the screen, and open the four modes and the five arrangements', async (p, h, t) => {
	await onDevice(p, SMALL, async () => {
		// the worst case for room: inside a folder, where the way up and the count also stand in the toolbar
		await fresh(p, 'The Lighthouse/Part One');
		const box = (cls) => p.ev(`(() => { const e = document.querySelector(${j(BTN(cls))}); if (!e) return null; const r = e.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height), shown: r.width > 0 && getComputedStyle(e).display !== 'none' && !e.classList.contains('is-hidden'), inner: innerWidth }; })()`);
		for (const cls of ['binders-mode-button', 'binders-arrange-button']) {
			const b = await box(cls);
			log(cls, j(b));
			t.ok(b && b.shown && b.left >= 0 && b.right <= b.inner && b.width >= 28 && b.height >= 28, `${cls} is shown inside the 320 px screen, at a size to tap: ${j(b)}`);
		}
		await tapEl(p, BTN('binders-mode-button'));
		t.eq(j(await titles(p)), j(['Corkboard', 'Outliner', 'Manuscript', 'Timeline']), 'a tap on the mode button: the four modes');
		await tapMenu(p, 'Outliner');
		await p.sleep(900);
		t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-outliner')`), 'and one switches the mode');
		await tapEl(p, BTN('binders-mode-button'));
		await tapMenu(p, 'Corkboard');
		await p.sleep(700);
		await tapEl(p, BTN('binders-arrange-button'));
		t.eq(j(await titles(p)), j(['In a grid', 'By label, across', 'By label, down', 'Show notes in subfolders', 'Show unused labels']), 'a tap on Arrange: its five rows');
		await tapMenu(p, 'By label, across');
		await p.sleep(900);
		t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-lanes')`), 'and one arranges the board');
		await tapEl(p, BTN('binders-arrange-button'));
		await tapMenu(p, 'In a grid');
	});
});

// ================================================================================================================
// the longest menus on the screens a tablet has: heights (logged for the record), and they fit
// ================================================================================================================

test('the longest menus at 1024 × 768 and 1180 × 820: a note’s menu and each drawer, More options with everything; inside the screen, nothing to scroll', async (p, h, t) => {
	await p.ev(`(() => { app.saveLocalStorage('binders-export', { places: {}, written: {}, last: { 'The Lighthouse': { kind: 'manuscript', where: 'vault', path: 'Exports/The Lighthouse.docx' } } }); return 1; })()`);
	try {
		for (const size of [[1024, 768], [1180, 820]]) await onDevice(p, size, async () => {
			await fresh(p);
			const path = L + 'Prologue.md', label = size.join(' × ');
			// (a story date on it, so that "Remove story date" is in More; two moves and one undone, so that Undo and Redo are rows)
			await longPress(p, CARD(path));
			await tapMenu(p, 'Set story date...');
			await until(p, `!!document.querySelector('.modal')`);
			await p.type('14 June 1987');
			await p.key('Enter');
			await p.sleep(700);
			for (let i = 0; i < 2; i++) { await longPress(p, CARD(path)); await tapMenu(p, i ? 'Move up' : 'Move down'); await p.sleep(700); }
			await p.ev(`${PL}.undoMove(${B}.all()[0].folder, false).then(() => 1)`);
			await p.sleep(600);
			await longPress(p, CARD(path));
			const noteG = (await geometry(p))[0];
			log(`${label}: a note's menu`, j(noteG));
			t.ok(noteG.top >= 0 && noteG.bottom <= noteG.inner[1] && !noteG.scrolls, `${label}: the note’s menu is whole on the screen, nothing to scroll`);
			t.ok(noteG.inner[1] - 64 - noteG.height >= 40, `${label}: with room for another plugin's item: ${noteG.inner[1] - 64 - noteG.height} px spare`);
			for (const d of ['Move', 'Snapshots', 'Export as', 'More']) {
				await tapMenu(p, d);
				await p.sleep(400);
				const g = await geometry(p);
				const sub = g[g.length - 1];
				log(`${label}: ${d}`, j(sub));
				t.ok(!sub.scrolls && sub.top >= 0 && sub.bottom <= sub.inner[1], `${label}: ${d} is whole on the screen`);
				await closeMenus(p);
				await p.sleep(300);
				await longPress(p, CARD(path));
			}
			await closeMenus(p);
			await p.sleep(300);
			await tapEl(p, MORE);
			const pg = (await geometry(p))[0];
			log(`${label}: More options`, j(pg), names(await items(p)).length, 'rows');
			t.ok(pg.bottom <= pg.inner[1] && !pg.scrolls, `${label}: More options is whole on the screen`);
			await closeMenus(p);
		});
	} finally { await p.ev(`(() => { app.saveLocalStorage('binders-export', null); return 1; })()`); }
});

test('the outliner while sorted: More options also has Binder order and Make this the binder order; a row’s Move has no up or down; every menu fits at 1024 × 768 and 1180 × 820', async (p, h, t) => {
	for (const size of [null, [1024, 768], [1180, 820]]) {
		const run = async () => {
			await fresh(p);
			await setMode(p, 'outliner');
			const label = size ? size.join(' × ') : 'a computer';
			const TH = (col) => `${LEAF} .binders-outliner-th[data-col="${col}"]`;
			const sortedNow = async () => { if (size) await tapEl(p, MORE); else await moreOptions(p); return names(await items(p)).includes('Binder order'); };
			await context(p, TH('words'));
			await choose(p, 'Sort ascending');
			await p.sleep(500);
			// (a sort the view kept from the screen before would be turned off by the same choice: then once more)
			if (!(await sortedNow())) { await closeMenus(p); await p.sleep(300); await context(p, TH('words')); await choose(p, 'Sort ascending'); await p.sleep(500); await sortedNow(); }
			const more = names(await items(p));
			log(`${label}: More options, outliner sorted:`, j(more), j((await geometry(p))[0]));
			t.ok(more.includes('Binder order') && more.includes('Make this the binder order'), `${label}: Binder order and Make this the binder order are rows`);
			const g = (await geometry(p))[0];
			t.ok(g.top >= 0 && g.bottom <= g.inner[1] && !g.scrolls, `${label}: More options is whole on the screen (${g.height} px)`);
			await closeMenus(p);
			await p.sleep(300);
			if (size) await longPress(p, ROW(L + 'Epilogue.md')); else await context(p, ROW(L + 'Epilogue.md'));
			const row = names(await items(p));
			t.ok(['Open', 'Rename', 'Move', 'More'].every((x) => row.includes(x)), `${label}: a row’s menu while sorted: ${j(row)}`);
			const mv = names(await drawer(p, 'Move'));
			t.ok(!mv.includes('Move up') && !mv.includes('Move down'), `${label}: Move has no up or down while the rows are sorted: ${j(mv)}`);
			const rg = await geometry(p);
			log(`${label}: a row's menu`, j(rg[0]));
			if (size) t.ok(rg[0].top >= 0 && rg[0].bottom <= rg[0].inner[1] && !rg[0].scrolls, `${label}: a row’s menu is whole on the screen`);
			await closeMenus(p);
		};
		if (size) await onDevice(p, size, run); else await run();
	}
});

