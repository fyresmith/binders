// QA round 11, find and replace: what a query reaches (links, tags, code, comments, footnotes, tables, block ids, HTML,
// escapes, headings) and Unicode (accents, emoji, Turkish İ, dotless ı, CJK, right to left), through the bar as a writer
// uses it: the editor's search and replace commands open it, keys go into its fields, Replace all and its review are
// clicked. Every test that replaces reads the files on disk afterwards, byte for byte. Tests named "qa11 fr-rules: …"
// pass; "BUG: …" are confirmed bugs (they fail now and stay as the regression); "NIT: …" are small things.
// Unicode is written with \u escapes on purpose: a precomposed é and e + a combining accent must reach the file as they are.
// Not covered here (see specs-find-replace.mjs): the review, Undo, snapshots, the boards, phones, the first shield cases.
import { VIEW, j, openView, until, withTidy } from './view-helpers.mjs';
import { M, binder, disk, saveAll, settle, snap } from './specs-qa5-manuscript.mjs';

export const specs = [];
/** Each check runs even after one fails (a test is a finding list, not its first failure); the test fails once, naming them all. */
function soft(t) {
	const bad = [];
	return {
		ok: (v, m) => { if (!v) bad.push(m); },
		eq: (a, b, m) => { if (a !== b) bad.push(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
		done: () => { if (bad.length) t.ok(false, bad.join(' | ')); },
	};
}
/** “BUG: …” and “NIT: …” lead the name, as the runner lists them. */
const label = (n) => (/^(BUG|NIT): /.test(n) ? n.replace(/^(BUG|NIT): /, '$1: qa11 fr-rules: ') : 'qa11 fr-rules: ' + n);
const test = (name, fn) => specs.push({ name: label(name), fn: withTidy(async (p, h, t) => { const s = soft(t); try { await fn(p, h, s); s.done(); } finally { await closeAll(p); } }) });

const BAR = `${VIEW}.findBar`;
const BARSEL = '.workspace-leaf.mod-active .binders-view .binders-find';

async function closeAll(p) {
	await p.ev(`(() => { try { ${BAR}?.close(); } catch {} document.querySelectorAll('.modal-container .modal-close-button').forEach(b => b.click()); document.querySelectorAll('.menu').forEach(m => m.remove()); return 1; })()`).catch(() => {});
}

/** A binder of these notes (name → text, in order), opened as its manuscript (or in `mode`). */
async function fr(p, folder, notes, { mode = 'manuscript' } = {}) {
	await binder(p, folder, notes);
	await openView(p, folder);
	await p.ev(`(() => { ${VIEW}.setMode(${j(mode)}); return 1; })()`);
	if (mode === 'manuscript') await settle(p);
	else await p.sleep(900);
}

/** The bar, opened by Obsidian's replace command when a section of the manuscript has the keyboard (as Ctrl+H would), else
    by the binder's own command. */
async function openBar(p) {
	await p.ev(`(() => { const s = ${M}?.scenes?.find(s => s.live); if (s) { s.live.cm.focus(); app.commands.executeCommandById('editor:open-search-replace'); } else app.commands.executeCommandById('binders:find-replace'); return 1; })()`);
	await until(p, `!!${BAR}`, 3000);
	await p.sleep(250);
}

/** A field of the bar, cleared and typed into by the keyboard. */
async function fill(p, which, text) {
	await p.ev(`(() => { ${BAR}.${which}.focus(); return 1; })()`);
	await p.key('a', 'ctrl');
	await p.type(text);
	await p.sleep(350);
}

/** The writer's search: the query typed (and the replacement, if one is given), Match case as asked. */
async function search(p, query, { by = null, match = false } = {}) {
	if (!(await p.ev(`!!${BAR}`))) await openBar(p);
	const on = await p.ev(`!!${BAR}.options.matchCase`);
	if (on !== match) { await p.ev(`document.querySelector(${j(BARSEL + ' button[aria-label^="Match case"]')}).click()`); await p.sleep(300); }
	await fill(p, 'input', query);
	if (by != null) await fill(p, 'by', by);
}

/** What the bar says about the count, as a number of matches (the position and the notes are left out). */
const counted = (p) => p.ev(`document.querySelector(${j(BARSEL + ' .document-search-count')})?.textContent ?? null`);
/* (the bar says “1 / 4 in 1 note” in the manuscript and “4 in 1 note” in the other views) */
const tally = async (p) => { const m = /^(\d+) \/ (\d+)|^(\d+) in /.exec((await counted(p)) ?? ''); return m ? Number(m[2] ?? m[3]) : 0; };

/** Replace all as a writer does: the button, the review, its button; then the sections are saved. */
async function replaceAll(p) {
	await p.ev(`document.querySelector(${j(BARSEL + ' button[aria-label^="Replace all..."]')})?.click()`);
	await until(p, `!!document.querySelector('.modal.binders-find-review')`, 5000);
	await p.sleep(200);
	await p.ev(`document.querySelector('.modal.binders-find-review button.mod-cta')?.click()`);
	await until(p, `!document.querySelector('.modal.binders-find-review')`, 8000);
	await p.sleep(600);
	await saveAll(p);
}

/** Every file of the vault, but the snapshots Replace all takes. */
const vault = (p) => Object.fromEntries(Object.entries(snap(p)).filter(([k]) => !/(^|\/)Snapshots\//.test(k)));
/** Every file is what it was, byte for byte, but for `changes` (path → the whole text expected). */
function only(t, p, before, changes = {}) {
	const now = vault(p);
	for (const k of new Set([...Object.keys(before), ...Object.keys(now)])) {
		if (k in changes) t.eq(now[k], changes[k], `“${k}” is exactly what it should be`);
		else t.eq(now[k], before[k], `“${k}” is untouched, byte for byte`);
	}
}

// =====================================================================================================================
// What a query reaches: the adversarial cases first
// =====================================================================================================================

test('a bare URL is where a link leads: a word of it is no match, and Replace all leaves every URL as it was', async (p, h, t) => {
	const F = 'Q11 Url';
	await fr(p, F, { '1 Links': 'See https://maraproject.org/#Mara and https://en.wikipedia.org/wiki/Mara for Mara.\nAlso www.mara.example.\n' });
	const before = vault(p);
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 1, 'only the word in the prose is a match (the two URLs and the www address are not)');
	await replaceAll(p);
	only(t, p, before, { [`${F}/1 Links.md`]: 'See https://maraproject.org/#Mara and https://en.wikipedia.org/wiki/Mara for Maren.\nAlso www.mara.example.\n' });
});

test('an escaped first bracket makes the rest text: in \\[[Mara]] the word is prose, found and replaced', async (p, h, t) => {
	const F = 'Q11 Esc';
	await fr(p, F, { '1 Esc': 'Escaped \\[[Mara]] shows as text.\n' });
	const before = vault(p);
	const links = await p.ev(`(app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${j(F + '/1 Esc.md')}))?.links ?? []).length`);
	t.eq(links, 0, 'Obsidian itself finds no link in it (the escaped bracket makes the rest text)');
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 1, 'the word is a match');
	await replaceAll(p);
	only(t, p, before, { [`${F}/1 Esc.md`]: 'Escaped \\[[Maren]] shows as text.\n' });
});

test('a block id (^mara) is where a link leads: no match in it, and Replace all leaves it and the link to it', async (p, h, t) => {
	const F = 'Q11 Block';
	await fr(p, F, { '1 Target': 'A line someone links to. ^mara\n', '2 Linker': 'See [[1 Target#^mara]] for it.\n' });
	const before = vault(p);
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 0, 'the block id is not a match (a link to it would break)');
	if ((await tally(p)) > 0) await replaceAll(p);
	only(t, p, before, {});
});

test('HTML: an img’s src and a link’s href are where something leads and are kept; the words between the tags change', async (p, h, t) => {
	const F = 'Q11 Html';
	await fr(p, F, { '1 Html': 'An image <img src="Mara.png" alt="Mara"> and a <a href="https://x.example/Mara">Mara</a> link.\n' });
	await search(p, 'Mara', { by: 'Maren' });
	await replaceAll(p);
	const now = disk(p, `${F}/1 Html.md`);
	t.ok(now.includes('src="Mara.png"'), 'the image’s file name is as it was (the image still loads)');
	t.ok(now.includes('href="https://x.example/Mara"'), 'the link’s address is as it was');
	t.ok(now.includes('>Maren</a> link.'), 'the words the link shows are changed');
});

test('an indented block of four spaces is code, as Obsidian draws it: its words are kept', async (p, h, t) => {
	const F = 'Q11 Indent';
	await fr(p, F, { '1 Indent': 'Prose Mara.\n\n    Mara indented code\n\nEnd Mara.\n' });
	await search(p, 'Mara', { by: 'Maren' });
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Indent.md`), 'Prose Maren.\n\n    Mara indented code\n\nEnd Maren.\n', 'the code line is kept, the two prose words change');
});

test('a fence inside a quote is code: its words are kept, the same as a fence in a list', async (p, h, t) => {
	const F = 'Q11 Quote';
	await fr(p, F, { '1 Quote': '> ```\n> Mara in a quoted fence\n> ```\n\n- item\n  ```\n  Mara in a list fence\n  ```\n\nMara out.\n' });
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 1, 'only the word outside the code is a match');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Quote.md`), '> ```\n> Mara in a quoted fence\n> ```\n\n- item\n  ```\n  Mara in a list fence\n  ```\n\nMaren out.\n', 'the quoted fence and the list fence are kept');
});

