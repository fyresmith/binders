// The Revision pane, ticking and the walk (src/inspector/revision-pane.ts, src/revision/store.ts): the tasks under the
// scenes they are about in manuscript order; one character changes when a box is ticked and nothing else; a line
// that has changed since it was read is refused and said; going to a scene in the binder view's mode; the walk; the
// pane is a third following view, opened only by its command; a phone's drawer.
import { mkdirSync } from 'fs';
import { B, NOTE, PL, VIEW, card, exists, file, flush, j, openView, read, reload, texts, tidy, until, withTidy } from './view-helpers.mjs';
import { BN, L, REV, TASKS, listing, seed } from './specs-revision.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'revision pane: ' + name, fn: withTidy(fn) });
const R = `${PL}.revision`;
const SHOTS = process.env.REVISION_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const PANE = '.workspace-leaf-content[data-type="binders-revision"] .binders-revision';
const ARR = `${L}/Part One/Arrival.md`;
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map((n) => n.textContent).join('|')`);
const wipeNotices = (p) => p.ev(`document.querySelectorAll('.notice').forEach((n) => n.remove())`);

/** The note as the seed makes it, plus a note outside the binder for the task that names it. */
const SEED = TASKS;
async function seeded(p, text = SEED) {
	await p.ev(`app.vault.create('Elsewhere note.md', 'A note outside the binder.').then(() => 1)`);
	await seed(p, text);
	// the pane shows the binder the binder view has open: a test starts with one open, as a writer's session does
	await openView(p, L);
	await until(p, `${R}.list(${BN}).groups.length > 0`);
}
async function showPane(p) {
	await run(p, 'show-revision');
	await until(p, `!!document.querySelector(${j(PANE)})`);
	await p.sleep(400);
	// (a pane left in the sidebar by an earlier test keeps "Show done" as it was)
	await p.ev(`document.querySelector(${j(PANE + ' .binders-revision-done.is-active')})?.click()`);
	await p.sleep(200);
}
/** What the pane shows: each heading with the text of the tasks under it. */
const shown = (p) => p.ev(`[...document.querySelectorAll(${j(PANE + ' .binders-revision-group')})].map((g) => [g.querySelector('.binders-revision-about .tree-item-inner')?.textContent, [...g.querySelectorAll('.binders-revision-task .binders-revision-text')].map((x) => x.textContent), g.querySelector('.tree-item-flair')?.textContent ?? ''])`);
const foot = (p) => p.ev(`document.querySelector(${j(PANE + ' .binders-revision-foot')})?.textContent ?? ''`);
const rowFor = (text) => `[...document.querySelectorAll(${j(PANE + ' .binders-revision-task')})].find((r) => r.textContent.includes(${j(text)}))`;
async function tickRow(p, text) {
	const at = await p.ev(`(() => { const r = ${rowFor(text)}, b = r?.querySelector('input'); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
	if (!at) throw new Error('no task row: ' + text);
	await p.click(at.x, at.y);
	await p.sleep(500);
}
async function clickRow(p, sel) {
	const at = await p.ev(`(() => { const r = ${sel}; if (!r) return null; r.scrollIntoView({ block: 'nearest' }); const q = r.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
	if (!at) throw new Error('nothing to click: ' + sel);
	await p.click(at.x, at.y);
	await p.sleep(600);
}
const heading = (name) => `[...document.querySelectorAll(${j(PANE + ' .binders-revision-about')})].find((h) => h.textContent.startsWith(${j(name)}))`;
const diff = (a, b) => [...a].filter((c, i) => c !== b[i]).length;

test('the pane is opened by its command only, says there are no tasks, and a note’s tasks fill it under the scenes in manuscript order', async (p, h, t) => {
	await openView(p, L);
	await p.sleep(500);
	t.eq(await p.ev(`app.workspace.getLeavesOfType('binders-revision').length`), 0, 'not in the sidebar unasked, with the inspector and the contents');
	await showPane(p);
	t.eq(await p.ev(`document.querySelector(${j(PANE + ' .pane-empty')})?.textContent`), 'No revision tasks yet.Add one for the scene you are in with the plus above, or the command “Add revision task”.', 'with no note: it says so, and how to add one');
	await p.ev(`app.vault.create('Elsewhere note.md', 'A note outside the binder.').then(() => 1)`);
	await seed(p);
	await until(p, `document.querySelectorAll(${j(PANE + ' .binders-revision-group')}).length > 0`);
	const g = await shown(p);
	t.eq(j(g.map((x) => x[0])), j(['The Lighthouse', 'Arrival', 'The wreck', 'Lights out', 'Epilogue', 'Elsewhere note', 'Nowhere at all']), 'the book first, then the scenes in manuscript order (the done one folded away), then the note outside and the missing one: ' + j(g.map((x) => x[0])));
	t.eq(j(g[0][1]), j(['Check the tides against the almanac']), 'a task with no link is about the book');
	t.eq(g[5][2], 'Not in this binder', 'a link to a note outside the binder says so');
	t.eq(g[6][2], 'Not found', 'a link to nothing says “Not found”');
	t.eq(await foot(p), '6 unfinishedShow 1 done', 'the count is at the foot, with the way to see the done');
	t.eq(j(g[2][1]), j(['two scenes at once']), 'a task about two scenes is under both…');
	t.eq(j(g[3][1]), j(['two scenes at once']), '…and listed in each');
	t.eq(await p.ev(`document.querySelector(${j(PANE + ' .binders-revision-quote')})?.textContent`), '“She had been told a man would meet her.”', 'the passage under its task');
	await shot(p, 'pane-computer');
	await p.ev(`document.querySelector(${j(PANE + ' .binders-revision-done')}).click()`);
	await p.sleep(300);
	t.ok((await shown(p)).some((x) => x[0] === 'The keeper'), '“Show 1 done” shows the done one, under its scene');
});

test('ticking a box changes the one character between the brackets and nothing else; unticking puts it back byte for byte', async (p, h, t) => {
	await seeded(p);
	await showPane(p);
	const was = await read(p, REV);
	await tickRow(p, 'say why nobody meets her');
	const now = await read(p, REV);
	t.eq(now.length, was.length, 'the note is as long as it was');
	t.eq(diff(was, now), 1, 'one character differs');
	t.eq(now, was.replace('- [ ] [[Arrival]]: SENTINEL-REVISION-TEXT say', '- [x] [[Arrival]]: SENTINEL-REVISION-TEXT say'), 'and it is the box of that task');
	t.ok(await p.ev(`${rowFor('say why nobody meets her')}?.classList.contains('is-done')`), 'the task stays in sight, struck through, until the writer moves on');
	t.eq(await foot(p), '5 unfinishedShow 2 done', 'and the count falls');
	// the same box again
	await tickRow(p, 'say why nobody meets her');
	t.eq(await read(p, REV), was, 'unticked: byte for byte what it was');
	// the other notes are untouched
	const all = await texts(p);
	t.ok(!!all[ARR], 'the scene’s note is there');
});

test('a task whose line has changed since it was read is not ticked, and that is said', async (p, h, t) => {
	await seeded(p);
	const task = await p.ev(`JSON.stringify(${R}.list(${BN}).groups.find((g) => g.place.name === 'Arrival').tasks[0])`).then(JSON.parse);
	// reworded by another device before the tick arrives
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j(TASKS.replace('say why nobody meets her', 'say why nobody comes'))}).then(() => 1)`);
	await wipeNotices(p);
	const before = await read(p, REV);
	const ok = await p.ev(`${R}.tick(${BN}, ${j(task)}, true)`);
	t.eq(ok, null, 'refused');
	t.eq(await read(p, REV), before, 'nothing was written');
	t.ok(/has changed/.test(await notices(p)), 'and it says so: ' + await notices(p));
	// lines added above it: the same words, found where they moved to
	await p.ev(`app.vault.adapter.write(${j(REV)}, ${j('- [ ] new at the top\n' + TASKS)}).then(() => 1)`);
	await p.sleep(400);
	t.ok(!!(await p.ev(`${R}.tick(${BN}, ${j(task)}, true)`)), 'a line that only moved down is still the same task');
	t.eq(await read(p, REV), '- [ ] new at the top\n' + TASKS.replace('- [ ] [[Arrival]]: SENTINEL-REVISION-TEXT say', '- [x] [[Arrival]]: SENTINEL-REVISION-TEXT say'), 'one box ticked, wherever it had moved');
});

