// "Add revision task" (src/revision/capture.ts): golden rule 2 and the fourth exception to golden rule 3. Every test
// asserts bytes and the editor's state: from the manuscript with typing not yet saved, from a note's own tab, from
// focus mode, from a card and a row, with the revision note itself open and typed in, refused where it can't be done,
// and on a phone and a tablet by touch.
import { mkdirSync } from 'fs';
import { B, NOTE, PL, VIEW, card, clickMenu, exists, file, flush, j, menuItems, openView, read, reload, split, texts, tidy, until, withTidy } from './view-helpers.mjs';
import { BN, L, REV, listing, seed } from './specs-revision.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'revision capture: ' + name, fn: withTidy(async (p, h, t) => { try { await fn(p, h, t); } finally { for (let i = 0; i < 3 && (await p.ev(`!!document.querySelector('.modal-container .prompt')`)); i++) { await p.key('Escape'); await p.sleep(150); } } }) });
const R = `${PL}.revision`;

const SHOTS = process.env.REVISION_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => { if (SHOTS) await p.shot(`${SHOTS}/${name}.png`); };
const ARR = `${L}/Part One/Arrival.md`, KEEP = `${L}/Part One/The keeper.md`;
const BODY = '---\nsynopsis: Mara arrives.\n---\nThe boat left her on the jetty with two cases.\n\nShe walked up to the tower and knocked, twice, and nobody came.\n\nThe light turned above her.\n';
const M = `${VIEW}.current`;
const PROMPT = '.modal-container .prompt-input';
const notices = (p) => p.ev(`[...document.querySelectorAll('.notice')].map((n) => n.textContent).join('|')`);
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const rowsOf = (p) => p.ev(`[...document.querySelectorAll('.modal-container .suggestion-item')].map((r) => [r.querySelector('.suggestion-title')?.textContent, r.querySelector('.suggestion-note')?.textContent ?? '', r.querySelector('.suggestion-aux')?.textContent ?? ''])`);
/** Types the task into the open prompt, moves down `down` rows and presses Enter. */
async function answerPrompt(p, text, down = 0) {
	await until(p, `!!document.querySelector(${j(PROMPT)})`);
	await p.sleep(150);
	await p.type(text);
	for (let i = 0; i < down; i++) await p.key('ArrowDown');
	await p.key('Enter');
	await until(p, `!document.querySelector('.modal-container .prompt')`);
	await p.sleep(250);
}
const revText = (p) => p.ev(`app.vault.adapter.exists(${j(REV)}).then((x) => x ? app.vault.adapter.read(${j(REV)}) : null)`);
async function openMs(p) {
	await openView(p, L);
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `(() => { const m = ${M}; return !!m?.scenes && m.scenes.filter((s) => m.near.has(s.el)).slice(0, m.liveMax).every((s) => (s.live || s.broken) && !s.mounting); })()`, 8000);
	await p.sleep(300);
}
/** The editor's whole state that a capture must not change. */
const edState = (cm) => `(() => { const cm = ${cm}, s = cm.state.selection.main; return JSON.stringify({ doc: cm.state.doc.toString(), from: s.from, to: s.to, top: Math.round(cm.scrollDOM.scrollTop), focus: cm.dom.contains(document.activeElement) }); })()`;
const noteCm = `app.workspace.getMostRecentLeaf().view.editor.cm`;
const openNote = (p, path) => p.ev(`(async () => { const l = app.workspace.getLeaf(false); await l.openFile(${file(path)}); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`).then(() => until(p, `app.workspace.activeEditor?.file?.path === ${j(path)}`));

