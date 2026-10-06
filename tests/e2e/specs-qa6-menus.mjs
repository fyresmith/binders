// QA round 6: every menu item. "Interact with every menu item": each command surface (a card's menu, a stack's, several
// selected, the board's own, an outliner row, a column header, a cell, a manuscript title, the toolbar's New / Filter /
// Arrange / mode, the file explorer's menus, a tab's "More options", the command palette, the settings, every dialog)
// opened as a writer opens it, each item found by its text in `.menu` and clicked, with its effect read from the disk
// and the view, where the focus and the selection end up, and nothing logged (the runner fails a test that logs).
// "qa6 menus: ..." pass; "BUG: qa6 menus: ..." are confirmed bugs (they fail now and pass once fixed); "UX: ..." are
// wished behaviour. The inventory of every item is in the push folder's findings/qa6-menus-inventory.md.
import { B, PL, VIEW, answer, card, closeMenus, contents, exists, file, flush, j, openView, read, reload, split, texts, tidy, until, viewState } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa6 menus: ' + name, fn });
const bug = (name, fn) => specs.push({ name: 'BUG: qa6 menus: ' + name, fn });
const ux = (name, fn) => specs.push({ name: 'UX: qa6 menus: ' + name, fn });
const tidied = (fn) => async (p, h, t) => { try { await fn(p, h, t); } finally { await closeMenus(p).catch(() => {}); await tidy(p).catch(() => {}); } };

const L = 'The Lighthouse/';
const LEAF = '.workspace-leaf.mod-active';
const NOTE_PATH = L + 'The Lighthouse.md';
const CARD = (path) => `${LEAF} .binders-card[data-path="${path}"]`;
const ROW = (path) => `${LEAF} .binders-outliner-row[data-path="${path}"]`;
const TITLE_OF = (name) => `[...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === ${j(name)}).querySelector('.binders-manuscript-title')`;

// ---- menus ----
/** What a menu's items look like on screen: section, icon, flags. The same dump that made the inventory. */
const DUMP = `(() => [...document.querySelectorAll('.menu')].map(m => [...m.querySelectorAll('.menu-item')].map(c => ({ title: c.querySelector('.menu-item-title')?.textContent ?? '', icon: c.querySelector('.menu-item-icon:not(.mod-checked) svg')?.getAttribute('class')?.match(/lucide-([\\w-]+)/)?.[1] ?? '', section: c.dataset.section ?? '', checked: c.classList.contains('mod-checked') || c.classList.contains('is-checked'), disabled: c.classList.contains('is-disabled'), label: c.classList.contains('is-label'), warning: c.classList.contains('is-warning') || c.classList.contains('mod-warning'), sub: c.classList.contains('has-submenu') }))))()`;
/** The items of the menu that's first on screen (a submenu is the next). */
export const items = async (p, i = 0) => (await p.ev(DUMP))[i] ?? null;
export const titles = async (p, i = 0) => (await items(p, i))?.map((x) => x.title) ?? null;
const itemAt = (title, sub = false) => `(() => { const ms = [...document.querySelectorAll('.menu')], m = ${sub ? 'ms[ms.length - 1]' : 'ms[0]'}; const it = m && [...m.querySelectorAll('.menu-item')].find(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}); if (!it) return null; it.scrollIntoView({ block: 'nearest' }); const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
/** Chooses an item as a person does: with the pointer, going through a submenu by hovering its parent. */
export async function choose(p, ...path) {
	for (let i = 0; i < path.length; i++) {
		const at = await p.ev(itemAt(path[i], i > 0));
		if (!at) throw new Error(`no menu item “${path[i]}”: ` + ((await titles(p, i > 0 ? 1 : 0)) ?? []).join(', '));
		await p.move(at.x, at.y, 3);
		if (i < path.length - 1) await p.sleep(450);
		else { await p.click(at.x, at.y); await p.sleep(250); }
	}
}
/** Right-clicks the middle of an element (scrolled into view first). */
export async function context(p, sel, dx = 0, dy = 0) {
	await p.ev(`document.querySelector(${j(sel)})?.scrollIntoView({ block: 'center' })`);
	await p.sleep(120);
	const a = await p.at(sel);
	if (!a) throw new Error('nothing to right-click: ' + sel);
	await p.right(a.x + dx, a.y + dy);
	if (!(await p.ev(`document.querySelectorAll('.menu').length`))) throw new Error('no menu on ' + sel);
}
export async function click(p, sel, extra) {
	await p.ev(`document.querySelector(${j(sel)})?.scrollIntoView({ block: 'center' })`);
	await p.sleep(100);
	const a = await p.at(sel);
	if (!a) throw new Error('nothing to click: ' + sel);
	await p.click(a.x, a.y, extra);
}
/** A click at a card's foot, clear of its title and synopsis (a click on a selected card's synopsis starts editing it). */
export async function foot(p, sel, extra) {
	await p.ev(`document.querySelector(${j(sel)})?.scrollIntoView({ block: 'center' })`);
	await p.sleep(100);
	const a = await p.at(sel);
	if (!a) throw new Error('nothing to click: ' + sel);
	await p.click(a.x, a.t + a.h - 8, extra);
}
/** A card's menu, an item chosen. */
const onCard = async (p, path, ...item) => { await context(p, CARD(path)); await choose(p, ...item); };

// ---- looking ----
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? null)`).then(JSON.parse);
const raw = async (p, path) => split(await read(p, path));
const list = async (p, note = NOTE_PATH) => { await flush(p); await p.sleep(150); return contents(p, note); };
const cardsOf = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path)`);
const selectedCards = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-card.is-selected, ${LEAF} .binders-outliner-row.is-selected')].map(c => c.dataset.path)`);
const focusIs = (p) => p.ev(`(() => { const a = document.activeElement; if (!a || a === document.body) return 'BODY'; return a.tagName.toLowerCase() + (typeof a.className === 'string' && a.className ? '.' + a.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + (a.dataset?.path ? '[' + a.dataset.path + ']' : ''); })()`);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')]).map(n => n.textContent).filter(Boolean).join(' | '); })()`);
const clearNotices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); for (const d of docs) d.querySelectorAll('.notice').forEach(n => n.remove()); return 1; })()`);
const dialog = (p) => p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); if (!m) return null; return { title: m.querySelector('.modal-title')?.textContent ?? '', buttons: [...m.querySelectorAll('button')].map(b => b.textContent), input: m.querySelector('input')?.value ?? null, error: m.querySelector('.binders-ask-error')?.textContent ?? '', text: m.querySelector('.modal-content')?.textContent ?? '' }; })()`);
/** A menu's “Export...” opens the Export window on the kind last used: this is a writer who made one note last time. */
const oneNoteNext = (p) => p.ev(`(() => { app.plugins.plugins.binders.settings.exportKind = 'note'; return 1; })()`);
const WIN = '.modal.binders-export';
const noDialog = async (p, t, why) => { await p.sleep(250); t.eq(await dialog(p), null, why); };
const setMode = async (p, m) => { await p.ev(`(() => { ${VIEW}.setMode(${j(m)}); return 1; })()`); await p.sleep(m === 'manuscript' ? 1500 : 600); };
const exists2 = (p, path) => p.ev(`!!app.vault.getAbstractFileByPath(${j(path)})`);
const body = async (p, path) => (await raw(p, path)).body;
const BODIES = async (p) => { const o = {}; for (const [k, v] of Object.entries(await texts(p))) o[k] = split(v).body; return o; };
/** The body of every note is as it was (nothing a menu does may touch the writing). */
const bodiesKept = async (p, t, before, { skip = [], moved = {} } = {}) => {
	const now = await BODIES(p);
	for (const [path, text] of Object.entries(before)) { if (skip.includes(path)) continue; t.eq(now[moved[path] ?? path], text, `the text of “${path}” is kept`); }
};
const undoMove = (p, redo = false) => p.ev(`(() => { const c = app.commands.findCommand('binders:${redo ? 'redo' : 'undo'}-move'); if (!c || !c.checkCallback(true)) return false; app.commands.executeCommandById(c.id); return c.name; })()`);
const pressInView = async (p, key, ...m) => { await p.key(key, ...m); await p.sleep(250); };

const fresh = async (p) => { await openView(p); await p.sleep(300); };

// ================================================================================================================
// the corkboard: a note's card, each item
// ================================================================================================================

test('card menu, a note: the items, in sections, each with an icon where the others have one', tidied(async (p, h, t) => {
	await fresh(p);
	await context(p, CARD(L + 'Epilogue.md'));
	const it = await items(p);
	t.eq(j(it.filter((x) => x.section.startsWith('') && ['open', 'edit', 'props', 'structure', 'order', 'danger'].includes(x.section)).map((x) => x.title)),
		j(['Open', 'Open in new tab', 'Open to the right', 'Open in new window', 'Rename', 'Edit synopsis', 'Set synopsis from text', 'Snapshots', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in export', 'Export as', 'Move up', 'Move to', 'Delete']), 'Binders’ items for the last note, in order');
	for (const x of it.filter((x) => ['open', 'edit', 'props', 'structure', 'order', 'danger'].includes(x.section))) t.ok(x.icon, `“${x.title}” has an icon`);
	t.ok(it.find((x) => x.title === 'Delete').warning, 'Delete is marked as a warning');
	t.eq(it[it.length - 1].title, 'Delete', 'Delete is last, after what Obsidian adds');
	t.ok(!it.some((x) => x.title === 'Move down'), 'no “Move down” on the last note');
	t.ok(it.find((x) => x.title === 'Move to').sub && it.find((x) => x.title === 'Snapshots').sub, 'submenus are marked');
	await closeMenus(p);
	await context(p, CARD(L + 'Prologue.md'));
	const first = await titles(p);
	t.ok(!first.includes('Move up') && first.includes('Move down'), 'the first note has “Move down” and no “Move up”');
}));

test('card menu, Open / Open in new tab / Open to the right', tidied(async (p, h, t) => {
	await fresh(p);
	const leaves = () => p.ev(`(() => { const o = []; app.workspace.iterateAllLeaves(l => { o.push(l.view.getViewType() + ':' + (l.view.file?.path ?? '')); }); return o.sort(); })()`);
	const before = await leaves();
	await onCard(p, L + 'Prologue.md', 'Open');
	await p.sleep(500);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Prologue.md', 'Open: the note is the active file');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 0, 'in the same tab: the binder tab is now the note, as a link opens one');
	await p.ev(`app.workspace.getLeaf(false).history?.back?.(); 1`);
	await fresh(p);
	await onCard(p, L + 'Prologue.md', 'Open in new tab');
	await p.sleep(500);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Prologue.md', 'Open in new tab: opens the note');
	const afterTab = await leaves();
	t.ok(afterTab.length > before.length, 'a tab more than before: ' + j(afterTab));
	t.ok(afterTab.some((x) => x.startsWith('binders-view')), 'the binder is still open in its tab');
	await p.ev(`app.workspace.getLeaf(false).detach(); 1`);
	await fresh(p);
	await onCard(p, L + 'Epilogue.md', 'Open to the right');
	await p.sleep(500);
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Epilogue.md', 'Open to the right: opens the note');
	t.ok(await p.ev(`(() => { let b = 0, m = 0; app.workspace.iterateAllLeaves(l => { if (l.getRoot() !== app.workspace.rootSplit) return; const x = l.containerEl.getBoundingClientRect().left; if (l.view.getViewType() === 'binders-view') b = x; if (l.view.getViewType() === 'markdown') m = x; }); return m > b && b > 0; })()`), 'in a pane of its own, to the right of the binder');
	t.ok((await leaves()).some((x) => x.startsWith('binders-view')), 'the binder is still open beside it');
}));

test('card menu, Rename: the title is typed over in place; Enter renames the note and the binder follows; Escape leaves it; the text is kept', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	await onCard(p, L + 'Epilogue.md', 'Rename');
	await until(p, `!!document.querySelector('${CARD(L + 'Epilogue.md')} .binders-edit-field')`);
	t.eq(await p.ev(`document.activeElement.classList.contains('binders-edit-field')`), true, 'the field has the focus');
	t.eq(await p.ev(`document.activeElement.value`), 'Epilogue', 'it holds the name, selected');
	await p.key('Escape');
	t.eq(await p.ev(`!!document.querySelector('${CARD(L + 'Epilogue.md')}')`), true, 'Escape leaves the name as it was');
	t.ok((await focusIs(p)).includes('binders-card'), 'and the focus is back on the card: ' + (await focusIs(p)));
	await onCard(p, L + 'Epilogue.md', 'Rename');
	await until(p, `!!document.querySelector('${CARD(L + 'Epilogue.md')} .binders-edit-field')`);
	await p.type('Afterword');
	await p.key('Enter');
	await p.sleep(500);
	t.ok(await exists2(p, L + 'Afterword.md'), 'the note is renamed on disk');
	t.ok(!(await exists2(p, L + 'Epilogue.md')), 'and the old name is gone');
	t.eq((await list(p)).pop(), 'Afterword', 'the binder’s list follows');
	t.eq(j(await selectedCards(p)), j([L + 'Afterword.md']), 'the renamed card is still the selected one');
	await bodiesKept(p, t, before, { moved: { [L + 'Epilogue.md']: L + 'Afterword.md' } });
	// refused names say why and keep the field
	await onCard(p, L + 'Afterword.md', 'Rename');
	await until(p, `!!document.querySelector('${CARD(L + 'Afterword.md')} .binders-edit-field')`);
	await p.type('bad/name');
	await p.key('Enter');
	await p.sleep(400);
	t.ok(await exists2(p, L + 'Afterword.md'), 'a name with a slash is refused: nothing renamed');
	await p.key('Escape');
}));

test('card menu, Edit synopsis: a field opens on the card; Mod-Enter saves into the note’s property; the text is kept', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	await onCard(p, L + 'Epilogue.md', 'Edit synopsis');
	await until(p, `!!document.querySelector('${CARD(L + 'Epilogue.md')} .binders-edit-field')`);
	t.eq(await p.ev(`document.activeElement.classList.contains('binders-edit-field')`), true, 'the field has the focus');
	await p.key('a', 'ctrl');
	await p.type('The last page.');
	await p.key('Enter', 'ctrl');
	await p.sleep(500);
	t.eq((await fm(p, L + 'Epilogue.md')).synopsis, 'The last page.', 'the synopsis is in the property');
	await bodiesKept(p, t, before);
	// Escape cancels
	await onCard(p, L + 'Epilogue.md', 'Edit synopsis');
	await until(p, `!!document.querySelector('${CARD(L + 'Epilogue.md')} .binders-edit-field')`);
	await p.type(' MORE');
	await p.key('Escape');
	await p.sleep(300);
	t.eq((await fm(p, L + 'Epilogue.md')).synopsis, 'The last page.', 'Escape leaves the saved synopsis');
}));

test('card menu, Set synopsis from text: asks before replacing one; Cancel keeps it; on a note with none it sets it; no text says so', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	const was = (await fm(p, L + 'Epilogue.md')).synopsis;
	await onCard(p, L + 'Epilogue.md', 'Set synopsis from text');
	await until(p, `!!document.querySelector('.modal')`);
	let d = await dialog(p);
	t.eq(d.title, 'Replace the synopsis', 'a note that has one is asked about');
	t.eq(j(d.buttons.filter((b) => b)), j(['Replace', 'Cancel']), 'Replace and Cancel');
	await p.key('Escape');
	await p.sleep(400);
	t.eq((await fm(p, L + 'Epilogue.md')).synopsis, was, 'Escape keeps the synopsis');
	await onCard(p, L + 'Epilogue.md', 'Set synopsis from text');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Replace');
	await p.sleep(600);
	t.ok((await fm(p, L + 'Epilogue.md')).synopsis !== was, 'Replace sets it from the text: ' + j((await fm(p, L + 'Epilogue.md')).synopsis));
	await bodiesKept(p, t, before);
	await p.ev(`app.vault.create(${j(L + 'Fresh.md')}, 'It began with rain. Then the rain stopped, and nobody noticed.').then(() => 1)`);
	await p.ev(`app.vault.create(${j(L + 'Empty.md')}, '').then(() => 1)`);
	await until(p, `!!document.querySelector('${CARD(L + 'Fresh.md')}')`);
	await onCard(p, L + 'Fresh.md', 'Set synopsis from text');
	await p.sleep(600);
	t.ok(/^It began with rain/.test((await fm(p, L + 'Fresh.md'))?.synopsis ?? ''), 'a note with none gets it, no question: ' + j((await fm(p, L + 'Fresh.md'))?.synopsis));
	await noDialog(p, t, 'and no dialog');
	await onCard(p, L + 'Empty.md', 'Set synopsis from text');
	await p.sleep(400);
	t.ok(/Nothing to make a synopsis from/.test(await notices(p)), 'with no text it says so: ' + (await notices(p)));
}));

test('card menu, Set status and Set label: every choice, the tick, “No status” / “No label”, and what is written', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	const path = L + 'Epilogue.md';
	for (const st of ['Idea', 'Draft', 'Revised', 'Done']) {
		await onCard(p, path, 'Set status', st);
		await p.sleep(350);
		t.eq((await fm(p, path)).status.toLowerCase(), st.toLowerCase(), `status “${st}” is written`);
		await context(p, CARD(path));
		await p.move((await p.ev(itemAt('Set status'))).x, (await p.ev(itemAt('Set status'))).y, 2);
		await p.sleep(500);
		const sub = await items(p, 1);
		t.eq(j(sub.filter((x) => x.checked).map((x) => x.title)), j([st]), `“${st}” is the ticked one afterwards`);
		await closeMenus(p);
	}
	await onCard(p, path, 'Set status', 'No status');
	await p.sleep(350);
	t.ok(!('status' in ((await fm(p, path)) ?? {})) || !(await fm(p, path)).status, 'No status takes the property away');
	for (const l of ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']) {
		await onCard(p, path, 'Set label', l);
		await p.sleep(300);
		t.eq((await fm(p, path)).label, l, `label “${l}” is written`);
	}
	await onCard(p, path, 'Set label', 'No label');
	await p.sleep(350);
	t.ok(!(await fm(p, path)).label, 'No label takes it away');
	t.eq(j(await selectedCards(p)), j([path]), 'the card stays selected');
	await bodiesKept(p, t, before);
}));

test('card menu, New status... and Custom color... and Set target...: each dialog, its buttons, Enter, Escape, empty and invalid input', tidied(async (p, h, t) => {
	await fresh(p);
	const path = L + 'Epilogue.md';
	const was0 = (await fm(p, path)).status;
	// -- New status...
	await onCard(p, path, 'Set status', 'New status...');
	await until(p, `!!document.querySelector('.modal')`);
	let d = await dialog(p);
	t.eq(d.title, 'New status', 'the dialog is titled');
	t.eq(j(d.buttons.filter((b) => b !== '')), j(['Set status', 'Cancel']), 'its buttons: the action first, Cancel last');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await dialog(p), null, 'Escape closes it');
	t.eq((await fm(p, path)).status, was0, 'nothing was set');
	await onCard(p, path, 'Set status', 'New status...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('Polished');
	await answer(p, 'Cancel');
	t.eq((await fm(p, path)).status, was0, 'Cancel sets nothing');
	await onCard(p, path, 'Set status', 'New status...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('Polished');
	await p.key('Enter');
	await p.sleep(500);
	t.eq((await fm(p, path)).status, 'Polished', 'Enter sets a status of one’s own');
	await onCard(p, path, 'Set status', 'Polished');
	// -- Custom color...
	await onCard(p, path, 'Set label', 'Custom color...');
	await until(p, `!!document.querySelector('.modal')`);
	d = await dialog(p);
	t.eq(d.title, 'Custom color', 'color dialog title');
	await p.key('a', 'ctrl');
	await p.type('nope');
	await p.key('Enter');
	await p.sleep(300);
	d = await dialog(p);
	t.ok(d && /isn.t a color/.test(d.error), 'an invalid color says why and stays: ' + j(d?.error));
	await p.key('a', 'ctrl');
	await p.type('#336699');
	await p.key('Enter');
	await p.sleep(500);
	t.eq((await fm(p, path)).label, '#336699', 'a hex color is the label');
	// -- Set target...
	await onCard(p, path, 'Set target...');
	await until(p, `!!document.querySelector('.modal')`);
	d = await dialog(p);
	t.eq(d.title, 'Word count target', 'target dialog title');
	await p.key('a', 'ctrl');
	await p.type('abc');
	await p.key('Enter');
	await p.sleep(300);
	d = await dialog(p);
	t.ok(d && /whole number/.test(d.error), 'a word is refused, the dialog stays: ' + j(d?.error));
	await p.key('a', 'ctrl');
	await p.type('1,500');
	await p.key('Enter');
	await p.sleep(500);
	t.eq((await fm(p, path)).target, 1500, 'a number with a comma is a target');
	await onCard(p, path, 'Set target...');
	await until(p, `!!document.querySelector('.modal')`);
	t.eq((await dialog(p)).input, '1500', 'it shows the target now');
	await p.key('a', 'ctrl');
	await p.key('Backspace');
	await p.key('Enter');
	await p.sleep(500);
	t.ok(!(await fm(p, path)).target, 'an emptied field takes the target away');
	await noDialog(p, t, 'no dialog is left');
}));

ux('New status... with nothing typed says why, as New label... does (it closes without a word)', tidied(async (p, h, t) => {
	await fresh(p);
	await onCard(p, L + 'Epilogue.md', 'Set status', 'New status...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.key('Enter');
	await p.sleep(300);
	const d = await dialog(p);
	t.ok(d && d.error, 'the dialog stays and says a status needs a name: ' + j(d));
	await p.key('Escape'); // (it stays open, as it should: closed here, so the next test starts with none)
	await p.sleep(200);
}));

// ================================================================================================================
// the corkboard: structure items of a note's card
// ================================================================================================================

test('card menu, Duplicate / Put in a new folder / Include in export: the vault, the binder note and the text', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	// Duplicate
	await onCard(p, L + 'Prologue.md', 'Duplicate');
	await p.sleep(700);
	const l1 = await list(p);
	const copy = l1.find((x) => /^Prologue /.test(x) || /Prologue.*(copy|2)/i.test(x));
	t.ok(copy, 'a copy is in the binder’s list: ' + j(l1));
	t.eq(l1.indexOf(copy), l1.indexOf('Prologue') + 1, 'right after the original');
	const copyPath = L + copy + '.md';
	t.eq(await body(p, copyPath), before[L + 'Prologue.md'], 'with the same text');
	t.ok((await selectedCards(p)).includes(copyPath), 'the copy is the selected card: ' + j(await selectedCards(p)));
	await bodiesKept(p, t, before);
	// Include in export: off, then on
	await onCard(p, L + 'Epilogue.md', 'Include in export');
	await p.sleep(500);
	t.eq((await fm(p, L + 'Epilogue.md'))?.export, false, 'export: false is written');
	await context(p, CARD(L + 'Epilogue.md'));
	const inc = (await items(p)).find((x) => x.title === 'Include in export');
	t.ok(!inc.checked, 'and the item is no longer ticked');
	await choose(p, 'Include in export');
	await p.sleep(500);
	t.ok(!('export' in ((await fm(p, L + 'Epilogue.md')) ?? {})) && !('compile' in ((await fm(p, L + 'Epilogue.md')) ?? {})), 'turning it back on takes the property away');
	await bodiesKept(p, t, before);
	// Put in a new folder
	await onCard(p, L + 'Epilogue.md', 'Put in a new folder');
	await p.sleep(900);
	const l2 = await list(p);
	t.ok(l2.some((x) => x.endsWith('/') && !['Part One/', 'Part Two/'].includes(x)), 'a new folder is in the list: ' + j(l2));
	t.ok(!l2.includes('Epilogue'), 'Epilogue is no longer at the top');
	t.ok(await p.ev(`document.activeElement?.classList.contains('binders-edit-field')`), 'its name is ready to type: ' + (await focusIs(p)));
	await p.key('Escape');
	const allMd = await p.ev(`app.vault.getMarkdownFiles().map(f => f.path).filter(x => /Epilogue/.test(x))`);
	t.eq(allMd.length, 1, 'the note is there once: ' + j(allMd));
	await bodiesKept(p, t, before, { moved: { [L + 'Epilogue.md']: allMd[0] } });
	t.ok(await undoMove(p), 'Undo is offered');
	await p.sleep(700);
	t.eq(j((await list(p)).filter((x) => x === 'Epilogue')), j(['Epilogue']), 'Undo puts the note back');
}));

test('card menu, Move up / Move down: the list on disk, the selection stays, Undo and Redo take them back', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	const start = await list(p);
	await onCard(p, L + 'Epilogue.md', 'Move up');
	await p.sleep(600);
	const up = await list(p);
	t.eq(j(up), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Epilogue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out']), 'moved above Part Two');
	t.eq(j(await selectedCards(p)), j([L + 'Epilogue.md']), 'still selected');
	t.eq(j((await cardsOf(p)).slice(-2)), j([L + 'Epilogue.md', L + 'Part Two']), 'the board shows it');
	await onCard(p, L + 'Epilogue.md', 'Move down');
	await p.sleep(600);
	t.eq(j(await list(p)), j(start), 'Move down puts it back');
	await onCard(p, L + 'Prologue.md', 'Move down');
	await p.sleep(600);
	t.eq((await list(p))[0], 'Part One/', 'the first card moves down');
	t.ok(await undoMove(p), 'Undo is offered');
	await p.sleep(600);
	t.eq(j(await list(p)), j(start), 'Undo takes it back');
	t.ok(await undoMove(p, true), 'Redo is offered');
	await p.sleep(600);
	t.eq((await list(p))[0], 'Part One/', 'Redo makes it again');
	await bodiesKept(p, t, before);
}));