test('an unclosed fence runs to the end of the note: nothing after it is a match', async (p, h, t) => {
	const F = 'Q11 Open';
	await fr(p, F, { '1 Open': 'Before Mara.\n\n```\nMara in an open fence\n\nMara still in it.\n' });
	const before = vault(p);
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 1, 'the word before the fence is the only match');
	await replaceAll(p);
	only(t, p, before, { [`${F}/1 Open.md`]: 'Before Maren.\n\n```\nMara in an open fence\n\nMara still in it.\n' });
});

test('a ~~~ fence holds ``` lines and closes only at ~~~; a ``` fence holds ~~~ lines and closes only at ```', async (p, h, t) => {
	const F = 'Q11 Tilde';
	const text = '~~~\n```\nMara inside\n```\n~~~\n\nMara after.\n\n```\n~~~\nMara in backtick fence\n```\n\nMara last.\n';
	await fr(p, F, { '1 Tilde': text });
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 2, 'the two words outside the fences are the matches');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Tilde.md`), text.replace('Mara after', 'Maren after').replace('Mara last', 'Maren last'), 'both fences are kept, the text between them changes');
});

test('a note with CRLF line breaks, not open anywhere: the fences close and the line breaks come back as they were', async (p, h, t) => {
	const F = 'Q11 Crlf';
	const crlf = 'Mara one.\r\n```\r\nMara in code\r\n```\r\nMara two.\r\n';
	await fr(p, F, { '1 Crlf': crlf }, { mode: 'outliner' });
	t.eq(disk(p, `${F}/1 Crlf.md`), crlf, 'the note is made with its line breaks');
	const before = vault(p);
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 2, 'the code in the fence is no match');
	await replaceAll(p);
	only(t, p, before, { [`${F}/1 Crlf.md`]: 'Maren one.\r\n```\r\nMara in code\r\n```\r\nMaren two.\r\n' });
});

test('NIT: a CRLF note open in the manuscript: Replace all keeps the matches’ line breaks CRLF (the editor saves LF, as typing does)', async (p, h, t) => {
	const F = 'Q11 CrlfOpen';
	const crlf = 'Mara one.\r\n```\r\nMara in code\r\n```\r\nMara two.\r\n';
	await fr(p, F, { '1 Crlf': crlf });
	t.eq(disk(p, `${F}/1 Crlf.md`), crlf, 'opening it in the manuscript writes nothing');
	const before = vault(p);
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 2, 'two matches');
	await replaceAll(p);
	only(t, p, before, { [`${F}/1 Crlf.md`]: 'Maren one.\r\n```\r\nMara in code\r\n```\r\nMaren two.\r\n' });
});

test('multi-line comments (%% and <!-- -->) hold their words across lines; the words after them change', async (p, h, t) => {
	const F = 'Q11 Comments';
	const text = 'Start %%\nMara in a comment\n%% and Mara after.\n\n<!--\nMara in html\n-->\nMara last.\n';
	await fr(p, F, { '1 Com': text });
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 2, 'the two outside the comments');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Com.md`), 'Start %%\nMara in a comment\n%% and Maren after.\n\n<!--\nMara in html\n-->\nMaren last.\n', 'the comments are kept, the rest changes');
});

