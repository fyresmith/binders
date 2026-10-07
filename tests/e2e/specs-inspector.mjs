// The inspector and the contents, the two sidebar views (src/inspector): what they follow, every edit against the
// file on disk, and above all that nothing typed in the inspector is lost: when the cursor moves, when the pane turns
// to another item, when a save is refused, when the note is edited, renamed, moved or deleted under an open field,
// when the view or the plugin is closed with a field open. Then the contents: order, "you are here", a click in each
// mode, folding kept, the keys, a Longform project's indents, rows kept and not made again. A phone and a tablet.
import { NOTE, PL, VIEW, clickMenu, closeMenus, j, menuItems, openView, read, reload, split, texts, until, withTidy, writeRaw } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'inspector: ' + name, fn: withTidy(fn) });

const L = 'The Lighthouse/';
const ARRIVAL = L + 'Part One/Arrival.md', KEEPER = L + 'Part One/The keeper.md', STORM = L + 'Part One/Storm warning.md', WRECK = L + 'Part Two/The wreck.md', LIGHTS = L + 'Part Two/Lights out.md';
const I = '.workspace-leaf-content[data-type="binders-inspector"] .binders-inspector';
const C = '.workspace-leaf-content[data-type="binders-contents"] .binders-contents-list';
/** A card of the binder view, whichever tab has the focus (a click in the sidebar gives it to the sidebar's). */
const card = (path) => `.binders-view .binders-card[data-path=${j(path)}]`;
const fm = (p, path) => p.ev(`JSON.stringify(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(path)}))?.frontmatter ?? null)`).then(JSON.parse);
const name = (p) => p.ev(`document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent ?? null`);
const paneText = (p) => p.ev(`document.querySelector(${j(I)})?.innerText ?? ''`);
const onItem = (p, title) => until(p, `document.querySelector(${j(I + ' .binders-inspector-name')})?.textContent === ${j(title)}`, 4000);
const notices = (p) => p.ev(`(() => { const probe = new Notice(''), docs = new Set([document, probe.noticeEl.ownerDocument]); probe.hide(); return [...docs].flatMap(d => [...d.querySelectorAll('.notice')].map(n => n.textContent)).filter(Boolean); })()`);

/** Both views in the right sidebar, the contents over the inspector, the sidebar open. */
async function side(p, { contents = true } = {}) {
	await p.ev(`(async () => {
		const ws = app.workspace;
		for (const t of ['binders-inspector', 'binders-contents']) ws.detachLeavesOfType(t);
		ws.rightSplit.expand();
		if (${contents}) { const a = ws.getRightLeaf(false); await a.setViewState({ type: 'binders-contents', active: true }); ws.revealLeaf(a); }
		const b = ws.getRightLeaf(${contents}); await b.setViewState({ type: 'binders-inspector', active: true }); ws.revealLeaf(b);
		const main = ws.getMostRecentLeaf(ws.rootSplit); if (main) ws.setActiveLeaf(main, { focus: true });
	})().then(() => 1)`);
	await until(p, `!!document.querySelector(${j(I)})`);
	await p.sleep(250);
}
/** The binder view in a mode, with the sidebar's views beside it. */
async function open(p, mode, folder = 'The Lighthouse', opts) {
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
	await p.sleep(mode === 'manuscript' ? 900 : 400);
	await side(p, opts);
}
/** Puts the cursor in a section of the manuscript (or selects a card or row), as "Open binder" from a note does. */
async function reveal(p, path) {
	await p.ev(`(() => { const v = ${VIEW}; app.workspace.setActiveLeaf(v.leaf, { focus: true }); v.revealItem(app.vault.getAbstractFileByPath(${j(path)})); return 1; })()`);
	await p.sleep(600);
}
const fieldSel = (f) => `${I} [data-field="${f}"]`;
/** Clicks one of the pane's fields (a text starts being edited, a row opens its menu, a box is ticked). */
async function field(p, f) {
	await p.ev(`(() => { document.querySelector(${j(fieldSel(f))})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	const at = await p.at(fieldSel(f));
	if (!at) throw new Error(`the inspector has no “${f}”: ` + (await paneText(p)).replace(/\n+/g, ' | '));
	await p.click(at.x, at.y);
	await p.sleep(250);
}
const typing = (p, f) => p.ev(`document.querySelector(${j(fieldSel(f) + ' :is(textarea, input)')})?.value ?? null`);
const cardFoot = (path) => `${card(path)} .binders-card-footer`;
const clickCard = async (p, path, extra) => { const at = await p.at(cardFoot(path)); if (!at) throw new Error('no card ' + path); await p.click(at.x, at.y, extra); await p.sleep(300); };
/** A click in the text of a section of the manuscript: the cursor goes there. */
async function clickSection(p, words) {
	const at = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.textContent.includes(${j(words)})); const t = s?.querySelector('.cm-line, p'); const r = t?.getBoundingClientRect(); return r ? { x: r.left + 40, y: r.top + r.height / 2 } : null; })()`);
	if (!at) throw new Error('no section with “' + words + '”');
	await p.click(at.x, at.y);
	await p.sleep(700);
}
const row = (path) => `${C} .tree-item-self[data-path=${j(path)}]`;
async function clickRow(p, path, extra) {
	await p.ev(`(() => { document.querySelector(${j(row(path))})?.scrollIntoView({ block: 'center' }); return 1; })()`);
	const at = await p.at(`${row(path)} .tree-item-inner`);
	if (!at) throw new Error('the contents have no row ' + path);
	await p.click(at.x, at.y, extra);
	await p.sleep(900);
}
const rows = (p) => p.ev(`[...document.querySelectorAll(${j(C + ' .tree-item-self[data-path]')})].filter(e => e.offsetParent).map(e => e.dataset.path)`);
const here = (p) => p.ev(`document.querySelector(${j(C + ' .tree-item-self.is-active')})?.dataset.path ?? null`);

// ---- what it follows ----

test('follows the section with the cursor, a selected card, several, a folder, the binder, a note in a tab, and says so when there is nothing', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	t.ok(await onItem(p, 'Arrival'), 'the manuscript: the section with the cursor: ' + await name(p));
	await clickSection(p, 'He met her at the foot');
	t.ok(await onItem(p, 'The keeper'), 'the cursor in another section: ' + await name(p));
	// a click in the inspector itself doesn't change what it is on
	await field(p, 'label');
	await closeMenus(p);
	t.eq(await name(p), 'The keeper', 'a click in the pane leaves it on what it was on');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	await p.sleep(500);
	await p.ev(`(async () => { await ${VIEW}.navigate(app.vault.getAbstractFileByPath('The Lighthouse/Part Two')); })().then(() => 1)`);
	await p.sleep(600);
	await clickCard(p, WRECK);
	t.ok(await onItem(p, 'The wreck'), 'the corkboard: the selected card: ' + await name(p));
	await clickCard(p, LIGHTS, { modifiers: 2 });
	t.ok(await onItem(p, '2 notes selected'), 'two cards: ' + await name(p));
	t.ok(!(await p.at(fieldSel('synopsis'))) && !(await p.at(fieldSel('notes'))), 'several at once have no synopsis or notes to type');
	await p.key('Escape');
	const blank = await p.at('.binders-view .binders-mode');
	await p.click(blank.l + blank.w - 30, blank.t + blank.h - 30);
	t.ok(await onItem(p, 'Part Two'), 'nothing selected: the folder the board shows: ' + await name(p));
	t.ok(/2 notes/.test(await paneText(p)), 'a folder says how many notes it holds');
	await p.ev(`(async () => { await ${VIEW}.navigate(app.vault.getAbstractFileByPath('The Lighthouse')); })().then(() => 1)`);
	await p.sleep(600);
	// (back at the book's own board, with whatever card the board gave the keyboard to let go)
	await p.key('Escape');
	await p.click(blank.l + blank.w - 30, blank.t + blank.h - 30);
	t.ok(await onItem(p, 'The Lighthouse'), 'the binder itself: ' + await name(p));
	t.ok(!(await p.at(fieldSel('export'))) && !(await p.at(fieldSel('role'))), 'the binder has no place in an export of itself');
	await h.open(KEEPER);
	t.ok(await onItem(p, 'The keeper'), 'a note of the binder in an ordinary tab: ' + await name(p));
	await h.open(L + 'Part One/Part One.md').catch(() => {});
	await p.ev(`(async () => { const path = 'The Lighthouse/Part One/Part One.md'; if (!app.vault.getAbstractFileByPath(path)) await app.vault.create(path, '---\\nsynopsis: The first part.\\n---\\n'); await app.workspace.getMostRecentLeaf(app.workspace.rootSplit).openFile(app.vault.getAbstractFileByPath(path)); })().then(() => 1)`);
	t.ok(await onItem(p, 'Part One'), 'a folder’s own note in a tab is the folder: ' + await name(p));
	await p.ev(`(async () => { await app.vault.create('Loose.md', 'Not in any binder.\\n'); await app.workspace.getMostRecentLeaf(app.workspace.rootSplit).openFile(app.vault.getAbstractFileByPath('Loose.md')); })().then(() => 1)`);
	await until(p, `/isn’t in a binder/.test(document.querySelector(${j(I)})?.innerText ?? '')`);
	t.ok(/isn’t in a binder/.test(await paneText(p)), 'a note outside any binder: ' + await paneText(p));
	await p.ev(`(() => { app.workspace.getMostRecentLeaf(app.workspace.rootSplit).detach(); return 1; })()`);
	await until(p, `/No binder is open/.test(document.querySelector(${j(I)})?.innerText ?? '')`);
	t.ok(/No binder is open/.test(await paneText(p)), 'nothing open: ' + await paneText(p));
	t.eq(p.errors.filter((e) => !e.includes('Electron Security')).join('\n'), '', 'no errors');
});