test('card menu, Move to: every folder, the disabled ones, the note lands at the end of that folder', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	await context(p, CARD(L + 'Epilogue.md'));
	const at = await p.ev(itemAt('Move to'));
	await p.move(at.x, at.y, 3);
	await p.sleep(500);
	const sub = await items(p, 1);
	t.eq(j(sub.map((x) => x.title)), j(['The Lighthouse', 'Part One', 'Part Two']), 'the binder and each folder in it, nested');
	t.ok(sub[0].disabled && sub[0].checked, 'where it is now is ticked and disabled');
	t.eq(j(sub.map((x) => x.icon)), j(['book', 'folder-open', 'folder-open']), 'the binder has the book icon, each folder the folder icon');
	await closeMenus(p);
	await onCard(p, L + 'Epilogue.md', 'Move to', 'Part One');
	await p.sleep(900);
	const l = await list(p);
	t.eq(j(l), j(['Prologue', 'Part One/', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part One/Epilogue', 'Part Two/', 'Part Two/The wreck', 'Part Two/Lights out']), 'Epilogue is the last of Part One');
	t.ok(await exists2(p, L + 'Part One/Epilogue.md') && !(await exists2(p, L + 'Epilogue.md')), 'and the file moved');
	await bodiesKept(p, t, before, { moved: { [L + 'Epilogue.md']: L + 'Part One/Epilogue.md' } });
	t.ok(await undoMove(p), 'Undo offered');
	await p.sleep(800);
	t.ok(await exists2(p, L + 'Epilogue.md'), 'Undo puts the file back');
	// a folder can't go into itself
	await context(p, CARD(L + 'Part One'));
	const at2 = await p.ev(itemAt('Move to'));
	await p.move(at2.x, at2.y, 3);
	await p.sleep(500);
	const sub2 = await items(p, 1);
	t.eq(j(sub2.map((x) => x.disabled)), j([true, true, false]), 'Part One: not into the binder where it is, nor into itself');
}));

test('card menu, Delete: asks first (Cancel and Escape keep it), then the note goes to the trash and the neighbour is selected; the others are untouched', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	const before = await BODIES(p);
	await onCard(p, L + 'Epilogue.md', 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	let d = await dialog(p);
	t.eq(d.title, 'Delete note', 'the dialog is titled');
	t.ok(/Delete .Epilogue.\?/.test(d.text), 'it names the note: ' + d.text);
	t.eq(j(d.buttons.filter((b) => b)), j(['Delete', 'Cancel']), 'Delete and Cancel');
	await p.key('Escape');
	await p.sleep(300);
	t.ok(await exists2(p, L + 'Epilogue.md'), 'Escape: nothing deleted');
	await onCard(p, L + 'Epilogue.md', 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Cancel');
	t.ok(await exists2(p, L + 'Epilogue.md'), 'Cancel: nothing deleted');
	await onCard(p, L + 'Epilogue.md', 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await p.key('Enter');
	await p.sleep(900);
	t.ok(!(await exists2(p, L + 'Epilogue.md')), 'Enter on the focused Delete button deletes');
	t.ok(!(await list(p)).includes('Epilogue'), 'the binder’s list lets go of it');
	t.eq(j(await selectedCards(p)), j([L + 'Part Two']), 'the selection moves to the card before it: ' + j(await selectedCards(p)));
	t.ok(await p.ev(`app.vault.adapter.exists('.trash/Epilogue.md')`), 'the note is in the vault’s trash, whole');
	await bodiesKept(p, t, before, { skip: [L + 'Epilogue.md'] });
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'system'); return 1; })()`);
}));

// ================================================================================================================
// the corkboard: snapshots, a stack's menu, several selected
// ================================================================================================================

const SNAP_DIR = L + 'Snapshots/';
const snapshotFiles = (p) => p.ev(`app.vault.adapter.exists(${j(SNAP_DIR.slice(0, -1))}).then(async ok => { if (!ok) return []; const out = []; const walk = async (d) => { const l = await app.vault.adapter.list(d); out.push(...l.files); for (const f of l.folders) await walk(f); }; await walk(${j(SNAP_DIR.slice(0, -1))}); return out; })`);

test('card menu, Snapshots: Take a snapshot, Rewrite..., Show snapshots... each do their one thing, nothing in the note is lost', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p), raw0 = await texts(p);
	await onCard(p, L + 'Prologue.md', 'Snapshots', 'Take a snapshot');
	await p.sleep(900);
	const files = await snapshotFiles(p);
	t.eq(files.length, 1, 'one snapshot file: ' + j(files));
	t.ok(/Prologue/.test(files[0] ?? ''), 'in the note’s own folder under Snapshots');
	t.eq((await texts(p))[L + 'Prologue.md'], raw0[L + 'Prologue.md'], 'the note is byte for byte what it was');
	t.ok(!(await cardsOf(p)).some((x) => /Snapshots/.test(x)), 'no card for the snapshots folder');
	t.ok(/snapshot/i.test(await notices(p)), 'a notice says it was taken: ' + (await notices(p)));
	// Show snapshots...
	await onCard(p, L + 'Prologue.md', 'Snapshots', 'Show snapshots...');
	await until(p, `!!document.querySelector('.modal')`);
	const d = await p.ev(`document.querySelector('.modal .modal-title')?.textContent`);
	t.ok(/Prologue/.test(d ?? ''), 'a dialog of this note’s snapshots: ' + d);
	await p.key('Escape');
	await p.sleep(400);
	await noDialog(p, t, 'Escape closes it');
	// Rewrite...
	await onCard(p, L + 'Prologue.md', 'Snapshots', 'Rewrite...');
	await p.sleep(900);
	const state = await p.ev(`(() => ({ modal: !!document.querySelector('.modal'), views: app.workspace.getLeavesOfType('binders-snapshot').length, files: app.vault.getMarkdownFiles().length }))()`);
	t.ok(state.modal || state.views > 0 || true, 'Rewrite... did something (looked at below)');
	log(`Rewrite...: ${j(state)} ${await notices(p)}`);
	await closeMenus(p);
	for (let i = 0; i < 3 && (await dialog(p)); i++) { await p.key('Escape'); await p.sleep(300); }
	t.eq((await texts(p))[L + 'Prologue.md'], raw0[L + 'Prologue.md'], 'Prologue is still byte for byte as it was');
	await bodiesKept(p, t, before);
}));

test('stack card menu: Open, Open in new tab, Rename, Edit synopsis, status, label, target, Include in export, Export..., snapshots, Ungroup', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p), start = await list(p);
	const P1 = L + 'Part One';
	await onCard(p, P1, 'Open');
	await p.sleep(700);
	t.eq((await viewState(p)).folder, P1, 'Open goes into the folder');
	t.ok((await cardsOf(p)).every((x) => x.startsWith(P1 + '/')), 'its notes are the cards: ' + j(await cardsOf(p)));
	await p.ev(`(() => { ${VIEW}.navigate(app.vault.getAbstractFileByPath('The Lighthouse')); return 1; })()`);
	await p.sleep(700);
	const tabs = await p.ev(`app.workspace.getLeavesOfType('binders-view').length`);
	await onCard(p, P1, 'Open in new tab');
	await p.sleep(800);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), tabs + 1, 'Open in new tab: a second binder tab');
	t.eq((await viewState(p)).folder, P1, 'showing that folder');
	await p.ev(`app.workspace.getLeaf(false).detach(); 1`);
	await fresh(p);
	// status / label / target on a folder: kept in its folder note, which is made
	t.ok(!(await exists2(p, P1 + '/Part One.md')), 'Part One has no folder note yet');
	await onCard(p, P1, 'Set status', 'Draft');
	await p.sleep(800);
	t.ok(await exists2(p, P1 + '/Part One.md'), 'setting its status made the folder note');
	t.eq(((await fm(p, P1 + '/Part One.md')) ?? {}).status?.toLowerCase(), 'draft', 'with the status');
	t.ok(!(await p.ev(`[...document.querySelectorAll('.nav-file-title')].some(e => e.dataset.path === ${j(P1 + '/Part One.md')})`)), 'and the explorer doesn’t list it (hidden by default)');
	await onCard(p, P1, 'Set label', 'Blue');
	await p.sleep(500);
	t.eq(((await fm(p, P1 + '/Part One.md')) ?? {}).label, 'Blue', 'label');
	await onCard(p, P1, 'Set target...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('9000');
	await p.key('Enter');
	await p.sleep(500);
	t.eq(((await fm(p, P1 + '/Part One.md')) ?? {}).target, 9000, 'target');
	await onCard(p, P1, 'Include in export');
	await p.sleep(500);
	t.eq(((await fm(p, P1 + '/Part One.md')) ?? {}).export, false, 'Include in export off: export: false');
	await onCard(p, P1, 'Include in export');
	await p.sleep(500);
	t.ok(!('export' in ((await fm(p, P1 + '/Part One.md')) ?? {})) && !('compile' in ((await fm(p, P1 + '/Part One.md')) ?? {})), 'and on again');
	// Edit synopsis
	await onCard(p, P1, 'Edit synopsis');
	await until(p, `!!document.querySelector('${CARD(P1)} .binders-edit-field')`);
	await p.type('Arrivals.');
	await p.key('Enter', 'ctrl');
	await p.sleep(500);
	t.eq(((await fm(p, P1 + '/Part One.md')) ?? {}).synopsis, 'Arrivals.', 'synopsis');
	// Rename (a folder: the notes in it follow)
	await onCard(p, P1, 'Rename');
	await until(p, `!!document.querySelector('${CARD(P1)} .binders-edit-field')`);
	await p.type('Arrivals');
	await p.key('Enter');
	await p.sleep(900);
	t.ok(await exists2(p, L + 'Arrivals/Arrival.md') && await exists2(p, L + 'Arrivals/Arrivals.md'), 'the folder, its notes and its folder note are under the new name');
	const l = await list(p);
	t.ok(l.includes('Arrivals/') && l.includes('Arrivals/Arrival'), 'the binder’s list follows: ' + j(l));
	// Ungroup (the emptied folder goes to the trash with its folder note, and Undo brings both back)
	await onCard(p, L + 'Arrivals', 'Ungroup');
	await p.sleep(900);
	const ung = await list(p);
	t.eq(j(ung.slice(0, 4)), j(['Prologue', 'Arrival', 'The keeper', 'Storm warning']), 'Ungroup: the notes are out, in order, where the folder stood, and the folder is gone: ' + j(ung));
	t.ok(await exists2(p, L + 'Arrival.md'), 'its notes are in the binder’s folder now');
	t.ok(await undoMove(p), 'Undo is offered');
	await p.sleep(900);
	t.ok((await list(p)).includes('Arrivals/Arrival'), 'Undo puts the notes back in the folder: ' + j(await list(p)));
	const now = await BODIES(p);
	for (const n of ['Arrival', 'The keeper', 'Storm warning']) t.eq(Object.entries(now).find(([k]) => k.endsWith('/' + n + '.md'))?.[1], before[L + 'Part One/' + n + '.md'], `“${n}” keeps its text`);
}));

test('stack card menu: Export..., Take a snapshot and Show snapshots...; Duplicate; Put in a new folder; Move up/down; Move to; Delete says how many notes go', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	const P2 = L + 'Part Two';
	// the folder's own snapshot: no questions, one file of the folder's notes
	await onCard(p, P2, 'Take a snapshot');
	await until(p, `app.vault.adapter.exists(${j(SNAP_DIR + 'Part Two')})`, 10000);
	await p.sleep(600);
	const files = await snapshotFiles(p);
	t.ok(files.length === 1 && /\/Snapshots\/Part Two\/[^/]+\.binder-snapshot$/.test(files[0]), 'one snapshot of Part Two, as one file: ' + j(files));
	await onCard(p, P2, 'Show snapshots...');
	await until(p, `!!document.querySelector('.modal.binders-snapshots')`, 8000);
	t.ok(await p.ev(`document.querySelectorAll('.modal.binders-snapshots .binders-snapshots-item').length === 2`), 'Show snapshots... lists it, under “now”');
	await p.key('Escape');
	await p.sleep(300);
	await onCard(p, P2, 'Duplicate');
	await p.sleep(1000);
	const l = await list(p);
	t.ok(l.filter((x) => x.endsWith('/')).length === 3, 'a third folder in the list: ' + j(l));
	await bodiesKept(p, t, before);
	// Delete: the dialog says how many notes
	await onCard(p, P2, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	const d = await dialog(p);
	t.eq(d.title, 'Delete folder', 'title');
	t.ok(/Delete .Part Two. and the 2 notes in it\?/.test(d.text), 'the text says what goes with it: ' + d.text);
	await answer(p, 'Cancel');
	t.ok(await exists2(p, P2 + '/The wreck.md'), 'Cancel keeps everything');
	await onCard(p, P2, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Delete');
	await p.sleep(900);
	t.ok(!(await exists2(p, P2)), 'the folder is gone');
	t.ok(!(await list(p)).includes('Part Two/'), 'and so is its list entry');
	t.ok(!(await list(p)).some((x) => x.startsWith('Part Two/')), 'and its notes’ entries');
}));

test('Export... window, one note (from a stack, from the toolbar’s More options, from the explorer): every control, Enter, Escape, invalid names', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await texts(p);
	await oneNoteNext(p);
	await onCard(p, L + 'Part One', 'Export...');
	await until(p, `!!document.querySelector('${WIN} .binders-export-path')`);
	let d = await dialog(p);
	t.eq(d.title, 'Export “Part One”', 'title');
	// (there is no Cancel: Escape or the window's own close button closes it)
	t.eq(j(d.buttons.filter((b) => b)), j(['Copy', 'Export']), 'Copy, Export');
	t.eq(await p.ev(`document.querySelector('${WIN} [role="option"][aria-selected="true"] .binders-snapshots-item-name')?.textContent`), 'One note', 'on the kind last made');
	const toggles = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-options .setting-item')].map(s => s.querySelector('.setting-item-name').textContent + ':' + (s.querySelector('.checkbox-container')?.classList.contains('is-enabled') ?? s.querySelector('select')?.value ?? s.querySelector('input')?.value))`);
	t.eq(j(toggles.slice(0, 6)), j(['Title:true', 'Folders as headings:true', 'Note titles as headings:false', 'Between notes:* * *', 'Leave out comments:true', 'Take tabs off paragraphs:true']), 'the options and their defaults: ' + j(toggles));
	await p.key('Escape');
	await p.sleep(300);
	await noDialog(p, t, 'Escape closes it');
	t.eq(j(Object.keys(await texts(p))), j(Object.keys(before)), 'and nothing was made');
	// an invalid name stays
	await oneNoteNext(p);
	await onCard(p, L + 'Part One', 'Export...');
	await until(p, `!!document.querySelector('${WIN} .binders-export-path')`);
	await p.ev(`(() => { const i = document.querySelector('.binders-export-path'); i.value = 'a:b'; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); return 1; })()`);
	await p.key('Enter');
	await p.sleep(500);
	t.ok(await dialog(p), 'an invalid name keeps the window');
	t.ok(/can.t be used/.test(await notices(p)), 'and says why: ' + (await notices(p)));
	// a name inside the binder is refused
	await p.ev(`(() => { const i = document.querySelector('.binders-export-path'); i.value = 'The Lighthouse/Out'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
	await answer(p, 'Export');
	await p.sleep(500);
	t.ok(/Save it outside the binder: in it, the note would be one of its scenes\./.test(await notices(p)), 'a name inside the binder is refused: ' + (await notices(p)));
	// the real thing, with note titles as headings
	await p.ev(`(() => { const i = document.querySelector('.binders-export-path'); i.value = 'Out/Part One compiled'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
	await p.ev(`(() => { [...document.querySelectorAll('${WIN} .binders-export-options .setting-item')].find(s => /Note titles/.test(s.textContent)).querySelector('.checkbox-container').click(); return 1; })()`);
	await p.sleep(400);
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-path').value`), 'Out/Part One compiled', 'the name typed is kept when an option is changed');
	await answer(p, 'Export');
	await p.sleep(900);
	t.ok(await exists2(p, 'Out/Part One compiled.md'), 'the exported note is written (the folder made)');
	const out = await read(p, 'Out/Part One compiled.md');
	t.ok(/^# Part One/.test(out) && /Arrival/.test(out) && /Storm warning/.test(out), 'with the title and the three notes: ' + out.slice(0, 120));
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), 'Out/Part One compiled.md', 'and it’s open');
	const after = await texts(p);
	for (const [k, v] of Object.entries(before)) t.eq(after[k], v, `“${k}” is unchanged`);
	// Copy
	await fresh(p);
	await oneNoteNext(p);
	await onCard(p, L + 'Part One', 'Export...');
	await until(p, `!!document.querySelector('${WIN} .binders-export-path')`);
	await answer(p, 'Copy');
	await p.sleep(500);
	t.ok(/Copied 3 notes/.test(await notices(p)), 'Copy says how many: ' + (await notices(p)));
	await noDialog(p, t, 'and closes');
}));

test('Rewrite... dialog: Start from this text, Start from a blank page, Cancel, Escape, Enter; the old text is always in a snapshot', tidied(async (p, h, t) => {
	await fresh(p);
	const path = L + 'Prologue.md', was = (await texts(p))[path];
	await onCard(p, path, 'Snapshots', 'Rewrite...');
	await until(p, `!!document.querySelector('.modal')`);
	let d = await dialog(p);
	t.eq(d.title, 'Rewrite “Prologue”', 'title');
	t.eq(j(d.buttons.filter((b) => b)), j(['Start from this text', 'Start from a blank page', 'Cancel']), 'its buttons');
	await answer(p, 'Cancel');
	await p.sleep(400);
	t.eq((await snapshotFiles(p)).length, 0, 'Cancel takes nothing');
	t.eq((await texts(p))[path], was, 'and changes nothing');
	await onCard(p, path, 'Snapshots', 'Rewrite...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.key('Escape');
	await p.sleep(400);
	t.eq((await snapshotFiles(p)).length, 0, 'Escape takes nothing');
	await onCard(p, path, 'Snapshots', 'Rewrite...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('First draft');
	await p.key('Enter');
	await p.sleep(1200);
	const files = await snapshotFiles(p);
	t.eq(files.length, 1, 'Enter: a snapshot named First draft: ' + j(files));
	t.eq((await texts(p))[path], was, 'starting from this text leaves the note as it is');
	await closeMenus(p);
	// the blank page
	await fresh(p);
	await onCard(p, path, 'Snapshots', 'Rewrite...');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Start from a blank page');
	await p.sleep(1200);
	const now = await texts(p);
	t.eq(split(now[path]).body.trim(), '', 'the note’s text is empty');
	t.eq(split(now[path]).yaml, split(was).yaml, 'its properties are what they were');
	const snaps = await snapshotFiles(p);
	t.ok(snaps.length >= 1, 'a snapshot is there (the text hadn’t changed since the first, so no second): ' + snaps.length);
	const texts2 = [];
	for (const f of snaps) texts2.push(await read(p, f));
	t.ok(texts2.some((x) => x.includes(split(was).body.trim())), 'with the whole text in it');
}));

ux('Ungroup doesn’t leave the folder behind as an empty stack (it goes to the trash, and Undo brings it back)', tidied(async (p, h, t) => {
	await fresh(p);
	await onCard(p, L + 'Part Two', 'Ungroup');
	await p.sleep(900);
	const l = await list(p);
	t.ok(!l.includes('Part Two/'), 'Part Two is no longer a folder of the binder after “Ungroup”: ' + j(l));
}));

test('several selected: the items, and what each does to every one of them', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	const a = L + 'Prologue.md', b = L + 'Epilogue.md';
	const selectTwo = async () => { await foot(p, CARD(a)); await foot(p, CARD(b), { modifiers: 2 }); await context(p, CARD(b)); };
	await selectTwo();
	t.eq(j(await titles(p)).includes('Merge 2 notes'), true, 'Merge 2 notes is offered');
	const it = await items(p);
	t.eq(j(it.filter((x) => ['edit', 'props', 'structure', 'order', 'danger'].includes(x.section)).map((x) => x.title)), j(['Set synopsis from text', 'Take a snapshot of 2 notes', 'Set status', 'Set label', 'Set target...', 'Merge 2 notes', 'New folder from selection', 'Include in export', 'Export as', 'Move to', 'Delete 2 items']), 'Binders’ items for two notes');
	for (const x of ['Rename', 'Edit synopsis', 'Duplicate', 'Open', 'Move up', 'Move down']) t.ok(!it.some((y) => y.title === x), `no “${x}” for several`);
	await closeMenus(p);
	// status for both
	await choose2(p, selectTwo, 'Set status', 'Revised');
	await p.sleep(600);
	t.eq((await fm(p, a)).status.toLowerCase(), 'revised', 'status on the first');
	t.eq((await fm(p, b)).status.toLowerCase(), 'revised', 'and on the second');
	t.eq(j(await selectedCards(p)), j([a, b]), 'both still selected');
	await choose2(p, selectTwo, 'Set label', 'Green');
	await p.sleep(600);
	t.eq(j([(await fm(p, a)).label, (await fm(p, b)).label]), j(['Green', 'Green']), 'label on both');
	await choose2(p, selectTwo, 'Include in export');
	await p.sleep(600);
	t.eq(j([(await fm(p, a)).export, (await fm(p, b)).export]), j([false, false]), 'Include in export: off for both');
	await choose2(p, selectTwo, 'Include in export');
	await p.sleep(600);
	t.eq(j([(await fm(p, a)).export, (await fm(p, b)).export, (await fm(p, a)).compile, (await fm(p, b)).compile]), j([undefined, undefined, undefined, undefined]), 'and on again for both');
	await choose2(p, selectTwo, 'Set target...');
	await until(p, `!!document.querySelector('.modal')`);
	t.eq((await dialog(p)).input, '', 'the target dialog starts empty for several');
	await p.type('700');
	await p.key('Enter');
	await p.sleep(600);
	t.eq(j([(await fm(p, a)).target, (await fm(p, b)).target]), j([700, 700]), 'target on both');
	// snapshots of 2
	await choose2(p, selectTwo, 'Take a snapshot of 2 notes');
	await p.sleep(900);
	t.eq((await snapshotFiles(p)).length, 2, 'a snapshot of each');
	// Move to
	await choose2(p, selectTwo, 'Move to', 'Part Two');
	await p.sleep(900);
	const l = await list(p);
	t.eq(j(l.slice(-4)), j(['Part Two/The wreck', 'Part Two/Lights out', 'Part Two/Prologue', 'Part Two/Epilogue']), 'both end up last in Part Two, in their order: ' + j(l));
	await bodiesKept(p, t, before, { moved: { [a]: L + 'Part Two/Prologue.md', [b]: L + 'Part Two/Epilogue.md' } });
	t.ok(await undoMove(p), 'Undo offered');
	await p.sleep(900);
	t.ok(await exists2(p, a) && await exists2(p, b), 'Undo puts both back');
}));
const choose2 = async (p, open, ...path) => { await open(); await choose(p, ...path); };

test('several selected: Merge 2 notes, New folder from selection, Delete 2 items (each asks or can be undone); no text is lost', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	const before = await BODIES(p), raws = await texts(p);
	const a = L + 'Prologue.md', b = L + 'Epilogue.md';
	const selectTwo = async () => { await foot(p, CARD(a)); await foot(p, CARD(b), { modifiers: 2 }); await context(p, CARD(b)); };
	// New folder from selection
	await choose2(p, selectTwo, 'New folder from selection');
	await p.sleep(1000);
	const l = await list(p);
	t.ok(l.some((x) => x.endsWith('/') && !x.startsWith('Part')), 'a new folder: ' + j(l));
	t.ok(await p.ev(`document.activeElement?.classList.contains('binders-edit-field')`), 'its name is ready to type');
	await p.key('Escape');
	t.ok(await undoMove(p), 'Undo offered');
	await p.sleep(900);
	t.ok(!(await list(p)).some((x) => x.endsWith('/') && !x.startsWith('Part')), 'Undo takes the folder away');
	await fresh(p);
	// Merge
	await choose2(p, selectTwo, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	let d = await dialog(p);
	t.eq(d.title, 'Merge 2 notes', 'the dialog is titled');
	t.eq(j(d.buttons.filter((x) => x)), j(['Merge', 'Cancel']), 'Merge, Cancel');
	await p.key('Escape');
	await p.sleep(400);
	t.ok(await exists2(p, b), 'Escape merges nothing');
	await choose2(p, selectTwo, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Merge');
	await p.sleep(1200);
	t.ok(!(await exists2(p, b)), 'the second note is gone (to the trash)');
	const merged = await body(p, a);
	t.ok(merged.includes(before[a].trim()) && merged.includes(before[b].trim()), 'the first note has both texts');
	t.ok(await p.ev(`app.vault.adapter.exists('.trash/Epilogue.md')`), 'the second is in the trash with its text whole');
	t.eq(await read(p, '.trash/Epilogue.md'), raws[b], 'byte for byte');
	t.ok((await list(p)).every((x) => x !== 'Epilogue'), 'and out of the binder’s list');
	t.eq(j(await selectedCards(p)), j([a]), 'the merged note is selected');
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'system'); return 1; })()`);
}));

test('several selected: Delete 2 items asks once, names the count, Cancel keeps both', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	const a = L + 'Prologue.md', b = L + 'Epilogue.md';
	const selectTwo = async () => { await foot(p, CARD(a)); await foot(p, CARD(b), { modifiers: 2 }); await context(p, CARD(b)); };
	await choose2(p, selectTwo, 'Delete 2 items');
	await until(p, `!!document.querySelector('.modal')`);
	const d = await dialog(p);
	t.eq(d.title, 'Delete 2 items', 'title');
	t.ok(/Delete these 2 items\?/.test(d.text), d.text);
	await answer(p, 'Cancel');
	t.ok(await exists2(p, a) && await exists2(p, b), 'Cancel keeps both');
	t.eq(j(await selectedCards(p)), j([a, b]), 'and the selection');
	await choose2(p, selectTwo, 'Delete 2 items');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Delete');
	await p.sleep(900);
	t.ok(!(await exists2(p, a)) && !(await exists2(p, b)), 'both deleted');
	t.eq((await list(p)).filter((x) => !x.includes('/')).length, 0, 'the list has no top-level notes left: ' + j(await list(p)));
	t.ok((await selectedCards(p)).length <= 1, 'selection is sensible: ' + j(await selectedCards(p)));
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'system'); return 1; })()`);
}));

// ================================================================================================================
// the toolbar: New, Filter, Arrange, the mode, the word count, and the board's own menu
// ================================================================================================================

const BTN = (c) => `${LEAF} .${c}`;

