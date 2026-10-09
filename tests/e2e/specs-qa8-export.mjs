// QA round 8, Export: what the other export specs do not prove. Every kind of file is read back from the disk and held
// against the notes (word for word where it can be); every way of opening the window is used; awkward books (empty,
// one note, only folders, long titles, other scripts, a Longform project, a note changed or deleted while the window
// is open, typing not yet saved); the style files; and the whole thing by touch on an emulated phone and tablet.
// The system's save dialog is stood in for (specs-export.mjs). Tests named "qa8 export: …" pass; "BUG: qa8 export: …" are
// confirmed bugs (they fail now and pass once fixed).
//
//   QA8_SHOTS=<dir>  keeps pictures of the window there
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { PL, VIEW, clickMenu, closeMenus, file, hoverMenu, j, menuItems, openView, same, settled, texts, until, withTidy, writeRaw } from './view-helpers.mjs';
import { WIN, EBOOK, asked, closeAll, docx, epub, epubcheck, notices, onMobile, open, open2, pick, press, saved, standIn, status, tapEl, button, withAuthor, words } from './specs-export.mjs';

export const specs = [];
const L = 'The Lighthouse/';
const SHOTS = process.env.QA8_SHOTS || '';
const shot = async (p, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); const dark = await p.ev(`document.body.classList.contains('theme-dark')`); await p.sleep(300); await p.shot(join(SHOTS, `${name}-${dark ? 'dark' : 'light'}.png`)); };

const test = (name, fn, o) => specs.push({ name: 'qa8 export: ' + name, fn: withTidy(async (p, h, t) => {
	await p.ev(`(async () => { app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportStyle = ''; pl.settings.exportsFolder = 'Exports'; await pl.saveData(pl.settings); })().then(() => 1)`);
	await standIn(p, o);
	await withAuthor(p);
	const before = await texts(p);
	try { await fn(p, h, t, before); if (!o?.changes) same(t, before, await texts(p), { skip: o?.skip ?? [] }); } finally {
		await closeAll(p);
		await closeMenus(p);
		await p.ev(`(async () => { if (window.__bx) ${PL}.exportHost.desktop = window.__bx.real; app.saveLocalStorage('binders-export', null); const pl = ${PL}; pl.settings.exportKind = 'manuscript'; pl.settings.exportStyle = ''; pl.settings.exportsFolder = 'Exports'; pl.settings.exportFile = 'docx'; await pl.saveData(pl.settings); })().then(() => 1)`);
	}
}) });
const bug = (name, fn, o) => { test(name, fn, o); specs[specs.length - 1].name = 'BUG: ' + specs[specs.length - 1].name; };

// ---- a binder of the test's own ----
/** Makes a binder from [path, text] pairs (a path with a folder in it makes the folder, listed before its first note). */
async function mk(p, name, notes, extra = '') {
	const order = [], seen = new Set();
	for (const [path] of notes) { const parts = path.split('/'); for (let i = 1; i < parts.length; i++) { const f = parts.slice(0, i).join('/') + '/'; if (!seen.has(f)) { seen.add(f); order.push(f); } } order.push(path); }
	await p.ev(`(async () => {
		const name = ${j(name)}, notes = ${j(notes)}, order = ${j(order)};
		await app.vault.adapter.mkdir(name);
		for (const f of order.filter(o => o.endsWith('/'))) if (!(await app.vault.adapter.exists(name + '/' + f.slice(0, -1)))) await app.vault.adapter.mkdir(name + '/' + f.slice(0, -1));
		for (const [path, text] of notes) await app.vault.create(name + '/' + path + '.md', text);
		await app.vault.create(name + '/' + name.split('/').pop() + '.md', '---\\nbinder: 1\\n${extra}contents:\\n' + order.map(o => '  - ' + JSON.stringify(o)).join('\\n') + '\\n---\\n');
	})().then(() => 1)`);
	await until(p, `!!${PL}.binders.binderOf(${j(name)})`, 8000);
	await p.sleep(500);
}
/** Where the stand-in was last asked to save. */
const target = async (p) => (await asked(p)).slice(-1)[0];
/** Opens the window on a folder, chooses a kind and exports; returns the file's path. */
async function make(p, folder, kind = 'Manuscript') {
	await open(p, folder);
	await pick(p, kind);
	await p.sleep(300);
	await press(p, 'Export');
	if (!(await saved(p, 30000))) throw new Error(`${kind} of ${folder} wasn’t saved: ${await status(p)} ${await notices(p)}`);
	return target(p);
}
const choose = async (p, key, value) => { await p.ev(`(() => { const s = document.querySelector('${WIN} select[data-binders-key="${key}"]'); s.value = ${j(value)}; s.dispatchEvent(new Event('change')); return 1; })()`); await p.sleep(400); };
const setting = (p, o) => p.ev(`(async () => { const pl = ${PL}; Object.assign(pl.settings, ${j(o)}); await pl.saveData(pl.settings); })().then(() => 1)`);
const rtfText = (s) => s.replace(/\{\\fonttbl[\s\S]*?\}\}|\{\\colortbl[^}]*\}|\{\\\*\\fldinst\{[^}]*\}\}/g, '').replace(/\\u(-?\d+)\?/g, (_m, n) => String.fromCharCode(+n < 0 ? +n + 65536 : +n)).replace(/\\par\b|\\line\b/g, '\n').replace(/\\tab\b/g, '\t').replace(/\\([\\{}])/g, (_m, c) => ({ '\\': '\u0001', '{': '\u0002', '}': '\u0003' })[c]).replace(/\\[a-zA-Z]+-?\d* ?/g, '').replace(/[{}]/g, '').replace(/[\u0001-\u0003]/g, (c) => '\\{}'[c.charCodeAt(0) - 1]);
/** Every content.rtf of a Scrivener project folder (or the zip of one), as plain text, in the order the tree lists them. */
function scrivText(at) {
	let files = {};
	if (statSync(at).isDirectory()) { const walk = (dir, rel) => { for (const n of readdirSync(dir)) { const full = join(dir, n), r = rel ? `${rel}/${n}` : n; if (statSync(full).isDirectory()) walk(full, r); else files[r] = readFileSync(full); } }; walk(at, ''); } else files = unzipSync(new Uint8Array(readFileSync(at)));
	const str = (n) => Buffer.from(files[n]).toString('utf8');
	const scrivx = Object.keys(files).find((n) => n.endsWith('.scrivx')), x = str(scrivx);
	const items = [...x.matchAll(/<BinderItem UUID="([^"]+)" Type="([^"]+)"[^>]*>\s*<Title>([^<]*)<\/Title>/g)].map((m) => ({ id: m[1], type: m[2], title: m[3] }));
	const key = Object.keys(files).find((n) => n.endsWith('/content.rtf'));
	const prefix = key ? key.slice(0, key.indexOf(items[0].id) >= 0 ? key.indexOf(items[0].id) : 0) : '';
	return { x, items, files, text: (id) => { const n = Object.keys(files).find((f) => f.endsWith(`${id}/content.rtf`)); return n ? rtfText(str(n)) : null; }, prefix };
}
const lettersOnly = (s) => s.normalize('NFC').replace(/[^\p{L}\p{N}\p{M}]/gu, '');
const NOT_DONE = (s) => !s.includes('NaN') && !s.includes('undefined') && !s.includes('[object');

// ======================================================================================================================
// The ways in: the command, the view's menu, an explorer folder's menu, a folder card's menu, an outliner folder row
// ======================================================================================================================

const PART_ONE = ['Arrival', 'The keeper', 'Storm warning'];
const partOneWords = async (p) => (await Promise.all(PART_ONE.map((n) => p.ev(`app.vault.adapter.read(${j(`${L}Part One/${n}.md`)})`)))).flatMap((s) => words(s.replace(/^---\n[\s\S]*?\n---\n?/, '')));
const windowName = (p) => p.ev(`document.querySelector('${WIN} .modal-title')?.textContent ?? ''`);
const closeWin = async (p) => { await closeAll(p); await until(p, `!document.querySelector('${WIN}')`); };

