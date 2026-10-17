// A binder's own labels and statuses (src/binder-lists.ts, src/view/binder-lists-page.ts; GitHub #33): chosen on the Labels
// and Statuses pages of Binder settings, kept in the binder note (`labels`, `statuses`), used by that binder's notes
// and no other's. Every test that writes reads the files back: only the binder note's own property changes, and notes
// are never changed by choosing a list.
import { B, NOTE, PL, VIEW, answer, card, closeMenus, file, hoverMenu, j, menuItems, openView, read, same, split, texts, until, withTidy } from './view-helpers.mjs';
import { D, close, fm, mk, moreOptions, openDialog, showPage, typeIn } from './specs-binder-settings.mjs';
import { PHONE, onDevice } from './specs-qa5-manuscript.mjs';

export const specs = [];
const SECOND = 'Second/Second.md';
const test = (name, fn) => specs.push({ name: 'binder labels: ' + name, tier: 'guard', fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { await closeMenus(p); await close(p); } }) });
const wait = async (p, expr, ms = 4000) => { if (!(await until(p, expr, ms))) throw new Error('never became true: ' + expr.slice(0, 200)); };
const SOURCE = `${D} [data-binders-key="labels-source"]`, SSOURCE = `${D} [data-binders-key="statuses-source"]`;
const choose = async (p, sel, v) => { await p.ev(`(() => { const s = document.querySelector(${j(sel)}); s.value = ${j(v)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`); await p.sleep(400); };
const own = (p, path = NOTE) => fm(p, path).then((x) => x?.labels ?? null);
const label = (p, path, value) => p.ev(`app.fileManager.processFrontMatter(${file(path)}, (f) => { f.label = ${j(value)}; }).then(() => 1)`);
const setup = (p) => mk(p, { [SECOND]: '---\nbinder: 1\ncontents:\n  - S1\n---\n', 'Second/S1.md': '---\nlabel: Red\n---\nsecond binder' });
const names = (p, kind = 'label') => p.ev(`[...document.querySelectorAll('${D} .binders-bset-${kind === 'label' ? 'labels' : 'statuses'} .binders-bset-${kind} input[type="text"]')].map((i) => i.value)`);