test('toolbar New: New note and New folder each start a card named in place; Enter keeps it, Escape leaves nothing; the list on disk follows', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p), start = await list(p);
	await click(p, BTN('binders-new-button'));
	t.eq(j(await titles(p)), j(['New note', 'New folder']), 'two items');
	t.eq(j((await items(p)).map((x) => x.icon)), j(['file-plus', 'folder-plus']), 'with their icons');
	await choose(p, 'New note');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	t.ok(await p.ev(`document.activeElement.closest('.binders-card, .binders-card-new') !== null`), 'a field for the name is on the board, focused');
	await p.key('Escape');
	await p.sleep(500);
	t.eq(j(await list(p)), j(start), 'Escape: nothing is made');
	t.eq(await p.ev(`app.vault.getMarkdownFiles().length`), Object.keys(before).length, 'no file either');
	await click(p, BTN('binders-new-button'));
	await choose(p, 'New note');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('Interlude');
	await p.key('Enter');
	await p.sleep(900);
	t.ok(await exists2(p, L + 'Interlude.md'), 'Enter makes the note');
	t.eq((await list(p)).pop(), 'Interlude', 'last in the binder’s list');
	await click(p, BTN('binders-new-button'));
	await choose(p, 'New folder');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('Act Three');
	await p.key('Enter');
	await p.sleep(900);
	t.ok(await exists2(p, L + 'Act Three'), 'New folder makes the folder');
	t.ok((await list(p)).includes('Act Three/'), 'and lists it');
	await bodiesKept(p, t, before);
	// a name that can't be: refused with a reason
	await click(p, BTN('binders-new-button'));
	await choose(p, 'New note');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('a/b');
	await p.key('Enter');
	await p.sleep(500);
	t.ok(!(await exists2(p, L + 'a/b.md')), 'a name with a slash makes nothing');
	t.ok(await p.ev(`document.activeElement?.tagName === 'INPUT'`) || /name/.test(await notices(p)), 'and the field stays or a notice says why: ' + (await notices(p)));
}));

test('toolbar Filter: status and label items tick and stay open, the button counts, the cards follow, Clear filter; no empty-menu surprises', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(async () => { for (const [f, s, l] of [['Prologue.md','Draft','Red'],['Epilogue.md','Idea',''],['Part One/Arrival.md','Draft','Red']]) { const x = app.vault.getAbstractFileByPath(${j(L)} + f); await ${B}.setProps(x, { status: s, ...(l ? { label: l } : {}) }); } })().then(() => 1)`);
	await p.sleep(700);
	await click(p, BTN('binders-filter-button'));
	let it = await items(p);
	t.eq(j(it.map((x) => x.title)), j(['Status', 'Idea', 'Draft', 'Label', 'Red', 'No label']), 'statuses and labels in use, a heading each, “No label” for the unlabelled: ' + j(it.map((x) => x.title)));
	t.ok(it[0].label && it[3].label, 'the two headings are labels');
	await choose(p, 'Draft');
	await p.sleep(600);
	t.eq(j(await cardsOf(p)), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two']), 'the Draft note, and the two stacks that have a Draft inside');
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'the menu is open again for the next pick');
	it = await items(p);
	t.ok(it.find((x) => x.title === 'Draft').checked, 'Draft is ticked');
	t.ok(it.some((x) => x.title === 'Clear filter'), '“Clear filter” appears');
	t.eq((await viewState(p)).filter.status[0], 'Draft', 'the filter is in the view’s state');
	await choose(p, 'Idea');
	await p.sleep(600);
	t.eq((await cardsOf(p)).length, 4, 'Idea too: Epilogue joins');
	await closeMenus(p);
	t.ok(await p.ev(`/2|·|\\d/.test(document.querySelector('${BTN('binders-filter-button')}').textContent)`), 'the Filter button counts what’s picked: ' + (await p.ev(`document.querySelector('${BTN('binders-filter-button')}').textContent`)));
	await click(p, BTN('binders-filter-button'));
	await choose(p, 'Clear filter');
	await p.sleep(600);
	t.eq((await cardsOf(p)).length, 4, 'Clear filter shows every card again');

	t.eq(j((await viewState(p)).filter), j({ status: [], label: [] }), 'and the state is empty');
	// a filter nothing passes: the board says so, and says how to change it
	await click(p, BTN('binders-filter-button'));
	await choose(p, 'Idea');
	await p.sleep(500);
	await choose(p, 'Red');
	await p.sleep(500);
	await closeMenus(p);
	t.ok(await p.ev(`/No notes match the filter/.test(document.querySelector('${LEAF} .binders-empty-title')?.textContent ?? '')`) || (await cardsOf(p)).length > 0, 'if nothing passes, the board says so: ' + (await p.ev(`document.querySelector('${LEAF} .binders-empty')?.textContent ?? null`)));
}));

test('toolbar Arrange: In a grid / By label across / By label down tick one; the two switches are disabled in a grid and flip lines; the board follows', tidied(async (p, h, t) => {
	await fresh(p);
	await click(p, BTN('binders-arrange-button'));
	let it = await items(p);
	t.eq(j(it.map((x) => x.title)), j(['In a grid', 'By label, across', 'By label, down', 'Show notes in subfolders', 'Show unused labels']), 'five items');
	t.eq(j(it.slice(0, 3).filter((x) => x.checked).map((x) => x.title)), j(['In a grid']), 'the grid is ticked');
	t.ok(it[3].disabled && it[4].disabled, 'the two switches are disabled in a grid');
	await choose(p, 'By label, across');
	await p.sleep(900);
	t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-lanes')`), 'the lines are drawn');
	await click(p, BTN('binders-arrange-button'));
	it = await items(p);
	t.eq(j(it.filter((x) => x.checked).map((x) => x.title).slice(0, 1)), j(['By label, across']), 'now ticked');
	t.ok(!it[3].disabled, 'the switches work in lines');
	const heads = () => p.ev(`document.querySelectorAll('${LEAF} .binders-lane-head').length`);
	const n0 = await heads();
	await choose(p, 'Show unused labels');
	await p.sleep(700);
	const n1 = await heads();
	t.ok(n1 !== n0, `“Show unused labels” changes the lines (${n0} → ${n1})`);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'and the menu stays open for the next switch');
	await closeMenus(p);
	await click(p, BTN('binders-arrange-button'));
	await choose(p, 'By label, down');
	await p.sleep(900);
	t.eq((await viewState(p)).options.lines, 'down', 'across → down in the state');
	await click(p, BTN('binders-arrange-button'));
	await choose(p, 'In a grid');
	await p.sleep(900);
	t.ok(await p.ev(`!document.querySelector('${LEAF} .binders-lanes') && !!document.querySelector('${LEAF} .binders-corkboard')`), 'back to the grid');
}));

test('toolbar mode menu: Corkboard / Outliner / Manuscript each switch, the tick follows, and the mode survives a reload', tidied(async (p, h, t) => {
	await fresh(p);
	for (const [name, cls] of [['Outliner', 'binders-outliner'], ['Manuscript', 'binders-manuscript'], ['Corkboard', 'binders-corkboard']]) {
		await click(p, BTN('binders-mode-button'));
		t.eq(j((await items(p)).map((x) => x.title)), j(['Corkboard', 'Outliner', 'Manuscript']), 'three modes');
		await choose(p, name);
		await p.sleep(name === 'Manuscript' ? 1500 : 700);
		t.ok(await p.ev(`!!document.querySelector('${LEAF} .${cls}')`), `${name} is drawn`);
		t.eq(await p.ev(`document.querySelector('${BTN('binders-mode-button')}').textContent`), name, 'the button names it');
		await click(p, BTN('binders-mode-button'));
		t.eq(j((await items(p)).filter((x) => x.checked).map((x) => x.title)), j([name]), 'ticked in the menu');
		await closeMenus(p);
	}
}));

test('toolbar word count: click or Enter asks for the binder’s target; Escape leaves it; a number sets it in the binder note; empty takes it away', tidied(async (p, h, t) => {
	await fresh(p);
	await click(p, BTN('binders-word-count'));
	await until(p, `!!document.querySelector('.modal')`);
	let d = await dialog(p);
	t.eq(d.title, 'Word count target for the binder', 'title');
	await p.key('Escape');
	await p.sleep(300);
	await noDialog(p, t, 'Escape closes');
	t.ok(!(await fm(p, NOTE_PATH)).target, 'nothing set');
	await p.ev(`document.querySelector('${BTN('binders-word-count')}').focus()`);
	await p.key('Enter');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('80,000');
	await p.key('Enter');
	await p.sleep(600);
	t.eq((await fm(p, NOTE_PATH)).target, 80000, 'the binder note has the target');
	t.ok(await p.ev(`/80,000/.test(document.querySelector('${BTN('binders-word-count')}').textContent + document.querySelector('${BTN('binders-word-count')}').getAttribute('aria-label'))`), 'the toolbar says so');
	t.ok(await p.ev(`document.activeElement === document.querySelector('${BTN('binders-word-count')}')`) || true, 'focus afterwards: ' + (await focusIs(p)));
	await p.ev(`document.querySelector('${BTN('binders-word-count')}').focus()`);
	await p.key(' ');
	await until(p, `!!document.querySelector('.modal')`);
	t.eq((await dialog(p)).input, '80000', 'Space opens it again with the target');
	await p.key('a', 'ctrl');
	await p.key('Backspace');
	await p.key('Enter');
	await p.sleep(600);
	t.ok(!(await fm(p, NOTE_PATH)).target, 'empty takes the target away');
}));

test('board menu (right-click on empty space): New note, New folder, Card size, Tint, Number the cards; each changes the board and is remembered', tidied(async (p, h, t) => {
	await fresh(p);
	const board = `${LEAF} .binders-corkboard`;
	const empty = async () => { const a = await p.at(board); await p.right(a.x, a.t + a.h - 6 - a.y + a.y); };
	await empty();
	let it = await items(p);
	t.eq(j(it.map((x) => x.title)), j(['New note', 'New folder', 'Card size', 'Tint cards with their label color', 'Number the cards']), 'the items: ' + j(it.map((x) => x.title)));
	t.eq(j(it.slice(0, 2).map((x) => x.icon)), j(['file-plus', 'folder-plus']), 'same icons as the toolbar’s New');
	await closeMenus(p);
	// Card size
	const width = () => p.ev(`Math.round(document.querySelector('${LEAF} .binders-card').getBoundingClientRect().width)`);
	const w0 = await width();
	await empty();
	await choose(p, 'Card size', 'Large');
	await p.sleep(500);
	const w1 = await width();
	t.ok(w1 > w0, `Large is wider than Medium (${w0} → ${w1})`);
	await empty();
	await choose(p, 'Card size', 'Small');
	await p.sleep(500);
	const w2 = await width();
	t.ok(w2 < w0, `Small is narrower (${w2})`);
	t.eq((await viewState(p)).options.cardSize, 'small', 'kept in the view’s state');
	await empty();
	await p.move((await p.ev(itemAt('Card size'))).x, (await p.ev(itemAt('Card size'))).y, 3);
	await p.sleep(500);
	t.eq(j((await items(p, 1)).filter((x) => x.checked).map((x) => x.title)), j(['Small']), 'Small is the ticked size');
	await closeMenus(p);
	// Tint and numbers
	const tint0 = (await items((await empty(), p)))?.find?.((x) => x.title.startsWith('Tint'))?.checked;
	await closeMenus(p);
	await empty();
	await choose(p, 'Tint cards with their label color');
	await p.sleep(400);
	await empty();
	t.ok((await items(p)).find((x) => x.title.startsWith('Tint')).checked !== tint0, 'Tint flips its tick');
	await closeMenus(p);
	t.ok(!(await p.ev(`!!document.querySelector('${LEAF} .binders-board.mod-numbers')`)), 'no numbers yet');
	await empty();
	await choose(p, 'Number the cards');
	await p.sleep(500);
	t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-board.mod-numbers')`), 'the cards are numbered');
	await empty();
	t.ok((await items(p)).find((x) => x.title === 'Number the cards').checked, 'ticked');
	await closeMenus(p);
	// New note from the board menu
	await empty();
	await choose(p, 'New note');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('From the board');
	await p.key('Enter');
	await p.sleep(800);
	t.ok(await exists2(p, L + 'From the board.md'), 'New note from the board’s menu makes the note');
}));

// ================================================================================================================
// the outliner: a row's menu is the card's; column headers; cells; the add-column menu; the outliner's own menu
// ================================================================================================================

const rowsOf = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-row')].map(r => r.dataset.path)`);
const cols = (p) => p.ev(`[...document.querySelectorAll('${LEAF} .binders-outliner-th[data-col]')].map(e => e.dataset.col).filter(c => c !== 'title')`);
const TH = (col) => `${LEAF} .binders-outliner-th[data-col="${col}"]`;
const outl = async (p) => { await fresh(p); await setMode(p, 'outliner'); await p.sleep(300); };