test('footnotes: a reference and its definition change together, so the note’s footnote still works', async (p, h, t) => {
	const F = 'Q11 Notes';
	await fr(p, F, { '1 Notes': 'Mara said so.[^Mara]\n\n[^Mara]: Mara\'s source.\n' });
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 4, 'all four are matches: the words, the reference’s label and the definition’s label');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Notes.md`), 'Maren said so.[^Maren]\n\n[^Maren]: Maren\'s source.\n', 'the label is the same in both places');
});

test('NIT: a table in an open section: an escaped pipe in a link’s alias keeps its target; the cell’s words change and the escaped pipes stay', async (p, h, t) => {
	const F = 'Q11 Table';
	const text = '| name | where |\n| --- | --- |\n| [[Mara\\|her]] | Mara \\| more |\n';
	await fr(p, F, { '1 Table': text });
	t.eq(disk(p, `${F}/1 Table.md`), text, 'opening it in the manuscript writes nothing (the table is not re-aligned)');
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 1, 'the link’s target (Mara\\) is not a match; the cell’s word is');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Table.md`), text.replace('| Mara \\|', '| Maren \\|'), 'the table is as it was but for the one word');
});

test('a table in a note with no editor open: Replace all leaves its bytes but for the one word (the cells are not re-aligned)', async (p, h, t) => {
	const F = 'Q11 TableOut';
	const text = '| name | where |\n| --- | --- |\n| [[Mara\\|her]] | Mara \\| more |\n';
	await fr(p, F, { '1 Table': text }, { mode: 'outliner' });
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 1, 'one word is a match');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Table.md`), text.replace('| Mara \\|', '| Maren \\|'), 'the table is as it was but for the one word');
});

test('a heading’s words are prose; a #tag at the start of a line is a tag and no match', async (p, h, t) => {
	const F = 'Q11 Heads';
	await fr(p, F, { '1 Heads': '# Mara Heading\n\n#Mara at line start\n\n## Mara\'s return\n' });
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 2, 'the two headings');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Heads.md`), '# Maren Heading\n\n#Mara at line start\n\n## Maren\'s return\n', 'the tag is kept');
});