test('choosing “This binder’s own” copies the vault’s labels into the binder note; nothing else changes; another binder keeps the vault’s; choosing the vault’s again (the lists being the same) takes the property away', async (p, h, t) => {
	await setup(p);
	const before = await texts(p);
	await openDialog(p, 'labels');
	t.eq(await p.ev(`document.querySelector(${j(SOURCE)}).value`), 'vault', 'it starts on the vault’s labels');
	t.eq(j(await p.ev(`[...document.querySelectorAll('${D} .binders-bset-row.mod-vault .binders-bset-row-name')].map((e) => e.textContent)`)), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']), 'which are shown, with nothing to change');
	t.ok(await p.ev(`!!document.querySelector('${D} [data-binders-key="edit-vault-labels"]')`), 'with a way to edit the vault’s labels');
	await choose(p, SOURCE, 'own');
	await wait(p, `Array.isArray(app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels)`);
	t.eq(j((await own(p)).map((x) => Object.keys(x)[0])), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']), 'the vault’s eight are the start');
	t.eq(j((await own(p))[0]), j({ Red: 'red' }), 'one `- Red: red` each');
	t.ok(!(await fm(p)).statuses, 'statuses are not written');
	t.eq(j(await names(p)), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']), 'and are editable rows now');
	const now = await texts(p);
	t.eq(split(now[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is as it was');
	for (const k of Object.keys(before)) if (k !== NOTE) t.eq(now[k], before[k], `${k} is as it was`);
	t.eq(await p.ev(`${B}.labelsOf(${file(SECOND)}).length`), 8, 'another binder still has the vault’s');
	t.eq(j(await p.ev(`${PL}.settings.labels.map((l) => l.name)`)), j(['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink']), 'and the vault’s list is as it was');
	// the same as the vault's: back without asking
	await choose(p, SOURCE, 'vault');
	await wait(p, `!app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels`);
	t.eq(await read(p, NOTE), before[NOTE], 'the binder note is byte for byte what it was');
});

test('a binder’s own list is edited as it is kept: a label added, recolored, moved, removed; it is used by that binder’s notes only (their dots, the file explorer’s color), and the vault’s list and other binders are untouched', async (p, h, t) => {
	await setup(p);
	await label(p, NOTE.replace('The Lighthouse.md', 'Prologue.md'), 'Mara');
	await label(p, 'Second/S1.md', 'Mara');
	const prologue = await read(p, NOTE.replace('The Lighthouse.md', 'Prologue.md'));
	await openDialog(p, 'labels');
	await choose(p, SOURCE, 'own');
	await wait(p, `!!document.querySelector('${D} [data-binders-key="add-label"]')`);
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="add-label"]').click(); return 1; })()`);
	await wait(p, `document.querySelectorAll('${D} .binders-bset-labels .binders-bset-label').length === 9`);
	await typeIn(p, `${D} [data-binders-key="name-8"]`, 'Mara');
	await p.ev(`(() => { const s = document.querySelector('${D} [data-binders-key="color-8"]'); s.value = 'purple'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	await wait(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels?.length === 9 && app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels?.[8]?.Mara === 'purple'`);
	t.eq(j((await own(p))[8]), j({ Mara: 'purple' }), 'the new label is kept with its color');
	const lh = NOTE.replace('The Lighthouse.md', 'Prologue.md');
	t.eq(await p.ev(`${B}.labelColor(${file(lh)})`), 'var(--color-purple)', 'a note of this binder with that label has its color (the explorer’s dot)');
	t.eq(await p.ev(`${B}.labelColor(${file('Second/S1.md')})`), 'var(--text-faint)', 'the same label in another binder has none of it');
	t.ok(!(await p.ev(`${PL}.settings.labels.some((l) => l.name === 'Mara')`)), 'and the vault’s list is as it was');
	// moved: Orange above Red, by the row's menu
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="grip-1"]').click(); return 1; })()`);
	await wait(p, `!!document.querySelector('.menu')`);
	await p.ev(`(() => { [...document.querySelectorAll('.menu .menu-item')].find((e) => e.textContent === 'Move up').click(); return 1; })()`);
	await wait(p, `Object.keys(app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels?.[0] ?? {})[0] === 'Orange'`);
	t.eq(j((await own(p)).slice(0, 2).map((x) => Object.keys(x)[0])), j(['Orange', 'Red']), 'a label moved up is first');
	t.eq(await p.ev(`${B}.labelsOf(${file(lh)})[0].name`), 'Orange', 'and the binder’s notes read the list in that order');
	// removed
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="remove-8"]').click(); return 1; })()`);
	await wait(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels?.length === 8`);
	t.eq(await read(p, lh), prologue, 'a note is not changed by removing its label from the list: it keeps the label it has, as written');
});

test('renaming a label in the binder’s list offers to rename it in this binder’s notes only, as one step of Undo; “Keep” leaves the notes', async (p, h, t) => {
	await setup(p);
	const a = NOTE.replace('The Lighthouse.md', 'Prologue.md'), b = NOTE.replace('The Lighthouse.md', 'Epilogue.md');
	await label(p, a, 'Red');
	await label(p, b, 'Red');
	await label(p, 'Second/S1.md', 'Red');
	await openDialog(p, 'labels');
	await choose(p, SOURCE, 'own');
	await wait(p, `!!document.querySelector('${D} [data-binders-key="name-0"]')`);
	await typeIn(p, `${D} [data-binders-key="name-0"]`, 'Mara');
	t.ok(await answer(p, 'Change them'), 'it asks, and says how many notes of this binder have it');
	await wait(p, `app.metadataCache.getFileCache(${file(a)})?.frontmatter?.label === 'Mara'`);
	t.eq(j([(await fm(p, a)).label, (await fm(p, b)).label, (await fm(p, 'Second/S1.md')).label]), j(['Mara', 'Mara', 'Red']), 'both notes of this binder take the new name, the other binder’s note does not');
	t.eq(j(Object.keys((await own(p))[0])), j(['Mara']), 'the list has it');
	// Undo takes the notes back in one step
	await p.ev(`${B}.undo(${j(NOTE)}).then(() => 1)`);
	await wait(p, `app.metadataCache.getFileCache(${file(a)})?.frontmatter?.label === 'Red'`);
	t.eq(j([(await fm(p, a)).label, (await fm(p, b)).label]), j(['Red', 'Red']), 'Undo puts both notes back at once');
	// declined: the notes keep the old name
	await label(p, a, 'Mara');
	await wait(p, `app.metadataCache.getFileCache(${file(a)})?.frontmatter?.label === 'Mara'`);
	await typeIn(p, `${D} [data-binders-key="name-0"]`, 'Rose');
	t.ok(await answer(p, 'Cancel'), 'asked again, and declined');
	await p.sleep(400);
	t.eq(await p.ev(`${B}.labelsOf(${file(a)})[0].name`), 'Rose', 'the list has the new name all the same');
	t.eq((await fm(p, a)).label, 'Mara', 'and the note keeps the old one');
});

test('choosing the vault’s labels again, when the binder’s own differ, asks first; Cancel keeps the own list; confirming takes the property away and changes no note', async (p, h, t) => {
	await setup(p);
	const before = await texts(p);
	await openDialog(p, 'labels');
	await choose(p, SOURCE, 'own');
	await wait(p, `!!document.querySelector('${D} [data-binders-key="add-label"]')`);
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="add-label"]').click(); return 1; })()`);
	await wait(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels?.length === 9`);
	await choose(p, SOURCE, 'vault');
	t.ok(await answer(p, 'Cancel'), 'it asks');
	await p.sleep(400);
	t.eq((await own(p)).length, 9, 'Cancel keeps the own list');
	t.eq(await p.ev(`document.querySelector(${j(SOURCE)}).value`), 'own', 'and the choice shows it');
	await choose(p, SOURCE, 'vault');
	t.ok(await answer(p, 'Use the vault’s'), 'confirmed');
	await wait(p, `!app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels`);
	t.eq(await read(p, NOTE), before[NOTE], 'the property is gone, and the note is as it was');
	const now = await texts(p);
	for (const k of Object.keys(before)) t.eq(now[k], before[k], `${k} is as it was`);
});

test('statuses: the binder’s own list is a list of names in the binder note; a status menu offers them in that order; the vault’s are untouched', async (p, h, t) => {
	await setup(p);
	await openDialog(p, 'statuses');
	await choose(p, SSOURCE, 'own');
	await wait(p, `Array.isArray(app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.statuses)`);
	t.eq(j((await fm(p)).statuses), j(['Idea', 'Draft', 'Revised', 'Done']), 'the vault’s statuses are the start');
	t.ok(!(await fm(p)).labels, 'no labels are written');
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="remove-3"]').click(); return 1; })()`);
	await wait(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.statuses?.length === 3`);
	await p.ev(`(() => { document.querySelector('${D} [data-binders-key="add-status"]').click(); return 1; })()`);
	await wait(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.statuses?.length === 4`);
	await typeIn(p, `${D} [data-binders-key="name-3"]`, 'Polished');
	await wait(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.statuses?.[3] === 'Polished'`);
	t.eq(j(await p.ev(`${B}.statusesOf(${file(NOTE.replace('The Lighthouse.md', 'Prologue.md'))})`)), j(['Idea', 'Draft', 'Revised', 'Polished']), 'this binder’s notes use it');
	t.eq(j(await p.ev(`${B}.statusesOf(${file(SECOND)})`)), j(['Idea', 'Draft', 'Revised', 'Done']), 'another binder uses the vault’s');
	t.eq(j(await p.ev(`${PL}.settings.statuses`)), j(['Idea', 'Draft', 'Revised', 'Done']), 'and the vault’s list is as it was');
	// the menu that sets a status
	await close(p);
	await openView(p, 'The Lighthouse');
	const c = await p.at(card('The Lighthouse/Prologue.md'));
	await p.ev(`(() => { const e = document.querySelector(${j(card('The Lighthouse/Prologue.md'))}); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${c.x}, clientY: ${c.y}, button: 2 })); return 1; })()`);
	await p.sleep(500);
	await hoverMenu(p, 'Set status');
	const items = await menuItems(p);
	t.ok(items.includes('Polished') && !items.includes('Done'), 'the status menu offers this binder’s list: ' + j(items));
});

test('an empty own list means none at all; a list written by hand as `{name, color}` is read', async (p, h, t) => {
	await setup(p);
	await p.ev(`app.fileManager.processFrontMatter(${file(NOTE)}, (f) => { f.labels = [{ name: 'Ilse', color: 'green' }]; f.statuses = []; }).then(() => 1)`);
	await wait(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.statuses?.length === 0`);
	t.eq(j(await p.ev(`${B}.labelsOf(${file(NOTE)})`)), j([{ name: 'Ilse', color: 'green' }]), 'the `{name, color}` spelling is read');
	t.eq(j(await p.ev(`${B}.statusesOf(${file(NOTE)})`)), '[]', 'an empty list: no statuses');
	await openDialog(p, 'statuses');
	t.eq(await p.ev(`document.querySelector(${j(SSOURCE)}).value`), 'own', 'the page shows it is the binder’s own');
	t.eq(j(await names(p, 'status')), '[]', 'with no rows');
});