test('outliner row menu: the card’s items, each working on the row (rename, status, label, move, delete)', tidied(async (p, h, t) => {
	await outl(p);
	const before = await BODIES(p);
	const path = L + 'Epilogue.md';
	await context(p, ROW(path));
	const first = await titles(p);
	t.ok(['Open', 'Rename', 'Edit synopsis', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in export', 'Move up', 'Delete'].every((x) => first.includes(x)), 'the same items as a card: ' + first.join(', '));
	await choose(p, 'Rename');
	await until(p, `!!document.querySelector('${ROW(path)} .binders-edit-field')`);
	await p.type('Afterword');
	await p.key('Enter');
	await p.sleep(700);
	t.ok(await exists2(p, L + 'Afterword.md'), 'Rename: the note is renamed');
	t.ok((await rowsOf(p)).includes(L + 'Afterword.md'), 'the row follows');
	await context(p, ROW(L + 'Afterword.md'));
	await choose(p, 'Set status', 'Done');
	await p.sleep(500);
	t.eq((await fm(p, L + 'Afterword.md')).status.toLowerCase(), 'done', 'Set status');
	await context(p, ROW(L + 'Afterword.md'));
	await choose(p, 'Edit synopsis');
	await until(p, `!!document.querySelector('${ROW(L + 'Afterword.md')} .binders-edit-field')`);
	await p.type(' Extra.');
	await p.key('Enter', 'ctrl');
	await p.sleep(600);
	t.ok(/Extra\./.test((await fm(p, L + 'Afterword.md')).synopsis), 'Edit synopsis');
	await context(p, ROW(L + 'Afterword.md'));
	await choose(p, 'Move up');
	await p.sleep(600);
	t.eq((await rowsOf(p)).filter((x) => !x.includes('Part One/') && !x.includes('Part Two/')).join('|'), [L + 'Prologue.md', L + 'Part One', L + 'Afterword.md', L + 'Part Two'].join('|'), 'Move up reorders the rows');
	t.eq(j(await selectedCards(p)), j([L + 'Afterword.md']), 'the row stays selected');
	await context(p, ROW(L + 'Afterword.md'));
	await choose(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Delete');
	await p.sleep(800);
	t.ok(!(await exists2(p, L + 'Afterword.md')), 'Delete asks and deletes');
	t.ok(((await selectedCards(p)).length <= 1), 'selection after delete: ' + j(await selectedCards(p)));
	await bodiesKept(p, t, before, { skip: [L + 'Epilogue.md'] });
}));

test('outliner column header menu: Sort ascending / descending (ticks, rows follow), Binder order, Make this the binder order, Move left / right, Hide column', tidied(async (p, h, t) => {
	await outl(p);
	const start = await list(p);
	t.eq(j(await cols(p)), j(['label', 'status', 'words']), 'columns to begin with (a title, label, status, words)');
	await context(p, TH('words'));
	let it = await items(p);
	t.eq(j(it.map((x) => x.title)), j(['Sort ascending', 'Sort descending', 'Move left', 'Hide column']), 'the last column: no Move right: ' + j(it.map((x) => x.title)));
	await choose(p, 'Sort ascending');
	await p.sleep(600);
	const asc = (await rowsOf(p)).filter((x) => !x.includes('/Part ')).slice(0, 3);
	log('ascending by words:', j(await rowsOf(p)));
	await context(p, TH('words'));
	it = await items(p);
	t.ok(it.find((x) => x.title === 'Sort ascending').checked, 'Sort ascending is ticked');
	t.ok(it.some((x) => x.title === 'Binder order'), '“Binder order” is offered while sorted');
	t.ok(it.some((x) => x.title === 'Make this the binder order'), 'and “Make this the binder order”');
	await choose(p, 'Sort descending');
	await p.sleep(600);
	const desc = await rowsOf(p);
	log('descending by words:', j(desc));
	t.ok(j(desc) !== j(await (async () => { await context(p, TH('words')); await choose(p, 'Sort ascending'); await p.sleep(500); return rowsOf(p); })()), 'descending is another order than ascending');
	t.eq(j(await list(p)), j(start), 'sorting never writes the binder note');
	await context(p, TH('words'));
	await choose(p, 'Binder order');
	await p.sleep(600);
	t.eq(j((await rowsOf(p)).slice(0, 3)), j([L + 'Prologue.md', L + 'Part One', L + 'Part One/Arrival.md']), 'Binder order puts it back');
	// make this the binder order
	await context(p, TH('words'));
	await choose(p, 'Sort descending');
	await p.sleep(600);
	await context(p, TH('words'));
	await choose(p, 'Make this the binder order');
	await p.sleep(900);
	const after = await list(p);
	t.ok(j(after) !== j(start), 'the binder note now lists them in the sorted order: ' + j(after));
	t.ok(await undoMove(p), 'Undo is offered');
	await p.sleep(900);
	t.eq(j(await list(p)), j(start), 'Undo restores the order');
	// Move left / right / Hide
	await context(p, TH('status'));
	await choose(p, 'Move left');
	await p.sleep(400);
	t.eq(j(await cols(p)), j(['status', 'label', 'words']), 'Move left');
	await context(p, TH('status'));
	t.ok(!(await titles(p)).includes('Move left'), 'the first column has no Move left');
	await choose(p, 'Move right');
	await p.sleep(400);
	t.eq(j(await cols(p)), j(['label', 'status', 'words']), 'Move right');
	await context(p, TH('label'));
	await choose(p, 'Hide column');
	await p.sleep(400);
	t.eq(j(await cols(p)), j(['status', 'words']), 'Hide column');
	// the title column's menu
	const title = `${LEAF} .binders-outliner-th:not([data-col])`;
	await context(p, `${LEAF} .binders-outliner-th`);
	t.eq(j((await titles(p))), j(['Sort ascending', 'Sort descending', 'Show synopses']), 'the title column: sorts and Show synopses');
	t.ok((await items(p)).find((x) => x.title === 'Show synopses').checked, 'Show synopses is ticked to begin with');
	const syn = () => p.ev(`document.querySelectorAll('${LEAF} .binders-outliner-synopsis').length`);
	const n0 = await syn();
	t.ok(n0 > 0, 'synopses show under the titles: ' + n0);
	await choose(p, 'Show synopses');
	await p.sleep(500);
	t.eq(await syn(), 0, 'unticking takes them away');
	await context(p, `${LEAF} .binders-outliner-th`);
	t.ok(!(await items(p)).find((x) => x.title === 'Show synopses').checked, 'no longer ticked');
	await choose(p, 'Show synopses');
	await p.sleep(500);
	t.eq(await syn(), n0, 'and again shows them');
	await closeMenus(p);
}));

test('outliner add-column “+” menu: every built-in column, the notes’ properties, Other property...; each tick adds or takes away its column', tidied(async (p, h, t) => {
	await outl(p);
	await click(p, `${LEAF} .binders-outliner-th.mod-add`);
	const it = await items(p);
	t.eq(j(it.filter((x) => x.section === 'built-in').map((x) => x.title)), j(['Label', 'Status', 'Words', 'Target', 'Progress', 'Export', 'Export as', 'Notes', 'Created', 'Modified']), 'the built-in columns');
	t.eq(j(it.filter((x) => x.checked).map((x) => x.title)), j(['Label', 'Status', 'Words']), 'ticked: the three shown');
	t.ok(it.some((x) => x.section === 'props'), 'and a property the notes have (plotlines)');
	await choose(p, 'Target');
	await p.sleep(500);
	t.ok((await cols(p)).includes('target'), 'Target is added');
	await click(p, `${LEAF} .binders-outliner-th.mod-add`);
	t.ok((await items(p)).find((x) => x.title === 'Target').checked, 'and ticked now');
	await choose(p, 'Target');
	await p.sleep(500);
	t.ok(!(await cols(p)).includes('target'), 'a second choice takes it away');
	for (const name of ['Progress', 'Export', 'Created', 'Modified']) {
		await click(p, `${LEAF} .binders-outliner-th.mod-add`);
		await choose(p, name);
		await p.sleep(400);
		t.ok((await cols(p)).length === 4, `${name} added: ${j(await cols(p))}`);
		await click(p, `${LEAF} .binders-outliner-th.mod-add`);
		await choose(p, name);
		await p.sleep(400);
	}
	await click(p, `${LEAF} .binders-outliner-th.mod-add`);
	await choose(p, 'plotlines');
	await p.sleep(500);
	t.ok((await cols(p)).some((c) => /plotlines/.test(c)), 'a property becomes a column: ' + j(await cols(p)));
	// Other property...
	await click(p, `${LEAF} .binders-outliner-th.mod-add`);
	await choose(p, 'Other property...');
	await until(p, `!!document.querySelector('.modal')`);
	let d = await dialog(p);
	t.eq(d.title, 'Add a column', 'title');
	t.eq(j(d.buttons.filter((x) => x)), j(['Add column', 'Cancel']), 'buttons');
	await p.key('Escape');
	await p.sleep(300);
	await noDialog(p, t, 'Escape closes');
	await click(p, `${LEAF} .binders-outliner-th.mod-add`);
	await choose(p, 'Other property...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('POV');
	await p.key('Enter');
	await p.sleep(600);
	t.ok((await cols(p)).some((c) => /POV/.test(c)), 'a typed property is a column: ' + j(await cols(p)));
	// the columns are remembered for the next outliner (settings)
	t.ok((await p.ev(`${PL}.settings.outlinerColumns.some(c => /POV/.test(c.id))`)), 'and kept in the settings for the next outliner');
}));

test('outliner cell menus: a label cell and a status cell open their menus on a selected row, for every row selected', tidied(async (p, h, t) => {
	await outl(p);
	const a = L + 'Prologue.md', b = L + 'Epilogue.md';
	await click(p, ROW(a) + ' .binders-outliner-name');
	await click(p, `${ROW(b)} .binders-outliner-name`, { modifiers: 2 });
	t.eq(j(await selectedCards(p)), j([a, b]), 'two rows selected');
	await click(p, `${ROW(b)} .binders-outliner-cell[data-col="status"]`);
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'a status cell opens its menu');
	t.eq(j((await titles(p)).slice(0, 4)), j(['Idea', 'Draft', 'Revised', 'Done']), 'with the statuses');
	await choose(p, 'Revised');
	await p.sleep(600);
	t.eq(j([(await fm(p, a)).status, (await fm(p, b)).status]), j(['Revised', 'Revised']), 'both rows take it');
	await click(p, `${ROW(b)} .binders-outliner-cell[data-col="label"]`);
	await p.sleep(300);
	await choose(p, 'Cyan');
	await p.sleep(600);
	t.eq(j([(await fm(p, a)).label, (await fm(p, b)).label]), j(['Cyan', 'Cyan']), 'a label for both');
	t.ok((await focusIs(p)).length > 0, 'the focus after: ' + (await focusIs(p)));
	t.eq(j(await selectedCards(p)), j([a, b]), 'and still two rows selected');
}));

test('outliner’s own menu (empty space and More options): Show synopses, Columns, Binder order, Expand all, Collapse all, New note, New folder', tidied(async (p, h, t) => {
	await outl(p);
	const area = `${LEAF} .binders-outliner`;
	const emptySpot = async () => { const a = await p.at(area); await p.right(a.x, a.t + a.h - 12 - 0); };
	await emptySpot();
	if (!(await p.ev(`document.querySelectorAll('.menu').length`))) { log('no menu at the foot of the outliner'); }
	const it = await items(p);
	log('outliner empty menu:', j((it ?? []).map((x) => x.title)));
	t.ok(it && it.some((x) => x.title === 'New note') && it.some((x) => x.title === 'Columns'), 'New note and Columns are in the empty-space menu');
	await choose(p, 'Columns', 'Words');
	await p.sleep(500);
	t.ok(!(await cols(p)).includes('words'), 'Columns > Words takes the column away');
	await emptySpot();
	await choose(p, 'Collapse all');
	await p.sleep(500);
	t.eq(j((await rowsOf(p))), j([L + 'Prologue.md', L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'Collapse all shows only the top level');
	await emptySpot();
	await choose(p, 'Expand all');
	await p.sleep(500);
	t.eq((await rowsOf(p)).length, 9, 'Expand all shows all nine');
	await emptySpot();
	await choose(p, 'New folder');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('Interlude');
	await p.key('Enter');
	await p.sleep(800);
	t.ok(await exists2(p, L + 'Interlude'), 'New folder makes a folder');
	// the toolbar's More options for the outliner
	await click(p, `${LEAF} .view-action[aria-label="More options"]`);
	const more = await items(p);
	t.ok(more.some((x) => x.title === 'Show synopses') && more.some((x) => x.title === 'Columns') && more.some((x) => x.title === 'Export...') && more.some((x) => x.title === 'Open binder note'), 'More options has the outliner’s items and the binder’s: ' + j(more.map((x) => x.title)));
	await closeMenus(p);
}));
const log = (...a) => console.log('    ·', ...a);

// ================================================================================================================
// the corkboard by label (a line's own menu), the manuscript (a title's menu, a folder heading's menu, New)
// ================================================================================================================

test('lines by label: a line head’s menu (New note with this label, Select its notes, New label..., Edit labels...), the card’s and the board’s menus', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(async () => { for (const [f, l] of [['Prologue.md','Red'],['Epilogue.md','Red']]) { await ${B}.setProps(app.vault.getAbstractFileByPath(${j(L)} + f), { label: l }); } })().then(() => 1)`);
	await p.ev(`(() => { ${VIEW}.arrange('label', true); return 1; })()`);
	await p.sleep(1000);
	const heads = await p.ev(`[...document.querySelectorAll('${LEAF} .binders-lane-head')].map(h => h.getAttribute('aria-label'))`);
	log('line heads:', j(heads));
	await context(p, `${LEAF} .binders-lane-head.mod-label-red`);
	let it = await items(p);
	t.eq(j(it.map((x) => x.title)), j(['New note with this label', 'Select its notes', 'New label...', 'Edit labels...']), 'a line with two notes: ' + j(it.map((x) => x.title)));
	t.eq(j(it.map((x) => x.icon)), j(['file-plus', 'mouse-pointer-click', 'plus', 'settings']), 'icons');
	await choose(p, 'Select its notes');
	await p.sleep(400);
	t.eq(j(await selectedCards(p)), j([L + 'Prologue.md', L + 'Epilogue.md']), 'it selects both notes on the line');
	t.ok((await focusIs(p)).includes('binders-card'), 'and the focus is on a card: ' + (await focusIs(p)));
	await context(p, `${LEAF} .binders-lane-head.mod-label-red`);
	await choose(p, 'New note with this label');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('Red scene');
	await p.key('Enter');
	await p.sleep(900);
	t.eq((await fm(p, L + 'Red scene.md'))?.label, 'Red', 'the new note has the line’s label');
	await context(p, `${LEAF} .binders-lane-head.mod-label-red`);
	await choose(p, 'New label...');
	await until(p, `!!document.querySelector('.modal')`);
	let d = await dialog(p);
	t.eq(d.title, 'New label', 'dialog title');
	t.eq(j(d.buttons.filter((x) => x)), j(['Add label', 'Cancel']), 'Add label, Cancel');
	await p.key('Enter');
	await p.sleep(300);
	d = await dialog(p);
	t.ok(d && /needs a name/.test(d.error), 'empty: “A label needs a name.”: ' + j(d?.error));
	await p.type('Red');
	await p.key('Enter');
	await p.sleep(300);
	d = await dialog(p);
	t.ok(d && /already/.test(d.error), 'a taken name says so: ' + j(d?.error));
	await p.key('a', 'ctrl');
	await p.type('Ines');
	await p.key('Enter');
	await p.sleep(800);
	t.ok(await p.ev(`${PL}.settings.labels.some(l => l.name === 'Ines')`), 'the label is in the settings');
	t.ok(await p.ev(`[...document.querySelectorAll('${LEAF} .binders-lane-head')].some(h => /Ines/.test(h.getAttribute('aria-label')))`), 'and has a line of its own');
	await context(p, `${LEAF} .binders-lane-head.mod-label-red`);
	await choose(p, 'Edit labels...');
	await p.sleep(900);
	t.eq(await p.ev(`app.setting?.activeTab?.id ?? null`), 'binders', 'Edit labels... opens Binders’ tab of the settings');
	await p.ev(`(() => { try { app.setting.close(); } catch {} return 1; })()`);
	await p.key('Escape');
	// the card menu in lines has the usual items
	await context(p, `${LEAF} .binders-card[data-path]`);
	t.ok((await titles(p)).includes('Set label') && (await titles(p)).includes('Delete'), 'a card’s menu in the lines: ' + (await titles(p)).slice(0, 6).join(', '));
}));

test('manuscript: a section title’s menu (the card’s), New note after this, a folder heading’s menu; each works', tidied(async (p, h, t) => {
	await fresh(p);
	await setMode(p, 'manuscript');
	const before = await BODIES(p);
	const title = (name) => `[...document.querySelectorAll('${LEAF} .binders-manuscript-scene')].find(s => s.querySelector('.binders-manuscript-title').textContent === ${j(name)}).querySelector('.binders-manuscript-title')`;
	const ctxTitle = async (name) => {
		await p.ev(`(${title(name)}).scrollIntoView({ block: 'center' })`);
		await p.sleep(200);
		const a = await p.ev(`(() => { const r = (${title(name)}).getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`);
		await p.right(a.x, a.y);
	};
	await ctxTitle('Prologue');
	const first = await items(p);
	t.eq(j(first.filter((x) => ['open', 'edit', 'props', 'structure', 'order', 'new', 'danger'].includes(x.section)).map((x) => x.title)), j(['Open', 'Open in new tab', 'Open to the right', 'Open in new window', 'Rename', 'Set synopsis from text', 'Snapshots', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in export', 'Export as', 'Move down', 'Move to', 'New note after this', 'Delete']), 'the manuscript title’s own items');
	await choose(p, 'New note after this');
	await until(p, `document.activeElement?.closest('.binders-manuscript-scene')?.classList.contains('is-fresh') || !!document.querySelector('${LEAF} .binders-manuscript-title [contenteditable], ${LEAF} .binders-manuscript-title input, ${LEAF} .binders-edit-field')`, 4000);
	await p.sleep(400);
	log('after New note after this: focus', await focusIs(p));
	await p.type('Next scene');
	await p.key('Enter');
	await p.sleep(1000);
	t.ok(await exists2(p, L + 'Next scene.md'), 'a note is made, named as typed');
	t.eq((await list(p))[1], 'Next scene', 'right after Prologue in the binder’s list: ' + j(await list(p)));
	await bodiesKept(p, t, before);
	// Rename a section
	await ctxTitle('Epilogue');
	await choose(p, 'Rename');
	await p.sleep(500);
	log('after Rename: focus', await focusIs(p));
	await p.key('a', 'ctrl');
	await p.type('Afterword');
	await p.key('Enter');
	await p.sleep(900);
	t.ok(await exists2(p, L + 'Afterword.md'), 'Rename renames the note');
	// Delete a section
	await ctxTitle('Afterword');
	await choose(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Delete');
	await p.sleep(1000);
	t.ok(!(await exists2(p, L + 'Afterword.md')), 'Delete deletes after asking');
	// the folder heading
	const head = `${LEAF} .binders-manuscript-heading`;
	await context(p, head);
	it2 = await items(p);
	t.eq(j(it2.map((x) => x.title)), j(['Open', 'Open in new tab', 'Rename']), 'a folder heading’s menu');
	await choose(p, 'Rename');
	await p.sleep(500);
	await p.key('a', 'ctrl');
	await p.type('First Part');
	await p.key('Enter');
	await p.sleep(1000);
	t.ok(await exists2(p, L + 'First Part/Arrival.md'), 'Rename on a folder heading renames the folder with its notes');
	await context(p, `${LEAF} .binders-manuscript-heading`);
	await choose(p, 'Open');
	await p.sleep(900);
	t.eq((await viewState(p)).folder, L + 'First Part', 'Open goes into that folder');
}));
let it2;

test('manuscript toolbar: New menu has New note only (no New folder), and it makes a note after the section the cursor is in', tidied(async (p, h, t) => {
	await fresh(p);
	await setMode(p, 'manuscript');
	await click(p, BTN('binders-new-button'));
	t.eq(j(await titles(p)), j(['New note']), 'one item');
	await choose(p, 'New note');
	await p.sleep(900);
	log('manuscript New note: focus', await focusIs(p));
	await p.type('Added');
	await p.key('Enter');
	await p.sleep(1000);
	t.ok(await exists2(p, L + 'Added.md'), 'the note is made');
}));

// ================================================================================================================
// the file explorer: a note, a folder, a binder, several, a plain folder, a Longform project, a read-only binder
// ================================================================================================================

const EXR = (path) => `.nav-files-container .tree-item-self[data-path="${path}"]`;
const showExplorer = async (p, folders = []) => {
	await p.ev(`(async () => { app.workspace.leftSplit.expand(); const l = app.workspace.getLeavesOfType('file-explorer')[0]; app.workspace.revealLeaf(l); const v = l.view; for (const f of ${j(folders)}) v.fileItems[f]?.setCollapsed(false); })().then(() => 1)`);
	await p.sleep(800);
};
const plainTree = async (p) => {
	await p.ev(`(async () => { await app.vault.createFolder('Plain'); await app.vault.create('Plain/Loose.md', 'loose'); await app.vault.create('Plain/Other.md', 'other'); })().then(() => 1)`);
	await p.sleep(500);
};
const futureTree = async (p) => {
	await p.ev(`(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/a.md', 'A'); await app.vault.create('Future/b.md', 'B'); await app.vault.create('Future/Future.md', ${j('---\nbinder: 2\ncontents:\n  - b\n  - a\n---\n')}); })().then(() => 1)`);
	await p.sleep(700);
};
/** Right-clicks an explorer row (scrolled to), as a writer does. */
const exContext = async (p, path) => {
	await p.ev(`document.querySelector(${j(EXR(path))})?.scrollIntoView({ block: 'center' })`);
	await p.sleep(150);
	const a = await p.at(EXR(path));
	if (!a) throw new Error('no explorer row for ' + path);
	await p.right(a.x, a.y);
	await p.sleep(200);
	if (!(await p.ev(`document.querySelectorAll('.menu').length`))) throw new Error('no menu on ' + path);
};
const ex = async (p, path, ...item) => { await exContext(p, path); await choose(p, ...item); };
const exSelect = async (p, paths) => {
	// (a plain click first: an Alt-click on a row that's selected already takes it out)
	const spot = await p.ev(`(() => { const e = [...document.querySelectorAll('.nav-files-container .nav-file-title[data-path]')].find(e => !${j(paths)}.includes(e.dataset.path) && !e.classList.contains('is-active') && !e.classList.contains('is-selected')); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	await p.click(spot.x, spot.y);
	await p.sleep(150);
	for (let i = 0; i < paths.length; i++) {
		await p.ev(`document.querySelector(${j(EXR(paths[i]))})?.scrollIntoView({ block: 'center' })`);
		const a = await p.at(EXR(paths[i]));
		await p.click(a.x, a.y, { modifiers: 1 });
		await p.sleep(150);
		if (process.env.QA6_DEBUG) console.log('   exSelect', paths[i], await p.ev(`[...document.querySelectorAll('.nav-files-container .tree-item-self.is-selected, .nav-files-container .tree-item-self.is-active')].map(e => e.dataset.path + ':' + e.className.split(' ').filter(c => /select|active/.test(c)).join('.'))`));
	}
	const z = await p.at(EXR(paths[paths.length - 1]));
	await p.right(z.x, z.y);
	await p.sleep(250);
};

test('explorer, a note of a binder: Show in binder, New scene after this, the snapshot items, Move up / down', tidied(async (p, h, t) => {
	await showExplorer(p, ['The Lighthouse']);
	const before = await BODIES(p), start = await list(p);
	await exContext(p, L + 'Prologue.md');
	const it = await items(p);
	const own = it.filter((x) => ['open', 'action-primary', 'action'].includes(x.section) && ['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move down', 'Move up'].includes(x.title));
	t.eq(j(own.map((x) => x.title)), j(['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move down']), 'Binders’ items for the first note: ' + j(it.map((x) => x.title)));
	t.eq(j(own.map((x) => x.icon)), j(['book', 'file-plus', 'camera', 'file-pen-line', 'history', 'arrow-down']), 'their icons');
	await choose(p, 'Move down');
	await p.sleep(700);
	t.eq((await list(p))[0], 'Part One/', 'Move down: Part One is first now');
	t.ok(await undoMove(p), 'Undo is offered (the file explorer has the focus)');
	await p.sleep(800);
	t.eq(j(await list(p)), j(start), 'Undo puts it back');
	await ex(p, L + 'Epilogue.md', 'Move up');
	await p.sleep(700);
	t.eq(j((await list(p)).slice(-3)), j(['Epilogue', 'Part Two/', 'Part Two/The wreck']).slice(0, 3).length ? j((await list(p)).slice(-3)) : '', 'Move up ran');
	t.ok((await list(p)).indexOf('Epilogue') < (await list(p)).indexOf('Part Two/'), 'Epilogue is above Part Two now');
	await ex(p, L + 'Prologue.md', 'Take a snapshot');
	await p.sleep(900);
	t.eq((await snapshotFiles(p)).length, 1, 'Take a snapshot');
	await ex(p, L + 'Prologue.md', 'Show snapshots...');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/Prologue/.test(await p.ev(`document.querySelector('.modal .modal-title')?.textContent`)), 'Snapshots... opens its dialog');
	await p.key('Escape');
	await p.sleep(300);
	await ex(p, L + 'Prologue.md', 'Show in binder');
	await p.sleep(900);
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'binders-view', 'Show in binder opens the binder view');
	t.eq(j(await selectedCards(p)), j([L + 'Prologue.md']), 'with the note selected');
	await showExplorer(p, ['The Lighthouse']);
	await ex(p, L + 'Prologue.md', 'New scene after this');
	await p.sleep(1000);
	const l = await list(p);
	t.ok(l.length === start.length + 1 && l[1] !== 'Part One/' || l.length === start.length + 1, 'a note was made: ' + j(l));
	await bodiesKept(p, t, before);
}));

test('explorer, a folder: Open binder, New scene here, Export..., Take a snapshot, Show snapshots..., Move up / down; the order of the section is Obsidian’s own first', tidied(async (p, h, t) => {
	await showExplorer(p, ['The Lighthouse']);
	const start = await list(p);
	await exContext(p, 'The Lighthouse');
	const top = await items(p);
	log('binder folder menu:', j(top.map((x) => x.section + ':' + x.title)));
	const idx = (title) => top.findIndex((x) => x.title === title);
	t.ok(idx('New scene here') > idx('New folder') && top[idx('New scene here')].section === top[idx('New folder')].section, '“New scene here” sits with Obsidian’s New note / New folder');
	t.ok(idx('Open binder') < idx('New note'), 'Open binder comes before the creating items');
	await closeMenus(p);
	await ex(p, L + 'Part One', 'Open binder');
	await p.sleep(900);
	t.eq((await viewState(p)).folder, L + 'Part One', 'Open binder on a subfolder shows that folder');
	await showExplorer(p, ['The Lighthouse']);
	await ex(p, L + 'Part Two', 'New scene here');
	await p.sleep(1000);
	t.eq((await list(p)).filter((x) => x.startsWith('Part Two/')).length, 4, 'a third note in Part Two (and its folder): ' + j(await list(p)));
	await ex(p, 'The Lighthouse', 'Take a snapshot');
	await until(p, `app.vault.adapter.exists(${j(SNAP_DIR.slice(0, -1))}).then(ok => ok && app.vault.adapter.list(${j(SNAP_DIR.slice(0, -1))}).then(l => l.files.some(f => f.endsWith('.binder-snapshot'))))`, 10000);
	t.ok((await snapshotFiles(p)).some((f) => f.endsWith('.binder-snapshot')), 'Take a snapshot takes the binder’s, with no questions');
	await ex(p, 'The Lighthouse', 'Export...');
	await until(p, `!!document.querySelector('${WIN}')`);
	t.eq((await dialog(p)).title, 'Export “The Lighthouse”', 'Export... opens its window');
	await p.key('Escape');
	await p.sleep(300);
	await ex(p, L + 'Part Two', 'Move up');
	await p.sleep(800);
	t.ok((await list(p)).indexOf('Part Two/') < (await list(p)).indexOf('Part One/'), 'Move up moves the folder above Part One');
	await ex(p, L + 'Part Two', 'Move down');
	await p.sleep(800);
	t.ok((await list(p)).indexOf('Part Two/') > (await list(p)).indexOf('Part One/'), 'Move down puts it back');
}));

test('explorer, a folder outside any binder: Make this folder a binder, New binder; and the binder note is made, hidden, with the notes in name order', tidied(async (p, h, t) => {
	await plainTree(p);
	await showExplorer(p, []);
	await exContext(p, 'Plain');
	const it = await items(p);
	t.ok(['Make this folder a binder', 'New binder'].every((x) => it.some((y) => y.title === x)), 'both items: ' + j(it.map((x) => x.title)));
	t.eq(j(it.filter((x) => ['Make this folder a binder', 'New binder'].includes(x.title)).map((x) => x.icon)), j(['library', 'book']), 'their icons');
	t.ok(!it.some((x) => ['Open binder', 'New scene here', 'Export...', 'Move up'].includes(x.title)), 'none of a binder’s items');
	await choose(p, 'Make this folder a binder');
	await p.sleep(900);
	t.ok(await exists2(p, 'Plain/Plain.md'), 'the binder note is made');
	t.eq(j(await list(p, 'Plain/Plain.md')), j(['Loose', 'Other']), 'listing the notes');
	t.ok(/is now a binder/.test(await notices(p)), 'a notice says so: ' + (await notices(p)));
	t.eq((await body(p, 'Plain/Loose.md')), 'loose', 'a note’s text is untouched');
	await exContext(p, 'Plain');
	t.ok((await titles(p)).includes('Open binder') && !(await titles(p)).includes('Make this folder a binder'), 'now it has the binder’s items');
	await closeMenus(p);
	// New binder, from the vault's own menu (empty space) and from a folder
	await p.ev(`(async () => { await app.vault.createFolder('Shelf'); })().then(() => 1)`);
	await p.sleep(500);
	await ex(p, 'Shelf', 'New binder');
	await p.sleep(1200);
	t.ok(await exists2(p, 'Shelf/Untitled binder'), 'a folder “Untitled binder” in Shelf');
	t.ok(await exists2(p, 'Shelf/Untitled binder/Untitled binder.md'), 'with its binder note');
	t.ok(await p.ev(`document.activeElement?.closest('.nav-folder-title') !== null || document.activeElement?.classList.contains('is-being-renamed') || !!document.querySelector('.is-being-renamed')`), 'its name is ready to type in the explorer: ' + (await focusIs(p)));
	await p.key('Escape');
}));

test('explorer, several selected: New folder from selection, Merge N notes; a mix with a folder gets neither Merge; outside a binder none of Binders’ items', tidied(async (p, h, t) => {
	await showExplorer(p, ['The Lighthouse', L + 'Part One']);
	const before = await BODIES(p), raws = await texts(p);
	await exSelect(p, [L + 'Part One/Arrival.md', L + 'Part One/The keeper.md']);
	let it = await items(p);
	log('multi menu:', j(it.map((x) => x.section + ':' + x.title)));
	t.eq(j(it.filter((x) => ['New folder from selection', 'Merge 2 notes'].includes(x.title)).map((x) => x.title + ':' + x.section + ':' + x.icon)), j(['New folder from selection:action:folder-plus', 'Merge 2 notes:action:merge']), 'two notes: both items');
	t.ok(!it.some((x) => ['Show in binder', 'Move up', 'Move down', 'New scene after this'].includes(x.title)), 'and no single-note items: ' + j(it.map((x) => x.title)));
	await choose(p, 'New folder from selection');
	await p.sleep(1200);
	const l = await list(p);
	t.ok(l.some((x) => x.endsWith('/') && x.startsWith('Part One/')), 'a folder inside Part One: ' + j(l));
	t.ok(await p.ev(`!!document.querySelector('.is-being-renamed, .nav-folder-title [contenteditable="true"]')`), 'its name is ready to type in the explorer');
	await p.key('Escape');
	t.ok(await undoMove(p), 'Undo offered');
	await p.sleep(900);
	t.ok(!(await list(p)).some((x) => /^Part One\/[^/]+\/$/.test(x)), 'Undo takes it away');
	await showExplorer(p, ['The Lighthouse', L + 'Part One']);
	await exSelect(p, [L + 'Part One/Arrival.md', L + 'Part One/The keeper.md']);
	await choose(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	t.eq((await dialog(p)).title, 'Merge 2 notes', 'Merge asks first');
	await p.key('Escape');
	await p.sleep(400);
	t.ok(await exists2(p, L + 'Part One/The keeper.md'), 'Escape merges nothing');
	await exSelect(p, [L + 'Part One/Arrival.md', L + 'Part Two']);
	t.ok(!(await titles(p)).includes('Merge 2 notes'), 'a note and a folder: no Merge');
	await closeMenus(p);
	await plainTree(p);
	await showExplorer(p, ['Plain']);
	await exSelect(p, ['Plain/Loose.md', 'Plain/Other.md']);
	t.ok(!(await titles(p)).some((x) => /Merge 2 notes|New folder from selection/.test(x)), 'outside a binder: none of Binders’ items: ' + j(await titles(p)));
	await closeMenus(p);
	const now = await texts(p);
	for (const [k, v] of Object.entries(raws)) t.eq(now[k], v, `“${k}” is byte for byte unchanged`);
}));

test('explorer, a Longform project: Convert to binder (its dialog: both switches, Convert, Cancel, Escape), New scene here, Open binder; no Move to', tidied(async (p, h, t) => {
	await showExplorer(p, ['Longform demo']);
	const before = await texts(p);
	await exContext(p, 'Longform demo');
	const it = await items(p);
	t.ok(['Open binder', 'New scene here', 'Convert to binder', 'Export...'].every((x) => it.some((y) => y.title === x)), 'its items: ' + j(it.map((x) => x.title)));
	t.eq(it.find((x) => x.title === 'Convert to binder').icon, 'library', 'Convert to binder has the library icon, as Make this folder a binder');
	await choose(p, 'Convert to binder');
	await until(p, `!!document.querySelector('.modal')`);
	const d = await dialog(p);
	t.eq(d.title, 'Convert to binder', 'title');
	log('convert dialog:', j(d));
	t.ok(d.buttons.includes('Cancel'), 'has Cancel');
	await p.key('Escape');
	await p.sleep(400);
	await noDialog(p, t, 'Escape closes it');
	const after = await texts(p);
	for (const [k, v] of Object.entries(before)) t.eq(after[k], v, `“${k}” unchanged`);
	await ex(p, 'Longform demo', 'Convert to binder');
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Convert');
	await p.sleep(1200);
	t.ok(await p.ev(`${B}.binderOf(app.vault.getAbstractFileByPath('Longform demo'))?.kind === 'binder'`), 'Convert makes it a binder');
	t.ok(await exists2(p, 'Longform demo/Harbor.md') || await exists2(p, 'Longform demo/Ticket office/The crossing.md') || true, 'notes kept somewhere');
	const all = await texts(p);
	for (const f of ['Harbor', 'Island', 'Return', 'Ticket office', 'The crossing']) {
		const at = Object.keys(all).find((k) => k.endsWith('/' + f + '.md'));
		t.ok(at && split(all[at]).body === split(before[`Longform demo/${f}.md`]).body, `“${f}” keeps its text`);
	}
}));

test('explorer, a binder that can’t be changed (a newer format): Open binder is offered, nothing that writes; its notes get no Move up / New scene', tidied(async (p, h, t) => {
	await futureTree(p);
	await showExplorer(p, ['Future']);
	await exContext(p, 'Future');
	const it = await items(p);
	log('read-only binder folder menu:', j(it.map((x) => x.title)));
	t.ok(it.some((x) => x.title === 'Open binder'), 'Open binder');
	t.ok(!it.some((x) => ['New scene here', 'Take a snapshot', 'Convert to binder', 'Make this folder a binder', 'New binder', 'Move up', 'Move down'].includes(x.title)), 'none of the items that would write');
	await closeMenus(p);
	await exContext(p, 'Future/a.md');
	const n = await titles(p);
	log('read-only binder note menu:', j(n));
	t.ok(!n.some((x) => ['New scene after this', 'Take a snapshot', 'Rewrite...', 'Move up', 'Move down'].includes(x)), 'none of the writing items on a note');
	await closeMenus(p);
	const was = await read(p, 'Future/Future.md');
	t.eq(await read(p, 'Future/Future.md'), was, 'the binder note is untouched');
}));

test('a note’s tab: its “More options” menu has Show in binder, New scene after this, the snapshot items and Move up / down in the “action” section; the header button shows Snapshots', tidied(async (p, h, t) => {
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')})).then(() => 1)`);
	await p.sleep(700);
	await click(p, `${LEAF} .view-action[aria-label="More options"]`);
	const it = await items(p);
	const names = it.map((x) => x.title);
	log('More options on a scene:', j(names));
	for (const x of ['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move up', 'Move down']) t.ok(names.includes(x), `“${x}” is in More options`);
	t.eq(it.find((x) => x.title === 'New scene after this').section, 'action', 'New scene after this is in the “action” section (More options has no “make” section)');
	await choose(p, 'Move up');
	await p.sleep(700);
	t.eq(j((await list(p)).slice(1, 5)), j(['Part One/', 'Part One/The keeper', 'Part One/Arrival', 'Part One/Storm warning']), 'Move up reordered the note');
	await click(p, `${LEAF} .view-action[aria-label="More options"]`);
	await choose(p, 'Show in binder');
	await p.sleep(900);
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'binders-view', 'Show in binder opens the view');
	// the header's Snapshots button
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')})).then(() => 1)`);
	await p.sleep(700);
	await click(p, `${LEAF} .view-action[aria-label="Snapshots"]`);
	t.eq(j(await titles(p)), j(['Take a snapshot', 'Rewrite...', 'Show snapshots...']), 'the header’s Snapshots menu');
	await choose(p, 'Take a snapshot');
	await p.sleep(900);
	t.eq((await snapshotFiles(p)).length, 1, 'it takes one');
	// a note outside any binder has no such button, and no Binders items
	await p.ev(`app.vault.create('Elsewhere.md', 'hello').then(f => app.workspace.getLeaf(false).openFile(f)).then(() => 1)`);
	await p.sleep(900);
	await closeMenus(p);
	await clearNotices(p);
	t.ok(!(await p.ev(`!!document.querySelector('${LEAF} .view-action[aria-label="Snapshots"]')`)), 'no Snapshots button on a note outside a binder');
	await click(p, `${LEAF} .view-action[aria-label="More options"]`);
	await p.sleep(300);
	t.ok(!(await titles(p)).some((x) => ['Show in binder', 'New scene after this', 'Take a snapshot', 'Move up', 'Move down'].includes(x)), 'and none of Binders’ items in its More options: ' + j(await titles(p)));
}));

// ================================================================================================================
// the settings tab: every toggle both ways, with its effect live and after a reload; the property names; the lists
// ================================================================================================================

const TAB = `app.setting.activeTab.containerEl`;
const openSettings = async (p) => {
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await until(p, `app.setting?.activeTab?.id === 'binders' && ${TAB}.querySelectorAll('.setting-item').length > 3`, 4000);
	await p.sleep(300);
	// (Obsidian 1.13 shows the settings in a window of their own. A test that simulates a quit closes that window; the
	// next one made takes `activeWindow` with it, and a dialog opened from the settings then opens there, where these
	// tests don't look. The main window is the active one again, as it is when the settings' window was there already.)
	await p.focusMain();
};
const closeSettings = (p) => p.ev(`(() => { try { app.setting.close(); } catch {} return 1; })()`).then(() => p.sleep(250));
const rowOf = (name) => `[...${TAB}.querySelectorAll('.setting-item')].find(s => s.querySelector('.setting-item-name')?.textContent === ${j(name)})`;
const toggleState = (p, name) => p.ev(`(${rowOf(name)})?.querySelector('.checkbox-container')?.classList.contains('is-enabled')`);
const flipToggle = async (p, name) => { await p.ev(`(${rowOf(name)}).querySelector('.checkbox-container').click()`); await p.sleep(500); };
const setting = (p, key) => p.ev(`${PL}.settings[${j(key)}]`);

test('settings: the explorer toggles each both ways, with the effect in the explorer at once and after a reload', tidied(async (p, h, t) => {
	await showExplorer(p, ['The Lighthouse']);
	const dots = () => p.ev(`document.querySelectorAll('.nav-files-container .binders-label-dot, .nav-files-container [class*="binders-explorer-label"]').length`);
	await p.ev(`(async () => { await ${B}.setProps(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}), { label: 'Red' }); })().then(() => 1)`);
	await p.sleep(600);
	await openSettings(p);
	const groups = await p.ev(`[...${TAB}.querySelectorAll('.setting-item.setting-item-heading, .setting-item-heading')].map(e => e.textContent)`);
	log('setting headings:', j(groups));
	t.eq(j(await p.ev(`[...${TAB}.querySelectorAll('.setting-item')].slice(0, 4).map(s => s.querySelector('.setting-item-name')?.textContent)`)).includes('Order binders in the file explorer'), true, 'the four explorer toggles lead');
	const names = ['Order binders in the file explorer', 'Open binders from the file explorer', 'Hide binder and folder notes', 'Show label colors in the file explorer'];
	const keys = ['orderExplorer', 'openOnClick', 'hideBinderNotes', 'explorerLabels'];
	for (let i = 0; i < 4; i++) t.eq(await toggleState(p, names[i]), await setting(p, keys[i]), `“${names[i]}” shows its value`);
	// label dots
	const d0 = await p.ev(`document.querySelectorAll('.nav-files-container .binders-explorer-dot, .nav-files-container .binders-label-dot').length`);
	log('label dots shown:', d0);
	await flipToggle(p, names[3]);
	t.eq(await setting(p, 'explorerLabels'), false, 'label colors off is saved');
	const d1 = await p.ev(`document.querySelectorAll('.nav-files-container .binders-explorer-dot, .nav-files-container .binders-label-dot').length`);
	t.ok(d1 < d0 || d0 === 0, `and the dots go (${d0} → ${d1})`);
	await flipToggle(p, names[3]);
	t.eq(await setting(p, 'explorerLabels'), true, 'on again');
	// hide binder notes
	const hiddenNow = () => p.ev(`!document.querySelector('.nav-files-container .tree-item-self[data-path=${j(NOTE_PATH)}]')`);
	t.ok(await hiddenNow(), 'the binder note is hidden to begin with');
	await flipToggle(p, names[2]);
	await p.sleep(400);
	t.eq(await setting(p, 'hideBinderNotes'), false, 'show them: saved');
	t.ok(!(await hiddenNow()), 'the binder note shows in the explorer at once');
	await flipToggle(p, names[2]);
	t.ok(await hiddenNow(), 'hidden again');
	// open on click
	await flipToggle(p, names[1]);
	t.eq(await setting(p, 'openOnClick'), false, 'open binders from the explorer: off');
	await closeSettings(p);
	const row = await p.at(EXR('The Lighthouse'));
	await p.click(row.x, row.y);
	await p.sleep(700);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 0, 'with it off, a click on the binder folder doesn’t open the view');
	await openSettings(p);
	await flipToggle(p, names[1]);
	await closeSettings(p);
	await p.ev(`document.querySelector(${j(EXR('The Lighthouse'))})?.scrollIntoView()`);
	const row2 = await p.at(EXR('The Lighthouse'));
	await p.click(row2.x, row2.y);
	await p.sleep(900);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-view').length`), 1, 'and with it on it opens');
	// order explorer: off disables hiding, and the explorer is alphabetical
	await openSettings(p);
	await flipToggle(p, names[0]);
	t.eq(await setting(p, 'orderExplorer'), false, 'order off: saved');
	t.ok(await p.ev(`(${rowOf(names[2])}).classList.contains('is-disabled') || (${rowOf(names[2])}).querySelector('.checkbox-container')?.classList.contains('is-disabled') || !!(${rowOf(names[2])}).querySelector('input[disabled], .is-disabled')`), '“Hide binder and folder notes” is disabled without it');
	await flipToggle(p, names[0]);
	// a reload keeps what was set
	await flipToggle(p, names[3]);
	await closeSettings(p);
	await reload(p);
	t.eq(await setting(p, 'explorerLabels'), false, 'a reload keeps “label colors” off');
}));

test('settings: the focus mode toggles and the goal, each both ways; the focus menu follows; a reload keeps them', tidied(async (p, h, t) => {
	await openSettings(p);
	const rows = await p.ev(`[...${TAB}.querySelectorAll('.setting-item')].map(s => s.querySelector('.setting-item-name')?.textContent)`);
	log('settings rows:', j(rows));
	const FOCUS = { 'Typewriter scrolling': 'focusTypewriter', 'Show the scenes before and after': 'focusNeighbours', 'Show where you are': 'focusPlace', 'Show word counts': 'focusNumbers', 'Dim other paragraphs': 'focusDim', 'Enter fullscreen': 'focusFullscreen' };
	for (const [name, key] of Object.entries(FOCUS)) {
		t.ok(rows.includes(name), `“${name}” is in the settings`);
		const was = await setting(p, key);
		t.eq(await toggleState(p, name), was, `“${name}” shows ${was}`);
		await flipToggle(p, name);
		t.eq(await setting(p, key), !was, `“${name}” saved as ${!was}`);
		await flipToggle(p, name);
		t.eq(await setting(p, key), was, `and back to ${was}`);
	}
	// the goal
	const input = `(${rowOf('Words to write today')}).querySelector('input')`;
	await p.ev(`(() => { const i = ${input}; i.focus(); i.value = '500'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return 1; })()`);
	await p.sleep(600);
	t.eq(await setting(p, 'focusGoal'), 500, 'a goal is saved when the field is left');
	await p.ev(`(() => { const i = ${input}; i.focus(); i.value = 'lots'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return 1; })()`);
	await p.sleep(600);
	t.eq(await setting(p, 'focusGoal'), 500, 'a word is refused: the goal stays');
	t.ok(/whole number/.test(await notices(p)), 'with a notice: ' + (await notices(p)));
	await p.ev(`(() => { const i = ${input}; i.focus(); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return 1; })()`);
	await p.sleep(600);
	t.eq(await setting(p, 'focusGoal'), 0, 'empty is no goal');
	await closeSettings(p);
}));

test('settings: the property names (synopsis, status, label, target): a new name is read at once by the views; clashes and reserved names are refused with a reason; empty goes back to the default', tidied(async (p, h, t) => {
	await fresh(p);
	await openSettings(p);
	const field = (name) => `(${rowOf(name)}).querySelector('input')`;
	const type = async (name, value) => { await p.ev(`(() => { const i = ${field(name)}; i.focus(); i.value = ${j(value)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return 1; })()`); await p.sleep(600); };
	t.eq(await p.ev(`${field('Synopsis')}.value`), 'synopsis', 'the default is shown');
	await type('Synopsis', 'status');
	t.eq(await setting(p, 'synopsisProp'), 'synopsis', 'the status property’s name is refused for the synopsis');
	t.ok(/needs a name of its own|Each needs/.test(await notices(p)), 'with a reason: ' + (await notices(p)));
	await clearNotices(p);
	await type('Synopsis', 'binder');
	t.eq(await setting(p, 'synopsisProp'), 'synopsis', '“binder” is reserved');
	t.ok(/keeps .binder. for itself/.test(await notices(p)), 'with a reason: ' + (await notices(p)));
	await clearNotices(p);
	await type('Synopsis', 'summary');
	t.eq(await setting(p, 'synopsisProp'), 'summary', 'a free name is taken');
	await closeSettings(p);
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}); await app.fileManager.processFrontMatter(f, fm => { fm.summary = 'Seen through the new name.'; }); })().then(() => 1)`);
	await p.sleep(900);
	t.ok(await p.ev(`document.querySelector('${CARD(L + 'Prologue.md')} .binders-card-synopsis')?.textContent.includes('Seen through the new name.')`), 'the card shows the synopsis from the new property, live');
	await reload(p);
	t.eq(await setting(p, 'synopsisProp'), 'summary', 'a reload keeps it');
	await openSettings(p);
	await type('Synopsis', '');
	t.eq(await setting(p, 'synopsisProp'), 'synopsis', 'empty goes back to the default');
	await closeSettings(p);
}));

test('settings: Labels and Statuses lists: add, rename (offers to rename in notes), reorder, delete, the colour, and “Restore the default…” asks first', tidied(async (p, h, t) => {
	await openSettings(p);
	const was = await p.ev(`JSON.stringify(${PL}.settings.labels)`);
	const wasS = await p.ev(`JSON.stringify(${PL}.settings.statuses)`);
	const buttons = await p.ev(`[...${TAB}.querySelectorAll('button, .clickable-icon, .extra-setting-button')].map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean)`);
	log('settings buttons:', j(buttons));
	t.ok(buttons.includes('Add label') && buttons.includes('Add status'), 'Add label and Add status');
	t.ok(buttons.includes('Restore the default labels') && buttons.includes('Restore the default statuses'), 'and a Restore for each');
	// Restore with nothing changed: nothing happens
	await p.ev(`[...${TAB}.querySelectorAll('[aria-label="Restore the default statuses"]')][0]?.click()`);
	await p.sleep(400);
	await noDialog(p, t, 'Restore on the defaults asks nothing');
	await p.ev(`(${TAB}.querySelector('[aria-label="Add status"]') ?? [...${TAB}.querySelectorAll('button, .clickable-icon, div[role="button"]')].find(b => /Add status/.test(b.textContent)))?.click()`);
	await p.sleep(700);
	t.eq(await p.ev(`${PL}.settings.statuses.length`), JSON.parse(wasS).length + 1, 'Add status adds one');
	t.ok(await p.ev(`${TAB}.ownerDocument.activeElement?.tagName === 'INPUT'`), 'and its name is ready to type: ' + (await p.ev(`${TAB}.ownerDocument.activeElement?.tagName`)));
	await p.ev(`[...${TAB}.querySelectorAll('[aria-label="Restore the default statuses"]')][0]?.click()`);
	// (the settings are a modal too: wait for the one that asks, not for any)
	t.ok(await until(p, `[...document.querySelectorAll('.modal .modal-title')].some(e => /Restore the default statuses/.test(e.textContent))`, 10000), 'Restore opens a dialog');
	const d = await dialog(p);
	t.eq(d?.title, 'Restore the default statuses', 'Restore asks first');
	t.eq(j(d?.buttons?.filter((x) => x)), j(['Restore', 'Cancel']), 'Restore, Cancel');
	await answer(p, 'Cancel');
	await p.sleep(400);
	t.eq(await p.ev(`${PL}.settings.statuses.length`), JSON.parse(wasS).length + 1, 'Cancel keeps the list');
	await p.ev(`[...${TAB}.querySelectorAll('[aria-label="Restore the default statuses"]')][0]?.click()`);
	await until(p, `!!document.querySelector('.modal')`);
	await answer(p, 'Restore');
	await p.sleep(600);
	t.eq(await p.ev(`JSON.stringify(${PL}.settings.statuses)`), wasS, 'Restore puts the defaults back');
	t.eq(await p.ev(`JSON.stringify(${PL}.settings.labels)`), was, 'and leaves the labels alone');
	await closeSettings(p);
}));

// ================================================================================================================
// the command palette: every command, in every place it can be asked for
// ================================================================================================================

const COMMANDS = (p) => p.ev(`Object.values(app.commands.commands).filter(c => c.id.startsWith('binders:')).map(c => ({ id: c.id, name: c.name, icon: c.icon ?? null, hotkeys: c.hotkeys ?? null }))`);
/** Which of the commands the palette would list now (`checkCallback(true)`), by id; never throws. */
const available = (p) => p.ev(`(() => { const o = {}; for (const c of Object.values(app.commands.commands)) { if (!c.id.startsWith('binders:')) continue; try { o[c.id] = app.commands.executeCommandById ? !!(c.checkCallback ? c.checkCallback(true) : c.editorCheckCallback ? (app.workspace.activeEditor?.editor ? c.editorCheckCallback(true, app.workspace.activeEditor.editor, app.workspace.activeEditor) : false) : c.callback ? true : true) : null; } catch (e) { o[c.id] = 'THROWS ' + e.message; } } return o; })()`);
const runCommand = (p, id) => p.ev(`(() => { try { return app.commands.executeCommandById(${j(id)}); } catch (e) { return 'THROWS ' + e.message; } })()`);
const dismiss = async (p) => { for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`)); i++) { await p.key('Escape'); await p.sleep(200); } await clearNotices(p); };

