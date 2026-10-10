// QA round 11, Scrivener smoke: a binder out as a Scrivener project (Export's Scrivener project) and back in (Import from
// Scrivener), through their real dialogs. Only the system's folder chooser is stood in for, as in specs-qa9-roundtrip.mjs.
// Looks for what specs-qa9-roundtrip.mjs does not: literal Markdown-looking text, exact punctuation and astral characters,
// tab-led paragraphs and what they leak into, synopses and labels and statuses that are not in the lists, folder labels,
// name collisions, duplicate names, empty notes, links out of the binder, line breaks, and a second trip.
// Each test starts from the pristine test vault (withTidy). Headings are left out: they are an open finding.
import { existsSync } from 'fs';
import { join } from 'path';
import { B, PL, j, until, withTidy, read, exists, openView, writeRaw } from './view-helpers.mjs';

export const specs = [];
const EXPORT_WIN = '.modal.binders-export', IMPORT_WIN = '.modal.binders-import', FOLDER = 'The Lighthouse', RET = 'Returned';
const L = `${FOLDER}/`;

/** The body of a note: its text, without the properties block. */
const body = (text) => text.replace(/^---\n(?:[\s\S]*?\n)?---\n?/, '');
/** Obsidian's escapes: a backslash before an ASCII mark is the mark itself. */
const unmd = (s) => s.replace(/\\([!-\/:-@\[-`{-~])/g, '$1');
/** Lines as a writer sees them: trailing spaces and blank lines left out, everything else (tabs, marks) kept. */
/** A link into the binder, [[Returned/Part One/The keeper|The keeper]], read as the link it was: [[The keeper]]. */
const unbind = (s) => s.replace(/\[\[[^\]|]*\/([^\]|/]*)\|([^\]]*)\]\]/g, '[[$2]]');
const lines = (s) => s.split('\n').map((l) => l.replace(/[ \t]+$/, '')).filter((l) => l.trim() !== '').join('\n');
const words = (s) => s.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];

// ---- the export and import sides (as specs-qa9-roundtrip.mjs drives them) ----
const run = (p, id) => p.ev(`(() => { app.commands.executeCommandById('binders:${id}'); return 1; })()`);
const pick = async (p, name) => { await p.ev(`(() => { [...document.querySelectorAll('${EXPORT_WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === ${j(name)}).click(); return 1; })()`); await until(p, `!!document.querySelector('${EXPORT_WIN} .binders-export-binder .binders-export-row')`, 8000); await p.sleep(300); };
async function openExport(p, folder = FOLDER) {
	await openView(p, folder);
	await run(p, 'export');
	await until(p, `!!document.querySelector('${EXPORT_WIN} [role="option"]')`, 6000);
	await p.sleep(300);
	await pick(p, 'Scrivener project');
}
const press = async (p, label) => { if (!(await p.ev(`(() => { const b = [...document.querySelectorAll('${EXPORT_WIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b) return false; b.click(); return true; })()`))) throw new Error(`no button “${label}” in the Export window`); await p.sleep(100); };
const saved = (p, ms = 10000) => until(p, `(document.querySelector('${EXPORT_WIN} .binders-export-status')?.textContent ?? '').startsWith('Saved to')`, ms);
/** Stands in for the system's save dialog: the project goes where `start` says (Exports beside the binder). */
const standIn = (p) => p.ev(`(() => {
	const pl = ${PL}; window.__qa11 ??= { real: pl.exportHost.desktop };
	pl.exportHost.desktop = (app) => { const d = window.__qa11.real(app); return d && { ...d, pick: async (start) => start }; };
	return 1;
})()`);
const restoreExport = (p) => p.ev(`(() => { const pl = ${PL}; if (window.__qa11) pl.exportHost.desktop = window.__qa11.real; return 1; })()`);
/** The import's folder chooser answers with the project's folder; the desktop reader is real. */
const importFrom = (p, dir) => p.ev(`(() => { const pl = ${PL}; window.__qa11Imp ??= pl.importHost.desktop; pl.importHost.desktop = (app) => { const d = window.__qa11Imp(app); if (!d) throw new Error('desktop reader missing'); return {...d, pick: async () => ${j(dir)}}; }; return 1; })()`);
const IWIN = IMPORT_WIN;
const ipress = async (p, label) => {
	const ok = await p.ev(`(() => { const b = [...document.querySelectorAll('${IWIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b || b.disabled) return false; b.click(); return true; })()`);
	if (!ok) throw new Error(`no enabled import button “${label}”`);
	await p.sleep(100);
};
const itext = (p, sel) => p.ev(`document.querySelector('${IWIN} ${sel}')?.textContent ?? ''`);
/** Opens the import dialog on a project folder, names the new binder and waits for its plan. */
async function begin(p, dir, name) {
	await p.ev(`(() => { app.commands.executeCommandById('binders:import-scrivener'); return 1; })()`);
	await until(p, `!!document.querySelector('${IWIN}')`);
	await importFrom(p, dir);
	await ipress(p, 'Choose a project...');
	const ready = await until(p, `!!document.querySelector('${IWIN} [data-binders-key="name"]')`, 15_000);
	if (!ready) throw new Error('import did not load: ' + await itext(p, '.binders-import-said'));
	await until(p, `document.querySelectorAll('${IWIN}').length === 1`, 3000);
	await p.ev(`(() => { const i = document.querySelector('${IWIN} [data-binders-key="name"]'); i.value = ${j(name)}; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(800);
}
async function imported(p, root) {
	await ipress(p, 'Import');
	const ready = await until(p, `!!${B}.binderOf(${j(root)}) && !document.querySelector('${IWIN}')`, 20_000);
	if (!ready) throw new Error('import did not finish: ' + await itext(p, '.binders-import-why'));
	await p.sleep(300);
}
const closeAll = async (p) => { for (let i = 0; i < 4 && (await p.ev(`!!document.querySelector('.modal-container')`)); i++) { await p.key('Escape'); await p.sleep(150); } };
/** The notes of a binder, in its order: the path inside the binder, without the root or “.md”. */
const scenes = (p, root) => p.ev(`${B}.scenes(app.vault.getAbstractFileByPath(${j(root)})).map(f => f.path.slice(${root.length + 1}, -3))`);
const fm = (p, path) => p.ev(`(() => { const c = app.metadataCache.getCache(${j(path)}); return c?.frontmatter ? JSON.stringify(c.frontmatter) : 'none'; })()`);

/** One trip: the binder (or a folder of it) out as a Scrivener project, then that project in as a new binder. */
async function trip(p, { folder = FOLDER, name = RET } = {}) {
	const dir = join(p.vaultDir, 'Exports'), at = join(dir, `${folder}.scriv`);
	await standIn(p);
	await openExport(p, folder);
	await press(p, 'Export');
	await saved(p);
	await restoreExport(p);
	await closeAll(p);
	if (!existsSync(at)) throw new Error('the project was not written at ' + at);
	await begin(p, at, name);
	await imported(p, name);
	return at;
}

const test = (name, fn) => specs.push({ name: /^(BUG|NIT): /.test(name) ? name : 'qa11 scriv smoke: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(async () => { app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportOutside = true; pl.settings.exportSnapshots = true; await pl.saveData(pl.settings); })().then(() => 1)`);
	try { await fn(p, h, t); } finally {
		await closeAll(p);
		await p.ev(`(async () => { const pl = ${PL}; if (window.__qa11) pl.exportHost.desktop = window.__qa11.real; if (window.__qa11Imp) pl.importHost.desktop = window.__qa11Imp; document.querySelectorAll('.notice').forEach(n => n.remove()); app.saveLocalStorage('binders-export', null); pl.settings.exportKind = 'manuscript'; pl.settings.exportOutside = true; pl.settings.exportSnapshots = true; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
}) });

/** The Lighthouse fixture, dressed as specs-qa9-roundtrip.mjs dresses it (its own copy, so this file stands alone). */
async function dress(p) {
	await writeRaw(p, `${L}Part One/Arrival.md`, '---\nstatus: revised\nlabel: Blue\ntarget: 1200\nnotes: Ask Tom about the tide.\nsynopsis: Mara arrives on the island with the supply boat.\ntags:\n  - storm\n---\nThe supply boat left Mara on the jetty.[^1] %%Check the tide.%%\n\n\tIt did **not** wait, see [[The keeper]].\n\n[^1]: With two cases.\n');
	await writeRaw(p, `${L}Part Two/The wreck.md`, '---\nexport: false\n---\nA scene that was cut.\n');
	await writeRaw(p, `${L}Part One/Part One.md`, '---\nsynopsis: The first days.\n---\nNotes for part one.\n');
	await p.ev(`(async () => { await app.vault.create(${j(`${L}Notes on lighthouses.md`)}, '---\\nexport: false\\n---\\nFresnel lenses.\\n'); })().then(() => 1)`);
	await until(p, `app.metadataCache.getCache(${j(`${L}Notes on lighthouses.md`)})?.frontmatter?.export === false && app.metadataCache.getCache(${j(`${L}Part One/Arrival.md`)})?.frontmatter?.label === 'Blue'`, 8000);
	await p.sleep(600);
}
/** A note written by hand into Part Two (or given text), then the binder's order read back after the trip. */
const putNote = (p, path, text) => writeRaw(p, `${L}${path}`, text);
const noteText = (p, path) => read(p, path).catch(() => '(missing)');

// ---- 1. adversarial: text Binders would escape (a literal star, hash, list mark, bracket, dollar, backslash, backtick) ----
test('1 text escaped the way Binders escapes literal marks comes back identical, line by line', async (p, h, t) => {
	await dress(p);
	const src = [
		'\\*not italic\\* here', '\\# not a heading', '\\- not a bullet', '1\\. not a numbered item', '\\> not a quote',
		'\\[not a link](nowhere)', '\\[\\[not a wiki link]]', 'Costs \\$5 and \\$6 more', 'snake_case_name and \\_leading',
		'a \\#hashtag and \\#not-tag', '\\<div>not html\\</div> and a\\<b', '\\&amp; and \\&copy; and & alone', 'C:\\\\dir\\\\file and a \\* star',
		'\\`code\\` and \\`\\`double\\`\\`', '\\+ plus item', '1\\) paren item',
	];
	await putNote(p, 'Part Two/Literal text.md', `---\n---\n${src.join('\n\n')}\n`);
	await p.sleep(400);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Literal text.md`));
	t.ok(got !== '(missing)', 'the note is there');
	t.eq(lines(got), lines(src.join('\n\n')), `every line is the same as it was written (raw: ${JSON.stringify(got.slice(0, 400))})`);
});


// ---- 1b. an escaped dollar sign (a literal $, not math) comes back as the same escape ----
test('1b an escaped dollar sign comes back as the same escape, alone and beside another', async (p, h, t) => {
	await dress(p);
	const src = ['It costs \\$6 today.', 'Then \\$5 and \\$6 more.', 'Pay \\$7.'];
	await putNote(p, 'Part Two/Dollars.md', `---\n---\n${src.join('\n\n')}\n`);
	await p.sleep(400);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Dollars.md`));
	for (const line of src) t.ok(got.includes(line), `“${line}” is the same line (raw: ${JSON.stringify(got.slice(0, 200))})`);
});

// ---- 1c. escaped dollars in a line with more of them: the same escapes come back (narrowing 1) ----
test('BUG: 1c an escaped dollar sign beside a pair of them, and a line of four, comes back as the same escapes', async (p, h, t) => {
	await dress(p);
	const src = ['Price \\$\\$ too.', 'Costs \\$5 and \\$6, and \\$\\$ too.', 'Then \\$5 and \\$6, and \\$7 more.'];
	await putNote(p, 'Part Two/Dollars two.md', `---\n---\n${src.join('\n\n')}\n`);
	await p.sleep(400);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Dollars two.md`));
	for (const line of src) t.ok(got.includes(line), `“${line}” is the same line (raw: ${JSON.stringify(got.slice(0, 220))})`);
});

// ---- 1d. a block id typed at a paragraph's end (Obsidian’s ^id, hidden in reading view) is kept as typed ----
test('NIT: 1d a line that ends with a block id as typed (^note-one) keeps the id', async (p, h, t) => {
	await dress(p);
	const src = ['The keeper said it was late. ^note-one', 'A second line with no id.'];
	await putNote(p, 'Part Two/Block id.md', `---\n---\n${src.join('\n\n')}\n`);
	await p.sleep(400);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Block id.md`));
	t.ok(got.includes('The keeper said it was late.'), `the sentence is there (raw: ${JSON.stringify(got.slice(0, 200))})`);
	t.ok(got.includes('^note-one'), `the block id is still there (raw: ${JSON.stringify(got.slice(0, 200))})`);
});

// ---- 2. exact characters: punctuation, decomposed letters, astral characters, scripts ----
test('2 curly quotes, dashes, an ellipsis, no-break and thin spaces, decomposed letters, emoji and astral characters come back exactly', async (p, h, t) => {
	await dress(p);
	const src = [
		'\u201cCurly,\u201d she said \u2014 \u201cnot straight\u201d \u2013 en dash \u2026 ellipsis.',
		'Non\u00a0breaking and thin\u2009space, and a soft\u00adhyphen.',
		'Caf\u00e9 composed, and Cafe\u0301 decomposed, and a\u0308 mark alone.',
		'Emoji \ud83c\udf0a and astral \ud835\udd18\ud835\udd2b\ud835\udd26 and a family \ud83d\udc69\u200d\ud83d\ude80 with a joiner.',
		'\u4f60\u597d\uff0c\u4e16\u754c\u3002 and \u0645\u0631\u062d\u0628\u0627 and \u05e9\u05dc\u05d5\u05dd.',
	];
	await putNote(p, 'Part Two/Exact characters.md', `---\n---\n${src.join('\n\n')}\n`);
	await p.sleep(400);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Exact characters.md`));
	for (const s of src) t.ok(got.includes(s), `“${s.slice(0, 30)}…” is there byte for byte (raw: ${JSON.stringify(got.slice(0, 200))})`);
});

// ---- 3. tab-led paragraphs: the tab, the markup in them, and literal marks after the tab ----
test('3 paragraphs begun with a tab keep the tab and their marks, including as the note’s first line and beside literal marks', async (p, h, t) => {
	await dress(p);
	const src = [
		'\tFirst line, tabbed, with **bold** and *italic*.',
		'\tA link to [the web](https://example.com) and a note %%kept in a comment%%.',
		'\t# not a heading after a tab',
		'\t- not a bullet after a tab',
		'Plain paragraph after the tabbed ones.',
		'\tTabbed again after a plain one.',
	];
	await putNote(p, 'Part Two/Tabs.md', `---\n---\n${src.join('\n\n')}\n`);
	await p.sleep(400);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Tabs.md`));
	t.eq(lines(unmd(got)), lines(src.join('\n\n')), `every line is back: tabs, bold, italics, the link, the comment, the literal marks (raw: ${JSON.stringify(got.slice(0, 300))})`);
});

// ---- 4. a tab's indent does not leak into the paragraph after it (RTF's paragraph formatting lasts past \par) ----
test('4 the paragraph after a tab-led one is not tab-led, and the one after that is (indents do not leak)', async (p, h, t) => {
	await dress(p);
	const src = ['\tFirst indented.', 'Plain after it.', '\tIndented again.', 'Plain last.', 'Plain before a tab.', '\tTab at the end.'];
	await putNote(p, 'Part Two/Indent leak.md', `---\n---\n${src.join('\n\n')}\n`);
	await p.sleep(400);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Indent leak.md`));
	t.eq(lines(unmd(got)), lines(src.join('\n\n')), `each paragraph keeps its own tab or none (raw: ${JSON.stringify(got.slice(0, 300))})`);
});

// ---- 5. synopses and scene notes with punctuation, emoji and YAML-hostile text come back exactly ----
test('BUG: 5 a synopsis and a note with colons, quotes, a hash, brackets, a backslash and an emoji come back exactly', async (p, h, t) => {
	await dress(p);
	const syn = 'Mara: "the keeper", won\u2019t say #1 [draft] \\ ok \ud83c\udf0a: 50% & <done>';
	const notes = 'Check: "quoted" & a tab\u00a0here - yes, [[link]] ?';
	await putNote(p, 'Part Two/Synopsis test.md', `---\nsynopsis: ${j(syn)}\nnotes: ${j(notes)}\n---\nA paragraph of text.\n`);
	await p.sleep(500);
	await trip(p);
	const f = JSON.parse(await fm(p, `${RET}/Part Two/Synopsis test.md`));
	t.eq(f.synopsis, syn, 'the synopsis is the same string');
	t.eq(f.notes, notes, 'the notes are the same string');
});

// ---- 5b. a note's notes (its scene notes) are plain text too: marks in them are not escaped or changed ----
test('BUG: 5b a note’s notes come back as typed: a hash, stars and an underscore are not marked up', async (p, h, t) => {
	await dress(p);
	const notes = 'Check the #tag, a *star* and a_b_c, and "quoted" text.';
	await putNote(p, 'Part Two/Notes text.md', `---\nnotes: ${j(notes)}\n---\nA paragraph of text.\n`);
	await p.sleep(500);
	await trip(p);
	const f = JSON.parse(await fm(p, `${RET}/Part Two/Notes text.md`));
	t.eq(f.notes, notes, `the notes are the same string (got ${JSON.stringify(f.notes)})`);
});

// ---- 6. a label and a status that are not on the vault's lists ----
test('6 a label and a status that are not on the vault’s lists come back as the same words', async (p, h, t) => {
	await dress(p);
	await putNote(p, 'Part Two/Off list.md', '---\nlabel: Teal\nstatus: Waiting on Tom\n---\nA scene with an off-list label and status.\n');
	await p.sleep(500);
	await trip(p);
	const f = await fm(p, `${RET}/Part Two/Off list.md`);
	t.ok(f.includes('"label":"Teal"'), `the label comes back as Teal (${f})`);
	t.ok(f.includes('"status":"Waiting on Tom"'), `the status comes back as Waiting on Tom (${f})`);
});

// ---- 7. a folder's own label, status and synopsis come back on its folder note ----
test('7 a folder’s label, status and synopsis come back on the folder note, and its text stays with it', async (p, h, t) => {
	await dress(p);
	await writeRaw(p, `${L}Part One/Part One.md`, '---\nsynopsis: The first days.\nlabel: Blue\nstatus: revised\n---\nNotes for part one.\n');
	await p.sleep(500);
	await trip(p);
	const f = await fm(p, `${RET}/Part One/Part One.md`);
	t.ok(f.includes('"synopsis":"The first days."'), `the folder’s synopsis comes back (${f})`);
	t.ok(f.includes('"label":"Blue"'), `the folder’s label comes back as Blue (${f})`);
	t.ok(/"status":"revised"/i.test(f), `the folder’s status comes back (${f.match(/"status":"[^"]*"/)?.[0]}; the list’s spelling, as in the note’s case test)`);
	t.ok(!/Binders path/.test(f), `no property the writer never wrote (“Binders path”) is added to the folder note (${f})`);
	t.ok(words(body(await noteText(p, `${RET}/Part One/Part One text.md`))).join(' ') === 'Notes for part one', 'the folder’s own text is still its first note');
});

// ---- 8. a folder's own text and a sibling note named like it: neither is lost on import ----
test('8 a folder’s own text and a sibling note named “<folder> text” both come back, neither overwritten', async (p, h, t) => {
	await dress(p);
	await putNote(p, 'Part One/Part One text.md', '---\n---\nSibling words kept.\n');
	await p.sleep(500);
	await trip(p);
	const names = (await scenes(p, RET)).filter((n) => n.startsWith('Part One/'));
	const all = (await Promise.all(names.map((n) => noteText(p, `${RET}/${n}.md`)))).map(body).join('\n');
	t.ok(all.includes('Notes for part one'), `the folder’s own text is in Part One (${names.join(' | ')})`);
	t.ok(all.includes('Sibling words kept'), 'the sibling note’s text is in Part One too');
});

// ---- 9. two notes with the same name, in different folders, each keep their own text ----
test('9 two notes with the same name in different folders keep their own text and their own folders', async (p, h, t) => {
	await dress(p);
	await putNote(p, 'Part One/Notes.md', '---\n---\nNotes in one.\n');
	await putNote(p, 'Part Two/Notes.md', '---\n---\nNotes in two.\n');
	await p.sleep(500);
	await trip(p);
	t.ok(body(await noteText(p, `${RET}/Part One/Notes.md`)).includes('Notes in one.'), 'the one in Part One has its text');
	t.ok(body(await noteText(p, `${RET}/Part Two/Notes.md`)).includes('Notes in two.'), 'the one in Part Two has its text');
});

// ---- 10. an empty note keeps its place in the order, and its synopsis ----
test('10 an empty note keeps its place in the binder’s order, and its synopsis', async (p, h, t) => {
	await dress(p);
	await putNote(p, 'Part Two/Empty middle.md', '---\nsynopsis: Nothing written yet.\n---\n');
	await p.sleep(500);
	const before = (await scenes(p, FOLDER)).filter((n) => n.startsWith('Part Two/'));
	await trip(p);
	const after = (await scenes(p, RET)).filter((n) => n.startsWith('Part Two/'));
	const kept = before.filter((n) => after.includes(n));
	t.eq(kept.join('|'), before.join('|'), `the Part Two notes are in the same order (before: ${before.join(' | ')}; after: ${after.join(' | ')})`);
	t.eq(await p.ev(`app.metadataCache.getCache(${j(`${RET}/Part Two/Empty middle.md`)})?.frontmatter?.synopsis ?? 'missing'`), 'Nothing written yet.', 'the empty note’s synopsis comes back');
});

// ---- 11. a link to a note outside the binder: it resolves after the trip, or it is plain text ----
test('11 a link to a note outside the binder resolves after the trip (or is plain text), and its words stay', async (p, h, t) => {
	await dress(p);
	await putNote(p, 'Part Two/Link out.md', '---\n---\nSee [[Notes on lighthouses]] for the lenses.\n');
	await p.sleep(500);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Link out.md`));
	t.ok(got.includes('for the lenses'), `the sentence is there (raw: ${JSON.stringify(got.slice(0, 200))})`);
	const links = await p.ev(`(() => { const c = app.metadataCache.getCache(${j(`${RET}/Part Two/Link out.md`)}); return (c?.links ?? []).map(l => ({ link: l.link, ok: !!app.metadataCache.getFirstLinkpathDest(l.link, ${j(`${RET}/Part Two/Link out.md`)}) })); })()`);
	t.ok(links.every((l) => l.ok), `every link in it leads to a note (${JSON.stringify(links)})`);
});

// ---- 12. a line break inside a paragraph stays a line break ----
test('12 a line break inside a paragraph stays a line break, and a blank line stays a blank line', async (p, h, t) => {
	await dress(p);
	await putNote(p, 'Part Two/Breaks.md', '---\n---\nLine one  \nLine two.\n\nNext paragraph.\n');
	await p.sleep(500);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Breaks.md`));
	t.ok(/Line one( {2})?\nLine two\./.test(got), `the line break is kept (raw: ${JSON.stringify(got.slice(0, 120))})`);
	t.ok(/Line two\.\n\nNext paragraph\./.test(got), 'the blank line between paragraphs is kept');
});

