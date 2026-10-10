// QA round 11, the file explorer, on what the earlier rounds didn't try: a binder in an ordinary folder that is renamed
// or moved, folds opened and shut again and again, a folder left open after a drag, twelve binders in one vault, a
// binder inside a binder, the binder note shown by its setting, names with quotes and brackets, notes and folders made
// and deleted from the explorer's menus, an empty binder, and a binder whose note is deleted from disk. Judged against
// what the explorer does with an ordinary folder, and against the binder's own text on disk (golden rules 2 and 3).
// Tests named "BUG: qa11 explorer: …" fail until the bug they show is fixed; "NIT: …" is a small thing.
import { B, NOTE, j, file, read, exists, texts, same as sameTexts, flush, until } from './view-helpers.mjs';
import { withTidy, rows, row, drag, hold, release, cancel, top, bottom, mk, setSettings, rightClick, pick, EXP, L } from './specs-qa4-explorer.mjs';

export const specs = [];
const test = (name, fn) => specs.push({ name: 'qa11 explorer: ' + name, fn: withTidy(fn) });
const bug = (name, fn) => specs.push({ name: 'BUG: qa11 explorer: ' + name, fn: withTidy(fn) });

// ---- the open folders most tests use ----
const OPEN = [L, `${L}/Part One`, `${L}/Part Two`];

// ---- helpers ----

/** A binder note's text: `binder: 1` and the given contents, each entry a JSON string (valid YAML), or none. */
const binderNote = (names) => `---\nbinder: 1\ncontents:${names.length ? '\n' + names.map((n) => `  - ${JSON.stringify(n)}`).join('\n') : ' []'}\n---\n`;
/** The `contents` list of a binder note's text, as YAML reads each entry: double quoted, single quoted or plain. */
const listOf = (text) => {
	const head = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '', lines = head.split('\n'), i = lines.findIndex((l) => /^contents:/.test(l));
	const out = [];
	if (i < 0 || /^contents:\s*\[\]/.test(lines[i])) return out;
	for (const l of lines.slice(i + 1)) {
		const m = /^\s+- (.*)$/.exec(l);
		if (!m) break;
		const s = m[1];
		out.push(s.startsWith('"') ? JSON.parse(s) : s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s);
	}
	return out;
};
/** The list a binder note holds on disk. */
const disk = async (p, path) => listOf(await read(p, path));
/** The sidebar explorer's rows (data paths) under `under`, after opening the given folders. */
const shown = (p, under, open) => rows(p, under, open);
const sel = (path) => `.tree-item-self[data-path="${path.replace(/["\\]/g, '\\$&')}"]`;
/** Is a folder folded in the explorer (Obsidian marks its tree item)? */
const folded = (p, path) => p.ev(`(() => { const e = ${EXP}.containerEl.querySelector(${j(sel(path))}); return e ? !!e.closest('.tree-item')?.classList.contains('is-collapsed') : null; })()`);
/** Opens or shuts a folder by its arrow, as a writer does (a click on a binder's name opens its view instead). */
const fold = async (p, path) => {
	const a = await p.at(`${sel(path)} .collapse-icon`);
	if (!a) throw new Error(`no arrow for ${path}`);
	await p.click(a.x, a.y);
	await p.sleep(450);
};
/** Under `under`: the rows with a doubled "binder" tag or label dot, the number of each, and the rows with a tag. */
const marks = (p, under) => p.ev(`(() => { const rs = [...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path]')].filter(r => r.dataset.path === ${j(under)} || r.dataset.path.startsWith(${j(under + '/')})); return { tags: rs.reduce((n, r) => n + r.querySelectorAll(':scope > .binders-folder-tag').length, 0), dots: rs.reduce((n, r) => n + r.querySelectorAll(':scope > .binders-explorer-label').length, 0), doubled: rs.filter(r => r.querySelectorAll(':scope > .binders-folder-tag').length > 1 || r.querySelectorAll(':scope > .binders-explorer-label').length > 1).map(r => r.dataset.path) }; })()`);
/** Whether a row shows the "binder" tag at its end. */
const tagged = (p, path) => p.ev(`!!${EXP}.containerEl.querySelector(${j(sel(path))})?.querySelector(':scope > .binders-folder-tag')`);
/** A binder folder, its note, and the notes named in it, each with its own text. */
const binderFiles = (folder, names, text = (n) => `${n} text`) => {
	const out = { [folder + '/']: '', [`${folder}/${folder.split('/').pop()}.md`]: binderNote(names) };
	for (const n of names) out[`${folder}/${n}.md`] = text(n);
	return out;
};
/** Types a name over the one Obsidian's new-item editor shows, and presses Enter. */
const named = async (p, name) => {
	await p.ev(`document.execCommand('selectAll')`);
	await p.type(name);
	await p.key('Enter');
	await p.sleep(700);
};
/** Only the files whose path starts with `prefix`, as a map. */
const under = (map, prefix) => Object.fromEntries(Object.entries(map).filter(([k]) => k.startsWith(prefix)));