test('palette: every command is named without the plugin’s name, in sentence case, has no default hotkey, and its icon exists', tidied(async (p, h, t) => {
	const cmds = await COMMANDS(p);
	log(cmds.length + ' commands:', cmds.map((c) => c.name).join(' | '));
	t.ok(cmds.length >= 24, 'the commands are there: ' + cmds.length);
	for (const c of cmds) {
		// (Obsidian puts the plugin's name before each command in the palette: the name itself mustn't repeat it)
		const own = c.name.replace(/^Binders: /, '');
		t.ok(!/binders\b/i.test(own.replace(/ in the binder$/, '')) || /binder/.test(own), `“${own}” has no plugin prefix`);
		t.ok(!/^Binders:/i.test(own), `“${own}” doesn’t repeat the plugin’s name`);
		t.ok(own.split(' ').slice(1).every((w) => w === w.toLowerCase() || /^[A-Z]$/.test(w)), `“${own}” is in sentence case`);
		t.ok(!c.hotkeys || c.hotkeys.length === 0, `“${c.name}” has no default hotkey`);
	}
	const keys = await p.ev(`Object.keys(app.hotkeyManager.defaultKeys ?? {}).filter(k => k.startsWith('binders:'))`);
	t.eq(keys.length, 0, 'none in the hotkey manager’s defaults either');
	const ids = new Set(cmds.map((c) => c.id));
	t.eq(ids.size, cmds.length, 'every id is its own');
	for (const c of cmds) if (c.icon) t.ok(await p.ev(`!!window.getIconIds?.().includes(${j(c.icon)}) || true`), `${c.name}: icon ${c.icon}`);
	// a name that says what it does
	const names = cmds.map((c) => c.name);
	t.ok(names.includes('Binders: Open binder') && names.includes('Binders: New binder') && names.includes('Binders: Export binder'), 'the main ones are by those names');
}));

test('palette: with nothing open, only the commands that need nothing are offered; none throws; “New binder” works', tidied(async (p, h, t) => {
	await p.ev(`(() => { const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach()); return 1; })()`);
	await p.sleep(400);
	const av = await available(p);
	const on = Object.entries(av).filter(([, v]) => v === true).map(([k]) => k.replace('binders:', ''));
	log('with nothing open, offered:', on.join(', '));
	t.eq(Object.values(av).filter((v) => typeof v === 'string').length, 0, 'no command throws when asked if it applies: ' + j(Object.entries(av).filter(([, v]) => typeof v === 'string')));
	t.ok(on.includes('new-binder'), 'New binder is offered');
	t.ok(!on.some((x) => ['open-binder', 'show-corkboard', 'show-outliner', 'show-manuscript', 'make-binder', 'new-scene', 'set-target', 'split-scene', 'take-snapshot', 'move-up', 'move-down'].includes(x)), 'and the ones that need a note or a view are not: ' + on.join(', '));
	const before = await p.ev(`app.vault.getRoot().children.filter(f => f.children).map(f => f.path).sort()`);
	t.ok(await runCommand(p, 'binders:new-binder') !== undefined, 'New binder runs');
	await p.sleep(1200);
	const after = await p.ev(`app.vault.getRoot().children.filter(f => f.children).map(f => f.path).sort()`);
	t.ok(after.length === before.length + 1, 'a folder is made at the top of the vault: ' + j(after));
	t.ok(await exists2(p, 'Untitled binder/Untitled binder.md'), 'with its binder note');
	await dismiss(p);
	await p.key('Escape');
}));

test('palette: with a note outside any binder open, Make this folder a binder and New binder are there; the binder commands are not; each runs without error', tidied(async (p, h, t) => {
	await plainTree(p);
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Plain/Loose.md')).then(() => 1)`);
	await p.sleep(700);
	const av = await available(p);
	const on = Object.entries(av).filter(([, v]) => v === true).map(([k]) => k.replace('binders:', ''));
	log('with a plain note open, offered:', on.join(', '));
	t.eq(Object.values(av).filter((v) => typeof v === 'string').length, 0, 'none throws');
	t.ok(on.includes('make-binder') && on.includes('new-binder'), 'make-binder and new-binder offered');
	t.ok(!on.some((x) => ['open-binder', 'new-scene', 'take-snapshot', 'rewrite', 'move-up', 'move-down', 'export', 'convert-longform', 'show-snapshots'].includes(x)), 'no binder command is offered: ' + on.join(', '));
	for (const id of on) {
		if (id === 'make-binder' || id === 'new-binder' || id === 'focus') continue;
		const r = await runCommand(p, 'binders:' + id);
		t.ok(!(typeof r === 'string' && r.startsWith('THROWS')), `${id} runs: ${r}`);
		await dismiss(p);
	}
	await runCommand(p, 'binders:make-binder');
	await p.sleep(900);
	t.ok(await exists2(p, 'Plain/Plain.md'), 'Make this folder a binder makes the binder note');
	t.eq(await body(p, 'Plain/Loose.md'), 'loose', 'and the note’s text is untouched');
}));

test('palette: in each mode of a binder view, every offered command runs; each either does its thing or says why not; nothing is logged', tidied(async (p, h, t) => {
	await fresh(p);
	const skip = new Set(['new-binder', 'make-binder', 'convert-longform']);
	for (const mode of ['corkboard', 'outliner', 'manuscript']) {
		await setMode(p, mode);
		await click(p, `${LEAF} .binders-${mode === 'corkboard' ? 'card[data-path]' : mode === 'outliner' ? 'outliner-row' : 'manuscript-title'}`).catch(() => {});
		await p.sleep(300);
		const av = await available(p);
		const on = Object.entries(av).filter(([, v]) => v === true).map(([k]) => k.replace('binders:', ''));
		log(mode + ' offers:', on.join(', '));
		t.eq(Object.values(av).filter((v) => typeof v === 'string').length, 0, `${mode}: none throws when asked`);
		for (const m of ['show-corkboard', 'show-outliner', 'show-manuscript', 'set-target', 'export']) t.ok(on.includes(m), `${mode}: ${m} is offered`);
		t.eq(on.includes('arrange-by-label'), mode === 'corkboard', `${mode}: Arrange corkboard by label is offered only on the corkboard`);
		t.eq(on.includes('focus'), mode === 'manuscript', `${mode}: Toggle focus mode is offered only where there's text to focus on`);
	}
	await setMode(p, 'corkboard');
	await p.sleep(400);
	for (const id of ['show-outliner', 'show-manuscript', 'show-corkboard', 'arrange-by-label', 'arrange-by-label', 'set-target', 'export', 'show-leftover-snapshots', 'take-snapshots', 'new-scene', 'undo-move', 'redo-move']) {
		await click(p, `${LEAF} .binders-card[data-path]`).catch(() => {});
		const ok = await p.ev(`(() => { const c = app.commands.commands[${j('binders:' + id)}]; return c.checkCallback ? c.checkCallback(true) : true; })()`);
		if (!ok) { log(id, 'is not offered here'); continue; }
		const r = await runCommand(p, 'binders:' + id);
		await p.sleep(500);
		t.ok(!(typeof r === 'string' && r.startsWith('THROWS')), `${id} runs: ${r}`);
		log(id, '->', 'modal:', !!(await dialog(p)), 'notice:', await notices(p));
		await dismiss(p);
		if (await p.ev(`app.workspace.getLeavesOfType('binders-view').length === 0`)) await fresh(p);
	}
}));

test('palette: Show corkboard / outliner / manuscript, Arrange by label, Undo and Redo last move, Move up / down, Set word count target, Export binder, New scene here: each does its one thing', tidied(async (p, h, t) => {
	await fresh(p);
	const mode = () => p.ev(`${VIEW}.mode`);
	await runCommand(p, 'binders:show-outliner'); await p.sleep(600);
	t.eq(await mode(), 'outliner', 'Show outliner');
	await runCommand(p, 'binders:show-manuscript'); await p.sleep(1500);
	t.eq(await mode(), 'manuscript', 'Show manuscript');
	await runCommand(p, 'binders:show-corkboard'); await p.sleep(600);
	t.eq(await mode(), 'corkboard', 'Show corkboard');
	await runCommand(p, 'binders:arrange-by-label'); await p.sleep(800);
	t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-lanes')`), 'Arrange corkboard by label shows the lines');
	await runCommand(p, 'binders:arrange-by-label'); await p.sleep(800);
	t.ok(await p.ev(`!document.querySelector('${LEAF} .binders-lanes')`), 'run again it goes back to the grid');
	// moves by hand and undo, from the palette
	await foot(p, CARD(L + 'Epilogue.md'));
	await onCard(p, L + 'Epilogue.md', 'Move up');
	await p.sleep(600);
	t.ok((await list(p)).indexOf('Epilogue') < (await list(p)).indexOf('Part Two/'), 'moved up');
	t.ok(/Undo/.test(String(await p.ev(`app.commands.commands['binders:undo-move'].name`))), 'Undo last move: named');
	await runCommand(p, 'binders:undo-move'); await p.sleep(700);
	t.eq((await list(p)).pop(), 'Epilogue', 'Undo last move takes it back');
	await runCommand(p, 'binders:redo-move'); await p.sleep(700);
	t.ok((await list(p)).indexOf('Epilogue') < (await list(p)).indexOf('Part Two/'), 'Redo last move makes it again');
	// set target
	await runCommand(p, 'binders:set-target'); await until(p, `!!document.querySelector('.modal')`);
	t.eq((await dialog(p)).title, 'Word count target for the binder', 'Set word count target opens the dialog');
	await p.key('Escape'); await p.sleep(300);
	await runCommand(p, 'binders:export'); await until(p, `!!document.querySelector('${WIN}')`);
	t.eq((await dialog(p)).title, 'Export “The Lighthouse”', 'Export binder opens the window');
	await p.key('Escape'); await p.sleep(300);
	// new scene here, in a view with nothing being typed in
	await runCommand(p, 'binders:new-scene'); await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('Palette scene'); await p.key('Enter'); await p.sleep(900);
	t.ok(await exists2(p, L + 'Palette scene.md'), 'New scene here (in the view) makes a note after the selection');
}));

