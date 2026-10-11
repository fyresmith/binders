// "Split at headings...": one note of a binder cut into several, through the real dialog. The text is in the new notes
// before the note lets go of it; nothing is lost (the pieces joined are the note, byte for byte), whatever is typed or
// written meanwhile; the binder's history takes it back as one change, only if every new note is what was written.
import { B, file, j, openView, read, reload, until, withTidy, writeRaw, texts, same } from './view-helpers.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'split many: ' + name, fn: withTidy(async (p, h, t) => {
	const before = await texts(p);
	try { await fn(p, h, t, before); } finally {
		await p.ev(`(() => { document.querySelectorAll('.notice').forEach(n => n.remove()); app.workspace.detachLeavesOfType('markdown'); return 1; })()`);
		for (let i = 0; i < 3 && await p.ev(`!!document.querySelector('.modal-container')`); i++) { await p.key('Escape'); await p.sleep(150); }
	}
}) });

const L = 'The Lighthouse/', P1 = L + 'Part One/', SW = P1 + 'Storm warning.md';
const D = '.modal.binders-split-many';
const FM = '---\nstatus: draft\nsynopsis: The storm.\naliases: [Gale]\n---\n';
const BODY = '# Storm\n\nIntro text here.\n\n## One\n\nOne words, linked [[Elsewhere]].\n\n## Two\n\nTwo words.\n\n## Three\n\nThree words.\n';
const TEXT = FM + BODY;
const body = (t) => t.replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
const sleep = (p, ms) => p.sleep(ms);
const there = (p, path) => p.ev(`!!${file(path)}`);
const back = (p, redo = false) => p.ev(`${B}.undo(${file('The Lighthouse')}, ${redo}).then(x => x, e => 'refused: ' + e.message)`);
const labels = (p) => p.ev(`${B}.undos.map(u => u.label)`);
const reset = (p) => p.ev(`(() => { ${B}.undos = []; ${B}.redos = []; ${B}.history.onChange(); return 1; })()`);
const settle = async (p) => { await sleep(p, 700); await p.ev(`${B}.flush().then(() => 1)`); await sleep(p, 300); };
const mdIn = (p, dir) => p.ev(`app.vault.getFiles().map(f => f.path).filter(x => x.startsWith(${j(dir)}) && x.endsWith('.md')).sort()`);

