// Saved filters and writing (golden rules 2 and 3). A note that stops matching the filter stays on the page, marked, until the
// writer presses Refresh or changes the conditions: with the cursor in a scene and typing not yet saved, a status set from the
// inspector, from another pane, from another device and by Undo and Redo leaves the scroll position, the focus, the caret and
// every typed character as they were. And filtering, opening the popover and switching filters write nothing to any note.
import { B, PL, VIEW, file, j, read, texts, until, viewState, withTidy } from './view-helpers.mjs';
import { clearFilter, closeFilter, filterBy, openFilter, tick } from './filter-helpers.mjs';
import { ITEMS, FILES, tide, setMode } from './specs-filters.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'filters writing: ' + name, fn: withTidy(fn) });
const T = 'Tide', LEAF = '.workspace-leaf.mod-active';
const ARRIVAL = `${T}/One/Arrival.md`;

const LONG = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} of a long scene, to have something to scroll past.`).join('\n\n');
const LONGS = ITEMS.map((it) => ({ ...it, text: it.text.replace(/\n---\n[\s\S]*$/, `\n---\n${LONG}\n`) }));
const M = `${VIEW}.current`;
const scene = (path) => `${M}.scenes.find(s => s.file.path === ${j(path)})`;

/** Where the page, the focus and the caret are (the caret as how far it is from the end of the text: a note's properties are in the
    editor's text, and a status set from outside rewrites them above it), and whether the typed text is in the editor. */
const where = (p, path, typed) => p.ev(`(() => {
	const s = ${scene(path)}, cm = s?.live?.cm;
	let el = s?.el, scroller = null;
	while (el && !scroller) { el = el.parentElement; if (el && el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible') scroller = el; }
	return { here: !!s, scroll: Math.round(scroller?.scrollTop ?? -1), focused: !!cm && cm.dom.contains(document.activeElement), head: cm ? cm.state.doc.length - cm.state.selection.main.head : -1, typed: !!cm && cm.state.doc.toString().includes(${j(typed)}), 		mark: !!s?.el.querySelector(':scope > .binders-manuscript-unmatched') };
})()`);
/** The caret at the end of a section's text, the section scrolled to, and some typing that is not saved yet. */
async function typeIn(p, path, text) {
	await p.ev(`${scene(path)}.el.scrollIntoView({ block: 'start' })`);
	await until(p, `!!${scene(path)}?.live`, 8000);
	await p.sleep(300);
	await p.ev(`(() => { const s = ${scene(path)}; const cm = s.live.cm; cm.focus(); cm.dispatch({ selection: { anchor: cm.state.doc.length }, scrollIntoView: false }); return 1; })()`);
	await p.sleep(300);
	await p.type(text);
}
const status = (p, path) => p.ev(`app.metadataCache.getFileCache(${file(path)})?.frontmatter?.status ?? null`);
const frontmatterSet = (p, path, status) => p.ev(`app.fileManager.processFrontMatter(${file(path)}, (fm) => { fm.status = ${j(status)}; }).then(() => 1)`);

async function ready(p) {
	await tide(p, 'manuscript', LONGS);
	await filterBy(p, { status: ['Draft'] });
	await p.sleep(600);
}
/** One proof: typing not saved, then `change`; the page is as it was and says so. */
async function proof(t, p, change, what) {
	await typeIn(p, ARRIVAL, ' UNSAVEDWORDS');
	const before = await where(p, ARRIVAL, 'UNSAVEDWORDS');
	t.ok(before.here && before.focused && before.typed, `${what}: typing, not saved yet: ` + j(before));
	await change();
	await p.sleep(900);
	const after = await where(p, ARRIVAL, 'UNSAVEDWORDS');
	t.ok(after.here, `${what}: the section is still on the page`);
	t.eq(after.mark, true, `${what}: and says it no longer matches`);
	t.eq(j([after.scroll, after.focused, after.head, after.typed]), j([before.scroll, true, before.head, true]), `${what}: scroll position, focus, caret and every typed character are as they were`);
	t.ok(!!(await p.ev(`document.querySelector('${LEAF} .binders-scope-stale')?.textContent`)), `${what}: the scope line counts it`);
}

test('a status set from the inspector leaves the section under the cursor, the scroll, the caret and the typing alone', async (p, h, t) => {
	await ready(p);
	await proof(t, p, () => frontmatterSet(p, ARRIVAL, 'Revised'), 'from the inspector');
	await p.sleep(2500);
	const disk = await read(p, ARRIVAL);
	t.ok(disk.includes('UNSAVEDWORDS') && /status: Revised/.test(disk), 'on disk: the typed words and the new status, both: ' + disk.slice(0, 80));
	t.eq((disk.match(/UNSAVEDWORDS/g) ?? []).length, 1, 'the typing is there once');
});

test('a status set from the outliner in another pane (the view’s own writer), then Undo and Redo', async (p, h, t) => {
	await ready(p);
	await proof(t, p, () => p.ev(`${VIEW}.setProps(app.vault.getAbstractFileByPath(${j(ARRIVAL)}), { status: 'Revised' }).then(() => 1)`), 'from another pane');
	// Undo puts the status back: the mark goes, the typing stays
	const before = await where(p, ARRIVAL, 'UNSAVEDWORDS');
	await p.ev(`${PL}.undoMove(app.vault.getAbstractFileByPath('${T}'), false).then(() => 1)`);
	await p.sleep(1200);
	const undone = await where(p, ARRIVAL, 'UNSAVEDWORDS');
	t.eq(await status(p, ARRIVAL), 'Draft', 'Undo: the status is back');
	t.eq(j([undone.here, undone.mark, undone.scroll, undone.focused, undone.head, undone.typed]), j([true, false, before.scroll, true, before.head, true]), 'Undo: the mark goes; scroll, focus, caret and typing are as they were');
	await p.ev(`${PL}.undoMove(app.vault.getAbstractFileByPath('${T}'), true).then(() => 1)`);
	await p.sleep(1200);
	const redone = await where(p, ARRIVAL, 'UNSAVEDWORDS');
	t.eq(await status(p, ARRIVAL), 'Revised', 'Redo: the status is Revised again');
	t.eq(j([redone.here, redone.mark, redone.scroll, redone.focused, redone.head, redone.typed]), j([true, true, before.scroll, true, before.head, true]), 'Redo: the mark is back; scroll, focus, caret and typing are as they were');
});

test('a status changed by another device (the file rewritten from outside) while text is being typed', async (p, h, t) => {
	await ready(p);
	// (the note as it is on disk, with only its status changed: a sync of a change made elsewhere)
	await proof(t, p, async () => {
		const text = await read(p, ARRIVAL);
		await p.ev(`app.vault.adapter.write(${j(ARRIVAL)}, ${j(text.replace('status: Draft', 'status: Revised'))}).then(() => 1)`);
	}, 'from another device');
	await p.sleep(2500);
	const disk = await read(p, ARRIVAL);
	t.ok(disk.includes('UNSAVEDWORDS'), 'the typed words reach the note: ' + disk.length);
});

test('another note stopping to match leaves the page where it is; Refresh lets it go, but the section being typed in stays', async (p, h, t) => {
	await ready(p);
	await typeIn(p, ARRIVAL, ' UNSAVEDWORDS');
	const before = await where(p, ARRIVAL, 'UNSAVEDWORDS');
	await frontmatterSet(p, `${T}/Prologue.md`, 'Final');
	await frontmatterSet(p, ARRIVAL, 'Final');
	await p.sleep(900);
	t.eq(j(await p.ev(`${M}.scenes.map(s => s.file.basename)`)), j(['Prologue', 'Arrival', 'Dawn']), 'nothing leaves the page by itself');
	t.eq(await p.ev(`document.querySelector('${LEAF} .binders-scope-stale')?.textContent`), '2 no longer match', 'the line counts both');
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-manuscript-unmatched').length`), 2, 'and each says it');
	await p.ev(`document.querySelector('${LEAF} .binders-scope-refresh').click()`);
	await p.sleep(900);
	t.eq(j(await p.ev(`${M}.scenes.map(s => s.file.basename)`)), j(['Arrival', 'Dawn']), 'Refresh: the one not being typed in goes, the one under the cursor stays');
	const after = await where(p, ARRIVAL, 'UNSAVEDWORDS');
	t.eq(j([after.focused, after.head, after.typed]), j([true, before.head, true]), 'with its focus, caret and typing');
	t.eq(after.mark, true, 'still said to match no longer');
	// leaving it, then Refresh: now it goes
	await p.ev(`document.activeElement.blur()`);
	await p.sleep(2500);
	await p.ev(`document.querySelector('${LEAF} .binders-scope-refresh').click()`);
	await p.sleep(900);
	t.eq(j(await p.ev(`${M}.scenes.map(s => s.file.basename)`)), j(['Dawn']), 'the cursor elsewhere, Refresh lets it go');
	t.ok((await read(p, ARRIVAL)).includes('UNSAVEDWORDS'), 'and what was typed in it is in its note');
});