// ================================================================================================================
// A binder in an ordinary folder
// ================================================================================================================

test('a binder in an ordinary folder, its folder renamed from the explorer’s menu: the binder keeps its order and its text', async (p, h, t) => {
	await mk(p, { 'Projects/': '', ...binderFiles('Projects/Book', ['Two', 'One', 'Three']) });
	const text = await read(p, 'Projects/Book/Book.md');
	await rows(p, 'Projects', ['Projects', 'Projects/Book']);
	// the folder’s own menu, as a writer renames it: Rename, typed over in the explorer
	await rightClick(p, 'Projects');
	await pick(p, 'Rename...');
	await named(p, 'Writing');
	t.ok(await exists(p, 'Writing/Book/Two.md'), 'the notes are in the renamed folder');
	t.ok(!(await exists(p, 'Projects/Book/Two.md')), 'and not in the old one');
	t.eq(await read(p, 'Writing/Book/Book.md'), text, 'the binder note’s text is untouched');
	const seen = await shown(p, 'Writing/Book', ['Writing', 'Writing/Book']);
	t.eq(seen.join('|'), 'Writing/Book/Two.md|Writing/Book/One.md|Writing/Book/Three.md', 'the explorer still shows the binder’s order');
	t.ok(await tagged(p, 'Writing/Book'), 'and the binder tag');
});

test('a folder holding a binder dragged into another folder in the explorer goes whole: its order and its tag stay', async (p, h, t) => {
	await mk(p, { 'Projects/': '', ...binderFiles('Projects/Book', ['Two', 'One', 'Three']), 'Archive/': '', 'Archive/Old.md': 'old' });
	const want = await read(p, 'Projects/Book/Book.md');
	await rows(p, '', ['Projects', 'Archive', 'Projects/Book']);
	const to = await row(p, 'Archive');
	const s = await drag(p, 'Projects/Book', { x: to.x, y: to.y });
	t.ok(/Move into/.test(s.hint), 'a drop on a folder’s middle moves into it: ' + JSON.stringify(s.hint));
	await flush(p); await p.sleep(300);
	t.ok(await exists(p, 'Archive/Book/Book.md'), 'the binder moved into Archive');
	t.ok(!(await exists(p, 'Projects/Book/Book.md')), 'and left Projects');
	t.eq(await read(p, 'Archive/Book/Book.md'), want, 'its binder note is untouched');
	const seen = await shown(p, 'Archive', ['Archive', 'Archive/Book']);
	t.eq(seen.join('|'), 'Archive/Book|Archive/Book/Two.md|Archive/Book/One.md|Archive/Book/Three.md|Archive/Old.md', 'the binder’s order, after its folder, and the plain note last');
	t.ok(await tagged(p, 'Archive/Book'), 'the binder tag follows the folder');
});