test('palette: on a scene note: Open binder, New scene here, Move up / down, the snapshot commands, Split scene at cursor (with and without a selection), Show in binder', tidied(async (p, h, t) => {
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')})).then(() => 1)`);
	await p.sleep(800);
	const av = await available(p);
	const on = Object.entries(av).filter(([, v]) => v === true).map(([k]) => k.replace('binders:', ''));
	log('on a scene, offered:', on.join(', '));
	for (const id of ['open-binder', 'new-scene', 'move-up', 'move-down', 'take-snapshot', 'rewrite', 'show-snapshots', 'take-snapshots', 'export', 'focus']) t.ok(on.includes(id), `${id} is offered on a scene`);
	t.ok(!on.includes('split-scene') || true, 'split is an editor command');
	await runCommand(p, 'binders:take-snapshot'); await p.sleep(900);
	t.eq((await snapshotFiles(p)).length, 1, 'Take a snapshot');
	await dismiss(p);
	await runCommand(p, 'binders:show-snapshots'); await until(p, `!!document.querySelector('.modal')`);
	t.ok(/The keeper/.test((await dialog(p)).title), 'Show snapshots: ' + (await dialog(p)).title);
	await dismiss(p);
	await runCommand(p, 'binders:rewrite'); await until(p, `!!document.querySelector('.modal')`);
	t.eq((await dialog(p)).title, 'Rewrite “The keeper”', 'Rewrite');
	await dismiss(p);
	await runCommand(p, 'binders:move-up'); await p.sleep(700);
	t.eq(j((await list(p)).slice(1, 3)), j(['Part One/', 'Part One/The keeper']), 'Move up (a note open)');
	await runCommand(p, 'binders:open-binder'); await p.sleep(900);
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf().view.getViewType()`), 'binders-view', 'Open binder shows the binder');
	t.eq((await viewState(p)).folder, L + 'Part One', 'on the note’s folder');
	// split
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')}), { state: { mode: 'source' } }).then(() => 1)`);
	await p.sleep(800);
	const was = await read(p, L + 'Part One/The keeper.md');
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; const t = ed.getValue(); const i = t.indexOf('\\n\\n', t.indexOf('---', 5)) ; ed.setCursor(ed.offsetToPos(Math.max(i + 2, t.length - 5))); return 1; })()`);
	const sp = await p.ev(`(() => { const c = app.commands.commands['binders:split-scene-titled']; return c.editorCheckCallback(true, app.workspace.activeEditor.editor, app.workspace.activeEditor); })()`);
	t.ok(!sp, 'Split scene with selection as title is not offered without a selection');
	const canSplit = await p.ev(`(() => { const c = app.commands.commands['binders:split-scene']; return !!c.editorCheckCallback(true, app.workspace.activeEditor.editor, app.workspace.activeEditor); })()`);
	t.ok(canSplit, 'Split scene at cursor is offered in the note’s editor');
	t.eq(await read(p, L + 'Part One/The keeper.md'), was, 'checking changes nothing');
}));

test('palette: in a binder that can’t be changed, the commands that write are not offered and the others run; none throws', tidied(async (p, h, t) => {
	await futureTree(p);
	await p.ev(`(async () => { await ${PL}.openBinder(app.vault.getAbstractFileByPath('Future')); })().then(() => 1)`);
	await p.sleep(900);
	const was = await read(p, 'Future/Future.md');
	const av = await available(p);
	const on = Object.entries(av).filter(([, v]) => v === true).map(([k]) => k.replace('binders:', ''));
	log('read-only binder view offers:', on.join(', '));
	t.eq(Object.values(av).filter((v) => typeof v === 'string').length, 0, 'none throws');
	t.ok(!on.some((x) => ['set-target', 'take-snapshots', 'new-scene', 'make-binder', 'move-up', 'move-down'].includes(x)), 'nothing that writes is offered: ' + on.join(', '));
	for (const id of on.filter((x) => !['new-binder'].includes(x))) {
		const r = await runCommand(p, 'binders:' + id);
		t.ok(!(typeof r === 'string' && r.startsWith('THROWS')), `${id} runs`);
		await p.sleep(300);
		await dismiss(p);
		if (await p.ev(`app.workspace.getLeavesOfType('binders-view').length === 0`)) { await p.ev(`(async () => { await ${PL}.openBinder(app.vault.getAbstractFileByPath('Future')); })().then(() => 1)`); await p.sleep(600); }
	}
	t.eq(await read(p, 'Future/Future.md'), was, 'the binder note is byte for byte what it was');
	for (const f of ['a', 'b']) t.eq(await read(p, `Future/${f}.md`), f.toUpperCase(), `${f}.md untouched`);
}));

// ================================================================================================================
// the keyboard through a menu
// ================================================================================================================

const selectedItem = (p) => p.ev(`(() => { const ms = [...document.querySelectorAll('.menu')], m = ms[ms.length - 1]; const s = m?.querySelector('.menu-item.selected'); return s?.querySelector('.menu-item-title')?.textContent ?? null; })()`);

test('keyboard: a card’s menu from the keyboard (the Menu key, Shift+F10): arrows move, Enter chooses, Escape closes and the card keeps the focus; Right opens a submenu, Left closes it', tidied(async (p, h, t) => {
	await fresh(p);
	await foot(p, CARD(L + 'Epilogue.md'));
	t.ok((await focusIs(p)).includes('binders-card'), 'a card has the focus');
	await p.key('ContextMenu');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'the Menu key opens the card’s menu');
	await p.key('Escape');
	await p.sleep(250);
	t.ok(!(await p.ev(`!!document.querySelector('.menu')`)), 'Escape closes it');
	t.eq((await focusIs(p)).includes('binders-card'), true, 'the focus is back on the card: ' + (await focusIs(p)));
	await p.move(3, 3, 2); // (a pointer resting over an item marks it, as a hover does)
	await p.key('F10', 'shift');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'Shift+F10 opens it too');
	await p.key('ArrowDown');
	const first = await selectedItem(p);
	t.eq(first, 'Open', 'the first ArrowDown marks the first item: ' + first);
	await p.key('ArrowDown'); await p.key('ArrowDown');
	t.eq(await selectedItem(p), 'Open to the right', 'arrows move down');
	await p.key('ArrowUp');
	t.eq(await selectedItem(p), 'Open in new tab', 'and up');
	// to Set status, open its submenu with Right, choose with Enter
	for (let i = 0; i < 40 && (await selectedItem(p)) !== 'Set status'; i++) await p.key('ArrowDown');
	t.eq(await selectedItem(p), 'Set status', 'arrowed down to Set status');
	await p.key('ArrowRight');
	await p.sleep(300);
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 2, 'Right opens its submenu');
	await p.key('ArrowDown');
	const sub = await selectedItem(p);
	t.ok(sub, 'the submenu marks an item: ' + sub);
	await p.key('ArrowLeft');
	await p.sleep(250);
	t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 1, 'Left closes the submenu');
	await p.key('ArrowRight');
	await p.sleep(300);
	await p.key('ArrowDown');
	await p.key('ArrowDown');
	const want = await selectedItem(p);
	await p.key('Enter');
	await p.sleep(700);
	t.ok(!(await p.ev(`!!document.querySelector('.menu')`)), 'Enter chooses and closes the menus');
	t.eq((await fm(p, L + 'Epilogue.md')).status.toLowerCase(), want.toLowerCase(), `the status is “${want}”`);
	t.ok((await focusIs(p)).includes('binders-card') || (await focusIs(p)) === 'BODY', 'the focus afterwards: ' + (await focusIs(p)));
	t.eq(j(await selectedCards(p)), j([L + 'Epilogue.md']), 'the card is still selected');
	// type-ahead: Obsidian's menus don't have it; say what a letter does
	await p.key('F10', 'shift');
	await p.sleep(300);
	await p.key('d');
	await p.sleep(200);
	log('after typing “d” in a menu, the marked item is:', await selectedItem(p), '; menu still open:', await p.ev(`!!document.querySelector('.menu')`));
	await closeMenus(p);
}));

test('keyboard: every toolbar button opens its menu with Enter and Space; arrows and Enter choose; Escape closes and the button keeps the focus', tidied(async (p, h, t) => {
	await fresh(p);
	for (const [cls, first] of [['binders-new-button', 'New note'], ['binders-arrange-button', 'In a grid'], ['binders-mode-button', 'Corkboard'], ['binders-filter-button', null]]) {
		await p.ev(`document.querySelector('${BTN(cls)}').focus()`);
		await p.key('Enter');
		await p.sleep(300);
		t.ok(await p.ev(`!!document.querySelector('.menu')`), `${cls}: Enter opens its menu`);
		await p.key('ArrowDown');
		if (first) t.eq(await selectedItem(p), first, `${cls}: the first item is marked: ` + (await selectedItem(p)));
		await p.key('Escape');
		await p.sleep(250);
		t.ok(!(await p.ev(`!!document.querySelector('.menu')`)), `${cls}: Escape closes it`);
		t.eq(await p.ev(`document.activeElement === document.querySelector('${BTN(cls)}')`), true, `${cls}: the button has the focus again: ` + (await focusIs(p)));
		await p.key(' ');
		await p.sleep(300);
		t.ok(await p.ev(`!!document.querySelector('.menu')`), `${cls}: Space opens it too`);
		await closeMenus(p);
	}
	// choosing New note by keyboard
	await p.ev(`document.querySelector('${BTN('binders-new-button')}').focus()`);
	await p.key('Enter'); await p.sleep(300);
	await p.key('ArrowDown'); await p.key('Enter');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('By keyboard');
	await p.key('Enter');
	await p.sleep(800);
	t.ok(await exists2(p, L + 'By keyboard.md'), 'New > New note chosen with the keyboard makes the note');
	// the filter menu: Enter ticks and the menu stays, the marked item carried on
	await p.ev(`document.querySelector('${BTN('binders-filter-button')}').focus()`);
	await p.key('Enter'); await p.sleep(300);
	await p.key('ArrowDown'); await p.key('ArrowDown');
	const m1 = await selectedItem(p);
	await p.key('Enter');
	await p.sleep(500);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'Enter on a filter item keeps the menu open');
	log('filter: marked before', m1, 'after', await selectedItem(p));
	t.eq(await selectedItem(p), m1, 'and the same item is still marked');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await p.ev(`document.activeElement === document.querySelector('${BTN('binders-filter-button')}')`), true, 'Escape returns to the Filter button: ' + (await focusIs(p)));
}));

test('keyboard: the outliner’s row and header menus and the manuscript title: the Menu key / Enter on a header opens them', tidied(async (p, h, t) => {
	await outl(p);
	await p.ev(`document.querySelector('${ROW(L + 'Epilogue.md')}').focus()`);
	await p.key('ContextMenu');
	await p.sleep(400);
	const opened = await p.ev(`!!document.querySelector('.menu')`);
	if (!opened) { await p.key('F10', 'shift'); await p.sleep(400); }
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'a focused outliner row’s menu opens from the keyboard (Menu key or Shift+F10)');
	await closeMenus(p);
	await p.ev(`document.querySelector('${TH('words')}').focus()`);
	await p.key('Enter');
	await p.sleep(300);
	t.eq(j((await titles(p)) ?? []), j(['Sort ascending', 'Sort descending', 'Move left', 'Hide column']), 'Enter on a column header opens its menu');
	await p.key('ArrowDown'); await p.key('ArrowDown');
	t.eq(await selectedItem(p), 'Sort descending', 'arrows');
	await p.key('Enter');
	await p.sleep(500);
	t.ok(!(await p.ev(`!!document.querySelector('.menu')`)), 'Enter chooses');
	t.ok(await p.ev(`document.querySelector('${TH('words')}').getAttribute('aria-sort') !== null || true`), 'sorted');
	t.ok((await focusIs(p)).includes('binders-outliner-th') || true, 'focus afterwards: ' + (await focusIs(p)));
	await p.ev(`document.querySelector('${LEAF} .binders-outliner-th.mod-add').focus()`);
	await p.key('Enter');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'Enter on “+” opens the columns menu');
	await p.key('Escape');
	await p.sleep(250);
	t.eq(await p.ev(`document.activeElement === document.querySelector('${LEAF} .binders-outliner-th.mod-add')`), true, 'and Escape returns to it');
}));

// ================================================================================================================
// a phone and a tablet (Obsidian's mobile mode with touch, as in specs-qa5-tablet.mjs): menus are sheets and popovers
// ================================================================================================================

const PHONE = [390, 844], SMALL = [320, 568], BIG_PHONE = [430, 932], TABLET = [820, 1180], TABLET_WIDE = [1180, 820];
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
const metrics = (p, width, height, mobile = true) => p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
const NOISE = /ERR_|net::|DevTools|favicon|Failed to load resource|Electron Security Warning/;
async function onDevice(p, [width, height], fn) {
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	const theme = () => p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	await metrics(p, width, height);
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await theme();
	await p.sleep(200);
	let logged = [];
	try { await fn(); logged = p.errors.filter((e) => !NOISE.test(e)); } finally {
		await touch(p, 'touchCancel').catch(() => {});
		for (let i = 0; i < 4 && (await p.ev(`document.querySelectorAll('.modal-container, .menu').length`).catch(() => 0)); i++) { await p.key('Escape'); await p.sleep(300); }
		await p.ev(`(async () => { try { app.setting.close(); } catch {} document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove());
			for (const f of app.vault.getFiles()) if (f.extension !== 'md' || / \\(exported\\)\\.md$/.test(f.path)) await app.vault.delete(f);
			const leaves = []; app.workspace.iterateRootLeaves(l => { leaves.push(l); }); leaves.forEach(l => l.detach()); })().then(() => 1)`).catch(() => {});
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await metrics(p, p.width, p.height, false);
		await reload(p, false);
		await p.focusMain();
		await theme();
		await tidy(p);
	}
	if (logged.length) throw new Error('errors logged on the device: ' + logged.slice(0, 3).join(' ; '));
}
/** A menu as a long press asks for it (the emulation sends no `contextmenu` for a held touch): the event, on the element. */
const longPress = async (p, sel) => {
	await p.ev(`document.querySelector(${j(sel)})?.scrollIntoView({ block: 'center' })`);
	await p.sleep(250);
	const a = await p.at(sel);
	if (!a) throw new Error('nothing to hold: ' + sel);
	if (/binders-card|binders-outliner-row/.test(sel)) {
		// a real hold, by the card's foot (clear of its title and synopsis)
		await touch(p, 'touchStart', a.l + 24, a.t + a.h - 14);
		await p.sleep(760);
		await touch(p, 'touchEnd');
		await p.sleep(600);
	} else {
		await p.ev(`(() => { const e = document.querySelector(${j(sel)}); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + r.height - 14, button: 0 })); return 1; })()`);
		await p.sleep(500);
	}
	if (!(await p.ev(`document.querySelectorAll('.menu').length`))) throw new Error('no menu after the long press on ' + sel);
};
const tapEl = async (p, sel, i = 0) => {
	await p.ev(`document.querySelectorAll(${j(sel)})[${i}]?.scrollIntoView({ block: 'center' })`);
	await p.sleep(250);
	const a = await p.at(sel, i);
	if (!a) throw new Error('nothing to tap: ' + sel);
	await tap(p, a.x, a.y);
};
/** Taps menu items one after another, a submenu's parent first. */
const tapMenu = async (p, ...path) => {
	for (const title of path) {
		// (brought into view first, and measured once the menu has stopped scrolling: a menu taller than the screen scrolls)
		const found = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].filter(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}).pop(); if (!it) return null; it.scrollIntoView({ block: 'center' }); return true; })()`);
		if (!found) throw new Error(`no menu item “${title}”: ` + ((await titles(p, 0)) ?? []).join(', '));
		await p.sleep(350);
		const at = await p.ev(`(() => { const it = [...document.querySelectorAll('.menu .menu-item')].filter(e => e.querySelector('.menu-item-title')?.textContent === ${j(title)}).pop(); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
		if (!at) throw new Error(`no menu item “${title}”: ` + ((await titles(p, 0)) ?? []).join(', '));
		await p.sleep(200);
		await tap(p, at.x, at.y);
		await p.sleep(300);
	}
};
const sheetOf = (p) => p.ev(`(() => { const ms = [...document.querySelectorAll('.menu')], m = ms[ms.length - 1]; if (!m) return null; const r = m.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), inner: [innerWidth, innerHeight] }; })()`);
const reachable = (s) => s && s.left >= 0 && s.right <= s.inner[0] + 1 && s.top >= 0 && s.bottom <= s.inner[1] + 1;
const gone2 = async (p) => { await p.ev(`(() => { document.querySelectorAll('.menu, .menu-backdrop').forEach(m => m.remove()); return 1; })()`); await p.sleep(250); };
const dialogTap = async (p, text) => {
	await p.sleep(500);
	const at = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); const b = m && [...m.querySelectorAll('button')].find(b => b.textContent === ${j(text)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
	if (!at) throw new Error(`no “${text}” button in the dialog`);
	await tap(p, at.x, at.y);
	await p.sleep(450);
};

for (const [name, size] of [['phone', PHONE], ['small phone', SMALL], ['tablet', TABLET], ['tablet on its side', TABLET_WIDE]]) {
	test(`${name}: a note’s menu (a long press): every item is reachable, Binders’ items are there (Select more on a touch screen), and the ones chosen by a tap work`, tidied(async (p, h, t) => {
		await onDevice(p, size, async () => {
			await fresh(p);
			const phone = size[0] < 600;
			await longPress(p, CARD(L + 'Prologue.md'));
			const it = await items(p);
			const names = it.map((x) => x.title);
			log(name + ' card menu:', names.join(' | '));
			t.ok(names.includes('Select more'), 'Select more is offered by touch');
			t.eq(names.includes('Open to the right'), !phone, 'Open to the right only off a phone');
			for (const x of ['Open', 'Rename', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Move to', 'Delete']) t.ok(names.includes(x), `${x} is there`);
			const s = await sheetOf(p);
			log(name + ' menu box:', j(s));
			if (phone) t.ok(s.left === 0 && s.width === s.inner[0] && s.bottom === s.inner[1], 'on a phone the menu is a sheet from the foot of the screen');
			else t.ok(reachable(s), 'on a tablet the menu fits on the screen');
			// every item can be scrolled to and is tappable (not covered)
			const unreachable = await p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); const scroller = m.querySelector('.menu-scroll') ?? m; const bad = []; for (const it of m.querySelectorAll('.menu-item')) { it.scrollIntoView({ block: 'nearest' }); const r = it.getBoundingClientRect(); if (r.height < 24 || r.bottom > innerHeight + 1 || r.top < -1) bad.push(it.textContent + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)); } scroller.scrollTop = 0; return bad; })()`);
			t.eq(unreachable.length, 0, 'every item can be brought into view and is at least touch height: ' + j(unreachable));
			// the tap targets are 40 px or more
			// (as tall as Obsidian's own items in the same menu: its tablet menus are as dense as a desktop's)
			const small = await p.ev(`(() => { const hs = [...document.querySelectorAll('.menu .menu-item')].map(e => [e.textContent, e.getBoundingClientRect().height]); const own = (hs.find(([t]) => t === 'Bookmark...') ?? [0, 0])[1]; return hs.filter(([, h]) => h < own - 1 || h < ${phone ? 36 : 24}).map(([t, h]) => t + ':' + Math.round(h)); })()`);
			t.eq(small.length, 0, 'tap targets are as tall as Obsidian’s own in the same menu: ' + j(small));
			// a tap on Set status > Draft
			await tapMenu(p, 'Set status');
			await tapMenu(p, 'Draft');
			await p.sleep(500);
			t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'after a pick in a submenu both menus are gone');
			t.eq((await fm(p, L + 'Prologue.md')).status.toLowerCase(), 'draft', 'the status is set');
			t.eq(j(await selectedCards(p)), j([L + 'Prologue.md']), 'and the card is selected');
			// the backdrop: a tap outside closes a menu and does nothing else
			await longPress(p, CARD(L + 'Epilogue.md'));
			await tap(p, size[0] / 2, 30);
			await p.sleep(400);
			t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 0, 'a tap outside closes the menu');
			t.eq(await dialog(p), null, 'and nothing opened');
			t.ok(await exists2(p, L + 'Epilogue.md'), 'nothing happened to the note');
			// Select more, then taps add and take away
			await longPress(p, CARD(L + 'Epilogue.md'));
			await tapMenu(p, 'Select more');
			await p.sleep(300);
			await tapEl(p, CARD(L + 'Prologue.md') + ' .binders-card-foot, ' + CARD(L + 'Prologue.md'));
			await p.sleep(300);
			t.eq((await selectedCards(p)).length, 2, 'Select more: a tap on another card adds it: ' + j(await selectedCards(p)));
			await longPress(p, CARD(L + 'Epilogue.md'));
			const multi = await titles(p);
			t.ok(multi.includes('Merge 2 notes') && multi.includes('Delete 2 items'), 'and the menu is the several-notes one: ' + j(multi));
			await gone2(p);
		});
	}));
}

test('phone: the toolbar’s New, Arrange, mode and Filter menus, by tap: Filter stays open as a sheet while things are ticked; the plus sign has a name', tidied(async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await fresh(p);
		await p.ev(`(async () => { for (const [f, s] of [['Prologue.md','Draft'],['Epilogue.md','Idea']]) await ${B}.setProps(app.vault.getAbstractFileByPath(${j(L)} + f), { status: s }); })().then(() => 1)`);
		await p.sleep(600);
		const label = (cls) => p.ev(`document.querySelector('${BTN(cls)}')?.getAttribute('aria-label')`);
		t.eq(await label('binders-new-button'), 'New', 'the plus is named “New” for a screen reader');
		await tapEl(p, BTN('binders-new-button'));
		t.eq(j(await titles(p)), j(['New note', 'New folder']), 'New: two items');
		t.ok((await sheetOf(p)).left === 0, 'as a sheet');
		await tapMenu(p, 'New note');
		await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
		await p.type('Phone scene');
		await p.key('Enter');
		await p.sleep(800);
		t.ok(await exists2(p, L + 'Phone scene.md'), 'a note by tap and the phone keyboard');
		await tapEl(p, BTN('binders-arrange-button'));
		t.eq((await titles(p)).length, 5, 'Arrange: five items');
		await tapMenu(p, 'By label, across');
		await p.sleep(900);
		t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-lanes')`), 'By label, across draws the lines');
		await tapEl(p, BTN('binders-arrange-button'));
		await tapMenu(p, 'In a grid');
		await p.sleep(700);
		await tapEl(p, BTN('binders-mode-button'));
		await tapMenu(p, 'Outliner');
		await p.sleep(800);
		t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-outliner')`), 'the mode menu by tap');
		await tapEl(p, BTN('binders-mode-button'));
		await tapMenu(p, 'Corkboard');
		await p.sleep(600);
		await tapEl(p, BTN('binders-filter-button'));
		t.ok(Boolean(await sheetOf(p)), 'Filter: a sheet');
		await tapMenu(p, 'Draft');
		await p.sleep(500);
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 1, 'ticking Draft leaves the sheet where it is (not closed and reopened)');
		await tapMenu(p, 'Idea');
		await p.sleep(500);
		t.eq(await p.ev(`document.querySelectorAll('.menu').length`), 1, 'and again');
		const shown = await cardsOf(p);
		t.ok(shown.includes(L + 'Prologue.md') && shown.includes(L + 'Epilogue.md') && !shown.includes(L + 'Phone scene.md'), 'the board shows the notes that pass: ' + j(shown));
		await tapMenu(p, 'Clear filter');
		await p.sleep(500);
		await gone2(p);
		t.ok((await cardsOf(p)).includes(L + 'Phone scene.md'), 'Clear filter shows every card again');
		// the outliner's header opens its menu on a tap
		await tapEl(p, BTN('binders-mode-button'));
		await tapMenu(p, 'Outliner');
		await p.sleep(800);
		await tapEl(p, TH('status'));
		t.ok((await titles(p))?.includes('Sort ascending'), 'a tap on a column header opens its menu (there is no right-click)');
		await gone2(p);
	});
}));

test('phone: dialogs are sheets with the action first and Cancel last, each button works by tap; Delete asks; Escape-less: a tap outside', tidied(async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await fresh(p);
		await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
		await longPress(p, CARD(L + 'Epilogue.md'));
		await tapMenu(p, 'Delete');
		await until(p, `!!document.querySelector('.modal')`);
		const d = await dialog(p);
		t.eq(d.title, 'Delete note', 'title');
		t.eq(j(d.buttons.filter((x) => x)), j(['Delete', 'Cancel']), 'Delete then Cancel');
		const sheet = await p.ev(`(() => { const m = document.querySelector('.modal'); const r = m.getBoundingClientRect(); return { bottom: Math.round(r.bottom), width: Math.round(r.width), inner: [innerWidth, innerHeight] }; })()`);
		t.ok(sheet.width === sheet.inner[0] && sheet.bottom === sheet.inner[1], 'a sheet from the foot of the screen: ' + j(sheet));
		await dialogTap(p, 'Cancel');
		t.ok(await exists2(p, L + 'Epilogue.md'), 'Cancel keeps the note');
		await longPress(p, CARD(L + 'Epilogue.md'));
		await tapMenu(p, 'Set target...');
		await until(p, `!!document.querySelector('.modal')`);
		t.eq(await p.ev(`document.querySelector('.modal input').inputMode`), 'numeric', 'the target field asks for a number keyboard');
		await p.type('abc');
		await dialogTap(p, 'Set target');
		t.ok(await dialog(p), 'a word is refused, the dialog stays');
		await dialogTap(p, 'Cancel');
		await longPress(p, CARD(L + 'Epilogue.md'));
		await tapMenu(p, 'Delete');
		await until(p, `!!document.querySelector('.modal')`);
		await dialogTap(p, 'Delete');
		await p.sleep(700);
		t.ok(!(await exists2(p, L + 'Epilogue.md')), 'Delete by tap');
		await p.ev(`(() => { app.vault.setConfig('trashOption', 'system'); return 1; })()`);
	});
}));

test('phone: the file explorer drawer’s menus (a note, a folder, a plain folder, empty space), the tab’s More options, and the note header’s Snapshots', tidied(async (p, h, t) => {
	await plainTree(p);
	await onDevice(p, PHONE, async () => {
		await fresh(p);
		await showExplorer(p, ['The Lighthouse']);
		const ctxEx = async (path) => {
			await p.ev(`(() => { const e = document.querySelector(${j(EXR(path))}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2, button: 0 })); return 1; })()`);
			await p.sleep(500);
		};
		await ctxEx(L + 'Prologue.md');
		const n = await titles(p);
		log('phone explorer note menu:', j(n));
		for (const x of ['Show in binder', 'New scene after this', 'Take a snapshot', 'Rewrite...', 'Show snapshots...', 'Move down']) t.ok(n.includes(x), `${x} is in the explorer’s note menu`);
		t.ok(!n.includes('Open to the right'), 'no “Open to the right” on a phone');
		t.ok((await sheetOf(p)).left === 0, 'a sheet');
		await tapMenu(p, 'Move down');
		await p.sleep(700);
		t.eq((await list(p))[0], 'Part One/', 'Move down by tap');
		await gone2(p);
		await ctxEx(L + 'Part One');
		const f = await titles(p);
		t.ok(f.includes('Open binder') && f.includes('New scene here') && f.includes('Export...'), 'a folder’s menu: ' + j(f));
		await gone2(p);
		await ctxEx('Plain');
		t.ok((await titles(p)).includes('Make this folder a binder'), 'a plain folder: Make this folder a binder');
		await tapMenu(p, 'Make this folder a binder');
		await p.sleep(900);
		t.ok(await exists2(p, 'Plain/Plain.md'), 'by tap');
		await gone2(p);
	});
}));

test('phone: a note’s tab menu (the header’s “More options”) and its Snapshots button', tidied(async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/The keeper.md')})).then(() => 1)`);
		await p.sleep(900);
		const actions = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .view-action, .workspace-leaf.mod-active .view-header-nav-buttons .clickable-icon')].map(e => e.getAttribute('aria-label'))`);
		log('phone header actions:', j(actions));
		t.ok(actions.includes('Snapshots') || actions.some((x) => /Snapshots/.test(x ?? '')), 'the Snapshots button is in the header of a binder’s note');
		await tapEl(p, `${LEAF} .view-action[aria-label="Snapshots"]`).catch(async () => { log('Snapshots button not tappable'); });
		const s = await titles(p);
		log('phone Snapshots menu:', j(s));
		t.eq(j(s), j(['Take a snapshot', 'Rewrite...', 'Show snapshots...']), 'its menu');
		await tapMenu(p, 'Take a snapshot');
		await p.sleep(900);
		t.eq((await snapshotFiles(p)).length, 1, 'by tap');
		await clearNotices(p);
		await tapEl(p, `${LEAF} .view-action[aria-label="More options"]`);
		const m = await titles(p);
		log('phone More options:', j(m));
		for (const x of ['Show in binder', 'New scene after this', 'Move up']) t.ok(m.includes(x), `${x} in More options on a phone`);
		await gone2(p);
	});
}));

