// QA round 9: a binder out to a Scrivener project and back in again (Export's Scrivener project, then Import from
// Scrivener, both through their real dialogs). Only the system's folder and file choosers are stood in for, as in
// specs-export-scriv.mjs and specs-import-scrivener.mjs; the export is written to disk and read back, and the import
// is read from that disk folder (or the zip). Each round trip starts from the pristine test vault (withTidy).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { B, PL, j, until, withTidy, texts, read, exists, openView, writeRaw, same } from './view-helpers.mjs';

export const specs = [];
const EXPORT_WIN = '.modal.binders-export', IMPORT_WIN = '.modal.binders-import', FOLDER = 'The Lighthouse', RET = 'Returned';
const L = `${FOLDER}/`;

/** Words as the test compares them: letters and digits, in order. */
const words = (s) => s.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
/** Every file of a folder on disk, by its path inside it, as a hash. */
function hashes(dir) {
	const out = {};
	const walk = (d, rel) => { for (const n of readdirSync(d)) { const full = join(d, n), r = rel ? `${rel}/${n}` : n; if (statSync(full).isDirectory()) walk(full, r); else out[r] = sha(readFileSync(full)); } };
	walk(dir, '');
	return out;
}
const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n?/, '');
/** A link Scrivener’s import wrote as a path to the new binder is read as the link it was: [[The keeper]] (checked in test 4). */
const unlink = (text) => text.replace(/\[\[[^\]|]*\/([^\]|/]*)\|([^\]]*)\]\]/g, '[[$2]]');
/** Words of a note's body, with a footnote's and a comment's marks left out of the count. */
const bodyWords = (text) => words(unlink(body(text)).replace(/\[\^\d+\]:[^\n]*\n?/g, ' ').replace(/%%/g, ' '));

// ---- the export side (copied from specs-export-scriv.mjs) ----
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
/** Stands in for the system's save dialog: the project goes where the test says (default: Exports beside the binder). */
const standIn = (p, o = {}) => p.ev(`(() => {
	const pl = ${PL}; window.__qa9 ??= { real: pl.exportHost.desktop };
	window.__qa9.asked = []; window.__qa9.flat = ${j(!!o.flat)};
	pl.exportHost.desktop = (app) => { const d = window.__qa9.real(app); return d && { ...d, ...(window.__qa9.flat ? { writeFolder: undefined, folderStamp: undefined } : {}), pick: async (start) => { window.__qa9.asked.push(start); return start; } }; };
	return 1;
})()`);
/** Stands in for the import's folder chooser: the desktop reader is real, only the chooser answers. */
const importFrom = (p, dir) => p.ev(`(() => { const pl = ${PL}; window.__qa9Imp ??= pl.importHost.desktop; pl.importHost.desktop = (app) => { const d = window.__qa9Imp(app); if (!d) throw new Error('desktop reader missing'); return {...d, pick: async () => ${j(dir)}}; }; return 1; })()`);