test('folding and opening a binder again and again: one tag and one label dot per row, and the order unchanged', async (p, h, t) => {
	await p.ev(`app.fileManager.processFrontMatter(${file(`${L}/Part One/Arrival.md`)}, fm => { fm.label = '#c0392b'; }).then(() => 1)`);
	await flush(p); await until(p, `!!${EXP}.containerEl.querySelector('.binders-explorer-label')`, 3000);
	const want = [`${L}/Part One/Arrival.md`, `${L}/Part One/The keeper.md`, `${L}/Part One/Storm warning.md`];
	await rows(p, L, OPEN);
	for (let i = 0; i < 3; i++) {
		await fold(p, L);
		t.eq(await folded(p, L), true, `round ${i}: folded`);
		await fold(p, L);
		t.eq(await folded(p, L), false, `round ${i}: open again`);
		const seen = await shown(p, L, OPEN);
		t.eq(seen.filter((x) => x.startsWith(`${L}/Part One/`)).join('|'), want.join('|'), `round ${i}: Part One in binder order`);
		const m = await marks(p, L);
		t.eq(m.doubled.join('|'), '', `round ${i}: no row has two marks`);
		t.eq(m.dots, 1, `round ${i}: one label dot under the binder`);
		t.eq(m.tags, 1, `round ${i}: one binder tag under the binder`);
	}
});

test('a folder left open after a note is dragged out of it stays open, and the note lands where it was dropped', async (p, h, t) => {
	await rows(p, L, OPEN);
	const s = await drag(p, `${L}/Part One/Storm warning.md`, bottom(await row(p, `${L}/Part Two/Lights out.md`)));
	t.eq(s.hint, 'Move after “Lights out”', 'the hint');
	t.eq(await folded(p, `${L}/Part One`), false, 'Part One is still open');
	t.eq(await folded(p, `${L}/Part Two`), false, 'Part Two is still open');
	const seen = await shown(p, L, OPEN);
	t.ok(seen.includes(`${L}/Part One/Arrival.md`) && seen.includes(`${L}/Part One/The keeper.md`), 'Part One’s other notes are still listed');
	t.eq(seen.filter((x) => x.startsWith(`${L}/Part Two/`)).join('|'), `${L}/Part Two/The wreck.md|${L}/Part Two/Lights out.md|${L}/Part Two/Storm warning.md`, 'Part Two in its new order');
});

// ================================================================================================================
// Many binders, and a binder inside a binder
// ================================================================================================================

test('twelve binders in one vault: each shows its own order, and a drag from one into another touches only those two binder notes', async (p, h, t) => {
	const nn = (i) => String(i).padStart(2, '0');
	const files = { 'Shelf/': '' };
	for (let i = 1; i <= 12; i++) Object.assign(files, binderFiles(`Shelf/B${nn(i)}`, [`S${nn(i)}c`, `S${nn(i)}b`, `S${nn(i)}a`], (n) => `${n} words`));
	await mk(p, files, 800);
	const before = await texts(p);
	const all = Array.from({ length: 12 }, (_, i) => `Shelf/B${nn(i + 1)}`);
	await rows(p, 'Shelf', ['Shelf', ...all]);
	await p.sleep(1000);
	for (let i = 1; i <= 12; i++) {
		await row(p, `Shelf/B${nn(i)}`); // scrolls the binder into view: the explorer draws rows near the page only
		const got = (await shown(p, `Shelf/B${nn(i)}`, all)).filter((x) => x.endsWith('.md') && !x.endsWith(`B${nn(i)}.md`));
		const diag = await p.ev(`(() => { const f = app.vault.getAbstractFileByPath('Shelf/B${nn(i)}'); return { kids: (f?.children ?? []).map(c => c.name), items: Object.keys(${EXP}.fileItems).filter(k => k.startsWith('Shelf/B${nn(i)}/')), folded: ${EXP}.fileItems['Shelf/B${nn(i)}']?.collapsed ?? null, contents: ${B}.orderedChildren(f)?.map(c => c.name) ?? null }; })()`);
		const dom = await p.ev(`[...${EXP}.containerEl.querySelectorAll('.tree-item-self[data-path^="Shelf/B${nn(i)}/"]')].map(e => e.dataset.path)`);
		t.eq(got.join('|'), [`S${nn(i)}c`, `S${nn(i)}b`, `S${nn(i)}a`].map((x) => `Shelf/B${nn(i)}/${x}.md`).join('|'), `binder ${i} shows its own order (rows in the page: ${j(dom)}; diag ${j(diag)})`);
	}
	const s = await drag(p, 'Shelf/B07/S07a.md', top(await row(p, 'Shelf/B03/S03b.md')));
	t.eq(s.hint, 'Move before “S03b”', 'the hint');
	await flush(p); await p.sleep(300);
	t.eq((await disk(p, 'Shelf/B03/B03.md')).join('|'), 'S03c|S07a|S03b|S03a', 'binder 3 lists the note where it was dropped');
	t.eq((await disk(p, 'Shelf/B07/B07.md')).join('|'), 'S07c|S07b', 'binder 7 no longer lists it');
	t.eq(await read(p, 'Shelf/B03/S07a.md'), 'S07a words', 'its words came with it');
	const after = await texts(p);
	const rest = Object.fromEntries(Object.entries(before).filter(([k]) => k !== 'Shelf/B03/B03.md' && k !== 'Shelf/B07/B07.md' && k !== 'Shelf/B07/S07a.md'));
	sameTexts(t, rest, after, { skip: [] });
});

