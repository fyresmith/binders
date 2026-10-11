// Never lose writing: what dragging on the timeline does to the files (AGENTS.md, golden rules 2 and 3). Each test checks
// the bytes on disk: only the intended keys of the intended notes change, the text of every note is what it was, and
// what the history puts back is exactly what was there. Real mouse drags and fingers; each test sets its own dates.
import { B, VIEW, clickMenu, flush, j, openView, read, reload, texts, until, withTidy, writeRaw } from './view-helpers.mjs';
import { T, look, open, seed } from './specs-timeline.mjs';
import { ARRIVAL, DATES, EPILOGUE, KEEPER, LIGHTS, L, PROLOGUE, STORM, WRECK, cardSel, carry, clearHistory, fingerCarry, fingerUp, letGo, lift, mouse, onDevice, press, props, redoBtn, settledAs, steps, tag, touch, undoBtn } from './specs-timeline-drag.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'timeline writing: ' + name, fn: withTidy(fn) });

/** The lines of a note that differ between two versions, with the key each is under: what a drag may touch. */
function changedKeys(a, b) {
	const la = a.split('\n'), lb = b.split('\n'), out = new Set();
	const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
	const ca = count(la), cb = count(lb);
	for (const [line, n] of ca) if ((cb.get(line) ?? 0) < n) out.add(line);
	for (const [line, n] of cb) if ((ca.get(line) ?? 0) < n) out.add(line);
	return [...out].map((line) => /^([A-Za-z-]+):/.exec(line)?.[1] ?? 'TEXT: ' + line);
}
/** Every note is what it was, but the ones named, whose only changes are lines of the keys given. */
function onlyKeys(t, before, after, changes, what = '') {
	const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
	for (const path of paths) {
		const key = path.replace(L, '');
		if (!(key in changes)) { t.eq(after[path], before[path], `${what}“${key}” is byte for byte what it was`); continue; }
		const got = [...new Set(changedKeys(before[path], after[path]))].sort();
		t.eq(j(got), j([...changes[key]].sort()), `${what}“${key}”: only ${changes[key].join(' and ') || 'nothing'} changed`);
	}
}
const stamps = async (p, paths) => { const o = {}; for (const f of paths) o[f] = await p.ev(`app.vault.adapter.stat(${j(f)}).then(s => s.mtime)`); return o; };
const ALLPATHS = [PROLOGUE, 'Part One/Arrival.md', 'Part One/The keeper.md', 'Part One/Storm warning.md', 'Part Two/The wreck.md', 'Part Two/Lights out.md', EPILOGUE].map((f) => L + f);
const dragOnto = async (p, from, onto, dx = 30) => {
	await lift(p, from);
	const to = await p.at(cardSel(onto));
	const at = await carry(p, to.x + dx, to.y + 30, 100);
	await letGo(p, at);
	await flush(p);
};

test('1. after a redate the note’s text is byte for byte what it was and its properties differ in that key alone', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	const before = await texts(p);
	await dragOnto(p, 'Part One/Arrival.md', 'Part One/Storm warning.md');
	await settledAs(p, 'Part One/Arrival.md', '1987-06-17');
	onlyKeys(t, before, await texts(p), { 'Part One/Arrival.md': ['story-date'] });
});

test('2. words typed in the note a moment before the drop are on disk and in the editor afterwards', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await p.ev(`(async () => { const leaf = app.workspace.getLeaf('split', 'vertical'); await leaf.openFile(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})); })().then(() => 1)`);
	await p.sleep(900);
	await until(p, `!!document.querySelector('.markdown-source-view .cm-content')`);
	const at = await p.at('.markdown-source-view .cm-content');
	await p.click(at.l + 40, at.t + at.h - 12);
	await p.key('End', 'ctrl');
	await p.type(' TYPED JUST NOW');
	const view = (path) => `.workspace-leaf-content[data-type="binders-view"] .binders-card[data-path="${L}${path}"]`;
	await lift(p, 'Part One/Arrival.md', 0, view);
	const to = await p.at(view('Part One/Storm warning.md'));
	const where = await carry(p, to.x + 30, to.y + 30, 100);
	await letGo(p, where);
	await flush(p);
	await settledAs(p, 'Part One/Arrival.md', '1987-06-17');
	const onDisk = await read(p, L + 'Part One/Arrival.md');
	t.ok(onDisk.includes('TYPED JUST NOW'), 'what was typed is on disk');
	t.ok(/^story-date: 1987-06-17$/m.test(onDisk), 'with the date');
	const editor = await p.ev(`app.workspace.getLeavesOfType('markdown').map(l => l.view.editor?.getValue()).find(v => v) ?? ''`);
	t.ok(editor.includes('TYPED JUST NOW') && /story-date: 1987-06-17/.test(editor), 'and in the editor, which has both');
});