test('“Save as binder template” carries the binder’s own labels and statuses', async (p, h, t) => {
	await p.ev(`(async () => { const c = app.internalPlugins?.plugins?.templates; if (c) c.instance.options.folder = 'Templates'; })().then(() => 1)`);
	await p.ev(`app.fileManager.processFrontMatter(${file(NOTE)}, (f) => { f.labels = [{ Mara: 'blue' }]; f.statuses = ['Rough', 'Fair']; }).then(() => 1)`);
	await wait(p, `app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.statuses?.length === 2`);
	await p.ev(`${PL}.saveBinderTemplate(${B}.binderOf(${file('The Lighthouse')}), 'Kept lists', false).then(() => 1)`);
	const copy = await p.ev(`(async () => { const f = app.vault.getMarkdownFiles().find((x) => x.path.startsWith('Templates/Kept lists/') && !x.path.slice(21).includes('/') && x.basename !== 'Prologue'); return f ? app.vault.adapter.read(f.path) : app.vault.getFiles().map((x) => x.path).filter((x) => x.startsWith('Templates')).join(); })()`);
	t.ok(/labels:\s*\n\s*- Mara: blue/.test(copy) && /statuses:\s*\n\s*- Rough\s*\n\s*- Fair/.test(copy), 'the template’s binder note has both lists: ' + copy.slice(0, 300));
});