// ---- the import side (copied from specs-import-scrivener.mjs) ----
const IWIN = IMPORT_WIN;
const ipress = async (p, label) => {
	const ok = await p.ev(`(() => { const b = [...document.querySelectorAll('${IWIN} button')].filter(b => b.textContent === ${j(label)} && b.getBoundingClientRect().width).pop(); if (!b || b.disabled) return false; b.click(); return true; })()`);
	if (!ok) throw new Error(`no enabled import button “${label}”`);
	await p.sleep(100);
};
const itext = (p, sel) => p.ev(`document.querySelector('${IWIN} ${sel}')?.textContent ?? ''`);
const things = (p) => p.ev(`[...document.querySelectorAll('${IWIN} .binders-export-warn')].map(w => w.querySelector('.binders-export-warn-note').textContent + ': ' + w.querySelector('.binders-export-warn-text').textContent)`);
const tree = (p) => p.ev(`[...document.querySelectorAll('${IWIN} [role="treeitem"]')].map(r => '  '.repeat(Number(r.getAttribute('aria-level')) - 1) + r.querySelector('.tree-item-inner').textContent + (r.hasAttribute('aria-expanded') ? '/' : '') + (r.querySelector('.tree-item-flair') ? ' [' + r.querySelector('.tree-item-flair').textContent + ']' : ''))`);
/** Opens the import dialog on a folder on disk (a .scriv project folder or a zip), names the new binder, and waits for its plan. */
async function begin(p, { dir = null, zip = null, name = RET } = {}) {
	await p.ev(`(() => { app.commands.executeCommandById('binders:import-scrivener'); return 1; })()`);
	await until(p, `!!document.querySelector('${IWIN}')`);
	if (dir) { await importFrom(p, dir); await ipress(p, 'Choose a project...'); }
	else {
		await p.send('Page.setInterceptFileChooserDialog', { enabled: true });
		await ipress(p, 'Choose a zipped backup...');
		const doc = await p.send('DOM.getDocument');
		const found = await p.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: IWIN + ' input[type="file"]' });
		await p.send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files: [zip] });
		await p.send('Page.setInterceptFileChooserDialog', { enabled: false });
	}
	const ready = await until(p, `!!document.querySelector('${IWIN} [data-binders-key="name"]')`, 15_000);
	if (!ready) throw new Error('import did not load: ' + await itext(p, '.binders-import-said'));
	await until(p, `document.querySelectorAll('${IWIN}').length === 1`, 3000);
	await p.ev(`(() => { const i = document.querySelector('${IWIN} [data-binders-key="name"]'); i.value = ${j(name)}; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); return 1; })()`);
	await p.sleep(800);
}
async function imported(p, root = RET) {
	await ipress(p, 'Import');
	const ready = await until(p, `!!${B}.binderOf(${j(root)}) && !document.querySelector('${IWIN}')`, 20_000);
	if (!ready) throw new Error('import did not finish: ' + await itext(p, '.binders-import-why'));
	await p.sleep(300);
}
const closeAll = async (p) => { for (let i = 0; i < 4 && (await p.ev(`!!document.querySelector('.modal-container')`)); i++) { await p.key('Escape'); await p.sleep(150); } };
/** The notes of a binder, in its order: the path inside the binder, without the root or “.md”. */
const scenes = (p, root) => p.ev(`${B}.scenes(app.vault.getAbstractFileByPath(${j(root)})).map(f => f.path.slice(${root.length + 1}, -3))`);