test('3. a note that opens with a `---` block that is text keeps that block as text', async (p, h, t) => {
	const note = '---\nstatus: draft\nstory-date: 1987-06-11\n---\n---\nthis is a scene break, not properties\n---\nThe text.\n';
	await seed(p, DATES);
	await writeRaw(p, L + 'Part One/Arrival.md', note);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}))?.frontmatter?.status === 'draft'`);
	await open(p, 'down');
	const before = await texts(p);
	await dragOnto(p, 'Part One/Arrival.md', 'Part One/Storm warning.md');
	await settledAs(p, 'Part One/Arrival.md', '1987-06-17');
	const after = await texts(p);
	t.eq(after[L + 'Part One/Arrival.md'], note.replace('1987-06-11', '1987-06-17'), 'the block that is text is still there, byte for byte');
	onlyKeys(t, before, after, { 'Part One/Arrival.md': ['story-date'] });
});

test('4. a note with a byte-order mark keeps it', async (p, h, t) => {
	const note = '﻿---\nstatus: draft\nstory-date: 1987-06-11\n---\nThe text.\n';
	await seed(p, DATES);
	await writeRaw(p, L + 'Part One/Arrival.md', note);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}))?.frontmatter?.status === 'draft'`);
	await open(p, 'down');
	await dragOnto(p, 'Part One/Arrival.md', 'Part One/Storm warning.md');
	await settledAs(p, 'Part One/Arrival.md', '1987-06-17');
	const after = await read(p, L + 'Part One/Arrival.md');
	t.eq(after.charCodeAt(0), 0xFEFF, 'the mark is still first');
	t.eq(after.replace('1987-06-17', '1987-06-11'), note, 'and the rest is as it was');
});

test('5. CR LF line endings are kept', async (p, h, t) => {
	const note = '---\r\nstatus: draft\r\nstory-date: 1987-06-11\r\n---\r\nThe text.\r\nA second line.\r\n';
	await seed(p, DATES);
	await writeRaw(p, L + 'Part One/Arrival.md', note);
	await until(p, `app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')}))?.frontmatter?.status === 'draft'`);
	await open(p, 'down');
	await dragOnto(p, 'Part One/Arrival.md', 'Part One/Storm warning.md');
	await settledAs(p, 'Part One/Arrival.md', '1987-06-17');
	const after = await read(p, L + 'Part One/Arrival.md');
	t.eq(after.split('\n').length - 1, after.split('\r\n').length - 1, 'every line still ends CR LF: ' + j(after));
	t.eq(after.replace('1987-06-17', '1987-06-11'), note, 'and nothing else changed');
});

test('6. a change made to the file from outside between the press and the drop is kept', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await lift(p, 'Part One/Arrival.md');
	const was = await read(p, L + 'Part One/Arrival.md');
	await writeRaw(p, L + 'Part One/Arrival.md', was + '\nWritten by another program while it was held.\n');
	await p.sleep(400);
	const to = await p.at(cardSel('Part One/Storm warning.md'));
	const at = await carry(p, to.x + 30, to.y + 30, 150);
	await letGo(p, at);
	await flush(p);
	await settledAs(p, 'Part One/Arrival.md', '1987-06-17');
	const after = await read(p, L + 'Part One/Arrival.md');
	t.ok(after.includes('Written by another program while it was held.'), 'the outside change is still there');
	t.eq(after.replace('1987-06-17', '1987-06-11'), was + '\nWritten by another program while it was held.\n', 'and the date is the only difference from it');
});

test('7. one Undo puts back exactly what was there: a month stays a month, no property stays no property, not an empty one; Redo makes it again', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clearHistory(p);
	const before = await texts(p);
	await dragOnto(p, PROLOGUE, 'Part One/Storm warning.md');
	await settledAs(p, PROLOGUE, '1987-06-17');
	await press(p, undoBtn);
	const back = await texts(p);
	t.eq(back[L + PROLOGUE], before[L + PROLOGUE], '`1986-12` is `1986-12` again, byte for byte');
	await press(p, redoBtn);
	t.eq((await props(p, PROLOGUE)).date, '1987-06-17', 'Redo makes the drop again');
	await press(p, undoBtn);
	// a scene with no property at all
	await dragOnto(p, EPILOGUE, 'Part One/Storm warning.md');
	await settledAs(p, EPILOGUE, '1987-06-17');
	await press(p, undoBtn);
	t.eq(await read(p, L + EPILOGUE), before[L + EPILOGUE], 'a scene that had none has none: the property is not left empty');
	t.eq(j(await texts(p)), j(before), 'and no note differs from the start');
});