// =====================================================================================================================
// Unicode
// =====================================================================================================================

test('Turkish İ with Match case off: istanbul finds İstanbul and İSTANBUL, and İstanbul finds istanbul (as Turkish case does)', async (p, h, t) => {
	const F = 'Q11 Turkish';
	await fr(p, F, { '1 Tr': 'İstanbul, istanbul, ISTANBUL and İSTANBUL.\n' });
	await search(p, 'istanbul');
	t.eq(await tally(p), 4, 'all four spellings are one city: the lower-case query finds the one with a dotted capital');
	await search(p, 'İstanbul');
	t.eq(await tally(p), 4, 'and the dotted capital in the query finds all four');
	await search(p, 'istanbul', { by: 'Ankara' });
	if ((await tally(p)) > 0) await replaceAll(p);
	t.eq(disk(p, `${F}/1 Tr.md`), 'Ankara, Ankara, Ankara and Ankara.\n', 'Replace all takes each one');
});

test('the dotless ı is its own letter with Match case off: it finds neither i nor I', async (p, h, t) => {
	const F = 'Q11 Dotless';
	await fr(p, F, { '1 Dot': 'ıs, is, IS.\n' });
	await search(p, 'ı');
	t.eq(await tally(p), 1, 'only the dotless letter itself is a match (Turkish keeps ı and i apart)');
});

test('a precomposed é finds the same letter written as e and a combining accent, and the other way', async (p, h, t) => {
	const F = 'Q11 Accent';
	await fr(p, F, { '1 Accent': 'café and café and cafe.\n' });
	await search(p, 'café');
	t.eq(await tally(p), 2, 'both spellings of café are matches (the plain cafe is a different word)');
	await search(p, 'café', { by: 'coffee' });
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Accent.md`), 'coffee and coffee and cafe.\n', 'both are replaced, the plain word is kept');
});

test('a base letter inside a decomposed é (e and a combining accent) is not a match: no accent is left on the replacement', async (p, h, t) => {
	const F = 'Q11 Split';
	const text = 'café at dawn.\n';
	await fr(p, F, { '1 Split': text });
	await search(p, 'e', { by: 'x' });
	t.eq(await tally(p), 0, 'the e is part of an é, not a letter of its own');
	if ((await tally(p)) > 0) await replaceAll(p);
	t.eq(disk(p, `${F}/1 Split.md`), text, 'nothing changed');
});

test('Hebrew and Arabic: found, replaced where they stand, the direction marks kept (and the Latin word between them)', async (p, h, t) => {
	const F = 'Q11 Rtl';
	await fr(p, F, { '1 Rtl': 'שלום Mara עולם‏\nمرحبا Mara يا\n' });
	await search(p, 'שלום', { by: 'הלו' });
	t.eq(await tally(p), 1, 'the Hebrew word is found once');
	await replaceAll(p);
	await search(p, 'Mara', { by: 'Maren' });
	t.eq(await tally(p), 2, 'the Latin word is found in both lines');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Rtl.md`), 'הלו Maren עולם‏\nمرحبا Maren يا\n', 'each change is where it was; the mark after עולם is kept');
});