test('typing in the revision note’s own tab, not yet saved, is on the disk before a box is ticked', async (p, h, t) => {
	await seeded(p);
	await showPane(p);
	await p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(REV)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await until(p, `app.workspace.activeEditor?.file?.path === ${j(REV)}`);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.replaceRange('TYPED-NOT-SAVED\\n', ed.offsetToPos(ed.getValue().length)); return 1; })()`);
	await tickRow(p, 'say why nobody meets her');
	const now = await read(p, REV);
	t.ok(now.endsWith('TYPED-NOT-SAVED\n'), 'what was typed is kept');
	t.ok(now.includes('- [x] [[Arrival]]: SENTINEL'), 'and the box is ticked');
	await p.sleep(2600);
	t.eq(await read(p, REV), now, 'the tab did not undo either once it saved');
	t.eq(await p.ev(`app.workspace.getLeavesOfType('markdown').find((l) => l.view.file?.path === ${j(REV)}).view.editor.getValue()`), now, 'and shows both');
});

test('the order follows the manuscript after a scene is moved', async (p, h, t) => {
	await seeded(p);
	await showPane(p);
	await p.ev(`${B}.moveDown(${file(L + '/Part Two/The wreck.md')}).then(() => 1)`);
	await flush(p);
	await p.sleep(600);
	t.eq(j((await shown(p)).map((x) => x[0]).slice(2, 4)), j(['Lights out', 'The wreck']), 'The wreck moved down: its tasks come after Lights out’s');
});

test('a click goes to the scene in the binder view’s own mode; with no binder view the note opens', async (p, h, t) => {
	await seeded(p);
	await openView(p, L);
	await showPane(p);
	// the corkboard: opens the folder and selects the card
	await clickRow(p, heading('Arrival'));
	t.eq(await p.ev(`${VIEW}.folder.path`), `${L}/Part One`, 'the corkboard is on the scene’s folder');
	t.ok(await p.ev(`[...document.querySelectorAll('.workspace-leaf .binders-card.is-selected')].some((c) => c.dataset.path === ${j(ARR)})`), 'with its card selected');
	// the manuscript: stays, scrolls to the section
	await p.ev(`(() => { ${VIEW}.navigate(app.vault.getAbstractFileByPath(${j(L)})); ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!${VIEW}.current?.scenes?.length`);
	await clickRow(p, heading('Epilogue'));
	t.eq(await p.ev(`${VIEW}.mode`), 'manuscript', 'the manuscript stays the manuscript');
	t.eq(await p.ev(`${VIEW}.hereItem()?.path`), `${L}/Epilogue.md`, 'and is at the scene');
	// the outliner
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf .binders-outliner-row')`);
	await clickRow(p, heading('The wreck'));
	t.eq(await p.ev(`${VIEW}.mode`), 'outliner', 'the outliner stays the outliner');
	// a task row goes to its scene too
	await clickRow(p, rowFor('Check the tides'));
	// no binder view: the note opens
	await p.ev(`app.workspace.getLeavesOfType('binders-view').forEach((l) => l.detach())`);
	await p.sleep(400);
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Elsewhere note.md')).then(() => 1)`);
	await p.sleep(500);
	await clickRow(p, heading('Epilogue'));
	t.eq(await p.ev(`app.workspace.getActiveFile()?.path`), `${L}/Epilogue.md`, 'with no binder view, the note opens');
	// a missing scene says so; the task is still in the note
	await wipeNotices(p);
	await clickRow(p, heading('Nowhere at all'));
	t.ok(/no note/i.test(await foot(p)), 'a link to nothing says so, in the pane’s foot: ' + await foot(p));
	t.eq(await notices(p), '', 'and no notice covers the pane’s buttons');
});