test('with the cursor scrolled out of sight, it is on the section at the top of the page', async (p, h, t) => {
	// a long first section, so there is somewhere to scroll to
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${j(L + 'Prologue.md')}), (s) => s + ${j('\n\nAnother paragraph of the prologue, to make it long.'.repeat(40))}).then(() => 1)`);
	await open(p, 'manuscript');
	await reveal(p, L + 'Prologue.md');
	t.ok(await onItem(p, 'Prologue'), 'the cursor is in the prologue');
	await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.textContent.trim().startsWith('The keeper')); const root = document.querySelector('.binders-manuscript'); root.scrollTop += s.getBoundingClientRect().top - root.getBoundingClientRect().top - 4; return 1; })()`);
	t.ok(await onItem(p, 'The keeper'), 'scrolled on, with the cursor left behind: the section at the top of the page: ' + await name(p));
	t.eq(await here(p), KEEPER, 'and the contents mark it');
});

// ---- every edit, against the file ----

test('a synopsis, a label, a status, a target, the export switch and the role each reach the note, and nothing else in it changes', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	await onItem(p, 'Arrival');
	const before = await texts(p), body = split(before[ARRIVAL]).body;
	await field(p, 'synopsis');
	await p.type('Mara lands.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.synopsis?.includes('Mara lands.')`);
	t.ok((await fm(p, ARRIVAL)).synopsis.includes('Mara lands.'), 'the synopsis, saved with Mod-Enter: ' + (await fm(p, ARRIVAL)).synopsis);
	await field(p, 'label');
	t.ok((await menuItems(p)).includes('Custom color...'), 'the label’s menu is the card’s own: ' + (await menuItems(p)).join(', '));
	await clickMenu(p, 'Green');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.label === 'Green'`);
	t.eq((await fm(p, ARRIVAL)).label, 'Green', 'the label');
	await field(p, 'status');
	await clickMenu(p, 'Done');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.status === 'Done'`);
	t.eq((await fm(p, ARRIVAL)).status, 'Done', 'the status');
	await field(p, 'target');
	await p.type('1,500');
	await p.key('Enter');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.target === 1500`);
	t.eq((await fm(p, ARRIVAL)).target, 1500, 'the target, typed with a comma');
	t.ok(/of 1,500 words/.test(await paneText(p)), 'and the count is against it: ' + (await paneText(p)).split('\n')[1]);
	// a target that isn't a number stays in its field, and says why
	await field(p, 'target');
	await p.type('lots');
	await p.key('Enter');
	await p.sleep(400);
	t.eq(await typing(p, 'target'), 'lots', 'what was typed is still in the field');
	t.ok((await notices(p)).some((n) => /whole number/.test(n)), 'and why is said: ' + (await notices(p)).join(' | '));
	t.eq((await fm(p, ARRIVAL)).target, 1500, 'the note keeps the target it had');
	await p.key('Escape');
	await field(p, 'export');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.export === false`);
	t.eq((await fm(p, ARRIVAL)).export, false, 'left out of export: export: false');
	t.ok(await until(p, `/Left out/.test(document.querySelector(${j(fieldSel('role'))})?.textContent ?? '')`), 'and its role says so: ' + await p.ev(`document.querySelector(${j(fieldSel('role'))})?.textContent`));
	await field(p, 'export');
	await until(p, `!('export' in (app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter ?? { export: 1 }))`);
	t.ok(!('export' in (await fm(p, ARRIVAL))), 'put back in: the property goes');
	// the role: what export would make of it by its place, said to be that, until one is written on it
	t.ok(await until(p, `/auto/.test(document.querySelector(${j(fieldSel('role'))})?.textContent ?? '')`), 'a role nobody wrote is said to be automatic: ' + await p.ev(`document.querySelector(${j(fieldSel('role'))})?.textContent`));
	const guessed = (await p.ev(`document.querySelector(${j(fieldSel('role') + ' span')})?.textContent`));
	await field(p, 'role');
	const items = await menuItems(p);
	t.ok(items[0] === `Automatic: ${guessed.toLowerCase()}` && ['Part', 'Chapter', 'Scene', 'Front matter', 'Back matter'].every((r) => items.includes(r)), 'the roles to choose from: ' + items.join(', '));
	await clickMenu(p, 'Front matter');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.['export-as'] === 'front matter'`);
	t.eq((await fm(p, ARRIVAL))['export-as'], 'front matter', 'a role written on the note: export-as');
	t.ok(await until(p, `document.querySelector(${j(fieldSel('role'))})?.textContent === 'Front matter'`), 'and shown as written, not as automatic: ' + await p.ev(`document.querySelector(${j(fieldSel('role'))})?.textContent`));
	await field(p, 'role');
	await clickMenu(p, `Automatic: ${guessed.toLowerCase()}`);
	await until(p, `!('export-as' in (app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter ?? { 'export-as': 1 }))`);
	t.ok(!('export-as' in (await fm(p, ARRIVAL))), 'automatic again: the property goes');
	const after = await texts(p);
	t.eq(split(after[ARRIVAL]).body, body, 'the note’s text is byte for byte what it was');
	for (const path of Object.keys(before)) if (path !== ARRIVAL) t.eq(after[path], before[path], `“${path}” is unchanged`);
	t.eq(p.errors.filter((e) => !e.includes('Electron Security')).join('\n'), '', 'no errors');
});

test('“auto” after a role nobody wrote: the role beside it is never cut short for it, in a pane too narrow for both; a role that was written is cut as any value is', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	await onItem(p, 'Arrival');
	await until(p, `/auto/.test(document.querySelector(${j(fieldSel('role'))})?.textContent ?? '')`);
	// (the value squeezed to less than its words need, as a narrow sidebar does)
	const squeezed = (px) => p.ev(`(() => { const v = document.querySelector(${j(fieldSel('role'))}); v.style.width = ${j(px)}; v.style.flex = 'none'; const s = [...v.querySelectorAll(':scope > span')]; const got = s.map(e => ({ text: e.textContent, shrink: getComputedStyle(e).flexShrink, cut: e.scrollWidth > e.clientWidth, width: Math.round(e.getBoundingClientRect().width) })); v.style.width = ''; v.style.flex = ''; return got; })()`);
	const whole = await squeezed(''), tight = await squeezed('30px');
	t.eq(whole.length, 2, 'the role and “auto”: ' + j(whole));
	t.eq(whole[1].text, 'auto', 'in that order');
	t.eq(tight[0].shrink, '0', 'the role doesn’t give way: ' + j(tight));
	t.ok(!tight[0].cut && tight[0].width === whole[0].width, `the role is as wide as its words, squeezed or not: ${j(whole)} ${j(tight)}`);
	t.eq(tight[1].shrink, '1', '“auto” is what gives way');
	// a role written on the note stands alone, and is cut short like any value
	await field(p, 'role');
	await clickMenu(p, 'Front matter');
	await until(p, `document.querySelector(${j(fieldSel('role'))})?.textContent === 'Front matter'`);
	const written = await squeezed('30px');
	t.eq(written.length, 1, 'no “auto”: ' + j(written));
	t.ok(written[0].shrink === '1' && written[0].cut, 'and it is cut short in a pane too narrow for it: ' + j(written));
	// automatic again: the role has “auto” beside it again, and holds its width again
	await field(p, 'role');
	await clickMenu(p, `Automatic: ${whole[0].text.toLowerCase()}`);
	await until(p, `/auto/.test(document.querySelector(${j(fieldSel('role'))})?.textContent ?? '')`);
	const again = await squeezed('30px');
	t.ok(again.length === 2 && again[0].shrink === '0' && !again[0].cut, 'automatic again: ' + j(again));
});

test('several selected: one status, one target and one role go to all of them; a folder with no folder note gets one only when something is set', async (p, h, t) => {
	await open(p, 'corkboard', 'The Lighthouse/Part One');
	await clickCard(p, ARRIVAL);
	await clickCard(p, KEEPER, { modifiers: 2 });
	await clickCard(p, STORM, { modifiers: 2 });
	t.ok(await onItem(p, '3 notes selected'), 'three selected: ' + await name(p));
	await field(p, 'status');
	await clickMenu(p, 'Done');
	await until(p, `[${j(ARRIVAL)}, ${j(KEEPER)}, ${j(STORM)}].every(x => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(x))?.frontmatter?.status === 'Done')`);
	t.eq(j(await Promise.all([ARRIVAL, KEEPER, STORM].map(async (x) => (await fm(p, x)).status))), j(['Done', 'Done', 'Done']), 'the status');
	t.eq((await p.ev(`${VIEW}.selectedItems().length`)), 3, 'they are still selected');
	await field(p, 'role');
	await clickMenu(p, 'Scene');
	await until(p, `[${j(ARRIVAL)}, ${j(KEEPER)}, ${j(STORM)}].every(x => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(x))?.frontmatter?.['export-as'] === 'scene')`);
	t.eq(j(await Promise.all([ARRIVAL, KEEPER, STORM].map(async (x) => (await fm(p, x))['export-as']))), j(['scene', 'scene', 'scene']), 'the role');
	// a folder that has no folder note
	await p.ev(`(async () => { await app.vault.createFolder('The Lighthouse/Part Four'); await app.vault.create('The Lighthouse/Part Four/After.md', 'Later.\\n'); })().then(() => 1)`);
	await p.sleep(500);
	await p.ev(`(async () => { await ${VIEW}.navigate(app.vault.getAbstractFileByPath('The Lighthouse/Part Four')); })().then(() => 1)`);
	t.ok(await onItem(p, 'Part Four'), 'on the new folder: ' + await name(p));
	await field(p, 'role');
	await clickMenu(p, (await menuItems(p))[0]);
	await p.sleep(500);
	t.ok(!(await p.ev(`!!app.vault.getAbstractFileByPath('The Lighthouse/Part Four/Part Four.md')`)), 'choosing “automatic” where nothing was written makes no folder note');
	await field(p, 'synopsis');
	await p.type('What came after.');
	await p.key('Enter', 'ctrl');
	await until(p, `!!app.vault.getAbstractFileByPath('The Lighthouse/Part Four/Part Four.md')`);
	t.eq(await read(p, 'The Lighthouse/Part Four/Part Four.md'), '---\nsynopsis: What came after.\n---\n', 'a synopsis typed makes the folder note, with that in it');
});

// ---- nothing typed is lost (golden rule 2) ----

test('a synopsis half typed when the cursor goes into another section is saved to the note it was typed for', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	await onItem(p, 'Arrival');
	const before = await texts(p);
	await field(p, 'synopsis');
	await p.key('End', 'ctrl');
	await p.type(' She has the letter still');
	t.ok(!(await read(p, ARRIVAL)).includes('letter still'), 'typed, and not yet in the note');
	await clickSection(p, 'He met her at the foot');
	t.ok(await onItem(p, 'The keeper'), 'the pane followed the cursor: ' + await name(p));
	t.ok((await fm(p, ARRIVAL)).synopsis.endsWith('She has the letter still'), 'what was typed is in the note it was typed for: ' + (await fm(p, ARRIVAL)).synopsis);
	t.ok(!j(await fm(p, KEEPER)).includes('letter still'), 'and not in the note the cursor went to');
	const after = await texts(p);
	t.eq(split(after[ARRIVAL]).body, split(before[ARRIVAL]).body, 'the text of the note is untouched');
	t.eq(after[KEEPER], before[KEEPER], 'the other note is byte for byte what it was');
});

test('notes being typed when another card is selected are saved first; typing goes on in a field while the note changes under it', async (p, h, t) => {
	await open(p, 'corkboard', 'The Lighthouse/Part One');
	await clickCard(p, ARRIVAL);
	await onItem(p, 'Arrival');
	await field(p, 'notes');
	await p.type('Check the tide.');
	await p.key('Enter');
	await p.key('Enter');
	await p.type('Does she open the letter?');
	await clickCard(p, KEEPER);
	t.ok(await onItem(p, 'The keeper'), 'the pane turned to the other card: ' + await name(p));
	t.eq((await fm(p, ARRIVAL)).notes, 'Check the tide.\n\nDoes she open the letter?', 'the notes are in the first note, line breaks and all');
	t.ok(!('notes' in (await fm(p, KEEPER))), 'and the second has none');
	// the note edited from outside while a field of it is open: the field keeps what's typed, the outside edit stays
	await clickCard(p, ARRIVAL);
	await onItem(p, 'Arrival');
	await field(p, 'synopsis');
	await p.key('End', 'ctrl');
	await p.type(' TYPED');
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${j(ARRIVAL)}); await app.vault.process(f, (s) => s + '\\nA line added outside.\\n'); await app.fileManager.processFrontMatter(f, (m) => { m.status = 'Outside'; m.synopsis = 'Changed outside.'; }); })().then(() => 1)`);
	await p.sleep(700);
	t.ok((await typing(p, 'synopsis'))?.endsWith(' TYPED'), 'the field still holds what was typed: ' + await typing(p, 'synopsis'));
	await p.key('Enter', 'ctrl');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.synopsis?.endsWith(' TYPED')`);
	const now = await read(p, ARRIVAL), props = await fm(p, ARRIVAL);
	t.ok(props.synopsis.endsWith(' TYPED'), 'what was typed is saved: ' + props.synopsis);
	t.eq(props.status, 'Outside', 'the status set outside is kept');
	t.ok(now.includes('A line added outside.'), 'and so is the text added outside');
});

test('a save that is refused leaves what was typed in its field, and the pane where it is', async (p, h, t) => {
	await open(p, 'corkboard', 'The Lighthouse/Part One');
	await clickCard(p, ARRIVAL);
	await onItem(p, 'Arrival');
	await field(p, 'synopsis');
	await p.key('End', 'ctrl');
	await p.type(' Words that must not be lost');
	// every write is refused from here on, as a disk that is full or a file that is locked would refuse it
	await p.ev(`(() => { const s = ${PL}.binders; window.__setProps = s.setProps; s.setProps = async () => { throw new Error('The disk is full.'); }; return 1; })()`);
	try {
		await clickCard(p, KEEPER);
		await p.sleep(600);
		t.eq(await name(p), 'Arrival', 'the pane stays on the note whose text it couldn’t save');
		t.ok((await typing(p, 'synopsis'))?.endsWith('Words that must not be lost'), 'the text is still in its field: ' + await typing(p, 'synopsis'));
		t.ok((await notices(p)).some((n) => /disk is full/.test(n)), 'and why is said: ' + (await notices(p)).join(' | '));
	} finally { await p.ev(`(() => { ${PL}.binders.setProps = window.__setProps; return 1; })()`); }
	// once it can be saved, it is, and the pane goes on to what was selected
	await p.ev(`(() => { document.querySelector(${j(fieldSel('synopsis') + ' textarea')})?.focus(); return 1; })()`);
	await p.key('Enter', 'ctrl');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.synopsis?.endsWith('Words that must not be lost')`);
	t.ok((await fm(p, ARRIVAL)).synopsis.endsWith('Words that must not be lost'), 'saved when the disk takes it: ' + (await fm(p, ARRIVAL)).synopsis);
	t.ok(await onItem(p, 'The keeper'), 'then the pane turns to the card that was selected: ' + await name(p));
});