test('8. Undo after the date was changed elsewhere refuses, and writes nothing', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clearHistory(p);
	await dragOnto(p, 'Part One/Arrival.md', 'Part One/Storm warning.md');
	await settledAs(p, 'Part One/Arrival.md', '1987-06-17');
	await seed(p, { 'Part One/Arrival.md': '1999' });
	await flush(p);
	const was = await texts(p);
	await press(p, undoBtn);
	t.eq(j(await texts(p)), j(was), 'nothing was written');
	t.ok(await p.ev(`[...document.querySelectorAll('.notice')].some(n => /has been changed since/.test(n.textContent))`), 'a notice says why');
});

test('9. ten cards dragged together are one entry', async (p, h, t) => {
	await seed(p, DATES);
	await p.ev(`(async () => { for (let i = 1; i <= 5; i++) await app.vault.create(${j(L + 'Part One/Extra ')} + i + '.md', '---\\nstory-date: 1987-06-1' + i + '\\n---\\nExtra ' + i + '\\n'); })().then(() => 1)`);
	await p.sleep(700);
	await open(p, 'down');
	await clearHistory(p);
	const before = await texts(p);
	const a = await p.at(`${cardSel(ARRIVAL)} .binders-card-footer`);
	await p.click(a.x, a.y);
	await p.key('a', 'ctrl');
	const sel = await p.ev(`${VIEW}.current.selected().length`);
	t.ok(sel >= 10, `the selection holds every scene: ${sel}`);
	await lift(p, 'Part One/Arrival.md');
	// (let go on the 11th's row: it is on the screen, and they all take its date)
	const to = await p.at(`${T} .binders-timeline-group[data-date="1987-06-11"]`);
	const at = await carry(p, to.x, to.y, 100);
	t.eq(await p.ev(`document.querySelector('.binders-drag-ghost .binders-drag-count')?.textContent`), String(sel), 'the card in hand says how many');
	await letGo(p, at, 700);
	await until(p, `app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(L)}) && app.metadataCache.getFileCache(f)?.frontmatter?.['story-date'] != null && String(app.metadataCache.getFileCache(f).frontmatter['story-date']) === '1987-06-11').length >= 10`, 9000);
	await flush(p);
	const after = await texts(p);
	const dated = Object.entries(after).filter(([f, x]) => f.startsWith(L) && /^story-date: 1987-06-11$/m.test(x)).length;
	t.ok(dated >= 10, `every one of them has the date: ${dated}`);
	t.eq(await steps(p), 1, 'and the history has one entry');
	await press(p, undoBtn);
	t.eq(j(await texts(p)), j(before), 'one Undo puts every one back, byte for byte');
});

test('10. Escape mid-drag, a drop outside the pane and a cancelled touch write nothing: the files’ times are unchanged', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	const before = await stamps(p, ALLPATHS);
	await lift(p, 'Part One/Arrival.md');
	const to = await p.at(cardSel('Part One/Storm warning.md'));
	await carry(p, to.x + 30, to.y + 30, 100);
	await p.key('Escape');
	await mouse(p, 'mouseReleased', to.x, to.y);
	await p.sleep(400);
	t.eq(j(await stamps(p, ALLPATHS)), j(before), 'Escape: no file was touched');
	await lift(p, 'Part One/Arrival.md');
	const bar = await p.at('.workspace-leaf.mod-active .binders-toolbar');
	const out = await carry(p, bar.x, bar.y, 100);
	await letGo(p, out);
	t.eq(j(await stamps(p, ALLPATHS)), j(before), 'a drop outside the pane: no file was touched');
	await onDevice(p, 390, 844, async () => {
		await open(p, 'down');
		await p.ev(`(() => { const box = document.querySelector('${T}'); ${VIEW}.current.show(${j(L + 'Part One/Arrival.md')}); const c = document.querySelector(${j(cardSel('Part One/Arrival.md'))}); box.scrollTop += c.getBoundingClientRect().top - 200; return 1; })()`);
		await p.sleep(400);
		const dest = await p.at(cardSel('Part One/The keeper.md'));
		await fingerCarry(p, 'Part One/Storm warning.md', dest.x, dest.y);
		t.ok(!!(await tag(p)), 'a card is held');
		await touch(p, 'touchCancel', 0, 0);
		await p.sleep(500);
		t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 0, 'a cancelled touch puts it down');
		t.eq(j(await stamps(p, ALLPATHS)), j(before), 'and no file was touched');
	});
});