test('the walk: next and previous from the scene in hand, in manuscript order; a notice with “n of m” when the pane is not in sight; “Mark revision task done” ticks the one it is on', async (p, h, t) => {
	await seeded(p);
	await openView(p, L);
	const place = () => p.ev(`${R}.walk.current ? ${R}.walk.current.place + '|' + ${R}.walk.current.task.text : null`);
	await wipeNotices(p);
	await run(p, 'next-revision-task');
	await p.sleep(700);
	t.eq((await place()).split('|')[1], 'SENTINEL-REVISION-TEXT say why nobody meets her', 'from the scene in hand (the board’s first, no task of its own): the next task is Arrival’s');
	t.ok(/2 of 7/.test(await notices(p)), 'with no pane in sight it says which: ' + await notices(p));
	await run(p, 'previous-revision-task');
	await p.sleep(700);
	t.eq(await place(), '|Check the tides against the almanac', 'previous: the book’s task, which comes first');
	await run(p, 'next-revision-task');
	await p.sleep(700);
	t.eq((await place()).split('|')[1], 'SENTINEL-REVISION-TEXT say why nobody meets her', 'and next again: Arrival’s');
	const was = await read(p, REV);
	await run(p, 'finish-revision-task');
	await p.sleep(600);
	const now = await read(p, REV);
	t.eq(diff(was, now), 1, '“Mark revision task done”: one character');
	t.eq(now, was.replace('- [ ] [[Arrival]]: SENTINEL-REVISION-TEXT say', '- [x] [[Arrival]]: SENTINEL-REVISION-TEXT say'), 'the task it was on');
	await run(p, 'next-revision-task');
	await p.sleep(700);
	t.eq((await place()).split('|')[1], 'two scenes at once', 'next goes on from there (The wreck, the first of its two scenes)');
	await run(p, 'next-revision-task');
	await p.sleep(700);
	t.eq((await place()).split('|')[0], `${L}/Part Two/Lights out.md`, 'and the second of the two scenes: visited at each');
	await run(p, 'previous-revision-task');
	await p.sleep(700);
	t.eq((await place()).split('|')[0], `${L}/Part Two/The wreck.md`, 'previous goes back');
	// past the last
	for (let i = 0; i < 6; i++) { await run(p, 'next-revision-task'); await p.sleep(350); }
	t.ok(/No unfinished revision tasks after/.test(await notices(p)), 'at the end it says so: ' + await notices(p));
	// with the pane in sight the walk marks the row instead of saying it in a notice
	await showPane(p);
	await wipeNotices(p);
	await run(p, 'previous-revision-task');
	await p.sleep(700);
	t.ok(await p.ev(`!!document.querySelector(${j(PANE + ' .is-active')})`), 'the pane marks the task the walk is on');
	t.ok(!/ of /.test(await notices(p)), 'and no notice covers the pane’s buttons: ' + await notices(p));
	await shot(p, 'pane-walk');
});