test('from the manuscript with typing not yet saved: the editor’s text, selection and scroll are the same, the keyboard is back, typing carries on at the caret, and the note grows by the task and its passage', async (p, h, t) => {
	await p.ev(`app.vault.modify(${file(ARR)}, ${j(BODY)}).then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await openMs(p);
	const cm = `${M}.scenes.find((s) => s.file.path === ${j(ARR)}).live.editor.cm`;
	await p.ev(`(async () => { const m = ${M}; await m.focusScene(m.scenes.find((s) => s.file.path === ${j(ARR)}), 'end'); })().then(() => 1)`);
	await p.sleep(500);
	// typed a moment ago, not saved; then a phrase selected
	await p.ev(`(() => { const cm = ${cm}, n = cm.state.doc.length; cm.dispatch({ changes: { from: n, insert: 'And a line typed just now.' }, userEvent: 'input.type' }); const at = cm.state.doc.toString().indexOf('knocked, twice'); cm.dispatch({ selection: { anchor: at, head: at + 14 } }); cm.focus(); return 1; })()`);
	const was = await p.ev(edState(cm));
	await run(p, 'add-revision-task');
	await until(p, `!!document.querySelector(${j(PROMPT)})`);
	t.eq(j(await rowsOf(p)), j([['Arrival', '“knocked, twice”', 'Part One'], ['Part One', '', 'Folder'], ['The Lighthouse', '', 'The whole book']]), 'the prompt: the scene in hand with the selection under it, its folder, the whole book');
	await shot(p, 'capture-manuscript-computer');
	await answerPrompt(p, 'Why does nobody come?');
	t.eq(await revText(p), '- [ ] [[Arrival]]: Why does nobody come?\n\t> knocked, twice\n', 'the revision note is made with the task and the passage');
	t.eq(await p.ev(`app.metadataCache.getFileCache(${BN}.note)?.frontmatter?.revision`), '[[Revision]]', 'the binder note names it');
	await until(p, `${cm}.dom.contains(document.activeElement)`);
	t.eq(await p.ev(edState(cm)), was, 'the editor’s text, selection, scroll and focus are exactly as they were');
	await p.type('X');
	const typed = JSON.parse(await p.ev(edState(cm)));
	const w = JSON.parse(was);
	t.eq(typed.doc, w.doc.slice(0, w.from) + 'X' + w.doc.slice(w.to), 'typing goes on in the editor, at the caret (over the selection, as it would have)');
	await p.sleep(2500);
	await flush(p);
	const disk = await read(p, ARR), doc = JSON.parse(await p.ev(edState(cm))).doc;
	t.ok(disk.includes('And a line typed just now.') && disk.includes('X'), 'what was typed, before and after, reached the disk');
	t.eq(disk.replace(/\r/g, ''), doc.replace(/\r/g, ''), 'the disk is what the editor says');
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (path !== NOTE && path !== ARR) t.eq(after[path], text, `“${path}” is unchanged`);
	t.eq(split(after[NOTE]).body, split(before[NOTE]).body, 'the binder note’s text is as it was');
	// a second task: the note grows by exactly its lines, everything above byte for byte
	await run(p, 'add-revision-task');
	await answerPrompt(p, 'Second thing');
	t.eq(await revText(p), '- [ ] [[Arrival]]: Why does nobody come?\n\t> knocked, twice\n- [ ] [[Arrival]]: Second thing\n', 'the second task goes under the first: nothing above changed');
});

test('from a note’s own tab: the selection is the passage, the editor keeps its text, selection and focus, and nothing else is written', async (p, h, t) => {
	await p.ev(`app.vault.modify(${file(ARR)}, ${j(BODY)}).then(() => 1)`);
	await p.sleep(400);
	const before = await texts(p);
	await openNote(p, ARR);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, i = ed.getValue().indexOf('The light turned'); ed.focus(); ed.setSelection(ed.offsetToPos(i), ed.offsetToPos(i + 9)); return 1; })()`);
	await p.sleep(300);
	const was = await p.ev(edState(noteCm));
	await run(p, 'add-revision-task');
	await answerPrompt(p, 'Say what the light is');
	t.eq(await revText(p), '- [ ] [[Arrival]]: Say what the light is\n\t> The light\n', 'the task, and the selection as its passage');
	await until(p, `${noteCm}.dom.contains(document.activeElement)`);
	t.eq(await p.ev(edState(noteCm)), was, 'the editor is as it was, and has the keyboard');
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) if (path !== NOTE) t.eq(after[path], text, `“${path}” is unchanged, byte for byte`);
	// no selection: no passage
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.setCursor(ed.offsetToPos(3)); ed.focus(); return 1; })()`);
	await run(p, 'add-revision-task');
	await until(p, `!!document.querySelector(${j(PROMPT)})`);
	t.eq(j((await rowsOf(p))[0]), j(['Arrival', '', 'Part One']), 'with nothing selected, nothing is shown under the scene');
	await answerPrompt(p, 'No passage here', 2);
	t.eq(await revText(p), '- [ ] [[Arrival]]: Say what the light is\n\t> The light\n- [ ] No passage here\n', 'two rows down is the whole book: no link');
});

test('from focus mode: the prompt shows over the page, and the page keeps its text, selection and focus', async (p, h, t) => {
	await p.ev(`app.vault.modify(${file(ARR)}, ${j(BODY)}).then(() => 1)`);
	await p.sleep(400);
	await p.ev(`app.saveLocalStorage('binders-focus-hinted', true)`);
	await openNote(p, ARR);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setSelection(ed.offsetToPos(5), ed.offsetToPos(15)); return 1; })()`);
	await run(p, 'focus');
	await until(p, `[...document.body.classList].some((c) => c.startsWith('binders-focus'))`);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.setSelection(ed.offsetToPos(60), ed.offsetToPos(70)); return 1; })()`);
	await p.sleep(500);
	const was = await p.ev(edState(noteCm)), picked = JSON.parse(was);
	await run(p, 'add-revision-task');
	await until(p, `!!document.querySelector(${j(PROMPT)})`);
	t.ok(await p.ev(`(() => { const r = document.querySelector('.modal-container .prompt').getBoundingClientRect(); return r.width > 100 && r.height > 40 && getComputedStyle(document.querySelector('.modal-container')).visibility !== 'hidden'; })()`), 'the prompt is there, and can be seen');
	await shot(p, 'capture-focus');
	await answerPrompt(p, 'From focus mode');
	t.eq(await revText(p), `- [ ] [[Arrival]]: From focus mode\n\t> ${picked.doc.slice(picked.from, picked.to).replace(/\s+/g, ' ').trim()}\n`, 'the task, about the scene in focus, with what was selected');
	await until(p, `${noteCm}.dom.contains(document.activeElement)`);
	t.eq(await p.ev(edState(noteCm)), was, 'the page is as it was');
	await run(p, 'focus');
});

test('from a card and a row: one task about all that are selected, a folder by its folder note, the whole book by arrow', async (p, h, t) => {
	await openView(p, L + '/Part One');
	const a = await p.at(card(ARR)), k = await p.at(card(KEEP));
	await p.click(a.x, a.t + 12);
	await p.click(k.x, k.t + 12, { modifiers: 2 });
	await p.right(k.x, k.y);
	const offered = await menuItems(p);
	t.ok(offered.includes('Add revision task...'), 'the menu of a selection offers it: ' + offered.join(', '));
	await clickMenu(p, 'Add revision task...');
	await until(p, `!!document.querySelector(${j(PROMPT)})`);
	t.eq(j((await rowsOf(p)).map((r) => r[0])), j(['2 notes', 'The Lighthouse']), 'the first row is the selection, then the whole book');
	await answerPrompt(p, 'Both of these');
	t.eq(await revText(p), '- [ ] [[Arrival]], [[The keeper]]: Both of these\n', 'one task, with both links, in manuscript order');
	await until(p, `${R}.list(${BN}).open === 1`);
	t.eq(await p.ev(`${R}.openFor(${file(ARR)}) + ${R}.openFor(${file(KEEP)})`), 2, 'counted once, and open for each of them');
	// a single card
	const s = await p.at(card(`${L}/Part One/Storm warning.md`));
	await p.click(s.x, s.t + 12);
	await p.right(s.x, s.y);
	await clickMenu(p, 'Add revision task...');
	await answerPrompt(p, 'Just the storm');
	t.eq((await revText(p)).split('\n').slice(-2)[0], '- [ ] [[Storm warning]]: Just the storm', 'one card, one link');
	// a folder, from the board above it
	await openView(p, L);
	await p.sleep(300);
	const f = await p.at(card(`${L}/Part Two`));
	t.ok(!!f, 'the board shows the folder Part Two');
	await p.right(f.x, f.t + 12);
	await clickMenu(p, 'Add revision task...');
	await until(p, `!!document.querySelector(${j(PROMPT)})`);
	t.eq(j((await rowsOf(p)).map((r) => [r[0], r[2]])), j([['Part Two', 'Folder'], ['The Lighthouse', 'The whole book']]), 'a folder: itself, then the whole book');
	await answerPrompt(p, 'About this whole part');
	t.eq((await revText(p)).split('\n').slice(-2)[0], '- [ ] [[Part Two]]: About this whole part', 'a folder’s task links its folder note');
	t.ok(await exists(p, `${L}/Part Two/Part Two.md`), 'which is made (empty) if the folder had none');
	// an empty field adds nothing, and Escape adds nothing
	const was = await revText(p);
	await run(p, 'add-revision-task');
	await until(p, `!!document.querySelector(${j(PROMPT)})`);
	await p.key('Enter');
	await p.sleep(300);
	t.ok(await p.ev(`!!document.querySelector('.modal-container .prompt')`), 'Enter with nothing typed keeps the prompt');
	await p.key('Escape');
	await p.sleep(300);
	t.eq(await revText(p), was, 'and writes nothing');
});

test('with the revision note itself open and typed in, not yet saved: what was typed is kept, the task goes under it, and the tab shows both', async (p, h, t) => {
	await seed(p, '- [ ] [[Arrival]]: first\n');
	await openNote(p, REV);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.replaceRange('TYPED-NOT-SAVED\\n', ed.offsetToPos(ed.getValue().length)); return 1; })()`);
	await run(p, 'add-revision-task');
	await until(p, `!!document.querySelector(${j(PROMPT)})`);
	t.eq(j((await rowsOf(p)).map((r) => r[2])), j(['The whole book']), 'from the revision note the only choice is the whole book');
	await answerPrompt(p, 'Added while the note is open');
	const want = '- [ ] [[Arrival]]: first\nTYPED-NOT-SAVED\n\n- [ ] Added while the note is open\n';
	t.eq(await revText(p), want, 'what was typed is on the disk, with the task under it');
	await p.sleep(800);
	t.eq(await p.ev(`app.workspace.activeEditor.editor.getValue()`), want, 'and the tab shows both');
	await p.sleep(2600);
	t.eq(await revText(p), want, 'and stays so once the tab has had time to save');
});