test('11. a binder from a newer version refuses the drag and writes nothing', async (p, h, t) => {
	const note = '---\nbinder: 2\ncontents:\n  - b\n  - a\nfuture: {x: 1}\n---\nFrom the future.\n';
	await p.ev(`(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/a.md', '---\\nstory-date: 1990-01-02\\n---\\nA'); await app.vault.create('Future/b.md', '---\\nstory-date: 1990-01-09\\n---\\nB'); await app.vault.create('Future/Future.md', ${j(note)}); })().then(() => 1)`);
	await until(p, `!!${B}.problem('Future/a.md')`);
	await open(p, 'down', 'Future');
	const before = await texts(p), was = await stamps(p, ['Future/a.md', 'Future/b.md', 'Future/Future.md']);
	const sel = (name) => `${T} .binders-card[data-path="Future/${name}.md"]`;
	const a = await p.at(`${sel('a')} .binders-card-footer`), b = await p.at(sel('b'));
	await p.move(a.x, a.y, 2);
	await mouse(p, 'mousePressed', a.x, a.y);
	await p.move(b.x, b.y, 14, { buttons: 1 });
	await p.sleep(200);
	t.eq(await p.ev(`document.querySelectorAll('.binders-drag-ghost').length`), 0, 'no card is lifted');
	await mouse(p, 'mouseReleased', b.x, b.y);
	await p.sleep(400);
	await p.key('ArrowRight', 'alt');
	await p.sleep(400);
	t.eq(j(await texts(p)), j(before), 'no note was written');
	t.eq(j(await stamps(p, ['Future/a.md', 'Future/b.md', 'Future/Future.md'])), j(was), 'no file was touched');
});

test('12. a value that is not a date is never rewritten by opening the timeline; redating it and undoing puts the words back', async (p, h, t) => {
	await seed(p, { ...DATES, [EPILOGUE]: 'sometime in spring' });
	const before = await texts(p);
	await open(p, 'down');
	await p.sleep(500);
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'opening the view writes nothing');
	await clearHistory(p);
	await lift(p, EPILOGUE);
	const to = await p.at(cardSel('Part One/Storm warning.md'));
	const at = await carry(p, to.x + 30, to.y + 30, 100);
	await letGo(p, at);
	await settledAs(p, EPILOGUE, '1987-06-17');
	await press(p, undoBtn);
	t.eq(await read(p, L + EPILOGUE), before[L + EPILOGUE], 'the words are back, byte for byte');
});

test('13. a date written by hand in another shape is not normalised: not by opening the view, nor by a drag that does not change it', async (p, h, t) => {
	await seed(p, { ...DATES, 'Part One/Arrival.md': '11 June 1987' });
	const before = await texts(p);
	await open(p, 'down');
	await p.sleep(400);
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'opening the view writes nothing');
	// the keeper put before it on the same day: only their order is written; the words of its date stay
	await lift(p, 'Part One/The keeper.md');
	const a = await p.at(cardSel('Part One/Arrival.md'));
	const at = await carry(p, a.l + 20, a.y, 100);
	t.eq(await tag(p), '11 June 1987, 1 of 2', 'carried before it');
	await letGo(p, at);
	await settledAs(p, 'Part One/The keeper.md', 1, 'story-order');
	const after = await texts(p);
	onlyKeys(t, before, after, { 'Part One/The keeper.md': ['story-order'], 'Part One/Arrival.md': ['story-order'] });
	t.ok(/^story-date: 11 June 1987$/m.test(after[L + 'Part One/Arrival.md']), 'its date is still the words typed');
});

test('14. in a Longform project only the scene is written, never the index note', async (p, h, t) => {
	const root = 'Longform demo/';
	await seed(p, { 'Harbor.md': '1990-03-01', 'Island.md': '1990-03-09', 'Return.md': '1990-03-09' }, 'story-date', root);
	await open(p, 'down', 'Longform demo');
	const before = await texts(p);
	const sel = (name) => `${T} .binders-card[data-path="${root}${name}.md"]`;
	await lift(p, 'Harbor', 0, sel);
	const to = await p.at(sel('Island'));
	const at = await carry(p, to.x + 30, to.y + 30, 100);
	await letGo(p, at);
	await flush(p);
	await until(p, `String(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath('Longform demo/Harbor.md'))?.frontmatter?.['story-date']) === '1990-03-09'`, 6000);
	const after = await texts(p);
	t.eq(after[root + 'Index.md'], before[root + 'Index.md'], 'the index note is byte for byte what it was');
	onlyKeys(t, Object.fromEntries(Object.entries(before).map(([k, v]) => [k.replace(L, ''), v])), Object.fromEntries(Object.entries(after).map(([k, v]) => [k.replace(L, ''), v])), { [root + 'Harbor.md']: ['story-date'] });
});