test('the pane follows a binder it was shown for while a note outside any binder is open, and marks the scene in hand', async (p, h, t) => {
	await seeded(p);
	await openView(p, L);
	await showPane(p);
	await clickRow(p, heading('Arrival'));
	t.ok(await p.ev(`!!${heading('Arrival')}?.classList.contains('is-active')`), 'the scene in hand is marked, as the contents mark it');
	await p.ev(`app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('Elsewhere note.md')).then(() => 1)`);
	await p.sleep(700);
	t.ok((await shown(p)).length > 0, 'the tasks stay while a note outside any binder is open');
});

async function onDevice(p, size, fn) {
	await p.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: true });
	await reload(p, true);
	await p.focusMain();
	await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	try { await fn(); } finally {
		await p.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
		await p.ev(`document.activeElement?.blur?.()`);
		await p.send('Emulation.setTouchEmulationEnabled', { enabled: false });
		await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false });
		await reload(p, false);
		await p.focusMain();
		await tidy(p);
	}
}
const touch = (p, type, x, y) => p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(500); };
const tapSel = async (p, sel) => { const at = await p.ev(`(() => { const r = ${sel}; if (!r) return null; r.scrollIntoView({ block: 'nearest' }); const q = r.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2, h: q.height }; })()`); if (!at) throw new Error('nothing to tap: ' + sel); await tap(p, at.x, at.y); return at; };

for (const [name, size, shotName] of [['a phone', [390, 844], 'phone'], ['a tablet', [820, 1180], 'tablet']]) {
	test(`on ${name}, by touch: the pane opens, a tap on a box ticks one character, a tap on a scene goes there`, async (p, h, t) => {
		await seeded(p);
		const was = await read(p, REV);
		await onDevice(p, size, async () => {
			await openView(p, L);
			await run(p, 'show-revision');
			await until(p, `!!document.querySelector(${j(PANE)}) && document.querySelector(${j(PANE)}).getBoundingClientRect().width > 100`);
			await p.sleep(600);
			await shot(p, `pane-${shotName}`);
			const box = await tapSel(p, `${rowFor('say why nobody meets her')}?.querySelector('input')`);
			if (shotName === 'phone') t.ok(box.h >= 14, 'a box to tap');
			await p.sleep(400);
			const now = await read(p, REV);
			t.eq(now, was.replace('- [ ] [[Arrival]]: SENTINEL-REVISION-TEXT say', '- [x] [[Arrival]]: SENTINEL-REVISION-TEXT say'), 'one character changed');
			await tapSel(p, heading('Epilogue'));
			await p.sleep(500);
			t.eq(await p.ev(`${VIEW}?.hereItem?.()?.path ?? ${VIEW}?.folder?.path`), `${L}/Epilogue.md`, 'a tap on a scene goes there');
			if (shotName === 'phone') t.ok(await p.ev(`app.workspace.rightSplit.collapsed`), 'the drawer gets out of the way of the scene');
		});
	});
}