test('a note renamed, moved or deleted while a field of it is open: the text goes with the note, or stays in the field', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	await onItem(p, 'Arrival');
	await field(p, 'synopsis');
	await p.key('End', 'ctrl');
	await p.type(' RENAMED');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath(${j(ARRIVAL)}), 'The Lighthouse/Part One/Landing.md').then(() => 1)`);
	await p.sleep(700);
	// (the pane turns to the note under its new name, which saves what was being typed: to that same note)
	if ((await typing(p, 'synopsis')) != null) await p.key('Enter', 'ctrl');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('The Lighthouse/Part One/Landing.md'))?.frontmatter?.synopsis?.endsWith(' RENAMED')`);
	t.ok((await fm(p, L + 'Part One/Landing.md')).synopsis.endsWith(' RENAMED'), 'renamed under the field: what was typed is in the note under its new name');
	t.ok(!(await p.ev(`!!app.vault.getAbstractFileByPath(${j(ARRIVAL)})`)), 'and no note was made under the old one');
	t.ok(await onItem(p, 'Landing'), 'the pane names it as it is called now: ' + await name(p));
	// moved to another folder
	await field(p, 'notes');
	await p.type('MOVED');
	await p.ev(`app.fileManager.renameFile(app.vault.getAbstractFileByPath('The Lighthouse/Part One/Landing.md'), 'The Lighthouse/Part Two/Landing.md').then(() => 1)`);
	await p.sleep(700);
	if ((await typing(p, 'notes')) != null) await p.key('Enter', 'ctrl');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('The Lighthouse/Part Two/Landing.md'))?.frontmatter?.notes === 'MOVED'`);
	t.eq((await fm(p, L + 'Part Two/Landing.md')).notes, 'MOVED', 'moved under the field: what was typed is in the note where it is now');
	// deleted: there is nowhere to save to, so the words stay where they can be copied from
	await p.ev(`(() => { const v = ${VIEW}; v.revealItem(app.vault.getAbstractFileByPath(${j(KEEPER)})); return 1; })()`);
	await onItem(p, 'The keeper');
	await field(p, 'synopsis');
	await p.key('End', 'ctrl');
	await p.type(' ORPHANED');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(KEEPER)})).then(() => 1)`);
	await p.sleep(900);
	t.ok((await typing(p, 'synopsis'))?.endsWith(' ORPHANED'), 'deleted under the field: the words are still in it: ' + await typing(p, 'synopsis'));
	t.eq(p.errors.filter((e) => !e.includes('Electron Security') && !/ENOENT|no such file/i.test(e)).join('\n'), '', 'no errors but the missing file');
});