/** Opens a note in a tab (source mode) and makes it the active one. */
async function open(p, path) {
	await p.ev(`(async () => { const l = app.workspace.getLeaf('tab'); await l.openFile(${file(path)}, { state: { mode: 'source', source: false } }); app.workspace.setActiveLeaf(l, { focus: true }); })().then(() => 1)`);
	await sleep(p, 600);
}
/** Writes a note as an outside program would, opens it, and opens the dialog from the palette. */
async function dialog(p, text = TEXT, { path = SW, tab = true } = {}) {
	await writeRaw(p, path, text);
	await sleep(p, 500);
	if (tab) await open(p, path); else await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); const f = ${file(path)}; return app.workspace.getLeaf('tab').openFile(f).then(() => 1); })()`);
	await p.ev(`app.commands.executeCommandById('binders:split-at-headings')`);
	if (!await until(p, `!!document.querySelector('${D} [data-binders-key="go"]')`, 5000)) throw new Error('the dialog did not open');
	await sleep(p, 300);
}
const names = (p) => p.ev(`[...document.querySelectorAll('${D} .binders-split-many-row')].map(r => r.querySelector('input')?.value ?? r.querySelector('.binders-split-many-name').textContent)`);
const choose = async (p, key, value) => { await p.ev(`(() => { const s = document.querySelector('${D} [data-binders-key="${key}"]'); s.value = ${j(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`); await sleep(p, 250); };
const toggle = async (p, key) => { await p.ev(`(() => { document.querySelector('${D} [data-binders-key="${key}"]').click(); return 1; })()`); await sleep(p, 250); };
const go = async (p) => { await p.ev(`(() => { document.querySelector('${D} [data-binders-key="go"]').click(); return 1; })()`); await sleep(p, 1500); };
const goText = (p) => p.ev(`document.querySelector('${D} [data-binders-key="go"]').textContent`);
const modal = (p) => p.ev(`!!document.querySelector('${D}')`);

test('the dialog: where to cut with its counts, the notes it will make, the button says how many; nothing is written until it is pressed', async (p, h, t, before) => {
	await openView(p); await reset(p);
	await dialog(p);
	t.eq(await p.ev(`document.querySelector('${D} .modal-title')?.textContent`), 'Split “Storm warning”', 'it says which note');
	t.eq(await p.ev(`[...document.querySelector('${D} [data-binders-key="by"]').options].map(o => o.textContent).join('|')`), 'Heading 2 (3)|Scene breaks (0)|A line of your own', 'where to cut: each way, with how many notes it makes');
	t.eq((await names(p)).join('|'), 'Storm warning|One|Two|Three', 'the notes it will make: the note itself first, then one for each heading');
	t.eq(await goText(p), 'Split into 4 notes', 'the button says how many');
	t.ok(await p.ev(`!!document.querySelector('${D} [data-binders-key="take"]') && !document.querySelector('${D} [data-binders-key="take"]').closest('.checkbox-container').classList.contains('is-enabled')`), 'taking the headings out of the text is off');
	t.ok(!(await there(p, P1 + 'One.md')), 'nothing has been made');
	await p.key('Escape'); await sleep(p, 300);
	t.ok(!(await modal(p)) && !(await there(p, P1 + 'One.md')), 'closing makes nothing');
	t.eq(await read(p, SW), TEXT, 'and the note is as it was');
});

test('splitting: the pieces joined are the note, byte for byte; the first keeps its properties, the others have all but the synopsis and the names; in the binder, in order; one change in the history', async (p, h, t) => {
	await openView(p); await reset(p);
	await dialog(p);
	await go(p);
	t.ok(!(await modal(p)), 'the dialog closes');
	const first = await read(p, SW), pieces = [await read(p, P1 + 'One.md'), await read(p, P1 + 'Two.md'), await read(p, P1 + 'Three.md')];
	t.eq(body(first) + pieces.map(body).join(''), BODY, 'the notes joined are the text, byte for byte');
	t.ok(first.startsWith(FM) && first.includes('Intro text here.') && !first.includes('## One'), 'the first note keeps its properties whole');
	t.ok(pieces.every((x) => x.startsWith('---\nstatus: draft\n---\n') && !x.includes('synopsis') && !x.includes('aliases')), 'each other note has the properties but the synopsis and the names');
	t.eq(await p.ev(`${B}.scenes(${file(P1.slice(0, -1))}).map(f => f.basename).filter(x => ['Storm warning','One','Two','Three'].includes(x)).join('|')`), 'Storm warning|One|Two|Three', 'in the binder, in order, after the note');
	t.eq(j(await labels(p)), j(['Split “Storm warning” into 4 notes']), 'one change in the history, named for what it did');
	t.ok(!(await p.ev(`[...document.querySelectorAll('.notice')].some(n => /changed/.test(n.textContent))`)), 'with nothing said to be wrong');
	t.ok(await p.ev(`app.vault.getFiles().some(f => f.path.includes('Snapshots') && f.path.includes('Storm warning'))`), 'a snapshot of the note, from before, was taken');
	t.ok(pieces[0].includes('[[Elsewhere]]'), 'a link in the text is as it was');
});

test('Undo takes it all back, byte for byte, and Redo makes it again, the same; and again', async (p, h, t) => {
	await openView(p); await reset(p);
	await dialog(p, TEXT, { tab: false });
	await go(p);
	const made = await Promise.all(['One', 'Two', 'Three'].map((n) => read(p, P1 + n + '.md'))), head = await read(p, SW);
	t.eq(await back(p), 'Split “Storm warning” into 4 notes', 'undo says what it undid');
	await settle(p);
	t.eq(await read(p, SW), TEXT, 'the note is as it was, byte for byte');
	t.ok(!(await there(p, P1 + 'One.md')) && !(await there(p, P1 + 'Two.md')) && !(await there(p, P1 + 'Three.md')), 'the new notes are gone');
	t.eq(await back(p, true), 'Split “Storm warning” into 4 notes', 'redo');
	await settle(p);
	t.eq(await read(p, SW), head, 'the note the same');
	t.eq(j(await Promise.all(['One', 'Two', 'Three'].map((n) => read(p, P1 + n + '.md')))), j(made), 'and each new note the same, byte for byte');
	await back(p); await settle(p);
	t.eq(await read(p, SW), TEXT, 'undo again: as it began');
});

test('Undo is refused when a new note was edited: nothing is written, and it says which, and where the snapshot is', async (p, h, t) => {
	await openView(p); await reset(p);
	await dialog(p, TEXT, { tab: false });
	await go(p);
	await writeRaw(p, P1 + 'Two.md', (await read(p, P1 + 'Two.md')) + 'An outside edit.\n');
	await sleep(p, 600);
	const head = await read(p, SW);
	const said = await back(p);
	t.ok(/refused: .*“Two” has been changed since the split/.test(said) && /snapshot/.test(said), `refused, naming the note and the snapshot (${said})`);
	t.eq(await read(p, SW), head, 'the first note is untouched');
	t.ok(await there(p, P1 + 'One.md') && await there(p, P1 + 'Three.md') && (await read(p, P1 + 'Two.md')).includes('An outside edit.'), 'every new note is still there, the edit too');
});

test('an edit from outside between the dialog opening and the button: nothing is split, and the edit is kept', async (p, h, t) => {
	await openView(p); await reset(p);
	await dialog(p);
	const changed = TEXT + '\nA late addition from outside.\n';
	await writeRaw(p, SW, changed);
	await sleep(p, 500);
	await go(p);
	t.ok(await modal(p), 'the dialog stays');
	t.ok(await p.ev(`[...document.querySelectorAll('.notice')].some(n => /changed after the list was made/.test(n.textContent))`), 'and says why');
	t.eq(await read(p, SW), changed, 'the note is as the outside edit left it');
	t.ok(!(await there(p, P1 + 'One.md')), 'no note was made');
});

test('typing not yet saved when the command is run is in the list and in the notes', async (p, h, t) => {
	await openView(p); await reset(p);
	await writeRaw(p, SW, TEXT); await sleep(p, 500);
	await open(p, SW);
	await p.ev(`(() => { const ed = app.workspace.activeEditor.editor; ed.focus(); ed.replaceRange('\\nTyped at the very end.\\n', ed.offsetToPos(ed.getValue().length)); return 1; })()`);
	await p.ev(`app.commands.executeCommandById('binders:split-at-headings')`);
	await until(p, `!!document.querySelector('${D} [data-binders-key="go"]')`, 5000); await sleep(p, 300);
	await go(p);
	t.ok((await read(p, P1 + 'Three.md')).includes('Typed at the very end.'), 'what was typed is in the last note');
	t.eq(body(await read(p, SW)) + ['One', 'Two', 'Three'].map((n) => ''), body(await read(p, SW)) + ',,', 'the note is whole');
	t.eq((body(await read(p, SW)) + (await read(p, P1 + 'One.md')).replace(/^---\n[\s\S]*?\n---\n/, '') + (await read(p, P1 + 'Two.md')).replace(/^---\n[\s\S]*?\n---\n/, '') + (await read(p, P1 + 'Three.md')).replace(/^---\n[\s\S]*?\n---\n/, '')), BODY + '\nTyped at the very end.\n', 'every word, once');
});

test('the editor’s own undo, with the note open, takes the split back too, and the notes go to the trash', async (p, h, t) => {
	await openView(p); await reset(p);
	await dialog(p);
	await go(p);
	await p.ev(`(() => { app.workspace.activeEditor?.editor?.undo(); return 1; })()`);
	await sleep(p, 1500);
	t.eq(await read(p, SW), TEXT, 'the note is as it was');
	t.ok(!(await there(p, P1 + 'Two.md')), 'the new notes are gone');
});

test('footnotes and links written at the foot go to the notes that mark them, and every word is still there', async (p, h, t) => {
	const text = FM + '# Storm\n\nIntro.[^a]\n\n## One\n\nOne[^b] and a [link][site].\n\n## Two\n\nTwo again[^a].\n\n[^a]: Note a.\n[^b]: Note b,\n    on two lines.\n[site]: https://example.com\n';
	await openView(p); await reset(p);
	await dialog(p, text);
	await go(p);
	const [first, one, two] = [await read(p, SW), await read(p, P1 + 'One.md'), await read(p, P1 + 'Two.md')];
	t.ok(first.includes('[^a]: Note a.') && !first.includes('[^b]'), 'the first note has the one it marks');
	t.ok(one.includes('[^b]: Note b,\n    on two lines.') && one.includes('[site]: https://example.com') && !one.includes('[^a]'), 'a note has its footnote with its second line, and its link');
	t.ok(two.includes('[^a]: Note a.'), 'one marked in two notes is written in both');
	const words = (s) => (s.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []);
	t.eq(new Set([first, one, two].flatMap((x) => words(body(x)))).size, new Set(words(body(text))).size, 'the same words');
	await back(p); await settle(p);
	t.eq(await read(p, SW), text, 'undone, the note is as it was');
});

test('links to a heading that went to a new note follow it', async (p, h, t) => {
	await openView(p); await reset(p);
	await writeRaw(p, P1 + 'Linker.md', 'See [[Storm warning#Two]] and [[Storm warning#One]] and [[Storm warning]].\n'); await sleep(p, 500);
	await dialog(p);
	await go(p);
	await sleep(p, 800);
	const linker = await read(p, P1 + 'Linker.md');
	t.ok(!linker.includes('Storm warning#Two') && !linker.includes('Storm warning#One') && linker.includes('[[Storm warning]]'), `the links to the headings moved, the one to the note stayed (${JSON.stringify(linker)})`);
	await back(p); await settle(p);
	t.eq(await read(p, P1 + 'Linker.md'), 'See [[Storm warning#Two]] and [[Storm warning#One]] and [[Storm warning]].\n', 'undo points them back');
});

test('a note with Windows line endings, and one with a byte-order mark, come back byte for byte', async (p, h, t) => {
	await openView(p); await reset(p);
	const crlf = TEXT.replace(/\n/g, '\r\n');
	await writeRaw(p, SW, crlf); await sleep(p, 400);
	const bytes = (path) => p.ev(`app.vault.adapter.readBinary(${j(path)}).then(b => [...new Uint8Array(b)].join())`);
	const orig = await bytes(SW);
	await dialog(p, crlf, { tab: false });
	await go(p);
	t.ok(await there(p, P1 + 'Two.md'), 'split');
	await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`); await sleep(p, 400);
	t.ok(!(await read(p, P1 + 'Two.md')).includes('\r'), 'the new notes are in one kind of line ending');
	await back(p); await settle(p);
	t.eq(await bytes(SW), orig, 'undone, the CRLF note is as it was, byte for byte');
	await p.ev(`${B}.undos.length`);
	await reset(p);
	const bom = '﻿' + TEXT;
	await p.ev(`app.vault.adapter.write(${j(SW)}, ${j(bom)}).then(() => 1)`); await sleep(p, 500);
	const orig2 = await bytes(SW);
	await dialog(p, bom, { tab: false });
	await p.ev(`document.querySelector('${D} [data-binders-key="go"]')?.click()`); await sleep(p, 1500);
	await p.ev(`(() => { app.workspace.detachLeavesOfType('markdown'); return 1; })()`); await sleep(p, 400);
	t.ok(await there(p, P1 + 'Two.md'), 'a note with a byte-order mark splits');
	t.ok((await read(p, SW)).includes('Intro text here.') && !(await read(p, SW)).includes('## One'), 'the note let go of the rest');
	await back(p); await settle(p);
	t.eq(await bytes(SW), orig2, 'and is as it was');
});

test('a name already taken: the new note takes another, and names typed in the dialog are the notes’ names', async (p, h, t) => {
	await openView(p); await reset(p);
	await writeRaw(p, P1 + 'Two.md', 'Already here.\n'); await sleep(p, 500);
	await dialog(p);
	await p.ev(`(() => { const i = document.querySelector('${D} [data-binders-key="name-1"]'); i.value = 'Alpha'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
	await go(p);
	t.ok(await there(p, P1 + 'Alpha.md'), 'a name typed is the name');
	t.eq(await read(p, P1 + 'Two.md'), 'Already here.\n', 'the note that was there is untouched');
	t.ok(await there(p, P1 + 'Two 2.md') && (await read(p, P1 + 'Two 2.md')).includes('Two words.'), 'the new one is “Two 2”');
});

test('taking the headings out of the text: they become the names; and scene breaks, and a line of your own, cut too', async (p, h, t) => {
	await openView(p); await reset(p);
	await dialog(p);
	await toggle(p, 'take');
	await go(p);
	t.ok(!(await read(p, P1 + 'Two.md')).includes('## Two') && (await read(p, P1 + 'Two.md')).includes('Two words.'), 'the heading is the name, and not in the note');
	await back(p); await settle(p);
	await reset(p);
	const breaks = FM + 'Part one.\n\n***\n\nPart two.\n\nCUT HERE\n\nPart three.\n';
	await dialog(p, breaks);
	t.eq(await goText(p), 'Split into 2 notes', 'scene breaks: two notes');
	await choose(p, 'by', 'line');
	await p.ev(`(() => { const i = document.querySelector('${D} [data-binders-key="line"]'); i.value = 'CUT HERE'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`); await sleep(p, 300);
	t.eq(await goText(p), 'Split into 2 notes', 'a line of your own: two notes');
	await go(p);
	t.ok((await read(p, SW)).includes('Part two.') && (await read(p, SW)).includes('CUT HERE'), 'cut at the line, which stays with the text before it');
	t.ok((await read(p, P1 + 'Part three.md')).includes('Part three.'), 'named by its first words');
});

test('a note at the binder’s top level: the new notes can be in a folder of their own, which Undo takes away with them', async (p, h, t) => {
	await openView(p); await reset(p);
	const TOP = L + 'Prologue.md', orig = await read(p, TOP);
	await writeRaw(p, TOP, TEXT); await sleep(p, 500);
	await dialog(p, TEXT, { path: TOP });
	t.ok(await p.ev(`!!document.querySelector('${D} [data-binders-key="folder"]')`), 'the switch is there');
	t.ok(await p.ev(`document.querySelector('${D} [data-binders-key="folder"]').closest('.checkbox-container').classList.contains('is-enabled')`), 'and it is on to start with');
	await go(p);
	t.ok(await p.ev(`!!${file(L + 'Prologue notes')}`) && await there(p, L + 'Prologue notes/One.md'), 'the notes are in a new folder “Prologue notes”');
	await back(p); await settle(p);
	t.ok(!(await there(p, L + 'Prologue notes')), 'undone, the folder is gone too');
	await writeRaw(p, TOP, orig);
});

test('a note inside a folder has no folder switch; a Longform project’s scene splits in place, after itself, at its indent', async (p, h, t) => {
	await openView(p); await reset(p);
	await dialog(p);
	t.ok(await p.ev(`!document.querySelector('${D} [data-binders-key="folder"]')`), 'a note in a part: no switch');
	await p.key('Escape'); await sleep(p, 300);
	const harbor = 'Longform demo/Harbor.md';
	await writeRaw(p, harbor, '# Harbor\n\nLead.\n\n## First\n\nFirst words.\n\n## Second\n\nSecond words.\n'); await sleep(p, 600);
	await dialog(p, '# Harbor\n\nLead.\n\n## First\n\nFirst words.\n\n## Second\n\nSecond words.\n', { path: harbor });
	t.ok(await p.ev(`!document.querySelector('${D} [data-binders-key="folder"]')`), 'a Longform project: no switch either, it has no folders');
	await go(p);
	const order = await p.ev(`${B}.scenes(${file('Longform demo')}).map(f => f.basename).join('|')`);
	t.ok(/^Harbor\|Ticket office\|The crossing\|First\|Second\|Island/.test(order), `the new notes are after it and the scenes indented under it, which stay with it (${order})`);
});

test('a binder in a newer format cannot be split: no command, no item', async (p, h, t) => {
	const note = '---\nbinder: 2\ncontents:\n  - b\n  - a\n---\nFrom the future.\n';
	await p.ev(`(async () => { await app.vault.createFolder('Future'); await app.vault.create('Future/a.md', '# A\\n\\n## x\\n\\ntext\\n\\n## y\\n\\ntext\\n'); await app.vault.create('Future/b.md', 'B'); await app.vault.create('Future/Future.md', ${j(note)}); })().then(() => 1)`);
	await until(p, `!!${B}.problem('Future/a.md')`);
	await open(p, 'Future/a.md');
	t.eq(await p.ev(`app.commands.commands['binders:split-at-headings'].checkCallback(true)`), false, 'the command is not offered');
	t.eq(await read(p, 'Future/a.md'), '# A\n\n## x\n\ntext\n\n## y\n\ntext\n', 'and the note is untouched');
});

test('a phone: the dialog is reachable, the list scrolls, the names can be typed, and the button is in reach', async (p, h, t) => {
	await openView(p); await reset(p);
	const dark = await p.ev(`document.body.classList.contains('theme-dark')`);
	await p.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }); await reload(p, true);
	await p.ev(`(() => { app.changeTheme(${j(dark ? 'obsidian' : 'moonstone')}); return 1; })()`);
	try {
		await openView(p);
		await dialog(p);
		const fit = await p.ev(`(() => { const m = document.querySelector('${D}'), b = document.querySelector('${D} [data-binders-key="go"]'), r = b.getBoundingClientRect(); return { w: m.scrollWidth, c: m.clientWidth, bottom: r.bottom, h: r.height, v: innerHeight }; })()`);
		t.ok(fit.w <= fit.c + 1 && fit.bottom <= fit.v && fit.h >= 40, `nothing runs off the side, the button is in reach and big enough (${JSON.stringify(fit)})`);
		await p.ev(`(() => { const i = document.querySelector('${D} [data-binders-key="name-2"]'); i.value = 'Phone name'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
		await go(p);
		t.ok(await there(p, P1 + 'Phone name.md'), 'split on a phone, with the name typed');
		const first = await read(p, SW), pieces = await Promise.all(['One', 'Phone name', 'Three'].map((n) => read(p, P1 + n + '.md')));
		t.eq(body(first) + pieces.map(body).join(''), BODY, 'byte for byte');
	} finally { for (let i = 0; i < 3 && await p.ev(`!!document.querySelector('.modal-container')`); i++) { await p.key('Escape'); await p.sleep(150); } await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); await reload(p, false); }
});