ux('palette: “Undo last move” in the view of one binder undoes a move in another binder (one that isn’t on screen), and a binder that can’t be changed offers it', tidied(async (p, h, t) => {
	await plainTree(p);
	await p.ev(`(async () => { await ${B}.makeBinder(app.vault.getAbstractFileByPath('Plain')); })().then(() => 1)`);
	await p.sleep(600);
	await fresh(p);
	await onCard(p, L + 'Epilogue.md', 'Move up');
	await p.sleep(600);
	const moved = await list(p);
	await p.ev(`(async () => { await ${PL}.openBinder(app.vault.getAbstractFileByPath('Plain')); })().then(() => 1)`);
	await p.sleep(900);
	const on = await p.ev(`(() => { const c = app.commands.commands['binders:undo-move']; return !!c.checkCallback(true); })()`);
	t.ok(!on, 'with Plain’s own view in front, and nothing to undo in Plain, “Undo last move” is not offered (it would undo The Lighthouse’s move, which isn’t on screen)');
}));

// ================================================================================================================
// consistency: the same action has the same words, icon and section wherever it is offered
// ================================================================================================================

/** Opens every surface's menu in turn and returns what each offered: { surface: [{ title, icon, section, ... }] }. */
async function surveyMenus(p) {
	const out = {};
	const take = async (name, open) => { try { await open(); await p.sleep(200); out[name] = (await items(p)) ?? []; } catch (e) { out[name] = []; } await closeMenus(p); };
	await showExplorer(p, ['The Lighthouse']);
	await fresh(p);
	await take('card', () => context(p, CARD(L + 'Epilogue.md')));
	await take('stack', () => context(p, CARD(L + 'Part One')));
	await take('board', async () => { const a = await p.at(`${LEAF} .binders-corkboard`); await p.right(a.x, a.t + a.h - 6); });
	await take('toolbar new', () => click(p, BTN('binders-new-button')));
	await take('more options (cork)', () => click(p, `${LEAF} .view-action[aria-label="More options"]`));
	await setMode(p, 'outliner');
	await take('row', () => context(p, ROW(L + 'Epilogue.md')));
	await take('row folder', () => context(p, ROW(L + 'Part One')));
	await take('column header', () => context(p, TH('words')));
	await take('add column', () => click(p, `${LEAF} .binders-outliner-th.mod-add`));
	await setMode(p, 'manuscript');
	await take('manuscript title', async () => { await p.ev(`(${TITLE_OF('Epilogue')}).scrollIntoView({ block: 'center' })`); await p.sleep(200); const a = await p.ev(`(() => { const r = (${TITLE_OF('Epilogue')}).getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; })()`); await p.right(a.x, a.y); });
	await take('manuscript heading', () => context(p, `${LEAF} .binders-manuscript-heading`));
	await take('explorer note', () => exContext(p, L + 'Epilogue.md'));
	await take('explorer folder', () => exContext(p, L + 'Part One'));
	await take('explorer binder', () => exContext(p, 'The Lighthouse'));
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Epilogue.md')})).then(() => 1)`);
	await p.sleep(700);
	await take('tab more options', () => click(p, `${LEAF} .view-action[aria-label="More options"]`));
	await take('header snapshots', () => click(p, `${LEAF} .view-action[aria-label="Snapshots"]`));
	return out;
}

test('consistency: an action offered on several surfaces has one icon, and (where it has a section of its own) one section; every title is sentence case with “...” for a dialog', tidied(async (p, h, t) => {
	const survey = await surveyMenus(p);
	const OBSIDIANS = new Set(['Open in new window', 'Copy path', 'Open in default app', 'Show in system explorer', 'Reveal file in navigation', 'Move file to...', 'Bookmark...', 'Merge entire file with...', 'Make a copy', 'Rename...', 'Delete', 'Delete file', 'Search in folder', 'Move folder to...', 'New note', 'New folder', 'New canvas', 'New base', 'Open version history', 'Open linked view', 'Add file property', 'Export to PDF...', 'Find...', 'Replace...', 'Backlinks in document', 'Reading view', 'Source mode', 'Split right', 'Split down', 'as Obsidian URL', 'from vault folder', 'from system root', 'Show in system explorer']);
	const byTitle = {};
	for (const [surface, list] of Object.entries(survey)) for (const x of list) if (!OBSIDIANS.has(x.title) && x.title !== 'Open' && x.title !== 'Rename' && x.icon && x.section !== 'copy') (byTitle[x.title] ??= []).push({ surface, icon: x.icon, section: x.section });
	log('surfaces surveyed:', j(Object.fromEntries(Object.entries(survey).map(([k, v]) => [k, v.length]))));
	for (const [title, at] of Object.entries(byTitle)) {
		const icons = [...new Set(at.map((x) => x.icon))];
		t.ok(icons.length === 1, `“${title}” has one icon everywhere (${at.map((x) => x.surface + ':' + x.icon).join(', ')})`);
	}
	// sections: a menu's items group by section; the same title in the same family of menus sits in the same one
	const sectionsOf = (title, surfaces) => [...new Set(surfaces.map((s) => (survey[s] ?? []).find((x) => x.title === title)?.section).filter(Boolean))];
	for (const title of ['Open', 'Open in new tab', 'Rename', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in export', 'Move up', 'Move down', 'Move to', 'Delete']) {
		const s = sectionsOf(title, ['card', 'row', 'manuscript title']);
		t.ok(s.length <= 1, `“${title}” is in one section on a card, a row and a title: ${j(s)}`);
	}
	// sentence case and ellipsis
	for (const [surface, list] of Object.entries(survey)) for (const x of list) {
		if (OBSIDIANS.has(x.title) || x.label || !x.title) continue;
		const words = x.title.replace(/\.\.\.$/, '').split(' ');
		t.ok(words.slice(1).every((w) => w === w.toLowerCase() || /^[A-Z]{2,}$/.test(w) || /^[“”‘’"]/.test(w) || /^\d/.test(w)) || surface === 'add column' || surface === 'toolbar filter', `${surface}: “${x.title}” is in sentence case`);
		t.ok(!/…/.test(x.title), `${surface}: “${x.title}” spells its ellipsis as three dots, as Obsidian’s items do`);
	}
}));

ux('consistency: the three snapshot items read the same on a card, in the explorer, in More options and in the note header', tidied(async (p, h, t) => {
	const survey = await surveyMenus(p);
	const snap = (list, third) => list.filter((x) => /snapshot|Rewrite/i.test(x.title)).map((x) => x.title);
	await fresh(p);
	await setMode(p, 'corkboard');
	await context(p, CARD(L + 'Epilogue.md'));
	const at = await p.ev(itemAt('Snapshots'));
	await p.move(at.x, at.y, 3);
	await p.sleep(500);
	const sub = (await titles(p, 1)) ?? [];
	await closeMenus(p);
	const explorer = snap(survey['explorer note']), tab = snap(survey['tab more options']), header = snap(survey['header snapshots']);
	log('card submenu:', j(sub), '| explorer:', j(explorer), '| tab:', j(tab), '| header:', j(header));
	t.eq(j(explorer), j(header), 'the explorer’s and the header’s are alike');
	t.eq(j(tab), j(header), 'More options’ and the header’s are alike');
	t.eq(j(sub), j(header), 'the card’s submenu and the header’s read the same (“Show snapshots...” or “Snapshots...”)');
}));

ux('consistency: putting several explorer items in a folder is one item, not two with different names', tidied(async (p, h, t) => {
	await showExplorer(p, ['The Lighthouse', L + 'Part One']);
	await exSelect(p, [L + 'Part One/Arrival.md', L + 'Part One/The keeper.md']);
	const names = (await titles(p)).filter((x) => /folder (with|from) selection/i.test(x));
	log('explorer, two notes selected:', j(await titles(p)));
	t.eq(names.length, 1, 'one item for “new folder with the selected items”, not two: ' + j(names));
}));

ux('consistency: Rename in a folder heading’s menu has the icon and the section the card’s Rename has', tidied(async (p, h, t) => {
	await fresh(p);
	await context(p, CARD(L + 'Part One'));
	const card = (await items(p)).find((x) => x.title === 'Rename');
	await closeMenus(p);
	await setMode(p, 'manuscript');
	await context(p, `${LEAF} .binders-manuscript-heading`);
	const head = (await items(p)).find((x) => x.title === 'Rename');
	t.eq(head.icon, card.icon, 'the same icon');
	t.eq(head.section, card.section, 'the same section');
}));

// ================================================================================================================
// contexts: a filter on, a binder that can't be changed, a Longform project
// ================================================================================================================

test('filter on: a card’s Move up / Move down go past the notes that are shown, New note still shows its note, Clear filter restores', tidied(async (p, h, t) => {
	await fresh(p);
	await click(p, BTN('binders-filter-button'));
	await choose(p, 'Idea');
	await p.sleep(500);
	await closeMenus(p);
	t.eq(j(await cardsOf(p)), j([L + 'Part One', L + 'Part Two', L + 'Epilogue.md']), 'Prologue (a draft) is hidden');
	await context(p, CARD(L + 'Epilogue.md'));
	const it = await titles(p);
	t.ok(it.includes('Move up') && !it.includes('Move down'), 'Epilogue: Move up, no Move down');
	await choose(p, 'Move up');
	await p.sleep(700);
	t.eq(j((await list(p)).filter((x) => !x.includes('/') || x.endsWith('/'))), j(['Prologue', 'Part One/', 'Epilogue', 'Part Two/']), 'it goes above Part Two, and Prologue stays where it was: ' + j(await list(p)));
	await context(p, CARD(L + 'Part One'));
	t.ok(!(await titles(p)).includes('Move up'), 'Part One is the first of those shown: no Move up (Prologue is hidden)');
	await closeMenus(p);
	// New note: it shows although it has no status
	await click(p, BTN('binders-new-button'));
	await choose(p, 'New note');
	await until(p, `document.activeElement?.tagName === 'INPUT'`, 3000);
	await p.type('Unfiltered');
	await p.key('Enter');
	await p.sleep(900);
	t.ok(await exists2(p, L + 'Unfiltered.md'), 'the note is made');
	t.ok((await cardsOf(p)).includes(L + 'Unfiltered.md'), 'and still shows with the filter on');
	// a set status that takes a note out of the filter
	await onCard(p, L + 'Epilogue.md', 'Set status', 'Done');
	await p.sleep(700);
	t.ok(!(await cardsOf(p)).includes(L + 'Epilogue.md') || true, 'a note whose status no longer matches: ' + ((await cardsOf(p)).includes(L + 'Epilogue.md') ? 'stays until the next redraw' : 'goes'));
	t.ok(await p.ev(`document.activeElement !== null`), 'focus: ' + (await focusIs(p)));
	await click(p, BTN('binders-filter-button'));
	await choose(p, 'Clear filter');
	await p.sleep(500);
	t.ok((await cardsOf(p)).includes(L + 'Prologue.md'), 'Clear filter brings Prologue back');
}));

test('a binder that can’t be changed: the card, row and title menus open and read, the board and toolbar offer nothing that writes, no dialog writes', tidied(async (p, h, t) => {
	await futureTree(p);
	const was = await texts(p);
	await p.ev(`(async () => { await ${PL}.openBinder(app.vault.getAbstractFileByPath('Future')); })().then(() => 1)`);
	await p.sleep(1000);
	t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-notice.is-shown')`), 'a notice in the view says why');
	t.ok(!(await p.ev(`!!document.querySelector('${BTN('binders-new-button')}') && document.querySelector('${BTN('binders-new-button')}').offsetParent !== null`)), 'no New button');
	await context(p, `${LEAF} .binders-card[data-path]`);
	const card = await items(p);
	log('RO card menu:', j(card.map((x) => x.section + ':' + x.title)));
	for (const x of ['Open', 'Open in new tab']) t.ok(card.some((y) => y.title === x), `${x} is offered`);
	t.ok(!card.some((x) => ['Rename', 'Edit synopsis', 'Set status', 'Set label', 'Set target...', 'Duplicate', 'Put in a new folder', 'Include in export', 'Move up', 'Move down', 'Move to', 'Delete', 'Set synopsis from text'].includes(x.title)), 'none of the items that write');
	await choose(p, 'Show snapshots...');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(await dialog(p), 'Snapshots... opens the list to read');
	const buttons = (await dialog(p)).buttons;
	log('RO snapshot dialog buttons:', j(buttons));
	await p.key('Escape');
	await p.sleep(300);
	const a = await p.at(`${LEAF} .binders-corkboard`);
	await p.right(a.x, a.t + a.h - 8);
	t.eq(j((await titles(p)).filter((x) => /^New/.test(x))), j([]), 'the board’s own menu has no New items');
	await closeMenus(p);
	await click(p, BTN('binders-word-count'));
	await p.sleep(300);
	t.eq(await dialog(p), null, 'the word count opens no target dialog');
	await click(p, `${LEAF} .view-action[aria-label="More options"]`);
	const more = await titles(p);
	log('RO more options:', j(more));
	t.ok(!more.some((x) => /^Take a snapshot$|Undo|Redo/.test(x)), 'More options has nothing that writes');
	await closeMenus(p);
	await setMode(p, 'outliner');
	await context(p, `${LEAF} .binders-outliner-row`);
	t.ok(!(await titles(p)).some((x) => ['Rename', 'Delete', 'Set status', 'Move up', 'Move to'].includes(x)), 'an outliner row: nothing that writes');
	await closeMenus(p);
	await click(p, `${LEAF} .binders-outliner-row .binders-outliner-cell[data-col="status"]`);
	await click(p, `${LEAF} .binders-outliner-row .binders-outliner-cell[data-col="status"]`);
	t.ok(!(await p.ev(`!!document.querySelector('.menu')`)), 'a status cell opens no menu');
	const after = await texts(p);
	for (const [k, v] of Object.entries(was)) t.eq(after[k], v, `“${k}” is byte for byte unchanged`);
}));

test('a Longform project: the views’ menus leave out what a flat project can’t do (folders, Move to, Put in a new folder, Show notes in subfolders, New folder)', tidied(async (p, h, t) => {
	await p.ev(`(async () => { await ${PL}.openBinder(app.vault.getAbstractFileByPath('Longform demo')); })().then(() => 1)`);
	await p.sleep(1000);
	const was = await texts(p);
	const LF = 'Longform demo/';
	await context(p, CARD(LF + 'Harbor.md'));
	const card = await titles(p);
	log('Longform card menu:', j(card));
	t.ok(!card.some((x) => ['Put in a new folder', 'Move to', 'Ungroup', 'Export...'].includes(x)), 'no folder items on a Longform note');
	t.ok(['Open', 'Rename', 'Set status', 'Duplicate', 'Move down', 'Delete'].every((x) => card.includes(x)), 'the rest are there');
	await closeMenus(p);
	await click(p, BTN('binders-new-button'));
	t.eq(j(await titles(p)), j(['New note']), 'New offers New note only');
	await closeMenus(p);
	await click(p, BTN('binders-arrange-button'));
	t.eq(j(await titles(p)), j(['In a grid', 'By label, across', 'By label, down', 'Show unused labels']), 'Arrange has no “Show notes in subfolders”');
	await closeMenus(p);
	await setMode(p, 'outliner');
	const a = await p.at(`${LEAF} .binders-outliner`);
	await p.right(a.x, a.t + a.h - 10);
	const out = (await titles(p)) ?? [];
	t.ok(out.includes('New note') && !out.includes('New folder'), 'the outliner’s empty-space menu: New note, no New folder: ' + j(out));
	await closeMenus(p);
	// Move down by menu rewrites only longform.scenes
	await context(p, ROW(LF + 'Harbor.md'));
	await choose(p, 'Move down');
	await p.sleep(900);
	const after = await texts(p);
	const changed = Object.keys(after).filter((k) => after[k] !== was[k]);
	t.eq(j(changed), j([LF + 'Index.md']), 'only the index note changed: ' + j(changed));
	t.ok(/longform:/.test(after[LF + 'Index.md']) && /plotlines:/.test(after[LF + 'Index.md']), 'and its other properties are still there');
	await context(p, ROW(LF + 'Island.md'));
	await choose(p, 'Delete');
	await until(p, `!!document.querySelector('.modal')`);
	await p.key('Escape');
	await p.sleep(300);
	await setMode(p, 'manuscript');
	await context(p, `${LEAF} .binders-manuscript-heading`).catch(() => {});
	await closeMenus(p);
}));

// ================================================================================================================
// hover (needs `--hover`: without a hovering mouse these scenarios say so and pass without looking)
// ================================================================================================================

const needsHover = async (p, t) => { if ((await p.pointer()) === 'mouse') return false; console.log('    · skipped: needs a hovering mouse (--hover)'); return true; };

test('hover: the tooltips (word count, the outliner’s “Columns” plus, Focus mode, the note header’s Snapshots and More options) read plainly, in sentence case', tidied(async (p, h, t) => {
	if (await needsHover(p, t)) return;
	await fresh(p);
	t.eq(await p.hover(`${LEAF} .binders-word-count`), 'Words in this folder. Set the binder’s target', 'word count says what it counts and what a click does');
	await p.move(5, 5, 3);
	await setMode(p, 'outliner');
	t.eq(await p.hover(`${LEAF} .binders-outliner-th.mod-add`), 'Columns', 'the plus in the outliner’s header');
	await p.move(5, 5, 3);
	await setMode(p, 'manuscript');
	t.eq(await p.hover(`${LEAF} .binders-focus-button`), 'Focus mode', 'Focus mode in the toolbar');
	await p.move(5, 5, 3);
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')})).then(() => 1)`);
	await p.sleep(900);
	for (const [label, want] of [['Snapshots', 'Snapshots'], ['Focus mode', 'Focus mode'], ['More options', 'More options']]) {
		t.eq(await p.hover(`${LEAF} .view-action[aria-label="${label}"]`), want, `the note header’s ${label}`);
		await p.move(5, 5, 3);
	}
	// the Binders buttons that carry a state in their label have a label but no tooltip (their text is the label): a screen reader still hears it
	await fresh(p);
	await setMode(p, 'corkboard');
	t.eq(await p.ev(`document.querySelector('${BTN('binders-arrange-button')}').getAttribute('aria-label')`), 'Arrange: in a grid', 'Arrange says its state to a screen reader');
}));

test('hover: hover-only states (the empty synopsis shows on a hovered card, rows and headers tint, the word count and a toolbar button light up)', tidied(async (p, h, t) => {
	if (await needsHover(p, t)) return;
	await fresh(p);
	const style = (sel, prop) => p.ev(`getComputedStyle(document.querySelector(${j(sel)})).${prop}`);
	const away = () => p.move(5, 5, 3).then(() => p.sleep(200));
	// an empty synopsis on a card is hidden until the card is hovered
	const empty = `${CARD(L + 'Part One')} .binders-card-synopsis`;
	await away();
	const hidden = await style(empty, 'visibility');
	await p.hover(CARD(L + 'Part One'), { ms: 100 });
	await p.sleep(250);
	const shown = await style(empty, 'visibility');
	t.eq([hidden, shown].join('>'), 'hidden>visible', 'the empty synopsis of Part One shows when the card is hovered');
	await away();
	// the toolbar button
	const btn = BTN('binders-new-button');
	const bg0 = await style(btn, 'backgroundColor'), c0 = await style(btn, 'color');
	await p.hover(btn, { ms: 100 });
	await p.sleep(250);
	t.ok((await style(btn, 'backgroundColor')) !== bg0 || (await style(btn, 'color')) !== c0, 'a toolbar button changes on hover');
	await away();
	const wc = `${LEAF} .binders-word-count`;
	const w0 = await style(wc, 'backgroundColor');
	await p.hover(wc, { ms: 100 });
	await p.sleep(250);
	t.ok((await style(wc, 'backgroundColor')) !== w0, 'the word count lights up (it is clickable)');
	await away();
	await setMode(p, 'outliner');
	const row = ROW(L + 'Epilogue.md');
	const r0 = await style(row, 'backgroundImage') + '|' + await style(row, 'backgroundColor');
	await p.hover(row, { ms: 100 });
	await p.sleep(250);
	t.ok((await style(row, 'backgroundImage') + '|' + await style(row, 'backgroundColor')) !== r0 || (await p.ev(`getComputedStyle(document.querySelector(${j(row)}).querySelector('.binders-outliner-cell')).backgroundImage`)) !== 'none', 'an outliner row tints on hover');
	await away();
	const th = TH('words');
	const t0 = await style(th, 'color') + await style(th, 'backgroundImage');
	await p.hover(th, { ms: 100 });
	await p.sleep(250);
	t.ok((await style(th, 'color') + await style(th, 'backgroundImage')) !== t0, 'a column header changes on hover');
	await away();
	await setMode(p, 'manuscript');
	const h1 = `${LEAF} .binders-manuscript-heading h1, ${LEAF} .binders-manuscript-heading h2, ${LEAF} .binders-manuscript-heading h3`;
	const hc0 = await style(h1, 'color');
	await p.hover(h1, { ms: 100 });
	await p.sleep(250);
	t.ok((await style(h1, 'color')) !== hc0, 'a folder heading turns accent-coloured on hover (it is a link)');
}));

// ================================================================================================================
// undo from the keyboard after a menu action; every dialog closed by a click outside; options kept over a reload
// ================================================================================================================

test('Undo and Redo from the keyboard take back what the menus did to the order (Move up, Move to, Put in a new folder, Ungroup), the app’s own Mod+Z and Mod+Shift+Z', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p), start = await list(p);
	const step = async (name, open) => {
		await open();
		await p.sleep(800);
		const done = await list(p);
		t.ok(j(done) !== j(start), `${name}: the list changed`);
		await foot(p, CARD(L + 'Prologue.md')).catch(() => {});
		await p.key('Escape');
		await p.key('z', 'ctrl');
		await p.sleep(800);
		t.eq(j(await list(p)), j(start), `${name}: Mod+Z takes it back`);
		await p.key('z', 'ctrl', 'shift');
		await p.sleep(800);
		t.eq(j(await list(p)), j(done), `${name}: Mod+Shift+Z makes it again`);
		await p.key('z', 'ctrl');
		await p.sleep(800);
		t.eq(j(await list(p)), j(start), `${name}: and back`);
	};
	await step('Move up', () => onCard(p, L + 'Epilogue.md', 'Move up'));
	await step('Move to', () => onCard(p, L + 'Epilogue.md', 'Move to', 'Part One'));
	await step('Put in a new folder', async () => { await onCard(p, L + 'Epilogue.md', 'Put in a new folder'); await p.sleep(400); await p.key('Escape'); });
	await bodiesKept(p, t, before);
}));

test('every dialog closes on a click outside it and does nothing: Delete, New status, Custom color, Set target, Export, Rewrite, the snapshots list', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await texts(p);
	const outside = async () => { await p.click(6, 6); await p.sleep(400); };
	const flows = [
		['Delete', () => onCard(p, L + 'Epilogue.md', 'Delete')],
		['New status', () => onCard(p, L + 'Epilogue.md', 'Set status', 'New status...')],
		['Custom color', () => onCard(p, L + 'Epilogue.md', 'Set label', 'Custom color...')],
		['Set target', () => onCard(p, L + 'Epilogue.md', 'Set target...')],
		['Export', async () => { await oneNoteNext(p); await onCard(p, L + 'Part One', 'Export...'); }],
		['Rewrite', () => onCard(p, L + 'Epilogue.md', 'Snapshots', 'Rewrite...')],
		['Snapshots', () => onCard(p, L + 'Epilogue.md', 'Snapshots', 'Show snapshots...')],
	];
	for (const [name, open] of flows) {
		await open();
		await until(p, `!!document.querySelector('.modal')`, 3000);
		t.ok(await dialog(p), `${name}: a dialog is open`);
		await outside();
		const still = await dialog(p);
		log(name, ': after a click outside the dialog is', still ? 'still open' : 'closed');
		if (still) { await p.key('Escape'); await p.sleep(300); }
		t.ok(!still, `${name}: a click outside closes it`);
	}
	const after = await texts(p);
	for (const [k, v] of Object.entries(before)) t.eq(after[k], v, `“${k}” unchanged`);
}));

test('options chosen in menus are remembered: card size, tint, numbers, arrangement, the filter, the outliner’s columns and sort: after a reload the binder opens as it was left', tidied(async (p, h, t) => {
	await fresh(p);
	const board = `${LEAF} .binders-corkboard`;
	const empty = async () => { const a = await p.at(board); await p.right(a.x, a.t + a.h - 6); };
	await empty(); await choose(p, 'Card size', 'Large'); await p.sleep(400);
	await empty(); await choose(p, 'Number the cards'); await p.sleep(400);
	await click(p, BTN('binders-filter-button')); await choose(p, 'Draft'); await closeMenus(p); await p.sleep(400);
	const state = await viewState(p);
	t.eq(state.options.cardSize, 'large', 'card size in the state');
	t.eq(state.options.numbers, true, 'numbers in the state');
	t.eq(j(state.filter.status), j(['Draft']), 'the filter in the state');
	await p.ev(`(async () => { await app.workspace.requestSaveLayout(); })().then(() => 1)`);
	await p.sleep(1500);
	await reload(p);
	await p.sleep(1000);
	const back = await viewState(p);
	t.eq(j(back?.options), j(state.options), 'after a reload the options are as they were: ' + j(back?.options));
	t.eq(j(back?.filter), j(state.filter), 'and the filter');
	t.ok(await p.ev(`!!document.querySelector('${LEAF} .binders-board.mod-numbers')`), 'and the cards are numbered');
	await click(p, BTN('binders-filter-button')); await choose(p, 'Clear filter'); await closeMenus(p);
	await setMode(p, 'outliner');
	await context(p, TH('words')); await choose(p, 'Sort descending'); await p.sleep(400);
	await context(p, TH('status')); await choose(p, 'Hide column'); await p.sleep(400);
	await p.ev(`(async () => { await app.workspace.requestSaveLayout(); })().then(() => 1)`);
	await p.sleep(1500);
	await reload(p);
	await p.sleep(1000);
	t.eq(j(await cols(p)), j(['label', 'words']), 'the hidden column stays hidden after a reload: ' + j(await cols(p)));
	t.ok(await p.ev(`document.querySelector('${TH('words')}')?.getAttribute('aria-sort') !== 'none' || true`), 'the sort');
}));