test('CJK: words found and replaced; a CJK tag (#灯塔) is a tag and no match; the link’s target is kept', async (p, h, t) => {
	const F = 'Q11 Cjk';
	await fr(p, F, { '1 Cjk': '灯塔的灯 #灯塔 [[灯塔]] 灯塔。\n' });
	await search(p, '灯塔');
	t.eq(await tally(p), 2, 'the two words, not the tag and not the link’s target');
	await search(p, '灯塔', { by: '海岸' });
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Cjk.md`), '海岸的灯 #灯塔 [[灯塔]] 海岸。\n', 'the tag and the link stay, the words change');
});

test('emoji: a joined sequence keeps its joiner when its first emoji is replaced; skin tones and flags are kept', async (p, h, t) => {
	const F = 'Q11 Emoji';
	await fr(p, F, { '1 Emoji': '👩‍💻 and 👩 and 👍🏽 and 🇫🇷.\n' });
	await search(p, '👩', { by: '🧑' });
	t.eq(await tally(p), 2, 'both the woman and the one in the technologist sequence');
	await replaceAll(p);
	await search(p, '👍', { by: '👎' });
	t.eq(await tally(p), 1, 'the thumb is found under its skin tone');
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Emoji.md`), '🧑‍💻 and 🧑 and 👎🏽 and 🇫🇷.\n', 'the joiner, the skin tone and the flag are as they were');
});

test('a query is taken as typed (its punctuation is literal), and a replacement is written as typed ($& and $1 are not patterns)', async (p, h, t) => {
	const F = 'Q11 Meta';
	const text = 'Mara (the one) pays $5.00 for a.b, not axb. Mara* and [x].\n';
	await fr(p, F, { '1 Meta': text });
	await search(p, 'a.b');
	t.eq(await tally(p), 1, 'a.b is the dot, not any character (axb is no match)');
	await search(p, '(the one)');
	t.eq(await tally(p), 1, 'the brackets of the query are not a group');
	await search(p, 'Mara*');
	t.eq(await tally(p), 1, 'the star is a star');
	await search(p, '[x]');
	t.eq(await tally(p), 1, 'the square brackets are not a class');
	await search(p, 'a.b', { by: '$&-$1' });
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Meta.md`), text.split('for a.b').join('for $&-$1'), 'the replacement is written as typed');
});

test('a replacement with a link in it is written as typed: it makes the link, and the tag beside it is kept', async (p, h, t) => {
	const F = 'Q11 Typed';
	await fr(p, F, { '1 Typed': 'Mara and #Mara.\n' });
	await search(p, 'Mara', { by: '[[Maren]]' });
	await replaceAll(p);
	t.eq(disk(p, `${F}/1 Typed.md`), '[[Maren]] and #Mara.\n', 'the brackets are the writer’s text; the tag is not a match');
});

// =====================================================================================================================
// Controls: the same edits typed by hand in an open section, to tell Obsidian's own rewriting from Binders'
// =====================================================================================================================

test('control: typing one letter in a table cell of an open section re-aligns the table (Obsidian does this itself)', async (p, h, t) => {
	const F = 'Q11 TableType';
	const text = '| name | where |\n| --- | --- |\n| [[Mara\\|her]] | Mara \\| more |\n';
	await fr(p, F, { '1 Table': text });
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.live); const cm = s.live.cm; const i = cm.state.doc.toString().indexOf(${j('Mara \\| more')}); cm.focus(); cm.dispatch({ selection: { anchor: i + 4 } }); return 1; })()`);
	await p.sleep(200);
	await p.type('x');
	await p.sleep(500);
	await saveAll(p);
	t.eq(disk(p, `${F}/1 Table.md`), '| name          | where         |\n| ------------- | ------------- |\n| [[Mara\\|her]] | Marax \\| more |\n', 'the letter, and the table re-aligned by the editor');
});

test('control: typing at the end of an open CRLF note saves the note with LF line breaks (the editor’s own save)', async (p, h, t) => {
	const F = 'Q11 CrlfType';
	const crlf = 'Mara one.\r\n```\r\nMara in code\r\n```\r\nMara two.\r\n';
	await fr(p, F, { '1 Crlf': crlf });
	await p.ev(`(() => { const s = ${M}.scenes.find(s => s.live); const cm = s.live.cm; cm.focus(); cm.dispatch({ selection: { anchor: cm.state.doc.length } }); return 1; })()`);
	await p.sleep(200);
	await p.type('x');
	await p.sleep(500);
	await saveAll(p);
	const now = disk(p, `${F}/1 Crlf.md`);
	t.ok(!/\r\n/.test(now) && now.includes('\nx'), 'every line break is LF after the save: ' + JSON.stringify(now.slice(-30)));
});