test('with a binder’s own labels, the filter’s label choices, the label menu (the inspector’s is the same one) and the lanes’ order follow that binder’s list; the statuses of its record do too', async (p, h, t) => {
	const a = NOTE.replace('The Lighthouse.md', 'Prologue.md'), b = NOTE.replace('The Lighthouse.md', 'Epilogue.md');
	await p.ev(`app.fileManager.processFrontMatter(${file(NOTE)}, (f) => { f.labels = [{ Zed: 'purple' }, { Mara: 'blue' }]; f.statuses = ['Rough', 'Fair']; }).then(() => 1)`);
	await label(p, a, 'Mara');
	await label(p, b, 'Zed');
	await wait(p, `app.metadataCache.getFileCache(${file(b)})?.frontmatter?.label === 'Zed' && app.metadataCache.getFileCache(${file(NOTE)})?.frontmatter?.labels?.length === 2`);
	// the lanes: after “No label”, the binder’s list in its order (the vault’s would be Red first)
	await openView(p, 'The Lighthouse');
	await p.ev(`(async () => { const v = ${VIEW}; await v.leaf.setViewState({ type: 'binders-view', active: true, state: { ...v.getState(), mode: 'corkboard', options: { arrange: 'label' } } }); })().then(() => 1)`);
	await wait(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-lanes > .binders-lane')`);
	await p.sleep(500);
	const heads = await p.ev(`[...document.querySelectorAll('.workspace-leaf.mod-active .binders-lane-head')].map((e) => (e.getAttribute('aria-label') ?? '').split(':')[0])`);
	t.eq(j(heads.slice(0, 3)), j(['No label', 'Zed', 'Mara']), 'the lines are the binder’s labels, in its order: ' + j(heads));
	// the filter's label choices
	const values = await p.ev(`${VIEW}.subset.field('label').values.map((v) => v.raw)`);
	t.eq(j(values), j(['Zed', 'Mara']), 'the filter offers the labels in use, in the binder’s order');
	// the menu that sets a label (the inspector's label row opens this one)
	await p.ev(`(() => { const e = document.querySelector(${j(card(b))}); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 10, clientY: r.y + 10, button: 2 })); return 1; })()`);
	await p.sleep(500);
	await hoverMenu(p, 'Set label');
	const items = await menuItems(p);
	t.eq(j(items.slice(items.indexOf('Zed'), items.indexOf('Zed') + 2)), j(['Zed', 'Mara']), 'the menu offers the binder’s labels in its order: ' + j(items));
	t.ok(!items.includes('Red'), 'the vault’s labels are not offered');
	await closeMenus(p);
	// the record's statuses
	const st = await p.ev(`${PL}.progress.history(${file('The Lighthouse')}).then((h) => h ? h.statuses : null)`);
	t.ok(st === null || j(st) === j(['Rough', 'Fair']), 'the record reads the binder’s statuses: ' + j(st));
});

test('Goal refuses a target below the words the book has, as the Progress window does, and writes nothing', async (p, h, t) => {
	await openDialog(p, 'goal');
	await typeIn(p, `${D} [data-binders-key="goal-target"]`, '5');
	await p.sleep(700);
	t.ok(/words already/.test(await p.ev(`document.querySelector('${D} .binders-pot-form-problem')?.textContent ?? ''`)), 'it says the book has more already');
	t.ok(!(await fm(p)).target, 'and nothing is written');
});

test('a page’s intro is as small as Book’s, and a click on a page leaves no focus on Book', async (p, h, t) => {
	await openDialog(p, 'book');
	const size = () => p.ev(`getComputedStyle(document.querySelector('${D} .binders-book-details-about')).fontSize`);
	const book = await size();
	await showPage(p, 'goal');
	t.eq(await size(), book, 'Goal’s intro is Book’s size');
	t.eq(await p.ev(`document.querySelector('${D} [data-binders-key="page-book"]').matches(':focus')`), false, 'Book does not keep the focus');
});

test('on a phone the list opens with no page selected, and Back leaves none', async (p, h, t) => {
	await onDevice(p, PHONE, async () => {
		await openView(p, 'The Lighthouse');
		await p.ev(`(() => { app.commands.executeCommandById('binders:open-binder-settings'); return 1; })()`);
		await wait(p, `!!document.querySelector('${D} .binders-bset-pages')`);
		t.eq(await p.ev(`document.querySelectorAll('${D} .binders-bset-pages .is-active').length`), 0, 'no row is selected in the list');
		await p.ev(`(() => { document.querySelector('${D} [data-binders-key="page-goal"]').click(); return 1; })()`);
		await wait(p, `document.querySelector('${D} .binders-bset-body')?.dataset.page === 'goal'`);
		await p.ev(`(() => { document.querySelector('${D} .modal-setting-back-button').click(); return 1; })()`);
		await wait(p, `!!document.querySelector('${D} .binders-bset-pages')?.isConnected`);
		t.eq(await p.ev(`document.querySelectorAll('${D} .binders-bset-pages .is-active').length`), 0, 'and none after Back');
	});
});

// (these four check what a writer sees, not that their work is safe: core, not guard)
for (const s of specs.slice(-4)) delete s.tier;