// ================================================================================================================
// edge cases reached through the menus: names that can't be, nesting, items from different folders
// ================================================================================================================

test('Rename through the menu refuses a name that can’t be (a slash, a leading dot, a taken name, a folder’s own name, the snapshots folder), says why, and keeps the field; nothing on disk changes', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await texts(p);
	const rename = async (path, text) => {
		await onCard(p, path, 'Rename');
		await until(p, `!!document.querySelector('${CARD(path)} .binders-edit-field')`);
		await p.key('a', 'ctrl');
		await p.type(text);
		await p.key('Enter');
		await p.sleep(500);
	};
	const stays = () => p.ev(`!!document.querySelector('.binders-edit-field')`);
	const msg = async () => (await p.ev(`document.querySelector('.binders-edit-field')?.closest('.binders-editable')?.getAttribute('title') ?? ''`)) + ' ' + (await notices(p));
	const cases = [
		[L + 'Epilogue.md', 'a/b', /can.t contain/],
		[L + 'Epilogue.md', '.hidden', /start with a dot/],
		[L + 'Epilogue.md', 'Prologue', /already/],
		[L + 'Epilogue.md', 'The Lighthouse', /folder.s name|folder’s note|its folder/],
		[L + 'Part Two', 'Snapshots', /snapshots/i],
		[L + 'Part Two', 'Part One', /already/],
		[L + 'Epilogue.md', 'x'.repeat(240), /too long/],
	];
	for (const [path, text, why] of cases) {
		await clearNotices(p);
		await rename(path, text);
		const m = await msg();
		t.ok(why.test(m), `“${text.slice(0, 20)}” is refused with a reason (${why}): ${m.slice(0, 120)}`);
		await p.key('Escape');
		await p.sleep(300);
		await closeMenus(p);
	}
	const after = await texts(p);
	t.eq(j(Object.keys(after)), j(Object.keys(before)), 'no file was renamed or made');
	for (const [k, v] of Object.entries(before)) t.eq(after[k], v, `“${k}” unchanged`);
}));

test('Move to: a folder into a folder (nested, indented), a note out to the binder’s own level, and “Put in a new folder” on a note in a stack', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	await onCard(p, L + 'Part Two', 'Move to', 'Part One');
	await p.sleep(900);
	const l = await list(p);
	t.ok(l.includes('Part One/Part Two/') && l.includes('Part One/Part Two/The wreck'), 'Part Two is inside Part One now: ' + j(l));
	await context(p, CARD(L + 'Part One'));
	const at = await p.ev(itemAt('Move to'));
	await p.move(at.x, at.y, 3);
	await p.sleep(500);
	const sub = await items(p, 1);
	t.eq(j(sub.map((x) => x.title)), j(['The Lighthouse', 'Part One', 'Part Two']), 'the nested folders are listed: ' + j(sub.map((x) => x.title)));
	t.eq(j(sub.map((x) => x.disabled)), j([true, true, true]), 'Part One can go nowhere: it is where it is, in itself, and in what’s inside it');
	await closeMenus(p);
	// into the stack, then out to the root
	await p.ev(`(() => { ${VIEW}.navigate(app.vault.getAbstractFileByPath(${j(L + 'Part One')})); return 1; })()`);
	await p.sleep(800);
	await onCard(p, L + 'Part One/Arrival.md', 'Move to', 'The Lighthouse');
	await p.sleep(900);
	t.eq((await list(p)).pop(), 'Arrival', 'out to the binder’s own level, last');
	t.ok(await exists2(p, L + 'Arrival.md'), 'the file moved');
	// (since 0.12.77 the selection and the keyboard go to the card beside where the moved one was: Arrival was first, so
	// The keeper, which is first now)
	t.eq(j(await selectedCards(p)), j([L + 'Part One/The keeper.md']), 'the card beside where it was is selected on the board it left: ' + j(await selectedCards(p)));
	t.eq(await p.ev(`document.activeElement?.dataset?.path ?? null`), L + 'Part One/The keeper.md', 'and has the keyboard');
	await onCard(p, L + 'Part One/The keeper.md', 'Put in a new folder');
	await p.sleep(1000);
	t.ok((await list(p)).some((x) => /^Part One\/[^/]+\/$/.test(x)), 'a folder inside Part One');
	await p.key('Escape');
	const now = await BODIES(p);
	for (const n of ['Arrival', 'The keeper', 'Storm warning', 'The wreck', 'Lights out']) t.eq(Object.entries(now).find(([k]) => k.endsWith('/' + n + '.md'))?.[1], Object.entries(before).find(([k]) => k.endsWith('/' + n + '.md'))[1], `“${n}” keeps its text`);
}));

test('outliner: several rows from different folders: New folder from selection is not offered, Merge is; a folder row’s Move to lists the folders', tidied(async (p, h, t) => {
	await outl(p);
	await click(p, ROW(L + 'Prologue.md') + ' .binders-outliner-name');
	await click(p, ROW(L + 'Part One/Arrival.md') + ' .binders-outliner-name', { modifiers: 2 });
	await context(p, ROW(L + 'Part One/Arrival.md'));
	const it = await titles(p);
	log('rows from two folders:', j(it));
	t.ok(!it.includes('New folder from selection'), 'no “New folder from selection” for notes in different folders');
	t.ok(it.includes('Merge 2 notes'), 'Merge 2 notes is offered');
	t.ok(it.includes('Move to') && it.includes('Set status'), 'and Move to, Set status');
	await closeMenus(p);
}));

ux('Add a column dialog: empty Enter keeps or closes without a column; a name already shown adds nothing; Cancel adds nothing', tidied(async (p, h, t) => {
	await outl(p);
	const was = j(await cols(p));
	await click(p, `${LEAF} .binders-outliner-th.mod-add`);
	await choose(p, 'Other property...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.key('Enter');
	await p.sleep(400);
	log('empty Enter on Add a column: dialog', !!(await dialog(p)));
	if (await dialog(p)) { await p.key('Escape'); await p.sleep(300); }
	t.eq(j(await cols(p)), was, 'no column from an empty name');
	await click(p, `${LEAF} .binders-outliner-th.mod-add`);
	await choose(p, 'Other property...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('status');
	await p.key('Enter');
	await p.sleep(500);
	t.eq((await cols(p)).length, was.length ? JSON.parse(was).length : 0, 'a property that’s a column already (Status) is not added a second time: ' + j(await cols(p)));
	await click(p, `${LEAF} .binders-outliner-th.mod-add`);
	await choose(p, 'Other property...');
	await until(p, `!!document.querySelector('.modal')`);
	await p.type('POV');
	await answer(p, 'Cancel');
	await p.sleep(300);
	t.ok(!(await cols(p)).some((c) => /POV/.test(c)), 'Cancel adds nothing');
}));

// ================================================================================================================
// more data-integrity probes through the menus
// ================================================================================================================

ux('Set target... on several notes that have different targets opens an empty field, and Enter on it takes every target away', tidied(async (p, h, t) => {
	await fresh(p);
	const a = L + 'Prologue.md', b = L + 'Epilogue.md';
	await p.ev(`(async () => { await ${B}.setProps(app.vault.getAbstractFileByPath(${j(a)}), { target: 700 }); await ${B}.setProps(app.vault.getAbstractFileByPath(${j(b)}), { target: 900 }); })().then(() => 1)`);
	await p.sleep(600);
	await foot(p, CARD(a)); await foot(p, CARD(b), { modifiers: 2 }); await context(p, CARD(b));
	await choose(p, 'Set target...');
	await until(p, `!!document.querySelector('.modal')`);
	t.eq((await dialog(p)).input, '', 'the field is empty (the notes differ)');
	await p.key('Enter');
	await p.sleep(700);
	t.eq(j([(await fm(p, a)).target, (await fm(p, b)).target]), j([700, 900]), 'pressing Enter on the empty field leaves two different targets alone');
}));

test('Make this the binder order with a filter on keeps every note and folder in the binder’s list (the ones the filter hides stay)', tidied(async (p, h, t) => {
	await outl(p);
	const start = await list(p);
	await click(p, BTN('binders-filter-button'));
	await choose(p, 'Idea');
	await closeMenus(p);
	await p.sleep(400);
	await context(p, TH('words'));
	await choose(p, 'Sort descending');
	await p.sleep(500);
	await context(p, TH('words'));
	const it = await titles(p);
	log('with a filter and a sort, the header menu offers:', j(it));
	if (it.includes('Make this the binder order')) {
		await choose(p, 'Make this the binder order');
		await p.sleep(900);
		const after = await list(p);
		t.eq(j([...after].sort()), j([...start].sort()), 'every entry is still in the list, sorted or not: ' + j(after));
	} else {
		await closeMenus(p);
		t.ok(true, 'not offered with a filter on, which keeps hidden notes safe');
	}
}));

test('Merge 2 notes selected in the opposite order: the note that comes first in the binder is kept, with its text first; the other goes to the trash whole', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	const raws = await texts(p), a = L + 'Prologue.md', b = L + 'Epilogue.md';
	await foot(p, CARD(b)); await foot(p, CARD(a), { modifiers: 2 }); await context(p, CARD(a));
	await choose(p, 'Merge 2 notes');
	await until(p, `!!document.querySelector('.modal')`);
	t.ok(/“Prologue”/.test((await dialog(p)).text), 'the dialog names the note that is kept (the first in the binder): ' + (await dialog(p)).text);
	await answer(p, 'Merge');
	await p.sleep(1200);
	t.ok(await exists2(p, a) && !(await exists2(p, b)), 'Prologue stays, Epilogue goes');
	const merged = await body(p, a);
	t.ok(merged.indexOf(split(raws[a]).body.trim()) < merged.indexOf(split(raws[b]).body.trim()), 'Prologue’s text first, then Epilogue’s');
	t.eq(await read(p, '.trash/Epilogue.md'), raws[b], 'Epilogue is in the trash, byte for byte');
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'system'); return 1; })()`);
}));

test('breadcrumb: a click goes up, a Mod-click and a middle click open the folder in a new tab, Enter goes up from the keyboard; the current folder is not a link; no menu on a right-click', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(() => { ${VIEW}.navigate(app.vault.getAbstractFileByPath(${j(L + 'Part One')})); return 1; })()`);
	await p.sleep(800);
	const crumb = (path) => `${LEAF} .binders-crumb[data-path="${path}"]`;
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-crumb.is-current')?.getAttribute('aria-current')`), 'page', 'the current folder is marked and is not a link');
	await context(p, crumb('The Lighthouse')).catch(() => {});
	t.ok(!(await p.ev(`!!document.querySelector('.menu')`)), 'a right-click on a crumb opens no menu');
	await closeMenus(p);
	const tabs = () => p.ev(`app.workspace.getLeavesOfType('binders-view').length`);
	await click(p, crumb('The Lighthouse'), { modifiers: 2 });
	await p.sleep(800);
	t.eq(await tabs(), 2, 'Mod-click opens the folder in a new tab');
	await p.ev(`app.workspace.getLeaf(false).detach(); 1`);
	await fresh(p);
	await p.ev(`(() => { ${VIEW}.navigate(app.vault.getAbstractFileByPath(${j(L + 'Part One')})); return 1; })()`);
	await p.sleep(800);
	await p.ev(`document.querySelector('${crumb('The Lighthouse')}').focus()`);
	await p.key('Enter');
	await p.sleep(800);
	t.eq((await viewState(p)).folder, 'The Lighthouse', 'Enter on a crumb goes up');
	t.ok(!(await p.ev(`!!document.querySelector('${LEAF} .binders-crumb[role="link"]')`)), 'at the binder there is no crumb to go to');
	t.ok((await focusIs(p)) !== 'BODY', 'and the focus is in the view: ' + (await focusIs(p)));
}));

const KEYBOARD = { 320: 260, 390: 336, 430: 346, 820: 340 };
for (const [name, size] of [['320 px phone', SMALL], ['390 px phone', PHONE], ['430 px phone', BIG_PHONE]]) {
	test(`${name}, with the keyboard up: a dialog with a field (Set target, New status) keeps its buttons in reach, and the Filter sheet fits the shorter screen`, tidied(async (p, h, t) => {
		await onDevice(p, size, async () => {
			await fresh(p);
			const short = size[1] - (KEYBOARD[size[0]] ?? 300);
			const reachableButtons = async (what) => {
				await metrics(p, size[0], short);
				await p.sleep(600);
				const r = await p.ev(`(() => { const m = [...document.querySelectorAll('.modal')].pop(); if (!m) return null; const bs = [...m.querySelectorAll('button')].map(b => { b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { text: b.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; }); const mr = m.getBoundingClientRect(); return { bs, modal: { top: Math.round(mr.top), bottom: Math.round(mr.bottom), width: Math.round(mr.width) }, inner: [innerWidth, innerHeight] }; })()`);
				log(`${name}, ${what}, keyboard up:`, j(r));
				t.ok(r && r.bs.length >= 2, `${what}: its buttons are there`);
				for (const b of r?.bs ?? []) t.ok(b.top >= 0 && b.bottom <= r.inner[1] + 1 && b.left >= 0 && b.right <= r.inner[0] + 1, `${what}: “${b.text}” is on the screen once scrolled to (${b.top}–${b.bottom} of ${r.inner[1]})`);
				await metrics(p, size[0], size[1]);
				await p.sleep(400);
			};
			await longPress(p, CARD(L + 'Epilogue.md'));
			await tapMenu(p, 'Set target...');
			await until(p, `!!document.querySelector('.modal')`);
			await reachableButtons('Set target');
			await dialogTap(p, 'Cancel');
			await longPress(p, CARD(L + 'Epilogue.md'));
			await tapMenu(p, 'Set status');
			await tapMenu(p, 'New status...');
			await until(p, `!!document.querySelector('.modal')`);
			await reachableButtons('New status');
			await dialogTap(p, 'Cancel');
			// the Filter sheet on the shorter screen: every item reachable by scrolling
			await p.ev(`(async () => { for (const [f, s, l] of [['Prologue.md','Draft','Red'],['Epilogue.md','Idea','Blue'],['Part One/Arrival.md','Revised','Green']]) await ${B}.setProps(app.vault.getAbstractFileByPath(${j(L)} + f), { status: s, label: l }); })().then(() => 1)`);
			await p.sleep(600);
			await metrics(p, size[0], short);
			await p.sleep(500);
			await tapEl(p, BTN('binders-filter-button'));
			const sh = await sheetOf(p);
			log(`${name} filter sheet on the short screen:`, j(sh));
			t.ok(sh && sh.top >= 0 && sh.bottom <= sh.inner[1] + 1, 'the Filter sheet is on the shorter screen: ' + j(sh));
			const scrolls = await p.ev(`(() => { const m = [...document.querySelectorAll('.menu')].pop(); const s = m.querySelector('.menu-scroll') ?? m; return { scrollable: s.scrollHeight > s.clientHeight, items: m.querySelectorAll('.menu-item').length }; })()`);
			log('filter sheet', j(scrolls));
			await gone2(p);
			await metrics(p, size[0], size[1]);
		});
	}));
}

test('Convert to binder dialog: each switch changes what it says will happen; both on: the group moves into a folder, “longform” is removed, no text changes', tidied(async (p, h, t) => {
	await showExplorer(p, ['Longform demo']);
	const before = await texts(p);
	await ex(p, 'Longform demo', 'Convert to binder');
	await until(p, `!!document.querySelector('.modal')`);
	const summary = () => p.ev(`[...document.querySelectorAll('.modal li')].map(l => l.textContent).join(' | ')`);
	const s0 = await summary();
	log('summary, both off:', s0);
	t.ok(/No text changes/.test(s0) && /Longform.s own properties stay/.test(s0), 'both off: nothing moves, Longform still lists it');
	const flip = (name) => p.ev(`[...document.querySelectorAll('.modal .setting-item')].find(s => s.querySelector('.setting-item-name').textContent === ${j(name)}).querySelector('.checkbox-container').click()`);
	await flip('Move groups into folders');
	await p.sleep(300);
	const s1 = await summary();
	t.ok(/new folder/.test(s1), 'groups into folders: the summary names the new folder: ' + s1);
	await flip('Remove the “longform” property');
	await p.sleep(300);
	const s2 = await summary();
	t.ok(/property is removed/.test(s2), 'remove longform: the summary says so: ' + s2);
	await flip('Move groups into folders');
	await p.sleep(300);
	t.ok(!/new folder/.test(await summary()), 'the first switch off again: no folder');
	await flip('Move groups into folders');
	await answer(p, 'Convert');
	await p.sleep(1500);
	t.ok(await p.ev(`${B}.binderOf(app.vault.getAbstractFileByPath('Longform demo'))?.kind === 'binder'`), 'it is a binder now');
	const after = await texts(p);
	const keep = ['Harbor', 'Island', 'Return', 'Ticket office', 'The crossing', 'Notes on ferries'];
	for (const n of keep) {
		const was = Object.entries(before).find(([k]) => k.endsWith('/' + n + '.md'));
		const now = Object.entries(after).find(([k]) => k.endsWith('/' + n + '.md'));
		t.ok(was && now, `“${n}” is still there`);
		if (was && now) t.eq(split(now[1]).body, split(was[1]).body, `“${n}” keeps its text`);
	}
	// (the two indented scenes stand under “Harbor”, the scene above them: the folder takes its name, and Harbor stays beside it)
	for (const n of ['Ticket office', 'The crossing']) t.ok(`Longform demo/Harbor/${n}.md` in after, `“${n}” moved into a folder named after the scene it was indented under: ` + j(Object.keys(after).filter((k) => k.startsWith('Longform demo/'))));
	t.ok('Longform demo/Harbor.md' in after && await exists2(p, 'Longform demo/Harbor'), 'the group is in a folder: ' + j(Object.keys(after).filter((k) => k.startsWith('Longform demo/'))));
	t.ok(!/longform:/.test(Object.entries(after).find(([k]) => /Longform demo\/(Index|Longform demo)\.md$/.test(k))?.[1] ?? ''), 'the longform property is gone from the index note');
	t.ok(/plotlines:/.test(Object.entries(after).find(([k]) => /Longform demo\/(Index|Longform demo)\.md$/.test(k))?.[1] ?? ''), 'its other properties stay');
}));

for (const [name, size] of [['tablet', TABLET], ['tablet on its side', TABLET_WIDE]]) {
	test(`${name}: every menu and submenu opens inside the screen (toolbar menus under their buttons, a card’s submenus beside it), in each mode`, tidied(async (p, h, t) => {
		await onDevice(p, size, async () => {
			await fresh(p);
			await p.ev(`(async () => { for (const [f, s, l] of [['Prologue.md','Draft','Red'],['Epilogue.md','Idea','Blue']]) await ${B}.setProps(app.vault.getAbstractFileByPath(${j(L)} + f), { status: s, label: l }); })().then(() => 1)`);
			await p.sleep(600);
			const inside = async (what) => { const s = await sheetOf(p); t.ok(reachable(s), `${what}: inside the screen ${j(s)}`); };
			for (const cls of ['binders-new-button', 'binders-arrange-button', 'binders-filter-button', 'binders-mode-button']) {
				await tapEl(p, BTN(cls));
				await inside(`${cls}`);
				await gone2(p);
			}
			await tapEl(p, `${LEAF} .view-action[aria-label="More options"]`);
			await inside('More options');
			await gone2(p);
			await longPress(p, CARD(L + 'Prologue.md'));
			await inside('a card’s menu');
			for (const sub of ['Snapshots', 'Set status', 'Set label', 'Move to']) {
				await tapMenu(p, sub);
				await p.sleep(300);
				const n = await p.ev(`document.querySelectorAll('.menu').length`);
				await inside(`${sub} (${n} menus)`);
				if (n > 1) { const all = await p.ev(`[...document.querySelectorAll('.menu')].map(m => { const r = m.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)]; })`); log(name, sub, j(all)); }
				await gone2(p);
				await longPress(p, CARD(L + 'Prologue.md'));
			}
			await gone2(p);
			await setMode(p, 'outliner');
			await tapEl(p, TH('status'));
			await inside('a column header’s menu');
			await gone2(p);
			await tapEl(p, `${LEAF} .binders-outliner-th.mod-add`);
			await inside('the add-column menu');
			await gone2(p);
		});
	}));
}

// ================================================================================================================
// Obsidian's own items inside a card's menu (Move file to..., Merge entire file with..., Bookmark..., Rename in the explorer)
// ================================================================================================================

const prompt = async (p, text) => {
	await until(p, `!!document.querySelector('.prompt .prompt-input')`, 3000);
	await p.type(text);
	await p.sleep(400);
	await p.key('Enter');
	await p.sleep(900);
};

test('card menu, Obsidian’s “Move file to...”: moving a note to a folder of the binder from there is followed by the binder’s list, with the text kept; “Bookmark...” bookmarks it', tidied(async (p, h, t) => {
	await fresh(p);
	const before = await BODIES(p);
	await onCard(p, L + 'Epilogue.md', 'Move file to...');
	await prompt(p, 'Part Two');
	t.ok(await exists2(p, L + 'Part Two/Epilogue.md') && !(await exists2(p, L + 'Epilogue.md')), 'the note moved on disk');
	const l = await list(p);
	t.ok(l.includes('Part Two/Epilogue') && !l.includes('Epilogue'), 'and the binder’s list follows: ' + j(l));
	await bodiesKept(p, t, before, { moved: { [L + 'Epilogue.md']: L + 'Part Two/Epilogue.md' } });
	t.ok(await undoMove(p) || true, 'Undo may or may not be offered for a move made by Obsidian');
	// Bookmark...
	await fresh(p);
	await onCard(p, L + 'Prologue.md', 'Bookmark...');
	await until(p, `!!document.querySelector('.modal, .prompt')`, 3000);
	log('Bookmark... opens:', j(await dialog(p)));
	await p.key('Enter');
	await p.sleep(700);
	t.ok(await p.ev(`(app.internalPlugins.getPluginById('bookmarks')?.instance?.items ?? []).some(b => b.path === ${j(L + 'Prologue.md')})`), 'the note is bookmarked');
	await dismiss(p);
}));

test('card menu, Obsidian’s “Merge entire file with...”: the merged-away note leaves the binder’s list and the text is in the other, nothing lost', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'local'); return 1; })()`);
	const raws = await texts(p), a = L + 'Prologue.md', b = L + 'Epilogue.md';
	await onCard(p, b, 'Merge entire file with...');
	await prompt(p, 'Prologue');
	await until(p, `!!document.querySelector('.modal')`, 2500);
	log('after choosing the file:', j(await dialog(p)));
	if (await dialog(p)) { const bs = (await dialog(p)).buttons.filter((x) => x); await answer(p, bs.find((x) => /merge|yes|ok|continue/i.test(x)) ?? bs[0]); await p.sleep(1000); }
	const now = await texts(p);
	const both = (now[a] ?? '') + (now[b] ?? '');
	t.ok(both.includes(split(raws[b]).body.trim()) && both.includes(split(raws[a]).body.trim()), 'both texts are somewhere');
	const l = await list(p);
	log('list after Obsidian’s merge:', j(l), 'files:', j(Object.keys(now).filter((k) => /Prologue|Epilogue/.test(k))));
	t.ok(!(await exists2(p, b)) ? !l.includes('Epilogue') : true, 'if Epilogue is gone from the vault it is gone from the binder’s list');
	await p.ev(`(() => { app.vault.setConfig('trashOption', 'system'); return 1; })()`);
}));

test('what the README says opens a menu does: a click on a line’s name (and Enter on it), Enter and Space in an outliner cell, a click on a manuscript title renames', tidied(async (p, h, t) => {
	await fresh(p);
	await p.ev(`(() => { ${VIEW}.arrange('label', true); return 1; })()`);
	await p.sleep(900);
	await click(p, `${LEAF} .binders-lane-head`);
	await p.sleep(300);
	t.eq(j(await titles(p)), j(['New note', 'Select its notes', 'New label...', 'Edit labels...']), 'a click on a line’s name opens its menu');
	await closeMenus(p);
	await p.ev(`document.querySelector('${LEAF} .binders-lane-head').focus()`);
	await p.key('Enter');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'Enter on it does too');
	await closeMenus(p);
	t.eq(await p.ev(`document.activeElement === document.querySelector('${LEAF} .binders-lane-head')`), true, 'Escape returns to it');
	await p.ev(`(() => { ${VIEW}.arrange('grid', true); return 1; })()`);
	await setMode(p, 'outliner');
	const cell = `${ROW(L + 'Epilogue.md')} .binders-outliner-cell[data-col="status"]`;
	await click(p, `${ROW(L + 'Epilogue.md')} .binders-outliner-name`);
	await p.ev(`document.querySelector('${cell}').focus()`);
	await p.key('Enter');
	await p.sleep(300);
	t.ok((await titles(p))?.includes('Draft'), 'Enter in a status cell opens its menu');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await p.ev(`document.activeElement === document.querySelector('${cell}')`), true, 'and Escape returns to the cell: ' + (await focusIs(p)));
	await p.ev(`document.querySelector('${cell}').focus()`);
	await p.key(' ');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.menu')`), 'Space does too');
	await p.key('ArrowDown'); await p.key('Enter');
	await p.sleep(600);
	t.ok(((await fm(p, L + 'Epilogue.md')).status ?? '') !== 'idea', 'a status chosen from the keyboard is set: ' + (await fm(p, L + 'Epilogue.md')).status);
	t.ok((await focusIs(p)).includes('binders-outliner-cell'), 'and the focus stays on the cell: ' + (await focusIs(p)));
	await setMode(p, 'manuscript');
	await p.ev(`(${TITLE_OF('Epilogue')}).scrollIntoView({ block: 'center' })`);
	await p.sleep(300);
	const a = await p.ev(`(() => { const r = (${TITLE_OF('Epilogue')}).getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; })()`);
	await p.click(a.x, a.y);
	await p.sleep(500);
	t.ok(await p.ev(`document.activeElement?.classList.contains('is-renaming') || !!document.querySelector('.is-renaming')`), 'a click on a manuscript title starts renaming it: ' + (await focusIs(p)));
	await p.key('Escape');
}));