test('15. no drag writes a folder note or the binder note', async (p, h, t) => {
	await seed(p, DATES);
	await p.ev(`app.vault.create(${j(L + 'Part One/Part One.md')}, '---\\nsynopsis: The first part.\\nstory-date: 1987-06\\n---\\nPart notes.\\n').then(() => 1, () => 1)`);
	await open(p, 'down');
	const before = await texts(p);
	await dragOnto(p, 'Part One/Arrival.md', 'Part One/Storm warning.md');
	await settledAs(p, 'Part One/Arrival.md', '1987-06-17');
	// also reordering a day, through the keys, and the tray
	await dragOnto(p, 'Part Two/Lights out.md', 'Part Two/The wreck.md', -90);
	await dragOnto(p, 'Part One/Storm warning.md', PROLOGUE, 30);
	await p.sleep(500);
	const after = await texts(p);
	t.eq(after[L + 'Part One/Part One.md'], before[L + 'Part One/Part One.md'], 'the folder note is as it was');
	t.eq(after[L + 'The Lighthouse.md'], before[L + 'The Lighthouse.md'], 'and so is the binder note');
});

test('16. on an emulated phone a swipe writes nothing and a held drag writes once', async (p, h, t) => {
	await seed(p, DATES);
	await onDevice(p, 390, 844, async () => {
		await open(p, 'down');
		await clearHistory(p);
		const before = await texts(p);
		const sw = await p.at(`${cardSel('Part One/Arrival.md')} .binders-card-footer`);
		await touch(p, 'touchStart', sw.x, sw.y);
		for (let i = 1; i <= 8; i++) { await touch(p, 'touchMove', sw.x, sw.y - i * 14); await p.sleep(16); }
		await touch(p, 'touchEnd');
		await p.sleep(500);
		await flush(p);
		t.eq(j(await texts(p)), j(before), 'a swipe writes nothing');
		await p.ev(`(() => { const box = document.querySelector('${T}'); ${VIEW}.current.show(${j(L + 'Part One/Arrival.md')}); const c = document.querySelector(${j(cardSel('Part One/Arrival.md'))}); box.scrollTop += c.getBoundingClientRect().top - 200; return 1; })()`);
		await p.sleep(400);
		const dest = await p.at(cardSel('Part One/Arrival.md'));
		await fingerCarry(p, 'Part One/Storm warning.md', dest.x, dest.y);
		await fingerUp(p);
		await settledAs(p, 'Part One/Storm warning.md', '1987-06-11');
		onlyKeys(t, before, await texts(p), { 'Part One/Storm warning.md': ['story-date'] });
		t.eq(await steps(p), 1, 'a held drag is one write, one step');
	});
});

test('17. a note deleted mid-drag: nothing is written, and it says so; a neighbour deleted: the drop goes through without it', async (p, h, t) => {
	await seed(p, DATES);
	await open(p, 'down');
	await clearHistory(p);
	await lift(p, 'Part One/Arrival.md');
	const to = await p.at(cardSel('Part One/Storm warning.md'));
	const at = await carry(p, to.x + 30, to.y + 30, 100);
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(L + 'Part One/Arrival.md')})).then(() => 1)`);
	await p.sleep(600);
	const before = await texts(p);
	await letGo(p, at, 600);
	await flush(p);
	t.eq(j(await texts(p)), j(before), 'nothing is written');
	t.ok(await until(p, `[...document.querySelectorAll('.notice')].some(n => /was removed while it was being moved/.test(n.textContent))`), 'and a notice says why');
	t.eq(await steps(p), 0, 'and there is nothing to undo');
	// a neighbour that is deleted: the card still takes its date, and the neighbour is not made again
	await seed(p, { 'Part Two/The wreck.md': '1987-06-17' });
	await open(p, 'down');
	await lift(p, 'Part One/The keeper.md');
	const w = await p.at(cardSel('Part Two/The wreck.md'));
	const at2 = await carry(p, w.x + 30, w.y + 30, 100);
	await p.ev(`app.vault.delete(app.vault.getAbstractFileByPath(${j(L + 'Part One/Storm warning.md')})).then(() => 1)`);
	await p.sleep(600);
	await letGo(p, at2, 600);
	await flush(p);
	t.eq((await props(p, 'Part One/The keeper.md')).date, '1987-06-17', 'the card has the date');
	t.eq(await p.ev(`!!app.vault.getAbstractFileByPath(${j(L + 'Part One/Storm warning.md')})`), false, 'and the note that went is still gone');
});