test('changing the conditions lets go of what no longer matches; renaming mode or filter name does not', async (p, h, t) => {
	await tide(p, 'corkboard');
	await filterBy(p, { status: ['Draft'] });
	await frontmatterSet(p, `${T}/Prologue.md`, 'Final');
	await p.sleep(700);
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card.is-unmatched').length`), 1, 'a card of a note that no longer matches is dimmed');
	t.eq((await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path)`)).includes(`${T}/Prologue.md`), true, 'and stays');
	await setMode(p, 'outliner');
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-outliner-row.is-unmatched').length`), 1, 'a switch of mode keeps it: the outliner’s row is dimmed too');
	await setMode(p, 'timeline');
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card.is-unmatched').length`), 1, 'and the timeline’s card');
	await setMode(p, 'corkboard');
	await tick(p, 'status', 'Revised');
	await closeFilter(p);
	t.eq((await p.ev(`[...document.querySelectorAll('${LEAF} .binders-card[data-path]')].map(c => c.dataset.path)`)).includes(`${T}/Prologue.md`), false, 'a change of the conditions lets it go');
	t.eq(await p.ev(`document.querySelectorAll('${LEAF} .binders-card.is-unmatched').length`), 0, 'nothing dimmed');
});

test('filtering, opening the popover and switching filters and modes write nothing to any note', async (p, h, t) => {
	await tide(p, 'corkboard');
	const before = await texts(p);
	await filterBy(p, { status: ['Draft'], label: ['Red'] });
	await openFilter(p);
	await closeFilter(p);
	for (const m of ['outliner', 'manuscript', 'timeline', 'corkboard']) await setMode(p, m);
	await clearFilter(p);
	await p.sleep(1500);
	const after = await texts(p);
	t.eq(j(after), j(before), 'every note is byte for byte what it was');
});