test('the view closed, or the plugin turned off, with a field open: what was typed is written first', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	await onItem(p, 'Arrival');
	await field(p, 'notes');
	await p.type('Typed, then the tab was closed.');
	t.eq(await typing(p, 'notes'), 'Typed, then the tab was closed.', 'typed into the notes');
	await p.ev(`(() => { app.workspace.detachLeavesOfType('binders-inspector'); return 1; })()`);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.notes === 'Typed, then the tab was closed.'`);
	t.eq((await fm(p, ARRIVAL))?.notes, 'Typed, then the tab was closed.', 'the inspector’s tab closed with notes being typed: they are in the note');
	await side(p);
	await reveal(p, KEEPER);
	await onItem(p, 'The keeper');
	await field(p, 'synopsis');
	await p.key('End', 'ctrl');
	await p.type(' TYPED BEFORE THE PLUGIN WENT');
	try {
		await p.ev(`app.plugins.disablePlugin('binders').then(() => 1)`);
		await p.sleep(900);
		t.ok((await read(p, KEEPER)).includes('TYPED BEFORE THE PLUGIN WENT'), 'the plugin turned off with a synopsis being typed: it is in the note: ' + split(await read(p, KEEPER)).yaml);
	} finally {
		await p.ev(`app.plugins.enablePlugin('binders').then(() => 1)`);
		await until(p, `!!app.plugins.plugins.binders?.explorer`);
		await p.ev(`app.plugins.plugins.binders.binders.ready.then(() => 1)`);
		await p.sleep(500);
	}
	// the page hidden (the app going to the background): written, and the field still there to carry on in
	await openView(p);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await p.sleep(900);
	await side(p);
	await reveal(p, STORM);
	await onItem(p, 'Storm warning');
	await field(p, 'notes');
	await p.type('Typed, then the window went away.');
	await p.ev(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; return 1; })()`);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(STORM)}))?.frontmatter?.notes === 'Typed, then the window went away.'`);
	t.eq((await fm(p, STORM)).notes, 'Typed, then the window went away.', 'the page hidden with notes being typed: they are in the note');
	t.eq(await typing(p, 'notes'), 'Typed, then the window went away.', 'and the field is still open, to carry on in');
	// a quit waits for what's in a field
	await p.type(' More.');
	const waited = await p.ev(`(async () => { const tasks = { list: [], add(fn) { this.list.push(fn()); }, addPromise(x) { this.list.push(x); }, isEmpty() { return !this.list.length; } }; app.workspace.trigger('quit', tasks); await Promise.all(tasks.list); return tasks.list.length; })()`);
	t.ok(waited > 0, 'a quit is asked to wait for the field');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(STORM)}))?.frontmatter?.notes?.endsWith('More.')`);
	t.eq((await fm(p, STORM)).notes, 'Typed, then the window went away. More.', 'and by then the note has it: ' + (await fm(p, STORM)).notes);
});

test('a synopsis typed on a card and in the inspector, turn about: each is saved as its field is left, and neither shows the other’s old text', async (p, h, t) => {
	await open(p, 'corkboard', 'The Lighthouse/Part One');
	await clickCard(p, ARRIVAL);
	await onItem(p, 'Arrival');
	await field(p, 'synopsis');
	await p.key('a', 'ctrl');
	await p.type('From the pane.');
	// into the card's own synopsis: the pane's field is left, and saves. The card's field opens at once, on the text the
	// card had: the pane's save lands under it.
	const syn = await p.at(`${card(ARRIVAL)} .binders-card-synopsis`);
	await p.click(syn.x, syn.y);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.synopsis === 'From the pane.'`);
	t.eq((await fm(p, ARRIVAL)).synopsis, 'From the pane.', 'the pane’s text was saved as its field was left');
	const cardField = `${card(ARRIVAL)} .binders-card-synopsis textarea`;
	t.ok(await until(p, `!!document.querySelector(${j(cardField)})`), 'the card’s synopsis is open to be typed in');
	// left as it was opened, the card's field writes nothing: the pane's text isn't put back to what the card had
	await p.ev(`(() => { document.querySelector(${j(cardField)}).focus(); return 1; })()`);
	await p.key('Tab');
	await p.sleep(600);
	t.eq((await fm(p, ARRIVAL)).synopsis, 'From the pane.', 'a card’s field left untouched doesn’t write its older text over the pane’s');
	t.ok(await until(p, `document.querySelector(${j(card(ARRIVAL) + ' .binders-card-synopsis')})?.textContent === 'From the pane.'`), 'and the card shows the pane’s text: ' + await p.ev(`document.querySelector(${j(card(ARRIVAL) + ' .binders-card-synopsis')})?.textContent`));
	// now typed on the card, and left for the pane: the card's is saved, and the pane shows it
	await p.click(syn.x, syn.y);
	await until(p, `!!document.querySelector(${j(cardField)})`);
	await p.ev(`(() => { const f = document.querySelector(${j(cardField)}); f.focus(); f.select(); return 1; })()`);
	await p.type('From the card.');
	await field(p, 'target');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.synopsis === 'From the card.'`);
	t.eq((await fm(p, ARRIVAL)).synopsis, 'From the card.', 'the card’s text was saved as its field was left');
	await p.key('Escape');
	t.ok(await until(p, `document.querySelector(${j(fieldSel('synopsis'))})?.textContent === 'From the card.'`), 'and the pane shows it: ' + await p.ev(`document.querySelector(${j(fieldSel('synopsis'))})?.textContent`));
});