// ---- 13. a plain note’s body comes back byte for byte (what documents promise: the sentences as typed) ----
test('13 a plain note’s body comes back byte for byte, apart from its final newline', async (p, h, t) => {
	await dress(p);
	const src = 'The first sentence, plain.\n\nA second one, with a dash - and an ellipsis...\n\nThe last paragraph.';
	await putNote(p, 'Part Two/Plain bytes.md', `---\n---\n${src}\n`);
	await p.sleep(400);
	await trip(p);
	const got = body(await noteText(p, `${RET}/Part Two/Plain bytes.md`));
	t.eq(got.replace(/\n+$/, ''), src, `the body is the same, byte for byte (raw: ${JSON.stringify(got)})`);
});

// ---- 7b. a plain note gets no property of its own on the trip ----
test('7b a plain note with no properties gets none it was not given (no “Binders path”)', async (p, h, t) => {
	await dress(p);
	await putNote(p, 'Part Two/Plain props.md', 'Just a paragraph.\n');
	await p.sleep(400);
	await trip(p);
	const f = await fm(p, `${RET}/Part Two/Plain props.md`);
	t.ok(!/Binders path/.test(f), `no property the writer never wrote is added (${f})`);
});

// ---- 14. a second trip: the binder that came back goes out and in again, and its words do not change ----
test('14 a binder that came back, taken out and in again, keeps every note’s words and tab lines', async (p, h, t) => {
	await dress(p);
	await trip(p);
	const first = await scenes(p, RET);
	const firstText = {};
	for (const n of first) firstText[n] = body(await noteText(p, `${RET}/${n}.md`));
	await trip(p, { folder: RET, name: 'Returned again' });
	const second = await scenes(p, 'Returned again');
	t.eq(second.filter((n) => !n.startsWith('Research/')).join('|'), first.filter((n) => !n.startsWith('Research/')).join('|'), 'the same notes, in the same order, after the second trip');
	for (const n of first.filter((n) => !n.startsWith('Research/') && second.includes(n))) {
		const after = body(await noteText(p, `Returned again/${n}.md`));
		t.eq(words(unbind(after)).join(' '), words(unbind(firstText[n])).join(' '), `the words of “${n}” are the same`);
	}
	t.ok(/^\tIt did/m.test(await noteText(p, 'Returned again/Part One/Arrival.md')), 'the tab-led paragraph still has its tab');
});

// ---- 15. the trip writes nothing into the original binder ----
test('15 the trip leaves the original binder’s notes and its own project folder as they were', async (p, h, t) => {
	await dress(p);
	const origBefore = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) if (f.path.startsWith(${j(L)})) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
	await trip(p);
	const origAfter = await p.ev(`(async () => { const o = {}; for (const f of app.vault.getMarkdownFiles()) if (f.path.startsWith(${j(L)})) o[f.path] = await app.vault.adapter.read(f.path); return o; })()`);
	for (const [path, text] of Object.entries(origBefore)) t.eq(origAfter[path], text, `“${path}” is unchanged`);
	t.ok(await exists(p, `${RET}/Part One/Arrival.md`), 'and the new binder is there');
});