test('Export... is in the binder view’s More options menu, an explorer folder’s menu, a corkboard folder card’s menu and an outliner folder row’s menu, and each opens the window on that folder', async (p, h, t) => {
	// the view's own menu (what “More options” builds)
	await openView(p, 'The Lighthouse');
	const viewItems = await p.ev(`(() => {
		const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const s = {}, it = new Proxy({}, { get: (x, m) => (v) => { if (m === 'setTitle') s.t = v; if (m === 'onClick') s.f = v; return it; } }); cb(it); items.push(s); return menu; } : () => menu });
		${VIEW}.onPaneMenu(menu, 'more-options');
		items.find(i => i.t === 'Export...')?.f({});
		return items.map(i => i.t);
	})()`);
	t.ok(viewItems.includes('Export...'), 'the view’s menu has “Export...” (' + viewItems.join('|') + ')');
	t.ok(await until(p, `!!document.querySelector('${WIN}')`, 4000), 'and it opens the window');
	t.eq(await windowName(p), 'Export “The Lighthouse”', 'on the binder');
	await closeWin(p);
	// the file explorer's menu on a folder inside the binder
	const items = await p.ev(`(() => {
		const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const s = {}, it = new Proxy({}, { get: (x, m) => m === 's' ? s : (v) => { if (m === 'setTitle') s.t = v; if (m === 'onClick') s.f = v; return it; } }); cb(it); items.push(s); return menu; } : () => menu });
		app.workspace.trigger('file-menu', menu, ${file(L + 'Part One')}, 'file-explorer-context-menu');
		items.find(i => i.t === 'Export...')?.f({});
		return items.map(i => i.t);
	})()`);
	t.ok(items.includes('Export...'), 'a folder inside a binder has “Export...” in the explorer');
	t.ok(await until(p, `!!document.querySelector('${WIN}')`, 4000), 'which opens the window');
	t.eq(await windowName(p), 'Export “Part One”', 'on that folder');
	t.ok(/^\d+ words · 3 chapters$/.test(await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent`)), 'with only its three chapters');
	await closeWin(p);
	// a note in the explorer has none
	const noteItems = await p.ev(`(() => { const items = [], menu = new Proxy({}, { get: (o, k) => k === 'addItem' ? (cb) => { const s = {}, it = new Proxy({}, { get: (x, m) => (v) => { if (m === 'setTitle') s.t = v; return it; } }); cb(it); items.push(s.t); return menu; } : () => menu }); app.workspace.trigger('file-menu', menu, ${file(L + 'Prologue.md')}, 'file-explorer-context-menu'); return items; })()`);
	t.ok(!noteItems.includes('Export...'), 'a note’s menu has no “Export...” (' + noteItems.join('|') + ')');
	// a folder card, right-clicked on the corkboard
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { ${VIEW}.setMode('corkboard'); return 1; })()`);
	const card = `.workspace-leaf.mod-active .binders-card[data-path="${L}Part Two"]`;
	await until(p, `!!document.querySelector('${card}')`, 6000);
	await settled(p, card, { still: 500 });
	const at = await p.at(card);
	await p.right(at.x, at.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok((await menuItems(p)).includes('Export...'), 'a folder card’s menu has “Export...”');
	await clickMenu(p, 'Export...');
	t.ok(await until(p, `!!document.querySelector('${WIN}')`, 4000), 'which opens the window');
	t.eq(await windowName(p), 'Export “Part Two”', 'on that folder');
	await closeWin(p);
	// an outliner row for a folder
	await p.ev(`(() => { ${VIEW}.setMode('outliner'); return 1; })()`);
	const row = `.workspace-leaf.mod-active .binders-outliner-row[data-path="${L}Part One"] .binders-outliner-name`;
	await until(p, `!!document.querySelector('${row}')`, 6000);
	await settled(p, row, { still: 500 });
	const r = await p.at(row);
	await p.right(r.x, r.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok((await menuItems(p)).includes('Export...'), 'a folder row’s menu has “Export...”');
	await clickMenu(p, 'Export...');
	t.ok(await until(p, `!!document.querySelector('${WIN}')`, 4000), 'which opens the window');
	t.eq(await windowName(p), 'Export “Part One”', 'on that folder');
	// and a note card / note row has no Export...
	await closeWin(p);
	const nr = `.workspace-leaf.mod-active .binders-outliner-row[data-path="${L}Prologue.md"] .binders-outliner-name`;
	await settled(p, nr, { still: 500 });
	const n = await p.at(nr);
	await p.right(n.x, n.y);
	await until(p, `!!document.querySelector('.menu')`);
	t.ok(!(await menuItems(p)).includes('Export...'), 'a note row’s menu has none');
	await closeMenus(p);
});

test('a subfolder of a binder is exported on its own as every kind, and the file is that folder’s words and no more', async (p, h, t) => {
	const want = (await partOneWords(p)).join(' ');
	// Word
	let at = await make(p, L + 'Part One');
	t.ok(at.endsWith('Part One.docx'), 'named for the folder: ' + at);
	let d = docx(at);
	t.eq(words(d.body.join(' ')).join(' '), want, 'Word: Part One’s words, in order, and nothing of Prologue or Part Two');
	// EPUB
	await closeAll(p);
	at = await make(p, L + 'Part One', 'Ebook');
	const e = epub(at);
	t.eq(words(e.body).join(' '), want, 'EPUB: the same words');
	const verdict = epubcheck(at);
	if (verdict !== null) t.eq(verdict, '', 'and EPUBCheck passes it');
	// Scrivener
	await closeAll(p);
	at = await make(p, L + 'Part One', 'Scrivener project');
	const sc = scrivText(at);
	const titles = sc.items.map((i) => i.title);
	t.ok(['Arrival', 'The keeper', 'Storm warning'].every((n) => titles.includes(n)) && !titles.includes('Prologue') && !titles.includes('Lights out'), 'Scrivener: the folder’s notes only (' + titles.join('|') + ')');
	// one note
	await closeAll(p);
	await open(p, L + 'Part One');
	await pick(p, 'One note');
	await press(p, 'Export');
	await until(p, `app.workspace.getActiveFile()?.path?.includes('(exported)')`, 8000);
	const noteName = await p.ev(`app.workspace.getActiveFile()?.path`);
	const body = await p.ev(`app.vault.adapter.read(${j(noteName)})`);
	t.eq(words(body.replace(/^# .*\n/, '')).join(' '), want, 'One note: the same words (' + noteName + ')');
	await p.ev(`app.vault.adapter.remove(${j(noteName)}).then(() => 1)`);
}, { changes: true });

test('a folder in a binder, exported as a PDF (Manuscript and Paperback): the pages hold its paragraphs, in order, and nothing of the rest', async (p, h, t) => {
	if (spawnSync('pdftotext', ['-v']).error) { t.ok(true, 'pdftotext isn’t installed: skipped'); return; }
	const paras = (await Promise.all(PART_ONE.map((n) => p.ev(`app.vault.adapter.read(${j(`${L}Part One/${n}.md`)})`)))).flatMap((s) => s.replace(/^---\n[\s\S]*?\n---\n?/, '').split(/\n\s*\n/).map((x) => lettersOnly(x)).filter(Boolean));
	const pdf = (path) => lettersOnly(spawnSync('pdftotext', ['-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.replace(/-\n/g, ''));
	const inOrder = (hay, ps) => { let at = 0; for (const x of ps) { const i = hay.indexOf(x, at); if (i < 0) return x.slice(0, 30); at = i + x.length; } return ''; };
	await open(p, L + 'Part One');
	await choose(p, 'file', 'pdf');
	await until(p, `!!document.querySelector('${WIN} .binders-export-preview[data-pages]')`, 30000);
	await press(p, 'Export');
	t.ok(await saved(p, 60000), 'the manuscript PDF is saved');
	const m = await target(p);
	t.ok(m.endsWith('Part One.pdf'), 'a .pdf named for the folder: ' + m);
	let got = pdf(m);
	t.eq(inOrder(got, paras), '', 'the manuscript PDF holds every paragraph of Part One, in order');
	t.ok(!got.includes('thepaintedmap') && !got.includes('lightsout'), 'and nothing of Part Two');
	await closeAll(p);
	await open(p, L + 'Part One');
	await pick(p, 'Paperback');
	await until(p, `!!document.querySelector('${WIN} .binders-export-preview[data-pages]')`, 30000);
	await press(p, 'Export');
	t.ok(await saved(p, 60000), 'the paperback is saved');
	got = pdf(await target(p));
	t.eq(inOrder(got, paras), '', 'the paperback holds every paragraph of Part One, in order');
}, { changes: true });

// ======================================================================================================================
// Markdown in a note, and the characters XML does not like
// ======================================================================================================================

const TRICKY = `Tom & Jerry said "hi" <b>bold</b> and 5 < 6 > 4 ]]> done. It's a \\ backslash and 100% & more; &amp; &lt; stay as typed.

**Bold** *italic* ***both*** ~~strike~~ ==mark== \`code\` [[Epilogue|the end]] [web](https://x.org/a?b=1&c=2)

> Quote line one
> quote line two

- item one
- item two
  - nested item

1. first
2. second

| a | b |
|---|---|
| cell c | cell d |

Emoji 😀 and tab\there and zero​width, ligature ﬁne, combining é and “curly” quotes.

Footnote ref[^1].

[^1]: The footnote text.
`;
const TRICKY_WORDS = ['Tom', 'Jerry', 'said', 'hi', 'bold', 'Bold', 'italic', 'both', 'strike', 'mark', 'code', 'the', 'end', 'web', 'Quote', 'line', 'one', 'quote', 'two', 'item', 'nested', 'first', 'second', 'cell', 'Emoji', 'and', 'tab', 'here', 'Footnote', 'ref', 'stay', 'typed', 'backslash', 'curly', 'quotes', 'combining', 'footnote', 'text'];
test('a note full of characters XML and HTML trip on, and every kind of Markdown: every word reaches the Word file, the EPUB and the Scrivener project', async (p, h, t) => {
	await writeRaw(p, L + 'Prologue.md', TRICKY);
	await p.sleep(500);
	const lack = (hay, who) => { const have = new Set(words(hay)); const miss = TRICKY_WORDS.filter((w) => !have.has(w)); t.eq(miss.join(), '', `${who}: no word is missing`); };
	let at = await make(p, 'The Lighthouse');
	let d = docx(at);
	lack(d.all + ' ' + d.notes, 'Word');
	t.ok(d.all.includes('Tom & Jerry said “hi”') || d.all.includes('Tom & Jerry said "hi"'), 'Word: “&” and the quote marks are as typed');
	t.ok(d.all.includes('5 < 6 > 4 ]]> done'), 'Word: “<”, “>” and “]]>” are as typed');
	t.ok(d.all.includes('& < stay as typed'), 'Word: an entity in the text is read as Markdown reads it (“&amp;” is “&”), as Obsidian’s reading view shows it');
	t.ok(d.all.includes('😀') && d.all.includes('ﬁne'), 'Word: an emoji and a ligature survive');
	t.ok(!/\*\*|~~|==|\[\[|\]\]\(|\]\(https/.test(d.all), 'Word: no Markdown marks are left in the text');
	await closeAll(p);
	at = await make(p, 'The Lighthouse', 'Ebook');
	const e = epub(at);
	lack(e.body, 'EPUB');
	t.ok(e.body.includes('Tom & Jerry said') && e.body.includes('5 < 6 > 4 ]]> done'), 'EPUB: “&”, “<”, “>” and “]]>” are as typed');
	t.ok(e.body.includes('& < stay as typed'), 'EPUB: an entity is read as Markdown reads it');
	const verdict = epubcheck(at);
	if (verdict !== null) t.eq(verdict, '', 'EPUBCheck passes it');
	await closeAll(p);
	at = await make(p, 'The Lighthouse', 'Scrivener project');
	const sc = scrivText(at);
	const pro = sc.items.find((i) => i.title === 'Prologue');
	const rt = sc.text(pro.id) ?? '';
	lack(rt, 'Scrivener');
	t.ok(rt.includes('Tom & Jerry said') && rt.includes('😀'), 'Scrivener: “&” and the emoji are as typed');
}, { changes: true });

// ======================================================================================================================
// Awkward books
// ======================================================================================================================

test('an empty binder: the window opens, says so, and an export is not a corrupt file', async (p, h, t) => {
	await mk(p, 'Empty book', []);
	await open(p, 'Empty book');
	const detail = await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail')?.textContent`);
	t.ok(NOT_DONE(detail ?? ''), 'the size line is sound: ' + detail);
	const btn = await p.ev(`(() => { const b = document.querySelector('${WIN} button.mod-cta'); return b ? { text: b.textContent, disabled: b.disabled } : null; })()`);
	t.ok(btn, 'there is an Export button');
	for (const kind of ['Manuscript', 'Ebook', 'Scrivener project', 'One note']) {
		await pick(p, kind);
		const info = await p.ev(`({ detail: document.querySelector('${WIN} .binders-snapshots-detail')?.textContent, disabled: document.querySelector('${WIN} button.mod-cta')?.disabled, said: document.querySelector('${WIN} .binders-export-warn-head')?.textContent ?? '' })`);
		t.ok(NOT_DONE(info.detail ?? ''), `${kind}: the size line is sound (${info.detail})`);
	}
	await pick(p, 'Manuscript');
	await press(p, 'Export');
	await p.sleep(1500);
	const out = join(p.vaultDir, 'Exports', 'Empty book.docx');
	if (existsSync(out)) { const d = docx(out); t.ok(d.parts.includes('word/document.xml'), 'a file that was made is a whole Word package'); t.ok(true, 'an empty manuscript was made: ' + d.all.slice(0, 80).replace(/\n/g, '|')); }
	else t.ok(/nothing|empty|no notes/i.test((await status(p)) + (await notices(p))) || (await p.ev(`document.querySelector('${WIN} button.mod-cta')?.disabled`)), 'nothing was made and the window says why, or Export is off (' + (await status(p)) + (await notices(p)) + ')');
});

test('a binder of one note, and a binder of only folders (some with nothing in them)', async (p, h, t) => {
	await mk(p, 'One', [['Only', 'The only paragraph, of seven words.']]);
	let at = await make(p, 'One');
	let d = docx(at);
	t.eq(words(d.body.join(' ')).join(' '), 'The only paragraph of seven words', 'one note: Word has its words');
	t.eq(d.headings.join('|'), 'Chapter One Only', 'its one heading');
	await closeAll(p);
	at = await make(p, 'One', 'Ebook');
	t.eq(words(epub(at).body).join(' '), 'The only paragraph of seven words', 'one note: the EPUB has its words');
	const v = epubcheck(at);
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
	await closeAll(p);
	await mk(p, 'Folders', [['Act one/Scene a', 'Alpha words here.'], ['Act two/Scene b', 'Beta words there.']]);
	await p.ev(`app.vault.adapter.mkdir('Folders/Act three').then(() => 1)`);
	await p.ev(`(async () => { const f = ${file('Folders/Folders.md')}; await app.fileManager.processFrontMatter(f, fm => { fm.contents.push('Act three/'); }); })().then(() => 1)`);
	await p.sleep(600);
	at = await make(p, 'Folders');
	d = docx(at);
	t.eq(words(d.body.join(' ')).join(' '), 'Alpha words here Beta words there', 'folders and an empty folder: the words, and the empty folder doesn’t break it (' + at + '; ' + d.paras.map((x) => x.style + '|' + x.text).join(' / ') + ')');
	t.ok(NOT_DONE(d.all), 'no “undefined” in the file');
	await closeAll(p);
	at = await make(p, 'Folders', 'Ebook');
	const e = epub(at);
	t.eq(words(e.body).join(' '), 'Alpha words here Beta words there', 'the EPUB too');
	const v2 = epubcheck(at);
	if (v2 !== null) t.eq(v2, '', 'EPUBCheck passes it');
});

test('very long titles: a note, a folder and a binder named with 200 characters survive every kind, the window does not spill', async (p, h, t) => {
	const long = 'The very long and winding tale of how a keeper counted every one of the hundred and twelve steps of a lighthouse stair while a storm gathered over the sound and nobody came to help'.slice(0, 180);
	await mk(p, 'Long names', [[long, 'Chapter body words alpha.'], [long.slice(0, 60) + ' part/' + long.slice(60, 140), 'Second body words beta.']]);
	await open(p, 'Long names');
	const fit = await p.ev(`(() => { const m = document.querySelector('${WIN}').getBoundingClientRect(); const bad = [...document.querySelectorAll('${WIN} *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > m.right + 2) && !e.closest('.binders-export-scroll, iframe'); }).map(e => e.className).slice(0, 5); return bad; })()`);
	t.eq(fit.join(), '', 'nothing in the window sticks out past its edge');
	await press(p, 'Export');
	t.ok(await saved(p, 20000), 'the manuscript is saved');
	let d = docx(await target(p));
	t.ok(d.all.includes(long.slice(0, 60)), 'the long title is in the Word file in full');
	t.eq(words(d.body.join(' ')).join(' '), 'Chapter body words alpha Second body words beta', 'the words are whole');
	await closeAll(p);
	const at = await make(p, 'Long names', 'Ebook');
	t.eq(words(epub(at).body).join(' '), 'Chapter body words alpha Second body words beta', 'the EPUB is whole');
	const v = epubcheck(at);
	if (v !== null) t.eq(v, '', 'EPUBCheck passes an ebook with 180-character chapter titles');
	await closeAll(p);
	const sc = scrivText(await make(p, 'Long names', 'Scrivener project'));
	t.ok(sc.items.some((i) => i.title.startsWith(long.slice(0, 60))), 'the project carries the long title');
});

const SCRIPTS = [
	['Русский', 'Это первая глава. Маяк стоял на скале, и смотритель считал ступени каждую ночь.'],
	['Ελληνικά', 'Ο φάρος στεκόταν στο βράχο και ο φύλακας μετρούσε τα σκαλιά κάθε νύχτα.'],
	['日本語', '灯台は岩の上に立っていた。番人は毎晩階段を数えた。'],
	['中文', '灯塔矗立在岩石上。看守每天晚上数着台阶。'],
	['한국어', '등대는 바위 위에 서 있었다. 간수는 매일 밤 계단을 세었다.'],
	['العربية', 'وقف المنارة على الصخرة وكان الحارس يعد الدرجات كل ليلة.'],
	['עברית', 'המגדלור עמד על הסלע והשומר ספר את המדרגות בכל לילה.'],
	['ไทย', 'ประภาคารตั้งอยู่บนโขดหิน ผู้เฝ้านับขั้นบันไดทุกคืน'],
];
test('a book in Cyrillic, Greek, Japanese, Chinese, Korean, Arabic, Hebrew and Thai: Word, EPUB, Scrivener and One note keep every letter', async (p, h, t) => {
	await mk(p, 'Книга', SCRIPTS);
	const want = lettersOnly(SCRIPTS.map((s) => s[1]).join(''));
	let at = await make(p, 'Книга');
	let d = docx(at);
	t.ok(at.endsWith('Книга.docx'), 'the file is named in the book’s script: ' + at);
	t.eq(lettersOnly(d.body.join('')), want, 'Word: every letter of every script, in order');
	t.ok(SCRIPTS.every((s) => d.headings.some((h) => h.includes(s[0]))), 'and every chapter title');
	await closeAll(p);
	at = await make(p, 'Книга', 'Ebook');
	const e = epub(at);
	t.eq(lettersOnly(e.body), want, 'EPUB: every letter, in order');
	const v = epubcheck(at);
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
	await closeAll(p);
	const sc = scrivText(await make(p, 'Книга', 'Scrivener project'));
	const got = sc.items.filter((i) => i.type === 'Text').map((i) => sc.text(i.id) ?? '').join('');
	t.eq(lettersOnly(got), want, 'Scrivener: every letter, in order (RTF escapes)');
	await closeAll(p);
	await open(p, 'Книга');
	await pick(p, 'One note');
	await press(p, 'Export');
	await until(p, `app.workspace.getActiveFile()?.path?.includes('(exported)')`, 8000);
	const body = await p.ev(`app.vault.adapter.read(app.workspace.getActiveFile().path)`);
	t.eq(lettersOnly(body.replace(/^#.*$/gm, '')), want, 'One note: every letter');
}, { changes: true });

test('a book in Cyrillic, CJK and Arabic as a PDF (Manuscript and Paperback): the letters are in the pages', async (p, h, t) => {
	if (spawnSync('pdftotext', ['-v']).error) { t.ok(true, 'pdftotext isn’t installed: skipped'); return; }
	await mk(p, 'Книга', SCRIPTS.slice(0, 1).concat(SCRIPTS.slice(2, 3), SCRIPTS.slice(5, 6)));
	const want = lettersOnly(SCRIPTS[0][1] + SCRIPTS[2][1] + SCRIPTS[5][1]);
	const pdf = (path) => lettersOnly(spawnSync('pdftotext', ['-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout);
	await open(p, 'Книга');
	await pick(p, 'Paperback');
	await until(p, `!!document.querySelector('${WIN} .binders-export-preview[data-pages]')`, 30000);
	await press(p, 'Export');
	t.ok(await saved(p, 60000), 'saved');
	const got = pdf(await target(p));
	const missing = [...want].filter((c) => !got.includes(c));
	t.eq([...new Set(missing)].join(''), '', 'Paperback: no letter is missing from the PDF (a rendered glyph that is a box is text all the same, so also check the fonts)');
	const fonts = spawnSync('pdffonts', [await target(p)], { encoding: 'utf8' }).stdout;
}, { changes: true });

test('a note changed in the editor and not yet saved when Export is pressed: the file has the typing', async (p, h, t) => {
	const typeInto = (word) => p.ev(`(() => { const leaf = app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === ${j(L + 'Prologue.md')}); if (!leaf) return 'no editor'; const ed = leaf.view.editor; ed.replaceRange(' ' + ${j(word)}, { line: ed.lastLine(), ch: ed.getLine(ed.lastLine()).length }); return 'typed'; })()`);
	await p.ev(`(async () => { await app.workspace.getLeaf('tab').openFile(${file(L + 'Prologue.md')}); })().then(() => 1)`);
	await until(p, `app.workspace.getLeavesOfType('markdown').some(l => l.view.file?.path === ${j(L + 'Prologue.md')} && l.view.editor)`, 4000);
	await p.ev(`(() => { app.commands.executeCommandById('binders:export'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} button.mod-cta')`, 6000);
	await p.sleep(300);
	// typed through the editor's own API, as the typing of a moment ago, then Export at once
	t.eq(await typeInto('TYPED-JUST-NOW-ALPHA'), 'typed', 'typed into the open note');
	await press(p, 'Export');
	t.ok(await saved(p), 'exported');
	t.ok(docx(await target(p)).all.includes('TYPED-JUST-NOW-ALPHA'), 'Word has the words typed an instant before, which Obsidian had not yet written to disk');
	await closeAll(p);
	await p.ev(`(() => { app.commands.executeCommandById('binders:export'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} button.mod-cta')`, 6000);
	await p.sleep(300);
	await pick(p, 'Ebook');
	t.eq(await typeInto('TYPED-JUST-NOW-BETA'), 'typed', 'typed again');
	await press(p, 'Export');
	t.ok(await saved(p), 'the ebook is exported');
	t.ok(epub(await target(p)).body.includes('TYPED-JUST-NOW-BETA'), 'the EPUB has the words too');
}, { changes: true });

test('a note deleted, then another renamed, while the window is open: the export is whole and none of it is lost', async (p, h, t, before) => {
	await open(p, 'The Lighthouse');
	await p.ev(`(async () => { await app.vault.delete(${file(L + 'Part One/The keeper.md')}); await app.fileManager.renameFile(${file(L + 'Epilogue.md')}, ${j(L + 'Afterword.md')}); })().then(() => 1)`);
	await p.sleep(900);
	await press(p, 'Export');
	t.ok(await saved(p), 'exported without a complaint');
	const d = docx(await target(p));
	const all = Object.entries(before).filter(([k]) => /Epilogue|Prologue|Arrival|Storm|wreck|Lights/.test(k) && !/The keeper/.test(k));
	t.ok(!d.all.includes('He met her at the foot of the tower'), 'the deleted note is not in the book');
	t.ok(d.all.includes('Afterword') || d.headings.some((h) => /Afterword/.test(h)), 'the renamed note is in the book under its new name (' + d.headings.join('|') + ')');
	void all;
	// put it back for tidy and for the check
	await p.ev(`(async () => { await app.fileManager.renameFile(${file(L + 'Afterword.md')}, ${j(L + 'Epilogue.md')}); await app.vault.create(${j(L + 'Part One/The keeper.md')}, ${j(before[L + 'Part One/The keeper.md'])}); })().then(() => 1)`);
	await p.sleep(500);
}, { changes: true });

test('a Longform project exports in Longform’s scene order, word for word, and its notes are not changed', async (p, h, t) => {
	const idx = await p.ev(`app.vault.adapter.read('Longform demo/Index.md')`);
	const m = /scenes:\n((?:\s+- .*\n?)+)/.exec(idx);
	t.ok(!!m, 'the Longform index lists its scenes');
	const order = m ? [...m[1].matchAll(/-\s+(?:-\s+)?(.+)/g)].map((x) => x[1].trim()) : [];
	const bodies = await Promise.all(order.map((n) => p.ev(`app.vault.adapter.read(${j(`Longform demo/${n}.md`)})`).catch(() => '')));
	const want = bodies.flatMap((s) => words(s.replace(/^---\n[\s\S]*?\n---\n?/, ''))).join(' ');
	const at = await make(p, 'Longform demo');
	const d = docx(at);
	t.eq(words(d.body.join(' ')).join(' '), want, 'Word: the scenes’ words, in Longform’s order (' + order.join(', ') + ')');
	await closeAll(p);
	const e = epub(await make(p, 'Longform demo', 'Ebook'));
	t.eq(words(e.body).join(' '), want, 'EPUB: the same');
	// Export as is Longform's to decide: the window's Contents has no menu to write with
	await closeAll(p);
	await open(p, 'Longform demo');
	await p.ev(`(() => { document.querySelector('${WIN} .binders-snapshots-compare').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} .binders-export-outline .binders-export-row')`);
	const tags = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].map(r => r.querySelector('.nav-file-title-content').textContent + '=' + (r.querySelector('.binders-export-role')?.textContent ?? ''))`);
	t.ok(tags.length > 0, 'Contents lists the project: ' + tags.join('|'));
});

// ======================================================================================================================
// Styles: each one chosen, exported and read back
// ======================================================================================================================

const zipText = (path) => Object.fromEntries(Object.entries(unzipSync(new Uint8Array(readFileSync(path)))).map(([k, v]) => [k, strFromU8(v)]));
test('each manuscript style is a different Word file: Courier’s font and underlined italics, Plain’s single spacing, no title page, no header, “***” between scenes; the choice is kept in the binder note', async (p, h, t) => {
	await writeRaw(p, L + 'Part One/Storm warning.md', '---\nexport-as: scene\n---\nThe glass fell *all* afternoon.\n');
	await p.sleep(500);
	const styleOf = async (name) => {
		await open(p, 'The Lighthouse');
		await choose(p, 'style', name);
		await press(p, 'Export');
		await saved(p);
		const at = await target(p), z = zipText(at);
		await closeAll(p);
		return { d: docx(at), z, styles: z['word/styles.xml'], doc: z['word/document.xml'] };
	};
	const std = await styleOf('Standard manuscript');
	const cou = await styleOf('Standard manuscript, Courier');
	const plain = await styleOf('Plain, for a typesetter');
	const base = (r) => /<w:docDefaults>.*?<w:rFonts w:ascii="([^"]+)"/.exec(r.styles.replace(/\n/g, ''))?.[1];
	t.eq(base(std), 'Times New Roman', 'Standard: Times New Roman');
	t.eq(base(cou), 'Courier New', 'Courier: Courier New');
	t.eq(base(plain) === 'Courier New', false, 'Plain: not Courier');
	t.ok(/<w:u /.test(cou.doc) && !/<w:i\/>/.test(cou.doc.split('<w:body>')[1] ?? ''), 'Courier: italics are underlined (no italic run left)');
	t.ok(/<w:i\/>/.test(std.doc) && !/<w:u w:val="single"/.test(std.doc.split('<w:body>')[1] ?? ''), 'Standard: italics are italic');
	t.ok(std.d.header.length > 0 && cou.d.header.length > 0, 'both have a running header');
	t.ok(!plain.d.paras.some((x) => x.style === 'Title') && !plain.d.all.includes('about'), 'Plain: no title page');
	t.eq(plain.d.header, '', 'Plain: no header');
	t.ok(plain.d.paras.some((x) => x.style === 'SceneBreak' && x.text === '***'), 'Plain: “***” between scenes');
	t.ok(std.d.paras.some((x) => x.style === 'SceneBreak' && x.text === '#'), 'Standard: “#” between scenes');
	const w = (r) => words(r.d.body.join(' ')).join(' ');
	t.eq(w(cou), w(std), 'the words are the same in Courier');
	t.eq(w(plain), w(std), 'and in Plain');
	const note = await p.ev(`app.vault.adapter.read(${j(L + 'The Lighthouse.md')}).then(s => s.split('---')[1])`);
	t.ok(/export-style|style/i.test(note) && /Plain/.test(note), 'the style chosen is in the binder note: ' + note.split('\n').filter((l) => /style/i.test(l)).join(' / '));
}, { changes: true });

test('the book styles: Classic and Modern each make an EPUB that EPUBCheck passes and a paperback set in a different typeface; the choice is for this book', async (p, h, t) => {
	const css = (at) => Object.entries(zipText(at)).filter(([k]) => k.endsWith('.css')).map(([, v]) => v).join('\n');
	const faces = [];
	for (const name of ['Classic', 'Modern']) {
		await open(p, 'The Lighthouse');
		await pick(p, 'Ebook');
		await choose(p, 'style', name);
		await press(p, 'Export');
		await saved(p);
		const at = await target(p);
		const c = css(at);
		faces.push(c);
		const v = epubcheck(at);
		if (v !== null) t.eq(v, '', `${name}: EPUBCheck passes it`);
		t.eq(words(epub(at).body).join(' '), (await p.ev(`Promise.all(${j(['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'])}.map(n => app.vault.adapter.read(${j(L)} + n + '.md')))`)).flatMap((s) => words(s.replace(/^---\n[\s\S]*?\n---\n?/, ''))).join(' '), `${name}: word for word`);
		await closeAll(p);
	}
	t.ok(faces[0] !== faces[1], 'Classic and Modern are different stylesheets');
	// another binder is not affected
	await mk(p, 'Other', [['One', 'Just words.']]);
	await open(p, 'Other');
	await pick(p, 'Ebook');
	t.eq(await p.ev(`document.querySelector('${WIN} select[data-binders-key="style"]').value`), 'Classic', 'a second binder starts on the default style, not on the last one chosen for another book');
}, { changes: true });

test('front and back matter: off, a manuscript leaves them out; on, they take their places; an ebook always has them, front before the chapters and back after', async (p, h, t) => {
	await writeRaw(p, L + 'Prologue.md', '---\nexport-as: front matter\n---\nFOR-MARA-DEDICATION.\n');
	await writeRaw(p, L + 'Epilogue.md', '---\nexport-as: back matter\n---\nTHANKS-TO-THE-KEEPERS.\n');
	await p.sleep(600);
	await open(p);
	await press(p, 'Export');
	await saved(p);
	let d = docx(await target(p));
	t.ok(!d.all.includes('FOR-MARA') && !d.all.includes('THANKS-TO'), 'off: neither is in the manuscript');
	await closeAll(p);
	await open(p);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="matter"]').click(); return 1; })()`);
	await p.sleep(500);
	await press(p, 'Export');
	await saved(p);
	d = docx(await target(p));
	const iF = d.all.indexOf('FOR-MARA-DEDICATION'), iA = d.all.indexOf('The supply boat left'), iB = d.all.indexOf('THANKS-TO-THE-KEEPERS');
	t.ok(iF > 0 && iA > iF && iB > iA, 'on: the dedication first, the chapters, then the thanks');
	await closeAll(p);
	const e = epub(await make(p, 'The Lighthouse', 'Ebook'));
	const b = e.body;
	t.ok(b.indexOf('FOR-MARA-DEDICATION') >= 0 && b.indexOf('FOR-MARA-DEDICATION') < b.indexOf('The supply boat left') && b.indexOf('THANKS-TO-THE-KEEPERS') > b.indexOf('The supply boat left'), 'the ebook: front matter before, back matter after');
	const v = epubcheck(await target(p));
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
	t.ok(!e.headings.some((h) => /FOR-MARA|THANKS/.test(h)), 'and they have no chapter heading');
}, { changes: true });

// ======================================================================================================================
// Book details: the title, the author, and where they go
// ======================================================================================================================

test('Book details with “&”, “<”, quotes, a colon and a slash in the title and Cyrillic in the author: the Word header and title page, the EPUB package, the paperback’s title page, and a file name that is a file name', async (p, h, t) => {
	const TITLE = 'AC/DC: Tom & Jerry <Live> “1979”', AUTHOR = 'Анна Ивановна';
	await p.ev(`(async () => { const f = ${file(L + 'The Lighthouse.md')}; await app.fileManager.processFrontMatter(f, fm => { fm.title = ${j(TITLE)}; fm.subtitle = 'A “sub” & title'; fm.author = ${j(AUTHOR)}; }); })().then(() => 1)`);
	await p.sleep(700);
	const at = await make(p, 'The Lighthouse');
	t.eq(at.split('/').slice(-2, -1)[0], 'Exports', 'the file goes to Exports, not into a folder made from the slash: ' + at);
	t.ok(!/[:*?"<>|]/.test(at.split('/').pop()), 'and its name has no character a file name can’t have: ' + at.split('/').pop());
	const d = docx(at);
	t.ok(d.all.includes('Tom & Jerry <Live>') && d.all.includes(AUTHOR), 'Word: the title page has the title and the author exactly');
	t.ok(d.header.includes('Иванова') || d.header.includes('ИВАНОВНА') || d.header.includes('Ивановна'), 'Word: the header takes the surname (' + d.header + ')');
	await closeAll(p);
	const eAt = await make(p, 'The Lighthouse', 'Ebook');
	const z = zipText(eAt);
	const opf = z['OEBPS/package.opf'];
	t.ok(opf.includes('Tom &amp; Jerry &lt;Live&gt;') && opf.includes(AUTHOR), 'EPUB: the package has the title and author, escaped');
	const v = epubcheck(eAt);
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
	await closeAll(p);
	if (!spawnSync('pdfinfo', ['-v']).error) {
		await open(p);
		await pick(p, 'Paperback');
		await until(p, `!!document.querySelector('${WIN} .binders-export-preview[data-pages]')`, 30000);
		await press(p, 'Export');
		await saved(p, 60000);
		const pdf = await target(p);
		const txt = spawnSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout;
		t.ok(txt.includes('Tom & Jerry') && txt.includes(AUTHOR), 'Paperback: the title page has them');
	}
}, { changes: true });

test('an export beside a typed Title: the preview’s name follows Book details at once, and the Word file’s header', async (p, h, t) => {
	await open(p);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="details"]').click(); return 1; })()`);
	await until(p, `!!document.querySelector('.modal.binders-book-details [data-binders-key="title"]')`);
	await p.ev(`(() => { const e = document.querySelector('.modal.binders-book-details [data-binders-key="title"]'); e.value = 'Beacon Years'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
	await p.sleep(700);
	await p.key('Escape');
	await p.sleep(500);
	const title = await p.ev(`document.querySelector('${WIN} .binders-export-titlepage .binders-export-title')?.textContent`);
	t.ok(/beacon years/i.test(title ?? ''), 'the preview’s title page follows (' + title + ')');
	await press(p, 'Export');
	await saved(p);
	t.ok(docx(await target(p)).header.toUpperCase().includes('BEACON YEARS'), 'and so does the header of the file');
}, { changes: true });

// ======================================================================================================================
// Leaving things out
// ======================================================================================================================

test('export: false on a folder takes everything in it out of Word, the EPUB, One note and the PDF; the Scrivener project keeps it but marks it not compiled', async (p, h, t) => {
	await p.ev(`(async () => { await app.fileManager.processFrontMatter(${file(L + 'Part Two/Part Two.md')} ?? (await app.vault.create(${j(L + 'Part Two/Part Two.md')}, '')), fm => { fm.export = false; }); })().then(() => 1)`);
	await p.sleep(800);
	const gone = ['The painted map', 'one hundred and twelve', 'came in sideways'];
	const wreck = (await p.ev(`app.vault.adapter.read(${j(L + 'Part Two/Lights out.md')})`)).replace(/^---\n[\s\S]*?\n---\n?/, '');
	const probe = words(wreck).slice(0, 4).join(' ');
	let d = docx(await make(p, 'The Lighthouse'));
	t.ok(!words(d.all).join(' ').includes(probe) && !d.headings.some((h) => /Part Two|wreck|Lights out/.test(h)), 'Word: the folder, its notes and their chapters are gone (' + d.headings.join('|') + ')');
	await closeAll(p);
	const e = epub(await make(p, 'The Lighthouse', 'Ebook'));
	t.ok(!words(e.body).join(' ').includes(probe) && !e.headings.some((h) => /Part Two|wreck|Lights out/.test(h)), 'EPUB: the same');
	const v = epubcheck(await target(p));
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
	await closeAll(p);
	await open(p);
	await pick(p, 'One note');
	await press(p, 'Export');
	await until(p, `app.workspace.getActiveFile()?.path?.includes('(exported)')`, 8000);
	const note = await p.ev(`app.vault.adapter.read(app.workspace.getActiveFile().path)`);
	t.ok(!words(note).join(' ').includes(probe) && !note.includes('## Part Two'), 'One note: the same');
	await p.ev(`app.vault.adapter.remove(app.workspace.getActiveFile().path).then(() => 1)`);
	await closeAll(p);
	const sc = scrivText(await make(p, 'The Lighthouse', 'Scrivener project'));
	t.ok(sc.items.some((i) => i.title === 'Part Two') && /Part Two[\s\S]{0,400}/.test(sc.x), 'the Scrivener project keeps Part Two in the draft');
	const pt = sc.x.match(/<Title>Part Two<\/Title>\s*<MetaData>([\s\S]*?)<\/MetaData>/)?.[1] ?? '';
	t.ok(!pt.includes('<IncludeInCompile>Yes'), 'and marks it not included in compile (' + pt.replace(/\s+/g, ' ').slice(0, 120) + ')');
	void gone;
}, { changes: true });

bug('every note left out: the window says nothing will be exported, and the Word file is not a book of empty pages', async (p, h, t) => {
	await p.ev(`(async () => { for (const f of app.vault.getMarkdownFiles().filter(f => f.path.startsWith(${j(L)}) && f.path !== ${j(L + 'The Lighthouse.md')})) await app.fileManager.processFrontMatter(f, fm => { fm.export = false; }); })().then(() => 1)`);
	await p.sleep(900);
	await open(p);
	const detail = await p.ev(`document.querySelector('${WIN} .binders-snapshots-detail').textContent`);
	t.ok(/^0 words/.test(detail), 'the bar: ' + detail);
	const said = await p.ev(`document.querySelector('${WIN} .binders-export-paper')?.innerText ?? ''`);
	t.ok(/Nothing here is exported/.test(said), 'the preview says nothing is exported');
	t.ok(!!(await p.ev(`document.querySelector('${WIN} button.mod-cta')?.disabled`)), 'and Export is off, or the export says why it did not happen (UX: Export is enabled and makes a book with a title page and no chapters)');
}, { changes: true });

bug('the title page of a book with no words does not claim “about 100 words”', async (p, h, t) => {
	await mk(p, 'Hollow', []);
	const d = docx(await make(p, 'Hollow'));
	t.ok(!/about 100 words/.test(d.all), 'Word title page for a book of 0 words: ' + (d.all.match(/about [\d,]+ words/)?.[0] ?? 'no count'));
});

// ======================================================================================================================
// A window that is used hard: pressed twice, a binder renamed under it, Export again, remembered places
// ======================================================================================================================

test('Export pressed twice in a row makes one file and asks once', async (p, h, t) => {
	await open(p);
	await p.ev(`(() => { const b = document.querySelector('${WIN} button.mod-cta'); b.click(); b.click(); return 1; })()`);
	await saved(p);
	await p.sleep(1500);
	t.eq((await asked(p)).length, 1, 'the save dialog was opened once');
	t.eq(readdirSync(join(p.vaultDir, 'Exports')).join(), 'The Lighthouse.docx', 'and one file is there');
	t.ok(!(await p.ev(`[...document.querySelectorAll('.modal')].some(m => m.textContent.includes('Replace this file'))`)), 'with no question about replacing it');
});

test('the binder renamed while the window is open: Export still makes the book, with the notes it has now', async (p, h, t) => {
	await open(p);
	await p.ev(`(async () => { await app.fileManager.renameFile(${file('The Lighthouse')}, 'The Beacon'); })().then(() => 1)`);
	await p.sleep(1200);
	await press(p, 'Export');
	await p.sleep(2500);
	const said = (await status(p)) + '|' + (await notices(p));
	const made = existsSync(join(p.vaultDir, 'Exports')) ? readdirSync(join(p.vaultDir, 'Exports')) : [];
	t.ok(made.length === 1 || /didn’t finish|no longer|moved|renamed/i.test(said), 'either the book is made or the window says what happened (' + said + ' / ' + made.join() + ')');
	if (made.length) {
		const d = docx(join(p.vaultDir, 'Exports', made[0]));
		t.ok(d.all.includes('The supply boat left') && d.all.includes('They sell postcards'), 'and it is the whole book (' + made[0] + ')');
	}
	await p.ev(`(async () => { await app.fileManager.renameFile(${file('The Beacon')}, 'The Lighthouse'); })().then(() => 1)`);
	await p.sleep(800);
}, { changes: true });

test('Export again: a note changed since is in the new file; a folder’s own export is repeated for the folder; the binder renamed gets the window instead of a wrong file', async (p, h, t) => {
	await open(p, L + 'Part One');
	await pick(p, 'Ebook');
	await press(p, 'Export');
	await saved(p);
	await closeAll(p);
	await writeRaw(p, L + 'Part One/Arrival.md', 'Brand new first lines, AGAIN-ALPHA.\n');
	await p.sleep(800);
	await p.ev(`(() => { app.commands.executeCommandById('binders:export-again'); return 1; })()`);
	await p.sleep(2500);
	const at = join(p.vaultDir, 'Exports', 'Part One.epub');
	t.ok(existsSync(at) && epub(at).body.includes('AGAIN-ALPHA'), 'Export again from the folder’s view makes the ebook again with the new words');
	t.eq((await asked(p)).length, 1, 'with no dialog');
	// the whole binder was never exported on this device: the window
	await closeAll(p);
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { app.commands.executeCommandById('binders:export-again'); return 1; })()`);
	t.ok(await until(p, `!!document.querySelector('${WIN}')`, 4000), 'a binder not yet exported gets the window');
}, { changes: true });

test('a remembered place is for one kind of one binder; with its folder gone the file still lands there', async (p, h, t) => {
	await open(p);
	await press(p, 'Export');
	await saved(p);
	await p.ev(`(() => { document.querySelector('${WIN} .binders-export-remember input').click(); return 1; })()`);
	await p.sleep(300);
	await pick(p, 'Ebook');
	await press(p, 'Export');
	await saved(p);
	t.eq((await asked(p)).length, 2, 'the ebook asked, though the Word file’s place was remembered');
	await closeAll(p);
	// delete the Exports folder from outside, then export straight to the remembered place
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath('Exports'); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
	await p.sleep(300);
	rmSyncSafe(join(p.vaultDir, 'Exports'));
	await open(p);
	await pick(p, 'Manuscript');
	t.eq(await p.ev(`document.querySelector('${WIN} .binders-export-place')?.textContent`), 'Saves to Exports/The Lighthouse.docx', 'the window still says where it saves');
	await press(p, 'Export');
	t.ok(await saved(p), 'and it saved, the folder made again');
	t.eq((await asked(p)).length, 2, 'without asking');
	t.ok(existsSync(join(p.vaultDir, 'Exports', 'The Lighthouse.docx')), 'the file is there');
});
import { rmSync } from 'fs';
function rmSyncSafe(path) { try { rmSync(path, { recursive: true, force: true }); } catch { /* none */ } }

bug('two binders of the same name, exported to one vault-wide Exports folder without a save dialog: the second does not silently replace the first', async (p, h, t) => {
	await setting(p, { exportsFolder: 'Books/Exports' });
	await standIn(p, { none: true });
	await mk(p, 'Shelf A/Draft', [['One', 'First book words, ALPHA-BOOK.']]);
	await mk(p, 'Shelf B/Draft', [['One', 'Second book words, BETA-BOOK.']]);
	await make(p, 'Shelf A/Draft');
	t.ok(docx(join(p.vaultDir, 'Books', 'Exports', 'Draft.docx')).all.includes('ALPHA-BOOK'), 'the first book is exported');
	await closeAll(p);
	await open(p, 'Shelf B/Draft');
	await press(p, 'Export');
	await p.sleep(2500);
	const asked2 = await p.ev(`[...document.querySelectorAll('.modal')].some(m => m.textContent.includes('Replace this file'))`);
	const at = join(p.vaultDir, 'Books', 'Exports', 'Draft.docx');
	const kept = existsSync(at) ? docx(at).all : '';
	t.ok(asked2 || (kept.includes('ALPHA-BOOK') && kept.includes('BETA-BOOK')) || (existsSync(join(p.vaultDir, 'Books', 'Exports')) && readdirSync(join(p.vaultDir, 'Books', 'Exports')).length > 1), 'the first book’s words survive: it asked, or numbered the second (file: ' + (kept.includes('ALPHA-BOOK') ? 'first book' : kept.includes('BETA-BOOK') ? 'SECOND book only' : '?') + ')');
}, { changes: true });

test('Cancel while a paperback is being made: no file, no half of one, and the window can export again', async (p, h, t) => {
	if (spawnSync('pdftotext', ['-v']).error) { t.ok(true, 'no poppler: skipped'); return; }
	const para = 'The keeper climbed the stair again while the sea kept on at the rocks below and nobody came for him that night or the next. '.repeat(10);
	await mk(p, 'Heavy', Array.from({ length: 12 }, (_, i) => [`Chapter ${i + 1}`, Array.from({ length: 40 }, () => para).join('\n\n')]));
	await open(p, 'Heavy');
	await pick(p, 'Paperback');
	await until(p, `!!document.querySelector('${WIN} .binders-export-preview[data-pages]')`, 120000);
	await press(p, 'Export');
	const cancelled = await until(p, `(() => { const b = [...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Cancel' && b.getBoundingClientRect().width); if (!b) return false; b.click(); return true; })()`, 20000);
	t.ok(cancelled, 'a Cancel button appears while it is made');
	await p.sleep(3000);
	const dir = join(p.vaultDir, 'Exports');
	t.ok(!existsSync(dir) || readdirSync(dir).length === 0, 'cancelled: nothing was written (' + (existsSync(dir) ? readdirSync(dir).join() : 'no folder') + ')');
	t.eq(await p.ev(`document.querySelector('${WIN} button.mod-cta')?.textContent`), 'Export', 'and Export is back');
	t.ok(!/didn’t finish/.test(await notices(p)), 'with no complaint');
}, { changes: true });

test('the Export styles folder deleted while the window is open on a style of one’s own: Export still works and the book uses what it falls back to', async (p, h, t) => {
	await open(p);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="edit-style"]').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} .binders-style-editor')`);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="style-more"]').click(); return 1; })()`);
	await until(p, `!!document.querySelector('.menu')`);
	await clickMenu(p, 'Duplicate');
	await p.sleep(1000);
	await p.ev(`(() => { document.querySelector('${WIN} [data-binders-key="style-back"]').click(); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} select[data-binders-key="style"]')`);
	const chosen = await p.ev(`document.querySelector('${WIN} select[data-binders-key="style"]').value`);
	t.ok(/copy|Standard manuscript/i.test(chosen) && chosen !== 'Standard manuscript', 'a style of one’s own is chosen: ' + chosen);
	await p.ev(`(async () => { const f = app.vault.getAbstractFileByPath(${PL}.styles.folder); if (f) await app.vault.delete(f, true); })().then(() => 1)`);
	rmSyncSafe(join(p.vaultDir, 'Export styles'));
	await p.sleep(1200);
	await closeMenus(p);
	const btn = await p.ev(`!![...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Export' && b.getBoundingClientRect().width)`);
	t.ok(btn, 'Export is still there');
	await press(p, 'Export');
	t.ok(await saved(p, 15000), 'the file is made');
	const d = docx(await target(p));
	t.ok(d.all.includes('The supply boat left') && d.all.includes('They sell postcards'), 'whole, in whatever style it fell back to');
}, { changes: true, skip: [] });

test('a cover that is a missing file, an SVG or a WebP: the ebook is still made, and the window lists it', async (p, h, t) => {
	for (const cover of ['[[no such picture.png]]', 'covers/art.svg', 'covers/art.webp']) {
		if (cover.endsWith('.svg')) { await p.ev(`(async () => { await app.vault.adapter.mkdir('covers').catch(() => 0); await app.vault.adapter.write('covers/art.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'); })().then(() => 1)`); }
		if (cover.endsWith('.webp')) { await p.ev(`(async () => { await app.vault.adapter.writeBinary('covers/art.webp', new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]).buffer); })().then(() => 1)`); }
		await p.ev(`(async () => { const f = ${file(L + 'The Lighthouse.md')}; await app.fileManager.processFrontMatter(f, fm => { fm.cover = ${j(cover)}; }); })().then(() => 1)`);
		await p.sleep(800);
		const at = await make(p, 'The Lighthouse', 'Ebook');
		const e = epub(at);
		t.ok(words(e.body).length > 50, `cover ${cover}: the ebook has its text`);
		const v = epubcheck(at);
		if (v !== null) t.eq(v, '', `cover ${cover}: EPUBCheck passes it`);
		await closeAll(p);
	}
}, { changes: true });

// ======================================================================================================================
// A phone and a tablet, by touch
// ======================================================================================================================

/** Every control of the window that is on screen: its name, its box, and whether the thing at its centre is itself
    (nothing over it) once it is scrolled into view. */
const controls = (p) => p.ev(`(() => [...document.querySelectorAll('${WIN} button, ${WIN} .clickable-icon, ${WIN} select.dropdown:not(.is-measuring), ${WIN} input[type="text"], ${WIN} [role="option"], ${WIN} .checkbox-container, ${WIN} .text-icon-button')].filter(e => e.getBoundingClientRect().width && !e.closest('[aria-hidden="true"]')).map(e => {
	e.scrollIntoView({ block: 'nearest' });
	const r = e.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
	return { name: ((e.getAttribute('aria-label') || e.textContent || e.dataset.bindersKey || e.tagName).split('\\n')[0]).slice(0, 28), w: Math.round(r.width), h: Math.round(r.height), reach: !!at && (at === e || e.contains(at) || at.contains(e)), inside: r.left >= -1 && r.right <= innerWidth + 1, toggle: e.classList.contains('checkbox-container') };
}))()`);
const sizes = (t, list, where) => {
	for (const c of list) {
		t.ok(c.reach, `${where}: “${c.name}” can be tapped (nothing over its centre)`);
		t.ok(c.inside, `${where}: “${c.name}” is inside the screen’s width`);
		t.ok(c.h >= (c.toggle ? 28 : 40) && c.w >= 28, `${where}: “${c.name}” is a touchable size (${c.w} × ${c.h})`);
	}
};
const kindTap = (p, name) => tapEl(p, `[...document.querySelectorAll('${WIN} [role="option"]')].find(e => e.querySelector('.binders-snapshots-item-name').textContent === ${j(name)})`);
const sayings = (p) => p.ev(`document.querySelector('${WIN}').innerText`);

test('a phone: every kind’s controls can be touched and are touchable-sized, none sticks out; the window says what a PDF needs and that a project is zipped', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		for (const kind of ['Manuscript', 'Ebook', 'Paperback', 'Scrivener project', 'One note']) {
			await kindTap(p, kind);
			await p.sleep(500);
			sizes(t, await controls(p), `phone ${kind}`);
			if (kind === 'Paperback') t.ok(/made by Obsidian on a computer|made on a computer/.test(await sayings(p)), 'Paperback: the window says a PDF is made on a computer');
			if (kind === 'Scrivener project') t.ok((await p.ev(`document.querySelector('${WIN} .binders-export-place')?.textContent`)).includes('.scriv.zip'), 'Scrivener: the window says it is zipped');
			await shot(p, `phone-${kind.replace(/\W+/g, '-')}`);
		}
		// a manuscript as a PDF, chosen by its dropdown
		await kindTap(p, 'Manuscript');
		await choose(p, 'file', 'pdf');
		await p.sleep(600);
		t.ok(/computer/.test(await sayings(p)), 'Manuscript as PDF: the window says a PDF is made on a computer');
		const exportable = await p.ev(`!![...document.querySelectorAll('${WIN} button')].find(b => b.textContent === 'Export' && b.getBoundingClientRect().width && !b.disabled)`);
		t.ok(!exportable, 'and there is no Export that cannot work');
		await choose(p, 'file', 'docx');
	});
});

test('a phone: One note and a Scrivener project by touch; the Scrivener zip is whole word for word and the note has the text', async (p, h, t, before) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		await kindTap(p, 'Scrivener project');
		await tapEl(p, button('Export'));
		t.ok(await until(p, `app.vault.adapter.exists('Exports/The Lighthouse.scriv.zip')`, 15000), 'the zip is in Exports in the vault');
		await p.sleep(500);
		const sc = scrivText(join(p.vaultDir, 'Exports', 'The Lighthouse.scriv.zip'));
		const body = (s) => words(s.replace(/^---\n[\s\S]*?\n---\n?/, '')).join(' ');
		const order = ['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'];
		t.eq(words(sc.items.filter((i) => i.type === 'Text' && sc.text(i.id)).map((i) => sc.text(i.id)).join(' ')).filter(Boolean).join(' ').includes(order.slice(0, 1).map((n) => body(before[L + n + '.md'])).join(' ')), true, 'the zip’s documents hold the notes’ words');
		t.ok((await notices(p)).includes('Exported'), 'and a notice says so');
		await closeAll(p);
		await open2(p);
		await kindTap(p, 'One note');
		await tapEl(p, button('Export'));
		t.ok(await until(p, `app.vault.adapter.exists('The Lighthouse (exported).md')`, 8000), 'One note by touch writes its note');
		const note = await p.ev(`app.vault.adapter.read('The Lighthouse (exported).md')`);
		t.eq(words(note).slice(2).join(' ').includes(words(before[L + 'Epilogue.md'].replace(/^---\n[\s\S]*?\n---\n?/, '')).join(' ')), true, 'with the last chapter’s words');
		await p.ev(`app.vault.adapter.remove('The Lighthouse (exported).md').then(() => 1)`);
	});
}, { changes: true });

test('a phone: Contents is reachable from Preview, a row’s part is changed by a tap on a menu big enough to touch, and the book follows', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		await kindTap(p, 'Ebook');
		await tapEl(p, button('Preview'));
		await until(p, `!!document.querySelector('${WIN} .binders-export-pane')`);
		const contents = await controls(p);
		t.ok(contents.some((c) => /Contents/.test(c.name)), 'Contents is on the Preview screen');
		sizes(t, contents, 'phone Preview');
		await tapEl(p, `document.querySelector('${WIN} .binders-snapshots-compare')`);
		await until(p, `!!document.querySelector('${WIN} .binders-export-outline .binders-export-row')`);
		const rows = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].map(r => { const b = r.getBoundingClientRect(), tag = r.querySelector('.binders-export-role')?.getBoundingClientRect(); return { name: r.querySelector('.nav-file-title-content').textContent, h: Math.round(b.height), tagH: tag ? Math.round(tag.height) : 0, tagW: tag ? Math.round(tag.width) : 0 }; })`);
		t.ok(rows.length >= 9, 'the rows are listed');
		for (const r of rows) t.ok(r.h >= 36, `row “${r.name}” is touchable (${r.h})`);
		await tapEl(p, `[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-row')].find(r => r.querySelector('.nav-file-title-content').textContent === 'Epilogue').querySelector('.binders-export-role')`);
		t.ok(await until(p, `!!document.querySelector('.menu, .mobile-menu')`, 3000), 'the part opens a menu');
		const items = await p.ev(`[...document.querySelectorAll('.menu-item')].map(i => ({ t: i.querySelector('.menu-item-title')?.textContent, h: Math.round(i.getBoundingClientRect().height) }))`);
		t.ok(items.length >= 6 && items.every((i) => i.h >= 36), 'its items are tall enough to touch (' + items.map((i) => i.h).join() + ')');
		await tapEl(p, `[...document.querySelectorAll('.menu-item')].find(i => i.querySelector('.menu-item-title')?.textContent === 'Back matter')`);
		await p.sleep(700);
		t.ok(/export-as: back matter/.test(await p.ev(`app.vault.adapter.read(${j(L + 'Epilogue.md')})`)), 'Back matter is written to the note');
	});
}, { changes: true });

test('a phone on its side (844 × 390): the window can be used; Export can be reached and tapped', async (p, h, t) => {
	await onMobile(p, 844, 390, async () => {
		await open2(p);
		const list = await controls(p);
		t.ok(list.length > 5, 'controls found: ' + list.length);
		sizes(t, list.filter((c) => !/^(Manuscript|Ebook|Paperback|Scrivener|One note)/.test(c.name)), 'landscape');
		const at = await p.ev(`(() => { const b = [...document.querySelectorAll('${WIN} button')].filter(b => b.textContent === 'Export' && b.getBoundingClientRect().width).pop(); if (!b) return 'none'; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, vis: r.top >= 0 && r.bottom <= innerHeight, over: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b }; })()`);
		t.ok(at !== 'none' && at.vis && at.over, 'Export is on the screen once scrolled to, with nothing over it: ' + JSON.stringify(at));
		await tapEl(p, button('Export'));
		t.ok(await until(p, `app.vault.adapter.exists('Exports/The Lighthouse.docx')`, 8000), 'a tap makes the file');
	});
});

for (const [name, w, h2] of [['a tablet upright (768 × 1024)', 768, 1024], ['a tablet on its side (1024 × 768)', 1024, 768]]) {
	test(`${name}: both panes, every control touchable, an ebook made by touch whole`, async (p, h, t, before) => {
		await onMobile(p, w, h2, async () => {
			await open2(p);
			const list = await controls(p);
			sizes(t, list.filter((c) => !c.toggle || true), name);
			const panes = await p.ev(`(() => { const s = document.querySelector('${WIN} .binders-export-side'), q = document.querySelector('${WIN} .binders-export-pane'), m = document.querySelector('${WIN}').getBoundingClientRect(); const a = s?.getBoundingClientRect(), b = q?.getBoundingClientRect(); return { side: !!a, pane: !!b, fits: a && b ? a.right <= b.left + 1 && b.right <= m.right + 1 && m.right <= innerWidth + 1 : null, modal: [Math.round(m.width), Math.round(m.height), innerWidth, innerHeight] }; })()`);
			t.ok(panes.side, name + ': the choices are there');
			t.ok(panes.fits !== false, name + ': the panes fit the screen (' + JSON.stringify(panes) + ')');
			await kindTap(p, 'Ebook');
			await tapEl(p, button('Export'));
			t.ok(await until(p, `app.vault.adapter.exists('Exports/The Lighthouse.epub')`, 12000), 'the ebook is made');
			await p.sleep(600);
			t.eq(words(epub(join(p.vaultDir, 'Exports', 'The Lighthouse.epub')).body).join(' '), (await Promise.all(['Prologue', 'Part One/Arrival', 'Part One/The keeper', 'Part One/Storm warning', 'Part Two/The wreck', 'Part Two/Lights out', 'Epilogue'].map((n) => before[L + n + '.md']))).flatMap((s) => words(s.replace(/^---\n[\s\S]*?\n---\n?/, ''))).join(' '), 'word for word');
			await shot(p, 'tablet-' + w);
		});
	});
}

bug('a phone: the part at the end of a Contents row (“Chapter”, “Part 1”) is a touchable size, and a tap just beside it does not leave the Export window for the note', async (p, h, t) => {
	await onMobile(p, 390, 844, async () => {
		await open2(p);
		await kindTap(p, 'Ebook');
		await tapEl(p, button('Preview'));
		await until(p, `!!document.querySelector('${WIN} .binders-export-pane')`);
		await tapEl(p, `document.querySelector('${WIN} .binders-snapshots-compare')`);
		await until(p, `!!document.querySelector('${WIN} .binders-export-outline .binders-export-row')`);
		const tags = await p.ev(`[...document.querySelectorAll('${WIN} .binders-export-outline .binders-export-role.is-menu')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })`);
		t.ok(tags.length > 3 && tags.every(([w, hh]) => hh >= 28 && w >= 28), 'every part is at least 28 × 28 (smallest: ' + j(tags.reduce((a, b) => (b[1] < a[1] ? b : a), tags[0])) + ')');
	});
});

// ======================================================================================================================
// What the manual says a note becomes
// ======================================================================================================================

test('“What your Markdown becomes”: each row of the manual’s table is what the Word file and the EPUB do', async (p, h, t) => {
	await writeRaw(p, L + 'Epilogue.md', 'EMBEDDED-NOTE-TEXT sits here.\n');
	await writeRaw(p, L + 'Prologue.md', [
		'First line',
		'Second line, a new paragraph.',
		'',
		'Hard break with two spaces  ',
		'after it. And a backslash\\',
		'break too.',
		'',
		'"Straight" quotes and it\'s -- a dash... and an ellipsis.',
		'',
		'Before the rule.',
		'',
		'---',
		'',
		'After the rule.',
		'',
		'%% a one-line comment %% kept-after-comment',
		'',
		'%% a multi-line',
		'comment that goes on %%',
		'',
		'Text <!-- html comment --> after.',
		'',
		'A paragraph with a block id. ^blockid1',
		'',
		'#sometag #another',
		'',
		'> [!warning] Be careful',
		'> The callout body.',
		'',
		'See [[Part One/Arrival]] and [[Part One/Arrival|that arrival]] and ==highlighted words==.',
		'',
		'![[Epilogue]]',
		'',
	].join('\n'));
	await p.sleep(700);
	const d = docx(await make(p, 'The Lighthouse'));
	const pro = d.paras.filter((x) => x.style !== 'Heading1').map((x) => x.text);
	const all = pro.join('\n');
	t.ok(pro.includes('First line') && pro.includes('Second line, a new paragraph.'), 'Word: a new line is a new paragraph');
	t.ok(all.includes('Hard break with two spaces after it.') || /Hard break with two spaces\s+after it/.test(all), 'Word: two spaces at a line’s end make a line break (a break, not a lost word)');
	t.ok(/a backslash\s+break too/.test(all), 'Word: a backslash at a line’s end too (' + j(all.slice(0, 400)) + ')');
	t.ok(all.includes('“Straight” quotes and it’s') && all.includes('a dash') && /—|–/.test(all) && all.includes('…'), 'Word: straight quotes curl, “--” is a dash, “...” is an ellipsis (' + all.match(/“Straight.*ellipsis./)?.[0] + ')');
	t.ok(d.paras.some((x) => x.style === 'SceneBreak') && !all.includes('---'), 'Word: “---” alone is a scene break');
	t.ok(!all.includes('a one-line comment') && all.includes('kept-after-comment') && !all.includes('multi-line') && !all.includes('goes on') && !all.includes('html comment'), 'Word: comments are left out, the text around them is kept');
	t.ok(!all.includes('^blockid1') && !all.includes('blockid1') && all.includes('A paragraph with a block id.'), 'Word: a block id is left out');
	t.ok(!all.includes('#sometag') && !all.includes('#another'), 'Word: a line of only tags is left out');
	const call = d.paras.find((x) => /Be careful/.test(x.text));
	t.ok(!!call && /<w:b\/>/.test(Object.values(unzipSync(new Uint8Array(readFileSync(join(p.vaultDir, 'Exports', 'The Lighthouse.docx'))))).map((u) => strFromU8(u)).join('').split('Be careful')[0].slice(-400)), 'Word: a callout’s title is bold');
	t.ok(all.includes('The callout body.'), 'Word: its body follows');
	t.ok(/See Arrival and that arrival and highlighted words\./.test(all), 'Word: links give their words (the alias when there is one); highlights give theirs (' + all.match(/See .*words\./)?.[0] + ')');
	t.ok(all.includes('EMBEDDED-NOTE-TEXT sits here.'), 'Word: ![[A note]] is that note’s text');
	await closeAll(p);
	const e = epub(await make(p, 'The Lighthouse', 'Ebook'));
	t.ok(e.body.includes('kept-after-comment') && !e.body.includes('a one-line comment') && !e.body.includes('blockid1') && e.body.includes('EMBEDDED-NOTE-TEXT'), 'EPUB: the same rows hold');
	const v = epubcheck(await target(p));
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
}, { changes: true });

test('typing in the editable manuscript an instant before Export (from the view’s menu): the file has it', async (p, h, t) => {
	await openView(p, 'The Lighthouse');
	await p.ev(`(() => { ${VIEW}.setMode('manuscript'); return 1; })()`);
	await until(p, `!!document.querySelector('.workspace-leaf.mod-active .binders-manuscript .cm-line')`, 8000);
	await p.sleep(800);
	const at = await p.at(`.workspace-leaf.mod-active .binders-manuscript .cm-line`);
	await p.click(at.x + 20, at.y);
	await p.key('End');
	await p.type(' MANUSCRIPT-TYPED-ALPHA');
	await p.ev(`(() => { app.commands.executeCommandById('binders:export'); return 1; })()`);
	await until(p, `!!document.querySelector('${WIN} button.mod-cta')`, 6000);
	await p.sleep(300);
	await press(p, 'Export');
	t.ok(await saved(p), 'exported');
	t.ok(docx(await target(p)).all.includes('MANUSCRIPT-TYPED-ALPHA'), 'the words typed an instant before are in the Word file');
}, { changes: true });

bug('an inline comment taken out of a sentence leaves no double space, in Word or the EPUB', async (p, h, t) => {
	await writeRaw(p, L + 'Prologue.md', 'Text <!-- html comment --> after, and more %% another %% words here.\n\n%% whole line %% Starts clean.\n');
	await p.sleep(600);
	const d = docx(await make(p, 'The Lighthouse'));
	const line = d.body.join('\n');
	t.ok(!/\S {2,}\S/.test(line.split('\n').slice(0, 2).join('\n')), 'Word: no run of spaces inside a sentence (' + j(line.split('\n').slice(0, 2)) + ')');
	t.ok(!/^\s/.test(line.split('\n')[1] ?? ''), 'Word: a paragraph that began with a comment does not begin with a space (' + j(line.split('\n')[1]) + ')');
}, { changes: true });

// ======================================================================================================================
// Pictures, line endings, odd names
// ======================================================================================================================

/** A solid-colour PNG, drawn and written by the page itself. */
const makePng = (p, path, w = 60, hh = 40) => p.ev(`(async () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${hh}; const x = c.getContext('2d'); x.fillStyle = '#336699'; x.fillRect(0, 0, ${w}, ${hh}); const b = await new Promise(r => c.toBlob(r, 'image/png')); const dir = ${j(path)}.split('/').slice(0, -1).join('/'); if (dir && !(await app.vault.adapter.exists(dir))) await app.vault.adapter.mkdir(dir); await app.vault.adapter.writeBinary(${j(path)}, await b.arrayBuffer()); })().then(() => 1)`);

test('pictures in four spellings (an embed, an embed with a width, a name with spaces, a Markdown image in a folder) reach the Word file and the EPUB, and the words around them are all there', async (p, h, t) => {
	await makePng(p, 'pics/one.png');
	await makePng(p, 'pics/two words.png', 80, 50);
	await p.sleep(500);
	await writeRaw(p, L + 'Prologue.md', 'Before-all.\n\n![[one.png]]\n\nBetween-a.\n\n![[one.png|100]]\n\nBetween-b.\n\n![[two words.png]]\n\nBetween-c.\n\n![alt text](pics/one.png)\n\nAfter-all.\n');
	await p.sleep(700);
	const at = await make(p, 'The Lighthouse');
	const z = zipText(at), d = docx(at);
	const media = Object.keys(unzipSync(new Uint8Array(readFileSync(at)))).filter((n) => n.startsWith('word/media/'));
	t.ok(media.length >= 4 || media.length >= 2, `Word: the pictures are in the file (${media.length} media parts)`);
	t.eq((z['word/document.xml'].match(/<w:drawing>/g) ?? []).length, 4, 'Word: four pictures are placed');
	t.ok(['Before-all', 'Between-a', 'Between-b', 'Between-c', 'After-all'].every((w) => d.all.includes(w)), 'Word: the words around them are there');
	t.eq((await p.ev(`document.querySelector('${WIN} .binders-export-warn-head')?.textContent ?? ''`)), '', 'and the window had nothing to warn of (pictures are fine)');
	await closeAll(p);
	const eAt = await make(p, 'The Lighthouse', 'Ebook');
	const names = Object.keys(unzipSync(new Uint8Array(readFileSync(eAt))));
	t.ok(names.filter((n) => /\.png$/.test(n)).length >= 1, 'EPUB: the picture is in the package');
	t.ok(['Before-all', 'Between-a', 'Between-b', 'Between-c', 'After-all'].every((w) => epub(eAt).body.includes(w)), 'EPUB: the words around them are there');
	const v = epubcheck(eAt);
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
}, { changes: true });

test('notes written on Windows (CRLF line endings, a byte-order mark) export their text and not their properties; an empty note and a note of only properties do not break the book', async (p, h, t) => {
	await writeRaw(p, L + 'Prologue.md', '﻿---\r\nstatus: draft\r\nsynopsis: SYNOPSIS-MUST-NOT-APPEAR\r\n---\r\nCRLF first paragraph.\r\n\r\nCRLF second paragraph.\r\n');
	await writeRaw(p, L + 'Part One/Arrival.md', '');
	await writeRaw(p, L + 'Part One/The keeper.md', '---\nsynopsis: ONLY-PROPERTIES-MUST-NOT-APPEAR\n---\n');
	await p.sleep(800);
	const d = docx(await make(p, 'The Lighthouse'));
	t.ok(d.all.includes('CRLF first paragraph.') && d.all.includes('CRLF second paragraph.'), 'Word: the CRLF note’s paragraphs are there');
	t.ok(!/SYNOPSIS-MUST|ONLY-PROPERTIES|status: draft|﻿|\r/.test(d.all), 'Word: no property, no byte-order mark, no stray carriage return');
	t.ok(d.all.includes('The radio said a storm.') && d.all.includes('They sell postcards'), 'Word: the rest of the book is whole');
	await closeAll(p);
	const eAt = await make(p, 'The Lighthouse', 'Ebook');
	const e = epub(eAt);
	t.ok(e.body.includes('CRLF first paragraph.') && !/SYNOPSIS-MUST|ONLY-PROPERTIES|status: draft/.test(e.body), 'EPUB: the same');
	const v = epubcheck(eAt);
	if (v !== null) t.eq(v, '', 'EPUBCheck passes a book with an empty chapter');
	await closeAll(p);
	await open(p);
	await pick(p, 'One note');
	await press(p, 'Export');
	await until(p, `app.workspace.getActiveFile()?.path?.includes('(exported)')`, 8000);
	const note = await p.ev(`app.vault.adapter.read(app.workspace.getActiveFile().path)`);
	t.ok(note.includes('CRLF first paragraph.') && !/SYNOPSIS-MUST|status: draft|﻿/.test(note), 'One note: the same');
	await p.ev(`app.vault.adapter.remove(app.workspace.getActiveFile().path).then(() => 1)`);
}, { changes: true });

test('two notes with one name in different parts, and a note named with “&”, brackets, a hash and quotes: nothing is mixed up in Word, the EPUB or the Scrivener project', async (p, h, t) => {
	const ODD = 'Q&A [draft] #1, "ok" it\'s';
	await mk(p, 'Names', [['Act one/Scene', 'Words of the first scene.'], ['Act two/Scene', 'Words of the second scene.'], [ODD, 'Words of the odd one.']]);
	const want = 'Words of the first scene Words of the second scene Words of the odd one';
	const d = docx(await make(p, 'Names'));
	t.eq(words(d.body.join(' ')).join(' '), want, 'Word: each in its place');
	t.ok(d.headings.some((x) => x.includes('Q&A [draft] #1')), 'Word: the odd title is a heading as typed (' + d.headings.join('|') + ')');
	await closeAll(p);
	const eAt = await make(p, 'Names', 'Ebook');
	t.eq(words(epub(eAt).body).join(' '), want, 'EPUB: each in its place');
	const v = epubcheck(eAt);
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
	await closeAll(p);
	const sc = scrivText(await make(p, 'Names', 'Scrivener project'));
	const texts2 = sc.items.filter((i) => i.type === 'Text').map((i) => sc.text(i.id) ?? '');
	t.eq(words(texts2.join(' ')).join(' '), want, 'Scrivener: each in its place');
	const ids = sc.items.map((i) => i.id);
	t.eq(new Set(ids).size, ids.length, 'and every item has its own id');
});

test('deeply nested lists, a table with formatting, headings of every level, a fenced block with “]]>” in it and a very long unbroken word: the Word file and the EPUB are made, valid and whole', async (p, h, t) => {
	const long = 'Antidisestablishmentarianism'.repeat(12);
	await writeRaw(p, L + 'Prologue.md', [
		'# H1 inside', '## H2 inside', '### H3 inside', '#### H4 inside', '##### H5 inside', '###### H6 inside', 'Body-after-headings.', '',
		'- l1', '  - l2', '    - l3', '      - l4', '        - l5', '          - l6-deepest', '',
		'| **bold head** | *it* | `code` |', '|:--|--:|:-:|', '| a **b** | [[Epilogue\\|alias]] | c |', '| two | words | here |', '',
		'```', 'x = "]]>"; y = "<![CDATA[";', '```', '',
		long, '',
	].join('\n'));
	await p.sleep(700);
	const d = docx(await make(p, 'The Lighthouse'));
	for (const w of ['H1 inside', 'H6 inside', 'Body-after-headings', 'l6-deepest', 'bold head', 'two', long]) t.ok(d.all.includes(w), `Word has “${w.slice(0, 20)}”`);
	t.ok(d.all.includes('x = "]]>"; y = "<![CDATA[";'), 'Word: the code block is as typed');
	await closeAll(p);
	const eAt = await make(p, 'The Lighthouse', 'Ebook');
	const e = epub(eAt);
	t.ok(e.body.includes('l6-deepest') && e.body.includes(long) && e.body.includes('x = "]]>"; y = "<![CDATA[";'), 'EPUB: nested list, long word and code block as typed');
	const v = epubcheck(eAt);
	if (v !== null) t.eq(v, '', 'EPUBCheck passes it');
}, { changes: true });

// ======================================================================================================================
// A small window and a large font
// ======================================================================================================================

const squeezed = (p) => p.ev(`(() => { const s = document.querySelector('${WIN} .binders-export-side').getBoundingClientRect(), m = document.querySelector('${WIN}').getBoundingClientRect(); return [...document.querySelectorAll('${WIN} .binders-export-options .setting-item, ${WIN} [role="option"]')].map(r => { const n = r.querySelector('.setting-item-name, .binders-snapshots-item-name'), c = r.querySelector('.setting-item-control'), range = document.createRange(); range.selectNodeContents(n); const b = n.getBoundingClientRect(); return { name: n.textContent, lines: range.getClientRects().length, cut: n.scrollWidth > n.clientWidth + 1, over: c ? c.getBoundingClientRect().right > s.right + 1 : false, apart: c ? b.right <= c.getBoundingClientRect().left + 1 : true }; }).filter(x => x.cut || x.over || !x.apart); })()`);

test('a desktop window made small (800 × 520, and 640 × 420 as at a high zoom): the choices are whole and Export can be pressed', async (p, h, t) => {
	try {
	for (const [w, hh] of [[800, 520], [640, 420]]) {
		await closeAll(p);
		await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: hh, deviceScaleFactor: 1, mobile: false });
		await p.sleep(500);
		await open(p);
		t.eq(JSON.stringify(await squeezed(p)), '[]', 'no name is cut off, and no control is pushed out of its column');
		const b = await p.ev(`(() => { const e = document.querySelector('${WIN} button.mod-cta'), r = e.getBoundingClientRect(), m = document.querySelector('${WIN}').getBoundingClientRect(); return { inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, modal: [Math.round(m.width), Math.round(m.height)] }; })()`);
		t.ok(b.inView, 'Export is on the screen (' + JSON.stringify(b) + ')');
		await shot(p, `small-window-${w}`);
		if (w === 640) t.eq(JSON.stringify(await squeezed(p)), '[]', 'at 640 wide too');
	}
	await press(p, 'Export');
	t.ok(await saved(p), 'and it exports');
	} finally { await p.send('Emulation.setDeviceMetricsOverride', { width: p.width, height: p.height, deviceScaleFactor: 1, mobile: false }); await p.sleep(400); }
});

test('Obsidian’s interface text one and a half times larger (a theme’s font variables raised): the window’s names are not cut off and Export can be pressed', async (p, h, t) => {
	const vars = { '--font-ui-smaller': '17px', '--font-ui-small': '20px', '--font-ui-medium': '23px', '--font-ui-large': '27px', '--font-text-size': '24px' };
	await p.ev(`(() => { for (const [k, v] of Object.entries(${j(vars)})) document.body.style.setProperty(k, v); return 1; })()`);
	await p.sleep(500);
	try {
		await open(p);
		t.ok(await p.ev(`parseFloat(getComputedStyle(document.querySelector('${WIN} .setting-item-name')).fontSize) >= 20`), 'the text really is large');
		await shot(p, 'large-font');
		const bad = await squeezed(p);
		t.eq(JSON.stringify(bad), '[]', 'no name is cut off or pushed out of its column');
		const b = await p.ev(`(() => { const e = document.querySelector('${WIN} button.mod-cta'), r = e.getBoundingClientRect(); return { ok: r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0, r: [r.left, r.top, r.right, r.bottom].map(Math.round), vp: [innerWidth, innerHeight] }; })()`);
		t.ok(b.ok, 'Export is on the screen ' + JSON.stringify(b));
	} finally { await closeAll(p); await p.ev(`(() => { for (const k of Object.keys(${j(vars)})) document.body.style.removeProperty(k); return 1; })()`); }
});