test('a binder in a newer format: the inspector says it can’t be changed, and changes nothing', async (p, h, t) => {
	const orig = await read(p, NOTE);
	await writeRaw(p, NOTE, orig.replace('binder: 1', 'binder: 2'));
	await p.sleep(700);
	await open(p, 'corkboard', 'The Lighthouse/Part One');
	await clickCard(p, ARRIVAL);
	await onItem(p, 'Arrival');
	const before = await texts(p);
	t.ok(/can’t be changed/.test(await paneText(p)), 'it says so: ' + (await paneText(p)).split('\n').slice(0, 4).join(' | '));
	await field(p, 'synopsis');
	t.eq(await typing(p, 'synopsis'), null, 'the synopsis doesn’t open to be typed in');
	await field(p, 'label');
	t.eq((await menuItems(p)).length, 0, 'the label has no menu');
	t.ok(await p.ev(`document.querySelector(${j(fieldSel('export'))}).disabled`), 'the export box can’t be ticked');
	t.ok(!(await p.at(fieldSel('take'))), 'and there is no camera');
	const after = await texts(p);
	for (const path of Object.keys(before)) t.eq(after[path], before[path], `“${path}” is unchanged`);
});

// ---- notes, snapshots, the tab in the sidebar ----

test('notes: kept under the name settings give them, shown in the outliner’s Notes column with their line breaks kept, and joined by a merge', async (p, h, t) => {
	await p.ev(`(async () => { const pl = ${PL}; pl.settings.notesProp = 'remarks'; await pl.saveSettings(); })().then(() => 1)`);
	await open(p, 'outliner');
	await reveal(p, ARRIVAL);
	await onItem(p, 'Arrival');
	await field(p, 'notes');
	await p.type('First line.');
	await p.key('Enter');
	await p.type('Second line.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.remarks === 'First line.\\nSecond line.'`);
	t.eq((await fm(p, ARRIVAL)).remarks, 'First line.\nSecond line.', 'under the name from settings');
	t.ok(!('notes' in (await fm(p, ARRIVAL))), 'and not under the default one');
	// the outliner's column
	await p.ev(`(async () => { const l = ${VIEW}.leaf, was = l.getViewState(); await l.setViewState({ ...was, state: { ...was.state, options: { ...(was.state.options ?? {}), outliner: { columns: [{ id: 'notes' }, { id: 'status' }] } } } }); })().then(() => 1)`);
	await p.sleep(600);
	const cell = `.binders-view .binders-outliner-row[data-path=${j(ARRIVAL)}] .binders-outliner-notes`;
	t.ok(await until(p, `!!document.querySelector(${j(cell)})`), 'the outliner has a Notes column');
	t.ok((await p.ev(`document.querySelector(${j(cell)}).textContent`)).includes('First line.'), 'with the note’s notes in it');
	const at = await p.at(cell);
	await p.click(at.x, at.y);
	await p.sleep(300);
	if (!(await p.ev(`!!document.querySelector(${j(cell + ' textarea')})`))) { await p.click(at.x, at.y); await p.sleep(300); }
	t.eq(await p.ev(`document.querySelector(${j(cell + ' textarea')})?.value`), 'First line.\nSecond line.', 'typed in there as the lines they are');
	await p.key('End', 'ctrl');
	await p.type(' And more.');
	await p.key('Enter', 'ctrl');
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.remarks?.endsWith('And more.')`);
	t.eq((await fm(p, ARRIVAL)).remarks, 'First line.\nSecond line. And more.', 'saved with its line break');
	t.ok(await until(p, `document.querySelector(${j(fieldSel('notes'))})?.textContent === 'First line.\\nSecond line. And more.'`), 'and the inspector shows it');
	// a merge joins the notes, as it joins the synopses: none goes to the trash with its note
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(KEEPER)}), (m) => { m.remarks = 'The keeper’s notes.'; }).then(() => 1)`);
	await p.sleep(400);
	await p.ev(`(() => { const v = ${VIEW}; v.revealItem(app.vault.getAbstractFileByPath(${j(ARRIVAL)})); return 1; })()`);
	await p.sleep(300);
	const r1 = await p.at(`.binders-view .binders-outliner-row[data-path=${j(ARRIVAL)}] .binders-outliner-name`), r2 = await p.at(`.binders-view .binders-outliner-row[data-path=${j(KEEPER)}] .binders-outliner-name`);
	await p.click(r1.x + 80, r1.y);
	await p.click(r2.x + 80, r2.y, { modifiers: 2 });
	await p.right(r2.x + 80, r2.y);
	await clickMenu(p, 'Merge 2 notes');
	await p.ev(`(async () => { for (let i = 0; i < 30; i++) { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Merge'); if (b) { b.click(); return 1; } await new Promise(r => setTimeout(r, 100)); } return 0; })()`);
	await until(p, `!app.vault.getAbstractFileByPath(${j(KEEPER)})`, 6000);
	await p.sleep(500);
	t.eq((await fm(p, ARRIVAL)).remarks, 'First line.\nSecond line. And more.\n\nThe keeper’s notes.', 'the merged note has both notes’ notes');
});

test('snapshots: the camera takes one, the list shows them, and a row opens the dialog on that snapshot', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	await onItem(p, 'Arrival');
	t.ok(/None yet/.test(await paneText(p)), 'none to begin with');
	await field(p, 'take');
	await until(p, `document.querySelectorAll(${j(I + ' .binders-inspector-list .tree-item-self')}).length === 1`, 5000);
	await p.ev(`app.vault.process(app.vault.getAbstractFileByPath(${j(ARRIVAL)}), (s) => s + '\\nA second version.\\n').then(() => 1)`);
	await p.sleep(1200);
	await field(p, 'take');
	await until(p, `document.querySelectorAll(${j(I + ' .binders-inspector-list .tree-item-self')}).length === 2`, 5000);
	t.eq(await p.ev(`document.querySelectorAll(${j(I + ' .binders-inspector-list .tree-item-self')}).length`), 2, 'two taken, two listed');
	// the older one (the second row: newest first)
	await p.ev(`(() => { document.querySelectorAll(${j(I + ' .binders-inspector-list .tree-item-self')})[1].scrollIntoView({ block: 'center' }); return 1; })()`);
	const at = await p.at(`${I} .binders-inspector-list .tree-item-self`, 1);
	await p.click(at.x, at.y);
	await until(p, `!!document.querySelector('.modal .binders-snapshots-item.is-active')`, 5000);
	const shown = await p.ev(`(() => { const items = [...document.querySelectorAll('.modal .binders-snapshots-item')]; return { n: items.length, active: items.findIndex(e => e.classList.contains('is-active')) }; })()`);
	t.eq(shown.n, 3, 'the dialog lists the note and its two snapshots');
	t.eq(shown.active, 2, 'and is on the older snapshot, the one whose row was clicked');
	await p.key('Escape');
});

const leaves = (p, type) => p.ev(`app.workspace.getLeavesOfType(${j(type)}).length`);
const both = async (p) => [await leaves(p, 'binders-contents'), await leaves(p, 'binders-inspector')];
const fronts = (p) => p.ev(`[...document.querySelectorAll('.workspace-split.mod-right-split .workspace-tab-header.is-active')].map(e => e.dataset.type)`);
/** The sidebar without either tab, shut, as a vault that has never had a binder open. */
const bare = (p) => p.ev(`(() => { for (const t of ['binders-inspector', 'binders-contents']) app.workspace.detachLeavesOfType(t); app.workspace.rightSplit.collapse(); return 1; })()`).then(() => p.sleep(200));