test('a binder inside a binder: a note dragged out of the inner one keeps its words, and the inner binder note is not rewritten', async (p, h, t) => {
	await mk(p, {
		'Outer/': '',
		'Outer/Outer.md': binderNote(['Inner/', 'Plain']),
		'Outer/Plain.md': 'plain words',
		'Outer/Inner/': '',
		'Outer/Inner/Inner.md': binderNote(['Inner A', 'Inner B']),
		'Outer/Inner/Inner A.md': 'inner a words',
		'Outer/Inner/Inner B.md': 'inner b words',
	}, 800);
	const before = await texts(p);
	await rows(p, 'Outer', ['Outer', 'Outer/Inner']);
	const s = await drag(p, 'Outer/Inner/Inner A.md', bottom(await row(p, 'Outer/Plain.md')));
	t.ok(/Move after/.test(s.hint), 'a drop after Plain: ' + s.hint);
	await flush(p); await p.sleep(400);
	t.eq(await read(p, 'Outer/Inner A.md'), 'inner a words', 'the note’s words came out whole');
	t.ok(!(await exists(p, 'Outer/Inner/Inner A.md')), 'and it left the inner folder');
	const after = await texts(p);
	t.eq(after['Outer/Inner/Inner.md'], before['Outer/Inner/Inner.md'], 'the inner binder note is not rewritten');
	t.eq(after['Outer/Inner/Inner B.md'], before['Outer/Inner/Inner B.md'], 'the other inner note is untouched');
	const outer = await disk(p, 'Outer/Outer.md');
	t.ok(outer.indexOf('Inner A') > outer.indexOf('Plain') && outer.includes('Inner/'), 'the outer binder lists the note after Plain: ' + outer.join('|'));
});

// ================================================================================================================
// Hidden notes, names, menus, deletes
// ================================================================================================================

test('the binder note shown by its setting: a drag of it goes nowhere, and nothing about the binder is written', async (p, h, t) => {
	await setSettings(p, { hideBinderNotes: false });
	await rows(p, L, OPEN);
	t.ok((await rows(p, L, OPEN)).includes(NOTE), 'the binder note is listed');
	const before = await disk(p, NOTE), texts0 = await texts(p);
	const s = await hold(p, NOTE, top(await row(p, `${L}/Prologue.md`)));
	await cancel(p);
	t.eq(s.line, null, 'no drop line for the binder note');
	await flush(p); await p.sleep(300);
	t.ok(await exists(p, NOTE), 'the binder note is where it was');
	t.eq((await disk(p, NOTE)).join('|'), before.join('|'), 'the binder’s list is as it was');
	sameTexts(t, texts0, await texts(p), { skip: [] });
});