test('refused where the binder can’t be changed or has no place for it, and said', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(${BN}.note, (fm) => { fm.binder = 2; }).then(() => 1)`);
	await until(p, `!!${B}.problem(${file(L)})`);
	await openView(p, L);
	const before = await texts(p);
	await run(p, 'add-revision-task');
	await p.sleep(500);
	t.ok(!(await p.ev(`!!document.querySelector('.modal-container .prompt')`)), 'no prompt in a binder of a newer format');
	t.ok(/can’t be changed/.test(await notices(p)), 'it says why: ' + await notices(p));
	t.eq(await revText(p), null, 'and no revision note was made');
	const after = await texts(p);
	for (const [path, text] of Object.entries(before)) t.eq(after[path], text, `“${path}” is unchanged`);
	await p.ev(`app.fileManager.processFrontMatter(${BN}.note, (fm) => { fm.binder = 1; }).then(() => 1)`);
	// a Longform project
	await until(p, `!${B}.problem(${file(L)})`);
	await openView(p, 'Longform demo');
	await p.ev(`document.querySelectorAll('.notice').forEach((n) => n.remove())`);
	await run(p, 'add-revision-task');
	await p.sleep(500);
	t.ok(/Longform/.test(await notices(p)), 'a Longform project says it keeps none: ' + await notices(p));
	t.ok(!(await p.ev(`!!document.querySelector('.modal-container .prompt')`)), 'and opens no prompt');
});

test('not offered where there is no binder', async (p, h, t) => {
	await p.ev(`app.vault.create('Loose.md', 'a note').then((f) => app.workspace.getLeaf(false).openFile(f))`);
	await p.sleep(500);
	t.ok(!(await p.ev(`app.commands.findCommand('binders:add-revision-task').checkCallback(true)`)), 'not offered in a note outside any binder');
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
const tap = async (p, x, y) => { await touch(p, 'touchStart', x, y); await p.sleep(40); await touch(p, 'touchEnd'); await p.sleep(450); };
for (const [name, size, shotName] of [['a phone', [390, 844], 'phone'], ['a tablet', [820, 1180], 'tablet']]) {
	test(`on ${name}, by touch: a held card’s menu, the prompt, Enter; the note grows by the task and the scene’s note is as it was`, async (p, h, t) => {
		const before = await texts(p);
		await onDevice(p, size, async () => {
			await openView(p, L + '/Part One');
			await p.sleep(400);
			const g = await p.at(card(ARR));
			await touch(p, 'touchStart', g.l + 20, g.t + 20);
			await p.sleep(800);
			await touch(p, 'touchEnd');
			await p.sleep(600);
			const items = await menuItems(p);
			t.ok(items.includes('Add revision task...'), 'the held card’s menu has it: ' + items.join(', '));
			const find = `[...document.querySelectorAll('.menu .menu-item')].filter((e) => e.querySelector('.menu-item-title')?.textContent === 'Add revision task...').pop()`;
			await p.ev(`${find}.scrollIntoView({ block: 'center' })`);
			await p.sleep(250);
			const at = await p.ev(`(() => { const r = (${find}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; })()`);
			if (shotName === 'phone') t.ok(at.h >= 40, `a finger tall (${Math.round(at.h)} px)`);
			await tap(p, at.x, at.y);
			await until(p, `!!document.querySelector(${j(PROMPT)})`);
			await p.sleep(400);
			t.ok(await p.ev(`(() => { const r = document.querySelector('.modal-container .prompt').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0; })()`), 'the prompt fits the screen');
			await p.type('Who told her a man would meet her?');
			await shot(p, `capture-${shotName}`);
			await p.key('Enter');
			await until(p, `!document.querySelector('.modal-container .prompt')`);
			await p.sleep(500);
			t.eq(await revText(p), '- [ ] [[Arrival]]: Who told her a man would meet her?\n', 'the task, written from the device');
			await shot(p, `capture-${shotName}-after`);
		});
		const after = await texts(p);
		for (const [path, text] of Object.entries(before)) if (path !== NOTE) t.eq(after[path], text, `“${path}” is unchanged`);
	});
}

test('three tasks in a row make a note that reads as a list, each with its scene’s link', async (p, h, t) => {
	await p.ev(`app.vault.modify(${file(ARR)}, ${j(BODY)}).then(() => 1)`);
	await openNote(p, ARR);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor, i = ed.getValue().indexOf('The boat left'); ed.focus(); ed.setSelection(ed.offsetToPos(i), ed.offsetToPos(i + 30)); return 1; })()`);
	await run(p, 'add-revision-task');
	await answerPrompt(p, 'Say why nobody meets her');
	await openNote(p, KEEP);
	await run(p, 'add-revision-task');
	await answerPrompt(p, '“Nineteen years” is said twice in two pages');
	await run(p, 'add-revision-task');
	await answerPrompt(p, 'Check every tide against the almanac', 2);
	t.eq(await revText(p), '- [ ] [[Arrival]]: Say why nobody meets her\n\t> The boat left her on the jetty\n- [ ] [[The keeper]]: “Nineteen years” is said twice in two pages\n- [ ] Check every tide against the almanac\n', 'three tasks, newest last');
	await openNote(p, REV);
	await p.sleep(700);
	await shot(p, 'note-after-three-tasks');
});