test('opening a binder puts the contents and the inspector among the right sidebar’s tabs: once, unopened, nothing brought to the front; a closed one comes back with the next binder', async (p, h, t) => {
	await bare(p);
	// the plugin loaded with no binder open: nothing is added
	await p.ev(`(async () => { await app.plugins.disablePlugin('binders'); await app.plugins.enablePlugin('binders'); })().then(() => 1)`);
	await until(p, `!!app.plugins.plugins.binders?.explorer`);
	await p.ev(`app.plugins.plugins.binders.binders.ready.then(() => 1)`);
	await h.open(KEEPER);
	await p.sleep(600);
	t.eq(j(await both(p)), j([0, 0]), 'with no binder view open, neither tab is added (a note of a binder in a tab isn’t one)');
	const front = await fronts(p);
	await openView(p);
	t.ok(await until(p, `app.workspace.getLeavesOfType('binders-contents').length === 1 && app.workspace.getLeavesOfType('binders-inspector').length === 1`), 'a binder opened: both are there: ' + j(await both(p)));
	t.ok(await p.ev(`['binders-contents', 'binders-inspector'].every(t => app.workspace.getLeavesOfType(t)[0].getRoot() === app.workspace.rightSplit)`), 'in the right sidebar');
	t.ok(await p.ev(`app.workspace.getLeavesOfType('binders-contents')[0].parent === app.workspace.getLeavesOfType('binders-inspector')[0].parent`), 'together, among the same tabs');
	t.ok(await p.ev(`app.workspace.rightSplit.collapsed`), 'which stays shut');
	t.eq(j(await fronts(p)), j(front), 'the tab in front there is the one that was');
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf()?.view.getViewType()`), 'binders-view', 'and the binder has the focus, not the sidebar');
	// another binder, and the same one in another tab: nothing more
	await openView(p, 'Longform demo', 'tab');
	await openView(p, 'The Lighthouse/Part One', 'tab');
	await p.sleep(500);
	t.eq(j(await both(p)), j([1, 1]), 'more binder views add no more tabs');
	// the writer moves one to the left sidebar: it is still the one
	await p.ev(`(async () => { const ws = app.workspace; ws.detachLeavesOfType('binders-contents'); const l = ws.getLeftLeaf(false); await l.setViewState({ type: 'binders-contents', active: false }); })().then(() => 1)`);
	await openView(p, 'The Lighthouse/Part Two', 'tab');
	await p.sleep(500);
	t.eq(j(await both(p)), j([1, 1]), 'one moved to the left sidebar isn’t added again on the right');
	// closed, it comes back with the next binder view
	await p.ev(`(() => { app.workspace.detachLeavesOfType('binders-inspector'); return 1; })()`);
	await p.sleep(300);
	t.eq(await leaves(p, 'binders-inspector'), 0, 'closed while a binder is open, it stays closed for now');
	await openView(p, 'The Lighthouse', 'tab');
	t.ok(await until(p, `app.workspace.getLeavesOfType('binders-inspector').length === 1`), 'and is back with the next binder view');
	t.ok(await p.ev(`app.workspace.rightSplit.collapsed`), 'the sidebar still shut');
	// the last binder view closed: they stay, as Outline stays with no note open
	await p.ev(`(() => { const all = []; app.workspace.iterateRootLeaves(l => { all.push(l); }); all.forEach(l => l.detach()); return 1; })()`);
	await p.sleep(500);
	t.eq(j(await both(p)), j([1, 1]), 'with every binder view closed, both stay');
	t.ok(/No binder is open/.test(await p.ev(`document.querySelector(${j(I)})?.textContent ?? ''`)), 'the inspector saying there is none');
	t.eq(p.errors.filter((e) => !e.includes('Electron Security')).join('\n'), '', 'no errors');
});

test('“Show the inspector and contents with a binder” turned off: nothing is added, and a closed tab stays closed', async (p, h, t) => {
	await bare(p);
	await p.ev(`(async () => { const pl = ${PL}; pl.settings.sidePanes = false; await pl.saveSettings(); })().then(() => 1)`);
	await openView(p);
	await p.sleep(700);
	t.eq(j(await both(p)), j([0, 0]), 'a binder opened with it off: neither tab');
	await h.run('show-inspector');
	await until(p, `app.workspace.getLeavesOfType('binders-inspector').length === 1`);
	await p.ev(`(() => { app.workspace.detachLeavesOfType('binders-inspector'); app.workspace.rightSplit.collapse(); return 1; })()`);
	await openView(p, 'Longform demo', 'tab');
	await p.sleep(700);
	t.eq(j(await both(p)), j([0, 0]), 'opened by its command, then closed: another binder doesn’t bring it back');
	// the switch is in the settings, and on again it does what it says
	await p.ev(`(() => { app.setting.open(); app.setting.openTabById('binders'); return 1; })()`);
	await p.sleep(700);
	// (the settings may be in a window of their own: looked for in their tab, and clicked there)
	const sw = `[...(app.setting.activeTab?.containerEl.querySelectorAll('.setting-item') ?? [])].find(e => e.querySelector('.setting-item-name')?.textContent === 'Show the inspector and contents with a binder')?.querySelector('.checkbox-container')`;
	t.ok(await until(p, `!!(${sw})`), 'the setting is in the settings');
	t.ok(await p.ev(`!(${sw}).classList.contains('is-enabled')`), 'and off');
	await p.ev(`(() => { (${sw}).click(); return 1; })()`);
	await until(p, `${PL}.settings.sidePanes === true`);
	t.ok(await p.ev(`${PL}.settings.sidePanes === true`), 'a click turns it on');
	await p.ev(`(() => { app.setting.close(); return 1; })()`);
	await openView(p, 'The Lighthouse/Part One', 'tab');
	t.ok(await until(p, `app.workspace.getLeavesOfType('binders-contents').length === 1 && app.workspace.getLeavesOfType('binders-inspector').length === 1`), 'and the next binder has both: ' + j(await both(p)));
});

test('a binder view brought back with the workspace at startup has both tabs too, the sidebar as it was left', async (p, h, t) => {
	await openView(p);
	await bare(p);
	await p.ev(`(async () => { await app.workspace.saveLayout?.(); })().then(() => 1)`);
	await p.sleep(400);
	await reload(p);
	await p.focusMain();
	t.ok(await until(p, `app.workspace.getLeavesOfType('binders-view').length === 1`, 6000), 'the binder view came back');
	t.ok(await until(p, `app.workspace.getLeavesOfType('binders-contents').length === 1 && app.workspace.getLeavesOfType('binders-inspector').length === 1`, 6000), 'and both tabs are in the sidebar: ' + j(await both(p)));
	t.ok(await p.ev(`app.workspace.rightSplit.collapsed`), 'which is shut, as it was left');
	await p.sleep(500);
	t.eq(j(await both(p)), j([1, 1]), 'one of each');
});

test('“Show inspector” and “Show contents” show the tab there is, or make one', async (p, h, t) => {
	await bare(p);
	await p.ev(`(async () => { const pl = ${PL}; pl.settings.sidePanes = false; await pl.saveSettings(); })().then(() => 1)`);
	await h.run('show-inspector');
	await until(p, `app.workspace.getLeavesOfType('binders-inspector').length === 1 && !app.workspace.rightSplit.collapsed`);
	t.ok(await p.ev(`!app.workspace.rightSplit.collapsed`), '“Show inspector” opens the sidebar on it');
	await h.run('show-inspector');
	await p.sleep(300);
	t.eq(await leaves(p, 'binders-inspector'), 1, 'asked again, it is the same tab');
	// the contents: by their command, and from the binder view's "More options"
	await openView(p);
	const more = await p.ev(`(() => { const b = ${VIEW}.containerEl.querySelector('.view-actions [aria-label="More options"]'); const r = b?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
	await p.click(more.x, more.y);
	await p.sleep(300);
	const titles = await menuItems(p);
	t.ok(titles.includes('Show contents'), 'the binder view’s “More options” has “Show contents”: ' + titles.join(', '));
	await clickMenu(p, 'Show contents');
	await until(p, `app.workspace.getLeavesOfType('binders-contents').length === 1`);
	t.eq(await leaves(p, 'binders-contents'), 1, 'which shows them');
	t.ok(await until(p, `document.querySelectorAll(${j(C + ' .tree-item-self[data-path]')}).length > 5`), 'with the book in them');
});

// ---- the contents ----

test('contents: the whole book in binder order, the row you are on marked; a click goes there in the manuscript without opening a tab', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	const want = await p.ev(`(() => { const s = ${PL}.binders, out = []; const walk = (f) => { for (const c of s.orderedChildren(f)) { out.push(c.path); if (c.children) walk(c); } }; const b = app.vault.getAbstractFileByPath('The Lighthouse'); walk(b); return [b.path, ...out]; })()`);
	t.eq(j(await rows(p)), j(want), 'every note and folder, in the binder’s order, under the book’s name');
	t.ok(!(await rows(p)).includes(NOTE), 'the binder’s own note isn’t one of them');
	t.eq(await here(p), ARRIVAL, 'the row of the section with the cursor is marked');
	await clickSection(p, 'He met her at the foot');
	t.ok(await until(p, `document.querySelector(${j(C + ' .tree-item-self.is-active')})?.dataset.path === ${j(KEEPER)}`), 'the mark follows the cursor: ' + await here(p));
	const tabs = () => p.ev(`(() => { let n = 0; app.workspace.iterateRootLeaves(() => { n++; }); return n; })()`);
	const n = await tabs();
	await clickRow(p, LIGHTS);
	t.ok(await until(p, `${VIEW}.currentItem()?.path === ${j(LIGHTS)}`), 'a click on a row puts the cursor in that section: ' + await p.ev(`${VIEW}.currentItem()?.path`));
	t.eq(await tabs(), n, 'in the same tab: none was opened');
	t.eq(await here(p), LIGHTS, 'and the mark is there');
	t.ok(await onItem(p, 'Lights out'), 'the inspector too: ' + await name(p));
	// Mod-click opens the note in a tab of its own, as everywhere
	await clickRow(p, L + 'Epilogue.md', { modifiers: 2 });
	t.eq(await tabs(), n + 1, 'a Mod-click opens a tab');
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), L + 'Epilogue.md', 'on that note');
	// with only a note open, a click opens the note where the writer is
	await clickRow(p, L + 'Prologue.md');
	t.eq(await p.ev(`app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.file?.path`), L + 'Prologue.md', 'from a note in a tab, a click opens the note there');
	t.eq(await tabs(), n + 1, 'in that tab');
	// a note outside the binder: the book stays, with nowhere marked
	await p.ev(`(async () => { await app.vault.create('Loose.md', 'Not in any binder.\\n'); await app.workspace.getMostRecentLeaf(app.workspace.rootSplit).openFile(app.vault.getAbstractFileByPath('Loose.md')); })().then(() => 1)`);
	await p.sleep(500);
	t.eq(j(await rows(p)), j(want), 'looking at a note outside the binder, the book is still listed');
	t.eq(await here(p), null, 'with nowhere marked');
	t.eq(p.errors.filter((e) => !e.includes('Electron Security')).join('\n'), '', 'no errors');
});