test('names with quotes, brackets, a percent sign, a hash and an apostrophe: they drag and keep their place', async (p, h, t) => {
	const names = ['Scene "one" [draft] 50%', 'Scene #2 & co', "Scene 'three' (v2)", 'Plain'];
	await mk(p, { 'Notes/': '', ...binderFiles('Notes/Book', names) }, 800);
	await rows(p, 'Notes', ['Notes', 'Notes/Book']);
	const s = await drag(p, 'Notes/Book/Plain.md', top(await row(p, `Notes/Book/${names[0]}.md`)));
	t.eq(s.hint, `Move before “${names[0]}”`, 'the hint names the note');
	await flush(p); await p.sleep(300);
	t.eq((await disk(p, 'Notes/Book/Book.md')).join('|'), ['Plain', ...names.slice(0, 3)].join('|'), 'the list on disk has the note first');
	const seen = await shown(p, 'Notes/Book', ['Notes', 'Notes/Book']);
	t.eq(seen.filter((x) => x.endsWith('.md') && !x.endsWith('Book.md')).join('|'), ['Plain', ...names.slice(0, 3)].map((x) => `Notes/Book/${x}.md`).join('|'), 'the explorer agrees');
});

test('a note made from the explorer’s menu goes last among the listed notes, and is written at its place once something in its folder moves', async (p, h, t) => {
	await rows(p, L, OPEN);
	const listBefore = await disk(p, NOTE);
	await rightClick(p, `${L}/Part One`);
	await pick(p, 'New note');
	await named(p, 'Interlude');
	t.ok(await exists(p, `${L}/Part One/Interlude.md`), 'the note is made in Part One');
	const notes = (x) => x.filter((r) => r.startsWith(`${L}/Part One/`) && r.endsWith('.md'));
	t.eq(notes(await shown(p, `${L}/Part One`, OPEN)).pop(), `${L}/Part One/Interlude.md`, 'it shows last in Part One');
	t.eq((await disk(p, NOTE)).join('|'), listBefore.join('|'), 'the binder note’s list is not written yet');
	await drag(p, `${L}/Part One/Arrival.md`, bottom(await row(p, `${L}/Part One/Storm warning.md`)));
	await flush(p); await p.sleep(300);
	const onDisk = (await disk(p, NOTE)).filter((x) => x.startsWith('Part One/') && x !== 'Part One/');
	const shownNow = notes(await shown(p, `${L}/Part One`, OPEN)).map((x) => x.replace(`${L}/`, '').replace(/\.md$/, ''));
	t.eq(onDisk.join('|'), shownNow.join('|'), 'the list on disk matches the explorer, Interlude included');
	t.ok(onDisk.includes('Part One/Interlude'), 'Interlude is written into the list');
});

test('a folder made from the explorer’s menu inside a binder shows after its listed items, and a note dragged into it is written there', async (p, h, t) => {
	await rows(p, L, OPEN);
	await rightClick(p, `${L}/Part Two`);
	await pick(p, 'New folder');
	await named(p, 'Notes');
	t.ok(await exists(p, `${L}/Part Two/Notes`), 'the folder is made in Part Two');
	const seen = (await shown(p, `${L}/Part Two`, OPEN)).filter((x) => x.startsWith(`${L}/Part Two/`));
	t.eq(seen[seen.length - 1], `${L}/Part Two/Notes`, 'it shows last in Part Two');
	const to = await row(p, `${L}/Part Two/Notes`);
	await drag(p, `${L}/Part One/The keeper.md`, { x: to.x, y: to.y });
	await flush(p); await p.sleep(300);
	t.ok(await exists(p, `${L}/Part Two/Notes/The keeper.md`), 'the note went into the folder');
	const onDisk = await disk(p, NOTE);
	t.ok(onDisk.includes('Part Two/Notes/') && onDisk.includes('Part Two/Notes/The keeper'), 'the list holds the folder and its note: ' + onDisk.join('|'));
	t.ok(!onDisk.includes('Part One/The keeper'), 'and not the note’s old place');
});