/** One round trip: the binder out as a Scrivener project folder, then that folder in as a new binder. */
async function roundTrip(p, { folder = FOLDER, zip = false } = {}) {
	const dir = join(p.vaultDir, 'Exports'), at = join(dir, `${folder}.scriv`);
	await standIn(p, { flat: zip });
	await openExport(p, folder);
	await press(p, 'Export');
	await saved(p);
	await p.ev(`(() => { const pl = ${PL}; if (window.__qa9) pl.exportHost.desktop = window.__qa9.real; return 1; })()`);
	await closeAll(p);
	const from = zip ? join(dir, `${folder}.scriv.zip`) : at;
	await begin(p, zip ? { zip: from } : { dir: from });
	await imported(p);
	return { at, from };
}
const test = (name, fn) => specs.push({ name: name.startsWith('BUG: ') ? name : 'qa9 roundtrip: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(async () => { app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportOutside = true; pl.settings.exportSnapshots = true; await pl.saveData(pl.settings); })().then(() => 1)`);
	try { await fn(p, h, t); } finally {
		await closeAll(p);
		await p.ev(`(async () => { const pl = ${PL}; if (window.__qa9) pl.exportHost.desktop = window.__qa9.real; if (window.__qa9Imp) pl.importHost.desktop = window.__qa9Imp; document.querySelectorAll('.notice').forEach(n => n.remove()); app.saveLocalStorage('binders-export', null); pl.settings.exportKind = 'manuscript'; pl.settings.exportOutside = true; pl.settings.exportSnapshots = true; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
}) });

/** The Lighthouse fixture, dressed the way the export spec dresses it: a label, status, target, notes, a footnote,
    a comment, a tab-led paragraph, a link, a folder note, a note left out of compile, a note outside, a snapshot. */
async function dress(p) {
	await writeRaw(p, `${L}Part One/Arrival.md`, '---\nstatus: revised\nlabel: Blue\ntarget: 1200\nnotes: Ask Tom about the tide.\nsynopsis: Mara arrives on the island with the supply boat.\ntags:\n  - storm\n---\nThe supply boat left Mara on the jetty.[^1] %%Check the tide.%%\n\n\tIt did **not** wait, see [[The keeper]].\n\n[^1]: With two cases.\n');
	await writeRaw(p, `${L}Part Two/The wreck.md`, '---\nexport: false\n---\nA scene that was cut.\n');
	await writeRaw(p, `${L}Part One/Part One.md`, '---\nsynopsis: The first days.\n---\nNotes for part one.\n');
	await p.ev(`(async () => { await app.vault.create(${j(`${L}Notes on lighthouses.md`)}, '---\\nexport: false\\n---\\nFresnel lenses.\\n'); await app.vault.adapter.mkdir(${j(`${L}Snapshots/Part One/Arrival`)}); await app.vault.adapter.write(${j(`${L}Snapshots/Part One/Arrival/2026-09-01 10.00.00 Before the rewrite.snapshot`)}, '---\\nsnapshot-of: "Part One/Arrival"\\ntaken: 2026-09-01T10:00:00\\n---\\nAn earlier arrival.\\n'); })().then(() => 1)`);
	await until(p, `app.metadataCache.getCache(${j(`${L}Notes on lighthouses.md`)})?.frontmatter?.export === false && app.metadataCache.getCache(${j(`${L}Part One/Arrival.md`)})?.frontmatter?.label === 'Blue'`, 8000);
	await p.sleep(600);
}

// ---- 1. plain text, order and folders ----
test('1 a binder comes back: every note’s words, in the same order, in the same folders', async (p, h, t) => {
	await dress(p);
	const before = await texts(p);
	const orig = await scenes(p, FOLDER);
	const outside = ['Notes on lighthouses'];
	const draft = orig.filter((n) => !outside.includes(n));
	await roundTrip(p);
	const got = await scenes(p, RET);
	const gotDraft = got.filter((n) => !n.startsWith('Research/'));
	// documented: a folder’s own text becomes a note “<folder> text” first in its folder (docs/import-scrivener.md)
	const extra = gotDraft.filter((n) => !draft.includes(n));
	t.ok(extra.every((n) => /\/[^/]+ text$/.test(n)), `the only extra notes in the draft are folder texts (${extra.join(' | ')})`);
	t.eq(gotDraft.filter((n) => draft.includes(n)).join('|'), draft.join('|'), 'the draft’s notes are in the same order, in the same folders');
	for (const n of draft) {
		const after = await read(p, `${RET}/${n}.md`).catch(() => null);
		const a = bodyWords(before[`${FOLDER}/${n}.md`] ?? '').join(' '), b = after == null ? '(missing)' : bodyWords(after).join(' ');
		t.eq(b, a, `words of “${n}” (raw after: ${JSON.stringify(after ?? '').slice(0, 400)})`);
	}
	t.eq(bodyWords(await read(p, `${RET}/Part One/Part One text.md`).catch(() => '(missing)')).join(' '), bodyWords(before[`${FOLDER}/Part One/Part One.md`]).join(' '), 'the folder’s own text (“Notes for part one.”) is its first note');
	for (const n of outside) t.eq(bodyWords(await read(p, `${RET}/Research/${n}.md`).catch(() => '(missing)')).join(' '), bodyWords(before[`${FOLDER}/${n}.md`]).join(' '), `“${n}” is in Research, with its words`);
	t.ok(orig.length >= 8, `the binder has its notes (${orig.length})`);
	same(t, before, await texts(p), { skip: [] });
});

test('1b a paragraph begun with a tab keeps its tab', async (p, h, t) => {
	await dress(p);
	await roundTrip(p);
	const got = await read(p, `${RET}/Part One/Arrival.md`);
	t.ok(/^\tIt did/m.test(got), `the paragraph “It did not wait” is still begun with a tab (raw: ${JSON.stringify(got.slice(-120))})`);
});

// (not a bug: Binders shows a note's status in the settings' spelling, whatever case the note has, and export writes the
// list's spelling, so Scrivener has one status, not two. The same status comes back, in the vault's spelling)
test('2c a status comes back as the same status, in the vault’s spelling', async (p, h, t) => {
	await dress(p);
	await roundTrip(p);
	const fmText = await p.ev(`(() => { const c = app.metadataCache.getCache(${j(`${RET}/Part One/Arrival.md`)}); return c?.frontmatter ? JSON.stringify(c.frontmatter) : 'none'; })()`);
	t.ok(/"status":"revised"/i.test(fmText), `written as “revised” in the binder, it comes back as the same status, ${fmText.match(/"status":"[^"]*"/i)?.[0]}`);
});

// ---- 2. labels, colours, statuses, synopses, targets ----
test('2 labels and their colors, statuses, synopses and targets come back; no colour-clash warning; no second set of labels', async (p, h, t) => {
	await dress(p);
	await p.ev(`(async () => { const pl = ${PL}; if (!pl.settings.labels.some(l => l.name === 'Blue')) { pl.settings.labels.push({ name: 'Blue', color: 'blue' }); await pl.saveData(pl.settings); } return 1; })().then(() => 1)`);
	const labelsBefore = await p.ev(`JSON.stringify(${PL}.settings.labels)`);
	const statusesBefore = await p.ev(`JSON.stringify(${PL}.settings.statuses)`);
	await roundTrip(p);
	// The round trip is already done by roundTrip; the import dialog is closed. Check its plan through a fresh open.
	t.eq(await p.ev(`JSON.stringify(${PL}.settings.labels)`), labelsBefore, 'the vault’s labels are the same list (no second set, no renamed copy)');
	t.eq(await p.ev(`JSON.stringify(${PL}.settings.statuses)`), statusesBefore, 'the vault’s statuses are the same list');
	const arrival = `${RET}/Part One/Arrival.md`;
	const fm = (f) => p.ev(`(() => { const c = app.metadataCache.getCache(${j(f)}); return c?.frontmatter ? JSON.stringify(c.frontmatter) : 'none'; })()`);
	const fmText = await fm(arrival);
	t.ok(fmText.includes('"label":"Blue"'), `the label comes back as Blue (${fmText})`);
	t.ok(fmText.toLowerCase().includes('"status":"revised"'), `the status comes back as the same status (${fmText.match(/"status":"[^"]*"/)?.[0]})`);
	t.ok(fmText.includes('"target":1200'), 'the word-count target comes back as 1200');
	t.ok(fmText.includes('Mara arrives on the island'), 'the synopsis comes back');
	t.ok(fmText.includes('Ask Tom'), 'the notes come back (as the scene’s notes)');
});
test('2b the import screen shows no colour-clash warning for the project it made from Binders', async (p, h, t) => {
	await dress(p);
	await p.ev(`(async () => { const pl = ${PL}; if (!pl.settings.labels.some(l => l.name === 'Blue')) { pl.settings.labels.push({ name: 'Blue', color: 'blue' }); await pl.saveData(pl.settings); } return 1; })().then(() => 1)`);
	const dir = join(p.vaultDir, 'Exports'), at = join(dir, `${FOLDER}.scriv`);
	await standIn(p, {});
	await openExport(p);
	await press(p, 'Export');
	await saved(p);
	await p.ev(`(() => { const pl = ${PL}; if (window.__qa9) pl.exportHost.desktop = window.__qa9.real; return 1; })()`);
	await closeAll(p);
	await begin(p, { dir: at });
	const warn = await things(p);
	t.eq(warn.filter((w) => /colou?r|label/i.test(w)).join(' || '), '', 'no colour-clash warning on the import screen');
	// (the one warning a folder with text of its own gets is documented: docs/import-scrivener.md, the folder row)
	t.eq(warn.filter((w) => !/has text of its own/.test(w)).join(' || '), '', 'no other warning on the import screen');
	await closeAll(p);
});

// ---- 3. folders nested three deep; an empty folder; a folder with its own synopsis ----
test('3 folders nested three deep, an empty folder and a folder with its own synopsis come back', async (p, h, t) => {
	await dress(p);
	await p.ev(`app.vault.adapter.mkdir(${j(`${L}Part One/Deep/Deeper`)}).then(() => 1)`);
	await writeRaw(p, `${L}Part One/Deep/Deep.md`, '---\nsynopsis: Three down.\n---\n');
	await writeRaw(p, `${L}Part One/Deep/Deeper/Deepest scene.md`, '---\nsynopsis: At the bottom.\n---\nThe deepest words.\n');
	await p.ev(`app.vault.adapter.mkdir(${j(`${L}Part One/Deep/Deeper/Empty folder`)}).then(() => 1)`);
	await p.sleep(400);
	await roundTrip(p);
	const got = await scenes(p, RET);
	t.ok(got.includes('Part One/Deep/Deeper/Deepest scene'), `the three-deep note is three folders down (${got.join(' | ')})`);
	t.ok(await exists(p, `${RET}/Part One/Deep/Deeper/Deepest scene.md`), 'its file is in the three folders');
	t.eq(await p.ev(`app.metadataCache.getCache(${j(`${RET}/Part One/Deep/Deeper/Deepest scene.md`)})?.frontmatter?.synopsis ?? ''`), 'At the bottom.', 'its synopsis comes back');
	t.eq(await p.ev(`app.metadataCache.getCache(${j(`${RET}/Part One/Part One.md`)})?.frontmatter?.synopsis ?? ''`), 'The first days.', 'a folder with its own synopsis: the folder note’s synopsis comes back');
	t.ok(await exists(p, `${RET}/Part One/Deep/Deeper/Empty folder`), 'the empty folder comes back as a folder');
});

// ---- 4. Markdown: what comes back, and what is different (one test per kind, so each shows its own failure) ----
const MD_BASE = '# Heading one\n\n## Heading two\n\n**Bold**, *italic* and ***both***.\n\n- one\n- two\n\n1. first\n2. second\n\nA [link](https://example.com) and a [[The keeper]] wiki link.\n\nA note.[^2]\n\n> A quoted line.\n\n```\nconst x = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![[pic.png]]\n\n[^2]: The footnote.\n';
/** A note with one kind of Markdown in it, round-tripped; `checks` say what must come back. */
const mdCase = (name, source, checks, { picture = false } = {}) => test(name, async (p, h, t) => {
	await dress(p);
	if (picture) {
		const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
		await p.ev(`app.vault.adapter.writeBinary(${j(`${L}pic.png`)}, Uint8Array.from(atob(${j(b64)}), c => c.charCodeAt(0)).buffer).then(() => 1)`);
		await p.sleep(400);
	}
	await writeRaw(p, `${L}Part Two/Markdown.md`, source);
	await p.sleep(500);
	await roundTrip(p);
	const got = body(await read(p, `${RET}/Part Two/Markdown.md`).catch(() => '(missing)'));
	t.ok(got !== '(missing)', 'the note is there');
	for (const [what, re] of Object.entries(checks)) t.ok(re.test(got), `${what} comes back (raw: ${JSON.stringify(got.slice(0, 300))})`);
});
mdCase('BUG: qa9 roundtrip: 4a markdown: headings come back as headings', '# Heading one\n\n## Heading two\n', { 'heading one': /^# Heading one/m, 'heading two': /^## Heading two/m });
mdCase('4b markdown: bold, italics, bullets, numbered lists, links, wiki links and footnotes come back', MD_BASE, {
	'bold': /\*\*Bold\*\*/, 'italic': /\*italic\*|_italic_/, 'bullets': /^- one/m, 'numbered list': /^1\. first/m,
	'link': /\[link\]\(https:\/\/example\.com\)/, 'wiki link to the note': /\[\[(Returned\/Part One\/)?The keeper(\|The keeper)?\]\]/, 'footnote reference': /\[\^\d+\]/, 'footnote text': /The footnote\./,
});
mdCase('4c markdown: a block quote’s words come back (its marker is an indent in Scrivener, docs/import-scrivener.md)', '> A quoted line.\n', { 'block quote words': /A quoted line\./ });
mdCase('4d markdown: a code block’s words come back (its font is not kept, docs/import-scrivener.md)', '```\nconst x = 1;\n```\n', { 'code words': /const x = 1;/ });
mdCase('4e markdown: a table comes back as a table (rows together)', '| a | b |\n|---|---|\n| 1 | 2 |\n', { 'table rows with no blank line between': /\| a \| b \|\n\|---\|---\|\n\| 1 \| 2 \|/ });
mdCase('4f markdown: a picture comes back as the picture it was', '![[pic.png]]\n', { 'picture embed (renamed to Picture 1.png in Research/Attachments, as the docs say)': /!\[\[(Returned\/Research\/Attachments\/)?[Pp]ic(ture 1)?\.png\]\]/ }, { picture: true });

// ---- 5. non-Latin text and odd note names ----
test('5 non-Latin text (Cyrillic, Greek, Chinese, Arabic) and note names with ? : quotes and an emoji come back', async (p, h, t) => {
	await dress(p);
	const names = { 'Кириллица': 'Привет, мир.', 'Ελληνικά': 'Καλημέρα κόσμε.', '中文': '你好，世界。', 'عربي': 'مرحبا بالعالم.', 'Who Why Quoted 🌊': 'Odd name here.' };
	for (const [n, s] of Object.entries(names)) await writeRaw(p, `${L}Part Two/${n}.md`, `---\n---\n${s}\n`);
	await p.sleep(600);
	await roundTrip(p);
	for (const [n, s] of Object.entries(names)) {
		const got = await read(p, `${RET}/Part Two/${n}.md`).catch(() => '(missing)');
		t.ok(got !== '(missing)', `“${n}” is there under its name (in Part Two: ${(await p.ev(`app.vault.adapter.list(${j(`${RET}/Part Two`)}).then(x => x.files.map(f => f.split('/').pop()).join(' | '))`))})`);
		t.ok(words(body(got)).join(' ') === words(s).join(' '), `“${n}”: its text is the same (${JSON.stringify(body(got).slice(0, 80))})`);
	}
});

// ---- 6. export: false, and notes outside the manuscript ----
test('6 notes left out of compile stay left out; notes outside the manuscript arrive in Research and back', async (p, h, t) => {
	await dress(p);
	await roundTrip(p);
	t.eq(await p.ev(`app.metadataCache.getCache(${j(`${RET}/Part Two/The wreck.md`)})?.frontmatter?.export ?? 'missing'`), false, 'a note with export: false is still export: false');
	t.ok(await exists(p, `${RET}/Part Two/The wreck.md`), 'and it is in its folder');
	const outside = await scenes(p, RET);
	t.ok(await exists(p, `${RET}/Research/Notes on lighthouses.md`), 'the outside note is in Research');
});

// ---- 7. snapshots of a note ----
test('7 a note’s snapshot comes back with its text and its name', async (p, h, t) => {
	await dress(p);
	await roundTrip(p);
	const list = await p.ev(`app.vault.adapter.list(${j(`${RET}/Snapshots/Part One/Arrival`)}).then(x => x.files).catch(() => [])`);
	t.eq(list.length, 1, `the note’s snapshot is there (${list.length})`);
	if (list[0]) t.ok((await read(p, list[0])).includes('An earlier arrival'), 'with the text it had');
	if (list[0]) t.ok(/Before the rewrite/.test(list[0]), `with its name (${list[0]})`);
});

// ---- 8. the zipped project ----
test('8 the zipped project (the phone’s fallback) comes back the same way', async (p, h, t) => {
	await dress(p);
	const before = await texts(p);
	const orig = await scenes(p, FOLDER);
	const zipPath = join(p.vaultDir, 'Exports', `${FOLDER}.scriv.zip`);
	await roundTrip(p, { zip: true });
	t.ok(existsSync(zipPath), 'the zip is in the Exports folder');
	const got = (await scenes(p, RET)).filter((n) => !n.startsWith('Research/') && !/ text$/.test(n));
	t.eq(got.join('|'), orig.filter((n) => n !== 'Notes on lighthouses').join('|'), 'the zipped project’s notes are in the same order and folders');
	t.ok(await exists(p, `${RET}/Part Two/The wreck.md`), 'the zipped project’s left-out note is there');
	same(t, before, await texts(p));
});

// ---- 9. the original and the exported project are unchanged by the import ----
test('9 the original binder and the exported project are unchanged, byte for byte, by the import', async (p, h, t) => {
	await dress(p);
	const origBefore = await texts(p);
	const dir = join(p.vaultDir, 'Exports'), at = join(dir, `${FOLDER}.scriv`);
	await standIn(p, {});
	await openExport(p);
	await press(p, 'Export');
	await saved(p);
	await p.ev(`(() => { const pl = ${PL}; if (window.__qa9) pl.exportHost.desktop = window.__qa9.real; return 1; })()`);
	await closeAll(p);
	const projBefore = hashes(at);
	await begin(p, { dir: at });
	await imported(p);
	const projAfter = hashes(at);
	t.eq(JSON.stringify(projAfter), JSON.stringify(projBefore), 'the exported project’s files are the same, byte for byte');
	const origAfter = await texts(p);
	for (const [path, text] of Object.entries(origBefore)) t.eq(origAfter[path], text, `“${path}” is unchanged`);
});