test('contents: on the corkboard a click opens the note’s folder and selects its card; in the outliner it selects the row', async (p, h, t) => {
	await open(p, 'corkboard');
	await clickRow(p, WRECK);
	t.ok(await until(p, `${VIEW}.folder.path === 'The Lighthouse/Part Two'`), 'the board went to the folder the note is in: ' + await p.ev(`${VIEW}.folder.path`));
	t.ok(await until(p, `${VIEW}.selectedItems().some(f => f.path === ${j(WRECK)})`), 'and its card is selected');
	t.ok(await onItem(p, 'The wreck'), 'the inspector is on it: ' + await name(p));
	await clickRow(p, 'The Lighthouse/Part One');
	t.ok(await until(p, `${VIEW}.folder.path === 'The Lighthouse/Part One'`), 'a click on a folder opens it on the board');
	await clickRow(p, 'The Lighthouse');
	t.ok(await until(p, `${VIEW}.folder.path === 'The Lighthouse'`), 'and a click on the book’s name shows the whole of it');
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await p.sleep(500);
	await clickRow(p, STORM);
	t.ok(await until(p, `${VIEW}.selectedItems().some(f => f.path === ${j(STORM)})`), 'the outliner: the row is selected');
	t.eq(await p.ev(`${VIEW}.folder.path`), 'The Lighthouse', 'without going anywhere');
});

test('contents: a change puts right the rows that differ and leaves the rest; folding is kept with the view; a Longform project keeps its indents', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	await p.ev(`(() => { for (const e of document.querySelectorAll(${j(C + ' .tree-item-self[data-path]')})) e.__was = true; return 1; })()`);
	const kept = () => p.ev(`[...document.querySelectorAll(${j(C + ' .tree-item-self[data-path]')})].filter(e => e.__was).map(e => e.dataset.path)`);
	const all = await rows(p);
	// a label, a new note, a rename, a move, a delete
	await p.ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${j(KEEPER)}), (m) => { m.label = 'Red'; }).then(() => 1)`);
	t.ok(await until(p, `!!document.querySelector(${j(row(KEEPER) + ' .binders-label-dot')})`), 'a label given to a note shows on its row');
	t.eq((await kept()).length, all.length, 'and no row was made again for it');
	await p.ev(`${PL}.binders.newScene(app.vault.getAbstractFileByPath('The Lighthouse/Part One'), 1, 'The path').then(() => 1)`);
	t.ok(await until(p, `!!document.querySelector(${j(row(L + 'Part One/The path.md'))})`), 'a new note gets a row');
	const now = await rows(p);
	t.eq(now.indexOf(L + 'Part One/The path.md'), now.indexOf(ARRIVAL) + 1, 'where it is in the binder');
	t.eq((await kept()).length, all.length, 'and the rows there were are the rows there are');
	await p.ev(`${PL}.binders.put([app.vault.getAbstractFileByPath(${j(ARRIVAL)})], app.vault.getAbstractFileByPath('The Lighthouse/Part One'), null).then(() => 1)`);
	t.ok(await until(p, `(() => { const r = [...document.querySelectorAll(${j(C + ' .tree-item-self[data-path]')})].map(e => e.dataset.path); return r.indexOf(${j(ARRIVAL)}) === r.indexOf(${j(STORM)}) + 1; })()`), 'a note moved to the end of its folder is last there: ' + (await rows(p)).join(', '));
	t.eq((await kept()).length, all.length, 'its row moved; it wasn’t made again');
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(L + 'Part One/The path.md')})).then(() => 1)`);
	t.ok(await until(p, `!document.querySelector(${j(row(L + 'Part One/The path.md'))})`), 'a deleted note’s row goes');
	// folding: out of sight, the mark on the folder, and kept with the view
	const fold = await p.at(`${row('The Lighthouse/Part One')} .collapse-icon`);
	await p.click(fold.x, fold.y);
	await p.sleep(300);
	t.ok(!(await rows(p)).includes(KEEPER), 'a folded folder’s rows are out of sight');
	t.eq(await here(p), 'The Lighthouse/Part One', 'the mark is on the folder the cursor’s section is in');
	const state = await p.ev(`JSON.stringify(app.workspace.getLeavesOfType('binders-contents')[0].getViewState())`);
	t.ok(JSON.parse(state).state.folded.includes('The Lighthouse/Part One'), 'the fold is in the view’s state: ' + state);
	await p.ev(`(async () => { const ws = app.workspace; ws.detachLeavesOfType('binders-contents'); const l = ws.getRightLeaf(false); await l.setViewState(${state}); ws.revealLeaf(l); })().then(() => 1)`);
	await until(p, `document.querySelectorAll(${j(C + ' .tree-item-self[data-path]')}).length > 5`);
	await p.sleep(300);
	t.ok(!(await rows(p)).includes(KEEPER) && (await rows(p)).includes('The Lighthouse/Part One'), 'a view made again from that state has it folded: ' + (await rows(p)).join(', '));
	// a Longform project: scenes indented under a scene are under it here
	await openView(p, 'Longform demo');
	await until(p, `document.querySelector(${j(C + ' .binders-contents-book')})?.textContent === 'Longform demo'`);
	const depth = await p.ev(`(() => { const d = (path) => { const e = document.querySelector(${j(C)} + ' .tree-item-self[data-path="' + path + '"]'); let n = 0; for (let x = e?.parentElement; x && !x.classList.contains('binders-contents-list'); x = x.parentElement) if (x.classList.contains('tree-item-children')) n++; return e ? n : -1; }; return { harbor: d('Longform demo/Harbor.md'), ticket: d('Longform demo/Ticket office.md'), crossing: d('Longform demo/The crossing.md'), island: d('Longform demo/Island.md') }; })()`);
	t.eq(j(depth), j({ harbor: 0, ticket: 1, crossing: 1, island: 0 }), 'the project’s indented scenes are indented');
});