test('a note deleted from the explorer’s menu leaves the list; no other note, and nothing else in the binder note, changes', async (p, h, t) => {
	await rows(p, L, OPEN);
	const before = await texts(p);
	await rightClick(p, `${L}/Part One/Storm warning.md`);
	await pick(p, 'Delete');
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => /delete|trash/i.test(b.textContent))?.click()`);
	await p.sleep(600);
	await flush(p); await p.sleep(200);
	t.ok(!(await exists(p, `${L}/Part One/Storm warning.md`)), 'the note is gone');
	const list = await disk(p, NOTE);
	t.eq(list.includes('Part One/Storm warning'), false, 'it is off the list');
	t.eq(list.join('|'), 'Prologue|Part One/|Part One/Arrival|Part One/The keeper|Part Two/|Part Two/The wreck|Part Two/Lights out|Epilogue', 'the rest of the list is as it was');
	const after = await texts(p);
	const gone = `${L}/Part One/Storm warning.md`;
	sameTexts(t, Object.fromEntries(Object.entries(before).filter(([k]) => k !== NOTE && k !== gone)), after, { skip: [] });
});

test('a binder whose note is deleted from disk is an ordinary folder: no tag, name order, nothing written; put the note back and the binder is back', async (p, h, t) => {
	await rows(p, L, OPEN);
	const text = await read(p, NOTE);
	const before = await texts(p);
	await p.ev(`app.vault.delete(${file(NOTE)}).then(() => 1)`);
	await flush(p); await p.sleep(500);
	const top2 = (await shown(p, L, OPEN)).filter((x) => x.split('/').length === 2);
	t.eq(top2.join('|'), [`${L}/Part One`, `${L}/Part Two`, `${L}/Epilogue.md`, `${L}/Prologue.md`].join('|'), 'the rows are in name order, folders first');
	t.eq(await tagged(p, L), false, 'no binder tag on the folder');
	sameTexts(t, Object.fromEntries(Object.entries(before).filter(([k]) => k !== NOTE)), await texts(p), { skip: [] });
	await p.ev(`app.vault.create(${j(NOTE)}, ${j(text)}).then(() => 1)`);
	await flush(p); await p.sleep(500);
	t.ok(await tagged(p, L), 'the binder tag is back once the note is');
	t.eq((await shown(p, L, OPEN)).filter((x) => x.startsWith(`${L}/Part One/`)).join('|'), [`${L}/Part One/Arrival.md`, `${L}/Part One/The keeper.md`, `${L}/Part One/Storm warning.md`].join('|'), 'and its order with it');
});

test('an empty binder: a note dragged onto its folder becomes its only item, and leaves the binder it came from', async (p, h, t) => {
	await mk(p, { 'Empty/': '', 'Empty/Empty.md': binderNote([]) }, 500);
	await rows(p, '', ['Empty', L, `${L}/Part One`, `${L}/Part Two`]);
	const to = await row(p, 'Empty');
	const s = await hold(p, `${L}/Prologue.md`, { x: to.x, y: to.y });
	t.ok(/Move into/.test(s.hint), 'a drop on the middle is a move into the folder: ' + JSON.stringify(s.hint));
	await release(p, { x: to.x, y: to.y });
	await flush(p); await p.sleep(300);
	t.ok(await exists(p, 'Empty/Prologue.md'), 'Prologue is in the empty binder');
	t.eq((await disk(p, 'Empty/Empty.md')).join('|'), 'Prologue', 'and listed there, as its only item');
	t.eq((await disk(p, NOTE)).includes('Prologue'), false, 'and no longer listed by The Lighthouse');
});

test('a binder renamed with Rename... in the explorer keeps its note, its tag and its order, and its text', async (p, h, t) => {
	await mk(p, { 'Shelf2/': '', ...binderFiles('Shelf2/Five', ['Two', 'One', 'Three']) }, 600);
	const text = await read(p, 'Shelf2/Five/Five.md');
	await rows(p, 'Shelf2', ['Shelf2', 'Shelf2/Five']);
	await rightClick(p, 'Shelf2/Five');
	await pick(p, 'Rename...');
	await named(p, 'Six');
	t.ok(await exists(p, 'Shelf2/Six/Six.md'), 'the binder note went with its folder (renamed to Six.md)');
	t.ok(!(await exists(p, 'Shelf2/Six/Five.md')), 'and the old name is gone');
	t.eq(await read(p, 'Shelf2/Six/Six.md'), text, 'its text is untouched');
	const seen = await shown(p, 'Shelf2/Six', ['Shelf2', 'Shelf2/Six']);
	t.eq(seen.join('|'), 'Shelf2/Six/Two.md|Shelf2/Six/One.md|Shelf2/Six/Three.md', 'the explorer shows the same order');
	t.ok(await tagged(p, 'Shelf2/Six'), 'and the binder tag');
});

test('a binder deleted from the explorer’s menu leaves its sibling binder in its own order, and nothing else is written', async (p, h, t) => {
	await mk(p, { 'Projects/': '', ...binderFiles('Projects/Book', ['Two', 'One']), ...binderFiles('Projects/Other', ['Beta', 'Alpha', 'Gamma']) }, 600);
	await rows(p, 'Projects', ['Projects', 'Projects/Book', 'Projects/Other']);
	const before = await texts(p);
	await rightClick(p, 'Projects/Book');
	await pick(p, 'Delete');
	await p.ev(`[...document.querySelectorAll('.modal button')].find(b => /delete|trash/i.test(b.textContent))?.click()`);
	await p.sleep(700);
	await flush(p); await p.sleep(300);
	t.ok(!(await exists(p, 'Projects/Book/Book.md')), 'the binder is gone');
	const seen = await shown(p, 'Projects', ['Projects', 'Projects/Other']);
	t.eq(seen.filter((x) => x.startsWith('Projects/Other/')).join('|'), 'Projects/Other/Beta.md|Projects/Other/Alpha.md|Projects/Other/Gamma.md', 'the other binder keeps its order');
	t.eq((await disk(p, 'Projects/Other/Other.md')).join('|'), 'Beta|Alpha|Gamma', 'and its note lists the same');
	const after = await texts(p);
	sameTexts(t, Object.fromEntries(Object.entries(before).filter(([k]) => !k.startsWith('Projects/Book/'))), after, { skip: [] });
});

test('a binder whose list was typed by hand has the names true and null: the notes drop out of its list and lose their place, and a drag writes the list without them', async (p, h, t) => {
	// typed the way a writer might: YAML reads "true" and "null" as a boolean and nothing, and "1984" and "no" as a number and text
	const hand = '---\nbinder: 1\ncontents:\n  - 1984\n  - true\n  - no\n  - null\n  - Two\n---\n';
	await mk(p, { 'Lists/': '', 'Lists/Lookalike/': '', 'Lists/Lookalike/Lookalike.md': hand, 'Lists/Lookalike/1984.md': 'a', 'Lists/Lookalike/true.md': 'b', 'Lists/Lookalike/no.md': 'c', 'Lists/Lookalike/null.md': 'd', 'Lists/Lookalike/Two.md': 'e' }, 800);
	await rows(p, 'Lists', ['Lists', 'Lists/Lookalike']);
	const shownNow = async () => (await shown(p, 'Lists/Lookalike', ['Lists', 'Lists/Lookalike'])).filter((x) => x.endsWith('.md') && !x.endsWith('Lookalike.md')).map((x) => x.replace('Lists/Lookalike/', '').replace(/\.md$/, ''));
	const before = await shownNow();
	await drag(p, 'Lists/Lookalike/Two.md', top(await row(p, 'Lists/Lookalike/1984.md')));
	await flush(p); await p.sleep(300);
	const after = await shownNow();
	const onDisk = (await disk(p, 'Lists/Lookalike/Lookalike.md')).join('|');
	t.eq(onDisk, 'Two|1984|true|no|null', 'the list written down after the drag has every name (the explorer shows ' + after.join('|') + ')');
	t.eq(after.join('|'), ['Two', '1984', 'true', 'no', 'null'].join('|'), 'after the drag the list’s order is kept');
});