test('contents: the keys that walk the file explorer walk it', async (p, h, t) => {
	await open(p, 'manuscript');
	await reveal(p, ARRIVAL);
	const focused = () => p.ev(`document.activeElement?.dataset?.path ?? null`);
	await p.ev(`(() => { document.querySelector(${j(row('The Lighthouse/Prologue.md'))}).focus(); return 1; })()`);
	t.eq(await p.ev(`document.querySelectorAll(${j(C + ' .tree-item-self[tabindex="0"]')}).length`), 1, 'one row is the stop for Tab');
	await p.key('ArrowDown');
	t.eq(await focused(), 'The Lighthouse/Part One', 'down: the next row');
	await p.key('ArrowRight');
	t.eq(await focused(), ARRIVAL, 'right on an open folder: its first row');
	await p.key('ArrowDown');
	t.eq(await focused(), KEEPER, 'down again');
	await p.key('ArrowLeft');
	t.eq(await focused(), 'The Lighthouse/Part One', 'left on a note: its folder');
	await p.key('ArrowLeft');
	t.ok(!(await rows(p)).includes(ARRIVAL), 'left on an open folder folds it');
	await p.key('ArrowDown');
	t.eq(await focused(), 'The Lighthouse/Part Two', 'down from a folded folder passes what is in it');
	await p.key('ArrowUp');
	await p.key('ArrowRight');
	t.ok((await rows(p)).includes(ARRIVAL), 'right on a folded folder opens it');
	await p.key('End');
	t.eq(await focused(), L + 'Epilogue.md', 'End: the last row');
	await p.key('Home');
	t.eq(await focused(), 'The Lighthouse', 'Home: the book');
	await p.ev(`(() => { document.querySelector(${j(row(LIGHTS))}).focus(); return 1; })()`);
	await p.key('Enter');
	t.ok(await until(p, `${VIEW}.currentItem()?.path === ${j(LIGHTS)}`), 'Enter goes there: ' + await p.ev(`${VIEW}.currentItem()?.path`));
});

// ---- a phone and a tablet ----

const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
async function onDevice(p, width, height, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
	}
}
for (const [device, width, height] of [['a phone', 390, 844], ['a tablet', 820, 1180]]) {
	test(`${device}: the inspector is a page of the right drawer, put there with the binder and not opened, on the section last tapped; a synopsis typed there is saved; a tap in the contents goes there`, async (p, h, t) => {
		await onDevice(p, width, height, async () => {
			await p.ev(`(() => { for (const t of ['binders-inspector', 'binders-contents']) app.workspace.detachLeavesOfType(t); return 1; })()`);
			await openView(p);
			t.ok(await until(p, `app.workspace.getLeavesOfType('binders-contents').length === 1 && app.workspace.getLeavesOfType('binders-inspector').length === 1`, 5000), 'a binder opened: both are pages of the drawer');
			t.ok(await p.ev(`app.workspace.rightSplit.collapsed === true && app.workspace.getLeavesOfType('binders-inspector')[0].getRoot() === app.workspace.rightSplit`), 'the right one, which isn’t opened for it');
			await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
			await p.sleep(1500);
			const at = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.textContent.includes('The supply boat left')); const x = s?.querySelector('.cm-line, p'); const r = x?.getBoundingClientRect(); return r ? { x: r.left + 60, y: r.top + 12 } : null; })()`);
			await tap(p, at.x, at.y);
			await p.sleep(700);
			await p.ev(`(async () => { document.activeElement?.blur?.(); await app.commands.executeCommandById('binders:show-inspector'); })().then(() => 1)`);
			await until(p, `!!document.querySelector(${j(I + ' .binders-inspector-name')})?.offsetParent`, 5000);
			t.ok(await onItem(p, 'Arrival'), 'it is on the section that was tapped: ' + await name(p));
			await until(p, `(() => { const r = document.querySelector(${j(I)}).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })()`, 5000);
			await p.sleep(300);
			const fits = await p.ev(`(() => { const pane = document.querySelector(${j(I)}), r = pane.getBoundingClientRect(); const rowsH = [...pane.querySelectorAll('.metadata-property')].map(e => Math.round(e.getBoundingClientRect().height)); return { left: Math.round(r.left), right: Math.round(r.right), wide: innerWidth, over: pane.scrollWidth - pane.clientWidth, rowsH, font: parseFloat(getComputedStyle(pane.querySelector('.binders-inspector-synopsis')).fontSize) }; })()`);
			t.ok(fits.left >= 0 && fits.right <= fits.wide && fits.over <= 0, 'the pane is within the screen, with nothing to scroll sideways: ' + j(fits));
			t.ok(fits.rowsH.every((x) => x >= 44), 'every row is tall enough for a finger: ' + fits.rowsH.join(', '));
			t.ok(fits.font >= 16, 'what is typed in is at 16px or more, so the page isn’t zoomed: ' + fits.font);
			const syn = await p.at(fieldSel('synopsis'));
			await tap(p, syn.x, syn.y);
			if ((await typing(p, 'synopsis')) == null) await tap(p, syn.x, syn.y);
			await p.ev(`(() => { const f = document.querySelector(${j(fieldSel('synopsis') + ' textarea')}); f?.setSelectionRange(f.value.length, f.value.length); return !!f; })()`);
			await p.type(' By touch.');
			// (there's no Mod-Enter on a phone: a tap elsewhere in the pane leaves the field)
			const head = await p.at(`${I} .binders-inspector-name`);
			await tap(p, head.x, head.y);
			await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(ARRIVAL)}))?.frontmatter?.synopsis?.endsWith('By touch.')`, 5000);
			t.ok(((await fm(p, ARRIVAL)).synopsis ?? '').endsWith('By touch.'), 'a synopsis typed in the drawer is in the note: ' + (await fm(p, ARRIVAL)).synopsis);
			await p.ev(`app.commands.executeCommandById('binders:show-contents')`);
			await until(p, `(() => { const r = document.querySelector(${j(row(LIGHTS))})?.getBoundingClientRect(); return !!r && r.width > 0 && r.left >= 0 && r.right <= innerWidth + 1; })()`, 5000);
			await p.sleep(300);
			t.eq(await here(p), ARRIVAL, 'the contents mark where the writer is');
			await p.ev(`(() => { document.querySelector(${j(row(LIGHTS))}).scrollIntoView({ block: 'center' }); return 1; })()`);
			const r = await p.at(`${row(LIGHTS)} .tree-item-inner`);
			await tap(p, r.x, r.y);
			await p.sleep(900);
			const went = await p.ev(`(() => { const s = [...document.querySelectorAll('.binders-manuscript-scene')].find(e => e.textContent.trim().startsWith('Lights out')), r = s?.getBoundingClientRect(), root = document.querySelector('.binders-manuscript').getBoundingClientRect(); return { top: r ? Math.round(r.top) : null, from: Math.round(root.top), to: Math.round(root.bottom), shut: app.workspace.rightSplit.collapsed === true, front: app.workspace.getMostRecentLeaf()?.view.getViewType() }; })()`);
			t.ok(went.top != null && went.top >= went.from - 1 && went.top < went.to, 'a tap on a row brings that section into sight in the manuscript: ' + j(went));
			t.eq(went.front, 'binders-view', 'and the manuscript is the tab in front');
			if (device === 'a phone') t.ok(went.shut, 'on a phone the drawer gets out of its way: ' + j(went));
		});
	});
}
